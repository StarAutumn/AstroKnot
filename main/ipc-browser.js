// ============================================================
//  main/ipc-browser.js — 内置浏览器 IPC
//  下载管理 / Cookie / 广告拦截 / 截图 / DevTools / webview 拦截
// ============================================================
const { ipcMain, app, session, BrowserWindow, dialog, webContents, net } = require('electron');
const path = require('path');
const fs = require('fs');
const dataSettings = require('../data-settings');

// ── 内置浏览器：广告拦截 ──
// 基于域名黑名单拦截常见广告/追踪请求
const AD_DOMAINS = [
  'doubleclick.net', 'googlesyndication.com', 'googletagservices.com',
  'google-analytics.com', 'googletagmanager.com', 'adservice.google.com',
  'facebook.net', 'facebook.com/tr', 'connect.facebook.net',
  'amazon-adsystem.com', 'adnxs.com', '2mdn.net', 'pubmatic.com',
  'rubiconproject.com', 'openx.net', 'criteo.com', 'criteo.net',
  'taboola.com', 'outbrain.com', 'disqus.com', 'scorecardresearch.com',
  'quantserve.com', 'adroll.com', 'yandex.ru/ads', 'yandex.ru/an',
  'baidu.com/cpro', 'cnzz.com', 'umeng.com', 'tanx.com',
  'mediav.com', 'baidustatic.com/adx', 'clarity.ms',
];
/** 判断 URL 是否匹配广告域名 */
function _isAdRequest(urlStr) {
  try {
    const u = new URL(urlStr);
    const host = u.hostname.toLowerCase();
    const urlPath = u.pathname.toLowerCase();
    for (const ad of AD_DOMAINS) {
      if (ad.includes('/')) {
        // 带路径的规则
        if (host.endsWith(ad.split('/')[0]) && urlPath.startsWith('/' + ad.split('/').slice(1).join('/'))) return true;
      } else {
        if (host === ad || host.endsWith('.' + ad)) return true;
      }
    }
    return false;
  } catch (_) { return false; }
}

