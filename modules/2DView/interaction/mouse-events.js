// ============================================================
//  2DView / interaction / mouse-events.js — 鼠标/滚轮/双击事件 + 慢双击重命名
// ============================================================

import { appState } from '../../module0_AppState.js';
import { setSelectedNode, clearSelected, completeAddConnection, completeRemoveConnection } from '../../module5_SelectAndEdit.js';
import { openRichEditor } from '../../richEditor/index.js';
import { hideContextMenu, completeConvertChildMode } from '../../module8_ContextMenu.js';
import { saveCurrentProjectData } from '../../module2_TreeData.js';
import { copySelectedNodes, pasteNodes } from '../../MoveMode/move-mode/index.js';
import {
  canvas, transform,
  isDragging, setDragging, setDragStart, dragStart, setMouseDownPos, mouseDownPos,
  isNodeDragging, setNodeDragging, setMoveStartWorld, moveStartWorld, moveNodeId,
  moveInitialPositions, clearMoveInitialPositions,
  isBoxSelecting, setBoxSelecting,
  boxSelectStart, setBoxSelectStart, boxSelectEnd, setBoxSelectEnd,
  boxSelectCanvasStart, setBoxSelectCanvasStart,
  boxSelectCanvasEnd, setBoxSelectCanvasEnd,
  boxSelectNodeIds, clearBoxSelectNodeIds,
  setBoxSelectTransform,
  hasValidBoxSelection, setHasValidBoxSelection,
  groupRects, selectedGroupRectId, setSelectedGroupRectId,
  isGroupDragging, setGroupDragging,
  isGroupResizing, setGroupResizing,
  groupDragStart, setGroupDragStart,
  groupResizeInfo, setGroupResizeInfo,
  pendingMultiMove, setPendingMultiMove,
  lineTooltipJustOpened, setLineTooltipJustOpened,
  currentMouseWorld, setCurrentMouseWorld,
  BASE_NODE_WIDTH, BASE_NODE_HEIGHT,
  nodeHitAreas, lineHitAreas,
  isFreeDrawing, freeDrawState,
  hoveredNodeId, setHoveredNodeId, quickAddHover, setQuickAddHover
} from '../shared.js';
import { draw, mark2DDirty, _cardRenameHitAreas, getNodeVisibilityAlpha } from '../render/index.js';
import { collectDescendantIds } from '../Layout.js';
import { canvasToWorld, getCanvasPos, pointToSegmentDistance } from './coordinate-utils.js';
import {
  hitTestCardHandle, getCardResizeState, setCardResizeStart, resetCardResize
} from './card-overlays.js';
import {
  hitTestAnchorOnAnyNode, hitTestQuickAddButton, quickAddChildNode,
  hitTestGroupHandle, hitTestGroupRect
} from './hit-tests.js';
import {
  startFreeDraw, addFreeDrawWaypoint, updateFreeDrawMousePos, cancelFreeDraw, completeFreeDraw
} from './free-draw.js';
import { updateBoxSelectedNodes, finishBoxSelection, isInBoxSelectionArea } from './box-select.js';
import { deleteSelectedGroupRect } from './group-nodes.js';

// ── 慢双击重命名状态（模块内部） ──
let _last2DClickedId = null;
let _last2DClickTime = 0;
let _2dRenameActive = false;

