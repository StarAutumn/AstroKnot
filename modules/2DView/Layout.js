// ============================================================
//  2DView / Layout.js — 树布局算法（纯函数）
//  不依赖任何 DOM / Canvas 状态，可独立测试
// ============================================================

import { appState } from '../module0_AppState.js';
import {
  BASE_NODE_WIDTH, BASE_NODE_HEIGHT, H_GAP, V_GAP,
  POLYLINE_PEG_X, POLYLINE_PEG_Y, getNodeWidth
} from './shared.js';

// -------- 判断是否为步骤节点（仅通过 isStepFlow 属性判断，与节点命名完全独立） --------
export function isNextStepNode(node) {
  return node && node.isStepFlow === true;
}

// -------- 传统树布局 --------
function layoutTraditionalTree(node) {
  const children = node.children || [];
  const scale = node.sizeScale || 1;
  const nodeWidth = getNodeWidth(node, scale);
  const nodeHeight = BASE_NODE_HEIGHT * scale;

  const layout = {
    node,
    width: nodeWidth,
    height: nodeHeight,
    x: 0, y: 0,
    children: [],
    subtreeWidth: nodeWidth,
    subtreeHeight: nodeHeight,
    offset: 0
  };

  if (children.length === 0) return layout;

  const normalChildren = [];
  const stepChildren = [];
  for (const child of children) {
    if (isNextStepNode(child)) stepChildren.push(child);
    else normalChildren.push(child);
  }

  const childLayouts = [];
  for (const child of normalChildren) childLayouts.push(layoutTraditionalTree(child));
  for (const child of stepChildren) childLayouts.push(layoutStepTree(child));

  layout.children = childLayouts;

  let normalTotalHeight = 0, normalMaxWidth = 0;
  for (let i = 0; i < normalChildren.length; i++) {
    const ch = childLayouts[i];
    normalTotalHeight += ch.subtreeHeight;
    normalMaxWidth = Math.max(normalMaxWidth, ch.subtreeWidth);
  }
  normalTotalHeight += V_GAP * Math.max(0, normalChildren.length - 1);
  // 子节点有右移偏移时，添加上方避让间距，避免连接线与上方兄弟分支重叠
  for (let i = 1; i < normalChildren.length; i++) {
    normalTotalHeight += childLayouts[i].offset || 0;
  }

  let stepTotalWidth = 0, stepMaxHeight = 0, stepCoreWidth = 0;
  for (let i = normalChildren.length; i < childLayouts.length; i++) {
    const ch = childLayouts[i];
    stepCoreWidth += ch.width;
    stepTotalWidth += ch.subtreeWidth;
    stepMaxHeight = Math.max(stepMaxHeight, ch.subtreeHeight);
  }
  stepCoreWidth += H_GAP * Math.max(0, stepChildren.length - 1);
  stepTotalWidth += H_GAP * Math.max(0, stepChildren.length - 1);

  // 父节点纵向居中偏移：与子节点对称轴对齐
  const parentYOffset = normalChildren.length > 0
    ? Math.max(0, (normalTotalHeight - nodeHeight) / 2)
    : stepMaxHeight > 0 ? Math.max(0, (stepMaxHeight - nodeHeight) / 2) : 0;
  layout.parentYOffset = parentYOffset;
  layout.stepMaxHeight = stepMaxHeight;

  // 节点右移偏移量，仅按下一步子节点自身宽度居中（不含其右侧子节点分支）
  const offset = stepCoreWidth > nodeWidth ? (stepCoreWidth - nodeWidth) / 2 : 0;
  layout.offset = offset;
  layout.stepTotalWidth = stepTotalWidth;

  // 右侧正常子节点起始 X（步骤子节点在下方，不参与横向避让）
  const normalStartX = offset + nodeWidth + H_GAP;
  const normalRegionWidth = normalMaxWidth > 0 ? normalStartX + normalMaxWidth : normalStartX;
  const normalRegionHeight = normalTotalHeight > 0 ? Math.max(nodeHeight, normalTotalHeight) : stepMaxHeight > 0 ? Math.max(nodeHeight, stepMaxHeight) : nodeHeight;
  const stepRegionHeight = stepMaxHeight > 0 ? normalRegionHeight + V_GAP + stepMaxHeight : normalRegionHeight;

  layout.subtreeWidth = normalRegionWidth;
  layout.subtreeHeight = stepRegionHeight;
  return layout;
}

