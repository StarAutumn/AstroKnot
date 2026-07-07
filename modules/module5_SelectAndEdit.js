// ============================================================
//  模块5：选中系统与节点编辑操作（使用 appState）
//  负责节点单选/多选、删除、添加、重命名、连线设置以及子节点的折叠/展开动画
// ============================================================
import * as THREE from 'three';

import { appState } from './module0_AppState.js';
import { withHistory } from './module3_History.js';
import { showConfirm, showPrompt } from './module4_Confirm.js';
import { saveCurrentProjectData } from './module2_TreeData.js';
import { generateRandomPosition, createNodeMesh, destroyNodeMesh, rebuildAllLines, addSingleTreeLine, removeLinesForNodes, updateLinesVis, buildSceneFromTree, animateDeleteNode } from './VisualComponents/index.js';
import { hideContextMenu } from './module8_ContextMenu.js';
import { isNextStepNode } from './2DView/Layout.js';

export function showToast(message, duration) {
  // 如果已存在提示，先移除
  const old = document.querySelector('.astronot-toast');
  if (old) old.remove();

  const dur = duration || 2500;
  const toast = document.createElement('div');
  toast.className = 'astronot-toast';
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed; top: calc(var(--titlebar-height, 38px) + 12px); left: 50%; transform: translateX(-50%);
    background: rgba(10,25,40,0.96); backdrop-filter: blur(8px);
    border: 1px solid rgba(0,255,255,0.6); color: #eef;
    padding: 10px 24px; border-radius: 40px;
    font-size: 14px; z-index: 100000;
    max-width: 80vw; max-height: 60vh; overflow: auto; white-space: pre-wrap;
    animation: astronotToastFade ${dur}ms ease forwards;
    pointer-events: none;
  `;

  // 注入动画样式（仅一次）
  if (!document.getElementById('astronot-toast-style')) {
    const style = document.createElement('style');
    style.id = 'astronot-toast-style';
    style.textContent = `
      @keyframes astronotToastFade {
        0% { opacity: 0; transform: translate(-50%, -20px); }
        10% { opacity: 1; transform: translate(-50%, 0); }
        85% { opacity: 1; transform: translate(-50%, 0); }
        100% { opacity: 0; transform: translate(-50%, -20px); }
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), dur + 100);
}

// ==================== 选中操作 ====================

/**
 * 清空所有选中节点，并更新 UI 和隐藏右键菜单
 */
export function clearSelected() {
  appState.selectedNodeIds.clear();
  appState.lastSelectedNodeId = null;
  appState.connectedNodeIds = new Set();
  appState.connectedStepNodeIds = new Set();
  appState.connectedLineItems = new Set();
  appState.connectedStepLineItems = new Set();
  updateSelectionUI();
  hideContextMenu();
}

export function computeConnectedHighlight() {
  appState.connectedNodeIds = new Set();
  appState.connectedStepNodeIds = new Set();
  appState.connectedLineItems = new Set();
  appState.connectedStepLineItems = new Set();

  for (const selId of appState.selectedNodeIds) {
    // 选中节点本身加入高亮集（确保父→该节点的连线也能高亮）
    const selNode = appState.nodeMap.get(selId);
    if (selNode && isNextStepNode(selNode)) {
      appState.connectedStepNodeIds.add(selId);
    } else {
      appState.connectedNodeIds.add(selId);
    }

    for (const it of appState.lineItems) {
      if (it.line.mesh.userData.startId === selId) {
        const endNode = appState.nodeMap.get(it.line.mesh.userData.endId);
        if (endNode && isNextStepNode(endNode)) {
          appState.connectedStepNodeIds.add(it.line.mesh.userData.endId);
          appState.connectedStepLineItems.add(it);
        } else {
          appState.connectedNodeIds.add(it.line.mesh.userData.endId);
          appState.connectedLineItems.add(it);
        }
      } else if (it.line.mesh.userData.endId === selId) {
        const startNode = appState.nodeMap.get(it.line.mesh.userData.startId);
        if (startNode && isNextStepNode(startNode)) {
          appState.connectedStepNodeIds.add(it.line.mesh.userData.startId);
          appState.connectedStepLineItems.add(it);
        } else {
          appState.connectedNodeIds.add(it.line.mesh.userData.startId);
          appState.connectedLineItems.add(it);
        }
      }
    }
    // 跨图层连线
    for (const ce of (appState.crossEdges || [])) {
      if (ce.source === selId) {
        const targetNode = appState.nodeMap.get(ce.target);
        if (targetNode && isNextStepNode(targetNode)) {
          appState.connectedStepNodeIds.add(ce.target);
        } else {
          appState.connectedNodeIds.add(ce.target);
        }
      } else if (ce.target === selId) {
        const sourceNode = appState.nodeMap.get(ce.source);
        if (sourceNode && isNextStepNode(sourceNode)) {
          appState.connectedStepNodeIds.add(ce.source);
        } else {
          appState.connectedNodeIds.add(ce.source);
        }
      }
    }
  }
}

