// ============================================================
//  模块5：选中系统与节点编辑操作 —— 节点添加与重命名
//  由 module5_SelectAndEdit.js 拆分
// ============================================================
import * as THREE from 'three';

import { appState } from '../module0_AppState.js';
import { withHistory } from '../module3_History.js';
import { saveCurrentProjectData } from '../TreeData/index.js';
import { generateRandomPosition, createNodeMesh, addSingleTreeLine } from '../VisualComponents/index.js';
import { showToast } from './toast.js';
import { getPrimarySelectedId } from './selection.js';

// ==================== 添加节点 ====================

export const addNode = withHistory(function () {
  let name = document.getElementById('newNodeName').value.trim();
  if (!name) { showToast("请输入节点名称"); return; }
  let desc = document.getElementById('newNodeDesc').value.trim() || "自定义节点";
  let parentId = getPrimarySelectedId();
  let parentNode = (parentId && appState.nodeMap.has(parentId)) ? appState.nodeMap.get(parentId) : appState.methodsTree;
  let newId = 'N' + Date.now() + Math.floor(Math.random() * 10000);
  while (appState.nodeMap.has(newId)) newId = 'N' + Date.now() + Math.floor(Math.random() * 10000);
  let defaultSizeScale = (parentNode === appState.methodsTree) ? 3.0 : 1.0;
  let newNode = { id: newId, name, desc, children: [], sizeScale: defaultSizeScale, ringSpeedFactor: 1.0, fixedColor: null };
  if (!parentNode.children) parentNode.children = [];
  parentNode.children.push(newNode);
  appState.nodeMap.set(newId, newNode);
  appState.addNodeToCurrentLayer(newId);
  let existing = Array.from(appState.positions.values());
  let base = (parentId && appState.positions.has(parentId)) ? appState.positions.get(parentId) : new THREE.Vector3(0, 0, 0);
  let newPos = generateRandomPosition(existing, base);
  appState.positions.set(newId, newPos);
  createNodeMesh(newNode, newPos);
  // 增量添加连线，避免销毁重建导致其他连线粒子动画重置
  if (parentId && parentId !== appState.VIRTUAL_ROOT_ID) {
    addSingleTreeLine(parentId, newId);
  }
  // 派发节点创建事件（供 nodeDiskSync 监听器实时创建磁盘文件夹）
  window.dispatchEvent(new CustomEvent('astroknot-node-created', {
    detail: { nodeId: newId, node: newNode }
  }));
  document.getElementById('newNodeName').value = '';
  saveCurrentProjectData();
  if (typeof window.forceRefreshTreePanel === 'function') window.forceRefreshTreePanel();
});

// ==================== 重命名 ====================

export const renamePrimaryNode = withHistory(function (newNameInput) {
  let id = getPrimarySelectedId();
  if (appState.contextTargetId && appState.nodeMap.has(appState.contextTargetId)) id = appState.contextTargetId;
  if (!id) { showToast("请先选中一个节点"); return; }
  let newName = newNameInput || document.getElementById('contextRenameInput').value.trim();
  if (!newName) { showToast("请输入新名称"); return; }
  let node = appState.nodeMap.get(id);
  if (!node) return;
  node.name = newName;
  let obj = appState.nodeMeshes.get(id);
  if (obj && obj.label) obj.label.element.textContent = newName;
  const cnSpan = document.getElementById('contextNodeName');
  if (cnSpan) cnSpan.textContent = newName;
  saveCurrentProjectData();
  if (typeof window.forceRefreshTreePanel === 'function') window.forceRefreshTreePanel();
});
