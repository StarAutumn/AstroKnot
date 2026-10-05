// ============================================================
//  main/ipc-file/app-library.js — 全局应用库 IPC
// ============================================================
const { ipcMain, shell, app } = require('electron');
const path = require('path');
const fs = require('fs');
const dataSettings = require('../../data-settings');
const {
  _readFileSystemFromDiskBinary,
  _copyDirSync, _syncFileSystemToDisk,
} = require('./helpers');

// ── 服务器变量（模块级）──
const _appServers = new Map(); // appId -> { server, port }
let _ideSandboxServer = null; // { server, port }

// ── 应用固定端口分配（41001-41999，持久化到 apps/ports.json）──
// 背景：localStorage 按 origin（协议+域名+端口）分区，随机端口导致应用每次
// 重启 origin 漂移、设置丢失。固定端口保证 origin 稳定，应用设置可跨重启保留。
const APP_PORT_BASE = 41001;
const APP_PORT_MAX = 41999;

function _portMapPath() {
  return path.join(dataSettings.getAppsDir(), 'ports.json');
}

function _loadPortMap() {
  try {
    if (fs.existsSync(_portMapPath())) {
      const m = JSON.parse(fs.readFileSync(_portMapPath(), 'utf-8'));
      if (m && typeof m === 'object' && !Array.isArray(m)) return m;
    }
  } catch (err) {
    console.error('[app-ports] 读取端口表失败:', err.message);
  }
  return {};
}

function _savePortMap(map) {
  try {
    const dir = dataSettings.getAppsDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(_portMapPath(), JSON.stringify(map, null, 2), 'utf-8');
  } catch (err) {
    console.error('[app-ports] 写入端口表失败:', err.message);
  }
}

// 探测端口当前是否可绑定（被外部进程占用则返回 false）
function _canBind(port) {
  const net = require('net');
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, '127.0.0.1');
  });
}

// 为应用分配空闲端口：跳过已映射给其他应用的端口和不可绑定端口
async function _allocFreePort(appId, portMap) {
  const takenByOthers = new Set(
    Object.entries(portMap).filter(([id]) => id !== appId).map(([, p]) => p)
  );
  const start = portMap[appId] || APP_PORT_BASE;
  for (let p = Math.max(start, APP_PORT_BASE); p <= APP_PORT_MAX; p++) {
    if (takenByOthers.has(p)) continue;
    if (await _canBind(p)) return p;
  }
  return null;
}

