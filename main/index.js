// ============================================================
//  main/index.js — Electron 主进程入口
//  负责创建应用程序窗口，监听生命周期事件
// ============================================================

const { app, BrowserWindow, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const dataSettings = require('../data-settings');

const { bindWindowIPC } = require('./ipc-window');
const { bindFileIPC } = require('./ipc-file/index');
const { bindEmergencyIPC } = require('./ipc-emergency');
const { bindVersionGraphIPC } = require('./ipc-version-graph');
const { bindStorageIPC } = require('./ipc-storage');
const { bindDataSettingsIPC } = require('./ipc-data-settings');
const { bindBrowserIPC } = require('./ipc-browser');
const { bindMobileSyncIPC, stopMobileSyncServer } = require('./ipc-mobile-sync');
const { startHMR } = require('./hmr');
const { bindTerminalIPC, killSessionsForWebContents, killAllSessions } = require('./main-terminal');

// ── GPU 兼容性：允许在不支持的 GPU 上使用 WebGL ──
app.commandLine.appendSwitch('ignore-gpu-blocklist');

// ════════════════════════════════════════════════════════════
//  核心路径设置：在 app.whenReady() 之前设置 userData 路径
//  这影响 localStorage、缓存、Session 等所有 Electron 内部存储
//  确保打包后不会读取开发环境的设置
// ════════════════════════════════════════════════════════════
let appRoot;
if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
  // 开发环境：使用 __dirname，不改变 userData 路径
  appRoot = path.resolve(__dirname, '..');
  dataSettings.init(appRoot);
  // 开发环境保留默认的 userData（C 盘），方便调试
  console.log('[main] 开发环境，userData 保持默认:', app.getPath('userData'));
} else {
  // 打包后：使用 resources 的父目录（应用安装目录）
  appRoot = path.dirname(process.resourcesPath);
  dataSettings.init(appRoot);
  // 将 Electron 的 userData 路径重定向到自定义数据目录
  // 这样 localStorage、缓存等都不会存在 C 盘的 AppData 中
  const customUserData = dataSettings.getSystemDir();
  if (customUserData) {
    app.setPath('userData', customUserData);
    console.log('[main] 打包环境，userData 重定向到:', customUserData);
  }
}

/** 全局窗口引用（热更新发送 IPC 用） */
let mainWindow = null;

/**
 * 创建主窗口
 * frame: false → 无边框窗口，使用自定义标题栏
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    frame: false,
    icon: path.join(appRoot, 'assets', 'icon.png'), // 任务栏/标题栏图标（开发模式默认是 Electron 图标）
    webPreferences: {
      preload: path.join(appRoot, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,           // 允许 preload 使用 Node.js 内置模块（path, fs 等）
      webviewTag: true          // 允许渲染进程使用 <webview> 标签（内置浏览器）
    }
  });

  mainWindow.loadFile('index.html');

  // ── GPU / 渲染进程崩溃自动恢复 ──
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('=== [崩溃恢复] 渲染进程终止 ===');
    console.error('  reason:', details.reason);
    console.error('  exitCode:', details.exitCode);
    console.error('  detailed:', JSON.stringify(details));
    // 清理崩溃窗口的终端会话，避免僵尸进程
    killSessionsForWebContents(mainWindow.webContents.id);
    // 崩溃后自动重载窗口
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.session.flushStorageData();
      mainWindow.reload();
    }
  });

  mainWindow.on('maximize', () => mainWindow.webContents.send('maximize-change', true));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('maximize-change', false));
  mainWindow.on('enter-full-screen', () => mainWindow.webContents.send('fullscreen-change', true));
  mainWindow.on('leave-full-screen', () => mainWindow.webContents.send('fullscreen-change', false));
}

// ── GPU 进程崩溃全局恢复 ──
app.on('gpu-process-crashed', (event, killed) => {
  console.error('[GPU崩溃] GPU 进程终止, killed:', killed);
  // 重启 GPU 进程：重载所有窗口
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.reload();
  }
});

// ── 启动 ──
app.whenReady().then(() => {
  // appRoot 和 dataSettings.init() 已在文件顶部执行（需要在 whenReady 之前设置 userData 路径）
  console.log('[main] appRoot:', appRoot);
  console.log('[main] dataRoot:', dataSettings.getDataRoot());
  console.log('[main] systemDir:', dataSettings.getSystemDir());

  // 注册 astroknot-local:// 协议，用于渲染进程访问本地音视频文件
  // 避免将大文件转成 data URI（Chromium 对此支持不好）
  protocol.handle('astroknot-local', (request) => {
    // URL 格式：astroknot-local://C:/path/to/file.mp4 或 astroknot-local:///path/to/file.mp4
    // 提取 scheme 之后的部分作为文件路径
    let filePath = request.url.replace('astroknot-local://', '');
    // URL 解码
    filePath = decodeURIComponent(filePath);
    // Windows 路径修复：如果以 /C:/ 形式开头，去掉前导 /
    if (/^\/[A-Za-z]:\//.test(filePath)) {
      filePath = filePath.slice(1);
    }
    return net.fetch('file://' + filePath.replace(/\\/g, '/'));
  });

  createWindow();

  // 注册各 IPC 模块
  bindWindowIPC(mainWindow);
  bindDataSettingsIPC(mainWindow, appRoot);
  bindStorageIPC();
  bindEmergencyIPC();
  bindVersionGraphIPC();
  bindFileIPC(mainWindow);
  bindTerminalIPC();
  bindBrowserIPC(mainWindow);
  bindMobileSyncIPC();
  startHMR(mainWindow);

  // ── before-quit 兜底：正常退出/重启时触发渲染进程同步落盘应急备份 ──
  // 覆盖：点关闭、Alt+F4、系统关机。不覆盖：任务管理器强杀/断电（由定时备份兼底）
  let _flushing = false;
  app.on('before-quit', (e) => {
    if (_flushing) return;
    const win = mainWindow;
    if (!win || win.isDestroyed()) return;
    e.preventDefault();
    _flushing = true;
    // 立即清理所有 pty 进程，避免僵尸进程
    killAllSessions();
    // 关闭移动端同步服务
    stopMobileSyncServer();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      app.exit(0);
    };
    try {
      win.webContents.send('emergency-flush');
      win.webContents.once('ipc-message', (_e, channel) => {
        if (channel === 'emergency-flush-ready') finish();
      });
    } catch (_) { finish(); }
    // 超时保险：2 秒后强制退出，避免卡死
    setTimeout(finish, 2000);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
