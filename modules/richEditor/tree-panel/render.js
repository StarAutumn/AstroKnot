// ============================================================
//  richEditor/tree-panel/render.js — 树形面板 2D 渲染主流程
//  - 展开收起动画（进度/可见度 alpha）、递归绘制树、跨图层连线
//  - 主绘制 drawSidebar2D、视图刷新、键盘平移（帧率解耦）
// ============================================================
import { appState } from '../../module0_AppState.js';
import {
  layoutTree, assignCoordinates, extractNodePositions,
  resolveNodeOverlaps, resolveNodeLineOverlaps,
  isNextStepNode, groupRects,
  POLYLINE_PEG_X, POLYLINE_PEG_Y,
  getNodeAnchors
} from '../../2DView/index.js';
import { instances, getActiveState, getBreathingLineColor, PAN_PIXELS_PER_SEC, getLastSidebarPanTime, setLastSidebarPanTime } from './share.js';
import {
  _hideSidebarCardOverlays, syncSidebarCardOverlays, getSidebarNodeSize,
  drawSidebarNode, drawSidebarLine, drawSidebarPolyline,
  getSidebarPolylineThirdSegmentMidpoint, findParentNode
} from './draw-nodes.js';
import { resizeSidebarCanvas } from './index.js';

function getAnimationProgress(s, nodeId) {
  const anim = s.animations.find(a => a.nodeId === nodeId);
  if (!anim) return null;
  const elapsed = performance.now() - anim.startTime;
  const t = Math.min(1, elapsed / anim.duration);
  const progress = anim.direction === 'expand' ? t : (1 - t);
  return { progress, finished: t >= 1, direction: anim.direction };
}

function getNodeVisibilityAlpha(s, nodeId) {
  let alpha = 1;
  let currentId = nodeId;
  while (currentId) {
    const node = appState.nodeMap.get(currentId);
    if (!node) break;
    const parent = findParentNode(currentId);
    if (!parent) break;
    const animState = getAnimationProgress(s, parent.id);
    if (appState.collapsed2D.has(parent.id)) {
      if (animState && animState.direction === 'expand') alpha *= animState.progress;
      else return 0;
    } else if (animState && animState.direction === 'collapse') alpha *= animState.progress;
    currentId = parent.id;
  }
  return alpha;
}

export function toggleSidebarCollapse(nodeId) {
  if (!appState.nodeMap.has(nodeId)) return;
  const wasCollapsed = appState.collapsed2D.has(nodeId);
  const direction = wasCollapsed ? 'expand' : 'collapse';
  for (const [_, s] of instances) {
    s.animations = s.animations.filter(a => a.nodeId !== nodeId);
    s.animations.push({ nodeId, direction, startTime: performance.now(), duration: 300 });
    requestAnimationFrame(() => {
      if (s.visible) drawSidebar2D(s);
    });
  }
}

