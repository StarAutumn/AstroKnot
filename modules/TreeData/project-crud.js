// ============================================================
//  TreeData/project-crud：项目创建/复制/删除/恢复与磁盘文件夹管理（模块2拆分）
// ============================================================
import { appState } from '../module0_AppState.js';
import { showConfirm } from '../module4_Confirm.js';
import { showToast } from '../SelectAndEdit/index.js';
import * as THREE from 'three';
import { getEmptyProjectData, cloneProjectData } from './data-factory.js';
import { saveCurrentProjectData } from './persistence.js';
import { loadProject } from './loadProject.js';
import { renderProjectList } from './project-ui.js';
import { _moveToWebTrash, _persistToLocalStorage } from './web-mode.js';

/**
 * 确保项目在磁盘上有文件夹（新建项目时立即调用）
 * - 若 proj.folderPath 已存在，跳过
 * - 若 currentProjectSavePath 已设置，直接在其下创建项目文件夹
 * - 若 currentProjectSavePath 为空：
 *   - allowDialog=true（用户新建项目）：弹窗选择保存位置，并回填 currentProjectSavePath
 *   - allowDialog=false（默认项目启动）：静默跳过，不弹窗打扰
 * @param {Object} proj - 项目对象（appState.projects 中的元素）
 * @param {boolean} [allowDialog=true] - savePath 为空时是否允许弹窗选择
 */
async function _ensureProjectFolder(proj, allowDialog = true) {
  // 防止重复创建（竞态条件保护）
  if (proj.folderPath) return; // 已有文件夹路径
  if (proj._creatingFolder) return; // 正在创建中，跳过
  proj._creatingFolder = true;

  if (!window.api?.createProjectFolder) {
    proj._creatingFolder = false;
    return; // Web 环境跳过
  }

  try {
    const result = await window.api.createProjectFolder(
      appState.currentProjectSavePath,
      proj.name,
      allowDialog
    );

    if (!result.success) {
      if (result.canceled || result.skipped) {
        proj._creatingFolder = false;
        return; // 用户取消或静默跳过
      }
      console.warn('[项目磁盘同步] 创建项目文件夹失败:', result.error);
      proj._creatingFolder = false;
      return;
    }

    // 设置 folderPath
    proj.folderPath = result.path;

    // 文件夹名被调整（重名加后缀）时同步更新项目名
    if (result.finalName && result.finalName !== proj.name) {
      proj.name = result.finalName;
      renderProjectList(); // 刷新项目列表以显示正确的名称
    }

    // currentProjectSavePath 为空时回填并持久化（避免后续新建项目再次弹窗）
    if (!appState.currentProjectSavePath && result.rootPath) {
      appState.currentProjectSavePath = result.rootPath;
      try {
        const { saveSettingsToStorage } = await import('../UI/Theme.js');
        saveSettingsToStorage();
      } catch (e) {
        // 持久化失败不影响主流程
        console.warn('[项目磁盘同步] 持久化 currentProjectSavePath 失败:', e);
      }
    }

    console.log('[项目磁盘同步] 已创建项目文件夹:', result.path);
  } catch (err) {
    console.warn('[项目磁盘同步] 创建项目文件夹异常:', err);
  } finally {
    proj._creatingFolder = false;
  }
}

/**
 * 创建新项目
 * @param {string} name 项目名称
 */
export function createNewProject(name) {
  // 不在内存中处理重名，完全依赖 IPC handler 的磁盘重名处理
  // IPC handler 会检查文件夹是否存在，自动加编号，并返回 finalName
  const id = 'proj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  const proj = { id, name: name, data: getEmptyProjectData(), folderPath: null };
  appState.projects.push(proj);
  loadProject(id);
  renderProjectList();
  // 异步创建磁盘项目文件夹，确保后续实时同步可用（allowDialog=true：无保存路径时弹窗选择）
  // IPC handler 会返回 finalName，_ensureProjectFolder 会自动更新 proj.name
  _ensureProjectFolder(proj, true);
}

/**
 * 复制当前项目
 */
export function copyCurrentProject() {
  if (!appState.currentProjectId) return;
  let orig = appState.projects.find(p => p.id === appState.currentProjectId);
  if (!orig) return;
  let newId = 'proj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  // 不在内存中添加" (副本)"后缀，完全依赖 IPC handler 的重名处理
  const proj = { id: newId, name: orig.name, data: cloneProjectData(orig.data), folderPath: null };
  appState.projects.push(proj);
  loadProject(newId);
  renderProjectList();
  // 异步创建磁盘项目文件夹（allowDialog=true：无保存路径时弹窗选择）
  // IPC handler 会检测重名并自动添加编号，返回 finalName
  _ensureProjectFolder(proj, true);
}

