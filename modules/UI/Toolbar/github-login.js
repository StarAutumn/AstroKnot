// ============================================================
//  UI/Toolbar/github-login.js — GitHub 登录与仓库选择弹窗
// ============================================================

let _overlay = null;
let _currentToken = null;
let _selectedRepo = null;
let _currentRepos = [];

import { openMobileSyncDialog } from './mobile-sync.js';

// ── GitHub 官方图标（Octocat Mark，fill: currentColor 自适应颜色）──
const GITHUB_ICON_SVG = '<svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden="true" style="display:block;">' +
  '<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>';

/** 更新 AstroKnot 菜单底部按钮：已登录时显示 GitHub 账号头像 */
function setGithubLoginBtnLoggedIn(user) {
  const btn = document.getElementById('githubLoginBtn');
  if (!btn) return;
  btn.innerHTML = '<img src="' + user.avatar + '" alt="" style="width:22px;height:22px;border-radius:50%;object-fit:cover;display:block;pointer-events:none;">';
  btn.title = (user.name ? user.name + ' (@' + user.login + ')' : '@' + user.login) + ' · 点击打开 GitHub 云同步';
}

/** 更新 AstroKnot 菜单底部按钮：未登录时显示 GitHub 图标 */
function setGithubLoginBtnLoggedOut() {
  const btn = document.getElementById('githubLoginBtn');
  if (!btn) return;
  btn.innerHTML = GITHUB_ICON_SVG;
  btn.title = '登录到 GitHub';
}

// ── 隐藏仓库的本地存储 ──
function getHiddenRepos() {
  try { return JSON.parse(localStorage.getItem('gh_hidden_repos') || '[]'); } catch (_) { return []; }
}
function addHiddenRepo(fullName) {
  const list = getHiddenRepos();
  if (!list.includes(fullName)) { list.push(fullName); localStorage.setItem('gh_hidden_repos', JSON.stringify(list)); }
}
function removeHiddenRepo(fullName) {
  const list = getHiddenRepos();
  const idx = list.indexOf(fullName);
  if (idx >= 0) { list.splice(idx, 1); localStorage.setItem('gh_hidden_repos', JSON.stringify(list)); }
}

/** 格式化时间为"刚刚/X分钟前/X小时前/X天前/日期" */
function _formatTime(isoStr) {
  if (!isoStr) return '从未';
  const d = new Date(isoStr);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
  if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
  if (diff < 86400 * 7) return Math.floor(diff / 86400) + ' 天前';
  return d.toLocaleDateString('zh-CN');
}

/** 格式化字节大小 */
function _formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(2) + ' GB';
}

/** 初始化：绑定按钮点击，并检测已保存的 Token 显示账号头像 */
export function initGitHubLogin() {
  const btn = document.getElementById('githubLoginBtn');
  if (!btn) return;
  btn.addEventListener('click', openGitHubSyncPanel);
  // 默认显示 GitHub 图标
  setGithubLoginBtnLoggedOut();
  // 异步检测已保存的 Token：已登录则把按钮换成账号头像
  (async () => {
    try {
      const loaded = await window.api.githubLoadToken();
      if (loaded.success && loaded.token) {
        const verified = await window.api.githubVerifyToken(loaded.token);
        if (verified.success) setGithubLoginBtnLoggedIn(verified.user);
      }
    } catch (_) { /* 静默失败，保持未登录图标 */ }
  })();
}

/** 打开 GitHub 同步面板 */
async function openGitHubSyncPanel() {
  if (!_overlay) {
    _overlay = createPanel();
    document.body.appendChild(_overlay);
    bindPanelEvents();
  }
  _overlay.style.display = 'flex';

  // 重置同步区域状态（清除上次上传的进度和状态）
  const syncSection = _overlay.querySelector('#ghSyncSection');
  if (syncSection) {
    syncSection.style.display = 'none';
    _overlay.querySelector('#ghSyncProgress').style.display = 'none';
    _overlay.querySelector('#ghSyncBar').style.width = '0%';
    _overlay.querySelector('#ghSyncStatus').textContent = '';
  }
  // 重置右侧文件树
  _overlay.querySelector('#ghFileTree').innerHTML = '';
  _overlay.querySelector('#ghFileTreeCount').textContent = '';

  // 尝试自动登录：加载已存 Token 并验证
  const loginSection = _overlay.querySelector('#ghLoginSection');
  const repoSection = _overlay.querySelector('#ghRepoSection');
  const loadingHint = _overlay.querySelector('#ghLoadingHint');

  loginSection.style.display = 'none';
  repoSection.style.display = 'none';
  loadingHint.style.display = 'flex';
  loadingHint.textContent = '正在检查登录状态…';

  try {
    const loaded = await window.api.githubLoadToken();
    if (loaded.success && loaded.token) {
      const verified = await window.api.githubVerifyToken(loaded.token);
      if (verified.success) {
        _currentToken = loaded.token;
        await showRepoSection(verified.user);
        return;
      }
    }
  } catch (e) {
    // 静默失败，回退到登录界面
  }
  showLoginSection();
}

