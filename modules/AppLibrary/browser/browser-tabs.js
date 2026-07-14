// ============================================================
//  browser/browser-tabs.js — 多标签页管理
//  管理 webview 创建/销毁、标签切换、标题同步
// ============================================================

import { inputToUrl, NEWTAB_URL, getUserAgent } from './utils.js';

export class BrowserTabs {
  /**
   * @param {Object} opts
   * @param {HTMLElement} opts.tabList - 标签页列表容器
   * @param {HTMLElement} opts.bodyEl  - webview 容器
   * @param {Object}      opts.app    - 应用信息 { id, name, icon, defaultUrl }
   * @param {Object}      opts.callbacks - 事件回调
   * @param {Function} opts.callbacks.onUrlChange(tabId, url)      - URL 变化
   * @param {Function} opts.callbacks.onTitleChange(tabId, title)  - 标题变化
   * @param {Function} opts.callbacks.onLoadingChange(loading)     - 加载状态
   * @param {Function} opts.callbacks.onTabSwitch(tabData)         - 标签切换
   * @param {Function} opts.callbacks.onNavigate(url, title)       - 页面导航完成（用于历史记录）
   * @param {Function} opts.callbacks.onOpenFindBar()              - 打开查找栏
   * @param {Function} opts.callbacks.onCreateTab(url)             - 创建新标签（由右键菜单等触发）
   */
  constructor({ tabList, bodyEl, app, callbacks }) {
    this._tabList = tabList;
    this._bodyEl = bodyEl;
    this._app = app;
    this._cb = callbacks;

    this._tabIdCounter = 0;
    /** @type {Map<string, Object>} tabId → { webview, url, title, ready, tabEl } */
    this._tabs = new Map();
    /** @type {string|null} */
    this._activeTabId = null;
    /** @type {boolean} 是否隐私模式 */
    this._privateMode = false;

    // ── 监听主进程拦截的弹出窗口 → 新建标签页 ──
    this._destroyed = false;
    this._onBrowserOpenTab = (url) => {
      if (this._destroyed) return;
      if (url) this.createTab(url);
    };
    if (window.api && window.api.onBrowserOpenTab) {
      window.api.onBrowserOpenTab(this._onBrowserOpenTab);
    }
  }

  /** 当前活跃标签 ID */
  get activeTabId() { return this._activeTabId; }

  /** 当前活跃标签数据 */
  get activeTab() { return this._tabs.get(this._activeTabId); }

  /** 所有标签 */
  get tabs() { return this._tabs; }

  /** 是否隐私模式 */
  get privateMode() { return this._privateMode; }

  /** 最后关闭的标签 URL（用于 Ctrl+Shift+T 恢复） */
  get lastClosedUrl() { return this._lastClosedUrl || null; }

  /**
   * 为所有已存在的 webview 应用新的 User-Agent 并刷新
   * @param {string} ua - User-Agent 字符串
   */
  setUserAgentForAll(ua) {
    for (const tab of this._tabs.values()) {
      try {
        tab.webview.setUserAgent(ua);
        // 重新加载以使 UA 生效
        if (tab.ready && tab.url && tab.url !== 'about:blank') {
          tab.webview.reload();
        }
      } catch (_) {}
    }
  }

  /**
   * 注入右键菜单坐标捕获器到 webview 页面
   * 在捕获阶段记录 contextmenu 事件的 clientX/clientY（webview 视口坐标），
   * 解决 Electron context-menu 事件 params.x/y 坐标系不可靠（疑似屏幕坐标）的问题。
   * 跨域导航会生成新 window，标志位重置 → 自动重装；同域导航 window 复用 → 标志位防重复。
   */
  _injectContextMenuCapture(webview) {
    const script = `(function(){
      if (window.__astroknotCtxCaptureInstalled) return;
      window.__astroknotCtxCaptureInstalled = true;
      window.addEventListener('contextmenu', function(e){
        window.__astroknotCtxPos = { x: e.clientX, y: e.clientY, ts: Date.now() };
      }, true);
    })();`;
    try {
      webview.executeJavaScript(script, true).catch(() => {});
    } catch (_) {}
  }

  /**
   * 切换隐私模式（关闭所有标签页，重新开始）
   * @param {boolean} enable - 是否启用隐私模式
   */
  setPrivateMode(enable) {
    if (this._privateMode === enable) return;
    this._privateMode = enable;
    // 关闭所有现有标签页（除最后一个，复用为新模式标签）
    const tabIds = Array.from(this._tabs.keys());
    for (const id of tabIds) {
      const tab = this._tabs.get(id);
      try { tab.webview.stop(); } catch (_) {}
      tab.webview.remove();
      tab.tabEl.remove();
      this._tabs.delete(id);
    }
    this._activeTabId = null;
    // 创建新的空白标签页（使用新模式 partition）
    this.createTab(NEWTAB_URL);
  }

