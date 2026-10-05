// ============================================================
//  mindmap-embed/fishbone.js — 鱼骨写操作
//  - 干线 id/段元数据构造：_fbNewTrunkId/_fbNewSeg（纯函数）
//  - 折叠/展开支路 _fbToggleCollapse（带 300ms 渐变动画登记）
//  - 删除段 _fbDeleteSeg（首删/尾删/中段分裂/仅段删整条）
//  - 复制/删除整张鱼骨图 _fbDuplicateTree/_fbDeleteTree（删除走确认框）
//  - 挂载支路 _fbAttachTo；新建鱼骨节点 _fbCommitNodeCreate
// ============================================================

import { showConfirm } from '../../../module4_Confirm.js';
import { _genId, setHint } from './share.js';
import { _findById, _walk, _fbSubtree, _fbProject, _fbFind } from './data.js';
import { _markChanged, _pruneGroups } from './ops.js';
import { _measureNode } from './layout.js';

function _fbNewTrunkId() { return 'trunk_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function _fbNewSeg() { return { id: 'seg_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8), label: '', labelHidden: true, customColor: null }; }
// ── 折叠/展开支路：trunk.collapsed 切换，仅对显隐翻转的干线/节点做 300ms 渐变 ──
function _fbToggleCollapse(inst, trunk) {
  const before = _fbHidden(inst);
  trunk.collapsed = !trunk.collapsed;
  const after = _fbHidden(inst);
  const now = performance.now();
  const dir = trunk.collapsed ? 'collapse' : 'expand';
  inst.data.trunks.forEach(function (t2) {
    if (before.trunks.has(t2.id) !== after.trunks.has(t2.id)) inst._fbAnims.set(t2.id, { t0: now, dir: dir });
  });
  const allNodeIds = new Set();
  inst.data.trunks.forEach(function (t2) {
    if (!t2.endNodeId) return;
    allNodeIds.add(t2.endNodeId);
    const n = _findById(inst.data.roots, t2.endNodeId);
    if (n) _walk(n, function (c) { allNodeIds.add(c.id); });
  });
  allNodeIds.forEach(function (id) {
    if (before.nodes.has(id) !== after.nodes.has(id)) inst._fbAnims.set(id, { t0: now, dir: dir });
  });
  // 选中段位于被折叠子树内时清除高亮
  if (inst.selectedSeg) {
    let cur = _fbFind(inst, inst.selectedSeg.trunkId);
    const seen = new Set();
    while (cur && cur.parentId && !seen.has(cur.id)) {
      seen.add(cur.id);
      const p = _fbFind(inst, cur.parentId);
      if (!p) break;
      if (p.collapsed) { inst.selectedSeg = null; break; }
      cur = p;
    }
  }
  setHint(inst, trunk.collapsed ? '已折叠支路' : '已展开支路');
  _markChanged(inst);
}
// 删除一段（与 2D deleteFishboneSegment 同语义）：
// 仅一段→删整条（子支提升）；首段→头删；末段→尾删；中段→分裂两条干线
function _fbDeleteSeg(inst, trunk, segIndex) {
  const trunks = inst.data.trunks;
  const pts = trunk.points, segs = trunk.segs;
  if (segs.length <= 1) {
    const i = trunks.indexOf(trunk);
    if (i >= 0) trunks.splice(i, 1);
    trunks.forEach(function (t2) {
      if (t2.parentId === trunk.id) { delete t2.parentId; t2.detached = true; }
    });
  } else if (segIndex === 0) {
    pts.shift(); segs.shift();
  } else if (segIndex === segs.length - 1) {
    pts.pop(); segs.pop();
  } else {
    const tail = { id: _fbNewTrunkId(), points: pts.slice(segIndex + 1), segs: segs.slice(segIndex + 1) };
    // 末端节点连接在折线最后一点上 → 随尾段转移
    if (trunk.endNodeId) { tail.endNodeId = trunk.endNodeId; delete trunk.endNodeId; }
    trunk.points = pts.slice(0, segIndex + 1);
    trunk.segs = segs.slice(0, segIndex);
    trunks.push(tail);
  }
  if (inst.selectedSeg && inst.selectedSeg.trunkId === trunk.id) inst.selectedSeg = null;
  _markChanged(inst);
}
// 复制鱼骨图：整棵子树克隆 +60 偏移；末端节点及其树后代一并克隆（引用去重）
function _fbDuplicateTree(inst, trunk) {
  const subtree = _fbSubtree(inst, trunk);
  const idMap = new Map();     // 源干线 id → 副本 id
  const nodeIdMap = new Map(); // 源节点 id → 克隆节点 id
  const cloneNode = function (oldId) {
    if (nodeIdMap.has(oldId)) return nodeIdMap.get(oldId);
    const node = _findById(inst.data.roots, oldId);
    if (!node) return null;
    const newId = _genId();
    nodeIdMap.set(oldId, newId);
    const clone = JSON.parse(JSON.stringify(node));
    clone.id = newId;
    clone.x += 60; clone.y += 60;
    clone.children = [];
    (node.children || []).forEach(function (ch) {
      const cid = cloneNode(ch.id);
      if (cid) {
        const cn = _findById(inst.data.roots, cid);
        if (cn) clone.children.push(cn);
      }
    });
    inst.data.roots.push(clone);
    return newId;
  };
  // 第一遍：克隆干线本体（parentId / endNodeId 暂空）
  const copies = subtree.map(function (t2) {
    const copy = {
      id: _fbNewTrunkId(),
      points: (t2.points || []).map(function (p) { return { x: p.x + 60, y: p.y + 60 }; }),
      segs: (t2.segs || []).map(function (sg) {
        return { id: 'seg_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8), label: sg.label || '', labelHidden: sg.labelHidden !== false, customColor: sg.customColor || null };
      }),
      collapsed: false
    };
    idMap.set(t2.id, copy.id);
    return { src: t2, copy: copy };
  });
  // 第二遍：补 parentId（子树内映射）与 endNodeId（克隆末端节点树）
  copies.forEach(function (it) {
    if (it.src.parentId && idMap.has(it.src.parentId)) it.copy.parentId = idMap.get(it.src.parentId);
    if (it.src.endNodeId) {
      const nid = cloneNode(it.src.endNodeId);
      if (nid) it.copy.endNodeId = nid;
    }
    inst.data.trunks.push(it.copy);
  });
  setHint(inst, '已复制鱼骨图');
  _markChanged(inst);
}
// 删除整张鱼骨图：确认后删子树干线 + 末端节点及其树后代（与 2D deleteFishboneTree 一致）
function _fbDeleteTree(inst, trunk) {
  const subtree = _fbSubtree(inst, trunk);
  const nodeIds = new Set();
  subtree.forEach(function (t2) {
    if (!t2.endNodeId) return;
    nodeIds.add(t2.endNodeId);
    const n = _findById(inst.data.roots, t2.endNodeId);
    if (n) _walk(n, function (c) { nodeIds.add(c.id); });
  });
  const msg = nodeIds.size
    ? '确定删除该鱼骨图吗？<br>（' + subtree.length + ' 条干线、' + nodeIds.size + ' 个节点及其内容）'
    : '确定删除该鱼骨图吗？<br>（' + subtree.length + ' 条干线）';
  // 应用内确认框（与 2D showConfirm 同款，替代原生 confirm）
  showConfirm(msg, function () {
    const ids = new Set(subtree.map(function (t2) { return t2.id; }));
    inst.data.trunks = inst.data.trunks.filter(function (t2) { return !ids.has(t2.id); });
    const removeNodes = function (list) {
      for (let i = list.length - 1; i >= 0; i--) {
        if (nodeIds.has(list[i].id)) { list.splice(i, 1); continue; }
        if (list[i].children) removeNodes(list[i].children);
      }
    };
    removeNodes(inst.data.roots);
    _pruneGroups(inst);   // 清理群组绑定
    if (inst.selectedSeg && ids.has(inst.selectedSeg.trunkId)) inst.selectedSeg = null;
    if (inst.selectedId && nodeIds.has(inst.selectedId)) inst.selectedId = null;
    setHint(inst, '已删除鱼骨图');
    _markChanged(inst);
  }, null, '删除鱼骨图');
}
// 变成支路：近端投影吸附到目标干线，写入 parentId（endNodeId 分支固定起点端）
function _fbAttachTo(inst, target) {
  const src = _fbFind(inst, inst.attachSrc);
  if (!src || src.id === target.id) return;
  const pts = src.points || [];
  if (pts.length < 2) return;
  let idx = 0;
  if (!src.endNodeId) {
    const p0 = _fbProject(inst, target.id, pts[0].x, pts[0].y);
    const pl = _fbProject(inst, target.id, pts[pts.length - 1].x, pts[pts.length - 1].y);
    if (p0 && pl && pl.d < p0.d) idx = pts.length - 1;
  }
  const proj = _fbProject(inst, target.id, pts[idx].x, pts[idx].y);
  if (!proj) return;
  pts[idx] = { x: proj.x, y: proj.y };
  src.parentId = target.id;
  delete src.detached;
  setHint(inst, '已挂载为支路');
  _markChanged(inst);
}
// 新建节点：松手点 = 节点左边缘中点；分支线起点吸附线上，endNodeId 标记连接
function _fbCommitNodeCreate(inst, hit, end) {
  if (!hit) return;
  const n = { id: _genId(), text: '新节点', x: 0, y: 0, seed: Math.random(), children: [] };
  inst.data.roots.push(n);
  const sz = _measureNode(n);
  n.x = end.x + sz.w / 2;
  n.y = end.y;
  inst.data.trunks.push({
    id: _fbNewTrunkId(),
    points: [{ x: hit.point.x, y: hit.point.y }, { x: end.x, y: end.y }],
    segs: [_fbNewSeg()],
    parentId: hit.trunkId,
    endNodeId: n.id
  });
  setHint(inst, '已创建鱼骨节点');
  _markChanged(inst);
}

export {
  _fbNewTrunkId, _fbNewSeg, _fbToggleCollapse, _fbDeleteSeg, _fbDuplicateTree,
  _fbDeleteTree, _fbAttachTo, _fbCommitNodeCreate
};
