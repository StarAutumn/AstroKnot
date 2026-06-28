// ============================================================
//  2DView / shared.js — 共享状态与常量
//  所有模块级变量集中管理，避免循环依赖
// ============================================================

// -------- Canvas & 容器 --------
export let canvas, ctx;
export let container;

// -------- 可见性 --------
export let visible = false;
export function setVisible(v) { visible = v; }

// -------- 视图变换 --------
export let transform = { offsetX: 0, offsetY: 0, scale: 1 };
export function setTransform(t) { transform = t; }

// -------- 画布拖拽（平移） --------
export let isDragging = false, dragStart = { x: 0, y: 0 };
export let mouseDownPos = { x: 0, y: 0 };
export function setDragging(v) { isDragging = v; }
export function setDragStart(p) { dragStart = p; }
export function setMouseDownPos(p) { mouseDownPos = p; }

// -------- 节点拖拽 --------
export let isNodeDragging = false;
export let moveNodeId = null;
export let moveStartWorld = { x: 0, y: 0 };
export let moveInitialPositions = new Map();
export function setNodeDragging(v, id) { isNodeDragging = v; if (id !== undefined) moveNodeId = id; }
export function setMoveStartWorld(p) { moveStartWorld = p; }
export function clearMoveInitialPositions() { moveInitialPositions.clear(); }
export function setMoveInitialPositions(map) { moveInitialPositions = map; }

// -------- 框选 --------
export let isBoxSelecting = false;
export let boxSelectStart = { x: 0, y: 0 };
export let boxSelectEnd = { x: 0, y: 0 };
export let boxSelectCanvasStart = { x: 0, y: 0 };
export let boxSelectCanvasEnd = { x: 0, y: 0 };
export let boxSelectNodeIds = new Set();
export let boxSelectTransform = { offsetX: 0, offsetY: 0, scale: 1 };
export let hasValidBoxSelection = false;
export function setBoxSelecting(v) { isBoxSelecting = v; }
export function setBoxSelectStart(p) { boxSelectStart = p; }
export function setBoxSelectEnd(p) { boxSelectEnd = p; }
export function setBoxSelectCanvasStart(p) { boxSelectCanvasStart = p; }
export function setBoxSelectCanvasEnd(p) { boxSelectCanvasEnd = p; }
export function setBoxSelectTransform(t) { boxSelectTransform = t; }
export function setHasValidBoxSelection(v) { hasValidBoxSelection = v; }
export function clearBoxSelectNodeIds() { boxSelectNodeIds.clear(); }

// -------- 组群矩形 --------
export let groupRects = [];
export let selectedGroupRectId = null;
export let isGroupDragging = false;
export let isGroupResizing = false;
export let groupDragStart = { x: 0, y: 0 };
export let groupResizeInfo = null;
export const HANDLE_SIZE = 8;
export function setSelectedGroupRectId(id) { selectedGroupRectId = id; }
export function setGroupDragging(v) { isGroupDragging = v; }
export function setGroupResizing(v) { isGroupResizing = v; }
export function setGroupDragStart(p) { groupDragStart = p; }
export function setGroupResizeInfo(info) { groupResizeInfo = info; }
export function setGroupRects(arr) { groupRects = arr; }

// -------- 折叠/展开动画 --------
export let animations = [];
export function setAnimations(a) { animations = a; }

// -------- 杂项 --------
export let lineTooltipJustOpened = false;
export let pendingMultiMove = false;
export function setLineTooltipJustOpened(v) { lineTooltipJustOpened = v; }
export function setPendingMultiMove(v) { pendingMultiMove = v; }

// -------- 当前鼠标世界坐标（供粘贴定位等使用）--------
export let currentMouseWorld = { x: 0, y: 0 };
export function setCurrentMouseWorld(p) { currentMouseWorld = p; }

// -------- 悬停节点（用于显示快速创建子节点的“+”按钮）--------
export let hoveredNodeId = null;
export function setHoveredNodeId(id) { hoveredNodeId = id; }
// 当前悬停的快速添加按钮类型：'child'(右) | 'step'(下) | null
export let quickAddHover = null;
export function setQuickAddHover(v) { quickAddHover = v; }
export const QUICK_ADD_RADIUS = 4;        // “+” 按钮圆圈半径（世界坐标）
export const QUICK_ADD_HIT_RADIUS = 8;   // “+” 按钮命中半径

// -------- 常量（默认值，可通过 appState 覆盖）--------
export let BASE_NODE_WIDTH = 120;
export let BASE_NODE_HEIGHT = 40;
export let H_GAP = 60;
export let V_GAP = 20;
export const TRANSITION_DURATION = 500;
export const POLYLINE_PEG_X = 24;   // 折线向右短距离拐点
export const POLYLINE_PEG_Y = 20;   // 折线向下短距离拐点（step 节点）

