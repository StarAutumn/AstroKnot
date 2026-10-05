// ============================================================
//  AppLibrary/app-import.js — 导入弹窗与外部程序（原型混入）
//  职责：从 GitHub 导入 / 更新应用的导入弹窗（环境检测 /
//  仓库解析 / 进度条 / 日志流），弹窗关闭清理，添加外部
//  程序（文件选择器 → dock-add-external 事件通知 Dock）
//  实现说明：以原型混入（Object.assign(AppPanel.prototype, ...)）
//  挂载到 AppPanel——方法体通过 this 访问实例状态
//  （this._importDialog / this._manager 等），与写在 class
//  体内完全等价；git/npm 检测与克隆逻辑由 AppManager 提供
// ============================================================

export const importMethods = {
  // ════════════════════════════════════════════════════════════
  //  导入弹窗
  // ════════════════════════════════════════════════════════════

  /**
   * 添加外部程序
   * @private
   */
  _addExternalApp() {
    const input = document.createElement('input');
    input.type = 'file';
    // Windows 可执行文件和应用快捷方式
    input.accept = '.exe,.lnk,.bat,.cmd,.ps1';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      
      const filePath = file.path;
      if (!filePath) return;
      
      const name = filePath.split(/[/\\]/).pop().replace(/\.[^.]+$/, '');
      
      // 通知 Dock 添加外部程序
      document.dispatchEvent(new CustomEvent('dock-add-external', {
        detail: { path: filePath, name }
      }));
    });
    input.click();
  },

  /**
   * 显示导入弹窗
   * @param {Object} [opts] - { updateAppId, prefillUrl }
   * @private
   */
  _showImportDialog(opts = {}) {
    const isUpdate = !!opts.updateAppId;

    this._closeImportDialog();

    const overlay = document.createElement('div');
    overlay.className = 'app-import-overlay';
    overlay.innerHTML = `
      <div class="app-import-dialog">
        <div class="app-import-header">
          <span>${isUpdate ? '🔄 更新应用' : '📦 从 GitHub 导入应用'}</span>
          <button class="caption-btn" id="appImportCloseBtn">✕</button>
        </div>
        <div class="app-import-body">
          <div class="app-import-tool-row">
            <button class="app-import-tool-btn" id="appImportToolBtn">🔍 检测环境</button>
            <div class="app-import-tool-warning" id="appImportToolWarning" style="display:none;"></div>
          </div>
          <div class="app-import-input-group">
            <input type="text" id="appImportUrlInput" placeholder="owner/repo 或 GitHub URL" value="${opts.prefillUrl || ''}" ${isUpdate ? 'disabled' : ''} />
            ${!isUpdate ? '<button id="appImportParseBtn">解析</button>' : ''}
          </div>
          <div class="app-import-repo-info" id="appImportRepoInfo"></div>
          <div class="app-import-actions">
            <button class="app-import-btn-primary" id="appImportStartBtn" ${isUpdate ? '' : 'disabled'}>${isUpdate ? '开始更新' : '开始导入'}</button>
            <button class="app-import-btn-secondary" id="appImportCancelBtn">取消</button>
          </div>
          <div class="app-import-progress" id="appImportProgress">
            <div class="app-import-progress-bar">
              <div class="app-import-progress-fill" id="appImportProgressFill"></div>
            </div>
            <div class="app-import-progress-text" id="appImportProgressText">准备中...</div>
          </div>
          <div class="app-import-log" id="appImportLog"></div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this._importDialog = overlay;

    const closeBtn = overlay.querySelector('#appImportCloseBtn');
    const cancelBtn = overlay.querySelector('#appImportCancelBtn');
    const parseBtn = overlay.querySelector('#appImportParseBtn');
    const startBtn = overlay.querySelector('#appImportStartBtn');
    const urlInput = overlay.querySelector('#appImportUrlInput');
    const toolWarning = overlay.querySelector('#appImportToolWarning');
    const toolBtn = overlay.querySelector('#appImportToolBtn');

    // ── 检测系统工具（git / npm）── 点击按钮触发
    let _tools = { git: true, npm: true }; // 默认假定可用，未检测也不阻断
    if (toolBtn) {
      toolBtn.addEventListener('click', async () => {
        if (!window.api?.checkTools) {
          toolWarning.innerHTML = '⚠️ 当前环境不支持检测';
          toolWarning.style.display = 'block';
          return;
        }
        toolBtn.disabled = true;
        toolBtn.textContent = '🔍 检测中...';
        try {
          const tools = await window.api.checkTools();
          _tools = tools;
          // git 行
          let gitLine;
          if (tools.git) {
            gitLine = '<div class="tool-ok">✅ Git ' + (tools.gitVersion || '') + '</div>';
          } else {
            gitLine = '<div class="tool-miss">❌ 未检测到 Git — 导入必需 · <a href="https://git-scm.com/downloads" target="_blank" style="color:#5ab4dc;">下载 Git</a></div>';
          }
          // node.js 行
          let npmLine;
          if (tools.npm) {
            npmLine = '<div class="tool-ok">✅ Node.js ' + (tools.npmVersion || '') + '</div>';
          } else {
            npmLine = '<div class="tool-miss">❌ 未检测到 Node.js — npm install 需要 · <a href="https://nodejs.org/" target="_blank" style="color:#5ab4dc;">下载 Node.js</a></div>';
          }
          toolWarning.innerHTML = gitLine + npmLine;
          toolWarning.style.display = 'block';
        } finally {
          toolBtn.disabled = false;
          toolBtn.textContent = '🔍 检测环境';
        }
      });
    }

    const close = () => {
      this._manager.cancel();
      this._closeImportDialog();
    };

    if (closeBtn) closeBtn.addEventListener('click', close);
    if (cancelBtn) cancelBtn.addEventListener('click', close);

    if (parseBtn) {
      parseBtn.addEventListener('click', async () => {
        const url = urlInput.value.trim();
        if (!url) return;

        parseBtn.disabled = true;
        parseBtn.textContent = '解析中...';

        try {
          const client = this._manager._client;
          const parsed = client.parseRepoUrl(url);
          if (!parsed) throw new Error('无法解析仓库地址');
          const meta = await client.fetchRepoMeta(parsed.owner, parsed.repo);

          const infoEl = overlay.querySelector('#appImportRepoInfo');
          infoEl.innerHTML = `
            <div class="repo-name">${meta.name || parsed.repo}</div>
            <div class="repo-meta">
              ${meta.description || '无描述'}<br>
              ⭐ ${meta.stars || 0} · 🍴 ${meta.forks || 0} · 分支: ${meta.defaultBranch} · ${(meta.sizeKb / 1024).toFixed(1)}MB
            </div>
          `;
          infoEl.classList.add('visible');
          startBtn.disabled = false;
        } catch (e) {
          const infoEl = overlay.querySelector('#appImportRepoInfo');
          infoEl.innerHTML = `<div class="repo-error">❌ 解析失败: ${e.message}</div>`;
          infoEl.classList.add('visible');
          startBtn.disabled = true;
        } finally {
          parseBtn.disabled = false;
          parseBtn.textContent = '解析';
        }
      });
    }

    if (startBtn) {
      startBtn.addEventListener('click', async () => {
        // git 不可用时直接拦截
        if (!_tools.git) {
          const logEl = overlay.querySelector('#appImportLog');
          if (logEl) {
            logEl.classList.add('visible');
            const line = document.createElement('div');
            line.className = 'app-import-log-line app-import-log-error';
            line.textContent = '❌ 未检测到 Git，无法从 GitHub 导入。请先安装 Git：https://git-scm.com/downloads';
            logEl.appendChild(line);
          }
          return;
        }
        startBtn.disabled = true;
        const progressEl = overlay.querySelector('#appImportProgress');
        const progressFill = overlay.querySelector('#appImportProgressFill');
        const progressText = overlay.querySelector('#appImportProgressText');
        const logEl = overlay.querySelector('#appImportLog');
        progressEl.classList.add('visible');
        logEl.classList.add('visible');

        const onProgress = (done, total, msg) => {
          const pct = total > 0 ? Math.round((done / total) * 100) : 0;
          progressFill.style.width = `${pct}%`;
          progressText.textContent = `${done}/${total} (${pct}%) - ${msg || ''}`;
        };
        const onLog = (level, msg) => {
          const line = document.createElement('div');
          line.className = `app-import-log-line app-import-log-${level}`;
          line.textContent = msg;
          logEl.appendChild(line);
          logEl.scrollTop = logEl.scrollHeight;
          while (logEl.children.length > 200) {
            logEl.removeChild(logEl.firstChild);
          }
        };

        try {
          if (isUpdate) {
            await this._manager.updateFromGithub(opts.updateAppId, { onProgress, onLog });
          } else {
            const url = urlInput.value.trim();
            await this._manager.importFromGithub(url, { onProgress, onLog });
          }
          setTimeout(() => this._closeImportDialog(), 1000);
        } catch (e) {
          onLog('error', e.message);
          startBtn.disabled = false;
          startBtn.textContent = '重试';
        }
      });
    }

    if (!isUpdate && urlInput) {
      setTimeout(() => urlInput.focus(), 50);
    } else if (isUpdate && startBtn) {
      setTimeout(() => startBtn.click(), 100);
    }
  },

  /**
   * 关闭导入弹窗
   * @private
   */
  _closeImportDialog() {
    if (this._importDialog) {
      this._importDialog.remove();
      this._importDialog = null;
    }
  }
};
