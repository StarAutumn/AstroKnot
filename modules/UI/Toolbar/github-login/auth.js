// ============================================================
//  UI/Toolbar/github-login/auth.js — 登录态与面板创建/事件绑定
// ============================================================
//  （原 github-login.js 拆分为文件夹版本）
//  - initGitHubLogin：对外唯一 API（由本文件夹 index.js re-export）
//  - setGithubLoginBtnLoggedIn/LoggedOut：AstroKnot 菜单底部按钮状态
//  - handleQuickLogin/handleClearToken/handleLogin/logout：Token 登录流程
//  - handleCreateRepo：面板内新建仓库
//  - createPanel：创建弹窗 DOM；bindPanelEvents：绑定面板事件
// ============================================================
import { openGitHubSyncPanel, showLoginSection, showRepoSection, selectRepo } from './panel.js';
import { _overlay, _currentToken, setCurrentToken, _currentRepos, GITHUB_ICON_SVG } from './share.js';
import { showHiddenReposPanel } from './dialogs.js';
import { handleUpload, handleDownload } from './transfer.js';
import { openMobileSyncDialog } from '../mobile-sync.js';

/** 更新 AstroKnot 菜单底部按钮：已登录时显示 GitHub 账号头像 */
export function setGithubLoginBtnLoggedIn(user) {
  const btn = document.getElementById('githubLoginBtn');
  if (!btn) return;
  btn.innerHTML = '<img src="' + user.avatar + '" alt="" style="width:22px;height:22px;border-radius:50%;object-fit:cover;display:block;pointer-events:none;">';
  btn.title = (user.name ? user.name + ' (@' + user.login + ')' : '@' + user.login) + ' · 点击打开 GitHub 云同步';
}

/** 更新 AstroKnot 菜单底部按钮：未登录时显示 GitHub 图标 */
export function setGithubLoginBtnLoggedOut() {
  const btn = document.getElementById('githubLoginBtn');
  if (!btn) return;
  btn.innerHTML = GITHUB_ICON_SVG;
  btn.title = '登录到 GitHub';
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
  setCurrentToken(null);
  await showLoginSection();
}

/** 绑定面板事件 */
export function bindPanelEvents() {
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
        setCurrentToken(loaded.token);
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
    setCurrentToken(token);
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
export function createPanel() {
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
        <button id="ghMobileSyncBtn" title="移动端同步：用配对码把项目传到手机/平板" style="background:none;border:none;color:var(--text-secondary);font-size:14px;cursor:pointer;padding:4px 8px;">📱</button>
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
