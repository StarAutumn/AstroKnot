// ============================================================
//  sandbox-commands.js — 命令面板
//  命令列表定义、过滤、选择执行
//  执行时通过 ctx.executeAction() 委托到各功能模块
// ============================================================

export class SandboxCommands {
  /**
   * @param {import('../core/context.js').SandboxContext} ctx
   */
  constructor(ctx) {
    this.ctx = ctx;
    this._commandList = [];
    this._commandSelectedIdx = 0;
    this._mousedownHandler = null;
  }

  init() {
    this._commandList = [
      { icon: '💾', label: '保存', shortcut: 'Ctrl+S', action: 'save' },
      { icon: '📤', label: '导出为 HTML', action: 'export' },
      { icon: '📋', label: '从模板新建', action: 'template' },
      { icon: '📜', label: '本地历史记录', action: 'history' },
      { icon: '🔍', label: '全局搜索', shortcut: 'Ctrl+Shift+F', action: 'search' },
      { icon: '📋', label: '切换控制台', shortcut: 'Ctrl+`', action: 'toggleConsole' },
      { icon: '🖥️', label: '新建终端', shortcut: 'Ctrl+Shift+`', action: 'newTerminal' },
      { icon: '⬛', label: '切换终端', shortcut: 'Ctrl+`', action: 'toggleTerminal' },
      { icon: '☠️', label: '关闭所有终端', action: 'killAllTerminals' },
      { icon: '🗺️', label: '切换缩略图', action: 'toggleMinimap' },
      { icon: '⚡', label: '切换自动运行', action: 'toggleAutoRun' },
      { icon: '◫', label: '分屏编辑', action: 'toggleSplit' },
      { icon: '⚙️', label: '设置', action: 'settings' },
      { icon: '↩️', label: '撤销', shortcut: 'Ctrl+Z', action: 'undo' },
      { icon: '↪️', label: '重做', shortcut: 'Ctrl+Y', action: 'redo' },
      { icon: '🔧', label: '格式化文档', shortcut: 'Shift+Alt+F', action: 'format' },
      { icon: '📄', label: '转到文件', shortcut: 'Ctrl+P', action: 'quickOpen' },
      { icon: '🔖', label: '切换书签', shortcut: 'Ctrl+F2', action: 'toggleBookmark' },
      { icon: '🔖', label: '下一个书签', shortcut: 'F2', action: 'nextBookmark' },
      { icon: '🔖', label: '上一个书签', shortcut: 'Shift+F2', action: 'prevBookmark' },
      { icon: '🔖', label: '清除所有书签', action: 'clearBookmarks' },
      { icon: '▶️', label: '运行预览', shortcut: 'Ctrl+Enter', action: 'runPreview' },
      { icon: '⛶', label: '全屏预览', action: 'fullscreenPreview' },
      { icon: '👁️', label: '显示预览', action: 'showPreview' },
      { icon: '🔍', label: '放大字体', shortcut: 'Ctrl+=', action: 'zoomIn' },
      { icon: '🔍', label: '缩小字体', shortcut: 'Ctrl+-', action: 'zoomOut' },
      { icon: '🔍', label: '重置字体大小', shortcut: 'Ctrl+0', action: 'zoomReset' },
    ];

    this._initEvents();

    this.ctx.registerAction('commandPalette', () => this.show());
    this.ctx.registerAction('quickOpen', () => {
      // 快速打开复用命令面板
      this.show();
    });
  }

  destroy() {
    if (this._mousedownHandler) {
      document.removeEventListener('mousedown', this._mousedownHandler);
      this._mousedownHandler = null;
    }
  }

  _initEvents() {
    const input = document.getElementById('sandboxCommandInput');
    if (!input) return;

    input.addEventListener('input', () => this._filterCommands(input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this._commandSelectedIdx = Math.min(this._commandSelectedIdx + 1, this._commandList.length - 1);
        this._renderCommandList();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this._commandSelectedIdx = Math.max(this._commandSelectedIdx - 1, 0);
        this._renderCommandList();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this._executeSelectedCommand();
      } else if (e.key === 'Escape') {
        this.hide();
      }
    });

    // 点击外部关闭
    this._mousedownHandler = (e) => {
      const palette = document.getElementById('sandboxCommandPalette');
      if (palette && palette.classList.contains('active') && !palette.contains(e.target)) {
        this.hide();
      }
    };
    document.addEventListener('mousedown', this._mousedownHandler);
  }

  show() {
    const palette = document.getElementById('sandboxCommandPalette');
    const input = document.getElementById('sandboxCommandInput');
    if (!palette || !input) return;
    palette.classList.add('active');
    input.value = '';
    this._commandSelectedIdx = 0;
    this._filterCommands('');
    setTimeout(() => input.focus(), 50);
  }

  hide() {
    const palette = document.getElementById('sandboxCommandPalette');
    if (palette) palette.classList.remove('active');
  }

  _filterCommands(query) {
    const list = document.getElementById('sandboxCommandList');
    if (!list) return;
    list.innerHTML = '';

    const q = (query || '').toLowerCase().trim();
    const filtered = q
      ? this._commandList.filter(c => c.label.toLowerCase().includes(q))
      : this._commandList;

    if (filtered.length === 0) {
      list.innerHTML = '<div class="sandbox-command-empty">未找到匹配的命令</div>';
      return;
    }

    if (this._commandSelectedIdx >= filtered.length) this._commandSelectedIdx = 0;

    filtered.forEach((cmd, i) => {
      const item = document.createElement('div');
      item.className = 'sandbox-command-item' + (i === this._commandSelectedIdx ? ' selected' : '');
      item.innerHTML = `<span class="cmd-icon">${cmd.icon}</span><span class="cmd-label">${cmd.label}</span>${cmd.shortcut ? '<span class="cmd-shortcut">' + cmd.shortcut + '</span>' : ''}`;
      item.addEventListener('click', () => {
        this._commandSelectedIdx = i;
        this._executeSelectedCommand();
      });
      item.addEventListener('mouseenter', () => {
        this._commandSelectedIdx = i;
        document.querySelectorAll('.sandbox-command-item').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
      });
      list.appendChild(item);
    });

    const selected = list.querySelector('.selected');
    if (selected) selected.scrollIntoView({ block: 'nearest' });
  }

  _renderCommandList() {
    const input = document.getElementById('sandboxCommandInput');
    this._filterCommands(input ? input.value : '');
  }

  _executeSelectedCommand() {
    const input = document.getElementById('sandboxCommandInput');
    const q = (input ? input.value : '').toLowerCase().trim();
    const filtered = q
      ? this._commandList.filter(c => c.label.toLowerCase().includes(q))
      : this._commandList;
    const cmd = filtered[this._commandSelectedIdx];
    if (!cmd) return;
    this.hide();
    this._executeCommandAction(cmd.action);
  }

  /**
   * 执行命令 — 优先使用 ctx.executeAction，回退到事件通知
   */
  _executeCommandAction(action) {
    // 先尝试 ctx action 注册表
    const result = this.ctx.executeAction(action);
    if (result !== undefined) return;

    // 回退：通过事件通知 index.js 处理
    this.ctx.emit('executeCommand', action);
  }
}

console.log('[sandbox-commands] 模块已加载');
