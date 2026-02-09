/**
 * XMR (Xibo Message Relay) Wrapper
 *
 * Integrates the official @xibosignage/xibo-communication-framework
 * to enable real-time push commands from CMS via WebSocket.
 *
 * Supported commands:
 * - collectNow: Trigger immediate XMDS collection cycle
 * - screenShot: Capture and upload screenshot
 * - licenceCheck: No-op for Linux clients (always valid)
 */

import { Xmr } from '@xibosignage/xibo-communication-framework';

export class XmrWrapper {
  /**
   * @param {Object} config - Player configuration
   * @param {Object} player - Player instance for callbacks
   */
  constructor(config, player) {
    this.config = config;
    this.player = player;
    this.xmr = null;
    this.connected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 5000; // 5 seconds
    this.lastXmrUrl = null;
    this.lastCmsKey = null;
    this.reconnectTimer = null;
  }

  /**
   * Initialize and start XMR connection
   * @param {string} xmrUrl - WebSocket URL (ws:// or wss://)
   * @param {string} cmsKey - CMS authentication key
   * @returns {Promise<boolean>} Success status
   */
  async start(xmrUrl, cmsKey) {
    try {
      console.log('[XMR] Initializing connection to:', xmrUrl);

      // Save connection details for reconnection
      this.lastXmrUrl = xmrUrl;
      this.lastCmsKey = cmsKey;

      // Cancel any pending reconnect attempts
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }

      // Create XMR instance with channel ID (or reuse if already exists)
      if (!this.xmr) {
        const channel = this.config.xmrChannel || `player-${this.config.hardwareKey}`;
        this.xmr = new Xmr(channel);
        // Setup event handlers before connecting (only once)
        this.setupEventHandlers();
      }

      // Initialize and connect
      await this.xmr.init();
      await this.xmr.start(xmrUrl, cmsKey);

      this.connected = true;
      this.reconnectAttempts = 0;
      console.log('[XMR] Connected successfully');

      return true;
    } catch (error) {
      console.warn('[XMR] Failed to start:', error.message);
      console.log('[XMR] Continuing in polling mode (XMDS only)');

      // Schedule reconnection attempt
      this.scheduleReconnect(xmrUrl, cmsKey);

      return false;
    }
  }

  /**
   * Setup event handlers for CMS commands
   */
  setupEventHandlers() {
    if (!this.xmr) return;

    // Connection events
    this.xmr.on('connected', () => {
      console.log('[XMR] WebSocket connected');
      this.connected = true;
      this.reconnectAttempts = 0;
      this.player.updateStatus?.('XMR connected');
    });

    this.xmr.on('disconnected', () => {
      console.warn('[XMR] WebSocket disconnected');
      this.connected = false;
      this.player.updateStatus?.('XMR disconnected (polling mode)');

      // Attempt to reconnect if we have the connection details
      if (this.lastXmrUrl && this.lastCmsKey) {
        console.log('[XMR] Connection lost, scheduling reconnection...');
        this.scheduleReconnect(this.lastXmrUrl, this.lastCmsKey);
      }
    });

    this.xmr.on('error', (error) => {
      console.error('[XMR] WebSocket error:', error);
    });

    // CMS command: Collect Now
    this.xmr.on('collectNow', async () => {
      console.log('[XMR] Received collectNow command from CMS');
      try {
        await this.player.collect();
        console.log('[XMR] collectNow completed successfully');
      } catch (error) {
        console.error('[XMR] collectNow failed:', error);
      }
    });

    // CMS command: Screenshot
    this.xmr.on('screenShot', async () => {
      console.log('[XMR] Received screenShot command from CMS');
      try {
        await this.player.captureScreenshot();
        console.log('[XMR] screenShot completed successfully');
      } catch (error) {
        console.error('[XMR] screenShot failed:', error);
      }
    });

    // CMS command: License Check (no-op for Linux clients)
    this.xmr.on('licenceCheck', () => {
      console.log('[XMR] Received licenceCheck (no-op for Linux client)');
      // Linux clients always report valid license
      // No action needed - clientType: "linux" bypasses commercial license
    });

    // CMS command: Change Layout
    this.xmr.on('changeLayout', async (layoutId) => {
      console.log('[XMR] Received changeLayout command:', layoutId);
      try {
        await this.player.changeLayout(layoutId);
        console.log('[XMR] changeLayout completed successfully');
      } catch (error) {
        console.error('[XMR] changeLayout failed:', error);
      }
    });

    // CMS command: Rekey
    this.xmr.on('rekey', () => {
      console.log('[XMR] Received rekey command (pubKey rotation)');
      // TODO: Implement RSA key pair rotation if XMR encryption is needed
    });

    // CMS command: Screen Shot (alternative event name)
    this.xmr.on('screenshot', async () => {
      console.log('[XMR] Received screenshot command from CMS');
      try {
        await this.player.captureScreenshot();
      } catch (error) {
        console.error('[XMR] screenshot failed:', error);
      }
    });
  }

  /**
   * Schedule reconnection attempt
   */
  scheduleReconnect(xmrUrl, cmsKey) {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn('[XMR] Max reconnection attempts reached, giving up');
      console.log('[XMR] Will retry on next collection cycle');
      return;
    }

    // Cancel any existing reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts;

    console.log(`[XMR] Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);

    this.reconnectTimer = setTimeout(() => {
      console.log('[XMR] Attempting to reconnect...');
      this.reconnectTimer = null;
      this.start(xmrUrl, cmsKey);
    }, delay);
  }

  /**
   * Stop XMR connection
   */
  async stop() {
    // Cancel any pending reconnect attempts
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (!this.xmr) return;

    try {
      await this.xmr.stop();
      this.connected = false;
      console.log('[XMR] Stopped');
    } catch (error) {
      console.error('[XMR] Error stopping:', error);
    }
  }

  /**
   * Check if XMR is connected
   * @returns {boolean}
   */
  isConnected() {
    return this.connected;
  }

  /**
   * Send a message to CMS (if needed for future features)
   * @param {string} action - Action name
   * @param {Object} data - Data payload
   */
  async send(action, data) {
    if (!this.connected || !this.xmr) {
      console.warn('[XMR] Cannot send - not connected');
      return false;
    }

    try {
      await this.xmr.send(action, data);
      return true;
    } catch (error) {
      console.error('[XMR] Error sending:', error);
      return false;
    }
  }
}
