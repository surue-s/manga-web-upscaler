//content script: runs on webpages to detect and upscale images
console.log("content script loaded on:", location.href);

//store detected images
let detectedImages = [];
let inferenceWorker = null;
let workerReady = false;
let messageQueue = [];

//initialize web worker for inference
function initializeWorker() {
  if (inferenceWorker) {
    console.log("worker already initialized");
    return;
  }
  
  try {
    console.log("attempting to create worker...");
    
    //create worker using extension URL
    const workerUrl = chrome.runtime.getURL("worker/inference-worker.js");
    console.log("worker url:", workerUrl);
    
    inferenceWorker = new Worker(workerUrl);
    console.log("worker created, waiting for ready message...");
    
    //listen for messages from worker
    inferenceWorker.onmessage = (event) => {
      console.log("worker message:", event.data);
      
      // 👇 ADD THIS BLOCK HERE
      if (event.data.status === "ready") {
        console.log("worker is ready");
        workerReady = true;
        
        //process queued messages
        if (messageQueue.length > 0) {
          console.log(`processing ${messageQueue.length} queued messages`);
          messageQueue.forEach(msg => inferenceWorker.postMessage(msg));
          messageQueue = [];
        }
        
        chrome.runtime.sendMessage({ action: "MODEL_LOADED" });
      }
    };
    
    inferenceWorker.onerror = (error) => {
      console.error("worker error:", error.message, error.filename, error.lineno);
    };
    
    console.log("worker initialized successfully");
  } catch (error) {
    console.error("failed to initialize worker:", error.message);
  }
}
//detect images on the page
function detectImages() {
  console.log("detecting images on page...");
  detectedImages = [];
  
  //find all img elements
const allImages = document.querySelectorAll("img");
console.log(`found ${allImages.length} total img elements on page`);
  
  //filter images (must be visible and reasonable size)
  allImages.forEach((img) => {
    //skip if too small
    if (img.naturalWidth < 100 || img.naturalHeight < 100) {
      return;
    }
    
    //skip if not visible
    const rect = img.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return;
    }
    
    //skip if display:none or visibility:hidden
    const style = window.getComputedStyle(img);
    if (style.display === "none" || style.visibility === "hidden") {
      return;
    }
    
    //add to detected images
    detectedImages.push(img);
  });
  
  console.log(`detected ${detectedImages.length} valid images`);
  return detectedImages.length;
}

//upscale a single image
async function upscaleSingleImage() {
  if (detectedImages.length === 0) {
    throw new Error("no images detected");
  }
  
  if (!inferenceWorker) {
    initializeWorker();
    throw new Error("worker not initialized yet");
  }
  
  const img = detectedImages[0];
  console.log("upscaling image:", img.src);
  
  try {
    //extract image data
    const imageData = await extractImageData(img);
    console.log("extracted image data:", imageData.width, "x", imageData.height);
    
    //TODO: send to worker for upscaling
    //for now, just return success
    return { success: true };
  } catch (error) {
    console.error("upscale failed:", error);
    throw error;
  }
}

//extract image data from img element
async function extractImageData(img) {
    if (!img.complete || img.naturalWidth === 0) {
    throw new Error("image not loaded or invalid");
  }
  return new Promise((resolve, reject) => {
    try {
//create canvas
const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d");

if (!ctx) {
  reject(new Error("failed to get 2d context"));
  return;
}
      //set canvas size to image size
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      
      //draw image to canvas
      ctx.drawImage(img, 0, 0);
      
      //get image data
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      resolve(imageData);
    } catch (error) {
      reject(error);
    }
  });
}

//listen for messages from service worker
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("content script received:", request);
  
    try {

  switch (request.action) {
    case "DETECT_IMAGES":
      handleDetectImages(request, sender, sendResponse);
      return false; //synchronous response
      
    case "UPSCALE_SINGLE_IMAGE":
      handleUpscaleSingleImage(request, sender, sendResponse);
      return true; //async response
      
    default:
      console.warn("unknown action:", request.action);
      sendResponse({ error: "unknown action" });
      return false;
    }
  } catch (error) {
    console.error("message handler error:", error);
    sendResponse({ error: error.message });
    return false;
  }
});

//handler: detect images
function handleDetectImages(request, sender, sendResponse) {
  try {
    const count = detectImages();
    sendResponse({ count: count });
  } catch (error) {
    console.error("detect images error:", error);
    sendResponse({ error: error.message });
  }
}

//handler: upscale single image
async function handleUpscaleSingleImage(request, sender, sendResponse) {
  try {
    const result = await upscaleSingleImage();
    sendResponse(result);
  } catch (error) {
    console.error("upscale error:", error);
    sendResponse({ error: error.message });
  }
}

//initialize worker when content script loads
console.log("initializing worker...");
initializeWorker();