// -------- 步骤流布局 --------
function layoutStepTree(node) {
  const children = node.children || [];
  const scale = node.sizeScale || 1;
  const nodeWidth = getNodeWidth(node, scale);
  const nodeHeight = BASE_NODE_HEIGHT * scale;

  const layout = {
    node,
    width: nodeWidth,
    height: nodeHeight,
    x: 0, y: 0,
    children: [],
    subtreeWidth: nodeWidth,
    subtreeHeight: nodeHeight,
    offset: 0,
    isStepFlow: true
  };

  if (children.length === 0) return layout;

  const childLayouts = children.map(child => {
    if (isNextStepNode(child)) return layoutStepTree(child);
    else return layoutTraditionalTree(child);
  });
  layout.children = childLayouts;

  const normalChildren = [];
  const stepChildren = [];
  for (const ch of childLayouts) {
    if (ch.isStepFlow) stepChildren.push(ch);
    else normalChildren.push(ch);
  }

  let normalMaxWidth = 0, normalTotalHeight = 0;
  for (const ch of normalChildren) {
    normalMaxWidth = Math.max(normalMaxWidth, ch.subtreeWidth);
    normalTotalHeight += ch.subtreeHeight + V_GAP;
  }
  if (normalTotalHeight > 0) normalTotalHeight -= V_GAP;
  // 子节点有右移偏移时，添加上方避让间距，避免连接线与上方兄弟分支重叠
  for (let i = 1; i < normalChildren.length; i++) {
    normalTotalHeight += normalChildren[i].offset || 0;
  }

  let stepTotalWidth = 0, stepMaxHeight = 0, stepCoreWidth = 0;
  for (const ch of stepChildren) {
    stepCoreWidth += ch.width;
    stepTotalWidth += ch.subtreeWidth;
    stepMaxHeight = Math.max(stepMaxHeight, ch.subtreeHeight);
  }
  if (stepChildren.length > 0) stepCoreWidth += H_GAP * (stepChildren.length - 1);
  if (stepChildren.length > 0) stepTotalWidth += H_GAP * (stepChildren.length - 1);

  // 父节点纵向居中偏移：与子节点对称轴对齐
  const parentYOffset = normalChildren.length > 0
    ? Math.max(0, (normalTotalHeight - nodeHeight) / 2)
    : stepMaxHeight > 0 ? Math.max(0, (stepMaxHeight - nodeHeight) / 2) : 0;
  layout.parentYOffset = parentYOffset;
  layout.stepMaxHeight = stepMaxHeight;

  // 节点右移偏移量，仅按下一步子节点自身宽度居中（不含其右侧子节点分支）
  const offset = stepCoreWidth > nodeWidth ? (stepCoreWidth - nodeWidth) / 2 : 0;
  layout.offset = offset;
  layout.stepTotalWidth = stepTotalWidth;

  // 右侧正常子节点起始 X（步骤子节点在下方，不参与横向避让）
  const normalStartX = offset + nodeWidth + H_GAP;
  const normalRegionWidth = normalMaxWidth > 0 ? normalStartX + normalMaxWidth : normalStartX;
  const normalRegionHeight = normalTotalHeight > 0 ? Math.max(nodeHeight, normalTotalHeight) : stepMaxHeight > 0 ? Math.max(nodeHeight, stepMaxHeight) : nodeHeight;
  const stepRegionHeight = stepMaxHeight > 0 ? normalRegionHeight + V_GAP + stepMaxHeight : normalRegionHeight;

  layout.subtreeWidth = normalRegionWidth;
  layout.subtreeHeight = stepRegionHeight;

  return layout;
}

