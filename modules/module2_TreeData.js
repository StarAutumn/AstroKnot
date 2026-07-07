// ============================================================
//  模块2：数据结构、常量与核心数据管理（基于 appState）
// ============================================================
import { appState } from './module0_AppState.js';
import { showConfirm } from './module4_Confirm.js';
import { showToast } from './module5_SelectAndEdit.js';
import { buildSceneFromTree } from './VisualComponents/index.js';
import * as THREE from 'three';
// 注意：versionGraph 相关函数采用惰性动态 import，避免循环依赖
// （versionGraph.js → versionAutoSave.js → module2_TreeData.js → versionGraph.js）

/**
 * 创建一个空的树结构（只包含虚拟根节点）
 * @returns {Object} 虚拟根节点对象
 */
export const createEmptyTree = () => ({ 
  id: appState.VIRTUAL_ROOT_ID, 
  name: "(虚拟根)", 
  desc: "", 
  children: [] 
});

/**
 * 获取空项目数据模板
 * @returns {Object} { methodsTree, crossEdges, positions, nodeRichContents, cameraView }
 */
export const getEmptyProjectData = () => ({
  methodsTree: createEmptyTree(),
  crossEdges: [],
  positions: new Map(),
  positions2D: {},
  nodeRichContents: {},
  layers: [],
  currentLayerId: null,
  treeEdgeLabels: {},
  cameraView: {
    position: { x: 0, y: 4.5, z: 8 },
    target: { x: 0, y: 0.2, z: 0 }
  }
});

/**
 * 确保节点具有必要的默认属性（大小、光环速度、固定颜色）
 * @param {Object} node 节点对象
 */
export function ensureNodeDefaults(node) {
  if (node.sizeScale === undefined) node.sizeScale = 1.0;
  if (node.ringSpeedFactor === undefined) node.ringSpeedFactor = 1.0;
  if (node.fixedColor === undefined) node.fixedColor = null;
  if (node.activeMode === undefined) node.activeMode = null;
}

/**
 * 克隆位置 Map（深度克隆每个 Vector3）
 * @param {Map} posMap 原位置 Map
 * @returns {Map} 克隆后的 Map
 */
export function clonePositions(posMap) {
  let np = new Map();
  for (let [k, v] of posMap.entries()) np.set(k, v.clone());
  return np;
}

/**
 * 克隆项目数据（深拷贝）
 * @param {Object} data 项目数据
 * @returns {Object} 克隆后的数据
 */
export function cloneProjectData(data) {
  return {
    methodsTree: JSON.parse(JSON.stringify(data.methodsTree)),
    crossEdges: JSON.parse(JSON.stringify(data.crossEdges)),
    positions: clonePositions(data.positions),
    nodeRichContents: JSON.parse(JSON.stringify(data.nodeRichContents || {})),
    treeEdgeLabels: JSON.parse(JSON.stringify(data.treeEdgeLabels || {}))
  };
}

/**
 * 保存当前项目数据到 projects 数组中
 * 通常在上层业务逻辑中调用，确保项目持久化
 */
