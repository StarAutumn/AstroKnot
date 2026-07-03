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
import { saveCurrentProjectData } from '../../module2_TreeData.js';
import { showToast } from '../../module5_SelectAndEdit.js';
import { VirtualFileSystem, migrateHtmlSource } from './sandbox-virtual-fs.js';
import { FileTreeComponent } from './sandbox-file-tree.js';
import { FileTabsComponent } from './sandbox-tabs.js';
import { SandboxMonacoEditor } from './sandbox-monaco-editor.js';
import { needsEsbuild, buildBundledHtml } from './sandbox-bundler.js';
import { getTemplates, applyTemplate } from './sandbox-templates.js';
import { SandboxHistory } from './sandbox-history.js';
import { SandboxSearch } from './sandbox-search.js';

// ════════════════════════════════════════════════════════════
//  DOM 元素引用
// ════════════════════════════════════════════════════════════
const _modal = document.getElementById('htmlSandboxModal');
const _content = _modal ? _modal.querySelector('.rich-modal-content') : null;
const _preview = document.getElementById('htmlSandboxPreview');
const _consoleOut = document.getElementById('htmlConsoleOutput');
const _nodeName = document.getElementById('htmlSandboxNodeName');
const _statusText = document.getElementById('sandboxStatusText');

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

// 预览缓存
let _lastPreviewHtml = '';
let _consoleListener = null;

// 自动运行
let _autoRunEnabled = true;
let _autoRunTimer = null;
const AUTO_RUN_DEBOUNCE = 800;

// 控制台状态
let _consoleFilter = 'all';
let _consoleCounts = { log: 0, error: 0, warn: 0, info: 0 };
let _consoleLines = []; // 缓存所有日志行用于过滤

// 全屏预览状态
let _previewFullscreen = false;

// 热注入：记录上次预览时各文件的内容
let _lastPreviewFiles = new Map(); // path → content

// 模板/历史面板引用
let _templateModal = null;
let _historyPanel = null;

