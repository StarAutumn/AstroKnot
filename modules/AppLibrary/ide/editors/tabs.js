// ============================================================
//  sandbox-tabs.js — 文件标签页组件
//  VSCode 风格的文件标签页：可关闭、可拖拽排序、脏标记、右键菜单
// ============================================================

import { getFileIconSVG } from '../core/file-icons.js';

export class FileTabsComponent {
  /**
   * @param {HTMLElement} containerEl - 标签页容器
   * @param {Function} onTabSelect - 切换标签回调 (filePath)
   * @param {Function} onTabClose - 关闭标签回调 (filePath)
   * @param {Object} [contextMenuCallbacks] - 右键菜单回调
   * @param {Function} [contextMenuCallbacks.onCloseOthers] - 关闭其他标签
   * @param {Function} [contextMenuCallbacks.onCloseAll] - 关闭所有标签
   * @param {Function} [contextMenuCallbacks.onCloseSaved] - 关闭已保存标签
   * @param {Function} [contextMenuCallbacks.onCopyPath] - 复制路径
   * @param {Function} [contextMenuCallbacks.onRevealInTree] - 在文件树中显示
   * @param {Function} [contextMenuCallbacks.onClosePreviewTab] - 关闭预览标签
   */
  constructor(containerEl, onTabSelect, onTabClose, contextMenuCallbacks) {
    this._container = containerEl;
    this._onTabSelect = onTabSelect || function () {};
    this._onTabClose = onTabClose || function () {};
    this._ctxCallbacks = contextMenuCallbacks || {};

    // 打开的标签列表：[{filePath, fileName, dirty}]
    this._tabs = [];
    this._activePath = null;

    // 拖拽状态
    this._dragIdx = -1;
    this._lastTargetIdx = -1;

    // 右键菜单 DOM（单例）
    this._ctxMenu = null;

    this._init();
  }

  _init() {
    this._container.classList.add('sandbox-file-tabs');
    this._container.innerHTML = '';

    // 创建右键菜单（单例，所有标签共享）
    this._ctxMenu = document.createElement('div');
    this._ctxMenu.className = 'sandbox-tab-ctx-menu';
    this._ctxMenu.style.cssText = 'position:fixed;z-index:50000;display:none;flex-direction:column;gap:1px;min-width:180px;background:#0d1f2b;border:1px solid #2c6e7e;border-radius:8px;padding:4px;box-shadow:0 4px 20px rgba(0,0,0,0.5);font-size:12px;font-family:system-ui,sans-serif;';
    document.body.appendChild(this._ctxMenu);

    // 点击其他地方关闭菜单（保存引用以便 destroy 时移除）
    this._onGlobalMouseDown = (e) => {
      if (this._ctxMenu && !this._ctxMenu.contains(e.target)) {
        this._ctxMenu.style.display = 'none';
      }
    };
    document.addEventListener('mousedown', this._onGlobalMouseDown);
  }

  // ── 公共 API ──

  openTab(filePath, fileName) {
    // 已打开则聚焦
    const existing = this._tabs.findIndex(t => t.filePath === filePath);
    if (existing >= 0) {
      this.setActive(filePath);
      return;
    }

    this._tabs.push({ filePath, fileName, dirty: false, pinned: false });
    this.setActive(filePath);
    this._render();
  }

  togglePin(filePath) {
    const tab = this._tabs.find(t => t.filePath === filePath);
    if (tab) {
      tab.pinned = !tab.pinned;
      this._render();
    }
  }

  isPinned(filePath) {
    const tab = this._tabs.find(t => t.filePath === filePath);
    return tab ? tab.pinned : false;
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
    // 预览标签激活时，即使点击同一路径也需重新激活（以退出预览模式）
    const previewTab = this._container.querySelector('.sandbox-tab[data-preview-tab]');
    const isPreviewActive = previewTab && previewTab.classList.contains('active');
    if (this._activePath === filePath && !isPreviewActive) return;

    // 先取消预览标签的 active 状态，防止 _onTabSelect → openTab → setActive 递归
    if (isPreviewActive && previewTab) {
      previewTab.classList.remove('active');
    }

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
    // 保留 pinned 标签
    this._tabs = this._tabs.filter(t => t.pinned);
    if (!this._tabs.find(t => t.filePath === this._activePath)) {
      this._activePath = this._tabs.length > 0 ? this._tabs[0].filePath : null;
      if (this._activePath) this._onTabSelect(this._activePath);
    }
    this._render();
  }

