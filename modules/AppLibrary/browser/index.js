// ============================================================
//  browser/index.js — 内置浏览器主入口
//  编排 BrowserTabs / BrowserBookmarks / BrowserFind /
//  BrowserZoom / BrowserContextMenu 子模块，
//  创建 DOM 结构、绑定工具栏事件、处理快捷键；
//  DevTools 分屏、设置菜单动作与 Cookies 面板方法
//  以原型混入挂到 BrowserApp（见 browser-devtools.js /
//  browser-settings.js），constructor 与编排逻辑保留在此
// ============================================================

import { BrowserTabs } from './browser-tabs.js';
import { BrowserBookmarks } from './browser-bookmarks.js';
import { BrowserHistory } from './browser-history.js';
import { BrowserDownload } from './browser-download.js';
import { BrowserFind } from './browser-find.js';
import { BrowserZoom } from './browser-zoom.js';
import { BrowserContextMenu } from './browser-context-menu.js';
import { BrowserReader } from './browser-reader.js';
import { BrowserPasswords } from './browser-passwords.js';
import { devToolsMethods } from './browser-devtools.js';
import { settingsMethods } from './browser-settings.js';
import { inputToUrl, getSearchEngine, setSearchEngine, SEARCH_ENGINES, NEWTAB_URL, USER_AGENTS, getUserAgent, setUserAgent } from './utils.js';

/** 确保浏览器 CSS 只加载一次 */
let _browserCssLoaded = false;
function _ensureCss() {
  if (_browserCssLoaded) return;
  _browserCssLoaded = true;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('./browser.css', import.meta.url).href;
  document.head.appendChild(link);
}