/** 显示登录区 */
async function showLoginSection() {
  // 未登录：菜单按钮恢复为 GitHub 图标
  setGithubLoginBtnLoggedOut();
  _overlay.querySelector('#ghLoadingHint').style.display = 'none';
  _overlay.querySelector('#ghRepoSection').style.display = 'none';
  _overlay.querySelector('#ghSyncSection').style.display = 'none';
  _overlay.querySelector('#ghLoginSection').style.display = 'block';
  _overlay.querySelector('#ghTokenInput').value = '';
  _overlay.querySelector('#ghLoginStatus').textContent = '';

  // 检测是否有已存 Token，显示快速登录按钮
  const quickBtn = _overlay.querySelector('#ghQuickLoginBtn');
  const clearLink = _overlay.querySelector('#ghClearTokenLink');
  try {
    const loaded = await window.api.githubLoadToken();
    if (loaded.success && loaded.token) {
      quickBtn.style.display = 'block';
      clearLink.style.display = 'inline-block';
    } else {
      quickBtn.style.display = 'none';
      clearLink.style.display = 'none';
    }
  } catch (_) {
    quickBtn.style.display = 'none';
    clearLink.style.display = 'none';
  }
}

/** 显示仓库选择区 */
async function showRepoSection(user) {
  // 登录成功：菜单按钮显示账号头像
  setGithubLoginBtnLoggedIn(user);
  _overlay.querySelector('#ghLoadingHint').style.display = 'none';
  _overlay.querySelector('#ghLoginSection').style.display = 'none';
  _overlay.querySelector('#ghRepoSection').style.display = 'flex';
  _overlay.querySelector('#ghSyncSection').style.display = 'none';

  // 重置选中状态
  _selectedRepo = null;

  // 填充用户信息
  const avatar = _overlay.querySelector('#ghUserAvatar');
  avatar.src = user.avatar;
  avatar.style.visibility = 'visible';
  avatar.onerror = () => { avatar.style.visibility = 'hidden'; };
  _overlay.querySelector('#ghUserName').textContent = user.name + ' (@' + user.login + ')';

  // 重置右侧文件树占位
  _overlay.querySelector('#ghFileTree').innerHTML = '<div style="color:var(--text-secondary);font-size:12px;padding:8px 4px;">请选择左侧仓库查看文件</div>';
  _overlay.querySelector('#ghFileTreeCount').textContent = '';

  // 拉取仓库列表
  const repoList = _overlay.querySelector('#ghRepoList');
  repoList.innerHTML = '<div style="color:var(--text-secondary);font-size:12px;padding:10px;">正在加载仓库列表…</div>';

  try {
    const res = await window.api.githubListRepos(_currentToken);
    if (!res.success) {
      repoList.innerHTML = '<div style="color:#ff8080;font-size:12px;padding:10px;">仓库列表加载失败：' + res.error + '</div>';
      return;
    }
    if (!res.repos || res.repos.length === 0) {
      repoList.innerHTML = '<div style="color:var(--text-secondary);font-size:12px;padding:10px;">没有可同步的仓库</div>';
      return;
    }
    _currentRepos = res.repos;
    renderRepoList(res.repos);
  } catch (e) {
    repoList.innerHTML = '<div style="color:#ff8080;font-size:12px;padding:10px;">加载失败：' + e.message + '</div>';
  }
}

/** 渲染仓库列表（过滤隐藏仓库） */
function renderRepoList(repos) {
  const repoList = _overlay.querySelector('#ghRepoList');
  repoList.innerHTML = '';
  const hidden = getHiddenRepos();
  const visibleRepos = repos.filter(r => !hidden.includes(r.full_name));

  if (visibleRepos.length === 0) {
    repoList.innerHTML = '<div style="color:var(--text-secondary);font-size:12px;padding:10px;">所有仓库已隐藏，点击右上角 🙈 查看隐藏仓库</div>';
    return;
  }

  visibleRepos.forEach((repo) => {
    const item = document.createElement('div');
    item.dataset.fullname = repo.full_name;
    const isSelected = _selectedRepo && _selectedRepo.full_name === repo.full_name;
    item.style.cssText = 'display:flex;align-items:center;padding:7px 10px;border-radius:6px;cursor:pointer;transition:background 0.15s;' +
      (isSelected ? 'background:var(--btn-hover);border-left:3px solid var(--accent);' : 'border-left:3px solid transparent;');

    item.onmouseenter = () => {
      if (!(_selectedRepo && _selectedRepo.full_name === repo.full_name)) item.style.background = 'var(--btn-hover)';
    };
    item.onmouseleave = () => {
      if (!(_selectedRepo && _selectedRepo.full_name === repo.full_name)) item.style.background = '';
    };

    const pushedStr = repo.pushed_at ? _formatTime(repo.pushed_at) : '从未推送';

    item.innerHTML =
      '<div style="flex:1;min-width:0;">' +
        '<div style="color:var(--text-primary);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' +
          (repo.private ? '🔒 ' : '📂 ') + repo.name +
        '</div>' +
        '<div style="color:var(--text-secondary);font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' +
          '⏱ ' + pushedStr + ' · 🌿 ' + (repo.default_branch || 'main') +
        '</div>' +
      '</div>';

    item.addEventListener('click', () => selectRepo(repo));

    // 右键菜单：隐藏仓库
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showRepoContextMenu(e.clientX, e.clientY, repo);
    });

    repoList.appendChild(item);
  });
}

