/**
 * CONTENT SCRIPT - Runs in the context of web pages
 * 
 * Responsibilities:
 * - Create and manage Web Worker for inference
 * - Detect and analyze images on the page
 * - Extract image data for upscaling
 * - Replace original images with upscaled results
 * - Communicate with service worker via message passing
 */

console.log('[Manga Upscaler] Content script loaded');

// Web Worker instance (created once, reused for all inferences)
let inferenceWorker = null;
let modelLoaded = false;
let workerReady = false;

/**
 * Initialize Web Worker for ONNX inference
 * Only called once per page load
 */
function initializeWorker() {
  if (inferenceWorker) {
    console.log('[Content Script] Worker already initialized');
    return;
  }
  
  console.log('[Content Script] Creating Web Worker for inference...');
  
  try {
    // Create worker from extension URL
    const workerUrl = chrome.runtime.getURL('worker/inference-worker.js');
    console.log('[Content Script] Worker URL:', workerUrl);
    
    // Use classic worker so importScripts works inside inference-worker.js
    inferenceWorker = new Worker(workerUrl, { type: 'classic' });
    
    inferenceWorker.onmessage = (event) => {
      const { type, payload } = event.data;
      console.log(`[Content Script] Message from worker: ${type}`);
      
      if (type === 'WORKER_READY') {
        workerReady = true;
        console.log('[Content Script] Worker is ready');
        notifyServiceWorkerStatus();
        
      } else if (type === 'MODEL_LOADED') {
        modelLoaded = true;
        console.log('[Content Script] Model loaded successfully');
        notifyServiceWorkerStatus();
        
      } else if (type === 'MODEL_LOAD_ERROR') {
        console.error('[Content Script] Model load error:', payload.error);
        modelLoaded = false;
        notifyServiceWorkerStatus();
      }
    };
    
    inferenceWorker.onerror = (error) => {
      console.error('[Content Script] Worker error:', error);
      workerReady = false;
      modelLoaded = false;
    };
    
  } catch (error) {
    console.error('[Content Script] Failed to create worker:', error);
  }
}

/**
 * Send message to worker and wait for response
 */
function sendToWorker(message) {
  return new Promise((resolve, reject) => {
    if (!inferenceWorker) {
      initializeWorker();
    }
    
    if (!inferenceWorker) {
      reject(new Error('Failed to initialize worker'));
      return;
    }
    
    const messageId = Date.now() + Math.random();
    const messageWithId = { ...message, messageId };
    
    const handler = (event) => {
      const { type, payload, messageId: responseId } = event.data;
      
      if (responseId !== messageId) return;
      
      inferenceWorker.removeEventListener('message', handler);
      
      if (type === 'INFERENCE_COMPLETE') {
        resolve(payload);
      } else if (type === 'INFERENCE_ERROR') {
        reject(new Error(payload.error));
      } else if (type === 'MODEL_LOADED') {
        modelLoaded = true;
        notifyServiceWorkerStatus();
        resolve({ loaded: true });
      } else if (type === 'MODEL_LOAD_ERROR') {
        reject(new Error(payload.error));
      }
    };
    
    inferenceWorker.addEventListener('message', handler);
    inferenceWorker.postMessage(messageWithId);
    
    setTimeout(() => {
      inferenceWorker.removeEventListener('message', handler);
      reject(new Error('Worker timeout'));
    }, 60000);
  });
}

/**
 * Notify service worker about model status
 */
function notifyServiceWorkerStatus() {
  chrome.runtime.sendMessage({
    type: 'UPDATE_MODEL_STATUS',
    payload: { loaded: modelLoaded, ready: workerReady }
  }).catch(error => {
    console.log('[Content Script] Could not notify service worker:', error);
  });
}

// Track which images have been upscaled to avoid duplicates
const upscaledImages = new WeakSet();

/**
 * Detect all images on the current page
 * Filter by visibility and minimum size
 */
function detectImages() {
  const images = Array.from(document.querySelectorAll('img'));
  
  const validImages = images.filter(img => {
    // Skip if already upscaled
    if (upscaledImages.has(img)) return false;
    
    // Skip hidden images
    const rect = img.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    
    // Skip tiny images (likely icons)
    if (img.naturalWidth < 100 || img.naturalHeight < 100) return false;
    
    // Skip very large images (already high-res)
    if (img.naturalWidth > 2000 || img.naturalHeight > 2000) return false;
    
    return true;
  });
  
  console.log(`[Manga Upscaler] Found ${validImages.length} upscalable images`);
  return validImages;
}