export class BrowserApp {
  /**
   * @param {Object} app - 应用信息 { id, name, icon, type, defaultUrl }
   * @param {HTMLElement} modal - 模态框容器（需已挂载到 document.body）
   */
  constructor(app, modal) {
    _ensureCss();
    this._app = app;
    this._modal = modal;

    // ── 构建 DOM ──
    const content = document.createElement('div');
    content.className = 'rich-modal-content app-runner-content app-browser-content';
    this._content = content;

    // 标题栏
    const headerEl = document.createElement('div');
    headerEl.className = 'rich-modal-header';
    headerEl.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px; flex:1;">
        <span class="caption-icon">${app.icon || '🌐'}</span>
        <h2 class="app-runner-title">${app.name || '浏览器'}</h2>
      </div>
      <div class="caption-btns">
        <button class="caption-btn app-runner-min" title="最小化">⚊</button>
        <button class="caption-btn app-runner-max" title="窗口化">❐</button>
        <button class="caption-btn app-runner-close" title="关闭">✕</button>
      </div>
    `;
    content.appendChild(headerEl);

    // 标签栏
    const tabBar = document.createElement('div');
    tabBar.className = 'app-browser-tab-bar';
    const tabList = document.createElement('div');
    tabList.className = 'app-browser-tab-list';
    const newTabBtn = document.createElement('button');
    newTabBtn.className = 'app-browser-tab-new';
    newTabBtn.title = '新建标签页 (Ctrl+T)';
    newTabBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
    tabBar.appendChild(tabList);
    tabList.appendChild(newTabBtn); // "+" 按钮放在标签列表末尾
    content.appendChild(tabBar);

    // 工具栏
    const toolbar = document.createElement('div');
    toolbar.className = 'app-browser-toolbar';

    const backBtn = this._navBtn('后退', '<path d="M19 12H5M12 19l-7-7 7-7"/>');
    const forwardBtn = this._navBtn('前进', '<path d="M5 12h14M12 5l7 7-7 7"/>');
    const refreshBtn = this._navBtn('刷新', '<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>');
    const homeBtn = this._navBtn('主页', '<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>');

    const urlWrap = document.createElement('div');
    urlWrap.className = 'app-browser-url-wrap';

    // 搜索引擎选择器
    const engineBtn = document.createElement('button');
    engineBtn.className = 'app-browser-engine-btn';
    engineBtn.title = '切换搜索引擎';
    const currentEngine = getSearchEngine();
    engineBtn.textContent = currentEngine.name;

    const engineDropdown = document.createElement('div');
    engineDropdown.className = 'app-browser-engine-dropdown';
    engineDropdown.style.display = 'none';
    for (const eng of SEARCH_ENGINES) {
      const opt = document.createElement('div');
      opt.className = 'app-browser-engine-option' + (eng.id === currentEngine.id ? ' active' : '');
      opt.dataset.engineId = eng.id;
      opt.textContent = eng.name;
      engineDropdown.appendChild(opt);
    }

    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.className = 'app-browser-url-input';
    urlInput.placeholder = `使用 ${currentEngine.name} 搜索或输入网址...`;
    const loading = document.createElement('div');
    loading.className = 'app-browser-loading';
    urlWrap.appendChild(engineBtn);
    urlWrap.appendChild(engineDropdown);
    urlWrap.appendChild(urlInput);
    urlWrap.appendChild(loading);

    // 书签按钮放在 URL 输入栏右端
    const bookmarkBtn = document.createElement('button');
    bookmarkBtn.className = 'app-browser-nav-btn app-browser-bookmark-btn app-browser-url-bookmark-btn';
    bookmarkBtn.title = '添加书签';
    bookmarkBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>';
    urlWrap.appendChild(bookmarkBtn);

    const goBtn = document.createElement('button');
    goBtn.className = 'app-browser-go-btn';
    goBtn.title = '前往';
    goBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';

    // 缩放控制（移到底部状态栏）
    const zoomOutBtn = this._navBtn('缩小 (Ctrl+-)', '<line x1="5" y1="12" x2="19" y2="12"/>');
    const zoomLevel = document.createElement('span');
    zoomLevel.className = 'app-browser-zoom-level';
    zoomLevel.textContent = '100%';
    zoomLevel.title = '重置缩放 (Ctrl+0)';
    const zoomInBtn = this._navBtn('放大 (Ctrl++)', '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>');

    const bookmarkListBtn = document.createElement('button');
    bookmarkListBtn.className = 'app-browser-nav-btn app-browser-bookmark-list-btn';
    bookmarkListBtn.title = '书签列表';
    bookmarkListBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>';

    // 下载按钮
    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'app-browser-nav-btn app-browser-download-btn';
    downloadBtn.title = '下载';
    downloadBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';

    // 截图按钮
    const screenshotBtn = this._navBtn('网页截图 (Ctrl+Shift+S)', '<path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/>');

    // 设置按钮（下拉菜单：历史/隐私/阅读/暗色/Cookies/密码/DevTools）
    const settingsBtn = document.createElement('button');
    settingsBtn.className = 'app-browser-nav-btn app-browser-settings-btn';
    settingsBtn.title = '设置';
    settingsBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>';

    const settingsDropdown = document.createElement('div');
    settingsDropdown.className = 'app-browser-settings-dropdown';
    settingsDropdown.style.display = 'none';
    settingsDropdown.innerHTML = `
      <div class="app-browser-settings-item" data-action="history">🕒 浏览历史 <span class="shortcut">Ctrl+H</span></div>
      <div class="app-browser-settings-item" data-action="private">🔒 隐私模式 <span class="app-browser-settings-toggle">关</span></div>
      <div class="app-browser-settings-divider"></div>
      <div class="app-browser-settings-item" data-action="reader">📖 阅读模式 <span class="app-browser-settings-toggle">关</span></div>
      <div class="app-browser-settings-item" data-action="dark">🌙 暗色模式 <span class="app-browser-settings-toggle">关</span></div>
      <div class="app-browser-settings-divider"></div>
      <div class="app-browser-settings-item" data-action="download">📁 下载地址 <span class="app-browser-settings-download-path">默认</span></div>
      <div class="app-browser-settings-item app-browser-settings-ua-trigger" data-action="ua">📱 User-Agent <span class="app-browser-settings-ua-current">${getUserAgent().name}</span> <span class="app-browser-settings-arrow">▸</span></div>
      <div class="app-browser-settings-item" data-action="cookies">🍪 Cookies 管理</div>
      <div class="app-browser-settings-item" data-action="password">🔑 密码管理</div>
      <div class="app-browser-settings-item" data-action="devtools">🔧 开发者工具 <span class="shortcut">F12</span></div>
    `;

    // User-Agent 子菜单
    const uaSubmenu = document.createElement('div');
    uaSubmenu.className = 'app-browser-ua-submenu';
    uaSubmenu.style.display = 'none';
    for (const u of USER_AGENTS) {
      const opt = document.createElement('div');
      opt.className = 'app-browser-engine-option' + (u.id === getUserAgent().id ? ' active' : '');
      opt.dataset.uaId = u.id;
      opt.textContent = u.name;
      uaSubmenu.appendChild(opt);
    }
    settingsDropdown.appendChild(uaSubmenu);

    // 历史按钮（隐藏，通过设置菜单触发，保留引用）
    const historyBtn = document.createElement('button');
    historyBtn.style.display = 'none';
    // 隐私模式按钮（隐藏，通过设置菜单触发，保留引用）
    const privateBtn = document.createElement('button');
    privateBtn.style.display = 'none';
    // 密码管理按钮（隐藏，通过设置菜单触发，保留引用）
    const passwordBtn = document.createElement('button');
    passwordBtn.style.display = 'none';

    const bookmarksPanel = document.createElement('div');
    bookmarksPanel.className = 'app-browser-bookmarks-panel';
    bookmarksPanel.style.display = 'none';

    const historyPanel = document.createElement('div');
    historyPanel.className = 'app-browser-history-panel';
    historyPanel.style.display = 'none';

    const downloadPanel = document.createElement('div');
    downloadPanel.className = 'app-browser-download-panel';
    downloadPanel.style.display = 'none';

    toolbar.appendChild(backBtn);
    toolbar.appendChild(forwardBtn);
    toolbar.appendChild(refreshBtn);
    toolbar.appendChild(homeBtn);
    toolbar.appendChild(urlWrap);
    toolbar.appendChild(goBtn);
    toolbar.appendChild(bookmarkListBtn);
    toolbar.appendChild(downloadBtn);
    toolbar.appendChild(screenshotBtn);
    toolbar.appendChild(settingsBtn);
    toolbar.appendChild(settingsDropdown);
    content.appendChild(toolbar);
    content.appendChild(bookmarksPanel);
    content.appendChild(historyPanel);
    content.appendChild(downloadPanel);

    // 密码管理面板
    const passwordPanel = document.createElement('div');
    passwordPanel.className = 'app-browser-passwords-panel';
    passwordPanel.style.display = 'none';
    content.appendChild(passwordPanel);

    // Cookies 面板
    const cookiesPanel = document.createElement('div');
    cookiesPanel.className = 'app-browser-cookies-panel';
    cookiesPanel.style.display = 'none';
    content.appendChild(cookiesPanel);

    // webview 容器
    const bodyEl = document.createElement('div');
    bodyEl.className = 'app-runner-body app-browser-body';
    content.appendChild(bodyEl);

    // 底部状态栏（渐变浮现，缩放控件在右侧）
    const statusBar = document.createElement('div');
    statusBar.className = 'app-browser-status-bar';
    const statusInfo = document.createElement('div');
    statusInfo.className = 'app-browser-status-info';
    statusInfo.textContent = '就绪';
    const statusRight = document.createElement('div');
    statusRight.className = 'app-browser-status-right';
    statusRight.appendChild(zoomOutBtn);
    statusRight.appendChild(zoomLevel);
    statusRight.appendChild(zoomInBtn);
    statusBar.appendChild(statusInfo);
    statusBar.appendChild(statusRight);
    content.appendChild(statusBar);
    this._statusInfo = statusInfo;

    modal.appendChild(content);
    // 注意：modal 需由调用方（AppRunner）挂载到 document.body

    // 保存 DOM 引用
    this._headerEl = headerEl;
    this._urlInput = urlInput;
    this._loading = loading;

    // ── 初始化子模块 ──
    // 先初始化不需要依赖其他模块的模块
    this._history = new BrowserHistory({
      historyBtn,
      historyPanel,
      getCurrentUrl: () => { const t = this._tabs?.activeTab; return t?.url || ''; },
      onNavigate: (url) => this._tabs?.navigate(url),
    });

    this._download = new BrowserDownload({
      downloadBtn,
      downloadPanel,
    });

    // 异步初始化下载路径显示
    this._initDownloadPathDisplay(settingsDropdown);

    const contextMenu = new BrowserContextMenu({
      content,
      createTab: (url) => this._tabs.createTab(url),
      openFindBar: () => this._find.open(),
      onClipNotify: (msg) => { if (this._statusInfo) this._statusInfo.textContent = msg; },
    });
    this._contextMenu = contextMenu;

    this._tabs = new BrowserTabs({
      tabList,
      bodyEl,
      app,
      callbacks: {
        onUrlChange: (tabId, url) => {
          urlInput.value = url === 'about:blank' ? '' : url;
          this._bookmarks.updateBtnState();
        },
        onTitleChange: (tabId, title) => {
          const titleEl = headerEl.querySelector('.app-runner-title');
          if (titleEl) titleEl.textContent = title || app.name || '浏览器';
          // 同步到窗口标题（任务栏显示）
          document.title = title ? `${title} - ${app.name || '浏览器'}` : (app.name || '浏览器');
        },
        onLoadingChange: (isLoading) => {
          loading.classList.toggle('active', isLoading);
          if (this._statusInfo) this._statusInfo.textContent = isLoading ? '加载中...' : '就绪';
        },
        onTabSwitch: (tabData) => {
          urlInput.value = tabData.url === 'about:blank' ? '' : tabData.url;
          loading.classList.remove('active');
          this._bookmarks.updateBtnState();
          this._zoom.updateDisplay();
          if (this._statusInfo) this._statusInfo.textContent = tabData.url || '就绪';
          const titleEl = headerEl.querySelector('.app-runner-title');
          if (titleEl) titleEl.textContent = tabData.title || app.name || '浏览器';
          // 同步 favicon
          let faviconEl = urlWrap.querySelector('.app-browser-url-favicon');
          if (tabData.favicon) {
            if (!faviconEl) {
              faviconEl = document.createElement('img');
              faviconEl.className = 'app-browser-url-favicon';
              urlWrap.insertBefore(faviconEl, engineBtn.nextSibling);
            }
            faviconEl.src = tabData.favicon;
            faviconEl.style.display = '';
          } else if (faviconEl) {
            faviconEl.style.display = 'none';
          }
          urlInput.focus();
        },
        onContextMenu: (webview, e) => contextMenu.show(webview, e),
        onNavigate: (url, title) => { if (!this._tabs.privateMode) this._history.addRecord(url, title); },
        onFaviconChange: (faviconUrl) => {
          // 在地址栏搜索引擎按钮旁显示 favicon
          let faviconEl = urlWrap.querySelector('.app-browser-url-favicon');
          if (!faviconEl) {
            faviconEl = document.createElement('img');
            faviconEl.className = 'app-browser-url-favicon';
            urlWrap.insertBefore(faviconEl, engineBtn.nextSibling);
          }
          faviconEl.src = faviconUrl;
          faviconEl.style.display = '';
        },
      },
    });

    this._bookmarks = new BrowserBookmarks({
      bookmarkBtn,
      bookmarkListBtn,
      bookmarksPanel,
      getCurrentUrl: () => { const t = this._tabs.activeTab; return t?.url || ''; },
      getCurrentTitle: () => { const t = this._tabs.activeTab; return t?.title || ''; },
      onNavigate: (url) => this._tabs.navigate(url),
    });

    this._find = new BrowserFind({
      content,
      bodyEl,
      getActiveTab: () => this._tabs.activeTab,
    });

    this._zoom = new BrowserZoom({
      zoomOutBtn,
      zoomLevel,
      zoomInBtn,
      getActiveTab: () => this._tabs.activeTab,
      getActiveTabId: () => this._tabs.activeTabId,
    });

    this._reader = new BrowserReader({
      getActiveTab: () => this._tabs.activeTab,
    });

    this._passwords = new BrowserPasswords({
      passwordBtn,
      passwordPanel,
      getActiveTab: () => this._tabs.activeTab,
    });

    // ── 工具栏事件 ──
    // 搜索引擎选择器
    engineBtn.addEventListener('click', () => {
      const visible = engineDropdown.style.display !== 'none';
      engineDropdown.style.display = visible ? 'none' : 'block';
    });
    engineDropdown.querySelectorAll('.app-browser-engine-option').forEach(opt => {
      opt.addEventListener('click', () => {
        const id = opt.dataset.engineId;
        setSearchEngine(id);
        const eng = getSearchEngine();
        engineBtn.textContent = eng.name;
        urlInput.placeholder = `使用 ${eng.name} 搜索或输入网址...`;
        // 更新 active 状态
        engineDropdown.querySelectorAll('.app-browser-engine-option').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        engineDropdown.style.display = 'none';
      });
    });
    document.addEventListener('mousedown', (e) => {
      if (engineDropdown.style.display !== 'none'
          && !engineDropdown.contains(e.target)
          && e.target !== engineBtn) {
        engineDropdown.style.display = 'none';
      }
    });

    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this._tabs.navigate(urlInput.value.trim());
        const tab = this._tabs.activeTab;
        if (tab) tab.webview.focus();
      }
    });

    goBtn.addEventListener('click', () => {
      this._tabs.navigate(urlInput.value.trim());
      const tab = this._tabs.activeTab;
      if (tab) tab.webview.focus();
    });

    // 隐私模式切换
    privateBtn.addEventListener('click', () => {
      this._togglePrivateMode();
    });

    // 网页截图
    screenshotBtn.addEventListener('click', () => this._captureScreenshot());

    // Ctrl+滚轮缩放
    content.addEventListener('wheel', (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
        if (e.deltaY < 0) this._zoom.zoomIn();
        else this._zoom.zoomOut();
      }
    }, { passive: false });

    // 设置下拉菜单
    settingsBtn.addEventListener('click', () => {
      const visible = settingsDropdown.style.display !== 'none';
      settingsDropdown.style.display = visible ? 'none' : 'block';
    });
    document.addEventListener('mousedown', (e) => {
      if (settingsDropdown.style.display !== 'none'
          && !settingsDropdown.contains(e.target)
          && e.target !== settingsBtn
          && !settingsBtn.contains(e.target)) {
        settingsDropdown.style.display = 'none';
        uaSubmenu.style.display = 'none';
      }
    });
    settingsDropdown.querySelectorAll('.app-browser-settings-item').forEach(item => {
      item.addEventListener('click', () => {
        const action = item.dataset.action;
        // User-Agent 项：展开子菜单，不关闭主菜单
        if (action === 'ua') {
          const visible = uaSubmenu.style.display !== 'none';
          uaSubmenu.style.display = visible ? 'none' : 'block';
          return;
        }
        settingsDropdown.style.display = 'none';
        uaSubmenu.style.display = 'none';
        this._handleSettingsAction(action, item);
      });
    });
    // User-Agent 子菜单选项
    uaSubmenu.querySelectorAll('.app-browser-engine-option').forEach(opt => {
      opt.addEventListener('click', () => {
        const uaId = opt.dataset.uaId;
        setUserAgent(uaId);
        const ua = getUserAgent();
        // 更新所有现有 webview 的 UA
        this._tabs.setUserAgentForAll(ua.ua);
        // 更新显示
        const curLabel = settingsDropdown.querySelector('.app-browser-settings-ua-current');
        if (curLabel) curLabel.textContent = ua.name;
        uaSubmenu.querySelectorAll('.app-browser-engine-option').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        uaSubmenu.style.display = 'none';
        settingsDropdown.style.display = 'none';
        if (this._statusInfo) this._statusInfo.textContent = 'User-Agent: ' + ua.name;
      });
    });

    backBtn.addEventListener('click', () => {
      const tab = this._tabs.activeTab;
      if (!tab || !tab.ready) return;
      if (tab.webview.canGoBack()) tab.webview.goBack();
    });

    forwardBtn.addEventListener('click', () => {
      const tab = this._tabs.activeTab;
      if (!tab || !tab.ready) return;
      if (tab.webview.canGoForward()) tab.webview.goForward();
    });

    refreshBtn.addEventListener('click', () => {
      const tab = this._tabs.activeTab;
      if (!tab || !tab.ready) return;
      tab.webview.reload();
    });

    homeBtn.addEventListener('click', () => {
      this._tabs.navigate(NEWTAB_URL);
    });

    newTabBtn.addEventListener('click', () => {
      this._tabs.createTab(NEWTAB_URL);
      urlInput.focus();
    });

    // ── 快捷键 ──
    modal.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 't') { e.preventDefault(); this._tabs.createTab(NEWTAB_URL); urlInput.focus(); }
      if (e.ctrlKey && e.key === 'w') { e.preventDefault(); const id = this._tabs.activeTabId; if (id) this._tabs.closeTab(id); }
      if (e.ctrlKey && e.key === 'f') { e.preventDefault(); this._find.open(); }
      if (e.ctrlKey && e.key === '0') { e.preventDefault(); this._zoom.reset(); }
      if (e.ctrlKey && (e.key === '=' || e.key === '+')) { e.preventDefault(); this._zoom.zoomIn(); }
      if (e.ctrlKey && e.key === '-') { e.preventDefault(); this._zoom.zoomOut(); }
      if (e.ctrlKey && e.key === 'l') { e.preventDefault(); urlInput.focus(); urlInput.select(); }
      if (e.ctrlKey && e.key === 'h') { e.preventDefault(); historyBtn.click(); }
      // Ctrl+Shift+T 恢复关闭的标签
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        const url = this._tabs.lastClosedUrl;
        if (url) { this._tabs.createTab(url); }
      }
      // Ctrl+Shift+S 网页截图
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        this._captureScreenshot();
      }
      // F12 开发者工具（右侧侧边栏）
      if (e.key === 'F12') {
        e.preventDefault();
        this._toggleDevTools();
      }
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        const tabIds = this._tabs.getTabIds();
        if (tabIds.length <= 1) return;
        const idx = tabIds.indexOf(this._tabs.activeTabId);
        const nextIdx = e.shiftKey
          ? (idx - 1 + tabIds.length) % tabIds.length
          : (idx + 1) % tabIds.length;
        this._tabs.switchTab(tabIds[nextIdx]);
      }
    });

    // 创建初始标签页
    const initialUrl = app.defaultUrl && app.defaultUrl !== 'about:blank' ? app.defaultUrl : NEWTAB_URL;
    this._tabs.createTab(initialUrl);

    // ── 导入模式：显示"识别课程表"浮动按钮 ──
    if (app.importMode === 'schedule') {
      this._setupScheduleImportMode();
    }
  }

  /**
   * 课表导入模式：在浏览器右下角显示"识别课程表"浮动按钮
   * 点击后从当前 webview 提取课程数据，派发事件给日历模块
   */
  _setupScheduleImportMode() {
    const fab = document.createElement('button');
    fab.className = 'app-browser-import-fab';
    fab.innerHTML = '<span style="font-size:16px;">📋</span> 识别课程表';
    fab.title = '识别当前页面的课程表';
    this._content.appendChild(fab);

    fab.addEventListener('click', async () => {
      const webview = this.activeWebview;
      if (!webview) {
        if (this._statusInfo) this._statusInfo.textContent = '没有活跃的网页';
        return;
      }
      if (this._statusInfo) this._statusInfo.textContent = '正在识别课程表...';
      fab.classList.add('loading');
      try {
        // 动态获取提取脚本
        let scriptFn = null;
        if (typeof window.__extractScheduleScript === 'function') {
          scriptFn = window.__extractScheduleScript;
        } else {
          // 动态导入日历模块
          const mod = await import('../../calendar/schedule/schedule-import.js');
          if (typeof mod.extractScheduleScript === 'function') scriptFn = mod.extractScheduleScript;
        }
        if (!scriptFn) {
          if (this._statusInfo) this._statusInfo.textContent = '提取脚本不可用';
          fab.classList.remove('loading');
          return;
        }
        const script = '(' + scriptFn.toString() + ')()';
        const result = await new Promise((resolve) => {
          try {
            webview.executeJavaScript(script, true).then(resolve).catch((e) => { console.warn(e); resolve(null); });
          } catch (e) { console.warn(e); resolve(null); }
        });
        fab.classList.remove('loading');
        let courses = [];
        let debug = '';
        try {
          const parsed = JSON.parse(result);
          courses = parsed.courses || [];
          debug = parsed.debug || '';
        } catch (_) {}
        if (courses.length === 0) {
          if (this._statusInfo) this._statusInfo.textContent = '未识别到课程：' + debug;
          return;
        }
        // 派发事件，日历模块监听
        window.dispatchEvent(new CustomEvent('astroknot-schedule-extracted', { detail: { courses } }));
        if (this._statusInfo) this._statusInfo.textContent = '已识别 ' + courses.length + ' 个单元格，请在预览中确认';
      } catch (e) {
        fab.classList.remove('loading');
        if (this._statusInfo) this._statusInfo.textContent = '识别失败: ' + e.message;
      }
    });
  }

  /** 获取当前活跃标签的 webview（兼容 getWebview 接口） */
  get activeWebview() {
    const tab = this._tabs.activeTab;
    return tab?.webview || null;
  }

  /** 获取内容容器 */
  get content() { return this._content; }

  /** 获取标题栏 */
  get header() { return this._headerEl; }

  /** 导航到指定URL（供 AppRunner 在浏览器已打开时调用） */
  navigate(input) {
    if (this._tabs) {
      this._tabs.navigate(input);
    }
  }

  /** 销毁所有资源 */
  destroy() {
    this._closeDevTools();
    if (this._contextMenu && this._contextMenu.destroy) this._contextMenu.destroy();
    this._tabs.destroy();
  }

  /** 创建导航按钮 */
  _navBtn(title, svgPath) {
    const btn = document.createElement('button');
    btn.className = 'app-browser-nav-btn';
    btn.title = title;
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${svgPath}</svg>`;
    return btn;
  }

