// ============================================================
// sandbox-terminal.js — 内置终端 UI 组件
// 封装 xterm.js，支持多标签页、npm 脚本运行、尺寸自适应
// ============================================================
import { Terminal } from '../../../../lib/xterm/xterm.mjs';
import { FitAddon } from '../../../../lib/xterm/addon-fit.mjs';
import { WebLinksAddon } from '../../../../lib/xterm/addon-web-links.mjs';

// 深色终端主题（与 IDE 深色风格一致）
const TERMINAL_THEME_DARK = {
  background: '#0a151d',
  foreground: '#c8e6ff',
  cursor: '#00e5ff',
  selectionBackground: 'rgba(0,255,255,0.2)',
  black: '#1a2a3a',
  red: '#ff6b6b',
  green: '#6bff9b',
  yellow: '#ffd93d',
  blue: '#6aaaff',
  magenta: '#ff6b9d',
  cyan: '#00e5ff',
  white: '#cceeff',
  brightBlack: '#3a4a5a',
  brightRed: '#ff9999',
  brightGreen: '#9bffbb',
  brightYellow: '#ffe97a',
  brightBlue: '#9acfff',
  brightMagenta: '#ffa0c0',
  brightCyan: '#5af0ff',
  brightWhite: '#ffffff'
};

/**
 * 内置终端组件
 * @param {HTMLElement} panelEl - #sandboxTerminalPanel 容器
 * @param {Function} getCwd - 异步返回当前 sandbox 磁盘工作目录
 * @param {Function} onStatusChange - 终端状态变更回调 (statusText)
 */
export class SandboxTerminal {
  constructor(panelEl, getCwd, onStatusChange) {
    this._panel = panelEl;
    this._getCwd = getCwd;
    this._onStatus = onStatusChange || function () {};
    this._terminals = new Map();  // Map<sessionId, { xterm, fitAddon, container, tabEl }>
    this._activeId = null;
    this._tabIdCounter = 0;
    this._resizeObserver = null;
    this._init();
  }

  _init() {
    this._tabBar = this._panel.querySelector('.terminal-tab-bar');
    this._tabContent = this._panel.querySelector('.terminal-tab-content');
    this._newBtn = this._panel.querySelector('.terminal-new-btn');
    this._killBtn = this._panel.querySelector('.terminal-kill-btn');
    this._npmBtn = this._panel.querySelector('.terminal-npm-btn');
    this._npmMenu = this._panel.querySelector('.terminal-npm-menu');

    if (this._newBtn) this._newBtn.addEventListener('click', () => this.newTerminal());
    if (this._killBtn) this._killBtn.addEventListener('click', () => this.killActive());
    if (this._npmBtn) this._npmBtn.addEventListener('click', (e) => { e.stopPropagation(); this._toggleNpmMenu(); });

    // 点击面板外关闭 npm 菜单
    document.addEventListener('click', () => this._toggleNpmMenu(false));

    // 全局 IPC 监听（只绑一次，多实例共享）
    if (!window.__terminalIpcBound) {
      window.__terminalIpcBound = true;
      window.api.onTerminalData((payload) => this._onData(payload));
      window.api.onTerminalExit((payload) => this._onExit(payload));
    }

    // 尺寸自适应
    this._resizeObserver = new ResizeObserver(() => this._fitActive());
    this._resizeObserver.observe(this._tabContent);
  }

  /**
   * 创建新终端
   */
  async newTerminal() {
    const cwd = await this._getCwd();
    if (!cwd) {
      this._onStatus('无法获取工作目录');
      return;
    }
    const cols = 80, rows = 24;
    const result = await window.api.terminalSpawn({ cwd, cols, rows });
    if (!result.success) {
      this._onStatus('终端创建失败: ' + (result.error || '未知错误'));
      return;
    }
    const id = result.sessionId;

    // 创建 xterm 实例
    const container = document.createElement('div');
    container.className = 'terminal-instance';
    container.dataset.id = id;
    this._tabContent.appendChild(container);

    const fitAddon = new FitAddon();
    const xterm = new Terminal({
      cols, rows,
      fontFamily: 'Consolas, Monaco, "Courier New", monospace',
      fontSize: 13,
      theme: TERMINAL_THEME_DARK,
      cursorBlink: true,
      scrollback: 5000,
      allowProposedApi: true
    });
    xterm.loadAddon(fitAddon);
    xterm.loadAddon(new WebLinksAddon());
    xterm.open(container);
    try { fitAddon.fit(); } catch (_) {}

    // 拦截 Ctrl+` 在 xterm 内的行为，派发切换事件
    xterm.attachCustomKeyEventHandler((ev) => {
      // 防御性检查：某些事件（如滚轮）可能传递 undefined 或不完整对象
      if (!ev || !ev.type) return true;
      if (ev.ctrlKey && ev.code === 'Backquote' && ev.type === 'keydown') {
        document.dispatchEvent(new CustomEvent('sandbox-toggle-console'));
        return false;
      }
      return true;
    });

    // 输入流：xterm → pty
    xterm.onData((data) => {
      window.api.terminalInput(id, data);
    });

    // 尺寸变化 → pty resize
    xterm.onResize(({ cols, rows }) => {
      window.api.terminalResize(id, cols, rows);
    });

    // 创建标签页
    const label = 'Terminal ' + (this._terminals.size + 1);
    const tabEl = this._createTabElement(id, label);
    this._tabBar.insertBefore(tabEl, this._newBtn);

    this._terminals.set(id, { xterm, fitAddon, container, tabEl, label });

    // 切换到新终端
    this._switchTo(id);
    this._onStatus('终端已创建 (' + result.shell + ')');

    // 初始 fit（等 DOM 渲染完）
    setTimeout(() => { try { fitAddon.fit(); } catch (_) {} }, 50);

    // 自动检测 npm 脚本
    this._refreshNpmScripts(cwd);

    return id;
  }

