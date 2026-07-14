import { showToast } from '../../../module5_SelectAndEdit.js';

export class SandboxMenuBar {
  constructor(ctx) {
    /** @type {import('../core/context').SandboxContext} */
    this.ctx = ctx;
    this._activeMenu = null;
    this._mousedownHandler = null;
    this._clickHandler = null;
    this._mouseoverHandler = null;
  }

  // ─── 生命周期 ────────────────────────────────────────────

  init() {
    const menubar = this._getMenuBarEl();
    if (!menubar) return;

    // 事件委托：在菜单栏容器上挂单一监听器，destroy 时可完整移除，
    // 避免多次打开/关闭 IDE 后监听器累积导致菜单动作重复执行
    // （旧的逐元素 addEventListener 方式不会被 destroy 清理）
    this._clickHandler = (e) => this._onMenubarClick(e);
    this._mouseoverHandler = (e) => this._onMenubarMouseover(e);
    menubar.addEventListener('click', this._clickHandler);
    menubar.addEventListener('mouseover', this._mouseoverHandler);

    // 点击外部关闭菜单
    this._mousedownHandler = (e) => this._onDocumentMouseDown(e);
    document.addEventListener('mousedown', this._mousedownHandler);
  }

  destroy() {
    // 移除菜单栏容器上的委托监听器（防止再次打开时累积）
    const menubar = this._getMenuBarEl();
    if (menubar) {
      if (this._clickHandler) menubar.removeEventListener('click', this._clickHandler);
      if (this._mouseoverHandler) menubar.removeEventListener('mouseover', this._mouseoverHandler);
    }
    if (this._mousedownHandler) {
      document.removeEventListener('mousedown', this._mousedownHandler);
      this._mousedownHandler = null;
    }
    this._clickHandler = null;
    this._mouseoverHandler = null;
    this._activeMenu = null;
  }

  // ─── DOM 查找 ─────────────────────────────────────────────

  _getMenuBarEl() {
    return this.ctx.content?.querySelector('.sandbox-menubar') || null;
  }

  // ─── 菜单栏事件（委托） ───────────────────────────────────

  _onMenubarClick(e) {
    // 1) 下拉菜单项点击（带 data-action）——优先匹配，避免被标题逻辑误处理
    const btn = e.target.closest('.menu-btn');
    if (btn) {
      const action = btn.dataset.action;
      if (action) {
        this._closeActiveMenu();
        this._executeMenuAction(action);
      }
      return;
    }
    // 2) 菜单标题点击（带 data-menu）——展开 / 折叠
    const title = e.target.closest('.menu-item');
    if (!title || !title.dataset.menu) return;
    const menuName = title.dataset.menu;
    if (this._activeMenu === menuName) {
      this._closeActiveMenu();
    } else {
      this._openMenu(menuName, title);
    }
  }

  _onMenubarMouseover(e) {
    // mouseenter 不冒泡，改用 mouseover 委托；仅在已有菜单展开时随悬停切换
    const title = e.target.closest('.menu-item');
    if (!title) return;
    const menuName = title.dataset.menu;
    if (!menuName || this._activeMenu === null) return;
    if (this._activeMenu !== menuName) {
      this._openMenu(menuName, title);
    }
  }

  _openMenu(menuName, titleEl) {
    this._closeActiveMenu();
    this._activeMenu = menuName;
    titleEl.classList.add('active');

    const dropdown = titleEl.querySelector('.menu-dropdown');
    if (dropdown) {
      dropdown.classList.add('open');
    }
  }

  _closeActiveMenu() {
    if (!this._activeMenu) return;

    const menubar = this._getMenuBarEl();
    if (menubar) {
      menubar.querySelectorAll('.menu-item.active').forEach(el => el.classList.remove('active'));
      menubar.querySelectorAll('.menu-dropdown.open').forEach(el => el.classList.remove('open'));
    }
    this._activeMenu = null;
  }

  /** 关闭全部菜单（_closeActiveMenu 的别名，供 index.js 委托调用） */
  _closeAllMenus() {
    this._closeActiveMenu();
  }

  // ─── 点击外部关闭 ─────────────────────────────────────────

  _onDocumentMouseDown(e) {
    const menubar = this._getMenuBarEl();
    if (!menubar || !this._activeMenu) return;

    if (!menubar.contains(e.target)) {
      this._closeActiveMenu();
    }
  }

  // ─── 动作分发 ─────────────────────────────────────────────

  _executeMenuAction(action) {
    // Monaco 编辑器直接操作类
    const monacoActions = [
      'undo', 'redo', 'cut', 'copy', 'paste',
      'find', 'replace', 'selectAll', 'format'
    ];

    // 本地处理类（菜单栏自身实现）
    const localActions = ['shortcuts', 'about'];

    if (monacoActions.includes(action)) {
      this._monacoEditorAction(action);
      return;
    }

    if (localActions.includes(action)) {
      this._handleLocalAction(action);
      return;
    }

    // 其余动作委托给 ctx
    // 文件类: save, export, history, close
    // 视图类: search, commandPalette, toggleConsole, toggleMinimap,
    //         toggleAutoRun, toggleSplit, settings
    // 导航类: quickOpen, gotoLine, toggleBookmark,
    //         nextBookmark, prevBookmark, clearBookmarks
    // 运行类: runPreview, refreshPreview, fullscreenPreview
    // 终端类: clearConsole, newTerminal, toggleTerminal, killAllTerminals
    try {
      if (typeof this.ctx.executeAction === 'function') {
        this.ctx.executeAction(action);
      } else {
        this.ctx.emit('executeMenuAction', action);
      }
    } catch (_err) {
      this.ctx.emit('executeMenuAction', action);
    }
  }

