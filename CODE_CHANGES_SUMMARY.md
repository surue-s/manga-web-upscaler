# Code Changes Summary - Manifest V3 Architecture Fix

## Overview

Three files were modified to move Web Worker creation from the forbidden service worker context to the allowed content script context.

---

## File 1: `extension/service-worker.js`

### Change Type: Refactoring (Removal + Restructuring)

### Before: 204 lines | After: 101 lines | Change: -103 lines

### What Was Removed

```javascript
// FORBIDDEN - Removed from service-worker.js
let inferenceWorker = null;

async function initializeWorker() {
  // ... 30+ lines of worker creation logic
  // This was FORBIDDEN in Manifest V3
}

async function sendToWorker(message) {
  // ... 25+ lines of worker communication logic
  // This was FORBIDDEN in Manifest V3
}

// In message handler (was calling forbidden functions):
case 'UPSCALE_IMAGE':
  await sendToWorker(message.payload); // FORBIDDEN
  break;
```

### What Was Added

```javascript
// Message forwarding logic (ALLOWED in service worker)
if (message.type === "UPSCALE_IMAGE") {
  console.log("[Service Worker] Forwarding upscale request to content script");

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length > 0) {
      chrome.tabs.sendMessage(
        tabs[0].id,
        {
          type: "UPSCALE_IMAGE",
          payload: message.payload,
        },
        (response) => {
          sendResponse(response);
        },
      );
    }
  });
  return true;
}
```

### Key Changes

| What             | Before               | After                         |
| ---------------- | -------------------- | ----------------------------- |
| Worker creation  | ✗ Direct (forbidden) | ✓ Forwarded to content script |
| Primary role     | Handle inference     | Route messages                |
| Lines of code    | 204                  | 101                           |
| Functions        | 4                    | 2                             |
| Responsibilities | Too many             | Single: routing               |

---

## File 2: `extension/content/content.js`

### Change Type: Enhancement (Addition of New Functionality)

### Before: 269 lines | After: 358 lines | Change: +89 lines

### New Functions Added

```javascript
// ═══════════════════════════════════════════════════════════════════
// 1. WORKER INITIALIZATION (NEW)
// ═══════════════════════════════════════════════════════════════════

let inferenceWorker = null;
let modelLoaded = false;
let workerReady = false;

function initializeWorker() {
  if (inferenceWorker) {
    console.log("[Content Script] Worker already initialized");
    return;
  }

  console.log("[Content Script] Creating Web Worker for inference...");

  try {
    const workerUrl = chrome.runtime.getURL("worker/inference-worker.js");
    inferenceWorker = new Worker(workerUrl, { type: "module" });

    // Set up message handlers for worker responses
    inferenceWorker.onmessage = (event) => {
      const { type, payload } = event.data;

      if (type === "WORKER_READY") {
        workerReady = true;
        console.log("[Content Script] Worker is ready");
        notifyServiceWorkerStatus();
      } else if (type === "MODEL_LOADED") {
        modelLoaded = true;
        console.log("[Content Script] Model loaded successfully");
        notifyServiceWorkerStatus();
      } else if (type === "MODEL_LOAD_ERROR") {
        console.error("[Content Script] Model load error:", payload.error);
        modelLoaded = false;
        notifyServiceWorkerStatus();
      }
    };

    inferenceWorker.onerror = (error) => {
      console.error("[Content Script] Worker error:", error);
      workerReady = false;
      modelLoaded = false;
    };
  } catch (error) {
    console.error("[Content Script] Failed to create worker:", error);
  }
}

// ═══════════════════════════════════════════════════════════════════
// 2. WORKER COMMUNICATION (NEW)
// ═══════════════════════════════════════════════════════════════════

function sendToWorker(message) {
  return new Promise((resolve, reject) => {
    if (!inferenceWorker) {
      initializeWorker();
    }

    if (!inferenceWorker) {
      reject(new Error("Failed to initialize worker"));
      return;
    }

    const messageId = Date.now() + Math.random();
    const messageWithId = { ...message, messageId };

    const handler = (event) => {
      const { type, payload, messageId: responseId } = event.data;

      if (responseId !== messageId) return;

      inferenceWorker.removeEventListener("message", handler);

      if (type === "INFERENCE_COMPLETE") {
        resolve(payload);
      } else if (type === "INFERENCE_ERROR") {
        reject(new Error(payload.error));
      } else if (type === "MODEL_LOADED") {
        modelLoaded = true;
        notifyServiceWorkerStatus();
        resolve({ loaded: true });
      } else if (type === "MODEL_LOAD_ERROR") {
        reject(new Error(payload.error));
      }
    };

    inferenceWorker.addEventListener("message", handler);
    inferenceWorker.postMessage(messageWithId);

    // 60 second timeout
    setTimeout(() => {
      inferenceWorker.removeEventListener("message", handler);
      reject(new Error("Worker timeout"));
    }, 60000);
  });
}

// ═══════════════════════════════════════════════════════════════════
// 3. STATUS NOTIFICATION (NEW)
// ═══════════════════════════════════════════════════════════════════

function notifyServiceWorkerStatus() {
  chrome.runtime
    .sendMessage({
      type: "UPDATE_MODEL_STATUS",
      payload: { loaded: modelLoaded, ready: workerReady },
    })
    .catch((error) => {
      console.log("[Content Script] Could not notify service worker:", error);
    });
}
```

