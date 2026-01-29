/**
 * Chrome Extension Background Service Worker
 *
 * Manages player state and provides always-on functionality
 */

// Extension installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Xibo Player installed');

    // Open setup page on first install
    chrome.tabs.create({
      url: 'player/setup.html'
    });
  } else if (details.reason === 'update') {
    console.log('Xibo Player updated to', chrome.runtime.getManifest().version);
  }
});

// Alarm for periodic collection (backup for XMR)
chrome.alarms.create('xibo-collect', {
  periodInMinutes: 15
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'xibo-collect') {
    console.log('Collection alarm triggered');
    // The player itself handles collection via XMDS
    // This is just a backup if XMR is not available
  }
});

// Handle messages from popup or player
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getConfig') {
    // Return player configuration
    chrome.storage.local.get(['config'], (result) => {
      sendResponse(result.config || null);
    });
    return true; // Keep channel open for async response
  }

  if (message.action === 'saveConfig') {
    // Save player configuration
    chrome.storage.local.set({ config: message.config }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.action === 'openPlayer') {
    // Open player in new tab or focus existing
    chrome.tabs.query({ url: chrome.runtime.getURL('player/index.html') }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.update(tabs[0].id, { active: true });
      } else {
        chrome.tabs.create({ url: 'player/index.html' });
      }
    });
    return false;
  }
});

// Keep service worker alive
let keepAliveInterval = null;

function keepAlive() {
  if (keepAliveInterval) return;

  keepAliveInterval = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => {
      // Just ping to keep worker alive
    });
  }, 20000); // Every 20 seconds
}

// Start keep-alive on activation
chrome.runtime.onStartup.addListener(keepAlive);
keepAlive();

console.log('Xibo Player background service worker ready');
