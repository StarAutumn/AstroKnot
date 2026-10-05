// ============================================================
//  nodes/mesh.js — 节点 Mesh 创建/更新/销毁
//  依赖 textures.js（共享纹理/图标）+ interaction.js（label click）
//  + animations.js（animateNodeIn）+ card-label.js（_disposeCardLabel）
// ============================================================
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { appState } from '../../module0_AppState.js';
import {
  _getSharedGlowSphereTex,
  _getSharedGlowRingTex,
  _getSharedSurfaceGlowTex,
  _createCardIcon,
  _createWebpageIcon
} from './textures.js';
import { _disposeCardLabel } from './card-label.js';
import { handleLabelClick } from './interaction.js';
import { animateNodeIn, cancelNodeAnimation } from './animations.js';
import { renderLabelCanvas, LABEL_BASE_SCALE } from './label-canvas.js';

// ── 标签 Sprite 创建 ──

/**
 * 按系数缩放标签 Sprite（f=1 恢复基准大小）。
 * 标签基准缩放 0.02（_createLabelSprite），折叠/展开/删除动画若直接
 * scale.set(sc,sc,sc) 会把标签放大 50 倍（CSS2D 时代该代码无视觉影响，
 * 换 Sprite 后爆发），必须乘基准。
 */
export function labelAnimScale(label, f) {
  if (!label) return;
  const bw = label.userData._labelBaseW || 0.02;
  const bh = label.userData._labelBaseH || 0.02;
  label.scale.set(bw * f, bh * f, 1);
}

function _createLabelSprite(text, nodeId) {
  const { canvas, bgW, bgH } = renderLabelCanvas(text, null);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    sizeAttenuation: false  // 标签大小不随远近变化，保持可读性
  });

  const sprite = new THREE.Sprite(material);
  const aspect = bgW / bgH;
  sprite.scale.set(LABEL_BASE_SCALE * aspect, LABEL_BASE_SCALE, 1);
  // 基准缩放记录：labelAnimScale 按系数缩放/恢复时使用
  sprite.userData._labelBaseW = LABEL_BASE_SCALE * aspect;
  sprite.userData._labelBaseH = LABEL_BASE_SCALE;
  sprite.userData._labelNodeId = nodeId;
  sprite.userData._labelText = text;
  sprite.userData._labelBadge = null;

  return sprite;
}

// ==================== 折叠徽标（3D）：重绘标签纹理 ====================

/**
 * 更新节点 3D 标签的折叠徽标 a/b（badge=null 移除）。
 * 触发点：collapse.js toggleChildren / expandAllNodes 动画结束时；
 * 徽标绘制在节点名字右侧，样式与 2D 折叠徽标一致（label-canvas.js）。
 * @param {string} nodeId 节点 id
 * @param {{a:number,b:number}|null} badge 徽标数据（a=直接子节点数，b=全部后代数）
 */