  /**
   * 创建新标签页
   * @param {string}  [url='about:blank'] - 初始 URL
   * @param {boolean} [activate=true]     - 是否立即激活
   * @returns {string} tabId
   */
  createTab(url = 'about:blank', activate = true) {
    const tabId = 'tab_' + (++this._tabIdCounter);
    const initialUrl = url || 'about:blank';

    // 创建 webview
    const webview = document.createElement('webview');
    webview.className = 'app-browser-webview';
    webview.style.display = 'none';
    webview.setAttribute('partition', this._privateMode ? 'private-browsersession' : 'persist:browsersession');
    webview.setAttribute('allowpopups', ''); // 允许弹出请求发起，主进程 setWindowOpenHandler 会拦截并转到新标签页
    webview.setAttribute('useragent', getUserAgent().ua);
    this._bodyEl.appendChild(webview);

    // 创建标签页 DOM
    const tabEl = document.createElement('div');
    tabEl.className = 'app-browser-tab';
    tabEl.dataset.tabId = tabId;
    tabEl.innerHTML = `
      <span class="app-browser-tab-title">新标签页</span>
      <button class="app-browser-tab-close" title="关闭标签页 (Ctrl+W)">✕</button>
    `;
    this._tabList.appendChild(tabEl);

    // 确保 "+" 按钮始终在最后
    const newTabBtn = this._tabList.querySelector('.app-browser-tab-new');
    if (newTabBtn) this._tabList.appendChild(newTabBtn);

    const tabData = { webview, url: initialUrl, title: '新标签页', ready: false, favicon: null, tabEl };
    this._tabs.set(tabId, tabData);

    // ── webview 事件 ──
    webview.addEventListener('dom-ready', function onFirstReady() {
      tabData.ready = true;
      webview.removeEventListener('dom-ready', onFirstReady);
    });

    // 每次导航后注入右键坐标捕获器（持久监听）
    // DOM contextmenu 事件先于 Electron context-menu 事件触发，
    // 在捕获阶段记录 clientX/clientY（webview 视口坐标），供右键菜单精确定位
    webview.addEventListener('dom-ready', () => {
      this._injectContextMenuCapture(webview);
    });

    webview.addEventListener('did-navigate', (e) => {
      tabData.url = e.url;
      tabData.title = '';
      try {
        webview.executeJavaScript('document.title').then(t => {
          tabData.title = t || '';
          this._updateTabTitle(tabId);
          if (this._activeTabId === tabId) {
            this._cb.onUrlChange(tabId, e.url);
            this._cb.onTitleChange(tabId, tabData.title);
          }
          // 通知历史记录
          if (this._cb.onNavigate) this._cb.onNavigate(e.url, tabData.title);
        }).catch(() => {
          // 即使获取标题失败，也记录历史
          if (this._cb.onNavigate) this._cb.onNavigate(e.url, '');
        });
      } catch (_) {}
      if (this._activeTabId === tabId) {
        this._cb.onUrlChange(tabId, e.url);
        this._cb.onLoadingChange(false);
      }
      this._updateTabTitle(tabId);
    });

    webview.addEventListener('did-navigate-in-page', (e) => {
      tabData.url = e.url;
      if (this._activeTabId === tabId) {
        this._cb.onUrlChange(tabId, e.url);
      }
    });

    webview.addEventListener('did-start-loading', () => {
      if (this._activeTabId === tabId) this._cb.onLoadingChange(true);
    });

    webview.addEventListener('did-stop-loading', () => {
      if (this._activeTabId === tabId) this._cb.onLoadingChange(false);
    });

    webview.addEventListener('did-fail-load', (e) => {
      if (this._activeTabId === tabId) this._cb.onLoadingChange(false);
      if (e.errorCode !== -3) console.warn('[Browser] 加载失败:', e.errorCode, e.errorDescription);
    });

    webview.addEventListener('page-title-updated', (e) => {
      tabData.title = e.title || '';
      this._updateTabTitle(tabId);
      if (this._activeTabId === tabId) {
        this._cb.onTitleChange(tabId, tabData.title);
      }
    });

    webview.addEventListener('page-favicon-updated', (e) => {
      const favicons = e.favicons;
      if (favicons && favicons.length > 0) {
        tabData.favicon = favicons[favicons.length - 1]; // 取最后一个（通常是最高分辨率）
        this._updateTabFavicon(tabId);
        if (this._activeTabId === tabId && this._cb.onFaviconChange) {
          this._cb.onFaviconChange(tabData.favicon);
        }
      }
    });

    // ── 右键菜单 ──
    webview.addEventListener('context-menu', (e) => {
      this._cb.onContextMenu(webview, e);
    });

    // ── 弹出窗口拦截已移至主进程 ──
    // Electron 29+ 中渲染进程无法通过 webview.getWebContents()
    // 调用 setWindowOpenHandler（contextIsolation: true 限制），
    // 改由主进程 web-contents-created 事件统一拦截，
    // 通过 IPC 'browser-open-tab' 通知渲染进程创建新标签页

    // 加载 URL
    setTimeout(() => {
      try {
        if (initialUrl === 'about:blank') {
          webview.src = 'about:blank';
        } else if (/^https?:\/\//i.test(initialUrl)) {
          webview.src = initialUrl;
        } else {
          webview.src = 'https://' + initialUrl;
        }
      } catch (_) {}
    }, 0);

    // 标签页点击事件
    tabEl.addEventListener('click', (e) => {
      if (e.target.closest('.app-browser-tab-close')) return;
      this.switchTab(tabId);
    });
    tabEl.addEventListener('auxclick', (e) => {
      if (e.button === 1) { e.preventDefault(); this.closeTab(tabId); }
    });
    tabEl.querySelector('.app-browser-tab-close').addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeTab(tabId);
    });

    if (activate) this.switchTab(tabId);
    return tabId;
  }

  /**
   * 关闭标签页
   */
  closeTab(tabId) {
    const tab = this._tabs.get(tabId);
    if (!tab) return;

    // 记录最后关闭的 URL（用于 Ctrl+Shift+T 恢复）
    if (tab.url && tab.url !== 'about:blank') {
      this._lastClosedUrl = tab.url;
    }

    // 至少保留一个标签
    if (this._tabs.size <= 1) {
      try { tab.webview.stop(); tab.webview.clearHistory(); } catch (_) {}
      tab.url = 'about:blank';
      tab.title = '新标签页';
      tab.favicon = null;
      this._updateTabTitle(tabId);
      this._updateTabFavicon(tabId);
      this._cb.onUrlChange(tabId, 'about:blank');
      return;
    }

    let nextTabId = null;
    if (this._activeTabId === tabId) {
      const tabIds = Array.from(this._tabs.keys());
      const idx = tabIds.indexOf(tabId);
      nextTabId = tabIds[idx + 1] || tabIds[idx - 1];
    }

    try { tab.webview.stop(); } catch (_) {}
    tab.webview.remove();
    tab.tabEl.remove();
    this._tabs.delete(tabId);

    if (nextTabId) this.switchTab(nextTabId);
  }

  /**
   * 切换到指定标签页
   */
  switchTab(tabId) {
    const tab = this._tabs.get(tabId);
    if (!tab) return;

    for (const [, t] of this._tabs) {
      t.webview.style.display = 'none';
      t.tabEl.classList.remove('active');
    }

    tab.webview.style.display = 'flex';
    tab.tabEl.classList.add('active');
    this._activeTabId = tabId;

    // 通知外部同步 UI
    this._cb.onTabSwitch(tab);
  }

  /**
   * 导航当前活跃标签
   */
  navigate(input) {
    const tab = this.activeTab;
    if (!tab) return;
    const url = inputToUrl(input);
    if (url === 'about:blank') return;

    if (!tab.ready) {
      const retry = () => {
        if (tab.ready) { tab.webview.loadURL(url); }
        else { setTimeout(retry, 100); }
      };
      setTimeout(retry, 100);
      return;
    }
    tab.webview.loadURL(url);
  }

  /**
   * 获取所有标签 ID（有序）
   */
  getTabIds() {
    return Array.from(this._tabs.keys());
  }

  /** 更新标签页标题显示 */
  _updateTabTitle(tabId) {
    const tab = this._tabs.get(tabId);
    if (!tab) return;
    const titleSpan = tab.tabEl.querySelector('.app-browser-tab-title');
    if (titleSpan) {
      const display = tab.title || tab.url || '新标签页';
      titleSpan.textContent = display.length > 20 ? display.substring(0, 20) + '…' : display;
      titleSpan.title = tab.title || tab.url;
    }
  }

  /** 更新标签页 Favicon */
  _updateTabFavicon(tabId) {
    const tab = this._tabs.get(tabId);
    if (!tab) return;
    let faviconEl = tab.tabEl.querySelector('.app-browser-tab-favicon');
    if (tab.favicon) {
      if (!faviconEl) {
        faviconEl = document.createElement('img');
        faviconEl.className = 'app-browser-tab-favicon';
        tab.tabEl.insertBefore(faviconEl, tab.tabEl.firstChild);
      }
      faviconEl.src = tab.favicon;
      faviconEl.style.display = '';
    } else if (faviconEl) {
      faviconEl.style.display = 'none';
    }
  }

  /** 销毁所有标签 */
  destroy() {
    this._destroyed = true;
    for (const [, tab] of this._tabs) {
      try { tab.webview.stop(); } catch (_) {}
      tab.webview.remove();
    }
    this._tabs.clear();
    this._activeTabId = null;
  }
}
