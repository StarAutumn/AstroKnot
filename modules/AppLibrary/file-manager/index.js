// ============================================================
//  file-manager/index.js — "此 AstroKnot" 文件管理器主入口
//  类似 Windows "此电脑"，管理 AstroKnot-Data 目录
//  功能：目录树、文件列表、面包屑导航、右键菜单、文件预览
//  目录树侧栏、打开/IDE/项目集成、文件操作、预览面板、
//  拖拽框选与通用 UI 小件方法以原型混入挂到 FileManagerApp
//  （见 tree.js / open.js / file-ops.js / preview.js /
//  selection.js / ui-widgets.js），constructor、文件列表
//  与导航等编排逻辑保留在此
// ============================================================

import { getFileIconSVG, getFolderIconSVG } from '../ide/core/file-icons.js';
import { treeMethods, isUnderSystem } from './tree.js';
import { openMethods } from './open.js';
import { fileOpsMethods } from './file-ops.js';
import { previewMethods, formatSize } from './preview.js';
import { selectionMethods } from './selection.js';
import { uiWidgetMethods } from './ui-widgets.js';

/** 确保文件管理器 CSS 只加载一次 */
let _fmCssLoaded = false;
function _ensureCss() {
  if (_fmCssLoaded) return;
  _fmCssLoaded = true;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('./file-manager.css', import.meta.url).href;
  document.head.appendChild(link);
}

/** 格式化日期 */
function formatDate(ts) {
  const d = new Date(ts);
  return d.getFullYear() + '/' +
    String(d.getMonth() + 1).padStart(2, '0') + '/' +
    String(d.getDate()).padStart(2, '0') + ' ' +
    String(d.getHours()).padStart(2, '0') + ':' +
    String(d.getMinutes()).padStart(2, '0');
}

export class FileManagerApp {
  /**
   * @param {Object} app - 应用信息
   * @param {HTMLElement} modal - 模态框容器
   */
  constructor(app, modal) {
    _ensureCss();
    this._app = app;
    this._modal = modal;
    this._currentPath = ''; // 相对于 AstroKnot-Data 的路径
    this._history = [''];
    this._historyIndex = 0;
    this._clipboard = null; // { action: 'copy'|'cut', items: [{name, type}] }
    this._viewMode = 'icon'; // 'icon' | 'list'
    this._selectedItems = new Set();
    this._dirTreeCache = {};
    this._lastClickedItem = null; // 用于 Shift+点击范围选择
    this._selectionBox = null; // 拖拽选框元素
    this._isSelecting = false; // 是否正在拖拽选框

    this._buildUI();
    this._bindEvents();

    // 将内容挂载到 modal（modal 需由调用方 AppRunner 挂载到 document.body）
    this._modal.appendChild(this._content);

    this._loadDirTree();
    this._navigateTo('');
  }

  get content() { return this._content; }
  get header() { return this._header; }

  // ════════════════════════════════════════════════════════════
  //  构建 DOM
  // ════════════════════════════════════════════════════════════

