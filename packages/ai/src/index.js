/**
 * @xiboplayer/ai — AI Campaign Creator
 *
 * Chat-based AI module for creating digital signage content.
 * Uses Claude tool-use to orchestrate CMS API calls from natural language.
 *
 * Usage:
 *   import { AiCampaignCreator } from '@xiboplayer/ai';
 *
 *   const ai = new AiCampaignCreator({
 *     anthropicApiKey: 'sk-ant-...',
 *     cmsUrl: 'https://cms.example.com',
 *     cmsClientId: 'abc',
 *     cmsClientSecret: 'xyz',
 *     container: document.body,
 *   });
 *
 *   ai.start();
 *
 * @module @xiboplayer/ai
 */

export { CmsApiClient, CmsApiError } from './cms-api-client.js';
export { AiAgent } from './agent.js';
export { AiChatUI } from './chat-ui.js';
export { CMS_TOOLS, getToolDefinitions, executeTool } from './tools.js';

import { CmsApiClient } from './cms-api-client.js';
import { AiAgent } from './agent.js';
import { AiChatUI } from './chat-ui.js';

/**
 * All-in-one AI Campaign Creator.
 * Wires together CMS API client, AI agent, and chat UI.
 */
export class AiCampaignCreator {
  /**
   * @param {Object} options
   * @param {string} options.anthropicApiKey - Anthropic API key for Claude
   * @param {string} [options.anthropicApiUrl] - Custom API URL (for proxies)
   * @param {string} [options.model] - Claude model (default: claude-sonnet-4-5-20250929)
   * @param {string} options.cmsUrl - CMS base URL
   * @param {string} [options.cmsClientId] - OAuth2 client ID
   * @param {string} [options.cmsClientSecret] - OAuth2 client secret
   * @param {string} [options.cmsApiToken] - Pre-configured CMS bearer token
   * @param {HTMLElement} [options.container] - Container for chat UI
   * @param {Object} [options.playerContext] - Player state context
   */
  constructor(options) {
    this.cmsApi = new CmsApiClient({
      cmsUrl: options.cmsUrl,
      clientId: options.cmsClientId,
      clientSecret: options.cmsClientSecret,
      apiToken: options.cmsApiToken,
    });

    this.ui = new AiChatUI({
      container: options.container,
      onSend: (text) => this._handleUserMessage(text),
      title: options.title || 'AI Campaign Creator',
    });

    this.agent = new AiAgent({
      apiKey: options.anthropicApiKey,
      apiUrl: options.anthropicApiUrl,
      model: options.model,
      cmsApi: this.cmsApi,
      onToolCall: (name, input) => {
        this._currentToolMsg = this.ui.addToolCall(name, input);
      },
      onToolResult: (name, result) => {
        this.ui.updateToolResult(this._currentToolMsg, result);
        this._currentToolMsg = null;
      },
      onThinking: (status) => {
        this.ui.showThinking(status);
      },
    });

    if (options.playerContext) {
      this.agent.setPlayerContext(options.playerContext);
    }

    this._currentToolMsg = null;
  }

  /**
   * Show the chat FAB button (already created, just ensures visibility).
   */
  start() {
    // FAB is shown by default
  }

  /**
   * Open the chat panel.
   */
  open() {
    this.ui.open();
  }

  /**
   * Remove all UI and clean up.
   */
  destroy() {
    this.ui.destroy();
  }

  /**
   * Set/update player context for the AI.
   */
  setPlayerContext(context) {
    this.agent.setPlayerContext(context);
  }

  /** @private */
  async _handleUserMessage(text) {
    try {
      const response = await this.agent.chat(text);
      this.ui.removeThinking();
      this.ui.addMessage('assistant', response);
    } catch (err) {
      this.ui.removeThinking();
      this.ui.addMessage('system', `Error: ${err.message}`);
    }
  }
}
