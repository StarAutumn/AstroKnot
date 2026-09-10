// ============================================================
//  main/ipc-mobile-sync.js — 移动端局域网同步服务
//
//  流程: 渲染进程点击「移动端同步」→ 启动本地 HTTP 服务（一次性配对码）
//        → 生成 astroknot://sync 深链二维码 → 手机系统相机扫码唤起 App
//        → App 拉取项目列表 (/api/info) → 下载项目 tgz (/api/project)
//
//  安全: 服务仅存活 15 分钟（空闲自动关闭）；所有请求需带配对 token；
//        数据仅在局域网内传输，不经过任何第三方服务器
//  打包: 自研 ustar writer（支持 GNU longname）+ zlib gzip，零新依赖
// ============================================================

const { ipcMain } = require('electron');
const http = require('http');
const zlib = require('zlib');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const fs = require('fs');
const dataSettings = require('../data-settings');

const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 分钟无请求自动关闭

let server = null;
let serverPort = 0;
let syncToken = '';
let idleTimer = null;

// ── 工具 ──

/** 找局域网 IPv4 地址（优先 192.168/10. 段） */
function findLanIPv4() {
  const ifaces = os.networkInterfaces();
  const candidates = [];
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      if (iface.family !== 'IPv4' || iface.internal) continue;
      candidates.push(iface.address);
    }
  }
  // 优先常见的私有网段
  candidates.sort((a, b) => {
    const score = (ip) => /^192\.168\./.test(ip) ? 0 : /^10\./.test(ip) ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2 : 3;
    return score(a) - score(b);
  });
  return candidates[0] || '127.0.0.1';
}

function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => stopServer(), IDLE_TIMEOUT_MS);
}

function stopServer() {
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  if (server) {
    try { server.close(); } catch (_) { /* 已关闭 */ }
    server = null;
    serverPort = 0;
    syncToken = '';
    console.log('[mobile-sync] 服务已关闭');
  }
}

/** JSON 响应 */
function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*', // 浏览器开发模式调试用
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

// ── 项目目录枚举 ──

/** 列出所有项目（dir / name / 大小 / 文件数） */
function listProjects() {
  const projectsDir = dataSettings.getProjectsDir();
  if (!fs.existsSync(projectsDir)) return [];
  const result = [];
  for (const dir of fs.readdirSync(projectsDir)) {
    const full = path.join(projectsDir, dir);
    let stat;
    try { stat = fs.statSync(full); } catch (_) { continue; }
    if (!stat.isDirectory()) continue;
    const pjPath = path.join(full, 'project.json');
    if (!fs.existsSync(pjPath)) continue; // 不是有效 AstroKnot 项目
    let name = dir;
    try {
      const pj = JSON.parse(fs.readFileSync(pjPath, 'utf8'));
      if (pj.projectName) name = pj.projectName;
    } catch (_) { /* 用目录名 */ }
    const meta = walkStats(full);
    result.push({ dir, name, fileCount: meta.fileCount, bytes: meta.bytes, mtime: stat.mtimeMs });
  }
  return result.sort((a, b) => b.mtime - a.mtime);
}

/** 递归统计（跳过 .versiongraph） */
function walkStats(dir) {
  let fileCount = 0;
  let bytes = 0;
  (function walk(d) {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
    for (const e of entries) {
      if (e.name === '.versiongraph') continue; // 版本图不同步
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile()) {
        fileCount++;
        try { bytes += fs.statSync(full).size; } catch (_) { /* 忽略 */ }
      }
    }
  })(dir);
  return { fileCount, bytes };
}

// ── ustar 打包（自研，兼容移动端自研 parser） ──

