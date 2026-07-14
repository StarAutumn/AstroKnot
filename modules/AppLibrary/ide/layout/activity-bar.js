/**
 * SandboxActivityBar - 活动栏模块
 * 管理活动栏按钮状态、侧边面板切换、预览标签页等功能
 */
export class SandboxActivityBar {
  /**
   * @param {import('../core/context').SandboxContext} ctx - 沙箱上下文
   */
  constructor(ctx) {
    /** @private */
    this._ctx = ctx;
    /** @private @type {'explorer'|'search'|null} */
    this._activePanel = null;
    /** @private @type {boolean} */
    this._isPreviewTab = false;
    /** @private */
    this._previewCtxMenu = null;
  }

  /** 初始化模块，注册相关动作 */
  init() {
    this._ctx.registerAction('showPreview', () => this.activatePreviewTab());
  }

  /** 销毁模块，重置状态 */
  destroy() {
    this._activePanel = null;
    this._isPreviewTab = false;
    this._previewCtxMenu = null;
  }

  /**
   * 切换侧边面板可见性
   * @param {'explorer'|'search'} panel - 面板名称
   */
  toggleSidePanel(panel) {
    if (this._activePanel === panel) {
      this._activePanel = null;
      this._ctx.emit('toggleSidePanel', null);
    } else {
      this._activePanel = panel;
      this._ctx.emit('toggleSidePanel', panel);
    }
    this.updateActivityBarButtons(this._activePanel);
  }

  /**
   * 更新活动栏按钮的激活状态
   * @param {'explorer'|'search'|null} activePanel - 当前激活的面板
   */
  updateActivityBarButtons(activePanel) {
    const activityBar = document.querySelector('.sandbox-activity-bar');
    if (!activityBar) return;

    const buttons = activityBar.querySelectorAll('.activity-bar-btn');
    buttons.forEach((btn) => {
      const btnPanel = btn.dataset.panel;
      if (btnPanel === activePanel) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  /** 激活预览标签页 - 隐藏 Monaco 编辑器容器，显示预览区域（占据整个代码工作区），并触发 runPreview */
  activatePreviewTab() {
    this._isPreviewTab = true;

    // 隐藏 Monaco 编辑器容器（而非仅隐藏内部 DOM 节点），
    // 使预览区域凭借 flex:1 占据整个代码工作区
    const monacoContainer = document.getElementById('sandboxMonacoContainer');
    if (monacoContainer) {
      monacoContainer.style.display = 'none';
    }

    // 显示预览区域
    const previewEl = document.getElementById('sandboxPreviewContainer');
    if (previewEl) {
      previewEl.style.display = 'flex';
    }

    // 触发 runPreview
    try {
      const previewModule = this._ctx.getModule('preview');
      if (previewModule && typeof previewModule.runPreview === 'function') {
        previewModule.runPreview();
      }
    } catch {
      this._ctx.emit('runPreview');
    }

    // 渲染预览标签页
    this.renderPreviewTab();
  }

  /** 停用预览标签页 - 显示 Monaco 编辑器容器，隐藏预览区域 */
  deactivatePreviewTab() {
    this._isPreviewTab = false;

    // 显示 Monaco 编辑器容器
    const monacoContainer = document.getElementById('sandboxMonacoContainer');
    if (monacoContainer) {
      monacoContainer.style.display = '';
    }
    // 重新布局 Monaco（恢复尺寸），并兼容旧代码可能遗留的 display:none
    if (this._ctx.monacoEditor) {
      const editorDom = this._ctx.monacoEditor.getDomNode();
      if (editorDom && editorDom.style.display === 'none') {
        editorDom.style.display = '';
      }
      this._ctx.monacoEditor.layout();
    }

    // 隐藏预览区域
    const previewEl = document.getElementById('sandboxPreviewContainer');
    if (previewEl) {
      previewEl.style.display = 'none';
    }
  }

  /** 关闭预览标签页 - 停用预览并移除预览标签页 DOM */
  closePreviewTab() {
    this.deactivatePreviewTab();

    // 移除预览标签页 DOM（选择器与 tabs.js / file-ops.js 保持一致）
    const tabBar = document.getElementById('sandboxTabsContainer');
    if (tabBar) {
      const previewTab = tabBar.querySelector('.sandbox-tab[data-preview-tab]');
      if (previewTab) {
        previewTab.remove();
      }
      // 若标签栏已无任何标签，则隐藏
      if (!tabBar.querySelector('.sandbox-tab')) {
        tabBar.style.display = 'none';
      }
    }

    // 关闭相关模式
    this._ctx.emit('closeImagePreview');
    this._ctx.emit('exitMarkdownMode');
  }

  /** 渲染预览标签页 - 在标签栏中创建或更新预览标签 */
  renderPreviewTab() {
    const tabBar = document.getElementById('sandboxTabsContainer');
    if (!tabBar) return;

    // 检查是否已存在预览标签
    let previewTab = tabBar.querySelector('.sandbox-tab[data-preview-tab]');

    if (!previewTab) {
      // 创建新的预览标签（结构与 tabs.js 的文件标签一致）
      previewTab = document.createElement('div');
      previewTab.className = 'sandbox-tab sandbox-tab-preview active';
      previewTab.dataset.previewTab = '';

      // 图标
      const icon = document.createElement('span');
      icon.className = 'sandbox-tab-icon';
      icon.textContent = '👁';
      previewTab.appendChild(icon);

      // 名称
      const label = document.createElement('span');
      label.className = 'sandbox-tab-name';
      label.textContent = 'Preview';
      previewTab.appendChild(label);

      // 关闭按钮
      const closeBtn = document.createElement('span');
      closeBtn.className = 'sandbox-tab-close';
      closeBtn.textContent = '✕';
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closePreviewTab();
      });
      previewTab.appendChild(closeBtn);

      // 右键菜单
      previewTab.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.showPreviewTabContextMenu(e.clientX, e.clientY);
      });

      // 点击标签（非关闭按钮区域）激活预览
      previewTab.addEventListener('click', (e) => {
        if (e.target.classList.contains('sandbox-tab-close')) return;
        this.activatePreviewTab();
      });

      tabBar.appendChild(previewTab);
      tabBar.style.display = 'flex';
    } else {
      previewTab.classList.add('active');
    }

