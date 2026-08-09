// ============================================================
//  main/ipc-file/quick-notes.js — 快速笔记 I/O IPC 处理器
// ============================================================
const { ipcMain, app, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const dataSettings = require('../../data-settings');
const {
  saveOverlays, loadOverlays, getNodeFolderName,
} = require('./helpers');

function bindQuickNotesIPC(mainWindow) {
  // ── 保存快速笔记到文件系统 ──
  ipcMain.handle('save-quick-notes', async (event, data) => {
    try {
      let savePath = data.savePath;
      if (!savePath) {
        const quicknotesDir = dataSettings.getQuicknotesDir();
        savePath = quicknotesDir || path.join(app.getPath('userData'), 'quicknotes');
      }
      fs.mkdirSync(savePath, { recursive: true });

      const notes = data.notes || [];
      const metadata = [];

      const currentNoteIds = new Set(notes.map(n => n.id));
      // 快速笔记磁盘文件夹命名与节点文件夹一致：{名称}_{nodeId前8位}
      const currentNoteFolders = new Set(
        notes.map(n => getNodeFolderName({ id: n.id, name: n.title || '未命名' }))
      );

      // 清理孤儿文件夹：快速笔记文件夹旧格式为目录名 = 笔记 id（qnote_ 开头），
      // 新格式为 {名称}_qnote_短id（包含 _qnote_），不属当前笔记的均删除
      if (fs.existsSync(savePath)) {
        for (const entry of fs.readdirSync(savePath, { withFileTypes: true })) {
          if (!entry.isDirectory()) continue;
          const name = entry.name;
          const isQuickNoteFolder = name.startsWith('qnote_') || name.includes('_qnote_');
          if (!isQuickNoteFolder) continue;
          if (currentNoteIds.has(name) || currentNoteFolders.has(name)) continue;
          fs.rmSync(path.join(savePath, name), { recursive: true, force: true });
        }
      }

      for (const note of notes) {
        const folderName = getNodeFolderName({ id: note.id, name: note.title || '未命名' });
        const noteDir = path.join(savePath, folderName);
        fs.mkdirSync(noteDir, { recursive: true });

        // 迁移/重命名清理：
        // 1) 旧格式目录（目录名 = 笔记 id）存在且与新命名不同 → 删除，完成迁移
        if (note.id !== folderName) {
          const oldIdDir = path.join(savePath, note.id);
          if (fs.existsSync(oldIdDir)) {
            fs.rmSync(oldIdDir, { recursive: true, force: true });
          }
        }
        // 2) 笔记重命名后 folder 变化 → 删除旧 folder 目录，保持磁盘与节点文件夹一致
        if (note.folder && note.folder !== folderName) {
          const oldFolderDir = path.join(savePath, note.folder);
          if (fs.existsSync(oldFolderDir)) {
            fs.rmSync(oldFolderDir, { recursive: true, force: true });
          }
        }

        fs.writeFileSync(path.join(noteDir, 'content.html'), note.content || '', 'utf-8');

        const ddPath = path.join(noteDir, 'drawdata.json');
        if (note.drawData) {
          fs.writeFileSync(ddPath, JSON.stringify(note.drawData), 'utf-8');
        } else {
          if (fs.existsSync(ddPath)) fs.unlinkSync(ddPath);
        }

        const overlaysDir = path.join(noteDir, 'overlays');
        if (note.overlayImages && note.overlayImages.length > 0) {
          saveOverlays(overlaysDir, note.overlayImages);
        } else {
          if (fs.existsSync(overlaysDir)) {
            fs.rmSync(overlaysDir, { recursive: true, force: true });
          }
        }

        const modePath = path.join(noteDir, 'mode.json');
        if (note.activeMode === 'code') {
          fs.writeFileSync(modePath, JSON.stringify({ activeMode: 'code' }), 'utf-8');
        } else {
          if (fs.existsSync(modePath)) fs.unlinkSync(modePath);
        }

        const fsPath = path.join(noteDir, 'filesystem.json');
        if (note.fileSystem) {
          fs.writeFileSync(fsPath, JSON.stringify(note.fileSystem), 'utf-8');
        } else {
          if (fs.existsSync(fsPath)) fs.unlinkSync(fsPath);
        }

        const histPath = path.join(noteDir, 'sandbox_history.json');
        if (note.sandboxHistory) {
          fs.writeFileSync(histPath, JSON.stringify(note.sandboxHistory), 'utf-8');
        } else {
          if (fs.existsSync(histPath)) fs.unlinkSync(histPath);
        }

        metadata.push({ id: note.id, title: note.title || '', folder: folderName });
      }

      fs.writeFileSync(path.join(savePath, 'quicknotes.json'), JSON.stringify(metadata, null, 2), 'utf-8');

      return { success: true, path: savePath };
    } catch (err) {
      console.error('[save-quick-notes] 错误:', err);
      return { success: false, error: err.message };
    }
  });

  // ── 从文件系统加载快速笔记 ──
  ipcMain.handle('load-quick-notes', async (event, data) => {
    try {
      let savePath = data ? data.savePath : null;
      if (!savePath) {
        const quicknotesDir = dataSettings.getQuicknotesDir();
        savePath = quicknotesDir || path.join(app.getPath('userData'), 'quicknotes');
      }

      const manifestPath = path.join(savePath, 'quicknotes.json');
      if (!fs.existsSync(manifestPath)) {
        return { success: true, notes: [], path: savePath };
      }

      const metadata = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      const notes = [];

      for (const entry of metadata) {
        try {
          // 新格式目录名 = {名称}_{短id}（folder 字段），兼容旧格式（目录名 = 笔记 id）
          const noteDirName = entry.folder || entry.id;
          const noteDir = path.join(savePath, noteDirName);
          if (!fs.existsSync(noteDir)) continue;

          const note = { id: entry.id, title: entry.title || '', folder: entry.folder || '' };

          const contentPath = path.join(noteDir, 'content.html');
          note.content = fs.existsSync(contentPath) ? fs.readFileSync(contentPath, 'utf-8') : '';

          const drawDataPath = path.join(noteDir, 'drawdata.json');
          if (fs.existsSync(drawDataPath)) {
            try { note.drawData = JSON.parse(fs.readFileSync(drawDataPath, 'utf-8')); }
            catch { note.drawData = null; }
          } else {
            note.drawData = null;
          }

          const overlaysDir = path.join(noteDir, 'overlays');
          if (fs.existsSync(path.join(overlaysDir, 'manifest.json'))) {
            const overlays = loadOverlays(overlaysDir);
            note.overlayImages = (overlays && overlays.length > 0) ? overlays : [];
          } else {
            note.overlayImages = [];
          }

          const modePath = path.join(noteDir, 'mode.json');
          if (fs.existsSync(modePath)) {
            try {
              const mode = JSON.parse(fs.readFileSync(modePath, 'utf-8'));
              note.activeMode = mode.activeMode || 'text';
            } catch { note.activeMode = 'text'; }
          } else {
            note.activeMode = 'text';
          }

          const fsPath = path.join(noteDir, 'filesystem.json');
          if (fs.existsSync(fsPath)) {
            try { note.fileSystem = JSON.parse(fs.readFileSync(fsPath, 'utf-8')); }
            catch { note.fileSystem = null; }
          }

          const histPath = path.join(noteDir, 'sandbox_history.json');
          if (fs.existsSync(histPath)) {
            try { note.sandboxHistory = JSON.parse(fs.readFileSync(histPath, 'utf-8')); }
            catch { note.sandboxHistory = null; }
          }

          notes.push(note);
        } catch (noteErr) {
          console.error('[load-quick-notes] 单条笔记加载失败:', entry.id, noteErr);
        }
      }

      return { success: true, notes, path: savePath };
    } catch (err) {
      console.error('[load-quick-notes] 错误:', err);
      return { success: false, error: err.message };
    }
  });

  // ── 打开快速笔记所在文件夹 ──
  ipcMain.handle('show-quicknote-in-folder', async (event, data) => {
    try {
      let savePath = data ? data.savePath : null;
      if (!savePath) {
        const quicknotesDir = dataSettings.getQuicknotesDir();
        savePath = quicknotesDir || path.join(app.getPath('userData'), 'quicknotes');
      }
      if (!savePath || !fs.existsSync(savePath)) {
        return { success: false, error: 'not_found' };
      }

      let targetDir = savePath;
      const noteId = data ? data.noteId : null;
      if (noteId) {
        // 从清单中找到该笔记对应的磁盘文件夹（folder 字段，旧格式回退到笔记 id）
        const manifestPath = path.join(savePath, 'quicknotes.json');
        if (fs.existsSync(manifestPath)) {
          try {
            const metadata = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
            const entry = (metadata || []).find(n => n.id === noteId);
            const folderName = entry ? (entry.folder || entry.id) : null;
            if (folderName) {
              const dir = path.join(savePath, folderName);
              if (fs.existsSync(dir)) targetDir = dir;
            }
          } catch (e) {
            console.warn('[show-quicknote-in-folder] 读取清单失败:', e);
          }
        }
      }

      shell.showItemInFolder(targetDir);
      return { success: true, path: targetDir };
    } catch (err) {
      console.error('[show-quicknote-in-folder] 错误:', err);
      return { success: false, error: err.message };
    }
  });
}

module.exports = { bindQuickNotesIPC };