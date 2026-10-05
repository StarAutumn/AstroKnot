// ============================================================
//  TreeData：模块2（数据结构、常量与核心数据管理）统一出口
//  由 module2_TreeData.js 拆分，对外 API 通过本文件统一导出
// ============================================================
import { appState } from '../module0_AppState.js';
import * as THREE from 'three';
import { saveCurrentProjectData } from './persistence.js';
import { loadProject } from './loadProject.js';
import { renderProjectList, bindProjectListEvents } from './project-ui.js';
import { _restoreFromLocalStorage, _WEB_PROJECTS_KEY } from './web-mode.js';

export { createEmptyTree, getEmptyProjectData, ensureNodeDefaults, clonePositions, cloneProjectData, countDescendants } from './data-factory.js';
export { saveCurrentProjectData, getEmergencySnapshot } from './persistence.js';
export { loadProject } from './loadProject.js';
export { createNewProject, copyCurrentProject, deleteProject, addRestoredProject } from './project-crud.js';
export { renderProjectList, bindProjectListEvents, escapeHtml, hideItemContextMenu, showItemContextMenu } from './project-ui.js';
export { _getWebTrash, _restoreWebTrash, _permanentDeleteWebTrash, _emptyWebTrash } from './web-mode.js';

/**
 * 初始化项目（应用启动时调用）
 * 尝试恢复已保存的项目，如果没有项目则不创建默认项目
 * @returns {boolean} 是否成功加载了项目
 */
export function initProjects() {
  // ── Web 环境：优先从 localStorage 恢复 ──
  const restored = _restoreFromLocalStorage();
  if (restored) {
    for (const p of restored) {
      appState.projects.push(p);
    }
    const currentId = localStorage.getItem(_WEB_PROJECTS_KEY + '_current') || appState.projects[0]?.id;
    loadProject(currentId);
    console.log('[Web持久化] 已从 localStorage 恢复', restored.length, '个项目');
  }
  
  // ★ 绑定项目搜索
  const si = document.getElementById('projectSearchInput');
  if (si) si.addEventListener('input', renderProjectList);
  
  // ★ 绑定项目列表事件（使用事件委托）
  bindProjectListEvents();
  
  // 返回是否有项目加载
  return appState.projects.length > 0;
}

/**
 * Electron 环境下从磁盘加载项目列表（仅元数据，不加载完整数据）
 * 供启动时填充最近项目列表使用
 */
export async function loadProjectListFromDisk() {
  if (!window.__ELECTRON__ || !window.api?.listProjects) return;
  try {
    const res = await window.api.listProjects();
    if (!res || !res.list || res.list.length === 0) return;
    // 只添加不在 appState.projects 中的项目（按 folderPath 去重）
    const existingPaths = new Set(appState.projects.filter(p => p.folderPath).map(p => p.folderPath));
    for (const item of res.list) {
      if (existingPaths.has(item.folderPath)) continue;
      appState.projects.push({
        id: 'disk_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        name: item.name,
        folderPath: item.folderPath,
        data: null,  // 延迟加载：点击打开时才从磁盘读取完整数据
        _savedUndoLength: 0  // 磁盘上的项目视为"干净"状态
      });
    }
    renderProjectList();
  } catch (e) {
    console.warn('[项目列表] 从磁盘加载失败:', e);
  }
}
// 暴露给同步模块在下载后刷新项目列表
window.loadProjectListFromDisk = loadProjectListFromDisk;

/**
 * 从应急备份快照恢复为当前项目
 * @param {Object} snapshotData - emergency-restore 返回的 snapshot 对象
 * @param {string} [projectName] - 备份时的项目名
 */
export function restoreEmergencySnapshot(snapshotData, projectName) {
  if (!snapshotData || !snapshotData.methodsTree) return;
  // 构造与 loadProject 兼容的 data（positions 需转回 Map<Vector3>）
  const posMap = new Map();
  if (snapshotData.positions) {
    for (const id in snapshotData.positions) {
      const p = snapshotData.positions[id];
      posMap.set(id, new THREE.Vector3(p.x, p.y, p.z));
    }
  }
  const data = {
    methodsTree: snapshotData.methodsTree,
    crossEdges: snapshotData.crossEdges || [],
    positions: posMap,
    positions2D: snapshotData.positions2D || {},
    collapsed2D: snapshotData.collapsed2D || [],
    nodeRichContents: snapshotData.nodeRichContents || {},
    nodeOverlayImages: snapshotData.nodeOverlayImages || {},
    nodeFileSystems: snapshotData.nodeFileSystems || {},
    nodeHtmlSources: snapshotData.nodeHtmlSources || {},
    nodeActiveModes: snapshotData.nodeActiveModes || {},
    layers: (snapshotData.layers || []).map(l => ({
      id: l.id, name: l.name, order: l.order,
      nodeIds: new Set(l.nodeIds || []),
      positions2D: new Map(Object.entries(l.positions2D || {}))
    })),
    currentLayerId: snapshotData.currentLayerId || null,
    treeEdgeLabels: snapshotData.treeEdgeLabels || {},
    cameraView: snapshotData.cameraView || { position: { x: 0, y: 4.5, z: 8 }, target: { x: 0, y: 0.2, z: 0 } }
  };
  // 先保存当前项目（避免丢失未落盘数据）
  if (appState.currentProjectId) saveCurrentProjectData();
  // 创建一个新项目承载恢复的数据
  const newId = 'restored_' + Date.now();
  appState.projects.push({ id: newId, name: (projectName || '恢复的项目') + ' (恢复)', data: data });
  loadProject(newId);
  renderProjectList();
}