// ════════════════════════════════════════════════════════════
//  初始化窗口管理器
// ════════════════════════════════════════════════════════════
function initHtmlSandboxWindow() {
  if (!_modal || !_content) return;
  if (_windowInstance) return;  // 已初始化

  _templateModal = document.getElementById('sandboxTemplateModal');
  _historyPanel = document.getElementById('sandboxHistoryPanel');

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
      // 退出全屏预览
      if (_previewFullscreen) _togglePreviewFullscreen();
      _pausePreview();
      _currentNodeId = null;
      if (_nodeName) _nodeName.textContent = '';
      window._pause3DAnimation = false;
      // 销毁 IDE 组件
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
  const runBtn = document.getElementById('runSandboxBtn');
  const saveBtn = document.getElementById('saveSandboxBtn');
  const syncBtn = document.getElementById('syncSandboxBtn');
  const exportBtn = document.getElementById('exportSandboxBtn');
  const toggleConsoleBtn = document.getElementById('toggleConsoleBtn');
  const clearConsoleBtn = document.getElementById('clearConsoleBtn');
  const refreshPreviewBtn = document.getElementById('sandboxRefreshPreviewBtn');
  const searchBtn = document.getElementById('searchSandboxBtn');
  const templateBtn = document.getElementById('templateSandboxBtn');
  const historyBtn = document.getElementById('historySandboxBtn');
  const autoRunBtn = document.getElementById('autoRunToggleBtn');

  if (minBtn) minBtn.addEventListener('click', () => {
    if (Date.now() - _openTimestamp < 300) return;
    _windowInstance.minimize();
  });
  if (maxBtn) maxBtn.addEventListener('click', () => _windowInstance.toggleMaximize());
  if (closeBtn) closeBtn.addEventListener('click', () => closeHtmlSandboxEditor());
  if (runBtn) runBtn.addEventListener('click', () => runPreview(true));
  if (saveBtn) saveBtn.addEventListener('click', () => saveHtmlSource());
  if (syncBtn) syncBtn.addEventListener('click', () => syncToNote());
  if (exportBtn) exportBtn.addEventListener('click', () => exportAsHtml());
  if (toggleConsoleBtn) toggleConsoleBtn.addEventListener('click', () => _toggleConsole());
  if (clearConsoleBtn) clearConsoleBtn.addEventListener('click', () => _clearConsole());
  if (refreshPreviewBtn) refreshPreviewBtn.addEventListener('click', () => runPreview(true));
  if (searchBtn) searchBtn.addEventListener('click', () => _toggleSearch());
  if (templateBtn) templateBtn.addEventListener('click', () => _showTemplateModal());
  if (historyBtn) historyBtn.addEventListener('click', () => _showHistoryPanel());
  if (autoRunBtn) autoRunBtn.addEventListener('click', () => _toggleAutoRun());

  // 控制台过滤按钮
  document.querySelectorAll('.console-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => _setConsoleFilter(btn.dataset.filter));
  });

  // 预览模式按钮
  const previewFullscreenBtn = document.getElementById('previewFullscreenBtn');
  if (previewFullscreenBtn) previewFullscreenBtn.addEventListener('click', () => _togglePreviewFullscreen());

  // ESC 退出全屏预览
  document.addEventListener('keydown', _onFullscreenKeydown);

  // 模板/历史面板关闭
  const templateCloseBtn = document.getElementById('templateCloseBtn');
  const historyCloseBtn = document.getElementById('historyCloseBtn');
  const historyRestoreBtn = document.getElementById('historyRestoreBtn');
  if (templateCloseBtn) templateCloseBtn.addEventListener('click', () => _hideTemplateModal());
  if (historyCloseBtn) historyCloseBtn.addEventListener('click', () => _hideHistoryPanel());
  if (historyRestoreBtn) historyRestoreBtn.addEventListener('click', () => _restoreHistoryVersion());

  // 置顶
  _modal.addEventListener('mousedown', () => {
    WindowManager.bringToFront(_windowInstance);
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
  document.addEventListener('sandbox-toggle-console', () => _toggleConsole());
  document.addEventListener('sandbox-global-search', () => _toggleSearch());
  document.addEventListener('sandbox-quick-open', () => _showQuickOpen());

  // 控制台消息监听（只注册一次）
  _initConsoleListener();

  // Resize 分隔条
  _initResizeHandles();
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
//  控制台消息监听（支持对象展开/过滤/计数）
// ════════════════════════════════════════════════════════════
function _initConsoleListener() {
  window.addEventListener('message', (e) => {
    if (!e.data || e.data.type !== 'sandbox-console') return;
    if (!_consoleOut) return;

    const level = e.data.level || 'log';
    const args = e.data.args || [{ type: 'string', value: e.data.message || '' }];

    _addConsoleLine(level, args);
  });
}

function _addConsoleLine(level, args) {
  const time = new Date();
  const timeStr = String(time.getHours()).padStart(2,'0') + ':' +
                  String(time.getMinutes()).padStart(2,'0') + ':' +
                  String(time.getSeconds()).padStart(2,'0');

  const line = document.createElement('div');
  line.className = 'console-line level-' + level;
  line.dataset.level = level;

  const icon = level === 'error' ? '✕' : level === 'warn' ? '⚠' : level === 'info' ? 'ℹ' : '›';

  const timeEl = document.createElement('span');
  timeEl.className = 'console-time';
  timeEl.textContent = timeStr;

  const iconEl = document.createElement('span');
  iconEl.className = 'console-icon';
  iconEl.textContent = icon;

  const contentEl = document.createElement('span');
  contentEl.className = 'console-content';
  args.forEach((arg, idx) => {
    if (idx > 0) contentEl.appendChild(document.createTextNode(' '));
    contentEl.appendChild(_renderConsoleArg(arg));
  });

  line.appendChild(timeEl);
  line.appendChild(iconEl);
  line.appendChild(contentEl);

  // 缓存用于过滤
  _consoleLines.push(line);

  // 计数
  _consoleCounts[level] = (_consoleCounts[level] || 0) + 1;
  _updateConsoleCounts();

  // 根据过滤决定是否显示
  if (_consoleFilter === 'all' || _consoleFilter === level) {
    _consoleOut.appendChild(line);
    _consoleOut.scrollTop = _consoleOut.scrollHeight;
  }
}

function _renderConsoleArg(arg) {
  if (!arg || typeof arg !== 'object') {
    return document.createTextNode(String(arg));
  }

  const type = arg.type;
  const value = arg.value;

  if (type === 'string') {
    return document.createTextNode(value);
  }
  if (type === 'number') {
    const span = document.createElement('span');
    span.className = 'console-obj-number';
    span.textContent = value;
    return span;
  }
  if (type === 'boolean') {
    const span = document.createElement('span');
    span.className = 'console-obj-bool';
    span.textContent = value;
    return span;
  }
  if (type === 'null') {
    const span = document.createElement('span');
    span.className = 'console-obj-null';
    span.textContent = value;
    return span;
  }
  if (type === 'function') {
    const span = document.createElement('span');
    span.style.color = '#fc8';
    span.textContent = value;
    return span;
  }

  // 对象/数组：可展开
  return _renderExpandable(arg);
}

function _renderExpandable(arg) {
  const wrapper = document.createElement('span');
  const toggle = document.createElement('span');
  toggle.className = 'console-obj-toggle';
  toggle.textContent = '▶ ';

  const preview = document.createElement('span');
  const children = document.createElement('div');
  children.className = 'console-obj-children';
  children.style.display = 'none';

  const isArr = arg.type === 'array';
  const val = arg.value;

  if (isArr) {
    preview.textContent = '[' + (val.length) + ']';
    val.forEach((item, idx) => {
      const row = document.createElement('div');
      const key = document.createElement('span');
      key.className = 'console-obj-key';
      key.textContent = idx + ': ';
      row.appendChild(key);
      row.appendChild(_renderConsoleArg(item));
      children.appendChild(row);
    });
  } else {
    const keys = Object.keys(val);
    preview.textContent = '{' + keys.length + ' keys}';
    keys.forEach(k => {
      const row = document.createElement('div');
      const key = document.createElement('span');
      key.className = 'console-obj-key';
      key.textContent = k + ': ';
      row.appendChild(key);
      row.appendChild(_renderConsoleArg(val[k]));
      children.appendChild(row);
    });
  }

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const isHidden = children.style.display === 'none';
    children.style.display = isHidden ? 'block' : 'none';
    toggle.textContent = isHidden ? '▼ ' : '▶ ';
  });

  wrapper.appendChild(toggle);
  wrapper.appendChild(preview);
  wrapper.appendChild(children);
  return wrapper;
}

