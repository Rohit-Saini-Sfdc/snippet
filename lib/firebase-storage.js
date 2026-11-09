/**
 * Lightweight, zero-dependency Firebase Storage & GCS Client for Manifest V3.
 * Supports:
 * - Direct upload to Firebase Storage REST API (backed by Google Cloud Storage)
 * - Anonymous Authentication via Identity Toolkit REST API
 * - Download URL generation with download tokens or direct GCS public URLs
 */

export class FirebaseStorageClient {
  constructor(config = {}) {
    this.apiKey = config.apiKey?.trim() || '';
    this.projectId = config.projectId?.trim() || '';
    this.storageBucket = config.storageBucket?.trim() || '';
    this.urlFormat = config.urlFormat || 'firebase'; // 'firebase' or 'gcs'
    this.folder = config.folder || 'snippets';
  }

  /**
   * Validate if minimal config is present
   */
  isValid() {
    return Boolean(this.storageBucket);
  }

  /**
   * Generates a cryptographically random UUID v4
   */
  generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * Generates a short 8-character random ID
   */
  generateShortId() {
    return Math.random().toString(36).substring(2, 10);
  }

  /**
   * Signs in anonymously using Firebase Identity Toolkit REST API.
   * Caches token in chrome.storage.local.
   */
  async getAuthToken() {
    if (!this.apiKey) {
      return null; // Bucket may have open rules or direct GCS rules
    }

    try {
      const stored = await chrome.storage.local.get(['firebaseAuthToken', 'firebaseAuthExpiresAt']);
      const now = Date.now();

      if (stored.firebaseAuthToken && stored.firebaseAuthExpiresAt && stored.firebaseAuthExpiresAt > now + 60000) {
        return stored.firebaseAuthToken;
      }

      const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnSecureToken: true })
      });

      if (!res.ok) {
        console.warn('Anonymous auth failed or not enabled on Firebase project. Continuing without auth token.', await res.text());
        return null;
      }

      const data = await res.json();
      const expiresInMs = (parseInt(data.expiresIn, 10) || 3600) * 1000;
      await chrome.storage.local.set({
        firebaseAuthToken: data.idToken,
        firebaseAuthExpiresAt: now + expiresInMs
      });

      return data.idToken;
    } catch (err) {
      console.warn('Error during anonymous sign-in:', err);
      return null;
    }
  }

  /**
   * Uploads an image blob to Firebase Storage / GCS.
   *
   * @param {Blob|ArrayBuffer} data - Binary image data
   * @param {string} mimeType - e.g. 'image/png' or 'image/webp'
   * @param {string} [extension='png'] - file extension
   * @returns {Promise<{ url: string, path: string, size: number }>}
   */
  async uploadImage(data, mimeType = 'image/png', extension = 'png') {
    if (!this.isValid()) {
      throw new Error('Firebase Storage configuration is missing. Please set your Storage Bucket in Extension Options.');
    }

    // Clean bucket name (remove gs:// or https:// if user pasted with it)
    let cleanBucket = this.storageBucket.replace(/^gs:\/\//, '').replace(/^https?:\/\//, '').replace(/\/$/, '');

    const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const shortId = this.generateShortId();
    const fileName = `snip_${dateStr}_${shortId}.${extension}`;
    const filePath = this.folder ? `${this.folder}/${fileName}` : fileName;
    const downloadToken = this.generateUUID();

    const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(cleanBucket)}/o?name=${encodeURIComponent(filePath)}&uploadType=media`;

    const headers = {
      'Content-Type': mimeType,
      'x-goog-meta-firebaseStorageDownloadTokens': downloadToken,
      'x-goog-meta-source': 'snippet-chrome-extension'
    };

    const authToken = await this.getAuthToken();
    if (authToken) {
      headers['Authorization'] = `Firebase ${authToken}`;
    }

    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers,
      body: data
    });

    if (!response.ok) {
      const errText = await response.text();
      let errorMsg = `Upload failed with status ${response.status} (${response.statusText})`;
      try {
        const parsed = JSON.parse(errText);
        if (parsed.error?.message) {
          errorMsg += `: ${parsed.error.message}`;
        }
      } catch (_) {
        errorMsg += `: ${errText.slice(0, 200)}`;
      }
      throw new Error(errorMsg);
    }

    const result = await response.json();
    const token = result.downloadTokens || downloadToken;

    let finalUrl = '';
    if (this.urlFormat === 'gcs') {
      // Direct GCS public link (requires allUsers: Storage Object Viewer)
      finalUrl = `https://storage.googleapis.com/${cleanBucket}/${filePath}`;
    } else {
      // Standard Firebase Storage permanent download URL
      finalUrl = `https://firebasestorage.googleapis.com/v0/b/${cleanBucket}/o/${encodeURIComponent(filePath)}?alt=media&token=${token}`;
    }

    return {
      url: finalUrl,
      path: filePath,
      size: data.byteLength || data.size || 0
    };
  }

  /**
   * Tests the connection with a tiny 1x1 transparent PNG
   */
  async testConnection() {
    // 1x1 transparent PNG base64
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const binary = atob(pngBase64);
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      array[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([array], { type: 'image/png' });
    return await this.uploadImage(blob, 'image/png', 'png');
  }
}
