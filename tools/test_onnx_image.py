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
img = Image.open(img_path)
img = img.resize ((256, 256))

#preprocessing image 
img_np  = np.array(img).astype(np.float32) / 255.0
img_np = np.transpose(img_np, (2, 0, 1))[None, :, :, :]

#inference 
out = sess.run(None, {input_name: img_np})[0]

#postprocessing
out = np.clip(out[0], 0, 1)
out = (out * 255).astype(np.uint8)
out = out.transpose(1, 2, 0)
output_path = root / "test_images" / "output" / "output.png"
output_path.parent.mkdir(parents=True, exist_ok=True)
Image.fromarray(out).save(output_path)
print("done")