// ============================================================
//  MouseDown
// ============================================================
export function onMouseDown(e) {
  if (e.button === 2) return;
  const pos = getCanvasPos(e);
  setMouseDownPos(pos);  // 记录鼠标按下位置，供 onMouseUp 判断是否为点击（非拖拽）
  const worldPos = canvasToWorld(pos.x, pos.y);

  // 快速创建子节点按钮（仅空闲状态下生效）
  if (!appState.connectionMode && !appState.convertChildMode) {
    const qaHit = hitTestQuickAddButton(worldPos.x, worldPos.y);
    if (qaHit) {
      e.preventDefault();
      quickAddChildNode(qaHit.nodeId, qaHit.type);
      return;
    }
  }

  if (appState.connectionMode) {
    e.preventDefault();

    // 自由绘制模式：处理拐点和终点
    if (isFreeDrawing && appState.connectionMode === 'add') {
      const anchorHit = hitTestAnchorOnAnyNode(worldPos.x, worldPos.y);
      if (anchorHit && anchorHit.nodeId !== freeDrawState.sourceNodeId) {
        // 点击了目标节点的锚点 → 完成连线
        completeFreeDraw(anchorHit.nodeId, anchorHit.anchorKey);
      } else {
        // 点击空白处 → 添加拐点
        addFreeDrawWaypoint(worldPos.x, worldPos.y);
      }
      return;
    }

    // 连线模式（非自由绘制中）：检测锚点优先
    if (appState.connectionMode === 'add') {
      const anchorHit = hitTestAnchorOnAnyNode(worldPos.x, worldPos.y);
      if (anchorHit) {
        // 点击了锚点 → 进入自由绘制模式
        startFreeDraw(anchorHit.nodeId, anchorHit.anchorKey);
        return;
      }
      // 没有点中锚点，检查是否点了节点本体 → 走原来的简单连线逻辑
      let connHit = nodeHitAreas.find(function (area) {
        return worldPos.x >= area.x && worldPos.x <= area.x + area.width &&
          worldPos.y >= area.y && worldPos.y <= area.y + area.height;
      });
      if (connHit && connHit.id) {
        completeAddConnection(connHit.id);
      }
      return;
    }

    // 删除连线模式：保持原有逻辑
    if (appState.connectionMode === 'remove') {
      let connHit = nodeHitAreas.find(function (area) {
        return worldPos.x >= area.x && worldPos.x <= area.x + area.width &&
          worldPos.y >= area.y && worldPos.y <= area.y + area.height;
      });
      if (connHit && connHit.id) {
        completeRemoveConnection(connHit.id);
      }
      return;
    }

    return;
  }

  // “变成子节点”选择目标模式
  if (appState.convertChildMode) {
    e.preventDefault();
    let cvHit = nodeHitAreas.find(function (area) {
      return worldPos.x >= area.x && worldPos.x <= area.x + area.width &&
        worldPos.y >= area.y && worldPos.y <= area.y + area.height;
    });
    if (cvHit && cvHit.id) {
      completeConvertChildMode(cvHit.id);
    }
    return;
  }

  if (pendingMultiMove) {
    // 排列动画中禁止拖拽
    if (appState.arrangeAnim2DActive) return;
    e.preventDefault();
    setPendingMultiMove(false);
    setDragging(false);
    setNodeDragging(true, '__multi__');
    setMoveStartWorld(worldPos);
    clearMoveInitialPositions();
    for (const id of appState.selectedNodeIds) {
      const pos2D = appState.positions2D.get(id);
      if (pos2D) moveInitialPositions.set(id, { x: pos2D.x, y: pos2D.y });
    }
    canvas.style.cursor = 'grabbing';
    return;
  }

  // 连线命中检测
  const hitLine = lineHitAreas.find(line => pointToSegmentDistance(worldPos.x, worldPos.y, line.x1, line.y1, line.x2, line.y2) < 4 / transform.scale);
  if (hitLine?.edgeData) {
    e.preventDefault();
    setDragging(false);
    setNodeDragging(false);
    canvas.style.cursor = 'grab';
    setLineTooltipJustOpened(true);
    // 同时匹配 startId/endId 和 edgeType，避免树连线和用户自连线混淆
    const lineItem = appState.lineItems.find(item =>
      item.edgeType === hitLine.edgeData.edgeType &&
      ((item.startId === hitLine.edgeData.startId && item.endId === hitLine.edgeData.endId) ||
       (item.startId === hitLine.edgeData.endId && item.endId === hitLine.edgeData.startId))
    );
    // crossEdge 直接用 edgeData（数据源），tree 连线用 mesh.userData（3D 同步数据）
    const realUserData = (hitLine.edgeData.edgeType === 'cross')
      ? hitLine.edgeData
      : (lineItem ? lineItem.line.mesh.userData : hitLine.edgeData);
    if (appState.showLineTooltip) appState.showLineTooltip(e.clientX, e.clientY, realUserData);
    return;
  }

  // 组群矩形把手检测
  if (selectedGroupRectId) {
    const selGr = groupRects.find(g => g.id === selectedGroupRectId);
    const hitCorner = hitTestGroupHandle(worldPos, selGr);
    if (hitCorner && selGr) {
      e.preventDefault();
      setGroupResizing(true);
      setGroupDragging(false);
      setNodeDragging(false);
      setDragging(false);
      setBoxSelecting(false);
      canvas.style.cursor = hitCorner === 'nw' || hitCorner === 'se' ? 'nwse-resize' : 'nesw-resize';
      setGroupResizeInfo({
        rect: selGr,
        corner: hitCorner,
        startX: e.clientX,
        startY: e.clientY,
        origX: selGr.x,
        origY: selGr.y,
        origW: selGr.width,
        origH: selGr.height
      });
      return;
    }
  }

  // ── 卡片 resize 边缘检测（折叠动画期间 alpha 过低时不响应，避免误触） ──
  if (appState.selectedNodeIds.size === 1) {
    const selId = appState.lastSelectedNodeId || [...appState.selectedNodeIds][0];
    // 仅当卡片可见性足够时才检测 resize（折叠/展开动画期间禁用）
    if (getNodeVisibilityAlpha(selId) >= 0.15) {
      const hitHandle = hitTestCardHandle(worldPos, selId);
      if (hitHandle) {
        e.preventDefault();
        const origPos = appState.positions2D.get(selId);
        setCardResizeStart({
          nodeId: selId,
          handle: hitHandle,
          startX: e.clientX,
          startY: e.clientY,
          origW: appState.nodeMap.get(selId).cardWidth || BASE_NODE_WIDTH * 2.6,
          origH: appState.nodeMap.get(selId).cardHeight || BASE_NODE_HEIGHT * 4.2,
          origX: origPos ? origPos.x : 0,
          origY: origPos ? origPos.y : 0
        });
        const cursorMap = {
          n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
          nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize'
        };
        canvas.style.cursor = cursorMap[hitHandle] || 'default';
        return;
      }
    }
  }

  // 节点命中
  const hit = nodeHitAreas.find(area =>
    worldPos.x >= area.x && worldPos.x <= area.x + area.width &&
    worldPos.y >= area.y && worldPos.y <= area.y + area.height
  );
  if (hit?.id) {
    // 排列动画中禁止拖拽
    if (appState.arrangeAnim2DActive) return;
    e.preventDefault();
    setSelectedGroupRectId(null);
    setDragging(false);
    setNodeDragging(true, hit.id);
    setMoveStartWorld(worldPos);
    const descendantIds = collectDescendantIds(hit.id);
    clearMoveInitialPositions();
    for (const id of descendantIds) {
      const pos2D = appState.positions2D.get(id);
      if (pos2D) moveInitialPositions.set(id, { x: pos2D.x, y: pos2D.y });
    }
    const selfPos = appState.positions2D.get(hit.id);
    if (selfPos) moveInitialPositions.set(hit.id, { x: selfPos.x, y: selfPos.y });
    canvas.style.cursor = 'grabbing';
    return;
  }

  // 组群矩形命中
  const grIdx = hitTestGroupRect(worldPos);
  if (grIdx >= 0) {
    e.preventDefault();
    setSelectedGroupRectId(groupRects[grIdx].id);
    setGroupDragging(true);
    setGroupResizing(false);
    setNodeDragging(false);
    setDragging(false);
    setBoxSelecting(false);
    setGroupDragStart({ x: worldPos.x, y: worldPos.y });
    canvas.style.cursor = 'move';
    mark2DDirty();
    draw();
    return;
  } else {
    setSelectedGroupRectId(null);
  }

  // 开始框选
  setBoxSelecting(true);
  setBoxSelectStart(worldPos);
  setBoxSelectEnd(worldPos);
  setBoxSelectCanvasStart(pos);
  setBoxSelectCanvasEnd(pos);
  clearBoxSelectNodeIds();
  setBoxSelectTransform({ offsetX: transform.offsetX, offsetY: transform.offsetY, scale: transform.scale });
  canvas.style.cursor = 'crosshair';
  if (appState.hideLineTooltip) {
    setLineTooltipJustOpened(false);
    appState.hideLineTooltip();
  }
}

