(() => {
  // Prevent duplicate overlays
  const existing = document.getElementById('snippet-capture-overlay');
  if (existing) {
    existing.remove();
    return;
  }

  const overlay = document.createElement('div');
  overlay.id = 'snippet-capture-overlay';

  const banner = document.createElement('div');
  banner.id = 'snippet-instruction-banner';
  banner.innerHTML = '<span>Drag to select area</span> <span style="opacity:0.6">•</span> <span>Press <kbd>ESC</kbd> to cancel</span>';

  const selectionBox = document.createElement('div');
  selectionBox.id = 'snippet-selection-box';

  const badge = document.createElement('div');
  badge.id = 'snippet-dimension-badge';
  selectionBox.appendChild(badge);

  overlay.appendChild(banner);
  overlay.appendChild(selectionBox);
  document.documentElement.appendChild(overlay);

  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let currentY = 0;

  function cleanup() {
    window.removeEventListener('keydown', onKeyDown, true);
    overlay.remove();
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      cleanup();
      chrome.runtime.sendMessage({ action: 'captureCancelled' });
    }
  }

  overlay.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // Only left click
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    currentX = e.clientX;
    currentY = e.clientY;

    selectionBox.style.left = `${startX}px`;
    selectionBox.style.top = `${startY}px`;
    selectionBox.style.width = '0px';
    selectionBox.style.height = '0px';
    selectionBox.style.display = 'block';
  });

  overlay.addEventListener('mousemove', (e) => {
    if (!isDragging) return;

    currentX = Math.max(0, Math.min(e.clientX, window.innerWidth));
    currentY = Math.max(0, Math.min(e.clientY, window.innerHeight));

    const left = Math.min(startX, currentX);
    const top = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);

    selectionBox.style.left = `${left}px`;
    selectionBox.style.top = `${top}px`;
    selectionBox.style.width = `${width}px`;
    selectionBox.style.height = `${height}px`;

    badge.textContent = `${Math.round(width)} × ${Math.round(height)} px`;
  });

  overlay.addEventListener('mouseup', (e) => {
    if (!isDragging) return;
    isDragging = false;

    const left = Math.min(startX, currentX);
    const top = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);

    cleanup();

    // Ignore tiny accidental clicks (< 10px)
    if (width < 10 || height < 10) {
      chrome.runtime.sendMessage({ action: 'captureCancelled' });
      return;
    }

    const dpr = window.devicePixelRatio || 1;

    chrome.runtime.sendMessage({
      action: 'areaSelected',
      bounds: {
        x: left,
        y: top,
        width,
        height,
        dpr
      }
    });
  });

  window.addEventListener('keydown', onKeyDown, true);
})();
