// ============================================================
//  AppLibrary / AppRunner.js — 应用运行模态框
//  支持五种类型：
//    1. 普通应用（GitHub 导入）→ iframe srcdoc
//    2. 浏览器应用（内置）→ <webview> + 地址栏/导航
//    3. 文件管理器应用（内置）→ 自定义 DOM 界面
//    4. IDE 应用（内置）→ VSCode 风格代码编辑器
//    5. 回收站应用（内置）→ 已删除项目列表/恢复/永久删除
//  支持多应用同时打开
// ============================================================

import { VirtualFileSystem } from './ide/core/virtual-fs.js';
import { BrowserApp } from './browser/index.js';
import { FileManagerApp } from './file-manager/index.js';
import { TrashApp } from './trash/index.js';

export class AppRunner {
  constructor() {
    /** @type {Map<string, Object>} appId → {modal, contentEl, windowInstance} */
    this._windows = new Map();
    /** @type {string|null} 当前前台应用 ID */
    this._activeAppId = null;
  }

  /**
   * 打开应用（支持多应用同时打开）
   * @param {Object} app - 应用信息 { id, name, icon, type, defaultUrl, ... }
   */
  async open(app) {
    // 如果已打开，聚焦/恢复
    if (this._windows.has(app.id)) {
      const win = this._windows.get(app.id);
      if (win.windowInstance.getState() === WindowState.MINIMIZED) {
        win.windowInstance.restore();
      }
      WindowManager.bringToFront(win.windowInstance);
      return;
    }

    // 根据应用类型创建不同的内容
    if (app.type === 'browser') {
      this._openBrowserApp(app);
    } else if (app.type === 'file-manager') {
      this._openFileManagerApp(app);
    } else if (app.type === 'ide') {
      this._openIdeApp(app);
    } else if (app.type === 'trash') {
      this._openTrashApp(app);
    } else {
      this._openNormalApp(app);
    }
  }

  // ════════════════════════════════════════════════════════════
  //  浏览器类型应用
  // ════════════════════════════════════════════════════════════

  /**
   * 打开浏览器类型应用
   * 浏览器逻辑已拆分至 browser/ 子模块，此处仅负责
   * WindowManager / Taskbar 集成与生命周期管理
   * @private
   */
  _openBrowserApp(app) {
    const modal = document.createElement('div');
    modal.className = 'rich-modal app-runner-modal';
    modal.style.display = 'none';
    document.body.appendChild(modal);

    // 创建浏览器应用实例（构建 DOM、初始化子模块、创建初始标签）
    const browserApp = new BrowserApp(app, modal);

    const content = browserApp.content;
    const headerEl = browserApp.header;
    const taskbarKey = `app-runner-${app.id}`;

    // 创建 WindowManager 实例
    const windowInstance = WindowManager.create({
      id: taskbarKey,
      title: app.name || '浏览器',
      container: modal,
      content: content,
      header: headerEl,
      icon: app.icon || '🌐',
      initialState: WindowState.MAXIMIZED,
      resizable: true,
      onClose: () => {
        browserApp.destroy();
        modal.remove();
        this._windows.delete(app.id);
        if (this._activeAppId === app.id) this._activeAppId = null;
        if (window.Taskbar) {
          window.Taskbar.removeEditor(taskbarKey);
        }
        if (this._windows.size === 0) {
          window._pause3DAnimation = false;
        }
      },
      onStateChange: (newState) => {
        // 更新最大化按钮图标
        const maxBtn = headerEl.querySelector('.app-runner-max');
        if (maxBtn) {
          if (newState === WindowState.MAXIMIZED) {
            maxBtn.textContent = '❐'; // 窗口化图标
            maxBtn.title = '窗口化';
          } else if (newState === WindowState.WINDOWED) {
            maxBtn.textContent = '▢'; // 最大化图标
            maxBtn.title = '最大化';
          }
        }
        if (newState === WindowState.MAXIMIZED) {
          window._pause3DAnimation = true;
        } else if (this._windows.size === 0 || Array.from(this._windows.values()).every(w => w.windowInstance.getState() !== WindowState.MAXIMIZED)) {
          window._pause3DAnimation = false;
        }
        if (window.Taskbar) {
          window.Taskbar.setEditorActive(taskbarKey, newState !== WindowState.MINIMIZED);
        }
      }
    });

    // 点击模态框时更新前台应用
    modal.addEventListener('mousedown', () => {
      this._activeAppId = app.id;
      if (window.Taskbar) {
        window.Taskbar.setEditorActive(taskbarKey, true);
      }
    });

    // 绑定标题栏按钮
    headerEl.querySelector('.app-runner-min').addEventListener('click', () => windowInstance.minimize());
    headerEl.querySelector('.app-runner-max').addEventListener('click', () => windowInstance.toggleMaximize());
    headerEl.querySelector('.app-runner-close').addEventListener('click', () => this.close(app.id));

    // 注册点击置顶
    if (window.WindowManager) {
      window.WindowManager.registerElement(modal);
    }

    // 打开模态框
    windowInstance.open(WindowState.MAXIMIZED);

    // 注册到任务栏
    window.Taskbar.addOrUpdateEditor(taskbarKey, {
      icon: app.icon || '🌐',
      label: app.name || '浏览器',
      active: true,
      activate: () => {
        const state = windowInstance.getState();
        if (state === WindowState.MINIMIZED) {
          windowInstance.restore();
          WindowManager.bringToFront(windowInstance);
          this._activeAppId = app.id;
        } else if (this._activeAppId === app.id) {
          windowInstance.minimize();
          this._activeAppId = null;
        } else {
          WindowManager.bringToFront(windowInstance);
          this._activeAppId = app.id;
        }
      },
      close: () => this.close(app.id),
      maximize: () => windowInstance.toggleMaximize(),
      minimize: () => windowInstance.minimize(),
    });

    // 暂停 3D 动画
    window._pause3DAnimation = true;

    // 设为前台应用
    this._activeAppId = app.id;

    // 缓存窗口（browserApp 引用用于 getWebview 动态获取活跃 webview）
    this._windows.set(app.id, { modal, windowInstance, browserApp });

    // 聚焦地址栏
    setTimeout(() => { if (browserApp._urlInput) browserApp._urlInput.focus(); }, 100);
  }

