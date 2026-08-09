// ============================================================
//  main/ipc-file/github.js — GitHub 云同步 IPC
//  Token 验证、加密存储、仓库列表拉取
// ============================================================
const { ipcMain, app, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const API_BASE = 'https://api.github.com';

/** 计算 Git blob 的 sha（与 GitHub 一致：sha1("blob {size}\0{content}")） */
function gitBlobSha(content) {
  const header = Buffer.from(`blob ${content.length}\0`);
  return crypto.createHash('sha1').update(Buffer.concat([header, content])).digest('hex');
}

/** Token 加密存储路径 */
function tokenFilePath() {
  return path.join(app.getPath('userData'), 'github-token.dat');
}

/** GitHub API 请求封装 */
async function githubApi(endpoint, token) {
  const res = await fetch(API_BASE + endpoint, {
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'AstroKnot',
      Accept: 'application/vnd.github+json',
    },
  });
  return res;
}

function bindGitHubIPC(mainWindow) {
  // ── 验证 Token ──
  ipcMain.handle('github-verify-token', async (_event, token) => {
    try {
      const res = await githubApi('/user', token);
      if (!res.ok) return { success: false, error: `HTTP ${res.status}` };
      const data = await res.json();
      return {
        success: true,
        user: {
          login: data.login,
          name: data.name || data.login,
          avatar: data.avatar_url,
        },
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ── 加密保存 Token ──
  ipcMain.handle('github-save-token', async (_event, token) => {
    try {
      if (!safeStorage.isEncryptionAvailable()) {
        return { success: false, error: '系统不支持加密存储' };
      }
      const encrypted = safeStorage.encryptString(token);
      fs.writeFileSync(tokenFilePath(), encrypted);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ── 加载已存 Token ──
  ipcMain.handle('github-load-token', async () => {
    try {
      const fp = tokenFilePath();
      if (!fs.existsSync(fp)) return { success: false };
      if (!safeStorage.isEncryptionAvailable()) {
        return { success: false, error: '系统不支持加密存储' };
      }
      const encrypted = fs.readFileSync(fp);
      const token = safeStorage.decryptString(encrypted);
      return { success: true, token };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ── 清除 Token ──
  ipcMain.handle('github-clear-token', async () => {
    try {
      const fp = tokenFilePath();
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ── 拉取用户仓库列表 ──
  ipcMain.handle('github-list-repos', async (_event, token) => {
    try {
      const res = await githubApi(
        '/user/repos?per_page=100&sort=updated&visibility=all',
        token
      );
      if (!res.ok) return { success: false, error: `HTTP ${res.status}` };
      const repos = await res.json();
      return {
        success: true,
        repos: repos.map((r) => ({
          name: r.name,
          full_name: r.full_name,
          private: r.private,
          size: r.size,
          default_branch: r.default_branch,
          updated_at: r.updated_at,
        })),
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ── 创建新仓库 ──
  ipcMain.handle('github-create-repo', async (_event, token, payload) => {
    try {
      const res = await fetch(API_BASE + '/user/repos', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': 'AstroKnot',
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: payload.name,
          description: payload.description || '',
          private: payload.private !== false,
          auto_init: true,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        return { success: false, error: errBody.message || `HTTP ${res.status}` };
      }
      const repo = await res.json();
      return {
        success: true,
        repo: {
          name: repo.name,
          full_name: repo.full_name,
          private: repo.private,
          size: repo.size,
          default_branch: repo.default_branch,
          updated_at: repo.updated_at,
        },
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ── 删除仓库（不可逆，需 delete_repo 权限）──
  ipcMain.handle('github-delete-repo', async (_event, token, owner, repo) => {
    try {
      const res = await fetch(`${API_BASE}/repos/${owner}/${repo}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': 'AstroKnot',
          Accept: 'application/vnd.github+json',
        },
      });
      if (res.status === 204) return { success: true };
      let errMsg = `HTTP ${res.status}`;
      try { const body = await res.json(); if (body.message) errMsg = body.message; } catch (_) {}
      return { success: false, error: errMsg };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ── 获取仓库准确信息（文件树遍历求和 + 推送时间）──
  ipcMain.handle('github-get-repo-info', async (_event, token, owner, repo, branch) => {
    try {
      const headers = {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'AstroKnot',
        Accept: 'application/vnd.github+json',
      };

      // 获取仓库基本信息
      const repoRes = await fetch(`${API_BASE}/repos/${owner}/${repo}`, { headers });
      if (!repoRes.ok) return { success: false, error: `HTTP ${repoRes.status}` };
      const repoData = await repoRes.json();

      // 遍历文件树计算准确大小，并保留文件树供前端展示
      let totalSize = 0;
      let fileCount = 0;
      const treeItems = [];
      try {
        const treeRes = await fetch(
          `${API_BASE}/repos/${owner}/${repo}/git/trees/${branch || repoData.default_branch}?recursive=1`,
          { headers }
        );
        if (treeRes.ok) {
          const tree = await treeRes.json();
          if (tree.tree) {
            for (const item of tree.tree) {
              if (item.type === 'blob' && item.size) {
                totalSize += item.size;
                fileCount++;
              }
              treeItems.push({
                path: item.path,
                type: item.type, // 'blob' 文件 / 'tree' 目录
                size: item.size || 0,
                sha: item.sha,
              });
            }
          }
        }
      } catch (_) { /* 空仓库 */ }

      return {
        success: true,
        size: totalSize,
        fileCount,
        pushedAt: repoData.pushed_at,
        updatedAt: repoData.updated_at,
        defaultBranch: repoData.default_branch,
        tree: treeItems,
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ── 增量上传 AstroKnot-Data 到仓库（对比 sha，只传变化的文件）──
  ipcMain.handle('github-sync-upload', async (_event, token, repoInfo, dirs) => {
    try {
      const { owner, repo, branch } = repoInfo;
      const headers = {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'AstroKnot',
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      };

      // 1. 收集本地所有文件并计算 blob sha
      const localFiles = [];
      for (const [prefix, dir] of Object.entries(dirs)) {
        if (!dir) continue;
        for (const f of walkDir(dir)) {
          let content;
          try { content = fs.readFileSync(f.absPath); } catch (_) { continue; }
          localFiles.push({
            cloudPath: `${prefix}/${f.relPath}`,
            content,
            sha: gitBlobSha(content),
          });
        }
      }

      if (localFiles.length === 0) {
        return { success: true, successCount: 0, failCount: 0, skipped: 0, message: '没有需要同步的文件' };
      }

      // 2. 获取当前分支的 commit SHA + tree SHA
      const refRes = await fetch(
        `${API_BASE}/repos/${owner}/${repo}/git/ref/heads/${branch}`,
        { headers }
      );
      if (!refRes.ok) {
        return { success: false, error: `无法获取分支 ${branch}：HTTP ${refRes.status}` };
      }
      const parentCommitSha = (await refRes.json()).object.sha;

      const commitRes = await fetch(
        `${API_BASE}/repos/${owner}/${repo}/git/commits/${parentCommitSha}`,
        { headers }
      );
      let baseTreeSha = (await commitRes.json()).tree.sha;

      // 3. 获取远端 tree（recursive），建立 path -> sha 映射
      const remoteMap = new Map();
      const treeRes = await fetch(
        `${API_BASE}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
        { headers }
      );
      if (treeRes.ok) {
        const tree = await treeRes.json();
        if (tree.tree) {
          for (const item of tree.tree) {
            if (item.type === 'blob' && item.path) remoteMap.set(item.path, item.sha);
          }
        }
      }

      // 4. 对比，筛选需要上传的文件（新增 / 修改）
      const toUpload = [];
      let skipped = 0;
      for (const f of localFiles) {
        const remoteSha = remoteMap.get(f.cloudPath);
        if (remoteSha && remoteSha === f.sha) {
          skipped++; // 内容未变化，跳过
        } else {
          toUpload.push(f); // 新增或修改
        }
      }

      if (toUpload.length === 0) {
        return {
          success: true,
          successCount: 0,
          failCount: 0,
          skipped,
          message: `所有文件已是最新，跳过 ${skipped} 个`,
        };
      }

      // 5. 分批创建 tree（每批最多 500 个文件）
      const BATCH_SIZE = 500;
      let processedCount = 0;

      for (let i = 0; i < toUpload.length; i += BATCH_SIZE) {
        const batch = toUpload.slice(i, i + BATCH_SIZE);
        // 注意：Git Trees API 的 content 字段会忽略 encoding，直接按 UTF-8 文本存储。
        // 因此这里必须传原始文本，不能传 base64（否则云端会存成 base64 文本）。
        const treeEntries = batch.map((f) => ({
          path: f.cloudPath,
          mode: '100644',
          type: 'blob',
          content: f.content.toString('utf8'),
        }));

        const batchTreeRes = await fetch(
          `${API_BASE}/repos/${owner}/${repo}/git/trees`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries }),
          }
        );

        if (!batchTreeRes.ok) {
          const err = await batchTreeRes.json().catch(() => ({}));
          return { success: false, error: `创建 tree 失败：${err.message || batchTreeRes.status}` };
        }

        baseTreeSha = (await batchTreeRes.json()).sha;
        processedCount += batch.length;

        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('github-sync-progress', {
            current: processedCount,
            total: toUpload.length,
            file: `批次 ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(toUpload.length / BATCH_SIZE)}`,
          });
        }
      }

      // 6. 创建 commit（指向最新 tree）
      const newCommitRes = await fetch(
        `${API_BASE}/repos/${owner}/${repo}/git/commits`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            message: `AstroKnot sync: ${toUpload.length} 个文件变更（跳过 ${skipped} 个） ${new Date().toISOString()}`,
            tree: baseTreeSha,
            parents: [parentCommitSha],
          }),
        }
      );

      if (!newCommitRes.ok) {
        const err = await newCommitRes.json().catch(() => ({}));
        return { success: false, error: `创建 commit 失败：${err.message || newCommitRes.status}` };
      }

      const newCommitSha = (await newCommitRes.json()).sha;

      // 7. 更新分支 ref 指向新 commit
      const refUpdateRes = await fetch(
        `${API_BASE}/repos/${owner}/${repo}/git/refs/heads/${branch}`,
        {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ sha: newCommitSha }),
        }
      );

      if (!refUpdateRes.ok) {
        const err = await refUpdateRes.json().catch(() => ({}));
        return { success: false, error: `更新分支失败：${err.message || refUpdateRes.status}` };
      }

      return {
        success: true,
        successCount: toUpload.length,
        failCount: 0,
        skipped,
        errors: [],
        commitSha: newCommitSha,
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ── 从云端下载数据恢复到本地（Git Blobs API 并发拉取）──
  // targets 可选：[{ prefix: 'projects/MyApp', isDir: true }, { prefix: 'quicknotes/n.json', isDir: false }]
  // 不传 targets 时下载全部已知 prefix 的数据
  ipcMain.handle('github-sync-download', async (_event, token, repoInfo, dirs, targets) => {
    try {
      const { owner, repo, branch } = repoInfo;
      const headers = {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'AstroKnot',
        Accept: 'application/vnd.github+json',
      };

      // 1. 获取远端 tree
      const treeRes = await fetch(
        `${API_BASE}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
        { headers }
      );
      if (!treeRes.ok) {
        return { success: false, error: `获取文件树失败：HTTP ${treeRes.status}` };
      }
      const tree = await treeRes.json();
      if (!tree.tree || tree.tree.length === 0) {
        return { success: true, successCount: 0, failCount: 0, message: '云端仓库为空' };
      }

      // 2. 过滤出已知 prefix 的文件（projects/quicknotes/diaries）；若指定 targets 则只下载匹配项
      const hasTargets = Array.isArray(targets) && targets.length > 0;
      const blobs = [];
      for (const item of tree.tree) {
        if (item.type !== 'blob' || !item.path) continue;
        const slashIdx = item.path.indexOf('/');
        if (slashIdx < 0) continue;
        const prefix = item.path.substring(0, slashIdx);
        if (!dirs[prefix]) continue; // 只恢复已知目录的数据
        const relPath = item.path.substring(slashIdx + 1);
        if (!relPath || relPath.includes('..')) continue; // 路径安全检查
        if (hasTargets) {
          let matched = false;
          for (const t of targets) {
            if (t.isDir) {
              if (item.path === t.prefix || item.path.startsWith(t.prefix + '/')) { matched = true; break; }
            } else {
              if (item.path === t.prefix) { matched = true; break; }
            }
          }
          if (!matched) continue;
        }
        blobs.push({ path: item.path, sha: item.sha, prefix, relPath });
      }

      if (blobs.length === 0) {
        return { success: true, successCount: 0, failCount: 0, message: '云端没有可恢复的数据' };
      }

      // 3. 并发下载并写回本地（concurrency=5）
      let successCount = 0;
      let failCount = 0;
      const errors = [];
      let idx = 0;
      const CONCURRENCY = 5;

      async function worker() {
        while (true) {
          const cur = idx++;
          if (cur >= blobs.length) break;
          const item = blobs[cur];
          try {
            const blobRes = await fetch(
              `${API_BASE}/repos/${owner}/${repo}/git/blobs/${item.sha}`,
              { headers }
            );
            if (!blobRes.ok) {
              failCount++;
              errors.push(`${item.path}: HTTP ${blobRes.status}`);
            } else {
              const blob = await blobRes.json();
              let buf = blob.encoding === 'base64'
                ? Buffer.from(blob.content || '', 'base64')
                : Buffer.from(blob.content || '', 'utf8');
              // 兼容旧版上传 bug：旧版误把 base64 文本当作文件内容存入云端，
              // 下载解一层 base64 后得到的仍是 base64 文本。此处检测并再解一层恢复原文。
              // AstroKnot 数据为 JSON/Markdown（含 { " # 等非 base64 字符），不会被误判。
              if (blob.encoding === 'base64') {
                const s = buf.toString('utf8');
                if (s.trim().length > 0 && /^[A-Za-z0-9+\/\n\r =]+$/.test(s)) {
                  try {
                    const recovered = Buffer.from(s, 'base64');
                    if (recovered.length > 0 && !recovered.toString('utf8').includes('\uFFFD')) {
                      buf = recovered;
                    }
                  } catch (_) {}
                }
              }
              const localPath = path.join(dirs[item.prefix], item.relPath);
              fs.mkdirSync(path.dirname(localPath), { recursive: true });
              fs.writeFileSync(localPath, buf);
              successCount++;
            }
          } catch (e) {
            failCount++;
            errors.push(`${item.path}: ${e.message}`);
          }
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('github-sync-progress', {
              current: Math.min(cur + 1, blobs.length),
              total: blobs.length,
              file: item.path,
            });
          }
        }
      }

      await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

      // 快速笔记下载后重建本地清单：下载单个笔记文件夹时，云端 quicknotes.json
      // 不会随文件一起下载，需扫描本地笔记文件夹补齐清单，否则刷新后列表不显示
      if (dirs.quicknotes && blobs.some(b => b.prefix === 'quicknotes')) {
        try {
          _reconcileQuickNotesManifest(dirs.quicknotes);
        } catch (e) {
          console.warn('[github-sync-download] 重建快速笔记清单失败:', e);
        }
      }
      // 日记下载后重建本地索引：下载单篇日记时，云端 diary-index.json 不会一并下载，
      // 需扫描本地 diaries 目录补齐索引，否则日历上不显示
      if (dirs.diaries && blobs.some(b => b.prefix === 'diaries')) {
        try {
          _reconcileDiaryIndex(dirs.diaries);
        } catch (e) {
          console.warn('[github-sync-download] 重建日记索引失败:', e);
        }
      }

      return { success: true, successCount, failCount, errors };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ── 从云端删除指定文件（Git Trees API 的 sha:null 删除标记）──
  // targets: [{ prefix: 'projects/MyApp', isDir: true }, { prefix: 'quicknotes/n.json', isDir: false }]
  ipcMain.handle('github-delete-paths', async (_event, token, repoInfo, targets) => {
    try {
      const { owner, repo, branch } = repoInfo;
      const headers = {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'AstroKnot',
        Accept: 'application/vnd.github+json',
      };

      // 1. ref -> commit sha
      const refRes = await fetch(`${API_BASE}/repos/${owner}/${repo}/git/ref/heads/${branch}`, { headers });
      if (!refRes.ok) return { success: false, error: `无法获取分支：HTTP ${refRes.status}` };
      const parentCommitSha = (await refRes.json()).object.sha;

      // 2. commit -> base tree sha
      const commitRes = await fetch(`${API_BASE}/repos/${owner}/${repo}/git/commits/${parentCommitSha}`, { headers });
      if (!commitRes.ok) return { success: false, error: `无法获取提交：HTTP ${commitRes.status}` };
      const baseTreeSha = (await commitRes.json()).tree.sha;

      // 3. 拉 recursive tree，找出匹配 targets 的所有 blob 路径
      const treeRes = await fetch(`${API_BASE}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, { headers });
      if (!treeRes.ok) return { success: false, error: `获取文件树失败：HTTP ${treeRes.status}` };
      const tree = await treeRes.json();
      const toDelete = [];
      for (const item of (tree.tree || [])) {
        if (item.type !== 'blob' || !item.path) continue;
        let matched = false;
        for (const t of targets) {
          if (t.isDir) {
            if (item.path === t.prefix || item.path.startsWith(t.prefix + '/')) { matched = true; break; }
          } else {
            if (item.path === t.prefix) { matched = true; break; }
          }
        }
        if (matched) toDelete.push(item.path);
      }

      if (toDelete.length === 0) {
        return { success: true, deletedCount: 0, message: '云端没有匹配的文件' };
      }

      // 4. 创建新 tree，用 sha:null 标记删除
      const deleteEntries = toDelete.map((p) => ({ path: p, mode: '100644', type: 'blob', sha: null }));
      const newTreeRes = await fetch(`${API_BASE}/repos/${owner}/${repo}/git/trees`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ base_tree: baseTreeSha, tree: deleteEntries }),
      });
      if (!newTreeRes.ok) {
        const err = await newTreeRes.json().catch(() => ({}));
        return { success: false, error: `创建 tree 失败：${err.message || newTreeRes.status}` };
      }
      const newTreeSha = (await newTreeRes.json()).sha;

      // 5. 创建 commit
      const newCommitRes = await fetch(`${API_BASE}/repos/${owner}/${repo}/git/commits`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: `AstroKnot sync: 删除 ${toDelete.length} 个文件 ${new Date().toISOString()}`,
          tree: newTreeSha,
          parents: [parentCommitSha],
        }),
      });
      if (!newCommitRes.ok) {
        const err = await newCommitRes.json().catch(() => ({}));
        return { success: false, error: `创建 commit 失败：${err.message || newCommitRes.status}` };
      }
      const newCommitSha = (await newCommitRes.json()).sha;

      // 6. 更新分支 ref
      const refUpdateRes = await fetch(`${API_BASE}/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ sha: newCommitSha }),
      });
      if (!refUpdateRes.ok) {
        const err = await refUpdateRes.json().catch(() => ({}));
        return { success: false, error: `更新分支失败：${err.message || refUpdateRes.status}` };
      }

      return { success: true, deletedCount: toDelete.length };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
}

module.exports = { bindGitHubIPC };

// ============================================================
//  同步辅助函数
// ============================================================

/** 递归遍历目录，返回所有文件的绝对路径和相对路径 */
function walkDir(dir, base) {
  const results = [];
  if (!base) base = dir;
  if (!fs.existsSync(dir)) return results;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      // 跳过 .git 等隐藏目录
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...walkDir(fullPath, base));
      } else {
        const relPath = path.relative(base, fullPath).replace(/\\/g, '/');
        results.push({ absPath: fullPath, relPath });
      }
    }
  } catch (_) { /* 忽略无权限目录 */ }
  return results;
}

/**
 * 重建/合并本地快速笔记清单（quicknotes.json）
 * 快速笔记的列表加载完全依赖 quicknotes.json 清单；
 * 云端下载单篇笔记文件夹时清单不会一并下载，这里扫描本地笔记文件夹，
 * 将缺失的条目补进清单，已有条目则更新标题，保证下载后列表能立即显示。
 * 支持两种磁盘格式：
 *   - 新格式：{标题}_qnote_{id前8位}（与节点文件夹命名一致）
 *   - 旧格式：qnote_xxx（目录名 = 完整笔记 id）
 * @param {string} quicknotesDir 快速笔记目录
 */
function _reconcileQuickNotesManifest(quicknotesDir) {
  if (!quicknotesDir || !fs.existsSync(quicknotesDir)) return;

  const manifestPath = path.join(quicknotesDir, 'quicknotes.json');
  let manifest = [];
  if (fs.existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      if (!Array.isArray(manifest)) manifest = [];
    } catch (_) { manifest = []; }
  }

  // 已存在的条目索引（按 folder 或旧格式 id）
  const byFolder = new Map();
  const byId = new Map();
  for (const entry of manifest) {
    if (entry.folder) byFolder.set(entry.folder, entry);
    else if (entry.id) byId.set(entry.id, entry);
  }

  let changed = false;
  for (const dirent of fs.readdirSync(quicknotesDir, { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue;
    const folder = dirent.name;
    if (folder === 'quicknotes') continue;

    let entry = byFolder.get(folder);
    if (entry) {
      // 文件夹已存在于清单中，无需处理
      continue;
    }
    if (!entry && folder.startsWith('qnote_')) {
      // 旧格式目录名即完整 id
      entry = byId.get(folder);
      if (entry) {
        // 补上 folder 字段
        entry.folder = folder;
        byFolder.set(folder, entry);
        changed = true;
        continue;
      }
      entry = { id: folder, title: '', folder };
      manifest.push(entry);
      byFolder.set(folder, entry);
      changed = true;
      continue;
    }

    // 新格式：{标题}_qnote_{id前8位}
    const qIdx = folder.lastIndexOf('_qnote_');
    if (qIdx <= 0) continue; // 非快速笔记文件夹，跳过
    const title = folder.slice(0, qIdx) || '快速笔记';
    entry = {
      id: 'qnote_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      title,
      folder,
    };
    manifest.push(entry);
    byFolder.set(folder, entry);
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
    console.log('[github-sync-download] 已合并快速笔记清单，共', manifest.length, '条');
  }
}

/**
 * 重建/合并本地日记索引（diary-index.json）
 * 日记的日历显示依赖 diary-index.json 索引；云端下载单篇日记时索引不会一并下载，
 * 这里扫描本地 diaries 目录中的 .html 文件，将缺失的条目补进索引。
 * 日记文件结构：diaries/YYYY-MM/YYYY-MM-DD.html
 * @param {string} diariesDir 日记目录
 */
function _reconcileDiaryIndex(diariesDir) {
  if (!diariesDir || !fs.existsSync(diariesDir)) return;

  const indexPath = path.join(diariesDir, 'diary-index.json');
  let index = [];
  if (fs.existsSync(indexPath)) {
    try {
      index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      if (!Array.isArray(index)) index = [];
    } catch (_) { index = []; }
  }

  const byDate = new Map(index.map(e => [e.date, e]));
  let changed = false;

  for (const f of walkDir(diariesDir)) {
    const m = f.relPath.match(/(\d{4}-\d{2}-\d{2})\.html$/);
    if (!m) continue;
    const dateStr = m[1];
    if (byDate.has(dateStr)) continue;
    let title = '';
    try {
      const text = fs.readFileSync(f.absPath, 'utf-8').replace(/<[^>]*>/g, '').trim();
      title = text.substring(0, 30);
    } catch (_) { title = ''; }
    const now = new Date().toISOString();
    index.push({ date: dateStr, title, updatedAt: now, createdAt: now });
    byDate.set(dateStr, true);
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
    console.log('[github-sync-download] 已合并日记索引，共', index.length, '条');
  }
}