/** 仓库右键菜单 */
function showRepoContextMenu(x, y, repo) {
  const existing = document.getElementById('ghContextMenu');
  if (existing) existing.remove();

  const menu = document.createElement('div');
  menu.id = 'ghContextMenu';
  menu.style.cssText = 'position:absolute;left:' + x + 'px;top:' + y + 'px;background:var(--panel-bg);border:1px solid var(--panel-border);border-radius:var(--panel-radius);padding:4px 0;z-index:20;box-shadow:var(--panel-shadow);backdrop-filter:blur(16px);';

  const hideItem = document.createElement('div');
  hideItem.textContent = '🙈 隐藏此仓库';
  hideItem.style.cssText = 'padding:6px 16px;color:var(--text-primary);font-size:12px;cursor:pointer;white-space:nowrap;';
  hideItem.onmouseenter = () => { hideItem.style.background = 'var(--btn-hover)'; };
  hideItem.onmouseleave = () => { hideItem.style.background = ''; };
  hideItem.onclick = () => {
    addHiddenRepo(repo.full_name);
    menu.remove();
    renderRepoList(_currentRepos);
  };
  menu.appendChild(hideItem);

  // 分隔线
  const divider = document.createElement('div');
  divider.style.cssText = 'height:1px;background:var(--divider);margin:4px 0;';
  menu.appendChild(divider);

  const deleteItem = document.createElement('div');
  deleteItem.textContent = '🗑️ 删除此仓库';
  deleteItem.style.cssText = 'padding:6px 16px;color:#ff9090;font-size:12px;cursor:pointer;white-space:nowrap;';
  deleteItem.onmouseenter = () => { deleteItem.style.background = 'rgba(255,128,128,0.12)'; };
  deleteItem.onmouseleave = () => { deleteItem.style.background = ''; };
  deleteItem.onclick = () => {
    menu.remove();
    showDeleteConfirmPanel(repo);
  };
  menu.appendChild(deleteItem);

  // 挂载到 _overlay 内部，确保在弹窗之上
  _overlay.appendChild(menu);
  setTimeout(() => {
    _overlay.addEventListener('click', () => menu.remove(), { once: true });
  }, 0);
}

/** 删除仓库确认面板（输入仓库名确认） */
function showDeleteConfirmPanel(repo) {
  const existing = document.getElementById('ghDeleteConfirmPanel');
  if (existing) existing.remove();

  const panel = document.createElement('div');
  panel.id = 'ghDeleteConfirmPanel';
  panel.style.cssText = 'position:absolute;inset:0;background:var(--modal-overlay);backdrop-filter:blur(8px);z-index:40;display:flex;align-items:center;justify-content:center;';

  const content = document.createElement('div');
  content.style.cssText = 'width:360px;max-width:90vw;background:var(--panel-bg);border:1px solid var(--panel-border);border-radius:var(--panel-radius);box-shadow:var(--panel-shadow);padding:20px;';

  content.innerHTML =
    '<div style="color:#ff9090;font-size:15px;font-weight:600;margin-bottom:12px;">⚠️ 删除仓库</div>' +
    '<div style="color:var(--text-primary);font-size:13px;margin-bottom:8px;">即将删除：</div>' +
    '<div style="color:#ff8080;font-size:14px;font-weight:600;margin-bottom:12px;">' + (repo.private ? '🔒 ' : '📂 ') + repo.full_name + '</div>' +
    '<div style="color:#ff9090;font-size:12px;margin-bottom:16px;">此操作不可逆！仓库及所有数据将永久消失。<br>请输入仓库名称确认删除：</div>' +
    '<input id="ghDeleteConfirmInput" placeholder="' + repo.name + '" style="width:100%;box-sizing:border-box;padding:8px 10px;background:var(--input-bg);border:1px solid rgba(255,128,128,0.3);border-radius:6px;color:var(--text-primary);font-size:13px;outline:none;margin-bottom:8px;">' +
    '<div id="ghDeleteConfirmStatus" style="color:#ff8080;font-size:12px;min-height:16px;margin-bottom:8px;"></div>' +
    '<div style="display:flex;gap:8px;">' +
      '<button id="ghDeleteConfirmCancel" style="flex:1;padding:8px;background:var(--btn-bg);border:1px solid var(--panel-border);border-radius:6px;color:var(--text-primary);font-size:13px;cursor:pointer;">取消</button>' +
      '<button id="ghDeleteConfirmOk" style="flex:1;padding:8px;background:#8b2c2c;border:1px solid rgba(255,128,128,0.3);border-radius:6px;color:#ffe0e0;font-size:13px;cursor:pointer;">确认删除</button>' +
    '</div>';

  panel.appendChild(content);
  _overlay.appendChild(panel);

  const input = panel.querySelector('#ghDeleteConfirmInput');
  const status = panel.querySelector('#ghDeleteConfirmStatus');
  const okBtn = panel.querySelector('#ghDeleteConfirmOk');
  const cancelBtn = panel.querySelector('#ghDeleteConfirmCancel');

  input.focus();

  cancelBtn.onclick = () => panel.remove();
  panel.addEventListener('click', (e) => { if (e.target === panel) panel.remove(); });

  okBtn.onclick = async () => {
    const value = input.value.trim();
    if (value !== repo.name) {
      status.textContent = '仓库名不匹配，请输入 "' + repo.name + '"';
      return;
    }
    okBtn.disabled = true;
    okBtn.textContent = '正在删除…';
    status.textContent = '';
    try {
      const parts = repo.full_name.split('/');
      const res = await window.api.githubDeleteRepo(_currentToken, parts[0], parts[1]);
      if (res.success) {
        panel.remove();
        _currentRepos = _currentRepos.filter(r => r.full_name !== repo.full_name);
        removeHiddenRepo(repo.full_name);
        // 若删除的是当前选中仓库，清空右侧与底部同步区
        if (_selectedRepo && _selectedRepo.full_name === repo.full_name) {
          _selectedRepo = null;
          _overlay.querySelector('#ghSyncSection').style.display = 'none';
          _overlay.querySelector('#ghFileTree').innerHTML = '<div style="color:var(--text-secondary);font-size:12px;padding:8px 4px;">请选择左侧仓库查看文件</div>';
          _overlay.querySelector('#ghFileTreeCount').textContent = '';
        }
        renderRepoList(_currentRepos);
      } else {
        status.textContent = '⚠️ ' + res.error;
        okBtn.disabled = false;
        okBtn.textContent = '确认删除';
      }
    } catch (e) {
      status.textContent = '⚠️ ' + e.message;
      okBtn.disabled = false;
      okBtn.textContent = '确认删除';
    }
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') okBtn.click();
    if (e.key === 'Escape') panel.remove();
  });
}