function _setConsoleFilter(filter) {
  _consoleFilter = filter;
  document.querySelectorAll('.console-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
  });
  // 重新渲染
  _consoleOut.innerHTML = '';
  for (const line of _consoleLines) {
    if (filter === 'all' || line.dataset.level === filter) {
      _consoleOut.appendChild(line);
    }
  }
  _consoleOut.scrollTop = _consoleOut.scrollHeight;
}

function _updateConsoleCounts() {
  document.querySelectorAll('.filter-count').forEach(el => {
    const cnt = el.dataset.count;
    if (cnt === 'all') {
      el.textContent = _consoleLines.length;
    } else {
      el.textContent = _consoleCounts[cnt] || 0;
    }
  });
  // 错误徽标
  const badge = document.getElementById('consoleErrorBadge');
  if (badge) {
    const errCount = _consoleCounts.error || 0;
    if (errCount > 0) {
      badge.textContent = errCount > 99 ? '99+' : errCount;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  }
}

function _clearConsole() {
  if (_consoleOut) _consoleOut.textContent = '';
  _consoleLines = [];
  _consoleCounts = { log: 0, error: 0, warn: 0, info: 0 };
  _updateConsoleCounts();
}

function _toggleConsole() {
  const panel = document.getElementById('sandboxConsolePanel');
  if (!panel) return;
  if (panel.style.display === 'none' || !panel.style.display) {
    panel.style.display = 'flex';
  } else {
    panel.style.display = 'none';
  }
  if (_monacoEditor) setTimeout(() => _monacoEditor.layout(), 50);
}

// ════════════════════════════════════════════════════════════
//  自动运行
// ════════════════════════════════════════════════════════════
function _toggleAutoRun() {
  _autoRunEnabled = !_autoRunEnabled;
  const btn = document.getElementById('autoRunToggleBtn');
  if (btn) btn.classList.toggle('active', _autoRunEnabled);
  if (!_autoRunEnabled && _autoRunTimer) {
    clearTimeout(_autoRunTimer);
    _autoRunTimer = null;
  }
  _setStatus(_autoRunEnabled ? '自动运行已开启' : '自动运行已关闭');
}

function _onContentChange(filePath) {
  if (!_autoRunEnabled) return;
  if (_autoRunTimer) clearTimeout(_autoRunTimer);
  _autoRunTimer = setTimeout(() => {
    _autoRunTimer = null;
    runPreview(false);
  }, AUTO_RUN_DEBOUNCE);
}

// ════════════════════════════════════════════════════════════
//  全屏预览
// ════════════════════════════════════════════════════════════
function _togglePreviewFullscreen() {
  _previewFullscreen = !_previewFullscreen;
  const area = _content ? _content.querySelector('.sandbox-preview-area') : null;
  if (area) {
    area.classList.toggle('fullscreen-mode', _previewFullscreen);
  }

  // 更新原始按钮图标
  const btn = document.getElementById('previewFullscreenBtn');
  if (btn) {
    btn.textContent = _previewFullscreen ? '✕' : '⛶';
    btn.title = _previewFullscreen ? '退出全屏 (ESC)' : '全屏预览';
    btn.classList.toggle('exit-fullscreen', _previewFullscreen);
  }

  // 全屏时在 body 上添加浮动退出按钮（避免被父元素 CSS 干扰）
  const exitBtn = document.getElementById('sandboxFullscreenExit');
  if (_previewFullscreen) {
    if (!exitBtn) {
      const el = document.createElement('button');
      el.id = 'sandboxFullscreenExit';
      el.className = 'sandbox-fullscreen-exit';
      el.innerHTML = '✕ 退出全屏';
      el.title = '退出全屏 (ESC)';
      el.addEventListener('click', () => _togglePreviewFullscreen());
      document.body.appendChild(el);
    }
  } else {
    if (exitBtn) exitBtn.remove();
  }

  if (_monacoEditor) setTimeout(() => _monacoEditor.layout(), 50);
}

function _onFullscreenKeydown(e) {
  if (e.key === 'Escape' && _previewFullscreen) {
    _togglePreviewFullscreen();
  }
}

// ════════════════════════════════════════════════════════════
//  全局搜索
// ════════════════════════════════════════════════════════════
function _toggleSearch() {
  if (!_search) return;
  _search.toggle();
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
//  模板选择器
// ════════════════════════════════════════════════════════════
function _showTemplateModal() {
  if (!_templateModal || !_vfs) return;
  const grid = document.getElementById('templateGrid');
  if (!grid) return;

  grid.innerHTML = '';
  for (const tpl of getTemplates()) {
    const card = document.createElement('div');
    card.className = 'template-card';
    card.innerHTML =
      '<div class="tpl-icon">' + tpl.icon + '</div>' +
      '<div class="tpl-name">' + tpl.name + '</div>' +
      '<div class="tpl-desc">' + tpl.desc + '</div>' +
      '<div class="tpl-files">' + tpl.files.length + ' 个文件</div>';
    card.addEventListener('click', () => {
      _applyTemplate(tpl);
      _hideTemplateModal();
    });
    grid.appendChild(card);
  }

  _templateModal.style.display = 'flex';
}

function _hideTemplateModal() {
  if (_templateModal) _templateModal.style.display = 'none';
}

function _applyTemplate(template) {
  if (!_vfs) return;
  const createdPaths = applyTemplate(_vfs, template, '');
  if (_fileTree) _fileTree.refresh();
  // 打开第一个创建的文件
  if (createdPaths.length > 0) {
    _openFileInEditor(createdPaths[0]);
  }
  _setStatus('已从模板创建 ' + createdPaths.length + ' 个文件');
  showToast('✅ 已创建模板: ' + template.name);
  // 触发自动运行
  if (_autoRunEnabled) runPreview(false);
}

// ════════════════════════════════════════════════════════════
//  本地历史记录
// ════════════════════════════════════════════════════════════
let _historySelectedFile = null;
let _historySelectedVersion = null;

function _showHistoryPanel() {
  if (!_historyPanel || !_history) return;
  _renderHistoryFiles();
  _historyPanel.style.display = 'flex';
}

function _hideHistoryPanel() {
  if (_historyPanel) _historyPanel.style.display = 'none';
}

function _renderHistoryFiles() {
  const listEl = document.getElementById('historyFileList');
  if (!listEl) return;
  const files = _history.getFiles();
  if (files.length === 0) {
    listEl.innerHTML = '<div class="history-empty">暂无历史记录<br><small>保存文件后会自动记录</small></div>';
    return;
  }
  listEl.innerHTML = '';
  for (const f of files) {
    const versions = _history.getVersions(f);
    const last = versions[versions.length - 1];
    const item = document.createElement('div');
    item.className = 'history-list-item';
    if (f === _historySelectedFile) item.classList.add('active');
    item.innerHTML =
      '<div class="h-name">' + f + '</div>' +
      '<div class="h-time">' + versions.length + ' 个版本 · ' + _formatTime(last.timestamp) + '</div>';
    item.addEventListener('click', () => {
      _historySelectedFile = f;
      _renderHistoryFiles();
      _renderHistoryVersions();
    });
    listEl.appendChild(item);
  }
}

function _renderHistoryVersions() {
  const listEl = document.getElementById('historyVersionList');
  const diffEl = document.getElementById('historyDiffView');
  if (!listEl) return;
  if (!_historySelectedFile) {
    listEl.innerHTML = '<div class="history-empty">请选择文件</div>';
    if (diffEl) diffEl.innerHTML = '';
    return;
  }
  const versions = _history.getVersions(_historySelectedFile);
  if (versions.length === 0) {
    listEl.innerHTML = '<div class="history-empty">无版本</div>';
    return;
  }
  listEl.innerHTML = '';
  // 倒序显示（最新在上）
  for (let i = versions.length - 1; i >= 0; i--) {
    const v = versions[i];
    const item = document.createElement('div');
    item.className = 'history-list-item';
    if (v.timestamp === _historySelectedVersion) item.classList.add('active');
    const actionLabel = v.action === 'auto' ? '自动' : v.action === 'manual' ? '手动' : '保存';
    item.innerHTML =
      '<div class="h-name">v' + (i + 1) + ' · ' + actionLabel + '</div>' +
      '<div class="h-time">' + _formatTime(v.timestamp) + '</div>';
    item.addEventListener('click', () => {
      _historySelectedVersion = v.timestamp;
      _renderHistoryVersions();
      _renderHistoryDiff();
    });
    listEl.appendChild(item);
  }
}

function _renderHistoryDiff() {
  const diffEl = document.getElementById('historyDiffView');
  const restoreBtn = document.getElementById('historyRestoreBtn');
  if (!diffEl) return;
  if (!_historySelectedFile || !_historySelectedVersion) {
    diffEl.innerHTML = '<div class="history-empty">请选择版本</div>';
    if (restoreBtn) restoreBtn.style.display = 'none';
    return;
  }

  // 获取当前文件内容
  let currentContent = '';
  if (_monacoEditor) {
    currentContent = _monacoEditor.getContent(_historySelectedFile);
  }
  if (!currentContent && _vfs) {
    const f = _vfs.getFile(_historySelectedFile);
    if (f) currentContent = f.content;
  }

  const diff = _history.diffWithCurrent(_historySelectedFile, _historySelectedVersion, currentContent);
  if (diff.length === 0) {
    diffEl.innerHTML = '<div class="history-empty">无差异</div>';
  } else {
    let html = '';
    for (const line of diff) {
      const cls = line.type === 'add' ? 'diff-line-add' :
                  line.type === 'del' ? 'diff-line-del' :
                  line.type === 'meta' ? 'diff-line-meta' : 'diff-line-ctx';
      html += '<div class="' + cls + '">' + _escapeHtml(line.text) + '</div>';
    }
    diffEl.innerHTML = html;
  }
  if (restoreBtn) restoreBtn.style.display = 'inline-block';
}

function _restoreHistoryVersion() {
  if (!_historySelectedFile || !_historySelectedVersion || !_vfs) return;
  const content = _history.getVersionContent(_historySelectedFile, _historySelectedVersion);
  if (content == null) return;

  // 恢复到 VFS
  _vfs.setFile(_historySelectedFile, content);

  // 恢复到 Monaco（直接设置 model 内容）
  if (_monacoEditor) {
    // 确保文件已打开
    const file = _vfs.getFile(_historySelectedFile);
    if (file) {
      const isOpen = _monacoEditor.getCurrentFilePath() === _historySelectedFile;
      if (!isOpen) _openFileInEditor(_historySelectedFile);
      _monacoEditor.setFileContent(_historySelectedFile, content);
    }
  }

  // 刷新文件树
  if (_fileTree) _fileTree.refresh();

  showToast('✅ 已恢复 ' + _historySelectedFile);
  _setStatus('已恢复历史版本');
  _hideHistoryPanel();

  // 重新预览
  if (_autoRunEnabled) runPreview(false);
}

function _formatTime(ts) {
  const d = new Date(ts);
  return String(d.getMonth()+1).padStart(2,'0') + '/' +
         String(d.getDate()).padStart(2,'0') + ' ' +
         String(d.getHours()).padStart(2,'0') + ':' +
         String(d.getMinutes()).padStart(2,'0');
}

// ════════════════════════════════════════════════════════════
//  Resize 分隔条
// ════════════════════════════════════════════════════════════
function _initResizeHandles() {
  const sidebarHandle = _content ? _content.querySelector('.sandbox-resize-sidebar') : null;
  if (sidebarHandle) _initSingleResize(sidebarHandle, 'sidebar');
  const editorHandle = _content ? _content.querySelector('.sandbox-resize-editor') : null;
  if (editorHandle) _initSingleResize(editorHandle, 'editor');
}

function _initSingleResize(handle, type) {
  let startX = 0;
  let startW = 0;
  let targetEl = null;

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startX = e.clientX;

    if (type === 'sidebar') {
      targetEl = document.getElementById('sandboxFileTreeContainer');
      if (targetEl) startW = targetEl.offsetWidth;
    } else {
      targetEl = _content ? _content.querySelector('.sandbox-preview-area') : null;
      if (targetEl) startW = targetEl.offsetWidth;
    }

    handle.classList.add('active');

    // 拖拽期间禁用 iframe 的鼠标事件，防止 iframe 吞噬 mousemove/mouseup
    if (_preview) _preview.style.pointerEvents = 'none';
    // 同时禁用 Monaco 的鼠标事件
    const monacoEl = document.getElementById('sandboxMonacoContainer');
    if (monacoEl) monacoEl.style.pointerEvents = 'none';

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  function onMove(e) {
    if (!targetEl) return;
    let newW;
    if (type === 'sidebar') {
      newW = startW + (e.clientX - startX);
      newW = Math.max(120, Math.min(400, newW));
    } else {
      newW = startW - (e.clientX - startX);
      newW = Math.max(200, Math.min(600, newW));
    }
    targetEl.style.width = newW + 'px';
    targetEl.style.flex = 'none';
    if (_monacoEditor) _monacoEditor.layout();
  }

  function onUp() {
    handle.classList.remove('active');
    // 恢复 iframe 和 Monaco 的鼠标事件
    if (_preview) _preview.style.pointerEvents = '';
    const monacoEl = document.getElementById('sandboxMonacoContainer');
    if (monacoEl) monacoEl.style.pointerEvents = '';
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }
}

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
    node.sandboxMode = true;
  } else {
    treeData = migrateHtmlSource(null);
    node.fileSystem = treeData;
    node.sandboxMode = true;
  }

  _vfs = new VirtualFileSystem(treeData);
  _vfs.expandAll();

  // 2. 初始化历史记录
  _history = new SandboxHistory();
  _history.attachToNode(_currentNodeId);
  _history.loadFromNode(node);

  // 3. 初始化文件树
  const treeContainer = document.getElementById('sandboxFileTreeContainer');
  if (treeContainer) {
    _fileTree = new FileTreeComponent(treeContainer, _vfs, {
      onFileSelect: (filePath) => _onFileSelect(filePath),
      onFileDelete: (path, isDir) => _onFileDelete(path, isDir),
      onFileRename: (path, newName) => _onFileRename(path, newName),
      onFileCreate: (dirPath, name, type) => _onFileCreate(dirPath, name, type),
    });
    _fileTree.render();
  }

  // 4. 初始化标签页
  const tabsContainer = document.getElementById('sandboxTabsContainer');
  if (tabsContainer) {
    _fileTabs = new FileTabsComponent(tabsContainer,
      (filePath) => _onFileSelect(filePath),
      (filePath) => _onTabClose(filePath)
    );
  }

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
  }

  // 7. 打开入口文件
  const entryPath = _vfs.getEntryPoint();
  if (entryPath) {
    _openFileInEditor(entryPath);
  }

  _setStatus('就绪');
}

