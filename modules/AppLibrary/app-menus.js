// ============================================================
//  AppLibrary/app-menus.js — 右键菜单（原型混入）
//  职责：通用右键菜单的创建 / 显示 / 关闭（屏幕边缘防溢出、
//  点击外部关闭、capture 阶段监听 mousedown 与 pointerdown）、
//  应用项右键菜单的菜单项编排（打开 / IDE 打开 / 创建节点 /
//  GitHub 更新 / 资源管理器 / 复制粘贴 / 删除 / 重命名 / 属性）
//  实现说明：以原型混入（Object.assign(AppPanel.prototype, ...)）
//  挂载到 AppPanel——方法体通过 this 访问实例状态
//  （this._currentCloseHandler / this._clipboard 等），与写在
//  class 体内完全等价；菜单动作指向 AppPanel.js 保留的方法
// ============================================================

export const menuMethods = {
  // ════════════════════════════════════════════════════════════
  //  右键菜单
  // ════════════════════════════════════════════════════════════

  /**
   * 创建并显示右键菜单（通用方法）
   * @param {number} x
   * @param {number} y
   * @param {Array} items - [{label, action, disabled?}, {type:'separator'}]
   * @private
   */
  _showMenu(x, y, items) {
    this._closeContextMenu();

    const menu = document.createElement('div');
    menu.className = 'dock-context-menu';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    for (const it of items) {
      if (it.type === 'separator') {
        const sep = document.createElement('div');
        sep.className = 'dock-context-separator';
        menu.appendChild(sep);
      } else {
        const btn = document.createElement('div');
        btn.className = 'dock-context-item' + (it.disabled ? ' disabled' : '');
        btn.textContent = it.label;
        if (!it.disabled) {
          btn.addEventListener('click', (e) => {
            e.stopPropagation(); // 关键：阻止冒泡到 document 的 closeHandler
            this._closeContextMenu();
            it.action();
          });
        }
        menu.appendChild(btn);
      }
    }

    document.body.appendChild(menu);

    // 防止菜单超出屏幕
    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        menu.style.left = `${Math.max(8, window.innerWidth - rect.width - 8)}px`;
      }
      if (rect.bottom > window.innerHeight) {
        menu.style.top = `${Math.max(8, window.innerHeight - rect.height - 8)}px`;
      }
    });

    // 使用 mousedown 关闭，避免与 click 事件冲突
    let closed = false;
    const closeHandler = (e) => {
      if (closed) return;
      if (!menu.contains(e.target)) {
        closed = true;
        this._closeContextMenu();
      }
    };
    this._currentCloseHandler = closeHandler;
    // 延迟注册，防止当前 contextmenu 事件立即触发关闭
    // 使用捕获阶段（capture: true）确保即使 3D canvas 等元素阻止冒泡也能捕获到点击
    // 同时监听 mousedown 和 pointerdown（OrbitControls 使用 pointer 事件）
    setTimeout(() => {
      document.addEventListener('mousedown', closeHandler, true);
      document.addEventListener('pointerdown', closeHandler, true);
    }, 0);
  },

  /**
   * 应用项右键菜单
   * @private
   */
  _showAppContextMenu(x, y, app) {
    const isBuiltin = app.builtin === true;
    const isGitHub = !isBuiltin && !!app.repo;
    const items = [
      { label: '📂 打开', action: () => this._runApp(app) },
      { label: '💻 通过 IDE 打开', action: () => this._openAppInIDE(app), disabled: !isGitHub },
      { type: 'separator' },
      { label: '创建应用节点', action: () => this._insertAsNode(app), disabled: isBuiltin },
      { label: '从 GitHub 更新', action: () => this._updateApp(app), disabled: isBuiltin },
      { type: 'separator' },
      { label: '打开文件所在位置', action: () => this._openInExplorer(app), disabled: isBuiltin },
      { label: '复制', action: () => this._copyApp(app), disabled: isBuiltin },
      { label: '粘贴', action: () => this._pasteApp(), disabled: !this._clipboard },
      { label: '删除', action: () => this._deleteApp(app), disabled: isBuiltin },
      { label: '重命名', action: () => this._renameApp(app), disabled: isBuiltin },
      { type: 'separator' },
      { label: '属性', action: () => this._showProperties(app) },
    ];
    this._showMenu(x, y, items);
  },

  /**
   * 关闭右键菜单
   * @private
   */
  _closeContextMenu() {
    const existing = document.querySelector('.dock-context-menu');
    if (existing) existing.remove();
    if (this._currentCloseHandler) {
      // 移除时也要使用 capture: true（与添加时一致）
      document.removeEventListener('mousedown', this._currentCloseHandler, true);
      document.removeEventListener('pointerdown', this._currentCloseHandler, true);
      this._currentCloseHandler = null;
    }
  }
};
