// ============================================================
//  模块14：节点网格颜色更新（由 module14_Animation.js 拆分）
//  完整 HSL 颜色循环，暂停模式与 2D 常驻模式共用
// ============================================================
import * as THREE from 'three';
import { appState } from '../module0_AppState.js';
import { _SIMPLE_COL_SEL, _SIMPLE_COL_STEP, _SIMPLE_COL_CONN, _SIMPLE_COL_DEFAULT, _tmpColor } from './share.js';

// 节点颜色更新（完整 HSL 循环）：暂停模式与 2D 常驻模式共用。
// 2D 卡片边框色读取 3D mesh 材质色（node-renderers.js 优先 _borderColorHex 缓存），
// 此循环是 2D 节点颜色呼吸的驱动源，2D 常驻期间也必须持续执行
export function updateNodeMeshColors(tm, _frameSkipCounter) {
  for (let [id, obj] of appState.nodeMeshes.entries()) {
    if (!obj.mesh.visible) continue;

    // F1 隐藏标签覆盖：只隐藏标签，不影响动画
    if (appState._hideLabelsOverride && obj.label) {
      obj.label.visible = false;
    }

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
          // HSL 参数仅依赖 id，缓存到 obj._colorParams 避免重复字符串哈希（与主循环共用）
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
        }
      }
    }
    // 缓存节点颜色 hex 字符串，供 2D 视图绘制边框时直接读取
    if (obj.mesh?.material?.color) obj._borderColorHex = '#' + obj.mesh.material.color.getHexString();
  }
}