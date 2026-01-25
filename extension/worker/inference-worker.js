/**
 * WEB WORKER - ONNX Inference Engine
 * 
 * Responsibilities:
 * - Load ONNX Runtime Web
 * - Load and cache the ONNX model (once per session)
 * - Run inference on input tensors
 * - Return output tensors
 * 
 * Runs in isolated thread - NO DOM access, NO chrome.* APIs
 * Communicates only via postMessage
 */

console.log('[Inference Worker] Worker script loaded');

// ONNX Runtime Web and model session
let ort = null;
let session = null;
let modelLoaded = false;

/**
 * Load ONNX Runtime Web library
 * Uses CDN for simplicity - in production, bundle it locally
 */
async function loadONNXRuntime() {
  try {
    console.log('[Inference Worker] Loading ONNX Runtime Web from CDN...');
    
    // Import ONNX Runtime Web from CDN
    // In production, you should bundle this in lib/ directory
    importScripts('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.0/dist/ort.min.js');
    
    ort = self.ort;
    
    // Configure ONNX Runtime
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.simd = true;
    
    console.log('[Inference Worker] ONNX Runtime Web loaded successfully');
    return true;
    
  } catch (error) {
    console.error('[Inference Worker] Failed to load ONNX Runtime:', error);
    throw new Error(`ONNX Runtime load failed: ${error.message}`);
  }
}

/**
 * Load ONNX model from extension
 * Model is loaded once and cached for subsequent inferences
 */
async function loadModel() {
  try {
    if (modelLoaded && session) {
      console.log('[Inference Worker] Model already loaded');
      return true;
    }
    
    console.log('[Inference Worker] Loading ONNX model...');
    
    // Ensure ONNX Runtime is loaded
    if (!ort) {
      await loadONNXRuntime();
    }
    
    // Get model URL from extension
    // Note: In a real extension, use chrome.runtime.getURL() via message passing
    // For now, we'll need to receive the model data directly
    const modelUrl = '../models/esrgan_anime_model.onnx';
    
    console.log('[Inference Worker] Fetching model from:', modelUrl);
    
    // Fetch model file
    const response = await fetch(modelUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch model: ${response.statusText}`);
    }
    
    const modelBuffer = await response.arrayBuffer();
    console.log(`[Inference Worker] Model fetched: ${(modelBuffer.byteLength / 1024 / 1024).toFixed(2)} MB`);
    
    // Create inference session
    session = await ort.InferenceSession.create(modelBuffer, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all'
    });
    
    console.log('[Inference Worker] Inference session created');
    console.log('[Inference Worker] Model inputs:', session.inputNames);
    console.log('[Inference Worker] Model outputs:', session.outputNames);
    
    modelLoaded = true;
    return true;
    
  } catch (error) {
    console.error('[Inference Worker] Model load failed:', error);
    modelLoaded = false;
    throw new Error(`Model load failed: ${error.message}`);
  }
}

/**
 * Run inference on input tensor
 */
async function runInference(inputTensor, inputDims) {
  try {
    if (!modelLoaded || !session) {
      console.log('[Inference Worker] Model not loaded, loading now...');
      await loadModel();
    }
    
    console.log(`[Inference Worker] Running inference on tensor: ${inputDims}`);
    const startTime = performance.now();
    
    // Create ONNX tensor from Float32Array
    const tensor = new ort.Tensor('float32', new Float32Array(inputTensor), inputDims);
    
    // Run inference
    const feeds = { [session.inputNames[0]]: tensor };
    const results = await session.run(feeds);
    
    const endTime = performance.now();
    console.log(`[Inference Worker] Inference complete in ${(endTime - startTime).toFixed(2)}ms`);
    
    // Extract output tensor
    const outputTensor = results[session.outputNames[0]];
    console.log(`[Inference Worker] Output shape: ${outputTensor.dims}`);
    console.log(`[Inference Worker] Output range: [${outputTensor.data.reduce((a,b) => Math.min(a,b))}, ${outputTensor.data.reduce((a,b) => Math.max(a,b))}]`);
    
    return {
      tensor: Array.from(outputTensor.data), // Convert to regular array for message passing
      outputDims: outputTensor.dims
    };
    
  } catch (error) {
    console.error('[Inference Worker] Inference failed:', error);
    throw new Error(`Inference failed: ${error.message}`);
  }
}

/**
 * Message handler
 */
self.addEventListener('message', async (event) => {
  const { type, payload, messageId } = event.data;
  console.log(`[Inference Worker] Received message: ${type}`);
  
  try {
    if (type === 'LOAD_MODEL') {
      await loadModel();
      self.postMessage({
        type: 'MODEL_LOADED',
        payload: { loaded: true },
        messageId
      });
      
    } else if (type === 'RUN_INFERENCE') {
      const { tensor, dims } = payload;
      const result = await runInference(tensor, dims);
      
      self.postMessage({
        type: 'INFERENCE_COMPLETE',
        payload: result,
        messageId
      });
      
    } else if (type === 'CHECK_STATUS') {
      self.postMessage({
        type: 'STATUS_RESPONSE',
        payload: { modelLoaded, ready: true },
        messageId
      });
      
    } else {
      throw new Error(`Unknown message type: ${type}`);
    }
    
  } catch (error) {
    console.error('[Inference Worker] Error handling message:', error);
    self.postMessage({
      type: type === 'LOAD_MODEL' ? 'MODEL_LOAD_ERROR' : 'INFERENCE_ERROR',
      payload: { error: error.message },
      messageId
    });
  }
});

// Auto-load model on worker initialization
console.log('[Inference Worker] Worker initialized, auto-loading model...');
loadModel()
  .then(() => {
    console.log('[Inference Worker] Model pre-loaded successfully');
    self.postMessage({ type: 'WORKER_READY', payload: { ready: true } });
  })
  .catch((error) => {
    console.error('[Inference Worker] Failed to pre-load model:', error);
    self.postMessage({ type: 'WORKER_READY', payload: { ready: false, error: error.message } });
  });
