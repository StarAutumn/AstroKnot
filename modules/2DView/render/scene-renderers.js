// ============================================================
//  2DView / render / scene-renderers.js — 树/跨层/组群/框选/视口/排列动画
// ============================================================

import { appState } from '../../module0_AppState.js';
import { countDescendants } from '../../TreeData/data-factory.js';
import {
  ctx, canvas,
  groupRects, selectedGroupRectId, HANDLE_SIZE,
  POLYLINE_PEG_X, POLYLINE_PEG_Y,
  boxSelectStart, boxSelectEnd, boxSelectTransform, boxSelectNodeIds, isBoxSelecting,
  getGroupHandlePositions,
  getNodeAnchors,
  getNodeLayoutSize
} from '../shared.js';
import { isNextStepNode } from '../Layout.js';
import {
  _frameNow, _viewportBounds, _lineItemsMap, hasCrossEdges,
  getBreathingLineColor, finalizeAnimation
} from './frame-state.js';
import {
  isNodeInCurrentLayer, getNodeVisibilityAlpha,
  getAnimationProgress
} from './visibility.js';
import { drawNode } from './node-renderers.js';
import { drawLine, drawPolyline, getPolylineThirdSegmentMidpoint } from './edge-renderers.js';
import { getCardSize, getCardOffset } from './shape-utils.js';

// ============================================================
//  视口裁剪辅助：矩形（世界坐标）是否与视口有交集
// ============================================================
export function _isRectInViewport(x, y, w, h) {
  if (!_viewportBounds) return true; // 未初始化时不裁剪
  return x + w > _viewportBounds.left && x < _viewportBounds.right &&
         y + h > _viewportBounds.top && y < _viewportBounds.bottom;
}

// ============================================================
//  递归绘制树
// ============================================================
export function drawTreeRecursive(layout, positionMap, parentCollapsedProgress = null, isRoot = true, deferredCards = null) {
  if (!layout?.node) return;
  const { node, width, height } = layout;
  const nodeId = node.id;
  const isSelected = nodeId ? (appState.selectedNodeIds.has(nodeId) || boxSelectNodeIds.has(nodeId)) : false;
  const isConnected = nodeId && appState.connectedNodeIds && appState.connectedNodeIds.has(nodeId);
  const isConnectedStep = nodeId && appState.connectedStepNodeIds && appState.connectedStepNodeIds.has(nodeId);
  const pos = _getAnim2DPos(nodeId, positionMap.get(nodeId));

  const isCurrentlyCollapsed = appState.collapsed2D.has(nodeId);

  if (pos && !isRoot) {
    const nodeInLayer = isNodeInCurrentLayer(nodeId);
    if (nodeInLayer) {
      // 视口裁剪：跳过屏外节点绘制（card 模式用卡片实际尺寸）
      const { width: nodeW, height: nodeH } = getNodeLayoutSize(node, node.sizeScale || 1);
      if (_isRectInViewport(pos.x, pos.y, nodeW, nodeH)) {
        // 节点透明度：统一走 getNodeVisibilityAlpha（祖先折叠动画链 + 鱼骨支路折叠隐藏/动画），
        // 2D 卡片显隐与树连线 / 命中判定保持一致
        const nodeAlpha = getNodeVisibilityAlpha(nodeId);
        const hasCross = nodeId ? hasCrossEdges(nodeId) : false;
        // 折叠节点：右下角显示 a/b 徽标（a=直接子节点数，b=全部后代节点数）
        const collapsedBadge = isCurrentlyCollapsed && node.children?.length
          ? { a: node.children.length, b: countDescendants(node) }
          : null;
        // 连线压卡片下：deferredCards 存在时先收集卡片绘制，递归结束后统一画（连线在节点下面）
        if (deferredCards) {
          deferredCards.push(() => drawNode(pos.x, pos.y, node, isSelected, nodeAlpha, isConnected, isConnectedStep, hasCross, collapsedBadge));
        } else {
          drawNode(pos.x, pos.y, node, isSelected, nodeAlpha, isConnected, isConnectedStep, hasCross, collapsedBadge);
        }
      }
    }
  }

  const animState = getAnimationProgress(nodeId);
  let effectiveProgress = null;
  if (animState) {
    if (animState.finished) {
      finalizeAnimation(nodeId, animState.direction);
      if (animState.direction === 'collapse') return;
    } else effectiveProgress = animState.progress;
  } else effectiveProgress = parentCollapsedProgress;

  if (isCurrentlyCollapsed && !animState) return;

  for (const child of layout.children) {
    const childPos = _getAnim2DPos(child.node.id, positionMap.get(child.node.id));
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

    // 连线透明度：两端节点统一走 getNodeVisibilityAlpha（祖先折叠动画链 + 鱼骨支路折叠隐藏/动画），
    // 与卡片显隐/命中判定/3D 树连线保持一致
    const parentAlpha = nodeId ? getNodeVisibilityAlpha(nodeId) : 1;
    const childAlpha = Math.min(parentAlpha, getNodeVisibilityAlpha(child.node.id)) * _getAnim2DLineAlpha();
    const childInLayer = isNodeInCurrentLayer(child.node.id);
    const edgeData = { edgeType: 'tree', startId: nodeId, endId: child.node.id, label: '', labelHidden: true, customColor: customColorHex };
    const dashPattern = isStepNode ? [8, 3, 2, 3] : [];
    if (!isRoot && nodeId !== null && childInLayer) {
      const parentSize = pos ? getNodeLayoutSize(node, node.sizeScale || 1) : null;
      const parentInView = pos ? _isRectInViewport(pos.x, pos.y, parentSize.width, parentSize.height) : false;
      const { width: childW, height: childH } = getNodeLayoutSize(child.node, child.node.sizeScale || 1);
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
        if (edgeLabel && !edgeLabelHidden && appState.showAllLabels && childAlpha > 0.01) {
          ctx.globalAlpha = Math.min(1, childAlpha);   // 标签随连线透明度显隐（鱼骨折叠/普通折叠动画）
          ctx.fillStyle = '#ffd966';
          ctx.font = '11px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(edgeLabel, labelMidX, labelMidY - 8);
          ctx.globalAlpha = 1;
        }
      }
    }
    drawTreeRecursive(child, positionMap, effectiveProgress, false, deferredCards);
  }
}