    // 将其他文件标签设为非激活
    const otherTabs = tabBar.querySelectorAll('.sandbox-tab:not([data-preview-tab])');
    otherTabs.forEach((tab) => tab.classList.remove('active'));
  }

  /**
   * 显示预览标签页的右键菜单
   * @param {number} x - 菜单横坐标
   * @param {number} y - 菜单纵坐标
   */
  showPreviewTabContextMenu(x, y) {
    // 移除已有菜单
    this._closePreviewContextMenu();

    const menu = document.createElement('div');
    menu.className = 'sandbox-context-menu preview-ctx-menu';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    const closeItem = document.createElement('div');
    closeItem.className = 'context-menu-item';
    closeItem.textContent = '关闭预览';
    closeItem.addEventListener('click', () => {
      this.closePreviewTab();
      this._closePreviewContextMenu();
    });
    menu.appendChild(closeItem);

    const reloadItem = document.createElement('div');
    reloadItem.className = 'context-menu-item';
    reloadItem.textContent = '重新加载';
    reloadItem.addEventListener('click', () => {
      this._ctx.emit('runPreview');
      this._closePreviewContextMenu();
    });
    menu.appendChild(reloadItem);

    document.body.appendChild(menu);
    this._previewCtxMenu = menu;

    // 点击其他区域关闭菜单
    const closeHandler = (e) => {
      if (!menu.contains(e.target)) {
        this._closePreviewContextMenu();
        document.removeEventListener('click', closeHandler);
      }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 0);
  }

  /**
   * 关闭预览右键菜单
   * @private
   */
  _closePreviewContextMenu() {
    if (this._previewCtxMenu) {
      this._previewCtxMenu.remove();
      this._previewCtxMenu = null;
    }
  }

  /** 是否处于预览标签页状态 */
  get isPreviewTab() {
    return this._isPreviewTab;
  }
}
