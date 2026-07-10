// ============================================================
//  UI / ArrangeAnimation.js — 3D/2D 自动排列动画控制器
//  三阶段动画：fadeOut(连线渐隐) → move(节点平滑移动) → fadeIn(连线渐显)
// ============================================================
import { appState } from '../module0_AppState.js';
import { rebuildAllLines } from '../VisualComponents/index.js';
import { saveCurrentProjectData } from '../module2_TreeData.js';

// ============================================================
//  启动排列动画
// ============================================================
export function startArrangeAnimation(targetPositions, deferredEffects) {
  // 快照当前节点位置
  const startPositions = new Map();
  for (const [id, pos] of appState.positions) {
    if (id !== appState.VIRTUAL_ROOT_ID) {
      startPositions.set(id, pos.clone());
    }
  }

  appState._arrangeStartPositions = startPositions;
  appState._arrangeTargetPositions = targetPositions;
  appState._arrangeDeferredEffects = deferredEffects;
  appState.arrangeAnimActive = true;
  appState.arrangeAnimPhase = 'fadeOut';
  appState.arrangeAnimProgress = 0;
  appState._arrangeAnimLineControl = true;
}

// ============================================================
//  跳过动画，立即到最终状态
// ============================================================
export function skipArrangeAnimation() {
  if (!appState.arrangeAnimActive) return;

  const targetPositions = appState._arrangeTargetPositions;
  const deferredEffects = appState._arrangeDeferredEffects;

  // 立即应用目标位置
  if (targetPositions) {
    for (const [id, targetPos] of targetPositions) {
      appState.positions.set(id, targetPos.clone());
      const obj = appState.nodeMeshes.get(id);
      if (obj) {
        obj.mesh.position.copy(targetPos);
        if (obj.label) {
          obj.label.position.set(targetPos.x, targetPos.y + appState.NODE_RADIUS + 0.28, targetPos.z);
        }
      }
    }
  }

  // 重建连线
  rebuildAllLines();

  // 恢复连线 opacity 为 1
  for (let it of appState.lineItems) {
    it.line.setOpacity(1);
    it.line.mesh.material.transparent = false;
    if (it.line.glowTube) it.line.glowTube.material.opacity = (appState.lineGlowOpacity ?? 1);
    if (it.line.particlePoints) it.line.particlePoints.material.opacity = 1;
    if (it.line.trailPointsMerged?.material?.uniforms) {
      it.line.trailPointsMerged.material.uniforms.uOpacity.value = 0.6;
    }
  }

  // 应用延迟视觉效果
  _applyDeferredEffects(deferredEffects);

  // 重置动画状态
  _resetAnimState();

  // 重启流光动画
  const tm = appState.tm;
  for (let it of appState.lineItems) {
    if (it.line.startFlowAnimation) it.line.startFlowAnimation(tm);
  }

  // 保存
  saveCurrentProjectData();
  import('../versionGraph/versionAutoSave.js').then(({ scheduleAmend }) => {
    if (typeof scheduleAmend === 'function') scheduleAmend();
  }).catch(() => {});
}

// ============================================================
//  应用延迟视觉效果（图层高亮矩形、组群矩形、按钮等）
// ============================================================
export function _applyDeferredEffects(fx) {
  if (!fx) return;

  if (fx.layerHighlights) {
    appState.layerHighlights = fx.layerHighlights;
    for (const hl of fx.layerHighlights) appState.scene.add(hl);
  }
  if (fx.groupRectMeshes) {
    appState.groupRectMeshes = fx.groupRectMeshes;
    for (const m of fx.groupRectMeshes) appState.scene.add(m);
  }
  if (fx.layerBtnVisible) {
    const btn = document.getElementById('layerIconBtn');
    if (btn) btn.style.display = '';
  }
  if (fx.layerBtnHidden) {
    const btn = document.getElementById('layerIconBtn');
    if (btn) btn.style.display = 'none';
  }
  if (fx.type === '2DLayout') {
    appState.layer3DLayout = fx.layer3DLayout;
    appState.layer3DSpacing = fx.layer3DSpacing;
  }
}

// ============================================================
//  重置排列动画状态
// ============================================================
export function _resetAnimState() {
  appState.arrangeAnimActive = false;
  appState.arrangeAnimPhase = 'idle';
  appState.arrangeAnimProgress = 0;
  appState._arrangeAnimLineControl = false;
  appState._arrangeStartPositions = null;
  appState._arrangeTargetPositions = null;
  appState._arrangeDeferredEffects = null;
}

// ============================================================
//  ========== 2D 排列动画 ==========
// ============================================================

// ============================================================
//  启动 2D 排列动画
// ============================================================
export function startArrangeAnimation2D(targetPositions) {
  // 快照当前 2D 节点位置
  const startPositions = new Map();
  for (const [id, pos] of appState.positions2D) {
    if (id !== appState.VIRTUAL_ROOT_ID) {
      startPositions.set(id, { x: pos.x, y: pos.y });
    }
  }

  appState._arrange2DStartPositions = startPositions;
  appState._arrange2DTargetPositions = targetPositions;
  appState.arrangeAnim2DActive = true;
  appState.arrangeAnim2DPhase = 'fadeOut';
  appState.arrangeAnim2DProgress = 0;
  appState._arrange2DLineAlpha = 1;
  appState._arrange2DEased = 0;
}

// ============================================================
//  跳过 2D 排列动画，立即到最终状态
// ============================================================
export function skipArrangeAnimation2D() {
  if (!appState.arrangeAnim2DActive) return;

  const targetPositions = appState._arrange2DTargetPositions;

  // 立即应用目标位置到 positions2D
  if (targetPositions) {
    for (const [id, targetPos] of targetPositions) {
      appState.positions2D.set(id, { x: targetPos.x, y: targetPos.y });
    }
  }

  // 重置动画状态
  _resetAnimState2D();

  // 重绘
  if (typeof appState.refresh2DView === 'function') {
    appState.refresh2DView();
  }

  // 保存
  saveCurrentProjectData();
  import('../versionGraph/versionAutoSave.js').then(({ scheduleAmend }) => {
    if (typeof scheduleAmend === 'function') scheduleAmend();
  }).catch(() => {});
}

// ============================================================
//  重置 2D 排列动画状态
// ============================================================
export function _resetAnimState2D() {
  appState.arrangeAnim2DActive = false;
  appState.arrangeAnim2DPhase = 'idle';
  appState.arrangeAnim2DProgress = 0;
  appState._arrange2DStartPositions = null;
  appState._arrange2DTargetPositions = null;
  appState._arrange2DLineAlpha = 1;
  appState._arrange2DEased = 0;
}
