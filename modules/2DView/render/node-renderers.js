// ============================================================
//  2DView / render / node-renderers.js — 节点绘制
//  - drawNode：普通节点
//  - drawNodeCard：卡片模式
//  - drawNodeWebpage：网页节点
//  - _drawQuickAddBtn：快速创建按钮
// ============================================================

import { appState } from '../../module0_AppState.js';
import {
  ctx, transform,
  BASE_NODE_HEIGHT,
  nodeHitAreas,
  isBoxSelecting,
  isFreeDrawing,
  hoveredNodeId, quickAddHover, QUICK_ADD_RADIUS,
  getNodeWidth
} from '../shared.js';
import { isNextStepNode } from '../Layout.js';
import {
  _frameNow, _cardRenameHitAreas, _cardBodyRects,
  hasCrossEdges
} from './frame-state.js';
import { drawNodeShape, getCardSize, getCardOffset } from './shape-utils.js';

// ============================================================
//  绘制单个节点
// ============================================================
export function drawNode(x, y, node, selected = false, alpha = 1, connected = false, connectedStep = false, hasCrossEdgesFlag = false) {
  // ── 文本显示框模式：走独立绘制路径 ──
  if (node.displayMode === 'card') {
    return drawNodeCard(x, y, node, selected, alpha, hasCrossEdgesFlag, connected, connectedStep);
  }
  // ── 网页节点模式：类似卡片但标题为搜索栏 ──
  if (node.displayMode === 'webpage') {
    return drawNodeWebpage(x, y, node, selected, alpha, hasCrossEdgesFlag, connected, connectedStep);
  }

  const scale = node.sizeScale || 1;
  const w = getNodeWidth(node, scale);
  const h = BASE_NODE_HEIGHT * scale;
  const fontSize = Math.max(10, 14 * scale);
  const shape = node.nodeShape || (isNextStepNode(node) ? 'stadium' : 'roundedRect');

  let borderColor = '#5a8a9a';
  if (node.id) {
    const obj = appState.nodeMeshes.get(node.id);
    // 优先读取 3D 动画循环缓存的 hex 字符串，避免每节点 getHexString float→hex 转换
    if (obj?._borderColorHex) borderColor = obj._borderColorHex;
    else if (obj?.mesh?.material?.color) borderColor = '#' + obj.mesh.material.color.getHexString();
    else if (node.fixedColor) borderColor = node.fixedColor;
  }

  // 复用帧内时间戳，避免每节点多次 performance.now() 系统调用
  const now = _frameNow;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);

  if (selected) {
    // 选中节点保持金色高亮，不被 connected 覆盖
    ctx.fillStyle = '#FFD700';
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 2;
  } else if (connectedStep) {
    const pulse = 0.5 + 0.5 * Math.sin(now * 0.006);
    ctx.shadowColor = '#AA44FF';
    ctx.shadowBlur = 14 + pulse * 8;
    ctx.fillStyle = '#2a1a3a';
    ctx.strokeStyle = '#AA44FF';
    ctx.lineWidth = 3;
  } else if (connected) {
    const pulse = 0.5 + 0.5 * Math.sin(now * 0.006);
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 14 + pulse * 8;
    ctx.fillStyle = '#2a4a5a';
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 3;
  } else {
    ctx.fillStyle = '#1e2a32';
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 2;
  }

  // 绘制节点形状
  drawNodeShape(0, 0, w, h, shape, scale);

  // 选中节点且有关联连接时 → 叠加呼吸光晕（当连接节点在另一图层时也能看到连接状态）
  if (selected && (connected || connectedStep)) {
    const pulse = 0.5 + 0.5 * Math.sin(now * 0.005);
    ctx.shadowColor = connectedStep ? '#AA44FF' : '#00ffff';
    ctx.shadowBlur = 22 + pulse * 14;
    ctx.strokeStyle = connectedStep ? '#CC66FF' : '#33ffff';
    ctx.lineWidth = 5;
    ctx.globalAlpha = 0.9;
    drawNodeShape(0, 0, w, h, shape, scale);
    ctx.stroke();
    // 第二层光晕
    ctx.shadowBlur = 10 + pulse * 6;
    ctx.strokeStyle = connectedStep ? '#FF88FF' : '#88ffff';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }

  // 跨图层连接 → 外圈双实线（带呼吸动画）
  if (hasCrossEdgesFlag) {
    const breath = Math.sin(now * 0.003) * 0.5 + 0.5;
    const gap = 3 + breath * 4;
    const outerAlpha = 0.6 + breath * 0.4;
    ctx.globalAlpha = alpha * outerAlpha;
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = borderColor;
    ctx.shadowBlur = 4 + breath * 6;
    drawNodeShape(-gap, -gap, w + gap * 2, h + gap * 2, shape, scale + gap / Math.max(w, h));
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = alpha;
  }

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.fillStyle = selected ? '#000' : connectedStep ? '#CCAAFF' : connected ? '#00ffff' : '#c0f0ff';
  ctx.font = `${fontSize}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(node.name || '', w / 2, h / 2);

  // 悬停节点：右框中点（文本子节点）、下框中点（步骤子节点）显示带圆圈“+”
  if (node.id && node.id === hoveredNodeId && !isFreeDrawing && !isBoxSelecting) {
    const r = QUICK_ADD_RADIUS;
    const pulse = 0.5 + 0.5 * Math.sin(now * 0.006);
    // 右框中点 → 文本子节点（青色）
    _drawQuickAddBtn(w, h / 2, r, '#00ffff', quickAddHover === 'child', pulse);
    // 下框中点 → 步骤子节点（紫色）
    _drawQuickAddBtn(w / 2, h, r, '#AA44FF', quickAddHover === 'step', pulse);
  }

  ctx.restore();
}

// 绘制带圆圈的“+”快速创建按钮（cx/cy 为世界坐标，相对节点左上角）
function _drawQuickAddBtn(cx, cy, r, color, isHover, pulse) {
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
  // “+” 符号
  ctx.strokeStyle = isHover ? '#0d1b24' : color;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.5, cy);
  ctx.lineTo(cx + r * 0.5, cy);
  ctx.moveTo(cx, cy - r * 0.5);
  ctx.lineTo(cx, cy + r * 0.5);
  ctx.stroke();
  ctx.restore();
}

// ============================================================
//  文本显示框模式（card）
// ============================================================
function drawNodeCard(x, y, node, selected, alpha, hasCrossEdgesFlag = false, connected = false, connectedStep = false) {
  const scale = node.sizeScale || 1;
  const { w: cardW, h: cardH } = getCardSize(node, scale);
  const off = getCardOffset(node, scale);
  const padding = 10 * scale;
  const fontSize = Math.max(10, 12 * scale);
  const titleFontSize = fontSize + 8;
  const titleAreaH = titleFontSize + 16;  // 标题 + 分隔线 + 间距
  const bodyW = cardW - padding * 2;
  const bodyH = Math.max(0, cardH - padding - titleAreaH - padding);  // 防止负高度导致 DOM 渲染异常

  let borderColor = '#5a8a9a';
  if (node.fixedColor) {
    borderColor = node.fixedColor;
  } else if (node.id) {
    const obj = appState.nodeMeshes.get(node.id);
    // 优先读取 3D 动画循环缓存的 hex 字符串
    if (obj?._borderColorHex) borderColor = obj._borderColorHex;
    else if (obj?.mesh?.material?.color) borderColor = '#' + obj.mesh.material.color.getHexString();
  }

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x + off.dx, y + off.dy);

  // ── 跨图层连接 → 外圈双实线（带呼吸动画），与普通节点一致的视觉表现 ──
  if (hasCrossEdgesFlag) {
    const breath = Math.sin(_frameNow * 0.003) * 0.5 + 0.5;
    const gap = 3 + breath * 4;
    const outerAlpha = 0.6 + breath * 0.4;
    ctx.save();
    ctx.globalAlpha = alpha * outerAlpha;
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = borderColor;
    ctx.shadowBlur = 4 + breath * 6;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-gap, -gap, cardW + gap * 2, cardH + gap * 2, (10 + gap) * scale);
    else ctx.rect(-gap, -gap, cardW + gap * 2, cardH + gap * 2);
    ctx.stroke();
    ctx.restore();
  }

  // ── 卡片背景 ──
  const now = _frameNow;
  let bgColor, edgeColor, titleColor;
  if (selected) {
    bgColor = '#3a3520'; edgeColor = '#FFD700'; titleColor = '#FFD700';
  } else if (connectedStep) {
    bgColor = '#2a1a3a'; edgeColor = '#AA44FF'; titleColor = '#CCAAFF';
  } else if (connected) {
    bgColor = '#2a4a5a'; edgeColor = '#00ffff'; titleColor = '#00ffff';
  } else {
    bgColor = '#0d1820'; edgeColor = borderColor; titleColor = '#0ff';
  }
  ctx.fillStyle = bgColor;
  ctx.strokeStyle = edgeColor;
  ctx.lineWidth = (selected || connected || connectedStep) ? 3 : 2;
  if (selected) {
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur = 18;
  } else if (connectedStep) {
    const pulse = 0.5 + 0.5 * Math.sin(now * 0.006);
    ctx.shadowColor = '#AA44FF';
    ctx.shadowBlur = 14 + pulse * 8;
  } else if (connected) {
    const pulse = 0.5 + 0.5 * Math.sin(now * 0.006);
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 14 + pulse * 8;
  } else {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(0, 0, cardW, cardH, 10 * scale);
  else ctx.rect(0, 0, cardW, cardH);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';

  // ── 标题 + 铅笔按钮 ──
  ctx.fillStyle = titleColor;
  ctx.font = `bold ${titleFontSize}px system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const titleText = (node.name || '').slice(0, 30);
  ctx.fillText(titleText, padding, padding);
  // 铅笔按钮
  const renameIconSize = titleFontSize + 2;
  const renameX = cardW - padding - renameIconSize;
  const renameY = padding - 1;
  ctx.fillStyle = 'rgba(0,255,255,0.7)';
  ctx.font = `${renameIconSize}px system-ui, sans-serif`;
  ctx.fillText('✏', renameX, renameY);
  ctx.font = `${fontSize}px system-ui, sans-serif`;
  // 记录铅笔按钮命中区（世界坐标）—— 动画期间（alpha 过低）不响应点击，避免误触
  if (alpha > 0.15) {
    _cardRenameHitAreas.push({
      id: node.id,
      x: x + off.dx + renameX,
      y: y + off.dy + renameY,
      width: renameIconSize + 4,
      height: renameIconSize + 4
    });
  }

  // ── 分隔线 ──
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding, padding + titleFontSize + 6);
  ctx.lineTo(cardW - padding, padding + titleFontSize + 6);
  ctx.stroke();

  // ── 正文区域：记录矩形（世界坐标）供 Interaction.js 同步 DOM overlay ──
  // 总是推入（带 alpha 字段），让 overlay 透明度与卡片同步；alpha 过低时 syncCardOverlays 会隐藏 overlay
  _cardBodyRects.push({
    id: node.id,
    x: x + off.dx + padding,
    y: y + off.dy + padding + titleAreaH,
    width: bodyW,
    height: bodyH,
    scale: transform.scale,
    alpha: alpha
  });

  // ── 悬停时显示加号按钮（与普通节点一致）──
  if (node.id && node.id === hoveredNodeId && !isFreeDrawing && !isBoxSelecting) {
    const r = QUICK_ADD_RADIUS;
    const pulse = 0.5 + 0.5 * Math.sin(now * 0.006);
    // 右边框中点 → 文本子节点（青色）
    _drawQuickAddBtn(cardW, cardH / 2, r, '#00ffff', quickAddHover === 'child', pulse);
    // 下边框中点 → 步骤子节点（紫色）
    _drawQuickAddBtn(cardW / 2, cardH, r, '#AA44FF', quickAddHover === 'step', pulse);
  }

  // 注：卡片 resize 已改为边缘条带命中（hitTestCardHandle），不再绘制可见把手

  ctx.restore();
}

