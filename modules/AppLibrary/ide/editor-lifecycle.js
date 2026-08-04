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
import { initHtmlSandboxWindow, _initFeatureModules, _updateActivityBarButtons } from './window-init.js';
import { _initIDEComponents, _destroyIDEComponents, _getProjectFolderPath } from './ide-components.js';

// ════════════════════════════════════════════════════════════
//  打开/关闭编辑器
// ════════════════════════════════════════════════════════════

export async function openHtmlSandboxEditor(nodeId, isQuickNote) {
  // 快速笔记分支：从 appState.quickNotes 获取，跳过磁盘路径 IPC
  if (isQuickNote) {
    const note = appState.quickNotes.find(n => n.id === nodeId);
    if (!note) {
      console.error('[openHtmlSandboxEditor] 快速笔记不存在:', nodeId);
      return;
    }
    // 确保 fileSystem 存在
    if (!note.fileSystem) {
      note.fileSystem = migrateHtmlSource(null);
      note.activeMode = 'code';
      if (appState.saveQuickNotes) appState.saveQuickNotes();
    }

    // 回退到旧 IDE（不使用磁盘 sandboxPath）
    initHtmlSandboxWindow();
    _initFeatureModules();
    S._currentNodeId = nodeId;
    S._ctx.currentNodeId = nodeId;
    S._openTimestamp = Date.now();
    if (S._nodeName) S._nodeName.textContent = note.title || '快速笔记代码编辑器';
    _clearConsole();

    // 任务栏
    if (window.Taskbar) {
      window.Taskbar.addOrUpdateEditor('html-sandbox', {
        label: note.title || '快速笔记代码编辑器',
        icon: '💻',
        active: true,
        activate: () => {
          if (!S._windowInstance) return;
          if (S._windowInstance.getState() === WindowState.MINIMIZED) {
            S._windowInstance.restore();
            WindowManager.bringToFront(S._windowInstance);
          } else {
            S._windowInstance.minimize();
          }
        },
        close: () => closeHtmlSandboxEditor()
      });
    }

    S._windowInstance.open(WindowState.MAXIMIZED);
    await _initIDEComponents(note);
    S._ctx.activePanel = 'explorer';
    S._ctx.isPreviewTab = false;
    _updateActivityBarButtons('explorer');
    return;
  }

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

  S._currentNodeId = nodeId;
  S._ctx.currentNodeId = nodeId;  // 同步到上下文，供 file-ops/auto-run 等模块读取
  S._openTimestamp = Date.now();

  if (S._nodeName) S._nodeName.textContent = node ? node.name : '';

  // 清空控制台
  _clearConsole();

  // 添加到任务栏
  if (window.Taskbar) {
    window.Taskbar.addOrUpdateEditor('html-sandbox', {
      label: node ? node.name : '代码编辑器',
      icon: '💻',
      active: true,
      activate: () => {
        if (!S._windowInstance) return;
        // 设置模态框标准：可见时最小化，最小化时恢复
        if (S._windowInstance.getState() === WindowState.MINIMIZED) {
          S._windowInstance.restore();
          WindowManager.bringToFront(S._windowInstance);
        } else {
          S._windowInstance.minimize();
        }
      },
      close: () => closeHtmlSandboxEditor()
    });
  }

  // 打开窗口
  S._windowInstance.open(WindowState.MAXIMIZED);

  // 初始化 IDE 组件
  await _initIDEComponents(node);

  // 重置面板状态
  S._ctx.activePanel = 'explorer';
  S._ctx.isPreviewTab = false;
  _updateActivityBarButtons('explorer');
}

export function closeHtmlSandboxEditor() {
  if (!S._windowInstance) return;
  _destroyIDEComponents();
  S._windowInstance.close();
  S._currentNodeId = null;
  S._ctx.currentNodeId = null;
  if (S._nodeName) S._nodeName.textContent = '';
  if (window.Taskbar) window.Taskbar.removeEditor('html-sandbox');
}

// ════════════════════════════════════════════════════════════
//  性能优化：暂停/恢复预览 iframe（已迁移到 SandboxPreview）
// ════════════════════════════════════════════════════════════

export function _pausePreview() {
  if (S._previewModule) S._previewModule.pausePreview();
}

export function _resumePreview() {
  if (S._previewModule) S._previewModule.resumePreview();
}

// ════════════════════════════════════════════════════════════
//  代码运行与保存（预览部分已迁移到 SandboxPreview，此处保留委托）
// ════════════════════════════════════════════════════════════

export async function runPreview(forceFullReload = true) {
  if (S._previewModule) await S._previewModule.runPreview(forceFullReload);
}

function _injectConsoleRedirect(html) {
  return S._previewModule ? S._previewModule._injectConsoleRedirect(html) : html;
}

function _consoleRedirectCode() {
  return S._previewModule ? S._previewModule._consoleRedirectCode() : '';
}

function _hotUpdateListenerCode() {
  return S._previewModule ? S._previewModule._hotUpdateListenerCode() : '';
}

export function saveHtmlSource() {
  if (S._fileOpsModule) S._fileOpsModule.saveHtmlSource();
}

