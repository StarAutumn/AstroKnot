// ============================================================
//  browser/browser-download.js — 下载管理器
//  监听主进程发来的下载进度，显示下载面板
// ============================================================

export class BrowserDownload {
  /**
   * @param {Object} opts
   * @param {HTMLButtonElement} opts.downloadBtn    - 下载按钮
   * @param {HTMLElement}       opts.downloadPanel  - 下载面板容器
   */
  constructor({ downloadBtn, downloadPanel }) {
    this._btn = downloadBtn;
    this._panel = downloadPanel;
    /** @type {Map<string, Object>} downloadId → download data */
    this._downloads = new Map();

    this._bindIPC();
    this._bindEvents();
  }

  // ── IPC 通信 ──

  _bindIPC() {
    if (window.api && window.api.onBrowserDownloadUpdate) {
      window.api.onBrowserDownloadUpdate((data) => {
        this._downloads.set(data.id, data);
        this._updateBadge();
        // 如果面板打开则刷新
        if (this._panel.style.display !== 'none') this.renderPanel();
      });
    }
  }

  // ── 面板渲染 ──

  renderPanel() {
    const items = Array.from(this._downloads.values()).reverse();
    let html = `
      <div class="app-browser-download-header">
        <span>下载</span>
        ${items.length > 0 ? '<button class="app-browser-download-clear-btn">清空</button>' : ''}
      </div>
    `;

    if (items.length === 0) {
      html += '<div class="app-browser-download-empty">暂无下载</div>';
    } else {
      html += '<div class="app-browser-download-list">';
      for (const item of items) {
        const isDone = item.state === 'completed';
        const isFailed = item.state === 'cancelled' || item.state === 'interrupted';
        const progress = item.total > 0 ? Math.round((item.received / item.total) * 100) : 0;
        const sizeInfo = this._formatSize(item.received) + (item.total > 0 ? ' / ' + this._formatSize(item.total) : '');
        const statusText = isDone ? '已完成' : isFailed ? '失败' : `${progress}%`;
        const statusClass = isDone ? 'done' : isFailed ? 'failed' : 'progressing';

        html += `<div class="app-browser-download-item ${statusClass}" data-id="${item.id}">
          <div class="app-browser-download-item-info">
            <div class="app-browser-download-item-name">${item.filename.replace(/</g, '&lt;')}</div>
            <div class="app-browser-download-item-meta">
              <span class="app-browser-download-item-size">${sizeInfo}</span>
              <span class="app-browser-download-item-status ${statusClass}">${statusText}</span>
            </div>
            ${!isDone && !isFailed ? `<div class="app-browser-download-progress-bar"><div class="app-browser-download-progress-fill" style="width:${progress}%"></div></div>` : ''}
          </div>
          ${isDone ? `<button class="app-browser-download-item-open" title="打开文件" data-path="${(item.savePath || '').replace(/"/g, '&quot;')}">📂</button>` : ''}
          <button class="app-browser-download-item-delete" title="删除">✕</button>
        </div>`;
      }
      html += '</div>';
    }

    this._panel.innerHTML = html;
    this._bindPanelEvents();
  }

  _bindPanelEvents() {
    // 清空
    const clearBtn = this._panel.querySelector('.app-browser-download-clear-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this._downloads.clear();
        this._updateBadge();
        this.renderPanel();
      });
    }

    // 删除单条
    this._panel.querySelectorAll('.app-browser-download-item-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = btn.closest('.app-browser-download-item');
        const id = item?.dataset.id;
        if (id) {
          this._downloads.delete(id);
          this._updateBadge();
          this.renderPanel();
        }
      });
    });

    // 打开文件
    this._panel.querySelectorAll('.app-browser-download-item-open').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const filePath = btn.dataset.path;
        if (filePath && window.api && window.api.openLocalFile) {
          window.api.openLocalFile(filePath);
        }
      });
    });
  }

  // ── 事件绑定 ──

  _bindEvents() {
    this._btn.addEventListener('click', () => {
      if (this._panel.style.display === 'none') {
        this.renderPanel();
        this._panel.style.display = 'block';
      } else {
        this._panel.style.display = 'none';
      }
    });

    document.addEventListener('mousedown', (e) => {
      if (this._panel.style.display !== 'none'
          && !this._panel.contains(e.target)
          && e.target !== this._btn
          && !this._btn.contains(e.target)) {
        this._panel.style.display = 'none';
      }
    });
  }

  /** 更新工具栏按钮上的下载数量标记 */
  _updateBadge() {
    const activeCount = Array.from(this._downloads.values())
      .filter(d => d.state === 'progressing').length;
    if (activeCount > 0) {
      this._btn.classList.add('has-downloads');
      this._btn.title = `下载中 (${activeCount})`;
    } else {
      this._btn.classList.remove('has-downloads');
      this._btn.title = '下载';
    }
  }

  // ── 工具 ──

  _formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  }
}
