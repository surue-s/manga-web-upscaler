import onnxruntime as ort 
import numpy as np
import time
from pathlib import Path

root = Path(__file__).resolve().parent.parent
model_path = root / "onnx" / "esrgan_model.onnx"
if not model_path.exists():
    raise FileNotFoundError(f"Model not found at: {model_path}")

sess = ort.InferenceSession(
    str(model_path),
    providers=["CPUExecutionProvider"]
)

#inspecting inputs 
input_meta = sess.get_inputs()[0]
input_name = input_meta.name
print("Input Name: ", input_name)
print("Input Shape:",input_meta.shape)

#Creating a dummy input
h, w = 256, 256
dummy_input = np.random.randn(1, 3, h, w).astype(np.float32)

#warm up run 
sess.run(None, {input_name: dummy_input})

#timed inference run
start = time.perf_counter()
output = sess.run(None, {input_name: dummy_input})
end = time.perf_counter()

#output inspection 
out = output[0]
print("Output Shape:", out.shape)
print("Output Min:", out.min())
print(f"Inference time: {(end - start) * 1000:.2f} ms")
