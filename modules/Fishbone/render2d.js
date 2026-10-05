// ============================================================
//  Fishbone / render2d.js — 鱼骨主干的 2D 画布渲染
//  由 2DView/render/draw.js 每帧调用（世界坐标系内，节点之下、网格之上）
// ============================================================

import { appState } from '../module0_AppState.js';
import { ctx, transform, BASE_NODE_HEIGHT, getNodeWidth, getNodeLayoutSize, boxSelectSegKeys } from '../2DView/shared.js';
import { getBreathingLineColor } from '../2DView/render/frame-state.js';
import {
  isDraggingSeg, segStart, segCurrent, currentTrunk, selectedSeg, trunkDrawMode,
  isDraggingBranch, branchHit, branchCurrent,
  nodeCreateMode, FISHBONE_NODE_SCALE
} from './state.js';
import {
  getFishboneHiddenTrunkIds, refreshFishboneHiddenCache, getFishboneAnimState,
  isFishboneNodeHidden, isTrunkInCurrentLayer
} from './visibility.js';

const JOINT_COLOR = '#ffd88a';     // 分段节点圆点
const PREVIEW_COLOR = '#ffe9b3';   // 拖拽中的预览线段
const SELECT_COLOR = '#FFD700';    // 选中段高亮（与 3D 黄色高亮观感一致）
const SELECT_GLOW = 'rgba(255, 215, 0, 0.30)';
// 双直线：每条线偏离段中心线的距离（屏幕像素；默认呼吸色与普通连线一致循环变化）
const DOUBLE_GAP = 2.2;

// 双平行线绘制：沿段法线偏移 ±off 画两条线（off 为世界单位，调用方已除以缩放）
function _drawDoubleLine(ax, ay, bx, by, off) {
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return;
  const nx = -dy / len * off, ny = dx / len * off;
  ctx.beginPath();
  ctx.moveTo(ax + nx, ay + ny);
  ctx.lineTo(bx + nx, by + ny);
  ctx.moveTo(ax - nx, ay - ny);
  ctx.lineTo(bx - nx, by - ny);
  ctx.stroke();
}

// ============================================================
//  节点连接同步：与节点相连的分支端点跟随节点移动
//  trunk.endNodeId 标记该分支终点连着某节点的"左边缘中点"；
//  每帧绘制 / 3D 更新前同步终点坐标，拖动、对齐、排列、撤销后自动保持连接。
//  返回是否有变化（3D 侧据此重建受影响 trunk）
// ============================================================
export function syncFishboneNodeLinks() {
  let changed = false;
  for (const trunk of (appState.fishboneTrunks || [])) {
    if (!trunk.endNodeId) continue;
    const node = appState.nodeMap.get(trunk.endNodeId);
    const pos = node ? appState.positions2D.get(trunk.endNodeId) : null;
    if (!node || !pos) continue;   // 节点已删除 / 位置缺失 → 线留在原地
    const { height } = getNodeLayoutSize(node, node.sizeScale || 1);
    const pts = trunk.points || [];
    if (!pts.length) continue;
    const np = { x: pos.x, y: pos.y + height / 2 };   // 左边缘中点
    const last = pts[pts.length - 1];
    if (Math.hypot(last.x - np.x, last.y - np.y) > 0.001) {
      last.x = np.x;
      last.y = np.y;
      changed = true;
    }
  }
  return changed;
}

// 段高亮（选中/框选多选共用样式：中心线辉光 + 双实线）
function _drawSegHighlight(a, b) {
  ctx.strokeStyle = SELECT_GLOW;
  ctx.lineWidth = 9 / transform.scale;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.strokeStyle = SELECT_COLOR;
  ctx.lineWidth = 3 / transform.scale;
  _drawDoubleLine(a.x, a.y, b.x, b.y, DOUBLE_GAP / transform.scale);
  ctx.lineWidth = 2 / transform.scale;   // 恢复基础宽度
}

