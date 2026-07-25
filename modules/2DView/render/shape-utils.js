// ============================================================
//  2DView / render / shape-utils.js — 形状绘制 / 文本工具 / 卡片尺寸
// ============================================================

import { ctx } from '../shared.js';
import { BASE_NODE_WIDTH, BASE_NODE_HEIGHT } from '../shared.js';

// ============================================================
//  绘制节点形状（支持四种图形：圆角矩形/椭圆/菱形/体育场形）
// ============================================================
export function drawNodeShape(sx, sy, sw, sh, shape, scale) {
  ctx.beginPath();
  switch (shape) {
    case 'diamond':
      ctx.moveTo(sx + sw / 2, sy);
      ctx.lineTo(sx + sw, sy + sh / 2);
      ctx.lineTo(sx + sw / 2, sy + sh);
      ctx.lineTo(sx, sy + sh / 2);
      ctx.closePath();
      break;
    case 'ellipse':
      ctx.ellipse(sx + sw / 2, sy + sh / 2, sw / 2, sh / 2, 0, 0, Math.PI * 2);
      break;
    case 'stadium': {
      const r = Math.min(sw, sh) / 2;
      if (sw >= sh) {
        ctx.moveTo(sx + r, sy);
        ctx.lineTo(sx + sw - r, sy);
        ctx.arc(sx + sw - r, sy + sh / 2, r, -Math.PI / 2, Math.PI / 2);
        ctx.lineTo(sx + r, sy + sh);
        ctx.arc(sx + r, sy + sh / 2, r, Math.PI / 2, -Math.PI / 2);
      } else {
        ctx.moveTo(sx, sy + r);
        ctx.lineTo(sx, sy + sh - r);
        ctx.arc(sx + sw / 2, sy + sh - r, r, 0, Math.PI);
        ctx.lineTo(sx + sw, sy + r);
        ctx.arc(sx + sw / 2, sy + r, r, Math.PI, 0);
      }
      ctx.closePath();
      break;
    }
    case 'roundedRect':
    default:
      if (ctx.roundRect) ctx.roundRect(sx, sy, sw, sh, 8 * scale);
      else ctx.rect(sx, sy, sw, sh);
      break;
  }
  ctx.fill();
  ctx.stroke();
}

// ============================================================
//  文本显示框模式（card）尺寸/偏移
// ============================================================
export function getCardSize(node, scale) {
  const w = (node.cardWidth || BASE_NODE_WIDTH * 2.6) * scale;
  const h = (node.cardHeight || BASE_NODE_HEIGHT * 4.2) * scale;
  return { w, h };
}

// 获取卡片偏移量：卡片左上角对齐节点位置（dx=0, dy=0）
// 这样布局/连线/排列可直接使用卡片尺寸，无需额外偏移计算
export function getCardOffset(node, scale) {
  return { dx: 0, dy: 0 };
}

// ============================================================
//  HTML → 纯文本
// ============================================================
export function _htmlToPlain(html) {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  // 换行块转 \n
  tmp.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
  tmp.querySelectorAll('div,p,li').forEach(el => el.append('\n'));
  return (tmp.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
}

// ============================================================
//  将文本换行拆分为行数组（不绘制，仅计算）
// ============================================================
export function _wrapTextLines(text, maxW, lineHeight) {
  const lines = [];
  for (const seg of String(text || '').split('\n')) {
    if (seg === '') { lines.push(''); continue; }
    const chars = [...seg];
    let line = '';
    for (const ch of chars) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxW) {
        if (line) lines.push(line);
        line = ch;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}
