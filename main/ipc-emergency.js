// ============================================================
//  main/ipc-emergency.js — 应急备份 IPC（崩溃兜底）
// ============================================================
const { ipcMain, app } = require('electron');
const path = require('path');
const fs = require('fs');
const dataSettings = require('../data-settings');

function sanitizeFileName(s) {
  return String(s).replace(/[^A-Za-z0-9_\-]/g, '_').slice(0, 64) || 'unknown';
}

// ── 应急备份目录（使用自定义数据目录）──
function getEmergencyDir() {
  const dir = dataSettings.getEmergencyBackupsDir();
  if (!dir) {
    // 回退：dataSettings 未初始化时使用系统目录
    console.warn('[应急备份] dataSettings 未初始化，使用默认路径');
    const fallbackDir = path.join(app.getPath('userData'), 'emergency-backups');
    if (!fs.existsSync(fallbackDir)) fs.mkdirSync(fallbackDir, { recursive: true });
    return fallbackDir;
  }
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function getEmergencyManifestPath() {
  return path.join(getEmergencyDir(), 'manifest.json');
}
function readEmergencyManifest() {
  const p = getEmergencyManifestPath();
  try {
    if (!fs.existsSync(p)) return { entries: {} };
    return JSON.parse(fs.readFileSync(p, 'utf-8')) || { entries: {} };
  } catch (e) {
    console.error('[应急备份] 读取 manifest 失败:', e);
    return { entries: {} };
  }
}
function writeEmergencyManifest(m) {
  try {
    fs.writeFileSync(getEmergencyManifestPath(), JSON.stringify(m, null, 2), 'utf-8');
  } catch (e) {
    console.error('[应急备份] 写入 manifest 失败:', e);
  }
}

function bindEmergencyIPC() {
  // 写入备份（每项目只保留最新一份，标记 pending=true 触发启动恢复）
  ipcMain.handle('emergency-save', async (event, payload) => {
    try {
      if (!payload || !payload.projectId || !payload.snapshot) return { success: false, error: '参数缺失' };
      const dir = getEmergencyDir();
      const fileName = 'proj_' + sanitizeFileName(payload.projectId) + '.json';
      const filePath = path.join(dir, fileName);
      // 原子写：先写临时文件再重命名，避免写一半崩溃导致文件损坏
      const tmpPath = filePath + '.tmp';
      fs.writeFileSync(tmpPath, JSON.stringify({
        projectId: payload.projectId,
        projectName: payload.projectName || '未命名',
        savedAt: Date.now(),
        snapshot: payload.snapshot
      }), 'utf-8');
      try { fs.renameSync(tmpPath, filePath); } catch (e) {
        // 某些系统 rename 跨设备失败，回退直接写
        fs.copyFileSync(tmpPath, filePath);
        try { fs.unlinkSync(tmpPath); } catch (_) {}
      }
      // 更新 manifest：pending=true 表示下次启动需提示恢复
      // 正常退出（before-quit 触发的 flushNow）传 pending=false，不弹恢复提示
      // 只有定时备份/崩溃兜底才 pending=true
      const isPending = payload.pending !== false; // 默认 true
      const m = readEmergencyManifest();
      m.entries[payload.projectId] = {
        projectId: payload.projectId,
        projectName: payload.projectName || '未命名',
        fileName: fileName,
        savedAt: Date.now(),
        pending: isPending
      };
      writeEmergencyManifest(m);
      return { success: true };
    } catch (e) {
      console.error('[应急备份] 保存失败:', e);
      return { success: false, error: e.message };
    }
  });
  // 列出所有 pending 备份（启动恢复用）
  ipcMain.handle('emergency-list', async () => {
    const m = readEmergencyManifest();
    const list = [];
    for (const id in m.entries) {
      const entry = m.entries[id];
      if (!entry.pending) continue;
      const fp = path.join(getEmergencyDir(), entry.fileName);
      if (!fs.existsSync(fp)) { delete m.entries[id]; continue; }
      list.push({
        projectId: entry.projectId,
        projectName: entry.projectName,
        savedAt: entry.savedAt
      });
    }
    writeEmergencyManifest(m);
    return { list: list };
  });
  // 读取指定备份内容
  ipcMain.handle('emergency-restore', async (event, projectId) => {
    try {
      const m = readEmergencyManifest();
      const entry = m.entries[projectId];
      if (!entry) return { success: false, error: '备份不存在' };
      const fp = path.join(getEmergencyDir(), entry.fileName);
      if (!fs.existsSync(fp)) return { success: false, error: '备份文件丢失' };
      const data = JSON.parse(fs.readFileSync(fp, 'utf-8'));
      // 恢复后清除 pending 标记，避免重复提示
      entry.pending = false;
      writeEmergencyManifest(m);
      return { success: true, snapshot: data.snapshot, projectName: data.projectName, savedAt: data.savedAt };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  // 放弃恢复：清除 pending 标记（可选保留/删除文件）
  ipcMain.handle('emergency-dismiss', async (event, projectId) => {
    const m = readEmergencyManifest();
    if (m.entries[projectId]) {
      const entry = m.entries[projectId];
      try { fs.unlinkSync(path.join(getEmergencyDir(), entry.fileName)); } catch (_) {}
      delete m.entries[projectId];
      writeEmergencyManifest(m);
    }
    return { success: true };
  });
  // 清空所有 pending（用户已处理或选择全部忽略）
  ipcMain.handle('emergency-dismiss-all', async () => {
    const m = readEmergencyManifest();
    m.entries = {};
    writeEmergencyManifest(m);
    // 同时清理目录下孤儿备份文件
    try {
      const dir = getEmergencyDir();
      fs.readdirSync(dir).forEach(function (f) {
        if (f !== 'manifest.json' && f.endsWith('.json')) {
          try { fs.unlinkSync(path.join(dir, f)); } catch (_) {}
        }
      });
    } catch (_) {}
    return { success: true };
  });
}

module.exports = { bindEmergencyIPC };