/** 显示隐藏仓库管理面板 */
function showHiddenReposPanel() {
  const hidden = getHiddenRepos();
  const hiddenRepos = _currentRepos.filter(r => hidden.includes(r.full_name));

  // 移除已有面板
  const existing = document.getElementById('ghHiddenPanel');
  if (existing) { existing.remove(); return; }

  const panel = document.createElement('div');
  panel.id = 'ghHiddenPanel';
  panel.style.cssText = 'position:absolute;inset:0;background:var(--modal-overlay);backdrop-filter:blur(8px);z-index:30;display:flex;align-items:center;justify-content:center;';

  const content = document.createElement('div');
  content.style.cssText = 'width:400px;max-width:90vw;max-height:60vh;background:var(--panel-bg);border:1px solid var(--panel-border);border-radius:var(--panel-radius);box-shadow:var(--panel-shadow);display:flex;flex-direction:column;overflow:hidden;';

  let listHtml = '';
  if (hiddenRepos.length === 0) {
    listHtml = '<div style="color:var(--text-secondary);font-size:12px;padding:16px;text-align:center;">没有隐藏的仓库</div>';
  } else {
    listHtml = hiddenRepos.map(repo =>
      '<div style="display:flex;align-items:center;padding:8px 12px;border-radius:6px;">' +
        '<div style="flex:1;min-width:0;color:var(--text-primary);font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' +
          (repo.private ? '🔒 ' : '📂 ') + repo.full_name +
        '</div>' +
        '<button class="gh-restore-btn" data-fullname="' + repo.full_name + '" style="margin-left:8px;padding:4px 10px;font-size:11px;background:var(--btn-bg);border:1px solid var(--panel-border);border-radius:4px;color:var(--text-primary);cursor:pointer;">恢复</button>' +
      '</div>'
    ).join('');
  }

  content.innerHTML =
    '<div style="display:flex;align-items:center;padding:12px 16px;border-bottom:1px solid var(--divider);">' +
      '<span style="color:var(--text-primary);font-size:14px;font-weight:600;flex:1;">🙈 隐藏的仓库</span>' +
      '<button id="ghHiddenPanelClose" style="background:none;border:none;color:var(--text-secondary);font-size:16px;cursor:pointer;padding:4px 8px;">✕</button>' +
    '</div>' +
    '<div style="flex:1;overflow-y:auto;padding:8px;">' + listHtml + '</div>';

  panel.appendChild(content);
  // 挂载到 _overlay 内部，确保在弹窗之上
  _overlay.appendChild(panel);

  // 关闭
  panel.querySelector('#ghHiddenPanelClose').addEventListener('click', () => panel.remove());
  panel.addEventListener('click', (e) => { if (e.target === panel) panel.remove(); });

  // 恢复按钮
  panel.querySelectorAll('.gh-restore-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      removeHiddenRepo(btn.dataset.fullname);
      panel.remove();
      renderRepoList(_currentRepos);
      // 如果还有隐藏仓库，重新打开面板
      if (getHiddenRepos().length > 0) showHiddenReposPanel();
    });
  });
}

/** 选择仓库：显示同步区域，不关闭面板 */
function selectRepo(repo) {
  _selectedRepo = repo;
  const syncSection = _overlay.querySelector('#ghSyncSection');
  if (syncSection) {
    syncSection.style.display = 'block';
    _overlay.querySelector('#ghSelectedRepo').textContent = repo.full_name;
    _overlay.querySelector('#ghSyncProgress').style.display = 'none';
    _overlay.querySelector('#ghSyncBar').style.width = '0%';
    _overlay.querySelector('#ghSyncStatus').textContent = '';
  }
  // 更新仓库列表选中高亮
  renderRepoList(_currentRepos);
  // 获取仓库准确信息并加载文件树
  refreshRepoInfo();
}