  // ─── Monaco 编辑器动作 ────────────────────────────────────

  _monacoEditorAction(action) {
    const editor = this.ctx.getEditor?.();
    if (!editor) {
      showToast('编辑器未就绪', 'warning');
      return;
    }

    const actionMap = {
      undo: 'undo',
      redo: 'redo',
      cut: 'editor.action.clipboardCutAction',
      copy: 'editor.action.clipboardCopyAction',
      paste: 'editor.action.clipboardPasteAction',
      find: 'actions.find',
      replace: 'editor.action.startFindReplaceAction',
      selectAll: 'editor.action.selectAll',
      format: 'editor.action.formatDocument'
    };

    const monacoAction = actionMap[action];
    if (monacoAction) {
      // 优先使用 editor.trigger，再回退到 getAction
      if (action === 'undo' || action === 'redo') {
        editor.trigger('sandbox-menubar', action);
      } else {
        const editorAction = editor.getAction(monacoAction);
        if (editorAction) {
          editorAction.run();
        } else {
          // 最终回退：尝试 trigger
          editor.trigger('sandbox-menubar', monacoAction);
        }
      }
    }
  }

  // ─── 本地动作处理 ─────────────────────────────────────────

  _handleLocalAction(action) {
    switch (action) {
      case 'shortcuts':
        this._showShortcutsHelp();
        break;
      case 'about':
        this._showAboutDialog();
        break;
    }
  }

  // ─── 快捷键帮助 ───────────────────────────────────────────

  _showShortcutsHelp() {
    const shortcuts = [
      { keys: 'Ctrl + S', desc: '保存' },
      { keys: 'Ctrl + Z', desc: '撤销' },
      { keys: 'Ctrl + Shift + Z', desc: '重做' },
      { keys: 'Ctrl + X', desc: '剪切' },
      { keys: 'Ctrl + C', desc: '复制' },
      { keys: 'Ctrl + V', desc: '粘贴' },
      { keys: 'Ctrl + F', desc: '查找' },
      { keys: 'Ctrl + H', desc: '替换' },
      { keys: 'Ctrl + A', desc: '全选' },
      { keys: 'Shift + Alt + F', desc: '格式化代码' },
      { keys: 'Ctrl + P', desc: '快速打开文件' },
      { keys: 'Ctrl + G', desc: '跳转到行' },
      { keys: 'Ctrl + Shift + P', desc: '命令面板' },
      { keys: 'F5', desc: '运行预览' },
      { keys: 'Ctrl + `', desc: '切换终端' },
      { keys: 'Ctrl + B', desc: '切换书签' },
      { keys: 'Ctrl + Shift + B', desc: '下一个书签' },
      { keys: 'Ctrl + Shift + Alt + B', desc: '上一个书签' }
    ];

    const overlay = document.createElement('div');
    overlay.className = 'sandbox-dialog-overlay';
    overlay.innerHTML = `
      <div class="sandbox-dialog shortcuts-dialog">
        <div class="dialog-header">
          <h3>键盘快捷键</h3>
          <button class="dialog-close" data-close>&times;</button>
        </div>
        <div class="dialog-body">
          <table class="shortcuts-table">
            <tbody>
              ${shortcuts.map(s => `
                <tr>
                  <td class="shortcut-keys"><kbd>${s.keys}</kbd></td>
                  <td class="shortcut-desc">${s.desc}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const closeDialog = () => overlay.remove();
    overlay.querySelector('[data-close]').addEventListener('click', closeDialog);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeDialog();
    });
  }

  // ─── 关于对话框 ───────────────────────────────────────────

  _showAboutDialog() {
    const overlay = document.createElement('div');
    overlay.className = 'sandbox-dialog-overlay';
    overlay.innerHTML = `
      <div class="sandbox-dialog about-dialog">
        <div class="dialog-header">
          <h3>关于 Sandbox</h3>
          <button class="dialog-close" data-close>&times;</button>
        </div>
        <div class="dialog-body about-content">
          <div class="about-logo">🚀</div>
          <h2>AstroKnot Sandbox</h2>
          <p class="about-version">v1.0.0</p>
          <p class="about-desc">轻量级在线代码编辑器，支持实时预览与终端操作。</p>
          <hr>
          <p class="about-tech">基于 Monaco Editor 构建</p>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const closeDialog = () => overlay.remove();
    overlay.querySelector('[data-close]').addEventListener('click', closeDialog);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeDialog();
    });
  }
}
