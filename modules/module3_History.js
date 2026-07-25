// ============================================================
//  模块3：历史记录管理（基于 appState）
// ============================================================
import * as THREE from 'three';
import { appState } from './module0_AppState.js';
import { saveCurrentProjectData, renderProjectList } from './module2_TreeData.js';
import { buildSceneFromTree } from './VisualComponents/index.js';
import { hideContextMenu } from './module8_ContextMenu.js';
import { groupRects, setGroupRects } from './2DView/shared.js';

/**
 * 历史记录管理器
 * 维护撤销/重做栈，支持状态快照捕获和恢复
 */
class HistoryManager {
  /**
   * @param {number} maxSize 最大历史记录条数
   */
  constructor(maxSize = 50) {
    this.undoStack = [];   // 撤销栈
    this.redoStack = [];   // 重做栈
    this.maxSize = maxSize;
  }

  /**
   * 捕获当前应用状态（树结构、连线、位置）
   * @returns {Object} 状态快照
   */
  _captureState() {
    return {
      methodsTree: JSON.parse(JSON.stringify(appState.methodsTree)),
      crossEdges: JSON.parse(JSON.stringify(appState.crossEdges)),
      positions: this._clonePositions(appState.positions),
      cameraView: {
        position: {
          x: appState.camera?.position?.x ?? 6,
          y: appState.camera?.position?.y ?? 4.5,
          z: appState.camera?.position?.z ?? 8
        },
        target: {
          x: appState.controls?.target?.x ?? 0,
          y: appState.controls?.target?.y ?? 0.2,
          z: appState.controls?.target?.z ?? 0
        }
      },
      // 图层状态：layers 内的 positions2D/nodeIds 是 Map/Set，需手动序列化
      layers: (appState.layers || []).map(l => ({
        id: l.id,
        name: l.name,
        order: l.order,
        nodeIds: Array.from(l.nodeIds || []),
        positions2D: Object.fromEntries(
          [...(l.positions2D || [])].map(([k, v]) => [k, { x: v.x, y: v.y }])
        )
      })),
      currentLayerId: appState.currentLayerId || null,
      layer3DLayout: !!appState.layer3DLayout,
      layer3DSpacing: appState.layer3DSpacing ?? 4,
      // 2D 视图状态
      collapsed2D: new Set(appState.collapsed2D || []),
      view2DTransform: appState.view2DTransform
        ? { ...appState.view2DTransform }
        : null,
      is2DView: !!appState.is2DView,
      // 2D 群组矩形（运行时状态，不持久化但需支持撤销）
      groupRects: JSON.parse(JSON.stringify(groupRects || []))
    };
  }

  /**
   * 恢复指定状态
   * 重建场景、更新相机、保存数据、刷新 UI
   * @param {Object} state 状态快照
   */
  _restoreState(state) {
    if (!state) return;

    // 退出所有特殊模式（移动/连线/转换子节点/编辑）
    if (appState.exitMoveMode) appState.exitMoveMode(false);
    appState.connectionMode = null;
    appState.convertChildMode = null;
    appState.convertChildSourceId = null;
    appState.currentEditNodeId = null;
    // 重置可能残留的 crosshair 光标
    if (appState.renderer?.domElement) {
      appState.renderer.domElement.style.cursor = '';
    }

    // 恢复核心数据
    appState.methodsTree = state.methodsTree;
    appState.crossEdges = state.crossEdges;
    appState.positions.clear();
    for (let [k, v] of state.positions.entries()) appState.positions.set(k, v.clone());
    appState.rebuildNodeMapFromTree();

    // 恢复图层状态（layers 内的 positions2D/nodeIds 需转回 Map/Set）
    if (state.layers) {
      appState.layers = state.layers.map(l => ({
        ...l,
        nodeIds: new Set(l.nodeIds || []),
        positions2D: new Map(
          Object.entries(l.positions2D || {}).map(([k, v]) => [k, { x: v.x, y: v.y }])
        )
      }));
      appState.currentLayerId = state.currentLayerId || null;
      appState.layer3DLayout = !!state.layer3DLayout;
      appState.layer3DSpacing = state.layer3DSpacing ?? 4;
      // 同步当前图层的 positions2D 引用（appState.positions2D 指向当前图层）
      const curL = appState.layers.find(l => l.id === appState.currentLayerId);
      if (curL) appState.positions2D = curL.positions2D;
    }

    // 恢复 2D 视图状态
    if (state.collapsed2D) appState.collapsed2D = new Set(state.collapsed2D);
    if (state.view2DTransform && appState.view2DTransform) {
      Object.assign(appState.view2DTransform, state.view2DTransform);
    }
    if (state.groupRects) setGroupRects(JSON.parse(JSON.stringify(state.groupRects)));

    // 重建 3D 场景
    buildSceneFromTree();

    // 重置选中和相机
    appState.clearSelected();
    const cv = state.cameraView || { position: { x: 0, y: 4.5, z: 8 }, target: { x: 0, y: 0.2, z: 0 } };
    appState.camera.position.set(cv.position.x, cv.position.y, cv.position.z);
    appState.controls.target.set(cv.target.x, cv.target.y, cv.target.z);
    appState.controls.enableDamping = false;
    appState.controls.update();
    appState.controls.enableDamping = true;

    // 刷新 2D 视图（撤销/重做后必须重绘，否则画面不同步）
    if (appState.refresh2DView) appState.refresh2DView();
    else if (appState.redraw2DView) appState.redraw2DView();

    // 持久化和 UI 更新
    saveCurrentProjectData();
    renderProjectList();
    hideContextMenu();
  }