// ── IPC：全局应用库 ──
function bindAppLibraryIPC(mainWindow) {

  // 读取应用清单 index.json
  ipcMain.handle('read-app-list', async () => {
    try {
      const appsDir = dataSettings.getAppsDir();
      const indexPath = path.join(appsDir, 'index.json');
      if (!fs.existsSync(indexPath)) return { apps: [] };
      return JSON.parse(fs.readFileSync(indexPath, 'utf-8')) || { apps: [] };
    } catch (err) {
      console.error('[read-app-list] 错误:', err);
      return { apps: [] };
    }
  });

  // 写入应用清单 index.json
  ipcMain.handle('write-app-list', async (event, appList) => {
    try {
      const appsDir = dataSettings.getAppsDir();
      if (!fs.existsSync(appsDir)) fs.mkdirSync(appsDir, { recursive: true });
      const indexPath = path.join(appsDir, 'index.json');
      fs.writeFileSync(indexPath, JSON.stringify(appList, null, 2), 'utf-8');
      return { success: true };
    } catch (err) {
      console.error('[write-app-list] 错误:', err);
      return { success: false, error: err.message };
    }
  });

  // 读取应用 sandbox 文件树（跳过 node_modules 避免 VFS 膨胀）
  ipcMain.handle('read-app-sandbox', async (event, appId) => {
    try {
      const appsDir = dataSettings.getAppsDir();
      const sandboxDir = path.join(appsDir, appId, 'sandbox');
      if (!fs.existsSync(sandboxDir)) return null;
      const tree = _readFileSystemFromDiskBinary(sandboxDir, true);
      if (tree) tree.name = '/';
      return tree;
    } catch (err) {
      console.error('[read-app-sandbox] 错误:', err);
      return null;
    }
  });

  // 获取应用 sandbox 磁盘路径
  ipcMain.handle('get-app-sandbox-path', async (event, appId) => {
    const appsDir = dataSettings.getAppsDir();
    const sandboxDir = path.join(appsDir, appId, 'sandbox');
    if (fs.existsSync(sandboxDir)) return sandboxDir;
    return null;
  });

  // ── 检测 .env.example 并创建空 .env ──
  ipcMain.handle('env-check-and-create', async (event, dirPath) => {
    if (!dirPath || !fs.existsSync(dirPath)) return { created: false };
    const envFile = path.join(dirPath, '.env');
    if (fs.existsSync(envFile)) return { created: false, reason: 'exists' };
    const templates = ['.env.example', '.env.sample', '.env.template'];
    let templatePath = null;
    for (const t of templates) {
      const p = path.join(dirPath, t);
      if (fs.existsSync(p)) { templatePath = p; break; }
    }
    try {
      if (templatePath) {
        const content = fs.readFileSync(templatePath, 'utf-8');
        fs.writeFileSync(envFile, content, 'utf-8');
        return { created: true, source: path.basename(templatePath) };
      } else {
        fs.writeFileSync(envFile, '# AstroKnot 自动创建的环境变量文件\n', 'utf-8');
        return { created: true, source: 'empty' };
      }
    } catch (e) {
      return { created: false, error: e.message };
    }
  });

  // 查找应用入口 HTML 文件
  ipcMain.handle('find-app-entry-html', async (event, appId) => {
    const appsDir = dataSettings.getAppsDir();
    const sandboxDir = path.join(appsDir, appId, 'sandbox');
    if (!fs.existsSync(sandboxDir)) return null;

    const candidates = [
      'index.html',
      'dist/index.html',
      'build/index.html',
      'out/index.html',
      '.output/public/index.html',
      'www/index.html',
      'public/index.html',
      'docs/index.html',
    ];
    for (const c of candidates) {
      const fullPath = path.join(sandboxDir, c);
      if (fs.existsSync(fullPath)) return fullPath;
    }

    const found = _findHtmlFiles(sandboxDir, sandboxDir, 3);
    return found;
  });

  /**
   * 递归搜索 HTML 文件（排除 node_modules，限制深度）
   */
  function _findHtmlFiles(dir, baseDir, maxDepth) {
    if (maxDepth < 0) return null;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          const result = _findHtmlFiles(fullPath, baseDir, maxDepth - 1);
          if (result) return result;
        } else if (entry.name.endsWith('.html')) {
          return fullPath;
        }
      }
    } catch { /* 忽略权限错误 */ }
    return null;
  }

  // 启动本地 HTTP 服务器为应用提供静态文件服务
  ipcMain.handle('start-app-server', async (event, appId) => {
    if (_appServers.has(appId)) {
      const existing = _appServers.get(appId);
      return { port: existing.port };
    }

    const appsDir = dataSettings.getAppsDir();
    const sandboxDir = path.join(appsDir, appId, 'sandbox');
    if (!fs.existsSync(sandboxDir)) return null;

    const http = require('http');
    const url = require('url');

    const server = http.createServer((req, res) => {
      const parsedUrl = url.parse(req.url);
      let filePath = path.join(sandboxDir, parsedUrl.pathname === '/' ? 'index.html' : parsedUrl.pathname);

      const resolved = path.resolve(filePath);
      if (!resolved.startsWith(path.resolve(sandboxDir))) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      const securityHeaders = {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      };

      if (!fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
        const indexPath = path.join(resolved, 'index.html');
        if (fs.existsSync(indexPath)) {
          filePath = indexPath;
        } else {
          const fallbackPath = path.join(sandboxDir, 'index.html');
          const distFallback = path.join(sandboxDir, 'dist', 'index.html');
          if (fs.existsSync(fallbackPath)) {
            filePath = fallbackPath;
          } else if (fs.existsSync(distFallback)) {
            filePath = distFallback;
          } else {
            res.writeHead(404, securityHeaders);
            res.end('Not Found');
            return;
          }
        }
      }

      try {
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes = {
          '.html': 'text/html', '.htm': 'text/html',
          '.js': 'application/javascript', '.mjs': 'application/javascript',
          '.css': 'text/css', '.scss': 'text/css',
          '.json': 'application/json',
          '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
          '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
          '.webp': 'image/webp',
          '.woff': 'font/woff', '.woff2': 'font/woff2',
          '.ttf': 'font/ttf', '.otf': 'font/otf', '.eot': 'application/vnd.ms-fontobject',
          '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
          '.mp4': 'video/mp4', '.webm': 'video/webm',
          '.wasm': 'application/wasm',
          '.map': 'application/json',
        };
        const contentType = mimeTypes[ext] || 'application/octet-stream';
        const data = fs.readFileSync(filePath);
        res.writeHead(200, {
          'Content-Type': contentType + (ext === '.html' ? '; charset=utf-8' : ''),
          ...securityHeaders,
        });
        res.end(data);
      } catch (err) {
        res.writeHead(500, securityHeaders);
        res.end('Internal Server Error');
      }
    });

    // 固定端口：读端口表 → 被外部进程抢占时重新分配并更新表
    const portMap = _loadPortMap();
    let port = portMap[appId];
    if (!port || !(await _canBind(port))) {
      port = await _allocFreePort(appId, portMap);
      if (!port) {
        console.error('[start-app-server] 端口池耗尽（' + APP_PORT_BASE + '-' + APP_PORT_MAX + '）');
        return null;
      }
      portMap[appId] = port;
      _savePortMap(portMap);
    }

    return new Promise((resolve) => {
      server.listen(port, '127.0.0.1', () => {
        _appServers.set(appId, { server, port });
        resolve({ port });
      });
      server.on('error', (err) => {
        console.error('[start-app-server] 错误:', err);
        resolve(null);
      });
    });
  });

  // 停止应用的 HTTP 服务器
  ipcMain.handle('stop-app-server', async (event, appId) => {
    const entry = _appServers.get(appId);
    if (entry) {
      entry.server.close();
      _appServers.delete(appId);
    }
    return { success: true };
  });

  // ── IDE 沙盒预览服务器（单实例，为节点预览 iframe 提供静态文件服务）──

  ipcMain.handle('ide-start-sandbox-server', async (event, sandboxDir, injectScript) => {
    if (_ideSandboxServer) {
      try { _ideSandboxServer.server.close(); } catch (e) {}
      _ideSandboxServer = null;
    }

    if (!sandboxDir || !fs.existsSync(sandboxDir)) return null;

    const http = require('http');
    const url = require('url');

    const server = http.createServer((req, res) => {
      const parsedUrl = url.parse(req.url);
      let filePath = path.join(sandboxDir, parsedUrl.pathname === '/' ? 'index.html' : parsedUrl.pathname);

      const resolved = path.resolve(filePath);
      if (!resolved.startsWith(path.resolve(sandboxDir))) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      // IDE 预览不设 COOP/COEP（与原 srcdoc 模式一致），避免阻止 CDN 资源
      const securityHeaders = {};

      if (!fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
        const indexPath = path.join(resolved, 'index.html');
        if (fs.existsSync(indexPath)) {
          filePath = indexPath;
        } else {
          const fallbackPath = path.join(sandboxDir, 'index.html');
          const distFallback = path.join(sandboxDir, 'dist', 'index.html');
          if (fs.existsSync(fallbackPath)) {
            filePath = fallbackPath;
          } else if (fs.existsSync(distFallback)) {
            filePath = distFallback;
          } else {
            res.writeHead(404, securityHeaders);
            res.end('Not Found');
            return;
          }
        }
      }

      try {
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes = {
          '.html': 'text/html', '.htm': 'text/html',
          '.js': 'application/javascript', '.mjs': 'application/javascript',
          '.css': 'text/css', '.scss': 'text/css',
          '.json': 'application/json',
          '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
          '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
          '.webp': 'image/webp',
          '.woff': 'font/woff', '.woff2': 'font/woff2',
          '.ttf': 'font/ttf', '.otf': 'font/otf', '.eot': 'application/vnd.ms-fontobject',
          '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
          '.mp4': 'video/mp4', '.webm': 'video/webm',
          '.wasm': 'application/wasm',
          '.map': 'application/json',
        };
        const contentType = mimeTypes[ext] || 'application/octet-stream';
        let data = fs.readFileSync(filePath);

        if (ext === '.html' && injectScript) {
          let html = data.toString('utf8');
          const safeScript = String(injectScript).replace(/<\/script/gi, '<\\/script');
          const injectTag = '<script>\n' + safeScript + '\n</script>\n';
          if (html.includes('<head>')) {
            html = html.replace('<head>', '<head>\n' + injectTag);
          } else if (html.includes('</head>')) {
            html = html.replace('</head>', injectTag + '</head>');
          } else if (html.includes('<body>')) {
            html = html.replace('<body>', injectTag + '<body>');
          } else {
            html = injectTag + html;
          }
          data = Buffer.from(html, 'utf8');
        }

        res.writeHead(200, {
          'Content-Type': contentType + (ext === '.html' ? '; charset=utf-8' : ''),
          ...securityHeaders,
        });
        res.end(data);
      } catch (err) {
        res.writeHead(500, securityHeaders);
        res.end('Internal Server Error');
      }
    });

    return new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        _ideSandboxServer = { server, port };
        resolve({ port });
      });
      server.on('error', (err) => {
        console.error('[ide-start-sandbox-server] 错误:', err);
        resolve(null);
      });
    });
  });

  // 停止 IDE 沙盒预览服务器
  ipcMain.handle('ide-stop-sandbox-server', async () => {
    if (_ideSandboxServer) {
      try { _ideSandboxServer.server.close(); } catch (e) {}
      _ideSandboxServer = null;
    }
    return { success: true };
  });

  // 写入应用 sandbox 到磁盘（增量同步：保留终端安装的 node_modules/dist/.env 等非 VFS 管辖文件）
  ipcMain.handle('sync-app-directory', async (event, appId, fileSystem) => {
    try {
      const appsDir = dataSettings.getAppsDir();
      const sandboxDir = path.join(appsDir, appId, 'sandbox');

      fs.mkdirSync(sandboxDir, { recursive: true });
      if (fileSystem) {
        _syncFileSystemToDisk(fileSystem, sandboxDir);
      }
      return { success: true, diskPath: sandboxDir };
    } catch (err) {
      console.error('[sync-app-directory] 错误:', err);
      return { success: false, error: err.message };
    }
  });

  // 删除应用
  ipcMain.handle('delete-app', async (event, appId) => {
    try {
      const appsDir = dataSettings.getAppsDir();
      const appDir = path.join(appsDir, appId);
      if (fs.existsSync(appDir)) {
        fs.rmSync(appDir, { recursive: true, force: true });
      }
      // 释放固定端口（端口表瘦身，空位可复用）
      const portMap = _loadPortMap();
      if (portMap[appId] !== undefined) {
        delete portMap[appId];
        _savePortMap(portMap);
      }
      return { success: true };
    } catch (err) {
      console.error('[delete-app] 错误:', err);
      return { success: false, error: err.message };
    }
  });

  // 扫描「有目录无注册记录」的孤儿应用目录（导入中断/回滚失败的产物）
  ipcMain.handle('scan-orphan-apps', async () => {
    try {
      const appsDir = dataSettings.getAppsDir();
      if (!fs.existsSync(appsDir)) return { success: true, orphans: [] };
      let manifest = { apps: [] };
      const indexPath = path.join(appsDir, 'index.json');
      if (fs.existsSync(indexPath)) {
        try {
          manifest = JSON.parse(fs.readFileSync(indexPath, 'utf-8')) || { apps: [] };
        } catch (_) { /* 清单损坏则按空处理，只报目录 */ }
      }
      const registered = new Set((manifest.apps || []).map(a => a.id));
      const orphans = [];
      for (const name of fs.readdirSync(appsDir)) {
        // 应用目录格式：app_<时间戳>_<随机码>，其余（index.json/ports.json 等）跳过
        if (!/^app_[0-9]+_[0-9a-z]+$/.test(name)) continue;
        if (!registered.has(name)) orphans.push(name);
      }
      return { success: true, orphans };
    } catch (err) {
      console.error('[scan-orphan-apps] 错误:', err);
      return { success: false, error: err.message, orphans: [] };
    }
  });

  // 在资源管理器中打开应用所在文件夹
  ipcMain.handle('open-app-in-explorer', async (event, appId) => {
    try {
      const appsDir = dataSettings.getAppsDir();
      const sandboxDir = path.join(appsDir, appId, 'sandbox');
      if (fs.existsSync(sandboxDir)) {
        shell.openPath(sandboxDir);
        return { success: true };
      }
      return { success: false, error: '应用目录不存在' };
    } catch (err) {
      console.error('[open-app-in-explorer] 错误:', err);
      return { success: false, error: err.message };
    }
  });

  // 克隆应用
  ipcMain.handle('clone-app', async (event, srcAppId, destAppId) => {
    try {
      const appsDir = dataSettings.getAppsDir();
      const srcSandbox = path.join(appsDir, srcAppId, 'sandbox');
      const destSandbox = path.join(appsDir, destAppId, 'sandbox');

      if (!fs.existsSync(srcSandbox)) {
        return { success: false, error: '源应用目录不存在' };
      }

      fs.mkdirSync(destSandbox, { recursive: true });
      _copyDirSync(srcSandbox, destSandbox);

      return { success: true };
    } catch (err) {
      console.error('[clone-app] 错误:', err);
      return { success: false, error: err.message };
    }
  });

}

module.exports = { bindAppLibraryIPC };