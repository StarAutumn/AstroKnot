// ============================================================
//  模块6 子模块：3D 节点网格 + 动画
// ============================================================
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { appState } from '../module0_AppState.js';

// ==================== 随机位置生成 ====================
export function generateRandomPosition(existing, base = new THREE.Vector3(0, 0, 0)) {
  let pos, safe = false, tries = 0;
  while (!safe && tries < 30) {
    let a1 = Math.random() * Math.PI * 2,
      a2 = Math.random() * Math.PI * 2,
      r = 1.6 + Math.random() * 1.2;
    let off = new THREE.Vector3(Math.sin(a1) * Math.cos(a2) * r,
      Math.sin(a1) * Math.sin(a2) * r * 0.8,
      Math.cos(a1) * r);
    pos = base.clone().add(off);
    let minD = Infinity;
    for (let p of existing) minD = Math.min(minD, pos.distanceTo(p));
    if (minD > 0.9) safe = true;
    tries++;
  }
  return pos;
}

// ==================== 节点动画 ====================
const nodeAnimations = new Map();
const ANIM_DURATION_IN = 400;
const ANIM_DURATION_OUT = 300;

// ==================== 共享 Canvas 纹理（所有节点内容相同，避免每节点创建 ~200KB canvas） ====================
let _sharedGlowSphereTex = null;
let _sharedGlowRingTex = null;
let _sharedSurfaceGlowTex = null;

function _getSharedGlowSphereTex() {
  if (_sharedGlowSphereTex) return _sharedGlowSphereTex;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.2, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.5)');
  grad.addColorStop(0.8, 'rgba(255,255,255,0.08)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  _sharedGlowSphereTex = new THREE.CanvasTexture(canvas);
  return _sharedGlowSphereTex;
}

function _getSharedGlowRingTex() {
  if (_sharedGlowRingTex) return _sharedGlowRingTex;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(canvas.width, canvas.height);
  const data = imageData.data;

  const vGradient = new Array(canvas.height);
  for (let y = 0; y < canvas.height; y++) {
    const t = y / (canvas.height - 1);
    let brightness;
    if (t <= 0.5) brightness = t / 0.5;
    else brightness = (1 - t) / 0.5;
    brightness = Math.pow(brightness, 1.5);
    vGradient[y] = Math.max(0, Math.min(1, brightness));
  }

  const periods = 3;
  for (let x = 0; x < canvas.width; x++) {
    const u = x / canvas.width;
    const phase = u * periods * Math.PI * 2;
    const hBrightness = 0.4 + 0.6 * Math.sin(phase);
    for (let y = 0; y < canvas.height; y++) {
      const idx = (y * canvas.width + x) * 4;
      const vBright = vGradient[y];
      const alpha = hBrightness * vBright;
      data[idx] = 255;
      data[idx + 1] = 255;
      data[idx + 2] = 255;
      data[idx + 3] = Math.round(alpha * 255);
    }
  }
  ctx.putImageData(imageData, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(1, 1);
  _sharedGlowRingTex = tex;
  return tex;
}

function _getSharedSurfaceGlowTex() {
  if (_sharedSurfaceGlowTex) return _sharedSurfaceGlowTex;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const sgrad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  sgrad.addColorStop(0, 'rgba(255,255,255,0)');
  sgrad.addColorStop(0.6, 'rgba(255,255,255,0)');
  sgrad.addColorStop(0.75, 'rgba(255,255,255,0.9)');
  sgrad.addColorStop(0.9, 'rgba(255,255,255,0.2)');
  sgrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sgrad;
  ctx.fillRect(0, 0, 256, 256);
  _sharedSurfaceGlowTex = new THREE.CanvasTexture(canvas);
  return _sharedSurfaceGlowTex;
}

function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function easeInBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return c3 * t * t * t - c1 * t * t;
}