  closeOthers(filePath) {
    // 保留当前和 pinned 标签
    this._tabs = this._tabs.filter(t => t.filePath === filePath || t.pinned);
    this._activePath = filePath;
    this._render();
  }

  closeSaved() {
    // 保留 dirty 和 pinned 标签
    this._tabs = this._tabs.filter(t => t.dirty || t.pinned);
    if (!this._tabs.find(t => t.filePath === this._activePath)) {
      this._activePath = this._tabs.length > 0 ? this._tabs[0].filePath : null;
      if (this._activePath) this._onTabSelect(this._activePath);
    }
    this._render();
  }

  destroy() {
    if (this._ctxMenu) {
      this._ctxMenu.remove();
      this._ctxMenu = null;
    }
    // 移除全局 mousedown 监听器，防止泄漏
    if (this._onGlobalMouseDown) {
      document.removeEventListener('mousedown', this._onGlobalMouseDown);
      this._onGlobalMouseDown = null;
    }
    // 移除拖拽事件
    if (this._dragEventsInitialized && this._container) {
      this._container.removeEventListener('dragstart', this._onDragStart);
      this._container.removeEventListener('dragover', this._onDragOver);
      this._container.removeEventListener('drop', this._onDrop);
      this._container.removeEventListener('dragend', this._onDragEnd);
      this._dragEventsInitialized = false;
    }
  }

  // ── 渲染 ──

  _render() {
    // 保留预览标签（由外部 index.js 管理，不在 _tabs 数组中）
    const previewTab = this._container.querySelector('.sandbox-tab[data-preview-tab]');

    this._container.innerHTML = '';

    if (this._tabs.length === 0 && !previewTab) {
      this._container.style.display = 'none';
      return;
    }

    this._container.style.display = 'flex';

    for (let i = 0; i < this._tabs.length; i++) {
      const tab = this._tabs[i];
      const el = document.createElement('div');
      el.className = 'sandbox-tab';
      if (tab.filePath === this._activePath) el.classList.add('active');
      if (tab.pinned) el.classList.add('pinned');
      el.dataset.path = tab.filePath;

      // 图标
      const icon = document.createElement('span');
      icon.className = 'sandbox-tab-icon';
      icon.innerHTML = this._getFileIcon(tab.fileName);

      // 名称
      const label = document.createElement('span');
      label.className = 'sandbox-tab-name';
      label.textContent = tab.fileName;
      if (tab.dirty) label.textContent += ' ●';

      el.appendChild(icon);
      el.appendChild(label);

      // 关闭按钮（pinned 标签不显示）
      if (!tab.pinned) {
        const closeBtn = document.createElement('span');
        closeBtn.className = 'sandbox-tab-close';
        closeBtn.textContent = '✕';
        el.appendChild(closeBtn);
      } else {
        // pinned 标签显示 📌
        const pinIcon = document.createElement('span');
        pinIcon.className = 'pinned-icon';
        pinIcon.textContent = '📌';
        el.appendChild(pinIcon);
      }

      // 事件
      const self = this;
      const tPath = tab.filePath;
      el.addEventListener('click', function (e) {
        if (e.target.classList.contains('sandbox-tab-close')) return;
        self.setActive(tPath);
      });

      // 关闭按钮事件（仅非 pinned）
      const closeEl = el.querySelector('.sandbox-tab-close');
      if (closeEl) {
        closeEl.addEventListener('click', function (e) {
          e.stopPropagation();
          self._onTabClose(tPath);
        });
      }

      // 中键关闭（pinned 标签中键不关闭）
      el.addEventListener('mousedown', function (e) {
        if (e.button === 1 && !tab.pinned) {
          e.preventDefault();
          self._onTabClose(tPath);
        }
      });

      // 右键菜单
      el.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        e.stopPropagation();
        self._showContextMenu(e.clientX, e.clientY, tPath);
      });

      // 拖拽
      el.draggable = true;

