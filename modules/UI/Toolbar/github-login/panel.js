// ============================================================
//  UI/Toolbar/github-login/panel.js — 同步面板流程（打开/登录区/仓库区/列表）
// ============================================================
//  （原 github-login.js 拆分为文件夹版本）
//  - openGitHubSyncPanel：打开面板（懒创建 DOM + 自动登录检测）
//  - showLoginSection/showRepoSection：登录区与仓库区切换
//  - selectRepo/refreshRepoInfo：选中仓库、拉取仓库信息与文件树
//  - renderRepoList/showRepoContextMenu：仓库列表渲染与右键菜单
// ============================================================
import { createPanel, bindPanelEvents, setGithubLoginBtnLoggedIn, setGithubLoginBtnLoggedOut } from './auth.js';
import { _overlay, setOverlay, _currentToken, setCurrentToken, _selectedRepo, setSelectedRepo, _currentRepos, setCurrentRepos, _formatTime, _formatSize, getHiddenRepos, addHiddenRepo } from './share.js';
import { renderCategoryTree } from './cloud.js';
import { showDeleteConfirmPanel } from './dialogs.js';

/** 打开 GitHub 同步面板 */
export async function openGitHubSyncPanel() {
  if (!_overlay) {
    setOverlay(createPanel());
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
        setCurrentToken(loaded.token);
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
export async function showLoginSection() {
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
export async function showRepoSection(user) {
  // 登录成功：菜单按钮显示账号头像
  setGithubLoginBtnLoggedIn(user);
  _overlay.querySelector('#ghLoadingHint').style.display = 'none';
  _overlay.querySelector('#ghLoginSection').style.display = 'none';
  _overlay.querySelector('#ghRepoSection').style.display = 'flex';
  _overlay.querySelector('#ghSyncSection').style.display = 'none';

  // 重置选中状态
  setSelectedRepo(null);

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
    setCurrentRepos(res.repos);
    renderRepoList(res.repos);
  } catch (e) {
    repoList.innerHTML = '<div style="color:#ff8080;font-size:12px;padding:10px;">加载失败：' + e.message + '</div>';
  }
}

/** 渲染仓库列表（过滤隐藏仓库） */
export function renderRepoList(repos) {
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

/** 选择仓库：显示同步区域，不关闭面板 */
export function selectRepo(repo) {
  setSelectedRepo(repo);
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
export async function refreshRepoInfo() {
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
