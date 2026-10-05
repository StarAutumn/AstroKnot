// ============================================================
//  Fishbone / visibility.js — 鱼骨图折叠可见性（2D/3D/操作共用）
//  trunk.collapsed = true 时：该干线自身末端连接的节点及其树后代隐藏，
//  其所有子支（沿 parentId 递归）隐藏，子支末端节点及其树后代一并隐藏
//  （用户决策：节点跟随折叠）。本模块仅依赖 appState，避免与 2DView 渲染模块产生导入环。
// ============================================================

import { appState } from '../module0_AppState.js';

// 隐藏节点缓存（每帧由 drawFishbone2D / updateFishbone3D 刷新；操作后主动刷新）
let _hiddenNodes = new Set();

// 判断 trunk 的任一祖先（含跨级）是否被折叠 → 该 trunk 隐藏
function _isTrunkHidden(trunk, trunks) {
  let cur = trunk;
  const seen = new Set();
  while (cur && cur.parentId && !seen.has(cur.parentId)) {
    seen.add(cur.parentId);
    const parent = trunks.find(t => t.id === cur.parentId);
    if (!parent) break;
    if (parent.collapsed) return true;
    cur = parent;
  }
  return false;
}

// 图层过滤：干线只显示在创建时所属图层（与节点 2D 过滤语义一致）；
// 未打标 layerId 的旧数据在迁移完成前视为可见（宽松兜底）
export function isTrunkInCurrentLayer(trunk) {
  return !trunk.layerId || trunk.layerId === appState.currentLayerId;
}

// 当前应隐藏的干线 id 集合（每次调用现算，干线数量小，开销可忽略）
export function getFishboneHiddenTrunkIds() {
  const hidden = new Set();
  const trunks = appState.fishboneTrunks || [];
  for (const t of trunks) {
    if (t.parentId && _isTrunkHidden(t, trunks)) hidden.add(t.id);
  }
  return hidden;
}

// 树后代收集（基于 nodeMap 的 children 遍历，独立实现避免导入环）
function _collectDescendants(id, out) {
  const node = appState.nodeMap.get(id);
  if (!node || !node.children) return;
  for (const ch of node.children) {
    if (ch && ch.id && !out.has(ch.id)) {
      out.add(ch.id);
      _collectDescendants(ch.id, out);
    }
  }
}

// 收集节点及其树后代（含自身），供折叠/展开动画确定受影响节点集合
export function collectNodeWithDescendants(id, out = new Set()) {
  out.add(id);
  _collectDescendants(id, out);
  return out;
}

// ── 折叠/展开动画注册表（与普通节点折叠/展开动画同款过渡）──
// id → { startTime, duration, direction }；节点 id 与干线 id 共用一张表（命名不冲突）。
// 2D 按 progress 渐隐 alpha（getNodeVisibilityAlpha / drawFishbone2D 支路线）；
// 3D 动画期间豁免 updateFishbone3D 的强制隐藏（渐隐由 ops.js 动画函数接管）。
const _anims = new Map();

// 启动折叠/展开动画（direction: 'collapse' 渐隐 1→0 / 'expand' 渐显 0→1）
export function startFishboneAnim(ids, direction, duration = 500) {
  const startTime = performance.now();
  for (const id of ids) _anims.set(id, { startTime, duration, direction });
}

// 查询动画状态；已结束自动清除（隐藏缓存已表达终态，无需单独 finalize）
export function getFishboneAnimState(id) {
  const a = _anims.get(id);
  if (!a) return null;
  const elapsed = performance.now() - a.startTime;
  if (elapsed >= a.duration) { _anims.delete(id); return null; }
  const t = elapsed / a.duration;
  return { progress: a.direction === 'expand' ? t : 1 - t, direction: a.direction };
}

// 是否有进行中的鱼骨动画（2D 渲染循环据此持续重绘；调用时顺带清理过期条目）
export function hasFishboneAnim() {
  if (!_anims.size) return false;
  const now = performance.now();
  for (const [id, a] of _anims) {
    if (now - a.startTime >= a.duration) _anims.delete(id);
  }
  return _anims.size > 0;
}

// 刷新隐藏节点缓存：
//  - 被折叠干线自身的末端节点（支路末端连着的节点）及其树后代
//  - 被折叠隐藏的子支干线：末端节点及其树后代
export function refreshFishboneHiddenCache() {
  _hiddenNodes = new Set();
  const hiddenTrunks = getFishboneHiddenTrunkIds();
  const trunks = appState.fishboneTrunks || [];
  for (const t of trunks) {
    if ((!t.collapsed && !hiddenTrunks.has(t.id)) || !t.endNodeId) continue;
    if (_hiddenNodes.has(t.endNodeId)) continue;
    _hiddenNodes.add(t.endNodeId);
    _collectDescendants(t.endNodeId, _hiddenNodes);
  }
}

// O(1) 查询：节点是否被鱼骨折叠隐藏（2D getNodeVisibilityAlpha / 3D 每帧强制隐藏用）
export function isFishboneNodeHidden(nodeId) {
  return _hiddenNodes.has(nodeId);
}

// 当前隐藏节点集合快照（3D 显隐 / 操作展开恢复用）
export function getFishboneHiddenNodeIds() {
  return _hiddenNodes;
}
