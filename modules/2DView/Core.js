// ============================================================
//  2DView / Core.js — 核心生命周期
//  负责 canvas 初始化、显示/隐藏/切换动画、刷新
// ============================================================

import { appState } from '../module0_AppState.js';
import { updateLinesVis, clearAllCardOverlays3D, fadeCardOverlays3D, setViewTransitioning } from '../VisualComponents/index.js';
import { saveCurrentProjectData } from '../TreeData/index.js';
import { showToast } from '../SelectAndEdit/index.js';
import {
  initCanvas, canvas, ctx, container, visible, setVisible,
  transform, setTransform, TRANSITION_DURATION,
  setNodeHitAreas, setLineHitAreas,
  setBoxSelecting, clearBoxSelectNodeIds, setHasValidBoxSelection,
  setAnimations, sync2DSettings
} from './shared.js';
import { draw, mark2DDirty } from './render/index.js';
export { mark2DDirty };
import { initInteractionEvents, syncCardOverlays } from './interaction/index.js';

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

  // ── 应用拖拽支持：从应用库拖拽到 2D 画布生成节点 ──
  cv.addEventListener('dragover', (e) => {
    if (e.dataTransfer.types.includes('application/x-astroknot-app')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  });
  cv.addEventListener('drop', (e) => {
    const appId = e.dataTransfer.getData('application/x-astroknot-app');
    if (!appId) return;
    e.preventDefault();

    // 计算 2D 世界坐标（与 placeNodeIn2D 中的公式一致）
    const rect = cv.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const tf = appState.view2DTransform;
    const wx = (cx - cv.width / 2 - tf.offsetX) / tf.scale;
    const wy = (cy - cv.height / 2 - tf.offsetY) / tf.scale;

    // 设置侧边栏世界坐标，让 createNodeInProject → placeNodeIn2D 使用此位置
    appState._isSidebarContextMenu = true;
    appState._sidebarWorldPos = { x: wx, y: wy };

    if (window.AppManager) {
      window.AppManager.insertAsNode(appId, null).then(node => {
        if (node) {
          showToast(`已从应用创建节点: ${node.name}`, 2000);
        }
      }).catch(err => {
        console.error('[2D View] 从应用创建节点失败:', err);
        showToast(`创建失败: ${err.message}`, 3000);
      });
    }
  });

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
  // 切换到 2D 视图时渐隐 3D 卡片正文 overlay（与2D展开动画同步）
  fadeCardOverlays3D(0, TRANSITION_DURATION);
  // 视图过渡期间保留 3D 卡片可见，由 2D canvas clipPath 动画自然覆盖
  setViewTransitioning(true);
  sync2DSettings();
  resizeCanvas();
  // 兜底置脏：3D 模式期间的任何数据变更（增删节点/连线等）在进入 2D 时强制重算布局，
  // 保证 2D 呈现与 3D 操作实时同步（新节点出现、已删节点消失）
  mark2DDirty();
  draw();
  updateModeBtnText();
  if (appState.updateGlowBtnText) appState.updateGlowBtnText();

  // 2D overlay 容器跟随渐入
  const overlay2D = document.getElementById('astroknot-card-overlays');

  if (noAnimation) {
    container.style.transition = 'none';
    container.style.opacity = '1';
    container.style.clipPath = '';
    container.style.webkitClipPath = '';
    container._transitioning = false;
    if (overlay2D) { overlay2D.style.transition = 'none'; overlay2D.style.opacity = '1'; }
    setViewTransitioning(false);
    return;
  }

  container.style.transition = 'none';
  container.style.opacity = '0';
  container.style.clipPath = 'circle(0% at 50% 50%)';
  container.style.webkitClipPath = 'circle(0% at 50% 50%)';
  container._transitioning = true;
  if (overlay2D) { overlay2D.style.transition = 'none'; overlay2D.style.opacity = '0'; }
  void container.offsetHeight;

  const tr = `clip-path ${TRANSITION_DURATION}ms cubic-bezier(0.4, 0.0, 0.2, 1), opacity ${TRANSITION_DURATION}ms cubic-bezier(0.4, 0.0, 0.2, 1)`;
  container.style.transition = tr;
  container.style.opacity = '1';
  container.style.webkitClipPath = `circle(100% at 50% 50%)`;
  container.style.clipPath = `circle(100% at 50% 50%)`;
  if (overlay2D) { overlay2D.style.transition = `opacity ${TRANSITION_DURATION}ms cubic-bezier(0.4, 0.0, 0.2, 1)`; overlay2D.style.opacity = '1'; }

  setTimeout(() => {
    container.style.transition = 'none';
    container._transitioning = false;
    if (overlay2D) overlay2D.style.transition = 'none';
    setViewTransitioning(false);
  }, TRANSITION_DURATION + 50);
}

// -------- 隐藏 2D 视图（径向收缩动画）--------
export function hide2DView() {
  if (!container || container._transitioning) return;
  if (!visible) return;

  // 2D overlay 容器跟随渐出
  const overlay2D = document.getElementById('astroknot-card-overlays');

  // 视图过渡期间保留 3D 卡片可见，由 2D canvas clipPath 动画自然揭示
  setViewTransitioning(true);

  container.style.transition = 'none';
  container.style.opacity = '1';
  container.style.clipPath = 'circle(100% at 50% 50%)';
  container.style.webkitClipPath = 'circle(100% at 50% 50%)';
  container.style.pointerEvents = 'none';
  container._transitioning = true;
  if (overlay2D) { overlay2D.style.transition = 'none'; overlay2D.style.opacity = '1'; }
  void container.offsetHeight;

  const tr = `clip-path ${TRANSITION_DURATION}ms cubic-bezier(0.4, 0.0, 0.2, 1), opacity ${TRANSITION_DURATION}ms cubic-bezier(0.4, 0.0, 0.2, 1)`;
  container.style.transition = tr;
  container.style.opacity = '0';
  container.style.webkitClipPath = `circle(0% at 50% 50%)`;
  container.style.clipPath = `circle(0% at 50% 50%)`;
  if (overlay2D) { overlay2D.style.transition = `opacity ${TRANSITION_DURATION}ms cubic-bezier(0.4, 0.0, 0.2, 1)`; overlay2D.style.opacity = '0'; }

  // 3D overlay 容器渐入
  fadeCardOverlays3D(1, TRANSITION_DURATION);

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
    // 隐藏卡片正文 DOM overlay（切换到 3D 时）
    syncCardOverlays();
    saveCurrentProjectData();
    updateModeBtnText();
    if (appState.updateGlowBtnText) appState.updateGlowBtnText();
    updateLinesVis();
    setViewTransitioning(false);
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