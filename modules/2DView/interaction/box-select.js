// ============================================================
//  2DView / interaction / box-select.js — 框选逻辑
// ============================================================

import { appState } from '../../module0_AppState.js';
import { setSelectedNode, clearSelected } from '../../SelectAndEdit/index.js';
import { hideContextMenu } from '../../module8_ContextMenu.js';
import {
  nodeHitAreas,
  boxSelectStart, boxSelectEnd,
  boxSelectCanvasStart, boxSelectCanvasEnd,
  boxSelectNodeIds, clearBoxSelectNodeIds,
  boxSelectSegKeys, clearBoxSelectSegKeys,
  setHasValidBoxSelection, setBoxSelecting
} from '../shared.js';
import { getFishboneHiddenTrunkIds, isTrunkInCurrentLayer } from '../../Fishbone/visibility.js';
import { mark2DDirty, draw } from '../render/index.js';

// 更新框选内的节点集合 + 鱼骨线段集合（线段中点落在框内即命中，与节点中心点同语义）
export function updateBoxSelectedNodes() {
  const worldMinX = Math.min(boxSelectStart.x, boxSelectEnd.x);
  const worldMaxX = Math.max(boxSelectStart.x, boxSelectEnd.x);
  const worldMinY = Math.min(boxSelectStart.y, boxSelectEnd.y);
  const worldMaxY = Math.max(boxSelectStart.y, boxSelectEnd.y);
  clearBoxSelectNodeIds();
  for (const area of nodeHitAreas) {
    if (!area.id) continue;
    const nodeCenterX = area.x + area.width / 2;
    const nodeCenterY = area.y + area.height / 2;
    if (nodeCenterX >= worldMinX && nodeCenterX <= worldMaxX &&
        nodeCenterY >= worldMinY && nodeCenterY <= worldMaxY) {
      boxSelectNodeIds.add(area.id);
    }
  }
  // 鱼骨线段：中点在框内（被折叠隐藏 / 非当前图层的干线不参与框选）
  clearBoxSelectSegKeys();
  const hiddenTrunks = getFishboneHiddenTrunkIds();
  for (const trunk of (appState.fishboneTrunks || [])) {
    if (hiddenTrunks.has(trunk.id)) continue;
    if (!isTrunkInCurrentLayer(trunk)) continue;
    const pts = trunk.points || [];
    const segs = Array.isArray(trunk.segs) ? trunk.segs : [];
    for (let i = 0; i < pts.length - 1; i++) {
      const seg = segs[i];
      if (!seg) continue;
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      if (mx >= worldMinX && mx <= worldMaxX && my >= worldMinY && my <= worldMaxY) {
        boxSelectSegKeys.add(trunk.id + '|' + seg.id);
      }
    }
  }
}

// 完成框选（鼠标抬起时）
export function finishBoxSelection(e) {
  setBoxSelecting(false);
  if (boxSelectNodeIds.size > 0 || boxSelectSegKeys.size > 0) {
    setHasValidBoxSelection(true);
    const shiftKey = e && e.shiftKey;
    if (shiftKey) appState.selectedNodeIds = new Set([...appState.selectedNodeIds, ...boxSelectNodeIds]);
    else appState.selectedNodeIds = new Set(boxSelectNodeIds);
    if (typeof setSelectedNode === 'function' && appState.selectedNodeIds.size === 1) {
      const singleId = appState.selectedNodeIds.values().next().value;
      setSelectedNode(singleId);
    }
  } else {
    setHasValidBoxSelection(false);
    if (!e?.ctrlKey) clearSelected();
    clearBoxSelectNodeIds();
    clearBoxSelectSegKeys();
  }
  mark2DDirty();
  draw();
}

// 判断画布坐标是否在框选区域内（用于右键菜单触发判定）
export function isInBoxSelectionArea(canvasPos) {
  if (boxSelectNodeIds.size === 0 && boxSelectSegKeys.size === 0) return false;
  const minX = Math.min(boxSelectCanvasStart.x, boxSelectCanvasEnd.x);
  const maxX = Math.max(boxSelectCanvasStart.x, boxSelectCanvasEnd.x);
  const minY = Math.min(boxSelectCanvasStart.y, boxSelectCanvasEnd.y);
  const maxY = Math.max(boxSelectCanvasStart.y, boxSelectCanvasEnd.y);
  const threshold = 5;
  return canvasPos.x >= minX - threshold && canvasPos.x <= maxX + threshold &&
         canvasPos.y >= minY - threshold && canvasPos.y <= maxY + threshold;
}