// ⊕ 折叠标记（提示此处有收起的支路/节点，可经连线标签「展开支路」恢复）
function _drawCollapseBadge(x, y) {
  const r = 5 / transform.scale;
  ctx.fillStyle = 'rgba(20,40,60,0.85)';
  ctx.strokeStyle = '#8fd8ff';
  ctx.lineWidth = 1.5 / transform.scale;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  const cr = 2.5 / transform.scale;
  ctx.beginPath();
  ctx.moveTo(x - cr, y);
  ctx.lineTo(x + cr, y);
  ctx.moveTo(x, y - cr);
  ctx.lineTo(x, y + cr);
  ctx.stroke();
}

// 绘制鱼骨主干（draw.js 每帧调用，无数据时直接返回）
export function drawFishbone2D() {
  if (!ctx) return;
  const trunks = appState.fishboneTrunks || [];
  if (trunks.length) {
    ensureFishboneParentIds();   // 旧数据惰性迁移 parentId（补写后每帧仅剩字段检查，零开销）
    syncFishboneNodeLinks();     // 同步节点连接端点（拖动节点后线跟随）
  }
  const hasPreview = isDraggingSeg && segStart && segCurrent;
  if (!trunks.length && !hasPreview) return;

  // 折叠可见性：每帧刷新隐藏节点缓存（2D 节点卡片/连线透明度共用），
  // 隐藏的干线跳过绘制
  refreshFishboneHiddenCache();
  const hiddenTrunks = getFishboneHiddenTrunkIds();

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // ── 已提交的主干折线（逐段绘制双直线：自定义色优先，默认呼吸色与普通连线一致）──
  ctx.lineWidth = 2 / transform.scale;   // 固定屏幕像素宽度（双线各 2px，中缝 ~2.4px）
  ctx.fillStyle = JOINT_COLOR;
  for (const trunk of trunks) {
    // 非当前图层的干线不绘制（与节点 2D 图层过滤一致）
    if (!isTrunkInCurrentLayer(trunk)) continue;
    // 被折叠隐藏的子支不绘制；折叠/展开动画进行中按进度渐隐/渐显
    const trunkAnim = getFishboneAnimState(trunk.id);
    if (hiddenTrunks.has(trunk.id) && !trunkAnim) continue;
    const pts = trunk.points || [];
    if (pts.length < 2) continue;
    // 动画期间整条支路（线段/接缝圆点/标签）按进度渐隐，与普通节点折叠动画同款过渡
    ctx.globalAlpha = trunkAnim ? Math.max(0, Math.min(1, trunkAnim.progress)) : 1;
    const segs = Array.isArray(trunk.segs) ? trunk.segs : [];
    for (let i = 0; i < pts.length - 1; i++) {
      const seg = segs[i];
      ctx.strokeStyle = (seg && seg.customColor) ? seg.customColor : getBreathingLineColor();
      _drawDoubleLine(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, DOUBLE_GAP / transform.scale);
    }
    // 选中段：黄色高亮（中心线辉光 + 双实线）
    if (selectedSeg && selectedSeg.trunkId === trunk.id) {
      const idx = segs.findIndex(s => s.id === selectedSeg.segId);
      if (idx >= 0 && idx + 1 < pts.length) {
        _drawSegHighlight(pts[idx], pts[idx + 1]);
      }
    }
    // 框选多选段：同款黄色高亮（右键多选菜单可批量改色）
    if (boxSelectSegKeys.size) {
      for (let i = 0; i < pts.length - 1; i++) {
        const seg = segs[i];
        if (!seg || !boxSelectSegKeys.has(trunk.id + '|' + seg.id)) continue;
        if (i + 1 < pts.length) _drawSegHighlight(pts[i], pts[i + 1]);
      }
    }
    // 分段节点：接缝小圆点；两端端点稍大（提示可拖拽改向改长）
    for (let i = 0; i < pts.length; i++) {
      const isDraggableEnd = (i === 0 || i === pts.length - 1) &&
                             !(trunk.endNodeId && i === pts.length - 1);
      ctx.beginPath();
      ctx.arc(pts[i].x, pts[i].y, (isDraggableEnd ? 4 : 3) / transform.scale, 0, Math.PI * 2);
      ctx.fill();
    }
    // 段标签：画在段中点上方（样式与普通连线 2D 标签一致）
    if (appState.showAllLabels && segs.length) {
      ctx.fillStyle = '#ffd966';
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < segs.length && i < pts.length - 1; i++) {
        const seg = segs[i];
        const hidden = seg.labelHidden !== false;   // 默认隐藏，保存标签后置 false
        if (seg && seg.label && !hidden) {
          ctx.fillText(seg.label, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2 - 8);
        }
      }
    }
    ctx.globalAlpha = 1;   // 恢复不透明（动画支路渐隐只作用于本条）
  }

  // ── 折叠标记 ⊕：子支附着点 + 被折叠干线末端节点连接点（提示此处有收起的
  //    支路/节点，可经连线标签「展开支路」恢复）──
  const hasVisibleCollapsed = trunks.some(t => t.collapsed && !hiddenTrunks.has(t.id) && isTrunkInCurrentLayer(t));
  if (hasVisibleCollapsed) {
    for (const trunk of trunks) {
      if (!trunk.collapsed || hiddenTrunks.has(trunk.id) || !isTrunkInCurrentLayer(trunk)) continue;
      for (const t of trunks) {
        if (t.parentId !== trunk.id) continue;
        const sp = t.points && t.points[0];
        if (sp) _drawCollapseBadge(sp.x, sp.y);
      }
      // 末端节点连接点：末端节点随折叠一并隐藏后，保留可展开提示
      const epts = trunk.points;
      if (trunk.endNodeId && epts && epts.length >= 2 && isFishboneNodeHidden(trunk.endNodeId)) {
        const ep = epts[epts.length - 1];
        _drawCollapseBadge(ep.x, ep.y);
      }
    }
    ctx.lineWidth = 2 / transform.scale;   // 恢复基础宽度
    ctx.fillStyle = JOINT_COLOR;
  }

  // ── 拖拽中的预览线段（虚线）──
  if (hasPreview) {
    ctx.strokeStyle = PREVIEW_COLOR;
    ctx.lineWidth = 2 / transform.scale;
    ctx.setLineDash([6 / transform.scale, 5 / transform.scale]);

    // 分段接续引导线：上一段终点 → 本段起点（不重合时显示）
    const pts = currentTrunk ? (currentTrunk.points || []) : [];
    const last = pts[pts.length - 1];
    if (last && Math.hypot(last.x - segStart.x, last.y - segStart.y) > 0.5) {
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(segStart.x, segStart.y);
      ctx.stroke();
    }

    // 本段预览：起点 → 当前鼠标
    ctx.beginPath();
    ctx.moveTo(segStart.x, segStart.y);
    ctx.lineTo(segCurrent.x, segCurrent.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ── 分支绘制预览：线上吸附起点圆点 + 起点至鼠标的虚线 ──
  if (isDraggingBranch && branchHit && branchCurrent) {
    const sp = branchHit.point;
    ctx.strokeStyle = PREVIEW_COLOR;
    ctx.fillStyle = PREVIEW_COLOR;
    ctx.lineWidth = 2 / transform.scale;
    ctx.setLineDash([6 / transform.scale, 5 / transform.scale]);
    ctx.beginPath();
    ctx.moveTo(sp.x, sp.y);
    ctx.lineTo(branchCurrent.x, branchCurrent.y);
    ctx.stroke();
    ctx.setLineDash([]);
    // 吸附起点标记
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 4.5 / transform.scale, 0, Math.PI * 2);
    ctx.fill();

    // 节点创建模式：预览节点圆角虚线框（松手点 = 节点左边缘中点）
    if (nodeCreateMode) {
      const h = BASE_NODE_HEIGHT * FISHBONE_NODE_SCALE;
      const w = getNodeWidth({ name: '新节点' }, FISHBONE_NODE_SCALE);
      const x0 = branchCurrent.x;
      const y0 = branchCurrent.y - h / 2;
      const r = 8 / transform.scale;
      ctx.strokeStyle = '#9fe6a0';
      ctx.lineWidth = 1.5 / transform.scale;
      ctx.setLineDash([5 / transform.scale, 4 / transform.scale]);
      ctx.beginPath();
      ctx.moveTo(x0 + r, y0);
      ctx.arcTo(x0 + w, y0, x0 + w, y0 + h, r);
      ctx.arcTo(x0 + w, y0 + h, x0, y0 + h, r);
      ctx.arcTo(x0, y0 + h, x0, y0, r);
      ctx.arcTo(x0, y0, x0 + w, y0, r);
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  ctx.restore();
}

// ============================================================
//  2D 点击选中：命中检测与标签数据
// ============================================================

// 点到线段最短距离（世界坐标）
function _pointSegDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// 2D 命中检测：返回 { trunk, segIndex } | null（容差 5px 屏幕像素）
export function hitTestFishboneSeg2D(worldX, worldY) {
  if (trunkDrawMode) return null;   // 绘制模式下不响应选中
  const tol = 5 / transform.scale;
  const hidden = getFishboneHiddenTrunkIds();
  for (const trunk of (appState.fishboneTrunks || [])) {
    if (hidden.has(trunk.id)) continue;   // 被折叠隐藏的子支不可点选
    if (!isTrunkInCurrentLayer(trunk)) continue;   // 非当前图层的干线不可点选
    const pts = trunk.points || [];
    for (let i = 0; i < pts.length - 1; i++) {
      if (_pointSegDist(worldX, worldY, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y) < tol) {
        return { trunk, segIndex: i };
      }
    }
  }
  return null;
}

// 端点命中检测（拖端点改向改长）：返回 { trunk, pointIndex } | null（容差 9px 屏幕像素）
// 仅两端端点可拖；endNodeId 分支的终点由节点位置决定（每帧同步），不可拖
export function hitTestFishboneEndpoint2D(worldX, worldY) {
  const tol = 9 / transform.scale;
  const hidden = getFishboneHiddenTrunkIds();
  for (const trunk of (appState.fishboneTrunks || [])) {
    if (hidden.has(trunk.id)) continue;   // 被折叠隐藏的子支端点不可拖
    if (!isTrunkInCurrentLayer(trunk)) continue;   // 非当前图层的干线端点不可拖
    const pts = trunk.points || [];
    if (pts.length < 2) continue;
    const lastIdx = pts.length - 1;
    for (const i of [0, lastIdx]) {
      if (trunk.endNodeId && i === lastIdx) continue;
      if (Math.hypot(worldX - pts[i].x, worldY - pts[i].y) < tol) {
        return { trunk, pointIndex: i };
      }
    }
  }
  return null;
}

// 单条 trunk 最近投影：返回 { x, y, t, segIndex, d } | null（无容差限制，拖动沿线滑动用）
export function projectOnTrunk2D(trunkId, worldX, worldY) {
  const trunk = (appState.fishboneTrunks || []).find(t => t.id === trunkId);
  if (!trunk) return null;
  const pts = trunk.points || [];
  let best = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((worldX - a.x) * dx + (worldY - a.y) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(worldX - (a.x + t * dx), worldY - (a.y + t * dy));
    if (!best || d < best.d) best = { x: a.x + t * dx, y: a.y + t * dy, t, segIndex: i, d };
  }
  return best;
}

// 最近干线投影（排除指定 trunk）：用于按下时判定/锁定分支端点所在的干线
export function projectOnFishboneLine2D(worldX, worldY, excludeTrunkId) {
  let best = null;
  for (const trunk of (appState.fishboneTrunks || [])) {
    if (excludeTrunkId && trunk.id === excludeTrunkId) continue;
    if (!isTrunkInCurrentLayer(trunk)) continue;   // 非当前图层的干线不参与投影
    const p = projectOnTrunk2D(trunk.id, worldX, worldY);
    if (p && (!best || p.d < best.d)) best = { trunk, ...p };
  }
  return best;
}

// ============================================================
//  干线子树收集（拖动干线时确定移动范围）：
//  仅按创建时记录的 parentId 判定父子（每帧 ensureFishboneParentIds 已为旧分支补标）；
//  无 parentId = 根干路，绝不会被收集为其他 trunk 的子支——
//  此前对无 parentId 者回退「起点贴合 12px」几何判定，导致支路拖到干路端点
//  （起点重合）后，干路被误收进支路子树（支路带整棵树跑 = "变成干路"）。
//  返回 [该干线, 子支...]（按下时调用一次并锁定，拖动中不重算）
// ============================================================
export function collectFishboneSubtree2D(rootTrunk) {
  const result = [rootTrunk];
  const grow = (parent) => {
    for (const t of (appState.fishboneTrunks || [])) {
      if (result.includes(t)) continue;
      if (t.parentId && t.parentId === parent.id) {
        result.push(t);
        grow(t);
      }
    }
  };
  grow(rootTrunk);
  return result;
}

// ============================================================
//  旧数据迁移：为无 parentId 的 trunk 补写父子关系。
//  按创建顺序（数组序）判定：起点贴合更早创建的干线（12px 屏幕容差）
//  → 记为其子支。干路先建、分支后建的使用流保证端点重合时
//  先建的干路不会被误标为后建分支的子支。补写后落盘自动持久化。
// ============================================================
export function ensureFishboneParentIds() {
  const trunks = appState.fishboneTrunks || [];
  for (let i = 0; i < trunks.length; i++) {
    const t = trunks[i];
    if (!t.layerId) t.layerId = appState.currentLayerId;   // 旧数据惰性迁移：打上创建时所在图层
    if (t.parentId) continue;
    if (t.detached) continue;   // 用户主动「变成主干路」提升的分支：永久豁免几何迁移
    const start = t.points && t.points[0];
    if (!start) continue;
    for (let j = 0; j < i; j++) {   // 仅更早创建的 trunk 可为父
      const pts = trunks[j].points || [];
      let on = false;
      for (let k = 0; k < pts.length - 1 && !on; k++) {
        if (_pointSegDist(start.x, start.y, pts[k].x, pts[k].y, pts[k + 1].x, pts[k + 1].y)
            < 12 / transform.scale) on = true;
      }
      if (on) { t.parentId = trunks[j].id; break; }
    }
  }
}

// 最近段投影吸附：返回 { trunk, segIndex, t, point: {x, y} } | null
// t ∈ [0,1] 为投影点在线段上的参数，point 为吸附后的起点（分支绘制用，容差 8px）
export function projectOnFishboneSeg2D(worldX, worldY) {
  const tol = 8 / transform.scale;
  const hidden = getFishboneHiddenTrunkIds();
  let best = null;
  for (const trunk of (appState.fishboneTrunks || [])) {
    if (hidden.has(trunk.id)) continue;   // 被折叠隐藏的子支不参与吸附
    if (!isTrunkInCurrentLayer(trunk)) continue;   // 非当前图层的干线不参与吸附
    const pts = trunk.points || [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      let t = len2 > 0 ? ((worldX - a.x) * dx + (worldY - a.y) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(worldX - (a.x + t * dx), worldY - (a.y + t * dy));
      if (d < tol && (!best || d < best.d)) {
        best = { trunk, segIndex: i, t, point: { x: a.x + t * dx, y: a.y + t * dy }, d };
      }
    }
  }
  return best;
}

// 构建连线标签 userData（字段与 3D mesh.userData 保持一致，
// 供 LineTooltip 的鱼骨分支通过 trunkId + segId 定位段元数据）
export function fishboneSegUserData2D(trunk, segIndex) {
  const seg = (trunk.segs || [])[segIndex] || {};
  return {
    edgeType: 'fishbone',
    trunkId: trunk.id,
    segId: seg.id,
    segIndex,
    label: seg.label || '',
    labelHidden: seg.labelHidden !== false,
    customColor: seg.customColor || null,
    startId: null,
    endId: null
  };
}
