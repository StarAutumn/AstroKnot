// ============================================================
//  sandbox-tabs.js — 文件标签页组件
//  VSCode 风格的文件标签页：可关闭、可拖拽排序、脏标记
// ============================================================

export class FileTabsComponent {
  /**
   * @param {HTMLElement} containerEl - 标签页容器
   * @param {Function} onTabSelect - 切换标签回调 (filePath)
   * @param {Function} onTabClose - 关闭标签回调 (filePath)
   */
  constructor(containerEl, onTabSelect, onTabClose) {
    this._container = containerEl;
    this._onTabSelect = onTabSelect || function () {};
    this._onTabClose = onTabClose || function () {};

    // 打开的标签列表：[{filePath, fileName, dirty}]
    this._tabs = [];
    this._activePath = null;

    // 拖拽状态
    this._dragIdx = -1;
    this._lastTargetIdx = -1;

    this._init();
  }

  _init() {
    this._container.classList.add('sandbox-file-tabs');
    this._container.innerHTML = '';
  }

  // ── 公共 API ──

  openTab(filePath, fileName) {
    // 已打开则聚焦
    const existing = this._tabs.findIndex(t => t.filePath === filePath);
    if (existing >= 0) {
      this.setActive(filePath);
      return;
    }

    this._tabs.push({ filePath, fileName, dirty: false });
    this.setActive(filePath);
    this._render();
  }

  closeTab(filePath) {
    const idx = this._tabs.findIndex(t => t.filePath === filePath);
    if (idx < 0) return;

    this._tabs.splice(idx, 1);

    if (this._activePath === filePath) {
      // 切换到相邻标签
      if (this._tabs.length > 0) {
        const nextIdx = Math.min(idx, this._tabs.length - 1);
        this._activePath = this._tabs[nextIdx].filePath;
        this._onTabSelect(this._activePath);
      } else {
        this._activePath = null;
      }
    }

    this._render();
  }

  setActive(filePath) {
    if (this._activePath === filePath) return;
    this._activePath = filePath;
    this._onTabSelect(filePath);
    this._render();
  }

  getActivePath() {
    return this._activePath;
  }

  markDirty(filePath) {
    const tab = this._tabs.find(t => t.filePath === filePath);
    if (tab && !tab.dirty) {
      tab.dirty = true;
      this._updateTabElement(filePath);
    }
  }

  markClean(filePath) {
    const tab = this._tabs.find(t => t.filePath === filePath);
    if (tab && tab.dirty) {
      tab.dirty = false;
      this._updateTabElement(filePath);
    }
  }

  markAllClean() {
    for (const tab of this._tabs) {
      tab.dirty = false;
    }
    this._render();
  }

  getOpenFiles() {
    return this._tabs.map(t => t.filePath);
  }

  /**
   * 重命名文件时更新标签
   */
  renamePath(oldPath, newPath, newName) {
    const tab = this._tabs.find(t => t.filePath === oldPath);
    if (tab) {
      tab.filePath = newPath;
      tab.fileName = newName;
      if (this._activePath === oldPath) {
        this._activePath = newPath;
      }
    }
    this._render();
  }

  closeAll() {
    this._tabs = [];
    this._activePath = null;
    this._render();
  }

  // ── 渲染 ──

  _render() {
    this._container.innerHTML = '';

    if (this._tabs.length === 0) {
      this._container.style.display = 'none';
      return;
    }

    this._container.style.display = 'flex';

    for (let i = 0; i < this._tabs.length; i++) {
      const tab = this._tabs[i];
      const el = document.createElement('div');
      el.className = 'sandbox-tab';
      if (tab.filePath === this._activePath) el.classList.add('active');
      el.dataset.path = tab.filePath;

      // 图标
      const icon = document.createElement('span');
      icon.className = 'sandbox-tab-icon';
      icon.textContent = this._getFileIcon(tab.fileName);

      // 名称
      const label = document.createElement('span');
      label.className = 'sandbox-tab-name';
      label.textContent = tab.fileName;
      if (tab.dirty) label.textContent += ' ●';

      // 关闭按钮
      const closeBtn = document.createElement('span');
      closeBtn.className = 'sandbox-tab-close';
      closeBtn.textContent = '✕';

      el.appendChild(icon);
      el.appendChild(label);
      el.appendChild(closeBtn);

      // 事件
      const self = this;
      const tPath = tab.filePath;
      el.addEventListener('click', function (e) {
        if (e.target === closeBtn) return;
        self.setActive(tPath);
      });
      closeBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        self._onTabClose(tPath);
      });

