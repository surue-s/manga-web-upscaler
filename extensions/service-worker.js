//service worekr: message corrdinater between popup and content script./ 
console.log('Service Worker loaded');

//track model status
let modelReady = false;

//listen here for extension installs and updates
chrome.runtime.onInstalled.addListener((details) => {
  console.log('extension updated', details.reason);

  if (details.reason === "install"){
    console.log('extension installed');
  }
   else if (details.reason === "update"){
    console.log('extension updated');
   }
});


//listen for messages from the popup or the content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('message received', request);

  //handle different types of messages

  switch (request.action){
    case "CHECK_MODEL_STATUS":
      handleCheckModelStatus(request, sender, sendResponse);
      return true; //keep channel open for async responses

      case "MODEL_LOADED":
        handleCheckModelLoaded(request, sender, sendResponse);
        return false;

        case "DETECT_IMAGES":
          handleDetectImages(request, sender, sendResponse);
          return true; //ksame as up

          case "UPSCALE_SINGLE_IMAGE":
            handleUpscaleImage(request, sender, sendResponse);
        return true; //same
              console.log('unknown message', request.action);
              sendResponse({ error: 'unknown message'});
              return false;
  }
});


//handler; check if model is loaded
function handleCheckModelStatus(request, sender, sendResponse) {
  console.log('checking model status', modelReady);
  sendResponse({ modelReady: modelReady });
}

//handler model loaded message
function handleCheckModelLoaded(request, sender, sendResponse) {
  console.log('model loaded yeyay');
  modelReady = true;
}

//handler to detect images on the page. 
function handleDetectImages(request, sender, sendResponse){
  console.log('forward detect_images to the content script');
 

  //get active tab
  chrome.tabs.query ({active: true, currentWindow: true}, (tabs) => {
    if(tabs.length === 0){
      sendResponse({ error: 'no active tab'});
      return;
  
    }

    //forward essage to content script
    chrome.tabs.sendMessage(
    tabs[0].id,
    {action: "DETECT_IMAGES"},
    (response) => {
      if(chrome.runtime.lastError){
        console.error('[Service Worker] Error forwarding to content script:', chrome.runtime.lastError);
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        console.log('[Service Worker] Received response from content script:', response);
        sendResponse(response);
      }
    }
  );
});
}


//handler to upscale images
function handleUpscaleImage(request, sender, sendResponse){
  console.log("forwwardin UPSCALE_SINGLE_IMAGE to the content script");

  //get the active tab

  chrome.tabs.query ({active: true, currentWindow: true}, (tabs) => { 
    if(tabs.length === 0){
      sendResponse({ error: 'no active tab'});
      return;
    }

    //forward message to content script
    chrome.tabs.sendMessage(
      tabs[0].id,
      {action: "UPSCALE_SINGLE_IMAGE"},
      (response)=> {
        if (chrome.runtime.lastError){
          console.error("error in forwarding to content script", chrome.runtime.lastError);
          sendResponse({ error: chrome.runtime.lastError.message});
        }
         else {
          console.log("[Service Worker] Received response from content script:", response);
          sendResponse(response);

         }
      }
    )
});
}

console.log("service worker setup complete");
