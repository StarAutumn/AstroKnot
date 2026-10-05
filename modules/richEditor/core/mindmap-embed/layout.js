// ============================================================
//  mindmap-embed/layout.js — 排列避让布局（移植 2DView/Layout.js）
//  - 传统树 + 步骤流两种布局算法与坐标分配
//  - _layoutSize/_measureNode：节点尺寸测量（与渲染共用同一来源）
//  - 对外入口：_layoutSub（布局）/ _assignSub（坐标分配）
//  - 布局内部为"左上角"坐标系（与 2D 一致），应用时换算为节点中心坐标
// ============================================================

// ============================================================
//  排列避让布局（移植 2DView/Layout.js：传统树 + 步骤流）
//  - 普通子节点排在父节点右侧纵向堆叠（H_GAP/V_GAP）
//  - 步骤子节点排在父节点下方横向续排
//  - 右移避让 offset：步骤子节点区比节点宽时父节点右移居中，
//    并给上方普通兄弟分支添加避让间距（避免连线与兄弟分支重叠）
//  - 父节点垂直居中 parentYOffset：与子节点对称轴对齐
//  - 布局内部为"左上角"坐标系（与 2D 一致），应用时换算为节点中心坐标
// ============================================================
import { _font, MM_NODE_MIN_W, MM_NODE_H, MM_H_GAP, MM_V_GAP } from './share.js';

let _layoutMeasureCtx = null;
function _layoutSize(n) {
  const s = n.sizeScale || 1;
  if (!_layoutMeasureCtx) _layoutMeasureCtx = document.createElement('canvas').getContext('2d');
  _layoutMeasureCtx.font = _font(s);
  const tw = _layoutMeasureCtx.measureText(n.text || '').width;
  return { w: Math.max(MM_NODE_MIN_W * s, tw + 24 * s), h: MM_NODE_H * s };
}
function _measureNode(n) {
  return _layoutSize(n);   // 与排列避让布局共用同一尺寸来源，保证渲染/布局一致
}
function _isStep(n) { return n.type === 'step'; }

// 传统树布局 = layoutTraditionalTree
function _layoutTrad(node) {
  const children = node.children || [];
  const sz = _layoutSize(node);
  const nodeWidth = sz.w, nodeHeight = sz.h;
  const layout = { node, w: nodeWidth, h: nodeHeight, x: 0, y: 0, children: [], subtreeW: nodeWidth, subtreeH: nodeHeight, offset: 0, parentYOffset: 0 };

  if (!children.length) return layout;

  const normalChildren = [], stepChildren = [];
  for (const c of children) {
    if (_isStep(c)) stepChildren.push(_layoutStep(c));
    else normalChildren.push(_layoutTrad(c));
  }
  layout.children = normalChildren.concat(stepChildren);

  let normalTotalHeight = 0, normalMaxWidth = 0;
  for (const ch of normalChildren) {
    normalTotalHeight += ch.subtreeH;
    normalMaxWidth = Math.max(normalMaxWidth, ch.subtreeW);
  }
  normalTotalHeight += MM_V_GAP * Math.max(0, normalChildren.length - 1);
  // 子节点有右移偏移时，添加上方避让间距，避免连接线与上方兄弟分支重叠
  for (let i = 1; i < normalChildren.length; i++) normalTotalHeight += normalChildren[i].offset || 0;

  let stepMaxHeight = 0, stepCoreWidth = 0;
  for (const ch of stepChildren) {
    stepCoreWidth += ch.w;
    stepMaxHeight = Math.max(stepMaxHeight, ch.subtreeH);
  }
  stepCoreWidth += MM_H_GAP * Math.max(0, stepChildren.length - 1);

  // 父节点纵向居中偏移：与子节点对称轴对齐
  const parentYOffset = normalChildren.length > 0
    ? Math.max(0, (normalTotalHeight - nodeHeight) / 2)
    : stepMaxHeight > 0 ? Math.max(0, (stepMaxHeight - nodeHeight) / 2) : 0;
  layout.parentYOffset = parentYOffset;
  layout.stepMaxHeight = stepMaxHeight;

  // 节点右移偏移量，仅按下一步子节点自身宽度居中（不含其右侧子节点分支）
  layout.offset = stepCoreWidth > nodeWidth ? (stepCoreWidth - nodeWidth) / 2 : 0;

  // 右侧正常子节点起始 X（步骤子节点在下方，不参与横向避让）
  const normalStartX = layout.offset + nodeWidth + MM_H_GAP;
  const normalRegionWidth = normalMaxWidth > 0 ? normalStartX + normalMaxWidth : normalStartX;
  const normalRegionHeight = normalTotalHeight > 0 ? Math.max(nodeHeight, normalTotalHeight) : stepMaxHeight > 0 ? Math.max(nodeHeight, stepMaxHeight) : nodeHeight;
  const stepRegionHeight = stepMaxHeight > 0 ? normalRegionHeight + MM_V_GAP + stepMaxHeight : normalRegionHeight;

  layout.subtreeW = normalRegionWidth;
  layout.subtreeH = stepRegionHeight;
  return layout;
}

