// ============================================================
//  sandbox-file-tree.js — 文件树 UI 组件
//  左侧可交互的文件目录树，支持展开/折叠、右键菜单、内联重命名
// ============================================================

import { extensionToLanguage } from './sandbox-virtual-fs.js';

export class FileTreeComponent {
  /**
   * @param {HTMLElement} containerEl - 文件树容器
   * @param {VirtualFileSystem} vfs - 虚拟文件系统实例
   * @param {Object} callbacks - 回调函数集合
   * @param {Function} callbacks.onFileSelect - 选中文件回调 (filePath)
   * @param {Function} callbacks.onFileDelete - 删除文件/目录回调 (filePath, isDirectory)
   * @param {Function} callbacks.onFileRename - 重命名回调 (oldPath, newName)
   * @param {Function} callbacks.onFileCreate - 新建文件回调 (dirPath, name, type)
   * @param {Function} callbacks.onFileMove - 移动文件回调 (fromPath, toDirPath)
   */
  constructor(containerEl, vfs, callbacks) {
    this._container = containerEl;
    this._vfs = vfs;
    this._onFileSelect = callbacks.onFileSelect || function () {};
    this._onFileDelete = callbacks.onFileDelete || function () {};
    this._onFileRename = callbacks.onFileRename || function () {};
    this._onFileCreate = callbacks.onFileCreate || function () {};
    this._onFileMove = callbacks.onFileMove || function () {};

    this._activePath = null;
    this._ctxMenu = null;

    this._container.classList.add('sandbox-file-tree');
    this._initContextMenu();
  }

  // ── 公共 API ──