// ============================================================
//  绘制网页节点（类似卡片，标题区为搜索栏，正文区为iframe）
// ============================================================
function drawNodeWebpage(x, y, node, selected, alpha, hasCrossEdgesFlag = false, connected = false, connectedStep = false) {
  const scale = node.sizeScale || 1;
  const { w: cardW, h: cardH } = getCardSize(node, scale);
  const off = getCardOffset(node, scale);
  const padding = 10 * scale;
  const fontSize = Math.max(10, 12 * scale);
  const searchBarH = 36 * scale;  // 搜索栏高度
  const bodyW = cardW - padding * 2;
  const bodyH = Math.max(0, cardH - padding - searchBarH - padding);

  let borderColor = '#5a8a9a';
  if (node.fixedColor) {
    borderColor = node.fixedColor;
  } else if (node.id) {
    const obj = appState.nodeMeshes.get(node.id);
    // 优先读取 3D 动画循环缓存的 hex 字符串
    if (obj?._borderColorHex) borderColor = obj._borderColorHex;
    else if (obj?.mesh?.material?.color) borderColor = '#' + obj.mesh.material.color.getHexString();
  }

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x + off.dx, y + off.dy);

  // ── 跨图层连接 → 外圈双实线 ──
  if (hasCrossEdgesFlag) {
    const breath = Math.sin(_frameNow * 0.003) * 0.5 + 0.5;
    const gap = 3 + breath * 4;
    const outerAlpha = 0.6 + breath * 0.4;
    ctx.save();
    ctx.globalAlpha = alpha * outerAlpha;
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = borderColor;
    ctx.shadowBlur = 4 + breath * 6;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-gap, -gap, cardW + gap * 2, cardH + gap * 2, (10 + gap) * scale);
    else ctx.rect(-gap, -gap, cardW + gap * 2, cardH + gap * 2);
    ctx.stroke();
    ctx.restore();
  }

  // ── 卡片背景 ──
  const now = _frameNow;
  let bgColor, edgeColor;
  if (selected) {
    bgColor = '#3a3520'; edgeColor = '#FFD700';
  } else if (connectedStep) {
    bgColor = '#2a1a3a'; edgeColor = '#AA44FF';
  } else if (connected) {
    bgColor = '#2a4a5a'; edgeColor = '#00ffff';
  } else {
    bgColor = '#0d1820'; edgeColor = borderColor;
  }
  ctx.fillStyle = bgColor;
  ctx.strokeStyle = edgeColor;
  ctx.lineWidth = (selected || connected || connectedStep) ? 3 : 2;
  if (selected) {
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur = 18;
  } else if (connectedStep) {
    const pulse = 0.5 + 0.5 * Math.sin(now * 0.006);
    ctx.shadowColor = '#AA44FF';
    ctx.shadowBlur = 14 + pulse * 8;
  } else if (connected) {
    const pulse = 0.5 + 0.5 * Math.sin(now * 0.006);
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 14 + pulse * 8;
  } else {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(0, 0, cardW, cardH, 10 * scale);
  else ctx.rect(0, 0, cardW, cardH);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';

  // ── 搜索栏区域（标题区） ──
  const searchBarX = padding;
  const searchBarY = padding;
  const searchBarW = cardW - padding * 2;
  // 搜索栏背景
  ctx.fillStyle = 'rgba(0,30,40,0.8)';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(searchBarX, searchBarY, searchBarW, searchBarH, 6 * scale);
  else ctx.rect(searchBarX, searchBarY, searchBarW, searchBarH);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,255,255,0.4)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // 搜索图标 🔍
  ctx.fillStyle = 'rgba(0,255,255,0.7)';
  ctx.font = `${Math.max(10, 14 * scale)}px system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('🔍', searchBarX + 4 * scale, searchBarY + searchBarH / 2);
  // URL/搜索文字
  const urlText = node.webUrl || '输入网址或搜索...';
  ctx.fillStyle = urlText === '输入网址或搜索...' ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.8)';
  ctx.font = `${fontSize}px system-ui, sans-serif`;
  const maxUrlW = searchBarW - 30 * scale;
  let displayUrl = urlText;
  if (ctx.measureText(displayUrl).width > maxUrlW) {
    while (displayUrl.length > 3 && ctx.measureText('...' + displayUrl).width > maxUrlW) {
      displayUrl = displayUrl.slice(1);
    }
    displayUrl = '...' + displayUrl;
  }
  ctx.fillText(displayUrl, searchBarX + 22 * scale, searchBarY + searchBarH / 2);

  // ── 分隔线 ──
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding, padding + searchBarH + 4);
  ctx.lineTo(cardW - padding, padding + searchBarH + 4);
  ctx.stroke();

  // ── 正文区域：记录矩形供 Interaction.js 同步 DOM overlay（搜索栏+iframe） ──
  _cardBodyRects.push({
    id: node.id,
    x: x + off.dx + padding,
    y: y + off.dy + padding + searchBarH + 4,
    width: bodyW,
    height: bodyH,
    scale: transform.scale,
    alpha: alpha,
    // 网页节点专属：搜索栏矩形（供overlay定位搜索输入框）
    _webpage: true,
    _searchBarRect: {
      x: x + off.dx + searchBarX,
      y: y + off.dy + searchBarY,
      width: searchBarW,
      height: searchBarH
    }
  });

  // 注：网页节点 resize 已改为边缘条带命中（hitTestCardHandle），不再绘制可见把手

  // ── 命中区域 ──
  if (alpha > 0.15) {
    nodeHitAreas.push({
      id: node.id,
      x: x + off.dx,
      y: y + off.dy,
      width: cardW,
      height: cardH
    });
  }

  // ── 悬停时显示加号按钮（与普通节点一致）──
  if (node.id && node.id === hoveredNodeId && !isFreeDrawing && !isBoxSelecting) {
    const r = QUICK_ADD_RADIUS;
    const pulse = 0.5 + 0.5 * Math.sin(now * 0.006);
    // 右边框中点 → 文本子节点（青色）
    _drawQuickAddBtn(cardW, cardH / 2, r, '#00ffff', quickAddHover === 'child', pulse);
    // 下边框中点 → 步骤子节点（紫色）
    _drawQuickAddBtn(cardW / 2, cardH, r, '#AA44FF', quickAddHover === 'step', pulse);
  }

  ctx.restore();
}
