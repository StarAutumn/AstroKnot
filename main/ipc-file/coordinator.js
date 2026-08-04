// ============================================================
//  main/ipc-file/coordinator.js — 汇总所有子模块的 IPC 注册
//  每个子模块负责一个独立域，注册各自的 ipcMain.handle
// ============================================================
const { bindProjectIOIPC } = require('./project-io');
const { bindSandboxSyncIPC } = require('./sandbox-sync');
const { bindNodeFolderIPC } = require('./node-folder');
const { bindAppLibraryIPC } = require('./app-library');
const { bindTrashIPC } = require('./trash');
const { bindIconIPC } = require('./icon');
const { bindQuickNotesIPC } = require('./quick-notes');
const { bindDiaryIPC } = require('./diary');
const { bindFileManagerIPC } = require('./file-manager');
const { bindIDEFSIPC } = require('./ide-fs');

function bindFileIPC(mainWindow) {
  bindProjectIOIPC(mainWindow);
  bindSandboxSyncIPC(mainWindow);
  bindNodeFolderIPC(mainWindow);
  bindAppLibraryIPC(mainWindow);
  bindTrashIPC(mainWindow);
  bindIconIPC(mainWindow);
  bindQuickNotesIPC(mainWindow);
  bindDiaryIPC(mainWindow);
  bindFileManagerIPC(mainWindow);
  bindIDEFSIPC(mainWindow);
}

module.exports = { bindFileIPC };