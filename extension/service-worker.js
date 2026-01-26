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

// Track model status (content script will manage the actual worker)
let modelLoaded = false;
let workerReady = false;

// Store pending inference requests to forward to content script
const pendingRequests = new Map();

/**
 * Handle messages from content script or popup
 * IMPORTANT: Content script manages Web Worker, we just route messages
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
  
  // Model status update from content script
  if (message.type === 'UPDATE_MODEL_STATUS') {
    modelLoaded = message.payload.loaded;
    workerReady = message.payload.ready;
    console.log('[Service Worker] Model status updated:', { modelLoaded, workerReady });
    return false;
  }
  
  // Forward inference to content script (it has the worker)
  if (message.type === 'UPSCALE_IMAGE') {
    console.log('[Service Worker] Forwarding upscale request to content script');
    
    // Find active tab with content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) {
        sendResponse({ success: false, error: 'No active tab found' });
        return;
      }
      
      const tabId = tabs[0].id;
      
      // Forward to content script
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[Service Worker] Error forwarding to content script:', chrome.runtime.lastError);
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse(response);
        }
      });
    });
    
    return true; // Async response
  }
  
  return false;
});

/**
 * Initialize on install
 */
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[Service Worker] Extension installed/updated:', details.reason);
  
  if (details.reason === 'install') {
    console.log('[Service Worker] First install - content script will handle worker creation');
  } else if (details.reason === 'update') {
    console.log('[Service Worker] Extension updated');
  }
});

/**
 * Keep service worker aware of startup
 */
chrome.runtime.onStartup.addListener(() => {
  console.log('[Service Worker] Browser startup - service worker activated');
});

console.log('[Service Worker] Service worker script loaded and ready');
