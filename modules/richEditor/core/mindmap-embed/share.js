// ============================================================
//  mindmap-embed/share.js — 常量与共享工具
//  - 全部 MM_* 视觉/布局常量（取值与 2DView / Fishbone 对齐）
//  - 颜色与工具：_font / _rgbToHex / _hexToRgba / _editorAreaBg / _genId
//  - 几何工具：_distToSeg / _nodeRect / _edgePoints / _shift
//  - 实例登记 _mounted/_instances、画布同步 _resize、视图换算 toWorld/toScreen、
//    提示文本 setHint、实例卸载 _unmount
// ============================================================

const MM_GRID = '#1a2a34';
const MM_NODE_FILL = '#1e2a32';
const MM_TEXT = '#c0f0ff';
const MM_SEL_FILL = '#FFD700';
const MM_SEL_TEXT = '#000';
const MM_STEP_COL = '#AA44FF';   // 步骤连线高亮/快速创建按钮主色（与 2D 一致）
const MM_JOINT = '#ffd88a';      // 鱼骨主干接缝圆点（与 Fishbone/render2d 一致）
const MM_SEG_SEL = '#FFD700';    // 线段选中高亮（与 Fishbone SELECT_COLOR 一致）
const MM_SEG_GLOW = 'rgba(255,215,0,0.30)';  // 线段选中辉光（与 SELECT_GLOW 一致）
const MM_PREVIEW = '#ffe9b3';    // 主干线段绘制预览（与 2D 一致）
const MM_NODE_H = 40;            // = BASE_NODE_HEIGHT
const MM_NODE_MIN_W = 120;       // = BASE_NODE_WIDTH
const MM_H_GAP = 60, MM_V_GAP = 20;   // = H_GAP / V_GAP
const MM_PEG_X = 24, MM_PEG_Y = 20;   // = POLYLINE_PEG_X / POLYLINE_PEG_Y
const MM_QA_R = 4, MM_QA_HIT = 8;     // = QUICK_ADD_RADIUS / QUICK_ADD_HIT_RADIUS
const MM_DOUBLE_GAP = 2.2;            // 鱼骨双线间距（屏幕像素，与 DOUBLE_GAP 一致）
const MM_STEP_DASH = [8, 3, 2, 3];    // 步骤子节点连线虚线（与 2D 一致）
const MM_EDGE_DASH = [6, 4];          // 自由连线虚线（与 2D cross edge 一致）
const MM_GDASH = { solid: [], dashed: [6, 4], dotted: [2, 4] };  // 群组边框样式（与 2D drawGroupRects 一致）
const MM_GH = 8;                      // 群组角把手边长（屏幕像素，与 2D HANDLE_SIZE 一致）
const MM_STAGE_H = 380;
// ── 连线默认色（静态亮蓝色，不呼吸）─────────────────────────
const MM_LINE_COLOR = '#3399ff';   // 连线/鱼骨线默认色（亮蓝色）
function _font(scale) { return Math.max(10, 14 * (scale || 1)) + 'px system-ui, sans-serif'; }

const _mounted = new WeakSet();
const _instances = [];

// rgb()/rgba() 字符串 → #rrggbb（取不到时兜底编辑区深色）
function _rgbToHex(rgb) {
  const m = /rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(rgb || '');
  if (!m) return '#0d1b23';
  return '#' + [m[1], m[2], m[3]].map(function (x) { return ('0' + parseInt(x, 10).toString(16)).slice(-2); }).join('');
}
// #rrggbb + alpha → rgba() 字符串（群组填充色用，与 2D drawGroupRects 一致）
function _hexToRgba(hex, a) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return hex || '#4a3c7e';
  const v = parseInt(m[1], 16);
  return 'rgba(' + (v >> 16 & 255) + ',' + (v >> 8 & 255) + ',' + (v & 255) + ',' + a + ')';
}
// 背景默认色：从嵌入块向上找最近一个不透明背景（= 所在编辑区底色，浅/深色模式自动适配）
function _editorAreaBg(div) {
  try {
    let el = div.parentElement;
    while (el) {
      const bg = (el.ownerDocument.defaultView || window).getComputedStyle(el).backgroundColor;
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return _rgbToHex(bg);
      el = el.parentElement;
    }
  } catch (e) {}
  return '#0d1b23';
}

function _genId() { return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
// 点到线段距离
function _distToSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const ex = x1 + t * dx - px, ey = y1 + t * dy - py;
  return Math.sqrt(ex * ex + ey * ey);
}
function _shift(n, dx, dy) {
  n.x += dx; n.y += dy;
  n.children.forEach(function (c) { _shift(c, dx, dy); });
}
// 画布尺寸同步（DPR 适配；首次测量时视图居中）
function _resize(inst) {
  const r = inst.div.getBoundingClientRect();
  if (r.width < 5) return;
  const dpr = window.devicePixelRatio || 1;
  inst.canvas.width = Math.round(r.width * dpr);
  inst.canvas.height = Math.round(r.height * dpr);
  inst.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  inst.vw = r.width; inst.vh = r.height;
  if (!inst._viewInited) {
    inst._viewInited = true;
    inst.view.x = r.width / 2;
    inst.view.y = r.height / 2;
  }
}
function toWorld(inst, mx, my) { return { x: (mx - inst.view.x) / inst.view.scale, y: (my - inst.view.y) / inst.view.scale }; }
function toScreen(inst, wx, wy) { return { x: wx * inst.view.scale + inst.view.x, y: wy * inst.view.scale + inst.view.y }; }
function setHint(inst, txt) { inst.hint = txt; }
function _nodeRect(n) {
  const s = n._size || { w: MM_NODE_MIN_W, h: MM_NODE_H };
  return { x: n.x - s.w / 2, y: n.y - s.h / 2, w: s.w, h: s.h };
}
// 自由连线端点：源节点下框中点 → 目标节点上框中点（与 2D cross edge 默认锚点一致）
function _edgePoints(a, b) {
  const ra = _nodeRect(a), rb = _nodeRect(b);
  return { x1: a.x, y1: ra.y + ra.h, x2: b.x, y2: rb.y };
}
function _unmount(inst) {
  inst.destroyed = true;
  if (inst._raf) cancelAnimationFrame(inst._raf);
  if (inst._io) inst._io.disconnect();
  if (inst._ro) inst._ro.disconnect();
  inst.canvas.remove();
  _mounted.delete(inst.div);
  inst.div.classList.remove('mindmap-embed-active');
  const i = _instances.indexOf(inst);
  if (i >= 0) _instances.splice(i, 1);
}

export {
  MM_GRID, MM_NODE_FILL, MM_TEXT, MM_SEL_FILL, MM_SEL_TEXT, MM_STEP_COL, MM_JOINT,
  MM_SEG_SEL, MM_SEG_GLOW, MM_PREVIEW, MM_NODE_H, MM_NODE_MIN_W, MM_H_GAP, MM_V_GAP,
  MM_PEG_X, MM_PEG_Y, MM_QA_R, MM_QA_HIT, MM_DOUBLE_GAP, MM_STEP_DASH, MM_EDGE_DASH,
  MM_GDASH, MM_GH, MM_STAGE_H, MM_LINE_COLOR,
  _font, _rgbToHex, _hexToRgba, _editorAreaBg, _genId, _distToSeg, _shift,
  _mounted, _instances, _resize, toWorld, toScreen, setHint, _nodeRect, _edgePoints, _unmount
};
