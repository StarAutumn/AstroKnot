// ============================================================
//  模块14：动画循环（使用 appState）
//  每帧更新：粒子透明度、星云颜色、连线流动、节点外观、灯光强度等
// ============================================================
import * as THREE from 'three';
import { appState } from './module0_AppState.js';
import { processMovement } from './UI/Keyboard.js';
import { _bumpRenderFrame } from './VisualComponents/index.js';
import { getVersionDecay } from './versionGraph/versionAtmosphere.js';

let tm = 0;
let _frameSkipCounter = 0;  // HSL 节流用：每 2 帧更新一次非选中节点 HSL 颜色

// 极简模式颜色常量（避免每帧每节点 new THREE.Color() 造成 GC 压力）
const _SIMPLE_COL_SEL = new THREE.Color(0xFFD700);
const _SIMPLE_COL_STEP = new THREE.Color(0xAA44FF);
const _SIMPLE_COL_CONN = new THREE.Color(0x4488FF);
const _SIMPLE_COL_DEFAULT = new THREE.Color(0xaaddff);

// 华丽模式 fixedColor 分支颜色常量
const _FIXED_COL_STEP = new THREE.Color(0xAA44FF);
const _FIXED_COL_CONN = new THREE.Color(0x4488FF);

// 华丽模式选中/连接状态颜色常量（避免每帧每节点 setHex 重复解析）
const _LUXE_COL_SEL = new THREE.Color(0xFFD700);
const _LUXE_COL_SEL_GLOW = new THREE.Color(0xFFAA55);
const _LUXE_COL_SEL_RING = new THREE.Color(0xFFCC44);
const _LUXE_COL_SEL_SURF = new THREE.Color(0xFFAA33);
const _LUXE_COL_STEP = new THREE.Color(0xAA44FF);
const _LUXE_COL_CONN = new THREE.Color(0x4488FF);

// 复用临时向量/颜色，避免每帧每节点 new
const _camForward = new THREE.Vector3();
const _tmpToNode = new THREE.Vector3();
const _tmpColor = new THREE.Color();
const _tmpRingColor = new THREE.Color();

// label 视锥裁剪：opacity=0 后延迟 display:none，避免 DOM 仍占布局/渲染开销
// _labelHideTimers 记录每个节点的延迟隐藏定时器，避免重复调度
const _labelHideTimers = new Map();
function _setLabelVisible(obj, shouldShow, borderColor) {
  const el = obj.label && obj.label.element;
  if (!el) return;
  if (shouldShow) {
    // 取消可能挂起的隐藏定时器
    const t = _labelHideTimers.get(obj);
    if (t) { clearTimeout(t); _labelHideTimers.delete(obj); }
    if (el.style.display === 'none') el.style.display = '';  // 恢复布局
    obj.label.visible = true;
    el.style.opacity = '1';
    if (borderColor !== undefined) el.style.borderColor = borderColor;
  } else {
    el.style.opacity = '0';
    // 延迟 120ms 后 display:none，避免频繁切换 + 给淡出动画时间
    if (!_labelHideTimers.has(obj)) {
      const timer = setTimeout(() => {
        _labelHideTimers.delete(obj);
        if (obj.label && obj.label.element && obj.label.element.style.opacity === '0') {
          obj.label.element.style.display = 'none';
        }
      }, 120);
      _labelHideTimers.set(obj, timer);
    }
  }
}

// 自定义天空球引用缓存（避免每帧 scene.children.find 遍历）
let _customSkySphereCache = null;
let _customSkyCacheKey = null;

