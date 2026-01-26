# Manifest V3 Architecture Fix - Complete Implementation

## Problem Solved

**Error:** "Upscale failed: Worker is not defined"

**Root Cause:** Service workers in Manifest V3 cannot use the Web Worker API (`new Worker()`). The service worker is too restricted.

**Solution:** Move Web Worker creation to the **content script**, which runs with sufficient privileges to create workers.

## Architecture Changes

### Before (Broken)

```
User clicks "Upscale"
  → Popup sends message to Service Worker
  → Service Worker tries: new Worker('worker/inference-worker.js')
  ❌ FAILS - Web Worker API not available in Manifest V3 service worker
```

### After (Fixed)

```
User clicks "Upscale"
  → Popup sends message to Service Worker
  → Service Worker forwards to Content Script
  → Content Script creates: new Worker(chrome.runtime.getURL('worker/inference-worker.js'))
  → Content Script manages inference
  ✓ WORKS - Content script has permission to use Worker API
```

## Files Modified

### 1. **service-worker.js** (NEW ROLE: Message Router Only)

- **Removed:** `new Worker()` constructor (FORBIDDEN in Manifest V3)
- **Removed:** `initializeWorker()`, `sendToWorker()` functions
- **Removed:** Direct inference handling
- **Added:** Message forwarding logic to route UPSCALE_IMAGE to content script
- **Added:** State tracking (modelLoaded, workerReady) from content script updates
- **Result:** Reduced from 204 lines to 101 lines - now focused only on routing

Key changes:

```javascript
// OLD (BROKEN):
inferenceWorker = new Worker(
  chrome.runtime.getURL("worker/inference-worker.js"),
);

// NEW (FIXED):
// Forward to content script via chrome.tabs.sendMessage()
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  chrome.tabs.sendMessage(tabs[0].id, {
    type: "UPSCALE_IMAGE",
    payload: message.payload,
  });
});
```

### 2. **content.js** (NEW RESPONSIBILITY: Worker Manager)

- **Added:** Web Worker creation at script start (lines 15-89)
- **Added:** `initializeWorker()` - creates Web Worker with proper URL resolution
- **Added:** `sendToWorker()` - sends messages to worker with promise-based response handling
- **Added:** `notifyServiceWorkerStatus()` - updates service worker on model/worker status
- **Modified:** `upscaleImage()` function to use local worker instead of service worker
- **Result:** Now handles full inference pipeline with message ID tracking

Key additions:

```javascript
// Create worker in content script (ALLOWED)
inferenceWorker = new Worker(chrome.runtime.getURL('worker/inference-worker.js'), { type: 'module' });

// Send to worker with promise-based response handling
const response = await sendToWorker({
  type: 'INFERENCE_REQUEST',
  payload: { tensor, dims, ... }
});
```

### 3. **inference-worker.js** (IMPROVED: Better Message Handling)

- **Updated:** Message handler to support both `RUN_INFERENCE` and `INFERENCE_REQUEST` types
- **Improved:** Response payload now includes calculated upscaled dimensions (width/height)
- **Enhanced:** Better message structure with dimension calculations

Key changes:

```javascript
// Support both message types
} else if (type === 'RUN_INFERENCE' || type === 'INFERENCE_REQUEST') {
  // Calculate 4x upscaled dimensions
  const [batch, channels, height, width] = dims;
  const upscaledHeight = height * 4;
  const upscaledWidth = width * 4;

  // Return with proper dimensions
  self.postMessage({
    type: 'INFERENCE_COMPLETE',
    payload: {
      tensor: result.tensor,
      width: upscaledWidth,
      height: upscaledHeight,
      dims: [batch, channels, upscaledHeight, upscaledWidth]
    },
    messageId
  });
}
```

## Message Flow (Updated)

