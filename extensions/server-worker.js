//server worker: a message coordinator which listens for messages from popup and content script

console.log("service worker loaded");

//listen for messages 
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Service Worker received message:", request);
  
  sendResponse({ status: "received" });
});