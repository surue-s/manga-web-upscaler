# Manga Web Upscaler

A browser-based image upscaling pipeline that converts an ESRGAN PyTorch model into a browser-executable ONNX graph and integrates it into a Manifest V3 browser extension for efficient, client-side manga image enhancement.

## Project Overview

This project aims to:

- Convert ESRGAN PyTorch model to ONNX format for browser compatibility
- Optimize the model via INT8 quantization for smaller distribution size
- Create a Manifest V3 browser extension that detects and upscales manga images
- Execute all inference inside Web Workers to avoid UI blocking
- Support dynamic image dimensions via tiling strategy
- Maintain sub-500ms latency per 512×512 tile on CPU/WASM baseline

## Key Features

- ✅ **Client-Side Processing**: No server required, full privacy protection
- ✅ **Offline Capable**: Works without internet connection once installed
- ✅ **Non-Blocking**: Uses Web Workers to keep UI responsive
- ✅ **Dynamic Tiling**: Supports any image size via intelligent tile-based processing
- ✅ **Optimized**: INT8 quantization reduces model size by ~25%
- ✅ **Modern Standard**: Uses Manifest V3 for compatibility with latest browsers

## Technology Stack

- **Model**: ESRGAN (Enhanced Super-Resolution Generative Adversarial Network)
- **Model Format**: ONNX (Open Neural Network Exchange)
- **Browser Runtime**: ONNX Runtime Web (WebAssembly + WebGPU support)
- **Extension Standard**: Manifest V3
- **Execution Context**: Web Workers (async, non-blocking)

## Project Structure

```
manga-web-upscaler/
├── models/
│   ├── realesr-general-x4v3.pth      (Original PyTorch model)
│   ├── esrgan_model.onnx             (Converted ONNX model)
│   ├── esrgan_model_quantized.onnx   (Quantized model - coming soon)
│   └── convert_to_onnx.py            (Conversion script)
├── extension/                         (Browser extension - coming soon)
│   ├── manifest.json
│   ├── service-worker.js
│   ├── content-script.js
│   ├── worker.js
│   └── popup.html
├── src/                              (Utilities and helpers - coming soon)
├── IMPLEMENTATION_LOG.txt            (Detailed implementation documentation)
├── .gitignore
└── README.md (this file)
```

## Getting Started

### Prerequisites

- Python 3.9+
- Virtual environment (venv)
- Node.js 16+ (for browser extension testing)
- Chrome/Firefox with extension support

### Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd manga-web-upscaler
```

2. Set up Python virtual environment:

```bash
python -m venv venv
# On Windows:
.\venv\Scripts\Activate.ps1
# On Linux/Mac:
source venv/bin/activate
```

3. Install dependencies:

```bash
pip install -r requirements.txt
```

4. Convert model (if needed):

```bash
python models/convert_to_onnx.py
```

## Implementation Steps

### Completed ✅

- [x] Step 1: PyTorch to ONNX Conversion
- [x] Step 2: ONNX Export with Dynamic Axes

### In Progress 🔄

- [ ] Step 3: ONNX Graph Validation
- [ ] Step 4: INT8 Quantization
- [ ] Step 5: Browser Runtime Compatibility Testing

### Planned 📋

- [ ] Step 6: Performance Benchmarking
- [ ] Step 7: Extension Manifest Setup
- [ ] Step 8: Image Detection Pipeline
- [ ] Step 9: Web Worker Inference Engine
- [ ] Step 10: Single Image Upscale Path
- [ ] Step 11: Batch Processing & Tiling
- [ ] Step 12: Full Integration & Testing

## Model Information

**ESRGAN (Enhanced Super-Resolution GAN)**

- Purpose: Upscale low-resolution images to 4x resolution (2x width, 2x height)
- Input: RGB image of any size
- Output: Upscaled RGB image (4x dimensions)
- Model: realesr-general-x4v3 (RealESRGAN)

**File**: `models/esrgan_model.onnx`

- Format: ONNX (opset 18, browser compatible)
- Size: ~67 MB (will be ~50 MB after quantization)
- Dynamic Axes: Height and width can vary
- Inference Mode: Optimized, no training overhead

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│             Manga Website (Web Page)                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  <img> Low-Res    ← Content Script Detects           │  │
│  │        Manga Images                                  │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────┬─────────────────────────────────────────┘
                     │ postMessage (image pixel data)
                     ▼
        ┌────────────────────────────┐
        │   Web Worker Thread        │
        │  ┌──────────────────────┐  │
        │  │ ONNX Runtime Web     │  │
        │  │ (WASM)               │  │
        │  └──────────────────────┘  │
        │  ┌──────────────────────┐  │
        │  │ esrgan_model.onnx    │  │
        │  │ (AI Inference)       │  │
        │  └──────────────────────┘  │
        └────────────────────────────┘
                     │ postMessage (upscaled pixels)
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  Content Script Updates DOM                                 │
│  <img src="data:image/png;base64,...">  ← Upscaled         │
│                                                             │
│  Main Thread Always Responsive ✅                          │
└─────────────────────────────────────────────────────────────┘
```

## Performance Targets

- **Inference Latency**: < 500ms per 512×512 tile (CPU/WASM baseline)
- **Model Size**: < 50 MB (after quantization, for extension distribution)
- **Memory Usage**: < 200 MB WASM heap during batch processing
- **UI Responsiveness**: 0ms blocking time (all processing in Web Worker)

## Key Design Decisions

1. **ONNX Format**: Universal, widely supported, browser-compatible
2. **Opset 18**: Modern operators, good browser support balance
3. **Dynamic Axes**: Critical for flexible tiling strategy
4. **Web Workers**: Keeps main thread responsive, prevents UI freezing
5. **INT8 Quantization**: Reduces size ~25% with minimal quality loss for line art
6. **Manifest V3**: Modern standard, better security, future-proof

## Testing Strategy

- [ ] Unit tests for model conversion
- [ ] Numerical equivalence tests (PyTorch vs ONNX outputs)
- [ ] Browser compatibility tests (Chrome, Firefox, Edge)
- [ ] Performance benchmarking (various image sizes)
- [ ] Integration tests (end-to-end upscaling)
- [ ] Regression tests (multiple manga websites)

## Known Limitations & Future Work

**Current**:

- Single model for all image types
- Linear processing (single tile at a time)
- No adaptive quality settings

**Future Enhancements**:

- Multiple models for different content types
- Parallel tile processing
- Adaptive quality based on network speed
- GPU acceleration via WebGPU
- Settings UI for user customization
- Caching of upscaled images

## Documentation

- **IMPLEMENTATION_LOG.txt**: Detailed step-by-step implementation documentation with explanations for beginners
- **models/convert_to_onnx.py**: Conversion script with inline comments
- This README.md file

## License

[Specify your license here]

## Contributing

[Contribution guidelines - to be added]

## Resources

- [ONNX Documentation](https://onnx.ai/)
- [ONNX Runtime Web](https://github.com/microsoft/onnxruntime/tree/main/js/web)
- [RealESRGAN](https://github.com/xinntao/Real-ESRGAN)
- [Manifest V3 Guide](https://developer.chrome.com/docs/extensions/mv3/)
- [Web Workers API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API)

## Troubleshooting

For common issues and solutions, refer to **IMPLEMENTATION_LOG.txt** Section 11.

## Status

**Current Phase**: Model Conversion & Validation
**Progress**: ~30% of total implementation
**Last Updated**: January 23, 2026
