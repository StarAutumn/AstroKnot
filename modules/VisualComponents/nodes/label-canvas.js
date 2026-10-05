// ============================================================
//  nodes/label-canvas.js — 3D 节点标签 canvas 渲染（共享模块）
//  统一 mesh.js（创建标签）与 interaction.js（重命名标签）的绘制，
//  支持折叠徽标 a/b：a=直接子节点数，b=全部后代数（样式与 2D 徽标一致）
// ============================================================

export const LABEL_FONT_SIZE = 28;   // 名字字号
export const LABEL_PAD_X = 20;       // 名字左右内边距
export const LABEL_PAD_Y = 8;        // 名字上下内边距
export const LABEL_BASE_SCALE = 0.02; // Sprite 基础缩放

/**
 * 渲染标签 canvas：节点名胶囊 + 可选折叠徽标（名字右侧，垂直居中）
 * @param {string} text 节点名
 * @param {{a:number,b:number}|null} badge 折叠徽标数据（null 不显示）
 * @param {string|null} borderColor 名字胶囊边框色（null 用默认灰色；选中态高亮色由 _setLabelVisible 传入）
 * @returns {{canvas: HTMLCanvasElement, bgW: number, bgH: number}}
 */
export function renderLabelCanvas(text, badge = null, borderColor = null) {
  const fontSize = LABEL_FONT_SIZE;
  const padX = LABEL_PAD_X;
  const padY = LABEL_PAD_Y;
  const bgH = fontSize + padY * 2;

  // 先用临时 canvas 测量文字宽度
  const tmpCanvas = document.createElement('canvas');
  const tmpCtx = tmpCanvas.getContext('2d');
  tmpCtx.font = `${fontSize}px system-ui, sans-serif`;
  const textWidth = tmpCtx.measureText(text).width;
  const nameW = Math.max(textWidth + padX * 2, bgH * 2.2);

  // 折叠徽标尺寸：样式与 2D 折叠徽标一致，等比放大 2 倍（3D 名字 28px / 2D 节点 14px）
  let badgeText = '';
  let badgeW = 0;
  let badgeH = 0;
  const gap = 10;
  if (badge) {
    badgeText = `${badge.a}/${badge.b}`;
    const bFont = 22;
    tmpCtx.font = `${bFont}px system-ui, sans-serif`;
    badgeW = tmpCtx.measureText(badgeText).width + 10 * 2;
    badgeH = bFont + 10;
  }

  const bgW = nameW + (badge ? gap + badgeW : 0);

  // 创建精确大小的 canvas
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(bgW);
  canvas.height = Math.ceil(bgH);
  const ctx = canvas.getContext('2d');

  // 名字胶囊背景（圆角矩形）
  const r = bgH / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(nameW - r, 0);
  ctx.arcTo(nameW, 0, nameW, r, r);
  ctx.lineTo(nameW, bgH - r);
  ctx.arcTo(nameW, bgH, nameW - r, bgH, r);
  ctx.lineTo(r, bgH);
  ctx.arcTo(0, bgH, 0, bgH - r, r);
  ctx.lineTo(0, r);
  ctx.arcTo(0, 0, r, 0, r);
  ctx.closePath();
  ctx.fill();

  // 名字胶囊边框
  ctx.strokeStyle = borderColor || 'rgba(68,68,68,1)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // 名字文字
  ctx.fillStyle = '#ffffff';
  ctx.font = `${fontSize}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, nameW / 2, bgH / 2);

  // 折叠徽标 a/b（名字右侧，垂直居中；配色同 2D _drawCollapsedBadge）
  if (badge) {
    const bx = nameW + gap;
    const by = (bgH - badgeH) / 2;
    const br = badgeH / 2;
    ctx.fillStyle = 'rgba(10, 24, 34, 0.92)';
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx + br, by);
    ctx.lineTo(bx + badgeW - br, by);
    ctx.arcTo(bx + badgeW, by, bx + badgeW, by + br, br);
    ctx.lineTo(bx + badgeW, by + badgeH - br);
    ctx.arcTo(bx + badgeW, by + badgeH, bx + badgeW - br, by + badgeH, br);
    ctx.lineTo(bx + br, by + badgeH);
    ctx.arcTo(bx, by + badgeH, bx, by + badgeH - br, br);
    ctx.lineTo(bx, by + br);
    ctx.arcTo(bx, by, bx + br, by, br);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#aef0ff';
    ctx.font = '22px system-ui, sans-serif';
    ctx.fillText(badgeText, bx + badgeW / 2, bgH / 2);
  }

  return { canvas, bgW, bgH };
}
