/**
 * POPUP SCRIPT - Handles UI interactions
 * 
 * Responsibilities:
 * - Display status and controls to user
 * - Send commands to content script via service worker
 * - Show progress and results
 * 
 * NEVER performs heavy computation or DOM manipulation of web pages
 */

console.log('[Manga Upscaler] Popup script loaded');

// UI Elements
const statusEl = document.getElementById('status');
const imageCountEl = document.getElementById('image-count');
const modelStatusEl = document.getElementById('model-status');
const detectBtn = document.getElementById('detect-btn');
const upscaleBtn = document.getElementById('upscale-btn');
const upscaleAllBtn = document.getElementById('upscale-all-btn');
const progressSection = document.getElementById('progress-section');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
const resultSection = document.getElementById('result-section');
const resultText = document.getElementById('result-text');
const errorSection = document.getElementById('error-section');
const errorText = document.getElementById('error-text');

/**
 * Update UI state
 */
function setStatus(text, type = 'normal') {
  statusEl.textContent = text;
  statusEl.className = `value status-${type}`;
}

function setModelStatus(text, loaded = false) {
  modelStatusEl.textContent = text;
  modelStatusEl.className = loaded ? 'value status-success' : 'value status-warning';
}

function showProgress(percent, text = '') {
  progressSection.classList.remove('hidden');
  progressFill.style.width = `${percent}%`;
  progressText.textContent = text || `${percent}%`;
  resultSection.classList.add('hidden');
  errorSection.classList.add('hidden');
}

function hideProgress() {
  progressSection.classList.add('hidden');
}

function showResult(text) {
  hideProgress();
  resultSection.classList.remove('hidden');
  resultText.textContent = text;
  errorSection.classList.add('hidden');
}

function showError(text) {
  hideProgress();
  errorSection.classList.remove('hidden');
  errorText.textContent = text;
  resultSection.classList.add('hidden');
}

function hideMessages() {
  resultSection.classList.add('hidden');
  errorSection.classList.add('hidden');
}

/**
 * Get active tab and send message to content script
 */
async function sendToContentScript(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return chrome.tabs.sendMessage(tab.id, message);
}

/**
 * Detect images on current page
 */
async function detectImages() {
  try {
    setStatus('Detecting images...', 'loading');
    detectBtn.disabled = true;
    hideMessages();
    
    const response = await sendToContentScript({ type: 'DETECT_IMAGES' });
    
    imageCountEl.textContent = response.count;
    
    if (response.count > 0) {
      setStatus('Ready', 'success');
      upscaleBtn.disabled = false;
      upscaleAllBtn.disabled = false;
    } else {
      setStatus('No images found', 'warning');
      upscaleBtn.disabled = true;
      upscaleAllBtn.disabled = true;
    }
    
  } catch (error) {
    console.error('[Manga Upscaler] Detection failed:', error);
    setStatus('Error', 'error');
    showError(`Detection failed: ${error.message}`);
  } finally {
    detectBtn.disabled = false;
  }
}

/**
 * Upscale single image
 */
async function upscaleSingle() {
  try {
    setStatus('Upscaling...', 'loading');
    upscaleBtn.disabled = true;
    upscaleAllBtn.disabled = true;
    hideMessages();
    showProgress(0, 'Preparing...');
    
    // Check if model is loaded
    const modelCheck = await chrome.runtime.sendMessage({ type: 'CHECK_MODEL_STATUS' });
    if (!modelCheck.loaded) {
      showProgress(10, 'Loading AI model...');
      setModelStatus('Loading...', false);
    } else {
      showProgress(20, 'Model ready');
    }
    
    // Start upscaling
    showProgress(30, 'Processing image...');
    const response = await sendToContentScript({ type: 'UPSCALE_SINGLE' });
    
    if (response.success) {
      showProgress(100, 'Complete!');
      setTimeout(() => {
        setStatus('Complete', 'success');
        setModelStatus('Loaded', true);
        showResult('Image upscaled successfully! 🎉');
      }, 500);
    } else {
      throw new Error(response.error || 'Unknown error');
    }
    
  } catch (error) {
    console.error('[Manga Upscaler] Upscale failed:', error);
    setStatus('Error', 'error');
    showError(`Upscale failed: ${error.message}`);
  } finally {
    upscaleBtn.disabled = false;
    upscaleAllBtn.disabled = false;
  }
}

/**
 * Upscale all images (future feature)
 */
async function upscaleAll() {
  showError('Batch upscaling not yet implemented. Coming soon!');
}

/**
 * Initialize popup
 */
async function initialize() {
  try {
    setStatus('Checking...', 'loading');
    
    // Check model status
    const modelStatus = await chrome.runtime.sendMessage({ type: 'CHECK_MODEL_STATUS' });
    if (modelStatus.loaded) {
      setModelStatus('Loaded', true);
    } else {
      setModelStatus('Not loaded', false);
    }
    
    // Auto-detect images on load
    await detectImages();
    
  } catch (error) {
    console.error('[Manga Upscaler] Initialization failed:', error);
    setStatus('Error', 'error');
    showError(`Failed to initialize: ${error.message}`);
  }
}

// Event Listeners
detectBtn.addEventListener('click', detectImages);
upscaleBtn.addEventListener('click', upscaleSingle);
upscaleAllBtn.addEventListener('click', upscaleAll);

// Initialize on load
document.addEventListener('DOMContentLoaded', initialize);
