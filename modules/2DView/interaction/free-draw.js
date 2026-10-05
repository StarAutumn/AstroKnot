// ============================================================
//  2DView / interaction / free-draw.js — 自由绘制连线管理
// ============================================================

import {
  canvas, isFreeDrawing, setFreeDrawing, freeDrawState, setFreeDrawState
} from '../shared.js';
import { completeAddConnectionWithWaypoints } from '../../SelectAndEdit/index.js';

export function startFreeDraw(sourceNodeId, sourceAnchor) {
  setFreeDrawing(true);
  setFreeDrawState({
    sourceNodeId,
    sourceAnchor,
    waypoints: [],
    currentMousePos: null,
    targetNodeId: null,
    targetAnchor: null
  });
  canvas.style.cursor = 'crosshair';
}

export function addFreeDrawWaypoint(worldX, worldY) {
  if (!freeDrawState) return;
  freeDrawState.waypoints.push({ x: worldX, y: worldY });
}

export function updateFreeDrawMousePos(worldX, worldY) {
  if (!freeDrawState) return;
  freeDrawState.currentMousePos = { x: worldX, y: worldY };
}

export function cancelFreeDraw() {
  setFreeDrawing(false);
  setFreeDrawState(null);
  canvas.style.cursor = 'grab';
}

export function completeFreeDraw(targetNodeId, targetAnchor) {
  if (!freeDrawState) return;
  const state = { ...freeDrawState };
  cancelFreeDraw();
  // 调用带 waypoint 的完成连线函数
  completeAddConnectionWithWaypoints(
    state.sourceNodeId, state.sourceAnchor,
    targetNodeId, targetAnchor,
    state.waypoints
  );
}
