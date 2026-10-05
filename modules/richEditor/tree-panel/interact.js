// ============================================================
//  richEditor/tree-panel/interact.js — 树形面板交互与侧栏绑定
//  - 键盘状态写入/焦点判断、节点居中、面板刷新
//  - 搜索绑定、侧栏容器（折叠/拖宽/触摸）绑定
// ============================================================
import { appState } from '../../module0_AppState.js';
import { instances, getActiveState } from './share.js';
import { getSidebarNodeSize } from './draw-nodes.js';
import { drawSidebar2D } from './render.js';
import { renderLayerStrip } from './layer-strip.js';
import { blurActiveEditor, resizeSidebarCanvas, initSidebar2DView } from './index.js';

export function setSidebar2DKey(key, value) {
  for (const [_, s] of instances) {
    if (document.activeElement === s.canvas && key in s.keys) {
      s.keys[key] = value;
      return;
    }
  }
  const s = getActiveState();
  if (s && key in s.keys) s.keys[key] = value;
}

export function isSidebar2DFocused() {
  for (const [_, s] of instances) {
    if (document.activeElement === s.canvas) return true;
  }
  return false;
}

// ── 居中定位 ──
export function centerOnNode(nodeId) {
  const pos = appState.positions2D.get(nodeId);
  const s = getActiveState();
  if (!pos || !s || !s.canvas) return false;
  const node = appState.nodeMap.get(nodeId);
  const scale = node?.sizeScale || 1;
  // 卡片模式使用卡片尺寸居中，普通节点使用自适应宽度
  const { width: nw, height: nh } = getSidebarNodeSize(node, scale, s.ctx);
  const nodeCX = pos.x + nw / 2;
  const nodeCY = pos.y + nh / 2;
  // 如果是当前正在编辑的节点，不设置 highlightedNodeId（已有绿色高亮）
  if (nodeId !== appState.currentEditNodeId) {
    s.highlightedNodeId = nodeId;
  }
  s.transform.offsetX = -nodeCX * s.transform.scale;
  s.transform.offsetY = -nodeCY * s.transform.scale;
  drawSidebar2D(s);
  return true;
}

export function refreshTreePanel() {
  for (const [_, s] of instances) resizeSidebarCanvas(s);
  // 同时刷新层数条
  for (const id of ['treeLayerStrip']) {
    renderLayerStrip(id);
  }
}

// ── 搜索绑定 ──
export function bindSidebarSearch() {
  const searchInput = document.getElementById('treeSearchInput');
  if (!searchInput) return;

  let searchDropdown = document.getElementById('treeSearchDropdown');
  if (!searchDropdown) {
    searchDropdown = document.createElement('div');
    searchDropdown.id = 'treeSearchDropdown';
    searchDropdown.style.cssText = 'display:none;position:absolute;top:100%;left:0;right:0;background:rgba(10,25,40,0.96);border:1px solid rgba(0,255,255,0.5);border-radius:0 0 12px 12px;max-height:200px;overflow-y:auto;z-index:5000;box-shadow:0 8px 24px rgba(0,0,0,0.7);';
    const searchContainer = searchInput.parentElement;
    if (searchContainer) {
      searchContainer.style.position = 'relative';
      searchContainer.appendChild(searchDropdown);
    }
  }

  searchInput.addEventListener('input', () => {
    const kw = searchInput.value.trim().toLowerCase();
    if (!kw || !appState.methodsTree) {
      searchDropdown.style.display = 'none';
      return;
    }

    const matches = [];
    for (const [id, node] of appState.nodeMap.entries()) {
      if (node.name.toLowerCase().includes(kw) || id.toLowerCase().includes(kw)) {
        matches.push({ id, name: node.name });
      }
    }

    if (matches.length === 0) {
      searchDropdown.style.display = 'none';
      return;
    }

    searchDropdown.innerHTML = '';
    matches.slice(0, 15).forEach(m => {
      const item = document.createElement('div');
      item.style.cssText = 'padding:8px 12px;cursor:pointer;color:#c0f0ff;font-size:13px;border-bottom:1px solid rgba(0,255,255,0.1);transition:background 0.15s;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
      item.textContent = m.name;
      item.addEventListener('mouseenter', () => { item.style.background = 'rgba(0,255,255,0.12)'; });
      item.addEventListener('mouseleave', () => { item.style.background = ''; });
      item.addEventListener('click', () => {
        searchInput.value = '';
        searchDropdown.style.display = 'none';
        centerOnNode(m.id);
        const s = getActiveState();
        if (s?.canvas) {
          s.canvas.focus();
          blurActiveEditor();
        }
      });
      searchDropdown.appendChild(item);
    });
    searchDropdown.style.display = 'block';
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      searchDropdown.style.display = 'none';
      searchInput.blur();
    }
  });

  document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !searchDropdown.contains(e.target)) {
      searchDropdown.style.display = 'none';
    }
  });
}

