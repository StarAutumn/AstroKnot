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

      // 2. 检查 git 是否可用
      log('info', '检查 Git 环境...');
      if (!window.api?.gitCloneAndRead) {
        throw new Error('Git 克隆功能不可用（请在 Electron 环境中运行）');
      }

      // 3. 获取仓库元数据（用于应用名称和描述）
      log('info', '获取仓库信息...');
      const meta = await this._client.fetchRepoMeta(parsed.owner, parsed.repo);
      log('ok', `仓库: ${meta.name || parsed.repo} · 大小: ${(meta.sizeKb / 1024).toFixed(1)}MB`);

      // 4. 生成 app-id
      const appId = `app_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;

      // 5. 构建仓库 URL
      const cloneUrl = `https://github.com/${parsed.owner}/${parsed.repo}.git`;
      log('info', `克隆地址: ${cloneUrl}`);

      // 6. 执行 git clone 并读取文件
      log('info', '开始克隆仓库（使用 git clone --depth 1）...');
      progress(0, 100, '正在克隆...');
      
      const startTime = Date.now();
      const result = await window.api.gitCloneAndRead(cloneUrl);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      log('ok', `克隆完成，耗时 ${elapsed} 秒`);

      const files = result.files || [];
      const total = files.length;
      log('info', `发现 ${total} 个文件`);

      // 7. 写入 VFS
      const vfs = new VirtualFileSystem();
      let succeeded = 0;

      for (let i = 0; i < files.length; i++) {
        if (signal.aborted) break;

        const { path: relativePath, content, isBinary } = files[i];
        
        try {
          const lastSlash = relativePath.lastIndexOf('/');
          if (lastSlash > 0) {
            this._ensureDir(vfs, relativePath.substring(0, lastSlash));
          }

          const fileName = relativePath.split('/').pop();
          const dirPart = lastSlash > 0 ? relativePath.substring(0, lastSlash) : '';
          const file = vfs.createFile(dirPart, fileName);
          if (file) {
            if (isBinary) {
              vfs.setBinaryFile(relativePath, content);
            } else {
              file.content = content;
            }
            succeeded++;
          }

          progress(i + 1, total, relativePath);
          if ((i + 1) % 20 === 0 || i === 0 || i === files.length - 1) {
            log('info', `[${i + 1}/${total}] ${relativePath}`);
          }
        } catch (err) {
          log('warn', `跳过文件 ${relativePath}: ${err.message}`);
        }
      }

      if (signal.aborted) {
        throw new Error('导入已取消');
      }

      log('ok', `读取完成: ${succeeded} 个文件`);

      // 8. 写入磁盘
      log('info', '同步到磁盘...');
      const fileSystem = vfs.toJSON();
      const syncResult = await window.api.syncAppDirectory(appId, fileSystem);

      // 9. 检测 package.json 并自动安装依赖
      const hasPackageJson = files.some(f => f.path === 'package.json');
      if (hasPackageJson && syncResult.success && syncResult.diskPath) {
        log('info', '检测到 package.json，准备安装依赖...');
        
        try {
          log('info', '正在安装依赖 (npm install)...');
          const installResult = await window.api.runCommand('npm install', syncResult.diskPath);
          
          if (installResult.code !== 0) {
            log('warn', `npm install 失败: ${installResult.stderr || installResult.stdout}`);
          } else {
            log('ok', '依赖安装完成');
            
            // 尝试构建
            log('info', '正在构建项目 (npm run build)...');
            const buildResult = await window.api.runCommand('npm run build', syncResult.diskPath);
            
            if (buildResult.code !== 0) {
              log('warn', `构建失败（可忽略）: ${buildResult.stderr?.split('\n')[0] || ''}`);
            } else {
              log('ok', '项目构建完成');
            }
          }
        } catch (npmErr) {
          log('warn', `安装依赖异常: ${npmErr.message}`);
        }
      }

      // 9.5 检测 .env.example 并创建 .env
      if (syncResult.success && syncResult.diskPath && window.api?.envCheckAndCreate) {
        try {
          const envResult = await window.api.envCheckAndCreate(syncResult.diskPath);
          if (envResult.created) {
            log('ok', envResult.source === 'empty'
              ? '已创建空 .env 文件（请按需填写环境变量）'
              : `已从 ${envResult.source} 创建 .env 文件`);
          }
        } catch (e) { /* 忽略 .env 创建失败 */ }
      }

      // 10. 检测项目图标文件
      let appIcon = '📦';
      if (syncResult.success && syncResult.diskPath) {
        appIcon = await this._detectAppIcon(syncResult.diskPath);
      }

      // 11. 创建应用记录
      const now = new Date().toISOString();
      const app = {
        id: appId,
        name: meta.name || parsed.repo,
        repo: `${parsed.owner}/${parsed.repo}`,
        ref: parsed.ref || meta.defaultBranch,
        icon: appIcon,
        description: meta.description || '',
        importedAt: now,
        lastUpdated: now,
        fileCount: succeeded,
      };

      this._apps.push(app);
      await this._saveAppList();

      log('ok', `导入完成: ${app.name} (${succeeded} 个文件)`);
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

    const log = (level, msg) => { if (onLog) onLog(level, msg); };
    const progress = (done, total, msg) => { if (onProgress) onProgress(done, total, msg); };

    this._abortController = new AbortController();
    const signal = this._abortController.signal;

    try {
      const [owner, repo] = app.repo.split('/');
      log('info', `更新应用: ${app.name}`);
      log('info', `仓库: ${app.repo}`);

      // 1. 检查 git 是否可用
      log('info', '检查 Git 环境...');
      if (!window.api?.gitCloneAndRead) {
        throw new Error('Git 克隆功能不可用（请在 Electron 环境中运行）');
      }

      // 2. 构建仓库 URL
      const cloneUrl = `https://github.com/${owner}/${repo}.git`;
      log('info', `克隆地址: ${cloneUrl}`);

      // 3. 执行 git clone 并读取文件
      log('info', '开始克隆仓库（使用 git clone --depth 1）...');
      progress(0, 100, '正在克隆...');
      
      const startTime = Date.now();
      const result = await window.api.gitCloneAndRead(cloneUrl);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      log('ok', `克隆完成，耗时 ${elapsed} 秒`);

      const files = result.files || [];
      const total = files.length;
      log('info', `发现 ${total} 个文件`);

      // 4. 写入 VFS
      const vfs = new VirtualFileSystem();
      let succeeded = 0;

      for (let i = 0; i < files.length; i++) {
        if (signal.aborted) break;

        const { path: relativePath, content, isBinary } = files[i];
        
        try {
          const lastSlash = relativePath.lastIndexOf('/');
          if (lastSlash > 0) {
            this._ensureDir(vfs, relativePath.substring(0, lastSlash));
          }

          const fileName = relativePath.split('/').pop();
          const dirPart = lastSlash > 0 ? relativePath.substring(0, lastSlash) : '';
          const file = vfs.createFile(dirPart, fileName);
          if (file) {
            if (isBinary) {
              vfs.setBinaryFile(relativePath, content);
            } else {
              file.content = content;
            }
            succeeded++;
          }

          progress(i + 1, total, relativePath);
          if ((i + 1) % 20 === 0 || i === 0 || i === files.length - 1) {
            log('info', `[${i + 1}/${total}] ${relativePath}`);
          }
        } catch (err) {
          log('warn', `跳过文件 ${relativePath}: ${err.message}`);
        }
      }

      if (signal.aborted) throw new Error('更新已取消');

      log('ok', `读取完成: ${succeeded} 个文件`);

      // 5. 写入磁盘
      log('info', '同步到磁盘...');
      const syncResult = await window.api.syncAppDirectory(appId, vfs.toJSON());

      // 6. 检测 package.json 并自动安装依赖
      const hasPackageJson = files.some(f => f.path === 'package.json');
      if (hasPackageJson && syncResult.success && syncResult.diskPath) {
        log('info', '检测到 package.json，准备安装依赖...');
        
        try {
          log('info', '正在安装依赖 (npm install)...');
          const installResult = await window.api.runCommand('npm install', syncResult.diskPath);
          
          if (installResult.code !== 0) {
            log('warn', `npm install 失败: ${installResult.stderr || installResult.stdout}`);
          } else {
            log('ok', '依赖安装完成');
            
            log('info', '正在构建项目 (npm run build)...');
            const buildResult = await window.api.runCommand('npm run build', syncResult.diskPath);
            
            if (buildResult.code !== 0) {
              log('warn', `构建失败（可忽略）: ${buildResult.stderr?.split('\n')[0] || ''}`);
            } else {
              log('ok', '项目构建完成');
            }
          }
        } catch (npmErr) {
          log('warn', `安装依赖异常: ${npmErr.message}`);
        }
      }

      // 6.5 检测 .env.example 并创建 .env
      if (window.api?.envCheckAndCreate) {
        try {
          const envResult = await window.api.envCheckAndCreate(syncResult.diskPath);
          if (envResult.created) {
            log('ok', envResult.source === 'empty'
              ? '已创建空 .env 文件（请按需填写环境变量）'
              : `已从 ${envResult.source} 创建 .env 文件`);
          }
        } catch (e) { /* 忽略 */ }
      }

      // 7. 更新记录 + 检测图标
      app.lastUpdated = new Date().toISOString();
      app.fileCount = succeeded;
      if (syncResult.success && syncResult.diskPath) {
        const newIcon = await this._detectAppIcon(syncResult.diskPath);
        if (newIcon !== '📦') app.icon = newIcon;
      }
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
   * 检测项目中的图标文件
   * 按优先级搜索：favicon.ico → favicon.png → icon.png → logo.png → 其他图标
   * @param {string} diskPath - sandbox 磁盘路径
   * @returns {Promise<string>} 图标路径（相对于 sandbox）或 '📦'
   * @private
   */
  async _detectAppIcon(diskPath) {
    if (!window.api?.ideReadDir) return '📦';

    // 图标文件优先级列表（相对于 sandbox 根目录）
    const ICON_PRIORITY = [
      'favicon.ico', 'favicon.png', 'favicon.svg',
      'icon.png', 'icon.svg', 'icon.ico',
      'logo.png', 'logo.svg',
      'app-icon.png', 'app-icon.svg',
      'assets/icon.png', 'assets/icon.svg',
      'assets/logo.png', 'assets/logo.svg',
      'public/favicon.ico', 'public/favicon.png', 'public/favicon.svg',
      'public/icon.png', 'public/icon.svg',
      'static/favicon.ico', 'static/favicon.png',
      'src/assets/icon.png', 'src/assets/logo.png',
      'images/icon.png', 'images/logo.png',
      'img/icon.png', 'img/logo.png',
    ];

    const toFileUrl = (relPath) => 'file:///' + diskPath.replace(/\\/g, '/') + '/' + relPath;

    try {
      // 1. 先检查优先级列表中的文件（使用 ideReadDir 避免读取文件内容）
      const rootItems = await window.api.ideReadDir(diskPath);
      const rootFileNames = new Set((rootItems || []).filter(i => i.type === 'file').map(i => i.name.toLowerCase()));

      for (const relPath of ICON_PRIORITY) {
        const parts = relPath.split('/');
        if (parts.length === 1) {
          // 根目录文件
          if (rootFileNames.has(relPath.toLowerCase())) {
            return toFileUrl(relPath);
          }
        } else if (parts.length === 2) {
          // 一级子目录文件
          const dirName = parts[0];
          const fileName = parts[1];
          try {
            const subItems = await window.api.ideReadDir(diskPath + '/' + dirName);
            if (subItems?.some(i => i.type === 'file' && i.name.toLowerCase() === fileName.toLowerCase())) {
              return toFileUrl(relPath);
            }
          } catch (e) {}
        }
      }

      // 2. 扫描根目录找图标类文件名
      if (rootItems) {
        const iconNames = ['icon', 'logo', 'favicon', 'app', 'brand', 'thumbnail'];
        const imageExts = ['.png', '.svg', '.ico', '.jpg', '.jpeg', '.webp'];

        for (const item of rootItems) {
          if (item.type !== 'file') continue;
          const nameLower = item.name.toLowerCase();
          const nameNoExt = nameLower.replace(/\.[^.]+$/, '');
          if (iconNames.some(n => nameNoExt.includes(n)) && imageExts.some(e => nameLower.endsWith(e))) {
            return toFileUrl(item.name);
          }
        }

        // 检查一级子目录
        for (const item of rootItems) {
          if (item.type !== 'directory') continue;
          try {
            const subItems = await window.api.ideReadDir(diskPath + '/' + item.name);
            if (subItems) {
              for (const subItem of subItems) {
                if (subItem.type !== 'file') continue;
                const nameLower = subItem.name.toLowerCase();
                const nameNoExt = nameLower.replace(/\.[^.]+$/, '');
                if (iconNames.some(n => nameNoExt.includes(n)) && imageExts.some(e => nameLower.endsWith(e))) {
                  return toFileUrl(item.name + '/' + subItem.name);
                }
              }
            }
          } catch (e) {}
        }
      }
    } catch (e) {
      // 忽略检测失败
    }

    return '📦';
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
