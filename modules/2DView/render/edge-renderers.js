// ============================================================
//  2DView / render / edge-renderers.js — 连线 / 锚点 / 自由绘制预览
// ============================================================

import { appState } from '../../module0_AppState.js';
import {
  ctx,
  lineHitAreas, setLineHitAreas,
  BASE_NODE_WIDTH, BASE_NODE_HEIGHT,
  isFreeDrawing, freeDrawState,
  ANCHOR_RADIUS, ANCHOR_KEYS, getNodeAnchors,
  getNodeLayoutSize
} from '../shared.js';
import { _renderHue } from './frame-state.js';
import { isNodeInCurrentLayer } from './visibility.js';

// ============================================================
//  绘制连线（单条，兼容旧调用；内部走批量收集）
// ============================================================
export function drawLine(x1, y1, x2, y2, alpha = 1, color = '#2c6e7e', edgeData = null, dash = [], glow = false, glowColor = null, drawArrow = true) {
  const lineWidth = glow ? 3 : 2;
  // 命中区仍按单条记录
  setLineHitAreas([...lineHitAreas, { x1, y1, x2, y2, edgeData, color, lineWidth }]);
  // 批量收集：同色同宽同 dash 的线段合并为一次 stroke
  _batchPush(x1, y1, x2, y2, alpha, color, lineWidth, dash);
  // 光晕单独收集（宽度不同）
  if (glow) {
    const pulse = 0.5 + 0.5 * Math.sin(_renderHue * 0.08);
    _batchPush(x1, y1, x2, y2, alpha * (0.3 + pulse * 0.3), glowColor || color, 5 + pulse * 4, dash);
  }
  // 箭头单独画（fill，无法批量 stroke）
  if (drawArrow) {
    if (!_arrowBatch) _arrowBatch = [];
    _arrowBatch.push({ x1, y1, x2, y2, color, alpha });   // alpha 随箭头记录：折叠/隐藏时同步淡出
  }
}

// ── 批量绘制缓冲 ──
let _lineBatch = new Map();   // key → { x1,y1,x2,y2,alpha,color,lineWidth,dash }[]
let _arrowBatch = null;

