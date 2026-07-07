// ============================================================
// main-terminal.js — 内置终端的主进程管理模块
// 管理 node-pty 会话生命周期，通过流式 IPC 推送数据到渲染进程
// ============================================================
const { ipcMain, BrowserWindow, app } = require('electron');
const path = require('path');
const fs = require('fs');

// 延迟加载 node-pty（N-API 预编译二进制，兼容 Electron）
let nodePty = null;
try {
  nodePty = require('node-pty');
} catch (err) {
  console.error('[terminal] node-pty 加载失败:', err.message);
}

// 终端会话表：Map<sessionId, { pty, webContentsId, cwd, cols, rows }>
const _sessions = new Map();
let _sessionIdCounter = 0;

/**
 * 按 webContentsId 获取该窗口的所有终端会话 ID
 */
function _getSessionsByWebContents(wcId) {
  const result = [];
  for (const [id, s] of _sessions) {
    if (s.webContentsId === wcId) result.push(id);
  }
  return result;
}

/**
 * 选择 shell 程序
 */
function _resolveShell() {
  if (process.platform === 'win32') {
    // 优先 PowerShell，回退到 cmd
    return process.env.COMSPEC || 'powershell.exe';
  }
  return process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash');
}

/**
 * 构建子进程环境变量
 */
function _buildEnv() {
  const env = { ...process.env };
  // Windows 上确保 nodejs/npm 在 PATH 中
  if (process.platform === 'win32') {
    const pathSep = ';';
    const extraPaths = [
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs'),
      path.join(process.env.APPDATA || '', 'npm')
    ];
    env.PATH = extraPaths.join(pathSep) + pathSep + (env.PATH || '');
  }
  // 强制 UTF-8 输出，避免中文乱码
  env.LANG = 'zh_CN.UTF-8';
  env.TERM = 'xterm-256color';
  return env;
}

/**
 * 销毁单个终端会话
 */
function _killSession(id) {
  const s = _sessions.get(id);
  if (!s) return;
  try { s.pty.kill(); } catch (_) {}
  _sessions.delete(id);
}

/**
 * 清理指定窗口的所有终端（窗口关闭/IDE 销毁时调用）
 */
function killSessionsForWebContents(wcId) {
  for (const id of _getSessionsByWebContents(wcId)) {
    _killSession(id);
  }
}

/**
 * 清理所有终端（app 退出时调用）
 */
function killAllSessions() {
  for (const id of Array.from(_sessions.keys())) {
    _killSession(id);
  }
}

/**
 * 注册终端相关 IPC 处理器
 */
function bindTerminalIPC() {
  // 1. 创建终端会话
  ipcMain.handle('terminal-spawn', async (event, opts) => {
    if (!nodePty) return { success: false, error: 'node-pty 未安装或加载失败' };
    const { cwd, cols = 80, rows = 24 } = opts || {};

    // 确保工作目录存在
    const workDir = cwd || app.getPath('home');
    if (!fs.existsSync(workDir)) {
      fs.mkdirSync(workDir, { recursive: true });
    }

    const sessionId = 'term_' + (++_sessionIdCounter);
    const shell = _resolveShell();
    const shellArgs = (process.platform === 'win32' && shell.toLowerCase().includes('powershell'))
      ? ['-NoLogo']
      : [];

    let pty;
    try {
      pty = nodePty.spawn(shell, shellArgs, {
        name: 'xterm-color',
        cols,
        rows,
        cwd: workDir,
        env: _buildEnv()
      });
    } catch (err) {
      return { success: false, error: 'spawn 失败: ' + err.message };
    }

    const wcId = event.sender.id;
    _sessions.set(sessionId, { pty, webContentsId: wcId, cwd: workDir, cols, rows });

    // 流式数据：pty → 渲染进程
    pty.onData((data) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win || win.isDestroyed()) {
        _killSession(sessionId);
        return;
      }
      win.webContents.send('terminal-data', { id: sessionId, data });
    });

    // 退出处理
    pty.onExit(({ exitCode }) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win && !win.isDestroyed()) {
        win.webContents.send('terminal-exit', { id: sessionId, exitCode });
      }
      _sessions.delete(sessionId);
    });

    return { success: true, sessionId, shell, cwd: workDir };
  });

  // 2. 写入输入数据（单向，高频流式）
  ipcMain.on('terminal-input', (event, { id, data }) => {
    const s = _sessions.get(id);
    if (s) s.pty.write(data);
  });

  // 3. 调整尺寸
  ipcMain.on('terminal-resize', (event, { id, cols, rows }) => {
    const s = _sessions.get(id);
    if (s) {
      try { s.pty.resize(cols, rows); s.cols = cols; s.rows = rows; } catch (_) {}
    }
  });

  // 4. 销毁单个终端
  ipcMain.on('terminal-kill', (event, { id }) => {
    _killSession(id);
  });

  // 5. 获取 sandbox 工作目录（复用 main.js 中 show-sandbox-file-in-folder 的路径逻辑）
  ipcMain.handle('terminal-get-sandbox-cwd', async (event, projectFolderPath, nodeId) => {
    if (!nodeId) return { success: false, error: '缺少 nodeId' };
    const sandboxDir = projectFolderPath
      ? path.join(projectFolderPath, 'nodes', nodeId, 'sandbox')
      : path.join(app.getPath('userData'), 'sandbox-tmp', nodeId, 'sandbox');
    fs.mkdirSync(sandboxDir, { recursive: true });
    return { success: true, cwd: sandboxDir };
  });

  // 6. 列出指定目录的 npm scripts（主进程读磁盘，避免渲染进程越权）
  ipcMain.handle('terminal-list-npm-scripts', async (event, cwd) => {
    try {
      if (!cwd) return { success: true, scripts: null };
      const pkgPath = path.join(cwd, 'package.json');
      if (!fs.existsSync(pkgPath)) return { success: true, scripts: null };
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const scripts = pkg.scripts || {};
      return { success: true, scripts, name: pkg.name || '' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { bindTerminalIPC, killSessionsForWebContents, killAllSessions };
