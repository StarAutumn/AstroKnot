// ============================================================
//  richEditor/tree-panel/share.js — 多实例状态存储与共享工具
//  - instances Map（canvasId -> state）、createState / getActiveState
//  - 全局连线呼吸色 getBreathingLineColor
//  - 可变 let 状态（windowListenersInited / draggingInstanceId / _lastSidebarPanTime）
//    经 getter/setter 存取（ESM import 绑定只读，不能跨模块直接赋值）
// ============================================================

// ── 全局连线呼吸色：全色域缓慢循环，与主 2D 视图保持一致 ──
function getBreathingLineColor() {
  const t = Date.now() * 0.001;
  const hue = (t % 30) / 8 * 360;
  const sat = 70 + 6 * Math.sin(t * 0.3);
  const lit = 50 + 4 * Math.sin(t * 0.35);
  return `hsl(${hue}, ${sat}%, ${lit}%)`;
}

// ── 多实例状态存储 ──
const instances = new Map(); // canvasId -> state

let windowListenersInited = false;
let draggingInstanceId = null;

function createState(container, canvas) {
  const ctx = canvas.getContext('2d');
  return {
    container,
    canvas,
    canvasId: canvas.id,
    ctx,
    visible: true,
    transform: { offsetX: 0, offsetY: 0, scale: 1 },
    isDragging: false,
    dragStart: { x: 0, y: 0 },
    nodeHitAreas: [],
    highlightedNodeId: null,
    animations: [],
    cardBodyRects: [],
    cardOverlays: new Map(),
    keys: { w: false, a: false, s: false, d: false, ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false }
  };
}

function getActiveState() {
  if (draggingInstanceId && instances.has(draggingInstanceId)) {
    return instances.get(draggingInstanceId);
  }
  for (const [id, s] of instances) {
    if (document.activeElement === s.canvas) return s;
  }
  return instances.size > 0 ? instances.values().next().value : null;
}

// ── 键盘平移（帧率解耦：用 delta time 保证节点多帧率低时速度不下降）──
let _lastSidebarPanTime = 0;
const PAN_PIXELS_PER_SEC = 540; // 目标速度：540px/s（≈90fps × 6px/帧）

// ── 可变 let 状态存取函数（跨模块只经此访问，import 绑定只读）──
export function getWindowListenersInited() { return windowListenersInited; }
export function setWindowListenersInited(v) { windowListenersInited = v; }
export function getDraggingInstanceId() { return draggingInstanceId; }
export function setDraggingInstanceId(v) { draggingInstanceId = v; }
export function getLastSidebarPanTime() { return _lastSidebarPanTime; }
export function setLastSidebarPanTime(v) { _lastSidebarPanTime = v; }

export {
  instances, createState, getActiveState, getBreathingLineColor, PAN_PIXELS_PER_SEC
};
