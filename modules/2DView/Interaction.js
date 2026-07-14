// ============================================================
//  2DView / Interaction.js — 交互事件、组群矩形、对齐、自动布局
// ============================================================

import { appState } from '../module0_AppState.js';
import { setSelectedNode, clearSelected, completeAddConnection, completeAddConnectionWithWaypoints, completeRemoveConnection, cancelConnectionMode } from '../module5_SelectAndEdit.js';
import { openRichEditor } from '../richEditor/index.js';
import { showContextMenu, hideContextMenu, showBlankContextMenu, hideBlankContextMenu, completeConvertChildMode, cancelConvertChildMode } from '../module8_ContextMenu.js';
import { updateLinesVis } from '../VisualComponents/index.js';
import { saveCurrentProjectData } from '../module2_TreeData.js';
import { startArrangeAnimation2D, skipArrangeAnimation2D } from '../UI/ArrangeAnimation.js';
import { showToast } from '../module5_SelectAndEdit.js';
import { copySelectedNodes, pasteNodes, createNodeInProject, getNextChildName } from '../MoveMode/MoveCore.js';
import {
  canvas, ctx, container, visible, transform,
  isDragging, setDragging, setDragStart, setMouseDownPos, mouseDownPos,
  isNodeDragging, setNodeDragging, setMoveStartWorld, moveStartWorld, moveNodeId,
  moveInitialPositions, clearMoveInitialPositions, setMoveInitialPositions,
  isBoxSelecting, setBoxSelecting,
  boxSelectStart, setBoxSelectStart, boxSelectEnd, setBoxSelectEnd,
  boxSelectCanvasStart, setBoxSelectCanvasStart,
  boxSelectCanvasEnd, setBoxSelectCanvasEnd,
  boxSelectNodeIds, clearBoxSelectNodeIds,
  boxSelectTransform, setBoxSelectTransform,
  hasValidBoxSelection, setHasValidBoxSelection,
  groupRects, selectedGroupRectId, setSelectedGroupRectId,
  isGroupDragging, setGroupDragging,
  isGroupResizing, setGroupResizing,
  groupDragStart, setGroupDragStart,
  groupResizeInfo, setGroupResizeInfo,
  HANDLE_SIZE, getGroupHandlePositions,
  pendingMultiMove, setPendingMultiMove,
  lineTooltipJustOpened, setLineTooltipJustOpened,
  currentMouseWorld, setCurrentMouseWorld,
  animations, BASE_NODE_WIDTH, BASE_NODE_HEIGHT, H_GAP, V_GAP,
  nodeHitAreas, setNodeHitAreas,
  lineHitAreas, setLineHitAreas,
  keys2D, PAN_SPEED,
  isFreeDrawing, setFreeDrawing, freeDrawState, setFreeDrawState,
  ANCHOR_HIT_RADIUS, ANCHOR_KEYS, getNodeAnchors,
  hoveredNodeId, setHoveredNodeId, quickAddHover, setQuickAddHover,
  QUICK_ADD_RADIUS, QUICK_ADD_HIT_RADIUS,
  getNodeWidth
} from './shared.js';
import { isInputActive } from '../UI/shared.js';
import { draw, mark2DDirty } from './Render.js';
import {
  layoutTree, assignCoordinates,
  isNextStepNode, collectDescendantIds
} from './Layout.js';

// ============================================================
//  坐标转换工具
// ============================================================
function canvasToWorld(canvasX, canvasY) {
  return {
    x: (canvasX - canvas.width / 2 - transform.offsetX) / transform.scale,
    y: (canvasY - canvas.height / 2 - transform.offsetY) / transform.scale
  };
}