function _destroyIDEComponents() {
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
    _fileTabs = null;
  }
  if (_search) {
    _search = null;
  }
  _vfs = null;
  _history = null;
  _lastPreviewFiles.clear();
  _consoleLines = [];
  _consoleCounts = { log: 0, error: 0, warn: 0, info: 0 };
  if (_autoRunTimer) {
    clearTimeout(_autoRunTimer);
    _autoRunTimer = null;
  }
}

// ════════════════════════════════════════════════════════════
//  文件操作回调
// ════════════════════════════════════════════════════════════

function _openFileInEditor(filePath) {
  if (!_vfs || !_monacoEditor || !_fileTabs) return;
  const file = _vfs.getFile(filePath);
  if (!file) return;
  _fileTabs.openTab(filePath, file.name);
  _monacoEditor.openFile(file);
  if (_fileTree) _fileTree.setActive(filePath);
}

function _onFileSelect(filePath) {
  _openFileInEditor(filePath);
}

function _onTabClose(filePath) {
  if (_fileTabs) _fileTabs.closeTab(filePath);
  if (_monacoEditor) _monacoEditor.closeFile(filePath);
  if (_fileTabs && _fileTabs.getActivePath()) {
    _openFileInEditor(_fileTabs.getActivePath());
  }
}

function _onFileDelete(path, isDirectory) {
  if (!_vfs) return;
  if (isDirectory) {
    _vfs.deleteDirectory(path);
  } else {
    _vfs.deleteFile(path);
    if (_monacoEditor) _monacoEditor.deleteFile(path);
    if (_fileTabs) _fileTabs.closeTab(path);
  }
  if (_fileTree) _fileTree.refresh();
  _setStatus('已删除: ' + path.split('/').pop());
  if (_autoRunEnabled) runPreview(false);
}

