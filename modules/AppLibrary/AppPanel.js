// ============================================================
//  AppLibrary / AppPanel.js — Dock 应用库列 UI（面板主体）
//  职责：应用列表与桌面图标层的渲染、事件绑定（单击选中/
//  慢双击重命名/拖拽排序/双击运行）、布局与网格模式切换、
//  菜单动作（插入节点/更新/删除/复制粘贴/重命名）
//  实现说明：右键菜单 / 属性与确认弹窗 / 导入弹窗拆分至
//  app-menus.js / app-dialogs.js / app-import.js，以原型混入
//  （Object.assign(AppPanel.prototype, ...)）挂载；桌面图标
//  位置持久化等纯函数在 desktop-icons.js，按需 import 使用
// ============================================================

import { showToast } from '../SelectAndEdit/index.js';
import { appState } from '../module0_AppState.js';
import {
  _removeDesktopIconPosition,
  _snapToGrid,
  _snapToGridWithCollision,
  _saveDesktopIconPosition,
  _initDefaultDesktopPositions,
  _isImagePath,
  _loadDesktopPositions,
  _createDesktopIconElement,
  _getDefaultPosition
} from './desktop-icons.js';
import { menuMethods } from './app-menus.js';
import { dialogMethods } from './app-dialogs.js';
import { importMethods } from './app-import.js';

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

        // 网格布局时最终吸附（带碰撞互换：占用格与占用者互换位置，避免与图标重叠）
        if (appState.dockGridMode === 'grid') {
          const key = dragState.source === 'app' ? 'app:' + dragState.appId : 'ext:' + dragState.appId;
          const snapped = _snapToGridWithCollision(left, top, dragState.icon, dragState.origLeft, dragState.origTop);
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
    this._scanOrphanAppsOnce();
  }

  /**
   * 启动后首次刷新时扫描孤儿应用目录（有目录无注册记录），
   * 询问用户是否清理——不自动删除，尊重用户数据
   * @private
   */
  async _scanOrphanAppsOnce() {
    if (this._orphanScanDone) return;
    this._orphanScanDone = true;
    try {
      if (!window.api?.scanOrphanApps) return;
      const result = await window.api.scanOrphanApps();
      const orphans = result?.orphans || [];
      if (orphans.length === 0) return;
      const confirmed = await this._showConfirmDialog(
        '🧹 发现残留应用目录',
        `发现 ${orphans.length} 个未注册的残留应用目录（可能是导入中断产物）：\n${orphans.slice(0, 3).join('\n')}${orphans.length > 3 ? '\n...' : ''}`,
        '是否删除这些残留目录？此操作不可撤销。'
      );
      if (!confirmed) return;
      for (const orphanId of orphans) {
        try { await window.api.deleteApp(orphanId); } catch (_) { /* 逐个删，失败跳过 */ }
      }
      showToast(`已清理 ${orphans.length} 个残留应用目录`, 2500);
      await this.refresh();
    } catch (e) {
      console.warn('[AppPanel] 孤儿目录扫描失败:', e);
    }
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
}

// ── 功能块混入：右键菜单 / 属性与确认弹窗 / 导入弹窗 ──
// 方法体使用 this 访问实例状态，原型混入与写在 class 体内完全等价
Object.assign(AppPanel.prototype, menuMethods, dialogMethods, importMethods);
