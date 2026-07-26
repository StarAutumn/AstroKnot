// ============================================================
//  2DView / render / visibility.js — 图层过滤 / 动画进度 / 可见性
// ============================================================

import { appState } from '../../module0_AppState.js';
import { getAnimationEntry, finalizeAnimation, _frameNow } from './frame-state.js';

// ============================================================
//  图层过滤
// ============================================================
export function isNodeInCurrentLayer(nodeId) {
  if (!nodeId) return false;
  const layer = appState.getCurrentLayer();
  if (!layer || !layer.nodeIds) return true;
  return layer.nodeIds.has(nodeId);
}

// ============================================================
//  动画进度
// ============================================================
export function getAnimationProgress(nodeId) {
  const anim = getAnimationEntry(nodeId);
  if (!anim) return null;
  const elapsed = _frameNow - anim.startTime;
  const t = Math.min(1, elapsed / anim.duration);
  const progress = anim.direction === 'expand' ? t : (1 - t);
  return { progress, finished: t >= 1, direction: anim.direction };
}

/** 移除已完成动画并更新折叠状态（包装 frame-state.finali­zeAnimation） */
export function finalizeAnimationProgress(nodeId, direction) {
  finalizeAnimation(nodeId, direction);
}

// ============================================================
//  parentMap 缓存：每帧构建一次（O(n)），避免 getNodeVisibilityAlpha 中 O(n²) BFS
// ============================================================
let _parentMap = new Map();
let _parentMapTreeRef = null;  // 用于检测 methodsTree 引用是否变化

/** 每帧 draw() 开始时调用：构建 parentId 映射 */
export function rebuildParentMap() {
  const root = appState.methodsTree;
  // methodsTree 引用未变 → 复用缓存
  if (root === _parentMapTreeRef) return;
  _parentMapTreeRef = root;
  _parentMap.clear();
  if (!root) return;
  // 迭代遍历，避免递归栈
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    if (node.children) {
      for (const child of node.children) {
        if (child.id) _parentMap.set(child.id, node);
        stack.push(child);
      }
    }
  }
}

// ============================================================
//  查找父节点（O(1) 从 parentMap 查找）
// ============================================================
export function findParentNode(nodeId) {
  return _parentMap.get(nodeId) || null;
}

// ============================================================
//  获取节点可见透明度（考虑祖先折叠状态）
// ============================================================
export function getNodeVisibilityAlpha(nodeId) {
  let alpha = 1;
  let currentId = nodeId;
  while (currentId) {
    const node = appState.nodeMap.get(currentId);
    if (!node) break;
    const parent = findParentNode(currentId);
    if (!parent) break;
    const animState = getAnimationProgress(parent.id);
    if (appState.collapsed2D.has(parent.id)) {
      if (animState && animState.direction === 'expand') alpha *= animState.progress;
      else return 0;
    } else if (animState && animState.direction === 'collapse') alpha *= animState.progress;
    currentId = parent.id;
  }
  return alpha;
}
