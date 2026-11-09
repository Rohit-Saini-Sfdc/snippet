# Snippet 📸 — Instant Screenshot to Google Cloud Storage

> A lightweight, open-source Google Chrome extension (Manifest V3) that captures screen snippets, uploads them directly to your personal **Google Cloud Storage (via Firebase Storage)** within the **Always Free tier**, and copies an instant, shareable URL directly to your clipboard.

Inspired by Google's internal employee screenshot and snippet tool (`screenshot/`), designed to let you paste clean image links into Google Docs, Notion, Slack, Markdown notes, and PR descriptions instead of pasting heavy raw image files.

---

## ✨ Features

- **Area Selection Crop (`Alt+Shift+S`):** Drag and select any portion of your screen with live pixel dimensions.
- **Full Visible Tab Capture (`Alt+Shift+F`):** Instant single-click capture of the entire visible browser window.
- **Pristine Capture Pipeline:** Captures the tab buffer *before* rendering the crop overlay, guaranteeing zero visual artifacts, dimming, or UI contamination.
- **Direct Short URLs:** Get clean, compact direct image URLs (e.g. `https://storage.googleapis.com/<bucket>/5xn4zytp.png`) ready for immediate viewing and embedding.
- **Automatic Clipboard Copy:** The moment upload finishes, the snippet URL is copied directly to your clipboard.
- **100% Free Forever:** Runs entirely within Google Cloud's **Always Free tier** (5 GB storage, 5,000 uploads/month, 100 GB egress).
- **Public & Unguessable URLs:** Anyone with the link can view the image in documents; strangers cannot list or browse your bucket contents.
- **Image Format Optimization:** Choose between lossless **PNG** or compressed **WebP** with customizable compression quality.
- **Snippet History:** Built-in popup gallery storing your recent snippets with 1-click URL copying and image opening.
- **Zero Heavy Dependencies:** Built with pure vanilla JavaScript and modern Web APIs—no Node.js build step or bundler needed to run.

---

## 🚀 Step-by-Step Setup Guide

Follow these steps once to set up your personal free storage backend:

### Step 1: Set Up Your Free Google Cloud / Firebase Account

