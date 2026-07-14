// ============================================================
//  browser/browser-passwords.js — 简易密码管理器
//  保存登录表单用户名+密码，自动填充，localStorage 存储
//  注意：本地存储不加密，仅适用于低敏感场景
// ============================================================

const PASSWORDS_KEY = 'astroknot-browser-passwords';

export class BrowserPasswords {
  /**
   * @param {Object} opts
   * @param {HTMLButtonElement} opts.passwordBtn - 密码管理按钮
   * @param {HTMLElement}       opts.passwordPanel - 密码面板容器
   * @param {Function} opts.getActiveTab - 获取当前活跃标签 { webview, url, ready }
   */
  constructor({ passwordBtn, passwordPanel, getActiveTab }) {
    this._btn = passwordBtn;
    this._panel = passwordPanel;
    this._getTab = getActiveTab;

    this._bindEvents();
  }

  // ── 数据层 ──

  load() {
    try { return JSON.parse(localStorage.getItem(PASSWORDS_KEY) || '[]'); }
    catch (_) { return []; }
  }

  save(list) {
    localStorage.setItem(PASSWORDS_KEY, JSON.stringify(list));
  }

  /**
   * 保存或更新一条密码记录
   * @param {Object} entry { domain, username, password }
   */
  upsert(entry) {
    const list = this.load();
    const idx = list.findIndex(p => p.domain === entry.domain && p.username === entry.username);
    if (idx >= 0) list[idx] = { ...list[idx], ...entry, updatedAt: Date.now() };
    else list.push({ ...entry, createdAt: Date.now() });
    this.save(list);
  }

  /** 查找匹配当前域名的所有记录 */
  findByDomain(domain) {
    if (!domain) return [];
    try {
      const host = new URL(domain).hostname;
      return this.load().filter(p => host === p.domain || host.endsWith('.' + p.domain));
    } catch (_) { return []; }
  }

  /** 删除一条记录 */
  delete(domain, username) {
    const list = this.load().filter(p => !(p.domain === domain && p.username === username));
    this.save(list);
  }

  // ── 自动填充 ──

  /** 在当前 webview 注入脚本，自动填充匹配的密码 */
  async autoFill() {
    const tab = this._getTab();
    if (!tab || !tab.ready || !tab.url) return;
    const entries = this.findByDomain(tab.url);
    if (entries.length === 0) {
      this._showToast('当前网站未保存密码');
      return;
    }
    // 取最新一条
    const entry = entries.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
    try {
      await tab.webview.executeJavaScript(`
        (function() {
          var u = ${JSON.stringify(entry.username)};
          var p = ${JSON.stringify(entry.password)};
          // 查找用户名输入框
          var userInputs = document.querySelectorAll('input[type="text"], input[type="email"], input[name*="user"], input[name*="email"], input[name*="account"], input[name*="login"], input[id*="user"], input[id*="email"]');
          var passInputs = document.querySelectorAll('input[type="password"]');
          var filled = false;
          if (userInputs.length > 0) { userInputs[0].value = u; userInputs[0].dispatchEvent(new Event('input', {bubbles:true})); filled = true; }
          if (passInputs.length > 0) { passInputs[0].value = p; passInputs[0].dispatchEvent(new Event('input', {bubbles:true})); filled = true; }
          return filled;
        })();
      `);
      this._showToast(`已填充：${entry.username}`);
    } catch (_) {
      this._showToast('填充失败');
    }
  }

  /**
   * 从当前页面表单捕获用户名+密码（需用户在页面上已输入）
   * 监听表单提交事件自动保存（由 webview 注入脚本触发）
   */
  async captureFromPage() {
    const tab = this._getTab();
    if (!tab || !tab.ready || !tab.url) return;
    try {
      const result = await tab.webview.executeJavaScript(`
        (function() {
          var passInputs = document.querySelectorAll('input[type="password"]');
          if (passInputs.length === 0) return null;
          var pass = passInputs[0].value;
          if (!pass) return null;
          var userInputs = document.querySelectorAll('input[type="text"], input[type="email"], input[name*="user"], input[name*="email"], input[name*="account"], input[name*="login"], input[id*="user"], input[id*="email"]');
          var user = userInputs.length > 0 ? userInputs[0].value : '';
          return { username: user, password: pass };
        })();
      `);
      if (!result || !result.password) {
        this._showToast('未检测到密码输入');
        return;
      }
      let domain;
      try { domain = new URL(tab.url).hostname; } catch (_) { return; }
      this.upsert({ domain, username: result.username, password: result.password });
      this._showToast(`已保存：${domain} / ${result.username}`);
    } catch (_) {
      this._showToast('捕获失败');
    }
  }

