// ============================================================
//  MoveMode / move-mode / shared-internal.js — 模块内部共享工具
//  - 节点树遍历辅助
//  - 拖拽后重叠消解
//  - 节点 ID 生成
// ============================================================

import * as THREE from 'three';
import { appState } from '../../module0_AppState.js';
import { updateLinesForNodes } from '../../VisualComponents/index.js';

// ============================================================
//  收集节点的所有子孙 ID（含自身）
// ============================================================
export function collectDescendants(rootId) {
  const ids = new Set();
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop();
    if (!ids.has(id)) {
      ids.add(id);
      const node = appState.nodeMap.get(id);
      if (node && node.children) node.children.forEach(ch => stack.push(ch.id));
    }
  }
  return ids;
}

// ============================================================
//  拖拽后消解与其它节点的重叠（迭代式弹簧推开）
// ============================================================
export function resolveOverlapAfterMove(movedRootId) {
  const movedIds = collectDescendants(movedRootId);
  const movedSet = new Set(movedIds);
  const allNodes = Array.from(appState.nodeMeshes.keys());
  const iterations = 5;
  for (let iter = 0; iter < iterations; iter++) {
    let anyOverlap = false;
    for (const id of movedIds) {
      const movedObj = appState.nodeMeshes.get(id);
      if (!movedObj) continue;
      const movedScale = (appState.nodeMap.get(id)?.sizeScale || 1);
      const movedRadius = (appState.NODE_RADIUS + 0.22 + 0.022) * movedScale;
      const movedPos = appState.positions.get(id);
      if (!movedPos) continue;
      for (const otherId of allNodes) {
        if (movedSet.has(otherId)) continue;
        const otherObj = appState.nodeMeshes.get(otherId);
        if (!otherObj || !otherObj.mesh.visible) continue;
        const otherScale = (appState.nodeMap.get(otherId)?.sizeScale || 1);
        const otherRadius = (appState.NODE_RADIUS + 0.22 + 0.022) * otherScale;
        const otherPos = appState.positions.get(otherId);
        if (!otherPos) continue;
        const delta = new THREE.Vector3().subVectors(movedPos, otherPos);
        const dist = delta.length();
        const minDist = movedRadius + otherRadius;
        if (dist < minDist && dist > 0.001) {
          anyOverlap = true;
          const pushDir = delta.normalize();
          const overlap = minDist - dist;
          movedPos.add(pushDir.clone().multiplyScalar(overlap));
          movedObj.mesh.position.copy(movedPos);
          if (movedObj.label) movedObj.label.position.set(movedPos.x, movedPos.y + appState.NODE_RADIUS + 0.28, movedPos.z);
        }
      }
    }
    if (!anyOverlap) break;
  }
  // 🔧 增量更新：只刷新被移动节点涉及的连线，避免销毁重建其余连线
  updateLinesForNodes([...movedIds]);
}

// ============================================================
//  查找父节点
// ============================================================
export function _findParentNode(nodeId) {
  const root = appState.methodsTree;
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    if (current.children) {
      for (const child of current.children) {
        if (child.id === nodeId) return current;
        stack.push(child);
      }
    }
  }
  return null;
}

// ============================================================
//  获取节点深度（根节点深度=1）
// ============================================================
export function _getNodeDepth(nodeId) {
  let depth = 0;
  let currentId = nodeId;
  const visited = new Set();
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const parent = _findParentNode(currentId);
    if (!parent || parent.id === appState.methodsTree?.id) break;
    depth++;
    currentId = parent.id;
  }
  return Math.max(1, depth);
}

// ============================================================
//  生成唯一节点 ID
// ============================================================
export function generateNodeId() {
  let newId = 'N' + Date.now() + Math.floor(Math.random() * 10000);
  while (appState.nodeMap.has(newId)) newId = 'N' + Date.now() + Math.floor(Math.random() * 10000);
  return newId;
}
