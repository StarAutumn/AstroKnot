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

  // 导入 Markdown 文件
  readMarkdownFile: () => ipcRenderer.invoke('read-markdown-file'),
  
  // 在系统默认浏览器中打开外部链接
  openExternalUrl: (url) => ipcRenderer.invoke('open-external-url', url),

  // 在系统默认应用中打开本地文件
  openLocalFile: (filePath) => ipcRenderer.invoke('open-local-file', filePath),

  // 在文件管理器中显示文件所在目录
  showFileInFolder: (filePath) => ipcRenderer.invoke('show-file-in-folder', filePath),

  // 提取 exe 图标（返回 data URI）
  extractExeIcon: (filePath) => ipcRenderer.invoke('extract-icon', filePath),

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
  versionDeleteGraph: (versionKey) => ipcRenderer.invoke('version-delete-graph', versionKey)
});