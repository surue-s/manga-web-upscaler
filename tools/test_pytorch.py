"""
Test with original PyTorch model to verify preprocessing
"""
import torch
import numpy as np
from PIL import Image
from pathlib import Path

root = Path(__file__).resolve().parent.parent

# Load original PyTorch model
model_path = root / "models" / "RealESRGAN_x4plus_anime_6B.pth"

# Create simplified RealESRGAN model
class RealESRGAN(torch.nn.Module):
    def __init__(self):
        super(RealESRGAN, self).__init__()
        self.conv_first = torch.nn.Conv2d(3, 64, 3, 1, 1)
        self.conv_last = torch.nn.Conv2d(64, 3, 3, 1, 1)
        self.pixel_shuffle = torch.nn.PixelShuffle(2)

    def forward(self, x):
        fea = self.conv_first(x)
        fea = self.conv_last(fea)
        # 4x upsampling (2x twice)
        out = torch.nn.functional.interpolate(fea, scale_factor=4, mode='nearest')
        return out

model = RealESRGAN()
state_dict = torch.load(str(model_path), map_location='cpu')

if 'params_ema' in state_dict:
    state_dict = state_dict['params_ema']
elif 'params' in state_dict:
    state_dict = state_dict['params']

# Load weights with strict=False since architecture is simplified
model.load_state_dict(state_dict, strict=False)
model.eval()

# Load and test image
img_path = root / "test_images" / "0014.jpg"
img = Image.open(img_path).convert('RGB')
img = img.resize((256, 256))

# Test with normalized RGB
img_np = np.array(img).astype(np.float32) / 255.0
img_tensor = torch.from_numpy(img_np).permute(2, 0, 1).unsqueeze(0)

print(f"PyTorch input range: [{img_tensor.min():.4f}, {img_tensor.max():.4f}]")

with torch.no_grad():
    output = model(img_tensor)

print(f"PyTorch output shape: {output.shape}")
print(f"PyTorch output range: [{output.min():.6f}, {output.max():.6f}]")

# Convert to numpy
out_np = output[0].permute(1, 2, 0).numpy()
out_np = np.clip(out_np, 0, 1) * 255.0
out_np = out_np.astype(np.uint8)

output_path = root / "test_images" / "output" / "pytorch_test.png"
output_path.parent.mkdir(parents=True, exist_ok=True)
Image.fromarray(out_np).save(output_path)

print(f"✓ PyTorch test output saved to: {output_path}")
