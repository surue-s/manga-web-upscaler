// Service Worker: Message coordinator between popup and content script
console.log('Service Worker loaded');

// Track model status
let modelReady = false;

// Listen for extension install/update
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Extension installed/updated:', details.reason);

  if (details.reason === "install"){
    console.log('First time installation');
  } else if (details.reason === "update"){
    console.log('Extension updated');
  }
});

// Listen for messages from popup or content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Service Worker received message:', request);

  // Handle different message types
  switch (request.action){
    case "CHECK_MODEL_STATUS":
      handleCheckModelStatus(request, sender, sendResponse);
      return false;

    case "MODEL_LOADED":
      handleModelLoaded(request, sender, sendResponse);
      return false;

    case "DETECT_IMAGES":
      handleDetectImages(request, sender, sendResponse);
      return true; // Keep channel open for async response

    case "UPSCALE_SINGLE_IMAGE":
      handleUpscaleImage(request, sender, sendResponse);
      return true; // Keep channel open for async response

    default:
      console.warn('Unknown action:', request.action);
      sendResponse({ error: 'Unknown action' });
      return false;
  }
});

// Handler: Check if model is loaded
function handleCheckModelStatus(request, sender, sendResponse) {
  console.log('checking model status:', modelReady);
  sendResponse({ modelReady: modelReady });
}

// Handler: Model has been loaded
function handleModelLoaded(request, sender, sendResponse) {
  console.log('Model loaded successfully');
  modelReady = true;
  sendResponse({ success: true });
}

// Handler: Detect images on page
function handleDetectImages(request, sender, sendResponse){
  console.log('forward detect_images to the content script');

  // Get active tab
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if(tabs.length === 0){
      console.error('[Service Worker] No active tab found');
      sendResponse({ error: 'No active tab' });
      return;
    }

    // Forward message to content script
    chrome.tabs.sendMessage(
      tabs[0].id,
      { action: "DETECT_IMAGES" },
      (response) => {
        if(chrome.runtime.lastError){
          console.error('[Service Worker] Error forwarding to content script:', chrome.runtime.lastError);
          sendResponse({ error: chrome.runtime.lastError.message });
        } else {
          console.log('[Service Worker] Received response from content script:', response);
          sendResponse(response);
        }
      }
    );
  });
}

// Handler: Upscale single image
function handleUpscaleImage(request, sender, sendResponse){
  console.log('forward upscale_single_image to the content script', 'mode:', request.mode);

  // Get active tab
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if(tabs.length === 0){
      console.error('[Service Worker] No active tab found');
      sendResponse({ error: 'No active tab' });
      return;
    }

    // Forward message to content script with mode parameter
    chrome.tabs.sendMessage(
      tabs[0].id,
      { action: "UPSCALE_SINGLE_IMAGE", mode: request.mode || "speed" },
      (response) => {
        if(chrome.runtime.lastError){
          console.error('[Service Worker] Error forwarding to content script:', chrome.runtime.lastError);
          sendResponse({ error: chrome.runtime.lastError.message });
        } else {
          console.log('[Service Worker] Received response from content script:', response);
          sendResponse(response);
        }
      }
    );
  });
}

console.log('Service Worker setup complete');