// ============================================================
//  MouseMove
// ============================================================
export function onMouseMove(e) {
  const pos = getCanvasPos(e);

  // 始终追踪当前鼠标世界坐标（供粘贴等功能使用）
  setCurrentMouseWorld(canvasToWorld(pos.x, pos.y));

  // 自由绘制模式：更新预览线终点
  if (isFreeDrawing) {
    const worldPos = canvasToWorld(pos.x, pos.y);
    updateFreeDrawMousePos(worldPos.x, worldPos.y);
    mark2DDirty();
    draw();
    return;
  }

  if (isGroupResizing) {
    e.preventDefault();
    const info = groupResizeInfo;
    if (!info) return;
    const dx = (e.clientX - info.startX) / transform.scale;
    const dy = (e.clientY - info.startY) / transform.scale;
    const r = info.rect;
    const minSize = 20;
    switch (info.corner) {
      case 'nw':
        r.width = Math.max(minSize, info.origW - dx);
        r.height = Math.max(minSize, info.origH - dy);
        r.x = info.origX + info.origW - r.width;
        r.y = info.origY + info.origH - r.height;
        break;
      case 'ne':
        r.width = Math.max(minSize, info.origW + dx);
        r.height = Math.max(minSize, info.origH - dy);
        r.x = info.origX;
        r.y = info.origY + info.origH - r.height;
        break;
      case 'sw':
        r.width = Math.max(minSize, info.origW - dx);
        r.height = Math.max(minSize, info.origH + dy);
        r.x = info.origX + info.origW - r.width;
        r.y = info.origY;
        break;
      case 'se':
        r.width = Math.max(minSize, info.origW + dx);
        r.height = Math.max(minSize, info.origH + dy);
        r.x = info.origX;
        r.y = info.origY;
        break;
    }
    mark2DDirty();
    draw();
    return;
  }

  // ── 卡片 resize 拖拽 ──
  const cardResize = getCardResizeState();
  if (cardResize.isCardResizing && cardResize.cardResizeInfo) {
    e.preventDefault();
    const info = cardResize.cardResizeInfo;
    const dx = (e.clientX - info.startX) / transform.scale;
    const dy = (e.clientY - info.startY) / transform.scale;
    const node = appState.nodeMap.get(info.nodeId);
    if (!node) return;
    const minW = BASE_NODE_WIDTH * 1.5;
    const minH = BASE_NODE_HEIGHT * 2;
    // 卡片左上角对齐 pos.x/pos.y，拖拽左边/上边时需同步调整位置
    // 使右边/下边保持不动（视觉上像在拉伸左/上边缘）
    let newX = info.origX;
    let newY = info.origY;
    let newW = info.origW;
    let newH = info.origH;
    switch (info.handle) {
      case 'n':
        newH = Math.max(minH, info.origH - dy);
        newY = info.origY + (info.origH - newH);
        break;
      case 's':
        newH = Math.max(minH, info.origH + dy);
        break;
      case 'w':
        newW = Math.max(minW, info.origW - dx);
        newX = info.origX + (info.origW - newW);
        break;
      case 'e':
        newW = Math.max(minW, info.origW + dx);
        break;
      case 'se':
        newW = Math.max(minW, info.origW + dx);
        newH = Math.max(minH, info.origH + dy);
        break;
      case 'nw':
        newW = Math.max(minW, info.origW - dx);
        newH = Math.max(minH, info.origH - dy);
        newX = info.origX + (info.origW - newW);
        newY = info.origY + (info.origH - newH);
        break;
      case 'ne':
        newW = Math.max(minW, info.origW + dx);
        newH = Math.max(minH, info.origH - dy);
        newY = info.origY + (info.origH - newH);
        break;
      case 'sw':
        newW = Math.max(minW, info.origW - dx);
        newH = Math.max(minH, info.origH + dy);
        newX = info.origX + (info.origW - newW);
        break;
    }
    node.cardWidth = newW;
    node.cardHeight = newH;
    appState.positions2D.set(info.nodeId, { x: newX, y: newY });
    mark2DDirty();
    draw();
    return;
  }

  if (isGroupDragging) {
    e.preventDefault();
    const worldPos = canvasToWorld(pos.x, pos.y);
    const gr = groupRects.find(g => g.id === selectedGroupRectId);
    if (gr) {
      const dx = worldPos.x - groupDragStart.x;
      const dy = worldPos.y - groupDragStart.y;
      gr.x += dx;
      gr.y += dy;
      if (gr.nodeIds && gr.nodeIds.length > 0) {
        for (const nid of gr.nodeIds) {
          const p = appState.positions2D.get(nid);
          if (p) appState.positions2D.set(nid, { x: p.x + dx, y: p.y + dy });
        }
      }
      setGroupDragStart(worldPos);
      mark2DDirty();
      draw();
    }
    return;
  }

  if (isNodeDragging) {
    e.preventDefault();
    const worldPos = canvasToWorld(pos.x, pos.y);
    const delta = { x: worldPos.x - moveStartWorld.x, y: worldPos.y - moveStartWorld.y };
    for (const [id, initPos] of moveInitialPositions.entries()) {
      appState.positions2D.set(id, { x: initPos.x + delta.x, y: initPos.y + delta.y });
    }
    mark2DDirty();
    draw();
    return;
  }

  if (isBoxSelecting) {
    const worldPos = canvasToWorld(pos.x, pos.y);
    setBoxSelectEnd(worldPos);
    setBoxSelectCanvasEnd(pos);
    updateBoxSelectedNodes();
    mark2DDirty();
    draw();
    return;
  }

  if (isDragging) {
    transform.offsetX = pos.x - dragStart.x;
    transform.offsetY = pos.y - dragStart.y;
    draw();
    return;
  }

  // 悬停光标反馈
  const worldPos = canvasToWorld(pos.x, pos.y);

  // 连线模式/变成子节点模式下不显示快速创建按钮
  if (appState.connectionMode || appState.convertChildMode) {
    if (hoveredNodeId) { setHoveredNodeId(null); setQuickAddHover(null); draw(); }
    canvas.style.cursor = appState.connectionMode ? 'crosshair' : 'grab';
    return;
  }

  // 快速创建子节点按钮命中 → 高亮该按钮
  const qaHit = hitTestQuickAddButton(worldPos.x, worldPos.y);
  if (qaHit) {
    if (hoveredNodeId !== qaHit.nodeId) setHoveredNodeId(qaHit.nodeId);
    if (quickAddHover !== qaHit.type) setQuickAddHover(qaHit.type);
    canvas.style.cursor = 'pointer';
    draw();
    return;
  }

  // 节点本体悬停 → 显示两个“+”按钮
  const nodeHit = nodeHitAreas.find(area =>
    worldPos.x >= area.x && worldPos.x <= area.x + area.width &&
    worldPos.y >= area.y && worldPos.y <= area.y + area.height
  );
  if (nodeHit?.id) {
    // 卡片和网页节点也支持悬浮显示加号按钮
    if (hoveredNodeId !== nodeHit.id) { setHoveredNodeId(nodeHit.id); setQuickAddHover(null); draw(); }
    else if (quickAddHover) { setQuickAddHover(null); draw(); }
    canvas.style.cursor = 'grab';
    return;
  }

  // 离开节点 → 清除悬停
  if (hoveredNodeId) { setHoveredNodeId(null); setQuickAddHover(null); draw(); }

  if (selectedGroupRectId) {
    const selGr = groupRects.find(g => g.id === selectedGroupRectId);
    const hitCorner = hitTestGroupHandle(worldPos, selGr);
    if (hitCorner) {
      canvas.style.cursor = hitCorner === 'nw' || hitCorner === 'se' ? 'nwse-resize' : 'nesw-resize';
      return;
    }
  }

  // ── 卡片 resize 边缘悬停光标 ──
  if (appState.selectedNodeIds.size === 1) {
    const selId = appState.lastSelectedNodeId || [...appState.selectedNodeIds][0];
    const cardHitHandle = hitTestCardHandle(worldPos, selId);
    if (cardHitHandle) {
      const cursorMap = {
        n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
        nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize'
      };
      canvas.style.cursor = cursorMap[cardHitHandle] || 'default';
      return;
    }
  }
  const hoverGrIdx = hitTestGroupRect(worldPos);
  if (hoverGrIdx >= 0) {
    canvas.style.cursor = groupRects[hoverGrIdx].id === selectedGroupRectId ? 'move' : 'pointer';
    return;
  }
  canvas.style.cursor = 'grab';
}