// -------- 分配传统坐标 --------
function assignTraditionalCoordinates(layout, x, y) {
  const scale = layout.node.sizeScale || 1;
  const nodeWidth = getNodeWidth(layout.node, scale);
  const nodeHeight = BASE_NODE_HEIGHT * scale;
  const offset = layout.offset || 0;
  const parentYOffset = layout.parentYOffset || 0;
  layout.x = x + offset;
  layout.y = y + parentYOffset;

  if (layout.children.length === 0) return;

  const normalChildren = [];
  const stepChildren = [];
  for (const child of layout.children) {
    if (isNextStepNode(child.node)) stepChildren.push(child);
    else normalChildren.push(child);
  }

  let normalChildY = y;
  // 右侧正常子节点起始 X（步骤子节点在下方，不参与横向避让）
  const normalStartX = offset + nodeWidth + H_GAP;
  for (let i = 0; i < normalChildren.length; i++) {
    const child = normalChildren[i];
    // 子节点有右移偏移时，添加额外间距避免连接线与上方兄弟分支重叠
    if (i > 0 && child.offset) {
      normalChildY += child.offset;
    }
    if (child.isStepFlow) assignStepCoordinates(child, x + normalStartX, normalChildY);
    else assignTraditionalCoordinates(child, x + normalStartX, normalChildY);
    normalChildY += child.subtreeHeight + V_GAP;
  }

  if (stepChildren.length > 0) {
    const stepStartX = x;
    let normalTotalHeight = 0;
    for (const child of normalChildren) normalTotalHeight += child.subtreeHeight;
    normalTotalHeight += V_GAP * Math.max(0, normalChildren.length - 1);
    // 子节点有右移偏移时，添加上方避让间距
    for (let i = 1; i < normalChildren.length; i++) {
      normalTotalHeight += normalChildren[i].offset || 0;
    }
    const stepMaxHeight = layout.stepMaxHeight || 0;
    const normalRegionHeight = normalChildren.length > 0 ? Math.max(nodeHeight, normalTotalHeight) : stepMaxHeight > 0 ? Math.max(nodeHeight, stepMaxHeight) : nodeHeight;
    const stepStartY = y + normalRegionHeight + V_GAP;
    let currentX = stepStartX;
    for (const child of stepChildren) {
      if (child.isStepFlow) assignStepCoordinates(child, currentX, stepStartY);
      else assignTraditionalCoordinates(child, currentX, stepStartY);
      currentX += child.subtreeWidth + H_GAP;
    }
  }
}

// -------- 分配步骤流坐标 --------
function assignStepCoordinates(layout, x, y) {
  const scale = layout.node.sizeScale || 1;
  const nodeWidth = getNodeWidth(layout.node, scale);
  const nodeHeight = BASE_NODE_HEIGHT * scale;
  const offset = layout.offset || 0;
  const parentYOffset = layout.parentYOffset || 0;
  layout.x = x + offset;
  layout.y = y + parentYOffset;

  if (layout.children.length === 0) return;

  const normalChildren = [];
  const stepChildren = [];
  for (const child of layout.children) {
    if (child.isStepFlow) stepChildren.push(child);
    else normalChildren.push(child);
  }

  let normalChildY = y;
  // 右侧正常子节点起始 X（步骤子节点在下方，不参与横向避让）
  const normalStartX = offset + nodeWidth + H_GAP;
  for (let i = 0; i < normalChildren.length; i++) {
    const child = normalChildren[i];
    // 子节点有右移偏移时，添加额外间距避免连接线与上方兄弟分支重叠
    if (i > 0 && child.offset) {
      normalChildY += child.offset;
    }
    assignTraditionalCoordinates(child, x + normalStartX, normalChildY);
    normalChildY += child.subtreeHeight + V_GAP;
  }

  if (stepChildren.length > 0) {
    const stepStartX = x;
    // 步骤子节点排在正常子节点区域下方，避免重叠
    let normalTotalHeight = 0;
    for (const child of normalChildren) normalTotalHeight += child.subtreeHeight;
    normalTotalHeight += V_GAP * Math.max(0, normalChildren.length - 1);
    // 子节点有右移偏移时，添加上方避让间距
    for (let i = 1; i < normalChildren.length; i++) {
      normalTotalHeight += normalChildren[i].offset || 0;
    }
    const stepMaxHeight = layout.stepMaxHeight || 0;
    const normalRegionHeight = normalChildren.length > 0 ? Math.max(nodeHeight, normalTotalHeight) : stepMaxHeight > 0 ? Math.max(nodeHeight, stepMaxHeight) : nodeHeight;
    const stepStartY = y + normalRegionHeight + V_GAP;
    let currentX = stepStartX;
    for (const child of stepChildren) {
      assignStepCoordinates(child, currentX, stepStartY);
      currentX += child.subtreeWidth + H_GAP;
    }
  }
}

