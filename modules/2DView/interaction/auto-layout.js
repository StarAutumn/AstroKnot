// ============================================================
//  2DView / interaction / auto-layout.js — 自动排列布局计算
// ============================================================

import { appState } from '../../module0_AppState.js';
import { startArrangeAnimation2D, skipArrangeAnimation2D } from '../../UI/ArrangeAnimation.js';
import {
  layoutTree, assignCoordinates,
  isNextStepNode
} from '../Layout.js';

// 自动排列（动画中再点击会跳过当前动画后重新排列）
export function autoArrangeTreeLayout() {
  if (appState.arrangeAnim2DActive) {
    skipArrangeAnimation2D();
    // 继续执行下面的计算+启动
  }

  const targetPositions = computeAutoArrangeTargets();
  if (targetPositions.size === 0) return;
  startArrangeAnimation2D(targetPositions);
}

// 计算 2D 自动排列目标位置（不修改 positions2D，不调用 draw）
export function computeAutoArrangeTargets() {
  const rootNode = appState.methodsTree;
  if (!rootNode || !rootNode.id) return new Map();

  // 虚拟根节点位置
  if (!appState.positions2D.has(rootNode.id)) {
    appState.positions2D.set(rootNode.id, { x: -500, y: -200 });
  }

  const targetPositions = new Map();

  // 以每个真实根节点作为独立子树的根进行排布
  for (const realRoot of (rootNode.children || [])) {
    if (!realRoot || !realRoot.id) continue;

    // 计算子树布局
    const subLayout = layoutTree(realRoot);
    assignCoordinates(subLayout, 0, 0);

    // 真实根节点作为锚点
    let anchorPos = appState.positions2D.get(realRoot.id);
    if (!anchorPos) {
      anchorPos = { x: subLayout.x, y: subLayout.y };
      appState.positions2D.set(realRoot.id, { x: anchorPos.x, y: anchorPos.y });
    }

    const anchorLocalX = subLayout.x;
    const anchorLocalY = subLayout.y;
    const offsetX = anchorPos.x - anchorLocalX;
    const offsetY = anchorPos.y - anchorLocalY;

    // 收集真实根的子孙节点
    const positions = new Map();
    for (const child of subLayout.children) {
      collectLayoutPositions(child, false, positions);
    }

    // 应用偏移，写入 targetPositions
    for (const [id, pos] of positions) {
      pos.x += offsetX;
      pos.y += offsetY;
      targetPositions.set(id, { x: pos.x, y: pos.y });
    }

    // 真实根节点位置不变
    targetPositions.set(realRoot.id, { x: anchorPos.x, y: anchorPos.y });
  }

  // 虚拟根节点位置也包含
  const rootPos = appState.positions2D.get(rootNode.id);
  if (rootPos) targetPositions.set(rootNode.id, { x: rootPos.x, y: rootPos.y });

  return targetPositions;
}

// 增量排列：只重排指定节点所在的子树（新建子节点时使用，避免全量重算）
export function arrangeSubtreeIncremental(affectedNodeId) {
  // 从受影响节点向上找到真实根节点
  const rootNode = appState.methodsTree;
  if (!rootNode) return;

  let realRoot = null;
  const realRoots = rootNode.children || [];

  // 检查受影响节点是否就是真实根
  for (const rr of realRoots) {
    if (rr && rr.id === affectedNodeId) { realRoot = rr; break; }
  }

  // 如果不是真实根，找到包含该节点的真实根
  if (!realRoot) {
    function findRoot(nodeId) {
      for (const rr of realRoots) {
        if (rr && rr.id === nodeId) return rr;
        const found = _searchInTree(rr, nodeId);
        if (found) return rr;
      }
      return null;
    }
    realRoot = findRoot(affectedNodeId);
  }

  if (!realRoot) return;

  // 只重排这个真实根的子树
  const subLayout = layoutTree(realRoot);
  assignCoordinates(subLayout, 0, 0);

  let anchorPos = appState.positions2D.get(realRoot.id);
  if (!anchorPos) {
    anchorPos = { x: subLayout.x, y: subLayout.y };
    appState.positions2D.set(realRoot.id, { x: anchorPos.x, y: anchorPos.y });
  }

  const offsetX = anchorPos.x - subLayout.x;
  const offsetY = anchorPos.y - subLayout.y;

  // 直接写入 positions2D（仅此子树）
  for (const child of subLayout.children) {
    _applyLayoutPositions(child, offsetX, offsetY);
  }
}

function _searchInTree(node, targetId) {
  if (!node) return false;
  if (node.id === targetId) return true;
  for (const child of (node.children || [])) {
    if (_searchInTree(child, targetId)) return true;
  }
  return false;
}

function _applyLayoutPositions(layout, offsetX, offsetY) {
  if (layout.node.id) {
    appState.positions2D.set(layout.node.id, {
      x: layout.x + offsetX,
      y: layout.y + offsetY
    });
  }
  for (const child of layout.children) {
    _applyLayoutPositions(child, offsetX, offsetY);
  }
}

export function collectLayoutPositions(layout, skipSteps, positionMap) {
  if (!positionMap) positionMap = new Map();
  if (layout.node.id && !(skipSteps && isNextStepNode(layout.node))) {
    positionMap.set(layout.node.id, { x: layout.x, y: layout.y });
  }
  for (const child of layout.children) {
    collectLayoutPositions(child, skipSteps, positionMap);
  }
  return positionMap;
}