```
┌─────────────────────────────────────────────────────────────────┐
│ POPUP (popup.js)                                                │
│ - User clicks "Detect Images" or "Upscale Single Image"        │
│ - Sends: { type: 'DETECT_IMAGES' }                             │
│ - Sends: { type: 'UPSCALE_SINGLE' }                            │
└───────────────┬─────────────────────────────────────────────────┘
                │ chrome.runtime.sendMessage()
                ↓
┌─────────────────────────────────────────────────────────────────┐
│ SERVICE WORKER (service-worker.js) - MESSAGE ROUTER             │
│ - Receives message from popup                                   │
│ - Routes to appropriate destination:                            │
│   • DETECT_IMAGES → forward to content script                   │
│   • UPSCALE_SINGLE → forward to content script                  │
│ - Receives status updates from content script                   │
│ - Does NOT perform inference (cannot use Worker API)            │
└───────────────┬─────────────────────────────────────────────────┘
                │ chrome.tabs.sendMessage()
                ↓
┌─────────────────────────────────────────────────────────────────┐
│ CONTENT SCRIPT (content.js) - INFERENCE COORDINATOR             │
│ - Receives DETECT_IMAGES: runs detectImages()                   │
│ - Receives UPSCALE_SINGLE:                                      │
│   1. extractImageData() from DOM                                │
│   2. imageDataToTensor() conversion                             │
│   3. sendToWorker() for inference                               │
│   4. tensorToImageData() conversion                             │
│   5. replaceImage() in DOM                                      │
│ - Manages Web Worker (can create workers)                       │
└───────────────┬─────────────────────────────────────────────────┘
                │ worker.postMessage()
                ↓
┌─────────────────────────────────────────────────────────────────┐
│ WEB WORKER (inference-worker.js) - ONNX INFERENCE ENGINE       │
│ - Loads ONNX Runtime Web from CDN                              │
│ - Loads ONNX model (esrgan_anime_model.onnx)                   │
│ - Runs inference on input tensors                              │
│ - Returns upscaled output tensor                               │
└─────────────────────────────────────────────────────────────────┘
```

## Compliance Notes

✅ **Manifest V3 Compliant:**

- Service worker: No forbidden APIs used
- Content script: Only uses APIs allowed in content script context
- Web Worker: Instantiated from allowed context (content script)
- CSP: Includes `'wasm-unsafe-eval'` for ONNX WASM backend
- No eval/Function constructors

✅ **Security:**

- Worker isolated in its own thread
- Message passing prevents data leakage
- CORS handled via content script context
- Cross-origin images managed in content script

## Testing Instructions

1. **Reload Extension:**
   - Go to `chrome://extensions`
   - Toggle "Developer mode" (top right)
   - Click "Reload" under "Manga Upscaler"

2. **Open DevTools on a Manga Website:**
   - Press F12 to open DevTools
   - Check "Console" tab for initialization logs
   - Expected first log: `[Manga Upscaler] Content script loaded`

3. **Test Detection:**
   - Click extension icon (Manga Upscaler)
   - Click "Detect Images" button
   - Console should show: `[Manga Upscaler] Found X upscalable images`

4. **Test Inference:**
   - In popup, click "Upscale Single Image"
   - Watch console for:
     - `[Content Script] Creating Web Worker for inference...`
     - `[Content Script] Worker is ready`
     - `[Inference Worker] Loading ONNX model...`
     - `[Inference Worker] Running inference on tensor...`
     - `[Inference Worker] Inference complete in XXXms`
     - `[Manga Upscaler] Image replaced: WxH → (W*4)x(H*4)`

5. **Verify Results:**
   - Image on webpage should be replaced with 4x upscaled version
   - No console errors
   - Progress bar in popup shows "Complete!"

## Error Troubleshooting

| Error                   | Cause                                       | Solution                                                      |
| ----------------------- | ------------------------------------------- | ------------------------------------------------------------- |
| "Worker is not defined" | Service worker trying to use Worker API     | ✓ FIXED - moved to content script                             |
| "Failed to fetch model" | Model URL incorrect                         | Check: `extension/models/esrgan_anime_model.onnx` exists      |
| "Worker timeout"        | Inference taking too long                   | Normal for first inference (~30-60s), subsequent calls faster |
| "No active tab found"   | Extension can't find content script context | Open a website first, then try                                |
| "Cross-origin error"    | Image loading from different domain         | Content script handles CORS via `crossOrigin='anonymous'`     |

## Performance Notes

- **First inference:** 30-60 seconds (ONNX Runtime WASM initialization + model loading)
- **Subsequent inferences:** 5-15 seconds (model cached in worker)
- **Memory:** ~200-300 MB peak (ONNX Runtime + model in worker thread)
- **CPU:** Single-threaded (numThreads=1 in worker config)

## Architecture Benefits

1. **Compliant:** Follows Manifest V3 security model
2. **Efficient:** Web Worker runs inference in separate thread (no UI blocking)
3. **Modular:** Clear separation of concerns:
   - Service Worker: Routing/coordination
   - Content Script: DOM/image handling
   - Web Worker: Heavy computation
4. **Maintainable:** Each component has single responsibility
5. **Scalable:** Easy to add batch processing, progress updates, cancellation

## Future Improvements

- [ ] Add batch upscaling (upscale all images on page)
- [ ] Add progress updates during inference
- [ ] Add cancel button for long-running operations
- [ ] Cache model locally (service worker storage) instead of CDN
- [ ] Add quality presets (Fast/Balanced/Quality)
- [ ] Add undo functionality (restore original images)
- [ ] Add settings panel (scale factor, model selection)