  // ── 面板渲染 ──

  renderPanel() {
    const list = this.load();
    let html = `
      <div class="app-browser-passwords-header">
        <span>密码管理</span>
        <button class="app-browser-password-save-btn" title="保存当前页面密码">💾 保存当前</button>
      </div>
    `;
    if (list.length === 0) {
      html += '<div class="app-browser-passwords-empty">暂无保存的密码</div>';
    } else {
      html += '<div class="app-browser-passwords-list">';
      for (const item of list) {
        const maskedPass = '•'.repeat(Math.min(item.password.length, 12));
        html += `<div class="app-browser-password-item" data-domain="${item.domain.replace(/"/g, '&quot;')}" data-username="${(item.username || '').replace(/"/g, '&quot;')}">
          <div class="app-browser-password-item-info">
            <div class="app-browser-password-item-domain">${item.domain.replace(/</g, '&lt;')}</div>
            <div class="app-browser-password-item-user">${(item.username || '(无用户名)').replace(/</g, '&lt;')} · ${maskedPass}</div>
          </div>
          <button class="app-browser-password-item-fill" title="自动填充">↧</button>
          <button class="app-browser-password-item-delete" title="删除">✕</button>
        </div>`;
      }
      html += '</div>';
    }
    this._panel.innerHTML = html;
    this._bindPanelEvents();
  }

  _bindEvents() {
    this._btn.addEventListener('click', () => {
      if (this._panel.style.display === 'none') {
        this.renderPanel();
        this._panel.style.display = 'block';
      } else {
        this._panel.style.display = 'none';
      }
    });

    document.addEventListener('mousedown', (e) => {
      if (this._panel.style.display !== 'none'
          && !this._panel.contains(e.target)
          && e.target !== this._btn
          && !this._btn.contains(e.target)) {
        this._panel.style.display = 'none';
      }
    });
  }

  _bindPanelEvents() {
    // 保存当前页面密码
    const saveBtn = this._panel.querySelector('.app-browser-password-save-btn');
    if (saveBtn) saveBtn.addEventListener('click', () => this.captureFromPage());

    // 自动填充
    this._panel.querySelectorAll('.app-browser-password-item-fill').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = btn.closest('.app-browser-password-item');
        const domain = item?.dataset.domain;
        const username = item?.dataset.username;
        if (domain && username) {
          this._fillFromRecord(domain, username);
        }
      });
    });

    // 删除
    this._panel.querySelectorAll('.app-browser-password-item-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = btn.closest('.app-browser-password-item');
        const domain = item?.dataset.domain;
        const username = item?.dataset.username;
        if (domain) {
          this.delete(domain, username);
          this.renderPanel();
        }
      });
    });
  }

  /** 从指定记录填充 */
  async _fillFromRecord(domain, username) {
    const record = this.load().find(p => p.domain === domain && p.username === username);
    if (!record) return;
    const tab = this._getTab();
    if (!tab || !tab.ready) return;
    try {
      await tab.webview.executeJavaScript(`
        (function() {
          var u = ${JSON.stringify(record.username)};
          var p = ${JSON.stringify(record.password)};
          var userInputs = document.querySelectorAll('input[type="text"], input[type="email"], input[name*="user"], input[name*="email"], input[name*="account"], input[name*="login"], input[id*="user"], input[id*="email"]');
          var passInputs = document.querySelectorAll('input[type="password"]');
          if (userInputs.length > 0) { userInputs[0].value = u; userInputs[0].dispatchEvent(new Event('input', {bubbles:true})); }
          if (passInputs.length > 0) { passInputs[0].value = p; passInputs[0].dispatchEvent(new Event('input', {bubbles:true})); }
        })();
      `);
      this._showToast(`已填充：${username}`);
      this._panel.style.display = 'none';
    } catch (_) {
      this._showToast('填充失败');
    }
  }

  _showToast(msg) {
    let toast = this._panel.querySelector('.app-browser-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'app-browser-toast';
      this._panel.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.display = 'block';
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { toast.style.display = 'none'; }, 2000);
  }
}
