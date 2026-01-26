# Quick Test Guide - Manga Upscaler Extension

## Step 1: Reload Extension

```
1. Open Chrome and go to: chrome://extensions
2. Find "Manga Upscaler" in the list
3. Click the RELOAD button (circular arrow icon)
4. Wait for "Extension updated" notification
```

## Step 2: Open Test Website

```
1. Go to any website with images (e.g., https://example.com)
2. Or open an actual manga website
3. Press F12 to open Developer Tools
4. Go to the "Console" tab
```

## Step 3: Check Initialization

```
In the Console, you should see:
✓ [Manga Upscaler] Content script loaded
✓ [Manga Upscaler] Service worker initialized
✓ [Content Script] Creating Web Worker for inference...
✓ [Content Script] Worker is ready
✓ [Inference Worker] Loading ONNX model...
```

## Step 4: Test Image Detection

```
1. Click the Manga Upscaler icon in toolbar (top right)
2. A popup window appears with two buttons
3. Click "Detect Images" button
4. In Console, look for:
   ✓ [Manga Upscaler] Found X upscalable images
5. The button text updates to show image count
```

## Step 5: Test Upscaling

```
1. Click "Upscale Single Image" button
2. Wait 30-60 seconds (first run loads ONNX Runtime + model)
3. Watch Console for progress:
   ✓ [Manga Upscaler] Starting upscale for image...
   ✓ [Manga Upscaler] Extracted image data: WxH
   ✓ [Content Script] Sent inference request to worker
   ✓ [Inference Worker] Running inference...
   ✓ [Inference Worker] Inference complete in XXXms
   ✓ [Manga Upscaler] Image replaced: WxH → (W*4)x(H*4)
   ✓ Progress bar shows: "Complete!"
4. On the webpage, the first detected image should be noticeably larger/clearer
```

## Expected Results

### Success Scenario

- ✓ Extension loads without errors
- ✓ "Detect Images" finds images on page
- ✓ "Upscale Single Image" enlarges an image 4x
- ✓ Console shows no errors (only logs starting with "[")
- ✓ Progress bar fills and shows "Complete!"

### Common First-Run Behavior

- First inference takes 30-60 seconds (normal - WASM initialization)
- Subsequent inferences on same page take 5-15 seconds (faster)
- Large images may take longer
- Some browser slowdown during inference (normal - heavy computation)

## Debugging

### If you see errors:

**"Worker is not defined"**

- ❌ OLD ERROR - should be fixed now
- ✓ If you still see this, clear extension cache:
  1. Go to chrome://extensions
  2. Click "Remove" under Manga Upscaler
  3. Reload from extension folder

**"Failed to fetch model"**

- Check: `extension/models/esrgan_anime_model.onnx` file exists
- File size should be ~508 KB

**"No images found"**

- The current website may have no images, or
- All images are too large (>2000px)
- Try a different website

**CORS/Cross-origin error**

- This is handled by content script
- If still seeing errors, check browser console for details

**Timeout or no response**

- ONNX Runtime may still be initializing
- Wait 60+ seconds before retrying
- Reload page and try again

## Performance Tips

1. **For faster subsequent tests:**
   - Keep page open after first upscale
   - Try upscaling different images (reuses cached model)
   - Each new upscale should be ~5-15 seconds

2. **For troubleshooting:**
   - Keep Console open to watch progress
   - Check "Errors" tab for any exceptions
   - Look for logs starting with [Manga Upscaler], [Content Script], [Inference Worker]

3. **Browser considerations:**
   - Chrome/Edge: Full support (tested)
   - Safari: Requires Manifest V3 support (macOS 15.4+)
   - Firefox: Not supported (uses Manifest V2)

## Success Checklist

When extension is working correctly:

- [ ] chrome://extensions shows "Manga Upscaler" enabled
- [ ] Clicking icon opens popup window
- [ ] "Detect Images" button finds images
- [ ] "Upscale Single Image" enlarges an image
- [ ] Console shows inference logs (not errors)
- [ ] Progress bar fills to "Complete!"
- [ ] Upscaled image is visibly larger/different from original
- [ ] No red error messages in console

---

**Next Steps After Successful Test:**

1. Try different websites with images
2. Experiment with different image sizes
3. Read [EXTENSION_DOCUMENTATION.txt](./EXTENSION_DOCUMENTATION.txt) for advanced features
4. Check [QUICK_START.md](./QUICK_START.md) for overview
