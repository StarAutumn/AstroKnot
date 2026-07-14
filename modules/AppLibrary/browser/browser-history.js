// ============================================================
//  browser/browser-history.js — 浏览历史记录
//  记录浏览历史（URL + 标题 + 时间），支持搜索和快速回访
// ============================================================

const HISTORY_KEY = 'astroknot-browser-history';
const MAX_HISTORY = 2000; // 最多保留 2000 条

export class BrowserHistory {
  /**
   * @param {Object} opts
   * @param {HTMLButtonElement} opts.historyBtn    - 历史按钮
   * @param {HTMLElement}       opts.historyPanel  - 历史面板容器
   * @param {Function} opts.getCurrentUrl          - 获取当前 URL
   * @param {Function} opts.onNavigate(url)        - 导航回调
   */
  constructor({ historyBtn, historyPanel, getCurrentUrl, onNavigate }) {
    this._btn = historyBtn;
    this._panel = historyPanel;
    this._getUrl = getCurrentUrl;
    this._onNavigate = onNavigate;

    this._bindEvents();
  }

  // ── 数据层 ──

  /** 加载历史 */
  load() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }
    catch (_) { return []; }
  }

  /** 保存历史 */
  save(history) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }

  /** 添加一条浏览记录 */
  addRecord(url, title) {
    if (!url || url === 'about:blank') return;
    const history = this.load();
    // 去重：同一 URL 只保留最新一条
    const idx = history.findIndex(h => h.url === url);
    if (idx >= 0) history.splice(idx, 1);
    history.unshift({ url, title: title || url, visitedAt: Date.now() });
    // 限制数量
    if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
    this.save(history);
    // 如果面板打开则刷新
    if (this._panel.style.display !== 'none') this.renderPanel();
  }

  /** 删除一条记录 */
  deleteRecord(url) {
    const history = this.load().filter(h => h.url !== url);
    this.save(history);
    // 保持当前搜索词刷新列表
    const searchInput = this._panel.querySelector('.app-browser-history-search-input');
    this._renderList(searchInput ? searchInput.value.trim() : '');
  }

  /** 清空历史 */
  clearAll() {
    this.save([]);
    const searchInput = this._panel.querySelector('.app-browser-history-search-input');
    this._renderList(searchInput ? searchInput.value.trim() : '');
  }

  /** 搜索历史 */
  search(keyword) {
    if (!keyword) return this.load();
    const kw = keyword.toLowerCase();
    return this.load().filter(h =>
      h.title.toLowerCase().includes(kw) || h.url.toLowerCase().includes(kw)
    );
  }

  // ── 面板渲染 ──

  renderPanel(keyword) {
    // 只在面板未初始化时构建结构，避免重建 input 导致光标丢失
    if (!this._panel.querySelector('.app-browser-history-search-input')) {
      this._panel.innerHTML = `
        <div class="app-browser-history-header">
          <span>浏览历史</span>
          <button class="app-browser-history-clear-btn" title="清空历史">清空</button>
        </div>
        <div class="app-browser-history-search-wrap">
          <input type="text" class="app-browser-history-search-input" placeholder="搜索历史...">
        </div>
        <div class="app-browser-history-list"></div>
      `;
      this._bindPanelEvents();
    }
    this._renderList(keyword);
  }

  /** 只更新列表区域，不触碰 input */
  _renderList(keyword) {
    const listEl = this._panel.querySelector('.app-browser-history-list');
    if (!listEl) return;
    const items = keyword ? this.search(keyword) : this.load();
    let html = '';

    if (items.length === 0) {
      html = '<div class="app-browser-history-empty">暂无浏览记录</div>';
    } else {
      // 按日期分组
      let lastDate = '';
      for (const item of items) {
        const date = this._formatDate(item.visitedAt);
        if (date !== lastDate) {
          lastDate = date;
          html += `<div class="app-browser-history-date">${date}</div>`;
        }
        const displayTitle = item.title || item.url;
        const displayUrl = item.url.length > 50 ? item.url.substring(0, 50) + '...' : item.url;
        const time = this._formatTime(item.visitedAt);
        html += `<div class="app-browser-history-item" data-url="${item.url.replace(/"/g, '&quot;')}">
          <div class="app-browser-history-item-info">
            <div class="app-browser-history-item-title">${displayTitle.replace(/</g, '&lt;')}</div>
            <div class="app-browser-history-item-meta">
              <span class="app-browser-history-item-url">${displayUrl.replace(/</g, '&lt;')}</span>
              <span class="app-browser-history-item-time">${time}</span>
            </div>
          </div>
          <button class="app-browser-history-item-delete" title="删除">✕</button>
        </div>`;
      }
    }
    listEl.innerHTML = html;

    // 重新绑定列表项事件（input 事件不重新绑定）
    listEl.querySelectorAll('.app-browser-history-item').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.app-browser-history-item-delete')) return;
        const url = el.dataset.url;
        if (url) { this._onNavigate(url); this._panel.style.display = 'none'; }
      });
    });
    listEl.querySelectorAll('.app-browser-history-item-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = btn.closest('.app-browser-history-item');
        const url = item?.dataset.url;
        if (url) this.deleteRecord(url);
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

  _bindPanelEvents() {
    // 点击历史项 → 导航
    this._panel.querySelectorAll('.app-browser-history-item').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.app-browser-history-item-delete')) return;
        const url = el.dataset.url;
        if (url) { this._onNavigate(url); this._panel.style.display = 'none'; }
      });
    });

    // 删除单条
    this._panel.querySelectorAll('.app-browser-history-item-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = btn.closest('.app-browser-history-item');
        const url = item?.dataset.url;
        if (url) this.deleteRecord(url);
      });
    });

    // 清空
    const clearBtn = this._panel.querySelector('.app-browser-history-clear-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.clearAll());
    }

    // 搜索
    const searchInput = this._panel.querySelector('.app-browser-history-search-input');
    if (searchInput) {
      let _timer;
      searchInput.addEventListener('input', () => {
        clearTimeout(_timer);
        _timer = setTimeout(() => this._renderList(searchInput.value.trim()), 200);
      });
      searchInput.focus();
    }
  }

  // ── 工具 ──

  _formatDate(ts) {
    const d = new Date(ts);
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
    const dStr = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (dStr === todayStr) return '今天';
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = `${yesterday.getFullYear()}-${yesterday.getMonth()}-${yesterday.getDate()}`;
    if (dStr === yStr) return '昨天';
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  }

  _formatTime(ts) {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}