/**
 * 删除项目
 * - permanent=false（默认）：移入回收站，可恢复
 * - permanent=true（Shift+点击）：永久删除，不可恢复
 * @param {string} projId 项目 ID
 * @param {boolean} permanent 是否永久删除
 */
export function deleteProject(projId, permanent = false) {
  const proj = appState.projects.find(p => p.id === projId);
  const projName = proj?.name;
  const folderPath = proj?.folderPath;
  const isLastProject = appState.projects.length === 1;

  // 根据删除方式构造确认文案
  let confirmText;
  if (permanent) {
    confirmText = `⚠️ 永久删除项目 "${projName}"？此操作不可恢复！`;
  } else {
    confirmText = `将项目 "${projName}" 移入回收站？\n可随时从应用栏的「♻️ 回收站」中恢复。`;
  }
  if (isLastProject) {
    confirmText += '\n（这是最后一个项目，删除后将返回开始首页）';
  }

  // 使用自定义确认弹窗
  showConfirm(
    confirmText,
    async () => {
      // 清理该项目的版本图缓存和临时存储（两种删除方式都清理）
      try {
        const { clearCache, getVersionKey } = await import('../versionGraph/versionGraph.js');
        const key = getVersionKey(projId);
        clearCache(projId);
        // 仅清理临时存储（项目文件夹内的版本图跟随文件夹，不主动删）
        if (key === projId) {
          const { deleteGraph } = await import('../versionGraph/versionStore.js');
          await deleteGraph(key);
        }
      } catch (e) { console.warn('清理版本图失败:', e); }

      if (permanent) {
        // ── 永久删除：沿用现有逻辑 ──
        if (folderPath && window.api?.deleteProjectFolder) {
          try {
            await window.api.deleteProjectFolder(folderPath);
            console.log('[项目删除] 已永久删除磁盘文件夹:', folderPath);
          } catch (e) {
            console.warn('[项目删除] 删除磁盘文件夹失败:', e);
          }
        }
        if (!folderPath && window.api?.deleteSandboxTmpFolder) {
          try {
            await window.api.deleteSandboxTmpFolder(projId);
            console.log('[项目删除] 已永久删除临时文件夹:', projId);
          } catch (e) {
            console.warn('[项目删除] 删除临时文件夹失败:', e);
          }
        }
      } else {
        // ── 软删除：移入回收站 ──
        saveCurrentProjectData(); // 确保未保存项目的最新数据已捕获到 appState.projects
        if (window.__ELECTRON__ && window.api?.moveProjectToTrash) {
          try {
            const serialized = _serializeProjectForIPC(proj);
            await window.api.moveProjectToTrash({
              folderPath,
              projectId: projId,
              projectName: projName,
              projectData: serialized
            });
            console.log('[项目删除] 已移入回收站:', projName);
          } catch (e) {
            console.warn('[项目删除] 移入回收站失败:', e);
          }
        } else {
          // Web 环境：移到 localStorage 回收站
          _moveToWebTrash(proj);
        }
      }

      let idx = appState.projects.findIndex(p => p.id === projId);
      if (idx !== -1) appState.projects.splice(idx, 1);

      // 如果删除的是当前项目
      if (appState.currentProjectId === projId) {
        if (appState.projects.length > 0) {
          // 还有其他项目，切换到第一个
          loadProject(appState.projects[0].id);
        } else {
          // 没有项目了，显示开始首页（带下滑入场动画）
          appState.currentProjectId = null;
          const { showStartPage } = await import('../StartPage/index.js');
          showStartPage(true);
        }
      }
      renderProjectList();
      showToast(permanent ? '项目已永久删除' : '项目已移入回收站');
    },
    null,
    permanent ? '永久删除' : '移入回收站'
  );
}

/**
 * 将项目对象序列化为可经 IPC 传输的纯 JSON（扁平结构，匹配 save-project 的 projectData 格式）
 * 供回收站未保存项目写入磁盘使用（_writeProjectToDisk 期望扁平结构 + overlayImages 字段名）
 * @param {Object} proj - appState.projects 中的项目对象
 * @returns {Object} 可序列化的项目数据（扁平结构）
 */