  // ════════════════════════════════════════════════════════════
  //  文件管理器类型应用
  // ════════════════════════════════════════════════════════════

  /**
   * 打开文件管理器类型应用
   * 文件管理器逻辑已拆分至 file-manager/ 子模块
   * @private
   */
  _openFileManagerApp(app) {
    const modal = document.createElement('div');
    modal.className = 'rich-modal app-runner-modal';
    modal.style.display = 'none';
    document.body.appendChild(modal);

    // 创建文件管理器实例
    const fmApp = new FileManagerApp(app, modal);

    const content = fmApp.content;
    const headerEl = fmApp.header;
    const taskbarKey = `app-runner-${app.id}`;

    // 创建 WindowManager 实例
    const windowInstance = WindowManager.create({
      id: taskbarKey,
      title: app.name || '此 AstroKnot',
      container: modal,
      content: content,
      header: headerEl,
      icon: app.icon || '💾',
      initialState: WindowState.WINDOWED,
      resizable: true,
      onClose: () => {
        fmApp.destroy();
        modal.remove();
        this._windows.delete(app.id);
        if (this._activeAppId === app.id) this._activeAppId = null;
        if (window.Taskbar) {
          window.Taskbar.removeEditor(taskbarKey);
        }
        if (this._windows.size === 0) {
          window._pause3DAnimation = false;
        }
      },
      onStateChange: (newState) => {
        // 更新最大化按钮图标
        const maxBtn = headerEl.querySelector('.app-runner-max');
        if (maxBtn) {
          if (newState === WindowState.MAXIMIZED) {
            maxBtn.textContent = '❐'; // 窗口化图标
            maxBtn.title = '窗口化';
          } else if (newState === WindowState.WINDOWED) {
            maxBtn.textContent = '▢'; // 最大化图标
            maxBtn.title = '最大化';
          }
        }
        if (newState === WindowState.MAXIMIZED) {
          window._pause3DAnimation = true;
        } else if (this._windows.size === 0 || Array.from(this._windows.values()).every(w => w.windowInstance.getState() !== WindowState.MAXIMIZED)) {
          window._pause3DAnimation = false;
        }
        if (window.Taskbar) {
          window.Taskbar.setEditorActive(taskbarKey, newState !== WindowState.MINIMIZED);
        }
      }
    });

    // 点击模态框时更新前台应用
    modal.addEventListener('mousedown', () => {
      this._activeAppId = app.id;
      if (window.Taskbar) {
        window.Taskbar.setEditorActive(taskbarKey, true);
      }
    });

    // 绑定标题栏按钮
    headerEl.querySelector('.app-runner-min').addEventListener('click', () => windowInstance.minimize());
    headerEl.querySelector('.app-runner-max').addEventListener('click', () => windowInstance.toggleMaximize());
    headerEl.querySelector('.app-runner-close').addEventListener('click', () => this.close(app.id));

    // 注册点击置顶
    if (window.WindowManager) {
      window.WindowManager.registerElement(modal);
    }

    // 打开模态框
    windowInstance.open(WindowState.MAXIMIZED);

    // 注册到任务栏
    window.Taskbar.addOrUpdateEditor(taskbarKey, {
      icon: app.icon || '💾',
      label: app.name || '此 AstroKnot',
      active: true,
      activate: () => {
        const state = windowInstance.getState();
        if (state === WindowState.MINIMIZED) {
          windowInstance.restore();
          WindowManager.bringToFront(windowInstance);
          this._activeAppId = app.id;
        } else if (this._activeAppId === app.id) {
          windowInstance.minimize();
          this._activeAppId = null;
        } else {
          WindowManager.bringToFront(windowInstance);
          this._activeAppId = app.id;
        }
      },
      close: () => this.close(app.id),
      maximize: () => windowInstance.toggleMaximize(),
      minimize: () => windowInstance.minimize(),
    });

    // 暂停 3D 动画
    window._pause3DAnimation = true;

    // 设为前台应用
    this._activeAppId = app.id;

    // 缓存窗口
    this._windows.set(app.id, { modal, windowInstance, fmApp });
  }