  /**
   * 克隆位置 Map（深拷贝每个 Vector3）
   * @param {Map} posMap
   * @returns {Map}
   */
  _clonePositions(posMap) {
    const newMap = new Map();
    for (let [k, v] of posMap.entries()) newMap.set(k, v.clone());
    return newMap;
  }

  /**
   * 将当前状态推入撤销栈
   * 同时清空重做栈，并更新按钮样式
   */
  pushState() {
    const state = this._captureState();
    this.undoStack.push(state);
    // 限制栈大小
    if (this.undoStack.length > this.maxSize) this.undoStack.shift();
    this.redoStack = [];
    this.updateButtons();
  }

  /**
   * 撤销：弹出上一个状态并恢复
   */
  undo() {
    if (this.undoStack.length === 0) return;
    const currentState = this._captureState();
    this.redoStack.push(currentState);
    const prevState = this.undoStack.pop();
    this._restoreState(prevState);
    this.updateButtons();
  }

  /**
   * 重做：弹出重做栈并恢复
   */
  redo() {
    if (this.redoStack.length === 0) return;
    const currentState = this._captureState();
    this.undoStack.push(currentState);
    const nextState = this.redoStack.pop();
    this._restoreState(nextState);
    this.updateButtons();
  }

  /**
   * 更新撤销/重做按钮的视觉状态（透明度）
   */
  updateButtons() {
    const u = document.getElementById('undoBtn'), r = document.getElementById('redoBtn');
    if (u) u.style.opacity = this.undoStack.length === 0 ? '0.4' : '1';
    if (r) r.style.opacity = this.redoStack.length === 0 ? '0.4' : '1';
  }

  /**
   * 清空历史记录（通常在切换项目或加载文件时调用）
   */
  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.updateButtons();
  }

  /**
   * 设置最大历史记录条数
   * @param {number} size 新的大小限制
   */
  setMaxSize(size) {
    if (typeof size === 'number' && size > 0) {
      this.maxSize = size;
    }
  }

  /**
   * 获取当前历史记录配置
   * @returns {Object} 配置信息
   */
  getConfig() {
    return {
      maxSize: this.maxSize,
      undoCount: this.undoStack.length,
      redoCount: this.redoStack.length
    };
  }

  /**
   * 记录当前状态（直接调用 pushState）
   */
  record() {
    this.pushState();
  }
}

// 创建历史管理器实例并挂载到 appState
const history = new HistoryManager();
appState.history = history;

/**
 * 应用历史状态（供外部调用的版本，与 _restoreState 类似但不需要栈操作）
 * @param {Object} state 状态快照
 */
export function applyHistoryState(state) {
  if (!state) return;

  // 退出所有特殊模式
  if (appState.exitMoveMode) appState.exitMoveMode(false);
  appState.connectionMode = null;
  appState.convertChildMode = null;
  appState.convertChildSourceId = null;
  appState.currentEditNodeId = null;
  if (appState.renderer?.domElement) {
    appState.renderer.domElement.style.cursor = '';
  }

  appState.methodsTree = state.methodsTree;
  appState.crossEdges = state.crossEdges;
  appState.positions.clear();
  for (let [k, v] of state.positions.entries()) appState.positions.set(k, v.clone());
  appState.rebuildNodeMapFromTree();

  // 恢复图层状态
  if (state.layers) {
    appState.layers = state.layers.map(l => ({
      ...l,
      nodeIds: new Set(l.nodeIds || []),
      positions2D: new Map(
        Object.entries(l.positions2D || {}).map(([k, v]) => [k, { x: v.x, y: v.y }])
      )
    }));
    appState.currentLayerId = state.currentLayerId || null;
    appState.layer3DLayout = !!state.layer3DLayout;
    appState.layer3DSpacing = state.layer3DSpacing ?? 4;
    const curL = appState.layers.find(l => l.id === appState.currentLayerId);
    if (curL) appState.positions2D = curL.positions2D;
  }

  // 恢复 2D 视图状态
  if (state.collapsed2D) appState.collapsed2D = new Set(state.collapsed2D);
  if (state.view2DTransform && appState.view2DTransform) {
    Object.assign(appState.view2DTransform, state.view2DTransform);
  }
  if (state.groupRects) setGroupRects(JSON.parse(JSON.stringify(state.groupRects)));

  buildSceneFromTree();
  appState.clearSelected();
  const cv = state.cameraView || { position: { x: 0, y: 4.5, z: 8 }, target: { x: 0, y: 0.2, z: 0 } };
  appState.camera.position.set(cv.position.x, cv.position.y, cv.position.z);
  appState.controls.target.set(cv.target.x, cv.target.y, cv.target.z);
  appState.controls.enableDamping = false;
  appState.controls.update();
  appState.controls.enableDamping = true;

  if (appState.refresh2DView) appState.refresh2DView();
  else if (appState.redraw2DView) appState.redraw2DView();

  saveCurrentProjectData();
  renderProjectList();
  hideContextMenu();
}

/**
 * 高阶函数：为函数自动包裹历史记录
 * 在函数执行前自动调用 history.record()
 * @param {Function} fn 需要记录历史的函数
 * @returns {Function} 包装后的函数
 */
export function withHistory(fn) {
  return function (...args) {
    history.record();           // 操作前记录当前状态
    const r = fn.apply(this, args);
    history.updateButtons();    // 更新按钮状态
    return r;
  };
}

export { history };