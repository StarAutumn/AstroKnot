// ============================================================
//  AppLibrary / AppManager.js — 全局应用库管理器
//  管理 GitHub 克隆应用的 CRUD、磁盘读写、导入、更新
//  应用存储在 AstroKnot-Data/apps/<app-id>/sandbox/
// ============================================================

import { GithubApiClient } from './ide/core/github-api.js';
import { VirtualFileSystem } from './ide/core/virtual-fs.js';
import { createNodeInProject } from '../MoveMode/MoveCore.js';
import { saveCurrentProjectData } from '../module2_TreeData.js';
import { appState } from '../module0_AppState.js';

// ── 二进制文件扩展名（与 main.js 保持一致）──
const BINARY_EXTS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'webp', 'tiff', 'tif', 'svg',
  'mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma',
  'mp4', 'webm', 'avi', 'mov', 'mkv', 'wmv', 'flv',
  'zip', 'gz', 'tar', 'rar', '7z', 'bz2',
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  'pdf', 'exe', 'dll', 'so', 'dylib', 'bin', 'dat',
]);

export class AppManager {
  // ── 内置应用定义（不可删除、不可卸载）──
  static BUILTIN_APPS = [
    {
      id: 'builtin-browser',
      name: '浏览器',
      icon: '🌐',
      description: '内嵌浏览器，可访问教务系统等网站',
      type: 'browser',
      defaultUrl: 'about:blank',
      builtin: true,
      removable: false,
      importedAt: '2026-01-01T00:00:00.000Z',
      lastUpdated: '2026-01-01T00:00:00.000Z',
      fileCount: 0
    },
    {
      id: 'builtin-file-manager',
      name: '此 AstroKnot',
      icon: 'assets/icon.png',
      description: '文件管理器，管理 AstroKnot-Data 目录',
      type: 'file-manager',
      builtin: true,
      removable: false,
      importedAt: '2026-01-01T00:00:00.000Z',
      lastUpdated: '2026-01-01T00:00:00.000Z',
      fileCount: 0
    },
    {
      id: 'builtin-ide',
      name: 'IDE',
      icon: '💻',
      description: 'VSCode 风格代码编辑器，支持 HTML/CSS/JS 开发',
      type: 'ide',
      builtin: true,
      removable: false,
      importedAt: '2026-01-01T00:00:00.000Z',
      lastUpdated: '2026-01-01T00:00:00.000Z',
      fileCount: 0
    },
    {
      id: 'builtin-trash',
      name: '回收站',
      icon: '♻️',
      description: '已删除项目的回收站，可恢复或永久删除',
      type: 'trash',
      builtin: true,
      removable: false,
      importedAt: '2026-01-01T00:00:00.000Z',
      lastUpdated: '2026-01-01T00:00:00.000Z',
      fileCount: 0
    }
  ];

  constructor() {
    /** @type {Array<Object>} 应用列表缓存 */
    this._apps = [];
    /** @type {GithubApiClient} GitHub API 客户端 */
    this._client = new GithubApiClient();
    /** @type {Function|null} 列表变更回调 */
    this._onUpdate = null;
    /** @type {AbortController|null} 当前操作的中断控制器 */
    this._abortController = null;
  }

  /**
   * 加载应用列表（并确保内置应用始终存在）
   * @returns {Promise<Array>}
   */
  async loadApps() {
    try {
      const data = await window.api.readAppList();
      this._apps = data.apps || [];
    } catch (e) {
      console.error('[AppManager] 加载应用列表失败:', e);
      this._apps = [];
    }
    // 确保内置应用始终存在
    this._ensureBuiltinApps();
    return this._apps;
  }

  /**
   * 确保内置应用存在于列表中
   * @private
   */
  _ensureBuiltinApps() {
    let changed = false;
    // 清理不在 BUILTIN_APPS 中但以 builtin- 开头的幽灵应用
    const validBuiltinIds = new Set(AppManager.BUILTIN_APPS.map(a => a.id));
    const beforeLen = this._apps.length;
    this._apps = this._apps.filter(a => {
      if (a.id.startsWith('builtin-') && !validBuiltinIds.has(a.id)) {
        console.warn('[AppManager] 清理无效内置应用:', a.id);
        return false;
      }
      return true;
    });
    if (this._apps.length !== beforeLen) changed = true;

    for (const builtin of AppManager.BUILTIN_APPS) {
      const existing = this._apps.find(a => a.id === builtin.id);
      if (!existing) {
        this._apps.unshift(builtin);
        changed = true;
      } else {
        // 同步内置应用的字段（如名称变更）
        for (const key of Object.keys(builtin)) {
          if (existing[key] !== builtin[key]) {
            existing[key] = builtin[key];
            changed = true;
          }
        }
      }
    }
    if (changed) {
      this._saveAppList(); // 异步保存，不阻塞
    }
  }

