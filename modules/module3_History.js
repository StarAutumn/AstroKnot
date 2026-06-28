// ============================================================
//  模块3：历史记录管理（基于 appState）
// ============================================================
import * as THREE from 'three';
import { appState } from './module0_AppState.js';
import { saveCurrentProjectData, renderProjectList } from './module2_TreeData.js';
import { buildSceneFromTree } from './VisualComponents/index.js';
import { hideContextMenu } from './module8_ContextMenu.js';

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
        position: { x: appState.camera?.position?.x || 6, y: appState.camera?.position?.y || 4.5, z: appState.camera?.position?.z || 8 },
        target: { x: appState.controls?.target?.x || 0, y: appState.controls?.target?.y || 0.2, z: appState.controls?.target?.z || 0 }
      }
    };
  }

  /**
   * 恢复指定状态
   * 重建场景、更新相机、保存数据、刷新 UI
   * @param {Object} state 状态快照
   */
  _restoreState(state) {
    if (!state) return;

    // 如果处于移动模式，先退出（后退/撤销时自动退出移动模式）
    if (appState.exitMoveMode) {
      appState.exitMoveMode(false);
    }

    // 恢复核心数据
    appState.methodsTree = state.methodsTree;
    appState.crossEdges = state.crossEdges;
    appState.positions.clear();
    for (let [k, v] of state.positions.entries()) appState.positions.set(k, v.clone());
    appState.rebuildNodeMapFromTree();

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

  // 如果处于移动模式，先退出（后退/撤销时自动退出移动模式）
  if (appState.exitMoveMode) {
    appState.exitMoveMode(false);
  }

  appState.methodsTree = state.methodsTree;
  appState.crossEdges = state.crossEdges;
  appState.positions.clear();
  for (let [k, v] of state.positions.entries()) appState.positions.set(k, v.clone());
  appState.rebuildNodeMapFromTree();
  buildSceneFromTree();
  appState.clearSelected();
  const cv = state.cameraView || { position: { x: 0, y: 4.5, z: 8 }, target: { x: 0, y: 0.2, z: 0 } };
  appState.camera.position.set(cv.position.x, cv.position.y, cv.position.z);
  appState.controls.target.set(cv.target.x, cv.target.y, cv.target.z);
  appState.controls.enableDamping = false;
  appState.controls.update();
  appState.controls.enableDamping = true;
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