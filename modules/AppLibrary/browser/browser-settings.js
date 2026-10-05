// ============================================================
//  browser/browser-settings.js — 设置菜单动作 + Cookies 面板
//  职责：分发设置下拉菜单各项动作（历史/隐私/阅读/暗色/
//  下载目录/Cookies/密码/DevTools），切换阅读与暗色模式，
//  修改并显示下载目录，渲染 Cookies 管理面板（分组展示、
//  单条删除、一键清空、点击外部关闭）
//  实现说明：以原型混入（Object.assign(BrowserApp.prototype, ...)）
//  挂载到 BrowserApp——方法体通过 this 访问实例状态
//  （this._tabs / this._reader / this._content 等），
//  与写在 class 体内完全等价；DOM 结构与菜单事件绑定
//  仍由 index.js 的 constructor 统一编排
// ============================================================

export const settingsMethods = {
  /** 处理设置菜单动作 */
  _handleSettingsAction(action, itemEl) {
    switch (action) {
      case 'history':
        // 触发历史按钮点击
        this._history._btn.click();
        break;
      case 'private':
        this._togglePrivateMode();
        break;
      case 'reader':
        this._toggleReader(itemEl);
        break;
      case 'dark':
        this._toggleDark(itemEl);
        break;
      case 'download':
        this._changeDownloadDir(itemEl);
        break;
      case 'cookies':
        this._showCookiesPanel();
        break;
      case 'password':
        this._passwords._btn.click();
        break;
      case 'devtools':
        this._toggleDevTools();
        break;
    }
  },

  /** 切换阅读模式 */
  async _toggleReader(itemEl) {
    const tabId = this._tabs.activeTabId;
    if (!tabId) return;
    const on = await this._reader.toggleReader(tabId);
    const toggle = itemEl.querySelector('.app-browser-settings-toggle');
    if (toggle) toggle.textContent = on ? '开' : '关';
  },

  /** 切换暗色模式 */
  async _toggleDark(itemEl) {
    const tabId = this._tabs.activeTabId;
    if (!tabId) return;
    const on = await this._reader.toggleDark(tabId);
    const toggle = itemEl.querySelector('.app-browser-settings-toggle');
    if (toggle) toggle.textContent = on ? '开' : '关';
  },

  /** 修改下载目录 */
  async _changeDownloadDir(itemEl) {
    if (window.api && window.api.selectFolder) {
      const result = await window.api.selectFolder();
      if (result && !result.canceled && result.path) {
        const newPath = result.path;
        if (window.api.browserSetDownloadDir) {
          await window.api.browserSetDownloadDir(newPath);
        }
        const label = itemEl.querySelector('.app-browser-settings-download-path');
        if (label) {
          const parts = newPath.replace(/\\/g, '/').split('/');
          label.textContent = parts.slice(-2).join('/');
          label.title = newPath;
        }
      }
    }
  },

  /** 初始化下载路径显示 */
  async _initDownloadPathDisplay(settingsDropdown) {
    try {
      if (window.api && window.api.browserGetDownloadDir) {
        const dir = await window.api.browserGetDownloadDir();
        if (dir) {
          const label = settingsDropdown.querySelector('.app-browser-settings-download-path');
          if (label) {
            const parts = dir.replace(/\\/g, '/').split('/');
            label.textContent = parts.slice(-2).join('/');
            label.title = dir;
          }
        }
      }
    } catch (_) {}
  },

  /** 显示 Cookies 管理面板 */
  async _showCookiesPanel() {
    const cookiesPanel = this._content.querySelector('.app-browser-cookies-panel');
    if (!cookiesPanel) return;
    if (cookiesPanel.style.display !== 'none') {
      cookiesPanel.style.display = 'none';
      return;
    }
    const partition = this._tabs.privateMode ? 'private-browsersession' : 'persist:browsersession';
    let cookies = [];
    if (window.api && window.api.browserGetCookies) {
      const result = await window.api.browserGetCookies(partition);
      if (Array.isArray(result)) cookies = result;
    }
    // 按域名分组
    const groups = {};
    for (const c of cookies) {
      const domain = c.domain || '(unknown)';
      if (!groups[domain]) groups[domain] = [];
      groups[domain].push(c);
    }
    let html = `
      <div class="app-browser-cookies-header">
        <span>Cookies 管理 (${cookies.length})</span>
        <button class="app-browser-cookies-clear-btn" title="清空所有 Cookies">清空</button>
      </div>
      <div class="app-browser-cookies-list">
    `;
    if (cookies.length === 0) {
      html += '<div class="app-browser-cookies-empty">暂无 Cookies</div>';
    } else {
      for (const [domain, items] of Object.entries(groups)) {
        html += `<div class="app-browser-cookies-group">
          <div class="app-browser-cookies-domain">${domain.replace(/</g, '&lt;')} <span class="app-browser-cookies-count">${items.length}</span></div>`;
        for (const c of items) {
          const valDisplay = (c.value || '').length > 30 ? (c.value).substring(0, 30) + '…' : (c.value || '');
          const url = `http${c.secure ? 's' : ''}://${(c.domain || '').replace(/^\./, '')}${c.path || '/'}`;
          html += `<div class="app-browser-cookie-item" data-url="${url.replace(/"/g, '&quot;')}" data-name="${(c.name || '').replace(/"/g, '&quot;')}">
            <span class="app-browser-cookie-name">${(c.name || '').replace(/</g, '&lt;')}</span>
            <span class="app-browser-cookie-value">${valDisplay.replace(/</g, '&lt;')}</span>
            <button class="app-browser-cookie-delete" title="删除">✕</button>
          </div>`;
        }
        html += '</div>';
      }
    }
    html += '</div>';
    cookiesPanel.innerHTML = html;
    cookiesPanel.style.display = 'block';

    // 绑定删除事件
    cookiesPanel.querySelectorAll('.app-browser-cookie-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const item = btn.closest('.app-browser-cookie-item');
        const url = item?.dataset.url;
        const name = item?.dataset.name;
        if (url && name && window.api && window.api.browserDeleteCookie) {
          await window.api.browserDeleteCookie(partition, url, name);
          this._showCookiesPanel(); // 刷新
        }
      });
    });
    // 清空事件
    const clearBtn = cookiesPanel.querySelector('.app-browser-cookies-clear-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', async () => {
        if (window.api && window.api.browserClearCookies) {
          await window.api.browserClearCookies(partition);
          this._showCookiesPanel();
        }
      });
    }
    // 点击外部关闭
    const closeHandler = (e) => {
      if (!cookiesPanel.contains(e.target)) {
        cookiesPanel.style.display = 'none';
        document.removeEventListener('mousedown', closeHandler);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', closeHandler), 0);
  }
};
