// ============================================================
//  TreeData/loadProject：加载/切换项目并重建场景与 UI（模块2拆分）
// ============================================================
// 注意：versionGraph 相关函数采用惰性动态 import，避免循环依赖
// （versionGraph.js → versionAutoSave.js → TreeData/index.js → versionGraph.js）
import { appState } from '../module0_AppState.js';
import { showToast } from '../SelectAndEdit/index.js';
import { buildSceneFromTree } from '../VisualComponents/index.js';
import { saveCurrentProjectData } from './persistence.js';
import { renderProjectList } from './project-ui.js';

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

  // 延迟加载：如果项目数据未加载（从磁盘扫描的轻量条目），先从磁盘加载
  if (!proj.data) {
    if (proj.folderPath && window.api?.loadProjectFromFolder) {
      window.api.loadProjectFromFolder(proj.folderPath).then(result => {
        if (result && result.success) {
          import('../module9_FileIO.js').then(({ applyLoadedData }) => {
            applyLoadedData(result.data, proj.name, proj.folderPath);
            renderProjectList();
          });
        } else {
          showToast('加载项目失败: ' + (result?.error || '未知错误'));
        }
      }).catch(err => {
        showToast('加载项目失败: ' + err.message);
      });
      return;  // 异步加载，等待完成
    }
    // 没有数据且无法加载，清空
    appState.methodsTree = null;
    appState.crossEdges = [];
    appState.rebuildNodeMapFromTree();
    appState.positions.clear();
    appState.positions2D.clear();
    return;
  }

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
  // 恢复 3D 按 2D 布局的层间距
  appState.layer3DSpacing = data.layer3DSpacing ?? 4;

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
  // 初始化保存时的历史记录长度为 0（刚加载的项目被视为"干净"状态）
  proj._savedUndoLength = 0;

  renderProjectList();           // 刷新项目列表 UI
  appState.updateSelectionUI();  // 更新选中显示
  appState.hideContextMenu();    // 关闭右键菜单

  // 刷新 2D 视图：methodsTree / currentLayerId / positions2D 已更新，
  // 必须标记布局为脏并重绘，否则 draw() 会沿用旧项目的 _cachedLayout，
  // 经 isNodeInCurrentLayer 过滤后画面一片空白
  if (appState.refresh2DView) appState.refresh2DView();
  else if (appState.redraw2DView) appState.redraw2DView();

  // 切换项目时清空版本图缓存，确保新项目加载自己的版本图
  // 惰性动态 import 避免循环依赖（versionGraph.js → versionAutoSave.js → TreeData/index.js）
  import('../versionGraph/versionGraph.js').then(({ clearCache }) => {
    if (typeof clearCache === 'function') clearCache();
  }).catch(e => console.warn('清空版本图缓存失败:', e));

  // 派发项目切换事件，供版本图面板等监听以刷新显示
  window.dispatchEvent(new CustomEvent('astroknot-project-switched', { detail: { projectId } }));
}