  render() {
    this._container.innerHTML = '';

    // 头部
    const header = document.createElement('div');
    header.className = 'file-tree-header';
    header.innerHTML = '<span>📁 文件浏览器</span><button class="new-file-btn" title="新建文件">+</button>';
    this._container.appendChild(header);

    // 新建按钮
    const newBtn = header.querySelector('.new-file-btn');
    newBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._showCreateInput('', 'file');
    });

    // 树体
    const body = document.createElement('div');
    body.className = 'file-tree-body';

    // 从根目录递归渲染
    const rootChildren = this._vfs.listDirectory('');
    for (const entry of rootChildren) {
      const el = this._renderEntry(entry, 0);
      if (el) body.appendChild(el);
    }

    this._container.appendChild(body);
  }

  setActive(path) {
    this._activePath = path;
    // 更新高亮
    this._container.querySelectorAll('.tree-item').forEach(el => {
      el.classList.toggle('active', el.dataset.path === path);
    });
  }

  refresh() {
    this.render();
    this.setActive(this._activePath);
  }

  destroy() {
    if (this._ctxMenu) {
      this._ctxMenu.remove();
      this._ctxMenu = null;
    }
    this._container.innerHTML = '';
  }

  // ── 渲染条目 ──

  _renderEntry(entry, depth) {
    if (entry.isDirectory) {
      return this._renderDirectory(entry.path, depth);
    } else {
      return this._renderFile(entry.path, depth);
    }
  }

  _renderDirectory(dirPath, depth) {
    const wrapper = document.createElement('div');
    wrapper.className = 'tree-dir-wrapper';
    wrapper.dataset.path = dirPath;

    const isExpanded = this._vfs.isExpanded(dirPath);

    // 目录行
    const item = document.createElement('div');
    item.className = 'tree-item tree-dir';
    item.dataset.path = dirPath;
    item.style.paddingLeft = (depth * 16 + 8) + 'px';

    const arrow = document.createElement('span');
    arrow.className = 'tree-arrow';
    arrow.textContent = isExpanded ? '▾' : '▸';

    const icon = document.createElement('span');
    icon.className = 'tree-icon';
    icon.textContent = isExpanded ? '📂' : '📁';

    const name = document.createElement('span');
    name.className = 'tree-name';
    name.textContent = dirPath.split('/').pop();

    item.appendChild(arrow);
    item.appendChild(icon);
    item.appendChild(name);
    wrapper.appendChild(item);

    // 点击展开/折叠
    item.addEventListener('click', () => {
      this._vfs.toggleExpanded(dirPath);
      this.refresh();
    });

    // 右键菜单
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._showContextMenu(e, dirPath, true);
    });

    // 子条目
    if (isExpanded) {
      const children = this._vfs.listDirectory(dirPath);
      for (const child of children) {
        const el = this._renderEntry(child, depth + 1);
        if (el) wrapper.appendChild(el);
      }
    }

    return wrapper;
  }

  _renderFile(filePath, depth) {
    const item = document.createElement('div');
    item.className = 'tree-item tree-file';
    item.dataset.path = filePath;
    item.style.paddingLeft = (depth * 16 + 24) + 'px';

    if (filePath === this._activePath) {
      item.classList.add('active');
    }

    const icon = document.createElement('span');
    icon.className = 'tree-icon';
    icon.textContent = this._getFileIcon(filePath);

    const name = document.createElement('span');
    name.className = 'tree-name';
    name.textContent = filePath.split('/').pop();

    item.appendChild(icon);
    item.appendChild(name);

    // 点击选中
    item.addEventListener('click', () => {
      this._activePath = filePath;
      this._onFileSelect(filePath);
      this.setActive(filePath);
    });

    // 双击重命名
    item.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._startRename(filePath, item, depth);
    });

    // 右键菜单
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._showContextMenu(e, filePath, false);
    });

    return item;
  }

  _getFileIcon(filePath) {
    const ext = filePath.split('.').pop().toLowerCase();
    const iconMap = {
      'html': '🌐', 'htm': '🌐',
      'css': '🎨', 'scss': '🎨', 'less': '🎨',
      'js': '⚡', 'mjs': '⚡', 'cjs': '⚡',
      'ts': '🔷', 'tsx': '🔷',
      'jsx': '⚛️',
      'json': '📋',
      'md': '📝',
      'py': '🐍',
      'svg': '🖼️',
      'txt': '📄',
      'png': '🖼️', 'jpg': '🖼️', 'jpeg': '🖼️', 'gif': '🖼️', 'webp': '🖼️',
    };
    return iconMap[ext] || '📄';
  }

  // ── 右键菜单 ──

  _initContextMenu() {
    if (this._ctxMenu) return;
    this._ctxMenu = document.createElement('div');
    this._ctxMenu.className = 'file-tree-ctx-menu';
    this._ctxMenu.style.display = 'none';
    document.body.appendChild(this._ctxMenu);

    // 点击外部关闭
    document.addEventListener('click', () => {
      this._hideContextMenu();
    });
  }

  _showContextMenu(e, path, isDirectory) {
    this._ctxMenuTarget = { path, isDirectory };

    let items = '';
    if (isDirectory) {
      items = `
        <button data-action="new-file">📄 新建文件</button>
        <button data-action="new-dir">📁 新建文件夹</button>
        <div class="ctx-sep"></div>
        <button data-action="rename">✏️ 重命名</button>
        <button data-action="delete" class="ctx-danger">🗑️ 删除</button>
      `;
    } else {
      items = `
        <button data-action="rename">✏️ 重命名</button>
        <button data-action="delete" class="ctx-danger">🗑️ 删除</button>
      `;
    }
    this._ctxMenu.innerHTML = items;
    this._ctxMenu.style.display = 'flex';

    // 定位
    const menuW = this._ctxMenu.offsetWidth || 160;
    const menuH = this._ctxMenu.offsetHeight || 120;
    let left = e.clientX;
    let top = e.clientY;
    if (left + menuW > window.innerWidth - 8) left = window.innerWidth - 8 - menuW;
    if (top + menuH > window.innerHeight - 8) top = window.innerHeight - 8 - menuH;
    this._ctxMenu.style.left = left + 'px';
    this._ctxMenu.style.top = top + 'px';

    // 事件
    this._ctxMenu.onclick = (ev) => {
      const btn = ev.target.closest('button');
      if (!btn) return;
      const action = btn.dataset.action;
      this._hideContextMenu();
      this._handleContextAction(action, path, isDirectory);
    };
  }

  _hideContextMenu() {
    if (this._ctxMenu) {
      this._ctxMenu.style.display = 'none';
    }
  }

  _handleContextAction(action, path, isDirectory) {
    switch (action) {
      case 'new-file':
        this._showCreateInput(path, 'file');
        break;
      case 'new-dir':
        this._showCreateInput(path, 'directory');
        break;
      case 'rename': {
        const itemEl = this._container.querySelector(`[data-path="${path}"]`);
        if (itemEl) {
          const depth = Math.max(0, Math.floor((parseInt(itemEl.style.paddingLeft) - 8) / 16));
          this._startRename(path, itemEl, depth);
        }
        break;
      }
      case 'delete':
        this._onFileDelete(path, isDirectory);
        break;
    }
  }

  // ── 内联创建 ──

  _showCreateInput(dirPath, type) {
    // 展开目录
    if (type === 'file' && dirPath && !this._vfs.isExpanded(dirPath)) {
      this._vfs.toggleExpanded(dirPath);
    }

    this.refresh();

    // 找到目标目录的 wrapper 或根 body
    const body = this._container.querySelector('.file-tree-body');
    if (!body) return;

    const inputWrapper = document.createElement('div');
    inputWrapper.className = 'tree-create-input-wrapper';

    const depth = dirPath ? dirPath.split('/').length : 0;
    inputWrapper.style.paddingLeft = (depth * 16 + 24) + 'px';

    const icon = document.createElement('span');
    icon.className = 'tree-icon';
    icon.textContent = type === 'file' ? '📄' : '📁';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tree-create-input';
    input.placeholder = type === 'file' ? '文件名（如 app.js）' : '文件夹名';

    inputWrapper.appendChild(icon);
    inputWrapper.appendChild(input);

    // 插入到合适的位置
    if (dirPath) {
      const dirWrapper = body.querySelector(`[data-path="${dirPath}"]`);
      if (dirWrapper && dirWrapper.classList.contains('tree-dir-wrapper')) {
        // 在目录子元素末尾插入
        dirWrapper.appendChild(inputWrapper);
      } else {
        body.appendChild(inputWrapper);
      }
    } else {
      body.insertBefore(inputWrapper, body.firstChild);
    }

    input.focus();

    const finish = (save) => {
      const name = input.value.trim();
      if (save && name) {
        this._onFileCreate(dirPath, name, type);
      }
      inputWrapper.remove();
      this.refresh();
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });

    input.addEventListener('blur', () => finish(true));
  }

  // ── 内联重命名 ──

  _startRename(path, itemEl, depth) {
    const nameEl = itemEl.querySelector('.tree-name');
    if (!nameEl) return;

    const oldName = nameEl.textContent;
    nameEl.textContent = '';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tree-rename-input';
    input.value = oldName;

    nameEl.appendChild(input);
    input.focus();
    // 选中不含扩展名的部分
    const dotIdx = oldName.lastIndexOf('.');
    if (dotIdx > 0) {
      input.setSelectionRange(0, dotIdx);
    } else {
      input.select();
    }

    const finish = (save) => {
      const newName = input.value.trim();
      if (save && newName && newName !== oldName) {
        this._onFileRename(path, newName);
      } else {
        nameEl.textContent = oldName;
      }
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });

    input.addEventListener('blur', () => finish(true));
  }
}

console.log('[sandbox-file-tree] 模块已加载');
