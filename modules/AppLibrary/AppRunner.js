// ============================================================
//  AppLibrary / AppRunner.js — 应用运行模态框（PWA 风格纯预览）
//  支持多应用同时打开：每个应用动态创建独立的 modal + iframe
//  从磁盘加载应用 VFS → buildSimpleHtml() → iframe srcdoc
// ============================================================

import { VirtualFileSystem } from '../richEditor/sandbox/core/virtual-fs.js';

export class AppRunner {
  constructor() {
    /** @type {Map<string, Object>} appId → {modal, iframe, windowInstance} */
    this._windows = new Map();
    /** @type {string|null} 当前前台应用 ID */
    this._activeAppId = null;
  }

  /**
   * 打开应用预览（支持多应用同时打开）
   * @param {Object} app - 应用信息 { id, name, icon, ... }
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

    // 动态创建 modal DOM
    const modal = document.createElement('div');
    modal.className = 'rich-modal app-runner-modal';
    modal.style.display = 'none';
    modal.innerHTML = `
      <div class="rich-modal-content app-runner-content">
        <div class="rich-modal-header">
          <span class="caption-icon">${app.icon || '📦'}</span>
          <h2 class="app-runner-title">${app.name || '应用'}</h2>
          <div class="caption-btns">
            <button class="caption-btn app-runner-min" title="最小化">🗕</button>
            <button class="caption-btn app-runner-max" title="最大化/还原">🗖</button>
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
        // 没有窗口了才恢复 3D 动画
        if (this._windows.size === 0) {
          window._pause3DAnimation = false;
        }
      },
      onStateChange: (newState) => {
        // 任意窗口最大化时暂停 3D 动画
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
          // 最小化 → 恢复并置顶
          if (state === WindowState.MINIMIZED) {
            windowInstance.restore();
            WindowManager.bringToFront(windowInstance);
            this._activeAppId = app.id;
          }
          // 已在前台 → 最小化（类似 Windows 任务栏行为）
          else if (this._activeAppId === app.id) {
            windowInstance.minimize();
            this._activeAppId = null;
          }
          // 不在前台 → 置顶
          else {
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
    } else {
      for (const [, win] of this._windows) {
        win.windowInstance.close();
      }
    }
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
      this._cleanupIframe(win.iframe);
      win.modal.remove();
    }
    this._windows.clear();
    window._pause3DAnimation = false;
  }
}
