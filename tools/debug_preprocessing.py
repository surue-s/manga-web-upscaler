"""
Debug script to check what preprocessing the PyTorch model expects
"""
import torch
import numpy as np
from PIL import Image
from pathlib import Path

root = Path(__file__).resolve().parent.parent

# Load original PyTorch model
model_path = root / "models" / "RealESRGAN_x4plus_anime_6B.pth"
print(f"Loading model from: {model_path}")

state_dict = torch.load(str(model_path), map_location='cpu')

# Check what's in the state dict
print(f"\nState dict keys/structure:")
if isinstance(state_dict, dict):
    if 'params_ema' in state_dict:
        print("  Found 'params_ema' key - using that")
        state_dict = state_dict['params_ema']
    elif 'params' in state_dict:
        print("  Found 'params' key - using that")
        state_dict = state_dict['params']

# Print a few weight ranges to understand normalization
for key in list(state_dict.keys())[:3]:
    weights = state_dict[key]
    if isinstance(weights, torch.Tensor):
        print(f"\n{key}:")
        print(f"  Shape: {weights.shape}")
        print(f"  Min: {weights.min():.6f}, Max: {weights.max():.6f}")
        print(f"  Mean: {weights.mean():.6f}, Std: {weights.std():.6f}")

# Load and test with image
img_path = root / "test_images" / "0014.jpg"
img = Image.open(img_path).convert('RGB')
print(f"\nOriginal image size: {img.size}")

# Test different input formats
img_np = np.array(img).astype(np.float32)
print(f"\nImage pixel range (uint8 to float32): [{img_np.min():.1f}, {img_np.max():.1f}]")

# Test 1: Normalized [0, 1] RGB
test1 = img_np / 255.0
print(f"Test 1 (normalized RGB): [{test1.min():.4f}, {test1.max():.4f}]")

# Test 2: Normalized [0, 1] BGR
test2 = img_np[:, :, ::-1] / 255.0
print(f"Test 2 (normalized BGR): [{test2.min():.4f}, {test2.max():.4f}]")

# Test 3: Raw [0, 255] RGB
print(f"Test 3 (raw RGB): [{img_np.min():.1f}, {img_np.max():.1f}]")

# Test 4: Raw [0, 255] BGR
test4 = img_np[:, :, ::-1]
print(f"Test 4 (raw BGR): [{test4.min():.1f}, {test4.max():.1f}]")
