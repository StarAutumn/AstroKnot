// ============================================================
//  2DView / Render.js — 渲染绘制
//  负责所有 Canvas 绘制逻辑
// ============================================================

import { appState } from '../module0_AppState.js';
import {
  ctx, canvas, visible, transform,
  groupRects, selectedGroupRectId, HANDLE_SIZE,
  animations, setAnimations,
  BASE_NODE_WIDTH, BASE_NODE_HEIGHT, H_GAP, V_GAP,
  POLYLINE_PEG_X, POLYLINE_PEG_Y,
  nodeHitAreas, setNodeHitAreas,
  lineHitAreas, setLineHitAreas,
  isBoxSelecting, boxSelectStart, boxSelectEnd, boxSelectTransform, boxSelectNodeIds,
  getGroupHandlePositions,
  isFreeDrawing, freeDrawState, ANCHOR_RADIUS, ANCHOR_KEYS, getNodeAnchors,
  hoveredNodeId, quickAddHover, QUICK_ADD_RADIUS,
  getNodeWidth
} from './shared.js';
import {
  layoutTree, assignCoordinates, extractNodePositions,
  isNextStepNode
} from './Layout.js';

// 帧内计数器：替代 Date.now()，避免每帧系统调用
let _renderHue = 0;
// 帧内时间戳缓存：draw() 顶部算一次，drawNode 内复用
let _frameNow = 0;

// ── 全局连线呼吸色：全色域缓慢循环，饱和度压低保持灰感，~30s 周期 ──
function getBreathingLineColor() {
  const t = _frameNow * 0.001;  // 秒（复用帧内时间戳，避免 Date.now() 系统调用）
  const hue = (t % 30) / 8 * 360;  // 0~360° 全色域，30 秒一圈
  const sat = 70 + 6 * Math.sin(t * 0.3);
  const lit = 50 + 4 * Math.sin(t * 0.35);
  return `hsl(${hue}, ${sat}%, ${lit}%)`;
}
// lineItems 预索引 Map：O(1) 查找替代线性查找
let _lineItemsMap = new Map();
let _lineItemsMapArrayRef = null;  // （已废弃）原数组引用检测，改为每帧重建

// 视口裁剪边界（世界坐标），draw() 每帧更新，drawTreeRecursive/drawCrossEdges 使用
let _viewportBounds = null;

// -------- 布局缓存（平移/缩放时跳过重算） --------
let _cachedLayout = null;
let _cachedPositionMap = null;
let _layoutDirty = true;
let _lastCanvasWidth = 0;
let _lastCanvasHeight = 0;

/** 标记布局需要重新计算（树结构/位置/折叠状态变化时调用） */
export function mark2DDirty() { _layoutDirty = true; }

// -------- 跨层连线节点索引（避免每节点 O(E) 线性扫描） --------
let _crossEdgeNodesSet = new Set();  // 涉及跨层连线的节点 id 集合
let _crossEdgesArrayRef = null;       // 用数组引用检测变化

function _rebuildCrossEdgeIndex() {
  const arr = appState.crossEdges;
  // 始终重建，避免 push 后引用不变跳过重建
  _crossEdgesArrayRef = arr;
  _crossEdgeNodesSet = new Set();
  if (!arr || arr.length === 0) return;
  for (const e of arr) {
    if (!e) continue;
    const srcLayer = appState.getLayerForNode ? appState.getLayerForNode(e.source) : null;
    const tgtLayer = appState.getLayerForNode ? appState.getLayerForNode(e.target) : null;
    if (!srcLayer || !tgtLayer || srcLayer.id !== tgtLayer.id) {
      _crossEdgeNodesSet.add(e.source);
      _crossEdgeNodesSet.add(e.target);
    }
  }
}

// -------- 动画进度索引（避免每节点 O(A) find 遍历） --------
let _animationsMap = new Map();
let _animationsArrayRef = null;

function _rebuildAnimationsIndex() {
  const arr = animations;
  if (_animationsArrayRef === arr) return;
  _animationsArrayRef = arr;
  _animationsMap = new Map();
  for (const a of arr) {
    if (a && a.nodeId) _animationsMap.set(a.nodeId, a);
  }
}

