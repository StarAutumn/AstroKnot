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

// 横向等距排列：最左/最右节点不动，中间节点按边缘间距均分（等距 gap）
export const distributeSelectedNodesHorizontal = withHistory(function () {
  const selectedIds = boxSelectNodeIds.size > 0 ? boxSelectNodeIds : appState.selectedNodeIds;
  if (!selectedIds || selectedIds.size < 3) return;

  const items = [];
  for (const id of selectedIds) {
    const b = getNodeBounds2D(id);
    if (!b) continue;
    items.push({ id, x: b.x, width: b.width });
  }
  if (items.length < 3) return;

  items.sort((a, b) => a.x - b.x);
  const first = items[0], last = items[items.length - 1];
  const sumW = items.reduce((s, it) => s + it.width, 0);
  const gap = ((last.x + last.width) - first.x - sumW) / (items.length - 1);

  let cursor = first.x;
  for (const it of items) {
    const pos = appState.positions2D.get(it.id);
    if (!pos) continue;
    appState.positions2D.set(it.id, { x: cursor, y: pos.y });
    cursor += it.width + gap;
  }

  hideContextMenu();
  clearBoxSelectNodeIds();
  setHasValidBoxSelection(false);
  mark2DDirty();
  draw();
  saveCurrentProjectData();
});

// 纵向等距排列：最上/最下节点不动，中间节点按边缘间距均分（等距 gap）
export const distributeSelectedNodesVertical = withHistory(function () {
  const selectedIds = boxSelectNodeIds.size > 0 ? boxSelectNodeIds : appState.selectedNodeIds;
  if (!selectedIds || selectedIds.size < 3) return;

  const items = [];
  for (const id of selectedIds) {
    const b = getNodeBounds2D(id);
    if (!b) continue;
    items.push({ id, y: b.y, height: b.height });
  }
  if (items.length < 3) return;

  items.sort((a, b) => a.y - b.y);
  const first = items[0], last = items[items.length - 1];
  const sumH = items.reduce((s, it) => s + it.height, 0);
  const gap = ((last.y + last.height) - first.y - sumH) / (items.length - 1);

  let cursor = first.y;
  for (const it of items) {
    const pos = appState.positions2D.get(it.id);
    if (!pos) continue;
    appState.positions2D.set(it.id, { x: pos.x, y: cursor });
    cursor += it.height + gap;
  }

  hideContextMenu();
  clearBoxSelectNodeIds();
  setHasValidBoxSelection(false);
  mark2DDirty();
  draw();
  saveCurrentProjectData();
});