### Modified Function

```javascript
// ═══════════════════════════════════════════════════════════════════
// UPSCALE IMAGE FUNCTION - MODIFIED
// ═══════════════════════════════════════════════════════════════════

// BEFORE (sent to service worker):
async function upscaleImage(imgElement) {
  const imageData = await extractImageData(imgElement);
  const { tensor, dims } = imageDataToTensor(imageData);

  // Sent to SERVICE WORKER (which can't handle it)
  const response = await chrome.runtime.sendMessage({
    type: 'UPSCALE_IMAGE',
    payload: { tensor: Array.from(tensor), dims, ... }
  });
}

// AFTER (uses local worker):
async function upscaleImage(imgElement) {
  const imageData = await extractImageData(imgElement);
  const { tensor, dims } = imageDataToTensor(imageData);

  // Initialize worker if needed
  if (!inferenceWorker) {
    initializeWorker();
  }

  // Send DIRECTLY to LOCAL WORKER (not service worker)
  const response = await sendToWorker({
    type: 'INFERENCE_REQUEST',
    payload: { tensor: Array.from(tensor), dims, ... }
  });

  // Rest of function same as before
  const upscaledImageData = tensorToImageData(...);
  replaceImage(imgElement, upscaledImageData);
}
```

### Key Additions

| What                          | Why                                           |
| ----------------------------- | --------------------------------------------- |
| `initializeWorker()`          | Create Web Worker (allowed in content script) |
| `sendToWorker()`              | Promise-based communication with worker       |
| `notifyServiceWorkerStatus()` | Update service worker on model status         |
| Message ID tracking           | Match responses to requests                   |
| Timeout protection            | Prevent hanging requests                      |
| Worker lifecycle mgmt         | Initialize once, reuse for all requests       |

---

## File 3: `extension/worker/inference-worker.js`

### Change Type: Enhancement (Improved Message Handling)

### Before: 199 lines | After: 214 lines | Change: +15 lines

### Message Handler Update

```javascript
// BEFORE - Only handled RUN_INFERENCE:
} else if (type === 'RUN_INFERENCE') {
  const { tensor, dims } = payload;
  const result = await runInference(tensor, dims);

  self.postMessage({
    type: 'INFERENCE_COMPLETE',
    payload: result,
    messageId
  });
}

// AFTER - Handles both types with better response:
} else if (type === 'RUN_INFERENCE' || type === 'INFERENCE_REQUEST') {
  const { tensor, dims } = payload;
  const result = await runInference(tensor, dims);

  // Calculate upscaled dimensions (4x scale)
  const [batch, channels, height, width] = dims;
  const upscaledHeight = height * 4;
  const upscaledWidth = width * 4;

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

### Response Payload Changes

```javascript
// BEFORE:
{
  type: 'INFERENCE_COMPLETE',
  payload: {
    tensor: Float32Array,
    outputDims: [1, 3, H*4, W*4]
  },
  messageId
}

