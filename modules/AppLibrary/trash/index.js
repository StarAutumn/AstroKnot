// ============================================================
//  trash/index.js — 回收站应用主入口
//  管理 AstroKnot-Data/trash/ 目录下被删除的项目
//  功能：列表展示、恢复项目、永久删除单个、清空回收站
//  数据来源：Electron 走 list-trash IPC；Web 走 localStorage
// ============================================================

import { showConfirm } from '../../module4_Confirm.js';
import { showToast } from '../../module5_SelectAndEdit.js';

/** 确保回收站 CSS 只加载一次 */
let _trashCssLoaded = false;
function _ensureCss() {
  if (_trashCssLoaded) return;
  _trashCssLoaded = true;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('./trash.css', import.meta.url).href;
  document.head.appendChild(link);
}

/** 格式化删除时间（ISO → yyyy/MM/dd HH:mm） */
function formatDate(iso) {
  if (!iso) return '未知时间';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '未知时间';
  return d.getFullYear() + '/' +
    String(d.getMonth() + 1).padStart(2, '0') + '/' +
    String(d.getDate()).padStart(2, '0') + ' ' +
    String(d.getHours()).padStart(2, '0') + ':' +
    String(d.getMinutes()).padStart(2, '0');
}

/** 截断过长的路径用于显示 */
function truncatePath(p, maxLen = 60) {
  if (!p) return '';
  if (p.length <= maxLen) return p;
  return '…' + p.slice(p.length - maxLen + 1);
}

export class TrashApp {
  /**
   * @param {Object} app - 应用信息
   * @param {HTMLElement} modal - 模态框容器
   */
  constructor(app, modal) {
    _ensureCss();
    this._app = app;
    this._modal = modal;
    this._items = [];           // 当前回收站列表数据
    this._loading = false;      // 防止并发加载

    this._buildUI();
    this._bindEvents();

    // 将内容挂载到 modal（modal 需由调用方 AppRunner 挂载到 document.body）
    this._modal.appendChild(this._content);

    // 异步加载回收站列表
    this._loadTrash();
  }

  get content() { return this._content; }
  get header() { return this._header; }

  // ════════════════════════════════════════════════════════════
  //  构建 DOM
  // ════════════════════════════════════════════════════════════

  _buildUI() {
    const content = document.createElement('div');
    content.className = 'rich-modal-content app-runner-content trash-app-content';
    this._content = content;

    // 标题栏
    const headerEl = document.createElement('div');
    headerEl.className = 'rich-modal-header';
    headerEl.innerHTML = `
      <span class="caption-icon">♻️</span>
      <h2 class="app-runner-title">回收站</h2>
      <div class="caption-btns">
        <button class="caption-btn app-runner-min" title="最小化">🗕</button>
        <button class="caption-btn app-runner-max" title="最大化/还原">🗖</button>
        <button class="caption-btn app-runner-close" title="关闭">✕</button>
      </div>
    `;
    this._header = headerEl;
    content.appendChild(headerEl);

    // 工具栏
    const toolbar = document.createElement('div');
    toolbar.className = 'trash-toolbar';
    toolbar.innerHTML = `
      <div class="trash-toolbar-left">
        <button class="trash-btn" id="trashRefreshBtn" title="刷新列表">🔄 刷新</button>
        <span class="trash-count" id="trashCount"></span>
      </div>
      <div class="trash-toolbar-right">
        <button class="trash-btn trash-btn-danger" id="trashEmptyBtn" title="清空回收站">🗑️ 清空回收站</button>
      </div>
    `;
    content.appendChild(toolbar);

    // 列表区
    const listWrap = document.createElement('div');
    listWrap.className = 'trash-list-wrap';
    listWrap.innerHTML = `<div class="trash-list" id="trashList"></div>`;
    content.appendChild(listWrap);

    this._listEl = listWrap.querySelector('#trashList');
    this._countEl = toolbar.querySelector('#trashCount');
  }

