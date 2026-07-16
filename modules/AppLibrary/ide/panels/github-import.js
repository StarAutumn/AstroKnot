// ============================================================
//  github-import.js — GitHub 仓库导入面板
//  提供从 GitHub 公开仓库一键导入源代码到沙盒的功能
// ============================================================

import { GithubApiClient, isBinaryPath } from '../core/github-api.js';
import { extensionToLanguage } from '../core/virtual-fs.js';
import { appState } from '../../../module0_AppState.js';
import { showToast } from '../../../module5_SelectAndEdit.js';

/**
 * GitHub 仓库导入面板模块
 * 状态机: idle → fetching-meta → ready → importing → done/error/cancelled
 */
export class SandboxGithubImport {
  /**
   * @param {import('../core/context').SandboxContext} ctx
   */
  constructor(ctx) {
    this._ctx = ctx;
    this._panelEl = null;
    this._inputEl = null;
    this._parseBtn = null;
    this._importBtn = null;
    this._cancelBtn = null;
    this._client = new GithubApiClient();
    this._state = 'idle';
    this._parsedRepo = null;
    this._repoMeta = null;
    this._tree = null;
    this._abortController = null;
    this._logLines = [];
    this._rafPending = false;
    this._tools = { git: true, npm: true }; // 默认假定可用
  }

  /** 检测系统工具（git / npm）并显示结果 */
  async _checkTools() {
    const warnEl = document.getElementById('githubToolWarning');
    const toolBtn = document.getElementById('githubToolBtn');
    if (!window.api?.checkTools) {
      if (warnEl) {
        warnEl.innerHTML = '⚠️ 当前环境不支持检测';
        warnEl.style.display = 'block';
      }
      return;
    }
    if (toolBtn) { toolBtn.disabled = true; toolBtn.textContent = '🔍 检测中...'; }
    try {
      const tools = await window.api.checkTools();
      this._tools = tools;
      if (!warnEl) return;
      // git 行
      let gitLine;
      if (tools.git) {
        gitLine = '<div class="tool-ok">✅ Git ' + (tools.gitVersion || '') + '</div>';
      } else {
        gitLine = '<div class="tool-miss">❌ 未检测到 Git — 导入必需 · <a href="https://git-scm.com/downloads" target="_blank">下载 Git</a></div>';
      }
      // node.js 行
      let npmLine;
      if (tools.npm) {
        npmLine = '<div class="tool-ok">✅ Node.js ' + (tools.npmVersion || '') + '</div>';
      } else {
        npmLine = '<div class="tool-miss">❌ 未检测到 Node.js — npm install 需要 · <a href="https://nodejs.org/" target="_blank">下载 Node.js</a></div>';
      }
      warnEl.innerHTML = gitLine + npmLine;
      warnEl.style.display = 'block';
    } catch (e) {
      if (warnEl) { warnEl.innerHTML = '⚠️ 检测失败：' + e.message; warnEl.style.display = 'block'; }
    } finally {
      if (toolBtn) { toolBtn.disabled = false; toolBtn.textContent = '🔍 检测环境'; }
    }
  }

  /** 初始化模块 */
  init() {
    // Web 环境不初始化
    if (!window.__ELECTRON__ || !window.api?.writeSandboxFile) return;

    this._panelEl = document.getElementById('sandboxGithubPanel');
    if (!this._panelEl) return;

    // 显示 activity bar 按钮（移除 hidden 属性）
    const btn = document.querySelector('.activity-bar-btn[data-panel="github"]');
    if (btn) btn.removeAttribute('hidden');

    this._cacheDom();
    this._bindEvents();
    this._renderState();
    // 检测按钮事件
    const toolBtn = document.getElementById('githubToolBtn');
    if (toolBtn) {
      toolBtn.addEventListener('click', () => this._checkTools());
    }
  }

  /** 销毁模块 */
  destroy() {
    this.cancel();
    this._panelEl = null;
    this._inputEl = null;
    this._parseBtn = null;
    this._importBtn = null;
    this._cancelBtn = null;
    this._parsedRepo = null;
    this._repoMeta = null;
    this._tree = null;
    this._logLines = [];
  }

