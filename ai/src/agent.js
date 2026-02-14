/**
 * AI Campaign Creator Agent
 *
 * Orchestrates Claude API calls with CMS tools to create
 * digital signage content from natural language requests.
 *
 * Uses the tool-use pattern: user message → Claude → tool calls → results → Claude → response.
 *
 * @module @xiboplayer/ai/agent
 */

import { getToolDefinitions, executeTool } from './tools.js';

const MAX_TOOL_ROUNDS = 15;

const SYSTEM_PROMPT = `You are a digital signage assistant integrated into a Xibo CMS-powered display player. You help users create and manage signage content through natural conversation.

You have access to tools that interact with the Xibo CMS REST API. You can:
- Create layouts (the canvas where content is placed)
- Add regions (rectangular areas within a layout)
- Add widgets (text, images, videos, clocks, embedded HTML) to regions
- Publish layouts to make them live
- Create campaigns (groups of layouts that cycle)
- Schedule campaigns/layouts to display groups
- Search existing content (layouts, media, templates, displays)

WORKFLOW for creating new content:
1. Create a layout (or find an existing one)
2. The layout comes with a default full-screen region, or add custom regions
3. Add widgets to the region's playlist (text, images, videos, etc.)
4. Publish the layout
5. Optionally create a campaign and add the layout
6. Schedule to display groups

IMPORTANT RULES:
- Always publish layouts after adding content (unpublished layouts won't display)
- When creating text content, use HTML with inline CSS for rich formatting
- For images/videos, first search the media library; only ask the user to upload if not found
- Keep layout names descriptive (include date or purpose)
- Default to 1920x1080 resolution unless the user specifies otherwise
- When scheduling, ask which displays/groups if not specified
- Be concise in responses — the chat panel is small

When generating text content for signage:
- Use large, readable fonts (min 48px for headlines, 32px for body)
- High contrast colors (white on dark, or dark on light)
- Keep text minimal — signage is glanced at, not read
- Include relevant formatting (bold headings, proper spacing)`;

export class AiAgent {
  /**
   * @param {Object} options
   * @param {string} options.apiKey - Anthropic API key
   * @param {string} [options.apiUrl] - API base URL (default: https://api.anthropic.com)
   * @param {string} [options.model] - Model to use (default: claude-sonnet-4-5-20250929)
   * @param {import('./cms-api-client.js').CmsApiClient} options.cmsApi - Authenticated CMS client
   * @param {Function} [options.onToolCall] - Callback when a tool is called: (toolName, input) => void
   * @param {Function} [options.onToolResult] - Callback when a tool returns: (toolName, result) => void
   * @param {Function} [options.onThinking] - Callback when agent is processing: (status) => void
   */
  constructor(options) {
    this.apiKey = options.apiKey;
    this.apiUrl = (options.apiUrl || 'https://api.anthropic.com').replace(/\/$/, '');
    this.model = options.model || 'claude-sonnet-4-5-20250929';
    this.cmsApi = options.cmsApi;
    this.onToolCall = options.onToolCall || (() => {});
    this.onToolResult = options.onToolResult || (() => {});
    this.onThinking = options.onThinking || (() => {});

    /** @type {Array} Conversation history (user/assistant messages) */
    this.messages = [];

    /** @type {Object|null} Context about current player state */
    this.playerContext = null;
  }

  /**
   * Set player context (schedule, current layout, display info).
   * Included in the system prompt for awareness.
   */
  setPlayerContext(context) {
    this.playerContext = context;
  }

  /**
   * Send a user message and get the agent's response.
   * Handles multi-turn tool-use automatically.
   *
   * @param {string} userMessage - User's chat message
   * @returns {Promise<string>} Agent's text response
   */
  async chat(userMessage) {
    this.messages.push({ role: 'user', content: userMessage });

    let rounds = 0;

    while (rounds < MAX_TOOL_ROUNDS) {
      rounds++;
      this.onThinking(rounds === 1 ? 'Thinking...' : `Working (step ${rounds})...`);

      const response = await this._callClaude();

      // Extract text and tool_use blocks
      const textBlocks = response.content.filter(b => b.type === 'text');
      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');

      // Add assistant message to history
      this.messages.push({ role: 'assistant', content: response.content });

      // If no tool calls, return the text response
      if (toolUseBlocks.length === 0) {
        return textBlocks.map(b => b.text).join('\n') || '(No response)';
      }

      // Execute tool calls and collect results
      const toolResults = [];
      for (const toolUse of toolUseBlocks) {
        this.onToolCall(toolUse.name, toolUse.input);

        let result;
        let isError = false;
        try {
          result = await executeTool(toolUse.name, this.cmsApi, toolUse.input);
          this.onToolResult(toolUse.name, result);
        } catch (err) {
          result = { error: err.message };
          isError = true;
          this.onToolResult(toolUse.name, result);
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify(result),
          is_error: isError,
        });
      }

      // Add tool results to conversation
      this.messages.push({ role: 'user', content: toolResults });
    }

    return 'I reached the maximum number of steps. Please try breaking your request into smaller pieces.';
  }

  /**
   * Call Claude API with current conversation and tools.
   * @private
   */
  async _callClaude() {
    const systemPrompt = this._buildSystemPrompt();

    const body = {
      model: this.model,
      max_tokens: 4096,
      system: systemPrompt,
      tools: getToolDefinitions(),
      messages: this.messages,
    };

    const res = await fetch(`${this.apiUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Claude API error (${res.status}): ${text}`);
    }

    return res.json();
  }

  /** @private */
  _buildSystemPrompt() {
    let prompt = SYSTEM_PROMPT;

    if (this.playerContext) {
      prompt += '\n\nCURRENT PLAYER CONTEXT:\n';
      if (this.playerContext.displayName) {
        prompt += `- Display: ${this.playerContext.displayName}\n`;
      }
      if (this.playerContext.currentLayoutId) {
        prompt += `- Currently playing layout ID: ${this.playerContext.currentLayoutId}\n`;
      }
      if (this.playerContext.displayGroupId) {
        prompt += `- Display group ID: ${this.playerContext.displayGroupId}\n`;
      }
      if (this.playerContext.cmsUrl) {
        prompt += `- CMS: ${this.playerContext.cmsUrl}\n`;
      }
    }

    return prompt;
  }

  /**
   * Clear conversation history (start fresh).
   */
  reset() {
    this.messages = [];
  }

  /**
   * Get conversation summary for debugging.
   */
  getConversationSummary() {
    return {
      messageCount: this.messages.length,
      toolCallsTotal: this.messages
        .filter(m => m.role === 'assistant')
        .reduce((sum, m) => {
          const content = Array.isArray(m.content) ? m.content : [];
          return sum + content.filter(b => b.type === 'tool_use').length;
        }, 0),
    };
  }
}
