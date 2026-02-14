/**
 * AI Chat UI Overlay
 *
 * Self-contained chat interface that can be injected into any page.
 * Renders as a floating button that expands into a chat panel.
 * No external dependencies — all styles are inline.
 *
 * @module @xiboplayer/ai/chat-ui
 */

const STYLES = `
  .ai-chat-fab {
    position: fixed;
    bottom: 24px;
    right: 24px;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: #6366f1;
    color: white;
    border: none;
    cursor: pointer;
    box-shadow: 0 4px 14px rgba(99,102,241,0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100000;
    transition: transform 0.2s, box-shadow 0.2s;
    font-size: 24px;
  }
  .ai-chat-fab:hover {
    transform: scale(1.08);
    box-shadow: 0 6px 20px rgba(99,102,241,0.5);
  }
  .ai-chat-fab.hidden { display: none; }

  .ai-chat-panel {
    position: fixed;
    bottom: 24px;
    right: 24px;
    width: 380px;
    max-width: calc(100vw - 48px);
    height: 520px;
    max-height: calc(100vh - 48px);
    background: #1a1a2e;
    border-radius: 16px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    display: flex;
    flex-direction: column;
    z-index: 100001;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    color: #e2e8f0;
    opacity: 0;
    transform: translateY(20px) scale(0.95);
    transition: opacity 0.25s, transform 0.25s;
    pointer-events: none;
  }
  .ai-chat-panel.visible {
    opacity: 1;
    transform: translateY(0) scale(1);
    pointer-events: auto;
  }

  .ai-chat-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    background: #16213e;
    border-bottom: 1px solid #2d3a5e;
    flex-shrink: 0;
  }
  .ai-chat-header-title {
    font-size: 14px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .ai-chat-header-title .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #22c55e;
  }
  .ai-chat-close {
    background: none;
    border: none;
    color: #94a3b8;
    cursor: pointer;
    font-size: 18px;
    padding: 4px;
    line-height: 1;
  }
  .ai-chat-close:hover { color: #e2e8f0; }

  .ai-chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .ai-chat-messages::-webkit-scrollbar { width: 4px; }
  .ai-chat-messages::-webkit-scrollbar-track { background: transparent; }
  .ai-chat-messages::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }

  .ai-msg {
    max-width: 88%;
    padding: 10px 14px;
    border-radius: 12px;
    font-size: 13px;
    line-height: 1.5;
    word-wrap: break-word;
  }
  .ai-msg.user {
    align-self: flex-end;
    background: #6366f1;
    color: white;
    border-bottom-right-radius: 4px;
  }
  .ai-msg.assistant {
    align-self: flex-start;
    background: #1e293b;
    border: 1px solid #334155;
    border-bottom-left-radius: 4px;
  }
  .ai-msg.system {
    align-self: center;
    background: transparent;
    color: #64748b;
    font-size: 11px;
    padding: 4px 8px;
  }
  .ai-msg.tool-call {
    align-self: flex-start;
    background: #0f172a;
    border: 1px solid #1e40af;
    border-left: 3px solid #3b82f6;
    font-size: 11px;
    font-family: 'SF Mono', 'Fira Code', monospace;
    color: #93c5fd;
    padding: 8px 12px;
    border-radius: 8px;
  }
  .ai-msg.tool-call .tool-name {
    color: #60a5fa;
    font-weight: 600;
  }
  .ai-msg.tool-call .tool-result {
    color: #86efac;
    margin-top: 4px;
  }
  .ai-msg.tool-call .tool-error {
    color: #fca5a5;
    margin-top: 4px;
  }

  .ai-msg a { color: #93c5fd; }
  .ai-msg code {
    background: #0f172a;
    padding: 1px 4px;
    border-radius: 3px;
    font-size: 12px;
  }

  .ai-chat-thinking {
    align-self: flex-start;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    color: #94a3b8;
    font-size: 12px;
  }
  .ai-chat-thinking .dots {
    display: flex;
    gap: 4px;
  }
  .ai-chat-thinking .dots span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #6366f1;
    animation: ai-bounce 1.4s infinite ease-in-out;
  }
  .ai-chat-thinking .dots span:nth-child(2) { animation-delay: 0.16s; }
  .ai-chat-thinking .dots span:nth-child(3) { animation-delay: 0.32s; }
  @keyframes ai-bounce {
    0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
    40% { transform: scale(1); opacity: 1; }
  }

  .ai-chat-input-area {
    display: flex;
    align-items: flex-end;
    padding: 12px;
    gap: 8px;
    background: #16213e;
    border-top: 1px solid #2d3a5e;
    flex-shrink: 0;
  }
  .ai-chat-input {
    flex: 1;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 10px;
    color: #e2e8f0;
    padding: 10px 14px;
    font-size: 13px;
    font-family: inherit;
    resize: none;
    outline: none;
    max-height: 100px;
    min-height: 20px;
    line-height: 1.4;
  }
  .ai-chat-input::placeholder { color: #64748b; }
  .ai-chat-input:focus { border-color: #6366f1; }
  .ai-chat-send {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: #6366f1;
    border: none;
    color: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    font-size: 16px;
    transition: background 0.15s;
  }
  .ai-chat-send:hover { background: #4f46e5; }
  .ai-chat-send:disabled { background: #334155; cursor: default; }
`;

