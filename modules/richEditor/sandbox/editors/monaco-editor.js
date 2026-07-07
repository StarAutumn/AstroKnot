// ============================================================
//  sandbox-monaco-editor.js — Monaco 编辑器封装
//  单实例 + 多模型：每个文件一个 ITextModel，切换 Tab 时 setModel
//  复用 code-blocks.js 的 ensureMonaco 加载机制和 astroknot-dark 主题
// ============================================================

import { ensureMonaco, toMonacoLang } from '../../core/code-blocks.js';
import { extensionToLanguage } from '../core/virtual-fs.js';

export class SandboxMonacoEditor {
  /**
   * @param {Function} onDirtyChange - 内容变更回调 (filePath, isDirty)
   * @param {Function} onContentChange - 内容变更回调 (filePath) 用于自动运行
   */
  constructor(onDirtyChange, onContentChange) {
    this._editor = null;
    this._models = new Map(); // filePath → { model, originalContent, isDirty }
    this._currentFilePath = null;
    this._onDirtyChange = onDirtyChange || function () {};
    this._onContentChange = onContentChange || function () {};
    this._containerEl = null;
    this._ready = false;
    this._bookmarks = new Map(); // lineNumber → column
    this._bookmarkDecorations = [];
  }

  // ── 初始化 ──