/**
 * 设置选中节点（支持 Ctrl 多选）
 * @param {string} id 节点 id
 * @param {boolean} ctrl 是否为 Ctrl 键多选模式
 */
export function setSelectedNode(id, ctrl = false) {
  if (ctrl) {
    if (appState.selectedNodeIds.has(id)) {
      appState.selectedNodeIds.delete(id);
      if (appState.lastSelectedNodeId === id) appState.lastSelectedNodeId = null;
    } else {
      appState.selectedNodeIds.add(id);
      appState.lastSelectedNodeId = id;
    }
  } else {
    appState.selectedNodeIds.clear();
    appState.selectedNodeIds.add(id);
    appState.lastSelectedNodeId = id;
  }
  computeConnectedHighlight();
  updateSelectionUI();
}

/**
 * 获取当前选中的主要节点 id（优先返回 lastSelectedNodeId，否则返回集合中第一个）
 * @returns {string|null}
 */
export function getPrimarySelectedId() {
  if (appState.lastSelectedNodeId && appState.selectedNodeIds.has(appState.lastSelectedNodeId))
    return appState.lastSelectedNodeId;
  if (appState.selectedNodeIds.size > 0) return Array.from(appState.selectedNodeIds)[0];
  return null;
}

/**
 * 更新 UI 上的选中信息（显示选中的节点 id 和名称）
 */
export function updateSelectionUI() {
  const count = appState.selectedNodeIds.size;
  const span = document.getElementById('selectedNodeIdSpan');
  if (span) {
    if (count === 0) span.innerText = '未选中';
    else if (count === 1) {
      let id = Array.from(appState.selectedNodeIds)[0];
      let n = appState.nodeMap.get(id);
      span.innerText = n?.name || '未知节点';
    }
    else span.innerText = `${count} 个节点`;
  }

  // 同步更新任务栏搜索框的值和高亮
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    if (count === 0) {
      searchInput.value = '';
      searchInput.classList.remove('node-selected');
    } else if (count === 1) {
      let id = Array.from(appState.selectedNodeIds)[0];
      let n = appState.nodeMap.get(id);
      searchInput.value = n?.name || '';
      searchInput.classList.add('node-selected');
    } else {
      searchInput.value = `${count} 个节点`;
      searchInput.classList.add('node-selected');
    }
  }

  // 更新源节点显示（只显示名称）
  const srcDisplay = document.getElementById('sourceNodeDisplay');
  if (srcDisplay) {
    if (appState.sourceNodeId) {
      const node = appState.nodeMap.get(appState.sourceNodeId);
      srcDisplay.innerText = node?.name || '未知节点';
    } else {
      srcDisplay.innerText = '未设置';
    }
  }

  // 更新目标节点显示（只显示名称）
  const tgtDisplay = document.getElementById('targetNodeDisplay');
  if (tgtDisplay) {
    if (appState.targetNodeId) {
      const node = appState.nodeMap.get(appState.targetNodeId);
      tgtDisplay.innerText = node?.name || '未知节点';
    } else {
      tgtDisplay.innerText = '未设置';
    }
  }
}

appState.updateSelectionUI = updateSelectionUI;

// ==================== 节点删除（递归） ====================

export function deleteNodeRecursively(nodeId) {
  let node = appState.nodeMap.get(nodeId);
  if (!node) return;
  // 递归删除子节点
  if (node.children) [...node.children].forEach(ch => deleteNodeRecursively(ch.id));
  
  // 从方法树中移除节点（递归搜索）
  const removeFromParent = (parent, id) => {
    if (parent.children) {
      let idx = parent.children.findIndex(c => c.id === id);
      if (idx !== -1) {
        parent.children.splice(idx, 1);
        return true;
      }
      for (const child of parent.children) {
        if (removeFromParent(child, id)) return true;
      }
    }
    return false;
  };
  removeFromParent(appState.methodsTree, nodeId);
  
  // 清理 3D 对象和数据
  destroyNodeMesh(nodeId);
  appState.positions.delete(nodeId);
  appState.positions2D.delete(nodeId);
  appState.nodeMap.delete(nodeId);
  appState.crossEdges = appState.crossEdges.filter(e => e.source !== nodeId && e.target !== nodeId);
  
  // 清理选中状态
  if (appState.sourceNodeId === nodeId) appState.sourceNodeId = null;
  if (appState.targetNodeId === nodeId) appState.targetNodeId = null;
}

