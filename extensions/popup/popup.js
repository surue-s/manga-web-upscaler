// popup.js — simple UI to scan + upscale
const modelEl   = document.getElementById("modelStatus");
const countEl   = document.getElementById("imageCount");
const scanBtn   = document.getElementById("scanBtn");
const upscaleBtn = document.getElementById("upscaleBtn");
const logEl     = document.getElementById("log");

function log(msg) {
  console.log("[popup]", msg);
  logEl.textContent += msg + "\n";
  logEl.scrollTop = logEl.scrollHeight;
}

// Check status on open
function checkStatus() {
  chrome.runtime.sendMessage({ type: "GET_STATUS" }, (resp) => {
    if (chrome.runtime.lastError) {
      modelEl.textContent = "No tab";
      modelEl.className = "value error";
      log("error: " + chrome.runtime.lastError.message);
      return;
    }
    if (resp && resp.modelReady) {
      modelEl.textContent = "Ready";
      modelEl.className = "value ready";
    } else {
      modelEl.textContent = "Loading...";
      modelEl.className = "value loading";
      setTimeout(checkStatus, 2000);
    }
    if (resp && resp.imageCount !== undefined) {
      countEl.textContent = resp.imageCount;
      upscaleBtn.disabled = resp.imageCount === 0 || !resp.modelReady;
    }
  });
}

// Scan
scanBtn.addEventListener("click", () => {
  scanBtn.disabled = true;
  log("scanning...");
  chrome.runtime.sendMessage({ type: "SCAN" }, (resp) => {
    scanBtn.disabled = false;
    if (chrome.runtime.lastError) {
      log("scan error: " + chrome.runtime.lastError.message);
      return;
    }
    if (resp && resp.error) {
      log("scan error: " + resp.error);
      return;
    }
    const n = resp ? resp.count : 0;
    countEl.textContent = n;
    log("found " + n + " images");
    // Re-check status to update upscale button
    checkStatus();
  });
});

// Upscale
upscaleBtn.addEventListener("click", () => {
  upscaleBtn.disabled = true;
  scanBtn.disabled = true;
  log("upscaling... (this may take 10-60s)");
  chrome.runtime.sendMessage({ type: "UPSCALE" }, (resp) => {
    upscaleBtn.disabled = false;
    scanBtn.disabled = false;
    if (chrome.runtime.lastError) {
      log("error: " + chrome.runtime.lastError.message);
      return;
    }
    if (resp && resp.success) {
      log("done! output: " + resp.width + "x" + resp.height);
    } else {
      log("failed: " + (resp ? resp.error : "unknown"));
    }
  });
});

// Init
checkStatus();
log("popup ready");
