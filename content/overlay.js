(() => {
  // Prevent duplicate overlays
  const existing = document.getElementById('snippet-overlay-host');
  if (existing) {
    existing.remove();
    return;
  }

  // Shadow DOM host
  const host = document.createElement('div');
  host.id = 'snippet-overlay-host';
  host.style.setProperty('all', 'initial', 'important');
  host.style.setProperty('position', 'fixed', 'important');
  host.style.setProperty('inset', '0', 'important');
  host.style.setProperty('width', '100vw', 'important');
  host.style.setProperty('height', '100vh', 'important');
  host.style.setProperty('z-index', '2147483647', 'important');
  host.style.setProperty('pointer-events', 'auto', 'important');

  const shadow = host.attachShadow({ mode: 'open' });

  // Encapsulated Stylesheet (protects against host page CSS resets and overrides)
  const style = document.createElement('style');
  style.textContent = `
    * {
      box-sizing: border-box !important;
      margin: 0 !important;
      padding: 0 !important;
      -webkit-font-smoothing: antialiased !important;
    }

    #snippet-capture-overlay {
      position: fixed !important;
      inset: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      cursor: crosshair !important;
      user-select: none !important;
      -webkit-user-select: none !important;
      background: rgba(0, 0, 0, 0.35) !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
    }

    #snippet-instruction-banner {
      position: absolute !important;
      top: 24px !important;
      left: 50% !important;
      transform: translateX(-50%) !important;
      background: rgba(20, 20, 25, 0.92) !important;
      color: #ffffff !important;
      padding: 8px 18px !important;
      border-radius: 20px !important;
      font-size: 13px !important;
      font-weight: 500 !important;
      letter-spacing: 0.2px !important;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.15) !important;
      pointer-events: none !important;
      display: flex !important;
      align-items: center !important;
      gap: 8px !important;
      backdrop-filter: blur(8px) !important;
      -webkit-backdrop-filter: blur(8px) !important;
    }

    #snippet-instruction-banner kbd {
      background: rgba(255, 255, 255, 0.2) !important;
      border-radius: 4px !important;
      padding: 2px 6px !important;
      font-size: 11px !important;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
    }

    #snippet-selection-box {
      position: absolute !important;
      border: 2px solid #1a73e8 !important;
      background: rgba(26, 115, 232, 0.08) !important;
      box-shadow: 0 0 0 99999px rgba(0, 0, 0, 0.5) !important;
      pointer-events: none !important;
      display: none;
      border-radius: 2px !important;
    }

    #snippet-dimension-badge {
      position: absolute !important;
      bottom: -28px !important;
      right: 0 !important;
      background: #1a73e8 !important;
      color: #ffffff !important;
      padding: 2px 8px !important;
      border-radius: 4px !important;
      font-size: 11px !important;
      font-weight: 600 !important;
      letter-spacing: 0.3px !important;
      white-space: nowrap !important;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3) !important;
    }
  `;
  shadow.appendChild(style);

  const overlay = document.createElement('div');
  overlay.id = 'snippet-capture-overlay';

  // Construct banner using DOM API to comply strictly with Trusted Types and Content Security Policy
  const banner = document.createElement('div');
  banner.id = 'snippet-instruction-banner';

  const labelSpan = document.createElement('span');
  labelSpan.textContent = 'Drag to select area';

  const dotSpan = document.createElement('span');
  dotSpan.style.opacity = '0.6';
  dotSpan.textContent = '•';

  const escSpan = document.createElement('span');
  escSpan.textContent = 'Press ';
  const kbd = document.createElement('kbd');
  kbd.textContent = 'ESC';
  escSpan.appendChild(kbd);
  escSpan.appendChild(document.createTextNode(' to cancel'));

  banner.appendChild(labelSpan);
  banner.appendChild(dotSpan);
  banner.appendChild(escSpan);

  const selectionBox = document.createElement('div');
  selectionBox.id = 'snippet-selection-box';

  const badge = document.createElement('div');
  badge.id = 'snippet-dimension-badge';
  selectionBox.appendChild(badge);

  overlay.appendChild(banner);
  overlay.appendChild(selectionBox);
  shadow.appendChild(overlay);

  document.documentElement.appendChild(host);

  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let currentY = 0;

  function cleanup() {
    window.removeEventListener('keydown', onKeyDown, true);
    host.remove();
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