// 步骤流布局 = layoutStepTree
function _layoutStep(node) {
  const children = node.children || [];
  const sz = _layoutSize(node);
  const nodeWidth = sz.w, nodeHeight = sz.h;
  const layout = { node, w: nodeWidth, h: nodeHeight, x: 0, y: 0, children: [], subtreeW: nodeWidth, subtreeH: nodeHeight, offset: 0, parentYOffset: 0, isStepFlow: true };

  if (!children.length) return layout;

  const childLayouts = children.map(function (c) { return _isStep(c) ? _layoutStep(c) : _layoutTrad(c); });
  layout.children = childLayouts;

  const normalChildren = [], stepChildren = [];
  for (const ch of childLayouts) {
    if (ch.isStepFlow) stepChildren.push(ch);
    else normalChildren.push(ch);
  }

  let normalMaxWidth = 0, normalTotalHeight = 0;
  for (const ch of normalChildren) {
    normalMaxWidth = Math.max(normalMaxWidth, ch.subtreeW);
    normalTotalHeight += ch.subtreeH + MM_V_GAP;
  }
  if (normalTotalHeight > 0) normalTotalHeight -= MM_V_GAP;
  for (let i = 1; i < normalChildren.length; i++) normalTotalHeight += normalChildren[i].offset || 0;

  let stepMaxHeight = 0, stepCoreWidth = 0;
  for (const ch of stepChildren) {
    stepCoreWidth += ch.w;
    stepMaxHeight = Math.max(stepMaxHeight, ch.subtreeH);
  }
  if (stepChildren.length > 0) stepCoreWidth += MM_H_GAP * (stepChildren.length - 1);

  const parentYOffset = normalChildren.length > 0
    ? Math.max(0, (normalTotalHeight - nodeHeight) / 2)
    : stepMaxHeight > 0 ? Math.max(0, (stepMaxHeight - nodeHeight) / 2) : 0;
  layout.parentYOffset = parentYOffset;
  layout.stepMaxHeight = stepMaxHeight;

  layout.offset = stepCoreWidth > nodeWidth ? (stepCoreWidth - nodeWidth) / 2 : 0;

  const normalStartX = layout.offset + nodeWidth + MM_H_GAP;
  const normalRegionWidth = normalMaxWidth > 0 ? normalStartX + normalMaxWidth : normalStartX;
  const normalRegionHeight = normalTotalHeight > 0 ? Math.max(nodeHeight, normalTotalHeight) : stepMaxHeight > 0 ? Math.max(nodeHeight, stepMaxHeight) : nodeHeight;
  const stepRegionHeight = stepMaxHeight > 0 ? normalRegionHeight + MM_V_GAP + stepMaxHeight : normalRegionHeight;

  layout.subtreeW = normalRegionWidth;
  layout.subtreeH = stepRegionHeight;
  return layout;
}

// 统一入口 = layoutTree
function _layoutSub(node) { return _isStep(node) ? _layoutStep(node) : _layoutTrad(node); }