/** 写 512 字节 tar header */
function tarHeader(filePath, size, mtimeSec) {
  const buf = Buffer.alloc(512);
  let name = filePath;
  let prefix = '';
  if (name.length > 100) {
    // ustar prefix 拆分：在 '/' 处切开，使 name ≤ 100 且 prefix ≤ 155
    const maxPre = 155;
    let cut = name.lastIndexOf('/', name.length - 100);
    if (cut > maxPre) throw new Error('路径过长: ' + name);
    if (cut < 0) throw new Error('路径过长: ' + name);
    prefix = name.slice(0, cut);
    name = name.slice(cut + 1);
  }
  buf.write(name, 0, 100, 'utf8');                       // name
  buf.write('0000644\0', 100, 8, 'utf8');                // mode
  buf.write('0000000\0', 108, 8, 'utf8');                // uid
  buf.write('0000000\0', 116, 8, 'utf8');                // gid
  buf.write(size.toString(8).padStart(11, '0') + '\0', 124, 12, 'utf8');  // size
  buf.write(Math.floor(mtimeSec).toString(8).padStart(11, '0') + '\0', 136, 12, 'utf8'); // mtime
  buf.write('0', 156, 1, 'utf8');                        // typeflag: 普通文件
  buf.write('ustar\0', 257, 6, 'utf8');                  // magic
  buf.write('00', 263, 2, 'utf8');                       // version
  buf.write('astroknot', 265, 32, 'utf8');               // uname
  buf.write('astroknot', 297, 32, 'utf8');               // gname
  // checksum: 先全空格，再求和
  for (let i = 148; i < 156; i++) buf[i] = 32;
  let sum = 0;
  for (let i = 0; i < 512; i++) sum += buf[i];
  buf.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'utf8');
  if (prefix) buf.write(prefix, 345, 155, 'utf8');
  return buf;
}

/** GNU longname 条目头（typeflag 'L'） */
function longNameHeader(nameLen) {
  const buf = tarHeader('././@LongLink', nameLen + 1, 0);
  buf[156] = 'L'.charCodeAt(0);
  // 重算 checksum（typeflag 已变）
  for (let i = 148; i < 156; i++) buf[i] = 32;
  let sum = 0;
  for (let i = 0; i < 512; i++) sum += buf[i];
  buf.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'utf8');
  return buf;
}

/** 把一个项目目录打包为 tgz Buffer（跳过 .versiongraph） */
function packProjectTgz(projectDir) {
  const projectsDir = dataSettings.getProjectsDir();
  const root = path.join(projectsDir, projectDir);
  const rootName = projectDir; // tgz 内顶层文件夹 = 项目目录名
  const chunks = [];

  function pushFile(absPath, relPath) {
    const stat = fs.statSync(absPath);
    const data = fs.readFileSync(absPath);
    if (relPath.length > 100) {
      chunks.push(longNameHeader(relPath.length));
      const nb = Buffer.alloc(((relPath.length + 1) / 512 | 0) * 512 + 512);
      nb.write(relPath + '\0', 0, 'utf8');
      chunks.push(nb);
    }
    chunks.push(tarHeader(rootName + '/' + relPath, data.length, stat.mtimeMs / 1000));
    chunks.push(data);
    const pad = (512 - (data.length % 512)) % 512;
    if (pad) chunks.push(Buffer.alloc(pad));
  }

  (function walk(dir, rel) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of entries) {
      if (e.name === '.versiongraph') continue;
      const abs = path.join(dir, e.name);
      const relPath = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) walk(abs, relPath);
      else if (e.isFile()) {
        try { pushFile(abs, relPath); } catch (err) {
          console.warn('[mobile-sync] 跳过文件:', relPath, err.message);
        }
      }
    }
  })(root, '');

  // 结束块：1024 字节 0 + 补齐到 10240 的记录块
  chunks.push(Buffer.alloc(1024));
  const tarBuf = Buffer.concat(chunks);
  const recordPad = (10240 - (tarBuf.length % 10240)) % 10240;
  const padded = recordPad ? Buffer.concat([tarBuf, Buffer.alloc(recordPad)]) : tarBuf;
  return zlib.gzipSync(padded, { level: 6 });
}

