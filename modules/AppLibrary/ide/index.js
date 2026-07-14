// ============================================================
//  代码编辑器 (沙盒 IDE) — VSCode 风格迷你 IDE
//  右键节点 → "💻 以 HTML 方式打开" → IDE 编辑器
//  双击节点 → 渲染代码运行效果
//  使用 WindowManager 统一管理窗口状态、动画、拖拽
//  Monaco Editor + 文件树 + 标签页 + esbuild-wasm 打包
//
//  扩展功能：
//   ✓ 控制台面板（对象展开/过滤/计数/错误徽标）
//   ✓ 快捷键（Ctrl+S/Enter/W/`/Shift+F/P/F1）
//   ✓ 自动保存 + 智能运行（防抖）
//   ✓ Emmet 缩写 + 代码片段模板
//   ✓ 多种预览模式（响应式/主题/全屏）
//   ✓ 全局文件搜索（Ctrl+Shift+F）
//   ✓ 本地历史记录（快照/diff/回滚）
//   ✓ CSS/JS 实时热注入
// ============================================================

import { appState } from '../../module0_AppState.js';
import { VirtualFileSystem, migrateHtmlSource } from './core/virtual-fs.js';
import { FileTreeComponent } from './editors/file-tree.js';
import { FileTabsComponent } from './editors/tabs.js';
import { SandboxMonacoEditor } from './editors/monaco-editor.js';
import { SandboxHistory } from './features/history.js';
import { SandboxSearch } from './editors/search.js';
import { SandboxTerminal } from './editors/terminal.js';
import { SandboxContext } from './core/context.js';
import { SandboxConsole } from './panels/console.js';
import { SandboxAutoRun } from './features/auto-run.js';
import { SandboxPreview } from './panels/preview.js';
import { SandboxCommands } from './features/commands.js';
import { SandboxMenuBar } from './layout/menubar.js';
import { SandboxActivityBar } from './layout/activity-bar.js';
import { SandboxStatusBar } from './layout/statusbar.js';
import { SandboxSettings } from './features/settings.js';
import { SandboxBreadcrumb } from './layout/breadcrumb.js';
import { SandboxImagePreview } from './panels/image-preview.js';
import { SandboxMarkdownPreview } from './panels/markdown-preview.js';
import { SandboxSplitEditor } from './panels/split-editor.js';
import { SandboxTemplateHistory } from './features/template-history.js';
import { SandboxResize } from './layout/resize.js';
import { SandboxFileOps } from './features/file-ops.js';
import { SandboxGithubImport } from './panels/github-import.js';

// ════════════════════════════════════════════════════════════
//  DOM 元素引用（容器化初始化时动态设置）
// ════════════════════════════════════════════════════════════
let _modal = document.getElementById('htmlSandboxModal');
let _content = _modal ? _modal.querySelector('.rich-modal-content') : null;
let _preview = document.getElementById('htmlSandboxPreview');
let _consoleOut = document.getElementById('htmlConsoleOutput');
let _nodeName = document.getElementById('htmlSandboxNodeName');
let _statusText = document.getElementById('sandboxStatusText');

// ── SandboxContext（共享上下文） ──
const _ctx = new SandboxContext();
_ctx.initDOMRefs();

// ── 功能模块实例 ──
let _consoleModule = null; // SandboxConsole
let _autoRunModule = null; // SandboxAutoRun
let _previewModule = null; // SandboxPreview
let _commandsModule = null; // SandboxCommands
let _menuBarModule = null; // SandboxMenuBar
let _activityBarModule = null; // SandboxActivityBar
let _statusBarModule = null; // SandboxStatusBar
let _settingsModule = null; // SandboxSettings
let _breadcrumbModule = null; // SandboxBreadcrumb
let _imagePreviewModule = null; // SandboxImagePreview
let _markdownModule = null; // SandboxMarkdownPreview
let _splitEditorModule = null; // SandboxSplitEditor
let _templateHistoryModule = null; // SandboxTemplateHistory
let _resizeModule = null; // SandboxResize
let _fileOpsModule = null; // SandboxFileOps
let _githubImportModule = null; // SandboxGithubImport

let _currentNodeId = null;
let _openTimestamp = 0;
let _windowInstance = null;  // WindowManager 窗口实例

// IDE 组件实例
let _vfs = null;           // VirtualFileSystem
let _fileTree = null;      // FileTreeComponent
let _fileTabs = null;      // FileTabsComponent
let _monacoEditor = null;  // SandboxMonacoEditor
let _search = null;        // SandboxSearch
let _history = null;       // SandboxHistory
let _terminal = null;      // SandboxTerminal

// 预览缓存
let _lastPreviewHtml = '';
let _consoleListener = null;

// 真实文件系统模式
let _workspacePath = null; // 当前打开的工作区文件夹路径
let _isRealFS = false; // 是否处于真实文件系统模式

// 自动运行
let _autoRunEnabled = true;
let _autoRunTimer = null;
const AUTO_RUN_DEBOUNCE = 800;

// 自动保存到磁盘（实时同步）
let _autoSaveTimer = null;
const AUTO_SAVE_DELAY = 3000; // 3秒防抖
let _lastAutoSavePath = null; // 记录上次自动保存的文件路径
let _isRunningPreview = false; // runPreview 防重入标记

// 控制台状态（已迁移到 SandboxConsole 模块，此处变量已移除）

// 全屏预览状态
let _previewFullscreen = false;

// Activity Bar 和侧边面板状态（已迁移到 SandboxContext: ctx.activePanel, ctx.isPreviewTab）
// 预览标签状态（已迁移到 SandboxContext: ctx.isPreviewTab）

// 热注入：记录上次预览时各文件的内容
let _lastPreviewFiles = new Map(); // path → content

// 历史面板（已迁移到 SandboxTemplateHistory 模块）
// Resize 分隔条（已迁移到 SandboxResize 模块）

// 状态栏（已迁移到 SandboxStatusBar 模块）
// 面包屑（已迁移到 SandboxBreadcrumb 模块）
// 图片预览（已迁移到 SandboxImagePreview 模块）
// Markdown 预览（已迁移到 SandboxMarkdownPreview 模块）
// 分屏编辑（已迁移到 SandboxSplitEditor 模块）

