// ============================================================
//  browser/browser-find.js — 页面查找 (Ctrl+F)
//  调用 webview.findInPage / stopFindInPage
// ============================================================

export class BrowserFind {
  /**
   * @param {Object} opts
   * @param {HTMLElement} opts.content   - 浏览器内容容器（用于定位查找栏和事件冒泡）
   * @param {HTMLElement} opts.bodyEl    - webview 容器（用于 found-in-page 事件捕获）
   * @param {Function}   opts.getActiveTab - 获取当前活跃标签
   */
  constructor({ content, bodyEl, getActiveTab }) {
    this._getActiveTab = getActiveTab;
    this._active = false;

    // 创建查找栏 DOM
    this._bar = document.createElement('div');
    this._bar.className = 'app-browser-find-bar';
    this._bar.style.display = 'none';
    this._bar.innerHTML = `
      <input type="text" class="app-browser-find-input" placeholder="查找页面内容..." />
      <span class="app-browser-find-count"></span>
      <button class="app-browser-find-btn app-browser-find-prev" title="上一个 (Shift+Enter)">▲</button>
      <button class="app-browser-find-btn app-browser-find-next" title="下一个 (Enter)">▼</button>
      <button class="app-browser-find-btn app-browser-find-close" title="关闭 (Esc)">✕</button>
    `;
    content.appendChild(this._bar);

    this._input = this._bar.querySelector('.app-browser-find-input');
    this._count = this._bar.querySelector('.app-browser-find-count');
    const prevBtn = this._bar.querySelector('.app-browser-find-prev');
    const nextBtn = this._bar.querySelector('.app-browser-find-next');
    const closeBtn = this._bar.querySelector('.app-browser-find-close');

    // 事件
    this._input.addEventListener('input', () => this._doFind(true));
    this._input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this._doFind(e.shiftKey ? false : true); }
      if (e.key === 'Escape') { e.preventDefault(); this.close(); }
    });
    prevBtn.addEventListener('click', () => this._doFind(false));
    nextBtn.addEventListener('click', () => this._doFind(true));
    closeBtn.addEventListener('click', () => this.close());

    // 捕获 found-in-page 事件
    bodyEl.addEventListener('found-in-page', (e) => {
      if (!this._active) return;
      const result = e.detail || e;
      if (result.finalUpdate && result.matches !== undefined) {
        this._count.textContent = result.matches > 0
          ? `${result.activeMatchOrdinal || '?'}/${result.matches}`
          : '无结果';
      }
    }, true);
  }

  /** 打开查找栏 */
  open() {
    this._bar.style.display = 'flex';
    this._active = true;
    this._input.value = '';
    this._count.textContent = '';
    this._input.focus();
  }

  /** 关闭查找栏 */
  close() {
    this._bar.style.display = 'none';
    this._active = false;
    this._input.value = '';
    this._count.textContent = '';
    const tab = this._getActiveTab();
    if (tab && tab.ready) {
      try { tab.webview.stopFindInPage('clearSelection'); } catch (_) {}
    }
  }

  /** 执行查找 */
  _doFind(forward = true) {
    const tab = this._getActiveTab();
    if (!tab || !tab.ready) return;
    const text = this._input.value;
    if (!text) {
      this._count.textContent = '';
      try { tab.webview.stopFindInPage('clearSelection'); } catch (_) {}
      return;
    }
    tab.webview.findInPage(text, { forward, findNext: true, matchCase: false });
  }
}