/** 获取仓库准确信息、更新容量进度条并加载文件树 */
async function refreshRepoInfo() {
  if (!_selectedRepo || !_currentToken) return;
  const infoDiv = _overlay.querySelector('#ghRepoInfo');
  const capacityBar = _overlay.querySelector('#ghCapacityBar');
  const capacityText = _overlay.querySelector('#ghCapacityText');
  const fileTree = _overlay.querySelector('#ghFileTree');
  const fileTreeCount = _overlay.querySelector('#ghFileTreeCount');

  if (!infoDiv) return;
  infoDiv.innerHTML = '正在获取仓库信息…';
  capacityBar.style.width = '0%';
  capacityText.textContent = '— / 1 GB';
  fileTree.innerHTML = '<div style="color:var(--text-secondary);font-size:12px;padding:6px 4px;">正在加载文件树…</div>';
  fileTreeCount.textContent = '';

  try {
    const parts = _selectedRepo.full_name.split('/');
    const res = await window.api.githubGetRepoInfo(
      _currentToken, parts[0], parts[1], _selectedRepo.default_branch || 'main'
    );

    if (res.success) {
      const sizeStr = _formatSize(res.size);
      const pct = Math.min(100, (res.size / 1073741824) * 100);
      infoDiv.innerHTML = '📁 ' + res.fileCount + ' 个文件 · ' + sizeStr + ' · ⏱ ' + _formatTime(res.pushedAt);
      capacityBar.style.width = pct.toFixed(2) + '%';
      capacityText.textContent = sizeStr + ' / 1 GB';

      // 渲染分类列表（项目 / 快速笔记 / 日记）
      if (res.tree && res.tree.length > 0) {
        fileTree.innerHTML = '';
        fileTreeCount.textContent = res.fileCount + ' 个文件';
        renderCategoryTree(res.tree, fileTree);
      } else {
        fileTree.innerHTML = '<div style="color:var(--text-secondary);font-size:12px;padding:6px 4px;">空仓库（没有文件）</div>';
        fileTreeCount.textContent = '0 个文件';
      }
    } else {
      infoDiv.innerHTML = '<span style="color:#ff8080;">⚠️ 获取失败: ' + res.error + '</span>';
      fileTree.innerHTML = '<div style="color:#ff8080;font-size:12px;padding:6px 4px;">⚠️ ' + res.error + '</div>';
    }
  } catch (e) {
    infoDiv.innerHTML = '<span style="color:#ff8080;">⚠️ 错误: ' + e.message + '</span>';
    fileTree.innerHTML = '<div style="color:#ff8080;font-size:12px;padding:6px 4px;">⚠️ ' + e.message + '</div>';
  }
}