function getCanvasPos(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

// ============================================================
//  锚点命中检测：检测世界坐标是否命中某个节点的锚点
//  返回 { nodeId, anchorKey } 或 null
// ============================================================
function hitTestAnchorOnAnyNode(worldX, worldY) {
  for (const area of nodeHitAreas) {
    if (!area.id) continue;
    const anchors = getNodeAnchors(area.x, area.y, area.width, area.height);
    for (const key of ANCHOR_KEYS) {
      const pt = anchors[key];
      const dx = worldX - pt.x;
      const dy = worldY - pt.y;
      if (dx * dx + dy * dy <= ANCHOR_HIT_RADIUS * ANCHOR_HIT_RADIUS) {
        return { nodeId: area.id, anchorKey: key };
      }
    }
  }
  return null;
}

// ============================================================
//  快速创建子节点按钮命中检测
//  右框中点 → 'child'(文本子节点)；下框中点 → 'step'(步骤子节点)
//  返回 { nodeId, type } 或 null
// ============================================================
function hitTestQuickAddButton(worldX, worldY) {
  for (const area of nodeHitAreas) {
    if (!area.id) continue;
    // 右框中点（文本子节点）
    const rightX = area.x + area.width;
    const rightY = area.y + area.height / 2;
    const dxR = worldX - rightX;
    const dyR = worldY - rightY;
    if (dxR * dxR + dyR * dyR <= QUICK_ADD_HIT_RADIUS * QUICK_ADD_HIT_RADIUS) {
      return { nodeId: area.id, type: 'child' };
    }
    // 下框中点（步骤子节点）
    const botX = area.x + area.width / 2;
    const botY = area.y + area.height;
    const dxB = worldX - botX;
    const dyB = worldY - botY;
    if (dxB * dxB + dyB * dyB <= QUICK_ADD_HIT_RADIUS * QUICK_ADD_HIT_RADIUS) {
      return { nodeId: area.id, type: 'step' };
    }
  }
  return null;
}

// 根据按钮类型创建子节点
function quickAddChildNode(parentId, type) {
  const parentNode = appState.nodeMap.get(parentId);
  if (!parentNode) return;
  if (type === 'step') {
    const nextName = getNextChildName(parentNode, /^下一步(\d+)$/, '下一步');
    createNodeInProject({
      name: nextName, desc: '📖 自定义节点', sizeScale: 1.0,
      parentId, offsetX: 0, offsetY: 60, isStepFlow: true
    });
  } else {
    const childName = getNextChildName(parentNode, /^子节点(\d+)$/, '子节点');
    createNodeInProject({
      name: childName, desc: '📖 自定义节点', sizeScale: 1.0,
      parentId, offsetX: 160, offsetY: 10
    });
  }
}

// ============================================================
//  自由绘制连线管理
// ============================================================
function startFreeDraw(sourceNodeId, sourceAnchor) {
  setFreeDrawing(true);
  setFreeDrawState({
    sourceNodeId,
    sourceAnchor,
    waypoints: [],
    currentMousePos: null,
    targetNodeId: null,
    targetAnchor: null
  });
  canvas.style.cursor = 'crosshair';
}

function addFreeDrawWaypoint(worldX, worldY) {
  if (!freeDrawState) return;
  freeDrawState.waypoints.push({ x: worldX, y: worldY });
}

function updateFreeDrawMousePos(worldX, worldY) {
  if (!freeDrawState) return;
  freeDrawState.currentMousePos = { x: worldX, y: worldY };
}

function cancelFreeDraw() {
  setFreeDrawing(false);
  setFreeDrawState(null);
  canvas.style.cursor = 'grab';
}

function completeFreeDraw(targetNodeId, targetAnchor) {
  if (!freeDrawState) return;
  const state = { ...freeDrawState };
  cancelFreeDraw();
  // 调用带 waypoint 的完成连线函数
  completeAddConnectionWithWaypoints(
    state.sourceNodeId, state.sourceAnchor,
    targetNodeId, targetAnchor,
    state.waypoints
  );
}

// ============================================================
//  初始化交互事件（由 Core.init2DView 调用）
// ============================================================
export function initInteractionEvents() {
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('dblclick', onDoubleClick);
  canvas.addEventListener('contextmenu', onContextMenu);
  // 鼠标离开画布时清除悬停状态
  canvas.addEventListener('mouseleave', () => {
    if (hoveredNodeId) { setHoveredNodeId(null); setQuickAddHover(null); draw(); }
  });

  window.addEventListener('keydown', (e) => {
    if (isInputActive()) return;
    // 仅当处于 2D 视图时处理节点复制粘贴，避免与 Keyboard.js 重复触发
    if (!appState.is2DView) return;
    if (e.ctrlKey && e.key === 'c') {
      e.preventDefault();
      copySelectedNodes();
      return;
    }
    if (e.ctrlKey && e.key === 'v') {
      e.preventDefault();
      pasteNodes();
      return;
    }
    if (e.key === 'Escape') {
      if (pendingMultiMove) {
        setPendingMultiMove(false);
        canvas.style.cursor = 'grab';
      }
      if (isFreeDrawing) {
        cancelFreeDraw();
      }
      hideGroupContextMenu();
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedGroupRectId) {
      e.preventDefault();
      deleteSelectedGroupRect();
    }
  });

  // 对齐按钮
  document.getElementById('alignTopBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    alignSelectedNodesHorizontal('top');
  });
  document.getElementById('alignHCenterBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    alignSelectedNodesHorizontal('center');
  });
  document.getElementById('alignBottomBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    alignSelectedNodesHorizontal('bottom');
  });
  document.getElementById('alignLeftBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    alignSelectedNodesVertical('left');
  });
  document.getElementById('alignVCenterBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    alignSelectedNodesVertical('center');
  });
  document.getElementById('alignRightBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    alignSelectedNodesVertical('right');
  });

  // 组群按钮
  document.getElementById('groupNodesBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    groupNodes();
  });

  // 组群右键菜单事件绑定
  const updateGroupRectFromMenu = () => {
    const gr = groupRects.find(g => g.id === selectedGroupRectId);
    if (!gr) return;
    gr.name = document.getElementById('groupNameInput').value || '';
    gr.fillColor = document.getElementById('groupFillColorPicker').value;
    gr.borderColor = document.getElementById('groupBorderColorPicker').value;
    gr.lineWidth = parseFloat(document.getElementById('groupLineWidthSlider').value);
    document.getElementById('groupLineWidthValue').textContent = gr.lineWidth;
    gr.lineStyle = document.getElementById('groupLineStyleSelect').value;
    gr.borderRadius = parseInt(document.getElementById('groupBorderRadiusSelect').value, 10);
    mark2DDirty();
    draw();
  };
  document.getElementById('groupNameInput')?.addEventListener('input', updateGroupRectFromMenu);
  document.getElementById('groupFillColorPicker')?.addEventListener('input', updateGroupRectFromMenu);
  document.getElementById('groupBorderColorPicker')?.addEventListener('input', updateGroupRectFromMenu);
  document.getElementById('groupLineWidthSlider')?.addEventListener('input', updateGroupRectFromMenu);
  document.getElementById('groupLineStyleSelect')?.addEventListener('change', updateGroupRectFromMenu);
  document.getElementById('groupBorderRadiusSelect')?.addEventListener('change', updateGroupRectFromMenu);
  document.getElementById('deleteGroupRectBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteSelectedGroupRect();
    hideGroupContextMenu();
  });

  // 点击外部关闭组群菜单
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('groupContextMenu');
    if (menu && menu.style.display !== 'none' && !menu.contains(e.target) && e.button !== 2) {
      hideGroupContextMenu();
    }
  });
}