function animateNodeIn(nodeId) {
  const obj = appState.nodeMeshes.get(nodeId);
  if (!obj) return;
  const startTime = performance.now();
  const targetScale = obj.mesh.scale.x || 1;
  const showEffects = !appState.simple3D;
  obj.mesh.scale.setScalar(0.001);
  if (obj.label) { obj.label.visible = false; obj.label.element.style.opacity = '0'; }
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
      if (obj.label) { obj.label.visible = true; obj.label.element.style.opacity = '1'; }
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
    if (obj.label) obj.label.scale.setScalar(Math.max(0.001, scale));

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

// ==================== 节点几何体 ====================
function createNodeGeometry(shape, radius) {
  switch (shape) {
    case 'box': return new THREE.BoxGeometry(radius * 1.8, radius * 1.8, radius * 1.8);
    case 'cylinder': return new THREE.CylinderGeometry(radius, radius, radius * 1.8, 32);
    case 'cone': return new THREE.ConeGeometry(radius * 1.2, radius * 2, 32);
    case 'torus': return new THREE.TorusGeometry(radius * 0.9, radius * 0.4, 24, 32);
    case 'octahedron': return new THREE.OctahedronGeometry(radius * 1.3);
    case 'icosahedron': return new THREE.IcosahedronGeometry(radius * 1.2);
    case 'sphere':
    default: return new THREE.SphereGeometry(radius, 32, 32);
  }
}

// ==================== 创建节点 Mesh ====================
export function createNodeMesh(node, pos) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffaa88,
    emissive: 0xff44aa,
    emissiveIntensity: 0.6
  });
  const shape3D = node.node3DShape || 'sphere';
  const sphereGeo = createNodeGeometry(shape3D, appState.NODE_RADIUS);
  const sphere = new THREE.Mesh(sphereGeo, mat);
  sphere.position.copy(pos);
  sphere.userData = { id: node.id, name: node.name, desc: node.desc };
  sphere.scale.setScalar(node.sizeScale || 1);
  appState.scene.add(sphere);

  // 🌟 泛光球壳（共享 Canvas 纹理）
  const glowSphereTex = _getSharedGlowSphereTex();

  const glowMat = new THREE.MeshBasicMaterial({
    map: glowSphereTex,
    color: 0x88aaff,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending
  });

  const glowSphereGeo = new THREE.SphereGeometry(appState.NODE_RADIUS + 0.2, 32, 32);
  const glowSphere = new THREE.Mesh(glowSphereGeo, glowMat);
  sphere.add(glowSphere);

  // 光环
  const ringMaterial = new THREE.MeshStandardMaterial({
    color: 0x88ccff,
    emissive: 0x33aacc,
    emissiveIntensity: 2.5
  });
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(appState.NODE_RADIUS + 0.22, 0.022, 32, 48),
    ringMaterial
  );
  sphere.add(ring);

  // 🌟 光晕环（泛光光环，共享 Canvas 纹理）
  const glowRingGeo = new THREE.TorusGeometry(
    appState.NODE_RADIUS + 0.22,
    0.07,
    32, 48
  );

  const glowTex = _getSharedGlowRingTex();

  const glowRingMat = new THREE.MeshBasicMaterial({
    map: glowTex,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    transparent: true,
    side: THREE.DoubleSide
  });
  const glowRing = new THREE.Mesh(glowRingGeo, glowRingMat);
  sphere.add(glowRing);

  // 🌟 独立泛光球壳（球面径向向外扩散，直接挂载到场景，共享 Canvas 纹理）
  const surfaceGlowTex = _getSharedSurfaceGlowTex();

  const surfaceGlowMat = new THREE.MeshBasicMaterial({
    map: surfaceGlowTex,
    color: 0xffffff,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending
  });

  const surfaceGlowGeo = new THREE.SphereGeometry(appState.NODE_RADIUS + 0.02, 32, 32);
  const surfaceGlowSphere = new THREE.Mesh(surfaceGlowGeo, surfaceGlowMat);
  surfaceGlowSphere.position.copy(pos);
  surfaceGlowSphere.scale.setScalar(node.sizeScale || 1);
  appState.scene.add(surfaceGlowSphere);

  const ringSpeed = {
    rx: 0.5 + Math.random() * 0.8,
    ry: 0.4 + Math.random() * 0.9,
    rz: 0.6 + Math.random() * 0.7
  };

  // 🏷️ CSS2D 标签
  const div = document.createElement('div');
  div.textContent = node.name;
  div.style.cssText = 'color:#ffffff;font-size:12px;background:#000000;backdrop-filter:blur(6px);padding:2px 10px;border-radius:40px;border:1px solid #444444;white-space:nowrap;pointer-events:none;transition:opacity 0.3s ease;';
  const label = new CSS2DObject(div);
  div.addEventListener('transitionend', function () {
    if (div.style.opacity === '0') label.visible = false;
  });
  const labelOffset = appState.NODE_RADIUS + 0.28;
  label.position.set(pos.x, pos.y + labelOffset, pos.z);
  appState.scene.add(label);

  // 极简模式下隐藏节点特效
  if (appState.simple3D) {
    glowSphere.visible = false;
    ring.visible = false;
    glowRing.visible = false;
    surfaceGlowSphere.visible = false;
  }

  appState.nodeMeshes.set(node.id, {
    mesh: sphere,
    glowSphere,
    ring,
    glowRing,
    surfaceGlowSphere,
    label: label,
    visible: true,
    ringSpeed
  });
  animateNodeIn(node.id);
  return sphere;
}

