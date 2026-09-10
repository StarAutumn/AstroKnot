// ============================================================
//  UI/Toolbar/mobile-sync.js — 移动端局域网同步弹窗
//
//  在 GitHub 云同步弹窗标题栏点击「📱」触发：
//  启动本地 HTTP 服务 → 展示 astroknot://sync 深链二维码
//  → 手机系统相机扫码唤起 AstroKnot App → 局域网直传项目数据
// ============================================================

let _dialog = null;

/** 打开移动端同步弹窗（在 GitHub 同步弹窗 _overlay 之上展示） */
export async function openMobileSyncDialog(ghOverlay) {
  if (!_dialog) {
    _dialog = createDialog();
    document.body.appendChild(_dialog);
    bindDialogEvents();
  }
  _dialog.style.display = 'flex';
  _dialog._ghOverlay = ghOverlay || null;

  // 重置状态
  const qrBox = _dialog.querySelector('#msQrBox');
  const status = _dialog.querySelector('#msStatus');
  qrBox.innerHTML = '<div class="ms-loading">正在启动同步服务…</div>';
  status.textContent = '';

  const res = await window.api.mobileSyncStart();
  if (!res.success) {
    qrBox.innerHTML = '<div class="ms-error">启动失败：' + escapeHtml(res.error || '未知错误') + '</div>';
    return;
  }

  // 展示二维码
  qrBox.innerHTML = '';
  if (res.qrDataUrl) {
    const img = document.createElement('img');
    img.src = res.qrDataUrl;
    img.alt = '同步二维码';
    qrBox.appendChild(img);
  } else {
    qrBox.innerHTML = '<div class="ms-error">二维码生成失败（缺少 qrcode 模块），<br>请手动在 App 中输入下方地址</div>';
  }

  _dialog.querySelector('#msUrl').textContent = res.deepLink;
  status.textContent = '服务已就绪 · ' + res.expiresInMin + ' 分钟无活动自动关闭';
}

/** 关闭弹窗并停止服务 */
function closeDialog() {
  if (!_dialog) return;
  _dialog.style.display = 'none';
  window.api.mobileSyncStop();
}

/** 供外部（应用退出等）停止服务 */
export function closeMobileSyncDialog() {
  closeDialog();
}

function createDialog() {
  const overlay = document.createElement('div');
  overlay.id = 'mobileSyncOverlay';
  overlay.style.cssText = 'display:none;position:fixed;inset:0;background:var(--modal-overlay);backdrop-filter:blur(12px);z-index:100100;align-items:center;justify-content:center;';

  overlay.innerHTML = `
    <style>
      #mobileSyncOverlay .ms-qr-box{width:300px;height:300px;margin:0 auto;background:#fff;border-radius:10px;display:flex;align-items:center;justify-content:center;overflow:hidden;}
      #mobileSyncOverlay .ms-qr-box img{width:100%;height:100%;display:block;}
      #mobileSyncOverlay .ms-loading{color:#8a93a8;font-size:13px;}
      #mobileSyncOverlay .ms-error{color:#ff8080;font-size:12px;padding:12px;line-height:1.7;}
    </style>
    <div class="rich-modal-content" style="width:420px;max-width:92vw;background:var(--panel-bg);border:1px solid var(--panel-border);border-radius:var(--panel-radius);box-shadow:var(--panel-shadow);overflow:hidden;">
      <div style="display:flex;align-items:center;padding:12px 16px;border-bottom:1px solid var(--divider);">
        <span style="color:var(--text-primary);font-size:15px;font-weight:600;flex:1;display:flex;align-items:center;gap:7px;">
          <span style="font-size:16px;">📱</span> 移动端同步
        </span>
        <button id="msClose" title="关闭并停止服务" style="background:none;border:none;color:var(--text-secondary);font-size:16px;cursor:pointer;padding:4px 8px;">✕</button>
      </div>

      <div style="padding:20px 24px;text-align:center;">
        <div style="color:var(--text-secondary);font-size:12px;line-height:1.7;margin-bottom:14px;">
          确保手机与电脑在<b style="color:var(--text-primary);">同一 Wi-Fi / 局域网</b>，<br>
          用手机<b style="color:var(--text-primary);">系统相机</b>扫描二维码，会自动打开 AstroKnot App 同步项目
        </div>
        <div id="msQrBox" class="ms-qr-box">
          <div class="ms-loading">正在启动同步服务…</div>
        </div>
        <div id="msUrl" style="margin-top:10px;padding:7px 10px;background:var(--input-bg);border:1px solid var(--input-border);border-radius:6px;color:var(--text-secondary);font-size:11px;font-family:monospace;word-break:break-all;user-select:text;"></div>
        <div id="msStatus" style="margin-top:8px;color:#5a8a5a;font-size:12px;min-height:16px;"></div>
        <div style="margin-top:12px;color:var(--text-secondary);font-size:11px;line-height:1.6;">
          · 数据仅在你的局域网内传输，不经过第三方服务器<br>
          · 配对码为一次性随机码，关闭弹窗即停止服务<br>
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
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
