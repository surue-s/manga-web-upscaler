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

  switch (request.action0){
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
            return false; //same

            default:
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