// ============================================================
//  UI/Toolbar/github-login/cloud.js — 云端文件（分类文件树/条目菜单/删除/下载）
// ============================================================
//  （原 github-login.js 拆分为文件夹版本）
//  - renderCategoryTree/appendCategory：按项目/快速笔记/日记三栏分类渲染文件树
//  - showItemContextMenu：条目右键菜单（下载到本地 / 从云端删除）
//  - handleDeleteFromCloud：从云端删除指定条目
//  - handleDownloadItems：下载指定条目到本地
//  - refreshLocalData：下载后刷新本地对应数据视图
// ============================================================
import { _overlay, _selectedRepo, _currentToken } from './share.js';
import { showInternalConfirm } from './dialogs.js';
import { refreshRepoInfo } from './panel.js';

/** 按项目 / 快速笔记 / 日记三栏分类渲染 */
export function renderCategoryTree(treeItems, container) {
  const projects = new Map(); // 项目名 -> target
  const quicknotes = []; // { name, target }
  const diaries = [];

  for (const item of treeItems) {
    if (!item.path || item.type !== 'blob') continue;
    const slashIdx = item.path.indexOf('/');
    if (slashIdx < 0) continue;
    const prefix = item.path.substring(0, slashIdx);
    const rest = item.path.substring(slashIdx + 1);
    if (!rest) continue;
    if (prefix === 'projects') {
      // 项目目录名（projects/ 后的第一段）
      const name = rest.split('/')[0];
      if (name && !projects.has(name)) {
        projects.set(name, { prefix: 'projects/' + name, isDir: true });
      }
    } else if (prefix === 'quicknotes') {
      // 快速笔记云端结构：quicknotes/<笔记文件夹>/content.html ...
      // 忽略清单文件 quicknotes.json
      if (rest === 'quicknotes.json') continue;
      const qParts = rest.split('/');
      if (qParts.length > 1) {
        // 文件夹格式：显示笔记文件夹名并去重（同一文件夹的 content.html/mode.json/overlays 等只显示一次）
        const folder = qParts[0];
        if (!quicknotes.some(q => q.target.prefix === 'quicknotes/' + folder)) {
          quicknotes.push({ name: folder, target: { prefix: 'quicknotes/' + folder, isDir: true } });
        }
      } else {
        // 旧版单文件格式（如 quicknotes/xxx.json）：直接显示文件名
        quicknotes.push({ name: qParts[0], target: { prefix: 'quicknotes/' + qParts[0], isDir: false } });
      }
    } else if (prefix === 'diaries') {
      diaries.push({ name: rest.split('/').pop(), target: { prefix: 'diaries/' + rest, isDir: false } });
    }
  }

  const projItems = [...projects.entries()].map(([n, t]) => ({ name: n, target: t })).sort((a, b) => a.name.localeCompare(b.name));
  appendCategory(container, '📁 项目', projItems, '个项目');
  appendCategory(container, '📓 快速笔记', quicknotes.sort((a, b) => a.name.localeCompare(b.name)), '条笔记');
  appendCategory(container, '📔 日记', diaries.sort((a, b) => a.name.localeCompare(b.name)), '篇日记');
}

/** 添加一个可折叠分类分组（每个条目右键可下载到本地） */
function appendCategory(container, title, items, unit) {
  const header = document.createElement('div');
  header.style.cssText = 'padding:5px 6px;cursor:pointer;color:var(--text-secondary);font-size:12px;font-weight:600;border-radius:4px;user-select:none;';
  header.innerHTML = '📂 ' + title + ' <span style="color:var(--text-secondary);font-weight:400;">(' + items.length + ' ' + unit + ')</span>';

  const list = document.createElement('div');
  list.style.display = 'block';

  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'padding:3px 6px 3px 22px;color:var(--text-secondary);font-size:11px;';
    empty.textContent = '（空）';
    list.appendChild(empty);
  } else {
    items.forEach((entry) => {
      const row = document.createElement('div');
      row.style.cssText = 'padding:3px 6px 3px 22px;color:var(--text-primary);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
      row.textContent = '· ' + entry.name;
      row.title = '右键下载到本地';
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showItemContextMenu(e.clientX, e.clientY, entry.target, entry.name);
      });
      list.appendChild(row);
    });
  }

  header.onmouseenter = () => { header.style.background = 'var(--btn-hover)'; };
  header.onmouseleave = () => { header.style.background = ''; };
  header.onclick = () => {
    const expanded = header.dataset.expanded !== '0';
    header.dataset.expanded = expanded ? '0' : '1';
    list.style.display = expanded ? 'none' : 'block';
  };

  container.appendChild(header);
  container.appendChild(list);
}

