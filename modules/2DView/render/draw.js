// ============================================================
//  2DView / render / draw.js — 主绘制函数
//  - 编排所有子模块：状态更新 → 网格 → 组群 → 节点 → 连线 → 框选 → 钩子
// ============================================================

import { appState } from '../../module0_AppState.js';
import {
  ctx, canvas, visible, transform,
  animations,
  BASE_NODE_HEIGHT,
  nodeHitAreas, setNodeHitAreas,
  setLineHitAreas,
  isFreeDrawing, hoveredNodeId,
  getNodeWidth
} from '../shared.js';
import {
  layoutTree, assignCoordinates, extractNodePositions
} from '../Layout.js';
import {
  _renderHue, setRenderHue, setFrameNow, setViewportBounds,
  setCachedLayout, setCachedPositionMap, setLayoutDirty, setLastCanvasSize,
  _layoutDirty, _lastCanvasWidth, _lastCanvasHeight,
  _cachedLayout, _cachedPositionMap,
  resetCardHitAreas, clearLineItemsMap, addLineItemsMapEntry,
  rebuildCrossEdgeIndex, rebuildAnimationsIndex,
  getPostDrawHook
} from './frame-state.js';
import { isNodeInCurrentLayer, rebuildParentMap } from './visibility.js';
import { getCardSize, getCardOffset } from './shape-utils.js';
import {
  drawTreeRecursive, drawCrossEdges, drawBoxSelection,
  drawGroupRects, drawSelectedGroupHandles
} from './scene-renderers.js';
import { drawAllAnchorPoints, drawFreeDrawPreview, flushLineBatch } from './edge-renderers.js';
import { drawFishbone2D } from '../../Fishbone/render2d.js';
import { hasFishboneAnim } from '../../Fishbone/visibility.js';

// ============================================================
//  主绘制函数
// ============================================================
export function draw() {
  if (!visible || !ctx) return;
  setRenderHue((_renderHue + 0.33) % 360);  // 色相慢速循环（≈18s 一圈）
  setFrameNow(performance.now());  // 帧内时间戳：drawNode/getBreathingLineColor 复用，避免多次系统调用
  rebuildCrossEdgeIndex();       // 跨层连线节点索引（每帧重建）
  rebuildAnimationsIndex();      // 动画索引（数组引用变化时重建）
  rebuildParentMap();            // parentMap 缓存（methodsTree 变更时重建）

  // 预索引 lineItems：每帧重建，避免 addSingleTreeLine(push)/splice 原地修改导致缓存过期
  clearLineItemsMap();
  for (const item of appState.lineItems) {
    addLineItemsMapEntry(`${item.startId}->${item.endId}`, item);
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
  const vbLeft   = (-canvas.width / 2 - transform.offsetX - margin) / transform.scale;
  const vbRight  = ( canvas.width / 2 - transform.offsetX + margin) / transform.scale;
  const vbTop    = (-canvas.height / 2 - transform.offsetY - margin) / transform.scale;
  const vbBottom = ( canvas.height / 2 - transform.offsetY + margin) / transform.scale;
  setViewportBounds({ left: vbLeft, right: vbRight, top: vbTop, bottom: vbBottom });

  // 网格（批量绘制 + 视口裁剪，避免数百次独立 stroke 调用）
  ctx.strokeStyle = appState.gridColor2D || '#1a2a34';
  ctx.lineWidth = 0.5;
  const gridSize = (typeof appState.gridSize2D === 'number' && appState.gridSize2D > 0) ? appState.gridSize2D : 40;
  {
    const gridLeft   = Math.floor(vbLeft   / gridSize) * gridSize;
    const gridRight  = Math.ceil (vbRight  / gridSize) * gridSize;
    const gridTop    = Math.floor(vbTop    / gridSize) * gridSize;
    const gridBottom = Math.ceil (vbBottom / gridSize) * gridSize;
    ctx.beginPath();
    for (let x = gridLeft; x <= gridRight; x += gridSize) { ctx.moveTo(x, gridTop); ctx.lineTo(x, gridBottom); }
    for (let y = gridTop; y <= gridBottom; y += gridSize) { ctx.moveTo(gridLeft, y); ctx.lineTo(gridRight, y); }
    ctx.stroke();
  }

  // 绘制组群矩形
  drawGroupRects();

  // 绘制选中组群的把手
  drawSelectedGroupHandles();

  // 绘制鱼骨图主干线段（节点之下、网格/组群之上）
  drawFishbone2D();

  setNodeHitAreas([]);
  setLineHitAreas([]);
  resetCardHitAreas();

  // 布局缓存：平移/缩放时跳过重算，仅数据变更时重新计算
  const canvasSizeChanged = canvas.width !== _lastCanvasWidth || canvas.height !== _lastCanvasHeight;
  if (canvasSizeChanged) {
    setLastCanvasSize(canvas.width, canvas.height);
    setLayoutDirty(true);
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
    setCachedLayout(layout);
    setCachedPositionMap(positionMap);
    setLayoutDirty(false);
  } else {
    layout = _cachedLayout;
    positionMap = _cachedPositionMap;
  }

  drawCrossEdges(positionMap);
  // 连线压卡片下：递归中先画全部连线，卡片延迟收集，递归结束后统一绘制
  const deferredCards = [];
  drawTreeRecursive(layout, positionMap, null, true, deferredCards);
  // 批量刷新所有收集到的连线（必须在卡片之前上屏，否则连线会盖在节点上面；保持世界坐标系）
  flushLineBatch();
  for (const drawCard of deferredCards) drawCard();

  // 绘制连线模式下的锚点（在节点之上）
  drawAllAnchorPoints(positionMap);

  // 绘制自由连线过程中的预览线
  drawFreeDrawPreview();

  for (const [id, pos] of positionMap.entries()) {
    // 图层过滤：只构建当前图层节点的命中区，避免在别的图层还能点到该卡片
    if (!isNodeInCurrentLayer(id)) continue;
    const node = appState.nodeMap.get(id);
    if (node) {
      const scale = node.sizeScale || 1;
      let w = getNodeWidth(node, scale);
      let h = BASE_NODE_HEIGHT * scale;
      let hx = pos.x;
      let hy = pos.y;
      if (node.displayMode === 'card') {
        const cardSize = getCardSize(node, scale);
        const off = getCardOffset(node, scale);
        hx = pos.x + off.dx;
        hy = pos.y + off.dy;
        w = cardSize.w;
        h = cardSize.h;
      }
      const areas = nodeHitAreas;
      areas.push({ id, x: hx, y: hy, width: w, height: h });
      setNodeHitAreas(areas);
    }
  }

  drawBoxSelection();

  ctx.restore();

  // 通知外部（Interaction.js）同步卡片正文 DOM overlay
  const hook = getPostDrawHook();
  if (hook) hook();

  // 仅在有动画/自由绘制/折叠变化/悬停/排列动画/鱼骨折叠动画时自刷新；常规帧由 3D 动画循环驱动 refresh2DView
  if (visible && (animations.length > 0 || isFreeDrawing || hoveredNodeId || appState.arrangeAnim2DActive || hasFishboneAnim())) {
    requestAnimationFrame(() => draw());
  }
}
