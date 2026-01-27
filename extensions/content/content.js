// Minimal content script
console.log('Content script loaded on:', location.href);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	sendResponse({ ok: true });
});
console.log("content script loaded on" , window.location.href);

//listening for messages from the service worker
chrome.runtime.onMessage.addListener ((request, sender, sendResponse) => {
console.log("content script received", request);
sendResponse({status: "received"});
});