export const doDeleteSelectedNodes = () => {
  if (appState.selectedNodeIds.size === 0) { showToast("没有选中任何节点"); return; }
  let toDelete = Array.from(appState.selectedNodeIds);
  // 收集所有将被删除的节点 ID（包括递归子节点），用于增量移除连线
  const allDeletedIds = new Set();
  const collectIds = (id) => {
    allDeletedIds.add(id);
    const node = appState.nodeMap.get(id);
    if (node && node.children) node.children.forEach(ch => collectIds(ch.id));
  };
  for (let id of toDelete) {
    if (id !== appState.VIRTUAL_ROOT_ID && appState.nodeMap.has(id)) collectIds(id);
  }
  for (let id of toDelete) if (id !== appState.VIRTUAL_ROOT_ID && appState.nodeMap.has(id)) deleteNodeRecursively(id);
  // 派发节点删除事件（批量，供 nodeDiskSync 监听器实时删除磁盘文件夹）
  if (allDeletedIds.size > 0) {
    window.dispatchEvent(new CustomEvent('astroknot-node-deleted', {
      detail: { nodeIds: Array.from(allDeletedIds) }
    }));
  }
  clearSelected();
  removeLinesForNodes(allDeletedIds);
  updateLinesVis();
  saveCurrentProjectData();
  if (appState.is2DView && appState.refresh2DView) appState.refresh2DView();
};

export const deleteSelectedNodes = function () {
  if (appState.selectedNodeIds.size === 0) return;
  const nodeCount = appState.selectedNodeIds.size;
  const msg = nodeCount === 1 ? "确定删除选中的1个节点及其所有子节点吗？" : `确定删除选中的${nodeCount}个节点及其所有子节点吗？`;
  const idsToDelete = Array.from(appState.selectedNodeIds);
  showConfirm(msg, () => {
    if (idsToDelete.every(id => !appState.nodeMap.has(id))) return;
    withHistory(() => {
      const allIds = new Set();
      const collectIds = (id) => {
        allIds.add(id);
        const node = appState.nodeMap.get(id);
        if (node && node.children) node.children.forEach(ch => collectIds(ch.id));
      };
      for (const id of idsToDelete) {
        if (id !== appState.VIRTUAL_ROOT_ID && appState.nodeMap.has(id)) collectIds(id);
      }
      let delay = 0;
      for (const id of allIds) {
        setTimeout(() => animateDeleteNode(id), delay);
        delay += 50;
      }
      setTimeout(() => {
        for (const id of allIds) {
          if (appState.nodeMap.has(id)) {
            const node = appState.nodeMap.get(id);
            const removeFromParent = (parent, targetId) => {
              if (parent.children) {
                let idx = parent.children.findIndex(c => c.id === targetId);
                if (idx !== -1) {
                  parent.children.splice(idx, 1);
                  return true;
                }
                for (const child of parent.children) {
                  if (removeFromParent(child, targetId)) return true;
                }
              }
              return false;
            };
            removeFromParent(appState.methodsTree, id);
            appState.positions.delete(id);
            appState.positions2D.delete(id);
            appState.nodeMap.delete(id);
            appState.removeNodeFromLayer(id);
            if (appState.sourceNodeId === id) appState.sourceNodeId = null;
            if (appState.targetNodeId === id) appState.targetNodeId = null;
          }
        }
        // 派发节点删除事件（批量，供 nodeDiskSync 监听器实时删除磁盘文件夹）
        if (allIds.size > 0) {
          window.dispatchEvent(new CustomEvent('astroknot-node-deleted', {
            detail: { nodeIds: Array.from(allIds) }
          }));
        }
        appState.crossEdges = appState.crossEdges.filter(e => !allIds.has(e.source) && !allIds.has(e.target));
        clearSelected();
        removeLinesForNodes(allIds);
        updateLinesVis();
        saveCurrentProjectData();
        if (typeof window.forceRefreshTreePanel === 'function') window.forceRefreshTreePanel();
        if (appState.is2DView && appState.refresh2DView) appState.refresh2DView();
      }, delay + 350);
    })();
  }, null, '删除节点');
};

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

// ==================== 连线管理 ====================

/**
 * 添加交叉连线（源 -> 目标）
 * 弹出输入框让用户可选地输入标签，标签存入 crossEdges
 */
export function addConnection() {
  if (!appState.sourceNodeId || !appState.targetNodeId) {
    showToast("请先设置源节点和目标节点");
    return;
  }
  if (appState.sourceNodeId === appState.targetNodeId) {
    showToast("不能自连");
    return;
  }
  // 允许重复添加，不再检查是否存在
  showPrompt("请输入连线标签（可选，最多20字）", "", (label) => {
    if (label && label.length > 20) {
      showToast("标签不能超过20字");
      return;
    }
    withHistory(() => {
      appState.crossEdges.push({
        source: appState.sourceNodeId,
        target: appState.targetNodeId,
        label: label || "",
        labelHidden: true
      });
      rebuildAllLines();
      saveCurrentProjectData();
      computeConnectedHighlight();
      if (appState.is2DView && appState.refresh2DView) appState.refresh2DView();
    })();
  });
}

export const removeConnection = withHistory(function () {
  if (!appState.sourceNodeId || !appState.targetNodeId) {
    showToast("请先设置源节点和目标节点");
    return;
  }
  let before = appState.crossEdges.length;
  appState.crossEdges = appState.crossEdges.filter(e => !(e.source === appState.sourceNodeId && e.target === appState.targetNodeId) && !(e.source === appState.targetNodeId && e.target === appState.sourceNodeId));
  if (appState.crossEdges.length === before) {
    showToast("未找到连线");
    return;
  }
  rebuildAllLines();
  saveCurrentProjectData();
  computeConnectedHighlight();
});