  /**
   * 保存应用清单到磁盘
   * @private
   */
  async _saveAppList() {
    await window.api.writeAppList({ apps: this._apps });
  }

  /**
   * 从 GitHub 导入新应用
   * @param {string} repoUrl - 仓库 URL 或 owner/repo
   * @param {Object} callbacks - { onProgress(done, total, msg), onLog(level, msg) }
   * @returns {Promise<Object>} 导入的应用信息
   */
  async importFromGithub(repoUrl, { onProgress, onLog } = {}) {
    const log = (level, msg) => { if (onLog) onLog(level, msg); };
    const progress = (done, total, msg) => { if (onProgress) onProgress(done, total, msg); };

    this._abortController = new AbortController();
    const signal = this._abortController.signal;

    try {
      // 1. 解析 URL
      log('info', `解析仓库地址: ${repoUrl}`);
      const parsed = this._client.parseRepoUrl(repoUrl);
      if (!parsed) {
        throw new Error('无法解析仓库地址，请输入 owner/repo 或 GitHub URL');
      }
      log('ok', `仓库: ${parsed.owner}/${parsed.repo}`);

      // 2. 获取仓库元数据
      log('info', '获取仓库信息...');
      const meta = await this._client.fetchRepoMeta(parsed.owner, parsed.repo);
      log('ok', `分支: ${meta.defaultBranch} · 大小: ${(meta.sizeKb / 1024).toFixed(1)}MB`);

      // 3. 获取文件树
      log('info', '获取文件树...');
      const ref = parsed.ref || meta.defaultBranch;
      const tree = await this._client.fetchTree(parsed.owner, parsed.repo, ref);
      log('ok', `文件树: ${tree.length} 项`);

      // 4. 过滤文件
      const { kept: filtered, skipped } = this._client.filterTree(tree, 10 * 1024 * 1024, parsed.subPath);
      log('ok', `过滤后: ${filtered.length} 个文件（跳过 ${skipped.length} 个）`);

      if (filtered.length === 0) {
        throw new Error('没有可导入的文件');
      }

      // 5. 生成 app-id
      const appId = `app_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;

      // 6. 构建虚拟文件系统
      const vfs = new VirtualFileSystem();

      // 7. 并发下载文件
      log('info', `开始下载 ${filtered.length} 个文件...`);

      const onPoolProgress = (done, total, path) => {
        progress(done, total, path);
        if (done % 10 === 0 || done === total) {
          log('info', `已下载 ${done}/${total}: ${path}`);
        }
      };

      await this._client._runPool(filtered, async (item) => {
        if (signal.aborted) return;

        const { content, isBinary } = await this._client.fetchFile(
          parsed.owner, parsed.repo, ref, item.path, signal
        );

        // 计算路径（直接导入 sandbox 根目录）
        let fullPath = item.path;
        if (parsed.subPath && fullPath.startsWith(parsed.subPath + '/')) {
          fullPath = fullPath.substring(parsed.subPath.length + 1);
        }

        // 确保目录存在
        const lastSlash = fullPath.lastIndexOf('/');
        if (lastSlash > 0) {
          this._ensureDir(vfs, fullPath.substring(0, lastSlash));
        }

        // 创建文件并设置内容
        const finalName = fullPath.split('/').pop();
        const finalDir = lastSlash > 0 ? fullPath.substring(0, lastSlash) : '';
        const file = vfs.createFile(finalDir, finalName);
        if (file) {
          if (isBinary) {
            vfs.setBinaryFile(fullPath, content);
          } else {
            file.content = content;
          }
        }
      }, onPoolProgress, signal);

      if (signal.aborted) {
        throw new Error('导入已取消');
      }

      // 8. 写入磁盘
      log('info', '同步到磁盘...');
      const fileSystem = vfs.toJSON();
      await window.api.syncAppDirectory(appId, fileSystem);

      // 9. 创建应用记录
      const now = new Date().toISOString();
      const app = {
        id: appId,
        name: meta.name || parsed.repo,
        repo: `${parsed.owner}/${parsed.repo}`,
        ref: ref,
        icon: '📦',
        description: meta.description || '',
        importedAt: now,
        lastUpdated: now,
        fileCount: filtered.length,
      };

      this._apps.push(app);
      await this._saveAppList();

      log('ok', `导入完成: ${app.name} (${filtered.length} 个文件)`);
      this._notifyUpdate();

      return app;

    } finally {
      this._abortController = null;
    }
  }

  /**
   * 从 GitHub 更新应用
   * @param {string} appId - 应用 ID
   * @param {Object} callbacks - { onProgress, onLog }
   */
  async updateFromGithub(appId, { onProgress, onLog } = {}) {
    const app = this._apps.find(a => a.id === appId);
    if (!app) throw new Error('应用不存在');

    // 复用导入流程，但写入同一个 appId
    const log = (level, msg) => { if (onLog) onLog(level, msg); };
    const progress = (done, total, msg) => { if (onProgress) onProgress(done, total, msg); };

    this._abortController = new AbortController();
    const signal = this._abortController.signal;

    try {
      const [owner, repo] = app.repo.split('/');
      log('info', `更新应用: ${app.name}`);
      log('info', `仓库: ${app.repo}`);

      // 获取文件树
      log('info', '获取文件树...');
      const tree = await this._client.fetchTree(owner, repo, app.ref);
      log('ok', `文件树: ${tree.length} 项`);

      const { kept: filtered, skipped } = this._client.filterTree(tree, 10 * 1024 * 1024);
      log('ok', `过滤后: ${filtered.length} 个文件（跳过 ${skipped.length} 个）`);

      // 下载文件
      const vfs = new VirtualFileSystem();
      log('info', `开始下载 ${filtered.length} 个文件...`);

      const onPoolProgress = (done, total, path) => {
        progress(done, total, path);
        if (done % 10 === 0 || done === total) {
          log('info', `已下载 ${done}/${total}: ${path}`);
        }
      };

      await this._client._runPool(filtered, async (item) => {
        if (signal.aborted) return;

        const { content, isBinary } = await this._client.fetchFile(
          owner, repo, app.ref, item.path, signal
        );

        let fullPath = item.path;
        const lastSlash = fullPath.lastIndexOf('/');
        if (lastSlash > 0) {
          this._ensureDir(vfs, fullPath.substring(0, lastSlash));
        }

        // 创建文件并设置内容
        const finalName = fullPath.split('/').pop();
        const finalDir = lastSlash > 0 ? fullPath.substring(0, lastSlash) : '';
        const file = vfs.createFile(finalDir, finalName);
        if (file) {
          if (isBinary) {
            vfs.setBinaryFile(fullPath, content);
          } else {
            file.content = content;
          }
        }
      }, onPoolProgress, signal);

      if (signal.aborted) throw new Error('更新已取消');

      // 写入磁盘
      log('info', '同步到磁盘...');
      await window.api.syncAppDirectory(appId, vfs.toJSON());

      // 更新记录
      app.lastUpdated = new Date().toISOString();
      app.fileCount = filtered.length;
      await this._saveAppList();

      log('ok', `更新完成: ${app.name}`);
      this._notifyUpdate();

      return app;

    } finally {
      this._abortController = null;
    }
  }

  /**
   * 读取应用 VFS（用于预览和节点插入）
   * @param {string} appId
   * @returns {Promise<VirtualFileSystem>}
   */
  async loadAppVfs(appId) {
    const tree = await window.api.readAppSandbox(appId);
    if (!tree) return null;
    return new VirtualFileSystem(tree);
  }

  /**
   * 删除应用
   * @param {string} appId
   */
  async deleteApp(appId) {
    // 禁止删除内置应用
    const app = this._apps.find(a => a.id === appId);
    if (app && app.builtin) {
      throw new Error('内置应用不可删除');
    }
    await window.api.deleteApp(appId);
    this._apps = this._apps.filter(a => a.id !== appId);
    await this._saveAppList();
    this._notifyUpdate();
  }

  /**
   * 重命名应用
   * @param {string} appId
   * @param {string} newName
   */
  async renameApp(appId, newName) {
    const app = this._apps.find(a => a.id === appId);
    if (!app) throw new Error('应用不存在');
    if (app.builtin) throw new Error('内置应用不可重命名');
    const name = (newName || '').trim();
    if (!name) throw new Error('名称不能为空');
    app.name = name;
    await this._saveAppList();
    this._notifyUpdate();
  }

  /**
   * 克隆应用（创建副本）
   * @param {string} srcAppId - 源应用 ID
   * @returns {Promise<Object>} 新应用信息
   */
  async cloneApp(srcAppId) {
    const srcApp = this._apps.find(a => a.id === srcAppId);
    if (!srcApp) throw new Error('源应用不存在');

    const newAppId = `app_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    const now = new Date().toISOString();

    // 复制 sandbox 目录
    const result = await window.api.cloneApp(srcAppId, newAppId);
    if (!result.success) throw new Error(result.error || '克隆失败');

    // 创建新应用记录
    const newApp = {
      ...srcApp,
      id: newAppId,
      name: srcApp.name + ' (副本)',
      importedAt: now,
      lastUpdated: now,
    };
    this._apps.push(newApp);
    await this._saveAppList();
    this._notifyUpdate();
    return newApp;
  }

  /**
   * 插入为节点模板
   * @param {string} appId
   * @param {string|null} parentId - 父节点 ID，null 表示根节点
   */
  async insertAsNode(appId, parentId) {
    const app = this._apps.find(a => a.id === appId);
    if (!app) throw new Error('应用不存在');

    const vfs = await this.loadAppVfs(appId);
    if (!vfs) throw new Error('应用文件加载失败');

    // 创建新节点
    const newNode = createNodeInProject({
      name: app.name,
      desc: app.description || `从 ${app.repo} 导入`,
      parentId: parentId || null,
      sizeScale: 1.5,
    });

    if (newNode) {
      // 设置文件系统和编辑模式
      newNode.fileSystem = vfs.toJSON();
      newNode.activeMode = 'code';
      saveCurrentProjectData();

      // 触发磁盘同步（将 fileSystem 写入节点目录）
      // 使用当前项目的 folderPath（具体项目文件夹），而非 currentProjectSavePath（projects 根目录）
      const proj = appState.projects?.find(p => p.id === appState.currentProjectId);
      const projectFolderPath = proj?.folderPath || null;
      if (window.api && window.api.syncSandboxDirectory) {
        window.api.syncSandboxDirectory(projectFolderPath, newNode, newNode.fileSystem);
      }
    }

    return newNode;
  }

  /**
   * 重排序应用列表
   * @param {string} fromId - 被拖动的应用 ID
   * @param {string} toId - 目标应用 ID
   * @param {'before'|'after'} position - 插入到目标之前还是之后
   */
  async reorderApps(fromId, toId, position) {
    const fromIdx = this._apps.findIndex(a => a.id === fromId);
    if (fromIdx === -1) return;

    // 先取出被拖动的元素
    const [moved] = this._apps.splice(fromIdx, 1);

    // 重新查找目标索引（取出后索引可能变化）
    let toIdx = this._apps.findIndex(a => a.id === toId);
    if (toIdx === -1) {
      // 目标不存在，放回原位
      this._apps.splice(fromIdx, 0, moved);
      return;
    }
    if (position === 'after') toIdx++;

    this._apps.splice(toIdx, 0, moved);
    await this._saveAppList();
    this._notifyUpdate();
  }

  /**
   * 取消当前操作
   */
  cancel() {
    if (this._abortController) {
      this._abortController.abort();
    }
  }

  /**
   * 注册列表变更回调
   * @param {Function} callback
   */
  onUpdate(callback) {
    this._onUpdate = callback;
  }

  /**
   * 获取应用列表
   * @returns {Array}
   */
  getApps() {
    return this._apps;
  }

  // ── 私有方法 ──

  _notifyUpdate() {
    if (this._onUpdate) this._onUpdate(this._apps);
  }

  /**
   * 确保目录存在（递归创建）
   * @private
   */
  _ensureDir(vfs, dirPath) {
    const parts = dirPath.split('/');
    let current = '';
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!vfs._dirs.has(current)) {
        vfs._dirs.add(current);
      }
    }
  }
}
