// ============================================================
//  MoveMode / move-mode / clipboard.js — 复制粘贴
//  - copySelectedNodes / pasteNodes
//  - deepCloneNode / pasteNodeTree（内部）
// ============================================================

import * as THREE from 'three';
import { appState } from '../../module0_AppState.js';
import { currentMouseWorld } from '../../2DView/shared.js';
import { withHistory } from '../../module3_History.js';
import { saveCurrentProjectData } from '../../module2_TreeData.js';
import {
  generateRandomPosition, createNodeMesh, rebuildAllLines
} from '../../VisualComponents/index.js';
import { showToast } from '../../module5_SelectAndEdit.js';
import { generateNodeId } from './shared-internal.js';

// ============================================================
//  深拷贝节点树，保留 _oldId 用于粘贴时重建父子关系
// ============================================================
function deepCloneNode(node) {
  const clone = {
    _oldId: node._oldId || node.id,
    name: node.name,
    desc: node.desc || '',
    children: [],
    sizeScale: node.sizeScale || 1.0,
    ringSpeedFactor: node.ringSpeedFactor ?? 1.0,
    fixedColor: node.fixedColor || null
  };
  if (node.nodeType) clone.nodeType = node.nodeType;
  if (node.blockType) clone.blockType = node.blockType;
  if (node.isStepFlow) clone.isStepFlow = true;
  if (node.richContent) clone.richContent = node.richContent;
  if (node.children) {
    clone.children = node.children.map(child => deepCloneNode(child));
  }
  return clone;
}

// ============================================================
//  复制当前选中的节点到剪贴板
//  - 框选时自动包含所有子节点
//  - 保存 3D/2D 位置和 crossEdges
// ============================================================
export function copySelectedNodes() {
  const selectedIds = appState.selectedNodeIds.size > 0
    ? Array.from(appState.selectedNodeIds)
    : (appState.contextTargetId ? [appState.contextTargetId] : []);

  if (selectedIds.length === 0) {
    showToast('没有选中任何节点');
    return;
  }

  // 1. 收集所有需要复制的 ID：选中节点 + 所有子孙节点
  const allIds = new Set(selectedIds);
  function collectDescendants(node) {
    if (node.children) node.children.forEach(child => {
      allIds.add(child.id);
      collectDescendants(child);
    });
  }
  for (const id of selectedIds) {
    const node = appState.nodeMap.get(id);
    if (node) collectDescendants(node);
  }

  // 2. 建立父子关系映射
  const parentMap = {};
  function buildParentMap(node, parentId) {
    if (parentId && parentId !== appState.VIRTUAL_ROOT_ID) {
      parentMap[node.id] = parentId;
    }
    if (node.children) node.children.forEach(c => buildParentMap(c, node.id));
  }
  buildParentMap(appState.methodsTree, null);

  // 3. 克隆每个选中节点，只保留在 allIds 中的子节点
  function cloneWithFilteredChildren(node) {
    const clone = deepCloneNode(node);
    if (clone.children) {
      clone.children = clone.children
        .filter(c => allIds.has(c._oldId))
        .map(c => cloneWithFilteredChildren(c));
    }
    return clone;
  }

  const nodeDataList = selectedIds
    .map(id => appState.nodeMap.get(id))
    .filter(Boolean)
    .map(node => cloneWithFilteredChildren(node));

  // 4. 确定哪些原本选中节点应粘贴为根节点（父节点不在复制集中）
  const trueRootOldIds = new Set(selectedIds.filter(id => {
    const pid = parentMap[id];
    return !pid || !allIds.has(pid);
  }));

  // 5. 保存位置
  const savedPositions2D = {};
  const savedPositions = {};
  for (const id of allIds) {
    if (appState.positions2D.has(id)) {
      const p = appState.positions2D.get(id);
      savedPositions2D[id] = { x: p.x, y: p.y };
    }
    if (appState.positions.has(id)) {
      savedPositions[id] = appState.positions.get(id).clone();
    }
  }

  // 6. 保存复制集内部的 crossEdges
  const savedCrossEdges = appState.crossEdges
    .filter(e => allIds.has(e.source) && allIds.has(e.target))
    .map(e => ({ ...e }));

  // 7. 存入剪贴板
  appState.clipboard = {
    nodeDataList,
    trueRootOldIds,
    allOldIds: new Set(allIds),
    parentMap,
    positions2D: savedPositions2D,
    positions: savedPositions,
    crossEdges: savedCrossEdges
  };

  showToast(`已复制 ${selectedIds.length} 个节点${allIds.size > selectedIds.length ? `（含子节点共 ${allIds.size} 个）` : ''}`);
}

