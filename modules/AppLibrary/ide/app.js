// ============================================================
//  AppLibrary / ide / app.js — IDE 内置应用包装类
//  构建 IDE DOM 结构，对接 AppRunner 的 WindowManager，
//  并调用容器化 IDE 初始化流程
// ============================================================

import { initIdeInContainer, destroyIdeContainer } from './index.js';

export class IdeApp {
  /**
   * @param {Object} app - 应用信息 { id, name, icon, ... }
   * @param {HTMLElement} modal - AppRunner 创建的 modal 容器
   */
  constructor(app, modal) {
    this._app = app;
    this._modal = modal;
    this._content = null;
    this._header = null;
    this._initialized = false;
    this._sandboxPath = null;  // 从节点打开时的 sandbox 路径
    this._nodeId = null;       // 从节点打开时的节点 ID

    modal.innerHTML = this._buildHTML();
    this._content = modal.querySelector('.rich-modal-content');
    this._header = modal.querySelector('.rich-modal-header');
  }

  /** 返回 AppRunner 所需的 content 元素 */
  get content() {
    return this._content;
  }

  /** 返回 AppRunner 所需的 header 元素 */
  get header() {
    return this._header;
  }

  /**
   * 初始化 IDE（在 WindowManager 打开窗口后调用）
   */
  async init() {
    if (this._initialized) return;
    this._initialized = true;
    await initIdeInContainer(this._modal, {
      sandboxPath: this._sandboxPath,
      nodeId: this._nodeId,
    });
  }

  /**
   * 销毁 IDE
   */
  destroy() {
    destroyIdeContainer();
    this._initialized = false;
  }