function _serializeProjectForIPC(proj) {
  if (!proj || !proj.data) return proj;
  const d = proj.data;
  // positions: Map<Vector3> → 普通对象 {id:{x,y,z}}（匹配磁盘格式）
  let positionsObj = {};
  if (d.positions && typeof d.positions[Symbol.iterator] === 'function') {
    for (const [k, v] of d.positions.entries()) {
      positionsObj[k] = { x: v.x, y: v.y, z: v.z };
    }
  } else if (d.positions && typeof d.positions === 'object') {
    positionsObj = d.positions;
  }
  // layers: Set → 数组
  const layers = (d.layers || []).map(l => ({
    id: l.id,
    name: l.name,
    order: l.order,
    nodeIds: l.nodeIds && typeof l.nodeIds[Symbol.iterator] === 'function' ? Array.from(l.nodeIds) : (l.nodeIds || []),
    positions2D: l.positions2D instanceof Map ? Object.fromEntries(l.positions2D) : (l.positions2D || {})
  }));
  return {
    id: proj.id,
    name: proj.name,
    projectName: proj.name,           // 兼容 save-project 的字段名
    methodsTree: d.methodsTree,
    crossEdges: d.crossEdges || [],
    positions: positionsObj,           // 普通对象格式（磁盘格式）
    positions2D: d.positions2D instanceof Map ? Object.fromEntries(d.positions2D) : (d.positions2D || {}),
    collapsed2D: d.collapsed2D && typeof d.collapsed2D[Symbol.iterator] === 'function' ? Array.from(d.collapsed2D) : (d.collapsed2D || []),
    nodeRichContents: d.nodeRichContents || {},
    overlayImages: d.nodeOverlayImages || {},   // 磁盘格式字段名为 overlayImages
    nodeHtmlSources: d.nodeHtmlSources || {},
    nodeFileSystems: d.nodeFileSystems || {},
    nodeActiveModes: d.nodeActiveModes || {},
    layers,
    currentLayerId: d.currentLayerId || null,
    treeEdgeLabels: d.treeEdgeLabels || {},
    cameraView: d.cameraView || { position: { x: 0, y: 4.5, z: 8 }, target: { x: 0, y: 0.2, z: 0 } }
  };
}

/**
 * 将恢复的项目数据加入 appState.projects（不自动切换当前项目，除非当前无项目）
 * 供回收站「恢复」功能调用
 * @param {Object} data - 从 read-project-from-folder IPC 返回的项目数据（磁盘格式）
 * @param {string} folderName - 项目名称
 * @param {string} folderPath - 恢复后的项目文件夹路径
 */
export function addRestoredProject(data, folderName, folderPath) {
  if (!data) return;

  // 将磁盘格式的 positions（普通对象 {id:{x,y,z}}）转为内存格式 Map<Vector3>
  let positionsMap = new Map();
  if (data.positions) {
    if (Array.isArray(data.positions)) {
      // 数组格式 [[id,{x,y,z}],...]
      for (const [k, v] of data.positions) {
        positionsMap.set(k, new THREE.Vector3(v.x, v.y, v.z));
      }
    } else {
      // 普通对象格式 {id:{x,y,z}}
      for (const [k, v] of Object.entries(data.positions)) {
        positionsMap.set(k, new THREE.Vector3(v.x, v.y, v.z));
      }
    }
  }

  // 确定 projectId（使用原始 ID，若已存在则生成新 ID）
  let projId = data.id || ('proj_' + Date.now());
  if (appState.projects.find(p => p.id === projId)) {
    projId = 'proj_' + Date.now();
  }

  // 构造项目对象（内存格式：positions 为 Map，其余为普通对象/数组，与 saveCurrentProjectData 一致）
  const project = {
    id: projId,
    name: folderName || data.name || '已恢复项目',
    folderPath: folderPath || null,
    data: {
      methodsTree: data.methodsTree,
      crossEdges: data.crossEdges || [],
      positions: positionsMap,
      positions2D: data.positions2D || {},
      collapsed2D: data.collapsed2D || [],
      nodeRichContents: data.nodeRichContents || {},
      // 磁盘格式字段名为 overlayImages，内存格式为 nodeOverlayImages
      nodeOverlayImages: data.overlayImages || data.nodeOverlayImages || {},
      nodeHtmlSources: data.nodeHtmlSources || {},
      nodeFileSystems: data.nodeFileSystems || {},
      nodeActiveModes: data.nodeActiveModes || {},
      layers: data.layers || [],
      currentLayerId: data.currentLayerId || null,
      treeEdgeLabels: data.treeEdgeLabels || {},
      cameraView: data.cameraView || { position: { x: 0, y: 4.5, z: 8 }, target: { x: 0, y: 0.2, z: 0 } }
    }
  };

  appState.projects.push(project);

  // 若当前无项目，加载恢复的项目；否则仅刷新列表（不打断当前工作）
  if (!appState.currentProjectId) {
    loadProject(projId);
  } else {
    renderProjectList();
  }

  // Web 环境持久化
  _persistToLocalStorage();

  return projId;
}