// ============================================================
//  图层过滤
// ============================================================
function isNodeInCurrentLayer(nodeId) {
  if (!nodeId) return false;
  const layer = appState.getCurrentLayer();
  if (!layer || !layer.nodeIds) return true;
  return layer.nodeIds.has(nodeId);
}

// ============================================================
//  动画进度
// ============================================================
function getAnimationProgress(nodeId) {
  const anim = _animationsMap.get(nodeId);
  if (!anim) return null;
  const elapsed = _frameNow - anim.startTime;
  const t = Math.min(1, elapsed / anim.duration);
  const progress = anim.direction === 'expand' ? t : (1 - t);
  return { progress, finished: t >= 1, direction: anim.direction };
}

// ============================================================
//  绘制单个节点
// ============================================================
function drawNode(x, y, node, selected = false, alpha = 1, connected = false, connectedStep = false, hasCrossEdges = false) {
  const scale = node.sizeScale || 1;
  const w = getNodeWidth(node, scale);
  const h = BASE_NODE_HEIGHT * scale;
  const fontSize = Math.max(10, 14 * scale);
  const shape = node.nodeShape || (isNextStepNode(node) ? 'stadium' : 'roundedRect');

  let borderColor = '#5a8a9a';
  if (node.id) {
    const obj = appState.nodeMeshes.get(node.id);
    if (obj?.mesh?.material?.color) borderColor = '#' + obj.mesh.material.color.getHexString();
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
  ctx.fill();
  ctx.stroke();

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
  if (hasCrossEdges) {
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
//  绘制节点形状（支持四种图形）
// ============================================================
function drawNodeShape(sx, sy, sw, sh, shape, scale) {
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
//  绘制连线
// ============================================================
function drawLine(x1, y1, x2, y2, alpha = 1, color = '#2c6e7e', edgeData = null, dash = [], glow = false, glowColor = null, drawArrow = true) {
  const lineWidth = glow ? 3 : 2;
  setLineHitAreas([...lineHitAreas, { x1, y1, x2, y2, edgeData, color, lineWidth }]);
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
    const pulse = 0.5 + 0.5 * Math.sin(_renderHue * 0.08);
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

  if (drawArrow) {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const arrowLen = 12;
    const tipX = x2 - 4 * Math.cos(angle);
    const tipY = y2 - 4 * Math.sin(angle);
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(
      tipX - arrowLen * Math.cos(angle - Math.PI / 7),
      tipY - arrowLen * Math.sin(angle - Math.PI / 7)
    );
    ctx.lineTo(
      tipX - arrowLen * Math.cos(angle + Math.PI / 7),
      tipY - arrowLen * Math.sin(angle + Math.PI / 7)
    );
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  ctx.restore();
}

// ============================================================
//  绘制折线（支持 waypoint 的多段线）
// ============================================================
function drawPolyline(points, alpha = 1, color = '#2c6e7e', edgeData = null, dash = [], glow = false, glowColor = null) {
  if (points.length < 2) return;
  for (let i = 0; i < points.length - 1; i++) {
    const isLast = (i === points.length - 2);
    drawLine(points[i].x, points[i].y, points[i + 1].x, points[i + 1].y,
      alpha, color, edgeData, dash, glow, glowColor, isLast);
  }
}

// 计算折线第 3 段的中点（标签放置位），不足 3 段则回退全路径中点
function getPolylineThirdSegmentMidpoint(points) {
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
function drawAnchorsOnNode(x, y, w, h, nodeId) {
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
function drawAllAnchorPoints(positionMap) {
  if (!appState.connectionMode || appState.connectionMode !== 'add') return;
  for (const [id, pos] of positionMap.entries()) {
    const node = appState.nodeMap.get(id);
    if (!node) continue;
    // 只显示当前图层的锚点
    if (!isNodeInCurrentLayer(id)) continue;
    const scale = node.sizeScale || 1;
    const w = getNodeWidth(node, scale);
    const h = BASE_NODE_HEIGHT * scale;
    drawAnchorsOnNode(pos.x, pos.y, w, h, id);
  }
}

// ============================================================
//  绘制自由连线过程中的预览线
// ============================================================
function drawFreeDrawPreview() {
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

// ============================================================
//  视口裁剪辅助：矩形（世界坐标）是否与视口有交集
// ============================================================
function _isRectInViewport(x, y, w, h) {
  if (!_viewportBounds) return true; // 未初始化时不裁剪
  return x + w > _viewportBounds.left && x < _viewportBounds.right &&
         y + h > _viewportBounds.top && y < _viewportBounds.bottom;
}

// ============================================================
//  递归绘制树
// ============================================================
function drawTreeRecursive(layout, positionMap, parentCollapsedProgress = null, isRoot = true) {
  if (!layout?.node) return;
  const { node, width, height } = layout;
  const nodeId = node.id;
  const isSelected = nodeId ? (appState.selectedNodeIds.has(nodeId) || boxSelectNodeIds.has(nodeId)) : false;
  const isConnected = nodeId && appState.connectedNodeIds && appState.connectedNodeIds.has(nodeId);
  const isConnectedStep = nodeId && appState.connectedStepNodeIds && appState.connectedStepNodeIds.has(nodeId);
  const pos = positionMap.get(nodeId);

  if (pos && !isRoot) {
    const nodeInLayer = isNodeInCurrentLayer(nodeId);
    if (nodeInLayer) {
      // 视口裁剪：跳过屏外节点绘制
      const nodeW = BASE_NODE_WIDTH * (node.sizeScale || 1);
      const nodeH = BASE_NODE_HEIGHT * (node.sizeScale || 1);
      if (_isRectInViewport(pos.x, pos.y, nodeW, nodeH)) {
        let nodeAlpha = 1;
        if (parentCollapsedProgress !== null) nodeAlpha = parentCollapsedProgress;
        const hasCross = nodeId ? _crossEdgeNodesSet.has(nodeId) : false;
        drawNode(pos.x, pos.y, node, isSelected, nodeAlpha, isConnected, isConnectedStep, hasCross);
      }
    }
  }

  const isCurrentlyCollapsed = appState.collapsed2D.has(nodeId);
  const animState = getAnimationProgress(nodeId);
  let effectiveProgress = null;
  if (animState) {
    if (animState.finished) {
      let filtered = [];
      for (const a of animations) {
        if (a.nodeId !== nodeId) filtered.push(a);
      }
      setAnimations(filtered);
      if (animState.direction === 'collapse') appState.collapsed2D.add(nodeId);
      else appState.collapsed2D.delete(nodeId);
      if (animState.direction === 'collapse') return;
    } else effectiveProgress = animState.progress;
  } else effectiveProgress = parentCollapsedProgress;

  if (isCurrentlyCollapsed && !animState) return;

  for (const child of layout.children) {
    const childPos = positionMap.get(child.node.id);
    if (!childPos) continue;

    const isStepNode = isNextStepNode(child.node);
    const isChildConnected = child.node.id && appState.connectedNodeIds && appState.connectedNodeIds.has(child.node.id);
    const isChildConnectedStep = child.node.id && appState.connectedStepNodeIds && appState.connectedStepNodeIds.has(child.node.id);
    // 仅当连线一端是选中节点时才发光，避免祖父→父线也被高亮
    const isEdgeEndpointSelected = (nodeId && appState.selectedNodeIds.has(nodeId)) || (child.node.id && appState.selectedNodeIds.has(child.node.id));
    let isGlowing = (isChildConnected || isChildConnectedStep) && isEdgeEndpointSelected;
    let lineColor = isChildConnectedStep ? '#AA44FF' : isChildConnected ? '#00ccff' : getBreathingLineColor();
    let glowColor = isChildConnectedStep ? '#AA44FF' : isChildConnected ? '#00ffff' : null;
    let customColorHex = null;
    let lineItem = null;
    if (nodeId && !isRoot) {
      const mapKey = `${nodeId}->${child.node.id}`;
      lineItem = _lineItemsMap.get(mapKey);
      let foundColor = lineItem?.line.customColor;
      // 回退：从 appState.treeEdgeCustomColors 查找（不依赖 3D lineItem）
      let foundHex = null;
      if (!foundColor && appState.treeEdgeCustomColors) {
        foundHex = appState.treeEdgeCustomColors.get(mapKey);
      }
      if (foundColor || foundHex) {
        customColorHex = foundHex || '#' + foundColor.getHexString();
        lineColor = customColorHex;
      }
    }

    const parentX = pos ? pos.x : layout.x;
    const parentY = pos ? pos.y : layout.y;
    let parentOutputX, parentOutputY, childInputX, childInputY;
    if (isStepNode) {
      parentOutputX = parentX + width / 2;
      parentOutputY = parentY + height;
      childInputX = childPos.x + child.width / 2;
      childInputY = childPos.y;
    } else {
      parentOutputX = parentX + width;
      parentOutputY = parentY + height / 2;
      childInputX = childPos.x;
      childInputY = childPos.y + child.height / 2;
    }

    const childAlpha = effectiveProgress !== null ? effectiveProgress : 1;
    const childInLayer = isNodeInCurrentLayer(child.node.id);
    const edgeData = { edgeType: 'tree', startId: nodeId, endId: child.node.id, label: '', labelHidden: true, customColor: customColorHex };
    const dashPattern = isStepNode ? [8, 3, 2, 3] : [];
    if (!isRoot && nodeId !== null && childInLayer) {
      const parentInView = pos ? _isRectInViewport(pos.x, pos.y, BASE_NODE_WIDTH * (node.sizeScale || 1), BASE_NODE_HEIGHT * (node.sizeScale || 1)) : false;
      const childW = BASE_NODE_WIDTH * (child.node.sizeScale || 1);
      const childH = BASE_NODE_HEIGHT * (child.node.sizeScale || 1);
      const childInView = _isRectInViewport(childPos.x, childPos.y, childW, childH);
      let labelMidX = null, labelMidY = null;
      if (parentInView || childInView) {
        if (isStepNode) {
          // Step 连线改为折线：父下框中点 → 下短距拐点 → 左右延伸到子节点竖直线 → 下连到子上框中点
          const pegY = parentOutputY + POLYLINE_PEG_Y;
          const polyPoints = [
            { x: parentOutputX, y: parentOutputY },
            { x: parentOutputX, y: pegY },
            { x: childInputX,  y: pegY },
            { x: childInputX,  y: childInputY }
          ];
          drawPolyline(polyPoints, childAlpha, lineColor, edgeData, dashPattern, isGlowing, glowColor);
          const mid = getPolylineThirdSegmentMidpoint(polyPoints);
          labelMidX = mid.x;
          labelMidY = mid.y;
        } else {
          // 普通父子连线改为折线：父右框中点 → 右短距拐点 → 上下延伸到子节点水平线 → 右拐连到子左框中点
          const pegX = parentOutputX + POLYLINE_PEG_X;
          const polyPoints = [
            { x: parentOutputX, y: parentOutputY },
            { x: pegX,         y: parentOutputY },
            { x: pegX,         y: childInputY },
            { x: childInputX,  y: childInputY }
          ];
          drawPolyline(polyPoints, childAlpha, lineColor, edgeData, dashPattern, isGlowing, glowColor);
          const mid = getPolylineThirdSegmentMidpoint(polyPoints);
          labelMidX = mid.x;
          labelMidY = mid.y;
        }
      }
      if (labelMidX != null) {
        // 优先读 mesh.userData，lineItem 为 null 时回退到 treeEdgeLabels 持久化存储
        const treeKey = `${nodeId}->${child.node.id}`;
        const treeMeta = appState.treeEdgeLabels.get(treeKey);
        const edgeLabel = lineItem?.line.mesh.userData.label || treeMeta?.label;
        const edgeLabelHidden = lineItem?.line.mesh.userData.labelHidden ?? treeMeta?.labelHidden ?? true;
        if (edgeLabel && !edgeLabelHidden && appState.showAllLabels) {
          ctx.fillStyle = '#ffd966';
          ctx.font = '11px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(edgeLabel, labelMidX, labelMidY - 8);
        }
      }
    }
    drawTreeRecursive(child, positionMap, effectiveProgress, false);
  }
}

// ============================================================
//  获取节点可见透明度（考虑祖先折叠状态）
// ============================================================
function getNodeVisibilityAlpha(nodeId) {
  let alpha = 1;
  let currentId = nodeId;
  while (currentId) {
    const node = appState.nodeMap.get(currentId);
    if (!node) break;
    const parent = findParentNode(currentId);
    if (!parent) break;
    const animState = getAnimationProgress(parent.id);
    if (appState.collapsed2D.has(parent.id)) {
      if (animState && animState.direction === 'expand') alpha *= animState.progress;
      else return 0;
    } else if (animState && animState.direction === 'collapse') alpha *= animState.progress;
    currentId = parent.id;
  }
  return alpha;
}

// ============================================================
//  查找父节点
// ============================================================
function findParentNode(nodeId) {
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

// ============================================================
//  绘制交叉连线
// ============================================================
function drawCrossEdges(positionMap) {
  const edges = appState.crossEdges || [];
  for (const edge of edges) {
    const sourceInLayer = isNodeInCurrentLayer(edge.source);
    const targetInLayer = isNodeInCurrentLayer(edge.target);
    if (!sourceInLayer || !targetInLayer) continue;
    const sourceAlpha = getNodeVisibilityAlpha(edge.source);
    const targetAlpha = getNodeVisibilityAlpha(edge.target);
    const edgeAlpha = Math.min(sourceAlpha, targetAlpha);
    if (edgeAlpha <= 0) continue;
    const sourcePos = positionMap.get(edge.source);
    const targetPos = positionMap.get(edge.target);
    if (!sourcePos || !targetPos) continue;
    const sourceScale = appState.nodeMap.get(edge.source)?.sizeScale || 1;
    const targetScale = appState.nodeMap.get(edge.target)?.sizeScale || 1;

    // 视口裁剪：跳过两个端点都在屏外的边
    const srcW = sourceScale * BASE_NODE_WIDTH;
    const srcH = sourceScale * BASE_NODE_HEIGHT;
    const tgtW = targetScale * BASE_NODE_WIDTH;
    const tgtH = targetScale * BASE_NODE_HEIGHT;
    if (!_isRectInViewport(sourcePos.x, sourcePos.y, srcW, srcH) &&
        !_isRectInViewport(targetPos.x, targetPos.y, tgtW, tgtH)) continue;

    // 计算起止点：优先使用锚点，否则默认中心
    let x1, y1, x2, y2;
    if (edge.sourceAnchor) {
      const srcAnchors = getNodeAnchors(sourcePos.x, sourcePos.y, sourceScale * BASE_NODE_WIDTH, sourceScale * BASE_NODE_HEIGHT);
      const sa = srcAnchors[edge.sourceAnchor];
      x1 = sa ? sa.x : sourcePos.x + sourceScale * BASE_NODE_WIDTH / 2;
      y1 = sa ? sa.y : sourcePos.y + sourceScale * BASE_NODE_HEIGHT;
    } else {
      x1 = sourcePos.x + sourceScale * BASE_NODE_WIDTH / 2;
      y1 = sourcePos.y + sourceScale * BASE_NODE_HEIGHT;
    }
    if (edge.targetAnchor) {
      const tgtAnchors = getNodeAnchors(targetPos.x, targetPos.y, targetScale * BASE_NODE_WIDTH, targetScale * BASE_NODE_HEIGHT);
      const ta = tgtAnchors[edge.targetAnchor];
      x2 = ta ? ta.x : targetPos.x + targetScale * BASE_NODE_WIDTH / 2;
      y2 = ta ? ta.y : targetPos.y;
    } else {
      x2 = targetPos.x + targetScale * BASE_NODE_WIDTH / 2;
      y2 = targetPos.y;
    }

    const isCrossSourceConnected = appState.connectedNodeIds && appState.connectedNodeIds.has(edge.source);
    const isCrossTargetConnected = appState.connectedNodeIds && appState.connectedNodeIds.has(edge.target);
    const isCrossSourceConnectedStep = appState.connectedStepNodeIds && appState.connectedStepNodeIds.has(edge.source);
    const isCrossTargetConnectedStep = appState.connectedStepNodeIds && appState.connectedStepNodeIds.has(edge.target);
    const isCrossEndConnected = isCrossSourceConnected || isCrossSourceConnectedStep || isCrossTargetConnected || isCrossTargetConnectedStep;
    let strokeColor = edge.customColor || getBreathingLineColor();
    let crossGlowColor = null;
    if (!edge.customColor) {
      if (isCrossSourceConnectedStep || isCrossTargetConnectedStep) {
        strokeColor = '#AA44FF';
        crossGlowColor = '#AA44FF';
      } else if (isCrossSourceConnected || isCrossTargetConnected) {
        strokeColor = '#00ccff';
        crossGlowColor = '#00ffff';
      }
    }
    const edgeData = { edgeType: 'cross', startId: edge.source, endId: edge.target, label: edge.label, labelHidden: edge.labelHidden, customColor: edge.customColor };

    // 查找对应的 lineItem（用于读取标签数据，与树连线标签逻辑一致）
    const lineItem = appState.lineItems.find(item =>
      item.edgeType === 'cross' &&
      ((item.startId === edge.source && item.endId === edge.target) ||
       (item.startId === edge.target && item.endId === edge.source))
    );

    // 有拐点则画折线，否则画直线
    if (edge.waypoints && edge.waypoints.length > 0) {
      const points = [{ x: x1, y: y1 }];
      for (const wp of edge.waypoints) points.push({ x: wp.x, y: wp.y });
      points.push({ x: x2, y: y2 });
      drawPolyline(points, edgeAlpha, strokeColor, edgeData, [6, 4], isCrossEndConnected, crossGlowColor);
      // 标签画在折线第 3 段中点附近
      const edgeLabel = lineItem?.line.mesh.userData.label || edge.label;
      const edgeLabelHidden = lineItem?.line.mesh.userData.labelHidden ?? edge.labelHidden;
      if (edgeLabel && !edgeLabelHidden && appState.showAllLabels) {
        const midPt = getPolylineThirdSegmentMidpoint(points);
        ctx.fillStyle = '#ffd966';
        ctx.font = '11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(edgeLabel, midPt.x, midPt.y - 8);
      }
    } else {
      drawLine(x1, y1, x2, y2, edgeAlpha, strokeColor, edgeData, [6, 4], isCrossEndConnected, crossGlowColor);
      // 标签 — 与树连线标签渲染方式完全一致
      const edgeLabel = lineItem?.line.mesh.userData.label || edge.label;
      const edgeLabelHidden = lineItem?.line.mesh.userData.labelHidden ?? edge.labelHidden;
      if (edgeLabel && !edgeLabelHidden && appState.showAllLabels) {
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        ctx.fillStyle = '#ffd966';
        ctx.font = '11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(edgeLabel, midX, midY - 8);
      }
    }
  }
}

// ============================================================
//  绘制框选矩形
// ============================================================
function drawBoxSelection() {
  if (!isBoxSelecting && boxSelectNodeIds.size === 0) return;
  const t = boxSelectTransform;
  const minX = Math.min(boxSelectStart.x, boxSelectEnd.x);
  const maxX = Math.max(boxSelectStart.x, boxSelectEnd.x);
  const minY = Math.min(boxSelectStart.y, boxSelectEnd.y);
  const maxY = Math.max(boxSelectStart.y, boxSelectEnd.y);
  const canvasMinX = minX * t.scale + canvas.width / 2 + t.offsetX;
  const canvasMaxX = maxX * t.scale + canvas.width / 2 + t.offsetX;
  const canvasMinY = minY * t.scale + canvas.height / 2 + t.offsetY;
  const canvasMaxY = maxY * t.scale + canvas.height / 2 + t.offsetY;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.strokeStyle = '#4af';
  ctx.fillStyle = 'rgba(68, 170, 255, 0.15)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.rect(canvasMinX, canvasMinY, canvasMaxX - canvasMinX, canvasMaxY - canvasMinY);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// ============================================================
//  主绘制函数
// ============================================================
export function draw() {
  if (!visible || !ctx) return;
  _renderHue = (_renderHue + 0.33) % 360;  // 色相慢速循环（≈18s 一圈）
  _frameNow = performance.now();  // 帧内时间戳：drawNode/getBreathingLineColor 复用，避免多次系统调用
  _rebuildCrossEdgeIndex();       // 跨层连线节点索引（每帧重建）
  _rebuildAnimationsIndex();      // 动画索引（数组引用变化时重建）

  // 预索引 lineItems：每帧重建，避免 addSingleTreeLine(push)/splice 原地修改导致缓存过期
  _lineItemsMap.clear();
  for (const item of appState.lineItems) {
    _lineItemsMap.set(`${item.startId}->${item.endId}`, item);
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = appState.bgColor2D || '#01010c';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const proj = appState.projects.find(p => p.id === appState.currentProjectId);
  const projectName = proj ? proj.name : '🧬 我的知识网络';
  ctx.fillStyle = '#5a8a9a';
  ctx.font = '14px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(projectName, 10, 10);

  ctx.save();
  ctx.translate(canvas.width / 2 + transform.offsetX, canvas.height / 2 + transform.offsetY);
  ctx.scale(transform.scale, transform.scale);

  // 视口裁剪边界（世界坐标），后续 drawTreeRecursive/drawCrossEdges 用于跳过屏外绘制
  const margin = 200;  // 扩展边距，避免边缘闪烁
  _viewportBounds = {
    left: (-canvas.width / 2 - transform.offsetX - margin) / transform.scale,
    right: (canvas.width / 2 - transform.offsetX + margin) / transform.scale,
    top: (-canvas.height / 2 - transform.offsetY - margin) / transform.scale,
    bottom: (canvas.height / 2 - transform.offsetY + margin) / transform.scale
  };

  // 网格（批量绘制 + 视口裁剪，避免数百次独立 stroke 调用）
  ctx.strokeStyle = appState.gridColor2D || '#1a2a34';
  ctx.lineWidth = 0.5;
  const gridSize = (typeof appState.gridSize2D === 'number' && appState.gridSize2D > 0) ? appState.gridSize2D : 40;
  if (_viewportBounds) {
    const gridLeft   = Math.floor(_viewportBounds.left   / gridSize) * gridSize;
    const gridRight  = Math.ceil (_viewportBounds.right  / gridSize) * gridSize;
    const gridTop    = Math.floor(_viewportBounds.top    / gridSize) * gridSize;
    const gridBottom = Math.ceil (_viewportBounds.bottom / gridSize) * gridSize;
    ctx.beginPath();
    for (let x = gridLeft; x <= gridRight; x += gridSize) { ctx.moveTo(x, gridTop); ctx.lineTo(x, gridBottom); }
    for (let y = gridTop; y <= gridBottom; y += gridSize) { ctx.moveTo(gridLeft, y); ctx.lineTo(gridRight, y); }
    ctx.stroke();
  }

  // 绘制组群矩形
  drawGroupRects();

  // 绘制选中组群的把手
  if (selectedGroupRectId) {
    const gr = groupRects.find(g => g.id === selectedGroupRectId);
    if (gr) {
      const hs = HANDLE_SIZE;
      const handles = getGroupHandlePositions(gr);
      ctx.save();
      for (const h of Object.values(handles)) {
        ctx.fillStyle = '#aef0ff';
        ctx.strokeStyle = '#2c6e7e';
        ctx.lineWidth = 1.5;
        ctx.fillRect(h.x, h.y, hs, hs);
        ctx.strokeRect(h.x, h.y, hs, hs);
      }
      ctx.restore();
    }
  }

  setNodeHitAreas([]);
  setLineHitAreas([]);

  // 布局缓存：平移/缩放时跳过重算，仅数据变更时重新计算
  const canvasSizeChanged = canvas.width !== _lastCanvasWidth || canvas.height !== _lastCanvasHeight;
  if (canvasSizeChanged) {
    _lastCanvasWidth = canvas.width;
    _lastCanvasHeight = canvas.height;
    _layoutDirty = true;
  }

  let layout, positionMap;
  if (_layoutDirty) {
    layout = layoutTree(appState.methodsTree);
    const rootStartX = -canvas.width / 2 + 30;
    const rootStartY = -layout.subtreeHeight / 2;
    assignCoordinates(layout, rootStartX, rootStartY);
    positionMap = extractNodePositions(layout);
    // 确保渲染时虚拟根节点和真实根节点使用存储的位置
    const methodsRoot = appState.methodsTree;
    if (methodsRoot && methodsRoot.id) {
      const rootStored = appState.positions2D.get(methodsRoot.id);
      if (rootStored) positionMap.set(methodsRoot.id, { x: rootStored.x, y: rootStored.y });
      for (const child of (methodsRoot.children || [])) {
        if (child && child.id) {
          const childStored = appState.positions2D.get(child.id);
          if (childStored) positionMap.set(child.id, { x: childStored.x, y: childStored.y });
        }
      }
    }
    _cachedLayout = layout;
    _cachedPositionMap = positionMap;
    _layoutDirty = false;
  } else {
    layout = _cachedLayout;
    positionMap = _cachedPositionMap;
  }

  drawCrossEdges(positionMap);
  drawTreeRecursive(layout, positionMap);

  // 绘制连线模式下的锚点（在节点之上）
  drawAllAnchorPoints(positionMap);

  // 绘制自由连线过程中的预览线
  drawFreeDrawPreview();

  for (const [id, pos] of positionMap.entries()) {
    const node = appState.nodeMap.get(id);
    if (node) {
      const scale = node.sizeScale || 1;
      const areas = nodeHitAreas;
      areas.push({ id, x: pos.x, y: pos.y, width: getNodeWidth(node, scale), height: BASE_NODE_HEIGHT * scale });
      setNodeHitAreas(areas);
    }
  }

  drawBoxSelection();
  ctx.restore();

  // 仅在有动画/自由绘制/折叠变化/悬停时自刷新；常规帧由 3D 动画循环驱动 refresh2DView
  if (visible && (animations.length > 0 || isFreeDrawing || hoveredNodeId)) {
    requestAnimationFrame(() => draw());
  }
}


// ============================================================
//  辅助：绘制组群矩形
// ============================================================
function drawGroupRects() {
  const hexToRgba = (hex, a) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
  };
  const dashMap = { solid: [], dashed: [6, 4], dotted: [2, 4] };

  for (const gr of groupRects) {
    if (gr.layerId && gr.layerId !== appState.currentLayerId) continue;
    ctx.save();
    const alpha = gr.fillOpacity !== undefined ? gr.fillOpacity : 0.25;
    ctx.fillStyle = hexToRgba(gr.fillColor || '#4a3c7e', alpha);
    ctx.strokeStyle = gr.borderColor || '#7a6aae';
    ctx.lineWidth = gr.lineWidth !== undefined ? gr.lineWidth : 1.5;
    ctx.setLineDash(dashMap[gr.lineStyle] || [6, 4]);
    const r = gr.borderRadius || 0;
    ctx.beginPath();
    if (r > 0) ctx.roundRect(gr.x, gr.y, gr.width, gr.height, r);
    else ctx.rect(gr.x, gr.y, gr.width, gr.height);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    if (gr.name) {
      ctx.save();
      ctx.font = '13px system-ui, sans-serif';
      const textMetrics = ctx.measureText(gr.name);
      const labelH = 20;
      const labelPad = 6;
      const labelW = textMetrics.width + labelPad * 2;
      const labelX = gr.x + 4;
      const labelY = gr.y + 4;
      ctx.fillStyle = hexToRgba(gr.borderColor || '#7a6aae', 0.85);
      ctx.beginPath();
      ctx.roundRect(labelX, labelY, labelW, labelH, 4);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(gr.name, labelX + labelPad, labelY + labelH / 2);
      ctx.restore();
    }
  }
}