/**
 * SERVICE WORKER - Background coordinator (Manifest V3)
 * 
 * Responsibilities:
 * - Coordinate messages between popup, content script, and Web Worker
 * - Manage Web Worker lifecycle
 * - Track extension state
 * 
 * NEVER performs heavy computation or direct DOM manipulation
 * Acts as a message router and state manager only
 */

console.log('[Manga Upscaler] Service worker initialized');

// Web Worker instance (created on-demand, reused across requests)
let inferenceWorker = null;
let modelLoaded = false;
let workerReady = false;

/**
 * Initialize inference worker
 * Created once and reused for all inference requests
 */
function initializeWorker() {
  if (inferenceWorker) {
    console.log('[Service Worker] Worker already exists');
    return inferenceWorker;
  }
  
  console.log('[Service Worker] Creating inference worker...');
  
  inferenceWorker = new Worker(
    chrome.runtime.getURL('worker/inference-worker.js'),
    { type: 'module' }
  );
  
  // Handle messages from worker
  inferenceWorker.onmessage = (event) => {
    const { type, payload } = event.data;
    console.log(`[Service Worker] Message from worker: ${type}`);
    
    if (type === 'WORKER_READY') {
      workerReady = true;
      console.log('[Service Worker] Worker is ready');
      
    } else if (type === 'MODEL_LOADED') {
      modelLoaded = true;
      console.log('[Service Worker] Model loaded successfully');
      
    } else if (type === 'MODEL_LOAD_ERROR') {
      console.error('[Service Worker] Model load error:', payload.error);
      modelLoaded = false;
      
    } else if (type === 'INFERENCE_COMPLETE') {
      console.log('[Service Worker] Inference complete');
      // Result will be handled by the pending promise
      
    } else if (type === 'INFERENCE_ERROR') {
      console.error('[Service Worker] Inference error:', payload.error);
    }
  };
  
  inferenceWorker.onerror = (error) => {
    console.error('[Service Worker] Worker error:', error);
    workerReady = false;
    modelLoaded = false;
  };
  
  return inferenceWorker;
}

/**
 * Send message to worker and wait for response
 */
function sendToWorker(message) {
  return new Promise((resolve, reject) => {
    if (!inferenceWorker) {
      initializeWorker();
    }
    
    const messageId = Date.now() + Math.random();
    const messageWithId = { ...message, messageId };
    
    // Create one-time listener for this specific message
    const handler = (event) => {
      const { type, payload, messageId: responseId } = event.data;
      
      if (responseId !== messageId) return; // Not our response
      
      inferenceWorker.removeEventListener('message', handler);
      
      if (type === 'INFERENCE_COMPLETE') {
        resolve(payload);
      } else if (type === 'INFERENCE_ERROR') {
        reject(new Error(payload.error));
      } else if (type === 'MODEL_LOADED') {
        modelLoaded = true;
        resolve({ loaded: true });
      } else if (type === 'MODEL_LOAD_ERROR') {
        reject(new Error(payload.error));
      }
    };
    
    inferenceWorker.addEventListener('message', handler);
    inferenceWorker.postMessage(messageWithId);
    
    // Timeout after 60 seconds
    setTimeout(() => {
      inferenceWorker.removeEventListener('message', handler);
      reject(new Error('Worker timeout'));
    }, 60000);
  });
}

/**
 * Handle messages from content script or popup
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log(`[Service Worker] Received message: ${message.type}`);
  
  // Content script ready notification
  if (message.type === 'CONTENT_SCRIPT_READY') {
    console.log('[Service Worker] Content script is ready');
    sendResponse({ received: true });
    return false;
  }
  
  // Check model status
  if (message.type === 'CHECK_MODEL_STATUS') {
    sendResponse({ loaded: modelLoaded, ready: workerReady });
    return false;
  }
  
  // Load model explicitly
  if (message.type === 'LOAD_MODEL') {
    sendToWorker({ type: 'LOAD_MODEL' })
      .then(() => sendResponse({ success: true, loaded: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Async response
  }
  
  // Run inference
  if (message.type === 'UPSCALE_IMAGE') {
    const { tensor, dims, originalWidth, originalHeight } = message.payload;
    
    console.log(`[Service Worker] Starting inference for ${dims[2]}x${dims[3]} image`);
    
    sendToWorker({
      type: 'RUN_INFERENCE',
      payload: { tensor, dims }
    })
      .then(result => {
        console.log(`[Service Worker] Inference successful: ${result.outputDims}`);
        sendResponse({
          success: true,
          tensor: result.tensor,
          width: result.outputDims[3],
          height: result.outputDims[2]
        });
      })
      .catch(error => {
        console.error('[Service Worker] Inference failed:', error);
        sendResponse({
          success: false,
          error: error.message
        });
      });
    
    return true; // Async response
  }
  
  return false;
});

/**
 * Initialize worker on install
 */
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[Service Worker] Extension installed/updated:', details.reason);
  
  if (details.reason === 'install') {
    console.log('[Service Worker] First install - worker will be created on first use');
  } else if (details.reason === 'update') {
    console.log('[Service Worker] Extension updated - reinitializing worker');
    if (inferenceWorker) {
      inferenceWorker.terminate();
      inferenceWorker = null;
      modelLoaded = false;
      workerReady = false;
    }
  }
});

/**
 * Keep service worker alive
 * Manifest V3 service workers can be terminated by the browser
 */
chrome.runtime.onStartup.addListener(() => {
  console.log('[Service Worker] Browser startup - service worker activated');
});

// Log when service worker starts
console.log('[Service Worker] Service worker script loaded and ready');