  _buildUI() {
    const content = document.createElement('div');
    content.className = 'rich-modal-content app-runner-content file-manager-content';
    this._content = content;

    // 标题栏
    const headerEl = document.createElement('div');
    headerEl.className = 'rich-modal-header';
    headerEl.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px; flex:1;">
        <span class="caption-icon">💾</span>
        <h2 class="app-runner-title">此 AstroKnot</h2>
      </div>
      <div class="caption-btns">
        <button class="caption-btn app-runner-min" title="最小化">⚊</button>
        <button class="caption-btn app-runner-max" title="窗口化">❐</button>
        <button class="caption-btn app-runner-close" title="关闭">✕</button>
      </div>
    `;
    this._header = headerEl;
    content.appendChild(headerEl);

    // 工具栏
    const toolbar = document.createElement('div');
    toolbar.className = 'fm-toolbar';
    toolbar.innerHTML = `
      <div class="fm-nav-btns">
        <button class="fm-btn" id="fmBackBtn" title="后退" disabled>◀</button>
        <button class="fm-btn" id="fmForwardBtn" title="前进" disabled>▶</button>
        <button class="fm-btn" id="fmUpBtn" title="上级目录">▲</button>
      </div>
      <div class="fm-address-bar">
        <span class="fm-address-root" title="AstroKnot-Data 根目录">💾 此 AstroKnot</span>
        <div class="fm-breadcrumb" id="fmBreadcrumb"></div>
      </div>
      <div class="fm-toolbar-right">
        <button class="fm-btn" id="fmViewToggle" title="切换视图">⊞</button>
        <button class="fm-btn" id="fmRefreshBtn" title="刷新">🔄</button>
      </div>
    `;
    content.appendChild(toolbar);

    // 主体区域
    const body = document.createElement('div');
    body.className = 'fm-body';

    // 侧边栏 - 目录树
    const sidebar = document.createElement('div');
    sidebar.className = 'fm-sidebar';
    sidebar.id = 'fmSidebar';
    sidebar.innerHTML = `
      <div class="fm-sidebar-header">
        <span>📂 目录</span>
      </div>
      <div class="fm-tree" id="fmDirTree"></div>
    `;
    body.appendChild(sidebar);

    // 侧边栏拖拽分隔条
    const resizer = document.createElement('div');
    resizer.className = 'fm-sidebar-resizer';
    resizer.id = 'fmSidebarResizer';
    body.appendChild(resizer);

    // 主内容区
    const main = document.createElement('div');
    main.className = 'fm-main';

    // 文件列表区域
    const fileList = document.createElement('div');
    fileList.className = 'fm-file-list';
    fileList.id = 'fmFileList';
    main.appendChild(fileList);

    // 预览面板
    const preview = document.createElement('div');
    preview.className = 'fm-preview';
    preview.id = 'fmPreview';
    preview.style.display = 'none';
    main.appendChild(preview);

    body.appendChild(main);
    content.appendChild(body);

    // 状态栏
    const statusBar = document.createElement('div');
    statusBar.className = 'fm-status-bar';
    statusBar.id = 'fmStatusBar';
    content.appendChild(statusBar);
  }

  // ════════════════════════════════════════════════════════════
  //  事件绑定
  // ════════════════════════════════════════════════════════════

  _bindEvents() {
    // 导航按钮
    this._header.querySelector('.app-runner-min').addEventListener('click', () => this._onMinimize?.());
    this._header.querySelector('.app-runner-max').addEventListener('click', () => this._onMaximize?.());
    this._header.querySelector('.app-runner-close').addEventListener('click', () => this._onClose?.());

    this._content.querySelector('#fmBackBtn').addEventListener('click', () => this._goBack());
    this._content.querySelector('#fmForwardBtn').addEventListener('click', () => this._goForward());
    this._content.querySelector('#fmUpBtn').addEventListener('click', () => this._goUp());
    this._content.querySelector('#fmViewToggle').addEventListener('click', () => this._toggleView());
    this._content.querySelector('#fmRefreshBtn').addEventListener('click', () => this._refresh());

    // 地址栏根目录点击
    this._content.querySelector('.fm-address-root').addEventListener('click', () => this._navigateTo(''));

    // 文件列表点击/双击
    const fileList = this._content.querySelector('#fmFileList');
    fileList.addEventListener('click', (e) => this._onFileListClick(e));
    fileList.addEventListener('dblclick', (e) => this._onFileListDblClick(e));
    fileList.addEventListener('contextmenu', (e) => this._onFileListContextMenu(e));

    // 侧边栏点击
    const dirTree = this._content.querySelector('#fmDirTree');
    dirTree.addEventListener('click', (e) => this._onTreeClick(e));
    dirTree.addEventListener('contextmenu', (e) => this._onTreeContextMenu(e));

    // 侧边栏拖拽调宽
    this._bindSidebarResize();

    // 键盘快捷键
    this._content.setAttribute('tabindex', '-1');
    this._content.addEventListener('keydown', (e) => this._onKeyDown(e));

    // 点击空白取消选中
    fileList.addEventListener('click', (e) => {
      if (e.target === fileList) {
        this._selectedItems.clear();
        this._updateSelectionUI();
        this._hidePreview();
      }
    });

    // 拖拽框选
    fileList.addEventListener('mousedown', (e) => this._onSelectionStart(e));
    document.addEventListener('mousemove', (e) => this._onSelectionMove(e));
    document.addEventListener('mouseup', (e) => this._onSelectionEnd(e));
  }

  // ════════════════════════════════════════════════════════════
  //  导航
  // ════════════════════════════════════════════════════════════

  async _navigateTo(relPath) {
    this._currentPath = relPath || '';
    this._selectedItems.clear();
    this._hidePreview();

    // 更新历史
    if (this._history[this._historyIndex] !== relPath) {
      this._history = this._history.slice(0, this._historyIndex + 1);
      this._history.push(relPath);
      this._historyIndex = this._history.length - 1;
    }

    this._updateNavButtons();
    this._updateBreadcrumb();
    this._updateTreeHighlight();
    await this._loadFileList();
  }

  _goBack() {
    if (this._historyIndex > 0) {
      this._historyIndex--;
      this._navigateTo(this._history[this._historyIndex]);
    }
  }

  _goForward() {
    if (this._historyIndex < this._history.length - 1) {
      this._historyIndex++;
      this._navigateTo(this._history[this._historyIndex]);
    }
  }

  _goUp() {
    if (!this._currentPath) return;
    const parts = this._currentPath.split(/[/\\]/);
    parts.pop();
    this._navigateTo(parts.join('/'));
  }

  _updateNavButtons() {
    const backBtn = this._content.querySelector('#fmBackBtn');
    const fwdBtn = this._content.querySelector('#fmForwardBtn');
    const upBtn = this._content.querySelector('#fmUpBtn');
    backBtn.disabled = this._historyIndex <= 0;
    fwdBtn.disabled = this._historyIndex >= this._history.length - 1;
    upBtn.disabled = !this._currentPath;
  }

  _updateBreadcrumb() {
    const bc = this._content.querySelector('#fmBreadcrumb');
    bc.innerHTML = '';
    if (!this._currentPath) return;

    const parts = this._currentPath.split(/[/\\]/);
    parts.forEach((part, i) => {
      if (i > 0) {
        const sep = document.createElement('span');
        sep.className = 'fm-bc-sep';
        sep.textContent = '›';
        bc.appendChild(sep);
      }
      const crumb = document.createElement('span');
      crumb.className = 'fm-bc-item';
      crumb.textContent = part;
      const crumbPath = parts.slice(0, i + 1).join('/');
      crumb.addEventListener('click', () => this._navigateTo(crumbPath));
      bc.appendChild(crumb);
    });
  }

  _refresh() {
    this._loadDirTree();
    this._loadFileList();
  }

  // ════════════════════════════════════════════════════════════
  //  文件列表
  // ════════════════════════════════════════════════════════════

  async _loadFileList() {
    const fileList = this._content.querySelector('#fmFileList');
    fileList.innerHTML = '<div class="fm-loading">加载中...</div>';

    try {
      const items = await window.api.fmReadDir(this._currentPath);
      this._renderFileList(items);
      this._updateStatusBar(items);
    } catch (e) {
      fileList.innerHTML = `<div class="fm-error">读取失败: ${e.message}</div>`;
    }
  }

  _renderFileList(items) {
    const fileList = this._content.querySelector('#fmFileList');
    fileList.innerHTML = '';
    fileList.className = 'fm-file-list fm-view-' + this._viewMode;

    if (items.length === 0) {
      fileList.innerHTML = '<div class="fm-empty">此文件夹为空</div>';
      return;
    }

    // 排序：文件夹在前，然后按名称
    items.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    for (const item of items) {
      const el = document.createElement('div');
      const itemRelPath = this._currentPath ? this._currentPath + '/' + item.name : item.name;
      const dimmed = isUnderSystem(itemRelPath) ? ' fm-item-dimmed' : '';
      el.className = 'fm-item' + dimmed + (this._selectedItems.has(item.name) ? ' selected' : '');
      el.dataset.name = item.name;
      el.dataset.type = item.type;

      const icon = item.type === 'directory'
        ? getFolderIconSVG(false)
        : getFileIconSVG(item.name);

      if (this._viewMode === 'icon') {
        el.innerHTML = `
          <div class="fm-item-icon">${icon}</div>
          <div class="fm-item-name" title="${item.name}">${item.name}</div>
        `;
      } else {
        el.innerHTML = `
          <div class="fm-item-icon">${icon}</div>
          <div class="fm-item-name" title="${item.name}">${item.name}</div>
          <div class="fm-item-size">${item.type === 'file' ? formatSize(item.size) : ''}</div>
          <div class="fm-item-date">${formatDate(item.mtime)}</div>
          <div class="fm-item-type">${item.type === 'directory' ? '文件夹' : this._getFileTypeName(item.name)}</div>
        `;
      }
      fileList.appendChild(el);
    }
  }

  _getFileTypeName(name) {
    const ext = name.split('.').pop().toLowerCase();
    const map = {
      json: 'JSON 文件', js: 'JavaScript', ts: 'TypeScript', html: 'HTML 文件',
      css: 'CSS 文件', md: 'Markdown', txt: '文本文件', png: 'PNG 图片',
      jpg: 'JPEG 图片', gif: 'GIF 图片', svg: 'SVG 图片', webp: 'WebP 图片',
      mp3: 'MP3 音频', mp4: 'MP4 视频', pdf: 'PDF 文档', zip: 'ZIP 压缩包',
    };
    return map[ext] || ext.toUpperCase() + ' 文件';
  }

  _updateStatusBar(items) {
    const bar = this._content.querySelector('#fmStatusBar');
    const dirs = items.filter(i => i.type === 'directory').length;
    const files = items.filter(i => i.type === 'file').length;
    const totalSize = items.reduce((s, i) => s + (i.size || 0), 0);
    bar.textContent = `${dirs} 个文件夹，${files} 个文件` + (totalSize ? `，共 ${formatSize(totalSize)}` : '');
  }

  // ════════════════════════════════════════════════════════════
  //  文件列表交互
  // ════════════════════════════════════════════════════════════

  _onFileListClick(e) {
    const item = e.target.closest('.fm-item');
    if (!item) return;

    const name = item.dataset.name;

    if (e.shiftKey && this._lastClickedItem) {
      // Shift+点击：范围选择
      this._selectRange(this._lastClickedItem, name);
    } else if (e.ctrlKey || e.metaKey) {
      // 多选
      if (this._selectedItems.has(name)) {
        this._selectedItems.delete(name);
      } else {
        this._selectedItems.add(name);
      }
      this._lastClickedItem = name;
    } else {
      this._selectedItems.clear();
      this._selectedItems.add(name);
      this._lastClickedItem = name;
    }

    this._updateSelectionUI();
    this._showPreview(name, item.dataset.type);
  }

  /** 范围选择：选中从 lastItem 到 currentItem 之间的所有项 */
  _selectRange(lastItem, currentItem) {
    const fileList = this._content.querySelector('#fmFileList');
    const items = Array.from(fileList.querySelectorAll('.fm-item'));
    const lastIndex = items.findIndex(el => el.dataset.name === lastItem);
    const currentIndex = items.findIndex(el => el.dataset.name === currentItem);

    if (lastIndex === -1 || currentIndex === -1) return;

    const start = Math.min(lastIndex, currentIndex);
    const end = Math.max(lastIndex, currentIndex);

    for (let i = start; i <= end; i++) {
      this._selectedItems.add(items[i].dataset.name);
    }
  }

  _onFileListDblClick(e) {
    const item = e.target.closest('.fm-item');
    if (!item) return;

    const name = item.dataset.name;
    const type = item.dataset.type;

    if (type === 'directory') {
      const newPath = this._currentPath ? this._currentPath + '/' + name : name;
      this._navigateTo(newPath);
    } else {
      this._openFile(name);
    }
  }

  async _onFileListContextMenu(e) {
    e.preventDefault();
    const item = e.target.closest('.fm-item');
    if (!item) {
      this._showContextMenu(e.clientX, e.clientY, [
        { label: '📁 新建文件夹', action: () => this._newFolder() },
        { label: '📄 新建文件', action: () => this._newFile() },
        { type: 'separator' },
        { label: '📋 粘贴', action: () => this._paste(), disabled: !this._clipboard },
        { type: 'separator' },
        { label: '🔄 刷新', action: () => this._refresh() },
      ]);
      return;
    }

    const name = item.dataset.name;
    const type = item.dataset.type;
    if (!this._selectedItems.has(name)) {
      this._selectedItems.clear();
      this._selectedItems.add(name);
      this._updateSelectionUI();
    }

    const count = this._selectedItems.size;
    const isMulti = count > 1;
    const itemRelPath = this._currentPath ? this._currentPath + '/' + name : name;

    const menuItems = [
      { label: '📂 打开', action: () => type === 'directory' ? this._navigateTo(itemRelPath) : this._openFile(name), disabled: isMulti },
      { label: '💻 通过 IDE 打开', action: () => this._openInIDE(itemRelPath, type), disabled: isMulti },
    ];

    if (type === 'directory' && !isMulti) {
      const projectInfo = await this._detectProject(itemRelPath);
      if (projectInfo) {
        menuItems.push({ label: '🚀 打开该AstroKnot项目', action: () => this._openAsProject(itemRelPath, projectInfo) });
      }
      const nodeInfo = await this._detectNodeFolder(itemRelPath);
      if (nodeInfo) {
        menuItems.push({ label: '📝 打开该节点', action: () => this._openNode(nodeInfo) });
      }
    }

    menuItems.push(
      { type: 'separator' },
      { label: '📁 打开文件所在位置', action: () => this._openInExplorer(itemRelPath), disabled: isMulti },
      { label: '📋 复制' + (isMulti ? ` (${count} 项)` : ''), action: () => this._copy() },
      { label: '✂ 剪切' + (isMulti ? ` (${count} 项)` : ''), action: () => this._cut() },
      { label: '📋 粘贴', action: () => this._paste(), disabled: !this._clipboard },
      { type: 'separator' },
      { label: '✏ 重命名', action: () => this._renameItem(name, type), disabled: isMulti },
      { label: '🗑 删除' + (isMulti ? ` (${count} 项)` : ''), action: () => isMulti ? this._deleteSelected() : this._deleteItem(name, type) },
      { type: 'separator' },
      { label: '📋 复制路径', action: () => this._copyPath(itemRelPath), disabled: isMulti },
    );

    this._showContextMenu(e.clientX, e.clientY, menuItems);
  }

  _updateSelectionUI() {
    const items = this._content.querySelectorAll('.fm-item');
    items.forEach(el => {
      el.classList.toggle('selected', this._selectedItems.has(el.dataset.name));
    });
  }

  // ════════════════════════════════════════════════════════════
  //  视图切换
  // ════════════════════════════════════════════════════════════

  _toggleView() {
    this._viewMode = this._viewMode === 'icon' ? 'list' : 'icon';
    const btn = this._content.querySelector('#fmViewToggle');
    btn.textContent = this._viewMode === 'icon' ? '⊞' : '☰';
    this._loadFileList();
  }

  // ════════════════════════════════════════════════════════════
  //  键盘快捷键
  // ════════════════════════════════════════════════════════════

  _onKeyDown(e) {
    if (e.key === 'Delete') {
      this._deleteSelected();
    } else if (e.key === 'F2') {
      const [name] = this._selectedItems;
      if (name) {
        const el = this._content.querySelector(`.fm-item[data-name="${CSS.escape(name)}"]`);
        if (el) this._renameItem(name, el.dataset.type);
      }
    } else if (e.key === 'F5') {
      this._refresh();
    } else if (e.ctrlKey && e.key === 'c') {
      this._copy();
    } else if (e.ctrlKey && e.key === 'x') {
      this._cut();
    } else if (e.ctrlKey && e.key === 'v') {
      this._paste();
    } else if (e.key === 'Backspace') {
      this._goUp();
    }
  }

  // ════════════════════════════════════════════════════════════
  //  销毁
  // ════════════════════════════════════════════════════════════

  destroy() {
    this._hideContextMenu();
    this._hidePreview();
    if (this._selectionBox) {
      this._selectionBox.remove();
      this._selectionBox = null;
    }
  }
}

// ── 功能块混入：目录树 / 打开集成 / 文件操作 / 预览 / 框选 / UI 小件 ──
// 方法体使用 this 访问实例状态，原型混入与写在 class 体内完全等价
Object.assign(FileManagerApp.prototype, treeMethods, openMethods, fileOpsMethods, previewMethods, selectionMethods, uiWidgetMethods);