  // ════════════════════════════════════════════════════════════
  //  回收站类型应用
  // ════════════════════════════════════════════════════════════

  /**
   * 打开回收站类型应用
   * 回收站逻辑已拆分至 trash/ 子模块
   * @private
   */
  _openTrashApp(app) {
    const modal = document.createElement('div');
    modal.className = 'rich-modal app-runner-modal';
    modal.style.display = 'none';
    document.body.appendChild(modal);

    // 创建回收站实例
    const trashApp = new TrashApp(app, modal);

    const content = trashApp.content;
    const headerEl = trashApp.header;
    const taskbarKey = `app-runner-${app.id}`;

    // 创建 WindowManager 实例
    const windowInstance = WindowManager.create({
      id: taskbarKey,
      title: app.name || '回收站',
      container: modal,
      content: content,
      header: headerEl,
      icon: app.icon || '♻️',
      initialState: WindowState.MAXIMIZED,
      resizable: true,
      onClose: () => {
        trashApp.destroy();
        modal.remove();
        this._windows.delete(app.id);
        if (this._activeAppId === app.id) this._activeAppId = null;
        if (window.Taskbar) {
          window.Taskbar.removeEditor(taskbarKey);
        }
        if (this._windows.size === 0) {
          window._pause3DAnimation = false;
        }
      },
      onStateChange: (newState) => {
        // 更新最大化按钮图标
        const maxBtn = headerEl.querySelector('.app-runner-max');
        if (maxBtn) {
          if (newState === WindowState.MAXIMIZED) {
            maxBtn.textContent = '❐'; // 窗口化图标
            maxBtn.title = '窗口化';
          } else if (newState === WindowState.WINDOWED) {
            maxBtn.textContent = '▢'; // 最大化图标
            maxBtn.title = '最大化';
          }
        }
        if (newState === WindowState.MAXIMIZED) {
          window._pause3DAnimation = true;
        } else if (this._windows.size === 0 || Array.from(this._windows.values()).every(w => w.windowInstance.getState() !== WindowState.MAXIMIZED)) {
          window._pause3DAnimation = false;
        }
        if (window.Taskbar) {
          window.Taskbar.setEditorActive(taskbarKey, newState !== WindowState.MINIMIZED);
        }
      }
    });

    // 点击模态框时更新前台应用
    modal.addEventListener('mousedown', () => {
      this._activeAppId = app.id;
      if (window.Taskbar) {
        window.Taskbar.setEditorActive(taskbarKey, true);
      }
    });

    // 绑定标题栏按钮
    headerEl.querySelector('.app-runner-min').addEventListener('click', () => windowInstance.minimize());
    headerEl.querySelector('.app-runner-max').addEventListener('click', () => windowInstance.toggleMaximize());
    headerEl.querySelector('.app-runner-close').addEventListener('click', () => this.close(app.id));

    // 注册点击置顶
    if (window.WindowManager) {
      window.WindowManager.registerElement(modal);
    }

    // 打开模态框
    windowInstance.open(WindowState.MAXIMIZED);

    // 注册到任务栏
    window.Taskbar.addOrUpdateEditor(taskbarKey, {
      icon: app.icon || '♻️',
      label: app.name || '回收站',
      active: true,
      activate: () => {
        const state = windowInstance.getState();
        if (state === WindowState.MINIMIZED) {
          windowInstance.restore();
          WindowManager.bringToFront(windowInstance);
          this._activeAppId = app.id;
        } else if (this._activeAppId === app.id) {
          windowInstance.minimize();
          this._activeAppId = null;
        } else {
          WindowManager.bringToFront(windowInstance);
          this._activeAppId = app.id;
        }
      },
      close: () => this.close(app.id),
      maximize: () => windowInstance.toggleMaximize(),
      minimize: () => windowInstance.minimize(),
    });

    // 暂停 3D 动画
    window._pause3DAnimation = true;

    // 设为前台应用
    this._activeAppId = app.id;

    // 缓存窗口
    this._windows.set(app.id, { modal, windowInstance, trashApp });
  }