// -------- 统一入口：根据节点类型选择布局 --------
export function layoutTree(node) {
  if (!node) return { node: null, children: [], x: 0, y: 0, width: 0, height: 0, subtreeWidth: 0, subtreeHeight: 0, isStepFlow: false };
  if (isNextStepNode(node)) {
    const layout = layoutStepTree(node);
    layout.isStepFlow = true;
    return layout;
  } else {
    const layout = layoutTraditionalTree(node);
    layout.isStepFlow = false;
    return layout;
  }
}

// -------- 统一坐标分配入口 --------
export function assignCoordinates(layout, x, y) {
  if (layout.isStepFlow) assignStepCoordinates(layout, x, y);
  else assignTraditionalCoordinates(layout, x, y);
}

// -------- 从布局中提取节点位置到 Map --------
export function extractNodePositions(layout, positionMap = new Map()) {
  if (layout.node.id) {
    const stored = appState.positions2D.get(layout.node.id);
    // 虚拟根节点 + 其直接子节点（真实根节点）永远是锚点，不写入 positions2D
    const isProtectedRoot = layout.node.id === (appState.VIRTUAL_ROOT_ID || '__VIRTUAL_ROOT__')
      || (appState.methodsTree && appState.methodsTree.children
        && appState.methodsTree.children.some(c => c && c.id === layout.node.id));
    if (stored) {
      positionMap.set(layout.node.id, { x: stored.x, y: stored.y });
    } else if (isProtectedRoot) {
      // 虚拟根/真实根无存储位置 → 保存当前布局位置作为稳定锚点，防止后续结构变化导致跳动
      const pos = { x: layout.x, y: layout.y };
      if (layout.node.id !== (appState.VIRTUAL_ROOT_ID || '__VIRTUAL_ROOT__')) {
        appState.positions2D.set(layout.node.id, pos);
      }
      positionMap.set(layout.node.id, pos);
    } else {
      const pos = { x: layout.x, y: layout.y };
      appState.positions2D.set(layout.node.id, pos);
      positionMap.set(layout.node.id, pos);
    }
  }
  for (const child of layout.children) extractNodePositions(child, positionMap);
  return positionMap;
}

