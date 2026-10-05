// ============================================================
//  mindmap-embed/events.js — 交互事件
//  - bindEvents(inst)：仅在 interactive 实例上由 _mount 调用
//  - 指针事件：节点拖拽 / 平移缩放 / 干线绘制与分支 / 端点拖拽（滑动/旋转缩放）/
//    线体拖动 / 群组框选·拖动·缩放 / 快速创建按钮
//  - 滚轮缩放、双击（加子节点/改名/编辑连线标签）、键盘（Esc/Delete）
//  - 右键菜单分发（节点/线段/群组/空白）
// ============================================================

import { toWorld, setHint } from './share.js';
import { _walk, _findById, _walkVisible, _fbHidden, _fbSubtree, _fbSubtreeNodes, _fbProject, _fbArc, _fbPointAtArc, _fbFind } from './data.js';
import { _fbNewTrunkId, _fbNewSeg, _fbAttachTo, _fbCommitNodeCreate, _fbDeleteSeg } from './fishbone.js';
import { _hitGroup, _hitGroupHandle, _groups, _commitGroup, _markChanged, _resetMode, arrangeTree, _rootOf, addChild, renameNode, editEdgeLabel, removeNode } from './ops.js';
import { hitTest, hitSeg, hitEdge, _fbHitEndpoint, _fbSnapSeg } from './hit.js';
import { hideMenu, showNodeMenu, showSegMenu, showGroupMenu, showBlankMenu } from './menus.js';
import { _hitQuickAdd } from './draw.js';
import { _measureNode } from './layout.js';