/** 按项目 / 快速笔记 / 日记三栏分类渲染 */
function renderCategoryTree(treeItems, container) {
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

/** 应用内部确认弹窗（替代原生 confirm），返回 Promise<boolean> */
function showInternalConfirm({ title, message, confirmText, danger }) {
  return new Promise((resolve) => {
    const existing = document.getElementById('ghConfirmPanel');
    if (existing) existing.remove();

    const panel = document.createElement('div');
    panel.id = 'ghConfirmPanel';
    panel.style.cssText = 'position:absolute;inset:0;background:var(--modal-overlay);backdrop-filter:blur(8px);z-index:40;display:flex;align-items:center;justify-content:center;';

    const content = document.createElement('div');
    content.style.cssText = 'width:360px;max-width:90vw;background:var(--panel-bg);border:1px solid var(--panel-border);border-radius:var(--panel-radius);box-shadow:var(--panel-shadow);padding:20px;';

    const titleColor = danger ? '#ff9090' : 'var(--text-primary)';
    const okBg = danger ? '#8b2c2c' : 'var(--accent)';
    const okBorder = danger ? 'rgba(255,128,128,0.3)' : 'transparent';
    const okColor = danger ? '#ffe0e0' : '#06121a';

    content.innerHTML =
      '<div id="ghConfirmTitle" style="color:' + titleColor + ';font-size:15px;font-weight:600;margin-bottom:12px;"></div>' +
      '<div id="ghConfirmMsg" style="color:var(--text-secondary);font-size:13px;line-height:1.6;margin-bottom:16px;white-space:pre-wrap;"></div>' +
      '<div style="display:flex;gap:8px;">' +
        '<button id="ghConfirmCancel" style="flex:1;padding:8px;background:var(--btn-bg);border:1px solid var(--panel-border);border-radius:6px;color:var(--text-primary);font-size:13px;cursor:pointer;">取消</button>' +
        '<button id="ghConfirmOk" style="flex:1;padding:8px;background:' + okBg + ';border:1px solid ' + okBorder + ';border-radius:6px;color:' + okColor + ';font-size:13px;cursor:pointer;">' + (confirmText || '确认') + '</button>' +
      '</div>';

    panel.appendChild(content);
    _overlay.appendChild(panel);

    content.querySelector('#ghConfirmTitle').textContent = title;
    content.querySelector('#ghConfirmMsg').textContent = message;

    const okBtn = content.querySelector('#ghConfirmOk');
    const cancelBtn = content.querySelector('#ghConfirmCancel');
    const done = (val) => { panel.remove(); resolve(val); };

    okBtn.onclick = () => done(true);
    cancelBtn.onclick = () => done(false);
    panel.addEventListener('click', (e) => { if (e.target === panel) done(false); });
    okBtn.focus();
  });
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
async function refreshLocalData(categories) {
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

/** 上传数据到云端 */
async function handleUpload() {
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
async function handleDownload() {
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

/** 新建仓库（面板内联输入框） */
function handleCreateRepo() {
  const repoList = _overlay.querySelector('#ghRepoList');
  if (!repoList) return;

  // 在列表顶部插入输入框
  const createDiv = document.createElement('div');
  createDiv.style.cssText = 'padding:10px;border:1px solid var(--panel-border);border-radius:6px;margin-bottom:8px;background:var(--btn-bg);';
  createDiv.innerHTML = `
    <div style="color:var(--text-secondary);font-size:12px;margin-bottom:6px;">新仓库名称（默认私有）：</div>
    <input type="text" id="ghNewRepoName" placeholder="AstroKnot-Data" value="AstroKnot-Data"
      style="width:100%;box-sizing:border-box;padding:6px 8px;background:var(--input-bg);border:1px solid var(--input-border);border-radius:4px;color:var(--text-primary);font-size:12px;outline:none;margin-bottom:8px;">
    <div style="display:flex;gap:6px;">
      <button id="ghNewRepoConfirm" style="flex:1;padding:6px;background:var(--btn-bg);border:1px solid var(--panel-border);border-radius:4px;color:var(--text-primary);font-size:12px;cursor:pointer;">创建仓库</button>
      <button id="ghNewRepoCancel" style="padding:6px 12px;background:var(--btn-bg);border:1px solid var(--panel-border);border-radius:4px;color:var(--text-secondary);font-size:12px;cursor:pointer;">取消</button>
    </div>
  `;
  repoList.insertBefore(createDiv, repoList.firstChild);

  const input = createDiv.querySelector('#ghNewRepoName');
  input.focus();
  input.select();

  const cleanup = () => createDiv.remove();

  createDiv.querySelector('#ghNewRepoCancel').addEventListener('click', cleanup);

  const doCreate = async () => {
    const repoName = input.value.trim();
    if (!repoName) return;

    cleanup();
    repoList.innerHTML = '<div style="color:var(--text-secondary);font-size:12px;padding:8px;">正在创建仓库…</div>';

    try {
      const res = await window.api.githubCreateRepo(_currentToken, {
        name: repoName,
        description: 'AstroKnot 知识库数据同步',
        private: true,
      });

      if (!res.success) {
        repoList.innerHTML = '<div style="color:#ff8080;font-size:12px;padding:10px;">创建失败：' + res.error + '</div>';
        return;
      }
      // 将新仓库加入列表并选中
      _currentRepos.unshift(res.repo);
      selectRepo(res.repo);
    } catch (e) {
      repoList.innerHTML = '<div style="color:#ff8080;font-size:12px;padding:10px;">创建失败：' + e.message + '</div>';
    }
  };

  createDiv.querySelector('#ghNewRepoConfirm').addEventListener('click', doCreate);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); doCreate(); }
    if (e.key === 'Escape') cleanup();
  });
}

/** 退出登录（保留 Token，下次可快速登录） */
async function logout() {
  _currentToken = null;
  await showLoginSection();
}

/** 绑定面板事件 */
function bindPanelEvents() {
  // 关闭按钮
  _overlay.querySelector('.gh-close-btn').addEventListener('click', () => {
    _overlay.style.display = 'none';
  });
  // 隐藏仓库管理
  _overlay.querySelector('#ghHiddenReposBtn').addEventListener('click', showHiddenReposPanel);
  // 移动端扫码同步
  _overlay.querySelector('#ghMobileSyncBtn').addEventListener('click', () => openMobileSyncDialog(_overlay));
  // 点击遮罩关闭
  _overlay.addEventListener('click', (e) => {
    if (e.target === _overlay) _overlay.style.display = 'none';
  });
  // 打开 Token 设置页
  _overlay.querySelector('#ghTokenLink').addEventListener('click', (e) => {
    e.preventDefault();
    window.api.openExternalUrl('https://github.com/settings/tokens');
  });
  // 验证并登录
  _overlay.querySelector('#ghLoginConfirmBtn').addEventListener('click', handleLogin);
  // 回车提交
  _overlay.querySelector('#ghTokenInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLogin();
  });
  // 快速登录（使用已存 Token）
  _overlay.querySelector('#ghQuickLoginBtn').addEventListener('click', handleQuickLogin);
  // 清除已存 Token
  _overlay.querySelector('#ghClearTokenLink').addEventListener('click', handleClearToken);
  // 退出登录
  _overlay.querySelector('#ghLogoutBtn').addEventListener('click', logout);
  // 新建仓库
  _overlay.querySelector('#ghCreateRepoBtn').addEventListener('click', handleCreateRepo);
  // 上传数据
  _overlay.querySelector('#ghUploadBtn').addEventListener('click', handleUpload);
  // 从云端恢复
  _overlay.querySelector('#ghDownloadBtn').addEventListener('click', handleDownload);
}

/** 快速登录（使用已存 Token） */
async function handleQuickLogin() {
  const btn = _overlay.querySelector('#ghQuickLoginBtn');
  const status = _overlay.querySelector('#ghLoginStatus');
  btn.disabled = true;
  btn.textContent = '正在登录…';
  status.textContent = '';
  try {
    const loaded = await window.api.githubLoadToken();
    if (loaded.success && loaded.token) {
      const verified = await window.api.githubVerifyToken(loaded.token);
      if (verified.success) {
        _currentToken = loaded.token;
        await showRepoSection(verified.user);
        return;
      }
      status.textContent = '⚠️ 已存 Token 已失效，请在下方重新输入';
      status.style.color = '#ff9090';
    } else {
      status.textContent = '⚠️ 未找到已存 Token，请在下方输入';
      status.style.color = '#ff9090';
    }
  } catch (e) {
    status.textContent = '⚠️ ' + e.message;
    status.style.color = '#ff9090';
  } finally {
    btn.disabled = false;
    btn.textContent = '🔄 使用已存账号快速登录';
  }
}

