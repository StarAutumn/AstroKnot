// ============================================================
//  2DView / interaction / align.js — 节点对齐
// ============================================================

import { appState } from '../../module0_AppState.js';
import {
  boxSelectNodeIds,
  clearBoxSelectNodeIds, setHasValidBoxSelection
} from '../shared.js';
import { hideContextMenu } from '../../module8_ContextMenu.js';
import { mark2DDirty, draw } from '../render/index.js';
import { saveCurrentProjectData } from '../../TreeData/index.js';
import { withHistory } from '../../module3_History.js';
import { getNodeBounds2D } from './group-nodes.js';

// 水平对齐（top/center/bottom）
export const alignSelectedNodesHorizontal = withHistory(function (type) {
  const selectedIds = boxSelectNodeIds.size > 0 ? boxSelectNodeIds : appState.selectedNodeIds;
  if (!selectedIds || selectedIds.size < 2) return;

  const bounds = [];
  let minTop = Infinity, maxBottom = -Infinity, sumCenterY = 0;

  for (const id of selectedIds) {
    const b = getNodeBounds2D(id);
    if (!b) continue;
    bounds.push({ id, bounds: b });
    minTop = Math.min(minTop, b.y);
    maxBottom = Math.max(maxBottom, b.y + b.height);
    sumCenterY += b.y + b.height / 2;
  }

  if (bounds.length < 2) return;

  const avgCenterY = sumCenterY / bounds.length;

  for (const item of bounds) {
    const pos = appState.positions2D.get(item.id);
    if (!pos) continue;
    if (type === 'top') pos.y = minTop;
    else if (type === 'center') pos.y = avgCenterY - item.bounds.height / 2;
    else if (type === 'bottom') pos.y = maxBottom - item.bounds.height;
    appState.positions2D.set(item.id, { x: pos.x, y: pos.y });
  }

  hideContextMenu();
  clearBoxSelectNodeIds();
  setHasValidBoxSelection(false);
  mark2DDirty();
  draw();
  saveCurrentProjectData();
});

// 垂直对齐（left/center/right）
export const alignSelectedNodesVertical = withHistory(function (type) {
  const selectedIds = boxSelectNodeIds.size > 0 ? boxSelectNodeIds : appState.selectedNodeIds;
  if (!selectedIds || selectedIds.size < 2) return;

  const bounds = [];
  let minLeft = Infinity, maxRight = -Infinity, sumCenterX = 0;

  for (const id of selectedIds) {
    const b = getNodeBounds2D(id);
    if (!b) continue;
    bounds.push({ id, bounds: b });
    minLeft = Math.min(minLeft, b.x);
    maxRight = Math.max(maxRight, b.x + b.width);
    sumCenterX += b.x + b.width / 2;
  }

  if (bounds.length < 2) return;

  const avgCenterX = sumCenterX / bounds.length;

  for (const item of bounds) {
    const pos = appState.positions2D.get(item.id);
    if (!pos) continue;
    if (type === 'left') pos.x = minLeft;
    else if (type === 'center') pos.x = avgCenterX - item.bounds.width / 2;
    else if (type === 'right') pos.x = maxRight - item.bounds.width;
    appState.positions2D.set(item.id, { x: pos.x, y: pos.y });
  }

  hideContextMenu();
  clearBoxSelectNodeIds();
  setHasValidBoxSelection(false);
  mark2DDirty();
  draw();
  saveCurrentProjectData();
});