// ════════════════════════════════════════════════════════════
//  初始化窗口管理器
// ════════════════════════════════════════════════════════════
function initHtmlSandboxWindow() {
  if (!_modal || !_content) return;
  if (_windowInstance) return;  // 已初始化

  _windowInstance = WindowManager.create({
    id: 'html-sandbox',
    title: '💻 代码编辑器',
    container: _modal,
    content: _content,
    header: _modal.querySelector('.rich-modal-header'),
    icon: '💻',
    initialState: WindowState.MAXIMIZED,
    defaultWidth: '75vw',
    defaultHeight: '80vh',
    resizable: true,
    onClose: () => {
      // 关闭前：取消挂起的自动保存定时器，并立即执行最后一次保存
      // 注意：无论 _autoSaveTimer 是否存在，都要保存，因为定时器可能已经执行完毕
      if (_autoSaveTimer) {
        clearTimeout(_autoSaveTimer);
        _autoSaveTimer = null;
      }
      // 始终执行最后一次保存（不仅限于有挂起定时器时）
      if (_currentNodeId && _monacoEditor && _vfs) {
        _monacoEditor.syncAllToFS(_vfs);
        if (_splitEditorModule && _splitEditorModule.monacoEditor2) _splitEditorModule.monacoEditor2.syncAllToFS(_vfs);
        const node = appState.nodeMap.get(_currentNodeId);
        if (node) {
          node.fileSystem = _vfs.toJSON();
          // 异步触发磁盘全量同步（不阻塞关闭）
          _vfs.syncAllToDisk(_getProjectFolderPath(), _currentNodeId);
        }
      }
      // 退出全屏预览
      if (_previewFullscreen) _togglePreviewFullscreen();
      // 注意：不再单独调用 _pausePreview()，由 _destroyIDEComponents 内的 _previewModule.destroy() 处理
      // 这样确保 iframe 清理只发生一次，避免重复操作
      _currentNodeId = null;
      _ctx.currentNodeId = null;  // 同步清理上下文，避免模块读到过期节点
      _lastAutoSavePath = null;
      if (_nodeName) _nodeName.textContent = '';
      window._pause3DAnimation = false;
      // 销毁 IDE 组件（内部会调用 _previewModule.destroy() → pausePreview() 清理 iframe）
      _destroyIDEComponents();
    },
    onStateChange: (newState, prevState) => {
      _updateMaxIcon(newState);
      window._pause3DAnimation = (newState === WindowState.MAXIMIZED);

      if (newState === WindowState.MINIMIZED) {
        _pausePreview();
      } else if (prevState === WindowState.MINIMIZED && newState !== WindowState.MINIMIZED) {
        _resumePreview();
        if (_monacoEditor) setTimeout(() => _monacoEditor.layout(), 50);
      }

      if (window.Taskbar) {
        window.Taskbar.setEditorActive('html-sandbox', newState !== WindowState.MINIMIZED);
      }
    }
  });

  // ── 绑定按钮事件 ──
  const minBtn = document.getElementById('sandboxMinimizeBtn');
  const maxBtn = document.getElementById('sandboxMaximizeBtn');
  const closeBtn = document.getElementById('sandboxCloseBtn');
  const refreshPreviewBtn = document.getElementById('sandboxRefreshPreviewBtn');
  const mdSyncBtn = document.getElementById('mdPreviewSyncBtn');

  if (minBtn) minBtn.addEventListener('click', () => {
    if (Date.now() - _openTimestamp < 300) return;
    _windowInstance.minimize();
  });
  if (maxBtn) maxBtn.addEventListener('click', () => _windowInstance.toggleMaximize());
  if (closeBtn) closeBtn.addEventListener('click', () => closeHtmlSandboxEditor());
  if (refreshPreviewBtn) refreshPreviewBtn.addEventListener('click', () => runPreview(true));
  if (mdSyncBtn) mdSyncBtn.addEventListener('click', () => _renderMarkdownPreview());

  // 控制台过滤按钮
  document.querySelectorAll('.console-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => _setConsoleFilter(btn.dataset.filter));
  });

  // 预览模式按钮
  const previewFullscreenBtn = document.getElementById('previewFullscreenBtn');
  if (previewFullscreenBtn) previewFullscreenBtn.addEventListener('click', () => _togglePreviewFullscreen());

  // ESC 退出全屏预览（已迁移到 SandboxPreview 模块，此处不再重复注册）

  // 历史面板关闭（委托到 SandboxTemplateHistory 模块）
  const historyCloseBtn = document.getElementById('historyCloseBtn');
  const historyRestoreBtn = document.getElementById('historyRestoreBtn');
  if (historyCloseBtn) historyCloseBtn.addEventListener('click', () => _hideHistoryPanel());
  if (historyRestoreBtn) historyRestoreBtn.addEventListener('click', () => _restoreHistoryVersion());

  // 点击模态框自动置顶（统一由 WindowManager 管理）
  if (window.WindowManager) {
    window.WindowManager.registerElement(_modal);
  }

  // ── Activity Bar 按钮 ──
  document.querySelectorAll('.sandbox-activity-bar .activity-bar-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const panel = btn.dataset.panel;
      if (panel === 'preview') {
        _activatePreviewTab();
      } else {
        _toggleSidePanel(panel);
      }
    });
  });

  // ── 底部面板 Tab 切换 ──
  document.querySelectorAll('.bottom-panel-tab').forEach(tab => {
    tab.addEventListener('click', () => _showBottomPanel(tab.dataset.tab));
  });

  // ── 快捷键事件（由 Monaco 派发） ──
  document.addEventListener('sandbox-save', () => saveHtmlSource());
  document.addEventListener('sandbox-run', () => runPreview(true));
  document.addEventListener('sandbox-close-tab', () => {
    if (_monacoEditor && _fileTabs) {
      const path = _monacoEditor.getCurrentFilePath();
      if (path) _onTabClose(path);
    }
  });
  document.addEventListener('sandbox-toggle-console', () => _toggleBottomPanel());
  document.addEventListener('sandbox-new-terminal', () => _newTerminal());
  document.addEventListener('sandbox-global-search', () => _toggleSearch());
  document.addEventListener('sandbox-quick-open', () => _showQuickOpen());
  document.addEventListener('sandbox-command-palette', () => _showCommandPalette());

  // ── 兼容过渡期：监听模块事件 ──
  _ctx.on('activatePreviewTab', () => _activatePreviewTab());
  _ctx.on('syncSplitEditor', (vfs) => {
    if (_splitEditorModule && _splitEditorModule.monacoEditor2) _splitEditorModule.monacoEditor2.syncAllToFS(vfs);
  });
  _ctx.on('executeMenuAction', (action) => _executeCommandAction(action));
  _ctx.on('executeCommand', (action) => _executeCommandAction(action));
  _ctx.on('closeImagePreview', () => _closeImagePreview());
  _ctx.on('exitMarkdownMode', () => _exitMarkdownMode());
  _ctx.on('openFileInEditor', (filePath) => _openFileInEditor(filePath));
  _ctx.on('runPreview', () => runPreview(true));
  _ctx.on('updateStatusBar', () => _updateStatusBar());
  _ctx.on('updateBreadcrumb', (data) => {
    if (_breadcrumbModule) {
      if (data && data.barEl) {
        _breadcrumbModule.updateBreadcrumbIn(data.barEl, data.filePath);
      } else {
        _breadcrumbModule.updateBreadcrumb(data);
      }
    }
  });
  _ctx.on('contentChange', (filePath) => _onContentChange(filePath));
  _ctx.on('copyPath', (filePath) => _onCopyPath(filePath));
  _ctx.on('revealInTree', (filePath) => _onRevealInTree(filePath));
  _ctx.on('toggleSidePanel', (panel) => {
    // 模块侧边面板状态变更通知 → 同步 ctx 状态
    const sidePanel = document.getElementById('sandboxSidePanel');
    const searchPanel = document.getElementById('sandboxSearchPanel');
    const fileTreePanel = document.getElementById('sandboxFileTreeContainer');
    const githubPanel = document.getElementById('sandboxGithubPanel');
    if (panel) {
      _ctx.activePanel = panel;
      if (sidePanel) sidePanel.classList.remove('collapsed');
      // 根据面板类型切换显示搜索面板/文件树/GitHub 导入
      if (panel === 'search') {
        if (searchPanel) searchPanel.style.display = 'flex';
        if (fileTreePanel) fileTreePanel.style.display = 'none';
        if (githubPanel) githubPanel.style.display = 'none';
        // 聚焦搜索输入框
        const searchInput = document.getElementById('sandboxSearchInput');
        if (searchInput) searchInput.focus();
      } else if (panel === 'explorer') {
        if (searchPanel) searchPanel.style.display = 'none';
        if (fileTreePanel) fileTreePanel.style.display = 'flex';
        if (githubPanel) githubPanel.style.display = 'none';
      } else if (panel === 'github') {
        if (searchPanel) searchPanel.style.display = 'none';
        if (fileTreePanel) fileTreePanel.style.display = 'none';
        if (githubPanel) githubPanel.style.display = 'flex';
        // 聚焦 URL 输入框
        const urlInput = document.getElementById('githubUrlInput');
        if (urlInput) urlInput.focus();
      }
    } else {
      _ctx.activePanel = null;
      if (sidePanel) sidePanel.classList.add('collapsed');
    }
  });
  // SandboxTemplateHistory 模块事件
  _ctx.on('fileSystemChange', () => _onFileSystemChange());
  _ctx.on('autoRunPreview', () => { if (_autoRunEnabled) runPreview(false); });
  _ctx.on('statusChange', (text) => _setStatus(text));
  // SandboxFileOps 模块事件
  _ctx.on('deactivatePreviewTab', () => _deactivatePreviewTab());
  _ctx.on('closePreviewTab', () => _closePreviewTab());
  _ctx.on('updateActivityBarButtons', (panel) => _updateActivityBarButtons(panel));

  // 拖拽打开文件
  _initDragOpen();

  // Resize 分隔条（已迁移到 SandboxResize 模块，由 _initIDEComponents 初始化）
}

// ════════════════════════════════════════════════════════════
//  功能模块初始化（每次打开 IDE 时调用）
//
//  这些模块在 _destroyIDEComponents() 中会被销毁并置 null，
//  而 initHtmlSandboxWindow() 受 _windowInstance 守卫只执行一次，
//  因此必须在每次 openHtmlSandboxEditor() 时重新初始化，
//  否则关闭后再次打开时菜单栏/预览/控制台/命令面板等将失效
//  （_activatePreviewTab / _toggleSidePanel 等委托函数因
//   if (_activityBarModule) 守卫而静默无效）。
// ════════════════════════════════════════════════════════════
function _initFeatureModules() {
  // 菜单栏（_initMenuBar 内部已含 if (!_menuBarModule) 守卫）
  _initMenuBar();
  // 命令面板
  _initCommandPalette();
  // 控制台消息监听
  _initConsoleListener();
  // AutoRun 模块
  if (!_autoRunModule) {
    _autoRunModule = new SandboxAutoRun(_ctx);
    _ctx.registerModule('autoRun', _autoRunModule);
  }
  _autoRunModule.init();
  // Preview 模块
  if (!_previewModule) {
    _previewModule = new SandboxPreview(_ctx);
    _ctx.registerModule('preview', _previewModule);
  }
  _previewModule.init();
  // ActivityBar 模块
  if (!_activityBarModule) {
    _activityBarModule = new SandboxActivityBar(_ctx);
    _ctx.registerModule('activityBar', _activityBarModule);
  }
  _activityBarModule.init();
  // GitHub 导入模块
  if (!_githubImportModule) {
    _githubImportModule = new SandboxGithubImport(_ctx);
    _ctx.registerModule('githubImport', _githubImportModule);
  }
  _githubImportModule.init();
}

function _initDragOpen() {
  const editorArea = document.querySelector('.sandbox-editor-area');
  if (!editorArea) return;

  editorArea.addEventListener('dragover', (e) => {
    if (e.dataTransfer.types.includes('text/plain')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'open';
      editorArea.classList.add('drag-over');
    }
  });

  editorArea.addEventListener('dragleave', (e) => {
    if (!editorArea.contains(e.relatedTarget)) {
      editorArea.classList.remove('drag-over');
    }
  });

  editorArea.addEventListener('drop', (e) => {
    e.preventDefault();
    editorArea.classList.remove('drag-over');
    const filePath = e.dataTransfer.getData('text/plain');
    if (filePath && _vfs && _vfs.getFile(filePath)) {
      _openFileInEditor(filePath);
    }
  });
}

