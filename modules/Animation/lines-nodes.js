// ============================================================
//  模块14：连线更新与节点动画（由 module14_Animation.js 拆分）
//  连线流光/状态色 + 节点圆环旋转、颜色循环、LOD、标签可见性
// ============================================================
import * as THREE from 'three';
import { appState } from '../module0_AppState.js';
import { getVersionDecay } from '../versionGraph/versionAtmosphere.js';
import { _SIMPLE_COL_SEL, _SIMPLE_COL_STEP, _SIMPLE_COL_CONN, _SIMPLE_COL_DEFAULT, _FIXED_COL_STEP, _FIXED_COL_CONN, _camForward, _tmpToNode, _tmpColor, _tmpRingColor } from './share.js';
import { _setLabelVisible } from './labels.js';

export function updateLines(tm) {
  // ========== 连线更新 ==========
  for (let it of appState.lineItems) {
    if (it.line.mesh.visible) it.line.update(tm);
    const isConnectedLine = appState.connectedLineItems ? appState.connectedLineItems.has(it) : false;
    const isConnectedStepLine = appState.connectedStepLineItems ? appState.connectedStepLineItems.has(it) : false;
    // 状态缓存：状态未变时跳过 setHex（避免每帧重复 uniform 上传）
    const newState = isConnectedStepLine ? 2 : isConnectedLine ? 1 : (it.line.customColor ? -1 : 0);
    if (it.line._lastState !== newState) {
      it.line._lastState = newState;
      if (isConnectedStepLine) {
        it.line.mesh.material.color.setHex(0xAA44FF);
        it.line.mesh.material.emissive.setHex(0x8822CC);
      } else if (isConnectedLine) {
        it.line.mesh.material.color.setHex(0x4488FF);
        it.line.mesh.material.emissive.setHex(0x3366DD);
      } else if (!it.line.customColor) {
        it.line.mesh.material.color.setHex(0xffffff);
        it.line.mesh.material.emissive.setHex(0x996688);
      }
    }
    if (it.line.glowTube) {
      if (it.line._lastGlowState !== newState) {
        it.line._lastGlowState = newState;
        if (isConnectedStepLine) {
          it.line.glowTube.material.color.setHex(0xAA44FF);
        } else if (isConnectedLine) {
          it.line.glowTube.material.color.setHex(0x4488FF);
        } else if (!it.line.customColor) {
          it.line.glowTube.material.color.setHex(0xffffff);
        }
      }
      if (!appState._lineToggleAnimActive && !appState.transitionActive && !appState._arrangeAnimLineControl) {
        it.line.glowTube.material.opacity = (isConnectedStepLine || isConnectedLine)
          ? Math.max(appState.lineGlowOpacity ?? 1, 0.4)
          : (appState.lineGlowOpacity ?? 1);
      }
    }
    if (it.line.particlePoints) {
      const ppMat = it.line.particlePoints.material;
      const tpMat = it.line.trailPointsMerged?.material;
      if (!appState._lineToggleAnimActive && !appState.transitionActive && !appState._arrangeAnimLineControl) ppMat.opacity = 1.0;
      if (it.line._lastParticleState !== newState) {
        it.line._lastParticleState = newState;
        if (isConnectedStepLine) {
          ppMat.color.setHex(0xAA44FF);
          if (tpMat?.uniforms) tpMat.uniforms.uColor.value.setHex(0xAA44FF);
        } else if (isConnectedLine) {
          ppMat.color.setHex(0x4488FF);
          if (tpMat?.uniforms) tpMat.uniforms.uColor.value.setHex(0x4488FF);
        } else if (!it.line.customColor) {
          ppMat.color.setHex(0xffffff);
          if (tpMat?.uniforms) tpMat.uniforms.uColor.value.setHex(0xffffff);
        }
      }
    }
  }
}

