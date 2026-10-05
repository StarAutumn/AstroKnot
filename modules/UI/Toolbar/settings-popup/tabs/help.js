// ============================================================
//  UI/Toolbar/settings-popup/tabs/help.js — 「使用帮助」标签页
// ============================================================
//  - helpPanelHtml：面板 HTML（进入教程按钮 + 帮助内容容器）
//  - bindHelpTab：将 #helpModal 中的帮助内容复制到设置面板
// ============================================================
//  
// ============================================================

export const helpPanelHtml = `  <div class="settings-tab-panel" data-panel="help" style="display:none; padding:8px 16px 14px;">
    <div style="display:flex; justify-content:flex-end; margin-bottom:8px;">
      <button id="guideTriggerBtn" class="help-header-guide-btn" style="background:rgba(0,255,255,0.12); border:1px solid var(--accent); border-radius:6px; color:var(--accent-light); cursor:pointer; font-size:12px; padding:5px 14px; transition:background 0.15s;">\u8FDB\u5165\u6559\u7A0B</button>
    </div>
    <div id="settingsHelpContent" style="color:#c0e0f0; line-height:1.6; font-size:12px;"></div>
  </div>`

  // ── 将 #helpModal 中的帮助内容复制到设置面板中 ──
export function bindHelpTab(ctx) {
  const { popup } = ctx;

  const helpModalBody = document.querySelector('#helpModal .help-modal-body');
  const settingsHelpContent = popup.querySelector('#settingsHelpContent');
  if (helpModalBody && settingsHelpContent) {
    settingsHelpContent.appendChild(helpModalBody.cloneNode(true));
  }
}

