// ============================================================
//  MoveMode / event-bindings / node-context-menu.js
//  节点右键菜单：操作按钮（折叠/展开/删除/复制/移动）+ 添加子节点/下一步
// ============================================================

import { appState } from '../../../module0_AppState.js';
import {
  expandAllNodes, deleteSelectedNodes,
  getPrimarySelectedId, showToast
} from '../../../module5_SelectAndEdit.js';
import { hideContextMenu } from '../../../module8_ContextMenu.js';
import { enterMoveMode } from '../move-core.js';
import {
  createNodeInProject, getNextGlobalChildName, getNextChildName
} from '../node-factory.js';
import { copySelectedNodes } from '../clipboard.js';

export function bindNodeContextMenu() {
  // ---- 操作按钮 ----
  // 注：toggleChildrenContextBtn 已在 module8_ContextMenu.js 中绑定（含 withHistory + sidebar/2D 分支），
  // 这里不再重复绑定，避免 toggleChildren() 被调用两次导致状态无效。
  // 展开全部节点（任务栏 🔼 弹出框中的 ⊞ 按钮）
  document.getElementById('expandAllNodesBtn')?.addEventListener('click', () => {
    expandAllNodes();
  });
  document.getElementById('deleteNodeContextBtn')?.addEventListener('click', () => {
    if (appState.contextTargetId) deleteSelectedNodes();
  });
  document.getElementById('copyNodeBtn')?.addEventListener('click', () => {
    copySelectedNodes();
    hideContextMenu();
  });
  document.getElementById('showNodeFolderBtn')?.addEventListener('click', async () => {
    if (!appState.contextTargetId || appState.contextTargetId === 'multi') {
      showToast('请右键单个节点后操作');
      return;
    }
    if (!window.api || !window.api.showNodeFolder) {
      showToast('无法打开文件位置（API 不可用）');
      return;
    }
    const node = appState.nodeMap.get(appState.contextTargetId);
    if (!node) { showToast('未找到节点数据'); return; }
    const proj = appState.projects?.find(p => p.id === appState.currentProjectId);
    const projectFolderPath = proj?.folderPath || appState.currentProjectSavePath || null;
    if (!projectFolderPath) {
      showToast('当前项目尚未保存到磁盘');
      return;
    }
    const result = await window.api.showNodeFolder(projectFolderPath, node);
    if (!result.success) {
      if (result.error === 'not_found') showToast('节点文件夹不存在');
      else showToast('打开失败: ' + (result.error || '未知错误'));
    }
  });

  document.getElementById('moveNodeBtn')?.addEventListener('click', () => {
    if (!appState.contextTargetId) return;
    if (appState.contextTargetId === 'multi') {
      if (appState.is2DView && appState.startMultiNodeMove) {
        appState.startMultiNodeMove();
        return;
      }
      const primaryId = getPrimarySelectedId();
      if (primaryId) enterMoveMode(primaryId);
      return;
    }
    enterMoveMode(appState.contextTargetId);
  });

  // ---- 添加子节点 ----
  document.getElementById('addChildNodeBtn')?.addEventListener('click', () => {
    if (!appState.contextTargetId) return;
    const parentId = appState.contextTargetId;
    const parentNode = appState.nodeMap.get(parentId);
    if (!parentNode) return;
    const childName = getNextGlobalChildName();
    createNodeInProject({
      name: childName, desc: '📖 自定义节点', sizeScale: 1.0,
      parentId, offsetX: 160, offsetY: 10
    });
  });

  // ---- 添加下一步节点 ----
  document.getElementById('addNextNodeBtn')?.addEventListener('click', () => {
    if (!appState.contextTargetId) return;
    const parentId = appState.contextTargetId;
    const parentNode = appState.nodeMap.get(parentId);
    if (!parentNode) return;
    const nextName = getNextChildName(parentNode, /^下一步(\d+)$/, '下一步');
    createNodeInProject({
      name: nextName, desc: '📖 自定义节点', sizeScale: 1.0,
      parentId, offsetX: 0, offsetY: 60, isStepFlow: true
    });
  });
}
