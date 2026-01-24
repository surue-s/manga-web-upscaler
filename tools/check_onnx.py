import onnx 
onnx_model = onnx.load("onnx\esrgan_model.onnx")
onnx.checker.check_model(onnx_model)

print("Model checkaa aa BALLAL")