  /**
   * 创建标签页元素
   */
  _createTabElement(sessionId, label) {
    const el = document.createElement('div');
    el.className = 'terminal-tab';
    el.dataset.id = sessionId;
    el.innerHTML = '<span class="terminal-tab-label">' + label + '</span><span class="terminal-tab-close">✕</span>';
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('terminal-tab-close')) {
        e.stopPropagation();
        this._kill(sessionId);
      } else {
        this._switchTo(sessionId);
      }
    });
    return el;
  }

  /**
   * 切换到指定终端
   */
  _switchTo(id) {
    this._terminals.forEach((t, tid) => {
      t.container.classList.toggle('active', tid === id);
      t.tabEl.classList.toggle('active', tid === id);
    });
    this._activeId = id;
    const t = this._terminals.get(id);
    if (t) {
      t.xterm.focus();
      try { t.fitAddon.fit(); } catch (_) {}
    }
  }

  /**
   * 接收 pty 数据
   */
  _onData({ id, data }) {
    const t = this._terminals.get(id);
    if (t) t.xterm.write(data);
  }

  /**
   * 终端退出处理
   */
  _onExit({ id, exitCode }) {
    const t = this._terminals.get(id);
    if (!t) return;
    t.xterm.write('\r\n\x1b[33m[进程已退出，代码 ' + exitCode + ']\x1b[0m\r\n');
    // 延迟移除，让用户看到退出信息
    setTimeout(() => this._removeTerminal(id), 2000);
  }

  /**
   * 销毁指定终端
   */
  _kill(id) {
    window.api.terminalKill(id);
    this._removeTerminal(id);
  }

  /**
   * 移除终端实例（UI 清理）
   */
  _removeTerminal(id) {
    const t = this._terminals.get(id);
    if (!t) return;
    try { t.xterm.dispose(); } catch (_) {}
    t.container.remove();
    t.tabEl.remove();
    this._terminals.delete(id);
    if (this._activeId === id) {
      const next = this._terminals.keys().next();
      if (!next.done) {
        this._switchTo(next.value);
      } else {
        this._activeId = null;
      }
    }
  }

  /**
   * 关闭当前活跃终端
   */
  killActive() {
    if (this._activeId) this._kill(this._activeId);
  }

  /**
   * 适配当前终端尺寸
   */
  _fitActive() {
    const t = this._terminals.get(this._activeId);
    if (t) {
      try { t.fitAddon.fit(); } catch (_) {}
    }
  }

  /**
   * 显示终端面板
   */
  show() {
    this._panel.style.display = 'flex';
    setTimeout(() => this._fitActive(), 50);
  }

  /**
   * 隐藏终端面板
   */
  hide() {
    this._panel.style.display = 'none';
  }

  isVisible() {
    return this._panel.style.display !== 'none';
  }

  toggle() {
    if (this.isVisible()) this.hide();
    else this.show();
  }

  /**
   * 刷新 npm 脚本列表
   */
  async _refreshNpmScripts(cwd) {
    const result = await window.api.terminalListNpmScripts(cwd);
    if (!result.success || !result.scripts) {
      if (this._npmBtn) this._npmBtn.style.display = 'none';
      if (this._npmMenu) this._npmMenu.innerHTML = '';
      return;
    }
    if (this._npmBtn) this._npmBtn.style.display = 'inline-block';
    const entries = Object.entries(result.scripts);
    if (entries.length === 0) {
      if (this._npmMenu) this._npmMenu.innerHTML = '<div class="npm-menu-empty">无 npm 脚本</div>';
      return;
    }
    const header = result.name ? '<div class="npm-menu-header">' + result.name + '</div>' : '';
    if (this._npmMenu) {
      this._npmMenu.innerHTML = header + entries.map(([name, cmd]) =>
        '<div class="npm-script-item" data-name="' + name + '" title="' + cmd.replace(/"/g, '&quot;') + '">' +
        '<span class="npm-script-name">' + name + '</span>' +
        '<span class="npm-script-cmd">' + cmd + '</span>' +
        '</div>'
      ).join('');
      this._npmMenu.querySelectorAll('.npm-script-item').forEach(el => {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          this._runNpmScript(el.dataset.name);
          this._toggleNpmMenu(false);
        });
      });
    }
  }

  /**
   * 切换 npm 菜单显隐
   */
  _toggleNpmMenu(force) {
    if (!this._npmMenu) return;
    const show = typeof force === 'boolean' ? force : this._npmMenu.style.display === 'none';
    this._npmMenu.style.display = show ? 'block' : 'none';
  }

  /**
   * 运行 npm 脚本
   */
  async _runNpmScript(name) {
    if (!this._activeId) {
      await this.newTerminal();
    }
    const t = this._terminals.get(this._activeId);
    if (t) {
      t.xterm.focus();
      // 写入 npm run 命令并回车
      window.api.terminalInput(this._activeId, 'npm run ' + name + '\r');
      // 更新标签标题
      t.label = 'npm ' + name;
      const labelEl = t.tabEl.querySelector('.terminal-tab-label');
      if (labelEl) labelEl.textContent = t.label;
    }
  }

  /**
   * 销毁所有终端（IDE 关闭时调用）
   */
  destroy() {
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    for (const id of Array.from(this._terminals.keys())) {
      window.api.terminalKill(id);
      this._removeTerminal(id);
    }
    this._terminals.clear();
    this._activeId = null;
  }
}