// ============================================================
//  绘制交叉连线
// ============================================================
export function drawCrossEdges(positionMap) {
  const edges = appState.crossEdges || [];
  for (const edge of edges) {
    const sourceInLayer = isNodeInCurrentLayer(edge.source);
    const targetInLayer = isNodeInCurrentLayer(edge.target);
    if (!sourceInLayer || !targetInLayer) continue;
    const sourceAlpha = getNodeVisibilityAlpha(edge.source);
    const targetAlpha = getNodeVisibilityAlpha(edge.target);
    const edgeAlpha = Math.min(sourceAlpha, targetAlpha) * _getAnim2DLineAlpha();
    if (edgeAlpha <= 0) continue;
    const sourcePos = _getAnim2DPos(edge.source, positionMap.get(edge.source));
    const targetPos = _getAnim2DPos(edge.target, positionMap.get(edge.target));
    if (!sourcePos || !targetPos) continue;
    const sourceScale = appState.nodeMap.get(edge.source)?.sizeScale || 1;
    const targetScale = appState.nodeMap.get(edge.target)?.sizeScale || 1;
    const srcNode = appState.nodeMap.get(edge.source);
    const tgtNode = appState.nodeMap.get(edge.target);
    const srcSize = getNodeLayoutSize(srcNode, sourceScale);
    const tgtSize = getNodeLayoutSize(tgtNode, targetScale);

    // 视口裁剪：跳过两个端点都在屏外的边
    if (!_isRectInViewport(sourcePos.x, sourcePos.y, srcSize.width, srcSize.height) &&
        !_isRectInViewport(targetPos.x, targetPos.y, tgtSize.width, tgtSize.height)) continue;

    // 计算起止点：优先使用锚点，否则默认中心
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
    const edgeData = { edgeType: 'cross', startId: edge.source, endId: edge.target, label: edge.label, labelHidden: edge.labelHidden, customColor: edge.customColor };

    // 查找对应的 lineItem（用 Map O(1) 查找替换 find O(n) 线性搜索）
    const lineItem = _lineItemsMap.get(`${edge.source}->${edge.target}`)
      || _lineItemsMap.get(`${edge.target}->${edge.source}`);

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
export function drawBoxSelection() {
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
//  绘制组群矩形
// ============================================================
export function drawGroupRects() {
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

// ============================================================
//  绘制选中组群的把手
// ============================================================
export function drawSelectedGroupHandles() {
  if (!selectedGroupRectId) return;
  const gr = groupRects.find(g => g.id === selectedGroupRectId);
  if (!gr) return;
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

// ============================================================
//  2D 排列动画 — 获取节点当前位置（考虑动画插值）
// ============================================================
function _getAnim2DPos(nodeId, pos) {
  if (!appState.arrangeAnim2DActive || !pos) return pos;
  // fadeOut/fadeIn 阶段：节点位置不变化
  if (appState.arrangeAnim2DPhase !== 'move') return pos;
  // move 阶段：用插值位置
  const startPos = appState._arrange2DStartPositions?.get(nodeId);
  const targetPos = appState._arrange2DTargetPositions?.get(nodeId);
  if (!startPos || !targetPos) return pos;
  const eased = appState._arrange2DEased;
  return {
    x: startPos.x + (targetPos.x - startPos.x) * eased,
    y: startPos.y + (targetPos.y - startPos.y) * eased
  };
}

// ============================================================
//  2D 排列动画 — 获取连线 alpha 乘数
// ============================================================
export function _getAnim2DLineAlpha() {
  if (!appState.arrangeAnim2DActive) return 1;
  return appState._arrange2DLineAlpha;
}