  /**
   * 构建 IDE 的完整 HTML 结构
   * @returns {string}
   * @private
   */
  _buildHTML() {
    return `
      <div class="rich-modal-content">
        <div class="rich-modal-header">
          <div style="display:flex; align-items:center; gap:8px; flex:1;">
            <h2 id="htmlSandboxTitle">💻 IDE</h2>
            <span id="htmlSandboxNodeName" style="color:#6af;font-size:12px;"></span>
          </div>
          <div class="caption-buttons">
            <button class="caption-btn app-runner-min" title="最小化">
              <svg viewBox="0 0 10 10"><line x1="2" y1="5" x2="8" y2="5" /></svg>
            </button>
            <button class="caption-btn app-runner-max" title="窗口化">
              <svg viewBox="0 0 10 10"><rect x="0" y="3" width="5" height="5" rx="0"/><rect x="3" y="0" width="5" height="5" rx="0"/></svg>
            </button>
            <button class="caption-btn app-runner-close" title="关闭">
              <svg viewBox="0 0 10 10"><line x1="2" y1="2" x2="8" y2="8" /><line x1="8" y1="2" x2="2" y2="8" /></svg>
            </button>
          </div>
        </div>
        <div class="panel-accent-line"></div>
        <div class="sandbox-ide-body">
          <!-- 菜单栏 -->
          <div class="sandbox-menubar" id="sandboxMenubar">
            <div class="menu-item" data-menu="file">文件
              <div class="menu-dropdown">
                <button class="menu-btn" data-action="openFolder">📂 打开文件夹 <span class="menu-shortcut">Ctrl+K Ctrl+O</span></button>
                <div class="menu-sep"></div>
                <button class="menu-btn" data-action="save">保存 <span class="menu-shortcut">Ctrl+S</span></button>
                <button class="menu-btn" data-action="export">导出为 HTML <span class="menu-shortcut"></span></button>
                <div class="menu-sep"></div>
                <button class="menu-btn" data-action="history">本地历史记录…</button>
                <div class="menu-sep"></div>
                <button class="menu-btn" data-action="close">关闭编辑器</button>
              </div>
            </div>
            <div class="menu-item" data-menu="edit">编辑
              <div class="menu-dropdown">
                <button class="menu-btn" data-action="undo">撤销 <span class="menu-shortcut">Ctrl+Z</span></button>
                <button class="menu-btn" data-action="redo">重做 <span class="menu-shortcut">Ctrl+Y</span></button>
                <div class="menu-sep"></div>
                <button class="menu-btn" data-action="cut">剪切 <span class="menu-shortcut">Ctrl+X</span></button>
                <button class="menu-btn" data-action="copy">复制 <span class="menu-shortcut">Ctrl+C</span></button>
                <button class="menu-btn" data-action="paste">粘贴 <span class="menu-shortcut">Ctrl+V</span></button>
                <div class="menu-sep"></div>
                <button class="menu-btn" data-action="find">查找 <span class="menu-shortcut">Ctrl+F</span></button>
                <button class="menu-btn" data-action="replace">替换 <span class="menu-shortcut">Ctrl+H</span></button>
              </div>
            </div>
            <div class="menu-item" data-menu="selection">选择
              <div class="menu-dropdown">
                <button class="menu-btn" data-action="selectAll">全选 <span class="menu-shortcut">Ctrl+A</span></button>
                <div class="menu-sep"></div>
                <button class="menu-btn" data-action="format">格式化文档 <span class="menu-shortcut">Shift+Alt+F</span></button>
              </div>
            </div>
            <div class="menu-item" data-menu="view">查看
              <div class="menu-dropdown">
                <button class="menu-btn" data-action="commandPalette">命令面板 <span class="menu-shortcut">Ctrl+Shift+P</span></button>
                <button class="menu-btn" data-action="search">全局搜索 <span class="menu-shortcut">Ctrl+Shift+F</span></button>
                <div class="menu-sep"></div>
                <button class="menu-btn" data-action="toggleConsole">切换控制台 <span class="menu-shortcut">Ctrl+\`</span></button>
                <button class="menu-btn" data-action="toggleMinimap">切换缩略图</button>
                <button class="menu-btn" data-action="toggleAutoRun">切换自动运行</button>
                <div class="menu-sep"></div>
                <button class="menu-btn" data-action="toggleSplit">分屏编辑</button>
                <button class="menu-btn" data-action="settings">设置…</button>
              </div>
            </div>
            <div class="menu-item" data-menu="goto">转到
              <div class="menu-dropdown">
                <button class="menu-btn" data-action="quickOpen">转到文件 <span class="menu-shortcut">Ctrl+P</span></button>
                <button class="menu-btn" data-action="gotoLine">转到行 <span class="menu-shortcut">Ctrl+G</span></button>
                <div class="menu-sep"></div>
                <button class="menu-btn" data-action="toggleBookmark">切换书签 <span class="menu-shortcut">Ctrl+F2</span></button>
                <button class="menu-btn" data-action="nextBookmark">下一个书签 <span class="menu-shortcut">F2</span></button>
                <button class="menu-btn" data-action="prevBookmark">上一个书签 <span class="menu-shortcut">Shift+F2</span></button>
                <button class="menu-btn" data-action="clearBookmarks">清除所有书签</button>
              </div>
            </div>
            <div class="menu-item" data-menu="run">运行
              <div class="menu-dropdown">
                <button class="menu-btn" data-action="runPreview">运行预览 <span class="menu-shortcut">Ctrl+Enter</span></button>
                <button class="menu-btn" data-action="refreshPreview">刷新预览</button>
                <div class="menu-sep"></div>
                <button class="menu-btn" data-action="fullscreenPreview">全屏预览</button>
              </div>
            </div>
            <div class="menu-item" data-menu="terminal">终端
              <div class="menu-dropdown">
                <button class="menu-btn" data-action="newTerminal">新建终端 <span class="menu-shortcut">Ctrl+Shift+\`</span></button>
                <button class="menu-btn" data-action="toggleTerminal">切换终端 <span class="menu-shortcut">Ctrl+\`</span></button>
                <div class="menu-sep"></div>
                <button class="menu-btn" data-action="toggleConsole">切换控制台</button>
                <button class="menu-btn" data-action="clearConsole">清空控制台</button>
                <div class="menu-sep"></div>
                <button class="menu-btn" data-action="killAllTerminals">关闭所有终端</button>
              </div>
            </div>
            <div class="menu-item" data-menu="help">帮助
              <div class="menu-dropdown">
                <button class="menu-btn" data-action="shortcuts">快捷键参考</button>
                <button class="menu-btn" data-action="about">关于 AstroKnot IDE</button>
              </div>
            </div>
            <span id="sandboxStatusText" class="sandbox-status-text"></span>
            <span id="consoleErrorBadge" class="console-error-badge" style="display:none;">0</span>
          </div>
          <!-- 主体: 活动栏 + 侧边面板 + 编辑区 -->
          <div class="sandbox-main">
            <!-- 活动栏 -->
            <div class="sandbox-activity-bar">
              <button class="activity-bar-btn active" data-panel="explorer" title="资源管理器">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M17.5 0h-9L7 1.5V6H2.5L1 7.5v15.07L2.5 24h12.07L16 22.57V18h4.7l1.3-1.43V4.5L17.5 0zm0 2.12l2.38 2.38H17.5V2.12zm-3 20.38h-12v-15H7v9.07L8.5 18h6v4.5zm6-6h-12v-15H16V6h4.5v10.5z"/></svg>
              </button>
              <button class="activity-bar-btn" data-panel="search" title="搜索">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M15.25 0a8.25 8.25 0 0 0-6.18 13.72L1 21.79l1.42 1.42 8.07-8.07A8.25 8.25 0 1 0 15.25.01V0zm0 14.5a6.25 6.25 0 1 1 0-12.5 6.25 6.25 0 0 1 0 12.5z"/></svg>
              </button>
              <button class="activity-bar-btn" data-panel="preview" title="预览">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
              </button>
              <button class="activity-bar-btn" data-panel="github" title="从 GitHub 导入">
                <svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
              </button>
            </div>
            <!-- 侧边面板 -->
            <div id="sandboxSidePanel" class="sandbox-side-panel">
              <div id="sandboxSearchPanel" class="sandbox-search-panel" style="display:none;">
                <div class="search-input-group">
                  <input type="text" id="sandboxSearchInput" placeholder="搜索内容 (Ctrl+Shift+F)..." autocomplete="off" />
                  <button id="searchToggleReplaceBtn" class="search-mini-btn" title="切换替换模式">⇅</button>
                  <button id="searchCloseBtn" class="search-mini-btn" title="关闭搜索">✕</button>
                </div>
                <div class="search-input-group search-replace-row" id="searchReplaceRow" style="display:none;">
                  <input type="text" id="sandboxReplaceInput" placeholder="替换为..." autocomplete="off" />
                  <button id="searchReplaceAllBtn" class="search-mini-btn" title="全部替换">∀</button>
                </div>
                <div class="search-toolbar">
                  <label class="search-option"><input type="checkbox" id="searchCaseSensitive" /> Aa</label>
                  <label class="search-option"><input type="checkbox" id="searchRegex" /> .*</label>
                  <label class="search-option"><input type="checkbox" id="searchWholeWord" /> W</label>
                  <span id="searchSummary" class="search-summary"></span>
                </div>
                <div id="sandboxSearchResults" class="search-results"></div>
              </div>
              <div id="sandboxFileTreeContainer" class="sandbox-sidebar"></div>
              <div id="sandboxGithubPanel" class="sandbox-github-panel" style="display:none;">
                <div class="github-header">
                  <span>📦 GitHub 导入</span>
                  <button class="github-close-btn" title="关闭">✕</button>
                </div>
                <div class="github-tool-row">
                  <button id="githubToolBtn" class="github-tool-btn" title="检测 Git 和 Node.js 是否可用">🔍 检测环境</button>
                  <div id="githubToolWarning" class="github-tool-warning" style="display:none;"></div>
                </div>
                <div class="github-input-row">
                  <input type="text" id="githubUrlInput" placeholder="owner/repo 或 GitHub URL" autocomplete="off" />
                  <button id="githubParseBtn" class="github-mini-btn">解析</button>
                </div>
                <div id="githubRepoInfo" class="github-repo-info" style="display:none;"></div>
                <div id="githubOptions" class="github-options" style="display:none;">
                  <label class="github-option-label">跳过 &gt;
                    <input type="number" id="githubMaxMb" value="10" min="1" max="100" class="github-option-input github-option-narrow" /> MB 的文件
                  </label>
                </div>
                <div class="github-actions">
                  <button id="githubImportBtn" class="github-import-btn" disabled>开始导入</button>
                  <button id="githubCancelBtn" class="github-cancel-btn" disabled>取消</button>
                </div>
                <div class="github-progress-wrap" id="githubProgressWrap" style="display:none;">
                  <div class="github-progress-bar"><div class="github-progress-fill" id="githubProgressFill"></div></div>
                  <span class="github-progress-text" id="githubProgressText">0 / 0</span>
                </div>
                <div id="githubErrorCard" style="display:none;"></div>
                <div id="githubDoneCard" style="display:none;"></div>
                <div class="github-log" id="sandboxGithubLog"></div>
              </div>
            </div>
            <div class="sandbox-resize-handle sandbox-resize-sidebar" data-handle="we"></div>
            <div class="sandbox-editor-area">
              <div id="sandboxEditorGroupContainer" class="sandbox-editor-group-container">
                <div id="sandboxEditorGroup1" class="sandbox-editor-group">
                  <div id="sandboxTabsContainer"></div>
                  <div id="sandboxBreadcrumbBar" class="sandbox-breadcrumb"></div>
                  <div id="sandboxMonacoContainer" class="sandbox-monaco-container"></div>
                  <!-- 欢迎页（无工作区时显示） -->
                  <div id="sandboxWelcomePage" class="sandbox-welcome-page">
                    <div class="welcome-content">
                      <div class="welcome-logo">💻</div>
                      <h1>AstroKnot IDE</h1>
                      <p class="welcome-subtitle">轻量级代码编辑器</p>
                      <div class="welcome-actions">
                        <button id="welcomeOpenFolder" class="welcome-btn primary">📂 打开文件夹</button>
                        <button id="welcomeNewFile" class="welcome-btn">📄 新建文件</button>
                      </div>
                      <div class="welcome-tips">
                        <p>💡 打开文件夹后，文件将显示在左侧资源管理器中</p>
                        <p>💡 Ctrl+S 保存，Ctrl+Enter 运行预览</p>
                      </div>
                    </div>
                  </div>
                  <div id="sandboxImagePreview" class="sandbox-image-preview" style="display:none;">
                    <div class="image-preview-header">
                      <span id="imagePreviewInfo">🖼️ image.png</span>
                      <span id="imagePreviewZoom" class="image-preview-zoom">100%</span>
                    </div>
                    <div class="image-preview-viewport" id="imagePreviewViewport">
                      <img id="imagePreviewImg" src="" alt="preview" draggable="false" />
                    </div>
                  </div>
                  <div id="sandboxMarkdownPreview" class="sandbox-markdown-preview" style="display:none;">
                    <div class="md-preview-header">
                      <span class="md-preview-title">📝 Markdown 预览</span>
                      <button id="mdPreviewSyncBtn" class="sandbox-toolbar-btn" style="padding:2px 8px;font-size:11px;">↕ 同步</button>
                    </div>
                    <div class="md-preview-body" id="mdPreviewBody"></div>
                  </div>
                  <div id="sandboxPreviewContainer" class="sandbox-preview-inline" style="display:none;">
                    <div class="sandbox-preview-header">
                      <span class="preview-title">👁 预览</span>
                      <div class="preview-device-switcher">
                        <button id="previewFullscreenBtn" class="device-btn" title="全屏预览">⛶</button>
                      </div>
                      <button id="sandboxRefreshPreviewBtn" class="sandbox-toolbar-btn" style="padding:2px 8px;font-size:11px;">↻ 刷新</button>
                    </div>
                    <div class="sandbox-preview-viewport">
                      <iframe id="htmlSandboxPreview" sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups" style="width:100%;height:100%;border:none;background:#0d1b23;"></iframe>
                    </div>
                  </div>
                </div>
                <div id="sandboxSplitHandle" class="sandbox-split-handle" style="display:none;"></div>
                <div id="sandboxEditorGroup2" class="sandbox-editor-group" style="display:none;">
                  <div id="sandboxTabsContainer2" class="sandbox-file-tabs"></div>
                  <div id="sandboxBreadcrumbBar2" class="sandbox-breadcrumb"></div>
                  <div id="sandboxMonacoContainer2" class="sandbox-monaco-container"></div>
                </div>
              </div>
              <div id="sandboxBottomPanelTabs" class="sandbox-bottom-panel-tabs" style="display:none;">
                <button class="bottom-panel-tab active" data-tab="console">控制台</button>
                <button class="bottom-panel-tab" data-tab="terminal">终端</button>
                <span class="bottom-panel-tabs-spacer"></span>
              </div>
              <div id="sandboxConsolePanel" class="sandbox-console" style="display:none;">
                <div class="sandbox-console-header">
                  <div class="console-filter-group">
                    <span class="console-title">控制台</span>
                    <button class="console-filter-btn active" data-filter="all">全部 <span class="filter-count" data-count="all">0</span></button>
                    <button class="console-filter-btn" data-filter="error">错误 <span class="filter-count" data-count="error">0</span></button>
                    <button class="console-filter-btn" data-filter="warn">警告 <span class="filter-count" data-count="warn">0</span></button>
                    <button class="console-filter-btn" data-filter="log">日志 <span class="filter-count" data-count="log">0</span></button>
                  </div>
                  <button id="clearConsoleBtn" class="sandbox-toolbar-btn" style="padding:2px 8px;font-size:11px;">清空</button>
                </div>
                <div id="htmlConsoleOutput" class="sandbox-console-body"></div>
              </div>
              <div id="sandboxTerminalPanel" class="sandbox-terminal-panel" style="display:none;">
                <div class="terminal-toolbar">
                  <div class="terminal-tab-bar">
                    <button class="terminal-new-btn sandbox-toolbar-btn" title="新建终端">＋</button>
                  </div>
                  <div class="terminal-actions">
                    <button class="terminal-npm-btn sandbox-toolbar-btn" title="npm 脚本" style="display:none;">npm</button>
                    <button class="terminal-kill-btn sandbox-toolbar-btn" title="关闭当前终端">✕</button>
                  </div>
                </div>
                <div class="terminal-tab-content"></div>
                <div class="terminal-npm-menu" style="display:none;"></div>
              </div>
              <div id="sandboxStatusBar" class="sandbox-status-bar">
                <div class="status-bar-left">
                  <span class="status-item" id="statusCursorPos">行 1, 列 1</span>
                  <span class="status-item status-clickable" id="statusIndent" title="点击切换 Tab 大小">Tab: 2</span>
                  <span class="status-item status-clickable" id="statusWordWrap" title="点击切换自动换行">换行: 开</span>
                  <span class="status-item status-clickable" id="statusBookmark" title="书签" style="display:none;">🔖 0</span>
                </div>
                <div class="status-bar-right">
                  <span class="status-item" id="statusStats" title="代码统计">0 行 · 0 字</span>
                  <span class="status-item status-clickable" id="statusFontSize" title="Ctrl+滚轮缩放">14px</span>
                  <span class="status-item" id="statusEncoding">UTF-8</span>
                  <span class="status-item" id="statusLanguage">HTML</span>
                  <span class="status-item status-clickable" id="statusMinimapToggle" title="切换缩略图">缩略图 ✓</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="sandbox-command-palette" id="sandboxCommandPalette">
        <input type="text" class="sandbox-command-input" id="sandboxCommandInput" placeholder="输入命令名称…" autocomplete="off">
        <div class="sandbox-command-list" id="sandboxCommandList"></div>
      </div>
      <div class="sandbox-settings-panel" id="sandboxSettingsPanel">
        <div class="sandbox-settings-header">
          <span>⚙ 设置</span>
          <button class="sandbox-settings-close" id="sandboxSettingsClose">✕</button>
        </div>
        <div class="sandbox-settings-body" id="sandboxSettingsBody"></div>
      </div>
      <div id="sandboxHistoryPanel" class="sandbox-overlay-modal" style="display:none;">
        <div class="sandbox-overlay-content sandbox-overlay-wide">
          <div class="sandbox-overlay-header">
            <h3>📜 本地历史记录</h3>
            <button id="historyCloseBtn" class="sandbox-overlay-close">✕</button>
          </div>
          <div class="panel-accent-line"></div>
          <div class="history-layout">
            <div class="history-pane history-files">
              <div class="history-pane-title">文件</div>
              <div id="historyFileList" class="history-list"></div>
            </div>
            <div class="history-pane history-versions">
              <div class="history-pane-title">版本</div>
              <div id="historyVersionList" class="history-list"></div>
            </div>
            <div class="history-pane history-diff">
              <div class="history-pane-title">
                <span>差异对比</span>
                <button id="historyRestoreBtn" class="sandbox-toolbar-btn" style="padding:2px 8px;font-size:11px;display:none;">↩ 恢复此版本</button>
              </div>
              <div id="historyDiffView" class="history-diff-view"></div>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}