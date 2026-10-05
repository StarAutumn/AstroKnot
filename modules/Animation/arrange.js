// ============================================================
//  模块14：排列/相机动画（由 module14_Animation.js 拆分）
//  相机飞行、3D 排列动画（fadeOut/move/fadeIn）、2D 排列动画
// ============================================================
import { appState } from '../module0_AppState.js';
import { rebuildAllLines } from '../VisualComponents/index.js';
import { saveCurrentProjectData } from '../TreeData/index.js';
import { redraw2DView, mark2DDirty } from '../2DView/Core.js';
import { updateFishboneArrangeAnimation, cancelFishboneArrangeAnimation, rebuildFishbone3D } from '../Fishbone/render3d.js';

export function updateCameraAnimation(_frameDt) {
  // ========== 相机动画 ==========
  if (appState.cameraAnimActive && appState.cameraAnimTarget) {
    const dt = _frameDt;
    const speed = dt / appState.cameraAnimDuration;
    appState.cameraAnimProgress = Math.min(1, appState.cameraAnimProgress + speed);
    const t = appState.cameraAnimProgress;
    const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    appState.camera.position.lerpVectors(
      appState.cameraAnimStartPos,
      appState.cameraAnimTarget.cameraPos,
      eased
    );
    appState.controls.target.lerpVectors(
      appState.cameraAnimStartTarget,
      appState.cameraAnimTarget.controlsTarget,
      eased
    );
    if (appState.cameraAnimProgress >= 1.0) {
      appState.camera.position.copy(appState.cameraAnimTarget.cameraPos);
      appState.controls.target.copy(appState.cameraAnimTarget.controlsTarget);
      appState.cameraAnimActive = false;
      appState.cameraAnimTarget = null;
    }
  }
}