/**
 * Extract image data as ImageData object
 * Handles cross-origin restrictions
 */
async function extractImageData(imgElement) {
  const srcUrl = imgElement.currentSrc || imgElement.src;

  const isDataUrl = srcUrl.startsWith('data:');
  const isBlobUrl = srcUrl.startsWith('blob:');
  const isSameOrigin = (() => {
    try {
      const u = new URL(srcUrl, location.href);
      return u.origin === location.origin;
    } catch {
      return false;
    }
  })();

  const drawAndExtract = (image) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const w = image.naturalWidth || image.width;
    const h = image.naturalHeight || image.height;
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(image, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);
    return { data: imageData.data, width: w, height: h };
  };

  // Helper: ask service worker to fetch image bytes (bypasses page CORS)
  const fetchViaExtension = async () => {
    const response = await chrome.runtime.sendMessage({
      type: 'FETCH_IMAGE',
      payload: { url: srcUrl }
    });
    if (!response || !response.success) {
      throw new Error(response?.error || 'Service worker fetch failed');
    }
    const bytes = new Uint8Array(response.data);
    const blob = new Blob([bytes], { type: response.contentType || 'image/jpeg' });
    return blob;
  };

  // Helper: draw a blob to canvas
  const drawBlob = async (blob) => {
    return await new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(blob);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const extracted = drawAndExtract(img);
          URL.revokeObjectURL(objectUrl);
          resolve(extracted);
        } catch (error) {
          URL.revokeObjectURL(objectUrl);
          reject(new Error(`Failed to extract image data: ${error.message}`));
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Failed to load image blob (extension fetch)'));
      };
      img.src = objectUrl;
    });
  };

  // Fast path for data/blob/same-origin: draw the existing element first
  if (isDataUrl || isBlobUrl || isSameOrigin) {
    try {
      return drawAndExtract(imgElement);
    } catch (error) {
      console.warn('[Manga Upscaler] Direct draw failed, will try CORS-safe fetch:', error.message);
    }
  }

  // Try extension fetch first (best chance to bypass hotlink protection)
  try {
    const blob = await fetchViaExtension();
    return await drawBlob(blob);
  } catch (swError) {
    console.warn('[Manga Upscaler] Extension fetch failed, falling back to page fetch:', swError.message);
  }

  // Preferred CORS-safe path: fetch → blob → object URL → draw
  try {
    const response = await fetch(srcUrl, {
      mode: 'cors',
      credentials: 'omit',
      referrerPolicy: 'no-referrer'
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    if (!blob || blob.size === 0) throw new Error('Empty image blob');

    return await new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(blob);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const extracted = drawAndExtract(img);
          URL.revokeObjectURL(objectUrl);
          resolve(extracted);
        } catch (error) {
          URL.revokeObjectURL(objectUrl);
          reject(new Error(`Failed to extract image data: ${error.message}`));
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Failed to load image blob (possibly cross-origin)'));
      };
      img.src = objectUrl;
    });
  } catch (fetchError) {
    console.warn('[Manga Upscaler] Fetch path failed, falling back to crossOrigin image load:', fetchError.message);
  }

  // Fallback: try new Image with crossOrigin flag (may still be blocked)
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const extracted = drawAndExtract(img);
        resolve(extracted);
      } catch (error) {
        reject(new Error(`Failed to extract image data: ${error.message}`));
      }
    };
    img.onerror = () => {
      reject(new Error('Failed to load image (blocked by CORS / no-cors)'));
    };
    img.src = srcUrl;
  });
}

/**
 * Convert ImageData to Float32Array tensor [1, 3, H, W]
 * Normalized to [0, 1] range for ONNX model input
 */
function imageDataToTensor(imageData) {
  const { data, width, height } = imageData;
  const tensor = new Float32Array(3 * width * height);
  
  // Convert RGBA to RGB and normalize to [0, 1]
  // Rearrange from HWC (height, width, channels) to CHW (channels, height, width)
  for (let h = 0; h < height; h++) {
    for (let w = 0; w < width; w++) {
      const pixelIndex = (h * width + w) * 4; // RGBA
      const tensorIndex = h * width + w;
      
      // RGB channels normalized to [0, 1]
      tensor[0 * width * height + tensorIndex] = data[pixelIndex + 0] / 255.0;     // R
      tensor[1 * width * height + tensorIndex] = data[pixelIndex + 1] / 255.0;     // G
      tensor[2 * width * height + tensorIndex] = data[pixelIndex + 2] / 255.0;     // B
    }
  }
  
  return { tensor, dims: [1, 3, height, width] };
}

