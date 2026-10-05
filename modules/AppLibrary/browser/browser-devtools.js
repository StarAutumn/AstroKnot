// ============================================================
//  browser/browser-devtools.js — DevTools 分屏侧边栏
//  职责：切换/打开/关闭开发者工具侧边栏，通知主进程创建并
//  同步 DevTools BrowserWindow 的位置尺寸，支持拖拽调整宽度
//  实现说明：以原型混入（Object.assign(BrowserApp.prototype, ...)）
//  挂载到 BrowserApp——方法体通过 this 访问实例状态
//  （this._devtools* / this._content / this._tabs 等），
//  与写在 class 体内完全等价；状态初始化与调用时机
//  仍由 index.js 的 constructor / destroy 统一编排
// ============================================================

export const devToolsMethods = {
  /** 切换开发者工具（右侧可拖拽侧边栏） */
  _toggleDevTools() {
    if (this._devtoolsSidebar) {
      this._closeDevTools();
    } else {
      this._openDevTools();
    }
  },

  /** 打开 DevTools 侧边栏 */
  _openDevTools() {
    const tab = this._tabs.activeTab;
    if (!tab || !tab.ready) return;

    // 获取目标 webview 的 webContentsId
    let targetId;
    try { targetId = tab.webview.getWebContentsId(); } catch (_) { return; }
    if (!targetId) return;

    this._devtoolsTargetId = targetId;

    // 创建侧边栏容器（只有标题栏，内容区域由 BrowserWindow 填充）
    const sidebar = document.createElement('div');
    sidebar.className = 'app-browser-devtools-sidebar';

    const header = document.createElement('div');
    header.className = 'app-browser-devtools-header';
    header.innerHTML = '<span>开发者工具</span><button class="app-browser-devtools-close" title="关闭">✕</button>';
    sidebar.appendChild(header);

    // 内容区域占位（BrowserWindow 会叠加在此区域上方）
    const contentArea = document.createElement('div');
    contentArea.className = 'app-browser-devtools-content-area';
    sidebar.appendChild(contentArea);

    const resizer = document.createElement('div');
    resizer.className = 'app-browser-devtools-resizer';

    this._content.appendChild(resizer);
    this._content.appendChild(sidebar);
    this._content.classList.add('devtools-open');

    this._devtoolsSidebar = sidebar;
    this._devtoolsResizer = resizer;
    this._devtoolsContentArea = contentArea;

    header.querySelector('.app-browser-devtools-close').addEventListener('click', () => this._closeDevTools());

    // 通过 IPC 让主进程创建 DevTools BrowserWindow
    if (window.api && window.api.browserAttachDevTools) {
      window.api.browserAttachDevTools(targetId).then(() => {
        // 等 BrowserWindow 创建后更新位置
        setTimeout(() => this._updateDevToolsBounds(), 200);
      });
    }

    // 监听主窗口移动/调整大小，同步更新 DevTools 位置
    if (window.api && window.api.onBrowserDevToolsBoundsChanged) {
      window.api.onBrowserDevToolsBoundsChanged(() => this._updateDevToolsBounds());
    }

    // 绑定拖拽调整宽度
    this._bindDevToolsResize();
  },

  /** 更新 DevTools BrowserWindow 的位置和大小 */
  _updateDevToolsBounds() {
    if (!this._devtoolsContentArea) return;
    const rect = this._devtoolsContentArea.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    if (window.api && window.api.browserUpdateDevToolsBounds) {
      window.api.browserUpdateDevToolsBounds(
        Math.round(rect.left),
        Math.round(rect.top),
        Math.round(rect.width),
        Math.round(rect.height)
      );
    }
  },

  /** 关闭 DevTools 侧边栏 */
  _closeDevTools() {
    if (!this._devtoolsSidebar) return;
    // 通知主进程关闭 DevTools
    if (this._devtoolsTargetId && window.api && window.api.browserCloseDevTools) {
      window.api.browserCloseDevTools(this._devtoolsTargetId);
    }
    // 移除 bounds 监听
    if (window.api && window.api.removeBrowserDevToolsBoundsChanged) {
      window.api.removeBrowserDevToolsBoundsChanged();
    }
    this._devtoolsSidebar.remove();
    this._devtoolsResizer?.remove();
    this._content.classList.remove('devtools-open');
    // 清除内联样式
    const bodyEl = this._content.querySelector('.app-browser-body');
    if (bodyEl) bodyEl.style.marginRight = '';
    this._devtoolsSidebar = null;
    this._devtoolsResizer = null;
    this._devtoolsContentArea = null;
    this._devtoolsTargetId = null;
  },

  /** 绑定拖拽调整 DevTools 侧边栏宽度 */
  _bindDevToolsResize() {
    const resizer = this._devtoolsResizer;
    if (!resizer) return;
    resizer.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const sidebar = this._devtoolsSidebar;
      if (!sidebar) return;
      resizer.setPointerCapture(e.pointerId);
      resizer.classList.add('dragging');
      const startX = e.clientX;
      const startWidth = sidebar.offsetWidth;
      const bodyEl = this._content.querySelector('.app-browser-body');

      const moveHandler = (ev) => {
        let width = startWidth + (startX - ev.clientX);
        if (width < 200) width = 200;
        if (width > 800) width = 800;
        sidebar.style.width = width + 'px';
        resizer.style.right = width + 'px';
        if (bodyEl) bodyEl.style.marginRight = width + 'px';
        // 同步更新 DevTools 窗口位置
        this._updateDevToolsBounds();
      };
      const upHandler = (ev) => {
        resizer.classList.remove('dragging');
        try { resizer.releasePointerCapture(ev.pointerId); } catch (_) {}
        resizer.removeEventListener('pointermove', moveHandler);
        resizer.removeEventListener('pointerup', upHandler);
        resizer.removeEventListener('pointercancel', upHandler);
        this._updateDevToolsBounds();
      };
      resizer.addEventListener('pointermove', moveHandler);
      resizer.addEventListener('pointerup', upHandler);
      resizer.addEventListener('pointercancel', upHandler);
    });
  }
};