export function updateArrange3D(tm, _frameDt) {
  // ========== 3D 排列动画 ==========
  if (appState.arrangeAnimActive) {
    const dt = _frameDt;

    if (appState.arrangeAnimPhase === 'fadeOut') {
      const speed = dt / appState.arrangeAnimFadeOutDuration;
      appState.arrangeAnimProgress = Math.min(1, appState.arrangeAnimProgress + speed);
      const raw = appState.arrangeAnimProgress;
      const eased = 1 - Math.pow(1 - raw, 3);  // cubic ease-out

      // 所有连线组件渐隐
      const lineOp = 1 - eased;
      for (let it of appState.lineItems) {
        it.line.setOpacity(lineOp);
        if (it.line.glowTube) it.line.glowTube.material.opacity = lineOp * (appState.lineGlowOpacity ?? 1);
        if (it.line.particlePoints) it.line.particlePoints.material.opacity = lineOp;
        if (it.line.trailPointsMerged?.material?.uniforms) {
          it.line.trailPointsMerged.material.uniforms.uOpacity.value = lineOp * 0.6;
        }
      }

      // 鱼骨线螺旋粒子同步渐隐（管线/辉光保持可见并随节点移动）
      for (const fit of (appState.fishboneLineItems || [])) {
        if (fit.line.particlePoints) fit.line.particlePoints.material.opacity = lineOp;
        if (fit.line.trailPointsMerged?.material?.uniforms) {
          fit.line.trailPointsMerged.material.uniforms.uOpacity.value = lineOp * 0.6;
        }
      }

      if (raw >= 1) {
        // 确保连线完全不可见
        for (let it of appState.lineItems) {
          it.line.setOpacity(0);
          if (it.line.glowTube) it.line.glowTube.material.opacity = 0;
          if (it.line.particlePoints) it.line.particlePoints.material.opacity = 0;
          if (it.line.trailPointsMerged?.material?.uniforms) {
            it.line.trailPointsMerged.material.uniforms.uOpacity.value = 0;
          }
        }
        // 鱼骨线螺旋粒子完全隐藏
        for (const fit of (appState.fishboneLineItems || [])) {
          if (fit.line.particlePoints) fit.line.particlePoints.material.opacity = 0;
          if (fit.line.trailPointsMerged?.material?.uniforms) {
            fit.line.trailPointsMerged.material.uniforms.uOpacity.value = 0;
          }
        }
        // 切换到移动阶段
        appState.arrangeAnimPhase = 'move';
        appState.arrangeAnimProgress = 0;
      }
    }

    else if (appState.arrangeAnimPhase === 'move') {
      const speed = dt / appState.arrangeAnimMoveDuration;
      appState.arrangeAnimProgress = Math.min(1, appState.arrangeAnimProgress + speed);
      const t = appState.arrangeAnimProgress;
      // cubic ease-in-out
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

      // 节点位置插值
      const startPositions = appState._arrangeStartPositions;
      const targetPositions = appState._arrangeTargetPositions;
      if (startPositions && targetPositions) {
        for (const [id, startPos] of startPositions) {
          const targetPos = targetPositions.get(id);
          if (!targetPos) continue;

          const cx = startPos.x + (targetPos.x - startPos.x) * eased;
          const cy = startPos.y + (targetPos.y - startPos.y) * eased;
          const cz = startPos.z + (targetPos.z - startPos.z) * eased;

          const pos = appState.positions.get(id);
          if (pos) pos.set(cx, cy, cz);

          const obj = appState.nodeMeshes.get(id);
          if (obj) {
            obj.mesh.position.set(cx, cy, cz);
            if (obj.label) {
              obj.label.position.set(cx, cy + appState.NODE_RADIUS + 0.28, cz);
            }
          }
        }
      }

      // 鱼骨线随节点同步移动（与节点同一缓动插值，末点吸附节点动画位）
      updateFishboneArrangeAnimation(eased);

      // 连线保持透明
      for (let it of appState.lineItems) {
        it.line.setOpacity(0);
        if (it.line.glowTube) it.line.glowTube.material.opacity = 0;
        if (it.line.particlePoints) it.line.particlePoints.material.opacity = 0;
        if (it.line.trailPointsMerged?.material?.uniforms) {
          it.line.trailPointsMerged.material.uniforms.uOpacity.value = 0;
        }
      }

      // 鱼骨线螺旋粒子保持隐藏（管线本体可见并随节点移动）
      for (const fit of (appState.fishboneLineItems || [])) {
        if (fit.line.particlePoints) fit.line.particlePoints.material.opacity = 0;
        if (fit.line.trailPointsMerged?.material?.uniforms) {
          fit.line.trailPointsMerged.material.uniforms.uOpacity.value = 0;
        }
      }

      if (t >= 1) {
        // Snap 到最终位置
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

        // 应用延迟视觉效果（图层高亮矩形、组群矩形）
        const fx = appState._arrangeDeferredEffects;
        if (fx) {
          if (fx.layerHighlights && fx.layerHighlights.length > 0) {
            appState.layerHighlights = fx.layerHighlights;
            for (const hl of fx.layerHighlights) appState.scene.add(hl);
          }
          if (fx.groupRectMeshes && fx.groupRectMeshes.length > 0) {
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

        // 在最终位置重建连线
        rebuildAllLines();

        // 鱼骨线动画收尾：清状态并按最终模式强制重建落定
        cancelFishboneArrangeAnimation();
        rebuildFishbone3D(true);

        // 重建后立即隐藏粒子并从源头重启流动：
        // 渐显阶段粒子只从源头出现，不再先显示旧散布状态（消除卡顿感）
        for (let it of appState.lineItems) {
          it.line.setOpacity(0);
          if (it.line.glowTube) it.line.glowTube.material.opacity = 0;
          if (it.line.particlePoints) it.line.particlePoints.material.opacity = 0;
          if (it.line.trailPointsMerged?.material?.uniforms) {
            it.line.trailPointsMerged.material.uniforms.uOpacity.value = 0;
          }
          if (it.line.startFlowAnimation) it.line.startFlowAnimation(tm);
        }
        for (const fit of (appState.fishboneLineItems || [])) {
          if (fit.line.particlePoints) fit.line.particlePoints.material.opacity = 0;
          if (fit.line.trailPointsMerged?.material?.uniforms) {
            fit.line.trailPointsMerged.material.uniforms.uOpacity.value = 0;
          }
          if (fit.line.startFlowAnimation) fit.line.startFlowAnimation(tm);
        }

        // 切换到渐显阶段
        appState.arrangeAnimPhase = 'fadeIn';
        appState.arrangeAnimProgress = 0;
      }
    }

    else if (appState.arrangeAnimPhase === 'fadeIn') {
      const speed = dt / appState.arrangeAnimFadeInDuration;
      appState.arrangeAnimProgress = Math.min(1, appState.arrangeAnimProgress + speed);
      const raw = appState.arrangeAnimProgress;
      const eased = 1 - Math.pow(1 - raw, 3);  // cubic ease-out

      // 所有连线组件渐显
      for (let it of appState.lineItems) {
        it.line.setOpacity(eased);
        if (it.line.glowTube) it.line.glowTube.material.opacity = eased * (appState.lineGlowOpacity ?? 1);
        if (it.line.particlePoints) it.line.particlePoints.material.opacity = eased;
        if (it.line.trailPointsMerged?.material?.uniforms) {
          it.line.trailPointsMerged.material.uniforms.uOpacity.value = eased * 0.6;
        }
      }

      // 鱼骨线螺旋粒子渐现（管线本体在 move 结束后已按最终模式重建）
      for (const fit of (appState.fishboneLineItems || [])) {
        if (fit.line.particlePoints) fit.line.particlePoints.material.opacity = eased;
        if (fit.line.trailPointsMerged?.material?.uniforms) {
          fit.line.trailPointsMerged.material.uniforms.uOpacity.value = eased * 0.6;
        }
      }

      if (raw >= 1) {
        // 动画完成，重置状态（流光已在 move 结束时从源头重启，此处不再二次重启，
        // 避免粒子渐显完成后突然消失再从源头重来的跳变）
        appState.arrangeAnimActive = false;
        appState.arrangeAnimPhase = 'idle';
        appState.arrangeAnimProgress = 0;
        appState._arrangeAnimLineControl = false;
        appState._arrangeStartPositions = null;
        appState._arrangeTargetPositions = null;
        appState._arrangeDeferredEffects = null;

        // 保存项目数据
        saveCurrentProjectData();
        import('../versionGraph/versionAutoSave.js').then(({ scheduleAmend }) => {
          if (typeof scheduleAmend === 'function') scheduleAmend();
        }).catch(() => {});
      }
    }
  }
}

export function updateArrange2D(_frameDt) {
  // ========== 2D 排列动画 ==========
  if (appState.arrangeAnim2DActive) {
    const dt2D = _frameDt;

    if (appState.arrangeAnim2DPhase === 'fadeOut') {
      const speed = dt2D / appState.arrangeAnim2DFadeOutDuration;
      appState.arrangeAnim2DProgress = Math.min(1, appState.arrangeAnim2DProgress + speed);
      const raw = appState.arrangeAnim2DProgress;
      const eased = 1 - Math.pow(1 - raw, 3);  // cubic ease-out
      appState._arrange2DLineAlpha = 1 - eased;
      appState._arrange2DEased = 0;

      if (raw >= 1) {
        appState._arrange2DLineAlpha = 0;
        appState.arrangeAnim2DPhase = 'move';
        appState.arrangeAnim2DProgress = 0;
      }
    }

    else if (appState.arrangeAnim2DPhase === 'move') {
      const speed = dt2D / appState.arrangeAnim2DMoveDuration;
      appState.arrangeAnim2DProgress = Math.min(1, appState.arrangeAnim2DProgress + speed);
      const t = appState.arrangeAnim2DProgress;
      // cubic ease-in-out
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      appState._arrange2DEased = eased;
      appState._arrange2DLineAlpha = 0;

      if (t >= 1) {
        // Snap 到最终位置
        const targetPositions = appState._arrange2DTargetPositions;
        if (targetPositions) {
          for (const [id, targetPos] of targetPositions) {
            appState.positions2D.set(id, { x: targetPos.x, y: targetPos.y });
          }
        }

        // 标记布局脏 + 重绘
        mark2DDirty();

        appState.arrangeAnim2DPhase = 'fadeIn';
        appState.arrangeAnim2DProgress = 0;
        appState._arrange2DEased = 1;
      }
    }

    else if (appState.arrangeAnim2DPhase === 'fadeIn') {
      const speed = dt2D / appState.arrangeAnim2DFadeInDuration;
      appState.arrangeAnim2DProgress = Math.min(1, appState.arrangeAnim2DProgress + speed);
      const raw = appState.arrangeAnim2DProgress;
      const eased = 1 - Math.pow(1 - raw, 3);  // cubic ease-out
      appState._arrange2DLineAlpha = eased;
      appState._arrange2DEased = 1;

      if (raw >= 1) {
        // 动画完成
        appState.arrangeAnim2DActive = false;
        appState.arrangeAnim2DPhase = 'idle';
        appState.arrangeAnim2DProgress = 0;
        appState._arrange2DStartPositions = null;
        appState._arrange2DTargetPositions = null;
        appState._arrange2DLineAlpha = 1;
        appState._arrange2DEased = 0;

        // 保存
        saveCurrentProjectData();
        import('../versionGraph/versionAutoSave.js').then(({ scheduleAmend }) => {
          if (typeof scheduleAmend === 'function') scheduleAmend();
        }).catch(() => {});
      }
    }

    // 每帧触发 2D 重绘
    redraw2DView();
  }
}