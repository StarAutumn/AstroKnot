// ============================================================
//  预加载脚本
//  在渲染进程和主进程之间创建安全的通信桥梁
// ============================================================

const { contextBridge, ipcRenderer } = require('electron');

// 标记 Electron 环境（供 index.html 检测）
contextBridge.exposeInMainWorld('__ELECTRON__', true);

// 暴露平台信息（供渲染进程跨平台适配）
contextBridge.exposeInMainWorld('_platform', process.platform);

// 读取 package.json 中的版本号（不用 path 模块，避免沙箱兼容问题）
let appVersion = '1.0.0';
try {
  // __dirname 在 preload 中总是指向 app 根目录
  const pkg = require(__dirname + '/package.json');
  appVersion = pkg.version || '1.0.0';
} catch (_) { /* 回退默认值 */ }

// 暴露 API 给渲染进程
contextBridge.exposeInMainWorld('api', {
  // 应用版本号
  appVersion,
  
  // 首次安装检测（每次安装后首次启动为 true）
  checkFirstRun: () => ipcRenderer.invoke('check-first-run'),
  
  // 保存项目到文件夹
  saveProject: (projectData) => ipcRenderer.invoke('save-project', projectData),
  
  // 从文件夹加载项目
  loadProject: () => ipcRenderer.invoke('load-project'),
  
  // 选择文件夹
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  
  // 选择加载文件夹
  selectFolderForLoad: () => ipcRenderer.invoke('select-folder-for-load'),

  // 选择背景图片文件（图片/动图）
  selectImageFile: () => ipcRenderer.invoke('select-image-file'),

  // 选择外部程序（exe/lnk 等）
  selectExternalApp: () => ipcRenderer.invoke('select-external-app'),

  // 导入 Markdown 文件
  readMarkdownFile: () => ipcRenderer.invoke('read-markdown-file'),
  
  // 在系统默认浏览器中打开外部链接
  openExternalUrl: (url) => ipcRenderer.invoke('open-external-url', url),

  // 在系统默认应用中打开本地文件
  openLocalFile: (filePath) => ipcRenderer.invoke('open-local-file', filePath),

  // 在文件管理器中显示文件所在目录
  showFileInFolder: (filePath) => ipcRenderer.invoke('show-file-in-folder', filePath),

  // 在资源管理器中显示 sandbox 文件
  showSandboxFileInFolder: (projectFolderPath, node, vfsPath) => ipcRenderer.invoke('show-sandbox-file-in-folder', projectFolderPath, node, vfsPath),

  // ── Sandbox 文件实时同步（增量写入磁盘）──
  // 写入单个 sandbox 文件
  writeSandboxFile: (projectFolderPath, node, vfsPath, content, isBinary) => ipcRenderer.invoke('write-sandbox-file', projectFolderPath, node, vfsPath, content, isBinary),
  // 删除单个 sandbox 文件
  deleteSandboxFile: (projectFolderPath, node, vfsPath) => ipcRenderer.invoke('delete-sandbox-file', projectFolderPath, node, vfsPath),
  // 重命名 sandbox 文件/目录
  renameSandboxFile: (projectFolderPath, node, oldPath, newPath) => ipcRenderer.invoke('rename-sandbox-file', projectFolderPath, node, oldPath, newPath),
  // 同步整个 sandbox 目录（用于项目保存或全量同步）
  syncSandboxDirectory: (projectFolderPath, node, fileSystem) => ipcRenderer.invoke('sync-sandbox-directory', projectFolderPath, node, fileSystem),

  // ── 全局应用库（GitHub 克隆应用）──
  // 读取应用清单 index.json
  readAppList: () => ipcRenderer.invoke('read-app-list'),
  // 写入应用清单 index.json
  writeAppList: (appList) => ipcRenderer.invoke('write-app-list', appList),
  // 读取应用 sandbox 文件树（支持二进制）
  readAppSandbox: (appId) => ipcRenderer.invoke('read-app-sandbox', appId),
  // 写入应用 sandbox 到磁盘
  syncAppDirectory: (appId, fileSystem) => ipcRenderer.invoke('sync-app-directory', appId, fileSystem),
  // 删除应用目录
  deleteApp: (appId) => ipcRenderer.invoke('delete-app', appId),
  // 在资源管理器中打开应用所在文件夹
  openAppInExplorer: (appId) => ipcRenderer.invoke('open-app-in-explorer', appId),
  // 克隆应用 sandbox 目录
  cloneApp: (srcAppId, destAppId) => ipcRenderer.invoke('clone-app', srcAppId, destAppId),

  // ── 节点级实时磁盘同步（阶段1：仅已保存项目）──
  // 创建项目文件夹（新建项目时立即调用，确保后续实时同步可用）
  createProjectFolder: (savePath, projectName, allowDialog) => ipcRenderer.invoke('create-project-folder', savePath, projectName, allowDialog),
  // 创建节点文件夹（nodes/{节点名称_[nodeId前8位]})
  createNodeFolder: (projectFolderPath, node) => ipcRenderer.invoke('create-node-folder', projectFolderPath, node),
  // 删除节点文件夹（递归）
  deleteNodeFolder: (projectFolderPath, node) => ipcRenderer.invoke('delete-node-folder', projectFolderPath, node),
  // 写入节点 content.html（自动创建文件夹）
  writeNodeContent: (projectFolderPath, node, content) => ipcRenderer.invoke('write-node-content', projectFolderPath, node, content),
  // 删除项目文件夹（递归删除整个项目目录）
  deleteProjectFolder: (projectFolderPath) => ipcRenderer.invoke('delete-project-folder', projectFolderPath),
  // 删除未保存项目的临时文件夹（sandbox-tmp/{projectId}）
  deleteSandboxTmpFolder: (projectId) => ipcRenderer.invoke('delete-sandbox-tmp-folder', projectId),

  // ── 回收站 ──
  // 移动项目到回收站（payload: { folderPath, projectId, projectName, projectData }）
  moveProjectToTrash: (payload) => ipcRenderer.invoke('move-project-to-trash', payload),
  // 列出回收站内容（返回 { items: [...] }）
  listTrash: () => ipcRenderer.invoke('list-trash'),
  // 从回收站恢复项目（payload: { trashPath } → { folderPath, projectName }）
  restoreFromTrash: (payload) => ipcRenderer.invoke('restore-from-trash', payload),
  // 无弹窗读取项目数据（供恢复后加载数据）
  readProjectFromFolder: (folderPath) => ipcRenderer.invoke('read-project-from-folder', folderPath),
  // 永久删除回收站中的单个项目（payload: { trashPath }）
  permanentlyDeleteTrashItem: (payload) => ipcRenderer.invoke('permanently-delete-trash-item', payload),
  // 清空回收站
  emptyTrash: () => ipcRenderer.invoke('empty-trash'),

  // 另存为项目（复制项目文件夹到新位置）
  saveProjectAs: (sourcePath, projectName) => ipcRenderer.invoke('save-project-as', sourcePath, projectName),

  // 导出文件（保存内容到指定位置）
  exportFile: (data) => ipcRenderer.invoke('export-file', data),

  // 提取 exe 图标（返回 data URI）
  extractExeIcon: (filePath) => ipcRenderer.invoke('extract-icon', filePath),

  // ── 内置终端 ──
  // 创建终端会话（返回 sessionId）
  terminalSpawn: (opts) => ipcRenderer.invoke('terminal-spawn', opts),
  // 写入终端输入（单向，高频流式）
  terminalInput: (id, data) => ipcRenderer.send('terminal-input', { id, data }),
  // 调整终端尺寸
  terminalResize: (id, cols, rows) => ipcRenderer.send('terminal-resize', { id, cols, rows }),
  // 销毁单个终端
  terminalKill: (id) => ipcRenderer.send('terminal-kill', { id }),
  // 获取 sandbox 工作目录（兼容未保存项目）
  terminalGetSandboxCwd: (projectFolderPath, nodeId) => ipcRenderer.invoke('terminal-get-sandbox-cwd', projectFolderPath, nodeId),
  // 列出 npm 脚本
  terminalListNpmScripts: (cwd) => ipcRenderer.invoke('terminal-list-npm-scripts', cwd),
  // 监听主进程推送的终端数据流
  onTerminalData: (callback) => {
    ipcRenderer.on('terminal-data', (_e, payload) => callback(payload));
  },
  // 监听终端退出事件
  onTerminalExit: (callback) => {
    ipcRenderer.on('terminal-exit', (_e, payload) => callback(payload));
  },

  // 关闭应用程序
  closeApp: () => ipcRenderer.send('close-app'),

  // 窗口控制
  winMinimize: () => ipcRenderer.send('win-minimize'),
  winMaximize: () => ipcRenderer.send('win-maximize'),
  winUnmaximize: () => ipcRenderer.send('win-unmaximize'),
  winClose: () => ipcRenderer.send('win-close'),
  toggleFullscreen: () => ipcRenderer.send('toggle-fullscreen'),

  // 监听窗口最大化/还原状态变化
  onMaximizeChange: (callback) => {
    ipcRenderer.on('maximize-change', (_event, isMaximized) => callback(isMaximized));
  },

  // 监听全屏切换
  onFullscreenChange: (callback) => {
    ipcRenderer.on('fullscreen-change', (_event, isFullscreen) => callback(isFullscreen));
  },

  // 热更新事件（开发模式）
  onHotUpdate: (callback) => {
    ipcRenderer.on('hot-update', (_event, data) => callback(data));
  },

  // ── 应急备份（崩溃兑底）──
  emergencySave: (payload) => ipcRenderer.invoke('emergency-save', payload),
  emergencyList: () => ipcRenderer.invoke('emergency-list'),
  emergencyRestore: (projectId) => ipcRenderer.invoke('emergency-restore', projectId),
  emergencyDismiss: (projectId) => ipcRenderer.invoke('emergency-dismiss', projectId),
  emergencyDismissAll: () => ipcRenderer.invoke('emergency-dismiss-all'),
  // 监听退出时的同步落盘指令（before-quit）
  onEmergencyFlush: (callback) => {
    ipcRenderer.on('emergency-flush', () => callback());
  },
  // 回应落盘完成
  emergencyFlushReady: () => ipcRenderer.send('emergency-flush-ready'),

  // ── 快速笔记（文件系统存储）──
  saveQuickNotes: (data) => ipcRenderer.invoke('save-quick-notes', data),
  loadQuickNotes: (data) => ipcRenderer.invoke('load-quick-notes', data),

  // ── 版本图（内容寻址存储）──
  versionSaveGraph: (projectId, graph) => ipcRenderer.invoke('version-save-graph', projectId, graph),
  versionLoadGraph: (projectId) => ipcRenderer.invoke('version-load-graph', projectId),
  versionSaveBlob: (projectId, hash, content) => ipcRenderer.invoke('version-save-blob', projectId, hash, content),
  versionSaveBlobs: (projectId, hashToContent) => ipcRenderer.invoke('version-save-blobs', projectId, hashToContent),
  versionLoadBlob: (projectId, hash) => ipcRenderer.invoke('version-load-blob', projectId, hash),
  versionListGraphs: () => ipcRenderer.invoke('version-list-graphs'),
  versionDeleteGraph: (versionKey) => ipcRenderer.invoke('version-delete-graph', versionKey),

  // ── 内置浏览器：主进程拦截弹出窗口后通知渲染进程新建标签页 ──
  onBrowserOpenTab: (callback) => {
    ipcRenderer.on('browser-open-tab', (_event, url) => callback(url));
  },
  // 内置浏览器：监听下载进度更新
  onBrowserDownloadUpdate: (callback) => {
    ipcRenderer.on('browser-download-update', (_event, data) => callback(data));
  },
  // 内置浏览器：清除隐私模式数据
  browserClearPrivateData: () => ipcRenderer.invoke('browser-clear-private-data'),
  // 内置浏览器：Cookies 管理
  browserGetCookies: (partition) => ipcRenderer.invoke('browser-get-cookies', partition),
  browserDeleteCookie: (partition, url, name) => ipcRenderer.invoke('browser-delete-cookie', { partition, url, name }),
  browserClearCookies: (partition) => ipcRenderer.invoke('browser-clear-cookies', partition),
  // 内置浏览器：网页截图保存
  browserSaveScreenshot: (dataUrl, filename) => ipcRenderer.invoke('browser-save-screenshot', { dataUrl, filename }),
  // 内置浏览器：DevTools 侧边栏
  browserAttachDevTools: (targetId) => ipcRenderer.invoke('browser-attach-devtools', { targetId }),
  browserUpdateDevToolsBounds: (left, top, width, height) => ipcRenderer.invoke('browser-update-devtools-bounds', { left, top, width, height }),
  browserCloseDevTools: (targetId) => ipcRenderer.invoke('browser-close-devtools', { targetId }),
  onBrowserDevToolsBoundsChanged: (callback) => {
    ipcRenderer.on('browser-devtools-bounds-changed', () => callback());
  },
  removeBrowserDevToolsBoundsChanged: () => {
    ipcRenderer.removeAllListeners('browser-devtools-bounds-changed');
  },

  // ── 数据目录配置 ──
  getDataSettings: () => ipcRenderer.invoke('get-data-settings'),
  setDataRoot: (dataRoot) => ipcRenderer.invoke('set-data-root', dataRoot),
  getDefaultDataRoot: () => ipcRenderer.invoke('get-default-data-root'),
  selectDataFolder: () => ipcRenderer.invoke('select-data-folder'),
  getProjectsDir: () => ipcRenderer.invoke('get-projects-dir'),
  getQuicknotesDir: () => ipcRenderer.invoke('get-quicknotes-dir'),

  // ── 系统偏好设置文件化 ──
  // 同步读取 preferences.json（启动引导用）
  readPreferencesSync: () => ipcRenderer.sendSync('read-preferences-sync'),
  // 异步写入 preferences.json（防抖落盘用）
  writePreferences: (data) => ipcRenderer.invoke('write-preferences', data),
  // 同步写入 preferences.json（退出落盘用）
  flushPreferencesSync: (data) => ipcRenderer.sendSync('flush-preferences-sync', data),

  // ── 文件管理器（仅限 AstroKnot-Data 目录）──
  fmReadDirTree: () => ipcRenderer.invoke('fm-read-dir-tree'),
  fmReadDir: (relPath) => ipcRenderer.invoke('fm-read-dir', relPath),
  fmReadFile: (relPath) => ipcRenderer.invoke('fm-read-file', relPath),
  fmCreateItem: (relDir, name, itemType) => ipcRenderer.invoke('fm-create-item', relDir, name, itemType),
  fmDeleteItem: (relPath) => ipcRenderer.invoke('fm-delete-item', relPath),
  fmRenameItem: (relPath, newName) => ipcRenderer.invoke('fm-rename-item', relPath, newName),
  fmCopyItem: (srcRelPath, destRelDir, destName, isMove) => ipcRenderer.invoke('fm-copy-item', srcRelPath, destRelDir, destName, isMove),

  // ── IDE 真实文件系统（无路径限制）──
  ideSelectFolder: () => ipcRenderer.invoke('ide-select-folder'),
  ideReadDirTree: (dirPath) => ipcRenderer.invoke('ide-read-dir-tree', dirPath),
  ideReadDir: (dirPath) => ipcRenderer.invoke('ide-read-dir', dirPath),
  ideReadFile: (filePath) => ipcRenderer.invoke('ide-read-file', filePath),
  ideWriteFile: (filePath, content) => ipcRenderer.invoke('ide-write-file', filePath, content),
  ideCreateItem: (dirPath, name, itemType) => ipcRenderer.invoke('ide-create-item', dirPath, name, itemType),
  ideDeleteItem: (filePath) => ipcRenderer.invoke('ide-delete-item', filePath),
  ideRenameItem: (filePath, newName) => ipcRenderer.invoke('ide-rename-item', filePath, newName),
  ideGetNodeSandboxPath: (node, projectFolderPath) => ipcRenderer.invoke('ide-get-node-sandbox-path', node, projectFolderPath),
  ideSyncSandboxToNode: (sandboxDir) => ipcRenderer.invoke('ide-sync-sandbox-to-node', sandboxDir),
});