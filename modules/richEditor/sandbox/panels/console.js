// ============================================================
//  sandbox-console.js — 控制台面板 + 底部面板管理
//  控制台消息监听、渲染、过滤、计数 + 控制台/终端面板切换
// ============================================================

import { SandboxTerminal } from '../editors/terminal.js';

export class SandboxConsole {
  /**
   * @param {import('../core/context.js').SandboxContext} ctx
   */
  constructor(ctx) {
    this.ctx = ctx;
    this._filter = 'all';
    this._counts = { log: 0, error: 0, warn: 0, info: 0 };
    this._lines = [];
    this._bottomPanelTab = 'console';
    this._messageHandler = null;
  }

  // ── 初始化 ──

  init() {
    // 监听 iframe 的控制台消息
    this._messageHandler = (e) => {
      if (!e.data || e.data.type !== 'sandbox-console') return;
      if (!this.ctx.consoleOut) return;

      const level = e.data.level || 'log';
      const args = e.data.args || [{ type: 'string', value: e.data.message || '' }];

      this.addConsoleLine(level, args);
    };
    window.addEventListener('message', this._messageHandler);

    // 注册 actions
    this.ctx.registerAction('clearConsole', () => this.clearConsole());
    this.ctx.registerAction('toggleConsole', () => this.toggleConsole());
    this.ctx.registerAction('toggleTerminal', () => this.toggleTerminal());
    this.ctx.registerAction('newTerminal', () => this.newTerminal());
    this.ctx.registerAction('killAllTerminals', () => this.killAllTerminals());
    this.ctx.registerAction('showBottomPanel', (tab) => this.showBottomPanel(tab));
    this.ctx.registerAction('toggleBottomPanel', (tab) => this.toggleBottomPanel(tab));
  }

  destroy() {
    if (this._messageHandler) {
      window.removeEventListener('message', this._messageHandler);
      this._messageHandler = null;
    }
    this._lines = [];
    this._counts = { log: 0, error: 0, warn: 0, info: 0 };
    this._filter = 'all';
    this._bottomPanelTab = 'console';
  }

  // ── 控制台消息 ──

  addConsoleLine(level, args) {
    const time = new Date();
    const timeStr = String(time.getHours()).padStart(2, '0') + ':' +
                    String(time.getMinutes()).padStart(2, '0') + ':' +
                    String(time.getSeconds()).padStart(2, '0');

    const line = document.createElement('div');
    line.className = 'console-line level-' + level;
    line.dataset.level = level;

    const icon = level === 'error' ? '✕' : level === 'warn' ? '⚠' : level === 'info' ? 'ℹ' : '›';

    const timeEl = document.createElement('span');
    timeEl.className = 'console-time';
    timeEl.textContent = timeStr;

    const iconEl = document.createElement('span');
    iconEl.className = 'console-icon';
    iconEl.textContent = icon;

    const contentEl = document.createElement('span');
    contentEl.className = 'console-content';
    args.forEach((arg, idx) => {
      if (idx > 0) contentEl.appendChild(document.createTextNode(' '));
      contentEl.appendChild(this._renderArg(arg));
    });

    line.appendChild(timeEl);
    line.appendChild(iconEl);
    line.appendChild(contentEl);

    // 缓存用于过滤
    this._lines.push(line);

    // 计数
    this._counts[level] = (this._counts[level] || 0) + 1;
    this._updateCounts();

    // 根据过滤决定是否显示
    const out = this.ctx.consoleOut;
    if (out && (this._filter === 'all' || this._filter === level)) {
      out.appendChild(line);
      out.scrollTop = out.scrollHeight;
    }
  }

  clearConsole() {
    const out = this.ctx.consoleOut;
    if (out) out.textContent = '';
    this._lines = [];
    this._counts = { log: 0, error: 0, warn: 0, info: 0 };
    this._updateCounts();
  }

