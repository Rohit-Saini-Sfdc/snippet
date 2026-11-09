# Snippet 📸 — Instant Screenshot to Google Cloud Storage

> A lightweight, open-source Google Chrome extension (Manifest V3) that captures screen snippets, uploads them directly to your personal **Google Cloud Storage (via Firebase Storage)** within the **Always Free tier**, and copies an instant, shareable URL directly to your clipboard.

Inspired by Google's internal employee screenshot and snippet workflow, designed to let you paste clean image links into Google Docs, Markdown notes, PR descriptions, and Slack instead of pasting heavy raw image files.

---

## ✨ Features

- **Area Selection Crop (`Alt+Shift+S`):** Drag and select any portion of your screen with live pixel dimensions.
- **Full Visible Tab Capture (`Alt+Shift+F`):** Instant single-click capture of the entire visible browser window.
- **Pristine Capture Pipeline:** Captures the tab buffer *before* rendering the crop overlay, guaranteeing zero visual artifacts or darkened overlays in your final image.
- **Automatic Clipboard Copy:** The moment upload finishes, the snippet URL is copied directly to your clipboard.
- **100% Free Forever:** Runs on Google Cloud's **Always Free tier** (5 GB storage, 5,000 uploads/month, 100 GB egress).
- **Public & Unguessable URLs:** Anyone with the link can view the image in documents; strangers cannot list or browse your bucket contents.
- **Image Format Optimization:** Choose between lossless **PNG** or compressed **WebP** with customizable compression quality.
- **Snippet History:** Built-in popup gallery storing your recent snippets with 1-click URL copying and image opening.
- **Zero Heavy Dependencies:** Built with pure vanilla JavaScript and modern Web APIs—no Node.js build step or bundler needed to run.

---

## 🚀 Quick Start Guide

### Step 1: Set Up Your Free Google Cloud / Firebase Account

Firebase Storage is Google Cloud Storage under the hood. Following these steps ensures your bucket remains on the **Spark Free Plan (Always Free)**:

