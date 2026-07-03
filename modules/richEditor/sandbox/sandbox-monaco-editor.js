// ============================================================
//  sandbox-monaco-editor.js — Monaco 编辑器封装
//  单实例 + 多模型：每个文件一个 ITextModel，切换 Tab 时 setModel
//  复用 code-blocks.js 的 ensureMonaco 加载机制和 astroknot-dark 主题
// ============================================================

import { ensureMonaco, toMonacoLang } from '../core/code-blocks.js';
import { extensionToLanguage } from './sandbox-virtual-fs.js';

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
  }

  // ── 初始化 ──

  init(containerEl) {
    this._containerEl = containerEl;

    return new Promise((resolve) => {
      ensureMonaco(() => {
        this._createEditor();
        this._ready = true;
        resolve();
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
    });

    // 监听内容变更
    this._editor.onDidChangeModelContent(() => {
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

    // Ctrl+` 切换控制台
    this._editor.addAction({
      id: 'sandbox-toggle-console',
      label: '切换控制台',
      keybindings: [window.monaco.KeyMod.CtrlCmd | window.monaco.KeyCode.Backquote],
      run: () => {
        document.dispatchEvent(new CustomEvent('sandbox-toggle-console'));
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
    entry.model.setValue(content);
    entry.originalContent = content;
    entry.isDirty = false;
    this._onDirtyChange(filePath, false);
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

    // 创建新 model
    const lang = extensionToLanguage(newName);
    const uri = window.monaco.Uri.parse('inmemory://sandbox/' + newPath);
    let model = window.monaco.editor.getModel(uri);
    if (!model) {
      model = window.monaco.editor.createModel(content, lang, uri);
    }

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

  // ── 编辑器操作 ──

  focus() {
    if (this._editor) this._editor.focus();
  }

  layout() {
    if (this._editor) {
      this._editor.layout();
    }
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

    this._currentFilePath = null;
    this._ready = false;
  }
}

console.log('[sandbox-monaco-editor] 模块已加载');
