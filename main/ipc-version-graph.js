// ============================================================
//  main/ipc-version-graph.js — 版本图 IPC（内容寻址存储）
// ============================================================
const { ipcMain, app } = require('electron');
const path = require('path');
const fs = require('fs');
const dataSettings = require('../data-settings');

// ── 版本图目录（内容寻址存储）──
// 存储 key 可以是：
//   1. 项目文件夹绝对路径（如 D:\AstroKnot\项目文件\我的项目）→ 存到 <key>/.versiongraph/
//   2. 临时 projectId（未保存的项目）→ 存到数据目录/system/version-graphs-tmp/<key>/
function getVersionDir(versionKey) {
  let dir;
  if (versionKey && (versionKey.includes('\\') || versionKey.includes('/')) && /^[A-Za-z]:[\\/]|^\//.test(versionKey)) {
    // 是绝对路径 → 存到项目文件夹内的 .versiongraph
    dir = path.join(versionKey, '.versiongraph');
  } else {
    // 是临时 projectId → 存到数据目录临时目录
    const tmpDir = dataSettings.getVersionGraphsTmpDir(versionKey);
    if (tmpDir) {
      dir = tmpDir;
    } else {
      // 回退：dataSettings 未初始化时使用系统目录
      console.warn('[版本图] dataSettings 未初始化，使用默认路径');
      dir = path.join(app.getPath('userData'), 'version-graphs-tmp', sanitizeFileName(versionKey));
    }
  }
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function getVersionBlobsDir(projectId) {
  const dir = path.join(getVersionDir(projectId), 'blobs');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function getVersionGraphPath(projectId) {
  return path.join(getVersionDir(projectId), 'graph.json');
}
function getBlobPath(projectId, hash) {
  return path.join(getVersionBlobsDir(projectId), hash + '.json');
}
// 原子写工具
function atomicWrite(filePath, content) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, content, 'utf-8');
  try { fs.renameSync(tmp, filePath); } catch (e) {
    fs.copyFileSync(tmp, filePath);
    try { fs.unlinkSync(tmp); } catch (_) {}
  }
}

function sanitizeFileName(s) {
  return String(s).replace(/[^A-Za-z0-9_\-]/g, '_').slice(0, 64) || 'unknown';
}

function bindVersionGraphIPC() {
  // 保存图结构（commits + branches + HEAD）
  ipcMain.handle('version-save-graph', async (event, projectId, graph) => {
    try {
      if (!projectId || !graph) return { success: false, error: '参数缺失' };
      atomicWrite(getVersionGraphPath(projectId), JSON.stringify(graph, null, 2));
      return { success: true };
    } catch (e) {
      console.error('[版本图] 保存 graph 失败:', e);
      return { success: false, error: e.message };
    }
  });
  // 读取图结构
  ipcMain.handle('version-load-graph', async (event, projectId) => {
    try {
      if (!projectId) return { success: false, error: '参数缺失' };
      const p = getVersionGraphPath(projectId);
      if (!fs.existsSync(p)) return { success: false };
      const graph = JSON.parse(fs.readFileSync(p, 'utf-8'));
      return { success: true, graph: graph };
    } catch (e) {
      console.error('[版本图] 读取 graph 失败:', e);
      return { success: false, error: e.message };
    }
  });
  // 写入 blob（内容寻址，自动去重：文件已存在则跳过）
  ipcMain.handle('version-save-blob', async (event, projectId, hash, content) => {
    try {
      if (!projectId || !hash) return { success: false, error: '参数缺失' };
      const fp = getBlobPath(projectId, hash);
      if (!fs.existsSync(fp)) {
        atomicWrite(fp, JSON.stringify(content));
      }
      return { success: true };
    } catch (e) {
      console.error('[版本图] 保存 blob 失败:', e);
      return { success: false, error: e.message };
    }
  });
  // 批量写入 blobs
  ipcMain.handle('version-save-blobs', async (event, projectId, hashToContent) => {
    try {
      if (!projectId || !hashToContent) return { success: false, error: '参数缺失' };
      const blobsDir = getVersionBlobsDir(projectId);
      for (const hash in hashToContent) {
        const fp = path.join(blobsDir, hash + '.json');
        if (!fs.existsSync(fp)) {
          atomicWrite(fp, JSON.stringify(hashToContent[hash]));
        }
      }
      return { success: true };
    } catch (e) {
      console.error('[版本图] 批量保存 blobs 失败:', e);
      return { success: false, error: e.message };
    }
  });
  // 读取 blob
  ipcMain.handle('version-load-blob', async (event, projectId, hash) => {
    try {
      if (!projectId || !hash) return { success: false, error: '参数缺失' };
      const fp = getBlobPath(projectId, hash);
      if (!fs.existsSync(fp)) return { success: false };
      const content = JSON.parse(fs.readFileSync(fp, 'utf-8'));
      return { success: true, content: content };
    } catch (e) {
      console.error('[版本图] 读取 blob 失败:', e);
      return { success: false, error: e.message };
    }
  });
  // 列出所有项目版本图（用于跨项目视图）
  ipcMain.handle('version-list-graphs', async () => {
    try {
      // 使用数据目录下的版本图临时目录根
      const rootDir = dataSettings.getVersionGraphsTmpRoot() || path.join(app.getPath('userData'), 'version-graphs');
      if (!fs.existsSync(rootDir)) return { success: true, list: [] };
      const list = [];
      fs.readdirSync(rootDir).forEach(function (name) {
        const gp = path.join(rootDir, name, 'graph.json');
        if (fs.existsSync(gp)) {
          try {
            const g = JSON.parse(fs.readFileSync(gp, 'utf-8'));
            list.push({
              dirName: name,
              commitCount: (g.commits || []).length,
              branchCount: (g.branches || []).length,
              lastTime: g.commits && g.commits.length ? Math.max.apply(null, g.commits.map(function (c) { return c.time || 0; })) : 0
            });
          } catch (_) {}
        }
      });
      return { success: true, list: list };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  // 删除指定 key 的版本图（删除项目时清理临时存储）
  ipcMain.handle('version-delete-graph', async (event, versionKey) => {
    try {
      if (!versionKey) return { success: false, error: '参数缺失' };
      const dir = getVersionDir(versionKey);
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
      return { success: true };
    } catch (e) {
      console.error('[版本图] 删除失败:', e);
      return { success: false, error: e.message };
    }
  });
}

module.exports = { bindVersionGraphIPC };
