// ============================================================
//  UI/Toolbar/mobile-sync.js — 移动端局域网同步弹窗（配对码模式）
//
//  在 GitHub 云同步弹窗标题栏点击「📱」触发：
//  桌面端设置持久配对码 → 服务常驻监听 → 平板/手机在同一局域网
//  输入地址 + 配对码配对 → 局域网直传项目数据
//  平板（window.__TABLET__）走 window.__DeskSync 平板弹窗（输入配对码端）
// ============================================================

let _dialog = null;

/** 打开移动端同步弹窗（在 GitHub 同步弹窗 _overlay 之上展示） */
export async function openMobileSyncDialog(ghOverlay) {
  // 平板：作为「输入配对码」消费端，走平板专属弹窗
  if (window.__TABLET__ && window.__DeskSync && window.__DeskSync.openDialog) {
    window.__DeskSync.openDialog(ghOverlay);
    return;
  }
  if (!_dialog) {
    _dialog = createDialog();
    document.body.appendChild(_dialog);
    bindDialogEvents();
  }
  _dialog.style.display = 'flex';
  _dialog._ghOverlay = ghOverlay || null;
  await renderState();
}

/** 按当前配置渲染展示态 / 设置态 */
async function renderState() {
  const box = _dialog.querySelector('#msBody');
  const status = _dialog.querySelector('#msStatus');
  status.textContent = '';
  let cfg;
  try {
    cfg = await window.api.mobileSyncGetConfig();
  } catch (e) {
    box.innerHTML = '<div class="ms-error">读取配置失败：' + escapeHtml(e.message || String(e)) + '</div>';
    return;
  }

  if (cfg.pairCode) {
    // ── 展示态：已设置配对码 ──
    box.innerHTML = `
      <div style="color:var(--text-secondary);font-size:12px;line-height:1.7;margin-bottom:14px;">
        平板 / 手机与电脑在<b style="color:var(--text-primary);">同一 Wi-Fi / 局域网</b>时，
        打开 AstroKnot →「从电脑同步」→<br>输入下方<b style="color:var(--text-primary);">地址</b>和<b style="color:var(--text-primary);">配对码</b>即可同步项目
      </div>
      <div style="display:flex;align-items:center;gap:10px;justify-content:center;margin-bottom:10px;">
        <span style="color:var(--text-secondary);font-size:12px;">配对码</span>
        <span id="msCode" style="padding:8px 18px;background:var(--input-bg);border:1px solid var(--input-border);border-radius:8px;color:var(--text-primary);font-size:20px;font-weight:700;letter-spacing:3px;font-family:monospace;user-select:text;"></span>
      </div>
      <div style="margin-bottom:14px;">
        <div style="color:var(--text-secondary);font-size:12px;margin-bottom:4px;">连接地址（点击复制）</div>
        <div id="msHost" style="padding:8px 12px;background:var(--input-bg);border:1px solid var(--input-border);border-radius:8px;color:var(--text-primary);font-size:14px;font-family:monospace;cursor:pointer;user-select:text;"></div>
      </div>
      <button id="msResetBtn" style="padding:7px 16px;background:transparent;border:1px solid var(--panel-border);border-radius:6px;color:var(--text-secondary);font-size:12px;cursor:pointer;">重新设置配对码</button>
    `;
    box.querySelector('#msCode').textContent = cfg.pairCode;
    box.querySelector('#msHost').textContent = 'http://' + cfg.host;
    box.querySelector('#msHost').addEventListener('click', () => {
      const host = box.querySelector('#msHost').textContent;
      navigator.clipboard.writeText(host).then(() => {
        status.textContent = '✓ 地址已复制：' + host;
        status.style.color = '#5a8a5a';
      }).catch(() => { /* 剪贴板不可用时用户可手动选择文本 */ });
    });
    box.querySelector('#msResetBtn').addEventListener('click', () => renderSetup(cfg.pairCode));
    status.textContent = cfg.running ? '服务运行中，移动端随时可连接' : '服务未运行（保存配对码后自动启动）';
  } else {
    // ── 设置态：未设置配对码 ──
    renderSetup('');
  }
}