/**
 * Convert Float32Array tensor [1, 3, H, W] back to ImageData
 */
function tensorToImageData(tensor, width, height) {
  const imageData = new ImageData(width, height);
  const data = imageData.data;
  
  for (let h = 0; h < height; h++) {
    for (let w = 0; w < width; w++) {
      const pixelIndex = (h * width + w) * 4; // RGBA
      const tensorIndex = h * width + w;
      
      // Convert from CHW to HWC and denormalize from [0, 1] to [0, 255]
      data[pixelIndex + 0] = Math.min(255, Math.max(0, tensor[0 * width * height + tensorIndex] * 255)); // R
      data[pixelIndex + 1] = Math.min(255, Math.max(0, tensor[1 * width * height + tensorIndex] * 255)); // G
      data[pixelIndex + 2] = Math.min(255, Math.max(0, tensor[2 * width * height + tensorIndex] * 255)); // B
      data[pixelIndex + 3] = 255; // Alpha
    }
  }
  
  return imageData;
}

/**
 * Replace image in DOM with upscaled version
 */
function replaceImage(imgElement, upscaledImageData) {
  const canvas = document.createElement('canvas');
  canvas.width = upscaledImageData.width;
  canvas.height = upscaledImageData.height;
  
  const ctx = canvas.getContext('2d');
  ctx.putImageData(upscaledImageData, 0, 0);
  
  // Convert canvas to blob then to object URL
  canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    
    // Store original src for potential undo
    imgElement.dataset.originalSrc = imgElement.src;
    imgElement.dataset.upscaled = 'true';
    
    // Replace image
    imgElement.src = url;
    
    // Mark as upscaled
    upscaledImages.add(imgElement);
    
    console.log(`[Manga Upscaler] Image replaced: ${imgElement.naturalWidth}x${imgElement.naturalHeight} -> ${canvas.width}x${canvas.height}`);
  });
}

/**
 * Upscale a single image using local Web Worker
 */
async function upscaleImage(imgElement) {
  try {
    console.log(`[Manga Upscaler] Starting upscale for image: ${imgElement.src.substring(0, 50)}...`);
    
    // Initialize worker if needed
    if (!inferenceWorker) {
      initializeWorker();
    }
    
    // Extract image data
    const imageData = await extractImageData(imgElement);
    console.log(`[Manga Upscaler] Extracted image data: ${imageData.width}x${imageData.height}`);
    
    // Convert to tensor
    const { tensor, dims } = imageDataToTensor(imageData);
    console.log(`[Manga Upscaler] Converted to tensor: ${dims}`);
    
    // Send directly to worker for inference
    const response = await sendToWorker({
      type: 'INFERENCE_REQUEST',
      payload: {
        tensor: Array.from(tensor), // Convert to regular array for message passing
        dims: dims,
        originalWidth: imageData.width,
        originalHeight: imageData.height
      }
    });
    
    if (response) {
      console.log(`[Manga Upscaler] Received upscaled result: ${response.width}x${response.height}`);
      
      // Convert result back to ImageData
      const upscaledImageData = tensorToImageData(
        new Float32Array(response.tensor),
        response.width,
        response.height
      );
      
      // Replace in DOM
      replaceImage(imgElement, upscaledImageData);
      
      return { success: true };
    } else {
      throw new Error('No response from worker');
    }
    
  } catch (error) {
    console.error('[Manga Upscaler] Upscale failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Listen for messages from popup or service worker
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Manga Upscaler] Content script received message:', message.type);
  
  if (message.type === 'DETECT_IMAGES') {
    const images = detectImages();
    sendResponse({ count: images.length });
    
  } else if (message.type === 'UPSCALE_SINGLE') {
    // Upscale the first detected image
    const images = detectImages();
    if (images.length > 0) {
      upscaleImage(images[0])
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // Async response
    } else {
      sendResponse({ success: false, error: 'No images found' });
    }
    
  } else if (message.type === 'UPSCALE_ALL') {
    // Future: Batch upscale all images
    sendResponse({ success: false, error: 'Batch upscaling not yet implemented' });
  }
  
  return false;
});

// Notify that content script is ready
chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY' });