// ── 递归绘制树 ──
function drawSidebarTreeRecursive(layout, positionMap, s, parentCollapsedProgress = null, isRoot = true, layerNodeIds = null, deferredCards = null) {
  if (!layout?.node) return;
  const { node } = layout;
  const _nodeScale = node.sizeScale || 1;
  const { width, height } = getSidebarNodeSize(node, _nodeScale, s.ctx);
  const nodeId = node.id;
  const isSelected = nodeId ? appState.selectedNodeIds.has(nodeId) : false;
  const isHighlighted = nodeId === s.highlightedNodeId;
  const isConnected = nodeId && appState.connectedNodeIds && appState.connectedNodeIds.has(nodeId);
  const isConnectedStep = nodeId && appState.connectedStepNodeIds && appState.connectedStepNodeIds.has(nodeId);
  const isCurrentlyEditing = nodeId === appState.currentEditNodeId;
  const pos = positionMap.get(nodeId);

  // 图层过滤：不在当前图层的节点降低透明度
  const inLayer = !layerNodeIds || (nodeId && layerNodeIds.has(nodeId));

  if (pos && !isRoot && inLayer) {
    let nodeAlpha = 1;
    if (parentCollapsedProgress !== null) nodeAlpha = parentCollapsedProgress;
    // 连线压卡片下：deferredCards 存在时先收集卡片绘制，递归结束后统一画
    if (deferredCards) {
      deferredCards.push({ x: pos.x, y: pos.y, node, selected: isSelected, alpha: nodeAlpha, highlighted: isHighlighted, connected: isConnected, connectedStep: isConnectedStep, isCurrentlyEditing });
    } else {
      drawSidebarNode(pos.x, pos.y, node, s, isSelected, nodeAlpha, isHighlighted, isConnected, isConnectedStep, isCurrentlyEditing);
    }
  }

  const isCurrentlyCollapsed = appState.collapsed2D.has(nodeId);
  const animState = getAnimationProgress(s, nodeId);
  let effectiveProgress = null;
  if (animState) {
    if (animState.finished) {
      s.animations = s.animations.filter(a => a.nodeId !== nodeId);
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
    const isEdgeEndpointSelected = (nodeId && appState.selectedNodeIds.has(nodeId)) || (child.node.id && appState.selectedNodeIds.has(child.node.id));
    const isGlowing = (isChildConnected || isChildConnectedStep) && isEdgeEndpointSelected;
    const dynamicHue = (Date.now() * 0.02) % 360;
    let lineColor = isChildConnectedStep ? '#AA44FF' : isChildConnected ? '#00ccff' : getBreathingLineColor();
    let glowColor = isChildConnectedStep ? '#AA44FF' : isChildConnected ? '#00ffff' : null;
    let customColorHex = null;
    let lineItem = null;
    if (nodeId && !isRoot && !isStepNode) {
      lineItem = appState.lineItems.find(item => item.startId === nodeId && item.endId === child.node.id);
      if (lineItem?.line.customColor) {
        customColorHex = '#' + lineItem.line.customColor.getHexString();
        lineColor = customColorHex;
      }
    }

    const parentX = pos ? pos.x : layout.x;
    const parentY = pos ? pos.y : layout.y;
    const _childScale = child.node.sizeScale || 1;
    const { width: childW, height: childH } = getSidebarNodeSize(child.node, _childScale, s.ctx);
    let parentOutputX, parentOutputY, childInputX, childInputY;
    if (isStepNode) {
      parentOutputX = parentX + width / 2;
      parentOutputY = parentY + height;
      childInputX = childPos.x + childW / 2;
      childInputY = childPos.y;
    } else {
      parentOutputX = parentX + width;
      parentOutputY = parentY + height / 2;
      childInputX = childPos.x;
      childInputY = childPos.y + childH / 2;
    }

    const childAlpha = effectiveProgress !== null ? effectiveProgress : 1;
    // 图层过滤：子节点不在当前图层则跳过
    const childInLayer = !layerNodeIds || (child.node.id && layerNodeIds.has(child.node.id));
    if (!childInLayer) continue;
    const dashPattern = isStepNode ? [8, 3, 2, 3] : [];
    let labelMidX, labelMidY;
    if (!isRoot && nodeId !== null) {
      if (isStepNode) {
        // Step 折线：父下框中点 → 下短距拐点 → 左右延伸到子节点竖直线 → 下连到子上框中点
        const pegY = parentOutputY + POLYLINE_PEG_Y;
        const polyPoints = [
          { x: parentOutputX, y: parentOutputY },
          { x: parentOutputX, y: pegY },
          { x: childInputX,  y: pegY },
          { x: childInputX,  y: childInputY }
        ];
        drawSidebarPolyline(polyPoints, s.ctx, childAlpha, lineColor, dashPattern, isGlowing, glowColor);
        const mid = getSidebarPolylineThirdSegmentMidpoint(polyPoints);
        labelMidX = mid.x;
        labelMidY = mid.y;
      } else {
        // 普通父子连线改为折线
        const pegX = parentOutputX + POLYLINE_PEG_X;
        const polyPoints = [
          { x: parentOutputX, y: parentOutputY },
          { x: pegX,         y: parentOutputY },
          { x: pegX,         y: childInputY },
          { x: childInputX,  y: childInputY }
        ];
        drawSidebarPolyline(polyPoints, s.ctx, childAlpha, lineColor, dashPattern, isGlowing, glowColor);
        const mid = getSidebarPolylineThirdSegmentMidpoint(polyPoints);
        labelMidX = mid.x;
        labelMidY = mid.y;
      }
      const treeKey = `${nodeId}->${child.node.id}`;
      const treeMeta = appState.treeEdgeLabels.get(treeKey);
      const edgeLabel = lineItem?.line.mesh.userData.label || treeMeta?.label;
      const edgeLabelHidden = lineItem?.line.mesh.userData.labelHidden ?? treeMeta?.labelHidden ?? true;
      if (edgeLabel && !edgeLabelHidden && appState.showAllLabels) {
        s.ctx.fillStyle = '#ffd966';
        s.ctx.font = '11px system-ui, sans-serif';
        s.ctx.textAlign = 'center';
        s.ctx.textBaseline = 'middle';
        s.ctx.fillText(edgeLabel, labelMidX, labelMidY - 8);
      }
    }
    drawSidebarTreeRecursive(child, positionMap, s, effectiveProgress, false, layerNodeIds, deferredCards);
  }
}

function drawSidebarCrossEdges(positionMap, s, layerNodeIds = null) {
  const edges = appState.crossEdges || [];
  for (const edge of edges) {
    const sourceAlpha = getNodeVisibilityAlpha(s, edge.source);
    const targetAlpha = getNodeVisibilityAlpha(s, edge.target);
    const edgeAlpha = Math.min(sourceAlpha, targetAlpha);
    if (edgeAlpha <= 0) continue;
    // 图层隔离：有一端不在当前图层则不画线（由双边框指示）
    const sourceInLayer = !layerNodeIds || (edge.source && layerNodeIds.has(edge.source));
    const targetInLayer = !layerNodeIds || (edge.target && layerNodeIds.has(edge.target));
    if (!sourceInLayer || !targetInLayer) continue;
    const sourcePos = positionMap.get(edge.source);
    const targetPos = positionMap.get(edge.target);
    if (!sourcePos || !targetPos) continue;
    const sourceScale = appState.nodeMap.get(edge.source)?.sizeScale || 1;
    const targetScale = appState.nodeMap.get(edge.target)?.sizeScale || 1;
    // 卡片模式使用卡片尺寸，普通节点使用自适应宽度
    const srcNode = appState.nodeMap.get(edge.source);
    const tgtNode = appState.nodeMap.get(edge.target);
    const srcSize = getSidebarNodeSize(srcNode, sourceScale, s.ctx);
    const tgtSize = getSidebarNodeSize(tgtNode, targetScale, s.ctx);
    // 锚点支持
    let x1, y1, x2, y2;
    if (edge.sourceAnchor) {
      const srcAnchors = getNodeAnchors(sourcePos.x, sourcePos.y, srcSize.width, srcSize.height);
      const sa = srcAnchors[edge.sourceAnchor];
      x1 = sa ? sa.x : sourcePos.x + srcSize.width / 2;
      y1 = sa ? sa.y : sourcePos.y + srcSize.height;
    } else {
      x1 = sourcePos.x + srcSize.width / 2;
      y1 = sourcePos.y + srcSize.height;
    }
    if (edge.targetAnchor) {
      const tgtAnchors = getNodeAnchors(targetPos.x, targetPos.y, tgtSize.width, tgtSize.height);
      const ta = tgtAnchors[edge.targetAnchor];
      x2 = ta ? ta.x : targetPos.x + tgtSize.width / 2;
      y2 = ta ? ta.y : targetPos.y;
    } else {
      x2 = targetPos.x + tgtSize.width / 2;
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
    // 有拐点则画折线，否则画直线
    if (edge.waypoints && edge.waypoints.length > 0) {
      const points = [{ x: x1, y: y1 }];
      for (const wp of edge.waypoints) points.push({ x: wp.x, y: wp.y });
      points.push({ x: x2, y: y2 });
      drawSidebarPolyline(points, s.ctx, edgeAlpha, strokeColor, [6, 4], isCrossEndConnected, crossGlowColor);
      if (edge.label && !edge.labelHidden && appState.showAllLabels) {
        const midPt = getSidebarPolylineThirdSegmentMidpoint(points);
        s.ctx.save();
        s.ctx.globalAlpha = edgeAlpha;
        s.ctx.fillStyle = '#ffd966';
        s.ctx.font = '11px system-ui, sans-serif';
        s.ctx.textAlign = 'center';
        s.ctx.textBaseline = 'middle';
        s.ctx.fillText(edge.label, midPt.x, midPt.y - 8);
        s.ctx.restore();
      }
    } else {
      drawSidebarLine(x1, y1, x2, y2, s.ctx, edgeAlpha, strokeColor, [6, 4], isCrossEndConnected, crossGlowColor);
      if (edge.label && !edge.labelHidden && appState.showAllLabels) {
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        s.ctx.save();
        s.ctx.globalAlpha = edgeAlpha;
        s.ctx.fillStyle = '#ffd966';
        s.ctx.font = '11px system-ui, sans-serif';
        s.ctx.textAlign = 'center';
        s.ctx.textBaseline = 'middle';
        s.ctx.fillText(edge.label, midX, midY - 8);
        s.ctx.restore();
      }
    }
  }
}

// ── 主绘制函数（接受状态参数） ──
export function drawSidebar2D(s) {
  if (!s) s = getActiveState();
  if (!s || !s.visible || !s.ctx || !s.canvas) {
    if (s) _hideSidebarCardOverlays(s);  // 实例不可见时隐藏其卡片 overlay
    return;
  }
  if (!appState.methodsTree) return;

  s.cardBodyRects = [];  // 清空上一帧的卡片正文矩形，绘制过程中重新收集

  const { ctx, canvas, transform } = s;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = appState.bgColor2D || '#01010c';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const proj = appState.projects.find(p => p.id === appState.currentProjectId);
  const projectName = proj ? proj.name : '🧬 知识网络';
  ctx.fillStyle = '#5a8a9a';
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(projectName, 8, 6);

  ctx.save();
  ctx.translate(canvas.width / 2 + transform.offsetX, canvas.height / 2 + transform.offsetY);
  ctx.scale(transform.scale, transform.scale);

  ctx.strokeStyle = appState.gridColor2D || '#1a2a34';
  ctx.lineWidth = 0.5;
  const gridSize = 40;
  const startX = -canvas.width, endX = canvas.width * 2;
  const startY = -canvas.height, endY = canvas.height * 2;
  for (let x = startX; x < endX; x += gridSize) { ctx.beginPath(); ctx.moveTo(x, startY); ctx.lineTo(x, endY); ctx.stroke(); }
  for (let y = startY; y < endY; y += gridSize) { ctx.beginPath(); ctx.moveTo(startX, y); ctx.lineTo(endX, y); ctx.stroke(); }

  // 绘制组群矩形
  for (const gr of groupRects) {
    if (gr.layerId && gr.layerId !== appState.currentLayerId) continue;
    ctx.save();
    const hexToRgba = (hex, a) => {
      const r = parseInt(hex.slice(1,3), 16);
      const g = parseInt(hex.slice(3,5), 16);
      const b = parseInt(hex.slice(5,7), 16);
      return `rgba(${r},${g},${b},${a})`;
    };
    const alpha = gr.fillOpacity !== undefined ? gr.fillOpacity : 0.25;
    ctx.fillStyle = hexToRgba(gr.fillColor || '#4a3c7e', alpha);
    ctx.strokeStyle = gr.borderColor || '#7a6aae';
    ctx.lineWidth = gr.lineWidth !== undefined ? gr.lineWidth : 1.5;
    const dashMap = { solid: [], dashed: [6, 4], dotted: [2, 4] };
    ctx.setLineDash(dashMap[gr.lineStyle] || [6, 4]);
    const br = gr.borderRadius || 0;
    ctx.beginPath();
    if (br > 0 && ctx.roundRect) {
      ctx.roundRect(gr.x, gr.y, gr.width, gr.height, br);
    } else {
      ctx.rect(gr.x, gr.y, gr.width, gr.height);
    }
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    // 绘制组群名称标签
    if (gr.name) {
      ctx.font = '11px system-ui, sans-serif';
      const textMetrics = ctx.measureText(gr.name);
      const labelH = 18;
      const labelPad = 5;
      const labelW = textMetrics.width + labelPad * 2;
      const labelX = gr.x + 3;
      const labelY = gr.y + 3;
      ctx.fillStyle = hexToRgba(gr.borderColor || '#7a6aae', 0.85);
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(labelX, labelY, labelW, labelH, 3);
      else ctx.rect(labelX, labelY, labelW, labelH);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(gr.name, labelX + labelPad, labelY + labelH / 2);
    }
    ctx.restore();
  }

  s.nodeHitAreas = [];

  const layout = layoutTree(appState.methodsTree);
  const rootStartX = -canvas.width / 2 + 30;
  const rootStartY = -layout.subtreeHeight / 2;
  assignCoordinates(layout, rootStartX, rootStartY);

  const existingPosIds = new Set(appState.positions2D.keys());
  const positionMap = extractNodePositions(layout);
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
  resolveNodeOverlaps(positionMap, existingPosIds);
  resolveNodeLineOverlaps(positionMap, layout, existingPosIds);

  // 获取当前图层节点集合，用于过滤显示
  const curLayer = appState.getCurrentLayer();
  const layerNodeIds = curLayer?.nodeIds || null;

  drawSidebarCrossEdges(positionMap, s, layerNodeIds);
  // 连线压卡片下：递归中先画全部连线，卡片延迟收集，递归结束后统一绘制
  const deferredCards = [];
  drawSidebarTreeRecursive(layout, positionMap, s, null, true, layerNodeIds, deferredCards);
  for (const c of deferredCards) {
    drawSidebarNode(c.x, c.y, c.node, s, c.selected, c.alpha, c.highlighted, c.connected, c.connectedStep, c.isCurrentlyEditing);
  }

  for (const [id, pos] of positionMap.entries()) {
    const node = appState.nodeMap.get(id);
    if (node) {
      const scale = node.sizeScale || 1;
      const { width: nw, height: nh } = getSidebarNodeSize(node, scale, ctx);
      s.nodeHitAreas.push({ id, x: pos.x, y: pos.y, width: nw, height: nh });
    }
  }

  ctx.restore();

  // 同步卡片正文 DOM overlay（与主 2D 视图一致的富文本渲染）
  syncSidebarCardOverlays(s);

  if (s.animations.length > 0) {
    requestAnimationFrame(() => {
      if (s.visible) drawSidebar2D(s);
    });
  }
}

export function refreshSidebar2DView() {
  for (const [_, s] of instances) resizeSidebarCanvas(s);
}

export function processSidebar2DPanning() {
  const s = getActiveState();
  if (!s || !s.canvas) return;
  const now = performance.now();
  const dt = getLastSidebarPanTime() > 0 ? Math.min(0.05, (now - getLastSidebarPanTime()) / 1000) : 1 / 90;
  setLastSidebarPanTime(now);
  let dx = 0, dy = 0;
  if (s.keys.a || s.keys.ArrowLeft) dx += PAN_PIXELS_PER_SEC;
  if (s.keys.d || s.keys.ArrowRight) dx -= PAN_PIXELS_PER_SEC;
  if (s.keys.w || s.keys.ArrowUp) dy += PAN_PIXELS_PER_SEC;
  if (s.keys.s || s.keys.ArrowDown) dy -= PAN_PIXELS_PER_SEC;
  if (dx !== 0 || dy !== 0) {
    s.highlightedNodeId = null;
    s.transform.offsetX += dx * dt;
    s.transform.offsetY += dy * dt;
    drawSidebar2D(s);
  }
}
