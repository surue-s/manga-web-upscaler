// Minimal MV3 service worker
console.log('Service Worker loaded');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Acknowledge messages so background script is valid
  sendResponse({ ok: true });
});
