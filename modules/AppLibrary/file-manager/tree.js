// ============================================================
//  file-manager/tree.js — 目录树侧栏（原型混入）
//  职责：加载并渲染 AstroKnot-Data 目录树，处理树节点点击
//  导航与右键菜单、当前路径高亮与逐级展开、侧边栏拖拽调宽
//  实现说明：以原型混入（Object.assign(FileManagerApp.prototype, ...)）
//  挂载到 FileManagerApp——方法体通过 this 访问实例状态
//  （this._dirTreeCache / this._currentPath / this._content 等），
//  与写在 class 体内完全等价；状态初始化与调用时机
//  仍由 index.js 的 constructor / _bindEvents 统一编排
// ============================================================

import { getFolderIconSVG } from '../ide/core/file-icons.js';

/** 检查路径是否在 system 目录下（含 system 本身） */
export function isUnderSystem(relPath) {
  const normalized = (relPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized) return false;
  const first = normalized.split('/')[0];
  return first === 'system';
}

export const treeMethods = {
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
  },

  _renderDirTree() {
    const container = this._content.querySelector('#fmDirTree');
    container.innerHTML = '';
    this._renderTreeNode(container, this._dirTreeCache, '', 0);
  },

  _renderTreeNode(container, node, nodePath, depth) {
    if (!node) return;
    const hasChildren = node.children && Object.keys(node.children).length > 0;

    const item = document.createElement('div');
    const treeDimmed = isUnderSystem(nodePath) ? ' fm-tree-item-dimmed' : '';
    item.className = 'fm-tree-item' + treeDimmed + (nodePath === this._currentPath ? ' active' : '');
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
  },

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
  },

  async _onTreeContextMenu(e) {
    e.preventDefault();
    const item = e.target.closest('.fm-tree-item');
    if (!item) return;
    const path = item.dataset.path;
    const projectInfo = await this._detectProject(path);
    const nodeInfo = await this._detectNodeFolder(path);
    const items = [
      { label: '📂 打开', action: () => this._navigateTo(path) },
      { label: '💻 通过 IDE 打开', action: () => this._openInIDE(path, 'directory') },
    ];
    if (projectInfo) {
      items.push({ label: '🚀 打开该AstroKnot项目', action: () => this._openAsProject(path, projectInfo) });
    }
    if (nodeInfo) {
      items.push({ label: '打开该节点', action: () => this._openNode(nodeInfo) });
    }
    items.push(
      { type: 'separator' },
      { label: '打开文件所在位置', action: () => this._openInExplorer(path) },
      { label: '复制路径', action: () => this._copyPath(path) },
      { label: '删除文件夹', action: () => this._deleteItem(path, 'directory') },
      { label: '重命名', action: () => this._renameItem(path, 'directory') },
    );
    this._showContextMenu(e.clientX, e.clientY, items);
  },

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
  },

  _updateTreeHighlight() {
    const items = this._content.querySelectorAll('.fm-tree-item');
    items.forEach(item => {
      item.classList.toggle('active', item.dataset.path === this._currentPath);
    });

    // 自动展开当前路径上的所有父级
    if (this._currentPath) {
      this._expandToPath(this._currentPath);
    }
  },

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
};
