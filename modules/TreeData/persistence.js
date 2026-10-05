// ============================================================
//  TreeData/persistence：当前项目数据保存与应急快照（模块2拆分）
// ============================================================
import { appState } from '../module0_AppState.js';
import { _persistToLocalStorage } from './web-mode.js';

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
    layer3DSpacing: appState.layer3DSpacing ?? 4,
    cameraView: cameraView,
    treeEdgeLabels: Object.fromEntries(appState.treeEdgeLabels || new Map()),
    fishboneTrunks: JSON.parse(JSON.stringify(appState.fishboneTrunks || []))
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