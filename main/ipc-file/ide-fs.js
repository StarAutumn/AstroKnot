// ============================================================
//  main/ipc-file/ide-fs.js — IDE 真实文件系统 IPC
// ============================================================
const { ipcMain, dialog, app } = require('electron');
const path = require('path');
const fs = require('fs');
const dataSettings = require('../../data-settings');
const {
  BINARY_EXTENSIONS,
  _writeFileSystemToDisk, _readFileSystemFromDiskBinary,
  getNodeFolderName, sanitizeFileName,
} = require('./helpers');

function bindIDEFSIPC(mainWindow) {
  ipcMain.handle('ide-select-folder', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择项目文件夹',
      properties: ['openDirectory']
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('ide-import-local-folder', async (event, destDir) => {
    const result = await dialog.showOpenDialog({
      title: '选择要导入的文件夹',
      properties: ['openDirectory']
    });
    if (result.canceled || !result.filePaths.length) return null;
    const srcFolder = result.filePaths[0];
    const folderName = path.basename(srcFolder);

    const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.nuxt', '.cache']);
    const MAX_FILE_SIZE = 10 * 1024 * 1024;

    if (destDir) {
      try {
        let fileCount = 0;
        const uniqueName = (dir, name) => {
          if (!fs.existsSync(path.join(dir, name))) return name;
          let idx = 2;
          const dotIdx = name.lastIndexOf('.');
          const base = dotIdx > 0 ? name.substring(0, dotIdx) : name;
          const ext = dotIdx > 0 ? name.substring(dotIdx) : '';
          while (fs.existsSync(path.join(dir, `${base}-${idx}${ext}`))) idx++;
          return `${base}-${idx}${ext}`;
        };

        const walkCopy = (src, dest) => {
          const entries = fs.readdirSync(src, { withFileTypes: true });
          for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destName = uniqueName(dest, entry.name);
            const destPath = path.join(dest, destName);
            if (entry.isDirectory()) {
              if (SKIP_DIRS.has(entry.name)) continue;
              fs.mkdirSync(destPath, { recursive: true });
              walkCopy(srcPath, destPath);
            } else if (entry.isFile()) {
              const stat = fs.statSync(srcPath);
              if (stat.size > MAX_FILE_SIZE) continue;
              fs.copyFileSync(srcPath, destPath);
              fileCount++;
            }
          }
        };
        walkCopy(srcFolder, destDir);
        return { fileCount, copied: true };
      } catch (err) {
        console.error('[ide-import-local-folder] 复制失败:', err);
        return { error: err.message };
      }
    }

    const files = [];
    const walkRead = (dir, relBase) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          if (SKIP_DIRS.has(entry.name)) continue;
          walkRead(fullPath, relPath);
        } else if (entry.isFile()) {
          const stat = fs.statSync(fullPath);
          if (stat.size > MAX_FILE_SIZE) continue;
          const ext = path.extname(entry.name).toLowerCase().slice(1);
          try {
            if (BINARY_EXTENSIONS.has(ext)) {
              const buf = fs.readFileSync(fullPath);
              files.push({ path: relPath, content: buf.toString('base64'), isBinary: true });
            } else {
              const content = fs.readFileSync(fullPath, 'utf-8');
              files.push({ path: relPath, content, isBinary: false });
            }
          } catch (e) {
            console.warn('[ide-import-local-folder] 跳过文件:', fullPath, e.message);
          }
        }
      }
    };
    walkRead(srcFolder, '');
    return { folderName, files };
  });

  ipcMain.handle('ide-get-node-sandbox-path', async (event, node, projectFolderPath) => {
    try {
      let sandboxDir;
      if (projectFolderPath) {
        const folderName = getNodeFolderName(node);
        sandboxDir = path.join(projectFolderPath, 'nodes', folderName, 'sandbox');
      } else {
        const tmpDir = dataSettings.getSandboxTmpDir(node.id);
        sandboxDir = tmpDir || path.join(app.getPath('userData'), 'sandbox-tmp', node.id, 'sandbox');
      }

      if (node.fileSystem) {
        if (fs.existsSync(sandboxDir)) {
          fs.rmSync(sandboxDir, { recursive: true, force: true });
        }
        fs.mkdirSync(sandboxDir, { recursive: true });
        _writeFileSystemToDisk(node.fileSystem, sandboxDir);
      }

      return { success: true, sandboxPath: sandboxDir };
    } catch (err) {
      console.error('[ide-get-node-sandbox-path] 错误:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('ide-sync-sandbox-to-node', async (event, sandboxDir) => {
    try {
      if (!fs.existsSync(sandboxDir)) return { success: true, fileSystem: null };
      const fileSystem = _readFileSystemFromDiskBinary(sandboxDir);
      return { success: true, fileSystem };
    } catch (err) {
      console.error('[ide-sync-sandbox-to-node] 错误:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('ide-read-dir-tree', async (event, dirPath) => {
    if (!dirPath || !fs.existsSync(dirPath)) return {};
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) return {};

    function scanDir(dir) {
      const node = { children: {} };
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
            const childPath = path.join(dir, entry.name);
            node.children[entry.name] = scanDir(childPath);
          }
        }
      } catch (e) { /* 权限不足等 */ }
      return node;
    }

    return scanDir(dirPath);
  });

  ipcMain.handle('ide-read-dir', async (event, dirPath) => {
    if (!dirPath || !fs.existsSync(dirPath)) return [];
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) return [];

    const items = [];
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        try {
          const st = fs.statSync(fullPath);
          items.push({
            name: entry.name,
            type: entry.isDirectory() ? 'directory' : 'file',
            size: entry.isFile() ? st.size : 0,
            mtime: st.mtimeMs,
          });
        } catch (e) { /* 跳过无权限文件 */ }
      }
    } catch (e) {
      console.error('[ide-read-dir] 错误:', e.message);
    }
    return items;
  });

  ipcMain.handle('ide-read-file', async (event, filePath) => {
    if (!filePath || !fs.existsSync(filePath)) return { type: 'error', message: '文件不存在' };

    const ext = path.extname(filePath).toLowerCase().slice(1);
    const imageExts = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'webp', 'svg', 'tiff', 'tif']);

    try {
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) return { type: 'directory' };
      if (stat.size > 10 * 1024 * 1024) return { type: 'binary', size: stat.size, message: '文件过大 (>10MB)' };

      if (imageExts.has(ext)) {
        const buffer = fs.readFileSync(filePath);
        const mimeMap = {
          png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
          gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
          svg: 'image/svg+xml', ico: 'image/x-icon',
        };
        const mime = mimeMap[ext] || 'application/octet-stream';
        return { type: 'image', dataUrl: `data:${mime};base64,${buffer.toString('base64')}`, size: stat.size };
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      return { type: 'text', content, size: stat.size };
    } catch (e) {
      return { type: 'error', message: e.message };
    }
  });

  ipcMain.handle('ide-write-file', async (event, filePath, content) => {
    if (!filePath) throw new Error('无效路径');
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, content, 'utf-8');
      return { success: true };
    } catch (e) {
      throw new Error('写入失败: ' + e.message);
    }
  });

  ipcMain.handle('ide-create-item', async (event, dirPath, name, itemType) => {
    if (!dirPath || !name) throw new Error('无效参数');
    const absPath = path.join(dirPath, name);
    if (fs.existsSync(absPath)) throw new Error('项目已存在: ' + name);

    if (itemType === 'directory') {
      fs.mkdirSync(absPath, { recursive: true });
    } else {
      fs.mkdirSync(dirPath, { recursive: true });
      fs.writeFileSync(absPath, '', 'utf-8');
    }
    return { success: true };
  });

  ipcMain.handle('ide-delete-item', async (event, filePath) => {
    if (!filePath || !fs.existsSync(filePath)) throw new Error('项目不存在');
    try {
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        fs.rmSync(filePath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(filePath);
      }
      return { success: true };
    } catch (e) {
      throw new Error('删除失败: ' + e.message);
    }
  });

  ipcMain.handle('ide-rename-item', async (event, filePath, newName) => {
    if (!filePath || !newName || !fs.existsSync(filePath)) throw new Error('参数无效');
    const dir = path.dirname(filePath);
    const newPath = path.join(dir, newName);
    if (fs.existsSync(newPath)) throw new Error('目标名称已存在: ' + newName);
    fs.renameSync(filePath, newPath);
    return { success: true };
  });

  ipcMain.handle('check-tools', async () => {
    const { execSync } = require('child_process');
    const tools = { git: false, npm: false, gitVersion: '', npmVersion: '' };
    try {
      const out = execSync('git --version', { windowsHide: true, timeout: 5000 }).toString().trim();
      tools.git = true;
      tools.gitVersion = out;
    } catch (e) {}
    try {
      const out = execSync('npm --version', { windowsHide: true, timeout: 5000 }).toString().trim();
      tools.npm = true;
      tools.npmVersion = 'npm v' + out;
    } catch (e) {}
    return tools;
  });

  ipcMain.handle('git-clone-and-read', async (event, repoUrl) => {
    const { spawn } = require('child_process');
    const os = require('os');

    const tempDir = `astroknot-clone-${Date.now()}`;
    const cloneTarget = path.join(os.tmpdir(), tempDir);

    await new Promise((resolve, reject) => {
      const git = spawn('git', ['clone', '--depth', '1', repoUrl, cloneTarget], {
        windowsHide: true,
      });

      let stderr = '';

      git.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      git.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`git clone 失败 (code ${code}): ${stderr}`));
        }
      });

      git.on('error', (err) => {
        if (err.code === 'ENOENT') {
          reject(new Error('系统未安装 git，请先安装 Git 并确保在 PATH 中'));
        } else {
          reject(err);
        }
      });
    });

    const files = [];
    const BINARY_EXTS = new Set([
      'png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'webp', 'tiff', 'tif', 'svg',
      'mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma',
      'mp4', 'webm', 'avi', 'mov', 'mkv', 'wmv', 'flv',
      'zip', 'gz', 'tar', 'rar', '7z', 'bz2',
      'woff', 'woff2', 'ttf', 'otf', 'eot',
      'pdf', 'exe', 'dll', 'so', 'dylib', 'bin', 'dat',
    ]);

    const isBinary = (filePath) => {
      const ext = filePath.split('.').pop()?.toLowerCase();
      return BINARY_EXTS.has(ext);
    };

    const readDirRecursive = (dir, baseDir = '') => {
      try {
        const items = fs.readdirSync(dir, { withFileTypes: true });
        for (const item of items) {
          const fullPath = path.join(dir, item.name);
          const relativePath = baseDir ? `${baseDir}/${item.name}` : item.name;
          if (item.isDirectory()) {
            if (item.name !== '.git') {
              readDirRecursive(fullPath, relativePath);
            }
          } else {
            try {
              const content = isBinary(relativePath)
                ? fs.readFileSync(fullPath).toString('base64')
                : fs.readFileSync(fullPath, 'utf-8');
              files.push({
                path: relativePath,
                content,
                isBinary: isBinary(relativePath)
              });
            } catch (e) {
              // 跳过无法读取的文件
            }
          }
        }
      } catch (e) {
        // 跳过无法读取的目录
      }
    };

    readDirRecursive(cloneTarget);

    try {
      fs.rmSync(cloneTarget, { recursive: true, force: true });
    } catch (e) {
      // 忽略清理失败
    }

    return { success: true, files };
  });

  ipcMain.handle('git-clone-to-dir', async (event, repoUrl, targetDir) => {
    const { spawn } = require('child_process');

    if (!targetDir || !fs.existsSync(targetDir)) {
      return { success: false, error: '目标目录不存在: ' + targetDir };
    }

    const tempDir = `astroknot-clone-${Date.now()}`;
    const cloneTarget = path.join(require('os').tmpdir(), tempDir);

    try {
      await new Promise((resolve, reject) => {
        const git = spawn('git', ['clone', '--depth', '1', repoUrl, cloneTarget], {
          windowsHide: true,
        });

        let stderr = '';
        git.stderr.on('data', (data) => { stderr += data.toString(); });
        git.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`git clone 失败 (code ${code}): ${stderr}`));
        });
        git.on('error', (err) => {
          if (err.code === 'ENOENT') reject(new Error('系统未安装 git'));
          else reject(err);
        });
      });
    } catch (err) {
      return { success: false, error: err.message };
    }

    let fileCount = 0;
    const copyDir = (src, dest) => {
      if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
      const entries = fs.readdirSync(src, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === '.git') continue;
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
          copyDir(srcPath, destPath);
        } else {
          try {
            fs.copyFileSync(srcPath, destPath);
            fileCount++;
          } catch (e) {
            // 跳过无法复制的文件
          }
        }
      }
    };

    try {
      copyDir(cloneTarget, targetDir);
    } catch (err) {
      return { success: false, error: '复制文件失败: ' + err.message };
    }

    try {
      fs.rmSync(cloneTarget, { recursive: true, force: true });
    } catch (e) {}

    return { success: true, fileCount };
  });

  ipcMain.handle('run-command', async (event, command, cwd) => {
    const { spawn } = require('child_process');

    return new Promise((resolve) => {
      const isWindows = process.platform === 'win32';
      const shell = isWindows ? true : '/bin/bash';

      const proc = spawn(command, [], {
        cwd: cwd || undefined,
        shell,
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        resolve({ code, stdout, stderr });
      });

      proc.on('error', (err) => {
        resolve({ code: 1, stdout: '', stderr: err.message });
      });
    });
  });
}

module.exports = { bindIDEFSIPC };