export function updateNodeLabelBadge(nodeId, badge) {
  const obj = appState.nodeMeshes.get(nodeId);
  const sprite = obj?.label;
  if (!sprite) return;
  const text = sprite.userData._labelText ?? '';
  // 边框色与 Animation/lines-nodes.js 每帧推导保持一致（选中金/步骤紫/连接蓝/默认浅蓝），
  // 避免徽标重绘把选中/连接高亮边框抹回默认色
  const isSel = appState.selectedNodeIds.has(nodeId);
  const isConnected = !isSel && (appState.connectedNodeIds ? appState.connectedNodeIds.has(nodeId) : false);
  const isConnectedStep = !isSel && !isConnected && (appState.connectedStepNodeIds ? appState.connectedStepNodeIds.has(nodeId) : false);
  const borderColor = isSel ? '#FFD700' : isConnectedStep ? '#AA44FF' : isConnected ? '#4488FF' : '#aaddff';
  const { canvas, bgW, bgH } = renderLabelCanvas(text, badge || null, borderColor);
  if (sprite.material.map) sprite.material.map.dispose();
  sprite.material.map = new THREE.CanvasTexture(canvas);
  sprite.material.needsUpdate = true;
  const aspect = bgW / bgH;
  sprite.scale.set(LABEL_BASE_SCALE * aspect, LABEL_BASE_SCALE, 1);
  sprite.userData._labelBaseW = LABEL_BASE_SCALE * aspect;
  sprite.userData._labelBaseH = LABEL_BASE_SCALE;
  sprite.userData._labelBadge = badge || null;
  // 同步 Animation/labels.js 的重绘缓存（_setLabelVisible 按缓存判断是否重绘）
  sprite._lastBorder = borderColor;
  sprite._lastLabelName = text;
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

  // 🏷️ Sprite 标签（参与深度缓冲，被前方3D对象遮挡时不显示）
  const label = _createLabelSprite(node.name, node.id);
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

  // ── 卡片/网页模式：3D 下在球体上加图标 ──
  let cardIcon = null;
  if (node.displayMode === 'card') {
    cardIcon = _createCardIcon();
    sphere.add(cardIcon);
  } else if (node.displayMode === 'webpage') {
    cardIcon = _createWebpageIcon();
    sphere.add(cardIcon);
  }

  // 3D 模式下卡片节点默认显示普通球体，选中时在上方投影全息卡片
  // cardLabel 在选中时由 updateCardBillboards 按需创建
  let cardLabel = null;

  appState.nodeMeshes.set(node.id, {
    mesh: sphere,
    glowSphere,
    ring,
    glowRing,
    surfaceGlowSphere,
    label: label,
    cardLabel,
    cardIcon,
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
  } else {
    obj.mesh.material.color.set(0xffaa88);
  }

  // ── 卡片模式 vs 默认模式切换 ──
  // 3D 模式下卡片节点保持球体可见，cardLabel 在选中时由 updateCardBillboards 按需创建/移除
  const isCardMode = node.displayMode === 'card' || node.displayMode === 'webpage';
  if (isCardMode) {
    // 卡片/网页模式：3D 下保留球体及特效可见，不自动创建 cardLabel
    // 如果已有 cardLabel（取消选中后的残留），隐藏它
    if (obj.cardLabel) {
      obj.cardLabel.visible = false;
    }
    // 如果没有图标，创建一个
    if (!obj.cardIcon) {
      if (node.displayMode === 'webpage') {
        obj.cardIcon = _createWebpageIcon();
      } else {
        obj.cardIcon = _createCardIcon();
      }
      obj.mesh.add(obj.cardIcon);
    }
  } else {
    // 默认模式：显示球体及特效，销毁 cardLabel
    obj.mesh.visible = true;
    if (!appState.simple3D) {
      if (obj.glowSphere) obj.glowSphere.visible = true;
      if (obj.ring) obj.ring.visible = true;
      if (obj.glowRing) obj.glowRing.visible = true;
      if (obj.surfaceGlowSphere) obj.surfaceGlowSphere.visible = true;
    }
    if (obj.label) {
      obj.label.visible = true;
      if (obj.label.element) obj.label.element.style.pointerEvents = 'auto';
    }
    if (obj.cardLabel) {
      appState.scene.remove(obj.cardLabel);
      _disposeCardLabel(obj.cardLabel);
      obj.cardLabel = null;
    }
    // 移除文档图标
    if (obj.cardIcon) {
      obj.mesh.remove(obj.cardIcon);
      obj.cardIcon.geometry.dispose();
      obj.cardIcon.material.dispose();
      obj.cardIcon = null;
    }
  }

  if (appState.refreshTreePanel) appState.refreshTreePanel();
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
  if (obj.cardLabel) {
    appState.scene.remove(obj.cardLabel);
    _disposeCardLabel(obj.cardLabel);
    obj.cardLabel = null;
  }
  if (obj.cardIcon) {
    obj.mesh.remove(obj.cardIcon);
    obj.cardIcon.geometry.dispose();
    obj.cardIcon.material.dispose();
    obj.cardIcon = null;
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
  cancelNodeAnimation(id);
  appState.scene.remove(obj.mesh);
  appState.scene.remove(obj.label);
  if (obj.label && obj.label.element) {
    obj.label.element.remove();
  }
  if (obj.cardLabel) {
    appState.scene.remove(obj.cardLabel);
    _disposeCardLabel(obj.cardLabel);
    obj.cardLabel = null;
  }
  if (obj.surfaceGlowSphere) {
    appState.scene.remove(obj.surfaceGlowSphere);
    obj.surfaceGlowSphere.material.dispose();
    obj.surfaceGlowSphere.geometry.dispose();
  }
  appState.nodeMeshes.delete(id);
}
