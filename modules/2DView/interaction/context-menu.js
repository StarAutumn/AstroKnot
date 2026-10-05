// ============================================================
//  2DView / interaction / context-menu.js — 2D 视图右键菜单触发与组群菜单
// ============================================================

import { appState } from '../../module0_AppState.js';
import { setSelectedNode, clearSelected } from '../../SelectAndEdit/index.js';
import {
  showContextMenu, hideContextMenu, showBlankContextMenu,
  hideBlankContextMenu, completeConvertChildMode, cancelConvertChildMode
} from '../../module8_ContextMenu.js';
import {
  cancelConnectionMode
} from '../../SelectAndEdit/index.js';
import { setSelectedGroupRectId } from '../shared.js';
import { canvasToWorld, getCanvasPos } from './coordinate-utils.js';
import { hitTestGroupRect } from './hit-tests.js';
import { cancelFreeDraw } from './free-draw.js';
import { isInBoxSelectionArea } from './box-select.js';
import { fishboneAttachMode } from '../../Fishbone/state.js';
import { cancelFishboneAttach } from '../../Fishbone/ops.js';
import { hitTestFishboneSeg2D, fishboneSegUserData2D } from '../../Fishbone/render2d.js';
import { showFishboneContextMenu, hideFishboneContextMenu } from '../../Fishbone/context-menu.js';
import {
  canvas, nodeHitAreas, groupRects, setPendingMultiMove, boxSelectNodeIds,
  boxSelectSegKeys, isFreeDrawing
} from '../shared.js';

// 画布右键事件
export function onContextMenu(e) {
  e.preventDefault();
  setPendingMultiMove(false);
  canvas.style.cursor = 'grab';
  hideContextMenu();
  hideGroupContextMenu();
  hideFishboneContextMenu();
  if (appState.connectionMode) {
    if (isFreeDrawing) cancelFreeDraw();
    cancelConnectionMode();
    return;
  }
  if (appState.convertChildMode) {
    cancelConvertChildMode();
    return;
  }
  if (fishboneAttachMode) {
    cancelFishboneAttach();   // 右键取消「变成支路」选择模式，不弹右键菜单
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
  // 鱼骨线段右键菜单（节点卡片优先命中；命中线段时关闭连线标签面板；
  // 若命中的是已框选的线段 → 落入多选菜单走批量改色）
  const fishHit = hitTestFishboneSeg2D(worldPos.x, worldPos.y);
  if (fishHit) {
    const fSeg = fishHit.trunk.segs && fishHit.trunk.segs[fishHit.segIndex];
    if (fSeg && boxSelectSegKeys.has(fishHit.trunk.id + '|' + fSeg.id)) {
      // 已框选的线段 → 直接开多选菜单（批量改色）
      showMultiSelectContextMenu(e.clientX, e.clientY);
      return;
    }
    if (appState.hideLineTooltip) appState.hideLineTooltip();
    showFishboneContextMenu(e.clientX, e.clientY, fishboneSegUserData2D(fishHit.trunk, fishHit.segIndex));
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

// 多选右键菜单（对齐/分组/复制/移动/删除/批量改色）
export function showMultiSelectContextMenu(x, y) {
  appState.selectedNodeIds = new Set(boxSelectNodeIds);
  const count = boxSelectNodeIds.size;
  const segCount = boxSelectSegKeys.size;
  document.getElementById('contextNodeName').textContent =
    count && segCount ? `${count} 个节点 · ${segCount} 段鱼骨线`
    : segCount ? `${segCount} 段鱼骨线` : `${count} 个节点`;
  document.getElementById('contextNodeName').style.display = 'inline';
  document.getElementById('contextRenameInput').style.display = 'none';
  // 框选含鱼骨线段：菜单精简为只保留改色（节点批量操作项全部隐藏）
  const segSimplify = segCount > 0;
  ['nodeSizeRow', 'ringSpeedRow', 'nodeShapeRow', 'node3DShapeRow',
   'cardModeRow', 'connectionRow', 'folderRow', 'opsRow'].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.style.display = segSimplify ? 'none' : '';
  });
  ['resetNodeDefaultsBtn', 'contextRenameToggleBtn'].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.style.display = segSimplify ? 'none' : '';
  });
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
  document.getElementById('groupRow').style.display = segSimplify ? 'none' : 'flex';
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
