// ============================================================
//  AppLibrary / AppPanel.js — Dock 应用库列 UI
//  渲染应用列表、处理双击运行/右键菜单/拖拽到3D场景
//  导入弹窗（GitHub URL → 进度条 → 日志）
// ============================================================

import { showToast } from '../module5_SelectAndEdit.js';
import { appState } from '../module0_AppState.js';

export class AppPanel {
  /**
   * @param {import('./AppManager.js').AppManager} appManager
   * @param {import('./AppRunner.js').AppRunner} appRunner
   */
  constructor(appManager, appRunner) {
    this._manager = appManager;
    this._runner = appRunner;
    /** @type {string|null} 当前选中的应用 ID */
    this._selectedId = null;
    /** @type {HTMLElement|null} 导入弹窗元素 */
    this._importDialog = null;
    /** @type {Object|null} 复制的应用（用于粘贴） */
    this._clipboard = null;
    /** @type {string|null} 正在拖拽的应用 ID（用于内部排序） */
    this._draggingAppId = null;
    /** @type {Function|null} 当前右键菜单的关闭处理器 */
    this._currentCloseHandler = null;
    // 慢双击重命名状态
    this._lastClickedId = null;
    this._lastClickTime = 0;
    this._renameActive = false;

    this._init();
  }

  /**
   * 初始化
   * @private
   */
  _init() {
    // 注册列表变更回调
    this._manager.onUpdate(() => this._render());

    // 绑定添加按钮
    const addBtn = document.getElementById('dockAppAddBtn');
    if (addBtn) {
      addBtn.addEventListener('click', () => this._showImportDialog());
    }

    // 绑定应用列表事件委托
    const itemsContainer = document.getElementById('dockAppItems');
    if (itemsContainer) {
      // 单击选中 + 慢双击重命名
      itemsContainer.addEventListener('click', (e) => {
        const item = e.target.closest('.dock-app-item');
        if (!item) return;
        if (this._renameActive) return; // 重命名进行中，不处理

        const appId = item.dataset.appId;
        const now = Date.now();

        // 慢双击检测：同一选中项在 300-1500ms 内再次单击 → 进入重命名
        if (this._selectedId === appId && this._lastClickedId === appId
            && now - this._lastClickTime > 300 && now - this._lastClickTime < 1500) {
          const app = this._manager.getApps().find(a => a.id === appId);
          if (app) this._startInlineRename(item, app);
          this._lastClickedId = null;
          this._lastClickTime = 0;
          return;
        }

        // 普通单击 → 选中
        this._selectedId = appId;
        this._updateSelectedClass();
        this._lastClickedId = appId;
        this._lastClickTime = now;
      });

      // 双击运行
      itemsContainer.addEventListener('dblclick', (e) => {
        const item = e.target.closest('.dock-app-item');
        if (!item) return;
        const app = this._manager.getApps().find(a => a.id === item.dataset.appId);
        if (app) this._runApp(app);
      });

      // 右键菜单（应用项）
      itemsContainer.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const item = e.target.closest('.dock-app-item');
        if (item) {
          // 应用项右键菜单
          const app = this._manager.getApps().find(a => a.id === item.dataset.appId);
          if (app) this._showAppContextMenu(e.clientX, e.clientY, app);
        }
      });

      // 拖拽开始
      itemsContainer.addEventListener('dragstart', (e) => {
        const item = e.target.closest('.dock-app-item');
        if (!item) return;
        this._draggingAppId = item.dataset.appId;
        e.dataTransfer.setData('application/x-astroknot-app', item.dataset.appId);
        e.dataTransfer.effectAllowed = 'copyMove';
        item.classList.add('dragging');
      });

      // 拖拽结束
      itemsContainer.addEventListener('dragend', (e) => {
        const item = e.target.closest('.dock-app-item');
        if (item) item.classList.remove('dragging');
        // 清除所有 drag-over 标记
        for (const child of itemsContainer.children) {
          child.classList.remove('drag-over-top', 'drag-over-bottom');
        }
        this._draggingAppId = null;
      });

      // 拖拽经过其他应用项 — 显示插入指示 + 允许排序
      itemsContainer.addEventListener('dragover', (e) => {
        if (!this._draggingAppId) return;
        const item = e.target.closest('.dock-app-item');
        if (!item || item.dataset.appId === this._draggingAppId) return;

        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        // 根据鼠标位置判断插入到上方还是下方
        const rect = item.getBoundingClientRect();
        const isAbove = (e.clientY - rect.top) < rect.height / 2;

        // 清除其他项的标记
        for (const child of itemsContainer.children) {
          child.classList.remove('drag-over-top', 'drag-over-bottom');
        }
        item.classList.add(isAbove ? 'drag-over-top' : 'drag-over-bottom');
      });

