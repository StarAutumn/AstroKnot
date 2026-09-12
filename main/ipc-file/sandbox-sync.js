// ============================================================
//  main/ipc-file/sandbox-sync.js — Sandbox 文件实时同步 IPC
// ============================================================
const { ipcMain, app } = require('electron');
const path = require('path');
const fs = require('fs');
const dataSettings = require('../../data-settings');
const { getNodeFolderName, _syncFileSystemToDisk } = require('./helpers');

function bindSandboxSyncIPC(mainWindow) {

  // 写入单个 sandbox 文件
  ipcMain.handle('write-sandbox-file', async (event, projectFolderPath, node, vfsPath, content, isBinary) => {
    try {
      const sandboxDir = projectFolderPath
        ? path.join(projectFolderPath, 'nodes', getNodeFolderName(node), 'sandbox')
        : (dataSettings.getSandboxTmpDir(node.id) || path.join(app.getPath('userData'), 'sandbox-tmp', node.id, 'sandbox'));

      fs.mkdirSync(sandboxDir, { recursive: true });

      const relativePath = (vfsPath || '').replace(/^\//, '');
      if (!relativePath) return { success: false, error: '无效的文件路径' };

      const diskPath = path.join(sandboxDir, relativePath);

      const parentDir = path.dirname(diskPath);
      fs.mkdirSync(parentDir, { recursive: true });

      if (isBinary && content) {
        fs.writeFileSync(diskPath, Buffer.from(content, 'base64'));
      } else {
        fs.writeFileSync(diskPath, content || '', 'utf-8');
      }

      return { success: true, diskPath };
    } catch (err) {
      console.error('[write-sandbox-file] 错误:', err);
      return { success: false, error: err.message };
    }
  });

  // 删除单个 sandbox 文件
  ipcMain.handle('delete-sandbox-file', async (event, projectFolderPath, node, vfsPath) => {
    try {
      const sandboxDir = projectFolderPath
        ? path.join(projectFolderPath, 'nodes', getNodeFolderName(node), 'sandbox')
        : (dataSettings.getSandboxTmpDir(node.id) || path.join(app.getPath('userData'), 'sandbox-tmp', node.id, 'sandbox'));

      const relativePath = (vfsPath || '').replace(/^\//, '');
      if (!relativePath) return { success: false, error: '无效路径' };

      const diskPath = path.join(sandboxDir, relativePath);

      if (fs.existsSync(diskPath)) {
        const stat = fs.statSync(diskPath);
        if (stat.isDirectory()) {
          fs.rmSync(diskPath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(diskPath);
        }
      }

      return { success: true };
    } catch (err) {
      console.error('[delete-sandbox-file] 错误:', err);
      return { success: false, error: err.message };
    }
  });

  // 重命名 sandbox 文件/目录
  ipcMain.handle('rename-sandbox-file', async (event, projectFolderPath, node, oldPath, newPath) => {
    try {
      const sandboxDir = projectFolderPath
        ? path.join(projectFolderPath, 'nodes', getNodeFolderName(node), 'sandbox')
        : (dataSettings.getSandboxTmpDir(node.id) || path.join(app.getPath('userData'), 'sandbox-tmp', node.id, 'sandbox'));

      const oldRelativePath = (oldPath || '').replace(/^\//, '');
      const newRelativePath = (newPath || '').replace(/^\//, '');

      if (!oldRelativePath || !newRelativePath) return { success: false, error: '无效路径' };

      const oldDiskPath = path.join(sandboxDir, oldRelativePath);
      const newDiskPath = path.join(sandboxDir, newRelativePath);

      if (fs.existsSync(oldDiskPath)) {
        const newParentDir = path.dirname(newDiskPath);
        fs.mkdirSync(newParentDir, { recursive: true });
        fs.renameSync(oldDiskPath, newDiskPath);
      }

      return { success: true };
    } catch (err) {
      console.error('[rename-sandbox-file] 错误:', err);
      return { success: false, error: err.message };
    }
  });

  // 同步整个 sandbox 目录（用于项目保存时全量同步）
  ipcMain.handle('sync-sandbox-directory', async (event, projectFolderPath, node, fileSystem) => {
    try {
      let sandboxDir;
      if (projectFolderPath) {
        const folderName = getNodeFolderName(node);
        sandboxDir = path.join(projectFolderPath, 'nodes', folderName, 'sandbox');
      } else {
        const tmpDir = dataSettings.getSandboxTmpDir(node.id);
        sandboxDir = tmpDir || path.join(app.getPath('userData'), 'sandbox-tmp', node.id, 'sandbox');
      }

      if (!fs.existsSync(sandboxDir)) {
        fs.mkdirSync(sandboxDir, { recursive: true });
      }

      if (fileSystem) {
        // 增量同步：只重写 VFS 管辖的文件，保留磁盘上 VFS 之外的产物（node_modules/dist/.env 等）
        _syncFileSystemToDisk(fileSystem, sandboxDir);
      }

      return { success: true, diskPath: sandboxDir };
    } catch (err) {
      console.error('[sync-sandbox-directory] 错误:', err);
      return { success: false, error: err.message };
    }
  });
}

module.exports = { bindSandboxSyncIPC };