  // ════════════════════════════════════════════════════════════
  //  DOM 缓存与事件绑定
  // ════════════════════════════════════════════════════════════

  _cacheDom() {
    this._inputEl = document.getElementById('githubUrlInput');
    this._parseBtn = document.getElementById('githubParseBtn');
    this._importBtn = document.getElementById('githubImportBtn');
    this._cancelBtn = document.getElementById('githubCancelBtn');
    this._repoInfoEl = document.getElementById('githubRepoInfo');
    this._optionsEl = document.getElementById('githubOptions');
    this._maxMbEl = document.getElementById('githubMaxMb');
    this._progressWrap = document.getElementById('githubProgressWrap');
    this._progressFill = document.getElementById('githubProgressFill');
    this._progressText = document.getElementById('githubProgressText');
    this._logEl = document.getElementById('sandboxGithubLog');
    this._closeBtn = this._panelEl.querySelector('.github-close-btn');
    this._errorEl = document.getElementById('githubErrorCard');
  }

  _bindEvents() {
    if (this._parseBtn) {
      this._parseBtn.addEventListener('click', () => this._onParse());
    }
    if (this._importBtn) {
      this._importBtn.addEventListener('click', () => this._onImport());
    }
    if (this._cancelBtn) {
      this._cancelBtn.addEventListener('click', () => this.cancel());
    }
    if (this._closeBtn) {
      this._closeBtn.addEventListener('click', () => {
        this._ctx.emit('toggleSidePanel', null);
      });
    }
    if (this._inputEl) {
      this._inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && this._state === 'idle') {
          this._onParse();
        }
      });
    }
    // 重试 / 重新导入
    const retryBtn = this._panelEl.querySelector('#githubRetryBtn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => this._resetToIdle());
    }
    const againBtn = this._panelEl.querySelector('#githubAgainBtn');
    if (againBtn) {
      againBtn.addEventListener('click', () => this._resetToIdle());
    }
    const openExplorerBtn = this._panelEl.querySelector('#githubOpenExplorerBtn');
    if (openExplorerBtn) {
      openExplorerBtn.addEventListener('click', () => {
        this._ctx.emit('toggleSidePanel', 'explorer');
      });
    }
  }

  // ════════════════════════════════════════════════════════════
  //  状态机
  // ════════════════════════════════════════════════════════════

  /** 解析 URL → 获取仓库信息 → 获取文件树 */
  async _onParse() {
    const input = this._inputEl?.value?.trim();
    if (!input) {
      this._setState('error', '请输入仓库地址');
      return;
    }

    this._setState('fetching-meta');
    this._log('info', '解析仓库地址...');
    this._clearLog();

    try {
      // 1. 解析 URL
      this._parsedRepo = this._client.parseRepoUrl(input);
      const { owner, repo, ref, subPath } = this._parsedRepo;
      this._log('info', `仓库: ${owner}/${repo}${ref ? '@' + ref : ''}${subPath ? '/' + subPath : ''}`);

      // 2. 获取仓库元信息
      this._log('info', '获取仓库信息...');
      this._repoMeta = await this._client.fetchRepoMeta(owner, repo);
      const branch = ref || this._repoMeta.defaultBranch;
      this._log('ok', `默认分支: ${this._repoMeta.defaultBranch}，大小: ${(this._repoMeta.sizeKb / 1024).toFixed(1)} MB`);

      // 3. 获取文件树
      this._log('info', `获取文件树 (分支: ${branch})...`);
      this._tree = await this._client.fetchTree(owner, repo, branch);
      this._log('ok', `文件树: ${this._tree.length} 个文件`);

      // 4. 渲染仓库信息
      this._renderRepoInfo();
      this._setState('ready');
    } catch (err) {
      this._log('error', err.message);
      this._setState('error', err.message);
    }
  }

  /** 执行导入 */
  async _onImport() {
    const vfs = this._ctx.vfs;
    if (!vfs && !this._ctx.isRealFS) return;

    // git 不可用时直接拦截
    if (this._tools && !this._tools.git) {
      this._setState('error');
      const errEl = document.getElementById('githubErrorCard');
      if (errEl) {
        errEl.style.display = 'block';
        errEl.innerHTML = '<div class="github-error-title">❌ 未检测到 Git</div>' +
          '<div class="github-error-desc">GitHub 导入需要安装 Git。请前往 ' +
          '<a href="https://git-scm.com/downloads" target="_blank">git-scm.com/downloads</a> 下载安装后重试。</div>';
      }
      return;
    }

    const { owner, repo, ref, subPath } = this._parsedRepo;
    const branch = ref || this._repoMeta.defaultBranch;

    this._setState('importing');
    this._abortController = new AbortController();

    try {
      // 1. 检查 API 是否可用
      this._log('info', '检查 Git 环境...');
      if (!window.api?.gitCloneAndRead) {
        throw new Error('Git 克隆功能不可用（请在 Electron 环境中运行）');
      }

      // 2. 构建仓库 URL
      const repoUrl = `https://github.com/${owner}/${repo}.git`;
      this._log('ok', `仓库地址: ${repoUrl}`);

      const workspacePath = this._ctx.workspacePath;
      const isRealFS = this._ctx.isRealFS;

      if (isRealFS && workspacePath) {
        // ── 真实文件系统模式：直接 git clone 到 workspace 目录 ──
        await this._importToRealFS(repoUrl, workspacePath);
      } else {
        // ── VFS 模式：克隆到内存 VFS ──
        await this._importToVFS(vfs, repoUrl);
      }

    } catch (err) {
      this._log('error', `导入失败: ${err.message}`);
      this._setState('ready');
    }
  }

  /** 真实文件系统模式导入 */
  async _importToRealFS(repoUrl, workspacePath) {
    this._log('info', `开始克隆到工作目录: ${workspacePath}`);
    this._setProgress(0, 100, '正在克隆...');

    const startTime = Date.now();
    const result = await window.api.gitCloneToDir(repoUrl, workspacePath);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (!result.success) {
      throw new Error(result.error || '克隆失败');
    }

    this._log('ok', `克隆完成，${result.fileCount} 个文件，耗时 ${elapsed} 秒`);
    this._setProgress(100, 100, '完成');

    // 重新从磁盘加载文件树
    this._log('info', '刷新文件系统...');
    if (this._ctx.reloadWorkspace) {
      await this._ctx.reloadWorkspace();
    }

    // 检测 package.json
    await this._checkPackageJson(workspacePath);

    this._log('ok', '导入完成');
    this._setState('done');
  }

  /** VFS 模式导入 */
  async _importToVFS(vfs, repoUrl) {
    // 3. 执行 git clone 并读取文件
    this._log('info', '开始克隆仓库（使用 git clone --depth 1）...');
    this._setProgress(0, 100, '正在克隆...');

    const startTime = Date.now();
    const result = await window.api.gitCloneAndRead(repoUrl);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    this._log('ok', `克隆完成，耗时 ${elapsed} 秒`);

    const files = result.files || [];
    const total = files.length;
    this._log('info', `发现 ${total} 个文件`);

    let succeeded = 0;
    let failed = 0;

    // 4. 写入 VFS
    for (let i = 0; i < files.length; i++) {
      if (this._abortController.signal.aborted) break;

      const { path: relativePath, content, isBinary } = files[i];
      
      try {
        const lastSlash = relativePath.lastIndexOf('/');
        if (lastSlash > 0) {
          _ensureDir(vfs, relativePath.substring(0, lastSlash));
        }

        const fileName = relativePath.split('/').pop();
        const dirPart = lastSlash > 0 ? relativePath.substring(0, lastSlash) : '';
        
        let finalPath = relativePath;
        if (vfs.getFile(relativePath)) {
          let idx = 1;
          const dotIdx = fileName.lastIndexOf('.');
          const base = dotIdx > 0 ? fileName.substring(0, dotIdx) : fileName;
          const ext = dotIdx > 0 ? fileName.substring(dotIdx) : '';
          let newName = `${base}-${idx}${ext}`;
          let newPath = dirPart ? `${dirPart}/${newName}` : newName;
          while (vfs.getFile(newPath)) {
            idx++;
            newName = `${base}-${idx}${ext}`;
            newPath = dirPart ? `${dirPart}/${newName}` : newName;
          }
          finalPath = newPath;
        }

        const finalName = finalPath.split('/').pop();
        const finalDir = finalPath.includes('/') ? finalPath.substring(0, finalPath.lastIndexOf('/')) : '';
        const file = vfs.createFile(finalDir, finalName);
        if (file) {
          if (isBinary) {
            vfs.setBinaryFile(finalPath, content);
          } else {
            file.content = content;
          }
          succeeded++;
        }

        this._setProgress(i + 1, total, relativePath);
        if ((i + 1) % 10 === 0 || i === 0 || i === files.length - 1) {
          this._log('ok', `[${i + 1}/${total}] ${relativePath}`);
        }
      } catch (err) {
        failed++;
        this._log('warn', `跳过文件 ${relativePath}: ${err.message}`);
      }
    }

    // 5. 检查取消状态
    if (this._abortController.signal.aborted) {
      this._log('warn', `用户取消导入（已导入 ${succeeded} / ${total}）`);
    } else {
      this._log('ok', `导入完成: 成功 ${succeeded}，失败 ${failed}`);
    }

    // 6. 同步到磁盘
    this._log('info', '同步到磁盘...');
    const currentNodeId = this._ctx.currentNodeId;

    if (currentNodeId) {
      const projectFolderPath = this._getProjectFolderPath();
      const node = appState.nodeMap.get(currentNodeId);
      
      if (node) {
        this._log('info', `节点ID: ${currentNodeId}, 项目路径: ${projectFolderPath || '(临时)'}`);
        try {
          const ok = await vfs.syncAllToDisk(projectFolderPath, currentNodeId);
          if (ok) {
            node.fileSystem = vfs.toJSON();
            this._log('ok', '磁盘同步完成');
          } else {
            this._log('error', '磁盘同步失败');
          }
        } catch (syncErr) {
          this._log('error', `磁盘同步异常: ${syncErr.message}`);
        }
      } else if (currentNodeId === 'ide-app-project') {
        this._log('info', '内置 IDE 模式，直接写入磁盘...');
        try {
          const mockNode = { id: currentNodeId, name: '未命名项目' };
          const result = await window.api.ideGetNodeSandboxPath(mockNode, projectFolderPath);
          if (result?.success && result.sandboxPath) {
            const fileSystem = vfs.toJSON();
            const syncResult = await window.api.syncSandboxDirectory(projectFolderPath, mockNode, fileSystem);
            if (syncResult.success) {
              this._log('ok', '磁盘同步完成');
            } else {
              this._log('error', `磁盘同步失败: ${syncResult.error || '未知错误'}`);
            }
          } else {
            this._log('warn', `无法获取沙盒路径，跳过磁盘同步`);
          }
        } catch (syncErr) {
          this._log('error', `磁盘同步异常: ${syncErr.message}`);
        }
      } else {
        this._log('warn', `未找到节点: ${currentNodeId}，跳过磁盘同步`);
      }
    } else {
      this._log('warn', '无当前节点，跳过磁盘同步');
    }

    // 7. 刷新文件树
    if (this._ctx.fileTree) {
      this._ctx.fileTree.refresh();
    }
    this._ctx.emit('fileSystemChange');

    // 检测 package.json
    const nodeId = this._ctx.currentNodeId;
    if (nodeId && nodeId !== 'ide-app-project') {
      const projectFolderPath = this._getProjectFolderPath();
      const node = appState.nodeMap.get(nodeId);
      if (node) {
        try {
          const result = await window.api.ideGetNodeSandboxPath(node, projectFolderPath);
          if (result?.success && result.sandboxPath) {
            await this._checkPackageJson(result.sandboxPath);
          }
        } catch (e) {}
      }
    }

    this._setState('done');
  }

  /** 检测 package.json 并询问是否安装依赖 */
  async _checkPackageJson(dirPath) {
    try {
      const items = await window.api.ideReadDir(dirPath);
      const hasPackageJson = items?.some(item => item.name === 'package.json' && item.type === 'file');
      if (hasPackageJson && !this._abortController?.signal?.aborted) {
        this._showNpmInstallDialog(dirPath);
      }
    } catch (e) {
      // 忽略检测失败
    }
  }

  /** 显示 npm install 对话框 */
  _showNpmInstallDialog(dirPath) {
    const dialog = document.createElement('div');
    dialog.className = 'npm-install-dialog-overlay';
    dialog.innerHTML = `
      <div class="npm-install-dialog">
        <div class="npm-install-dialog-header">
          <span>📦 检测到 package.json</span>
        </div>
        <div class="npm-install-dialog-body">
          <p>此项目包含 Node.js 依赖配置。</p>
          <p>是否自动安装依赖并构建项目？</p>
          <div class="npm-install-options">
            <label>
              <input type="checkbox" id="npm-run-build" checked>
              安装后执行构建 (npm run build)
            </label>
          </div>
        </div>
        <div class="npm-install-dialog-footer">
          <button class="btn btn-secondary npm-skip-btn">仅导入代码</button>
          <button class="btn btn-primary npm-install-btn">安装依赖</button>
        </div>
      </div>
    `;
    document.body.appendChild(dialog);

    // 安装依赖
    dialog.querySelector('.npm-install-btn').addEventListener('click', async () => {
      const runBuild = dialog.querySelector('#npm-run-build').checked;
      dialog.remove();
      await this._runNpmInstall(dirPath, runBuild);
    });

    // 跳过安装
    dialog.querySelector('.npm-skip-btn').addEventListener('click', async () => {
      dialog.remove();
      // 即使跳过 npm install，也检测 .env
      if (window.api?.envCheckAndCreate) {
        try {
          const envResult = await window.api.envCheckAndCreate(dirPath);
          if (envResult.created) {
            this._log('ok', envResult.source === 'empty'
              ? '已创建空 .env 文件（请按需填写环境变量）'
              : `已从 ${envResult.source} 创建 .env 文件`);
          }
        } catch (e) { /* 忽略 */ }
      }
      this._setState('done', {});
    });
  }

  /** 执行 npm install */
  async _runNpmInstall(dirPath, runBuild) {
    this._setState('installing');
    this._log('info', '准备安装依赖...');

    try {
      this._log('info', `工作目录: ${dirPath}`);

      // 执行 npm install
      this._log('info', '正在安装依赖 (npm install)...');
      const installResult = await window.api.runCommand('npm install', dirPath);
      
      if (installResult.code !== 0) {
        throw new Error(`npm install 失败: ${installResult.stderr || installResult.stdout}`);
      }
      this._log('ok', '依赖安装完成');

      // 执行 npm run build
      if (runBuild) {
        this._log('info', '正在构建项目 (npm run build)...');
        const buildResult = await window.api.runCommand('npm run build', dirPath);

        if (buildResult.code !== 0) {
          this._log('warn', `构建失败: ${buildResult.stderr || buildResult.stdout}`);
        } else {
          this._log('ok', '项目构建完成');
        }
      }

      // 检测 .env.example 并创建 .env
      if (window.api?.envCheckAndCreate) {
        try {
          const envResult = await window.api.envCheckAndCreate(dirPath);
          if (envResult.created) {
            this._log('ok', envResult.source === 'empty'
              ? '已创建空 .env 文件（请按需填写环境变量）'
              : `已从 ${envResult.source} 创建 .env 文件`);
          }
        } catch (e) { /* 忽略 */ }
      }

      // 刷新文件树（真实 FS 模式需要重新加载磁盘）
      if (this._ctx.isRealFS && this._ctx.reloadWorkspace) {
        await this._ctx.reloadWorkspace();
      } else if (this._ctx.fileTree) {
        this._ctx.fileTree.refresh();
      }
      this._ctx.emit('fileSystemChange');

      this._log('ok', '全部完成！');
      this._setState('done', { npmInstalled: true });

    } catch (err) {
      this._log('error', `安装失败: ${err.message}`);
      this._setState('done', { npmInstalled: false, npmError: err.message });
    }
  }

  /** 取消导入 */
  cancel() {
    if (this._abortController) {
      this._abortController.abort();
    }
  }

  /** 重置到 idle 状态 */
  _resetToIdle() {
    this._parsedRepo = null;
    this._repoMeta = null;
    this._tree = null;
    if (this._inputEl) this._inputEl.value = '';
    this._clearLog();
    this._setState('idle');
  }

  // ════════════════════════════════════════════════════════════
  //  UI 渲染
  // ════════════════════════════════════════════════════════════

  /** 渲染仓库信息卡片 */
  _renderRepoInfo() {
    if (!this._repoInfoEl || !this._parsedRepo) return;
    const { owner, repo, ref, subPath } = this._parsedRepo;
    const branch = ref || this._repoMeta.defaultBranch;
    const sizeMb = (this._repoMeta.sizeKb / 1024).toFixed(1);

    this._repoInfoEl.innerHTML = `
      <div class="github-repo-card">
        <div class="github-repo-name">📦 ${owner}/${repo}</div>
        <div class="github-repo-meta">
          <span>分支: <strong>${branch}</strong></span>
          <span>大小: <strong>${sizeMb} MB</strong></span>
          <span>文件: <strong>${this._tree.length}</strong></span>
        </div>
        ${this._repoMeta.description ? `<div class="github-repo-desc">${this._repoMeta.description}</div>` : ''}
        ${subPath ? `<div class="github-repo-subpath">子目录: ${subPath}</div>` : ''}
      </div>
    `;

  }

  /**
   * 切换状态
   * @param {string} state - 新状态
   * @param {*} [data] - 附加数据
   */
  _setState(state, data) {
    this._state = state;
    this._renderState(data);
  }

  /** 根据当前状态渲染 UI */
  _renderState(data) {
    if (!this._panelEl) return;

    const sections = {
      inputRow: this._panelEl.querySelector('.github-input-row'),
      repoInfo: this._repoInfoEl,
      options: this._optionsEl,
      actions: this._panelEl.querySelector('.github-actions'),
      progress: this._progressWrap,
      log: this._logEl,
      errorCard: this._errorEl,
      doneCard: document.getElementById('githubDoneCard'),
    };

    // 默认全部隐藏
    Object.values(sections).forEach(el => {
      if (el) el.style.display = 'none';
    });
    if (sections.log) sections.log.style.display = 'block'; // 日志始终可见

    switch (this._state) {
      case 'idle':
        if (sections.inputRow) sections.inputRow.style.display = 'flex';
        if (sections.actions) sections.actions.style.display = 'flex';
        if (this._parseBtn) this._parseBtn.disabled = false;
        if (this._importBtn) this._importBtn.disabled = true;
        if (this._cancelBtn) this._cancelBtn.disabled = true;
        if (this._inputEl) this._inputEl.disabled = false;
        break;

      case 'fetching-meta':
        if (sections.inputRow) sections.inputRow.style.display = 'flex';
        if (sections.actions) sections.actions.style.display = 'flex';
        if (this._parseBtn) this._parseBtn.disabled = true;
        if (this._importBtn) this._importBtn.disabled = true;
        if (this._inputEl) this._inputEl.disabled = true;
        this._log('info', '正在获取仓库信息...');
        break;

      case 'ready':
        if (sections.inputRow) sections.inputRow.style.display = 'flex';
        if (sections.repoInfo) sections.repoInfo.style.display = 'block';
        if (sections.options) sections.options.style.display = 'block';
        if (sections.actions) sections.actions.style.display = 'flex';
        if (this._parseBtn) this._parseBtn.disabled = false;
        if (this._importBtn) this._importBtn.disabled = false;
        if (this._cancelBtn) this._cancelBtn.disabled = true;
        if (this._inputEl) this._inputEl.disabled = false;
        break;

      case 'importing':
        if (sections.inputRow) sections.inputRow.style.display = 'flex';
        if (sections.progress) sections.progress.style.display = 'flex';
        if (sections.actions) sections.actions.style.display = 'flex';
        if (this._parseBtn) this._parseBtn.disabled = true;
        if (this._importBtn) this._importBtn.disabled = true;
        if (this._cancelBtn) this._cancelBtn.disabled = false;
        if (this._inputEl) this._inputEl.disabled = true;
        break;

      case 'installing':
        if (sections.progress) sections.progress.style.display = 'flex';
        if (sections.actions) sections.actions.style.display = 'flex';
        if (this._parseBtn) this._parseBtn.disabled = true;
        if (this._importBtn) this._importBtn.disabled = true;
        if (this._cancelBtn) this._cancelBtn.disabled = true;
        break;

      case 'done':
        if (sections.actions) sections.actions.style.display = 'flex';
        if (sections.doneCard) {
          const { succeeded, failed, total } = data || {};
          sections.doneCard.innerHTML = `
            <div class="github-done-card">
              <div class="github-done-icon">✅</div>
              <div class="github-done-text">
                <div>导入完成！</div>
                <div class="github-done-stats">
                  成功: ${succeeded || 0} / ${total || 0}
                  ${failed ? `，失败: ${failed}` : ''}
                </div>
              </div>
              <button id="githubOpenExplorerBtn" class="github-mini-btn">打开文件树</button>
              <button id="githubAgainBtn" class="github-mini-btn">重新导入</button>
            </div>
          `;
          sections.doneCard.style.display = 'block';
          // 重新绑定按钮事件
          const openBtn = sections.doneCard.querySelector('#githubOpenExplorerBtn');
          const againBtn = sections.doneCard.querySelector('#githubAgainBtn');
          if (openBtn) openBtn.addEventListener('click', () => this._ctx.emit('toggleSidePanel', 'explorer'));
          if (againBtn) againBtn.addEventListener('click', () => this._resetToIdle());
        }
        if (this._parseBtn) this._parseBtn.disabled = true;
        if (this._importBtn) this._importBtn.disabled = true;
        if (this._cancelBtn) this._cancelBtn.disabled = true;
        if (showToast) showToast(`✅ 导入完成: ${data?.succeeded || 0} 个文件`, 'success');
        break;

      case 'error':
        if (sections.actions) sections.actions.style.display = 'flex';
        if (sections.errorCard) {
          sections.errorCard.innerHTML = `
            <div class="github-error-card">
              <div class="github-error-icon">❌</div>
              <div class="github-error-msg">${data || '未知错误'}</div>
              <button id="githubRetryBtn" class="github-mini-btn">重试</button>
            </div>
          `;
          sections.errorCard.style.display = 'block';
          const retryBtn = sections.errorCard.querySelector('#githubRetryBtn');
          if (retryBtn) retryBtn.addEventListener('click', () => this._resetToIdle());
        }
        if (this._parseBtn) this._parseBtn.disabled = false;
        if (this._importBtn) this._importBtn.disabled = true;
        if (this._cancelBtn) this._cancelBtn.disabled = true;
        if (this._inputEl) this._inputEl.disabled = false;
        break;

      case 'cancelled':
        if (sections.actions) sections.actions.style.display = 'flex';
        if (sections.doneCard) {
          const { succeeded, total } = data || {};
          sections.doneCard.innerHTML = `
            <div class="github-done-card">
              <div class="github-done-icon">⏹️</div>
              <div class="github-done-text">
                <div>已取消导入</div>
                <div class="github-done-stats">已导入 ${succeeded || 0} / ${total || 0} 个文件</div>
              </div>
              <button id="githubOpenExplorerBtn" class="github-mini-btn">打开文件树</button>
              <button id="githubAgainBtn" class="github-mini-btn">重新导入</button>
            </div>
          `;
          sections.doneCard.style.display = 'block';
          const openBtn = sections.doneCard.querySelector('#githubOpenExplorerBtn');
          const againBtn = sections.doneCard.querySelector('#githubAgainBtn');
          if (openBtn) openBtn.addEventListener('click', () => this._ctx.emit('toggleSidePanel', 'explorer'));
          if (againBtn) againBtn.addEventListener('click', () => this._resetToIdle());
        }
        if (this._parseBtn) this._parseBtn.disabled = true;
        if (this._importBtn) this._importBtn.disabled = true;
        if (this._cancelBtn) this._cancelBtn.disabled = true;
        break;
    }
  }

  /**
   * 更新进度条
   * @param {number} done
   * @param {number} total
   * @param {string} lastPath
   */
  _setProgress(done, total, lastPath) {
    if (this._progressFill) {
      const pct = total > 0 ? (done / total * 100) : 0;
      this._progressFill.style.width = `${pct.toFixed(1)}%`;
    }
    if (this._progressText) {
      const shortPath = lastPath.length > 40 ? '...' + lastPath.substring(lastPath.length - 37) : lastPath;
      this._progressText.textContent = `${done} / ${total} — ${shortPath}`;
    }
  }

  /**
   * 追加日志（使用 RAF 批量刷新）
   * @param {'info'|'ok'|'warn'|'error'} level
   * @param {string} msg
   */
  _log(level, msg) {
    const ts = new Date().toLocaleTimeString();
    this._logLines.push({ ts, level, msg });

    if (this._rafPending) return;
    this._rafPending = true;
    requestAnimationFrame(() => {
      this._flushLog();
      this._rafPending = false;
    });
  }

  /** 批量写入日志到 DOM */
  _flushLog() {
    if (!this._logEl) return;
    const frag = document.createDocumentFragment();
    while (this._logLines.length > 0) {
      const { ts, level, msg } = this._logLines.shift();
      const div = document.createElement('div');
      div.className = `github-log-line github-log-${level}`;
      div.textContent = `[${ts}] ${msg}`;
      frag.appendChild(div);
    }
    this._logEl.appendChild(frag);
    // 保留最后 500 行
    while (this._logEl.children.length > 500) {
      this._logEl.removeChild(this._logEl.firstChild);
    }
    // 自动滚动
    this._logEl.scrollTop = this._logEl.scrollHeight;
  }

  /** 清空日志 */
  _clearLog() {
    this._logLines = [];
    if (this._logEl) this._logEl.innerHTML = '';
  }

  // ════════════════════════════════════════════════════════════
  //  辅助
  // ════════════════════════════════════════════════════════════

  /**
   * 获取当前项目的文件夹路径
   * @returns {string|null}
   */
  _getProjectFolderPath() {
    const proj = appState.projects?.find(p => p.id === appState.currentProjectId);
    return proj?.folderPath || null;
  }
}

/**
 * 确保目录存在（递归创建）
 * 复用自 templates.js 的 _ensureDir 模式
 * @param {import('../core/virtual-fs').VirtualFileSystem} vfs
 * @param {string} dirPath
 */
function _ensureDir(vfs, dirPath) {
  if (vfs._dirs.has(dirPath)) return;
  const parts = dirPath.split('/');
  let cur = '';
  for (const p of parts) {
    cur = cur ? `${cur}/${p}` : p;
    if (!vfs._dirs.has(cur)) {
      const parent = cur.includes('/') ? cur.substring(0, cur.lastIndexOf('/')) : '';
      const name = cur.includes('/') ? cur.substring(cur.lastIndexOf('/') + 1) : cur;
      vfs.createDirectory(parent, name);
    }
  }
}

console.log('[github-import] 模块已加载');
