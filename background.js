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

// Clean up session storage notification entries when notifications are closed/dismissed
chrome.notifications.onClosed.addListener(async (notifId) => {
  try {
    await chrome.storage.session.remove([`notif_${notifId}`]);
  } catch (_) {}
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

// Show in-page floating toast inside the active tab
async function showInPageToast(tabId, state, snippetUrl = null, errorText = null) {
  if (!tabId) return false;
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: (state, url, err) => {
        let host = document.getElementById('snippet-toast-host');
        if (!host) {
          host = document.createElement('div');
          host.id = 'snippet-toast-host';
          host.style.setProperty('all', 'initial', 'important');
          host.style.setProperty('position', 'fixed', 'important');
          host.style.setProperty('top', '24px', 'important');
          host.style.setProperty('left', '50%', 'important');
          host.style.setProperty('transform', 'translateX(-50%)', 'important');
          host.style.setProperty('z-index', '2147483647', 'important');
          host.style.setProperty('pointer-events', 'auto', 'important');

          const shadow = host.attachShadow({ mode: 'open' });
          const style = document.createElement('style');
          style.textContent = `
            * { box-sizing: border-box !important; margin: 0 !important; padding: 0 !important; }
            .toast {
              display: flex;
              align-items: center;
              gap: 10px;
              background: rgba(18, 19, 23, 0.96);
              color: #ffffff;
              padding: 9px 18px;
              border-radius: 30px;
              box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.15);
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              font-size: 13px;
              font-weight: 500;
              letter-spacing: 0.1px;
              backdrop-filter: blur(12px);
              -webkit-backdrop-filter: blur(12px);
              animation: snippetSlideDown 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
              user-select: none;
            }
            .toast.copied {
              border-color: rgba(16, 185, 129, 0.4);
            }
            .toast.warning {
              border-color: rgba(245, 158, 11, 0.4);
            }
            .badge-icon {
              width: 18px;
              height: 18px;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 11px;
              font-weight: 700;
              flex-shrink: 0;
            }
            .badge-icon.success {
              background: #10b981;
              color: #ffffff;
            }
            .badge-icon.warning {
              background: #f59e0b;
              color: #ffffff;
            }
            .badge-icon.uploading {
              background: #3b82f6;
              color: #ffffff;
              font-size: 13px;
              animation: snippetSpin 1s linear infinite;
            }
            .badge-icon.error {
              background: #ef4444;
              color: #ffffff;
            }
            .btn-view {
              background: rgba(255, 255, 255, 0.15);
              color: #ffffff;
              border: 1px solid rgba(255, 255, 255, 0.25);
              border-radius: 12px;
              padding: 2px 10px;
              font-size: 11px;
              font-weight: 600;
              cursor: pointer;
              margin-left: 6px;
              text-decoration: none;
              transition: background 0.15s ease;
            }
            .btn-view:hover {
              background: rgba(255, 255, 255, 0.3);
            }
            @keyframes snippetSlideDown {
              from { opacity: 0; transform: translateY(-18px) scale(0.96); }
              to { opacity: 1; transform: translateY(0) scale(1); }
            }
            @keyframes snippetSpin {
              100% { transform: rotate(360deg); }
            }
          `;
          shadow.appendChild(style);
          document.documentElement.appendChild(host);
        }

        // Clear any stale removal timer from an earlier capture so it doesn't remove this toast prematurely
        if (host._removeTimer) {
          clearTimeout(host._removeTimer);
          host._removeTimer = null;
        }

        // Reset visibility styling in case an earlier toast was fading out
        host.style.opacity = '1';
        host.style.transform = 'translateX(-50%)';

        const shadow = host.shadowRoot;
        let toast = shadow.querySelector('.toast');
        if (!toast) {
          toast = document.createElement('div');
          toast.className = 'toast';
          shadow.appendChild(toast);
        }

        toast.replaceChildren();

        const icon = document.createElement('div');
        icon.className = 'badge-icon';

        const label = document.createElement('span');

        if (state === 'uploading') {
          toast.className = 'toast';
          icon.className = 'badge-icon uploading';
          icon.textContent = '↻';
          label.textContent = 'Uploading snippet to Google Cloud...';
          toast.appendChild(icon);
          toast.appendChild(label);

          // 25-second fallback auto-dismiss prevents stuck toast if network hangs
          host._removeTimer = setTimeout(() => {
            if (host?.parentNode) host.remove();
          }, 25000);
        } else if (state === 'copied') {
          toast.className = 'toast copied';
          icon.className = 'badge-icon success';
          icon.textContent = '✓';

          const isMac = (navigator.platform || navigator.userAgent).toLowerCase().includes('mac');
          label.textContent = `Link copied to clipboard! (${isMac ? 'Cmd+V' : 'Ctrl+V'})`;
          toast.appendChild(icon);
          toast.appendChild(label);

          if (url) {
            const btn = document.createElement('button');
            btn.className = 'btn-view';
            btn.textContent = 'View';
            btn.addEventListener('click', () => window.open(url, '_blank', 'noopener,noreferrer'));
            toast.appendChild(btn);
          }

          host._removeTimer = setTimeout(() => {
            if (host && host.parentNode) {
              host.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
              host.style.opacity = '0';
              host.style.transform = 'translateX(-50%) translateY(-10px)';
              setTimeout(() => host.remove(), 260);
            }
          }, 3200);
        } else if (state === 'upload_only') {
          // Upload succeeded, but clipboard copy failed
          toast.className = 'toast warning';
          icon.className = 'badge-icon warning';
          icon.textContent = '✓';
          label.textContent = 'Snippet uploaded (copy to clipboard failed)';
          toast.appendChild(icon);
          toast.appendChild(label);

          if (url) {
            const btn = document.createElement('button');
            btn.className = 'btn-view';
            btn.textContent = 'View';
            btn.addEventListener('click', () => window.open(url, '_blank', 'noopener,noreferrer'));
            toast.appendChild(btn);
          }

          host._removeTimer = setTimeout(() => {
            if (host?.parentNode) host.remove();
          }, 6000);
        } else if (state === 'error') {
          toast.className = 'toast';
          icon.className = 'badge-icon error';
          icon.textContent = '!';
          label.textContent = err || 'Upload failed';
          toast.appendChild(icon);
          toast.appendChild(label);
          host._removeTimer = setTimeout(() => {
            if (host?.parentNode) host.remove();
          }, 4000);
        }
        return true;
      },
      args: [state, snippetUrl, errorText]
    });
    return Boolean(results && results.length > 0 && results[0].result);
  } catch (_) {
    return false;
  }
}