export function saveCurrentProjectData() {
  if (!appState.currentProjectId) return;
  let proj = appState.projects.find(p => p.id === appState.currentProjectId);
  if (!proj) return;

  // 收集富文本内容
  let nr = {};
  for (let [id, node] of appState.nodeMap.entries()) {
    if (node.richContent) nr[id] = node.richContent;
  }
  // 收集覆盖层数据
  let no = {};
  for (let [id, node] of appState.nodeMap.entries()) {
    if (node.overlayImages && node.overlayImages.length > 0) no[id] = node.overlayImages;
  }
  // 收集 HTML 沙盒源码
  let nhs = {};
  for (let [id, node] of appState.nodeMap.entries()) {
    if (node.htmlSource) nhs[id] = node.htmlSource;
  }
  // 收集虚拟文件系统
  let nfs = {};
  for (let [id, node] of appState.nodeMap.entries()) {
    if (node.fileSystem) nfs[id] = node.fileSystem;
  }
  // 收集节点激活模式
  let nam = {};
  for (let [id, node] of appState.nodeMap.entries()) {
    if (node.activeMode) nam[id] = node.activeMode;
  }
  // 克隆位置
  let po = new Map();
  for (let [id, v] of appState.positions.entries()) po.set(id, v.clone());
  
  // 保存相机视角
  let cameraView = {
    position: { 
      x: appState.camera?.position?.x || 0, 
      y: appState.camera?.position?.y || 4.5, 
      z: appState.camera?.position?.z || 8 
    },
    target: { 
      x: appState.controls?.target?.x || 0, 
      y: appState.controls?.target?.y || 0.2, 
      z: appState.controls?.target?.z || 0 
    }
  };
  
  // 序列化图层数据
  const serializedLayers = (appState.layers || []).map(layer => ({
    id: layer.id,
    name: layer.name,
    order: layer.order,
    nodeIds: layer.nodeIds ? Array.from(layer.nodeIds) : [],
    positions2D: layer.positions2D ? 
      (typeof layer.positions2D[Symbol.iterator] === 'function' ? 
        Object.fromEntries(layer.positions2D) : layer.positions2D) : 
      {}
  }));

  proj.data = {
    methodsTree: JSON.parse(JSON.stringify(appState.methodsTree)),
    crossEdges: JSON.parse(JSON.stringify(appState.crossEdges)),
    positions: po,
    positions2D: appState.positions2D instanceof Map ?
      Object.fromEntries(appState.positions2D) : (appState.positions2D || {}),
    collapsed2D: appState.collapsed2D ?
      (typeof appState.collapsed2D[Symbol.iterator] === 'function' ?
        Array.from(appState.collapsed2D) : appState.collapsed2D) : [],
    nodeRichContents: nr,
    nodeOverlayImages: no,
    nodeHtmlSources: nhs,
    nodeFileSystems: nfs,
    nodeActiveModes: nam,
    layers: serializedLayers,
    currentLayerId: appState.currentLayerId,
    cameraView: cameraView,
    treeEdgeLabels: Object.fromEntries(appState.treeEdgeLabels || new Map())
  };

  // ── Web 环境：持久化到 localStorage ──
  _persistToLocalStorage();
}

/**
 * 获取当前项目的可序列化快照（供应急备份使用）
 * 返回纯 JSON 结构（无 Map/Set/Vector3），调用前会先 saveCurrentProjectData 同步内存
 * @returns {{projectId:string,projectName:string,snapshot:Object}|null}
 */
export function getEmergencySnapshot() {
  if (!appState.currentProjectId) return null;
  saveCurrentProjectData();
  const proj = appState.projects.find(p => p.id === appState.currentProjectId);
  if (!proj || !proj.data) return null;
  const d = proj.data;
  // positions 是 Map<Vector3>，转纯对象
  const po = {};
  if (d.positions instanceof Map) {
    for (const [id, v] of d.positions.entries()) po[id] = { x: v.x, y: v.y, z: v.z };
  } else if (d.positions) {
    for (const id in d.positions) po[id] = d.positions[id];
  }
  return {
    projectId: proj.id,
    projectName: proj.name || '未命名',
    snapshot: {
      methodsTree: d.methodsTree,
      crossEdges: d.crossEdges || [],
      positions: po,
      positions2D: d.positions2D || {},
      collapsed2D: d.collapsed2D || [],
      nodeRichContents: d.nodeRichContents || {},
      nodeOverlayImages: d.nodeOverlayImages || {},
      nodeFileSystems: d.nodeFileSystems || {},
      nodeHtmlSources: d.nodeHtmlSources || {},
      nodeActiveModes: d.nodeActiveModes || {},
      layers: (d.layers || []).map(l => ({
        id: l.id, name: l.name, order: l.order,
        nodeIds: Array.isArray(l.nodeIds) ? l.nodeIds : Array.from(l.nodeIds || []),
        positions2D: l.positions2D instanceof Map ? Object.fromEntries(l.positions2D) : (l.positions2D || {})
      })),
      currentLayerId: d.currentLayerId || null,
      treeEdgeLabels: d.treeEdgeLabels || {},
      cameraView: d.cameraView || { position: { x: 0, y: 4.5, z: 8 }, target: { x: 0, y: 0.2, z: 0 } }
    }
  };
}

/**
 * 加载指定项目，先保存当前项目，再恢复目标项目数据
 * 会重建 3D 场景、清空历史记录、更新 UI
 * @param {string} projectId 项目 ID
 */
