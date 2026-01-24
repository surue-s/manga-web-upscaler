import torch
import torchvision.models as models
class ESRGAN(torch.nn.Module):
    def __init__(self):
        super(ESRGAN, self).__init__()
        # Define your model layers here

    def forward(self, x):
        # Define the forward pass
        return x

# Load the ESRGAN model
model = ESRGAN()  # Instantiate the model

# Load the ESRGAN model
model = ESRGAN()  # Instantiate the model
model.eval()  # Set the model to inference mode

# Dummy input for the model (height and width can be dynamic)
dummy_input = torch.randn(1, 3, 512, 512)  # Batch size of 1, 3 channels, 512x512 image

# Export the model to ONNX format
onnx_file_path = "onnx\esrgan_model.onnx"
torch.onnx.export(model, 
                  dummy_input, 
                  onnx_file_path, 
                  export_params=True, 
                  opset_version=18, 
                  do_constant_folding=True, 
                  input_names=['input'], 
                  output_names=['output'], 
                  dynamic_axes={'input': {2: 'height', 3: 'width'}, 'output': {2: 'height', 3: 'width'}})

print(f"Model exported to {onnx_file_path}")

print(f"Model exported to {onnx_file_path}")