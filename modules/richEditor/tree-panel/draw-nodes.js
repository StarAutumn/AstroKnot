// ============================================================
//  richEditor/tree-panel/draw-nodes.js — 树形面板节点/卡片/连线绘制
//  - 卡片节点绘制、DOM 卡片正文 overlay 同步
//  - 普通节点绘制（四种形状）、直线/折线绘制与中点计算
// ============================================================
import { appState } from '../../module0_AppState.js';
import { BASE_NODE_WIDTH, BASE_NODE_HEIGHT, getNodeLayoutSize, isNextStepNode } from '../../2DView/index.js';
import { _injectCardOverlayStyle } from '../../2DView/interaction/card-overlays.js';

// ── HTML 转纯文本（用于卡片正文摘要） ──
function _sidebarHtmlToPlain(html) {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return (tmp.textContent || '').replace(/\s+/g, ' ').trim();
}

// ── 绘制卡片节点（树状面板版，只显示标题+摘要，不渲染富文本HTML） ──
function drawSidebarNodeCard(x, y, node, s, selected, alpha, highlighted, connected, connectedStep, isCurrentlyEditing) {
  const scale = node.sizeScale || 1;
  const { width: w, height: h } = getNodeLayoutSize(node, scale);
  const padding = 4 * scale;
  const fontSize = Math.max(8, 11 * scale);
  const titleFontSize = fontSize + 1;
  const titleAreaH = titleFontSize + 6;
  const bodyH = Math.max(0, h - padding - titleAreaH - padding);

  let borderColor = '#5a8a9a';
  if (node.id) {
    const obj = appState.nodeMeshes.get(node.id);
    if (obj?.mesh?.material?.color) borderColor = '#' + obj.mesh.material.color.getHexString();
    else if (node.fixedColor) borderColor = node.fixedColor;
  }

  // 检测跨图层连接
  const hasCrossEdges = node.id && appState.crossEdges && appState.crossEdges.some(e => {
    if (e.source !== node.id && e.target !== node.id) return false;
    const srcLayer = appState.getLayerForNode ? appState.getLayerForNode(e.source) : null;
    const tgtLayer = appState.getLayerForNode ? appState.getLayerForNode(e.target) : null;
    return !srcLayer || !tgtLayer || srcLayer.id !== tgtLayer.id;
  });

  const ctx = s.ctx;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);

  // 跨图层呼吸外圈
  if (hasCrossEdges && !highlighted) {
    const breath = Math.sin(performance.now() * 0.003) * 0.5 + 0.8;
    const gap = 3 + breath * 4;
    const outerAlpha = 0.6 + breath * 0.4;
    ctx.save();
    ctx.globalAlpha = alpha * outerAlpha;
    ctx.strokeStyle = isCurrentlyEditing ? '#00cc66' : borderColor;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = isCurrentlyEditing ? '#00cc66' : borderColor;
    ctx.shadowBlur = 4 + breath * 6;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-gap, -gap, w + gap * 2, h + gap * 2, (6 + gap) * scale);
    else ctx.rect(-gap, -gap, w + gap * 2, h + gap * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 卡片背景（状态颜色与普通节点一致）
  if (isCurrentlyEditing) {
    const pulse = 0.6 + 0.4 * Math.sin(performance.now() * 0.003);
    ctx.shadowColor = '#00cc66';
    ctx.shadowBlur = 10 + pulse * 6;
    ctx.fillStyle = '#0a3a1a';
    ctx.strokeStyle = '#00cc66';
    ctx.lineWidth = 2.5;
  } else if (selected) {
    ctx.fillStyle = '#3a3520';
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 2.5;
  } else if (highlighted) {
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#0a2a3a';
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 2.5;
  } else if (connectedStep) {
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.006);
    ctx.shadowColor = '#AA44FF';
    ctx.shadowBlur = 14 + pulse * 8;
    ctx.fillStyle = '#2a1a3a';
    ctx.strokeStyle = '#AA44FF';
    ctx.lineWidth = 2.5;
  } else if (connected) {
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.006);
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 14 + pulse * 8;
    ctx.fillStyle = '#2a4a5a';
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 2.5;
  } else {
    ctx.fillStyle = '#0d1820';
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1.5;
  }
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(0, 0, w, h, 6 * scale);
  else ctx.rect(0, 0, w, h);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';

  // 标题
  ctx.fillStyle = isCurrentlyEditing ? '#00ff88' : selected ? '#FFD700' : highlighted ? '#00ffff' : connectedStep ? '#CCAAFF' : connected ? '#00ffff' : '#0ff';
  ctx.font = `bold ${titleFontSize}px system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const titleMaxChars = Math.max(5, Math.floor((w - padding * 2) / (titleFontSize * 0.6)));
  const titleText = (node.name || '').slice(0, titleMaxChars);
  ctx.fillText('📄 ' + titleText, padding, padding);

  // 分隔线
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(padding, padding + titleFontSize + 2);
  ctx.lineTo(w - padding, padding + titleFontSize + 2);
  ctx.stroke();

  // 正文区域：记录矩形（世界坐标）供 syncSidebarCardOverlays 同步 DOM overlay 渲染富文本
  if (bodyH > 0 && node.id) {
    s.cardBodyRects.push({
      id: node.id,
      x: x + padding,
      y: y + padding + titleAreaH,
      width: w - padding * 2,
      height: bodyH,
      alpha: alpha
    });
  }

  ctx.restore();
}

// ── 树形面板卡片正文 DOM overlay：与主 2D 视图一致的富文本渲染 ──
//  挂在树形面板容器内部（position:absolute），避免外部堆叠上下文遮挡

function _ensureOverlayLayer(s) {
  // 每个实例在自身 container 内创建一个 overlay 层
  if (s._overlayLayer && s.container.contains(s._overlayLayer)) return s._overlayLayer;
  _injectCardOverlayStyle();  // 复用主视图的 [data-card-overlay] 样式
  // 确保 container 是定位上下文
  if (getComputedStyle(s.container).position === 'static') {
    s.container.style.position = 'relative';
  }
  const layer = document.createElement('div');
  layer.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;overflow:hidden;z-index:10;';
  s.container.appendChild(layer);
  s._overlayLayer = layer;
  return layer;
}

// 隐藏某实例的所有 overlay（实例不可见/销毁时调用）
export function _hideSidebarCardOverlays(s) {
  for (const div of s.cardOverlays.values()) {
    div.style.display = 'none';
  }
}

// 同步所有卡片正文 overlay 的位置/尺寸/内容/透明度（与主视图 syncCardOverlays 对齐）
export function syncSidebarCardOverlays(s) {
  const layer = _ensureOverlayLayer(s);
  const { canvas, transform } = s;
  const seen = new Set();
  for (const r of s.cardBodyRects) {
    seen.add(r.id);
    const node = appState.nodeMap.get(r.id);
    if (!node) continue;
    if (r.alpha < 0.05) continue;

    let div = s.cardOverlays.get(r.id);
    if (!div) {
      div = document.createElement('div');
      div.dataset.cardOverlay = r.id;           // 复用主视图 [data-card-overlay] 样式
      div.style.cssText = 'position:absolute;pointer-events:none;overflow:hidden;box-sizing:border-box;overflow-y:auto;';
      layer.appendChild(div);
      s.cardOverlays.set(r.id, div);
    }
    div.style.display = '';

    // 世界坐标 → 容器内坐标（canvas 填满 container，原点 = canvas 左上角）
    const sx = r.x * transform.scale + canvas.width / 2 + transform.offsetX;
    const sy = r.y * transform.scale + canvas.height / 2 + transform.offsetY;

    div.style.left = sx + 'px';
    div.style.top = sy + 'px';
    div.style.width = r.width + 'px';
    div.style.height = r.height + 'px';
    div.style.transform = `scale(${transform.scale})`;
    div.style.transformOrigin = 'top left';
    div.style.opacity = r.alpha;

    // 内容更新（仅当 richContent 变化时）
    const html = node.richContent || node.desc || '';
    if (div._lastHtml !== html) {
      div.innerHTML = html;
      div._lastHtml = html;
    }
  }
  // 移除不再存在的 overlay
  for (const [id, div] of s.cardOverlays) {
    if (!seen.has(id)) {
      div.remove();
      s.cardOverlays.delete(id);
    }
  }
}

// ── 绘制基础元素 ──
// 根据文字内容计算节点宽度（自适应，不小于基础宽度）
function getSidebarNodeWidth(node, scale, ctx) {
  const fontSize = Math.max(10, 14 * scale);
  const padding = 16 * scale;
  ctx.font = `${fontSize}px system-ui, sans-serif`;
  const textWidth = ctx.measureText((node && node.name) || '').width;
  return Math.max(BASE_NODE_WIDTH * scale, textWidth + padding * 2);
}

// 统一获取节点尺寸：卡片模式用卡片尺寸，普通节点用自适应宽度
export function getSidebarNodeSize(node, scale, ctx) {
  if (node && (node.displayMode === 'card' || node.displayMode === 'webpage')) {
    return getNodeLayoutSize(node, scale);
  }
  return { width: getSidebarNodeWidth(node, scale, ctx), height: BASE_NODE_HEIGHT * scale };
}

export function drawSidebarNode(x, y, node, s, selected = false, alpha = 1, highlighted = false, connected = false, connectedStep = false, isCurrentlyEditing = false) {
  // 卡片/网页模式走独立绘制路径（与主 2D 视图一致）
  if (node.displayMode === 'card' || node.displayMode === 'webpage') {
    return drawSidebarNodeCard(x, y, node, s, selected, alpha, highlighted, connected, connectedStep, isCurrentlyEditing);
  }
  const scale = node.sizeScale || 1;
  const ctx = s.ctx;
  const w = getSidebarNodeWidth(node, scale, ctx);
  const h = BASE_NODE_HEIGHT * scale;
  const fontSize = Math.max(10, 14 * scale);
  const shape = node.nodeShape || (isNextStepNode(node) ? 'stadium' : 'roundedRect');

  let borderColor = '#5a8a9a';
  if (node.id) {
    // 从 3D mesh 材质读取颜色，与主 2D 视图完全一致
    const obj = appState.nodeMeshes.get(node.id);
    if (obj?.mesh?.material?.color) {
      borderColor = '#' + obj.mesh.material.color.getHexString();
    } else if (node.fixedColor) {
      borderColor = node.fixedColor;
    }
  }

  // 检测是否有跨图层连接（仅跨层级连线显示呼吸效果，同层级用户连线不显示）
  const hasCrossEdges = node.id && appState.crossEdges && appState.crossEdges.some(e => {
    if (e.source !== node.id && e.target !== node.id) return false;
    const srcLayer = appState.getLayerForNode ? appState.getLayerForNode(e.source) : null;
    const tgtLayer = appState.getLayerForNode ? appState.getLayerForNode(e.target) : null;
    return !srcLayer || !tgtLayer || srcLayer.id !== tgtLayer.id;
  });

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);

  if (isCurrentlyEditing) {
    // 当前正在编辑的节点：绿色背景，持续高亮
    const pulse = 0.6 + 0.4 * Math.sin(performance.now() * 0.003);
    ctx.shadowColor = '#00cc66';
    ctx.shadowBlur = 10 + pulse * 6;
    ctx.fillStyle = '#0a3a1a';
    ctx.strokeStyle = '#00cc66';
    ctx.lineWidth = 2.5;
  } else if (selected) {
    // 选中节点保持金色高亮，不被 connected 覆盖
    ctx.fillStyle = '#FFD700';
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 2;
  } else if (highlighted) {
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#0a2a3a';
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 3;
  } else if (connectedStep) {
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.006);
    ctx.shadowColor = '#AA44FF';
    ctx.shadowBlur = 14 + pulse * 8;
    ctx.fillStyle = '#2a1a3a';
    ctx.strokeStyle = '#AA44FF';
    ctx.lineWidth = 3;
  } else if (connected) {
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.006);
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
  drawSidebarNodeShape(ctx, 0, 0, w, h, shape, scale);

  // 跨图层连接 → 外圈双实线（带呼吸动画）
  if (hasCrossEdges && !highlighted) {
    const breath = Math.sin(performance.now() * 0.003) * 0.5 + 0.8;
    const gap = 3 + breath * 4;
    const outerAlpha = 0.6 + breath * 0.4;
    ctx.globalAlpha = alpha * outerAlpha;
    ctx.strokeStyle = isCurrentlyEditing ? '#00cc66' : borderColor;
    ctx.lineWidth = 3;
    ctx.shadowColor = isCurrentlyEditing ? '#00cc66' : borderColor;
    ctx.shadowBlur = 4 + breath * 6;
    drawSidebarNodeShape(ctx, -gap, -gap, w + gap * 2, h + gap * 2, shape, scale + gap / Math.max(w, h));
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = alpha;
  }

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.fillStyle = isCurrentlyEditing ? '#00ff88' : selected ? '#000' : highlighted ? '#00ffff' : connectedStep ? '#CCAAFF' : connected ? '#00ffff' : '#c0f0ff';
  ctx.font = `${fontSize}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(node.name || '', w / 2, h / 2);
  ctx.restore();
}