export function loadProject(projectId) {
  // 相同项目不重复加载
  if (appState.currentProjectId === projectId) return;
  // 保存当前项目
  if (appState.currentProjectId) saveCurrentProjectData();

  let proj = appState.projects.find(p => p.id === projectId);
  if (!proj) return;
  let data = proj.data;

  // 恢复数据
  appState.methodsTree = JSON.parse(JSON.stringify(data.methodsTree));
  appState.crossEdges = JSON.parse(JSON.stringify(data.crossEdges));
  // 恢复树连线标签（plain object → Map）
  appState.treeEdgeLabels = new Map();
  if (data.treeEdgeLabels) {
    for (let [key, val] of Object.entries(data.treeEdgeLabels)) {
      appState.treeEdgeLabels.set(key, val);
    }
  }
  appState.rebuildNodeMapFromTree();   // 重建节点映射
  appState.positions.clear();
  for (let [k, v] of data.positions.entries()) appState.positions.set(k, v.clone());
  appState.positions2D.clear();
  if (data.positions2D) {
    for (let [id, p] of Object.entries(data.positions2D)) {
      appState.positions2D.set(id, { x: p.x, y: p.y });
    }
  }
  for (let [id, cont] of Object.entries(data.nodeRichContents || {})) {
    if (appState.nodeMap.has(id)) appState.nodeMap.get(id).richContent = cont;
  }
  // 恢复覆盖层数据
  for (let [id, oi] of Object.entries(data.nodeOverlayImages || {})) {
    if (appState.nodeMap.has(id)) appState.nodeMap.get(id).overlayImages = oi;
  }

  // 恢复节点激活模式
  if (data.nodeActiveModes) {
    for (let [id, mode] of Object.entries(data.nodeActiveModes)) {
      if (appState.nodeMap.has(id)) appState.nodeMap.get(id).activeMode = mode;
    }
  }

  // 恢复虚拟文件系统（沙盒 IDE）
  if (data.nodeFileSystems) {
    for (let [id, fs] of Object.entries(data.nodeFileSystems)) {
      if (appState.nodeMap.has(id)) appState.nodeMap.get(id).fileSystem = fs;
    }
  }

  // 恢复 HTML 沙盒源码
  if (data.nodeHtmlSources) {
    for (let [id, hs] of Object.entries(data.nodeHtmlSources)) {
      if (appState.nodeMap.has(id)) appState.nodeMap.get(id).htmlSource = hs;
    }
  }

  // 旧项目兼容：没有 activeMode 的节点自动推断
  for (let [id, node] of appState.nodeMap.entries()) {
    if (!node.activeMode) {
      if (node.sandboxMode || node.fileSystem || (node.htmlSource && node.htmlSource.mode === 'sandbox')) {
        node.activeMode = 'code';
      } else {
        node.activeMode = 'text';
      }
    }
  }

  // 恢复图层数据
  if (data.layers && data.layers.length > 0) {
    appState.layers = data.layers.map(l => ({
      id: l.id,
      name: l.name,
      order: l.order,
      nodeIds: new Set(l.nodeIds || []),
      positions2D: new Map(Object.entries(l.positions2D || {}))
    }));
    appState.currentLayerId = data.currentLayerId || appState.layers[0]?.id || null;
  } else {
    // 旧项目迁移：没有图层数据，创建默认图层
    appState.layers = [];
    appState.currentLayerId = null;
    appState.initDefaultLayer();
  }

  appState.clearSelected();

  // 重建 3D 场景（基于新数据）
  buildSceneFromTree();

  // 恢复相机视角
  let cameraView = data.cameraView || {
    position: { x: 0, y: 4.5, z: 8 },
    target: { x: 0, y: 0.2, z: 0 }
  };
  appState.camera.position.set(
    cameraView.position.x, 
    cameraView.position.y, 
    cameraView.position.z
  );
  appState.controls.target.set(
    cameraView.target.x, 
    cameraView.target.y, 
    cameraView.target.z
  );
  // 先关阻尼更新一次让内部状态与相机位置完全同步，避免首帧跳动
  appState.controls.enableDamping = false;
  appState.controls.update();
  appState.controls.enableDamping = true;
  appState.currentProjectId = projectId;

  // 清空历史记录，防止撤销到旧项目状态
  appState.history.clear();
  renderProjectList();           // 刷新项目列表 UI
  appState.updateSelectionUI();  // 更新选中显示
  appState.hideContextMenu();    // 关闭右键菜单

  // 切换项目时清空版本图缓存，确保新项目加载自己的版本图
  // 惰性动态 import 避免循环依赖（versionGraph.js → versionAutoSave.js → module2_TreeData.js）
  import('./versionGraph/versionGraph.js').then(({ clearCache }) => {
    if (typeof clearCache === 'function') clearCache();
  }).catch(e => console.warn('清空版本图缓存失败:', e));

  // 派发项目切换事件，供版本图面板等监听以刷新显示
  window.dispatchEvent(new CustomEvent('astroknot-project-switched', { detail: { projectId } }));
}

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
        const { saveSettingsToStorage } = await import('./UI/Theme.js');
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
 * 删除项目（需保留至少一个）
 * @param {string} projId 项目 ID
 */
