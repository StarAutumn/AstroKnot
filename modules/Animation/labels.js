// ============================================================
//  模块14：标签可见性 / Sprite 重绘（由 module14_Animation.js 拆分）
//  按距离排序 z-index（DOM 标签遗留空实现）、视锥裁剪标签可见性
// ============================================================
import * as THREE from 'three';
import { appState } from '../module0_AppState.js';
import { renderLabelCanvas, LABEL_BASE_SCALE } from '../VisualComponents/nodes/label-canvas.js';

// ── 按距离排序标签 z-index：距离近的 z-index 高，避免远处标签遮挡近处元素 ──
// Sprite 标签参与深度缓冲，此函数仅用于 DOM 标签（已弃用），保留空实现
export function _updateLabelZIndices() {}

// label 视锥裁剪：Sprite 标签直接设置 visible
const _labelHideTimers = new Map();
export function _setLabelVisible(obj, shouldShow, borderColor) {
  if (!obj.label) return;
  // F1 隐藏覆盖：优先保持隐藏
  if (appState._hideLabelsOverride) { obj.label.visible = false; return; }
  obj.label.visible = shouldShow;
  // 选中状态改变标签颜色（重绘 Sprite 纹理）
  // 性能关键：仅当边框颜色或节点名实际变化时才重绘（之前每帧每节点重建
  // 2 个 canvas + 1 次 GPU 纹理上传，节点多时是卡顿主因）
  if (shouldShow && borderColor !== undefined && obj.label.material) {
    const node = appState.nodeMap.get(obj.label.userData._labelNodeId);
    if (node && (obj.label._lastBorder !== borderColor || obj.label._lastLabelName !== node.name)) {
      _redrawLabelSprite(obj.label, node.name, borderColor);
      obj.label._lastBorder = borderColor;
      obj.label._lastLabelName = node.name;
    }
  }
}

// 重绘标签 Sprite 纹理（更新边框颜色；绘制统一走 label-canvas.js 共享渲染，保留折叠徽标 a/b）
function _redrawLabelSprite(sprite, text, borderColor) {
  const { canvas, bgW, bgH } = renderLabelCanvas(text, sprite.userData._labelBadge || null, borderColor);

  if (sprite.material.map) sprite.material.map.dispose();
  sprite.material.map = new THREE.CanvasTexture(canvas);
  sprite.material.needsUpdate = true;

  // 更新 Sprite 宽高比
  const aspect = bgW / bgH;
  sprite.scale.set(LABEL_BASE_SCALE * aspect, LABEL_BASE_SCALE, 1);
  sprite.userData._labelBaseW = LABEL_BASE_SCALE * aspect;
  sprite.userData._labelBaseH = LABEL_BASE_SCALE;
}