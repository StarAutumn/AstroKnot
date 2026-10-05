// ============================================================
//  mindmap-embed/hit.js — 命中检测
//  - hitTest：可见节点命中（被鱼骨折叠隐藏的节点不可点选）
//  - hitBadge：折叠徽标命中（节点右下角，保留备用）
//  - hitSeg/_fbHitEndpoint/_fbSnapSeg：干线线段/端点/吸附命中
//  - hitEdge：自由连线命中（a↔b）
// ============================================================

import { _nodeRect, _distToSeg, _edgePoints } from './share.js';
import { _walkVisible, _findById, _fbHidden, _fbSegDist } from './data.js';

function hitTest(inst, wx, wy) {
  let hit = null;
  const fbn = _fbHidden(inst).nodes;   // 被鱼骨折叠隐藏的节点不可点选
  inst.data.roots.forEach(function (r) {
    _walkVisible(r, function (n) {
      if (hit || fbn.has(n.id)) return;
      const rect = _nodeRect(n);
      if (wx >= rect.x && wx <= rect.x + rect.w && wy >= rect.y && wy <= rect.y + rect.h) hit = n;
    });
  });
  return hit;
}
// 折叠徽标命中（节点右下角）
function hitBadge(inst, wx, wy) {
  let hit = null;
  inst.data.roots.forEach(function (r) {
    _walkVisible(r, function (n) {
      if (hit || !n.children.length) return;
      const rect = _nodeRect(n);
      const bx = rect.x + rect.w, by = rect.y + rect.h;
      const br = 7 * (n.sizeScale || 1);
      if (wx >= bx - br && wx <= bx + br && wy >= by - br && wy <= by + br) hit = n;
    });
  });
  return hit;
}
// 线段命中：{ trunk, segIndex } | null（容差 5px 屏幕像素，隐藏子支不可点）
function hitSeg(inst, wx, wy) {
  const tol = 5 / inst.view.scale;
  const hid = _fbHidden(inst);
  for (const trunk of inst.data.trunks) {
    if (hid.trunks.has(trunk.id)) continue;
    const pts = trunk.points || [];
    for (let i = 0; i < pts.length - 1; i++) {
      if (_fbSegDist(wx, wy, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y) < tol) return { trunk: trunk, segIndex: i };
    }
  }
  return null;
}
// 端点命中（仅折线两端可拖，容差 9px；endNodeId 终点由节点位置决定不可拖）
function _fbHitEndpoint(inst, wx, wy) {
  const tol = 9 / inst.view.scale;
  const hid = _fbHidden(inst);
  for (const trunk of inst.data.trunks) {
    if (hid.trunks.has(trunk.id)) continue;
    const pts = trunk.points || [];
    if (pts.length < 2) continue;
    for (const i of [0, pts.length - 1]) {
      if (trunk.endNodeId && i === pts.length - 1) continue;
      if (Math.hypot(wx - pts[i].x, wy - pts[i].y) < tol) return { trunk: trunk, pointIndex: i };
    }
  }
  return null;
}
// 最近段投影吸附（分支/节点创建起点，容差 8px）：{ trunk, segIndex, t, point }
function _fbSnapSeg(inst, wx, wy) {
  const tol = 8 / inst.view.scale;
  const hid = _fbHidden(inst);
  let best = null;
  for (const trunk of inst.data.trunks) {
    if (hid.trunks.has(trunk.id)) continue;
    const pts = trunk.points || [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      let t = len2 > 0 ? ((wx - a.x) * dx + (wy - a.y) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(wx - (a.x + t * dx), wy - (a.y + t * dy));
      if (d < tol && (!best || d < best.d)) best = { trunk: trunk, segIndex: i, t: t, point: { x: a.x + t * dx, y: a.y + t * dy }, d: d };
    }
  }
  return best;
}
// 命中自由连线（a↔b）
function hitEdge(inst, wx, wy) {
  const tol = 8 / inst.view.scale;
  for (let i = 0; i < inst.data.edges.length; i++) {
    const e = inst.data.edges[i];
    const na = _findById(inst.data.roots, e.a), nb = _findById(inst.data.roots, e.b);
    if (!na || !nb) continue;
    const p = _edgePoints(na, nb);
    if (_distToSeg(wx, wy, p.x1, p.y1, p.x2, p.y2) <= tol) return i;
  }
  return -1;
}

export { hitTest, hitBadge, hitSeg, hitEdge, _fbHitEndpoint, _fbSnapSeg };