  setConsoleFilter(filter) {
    this._filter = filter;
    document.querySelectorAll('.console-filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.filter === filter);
    });
    // 重新渲染
    const out = this.ctx.consoleOut;
    if (!out) return;
    out.innerHTML = '';
    for (const line of this._lines) {
      if (filter === 'all' || line.dataset.level === filter) {
        out.appendChild(line);
      }
    }
    out.scrollTop = out.scrollHeight;
  }

  _updateCounts() {
    document.querySelectorAll('.filter-count').forEach(el => {
      const cnt = el.dataset.count;
      if (cnt === 'all') {
        el.textContent = this._lines.length;
      } else {
        el.textContent = this._counts[cnt] || 0;
      }
    });
    // 错误徽标
    const badge = document.getElementById('consoleErrorBadge');
    if (badge) {
      const errCount = this._counts.error || 0;
      if (errCount > 0) {
        badge.textContent = errCount > 99 ? '99+' : errCount;
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
      }
    }
  }

  // ── 渲染辅助 ──

  _renderArg(arg) {
    if (!arg || typeof arg !== 'object') {
      return document.createTextNode(String(arg));
    }

    const type = arg.type;
    const value = arg.value;

    if (type === 'string') {
      return document.createTextNode(value);
    }
    if (type === 'number') {
      const span = document.createElement('span');
      span.className = 'console-obj-number';
      span.textContent = value;
      return span;
    }
    if (type === 'boolean') {
      const span = document.createElement('span');
      span.className = 'console-obj-bool';
      span.textContent = value;
      return span;
    }
    if (type === 'null') {
      const span = document.createElement('span');
      span.className = 'console-obj-null';
      span.textContent = value;
      return span;
    }
    if (type === 'function') {
      const span = document.createElement('span');
      span.style.color = '#fc8';
      span.textContent = value;
      return span;
    }

    // 对象/数组：可展开
    return this._renderExpandable(arg);
  }

  _renderExpandable(arg) {
    const wrapper = document.createElement('span');
    const toggle = document.createElement('span');
    toggle.className = 'console-obj-toggle';
    toggle.textContent = '▶ ';

    const preview = document.createElement('span');
    const children = document.createElement('div');
    children.className = 'console-obj-children';
    children.style.display = 'none';

    const isArr = arg.type === 'array';
    const val = arg.value;

    if (isArr) {
      preview.textContent = '[' + (val.length) + ']';
      val.forEach((item, idx) => {
        const row = document.createElement('div');
        const key = document.createElement('span');
        key.className = 'console-obj-key';
        key.textContent = idx + ': ';
        row.appendChild(key);
        row.appendChild(this._renderArg(item));
        children.appendChild(row);
      });
    } else {
      const keys = Object.keys(val);
      preview.textContent = '{' + keys.length + ' keys}';
      keys.forEach(k => {
        const row = document.createElement('div');
        const key = document.createElement('span');
        key.className = 'console-obj-key';
        key.textContent = k + ': ';
        row.appendChild(key);
        row.appendChild(this._renderArg(val[k]));
        children.appendChild(row);
      });
    }

    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = children.style.display === 'none';
      children.style.display = isHidden ? 'block' : 'none';
      toggle.textContent = isHidden ? '▼ ' : '▶ ';
    });

    wrapper.appendChild(toggle);
    wrapper.appendChild(preview);
    wrapper.appendChild(children);
    return wrapper;
  }

  // ── 底部面板管理 ──

  showBottomPanel(tab) {
    const consolePanel = document.getElementById('sandboxConsolePanel');
    const termPanel = document.getElementById('sandboxTerminalPanel');
    const tabsBar = document.getElementById('sandboxBottomPanelTabs');
    if (!consolePanel || !termPanel || !tabsBar) return;

    tabsBar.style.display = 'flex';
    this._bottomPanelTab = tab;

    if (tab === 'console') {
      consolePanel.style.display = 'flex';
      termPanel.style.display = 'none';
    } else {
      consolePanel.style.display = 'none';
      termPanel.style.display = 'flex';
      if (this.ctx.terminal) this.ctx.terminal._fitActive();
    }

    // 更新 tab 激活态
    tabsBar.querySelectorAll('.bottom-panel-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tab);
    });

    if (this.ctx.monacoEditor) setTimeout(() => this.ctx.monacoEditor.layout(), 50);
  }

  hideBottomPanel() {
    const consolePanel = document.getElementById('sandboxConsolePanel');
    const termPanel = document.getElementById('sandboxTerminalPanel');
    const tabsBar = document.getElementById('sandboxBottomPanelTabs');
    if (consolePanel) consolePanel.style.display = 'none';
    if (termPanel) termPanel.style.display = 'none';
    if (tabsBar) tabsBar.style.display = 'none';
    if (this.ctx.monacoEditor) setTimeout(() => this.ctx.monacoEditor.layout(), 50);
  }

  toggleBottomPanel(tab) {
    const targetTab = tab || this._bottomPanelTab;
    const consolePanel = document.getElementById('sandboxConsolePanel');
    const termPanel = document.getElementById('sandboxTerminalPanel');
    const isVisible = (targetTab === 'console')
      ? (consolePanel && consolePanel.style.display !== 'none')
      : (termPanel && termPanel.style.display !== 'none');
    if (isVisible) this.hideBottomPanel();
    else this.showBottomPanel(targetTab);
  }

  toggleConsole() {
    this.toggleBottomPanel('console');
  }

  toggleTerminal() {
    this.toggleBottomPanel('terminal');
  }

  newTerminal() {
    if (!this.ctx.terminal) return;
    this.showBottomPanel('terminal');
    this.ctx.terminal.newTerminal();
  }

  killAllTerminals() {
    if (!this.ctx.terminal) return;
    this.ctx.terminal.destroy();
    this.ctx.terminal = new SandboxTerminal(
      document.getElementById('sandboxTerminalPanel'),
      async () => {
        const projectFolderPath = this.ctx.getProjectFolderPath();
        const result = await window.api.terminalGetSandboxCwd(projectFolderPath, this.ctx.currentNodeId);
        return result.success ? result.cwd : null;
      },
      (statusText) => this.ctx.setStatus(statusText)
    );
    this.ctx.setStatus('所有终端已关闭');
  }
}

console.log('[sandbox-console] 模块已加载');