export function deleteProject(projId) {
  const proj = appState.projects.find(p => p.id === projId);
  const projName = proj?.name;
  const folderPath = proj?.folderPath;
  const isLastProject = appState.projects.length === 1;
  
  // 使用自定义确认弹窗
  showConfirm(
    isLastProject 
      ? `删除项目 "${projName}"？这是最后一个项目，删除后将返回开始首页。` 
      : `删除项目 "${projName}"？`, 
    async () => {
      // 清理该项目的版本图缓存和临时存储（惰性动态 import 避免循环依赖）
      try {
        const { clearCache, getVersionKey } = await import('./versionGraph/versionGraph.js');
        const key = getVersionKey(projId);
        clearCache(projId);
        // 仅清理临时存储（项目文件夹内的版本图跟随文件夹，不主动删）
        if (key === projId) {
          const { deleteGraph } = await import('./versionGraph/versionStore.js');
          await deleteGraph(key);
        }
      } catch (e) { console.warn('清理版本图失败:', e); }

      // 删除磁盘上的项目文件夹（已保存项目）
      if (folderPath && window.api?.deleteProjectFolder) {
        try {
          await window.api.deleteProjectFolder(folderPath);
          console.log('[项目删除] 已删除磁盘文件夹:', folderPath);
        } catch (e) {
          console.warn('[项目删除] 删除磁盘文件夹失败:', e);
        }
      }

      // 删除未保存项目的临时文件夹（sandbox-tmp）
      if (!folderPath && window.api?.deleteSandboxTmpFolder) {
        try {
          await window.api.deleteSandboxTmpFolder(projId);
          console.log('[项目删除] 已删除临时文件夹:', projId);
        } catch (e) {
          console.warn('[项目删除] 删除临时文件夹失败:', e);
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
          const { showStartPage } = await import('./StartPage/index.js');
          showStartPage(true);
        }
      }
      renderProjectList();
    }, 
    null, 
    '删除项目'
  );
}

/**
 * 渲染项目列表到 DOM
 * 为每个项目生成带重命名/删除按钮的 UI 项
 */
export function renderProjectList() {
  const c = document.getElementById('projectList');
  if (!c) return;
  c.innerHTML = '';
  // 获取搜索关键词（小写）
  const searchInput = document.getElementById('projectSearchInput');
  const keyword = searchInput ? searchInput.value.trim().toLowerCase() : '';

  const filtered = keyword
    ? appState.projects.filter(p => p.name.toLowerCase().includes(keyword))
    : appState.projects;

  if (filtered.length === 0) {
    c.innerHTML = '<div style="padding:12px;color:#88aacc;text-align:center;">没有匹配的项目</div>';
    return;
  }

  filtered.forEach(proj => {
    const d = document.createElement('div');
    d.className = 'project-item' + (proj.id === appState.currentProjectId ? ' active' : '');
    d.dataset.projectId = proj.id;
    d.innerHTML = `<span class="project-name">${escapeHtml(proj.name)}</span>`;
    d.addEventListener('contextmenu', onProjectItemContextMenu);
    c.appendChild(d);
  });
}

/**
 * 绑定项目列表的事件处理（使用事件委托）
 */
export function bindProjectListEvents() {
  const c = document.getElementById('projectList');
  if (!c) return;
  
  // 先移除可能存在的监听器，避免重复绑定
  c.removeEventListener('click', projectListClickHandler);
  c.removeEventListener('keydown', projectListKeydownHandler);
  
  c.addEventListener('click', projectListClickHandler);
  c.addEventListener('keydown', projectListKeydownHandler);
}