export function bindTreeSidebar() {
  const treeSidebar = document.getElementById('treeSidebar');
  const toggleTreeBtn = document.getElementById('toggleTreeBtn');
  const resizeHandle = document.getElementById('treeResizeHandle');

  initSidebar2DView();

  bindSidebarSearch();

  let isResizingTree = false;
  let startXTree, startWidthTree, savedWidth = 260;

  function setCollapsed(collapsed) {
    if (!treeSidebar) return;
    if (collapsed) {
      treeSidebar.classList.add('collapsed');
      treeSidebar.style.width = '0';
      if (toggleTreeBtn) toggleTreeBtn.textContent = '▶';
    } else {
      treeSidebar.classList.remove('collapsed');
      treeSidebar.style.width = savedWidth + 'px';
      if (toggleTreeBtn) toggleTreeBtn.textContent = '◀';
      setTimeout(() => {
        for (const [_, s] of instances) resizeSidebarCanvas(s);
      }, 100);
    }
  }

  if (toggleTreeBtn) {
    toggleTreeBtn.textContent = treeSidebar.classList.contains('collapsed') ? '▶' : '◀';
    toggleTreeBtn.removeEventListener('click', () => { });
    toggleTreeBtn.addEventListener('click', () => {
      const collapsed = treeSidebar.classList.contains('collapsed');
      setCollapsed(!collapsed);
    });
  }

  if (resizeHandle && treeSidebar) {
    let rafIdTree = null;
    let pendingWidth = 0;

    resizeHandle.addEventListener('mousedown', (e) => {
      if (treeSidebar.classList.contains('collapsed')) return;
      e.preventDefault();
      isResizingTree = true;
      startXTree = e.clientX;
      startWidthTree = treeSidebar.offsetWidth;
      pendingWidth = startWidthTree;
      resizeHandle.classList.add('active');
      treeSidebar.classList.add('resizing'); // 禁用 width 过渡，避免追赶滞后
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
    });

    window.addEventListener('mousemove', (e) => {
      if (!isResizingTree) return;
      const delta = e.clientX - startXTree;
      pendingWidth = Math.max(150, startWidthTree + delta);
      // rAF 节流：一帧只触发一次回流
      if (rafIdTree === null) {
        rafIdTree = requestAnimationFrame(() => {
          rafIdTree = null;
          treeSidebar.style.width = pendingWidth + 'px';
        });
      }
    });

    window.addEventListener('mouseup', () => {
      if (!isResizingTree) return;
      isResizingTree = false;
      // 取消未执行的 rAF，立即落定最终宽度
      if (rafIdTree !== null) {
        cancelAnimationFrame(rafIdTree);
        rafIdTree = null;
      }
      treeSidebar.style.width = pendingWidth + 'px';
      savedWidth = pendingWidth;
      treeSidebar.classList.remove('resizing');
      resizeHandle.classList.remove('active');
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      // canvas 重绘延后到下一帧，避免与 mouseup 回流叠加
      requestAnimationFrame(() => {
        for (const [_, s] of instances) resizeSidebarCanvas(s);
      });
    });

    // ── 触摸拖拽调宽（平板端）：按住分割线左右拖动，鼠标路径不受影响 ──
    resizeHandle.style.touchAction = 'none'; // 禁止浏览器滚动/系统手势抢占触摸事件
    resizeHandle.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return; // 鼠标走原 mousedown 逻辑
      if (treeSidebar.classList.contains('collapsed')) return;
      e.preventDefault();
      resizeHandle.setPointerCapture(e.pointerId);
      const startX = e.clientX;
      const startWidth = treeSidebar.offsetWidth;
      resizeHandle.classList.add('active');
      treeSidebar.classList.add('resizing'); // 禁用 width 过渡，避免追赶滞后

      const tMove = (ev) => {
        const w = Math.max(150, startWidth + (ev.clientX - startX));
        treeSidebar.style.width = w + 'px';
      };
      const tEnd = () => {
        resizeHandle.removeEventListener('pointermove', tMove);
        resizeHandle.removeEventListener('pointerup', tEnd);
        resizeHandle.removeEventListener('pointercancel', tEnd);
        // 落定最终宽度并保存
        const finalWidth = parseFloat(treeSidebar.style.width) || startWidth;
        savedWidth = finalWidth;
        treeSidebar.classList.remove('resizing');
        resizeHandle.classList.remove('active');
        // canvas 重绘延后到下一帧，避免与抬起手势回流叠加
        requestAnimationFrame(() => {
          for (const [_, s] of instances) resizeSidebarCanvas(s);
        });
      };
      resizeHandle.addEventListener('pointermove', tMove);
      resizeHandle.addEventListener('pointerup', tEnd);
      resizeHandle.addEventListener('pointercancel', tEnd);
    });
  }

  if (!treeSidebar.classList.contains('collapsed')) {
    setTimeout(() => {
      for (const [_, s] of instances) resizeSidebarCanvas(s);
    }, 100);
  }
}
