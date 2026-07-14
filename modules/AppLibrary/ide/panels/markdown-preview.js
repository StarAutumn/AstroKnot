/**
 * SandboxMarkdownPreview - Handles Markdown preview in the sandbox IDE.
 *
 * Manages split-view Markdown rendering alongside the Monaco editor,
 * including mode transitions and debounced preview updates.
 */

const MD_PREVIEW_DEBOUNCE = 300;

class SandboxMarkdownPreview {
  /**
   * @param {object} ctx - SandboxContext instance.
   */
  constructor(ctx) {
    /** @type {object} SandboxContext */
    this._ctx = ctx;

    /** @type {boolean} Whether Markdown split-view mode is active. */
    this._isMarkdownMode = false;

    /** @type {number|null} Debounce timer for preview rendering. */
    this._mdPreviewTimer = null;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Initialise the module. Registers actions on the context.
   */
  init() {
    this._ctx.registerAction('exitMarkdownMode', () => this.exitMarkdownMode());
  }

  /**
   * Tear down the module. Exits Markdown mode and clears timers.
   */
  destroy() {
    this.exitMarkdownMode();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Whether the editor is currently in Markdown split-view mode.
   * @returns {boolean}
   */
  get isMarkdownMode() {
    return this._isMarkdownMode;
  }

  /**
   * Check whether a file path corresponds to a Markdown file.
   * @param {string} filePath
   * @returns {boolean}
   */
  static isMarkdownFile(filePath) {
    return filePath && (filePath.endsWith('.md') || filePath.endsWith('.mdx'));
  }

  /**
   * Enter Markdown split-view mode. Adds the `md-split-mode` CSS class to the
   * editor area and triggers the initial preview render.
   */
  enterMarkdownMode() {
    if (this._isMarkdownMode) return;
    this._isMarkdownMode = true;

    const editorArea = document.querySelector('.sandbox-editor-area');
    if (editorArea) editorArea.classList.add('md-split-mode');

    this.renderMarkdownPreview();
  }

  /**
   * Exit Markdown split-view mode. Removes the CSS class, hides the preview
   * pane, and cancels any pending debounced render.
   */
  exitMarkdownMode() {
    if (!this._isMarkdownMode) return;
    this._isMarkdownMode = false;

    const editorArea = document.querySelector('.sandbox-editor-area');
    if (editorArea) editorArea.classList.remove('md-split-mode');

    const mdPreview = document.getElementById('sandboxMarkdownPreview');
    if (mdPreview) mdPreview.style.display = 'none';

    if (this._mdPreviewTimer) {
      clearTimeout(this._mdPreviewTimer);
      this._mdPreviewTimer = null;
    }
  }

  /**
   * Render (or re-render) the Markdown preview pane using the current editor
   * content. Uses `window.marked` when available; falls back to an escaped
   * `<pre>` block otherwise.
   */
  renderMarkdownPreview() {
    const monacoEditor = this._ctx.monacoEditor;
    if (!monacoEditor || !this._isMarkdownMode) return;

    const content = monacoEditor.getContent();
    const body = document.getElementById('mdPreviewBody');

    if (!body) return;

    try {
      if (window.marked && window.marked.parse) {
        body.innerHTML = window.marked.parse(content);
      } else {
        body.innerHTML = '<pre>' + this._escapeHtml(content) + '</pre>';
      }
    } catch (e) {
      body.innerHTML = '<pre>' + this._escapeHtml(content) + '</pre>';
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Escape HTML special characters in a string.
   * @param {string} str - Raw string to escape.
   * @returns {string} HTML-safe string.
   */
  _escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}

export { SandboxMarkdownPreview };
console.log('[sandbox-markdown-preview] 模块已加载');
