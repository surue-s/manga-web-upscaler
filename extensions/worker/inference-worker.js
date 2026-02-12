// inference-worker.js
// Bare minimum: load local ONNX runtime, load model, run inference.
// No chrome.* APIs — all URLs passed in via messages.

let session = null;

// Load bundled ONNX Runtime (relative to this worker file)
importScripts("../libs/ort.min.js");
console.log("[worker] onnxruntime loaded");

// Tell ORT where to find wasm files (relative to worker)
ort.env.wasm.wasmPaths = "../libs/";

async function loadModel(modelUrl) {
  console.log("[worker] loading model from:", modelUrl);
  try {
    session = await ort.InferenceSession.create(modelUrl, {
      executionProviders: ["wasm"],
    });
    console.log("[worker] model loaded");
    console.log("[worker] inputs:", session.inputNames);
    console.log("[worker] outputs:", session.outputNames);
    return true;
  } catch (err) {
    console.error("[worker] FAILED to load model:", err);
    return false;
  }
}

function pixelsToTensor(imgData) {
  const { width, height, data } = imgData;
  const n = height * width;
  const f = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    f[i]         = data[i * 4]     / 255; // R
    f[n + i]     = data[i * 4 + 1] / 255; // G
    f[2 * n + i] = data[i * 4 + 2] / 255; // B
  }
  return new ort.Tensor("float32", f, [1, 3, height, width]);
}

function tensorToPixels(tensor) {
  const [, , h, w] = tensor.dims;
  const d = tensor.data;
  const n = h * w;
  const out = new Uint8ClampedArray(4 * n);
  for (let i = 0; i < n; i++) {
    out[i * 4]     = Math.min(255, Math.max(0, d[i] * 255));
    out[i * 4 + 1] = Math.min(255, Math.max(0, d[n + i] * 255));
    out[i * 4 + 2] = Math.min(255, Math.max(0, d[2 * n + i] * 255));
    out[i * 4 + 3] = 255;
  }
  return { width: w, height: h, data: Array.from(out) };
}

async function runInference(imgData) {
  if (!session) throw new Error("model not loaded yet");
  console.log("[worker] inference on", imgData.width, "x", imgData.height);
  const input = pixelsToTensor(imgData);
  const feeds = {};
  feeds[session.inputNames[0]] = input;
  const t0 = performance.now();
  const results = await session.run(feeds);
  console.log("[worker] inference took", ((performance.now() - t0) / 1000).toFixed(1), "s");
  const output = results[session.outputNames[0]];
  console.log("[worker] output shape:", output.dims);
  return tensorToPixels(output);
}

// Only two messages: LOAD_MODEL and RUN
self.onmessage = async (e) => {
  const { action } = e.data;
  console.log("[worker] got:", action);

  if (action === "LOAD_MODEL") {
    const ok = await loadModel(e.data.modelUrl);
    self.postMessage({ action: "MODEL_STATUS", ready: ok });
  }

  if (action === "RUN") {
    try {
      const result = await runInference(e.data.imageData);
      self.postMessage({ action: "RESULT", imageData: result });
    } catch (err) {
      console.error("[worker] error:", err);
      self.postMessage({ action: "ERROR", error: err.message });
    }
  }
};

