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
import { _updateActivityBarButtons, _toggleSidePanel } from './window-init.js';
import { _updateBreadcrumb } from './editor-lifecycle.js';
import { _realReadFile } from './real-fs.js';

// ════════════════════════════════════════════════════════════
//  IDE 组件初始化/销毁
// ════════════════════════════════════════════════════════════

export async function _initIDEComponents(node) {
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

  S._vfs = new VirtualFileSystem(treeData);
  S._vfs.expandAll();
  S._ctx.vfs = S._vfs;

  // 2. 初始化历史记录
  S._history = new SandboxHistory();
  S._history.attachToNode(S._currentNodeId);
  S._history.loadFromNode(node);
  S._ctx.history = S._history;

  // 3. 初始化文件树
  const treeContainer = document.getElementById('sandboxFileTreeContainer');
  if (treeContainer) {
    S._fileTree = new FileTreeComponent(treeContainer, S._vfs, {
      onFileSelect: (filePath) => _onFileSelect(filePath),
      onFileDelete: (path, isDir) => _onFileDelete(path, isDir),
      onFileRename: (path, newName) => _onFileRename(path, newName),
      onFileCreate: (dirPath, name, type) => _onFileCreate(dirPath, name, type),
      onFileSystemChange: () => _onFileSystemChange(),
      onOpenFileLocation: (filePath) => _onOpenFileLocation(filePath),
    });
    S._fileTree.render();
  }
  S._ctx.fileTree = S._fileTree;

  // 4. 初始化标签页
  const tabsContainer = document.getElementById('sandboxTabsContainer');
  if (tabsContainer) {
    S._fileTabs = new FileTabsComponent(tabsContainer,
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
  S._ctx.fileTabs = S._fileTabs;

  // 5. 初始化 Monaco 编辑器（传入内容变更回调用于自动运行）
  const monacoContainer = document.getElementById('sandboxMonacoContainer');
  if (monacoContainer) {
    S._monacoEditor = new SandboxMonacoEditor(
      (filePath, isDirty) => {
        if (S._fileTabs) {
          if (isDirty) S._fileTabs.markDirty(filePath);
          else S._fileTabs.markClean(filePath);
        }
      },
      (filePath) => _onContentChange(filePath)
    );
    await S._monacoEditor.init(monacoContainer);
    S._ctx.monacoEditor = S._monacoEditor;

    // 初始化状态栏模块
    if (!S._statusBarModule) {
      S._statusBarModule = new SandboxStatusBar(S._ctx);
      S._ctx.registerModule('statusBar', S._statusBarModule);
    }
    S._statusBarModule.init();

    // 初始化设置模块
    if (!S._settingsModule) {
      S._settingsModule = new SandboxSettings(S._ctx);
      S._ctx.registerModule('settings', S._settingsModule);
    }
    S._settingsModule.init();
    S._settingsModule.applyPersistedSettings();

    // 初始化面包屑模块
    if (!S._breadcrumbModule) {
      S._breadcrumbModule = new SandboxBreadcrumb(S._ctx);
      S._ctx.registerModule('breadcrumb', S._breadcrumbModule);
    }
    S._breadcrumbModule.init();

    // 初始化图片预览模块
    if (!S._imagePreviewModule) {
      S._imagePreviewModule = new SandboxImagePreview(S._ctx);
      S._ctx.registerModule('imagePreview', S._imagePreviewModule);
    }
    S._imagePreviewModule.init();

    // 初始化 Markdown 预览模块
    if (!S._markdownModule) {
      S._markdownModule = new SandboxMarkdownPreview(S._ctx);
      S._ctx.registerModule('markdown', S._markdownModule);
    }
    S._markdownModule.init();

    // 初始化分屏编辑模块
    if (!S._splitEditorModule) {
      S._splitEditorModule = new SandboxSplitEditor(S._ctx);
      S._ctx.registerModule('splitEditor', S._splitEditorModule);
    }
    S._splitEditorModule.init();

    // 初始化模板/历史面板模块
    if (!S._templateHistoryModule) {
      S._templateHistoryModule = new SandboxTemplateHistory(S._ctx);
      S._ctx.registerModule('templateHistory', S._templateHistoryModule);
    }
    S._templateHistoryModule.init();

    // 初始化 Resize 模块
    if (!S._resizeModule) {
      S._resizeModule = new SandboxResize(S._ctx);
      S._ctx.registerModule('resize', S._resizeModule);
    }
    S._resizeModule.init();

    // 初始化文件操作模块
    if (!S._fileOpsModule) {
      S._fileOpsModule = new SandboxFileOps(S._ctx);
      S._ctx.registerModule('fileOps', S._fileOpsModule);
    }
    S._fileOpsModule.init();
  }

  // 6. 初始化搜索组件
  const searchPanel = document.getElementById('sandboxSearchPanel');
  if (searchPanel) {
    S._search = new SandboxSearch(
      searchPanel,
      () => S._vfs,
      (filePath, line, col) => {
        // 打开文件并跳转
        const file = S._vfs.getFile(filePath);
        if (file) {
          _openFileInEditor(filePath);
          if (S._monacoEditor) S._monacoEditor.revealLine(filePath, line, col);
        }
        // 关闭搜索面板
        S._search.hide();
      }
    );
    S._ctx.search = S._search;

    // 重写 hide()：关闭搜索面板后自动切回资源管理器，避免侧边面板空白
    const _originalSearchHide = S._search.hide.bind(S._search);
    S._search.hide = function () {
      _originalSearchHide();
      const fileTreePanel = document.getElementById('sandboxFileTreeContainer');
      if (fileTreePanel) fileTreePanel.style.display = 'flex';
      if (S._activityBarModule) {
        S._activityBarModule._activePanel = 'explorer';
        S._activityBarModule.updateActivityBarButtons('explorer');
      }
      S._ctx.activePanel = 'explorer';
    };
  }

  // 7. 初始化终端组件
  const terminalPanel = document.getElementById('sandboxTerminalPanel');
  if (terminalPanel) {
    S._terminal = new SandboxTerminal(
      terminalPanel,
      // getCwd 回调：通过 IPC 获取 sandbox 磁盘路径（兼容未保存项目）
      async () => {
        const projectFolderPath = _getProjectFolderPath();
        const result = await window.api.terminalGetSandboxCwd(projectFolderPath, S._currentNodeId);
        return result.success ? result.cwd : null;
      },
      (statusText) => _setStatus(statusText)
    );
    S._ctx.terminal = S._terminal;
  }

  // 8. 打开入口文件
  const entryPath = S._vfs.getEntryPoint();
  if (entryPath) {
    _openFileInEditor(entryPath);
  }

  _setStatus('就绪');
}

export function _destroyIDEComponents() {
  // 关闭分屏（已迁移到 SandboxSplitEditor 模块）
  if (S._splitEditorModule) S._splitEditorModule.closeSplitEditor();

  if (S._monacoEditor) {
    S._monacoEditor.dispose();
    S._monacoEditor = null;
  }
  if (S._fileTree) {
    S._fileTree.destroy();
    S._fileTree = null;
  }
  if (S._fileTabs) {
    S._fileTabs.closeAll();
    S._fileTabs.destroy();
    S._fileTabs = null;
  }
  if (S._search) {
    S._search = null;
  }
  // 销毁终端组件（关键：kill 所有 pty 进程，避免僵尸进程）
  if (S._terminal) {
    S._terminal.destroy();
    S._terminal = null;
  }
  // 重置底部面板状态（_bottomPanelTab 已迁移到 SandboxConsole）
  const bottomTabs = document.getElementById('sandboxBottomPanelTabs');
  if (bottomTabs) bottomTabs.style.display = 'none';
  const termPanel = document.getElementById('sandboxTerminalPanel');
  if (termPanel) termPanel.style.display = 'none';
  S._vfs = null;
  S._history = null;
  // 同步清除 ctx 核心引用
  S._ctx.vfs = null;
  S._ctx.fileTree = null;
  S._ctx.fileTabs = null;
  S._ctx.monacoEditor = null;
  S._ctx.search = null;
  S._ctx.history = null;
  S._ctx.terminal = null;
  // 预览状态已迁移到 SandboxPreview 模块
  // 控制台状态已迁移到 SandboxConsole 模块
  if (S._consoleModule) { S._consoleModule.destroy(); S._consoleModule = null; }
  if (S._autoRunModule) { S._autoRunModule.destroy(); S._autoRunModule = null; }
  if (S._previewModule) { S._previewModule.destroy(); S._previewModule = null; }
  if (S._menuBarModule) { S._menuBarModule.destroy(); S._menuBarModule = null; }
  if (S._activityBarModule) { S._activityBarModule.destroy(); S._activityBarModule = null; }
  if (S._statusBarModule) { S._statusBarModule.destroy(); S._statusBarModule = null; }
  if (S._settingsModule) { S._settingsModule.destroy(); S._settingsModule = null; }
  if (S._breadcrumbModule) { S._breadcrumbModule.destroy(); S._breadcrumbModule = null; }
  if (S._imagePreviewModule) { S._imagePreviewModule.destroy(); S._imagePreviewModule = null; }
  if (S._markdownModule) { S._markdownModule.destroy(); S._markdownModule = null; }
  if (S._splitEditorModule) { S._splitEditorModule.destroy(); S._splitEditorModule = null; }
  if (S._templateHistoryModule) { S._templateHistoryModule.destroy(); S._templateHistoryModule = null; }
  if (S._resizeModule) { S._resizeModule.destroy(); S._resizeModule = null; }
  if (S._fileOpsModule) { S._fileOpsModule.destroy(); S._fileOpsModule = null; }
  if (S._githubImportModule) { S._githubImportModule.destroy(); S._githubImportModule = null; }
  // 兼容旧变量引用
  S._lastPreviewFiles.clear();
  S._lastPreviewHtml = '';
  S._isRunningPreview = false;
  S._previewFullscreen = false;

  // 重置状态栏
  // 状态栏已迁移到 SandboxStatusBar 模块

  // 重置图片预览（已迁移到 SandboxImagePreview 模块）
  if (S._imagePreviewModule) S._imagePreviewModule.closeImagePreview();

  // 退出 Markdown 模式（已迁移到 SandboxMarkdownPreview 模块）
  if (S._markdownModule) S._markdownModule.exitMarkdownMode();

  // 清理面包屑下拉（已迁移到 SandboxBreadcrumb 模块）

  // 重置预览标签状态
  S._ctx.isPreviewTab = false;
  S._ctx.activePanel = 'explorer';

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

export async function _openFileInEditor(filePath) {
  // 真实文件系统模式：从磁盘读取文件内容
  if (S._isRealFS && S._workspacePath && window.api?.ideReadFile) {
    const result = await _realReadFile(filePath);
    if (result && result.type === 'text') {
      S._vfs.setFile(filePath, result.content);
    } else if (result && result.type === 'image' && result.dataUrl) {
      S._vfs.setFile(filePath, result.dataUrl);
      // 图片文件的 content 是 dataUrl，不应标记为脏（防止保存时损坏磁盘文件）
      const imgFile = S._vfs.getFile(filePath);
      if (imgFile) imgFile.isDirty = false;
    }
  }
  if (S._fileOpsModule) S._fileOpsModule.openFileInEditor(filePath);
  _hideWelcomePage();
}

export async function _onFileSelect(filePath) {
  // 防止同一文件的重复调用（由 openImagePreview → fileTabs.openTab → setActive → _onTabSelect 触发的重入）
  if (S._openingFilePath === filePath) {
    console.log('[IDE _onFileSelect] 跳过重入调用:', filePath);
    return;
  }
  S._openingFilePath = filePath;
  try {
    console.log('[IDE _onFileSelect] 开始, filePath:', filePath);
    // 真实文件系统模式：从磁盘读取文件内容
    if (S._isRealFS && S._workspacePath && window.api?.ideReadFile) {
      const result = await _realReadFile(filePath);
      console.log('[IDE _onFileSelect] _realReadFile 结果:', filePath, 'type:', result?.type, 'dataUrl长度:', result?.dataUrl?.length, 'content长度:', result?.content?.length);
      if (result && result.type === 'text') {
        S._vfs.setFile(filePath, result.content);
      } else if (result && result.type === 'image' && result.dataUrl) {
        S._vfs.setFile(filePath, result.dataUrl);
        // 图片文件的 content 是 dataUrl（用于显示），不是磁盘原始二进制内容，
        // 不应标记为脏（否则保存时会把 dataUrl 文本写入磁盘，损坏图片文件）
        const imgFile = S._vfs.getFile(filePath);
        if (imgFile) imgFile.isDirty = false;
      }
      // 验证 VFS 中的内容
      const vfsFile = S._vfs.getFile(filePath);
      console.log('[IDE _onFileSelect] VFS 验证:', filePath, 'file存在:', !!vfsFile, 'content长度:', vfsFile?.content?.length, 'content前缀:', vfsFile?.content?.substring(0, 30));
    }
    if (S._fileOpsModule) S._fileOpsModule.onFileSelect(filePath);
    console.log('[IDE _onFileSelect] 完成:', filePath);
  } finally {
    if (S._openingFilePath === filePath) {
      S._openingFilePath = null;
    }
  }
}

export function _onTabClose(filePath) {
  if (S._fileOpsModule) S._fileOpsModule.onTabClose(filePath);
}

function _onCloseOthers(keepPath) {
  if (S._fileOpsModule) S._fileOpsModule.onCloseOthers(keepPath);
}

function _onCloseAll() {
  if (S._fileOpsModule) S._fileOpsModule.onCloseAll();
}

function _onCloseSaved() {
  if (S._fileOpsModule) S._fileOpsModule.onCloseSaved();
}

export function _onOpenFileLocation(filePath) {
  // 真实文件系统模式：使用 shell.showItemInFolder 打开文件所在位置
  if (S._isRealFS && S._workspacePath) {
    // 构建完整路径：S._workspacePath + filePath
    // filePath 格式为 "dir/file.ext" 或 "file.ext"（VFS 使用 / 分隔符）
    // 需要将 VFS 路径的分隔符转换为系统原生分隔符
    const sep = S._workspacePath.endsWith('/') || S._workspacePath.endsWith('\\') ? '' : '\\';
    // 将 VFS 的 / 替换为 Windows 的 \
    const normalizedPath = filePath.replace(/\//g, '\\');
    const fullPath = S._workspacePath + sep + normalizedPath;
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
  if (S._fileOpsModule) S._fileOpsModule.onCopyPath(filePath);
}

function _onRevealInTree(filePath) {
  if (S._fileOpsModule) S._fileOpsModule.onRevealInTree(filePath);
}

export function _onFileDelete(path, isDirectory) {
  if (S._fileOpsModule) S._fileOpsModule.onFileDelete(path, isDirectory);
}

export function _onFileRename(path, newName) {
  if (S._fileOpsModule) S._fileOpsModule.onFileRename(path, newName);
}

export function _onFileCreate(dirPath, name, type) {
  if (S._fileOpsModule) S._fileOpsModule.onFileCreate(dirPath, name, type);
}

export function _onFileSystemChange() {
  if (S._fileOpsModule) S._fileOpsModule.onFileSystemChange();
}

export function _setStatus(text) {
  if (S._statusText) S._statusText.textContent = text;
}

export function _getProjectFolderPath() {
  const proj = appState.projects?.find(p => p.id === appState.currentProjectId);
  return proj?.folderPath || null;
}