// 分配传统坐标 = assignTraditionalCoordinates
function _assignTrad(layout, x, y) {
  const nodeWidth = layout.w, nodeHeight = layout.h;
  const offset = layout.offset || 0;
  const parentYOffset = layout.parentYOffset || 0;
  layout.x = x + offset;
  layout.y = y + parentYOffset;

  if (!layout.children.length) return;

  const normalChildren = [], stepChildren = [];
  for (const child of layout.children) {
    if (_isStep(child.node)) stepChildren.push(child);
    else normalChildren.push(child);
  }

  let normalChildY = y;
  // 右侧正常子节点起始 X（步骤子节点在下方，不参与横向避让）
  const normalStartX = offset + nodeWidth + MM_H_GAP;
  for (let i = 0; i < normalChildren.length; i++) {
    const child = normalChildren[i];
    // 子节点有右移偏移时，添加额外间距避免连接线与上方兄弟分支重叠
    if (i > 0 && child.offset) normalChildY += child.offset;
    if (child.isStepFlow) _assignStep(child, x + normalStartX, normalChildY);
    else _assignTrad(child, x + normalStartX, normalChildY);
    normalChildY += child.subtreeH + MM_V_GAP;
  }

  if (stepChildren.length) {
    const stepStartX = x;
    let normalTotalHeight = 0;
    for (const child of normalChildren) normalTotalHeight += child.subtreeH;
    normalTotalHeight += MM_V_GAP * Math.max(0, normalChildren.length - 1);
    for (let i = 1; i < normalChildren.length; i++) normalTotalHeight += normalChildren[i].offset || 0;
    const stepMaxHeight = layout.stepMaxHeight || 0;
    const normalRegionHeight = normalChildren.length > 0 ? Math.max(nodeHeight, normalTotalHeight) : stepMaxHeight > 0 ? Math.max(nodeHeight, stepMaxHeight) : nodeHeight;
    const stepStartY = y + normalRegionHeight + MM_V_GAP;
    let currentX = stepStartX;
    for (const child of stepChildren) {
      if (child.isStepFlow) _assignStep(child, currentX, stepStartY);
      else _assignTrad(child, currentX, stepStartY);
      currentX += child.subtreeW + MM_H_GAP;
    }
  }
}

// 分配步骤流坐标 = assignStepCoordinates
function _assignStep(layout, x, y) {
  const nodeWidth = layout.w, nodeHeight = layout.h;
  const offset = layout.offset || 0;
  const parentYOffset = layout.parentYOffset || 0;
  layout.x = x + offset;
  layout.y = y + parentYOffset;

  if (!layout.children.length) return;

  const normalChildren = [], stepChildren = [];
  for (const child of layout.children) {
    if (child.isStepFlow) stepChildren.push(child);
    else normalChildren.push(child);
  }

  let normalChildY = y;
  const normalStartX = offset + nodeWidth + MM_H_GAP;
  for (let i = 0; i < normalChildren.length; i++) {
    const child = normalChildren[i];
    if (i > 0 && child.offset) normalChildY += child.offset;
    _assignTrad(child, x + normalStartX, normalChildY);
    normalChildY += child.subtreeH + MM_V_GAP;
  }

  if (stepChildren.length) {
    const stepStartX = x;
    let normalTotalHeight = 0;
    for (const child of normalChildren) normalTotalHeight += child.subtreeH;
    normalTotalHeight += MM_V_GAP * Math.max(0, normalChildren.length - 1);
    for (let i = 1; i < normalChildren.length; i++) normalTotalHeight += normalChildren[i].offset || 0;
    const stepMaxHeight = layout.stepMaxHeight || 0;
    const normalRegionHeight = normalChildren.length > 0 ? Math.max(nodeHeight, normalTotalHeight) : stepMaxHeight > 0 ? Math.max(nodeHeight, stepMaxHeight) : nodeHeight;
    const stepStartY = y + normalRegionHeight + MM_V_GAP;
    let currentX = stepStartX;
    for (const child of stepChildren) {
      if (child.isStepFlow) _assignStep(child, currentX, stepStartY);
      else _assignTrad(child, currentX, stepStartY);
      currentX += child.subtreeW + MM_H_GAP;
    }
  }
}

// 统一坐标分配入口 = assignCoordinates
function _assignSub(layout, x, y) {
  if (layout.isStepFlow) _assignStep(layout, x, y);
  else _assignTrad(layout, x, y);
}

export { _layoutSize, _measureNode, _isStep, _layoutSub, _assignSub };
