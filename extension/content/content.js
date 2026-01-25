/**
 * CONTENT SCRIPT - Runs in the context of web pages
 * 
 * Responsibilities:
 * - Detect and analyze images on the page
 * - Extract image data for upscaling
 * - Replace original images with upscaled results
 * - Communicate with service worker via message passing
 * 
 * NEVER performs heavy computation - delegates to Web Worker via service worker
 */

console.log('[Manga Upscaler] Content script loaded');

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
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Set canvas size to image natural size
    canvas.width = imgElement.naturalWidth;
    canvas.height = imgElement.naturalHeight;
    
    // Create a new image to handle cross-origin
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      try {
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        resolve({
          data: imageData.data,
          width: canvas.width,
          height: canvas.height
        });
      } catch (error) {
        reject(new Error(`Failed to extract image data: ${error.message}`));
      }
    };
    
    img.onerror = () => {
      reject(new Error('Failed to load image (possibly cross-origin)'));
    };
    
    img.src = imgElement.src;
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
 * Upscale a single image
 */
async function upscaleImage(imgElement) {
  try {
    console.log(`[Manga Upscaler] Starting upscale for image: ${imgElement.src.substring(0, 50)}...`);
    
    // Extract image data
    const imageData = await extractImageData(imgElement);
    console.log(`[Manga Upscaler] Extracted image data: ${imageData.width}x${imageData.height}`);
    
    // Convert to tensor
    const { tensor, dims } = imageDataToTensor(imageData);
    console.log(`[Manga Upscaler] Converted to tensor: ${dims}`);
    
    // Send to service worker for inference
    const response = await chrome.runtime.sendMessage({
      type: 'UPSCALE_IMAGE',
      payload: {
        tensor: Array.from(tensor), // Convert to regular array for message passing
        dims: dims,
        originalWidth: imageData.width,
        originalHeight: imageData.height
      }
    });
    
    if (response.success) {
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
      throw new Error(response.error || 'Unknown error');
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
