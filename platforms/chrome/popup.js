/**
 * Chrome Extension Popup Script
 */

// Get references to DOM elements
const statusEl = document.getElementById('status');
const configDetailsEl = document.getElementById('config-details');
const openPlayerBtn = document.getElementById('openPlayer');
const openSetupBtn = document.getElementById('openSetup');
const versionEl = document.getElementById('version');

// Set version
versionEl.textContent = chrome.runtime.getManifest().version;

// Check configuration status
async function checkConfig() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getConfig' }, (config) => {
      resolve(config);
    });
  });
}

// Update UI based on configuration
async function updateUI() {
  const config = await checkConfig();

  if (config && config.cmsAddress && config.hardwareKey) {
    statusEl.className = 'status configured';
    statusEl.textContent = '✓ Configured and ready';

    // Show config details
    configDetailsEl.style.display = 'block';
    configDetailsEl.innerHTML = `
      <strong>CMS:</strong> ${config.cmsAddress}<br>
      <strong>Display:</strong> ${config.displayName || 'Unnamed'}<br>
      <strong>Hardware Key:</strong> ${config.hardwareKey.substring(0, 8)}...
    `;
  } else {
    statusEl.className = 'status not-configured';
    statusEl.textContent = '⚠️ Not configured';
    configDetailsEl.style.display = 'none';
  }
}

// Open player in new tab
openPlayerBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'openPlayer' });
  window.close();
});

// Open setup page
openSetupBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: 'player/setup.html' });
  window.close();
});

// Initialize on load
updateUI();
