// ============================================================
//  main/ipc-file/index.js — 项目文件 I/O IPC 模块入口
//  转发至 coordinator.js，保持对外接口不变
// ============================================================
const { bindFileIPC } = require('./coordinator');
module.exports = { bindFileIPC };