export function updateNodeAnimations(tm, _frameDt, _frameSkipCounter) {
  // ========== 节点动画 ==========
  // 预计算相机前方向量（视锥裁剪用，复用模块级 _camForward/_tmpToNode）
  _camForward.set(0, 0, -1).applyQuaternion(appState.camera.quaternion);
  for (let [id, obj] of appState.nodeMeshes.entries()) {
    if (!obj.mesh.visible) continue;

    // F1 隐藏标签覆盖：只隐藏 3D 节点标签 Sprite，不影响动画
    if (appState._hideLabelsOverride && obj.label) {
      obj.label.visible = false;
    }

    const node = appState.nodeMap.get(id);
    const isSel = appState.selectedNodeIds.has(id);
    const isConnected = !isSel && (appState.connectedNodeIds ? appState.connectedNodeIds.has(id) : false);
    const isConnectedStep = !isSel && !isConnected && (appState.connectedStepNodeIds ? appState.connectedStepNodeIds.has(id) : false);

    // 视锥裁剪：计算节点到相机的向量（复用于 LOD 和 label），屏外节点跳过全部计算
    _tmpToNode.subVectors(obj.mesh.position, appState.camera.position);
    const _camDist = _tmpToNode.length();
    const _dotCam = _tmpToNode.dot(_camForward);
    if (_dotCam < 0 || _camDist > 80) {
      // 节点在相机背后或超远 → 隐藏 label 并跳过（回视野时下帧自动恢复）
      if (obj.label) _setLabelVisible(obj, false);
      continue;
    }

if (!appState.simple3D) {
      const factor = node ? (node.ringSpeedFactor ?? 1) : 1;
      const ringSpeed = appState.ringRotationSpeed ?? 1;
      // 版本氛围：圆环旋转速度也受衰减影响
      const _ringDecay = getVersionDecay();
      const _ringFactor = 0.005 + _ringDecay * _ringDecay * 0.995;
      if (obj.ring) {
        obj.ring.rotation.x += _frameDt * obj.ringSpeed.rx * factor * ringSpeed * _ringFactor;
        obj.ring.rotation.y += _frameDt * obj.ringSpeed.ry * factor * ringSpeed * _ringFactor;
        obj.ring.rotation.z += _frameDt * obj.ringSpeed.rz * factor * ringSpeed * _ringFactor;
        if (obj.glowRing) {
          obj.glowRing.rotation.copy(obj.ring.rotation);
        }
      }
      if (obj.glowSphere) {
        if (!obj._glowRotSeed) {
          obj._glowRotSeed = (id.split('').reduce((s, c) => s + c.charCodeAt(0), 0) % 1000) / 1000;
        }
        const glowRotSpeed = 0.003 + obj._glowRotSeed * 0.01;
        obj.glowSphere.rotation.x += glowRotSpeed;
        obj.glowSphere.rotation.y += glowRotSpeed * 0.7;
        obj.glowSphere.rotation.z += glowRotSpeed * 0.5;
      }
      if (obj.surfaceGlowSphere) {
        obj.surfaceGlowSphere.position.copy(obj.mesh.position);
        obj.surfaceGlowSphere.scale.copy(obj.mesh.scale);
        if (!obj._surfaceGlowSeed) {
          obj._surfaceGlowSeed = (id.split('').reduce((s, c) => s + c.charCodeAt(0), 0) % 1000) / 1000;
        }
        const rotSpeed = 0.002 + obj._surfaceGlowSeed * 0.008;
        obj.surfaceGlowSphere.rotation.x += rotSpeed;
        obj.surfaceGlowSphere.rotation.y += rotSpeed * 0.7;
        obj.surfaceGlowSphere.rotation.z += rotSpeed * 0.5;
      }
      const shape3D = node?.node3DShape || 'sphere';
      if (shape3D !== 'sphere') {
        if (!obj._meshRotSeed) {
          obj._meshRotSeed = (id.split('').reduce((s, c) => s + c.charCodeAt(0), 0) % 1000) / 1000;
        }
        const meshRotSpeed = 0.003 + obj._meshRotSeed * 0.008;
        obj.mesh.rotation.x += meshRotSpeed;
        obj.mesh.rotation.y += meshRotSpeed * 0.7;
        obj.mesh.rotation.z += meshRotSpeed * 0.5;
      }
    }

    if (appState.simple3D && !appState.transitionActive) {
      const simpleCol = isSel ? _SIMPLE_COL_SEL : isConnectedStep ? _SIMPLE_COL_STEP : isConnected ? _SIMPLE_COL_CONN : _SIMPLE_COL_DEFAULT;
      obj.mesh.material.color.copy(simpleCol);
      if (isSel) {
        obj.mesh.material.emissive.setHex(0xFFAA33);
        obj.mesh.material.emissiveIntensity = 0.8;
      } else if (isConnectedStep) {
        obj.mesh.material.emissive.setHex(0x8822CC);
        obj.mesh.material.emissiveIntensity = 0.5 + Math.sin(tm * 6) * 0.3;
      } else if (isConnected) {
        obj.mesh.material.emissive.setHex(0x3366DD);
        obj.mesh.material.emissiveIntensity = 0.5 + Math.sin(tm * 6) * 0.3;
      } else {
        obj.mesh.material.emissive.setHex(0x4488aa);
        obj.mesh.material.emissiveIntensity = 0.6;
      }
      if (node && node.fixedColor) {
        const col = isConnectedStep ? _SIMPLE_COL_STEP : isConnected ? _SIMPLE_COL_CONN : new THREE.Color(node.fixedColor);
        obj.mesh.material.color.copy(col);
        obj.mesh.material.emissive.copy(col);
        obj.mesh.material.emissiveIntensity = 0.6;
      }
      if (obj.label && obj.label.isSprite) {
        // 复用顶部计算的 _camDist/_dotCam，避免重复 Vector3 运算
        const shouldShow = _camDist < 35 && _dotCam > 0;
        const border = isSel ? '#FFD700' : isConnectedStep ? '#AA44FF' : isConnected ? '#4488FF' : '#aaddff';
        _setLabelVisible(obj, shouldShow, border);
      }
    } else {
      if (node && node.fixedColor) {
        const col = isConnectedStep ? _FIXED_COL_STEP : isConnected ? _FIXED_COL_CONN : _tmpColor.set(node.fixedColor);
        obj.mesh.material.color.copy(col);
        obj.mesh.material.emissive.copy(col);
        obj.mesh.material.emissiveIntensity = isSel ? 2.0 : 0.8;
        if (obj.glowSphere) obj.glowSphere.material.color.copy(col);
        if (obj.ring) obj.ring.material.color.copy(col);
        if (obj.glowRing) obj.glowRing.material.color.copy(col);
        if (obj.surfaceGlowSphere) obj.surfaceGlowSphere.material.color.copy(col);
      } else {
        if (isSel) {
          obj.mesh.material.color.setHex(0xFFD700);
          obj.mesh.material.emissive.setHex(0xFFAA33);
          obj.mesh.material.emissiveIntensity = 1.8 + Math.sin(tm * 12) * 1.2;
          if (obj.glowSphere) obj.glowSphere.material.color.setHex(0xFFAA55);
          if (obj.ring) obj.ring.material.color.setHex(0xFFCC44);
          if (obj.glowRing) obj.glowRing.material.color.setHex(0xFFCC44);
          if (obj.surfaceGlowSphere) obj.surfaceGlowSphere.material.color.setHex(0xFFAA33);
        } else if (isConnectedStep) {
          obj.mesh.material.color.setHex(0xAA44FF);
          obj.mesh.material.emissive.setHex(0x8822CC);
          obj.mesh.material.emissiveIntensity = 1.0 + Math.sin(tm * 6) * 0.5;
          if (obj.glowSphere) obj.glowSphere.material.color.setHex(0xAA44FF);
          if (obj.ring) {
            obj.ring.material.color.setHex(0xAA44FF);
            obj.ring.material.emissive.setHex(0x8822CC);
            obj.ring.material.emissiveIntensity = 1.5;
          }
          if (obj.glowRing) obj.glowRing.material.color.setHex(0xAA44FF);
          if (obj.surfaceGlowSphere) obj.surfaceGlowSphere.material.color.setHex(0xAA44FF);
        } else if (isConnected) {
          obj.mesh.material.color.setHex(0x4488FF);
          obj.mesh.material.emissive.setHex(0x3366DD);
          obj.mesh.material.emissiveIntensity = 1.0 + Math.sin(tm * 6) * 0.5;
          if (obj.glowSphere) obj.glowSphere.material.color.setHex(0x4488FF);
          if (obj.ring) {
            obj.ring.material.color.setHex(0x4488FF);
            obj.ring.material.emissive.setHex(0x3366DD);
            obj.ring.material.emissiveIntensity = 1.5;
          }
          if (obj.glowRing) obj.glowRing.material.color.setHex(0x4488FF);
          if (obj.surfaceGlowSphere) obj.surfaceGlowSphere.material.color.setHex(0x4488FF);
        } else if (_frameSkipCounter === 0) {  // HSL 节流：每 2 帧更新一次
          // HSL 参数仅依赖 id，缓存到 obj._colorParams 避免每 2 帧重复字符串哈希
          if (!obj._colorParams) {
            let hash = 0;
            for (let i = 0; i < id.length; i++) {
              hash = ((hash << 5) - hash) + id.charCodeAt(i);
              hash |= 0;
            }
            const seed = (hash % 1000 + 1000) % 1000 / 1000;
            const ringSeed = (seed * 17) % 1;
            obj._colorParams = {
              seed,
              hSpeed: 0.05 + seed * 0.1,
              sSpeed: 0.04 + seed * 0.06,
              lSpeed: 0.03 + seed * 0.05,
              hPhase: seed * Math.PI * 2,
              sPhase: (seed * 3.7) % 1 * Math.PI * 2,
              lPhase: (seed * 7.3) % 1 * Math.PI * 2,
              ringSeed,
              ringHSpeed: 0.06 + ringSeed * 0.08,
              ringSSpeed: 0.05 + ringSeed * 0.05,
              ringLSpeed: 0.04 + ringSeed * 0.04,
              ringHPhase: ringSeed * Math.PI * 2,
              ringSPhase: (ringSeed * 5.3) % 1 * Math.PI * 2,
              ringLPhase: (ringSeed * 11.7) % 1 * Math.PI * 2,
              ringPhaseOffset: ringSeed * 20,
            };
          }
          const p = obj._colorParams;
          const hue = (tm * p.hSpeed + p.hPhase) % 1;
          const saturation = 0.5 + 0.5 * (Math.sin(tm * p.sSpeed + p.sPhase) * 0.5 + 0.5);
          const lightness = 0.3 + 0.3 * (Math.sin(tm * p.lSpeed + p.lPhase) * 0.5 + 0.3);
          _tmpColor.setHSL(hue, saturation, lightness);
          obj.mesh.material.color.copy(_tmpColor);
          obj.mesh.material.emissive.copy(_tmpColor);
          obj.mesh.material.emissiveIntensity = 0.6 + Math.sin(tm * 1.2) * 0.3;
          if (obj.glowSphere) obj.glowSphere.material.color.copy(_tmpColor);
          if (obj.surfaceGlowSphere) obj.surfaceGlowSphere.material.color.copy(_tmpColor);

          if (obj.ring) {
            const ringHue = (tm * p.ringHSpeed + p.ringHPhase) % 1;
            const ringSat = 0.5 + 0.5 * (Math.sin(tm * p.ringSSpeed + p.ringSPhase) * 0.5 + 0.5);
            const ringLight = 0.2 + 0.4 * (Math.sin(tm * p.ringLSpeed + p.ringLPhase) * 0.5 + 0.5);
            _tmpRingColor.setHSL(ringHue, ringSat, ringLight);
            obj.ring.material.color.copy(_tmpRingColor);
            obj.ring.material.emissive.copy(_tmpRingColor);
            obj.ring.material.emissiveIntensity = 1.2 + Math.sin(tm * 0.6 + p.ringPhaseOffset) * 0.4;
            if (obj.glowRing) obj.glowRing.material.color.copy(_tmpRingColor);
          }
        }
      }

      // 🎯 远距离节点 LOD：基于相机距离分级显示子对象，减少 draw call
      // 复用顶部计算的 _camDist，避免重复 Vector3 运算
      const camDist = _camDist;
      // LOD 阈值：<25 完整效果；25-50 简化（隐藏 glow/glowRing）；>50 仅主球+ring
      const showFullEffects = camDist < 25;
      const showReducedEffects = camDist < 50;

      if (obj.ring) {
        obj.ring.visible = showReducedEffects && appState.ringVisible !== false && obj.mesh.visible;
      }
      if (obj.glowSphere) {
        // 远距离用 opacity 渐变避免硬切换跳变
        const lodOpacity = showFullEffects ? appState.nodeGlowOpacity : 0;
        obj.glowSphere.material.opacity = lodOpacity;
        obj.glowSphere.visible = lodOpacity > 0 && obj.mesh.visible;
      }
      if (obj.glowRing) {
        const lodOpacity = showFullEffects ? appState.ringGlowOpacity : 0;
        obj.glowRing.material.opacity = lodOpacity;
        obj.glowRing.visible = lodOpacity > 0 && appState.ringVisible !== false && obj.mesh.visible;
      }
      if (obj.surfaceGlowSphere) {
        const lodOpacity = showReducedEffects ? appState.surfaceGlowOpacity : 0;
        obj.surfaceGlowSphere.material.opacity = lodOpacity;
        obj.surfaceGlowSphere.visible = lodOpacity > 0 && obj.mesh.visible;
      }
    }

    // 缓存节点颜色 hex 字符串，供 2D 视图绘制边框时直接读取（避免每节点 getHexString float→hex 转换）
    if (obj.mesh?.material?.color) obj._borderColorHex = '#' + obj.mesh.material.color.getHexString();

    // 🏷️ 相机视锥 LOD：距离超 35 或在相机后方时渐隐标签
    // 复用顶部计算的 _camDist/_dotCam，避免重复 Vector3 运算
    // 性能关键：hsl 默认边框随 tm 连续变化，若在极简模式也执行，会导致
    // 每帧每节点重建标签 Sprite 纹理（2 canvas + GPU 上传），节点多时严重卡顿。
    // 极简模式的标签已由上方 simple 分支用静态边框处理，这里仅华丽模式执行。
    if (obj.label && !appState.simple3D) {
      const shouldShow = _camDist < 35 && _dotCam > 0;
      // 色相量化到 5° 步进：hsl 每帧连续变化会让标签 Sprite 每帧重建纹理（2 canvas + GPU 上传），
      // 量化后约每 5~8 帧才变一次色，重绘频率降 ~6 倍，视觉几乎无感
      const _labelHue = (tm * 0.08 * 360 + (id.charCodeAt(0) || 0) * 20) % 360;
      const border = isSel ? "#FFD700" : isConnectedStep ? "#AA44FF" : isConnected ? "#4488FF" : `hsl(${Math.round(_labelHue / 5) * 5},80%,65%)`;
      _setLabelVisible(obj, shouldShow, border);
    }
  }
}