// ============================================================
//  MouseUp
// ============================================================
export function onMouseUp(e) {
  const cardResize = getCardResizeState();
  if (cardResize.isCardResizing) {
    resetCardResize();
    canvas.style.cursor = 'grab';
    mark2DDirty();
    saveCurrentProjectData();
    return;
  }

  if (isGroupResizing) {
    setGroupResizing(false);
    setGroupResizeInfo(null);
    canvas.style.cursor = 'grab';
    mark2DDirty();
    saveCurrentProjectData();
    return;
  }

  if (isGroupDragging) {
    setGroupDragging(false);
    canvas.style.cursor = 'grab';
    mark2DDirty();
    saveCurrentProjectData();
    return;
  }

  if (isNodeDragging) {
    const pos = getCanvasPos(e);
    const worldPos = canvasToWorld(pos.x, pos.y);
    const dx = worldPos.x - moveStartWorld.x;
    const dy = worldPos.y - moveStartWorld.y;
    const moved = Math.sqrt(dx * dx + dy * dy) > 3;
    const wasMultiMove = moveNodeId === '__multi__';
    setNodeDragging(false);
    clearMoveInitialPositions();
    canvas.style.cursor = 'grab';
    if (!moved && !wasMultiMove) handleClick(worldPos, e);
    mark2DDirty();
    draw();
    if (appState.hideLineTooltip) appState.hideLineTooltip();
    return;
  }

  if (isBoxSelecting) {
    setBoxSelecting(false);
    canvas.style.cursor = 'grab';
    finishBoxSelection(e);
    return;
  }

  const pos = getCanvasPos(e);
  const dx = pos.x - mouseDownPos.x;
  const dy = pos.y - mouseDownPos.y;
  const moved = Math.sqrt(dx * dx + dy * dy) > 0;

  if (isDragging) {
    setDragging(false);
    canvas.style.cursor = 'grab';
    if (moved) {
      if (appState.hideLineTooltip) appState.hideLineTooltip();
    } else {
      if (lineTooltipJustOpened) {
        setLineTooltipJustOpened(false);
      } else {
        const worldPos = canvasToWorld(pos.x, pos.y);
        handleClick(worldPos, e);
      }
    }
  } else {
    if (lineTooltipJustOpened) setLineTooltipJustOpened(false);
  }
}