function _batchKey(color, lineWidth, dash) {
  // dash 数组内容相同即视为同一组（用 join 简化）
  return color + '|' + lineWidth + '|' + (dash && dash.length ? dash.join(',') : '');
}
function _batchPush(x1, y1, x2, y2, alpha, color, lineWidth, dash) {
  const key = _batchKey(color, lineWidth, dash);
  let arr = _lineBatch.get(key);
  if (!arr) { arr = []; _lineBatch.set(key, arr); }
  arr.push(x1, y1, x2, y2, alpha);
}
/** 在 draw() 末尾调用：把收集到的所有线段按组一次性 stroke */
export function flushLineBatch() {
  if (!_lineBatch.size && !_arrowBatch) return;
  ctx.save();
  for (const [key, arr] of _lineBatch) {
    const [color, lineWidth, dashStr] = key.split('|');
    const dash = dashStr ? dashStr.split(',').map(Number) : [];
    ctx.strokeStyle = color;
    ctx.lineWidth = Number(lineWidth);
    ctx.setLineDash(dash);
    ctx.beginPath();
    for (let i = 0; i < arr.length; i += 5) {
      // 同 alpha 也分组较复杂，这里按段设置（Canvas state 切换远比 stroke 便宜）
      ctx.globalAlpha = arr[i + 4];
      ctx.moveTo(arr[i], arr[i + 1]);
      ctx.lineTo(arr[i + 2], arr[i + 3]);
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  // 箭头批量 fill
  if (_arrowBatch && _arrowBatch.length) {
    const arrowLen = 12;
    for (const a of _arrowBatch) {
      const angle = Math.atan2(a.y2 - a.y1, a.x2 - a.x1);
      const tipX = a.x2 - 4 * Math.cos(angle);
      const tipY = a.y2 - 4 * Math.sin(angle);
      ctx.globalAlpha = a.alpha !== undefined ? a.alpha : 1;   // 箭头透明度与所属连线一致
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX - arrowLen * Math.cos(angle - Math.PI / 7), tipY - arrowLen * Math.sin(angle - Math.PI / 7));
      ctx.lineTo(tipX - arrowLen * Math.cos(angle + Math.PI / 7), tipY - arrowLen * Math.sin(angle + Math.PI / 7));
      ctx.closePath();
      ctx.fillStyle = a.color;
      ctx.fill();
    }
  }
  ctx.restore();
  _lineBatch.clear();
  _arrowBatch = null;
}

// ============================================================
//  绘制折线（支持 waypoint 的多段线）
// ============================================================
export function drawPolyline(points, alpha = 1, color = '#2c6e7e', edgeData = null, dash = [], glow = false, glowColor = null) {
  if (points.length < 2) return;
  for (let i = 0; i < points.length - 1; i++) {
    const isLast = (i === points.length - 2);
    drawLine(points[i].x, points[i].y, points[i + 1].x, points[i + 1].y,
      alpha, color, edgeData, dash, glow, glowColor, isLast);
  }
}

// 计算折线第 3 段的中点（标签放置位），不足 3 段则回退全路径中点
export function getPolylineThirdSegmentMidpoint(points) {
  if (points.length >= 4) {
    return { x: (points[2].x + points[3].x) / 2, y: (points[2].y + points[3].y) / 2 };
  }
  if (points.length >= 2) {
    return { x: (points[0].x + points[points.length - 1].x) / 2, y: (points[0].y + points[points.length - 1].y) / 2 };
  }
  return { x: points[0]?.x || 0, y: points[0]?.y || 0 };
}

// ============================================================
//  绘制单个节点上的锚点圆点（8个：四边中点+四角）
// ============================================================
export function drawAnchorsOnNode(x, y, w, h, nodeId) {
  const anchors = getNodeAnchors(x, y, w, h);
  const isSource = freeDrawState && freeDrawState.sourceNodeId === nodeId;
  for (const key of ANCHOR_KEYS) {
    const pt = anchors[key];
    const isActive = isSource && freeDrawState.sourceAnchor === key;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, ANCHOR_RADIUS, 0, Math.PI * 2);
    if (isActive) {
      ctx.fillStyle = '#FFD700';
      ctx.strokeStyle = '#fff';
    } else {
      ctx.fillStyle = 'rgba(100, 200, 255, 0.85)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    }
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();
  }
}

// ============================================================
//  绘制所有节点的锚点（连线模式下）
// ============================================================
export function drawAllAnchorPoints(positionMap) {
  if (!appState.connectionMode || appState.connectionMode !== 'add') return;
  for (const [id, pos] of positionMap.entries()) {
    const node = appState.nodeMap.get(id);
    if (!node) continue;
    // 只显示当前图层的锚点
    if (!isNodeInCurrentLayer(id)) continue;
    const scale = node.sizeScale || 1;
    const { width: w, height: h } = getNodeLayoutSize(node, scale);
    drawAnchorsOnNode(pos.x, pos.y, w, h, id);
  }
}

// ============================================================
//  绘制自由连线过程中的预览线
// ============================================================
export function drawFreeDrawPreview() {
  if (!isFreeDrawing || !freeDrawState) return;
  const { sourceNodeId, sourceAnchor, waypoints, currentMousePos } = freeDrawState;
  const sourcePos = appState.positions2D.get(sourceNodeId);
  if (!sourcePos) return;

  const sourceNode = appState.nodeMap.get(sourceNodeId);
  const sourceScale = sourceNode?.sizeScale || 1;
  const sw = BASE_NODE_WIDTH * sourceScale;
  const sh = BASE_NODE_HEIGHT * sourceScale;
  const anchors = getNodeAnchors(sourcePos.x, sourcePos.y, sw, sh);
  const startPt = anchors[sourceAnchor];
  if (!startPt) return;

  // 构建折线点序列：起点 → 拐点 → 当前鼠标位置
  const points = [startPt];
  if (waypoints) {
    for (const wp of waypoints) points.push(wp);
  }
  if (currentMousePos) points.push(currentMousePos);

  // 绘制预览线（虚线 + 光晕）
  ctx.save();
  drawPolyline(points, 0.9, '#00ccff', null, [8, 4], true, '#00ffff');
  // 绘制拐点标记
  if (waypoints) {
    for (const wp of waypoints) {
      ctx.beginPath();
      ctx.arc(wp.x, wp.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 200, 255, 0.7)';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  ctx.restore();
}
