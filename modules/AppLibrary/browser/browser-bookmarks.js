// ============================================================
//  browser/browser-bookmarks.js — 书签系统（支持收藏夹）
//  管理书签/文件夹的增删查改、UI 面板渲染、按钮状态同步
// ============================================================

const BOOKMARKS_KEY = 'astroknot-browser-bookmarks';

/** 书签图标 SVG（空心） */
const SVG_OUTLINE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>';
/** 书签图标 SVG（实心高亮） */
const SVG_FILLED = '<svg width="14" height="14" viewBox="0 0 24 24" fill="#5ee8ff" stroke="#5ee8ff" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>';
/** 文件夹图标 */
const SVG_FOLDER = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>';
/** 文件夹打开图标 */
const SVG_FOLDER_OPEN = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 19a2 2 0 01-2-2V5a2 2 0 012-2h4l2 3h9a2 2 0 012 2v1"/><path d="M2 10h20l-2 9H4l-2-9z"/></svg>';

/** 生成唯一 ID */
function _uid() { return 'f_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6); }

export class BrowserBookmarks {
  /**
   * @param {Object} opts
   * @param {HTMLButtonElement} opts.bookmarkBtn     - 收藏按钮
   * @param {HTMLButtonElement} opts.bookmarkListBtn  - 书签列表按钮
   * @param {HTMLElement}       opts.bookmarksPanel   - 书签面板容器
   * @param {Function} opts.getCurrentUrl             - 获取当前 URL
   * @param {Function} opts.getCurrentTitle            - 获取当前标题
   * @param {Function} opts.onNavigate(url)            - 导航回调
   */
  constructor({ bookmarkBtn, bookmarkListBtn, bookmarksPanel, getCurrentUrl, getCurrentTitle, onNavigate }) {
    this._btn = bookmarkBtn;
    this._listBtn = bookmarkListBtn;
    this._panel = bookmarksPanel;
    this._getUrl = getCurrentUrl;
    this._getTitle = getCurrentTitle;
    this._onNavigate = onNavigate;
    /** @type {string|null} 当前收藏时选中的文件夹 ID，null 表示根目录 */
    this._selectedFolder = null;

    this._bindEvents();
  }

  // ── 数据层 ──

  /** 加载书签树 */
  load() {
    try {
      const data = JSON.parse(localStorage.getItem(BOOKMARKS_KEY) || '[]');
      return this._migrate(data);
    } catch (_) { return []; }
  }

  /** 兼容旧版扁平书签格式 → 新版带文件夹格式 */
  _migrate(data) {
    if (!Array.isArray(data)) return [];
    // 如果第一个元素有 type 字段，说明已经是新格式
    if (data.length > 0 && data[0].type) return data;
    // 旧格式：纯书签数组，迁移到根目录
    return data.map(b => ({ type: 'bookmark', url: b.url, title: b.title || b.url, addedAt: b.addedAt || Date.now() }));
  }

  /** 保存书签树 */
  save(bm) {
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bm));
  }

  /** 当前 URL 是否已收藏（递归查找） */
  isBookmarked() {
    const url = this._getUrl();
    if (!url || url === 'about:blank') return false;
    return this._findBookmark(this.load(), url) !== null;
  }

  /** 递归查找书签 */
  _findBookmark(items, url) {
    for (const item of items) {
      if (item.type === 'bookmark' && item.url === url) return item;
      if (item.type === 'folder' && item.children) {
        const found = this._findBookmark(item.children, url);
        if (found) return found;
      }
    }
    return null;
  }

  /** 切换收藏 */
  toggle() {
    const url = this._getUrl();
    if (!url || url === 'about:blank') return;
    const data = this.load();
    if (this._findBookmark(data, url)) {
      this._removeBookmark(data, url);
    } else {
      // 添加到选中的文件夹或根目录
      const newItem = { type: 'bookmark', url, title: this._getTitle() || url, addedAt: Date.now() };
      if (this._selectedFolder) {
        const folder = this._findFolder(data, this._selectedFolder);
        if (folder) {
          folder.children.unshift(newItem);
        } else {
          data.unshift(newItem);
          this._selectedFolder = null;
        }
      } else {
        data.unshift(newItem);
      }
    }
    this.save(data);
    this.updateBtnState();
    if (this._panel.style.display !== 'none') this.renderPanel();
  }

  /** 递归删除书签 */
  _removeBookmark(items, url) {
    for (let i = 0; i < items.length; i++) {
      if (items[i].type === 'bookmark' && items[i].url === url) {
        items.splice(i, 1);
        return true;
      }
      if (items[i].type === 'folder' && items[i].children) {
        if (this._removeBookmark(items[i].children, url)) return true;
      }
    }
    return false;
  }

  /** 递归查找文件夹 */
  _findFolder(items, folderId) {
    for (const item of items) {
      if (item.type === 'folder' && item.id === folderId) return item;
      if (item.type === 'folder' && item.children) {
        const found = this._findFolder(item.children, folderId);
        if (found) return found;
      }
    }
    return null;
  }

  /** 创建文件夹 */
  createFolder(name) {
    const data = this.load();
    data.push({ type: 'folder', id: _uid(), name, children: [], expanded: true, addedAt: Date.now() });
    this.save(data);
    this.renderPanel();
  }

  /** 删除文件夹 */
  deleteFolder(folderId) {
    const data = this.load();
    this._removeFolder(data, folderId);
    this.save(data);
    if (this._selectedFolder === folderId) this._selectedFolder = null;
    this.renderPanel();
  }

  _removeFolder(items, folderId) {
    for (let i = 0; i < items.length; i++) {
      if (items[i].type === 'folder' && items[i].id === folderId) {
        items.splice(i, 1);
        return true;
      }
      if (items[i].type === 'folder' && items[i].children) {
        if (this._removeFolder(items[i].children, folderId)) return true;
      }
    }
    return false;
  }

  /** 重命名文件夹 */
  renameFolder(folderId, newName) {
    const data = this.load();
    const folder = this._findFolder(data, folderId);
    if (folder) {
      folder.name = newName;
      this.save(data);
      this.renderPanel();
    }
  }

  /** 移动书签到文件夹 */
  moveBookmarkToFolder(url, folderId) {
    const data = this.load();
    const bm = this._findBookmark(data, url);
    if (!bm) return;
    // 先删除原位置
    this._removeBookmark(data, url);
    // 添加到目标文件夹
    if (folderId) {
      const folder = this._findFolder(data, folderId);
      if (folder) {
        folder.children.unshift({ ...bm });
      } else {
        data.unshift({ ...bm });
      }
    } else {
      data.unshift({ ...bm });
    }
    this.save(data);
    this.renderPanel();
  }

  /** 更新按钮状态 */
  updateBtnState() {
    if (this.isBookmarked()) {
      this._btn.classList.add('bookmarked');
      this._btn.title = '移除书签';
      this._btn.innerHTML = SVG_FILLED;
    } else {
      this._btn.classList.remove('bookmarked');
      this._btn.title = '添加书签';
      this._btn.innerHTML = SVG_OUTLINE;
    }
  }

  // ── 面板渲染 ──

  renderPanel() {
    const data = this.load();
    const folders = data.filter(i => i.type === 'folder');
    const rootBookmarks = data.filter(i => i.type === 'bookmark');

    let html = `
      <div class="app-browser-bookmarks-header">
        <span>书签</span>
        <div class="app-browser-bookmarks-header-actions">
          <button class="app-browser-bookmark-add-folder-btn" title="新建文件夹">📁+</button>
        </div>
      </div>
    `;

    if (data.length === 0) {
      html += '<div class="app-browser-bookmarks-empty">暂无书签</div>';
    } else {
      html += '<div class="app-browser-bookmarks-list">';
      // 渲染根目录书签
      for (const item of rootBookmarks) {
        html += this._renderBookmarkItem(item);
      }
      // 渲染文件夹
      for (const folder of folders) {
        html += this._renderFolder(folder);
      }
      html += '</div>';
    }

    this._panel.innerHTML = html;
    this._bindPanelEvents();
  }

  _renderBookmarkItem(item, depth = 0) {
    const displayTitle = item.title || item.url;
    const displayUrl = item.url.length > 50 ? item.url.substring(0, 50) + '...' : item.url;
    const indent = depth * 16;
    return `<div class="app-browser-bookmark-item" data-url="${item.url.replace(/"/g, '&quot;')}" style="padding-left:${14 + indent}px">
      <div class="app-browser-bookmark-item-info">
        <div class="app-browser-bookmark-item-title">${displayTitle.replace(/</g, '&lt;')}</div>
        <div class="app-browser-bookmark-item-url">${displayUrl.replace(/</g, '&lt;')}</div>
      </div>
      <button class="app-browser-bookmark-item-move" title="移动到文件夹">↗</button>
      <button class="app-browser-bookmark-item-delete" title="删除">✕</button>
    </div>`;
  }

  _renderFolder(folder, depth = 0) {
    const isExpanded = folder.expanded !== false;
    const indent = depth * 16;
    const childCount = folder.children ? folder.children.length : 0;

    let html = `<div class="app-browser-bookmark-folder" data-folder-id="${folder.id}" style="padding-left:${14 + indent}px">
      <div class="app-browser-bookmark-folder-header">
        <span class="app-browser-bookmark-folder-toggle">${isExpanded ? SVG_FOLDER_OPEN : SVG_FOLDER}</span>
        <span class="app-browser-bookmark-folder-name">${folder.name.replace(/</g, '&lt;')}</span>
        <span class="app-browser-bookmark-folder-count">${childCount}</span>
        <button class="app-browser-bookmark-folder-rename" title="重命名">✎</button>
        <button class="app-browser-bookmark-folder-delete" title="删除文件夹">✕</button>
      </div>
    </div>`;

    if (isExpanded && folder.children) {
      html += '<div class="app-browser-bookmark-folder-children">';
      for (const child of folder.children) {
        if (child.type === 'bookmark') {
          html += this._renderBookmarkItem(child, depth + 1);
        } else if (child.type === 'folder') {
          html += this._renderFolder(child, depth + 1);
        }
      }
      html += '</div>';
    }

    return html;
  }

  // ── 事件绑定 ──

  _bindEvents() {
    this._btn.addEventListener('click', () => this.toggle());

    this._listBtn.addEventListener('click', () => {
      if (this._panel.style.display === 'none') {
        this.renderPanel();
        this._panel.style.display = 'block';
      } else {
        this._panel.style.display = 'none';
      }
    });

    document.addEventListener('mousedown', (e) => {
      if (this._panel.style.display !== 'none'
          && !this._panel.contains(e.target)
          && e.target !== this._listBtn
          && !this._listBtn.contains(e.target)) {
        this._panel.style.display = 'none';
      }
    });
  }

  _bindPanelEvents() {
    // 书签点击 → 导航
    this._panel.querySelectorAll('.app-browser-bookmark-item').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.app-browser-bookmark-item-delete')) return;
        if (e.target.closest('.app-browser-bookmark-item-move')) return;
        const url = el.dataset.url;
        if (url) { this._onNavigate(url); this._panel.style.display = 'none'; }
      });
    });

    // 书签删除
    this._panel.querySelectorAll('.app-browser-bookmark-item-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = btn.closest('.app-browser-bookmark-item');
        const url = item?.dataset.url;
        if (url) {
          const data = this.load();
          this._removeBookmark(data, url);
          this.save(data);
          this.updateBtnState();
          this.renderPanel();
        }
      });
    });

    // 书签移动
    this._panel.querySelectorAll('.app-browser-bookmark-item-move').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = btn.closest('.app-browser-bookmark-item');
        const url = item?.dataset.url;
        if (url) this._showMoveDialog(url);
      });
    });

    // 新建文件夹
    const addFolderBtn = this._panel.querySelector('.app-browser-bookmark-add-folder-btn');
    if (addFolderBtn) {
      addFolderBtn.addEventListener('click', () => this._showCreateFolderDialog());
    }

    // 文件夹展开/收起
    this._panel.querySelectorAll('.app-browser-bookmark-folder-toggle').forEach(toggle => {
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const folderEl = toggle.closest('.app-browser-bookmark-folder');
        const folderId = folderEl?.dataset.folderId;
        if (folderId) {
          const data = this.load();
          const folder = this._findFolder(data, folderId);
          if (folder) {
            folder.expanded = !folder.expanded;
            this.save(data);
            this.renderPanel();
          }
        }
      });
    });

    // 文件夹点击 → 选中文件夹（用于收藏时定位）
    this._panel.querySelectorAll('.app-browser-bookmark-folder-header').forEach(header => {
      header.addEventListener('click', (e) => {
        if (e.target.closest('.app-browser-bookmark-folder-toggle')) return;
        if (e.target.closest('.app-browser-bookmark-folder-rename')) return;
        if (e.target.closest('.app-browser-bookmark-folder-delete')) return;
        const folderEl = header.closest('.app-browser-bookmark-folder');
        const folderId = folderEl?.dataset.folderId;
        if (folderId) {
          this._selectedFolder = this._selectedFolder === folderId ? null : folderId;
          // 高亮选中文件夹
          this._panel.querySelectorAll('.app-browser-bookmark-folder-header').forEach(h => h.classList.remove('selected'));
          if (this._selectedFolder) header.classList.add('selected');
        }
      });
    });

    // 文件夹重命名
    this._panel.querySelectorAll('.app-browser-bookmark-folder-rename').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const folderEl = btn.closest('.app-browser-bookmark-folder');
        const folderId = folderEl?.dataset.folderId;
        if (folderId) this._showRenameDialog(folderId);
      });
    });

    // 文件夹删除
    this._panel.querySelectorAll('.app-browser-bookmark-folder-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const folderEl = btn.closest('.app-browser-bookmark-folder');
        const folderId = folderEl?.dataset.folderId;
        if (folderId) {
          const data = this.load();
          const folder = this._findFolder(data, folderId);
          const childCount = folder?.children?.length || 0;
          if (childCount > 0) {
            this._showConfirmDialog(
              `文件夹"${folder.name}"中有 ${childCount} 个书签，确定删除？`,
              () => { this.deleteFolder(folderId); this.updateBtnState(); }
            );
          } else {
            this.deleteFolder(folderId);
            this.updateBtnState();
          }
        }
      });
    });
  }

  // ── 对话框 ──

  _removeDialog() {
    const existing = this._panel.querySelector('.app-browser-bookmark-dialog');
    if (existing) existing.remove();
  }

  _showInputDialog(label, defaultValue, onConfirm) {
    this._removeDialog();
    const dialog = document.createElement('div');
    dialog.className = 'app-browser-bookmark-dialog';
    dialog.innerHTML = `
      <div class="app-browser-bookmark-dialog-label">${label}</div>
      <input type="text" class="app-browser-bookmark-dialog-input" value="${(defaultValue || '').replace(/"/g, '&quot;')}">
      <div class="app-browser-bookmark-dialog-actions">
        <button class="app-browser-bookmark-dialog-confirm">确定</button>
        <button class="app-browser-bookmark-dialog-cancel">取消</button>
      </div>
    `;
    this._panel.appendChild(dialog);

    const input = dialog.querySelector('.app-browser-bookmark-dialog-input');
    input.focus();
    input.select();

    const close = () => dialog.remove();
    dialog.querySelector('.app-browser-bookmark-dialog-confirm').addEventListener('click', () => {
      const val = input.value.trim();
      if (val) { onConfirm(val); }
      close();
    });
    dialog.querySelector('.app-browser-bookmark-dialog-cancel').addEventListener('click', close);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { const val = input.value.trim(); if (val) { onConfirm(val); } close(); }
      if (e.key === 'Escape') close();
    });
  }

  _showConfirmDialog(message, onConfirm) {
    this._removeDialog();
    const dialog = document.createElement('div');
    dialog.className = 'app-browser-bookmark-dialog';
    dialog.innerHTML = `
      <div class="app-browser-bookmark-dialog-label">${message}</div>
      <div class="app-browser-bookmark-dialog-actions">
        <button class="app-browser-bookmark-dialog-confirm">确定</button>
        <button class="app-browser-bookmark-dialog-cancel">取消</button>
      </div>
    `;
    this._panel.appendChild(dialog);

    const close = () => dialog.remove();
    dialog.querySelector('.app-browser-bookmark-dialog-confirm').addEventListener('click', () => { onConfirm(); close(); });
    dialog.querySelector('.app-browser-bookmark-dialog-cancel').addEventListener('click', close);
  }

  _showCreateFolderDialog() {
    this._showInputDialog('文件夹名称：', '新建文件夹', (name) => this.createFolder(name));
  }

  _showRenameDialog(folderId) {
    const data = this.load();
    const folder = this._findFolder(data, folderId);
    if (!folder) return;
    this._showInputDialog('新名称：', folder.name, (newName) => {
      if (newName !== folder.name) this.renameFolder(folderId, newName);
    });
  }

  _showMoveDialog(url) {
    const data = this.load();
    const folders = this._collectFolders(data);

    if (folders.length === 0) {
      // 没有文件夹，提示创建
      this._showConfirmDialog('还没有文件夹，是否创建一个？', () => {
        this._showInputDialog('文件夹名称：', '新建文件夹', (name) => {
          this.createFolder(name);
          // 创建后再次移动
          const newFolders = this._collectFolders(this.load());
          if (newFolders.length > 0) this.moveBookmarkToFolder(url, newFolders[0].id);
        });
      });
      return;
    }

    // 构建移动菜单
    let menuHtml = '<div class="app-browser-bookmark-move-menu">';
    menuHtml += '<div class="app-browser-bookmark-move-option" data-folder-id="">根目录</div>';
    for (const f of folders) {
      menuHtml += `<div class="app-browser-bookmark-move-option" data-folder-id="${f.id}">📁 ${f.name.replace(/</g, '&lt;')}</div>`;
    }
    menuHtml += '</div>';

    const menu = document.createElement('div');
    menu.innerHTML = menuHtml;
    menu.firstChild.style.position = 'absolute';
    menu.firstChild.style.zIndex = '10002';
    this._panel.appendChild(menu.firstChild);

    const moveMenu = this._panel.querySelector('.app-browser-bookmark-move-menu');
    // 定位在移动按钮附近
    const moveBtn = this._panel.querySelector(`.app-browser-bookmark-item[data-url="${url.replace(/"/g, '&quot;')}"] .app-browser-bookmark-item-move`);
    if (moveBtn) {
      const rect = moveBtn.getBoundingClientRect();
      const panelRect = this._panel.getBoundingClientRect();
      moveMenu.style.top = (rect.bottom - panelRect.top) + 'px';
      moveMenu.style.right = (panelRect.right - rect.right) + 'px';
    }

    moveMenu.querySelectorAll('.app-browser-bookmark-move-option').forEach(opt => {
      opt.addEventListener('click', () => {
        const folderId = opt.dataset.folderId || null;
        this.moveBookmarkToFolder(url, folderId);
        moveMenu.remove();
        this.updateBtnState();
      });
    });

    // 点击其他地方关闭
    const closeMenu = (e) => {
      if (!moveMenu.contains(e.target)) {
        moveMenu.remove();
        document.removeEventListener('mousedown', closeMenu);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', closeMenu), 0);
  }

  /** 收集所有文件夹（扁平化） */
  _collectFolders(items, result = []) {
    for (const item of items) {
      if (item.type === 'folder') {
        result.push({ id: item.id, name: item.name });
        if (item.children) this._collectFolders(item.children, result);
      }
    }
    return result;
  }
}
