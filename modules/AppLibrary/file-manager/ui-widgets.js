// ============================================================
//  file-manager/ui-widgets.js — 通用 UI 小件（原型混入）
//  职责：右键菜单的构建 / 定位 / 点击外部关闭，输入对话框
//  与确认对话框（Promise 封装）、轻提示 Toast、HTML 转义
//  实现说明：以原型混入（Object.assign(FileManagerApp.prototype, ...)）
//  挂载到 FileManagerApp——方法体通过 this 访问实例状态
//  （this._contextMenu 等），与写在 class 体内完全等价；
//  菜单项数据与调用时机由 index.js / tree.js 等统一编排
// ============================================================

export const uiWidgetMethods = {
  // ════════════════════════════════════════════════════════════
  //  右键菜单
  // ════════════════════════════════════════════════════════════

  _showContextMenu(x, y, items) {
    this._hideContextMenu();
    const menu = document.createElement('div');
    menu.className = 'fm-context-menu';
    for (const item of items) {
      if (item.type === 'separator') {
        const sep = document.createElement('div');
        sep.className = 'fm-menu-separator';
        menu.appendChild(sep);
      } else {
        const btn = document.createElement('div');
        btn.className = 'fm-menu-item' + (item.disabled ? ' disabled' : '');
        btn.textContent = item.label;
        if (!item.disabled) {
          btn.addEventListener('click', () => { this._hideContextMenu(); item.action(); });
        }
        menu.appendChild(btn);
      }
    }
    document.body.appendChild(menu);
    // 定位
    const rect = menu.getBoundingClientRect();
    const mx = Math.min(x, window.innerWidth - rect.width - 8);
    const my = Math.min(y, window.innerHeight - rect.height - 8);
    menu.style.left = mx + 'px';
    menu.style.top = my + 'px';
    this._contextMenu = menu;

    const close = (e) => {
      if (!menu.contains(e.target)) {
        this._hideContextMenu();
        document.removeEventListener('mousedown', close, true);
        document.removeEventListener('pointerdown', close, true);
      }
    };
    setTimeout(() => {
      document.addEventListener('mousedown', close, true);
      document.addEventListener('pointerdown', close, true);
    }, 0);
  },

  _hideContextMenu() {
    if (this._contextMenu) {
      this._contextMenu.remove();
      this._contextMenu = null;
    }
  },

  // ════════════════════════════════════════════════════════════
  //  对话框
  // ════════════════════════════════════════════════════════════

  _promptInput(title, label, defaultValue) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'fm-dialog-overlay';
      overlay.innerHTML = `
        <div class="fm-dialog">
          <div class="fm-dialog-title">${title}</div>
          <div class="fm-dialog-body">
            <label class="fm-dialog-label">${label}</label>
            <input class="fm-dialog-input" type="text" value="${this._escapeHtml(defaultValue || '')}">
          </div>
          <div class="fm-dialog-btns">
            <button class="fm-dialog-btn cancel">取消</button>
            <button class="fm-dialog-btn confirm">确定</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      const input = overlay.querySelector('.fm-dialog-input');
      input.focus();
      input.select();

      const close = (value) => { overlay.remove(); resolve(value); };

      overlay.querySelector('.cancel').addEventListener('click', () => close(null));
      overlay.querySelector('.confirm').addEventListener('click', () => close(input.value || null));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') close(input.value || null);
        if (e.key === 'Escape') close(null);
      });
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });
    });
  },

  _showConfirm(message, subtext) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'fm-dialog-overlay';
      overlay.innerHTML = `
        <div class="fm-dialog">
          <div class="fm-dialog-title">⚠ 确认操作</div>
          <div class="fm-dialog-body">
            <p>${message}</p>
            ${subtext ? `<p class="fm-dialog-sub">${subtext}</p>` : ''}
          </div>
          <div class="fm-dialog-btns">
            <button class="fm-dialog-btn cancel">取消</button>
            <button class="fm-dialog-btn confirm danger">确定</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      const close = (value) => { overlay.remove(); resolve(value); };

      overlay.querySelector('.cancel').addEventListener('click', () => close(false));
      overlay.querySelector('.confirm').addEventListener('click', () => close(true));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
      overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(false); });
    });
  },

  _showToast(msg, type = 'info') {
    const toast = document.createElement('div');
    toast.className = 'fm-toast' + (type === 'error' ? ' error' : '');
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  },

  _escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
};