      // 中键关闭
      el.addEventListener('mousedown', function (e) {
        if (e.button === 1) {
          e.preventDefault();
          self._onTabClose(tPath);
        }
      });

      // 拖拽
      el.draggable = true;

      this._container.appendChild(el);
    }

    this._initDragEvents();
  }

  _updateTabElement(filePath) {
    const el = this._container.querySelector(`[data-path="${filePath}"]`);
    if (!el) return;
    const tab = this._tabs.find(t => t.filePath === filePath);
    if (!tab) return;
    const label = el.querySelector('.sandbox-tab-name');
    if (label) label.textContent = tab.fileName + (tab.dirty ? ' ●' : '');
  }

  _getFileIcon(name) {
    const ext = name.split('.').pop().toLowerCase();
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
    };
    return iconMap[ext] || '📄';
  }

  // ── 拖拽排序 ──

  _initDragEvents() {
    const container = this._container;
    const self = this;

    container.addEventListener('dragstart', function (e) {
      const tabEl = e.target.closest('.sandbox-tab');
      if (!tabEl) return;
      const idx = Array.from(container.children).indexOf(tabEl);
      if (idx < 0) return;
      self._dragIdx = idx;
      self._lastTargetIdx = idx;
      tabEl.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(idx));
    });

    container.addEventListener('dragover', function (e) {
      e.preventDefault();
      if (self._dragIdx < 0) return;

      const tabs = Array.from(container.children);
      const cursorX = e.clientX;

      let targetIdx = tabs.length - 1;
      for (let i = 0; i < tabs.length; i++) {
        const rect = tabs[i].getBoundingClientRect();
        if (cursorX < rect.left + rect.width / 2) {
          targetIdx = i;
          break;
        }
      }

      if (targetIdx === self._lastTargetIdx) return;
      self._lastTargetIdx = targetIdx;

      self._applyPush(container, self._dragIdx, targetIdx);
    });

    container.addEventListener('drop', function (e) {
      e.preventDefault();
      if (self._dragIdx < 0) return;
      const from = self._dragIdx;
      let to = self._lastTargetIdx;
      if (to < 0) to = from;
      self._finalize(container, from, to);
      self._dragIdx = -1;
      self._lastTargetIdx = -1;
    });

    container.addEventListener('dragend', function () {
      self._resetTransforms(container);
      self._dragIdx = -1;
      self._lastTargetIdx = -1;
      container.querySelectorAll('.sandbox-tab').forEach(function (el) {
        el.classList.remove('dragging');
      });
    });
  }

  _applyPush(container, fromIdx, targetIdx) {
    const tabs = Array.from(container.children);
    for (let i = 0; i < tabs.length; i++) {
      tabs[i].style.transition = 'none';
      tabs[i].style.transform = '';
    }
    if (targetIdx === fromIdx) {
      void container.offsetHeight;
      return;
    }
    const shiftW = tabs[fromIdx].offsetWidth;
    if (targetIdx > fromIdx) {
      for (let i = fromIdx + 1; i <= targetIdx; i++) {
        tabs[i].style.transform = 'translateX(-' + shiftW + 'px)';
      }
    } else {
      for (let i = targetIdx; i < fromIdx; i++) {
        tabs[i].style.transform = 'translateX(' + shiftW + 'px)';
      }
    }
    void container.offsetHeight;
    for (let i = 0; i < tabs.length; i++) {
      tabs[i].style.transition = 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)';
    }
  }

  _finalize(container, fromIdx, targetIdx) {
    const tabs = Array.from(container.children);
    for (let i = 0; i < tabs.length; i++) {
      tabs[i].style.transition = 'none';
      tabs[i].style.transform = '';
    }
    void container.offsetHeight;
    if (targetIdx === fromIdx) return;
    const movedEl = tabs[fromIdx];
    const insertIdx = targetIdx > fromIdx ? targetIdx - 1 : targetIdx;
    container.removeChild(movedEl);
    if (insertIdx >= container.children.length) {
      container.appendChild(movedEl);
    } else {
      container.insertBefore(movedEl, container.children[insertIdx]);
    }
    const movedObj = this._tabs.splice(fromIdx, 1)[0];
    const arrInsert = targetIdx > fromIdx ? targetIdx - 1 : targetIdx;
    this._tabs.splice(arrInsert, 0, movedObj);
  }

  _resetTransforms(container) {
    const tabs = Array.from(container.children);
    for (let i = 0; i < tabs.length; i++) {
      tabs[i].style.transition = 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)';
      tabs[i].style.transform = '';
    }
  }
}

console.log('[sandbox-tabs] 模块已加载');
