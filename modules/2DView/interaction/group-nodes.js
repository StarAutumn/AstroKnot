// ============================================================
//  2DView / interaction / group-nodes.js — 多节点移动、组群矩形、节点边界
// ============================================================

import { appState } from '../../module0_AppState.js';
import {
  canvas,
  boxSelectStart, boxSelectEnd,
  boxSelectNodeIds, groupRects, selectedGroupRectId, setSelectedGroupRectId,
  setPendingMultiMove,
  nodeHitAreas,
  getNodeLayoutSize
} from '../shared.js';
import { hideContextMenu } from '../../module8_ContextMenu.js';
import { mark2DDirty, draw } from '../render/index.js';
import { withHistory } from '../../module3_History.js';

// 启动多节点移动模式（按钮触发）
export function startMultiNodeMove() {
  if (boxSelectNodeIds.size === 0) return;
  hideContextMenu();
  setPendingMultiMove(true);
  canvas.style.cursor = 'move';
}

// 根据当前框选范围创建组群矩形
export const groupNodes = withHistory(function () {
  const minX = Math.min(boxSelectStart.x, boxSelectEnd.x);
  const maxX = Math.max(boxSelectStart.x, boxSelectEnd.x);
  const minY = Math.min(boxSelectStart.y, boxSelectEnd.y);
  const maxY = Math.max(boxSelectStart.y, boxSelectEnd.y);
  const w = maxX - minX;
  const h = maxY - minY;

  if (w < 5 || h < 5) return;

  // 引入 nodeHitAreas 用于查找框选范围内的节点
  const boundNodeIds = [];
  for (const area of nodeHitAreas) {
    if (!area.id) continue;
    const cx = area.x + area.width / 2;
    const cy = area.y + area.height / 2;
    if (cx >= minX && cx <= maxX && cy >= minY && cy <= maxY) {
      boundNodeIds.push(area.id);
    }
  }

  groupRects.push({
    id: 'group-' + Date.now(),
    layerId: appState.currentLayerId,
    x: minX,
    y: minY,
    width: w,
    height: h,
    name: '',
    fillColor: '#4a3c7e',
    fillOpacity: 0.25,
    borderColor: '#7a6aae',
    borderRadius: 0,
    lineStyle: 'dashed',
    lineWidth: 1.5,
    nodeIds: boundNodeIds,
  });

  hideContextMenu();
  mark2DDirty();
  draw();
});

// 删除当前选中的组群矩形
export const deleteSelectedGroupRect = withHistory(function () {
  if (!selectedGroupRectId) return;
  for (let i = 0; i < groupRects.length; i++) {
    if (groupRects[i].id === selectedGroupRectId) {
      groupRects.splice(i, 1);
      break;
    }
  }
  setSelectedGroupRectId(null);
  mark2DDirty();
  draw();
});

// 获取节点在 2D 视图中的边界矩形
export function getNodeBounds2D(nodeId) {
  const pos = appState.positions2D.get(nodeId);
  const node = appState.nodeMap.get(nodeId);
  if (!pos || !node) return null;
  const scale = node.sizeScale || 1;
  const { width: w, height: h } = getNodeLayoutSize(node, scale);
  return { x: pos.x, y: pos.y, width: w, height: h };
}
