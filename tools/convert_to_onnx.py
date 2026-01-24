import torch
import torch.nn as nn
import torch.nn.functional as F
from pathlib import Path

root = Path(__file__).resolve().parent.parent

# Full RealESRGAN architecture
class RRDB(nn.Module):
    def __init__(self, num_feat=64, num_grow_ch=32):
        super(RRDB, self).__init__()
        self.rdb1 = self.ResidualDenseBlock(num_feat, num_grow_ch)
        self.rdb2 = self.ResidualDenseBlock(num_feat, num_grow_ch)
        self.rdb3 = self.ResidualDenseBlock(num_feat, num_grow_ch)

    class ResidualDenseBlock(nn.Module):
        def __init__(self, num_feat=64, num_grow_ch=32):
            super().__init__()
            self.conv1 = nn.Conv2d(num_feat, num_grow_ch, 3, 1, 1)
            self.conv2 = nn.Conv2d(num_feat + num_grow_ch, num_grow_ch, 3, 1, 1)
            self.conv3 = nn.Conv2d(num_feat + 2*num_grow_ch, num_grow_ch, 3, 1, 1)
            self.conv4 = nn.Conv2d(num_feat + 3*num_grow_ch, num_grow_ch, 3, 1, 1)
            self.conv5 = nn.Conv2d(num_feat + 4*num_grow_ch, num_feat, 3, 1, 1)

        def forward(self, x):
            x1 = F.leaky_relu(self.conv1(x), 0.2)
            x2 = F.leaky_relu(self.conv2(torch.cat((x, x1), 1)), 0.2)
            x3 = F.leaky_relu(self.conv3(torch.cat((x, x1, x2), 1)), 0.2)
            x4 = F.leaky_relu(self.conv4(torch.cat((x, x1, x2, x3), 1)), 0.2)
            x5 = self.conv5(torch.cat((x, x1, x2, x3, x4), 1))
            return x5 * 0.2 + x

    def forward(self, x):
        out = self.rdb1(x)
        out = self.rdb2(out)
        out = self.rdb3(out)
        return out * 0.2 + x


class RealESRGAN(nn.Module):
    def __init__(self, num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=4):
        super(RealESRGAN, self).__init__()
        self.scale = scale

        # Initial convolution
        self.conv_first = nn.Conv2d(num_in_ch, num_feat, 3, 1, 1)

        # RRDB blocks
        self.body = nn.Sequential(*[RRDB(num_feat, num_grow_ch) for _ in range(num_block)])

        # Second convolution
        self.conv_body = nn.Conv2d(num_feat, num_feat, 3, 1, 1)

        # Upsampling layers
        self.conv_up1 = nn.Conv2d(num_feat, num_feat, 3, 1, 1)
        self.conv_up2 = nn.Conv2d(num_feat, num_feat, 3, 1, 1)
        self.pixel_shuffle = nn.PixelShuffle(2)

        # HR convolution
        self.conv_hr = nn.Conv2d(num_feat, num_feat, 3, 1, 1)
        self.conv_last = nn.Conv2d(num_feat, num_out_ch, 3, 1, 1)
        
        self.lrelu = nn.LeakyReLU(negative_slope=0.2)

    def forward(self, x):
        fea = self.conv_first(x)
        body = self.body(fea)
        fea = self.conv_body(body) + fea

        # Upsampling
        fea = self.conv_up1(F.interpolate(fea, scale_factor=2, mode='nearest'))
        fea = self.lrelu(fea)
        fea = self.conv_up2(F.interpolate(fea, scale_factor=2, mode='nearest'))
        fea = self.lrelu(fea)

        # HR
        out = self.conv_hr(fea)
        out = self.lrelu(out)
        out = self.conv_last(out)

        return out


# Load the RealESRGAN anime model
model_path = root / "models" / "RealESRGAN_x4plus_anime_6B.pth"

if not model_path.exists():
    raise FileNotFoundError(f"Model not found at: {model_path}")

print(f"Loading model from: {model_path}")
model = RealESRGAN(num_block=6, num_grow_ch=32)  # Anime version has fewer blocks
model_state = torch.load(str(model_path), map_location='cpu')

# Handle both direct state_dict and wrapped state_dict
if 'params_ema' in model_state:
    model_state = model_state['params_ema']
elif 'params' in model_state:
    model_state = model_state['params']

try:
    model.load_state_dict(model_state, strict=True)
    print("✓ Model weights loaded successfully")
except RuntimeError as e:
    print(f"Warning: Strict loading failed: {e}")
    print("Attempting flexible load...")
    model.load_state_dict(model_state, strict=False)

model.eval()

# Dummy input for the model
dummy_input = torch.randn(1, 3, 256, 256).to(torch.float32)

# Create output directory
output_dir = root / "onnx"
output_dir.mkdir(exist_ok=True)

# Export the model to ONNX format
onnx_file_path = output_dir / "esrgan_anime_model.onnx"

print(f"\nExporting to ONNX...")
torch.onnx.export(
    model, 
    dummy_input, 
    str(onnx_file_path), 
    export_params=True, 
    opset_version=18, 
    do_constant_folding=True, 
    input_names=['input'], 
    output_names=['output'], 
    dynamic_axes={
        'input': {0: 'batch', 2: 'height', 3: 'width'}, 
        'output': {0: 'batch', 2: 'height', 3: 'width'}
    }
)

print(f"✓ Model loaded from: {model_path}")
print(f"✓ Model exported to: {onnx_file_path}")
print(f"✓ ONNX model size: {onnx_file_path.stat().st_size / (1024*1024):.2f} MB")