// ── 交互事件 ──
export function bindEvents(inst) {
  const canvas = inst.canvas;
  let drag = null;

  // 保险：禁止任何原生拖拽（contenteditable 里拖出半透明脑图拖影）
  canvas.addEventListener('dragstart', function (e) { e.preventDefault(); });

  canvas.addEventListener('pointerdown', function (e) {
    if (e.button !== 0 && e.button !== 2) return;
    hideMenu(inst);
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const w = toWorld(inst, mx, my);
    canvas.focus();
    // 左键按下阻止默认行为：防止 contenteditable 从画布启动选区→原生拖拽拖影
    if (e.button === 0) e.preventDefault();
    e.stopPropagation();

    // 模式处理
    if (inst.mode === 'drawSeg') {
      if (e.button === 0) {
        if (inst.branchFrom) {
          // 分支绘制：起点必须落在线上（吸附投影点，与 2D branchHit 一致）
          const snap = _fbSnapSeg(inst, w.x, w.y);
          if (!snap) { inst.segStart = null; inst.branchHit = null; return; }
          inst.segStart = snap.point;
          inst.branchHit = { trunkId: snap.trunk.id, segIndex: snap.segIndex, t: snap.t, point: snap.point };
          drag = { mode: 'draw', _cx: e.clientX, _cy: e.clientY };
        } else {
          // 主干绘制：一次会话一条干线（接续/跳线点并入同一折线，与 2D 一致）
          inst.segStart = { x: w.x, y: w.y };
          inst.branchHit = null;
          drag = { mode: 'draw', _cx: e.clientX, _cy: e.clientY };
        }
      }
      else _resetMode(inst);
      return;
    }
    if (inst.mode === 'nodeCreate') {
      // 节点创建：线上按下选起点，拖到空白松手（一次性模式）
      if (e.button === 0) {
        const snap = _fbSnapSeg(inst, w.x, w.y);
        if (!snap) { inst.segStart = null; inst.branchHit = null; return; }
        inst.segStart = snap.point;
        inst.branchHit = { trunkId: snap.trunk.id, segIndex: snap.segIndex, t: snap.t, point: snap.point };
        drag = { mode: 'draw', _cx: e.clientX, _cy: e.clientY };
      }
      else _resetMode(inst);
      return;
    }
    if (inst.mode === 'groupCreate') {
      // 框选新建群组：按住左键拖出矩形，松手创建（Esc / 右键取消）
      if (e.button === 0) {
        inst._groupBox = { startW: { x: w.x, y: w.y }, curW: { x: w.x, y: w.y }, moved: false };
        drag = { mode: 'groupBox', startX: mx, startY: my };
      } else _resetMode(inst);
      return;
    }
    if (inst.mode === 'attach') {
      // 变成支路：点击目标线段完成挂载；Esc / 右键取消
      if (e.button === 0) {
        const fh = hitSeg(inst, w.x, w.y);
        if (fh && fh.trunk.id !== inst.attachSrc) _fbAttachTo(inst, fh.trunk);
        _resetMode(inst);
      } else _resetMode(inst);
      return;
    }
    if (inst.mode === 'addEdge' || inst.mode === 'attachParent') {
      const hit = hitTest(inst, w.x, w.y);
      if (hit && hit.id !== inst.modeFrom.id) {
        if (inst.mode === 'addEdge') {
          inst.data.edges.push({ a: inst.modeFrom.id, b: hit.id });
        } else {
          // 变成子节点：根节点挂到目标节点下
          inst.data.roots = inst.data.roots.filter(function (r) { return r.id !== inst.modeFrom.id; });
          hit.children.push(inst.modeFrom);
          if (hit.collapsed) hit.collapsed = false;
          arrangeTree(inst, _rootOf(inst, hit));   // 与 2D 一致：挂载后自动重排所在子树
        }
        _markChanged(inst);
      }
      _resetMode(inst);
      return;
    }
    if (inst.mode === 'delEdge') {
      const idx = hitEdge(inst, w.x, w.y);
      if (idx >= 0) { inst.data.edges.splice(idx, 1); _markChanged(inst); }
      else if (e.button === 2) _resetMode(inst);
      return;
    }

    const hit = hitTest(inst, w.x, w.y);
    if (e.button === 2) {
      // 主干线段右键 → 线段菜单（节点优先级高于线段）
      if (!hit) {
        const fh = hitSeg(inst, w.x, w.y);
        if (fh) {
          inst.selectedSeg = { trunkId: fh.trunk.id, segIndex: fh.segIndex };
          inst.selectedId = null;
          showSegMenu(inst, fh, e.clientX, e.clientY);
          return;
        }
        // 群组本体右键 → 群组菜单（节点/线段之下）
        const grp = _hitGroup(inst, w.x, w.y);
        if (grp) {
          inst.selectedGroupId = grp.id;
          inst.selectedId = null;
          inst.selectedSeg = null;
          showGroupMenu(inst, grp, e.clientX, e.clientY);
          return;
        }
      }
      if (hit) { inst.selectedId = hit.id; inst.selectedSeg = null; showNodeMenu(inst, hit, e.clientX, e.clientY); }
      else { inst.selectedId = null; inst.selectedSeg = null; showBlankMenu(inst, w.x, w.y, e.clientX, e.clientY); }
      return;
    }
    // 选中群组的角把手 → 拖拽缩放群组（左键，优先于节点/空白，与 2D 一致）
    if (e.button === 0 && !drag && inst.selectedGroupId) {
      const selG = _groups(inst).find(function (g) { return g.id === inst.selectedGroupId; });
      const corner = selG ? _hitGroupHandle(inst, selG, w.x, w.y) : null;
      if (corner) {
        inst.selectedId = null;
        inst.selectedSeg = null;
        drag = { mode: 'groupResize', gr: selG, corner: corner, startX: mx, startY: my, startSX: mx, startSY: my,
                 ox: selG.x, oy: selG.y, ow: selG.w, oh: selG.h, moved: false };
      }
    }
    // 悬停快速创建按钮：点按即建子节点（与 2D 一致：右＋文本子 / 下＋步骤子）
    if (hit && !drag) {
      const qa = _hitQuickAdd(hit, w.x, w.y);
      if (qa) {
        // 防抖：双击/按键抖动 350ms 内只加一次，避免一下子出现两个子节点
        const now = performance.now();
        if (inst._qaTime && now - inst._qaTime < 350) return;
        inst._qaTime = now;
        addChild(inst, hit, qa);
        return;
      }
    }
    if (hit && !drag) {
      inst.selectedGroupId = null;   // 点节点取消群组选中（与 2D setSelectedGroupRectId(null) 一致）
      inst.selectedId = hit.id;
      inst.selectedSeg = null;
      const subtree = [];
      _walk(hit, function (n) { subtree.push({ n, ox: n.x, oy: n.y }); });
      drag = { mode: 'node', startX: mx, startY: my, subtree, moved: false };
    } else if (!drag) {
      // 空白处：点击别处取消选中状态
      inst.selectedId = null;
      // 端点优先：拖端点（分支起点沿线滑动 / 自由端旋转缩放子树，与 2D fishboneEdit 一致）
      const ep = _fbHitEndpoint(inst, w.x, w.y);
      if (ep) {
        drag = { mode: 'segPoint', trunk: ep.trunk, pointIndex: ep.pointIndex, moved: false, startX: mx, startY: my };
        const pts = ep.trunk.points;
        const pt = pts[ep.pointIndex];
        if (ep.trunk.parentId && ep.pointIndex === 0) {
          // 分支起点端 → 锁定父干线滑动
          drag.slide = { onTrunkId: ep.trunk.parentId };
        } else {
          // 自由端 → 绕另一端锚点旋转+等比缩放，子树（干线+节点）刚体跟随
          const anchorIdx = ep.pointIndex === 0 ? pts.length - 1 : 0;
          const sub = _fbSubtree(inst, ep.trunk);
          drag.rot = {
            origin: { x: pt.x, y: pt.y },
            anchor: { x: pts[anchorIdx].x, y: pts[anchorIdx].y },
            trunks: sub.map(function (tk) {
              return { t: tk, pts: (tk.points || []).map(function (p) { return { x: p.x, y: p.y }; }) };
            }),
            nodes: [..._fbSubtreeNodes(inst, sub)].map(function (id) {
              const n = _findById(inst.data.roots, id);
              if (!n) return null;
              const sz = _measureNode(n);
              return { n: n, ax: n.x - sz.w / 2, ay: n.y, hw: sz.w / 2 };
            }).filter(Boolean)
          };
        }
      } else {
        const fh = hitSeg(inst, w.x, w.y);
        if (fh) {
          inst.selectedSeg = { trunkId: fh.trunk.id, segIndex: fh.segIndex };
          inst.selectedId = null;
          // 拖线体：有父干线 → 沿线滑动（弧长钳位）；根干路 → 自由平移整棵子树
          const sub = _fbSubtree(inst, fh.trunk);
          drag = { mode: 'segTranslate', startW: { x: w.x, y: w.y }, moved: false, startX: mx, startY: my };
          drag.trunks = sub.map(function (tk) {
            return { t: tk, pts: (tk.points || []).map(function (p) { return { x: p.x, y: p.y }; }) };
          });
          drag.nodes = [..._fbSubtreeNodes(inst, sub)].map(function (id) {
            const n = _findById(inst.data.roots, id);
            return n ? { n: n, ax: n.x, ay: n.y } : null;
          }).filter(Boolean);
          if (fh.trunk.parentId) {
            // 按压段与父干线的贴合状态 → 切向单位向量 + 起始弧长
            const startPt = fh.trunk.points[0];
            const proj = _fbProject(inst, fh.trunk.parentId, startPt.x, startPt.y);
            if (proj) {
              const par = _fbFind(inst, fh.trunk.parentId);
              const arc = _fbArc(par);
              const a = arc.pts[proj.segIndex], b = arc.pts[proj.segIndex + 1];
              const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
              drag.slide = {
                arc: arc,
                s0: arc.cum[proj.segIndex] + proj.t * (arc.cum[proj.segIndex + 1] - arc.cum[proj.segIndex]),
                tx: (b.x - a.x) / len, ty: (b.y - a.y) / len,
                proj0: { x: proj.x, y: proj.y }
              };
            }
          }
        } else {
          // 群组本体命中 → 选中并拖动群组（绑定节点跟随，与 2D 一致）；否则空白平移
          const grp = _hitGroup(inst, w.x, w.y);
          if (grp) {
            inst.selectedGroupId = grp.id;
            inst.selectedSeg = null;
            drag = { mode: 'groupDrag', gr: grp, startX: mx, startY: my, startW: { x: w.x, y: w.y }, moved: false };
            canvas.style.cursor = 'move';
          } else {
            inst.selectedGroupId = null;   // 点击空白取消群组选中
            inst.selectedSeg = null;
            drag = { mode: 'pan', startX: mx, startY: my, origX: inst.view.x, origY: inst.view.y };
            canvas.style.cursor = 'grabbing';
          }
        }
      }
    }
    inst._dragging = true;
    inst.hoverId = null; inst._qaHover = null;
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', function (e) {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const w = toWorld(inst, mx, my);
    if ((inst.mode === 'drawSeg' || inst.mode === 'nodeCreate') && inst.segStart) inst._segCursor = { x: w.x, y: w.y };
    if (!drag) {
      if (!inst.mode) {
        // 悬停跟踪：显示快速创建按钮（与 2D hoveredNodeId 一致）
        const h = hitTest(inst, w.x, w.y);
        inst.hoverId = h ? h.id : null;
        inst._qaHover = h ? _hitQuickAdd(h, w.x, w.y) : null;
        canvas.style.cursor = inst._qaHover ? 'pointer' : (h ? 'move' : 'default');
      }
      return;
    }
    e.stopPropagation();
    const dx = mx - drag.startX, dy = my - drag.startY;
    if (drag.mode === 'pan') {
      inst.view.x = drag.origX + dx;
      inst.view.y = drag.origY + dy;
    } else if (drag.mode === 'node') {
      if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
      const s = inst.view.scale;
      drag.subtree.forEach(function (it) {
        it.n.x = it.ox + dx / s;
        it.n.y = it.oy + dy / s;
      });
      if (inst._renameSync) inst._renameSync();
    } else if (drag.mode === 'segPoint') {
      // 拖端点：分支起点沿父干线滑动 / 自由端绕锚点旋转+等比缩放（子树刚体跟随）
      const pt = drag.trunk.points[drag.pointIndex];
      if (!pt) return;
      if (drag.slide) {
        const on = _fbProject(inst, drag.slide.onTrunkId, w.x, w.y);
        if (on) {
          if (!drag.moved && Math.hypot(on.x - pt.x, on.y - pt.y) > 0.5) drag.moved = true;
          pt.x = on.x; pt.y = on.y;
        }
      } else if (drag.rot) {
        const R = drag.rot;
        if (!drag.moved && Math.hypot(w.x - R.origin.x, w.y - R.origin.y) > 1 / inst.view.scale) drag.moved = true;
        const A = R.anchor;
        const s0 = Math.hypot(R.origin.x - A.x, R.origin.y - A.y);
        const s1 = Math.hypot(w.x - A.x, w.y - A.y);
        if (s0 > 1e-6 && s1 > 1e-6) {
          // 相似变换：P' = A + scale·R(θ)·(P−A)，干线/子支/节点整体刚体跟随
          const scale = s1 / s0;
          const rot = Math.atan2(w.y - A.y, w.x - A.x) - Math.atan2(R.origin.y - A.y, R.origin.x - A.x);
          const cos = Math.cos(rot), sin = Math.sin(rot);
          const xf = function (px, py) {
            return {
              x: A.x + scale * (cos * (px - A.x) - sin * (py - A.y)),
              y: A.y + scale * (sin * (px - A.x) + cos * (py - A.y))
            };
          };
          R.trunks.forEach(function (sn) {
            sn.t.points = sn.pts.map(function (p) { return xf(p.x, p.y); });
          });
          R.nodes.forEach(function (ns) {
            const q = xf(ns.ax, ns.ay);
            ns.n.x = q.x + ns.hw; ns.n.y = q.y;
          });
        }
      }
    } else if (drag.mode === 'segTranslate') {
      // 拖线体：有父干线 → 沿线滑动（切向位移映射弧长，钳位 [0, 总长]）；根干路 → 自由平移子树
      let dx, dy;
      if (drag.slide) {
        const sl = drag.slide;
        const along = (w.x - drag.startW.x) * sl.tx + (w.y - drag.startW.y) * sl.ty;
        const sp = Math.max(0, Math.min(sl.arc.total, sl.s0 + along));
        const proj = _fbPointAtArc(sl.arc, sp);
        dx = proj.x - sl.proj0.x; dy = proj.y - sl.proj0.y;
      } else {
        dx = w.x - drag.startW.x; dy = w.y - drag.startW.y;
      }
      if (!drag.moved && Math.hypot(dx, dy) > 4 / inst.view.scale) drag.moved = true;
      if (drag.moved) {
        drag.trunks.forEach(function (sn) {
          sn.t.points = sn.pts.map(function (p) { return { x: p.x + dx, y: p.y + dy }; });
        });
        drag.nodes.forEach(function (ns) {
          ns.n.x = ns.ax + dx; ns.n.y = ns.ay + dy;
        });
      }
    } else if (drag.mode === 'groupBox') {
      // 群组框选：更新预览矩形 + 提示已框住节点数
      const gb = inst._groupBox;
      if (!gb) return;
      gb.curW = { x: w.x, y: w.y };
      if (!gb.moved && Math.abs(mx - drag.startX) + Math.abs(my - drag.startY) > 3) gb.moved = true;
      if (gb.moved) {
        const bx = Math.min(gb.startW.x, gb.curW.x), by = Math.min(gb.startW.y, gb.curW.y);
        const bw = Math.abs(gb.curW.x - gb.startW.x), bh = Math.abs(gb.curW.y - gb.startW.y);
        let cnt = 0;
        const fbn = _fbHidden(inst).nodes;
        inst.data.roots.forEach(function (r) {
          _walkVisible(r, function (n) {
            if (!fbn.has(n.id) && n.x >= bx && n.x <= bx + bw && n.y >= by && n.y <= by + bh) cnt++;
          });
        });
        setHint(inst, '框选群组中：已框住 ' + cnt + ' 个节点，松手创建（Esc 取消）');
      }
    } else if (drag.mode === 'groupDrag') {
      // 拖动群组：框体 + 绑定节点整体位移（与 2D isGroupDragging 一致）
      if (!drag.gr) return;
      const gdx = w.x - drag.startW.x, gdy = w.y - drag.startW.y;
      if (!drag.moved && Math.hypot(gdx, gdy) > 4 / inst.view.scale) drag.moved = true;
      if (drag.moved) {
        drag.gr.x += gdx; drag.gr.y += gdy;
        (drag.gr.nodeIds || []).forEach(function (id) {
          const n = _findById(inst.data.roots, id);
          if (n) { n.x += gdx; n.y += gdy; }
        });
        if (inst._renameSync) inst._renameSync();
        drag.startW = { x: w.x, y: w.y };
      }
    } else if (drag.mode === 'groupResize') {
      // 角把手缩放：nw/ne/sw/se 四角语义 + 最小 20（与 2D isGroupResizing 一致）
      const g = drag.gr;
      if (!g) return;
      const sc = inst.view.scale;
      const dx = (mx - drag.startSX) / sc, dy = (my - drag.startSY) / sc;
      const MIN = 20;
      if (!drag.moved && Math.hypot(dx, dy) > 2) drag.moved = true;
      if (drag.corner === 'nw') {
        g.w = Math.max(MIN, drag.ow - dx); g.h = Math.max(MIN, drag.oh - dy);
        g.x = drag.ox + drag.ow - g.w; g.y = drag.oy + drag.oh - g.h;
      } else if (drag.corner === 'ne') {
        g.w = Math.max(MIN, drag.ow + dx); g.h = Math.max(MIN, drag.oh - dy);
        g.x = drag.ox; g.y = drag.oy + drag.oh - g.h;
      } else if (drag.corner === 'sw') {
        g.w = Math.max(MIN, drag.ow - dx); g.h = Math.max(MIN, drag.oh + dy);
        g.x = drag.ox + drag.ow - g.w; g.y = drag.oy;
      } else {
        g.w = Math.max(MIN, drag.ow + dx); g.h = Math.max(MIN, drag.oh + dy);
        g.x = drag.ox; g.y = drag.oy;
      }
    }
    // drawSeg 预览由 _segCursor 处理
  });

  canvas.addEventListener('pointerup', function (e) {
    if (!drag) return;
    e.stopPropagation();
    inst._dragging = false;
    const rect = canvas.getBoundingClientRect();
    if (drag.mode === 'draw') {
      const w = toWorld(inst, e.clientX - rect.left, e.clientY - rect.top);
      const st = inst.segStart;
      const movedPx = Math.hypot(e.clientX - drag._cx, e.clientY - drag._cy);
      if (st && movedPx >= 4 && Math.hypot(w.x - st.x, w.y - st.y) >= 1) {
        if (inst.mode === 'nodeCreate') {
          // 节点创建：松手点 = 新节点左边缘中点，分支线 endNodeId 标记连接；一次性模式
          _fbCommitNodeCreate(inst, inst.branchHit, w);
          _resetMode(inst);
        } else if (inst.branchFrom) {
          // 分支：线上吸附点 → 空白终点，parentId 挂到起点所在干线（模式保留可连续画）
          inst.data.trunks.push({
            id: _fbNewTrunkId(),
            points: [{ x: st.x, y: st.y }, { x: w.x, y: w.y }],
            segs: [_fbNewSeg()],
            parentId: inst.branchHit.trunkId
          });
          inst.segStart = null; inst.branchHit = null;
          setHint(inst, '🌿 分支绘制中：继续在线段上按下拖出（右键或 Esc 退出）');
          _markChanged(inst);
        } else {
          // 主干：接续/跳线点并入同一折线（与 2D commitSegment 一致）
          let tr = (inst._curTrunk && inst.data.trunks.includes(inst._curTrunk)) ? inst._curTrunk : null;
          if (!tr) {
            tr = { id: _fbNewTrunkId(), points: [], segs: [] };
            inst.data.trunks.push(tr);
            inst._curTrunk = tr;
          }
          const pts = tr.points;
          const last = pts[pts.length - 1];
          if (!last || Math.hypot(last.x - st.x, last.y - st.y) > 0.5) pts.push({ x: st.x, y: st.y });
          pts.push({ x: w.x, y: w.y });
          tr.segs.push(_fbNewSeg());
          setHint(inst, '主干绘制中：可继续拖画下一段（右键或 Esc 退出）');
          _markChanged(inst);
        }
      } else if (st && inst.mode === 'nodeCreate') {
        setHint(inst, '🌿 拖拽距离太短，未创建节点（在线段上重新按下并拖拽）');
      }
      inst._segCursor = null;
      drag = null;
      return;  // 绘制模式保持，可连续画；Esc/右键退出
    }
    if (drag.mode === 'groupBox') {
      // 框选松手 → 提交群组（中心点在框内的可见节点自动绑定）
      const gb = inst._groupBox;
      inst._groupBox = null;
      if (gb && gb.moved) {
        const g = _commitGroup(inst, gb.startW, gb.curW);
        if (g) setHint(inst, '群组已创建：绑定 ' + (g.nodeIds || []).length + ' 个节点（右键群组可设置）');
        else setHint(inst, '框选范围太小，未创建群组');
      }
      _resetMode(inst);
      drag = null;
      canvas.style.cursor = 'default';
      return;
    }
    if ((drag.mode === 'groupDrag' || drag.mode === 'groupResize') && drag.moved) _markChanged(inst);
    if ((drag.mode === 'segPoint' || drag.mode === 'segTranslate') && drag.moved) _markChanged(inst);
    if (drag.mode === 'node' && drag.moved) _markChanged(inst);
    drag = null;
    canvas.style.cursor = 'default';
  });

  // 移出画布清除悬停状态
  canvas.addEventListener('pointerleave', function () {
    inst.hoverId = null; inst._qaHover = null;
  });

  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    e.stopPropagation();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const w1 = toWorld(inst, mx, my);
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    inst.view.scale = Math.min(2.5, Math.max(0.3, inst.view.scale * factor));
    const w2 = toWorld(inst, mx, my);
    inst.view.x += (w2.x - w1.x) * inst.view.scale;
    inst.view.y += (w2.y - w1.y) * inst.view.scale;
    if (inst._renameSync) inst._renameSync();
  }, { passive: false });

  // 双击节点 → 加子节点；再次双击选中节点 → 改名；双击连线 → 编辑标签
  canvas.addEventListener('dblclick', function (e) {
    e.stopPropagation();
    // 快速创建刚触发过（双击加号）→ 忽略本次双击，避免再次加子节点/误开改名
    if (performance.now() - (inst._qaTime || 0) < 400) return;
    e.stopPropagation();
    const rect = canvas.getBoundingClientRect();
    const w = toWorld(inst, e.clientX - rect.left, e.clientY - rect.top);
    const hit = hitTest(inst, w.x, w.y);
    if (!hit) {
      const ei = hitEdge(inst, w.x, w.y);
      if (ei >= 0) editEdgeLabel(inst, inst.data.edges[ei]);
      return;
    }
    if (hit.id === inst.selectedId) renameNode(inst, hit);
    else { inst.selectedId = hit.id; addChild(inst, hit, 'text'); }
  });

  canvas.addEventListener('keydown', function (e) {
    e.stopPropagation();
    if (e.key === 'Escape') { _resetMode(inst); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && inst.selectedSeg) {
      // Delete 删除选中的主干线段（与 2D 删除此连线同语义）
      const tk = _fbFind(inst, inst.selectedSeg.trunkId);
      if (tk) { e.preventDefault(); _fbDeleteSeg(inst, tk, inst.selectedSeg.segIndex); }
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && inst.selectedId) {
      const n = _findById(inst.data.roots, inst.selectedId);
      if (n) { e.preventDefault(); removeNode(inst, n); }
    }
  });

  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); e.stopPropagation(); });
  canvas.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  canvas.addEventListener('mouseup', function (e) { e.stopPropagation(); });
  canvas.addEventListener('click', function (e) { e.stopPropagation(); });
}
