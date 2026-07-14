// ============================================================
//  sandbox-split-editor.js — 分屏编辑模块
//  管理第二个 Monaco 编辑器和标签页组，支持拖拽调整分屏比例
// ============================================================

import { FileTabsComponent } from '../editors/tabs.js';
import { SandboxMonacoEditor } from '../editors/monaco-editor.js';
import { SandboxImagePreview } from './image-preview.js';

export class SandboxSplitEditor {
  /**
   * @param {import('../core/context.js').SandboxContext} ctx
   */
  constructor(ctx) {
    this._ctx = ctx;
    this._monacoEditor2 = null;
    this._fileTabs2 = null;
    this._isSplitMode = false;

    // 拖拽调整分屏 resize 状态
    this._resizeBound = false;
    this._onMoveHandler = null;
    this._onUpHandler = null;
  }

  // ─── 生命周期 ────────────────────────────────────────────

  init() {
    this._ctx.registerAction('toggleSplit', () => this.toggleSplitEditor());
  }

  destroy() {
    if (this._isSplitMode) {
      this.closeSplitEditor();
    }
    this._monacoEditor2 = null;
    this._fileTabs2 = null;
    this._isSplitMode = false;
    this._resizeBound = false;
  }

  // ─── 公开属性 ────────────────────────────────────────────

  get isSplitMode() {
    return this._isSplitMode;
  }

  get monacoEditor2() {
    return this._monacoEditor2;
  }

  get fileTabs2() {
    return this._fileTabs2;
  }

  // ─── 核心方法 ────────────────────────────────────────────

  async toggleSplitEditor() {
    if (this._isSplitMode) {
      this.closeSplitEditor();
    } else {
      await this.openSplitEditor();
    }
  }

  async openSplitEditor() {
    if (this._isSplitMode || !this._ctx.vfs) return;
    this._isSplitMode = true;

    const group2 = document.getElementById('sandboxEditorGroup2');
    const splitHandle = document.getElementById('sandboxSplitHandle');
    if (!group2 || !splitHandle) return;

    group2.style.display = 'flex';
    splitHandle.style.display = 'block';

    // 初始化第二个标签页
    const tabsContainer2 = document.getElementById('sandboxTabsContainer2');
    if (tabsContainer2 && !this._fileTabs2) {
      this._fileTabs2 = new FileTabsComponent(
        tabsContainer2,
        (filePath) => this._onFileSelectGroup2(filePath),
        (filePath) => this._onTabCloseGroup2(filePath),
        {
          onCloseOthers: (keepPath) => this._onCloseOthersGroup2(keepPath),
          onCloseAll: () => this._onCloseAllGroup2(),
          onCloseSaved: () => {},
          onCopyPath: (filePath) => this._ctx.emit('copyPath', filePath),
          onRevealInTree: (filePath) => this._ctx.emit('revealInTree', filePath),
          onClosePreviewTab: () => {},
          onSplitRight: () => {}
        }
      );
    }

    // 初始化第二个 Monaco 编辑器
    const monacoContainer2 = document.getElementById('sandboxMonacoContainer2');
    if (monacoContainer2 && !this._monacoEditor2) {
      this._monacoEditor2 = new SandboxMonacoEditor(
        (filePath, isDirty) => {
          if (this._fileTabs2) {
            if (isDirty) this._fileTabs2.markDirty(filePath);
            else this._fileTabs2.markClean(filePath);
          }
          const fileTabs = this._ctx.fileTabs;
          if (fileTabs) {
            if (isDirty) fileTabs.markDirty(filePath);
            else fileTabs.markClean(filePath);
          }
        },
        (filePath) => this._ctx.emit('contentChange', filePath)
      );
      await this._monacoEditor2.init(monacoContainer2);
    }

    // 默认打开当前主编辑器中的文件
    const monacoEditor = this._ctx.monacoEditor;
    if (monacoEditor) {
      const currentPath = monacoEditor.getCurrentFilePath();
      if (currentPath && this._monacoEditor2) {
        const file = this._ctx.vfs.getFile(currentPath);
        if (file) {
          this._fileTabs2.openTab(currentPath, file.name);
          this._monacoEditor2.openFile(file);
        }
      }
    }

    this._initSplitResize();
    this._ctx.setStatus('分屏编辑已开启');
    if (monacoEditor) setTimeout(() => monacoEditor.layout(), 50);
    if (this._monacoEditor2) setTimeout(() => this._monacoEditor2.layout(), 100);
  }

  closeSplitEditor() {
    if (!this._isSplitMode) return;
    this._isSplitMode = false;

    if (this._monacoEditor2 && this._ctx.vfs) {
      this._monacoEditor2.syncAllToFS(this._ctx.vfs);
    }

    if (this._monacoEditor2) {
      this._monacoEditor2.dispose();
      this._monacoEditor2 = null;
    }
    if (this._fileTabs2) {
      this._fileTabs2.closeAll();
      this._fileTabs2.destroy();
      this._fileTabs2 = null;
    }

    const group2 = document.getElementById('sandboxEditorGroup2');
    const splitHandle = document.getElementById('sandboxSplitHandle');
    if (group2) group2.style.display = 'none';
    if (splitHandle) splitHandle.style.display = 'none';

    this._ctx.setStatus('分屏编辑已关闭');
    const monacoEditor = this._ctx.monacoEditor;
    if (monacoEditor) setTimeout(() => monacoEditor.layout(), 50);
  }