/** 清除已存 Token */
async function handleClearToken() {
  await window.api.githubClearToken();
  _overlay.querySelector('#ghQuickLoginBtn').style.display = 'none';
  _overlay.querySelector('#ghClearTokenLink').style.display = 'none';
  const status = _overlay.querySelector('#ghLoginStatus');
  status.textContent = '已清除 Token，请在上方重新输入';
  status.style.color = 'var(--text-secondary)';
}

/** 处理登录 */
async function handleLogin() {
  const input = _overlay.querySelector('#ghTokenInput');
  const status = _overlay.querySelector('#ghLoginStatus');
  const btn = _overlay.querySelector('#ghLoginConfirmBtn');
  const token = input.value.trim();

  if (!token) {
    status.textContent = '请输入 Token';
    status.style.color = '#ff8080';
    return;
  }

  btn.disabled = true;
  btn.textContent = '验证中…';
  status.textContent = '';

  try {
    const res = await window.api.githubVerifyToken(token);
    if (!res.success) {
      status.textContent = '验证失败：' + res.error + '（请检查 Token 是否正确）';
      status.style.color = '#ff8080';
      btn.disabled = false;
      btn.textContent = '验证并登录';
      return;
    }
    // 保存 Token
    const saved = await window.api.githubSaveToken(token);
    if (!saved.success) {
      status.textContent = 'Token 验证成功，但存储失败：' + saved.error;
      status.style.color = '#ffaa80';
    }
    _currentToken = token;
    await showRepoSection(res.user);
  } catch (e) {
    status.textContent = '网络错误：' + e.message;
    status.style.color = '#ff8080';
  } finally {
    btn.disabled = false;
    btn.textContent = '验证并登录';
  }
}

