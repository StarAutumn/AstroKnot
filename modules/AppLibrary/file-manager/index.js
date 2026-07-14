// ============================================================
//  file-manager/index.js — "此 AstroKnot" 文件管理器主入口
//  类似 Windows "此电脑"，管理 AstroKnot-Data 目录
//  功能：目录树、文件列表、面包屑导航、右键菜单、文件预览
// ============================================================

import { getFileIconSVG, getFolderIconSVG } from '../ide/core/file-icons.js';

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

/** 格式化文件大小 */
function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
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
      <span class="caption-icon">💾</span>
      <h2 class="app-runner-title">此 AstroKnot</h2>
      <div class="caption-btns">
        <button class="caption-btn app-runner-min" title="最小化">🗕</button>
        <button class="caption-btn app-runner-max" title="最大化/还原">🗔</button>
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
  }

  // ════════════════════════════════════════════════════════════
  //  目录树
  // ════════════════════════════════════════════════════════════

  async _loadDirTree() {
    try {
      const tree = await window.api.fmReadDirTree();
      this._dirTreeCache = tree;
      this._renderDirTree();
    } catch (e) {
      console.error('[FileManager] 加载目录树失败:', e);
    }
  }

  _renderDirTree() {
    const container = this._content.querySelector('#fmDirTree');
    container.innerHTML = '';
    this._renderTreeNode(container, this._dirTreeCache, '', 0);
  }

  _renderTreeNode(container, node, nodePath, depth) {
    if (!node) return;
    const hasChildren = node.children && Object.keys(node.children).length > 0;

    const item = document.createElement('div');
    item.className = 'fm-tree-item' + (nodePath === this._currentPath ? ' active' : '');
    item.dataset.path = nodePath;
    item.dataset.depth = depth;
    // 缩进
    item.style.paddingLeft = (12 + depth * 14) + 'px';

    // 展开/折叠箭头
    const arrow = document.createElement('span');
    arrow.className = 'fm-tree-arrow' + (hasChildren ? '' : ' fm-tree-arrow-hidden');
    arrow.innerHTML = '▶';
    item.appendChild(arrow);

    // 文件夹图标
    const iconWrap = document.createElement('span');
    iconWrap.className = 'fm-tree-icon';
    iconWrap.innerHTML = getFolderIconSVG(false);
    item.appendChild(iconWrap);

    // 名称
    const nameEl = document.createElement('span');
    nameEl.className = 'fm-tree-name';
    nameEl.textContent = nodePath === '' ? 'AstroKnot-Data' : nodePath.split(/[/\\]/).pop();
    item.appendChild(nameEl);

    container.appendChild(item);

    if (hasChildren) {
      const childContainer = document.createElement('div');
      childContainer.className = 'fm-tree-children fm-tree-collapsed';
      // 按名称排序
      const entries = Object.entries(node.children).sort((a, b) => a[0].localeCompare(b[0]));
      for (const [childName, childNode] of entries) {
        const childPath = nodePath ? nodePath + '/' + childName : childName;
        this._renderTreeNode(childContainer, childNode, childPath, depth + 1);
      }
      container.appendChild(childContainer);
    }
  }

  _onTreeClick(e) {
    const item = e.target.closest('.fm-tree-item');
    if (!item) return;
    const path = item.dataset.path;

    // 判断是否点击了箭头
    const arrow = item.querySelector('.fm-tree-arrow');
    const clickedArrow = e.target === arrow || e.target.closest('.fm-tree-arrow');
    const childContainer = item.nextElementSibling;

    if (clickedArrow) {
      // 点击箭头：仅切换折叠/展开，不导航
      if (childContainer && childContainer.classList.contains('fm-tree-children')) {
        const isCollapsed = childContainer.classList.contains('fm-tree-collapsed');
        childContainer.classList.toggle('fm-tree-collapsed', !isCollapsed);
        arrow.textContent = isCollapsed ? '▼' : '▶';
        const iconWrap = item.querySelector('.fm-tree-icon');
        if (iconWrap) iconWrap.innerHTML = getFolderIconSVG(isCollapsed);
      }
    } else {
      // 点击文件夹名称：导航到该目录，并自动展开
      if (childContainer && childContainer.classList.contains('fm-tree-children')) {
        const isCollapsed = childContainer.classList.contains('fm-tree-collapsed');
        if (isCollapsed) {
          childContainer.classList.remove('fm-tree-collapsed');
          arrow.textContent = '▼';
          const iconWrap = item.querySelector('.fm-tree-icon');
          if (iconWrap) iconWrap.innerHTML = getFolderIconSVG(true);
        }
      }
      this._navigateTo(path);
    }
  }

  _onTreeContextMenu(e) {
    e.preventDefault();
    const item = e.target.closest('.fm-tree-item');
    if (!item) return;
    const path = item.dataset.path;
    this._showContextMenu(e.clientX, e.clientY, [
      { label: '📂 打开', action: () => this._navigateTo(path) },
      { type: 'separator' },
      { label: '📋 复制路径', action: () => this._copyPath(path) },
      { label: '🗑 删除文件夹', action: () => this._deleteItem(path, 'directory') },
      { label: '✏ 重命名', action: () => this._renameItem(path, 'directory') },
    ]);
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

  _updateTreeHighlight() {
    const items = this._content.querySelectorAll('.fm-tree-item');
    items.forEach(item => {
      item.classList.toggle('active', item.dataset.path === this._currentPath);
    });

    // 自动展开当前路径上的所有父级
    if (this._currentPath) {
      this._expandToPath(this._currentPath);
    }
  }

  /** 展开到指定路径（逐级展开所有父级） */
  _expandToPath(targetPath) {
    const parts = targetPath.split(/[/\\]/);
    // 逐级构建路径，展开每一级
    for (let i = 0; i < parts.length; i++) {
      const parentPath = parts.slice(0, i).join('/');
      const item = this._content.querySelector(`.fm-tree-item[data-path="${CSS.escape(parentPath)}"]`);
      if (!item) continue;
      const childContainer = item.nextElementSibling;
      if (childContainer && childContainer.classList.contains('fm-tree-children') && childContainer.classList.contains('fm-tree-collapsed')) {
        childContainer.classList.remove('fm-tree-collapsed');
        const arrow = item.querySelector('.fm-tree-arrow');
        if (arrow) arrow.textContent = '▼';
        const iconWrap = item.querySelector('.fm-tree-icon');
        if (iconWrap) iconWrap.innerHTML = getFolderIconSVG(true);
      }
    }
    // 展开目标自身
    const targetItem = this._content.querySelector(`.fm-tree-item[data-path="${CSS.escape(targetPath)}"]`);
    if (targetItem) {
      const childContainer = targetItem.nextElementSibling;
      if (childContainer && childContainer.classList.contains('fm-tree-children') && childContainer.classList.contains('fm-tree-collapsed')) {
        childContainer.classList.remove('fm-tree-collapsed');
        const arrow = targetItem.querySelector('.fm-tree-arrow');
        if (arrow) arrow.textContent = '▼';
        const iconWrap = targetItem.querySelector('.fm-tree-icon');
        if (iconWrap) iconWrap.innerHTML = getFolderIconSVG(true);
      }
    }
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
      el.className = 'fm-item' + (this._selectedItems.has(item.name) ? ' selected' : '');
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

    if (e.ctrlKey || e.metaKey) {
      // 多选
      if (this._selectedItems.has(name)) {
        this._selectedItems.delete(name);
      } else {
        this._selectedItems.add(name);
      }
    } else {
      this._selectedItems.clear();
      this._selectedItems.add(name);
    }

    this._updateSelectionUI();
    this._showPreview(name, item.dataset.type);
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

  _onFileListContextMenu(e) {
    e.preventDefault();
    const item = e.target.closest('.fm-item');

    if (!item) {
      // 空白区域右键
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

    this._showContextMenu(e.clientX, e.clientY, [
      { label: '📂 打开', action: () => type === 'directory' ? this._navigateTo(this._currentPath ? this._currentPath + '/' + name : name) : this._openFile(name) },
      { type: 'separator' },
      { label: '📋 复制', action: () => this._copy() },
      { label: '✂ 剪切', action: () => this._cut() },
      { label: '📋 粘贴', action: () => this._paste(), disabled: !this._clipboard },
      { type: 'separator' },
      { label: '✏ 重命名', action: () => this._renameItem(name, type) },
      { label: '🗑 删除', action: () => this._deleteItem(name, type) },
      { type: 'separator' },
      { label: '📋 复制路径', action: () => this._copyPath(this._currentPath ? this._currentPath + '/' + name : name) },
    ]);
  }

  _updateSelectionUI() {
    const items = this._content.querySelectorAll('.fm-item');
    items.forEach(el => {
      el.classList.toggle('selected', this._selectedItems.has(el.dataset.name));
    });
  }

  // ════════════════════════════════════════════════════════════
  //  文件操作
  // ════════════════════════════════════════════════════════════

  async _openFile(name) {
    const relPath = this._currentPath ? this._currentPath + '/' + name : name;
    try {
      const result = await window.api.fmReadFile(relPath);
      if (result.type === 'text') {
        this._showTextPreview(name, result.content);
      } else if (result.type === 'image') {
        this._showImagePreview(name, result.dataUrl);
      } else {
        // 无法预览的文件，显示信息
        this._showInfoPreview(name, result);
      }
    } catch (e) {
      console.error('[FileManager] 打开文件失败:', e);
    }
  }

  async _newFolder() {
    const name = await this._promptInput('新建文件夹', '文件夹名称', '新建文件夹');
    if (!name) return;
    try {
      await window.api.fmCreateItem(this._currentPath, name, 'directory');
      this._refresh();
    } catch (e) {
      this._showToast('创建失败: ' + e.message, 'error');
    }
  }

  async _newFile() {
    const name = await this._promptInput('新建文件', '文件名称', '新建文件.txt');
    if (!name) return;
    try {
      await window.api.fmCreateItem(this._currentPath, name, 'file');
      this._refresh();
    } catch (e) {
      this._showToast('创建失败: ' + e.message, 'error');
    }
  }

  async _deleteItem(name, type) {
    const relPath = this._currentPath ? this._currentPath + '/' + name : name;
    const typeName = type === 'directory' ? '文件夹' : '文件';
    const confirmed = await this._showConfirm(`确定删除${typeName}「${name}」吗？`, '此操作不可撤销。');
    if (!confirmed) return;
    try {
      await window.api.fmDeleteItem(relPath);
      this._selectedItems.delete(name);
      this._refresh();
    } catch (e) {
      this._showToast('删除失败: ' + e.message, 'error');
    }
  }

  async _renameItem(name, type) {
    const newName = await this._promptInput('重命名', '新名称', name);
    if (!newName || newName === name) return;
    const relPath = this._currentPath ? this._currentPath + '/' + name : name;
    try {
      await window.api.fmRenameItem(relPath, newName);
      this._selectedItems.delete(name);
      this._selectedItems.add(newName);
      this._refresh();
    } catch (e) {
      this._showToast('重命名失败: ' + e.message, 'error');
    }
  }

  _copy() {
    this._clipboard = {
      action: 'copy',
      _srcPath: this._currentPath,
      items: Array.from(this._selectedItems).map(name => {
        const el = this._content.querySelector(`.fm-item[data-name="${CSS.escape(name)}"]`);
        return { name, type: el?.dataset.type || 'file' };
      })
    };
    this._showToast('已复制 ' + this._clipboard.items.length + ' 项');
  }

  _cut() {
    this._clipboard = {
      action: 'cut',
      _srcPath: this._currentPath,
      items: Array.from(this._selectedItems).map(name => {
        const el = this._content.querySelector(`.fm-item[data-name="${CSS.escape(name)}"]`);
        return { name, type: el?.dataset.type || 'file' };
      })
    };
    this._showToast('已剪切 ' + this._clipboard.items.length + ' 项');
  }

  async _paste() {
    if (!this._clipboard) return;
    try {
      for (const item of this._clipboard.items) {
        const srcPath = this._clipboard._srcPath
          ? this._clipboard._srcPath + '/' + item.name
          : item.name;
        await window.api.fmCopyItem(srcPath, this._currentPath, item.name, this._clipboard.action === 'cut');
      }
      if (this._clipboard.action === 'cut') {
        this._clipboard = null;
      }
      this._refresh();
    } catch (e) {
      this._showToast('粘贴失败: ' + e.message, 'error');
    }
  }

  _copyPath(relPath) {
    navigator.clipboard.writeText('AstroKnot-Data/' + relPath).then(() => {
      this._showToast('已复制路径');
    });
  }

  // ════════════════════════════════════════════════════════════
  //  预览面板
  // ════════════════════════════════════════════════════════════

  async _showPreview(name, type) {
    const preview = this._content.querySelector('#fmPreview');
    if (type === 'directory') {
      preview.style.display = 'none';
      return;
    }

    const relPath = this._currentPath ? this._currentPath + '/' + name : name;
    try {
      const result = await window.api.fmReadFile(relPath);
      preview.style.display = '';

      if (result.type === 'text') {
        preview.innerHTML = `
          <div class="fm-preview-header">
            <span class="fm-preview-title">${name}</span>
            <button class="fm-preview-close" title="关闭预览">✕</button>
          </div>
          <pre class="fm-preview-text">${this._escapeHtml(result.content?.slice(0, 5000) || '')}</pre>
          ${result.content?.length > 5000 ? '<div class="fm-preview-truncated">内容过长，仅显示前 5000 字符</div>' : ''}
        `;
      } else if (result.type === 'image') {
        preview.innerHTML = `
          <div class="fm-preview-header">
            <span class="fm-preview-title">${name}</span>
            <button class="fm-preview-close" title="关闭预览">✕</button>
          </div>
          <div class="fm-preview-image"><img src="${result.dataUrl}" alt="${name}"></div>
        `;
      } else {
        preview.style.display = 'none';
        return;
      }

      preview.querySelector('.fm-preview-close')?.addEventListener('click', () => this._hidePreview());
    } catch (e) {
      preview.style.display = 'none';
    }
  }

  _showTextPreview(name, content) {
    const preview = this._content.querySelector('#fmPreview');
    preview.style.display = '';
    preview.innerHTML = `
      <div class="fm-preview-header">
        <span class="fm-preview-title">${name}</span>
        <button class="fm-preview-close" title="关闭预览">✕</button>
      </div>
      <pre class="fm-preview-text">${this._escapeHtml(content?.slice(0, 5000) || '')}</pre>
    `;
    preview.querySelector('.fm-preview-close')?.addEventListener('click', () => this._hidePreview());
  }

  _showImagePreview(name, dataUrl) {
    const preview = this._content.querySelector('#fmPreview');
    preview.style.display = '';
    preview.innerHTML = `
      <div class="fm-preview-header">
        <span class="fm-preview-title">${name}</span>
        <button class="fm-preview-close" title="关闭预览">✕</button>
      </div>
      <div class="fm-preview-image"><img src="${dataUrl}" alt="${name}"></div>
    `;
    preview.querySelector('.fm-preview-close')?.addEventListener('click', () => this._hidePreview());
  }

  _showInfoPreview(name, info) {
    const preview = this._content.querySelector('#fmPreview');
    preview.style.display = '';
    preview.innerHTML = `
      <div class="fm-preview-header">
        <span class="fm-preview-title">${name}</span>
        <button class="fm-preview-close" title="关闭预览">✕</button>
      </div>
      <div class="fm-preview-info">
        <p>无法预览此文件类型</p>
        <p>大小: ${formatSize(info.size || 0)}</p>
      </div>
    `;
    preview.querySelector('.fm-preview-close')?.addEventListener('click', () => this._hidePreview());
  }

  _hidePreview() {
    this._content.querySelector('#fmPreview').style.display = 'none';
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
  //  侧边栏拖拽调宽
  // ════════════════════════════════════════════════════════════

  _bindSidebarResize() {
    const resizer = this._content.querySelector('#fmSidebarResizer');
    const sidebar = this._content.querySelector('#fmSidebar');
    let startX, startWidth;

    resizer.addEventListener('mousedown', (e) => {
      startX = e.clientX;
      startWidth = sidebar.offsetWidth;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      e.preventDefault();
    });

    const onMove = (e) => {
      const diff = e.clientX - startX;
      const newWidth = Math.max(120, Math.min(400, startWidth + diff));
      sidebar.style.width = newWidth + 'px';
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }

  // ════════════════════════════════════════════════════════════
  //  键盘快捷键
  // ════════════════════════════════════════════════════════════

  _onKeyDown(e) {
    if (e.key === 'Delete') {
      for (const name of this._selectedItems) {
        const el = this._content.querySelector(`.fm-item[data-name="${CSS.escape(name)}"]`);
        if (el) this._deleteItem(name, el.dataset.type);
      }
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
  //  右键菜单
  // ════════════════════════════════════════════════════════════

  _showContextMenu(x, y, items) {
    this._hideContextMenu();
    const menu = document.createElement('div');
    menu.className = 'fm-context-menu';
    for (const item of items) {
      if (item.type === 'separator') {
        const sep = document.createElement('div');
        sep.className = 'fm-menu-separator';
        menu.appendChild(sep);
      } else {
        const btn = document.createElement('div');
        btn.className = 'fm-menu-item' + (item.disabled ? ' disabled' : '');
        btn.textContent = item.label;
        if (!item.disabled) {
          btn.addEventListener('click', () => { this._hideContextMenu(); item.action(); });
        }
        menu.appendChild(btn);
      }
    }
    document.body.appendChild(menu);
    // 定位
    const rect = menu.getBoundingClientRect();
    const mx = Math.min(x, window.innerWidth - rect.width - 8);
    const my = Math.min(y, window.innerHeight - rect.height - 8);
    menu.style.left = mx + 'px';
    menu.style.top = my + 'px';
    this._contextMenu = menu;

    const close = (e) => {
      if (!menu.contains(e.target)) {
        this._hideContextMenu();
        document.removeEventListener('click', close, true);
      }
    };
    setTimeout(() => document.addEventListener('click', close, true), 0);
  }

  _hideContextMenu() {
    if (this._contextMenu) {
      this._contextMenu.remove();
      this._contextMenu = null;
    }
  }

  // ════════════════════════════════════════════════════════════
  //  对话框
  // ════════════════════════════════════════════════════════════

  _promptInput(title, label, defaultValue) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'fm-dialog-overlay';
      overlay.innerHTML = `
        <div class="fm-dialog">
          <div class="fm-dialog-title">${title}</div>
          <div class="fm-dialog-body">
            <label class="fm-dialog-label">${label}</label>
            <input class="fm-dialog-input" type="text" value="${this._escapeHtml(defaultValue || '')}">
          </div>
          <div class="fm-dialog-btns">
            <button class="fm-dialog-btn cancel">取消</button>
            <button class="fm-dialog-btn confirm">确定</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      const input = overlay.querySelector('.fm-dialog-input');
      input.focus();
      input.select();

      const close = (value) => { overlay.remove(); resolve(value); };

      overlay.querySelector('.cancel').addEventListener('click', () => close(null));
      overlay.querySelector('.confirm').addEventListener('click', () => close(input.value || null));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') close(input.value || null);
        if (e.key === 'Escape') close(null);
      });
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });
    });
  }

  _showConfirm(message, subtext) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'fm-dialog-overlay';
      overlay.innerHTML = `
        <div class="fm-dialog">
          <div class="fm-dialog-title">⚠ 确认操作</div>
          <div class="fm-dialog-body">
            <p>${message}</p>
            ${subtext ? `<p class="fm-dialog-sub">${subtext}</p>` : ''}
          </div>
          <div class="fm-dialog-btns">
            <button class="fm-dialog-btn cancel">取消</button>
            <button class="fm-dialog-btn confirm danger">确定</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      const close = (value) => { overlay.remove(); resolve(value); };

      overlay.querySelector('.cancel').addEventListener('click', () => close(false));
      overlay.querySelector('.confirm').addEventListener('click', () => close(true));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
      overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(false); });
    });
  }

  _showToast(msg, type = 'info') {
    const toast = document.createElement('div');
    toast.className = 'fm-toast' + (type === 'error' ? ' error' : '');
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  }

  _escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  // ════════════════════════════════════════════════════════════
  //  销毁
  // ════════════════════════════════════════════════════════════

  destroy() {
    this._hideContextMenu();
    this._hidePreview();
  }
}
