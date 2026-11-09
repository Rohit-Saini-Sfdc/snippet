import { FirebaseStorageClient } from './lib/firebase-storage.js';

let pendingCaptureDataUrl = null;
let creatingOffscreenPromise = null;

// Ensure offscreen document exists for canvas & clipboard operations
async function ensureOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL('offscreen/offscreen.html')]
  });

  if (existingContexts.length > 0) {
    return;
  }

  if (creatingOffscreenPromise) {
    await creatingOffscreenPromise;
    return;
  }

  creatingOffscreenPromise = chrome.offscreen.createDocument({
    url: 'offscreen/offscreen.html',
    reasons: ['CLIPBOARD', 'BLOBS'],
    justification: 'Crop screenshots with Canvas and copy snippet URLs to clipboard'
  });

  await creatingOffscreenPromise;
  creatingOffscreenPromise = null;
}

// Convert data:image/...;base64,... to ArrayBuffer
function dataUrlToArrayBuffer(dataUrl) {
  const base64 = dataUrl.split(',')[1];
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// Show desktop notification
function showNotification(title, message, url = null) {
  const notifId = 'snippet-' + Date.now();
  chrome.notifications.create(notifId, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title,
    message,
    priority: 2
  });

  if (url) {
    const clickListener = (clickedId) => {
      if (clickedId === notifId) {
        chrome.tabs.create({ url });
        chrome.notifications.onClicked.removeListener(clickListener);
      }
    };
    chrome.notifications.onClicked.addListener(clickListener);
  }
}

// Save snippet to recent history
async function saveToHistory(item) {
  try {
    const { snippetHistory = [] } = await chrome.storage.local.get(['snippetHistory']);
    const updated = [item, ...snippetHistory].slice(0, 25);
    await chrome.storage.local.set({ snippetHistory: updated });
  } catch (err) {
    console.warn('Failed to save to history:', err);
  }
}

// Core processing & upload pipeline
async function handleCapturePipeline(rawDataUrl, bounds = null) {
  await ensureOffscreenDocument();

  // Retrieve user configuration
  const config = await chrome.storage.sync.get([
    'storageBucket',
    'apiKey',
    'projectId',
    'folder',
    'urlFormat',
    'imageFormat',
    'imageQuality'
  ]);

  if (!config.storageBucket) {
    showNotification('Snippet Setup Needed', 'Please configure your Firebase Storage Bucket in Extension Options.');
    chrome.runtime.openOptionsPage();
    return;
  }

  const format = config.imageFormat || 'png';
  const quality = config.imageQuality ? config.imageQuality / 100 : 0.92;

  // Process image via offscreen canvas (handles cropping + format conversion)
  const processRes = await chrome.runtime.sendMessage({
    target: 'offscreen',
    action: 'processImage',
    dataUrl: rawDataUrl,
    bounds,
    format,
    quality
  });

  if (!processRes || !processRes.success) {
    throw new Error(processRes?.error || 'Image processing failed');
  }

  showNotification('Uploading Snippet...', 'Sending screenshot to Google Cloud...');

  const client = new FirebaseStorageClient(config);
  const buffer = dataUrlToArrayBuffer(processRes.dataUrl);

  const uploadRes = await client.uploadImage(buffer, processRes.mimeType, format);
  const snippetUrl = uploadRes.url;

  // Copy to system clipboard via offscreen
  await chrome.runtime.sendMessage({
    target: 'offscreen',
    action: 'copyToClipboard',
    text: snippetUrl
  });

  // Save to history with thumbnail
  await saveToHistory({
    url: snippetUrl,
    timestamp: Date.now(),
    width: processRes.width,
    height: processRes.height,
    thumbnail: processRes.dataUrl.length < 500000 ? processRes.dataUrl : null
  });

  showNotification('Snippet Link Copied!', 'Click notification to open in browser: ' + snippetUrl, snippetUrl);
}

// Start full visible tab capture
async function startTabCapture() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
    await handleCapturePipeline(dataUrl, null);
  } catch (err) {
    console.error('Tab capture error:', err);
    showNotification('Capture Error', err.message);
  }
}

// Start area selection crop capture
async function startAreaCapture() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return;

    if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:')) {
      showNotification('Cannot Capture', 'Chrome prohibits injecting capture overlays into browser internal pages.');
      return;
    }

    // Capture the pristine tab BEFORE injecting the overlay
    pendingCaptureDataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });

    // Inject CSS & JS overlay into the active tab
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ['content/overlay.css']
    });

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content/overlay.js']
    });
  } catch (err) {
    console.error('Area capture error:', err);
    showNotification('Area Capture Error', err.message);
  }
}

// Listen for keyboard shortcuts
chrome.commands.onCommand.addListener((command) => {
  if (command === 'capture-area') {
    startAreaCapture();
  } else if (command === 'capture-tab') {
    startTabCapture();
  }
});

// Listen for messages from popup, content scripts, and offscreen
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'triggerAreaCapture') {
    startAreaCapture();
    sendResponse({ started: true });
    return true;
  }

  if (message.action === 'triggerTabCapture') {
    startTabCapture();
    sendResponse({ started: true });
    return true;
  }

  if (message.action === 'captureCancelled') {
    pendingCaptureDataUrl = null;
    return false;
  }

  if (message.action === 'areaSelected') {
    const rawDataUrl = pendingCaptureDataUrl;
    pendingCaptureDataUrl = null;

    if (!rawDataUrl) {
      showNotification('Capture Failed', 'Image buffer was lost. Please try again.');
      return false;
    }

    handleCapturePipeline(rawDataUrl, message.bounds).catch((err) => {
      console.error('Capture pipeline error:', err);
      showNotification('Capture Failed', err.message);
    });

    return false;
  }

  return false;
});
