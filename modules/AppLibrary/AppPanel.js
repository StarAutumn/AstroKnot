// ============================================================
//  AppLibrary / AppPanel.js — Dock 应用库列 UI
//  渲染应用列表、处理双击运行/右键菜单/拖拽到3D场景
//  导入弹窗（GitHub URL → 进度条 → 日志）
// ============================================================

import { showToast } from '../module5_SelectAndEdit.js';

export class AppPanel {
  /**
   * @param {import('./AppManager.js').AppManager} appManager
   * @param {import('./AppRunner.js').AppRunner} appRunner
   */
  constructor(appManager, appRunner) {
    this._manager = appManager;
    this._runner = appRunner;
    /** @type {string|null} 当前选中的应用 ID */
    this._selectedId = null;
    /** @type {HTMLElement|null} 导入弹窗元素 */
    this._importDialog = null;
    /** @type {Object|null} 复制的应用（用于粘贴） */
    this._clipboard = null;
    /** @type {string|null} 正在拖拽的应用 ID（用于内部排序） */
    this._draggingAppId = null;
    /** @type {Function|null} 当前右键菜单的关闭处理器 */
    this._currentCloseHandler = null;
    // 慢双击重命名状态
    this._lastClickedId = null;
    this._lastClickTime = 0;
    this._renameActive = false;

    this._init();
  }

  /**
   * 初始化
   * @private
   */
  _init() {
    // 注册列表变更回调
    this._manager.onUpdate(() => this._render());

    // 绑定添加按钮
    const addBtn = document.getElementById('dockAppAddBtn');
    if (addBtn) {
      addBtn.addEventListener('click', () => this._showImportDialog());
    }

    // 绑定应用列表事件委托
    const itemsContainer = document.getElementById('dockAppItems');
    if (itemsContainer) {
      // 单击选中 + 慢双击重命名
      itemsContainer.addEventListener('click', (e) => {
        const item = e.target.closest('.dock-app-item');
        if (!item) return;
        if (this._renameActive) return; // 重命名进行中，不处理

        const appId = item.dataset.appId;
        const now = Date.now();

        // 慢双击检测：同一选中项在 300-1500ms 内再次单击 → 进入重命名
        if (this._selectedId === appId && this._lastClickedId === appId
            && now - this._lastClickTime > 300 && now - this._lastClickTime < 1500) {
          const app = this._manager.getApps().find(a => a.id === appId);
          if (app) this._startInlineRename(item, app);
          this._lastClickedId = null;
          this._lastClickTime = 0;
          return;
        }

        // 普通单击 → 选中
        this._selectedId = appId;
        this._updateSelectedClass();
        this._lastClickedId = appId;
        this._lastClickTime = now;
      });

      // 双击运行
      itemsContainer.addEventListener('dblclick', (e) => {
        const item = e.target.closest('.dock-app-item');
        if (!item) return;
        const app = this._manager.getApps().find(a => a.id === item.dataset.appId);
        if (app) this._runApp(app);
      });

      // 右键菜单（应用项 + 空白区域）
      itemsContainer.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const item = e.target.closest('.dock-app-item');
        if (item) {
          // 应用项右键菜单
          const app = this._manager.getApps().find(a => a.id === item.dataset.appId);
          if (app) this._showAppContextMenu(e.clientX, e.clientY, app);
        } else {
          // 空白区域右键菜单
          this._showBlankContextMenu(e.clientX, e.clientY);
        }
      });

      // 拖拽开始
      itemsContainer.addEventListener('dragstart', (e) => {
        const item = e.target.closest('.dock-app-item');
        if (!item) return;
        this._draggingAppId = item.dataset.appId;
        e.dataTransfer.setData('application/x-astroknot-app', item.dataset.appId);
        e.dataTransfer.effectAllowed = 'copyMove';
        item.classList.add('dragging');
      });

      // 拖拽结束
      itemsContainer.addEventListener('dragend', (e) => {
        const item = e.target.closest('.dock-app-item');
        if (item) item.classList.remove('dragging');
        // 清除所有 drag-over 标记
        for (const child of itemsContainer.children) {
          child.classList.remove('drag-over-top', 'drag-over-bottom');
        }
        this._draggingAppId = null;
      });

