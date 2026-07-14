// ============================================================
//  sandbox-context.js — 沙盒 IDE 共享上下文
//  所有模块通过 ctx 实例访问共享状态和跨模块通信
//  三种通信机制：
//   1. Action 注册/执行（替代巨型 switch）
//   2. 事件聚合（一对多通知，如 contentChange）
//   3. 模块注册/获取（1:1 交互）
// ============================================================

import { appState } from '../../../module0_AppState.js';
import { saveCurrentProjectData } from '../../../module2_TreeData.js';
import { showToast } from '../../../module5_SelectAndEdit.js';

export class SandboxContext {
  constructor() {
    // ── 不可变 DOM 引用 ──
    this._modal = null;
    this._content = null;
    this._preview = null;
    this._consoleOut = null;
    this._nodeName = null;
    this._statusText = null;

    // ── 核心状态 ──
    this._currentNodeId = null;
    this._openTimestamp = 0;
    this._windowInstance = null;

    // ── UI 状态（跨模块共享） ──
    this._isPreviewTab = false;
    this._activePanel = 'explorer'; // 'explorer' | 'search' | null

    // ── IDE 核心组件实例 ──
    this._vfs = null;
    this._fileTree = null;
    this._fileTabs = null;
    this._monacoEditor = null;
    this._search = null;
    this._history = null;
    this._terminal = null;

    // ── 功能模块实例 ──
    this._modules = {};

    // ── Action 注册表 ──
    this._actions = {};

    // ── 事件监听 ──
    this._listeners = {};

    // ── 历史面板 DOM 引用 ──
    this._historyPanel = null;
  }

  // ════════════════════════════════════════════════════════════
  //  DOM 引用
  // ════════════════════════════════════════════════════════════

  get modal() { return this._modal; }
  get content() { return this._content; }
  get preview() { return this._preview; }
  set preview(value) { this._preview = value; }
  get consoleOut() { return this._consoleOut; }
  get nodeName() { return this._nodeName; }

  // ════════════════════════════════════════════════════════════
  //  核心状态
  // ════════════════════════════════════════════════════════════

  get currentNodeId() { return this._currentNodeId; }
  set currentNodeId(v) { this._currentNodeId = v; }

  get openTimestamp() { return this._openTimestamp; }
  set openTimestamp(v) { this._openTimestamp = v; }

  get windowInstance() { return this._windowInstance; }
  set windowInstance(v) { this._windowInstance = v; }

  get isPreviewTab() { return this._isPreviewTab; }
  set isPreviewTab(v) { this._isPreviewTab = v; }

  get activePanel() { return this._activePanel; }
  set activePanel(v) { this._activePanel = v; }

  // ════════════════════════════════════════════════════════════
  //  核心组件实例
  // ════════════════════════════════════════════════════════════

  get vfs() { return this._vfs; }
  set vfs(v) { this._vfs = v; }

  get fileTree() { return this._fileTree; }
  set fileTree(v) { this._fileTree = v; }

  get fileTabs() { return this._fileTabs; }
  set fileTabs(v) { this._fileTabs = v; }

  get monacoEditor() { return this._monacoEditor; }
  set monacoEditor(v) { this._monacoEditor = v; }

  get search() { return this._search; }
  set search(v) { this._search = v; }

  get history() { return this._history; }
  set history(v) { this._history = v; }

  get terminal() { return this._terminal; }
  set terminal(v) { this._terminal = v; }

  // ════════════════════════════════════════════════════════════
  //  Action 注册/执行
  // ════════════════════════════════════════════════════════════

  /**
   * 注册一个 action（各模块在 init() 时调用）
   * @param {string} name - action 名称
   * @param {Function} fn - action 处理函数
   */
  registerAction(name, fn) {
    this._actions[name] = fn;
  }

  /**
   * 执行一个 action（菜单/命令面板分发时调用）
   * @param {string} name - action 名称
   * @param {...any} args - 参数
   * @returns {any} action 返回值，未注册返回 undefined
   */
  executeAction(name, ...args) {
    const fn = this._actions[name];
    if (fn) return fn(...args);
    return undefined;
  }

  // ════════════════════════════════════════════════════════════
  //  事件聚合
  // ════════════════════════════════════════════════════════════

  /**
   * 监听事件
   * @param {string} event - 事件名
   * @param {Function} fn - 回调
   */
  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
  }

  /**
   * 移除事件监听
   * @param {string} event - 事件名
   * @param {Function} fn - 回调
   */
  off(event, fn) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(f => f !== fn);
  }

  /**
   * 触发事件
   * @param {string} event - 事件名
   * @param {any} data - 事件数据
   */
  emit(event, data) {
    if (!this._listeners[event]) return;
    for (const fn of this._listeners[event]) {
      try { fn(data); } catch (e) { console.error(`[SandboxContext] 事件 ${event} 处理出错:`, e); }
    }
  }

  // ════════════════════════════════════════════════════════════
  //  模块注册/获取
  // ════════════════════════════════════════════════════════════

  /**
   * 注册功能模块
   * @param {string} name - 模块名
   * @param {Object} instance - 模块实例
   */
  registerModule(name, instance) {
    this._modules[name] = instance;
  }

  /**
   * 获取功能模块
   * @param {string} name - 模块名
   * @returns {Object|undefined}
   */
  getModule(name) {
    return this._modules[name];
  }

  // ════════════════════════════════════════════════════════════
  //  便捷方法
  // ════════════════════════════════════════════════════════════

  /**
   * 设置状态栏文本
   */
  setStatus(text) {
    if (this._statusText) this._statusText.textContent = text;
  }

  /**
   * 获取项目文件夹路径
   */
  getProjectFolderPath() {
    const proj = appState.projects?.find(p => p.id === appState.currentProjectId);
    return proj?.folderPath || null;
  }

  /**
   * 初始化 DOM 引用
   */
  initDOMRefs() {
    this._modal = document.getElementById('htmlSandboxModal');
    this._content = this._modal ? this._modal.querySelector('.rich-modal-content') : null;
    this._preview = document.getElementById('htmlSandboxPreview');
    this._consoleOut = document.getElementById('htmlConsoleOutput');
    this._nodeName = document.getElementById('htmlSandboxNodeName');
    this._statusText = document.getElementById('sandboxStatusText');
    this._historyPanel = document.getElementById('sandboxHistoryPanel');
  }

  /**
   * 获取原始 Monaco 编辑器实例（供模块直接操作编辑器 API）
   * @returns {any|null}
   */
  getEditor() {
    return this._monacoEditor?.editor || null;
  }

  /**
   * 重置所有可变状态（关闭编辑器时调用）
   */
  reset() {
    this._currentNodeId = null;
    this._openTimestamp = 0;
    this._isPreviewTab = false;
    this._activePanel = 'explorer';
    this._vfs = null;
    this._fileTree = null;
    this._fileTabs = null;
    this._monacoEditor = null;
    this._search = null;
    this._history = null;
    this._terminal = null;
    this._actions = {};
    this._listeners = {};
  }
}

console.log('[sandbox-context] 模块已加载');