function syncToNote() {
  if (S._fileOpsModule) S._fileOpsModule.syncToNote();
}

function exportAsHtml() {
  if (S._fileOpsModule) S._fileOpsModule.exportAsHtml();
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
  iframe.style.cssText = 'width:100%; height:100%; border:none; background:#0d1b23;';
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

export function _updateStatusBar() {
  if (S._statusBarModule) S._statusBarModule.update();
}

function _toggleMinimap() {
  if (S._statusBarModule) S._statusBarModule.toggleMinimap();
}

// ════════════════════════════════════════════════════════════
//  设置面板（已迁移到 SandboxSettings，此处保留委托）
// ════════════════════════════════════════════════════════════

function _showSettingsPanel() {
  if (S._settingsModule) S._settingsModule.showSettingsPanel();
}

// ════════════════════════════════════════════════════════════
//  命令面板（已迁移到 SandboxCommands，此处保留委托）
// ════════════════════════════════════════════════════════════

export function _initCommandPalette() {
  if (!S._commandsModule) {
    S._commandsModule = new SandboxCommands(S._ctx);
    S._ctx.registerModule('commands', S._commandsModule);
  }
  S._commandsModule.init();
}

export function _showCommandPalette() {
  if (S._commandsModule) S._commandsModule.show();
}

/** 跳转到指定行（弹出行号输入框） */
function _gotoLine() {
  if (!S._monacoEditor) return;
  const lineStr = prompt('跳转到行号:', '1');
  if (lineStr === null) return;
  const line = parseInt(lineStr, 10);
  if (isNaN(line) || line < 1) return;
  const filePath = S._monacoEditor.getCurrentFilePath();
  if (filePath) S._monacoEditor.revealLine(filePath, line, 1);
}

export function _executeCommandAction(action) {
  // 命令分发：优先使用 ctx action 注册表，回退到本地处理
  const result = S._ctx.executeAction(action);
  if (result !== undefined) return;

  // 本地回退：处理尚未迁移到模块的 action
  switch (action) {
    case 'openFolder':   _openRealFolder(); break;
    case 'importLocalFolder': _importLocalFolder(); break;
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
    case 'toggleBookmark': if (S._monacoEditor) S._monacoEditor.toggleBookmark(); _updateStatusBar(); break;
    case 'nextBookmark':   if (S._monacoEditor) S._monacoEditor.nextBookmark(); break;
    case 'prevBookmark':   if (S._monacoEditor) S._monacoEditor.prevBookmark(); break;
    case 'clearBookmarks': if (S._monacoEditor) S._monacoEditor.clearBookmarks(); _updateStatusBar(); break;
    case 'showPreview':     _activatePreviewTab(); break;
    case 'zoomIn':        if (S._monacoEditor) S._monacoEditor.zoomFont(1); _updateStatusBar(); break;
    case 'zoomOut':       if (S._monacoEditor) S._monacoEditor.zoomFont(-1); _updateStatusBar(); break;
    case 'zoomReset':     if (S._monacoEditor) S._monacoEditor.setFontSize(14); _updateStatusBar(); break;
  }
}

// ════════════════════════════════════════════════════════════
//  面包屑导航（已迁移到 SandboxBreadcrumb，此处保留委托）
// ════════════════════════════════════════════════════════════

export function _updateBreadcrumb(filePath) {
  if (S._breadcrumbModule) S._breadcrumbModule.updateBreadcrumb(filePath);
}

// ════════════════════════════════════════════════════════════
//  图片预览（已迁移到 SandboxImagePreview，此处保留委托）
// ════════════════════════════════════════════════════════════

function _isImageFile(filePath) {
  return SandboxImagePreview.isImageFile(filePath);
}

function _openImagePreview(filePath) {
  if (S._imagePreviewModule) S._imagePreviewModule.openImagePreview(filePath);
}

export function _closeImagePreview() {
  if (S._imagePreviewModule) S._imagePreviewModule.closeImagePreview();
}

// ════════════════════════════════════════════════════════════
//  Markdown 预览（已迁移到 SandboxMarkdownPreview，此处保留委托）
// ════════════════════════════════════════════════════════════

function _isMarkdownFile(filePath) {
  return SandboxMarkdownPreview.isMarkdownFile(filePath);
}

function _enterMarkdownMode() {
  if (S._markdownModule) S._markdownModule.enterMarkdownMode();
}

export function _exitMarkdownMode() {
  if (S._markdownModule) S._markdownModule.exitMarkdownMode();
}

export function _renderMarkdownPreview() {
  if (S._markdownModule) S._markdownModule.renderMarkdownPreview();
}

// ════════════════════════════════════════════════════════════
//  分屏编辑（已迁移到 SandboxSplitEditor，此处保留委托）
// ════════════════════════════════════════════════════════════

async function _toggleSplitEditor() {
  if (S._splitEditorModule) await S._splitEditorModule.toggleSplitEditor();
}

async function _onSplitRight(filePath) {
  if (S._splitEditorModule) await S._splitEditorModule.onSplitRight(filePath);
}

window.getSandboxHtml = getSandboxHtml;