function ensureConnectionHint() {
  let hint = document.getElementById('connectionHint');
  if (!hint) {
    hint = document.createElement('div');
    hint.id = 'connectionHint';
    hint.style.cssText = 'display:none;position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:rgba(10,25,40,0.94);border:1px solid rgba(0,255,255,0.6);border-radius:24px;padding:10px 24px;z-index:9999;color:#aef0ff;font-size:14px;pointer-events:none;box-shadow:0 4px 20px rgba(0,0,0,0.6);';
    document.body.appendChild(hint);
  }
  return hint;
}

export function startAddConnectionMode(nodeId) {
  appState.connectionMode = 'add';
  appState.connectionSourceId = nodeId;
  let hint = ensureConnectionHint();
  hint.textContent = '🔗 请选择目标节点，右键取消添加连线';
  hint.style.display = 'block';
  if (appState.renderer && appState.renderer.domElement) {
    appState.renderer.domElement.style.cursor = 'crosshair';
  }
}

export function startRemoveConnectionMode(nodeId) {
  appState.connectionMode = 'remove';
  appState.connectionSourceId = nodeId;
  let hint = ensureConnectionHint();
  hint.textContent = '🔗 请选择目标节点，右键取消删除连线';
  hint.style.display = 'block';
  if (appState.renderer && appState.renderer.domElement) {
    appState.renderer.domElement.style.cursor = 'crosshair';
  }
}

export function cancelConnectionMode() {
  let hint = document.getElementById('connectionHint');
  if (hint) hint.style.display = 'none';
  appState.connectionMode = null;
  appState.connectionSourceId = null;
  if (appState.renderer && appState.renderer.domElement) {
    appState.renderer.domElement.style.cursor = '';
  }
}

export function completeAddConnection(targetNodeId) {
  let srcId = appState.connectionSourceId;
  cancelConnectionMode();
  if (srcId === targetNodeId) {
    showToast('不能自连');
    return;
  }
  showPrompt('请输入连线标签（可选，最多20字）', '', function (label) {
    if (label && label.length > 20) {
      showToast('标签不能超过20字');
      return;
    }
    withHistory(function () {
      appState.crossEdges.push({
        source: srcId,
        target: targetNodeId,
        label: label || '',
        labelHidden: !label  // 有标签文字则显示，无标签则隐藏
      });
      rebuildAllLines();
      saveCurrentProjectData();
      computeConnectedHighlight();
      if (appState.is2DView && appState.refresh2DView) appState.refresh2DView();
    })();
  });
}

/**
 * 完成自由绘制连线（带锚点和拐点）
 */
export function completeAddConnectionWithWaypoints(sourceNodeId, sourceAnchor, targetNodeId, targetAnchor, waypoints) {
  if (sourceNodeId === targetNodeId) {
    showToast('不能自连');
    return;
  }
  // 自由绘制完成后也取消连线模式（如果还在的话）
  if (appState.connectionMode) cancelConnectionMode();
  showPrompt('请输入连线标签（可选，最多20字）', '', function (label) {
    if (label && label.length > 20) {
      showToast('标签不能超过20字');
      return;
    }
    withHistory(function () {
      appState.crossEdges.push({
        source: sourceNodeId,
        target: targetNodeId,
        sourceAnchor: sourceAnchor || null,
        targetAnchor: targetAnchor || null,
        waypoints: waypoints && waypoints.length > 0 ? waypoints.map(p => ({ x: p.x, y: p.y })) : null,
        label: label || '',
        labelHidden: !label  // 有标签文字则显示，无标签则隐藏
      });
      rebuildAllLines();
      saveCurrentProjectData();
      computeConnectedHighlight();
      if (appState.is2DView && appState.refresh2DView) appState.refresh2DView();
    })();
  });
}

export function completeRemoveConnection(targetNodeId) {
  let srcId = appState.connectionSourceId;
  let edges = [];
  for (let i = 0; i < appState.crossEdges.length; i++) {
    let e = appState.crossEdges[i];
    if ((e.source === srcId && e.target === targetNodeId) || (e.source === targetNodeId && e.target === srcId)) {
      edges.push({ index: i, edge: e });
    }
  }
  cancelConnectionMode();
  if (edges.length === 0) {
    showToast('未找到连线');
    return;
  }
  if (edges.length === 1) {
    withHistory(function () {
      appState.crossEdges.splice(edges[0].index, 1);
      rebuildAllLines();
      saveCurrentProjectData();
      computeConnectedHighlight();
      if (appState.is2DView && appState.refresh2DView) appState.refresh2DView();
    })();
    return;
  }
  showConnectionSelectDialog(edges, srcId, targetNodeId);
}