1. **Create Firebase Project:**
   - Go to the [Firebase Console](https://console.firebase.google.com/).
   - Click **Add project** (or **Create a project**).
   - Enter a project name (e.g., `my-snippet-store`).
   - (Optional) Disable Google Analytics to keep things simple.
   - Click **Create project**. Your project is automatically created on the **Spark Plan ($0/month)**.

2. **Activate Storage in a Free Tier Region:**
   - In the left sidebar, navigate to **Build** > **Storage**.
   - Click **Get started**.
   - When prompted for a location, select one of Google Cloud's **Always Free US regions**:
     - `us-central1` (Iowa)
     - `us-east1` (South Carolina)
     - `us-west1` (Oregon)
   - Click **Done**.

3. **Enable Anonymous Authentication:**
   - In the left sidebar, click **Build** > **Authentication**.
   - Click **Get started**, then go to the **Sign-in method** tab.
   - Click **Anonymous**, toggle the switch to **Enable**, and click **Save**.
   *(This allows the extension to authenticate uploads without requiring username/password prompts).*

4. **Set Storage Security Rules (Public Read, Authenticated Write):**
   - In the left sidebar, navigate back to **Build** > **Storage** > **Rules** tab.
   - Replace the default rules with the following:
     ```javascript
     rules_version = '2';
     service firebase.storage {
       match /b/{bucket}/o {
         match /{allPaths=**} {
           // Anyone with the link can view/embed the image in docs
           allow read: if true;
           // Only your extension (using anonymous auth) can upload
           allow write: if request.auth != null;
         }
       }
     }
     ```
   - Click **Publish**.

5. **Register Web App & Copy Configuration:**
   - Click the **Gear icon (⚙️)** in the sidebar > **Project settings**.
   - Under the **General** tab, scroll down to **Your apps** and click the **`</>` (Web)** icon.
   - App nickname: `Snippet Extension`. (Leave "Firebase Hosting" unchecked).
   - Click **Register app**.
   - Under **Firebase SDK snippet**, select **Config** and copy the `firebaseConfig` block:
     ```javascript
     const firebaseConfig = {
       apiKey: "AIzaSy...",
       authDomain: "my-snippet-store.firebaseapp.com",
       projectId: "my-snippet-store",
       storageBucket: "my-snippet-store.firebasestorage.app",
       messagingSenderId: "...",
       appId: "..."
     };
     ```

---

### Step 2: Install the Extension in Google Chrome

1. Clone or download this repository to your computer:
   ```bash
   git clone https://github.com/YOUR_USERNAME/snippet.git
   ```
2. Open Google Chrome and enter `chrome://extensions/` in the address bar.
3. In the top-right corner, toggle **Developer mode** to **ON**.
4. In the top-left corner, click **Load unpacked**.
5. Select the `snippet` folder from this repository.
6. The **Snippet** icon will now appear in your Chrome toolbar. Click the puzzle icon to pin it!

---

### Step 3: Configure the Extension

1. Right-click the **Snippet** extension icon and choose **Options** (or click the Settings gear inside the extension popup).
2. Paste the `firebaseConfig` code block you copied from Firebase into the **Quick Setup** text box.
3. Click **Auto-Fill from Pasted Config**.
4. Click **Test Connection & Upload**:
   - You should see a green success message with a link to a test snippet!
5. Click **Save Settings**.

---

## ⌨️ How to Use

| Action | Shortcut (Mac / Windows / Linux) | Description |
| :--- | :--- | :--- |
| **Capture Selected Area** | <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>S</kbd> | Injects crop crosshair. Drag a box and release. |
| **Capture Visible Tab** | <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>F</kbd> | Immediately captures current tab. |
| **Cancel Capture** | <kbd>ESC</kbd> | Cancels selection overlay without uploading. |
| **Popup Dashboard** | Click toolbar icon | View capture buttons, connection status, and history. |

> [!TIP]
> **Customizing Shortcuts:**
> You can customize these keyboard shortcuts anytime by navigating to `chrome://extensions/shortcuts` in Google Chrome.

---

## 🔒 Security & Privacy Model

- **Capability URLs:** Images are given high-entropy, cryptographically random names (e.g., `snip_2026-10-29_9f8e2bc4.png`).
- **No Directory Listing:** The bucket permissions allow reading specific objects via direct URL, but **bucket listing is disabled**. No stranger or search engine can list or discover other images in your bucket.
- **Write-Protected:** Uploads require an authenticated session token generated by your Firebase API key; unauthorized visitors cannot write or overwrite files.

---

## 📊 Google Cloud Always Free Tier Limits

| Metric | Always Free Allocation | Typical Usage |
| :--- | :--- | :--- |
| **Cloud Storage** | **5 GB-months** (US regions) | ~25,000 to 50,000 screenshots |
| **Uploads (Class A)** | **5,000 operations / month** | ~160 screenshots / day |
| **Views (Class B)** | **50,000 operations / month** | ~1,600 views / day |
| **Network Egress** | **100 GB / month** | Thousands of document views |

---

## 🛠 Project Structure

```
snippet/
├── manifest.json            # Manifest V3 extension configuration
├── background.js            # Background service worker (pipeline coordination)
├── lib/
│   └── firebase-storage.js  # Zero-dependency Firebase Storage & Auth REST client
├── content/
│   ├── overlay.js           # Area selection drag & crop logic
│   └── overlay.css          # Selection overlay styling
├── offscreen/
│   ├── offscreen.html       # Offscreen DOM container
│   └── offscreen.js         # Canvas cropping & clipboard writer
├── popup/
│   ├── popup.html           # Toolbar popup interface
│   ├── popup.js             # UI events & snippet history
│   └── popup.css            # Modern dark-mode popup styles
├── options/
│   ├── options.html         # Settings & setup guide dashboard
│   ├── options.js           # Config auto-parser & connection tester
│   └── options.css          # Options page stylesheet
└── icons/                   # Extension icons (16px, 48px, 128px)
```

---

## 📄 License

MIT License. Free to use, modify, and distribute.
