// ============================================================
//  main/ipc-file/trash.js — 回收站 IPC
// ============================================================
const { ipcMain, app } = require('electron');
const path = require('path');
const fs = require('fs');
const dataSettings = require('../../data-settings');
const { _writeProjectToDisk } = require('./project-data');

function bindTrashIPC(mainWindow) {

  // ── 移动项目到回收站 ──
  ipcMain.handle('move-project-to-trash', async (event, payload) => {
    const { folderPath, projectId, projectName, projectData } = payload || {};
    try {
      const trashDir = dataSettings.getTrashDir();
      if (!trashDir) return { success: false, error: '回收站目录未配置' };
      fs.mkdirSync(trashDir, { recursive: true });

      let targetName = projectName || '未命名项目';
      let targetPath = path.join(trashDir, targetName);
      if (fs.existsSync(targetPath)) {
        targetName = `${targetName}_${Date.now()}`;
        targetPath = path.join(trashDir, targetName);
      }

      const wasUnsaved = !folderPath || !fs.existsSync(folderPath);
      if (!wasUnsaved) {
        try {
          fs.renameSync(folderPath, targetPath);
        } catch (renameErr) {
          fs.cpSync(folderPath, targetPath, { recursive: true });
          fs.rmSync(folderPath, { recursive: true, force: true });
        }
      } else {
        if (!projectData) {
          return { success: false, error: '未保存项目缺少 projectData，无法移入回收站' };
        }
        _writeProjectToDisk(targetPath, projectData);
        const tmpDir = dataSettings.getSandboxTmpDir(projectId);
        if (tmpDir && fs.existsSync(tmpDir)) {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        }
      }

      const meta = {
        projectId: projectId || null,
        projectName: projectName || targetName,
        originalPath: folderPath || null,
        deletedAt: new Date().toISOString(),
        wasUnsaved
      };
      fs.writeFileSync(path.join(targetPath, '.trash-meta.json'), JSON.stringify(meta, null, 2), 'utf-8');
      console.log('[move-project-to-trash] 已移入回收站:', targetPath);
      return { success: true, trashPath: targetPath };
    } catch (err) {
      console.error('[move-project-to-trash] 错误:', err);
      return { success: false, error: err.message };
    }
  });

  // ── 列出回收站内容 ──
  ipcMain.handle('list-trash', async () => {
    try {
      const trashDir = dataSettings.getTrashDir();
      if (!trashDir || !fs.existsSync(trashDir)) return { success: true, items: [] };
      const items = [];
      for (const entry of fs.readdirSync(trashDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const itemPath = path.join(trashDir, entry.name);
        const metaPath = path.join(itemPath, '.trash-meta.json');
        let meta = {};
        try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')); } catch (e) { /* 无 meta 文件 */ }
        items.push({
          trashPath: itemPath,
          folderName: entry.name,
          projectName: meta.projectName || entry.name,
          projectId: meta.projectId || null,
          originalPath: meta.originalPath || null,
          deletedAt: meta.deletedAt || null,
          wasUnsaved: meta.wasUnsaved || false
        });
      }
      items.sort((a, b) => (b.deletedAt || '').localeCompare(a.deletedAt || ''));
      return { success: true, items };
    } catch (err) {
      console.error('[list-trash] 错误:', err);
      return { success: false, error: err.message, items: [] };
    }
  });

  // ── 从回收站恢复项目 ──
  ipcMain.handle('restore-from-trash', async (event, payload) => {
    const { trashPath } = payload || {};
    try {
      if (!trashPath || !fs.existsSync(trashPath)) {
        return { success: false, error: '回收站项目不存在' };
      }
      const trashDir = dataSettings.getTrashDir();
      if (!trashDir || !trashPath.startsWith(trashDir)) {
        return { success: false, error: '路径越权' };
      }

      const metaPath = path.join(trashPath, '.trash-meta.json');
      let meta = {};
      try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')); } catch (e) { /* 无 meta */ }

      let restorePath;
      const originalParentExists = meta.originalPath && fs.existsSync(path.dirname(meta.originalPath));
      const originalSlotFree = originalParentExists && !fs.existsSync(meta.originalPath);
      if (originalSlotFree) {
        restorePath = meta.originalPath;
      } else {
        const projectsDir = dataSettings.getProjectsDir();
        fs.mkdirSync(projectsDir, { recursive: true });
        let name = meta.projectName || path.basename(trashPath);
        restorePath = path.join(projectsDir, name);
        let i = 1;
        while (fs.existsSync(restorePath)) {
          restorePath = path.join(projectsDir, `${name}_${i}`);
          i++;
        }
      }

      try {
        fs.renameSync(trashPath, restorePath);
      } catch (renameErr) {
        fs.cpSync(trashPath, restorePath, { recursive: true });
        fs.rmSync(trashPath, { recursive: true, force: true });
      }

      const metaInRestored = path.join(restorePath, '.trash-meta.json');
      if (fs.existsSync(metaInRestored)) fs.unlinkSync(metaInRestored);

      console.log('[restore-from-trash] 已恢复到:', restorePath);
      return { success: true, folderPath: restorePath, projectName: meta.projectName || path.basename(restorePath) };
    } catch (err) {
      console.error('[restore-from-trash] 错误:', err);
      return { success: false, error: err.message };
    }
  });

  // ── 永久删除回收站中的单个项目 ──
  ipcMain.handle('permanently-delete-trash-item', async (event, payload) => {
    const { trashPath } = payload || {};
    try {
      if (!trashPath) return { success: false };
      const trashDir = dataSettings.getTrashDir();
      if (!trashDir || !trashPath.startsWith(trashDir)) {
        return { success: false, error: '路径越权' };
      }
      if (fs.existsSync(trashPath)) {
        fs.rmSync(trashPath, { recursive: true, force: true });
        console.log('[permanently-delete-trash-item] 已永久删除:', trashPath);
      }
      return { success: true };
    } catch (err) {
      console.error('[permanently-delete-trash-item] 错误:', err);
      return { success: false, error: err.message };
    }
  });

  // ── 清空回收站 ──
  ipcMain.handle('empty-trash', async () => {
    try {
      const trashDir = dataSettings.getTrashDir();
      if (!trashDir || !fs.existsSync(trashDir)) return { success: true, count: 0 };
      let count = 0;
      for (const entry of fs.readdirSync(trashDir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          fs.rmSync(path.join(trashDir, entry.name), { recursive: true, force: true });
          count++;
        }
      }
      console.log('[empty-trash] 已清空回收站，共', count, '个项目');
      return { success: true, count };
    } catch (err) {
      console.error('[empty-trash] 错误:', err);
      return { success: false, error: err.message };
    }
  });
}

module.exports = { bindTrashIPC };