// ==================== 更新节点外观 ====================
export function updateNodeVisuals(nodeId) {
  const node = appState.nodeMap.get(nodeId);
  const obj = appState.nodeMeshes.get(nodeId);
  if (!node || !obj) return;
  const newScale = node.sizeScale || 1;
  obj.mesh.scale.setScalar(newScale);
  if (obj.surfaceGlowSphere) {
    obj.surfaceGlowSphere.scale.setScalar(newScale);
  }
  const shape3D = node.node3DShape || 'sphere';
  const oldGeo = obj.mesh.geometry;
  const newGeo = createNodeGeometry(shape3D, appState.NODE_RADIUS);
  if (newGeo.type !== oldGeo.type) {
    obj.mesh.geometry = newGeo;
    oldGeo.dispose();
  } else {
    newGeo.dispose();
  }
  if (node.fixedColor) {
    obj.mesh.material.color.set(node.fixedColor);
    console.log('[updateNodeVisuals]', nodeId, '→ mesh.color.set(', node.fixedColor, ') → hex:', obj.mesh.material.color.getHexString());
  } else {
    obj.mesh.material.color.set(0xffaa88);
  }
  if (appState.refreshTreePanel) { console.log('[updateNodeVisuals] calling refreshTreePanel'); appState.refreshTreePanel(); }
}

// ==================== 销毁节点 Mesh ====================
export function destroyNodeMesh(id) {
  let obj = appState.nodeMeshes.get(id);
  if (!obj) return;
  appState.scene.remove(obj.mesh);
  appState.scene.remove(obj.label);
  if (obj.label && obj.label.element) {
    obj.label.element.remove();
  }
  if (obj.glowSphere) obj.mesh.remove(obj.glowSphere);
  if (obj.ring) obj.mesh.remove(obj.ring);
  if (obj.glowRing) obj.mesh.remove(obj.glowRing);
  obj.mesh.geometry.dispose();
  obj.mesh.material.dispose();
  if (obj.surfaceGlowSphere) {
    appState.scene.remove(obj.surfaceGlowSphere);
    obj.surfaceGlowSphere.material.dispose();
    obj.surfaceGlowSphere.geometry.dispose();
  }
  appState.nodeMeshes.delete(id);
}

export function destroyNodeMeshImmediate(id) {
  let obj = appState.nodeMeshes.get(id);
  if (!obj) return;
  if (nodeAnimations.has(id)) {
    cancelAnimationFrame(nodeAnimations.get(id));
    nodeAnimations.delete(id);
  }
  appState.scene.remove(obj.mesh);
  appState.scene.remove(obj.label);
  if (obj.label && obj.label.element) {
    obj.label.element.remove();
  }
  if (obj.surfaceGlowSphere) {
    appState.scene.remove(obj.surfaceGlowSphere);
    obj.surfaceGlowSphere.material.dispose();
    obj.surfaceGlowSphere.geometry.dispose();
  }
  appState.nodeMeshes.delete(id);
}
