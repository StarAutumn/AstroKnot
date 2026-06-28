// ============================================================
//  2DView / Core.js — 核心生命周期
//  负责 canvas 初始化、显示/隐藏/切换动画、刷新
// ============================================================

import { appState } from '../module0_AppState.js';
import { updateLinesVis } from '../VisualComponents/index.js';
import { saveCurrentProjectData } from '../module2_TreeData.js';
import {
  initCanvas, canvas, ctx, container, visible, setVisible,
  transform, setTransform, TRANSITION_DURATION,
  setNodeHitAreas, setLineHitAreas,
  setBoxSelecting, clearBoxSelectNodeIds, setHasValidBoxSelection,
  setAnimations, sync2DSettings
} from './shared.js';
import { draw, mark2DDirty } from './Render.js';
import { initInteractionEvents } from './Interaction.js';

// -------- 初始化 2D 视图 --------
export function init2DView() {
  const c = document.getElementById('view2dContainer');
  const cv = document.getElementById('view2dCanvas');
  if (!c || !cv) return;

  initCanvas(cv, c);
  container.style.display = 'none';

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // 注册交互事件（由 Interaction.js 负责）
  initInteractionEvents();

  // 挂载 appState 回调
  appState.refresh2DView = refresh2DView;
  appState.redraw2DView = redraw2DView;
  appState.toggle2DCollapse = toggle2DCollapse;
  appState.view2DTransform = transform;
  appState.show2DView = show2DView;
  appState.hide2DView = hide2DView;
}

// -------- 显示 2D 视图（径向展开动画）--------
export function show2DView(noAnimation) {
  if (!container || container._transitioning) return;
  container.style.display = 'block';
  setVisible(true);
  appState.is2DView = true;
  sync2DSettings();
  resizeCanvas();
  draw();
  updateModeBtnText();
  if (appState.updateGlowBtnText) appState.updateGlowBtnText();

  if (noAnimation) {
    container.style.transition = 'none';
    container.style.opacity = '1';
    container.style.clipPath = '';
    container.style.webkitClipPath = '';
    container._transitioning = false;
    return;
  }

  container.style.transition = 'none';
  container.style.opacity = '0';
  container.style.clipPath = 'circle(0% at 50% 50%)';
  container.style.webkitClipPath = 'circle(0% at 50% 50%)';
  container._transitioning = true;
  void container.offsetHeight;

  container.style.transition = `clip-path ${TRANSITION_DURATION}ms cubic-bezier(0.4, 0.0, 0.2, 1), opacity ${TRANSITION_DURATION}ms cubic-bezier(0.4, 0.0, 0.2, 1)`;
  container.style.opacity = '1';
  container.style.webkitClipPath = `circle(100% at 50% 50%)`;
  container.style.clipPath = `circle(100% at 50% 50%)`;

  setTimeout(() => {
    container.style.transition = 'none';
    container._transitioning = false;
  }, TRANSITION_DURATION + 50);
}

// -------- 隐藏 2D 视图（径向收缩动画）--------
export function hide2DView() {
  if (!container || container._transitioning) return;
  if (!visible) return;

  container.style.transition = 'none';
  container.style.opacity = '1';
  container.style.clipPath = 'circle(100% at 50% 50%)';
  container.style.webkitClipPath = 'circle(100% at 50% 50%)';
  container.style.pointerEvents = 'none';
  container._transitioning = true;
  void container.offsetHeight;

  container.style.transition = `clip-path ${TRANSITION_DURATION}ms cubic-bezier(0.4, 0.0, 0.2, 1), opacity ${TRANSITION_DURATION}ms cubic-bezier(0.4, 0.0, 0.2, 1)`;
  container.style.opacity = '0';
  container.style.webkitClipPath = `circle(0% at 50% 50%)`;
  container.style.clipPath = `circle(0% at 50% 50%)`;

  setTimeout(() => {
    container.style.display = 'none';
    container.style.opacity = '';
    container.style.clipPath = '';
    container.style.webkitClipPath = '';
    container.style.pointerEvents = '';
    container.style.transition = 'none';
    container._transitioning = false;
    setVisible(false);
    appState.is2DView = false;
    setBoxSelecting(false);
    clearBoxSelectNodeIds();
    setHasValidBoxSelection(false);
    saveCurrentProjectData();
    updateModeBtnText();
    if (appState.updateGlowBtnText) appState.updateGlowBtnText();
    updateLinesVis();
  }, TRANSITION_DURATION + 50);
}

// -------- 切换 2D 视图 --------
export function toggle2DView() {
  if (container && container._transitioning) return;
  if (visible) hide2DView();
  else show2DView();
}

// -------- 刷新 2D 视图（数据变更用：置脏 + 重绘） --------
export function refresh2DView() {
  mark2DDirty();
  if (visible) draw();
}

// -------- 仅重绘 2D 视图（动画帧用：复用布局缓存，不重算） --------
export function redraw2DView() {
  if (visible) draw();
}

// -------- 切换到指定图层并刷新 --------
export function switchLayerAndRefresh(layerId) {
  appState.switchLayer(layerId);
  if (visible) draw();
}

// -------- 画布大小调整 --------
export function resizeCanvas() {
  if (!canvas || !container) return;
  const rect = container.getBoundingClientRect();
  canvas.width = Math.round(rect.width);
  canvas.height = Math.round(rect.height);
  mark2DDirty();
  if (visible) draw();
}

// -------- 折叠/展开动画触发 --------
export function toggle2DCollapse(nodeId) {
  if (!visible || !appState.nodeMap.has(nodeId)) return;
  const wasCollapsed = appState.collapsed2D.has(nodeId);
  const direction = wasCollapsed ? 'expand' : 'collapse';
  const anims = [];
  const currentAnims = (typeof animations !== 'undefined' ? animations : []);
  for (const a of currentAnims) {
    if (a.nodeId !== nodeId) anims.push(a);
  }
  anims.push({ nodeId, direction, startTime: performance.now(), duration: 300 });
  setAnimations(anims);
  mark2DDirty();
  requestAnimationFrame(() => draw());
}

// -------- 更新模式切换按钮文字 --------
function updateModeBtnText() {
  const btn = document.getElementById('modeToggleBtn');
  if (btn) btn.textContent = appState.is2DView ? '🪐 3D' : '⑂ 2D';
}