// ============================================================
//  DoubleClick
// ============================================================
export function onDoubleClick(e) {
  const pos = getCanvasPos(e);
  const worldPos = canvasToWorld(pos.x, pos.y);
  // 命中快速创建子节点按钮（"+"按钮）→ 不触发双击打开编辑器
  // 避免快速点击两次"+"按钮被浏览器识别为 dblclick 而误开文本编辑器
  if (!appState.connectionMode && !appState.convertChildMode) {
    const qaHit = hitTestQuickAddButton(worldPos.x, worldPos.y);
    if (qaHit) return;
  }
  const hit = nodeHitAreas.find(area =>
    worldPos.x >= area.x && worldPos.x <= area.x + area.width &&
    worldPos.y >= area.y && worldPos.y <= area.y + area.height
  );
  if (hit?.id) {
    const node = appState.nodeMap.get(hit.id);
    // 网页节点双击 → 打开内置浏览器加载页面
    if (node && node.displayMode === 'webpage') {
      if (window.AppRunner) {
        let url = node.webUrl || '';
        // URL智能识别：不含协议前缀时补 https://
        if (url && !/^https?:\/\//i.test(url) && !url.startsWith('file://') && !url.startsWith('data:')) {
          url = (url.includes('.') && !url.includes(' ')) ? 'https://' + url : 'https://www.bing.com/search?q=' + encodeURIComponent(url);
        }
        window.AppRunner.open({ id: 'webpage-' + hit.id, name: node.name || '网页', type: 'browser', defaultUrl: url || undefined });
      }
      return;
    }
    openRichEditor(hit.id);
  }
}