const FAB_ICON = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
const SEND_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>`;

export class AiChatUI {
  /**
   * @param {Object} options
   * @param {HTMLElement} [options.container] - Container element (default: document.body)
   * @param {Function} options.onSend - Called with message text when user sends: (text) => Promise<void>
   * @param {string} [options.title] - Chat panel title
   * @param {string} [options.placeholder] - Input placeholder text
   */
  constructor(options) {
    this.container = options.container || document.body;
    this.onSend = options.onSend;
    this.title = options.title || 'AI Campaign Creator';
    this.placeholder = options.placeholder || 'Describe what you want to create...';
    this._isOpen = false;
    this._isSending = false;

    this._injectStyles();
    this._createElements();
  }

  /** @private */
  _injectStyles() {
    if (document.getElementById('ai-chat-styles')) return;
    const style = document.createElement('style');
    style.id = 'ai-chat-styles';
    style.textContent = STYLES;
    document.head.appendChild(style);
  }

  /** @private */
  _createElements() {
    // FAB button
    this.fab = document.createElement('button');
    this.fab.className = 'ai-chat-fab';
    this.fab.innerHTML = FAB_ICON;
    this.fab.title = this.title;
    this.fab.addEventListener('click', () => this.toggle());

    // Chat panel
    this.panel = document.createElement('div');
    this.panel.className = 'ai-chat-panel';
    this.panel.innerHTML = `
      <div class="ai-chat-header">
        <div class="ai-chat-header-title">
          <span class="dot"></span>
          ${this.title}
        </div>
        <button class="ai-chat-close">&times;</button>
      </div>
      <div class="ai-chat-messages"></div>
      <div class="ai-chat-input-area">
        <textarea class="ai-chat-input" placeholder="${this.placeholder}" rows="1"></textarea>
        <button class="ai-chat-send">${SEND_ICON}</button>
      </div>
    `;

    this.messagesEl = this.panel.querySelector('.ai-chat-messages');
    this.inputEl = this.panel.querySelector('.ai-chat-input');
    this.sendBtn = this.panel.querySelector('.ai-chat-send');
    const closeBtn = this.panel.querySelector('.ai-chat-close');

    closeBtn.addEventListener('click', () => this.close());
    this.sendBtn.addEventListener('click', () => this._handleSend());
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this._handleSend();
      }
    });

    // Auto-resize textarea
    this.inputEl.addEventListener('input', () => {
      this.inputEl.style.height = 'auto';
      this.inputEl.style.height = Math.min(this.inputEl.scrollHeight, 100) + 'px';
    });

    this.container.appendChild(this.fab);
    this.container.appendChild(this.panel);

    // Welcome message
    this.addMessage('system', 'Ask me to create layouts, campaigns, or schedule content. For example: "Create a welcome screen with our logo and store hours"');
  }

  /**
   * Add a message to the chat.
   * @param {'user'|'assistant'|'system'|'tool-call'} type
   * @param {string} text - Message text or HTML
   */
  addMessage(type, text) {
    const msg = document.createElement('div');
    msg.className = `ai-msg ${type}`;
    msg.innerHTML = this._formatMessage(text);
    this.messagesEl.appendChild(msg);
    this._scrollToBottom();
    return msg;
  }

  /**
   * Show a tool call in the chat (compact, informative).
   * @param {string} toolName - Tool being called
   * @param {Object} input - Tool input
   * @param {Object} [result] - Tool result (added later)
   * @returns {HTMLElement} The message element (to update with result later)
   */
  addToolCall(toolName, input, result = null) {
    const msg = document.createElement('div');
    msg.className = 'ai-msg tool-call';

    const inputSummary = this._summarizeToolInput(toolName, input);
    let html = `<span class="tool-name">${toolName}</span> ${inputSummary}`;

    if (result) {
      if (result.error) {
        html += `<div class="tool-error">Error: ${result.error}</div>`;
      } else {
        html += `<div class="tool-result">${this._summarizeToolResult(toolName, result)}</div>`;
      }
    }

    msg.innerHTML = html;
    this.messagesEl.appendChild(msg);
    this._scrollToBottom();
    return msg;
  }

  /**
   * Update a tool call message with its result.
   * @param {HTMLElement} msgEl - The tool call message element
   * @param {Object} result - Tool result
   */
  updateToolResult(msgEl, result) {
    if (!msgEl) return;
    if (result.error) {
      msgEl.innerHTML += `<div class="tool-error">Error: ${result.error}</div>`;
    } else {
      const toolName = msgEl.querySelector('.tool-name')?.textContent || '';
      msgEl.innerHTML += `<div class="tool-result">${this._summarizeToolResult(toolName, result)}</div>`;
    }
    this._scrollToBottom();
  }

  /** Show thinking indicator */
  showThinking(text = 'Thinking...') {
    this.removeThinking();
    const el = document.createElement('div');
    el.className = 'ai-chat-thinking';
    el.id = 'ai-thinking';
    el.innerHTML = `<div class="dots"><span></span><span></span><span></span></div> ${text}`;
    this.messagesEl.appendChild(el);
    this._scrollToBottom();
  }

  /** Remove thinking indicator */
  removeThinking() {
    const el = this.messagesEl.querySelector('#ai-thinking');
    if (el) el.remove();
  }

  /** Open the chat panel */
  open() {
    this._isOpen = true;
    this.fab.classList.add('hidden');
    this.panel.classList.add('visible');
    setTimeout(() => this.inputEl.focus(), 300);
  }

  /** Close the chat panel */
  close() {
    this._isOpen = false;
    this.panel.classList.remove('visible');
    setTimeout(() => this.fab.classList.remove('hidden'), 250);
  }

  /** Toggle open/close */
  toggle() {
    this._isOpen ? this.close() : this.open();
  }

  /** Remove all elements from DOM */
  destroy() {
    this.fab.remove();
    this.panel.remove();
    const style = document.getElementById('ai-chat-styles');
    if (style) style.remove();
  }

  /** @private */
  async _handleSend() {
    if (this._isSending) return;
    const text = this.inputEl.value.trim();
    if (!text) return;

    this.inputEl.value = '';
    this.inputEl.style.height = 'auto';
    this._isSending = true;
    this.sendBtn.disabled = true;

    this.addMessage('user', text);

    try {
      await this.onSend(text);
    } catch (err) {
      this.addMessage('system', `Error: ${err.message}`);
    } finally {
      this._isSending = false;
      this.sendBtn.disabled = false;
      this.removeThinking();
    }
  }

  /** @private */
  _scrollToBottom() {
    requestAnimationFrame(() => {
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    });
  }

  /** @private */
  _formatMessage(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
  }

  /** @private */
  _summarizeToolInput(name, input) {
    switch (name) {
      case 'create_layout': return `"${input.name}" ${input.width || 1920}x${input.height || 1080}`;
      case 'add_region': return `${input.width}x${input.height} on layout ${input.layoutId}`;
      case 'add_text_widget': return `text → playlist ${input.playlistId}`;
      case 'add_image_widget': return `image #${input.mediaId}`;
      case 'add_video_widget': return `video #${input.mediaId}`;
      case 'add_clock_widget': return `clock → playlist ${input.playlistId}`;
      case 'add_embedded_widget': return `HTML embed`;
      case 'publish_layout': return `layout #${input.layoutId}`;
      case 'list_layouts': return input.search ? `"${input.search}"` : '(all)';
      case 'list_media': return input.search ? `"${input.search}"` : `type:${input.type || 'all'}`;
      case 'create_campaign': return `"${input.name}"`;
      case 'assign_layout_to_campaign': return `layout #${input.layoutId} → campaign #${input.campaignId}`;
      case 'schedule_campaign': return `→ groups [${(input.displayGroupIds || []).join(',')}]`;
      case 'list_displays': return input.search ? `"${input.search}"` : '(all)';
      case 'list_display_groups': return input.search ? `"${input.search}"` : '(all)';
      case 'list_templates': return input.search ? `"${input.search}"` : '(all)';
      default: return JSON.stringify(input).substring(0, 60);
    }
  }

  /** @private */
  _summarizeToolResult(name, result) {
    if (Array.isArray(result)) {
      return `${result.length} result(s)`;
    }
    if (result.layoutId) return `Layout #${result.layoutId}`;
    if (result.regionId) return `Region #${result.regionId}`;
    if (result.widgetId) return `Widget #${result.widgetId}`;
    if (result.campaignId) return `Campaign #${result.campaignId}`;
    if (result.eventId) return `Scheduled (event #${result.eventId})`;
    if (result.status) return result.status;
    return 'Done';
  }
}
