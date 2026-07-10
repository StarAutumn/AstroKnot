// ============================================================
//  节点级实时磁盘同步：监听节点增删事件，增量同步到磁盘
//  策略：
//    1. 节点创建/删除 → 由各入口派发 astroknot-node-created / astroknot-node-deleted
//    2. 本模块监听上述事件，调用 IPC 增删 nodes/{id} 文件夹
//    3. 仅当 folderPath 存在时执行（阶段1：已保存项目）
//    4. content.html 的实时写入由 richEditor/init.js 防抖处理（本模块不涉及）
//  错误处理：best-effort，console.warn 记录，不弹 toast；全量保存作为对账点
// ============================================================

import { appState } from './module0_AppState.js';

let _initialized = false;

/**
 * 获取当前项目文件夹路径（未保存项目返回 null）
 */
function _getProjectFolderPath() {
  const proj = appState.projects?.find(p => p.id === appState.currentProjectId);
  return proj?.folderPath || null;
}

/**
 * 处理节点创建事件：在磁盘上创建 nodes/{节点名称_[nodeId前8位]} 文件夹
 * 若节点携带 richContent（粘贴场景），顺带写入 content.html
 */
async function handleNodeCreated(e) {
  const { nodeId, node } = e.detail || {};
  if (!nodeId) return;
  const folderPath = _getProjectFolderPath();
  if (!folderPath) return;  // 阶段1：未保存项目跳过

  // 防御：节点已不在 nodeMap（撤销竞态）则跳过
  const targetNode = node || appState.nodeMap.get(nodeId);
  if (!targetNode) return;

  if (!window.api?.createNodeFolder) return;
  try {
    const result = await window.api.createNodeFolder(folderPath, targetNode);
    if (!result.success && !result.skipped) {
      console.warn('[节点磁盘同步] 创建文件夹失败:', nodeId, result.error);
      return;
    }
    // 粘贴场景：节点携带 richContent 时顺带写入 content.html
    if (targetNode.richContent && window.api?.writeNodeContent) {
      try {
        await window.api.writeNodeContent(folderPath, targetNode, targetNode.richContent);
      } catch (err) {
        console.warn('[节点磁盘同步] 写入 content.html 失败:', nodeId, err);
      }
    }
  } catch (err) {
    console.warn('[节点磁盘同步] 创建文件夹异常:', nodeId, err);
  }
}

/**
 * 处理节点删除事件：批量删除 nodes/{nodeId} 文件夹
 */
async function handleNodeDeleted(e) {
  const { nodeIds } = e.detail || {};
  if (!Array.isArray(nodeIds) || nodeIds.length === 0) return;
  const folderPath = _getProjectFolderPath();
  if (!folderPath) return;

  if (!window.api?.deleteNodeFolder) return;
  for (const nodeId of nodeIds) {
    try {
      const result = await window.api.deleteNodeFolder(folderPath, nodeId);
      if (!result.success && !result.skipped) {
        console.warn('[节点磁盘同步] 删除文件夹失败:', nodeId, result.error);
      }
    } catch (err) {
      console.warn('[节点磁盘同步] 删除文件夹异常:', nodeId, err);
    }
  }
}

/**
 * 初始化节点磁盘同步：注册事件监听
 */
export function initNodeDiskSync() {
  if (_initialized) return;
  _initialized = true;
  window.addEventListener('astroknot-node-created', handleNodeCreated);
  window.addEventListener('astroknot-node-deleted', handleNodeDeleted);
}