// -------- 收集后代节点 ID --------
export function collectDescendantIds(nodeId) {
  const ids = new Set();
  const stack = [nodeId];
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

// -------- 节点重叠消除 --------
export function resolveNodeOverlaps(positionMap, existingIds) {
  let PADDING = 4;
  for (let iter = 0; iter < 8; iter++) {
    let anyOverlap = false;
    let entries = Array.from(positionMap.entries());
    for (let i = 0; i < entries.length; i++) {
      let idA = entries[i][0], posA = entries[i][1];
      let nodeA = appState.nodeMap.get(idA);
      if (!nodeA) continue;
      let scaleA = nodeA.sizeScale || 1;
      let wA = getNodeWidth(nodeA, scaleA);
      let hA = BASE_NODE_HEIGHT * scaleA;
      for (let j = i + 1; j < entries.length; j++) {
        let idB = entries[j][0], posB = entries[j][1];
        let nodeB = appState.nodeMap.get(idB);
        if (!nodeB) continue;
        let scaleB = nodeB.sizeScale || 1;
        let wB = getNodeWidth(nodeB, scaleB);
        let hB = BASE_NODE_HEIGHT * scaleB;
        let overlapX = Math.max(0, Math.min(posA.x + wA, posB.x + wB) - Math.max(posA.x, posB.x));
        let overlapY = Math.max(0, Math.min(posA.y + hA, posB.y + hB) - Math.max(posA.y, posB.y));
        if (overlapX > 0 && overlapY > 0) {
          anyOverlap = true;
          let moveA = !existingIds.has(idA);
          let moveB = !existingIds.has(idB);
          if (!moveA && !moveB) continue;
          let pushCount = (moveA ? 1 : 0) + (moveB ? 1 : 0);
          let pushX = (overlapX + PADDING) / pushCount;
          let pushY = (overlapY + PADDING) / pushCount;
          if (posA.x + wA / 2 < posB.x + wB / 2) {
            if (moveA) posA.x -= pushX;
            if (moveB) posB.x += pushX;
          } else {
            if (moveA) posA.x += pushX;
            if (moveB) posB.x -= pushX;
          }
          if (posA.y + hA / 2 < posB.y + hB / 2) {
            if (moveA) posA.y -= pushY;
            if (moveB) posB.y += pushY;
          } else {
            if (moveA) posA.y += pushY;
            if (moveB) posB.y -= pushY;
          }
          if (moveA) appState.positions2D.set(idA, { x: posA.x, y: posA.y });
          if (moveB) appState.positions2D.set(idB, { x: posB.x, y: posB.y });
        }
      }
    }
    if (!anyOverlap) break;
  }
}

// -------- 收集树连线（排除交叉连线）--------
function collectTreeEdgeLines(layout, positionMap, lines) {
  if (!layout || !layout.node) return;
  let pos = positionMap.get(layout.node.id);
  let children = layout.children || [];
  for (let ci = 0; ci < children.length; ci++) {
    let child = children[ci];
    let childPos = positionMap.get(child.node.id);
    if (!childPos) continue;
    let isStepNode = isNextStepNode(child.node);
    let pX = pos ? pos.x : layout.x;
    let pY = pos ? pos.y : layout.y;
    if (isStepNode) {
      // 折线：父下框中点 → 下短距拐点 → 左右延伸到子竖直线 → 下连子上框中点
      let parentOutputX = pX + layout.width / 2;
      let parentOutputY = pY + layout.height;
      let childInputX = childPos.x + child.width / 2;
      let childInputY = childPos.y;
      let pegY = parentOutputY + POLYLINE_PEG_Y;
      lines.push({ x1: parentOutputX, y1: parentOutputY, x2: parentOutputX, y2: pegY, parentId: layout.node.id, childId: child.node.id });
      lines.push({ x1: parentOutputX, y1: pegY, x2: childInputX, y2: pegY, parentId: layout.node.id, childId: child.node.id });
      lines.push({ x1: childInputX, y1: pegY, x2: childInputX, y2: childInputY, parentId: layout.node.id, childId: child.node.id });
    } else {
      // 折线：父右框中点 → 右短距拐点 → 上下延伸到子水平线 → 右连子左框中点
      let parentOutputX = pX + layout.width;
      let parentOutputY = pY + layout.height / 2;
      let childInputX = childPos.x;
      let childInputY = childPos.y + child.height / 2;
      let pegX = parentOutputX + POLYLINE_PEG_X;
      lines.push({ x1: parentOutputX, y1: parentOutputY, x2: pegX, y2: parentOutputY, parentId: layout.node.id, childId: child.node.id });
      lines.push({ x1: pegX, y1: parentOutputY, x2: pegX, y2: childInputY, parentId: layout.node.id, childId: child.node.id });
      lines.push({ x1: pegX, y1: childInputY, x2: childInputX, y2: childInputY, parentId: layout.node.id, childId: child.node.id });
    }
    collectTreeEdgeLines(child, positionMap, lines);
  }
}

// -------- 线段与矩形相交检测 --------
function lineRectOverlap(x1, y1, x2, y2, rx, ry, rw, rh) {
  let pad = 3;
  rx -= pad; ry -= pad; rw += pad * 2; rh += pad * 2;
  if ((x1 < rx && x2 < rx) || (x1 > rx + rw && x2 > rx + rw) ||
      (y1 < ry && y2 < ry) || (y1 > ry + rh && y2 > ry + rh)) return false;
  if (x1 >= rx && x1 <= rx + rw && y1 >= ry && y1 <= ry + rh) return true;
  if (x2 >= rx && x2 <= rx + rw && y2 >= ry && y2 <= ry + rh) return true;
  function segInt(ax1, ay1, ax2, ay2, bx1, by1, bx2, by2) {
    let d1x = ax2 - ax1, d1y = ay2 - ay1;
    let d2x = bx2 - bx1, d2y = by2 - by1;
    let cross = d1x * d2y - d1y * d2x;
    if (Math.abs(cross) < 1e-10) return false;
    let t = ((bx1 - ax1) * d2y - (by1 - ay1) * d2x) / cross;
    let u = ((bx1 - ax1) * d1y - (by1 - ay1) * d1x) / cross;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  }
  if (segInt(x1, y1, x2, y2, rx, ry, rx + rw, ry)) return true;
  if (segInt(x1, y1, x2, y2, rx, ry + rh, rx + rw, ry + rh)) return true;
  if (segInt(x1, y1, x2, y2, rx, ry, rx, ry + rh)) return true;
  if (segInt(x1, y1, x2, y2, rx + rw, ry, rx + rw, ry + rh)) return true;
  return false;
}

// -------- 避开树连线（新节点不挡住连线）--------
export function resolveNodeLineOverlaps(positionMap, layout, existingIds) {
  let lines = [];
  collectTreeEdgeLines(layout, positionMap, lines);
  if (lines.length === 0) return;
  let LINE_PAD = 5;
  for (let iter = 0; iter < 6; iter++) {
    let anyOverlap = false;
    let entries = Array.from(positionMap.entries());
    for (let i = 0; i < entries.length; i++) {
      let id = entries[i][0], pos = entries[i][1];
      if (existingIds.has(id)) continue;
      let node = appState.nodeMap.get(id);
      if (!node) continue;
      let sc = node.sizeScale || 1;
      let w = BASE_NODE_WIDTH * sc, h = BASE_NODE_HEIGHT * sc;
      for (let li = 0; li < lines.length; li++) {
        let ln = lines[li];
        if (ln.parentId === id || ln.childId === id) continue;
        if (lineRectOverlap(ln.x1, ln.y1, ln.x2, ln.y2, pos.x, pos.y, w, h)) {
          anyOverlap = true;
          let dx = ln.x2 - ln.x1, dy = ln.y2 - ln.y1;
          let len = Math.sqrt(dx * dx + dy * dy) || 1;
          let nx = -dy / len, ny = dx / len;
          let cx = pos.x + w / 2, cy = pos.y + h / 2;
          let mx = (ln.x1 + ln.x2) / 2, my = (ln.y1 + ln.y2) / 2;
          let dot = (cx - mx) * nx + (cy - my) * ny;
          if (dot >= 0) { pos.x += nx * LINE_PAD; pos.y += ny * LINE_PAD; }
          else { pos.x -= nx * LINE_PAD; pos.y -= ny * LINE_PAD; }
          appState.positions2D.set(id, { x: pos.x, y: pos.y });
          break;
        }
      }
    }
    if (!anyOverlap) break;
  }
}