/** 设置态表单（savedCode 非空 = 重新设置场景） */
function renderSetup(savedCode) {
  const box = _dialog.querySelector('#msBody');
  const status = _dialog.querySelector('#msStatus');
  status.textContent = '';
  box.innerHTML = `
    <div style="color:var(--text-secondary);font-size:12px;line-height:1.7;margin-bottom:14px;">
      ${savedCode ? '正在重新设置配对码，设置后移动端需输入新配对码重新配对。' : '首次使用请设置一个配对码（持久保存，可随时修改）。<br>移动端输入此配对码即可与本电脑配对。'}
    </div>
    <input id="msCodeInput" type="text" maxlength="16" placeholder="配对码（4~16 位，如 2026 或 my-code）"
      style="width:240px;padding:9px 12px;background:var(--input-bg);border:1px solid var(--input-border);border-radius:8px;color:var(--text-primary);font-size:16px;text-align:center;letter-spacing:2px;outline:none;">
    <div style="margin-top:14px;">
      <button id="msSaveBtn" style="padding:9px 24px;background:var(--accent, #2a6e8a);border:none;border-radius:8px;color:#fff;font-size:13px;cursor:pointer;">保存并启动服务</button>
      ${savedCode ? '<button id="msCancelBtn" style="margin-left:10px;padding:9px 16px;background:transparent;border:1px solid var(--panel-border);border-radius:8px;color:var(--text-secondary);font-size:13px;cursor:pointer;">取消</button>' : ''}
    </div>
  `;
  const input = box.querySelector('#msCodeInput');
  input.focus();
  box.querySelector('#msSaveBtn').addEventListener('click', async () => {
    const code = input.value.trim();
    if (!code) {
      status.textContent = '请输入配对码';
      status.style.color = '#ff8080';
      return;
    }
    status.style.color = '';
    status.textContent = '保存中…';
    try {
      const res = await window.api.mobileSyncSetConfig(code);
      if (!res.success) {
        status.textContent = res.error || '设置失败';
        status.style.color = '#ff8080';
        return;
      }
      await renderState();
      const st = _dialog.querySelector('#msStatus');
      st.textContent = '✓ 配对码已保存，移动端输入此配对码即可连接';
      st.style.color = '#5a8a5a';
    } catch (e) {
      status.textContent = e.message || String(e);
      status.style.color = '#ff8080';
    }
  });
  const cancel = box.querySelector('#msCancelBtn');
  if (cancel) cancel.addEventListener('click', () => renderState());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') box.querySelector('#msSaveBtn').click();
  });
}

/** 关闭弹窗（服务常驻，不随弹窗停止） */
function closeDialog() {
  if (!_dialog) return;
  _dialog.style.display = 'none';
}

/** 供外部（应用退出等）收起弹窗 */
export function closeMobileSyncDialog() {
  closeDialog();
}

function createDialog() {
  const overlay = document.createElement('div');
  overlay.id = 'mobileSyncOverlay';
  overlay.style.cssText = 'display:none;position:fixed;inset:0;background:var(--modal-overlay);backdrop-filter:blur(12px);z-index:100100;align-items:center;justify-content:center;';

  overlay.innerHTML = `
    <style>
      #mobileSyncOverlay .ms-error{color:#ff8080;font-size:12px;padding:12px;line-height:1.7;}
    </style>
    <div class="rich-modal-content" style="width:420px;max-width:92vw;background:var(--panel-bg);border:1px solid var(--panel-border);border-radius:var(--panel-radius);box-shadow:var(--panel-shadow);overflow:hidden;">
      <div style="display:flex;align-items:center;padding:12px 16px;border-bottom:1px solid var(--divider);">
        <span style="color:var(--text-primary);font-size:15px;font-weight:600;flex:1;display:flex;align-items:center;gap:7px;">
          <span style="font-size:16px;">📱</span> 移动端同步
        </span>
        <button id="msClose" title="关闭" style="background:none;border:none;color:var(--text-secondary);font-size:16px;cursor:pointer;padding:4px 8px;">✕</button>
      </div>

      <div style="padding:20px 24px;text-align:center;">
        <div id="msBody"></div>
        <div id="msStatus" style="margin-top:12px;color:#5a8a5a;font-size:12px;min-height:16px;"></div>
        <div style="margin-top:12px;color:var(--text-secondary);font-size:11px;line-height:1.6;">
          · 数据仅在你的局域网内传输，不经过第三方服务器<br>
          · 服务常驻运行（应用开启期间），配对码认证<br>
          · 如无法连接，请允许 Windows 防火墙放行 AstroKnot
        </div>
      </div>
    </div>
  `;
  return overlay;
}

function bindDialogEvents() {
  _dialog.querySelector('#msClose').addEventListener('click', closeDialog);
  _dialog.addEventListener('click', (e) => {
    if (e.target === _dialog) closeDialog();
  });
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c;
  });
}