  init(containerEl) {
    this._containerEl = containerEl;

    return new Promise((resolve, reject) => {
      // 超时保护：30 秒内 Monaco 未加载则 reject
      const timeout = setTimeout(() => {
        reject(new Error('Monaco 编辑器加载超时'));
      }, 30000);

      ensureMonaco(() => {
        clearTimeout(timeout);
        try {
          this._createEditor();
          this._ready = true;
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  _createEditor() {
    if (this._editor) return;

    this._editor = window.monaco.editor.create(this._containerEl, {
      value: '',
      language: 'html',
      theme: 'astroknot-dark',
      automaticLayout: true,
      minimap: { enabled: true, scale: 2 },
      fontSize: 14,
      lineHeight: 22,
      tabSize: 2,
      wordWrap: 'on',
      scrollBeyondLastLine: false,
      bracketPairColorization: { enabled: true },
      guides: { bracketPairs: true, indentation: true },
      suggest: {
        showKeywords: true,
        showSnippets: true,
        showWords: true,
        showStatusBar: true,
        preview: true,
      },
      quickSuggestions: { other: true, comments: false, strings: true },
      suggestOnTriggerCharacters: true,
      acceptSuggestionOnEnter: 'on',
      tabCompletion: 'on',
      padding: { top: 8, bottom: 8 },
      renderWhitespace: 'none',
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      smoothScrolling: true,
      contextmenu: true,
      folding: true,
      foldingStrategy: 'indentation',
      showFoldingControls: 'always',
      overviewRulerBorder: false,
      formatOnPaste: true,
      formatOnType: true,
      linkedEditing: true,
      glyphMargin: true,
    });

    // 监听内容变更
    this._suppressChangeCallback = false; // 防止 setFileContent 等内部操作触发多余回调
    this._editor.onDidChangeModelContent(() => {
      if (this._suppressChangeCallback) return;
      if (!this._currentFilePath) return;
      const entry = this._models.get(this._currentFilePath);
      if (!entry) return;

      const currentContent = entry.model.getValue();
      const wasDirty = entry.isDirty;
      entry.isDirty = currentContent !== entry.originalContent;

      if (wasDirty !== entry.isDirty) {
        this._onDirtyChange(this._currentFilePath, entry.isDirty);
      }
      // 通知外部（用于自动运行）
      this._onContentChange(this._currentFilePath);
    });

    // 监听光标位置变更（用于状态栏）
    this._editor.onDidChangeCursorPosition((e) => {
      if (this._onCursorPositionChange) {
        this._onCursorPositionChange(e.position);
      }
    });

    // ── 快捷键 ──
    // Ctrl+S 保存
    this._editor.addAction({
      id: 'sandbox-save-file',
      label: '保存文件',
      keybindings: [window.monaco.KeyMod.CtrlCmd | window.monaco.KeyCode.KeyS],
      run: () => {
        document.dispatchEvent(new CustomEvent('sandbox-save'));
      }
    });

    // Ctrl+Enter 运行预览
    this._editor.addAction({
      id: 'sandbox-run-preview',
      label: '运行预览',
      keybindings: [window.monaco.KeyMod.CtrlCmd | window.monaco.KeyCode.Enter],
      run: () => {
        document.dispatchEvent(new CustomEvent('sandbox-run'));
      }
    });

    // Ctrl+W 关闭当前标签
    this._editor.addAction({
      id: 'sandbox-close-tab',
      label: '关闭当前标签',
      keybindings: [window.monaco.KeyMod.CtrlCmd | window.monaco.KeyCode.KeyW],
      run: () => {
        document.dispatchEvent(new CustomEvent('sandbox-close-tab'));
      }
    });

    // Ctrl+` 切换底部面板（控制台/终端）
    this._editor.addAction({
      id: 'sandbox-toggle-console',
      label: '切换底部面板',
      keybindings: [window.monaco.KeyMod.CtrlCmd | window.monaco.KeyCode.Backquote],
      run: () => {
        document.dispatchEvent(new CustomEvent('sandbox-toggle-console'));
      }
    });

    // Ctrl+Shift+` 新建终端
    this._editor.addAction({
      id: 'sandbox-new-terminal',
      label: '新建终端',
      keybindings: [window.monaco.KeyMod.CtrlCmd | window.monaco.KeyMod.Shift | window.monaco.KeyCode.Backquote],
      run: () => {
        document.dispatchEvent(new CustomEvent('sandbox-new-terminal'));
      }
    });

    // Ctrl+Shift+F 全局搜索
    this._editor.addAction({
      id: 'sandbox-global-search',
      label: '全局搜索',
      keybindings: [
        window.monaco.KeyMod.CtrlCmd | window.monaco.KeyMod.Shift | window.monaco.KeyCode.KeyF
      ],
      run: () => {
        document.dispatchEvent(new CustomEvent('sandbox-global-search'));
      }
    });

    // Ctrl+P 快速打开文件
    this._editor.addAction({
      id: 'sandbox-quick-open',
      label: '快速打开文件',
      keybindings: [window.monaco.KeyMod.CtrlCmd | window.monaco.KeyCode.KeyP],
      run: () => {
        document.dispatchEvent(new CustomEvent('sandbox-quick-open'));
      }
    });

    // F1 / Shift+Alt+F 格式化文档
    this._editor.addAction({
      id: 'sandbox-format-document',
      label: '格式化文档',
      keybindings: [window.monaco.KeyMod.Shift | window.monaco.KeyMod.Alt | window.monaco.KeyCode.KeyF],
      run: () => {
        this._editor.getAction('editor.action.formatDocument').run();
      }
    });

    // Ctrl+Shift+P 命令面板
    this._editor.addAction({
      id: 'sandbox-command-palette',
      label: '命令面板',
      keybindings: [window.monaco.KeyMod.CtrlCmd | window.monaco.KeyMod.Shift | window.monaco.KeyCode.KeyP],
      run: () => {
        document.dispatchEvent(new CustomEvent('sandbox-command-palette'));
      }
    });

    // Ctrl+M Ctrl+B 切换书签 (简化为 Ctrl+F2)
    this._editor.addAction({
      id: 'sandbox-toggle-bookmark',
      label: '切换书签',
      keybindings: [window.monaco.KeyMod.CtrlCmd | window.monaco.KeyCode.F2],
      run: () => { this.toggleBookmark(); }
    });

    // F2 下一个书签
    this._editor.addAction({
      id: 'sandbox-next-bookmark',
      label: '下一个书签',
      keybindings: [window.monaco.KeyCode.F2],
      run: () => { this.nextBookmark(); }
    });

    // Shift+F2 上一个书签
    this._editor.addAction({
      id: 'sandbox-prev-bookmark',
      label: '上一个书签',
      keybindings: [window.monaco.KeyMod.Shift | window.monaco.KeyCode.F2],
      run: () => { this.prevBookmark(); }
    });

    // Ctrl+= 放大字体
    this._editor.addAction({
      id: 'sandbox-zoom-in',
      label: '放大字体',
      keybindings: [window.monaco.KeyMod.CtrlCmd | window.monaco.KeyCode.Equal],
      run: () => { this.zoomFont(1); document.dispatchEvent(new CustomEvent('sandbox-update-statusbar')); }
    });

    // Ctrl+- 缩小字体
    this._editor.addAction({
      id: 'sandbox-zoom-out',
      label: '缩小字体',
      keybindings: [window.monaco.KeyMod.CtrlCmd | window.monaco.KeyCode.Minus],
      run: () => { this.zoomFont(-1); document.dispatchEvent(new CustomEvent('sandbox-update-statusbar')); }
    });

    // Ctrl+0 重置字体
    this._editor.addAction({
      id: 'sandbox-zoom-reset',
      label: '重置字体大小',
      keybindings: [window.monaco.KeyMod.CtrlCmd | window.monaco.KeyCode.Digit0],
      run: () => { this.setFontSize(14); document.dispatchEvent(new CustomEvent('sandbox-update-statusbar')); }
    });

    // 字体缩放：Ctrl + 滚轮
    this._editor.onMouseWheel((e) => {
      // 防御性检查：Monaco 异步派发队列中的事件可能丢失 browserEvent
      if (!e || !e.browserEvent) return;
      if (e.browserEvent.ctrlKey || e.browserEvent.metaKey) {
        e.browserEvent.preventDefault();
        this.zoomFont(e.delta > 0 ? -1 : 1);
        document.dispatchEvent(new CustomEvent('sandbox-update-statusbar'));
      }
    });
  }

  // ── 文件操作 ──

  /**
   * 打开文件（创建或复用 model）
   * @param {Object} file - { path, name, content, language }
   */
  openFile(file) {
    if (!this._editor) return;

    let entry = this._models.get(file.path);

    if (!entry) {
      // 创建新 model
      const lang = file.language || extensionToLanguage(file.name);
      const uri = window.monaco.Uri.parse('inmemory://sandbox/' + file.path);
      let model = window.monaco.editor.getModel(uri);

      if (!model) {
        model = window.monaco.editor.createModel(file.content || '', lang, uri);
      }

      entry = {
        model: model,
        originalContent: file.content || '',
        isDirty: false
      };
      this._models.set(file.path, entry);
    }

    // 切换 model
    this._editor.setModel(entry.model);
    this._currentFilePath = file.path;
    this._editor.focus();
  }

  /**
   * 关闭文件 model
   */
  closeFile(filePath) {
    const entry = this._models.get(filePath);
    if (!entry) return;

    entry.model.dispose();
    this._models.delete(filePath);

    if (this._currentFilePath === filePath) {
      this._currentFilePath = null;
      if (this._models.size > 0) {
        // 切换到下一个
        const nextPath = this._models.keys().next().value;
        this.openFileFromPath(nextPath);
      } else {
        this._editor.setModel(null);
      }
    }
  }

  /**
   * 从已存在的 model 中打开文件
   */
  openFileFromPath(filePath) {
    const entry = this._models.get(filePath);
    if (!entry) return;
    this._editor.setModel(entry.model);
    this._currentFilePath = filePath;
    this._editor.focus();
  }

  /**
   * 跳转到指定文件的指定行/列（用于搜索结果点击）
   */
  revealLine(filePath, lineNumber, column) {
    if (!this._editor) return;
    // 如果文件未打开，先打开
    if (this._currentFilePath !== filePath) {
      const entry = this._models.get(filePath);
      if (!entry) return;
      this._editor.setModel(entry.model);
      this._currentFilePath = filePath;
    }
    // 跳转到行
    this._editor.revealLineInCenter(lineNumber || 1);
    this._editor.setPosition({
      lineNumber: lineNumber || 1,
      column: column || 1
    });
    this._editor.focus();
  }

  /**
   * 获取指定文件的当前内容
   */
  getContent(filePath) {
    const entry = this._models.get(filePath || this._currentFilePath);
    return entry ? entry.model.getValue() : '';
  }

  /**
   * 直接设置文件内容（用于历史恢复）
   */
  setFileContent(filePath, content) {
    const entry = this._models.get(filePath);
    if (!entry) return;
    this._suppressChangeCallback = true;
    try {
      entry.model.setValue(content);
      entry.originalContent = content;
      entry.isDirty = false;
      this._onDirtyChange(filePath, false);
    } finally {
      this._suppressChangeCallback = false;
    }
  }

  /**
   * 获取当前文件路径
   */
  getCurrentFilePath() {
    return this._currentFilePath;
  }

  /**
   * 将所有 model 的内容同步回虚拟文件系统
   */
  syncAllToFS(vfs) {
    for (const [filePath, entry] of this._models) {
      const content = entry.model.getValue();
      vfs.setFile(filePath, content);
    }
  }

  /**
   * 标记指定文件为已保存
   */
  markSaved(filePath) {
    const entry = this._models.get(filePath);
    if (entry) {
      entry.originalContent = entry.model.getValue();
      entry.isDirty = false;
      this._onDirtyChange(filePath, false);
    }
  }

  /**
   * 标记所有文件为已保存
   */
  markAllSaved() {
    for (const [filePath, entry] of this._models) {
      entry.originalContent = entry.model.getValue();
      entry.isDirty = false;
      this._onDirtyChange(filePath, false);
    }
  }

  /**
   * 文件重命名时更新 model
   */
  renameFile(oldPath, newPath, newName) {
    const entry = this._models.get(oldPath);
    if (!entry) return;

    // 销毁旧 model
    const content = entry.model.getValue();
    entry.model.dispose();
    this._models.delete(oldPath);

    // 创建新 model（强制新建，不复用可能存在的旧 model）
    const lang = extensionToLanguage(newName);
    const uri = window.monaco.Uri.parse('inmemory://sandbox/' + newPath);
    // 先清理可能残留的同 URI model（例如删除后重命名为同名文件）
    const existingModel = window.monaco.editor.getModel(uri);
    if (existingModel) {
      existingModel.dispose();
    }
    const model = window.monaco.editor.createModel(content, lang, uri);

    const newEntry = {
      model: model,
      originalContent: entry.originalContent,
      isDirty: entry.isDirty
    };
    this._models.set(newPath, newEntry);

    // 如果当前打开的是旧文件，切换到新 model
    if (this._currentFilePath === oldPath) {
      this._currentFilePath = newPath;
      this._editor.setModel(model);
    }
  }

  /**
   * 删除文件时清理 model
   */
  deleteFile(filePath) {
    this.closeFile(filePath);
  }

  // ── 编辑器访问 ──

  /** 获取原始 Monaco 编辑器实例 */
  get editor() { return this._editor; }

  /** 获取编辑器 DOM 节点 */
  getDomNode() { return this._editor?.getDomNode() || null; }

  // ── 编辑器操作 ──

  focus() {
    if (this._editor) this._editor.focus();
  }

  layout() {
    if (this._editor) {
      this._editor.layout();
    }
  }

  // ── 光标位置回调 ──

  onCursorPositionChange(callback) {
    this._onCursorPositionChange = callback;
  }

  // ── 缩略图 ──

  setMinimapEnabled(enabled) {
    if (this._editor) {
      this._editor.updateOptions({ minimap: { enabled } });
    }
  }

  isMinimapEnabled() {
    if (this._editor) {
      try {
        return this._editor.getOption(window.monaco.editor.EditorOption.minimap).enabled;
      } catch (e) {
        return true;
      }
    }
    return true;
  }

  // ── 语言信息 ──

  getCurrentLanguageId() {
    if (this._editor) {
      const model = this._editor.getModel();
      if (model) return model.getLanguageId();
    }
    return '';
  }

  // ── 字体缩放 ──

  getFontSize() {
    if (this._editor) {
      try {
        return this._editor.getOption(window.monaco.editor.EditorOption.fontSize);
      } catch (e) { return 14; }
    }
    return 14;
  }

  setFontSize(size) {
    if (this._editor) {
      size = Math.max(8, Math.min(36, size));
      this._editor.updateOptions({ fontSize: size });
    }
  }

  zoomFont(delta) {
    this.setFontSize(this.getFontSize() + delta);
  }

  // ── Tab 大小 ──

  getTabSize() {
    if (this._editor) {
      try {
        return this._editor.getOption(window.monaco.editor.EditorOption.tabSize);
      } catch (e) { return 2; }
    }
    return 2;
  }

  setTabSize(size) {
    if (this._editor) {
      this._editor.updateOptions({ tabSize: size, indentSize: size });
    }
  }

  // ── 自动换行 ──

  isWordWrapEnabled() {
    if (this._editor) {
      try {
        const v = this._editor.getOption(window.monaco.editor.EditorOption.wordWrap);
        return v !== 'off';
      } catch (e) { return true; }
    }
    return true;
  }

  setWordWrap(enabled) {
    if (this._editor) {
      this._editor.updateOptions({ wordWrap: enabled ? 'on' : 'off' });
    }
  }

  // ── 代码统计 ──

  getStats() {
    if (!this._editor) return { lines: 0, chars: 0, selected: 0 };
    const model = this._editor.getModel();
    if (!model) return { lines: 0, chars: 0, selected: 0 };
    const content = model.getValue();
    const lines = model.getLineCount();
    const chars = content.length;
    const selection = this._editor.getSelection();
    let selected = 0;
    if (selection && !selection.isEmpty()) {
      selected = model.getValueInRange(selection).length;
    }
    return { lines, chars, selected };
  }

  // ── 书签 ──

  toggleBookmark() {
    if (!this._editor) return;
    const pos = this._editor.getPosition();
    if (!pos) return;
    const key = pos.lineNumber;
    if (this._bookmarks.has(key)) {
      this._bookmarks.delete(key);
    } else {
      this._bookmarks.set(key, pos.column);
    }
    this._renderBookmarks();
  }

  nextBookmark() {
    if (!this._editor || this._bookmarks.size === 0) return;
    const pos = this._editor.getPosition();
    const currentLine = pos ? pos.lineNumber : 0;
    const lines = Array.from(this._bookmarks.keys()).sort((a, b) => a - b);
    let next = lines.find(l => l > currentLine);
    if (!next) next = lines[0]; // 循环到第一个
    this._editor.revealLineInCenter(next);
    this._editor.setPosition({ lineNumber: next, column: this._bookmarks.get(next) });
    this._editor.focus();
  }

  prevBookmark() {
    if (!this._editor || this._bookmarks.size === 0) return;
    const pos = this._editor.getPosition();
    const currentLine = pos ? pos.lineNumber : Infinity;
    const lines = Array.from(this._bookmarks.keys()).sort((a, b) => b - a);
    let prev = lines.find(l => l < currentLine);
    if (!prev) prev = lines[0]; // 循环到最后一个
    this._editor.revealLineInCenter(prev);
    this._editor.setPosition({ lineNumber: prev, column: this._bookmarks.get(prev) });
    this._editor.focus();
  }

  clearBookmarks() {
    this._bookmarks.clear();
    this._renderBookmarks();
  }

  getBookmarks() {
    return Array.from(this._bookmarks.keys()).sort((a, b) => a - b);
  }

  _renderBookmarks() {
    if (!this._editor) return;
    // 清除旧装饰
    if (this._bookmarkDecorations) {
      this._editor.removeDecorations(this._bookmarkDecorations);
    }
    if (this._bookmarks.size === 0) {
      this._bookmarkDecorations = [];
      return;
    }
    const decorations = [];
    for (const [line,] of this._bookmarks) {
      decorations.push({
        range: new window.monaco.Range(line, 1, line, 1),
        options: {
          isWholeLine: true,
          glyphMarginClassName: 'bookmark-glyph',
          glyphMarginHoverMessage: { value: '🔖 书签 (行 ' + line + ')' },
          overviewRuler: { color: '#ff0', position: window.monaco.editor.OverviewRulerLane.Center },
        }
      });
    }
    this._bookmarkDecorations = this._editor.deltaDecorations(this._bookmarkDecorations || [], decorations);
  }

  // ── 销毁 ──

  dispose() {
    // 销毁所有 models
    for (const [, entry] of this._models) {
      entry.model.dispose();
    }
    this._models.clear();

    // 销毁编辑器实例
    if (this._editor) {
      this._editor.dispose();
      this._editor = null;
    }

    // 清理容器 DOM 内容（Monaco 在容器内创建的 DOM）
    if (this._containerEl) {
      this._containerEl.innerHTML = '';
      this._containerEl = null;
    }

    // 清理书签状态
    this._bookmarks.clear();
    this._bookmarkDecorations = [];

    this._currentFilePath = null;
    this._ready = false;
  }
}

console.log('[sandbox-monaco-editor] 模块已加载');
