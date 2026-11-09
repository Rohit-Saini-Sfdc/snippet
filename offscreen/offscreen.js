/**
 * Offscreen script for Canvas image manipulation & clipboard access in Manifest V3.
 */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen') {
    return false;
  }

  if (message.action === 'processImage') {
    handleProcess(message)
      .then((res) => sendResponse({ success: true, ...res }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // Keep message channel open for async response
  }

  if (message.action === 'copyToClipboard') {
    handleCopy(message.text)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  return false;
});

async function handleProcess({ dataUrl, bounds, format = 'png', quality = 0.92 }) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.getElementById('crop-canvas');
        const ctx = canvas.getContext('2d');

        let sx = 0;
        let sy = 0;
        let sWidth = img.naturalWidth;
        let sHeight = img.naturalHeight;

        if (bounds) {
          const dpr = bounds.dpr || 1;
          sx = Math.round(bounds.x * dpr);
          sy = Math.round(bounds.y * dpr);
          sWidth = Math.round(bounds.width * dpr);
          sHeight = Math.round(bounds.height * dpr);

          // Clamp within bounds
          sx = Math.max(0, Math.min(sx, img.naturalWidth));
          sy = Math.max(0, Math.min(sy, img.naturalHeight));
          sWidth = Math.min(sWidth, img.naturalWidth - sx);
          sHeight = Math.min(sHeight, img.naturalHeight - sy);
        }

        canvas.width = sWidth;
        canvas.height = sHeight;

        ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);

        const mimeType = format === 'webp' ? 'image/webp' : 'image/png';
        const processedDataUrl = canvas.toDataURL(mimeType, quality);

        // Generate tiny downsampled thumbnail for history (max 80x60, ~2KB) to prevent storage quota exhaustion
        let thumbnailDataUrl = null;
        try {
          const thumbCanvas = document.createElement('canvas');
          const thumbCtx = thumbCanvas.getContext('2d');
          const thumbScale = Math.min(80 / sWidth, 60 / sHeight, 1);
          const tWidth = Math.max(1, Math.round(sWidth * thumbScale));
          const tHeight = Math.max(1, Math.round(sHeight * thumbScale));

          thumbCanvas.width = tWidth;
          thumbCanvas.height = tHeight;
          thumbCtx.drawImage(canvas, 0, 0, tWidth, tHeight);
          thumbnailDataUrl = thumbCanvas.toDataURL('image/jpeg', 0.7);
        } catch (thumbErr) {
          console.warn('Failed to generate thumbnail:', thumbErr);
        }

        resolve({
          dataUrl: processedDataUrl,
          thumbnailDataUrl,
          width: sWidth,
          height: sHeight,
          mimeType,
          format
        });
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error('Failed to load captured image into Canvas.'));
    img.src = dataUrl;
  });
}

async function handleCopy(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch (err) {
    console.warn('navigator.clipboard failed, attempting execCommand fallback:', err);
  }

  // Fallback
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const successful = document.execCommand('copy');
  textarea.remove();

  if (!successful) {
    throw new Error('Clipboard copy command was rejected');
  }
}