// ============================================================
//  MouseDown
// ============================================================
function onMouseDown(e) {
  if (e.button === 2) return;
  const pos = getCanvasPos(e);
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
function onMouseMove(e) {
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
function onMouseUp(e) {
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
function onDoubleClick(e) {
  const pos = getCanvasPos(e);
  const worldPos = canvasToWorld(pos.x, pos.y);
  const hit = nodeHitAreas.find(area =>
    worldPos.x >= area.x && worldPos.x <= area.x + area.width &&
    worldPos.y >= area.y && worldPos.y <= area.y + area.height
  );
  if (hit?.id) openRichEditor(hit.id);
}

// ============================================================
//  Click 处理 + 慢双击重命名
// ============================================================
let _last2DClickedId = null;
let _last2DClickTime = 0;
let _2dRenameActive = false;

function handleClick(worldPos, e) {
  if (e.button !== 0) return;
  if (_2dRenameActive) return;

  const pos = getCanvasPos(e);
  const hit = nodeHitAreas.find(area =>
    worldPos.x >= area.x && worldPos.x <= area.x + area.width &&
    worldPos.y >= area.y && worldPos.y <= area.y + area.height
  );
  if (hit?.id) {
    const now = Date.now();
    // 慢双击检测：同一选中节点在 300-1500ms 内再次单击 → 进入重命名
    if (appState.selectedNodeIds.has(hit.id) && _last2DClickedId === hit.id
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
function onWheel(e) {
  e.preventDefault();
  const delta = e.deltaY > 0 ? 0.9 : 1.1;
  transform.scale *= delta;
  transform.scale = Math.max(0.1, Math.min(3, transform.scale));
  draw();
}

// ============================================================
//  ContextMenu
// ============================================================
function onContextMenu(e) {
  e.preventDefault();
  setPendingMultiMove(false);
  canvas.style.cursor = 'grab';
  hideContextMenu();
  hideGroupContextMenu();
  if (appState.connectionMode) {
    if (isFreeDrawing) cancelFreeDraw();
    cancelConnectionMode();
    return;
  }
  if (appState.convertChildMode) {
    cancelConvertChildMode();
    return;
  }
  const pos = getCanvasPos(e);
  const worldPos = canvasToWorld(pos.x, pos.y);
  const hit = nodeHitAreas.find(area =>
    worldPos.x >= area.x && worldPos.x <= area.x + area.width &&
    worldPos.y >= area.y && worldPos.y <= area.y + area.height
  );
  if (hit?.id) {
    setSelectedNode(hit.id, e.ctrlKey);
    showContextMenu(e.clientX, e.clientY, hit.id);
    return;
  }
  const grIdx = hitTestGroupRect(worldPos);
  if (grIdx >= 0) {
    showGroupRectContextMenu(e.clientX, e.clientY, groupRects[grIdx]);
    return;
  }
  if (isInBoxSelectionArea(pos)) {
    showMultiSelectContextMenu(e.clientX, e.clientY);
    return;
  }
  clearSelected();
  hideContextMenu();
  appState._isSidebarContextMenu = false;
  appState._sidebarWorldPos = null;
  appState._lastRightClickPos = { x: e.clientX, y: e.clientY };
  showBlankContextMenu(e.clientX, e.clientY);
}

// ============================================================
//  框选相关
// ============================================================
function updateBoxSelectedNodes() {
  const worldMinX = Math.min(boxSelectStart.x, boxSelectEnd.x);
  const worldMaxX = Math.max(boxSelectStart.x, boxSelectEnd.x);
  const worldMinY = Math.min(boxSelectStart.y, boxSelectEnd.y);
  const worldMaxY = Math.max(boxSelectStart.y, boxSelectEnd.y);
  clearBoxSelectNodeIds();
  for (const area of nodeHitAreas) {
    if (!area.id) continue;
    const nodeCenterX = area.x + area.width / 2;
    const nodeCenterY = area.y + area.height / 2;
    if (nodeCenterX >= worldMinX && nodeCenterX <= worldMaxX &&
        nodeCenterY >= worldMinY && nodeCenterY <= worldMaxY) {
      boxSelectNodeIds.add(area.id);
    }
  }
}

function finishBoxSelection(e) {
  setBoxSelecting(false);
  if (boxSelectNodeIds.size > 0) {
    setHasValidBoxSelection(true);
    const shiftKey = e && e.shiftKey;
    if (shiftKey) appState.selectedNodeIds = new Set([...appState.selectedNodeIds, ...boxSelectNodeIds]);
    else appState.selectedNodeIds = new Set(boxSelectNodeIds);
    if (typeof setSelectedNode === 'function' && appState.selectedNodeIds.size === 1) {
      const singleId = appState.selectedNodeIds.values().next().value;
      setSelectedNode(singleId);
    }
  } else {
    setHasValidBoxSelection(false);
    if (!e?.ctrlKey) clearSelected();
    clearBoxSelectNodeIds();
  }
  mark2DDirty();
  draw();
}

function isInBoxSelectionArea(canvasPos) {
  if (boxSelectNodeIds.size === 0) return false;
  const minX = Math.min(boxSelectCanvasStart.x, boxSelectCanvasEnd.x);
  const maxX = Math.max(boxSelectCanvasStart.x, boxSelectCanvasEnd.x);
  const minY = Math.min(boxSelectCanvasStart.y, boxSelectCanvasEnd.y);
  const maxY = Math.max(boxSelectCanvasStart.y, boxSelectCanvasEnd.y);
  const threshold = 5;
  return canvasPos.x >= minX - threshold && canvasPos.x <= maxX + threshold &&
         canvasPos.y >= minY - threshold && canvasPos.y <= maxY + threshold;
}

function showMultiSelectContextMenu(x, y) {
  appState.selectedNodeIds = new Set(boxSelectNodeIds);
  const count = boxSelectNodeIds.size;
  document.getElementById('contextNodeName').textContent = `${count} 个节点`;
  document.getElementById('contextNodeName').style.display = 'inline';
  document.getElementById('contextRenameInput').style.display = 'none';
  document.getElementById('nodeSizeSlider').value = 1;
  document.getElementById('nodeSizeValue').textContent = '1.0';
  document.getElementById('ringSpeedSlider').value = 1;
  document.getElementById('ringSpeedValue').textContent = '1.0';
  document.getElementById('nodeFixedColorPicker').value = '#ffffff';
  document.getElementById('nodeShapeSelect').value = 'roundedRect';
  document.getElementById('addChildNodeBtn').style.display = 'none';
  document.getElementById('addNextNodeBtn').style.display = 'none';
  document.getElementById('toggleChildrenContextBtn').style.display = 'none';
  document.getElementById('locateOtherViewBtn').style.display = 'none';
  document.getElementById('copyNodeBtn').style.display = 'block';
  document.getElementById('moveNodeBtn').style.display = 'block';
  document.getElementById('deleteNodeContextBtn').style.display = 'block';
  document.getElementById('alignSection').style.display = count >= 2 ? 'flex' : 'none';
  document.getElementById('alignRowHorizontal').style.display = count >= 2 ? 'flex' : 'none';
  document.getElementById('alignRowVertical').style.display = count >= 2 ? 'flex' : 'none';
  document.getElementById('groupRow').style.display = 'flex';
  document.getElementById('addConnectionContextBtn').style.display = 'none';
  document.getElementById('removeConnectionContextBtn').style.display = 'none';
  document.getElementById('convertRootRow').style.display = 'none';
  document.getElementById('convertChildRow').style.display = 'none';
  const contextMenu = document.getElementById('nodeContextMenu');
  contextMenu.style.display = 'flex';
  contextMenu.style.visibility = 'hidden';
  contextMenu.style.left = '0px';
  contextMenu.style.top = '0px';
  const menuWidth = contextMenu.offsetWidth;
  const menuHeight = contextMenu.offsetHeight;
  const winW = window.innerWidth;
  const winH = window.innerHeight;
  const TASKBAR = 44;
  let left = x + 4;
  let top = y + 4;
  if (left + menuWidth > winW) left = Math.max(0, winW - menuWidth - 4);
  if (top + menuHeight > winH - TASKBAR) top = Math.max(0, winH - TASKBAR - menuHeight - 4);
  contextMenu.style.left = left + 'px';
  contextMenu.style.top = top + 'px';
  contextMenu.style.visibility = 'visible';
  appState.contextTargetId = 'multi';
}

// ============================================================
//  组群矩形右键菜单
// ============================================================
function showGroupRectContextMenu(x, y, gr) {
  if (!gr) return;
  setSelectedGroupRectId(gr.id);
  document.getElementById('groupNameInput').value = gr.name || '';
  document.getElementById('groupFillColorPicker').value = gr.fillColor || '#4a3c7e';
  document.getElementById('groupBorderColorPicker').value = gr.borderColor || '#7a6aae';
  document.getElementById('groupLineWidthSlider').value = gr.lineWidth !== undefined ? gr.lineWidth : 1.5;
  document.getElementById('groupLineWidthValue').textContent = gr.lineWidth !== undefined ? gr.lineWidth : '1.5';
  document.getElementById('groupLineStyleSelect').value = gr.lineStyle || 'dashed';
  document.getElementById('groupBorderRadiusSelect').value = String(gr.borderRadius || 0);
  const menu = document.getElementById('groupContextMenu');
  menu.style.display = 'flex';
  menu.style.visibility = 'hidden';
  menu.style.left = '0px';
  menu.style.top = '0px';
  const menuWidth = menu.offsetWidth;
  const menuHeight = menu.offsetHeight;
  const winW = window.innerWidth;
  const winH = window.innerHeight;
  const TASKBAR = 44;
  let left = x + 4;
  let top = y + 4;
  if (left + menuWidth > winW) left = Math.max(0, winW - menuWidth - 4);
  if (top + menuHeight > winH - TASKBAR) top = Math.max(0, winH - TASKBAR - menuHeight - 4);
  menu.style.left = left + 'px';
  menu.style.top = top + 'px';
  menu.style.visibility = 'visible';
}

function hideGroupContextMenu() {
  const menu = document.getElementById('groupContextMenu');
  if (menu) menu.style.display = 'none';
}

// ============================================================
//  多节点移动 & 组群
// ============================================================
export function startMultiNodeMove() {
  if (boxSelectNodeIds.size === 0) return;
  hideContextMenu();
  setPendingMultiMove(true);
  canvas.style.cursor = 'move';
}

function groupNodes() {
  const minX = Math.min(boxSelectStart.x, boxSelectEnd.x);
  const maxX = Math.max(boxSelectStart.x, boxSelectEnd.x);
  const minY = Math.min(boxSelectStart.y, boxSelectEnd.y);
  const maxY = Math.max(boxSelectStart.y, boxSelectEnd.y);
  const w = maxX - minX;
  const h = maxY - minY;

  if (w < 5 || h < 5) return;

  const boundNodeIds = [];
  for (const area of nodeHitAreas) {
    if (!area.id) continue;
    const cx = area.x + area.width / 2;
    const cy = area.y + area.height / 2;
    if (cx >= minX && cx <= maxX && cy >= minY && cy <= maxY) {
      boundNodeIds.push(area.id);
    }
  }

  groupRects.push({
    id: 'group-' + Date.now(),
    layerId: appState.currentLayerId,
    x: minX,
    y: minY,
    width: w,
    height: h,
    name: '',
    fillColor: '#4a3c7e',
    fillOpacity: 0.25,
    borderColor: '#7a6aae',
    borderRadius: 0,
    lineStyle: 'dashed',
    lineWidth: 1.5,
    nodeIds: boundNodeIds,
  });

  hideContextMenu();
  mark2DDirty();
  draw();
}

function hitTestGroupHandle(worldPos, gr) {
  if (!gr) return null;
  const hs = HANDLE_SIZE;
  const handles = getGroupHandlePositions(gr);
  for (const [corner, h] of Object.entries(handles)) {
    if (worldPos.x >= h.x && worldPos.x <= h.x + hs &&
        worldPos.y >= h.y && worldPos.y <= h.y + hs) {
      return corner;
    }
  }
  return null;
}

function hitTestGroupRect(worldPos) {
  for (let i = groupRects.length - 1; i >= 0; i--) {
    const gr = groupRects[i];
    if (gr.layerId && gr.layerId !== appState.currentLayerId) continue;
    if (worldPos.x >= gr.x && worldPos.x <= gr.x + gr.width &&
        worldPos.y >= gr.y && worldPos.y <= gr.y + gr.height) {
      return i;
    }
  }
  return -1;
}

function deleteSelectedGroupRect() {
  if (!selectedGroupRectId) return;
  for (let i = 0; i < groupRects.length; i++) {
    if (groupRects[i].id === selectedGroupRectId) {
      groupRects.splice(i, 1);
      break;
    }
  }
  setSelectedGroupRectId(null);
  mark2DDirty();
  draw();
}

function getNodeBounds2D(nodeId) {
  const pos = appState.positions2D.get(nodeId);
  const node = appState.nodeMap.get(nodeId);
  if (!pos || !node) return null;
  const scale = node.sizeScale || 1;
  const w = getNodeWidth(node, scale);
  const h = BASE_NODE_HEIGHT * scale;
  return { x: pos.x, y: pos.y, width: w, height: h };
}

// ============================================================
//  对齐
// ============================================================
function alignSelectedNodesHorizontal(type) {
  const selectedIds = boxSelectNodeIds.size > 0 ? boxSelectNodeIds : appState.selectedNodeIds;
  if (!selectedIds || selectedIds.size < 2) return;

  const bounds = [];
  let minTop = Infinity, maxBottom = -Infinity, sumCenterY = 0;

  for (const id of selectedIds) {
    const b = getNodeBounds2D(id);
    if (!b) continue;
    bounds.push({ id, bounds: b });
    minTop = Math.min(minTop, b.y);
    maxBottom = Math.max(maxBottom, b.y + b.height);
    sumCenterY += b.y + b.height / 2;
  }

  if (bounds.length < 2) return;

  const avgCenterY = sumCenterY / bounds.length;

  for (const item of bounds) {
    const pos = appState.positions2D.get(item.id);
    if (!pos) continue;
    if (type === 'top') pos.y = minTop;
    else if (type === 'center') pos.y = avgCenterY - item.bounds.height / 2;
    else if (type === 'bottom') pos.y = maxBottom - item.bounds.height;
    appState.positions2D.set(item.id, { x: pos.x, y: pos.y });
  }

  hideContextMenu();
  clearBoxSelectNodeIds();
  setHasValidBoxSelection(false);
  mark2DDirty();
  draw();
  saveCurrentProjectData();
}

function alignSelectedNodesVertical(type) {
  const selectedIds = boxSelectNodeIds.size > 0 ? boxSelectNodeIds : appState.selectedNodeIds;
  if (!selectedIds || selectedIds.size < 2) return;

  const bounds = [];
  let minLeft = Infinity, maxRight = -Infinity, sumCenterX = 0;

  for (const id of selectedIds) {
    const b = getNodeBounds2D(id);
    if (!b) continue;
    bounds.push({ id, bounds: b });
    minLeft = Math.min(minLeft, b.x);
    maxRight = Math.max(maxRight, b.x + b.width);
    sumCenterX += b.x + b.width / 2;
  }

  if (bounds.length < 2) return;

  const avgCenterX = sumCenterX / bounds.length;

  for (const item of bounds) {
    const pos = appState.positions2D.get(item.id);
    if (!pos) continue;
    if (type === 'left') pos.x = minLeft;
    else if (type === 'center') pos.x = avgCenterX - item.bounds.width / 2;
    else if (type === 'right') pos.x = maxRight - item.bounds.width;
    appState.positions2D.set(item.id, { x: pos.x, y: pos.y });
  }

  hideContextMenu();
  clearBoxSelectNodeIds();
  setHasValidBoxSelection(false);
  mark2DDirty();
  draw();
  saveCurrentProjectData();
}

// ============================================================
//  点位到线段距离
// ============================================================
function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
  const A = px - x1;
  const B = py - y1;
  const C = x2 - x1;
  const D = y2 - y1;
  const dot = A * C + B * D;
  const len_sq = C * C + D * D;
  let param = -1;
  if (len_sq !== 0) param = dot / len_sq;
  let xx, yy;
  if (param < 0) { xx = x1; yy = y1; }
  else if (param > 1) { xx = x2; yy = y2; }
  else { xx = x1 + param * C; yy = y1 + param * D; }
  return Math.sqrt((px - xx) ** 2 + (py - yy) ** 2);
}

// ============================================================
//  自动布局
// ============================================================
function autoArrangeTreeLayout() {
  // 动画中再点击 → 跳过当前动画后重新排列
  if (appState.arrangeAnim2DActive) {
    skipArrangeAnimation2D();
    // 继续执行下面的计算+启动
  }

  const targetPositions = computeAutoArrangeTargets();
  if (targetPositions.size === 0) return;
  startArrangeAnimation2D(targetPositions);
}

// ============================================================
//  计算 2D 自动排列目标位置（不修改 positions2D，不调用 draw）
// ============================================================
function computeAutoArrangeTargets() {
  const rootNode = appState.methodsTree;
  if (!rootNode || !rootNode.id) return new Map();

  // 虚拟根节点位置
  if (!appState.positions2D.has(rootNode.id)) {
    appState.positions2D.set(rootNode.id, { x: -500, y: -200 });
  }

  const targetPositions = new Map();

  // 以每个真实根节点作为独立子树的根进行排布
  for (const realRoot of (rootNode.children || [])) {
    if (!realRoot || !realRoot.id) continue;

    // 计算子树布局
    const subLayout = layoutTree(realRoot);
    assignCoordinates(subLayout, 0, 0);

    // 真实根节点作为锚点
    let anchorPos = appState.positions2D.get(realRoot.id);
    if (!anchorPos) {
      anchorPos = { x: subLayout.x, y: subLayout.y };
      appState.positions2D.set(realRoot.id, { x: anchorPos.x, y: anchorPos.y });
    }

    const anchorLocalX = subLayout.x;
    const anchorLocalY = subLayout.y;
    const offsetX = anchorPos.x - anchorLocalX;
    const offsetY = anchorPos.y - anchorLocalY;

    // 收集真实根的子孙节点
    const positions = new Map();
    for (const child of subLayout.children) {
      collectLayoutPositions(child, false, positions);
    }

    // 应用偏移，写入 targetPositions
    for (const [id, pos] of positions) {
      pos.x += offsetX;
      pos.y += offsetY;
      targetPositions.set(id, { x: pos.x, y: pos.y });
    }

    // 真实根节点位置不变
    targetPositions.set(realRoot.id, { x: anchorPos.x, y: anchorPos.y });
  }

  // 虚拟根节点位置也包含
  const rootPos = appState.positions2D.get(rootNode.id);
  if (rootPos) targetPositions.set(rootNode.id, { x: rootPos.x, y: rootPos.y });

  return targetPositions;
}

// ============================================================
//  增量排列：只重排指定节点所在的子树（新建子节点时使用，避免全量重算）
// ============================================================
function arrangeSubtreeIncremental(affectedNodeId) {
  // 从受影响节点向上找到真实根节点
  const rootNode = appState.methodsTree;
  if (!rootNode) return;

  let realRoot = null;
  const realRoots = rootNode.children || [];

  // 检查受影响节点是否就是真实根
  for (const rr of realRoots) {
    if (rr && rr.id === affectedNodeId) { realRoot = rr; break; }
  }

  // 如果不是真实根，找到包含该节点的真实根
  if (!realRoot) {
    function findRoot(nodeId) {
      for (const rr of realRoots) {
        if (rr && rr.id === nodeId) return rr;
        const found = _searchInTree(rr, nodeId);
        if (found) return rr;
      }
      return null;
    }
    realRoot = findRoot(affectedNodeId);
  }

  if (!realRoot) return;

  // 只重排这个真实根的子树
  const subLayout = layoutTree(realRoot);
  assignCoordinates(subLayout, 0, 0);

  let anchorPos = appState.positions2D.get(realRoot.id);
  if (!anchorPos) {
    anchorPos = { x: subLayout.x, y: subLayout.y };
    appState.positions2D.set(realRoot.id, { x: anchorPos.x, y: anchorPos.y });
  }

  const offsetX = anchorPos.x - subLayout.x;
  const offsetY = anchorPos.y - subLayout.y;

  // 直接写入 positions2D（仅此子树）
  for (const child of subLayout.children) {
    _applyLayoutPositions(child, offsetX, offsetY);
  }
}

function _searchInTree(node, targetId) {
  if (!node) return false;
  if (node.id === targetId) return true;
  for (const child of (node.children || [])) {
    if (_searchInTree(child, targetId)) return true;
  }
  return false;
}

function _applyLayoutPositions(layout, offsetX, offsetY) {
  if (layout.node.id) {
    appState.positions2D.set(layout.node.id, {
      x: layout.x + offsetX,
      y: layout.y + offsetY
    });
  }
  for (const child of layout.children) {
    _applyLayoutPositions(child, offsetX, offsetY);
  }
}

function collectLayoutPositions(layout, skipSteps, positionMap) {
  if (!positionMap) positionMap = new Map();
  if (layout.node.id && !(skipSteps && isNextStepNode(layout.node))) {
    positionMap.set(layout.node.id, { x: layout.x, y: layout.y });
  }
  for (const child of layout.children) {
    collectLayoutPositions(child, skipSteps, positionMap);
  }
  return positionMap;
}

// ============================================================
//  聚焦到节点
// ============================================================
export function focusOnNode2D(nodeId) {
  const pos = appState.positions2D.get(nodeId);
  if (!pos) return;
  const centerWorld = canvasToWorld(canvas.width / 2, canvas.height / 2);
  const targetOffsetX = transform.offsetX + (centerWorld.x - pos.x) * transform.scale;
  const targetOffsetY = transform.offsetY + (centerWorld.y - pos.y) * transform.scale;
  const startOffsetX = transform.offsetX;
  const startOffsetY = transform.offsetY;
  const startScale = transform.scale;
  const targetScale = 1.0;
  const duration = 600;
  const startTime = performance.now();
  function animateFocus(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
    transform.offsetX = startOffsetX + (targetOffsetX - startOffsetX) * eased;
    transform.offsetY = startOffsetY + (targetOffsetY - startOffsetY) * eased;
    transform.scale = startScale + (targetScale - startScale) * eased;
    draw();
    if (progress < 1) requestAnimationFrame(animateFocus);
    else {
      transform.offsetX = targetOffsetX;
      transform.offsetY = targetOffsetY;
      transform.scale = targetScale;
      draw();
    }
  }
  requestAnimationFrame(animateFocus);
}

// ============================================================
//  缩放 & 重置
// ============================================================
function zoom2D(factor) {
  transform.scale *= factor;
  transform.scale = Math.max(0.1, Math.min(3, transform.scale));
  draw();
}

function reset2DView() {
  transform.offsetX = 0;
  transform.offsetY = 0;
  transform.scale = 1;
  draw();
}

// ============================================================
//  键盘平移
// ============================================================
function process2DPanning() {
  if (!visible || !appState.is2DView) return;
  let dx = 0, dy = 0;
  if (keys2D.a || keys2D.ArrowLeft) dx += PAN_SPEED;
  if (keys2D.d || keys2D.ArrowRight) dx -= PAN_SPEED;
  if (keys2D.w || keys2D.ArrowUp) dy += PAN_SPEED;
  if (keys2D.s || keys2D.ArrowDown) dy -= PAN_SPEED;
  if (dx !== 0 || dy !== 0) {
    transform.offsetX += dx;
    transform.offsetY += dy;
    draw();
  }
}

function get2DKeys() { return keys2D; }
function set2DKey(key, value) { if (key in keys2D) keys2D[key] = value; }

// ============================================================
//  注册 appState 回调（模块加载时执行）
// ============================================================
appState.focusOnNode2D = focusOnNode2D;
appState.zoom2D = zoom2D;
appState.reset2DView = reset2DView;
appState.autoArrangeTreeLayout = autoArrangeTreeLayout;
appState.computeAutoArrangeTargets = computeAutoArrangeTargets;
appState.arrangeSubtreeIncremental = arrangeSubtreeIncremental;

appState.startMultiNodeMove = startMultiNodeMove;
appState.process2DPanning = process2DPanning;
appState.get2DKeys = get2DKeys;
appState.set2DKey = set2DKey;

// ============================================================
//  导出供外部使用
// ============================================================
export { groupNodes, autoArrangeTreeLayout, computeAutoArrangeTargets, zoom2D, reset2DView, process2DPanning, get2DKeys, set2DKey };