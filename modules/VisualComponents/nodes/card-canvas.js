// ============================================================
//  nodes/card-canvas.js — 3D 卡片 Canvas 绘制 + 卡片尺寸常量
// ============================================================
import { _getScanlinePattern } from './textures.js';

// 卡片像素 → 世界单位的比例因子
// 按 2D 视图卡片/节点面积比标定：2D 比例 ≈ 9.17（220×200 / 120×40），
// 3D 节点投影面积 ≈ π×0.22²，匹配得 CARD_WORLD_SCALE ≈ 0.0056
export const CARD_WORLD_SCALE = 0.0056;
// 卡片板厚度（世界单位）
export const CARD_DEPTH = 0.04;

export function _drawCardCanvas(node, canvas, opts = {}) {
  const {
    selected = false,
    connected = false,
    connectedStep = false,
    isCurrentlyEditing = false,
    hasCrossEdges = false
  } = opts;

  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const padding = 10;
  const titleFontSize = 14;

  // 边框颜色
  let borderColor = '#5a8a9a';
  if (node.fixedColor) borderColor = node.fixedColor;

  // 状态颜色
  let bgColor, edgeColor, titleColor;
  if (isCurrentlyEditing) {
    bgColor = '#0a3a1a'; edgeColor = '#00cc66'; titleColor = '#00ff88';
  } else if (selected) {
    bgColor = '#3a3520'; edgeColor = '#FFD700'; titleColor = '#FFD700';
  } else if (connectedStep) {
    bgColor = '#2a1a3a'; edgeColor = '#AA44FF'; titleColor = '#CCAAFF';
  } else if (connected) {
    bgColor = '#2a4a5a'; edgeColor = '#00ffff'; titleColor = '#00ffff';
  } else {
    bgColor = '#0d1820'; edgeColor = borderColor; titleColor = '#0ff';
  }

  ctx.clearRect(0, 0, W, H);

  // 背景
  ctx.fillStyle = bgColor;
  ctx.strokeStyle = edgeColor;
  ctx.lineWidth = (selected || isCurrentlyEditing) ? 3 : 2;
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(0, 0, W, H, 10);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.fillRect(0, 0, W, H);
    ctx.strokeRect(0, 0, W, H);
  }

  // 全息扫描线（静态，用 4px 纹理块 createPattern 一次填充，替代循环 fillRect）
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = _getScanlinePattern();
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  // 全息边缘渐变（径向，中心透明、边缘青色微光）
  const minDim = Math.min(W, H);
  const maxDim = Math.max(W, H);
  const edgeGrad = ctx.createRadialGradient(W / 2, H / 2, minDim * 0.3, W / 2, H / 2, maxDim * 0.7);
  edgeGrad.addColorStop(0, 'rgba(0,0,0,0)');
  edgeGrad.addColorStop(1, 'rgba(0,255,255,0.15)');
  ctx.fillStyle = edgeGrad;
  ctx.fillRect(0, 0, W, H);

  // 标题/搜索栏
  if (node.displayMode === 'webpage') {
    // ── 网页节点：搜索栏 ──
    const searchBarH = 24;
    // 搜索栏背景
    ctx.fillStyle = 'rgba(0,30,40,0.8)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(padding, padding, W - padding * 2, searchBarH, 4);
    else ctx.rect(padding, padding, W - padding * 2, searchBarH);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // 搜索图标 + URL
    ctx.fillStyle = 'rgba(0,255,255,0.7)';
    ctx.font = `12px system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('🔍', padding + 4, padding + searchBarH / 2);
    const urlText = node.webUrl || '输入网址或搜索...';
    ctx.fillStyle = urlText === '输入网址或搜索...' ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.8)';
    ctx.font = `${titleFontSize - 2}px system-ui, sans-serif`;
    ctx.fillText(urlText.slice(0, 40), padding + 22, padding + searchBarH / 2);

    // 分隔线
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding + searchBarH + 4);
    ctx.lineTo(W - padding, padding + searchBarH + 4);
    ctx.stroke();
  } else {
    // ── 普通卡片：标题 + 铅笔按钮 ──
    ctx.fillStyle = titleColor;
    ctx.font = `bold ${titleFontSize}px system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const titleText = (node.name || '').slice(0, 30);
    ctx.fillText('📄 ' + titleText, padding, padding);

    // 铅笔按钮
    const renameIconSize = titleFontSize + 2;
    const renameX = W - padding - renameIconSize;
    const renameY = padding - 1;
    ctx.fillStyle = 'rgba(0,255,255,0.7)';
    ctx.font = `${renameIconSize}px system-ui, sans-serif`;
    ctx.fillText('✏', renameX, renameY);

    // 分隔线
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding + titleFontSize + 6);
    ctx.lineTo(W - padding, padding + titleFontSize + 6);
    ctx.stroke();
  }

  // 正文由 DOM overlay 渲染（syncCardOverlays3D），支持完整 HTML 格式（表格/列表/图片/代码块等）
  // canvas 仅绘制背景、标题、分隔线、resize 把手，不绘制纯文本正文

  // 选中时绘制 resize 把手
  if (selected) {
    const hs = 8;
    ctx.fillStyle = '#FFD700';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    const drawH = (x, y, w = hs, h = hs) => { ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h); };
    drawH(W / 2 - hs / 2, -hs / 2);
    drawH(W / 2 - hs / 2, H - hs / 2);
    drawH(-hs / 2, H / 2 - hs / 2);
    drawH(W - hs / 2, H / 2 - hs / 2);
    const cbs = hs + 3;
    drawH(W - cbs, H - cbs, cbs, cbs);
  }
}
