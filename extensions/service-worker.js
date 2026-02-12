// service-worker.js — thin relay between popup and content script
console.log("[sw] loaded");

let modelReady = false;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log("[sw] got:", msg.type, "from:", sender.tab ? "tab" : "popup");

  // Content script tells us model is ready
  if (msg.type === "MODEL_READY") {
    modelReady = msg.ready;
    console.log("[sw] model ready:", modelReady);
    sendResponse({ ok: true });
    return false;
  }

  // Popup asks for status
  if (msg.type === "GET_STATUS") {
    // Ask content script on active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) {
        sendResponse({ modelReady: false, count: 0 });
        return;
      }
      chrome.tabs.sendMessage(tabs[0].id, { type: "STATUS" }, (resp) => {
        if (chrome.runtime.lastError) {
          sendResponse({ modelReady, count: 0 });
        } else {
          sendResponse(resp || { modelReady, count: 0 });
        }
      });
    });
    return true; // async
  }

  // Forward SCAN to content script
  if (msg.type === "SCAN") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) { sendResponse({ error: "no tab" }); return; }
      chrome.tabs.sendMessage(tabs[0].id, { type: "SCAN" }, (resp) => {
        if (chrome.runtime.lastError) {
          sendResponse({ error: chrome.runtime.lastError.message });
        } else {
          sendResponse(resp);
        }
      });
    });
    return true;
  }

  // Forward UPSCALE to content script
  if (msg.type === "UPSCALE") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) { sendResponse({ error: "no tab" }); return; }
      chrome.tabs.sendMessage(tabs[0].id, { type: "UPSCALE" }, (resp) => {
        if (chrome.runtime.lastError) {
          sendResponse({ error: chrome.runtime.lastError.message });
        } else {
          sendResponse(resp);
        }
      });
    });
    return true;
  }
});