// 流星生成/更新复用临时向量
const _meteorStart = new THREE.Vector3();
const _meteorTarget = new THREE.Vector3();
const _meteorDir = new THREE.Vector3();
const _meteorDelta = new THREE.Vector3();
export function animate() {
  requestAnimationFrame(animate);
  if (document.hidden) return;                        // 页面隐藏时跳过渲染，减少 GPU 压力
  _frameSkipCounter = (_frameSkipCounter + 1) & 0x1;  // 0/1 交替
  _bumpRenderFrame();  // 粒子分帧交错用，每帧递增

  if (window._pause3DAnimation) {
    // 最大化模式：只更新节点颜色和连线颜色，其余特效暂停
    processMovement();
    // 版本氛围：checkout 到越早站点动画越慢（decay 1=正常，接近 0=几乎静止）
    // 用平方让衰减更陡峭：早期站点速度下降更快
    const _vDecay = getVersionDecay();
    const _speedFactor = 0.005 + _vDecay * _vDecay * 0.995;
    tm += 0.016 * _speedFactor;
    appState.tm = tm;

    // ========== 连线颜色更新 ==========
    for (let it of appState.lineItems) {
      const isConnectedLine = appState.connectedLineItems ? appState.connectedLineItems.has(it) : false;
      const isConnectedStepLine = appState.connectedStepLineItems ? appState.connectedStepLineItems.has(it) : false;
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
      if (it.line.glowTube) {
        if (isConnectedStepLine) {
          it.line.glowTube.material.color.setHex(0xAA44FF);
        } else if (isConnectedLine) {
          it.line.glowTube.material.color.setHex(0x4488FF);
        } else if (!it.line.customColor) {
          it.line.glowTube.material.color.setHex(0xffffff);
        }
      }
    }

    // ========== 节点颜色更新（完整 HSL 循环） ==========
    for (let [id, obj] of appState.nodeMeshes.entries()) {
      if (!obj.mesh.visible) continue;
      const node = appState.nodeMap.get(id);
      const isSel = appState.selectedNodeIds.has(id);
      const isConnected = !isSel && (appState.connectedNodeIds ? appState.connectedNodeIds.has(id) : false);
      const isConnectedStep = !isSel && !isConnected && (appState.connectedStepNodeIds ? appState.connectedStepNodeIds.has(id) : false);

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
      } else {
        if (node && node.fixedColor) {
          const col = isConnectedStep ? new THREE.Color(0xAA44FF) : isConnected ? new THREE.Color(0x4488FF) : new THREE.Color(node.fixedColor);
          obj.mesh.material.color.copy(col);
          obj.mesh.material.emissive.copy(col);
          obj.mesh.material.emissiveIntensity = isSel ? 2.0 : 0.8;
        } else {
          if (isSel) {
            obj.mesh.material.color.setHex(0xFFD700);
            obj.mesh.material.emissive.setHex(0xFFAA33);
            obj.mesh.material.emissiveIntensity = 1.8 + Math.sin(tm * 12) * 1.2;
          } else if (isConnectedStep) {
            obj.mesh.material.color.setHex(0xAA44FF);
            obj.mesh.material.emissive.setHex(0x8822CC);
            obj.mesh.material.emissiveIntensity = 1.0 + Math.sin(tm * 6) * 0.5;
          } else if (isConnected) {
            obj.mesh.material.color.setHex(0x4488FF);
            obj.mesh.material.emissive.setHex(0x3366DD);
            obj.mesh.material.emissiveIntensity = 1.0 + Math.sin(tm * 6) * 0.5;
          } else if (_frameSkipCounter === 0) {  // HSL 节流：每 2 帧更新一次
            let hash = 0;
            for (let i = 0; i < id.length; i++) {
              hash = ((hash << 5) - hash) + id.charCodeAt(i);
              hash |= 0;
            }
            const seed = (hash % 1000 + 1000) % 1000 / 1000;
            const hSpeed = 0.05 + seed * 0.1;
            const sSpeed = 0.04 + seed * 0.06;
            const lSpeed = 0.03 + seed * 0.05;
            const hPhase = seed * Math.PI * 2;
            const sPhase = (seed * 3.7) % 1 * Math.PI * 2;
            const lPhase = (seed * 7.3) % 1 * Math.PI * 2;
            const hue = (tm * hSpeed + hPhase) % 1;
            const saturation = 0.5 + 0.5 * (Math.sin(tm * sSpeed + sPhase) * 0.5 + 0.5);
            const lightness = 0.3 + 0.3 * (Math.sin(tm * lSpeed + lPhase) * 0.5 + 0.3);
            _tmpColor.setHSL(hue, saturation, lightness);
            obj.mesh.material.color.copy(_tmpColor);
            obj.mesh.material.emissive.copy(_tmpColor);
            obj.mesh.material.emissiveIntensity = 0.6 + Math.sin(tm * 1.2) * 0.3;
          }
        }
      }
    }

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
      appState.controls.update();
      appState.effectComposer.render();
      appState.labelRenderer.render(appState.scene, appState.camera);
    } catch (e) { console.error('渲染异常(暂停模式):', e); }

    if (appState.is2DView && typeof appState.redraw2DView === 'function') {
      appState.redraw2DView();
    }
    return;
  }

  processMovement();
  // 版本氛围：checkout 到越早站点动画越慢（decay 1=正常，接近 0=几乎静止）
  // 用平方让衰减更陡峭：早期站点速度下降更快
  const _vDecay = getVersionDecay();
  const _speedFactor = 0.005 + _vDecay * _vDecay * 0.995;
  tm += 0.016 * _speedFactor;
  appState.tm = tm;

  // ========== 过渡动画更新（极简 → 华丽） ==========
  if (appState.transitionActive) {
    const dt = 0.016;
    const speed = dt / appState.transitionDuration;
    const oldProgress = appState.transitionProgress;
    const dir = appState.transitionTarget - oldProgress;
    appState.transitionProgress = Math.min(1, Math.max(0, oldProgress + speed * Math.sign(dir)));
    const raw = appState.transitionProgress;
    const eased = 1 - Math.pow(1 - raw, 3);

    // Bloom 强度从 0 渐增，避免过渡早期无背景时产生泛光白点
    if (appState.bloomPass) {
      appState.bloomPass.strength = eased * (appState._originalBloomStrength ?? 0.2);
    }

    appState.starGroups.forEach(g => {
      if (g.points) {
        // 星星淡入：延迟更多、过渡更慢，与天空球同步
        const starEased = raw > 0.35 ? ((raw - 0.35) / 0.65) : 0;  // 延迟35%后开始
        const starSmooth = 1 - Math.pow(1 - starEased, 2.5);          // 更平缓的缓出
        g.points.material.opacity = starSmooth * (g.baseOpacity || 0.9);
      }
    });
    appState.nebulaFlowGroups.forEach(n => {
      if (n.material) {
        const nebEased = raw > 0.35 ? ((raw - 0.35) / 0.65) : 0;
        const nebSmooth = 1 - Math.pow(1 - nebEased, 2.5);
        n.material.opacity = nebSmooth * 0.5;
      }
    });
    if (appState.flowField) {
      const flowEased = raw > 0.35 ? ((raw - 0.35) / 0.65) : 0;
      const flowSmooth = 1 - Math.pow(1 - flowEased, 2.5);
      appState.flowField.material.opacity = flowSmooth * 0.4;
    }
    if (appState.skySphere && appState.skySphere.material.uniforms) {
      // 天空球淡入效果
      const skyEased = raw > 0.35 ? ((raw - 0.35) / 0.65) : 0;
      const skySmooth = 1 - Math.pow(1 - skyEased, 2.5);
      appState.skySphere.material.uniforms.transitionProgress.value = skySmooth;
      // 保持原来的旋转速度（全速旋转），但受版本氛围衰减影响
      const skySpd = appState.skyRotationSpeed ?? 1;
      const _skyDecay = getVersionDecay();
      const _skyFactor = 0.005 + _skyDecay * _skyDecay * 0.995;
      appState.skySphere.rotation.y += 0.0005 * skySpd * _skyFactor;
      appState.skySphere.rotation.x += 0.0001 * skySpd * _skyFactor;
      appState.skySphere.rotation.z += 0.00005 * skySpd * _skyFactor;
    }

    for (let [id, obj] of appState.nodeMeshes.entries()) {
      const s = eased;
      if (obj.ring) obj.ring.scale.set(s, s, s);
      if (obj.glowRing) obj.glowRing.scale.set(s, s, s);
      if (obj.glowSphere) obj.glowSphere.scale.set(s, s, s);
      if (obj.surfaceGlowSphere) obj.surfaceGlowSphere.scale.set(s, s, s);
    }

    for (let it of appState.lineItems) {
      // 连线螺旋粒子流光动画：与天空球同步开始
      const lineEased = raw > 0.35 ? ((raw - 0.35) / 0.65) : 0;  // 与天空球同步（延迟35%后开始）
      const lineSmooth = 1 - Math.pow(1 - lineEased, 2.5);      // 平滑缓出
      if (it.line.glowTube) {
        if (!appState._lineToggleAnimActive) it.line.glowTube.material.opacity = lineSmooth * 1.0 * (appState.lineGlowOpacity ?? 1);
      }
      
      // 在延迟结束后启动流光动画
      if (raw > 0.35 && !it.line.isFlowing && it.line.flowStartTime === null) {
        it.line.startFlowAnimation(tm);
      }
      
      const pVis = appState._particleAnimOpacity ?? 1;
      if (it.line.particlePoints) {
        if (!appState._lineToggleAnimActive) it.line.particlePoints.material.opacity = lineSmooth * pVis;
      }
      if (it.line.trailPointsMerged?.material?.uniforms) it.line.trailPointsMerged.material.uniforms.uOpacity.value = lineSmooth * 0.6 * pVis;
    }

    if (appState.backGlow) appState.backGlow.intensity = eased * 0.7;
    if (appState.scene.fog) appState.scene.fog.density = eased * 0.004;

    if (Math.abs(appState.transitionProgress - appState.transitionTarget) < 0.01) {
      appState.transitionProgress = appState.transitionTarget;
      appState.transitionActive = false;
      if (typeof window.restoreFullEffects === 'function') {
        window.restoreFullEffects();
      }
    }
  }

  // ========== 背景粒子、星云效果 ==========
  // 只要不是极简模式就运行动画（包括过渡期间）
  if (!appState.simple3D) {
    // 视锥体裁剪：相机远离场景时降低粒子动画精度，节省 CPU
    const camDist = appState.camera.position.length();
    const enableDetailedParticles = camDist < 40;

    appState.starGroups.forEach((group) => {
      const baseOp = group.baseOpacity * (0.85 + 0.15 * Math.sin(tm * group.speed + group.phase));
      // 相机远时使用简化的闪烁计算（少 90% 三角函数），无法察觉差异
      const flicker = enableDetailedParticles
        ? 0.55 + 0.45 * (
            Math.sin(tm * 0.05 + group.phase * 10) * 0.35 +
            Math.cos(tm * 0.07 + group.phase * 7) * 0.25 +
            Math.sin(tm * 0.01 + group.phase * 13) * 0.35 +
            Math.cos(tm * 1.0 + group.phase * 17) * 0.15 +
            Math.sin(tm * 1.5 + group.phase * 21) * 0.15 +
            Math.sin(tm * 2.8 + group.phase * 5) * Math.cos(tm * 9.7 + group.phase * 11) * 0.20 +
            Math.sin(tm * 4.6 + group.phase * 3) * Math.sin(tm * 15.3 + group.phase * 19) * 0.15 +
            Math.sin(tm * 17.9 + group.phase * 25) * 0.10 +
            Math.cos(tm * 23.1 + group.phase * 31) * 0.08 +
            Math.sin(tm * 1.9 + group.phase * 100 + (group.phase * 1000 % 13)) * 0.18
          )
        : 0.7 + 0.3 * Math.sin(tm * group.speed * 0.5 + group.phase);
      const op = Math.max(0.03, Math.min(1, baseOp * flicker));
      // 兼容 GPU ShaderMaterial 和普通 PointsMaterial
      if (group.points.material.type === 'ShaderMaterial') {
        if (group.points.material.uniforms.uTime) group.points.material.uniforms.uTime.value = tm;
        group.points.material.uniforms.uOpacity.value = op;
      } else {
        group.points.material.opacity = op;
      }
    });

    // 颜色偏移已迁移至 GPU Shader，只需更新 uniform
    // 相机远时跳过色相偏移（颜色不变而已，看不出来）
    if (enableDetailedParticles) {
      const hueShift = tm * 0.015;
      appState.nebulaFlowGroups.forEach(nebula => {
        if (nebula.material.uniforms && nebula.material.uniforms.uHueShift) {
          nebula.material.uniforms.uHueShift.value = hueShift;
        }
      });
    }

    if (appState.flowField) {
      appState.flowField.material.color.setHSL((tm * 0.03) % 1, 0.8, 0.6);
      // 增强悬浮运动：旋转加速 + 上下浮动 + 呼吸缩放
      appState.flowField.rotation.y += 0.003;
      appState.flowField.rotation.x += 0.001;
      appState.flowField.rotation.z += 0.0005;
      appState.flowField.position.y = Math.sin(tm * 0.4) * 2.5;
      const breathe = 1 + 0.04 * Math.sin(tm * 0.25);
      appState.flowField.scale.setScalar(breathe);
    }

    // 所有星群旋转加速 3~5 倍，增强流动感
    if (appState.galaxy1) appState.galaxy1.rotation.y += 0.002;
    if (appState.galaxy2) appState.galaxy2.rotation.y -= 0.0018;
    if (appState.nebula1) appState.nebula1.rotation.y += 0.0008;
    if (appState.nebula2) appState.nebula2.rotation.x += 0.0006;
    if (appState.stars1) appState.stars1.rotation.y += 0.0005;
    if (appState.stars2) appState.stars2.rotation.x += 0.0005;
    if (appState.stars3) appState.stars3.rotation.z += 0.0004;
    // 两个主要星群也加入垂直浮动
    if (appState.nebula1) appState.nebula1.position.y = Math.sin(tm * 0.25 + 1) * 1.2;
    if (appState.nebula2) appState.nebula2.position.y = Math.sin(tm * 0.2 + 3) * 1.5;
    if (appState.galaxy1) appState.galaxy1.position.y = Math.sin(tm * 0.3 + 2) * 0.8;
    if (appState.galaxy2) appState.galaxy2.position.y = Math.sin(tm * 0.22 + 0.5) * 1.0;
  }

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
      if (!appState._lineToggleAnimActive && !appState.transitionActive) {
        it.line.glowTube.material.opacity = (isConnectedStepLine || isConnectedLine)
          ? Math.max(appState.lineGlowOpacity ?? 1, 0.4)
          : (appState.lineGlowOpacity ?? 1);
      }
    }
    if (it.line.particlePoints) {
      const ppMat = it.line.particlePoints.material;
      const tpMat = it.line.trailPointsMerged?.material;
      if (!appState._lineToggleAnimActive && !appState.transitionActive) ppMat.opacity = 1.0;
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

  // ========== 节点动画 ==========
  // 预计算相机前方向量（视锥裁剪用，复用模块级 _camForward/_tmpToNode）
  _camForward.set(0, 0, -1).applyQuaternion(appState.camera.quaternion);
  for (let [id, obj] of appState.nodeMeshes.entries()) {
    if (!obj.mesh.visible) continue;
    const node = appState.nodeMap.get(id);
    const isSel = appState.selectedNodeIds.has(id);
    const isConnected = !isSel && (appState.connectedNodeIds ? appState.connectedNodeIds.has(id) : false);
    const isConnectedStep = !isSel && !isConnected && (appState.connectedStepNodeIds ? appState.connectedStepNodeIds.has(id) : false);

if (!appState.simple3D) {
      const factor = node ? (node.ringSpeedFactor ?? 1) : 1;
      const ringSpeed = appState.ringRotationSpeed ?? 1;
      // 版本氛围：圆环旋转速度也受衰减影响
      const _ringDecay = getVersionDecay();
      const _ringFactor = 0.005 + _ringDecay * _ringDecay * 0.995;
      if (obj.ring) {
        obj.ring.rotation.x += 0.016 * obj.ringSpeed.rx * factor * ringSpeed * _ringFactor;
        obj.ring.rotation.y += 0.016 * obj.ringSpeed.ry * factor * ringSpeed * _ringFactor;
        obj.ring.rotation.z += 0.016 * obj.ringSpeed.rz * factor * ringSpeed * _ringFactor;
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
      if (obj.label && obj.label.element) {
        const nodePos = obj.mesh.position;
        _tmpToNode.subVectors(nodePos, appState.camera.position);
        const camDist2 = _tmpToNode.length();
        const shouldShow = camDist2 < 35 && _tmpToNode.dot(_camForward) > 0;
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
          let hash = 0;
          for (let i = 0; i < id.length; i++) {
            hash = ((hash << 5) - hash) + id.charCodeAt(i);
            hash |= 0;
          }
          const seed = (hash % 1000 + 1000) % 1000 / 1000;
          const hSpeed = 0.05 + seed * 0.1;
          const sSpeed = 0.04 + seed * 0.06;
          const lSpeed = 0.03 + seed * 0.05;
          const hPhase = seed * Math.PI * 2;
          const sPhase = (seed * 3.7) % 1 * Math.PI * 2;
          const lPhase = (seed * 7.3) % 1 * Math.PI * 2;
          const hue = (tm * hSpeed + hPhase) % 1;
          const saturation = 0.5 + 0.5 * (Math.sin(tm * sSpeed + sPhase) * 0.5 + 0.5);
          const lightness = 0.3 + 0.3 * (Math.sin(tm * lSpeed + lPhase) * 0.5 + 0.3);
          _tmpColor.setHSL(hue, saturation, lightness);
          obj.mesh.material.color.copy(_tmpColor);
          obj.mesh.material.emissive.copy(_tmpColor);
          obj.mesh.material.emissiveIntensity = 0.6 + Math.sin(tm * 1.2) * 0.3;
          if (obj.glowSphere) obj.glowSphere.material.color.copy(_tmpColor);
          if (obj.surfaceGlowSphere) obj.surfaceGlowSphere.material.color.copy(_tmpColor);

          if (obj.ring) {
            const ringSeed = (seed * 17) % 1;
            const ringHSpeed = 0.06 + ringSeed * 0.08;
            const ringSSpeed = 0.05 + ringSeed * 0.05;
            const ringLSpeed = 0.04 + ringSeed * 0.04;
            const ringHPhase = ringSeed * Math.PI * 2;
            const ringSPhase = (ringSeed * 5.3) % 1 * Math.PI * 2;
            const ringLPhase = (ringSeed * 11.7) % 1 * Math.PI * 2;
            const ringHue = (tm * ringHSpeed + ringHPhase) % 1;
            const ringSat = 0.5 + 0.5 * (Math.sin(tm * ringSSpeed + ringSPhase) * 0.5 + 0.5);
            const ringLight = 0.2 + 0.4 * (Math.sin(tm * ringLSpeed + ringLPhase) * 0.5 + 0.5);
            _tmpRingColor.setHSL(ringHue, ringSat, ringLight);
            obj.ring.material.color.copy(_tmpRingColor);
            obj.ring.material.emissive.copy(_tmpRingColor);
            obj.ring.material.emissiveIntensity = 1.2 + Math.sin(tm * 0.6 + ringSeed * 20) * 0.4;
            if (obj.glowRing) obj.glowRing.material.color.copy(_tmpRingColor);
          }
        }
      }

      // 🎯 远距离节点 LOD：基于相机距离分级显示子对象，减少 draw call
      // camDist 在下方 label 部分也会用到，提前计算复用
      _tmpToNode.subVectors(obj.mesh.position, appState.camera.position);
      const camDist = _tmpToNode.length();
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

    // 🏷️ 相机视锥 LOD：距离超 35 或在相机后方时渐隐标签
    // camDist 已在上方 LOD 计算时求出，复用 _tmpToNode
    if (obj.label) {
      // _tmpToNode 在上方 LOD 分支已计算（华丽模式）；极简模式分支独立计算 camDist2
      // 为保证两分支都能用，这里统一重新计算（一次 Vector3 运算开销可忽略）
      _tmpToNode.subVectors(obj.mesh.position, appState.camera.position);
      const camDistLabel = _tmpToNode.length();
      const shouldShow = camDistLabel < 35 && _tmpToNode.dot(_camForward) > 0;
      const border = isSel ? "#FFD700" : isConnectedStep ? "#AA44FF" : isConnected ? "#4488FF" : `hsl(${(tm * 0.08 * 360 + (id.charCodeAt(0) || 0) * 20) % 360},80%,65%)`;
      _setLabelVisible(obj, shouldShow, border);
    }
  }

  // ========== 背景光 ==========
  if (!appState.simple3D && appState.backGlow) {
    appState.backGlow.intensity = 0.7 + Math.sin(tm * 0.5) * 0.2;
  }

  // ========== 天空球动画（包含 customSkyLoaded） ==========
  if (!appState.simple3D) {
    if (appState.customSkyLoaded && appState.customSkyTexture) {
      // 缓存天空球引用：以 texture 为 key，texture 变化时重新查找
      if (_customSkyCacheKey !== appState.customSkyTexture) {
        _customSkySphereCache = appState.scene.children.find(
          child => child.isMesh && child.geometry.type === 'SphereGeometry' && child.material.map === appState.customSkyTexture
        ) || null;
        _customSkyCacheKey = _customSkySphereCache ? appState.customSkyTexture : null;
      }
      const skySphere = _customSkySphereCache;
      if (skySphere && skySphere.material) {
        const hue = (tm * 0.001) % 1;
        skySphere.material.color.setHSL(hue, 0.1, 0.7);
      }
    }
    if (appState.skySphere) {
      const skySpd = appState.skyRotationSpeed ?? 1;
      // 版本氛围：天空球旋转速度受衰减影响
      const _skyDecay2 = getVersionDecay();
      const _skyFactor2 = 0.005 + _skyDecay2 * _skyDecay2 * 0.995;
      appState.skySphere.rotation.y += 0.0005 * skySpd * _skyFactor2;
      appState.skySphere.rotation.x += 0.0001 * skySpd * _skyFactor2;
      appState.skySphere.rotation.z += 0.00005 * skySpd * _skyFactor2;
      if (appState.skySphere.material.uniforms) {
        if (appState.skySphere.material.uniforms.hueShift) {
          appState.skySphere.material.uniforms.hueShift.value = (tm * 0.015) % 1;
        }
        if (appState.skySphere.material.uniforms.brightness) {
          appState.skySphere.material.uniforms.brightness.value = appState.skyBrightness ?? 1.0;
        }
        if (appState.skySphere.material.uniforms.saturation) {
          appState.skySphere.material.uniforms.saturation.value = appState.skySaturation ?? 1.0;
        }
      }
    }
  }

  // ========== 相机动画 ==========
  if (appState.cameraAnimActive && appState.cameraAnimTarget) {
    const dt = 0.016;
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

  // ========== 流星更新 ==========
  if (!appState.simple3D && !appState.editorOpen && !appState.transitionActive && appState.meteorVisible !== false && appState.meteors) {
    const spawnChance = 0.02;
    const maxMeteorLife = 2.5;
    const sceneRadius = 80;
    appState.meteors.forEach(meteor => {
      if (!meteor.active) {
        if (Math.random() < spawnChance) {
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.asin((Math.random() * 2) - 1);
          const dist = sceneRadius * 1.1;
          _meteorStart.set(
            Math.cos(theta) * Math.cos(phi) * dist,
            Math.sin(phi) * dist * 0.6,
            Math.sin(theta) * Math.cos(phi) * dist
          );
          _meteorTarget.set(
            (Math.random() - 0.5) * sceneRadius * 0.8,
            (Math.random() - 0.5) * sceneRadius * 0.5,
            (Math.random() - 0.5) * sceneRadius * 0.8
          );
          _meteorDir.subVectors(_meteorTarget, _meteorStart).normalize();
          const speed = 25 + Math.random() * 40;
          meteor.position.copy(_meteorStart);
          meteor.velocity.copy(_meteorDir).multiplyScalar(speed);
          meteor.life = 0;
          meteor.maxLife = 1.0 + Math.random() * maxMeteorLife;
          meteor.color.setHSL(Math.random(), 1, 0.6);
          meteor.head.material.color.copy(meteor.color);
          meteor.head.material.opacity = 1;
          meteor.trail.forEach((p) => {
            p.material.color.copy(meteor.color);
            p.material.opacity = 0;
            p.visible = false;
          });
          meteor.group.position.copy(_meteorStart);
          meteor.group.visible = true;
          meteor.history = [];
          meteor.active = true;
        }
        return;
      }
      meteor.life += 0.016;
      if (meteor.life >= meteor.maxLife) {
        meteor.active = false;
        meteor.group.visible = false;
        return;
      }
      const dt = 0.016;
      _meteorDelta.copy(meteor.velocity).multiplyScalar(dt);
      meteor.position.add(_meteorDelta);
      meteor.group.position.copy(meteor.position);
      const lifeRatio = meteor.life / meteor.maxLife;
      let headOpacity;
      if (lifeRatio < 0.1) headOpacity = lifeRatio / 0.1;
      else if (lifeRatio > 0.7) headOpacity = 1 - (lifeRatio - 0.7) / 0.3;
      else headOpacity = 1;
      meteor.head.material.opacity = headOpacity * 0.9;
      if (!meteor.history) meteor.history = [];
      meteor.history.unshift(meteor.position.clone());
      if (meteor.history.length > meteor.trail.length) meteor.history.pop();
      for (let i = 0; i < meteor.trail.length; i++) {
        const particle = meteor.trail[i];
        if (i < meteor.history.length) {
          const pos = meteor.history[i];
          particle.position.copy(pos).sub(meteor.group.position);
          particle.visible = true;
          const trailRatio = 1 - i / meteor.trail.length;
          particle.material.opacity = headOpacity * trailRatio * 0.6;
        } else {
          particle.visible = false;
        }
      }
    });
  }

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
    if (it.line.particlePoints && !appState._lineToggleAnimActive && !appState.transitionActive) {
      it.line.particlePoints.material.opacity *= pOpacity;
      if (it.line.trailPointsMerged?.material?.uniforms) {
        const cur = it.line.trailPointsMerged.material.uniforms.uOpacity.value;
        it.line.trailPointsMerged.material.uniforms.uOpacity.value = cur * pOpacity;
      }
    }
  }

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
    appState.controls.update();
    appState.effectComposer.render();
    appState.labelRenderer.render(appState.scene, appState.camera);
  } catch (e) { console.error('渲染异常:', e); }

  if (appState.is2DView && typeof appState.redraw2DView === 'function') {
    appState.redraw2DView();
  }
}