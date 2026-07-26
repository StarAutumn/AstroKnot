// ============================================================
//  main/ipc-storage.js — 偏好设置 + SystemStorage IPC
// ============================================================
const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const dataSettings = require('../data-settings');

function bindStorageIPC() {
  // ── IPC：系统偏好设置文件化 ──
  // 同步读取 preferences.json（sendSync 模式，启动引导用）
  ipcMain.on('read-preferences-sync', (event) => {
    try {
      const systemDir = dataSettings.getSystemDir();
      const prefPath = path.join(systemDir, 'preferences.json');
      if (fs.existsSync(prefPath)) {
        const raw = fs.readFileSync(prefPath, 'utf-8');
        const data = JSON.parse(raw);
        event.returnValue = { success: true, data: data };
      } else {
        event.returnValue = { success: true, data: null };
      }
    } catch (e) {
      console.error('[read-preferences-sync] 错误:', e);
      event.returnValue = { success: false, data: null, error: e.message };
    }
  });

  // 异步写入 preferences.json（防抖落盘用，原子写入）
  ipcMain.handle('write-preferences', async (event, data) => {
    try {
      const systemDir = dataSettings.getSystemDir();
      if (!systemDir) return { success: false, error: 'systemDir 未初始化' };
      if (!fs.existsSync(systemDir)) {
        fs.mkdirSync(systemDir, { recursive: true });
      }
      const prefPath = path.join(systemDir, 'preferences.json');
      const tmpPath = prefPath + '.tmp';
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tmpPath, prefPath); // 原子写入
      return { success: true };
    } catch (e) {
      console.error('[write-preferences] 错误:', e);
      return { success: false, error: e.message };
    }
  });

  // 同步写入 preferences.json（退出落盘用，sendSync 模式，原子写入）
  ipcMain.on('flush-preferences-sync', (event, data) => {
    try {
      const systemDir = dataSettings.getSystemDir();
      if (!systemDir) {
        event.returnValue = { success: false, error: 'systemDir 未初始化' };
        return;
      }
      if (!fs.existsSync(systemDir)) {
        fs.mkdirSync(systemDir, { recursive: true });
      }
      const prefPath = path.join(systemDir, 'preferences.json');
      const tmpPath = prefPath + '.tmp';
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tmpPath, prefPath);
      event.returnValue = { success: true };
    } catch (e) {
      console.error('[flush-preferences-sync] 错误:', e);
      event.returnValue = { success: false, error: e.message };
    }
  });

  // ── IPC：SystemStorage 文件化键值存储 ──
  const _storageDir = path.join(dataSettings.getSystemDir(), 'storage');

  function _storageEncodeKey(key) {
    return Buffer.from(encodeURIComponent(key), 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  function _storageFilePath(key) {
    return path.join(_storageDir, _storageEncodeKey(key) + '.json');
  }

  function _ensureStorageDir() {
    if (!fs.existsSync(_storageDir)) {
      fs.mkdirSync(_storageDir, { recursive: true });
    }
  }

  // 同步读取单个 key
  ipcMain.on('system-storage-read-sync', (event, key) => {
    try {
      const filePath = _storageFilePath(key);
      if (!fs.existsSync(filePath)) {
        event.returnValue = { success: true, value: null };
        return;
      }
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw);
      event.returnValue = { success: true, value: data.value };
    } catch (e) {
      console.error('[system-storage-read-sync] 错误:', key, e);
      event.returnValue = { success: false, value: null, error: e.message };
    }
  });

  // 同步写入单个 key（原子写入）
  ipcMain.on('system-storage-write-sync', (event, key, value) => {
    try {
      _ensureStorageDir();
      const filePath = _storageFilePath(key);
      const tmpPath = filePath + '.tmp';
      const payload = { key, value, updatedAt: new Date().toISOString() };
      fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2), 'utf-8');
      fs.renameSync(tmpPath, filePath);
      event.returnValue = { success: true };
    } catch (e) {
      console.error('[system-storage-write-sync] 错误:', key, e);
      event.returnValue = { success: false, error: e.message };
    }
  });

  // 同步删除单个 key
  ipcMain.on('system-storage-remove-sync', (event, key) => {
    try {
      const filePath = _storageFilePath(key);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      event.returnValue = { success: true };
    } catch (e) {
      console.error('[system-storage-remove-sync] 错误:', key, e);
      event.returnValue = { success: false, error: e.message };
    }
  });

  // 同步列出所有 key
  ipcMain.on('system-storage-keys-sync', (event) => {
    try {
      if (!fs.existsSync(_storageDir)) {
        event.returnValue = { success: true, keys: [] };
        return;
      }
      const files = fs.readdirSync(_storageDir).filter(f => f.endsWith('.json'));
      const keys = files.map(f => {
        try {
          const raw = fs.readFileSync(path.join(_storageDir, f), 'utf-8');
          const data = JSON.parse(raw);
          return data.key || null;
        } catch (e) {
          return null;
        }
      }).filter(k => k !== null);
      event.returnValue = { success: true, keys };
    } catch (e) {
      console.error('[system-storage-keys-sync] 错误:', e);
      event.returnValue = { success: false, keys: [], error: e.message };
    }
  });
}

module.exports = { bindStorageIPC };
