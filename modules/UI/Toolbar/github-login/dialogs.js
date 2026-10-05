// ============================================================
//  UI/Toolbar/github-login/dialogs.js — 二级弹窗（删除确认/隐藏仓库/内部确认）
// ============================================================
//  （原 github-login.js 拆分为文件夹版本）
//  - showDeleteConfirmPanel：删除仓库确认面板（输入仓库名确认）
//  - showHiddenReposPanel：隐藏仓库管理面板
//  - showInternalConfirm：应用内部确认弹窗（替代原生 confirm），返回 Promise<boolean>
// ============================================================
import { _overlay, _currentToken, _selectedRepo, setSelectedRepo, _currentRepos, setCurrentRepos, getHiddenRepos, removeHiddenRepo } from './share.js';
import { renderRepoList } from './panel.js';

/** 删除仓库确认面板（输入仓库名确认） */
export function showDeleteConfirmPanel(repo) {
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
        setCurrentRepos(_currentRepos.filter(r => r.full_name !== repo.full_name));
        removeHiddenRepo(repo.full_name);
        // 若删除的是当前选中仓库，清空右侧与底部同步区
        if (_selectedRepo && _selectedRepo.full_name === repo.full_name) {
          setSelectedRepo(null);
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
export function showHiddenReposPanel() {
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

/** 应用内部确认弹窗（替代原生 confirm），返回 Promise<boolean> */
export function showInternalConfirm({ title, message, confirmText, danger }) {
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
