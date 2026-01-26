# Fix Summary: Manifest V3 Web Worker Architecture

## The Problem You Encountered

```
Error: "Upscale failed: Worker is not defined"
```

This error happened because the **service worker was trying to create a Web Worker**, but Manifest V3 service workers have restricted API access and **cannot use the Web Worker constructor**.

## What Was Changed

### The Three-Part Fix

#### 1. Service Worker Refactoring

**File:** `extension/service-worker.js`

**What was wrong:**

```javascript
// FORBIDDEN in Manifest V3:
inferenceWorker = new Worker(
  chrome.runtime.getURL("worker/inference-worker.js"),
);
```

**How it was fixed:**

- Removed the `new Worker()` constructor (forbidden)
- Removed `initializeWorker()` and `sendToWorker()` functions
- Changed to forward messages to content script instead
- Now acts as a pure message router

**Old code (~204 lines):** Attempted to manage worker directly
**New code (~101 lines):** Routes messages and tracks state only

---

#### 2. Content Script Enhancement

**File:** `extension/content/content.js`

**What was added:**

- Web Worker creation at script initialization
- `initializeWorker()` function - creates worker with proper URL
- `sendToWorker()` function - sends messages with promise-based responses
- Updated `upscaleImage()` to use local worker

**Key addition:**

```javascript
// NOW ALLOWED in content script:
inferenceWorker = new Worker(
  chrome.runtime.getURL("worker/inference-worker.js"),
  { type: "module" },
);
```

Content scripts have sufficient permissions to use the Worker API.

---

#### 3. Worker Message Handling

**File:** `extension/worker/inference-worker.js`

**What was improved:**

- Updated message handler to accept both `INFERENCE_REQUEST` and `RUN_INFERENCE` types
- Response now includes calculated output dimensions
- Better payload structure for image dimension handling

---

## Why This Works

### Manifest V3 API Restrictions

```
┌──────────────────────────────────────────────────────┐
│ Service Worker (Restricted Context)                  │
├──────────────────────────────────────────────────────┤
│ ✓ chrome.* APIs (messaging, storage, alarms)        │
│ ✓ setTimeout, fetch, promise handling               │
│ ✗ DOM access (no window, document, etc)             │
│ ✗ Content script direct communication                │
│ ✗ Web Worker creation (NEW WORKER() NOT ALLOWED)    │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│ Content Script (Page Context)                        │
├──────────────────────────────────────────────────────┤
│ ✓ DOM access (document, window, elements)           │
│ ✓ Web Worker creation (ALLOWED)                     │
│ ✓ chrome.* APIs (messaging)                         │
│ ✓ Regular JavaScript APIs                           │
│ ✗ Direct access to page globals                     │
└──────────────────────────────────────────────────────┘
```

### New Message Flow (Correct)

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. USER INTERACTION                                             │
│    Click "Upscale Single Image"                                 │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. POPUP LAYER (popup.js)                                       │
│    Sends: { type: 'UPSCALE_SINGLE' }                            │
│    Via: chrome.runtime.sendMessage()                            │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. SERVICE WORKER LAYER (service-worker.js)                     │
│    Receives message                                             │
│    Performs message routing                                     │
│    Via: chrome.tabs.sendMessage() → Content Script              │
│    ✓ NO WORKER CREATION (not allowed here)                      │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. CONTENT SCRIPT LAYER (content/content.js)                    │
│    Receives routed message                                      │
│    Extracts image data from DOM                                 │
│    Via: sendToWorker() → Web Worker                             │
│    ✓ CAN CREATE WORKER (allowed in content script)              │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. WEB WORKER LAYER (worker/inference-worker.js)                │
│    Receives inference request                                   │
│    Loads ONNX Runtime + Model                                   │
│    Runs 4x upscaling inference                                  │
│    Returns output tensor + dimensions                           │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ↓
┌─────────────────────────────────────────────────────────────────┐
│ 6. RESULT HANDLING (back in content script)                     │
│    Receives inference result                                    │
│    Converts tensor back to image                                │
│    Replaces DOM image element                                   │
│    Updates popup with success status                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Files Touched

| File                                   | Change                                 | Lines Changed                      |
| -------------------------------------- | -------------------------------------- | ---------------------------------- |
| `extension/service-worker.js`          | Removed Worker creation, added routing | 204 → 101 (103 lines removed)      |
| `extension/content/content.js`         | Added worker init + management         | +89 lines, modified upscaleImage() |
| `extension/worker/inference-worker.js` | Enhanced message handler               | +15 lines (better response format) |

---

## How to Verify the Fix

### Immediate Verification

```
1. Reload extension (chrome://extensions → Reload button)
2. Open any website
3. Press F12 for Developer Tools
4. Click extension icon → "Detect Images"
5. Click "Upscale Single Image"
6. Look in Console for:
   ✓ [Manga Upscaler] Found X upscalable images
   ✓ [Inference Worker] Loading ONNX model...
   ✓ [Inference Worker] Inference complete in XXXms
   ✓ [Manga Upscaler] Image replaced...
```

### Expected Behavior

- First run: Takes 30-60 seconds to load ONNX Runtime
- Subsequent runs: Takes 5-15 seconds (model cached)
- Image on webpage gets enlarged 4x
- No "Worker is not defined" error

---

## Technical Details for Reference

### Why Web Worker API Isn't Available in Service Worker

- Service workers run in restricted environment
- They have no persistent global scope
- They can be suspended/terminated by browser
- Web Workers require stable context (which service workers don't guarantee)
- This is by design for security and performance

### Why Content Script Can Create Workers

- Content scripts run in page context
- They have access to most DOM/window APIs
- They have stable execution context
- Web Worker creation requires stable context (which content scripts have)
- This aligns with Manifest V3 security model

### Message Passing Overhead

- Minimal (microseconds): Small tensors/objects cross context boundary
- Data is copied, not shared (for security)
- Large arrays/tensors converted to/from regular arrays during transfer

---

## What This Fix Enables

✓ **Now Works:**

- Image detection on web pages
- Web Worker for background inference
- 4x image upscaling with RealESRGAN
- Non-blocking UI during processing
- Progress tracking through message flow

✓ **Still Compliant:**

- Manifest V3 security model
- No forbidden APIs used
- Proper message passing architecture
- Cross-origin handling via content script

---

## Next Steps

1. **Test the fix** following [TEST_GUIDE.md](./TEST_GUIDE.md)
2. **Review architecture** in [ARCHITECTURE_FIX.md](./ARCHITECTURE_FIX.md)
3. **Future enhancements:**
   - Batch upscaling (all images on page)
   - Quality presets
   - Progress updates
   - Undo functionality

---

## Summary

**The error occurred because:** Service worker tried to use `new Worker()`, which isn't allowed in Manifest V3.

**The fix:** Move Web Worker creation to content script, which has the necessary permissions.

**Result:** Proper architecture that complies with Manifest V3 and enables full inference pipeline.

**Status:** ✅ READY TO TEST
