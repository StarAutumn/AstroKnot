// ============================================================
//  2DView / interaction / coordinate-utils.js — 坐标转换与几何工具
// ============================================================

import { canvas, transform } from '../shared.js';

// 画布坐标 → 世界坐标
export function canvasToWorld(canvasX, canvasY) {
  return {
    x: (canvasX - canvas.width / 2 - transform.offsetX) / transform.scale,
    y: (canvasY - canvas.height / 2 - transform.offsetY) / transform.scale
  };
}

// 鼠标事件 → 画布坐标
export function getCanvasPos(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

// 点到线段距离
export function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
  const A = px - x1;
  const B = py - y1;
  const C = x2 - x1;
  const D = y2 - y1;
  const dot = A * C + B * D;
  const len_sq = C * C + D * D;
  let param = -1;
  if (len_sq !== 0) param = dot / len_sq;
  let xx, yy;
  if (param < 0) { xx = x1; yy = y1; }
  else if (param > 1) { xx = x2; yy = y2; }
  else { xx = x1 + param * C; yy = y1 + param * D; }
  return Math.sqrt((px - xx) ** 2 + (py - yy) ** 2);
}
