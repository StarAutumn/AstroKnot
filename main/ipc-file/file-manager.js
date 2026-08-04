// ============================================================
//  main/ipc-file/file-manager.js — 文件管理器 IPC
// ============================================================
const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const dataSettings = require('../../data-settings');

function bindFileManagerIPC(mainWindow) {
  function _fmResolve(relPath) {
    const dataRoot = dataSettings.getDataRoot();
    if (!dataRoot) return null;
    const normalized = (relPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
    const absPath = path.resolve(dataRoot, normalized);
    if (!absPath.startsWith(path.resolve(dataRoot))) return null;
    return absPath;
  }

  ipcMain.handle('fm-read-dir-tree', async () => {
    const dataRoot = dataSettings.getDataRoot();
    if (!dataRoot || !fs.existsSync(dataRoot)) return {};

    function scanDir(dirPath) {
      const node = { children: {} };
      try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const childPath = path.join(dirPath, entry.name);
            node.children[entry.name] = scanDir(childPath);
          }
        }
      } catch (e) { /* 权限不足等 */ }
      return node;
    }

    return scanDir(dataRoot);
  });

  ipcMain.handle('fm-read-dir', async (event, relPath) => {
    const absPath = _fmResolve(relPath);
    if (!absPath) return [];
    if (!fs.existsSync(absPath)) return [];

    const items = [];
    try {
      const entries = fs.readdirSync(absPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(absPath, entry.name);
        const stat = fs.statSync(fullPath);
        items.push({
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : 'file',
          size: entry.isFile() ? stat.size : 0,
          mtime: stat.mtimeMs,
        });
      }
    } catch (e) {
      console.error('[fm-read-dir] 错误:', e.message);
    }
    return items;
  });

  ipcMain.handle('fm-read-file', async (event, relPath) => {
    const absPath = _fmResolve(relPath);
    if (!absPath || !fs.existsSync(absPath)) return { type: 'error' };

    const ext = path.extname(absPath).toLowerCase().slice(1);
    const imageExts = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'webp', 'svg', 'tiff', 'tif']);
    const textExts = new Set([
      'json', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'html', 'htm', 'css', 'scss', 'less',
      'md', 'txt', 'xml', 'yaml', 'yml', 'sh', 'bash', 'zsh', 'fish', 'py', 'rb', 'go', 'rs',
      'java', 'c', 'h', 'cpp', 'hpp', 'cc', 'cs', 'php', 'swift', 'kt', 'dart', 'vue', 'svelte',
      'sql', 'graphql', 'toml', 'ini', 'cfg', 'conf', 'env', 'gitignore', 'editorconfig',
      'prettierrc', 'eslintrc', 'babelrc', 'stylelintrc',
    ]);

    try {
      const stat = fs.statSync(absPath);
      if (stat.isDirectory()) return { type: 'directory' };

      if (imageExts.has(ext)) {
        const buffer = fs.readFileSync(absPath);
        const mimeMap = {
          png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
          gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
          svg: 'image/svg+xml', ico: 'image/x-icon',
          tiff: 'image/tiff', tif: 'image/tiff',
        };
        const mime = mimeMap[ext] || 'application/octet-stream';
        return { type: 'image', dataUrl: `data:${mime};base64,${buffer.toString('base64')}`, size: stat.size };
      }

      if (textExts.has(ext) || ext === '') {
        const content = fs.readFileSync(absPath, 'utf-8');
        return { type: 'text', content, size: stat.size };
      }

      return { type: 'binary', size: stat.size };
    } catch (e) {
      return { type: 'error', message: e.message };
    }
  });

  ipcMain.handle('fm-create-item', async (event, relDir, name, itemType) => {
    const absDir = _fmResolve(relDir);
    if (!absDir) throw new Error('无效路径');

    const absPath = path.join(absDir, name);
    const dataRoot = dataSettings.getDataRoot();
    if (!path.resolve(absPath).startsWith(path.resolve(dataRoot))) {
      throw new Error('路径越界');
    }

    if (fs.existsSync(absPath)) {
      throw new Error('项目已存在: ' + name);
    }

    if (itemType === 'directory') {
      fs.mkdirSync(absPath, { recursive: true });
    } else {
      fs.mkdirSync(absDir, { recursive: true });
      fs.writeFileSync(absPath, '', 'utf-8');
    }
    return { success: true };
  });

  ipcMain.handle('fm-delete-item', async (event, relPath) => {
    const absPath = _fmResolve(relPath);
    if (!absPath || !fs.existsSync(absPath)) throw new Error('项目不存在');

    const stat = fs.statSync(absPath);
    if (stat.isDirectory()) {
      fs.rmSync(absPath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(absPath);
    }
    return { success: true };
  });

  ipcMain.handle('fm-rename-item', async (event, relPath, newName) => {
    const absPath = _fmResolve(relPath);
    if (!absPath || !fs.existsSync(absPath)) throw new Error('项目不存在');

    const dir = path.dirname(absPath);
    const newPath = path.join(dir, newName);

    const dataRoot = dataSettings.getDataRoot();
    if (!path.resolve(newPath).startsWith(path.resolve(dataRoot))) {
      throw new Error('路径越界');
    }
    if (fs.existsSync(newPath)) {
      throw new Error('目标名称已存在: ' + newName);
    }

    fs.renameSync(absPath, newPath);
    return { success: true };
  });

  ipcMain.handle('fm-copy-item', async (event, srcRelPath, destRelDir, destName, isMove) => {
    const srcAbs = _fmResolve(srcRelPath);
    const destDirAbs = _fmResolve(destRelDir);
    if (!srcAbs || !destDirAbs) throw new Error('无效路径');
    if (!fs.existsSync(srcAbs)) throw new Error('源文件不存在');

    const destAbs = path.join(destDirAbs, destName);
    const dataRoot = dataSettings.getDataRoot();
    if (!path.resolve(destAbs).startsWith(path.resolve(dataRoot))) {
      throw new Error('路径越界');
    }

    if (isMove) {
      fs.renameSync(srcAbs, destAbs);
    } else {
      const stat = fs.statSync(srcAbs);
      if (stat.isDirectory()) {
        fs.cpSync(srcAbs, destAbs, { recursive: true });
      } else {
        fs.copyFileSync(srcAbs, destAbs);
      }
    }
    return { success: true };
  });

  ipcMain.handle('fm-resolve-path', async (event, relPath) => {
    const absPath = _fmResolve(relPath);
    return absPath || null;
  });

  ipcMain.handle('fm-find-app-by-path', async (event, relPath) => {
    try {
      const normalized = (relPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
      const parts = normalized.split('/');
      if (parts.length < 2) return null;
      const appsDir = dataSettings.getAppsDir();
      const appsDirName = path.basename(appsDir);
      if (parts[0] !== appsDirName) return null;
      const appId = parts[1];
      const indexPath = path.join(appsDir, 'index.json');
      if (!fs.existsSync(indexPath)) return null;
      const appList = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      const app = (appList.apps || []).find(a => a.id === appId);
      if (!app) return null;
      const sandboxDir = path.join(appsDir, appId, 'sandbox');
      if (!fs.existsSync(sandboxDir)) return null;
      return { ...app, sandboxPath: sandboxDir };
    } catch (e) {
      return null;
    }
  });
}

module.exports = { bindFileManagerIPC };