function bindBrowserIPC(mainWindow) {
  // ── 拦截内置浏览器 webview 弹出窗口 → 通知渲染进程新建标签页 ──
  // Electron 29+ 中渲染进程无法通过 webview.getWebContents() 调用
  // setWindowOpenHandler（因为 contextIsolation: true），
  // 必须在主进程中通过 web-contents-created 事件拦截
  app.on('web-contents-created', (_, contents) => {
    if (contents.getType() === 'webview') {
      contents.setWindowOpenHandler(({ url }) => {
        if (url && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('browser-open-tab', url);
        }
        return { action: 'deny' };
      });
    }
  });

  // ── 内置浏览器下载管理 ──
  // 为浏览器 session 注册 will-download 事件，将下载状态通过 IPC 通知渲染进程
  const browserSession = session.fromPartition('persist:browsersession');
  browserSession.on('will-download', (event, item) => {
    // 直接保存到配置的下载目录（不弹窗选择）
    const downloadDir = dataSettings.getDownloadDir();
    if (downloadDir && !fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true });
    }
    const savePath = downloadDir
      ? path.join(downloadDir, item.getFilename())
      : path.join(app.getPath('downloads'), item.getFilename());
    item.setSavePath(savePath);

    // 通知渲染进程下载开始
    const downloadId = 'dl_' + Date.now();
    mainWindow.webContents.send('browser-download-update', {
      id: downloadId,
      state: 'progressing',
      filename: item.getFilename(),
      savePath,
      received: 0,
      total: item.getTotalBytes(),
    });

    item.on('updated', (_, state) => {
      if (mainWindow.isDestroyed()) return;
      mainWindow.webContents.send('browser-download-update', {
        id: downloadId,
        state,
        filename: item.getFilename(),
        savePath,
        received: item.getReceivedBytes(),
        total: item.getTotalBytes(),
      });
    });

    item.once('done', (_, state) => {
      if (mainWindow.isDestroyed()) return;
      mainWindow.webContents.send('browser-download-update', {
        id: downloadId,
        state,
        filename: item.getFilename(),
        savePath,
        received: item.getReceivedBytes(),
        total: item.getTotalBytes(),
      });
    });
  });

  // ── 内置浏览器：下载目录管理 ──
  ipcMain.handle('browser-get-download-dir', async () => {
    return dataSettings.getDownloadDir() || '';
  });
  ipcMain.handle('browser-set-download-dir', async (_e, dirPath) => {
    if (!dirPath) return false;
    dataSettings.setCustomPaths({ downloadDir: dirPath });
    return true;
  });

  // ── 内置浏览器：清除隐私模式数据 ──
  ipcMain.handle('browser-clear-private-data', async () => {
    try {
      const privateSession = session.fromPartition('private-browsersession');
      await privateSession.clearStorageData();
      await privateSession.clearCache();
      return true;
    } catch (_) {
      return false;
    }
  });

  // ── 内置浏览器：Cookies 管理 ──
  // 获取指定 partition 的所有 cookies
  ipcMain.handle('browser-get-cookies', async (_e, partition) => {
    try {
      const ses = session.fromPartition(partition || 'persist:browsersession');
      const cookies = await ses.cookies.get({});
      return cookies.map(c => ({
        domain: c.domain, name: c.name, value: c.value,
        path: c.path, secure: c.secure, httpOnly: c.httpOnly,
        hostOnly: c.hostOnly, session: c.session,
        expirationDate: c.expirationDate,
      }));
    } catch (err) { return { error: err.message }; }
  });
  // 删除单个 cookie
  ipcMain.handle('browser-delete-cookie', async (_e, { partition, url, name }) => {
    try {
      const ses = session.fromPartition(partition || 'persist:browsersession');
      await ses.cookies.remove(url, name);
      return true;
    } catch (_) { return false; }
  });
  // 清空所有 cookies
  ipcMain.handle('browser-clear-cookies', async (_e, partition) => {
    try {
      const ses = session.fromPartition(partition || 'persist:browsersession');
      const cookies = await ses.cookies.get({});
      for (const c of cookies) {
        const url = `http${c.secure ? 's' : ''}://${c.domain.replace(/^\./, '')}${c.path}`;
        try { await ses.cookies.remove(url, c.name); } catch (_) {}
      }
      return true;
    } catch (_) { return false; }
  });

  // 为浏览器 session 和隐私 session 都注册拦截
  ['persist:browsersession', 'private-browsersession'].forEach(partition => {
    const ses = session.fromPartition(partition);
    ses.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
      if (_isAdRequest(details.url)) {
        callback({ cancel: true });
      } else {
        callback({});
      }
    });
  });

  // ── 内置浏览器：抓取页面源码资源（整页剪藏·资源本地化用）──
  // 通过主进程 net.fetch 抓取指定 URL 的文本内容（CSS/JS 等），
  // 绕过渲染进程/webview 的 CORS 与 CSP 限制；跟随重定向，15s 超时
  ipcMain.handle('browser-fetch-resource', async (_e, url) => {
    try {
      if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
        return { success: false, error: '无效 URL' };
      }
      const headers = { 'Accept': '*/*', 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' };
      if (mainWindow && !mainWindow.isDestroyed()) {
        headers['User-Agent'] = mainWindow.webContents.userAgent;
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const resp = await net.fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers,
      });
      clearTimeout(timer);
      if (!resp.ok) return { success: false, error: 'HTTP ' + resp.status };
      const contentType = resp.headers.get('content-type') || '';
      // 仅接受文本类资源（css/js/源码），二进制（图片/字体）不本地化
      if (contentType && !/text\/|javascript|ecmascript|json|xml|plain|octet-stream/i.test(contentType)) {
        return { success: false, error: '非文本资源: ' + contentType };
      }
      const content = await resp.text();
      // 单文件上限 4MB，防止超大 bundle 拖垮项目
      if (content.length > 4 * 1024 * 1024) return { success: false, error: '文件过大' };
      return { success: true, content, contentType };
    } catch (err) {
      return { success: false, error: (err && err.message) || 'fetch 失败' };
    }
  });

  // ── 内置浏览器：网页截图保存 ──
  ipcMain.handle('browser-save-screenshot', async (_e, { dataUrl, filename }) => {
    try {
      const defaultPath = path.join(app.getPath('downloads'), filename || `screenshot_${Date.now()}.png`);
      const savePath = dialog.showSaveDialogSync(mainWindow, {
        title: '保存截图',
        defaultPath,
        filters: [{ name: 'PNG 图片', extensions: ['png'] }],
      });
      if (!savePath) return { canceled: true };
      // dataUrl 格式：data:image/png;base64,XXXX
      const base64 = dataUrl.split(',')[1];
      fs.writeFileSync(savePath, Buffer.from(base64, 'base64'));
      return { success: true, path: savePath };
    } catch (err) {
      return { error: err.message };
    }
  });

  // ── 内置浏览器：DevTools 侧边栏 ──
  // 使用无框 BrowserWindow 作为 DevTools 容器（webview 不支持 devtools:// 协议）
  let _devtoolsWindow = null;
  ipcMain.handle('browser-attach-devtools', async (_e, { targetId }) => {
    try {
      const targetContents = webContents.fromId(targetId);
      if (!targetContents) return { error: 'target not found' };
      // 如果已有 DevTools 窗口，先销毁
      if (_devtoolsWindow) {
        try { _devtoolsWindow.destroy(); } catch (_) {}
        _devtoolsWindow = null;
      }
      // 创建无框子窗口
      _devtoolsWindow = new BrowserWindow({
        parent: mainWindow,
        frame: false,
        show: false,
        resizable: false,
        skipTaskbar: true,
        webPreferences: { contextIsolation: true, nodeIntegration: false },
      });
      // 将 DevTools 重定向到子窗口的 webContents
      targetContents.setDevToolsWebContents(_devtoolsWindow.webContents);
      targetContents.openDevTools();
      // DevTools 页面加载完成后显示
      _devtoolsWindow.webContents.once('dom-ready', () => {
        if (_devtoolsWindow && !_devtoolsWindow.isDestroyed()) {
          _devtoolsWindow.show();
        }
      });
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });
  // 更新 DevTools 窗口位置和大小（渲染进程传递相对于视口的坐标）
  ipcMain.handle('browser-update-devtools-bounds', async (_e, { left, top, width, height }) => {
    if (_devtoolsWindow && !_devtoolsWindow.isDestroyed() && mainWindow && !mainWindow.isDestroyed()) {
      const contentBounds = mainWindow.getContentBounds();
      _devtoolsWindow.setBounds({
        x: contentBounds.x + left,
        y: contentBounds.y + top,
        width: Math.max(1, width),
        height: Math.max(1, height),
      });
    }
    return { success: true };
  });
  // 关闭 DevTools
  ipcMain.handle('browser-close-devtools', async (_e, { targetId }) => {
    try {
      if (targetId) {
        const targetContents = webContents.fromId(targetId);
        if (targetContents && targetContents.isDevToolsOpened()) {
          targetContents.closeDevTools();
        }
      }
      if (_devtoolsWindow) {
        try { _devtoolsWindow.destroy(); } catch (_) {}
        _devtoolsWindow = null;
      }
      return { success: true };
    } catch (_) {
      return { error: 'failed' };
    }
  });
  // 主窗口移动/调整大小时通知渲染进程更新 DevTools 位置
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.on('move', () => {
      if (_devtoolsWindow && !_devtoolsWindow.isDestroyed()) {
        mainWindow.webContents.send('browser-devtools-bounds-changed');
      }
    });
    mainWindow.on('resize', () => {
      if (_devtoolsWindow && !_devtoolsWindow.isDestroyed()) {
        mainWindow.webContents.send('browser-devtools-bounds-changed');
      }
    });
  }
}

module.exports = { bindBrowserIPC };