/** 条目右键菜单（下载到本地） */
function showItemContextMenu(x, y, target, name) {
  const existing = document.getElementById('ghItemContextMenu');
  if (existing) existing.remove();

  const menu = document.createElement('div');
  menu.id = 'ghItemContextMenu';
  menu.style.cssText = 'position:absolute;left:' + x + 'px;top:' + y + 'px;background:var(--panel-bg);border:1px solid var(--panel-border);border-radius:var(--panel-radius);padding:4px 0;z-index:20;box-shadow:var(--panel-shadow);backdrop-filter:blur(16px);';

  const dlItem = document.createElement('div');
  dlItem.textContent = '⬇️ 下载到本地';
  dlItem.style.cssText = 'padding:6px 16px;color:var(--text-primary);font-size:12px;cursor:pointer;white-space:nowrap;';
  dlItem.onmouseenter = () => { dlItem.style.background = 'var(--btn-hover)'; };
  dlItem.onmouseleave = () => { dlItem.style.background = ''; };
  dlItem.onclick = () => {
    menu.remove();
    handleDownloadItems([target], name);
  };
  menu.appendChild(dlItem);

  const delItem = document.createElement('div');
  delItem.textContent = '🗑️ 从云端删除';
  delItem.style.cssText = 'padding:6px 16px;color:#ff9090;font-size:12px;cursor:pointer;white-space:nowrap;';
  delItem.onmouseenter = () => { delItem.style.background = 'rgba(255,80,80,0.15)'; };
  delItem.onmouseleave = () => { delItem.style.background = ''; };
  delItem.onclick = () => {
    menu.remove();
    handleDeleteFromCloud([target], name);
  };
  menu.appendChild(delItem);

  _overlay.appendChild(menu);
  setTimeout(() => {
    _overlay.addEventListener('click', () => menu.remove(), { once: true });
  }, 0);
}

/** 从云端删除指定条目（项目目录 / 单个笔记 / 单篇日记） */
async function handleDeleteFromCloud(targets, label) {
  if (!_selectedRepo || !_currentToken || !targets || targets.length === 0) return;

  const tip = targets[0].isDir
    ? '将删除整个「' + (label || '该项') + '」目录及其所有文件'
    : '将删除「' + (label || '该项') + '」';
  const ok = await showInternalConfirm({
    title: '⚠️ 确认从云端删除',
    message: tip + '\n\n此操作仅删除云端仓库中的文件，不影响本地数据，且不可撤销。',
    confirmText: '确认删除',
    danger: true,
  });
  if (!ok) return;

  const progressDiv = _overlay.querySelector('#ghSyncProgress');
  const bar = _overlay.querySelector('#ghSyncBar');
  const status = _overlay.querySelector('#ghSyncStatus');

  progressDiv.style.display = 'block';
  bar.style.width = '0%';
  status.textContent = '正在从云端删除「' + (label || '选中项') + '」…';

  try {
    const parts = _selectedRepo.full_name.split('/');
    const repoInfo = {
      owner: parts[0],
      repo: parts[1],
      branch: _selectedRepo.default_branch || 'main',
    };

    const res = await window.api.githubDeletePaths(_currentToken, repoInfo, targets);

    if (res.success) {
      if (res.deletedCount === 0) {
        status.textContent = '⚠️ 云端没有找到「' + (label || '该项') + '」的数据';
      } else {
        status.textContent = '✅ 已从云端删除 ' + res.deletedCount + ' 个文件';
        bar.style.width = '100%';
        // 刷新右侧文件树与容量信息
        refreshRepoInfo();
      }
    } else {
      status.textContent = '❌ 删除失败：' + res.error;
    }
  } catch (e) {
    status.textContent = '❌ 错误：' + e.message;
  }
}

/** 下载后刷新本地对应数据视图（项目列表 / 日历 / 快速笔记） */
export async function refreshLocalData(categories) {
  try {
    if (categories.includes('projects') && typeof window.loadProjectListFromDisk === 'function') {
      await window.loadProjectListFromDisk();
    }
    if (categories.includes('diaries') && typeof window.reloadDiaryIndex === 'function') {
      await window.reloadDiaryIndex();
      if (typeof window._refreshCalendarAfterDiary === 'function') window._refreshCalendarAfterDiary();
    }
    if (categories.includes('quicknotes') && typeof window.loadQuickNotes === 'function') {
      await window.loadQuickNotes();
      if (typeof window.renderQuickNotesList === 'function') window.renderQuickNotesList();
    }
    return true;
  } catch (e) {
    console.warn('[GitHub同步] 刷新本地数据失败:', e);
    return false;
  }
}

/** 下载指定条目到本地（覆盖本地同名文件） */
async function handleDownloadItems(targets, label) {
  if (!_selectedRepo || !_currentToken || !targets || targets.length === 0) return;

  const progressDiv = _overlay.querySelector('#ghSyncProgress');
  const bar = _overlay.querySelector('#ghSyncBar');
  const status = _overlay.querySelector('#ghSyncStatus');

  progressDiv.style.display = 'block';
  bar.style.width = '0%';
  status.textContent = '准备下载「' + (label || '选中项') + '」…';

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
      status.textContent = data.current + '/' + data.total + ' (' + pct + '%) — ' + data.file;
    });

    const res = await window.api.githubSyncDownload(_currentToken, repoInfo, dirs, targets);

    if (res.success) {
      if (res.successCount === 0) {
        status.textContent = '⚠️ 云端没有找到「' + (label || '该项') + '」的数据';
      } else {
        status.textContent = '✅ 下载完成：成功 ' + res.successCount + ' 个，失败 ' + res.failCount + ' 个';
        bar.style.width = '100%';
        // 刷新本地对应数据视图（按下载项所属类别）
        const cats = [...new Set(targets.map((t) => t.prefix.split('/')[0]))];
        const ok = await refreshLocalData(cats);
        if (ok) status.textContent += ' · 本地列表已刷新';
      }
    } else {
      status.textContent = '❌ 下载失败：' + res.error;
    }
  } catch (e) {
    status.textContent = '❌ 错误：' + e.message;
  }
}
