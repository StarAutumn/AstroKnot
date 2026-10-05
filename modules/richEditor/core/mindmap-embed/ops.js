// ============================================================
//  mindmap-embed/ops.js — 群组 + 节点编辑操作
//  - 数据变更入口 _markChanged / 模式重置 _resetMode
//  - 群组：_groups/_hitGroup/_groupHandles/_hitGroupHandle/_commitGroup/
//    _deleteGroup/_pruneGroups（与 2DView groupRects 同构）
//  - 节点操作：arrangeTree/_rootOf/addChild/addRoot/removeNode/copyNode/
//    renameNode/editEdgeLabel（删除带子节点的节点走应用内确认框）
// ============================================================

import { showConfirm } from '../../../module4_Confirm.js';
import { _genId, setHint, _nodeRect, _edgePoints, _shift, _font, toScreen, MM_GH } from './share.js';
import { _writeData, _findParent, _findById, _walk, _walkVisible, _fbHidden } from './data.js';
import { _layoutSub, _assignSub } from './layout.js';

// ── 编辑操作 ──
function _markChanged(inst) { _writeData(inst); }
function _resetMode(inst) { inst.mode = null; inst.modeFrom = null; inst.segStart = null; inst._segCursor = null; inst.branchFrom = false; inst.branchHit = null; inst.attachSrc = null; inst._curTrunk = null; inst._groupBox = null; setHint(inst, ''); }

// ── 群组（与 2DView groupRects 同构）──────────────────────
// groups: [{ id, x, y, w, h, name, fillColor, fillOpacity, borderColor, borderRadius, lineStyle, lineWidth, nodeIds }]
function _groups(inst) { if (!Array.isArray(inst.data.groups)) inst.data.groups = []; return inst.data.groups; }
// 群组本体命中（后画的在上层，从后往前）
function _hitGroup(inst, wx, wy) {
  const gs = _groups(inst);
  for (let i = gs.length - 1; i >= 0; i--) {
    const g = gs[i];
    if (wx >= g.x && wx <= g.x + g.w && wy >= g.y && wy <= g.y + g.h) return g;
  }
  return null;
}
// 群组四角把手位置（屏幕像素恒定，渲染与命中共用）
function _groupHandles(inst, g) {
  const hs = MM_GH / inst.view.scale;
  return {
    nw: { x: g.x - hs / 2, y: g.y - hs / 2 },
    ne: { x: g.x + g.w - hs / 2, y: g.y - hs / 2 },
    sw: { x: g.x - hs / 2, y: g.y + g.h - hs / 2 },
    se: { x: g.x + g.w - hs / 2, y: g.y + g.h - hs / 2 }
  };
}
function _hitGroupHandle(inst, g, wx, wy) {
  const hs = MM_GH / inst.view.scale;
  const hsMap = _groupHandles(inst, g);
  for (const corner in hsMap) {
    const h = hsMap[corner];
    if (wx >= h.x && wx <= h.x + hs && wy >= h.y && wy <= h.y + hs) return corner;
  }
  return null;
}
// 框选提交：中心点落在矩形内的可见节点绑定进群组（与 2D groupNodes 同语义）
function _commitGroup(inst, a, b) {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  const w = Math.abs(a.x - b.x), h = Math.abs(a.y - b.y);
  if (w < 5 || h < 5) return null;
  const fbn = _fbHidden(inst).nodes;
  const nodeIds = [];
  inst.data.roots.forEach(function (r) {
    _walkVisible(r, function (n) {
      if (fbn.has(n.id)) return;
      if (n.x >= x && n.x <= x + w && n.y >= y && n.y <= y + h) nodeIds.push(n.id);
    });
  });
  const g = {
    id: 'group_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    x: x, y: y, w: w, h: h,
    name: '', fillColor: '#4a3c7e', fillOpacity: 0.25,
    borderColor: '#7a6aae', borderRadius: 0, lineStyle: 'dashed', lineWidth: 1.5,
    nodeIds: nodeIds
  };
  _groups(inst).push(g);
  inst.selectedGroupId = g.id;
  _markChanged(inst);
  return g;
}
// 删除群组（被绑定节点保留，与 2D deleteSelectedGroupRect 一致）
function _deleteGroup(inst, g) {
  const gs = _groups(inst);
  const i = gs.indexOf(g);
  if (i >= 0) gs.splice(i, 1);
  if (inst.selectedGroupId === g.id) inst.selectedGroupId = null;
  _markChanged(inst);
}
// 群组绑定清理：节点删除后从所有群组移除失效 id
function _pruneGroups(inst) {
  if (!Array.isArray(inst.data.groups)) return;
  inst.data.groups.forEach(function (g) {
    g.nodeIds = (g.nodeIds || []).filter(function (id) { return _findById(inst.data.roots, id); });
  });
}

