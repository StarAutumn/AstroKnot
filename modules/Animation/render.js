// ============================================================
//  模块14：粒子透明度过渡与帧渲染（由 module14_Animation.js 拆分）
//  连线螺旋粒子可见性过渡 + 波纹更新 + 3D 渲染收尾
// ============================================================
import { appState } from '../module0_AppState.js';
import { updateCardBillboards } from '../VisualComponents/index.js';
import { _updateLabelZIndices } from './labels.js';

export function updateParticleOpacityTransition() {
  // ========== 连线螺旋粒子可见性动画过渡 ==========
  if (appState._particleAnimOpacity === undefined) appState._particleAnimOpacity = 1;
  const targetParticleVis = appState.particleVisible ? 1 : 0;
  const diff = targetParticleVis - appState._particleAnimOpacity;
  if (Math.abs(diff) > 0.001) {
    appState._particleAnimOpacity += Math.sign(diff) * 0.03;
    appState._particleAnimOpacity = Math.max(0, Math.min(1, appState._particleAnimOpacity));
  } else {
    appState._particleAnimOpacity = targetParticleVis;
  }
  const pOpacity = appState._particleAnimOpacity;

  // 应用到连线粒子（Points 对象）
  for (let it of appState.lineItems) {
    if (it.line.particlePoints && !appState._lineToggleAnimActive && !appState.transitionActive && !appState._arrangeAnimLineControl) {
      it.line.particlePoints.material.opacity *= pOpacity;
      if (it.line.trailPointsMerged?.material?.uniforms) {
        const cur = it.line.trailPointsMerged.material.uniforms.uOpacity.value;
        it.line.trailPointsMerged.material.uniforms.uOpacity.value = cur * pOpacity;
      }
    }
  }

  // 应用到鱼骨主干连线粒子
  for (const fit of (appState.fishboneLineItems || [])) {
    if (fit.line.particlePoints && !appState._lineToggleAnimActive && !appState.transitionActive && !appState._arrangeAnimLineControl) {
      fit.line.particlePoints.material.opacity *= pOpacity;
      if (fit.line.trailPointsMerged?.material?.uniforms) {
        const cur = fit.line.trailPointsMerged.material.uniforms.uOpacity.value;
        fit.line.trailPointsMerged.material.uniforms.uOpacity.value = cur * pOpacity;
      }
    }
  }
}

export function renderFrame(tm) {
  // ========== 图层水面波纹更新 ==========
  if (appState.layerHighlights) {
    for (const hl of appState.layerHighlights) {
      if (hl.material && hl.material.uniforms && hl.material.uniforms.uTime) {
        hl.material.uniforms.uTime.value = tm;
      }
    }
  }

  // ========== 渲染 ==========
  try {
    // 2D 模式跳过整条 3D 渲染管线（billboard/composer/bloom/labelRenderer 均不可见）；
    // 视图过渡期间继续渲染：3D→2D 展开时背景 3D 动画不冻结，2D→3D 收缩时 3D 即时可见动画中
    if (!appState.is2DView || appState._viewTransitioning) {
      updateCardBillboards(tm);
      _updateLabelZIndices();  // 按距离排序标签 z-index，避免远处标签遮挡近处元素
      appState.controls.update();
      // 极简模式直接 renderer.render，跳过 Bloom 后处理链（省 GPU）
      if (appState.simple3D && appState.renderer) {
        appState.renderer.render(appState.scene, appState.camera);
      } else {
        appState.effectComposer.render();
      }
      appState.labelRenderer.render(appState.scene, appState.camera);
    }
  } catch (e) { console.error('渲染异常:', e); }

  if (appState.is2DView && typeof appState.redraw2DView === 'function') {
    appState.redraw2DView();
  }
}