  /** 切换隐私模式 */
  _togglePrivateMode() {
    const isPrivate = !this._tabs.privateMode;
    this._tabs.setPrivateMode(isPrivate);
    if (isPrivate) {
      this._content.classList.add('private-mode');
    } else {
      this._content.classList.remove('private-mode');
      if (window.api && window.api.browserClearPrivateData) {
        window.api.browserClearPrivateData();
      }
    }
    // 更新设置菜单中的开关文本
    const toggle = this._content.querySelector('.app-browser-settings-item[data-action="private"] .app-browser-settings-toggle');
    if (toggle) toggle.textContent = isPrivate ? '开' : '关';
  }

  /** 网页截图 */
  async _captureScreenshot() {
    const tab = this._tabs.activeTab;
    if (!tab || !tab.ready) return;
    try {
      const image = await tab.webview.capturePage();
      const dataUrl = image.toDataURL();
      const title = tab.title || 'screenshot';
      const filename = `${title.replace(/[<>:"/\\|?*]/g, '_')}_${Date.now()}.png`;
      if (window.api && window.api.browserSaveScreenshot) {
        const result = await window.api.browserSaveScreenshot(dataUrl, filename);
        if (result.success) {
          this._showToast('截图已保存');
        } else if (result.canceled) {
          // 用户取消
        }
      }
    } catch (_) {
      this._showToast('截图失败');
    }
  }

  /** 显示 Toast 提示 */
  _showToast(msg) {
    let toast = this._content.querySelector('.app-browser-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'app-browser-toast';
      this._content.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.display = 'block';
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { toast.style.display = 'none'; }, 2000);
  }
}

// ── 功能块混入：DevTools 分屏 / 设置菜单动作 + Cookies 面板 ──
// 方法体使用 this 访问实例状态，原型混入与写在 class 体内完全等价
Object.assign(BrowserApp.prototype, devToolsMethods, settingsMethods);