  _bindEvents() {
    this._content.querySelector('#trashRefreshBtn').addEventListener('click', () => this._loadTrash());
    this._content.querySelector('#trashEmptyBtn').addEventListener('click', () => this._emptyTrash());
  }

  // ════════════════════════════════════════════════════════════
  //  数据加载
  // ════════════════════════════════════════════════════════════

  async _loadTrash() {
    if (this._loading) return;
    this._loading = true;
    this._renderLoading();

    try {
      if (window.__ELECTRON__ && window.api?.listTrash) {
        const r = await window.api.listTrash();
        this._items = (r && r.success && r.items) ? r.items : [];
      } else {
        // Web 环境：从 localStorage 读取
        const { _getWebTrash } = await import('../../module2_TreeData.js');
        const webTrash = _getWebTrash();
        this._items = webTrash.map((p, i) => ({
          trashPath: null,
          folderName: p.name,
          projectName: p.name,
          projectId: p.id,
          originalPath: p.folderPath || null,
          deletedAt: p.deletedAt || null,
          wasUnsaved: !p.folderPath,
          isWeb: true,
          index: i
        }));
      }
      this._renderItems(this._items);
    } catch (e) {
      console.error('[TrashApp] 加载回收站失败:', e);
      this._renderError('加载失败: ' + (e.message || e));
    } finally {
      this._loading = false;
    }
  }

  // ════════════════════════════════════════════════════════════
  //  渲染
  // ════════════════════════════════════════════════════════════

  _renderLoading() {
    this._listEl.innerHTML = `<div class="trash-empty">⏳ 正在加载…</div>`;
  }

  _renderError(msg) {
    this._listEl.innerHTML = `<div class="trash-empty trash-empty-error">⚠️ ${msg}</div>`;
  }

  _renderItems(items) {
    this._items = items || [];
    // 更新计数
    if (this._items.length === 0) {
      this._countEl.textContent = '';
      this._listEl.innerHTML = `<div class="trash-empty">♻️ 回收站为空</div>`;
      return;
    }
    this._countEl.textContent = `共 ${this._items.length} 项`;

    // 清空并渲染列表
    this._listEl.innerHTML = '';
    for (const item of this._items) {
      this._listEl.appendChild(this._createItemCard(item));
    }
  }

