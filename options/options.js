import { FirebaseStorageClient } from '../lib/firebase-storage.js';

document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('settings-form');
  const rawConfigInput = document.getElementById('raw-config');
  const btnParseConfig = document.getElementById('btn-parse-config');
  const btnTestConnection = document.getElementById('btn-test-connection');
  const testStatus = document.getElementById('test-status');
  const btnSave = document.getElementById('btn-save');

  const fields = {
    storageBucket: document.getElementById('storageBucket'),
    apiKey: document.getElementById('apiKey'),
    projectId: document.getElementById('projectId'),
    folder: document.getElementById('folder'),
    urlFormat: document.getElementById('urlFormat'),
    imageFormat: document.getElementById('imageFormat'),
    imageQuality: document.getElementById('imageQuality')
  };

  const qualityVal = document.getElementById('quality-val');
  const qualityContainer = document.getElementById('quality-container');

  // Load saved settings
  const saved = await chrome.storage.sync.get([
    'storageBucket',
    'apiKey',
    'projectId',
    'folder',
    'urlFormat',
    'imageFormat',
    'imageQuality'
  ]);

  if (saved.storageBucket) fields.storageBucket.value = saved.storageBucket;
  if (saved.apiKey) fields.apiKey.value = saved.apiKey;
  if (saved.projectId) fields.projectId.value = saved.projectId;
  if (saved.folder) fields.folder.value = saved.folder;
  if (saved.urlFormat) fields.urlFormat.value = saved.urlFormat;
  if (saved.imageFormat) fields.imageFormat.value = saved.imageFormat;
  if (saved.imageQuality) {
    fields.imageQuality.value = saved.imageQuality;
    qualityVal.textContent = `${saved.imageQuality}%`;
  }

  // Handle format toggle (hide quality slider if PNG)
  function updateQualityVisibility() {
    if (fields.imageFormat.value === 'webp') {
      qualityContainer.style.display = 'flex';
    } else {
      qualityContainer.style.display = 'none';
    }
  }

  updateQualityVisibility();
  fields.imageFormat.addEventListener('change', updateQualityVisibility);

  fields.imageQuality.addEventListener('input', (e) => {
    qualityVal.textContent = `${e.target.value}%`;
  });

  // Auto-parse pasted config
  btnParseConfig.addEventListener('click', () => {
    const text = rawConfigInput.value;
    if (!text.trim()) {
      alert('Please paste your Firebase configuration object first.');
      return;
    }

    const extract = (key) => {
      // Matches: key: "value", "key": "value", key: 'value'
      const regex = new RegExp(`["']?${key}["']?\\s*:\\s*["']([^"']+)["']`, 'i');
      const match = text.match(regex);
      return match ? match[1] : '';
    };

    const apiKey = extract('apiKey');
    const projectId = extract('projectId');
    const storageBucket = extract('storageBucket');

    let matched = 0;
    if (apiKey) {
      fields.apiKey.value = apiKey;
      matched++;
    }
    if (projectId) {
      fields.projectId.value = projectId;
      matched++;
    }
    if (storageBucket) {
      fields.storageBucket.value = storageBucket;
      matched++;
    }

    if (matched > 0) {
      testStatus.className = 'test-status success';
      testStatus.textContent = `Auto-filled ${matched} field(s)! Click "Save Settings" below.`;
    } else {
      testStatus.className = 'test-status error';
      testStatus.textContent = 'Could not find Firebase config keys in pasted text.';
    }
  });

  // Save Settings
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const configToSave = {
      storageBucket: fields.storageBucket.value.trim(),
      apiKey: fields.apiKey.value.trim(),
      projectId: fields.projectId.value.trim(),
      folder: fields.folder.value.trim() || 'snippets',
      urlFormat: fields.urlFormat.value,
      imageFormat: fields.imageFormat.value,
      imageQuality: parseInt(fields.imageQuality.value, 10) || 90
    };

    await chrome.storage.sync.set(configToSave);

    btnSave.textContent = 'Settings Saved!';
    btnSave.style.backgroundColor = '#10b981';
    setTimeout(() => {
      btnSave.textContent = 'Save Settings';
      btnSave.style.backgroundColor = '';
    }, 2000);
  });

  // Test Connection
  btnTestConnection.addEventListener('click', async () => {
    const bucket = fields.storageBucket.value.trim();
    if (!bucket) {
      testStatus.className = 'test-status error';
      testStatus.textContent = 'Please enter a Storage Bucket name first.';
      return;
    }

    testStatus.className = 'test-status testing';
    testStatus.textContent = 'Testing connection...';

    const testClient = new FirebaseStorageClient({
      storageBucket: bucket,
      apiKey: fields.apiKey.value.trim(),
      projectId: fields.projectId.value.trim(),
      folder: fields.folder.value.trim() || 'snippets',
      urlFormat: fields.urlFormat.value
    });

    try {
      const result = await testClient.testConnection();
      testStatus.className = 'test-status success';
      testStatus.innerHTML = `Connected! Test upload succeeded: <a href="${result.url}" target="_blank" style="color:#10b981;text-decoration:underline;">View test snippet</a>`;
    } catch (err) {
      console.error('Test error:', err);
      testStatus.className = 'test-status error';
      testStatus.textContent = `Connection failed: ${err.message}`;
    }
  });
});
