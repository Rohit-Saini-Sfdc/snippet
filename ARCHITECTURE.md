# Technical Architecture & Engineering Decisions

This document details the architectural choices, tradeoffs, and implementation patterns used in building the **Snippet** Chrome Extension.

---

## 1. High-Level System Architecture

```
User Action (Shortcut / Popup)
             │
             ▼
   [background.js (Service Worker)]
     │
     ├── 1. Capture pristine visible tab (chrome.tabs.captureVisibleTab)
     │        └── Stored temporarily in chrome.storage.session (persists across SW idles)
     │
     ├── 2. Inject [content/overlay.js] into tab for area selection
     │        └── Uses Shadow DOM & Trusted Types DOM creation
     │        └── User drags crop box -> returns { x, y, width, height, dpr }
     │
     ├── 3. Forward buffer + crop coordinates to [offscreen/offscreen.html]
     │        └── Canvas crops to pixel bounds, converts to PNG/WebP
     │        └── Generates downsampled thumbnail (~2 KB) to protect storage quota
     │
     ├── 4. Upload binary ArrayBuffer via [lib/firebase-storage.js]
     │        └── REST API -> Google Cloud Storage (Firebase Storage)
     │        └── Bearer token auth with automatic refresh token recycling
     │        └── Generates direct capability URL
     │
     ├── 5. Write URL to System Clipboard via offscreen document
     │
     └── 6. Save snippet to local history & show Chrome desktop notification
              └── Persistent top-level notification click listener opens URL
```

---

## 2. Key Engineering Decisions & Tradeoffs

### Decision 1: Manifest V3 Service Worker + Offscreen Document Pattern
* **Context:** Chrome Extensions Manifest V3 migrated background scripts to Service Workers. Service workers lack access to the DOM, HTML `<canvas>`, image rendering engines, and direct `navigator.clipboard` access in headless states.
* **Solution:** Used Chrome's official `chrome.offscreen` API (`offscreen/offscreen.html` + `offscreen.js`) with reasons `['CLIPBOARD', 'BLOBS']`.
* **Benefit:** 
  - Allows full HTML5 Canvas manipulation for pixel-perfect cropping and DPR (Device Pixel Ratio / Retina display) scaling.
  - Guarantees reliable system clipboard writes even when the popup or tab loses focus.

---

### Decision 2: Pre-Overlay Tab Capture Strategy
* **Problem:** If a content script injects a dark backdrop overlay *before* taking the screenshot, calling `chrome.tabs.captureVisibleTab` will photograph the dark overlay, darkening the screenshot or freezing animations.
* **Solution:** 
  1. The background script calls `chrome.tabs.captureVisibleTab` *first* and holds the raw pristine image buffer in memory.
  2. Only then does it inject the overlay script to let the user drag a selection box.
  3. When the user finishes dragging, the background script cuts the sub-rectangle from the *pristine* un-overlayed buffer.
* **Benefit:** The resulting screenshot contains exactly what was on the webpage, without UI contamination, dimmed colors, or visual artifacts.

---

### Decision 3: Zero-Dependency Firebase Storage REST Client vs Heavy NPM SDK
* **Problem:** The official Firebase JS SDK is over 500 KB, requires a Node.js build pipeline (Webpack/Rollup/Vite), and often fails in Manifest V3 service workers due to assumptions about browser runtime environments and IndexedDB connection limits.
* **Solution:** Implemented a lightweight, self-contained REST client (`lib/firebase-storage.js`) leveraging:
  - Google Identity Toolkit REST API (`/v1/accounts:signUp?key=...`) for initial Anonymous Auth.
  - Google Secure Token API (`/v1/token?grant_type=refresh_token`) for silent session renewals.
  - Firebase Storage REST API (`/v0/b/{bucket}/o?name={path}&uploadType=media`) with standard `Authorization: Bearer <token>`.
* **Benefit:**
  - Zero build step required: users can clone the repo and immediately click **Load unpacked** in Chrome.
  - Total library footprint is under 6 KB of clean, readable vanilla JavaScript.
  - Fast execution with standard native `fetch()`.

---

### Decision 4: Device Pixel Ratio (DPR) Retina Scaling
* **Problem:** On high-DPI displays (such as MacBook Retina screens), CSS pixels do not match screen hardware pixels (DPR is typically `2.0`). Cropping using CSS pixels on a retina screenshot would crop the wrong region and produce a blurred or offset image.
* **Solution:** The overlay script captures `window.devicePixelRatio`. The canvas crop processor multiplies `x`, `y`, `width`, and `height` by `dpr`, clamping strictly within natural image bounds.
* **Benefit:** Retina screenshots remain 100% crisp and accurately positioned on all display scaling configurations.

---

### Decision 5: Session Storage Capture Buffer Resilience
* **Problem:** In Manifest V3, background service workers terminate after ~30 seconds of inactivity. If a user spends more than 30 seconds framing an area selection, an in-memory image buffer would be destroyed when Chrome idles the worker.
* **Solution:** Raw captures are keyed by `tabId` and persisted temporarily in `chrome.storage.session`. When `areaSelected` arrives, the buffer is read and cleared immediately.
* **Benefit:** Area captures never fail with "buffer lost" regardless of how long the user takes to select an area.

---

### Decision 6: Shadow DOM UI Isolation & Strict Trusted Types Compliance
* **Problem:** Host web pages with aggressive CSS resets (`* { box-sizing: content-box; }`) or strict Content Security Policies / Trusted Types (e.g. GitHub, Google Cloud Console, Salesforce) distort injected UI or crash scripts assigning to `innerHTML`.
* **Solution:** The selection overlay is mounted in a Shadow Root with encapsulated CSS and elements built entirely via standard DOM APIs (`document.createElement`, `textContent`).
* **Benefit:** Pixel-perfect crop rendering that never breaks on enterprise or security-hardened web applications.

---

### Decision 7: Downsampled Thumbnail Generation
* **Problem:** Storing 25 full-resolution base64 captures in `chrome.storage.local` quickly breaches the browser's 10 MB local storage quota.
* **Solution:** The offscreen processor downsamples captured regions to a dedicated lightweight thumbnail canvas (max 80×60 px, ~2 KB) for gallery history display.
* **Benefit:** Gallery history never crashes or runs out of local storage quota.