  // ════════════════════════════════════════════════════════════
  //  IDE 类型应用
  // ════════════════════════════════════════════════════════════

  /**
   * 打开 IDE 类型应用
   * IDE 逻辑已拆分至 ide/ 子模块，此处仅负责
   * WindowManager / Taskbar 集成与生命周期管理
   * @private
   */
  async _openIdeApp(app) {
    const { IdeApp } = await import('./ide/app.js');

    const modal = document.createElement('div');
    modal.className = 'rich-modal app-runner-modal';
    modal.style.display = 'none';
    document.body.appendChild(modal);

    // 创建 IDE 应用实例（构建 DOM 结构）
    const ideApp = new IdeApp(app, modal);

    // 如果有 sandboxPath，在 init 前设置
    if (app.sandboxPath) {
      ideApp._sandboxPath = app.sandboxPath;
    }
    if (app.nodeId) {
      ideApp._nodeId = app.nodeId;
    }

    const content = ideApp.content;
    const headerEl = ideApp.header;
    const taskbarKey = `app-runner-${app.id}`;

    // 创建 WindowManager 实例
    const windowInstance = WindowManager.create({
      id: taskbarKey,
      title: app.name || 'IDE',
      container: modal,
      content: content,
      header: headerEl,
      icon: app.icon || '💻',
      initialState: WindowState.MAXIMIZED,
      resizable: true,
      onClose: () => {
        // 如果是从节点打开的，先同步 sandbox 回节点
        if (ideApp._nodeId && ideApp._sandboxPath) {
          _syncIdeToNode(ideApp._nodeId, ideApp._sandboxPath);
        }
        ideApp.destroy();
        modal.remove();
        this._windows.delete(app.id);
        if (this._activeAppId === app.id) this._activeAppId = null;
        if (window.Taskbar) {
          window.Taskbar.removeEditor(taskbarKey);
        }
        if (this._windows.size === 0) {
          window._pause3DAnimation = false;
        }
      },
      onStateChange: (newState) => {
        // 更新最大化按钮图标（IDE 使用 SVG）
        const maxBtn = headerEl.querySelector('.app-runner-max');
        if (maxBtn) {
          if (newState === WindowState.MAXIMIZED) {
            // 窗口化图标：两个重叠的矩形
            maxBtn.innerHTML = '<svg viewBox="0 0 10 10"><rect x="0" y="3" width="5" height="5" rx="0"/><rect x="3" y="0" width="5" height="5" rx="0"/></svg>';
            maxBtn.title = '窗口化';
          } else if (newState === WindowState.WINDOWED) {
            // 最大化图标：单个矩形
            maxBtn.innerHTML = '<svg viewBox="0 0 10 10"><rect x="2" y="2" width="6" height="6" rx="0"/></svg>';
            maxBtn.title = '最大化';
          }
        }
        if (newState === WindowState.MAXIMIZED) {
          window._pause3DAnimation = true;
        } else if (this._windows.size === 0 || Array.from(this._windows.values()).every(w => w.windowInstance.getState() !== WindowState.MAXIMIZED)) {
          window._pause3DAnimation = false;
        }
        if (window.Taskbar) {
          window.Taskbar.setEditorActive(taskbarKey, newState !== WindowState.MINIMIZED);
        }
      }
    });

    // 点击模态框时更新前台应用
    modal.addEventListener('mousedown', () => {
      this._activeAppId = app.id;
      if (window.Taskbar) {
        window.Taskbar.setEditorActive(taskbarKey, true);
      }
    });

    // 绑定标题栏按钮
    headerEl.querySelector('.app-runner-min').addEventListener('click', () => windowInstance.minimize());
    headerEl.querySelector('.app-runner-max').addEventListener('click', () => windowInstance.toggleMaximize());
    headerEl.querySelector('.app-runner-close').addEventListener('click', () => this.close(app.id));

    // 注册点击置顶
    if (window.WindowManager) {
      window.WindowManager.registerElement(modal);
    }

    // 打开模态框
    windowInstance.open(WindowState.MAXIMIZED);

    // 注册到任务栏
    window.Taskbar.addOrUpdateEditor(taskbarKey, {
      icon: app.icon || '💻',
      label: app.name || 'IDE',
      active: true,
      activate: () => {
        const state = windowInstance.getState();
        if (state === WindowState.MINIMIZED) {
          windowInstance.restore();
          WindowManager.bringToFront(windowInstance);
          this._activeAppId = app.id;
        } else if (this._activeAppId === app.id) {
          windowInstance.minimize();
          this._activeAppId = null;
        } else {
          WindowManager.bringToFront(windowInstance);
          this._activeAppId = app.id;
        }
      },
      close: () => this.close(app.id),
      maximize: () => windowInstance.toggleMaximize(),
      minimize: () => windowInstance.minimize(),
    });

    // 暂停 3D 动画
    window._pause3DAnimation = true;

    // 设为前台应用
    this._activeAppId = app.id;

    // 缓存窗口
    this._windows.set(app.id, { modal, windowInstance, ideApp });

    // 初始化 IDE（在 DOM 挂载后异步初始化 Monaco 等组件）
    setTimeout(() => ideApp.init(), 100);
  }