function _onFileRename(path, newName) {
  if (!_vfs) return;
  const newPath = _vfs.rename(path, newName);
  if (newPath) {
    if (_monacoEditor) _monacoEditor.renameFile(path, newPath, newName);
    if (_fileTabs) _fileTabs.renamePath(path, newPath, newName);
    if (_fileTree) _fileTree.refresh();
    _setStatus('已重命名: ' + newName);
  }
}

function _onFileCreate(dirPath, name, type) {
  if (!_vfs) return;
  if (type === 'file') {
    const file = _vfs.createFile(dirPath || '', name);
    if (file && _fileTree) {
      _fileTree.refresh();
      _openFileInEditor(file.path);
    }
  } else {
    _vfs.createDirectory(dirPath || '', name);
    if (_fileTree) _fileTree.refresh();
  }
}

function _setStatus(text) {
  if (_statusText) _statusText.textContent = text;
}

// ════════════════════════════════════════════════════════════
//  打开/关闭编辑器
// ════════════════════════════════════════════════════════════

export async function openHtmlSandboxEditor(nodeId) {
  initHtmlSandboxWindow();

  _currentNodeId = nodeId;
  _openTimestamp = Date.now();

  const node = appState.nodeMap.get(nodeId);
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
        if (_windowInstance && _windowInstance.getState() === WindowState.MINIMIZED) {
          _windowInstance.restore();
        } else {
          WindowManager.bringToFront(_windowInstance);
        }
      },
      close: () => closeHtmlSandboxEditor()
    });
  }

  // 打开窗口
  _windowInstance.open(WindowState.MAXIMIZED);

  // 初始化 IDE 组件
  await _initIDEComponents(node);

  // 自动运行预览
  setTimeout(() => runPreview(false), 200);
}