function _updateMaxIcon(state) {
  const svg = document.getElementById('sandboxMaxIcon');
  const btn = document.getElementById('sandboxMaximizeBtn');
  if (state === WindowState.MAXIMIZED) {
    if (svg) svg.innerHTML = '<rect x="3" y="0" width="5" height="5" rx="0"/><rect x="0" y="4" width="5" height="5" rx="0"/>';
    if (btn) btn.title = '窗口化';
  } else {
    if (svg) svg.innerHTML = '<rect x="2" y="2" width="6" height="6" rx="0"/>';
    if (btn) btn.title = '最大化';
  }
}

// ════════════════════════════════════════════════════════════
//  菜单栏 (已迁移到 SandboxMenuBar，此处保留委托)
// ════════════════════════════════════════════════════════════

function _initMenuBar() {
  if (!_menuBarModule) {
    _menuBarModule = new SandboxMenuBar(_ctx);
    _ctx.registerModule('menuBar', _menuBarModule);
  }
  _menuBarModule.init();
}

function _closeAllMenus() {
  if (_menuBarModule) _menuBarModule._closeAllMenus();
}

function _executeMenuAction(action) {
  if (_menuBarModule) {
    _menuBarModule._executeMenuAction(action);
  }
}

function _monacoEditorAction(actionId) {
  if (_menuBarModule) {
    _menuBarModule._monacoEditorAction(actionId);
  }
}

function _showShortcutsHelp() {
  if (_menuBarModule) _menuBarModule._showShortcutsHelp();
}

function _showAboutDialog() {
  if (_menuBarModule) _menuBarModule._showAboutDialog();
}

// ════════════════════════════════════════════════════════════
//  Activity Bar 和侧边面板管理（已迁移到 SandboxActivityBar，此处保留委托）
// ════════════════════════════════════════════════════════════

function _toggleSidePanel(panel) {
  if (_activityBarModule) {
    _activityBarModule.toggleSidePanel(panel);
    // 同步 ctx 状态（模块 emit toggleSidePanel 事件也会处理 DOM）
    _ctx.activePanel = _activityBarModule._activePanel;
  }
}

function _updateActivityBarButtons(activePanel) {
  if (_activityBarModule) _activityBarModule.updateActivityBarButtons(activePanel);
}

function _activatePreviewTab() {
  if (_activityBarModule) {
    _activityBarModule.activatePreviewTab();
    _ctx.isPreviewTab = true; // 同步 ctx 状态
  }
}

function _deactivatePreviewTab() {
  if (_activityBarModule) {
    _activityBarModule.deactivatePreviewTab();
    _ctx.isPreviewTab = false; // 同步 ctx 状态
  }
}

function _closePreviewTab() {
  if (_activityBarModule) {
    _activityBarModule.closePreviewTab();
    _ctx.isPreviewTab = false; // 同步 ctx 状态
  }
}

function _renderPreviewTab() {
  if (_activityBarModule) _activityBarModule.renderPreviewTab();
}

function _showPreviewTabContextMenu(x, y) {
  if (_activityBarModule) _activityBarModule.showPreviewTabContextMenu(x, y);
}

// ════════════════════════════════════════════════════════════
//  控制台消息监听（已迁移到 SandboxConsole，此处保留委托）
// ════════════════════════════════════════════════════════════
function _initConsoleListener() {
  if (!_consoleModule) {
    _consoleModule = new SandboxConsole(_ctx);
    _ctx.registerModule('console', _consoleModule);
  }
  _consoleModule.init();
}

function _addConsoleLine(level, args) {
  if (_consoleModule) _consoleModule.addConsoleLine(level, args);
}

function _renderConsoleArg(arg) {
  return _consoleModule ? _consoleModule._renderArg(arg) : document.createTextNode(String(arg));
}

function _renderExpandable(arg) {
  return _consoleModule ? _consoleModule._renderExpandable(arg) : document.createTextNode('');
}

function _setConsoleFilter(filter) {
  if (_consoleModule) _consoleModule.setConsoleFilter(filter);
}

function _updateConsoleCounts() {
  if (_consoleModule) _consoleModule._updateCounts();
}

function _clearConsole() {
  if (_consoleModule) _consoleModule.clearConsole();
}

// ── 底部面板管理（已迁移到 SandboxConsole，此处保留委托）──
function _showBottomPanel(tab) {
  if (_consoleModule) _consoleModule.showBottomPanel(tab);
}

function _hideBottomPanel() {
  if (_consoleModule) _consoleModule.hideBottomPanel();
}

function _toggleBottomPanel(tab) {
  if (_consoleModule) _consoleModule.toggleBottomPanel(tab);
}

function _toggleConsole() {
  if (_consoleModule) _consoleModule.toggleConsole();
}

function _toggleTerminal() {
  if (_consoleModule) _consoleModule.toggleTerminal();
}

function _newTerminal() {
  if (_consoleModule) _consoleModule.newTerminal();
}

function _killAllTerminals() {
  if (_consoleModule) _consoleModule.killAllTerminals();
}

// ════════════════════════════════════════════════════════════
//  自动运行（已迁移到 SandboxAutoRun，此处保留委托）
// ════════════════════════════════════════════════════════════
function _toggleAutoRun() {
  if (_autoRunModule) _autoRunModule.toggleAutoRun();
}

function _onContentChange(filePath) {
  if (_autoRunModule) _autoRunModule.onContentChange(filePath);
}

// ════════════════════════════════════════════════════════════
//  自动保存到磁盘（已迁移到 SandboxAutoRun，此处保留委托）
// ════════════════════════════════════════════════════════════

function _triggerAutoSave(filePath) {
  if (_autoRunModule) _autoRunModule.triggerAutoSave(filePath);
}

async function _autoSaveCurrentFile() {
  if (_autoRunModule) await _autoRunModule._autoSaveCurrentFile();
}

// ════════════════════════════════════════════════════════════
//  全屏预览（已迁移到 SandboxPreview，此处保留委托）
// ════════════════════════════════════════════════════════════
function _togglePreviewFullscreen() {
  if (_previewModule) _previewModule.togglePreviewFullscreen();
}

// ════════════════════════════════════════════════════════════
//  全局搜索
// ════════════════════════════════════════════════════════════
function _toggleSearch() {
  _toggleSidePanel('search');
}

function _showQuickOpen() {
  // 简单实现：聚焦文件搜索
  if (_search) {
    _search.show();
    const input = document.getElementById('sandboxSearchInput');
    if (input) input.focus();
  }
}

// ════════════════════════════════════════════════════════════
//  本地历史记录（已迁移到 SandboxTemplateHistory，此处保留委托）
// ════════════════════════════════════════════════════════════

function _showHistoryPanel() {
  if (_templateHistoryModule) _templateHistoryModule.showHistoryPanel();
}

function _hideHistoryPanel() {
  if (_templateHistoryModule) _templateHistoryModule.hideHistoryPanel();
}

function _restoreHistoryVersion() {
  if (_templateHistoryModule) _templateHistoryModule.restoreHistoryVersion();
}

// Resize 分隔条（已迁移到 SandboxResize 模块，初始化由 _initIDEComponents 处理）

// ════════════════════════════════════════════════════════════
//  IDE 组件初始化/销毁
// ════════════════════════════════════════════════════════════