// ============================================================
//  Click 处理 + 慢双击重命名
// ============================================================
export function handleClick(worldPos, e) {
  if (e.button !== 0) return;
  if (_2dRenameActive) return;

  // ── 卡片铅笔按钮命中 → 重命名 ──
  const renameHit = _cardRenameHitAreas.find(a =>
    worldPos.x >= a.x && worldPos.x <= a.x + a.width &&
    worldPos.y >= a.y && worldPos.y <= a.y + a.height
  );
  if (renameHit) {
    const node = appState.nodeMap.get(renameHit.id);
    if (node) {
      // 从铅笔按钮位置反推卡片左上角，再计算标题起点（卡片左上角 + padding）
      const cardW = node.cardWidth || 220;
      const padding = 10;
      const titleFontSize = 14;
      const renameIconSize = titleFontSize + 2;
      // Render.js 中：renameX = cardW - padding - renameIconSize；命中区 x = cardX + renameX
      // 所以 cardX = renameHit.x - renameX = renameHit.x - (cardW - padding - renameIconSize)
      // 标题起点 = cardX + padding
      const cardX = renameHit.x - (cardW - padding - renameIconSize);
      const titleWorldX = cardX + padding;
      const titleWorldY = renameHit.y;
      const rect = canvas.getBoundingClientRect();
      // 世界坐标 → canvas 坐标 → 屏幕坐标
      const sx = titleWorldX * transform.scale + canvas.width / 2 + transform.offsetX + rect.left;
      const sy = titleWorldY * transform.scale + canvas.height / 2 + transform.offsetY + rect.top;
      // 输入框宽度 = 卡片宽度 - padding*2 - 铅笔按钮宽度 - gap
      const inputW = Math.max(100, (cardW - padding * 2 - renameIconSize - 8) * transform.scale);
      const inputH = renameHit.height * transform.scale;
      const input = document.createElement('input');
      input.type = 'text';
      input.value = node.name || '';
      input.style.cssText = `position:fixed;left:${sx}px;top:${sy}px;width:${inputW}px;height:${inputH}px;z-index:99999;box-sizing:border-box;` +
        'background:rgba(13,24,32,0.95);border:1px solid #0ff;border-radius:3px;color:#0ff;font-weight:bold;' +
        'font-size:13px;padding:0 6px;outline:none;font-family:system-ui,sans-serif;text-align:left;';
      document.body.appendChild(input);
      input.focus();
      input.select();
      const finish = () => {
        const newName = input.value.trim();
        if (newName && newName !== node.name) {
          node.name = newName;
          const obj = appState.nodeMeshes.get(renameHit.id);
          if (obj) {
            obj.mesh.userData.name = node.name;
            if (obj.label && obj.label.element) obj.label.element.textContent = node.name;
          }
          saveCurrentProjectData();
          if (appState.refreshTreePanel) appState.refreshTreePanel();
        }
        input.remove();
        mark2DDirty();
        draw();
      };
      input.addEventListener('keydown', (ke) => { if (ke.key === 'Enter') { ke.preventDefault(); finish(); } if (ke.key === 'Escape') { input.remove(); } });
      input.addEventListener('blur', finish);
    }
    return;
  }

  const pos = getCanvasPos(e);
  const hit = nodeHitAreas.find(area =>
    worldPos.x >= area.x && worldPos.x <= area.x + area.width &&
    worldPos.y >= area.y && worldPos.y <= area.y + area.height
  );
  if (hit?.id) {
    const now = Date.now();
    const hitNode = appState.nodeMap.get(hit.id);
    // card 模式跳过慢双击重命名（用铅笔按钮替代）
    const isCard = hitNode && hitNode.displayMode === 'card';
    if (!isCard && appState.selectedNodeIds.has(hit.id) && _last2DClickedId === hit.id
        && now - _last2DClickTime > 300 && now - _last2DClickTime < 1500) {
      _start2DRename(hit);
      _last2DClickedId = null;
      _last2DClickTime = 0;
      return;
    }

    setSelectedNode(hit.id, e.ctrlKey);
    clearBoxSelectNodeIds();
    setHasValidBoxSelection(false);
    document.getElementById('addChildNodeBtn').style.display = 'block';
    document.getElementById('toggleChildrenContextBtn').style.display = 'block';
    document.getElementById('locateOtherViewBtn').style.display = 'block';

    _last2DClickedId = hit.id;
    _last2DClickTime = now;
  } else if (!isInBoxSelectionArea(pos)) {
    if (!e.ctrlKey) clearSelected();
    clearBoxSelectNodeIds();
    setHasValidBoxSelection(false);
    hideContextMenu();
    if (appState.hideLineTooltip) {
      setLineTooltipJustOpened(false);
      appState.hideLineTooltip();
    }
    _last2DClickedId = null;
  }
}

