/**
 * SandboxTemplateHistory - 模板选择器 & 本地历史记录面板
 *
 * 管理项目模板的展示/应用，以及文件历史版本的浏览/对比/回滚。
 * 从 index.js 拆分而来，通过 SandboxContext 与其他模块通信。
 */

import { getTemplates, applyTemplate } from './templates.js';
import { showToast } from '../../../module5_SelectAndEdit.js';

class SandboxTemplateHistory {
  /**
   * @param {import('../core/context').SandboxContext} ctx - 沙箱上下文
   */
  constructor(ctx) {
    /** @private */
    this._ctx = ctx;

    /** @private @type {HTMLElement|null} 模板模态框 DOM */
    this._templateModal = null;

    /** @private @type {HTMLElement|null} 历史面板 DOM */
    this._historyPanel = null;

    /** @private @type {string|null} 历史面板选中的文件 */
    this._historySelectedFile = null;

    /** @private @type {number|null} 历史面板选中的版本时间戳 */
    this._historySelectedVersion = null;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * 初始化模块。缓存 DOM 引用并注册动作。
   */
  init() {
    this._templateModal = document.getElementById('sandboxTemplateModal');
    this._historyPanel = document.getElementById('sandboxHistoryPanel');

    this._ctx.registerAction('template', () => this.showTemplateModal());
    this._ctx.registerAction('history', () => this.showHistoryPanel());
  }

  /**
   * 销毁模块。清理状态和 DOM 引用。
   */
  destroy() {
    this._templateModal = null;
    this._historyPanel = null;
    this._historySelectedFile = null;
    this._historySelectedVersion = null;
  }

  // ---------------------------------------------------------------------------
  // 模板选择器
  // ---------------------------------------------------------------------------

  /**
   * 显示模板选择器模态框。
   */
  showTemplateModal() {
    if (!this._templateModal) return;
    const vfs = this._ctx.vfs;
    if (!vfs) return;

    const grid = document.getElementById('templateGrid');
    if (!grid) return;

    grid.innerHTML = '';
    for (const tpl of getTemplates()) {
      const card = document.createElement('div');
      card.className = 'template-card';
      card.innerHTML =
        '<div class="tpl-icon">' + tpl.icon + '</div>' +
        '<div class="tpl-name">' + tpl.name + '</div>' +
        '<div class="tpl-desc">' + tpl.desc + '</div>' +
        '<div class="tpl-files">' + tpl.files.length + ' 个文件</div>';
      card.addEventListener('click', () => {
        this.applyTemplate(tpl);
        this.hideTemplateModal();
      });
      grid.appendChild(card);
    }

    this._templateModal.style.display = 'flex';
  }

  /**
   * 隐藏模板选择器模态框。
   */
  hideTemplateModal() {
    if (this._templateModal) this._templateModal.style.display = 'none';
  }

  /**
   * 将模板应用到当前虚拟文件系统。
   * @param {Object} template - 模板对象
   */
  applyTemplate(template) {
    const vfs = this._ctx.vfs;
    if (!vfs) return;

    const createdPaths = applyTemplate(vfs, template, '');

    const fileTree = this._ctx.fileTree;
    if (fileTree) fileTree.refresh();

    // 打开第一个创建的文件
    if (createdPaths.length > 0) {
      this._ctx.emit('openFileInEditor', createdPaths[0]);
    }

    this._ctx.emit('statusChange', '已从模板创建 ' + createdPaths.length + ' 个文件');
    showToast('✅ 已创建模板: ' + template.name);

    // 模板创建涉及多个文件，触发全量磁盘同步
    this._ctx.emit('fileSystemChange');

    // 触发自动运行
    this._ctx.emit('autoRunPreview');
  }

  // ---------------------------------------------------------------------------
  // 本地历史记录面板
  // ---------------------------------------------------------------------------

  /**
   * 显示历史记录面板。
   */
  showHistoryPanel() {
    if (!this._historyPanel) return;
    const history = this._ctx.history;
    if (!history) return;

    this.renderHistoryFiles();
    this._historyPanel.style.display = 'flex';
  }

  /**
   * 隐藏历史记录面板。
   */
  hideHistoryPanel() {
    if (this._historyPanel) this._historyPanel.style.display = 'none';
  }

  /**
   * 渲染历史文件列表。
   */
  renderHistoryFiles() {
    const listEl = document.getElementById('historyFileList');
    if (!listEl) return;

    const history = this._ctx.history;
    if (!history) return;

    const files = history.getFiles();
    if (files.length === 0) {
      listEl.innerHTML = '<div class="history-empty">暂无历史记录<br><small>保存文件后会自动记录</small></div>';
      return;
    }

    listEl.innerHTML = '';
    for (const f of files) {
      const versions = history.getVersions(f);
      const last = versions[versions.length - 1];
      const item = document.createElement('div');
      item.className = 'history-list-item';
      if (f === this._historySelectedFile) item.classList.add('active');
      item.innerHTML =
        '<div class="h-name">' + f + '</div>' +
        '<div class="h-time">' + versions.length + ' 个版本 · ' + this._formatTime(last.timestamp) + '</div>';
      item.addEventListener('click', () => {
        this._historySelectedFile = f;
        this.renderHistoryFiles();
        this.renderHistoryVersions();
      });
      listEl.appendChild(item);
    }
  }

  /**
   * 渲染历史版本列表（倒序显示，最新在上）。
   */
  renderHistoryVersions() {
    const listEl = document.getElementById('historyVersionList');
    const diffEl = document.getElementById('historyDiffView');
    if (!listEl) return;

    if (!this._historySelectedFile) {
      listEl.innerHTML = '<div class="history-empty">请选择文件</div>';
      if (diffEl) diffEl.innerHTML = '';
      return;
    }

    const history = this._ctx.history;
    if (!history) return;

    const versions = history.getVersions(this._historySelectedFile);
    if (versions.length === 0) {
      listEl.innerHTML = '<div class="history-empty">无版本</div>';
      return;
    }

    listEl.innerHTML = '';
    // 倒序显示（最新在上）
    for (let i = versions.length - 1; i >= 0; i--) {
      const v = versions[i];
      const item = document.createElement('div');
      item.className = 'history-list-item';
      if (v.timestamp === this._historySelectedVersion) item.classList.add('active');
      const actionLabel = v.action === 'auto' ? '自动' : v.action === 'manual' ? '手动' : '保存';
      item.innerHTML =
        '<div class="h-name">v' + (i + 1) + ' · ' + actionLabel + '</div>' +
        '<div class="h-time">' + this._formatTime(v.timestamp) + '</div>';
      item.addEventListener('click', () => {
        this._historySelectedVersion = v.timestamp;
        this.renderHistoryVersions();
        this.renderHistoryDiff();
      });
      listEl.appendChild(item);
    }
  }

  /**
   * 渲染历史版本与当前内容的 Diff 视图。
   */
  renderHistoryDiff() {
    const diffEl = document.getElementById('historyDiffView');
    const restoreBtn = document.getElementById('historyRestoreBtn');
    if (!diffEl) return;

    if (!this._historySelectedFile || !this._historySelectedVersion) {
      diffEl.innerHTML = '<div class="history-empty">请选择版本</div>';
      if (restoreBtn) restoreBtn.style.display = 'none';
      return;
    }

    const history = this._ctx.history;
    if (!history) return;

    // 获取当前文件内容
    let currentContent = '';
    const monacoEditor = this._ctx.monacoEditor;
    if (monacoEditor) {
      currentContent = monacoEditor.getContent(this._historySelectedFile);
    }
    if (!currentContent) {
      const vfs = this._ctx.vfs;
      if (vfs) {
        const f = vfs.getFile(this._historySelectedFile);
        if (f) currentContent = f.content;
      }
    }

    const diff = history.diffWithCurrent(this._historySelectedFile, this._historySelectedVersion, currentContent);
    if (diff.length === 0) {
      diffEl.innerHTML = '<div class="history-empty">无差异</div>';
    } else {
      let html = '';
      for (const line of diff) {
        const cls = line.type === 'add' ? 'diff-line-add' :
                    line.type === 'del' ? 'diff-line-del' :
                    line.type === 'meta' ? 'diff-line-meta' : 'diff-line-ctx';
        html += '<div class="' + cls + '">' + this._escapeHtml(line.text) + '</div>';
      }
      diffEl.innerHTML = html;
    }
    if (restoreBtn) restoreBtn.style.display = 'inline-block';
  }

  /**
   * 恢复选中的历史版本。
   */
  restoreHistoryVersion() {
    if (!this._historySelectedFile || !this._historySelectedVersion) return;

    const vfs = this._ctx.vfs;
    const history = this._ctx.history;
    if (!vfs || !history) return;

    const content = history.getVersionContent(this._historySelectedFile, this._historySelectedVersion);
    if (content == null) return;

    // 恢复到 VFS
    vfs.setFile(this._historySelectedFile, content);

    // 恢复到 Monaco（直接设置 model 内容）
    const monacoEditor = this._ctx.monacoEditor;
    if (monacoEditor) {
      // 确保文件已打开
      const file = vfs.getFile(this._historySelectedFile);
      if (file) {
        const isOpen = monacoEditor.getCurrentFilePath() === this._historySelectedFile;
        if (!isOpen) {
          this._ctx.emit('openFileInEditor', this._historySelectedFile);
        }
        monacoEditor.setFileContent(this._historySelectedFile, content);
      }
    }

    // 刷新文件树
    const fileTree = this._ctx.fileTree;
    if (fileTree) fileTree.refresh();

    showToast('✅ 已恢复 ' + this._historySelectedFile);
    this._ctx.emit('statusChange', '已恢复历史版本');
    this.hideHistoryPanel();

    // 重新预览
    this._ctx.emit('autoRunPreview');
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * 格式化时间戳为 MM/DD HH:mm。
   * @param {number} ts - Unix 时间戳
   * @returns {string}
   */
  _formatTime(ts) {
    const d = new Date(ts);
    return String(d.getMonth() + 1).padStart(2, '0') + '/' +
           String(d.getDate()).padStart(2, '0') + ' ' +
           String(d.getHours()).padStart(2, '0') + ':' +
           String(d.getMinutes()).padStart(2, '0');
  }

  /**
   * HTML 特殊字符转义（用于 diff 显示）。
   * @param {string} str - 原始字符串
   * @returns {string}
   */
  _escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}

export { SandboxTemplateHistory };
console.log('[sandbox-template-history] 模块已加载');