async function _initIDEComponents(node) {
  // 1. 创建虚拟文件系统
  let treeData = null;
  if (node.fileSystem) {
    treeData = node.fileSystem;
  } else if (node.htmlSource) {
    treeData = migrateHtmlSource(node.htmlSource);
    node.fileSystem = treeData;
    node.activeMode = 'code';
  } else {
    treeData = migrateHtmlSource(null);
    node.fileSystem = treeData;
    node.activeMode = 'code';
  }

  _vfs = new VirtualFileSystem(treeData);
  _vfs.expandAll();
  _ctx.vfs = _vfs;

  // 2. 初始化历史记录
  _history = new SandboxHistory();
  _history.attachToNode(_currentNodeId);
  _history.loadFromNode(node);
  _ctx.history = _history;

  // 3. 初始化文件树
  const treeContainer = document.getElementById('sandboxFileTreeContainer');
  if (treeContainer) {
    _fileTree = new FileTreeComponent(treeContainer, _vfs, {
      onFileSelect: (filePath) => _onFileSelect(filePath),
      onFileDelete: (path, isDir) => _onFileDelete(path, isDir),
      onFileRename: (path, newName) => _onFileRename(path, newName),
      onFileCreate: (dirPath, name, type) => _onFileCreate(dirPath, name, type),
      onFileSystemChange: () => _onFileSystemChange(),
      onOpenFileLocation: (filePath) => _onOpenFileLocation(filePath),
    });
    _fileTree.render();
  }
  _ctx.fileTree = _fileTree;

  // 4. 初始化标签页
  const tabsContainer = document.getElementById('sandboxTabsContainer');
  if (tabsContainer) {
    _fileTabs = new FileTabsComponent(tabsContainer,
      (filePath) => _onFileSelect(filePath),
      (filePath) => _onTabClose(filePath),
      {
        onCloseOthers: (keepPath) => _onCloseOthers(keepPath),
        onCloseAll: () => _onCloseAll(),
        onCloseSaved: () => _onCloseSaved(),
        onCopyPath: (filePath) => _onCopyPath(filePath),
        onRevealInTree: (filePath) => _onRevealInTree(filePath),
        onClosePreviewTab: () => _closePreviewTab(),
        onSplitRight: (filePath) => _onSplitRight(filePath)
      }
    );
  }
  _ctx.fileTabs = _fileTabs;

  // 5. 初始化 Monaco 编辑器（传入内容变更回调用于自动运行）
  const monacoContainer = document.getElementById('sandboxMonacoContainer');
  if (monacoContainer) {
    _monacoEditor = new SandboxMonacoEditor(
      (filePath, isDirty) => {
        if (_fileTabs) {
          if (isDirty) _fileTabs.markDirty(filePath);
          else _fileTabs.markClean(filePath);
        }
      },
      (filePath) => _onContentChange(filePath)
    );
    await _monacoEditor.init(monacoContainer);
    _ctx.monacoEditor = _monacoEditor;

    // 初始化状态栏模块
    if (!_statusBarModule) {
      _statusBarModule = new SandboxStatusBar(_ctx);
      _ctx.registerModule('statusBar', _statusBarModule);
    }
    _statusBarModule.init();

    // 初始化设置模块
    if (!_settingsModule) {
      _settingsModule = new SandboxSettings(_ctx);
      _ctx.registerModule('settings', _settingsModule);
    }
    _settingsModule.init();
    _settingsModule.applyPersistedSettings();

    // 初始化面包屑模块
    if (!_breadcrumbModule) {
      _breadcrumbModule = new SandboxBreadcrumb(_ctx);
      _ctx.registerModule('breadcrumb', _breadcrumbModule);
    }
    _breadcrumbModule.init();

    // 初始化图片预览模块
    if (!_imagePreviewModule) {
      _imagePreviewModule = new SandboxImagePreview(_ctx);
      _ctx.registerModule('imagePreview', _imagePreviewModule);
    }
    _imagePreviewModule.init();

    // 初始化 Markdown 预览模块
    if (!_markdownModule) {
      _markdownModule = new SandboxMarkdownPreview(_ctx);
      _ctx.registerModule('markdown', _markdownModule);
    }
    _markdownModule.init();

    // 初始化分屏编辑模块
    if (!_splitEditorModule) {
      _splitEditorModule = new SandboxSplitEditor(_ctx);
      _ctx.registerModule('splitEditor', _splitEditorModule);
    }
    _splitEditorModule.init();

    // 初始化模板/历史面板模块
    if (!_templateHistoryModule) {
      _templateHistoryModule = new SandboxTemplateHistory(_ctx);
      _ctx.registerModule('templateHistory', _templateHistoryModule);
    }
    _templateHistoryModule.init();

    // 初始化 Resize 模块
    if (!_resizeModule) {
      _resizeModule = new SandboxResize(_ctx);
      _ctx.registerModule('resize', _resizeModule);
    }
    _resizeModule.init();

    // 初始化文件操作模块
    if (!_fileOpsModule) {
      _fileOpsModule = new SandboxFileOps(_ctx);
      _ctx.registerModule('fileOps', _fileOpsModule);
    }
    _fileOpsModule.init();
  }

  // 6. 初始化搜索组件
  const searchPanel = document.getElementById('sandboxSearchPanel');
  if (searchPanel) {
    _search = new SandboxSearch(
      searchPanel,
      () => _vfs,
      (filePath, line, col) => {
        // 打开文件并跳转
        const file = _vfs.getFile(filePath);
        if (file) {
          _openFileInEditor(filePath);
          if (_monacoEditor) _monacoEditor.revealLine(filePath, line, col);
        }
        // 关闭搜索面板
        _search.hide();
      }
    );
    _ctx.search = _search;

    // 重写 hide()：关闭搜索面板后自动切回资源管理器，避免侧边面板空白
    const _originalSearchHide = _search.hide.bind(_search);
    _search.hide = function () {
      _originalSearchHide();
      const fileTreePanel = document.getElementById('sandboxFileTreeContainer');
      if (fileTreePanel) fileTreePanel.style.display = 'flex';
      if (_activityBarModule) {
        _activityBarModule._activePanel = 'explorer';
        _activityBarModule.updateActivityBarButtons('explorer');
      }
      _ctx.activePanel = 'explorer';
    };
  }

  // 7. 初始化终端组件
  const terminalPanel = document.getElementById('sandboxTerminalPanel');
  if (terminalPanel) {
    _terminal = new SandboxTerminal(
      terminalPanel,
      // getCwd 回调：通过 IPC 获取 sandbox 磁盘路径（兼容未保存项目）
      async () => {
        const projectFolderPath = _getProjectFolderPath();
        const result = await window.api.terminalGetSandboxCwd(projectFolderPath, _currentNodeId);
        return result.success ? result.cwd : null;
      },
      (statusText) => _setStatus(statusText)
    );
    _ctx.terminal = _terminal;
  }

  // 8. 打开入口文件
  const entryPath = _vfs.getEntryPoint();
  if (entryPath) {
    _openFileInEditor(entryPath);
  }

  _setStatus('就绪');
}

function _destroyIDEComponents() {
  // 关闭分屏（已迁移到 SandboxSplitEditor 模块）
  if (_splitEditorModule) _splitEditorModule.closeSplitEditor();

  if (_monacoEditor) {
    _monacoEditor.dispose();
    _monacoEditor = null;
  }
  if (_fileTree) {
    _fileTree.destroy();
    _fileTree = null;
  }
  if (_fileTabs) {
    _fileTabs.closeAll();
    _fileTabs.destroy();
    _fileTabs = null;
  }
  if (_search) {
    _search = null;
  }
  // 销毁终端组件（关键：kill 所有 pty 进程，避免僵尸进程）
  if (_terminal) {
    _terminal.destroy();
    _terminal = null;
  }
  // 重置底部面板状态（_bottomPanelTab 已迁移到 SandboxConsole）
  const bottomTabs = document.getElementById('sandboxBottomPanelTabs');
  if (bottomTabs) bottomTabs.style.display = 'none';
  const termPanel = document.getElementById('sandboxTerminalPanel');
  if (termPanel) termPanel.style.display = 'none';
  _vfs = null;
  _history = null;
  // 同步清除 ctx 核心引用
  _ctx.vfs = null;
  _ctx.fileTree = null;
  _ctx.fileTabs = null;
  _ctx.monacoEditor = null;
  _ctx.search = null;
  _ctx.history = null;
  _ctx.terminal = null;
  // 预览状态已迁移到 SandboxPreview 模块
  // 控制台状态已迁移到 SandboxConsole 模块
  if (_consoleModule) { _consoleModule.destroy(); _consoleModule = null; }
  if (_autoRunModule) { _autoRunModule.destroy(); _autoRunModule = null; }
  if (_previewModule) { _previewModule.destroy(); _previewModule = null; }
  if (_menuBarModule) { _menuBarModule.destroy(); _menuBarModule = null; }
  if (_activityBarModule) { _activityBarModule.destroy(); _activityBarModule = null; }
  if (_statusBarModule) { _statusBarModule.destroy(); _statusBarModule = null; }
  if (_settingsModule) { _settingsModule.destroy(); _settingsModule = null; }
  if (_breadcrumbModule) { _breadcrumbModule.destroy(); _breadcrumbModule = null; }
  if (_imagePreviewModule) { _imagePreviewModule.destroy(); _imagePreviewModule = null; }
  if (_markdownModule) { _markdownModule.destroy(); _markdownModule = null; }
  if (_splitEditorModule) { _splitEditorModule.destroy(); _splitEditorModule = null; }
  if (_templateHistoryModule) { _templateHistoryModule.destroy(); _templateHistoryModule = null; }
  if (_resizeModule) { _resizeModule.destroy(); _resizeModule = null; }
  if (_fileOpsModule) { _fileOpsModule.destroy(); _fileOpsModule = null; }
  if (_githubImportModule) { _githubImportModule.destroy(); _githubImportModule = null; }
  // 兼容旧变量引用
  _lastPreviewFiles.clear();
  _lastPreviewHtml = '';
  _isRunningPreview = false;
  _previewFullscreen = false;

  // 重置状态栏
  // 状态栏已迁移到 SandboxStatusBar 模块

  // 重置图片预览（已迁移到 SandboxImagePreview 模块）
  if (_imagePreviewModule) _imagePreviewModule.closeImagePreview();

  // 退出 Markdown 模式（已迁移到 SandboxMarkdownPreview 模块）
  if (_markdownModule) _markdownModule.exitMarkdownMode();

  // 清理面包屑下拉（已迁移到 SandboxBreadcrumb 模块）

  // 重置预览标签状态
  _ctx.isPreviewTab = false;
  _ctx.activePanel = 'explorer';

  // 移除预览标签 DOM
  const previewTab = document.querySelector('.sandbox-tab[data-preview-tab]');
  if (previewTab) previewTab.remove();

  // 移除预览右键菜单
  const previewCtxMenu = document.getElementById('sandboxPreviewCtxMenu');
  if (previewCtxMenu) previewCtxMenu.remove();

  // 重置容器可见性
  const monacoContainer = document.getElementById('sandboxMonacoContainer');
  const previewContainer = document.getElementById('sandboxPreviewContainer');
  const breadcrumb = document.getElementById('sandboxBreadcrumbBar');
  if (monacoContainer) monacoContainer.style.display = '';
  if (previewContainer) previewContainer.style.display = 'none';
  if (breadcrumb) {
    breadcrumb.style.display = '';
    breadcrumb.innerHTML = '';
  }

  // 重置侧边面板
  const sidePanel = document.getElementById('sandboxSidePanel');
  if (sidePanel) sidePanel.classList.remove('collapsed');
  const searchPanel = document.getElementById('sandboxSearchPanel');
  const fileTreeContainer = document.getElementById('sandboxFileTreeContainer');
  if (searchPanel) searchPanel.style.display = 'none';
  if (fileTreeContainer) fileTreeContainer.style.display = 'flex';
  _updateActivityBarButtons('explorer');
}

