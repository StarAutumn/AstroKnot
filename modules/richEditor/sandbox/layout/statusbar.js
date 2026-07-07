// ============================================================
//  sandbox-statusbar.js — 状态栏模块
//  光标位置、语言、缩略图、Tab大小、换行、字体、书签、代码统计
// ============================================================

export class SandboxStatusBar {
  /**
   * @param {import('../core/context.js').SandboxContext} ctx
   */
  constructor(ctx) {
    this._ctx = ctx;
    this._initialized = false;
    this._cursorChangeCallback = null;
    this._statusBarUpdateHandler = null;
  }

  // ─── 生命周期 ────────────────────────────────────────────

  init() {
    if (this._initialized) return;
    const monacoEditor = this._ctx.monacoEditor;
    if (!monacoEditor) return;

    this._initialized = true;

    // 光标位置更新 + 代码统计
    this._cursorChangeCallback = (pos) => {
      const el = document.getElementById('statusCursorPos');
      if (el) el.textContent = '行 ' + pos.lineNumber + ', 列 ' + pos.column;
      this._updateStats();
    };
    monacoEditor.onCursorPositionChange(this._cursorChangeCallback);

    // 缩略图切换
    const minimapToggle = document.getElementById('statusMinimapToggle');
    if (minimapToggle) minimapToggle.addEventListener('click', () => this.toggleMinimap());

    // Tab 大小切换
    const indentEl = document.getElementById('statusIndent');
    if (indentEl) indentEl.addEventListener('click', () => {
      const cur = monacoEditor.getTabSize();
      monacoEditor.setTabSize(cur === 2 ? 4 : 2);
      this.update();
      this._ctx.setStatus('Tab 大小: ' + (cur === 2 ? 4 : 2));
    });

    // 自动换行切换
    const wrapEl = document.getElementById('statusWordWrap');
    if (wrapEl) wrapEl.addEventListener('click', () => {
      const cur = monacoEditor.isWordWrapEnabled();
      monacoEditor.setWordWrap(!cur);
      this.update();
      this._ctx.setStatus('自动换行: ' + (!cur ? '开' : '关'));
    });

    // 字体大小点击重置
    const fontEl = document.getElementById('statusFontSize');
    if (fontEl) fontEl.addEventListener('click', () => {
      monacoEditor.setFontSize(14);
      this.update();
      this._ctx.setStatus('字体大小已重置为 14px');
    });

    // 书签点击 — 跳转
    const bookmarkEl = document.getElementById('statusBookmark');
    if (bookmarkEl) bookmarkEl.addEventListener('click', () => monacoEditor.nextBookmark());

    // 内容变更时更新统计
    this._statusBarUpdateHandler = () => this.update();
    document.addEventListener('sandbox-update-statusbar', this._statusBarUpdateHandler);

    // 注册 action
    this._ctx.registerAction('toggleMinimap', () => this.toggleMinimap());
  }

  destroy() {
    if (this._statusBarUpdateHandler) {
      document.removeEventListener('sandbox-update-statusbar', this._statusBarUpdateHandler);
      this._statusBarUpdateHandler = null;
    }
    this._cursorChangeCallback = null;
    this._initialized = false;
  }

  // ─── 更新状态栏 ──────────────────────────────────────────

  update() {
    const monacoEditor = this._ctx.monacoEditor;
    if (!monacoEditor) return;

    // 语言
    const langEl = document.getElementById('statusLanguage');
    if (langEl) {
      const langId = monacoEditor.getCurrentLanguageId();
      const langMap = {
        'html': 'HTML', 'css': 'CSS', 'scss': 'SCSS', 'less': 'LESS',
        'javascript': 'JavaScript', 'typescript': 'TypeScript',
        'json': 'JSON', 'markdown': 'Markdown', 'python': 'Python',
        'xml': 'XML', 'yaml': 'YAML', 'plaintext': '纯文本',
        'shell': 'Shell', 'sql': 'SQL', 'graphql': 'GraphQL',
      };
      langEl.textContent = langMap[langId] || langId || '';
    }

    // 缩略图
    const minimapEl = document.getElementById('statusMinimapToggle');
    if (minimapEl) {
      const enabled = monacoEditor.isMinimapEnabled();
      minimapEl.textContent = '缩略图 ' + (enabled ? '✓' : '✕');
    }

    // Tab 大小
    const indentEl = document.getElementById('statusIndent');
    if (indentEl) indentEl.textContent = 'Tab: ' + monacoEditor.getTabSize();

    // 自动换行
    const wrapEl = document.getElementById('statusWordWrap');
    if (wrapEl) {
      const on = monacoEditor.isWordWrapEnabled();
      wrapEl.textContent = '换行: ' + (on ? '开' : '关');
    }

    // 字体大小
    const fontEl = document.getElementById('statusFontSize');
    if (fontEl) fontEl.textContent = monacoEditor.getFontSize() + 'px';

    // 书签
    const bookmarkEl = document.getElementById('statusBookmark');
    if (bookmarkEl) {
      const bookmarks = monacoEditor.getBookmarks();
      if (bookmarks.length > 0) {
        bookmarkEl.style.display = '';
        bookmarkEl.textContent = '🔖 ' + bookmarks.length;
      } else {
        bookmarkEl.style.display = 'none';
      }
    }

    this._updateStats();
  }

  // ─── 切换缩略图 ──────────────────────────────────────────

  toggleMinimap() {
    const monacoEditor = this._ctx.monacoEditor;
    if (!monacoEditor) return;
    const current = monacoEditor.isMinimapEnabled();
    monacoEditor.setMinimapEnabled(!current);
    this.update();
  }

  // ─── 代码统计 ────────────────────────────────────────────

  _updateStats() {
    const monacoEditor = this._ctx.monacoEditor;
    if (!monacoEditor) return;
    const statsEl = document.getElementById('statusStats');
    if (!statsEl) return;
    const s = monacoEditor.getStats();
    if (s.selected > 0) {
      statsEl.textContent = s.lines + ' 行 · ' + s.chars + ' 字 (选中 ' + s.selected + ')';
    } else {
      statsEl.textContent = s.lines + ' 行 · ' + s.chars + ' 字';
    }
  }
}

console.log('[sandbox-statusbar] 模块已加载');