/** 从 appState 同步 2D 视图几何设置（如需动态调整） */
export function sync2DSettings() {
  try {
    const st = window.appState;
    if (!st) return;
    if (typeof st.nodeWidth2D === 'number' && st.nodeWidth2D > 0) BASE_NODE_WIDTH = st.nodeWidth2D;
    if (typeof st.nodeHeight2D === 'number' && st.nodeHeight2D > 0) BASE_NODE_HEIGHT = st.nodeHeight2D;
    if (typeof st.hGap2D === 'number' && st.hGap2D > 0) H_GAP = st.hGap2D;
    if (typeof st.vGap2D === 'number' && st.vGap2D > 0) V_GAP = st.vGap2D;
  } catch {}
}

// -------- 节点宽度自适应文字（标题越长节点越宽） --------
// 离屏 canvas 用于测量文本，避免依赖主渲染 ctx
let _measureCanvas = null;
// 宽度缓存：按 nodeId 缓存 { name, scale, width }，标题/scale 不变时直接复用，避免每帧 measureText
const _nodeWidthCache = new Map();
export function getNodeWidth(node, scale) {
  const base = BASE_NODE_WIDTH * scale;
  const text = (node && node.name) || '';
  if (!text) return base;
  // 命中缓存：标题和 scale 都未变
  const id = node.id;
  if (id) {
    const c = _nodeWidthCache.get(id);
    if (c && c.name === text && c.scale === scale) return c.width;
  }
  const fontSize = Math.max(10, 14 * scale);
  if (!_measureCanvas) _measureCanvas = document.createElement('canvas');
  const mctx = _measureCanvas.getContext('2d');
  mctx.font = `${fontSize}px system-ui, sans-serif`;
  const textW = mctx.measureText(text).width;
  const padding = 24 * scale; // 左右内边距
  const width = Math.max(base, textW + padding);
  if (id) _nodeWidthCache.set(id, { name: text, scale, width });
  return width;
}
// 节点标题/scale 变更或删除时调用，清除对应缓存
export function invalidateNodeWidthCache(nodeId) {
  if (nodeId) _nodeWidthCache.delete(nodeId);
  else _nodeWidthCache.clear();
}

// -------- 命中测试区域 --------
export let nodeHitAreas = [];
export let lineHitAreas = [];
export function setNodeHitAreas(arr) { nodeHitAreas = arr; }
export function setLineHitAreas(arr) { lineHitAreas = arr; }

// -------- Canvas 初始化（供 Core 调用）--------
export function initCanvas(cvs, cnt) {
  canvas = cvs;
  ctx = cvs?.getContext('2d');
  container = cnt;
}

// -------- 自由绘制连线（锚点拖拽连线）--------
export let isFreeDrawing = false;
export const ANCHOR_RADIUS = 6;        // 锚点圆点半径
export const ANCHOR_HIT_RADIUS = 12;   // 锚点命中半径
// freeDrawState: { sourceNodeId, sourceAnchor, waypoints[], currentMousePos, targetNodeId, targetAnchor }
export let freeDrawState = null;
export function setFreeDrawing(v) { isFreeDrawing = v; }
export function setFreeDrawState(s) { freeDrawState = s; }

// -------- 锚点位置计算（纯函数）--------
const ANCHOR_KEYS = ['top', 'right', 'bottom', 'left', 'tl', 'tr', 'bl', 'br'];
export function getNodeAnchors(x, y, w, h) {
  return {
    top:    { x: x + w / 2, y: y },
    right:  { x: x + w,     y: y + h / 2 },
    bottom: { x: x + w / 2, y: y + h },
    left:   { x: x,         y: y + h / 2 },
    tl:     { x: x,         y: y },
    tr:     { x: x + w,     y: y },
    bl:     { x: x,         y: y + h },
    br:     { x: x + w,     y: y + h }
  };
}
export { ANCHOR_KEYS };

// -------- 键盘平移 --------
export const keys2D = { w: false, a: false, s: false, d: false, ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false };
export const PAN_SPEED = 8;

// -------- 获取组群矩形把手位置（纯函数，供 Render/Interaction 共用）--------
export function getGroupHandlePositions(gr) {
  const hs = HANDLE_SIZE;
  return {
    nw: { x: gr.x - hs / 2, y: gr.y - hs / 2, cx: gr.x, cy: gr.y },
    ne: { x: gr.x + gr.width - hs / 2, y: gr.y - hs / 2, cx: gr.x + gr.width, cy: gr.y },
    sw: { x: gr.x - hs / 2, y: gr.y + gr.height - hs / 2, cx: gr.x, cy: gr.y + gr.height },
    se: { x: gr.x + gr.width - hs / 2, y: gr.y + gr.height - hs / 2, cx: gr.x + gr.width, cy: gr.y + gr.height }
  };
}