/**
 * 项目列表点击处理函数
 */
function projectListClickHandler(e) {
  const target = e.target;
  
  const projectItem = target.closest('.project-item');
  if (projectItem && !target.closest('.project-name-input')) {
    const id = projectItem.dataset.projectId;
    if (id) loadProject(id);
  }
}

/**
 * 项目列表键盘事件处理函数
 */
function projectListKeydownHandler(e) {
  const input = document.querySelector('.project-name-input');
  if (!input) return;
  
  if (e.key === 'Enter') {
    e.stopPropagation();
    finishRename(input, true);
  } else if (e.key === 'Escape') {
    e.stopPropagation();
    finishRename(input, false);
  }
}

/**
 * 开始重命名编辑
 */
function startRename(projectItem) {
  const nameSpan = projectItem.querySelector('.project-name');
  if (!nameSpan) return;
  
  const currentName = nameSpan.textContent;
  const id = projectItem.dataset.projectId;
  
  const input = document.createElement('input');
  input.type = 'text';
  input.value = currentName;
  input.className = 'project-name-input';
  input.style.cssText = `
    flex: 1;
    background: #0a1a24;
    border: 1px solid #0ff;
    color: #eef;
    padding: 6px 10px;
    border-radius: 16px;
    font-size: 12px;
    outline: none;
  `;
  
  nameSpan.parentNode.replaceChild(input, nameSpan);
  
  setTimeout(() => {
    input.focus();
    input.select();
  }, 0);
  
  document.addEventListener('click', function cancelRename(e) {
    if (!projectItem.contains(e.target)) {
      finishRename(input, false);
      document.removeEventListener('click', cancelRename);
    }
  });
}

/**
 * 完成重命名编辑
 */
function finishRename(input, save) {
  const projectItem = input.closest('.project-item');
  
  if (save) {
    const newName = input.value.trim();
    const id = projectItem?.dataset.projectId;
    
    if (newName && id) {
      const p = appState.projects.find(proj => proj.id === id);
      if (p && p.name !== newName) {
        p.name = newName;
        renderProjectList();
        return;
      }
    }
  }
  
  const currentName = input.value;
  const nameSpan = document.createElement('span');
  nameSpan.className = 'project-name';
  nameSpan.textContent = currentName;
  input.parentNode.replaceChild(nameSpan, input);
}

/**
 * HTML 转义，防止 XSS
 * @param {string} s 输入字符串
 * @returns {string} 转义后的字符串
 */
export function escapeHtml(s) {
  return s.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[m]);
}

// ==================== 项目项右键菜单 ====================
function getOrCreateItemContextMenu() {
  let menu = document.getElementById('itemContextMenu');
  if (!menu) {
    menu = document.createElement('div');
    menu.id = 'itemContextMenu';
    document.body.appendChild(menu);
  }
  return menu;
}

export function hideItemContextMenu() {
  let menu = document.getElementById('itemContextMenu');
  if (menu) menu.style.display = 'none';
}

export function showItemContextMenu(x, y, items) {
  let menu = getOrCreateItemContextMenu();
  menu.innerHTML = '';
  
  items.forEach(function (item) {
    if (item.sep) {
      let sep = document.createElement('div');
      sep.className = 'ctx-sep';
      menu.appendChild(sep);
      return;
    }
    let el = document.createElement('div');
    el.className = 'ctx-item';
    el.textContent = item.label;
    el.addEventListener('click', function (e) {
      e.stopPropagation();
      menu.style.display = 'none';
      if (item.action) item.action();
    });
    menu.appendChild(el);
  });
  
  menu.style.display = 'block';
  menu.style.visibility = 'hidden';
  menu.style.left = '0px';
  menu.style.top = '0px';
  
  let menuW = menu.offsetWidth;
  let menuH = menu.offsetHeight;
  let winW = window.innerWidth;
  let winH = window.innerHeight;
  const TASKBAR = 44;
  
  let left = x + 4;
  let top = y + 4;
  if (left + menuW > winW) left = Math.max(0, winW - menuW - 4);
  if (top + menuH > winH - TASKBAR) top = Math.max(0, winH - TASKBAR - menuH - 4);
  
  menu.style.left = left + 'px';
  menu.style.top = top + 'px';
  menu.style.visibility = 'visible';
}

