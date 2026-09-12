// ============================================================
//  nodes/animations.js — 节点入场/退场/删除动画
// ============================================================
import { appState } from '../../module0_AppState.js';
import { easeOutBack, easeInBack } from './utils.js';
import { destroyNodeMeshImmediate, labelAnimScale } from './mesh.js';

const nodeAnimations = new Map();
const ANIM_DURATION_IN = 400;
const ANIM_DURATION_OUT = 300;

export function animateNodeIn(nodeId) {
  const obj = appState.nodeMeshes.get(nodeId);
  if (!obj) return;
  const startTime = performance.now();
  const targetScale = obj.mesh.scale.x || 1;
  const showEffects = !appState.simple3D;
  // 3D 模式下卡片节点始终显示球体，cardLabel 由选中逻辑控制
  obj.mesh.scale.setScalar(0.001);
  if (obj.label) { obj.label.visible = false; }
  if (obj.glowSphere) obj.glowSphere.visible = showEffects;
  if (obj.ring) obj.ring.visible = showEffects;
  if (obj.glowRing) obj.glowRing.visible = showEffects;
  if (obj.surfaceGlowSphere) obj.surfaceGlowSphere.visible = showEffects;

  function tick(now) {
    const elapsed = now - startTime;
    const t = Math.min(elapsed / ANIM_DURATION_IN, 1);
    const eased = easeOutBack(t);
    const scale = targetScale * eased;
    obj.mesh.scale.setScalar(scale);
    if (t >= 1) {
      obj.mesh.scale.setScalar(targetScale);
      if (obj.label) {
        obj.label.visible = true;
      }
      nodeAnimations.delete(nodeId);
      return;
    }
    nodeAnimations.set(nodeId, requestAnimationFrame(tick));
  }
  nodeAnimations.set(nodeId, requestAnimationFrame(tick));
}

function animateNodeOut(nodeId, onComplete) {
  const obj = appState.nodeMeshes.get(nodeId);
  if (!obj) { onComplete?.(); return; }
  if (nodeAnimations.has(nodeId)) {
    cancelAnimationFrame(nodeAnimations.get(nodeId));
    nodeAnimations.delete(nodeId);
  }

  // 收集该节点相连的连线，准备渐隐
  const connectedLines = (appState.lineItems || []).filter(
    it => it.startId === nodeId || it.endId === nodeId
  );

  const startTime = performance.now();
  const startScale = obj.mesh.scale.x || 1;
  const DUR = ANIM_DURATION_OUT;

  // 初始化连线的渐隐状态（华丽模式下）
  const showGlow = !appState.simple3D;
  if (showGlow) {
    for (const l of connectedLines) {
      if (l.line.glowTube) { l.line.glowTube.visible = true; l.line.glowTube.material.transparent = true; }
      if (l.line.particlePoints) { l.line.particlePoints.visible = true; }
    }
  }

  // 标记连线特效正在参与删除渐隐动画，渲染循环跳过其 opacity 覆盖
  appState._lineToggleAnimActive = true;

  function tick(now) {
    const elapsed = now - startTime;
    const t = Math.min(elapsed / DUR, 1);
    const eased = easeInBack(t);
    const scale = startScale * (1 - eased);
    obj.mesh.scale.setScalar(Math.max(0.001, scale));
    if (obj.label) labelAnimScale(obj.label, Math.max(0.001, scale));
    // 卡片模式：同步缩小 cardLabel
    if (obj.cardLabel) obj.cardLabel.scale.setScalar(Math.max(0.001, scale));

    // 连线渐隐：主线条 + 泛光管 + 螺旋粒子同步淡出
    const fadeOut = 1 - t; // 线性淡出
    for (const l of connectedLines) {
      l.line.setOpacity(fadeOut);
      if (showGlow) {
        if (l.line.glowTube && l.line.glowTube.material) {
          l.line.glowTube.material.opacity = fadeOut * 0.45;
        }
        if (l.line.particlePoints && l.line.particlePoints.material) {
          l.line.particlePoints.material.opacity = fadeOut;
        }
      }
      // 标签也跟着淡出
      if (l.line.trailPointsMerged) l.line.trailPointsMerged.visible = false;
    }

    if (t >= 1) {
      nodeAnimations.delete(nodeId);
      // 动画结束前先彻底隐藏连线特效，防止清除标志后渲染循环闪现
      for (const l of connectedLines) {
        if (l.line.glowTube) { l.line.glowTube.visible = false; l.line.glowTube.material.opacity = 0; }
        if (l.line.particlePoints) { l.line.particlePoints.visible = false; l.line.particlePoints.material.opacity = 0; }
      }
      appState._lineToggleAnimActive = false;
      destroyNodeMeshImmediate(nodeId);
      onComplete?.();
      return;
    }
    nodeAnimations.set(nodeId, requestAnimationFrame(tick));
  }
  nodeAnimations.set(nodeId, requestAnimationFrame(tick));
}

export function animateDeleteNode(nodeId) {
  animateNodeOut(nodeId);
}

// 供 destroyNodeMeshImmediate 取消进行中的动画
export function cancelNodeAnimation(nodeId) {
  if (nodeAnimations.has(nodeId)) {
    cancelAnimationFrame(nodeAnimations.get(nodeId));
    nodeAnimations.delete(nodeId);
  }
}