/** 创建弹窗 DOM */
function createPanel() {
  const overlay = document.createElement('div');
  overlay.id = 'githubSyncOverlay';
  overlay.className = 'rich-modal-overlay';
  overlay.style.cssText = 'display:none;position:fixed;top:0;left:0;width:100vw;height:100vh;background:var(--modal-overlay);backdrop-filter:blur(12px);z-index:100000;align-items:center;justify-content:center;';

  overlay.innerHTML = `
    <div class="rich-modal-content" style="width:820px;max-width:94vw;height:80vh;min-height:420px;display:flex;flex-direction:column;overflow:hidden;">
      <div style="display:flex;align-items:center;padding:12px 16px;border-bottom:1px solid var(--divider);flex-shrink:0;">
        <span style="color:var(--text-primary);font-size:15px;font-weight:600;flex:1;display:flex;align-items:center;gap:7px;">
          <span style="color:var(--accent);display:flex;"><svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true" style="display:block;"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg></span>
          GitHub 云同步
        </span>
        <button id="ghMobileSyncBtn" title="移动端同步：扫码把项目传到手机" style="background:none;border:none;color:var(--text-secondary);font-size:14px;cursor:pointer;padding:4px 8px;">📱</button>
        <button id="ghHiddenReposBtn" title="隐藏仓库管理" style="background:none;border:none;color:var(--text-secondary);font-size:14px;cursor:pointer;padding:4px 8px;">🙈</button>
        <button class="caption-btn close gh-close-btn" title="关闭" style="background:none;border:none;color:var(--text-secondary);font-size:16px;cursor:pointer;padding:4px 8px;">✕</button>
      </div>

      <!-- 加载中提示 -->
      <div id="ghLoadingHint" style="display:none;flex:1;align-items:center;justify-content:center;color:var(--text-secondary);font-size:13px;"></div>

      <!-- 登录区 -->
      <div id="ghLoginSection" style="display:none;flex:1;overflow-y:auto;padding:24px 32px;">
        <div style="max-width:380px;margin:0 auto;">
          <div style="color:var(--text-secondary);font-size:13px;line-height:1.7;margin-bottom:12px;">
            输入 GitHub Personal Access Token 登录<br>
            获取地址：<a href="#" id="ghTokenLink" style="color:var(--accent);">https://github.com/settings/tokens</a><br>
            <br>
            操作步骤：<br>
            ① 在 "Create new token" 下拉选项框中选择
               <code style="background:var(--btn-hover);padding:1px 4px;border-radius:3px;">Create new token (classic)</code><br>
            ② 在权限勾选区域勾选以下权限：<br>
            &nbsp;&nbsp;· <code style="background:var(--btn-hover);padding:1px 4px;border-radius:3px;">repo</code> — 仓库读写（同步数据到你的仓库）<br>
            &nbsp;&nbsp;· <code style="background:var(--btn-hover);padding:1px 4px;border-radius:3px;">delete_repo</code> — 删除仓库（仅用于在应用内删除仓库时）<br>
            &nbsp;&nbsp;· <code style="background:var(--btn-hover);padding:1px 4px;border-radius:3px;">user</code> — 读取账号信息（显示头像与用户名）<br>
            ③ 点击底部绿色按钮 <code style="background:var(--btn-hover);padding:1px 4px;border-radius:3px;">Generate token</code> 生成并复制粘贴到上方输入框
          </div>
          <input type="password" id="ghTokenInput" placeholder="ghp_xxxxxxxxxxxx"
            style="width:100%;box-sizing:border-box;padding:8px 10px;background:var(--input-bg);border:1px solid var(--input-border);border-radius:6px;color:var(--text-primary);font-size:13px;outline:none;">
          <button id="ghQuickLoginBtn" style="display:none;width:100%;margin-top:12px;padding:9px;background:var(--btn-bg);border:1px solid rgba(74,255,128,0.3);border-radius:6px;color:var(--text-primary);font-size:13px;cursor:pointer;">
            🔄 使用已存账号快速登录
          </button>
          <button id="ghLoginConfirmBtn"
            style="width:100%;margin-top:8px;padding:9px;background:var(--btn-bg);border:1px solid var(--panel-border);border-radius:6px;color:var(--text-primary);font-size:13px;cursor:pointer;transition:background 0.15s;"
            onmouseenter="this.style.background='var(--btn-hover)'" onmouseleave="this.style.background='var(--btn-bg)'">
            验证并登录
          </button>
          <div id="ghLoginStatus" style="margin-top:8px;font-size:12px;min-height:16px;"></div>
          <a id="ghClearTokenLink" style="display:none;margin-top:6px;font-size:11px;color:#ff8080;cursor:pointer;text-decoration:underline;">🗑️ 清除已存 Token</a>
        </div>
      </div>

      <!-- 仓库选择区（左右分栏） -->
      <div id="ghRepoSection" style="display:none;flex:1;overflow:hidden;">
        <!-- 左侧：仓库列表 -->
        <div style="width:260px;flex-shrink:0;border-right:1px solid var(--divider);display:flex;flex-direction:column;overflow:hidden;background:var(--btn-bg);">
          <div style="display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--divider);">
            <img id="ghUserAvatar" style="width:28px;height:28px;border-radius:50%;background:var(--btn-bg);flex-shrink:0;" alt="">
            <div style="flex:1;min-width:0;">
              <div id="ghUserName" style="color:var(--text-primary);font-weight:600;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></div>
              <div style="color:#5a8a5a;font-size:10px;">✅ 已登录</div>
            </div>
            <button id="ghLogoutBtn" title="退出登录" style="padding:3px 7px;font-size:10px;background:rgba(255,128,128,0.12);border:1px solid rgba(255,128,128,0.25);border-radius:4px;color:#ff9090;cursor:pointer;">退出</button>
          </div>
          <div style="display:flex;align-items:center;padding:8px 12px;border-bottom:1px solid var(--divider);">
            <span style="color:var(--text-secondary);font-size:12px;flex:1;">仓库列表</span>
            <button id="ghCreateRepoBtn" title="新建仓库" style="padding:3px 8px;font-size:10px;background:var(--btn-hover);border:1px solid var(--panel-border);border-radius:4px;color:var(--accent);cursor:pointer;">➕ 新建</button>
          </div>
          <div id="ghRepoList" style="flex:1;overflow-y:auto;padding:6px;"></div>
        </div>

        <!-- 右侧：文件树 -->
        <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0;">
          <div style="display:flex;align-items:center;padding:8px 14px;border-bottom:1px solid var(--divider);flex-shrink:0;">
            <span style="color:var(--text-secondary);font-size:12px;flex:1;">📁 文件树</span>
            <span id="ghFileTreeCount" style="color:var(--text-secondary);font-size:10px;"></span>
          </div>
          <div id="ghFileTree" style="flex:1;overflow-y:auto;padding:6px 10px;"></div>
        </div>
      </div>

      <!-- 底部：同步区域（选中仓库后显示） -->
      <div id="ghSyncSection" style="display:none;border-top:1px solid var(--divider);padding:10px 16px;flex-shrink:0;background:var(--btn-bg);">
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:8px;">
          <div style="flex:1;min-width:0;">
            <div style="color:var(--text-secondary);font-size:12px;">
              已选择：<span id="ghSelectedRepo" style="color:var(--accent);font-weight:600;"></span>
            </div>
            <div id="ghRepoInfo" style="font-size:11px;color:var(--text-secondary);margin-top:2px;">
              <span id="ghRepoInfoLoading">正在获取仓库信息…</span>
            </div>
          </div>
          <button id="ghDownloadBtn" title="从云端下载数据覆盖本地" style="padding:8px 14px;background:var(--btn-bg);border:1px solid var(--panel-border);border-radius:6px;color:var(--text-primary);font-size:12px;cursor:pointer;flex-shrink:0;">⬇️ 从云端恢复</button>
          <button id="ghUploadBtn" style="padding:8px 16px;background:var(--btn-bg);border:1px solid rgba(74,255,128,0.3);border-radius:6px;color:var(--text-primary);font-size:12px;cursor:pointer;flex-shrink:0;">⬆️ 上传数据到云端</button>
        </div>
        <!-- 容量进度条（GitHub 推荐 < 1GB） -->
        <div>
          <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-secondary);margin-bottom:3px;">
            <span>仓库容量</span>
            <span id="ghCapacityText">— / 1 GB</span>
          </div>
          <div style="background:var(--input-bg);border-radius:4px;height:7px;overflow:hidden;">
            <div id="ghCapacityBar" style="background:linear-gradient(90deg,var(--accent),#4aff80);height:100%;width:0%;transition:width 0.3s;"></div>
          </div>
        </div>
        <div id="ghSyncProgress" style="display:none;margin-top:8px;">
          <div style="background:var(--input-bg);border-radius:4px;height:6px;overflow:hidden;margin-bottom:4px;">
            <div id="ghSyncBar" style="background:var(--accent);height:100%;width:0%;transition:width 0.2s;"></div>
          </div>
          <div id="ghSyncStatus" style="color:var(--text-secondary);font-size:11px;"></div>
        </div>
      </div>
    </div>
  `;

  return overlay;
}