  _createItemCard(item) {
    const card = document.createElement('div');
    card.className = 'trash-item';

    const info = document.createElement('div');
    info.className = 'trash-item-info';

    const name = document.createElement('div');
    name.className = 'trash-item-name';
    name.textContent = item.projectName || item.folderName || '未命名项目';
    name.title = name.textContent;
    info.appendChild(name);

    const meta = document.createElement('div');
    meta.className = 'trash-item-meta';
    const metaParts = [`🕐 ${formatDate(item.deletedAt)}`];
    if (item.originalPath) {
      metaParts.push(`📂 ${truncatePath(item.originalPath)}`);
    }
    if (item.wasUnsaved) {
      metaParts.push('⚠️ 未保存项目');
    }
    meta.textContent = metaParts.join('  ·  ');
    meta.title = item.originalPath || '';
    info.appendChild(meta);

    card.appendChild(info);

    // 操作按钮区
    const actions = document.createElement('div');
    actions.className = 'trash-item-actions';

    const restoreBtn = document.createElement('button');
    restoreBtn.className = 'trash-btn trash-btn-restore';
    restoreBtn.textContent = '↩️ 恢复';
    restoreBtn.title = '恢复此项目到项目列表';
    restoreBtn.addEventListener('click', () => this._restore(item));
    actions.appendChild(restoreBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'trash-btn trash-btn-delete';
    deleteBtn.textContent = '❌ 永久删除';
    deleteBtn.title = '永久删除此项目（不可恢复）';
    deleteBtn.addEventListener('click', () => this._permanentDelete(item));
    actions.appendChild(deleteBtn);

    card.appendChild(actions);
    return card;
  }

  // ════════════════════════════════════════════════════════════
  //  操作：恢复
  // ════════════════════════════════════════════════════════════

  async _restore(item) {
    try {
      if (window.__ELECTRON__ && window.api?.restoreFromTrash) {
        // Electron：先恢复文件夹，再读取项目数据加入列表
        const r = await window.api.restoreFromTrash({ trashPath: item.trashPath });
        if (!r || !r.success) {
          showToast('恢复失败: ' + (r?.error || '未知错误'));
          return;
        }
        // 读取恢复后的项目数据
        const dataResult = await window.api.readProjectFromFolder(r.folderPath);
        if (dataResult && dataResult.success) {
          const { addRestoredProject } = await import('../../module2_TreeData.js');
          addRestoredProject(dataResult.data, r.projectName, r.folderPath);
          showToast('项目已恢复: ' + r.projectName);
        } else {
          // 即使读取失败，文件夹已恢复；提示用户手动加载
          showToast('项目文件夹已恢复，但读取数据失败，请手动加载: ' + r.folderPath);
        }
        this._loadTrash();
      } else {
        // Web 环境
        const { _restoreWebTrash, renderProjectList } = await import('../../module2_TreeData.js');
        const restoredId = _restoreWebTrash(item.index);
        if (restoredId) {
          renderProjectList();
          showToast('项目已恢复');
        } else {
          showToast('恢复失败');
        }
        this._loadTrash();
      }
    } catch (e) {
      console.error('[TrashApp] 恢复失败:', e);
      showToast('恢复失败: ' + (e.message || e));
    }
  }

  // ════════════════════════════════════════════════════════════
  //  操作：永久删除单个
  // ════════════════════════════════════════════════════════════

  _permanentDelete(item) {
    const name = item.projectName || item.folderName || '未命名项目';
    showConfirm(
      `永久删除项目「${name}」？\n此操作不可恢复，项目及其所有内容将被彻底删除。`,
      async () => {
        try {
          if (window.__ELECTRON__ && window.api?.permanentlyDeleteTrashItem) {
            const r = await window.api.permanentlyDeleteTrashItem({ trashPath: item.trashPath });
            if (!r || !r.success) {
              showToast('永久删除失败: ' + (r?.error || '未知错误'));
              return;
            }
          } else {
            // Web 环境
            const { _permanentDeleteWebTrash } = await import('../../module2_TreeData.js');
            _permanentDeleteWebTrash(item.index);
          }
          showToast('已永久删除: ' + name);
          this._loadTrash();
        } catch (e) {
          console.error('[TrashApp] 永久删除失败:', e);
          showToast('永久删除失败: ' + (e.message || e));
        }
      },
      null,
      '永久删除'
    );
  }

  // ════════════════════════════════════════════════════════════
  //  操作：清空回收站
  // ════════════════════════════════════════════════════════════

  _emptyTrash() {
    if (this._items.length === 0) {
      showToast('回收站已经是空的');
      return;
    }
    showConfirm(
      `清空回收站？\n回收站中的 ${this._items.length} 个项目将被永久删除，此操作不可恢复！`,
      async () => {
        try {
          if (window.__ELECTRON__ && window.api?.emptyTrash) {
            const r = await window.api.emptyTrash();
            if (!r || !r.success) {
              showToast('清空失败: ' + (r?.error || '未知错误'));
              return;
            }
          } else {
            // Web 环境
            const { _emptyWebTrash } = await import('../../module2_TreeData.js');
            _emptyWebTrash();
          }
          showToast('回收站已清空');
          this._loadTrash();
        } catch (e) {
          console.error('[TrashApp] 清空回收站失败:', e);
          showToast('清空失败: ' + (e.message || e));
        }
      },
      null,
      '清空回收站'
    );
  }

  // ════════════════════════════════════════════════════════════
  //  销毁
  // ════════════════════════════════════════════════════════════

  destroy() {
    this._items = null;
    this._listEl = null;
    this._countEl = null;
    this._content = null;
    this._header = null;
    this._modal = null;
    this._app = null;
  }
}
