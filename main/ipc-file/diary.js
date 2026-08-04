// ============================================================
//  main/ipc-file/diary.js — 日记 I/O IPC 处理器
// ============================================================
const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const dataSettings = require('../../data-settings');

function bindDiaryIPC(mainWindow) {
  function _isValidDiaryDate(dateStr) {
    return typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
  }

  function _getDiaryFilePath(dateStr) {
    const diariesDir = dataSettings.getDiariesDir();
    const yearMonth = dateStr.substring(0, 7);
    const monthDir = path.join(diariesDir, yearMonth);
    return path.join(monthDir, dateStr + '.html');
  }

  function _readDiaryIndex() {
    const diariesDir = dataSettings.getDiariesDir();
    const indexPath = path.join(diariesDir, 'diary-index.json');
    if (!fs.existsSync(indexPath)) return [];
    try {
      const data = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      return Array.isArray(data) ? data : [];
    } catch (_) { return []; }
  }

  function _writeDiaryIndex(index) {
    const diariesDir = dataSettings.getDiariesDir();
    fs.mkdirSync(diariesDir, { recursive: true });
    const indexPath = path.join(diariesDir, 'diary-index.json');
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
  }

  ipcMain.handle('diary-read', async (event, dateStr) => {
    try {
      if (!_isValidDiaryDate(dateStr)) return { success: false, error: 'Invalid date format' };
      const filePath = _getDiaryFilePath(dateStr);
      if (!fs.existsSync(filePath)) return { success: true, content: '', exists: false };
      const content = fs.readFileSync(filePath, 'utf-8');
      return { success: true, content, exists: true };
    } catch (err) {
      console.error('[diary-read] 错误:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('diary-save', async (event, dateStr, content) => {
    try {
      if (!_isValidDiaryDate(dateStr)) return { success: false, error: 'Invalid date format' };
      const filePath = _getDiaryFilePath(dateStr);
      const monthDir = path.dirname(filePath);
      fs.mkdirSync(monthDir, { recursive: true });
      fs.writeFileSync(filePath, content || '', 'utf-8');

      const index = _readDiaryIndex();
      const entry = index.find(e => e.date === dateStr);
      const now = new Date().toISOString();
      let title = '';
      try {
        const text = (content || '').replace(/<[^>]*>/g, '').trim();
        title = text.substring(0, 30);
      } catch (_) { title = ''; }
      if (entry) {
        entry.title = title;
        entry.updatedAt = now;
      } else {
        index.push({ date: dateStr, title, updatedAt: now, createdAt: now });
      }
      _writeDiaryIndex(index);

      return { success: true };
    } catch (err) {
      console.error('[diary-save] 错误:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('diary-delete', async (event, dateStr) => {
    try {
      if (!_isValidDiaryDate(dateStr)) return { success: false, error: 'Invalid date format' };
      const filePath = _getDiaryFilePath(dateStr);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

      const index = _readDiaryIndex();
      const filtered = index.filter(e => e.date !== dateStr);
      _writeDiaryIndex(filtered);

      return { success: true };
    } catch (err) {
      console.error('[diary-delete] 错误:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('diary-list', async () => {
    try {
      const index = _readDiaryIndex();
      return { success: true, diaries: index };
    } catch (err) {
      console.error('[diary-list] 错误:', err);
      return { success: false, error: err.message, diaries: [] };
    }
  });
}

module.exports = { bindDiaryIPC };