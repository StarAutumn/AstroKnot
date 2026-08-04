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
import { _initFeatureModules, _initDragOpen, _registerCtxListeners, _updateActivityBarButtons, _toggleSidePanel, _activatePreviewTab, _hideHistoryPanel, _restoreHistoryVersion, _setConsoleFilter, _showBottomPanel, _togglePreviewFullscreen, _toggleBottomPanel, _newTerminal, _toggleSearch, _showQuickOpen } from './window-init.js';
import { _initIDEComponents, _destroyIDEComponents } from './ide-components.js';
import { runPreview, closeHtmlSandboxEditor, saveHtmlSource, _renderMarkdownPreview, _showCommandPalette } from './editor-lifecycle.js';
import { _bindOpenFolderBtn } from './real-fs.js';

// ════════════════════════════════════════════════════════════
//  容器化初始化（供内置应用 AppRunner 调用）
// ════════════════════════════════════════════════════════════

/**
 * 在 AppRunner 提供的 modal 容器中初始化 IDE
 * @param {HTMLElement} modal - AppRunner 创建的 modal 元素
 * @returns {Promise<void>}
 */
export async function initIdeInContainer(modal, options = {}) {
  // 1. 保存原始 #htmlSandboxModal 并从 DOM 中移除（避免 getElementById 冲突）
  S._origSandboxModal = document.getElementById('htmlSandboxModal');
  if (S._origSandboxModal) {
    S._origSandboxModalParent = S._origSandboxModal.parentNode;
    S._origSandboxModalNext = S._origSandboxModal.nextSibling;
    S._origSandboxModal.remove();
  }

  // 1b. 移除 index.html 中独立的覆盖层（避免与 modal 内的同 ID 元素冲突）
  // 这些覆盖层在 #htmlSandboxModal 外面，需要单独移除
  const _orphanOverlayIds = ['sandboxHistoryPanel'];
  S._savedOrphanOverlays = {};
  for (const id of _orphanOverlayIds) {
    const el = document.getElementById(id);
    if (el) {
      S._savedOrphanOverlays[id] = { parent: el.parentNode, next: el.nextSibling, el };
      el.remove();
    }
  }

  // 2. 设置新 modal 的 id，让 IDE 代码的 document.getElementById() 能找到它
  modal.id = 'htmlSandboxModal';

  // 3. 重新绑定模块级 DOM 引用
  S._modal = modal;
  S._content = modal.querySelector('.rich-modal-content');
  S._preview = modal.querySelector('#htmlSandboxPreview');
  S._consoleOut = modal.querySelector('#htmlConsoleOutput');
  S._nodeName = modal.querySelector('#htmlSandboxNodeName');
  S._statusText = modal.querySelector('#sandboxStatusText');

  // 4. 重新初始化上下文 DOM 引用
  S._ctx.initDOMRefs();

  // 5. 初始化功能模块（菜单栏、命令面板、控制台、预览、ActivityBar、GitHub 导入）
  _initFeatureModules();

  // 5b. 注册容器化专属 action（菜单栏通过 ctx.executeAction 调用）
  S._ctx.registerAction('openFolder', () => _openRealFolder());
  S._ctx.registerAction('importLocalFolder', () => _importLocalFolder());

  // 6. 创建虚拟项目（无节点时使用空项目）
  const mockNode = {
    name: '未命名项目',
    fileSystem: null,
    htmlSource: null,
    activeMode: 'code'
  };
  S._currentNodeId = 'ide-app-project';
  S._ctx.currentNodeId = 'ide-app-project';
  S._openTimestamp = Date.now();

  if (S._nodeName) S._nodeName.textContent = mockNode.name;

  // 绑定 Activity Bar 按钮（需要重新绑定，因为 DOM 是新的）
  _bindActivityBarForContainer();

  // 注册 ctx 事件监听器（toggleSidePanel 等事件处理）
  _registerCtxListeners();

  // 绑定历史面板按钮（容器内重新绑定）
  _bindHistoryPanelForContainer();

  // 绑定容器内所有缺失的 UI 事件（控制台过滤、底部面板、快捷键等）
  _bindContainerUIEvents();

  // 绑定"打开文件夹"按钮
  _bindOpenFolderBtn();

  // 绑定真实文件系统操作
  _bindRealFileOps();

  // 绑定 Ctrl+S 保存（真实文件系统模式）
  _bindRealSaveShortcut();

  // 7. 初始化 IDE 核心组件
  await _initIDEComponents(mockNode);

  // 8. 重置面板状态
  S._ctx.activePanel = 'explorer';
  S._ctx.isPreviewTab = false;
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
  const el = S._modal?.querySelector('#sandboxWelcomePage');
  if (el) el.classList.remove('hidden');
}

/**
 * 隐藏欢迎页
 */
function _hideWelcomePage() {
  const el = S._modal?.querySelector('#sandboxWelcomePage');
  if (el) el.classList.add('hidden');
}

/**
 * 欢迎页"新建文件"按钮：先打开文件夹，再新建文件
 */
