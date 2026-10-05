// ============================================================
//  MoveMode / event-bindings / align-buttons.js
//  对齐按钮（水平/垂直对齐、分组、分屏）
// ============================================================

import * as THREE from 'three';
import { appState } from '../../../module0_AppState.js';
import { saveCurrentProjectData } from '../../../TreeData/index.js';
import { createNodeMesh, rebuildAllLines } from '../../../VisualComponents/index.js';
import { hideContextMenu } from '../../../module8_ContextMenu.js';

export function bindAlignButtons() {
  // ---- 水平对齐 ----
  document.getElementById('alignRowHorizontal')?.addEventListener('click', () => {
    if (!appState.selectedNodeIds.size) return;
    const ids = Array.from(appState.selectedNodeIds);
    if (ids.length < 2) return;
    const midY = ids.reduce((sum, id) => sum + (appState.positions.get(id)?.y || 0), 0) / ids.length;
    for (const id of ids) {
      const pos = appState.positions.get(id);
      if (pos) {
        pos.y = midY;
        const obj = appState.nodeMeshes.get(id);
        if (obj) {
          obj.mesh.position.y = midY;
          if (obj.label) obj.label.position.set(pos.x, pos.y + appState.NODE_RADIUS + 0.28, pos.z);
        }
      }
    }
    rebuildAllLines();
    saveCurrentProjectData();
    hideContextMenu();
  });

  // ---- 垂直对齐 ----
  document.getElementById('alignRowVertical')?.addEventListener('click', () => {
    if (!appState.selectedNodeIds.size) return;
    const ids = Array.from(appState.selectedNodeIds);
    if (ids.length < 2) return;
    const midX = ids.reduce((sum, id) => sum + (appState.positions.get(id)?.x || 0), 0) / ids.length;
    for (const id of ids) {
      const pos = appState.positions.get(id);
      if (pos) {
        pos.x = midX;
        const obj = appState.nodeMeshes.get(id);
        if (obj) {
          obj.mesh.position.x = midX;
          if (obj.label) obj.label.position.set(pos.x, pos.y + appState.NODE_RADIUS + 0.28, pos.z);
        }
      }
    }
    rebuildAllLines();
    saveCurrentProjectData();
    hideContextMenu();
  });

  // ---- 分组：把选中节点收拢到一个新建的分组节点下 ----
  document.getElementById('groupRow')?.addEventListener('click', () => {
    if (!appState.selectedNodeIds.size) return;
    const ids = Array.from(appState.selectedNodeIds);
    if (ids.length < 2) return;
    const parentNode = appState.nodeMap.get(appState.contextTargetId);
    if (!parentNode) return;
    const groupName = parentNode.name + ' 分组';
    const groupId = 'G' + Date.now() + Math.floor(Math.random() * 10000);
    while (appState.nodeMap.has(groupId)) groupId = 'G' + Date.now() + Math.floor(Math.random() * 10000);
    const groupNode = { id: groupId, name: groupName, desc: '📁 分组节点', children: [], sizeScale: 2.0, ringSpeedFactor: 1.0, fixedColor: null };
    appState.nodeMap.set(groupId, groupNode);
    if (!parentNode.children) parentNode.children = [];
    parentNode.children.push(groupNode);
    for (const childId of ids) {
      const childNode = appState.nodeMap.get(childId);
      if (!childNode) continue;
      const idx = parentNode.children.indexOf(childNode);
      if (idx >= 0) parentNode.children.splice(idx, 1);
      groupNode.children.push(childNode);
    }
    const avgPos = new THREE.Vector3(0, 0, 0);
    let count = 0;
    for (const id of ids) {
      const pos = appState.positions.get(id);
      if (pos) { avgPos.add(pos); count++; }
    }
    if (count) {
      avgPos.divideScalar(count);
      avgPos.y += 3;
      appState.positions.set(groupId, avgPos);
      createNodeMesh(groupNode, avgPos);
    }
    rebuildAllLines();
    saveCurrentProjectData();
    hideContextMenu();
    if (appState.is2DView && appState.refresh2DView) appState.refresh2DView();
    if (appState.refreshTreePanel) appState.refreshTreePanel();
  });

  // ---- 分屏：选中多个节点进入分屏对比 ----
  document.getElementById('splitScreenRow')?.addEventListener('click', () => {
    if (!appState.selectedNodeIds.size) return;
    const ids = Array.from(appState.selectedNodeIds);
    if (ids.length < 2) return;
    appState.splitScreenNodeIds = ids;
    appState.splitScreenNodeIndex = 0;
    if (appState.openSplitScreenPanel) appState.openSplitScreenPanel();
    hideContextMenu();
  });
}