      this._container.appendChild(el);
    }

    // 恢复预览标签到末尾
    if (previewTab) {
      this._container.appendChild(previewTab);
    }

    this._initDragEvents();
  }

  _updateTabElement(filePath) {
    const el = this._container.querySelector(`[data-path="${CSS.escape(filePath)}"]`);
    if (!el) return;
    const tab = this._tabs.find(t => t.filePath === filePath);
    if (!tab) return;
    const label = el.querySelector('.sandbox-tab-name');
    if (label) label.textContent = tab.fileName + (tab.dirty ? ' ●' : '');
  }

  _getFileIcon(name) {
    return getFileIconSVG(name);
  }

  // ── 右键菜单 ──

  _showContextMenu(x, y, filePath) {
    const menu = this._ctxMenu;
    if (!menu) return;

    const tab = this._tabs.find(t => t.filePath === filePath);
    const hasOtherTabs = this._tabs.length > 1;
    const hasSavedTabs = this._tabs.some(t => !t.dirty && t.filePath !== filePath);
    const hasDirty = tab && tab.dirty;

    let html = '';

    // 固定/取消固定
    if (tab && tab.pinned) {
      html += `<button data-action="unpin">📌 取消固定</button>`;
    } else {
      html += `<button data-action="pin">📌 固定标签</button>`;
    }

    html += `<div class="ctx-sep"></div>`;

    // 关闭（pinned 标签不能直接关闭）
    if (tab && tab.pinned) {
      html += `<button data-action="close" style="color:#566;" disabled>✕ 关闭 (已固定)</button>`;
    } else {
      html += `<button data-action="close" ${hasDirty ? 'style="color:#faa;"' : ''}>✕ 关闭</button>`;
    }

    // 关闭其他
    if (hasOtherTabs) {
      html += `<button data-action="close-others">📁 关闭其他</button>`;
    }

    // 关闭已保存
    if (hasSavedTabs) {
      html += `<button data-action="close-saved">💾 关闭已保存</button>`;
    }

    // 关闭所有
    html += `<button data-action="close-all">📋 关闭所有</button>`;

    // 关闭预览标签
    const previewTab = this._container.querySelector('.sandbox-tab[data-preview-tab]');
    if (previewTab) {
      html += `<div class="ctx-sep"></div>`;
      html += `<button data-action="close-preview">👁 关闭预览</button>`;
    }

    html += `<div class="ctx-sep"></div>`;

    // 复制路径
    html += `<button data-action="copy-path">📎 复制路径</button>`;

    // 在文件树中显示
    html += `<button data-action="reveal-in-tree">📂 在文件树中显示</button>`;

    // 在右侧分屏打开
    html += `<button data-action="split-right">◫ 在右侧分屏打开</button>`;

    menu.innerHTML = html;
    menu.style.display = 'flex';

    // 定位
    const menuW = menu.offsetWidth || 180;
    const menuH = menu.offsetHeight || 200;
    let left = x;
    let top = y;
    if (left + menuW > window.innerWidth - 8) left = window.innerWidth - 8 - menuW;
    if (top + menuH > window.innerHeight - 8) top = window.innerHeight - 8 - menuH;
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';

    // 分隔线样式
    menu.querySelectorAll('.ctx-sep').forEach(sep => {
      sep.style.cssText = 'height:1px;background:#1a3a4a;margin:4px 0;';
    });

    // 按钮样式
    menu.querySelectorAll('button').forEach(btn => {
      btn.style.cssText = 'display:flex;align-items:center;gap:8px;width:100%;padding:5px 12px;background:transparent;border:none;color:#cdf;cursor:pointer;border-radius:4px;text-align:left;font-size:12px;font-family:inherit;transition:background 0.1s;';
      btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(0,229,255,0.1)'; });
      btn.addEventListener('mouseleave', () => { btn.style.background = 'transparent'; });
    });

    // 事件处理
    const self = this;
    const onClick = function(e) {
      const btn = e.target.closest('button');
      if (!btn) return;
      const action = btn.dataset.action;
      menu.style.display = 'none';
      menu.removeEventListener('click', onClick);

      switch (action) {
        case 'pin':
          self.togglePin(filePath);
          break;
        case 'unpin':
          self.togglePin(filePath);
          break;
        case 'close':
          if (!(tab && tab.pinned)) self._onTabClose(filePath);
          break;
        case 'close-others':
          if (self._ctxCallbacks.onCloseOthers) self._ctxCallbacks.onCloseOthers(filePath);
          else self.closeOthers(filePath);
          break;
        case 'close-saved':
          if (self._ctxCallbacks.onCloseSaved) self._ctxCallbacks.onCloseSaved();
          else self.closeSaved();
          break;
        case 'close-all':
          if (self._ctxCallbacks.onCloseAll) self._ctxCallbacks.onCloseAll();
          else self.closeAll();
          break;
        case 'close-preview':
          if (self._ctxCallbacks.onClosePreviewTab) self._ctxCallbacks.onClosePreviewTab();
          break;
        case 'copy-path':
          if (self._ctxCallbacks.onCopyPath) self._ctxCallbacks.onCopyPath(filePath);
          break;
        case 'reveal-in-tree':
          if (self._ctxCallbacks.onRevealInTree) self._ctxCallbacks.onRevealInTree(filePath);
          break;
        case 'split-right':
          if (self._ctxCallbacks.onSplitRight) self._ctxCallbacks.onSplitRight(filePath);
          break;
      }
    };

    menu.addEventListener('click', onClick);
  }

  // ── 拖拽排序 ──

  _initDragEvents() {
    // 防止重复绑定：每次 _render 只初始化一次
    if (this._dragEventsInitialized) return;
    this._dragEventsInitialized = true;

    const container = this._container;
    const self = this;

    // 保存事件处理器引用，以便 destroy 时移除
    this._onDragStart = function (e) {
      const tabEl = e.target.closest('.sandbox-tab');
      if (!tabEl) return;
      // 计算标签索引时排除预览标签
      const tabEls = Array.from(container.querySelectorAll('.sandbox-tab:not([data-preview-tab])'));
      const idx = tabEls.indexOf(tabEl);
      if (idx < 0) return;
      self._dragIdx = idx;
      self._lastTargetIdx = idx;
      tabEl.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(idx));
    };

    this._onDragOver = function (e) {
      e.preventDefault();
      if (self._dragIdx < 0) return;

      // 只用 .sandbox-tab 元素计算索引（排除预览标签）
      const tabEls = Array.from(container.querySelectorAll('.sandbox-tab:not([data-preview-tab])'));
      const cursorX = e.clientX;

      let targetIdx = tabEls.length - 1;
      for (let i = 0; i < tabEls.length; i++) {
        const rect = tabEls[i].getBoundingClientRect();
        if (cursorX < rect.left + rect.width / 2) {
          targetIdx = i;
          break;
        }
      }

      if (targetIdx === self._lastTargetIdx) return;
      self._lastTargetIdx = targetIdx;

      self._applyPush(container, self._dragIdx, targetIdx);
    };

    this._onDrop = function (e) {
      e.preventDefault();
      if (self._dragIdx < 0) return;
      const from = self._dragIdx;
      let to = self._lastTargetIdx;
      if (to < 0) to = from;
      self._finalize(container, from, to);
      self._dragIdx = -1;
      self._lastTargetIdx = -1;
    };

    this._onDragEnd = function () {
      self._resetTransforms(container);
      self._dragIdx = -1;
      self._lastTargetIdx = -1;
      container.querySelectorAll('.sandbox-tab').forEach(function (el) {
        el.classList.remove('dragging');
      });
    };

    container.addEventListener('dragstart', this._onDragStart);
    container.addEventListener('dragover', this._onDragOver);
    container.addEventListener('drop', this._onDrop);
    container.addEventListener('dragend', this._onDragEnd);
  }

  _applyPush(container, fromIdx, targetIdx) {
    // 只操作 .sandbox-tab 元素（排除预览标签）
    const tabs = Array.from(container.querySelectorAll('.sandbox-tab:not([data-preview-tab])'));
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
    // 只操作 .sandbox-tab 元素（排除预览标签）
    const tabs = Array.from(container.querySelectorAll('.sandbox-tab:not([data-preview-tab])'));
    for (let i = 0; i < tabs.length; i++) {
      tabs[i].style.transition = 'none';
      tabs[i].style.transform = '';
    }
    void container.offsetHeight;
    if (targetIdx === fromIdx) return;
    const movedEl = tabs[fromIdx];
    const insertIdx = targetIdx > fromIdx ? targetIdx - 1 : targetIdx;
    // DOM 操作：在标签元素间移动（预览标签始终在末尾）
    container.removeChild(movedEl);
    const tabEls = Array.from(container.querySelectorAll('.sandbox-tab:not([data-preview-tab])'));
    if (insertIdx >= tabEls.length) {
      // 插入到预览标签之前，或末尾
      const previewTab = container.querySelector('.sandbox-tab[data-preview-tab]');
      if (previewTab) {
        container.insertBefore(movedEl, previewTab);
      } else {
        container.appendChild(movedEl);
      }
    } else {
      container.insertBefore(movedEl, tabEls[insertIdx]);
    }
    // _tabs 数组索引与 tabEls 一致（不含预览标签），直接用
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