async function _createNewFileInWelcome() {
  // 如果还没有工作区，先打开文件夹
  if (!S._workspacePath) {
    await _openRealFolder();
    // 如果用户取消了文件夹选择，直接返回
    if (!S._workspacePath) return;
  }
  // 在根目录创建 untitled 文件
  if (S._vfs) {
    let name = 'untitled.html';
    let i = 1;
    while (S._vfs._files && S._vfs._files.has(name)) {
      name = `untitled-${i}.html`;
      i++;
    }
    const file = S._vfs.createFile('', name);
    if (file && S._fileTree) S._fileTree.refresh();
    if (file) _openFileInEditor(file.path);
    // 实时同步到磁盘
    const currentNodeId = S._ctx.currentNodeId;
    if (currentNodeId && appState.nodeMap.get(currentNodeId)) {
      const projectFolderPath = _getProjectFolderPath();
      S._vfs.writeSingleFileToDisk(projectFolderPath, currentNodeId, file.path).then((ok) => {
        if (ok) console.log('[实时同步] 已创建磁盘文件:', file.path);
      });
    }
  }
}

/**
 * 绑定 Activity Bar 按钮（容器内版本）
 */
function _bindActivityBarForContainer() {
  const activityBar = S._modal.querySelector('.sandbox-activity-bar');
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
  const closeBtn = S._modal?.querySelector('#historyCloseBtn');
  const restoreBtn = S._modal?.querySelector('#historyRestoreBtn');
  if (closeBtn) closeBtn.addEventListener('click', () => _hideHistoryPanel());
  if (restoreBtn) restoreBtn.addEventListener('click', () => _restoreHistoryVersion());
}

/**
 * 绑定容器内所有缺失的 UI 事件（initHtmlSandboxWindow 中有但 initIdeInContainer 缺失的绑定）
 */
function _bindContainerUIEvents() {
  // 控制台过滤按钮
  S._modal?.querySelectorAll('.console-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => _setConsoleFilter(btn.dataset.filter));
  });

  // 底部面板 Tab 切换
  S._modal?.querySelectorAll('.bottom-panel-tab').forEach(tab => {
    tab.addEventListener('click', () => _showBottomPanel(tab.dataset.tab));
  });

  // 窗口控制按钮
  const minBtn = S._modal?.querySelector('#sandboxMinimizeBtn');
  const maxBtn = S._modal?.querySelector('#sandboxMaximizeBtn');
  const closeBtn = S._modal?.querySelector('#sandboxCloseBtn');
  const refreshPreviewBtn = S._modal?.querySelector('#sandboxRefreshPreviewBtn');
  const mdSyncBtn = S._modal?.querySelector('#mdPreviewSyncBtn');
  const previewFullscreenBtn = S._modal?.querySelector('#previewFullscreenBtn');

  if (minBtn) minBtn.addEventListener('click', () => {
    if (Date.now() - S._openTimestamp < 300) return;
    S._windowInstance?.minimize();
  });
  if (maxBtn) maxBtn.addEventListener('click', () => S._windowInstance?.toggleMaximize());
  if (closeBtn) closeBtn.addEventListener('click', () => closeHtmlSandboxEditor());
  if (refreshPreviewBtn) refreshPreviewBtn.addEventListener('click', () => runPreview(true));
  if (mdSyncBtn) mdSyncBtn.addEventListener('click', () => _renderMarkdownPreview());
  if (previewFullscreenBtn) previewFullscreenBtn.addEventListener('click', () => _togglePreviewFullscreen());

  // 快捷键事件（由 Monaco 派发）
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

  // 点击模态框自动置顶
  if (window.WindowManager && S._modal) {
    window.WindowManager.registerElement(S._modal);
  }

  // 拖拽打开文件
  _initDragOpen();
}

/**
 * 销毁容器化 IDE，恢复原始 DOM
 */
export function destroyIdeContainer() {
  // 1. 销毁 IDE 组件
  _destroyIDEComponents();

  // 2. 清理模块级变量
  S._currentNodeId = null;
  S._ctx.currentNodeId = null;
  S._lastAutoSavePath = null;
  S._workspacePath = null;
  S._isRealFS = false;
  S._ctx.workspacePath = null;
  S._ctx.isRealFS = false;
  if (S._nodeName) S._nodeName.textContent = '';

  // 3. 清除 modal 的 id
  if (S._modal) {
    S._modal.id = '';
  }
  S._modal = null;
  S._content = null;
  S._preview = null;
  S._consoleOut = null;
  S._nodeName = null;
  S._statusText = null;

  // 4. 还原原始 #htmlSandboxModal 到 DOM
  if (S._origSandboxModal && S._origSandboxModalParent) {
    if (S._origSandboxModalNext) {
      S._origSandboxModalParent.insertBefore(S._origSandboxModal, S._origSandboxModalNext);
    } else {
      S._origSandboxModalParent.appendChild(S._origSandboxModal);
    }
    S._origSandboxModal = null;
    S._origSandboxModalParent = null;
    S._origSandboxModalNext = null;
  }

  // 4b. 还原 index.html 中独立的覆盖层
  if (S._savedOrphanOverlays) {
    for (const id of Object.keys(S._savedOrphanOverlays)) {
      const saved = S._savedOrphanOverlays[id];
      if (saved && saved.parent) {
        if (saved.next) {
          saved.parent.insertBefore(saved.el, saved.next);
        } else {
          saved.parent.appendChild(saved.el);
        }
      }
    }
    S._savedOrphanOverlays = null;
  }
}
