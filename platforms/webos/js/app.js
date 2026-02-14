/**
 * webOS Xibo Player Application
 *
 * Wraps the PWA digital signage player in a webOS TV application.
 * Handles:
 *  - webOS lifecycle (visibility, suspend/resume, relaunch)
 *  - Screen saver / burn-in protection suppression
 *  - Remote control key event handling (kiosk lockdown)
 *  - Network connectivity monitoring with auto-reconnect
 *  - Configuration via URL params or localStorage
 */

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  /** Default PWA player URL — overridden by localStorage or URL params */
  var DEFAULT_CMS_URL = 'https://h1.superpantalles.com:8081/player/pwa/';

  /** Interval (ms) to re-request keep-alive / screen-saver disable */
  var KEEP_ALIVE_INTERVAL = 5 * 60 * 1000; // 5 minutes

  /** Delay (ms) before attempting iframe reload after network recovery */
  var RECONNECT_DELAY = 3000;

  /** Maximum reconnect attempts before showing a persistent error */
  var MAX_RECONNECT_ATTEMPTS = 50;

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  var playerFrame = null;
  var statusOverlay = null;
  var statusText = null;
  var spinner = null;
  var networkIndicator = null;
  var debugOverlay = null;

  var cmsUrl = '';
  var keepAliveTimer = null;
  var reconnectTimer = null;
  var reconnectAttempts = 0;
  var isOnline = true;
  var debugVisible = false;
  var appVisible = true;

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  /**
   * Read the CMS URL from (in order of precedence):
   *  1. URL search parameter: ?cmsUrl=https://...
   *  2. localStorage key: webos_cms_url
   *  3. DEFAULT_CMS_URL constant
   */
  function loadConfig() {
    // URL params
    var params = new URLSearchParams(window.location.search);
    var paramUrl = params.get('cmsUrl') || params.get('cmsurl');
    if (paramUrl) {
      cmsUrl = paramUrl;
      log('Config from URL param: ' + cmsUrl);
      return;
    }

    // localStorage
    try {
      var stored = localStorage.getItem('webos_cms_url');
      if (stored) {
        cmsUrl = stored;
        log('Config from localStorage: ' + cmsUrl);
        return;
      }
    } catch (e) {
      log('localStorage not available: ' + e.message);
    }

    // Default
    cmsUrl = DEFAULT_CMS_URL;
    log('Using default CMS URL: ' + cmsUrl);
  }

  /**
   * Save the current CMS URL to localStorage for persistence across reboots.
   */
  function saveConfig() {
    try {
      localStorage.setItem('webos_cms_url', cmsUrl);
    } catch (e) {
      // Ignore — storage may be unavailable in some webOS versions
    }
  }

  /**
   * Main entry point — called on DOMContentLoaded.
   */
  function init() {
    log('Xibo webOS player initializing...');

    // Cache DOM elements
    playerFrame = document.getElementById('player-frame');
    statusOverlay = document.getElementById('status-overlay');
    statusText = document.getElementById('status-text');
    spinner = document.getElementById('spinner');
    networkIndicator = document.getElementById('network-indicator');
    debugOverlay = document.getElementById('debug-overlay');

    // Load configuration
    loadConfig();
    saveConfig();

    // Initialize webOS platform features
    initWebOS();

    // Setup remote control key handling
    setupKeyHandler();

    // Setup network monitoring
    setupNetworkMonitor();

    // Keep screen on
    keepScreenAlive();

    // Load the PWA player
    loadPlayer();

    log('Initialization complete');
  }

  // ---------------------------------------------------------------------------
  // webOS Platform Integration
  // ---------------------------------------------------------------------------

  /**
   * Initialize webOS TV library and platform features.
   */
  function initWebOS() {
    // webOS TV.js library availability check
    if (typeof webOS === 'undefined') {
      log('webOS library not available (running outside webOS?)');
      return;
    }

    log('webOS platform detected');

    // Log device info
    try {
      webOS.deviceInfo(function (info) {
        log('Device: ' + info.modelName + ' (webOS ' + info.sdkVersion + ')');
        updateDebugInfo();
      });
    } catch (e) {
      log('Could not read device info: ' + e.message);
    }

    // Handle app visibility changes (webOS lifecycle)
    document.addEventListener('webOSRelaunch', function (evt) {
      log('App relaunched');
      // Bring to foreground — webOS sends this when app is re-opened
      if (playerFrame && playerFrame.contentWindow) {
        try {
          playerFrame.contentWindow.focus();
        } catch (e) { /* cross-origin */ }
      }
    });

    // Visibility API for suspend/resume
    document.addEventListener('visibilitychange', function () {
      appVisible = !document.hidden;
      log('Visibility changed: ' + (appVisible ? 'visible' : 'hidden'));

      if (appVisible) {
        // Resume — re-enable keep-alive and reload if needed
        keepScreenAlive();
        if (!isOnline) {
          scheduleReconnect();
        }
      } else {
        // Suspended — clear keep-alive timer to save resources
        if (keepAliveTimer) {
          clearInterval(keepAliveTimer);
          keepAliveTimer = null;
        }
      }
    });
  }

  /**
   * Keep screen alive by disabling the screen saver via webOS service calls.
   *
   * LG webOS TVs have an automatic screen saver that activates after a period
   * of no user input. For digital signage this must be disabled.
   */
  function keepScreenAlive() {
    // Clear any existing timer
    if (keepAliveTimer) {
      clearInterval(keepAliveTimer);
    }

    // Request immediately, then repeat every KEEP_ALIVE_INTERVAL
    requestKeepAlive();
    keepAliveTimer = setInterval(requestKeepAlive, KEEP_ALIVE_INTERVAL);
  }

  /**
   * Issue a Luna service request to keep the screen on.
   * Uses multiple strategies because the API varies across webOS versions.
   */
  function requestKeepAlive() {
    if (typeof webOS === 'undefined' || !webOS.service) {
      return;
    }

    // Strategy 1: Power management — set screen state to Active
    try {
      webOS.service.request('luna://com.webos.service.tvpower', {
        method: 'turnOnScreen',
        parameters: {},
        onSuccess: function () { /* Screen turned on */ },
        onFailure: function () { /* May not be available on all versions */ }
      });
    } catch (e) { /* ignore */ }

    // Strategy 2: Disable screen saver
    try {
      webOS.service.request('luna://com.webos.service.tv.display', {
        method: 'set',
        parameters: {
          category: 'screenSaver',
          settings: { mode: 'off' }
        },
        onSuccess: function () { log('Screen saver disabled'); },
        onFailure: function () { /* May not be available */ }
      });
    } catch (e) { /* ignore */ }

    // Strategy 3: Keep display on via power management (webOS 3.x+)
    try {
      webOS.service.request('luna://com.palm.display', {
        method: 'status',
        parameters: { subscribe: false },
        onSuccess: function () { /* Display active */ },
        onFailure: function () { /* ignore */ }
      });
    } catch (e) { /* ignore */ }

    // Strategy 4: Prevent idle sleep via activity manager
    try {
      webOS.service.request('luna://com.webos.service.power', {
        method: 'acquireWakeLock',
        parameters: {
          clientName: 'com.tecman.xiboplayer',
          timeout: KEEP_ALIVE_INTERVAL / 1000 + 60  // seconds, with buffer
        },
        onSuccess: function () { /* Wake lock acquired */ },
        onFailure: function () { /* May not be available */ }
      });
    } catch (e) { /* ignore */ }
  }

  // ---------------------------------------------------------------------------
  // Remote Control Key Handling
  // ---------------------------------------------------------------------------

  /**
   * Handle remote control key events.
   *
   * Kiosk behavior:
   *  - BACK button: prevented (no exit)
   *  - EXIT button: prevented
   *  - Color buttons: mapped to debug functions
   *  - All other navigation keys: optionally forwarded to iframe
   */
  function setupKeyHandler() {
    document.addEventListener('keydown', function (evt) {
      var keyCode = evt.keyCode;

      switch (keyCode) {
        // BACK button (webOS remote) — prevent app exit
        case 461:  // webOS BACK
        case 10009: // Tizen BACK (for future compat)
          evt.preventDefault();
          evt.stopPropagation();
          log('BACK key suppressed (kiosk mode)');
          return false;

        // EXIT / HOME — prevent exit in kiosk mode
        case 36:   // HOME
        case 27:   // ESC (desktop testing)
          evt.preventDefault();
          evt.stopPropagation();
          log('EXIT/HOME key suppressed (kiosk mode)');
          return false;

        // Color buttons for debug functions
        case 403:  // RED — reload iframe
          evt.preventDefault();
          log('RED button: reloading player');
          loadPlayer();
          break;

        case 404:  // GREEN — toggle debug overlay
          evt.preventDefault();
          toggleDebugOverlay();
          break;

        case 405:  // YELLOW — cycle CMS URL (for field configuration)
          evt.preventDefault();
          log('YELLOW button: configuration (no-op, set cmsUrl in localStorage)');
          showStatus('Set CMS URL via localStorage: webos_cms_url');
          break;

        case 406:  // BLUE — force reconnect
          evt.preventDefault();
          log('BLUE button: force reconnect');
          reconnectAttempts = 0;
          loadPlayer();
          break;

        // OK / Enter — let it pass through to iframe
        case 13:
          break;

        // Arrow keys — let pass through for interactive content
        case 37: // LEFT
        case 38: // UP
        case 39: // RIGHT
        case 40: // DOWN
          break;

        // Media keys — let pass through (video control)
        case 415: // PLAY
        case 19:  // PAUSE
        case 413: // STOP
        case 417: // FAST_FORWARD
        case 412: // REWIND
          break;

        default:
          // Log unhandled key codes in debug mode
          if (debugVisible) {
            log('Key pressed: ' + keyCode);
          }
          break;
      }
    }, true); // Use capture phase to intercept before iframe
  }

  // ---------------------------------------------------------------------------
  // Network Monitoring
  // ---------------------------------------------------------------------------

  /**
   * Monitor network connectivity and handle reconnection.
   */
  function setupNetworkMonitor() {
    // Browser online/offline events
    window.addEventListener('online', function () {
      log('Network: online');
      isOnline = true;
      updateNetworkIndicator('');
      scheduleReconnect();
    });

    window.addEventListener('offline', function () {
      log('Network: offline');
      isOnline = false;
      updateNetworkIndicator('offline');
    });

    // webOS-specific connectivity monitoring
    if (typeof webOS !== 'undefined' && webOS.service) {
      try {
        webOS.service.request('luna://com.webos.service.connectionmanager', {
          method: 'getStatus',
          parameters: { subscribe: true },
          onSuccess: function (res) {
            var connected = res.isInternetConnectionAvailable;
            if (connected && !isOnline) {
              log('Network restored (webOS)');
              isOnline = true;
              updateNetworkIndicator('');
              scheduleReconnect();
            } else if (!connected && isOnline) {
              log('Network lost (webOS)');
              isOnline = false;
              updateNetworkIndicator('offline');
            }
          },
          onFailure: function () {
            // Fall back to browser events only
          }
        });
      } catch (e) { /* ignore */ }
    }

    // Set initial state
    isOnline = navigator.onLine !== false;
    if (!isOnline) {
      updateNetworkIndicator('offline');
    }
  }

  /**
   * Schedule an iframe reload after network recovery.
   */
  function scheduleReconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
    }

    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      showStatus('Network error. Press BLUE button to retry.', true);
      return;
    }

    // Exponential backoff: 3s, 6s, 12s, ... capped at 60s
    var delay = Math.min(RECONNECT_DELAY * Math.pow(2, reconnectAttempts), 60000);
    reconnectAttempts++;

    updateNetworkIndicator('reconnecting');
    showStatus('Reconnecting in ' + Math.round(delay / 1000) + 's (attempt ' + reconnectAttempts + ')...');

    reconnectTimer = setTimeout(function () {
      log('Reconnecting (attempt ' + reconnectAttempts + ')...');
      loadPlayer();
    }, delay);
  }

  /**
   * Update the network indicator badge.
   */
  function updateNetworkIndicator(state) {
    if (!networkIndicator) return;
    networkIndicator.className = state || '';
    networkIndicator.textContent = state === 'offline' ? 'OFFLINE'
      : state === 'reconnecting' ? 'RECONNECTING...'
      : '';
  }

  // ---------------------------------------------------------------------------
  // Player Loading
  // ---------------------------------------------------------------------------

  /**
   * Load (or reload) the PWA player in the iframe.
   */
  function loadPlayer() {
    if (!playerFrame) return;

    showStatus('Loading player...');

    // Add a cache-busting param on reconnect to avoid stale content
    var url = cmsUrl;
    if (reconnectAttempts > 0) {
      var separator = url.indexOf('?') >= 0 ? '&' : '?';
      url += separator + '_t=' + Date.now();
    }

    log('Loading player URL: ' + url);

    // Listen for iframe load
    playerFrame.onload = function () {
      log('Player iframe loaded successfully');
      reconnectAttempts = 0;
      hideStatus();
      updateNetworkIndicator('');
    };

    playerFrame.onerror = function () {
      log('Player iframe failed to load');
      showStatus('Failed to load player', true);
      if (isOnline) {
        scheduleReconnect();
      }
    };

    playerFrame.src = url;

    // Timeout: if iframe doesn't load in 30s, try reconnecting
    setTimeout(function () {
      if (statusOverlay && !statusOverlay.classList.contains('hidden')) {
        log('Player load timeout — scheduling reconnect');
        if (isOnline) {
          scheduleReconnect();
        }
      }
    }, 30000);
  }

  // ---------------------------------------------------------------------------
  // UI Helpers
  // ---------------------------------------------------------------------------

  /**
   * Show the status overlay with a message.
   */
  function showStatus(message, isError) {
    if (statusOverlay) {
      statusOverlay.classList.remove('hidden');
      if (isError) {
        statusOverlay.classList.add('error');
      } else {
        statusOverlay.classList.remove('error');
      }
    }
    if (statusText) {
      statusText.textContent = message;
    }
    if (spinner) {
      spinner.style.display = isError ? 'none' : 'block';
    }
  }

  /**
   * Hide the status overlay (player loaded successfully).
   */
  function hideStatus() {
    if (statusOverlay) {
      statusOverlay.classList.add('hidden');
    }
  }

  /**
   * Toggle the debug info overlay (GREEN remote button).
   */
  function toggleDebugOverlay() {
    debugVisible = !debugVisible;
    if (debugOverlay) {
      debugOverlay.classList.toggle('visible', debugVisible);
    }
    if (debugVisible) {
      updateDebugInfo();
    }
    log('Debug overlay: ' + (debugVisible ? 'shown' : 'hidden'));
  }

  /**
   * Update the debug overlay content.
   */
  function updateDebugInfo() {
    if (!debugOverlay || !debugVisible) return;

    var info = [
      'CMS URL: ' + cmsUrl,
      'Online: ' + isOnline,
      'Reconnect attempts: ' + reconnectAttempts,
      'Visible: ' + appVisible,
      'Time: ' + new Date().toISOString()
    ];

    // Add webOS device info if available
    if (typeof webOS !== 'undefined') {
      info.push('Platform: webOS');
      try {
        info.push('App ID: ' + webOS.fetchAppId());
      } catch (e) { /* ignore */ }
    } else {
      info.push('Platform: browser (non-webOS)');
    }

    debugOverlay.textContent = info.join('\n');
  }

  // Refresh debug info periodically when visible
  setInterval(function () {
    if (debugVisible) {
      updateDebugInfo();
    }
  }, 5000);

  // ---------------------------------------------------------------------------
  // Logging
  // ---------------------------------------------------------------------------

  /**
   * Log a message with timestamp prefix.
   * Uses console.log which is captured by ares-inspect on webOS.
   */
  function log(message) {
    console.log('[XiboWebOS] ' + new Date().toISOString() + ' ' + message);
  }

  // ---------------------------------------------------------------------------
  // Bootstrap
  // ---------------------------------------------------------------------------

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
