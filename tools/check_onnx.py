import onnx 
from pathlib import Path

root = Path(__file__).resolve().parent.parent
model_path = root / "onnx" / "esrgan_anime_model.onnx"

onnx_model = onnx.load(str(model_path))
onnx.checker.check_model(onnx_model)

print(" Model check passed")