// ════════════════════════════════════════════════════════════
//  文件操作回调（已迁移到 SandboxFileOps，此处保留委托）
// ════════════════════════════════════════════════════════════

async function _openFileInEditor(filePath) {
  // 真实文件系统模式：从磁盘读取文件内容
  if (_isRealFS && _workspacePath && window.api?.ideReadFile) {
    const result = await _realReadFile(filePath);
    if (result && result.type === 'text') {
      _vfs.setFile(filePath, result.content);
    } else if (result && result.type === 'image' && result.dataUrl) {
      _vfs.setFile(filePath, result.dataUrl);
    }
  }
  if (_fileOpsModule) _fileOpsModule.openFileInEditor(filePath);
  _hideWelcomePage();
}

async function _onFileSelect(filePath) {
  // 真实文件系统模式：从磁盘读取文件内容
  if (_isRealFS && _workspacePath && window.api?.ideReadFile) {
    const result = await _realReadFile(filePath);
    if (result && result.type === 'text') {
      _vfs.setFile(filePath, result.content);
    } else if (result && result.type === 'image' && result.dataUrl) {
      _vfs.setFile(filePath, result.dataUrl);
    }
  }
  if (_fileOpsModule) _fileOpsModule.onFileSelect(filePath);
}

function _onTabClose(filePath) {
  if (_fileOpsModule) _fileOpsModule.onTabClose(filePath);
}

function _onCloseOthers(keepPath) {
  if (_fileOpsModule) _fileOpsModule.onCloseOthers(keepPath);
}

function _onCloseAll() {
  if (_fileOpsModule) _fileOpsModule.onCloseAll();
}

function _onCloseSaved() {
  if (_fileOpsModule) _fileOpsModule.onCloseSaved();
}