export function closeHtmlSandboxEditor() {
  if (!_windowInstance) return;
  _destroyIDEComponents();
  _windowInstance.close();
  _currentNodeId = null;
  if (_nodeName) _nodeName.textContent = '';
  if (window.Taskbar) window.Taskbar.removeEditor('html-sandbox');
}

// ════════════════════════════════════════════════════════════
//  性能优化：暂停/恢复预览 iframe
// ════════════════════════════════════════════════════════════

function _pausePreview() {
  if (_preview) _preview.srcdoc = '';
}

function _resumePreview() {
  if (_preview && _lastPreviewHtml) _preview.srcdoc = _lastPreviewHtml;
}

// ════════════════════════════════════════════════════════════
//  代码运行与保存（支持热注入）
// ════════════════════════════════════════════════════════════

async function runPreview(forceFullReload = true) {
  if (!_preview || !_vfs) return;

  // 同步 Monaco 内容到 VFS
  if (_monacoEditor) _monacoEditor.syncAllToFS(_vfs);

  // 清空控制台
  _clearConsole();

  // 尝试热注入（非强制刷新且已有预览）
  if (!forceFullReload && _lastPreviewHtml && _lastPreviewFiles.size > 0) {
    const injectResult = _tryHotInject();
    if (injectResult) {
      _setStatus('热更新 ✓');
      return;
    }
  }

  _setStatus('正在构建...');

  try {
    let fullHtml;

    if (needsEsbuild(_vfs)) {
      _setStatus('正在打包 (esbuild)...');
      try {
        fullHtml = await buildBundledHtml(_vfs);
      } catch (err) {
        console.warn('[sandbox] esbuild 打包失败，回退到简单模式:', err);
        fullHtml = _vfs.buildSimpleHtml();
        _setStatus('打包失败，使用简单模式');
      }
    } else {
      fullHtml = _vfs.buildSimpleHtml();
      // 注入控制台重定向（简单模式）
      fullHtml = _injectConsoleRedirect(fullHtml);
    }

    _lastPreviewHtml = fullHtml;
    _preview.srcdoc = fullHtml;

    // 记录当前文件内容（用于下次热注入比较）
    _lastPreviewFiles.clear();
    for (const [path, file] of _vfs.getAllFiles()) {
      _lastPreviewFiles.set(path, file.content);
    }

    _setStatus('运行中 ✓');
  } catch (err) {
    _setStatus('运行错误: ' + err.message);
    console.error('[sandbox] 运行预览失败:', err);
  }
}