      // 放置 — 执行排序
      itemsContainer.addEventListener('drop', (e) => {
        if (!this._draggingAppId) return;
        const item = e.target.closest('.dock-app-item');
        if (!item || item.dataset.appId === this._draggingAppId) return;

        e.preventDefault();
        e.stopPropagation(); // 阻止冒泡到 2D/3D 画布的 drop

        const rect = item.getBoundingClientRect();
        const isAbove = (e.clientY - rect.top) < rect.height / 2;
        const position = isAbove ? 'before' : 'after';

        this._manager.reorderApps(this._draggingAppId, item.dataset.appId, position);
      });
    }

    // 绑定桌面图标层事件委托（desktop 模式）
    this._bindDesktopLayerEvents();

    // 暴露清除选中方法供 Dock.js 调用
    window._clearAppSelection = () => {
      this._selectedId = null;
      this._updateSelectedClass();
      this._lastClickedId = null;
      this._lastClickTime = 0;
    };
    // 暴露删除图标位置方法供 Dock.js 调用（清理外部程序位置）
    window._removeDesktopIconPosition = _removeDesktopIconPosition;

    // 监听布局模式切换
    document.addEventListener('dock-layout-mode-change', () => this._onLayoutModeChange());
    document.addEventListener('dock-grid-mode-change', () => this._onGridModeChange());

    // 全局点击监听：点击非桌面图标区域时取消选中（使用捕获阶段确保最先处理）
    document.addEventListener('click', (e) => {
      if (appState.dockLayoutMode !== 'desktop') return;
      // 只有点击桌面图标时不取消选中，其他任何点击都取消
      if (e.target.closest('.desktop-icon')) return;
      // 点击右键菜单项时不取消选中（菜单 action 依赖 selectedPaths）
      if (e.target.closest('.dock-context-menu')) return;
      // 点击其他区域（画布、任务栏、空白区域等）时取消选中
      this._selectedId = null;
      this._updateSelectedClass();
      this._lastClickedId = null;
      this._lastClickedTime = 0;
      if (typeof window._clearExternalSelection === 'function') {
        window._clearExternalSelection();
      }
    }, true); // capture: true 使用捕获阶段

    // 初始化模式
    this._onLayoutModeChange();
    this._onGridModeChange();
  }

  /**
   * 绑定桌面图标层事件
   * @private
   */
  _bindDesktopLayerEvents() {
    const desktopLayer = document.getElementById('desktopIconsLayer');
    if (!desktopLayer) return;

    /* ---- 鼠标拖拽自由移动 ---- */
    let dragState = null; // { icon, appId, startX, startY, origLeft, origTop, moved }

    const onMouseDown = (e) => {
      if (e.button !== 0) return; // 仅左键
      if (this._renameActive) return;
      const icon = e.target.closest('.desktop-icon');
      if (!icon) return;
      const rect = icon.getBoundingClientRect();
      dragState = {
        icon,
        appId: icon.dataset.appId,
        source: icon.dataset.source,
        startX: e.clientX,
        startY: e.clientY,
        origLeft: icon.offsetLeft,
        origTop: icon.offsetTop,
        moved: false
      };
      icon.classList.add('drag-moving');
      e.preventDefault();
    };

    const onMouseMove = (e) => {
      if (!dragState) return;
      const dx = e.clientX - dragState.startX;
      const dy = e.clientY - dragState.startY;
      if (!dragState.moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
      dragState.moved = true;
      const parent = dragState.icon.offsetParent || desktopLayer;
      let newLeft = Math.max(0, dragState.origLeft + dx);
      let newTop = Math.max(0, dragState.origTop + dy);

      // 网格布局时实时吸附到格子中心
      if (appState.dockGridMode === 'grid') {
        const snapped = _snapToGrid(newLeft, newTop);
        newLeft = snapped.left;
        newTop = snapped.top;
      }

      dragState.icon.style.left = newLeft + 'px';
      dragState.icon.style.top = newTop + 'px';
    };

    const onMouseUp = () => {
      if (!dragState) return;
      dragState.icon.classList.remove('drag-moving');
      const wasMoved = dragState.moved;
      if (wasMoved) {
        desktopLayer._dragJustMoved = true;
        setTimeout(() => { desktopLayer._dragJustMoved = false; }, 200);

        let left = parseFloat(dragState.icon.style.left) || dragState.origLeft;
        let top = parseFloat(dragState.icon.style.top) || dragState.origTop;

        // 网格布局时最终吸附（带碰撞检测，避免与其他图标重叠）
        if (appState.dockGridMode === 'grid') {
          const key = dragState.source === 'app' ? 'app:' + dragState.appId : 'ext:' + dragState.appId;
          const snapped = _snapToGridWithCollision(left, top, key);
          left = snapped.left;
          top = snapped.top;
          dragState.icon.style.left = left + 'px';
          dragState.icon.style.top = top + 'px';
        }

        const key = dragState.source === 'app' ? 'app:' + dragState.appId : 'ext:' + dragState.appId;
        _saveDesktopIconPosition(key, { left, top });
      }
      dragState = null;
    };

    desktopLayer.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    /* ---- 单击选中 + 慢双击重命名（仅 GitHub 应用） ---- */
    desktopLayer.addEventListener('click', (e) => {
      if (desktopLayer._dragJustMoved) return; // 拖拽后不触发点击
      if (dragState && dragState.moved) return;
      const icon = e.target.closest('.desktop-icon');

      // 点击空白区域由全局 document 监听器处理，这里只处理图标点击
      if (!icon) return;

      // 外部程序图标不处理选中（由 Dock.js 处理）
      if (icon.dataset.source !== 'app') return;

      if (this._renameActive) return;

      const appId = icon.dataset.appId;
      const now = Date.now();

      // 慢双击重命名
      if (this._selectedId === appId && this._lastClickedId === appId
          && now - this._lastClickTime > 300 && now - this._lastClickTime < 1500) {
        const app = this._manager.getApps().find(a => a.id === appId);
        if (app) this._startInlineRename(icon, app);
        this._lastClickedId = null;
        this._lastClickTime = 0;
        return;
      }

      // 先取消之前的选中，再设置新选中
      this._selectedId = null;
      this._updateSelectedClass();
      
      // 同时清除外部程序的选中状态
      if (typeof window._clearExternalSelection === 'function') {
        window._clearExternalSelection();
      }
      
      this._selectedId = appId;
      this._updateSelectedClass();
      this._lastClickedId = appId;
      this._lastClickTime = now;
    });

    /* ---- 双击运行 ---- */
    desktopLayer.addEventListener('dblclick', (e) => {
      const icon = e.target.closest('.desktop-icon');
      if (!icon || icon.dataset.source !== 'app') return;
      const app = this._manager.getApps().find(a => a.id === icon.dataset.appId);
      if (app) this._runApp(app);
    });

    /* ---- 右键菜单（仅 GitHub 应用） ---- */
    desktopLayer.addEventListener('contextmenu', (e) => {
      const icon = e.target.closest('.desktop-icon');
      if (!icon || icon.dataset.source !== 'app') return;
      const app = this._manager.getApps().find(a => a.id === icon.dataset.appId);
      if (app) {
        e.preventDefault();
        e.stopPropagation();
        this._showAppContextMenu(e.clientX, e.clientY, app);
      }
    });
  }

  /**
   * 布局模式切换处理
   * @private
   */
  _onLayoutModeChange() {
    const isDesktop = appState.dockLayoutMode === 'desktop';
    // 切换 body class
    document.body.classList.toggle('desktop-mode', isDesktop);
    // 切换 dock 面板显隐（整个侧边栏）
    const dockPanel = document.getElementById('dockPanel');
    if (dockPanel) dockPanel.style.display = isDesktop ? 'none' : '';
    // 切换桌面图标层显隐
    const desktopLayer = document.getElementById('desktopIconsLayer');
    if (desktopLayer) {
      desktopLayer.style.display = isDesktop ? 'block' : 'none';
      // 填充默认图标位置（首次使用桌面模式）
      if (isDesktop && desktopLayer.children.length === 0) {
        _initDefaultDesktopPositions(this._manager.getApps());
      }
    }
    // 重新渲染
    this._render();
  }

  /**
   * 网格模式切换时重新渲染（将所有图标吸附到格子中心）
   * @private
   */
  _onGridModeChange() {
    if (appState.dockLayoutMode !== 'desktop') return;
    // 网格布局时，将所有图标重新吸附到格子中心
    if (appState.dockGridMode === 'grid') {
      const desktopLayer = document.getElementById('desktopIconsLayer');
      if (!desktopLayer) return;
      for (const icon of desktopLayer.children) {
        if (!icon.classList.contains('desktop-icon')) continue;
        const left = parseFloat(icon.style.left) || 16;
        const top = parseFloat(icon.style.top) || 16;
        const snapped = _snapToGrid(left, top);
        icon.style.left = snapped.left + 'px';
        icon.style.top = snapped.top + 'px';
        // 保存吸附后的位置
        const key = icon.dataset.source === 'app' ? 'app:' + icon.dataset.appId : 'ext:' + icon.dataset.appId;
        _saveDesktopIconPosition(key, { left: snapped.left, top: snapped.top });
      }
    }
  }

  /**
   * 获取当前模式的容器
   * @private
   */
  _getItemsContainer() {
    if (appState.dockLayoutMode === 'desktop') {
      return document.getElementById('desktopIconsLayer');
    }
    return document.getElementById('dockAppItems');
  }

  /**
   * 判断是否为桌面模式
   * @private
   */
  _isDesktopMode() {
    return appState.dockLayoutMode === 'desktop';
  }

  /**
   * 刷新应用列表
   */
  async refresh() {
    await this._manager.loadApps();
    this._render();
  }

  /**
   * 渲染应用列表（根据布局模式走不同分支）
   * @private
   */
  _render() {
    const container = this._getItemsContainer();
    if (!container) return;

    const apps = this._manager.getApps();
    container.innerHTML = '';

    if (this._isDesktopMode()) {
      this._renderDesktop(container, apps);
    } else {
      this._renderSidebar(container, apps);
    }
  }

  /**
   * 侧边栏模式渲染
   * @private
   */
  _renderSidebar(container, apps) {
    if (apps.length === 0) {
      container.innerHTML = '<div class="dock-app-empty">点击 ➕ 从 GitHub<br>导入应用</div>';
      return;
    }
    for (const app of apps) {
      const el = document.createElement('div');
      el.className = 'dock-app-item' + (this._selectedId === app.id ? ' selected' : '');
      el.dataset.appId = app.id;
      el.draggable = true;
      el.title = `${app.name}\n${app.repo}\n${app.fileCount || 0} 个文件`;

      const icon = document.createElement('span');
      icon.className = 'dock-app-icon';
      if (_isImagePath(app.icon)) {
        const imgEl = document.createElement('img');
        imgEl.src = app.icon;
        imgEl.alt = app.name;
        imgEl.draggable = false;
        icon.appendChild(imgEl);
      } else {
        icon.textContent = app.icon || '📦';
      }
      el.appendChild(icon);

      const label = document.createElement('span');
      label.className = 'dock-app-label';
      label.textContent = app.name;
      el.appendChild(label);

      container.appendChild(el);
    }
  }

  /**
   * Windows 桌面图标模式渲染
   * @private
   */
  _renderDesktop(container, apps) {
    container.innerHTML = '';

    // 加载保存的位置
    const positions = _loadDesktopPositions();

    for (const app of apps) {
      const el = _createDesktopIconElement(app.name, app.icon || '📦', app.id, 'app');
      el.title = `${app.name}\n${app.repo || ''}\n${app.fileCount || 0} 个文件`;
      if (this._selectedId === app.id) el.classList.add('selected');

      const key = 'app:' + app.id;
      const pos = positions[key];
      if (pos) {
        el.style.left = pos.left + 'px';
        el.style.top = pos.top + 'px';
      } else {
        const def = _getDefaultPosition(key, apps.length);
        el.style.left = def.left + 'px';
        el.style.top = def.top + 'px';
      }

      container.appendChild(el);
    }

    // 追加外部程序图标（由 Dock.js 提供）
    let hasExternal = false;
    if (typeof window._renderExternalAppsToDesktop === 'function') {
      hasExternal = window._renderExternalAppsToDesktop(container, positions);
    }

    // 空状态提示
    if (apps.length === 0 && !hasExternal) {
      const empty = document.createElement('div');
      empty.style.cssText = 'position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); color:#5a7a8a; font-size:13px; pointer-events:none;';
      empty.textContent = '点击顶部 ➕ 按钮从 GitHub 导入应用';
      container.appendChild(empty);
    }
  }

  /**
   * 更新选中状态
   * @private
   */
  _updateSelectedClass() {
    const container = this._getItemsContainer();
    if (!container) return;
    for (const child of container.children) {
      child.classList.toggle('selected', child.dataset.appId === this._selectedId);
    }
  }

  /**
   * 运行应用
   * @private
   */
  async _runApp(app) {
    showToast(`正在打开 ${app.name}...`, 1500);
    await this._runner.open(app);
  }

  /**
   * 通过 IDE 打开 GitHub 应用
   * @private
   */
  async _openAppInIDE(app) {
    try {
      showToast(`正在以 IDE 打开 ${app.name}...`, 1500);
      // 获取应用的 sandbox 目录路径
      const sandboxPath = await window.api?.getAppSandboxPath?.(app.id);
      if (!sandboxPath) {
        showToast('无法获取应用文件路径', 3000);
        return;
      }
      // 构建 IDE 类型的 app 对象，传入 sandboxPath
      // 使用不同的 id 避免与普通运行窗口冲突
      const ideApp = {
        ...app,
        id: `ide-${app.id}`,
        type: 'ide',
        name: `IDE - ${app.name}`,
        sandboxPath: sandboxPath,
      };
      await this._runner.open(ideApp);
    } catch (e) {
      console.error('[AppPanel] IDE 打开失败:', e);
      showToast(`IDE 打开失败: ${e.message}`, 3000);
    }
  }

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
  }

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
      { label: '插入为节点', action: () => this._insertAsNode(app), disabled: isBuiltin },
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
  }

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

  // ════════════════════════════════════════════════════════════
  //  菜单动作
  // ════════════════════════════════════════════════════════════

  /**
   * 插入为节点
   * @private
   */
  async _insertAsNode(app) {
    try {
      showToast(`正在插入 ${app.name} 为节点...`, 1500);
      const node = await this._manager.insertAsNode(app.id, null);
      if (node) {
        showToast(`已插入节点: ${node.name}`, 2000);
      }
    } catch (e) {
      console.error('[AppPanel] 插入节点失败:', e);
      showToast(`插入失败: ${e.message}`, 3000);
    }
  }

  /**
   * 更新应用
   * @private
   */
  async _updateApp(app) {
    this._showImportDialog({ updateAppId: app.id, prefillUrl: app.repo });
  }

  /**
   * 删除应用
   * @private
   */
  async _deleteApp(app) {
    try {
      const confirmed = await this._showConfirmDialog(
        '🗑 删除应用',
        `确定删除应用「${app.name}」吗？`,
        '此操作不可撤销。'
      );
      if (!confirmed) return;
      await this._manager.deleteApp(app.id);
      // 清理该应用的桌面图标位置数据
      const key = 'app:' + app.id;
      _removeDesktopIconPosition(key);
      showToast(`已删除: ${app.name}`, 2000);
    } catch (e) {
      console.error('[AppPanel] 删除应用失败:', e);
      showToast(`删除失败: ${e.message}`, 3000);
    }
  }

  /**
   * 在资源管理器中打开应用文件夹
   * @private
   */
  async _openInExplorer(app) {
    try {
      const result = await window.api.openAppInExplorer(app.id);
      if (!result.success) {
        showToast(`打开失败: ${result.error}`, 3000);
      }
    } catch (e) {
      console.error('[AppPanel] 打开文件夹失败:', e);
      showToast(`打开失败: ${e.message}`, 3000);
    }
  }

  /**
   * 复制应用（到内部剪贴板）
   * @private
   */
  _copyApp(app) {
    this._clipboard = app;
    showToast(`已复制: ${app.name}（右键空白处粘贴）`, 2000);
  }

  /**
   * 粘贴应用（克隆副本）
   * @private
   */
  async _pasteApp() {
    if (!this._clipboard) return;
    const app = this._clipboard;
    try {
      showToast(`正在复制 ${app.name}...`, 1500);
      await this._manager.cloneApp(app.id);
      showToast(`已创建副本: ${app.name} (副本)`, 2000);
    } catch (e) {
      console.error('[AppPanel] 粘贴失败:', e);
      showToast(`粘贴失败: ${e.message}`, 3000);
    }
  }

  /**
   * 开始内联重命名（慢双击或右键菜单触发）
   * @param {HTMLElement} el - 应用项 DOM 元素
   * @param {Object} app - 应用数据
   * @private
   */
  _startInlineRename(el, app) {
    const label = el.querySelector('.dock-app-label, .desktop-icon-label');
    if (!label) return;

    this._renameActive = true;
    const originalName = label.textContent;

    const input = document.createElement('input');
    input.className = this._isDesktopMode() ? 'desktop-icon-rename-input' : 'dock-app-rename-input';
    input.value = originalName;
    input.style.width = Math.max(label.offsetWidth + 20, 60) + 'px';
    label.replaceWith(input);
    input.focus();
    input.select();

    const finish = async (save) => {
      this._renameActive = false;
      const newName = save ? (input.value.trim() || originalName) : originalName;
      if (newName !== originalName) {
        try {
          await this._manager.renameApp(app.id, newName);
          showToast(`已重命名: ${newName}`, 1500);
        } catch (e) {
          showToast(`重命名失败: ${e.message}`, 3000);
        }
      }
      this._render();
    };

    input.addEventListener('blur', () => finish(true));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
  }

  /**
   * 重命名应用（右键菜单入口 → 找到 DOM 元素后调用内联重命名）
   * @private
   */
  _renameApp(app) {
    const container = this._getItemsContainer();
    if (!container) return;
    for (const child of container.children) {
      if (child.dataset.appId === app.id) {
        this._startInlineRename(child, app);
        break;
      }
    }
  }

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
  }

  /**
   * 关闭属性弹窗
   * @private
   */
  _closePropertiesDialog() {
    const existing = document.querySelector('.app-props-overlay');
    if (existing) existing.remove();
  }

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
  }

  /** 关闭确认对话框 @private */
  _closeConfirmDialog() {
    const existing = document.querySelector('.app-confirm-overlay');
    if (existing) existing.remove();
  }

  // ════════════════════════════════════════════════════════════
  //  导入弹窗
  // ════════════════════════════════════════════════════════════

  /**
   * 添加外部程序
   * @private
   */
  _addExternalApp() {
    const input = document.createElement('input');
    input.type = 'file';
    // Windows 可执行文件和应用快捷方式
    input.accept = '.exe,.lnk,.bat,.cmd,.ps1';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      
      const filePath = file.path;
      if (!filePath) return;
      
      const name = filePath.split(/[/\\]/).pop().replace(/\.[^.]+$/, '');
      
      // 通知 Dock 添加外部程序
      document.dispatchEvent(new CustomEvent('dock-add-external', {
        detail: { path: filePath, name }
      }));
    });
    input.click();
  }

  /**
   * 显示导入弹窗
   * @param {Object} [opts] - { updateAppId, prefillUrl }
   * @private
   */
  _showImportDialog(opts = {}) {
    const isUpdate = !!opts.updateAppId;

    this._closeImportDialog();

    const overlay = document.createElement('div');
    overlay.className = 'app-import-overlay';
    overlay.innerHTML = `
      <div class="app-import-dialog">
        <div class="app-import-header">
          <span>${isUpdate ? '🔄 更新应用' : '📦 从 GitHub 导入应用'}</span>
          <button class="caption-btn" id="appImportCloseBtn">✕</button>
        </div>
        <div class="app-import-body">
          <div class="app-import-tool-row">
            <button class="app-import-tool-btn" id="appImportToolBtn">🔍 检测环境</button>
            <div class="app-import-tool-warning" id="appImportToolWarning" style="display:none;"></div>
          </div>
          <div class="app-import-input-group">
            <input type="text" id="appImportUrlInput" placeholder="owner/repo 或 GitHub URL" value="${opts.prefillUrl || ''}" ${isUpdate ? 'disabled' : ''} />
            ${!isUpdate ? '<button id="appImportParseBtn">解析</button>' : ''}
          </div>
          <div class="app-import-repo-info" id="appImportRepoInfo"></div>
          <div class="app-import-actions">
            <button class="app-import-btn-primary" id="appImportStartBtn" ${isUpdate ? '' : 'disabled'}>${isUpdate ? '开始更新' : '开始导入'}</button>
            <button class="app-import-btn-secondary" id="appImportCancelBtn">取消</button>
          </div>
          <div class="app-import-progress" id="appImportProgress">
            <div class="app-import-progress-bar">
              <div class="app-import-progress-fill" id="appImportProgressFill"></div>
            </div>
            <div class="app-import-progress-text" id="appImportProgressText">准备中...</div>
          </div>
          <div class="app-import-log" id="appImportLog"></div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this._importDialog = overlay;

    const closeBtn = overlay.querySelector('#appImportCloseBtn');
    const cancelBtn = overlay.querySelector('#appImportCancelBtn');
    const parseBtn = overlay.querySelector('#appImportParseBtn');
    const startBtn = overlay.querySelector('#appImportStartBtn');
    const urlInput = overlay.querySelector('#appImportUrlInput');
    const toolWarning = overlay.querySelector('#appImportToolWarning');
    const toolBtn = overlay.querySelector('#appImportToolBtn');

    // ── 检测系统工具（git / npm）── 点击按钮触发
    let _tools = { git: true, npm: true }; // 默认假定可用，未检测也不阻断
    if (toolBtn) {
      toolBtn.addEventListener('click', async () => {
        if (!window.api?.checkTools) {
          toolWarning.innerHTML = '⚠️ 当前环境不支持检测';
          toolWarning.style.display = 'block';
          return;
        }
        toolBtn.disabled = true;
        toolBtn.textContent = '🔍 检测中...';
        try {
          const tools = await window.api.checkTools();
          _tools = tools;
          // git 行
          let gitLine;
          if (tools.git) {
            gitLine = '<div class="tool-ok">✅ Git ' + (tools.gitVersion || '') + '</div>';
          } else {
            gitLine = '<div class="tool-miss">❌ 未检测到 Git — 导入必需 · <a href="https://git-scm.com/downloads" target="_blank" style="color:#5ab4dc;">下载 Git</a></div>';
          }
          // node.js 行
          let npmLine;
          if (tools.npm) {
            npmLine = '<div class="tool-ok">✅ Node.js ' + (tools.npmVersion || '') + '</div>';
          } else {
            npmLine = '<div class="tool-miss">❌ 未检测到 Node.js — npm install 需要 · <a href="https://nodejs.org/" target="_blank" style="color:#5ab4dc;">下载 Node.js</a></div>';
          }
          toolWarning.innerHTML = gitLine + npmLine;
          toolWarning.style.display = 'block';
        } finally {
          toolBtn.disabled = false;
          toolBtn.textContent = '🔍 检测环境';
        }
      });
    }

    const close = () => {
      this._manager.cancel();
      this._closeImportDialog();
    };

    if (closeBtn) closeBtn.addEventListener('click', close);
    if (cancelBtn) cancelBtn.addEventListener('click', close);

    if (parseBtn) {
      parseBtn.addEventListener('click', async () => {
        const url = urlInput.value.trim();
        if (!url) return;

        parseBtn.disabled = true;
        parseBtn.textContent = '解析中...';

        try {
          const client = this._manager._client;
          const parsed = client.parseRepoUrl(url);
          if (!parsed) throw new Error('无法解析仓库地址');
          const meta = await client.fetchRepoMeta(parsed.owner, parsed.repo);

          const infoEl = overlay.querySelector('#appImportRepoInfo');
          infoEl.innerHTML = `
            <div class="repo-name">${meta.name || parsed.repo}</div>
            <div class="repo-meta">
              ${meta.description || '无描述'}<br>
              ⭐ ${meta.stars || 0} · 🍴 ${meta.forks || 0} · 分支: ${meta.defaultBranch} · ${(meta.sizeKb / 1024).toFixed(1)}MB
            </div>
          `;
          infoEl.classList.add('visible');
          startBtn.disabled = false;
        } catch (e) {
          const infoEl = overlay.querySelector('#appImportRepoInfo');
          infoEl.innerHTML = `<div class="repo-error">❌ 解析失败: ${e.message}</div>`;
          infoEl.classList.add('visible');
          startBtn.disabled = true;
        } finally {
          parseBtn.disabled = false;
          parseBtn.textContent = '解析';
        }
      });
    }

    if (startBtn) {
      startBtn.addEventListener('click', async () => {
        // git 不可用时直接拦截
        if (!_tools.git) {
          const logEl = overlay.querySelector('#appImportLog');
          if (logEl) {
            logEl.classList.add('visible');
            const line = document.createElement('div');
            line.className = 'app-import-log-line app-import-log-error';
            line.textContent = '❌ 未检测到 Git，无法从 GitHub 导入。请先安装 Git：https://git-scm.com/downloads';
            logEl.appendChild(line);
          }
          return;
        }
        startBtn.disabled = true;
        const progressEl = overlay.querySelector('#appImportProgress');
        const progressFill = overlay.querySelector('#appImportProgressFill');
        const progressText = overlay.querySelector('#appImportProgressText');
        const logEl = overlay.querySelector('#appImportLog');
        progressEl.classList.add('visible');
        logEl.classList.add('visible');

        const onProgress = (done, total, msg) => {
          const pct = total > 0 ? Math.round((done / total) * 100) : 0;
          progressFill.style.width = `${pct}%`;
          progressText.textContent = `${done}/${total} (${pct}%) - ${msg || ''}`;
        };
        const onLog = (level, msg) => {
          const line = document.createElement('div');
          line.className = `app-import-log-line app-import-log-${level}`;
          line.textContent = msg;
          logEl.appendChild(line);
          logEl.scrollTop = logEl.scrollHeight;
          while (logEl.children.length > 200) {
            logEl.removeChild(logEl.firstChild);
          }
        };

        try {
          if (isUpdate) {
            await this._manager.updateFromGithub(opts.updateAppId, { onProgress, onLog });
          } else {
            const url = urlInput.value.trim();
            await this._manager.importFromGithub(url, { onProgress, onLog });
          }
          setTimeout(() => this._closeImportDialog(), 1000);
        } catch (e) {
          onLog('error', e.message);
          startBtn.disabled = false;
          startBtn.textContent = '重试';
        }
      });
    }

    if (!isUpdate && urlInput) {
      setTimeout(() => urlInput.focus(), 50);
    } else if (isUpdate && startBtn) {
      setTimeout(() => startBtn.click(), 100);
    }
  }

  /**
   * 关闭导入弹窗
   * @private
   */
  _closeImportDialog() {
    if (this._importDialog) {
      this._importDialog.remove();
      this._importDialog = null;
    }
  }
}

// ════════════════════════════════════════════════════════════
//  桌面图标位置持久化 + 辅助函数
// ════════════════════════════════════════════════════════════

const DESKTOP_POS_KEY = 'astroknot-desktop-icon-positions';

/** 加载所有保存的图标位置 */
function _loadDesktopPositions() {
  try {
    return JSON.parse(localStorage.getItem(DESKTOP_POS_KEY)) || {};
  } catch { return {}; }
}

/** 保存单个图标位置 */
function _saveDesktopIconPosition(key, pos) {
  const all = _loadDesktopPositions();
  all[key] = { left: Math.round(pos.left), top: Math.round(pos.top) };
  localStorage.setItem(DESKTOP_POS_KEY, JSON.stringify(all));
}

/** 删除单个图标位置 */
function _removeDesktopIconPosition(key) {
  const all = _loadDesktopPositions();
  if (all[key]) {
    delete all[key];
    localStorage.setItem(DESKTOP_POS_KEY, JSON.stringify(all));
  }
}

/** 清除所有图标位置 */
function _clearDesktopPositions() {
  localStorage.removeItem(DESKTOP_POS_KEY);
}

/** 获取默认位置（网格排列） */
function _getDefaultPosition(key, totalCount) {
  const gapX = 84; // 80px 图标 + 4px 间距（高密度）
  const gapY = 84; // 80px 图标 + 4px 间距（高密度）
  const startX = 8;
  const startY = 8;
  const cols = Math.max(1, Math.floor((window.innerWidth - 160) / gapX) || 10);

  // 对所有已知 key 排序，新 key 排在末尾
  const keys = _getAllKeys();
  let idx = keys.indexOf(key);
  if (idx < 0) {
    idx = keys.length; // 新 key 排在末尾
  }
  const col = idx % cols;
  const row = Math.floor(idx / cols);

  // 网格布局时使用吸附后的位置，自由布局时直接计算
  if (appState.dockGridMode === 'grid') {
    return _snapToGrid(startX + col * gapX, startY + row * gapY);
  }
  return {
    left: startX + col * gapX,
    top: startY + row * gapY
  };
}

/** 获取所有已保存的 key 列表 */
function _getAllKeys() {
  const positions = _loadDesktopPositions();
  return Object.keys(positions).sort();
}

/** 初始化默认位置（为所有应用计算默认位置） */
function _initDefaultDesktopPositions(apps) {
  const positions = _loadDesktopPositions();
  let changed = false;
  const gapX = 84; // 80px 图标 + 4px 间距（高密度）
  const gapY = 84; // 80px 图标 + 4px 间距（高密度）
  const startX = 8;
  const startY = 8;
  const cols = Math.max(1, Math.floor((window.innerWidth - 160) / gapX) || 10);

  apps.forEach((app, i) => {
    const key = 'app:' + app.id;
    if (!positions[key]) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      positions[key] = { left: startX + col * gapX, top: startY + row * gapY };
      changed = true;
    }
  });

  if (changed) localStorage.setItem(DESKTOP_POS_KEY, JSON.stringify(positions));
}

/** 检测是否为图片路径 */
function _isImagePath(icon) {
  if (!icon || typeof icon !== 'string') return false;
  // 支持：相对路径、http(s) URL、data URI
  return /\.(png|jpe?g|gif|svg|webp|bmp|ico)$/i.test(icon) ||
         /^https?:\/\//i.test(icon) ||
         /^data:image\//i.test(icon);
}

/** 创建桌面图标 DOM 元素（通用） */
function _createDesktopIconElement(name, iconText, id, source) {
  const el = document.createElement('div');
  el.className = 'desktop-icon';
  el.dataset.appId = id;
  el.dataset.source = source;

  const img = document.createElement('div');
  img.className = 'desktop-icon-img';

  if (_isImagePath(iconText)) {
    // 图片路径：创建 <img> 元素
    const imgEl = document.createElement('img');
    imgEl.src = iconText;
    imgEl.alt = name;
    imgEl.draggable = false;
    img.appendChild(imgEl);
  } else {
    // emoji 或文本
    img.textContent = iconText;
  }
  el.appendChild(img);

  const label = document.createElement('div');
  label.className = 'desktop-icon-label';
  label.textContent = name;
  el.appendChild(label);

  return el;
}

/** 网格吸附：将任意坐标吸附到最近的格子中心 */
function _snapToGrid(left, top) {
  const CELL_WIDTH = 84;
  const CELL_HEIGHT = 84;
  const START_X = 8;
  const START_Y = 8;

  const col = Math.round((left - START_X) / CELL_WIDTH);
  const row = Math.round((top - START_Y) / CELL_HEIGHT);
  const safeCol = Math.max(0, col);
  const safeRow = Math.max(0, row);

  return {
    left: START_X + safeCol * CELL_WIDTH,
    top: START_Y + safeRow * CELL_HEIGHT
  };
}

/** 网格吸附（带碰撞检测）：避免与已有图标重叠 */
function _snapToGridWithCollision(left, top, excludeKey) {
  const CELL_WIDTH = 84;
  const CELL_HEIGHT = 84;
  const START_X = 8;
  const START_Y = 8;

  const targetCol = Math.max(0, Math.round((left - START_X) / CELL_WIDTH));
  const targetRow = Math.max(0, Math.round((top - START_Y) / CELL_HEIGHT));

  // 获取所有已占用的格子
  const occupiedCells = new Set();
  const allPositions = _loadDesktopPositions();
  for (const [key, pos] of Object.entries(allPositions)) {
    if (key === excludeKey) continue;
    const col = Math.round((pos.left - START_X) / CELL_WIDTH);
    const row = Math.round((pos.top - START_Y) / CELL_HEIGHT);
    if (col >= 0 && row >= 0) {
      occupiedCells.add(`${col},${row}`);
    }
  }

  // 检查目标格子是否可用
  const targetKey = `${targetCol},${targetRow}`;
  if (!occupiedCells.has(targetKey)) {
    return { left: START_X + targetCol * CELL_WIDTH, top: START_Y + targetRow * CELL_HEIGHT };
  }

  // 螺旋搜索最近的空闲格子
  for (let radius = 1; radius <= 50; radius++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
        const col = targetCol + dx;
        const row = targetRow + dy;
        if (col < 0 || row < 0) continue;
        const key = `${col},${row}`;
        if (!occupiedCells.has(key)) {
          return { left: START_X + col * CELL_WIDTH, top: START_Y + row * CELL_HEIGHT };
        }
      }
    }
  }

  return { left: START_X + targetCol * CELL_WIDTH, top: START_Y + targetRow * CELL_HEIGHT };
}
