import { appState } from '../../module0_AppState.js';
import { VirtualFileSystem, migrateHtmlSource } from './core/virtual-fs.js';
import { FileTreeComponent } from './editors/file-tree.js';
import { FileTabsComponent } from './editors/tabs.js';
import { SandboxMonacoEditor } from './editors/monaco-editor.js';
import { SandboxHistory } from './features/history.js';
import { SandboxSearch } from './editors/search.js';
import { SandboxTerminal } from './editors/terminal.js';
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
import { S, AUTO_RUN_DEBOUNCE, AUTO_SAVE_DELAY } from './state.js';
import { _initIDEComponents, _destroyIDEComponents, _setStatus, _getProjectFolderPath } from './ide-components.js';
import { runPreview, _pausePreview, _resumePreview, closeHtmlSandboxEditor, saveHtmlSource, _renderMarkdownPreview, _showCommandPalette, _initCommandPalette, _executeCommandAction, _closeImagePreview, _exitMarkdownMode, _updateStatusBar } from './editor-lifecycle.js';

// ════════════════════════════════════════════════════════════
//  初始化窗口管理器
// ════════════════════════════════════════════════════════════
export function initHtmlSandboxWindow() {
  if (!S._modal || !S._content) return;
  if (S._windowInstance) return;  // 已初始化

  S._windowInstance = WindowManager.create({
    id: 'html-sandbox',
    title: '💻 代码编辑器',
    container: S._modal,
    content: S._content,
    header: S._modal.querySelector('.rich-modal-header'),
    icon: '💻',
    initialState: WindowState.MAXIMIZED,
    defaultWidth: '75vw',
    defaultHeight: '80vh',
    resizable: true,
    onClose: () => {
      // 关闭前：取消挂起的自动保存定时器，并立即执行最后一次保存
      // 注意：无论 S._autoSaveTimer 是否存在，都要保存，因为定时器可能已经执行完毕
      if (S._autoSaveTimer) {
        clearTimeout(S._autoSaveTimer);
        S._autoSaveTimer = null;
      }
      // 始终执行最后一次保存（不仅限于有挂起定时器时）
      if (S._currentNodeId && S._monacoEditor && S._vfs) {
        S._monacoEditor.syncAllToFS(S._vfs);
        if (S._splitEditorModule && S._splitEditorModule.monacoEditor2) S._splitEditorModule.monacoEditor2.syncAllToFS(S._vfs);

        if (S._isRealFS && S._workspacePath && window.api?.ideWriteFile) {
          // isRealFS 模式：保存脏文件到真实磁盘
          for (const filePath of S._vfs.getFilePaths()) {
            const file = S._vfs.getFile(filePath);
            if (file && file.isDirty) {
              // 跳过图片/二进制文件：其 content 是 dataUrl，写入磁盘会损坏原文件
              if (file.content && file.content.startsWith('data:')) {
                file.isDirty = false;
                continue;
              }
              const sep = S._workspacePath.endsWith('/') || S._workspacePath.endsWith('\\') ? '' : '/';
              const absPath = S._workspacePath + sep + filePath;
              window.api.ideWriteFile(absPath, file.content).catch(() => {});
            }
          }
        }

        const node = appState.nodeMap.get(S._currentNodeId);
        if (node) {
          node.fileSystem = S._vfs.toJSON();
          // 异步触发磁盘全量同步（不阻塞关闭）
          S._vfs.syncAllToDisk(_getProjectFolderPath(), S._currentNodeId);
        }
      }
      // 退出全屏预览
      if (S._previewFullscreen) _togglePreviewFullscreen();
      // 注意：不再单独调用 _pausePreview()，由 _destroyIDEComponents 内的 S._previewModule.destroy() 处理
      // 这样确保 iframe 清理只发生一次，避免重复操作
      S._currentNodeId = null;
      S._ctx.currentNodeId = null;  // 同步清理上下文，避免模块读到过期节点
      S._lastAutoSavePath = null;
      if (S._nodeName) S._nodeName.textContent = '';
      window._pause3DAnimation = false;
      // 销毁 IDE 组件（内部会调用 S._previewModule.destroy() → pausePreview() 清理 iframe）
      _destroyIDEComponents();
    },
    onStateChange: (newState, prevState) => {
      _updateMaxIcon(newState);
      window._pause3DAnimation = (newState === WindowState.MAXIMIZED);

      if (newState === WindowState.MINIMIZED) {
        _pausePreview();
      } else if (prevState === WindowState.MINIMIZED && newState !== WindowState.MINIMIZED) {
        _resumePreview();
        if (S._monacoEditor) setTimeout(() => S._monacoEditor.layout(), 50);
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
    if (Date.now() - S._openTimestamp < 300) return;
    S._windowInstance.minimize();
  });
  if (maxBtn) maxBtn.addEventListener('click', () => S._windowInstance.toggleMaximize());
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
    window.WindowManager.registerElement(S._modal);
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
    if (S._monacoEditor && S._fileTabs) {
      const path = S._monacoEditor.getCurrentFilePath();
      if (path) _onTabClose(path);
    }
  });
  document.addEventListener('sandbox-toggle-console', () => _toggleBottomPanel());
  document.addEventListener('sandbox-new-terminal', () => _newTerminal());
  document.addEventListener('sandbox-global-search', () => _toggleSearch());
  document.addEventListener('sandbox-quick-open', () => _showQuickOpen());
  document.addEventListener('sandbox-command-palette', () => _showCommandPalette());

  // ── 兼容过渡期：监听模块事件 ──
  _registerCtxListeners();
  // SandboxTemplateHistory 模块事件
  S._ctx.on('fileSystemChange', () => _onFileSystemChange());
  S._ctx.on('autoRunPreview', () => { if (S._autoRunEnabled) runPreview(false); });
  S._ctx.on('statusChange', (text) => _setStatus(text));
  // SandboxFileOps 模块事件
  S._ctx.on('deactivatePreviewTab', () => _deactivatePreviewTab());
  S._ctx.on('closePreviewTab', () => _closePreviewTab());
  S._ctx.on('updateActivityBarButtons', (panel) => _updateActivityBarButtons(panel));

  // 拖拽打开文件
  _initDragOpen();

  // Resize 分隔条（已迁移到 SandboxResize 模块，由 _initIDEComponents 初始化）
}

