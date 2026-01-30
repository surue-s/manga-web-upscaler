//inference worker: loads and runs onnx model
console.log("inference worker loaded");

let session = null;
let modelReady = false;

//load onnx runtime web from cdn
importScripts("https://cdn.jsdelivr.net/npm/onnxruntime-web@1.14.0/dist/ort.min.js");

console.log("onnx runtime loaded");

//initialize: load the model
async function initializeModel() {
  try {
    console.log("loading onnx model...");
    
    //get model url from extension
    const modelUrl = new URL("/models/esrgan_anime_model.onnx", self.location.origin).href;
    console.log("model url:", modelUrl);

    //create inference session
    session = await ort.InferenceSession.create(modelUrl, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all"
    });
    
    console.log("model loaded successfully");
    console.log("input names:", session.inputNames);
    console.log("output names:", session.outputNames);
    
    modelReady = true;
    
    //notify content script that worker is ready
    self.postMessage({ status: "ready" });
  } catch (error) {
    console.error("failed to load model:", error);
    self.postMessage({ status: "error", error: error.message });
  }
}

//run inference on image data
async function runInference(imageData) {
  if (!modelReady) {
    throw new Error("model not ready");
  }
  
  try {
    console.log("running inference...");
    console.log("input shape:", imageData.width, "x", imageData.height);
    
    //convert imagedata to tensor
    const inputTensor = imageDataToTensor(imageData);
    console.log("input tensor shape:", inputTensor.dims);
    
    //run inference
    const feeds = {};
    feeds[session.inputNames[0]] = inputTensor;
    
    const results = await session.run(feeds);
    const outputTensor = results[session.outputNames[0]];
    
    console.log("inference complete");
    console.log("output tensor shape:", outputTensor.dims);
    
    //convert tensor back to image data
    const outputImageData = tensorToImageData(outputTensor);
    
    return outputImageData;
  } catch (error) {
    console.error("inference failed:", error);
    throw error;
  }
}

//convert imagedata to tensor (nchw format, normalized to [0,1])
function imageDataToTensor(imageData) {
  const { width, height, data } = imageData;
  
  //output tensor shape: [1, 3, height, width]
  const tensorData = new Float32Array(1 * 3 * height * width);
  
  //convert rgba to rgb and normalize to [0, 1]
  for (let h = 0; h < height; h++) {
    for (let w = 0; w < width; w++) {
      const pixelIndex = (h * width + w) * 4;
      const tensorIndex = h * width + w;
      
      //red channel
      tensorData[tensorIndex] = data[pixelIndex] / 255.0;
      
      //green channel
      tensorData[height * width + tensorIndex] = data[pixelIndex + 1] / 255.0;
      
      //blue channel
      tensorData[2 * height * width + tensorIndex] = data[pixelIndex + 2] / 255.0;
    }
  }
  
  return new ort.Tensor("float32", tensorData, [1, 3, height, width]);
}

//convert tensor back to imagedata
function tensorToImageData(tensor) {
  const [batch, channels, height, width] = tensor.dims;
  const data = tensor.data;
  
  //create imagedata
  const imageData = new ImageData(width, height);
  
  //convert from nchw to rgba
  for (let h = 0; h < height; h++) {
    for (let w = 0; w < width; w++) {
      const tensorIndex = h * width + w;
      const pixelIndex = (h * width + w) * 4;
      
      //denormalize from [0, 1] to [0, 255] and clamp
      const r = Math.max(0, Math.min(255, data[tensorIndex] * 255));
      const g = Math.max(0, Math.min(255, data[height * width + tensorIndex] * 255));
      const b = Math.max(0, Math.min(255, data[2 * height * width + tensorIndex] * 255));
      
      imageData.data[pixelIndex] = r;
      imageData.data[pixelIndex + 1] = g;
      imageData.data[pixelIndex + 2] = b;
      imageData.data[pixelIndex + 3] = 255; //alpha
    }
  }
  
  return imageData;
}

//listen for messages from content script
self.onmessage = async (event) => {
  console.log("worker received message:", event.data);
  
  const { action, imageData, messageId } = event.data;
  
  switch (action) {
    case "INFERENCE_REQUEST":
      try {
        const result = await runInference(imageData);
        self.postMessage({
          status: "complete",
          messageId: messageId,
          imageData: result
        });
      } catch (error) {
        self.postMessage({
          status: "error",
          messageId: messageId,
          error: error.message
        });
      }
      break;
      
    default:
      console.warn("unknown action:", action);
  }
};

//start loading model
console.log("starting model initialization...");
initializeModel();