// ── 绘制节点形状（支持四种图形） ──
function drawSidebarNodeShape(ctx, sx, sy, sw, sh, shape, scale) {
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

export function drawSidebarLine(x1, y1, x2, y2, ctx, alpha = 1, color = '#2c6e7e', dash = [], glow = false, glowColor = null) {
  const lineWidth = glow ? 3 : 2;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash(dash);
  ctx.stroke();
  ctx.setLineDash([]);

  // 光晕闪烁效果
  if (glow) {
    const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.008);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = glowColor || color;
    ctx.lineWidth = 5 + pulse * 4;
    ctx.globalAlpha = alpha * (0.3 + pulse * 0.3);
    ctx.setLineDash(dash);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = alpha;
  }

  const angle = Math.atan2(y2 - y1, x2 - x1);
  const arrowLen = 12;
  const tipX = x2 - 4 * Math.cos(angle);
  const tipY = y2 - 4 * Math.sin(angle);
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(tipX - arrowLen * Math.cos(angle - Math.PI / 7), tipY - arrowLen * Math.sin(angle - Math.PI / 7));
  ctx.lineTo(tipX - arrowLen * Math.cos(angle + Math.PI / 7), tipY - arrowLen * Math.sin(angle + Math.PI / 7));
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

// 绘制树状面板中的折线（多段线）
export function drawSidebarPolyline(points, ctx, alpha = 1, color = '#2c6e7e', dash = [], glow = false, glowColor = null) {
  if (points.length < 2) return;
  const lineWidth = glow ? 3 : 2;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash(dash);
  ctx.stroke();
  ctx.setLineDash([]);

  // 光晕闪烁效果（只在最后一段）
  if (glow) {
    const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.008);
    const lastIdx = points.length - 2;
    ctx.beginPath();
    ctx.moveTo(points[lastIdx].x, points[lastIdx].y);
    ctx.lineTo(points[lastIdx + 1].x, points[lastIdx + 1].y);
    ctx.strokeStyle = glowColor || color;
    ctx.lineWidth = 5 + pulse * 4;
    ctx.globalAlpha = alpha * (0.3 + pulse * 0.3);
    ctx.setLineDash(dash);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = alpha;
  }

  // 箭头画在终点
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  const angle = Math.atan2(last.y - prev.y, last.x - prev.x);
  const arrowLen = 12;
  const tipX = last.x - 4 * Math.cos(angle);
  const tipY = last.y - 4 * Math.sin(angle);
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(tipX - arrowLen * Math.cos(angle - Math.PI / 7), tipY - arrowLen * Math.sin(angle - Math.PI / 7));
  ctx.lineTo(tipX - arrowLen * Math.cos(angle + Math.PI / 7), tipY - arrowLen * Math.sin(angle + Math.PI / 7));
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

// 计算折线第 3 段的中点（标签放置位），不足则回退全路径中点
export function getSidebarPolylineThirdSegmentMidpoint(points) {
  if (points.length >= 4) {
    return { x: (points[2].x + points[3].x) / 2, y: (points[2].y + points[3].y) / 2 };
  }
  return getSidebarPolylineMidpoint(points);
}

// 计算折线路径的长度中点
function getSidebarPolylineMidpoint(points) {
  if (points.length < 2) return { x: points[0]?.x || 0, y: points[0]?.y || 0 };
  let totalLen = 0;
  const segLens = [];
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    segLens.push(Math.sqrt(dx * dx + dy * dy));
    totalLen += segLens[segLens.length - 1];
  }
  if (totalLen === 0) return { x: (points[0].x + points[points.length - 1].x) / 2, y: (points[0].y + points[points.length - 1].y) / 2 };
  const halfLen = totalLen / 2;
  let acc = 0;
  for (let i = 0; i < segLens.length; i++) {
    if (acc + segLens[i] >= halfLen) {
      const t = segLens[i] > 0 ? (halfLen - acc) / segLens[i] : 0.5;
      return { x: points[i].x + (points[i + 1].x - points[i].x) * t, y: points[i].y + (points[i + 1].y - points[i].y) * t };
    }
    acc += segLens[i];
  }
  const last = points.length - 1;
  return { x: points[last].x, y: points[last].y };
}

export function findParentNode(nodeId) {
  const root = appState.methodsTree;
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    if (current.children) {
      for (const child of current.children) {
        if (child.id === nodeId) return current;
        stack.push(child);
      }
    }
  }
  return null;
}