// ════════════════════════════════════════════════════════════
//  功能模块初始化（每次打开 IDE 时调用）
//
//  这些模块在 _destroyIDEComponents() 中会被销毁并置 null，
//  而 initHtmlSandboxWindow() 受 S._windowInstance 守卫只执行一次，
//  因此必须在每次 openHtmlSandboxEditor() 时重新初始化，
//  否则关闭后再次打开时菜单栏/预览/控制台/命令面板等将失效
//  （_activatePreviewTab / _toggleSidePanel 等委托函数因
//   if (S._activityBarModule) 守卫而静默无效）。
// ════════════════════════════════════════════════════════════
export function _initFeatureModules() {
  // 菜单栏（_initMenuBar 内部已含 if (!S._menuBarModule) 守卫）
  _initMenuBar();
  // 命令面板
  _initCommandPalette();
  // 控制台消息监听
  _initConsoleListener();
  // AutoRun 模块
  if (!S._autoRunModule) {
    S._autoRunModule = new SandboxAutoRun(S._ctx);
    S._ctx.registerModule('autoRun', S._autoRunModule);
  }
  S._autoRunModule.init();
  // Preview 模块
  if (!S._previewModule) {
    S._previewModule = new SandboxPreview(S._ctx);
    S._ctx.registerModule('preview', S._previewModule);
  }
  S._previewModule.init();
  // ActivityBar 模块
  if (!S._activityBarModule) {
    S._activityBarModule = new SandboxActivityBar(S._ctx);
    S._ctx.registerModule('activityBar', S._activityBarModule);
  }
  S._activityBarModule.init();
  // GitHub 导入模块
  if (!S._githubImportModule) {
    S._githubImportModule = new SandboxGithubImport(S._ctx);
    S._ctx.registerModule('githubImport', S._githubImportModule);
  }
  S._githubImportModule.init();
}

