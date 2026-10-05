// ============================================================
//  Fishbone / state.js — 鱼骨图主干绘制状态（模块内可变状态）
//  export let + setter，保持 ES Module live binding 惯例
// ============================================================

// 是否处于"主干绘制模式"（点击空白菜单按钮后进入，右键/Esc 退出）
export let trunkDrawMode = false;

// 当前会话正在绘制的主干（首次落笔提交后创建）：
// { id: string, points: [{ x, y }] }  —— points 为 2D 世界坐标
export let currentTrunk = null;

// 正在拖拽绘制一条线段
export let isDraggingSeg = false;

// 当前线段起点/终点（2D 世界坐标）
export let segStart = null;
export let segCurrent = null;

// 指针按下时的屏幕像素坐标（用于区分"拖动画线"与"轻点误触"）
export let downClient = null;

// 当前选中的鱼骨线段（2D 黄色高亮与 3D 高亮共用）：{ trunkId, segId } | null
export let selectedSeg = null;

// ── 分支绘制模式（连线标签"添加分支"按钮触发）──
export let branchDrawMode = false;
// ── 节点创建模式（连线标签"新建节点"按钮触发，一次性：线上起点 → 空白落节点）──
// 拖拽状态与分支绘制共用（isDraggingBranch / branchHit / branchCurrent）
export let nodeCreateMode = false;
// 新建节点的默认 sizeScale（预览框与实际卡片尺寸保持一致）
export const FISHBONE_NODE_SCALE = 1;
// 正在拖拽绘制分支
export let isDraggingBranch = false;
// ── 鱼骨编辑拖动（2D 普通模式）──
// { type: 'endpoint', trunkId, pointIndex }                         拖端点（另一端固定，改向改长）
// { type: 'translate', startWorld, snapshot, moved }                拖线体（平移整个鱼骨图）
export let fishboneEdit = null;
// 分支起点（线上吸附点）：{ trunkId, segIndex, t, point: {x, y} }
export let branchHit = null;
// 分支当前终点（跟随鼠标，2D 世界坐标）
export let branchCurrent = null;
// ── 「变成支路」选择模式（连线标签触发，一次性）：{ trunkId } = 待挂载干线 ──
// 点击目标鱼骨线段完成挂载；Esc / 右键取消
export let fishboneAttachMode = null;

// ── 「移动线路」模式（3D 视图专用入口，2D 直接拖线体即可）：{ trunkId } ──
// 按住该子树线路拖动平移；松手退出（一次性）；Esc / 右键取消
export let fishboneMoveMode = null;

// ── 随机模式 3D 画线取景帧（interaction.js 在会话首次落笔时捕获，退出绘制模式清空）──
// { center, normal, right, up }：相机前方固定距离的取景平面正交基（THREE.Vector3），
// 2D 数据存帧局部坐标，3D 预览/骨架经帧映射 → 绘制轨迹即最终骨架轨迹
export let draw3DFrame = null;

export function setTrunkDrawMode(v) { trunkDrawMode = v; }
export function setCurrentTrunk(t) { currentTrunk = t; }
export function setDraggingSeg(v) { isDraggingSeg = v; }
export function setSegStart(p) { segStart = p; }
export function setSegCurrent(p) { segCurrent = p; }
export function setDownClient(p) { downClient = p; }
export function setSelectedSeg(s) { selectedSeg = s; }
export function setBranchDrawMode(v) { branchDrawMode = v; }
export function setNodeCreateMode(v) { nodeCreateMode = v; }
export function setFishboneEdit(v) { fishboneEdit = v; }
export function setFishboneAttachMode(v) { fishboneAttachMode = v; }
export function setFishboneMoveMode(v) { fishboneMoveMode = v; }
export function setDraw3DFrame(f) { draw3DFrame = f; }
export function setDraggingBranch(v) { isDraggingBranch = v; }
export function setBranchHit(h) { branchHit = h; }
export function setBranchCurrent(p) { branchCurrent = p; }

// 清空分支拖拽状态（松手后调用；branchDrawMode 保持，可连续画多个分支）
export function resetBranchDragState() {
  isDraggingBranch = false;
  branchHit = null;
  branchCurrent = null;
}

// 清空线段绘制状态（退出模式或松手后调用）
export function resetDrawState() {
  isDraggingSeg = false;
  segStart = null;
  segCurrent = null;
  downClient = null;
}
