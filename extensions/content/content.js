// content.js — runs on every page
// Job: find images, extract pixels, talk to worker, replace image with upscaled version.

console.log("[content] loaded on", location.href);

let worker = null;
let modelReady = false;
let detectedImages = [];

// --- Worker setup ---
function createWorker() {
  if (worker) return;

  const url = chrome.runtime.getURL("worker/inference-worker.js");
  console.log("[content] creating worker from", url);

  worker = new Worker(url);
  worker.onmessage = (e) => {
    console.log("[content] worker says:", e.data.action);

    if (e.data.action === "MODEL_STATUS") {
      modelReady = e.data.ready;
      console.log("[content] model ready:", modelReady);
      // Tell service-worker so popup can query it
      chrome.runtime.sendMessage({ type: "MODEL_READY", ready: modelReady });
    }

    // RESULT and ERROR are handled per-request via the promise pattern below
  };
  worker.onerror = (err) => {
    console.error("[content] worker error:", err.message);
  };

  // Tell worker to load the model (we resolve the URL here because worker can't use chrome.runtime)
  const modelUrl = chrome.runtime.getURL("models/esrgan_anime_model.onnx");
  console.log("[content] telling worker to load model:", modelUrl);
  worker.postMessage({ action: "LOAD_MODEL", modelUrl });
}

// --- Image detection ---
function scanImages() {
  detectedImages = [];
  const imgs = document.querySelectorAll("img");
  imgs.forEach((img) => {
    if (img.naturalWidth >= 50 && img.naturalHeight >= 50) {
      const rect = img.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        detectedImages.push(img);
      }
    }
  });
  console.log("[content] found", detectedImages.length, "images");
  return detectedImages.length;
}

// --- Extract pixel data from an <img> ---
function getPixels(img) {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const id = ctx.getImageData(0, 0, c.width, c.height);
  // Return plain object (ImageData can't be cloned to worker in all browsers)
  return { width: id.width, height: id.height, data: Array.from(id.data) };
}

// --- Replace image on page with upscaled pixels ---
function replaceImage(img, pixels) {
  const c = document.createElement("canvas");
  c.width = pixels.width;
  c.height = pixels.height;
  const ctx = c.getContext("2d");
  const id = ctx.createImageData(pixels.width, pixels.height);
  for (let i = 0; i < pixels.data.length; i++) id.data[i] = pixels.data[i];
  ctx.putImageData(id, 0, 0);
  img.src = c.toDataURL("image/png");
  img.style.width = pixels.width + "px";
  img.style.height = pixels.height + "px";
  console.log("[content] image replaced:", pixels.width, "x", pixels.height);
}

// --- Send image to worker and wait for result ---
function upscaleViaWorker(imageData) {
  return new Promise((resolve, reject) => {
    const handler = (e) => {
      if (e.data.action === "RESULT") {
        worker.removeEventListener("message", handler);
        resolve(e.data.imageData);
      }
      if (e.data.action === "ERROR") {
        worker.removeEventListener("message", handler);
        reject(new Error(e.data.error));
      }
    };
    worker.addEventListener("message", handler);
    worker.postMessage({ action: "RUN", imageData });
  });
}

// --- Main upscale flow ---
async function upscaleFirstImage() {
  if (detectedImages.length === 0) {
    return { error: "no images found — click Scan first" };
  }
  if (!modelReady) {
    return { error: "model still loading — wait a moment" };
  }

  const img = detectedImages[0];
  console.log("[content] upscaling:", img.src.slice(0, 80));

  try {
    const pixels = getPixels(img);
    console.log("[content] extracted", pixels.width, "x", pixels.height);
    const result = await upscaleViaWorker(pixels);
    replaceImage(img, result);
    return { success: true, width: result.width, height: result.height };
  } catch (err) {
    console.error("[content] upscale failed:", err);
    return { error: err.message };
  }
}

// --- Listen for messages from popup (via service-worker) ---
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log("[content] got message:", msg.type);

  if (msg.type === "SCAN") {
    const count = scanImages();
    sendResponse({ count });
    return false;
  }

  if (msg.type === "UPSCALE") {
    // async — must return true to keep channel open
    upscaleFirstImage().then(sendResponse);
    return true;
  }

  if (msg.type === "STATUS") {
    sendResponse({ modelReady, imageCount: detectedImages.length });
    return false;
  }
});

// --- Auto-init worker on load ---
createWorker();