// ── HTTP 服务 ──

function startServer() {
  return new Promise((resolve, reject) => {
    const tryListen = (port) => {
      const s = http.createServer((req, res) => {
        resetIdleTimer(); // 有活动就续命
        try { handleRequest(req, res); } catch (e) {
          console.error('[mobile-sync] 请求处理失败:', e);
          try { sendJson(res, 500, { error: e.message }); } catch (_) { /* 已响应 */ }
        }
      });
      s.on('error', (err) => {
        if (err.code === 'EADDRINUSE' && port < 8909) tryListen(port + 1);
        else reject(err);
      });
      s.listen(port, '0.0.0.0', () => {
        server = s;
        serverPort = port;
        resolve(port);
      });
    };
    syncToken = crypto.randomBytes(6).toString('hex'); // 12 位一次性配对码
    tryListen(8899);
  });
}

function checkToken(query) {
  return query.get('t') === syncToken;
}

async function handleRequest(req, res) {
  const url = new URL(req.url, 'http://x');
  const pathname = url.pathname;

  // 深链落地页（无 token 也可见，仅提示用系统相机打开 App）
  if (pathname === '/' || pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>AstroKnot 同步</title></head><body style="font-family:sans-serif;padding:24px;text-align:center;">' +
      '<h2>AstroKnot 桌面同步服务</h2><p>请使用 AstroKnot App 扫码连接本电脑</p>' +
      '<p style="color:#888;font-size:13px;">本页面仅用于确认服务在线</p></body></html>');
    return;
  }

  if (!checkToken(url.searchParams)) {
    sendJson(res, 401, { error: '配对码无效，请在桌面端重新获取二维码' });
    return;
  }

  // 项目列表
  if (pathname === '/api/info') {
    sendJson(res, 200, { app: 'astroknot-desktop', token: syncToken, projects: listProjects() });
    return;
  }

  // 单个项目 tgz 下载
  if (pathname === '/api/project') {
    const dir = url.searchParams.get('dir') || '';
    // 路径安全校验：仅允许单段目录名
    if (!/^[\w\u4e00-\u9fa5.-]+$/.test(dir)) {
      sendJson(res, 400, { error: '目录名不合法' });
      return;
    }
    const pjPath = path.join(dataSettings.getProjectsDir(), dir, 'project.json');
    if (!fs.existsSync(pjPath)) {
      sendJson(res, 404, { error: '项目不存在或已删除' });
      return;
    }
    const tgz = packProjectTgz(dir);
    res.writeHead(200, {
      'Content-Type': 'application/gzip',
      'Content-Length': tgz.length,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    });
    res.end(tgz);
    return;
  }

  sendJson(res, 404, { error: '未知接口' });
}

// ── IPC ──

function bindMobileSyncIPC() {
  ipcMain.handle('mobile-sync-start', async () => {
    try {
      if (!server) await startServer();
      const ip = findLanIPv4();
      const host = ip + ':' + serverPort;
      const deepLink = 'astroknot://sync?host=' + host + '&t=' + syncToken;
      let qrDataUrl = '';
      try {
        const QRCode = require('qrcode');
        qrDataUrl = await QRCode.toDataURL(deepLink, {
          width: 320,
          margin: 1,
          color: { dark: '#1a1f2e', light: '#ffffff' },
        });
      } catch (e) {
        console.error('[mobile-sync] 二维码生成失败:', e.message);
      }
      resetIdleTimer();
      console.log('[mobile-sync] 服务已启动 http://' + host + ' （15 分钟无活动自动关闭）');
      return {
        success: true,
        host,
        deepLink,
        qrDataUrl,
        expiresInMin: Math.round(IDLE_TIMEOUT_MS / 60000),
      };
    } catch (e) {
      stopServer();
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('mobile-sync-stop', async () => {
    stopServer();
    return { success: true };
  });
}

module.exports = { bindMobileSyncIPC, stopMobileSyncServer: stopServer };