// ── 排列避让（等价 2D arrangeSubtreeIncremental）：重排根所在整棵树，
//    根节点位置为锚点不动，后代全部按布局算法落位 ──
function arrangeTree(inst, rootNode) {
  const sub = _layoutSub(rootNode);
  _assignSub(sub, 0, 0);
  const dx = rootNode.x - (sub.x + sub.w / 2);
  const dy = rootNode.y - (sub.y + sub.h / 2);
  (function apply(l) {
    l.node.x = l.x + dx + l.w / 2;   // 布局为左上角坐标，换算为节点中心
    l.node.y = l.y + dy + l.h / 2;
    l.children.forEach(apply);
  })(sub);
}
function _rootOf(inst, node) {
  let r = node, p;
  while ((p = _findParent(inst.data.roots, r.id))) r = p;
  return r;
}
// 新建子节点：入树后整棵子树按 2D 排列避让算法自动重排（新节点获得整齐落位）
function addChild(inst, parent, type) {
  const n = {
    id: _genId(), text: type === 'step' ? '下一步' : '新节点', type: type === 'step' ? 'step' : 'text',
    x: 0, y: 0, seed: Math.random(), sizeScale: 1, children: []   // shape 留空=自动
  };
  parent.children.push(n);
  if (parent.collapsed) parent.collapsed = false;
  arrangeTree(inst, _rootOf(inst, parent));
  inst.selectedId = n.id;
  _markChanged(inst);
  return n;
}
function addRoot(inst, type, wx, wy) {
  const n = {
    id: _genId(), text: type === 'step' ? '步骤根节点' : '新根节点', type: type === 'step' ? 'step' : 'text',
    x: wx, y: wy, seed: Math.random(), sizeScale: 1, children: []   // shape 留空=自动
  };
  inst.data.roots.push(n);
  inst.selectedId = n.id;
  _markChanged(inst);
}
function removeNode(inst, n) {
  // 与 2D 一致：删除带子节点的节点会连整棵子树一起删，先弹应用内确认框（数据安全）
  if (n.children && n.children.length) {
    showConfirm('确定删除该节点及其所有子节点吗？', function () { _removeNodeNow(inst, n); }, null, '删除节点');
    return;
  }
  _removeNodeNow(inst, n);
}
function _removeNodeNow(inst, n) {
  const p = _findParent(inst.data.roots, n.id);
  if (p) {
    p.children = p.children.filter(function (c) { return c.id !== n.id; });
  } else {
    inst.data.roots = inst.data.roots.filter(function (r) { return r.id !== n.id; });
  }
  // 清理关联自由连线
  inst.data.edges = inst.data.edges.filter(function (e) { return e.a !== n.id && e.b !== n.id; });
  if (inst.data.groups) _pruneGroups(inst);   // 清理群组绑定
  if (inst.selectedId === n.id) inst.selectedId = null;
  _markChanged(inst);
}
function copyNode(inst, n) {
  const clone = JSON.parse(JSON.stringify(n));
  _walk(clone, function (x) { x.id = _genId(); x.seed = Math.random(); });
  const p = _findParent(inst.data.roots, n.id);
  if (p) {
    p.children.push(clone);
    arrangeTree(inst, _rootOf(inst, p));   // 与 2D 一致：复制后自动重排所在子树
  } else {
    _shift(clone, 40, 40);
    inst.data.roots.push(clone);
  }
  inst.selectedId = clone.id;
  _markChanged(inst);
}
function renameNode(inst, n) {
  const rect = _nodeRect(n);
  const input = document.createElement('input');
  input.value = n.text || '';
  input.style.cssText = 'position:absolute;z-index:5;border:1px solid #FFD700;border-radius:4px;background:#0d1b24;color:#c0f0ff;font:' + _font(n.sizeScale) + ';padding:4px 8px;outline:none;box-sizing:border-box;user-select:text;';
  inst.div.appendChild(input);
  const syncPos = function () {
    const p = toScreen(inst, rect.x, rect.y);
    input.style.left = p.x + 'px';
    input.style.top = p.y + 'px';
    input.style.width = Math.max(90, rect.w * inst.view.scale) + 'px';
    input.style.height = rect.h * inst.view.scale + 'px';
  };
  syncPos();
  input.focus();
  input.select();
  let done = false;
  const commit = function () {
    if (done) return;
    done = true;
    const v = input.value.trim();
    if (v && v !== n.text) { n.text = v; _markChanged(inst); }
    input.remove();
    if (inst.interactive) inst.canvas.focus();
  };
  input.addEventListener('keydown', function (e) {
    e.stopPropagation();
    if (e.key === 'Enter') commit();
    else if (e.key === 'Escape') { done = true; input.remove(); }
  });
  input.addEventListener('blur', commit);
  inst._renameSync = syncPos;
}

// 编辑连线标签（双击连线触发）：清空内容即删除标签
function editEdgeLabel(inst, edge) {
  const na = _findById(inst.data.roots, edge.a), nb = _findById(inst.data.roots, edge.b);
  if (!na || !nb) return;
  const p = _edgePoints(na, nb);
  const input = document.createElement('input');
  input.value = edge.label || '';
  input.placeholder = '连线标签';
  input.style.cssText = 'position:absolute;z-index:5;width:150px;border:1px solid #ffd966;border-radius:4px;background:#0d1b24;color:#ffd966;font:12px system-ui,sans-serif;padding:3px 8px;outline:none;box-sizing:border-box;user-select:text;';
  inst.div.appendChild(input);
  const syncPos = function () {
    const sp = toScreen(inst, (p.x1 + p.x2) / 2, (p.y1 + p.y2) / 2);
    input.style.left = Math.max(2, sp.x - 75) + 'px';
    input.style.top = Math.max(2, sp.y - 14) + 'px';
  };
  syncPos();
  input.focus(); input.select();
  const cleanup = function () {
    input.remove();
    if (inst._renameSync === syncPos) inst._renameSync = null;
  };
  const commit = function () {
    const v = input.value.trim();
    if (v) edge.label = v; else delete edge.label;
    _markChanged(inst);
    cleanup();
  };
  input.addEventListener('keydown', function (ev) {
    ev.stopPropagation();
    if (ev.key === 'Enter') commit();
    else if (ev.key === 'Escape') cleanup();
  });
  input.addEventListener('blur', commit);
  inst._renameSync = syncPos;
}

export {
  _markChanged, _resetMode, _groups, _hitGroup, _groupHandles, _hitGroupHandle,
  _commitGroup, _deleteGroup, _pruneGroups, arrangeTree, _rootOf, addChild, addRoot,
  removeNode, copyNode, renameNode, editEdgeLabel
};