function _onOpenFileLocation(filePath) {
  // 真实文件系统模式：使用 shell.showItemInFolder 打开文件所在位置
  if (_isRealFS && _workspacePath) {
    // 构建完整路径：_workspacePath + filePath
    // filePath 格式为 "dir/file.ext" 或 "file.ext"（VFS 使用 / 分隔符）
    // 需要将 VFS 路径的分隔符转换为系统原生分隔符
    const sep = _workspacePath.endsWith('/') || _workspacePath.endsWith('\\') ? '' : '\\';
    // 将 VFS 的 / 替换为 Windows 的 \
    const normalizedPath = filePath.replace(/\//g, '\\');
    const fullPath = _workspacePath + sep + normalizedPath;
    console.log('[IDE] 打开文件所在位置:', fullPath);
    if (window.api?.showFileInFolder) {
      window.api.showFileInFolder(fullPath);
    } else {
      if (window.showToast) window.showToast('无法打开文件位置（API 不可用）');
    }
  } else {
    if (window.showToast) window.showToast('虚拟文件系统不支持打开文件位置');
  }
}

function _onCopyPath(filePath) {
  if (_fileOpsModule) _fileOpsModule.onCopyPath(filePath);
}

function _onRevealInTree(filePath) {
  if (_fileOpsModule) _fileOpsModule.onRevealInTree(filePath);
}

function _onFileDelete(path, isDirectory) {
  if (_fileOpsModule) _fileOpsModule.onFileDelete(path, isDirectory);
}

function _onFileRename(path, newName) {
  if (_fileOpsModule) _fileOpsModule.onFileRename(path, newName);
}

function _onFileCreate(dirPath, name, type) {
  if (_fileOpsModule) _fileOpsModule.onFileCreate(dirPath, name, type);
}

function _onFileSystemChange() {
  if (_fileOpsModule) _fileOpsModule.onFileSystemChange();
}

function _setStatus(text) {
  if (_statusText) _statusText.textContent = text;
}

function _getProjectFolderPath() {
  const proj = appState.projects?.find(p => p.id === appState.currentProjectId);
  return proj?.folderPath || null;
}

// ════════════════════════════════════════════════════════════
//  打开/关闭编辑器
// ════════════════════════════════════════════════════════════

export async function openHtmlSandboxEditor(nodeId) {
  const node = appState.nodeMap.get(nodeId);
  if (!node) {
    console.error('[openHtmlSandboxEditor] 节点不存在:', nodeId);
    return;
  }

  // 优先通过新 IDE 内置应用打开
  if (window.AppRunner && window.api?.ideGetNodeSandboxPath) {
    try {
      const projectFolderPath = _getProjectFolderPath();
      const result = await window.api.ideGetNodeSandboxPath(node, projectFolderPath);
      if (!result || !result.success) {
        console.error('[openHtmlSandboxEditor] 获取 sandbox 路径失败:', result);
        return;
      }
      window.AppRunner.open({
        id: `ide-node-${nodeId}`,
        name: node.name || '代码编辑器',
        icon: '💻',
        type: 'ide',
        sandboxPath: result.sandboxPath,
        nodeId: nodeId,
      });
      return;
    } catch (e) {
      console.error('[openHtmlSandboxEditor] 新 IDE 启动失败，回退旧 IDE:', e);
    }
  }

  // 回退到旧 IDE
  initHtmlSandboxWindow();
  // 每次打开都重新初始化功能模块（关闭时已被 _destroyIDEComponents 销毁）
  _initFeatureModules();

  _currentNodeId = nodeId;
  _ctx.currentNodeId = nodeId;  // 同步到上下文，供 file-ops/auto-run 等模块读取
  _openTimestamp = Date.now();

  if (_nodeName) _nodeName.textContent = node ? node.name : '';

  // 清空控制台
  _clearConsole();

  // 添加到任务栏
  if (window.Taskbar) {
    window.Taskbar.addOrUpdateEditor('html-sandbox', {
      label: node ? node.name : '代码编辑器',
      icon: '💻',
      active: true,
      activate: () => {
        if (!_windowInstance) return;
        // 设置模态框标准：可见时最小化，最小化时恢复
        if (_windowInstance.getState() === WindowState.MINIMIZED) {
          _windowInstance.restore();
          WindowManager.bringToFront(_windowInstance);
        } else {
          _windowInstance.minimize();
        }
      },
      close: () => closeHtmlSandboxEditor()
    });
  }

  // 打开窗口
  _windowInstance.open(WindowState.MAXIMIZED);

  // 初始化 IDE 组件
  await _initIDEComponents(node);

  // 重置面板状态
  _ctx.activePanel = 'explorer';
  _ctx.isPreviewTab = false;
  _updateActivityBarButtons('explorer');
}

export function closeHtmlSandboxEditor() {
  if (!_windowInstance) return;
  _destroyIDEComponents();
  _windowInstance.close();
  _currentNodeId = null;
  _ctx.currentNodeId = null;
  if (_nodeName) _nodeName.textContent = '';
  if (window.Taskbar) window.Taskbar.removeEditor('html-sandbox');
}

// ════════════════════════════════════════════════════════════
//  性能优化：暂停/恢复预览 iframe（已迁移到 SandboxPreview）
// ════════════════════════════════════════════════════════════

function _pausePreview() {
  if (_previewModule) _previewModule.pausePreview();
}

function _resumePreview() {
  if (_previewModule) _previewModule.resumePreview();
}

// ════════════════════════════════════════════════════════════
//  代码运行与保存（预览部分已迁移到 SandboxPreview，此处保留委托）
// ════════════════════════════════════════════════════════════

async function runPreview(forceFullReload = true) {
  if (_previewModule) await _previewModule.runPreview(forceFullReload);
}

function _injectConsoleRedirect(html) {
  return _previewModule ? _previewModule._injectConsoleRedirect(html) : html;
}

function _consoleRedirectCode() {
  return _previewModule ? _previewModule._consoleRedirectCode() : '';
}

function _hotUpdateListenerCode() {
  return _previewModule ? _previewModule._hotUpdateListenerCode() : '';
}

function saveHtmlSource() {
  if (_fileOpsModule) _fileOpsModule.saveHtmlSource();
}

function syncToNote() {
  if (_fileOpsModule) _fileOpsModule.syncToNote();
}

function exportAsHtml() {
  if (_fileOpsModule) _fileOpsModule.exportAsHtml();
}

// ════════════════════════════════════════════════════════════
//  辅助函数（_escapeHtml 已迁移到各模块内部）
// ════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════
//  双击节点显示沙盒内容（对外 API）
// ════════════════════════════════════════════════════════════

export function isNodeSandbox(nodeId) {
  const node = appState.nodeMap.get(nodeId);
  if (!node) return false;
  if (node.activeMode === 'code') return true;
  if (!node.activeMode) {
    return !!(node.sandboxMode || (node.htmlSource && node.htmlSource.mode === 'sandbox') || node.fileSystem);
  }
  return false;
}

export function getSandboxHtml(nodeId) {
  const node = appState.nodeMap.get(nodeId);
  if (!node) return null;

  if (node.fileSystem) {
    const vfs = new VirtualFileSystem(node.fileSystem);
    return vfs.buildSimpleHtml();
  }

  if (node.htmlSource) {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>${node.htmlSource.css || ''}</style>
</head>
<body>
  ${node.htmlSource.html || ''}
  <script>${node.htmlSource.js || ''}</script>
</body>
</html>`;
  }

  return null;
}

export function renderSandboxContent(container, nodeId) {
  const html = getSandboxHtml(nodeId);
  if (!html) return;

  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'width:100%; height:100%; border:none; background:#fff;';
  iframe.srcdoc = html;

  container.innerHTML = '';
  container.appendChild(iframe);
}

// 挂载到 window，供右键菜单等非 ES module 代码调用
window.openHtmlSandboxEditor = openHtmlSandboxEditor;
window.closeHtmlSandboxEditor = closeHtmlSandboxEditor;
window.isNodeSandbox = isNodeSandbox;

// ════════════════════════════════════════════════════════════
//  状态栏（已迁移到 SandboxStatusBar，此处保留委托）
// ════════════════════════════════════════════════════════════

function _updateStatusBar() {
  if (_statusBarModule) _statusBarModule.update();
}

function _toggleMinimap() {
  if (_statusBarModule) _statusBarModule.toggleMinimap();
}

// ════════════════════════════════════════════════════════════
//  设置面板（已迁移到 SandboxSettings，此处保留委托）
// ════════════════════════════════════════════════════════════

function _showSettingsPanel() {
  if (_settingsModule) _settingsModule.showSettingsPanel();
}

// ════════════════════════════════════════════════════════════
//  命令面板（已迁移到 SandboxCommands，此处保留委托）
// ════════════════════════════════════════════════════════════

function _initCommandPalette() {
  if (!_commandsModule) {
    _commandsModule = new SandboxCommands(_ctx);
    _ctx.registerModule('commands', _commandsModule);
  }
  _commandsModule.init();
}

function _showCommandPalette() {
  if (_commandsModule) _commandsModule.show();
}

/** 跳转到指定行（弹出行号输入框） */
function _gotoLine() {
  if (!_monacoEditor) return;
  const lineStr = prompt('跳转到行号:', '1');
  if (lineStr === null) return;
  const line = parseInt(lineStr, 10);
  if (isNaN(line) || line < 1) return;
  const filePath = _monacoEditor.getCurrentFilePath();
  if (filePath) _monacoEditor.revealLine(filePath, line, 1);
}

function _executeCommandAction(action) {
  // 命令分发：优先使用 ctx action 注册表，回退到本地处理
  const result = _ctx.executeAction(action);
  if (result !== undefined) return;

  // 本地回退：处理尚未迁移到模块的 action
  switch (action) {
    case 'openFolder':   _openRealFolder(); break;
    case 'save':         saveHtmlSource(); break;
    case 'export':       exportAsHtml(); break;
    case 'history':      _showHistoryPanel(); break;
    case 'close':        closeHtmlSandboxEditor(); break;
    case 'search':       _toggleSearch(); break;
    case 'toggleMinimap': _toggleMinimap(); break;
    case 'toggleSplit':  _toggleSplitEditor(); break;
    case 'settings':     _showSettingsPanel(); break;
    case 'undo':         _monacoEditorAction('undo'); break;
    case 'redo':         _monacoEditorAction('redo'); break;
    case 'format':       _monacoEditorAction('editor.action.formatDocument'); break;
    case 'quickOpen':    _showQuickOpen(); break;
    case 'gotoLine':     _gotoLine(); break;
    case 'refreshPreview': runPreview(true); break;
    case 'toggleBookmark': if (_monacoEditor) _monacoEditor.toggleBookmark(); _updateStatusBar(); break;
    case 'nextBookmark':   if (_monacoEditor) _monacoEditor.nextBookmark(); break;
    case 'prevBookmark':   if (_monacoEditor) _monacoEditor.prevBookmark(); break;
    case 'clearBookmarks': if (_monacoEditor) _monacoEditor.clearBookmarks(); _updateStatusBar(); break;
    case 'showPreview':     _activatePreviewTab(); break;
    case 'zoomIn':        if (_monacoEditor) _monacoEditor.zoomFont(1); _updateStatusBar(); break;
    case 'zoomOut':       if (_monacoEditor) _monacoEditor.zoomFont(-1); _updateStatusBar(); break;
    case 'zoomReset':     if (_monacoEditor) _monacoEditor.setFontSize(14); _updateStatusBar(); break;
  }
}

// ════════════════════════════════════════════════════════════
//  面包屑导航（已迁移到 SandboxBreadcrumb，此处保留委托）
// ════════════════════════════════════════════════════════════

function _updateBreadcrumb(filePath) {
  if (_breadcrumbModule) _breadcrumbModule.updateBreadcrumb(filePath);
}

// ════════════════════════════════════════════════════════════
//  图片预览（已迁移到 SandboxImagePreview，此处保留委托）
// ════════════════════════════════════════════════════════════

function _isImageFile(filePath) {
  return SandboxImagePreview.isImageFile(filePath);
}

function _openImagePreview(filePath) {
  if (_imagePreviewModule) _imagePreviewModule.openImagePreview(filePath);
}

function _closeImagePreview() {
  if (_imagePreviewModule) _imagePreviewModule.closeImagePreview();
}

// ════════════════════════════════════════════════════════════
//  Markdown 预览（已迁移到 SandboxMarkdownPreview，此处保留委托）
// ════════════════════════════════════════════════════════════

function _isMarkdownFile(filePath) {
  return SandboxMarkdownPreview.isMarkdownFile(filePath);
}

function _enterMarkdownMode() {
  if (_markdownModule) _markdownModule.enterMarkdownMode();
}

function _exitMarkdownMode() {
  if (_markdownModule) _markdownModule.exitMarkdownMode();
}

function _renderMarkdownPreview() {
  if (_markdownModule) _markdownModule.renderMarkdownPreview();
}

// ════════════════════════════════════════════════════════════
//  分屏编辑（已迁移到 SandboxSplitEditor，此处保留委托）
// ════════════════════════════════════════════════════════════

async function _toggleSplitEditor() {
  if (_splitEditorModule) await _splitEditorModule.toggleSplitEditor();
}

async function _onSplitRight(filePath) {
  if (_splitEditorModule) await _splitEditorModule.onSplitRight(filePath);
}

window.getSandboxHtml = getSandboxHtml;

// ════════════════════════════════════════════════════════════
//  容器化初始化（供内置应用 AppRunner 调用）
// ════════════════════════════════════════════════════════════

let _origSandboxModal = null; // 保存原始 #htmlSandboxModal 的引用
let _origSandboxModalParent = null; // 保存原始 modal 的父节点
let _origSandboxModalNext = null; // 保存原始 modal 的下一个兄弟节点（用于还原位置）
let _savedOrphanOverlays = null; // 保存 index.html 中独立覆盖层的引用

/**
 * 在 AppRunner 提供的 modal 容器中初始化 IDE
 * @param {HTMLElement} modal - AppRunner 创建的 modal 元素
 * @returns {Promise<void>}
 */
export async function initIdeInContainer(modal, options = {}) {
  // 1. 保存原始 #htmlSandboxModal 并从 DOM 中移除（避免 getElementById 冲突）
  _origSandboxModal = document.getElementById('htmlSandboxModal');
  if (_origSandboxModal) {
    _origSandboxModalParent = _origSandboxModal.parentNode;
    _origSandboxModalNext = _origSandboxModal.nextSibling;
    _origSandboxModal.remove();
  }

  // 1b. 移除 index.html 中独立的覆盖层（避免与 modal 内的同 ID 元素冲突）
  // 这些覆盖层在 #htmlSandboxModal 外面，需要单独移除
  const _orphanOverlayIds = ['sandboxHistoryPanel'];
  _savedOrphanOverlays = {};
  for (const id of _orphanOverlayIds) {
    const el = document.getElementById(id);
    if (el) {
      _savedOrphanOverlays[id] = { parent: el.parentNode, next: el.nextSibling, el };
      el.remove();
    }
  }

  // 2. 设置新 modal 的 id，让 IDE 代码的 document.getElementById() 能找到它
  modal.id = 'htmlSandboxModal';

  // 3. 重新绑定模块级 DOM 引用
  _modal = modal;
  _content = modal.querySelector('.rich-modal-content');
  _preview = modal.querySelector('#htmlSandboxPreview');
  _consoleOut = modal.querySelector('#htmlConsoleOutput');
  _nodeName = modal.querySelector('#htmlSandboxNodeName');
  _statusText = modal.querySelector('#sandboxStatusText');

  // 4. 重新初始化上下文 DOM 引用
  _ctx.initDOMRefs();

  // 5. 初始化功能模块（菜单栏、命令面板、控制台、预览、ActivityBar、GitHub 导入）
  _initFeatureModules();

  // 5b. 注册容器化专属 action（菜单栏通过 ctx.executeAction 调用）
  _ctx.registerAction('openFolder', () => _openRealFolder());

  // 6. 创建虚拟项目（无节点时使用空项目）
  const mockNode = {
    name: '未命名项目',
    fileSystem: null,
    htmlSource: null,
    activeMode: 'code'
  };
  _currentNodeId = 'ide-app-project';
  _ctx.currentNodeId = 'ide-app-project';
  _openTimestamp = Date.now();

  if (_nodeName) _nodeName.textContent = mockNode.name;

  // 绑定 Activity Bar 按钮（需要重新绑定，因为 DOM 是新的）
  _bindActivityBarForContainer();

  // 绑定历史面板按钮（容器内重新绑定）
  _bindHistoryPanelForContainer();

  // 绑定"打开文件夹"按钮
  _bindOpenFolderBtn();

  // 绑定真实文件系统操作
  _bindRealFileOps();

  // 绑定 Ctrl+S 保存（真实文件系统模式）
  _bindRealSaveShortcut();

  // 7. 初始化 IDE 核心组件
  await _initIDEComponents(mockNode);

  // 8. 重置面板状态
  _ctx.activePanel = 'explorer';
  _ctx.isPreviewTab = false;
  _updateActivityBarButtons('explorer');

  // 9. 如果从节点打开，自动加载 sandbox 目录；否则显示欢迎页
  if (options.sandboxPath) {
    // 延迟执行，等 DOM 完全渲染
    setTimeout(() => _openFolderAtPath(options.sandboxPath), 200);
  } else {
    _showWelcomePage();
  }
}

/**
 * 显示欢迎页
 */
function _showWelcomePage() {
  const el = _modal?.querySelector('#sandboxWelcomePage');
  if (el) el.classList.remove('hidden');
}

/**
 * 隐藏欢迎页
 */
function _hideWelcomePage() {
  const el = _modal?.querySelector('#sandboxWelcomePage');
  if (el) el.classList.add('hidden');
}

/**
 * 欢迎页"新建文件"按钮：先打开文件夹，再新建文件
 */
async function _createNewFileInWelcome() {
  // 如果还没有工作区，先打开文件夹
  if (!_workspacePath) {
    await _openRealFolder();
    // 如果用户取消了文件夹选择，直接返回
    if (!_workspacePath) return;
  }
  // 在根目录创建 untitled 文件
  if (_vfs) {
    let name = 'untitled.html';
    let i = 1;
    while (_vfs._files && _vfs._files.has(name)) {
      name = `untitled-${i}.html`;
      i++;
    }
    const file = _vfs.createFile('', name);
    if (file && _fileTree) _fileTree.refresh();
    if (file) _openFileInEditor(file.path);
    // 实时同步到磁盘
    const currentNodeId = _ctx.currentNodeId;
    if (currentNodeId) {
      const projectFolderPath = _getProjectFolderPath();
      _vfs.writeSingleFileToDisk(projectFolderPath, currentNodeId, file.path).then((ok) => {
        if (ok) console.log('[实时同步] 已创建磁盘文件:', file.path);
      });
    }
  }
}

/**
 * 绑定 Activity Bar 按钮（容器内版本）
 */
function _bindActivityBarForContainer() {
  const activityBar = _modal.querySelector('.sandbox-activity-bar');
  if (!activityBar) return;
  activityBar.querySelectorAll('.activity-bar-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const panel = btn.dataset.panel;
      if (panel === 'preview') {
        _activatePreviewTab();
      } else {
        _toggleSidePanel(panel);
      }
    });
  });
}

/**
 * 绑定历史面板按钮（容器内版本）
 */
function _bindHistoryPanelForContainer() {
  const closeBtn = _modal?.querySelector('#historyCloseBtn');
  const restoreBtn = _modal?.querySelector('#historyRestoreBtn');
  if (closeBtn) closeBtn.addEventListener('click', () => _hideHistoryPanel());
  if (restoreBtn) restoreBtn.addEventListener('click', () => _restoreHistoryVersion());
}

// ════════════════════════════════════════════════════════════
//  真实文件系统操作（打开电脑任意文件夹）
// ════════════════════════════════════════════════════════════

/**
 * 绑定"打开文件夹"按钮
 */
function _bindOpenFolderBtn() {
  const btn = _modal?.querySelector('#ideOpenFolderBtn');
  if (btn) btn.addEventListener('click', () => _openRealFolder());
  // 标题栏双击打开文件夹
  const titleEl = _modal?.querySelector('#htmlSandboxTitle');
  if (titleEl) {
    titleEl.style.cursor = 'pointer';
    titleEl.title = '点击打开文件夹';
    titleEl.addEventListener('click', () => _openRealFolder());
  }
  // 欢迎页按钮
  const welcomeOpenBtn = _modal?.querySelector('#welcomeOpenFolder');
  const welcomeNewBtn = _modal?.querySelector('#welcomeNewFile');
  if (welcomeOpenBtn) welcomeOpenBtn.addEventListener('click', () => _openRealFolder());
  if (welcomeNewBtn) welcomeNewBtn.addEventListener('click', () => _createNewFileInWelcome());
}

/**
 * 打开文件夹对话框 → 加载真实目录到 VFS
 */
async function _openRealFolder() {
  if (!window.api?.ideSelectFolder) return;
  const folderPath = await window.api.ideSelectFolder();
  if (!folderPath) return;

  try {
    _workspacePath = folderPath;
    _isRealFS = true;

    // 更新标题栏
    const folderName = folderPath.split(/[\\/]/).pop();
    if (_nodeName) _nodeName.textContent = folderPath;
    const titleEl = _modal?.querySelector('#htmlSandboxTitle');
    if (titleEl) titleEl.textContent = '📁 ' + folderName;

    // 读取目录树
    const dirTree = await window.api.ideReadDirTree(folderPath);
    console.log('[IDE] 目录树:', JSON.stringify(dirTree).substring(0, 200));

    // 转换为 VFS 格式
    const vfsData = await _dirTreeToVFS(dirTree, folderPath);
    console.log('[IDE] VFS 根节点子项数:', vfsData.children?.length || 0);

    _vfs = new VirtualFileSystem(vfsData);
    _vfs.toggleExpanded('/');  // 只展开根目录，子文件夹默认折叠
    _ctx.vfs = _vfs;

    // 刷新文件树
    const treeContainer = _modal?.querySelector('#sandboxFileTreeContainer');
    console.log('[IDE] treeContainer:', !!treeContainer, '_fileTree:', !!_fileTree);
    if (treeContainer && _fileTree) {
      treeContainer.innerHTML = '';
      _fileTree = new FileTreeComponent(treeContainer, _vfs, {
        onFileSelect: (filePath) => _onFileSelect(filePath),
        onFileDblClick: (filePath) => _onFileDblClick(filePath),
        onContextMenu: (filePath) => _onFileTreeContextMenu(filePath),
        onFileCreate: (dirPath, name, type) => _onFileCreate(dirPath, name, type),
        onFileDelete: (path, isDir) => _onFileDelete(path, isDir),
        onFileRename: (path, newName) => _onFileRename(path, newName),
        onFileSystemChange: () => _onFileSystemChange(),
        onOpenFileLocation: (filePath) => _onOpenFileLocation(filePath),
      });
      _fileTree.render();
    }

    // 关闭所有已打开的标签
    if (_fileTabs) {
      _fileTabs.closeAll();
    }
    // 关闭所有 Monaco 编辑器文件
    if (_monacoEditor && _monacoEditor._models) {
      for (const fp of [..._monacoEditor._models.keys()]) {
        _monacoEditor.closeFile(fp);
      }
    }

  console.log('[IDE] 已打开文件夹:', folderPath);
    _hideWelcomePage();
  } catch (e) {
    console.error('[IDE] 打开文件夹失败:', e);
  }
}

/**
 * 直接加载指定路径的文件夹（不弹出对话框）
 * @param {string} folderPath - 绝对路径
 */
async function _openFolderAtPath(folderPath) {
  if (!folderPath) return;

  try {
    _workspacePath = folderPath;
    _isRealFS = true;

    // 更新标题栏
    const folderName = folderPath.split(/[\\/]/).pop();
    if (_nodeName) _nodeName.textContent = folderPath;
    const titleEl = _modal?.querySelector('#htmlSandboxTitle');
    if (titleEl) titleEl.textContent = '📁 ' + folderName;

    // 读取目录树
    const dirTree = await window.api.ideReadDirTree(folderPath);
    console.log('[IDE] 自动加载目录树:', JSON.stringify(dirTree).substring(0, 200));

    // 转换为 VFS 格式
    const vfsData = await _dirTreeToVFS(dirTree, folderPath);
    console.log('[IDE] VFS 根节点子项数:', vfsData.children?.length || 0);

    _vfs = new VirtualFileSystem(vfsData);
    _vfs.toggleExpanded('/');  // 只展开根目录，子文件夹默认折叠
    _ctx.vfs = _vfs;

    // 刷新文件树
    const treeContainer = _modal?.querySelector('#sandboxFileTreeContainer');
    if (treeContainer && _fileTree) {
      treeContainer.innerHTML = '';
      _fileTree = new FileTreeComponent(treeContainer, _vfs, {
        onFileSelect: (fp) => _onFileSelect(fp),
        onFileDblClick: (fp) => _onFileDblClick(fp),
        onContextMenu: (fp) => _onFileTreeContextMenu(fp),
        onFileCreate: (dirPath, name, type) => _onFileCreate(dirPath, name, type),
        onFileDelete: (path, isDir) => _onFileDelete(path, isDir),
        onFileRename: (path, newName) => _onFileRename(path, newName),
        onFileSystemChange: () => _onFileSystemChange(),
        onOpenFileLocation: (filePath) => _onOpenFileLocation(filePath),
      });
      _fileTree.render();
    }

    // 关闭所有已打开的标签
    if (_fileTabs) _fileTabs.closeAll();
    if (_monacoEditor && _monacoEditor._models) {
      for (const fp of [..._monacoEditor._models.keys()]) {
        _monacoEditor.closeFile(fp);
      }
    }

    console.log('[IDE] 已自动加载文件夹:', folderPath);
    _hideWelcomePage();
  } catch (e) {
    console.error('[IDE] 自动加载文件夹失败:', e);
  }
}

/**
 * 将真实目录树转为 VFS 格式
 * @param {Object} dirTree - { children: { name: { children: {} } } }
 * @param {string} basePath - 基础路径（用于读取目录内容）
 * @returns {Object} VFS 格式 { name: '/', type: 'directory', children: [...] }
 */
async function _dirTreeToVFS(dirTree, basePath) {
  const root = { name: '/', type: 'directory', children: [] };

  async function buildChildren(parentNode, dirPath, children) {
    const items = await window.api.ideReadDir(dirPath);
    // 排序：文件夹在前，字母序
    items.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    for (const item of items) {
      if (item.name.startsWith('.') || item.name === 'node_modules') continue;
      const childPath = `${dirPath}/${item.name}`;
      if (item.type === 'directory') {
        const dirNode = { name: item.name, type: 'directory', children: [] };
        // 检查是否在目录树中（有子目录）
        const hasChildren = children && children[item.name];
        if (hasChildren) {
          await buildChildren(dirNode, childPath, children[item.name].children);
        } else {
          // 空目录或只有文件的目录
          try {
            const subItems = await window.api.ideReadDir(childPath);
            for (const sub of subItems) {
              if (sub.type === 'directory' && !sub.name.startsWith('.') && sub.name !== 'node_modules') {
                dirNode.children.push({ name: sub.name, type: 'directory', children: [] });
              }
            }
          } catch (e) { /* 忽略 */ }
        }
        parentNode.children.push(dirNode);
      } else {
        parentNode.children.push({ name: item.name, type: 'file' });
      }
    }
  }

  await buildChildren(root, basePath, dirTree.children || {});
  return root;
}

/**
 * 从真实磁盘读取文件内容
 * @param {string} filePath - VFS 路径（如 /index.html）
 * @returns {Promise<Object>} { type, content, dataUrl }
 */
async function _realReadFile(filePath) {
  if (!_workspacePath) return null;
  const sep = _workspacePath.endsWith('/') || _workspacePath.endsWith('\\') ? '' : '/';
  const absPath = _workspacePath + sep + filePath;
  return await window.api.ideReadFile(absPath);
}

/**
 * 保存文件到真实磁盘
 * @param {string} filePath - VFS 路径
 * @param {string} content - 文件内容
 */
async function _realSaveFile(filePath, content) {
  if (!_workspacePath) return;
  const sep = _workspacePath.endsWith('/') || _workspacePath.endsWith('\\') ? '' : '/';
  const absPath = _workspacePath + sep + filePath;
  await window.api.ideWriteFile(absPath, content);
}

/**
 * 真实文件系统的文件操作（创建/删除/重命名）
 * 直接代理到 _fileOpsModule 或通过 ide IPC
 */
function _bindRealFileOps() {
  // 覆盖 VFS 的创建文件/文件夹逻辑 — 通过监听文件树操作
  _ctx.on('createFile', async ({ parentPath, name, type }) => {
    if (!_isRealFS || !_workspacePath) return;
    const sep = _workspacePath.endsWith('/') || _workspacePath.endsWith('\\') ? '' : '/';
    const absPath = _workspacePath + sep + parentPath;
    await window.api.ideCreateItem(absPath, name, type);
    // 添加到 VFS
    if (type === 'directory') {
      _vfs.createDirectory(parentPath, name);
    } else {
      _vfs.createFile(parentPath, name);
    }
    _vfs.expandAll();
    _fileTree?.render();
    _updateStatusBar();
  });

  _ctx.on('deleteFile', async ({ filePath }) => {
    if (!_isRealFS || !_workspacePath) return;
    const sep = _workspacePath.endsWith('/') || _workspacePath.endsWith('\\') ? '' : '/';
    const absPath = _workspacePath + sep + filePath;
    await window.api.ideDeleteItem(absPath);
    const file = _vfs.getFile(filePath);
    if (file) {
      _vfs.deleteFile(filePath);
    } else {
      _vfs.deleteDirectory(filePath);
    }
    _vfs.expandAll();
    _fileTree?.render();
    _updateStatusBar();
  });

  _ctx.on('renameFile', async ({ oldPath, newPath }) => {
    if (!_isRealFS || !_workspacePath) return;
    const sep = _workspacePath.endsWith('/') || _workspacePath.endsWith('\\') ? '' : '/';
    const absOldPath = _workspacePath + sep + oldPath;
    const newName = newPath.split('/').pop();
    await window.api.ideRenameItem(absOldPath, newName);
    _vfs.rename(oldPath, newPath);
    _vfs.expandAll();
    _fileTree?.render();
    _updateStatusBar();
  });
}

/**
 * 绑定 Ctrl+S 保存到真实磁盘
 */
function _bindRealSaveShortcut() {
  document.addEventListener('keydown', async (e) => {
    // Ctrl+S
    if ((e.ctrlKey || e.metaKey) && e.key === 's' && !e.shiftKey) {
      if (!_isRealFS || !_workspacePath || !_monacoEditor || !_vfs) return;
      e.preventDefault();
      e.stopPropagation();

      // 同步 Monaco 内容到 VFS
      _monacoEditor.syncAllToFS(_vfs);
      if (_splitEditorModule && _splitEditorModule.monacoEditor2) {
        _splitEditorModule.monacoEditor2.syncAllToFS(_vfs);
      }

      // 写入所有脏文件到真实磁盘
      let savedCount = 0;
      const allFiles = _vfs.getFilePaths();
      for (const filePath of allFiles) {
        const file = _vfs.getFile(filePath);
        if (file && file.isDirty) {
          try {
            await _realSaveFile(filePath, file.content);
            file.isDirty = false;
            savedCount++;
          } catch (e) {
            console.error('[IDE] 保存失败:', filePath, e);
          }
        }
      }

      // 标记已保存
      _monacoEditor.markAllSaved();
      if (_splitEditorModule && _splitEditorModule.monacoEditor2) {
        _splitEditorModule.monacoEditor2.markAllSaved();
      }

      if (savedCount > 0) {
        _setStatus(`已保存 ${savedCount} 个文件`);
      }
    }
  }, true); // capture: true 确保优先处理
}

/**
 * 销毁容器化 IDE，恢复原始 DOM
 */
export function destroyIdeContainer() {
  // 1. 销毁 IDE 组件
  _destroyIDEComponents();

  // 2. 清理模块级变量
  _currentNodeId = null;
  _ctx.currentNodeId = null;
  _lastAutoSavePath = null;
  _workspacePath = null;
  _isRealFS = false;
  if (_nodeName) _nodeName.textContent = '';

  // 3. 清除 modal 的 id
  if (_modal) {
    _modal.id = '';
  }
  _modal = null;
  _content = null;
  _preview = null;
  _consoleOut = null;
  _nodeName = null;
  _statusText = null;

  // 4. 还原原始 #htmlSandboxModal 到 DOM
  if (_origSandboxModal && _origSandboxModalParent) {
    if (_origSandboxModalNext) {
      _origSandboxModalParent.insertBefore(_origSandboxModal, _origSandboxModalNext);
    } else {
      _origSandboxModalParent.appendChild(_origSandboxModal);
    }
    _origSandboxModal = null;
    _origSandboxModalParent = null;
    _origSandboxModalNext = null;
  }

  // 4b. 还原 index.html 中独立的覆盖层
  if (_savedOrphanOverlays) {
    for (const id of Object.keys(_savedOrphanOverlays)) {
      const saved = _savedOrphanOverlays[id];
      if (saved && saved.parent) {
        if (saved.next) {
          saved.parent.insertBefore(saved.el, saved.next);
        } else {
          saved.parent.appendChild(saved.el);
        }
      }
    }
    _savedOrphanOverlays = null;
  }
}

console.log('[html-sandbox-editor] 模块已加载（VSCode 风格 IDE + 扩展功能 + 容器化支持）');
