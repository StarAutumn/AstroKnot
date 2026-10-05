// ============================================================
//  mindmap-embed/draw.js — 绘制原语 + 主渲染循环
//  - 绘制原语：_lineColor/_nodeBorderColor/_effShape/_shapePath/_treeLinePoints/
//    _drawArrow/_drawDoubleLine/_quickAddBtn/_fbBadge/_fbNodeLeftMid
//  - _hitQuickAdd：悬停快速创建按钮命中（events 用）
//  - render(inst, t)：主渲染循环（rAF 驱动，网格/群组/鱼骨干线/连线/节点卡片/提示）
// ============================================================

import {
  MM_GRID, MM_NODE_FILL, MM_TEXT, MM_SEL_FILL, MM_SEL_TEXT, MM_STEP_COL, MM_JOINT,
  MM_SEG_SEL, MM_SEG_GLOW, MM_PREVIEW, MM_NODE_H, MM_NODE_MIN_W, MM_PEG_X, MM_PEG_Y,
  MM_QA_R, MM_QA_HIT, MM_DOUBLE_GAP, MM_STEP_DASH, MM_EDGE_DASH, MM_GDASH, MM_GH,
  MM_LINE_COLOR, _font, _hexToRgba, _nodeRect, _edgePoints, _resize, _unmount
} from './share.js';
import { _eachNode, _findById, _walkVisible, _fbHidden } from './data.js';
import { _measureNode } from './layout.js';
import { _groups, _groupHandles } from './ops.js';

// ── 连线默认色（静态亮蓝色，不呼吸）─────────────────────────
function _lineColor() { return MM_LINE_COLOR; }
function _nodeBorderColor(n, t) {
  void t;
  if (n.fixedColor) return n.fixedColor;
  // 默认：按 seed 随机分配色相，但静止不呼吸（同一节点颜色恒定，不随时间变化）
  const hue = Math.round(((n.seed || 0) * 360) % 360);
  return 'hsl(' + hue + ', 70%, 70%)';
}

// ── 几何 ─────────────────────────────────────────────────
// 生效图形：未显式设置时步骤节点默认跑道形（与 2D drawNode 一致）
function _effShape(n) { return n.shape || (n.type === 'step' ? 'stadium' : 'roundedRect'); }
// 形状路径（与 2D 节点图形选项一致）
function _shapePath(ctx, shape, r) {
  const x = r.x, y = r.y, w = r.w, h = r.h, cx = x + w / 2, cy = y + h / 2;
  if (shape === 'ellipse') {
    ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
  } else if (shape === 'diamond') {
    ctx.moveTo(cx, y); ctx.lineTo(x + w, cy); ctx.lineTo(cx, y + h); ctx.lineTo(x, cy); ctx.closePath();
  } else if (shape === 'stadium') {
    const rad = Math.min(h / 2, w / 2);
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, rad);
    else ctx.rect(x, y, w, h);
  } else {
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, Math.min(8 * (r.h / MM_NODE_H), h / 2));
    else ctx.rect(x, y, w, h);
  }
}
// 父子折线路径：普通子节点右出左入（PEG_X 拐点），步骤子节点下出上入（PEG_Y 拐点）
function _treeLinePoints(p, c) {
  const pr = _nodeRect(p), cr = _nodeRect(c);
  if (c.type === 'step') {
    const pegY = pr.y + pr.h + MM_PEG_Y;
    return [{ x: p.x, y: pr.y + pr.h }, { x: p.x, y: pegY }, { x: c.x, y: pegY }, { x: c.x, y: cr.y }];
  }
  const pegX = pr.x + pr.w + MM_PEG_X;
  return [{ x: pr.x + pr.w, y: p.y }, { x: pegX, y: p.y }, { x: pegX, y: c.y }, { x: cr.x, y: c.y }];
}
// 箭头（与 2D flushLineBatch 同参数：长 12、端点回退 4、半角 π/7）
function _drawArrow(ctx, x1, y1, x2, y2, color, alpha) {
  const arrowLen = 12;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const tipX = x2 - 4 * Math.cos(angle);
  const tipY = y2 - 4 * Math.sin(angle);
  ctx.globalAlpha = alpha === undefined ? 1 : alpha;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(tipX - arrowLen * Math.cos(angle - Math.PI / 7), tipY - arrowLen * Math.sin(angle - Math.PI / 7));
  ctx.lineTo(tipX - arrowLen * Math.cos(angle + Math.PI / 7), tipY - arrowLen * Math.sin(angle + Math.PI / 7));
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.globalAlpha = 1;
}
// 双平行线（与 Fishbone/render2d 的 _drawDoubleLine 一致，off 为世界单位）
function _drawDoubleLine(ctx, ax, ay, bx, by, off) {
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return;
  const nx = -dy / len * off, ny = dx / len * off;
  ctx.beginPath();
  ctx.moveTo(ax + nx, ay + ny); ctx.lineTo(bx + nx, by + ny);
  ctx.moveTo(ax - nx, ay - ny); ctx.lineTo(bx - nx, by - ny);
  ctx.stroke();
}
// 带圆圈的“+”快速创建按钮（与 2D node-renderers._drawQuickAddBtn 同款）
function _quickAddBtn(ctx, cx, cy, r, color, isHover, pulse) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = isHover ? 14 + pulse * 8 : 6;
  ctx.fillStyle = isHover ? color : '#0d1b24';
  ctx.strokeStyle = color;
  ctx.lineWidth = isHover ? 3 : 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = isHover ? '#0d1b24' : color;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.5, cy); ctx.lineTo(cx + r * 0.5, cy);
  ctx.moveTo(cx, cy - r * 0.5); ctx.lineTo(cx, cy + r * 0.5);
  ctx.stroke();
  ctx.restore();
}
// 快速创建按钮命中：右中=文本子节点 / 下中=步骤子节点（命中半径 8，与 2D 一致）
function _hitQuickAdd(n, wx, wy) {
  const rect = _nodeRect(n);
  if (Math.hypot(wx - (rect.x + rect.w), wy - (rect.y + rect.h / 2)) <= MM_QA_HIT) return 'text';
  if (Math.hypot(wx - (rect.x + rect.w / 2), wy - (rect.y + rect.h)) <= MM_QA_HIT) return 'step';
  return null;
}
// ⊕ 折叠标记（提示此处有收起的支路/节点，与 2D _drawCollapseBadge 一致）
function _fbBadge(ctx, x, y) {
  ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(20,40,60,0.85)'; ctx.fill();
  ctx.strokeStyle = '#8fd8ff'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 2.5, y); ctx.lineTo(x + 2.5, y);
  ctx.moveTo(x, y - 2.5); ctx.lineTo(x, y + 2.5);
  ctx.stroke();
}
// 节点左边缘中点（鱼骨分支末端连接锚点）
function _fbNodeLeftMid(n) {
  const sz = n._size || _measureNode(n);
  return { x: n.x - sz.w / 2, y: n.y };
}