// ============================================================
//  2D 节点内联重命名（在 canvas 上覆盖 input 元素）
// ============================================================
function _start2DRename(hitArea) {
  const node = appState.nodeMap.get(hitArea.id);
  if (!node) return;

  _2dRenameActive = true;
  const originalName = node.name;

  // 将世界坐标转为 canvas 屏幕坐标
  const screenX = hitArea.x * transform.scale + canvas.width / 2 + transform.offsetX;
  const screenY = hitArea.y * transform.scale + canvas.height / 2 + transform.offsetY;
  const screenW = hitArea.width * transform.scale;
  const screenH = hitArea.height * transform.scale;

  // 获取 canvas 的页面位置
  const rect = canvas.getBoundingClientRect();

  const input = document.createElement('input');
  input.type = 'text';
  input.value = originalName;
  input.className = 'node-2d-rename-input';
  input.style.cssText = `
    position: fixed;
    left: ${rect.left + screenX}px;
    top: ${rect.top + screenY + screenH / 2 - 13}px;
    width: ${Math.max(screenW, 60)}px;
    height: 26px;
    background: #0a1a24;
    border: 1px solid #0ff;
    color: #fff;
    padding: 0 6px;
    border-radius: 13px;
    font-size: 12px;
    outline: none;
    text-align: center;
    z-index: 10000;
    pointer-events: auto;
  `;

  document.body.appendChild(input);
  input.focus();
  input.select();

  const finish = (save) => {
    _2dRenameActive = false;
    const newName = save ? (input.value.trim() || originalName) : originalName;
    if (newName !== originalName) {
      node.name = newName;
      saveCurrentProjectData();
      if (typeof window.forceRefreshTreePanel === 'function') window.forceRefreshTreePanel();
      // 更新 3D 标签
      const obj = appState.nodeMeshes.get(hitArea.id);
      if (obj && obj.label) obj.label.element.textContent = newName;
      draw();
    }
    input.remove();
  };

  input.addEventListener('blur', () => finish(true));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
}

// ============================================================
//  Wheel
// ============================================================
export function onWheel(e) {
  // 卡片正文滚动由 DOM overlay 自身处理（wheel 事件 stopPropagation）
  e.preventDefault();
  const delta = e.deltaY > 0 ? 0.9 : 1.1;
  transform.scale *= delta;
  transform.scale = Math.max(0.1, Math.min(3, transform.scale));
  draw();
}
