// ============================================================
//  mindmap-embed/data.js — 数据读写 / 遍历 + 鱼骨数据查询
//  - _parseData：从 div[data-mindmap] 解析并规范化数据（旧格式兼容迁移）
//  - _writeData：数据写回 div + 编辑器标脏；_eachNode/_walk/_walkVisible 遍历
//  - _findParent/_findById：节点查找
//  - 鱼骨干线查询（与 Fishbone/ 同构）：_fbFind/_fbSegDist/_fbHidden/
//    _fbSubtree/_fbSubtreeNodes/_fbProject/_fbArc/_fbPointAtArc
// ============================================================

import { _genId } from './share.js';

// ── 数据读写 ──────────────────────────────────────────────
function _parseData(div) {
  let data = null;
  try { data = JSON.parse(div.dataset.mindmap || ''); } catch (e) { data = null; }
  if (!data || typeof data !== 'object') data = {};
  // 旧格式兼容：{root} → roots
  if (data.root && !data.roots) data.roots = [data.root];
  if (!Array.isArray(data.roots) || data.roots.length === 0) {
    data.roots = [{ id: 'n1', text: '中心主题', x: 0, y: 0, seed: Math.random(), children: [] }];
  }
  data.edges = Array.isArray(data.edges) ? data.edges : [];
  data.roots.forEach(_normalize);
  // 鱼骨干线：trunks 结构（与 2D Fishbone 同构）；旧扁平 segs 自动迁移为连通链干线
  if (Array.isArray(data.trunks)) data.trunks.forEach(_normalizeTrunk);
  else data.trunks = _migrateFlatSegs(Array.isArray(data.segs) ? data.segs : []);
  delete data.segs;
  return data;
}
function _normalizeTrunk(tr) {
  if (!tr.id) tr.id = 'trunk_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  tr.points = (Array.isArray(tr.points) ? tr.points : []).map(function (p) {
    return { x: typeof p.x === 'number' ? p.x : 0, y: typeof p.y === 'number' ? p.y : 0 };
  });
  tr.segs = (Array.isArray(tr.segs) ? tr.segs : []).map(function (sg) {
    return {
      id: sg.id || ('seg_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)),
      label: sg.label || '',
      labelHidden: sg.labelHidden !== false,
      customColor: sg.customColor || null
    };
  });
  while (tr.segs.length < Math.max(0, tr.points.length - 1)) {
    tr.segs.push({ id: 'seg_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8), label: '', labelHidden: true, customColor: null });
  }
}
// 旧扁平 segs [{x1,y1,x2,y2,label?,customColor?}] → 连通链干线（共享端点串成折线）
function _migrateFlatSegs(segs) {
  const K = function (x, y) { return Math.round(x * 20) + ',' + Math.round(y * 20); };
  const P = function (sg, end) { return { x: sg['x' + end], y: sg['y' + end] }; };
  const used = new Array(segs.length).fill(false);
  const adj = new Map();
  segs.forEach(function (sg, i) {
    [[K(sg.x1, sg.y1), i, 1], [K(sg.x2, sg.y2), i, 2]].forEach(function (e) {
      if (!adj.has(e[0])) adj.set(e[0], []);
      adj.get(e[0]).push([i, e[1]]);
    });
  });
  const trunks = [];
  for (let s = 0; s < segs.length; s++) {
    if (used[s]) continue;
    used[s] = true;
    const pts = [P(segs[s], 1), P(segs[s], 2)];
    const meta = [segs[s]];
    // 向尾端 / 头端扩展链（共享端点即续接）
    for (;;) {
      const last = pts[pts.length - 1];
      const list = (adj.get(K(last.x, last.y)) || []).filter(function (e) { return !used[e[0]]; });
      if (!list.length) break;
      used[list[0][0]] = true;
      pts.push(P(segs[list[0][0]], list[0][1] === 1 ? 2 : 1));
      meta.push(segs[list[0][0]]);
    }
    for (;;) {
      const first = pts[0];
      const list = (adj.get(K(first.x, first.y)) || []).filter(function (e) { return !used[e[0]]; });
      if (!list.length) break;
      used[list[0][0]] = true;
      pts.unshift(P(segs[list[0][0]], list[0][1] === 1 ? 2 : 1));
      meta.unshift(segs[list[0][0]]);
    }
    trunks.push({
      id: 'trunk_' + Date.now().toString(36) + '_' + s + Math.random().toString(36).slice(2, 6),
      points: pts,
      segs: meta.map(function (sg) {
        return {
          id: 'seg_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
          label: sg.label || '',
          labelHidden: !sg.label,
          customColor: sg.customColor || null
        };
      })
    });
  }
  return trunks;
}
function _normalize(n) {
  if (!n.id) n.id = _genId();
  if (typeof n.x !== 'number') n.x = 0;
  if (typeof n.y !== 'number') n.y = 0;
  if (n.seed === undefined) n.seed = Math.random();
  if (n.type !== 'step') n.type = 'text';
  if (typeof n.sizeScale !== 'number' || n.sizeScale <= 0) n.sizeScale = 1;
  if (n.shape && n.shape !== 'roundedRect' && n.shape !== 'diamond' && n.shape !== 'ellipse' && n.shape !== 'stadium') delete n.shape;  // 留空=自动（步骤→跑道形）
  n.children = Array.isArray(n.children) ? n.children : [];
  n.children.forEach(_normalize);
}
function _writeData(inst) {
  inst.div.dataset.mindmap = JSON.stringify(inst.data);
  if (inst.editor) { try { inst.editor.setDirty(true); } catch (e) {} }
}
// 遍历所有节点（含折叠子树）
function _eachNode(roots, fn) {
  roots.forEach(function (r) { _walk(r, fn); });
}
function _walk(n, fn) {
  fn(n);
  n.children.forEach(function (c) { _walk(c, fn); });
}
// 遍历可见节点（折叠子树剪枝）
function _walkVisible(n, fn) {
  fn(n);
  if (n.collapsed) return;
  n.children.forEach(function (c) { _walkVisible(c, fn); });
}
function _findParent(roots, id) {
  let found = null;
  _eachNode(roots, function (n) {
    if (found) return;
    for (let i = 0; i < n.children.length; i++) {
      if (n.children[i].id === id) { found = n; return; }
    }
  });
  return found;
}
function _findById(roots, id) {
  let found = null;
  _eachNode(roots, function (n) { if (n.id === id) found = n; });
  return found;
}

// ── 鱼骨干线辅助（与 Fishbone/ 同构：trunk = 折线 points + 段元数据 segs + parentId/collapsed/endNodeId）──
function _fbFind(inst, trunkId) {
  return inst.data.trunks.find(function (t) { return t.id === trunkId; }) || null;
}
// 点到线段最短距离
function _fbSegDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
// 隐藏缓存（与 Fishbone/visibility.js 同语义）：
// 干线隐藏 = 有被折叠的祖先；节点隐藏 = 折叠干线/被隐藏子支的 endNodeId 及其树后代
function _fbHidden(inst) {
  const hiddenTrunks = new Set();
  const hiddenNodes = new Set();
  const isHid = function (t) {
    let cur = t;
    const seen = new Set();
    while (cur && cur.parentId && !seen.has(cur.parentId)) {
      seen.add(cur.parentId);
      const p = _fbFind(inst, cur.parentId);
      if (!p) break;
      if (p.collapsed) return true;
      cur = p;
    }
    return false;
  };
  inst.data.trunks.forEach(function (t) {
    const hid = t.parentId && isHid(t);
    if (hid) hiddenTrunks.add(t.id);
    if (t.endNodeId && (t.collapsed || hid) && !hiddenNodes.has(t.endNodeId)) {
      hiddenNodes.add(t.endNodeId);
      const n = _findById(inst.data.roots, t.endNodeId);
      if (n) _walk(n, function (c) { hiddenNodes.add(c.id); });
    }
  });
  return { trunks: hiddenTrunks, nodes: hiddenNodes };
}
// 干线子树：[自身, 子支...]（仅按 parentId 判定，与 collectFishboneSubtree2D 一致）
function _fbSubtree(inst, trunk) {
  const out = [trunk];
  const grow = function (parent) {
    inst.data.trunks.forEach(function (t) {
      if (!out.includes(t) && t.parentId && t.parentId === parent.id) { out.push(t); grow(t); }
    });
  };
  grow(trunk);
  return out;
}
// 子树末端节点 + 树后代 id 集合
function _fbSubtreeNodes(inst, subtree) {
  const ids = new Set();
  subtree.forEach(function (t) {
    if (!t.endNodeId || ids.has(t.endNodeId)) return;
    ids.add(t.endNodeId);
    const n = _findById(inst.data.roots, t.endNodeId);
    if (n) _walk(n, function (c) { ids.add(c.id); });
  });
  return ids;
}
// 单条干线最近投影：{ x, y, t, segIndex, d } | null（滑动/挂载吸附用，无容差限制）
function _fbProject(inst, trunkId, wx, wy) {
  const trunk = _fbFind(inst, trunkId);
  if (!trunk) return null;
  const pts = trunk.points || [];
  let best = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((wx - a.x) * dx + (wy - a.y) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(wx - (a.x + t * dx), wy - (a.y + t * dy));
    if (!best || d < best.d) best = { x: a.x + t * dx, y: a.y + t * dy, t: t, segIndex: i, d: d };
  }
  return best;
}
// 弧长表 cum[i] = 到第 i 个顶点的累计长度（分支沿线滑动用）
function _fbArc(trunk) {
  const lpts = trunk.points || [];
  const cum = [0];
  for (let i = 1; i < lpts.length; i++) cum.push(cum[i - 1] + Math.hypot(lpts[i].x - lpts[i - 1].x, lpts[i].y - lpts[i - 1].y));
  return { pts: lpts, cum: cum, total: cum[cum.length - 1] || 0 };
}
function _fbPointAtArc(arc, s) {
  const cum = arc.cum, pts = arc.pts;
  let i = 0;
  while (i < cum.length - 2 && cum[i + 1] < s) i++;
  const segLen = (cum[i + 1] - cum[i]) || 1;
  const t = Math.max(0, Math.min(1, (s - cum[i]) / segLen));
  return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, y: pts[i].y + (pts[i + 1].y - pts[i].y) * t };
}

export {
  _parseData, _writeData, _eachNode, _walk, _walkVisible, _findParent, _findById,
  _fbFind, _fbSegDist, _fbHidden, _fbSubtree, _fbSubtreeNodes, _fbProject, _fbArc, _fbPointAtArc
};
