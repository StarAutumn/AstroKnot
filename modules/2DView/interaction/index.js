// ============================================================
//  2DView / interaction / index.js — 2D 交互模块入口
//  - 注册 canvas 事件监听
//  - 注册 appState 回调
//  - 汇总对外 API（保持与原 Interaction.js 兼容）
// ============================================================

import { appState } from '../../module0_AppState.js';
import { copySelectedNodes, pasteNodes } from '../../MoveMode/move-mode/index.js';
import { cancelConnectionMode } from '../../module5_SelectAndEdit.js';
import { isInputActive } from '../../UI/shared.js';
import {
  canvas,
  hoveredNodeId, setHoveredNodeId, setQuickAddHover,
  pendingMultiMove, setPendingMultiMove,
  selectedGroupRectId, groupRects,
  isFreeDrawing
} from '../shared.js';
import { draw, mark2DDirty, setPostDrawHook } from '../render/index.js';

// 子模块
import { syncCardOverlays, removeCardOverlay, removeWebpageOverlay } from './card-overlays.js';
import {
  onMouseDown, onMouseMove, onMouseUp, onWheel, onDoubleClick
} from './mouse-events.js';
import { onContextMenu, hideGroupContextMenu } from './context-menu.js';
import { cancelFreeDraw } from './free-draw.js';
import { groupNodes, deleteSelectedGroupRect, startMultiNodeMove } from './group-nodes.js';
import { alignSelectedNodesHorizontal, alignSelectedNodesVertical } from './align.js';
import {
  autoArrangeTreeLayout, computeAutoArrangeTargets, arrangeSubtreeIncremental
} from './auto-layout.js';
import {
  focusOnNode2D, zoom2D, reset2DView, process2DPanning, get2DKeys, set2DKey
} from './view-controls.js';

// ============================================================
//  初始化交互事件（由 Core.init2DView 调用）
// ============================================================
export function initInteractionEvents() {
  // 注册 draw() 后回调，同步卡片正文 DOM overlay
  setPostDrawHook(syncCardOverlays);

  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('dblclick', onDoubleClick);
  canvas.addEventListener('contextmenu', onContextMenu);
  // 鼠标离开画布时清除悬停状态
  canvas.addEventListener('mouseleave', () => {
    if (hoveredNodeId) { setHoveredNodeId(null); setQuickAddHover(null); draw(); }
  });

  window.addEventListener('keydown', (e) => {
    if (isInputActive()) return;
    // 仅当处于 2D 视图时处理节点复制粘贴，避免与 Keyboard.js 重复触发
    if (!appState.is2DView) return;
    if (e.ctrlKey && e.key === 'c') {
      e.preventDefault();
      copySelectedNodes();
      return;
    }
    if (e.ctrlKey && e.key === 'v') {
      e.preventDefault();
      pasteNodes();
      return;
    }
    if (e.key === 'Escape') {
      if (pendingMultiMove) {
        setPendingMultiMove(false);
        canvas.style.cursor = 'grab';
      }
      if (isFreeDrawing) {
        cancelFreeDraw();
      }
      hideGroupContextMenu();
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedGroupRectId) {
      e.preventDefault();
      deleteSelectedGroupRect();
    }
  });

  // 对齐按钮
  document.getElementById('alignTopBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    alignSelectedNodesHorizontal('top');
  });
  document.getElementById('alignHCenterBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    alignSelectedNodesHorizontal('center');
  });
  document.getElementById('alignBottomBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    alignSelectedNodesHorizontal('bottom');
  });
  document.getElementById('alignLeftBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    alignSelectedNodesVertical('left');
  });
  document.getElementById('alignVCenterBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    alignSelectedNodesVertical('center');
  });
  document.getElementById('alignRightBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    alignSelectedNodesVertical('right');
  });

  // 组群按钮
  document.getElementById('groupNodesBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    groupNodes();
  });

  // 组群右键菜单事件绑定
  const updateGroupRectFromMenu = () => {
    const gr = groupRects.find(g => g.id === selectedGroupRectId);
    if (!gr) return;
    gr.name = document.getElementById('groupNameInput').value || '';
    gr.fillColor = document.getElementById('groupFillColorPicker').value;
    gr.borderColor = document.getElementById('groupBorderColorPicker').value;
    gr.lineWidth = parseFloat(document.getElementById('groupLineWidthSlider').value);
    document.getElementById('groupLineWidthValue').textContent = gr.lineWidth;
    gr.lineStyle = document.getElementById('groupLineStyleSelect').value;
    gr.borderRadius = parseInt(document.getElementById('groupBorderRadiusSelect').value, 10);
    mark2DDirty();
    draw();
  };
  document.getElementById('groupNameInput')?.addEventListener('input', updateGroupRectFromMenu);
  document.getElementById('groupFillColorPicker')?.addEventListener('input', updateGroupRectFromMenu);
  document.getElementById('groupBorderColorPicker')?.addEventListener('input', updateGroupRectFromMenu);
  document.getElementById('groupLineWidthSlider')?.addEventListener('input', updateGroupRectFromMenu);
  document.getElementById('groupLineStyleSelect')?.addEventListener('change', updateGroupRectFromMenu);
  document.getElementById('groupBorderRadiusSelect')?.addEventListener('change', updateGroupRectFromMenu);
  document.getElementById('deleteGroupRectBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteSelectedGroupRect();
    hideGroupContextMenu();
  });

  // 点击外部关闭组群菜单
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('groupContextMenu');
    if (menu && menu.style.display !== 'none' && !menu.contains(e.target) && e.button !== 2) {
      hideGroupContextMenu();
    }
  });
}

// ============================================================
//  注册 appState 回调（模块加载时执行）
// ============================================================
appState.focusOnNode2D = focusOnNode2D;
appState.zoom2D = zoom2D;
appState.reset2DView = reset2DView;
appState.autoArrangeTreeLayout = autoArrangeTreeLayout;
appState.computeAutoArrangeTargets = computeAutoArrangeTargets;
appState.arrangeSubtreeIncremental = arrangeSubtreeIncremental;

appState.startMultiNodeMove = startMultiNodeMove;
appState.process2DPanning = process2DPanning;
appState.get2DKeys = get2DKeys;
appState.set2DKey = set2DKey;

// ============================================================
//  对外导出（与原 Interaction.js 完全兼容）
// ============================================================
export {
  syncCardOverlays, removeCardOverlay, removeWebpageOverlay,
  focusOnNode2D, startMultiNodeMove,
  groupNodes, autoArrangeTreeLayout, computeAutoArrangeTargets,
  zoom2D, reset2DView,
  process2DPanning, get2DKeys, set2DKey
};
