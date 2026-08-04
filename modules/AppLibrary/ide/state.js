// ============================================================
//  state.js — IDE 共享状态对象
//  所有子模块通过 import { S } from './state.js' 访问共享变量
// ============================================================

import { SandboxContext } from './core/context.js';

export const S = {
  // DOM 元素引用
  _modal: document.getElementById('htmlSandboxModal'),
  _content: null,
  _preview: document.getElementById('htmlSandboxPreview'),
  _consoleOut: document.getElementById('htmlConsoleOutput'),
  _nodeName: document.getElementById('htmlSandboxNodeName'),
  _statusText: document.getElementById('sandboxStatusText'),

  // SandboxContext（共享上下文）
  _ctx: null,

  // 功能模块实例
  _consoleModule: null,
  _autoRunModule: null,
  _previewModule: null,
  _commandsModule: null,
  _menuBarModule: null,
  _activityBarModule: null,
  _statusBarModule: null,
  _settingsModule: null,
  _breadcrumbModule: null,
  _imagePreviewModule: null,
  _markdownModule: null,
  _splitEditorModule: null,
  _templateHistoryModule: null,
  _resizeModule: null,
  _fileOpsModule: null,
  _githubImportModule: null,

  // 状态
  _currentNodeId: null,
  _openTimestamp: 0,
  _windowInstance: null,

  // IDE 组件实例
  _vfs: null,
  _fileTree: null,
  _fileTabs: null,
  _monacoEditor: null,
  _search: null,
  _history: null,
  _terminal: null,

  // 预览缓存
  _lastPreviewHtml: '',
  _consoleListener: null,

  // 真实文件系统模式
  _workspacePath: null,
  _isRealFS: false,

  // 自动运行
  _autoRunEnabled: true,
  _autoRunTimer: null,

  // 自动保存
  _autoSaveTimer: null,
  _lastAutoSavePath: null,
  _isRunningPreview: false,

  // 全屏预览
  _previewFullscreen: false,

  // 热注入
  _lastPreviewFiles: new Map(),

  // 容器模式
  _origSandboxModal: null,
  _origSandboxModalParent: null,
  _origSandboxModalNext: null,
  _savedOrphanOverlays: null,
};

export const AUTO_RUN_DEBOUNCE = 800;
export const AUTO_SAVE_DELAY = 3000;

// 初始化上下文
S._ctx = new SandboxContext();
S._ctx.initDOMRefs();
S._content = S._modal ? S._modal.querySelector('.rich-modal-content') : null;