function onProjectItemContextMenu(e) {
  e.preventDefault();
  e.stopPropagation();
  hideItemContextMenu();

  let projectItem = e.currentTarget;
  let projId = projectItem.dataset.projectId;
  const proj = appState.projects.find(p => p.id === projId);

  showItemContextMenu(e.clientX, e.clientY, [
    { label: '💾 保存', action: function () {
        saveCurrentProjectData();
        document.getElementById('saveNetworkBtn')?.click();
    }},
    { label: '📋 复制项目', action: function () { copyCurrentProject(); } },
    { label: '✏️ 重命名', action: function () { startRename(projectItem); } },
    { sep: true },
    { label: '📂 打开文件所在位置', action: function () {
        if (!proj) return;
        const folderPath = proj.folderPath;
        if (folderPath && window.api && window.api.showFileInFolder) {
          window.api.showFileInFolder(folderPath);
        } else {
          showToast('项目尚未保存到磁盘');
        }
    }},
    { label: '📄 另存为...', action: async function () {
        if (!proj) return;
        const folderPath = proj.folderPath;
        const projectName = proj.name || 'knowledge_graph';
        if (!folderPath) {
          showToast('项目尚未保存，请先保存');
          return;
        }
        if (window.api && window.api.saveProjectAs) {
          const result = await window.api.saveProjectAs(folderPath, projectName);
          if (!result.canceled) {
            showToast('项目已另存为: ' + result.path);
          }
        }
    }},
    { sep: true },
    { label: '🗑️ 删除', action: function () { deleteProject(projId); } }
  ]);
}

document.addEventListener('click', function (e) {
  let menu = document.getElementById('itemContextMenu');
  if (menu && !menu.contains(e.target)) {
    menu.style.display = 'none';
  }
});

window.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    hideItemContextMenu();
  }
});

// ── Web 环境 localStorage 持久化 ──
const _WEB_PROJECTS_KEY = 'astroknot_web_projects';

function _persistToLocalStorage() {
  if (window.__ELECTRON__) return;
  try {
    const serializable = appState.projects.map(p => ({
      id: p.id,
      name: p.name,
      folderPath: p.folderPath || null,
      data: {
        ...p.data,
        positions: p.data.positions ? [...p.data.positions.entries()].map(([k, v]) => [k, { x: v.x, y: v.y, z: v.z }]) : [],
        positions2D: p.data.positions2D || {},
        collapsed2D: p.data.collapsed2D || [],
        nodeRichContents: p.data.nodeRichContents || {},
        nodeOverlayImages: p.data.nodeOverlayImages || {},
        nodeHtmlSources: p.data.nodeHtmlSources || {},
        nodeFileSystems: p.data.nodeFileSystems || {},
        layers: p.data.layers || [],
        currentLayerId: p.data.currentLayerId || null,
        cameraView: p.data.cameraView || { position: { x: 0, y: 4.5, z: 8 }, target: { x: 0, y: 0.2, z: 0 } }
      }
    }));
    localStorage.setItem(_WEB_PROJECTS_KEY, JSON.stringify(serializable));
    localStorage.setItem(_WEB_PROJECTS_KEY + '_current', appState.currentProjectId || '');
  } catch (e) {
    console.warn('[Web持久化] 保存失败:', e);
  }
}

function _restoreFromLocalStorage() {
  if (window.__ELECTRON__) return null;
  try {
    const raw = localStorage.getItem(_WEB_PROJECTS_KEY);
    if (!raw) return null;
    const projects = JSON.parse(raw);
    if (!Array.isArray(projects) || projects.length === 0) return null;
    for (const p of projects) {
      if (p.data.positions && Array.isArray(p.data.positions)) {
        const map = new Map();
        for (const [k, v] of p.data.positions) {
          map.set(k, new THREE.Vector3(v.x, v.y, v.z));
        }
        p.data.positions = map;
      }
      if (p.data.layers && Array.isArray(p.data.layers)) {
        p.data.layers = p.data.layers.map(l => ({
          ...l,
          nodeIds: new Set(l.nodeIds || []),
          positions2D: new Map(Object.entries(l.positions2D || {}))
        }));
      }
    }
    return projects;
  } catch (e) {
    console.warn('[Web持久化] 恢复失败:', e);
    return null;
  }
}

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