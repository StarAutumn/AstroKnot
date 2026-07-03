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
 * 创建新项目
 * @param {string} name 项目名称
 */
export function createNewProject(name) {
  // 自动递增编号，防止重名保存冲突
  let finalName = name;
  const existingNames = appState.projects.map(p => p.name);
  if (existingNames.includes(name)) {
    // 找同基名已用的最大编号
    let maxN = 0;
    const prefix = name + ' (';
    for (const n of existingNames) {
      if (n === name) { maxN = Math.max(maxN, 1); continue; }
      if (n.startsWith(prefix) && n.endsWith(')')) {
        const num = parseInt(n.slice(prefix.length, -1));
        if (!isNaN(num)) maxN = Math.max(maxN, num);
      }
    }
    finalName = name + ' (' + (maxN + 1) + ')';
  }
  let id = 'proj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  appState.projects.push({ id, name: finalName, data: getEmptyProjectData() });
  loadProject(id);
  renderProjectList();
}

/**
 * 复制当前项目
 */
export function copyCurrentProject() {
  if (!appState.currentProjectId) return;
  let orig = appState.projects.find(p => p.id === appState.currentProjectId);
  if (!orig) return;
  let newId = 'proj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  appState.projects.push({ id: newId, name: orig.name + " (副本)", data: cloneProjectData(orig.data) });
  loadProject(newId);
  renderProjectList();
}

/**
 * 删除项目（需保留至少一个）
 * @param {string} projId 项目 ID
 */
export function deleteProject(projId) {
  if (appState.projects.length <= 1) {
    if (typeof showToast === 'function') showToast('至少保留一个项目');
    else console.warn('至少保留一个项目');
    return;
  }
  const projName = appState.projects.find(p => p.id === projId)?.name;
  // 使用自定义确认弹窗
  showConfirm(`删除项目 "${projName}"？`, () => {
    // 清理该项目的版本图缓存和临时存储（惰性动态 import 避免循环依赖）
    import('./versionGraph/versionGraph.js').then(({ clearCache, getVersionKey }) => {
      try {
        const key = getVersionKey(projId);
        clearCache(projId);
        // 仅清理临时存储（项目文件夹内的版本图跟随文件夹，不主动删）
        if (key === projId) {
          return import('./versionGraph/versionStore.js').then(({ deleteGraph }) => deleteGraph(key));
        }
      } catch (e) { console.warn('清理版本图失败:', e); }
    }).catch(e => console.warn('清理版本图失败:', e));

    let idx = appState.projects.findIndex(p => p.id === projId);
    if (idx !== -1) appState.projects.splice(idx, 1);
    // 如果删除的是当前项目，切换到第一个项目
    if (appState.currentProjectId === projId) loadProject(appState.projects[0].id);
    else renderProjectList();   // 否则只刷新列表
  }, null, '删除项目');
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
  
  showItemContextMenu(e.clientX, e.clientY, [
    { label: '💾 保存', action: function () {
        saveCurrentProjectData();
        document.getElementById('saveNetworkBtn')?.click();
    }},
    { label: '📋 复制项目', action: function () { copyCurrentProject(); } },
    { label: '✏️ 重命名', action: function () { startRename(projectItem); } },
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
 * 初始化默认项目（应用启动时调用）
 * 创建名为"我的空白网络"的项目并加载
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
  } else {
    appState.projects.push({ id: 'default', name: '我的空白网络', data: getEmptyProjectData() });
    loadProject('default');
  }
  // ★ 绑定项目搜索
  const si = document.getElementById('projectSearchInput');
  if (si) si.addEventListener('input', renderProjectList);
  
  // ★ 绑定项目列表事件（使用事件委托）
  bindProjectListEvents();
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