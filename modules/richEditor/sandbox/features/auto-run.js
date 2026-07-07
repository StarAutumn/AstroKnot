// ============================================================
//  sandbox-auto-run.js — 自动运行 + 自动保存
//  内容变更时触发预览运行（防抖）和磁盘保存（防抖）
// ============================================================

import { appState } from '../../../module0_AppState.js';

export class SandboxAutoRun {
  /**
   * @param {import('../core/context.js').SandboxContext} ctx
   */
  constructor(ctx) {
    this.ctx = ctx;
    this._autoRunEnabled = true;
    this._autoRunTimer = null;
    this._autoSaveTimer = null;
    this._lastAutoSavePath = null;
    this.AUTO_RUN_DEBOUNCE = 800;
    this.AUTO_SAVE_DELAY = 3000;
  }

  init() {
    this.ctx.registerAction('toggleAutoRun', () => this.toggleAutoRun());
  }

  destroy() {
    if (this._autoRunTimer) {
      clearTimeout(this._autoRunTimer);
      this._autoRunTimer = null;
    }
    if (this._autoSaveTimer) {
      clearTimeout(this._autoSaveTimer);
      this._autoSaveTimer = null;
    }
    this._lastAutoSavePath = null;
    this._autoRunEnabled = true;
  }

  get autoRunEnabled() { return this._autoRunEnabled; }

  toggleAutoRun() {
    this._autoRunEnabled = !this._autoRunEnabled;
    if (!this._autoRunEnabled && this._autoRunTimer) {
      clearTimeout(this._autoRunTimer);
      this._autoRunTimer = null;
    }
    this.ctx.setStatus(this._autoRunEnabled ? '自动运行已开启' : '自动运行已关闭');
  }

  /**
   * 内容变更调度：触发自动运行 + 自动保存
   *
   * 注意：此处不可 emit('contentChange')，否则会与 index.js 的
   *   _ctx.on('contentChange', → _onContentChange → autoRun.onContentChange)
   * 形成无限递归（Maximum call stack size exceeded）。
   * contentChange 事件由 Monaco 回调或 split-editor 发出，本方法仅负责消费。
   *
   * @param {string} filePath
   */
  onContentChange(filePath) {
    // 自动运行
    if (this._autoRunEnabled) {
      if (this._autoRunTimer) clearTimeout(this._autoRunTimer);
      this._autoRunTimer = setTimeout(() => {
        this._autoRunTimer = null;
        // 调用 preview 模块的 runPreview
        const preview = this.ctx.getModule('preview');
        if (preview) preview.runPreview(false);
      }, this.AUTO_RUN_DEBOUNCE);
    }

    // 自动保存到磁盘（防抖实时同步）
    this.triggerAutoSave(filePath);
  }

  /**
   * 触发自动保存（防抖）
   */
  triggerAutoSave(filePath) {
    if (!filePath) return;
    this._lastAutoSavePath = filePath;

    if (this._autoSaveTimer) clearTimeout(this._autoSaveTimer);
    this._autoSaveTimer = setTimeout(() => {
      this._autoSaveCurrentFile();
    }, this.AUTO_SAVE_DELAY);
  }

  /**
   * 自动保存当前文件到磁盘
   */
  async _autoSaveCurrentFile() {
    const vfs = this.ctx.vfs;
    const monacoEditor = this.ctx.monacoEditor;
    const currentNodeId = this.ctx.currentNodeId;
    if (!currentNodeId || !vfs || !monacoEditor) return;
    if (!this._lastAutoSavePath) return;

    const node = appState.nodeMap.get(currentNodeId);
    if (!node) return;

    // 同步 Monaco 内容到 VFS
    monacoEditor.syncAllToFS(vfs);
    // 同步第二编辑器（分屏模块未迁移时通过事件通知）
    this.ctx.emit('syncSplitEditor', vfs);

    // 获取项目文件夹路径
    const proj = appState.projects?.find(p => p.id === appState.currentProjectId);
    const projectFolderPath = proj?.folderPath || null;

    // 写入单个文件到磁盘
    const success = await vfs.writeSingleFileToDisk(projectFolderPath, currentNodeId, this._lastAutoSavePath);

    if (success) {
      node.fileSystem = vfs.toJSON();
      console.log(`[自动保存] ${this._lastAutoSavePath} 已写入磁盘`);
      this.ctx.setStatus('已自动保存到磁盘 ✓');
    } else {
      console.warn(`[自动保存] ${this._lastAutoSavePath} 写入失败`);
    }
  }
}

console.log('[sandbox-auto-run] 模块已加载');