1. **Create a Firebase Project:**
   - Go to the [Firebase Console](https://console.firebase.google.com/).
   - Click **Add project** (or **Create a project**).
   - Enter a project name (e.g., `my-snippet-store`).
   - (Optional) Disable Google Analytics to keep things simple.
   - Click **Create project**.

2. **Activate Storage in a Free Tier Region:**
   - In the left sidebar, navigate to **Build** > **Storage** and click **Get started**.
   - If prompted to upgrade to the **Blaze (Pay as you go)** plan, click **Upgrade**. *(Google requires a billing profile to create storage buckets, but the **Always Free tier** remains 100% free up to 5 GB storage and 20,000 uploads/day).*
   - When prompted for a storage location, select one of Google Cloud's **Always Free US regions**:
     - `us-central1` (Iowa - Recommended)
     - `us-east1` (South Carolina)
     - `us-west1` (Oregon)
   - Click **Done**.

3. **Enable Anonymous Authentication:**
   - In the left sidebar, click **Build** > **Authentication**.
   - Click **Get started**, then go to the **Sign-in method** tab.
   - Click **Anonymous**, toggle the switch to **Enable**, and click **Save**.
   *(This allows your extension to securely authenticate uploads without requiring username/password prompts).*

4. **Set Storage Security Rules (Public Read, Authenticated Write):**
   - In the left sidebar, navigate to **Build** > **Storage** > **Rules** tab.
   - Replace the rules with the following:
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
   - Click the **Gear icon (⚙️)** in the top-left sidebar > **Project settings**.
   - Under the **General** tab, scroll down to **Your apps** and click the **`</>` (Web)** icon.
   - App nickname: `Snippet Extension`. (Leave "Firebase Hosting" unchecked).
   - Click **Register app**.
   - Copy the `firebaseConfig` object:
     ```javascript
     const firebaseConfig = {
       apiKey: "AIzaSy...",
       projectId: "my-snippet-store",
       storageBucket: "my-snippet-store.firebasestorage.app"
     };
     ```

6. **(Optional - Recommended) Enable Direct Short GCS URLs:**
   - To get clean, short URLs like `https://storage.googleapis.com/<bucket>/5xn4zytp.png`:
   - Open [Google Cloud Storage Console](https://console.cloud.google.com/storage/browser).
   - Click on your bucket name > **Permissions** tab > **Grant Access**.
   - **New principals:** `allUsers`
   - **Role:** **Cloud Storage** > **Storage Object Viewer**.
   - Click **Save** and confirm public access.

7. **(Optional - Peace of Mind) Set a \$1.00 Budget Email Alert:**
   - Open [Google Cloud Billing Budgets](https://console.cloud.google.com/billing/budgets).
   - Click **Create Budget**.
   - Set Time range to **Monthly**, Budget type to **Specified amount**, Target amount to **`1.00`**.
   - Under Actions, check **Email alerts to billing admins and users**.
   - Click **Finish**. You will be emailed immediately if usage ever reaches \$0.50!

---

### Step 2: Install the Extension in Google Chrome

1. Clone or download this repository:
   ```bash
   git clone https://github.com/Rohit-Saini-Sfdc/snippet.git
   ```
2. Open Google Chrome and enter `chrome://extensions/` in the URL bar.
3. In the top-right corner, toggle **Developer mode** to **ON**.
4. In the top-left corner, click **Load unpacked**.
5. Select the `snippet` folder from this repository.
6. Click the puzzle icon (🧩) in Chrome's toolbar and **pin Snippet** to your bar.

---

### Step 3: Configure the Extension

1. Right-click the **Snippet** camera icon and choose **Options** (or open the popup and click the gear at the bottom).
2. Paste the `firebaseConfig` block you copied into the **Quick Setup** box.
3. Click **Auto-Fill from Pasted Config**.
4. Select your preferred URL and Filename formats:
   - **Snippet Link Format:** *Direct GCS Public URL* (Shortest) or *Firebase Download URL*.
   - **Filename Style:** *Short ID* (e.g. `5xn4zytp.png`).
   - **Storage Folder Prefix:** Leave blank for root or type `s`.
5. Click **Test Connection & Upload**:
   - You should see a green checkmark with a clickable link confirming success!
6. Click **Save Settings**.

---

## ⌨️ How to Use

| Action | Shortcut (Mac / Windows / Linux) | Description |
| :--- | :--- | :--- |
| **Capture Selected Area** | <kbd>Option (Alt)</kbd> + <kbd>Shift</kbd> + <kbd>S</kbd> | Injects crop crosshair. Drag a box and release. |
| **Capture Visible Tab** | <kbd>Option (Alt)</kbd> + <kbd>Shift</kbd> + <kbd>F</kbd> | Immediately captures current tab. |
| **Cancel Capture** | <kbd>ESC</kbd> | Cancels selection overlay without uploading. |
| **Popup Dashboard** | Click toolbar icon | View capture buttons, connection status, and history. |

> [!TIP]
> **Customizing Shortcuts:**
> You can customize these keyboard shortcuts anytime by navigating to `chrome://extensions/shortcuts` in Google Chrome.

---

## 🔒 Security & Privacy Model

- **Capability URLs:** Images are given high-entropy, random IDs (e.g., `snip_2026-10-29_9f8e2bc4.png` or `5xn4zytp.png`).
- **No Directory Listing:** The bucket permissions allow reading specific objects via direct URL, but **bucket listing is disabled**. Strangers or search engines cannot list or discover other images in your bucket.
- **Write-Protected:** Uploads require an authenticated session token generated by your Firebase API key; unauthorized visitors cannot write or overwrite files.
- **Zero Credentials in Code:** All credentials and bucket names are saved strictly inside your local browser storage (`chrome.storage.sync`) and are never committed to git.

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
├── icons/                   # Extension icons (16px, 48px, 128px)
└── ARCHITECTURE.md          # Technical design decisions and tradeoffs
```

---

## 📄 License

MIT License. Free to use, modify, and distribute.
