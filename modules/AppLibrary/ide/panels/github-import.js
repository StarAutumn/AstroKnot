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
    if (!vfs || !this._tree) return;

    const { owner, repo, ref, subPath } = this._parsedRepo;
    const branch = ref || this._repoMeta.defaultBranch;
    const maxMb = parseInt(this._maxMbEl?.value || '10');
    const maxFileSize = maxMb * 1024 * 1024;

    // 过滤文件树
    const { kept, skipped } = this._client.filterTree(this._tree, maxFileSize, subPath);
    this._log('info', `准备导入 ${kept.length} 个文件（跳过 ${skipped.length} 个）`);

    for (const s of skipped) {
      if (s.reason === 'too-large') {
        this._log('warn', `跳过 (超过 ${maxMb}MB): ${s.path}`);
      }
    }

    this._setState('importing');
    this._abortController = new AbortController();

    let done = 0;
    const total = kept.length;
    let succeeded = 0;
    let failed = 0;

    // 并发拉取并写入 VFS
    const { succeeded: succ, failed: fail } = await this._client._runPool(
      kept,
      async (item) => {
        if (this._abortController.signal.aborted) return;

        const { content, isBinary } = await this._client.fetchFile(
          owner, repo, branch, item.path, this._abortController.signal
        );

        // 计算目标路径（直接导入 sandbox 根目录，不创建子文件夹）
        let fullPath = item.path;
        if (subPath && fullPath.startsWith(subPath + '/')) {
          fullPath = fullPath.substring(subPath.length + 1);
        }

        // 确保目录存在
        const lastSlash = fullPath.lastIndexOf('/');
        if (lastSlash > 0) {
          _ensureDir(vfs, fullPath.substring(0, lastSlash));
        }

        // 文件名冲突处理
        let finalPath = fullPath;
        const fileName = fullPath.split('/').pop();
        const dirPart = lastSlash > 0 ? fullPath.substring(0, lastSlash) : '';
        if (vfs.getFile(fullPath)) {
          let i = 1;
          const dotIdx = fileName.lastIndexOf('.');
          const base = dotIdx > 0 ? fileName.substring(0, dotIdx) : fileName;
          const ext = dotIdx > 0 ? fileName.substring(dotIdx) : '';
          let newName = `${base}-${i}${ext}`;
          let newPath = dirPart ? `${dirPart}/${newName}` : newName;
          while (vfs.getFile(newPath)) {
            i++;
            newName = `${base}-${i}${ext}`;
            newPath = dirPart ? `${dirPart}/${newName}` : newName;
          }
          finalPath = newPath;
        }

        // 创建文件并设置内容
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
      },
      (d, t, lastPath) => {
        done = d;
        this._setProgress(d, t, lastPath);
        if (done % 5 === 0 || done === total) {
          this._log('ok', `[${done}/${t}] ${lastPath}`);
        }
      },
      this._abortController.signal
    );

    failed = fail.length;

    // 检查是否被取消
    if (this._abortController.signal.aborted) {
      this._log('warn', `用户取消导入（已导入 ${succeeded} / ${total}）`);
    } else {
      this._log('ok', `导入完成: 成功 ${succeeded}，失败 ${failed}`);
    }

    // 同步到磁盘
    this._log('info', '同步到磁盘...');
    const currentNodeId = this._ctx.currentNodeId;
    if (currentNodeId) {
      const projectFolderPath = this._getProjectFolderPath();
      const ok = await vfs.syncAllToDisk(projectFolderPath, currentNodeId);
      if (ok) {
        const node = appState.nodeMap.get(currentNodeId);
        if (node) node.fileSystem = vfs.toJSON();
        this._log('ok', '磁盘同步完成');
      } else {
        this._log('error', '磁盘同步失败');
      }
    }

    // 刷新文件树
    if (this._ctx.fileTree) {
      this._ctx.fileTree.refresh();
    }
    this._ctx.emit('fileSystemChange');

    // 设置最终状态
    if (this._abortController.signal.aborted) {
      this._setState('cancelled', { succeeded, failed, total });
    } else {
      this._setState('done', { succeeded, failed, total });
    }

    this._abortController = null;
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