// ============================================================
//  递归处理一个克隆节点：分配新 ID、创建 mesh、设置位置
//  @returns {Object} 新节点（id 已替换）
// ============================================================
function pasteNodeTree(clonedNode, idMap, offX, offY, offZ, offX2d, offY2d, existingPositions) {
  const oldId = clonedNode._oldId;
  const newId = generateNodeId();
  idMap[oldId] = newId;

  const newNode = { ...clonedNode, id: newId };
  delete newNode._oldId;

  // 设置 2D 位置（使用独立的 2D 偏移）
  const clip = appState.clipboard;
  if (clip.positions2D[oldId]) {
    const op = clip.positions2D[oldId];
    appState.positions2D.set(newId, { x: op.x + offX2d, y: op.y + offY2d });
  }

  // 设置 3D 位置
  if (clip.positions[oldId]) {
    const op = clip.positions[oldId];
    appState.positions.set(newId, new THREE.Vector3(
      op.x + offX, op.y + offY, op.z + offZ
    ));
  } else {
    const randPos = generateRandomPosition(existingPositions, new THREE.Vector3(0, 0, 0));
    appState.positions.set(newId, randPos);
  }

  appState.nodeMap.set(newId, newNode);
  appState.addNodeToCurrentLayer(newId);

  const pos = appState.positions.get(newId);
  createNodeMesh(newNode, pos);

  // 递归处理子节点
  if (newNode.children) {
    newNode.children = newNode.children.map(child =>
      pasteNodeTree(child, idMap, offX, offY, offZ, offX2d, offY2d, existingPositions)
    );
  }

  return newNode;
}

// ============================================================
//  粘贴剪贴板中的节点
//  - 若子节点的父节点也在复制集中 → 保持父子关系
//  - 若子节点的父节点不在复制集中 → 粘贴为根节点
//  - 保持原始相对布局位置
// ============================================================
export function pasteNodes() {
  const clip = appState.clipboard;
  if (!clip || !clip.nodeDataList || clip.nodeDataList.length === 0) {
    showToast('剪贴板为空');
    return;
  }

  withHistory(() => {
    const idMap = {};
    const existingPositions = Array.from(appState.positions.values());

    // 计算复制集中心点（3D），对其应用偏移防止重叠
    let sumX = 0, sumY = 0, sumZ = 0, count3d = 0;
    for (const oldId of clip.allOldIds) {
      const p = clip.positions[oldId];
      if (p) { sumX += p.x; sumY += p.y; sumZ += p.z; count3d++; }
    }
    const ctrX = count3d ? sumX / count3d : 0;
    const ctrY = count3d ? sumY / count3d : 0;
    const ctrZ = count3d ? sumZ / count3d : 0;
    const offX = -ctrX + 3;
    const offY = -ctrY;
    const offZ = -ctrZ + 3;

    // 计算 2D 位置中心偏移（2D 模式下粘贴到鼠标光标位置，否则使用固定偏移）
    let sum2dX = 0, sum2dY = 0, count2d = 0;
    for (const oldId of clip.allOldIds) {
      const p = clip.positions2D[oldId];
      if (p) { sum2dX += p.x; sum2dY += p.y; count2d++; }
    }
    const ctr2dX = count2d ? sum2dX / count2d : 0;
    const ctr2dY = count2d ? sum2dY / count2d : 0;
    const off2dX = appState.is2DView ? (currentMouseWorld.x - ctr2dX) : (-ctr2dX + 80);
    const off2dY = appState.is2DView ? (currentMouseWorld.y - ctr2dY) : (-ctr2dY + 80);

    // 只处理「真·根节点」（其父不在复制集中）
    for (const clonedNode of clip.nodeDataList) {
      const oldId = clonedNode._oldId;
      if (clip.trueRootOldIds.has(oldId)) {
        const newNode = pasteNodeTree(clonedNode, idMap, offX, offY, offZ, off2dX, off2dY, existingPositions);
        if (!appState.methodsTree.children) appState.methodsTree.children = [];
        appState.methodsTree.children.push(newNode);
      }
    }

    // 复制 crossEdges
    for (const edge of clip.crossEdges) {
      const newSource = idMap[edge.source];
      const newTarget = idMap[edge.target];
      if (newSource && newTarget) {
        appState.crossEdges.push({
          source: newSource,
          target: newTarget,
          label: edge.label || '',
          labelHidden: edge.labelHidden !== false,
          customColor: edge.customColor || null
        });
      }
    }

    rebuildAllLines();
    // 派发节点创建事件（批量，供 nodeDiskSync 监听器实时创建磁盘文件夹）
    for (const newId of Object.values(idMap)) {
      const newNode = appState.nodeMap.get(newId);
      if (newNode) {
        window.dispatchEvent(new CustomEvent('astroknot-node-created', {
          detail: { nodeId: newId, node: newNode }
        }));
      }
    }
    saveCurrentProjectData();
    if (appState.refreshTreePanel) appState.refreshTreePanel();
    if (appState.is2DView && appState.refresh2DView) appState.refresh2DView();

    showToast(`已粘贴 ${clip.trueRootOldIds.size} 个节点`);
  })();
}