  // ════════════════════════════════════════════════════════════
  //  普通类型应用（GitHub 导入的）
  // ════════════════════════════════════════════════════════════

  /**
   * 打开普通类型应用
   * @private
   */
  async _openNormalApp(app) {
    const modal = document.createElement('div');
    modal.className = 'rich-modal app-runner-modal';
    modal.style.display = 'none';
    // 图标：图片路径用 <img>，否则按 emoji/文本渲染
    const iconStr = app.icon || '📦';
    const iconHtml = _isImagePath(iconStr)
      ? `<img class="caption-icon-img" src="${iconStr}" alt="${app.name || '应用'}" draggable="false">`
      : `<span class="caption-icon">${iconStr}</span>`;
    modal.innerHTML = `
      <div class="rich-modal-content app-runner-content">
        <div class="rich-modal-header">
          <div style="display:flex; align-items:center; gap:8px; flex:1;">
            ${iconHtml}
            <h2 class="app-runner-title">${app.name || '应用'}</h2>
          </div>
          <div class="caption-btns">
            <button class="caption-btn app-runner-min" title="最小化">⚊</button>
            <button class="caption-btn app-runner-max" title="窗口化">❐</button>
            <button class="caption-btn app-runner-close" title="关闭">✕</button>
          </div>
        </div>
        <div class="app-runner-body">
          <iframe class="app-runner-iframe" sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"></iframe>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const content = modal.querySelector('.rich-modal-content');
    const header = modal.querySelector('.rich-modal-header');
    const iframe = modal.querySelector('.app-runner-iframe');
    const taskbarKey = `app-runner-${app.id}`;

    // 创建 WindowManager 实例
    const windowInstance = WindowManager.create({
      id: taskbarKey,
      title: app.name || '应用',
      container: modal,
      content: content,
      header: header,
      icon: app.icon || '📦',
      initialState: WindowState.MAXIMIZED,
      resizable: true,
      onClose: () => {
        this._cleanupIframe(iframe);
        modal.remove();
        this._windows.delete(app.id);
        if (this._activeAppId === app.id) this._activeAppId = null;
        if (window.Taskbar) {
          window.Taskbar.removeEditor(taskbarKey);
        }
        if (this._windows.size === 0) {
          window._pause3DAnimation = false;
        }
      },
      onStateChange: (newState) => {
        // 更新最大化按钮图标
        const maxBtn = modal.querySelector('.app-runner-max');
        if (maxBtn) {
          if (newState === WindowState.MAXIMIZED) {
            maxBtn.textContent = '❐'; // 窗口化图标
            maxBtn.title = '窗口化';
          } else if (newState === WindowState.WINDOWED) {
            maxBtn.textContent = '▢'; // 最大化图标
            maxBtn.title = '最大化';
          }
        }
        if (newState === WindowState.MAXIMIZED) {
          window._pause3DAnimation = true;
        } else if (this._windows.size === 0 || Array.from(this._windows.values()).every(w => w.windowInstance.getState() !== WindowState.MAXIMIZED)) {
          window._pause3DAnimation = false;
        }
        if (window.Taskbar) {
          window.Taskbar.setEditorActive(taskbarKey, newState !== WindowState.MINIMIZED);
        }
      }
    });

    // 点击模态框时更新前台应用
    modal.addEventListener('mousedown', () => {
      this._activeAppId = app.id;
      if (window.Taskbar) {
        window.Taskbar.setEditorActive(taskbarKey, true);
      }
    });

    // 绑定按钮
    modal.querySelector('.app-runner-min').addEventListener('click', () => windowInstance.minimize());
    modal.querySelector('.app-runner-max').addEventListener('click', () => windowInstance.toggleMaximize());
    modal.querySelector('.app-runner-close').addEventListener('click', () => this.close(app.id));

    // 注册点击置顶
    if (window.WindowManager) {
      window.WindowManager.registerElement(modal);
    }

    // 加载应用文件
    try {
      // 优先：直接从磁盘加载 HTML（避免 buildSimpleHtml 内联大项目卡死）
      const sandboxPath = await window.api.getAppSandboxPath(app.id);
      if (sandboxPath) {
        // 通过 IPC 查找入口 HTML 文件
        const entryFile = await window.api.findAppEntryHtml(app.id);
        
        if (entryFile) {
          // 启动本地 HTTP 服务器提供静态文件服务
          const serverInfo = await window.api.startAppServer(app.id);
          if (serverInfo && serverInfo.port) {
            // 计算入口文件相对于 sandbox 的路径
            const normalizedSandbox = sandboxPath.replace(/\\/g, '/');
            const normalizedEntry = entryFile.replace(/\\/g, '/');
            const relPath = normalizedEntry.replace(normalizedSandbox + '/', '').replace(normalizedSandbox, '');
            const baseUrl = `http://127.0.0.1:${serverInfo.port}`;
            iframe.src = relPath ? `${baseUrl}/${relPath}` : `${baseUrl}/`;
          } else {
            const localUrl = 'astroknot-local://' + entryFile.replace(/\\/g, '/');
            iframe.srcdoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><script>window.location.replace("${localUrl}");</script></head><body></body></html>`;
          }
          windowInstance.open(WindowState.MAXIMIZED);
          this._registerAppTaskbar(app, windowInstance, taskbarKey);
          window._pause3DAnimation = true;
          this._activeAppId = app.id;
          this._windows.set(app.id, { modal, iframe, windowInstance });
          return;
        }

        // 没有找到 HTML 文件，显示提示页面
        const serverInfo = await window.api.startAppServer(app.id);
        if (serverInfo && serverInfo.port) {
          iframe.srcdoc = this._buildNoEntryPage(app, sandboxPath, serverInfo.port);
          windowInstance.open(WindowState.MAXIMIZED);
          this._registerAppTaskbar(app, windowInstance, taskbarKey);
          window._pause3DAnimation = true;
          this._activeAppId = app.id;
          this._windows.set(app.id, { modal, iframe, windowInstance });
          return;
        }
      }

      // 回退：使用 VFS 内联方式（适用于纯 HTML 小项目）
      const tree = await window.api.readAppSandbox(app.id);
      if (!tree) {
        console.error('[AppRunner] 应用文件不存在:', app.id);
        modal.remove();
        return;
      }

      const vfs = new VirtualFileSystem(tree);
      const html = vfs.buildSimpleHtml();
      iframe.srcdoc = html;

      // 打开模态框
      windowInstance.open(WindowState.MAXIMIZED);

      // 注册到任务栏
      window.Taskbar.addOrUpdateEditor(taskbarKey, {
        icon: app.icon || '📦',
        label: app.name || '应用',
        active: true,
        activate: () => {
          const state = windowInstance.getState();
          if (state === WindowState.MINIMIZED) {
            windowInstance.restore();
            WindowManager.bringToFront(windowInstance);
            this._activeAppId = app.id;
          } else if (this._activeAppId === app.id) {
            windowInstance.minimize();
            this._activeAppId = null;
          } else {
            WindowManager.bringToFront(windowInstance);
            this._activeAppId = app.id;
          }
        },
        close: () => this.close(app.id),
        maximize: () => windowInstance.toggleMaximize(),
        minimize: () => windowInstance.minimize(),
      });

      // 暂停 3D 动画
      window._pause3DAnimation = true;

      // 设为前台应用
      this._activeAppId = app.id;

      // 缓存窗口
      this._windows.set(app.id, { modal, iframe, windowInstance });

    } catch (e) {
      console.error('[AppRunner] 打开应用失败:', e);
      modal.remove();
    }
  }

  /**
   * 关闭指定应用窗口（不传 appId 则关闭全部）
   */
  close(appId) {
    if (appId) {
      const win = this._windows.get(appId);
      if (win) win.windowInstance.close();
      // 停止 HTTP 服务器
      if (window.api?.stopAppServer) window.api.stopAppServer(appId);
    } else {
      for (const [, win] of this._windows) {
        win.windowInstance.close();
      }
    }
  }

  /**
   * 获取指定应用的 webview 实例（用于课表抓取等）
   * 返回浏览器应用当前活跃标签的 webview
   * @param {string} appId
   * @returns {Electron.WebviewTag|null}
   */
  getWebview(appId) {
    const win = this._windows.get(appId);
    if (!win) return null;
    // 兼容旧接口：直接有 webview 则返回
    if (win.webview) return win.webview;
    // 通过 browserApp 动态获取当前活跃标签的 webview
    if (win.browserApp) return win.browserApp.activeWebview;
    return null;
  }

  /**
   * 彻底清理 iframe
   * @private
   */
  _cleanupIframe(iframe) {
    if (!iframe) return;
    iframe.srcdoc = '';
    try {
      iframe.contentWindow.location.href = 'about:blank';
    } catch (e) { /* 跨域 */ }
    const parent = iframe.parentNode;
    if (parent) parent.removeChild(iframe);
  }

  /**
   * 销毁所有窗口
   */
  destroy() {
    for (const [, win] of this._windows) {
      // 浏览器应用：通过 browserApp.destroy 清理 webview
      if (win.browserApp) {
        win.browserApp.destroy();
      }
      // 文件管理器应用：通过 fmApp.destroy 清理
      if (win.fmApp) {
        win.fmApp.destroy();
      }
      // 回收站应用：通过 trashApp.destroy 清理
      if (win.trashApp) {
        win.trashApp.destroy();
      }
      // IDE 应用：通过 ideApp.destroy 清理
      if (win.ideApp) {
        win.ideApp.destroy();
      }
      // 旧接口兼容：直接有 webview
      if (win.webview) {
        try { win.webview.stop(); } catch (_) {}
        try { win.webview.loadURL('about:blank'); } catch (_) {}
      }
      if (win.iframe) {
        this._cleanupIframe(win.iframe);
      }
      win.modal.remove();
    }
    this._windows.clear();
    window._pause3DAnimation = false;
  }

  /**
   * 注册应用到任务栏
   * @private
   */
  _registerAppTaskbar(app, windowInstance, taskbarKey) {
    window.Taskbar.addOrUpdateEditor(taskbarKey, {
      icon: app.icon || '📦',
      label: app.name || '应用',
      active: true,
      activate: () => {
        const state = windowInstance.getState();
        if (state === WindowState.MINIMIZED) {
          windowInstance.restore();
          WindowManager.bringToFront(windowInstance);
          this._activeAppId = app.id;
        } else if (this._activeAppId === app.id) {
          windowInstance.minimize();
          this._activeAppId = null;
        } else {
          WindowManager.bringToFront(windowInstance);
          this._activeAppId = app.id;
        }
      },
      close: () => this.close(app.id),
      maximize: () => windowInstance.toggleMaximize(),
      minimize: () => windowInstance.minimize(),
    });
  }

  /**
   * 构建无入口文件提示页面
   * @private
   */
  _buildNoEntryPage(app, sandboxPath, port) {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${app.name}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { 
    background: #0d1b23; color: #cef; font-family: -apple-system, sans-serif;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    height: 100vh; gap: 16px;
  }
  .icon { font-size: 64px; }
  h1 { font-size: 20px; color: #eef; }
  .msg { color: #8aa; font-size: 14px; text-align: center; max-width: 500px; line-height: 1.6; }
  .hint { background: #1a2a3a; border: 1px solid #2c6e7e; border-radius: 8px; padding: 16px 24px; margin-top: 8px; }
  .hint code { color: #0ff; background: rgba(0,229,255,0.1); padding: 2px 6px; border-radius: 3px; font-family: Consolas, monospace; }
  .btn { 
    background: #2c6e7e; color: #eef; border: none; padding: 10px 24px; 
    border-radius: 6px; cursor: pointer; font-size: 14px; margin-top: 8px;
  }
  .btn:hover { background: #3c8e9e; }
</style>
</head>
<body>
  <div class="icon">📦</div>
  <h1>${app.name}</h1>
  <div class="msg">
    此项目没有找到可运行的入口 HTML 文件。<br>
    可能是一个库（Library）项目，需要额外配置才能运行。
  </div>
  <div class="hint">
    <p>你可以：</p>
    <p>1. 在 IDE 中手动创建 <code>index.html</code> 入口文件</p>
    <p>2. 在终端中运行 <code>npm start</code> 启动开发服务器</p>
    <p>3. 查看项目文档了解如何运行</p>
  </div>
  <button class="btn" onclick="window.parent.postMessage({type:'open-in-ide',appId:'${app.id}'},'*')">在 IDE 中打开</button>
</body>
</html>`;
  }
}

/**
 * 同步 IDE sandbox 目录回节点
 * 从磁盘读取 sandbox 内容 → 更新 node.fileSystem → 保存项目
 */
async function _syncIdeToNode(nodeId, sandboxPath) {
  try {
    if (!window.api?.ideSyncSandboxToNode) return;
    const result = await window.api.ideSyncSandboxToNode(sandboxPath);
    if (!result || !result.success || !result.fileSystem) return;

    const node = window.appState?.nodeMap?.get(nodeId);
    if (!node) return;

    node.fileSystem = result.fileSystem;
    node.activeMode = 'code';

    // 保存项目数据
    if (typeof window.saveCurrentProjectData === 'function') {
      window.saveCurrentProjectData();
    }
  } catch (e) {
    console.error('[AppRunner] 同步 sandbox 到节点失败:', e);
  }
}

/** 检测是否为图片路径（相对路径 / http(s) URL / file URL / data URI） */
function _isImagePath(icon) {
  if (!icon || typeof icon !== 'string') return false;
  return /\.(png|jpe?g|gif|svg|webp|bmp|ico)$/i.test(icon) ||
         /^https?:\/\//i.test(icon) ||
         /^file:\/\//i.test(icon) ||
         /^data:image\//i.test(icon);
}