  async onSplitRight(filePath) {
    if (!this._isSplitMode) {
      await this.openSplitEditor();
    }
    if (this._monacoEditor2 && this._fileTabs2 && this._ctx.vfs) {
      const file = this._ctx.vfs.getFile(filePath);
      if (file && !SandboxImagePreview.isImageFile(filePath)) {
        this._fileTabs2.openTab(filePath, file.name);
        this._monacoEditor2.openFile(file);
        const breadcrumb2 = document.getElementById('sandboxBreadcrumbBar2');
        if (breadcrumb2) this._ctx.emit('updateBreadcrumb', { barEl: breadcrumb2, filePath });
      }
    }
  }

  // ─── 第二编辑器组标签页回调 ────────────────────────────────

  _onFileSelectGroup2(filePath) {
    if (!this._ctx.vfs || !this._monacoEditor2 || !this._fileTabs2) return;
    const file = this._ctx.vfs.getFile(filePath);
    if (!file) return;
    if (SandboxImagePreview.isImageFile(filePath)) return;
    this._fileTabs2.openTab(filePath, file.name);
    this._monacoEditor2.openFile(file);
    const breadcrumb2 = document.getElementById('sandboxBreadcrumbBar2');
    if (breadcrumb2) this._ctx.emit('updateBreadcrumb', { barEl: breadcrumb2, filePath });
  }

  _onTabCloseGroup2(filePath) {
    if (this._fileTabs2) this._fileTabs2.closeTab(filePath);
    if (this._monacoEditor2) this._monacoEditor2.closeFile(filePath);
    if (this._fileTabs2 && this._fileTabs2.getActivePath()) {
      this._onFileSelectGroup2(this._fileTabs2.getActivePath());
    }
  }

  _onCloseOthersGroup2(keepPath) {
    if (!this._fileTabs2) return;
    const others = this._fileTabs2.getOpenFiles().filter(p => p !== keepPath);
    for (const p of others) {
      if (this._monacoEditor2) this._monacoEditor2.closeFile(p);
      this._fileTabs2.closeTab(p);
    }
    this._onFileSelectGroup2(keepPath);
  }

  _onCloseAllGroup2() {
    if (!this._fileTabs2) return;
    const all = this._fileTabs2.getOpenFiles().slice();
    for (const p of all) {
      if (this._monacoEditor2) this._monacoEditor2.closeFile(p);
      this._fileTabs2.closeTab(p);
    }
  }

  // ─── 分屏拖拽调整 ──────────────────────────────────────────

  _initSplitResize() {
    const handle = document.getElementById('sandboxSplitHandle');
    if (!handle) return;

    let startX = 0;
    let startW1 = 0;
    let startW2 = 0;

    const onMove = (e) => {
      const group1 = document.getElementById('sandboxEditorGroup1');
      const group2 = document.getElementById('sandboxEditorGroup2');
      if (!group1 || !group2) return;

      const dx = e.clientX - startX;
      const newW1 = Math.max(100, startW1 + dx);
      const newW2 = Math.max(100, startW2 - dx);

      group1.style.flex = 'none';
      group1.style.width = newW1 + 'px';
      group2.style.flex = 'none';
      group2.style.width = newW2 + 'px';
    };

    const onUp = () => {
      handle.classList.remove('active');
      const preview = this._ctx.preview;
      if (preview) preview.style.pointerEvents = '';
      const monacoEl = document.getElementById('sandboxMonacoContainer');
      if (monacoEl) monacoEl.style.pointerEvents = '';
      const monacoEl2 = document.getElementById('sandboxMonacoContainer2');
      if (monacoEl2) monacoEl2.style.pointerEvents = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      const monacoEditor = this._ctx.monacoEditor;
      if (monacoEditor) monacoEditor.layout();
      if (this._monacoEditor2) this._monacoEditor2.layout();
    };

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startX = e.clientX;

      const group1 = document.getElementById('sandboxEditorGroup1');
      const group2 = document.getElementById('sandboxEditorGroup2');
      startW1 = group1 ? group1.offsetWidth : 0;
      startW2 = group2 ? group2.offsetWidth : 0;

      handle.classList.add('active');

      const preview = this._ctx.preview;
      if (preview) preview.style.pointerEvents = 'none';
      const monacoEl = document.getElementById('sandboxMonacoContainer');
      if (monacoEl) monacoEl.style.pointerEvents = 'none';
      const monacoEl2 = document.getElementById('sandboxMonacoContainer2');
      if (monacoEl2) monacoEl2.style.pointerEvents = 'none';

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }
}

console.log('[sandbox-split-editor] 模块已加载');