export function showConnectionSelectDialog(edges, srcId, targetNodeId) {
  let existing = document.getElementById('connectionSelectModal');
  if (existing) existing.remove();

  let srcName = (appState.nodeMap.get(srcId) || {}).name || srcId;
  let tgtName = (appState.nodeMap.get(targetNodeId) || {}).name || targetNodeId;

  let overlay = document.createElement('div');
  overlay.id = 'connectionSelectModal';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:10001;font-family:system-ui,sans-serif;';

  let listHtml = '';
  for (let i = 0; i < edges.length; i++) {
    let e = edges[i].edge;
    let label = e.label || '（无标签）';
    listHtml += '<label style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:#07161f;border-radius:8px;cursor:pointer;margin-bottom:6px;">' +
      '<input type="checkbox" class="conn-cb" value="' + i + '" checked style="accent-color:#0ff;">' +
      '<span style="color:#c8e6ff;font-size:13px;">' + label + '</span>' +
      '</label>';
  }

  overlay.innerHTML =
    '<div style="background:#0a1a24;border:1px solid #2c6e7e;border-radius:16px;padding:24px 28px;max-width:420px;box-shadow:0 8px 32px rgba(0,0,0,0.6);">' +
    '<p style="color:#eef;font-size:15px;margin:0 0 4px 0;">删除连线</p>' +
    '<p style="color:#5a7a8a;font-size:12px;margin:0 0 16px 0;">' + srcName + ' ↔ ' + tgtName + ' 之间有 ' + edges.length + ' 条连线</p>' +
    '<div style="max-height:220px;overflow-y:auto;">' + listHtml + '</div>' +
    '<div style="display:flex;justify-content:flex-end;gap:12px;margin-top:16px;">' +
    '<button id="connDelCancelBtn" style="background:#2a3a4a;color:#eef;border:none;padding:8px 20px;border-radius:20px;cursor:pointer;font-size:14px;">取消</button>' +
    '<button id="connDelOkBtn" style="background:#6a2c2c;color:#fff;border:none;padding:8px 20px;border-radius:20px;cursor:pointer;font-size:14px;">删除选中</button>' +
    '</div></div>';

  document.body.appendChild(overlay);
  overlay.setAttribute('tabindex', '0');
  overlay.focus();

  let remove = function () {
    if (overlay && overlay.parentNode) overlay.remove();
  };

  document.getElementById('connDelCancelBtn').addEventListener('click', remove);

  document.getElementById('connDelOkBtn').addEventListener('click', function () {
    let cbs = document.querySelectorAll('.conn-cb:checked');
    let indices = [];
    for (let j = 0; j < cbs.length; j++) {
      indices.push(parseInt(cbs[j].value));
    }
    remove();
    if (indices.length === 0) return;
    indices.sort(function (a, b) { return b - a; });
    withHistory(function () {
      for (let k = 0; k < indices.length; k++) {
        appState.crossEdges.splice(edges[indices[k]].index, 1);
      }
      rebuildAllLines();
      saveCurrentProjectData();
      computeConnectedHighlight();
      if (appState.is2DView && appState.refresh2DView) appState.refresh2DView();
    })();
  });

  overlay.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { e.stopPropagation(); remove(); }
  });
}

export function setAsSource() {
  let id = getPrimarySelectedId();
  if (id) {
    appState.sourceNodeId = id;
    updateSelectionUI();
  } else showToast("请先选中一个节点");
}

export function setAsTarget() {
  let id = getPrimarySelectedId();
  if (id) {
    appState.targetNodeId = id;
    updateSelectionUI();
  } else showToast("请先选中一个节点");
}

/**
 * 清空连线源节点
 */
export function clearSourceNode() {
  appState.sourceNodeId = null;
  updateSelectionUI();
}

/**
 * 清空连线目标节点
 */
export function clearTargetNode() {
  appState.targetNodeId = null;
  updateSelectionUI();
}

/**
 * 一键清空源和目标节点
 */
export function clearBothNodes() {
  appState.sourceNodeId = null;
  appState.targetNodeId = null;
  updateSelectionUI();
}

// ==================== 折叠/展开子节点（带动画） ====================