      // 拖拽经过其他应用项 — 显示插入指示 + 允许排序
      itemsContainer.addEventListener('dragover', (e) => {
        if (!this._draggingAppId) return;
        const item = e.target.closest('.dock-app-item');
        if (!item || item.dataset.appId === this._draggingAppId) return;

        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        // 根据鼠标位置判断插入到上方还是下方
        const rect = item.getBoundingClientRect();
        const isAbove = (e.clientY - rect.top) < rect.height / 2;

        // 清除其他项的标记
        for (const child of itemsContainer.children) {
          child.classList.remove('drag-over-top', 'drag-over-bottom');
        }
        item.classList.add(isAbove ? 'drag-over-top' : 'drag-over-bottom');
      });

      // 放置 — 执行排序
      itemsContainer.addEventListener('drop', (e) => {
        if (!this._draggingAppId) return;
        const item = e.target.closest('.dock-app-item');
        if (!item || item.dataset.appId === this._draggingAppId) return;

        e.preventDefault();
        e.stopPropagation(); // 阻止冒泡到 2D/3D 画布的 drop

        const rect = item.getBoundingClientRect();
        const isAbove = (e.clientY - rect.top) < rect.height / 2;
        const position = isAbove ? 'before' : 'after';

        this._manager.reorderApps(this._draggingAppId, item.dataset.appId, position);
      });
    }
  }

  /**
   * 刷新应用列表
   */
  async refresh() {
    await this._manager.loadApps();
    this._render();
  }

  /**
   * 渲染应用列表
   * @private
   */
  _render() {
    const container = document.getElementById('dockAppItems');
    if (!container) return;

    const apps = this._manager.getApps();
    container.innerHTML = '';

    if (apps.length === 0) {
      container.innerHTML = '<div class="dock-app-empty">点击 ➕ 从 GitHub<br>导入应用</div>';
      return;
    }

    for (const app of apps) {
      const el = document.createElement('div');
      el.className = 'dock-app-item' + (this._selectedId === app.id ? ' selected' : '');
      el.dataset.appId = app.id;
      el.draggable = true;
      el.title = `${app.name}\n${app.repo}\n${app.fileCount || 0} 个文件`;

      const icon = document.createElement('span');
      icon.className = 'dock-app-icon';
      icon.textContent = app.icon || '📦';
      el.appendChild(icon);

      const label = document.createElement('span');
      label.className = 'dock-app-label';
      label.textContent = app.name;
      el.appendChild(label);

      container.appendChild(el);
    }
  }

  /**
   * 更新选中状态
   * @private
   */
  _updateSelectedClass() {
    const container = document.getElementById('dockAppItems');
    if (!container) return;
    for (const child of container.children) {
      child.classList.toggle('selected', child.dataset.appId === this._selectedId);
    }
  }

  /**
   * 运行应用
   * @private
   */
  async _runApp(app) {
    showToast(`正在打开 ${app.name}...`, 1500);
    await this._runner.open(app);
  }

  // ════════════════════════════════════════════════════════════
  //  右键菜单
  // ════════════════════════════════════════════════════════════

  /**
   * 创建并显示右键菜单（通用方法）
   * @param {number} x
   * @param {number} y
   * @param {Array} items - [{label, action, disabled?}, {type:'separator'}]
   * @private
   */
  _showMenu(x, y, items) {
    this._closeContextMenu();

    const menu = document.createElement('div');
    menu.className = 'dock-context-menu';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    for (const it of items) {
      if (it.type === 'separator') {
        const sep = document.createElement('div');
        sep.className = 'dock-context-separator';
        menu.appendChild(sep);
      } else {
        const btn = document.createElement('div');
        btn.className = 'dock-context-item' + (it.disabled ? ' disabled' : '');
        btn.textContent = it.label;
        if (!it.disabled) {
          btn.addEventListener('click', (e) => {
            e.stopPropagation(); // 关键：阻止冒泡到 document 的 closeHandler
            this._closeContextMenu();
            it.action();
          });
        }
        menu.appendChild(btn);
      }
    }

    document.body.appendChild(menu);

    // 防止菜单超出屏幕
    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        menu.style.left = `${Math.max(8, window.innerWidth - rect.width - 8)}px`;
      }
      if (rect.bottom > window.innerHeight) {
        menu.style.top = `${Math.max(8, window.innerHeight - rect.height - 8)}px`;
      }
    });

    // 使用 mousedown 关闭，避免与 click 事件冲突
    const closeHandler = (e) => {
      if (!menu.contains(e.target)) {
        this._closeContextMenu();
      }
    };
    this._currentCloseHandler = closeHandler;
    // 延迟注册，防止当前 contextmenu 事件立即触发关闭
    setTimeout(() => {
      document.addEventListener('mousedown', closeHandler);
    }, 0);
  }

  /**
   * 应用项右键菜单
   * @private
   */
  _showAppContextMenu(x, y, app) {
    const items = [
      { label: '📂 打开', action: () => this._runApp(app) },
      { type: 'separator' },
      { label: '📋 插入为节点', action: () => this._insertAsNode(app) },
      { label: '🔄 从 GitHub 更新', action: () => this._updateApp(app) },
      { type: 'separator' },
      { label: '📁 打开文件所在位置', action: () => this._openInExplorer(app) },
      { label: '📋 复制', action: () => this._copyApp(app) },
      { label: '🗑 删除', action: () => this._deleteApp(app) },
      { label: '✏ 重命名', action: () => this._renameApp(app) },
      { type: 'separator' },
      { label: 'ℹ 属性', action: () => this._showProperties(app) },
    ];
    this._showMenu(x, y, items);
  }

  /**
   * 空白区域右键菜单
   * @private
   */
  _showBlankContextMenu(x, y) {
    const items = [
      {
        label: '📋 粘贴',
        action: () => this._pasteApp(),
        disabled: !this._clipboard
      },
      { type: 'separator' },
      { label: '🔄 刷新列表', action: () => this.refresh() },
      { label: '📦 导入应用', action: () => this._showImportDialog() },
    ];
    this._showMenu(x, y, items);
  }

  /**
   * 关闭右键菜单
   * @private
   */
  _closeContextMenu() {
    const existing = document.querySelector('.dock-context-menu');
    if (existing) existing.remove();
    if (this._currentCloseHandler) {
      document.removeEventListener('mousedown', this._currentCloseHandler);
      this._currentCloseHandler = null;
    }
  }

  // ════════════════════════════════════════════════════════════
  //  菜单动作
  // ════════════════════════════════════════════════════════════

  /**
   * 插入为节点
   * @private
   */
  async _insertAsNode(app) {
    try {
      showToast(`正在插入 ${app.name} 为节点...`, 1500);
      const node = await this._manager.insertAsNode(app.id, null);
      if (node) {
        showToast(`已插入节点: ${node.name}`, 2000);
      }
    } catch (e) {
      console.error('[AppPanel] 插入节点失败:', e);
      showToast(`插入失败: ${e.message}`, 3000);
    }
  }

  /**
   * 更新应用
   * @private
   */
  async _updateApp(app) {
    this._showImportDialog({ updateAppId: app.id, prefillUrl: app.repo });
  }

  /**
   * 删除应用
   * @private
   */
  async _deleteApp(app) {
    if (!confirm(`确定删除应用 "${app.name}" 吗？\n此操作不可撤销。`)) return;
    try {
      await this._manager.deleteApp(app.id);
      showToast(`已删除: ${app.name}`, 2000);
    } catch (e) {
      console.error('[AppPanel] 删除应用失败:', e);
      showToast(`删除失败: ${e.message}`, 3000);
    }
  }

  /**
   * 在资源管理器中打开应用文件夹
   * @private
   */
  async _openInExplorer(app) {
    try {
      const result = await window.api.openAppInExplorer(app.id);
      if (!result.success) {
        showToast(`打开失败: ${result.error}`, 3000);
      }
    } catch (e) {
      console.error('[AppPanel] 打开文件夹失败:', e);
      showToast(`打开失败: ${e.message}`, 3000);
    }
  }

  /**
   * 复制应用（到内部剪贴板）
   * @private
   */
  _copyApp(app) {
    this._clipboard = app;
    showToast(`已复制: ${app.name}（右键空白处粘贴）`, 2000);
  }

  /**
   * 粘贴应用（克隆副本）
   * @private
   */
  async _pasteApp() {
    if (!this._clipboard) return;
    const app = this._clipboard;
    try {
      showToast(`正在复制 ${app.name}...`, 1500);
      await this._manager.cloneApp(app.id);
      showToast(`已创建副本: ${app.name} (副本)`, 2000);
    } catch (e) {
      console.error('[AppPanel] 粘贴失败:', e);
      showToast(`粘贴失败: ${e.message}`, 3000);
    }
  }

  /**
   * 开始内联重命名（慢双击或右键菜单触发）
   * @param {HTMLElement} el - 应用项 DOM 元素
   * @param {Object} app - 应用数据
   * @private
   */
  _startInlineRename(el, app) {
    const label = el.querySelector('.dock-app-label');
    if (!label) return;

    this._renameActive = true;
    const originalName = label.textContent;

    const input = document.createElement('input');
    input.className = 'dock-app-rename-input';
    input.value = originalName;
    input.style.width = Math.max(label.offsetWidth + 20, 60) + 'px';
    label.replaceWith(input);
    input.focus();
    input.select();

    const finish = async (save) => {
      this._renameActive = false;
      const newName = save ? (input.value.trim() || originalName) : originalName;
      if (newName !== originalName) {
        try {
          await this._manager.renameApp(app.id, newName);
          showToast(`已重命名: ${newName}`, 1500);
        } catch (e) {
          showToast(`重命名失败: ${e.message}`, 3000);
        }
      }
      this._render();
    };

    input.addEventListener('blur', () => finish(true));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
  }

  /**
   * 重命名应用（右键菜单入口 → 找到 DOM 元素后调用内联重命名）
   * @private
   */
  _renameApp(app) {
    const container = document.getElementById('dockAppItems');
    if (!container) return;
    for (const child of container.children) {
      if (child.dataset.appId === app.id) {
        this._startInlineRename(child, app);
        break;
      }
    }
  }

  /**
   * 显示属性（内部弹窗）
   * @private
   */
  _showProperties(app) {
    this._closePropertiesDialog();

    const overlay = document.createElement('div');
    overlay.className = 'app-props-overlay';
    overlay.innerHTML = `
      <div class="app-props-dialog">
        <div class="app-props-header">
          <span class="app-props-title">ℹ 应用属性</span>
          <button class="caption-btn app-props-close">✕</button>
        </div>
        <div class="app-props-body">
          <div class="app-props-row">
            <span class="app-props-label">名称</span>
            <span class="app-props-value">${app.name}</span>
          </div>
          <div class="app-props-row">
            <span class="app-props-label">仓库</span>
            <span class="app-props-value">${app.repo}</span>
          </div>
          <div class="app-props-row">
            <span class="app-props-label">分支</span>
            <span class="app-props-value">${app.ref}</span>
          </div>
          <div class="app-props-row">
            <span class="app-props-label">文件数</span>
            <span class="app-props-value">${app.fileCount || '未知'}</span>
          </div>
          <div class="app-props-row">
            <span class="app-props-label">导入时间</span>
            <span class="app-props-value">${new Date(app.importedAt).toLocaleString()}</span>
          </div>
          <div class="app-props-row">
            <span class="app-props-label">更新时间</span>
            <span class="app-props-value">${new Date(app.lastUpdated).toLocaleString()}</span>
          </div>
          <div class="app-props-row app-props-desc">
            <span class="app-props-label">描述</span>
            <span class="app-props-value">${app.description || '无'}</span>
          </div>
        </div>
        <div class="app-props-footer">
          <button class="app-props-btn-ok">关闭</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => this._closePropertiesDialog();
    overlay.querySelector('.app-props-close').addEventListener('click', close);
    overlay.querySelector('.app-props-btn-ok').addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
  }

  /**
   * 关闭属性弹窗
   * @private
   */
  _closePropertiesDialog() {
    const existing = document.querySelector('.app-props-overlay');
    if (existing) existing.remove();
  }

  // ════════════════════════════════════════════════════════════
  //  导入弹窗
  // ════════════════════════════════════════════════════════════

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
  }

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
}
