// ============================================================
//  模块14：场景特效（由 module14_Animation.js 拆分）
//  过渡动画（极简→华丽）、背景粒子星云、背景光+天空球、流星
// ============================================================
import * as THREE from 'three';
import { appState } from '../module0_AppState.js';
import { getVersionDecay } from '../versionGraph/versionAtmosphere.js';

// 自定义天空球引用缓存（避免每帧 scene.children.find 遍历）
let _customSkySphereCache = null;
let _customSkyCacheKey = null;

// 流星生成/更新复用临时向量
const _meteorStart = new THREE.Vector3();
const _meteorTarget = new THREE.Vector3();
const _meteorDir = new THREE.Vector3();
const _meteorDelta = new THREE.Vector3();

export function updateTransitionEffects(tm, _frameDt) {
  // ========== 过渡动画更新（极简 → 华丽） ==========
  if (appState.transitionActive) {
    const dt = _frameDt;
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
        if (!appState._lineToggleAnimActive && !appState._arrangeAnimLineControl) it.line.glowTube.material.opacity = lineSmooth * 1.0 * (appState.lineGlowOpacity ?? 1);
      }
      
      // 在延迟结束后启动流光动画
      if (raw > 0.35 && !it.line.isFlowing && it.line.flowStartTime === null) {
        it.line.startFlowAnimation(tm);
      }
      
      const pVis = appState._particleAnimOpacity ?? 1;
      if (it.line.particlePoints) {
        if (!appState._lineToggleAnimActive && !appState._arrangeAnimLineControl) it.line.particlePoints.material.opacity = lineSmooth * pVis;
      }
      if (it.line.trailPointsMerged?.material?.uniforms && !appState._arrangeAnimLineControl) it.line.trailPointsMerged.material.uniforms.uOpacity.value = lineSmooth * 0.6 * pVis;
    }

    // 鱼骨主干连线：与普通连线同步渐入流光
    for (const fit of (appState.fishboneLineItems || [])) {
      const lineEased = raw > 0.35 ? ((raw - 0.35) / 0.65) : 0;
      const lineSmooth = 1 - Math.pow(1 - lineEased, 2.5);
      if (fit.line.glowTube) {
        if (!appState._lineToggleAnimActive && !appState._arrangeAnimLineControl) fit.line.glowTube.material.opacity = lineSmooth * 1.0 * (appState.lineGlowOpacity ?? 1);
      }
      if (raw > 0.35 && !fit.line.isFlowing && fit.line.flowStartTime === null) {
        fit.line.startFlowAnimation(tm);
      }
      const pVis = appState._particleAnimOpacity ?? 1;
      if (fit.line.particlePoints) {
        if (!appState._lineToggleAnimActive && !appState._arrangeAnimLineControl) fit.line.particlePoints.material.opacity = lineSmooth * pVis;
      }
      if (fit.line.trailPointsMerged?.material?.uniforms && !appState._arrangeAnimLineControl) fit.line.trailPointsMerged.material.uniforms.uOpacity.value = lineSmooth * 0.6 * pVis;
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
}

export function updateBackgroundFx(tm) {
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
}

export function updateSkyAndGlow(tm) {
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
}

export function updateMeteors(_frameDt) {
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
      meteor.life += _frameDt;
      if (meteor.life >= meteor.maxLife) {
        meteor.active = false;
        meteor.group.visible = false;
        return;
      }
      const dt = _frameDt;
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
}