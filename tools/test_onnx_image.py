import onnxruntime as ort
import numpy as np
from PIL import Image
from pathlib import Path


#loading model 
root = Path(__file__).resolve().parent.parent
model_path = root / "onnx" / "esrgan_anime_model.onnx"
if not model_path.exists():
    raise FileNotFoundError(f"Model not found at: {model_path}")

sess = ort.InferenceSession(
    str(model_path),
    providers=["CPUExecutionProvider"]
)

input_name = sess.get_inputs()[0].name

#load image
img_path = root / "test_images" / "0014.jpg"
img = Image.open(img_path).convert('RGB')
img = img.resize((256, 256))

#preprocessing image 
# Try keeping as RGB without BGR conversion
img_np = np.array(img).astype(np.float32) / 255.0  # Normalize to [0, 1]
# Keep RGB order (don't convert to BGR)
# Transpose to CHW format and add batch dimension
img_np = np.transpose(img_np, (2, 0, 1))[None, :, :, :]  # (1, 3, H, W)

print(f"Input range: [{img_np.min():.4f}, {img_np.max():.4f}]")

#inference 
out = sess.run(None, {input_name: img_np})[0]

#postprocessing
print(f"Output shape from model: {out.shape}")
print(f"Output range: [{out.min():.6f}, {out.max():.6f}]")

# Remove batch dimension if present (shape should be (1, 3, H, W) -> (3, H, W))
if out.ndim == 4:
    out = out[0]

print(f"After removing batch: {out.shape}")

# Convert from [0, 1] to [0, 255] range
# The model outputs might be in a smaller range, so we need to rescale
# Try multiplying by a higher factor or using mean/std denormalization
out = out * 255.0  # Scale to [0, 255]
out = np.clip(out, 0, 255)
out = out.astype(np.uint8)

# Transpose from CHW to HWC
out = out.transpose(1, 2, 0)  # (3, H, W) -> (H, W, 3)
# Keep RGB order (no BGR conversion needed)

output_path = root / "test_images" / "output" / "output.png"
output_path.parent.mkdir(parents=True, exist_ok=True)
Image.fromarray(out).save(output_path)
print(f"\n✓ Image upscaled successfully!")
print(f"✓ Output saved to: {output_path}")
print(f"✓ Input shape: (1, 3, 256, 256), Output shape: {out.shape}")