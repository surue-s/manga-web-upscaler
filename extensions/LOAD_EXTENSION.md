# How to Load the Extension in Chrome/Edge

## Quick Setup (3 Steps)

### 1. Open Extension Management Page

**Chrome:**
- Navigate to `chrome://extensions/`
- Or: Menu → Extensions → Manage Extensions

**Edge:**
- Navigate to `edge://extensions/`
- Or: Menu → Extensions → Manage Extensions

### 2. Enable Developer Mode

- Toggle the **"Developer mode"** switch in the top-right corner

### 3. Load the Extension

- Click **"Load unpacked"** button
- Navigate to and select this folder:
  ```
  /home/surue/Desktop/Projects/manga-web-upscaler/extensions
  ```
- Click "Select Folder"

## Verification

After loading, you should see:

✅ **Manga Web Upscaler** extension card with:
- Name: "Manga Web Upscaler"
- Version: 1.0.0
- Status: No errors

✅ **Extension icon** in the browser toolbar

## First Run

⏱️ **Important:** The first time you use the extension, it needs to:
1. Download ONNX Runtime from CDN (~2-3 MB)
2. Load the AI model (18 MB)
3. Initialize WebAssembly

**This takes 30-60 seconds on first run.** Subsequent runs are instant.

## How to Use

1. **Navigate to any webpage** with images (manga sites work great!)

2. **Click the extension icon** in the toolbar

3. **Click "Scan for Images"** 
   - Extension will detect all images on the page
   - Shows count of detected images

4. **Select Mode:**
   - 🚀 **Speed**: Faster processing (default)
   - 💎 **Quality**: Better results, slower

5. **Click "Upscale First Image"**
   - Wait for processing (first run: ~60s, subsequent: ~10-30s)
   - Image will be upscaled 4x and replaced on the page

## Troubleshooting

### "Worker failed to initialize"

**Cause:** Model not loaded yet or CSP issue

**Fix:**
1. Wait 60 seconds on first run
2. Check console (F12) for errors
3. Reload extension: `chrome://extensions/` → Reload button
4. Try again

### "No images detected"

**Cause:** Images too small or hidden

**Fix:**
- Images must be at least 100x100 pixels
- Images must be visible on the page
- Try scrolling to load images first

### Model file missing

**Verify model exists:**
```bash
ls -lh /home/surue/Desktop/Projects/manga-web-upscaler/extensions/models/
# Should show: esrgan_anime_model.onnx (18M)
```

If missing, copy from onnx directory:
```bash
cp /home/surue/Desktop/Projects/manga-web-upscaler/onnx/esrgan_anime_model.onnx.data \
   /home/surue/Desktop/Projects/manga-web-upscaler/extensions/models/esrgan_anime_model.onnx
```

### Check Logs

**Extension Console:**
1. Go to `chrome://extensions/`
2. Find "Manga Web Upscaler"
3. Click "Inspect views: service worker"
4. Check console for errors

**Page Console:**
1. On the webpage, press F12
2. Go to Console tab
3. Look for messages starting with "[Manga Upscaler]"

## Reload After Changes

If you modify code:
1. Go to `chrome://extensions/`
2. Click the reload icon on the extension card
3. Refresh any open webpages using the extension

## Uninstalling

1. Go to `chrome://extensions/`
2. Click "Remove" on the extension card

---

## Technical Details

**Model:** Real-ESRGAN Anime (18 MB)
**Runtime:** ONNX Runtime Web (via CDN)
**Execution:** WebAssembly (WASM)
**Upscale Factor:** 4x
**Processing:** Client-side (no data sent to servers)
