// ============================================================
//  AppLibrary/app-dialogs.js — 属性与确认弹窗（原型混入）
//  职责：应用属性弹窗（名称 / 仓库 / 分支 / 文件数 / 导入与
//  更新时间 / 描述）的显示与关闭，自定义确认对话框（Promise
//  封装，替代原生 confirm，支持警告副文本与 ESC / 点击遮罩取消）
//  实现说明：以原型混入（Object.assign(AppPanel.prototype, ...)）
//  挂载到 AppPanel——方法体通过 this 访问实例状态并调用
//  AppPanel.js 的其他方法（如 _deleteApp await 确认结果），
//  与写在 class 体内完全等价
// ============================================================

export const dialogMethods = {
  /**
   * 显示属性（内部弹窗）
   * @private
   */
  _showProperties(app) {
    this._closePropertiesDialog();

    const isBuiltin = app.builtin === true;
    const overlay = document.createElement('div');
    overlay.className = 'app-props-overlay';
    overlay.innerHTML = `
      <div class="app-props-dialog">
        <div class="app-props-header">
          <span class="app-props-title">ℹ 应用属性</span>
          <button class="caption-btn app-props-close">✕</button>
        </div>
        <div class="app-props-body">
          <div class="app-props-row">
            <span class="app-props-label">名称</span>
            <span class="app-props-value">${app.name} ${isBuiltin ? '<span style="color:#5ee8ff;font-size:11px;margin-left:6px;">[内置]</span>' : ''}</span>
          </div>
          ${isBuiltin ? `
          <div class="app-props-row">
            <span class="app-props-label">类型</span>
            <span class="app-props-value">${app.type === 'browser' ? '浏览器' : '内置应用'}</span>
          </div>
          ` : `
          <div class="app-props-row">
            <span class="app-props-label">仓库</span>
            <span class="app-props-value">${app.repo || '未知'}</span>
          </div>
          <div class="app-props-row">
            <span class="app-props-label">分支</span>
            <span class="app-props-value">${app.ref || '未知'}</span>
          </div>
          `}
          <div class="app-props-row">
            <span class="app-props-label">文件数</span>
            <span class="app-props-value">${app.fileCount || '未知'}</span>
          </div>
          <div class="app-props-row">
            <span class="app-props-label">导入时间</span>
            <span class="app-props-value">${new Date(app.importedAt).toLocaleString()}</span>
          </div>
          <div class="app-props-row">
            <span class="app-props-label">更新时间</span>
            <span class="app-props-value">${new Date(app.lastUpdated).toLocaleString()}</span>
          </div>
          <div class="app-props-row app-props-desc">
            <span class="app-props-label">描述</span>
            <span class="app-props-value">${app.description || '无'}</span>
          </div>
        </div>
        <div class="app-props-footer">
          <button class="app-props-btn-ok">关闭</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => this._closePropertiesDialog();
    overlay.querySelector('.app-props-close').addEventListener('click', close);
    overlay.querySelector('.app-props-btn-ok').addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
  },

  /**
   * 关闭属性弹窗
   * @private
   */
  _closePropertiesDialog() {
    const existing = document.querySelector('.app-props-overlay');
    if (existing) existing.remove();
  },

  // ════════════════════════════════════════════════════════════
  //  确认对话框
  // ════════════════════════════════════════════════════════════

  /**
   * 显示自定义确认对话框（替代原生 confirm）
   * @param {string} title - 对话框标题
   * @param {string} message - 主消息
   * @param {string} [warning] - 警告副文本
   * @returns {Promise<boolean>} 用户是否确认
   * @private
   */
  _showConfirmDialog(title, message, warning = '') {
    return new Promise((resolve) => {
      this._closeConfirmDialog();

      const overlay = document.createElement('div');
      overlay.className = 'app-confirm-overlay';

      const dialog = document.createElement('div');
      dialog.className = 'app-confirm-dialog';

      const header = document.createElement('div');
      header.className = 'app-confirm-header';
      const titleEl = document.createElement('span');
      titleEl.className = 'app-confirm-title';
      titleEl.textContent = title;
      header.appendChild(titleEl);

      const body = document.createElement('div');
      body.className = 'app-confirm-body';
      const msgEl = document.createElement('div');
      msgEl.className = 'app-confirm-message';
      msgEl.textContent = message;
      body.appendChild(msgEl);
      if (warning) {
        const warnEl = document.createElement('div');
        warnEl.className = 'app-confirm-warning';
        warnEl.textContent = warning;
        body.appendChild(warnEl);
      }

      const footer = document.createElement('div');
      footer.className = 'app-confirm-footer';
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'app-confirm-cancel';
      cancelBtn.textContent = '取消';
      const okBtn = document.createElement('button');
      okBtn.className = 'app-confirm-ok';
      okBtn.textContent = '确定';
      footer.appendChild(cancelBtn);
      footer.appendChild(okBtn);

      dialog.appendChild(header);
      dialog.appendChild(body);
      dialog.appendChild(footer);
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      const close = (result) => {
        overlay.remove();
        resolve(result);
      };

      cancelBtn.addEventListener('click', (e) => { e.stopPropagation(); close(false); });
      okBtn.addEventListener('click', (e) => { e.stopPropagation(); close(true); });
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close(false);
      });

      // ESC 关闭
      const onKey = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); close(false); document.removeEventListener('keydown', onKey); }
      };
      document.addEventListener('keydown', onKey);

      // 聚焦确定按钮
      okBtn.focus();
    });
  },

  /** 关闭确认对话框 @private */
  _closeConfirmDialog() {
    const existing = document.querySelector('.app-confirm-overlay');
    if (existing) existing.remove();
  }
};
