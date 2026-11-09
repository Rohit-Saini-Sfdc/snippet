import { FirebaseStorageClient } from './lib/firebase-storage.js';

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

  try {
    creatingOffscreenPromise = chrome.offscreen.createDocument({
      url: 'offscreen/offscreen.html',
      reasons: ['CLIPBOARD', 'BLOBS'],
      justification: 'Crop screenshots with Canvas and copy snippet URLs to clipboard'
    });
    await creatingOffscreenPromise;
  } finally {
    creatingOffscreenPromise = null;
  }
}

// Convert data:image/...;base64,... to ArrayBuffer asynchronously without blocking SW thread
async function dataUrlToArrayBuffer(dataUrl) {
  const res = await fetch(dataUrl);
  return await res.arrayBuffer();
}

// Top-level notification click listener (persists across service worker restarts)
chrome.notifications.onClicked.addListener(async (notifId) => {
  try {
    const key = `notif_${notifId}`;
    const data = await chrome.storage.session.get([key]);
    const url = data[key];
    if (url) {
      await chrome.tabs.create({ url });
      await chrome.storage.session.remove([key]);
    }
  } catch (err) {
    console.warn('Error opening notification URL:', err);
  }
});

// Show desktop notification and persist URL in session storage
async function showNotification(title, message, url = null) {
  const notifId = 'snippet-' + Date.now();
  chrome.notifications.create(notifId, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title,
    message,
    priority: 2
  });

  if (url) {
    await chrome.storage.session.set({ [`notif_${notifId}`]: url });
  }
}

// Save snippet to recent history (stores downsampled thumbnail to avoid storage quota exhaustion)
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
    'filenameStyle',
    'urlFormat',
    'imageFormat',
    'imageQuality'
  ]);

  if (!config.storageBucket) {
    await showNotification('Snippet Setup Needed', 'Please configure your Firebase Storage Bucket in Extension Options.');
    chrome.runtime.openOptionsPage();
    return;
  }

  const format = config.imageFormat || 'png';
  const quality = config.imageQuality ? config.imageQuality / 100 : 0.92;

  // Process image via offscreen canvas (handles cropping, format conversion, and thumbnail generation)
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

  await showNotification('Uploading Snippet...', 'Sending screenshot to Google Cloud...');

  const client = new FirebaseStorageClient(config);
  const buffer = await dataUrlToArrayBuffer(processRes.dataUrl);

  const uploadRes = await client.uploadImage(buffer, processRes.mimeType, format);
  const snippetUrl = uploadRes.url;

  // Copy to system clipboard via offscreen
  await chrome.runtime.sendMessage({
    target: 'offscreen',
    action: 'copyToClipboard',
    text: snippetUrl
  });

  // Save to history using lightweight thumbnail (~2KB)
  await saveToHistory({
    url: snippetUrl,
    timestamp: Date.now(),
    width: processRes.width,
    height: processRes.height,
    thumbnail: processRes.thumbnailDataUrl || null
  });

  await showNotification('Snippet Link Copied!', 'Click notification to open in browser: ' + snippetUrl, snippetUrl);
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
    await showNotification('Capture Error', err.message);
  }
}

// Start area selection crop capture
async function startAreaCapture() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return;

    if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:')) {
      await showNotification('Cannot Capture', 'Chrome prohibits injecting capture overlays into browser internal pages.');
      return;
    }

    // Capture the pristine tab BEFORE injecting the overlay
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });

    // Store in chrome.storage.session keyed by tabId so SW idle/restart does not lose the buffer
    await chrome.storage.session.set({ [`capture_${tab.id}`]: dataUrl });

    // Inject self-contained Shadow DOM overlay script into the active tab
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content/overlay.js']
    });
  } catch (err) {
    console.error('Area capture error:', err);
    await showNotification('Area Capture Error', err.message);
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
    if (sender?.tab?.id) {
      chrome.storage.session.remove([`capture_${sender.tab.id}`]);
    }
    return false;
  }

  if (message.action === 'areaSelected') {
    (async () => {
      try {
        const tabId = sender?.tab?.id;
        let rawDataUrl = null;

        if (tabId) {
          const key = `capture_${tabId}`;
          const stored = await chrome.storage.session.get([key]);
          rawDataUrl = stored[key];
          await chrome.storage.session.remove([key]);
        }

        if (!rawDataUrl) {
          await showNotification('Capture Failed', 'Image buffer was lost. Please try again.');
          return;
        }

        await handleCapturePipeline(rawDataUrl, message.bounds);
      } catch (err) {
        console.error('Capture pipeline error:', err);
        await showNotification('Capture Failed', err.message);
      }
    })();

    return false;
  }

  return false;
});