export function toggleChildren() {
  let id = getPrimarySelectedId();
  if (!id) { showToast("请选中一个节点"); return; }
  if (appState._toggleAnimLock && appState._toggleAnimLock.has(id)) return;
  if (!appState._toggleAnimLock) appState._toggleAnimLock = new Set();
  appState._toggleAnimLock.add(id);
  let node = appState.nodeMap.get(id);
  if (!node || !node.children || node.children.length === 0) {
    appState._toggleAnimLock.delete(id);
    showToast("无子节点");
    return;
  }

  let firstChild = node.children[0];
  let firstObj = appState.nodeMeshes.get(firstChild.id);
  if (!firstObj) {
    appState._toggleAnimLock.delete(id);
    return;
  }
  let visible = firstObj.mesh.visible;
  let target = !visible;
  let affected = [];
  for (let c of node.children) {
    affected.push(...(function get(n, list) { list.push(n); if (n.children) n.children.forEach(ch => get(ch, list)); return list; })(c, []));
  }
  let affectedIds = new Set(affected.map(n => n.id));
  let affLines = appState.lineItems.filter(it => affectedIds.has(it.startId) || affectedIds.has(it.endId));
  let start = performance.now(), dur = 500;

  // 标记连线特效正在参与折叠/展开动画，渲染循环跳过其 opacity 覆盖
  appState._lineToggleAnimActive = true;

  if (target) {
    // 极简模式下泛光特效不参与动画，由渲染循环按模式控制
    const showGlow = !appState.simple3D;
    for (let n of affected) {
      let obj = appState.nodeMeshes.get(n.id);
      if (obj) {
        obj.mesh.visible = true; obj.label.visible = true; obj.visible = true;
        obj.mesh.scale.set(0.05, 0.05, 0.05); obj.label.scale.set(0.05, 0.05, 0.05);
        if (obj.mesh.material) { obj.mesh.material.transparent = true; obj.mesh.material.opacity = 0; }
        if (obj.glowSphere && obj.glowSphere.material) {
          obj.glowSphere.visible = showGlow;
          obj.glowSphere.material.transparent = true; obj.glowSphere.material.opacity = 0;
        }
        if (obj.ring && obj.ring.material) { obj.ring.material.transparent = true; obj.ring.material.opacity = 0; }
        if (obj.label && obj.label.element) { obj.label.element.style.opacity = 0; }
        if (obj.surfaceGlowSphere) {
          obj.surfaceGlowSphere.visible = showGlow;
          obj.surfaceGlowSphere.scale.set(0.05, 0.05, 0.05);
          if (obj.surfaceGlowSphere.material) {
            obj.surfaceGlowSphere.material.transparent = true;
            obj.surfaceGlowSphere.material.opacity = 0;
          }
        }
      }
    }
    for (let l of affLines) {
      l.line.setVisible(true);
      l.line.setOpacity(0);
      if (showGlow) {
        // 华丽模式下连线泛光特效参与渐隐渐显动画
        if (l.line.glowTube) { l.line.glowTube.visible = true; l.line.glowTube.material.transparent = true; l.line.glowTube.material.opacity = 0; }
        if (l.line.particlePoints) { l.line.particlePoints.visible = true; l.line.particlePoints.material.opacity = 0; }
      }
      if (l.line.trailPointsMerged) l.line.trailPointsMerged.visible = false;
    }
  }

  function step(now) {
    let t = Math.min(1, (now - start) / dur);
    let ease = 1 - Math.pow(1 - t, 2);
    let sc = target ? ease : 1 - ease;
    sc = Math.max(0.05, sc);
    let opacity = target ? ease : 1 - ease;

    // 极简模式下泛光特效不参与动画
    const showGlow = !appState.simple3D;

    for (let n of affected) {
      let obj = appState.nodeMeshes.get(n.id);
      if (obj) {
        obj.mesh.scale.set(sc, sc, sc);
        if (obj.label) obj.label.scale.set(sc, sc, sc);
        if (obj.mesh.material) { obj.mesh.material.transparent = true; obj.mesh.material.opacity = opacity; }
        if (obj.glowSphere && obj.glowSphere.material && showGlow) { obj.glowSphere.material.transparent = true; obj.glowSphere.material.opacity = opacity; }
        if (obj.ring && obj.ring.material) { obj.ring.material.transparent = true; obj.ring.material.opacity = opacity; }
        if (obj.label && obj.label.element) { obj.label.element.style.opacity = opacity; }
        if (obj.surfaceGlowSphere && showGlow) {
          obj.surfaceGlowSphere.scale.set(sc, sc, sc);
          if (obj.surfaceGlowSphere.material) {
            obj.surfaceGlowSphere.material.transparent = true;
            obj.surfaceGlowSphere.material.opacity = opacity;
          }
        }
      }
    }

    for (let l of affLines) {
      l.line.setOpacity(target ? ease : 1 - ease);
      if (showGlow) {
        // 华丽模式下连线泛光特效渐隐渐显
        if (l.line.glowTube) { l.line.glowTube.material.transparent = true; l.line.glowTube.material.opacity = (target ? ease : 1 - ease) * 0.9; }
        if (l.line.particlePoints) { l.line.particlePoints.material.opacity = target ? ease : 1 - ease; }
      }
    }

    if (t >= 1) {
      for (let n of affected) {
        let obj = appState.nodeMeshes.get(n.id);
        if (obj) {
          obj.mesh.visible = target; obj.label.visible = target; obj.visible = target;
          obj.mesh.scale.set(1, 1, 1);
          if (obj.mesh.material) { obj.mesh.material.transparent = false; obj.mesh.material.opacity = 1; }
          // 泛光球壳：极简模式下不强制显示，由每帧动画循环按模式控制
          const showGlow = target && !appState.simple3D;
          if (obj.glowSphere && obj.glowSphere.material) {
            obj.glowSphere.visible = showGlow;
            obj.glowSphere.material.transparent = true;
            obj.glowSphere.material.opacity = showGlow ? 1 : 0;
          }
          if (obj.ring && obj.ring.material) { obj.ring.material.transparent = false; obj.ring.material.opacity = 1; }
          if (obj.label && obj.label.element) {
            if (target) {
              obj.label.element.style.opacity = 1;
              obj.label.visible = true;
            } else {
              obj.label.element.style.opacity = 0;
              obj.label.visible = false;
            }
          }
          if (obj.surfaceGlowSphere) {
            obj.surfaceGlowSphere.visible = showGlow;
            const nodeData = appState.nodeMap.get(n.id);
            const targetScale = nodeData ? (nodeData.sizeScale || 1) : 1;
            obj.surfaceGlowSphere.scale.setScalar(targetScale);
            if (obj.surfaceGlowSphere.material) {
              obj.surfaceGlowSphere.material.transparent = true;
              obj.surfaceGlowSphere.material.opacity = showGlow ? 1 : 0;
            }
          }
        }
      }
      for (let l of affLines) {
        l.line.setVisible(target);
        if (target) {
          l.line.setOpacity(1);
          if (showGlow) {
            // 华丽模式下恢复连线泛光特效
            if (l.line.glowTube) { l.line.glowTube.visible = true; l.line.glowTube.material.transparent = true; l.line.glowTube.material.opacity = 0.9; }
            if (l.line.particlePoints) { l.line.particlePoints.visible = true; l.line.particlePoints.material.opacity = 1; }
          }
          if (l.line.trailPointsMerged) l.line.trailPointsMerged.visible = true;
        } else {
          l.line.setOpacity(0);
          if (showGlow) {
            // 华丽模式下隐藏连线泛光特效
            if (l.line.glowTube) { l.line.glowTube.visible = false; l.line.glowTube.material.opacity = 0; }
            if (l.line.particlePoints) { l.line.particlePoints.visible = false; l.line.particlePoints.material.opacity = 0; }
          }
          if (l.line.trailPointsMerged) l.line.trailPointsMerged.visible = false;
        }
      }
      updateLinesVis();

      if (target) {
        appState.collapsed2D.delete(id);
      } else {
        appState.collapsed2D.add(id);
      }

      if (appState.refresh2DView) appState.refresh2DView();
      if (appState.refreshTreePanel) appState.refreshTreePanel();

      appState._lineToggleAnimActive = false;
      appState._toggleAnimLock.delete(id);
      return;
    }
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ==================== 展开全部节点（一次性按钮） ====================
export function expandAllNodes() {
  // 收集所有已折叠的父节点（有子节点且第一个子节点不可见）
  let collapsedParents = [];
  for (let [id, node] of appState.nodeMap) {
    if (!node.children || node.children.length === 0) continue;
    let firstChild = node.children[0];
    let firstObj = appState.nodeMeshes.get(firstChild.id);
    if (firstObj && !firstObj.mesh.visible) {
      collapsedParents.push({ id, node });
    }
  }

  if (collapsedParents.length === 0) { showToast("所有节点已是展开状态"); return; }

  // 收集所有受影响的节点和连线（去重）
  let allAffected = new Map(); // id -> node data
  let allAffectedIds = new Set();
  let allLines = [];

  for (let { id: parentId } of collapsedParents) {
    let pNode = appState.nodeMap.get(parentId);
    if (!pNode) continue;
    for (let c of pNode.children) {
      (function collect(n) {
        if (allAffectedIds.has(n.id)) return;
        allAffectedIds.add(n.id);
        allAffected.set(n.id, n);
        if (n.children) n.children.forEach(collect);
      })(c);
    }
  }

  appState.lineItems.forEach(l => {
    if (allAffectedIds.has(l.startId) || allAffectedIds.has(l.endId)) {
      allLines.push(l);
    }
  });

  let count = allAffectedIds.size;
  showToast(`正在展开 ${count} 个节点...`);

  let start = performance.now();
  let dur = Math.min(800, 300 + count * 2); // 节点多时动画稍长

  // 标记连线特效正在参与展开动画，渲染循环跳过其 opacity 覆盖
  appState._lineToggleAnimActive = true;

  // 初始化：全部设为可见但 scale=0, opacity=0
  // 极简模式下泛光特效不参与动画，由渲染循环按模式控制
  const showGlow = !appState.simple3D;
  for (let [nid, n] of allAffected) {
    let obj = appState.nodeMeshes.get(nid);
    if (!obj) continue;
    obj.mesh.visible = true; obj.label.visible = true; obj.visible = true;
    obj.mesh.scale.set(0.05, 0.05, 0.05); obj.label.scale.set(0.05, 0.05, 0.05);
    if (obj.mesh.material) { obj.mesh.material.transparent = true; obj.mesh.material.opacity = 0; }
    if (obj.glowSphere && obj.glowSphere.material) {
      obj.glowSphere.visible = showGlow;
      obj.glowSphere.material.transparent = true; obj.glowSphere.material.opacity = 0;
    }
    if (obj.ring && obj.ring.material) { obj.ring.material.transparent = true; obj.ring.material.opacity = 0; }
    if (obj.label && obj.label.element) { obj.label.element.style.opacity = 0; }
    if (obj.surfaceGlowSphere) {
      obj.surfaceGlowSphere.visible = showGlow;
      obj.surfaceGlowSphere.scale.set(0.05, 0.05, 0.05);
      if (obj.surfaceGlowSphere.material) {
        obj.surfaceGlowSphere.material.transparent = true;
        obj.surfaceGlowSphere.material.opacity = 0;
      }
    }
  }
  for (let l of allLines) {
    l.line.setVisible(true);
    l.line.setOpacity(0);
    if (showGlow) {
      if (l.line.glowTube) { l.line.glowTube.visible = true; l.line.glowTube.material.transparent = true; l.line.glowTube.material.opacity = 0; }
      if (l.line.particlePoints) { l.line.particlePoints.visible = true; l.line.particlePoints.material.opacity = 0; }
    }
    if (l.line.trailPointsMerged) l.line.trailPointsMerged.visible = false;
  }

  function step(now) {
    let t = Math.min(1, (now - start) / dur);
    let ease = 1 - Math.pow(1 - t, 2);
    let sc = Math.max(0.05, ease);
    let opacity = ease;

    // 极简模式下泛光特效不参与动画（showGlow 已在外层定义）
    for (let [nid] of allAffected) {
      let obj = appState.nodeMeshes.get(nid);
      if (!obj) continue;
      obj.mesh.scale.set(sc, sc, sc);
      if (obj.label) obj.label.scale.set(sc, sc, sc);
      if (obj.mesh.material) { obj.mesh.material.transparent = true; obj.mesh.material.opacity = opacity; }
      if (obj.glowSphere && obj.glowSphere.material && showGlow) { obj.glowSphere.material.transparent = true; obj.glowSphere.material.opacity = opacity; }
      if (obj.ring && obj.ring.material) { obj.ring.material.transparent = true; obj.ring.material.opacity = opacity; }
      if (obj.label && obj.label.element) { obj.label.element.style.opacity = opacity; }
      if (obj.surfaceGlowSphere && showGlow) {
        obj.surfaceGlowSphere.scale.set(sc, sc, sc);
        if (obj.surfaceGlowSphere.material) { obj.surfaceGlowSphere.material.opacity = opacity; }
      }
    }
    for (let l of allLines) {
      l.line.setOpacity(opacity);
      if (showGlow) {
        if (l.line.glowTube) { l.line.glowTube.material.transparent = true; l.line.glowTube.material.opacity = opacity * 0.9; }
        if (l.line.particlePoints) { l.line.particlePoints.material.opacity = opacity; }
      }
    }

    if (t >= 1) {
      // 动画结束：恢复正常状态
      for (let [nid, n] of allAffected) {
        let obj = appState.nodeMeshes.get(nid);
        if (!obj) continue;
        obj.mesh.scale.set(1, 1, 1);
        if (obj.mesh.material) { obj.mesh.material.transparent = false; obj.mesh.material.opacity = 1; }
        // 泛光球壳：极简模式下不强制显示，由每帧动画循环按模式控制
        const showGlow = !appState.simple3D;
        if (obj.glowSphere && obj.glowSphere.material) {
          obj.glowSphere.visible = showGlow;
          obj.glowSphere.material.transparent = true;
          obj.glowSphere.material.opacity = showGlow ? 1 : 0;
        }
        if (obj.ring && obj.ring.material) { obj.ring.material.transparent = false; obj.ring.material.opacity = 1; }
        if (obj.label && obj.label.element) { obj.label.element.style.opacity = 1; obj.label.visible = true; }
        if (obj.surfaceGlowSphere) {
          const targetScale = n.sizeScale || 1;
          obj.surfaceGlowSphere.scale.setScalar(targetScale);
          if (obj.surfaceGlowSphere.material) {
            obj.surfaceGlowSphere.visible = showGlow;
            obj.surfaceGlowSphere.material.transparent = true;
            obj.surfaceGlowSphere.material.opacity = showGlow ? 1 : 0;
          }
        }
      }
      // 连线：华丽模式下恢复泛光特效
      for (let l of allLines) {
        l.line.setVisible(true);
        l.line.setOpacity(1);
        if (showGlow) {
          if (l.line.glowTube) { l.line.glowTube.visible = true; l.line.glowTube.material.transparent = true; l.line.glowTube.material.opacity = 0.9; }
          if (l.line.particlePoints) { l.line.particlePoints.visible = true; l.line.particlePoints.material.opacity = 1; }
        }
        if (l.line.trailPointsMerged) l.line.trailPointsMerged.visible = true;
      }
      updateLinesVis();
      // 清除所有折叠记录
      for (let { id: parentId } of collapsedParents) {
        appState.collapsed2D.delete(parentId);
      }
      if (appState.refresh2DView) appState.refresh2DView();
      if (appState.refreshTreePanel) appState.refreshTreePanel();
      appState._lineToggleAnimActive = false;
      showToast(`已展开 ${count} 个节点`);
      return;
    }
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}