// ── 渲染 ──
function render(inst, t) {
  const div = inst.div, ctx = inst.ctx, interactive = inst.interactive;
  if (inst.destroyed) return;
  inst._raf = requestAnimationFrame(function (ts) { render(inst, ts); });
  if (!div.isConnected) { _unmount(inst); return; }
  if (!inst.visible || inst.vw === undefined) return;
  _resize(inst);
  const s = inst.view.scale;

  ctx.fillStyle = inst.data.bg || inst.defBg;
  ctx.fillRect(0, 0, inst.vw, inst.vh);
  const grid = 40 * s;
  if (inst.data.gridVisible !== false && grid > 8) {
    ctx.strokeStyle = inst.data.gridColor || MM_GRID;
    ctx.lineWidth = 0.5 * s;   // 世界坐标 0.5 宽（与 2D 一致）
    ctx.beginPath();
    const ox = inst.view.x % grid, oy = inst.view.y % grid;
    for (let x = ox; x < inst.vw; x += grid) { ctx.moveTo(x, 0); ctx.lineTo(x, inst.vh); }
    for (let y = oy; y < inst.vh; y += grid) { ctx.moveTo(0, y); ctx.lineTo(inst.vw, y); }
    ctx.stroke();
  }

  ctx.save();
  ctx.translate(inst.view.x, inst.view.y);
  ctx.scale(s, s);

  _eachNode(inst.data.roots, function (n) { n._size = _measureNode(n); });

  // 群组矩形：填充 + 虚线边框 + 名称标签（与 2D drawGroupRects 同款，画在干线/节点之下）
  _groups(inst).forEach(function (g) {
    ctx.save();
    ctx.fillStyle = _hexToRgba(g.fillColor || '#4a3c7e', g.fillOpacity !== undefined ? g.fillOpacity : 0.25);
    ctx.strokeStyle = g.borderColor || '#7a6aae';
    ctx.lineWidth = g.lineWidth !== undefined ? g.lineWidth : 1.5;
    ctx.setLineDash(MM_GDASH[g.lineStyle] || [6, 4]);
    const gr = g.borderRadius || 0;
    ctx.beginPath();
    if (gr > 0) ctx.roundRect(g.x, g.y, g.w, g.h, gr); else ctx.rect(g.x, g.y, g.w, g.h);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    if (g.name) {
      ctx.save();
      ctx.font = '13px system-ui, sans-serif';
      const labelW = ctx.measureText(g.name).width + 12;
      ctx.fillStyle = _hexToRgba(g.borderColor || '#7a6aae', 0.85);
      ctx.beginPath();
      ctx.roundRect(g.x + 4, g.y + 4, labelW, 20, 4);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(g.name, g.x + 10, g.y + 14);
      ctx.restore();
    }
  });
  // 选中群组的四角把手（#aef0ff 方块，与 2D drawSelectedGroupHandles 一致）
  const selGrp = inst.selectedGroupId ? _groups(inst).find(function (g) { return g.id === inst.selectedGroupId; }) : null;
  if (selGrp) {
    const hs = MM_GH / s;
    const hsMap = _groupHandles(inst, selGrp);
    for (const corner in hsMap) {
      const hp = hsMap[corner];
      ctx.fillStyle = '#aef0ff';
      ctx.strokeStyle = '#2c6e7e';
      ctx.lineWidth = 1.5 / s;
      ctx.fillRect(hp.x, hp.y, hs, hs);
      ctx.strokeRect(hp.x, hp.y, hs, hs);
    }
  }
  // 群组框选拖拽预览（紫色虚线框，与 2D 框选观感一致）
  if (inst._groupBox && inst._groupBox.moved) {
    const gb = inst._groupBox;
    const bx = Math.min(gb.startW.x, gb.curW.x), by = Math.min(gb.startW.y, gb.curW.y);
    const bw = Math.abs(gb.curW.x - gb.startW.x), bh = Math.abs(gb.curW.y - gb.startW.y);
    ctx.save();
    ctx.fillStyle = 'rgba(122,106,174,0.12)';
    ctx.strokeStyle = '#7a6aae';
    ctx.lineWidth = 1.5 / s;
    ctx.setLineDash([6 / s, 4 / s]);
    ctx.beginPath();
    ctx.rect(bx, by, bw, bh);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // 鱼骨干线：双平行线 + 自定义色/静态亮蓝 + 接缝圆点 + 折叠徽标（与 Fishbone/render2d 一致）
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // 折叠/展开动画推进（300ms 渐变，与 2D 同款；过期条目自动清理）
  inst._fbAnims.forEach(function (a, id) {
    const p = Math.min(1, (t - a.t0) / 300);
    a.progress = a.dir === 'expand' ? p : 1 - p;
    if (p >= 1) inst._fbAnims.delete(id);
  });
  // 节点连线同步：endNodeId 干线末点每帧跟随节点左边缘中点（拖节点后线跟随）
  inst.data.trunks.forEach(function (tr) {
    if (!tr.endNodeId) return;
    const n = _findById(inst.data.roots, tr.endNodeId);
    const pts = tr.points || [];
    if (!n || pts.length < 2) return;
    const np = _fbNodeLeftMid(n);
    const last = pts[pts.length - 1];
    if (Math.hypot(last.x - np.x, last.y - np.y) > 0.001) { last.x = np.x; last.y = np.y; }
  });
  const fbHide = _fbHidden(inst);
  ctx.lineWidth = 2;
  ctx.fillStyle = MM_JOINT;
  inst.data.trunks.forEach(function (tr) {
    const pts = tr.points || [];
    if (pts.length < 2) return;
    const anim = inst._fbAnims.get(tr.id);
    if (fbHide.trunks.has(tr.id) && !anim) return;   // 被折叠隐藏的子支（动画期间渐隐）
    ctx.globalAlpha = anim ? Math.max(0, Math.min(1, anim.progress)) : 1;
    for (let i = 0; i < pts.length - 1; i++) {
      const sg = tr.segs[i];
      ctx.strokeStyle = (sg && sg.customColor) ? sg.customColor : _lineColor();
      _drawDoubleLine(ctx, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, MM_DOUBLE_GAP / s);
      // 选中段：黄色高亮（中心辉光 + 双实线，与 2D selectedSeg 一致）
      if (inst.selectedSeg && inst.selectedSeg.trunkId === tr.id && inst.selectedSeg.segIndex === i) {
        ctx.strokeStyle = MM_SEG_GLOW;
        ctx.lineWidth = 9 / s;
        ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[i + 1].x, pts[i + 1].y); ctx.stroke();
        ctx.strokeStyle = MM_SEG_SEL;
        ctx.lineWidth = 3 / s;
        _drawDoubleLine(ctx, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, MM_DOUBLE_GAP / s);
        ctx.lineWidth = 2;
        // 两端亮点：提示端点可拖拽
        ctx.fillStyle = '#fff3c4';
        ctx.beginPath(); ctx.arc(pts[i].x, pts[i].y, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(pts[i + 1].x, pts[i + 1].y, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = MM_JOINT;
      }
    }
    // 分段节点圆点：干线两端稍大（提示可拖拽改向改长；endNodeId 终点除外）、中间接缝 3px
    for (let i = 0; i < pts.length; i++) {
      const isDraggableEnd = (i === 0 || i === pts.length - 1) && !(tr.endNodeId && i === pts.length - 1);
      ctx.beginPath();
      ctx.arc(pts[i].x, pts[i].y, isDraggableEnd ? 4 : 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // 段标签：画在段中点上方（样式与普通连线 2D 标签一致）
    ctx.fillStyle = '#ffd966';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < tr.segs.length && i < pts.length - 1; i++) {
      const sg = tr.segs[i];
      if (sg && sg.label && sg.labelHidden !== true) {
        ctx.fillText(sg.label, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2 - 8);
      }
    }
    ctx.globalAlpha = 1;
  });
  // 折叠标记 ⊕：折叠干线的子支附着点 + 被隐藏末端节点的连接点（提示可展开）
  inst.data.trunks.forEach(function (tr) {
    if (!tr.collapsed || fbHide.trunks.has(tr.id)) return;
    inst.data.trunks.forEach(function (c) {
      if (c.parentId !== tr.id) return;
      const sp = c.points && c.points[0];
      if (sp) _fbBadge(ctx, sp.x, sp.y);
    });
    const epts = tr.points;
    if (tr.endNodeId && epts && epts.length >= 2 && fbHide.nodes.has(tr.endNodeId)) {
      const ep = epts[epts.length - 1];
      _fbBadge(ctx, ep.x, ep.y);
    }
  });
  ctx.lineWidth = 2; ctx.fillStyle = MM_JOINT;
  // 主干绘制预览：分段接续引导线（上一段终点 → 本段起点，不重合时）+ 本段虚线
  if (inst.mode === 'drawSeg' && !inst.branchFrom && inst.segStart && inst._segCursor) {
    ctx.strokeStyle = MM_PREVIEW;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    const curPts = inst._curTrunk ? (inst._curTrunk.points || []) : [];
    const lastP = curPts[curPts.length - 1];
    if (lastP && Math.hypot(lastP.x - inst.segStart.x, lastP.y - inst.segStart.y) > 0.5) {
      ctx.beginPath(); ctx.moveTo(lastP.x, lastP.y); ctx.lineTo(inst.segStart.x, inst.segStart.y); ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(inst.segStart.x, inst.segStart.y);
    ctx.lineTo(inst._segCursor.x, inst._segCursor.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // 分支/节点创建预览：线上吸附起点圆点 + 起点至鼠标虚线（节点创建另加节点虚线框）
  if (inst.branchHit && inst._segCursor && (inst.branchFrom || inst.mode === 'nodeCreate')) {
    const sp = inst.branchHit.point;
    ctx.strokeStyle = MM_PREVIEW;
    ctx.fillStyle = MM_PREVIEW;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(sp.x, sp.y); ctx.lineTo(inst._segCursor.x, inst._segCursor.y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(sp.x, sp.y, 4.5, 0, Math.PI * 2); ctx.fill();
    // 节点创建模式：预览节点圆角虚线框（松手点 = 节点左边缘中点）
    if (inst.mode === 'nodeCreate') {
      const h = MM_NODE_H, w2 = MM_NODE_MIN_W;
      const x0 = inst._segCursor.x, y0 = inst._segCursor.y - h / 2;
      const r = 8;
      ctx.strokeStyle = '#9fe6a0';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(x0 + r, y0);
      ctx.arcTo(x0 + w2, y0, x0 + w2, y0 + h, r);
      ctx.arcTo(x0 + w2, y0 + h, x0, y0 + h, r);
      ctx.arcTo(x0, y0 + h, x0, y0, r);
      ctx.arcTo(x0, y0, x0 + w2, y0, r);
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  ctx.restore();

  // 自由连线：静态亮蓝虚线 [6,4] + 箭头（与 2D cross edge 一致）
  const lineColor = _lineColor();
  ctx.lineWidth = 2;
  ctx.strokeStyle = lineColor;
  ctx.setLineDash(MM_EDGE_DASH);
  inst.data.edges.forEach(function (e) {
    const na = _findById(inst.data.roots, e.a), nb = _findById(inst.data.roots, e.b);
    if (!na || !nb) return;
    const p = _edgePoints(na, nb);
    ctx.beginPath(); ctx.moveTo(p.x1, p.y1); ctx.lineTo(p.x2, p.y2); ctx.stroke();
    _drawArrow(ctx, p.x1, p.y1, p.x2, p.y2, lineColor);
    // 连线标签：中点上方 8px（与 2D cross edge 标签同款 #ffd966 / 11px）
    if (e.label) {
      ctx.fillStyle = '#ffd966';
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(e.label, (p.x1 + p.x2) / 2, (p.y1 + p.y2) / 2 - 8);
    }
  });
  ctx.setLineDash([]);

  // 父子连线：折线（普通右出左入 / 步骤下出上入）+ 箭头，静态亮蓝，
  // 步骤连线虚线 [8,3,2,3]（与 2D drawTreeRecursive 一致）
  ctx.lineWidth = 2;
  ctx.strokeStyle = lineColor;
  inst.data.roots.forEach(function (r) {
    _walkVisible(r, function (n) {
      if (n.collapsed) return;
      n.children.forEach(function (c) {
        const pts = _treeLinePoints(n, c);
        ctx.setLineDash(c.type === 'step' ? MM_STEP_DASH : []);
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
        const lp = pts[pts.length - 1], pp = pts[pts.length - 2];
        _drawArrow(ctx, pp.x, pp.y, lp.x, lp.y, lineColor);
      });
    });
  });
  ctx.setLineDash([]);

  // 节点卡片（与 2D drawNode 一致：金底选中描边原色、无投影；步骤节点默认跑道形）
  inst.data.roots.forEach(function (r) {
    _walkVisible(r, function (n) {
      // 被鱼骨折叠隐藏的节点：跳过（动画期间按进度渐隐，与 2D getNodeVisibilityAlpha 一致）
      const fbn = inst._fbAnims.get(n.id);
      if (fbHide.nodes.has(n.id) && !fbn) return;
      const nAlpha = fbn ? Math.max(0, Math.min(1, fbn.progress)) : 1;
      if (nAlpha <= 0.01) return;
      const rect = _nodeRect(n);
      const isSel = n.id === inst.selectedId;
      ctx.save();
      ctx.globalAlpha = nAlpha;
      ctx.fillStyle = isSel ? MM_SEL_FILL : MM_NODE_FILL;
      ctx.strokeStyle = _nodeBorderColor(n, t);
      ctx.lineWidth = 2;
      ctx.beginPath();
      _shapePath(ctx, _effShape(n), rect);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = isSel ? MM_SEL_TEXT : MM_TEXT;
      ctx.font = _font(n.sizeScale);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(n.text || '', n.x, n.y);
      // 悬停快速创建按钮：右中=文本子节点（青）、下中=步骤子节点（紫）
      if (interactive && n.id === inst.hoverId && !inst.mode && !inst._dragging) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 0.006);
        _quickAddBtn(ctx, rect.x + rect.w, rect.y + rect.h / 2, MM_QA_R, '#00ffff', inst._qaHover === 'text', pulse);
        _quickAddBtn(ctx, rect.x + rect.w / 2, rect.y + rect.h, MM_QA_R, MM_STEP_COL, inst._qaHover === 'step', pulse);
      }
      // 折叠徽标（⊕/⊖）
      if (n.children.length) {
        const bx = rect.x + rect.w, by = rect.y + rect.h;
        ctx.beginPath(); ctx.arc(bx, by, 7, 0, Math.PI * 2);
        ctx.fillStyle = '#0d1b24'; ctx.fill();
        ctx.strokeStyle = n.collapsed ? MM_STEP_COL : '#5a8a9a'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(bx - 4, by); ctx.lineTo(bx + 4, by);
        if (!n.collapsed) { ctx.moveTo(bx, by - 4); ctx.lineTo(bx, by + 4); }
        ctx.strokeStyle = '#c0f0ff'; ctx.lineWidth = 1.5; ctx.stroke();
      }
      ctx.restore();
    });
  });
  ctx.restore();

  // 模式提示（画布左上角）
  if (inst.hint) {
    ctx.save();
    ctx.font = '13px system-ui, sans-serif';
    const tw = ctx.measureText(inst.hint).width;
    ctx.fillStyle = 'rgba(13,27,36,0.9)';
    ctx.fillRect(8, 8, tw + 20, 26);
    ctx.strokeStyle = '#2c6e7e'; ctx.lineWidth = 1;
    ctx.strokeRect(8, 8, tw + 20, 26);
    ctx.fillStyle = '#c0f0ff';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(inst.hint, 18, 21);
    ctx.restore();
  }
}

export { render, _hitQuickAdd };
