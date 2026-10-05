// ============================================================
//  模块5：选中系统与节点编辑操作 —— 节点删除
//  由 module5_SelectAndEdit.js 拆分
// ============================================================
import { appState } from '../module0_AppState.js';
import { withHistory } from '../module3_History.js';
import { showConfirm } from '../module4_Confirm.js';
import { saveCurrentProjectData } from '../TreeData/index.js';
import { destroyNodeMesh, removeLinesForNodes, updateLinesVis, animateDeleteNode } from '../VisualComponents/index.js';
import { showToast } from './toast.js';
import { clearSelected } from './selection.js';

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
  const deletedNodeInfos = []; // 在节点移除前捕获 {id, name}，供磁盘同步删除文件夹
  const collectIds = (id) => {
    allDeletedIds.add(id);
    const node = appState.nodeMap.get(id);
    deletedNodeInfos.push({ id: id, name: node ? node.name : '未命名' });
    if (node && node.children) node.children.forEach(ch => collectIds(ch.id));
  };
  for (let id of toDelete) {
    if (id !== appState.VIRTUAL_ROOT_ID && appState.nodeMap.has(id)) collectIds(id);
  }
  for (let id of toDelete) if (id !== appState.VIRTUAL_ROOT_ID && appState.nodeMap.has(id)) deleteNodeRecursively(id);
  // 派发节点删除事件（批量，供 nodeDiskSync 监听器实时删除磁盘文件夹）
  if (allDeletedIds.size > 0) {
    window.dispatchEvent(new CustomEvent('astroknot-node-deleted', {
      detail: { nodeIds: Array.from(allDeletedIds), nodes: deletedNodeInfos }
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
      const deletedNodeInfos = []; // 在节点移除前捕获 {id, name}，供磁盘同步删除文件夹
      const collectIds = (id) => {
        allIds.add(id);
        const node = appState.nodeMap.get(id);
        deletedNodeInfos.push({ id: id, name: node ? node.name : '未命名' });
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
            detail: { nodeIds: Array.from(allIds), nodes: deletedNodeInfos }
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