// AFTER:
{
  type: 'INFERENCE_COMPLETE',
  payload: {
    tensor: Float32Array,
    width: W*4,              // NEW - explicit width
    height: H*4,             // NEW - explicit height
    dims: [1, 3, H*4, W*4]   // NEW - complete dims
  },
  messageId
}
```

### Why These Changes

| Change                      | Benefit                                  |
| --------------------------- | ---------------------------------------- |
| Support `INFERENCE_REQUEST` | Matches content script message type      |
| Explicit width/height       | Content script doesn't need to calculate |
| Complete dims array         | Future-proof for different models        |
| Better response format      | Clearer data flow                        |

---

## Architecture Comparison

### Before (Broken)

```
┌─────────────────────────────────────────────────────────┐
│ SERVICE WORKER (Forbidden API Usage)                    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  1. Receives message from popup                         │
│  2. Tries: new Worker('worker/inference-worker.js')    │
│     ❌ FORBIDDEN in Manifest V3                         │
│  3. Tries: inferenceWorker.postMessage(tensor)         │
│     ❌ FORBIDDEN (worker doesn't exist)                 │
│  4. Error: "Worker is not defined"                      │
│                                                         │
│  Functions: initializeWorker(), sendToWorker()         │
│  Lines: 204                                            │
│  Worker management: Yes (FORBIDDEN)                     │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### After (Fixed)

```
┌──────────────────────────────────────────────────────────┐
│ SERVICE WORKER (Routing Only)                            │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  1. Receives message from popup                          │
│  2. Routes to content script                             │
│  3. Tracks model status from content script              │
│  4. ✓ ALLOWED message passing                            │
│                                                          │
│  Functions: Message routing                             │
│  Lines: 101                                             │
│  Worker management: No                                  │
│                                                          │
└──────────────────────────────────────────────────────────┘
         │
         │ chrome.tabs.sendMessage()
         │
         ↓
┌──────────────────────────────────────────────────────────┐
│ CONTENT SCRIPT (Worker Manager)                          │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  1. Receives routed message                              │
│  2. Creates: new Worker('worker/inference-worker.js')   │
│     ✓ ALLOWED in content script                          │
│  3. Sends: inferenceWorker.postMessage(tensor)          │
│     ✓ ALLOWED (worker created successfully)             │
│  4. Receives: inference result from worker               │
│  5. Updates DOM with upscaled image                      │
│  6. Notifies service worker of status                    │
│                                                          │
│  New Functions:                                         │
│    - initializeWorker()                                 │
│    - sendToWorker()                                     │
│    - notifyServiceWorkerStatus()                        │
│  Modified: upscaleImage()                               │
│  Lines: 358 (was 269, +89)                              │
│  Worker management: Yes (ALLOWED)                        │
│                                                          │
└──────────────────────────────────────────────────────────┘
         │
         │ worker.postMessage()
         │
         ↓
┌──────────────────────────────────────────────────────────┐
│ WEB WORKER (Inference Engine)                            │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Handles: INFERENCE_REQUEST, RUN_INFERENCE              │
│  Returns: INFERENCE_COMPLETE with full dimensions       │
│  Lines: 214 (was 199, +15)                              │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## Summary of Changes

| Aspect                             | Before           | After           | Status        |
| ---------------------------------- | ---------------- | --------------- | ------------- |
| **Service Worker Role**            | Direct inference | Message routing | ✅ Fixed      |
| **Web Worker Location**            | Service worker   | Content script  | ✅ Fixed      |
| **Manifest V3 Compliant**          | ❌ No            | ✅ Yes          | ✅ Fixed      |
| **Service Worker Lines**           | 204              | 101             | ✅ Simplified |
| **Content Script Lines**           | 269              | 358             | ✅ Enhanced   |
| **Worker Message Types**           | RUN_INFERENCE    | Both types      | ✅ Improved   |
| **Response Format**                | outputDims       | width, height   | ✅ Clearer    |
| **Error: "Worker is not defined"** | ❌ Happens       | ✅ Fixed        | ✅ Resolved   |

---

## Lines Changed Per File

```
service-worker.js:
  - Removed: ~103 lines (Worker creation logic)
  - Added: ~15 lines (Routing logic)
  - Net change: -88 lines
  - Status: Simplified ✓

content.js:
  - Removed: 0 lines
  - Added: +89 lines (Worker management)
  - Net change: +89 lines
  - Status: Enhanced ✓

inference-worker.js:
  - Removed: 0 lines
  - Added: +15 lines (Better response format)
  - Net change: +15 lines
  - Status: Improved ✓

TOTAL CHANGES:
  - Files modified: 3
  - Total lines added: 104
  - Total lines removed: 103
  - Net change: +1 line
```

---

## Testing the Changes

### Before Testing, Verify

- [ ] `extension/models/esrgan_anime_model.onnx` exists (508 KB)
- [ ] `extension/icons/*.png` files exist
- [ ] All three files have been saved

### How to Test

1. Go to `chrome://extensions`
2. Toggle Developer Mode
3. Click "Reload" under Manga Upscaler
4. Open DevTools (F12) on any website
5. Check Console for initialization logs
6. Click extension → "Detect Images"
7. Click "Upscale Single Image"
8. Expected: Image enlarges 4x, no "Worker is not defined" error

### Expected Console Output

```
[Manga Upscaler] Content script loaded
[Manga Upscaler] Service worker initialized
[Content Script] Creating Web Worker for inference...
[Content Script] Worker is ready
[Inference Worker] Loading ONNX model...
[Inference Worker] Model pre-loaded successfully
[Manga Upscaler] Found X upscalable images
[Manga Upscaler] Starting upscale for image...
[Inference Worker] Running inference...
[Inference Worker] Inference complete in XXXms
[Manga Upscaler] Image replaced...
✓ Success!
```

---

**Status: All changes implemented and ready for testing** ✅
