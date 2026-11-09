document.addEventListener('DOMContentLoaded', async () => {
  const statusPill = document.getElementById('status-pill');
  const btnCaptureArea = document.getElementById('btn-capture-area');
  const btnCaptureTab = document.getElementById('btn-capture-tab');
  const btnClearHistory = document.getElementById('btn-clear-history');
  const historyList = document.getElementById('history-list');
  const linkOptions = document.getElementById('link-options');

  // Check configuration
  const config = await chrome.storage.sync.get(['storageBucket']);
  if (config.storageBucket) {
    statusPill.textContent = 'Ready';
    statusPill.className = 'status-pill ready';
  } else {
    statusPill.textContent = 'Setup Needed';
    statusPill.className = 'status-pill warning';
    statusPill.title = 'Click to configure Firebase Storage Bucket';
    statusPill.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
  }

  // Trigger Area Capture
  btnCaptureArea.addEventListener('click', async () => {
    chrome.runtime.sendMessage({ action: 'triggerAreaCapture' });
    window.close(); // Close popup so user can drag selection immediately
  });

  // Trigger Tab Capture
  btnCaptureTab.addEventListener('click', async () => {
    chrome.runtime.sendMessage({ action: 'triggerTabCapture' });
    window.close();
  });

  // Open Options page
  linkOptions.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  // Clear History
  btnClearHistory.addEventListener('click', async () => {
    await chrome.storage.local.set({ snippetHistory: [] });
    renderHistory([]);
  });

  // Display OS-specific shortcut badges (Option on Mac, Alt on Windows/Linux)
  if (chrome.commands && chrome.commands.getAll) {
    chrome.commands.getAll((commands) => {
      const isMac = navigator.userAgent.includes('Mac');
      commands.forEach((cmd) => {
        let text = cmd.shortcut;
        if (!text) {
          text = cmd.name === 'capture-area' ? (isMac ? 'Option+Shift+S' : 'Alt+Shift+S') : (isMac ? 'Option+Shift+F' : 'Alt+Shift+F');
        } else if (isMac && text.includes('Alt')) {
          text = text.replace('Alt', 'Option (⌥)');
        }
        if (cmd.name === 'capture-area') {
          const el = document.getElementById('shortcut-area');
          if (el) el.textContent = text;
        } else if (cmd.name === 'capture-tab') {
          const el = document.getElementById('shortcut-tab');
          if (el) el.textContent = text;
        }
      });
    });
  }

  // Load and render history
  const { snippetHistory = [] } = await chrome.storage.local.get(['snippetHistory']);
  renderHistory(snippetHistory);

  function formatRelativeTime(timestamp) {
    const diff = Math.floor((Date.now() - timestamp) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  function renderHistory(items) {
    if (!items || items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No snippets taken yet';
      historyList.replaceChildren(empty);
      return;
    }

    historyList.replaceChildren();
    items.forEach((item) => {
      const el = document.createElement('div');
      el.className = 'history-item';

      const meta = document.createElement('div');
      meta.className = 'history-meta';

      if (item.thumbnail) {
        const img = document.createElement('img');
        img.className = 'history-thumb';
        img.src = item.thumbnail;
        img.alt = 'Thumbnail';
        meta.appendChild(img);
      }

      const info = document.createElement('div');
      info.className = 'history-info';

      const time = document.createElement('span');
      time.className = 'history-time';
      time.textContent = formatRelativeTime(item.timestamp);

      const dims = document.createElement('span');
      dims.className = 'history-dims';
      dims.textContent = item.width && item.height ? `${item.width} × ${item.height} px` : 'Image';

      info.appendChild(time);
      info.appendChild(dims);
      meta.appendChild(info);

      const actions = document.createElement('div');
      actions.className = 'history-actions';

      // Copy button
      const btnCopy = document.createElement('button');
      btnCopy.className = 'icon-btn';
      btnCopy.title = 'Copy URL';
      btnCopy.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
      `;

      btnCopy.addEventListener('click', async () => {
        await navigator.clipboard.writeText(item.url);
        btnCopy.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        `;
        setTimeout(() => {
          btnCopy.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          `;
        }, 1500);
      });

      // Open button
      const btnOpen = document.createElement('button');
      btnOpen.className = 'icon-btn';
      btnOpen.title = 'Open URL in new tab';
      btnOpen.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
          <polyline points="15 3 21 3 21 9"/>
          <line x1="10" y1="14" x2="21" y2="3"/>
        </svg>
      `;
      btnOpen.addEventListener('click', () => {
        chrome.tabs.create({ url: item.url });
      });

      actions.appendChild(btnCopy);
      actions.appendChild(btnOpen);

      el.appendChild(meta);
      el.appendChild(actions);
      historyList.appendChild(el);
    });
  }
});