/**
 * 尝试热注入：检测改动类型，仅更新 CSS 或 JS 而不刷新 iframe
 * @returns {boolean} 是否成功热注入
 */
function _tryHotInject() {
  if (!_preview || !_preview.contentWindow) return false;

  let changedCss = null;
  let changedJs = null;
  let htmlChanged = false;
  let otherChanged = false;

  for (const [path, file] of _vfs.getAllFiles()) {
    const oldContent = _lastPreviewFiles.get(path);
    const newContent = file.content;
    if (oldContent === newContent) continue;

    if (file.language === 'css' || path.endsWith('.css')) {
      changedCss = { path, content: newContent };
    } else if (file.language === 'javascript' || path.endsWith('.js') || path.endsWith('.mjs')) {
      changedJs = changedJs || [];
      changedJs.push({ path, content: newContent });
    } else if (file.language === 'html' || path.endsWith('.html')) {
      htmlChanged = true;
    } else {
      otherChanged = true;
    }
  }

  // HTML 或其他文件改动 → 无法热注入，需全量刷新
  if (htmlChanged || otherChanged) return false;

  // 仅 CSS 改动 → 注入新样式
  if (changedCss && !changedJs) {
    try {
      _preview.contentWindow.postMessage({
        type: 'sandbox-hot-update-css',
        css: changedCss.content,
        path: changedCss.path
      }, '*');
      _lastPreviewFiles.set(changedCss.path, changedCss.content);
      return true;
    } catch (e) {
      return false;
    }
  }

  // 仅 JS 改动 → 重新执行脚本
  if (changedJs && !changedCss) {
    try {
      // 合并所有 JS 文件内容
      let allJs = '';
      for (const j of changedJs) {
        allJs += '// ' + j.path + '\n' + j.content + '\n\n';
        _lastPreviewFiles.set(j.path, j.content);
      }
      _preview.contentWindow.postMessage({
        type: 'sandbox-hot-update-js',
        js: allJs
      }, '*');
      return true;
    } catch (e) {
      return false;
    }
  }

  // CSS + JS 都改了 → 注入两者
  if (changedCss && changedJs) {
    try {
      _preview.contentWindow.postMessage({
        type: 'sandbox-hot-update-css',
        css: changedCss.content,
        path: changedCss.path
      }, '*');
      let allJs = '';
      for (const j of changedJs) {
        allJs += '// ' + j.path + '\n' + j.content + '\n\n';
        _lastPreviewFiles.set(j.path, j.content);
      }
      _preview.contentWindow.postMessage({
        type: 'sandbox-hot-update-js',
        js: allJs
      }, '*');
      _lastPreviewFiles.set(changedCss.path, changedCss.content);
      return true;
    } catch (e) {
      return false;
    }
  }

  return false;
}

function _injectConsoleRedirect(html) {
  const redirect = _consoleRedirectCode();
  // 注入热更新监听器
  const hotUpdateListener = _hotUpdateListenerCode();
  const injectCode = redirect + '\n' + hotUpdateListener;

  if (html.includes('<script>')) {
    return html.replace('<script>', '<script>\n' + injectCode);
  }
  if (html.includes('</head>')) {
    return html.replace('</head>', '<script>\n' + injectCode + '\n</script>\n</head>');
  }
  return html;
}

