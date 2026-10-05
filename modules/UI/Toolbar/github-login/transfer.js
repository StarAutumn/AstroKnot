// ============================================================
//  UI/Toolbar/github-login/transfer.js — 全量传输（上传到云端 / 从云端恢复）
// ============================================================
//  （原 github-login.js 拆分为文件夹版本）
//  - handleUpload：上传本地数据到云端（底部同步区按钮）
//  - handleDownload：从云端全量下载恢复到本地（覆盖本地同名文件）
// ============================================================
import { _overlay, _selectedRepo, _currentToken } from './share.js';
import { refreshRepoInfo } from './panel.js';
import { showInternalConfirm } from './dialogs.js';
import { refreshLocalData } from './cloud.js';

/** 上传数据到云端 */
export async function handleUpload() {
  if (!_selectedRepo || !_currentToken) return;

  const btn = _overlay.querySelector('#ghUploadBtn');
  const progressDiv = _overlay.querySelector('#ghSyncProgress');
  const bar = _overlay.querySelector('#ghSyncBar');
  const status = _overlay.querySelector('#ghSyncStatus');

  btn.disabled = true;
  btn.textContent = '上传中…';
  progressDiv.style.display = 'block';
  bar.style.width = '0%';
  status.textContent = '准备上传…';

  try {
    // 获取数据目录路径
    const settings = await window.api.getDataSettings();
    const dirs = {
      projects: settings.projectsDir,
      quicknotes: settings.quicknotesDir,
      diaries: settings.diariesDir,
    };

    // 解析 owner/repo
    const parts = _selectedRepo.full_name.split('/');
    const repoInfo = {
      owner: parts[0],
      repo: parts[1],
      branch: _selectedRepo.default_branch || 'main',
    };

    // 监听进度
    window.api.onGithubSyncProgress((data) => {
      const pct = Math.round((data.current / data.total) * 100);
      bar.style.width = pct + '%';
      status.textContent = `${data.current}/${data.total} (${pct}%) — ${data.file}`;
    });

    const res = await window.api.githubSyncUpload(_currentToken, repoInfo, dirs);

    if (res.success) {
      const skippedStr = res.skipped ? `，跳过 ${res.skipped} 个未变化` : '';
      const msg = `✅ 上传完成：成功 ${res.successCount} 个，失败 ${res.failCount} 个${skippedStr}`;
      status.textContent = msg;
      bar.style.width = '100%';
    } else {
      status.textContent = '❌ 上传失败：' + res.error;
    }
  } catch (e) {
    status.textContent = '❌ 错误：' + e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = '⬆️ 上传数据到云端';
    // 上传完成后刷新仓库容量信息与文件树
    refreshRepoInfo();
  }
}

/** 从云端下载数据恢复到本地（会覆盖本地同名文件） */
export async function handleDownload() {
  if (!_selectedRepo || !_currentToken) return;

  // 二次确认（覆盖本地数据）
  const ok = await showInternalConfirm({
    title: '⬇️ 从云端恢复',
    message: '将从云端下载 "' + _selectedRepo.full_name + '" 的数据到本地，\n本地同名文件将被覆盖。确定继续吗？',
    confirmText: '确认恢复',
    danger: false,
  });
  if (!ok) return;

  const btn = _overlay.querySelector('#ghDownloadBtn');
  const progressDiv = _overlay.querySelector('#ghSyncProgress');
  const bar = _overlay.querySelector('#ghSyncBar');
  const status = _overlay.querySelector('#ghSyncStatus');

  btn.disabled = true;
  btn.textContent = '下载中…';
  progressDiv.style.display = 'block';
  bar.style.width = '0%';
  status.textContent = '准备从云端下载…';

  try {
    const settings = await window.api.getDataSettings();
    const dirs = {
      projects: settings.projectsDir,
      quicknotes: settings.quicknotesDir,
      diaries: settings.diariesDir,
    };

    const parts = _selectedRepo.full_name.split('/');
    const repoInfo = {
      owner: parts[0],
      repo: parts[1],
      branch: _selectedRepo.default_branch || 'main',
    };

    window.api.onGithubSyncProgress((data) => {
      const pct = Math.round((data.current / data.total) * 100);
      bar.style.width = pct + '%';
      status.textContent = `${data.current}/${data.total} (${pct}%) — ${data.file}`;
    });

    const res = await window.api.githubSyncDownload(_currentToken, repoInfo, dirs);

    if (res.success) {
      const msg = `✅ 恢复完成：成功 ${res.successCount} 个，失败 ${res.failCount} 个`;
      status.textContent = msg;
      bar.style.width = '100%';
      // 全量恢复后刷新所有本地数据视图
      const ok = await refreshLocalData(['projects', 'quicknotes', 'diaries']);
      if (ok) status.textContent += ' · 本地列表已刷新';
    } else {
      status.textContent = '❌ 恢复失败：' + res.error;
    }
  } catch (e) {
    status.textContent = '❌ 错误：' + e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = '⬇️ 从云端恢复';
  }
}
