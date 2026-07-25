// ============================================================
//  nodes/card-billboard.js — 3D 卡片每帧更新
//  billboard 朝向、位置同步、视锥裁剪、展开/折叠/稳定动画、呼吸光晕
//  3D 模式下，只有选中的卡片节点才在上方投影全息卡片，其余卡片节点显示普通球体
// ============================================================
import * as THREE from 'three';
import { appState } from '../../module0_AppState.js';
import { CARD_WORLD_SCALE } from './card-canvas.js';
import { _createCardLabel, _disposeCardLabel, _redrawCardTexture } from './card-label.js';
import { syncCardOverlays3D, isViewTransitioning } from './card-overlay.js';

const _tmpVec3 = new THREE.Vector3();
const _tmpVec3b = new THREE.Vector3();
const _tmpQuat = new THREE.Quaternion();
const _tmpCamUp = new THREE.Vector3();
// 每帧复用的跨边节点 Set（避免每卡片遍历 crossEdges + getLayerForNode）
const _crossEdgeNodeIds = new Set();

// 卡片在节点上方的偏移量基础值（世界单位），实际偏移 = NODE_RADIUS + cardHWorld/2 + GAP
const CARD_ABOVE_GAP = 0.5;

export function updateCardBillboards(tm) {
  if (!appState.camera) return;
  const is2DView = appState.is2DView;
  const camQuat = appState.camera.quaternion;
  const camPos = appState.camera.position;
  // 相机前方向（用于视锥裁剪）
  _tmpVec3.set(0, 0, -1).applyQuaternion(camQuat);
  const camFwdX = _tmpVec3.x, camFwdY = _tmpVec3.y, camFwdZ = _tmpVec3.z;
  // 相机上方向（用于卡片在视角上方的偏移）
  _tmpCamUp.set(0, 1, 0).applyQuaternion(camQuat);
  const camUpX = _tmpCamUp.x, camUpY = _tmpCamUp.y, camUpZ = _tmpCamUp.z;

  // 2D 视图时隐藏所有 3D 卡片（2D 有自己的卡片渲染）
  if (is2DView && !isViewTransitioning()) {
    for (const [, obj] of appState.nodeMeshes.entries()) {
      if (obj.cardLabel) {
        obj.cardLabel.visible = false;
        obj.cardLabel.userData._cardAnimState = 'none';
      }
      if (obj.cardLabel?.userData?.beam) obj.cardLabel.userData.beam.visible = false;
    }
    syncCardOverlays3D();
    return;
  }

  for (const [id, obj] of appState.nodeMeshes.entries()) {
    const node = appState.nodeMap.get(id);
    const isCardMode = node && (node.displayMode === 'card' || node.displayMode === 'webpage');
    const isSel = appState.selectedNodeIds.has(id);

    // ── 卡片模式节点图标billboard朝向相机 ──
    if (obj.cardIcon && isCardMode) {
      // 计算从节点指向相机的方向（局部空间，因为父mesh无旋转=世界空间）
      _tmpVec3b.subVectors(camPos, obj.mesh.position).normalize();
      const R = appState.NODE_RADIUS || 0.22;
      obj.cardIcon.position.set(
        _tmpVec3b.x * (R + 0.005),
        _tmpVec3b.y * (R + 0.005),
        _tmpVec3b.z * (R + 0.005)
      );
      obj.cardIcon.quaternion.copy(camQuat);
    }

    // ── 非卡片模式节点：清除残留 cardLabel ──
    if (!isCardMode) {
      if (obj.cardLabel) {
        appState.scene.remove(obj.cardLabel);
        _disposeCardLabel(obj.cardLabel);
        obj.cardLabel = null;
      }
      continue;
    }

    // ── 卡片模式节点：仅选中时在上方投影全息卡片 ──
    if (!isSel) {
      // 未选中：执行折叠动画或保持隐藏
      if (obj.cardLabel) {
        const cl = obj.cardLabel;
        const animState = cl.userData._cardAnimState;
        if (animState === 'expanding' || animState === 'stabilizing' || animState === 'stable' || (cl.visible && animState !== 'fading' && animState !== 'collapsing')) {
          // 启动正文渐隐阶段
          cl.userData._cardAnimState = 'fading';
          cl.userData._cardFadeT = 1;  // 正文透明度从1开始衰减
          cl.userData._cardAnimT = cl.userData._cardAnimT ?? 1;
          cl.visible = true;
        }
        // ── 阶段1：正文渐隐，卡片保持原位 ──
        if (cl.userData._cardAnimState === 'fading') {
          let fadeT = cl.userData._cardFadeT ?? 1;
          fadeT *= 0.85;  // 正文快速渐隐
          cl.userData._cardFadeT = fadeT;
          // 卡片位置和缩放保持不变（t 保持为 1）
          const node2 = appState.nodeMap.get(id);
          if (node2) {
            const cardH2 = (node2.cardHeight || 200) * CARD_WORLD_SCALE;
            const off2 = (appState.NODE_RADIUS || 0.22) + cardH2 / 2 + CARD_ABOVE_GAP;
            cl.scale.setScalar(1);
            cl.position.copy(obj.mesh.position);
            cl.position.x += camUpX * off2;
            cl.position.y += camUpY * off2;
            cl.position.z += camUpZ * off2;
            cl.quaternion.copy(camQuat);
          }
          // 光束保持
          if (cl.userData.beamMat) cl.userData.beamMat.opacity = 0.5;
          if (cl.userData.beam) cl.userData.beam.visible = true;
          // 正文渐隐完成，进入折叠阶段
          if (fadeT < 0.01) {
            cl.userData._cardAnimState = 'collapsing';
            cl.userData._cardAnimT = 1;
          }
        }
        // ── 阶段2：卡片框架向节点收缩 ──
        if (cl.userData._cardAnimState === 'collapsing') {
          let t = cl.userData._cardAnimT ?? 1;
          t *= 0.82;  // 快速收缩
          cl.userData._cardAnimT = t;
          const node2 = appState.nodeMap.get(id);
          if (node2 && t > 0.005) {
            const cardH2 = (node2.cardHeight || 200) * CARD_WORLD_SCALE;
            const off2 = (appState.NODE_RADIUS || 0.22) + cardH2 / 2 + CARD_ABOVE_GAP;
            cl.scale.setScalar(Math.max(0.001, t));
            cl.position.copy(obj.mesh.position);
            cl.position.x += camUpX * off2 * t;
            cl.position.y += camUpY * off2 * t;
            cl.position.z += camUpZ * off2 * t;
            cl.quaternion.copy(camQuat);
            if (cl.userData.beamMat) cl.userData.beamMat.opacity = t * 0.5;
            if (cl.userData.beam) cl.userData.beam.visible = true;
          } else {
            // 折叠完成：隐藏
            cl.scale.setScalar(0.001);
            cl.visible = false;
            cl.userData._cardAnimState = 'none';
            cl.userData._cardAnimT = 0;
            if (cl.userData.beam) cl.userData.beam.visible = false;
          }
        }
      }
      continue;
    }

    // ── 选中的卡片节点：创建/显示 cardLabel ──
    // 视锥裁剪：相机后方或过远时不显示
    _tmpVec3.subVectors(obj.mesh.position, camPos);
    const dist = _tmpVec3.length();
    const dot = _tmpVec3.x * camFwdX + _tmpVec3.y * camFwdY + _tmpVec3.z * camFwdZ;
    if (dot < 0 || dist > 80) {
      if (obj.cardLabel) {
        obj.cardLabel.visible = false;
        obj.cardLabel.userData._offscreen = true;
      }
      continue;
    }

    // 计算卡片上方的偏移量：节点半径 + 卡片半高 + 间距
    const cardHWorld = (node.cardHeight || 200) * CARD_WORLD_SCALE;
    const aboveOffset = (appState.NODE_RADIUS || 0.22) + cardHWorld / 2 + CARD_ABOVE_GAP;

    // 按需创建 cardLabel
    if (!obj.cardLabel) {
      const pos = obj.mesh.position.clone();
      obj.cardLabel = _createCardLabel(node, pos);
      appState.scene.add(obj.cardLabel);
      // 投影光束也添加到 scene
      if (obj.cardLabel.userData.beam) {
        appState.scene.add(obj.cardLabel.userData.beam);
      }
      obj.cardLabel.visible = false;
      obj.cardLabel.scale.setScalar(0.001);
      obj.cardLabel.userData._cardAnimState = 'expanding';
      obj.cardLabel.userData._cardAnimT = 0;
    }

    const cardLabel = obj.cardLabel;

    // 清除视锥外标记
    cardLabel.userData._offscreen = false;

    // 启动展开动画（从折叠完成或初次创建时）
    if (!cardLabel.userData._cardAnimState || cardLabel.userData._cardAnimState === 'none') {
      cardLabel.userData._cardAnimState = 'expanding';
      cardLabel.userData._cardAnimT = cardLabel.userData._cardAnimT ?? 0;
    }
    // 如果正在渐隐/折叠中被重新选中，从当前进度反向展开
    if (cardLabel.userData._cardAnimState === 'fading' || cardLabel.userData._cardAnimState === 'collapsing') {
      cardLabel.userData._cardAnimState = 'expanding';
      // _cardAnimT 保持当前进度，从该点展开
    }

    cardLabel.visible = true;

    // ── 展开/折叠/idle 动画 ──
    const animState = cardLabel.userData._cardAnimState;
    let t = cardLabel.userData._cardAnimT ?? 0;

    if (animState === 'expanding') {
      // 展开：t 从当前值向 1 逼近
      t = t + (1 - t) * 0.15;
      if (t > 0.995) {
        t = 1;
        cardLabel.userData._cardAnimState = 'stabilizing';
        cardLabel.userData._stabilizeStart = performance.now();  // 用真实时间
      }
      cardLabel.userData._cardAnimT = t;
    }

    // 位置和缩放同步：t=0 在节点位置，t=1 在目标位置
    cardLabel.scale.setScalar(Math.max(0.001, t));
    cardLabel.position.copy(obj.mesh.position);
    cardLabel.position.x += camUpX * aboveOffset * t;
    cardLabel.position.y += camUpY * aboveOffset * t;
    cardLabel.position.z += camUpZ * aboveOffset * t;

    // billboard：朝向相机
    cardLabel.quaternion.copy(camQuat);

    // ── stabilizing 全息信号不稳定效果（展开后1秒内，用水平错位模拟信号故障） ──
    if (animState === 'stabilizing') {
      const elapsed = performance.now() - (cardLabel.userData._stabilizeStart ?? 0);
      const progress = Math.min(elapsed / 1000, 1);  // 0→1，1秒完成
      if (progress >= 1) {
        cardLabel.userData._cardAnimState = 'stable';
      } else {
        // 水平错位故障：随机触发，频率和幅度随时间衰减
        const intensity = (1 - progress) * 0.04;  // 衰减的偏移量
        const glitchChance = (1 - progress) * 0.15;  // 衰减的触发概率
        if (Math.random() < glitchChance) {
          // 沿相机右方向做水平偏移（模拟视频信号错位）
          const camRightX = camFwdY * camUpZ - camFwdZ * camUpY;
          const camRightY = camFwdZ * camUpX - camFwdX * camUpZ;
          const camRightZ = camFwdX * camUpY - camFwdY * camUpX;
          const shift = (Math.random() - 0.3) * intensity;  // 偏向一个方向
          cardLabel.position.x += camRightX * shift;
          cardLabel.position.y += camRightY * shift;
          cardLabel.position.z += camRightZ * shift;
        }
      }
    }

    // ── 更新投影光束世界坐标（从节点到卡片底部） ──
    const beam = cardLabel.userData.beam;
    if (beam) {
      const cardHWorld = (node.cardHeight || 200) * CARD_WORLD_SCALE;
      const positions = beam.geometry.attributes.position.array;
      // 起点：节点位置沿相机上方向偏移一个半径（球体顶部）
      positions[0] = obj.mesh.position.x + camUpX * appState.NODE_RADIUS;
      positions[1] = obj.mesh.position.y + camUpY * appState.NODE_RADIUS;
      positions[2] = obj.mesh.position.z + camUpZ * appState.NODE_RADIUS;
      // 终点：卡片底部中心（卡片中心沿相机上方向向下偏移半高）
      positions[3] = cardLabel.position.x - camUpX * cardHWorld / 2;
      positions[4] = cardLabel.position.y - camUpY * cardHWorld / 2;
      positions[5] = cardLabel.position.z - camUpZ * cardHWorld / 2;
      beam.geometry.attributes.position.needsUpdate = true;
      beam.visible = true;
      // 光束透明度呼吸动画
      const beamMat = cardLabel.userData.beamMat;
      if (beamMat) {
        beamMat.opacity = 0.4 + 0.3 * Math.sin(tm * 0.004);
      }
    }

    // ── 纹理状态更新 ──
    const isEditing = appState.currentEditNodeId === id;
    const hasCrossEdges = _crossEdgeNodeIds.has(id);
    const stateMask = (isSel ? 1 : 0) | (isEditing ? 8 : 0) | (hasCrossEdges ? 16 : 0);
    const sizeKey = node.cardWidth + 'x' + node.cardHeight;
    const lastUD = cardLabel.userData;
    if (lastUD._lastStateMask !== stateMask || lastUD._lastName !== node.name || lastUD._lastSizeKey !== sizeKey) {
      lastUD._lastStateMask = stateMask;
      lastUD._lastName = node.name;
      lastUD._lastSizeKey = sizeKey;
      _redrawCardTexture(cardLabel, node, {
        selected: true,
        connected: false,
        connectedStep: false,
        isCurrentlyEditing: isEditing,
        hasCrossEdges
      });
    }

    // ── 连续动画：发光面呼吸 ──
    if (dist > 50) continue;
    const glowPlane = lastUD.glowPlane;
    const sideMat = lastUD.sideMat;
    if (glowPlane) {
      let baseOpacity = 0.5;
      let glowColor = 0xffd700;
      if (isEditing) {
        baseOpacity = 0.6 + 0.3 * Math.sin(tm * 0.003);
        glowColor = 0x00cc66;
      } else if (hasCrossEdges) {
        baseOpacity = 0.5 + 0.25 * Math.sin(tm * 0.005);
      } else {
        baseOpacity = 0.5 + 0.25 * Math.sin(tm * 0.005);
      }
      glowPlane.material.opacity = baseOpacity;
      glowPlane.material.color.setHex(glowColor);
    }
    if (sideMat) {
      if (isSel || isEditing) {
        sideMat.emissiveIntensity = 1.0 + 0.5 * Math.sin(tm * 0.006);
      } else {
        sideMat.emissiveIntensity = 0.6 + 0.2 * Math.sin(tm * 0.002);
      }
    }
  }
  // 同步 3D 卡片正文 DOM overlay（渲染 HTML 内容 + 滚轮滑动）
  syncCardOverlays3D();
}
