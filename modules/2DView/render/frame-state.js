// ============================================================
//  2DView / render / frame-state.js — 帧内状态中枢
//  - 持有每帧更新的可变状态（_frameNow / _viewportBounds / 索引 Map 等）
//  - 持有布局缓存与命中区数组（export let，供外部读取）
//  - 提供 setter / reset / rebuild 函数（跨模块修改需通过函数，直接赋值对 live binding 不可见）
//  - 提供 postDraw 钩子注册
// ============================================================

import { appState } from '../../module0_AppState.js';
import { animations, setAnimations } from '../shared.js';

// ── 帧内计数器：替代 Date.now()，避免每帧系统调用 ──
export let _renderHue = 0;
// ── 帧内时间戳缓存：draw() 顶部算一次，drawNode 内复用 ──
export let _frameNow = 0;

// 卡片铅笔按钮命中区（每帧重建，供 Interaction 读取）
export let _cardRenameHitAreas = [];
// 卡片正文区域矩形（每帧重建，供 DOM overlay 同步位置）
export let _cardBodyRects = [];

// lineItems 预索引 Map：O(1) 查找替代线性查找
export let _lineItemsMap = new Map();

// 视口裁剪边界（世界坐标），draw() 每帧更新
export let _viewportBounds = null;

// ── 布局缓存（平移/缩放时跳过重算） ──
export let _cachedLayout = null;
export let _cachedPositionMap = null;
export let _layoutDirty = true;
export let _lastCanvasWidth = 0;
export let _lastCanvasHeight = 0;

// ── 跨层连线节点索引（避免每节点 O(E) 线性扫描） ──
let _crossEdgeNodesSet = new Set();
let _crossEdgesArrayRef = null;

// ── 动画进度索引（避免每节点 O(A) find 遍历） ──
let _animationsMap = new Map();
let _animationsArrayRef = null;

// ── 每帧 draw() 完成后的回调（由 Interaction.js 设置，用于同步 DOM overlay） ──
let _postDrawHook = null;

// ============================================================
//  Setter（跨模块赋值需通过 setter，否则 live binding 不可见）
// ============================================================
export function setRenderHue(v) { _renderHue = v; }
export function setFrameNow(v) { _frameNow = v; }
export function setViewportBounds(v) { _viewportBounds = v; }
export function setCachedLayout(v) { _cachedLayout = v; }
export function setCachedPositionMap(v) { _cachedPositionMap = v; }
export function setLayoutDirty(v) { _layoutDirty = v; }
export function setLastCanvasSize(w, h) { _lastCanvasWidth = w; _lastCanvasHeight = h; }

export function setPostDrawHook(fn) { _postDrawHook = fn; }
export function getPostDrawHook() { return _postDrawHook; }

/** 标记布局需要重新计算（树结构/位置/折叠状态变化时调用） */
export function mark2DDirty() { _layoutDirty = true; }

/** 重置卡片命中区数组（draw() 主循环每帧开头调用一次） */
export function resetCardHitAreas() {
  _cardRenameHitAreas = [];
  _cardBodyRects = [];
}

/** 清空 lineItems 索引（draw() 主循环每帧开头调用） */
export function clearLineItemsMap() {
  _lineItemsMap.clear();
}

/** 向 lineItems 索引添加一项 */
export function addLineItemsMapEntry(key, item) {
  _lineItemsMap.set(key, item);
}

// ============================================================
//  全局连线呼吸色：全色域缓慢循环，~30s 周期
// ============================================================
export function getBreathingLineColor() {
  const t = _frameNow * 0.001;
  const hue = (t % 30) / 8 * 360;
  const sat = 70 + 6 * Math.sin(t * 0.3);
  const lit = 50 + 4 * Math.sin(t * 0.35);
  return `hsl(${hue}, ${sat}%, ${lit}%)`;
}

// ============================================================
//  跨层连线节点索引重建（每帧调用）
// ============================================================
export function rebuildCrossEdgeIndex() {
  const arr = appState.crossEdges;
  _crossEdgesArrayRef = arr;
  _crossEdgeNodesSet = new Set();
  if (!arr || arr.length === 0) return;
  for (const e of arr) {
    if (!e) continue;
    const srcLayer = appState.getLayerForNode ? appState.getLayerForNode(e.source) : null;
    const tgtLayer = appState.getLayerForNode ? appState.getLayerForNode(e.target) : null;
    if (!srcLayer || !tgtLayer || srcLayer.id !== tgtLayer.id) {
      _crossEdgeNodesSet.add(e.source);
      _crossEdgeNodesSet.add(e.target);
    }
  }
}

export function hasCrossEdges(nodeId) {
  return _crossEdgeNodesSet.has(nodeId);
}

// ============================================================
//  动画进度索引重建（数组引用变化时才重建）
// ============================================================
export function rebuildAnimationsIndex() {
  const arr = animations;
  if (_animationsArrayRef === arr) return;
  _animationsArrayRef = arr;
  _animationsMap = new Map();
  for (const a of arr) {
    if (a && a.nodeId) _animationsMap.set(a.nodeId, a);
  }
}

export function getAnimationEntry(nodeId) {
  return _animationsMap.get(nodeId);
}

/** 移除已完成动画并更新折叠状态（由 drawTreeRecursive 调用） */
export function finalizeAnimation(nodeId, direction) {
  let filtered = [];
  for (const a of animations) {
    if (a.nodeId !== nodeId) filtered.push(a);
  }
  setAnimations(filtered);
  if (direction === 'collapse') appState.collapsed2D.add(nodeId);
  else appState.collapsed2D.delete(nodeId);
}
