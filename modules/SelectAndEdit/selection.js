// ============================================================
//  模块5：选中系统与节点编辑操作 —— 选中状态管理
//  由 module5_SelectAndEdit.js 拆分
// ============================================================
import { appState } from '../module0_AppState.js';
import { hideContextMenu } from '../module8_ContextMenu.js';
import { isNextStepNode } from '../2DView/Layout.js';

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
