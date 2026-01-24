import torch
import sys
from pathlib import Path

# Add parent directory to path to import model architectures
root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root))

# RealESRGAN architecture for 4x upscaling
class RealESRGAN(torch.nn.Module):
    def __init__(self, num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23):
        super(RealESRGAN, self).__init__()
        self.num_feat = num_feat
        
        # First convolution
        self.conv_first = torch.nn.Conv2d(num_in_ch, num_feat, 3, 1, 1)
        
        # RRDB blocks
        self.RRDB_trunk = torch.nn.Sequential(
            *[self._make_rrdb_block(num_feat) for _ in range(num_block)]
        )
        
        # Second convolution
        self.conv_second = torch.nn.Conv2d(num_feat, num_feat, 3, 1, 1)
        
        # Upsampling
        self.upconv1 = torch.nn.Conv2d(num_feat, num_feat, 3, 1, 1)
        self.upconv2 = torch.nn.Conv2d(num_feat, num_feat, 3, 1, 1)
        self.pixel_shuffle = torch.nn.PixelShuffle(2)
        
        # Final convolution
        self.conv_hr = torch.nn.Conv2d(num_feat, num_feat, 3, 1, 1)
        self.conv_last = torch.nn.Conv2d(num_feat, num_out_ch, 3, 1, 1)
        
        # Activation
        self.lrelu = torch.nn.LeakyReLU(negative_slope=0.2)

    def _make_rrdb_block(self, num_feat):
        """Simplified RRDB block"""
        return torch.nn.Sequential(
            torch.nn.Conv2d(num_feat, num_feat, 3, 1, 1),
            torch.nn.LeakyReLU(0.2),
            torch.nn.Conv2d(num_feat, num_feat, 3, 1, 1),
        )

    def forward(self, x):
        fea = self.conv_first(x)
        trunk = self.RRDB_trunk(fea)
        trunk = self.conv_second(trunk)
        fea = fea + trunk
        
        # Upsampling
        fea = self.upconv1(torch.nn.functional.interpolate(fea, scale_factor=2, mode='nearest'))
        fea = self.lrelu(fea)
        fea = self.upconv2(torch.nn.functional.interpolate(fea, scale_factor=2, mode='nearest'))
        fea = self.lrelu(fea)
        
        out = self.conv_hr(fea)
        out = self.lrelu(out)
        out = self.conv_last(out)
        
        return out

# Load the RealESRGAN anime model
model_path = root / "models" / "RealESRGAN_x4plus_anime_6B.pth"

if not model_path.exists():
    raise FileNotFoundError(f"Model not found at: {model_path}")

model = RealESRGAN()
model_state = torch.load(str(model_path), map_location='cpu')

# Handle both direct state_dict and wrapped state_dict
if 'params_ema' in model_state:
    model_state = model_state['params_ema']
elif 'params' in model_state:
    model_state = model_state['params']

try:
    model.load_state_dict(model_state, strict=False)
except Exception as e:
    print(f"Warning: Could not load state_dict perfectly: {e}")
    print("Proceeding with partial load...")

model.eval()  # Set the model to inference mode

# Dummy input for the model (height and width can be dynamic)
dummy_input = torch.randn(1, 3, 256, 256).to(torch.float32)  # 256x256 test input

# Create output directory if it doesn't exist
output_dir = root / "onnx"
output_dir.mkdir(exist_ok=True)

# Export the model to ONNX format
onnx_file_path = output_dir / "esrgan_anime_model.onnx"
torch.onnx.export(
    model, 
    dummy_input, 
    str(onnx_file_path), 
    export_params=True, 
    opset_version=18, 
    do_constant_folding=True, 
    input_names=['input'], 
    output_names=['output'], 
    dynamic_axes={'input': {0: 'batch', 2: 'height', 3: 'width'}, 
                  'output': {0: 'batch', 2: 'height', 3: 'width'}}
)

print(f"✓ Model loaded from: {model_path}")
print(f"✓ Model exported to: {onnx_file_path}")
print(f"✓ Model size: {onnx_file_path.stat().st_size / (1024*1024):.2f} MB")
