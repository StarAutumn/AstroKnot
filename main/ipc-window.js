// ============================================================
//  main/ipc-window.js — 窗口控制 IPC
// ============================================================
const { ipcMain, BrowserWindow, app } = require('electron');

function bindWindowIPC(mainWindow) {
  ipcMain.on('win-minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });
  ipcMain.on('win-maximize', (event) => {
    const w = BrowserWindow.fromWebContents(event.sender);
    if (w?.isMaximized()) w.unmaximize(); else w?.maximize();
  });
  ipcMain.on('win-unmaximize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.unmaximize();
  });
  ipcMain.on('win-close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });
  ipcMain.on('close-app', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });
  ipcMain.on('toggle-fullscreen', (event) => {
    const w = BrowserWindow.fromWebContents(event.sender);
    if (w) w.setFullScreen(!w.isFullScreen());
  });

  // HMR 开关（仅开发版）
  ipcMain.handle('hmr-toggle', (event, enabled) => {
    const { setHmrEnabled } = require('./hmr');
    setHmrEnabled(!!enabled);
    return !!enabled;
  });
  ipcMain.handle('hmr-get-enabled', () => {
    const { isHmrEnabled } = require('./hmr');
    return isHmrEnabled();
  });
  ipcMain.handle('is-dev', () => !app.isPackaged);
}

module.exports = { bindWindowIPC };
