// ============================================================
//  2DView / interaction / context-menu.js — 2D 视图右键菜单触发与组群菜单
// ============================================================

import { appState } from '../../module0_AppState.js';
import { setSelectedNode, clearSelected } from '../../module5_SelectAndEdit.js';
import {
  showContextMenu, hideContextMenu, showBlankContextMenu,
  hideBlankContextMenu, completeConvertChildMode, cancelConvertChildMode
} from '../../module8_ContextMenu.js';
import {
  cancelConnectionMode
} from '../../module5_SelectAndEdit.js';
import { setSelectedGroupRectId } from '../shared.js';
import { canvasToWorld, getCanvasPos } from './coordinate-utils.js';
import { hitTestGroupRect } from './hit-tests.js';
import { cancelFreeDraw } from './free-draw.js';
import { isInBoxSelectionArea } from './box-select.js';
import {
  canvas, nodeHitAreas, groupRects, setPendingMultiMove, boxSelectNodeIds,
  isFreeDrawing
} from '../shared.js';

// 画布右键事件
export function onContextMenu(e) {
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

// 多选右键菜单（对齐/分组/复制/移动/删除）
export function showMultiSelectContextMenu(x, y) {
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

// 组群矩形右键菜单
export function showGroupRectContextMenu(x, y, gr) {
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

export function hideGroupContextMenu() {
  const menu = document.getElementById('groupContextMenu');
  if (menu) menu.style.display = 'none';
}
