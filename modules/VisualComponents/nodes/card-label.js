// ============================================================
//  nodes/card-label.js — 3D 卡片 Label 创建/销毁/重绘
//  依赖 textures.js（_getSharedCardGlowTex）+ card-canvas.js（_drawCardCanvas）
//  + card-overlay.js（removeCardOverlay3D，销毁时同步移除 DOM overlay）
// ============================================================
import * as THREE from 'three';
import { appState } from '../../module0_AppState.js';
import { _getSharedCardGlowTex } from './textures.js';
import { _drawCardCanvas, CARD_WORLD_SCALE, CARD_DEPTH } from './card-canvas.js';
import { removeCardOverlay3D } from './card-overlay.js';

export function _createCardLabel(node, pos) {
  const cardW = node.cardWidth || 220;
  const cardH = node.cardHeight || 200;
  // Canvas 分辨率（2x 高 DPI）
  const canvas = document.createElement('canvas');
  canvas.width = cardW * 2;
  canvas.height = cardH * 2;
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);
  const tmpCanvas = { width: cardW, height: cardH, getContext: () => ctx };
  _drawCardCanvas(node, tmpCanvas, { selected: false });

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  // 世界单位尺寸
  const planeW = cardW * CARD_WORLD_SCALE;
  const planeH = cardH * CARD_WORLD_SCALE;

  // 边框颜色（整数）
  let borderColorHex = 0x5a8a9a;
  if (node.fixedColor) {
    borderColorHex = parseInt(node.fixedColor.replace('#', ''), 16);
    if (isNaN(borderColorHex)) borderColorHex = 0x5a8a9a;
  }

  // Group：实体板 + 背面发光面
  const group = new THREE.Group();
  group.position.copy(pos);
  group.userData.isCardBillboard = true;
  group.userData.id = node.id;  // 供 getHitNodeId 向上遍历查找
  group.userData.nodeId = node.id;
  group.userData.cardCanvas = canvas;
  group.userData.cardTexture = texture;
  group.userData.cardW = cardW;
  group.userData.cardH = cardH;
  group.userData.baseBorderColor = borderColorHex;

  // 主板（BoxGeometry，材质数组：侧面为边框色、正反两面为卡片纹理）
  const slabGeo = new THREE.BoxGeometry(planeW, planeH, CARD_DEPTH);
  const sideMat = new THREE.MeshStandardMaterial({
    color: borderColorHex,
    emissive: borderColorHex,
    emissiveIntensity: 0.8,
    transparent: true,
    opacity: 0.95
  });
  const faceMat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: true
  });
  // BoxGeometry 面顺序: [+X, -X, +Y, -Y, +Z(前), -Z(后)]
  const slab = new THREE.Mesh(slabGeo, [sideMat, sideMat, sideMat, sideMat, faceMat, faceMat]);
  slab.userData.id = node.id;  // 供 raycast 直接命中时查找 nodeId
  slab.renderOrder = 0;
  group.add(slab);
  group.userData.slab = slab;
  group.userData.sideMat = sideMat;
  group.userData.faceMat = faceMat;

  // 背面发光面（略大于板面，加性混合，提供全息光晕）
  const glowGeo = new THREE.PlaneGeometry(planeW * 1.5, planeH * 1.5);
  const glowMat = new THREE.MeshBasicMaterial({
    map: _getSharedCardGlowTex(),
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    opacity: 0.5
  });
  const glowPlane = new THREE.Mesh(glowGeo, glowMat);
  glowPlane.userData.id = node.id;
  glowPlane.position.z = -CARD_DEPTH / 2 - 0.002;
  glowPlane.renderOrder = -1;
  group.add(glowPlane);
  group.userData.glowPlane = glowPlane;

  // ── 投影光束：独立的 scene 对象，每帧用世界坐标更新（不受 billboard 旋转影响） ──
  const beamGeo = new THREE.BufferGeometry();
  const beamPositions = new Float32Array(6);
  beamGeo.setAttribute('position', new THREE.BufferAttribute(beamPositions, 3));
  const beamMat = new THREE.LineBasicMaterial({
    color: 0x00ffff,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const beam = new THREE.Line(beamGeo, beamMat);
  beam.renderOrder = -2;
  beam.frustumCulled = false;
  // beam 不加入 group，由 updateCardBillboards 添加到 scene 并更新世界坐标
  group.userData.beam = beam;
  group.userData.beamMat = beamMat;

  // 初始 billboard 朝向
  if (appState.camera) {
    group.quaternion.copy(appState.camera.quaternion);
  }

  return group;
}

// 释放 cardLabel 资源
export function _disposeCardLabel(cardLabel) {
  if (!cardLabel) return;
  // 同步移除 3D 卡片正文 DOM overlay
  const nodeId = cardLabel.userData.nodeId;
  if (nodeId) removeCardOverlay3D(nodeId);
  // 从 scene 移除投影光束
  const beam = cardLabel.userData.beam;
  if (beam && beam.parent) {
    beam.parent.remove(beam);
  }
  const slab = cardLabel.userData.slab;
  const glowPlane = cardLabel.userData.glowPlane;
  const faceMat = cardLabel.userData.faceMat;
  const sideMat = cardLabel.userData.sideMat;
  const beamMat = cardLabel.userData.beamMat;
  if (slab) {
    if (slab.geometry) slab.geometry.dispose();
  }
  if (glowPlane) {
    if (glowPlane.geometry) glowPlane.geometry.dispose();
    if (glowPlane.material) glowPlane.material.dispose();
  }
  if (faceMat) {
    if (faceMat.map) faceMat.map.dispose();
    faceMat.dispose();
  }
  if (sideMat) sideMat.dispose();
  if (beam) {
    if (beam.geometry) beam.geometry.dispose();
  }
  if (beamMat) beamMat.dispose();
}

// 重绘卡片纹理（状态/内容/尺寸变化时调用）
export function _redrawCardTexture(cardLabel, node, state) {
  const cardW = node.cardWidth || 220;
  const cardH = node.cardHeight || 200;
  const sizeChanged = cardLabel.userData.cardW !== cardW || cardLabel.userData.cardH !== cardH;

  const canvas = cardLabel.userData.cardCanvas;
  const ctx = canvas.getContext('2d');

  if (sizeChanged) {
    cardLabel.userData.cardW = cardW;
    cardLabel.userData.cardH = cardH;
    canvas.width = cardW * 2;
    canvas.height = cardH * 2;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(2, 2);
    const tmpCanvas = { width: cardW, height: cardH, getContext: () => ctx };
    _drawCardCanvas(node, tmpCanvas, state);
    cardLabel.userData.cardTexture.needsUpdate = true;
    // 重建 geometry
    const planeW = cardW * CARD_WORLD_SCALE;
    const planeH = cardH * CARD_WORLD_SCALE;
    const slab = cardLabel.userData.slab;
    const glowPlane = cardLabel.userData.glowPlane;
    if (slab) {
      slab.geometry.dispose();
      slab.geometry = new THREE.BoxGeometry(planeW, planeH, CARD_DEPTH);
    }
    if (glowPlane) {
      glowPlane.geometry.dispose();
      glowPlane.geometry = new THREE.PlaneGeometry(planeW * 1.5, planeH * 1.5);
    }
  } else {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(2, 2);
    const tmpCanvas = { width: cardW, height: cardH, getContext: () => ctx };
    _drawCardCanvas(node, tmpCanvas, state);
    cardLabel.userData.cardTexture.needsUpdate = true;
  }
}

// 更新 3D 卡片纹理（选中/内容/尺寸变化时调用）
export function updateCardTexture(nodeId, selected) {
  const obj = appState.nodeMeshes.get(nodeId);
  if (!obj || !obj.cardLabel) return;
  const node = appState.nodeMap.get(nodeId);
  if (!node) return;
  _redrawCardTexture(obj.cardLabel, node, { selected: !!selected });
}