export function _initDragOpen() {
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
    if (filePath && S._vfs && S._vfs.getFile(filePath)) {
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
  if (!S._menuBarModule) {
    S._menuBarModule = new SandboxMenuBar(S._ctx);
    S._ctx.registerModule('menuBar', S._menuBarModule);
  }
  S._menuBarModule.init();
}

function _closeAllMenus() {
  if (S._menuBarModule) S._menuBarModule._closeAllMenus();
}

function _executeMenuAction(action) {
  if (S._menuBarModule) {
    S._menuBarModule._executeMenuAction(action);
  }
}

function _monacoEditorAction(actionId) {
  if (S._menuBarModule) {
    S._menuBarModule._monacoEditorAction(actionId);
  }
}

function _showShortcutsHelp() {
  if (S._menuBarModule) S._menuBarModule._showShortcutsHelp();
}

function _showAboutDialog() {
  if (S._menuBarModule) S._menuBarModule._showAboutDialog();
}

// ════════════════════════════════════════════════════════════
//  Activity Bar 和侧边面板管理（已迁移到 SandboxActivityBar，此处保留委托）
// ════════════════════════════════════════════════════════════

export function _toggleSidePanel(panel) {
  if (S._activityBarModule) {
    S._activityBarModule.toggleSidePanel(panel);
    // 同步 ctx 状态（模块 emit toggleSidePanel 事件也会处理 DOM）
    S._ctx.activePanel = S._activityBarModule._activePanel;
  }
}

export function _updateActivityBarButtons(activePanel) {
  if (S._activityBarModule) S._activityBarModule.updateActivityBarButtons(activePanel);
}

export function _activatePreviewTab() {
  if (S._activityBarModule) {
    S._activityBarModule.activatePreviewTab();
    S._ctx.isPreviewTab = true; // 同步 ctx 状态
  }
}

function _deactivatePreviewTab() {
  if (S._activityBarModule) {
    S._activityBarModule.deactivatePreviewTab();
    S._ctx.isPreviewTab = false; // 同步 ctx 状态
  }
}

function _closePreviewTab() {
  if (S._activityBarModule) {
    S._activityBarModule.closePreviewTab();
    S._ctx.isPreviewTab = false; // 同步 ctx 状态
  }
}

function _renderPreviewTab() {
  if (S._activityBarModule) S._activityBarModule.renderPreviewTab();
}

function _showPreviewTabContextMenu(x, y) {
  if (S._activityBarModule) S._activityBarModule.showPreviewTabContextMenu(x, y);
}

// ════════════════════════════════════════════════════════════
//  控制台消息监听（已迁移到 SandboxConsole，此处保留委托）
// ════════════════════════════════════════════════════════════
function _initConsoleListener() {
  if (!S._consoleModule) {
    S._consoleModule = new SandboxConsole(S._ctx);
    S._ctx.registerModule('console', S._consoleModule);
  }
  S._consoleModule.init();
}

/**
 * 注册 ctx 事件监听器（initHtmlSandboxWindow 和 initIdeInContainer 共用）
 */
export function _registerCtxListeners() {
  S._ctx.on('activatePreviewTab', () => _activatePreviewTab());
  S._ctx.on('syncSplitEditor', (vfs) => {
    if (S._splitEditorModule && S._splitEditorModule.monacoEditor2) S._splitEditorModule.monacoEditor2.syncAllToFS(vfs);
  });
  S._ctx.on('executeMenuAction', (action) => _executeCommandAction(action));
  S._ctx.on('executeCommand', (action) => _executeCommandAction(action));
  S._ctx.on('closeImagePreview', () => _closeImagePreview());
  S._ctx.on('exitMarkdownMode', () => _exitMarkdownMode());
  S._ctx.on('openFileInEditor', (filePath) => _openFileInEditor(filePath));
  S._ctx.on('runPreview', () => runPreview(true));
  S._ctx.on('updateStatusBar', () => _updateStatusBar());
  S._ctx.on('updateBreadcrumb', (data) => {
    if (S._breadcrumbModule) {
      if (data && data.barEl) {
        S._breadcrumbModule.updateBreadcrumbIn(data.barEl, data.filePath);
      } else {
        S._breadcrumbModule.updateBreadcrumb(data);
      }
    }
  });
  S._ctx.on('contentChange', (filePath) => _onContentChange(filePath));
  S._ctx.on('copyPath', (filePath) => _onCopyPath(filePath));
  S._ctx.on('revealInTree', (filePath) => _onRevealInTree(filePath));
  S._ctx.on('toggleSidePanel', (panel) => {
    const sidePanel = document.getElementById('sandboxSidePanel');
    const searchPanel = document.getElementById('sandboxSearchPanel');
    const fileTreePanel = document.getElementById('sandboxFileTreeContainer');
    const githubPanel = document.getElementById('sandboxGithubPanel');
    if (panel) {
      S._ctx.activePanel = panel;
      if (sidePanel) sidePanel.classList.remove('collapsed');
      if (panel === 'search') {
        if (searchPanel) searchPanel.style.display = 'flex';
        if (fileTreePanel) fileTreePanel.style.display = 'none';
        if (githubPanel) githubPanel.style.display = 'none';
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
        const urlInput = document.getElementById('githubUrlInput');
        if (urlInput) urlInput.focus();
      }
    } else {
      S._ctx.activePanel = null;
      if (sidePanel) sidePanel.classList.add('collapsed');
    }
  });
}

function _addConsoleLine(level, args) {
  if (S._consoleModule) S._consoleModule.addConsoleLine(level, args);
}

function _renderConsoleArg(arg) {
  return S._consoleModule ? S._consoleModule._renderArg(arg) : document.createTextNode(String(arg));
}

function _renderExpandable(arg) {
  return S._consoleModule ? S._consoleModule._renderExpandable(arg) : document.createTextNode('');
}

export function _setConsoleFilter(filter) {
  if (S._consoleModule) S._consoleModule.setConsoleFilter(filter);
}

function _updateConsoleCounts() {
  if (S._consoleModule) S._consoleModule._updateCounts();
}

function _clearConsole() {
  if (S._consoleModule) S._consoleModule.clearConsole();
}

// ── 底部面板管理（已迁移到 SandboxConsole，此处保留委托）──
export function _showBottomPanel(tab) {
  if (S._consoleModule) S._consoleModule.showBottomPanel(tab);
}

function _hideBottomPanel() {
  if (S._consoleModule) S._consoleModule.hideBottomPanel();
}

export function _toggleBottomPanel(tab) {
  if (S._consoleModule) S._consoleModule.toggleBottomPanel(tab);
}

function _toggleConsole() {
  if (S._consoleModule) S._consoleModule.toggleConsole();
}

function _toggleTerminal() {
  if (S._consoleModule) S._consoleModule.toggleTerminal();
}

export function _newTerminal() {
  if (S._consoleModule) S._consoleModule.newTerminal();
}

function _killAllTerminals() {
  if (S._consoleModule) S._consoleModule.killAllTerminals();
}

// ════════════════════════════════════════════════════════════
//  自动运行（已迁移到 SandboxAutoRun，此处保留委托）
// ════════════════════════════════════════════════════════════
function _toggleAutoRun() {
  if (S._autoRunModule) S._autoRunModule.toggleAutoRun();
}

function _onContentChange(filePath) {
  if (S._autoRunModule) S._autoRunModule.onContentChange(filePath);
}

// ════════════════════════════════════════════════════════════
//  自动保存到磁盘（已迁移到 SandboxAutoRun，此处保留委托）
// ════════════════════════════════════════════════════════════

function _triggerAutoSave(filePath) {
  if (S._autoRunModule) S._autoRunModule.triggerAutoSave(filePath);
}

async function _autoSaveCurrentFile() {
  if (S._autoRunModule) await S._autoRunModule._autoSaveCurrentFile();
}

// ════════════════════════════════════════════════════════════
//  全屏预览（已迁移到 SandboxPreview，此处保留委托）
// ════════════════════════════════════════════════════════════
export function _togglePreviewFullscreen() {
  if (S._previewModule) S._previewModule.togglePreviewFullscreen();
}

// ════════════════════════════════════════════════════════════
//  全局搜索
// ════════════════════════════════════════════════════════════
export function _toggleSearch() {
  _toggleSidePanel('search');
}

export function _showQuickOpen() {
  // 简单实现：聚焦文件搜索
  if (S._search) {
    S._search.show();
    const input = document.getElementById('sandboxSearchInput');
    if (input) input.focus();
  }
}

// ════════════════════════════════════════════════════════════
//  本地历史记录（已迁移到 SandboxTemplateHistory，此处保留委托）
// ════════════════════════════════════════════════════════════

function _showHistoryPanel() {
  if (S._templateHistoryModule) S._templateHistoryModule.showHistoryPanel();
}

export function _hideHistoryPanel() {
  if (S._templateHistoryModule) S._templateHistoryModule.hideHistoryPanel();
}

export function _restoreHistoryVersion() {
  if (S._templateHistoryModule) S._templateHistoryModule.restoreHistoryVersion();
}

// Resize 分隔条（已迁移到 SandboxResize 模块，初始化由 _initIDEComponents 处理）
