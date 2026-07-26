// ============================================================
//  main/ipc-data-settings.js — 数据目录配置 + 首次安装检测 IPC
// ============================================================
const { ipcMain, dialog, app } = require('electron');
const path = require('path');
const fs = require('fs');
const dataSettings = require('../data-settings');

function bindDataSettingsIPC(mainWindow, appRoot) {
  // ── 首次安装检测：检查数据目录是否已初始化 ──
  function checkFirstRun() {
    // 检查数据目录是否已完成首次设置
    if (dataSettings.isInitialized()) return false;

    // 兼容旧版本：检查 C 盘 userData 目录的标记文件
    const legacyUserDataPath = path.join(process.env.APPDATA || '', 'astroknot');
    const flagFile = path.join(legacyUserDataPath, '.astroknot_installed');
    if (fs.existsSync(flagFile)) {
      // 旧版本用户，自动迁移设置
      console.log('[首次检测] 发现旧版本标记，自动迁移设置');
      dataSettings.setDataRoot(path.join(appRoot, dataSettings.DEFAULT_DATA_DIR_NAME));
      return false;
    }

    // 真正的首次运行
    return true;
  }

  ipcMain.handle('check-first-run', () => checkFirstRun());

  ipcMain.handle('get-data-settings', () => dataSettings.getSettings());
  ipcMain.handle('set-data-root', (event, dataRoot) => {
    try {
      const result = dataSettings.setDataRoot(dataRoot);
      if (result) {
        return { success: true };
      } else {
        return { success: false, error: '无法创建数据目录，请检查权限或选择其他位置' };
      }
    } catch (e) {
      console.error('[set-data-root] 错误:', e);
      return { success: false, error: e.message || '未知错误' };
    }
  });
  ipcMain.handle('get-default-data-root', () => path.join(appRoot, dataSettings.DEFAULT_DATA_DIR_NAME));
  ipcMain.handle('select-data-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: '选择数据存储位置',
      buttonLabel: '选择此文件夹',
      defaultPath: path.join(appRoot, dataSettings.DEFAULT_DATA_DIR_NAME)
    });
    if (result.canceled) return { success: false, canceled: true };
    return { success: true, path: result.filePaths[0] };
  });
  ipcMain.handle('get-projects-dir', () => dataSettings.getProjectsDir());
  ipcMain.handle('get-quicknotes-dir', () => dataSettings.getQuicknotesDir());
}

module.exports = { bindDataSettingsIPC };
