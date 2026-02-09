# 🚀 Quick Start Guide

## Load Extension (30 seconds)

1. **Open Chrome/Edge** and navigate to:
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`

2. **Enable Developer Mode** (top-right toggle)

3. **Click "Load unpacked"** and select:
   ```
   /home/surue/Desktop/Projects/manga-web-upscaler/extensions
   ```

4. **Verify:** Extension card shows "Manga Web Upscaler" with no errors

## First Use

⏱️ **First-time initialization: 30-60 seconds**

1. Navigate to any webpage with images
2. Click the extension icon in toolbar
3. Wait for "Model Status: Ready ✓" (initially shows "Loading...")
4. Click "Scan for Images"
5. Choose mode:
   - 🚀 **Speed** = Faster (recommended)
   - 💎 **Quality** = Better results, slower
6. Click "Upscale First Image"

## Troubleshooting

### "Worker failed to initialize"
- **Wait 60 seconds** on first run
- Reload extension: chrome://extensions/ → Reload button

### Verify Setup
```bash
cd /home/surue/Desktop/Projects/manga-web-upscaler/extensions
python3 verify_setup.py
```

All checks should pass ✓

### Check Console Logs
- **Extension Console:** chrome://extensions/ → "Inspect views: service worker"
- **Page Console:** F12 on webpage → Console tab

## What Got Fixed

✅ Model file copied to correct location (17 MB)  
✅ WebAssembly CSP configured  
✅ Worker initialization timeout handling  
✅ Better error messages  
✅ Model loading verification  

## Files You Need

All these should exist (verified by script):
```
extensions/
├── manifest.json (with CSP)
├── models/
│   └── esrgan_anime_model.onnx (17 MB) ← Critical!
├── icons/ (16, 48, 128px)
├── service-worker.js
├── popup/
│   ├── popup.html
│   ├── popup.js
│   └── style.css
├── content/
│   └── content.js
└── worker/
    └── inference-worker.js
```

---

**Everything is ready!** Load the extension and test it on any manga website 🎨
