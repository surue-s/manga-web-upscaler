console.log("popup script loaded");

//dom elements
const modelStatusEl = document.getElementById("modelStatus");
const imageCountEl = document.getElementById("imageCount");
const detectBtn = document.getElementById("detectBtn");
const upscaleBtn = document.getElementById("upscaleBtn");
const progressContainer = document.getElementById("progressContainer");
const progressFill = document.getElementById("progressFill");
const progressText = document.getElementById("progressText");
const messageBox = document.getElementById("messageBox");
const speedModeBtn = document.getElementById("speedModeBtn");
const qualityModeBtn = document.getElementById("qualityModeBtn");

let detectedImagesCount = 0;
let currentMode = "speed"; // default mode

//wait for dom to load
document.addEventListener("DOMContentLoaded", () => {
  console.log("Popup initialized");
  
  //load saved mode preference
  chrome.storage.local.get(["upscaleMode"], (result) => {
    if (result.upscaleMode) {
      currentMode = result.upscaleMode;
      updateModeUI();
    }
  });
  
  //check model status
  checkModelStatus();
  
  //button click handlers
  detectBtn.addEventListener("click", detectImages);
  upscaleBtn.addEventListener("click", upscaleSingleImage);
  speedModeBtn.addEventListener("click", () => setMode("speed"));
  qualityModeBtn.addEventListener("click", () => setMode("quality"));
});

//check if model is loaded in the service worker
function checkModelStatus() {
  modelStatusEl.textContent = "Checking...";
  
  chrome.runtime.sendMessage(
    { action: "CHECK_MODEL_STATUS" },
    (response) => {
      if (chrome.runtime.lastError) {
        modelStatusEl.textContent = "Error";
        return;
      }
      
      if (response && response.modelReady) {
        modelStatusEl.textContent = "Ready";
      } else {
        modelStatusEl.textContent = "Loading Model...";
      }
    }
  );
}

//detect images on the current page
function detectImages() {
  console.log("detect images clicked");
  detectBtn.disabled = true;
  
  //send message to service worker
  chrome.runtime.sendMessage(
    { action: "DETECT_IMAGES" },
    (response) => {
      if (chrome.runtime.lastError) {
        showError("failed to detect images: " + chrome.runtime.lastError.message);
        detectBtn.disabled = false;
        return;
      }
      
      if (response && response.count !== undefined) {
        detectedImagesCount = response.count;
        imageCountEl.textContent = detectedImagesCount;
        upscaleBtn.disabled = detectedImagesCount === 0;
        const plural = detectedImagesCount === 1 ? "image" : "images";
        showSuccess(`Found ${detectedImagesCount} ${plural}`);
      }
      
      detectBtn.disabled = false;
    }
  );
}

//upscale the first detected image
function upscaleSingleImage() {
  console.log("upscale single image clicked");
  upscaleBtn.disabled = true;
  detectBtn.disabled = true;
  progressContainer.style.display = "block";
  updateProgress(0);
  
  //send message to service worker with mode preference
  chrome.runtime.sendMessage(
    { action: "UPSCALE_SINGLE_IMAGE", mode: currentMode },
    (response) => {
      if (chrome.runtime.lastError) {
        showError("upscale failed: " + chrome.runtime.lastError.message);
        progressContainer.style.display = "none";
        upscaleBtn.disabled = false;
        detectBtn.disabled = false;
        return;
      }
      
      if (response && response.success) {
        updateProgress(100);
        showSuccess("Image upscaled successfully");
      } else {
        showError(response?.error || "Upscaling failed");
      }
      
      setTimeout(() => {
        progressContainer.style.display = "none";
        upscaleBtn.disabled = false;
        detectBtn.disabled = false;
      }, 2000);
    }
  );
}

//set upscale mode
function setMode(mode) {
  currentMode = mode;
  chrome.storage.local.set({ upscaleMode: mode });
  updateModeUI();
  showSuccess(`Mode: ${mode === "speed" ? "Speed" : "Quality"}`);
}

//update mode button UI
function updateModeUI() {
  if (currentMode === "speed") {
    speedModeBtn.classList.add("active");
    qualityModeBtn.classList.remove("active");
  } else {
    speedModeBtn.classList.remove("active");
    qualityModeBtn.classList.add("active");
  }
}

//helper: update progress bar
function updateProgress(percent) {
  progressFill.style.width = percent + "%";
  progressText.textContent = percent + "%";
}

//helper: show error message
function showError(message) {
  messageBox.innerHTML = `<div class="error">${message}</div>`;
  setTimeout(() => {
    messageBox.innerHTML = "";
  }, 5000);
}

//helper: show success message
function showSuccess(message) {
  messageBox.innerHTML = `<div class="success">${message}</div>`;
  setTimeout(() => {
    messageBox.innerHTML = "";
  }, 5000);
}