// Core processing & upload pipeline
async function handleCapturePipeline(rawDataUrl, bounds = null, tabId = null) {
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

  // Show immediate in-page uploading toast
  const hasToast = await showInPageToast(tabId, 'uploading');

  try {
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

    const client = new FirebaseStorageClient(config);
    const buffer = await dataUrlToArrayBuffer(processRes.dataUrl);

    const uploadRes = await client.uploadImage(buffer, processRes.mimeType, format);
    const snippetUrl = uploadRes.url;

    // Copy to system clipboard via offscreen
    let copySuccess = false;
    try {
      const copyRes = await chrome.runtime.sendMessage({
        target: 'offscreen',
        action: 'copyToClipboard',
        text: snippetUrl
      });
      copySuccess = Boolean(copyRes?.success);
    } catch (copyErr) {
      console.warn('Clipboard copy message failed:', copyErr);
    }

    // Save to history using lightweight thumbnail (~2KB)
    await saveToHistory({
      url: snippetUrl,
      timestamp: Date.now(),
      width: processRes.width,
      height: processRes.height,
      thumbnail: processRes.thumbnailDataUrl || null
    });

    if (copySuccess) {
      await showInPageToast(tabId, 'copied', snippetUrl);
    } else {
      await showInPageToast(tabId, 'upload_only', snippetUrl);
    }

    // Only show desktop notification if in-page toast could NOT be displayed (e.g. internal pages)
    if (!hasToast) {
      await showNotification(
        copySuccess ? 'Snippet Link Copied!' : 'Snippet Uploaded!',
        copySuccess ? 'Click notification to open in browser: ' + snippetUrl : 'Click to open snippet: ' + snippetUrl,
        snippetUrl
      );
    }
  } catch (err) {
    console.error('Capture pipeline error:', err);
    await showInPageToast(tabId, 'error', null, err.message);
    if (!hasToast) {
      await showNotification('Capture Failed', err.message);
    }
  }
}

// Check if URL is restricted by Chrome's extension security policies
function isRestrictedUrl(url) {
  if (!url) return false;
  return (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('edge://') ||
    url.startsWith('about:') ||
    url.startsWith('view-source:') ||
    url.includes('chromewebstore.google.com') ||
    url.includes('chrome.google.com/webstore')
  );
}

// Start full visible tab capture
async function startTabCapture() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return;

    if (isRestrictedUrl(tab.url)) {
      await showNotification('Cannot Capture', 'Chrome prohibits capturing internal browser and web store pages.');
      return;
    }

    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
    await handleCapturePipeline(dataUrl, null, tab.id);
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

    if (isRestrictedUrl(tab.url)) {
      await showNotification('Cannot Capture', 'Chrome prohibits injecting capture overlays into this page.');
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
    // 150ms timeout ensures popup and drop-shadow window close fully before capturing visible tab
    setTimeout(startAreaCapture, 150);
    sendResponse({ started: true });
    return true;
  }

  if (message.action === 'triggerTabCapture') {
    // 150ms timeout ensures popup closes fully before capturing visible tab
    setTimeout(startTabCapture, 150);
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

        await handleCapturePipeline(rawDataUrl, message.bounds, tabId);
      } catch (err) {
        console.error('Capture pipeline error:', err);
        await showNotification('Capture Failed', err.message);
      }
    })();

    return false;
  }

  return false;
});