function _consoleRedirectCode() {
  return `(function(){
    function ser(v,depth){
      depth=depth||0;
      if(depth>4) return {type:'string',value:'...'};
      if(v===null) return {type:'null',value:'null'};
      if(v===undefined) return {type:'null',value:'undefined'};
      var t=typeof v;
      if(t==='string') return {type:'string',value:v.length>200?v.slice(0,200)+'...':v};
      if(t==='number'||t==='boolean') return {type:t,value:String(v)};
      if(t==='function') return {type:'function',value:'ƒ '+(v.name||'anonymous')+'()'};
      if(t==='symbol') return {type:'string',value:v.toString()};
      try{
        if(v instanceof Error) return {type:'string',value:v.name+': '+v.message+(v.stack?'\\n'+v.stack:'')};
        if(v instanceof HTMLElement) return {type:'string',value:'<'+v.tagName.toLowerCase()+'>'};
        if(Array.isArray(v)){
          var arr=v.slice(0,100).map(function(x){return ser(x,depth+1);});
          if(v.length>100) arr.push({type:'string',value:'... +'+(v.length-100)});
          return {type:'array',value:arr};
        }
        if(t==='object'){
          var keys=Object.keys(v).slice(0,100);
          var obj={};
          keys.forEach(function(k){obj[k]=ser(v[k],depth+1);});
          return {type:'object',value:obj};
        }
      }catch(e){return {type:'string',value:'[无法序列化]'};}
      return {type:'string',value:String(v)};
    }
    function send(level,args){
      var parts=[].slice.call(args).map(function(a){return ser(a);});
      try{window.parent.postMessage({type:'sandbox-console',level:level,args:parts},'*')}catch(x){}
    }
    ['log','error','warn','info'].forEach(function(lv){
      var orig=console[lv];
      console[lv]=function(){send(lv,arguments);if(orig)orig.apply(console,arguments);};
    });
    window.onerror=function(m,s,l,c,err){
      if(err) console.error(err);
      else console.error(m+' ('+s+':'+l+')');
    };
    window.addEventListener('unhandledrejection',function(e){
      console.error('Unhandled Promise Rejection: '+(e.reason&&e.reason.message||e.reason));
    });
  })();`;
}

function _hotUpdateListenerCode() {
  return `(function(){
    window.addEventListener('message', function(e){
      var d = e.data;
      if (!d) return;
      // 热更新 CSS
      if (d.type === 'sandbox-hot-update-css') {
        var style = document.getElementById('__sandbox_hot_style__');
        if (!style) {
          style = document.createElement('style');
          style.id = '__sandbox_hot_style__';
          document.head.appendChild(style);
        }
        style.textContent = '/* hot: ' + (d.path||'') + ' */\\n' + d.css;
      }
      // 热更新 JS
      if (d.type === 'sandbox-hot-update-js') {
        var old = document.getElementById('__sandbox_hot_script__');
        if (old) old.remove();
        var s = document.createElement('script');
        s.id = '__sandbox_hot_script__';
        s.textContent = d.js;
        document.body.appendChild(s);
      }
    });
  })();`;
}

function saveHtmlSource() {
  if (!_currentNodeId) {
    showToast('请先选择一个节点');
    return;
  }

  const node = appState.nodeMap.get(_currentNodeId);
  if (!node) {
    showToast('节点不存在');
    return;
  }

  // 同步 Monaco 内容到 VFS
  if (_monacoEditor && _vfs) {
    _monacoEditor.syncAllToFS(_vfs);
    // 序列化 VFS 到节点
    node.fileSystem = _vfs.toJSON();
    // 标记所有文件已保存
    _monacoEditor.markAllSaved();
  }

  // 标记为沙盒模式
  node.sandboxMode = true;

  // 记录历史快照
  if (_history) {
    _history.recordAllFiles(_vfs, 'manual');
    _history.saveToNode(node);
  }

  // 触发保存
  saveCurrentProjectData();
  showToast('✅ 代码已保存');
  _setStatus('已保存 ✓');
}

function syncToNote() {
  if (!_currentNodeId) return;

  const node = appState.nodeMap.get(_currentNodeId);
  if (!node) return;

  if (_monacoEditor && _vfs) {
    _monacoEditor.syncAllToFS(_vfs);
  }

  let synced = false;
  try {
    const previewDoc = _preview ? _preview.contentDocument : null;
    if (previewDoc && previewDoc.body) {
      node.content = previewDoc.body.innerHTML;
      synced = true;
    }
  } catch (e) {}

  if (!synced && _vfs) {
    const entryPath = _vfs.getEntryPoint();
    if (entryPath) {
      const content = _vfs.getFileContent(entryPath);
      if (content) {
        node.content = content;
        synced = true;
      }
    }
  }

  if (synced) {
    saveCurrentProjectData();
    showToast('✅ 已同步到笔记内容');
  } else {
    showToast('⚠️ 没有可同步的内容');
  }
}

function exportAsHtml() {
  if (_monacoEditor && _vfs) {
    _monacoEditor.syncAllToFS(_vfs);
  }
  if (!_vfs) return;

  const fullHtml = _vfs.buildSimpleHtml();
  const blob = new Blob([fullHtml], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'exported.html';
  a.click();
  URL.revokeObjectURL(url);
  showToast('✅ 已导出为 HTML 文件');
}

// ════════════════════════════════════════════════════════════
//  辅助函数
// ════════════════════════════════════════════════════════════
function _escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ════════════════════════════════════════════════════════════
//  双击节点显示沙盒内容（对外 API）
// ════════════════════════════════════════════════════════════

export function isNodeSandbox(nodeId) {
  const node = appState.nodeMap.get(nodeId);
  if (!node) return false;
  return !!(node.sandboxMode || (node.htmlSource && node.htmlSource.mode === 'sandbox') || node.fileSystem);
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
window.getSandboxHtml = getSandboxHtml;

console.log('[html-sandbox-editor] 模块已加载（VSCode 风格 IDE + 扩展功能）');
