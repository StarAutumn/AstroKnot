// ============================================================
//  sandbox-file-tree.js — 文件树 UI 组件
//  左侧可交互的文件目录树，支持展开/折叠、右键菜单、内联重命名
// ============================================================

import { extensionToLanguage } from '../core/virtual-fs.js';
import { getFileIconSVG, getFolderIconSVG } from '../core/file-icons.js';

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
   * @param {Function} callbacks.onFileSystemChange - 文件系统变更回调（粘贴/拖拽等批量操作后触发，用于磁盘同步）
   * @param {Function} callbacks.onOpenFileLocation - 打开文件所在位置回调 (filePath)
   */
  constructor(containerEl, vfs, callbacks) {
    this._container = containerEl;
    this._vfs = vfs;
    this._onFileSelect = callbacks.onFileSelect || function () {};
    this._onFileDelete = callbacks.onFileDelete || function () {};
    this._onFileRename = callbacks.onFileRename || function () {};
    this._onFileCreate = callbacks.onFileCreate || function () {};
    this._onFileMove = callbacks.onFileMove || function () {};
    this._onFileSystemChange = callbacks.onFileSystemChange || function () {};
    this._onOpenFileLocation = callbacks.onOpenFileLocation || function () {};

    this._activePath = null;
    this._ctxMenu = null;

    // 剪贴板：{ action: 'cut'|'copy', path: string, isDirectory: boolean }
    this._clipboard = null;

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

    // 空白区域右键菜单
    body.addEventListener('contextmenu', (e) => {
      // 只在点击空白区域时触发（不在文件/文件夹项上）
      if (e.target.closest('.tree-item') || e.target.closest('.tree-dir-wrapper')) return;
      e.preventDefault();
      e.stopPropagation();
      this._showBlankContextMenu(e.clientX, e.clientY);
    });

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
    // 移除全局 click 监听器，防止泄漏
    if (this._onGlobalClick) {
      document.removeEventListener('click', this._onGlobalClick);
      this._onGlobalClick = null;
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
    icon.innerHTML = getFolderIconSVG(isExpanded);

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
    icon.innerHTML = this._getFileIcon(filePath);

    const name = document.createElement('span');
    name.className = 'tree-name';
    name.textContent = filePath.split('/').pop();

    item.appendChild(icon);
    item.appendChild(name);

    // 拖拽到编辑器打开
    item.draggable = true;
    item.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', filePath);
      e.dataTransfer.effectAllowed = 'open';
    });

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
    return getFileIconSVG(filePath);
  }

  // ── 右键菜单 ──

  _initContextMenu() {
    if (this._ctxMenu) return;
    this._ctxMenu = document.createElement('div');
    this._ctxMenu.className = 'file-tree-ctx-menu';
    this._ctxMenu.style.display = 'none';
    document.body.appendChild(this._ctxMenu);

    // 点击外部关闭（保存引用以便 destroy 时移除）
    this._onGlobalClick = () => {
      this._hideContextMenu();
    };
    document.addEventListener('click', this._onGlobalClick);
  }

  _showContextMenu(e, path, isDirectory) {
    this._ctxMenuTarget = { path, isDirectory };

    // 判断是否可以粘贴（剪贴板有内容且目标不是自身子项）
    // 注意：startsWith 不够精确（"a/b" 会匹配 "a/bc"），需要检查路径边界
    const clipPath = this._clipboard ? this._clipboard.path : '';
    const isChildOfClipboard = clipPath && (path === clipPath || path.startsWith(clipPath + '/'));
    const canPaste = this._clipboard && !isChildOfClipboard;
    const pasteLabel = this._clipboard
      ? (this._clipboard.action === 'cut' ? '📌 粘贴（剪切）' : '📌 粘贴（复制）')
      : '📌 粘贴';

    let items = '';
    if (isDirectory) {
      items = `
        <button data-action="new-file">📄 新建文件</button>
        <button data-action="new-dir">📁 新建文件夹</button>
        <div class="ctx-sep"></div>
        <button data-action="cut">✂️ 剪切</button>
        <button data-action="copy">📋 复制</button>
        <button data-action="paste" ${canPaste ? '' : 'disabled style="opacity:0.4;cursor:default;"'}>${pasteLabel}</button>
        <div class="ctx-sep"></div>
        <button data-action="rename">✏️ 重命名</button>
        <button data-action="copy-path">📎 复制路径</button>
        <button data-action="open-location">📂 打开文件所在位置</button>
        <div class="ctx-sep"></div>
        <button data-action="delete" class="ctx-danger">🗑️ 删除</button>
      `;
    } else {
      items = `
        <button data-action="cut">✂️ 剪切</button>
        <button data-action="copy">📋 复制</button>
        <div class="ctx-sep"></div>
        <button data-action="rename">✏️ 重命名</button>
        <button data-action="copy-path">📎 复制路径</button>
        <button data-action="export-file">📄 导出文件...</button>
        <button data-action="open-location">📂 打开文件所在位置</button>
        <div class="ctx-sep"></div>
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

  // ── 空白区域右键菜单 ──
  _showBlankContextMenu(x, y) {
    const canPaste = !!this._clipboard;
    const pasteLabel = this._clipboard
      ? (this._clipboard.action === 'cut' ? '📌 粘贴（剪切）' : '📌 粘贴（复制）')
      : '📌 粘贴';

    let items = `
      <button data-action="new-file">📄 新建文件</button>
      <button data-action="new-dir">📁 新建文件夹</button>
      <div class="ctx-sep"></div>
      <button data-action="paste-blank" ${canPaste ? '' : 'disabled style="opacity:0.4;cursor:default;"'}>${pasteLabel}</button>
    `;
    this._ctxMenu.innerHTML = items;
    this._ctxMenu.style.display = 'flex';

    // 定位
    const menuW = this._ctxMenu.offsetWidth || 160;
    const menuH = this._ctxMenu.offsetHeight || 100;
    let left = x;
    let top = y;
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
      if (action === 'new-file') {
        this._showCreateInput('', 'file');
      } else if (action === 'new-dir') {
        this._showCreateInput('', 'directory');
      } else if (action === 'paste-blank') {
        // 粘贴到根目录
        this._pasteToDirectory('');
      }
    };
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
        const itemEl = this._container.querySelector(`[data-path="${CSS.escape(path)}"]`);
        if (itemEl) {
          const depth = Math.max(0, Math.floor((parseInt(itemEl.style.paddingLeft) - 8) / 16));
          this._startRename(path, itemEl, depth);
        }
        break;
      }
      case 'cut':
        this._clipboard = { action: 'cut', path, isDirectory };
        if (window.showToast) window.showToast('已剪切: ' + path);
        break;
      case 'copy':
        this._clipboard = { action: 'copy', path, isDirectory };
        if (window.showToast) window.showToast('已复制: ' + path);
        break;
      case 'paste':
        this._pasteToDirectory(path);
        break;
      case 'copy-path':
        this._copyPath(path);
        break;
      case 'open-location':
        this._openFileLocation(path);
        break;
      case 'export-file':
        this._exportFile(path);
        break;
      case 'delete':
        this._onFileDelete(path, isDirectory);
        break;
    }
  }

  // ── 复制路径到剪贴板 ──
  _copyPath(path) {
    const fullPath = '/' + path;
    navigator.clipboard.writeText(fullPath).then(() => {
      if (window.showToast) window.showToast('已复制路径: ' + fullPath);
    }).catch(() => {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = fullPath;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      if (window.showToast) window.showToast('已复制路径: ' + fullPath);
    });
  }

  // ── 粘贴到目录 ──
  _pasteToDirectory(targetDirPath) {
    if (!this._clipboard) return;
    const { action, path: srcPath, isDirectory: srcIsDir } = this._clipboard;

    // 不允许粘贴到自身
    if (srcPath === targetDirPath) return;

    if (srcIsDir) {
      // 目录的剪切/复制
      const dirName = srcPath.split('/').pop();
      const newDirPath = targetDirPath ? targetDirPath + '/' + dirName : dirName;

      if (this._vfs._dirs.has(newDirPath)) {
        if (window.showToast) window.showToast('目标位置已存在同名文件夹');
        return;
      }

      if (action === 'cut') {
        // 剪切：直接移动整个目录（_moveDirectory 内部处理路径重映射）
        this._moveDirectory(srcPath, targetDirPath);
        this._clipboard = null; // 剪切后清空剪贴板
      } else {
        // 复制：复制整个目录结构
        this._copyDirectory(srcPath, targetDirPath);
      }
    } else {
      // 文件的剪切/复制
      const fileName = srcPath.split('/').pop();

      if (action === 'cut') {
        const newPath = this._vfs.move(srcPath, targetDirPath);
        if (newPath) {
          this._onFileMove(srcPath, targetDirPath);
          this._clipboard = null; // 剪切后清空剪贴板
        } else {
          if (window.showToast) window.showToast('目标位置已存在同名文件');
          return;
        }
      } else {
        // 复制文件
        const srcFile = this._vfs.getFile(srcPath);
        if (!srcFile) return;
        const newFilePath = targetDirPath ? targetDirPath + '/' + fileName : fileName;
        if (this._vfs._files.has(newFilePath)) {
          // 已存在则添加副本后缀
          const baseName = fileName.replace(/\.[^.]+$/, '');
          const ext = fileName.includes('.') ? '.' + fileName.split('.').pop() : '';
          const copyName = baseName + ' 副本' + ext;
          const copyPath = targetDirPath ? targetDirPath + '/' + copyName : copyName;
          this._vfs.createFile(targetDirPath, copyName, srcFile.language);
          const newFile = this._vfs.getFile(copyPath);
          if (newFile) {
            newFile.content = srcFile.content;
            newFile.isDirty = true;
          }
        } else {
          this._vfs.createFile(targetDirPath, fileName, srcFile.language);
          const newFile = this._vfs.getFile(newFilePath);
          if (newFile) {
            newFile.content = srcFile.content;
            newFile.isDirty = true;
          }
        }
      }
    }

    this.refresh();
    // 粘贴操作涉及批量文件/目录变更，触发文件系统变更回调以同步磁盘
    this._onFileSystemChange();
    if (window.showToast) window.showToast(action === 'cut' ? '已移动' : '已复制');
  }

  // ── 移动目录 ──
  _moveDirectory(srcDirPath, targetDirPath) {
    const dirName = srcDirPath.split('/').pop();
    const newDirPath = targetDirPath ? targetDirPath + '/' + dirName : dirName;

    if (this._vfs._dirs.has(newDirPath)) return false;

    // 收集所有子文件和子目录
    const prefix = srcDirPath + '/';
    const filesToMove = [];
    for (const [fPath, fData] of this._vfs._files) {
      if (fPath.startsWith(prefix) || fPath === srcDirPath) {
        filesToMove.push({ oldPath: fPath, data: fData });
      }
    }
    const dirsToMove = [];
    for (const dPath of this._vfs._dirs) {
      if (dPath === srcDirPath || dPath.startsWith(prefix)) {
        dirsToMove.push(dPath);
      }
    }

    // 创建新目录
    this._vfs._dirs.add(newDirPath);

    // 移动子目录
    for (const dPath of dirsToMove) {
      this._vfs._dirs.delete(dPath);
      const newPath = newDirPath + dPath.substring(srcDirPath.length);
      this._vfs._dirs.add(newPath);
      if (this._vfs._expandedDirs.has(dPath)) {
        this._vfs._expandedDirs.delete(dPath);
        this._vfs._expandedDirs.add(newPath);
      }
    }

    // 移动子文件
    for (const { oldPath, data } of filesToMove) {
      this._vfs._files.delete(oldPath);
      data.path = newDirPath + oldPath.substring(srcDirPath.length);
      this._vfs._files.set(data.path, data);
    }

    // 删除旧目录
    this._vfs._dirs.delete(srcDirPath);
    this._vfs._expandedDirs.delete(srcDirPath);

    return true;
  }

  // ── 复制目录 ──
  _copyDirectory(srcDirPath, targetDirPath) {
    const dirName = srcDirPath.split('/').pop();
    const newDirPath = targetDirPath ? targetDirPath + '/' + dirName : dirName;

    if (this._vfs._dirs.has(newDirPath)) {
      if (window.showToast) window.showToast('目标位置已存在同名文件夹');
      return;
    }

    // 收集所有子文件和子目录（先收集，后修改，避免迭代时修改 Set/Map）
    const prefix = srcDirPath + '/';

    // 创建新目录
    this._vfs._dirs.add(newDirPath);

    // 收集子目录（快照）
    const subDirs = [];
    for (const dPath of this._vfs._dirs) {
      if (dPath.startsWith(prefix)) {
        subDirs.push(dPath);
      }
    }
    // 批量添加子目录
    for (const dPath of subDirs) {
      const newPath = newDirPath + dPath.substring(srcDirPath.length);
      this._vfs._dirs.add(newPath);
    }

    // 收集子文件（快照）
    const subFiles = [];
    for (const [fPath, fData] of this._vfs._files) {
      if (fPath.startsWith(prefix)) {
        subFiles.push({ fPath, fData });
      }
    }
    // 批量复制子文件
    for (const { fPath, fData } of subFiles) {
      const newPath = newDirPath + fPath.substring(srcDirPath.length);
      // 计算文件应该放入的目标子目录
      const relPath = fPath.substring(prefix.length);
      const parentDir = relPath.includes('/') ? newDirPath + '/' + relPath.substring(0, relPath.lastIndexOf('/')) : newDirPath;
      this._vfs.createFile(parentDir, fData.name, fData.language);
      const newFile = this._vfs.getFile(newPath);
      if (newFile) {
        newFile.content = fData.content;
        newFile.isDirty = true;
      }
    }
  }

  // ── 打开文件所在位置 ──
  _openFileLocation(path) {
    // 调用外部提供的回调
    this._onOpenFileLocation(path);
  }

  // ── 导出文件到指定位置 ──
  async _exportFile(path) {
    const fileData = this._vfs.getFile(path);
    if (!fileData && !this._vfs.isDirectory(path)) {
      if (window.showToast) window.showToast('文件不存在');
      return;
    }
    const content = fileData ? fileData.content : '';
    const fileName = path.split('/').pop() || 'export';

    // 根据扩展名确定过滤器
    const ext = fileName.includes('.') ? fileName.split('.').pop() : '';
    const filterMap = {
      'html': { name: 'HTML 文件', extensions: ['html', 'htm'] },
      'css': { name: 'CSS 文件', extensions: ['css'] },
      'js': { name: 'JavaScript 文件', extensions: ['js'] },
      'json': { name: 'JSON 文件', extensions: ['json'] },
      'md': { name: 'Markdown 文件', extensions: ['md'] },
      'py': { name: 'Python 文件', extensions: ['py'] },
      'ts': { name: 'TypeScript 文件', extensions: ['ts'] },
    };
    const filter = filterMap[ext] || { name: '所有文件', extensions: ['*'] };

    if (window.api && window.api.exportFile) {
      const result = await window.api.exportFile({
        content: content,
        defaultName: fileName,
        filters: [filter]
      });
      if (!result.canceled && window.showToast) {
        window.showToast('已导出: ' + result.path);
      }
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
    icon.innerHTML = type === 'file' ? getFileIconSVG('default.txt') : getFolderIconSVG(false);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tree-create-input';
    input.placeholder = type === 'file' ? '文件名（如 app.js）' : '文件夹名';

    inputWrapper.appendChild(icon);
    inputWrapper.appendChild(input);

    // 插入到合适的位置
    if (dirPath) {
      const dirWrapper = body.querySelector(`[data-path="${CSS.escape(dirPath)}"]`);
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

    let finished = false;
    const finish = (save) => {
      if (finished) return;
      finished = true;
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

    let finished = false;
    const finish = (save) => {
      if (finished) return;
      finished = true;
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
