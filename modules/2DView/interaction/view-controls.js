// ============================================================
//  2DView / interaction / view-controls.js — 视图缩放/重置/平移/键盘/聚焦
// ============================================================

import { appState } from '../../module0_AppState.js';
import {
  canvas, visible, transform,
  keys2D, PAN_SPEED
} from '../shared.js';
import { draw } from '../render/index.js';
import { canvasToWorld } from './coordinate-utils.js';

// 聚焦到指定节点（带 600ms 动画）
export function focusOnNode2D(nodeId) {
  const pos = appState.positions2D.get(nodeId);
  if (!pos) return;
  const centerWorld = canvasToWorld(canvas.width / 2, canvas.height / 2);
  const targetOffsetX = transform.offsetX + (centerWorld.x - pos.x) * transform.scale;
  const targetOffsetY = transform.offsetY + (centerWorld.y - pos.y) * transform.scale;
  const startOffsetX = transform.offsetX;
  const startOffsetY = transform.offsetY;
  const startScale = transform.scale;
  const targetScale = 1.0;
  const duration = 600;
  const startTime = performance.now();
  function animateFocus(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
    transform.offsetX = startOffsetX + (targetOffsetX - startOffsetX) * eased;
    transform.offsetY = startOffsetY + (targetOffsetY - startOffsetY) * eased;
    transform.scale = startScale + (targetScale - startScale) * eased;
    draw();
    if (progress < 1) requestAnimationFrame(animateFocus);
    else {
      transform.offsetX = targetOffsetX;
      transform.offsetY = targetOffsetY;
      transform.scale = targetScale;
      draw();
    }
  }
  requestAnimationFrame(animateFocus);
}

// 缩放
export function zoom2D(factor) {
  transform.scale *= factor;
  transform.scale = Math.max(0.1, Math.min(3, transform.scale));
  draw();
}

// 重置视图
export function reset2DView() {
  transform.offsetX = 0;
  transform.offsetY = 0;
  transform.scale = 1;
  draw();
}

// 键盘平移
export function process2DPanning() {
  if (!visible || !appState.is2DView) return;
  let dx = 0, dy = 0;
  if (keys2D.a || keys2D.ArrowLeft) dx += PAN_SPEED;
  if (keys2D.d || keys2D.ArrowRight) dx -= PAN_SPEED;
  if (keys2D.w || keys2D.ArrowUp) dy += PAN_SPEED;
  if (keys2D.s || keys2D.ArrowDown) dy -= PAN_SPEED;
  if (dx !== 0 || dy !== 0) {
    transform.offsetX += dx;
    transform.offsetY += dy;
    draw();
  }
}

export function get2DKeys() { return keys2D; }
export function set2DKey(key, value) { if (key in keys2D) keys2D[key] = value; }
