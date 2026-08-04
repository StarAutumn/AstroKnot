// ============================================================
//  main/ipc-file/quick-notes.js — 快速笔记 I/O IPC 处理器
// ============================================================
const { ipcMain, app } = require('electron');
const path = require('path');
const fs = require('fs');
const dataSettings = require('../../data-settings');
const {
  saveOverlays, loadOverlays,
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

      if (fs.existsSync(savePath)) {
        for (const entry of fs.readdirSync(savePath, { withFileTypes: true })) {
          if (entry.isDirectory() && entry.name.startsWith('qnote_') && !currentNoteIds.has(entry.name)) {
            fs.rmSync(path.join(savePath, entry.name), { recursive: true, force: true });
          }
        }
      }

      for (const note of notes) {
        const noteDir = path.join(savePath, note.id);
        fs.mkdirSync(noteDir, { recursive: true });

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

        metadata.push({ id: note.id, title: note.title || '' });
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
          const noteDir = path.join(savePath, entry.id);
          if (!fs.existsSync(noteDir)) continue;

          const note = { id: entry.id, title: entry.title || '' };

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
}

module.exports = { bindQuickNotesIPC };