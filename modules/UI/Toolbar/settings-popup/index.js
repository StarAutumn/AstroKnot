// ============================================================
//  UI/Toolbar/settings-popup — 设置弹窗（创建、滑块/开关绑定、拖拽、缩放、标签页切换、保存路径等）
// ============================================================
//  （原 settings-popup.js 拆分为文件夹版本；本文件为主入口，对外导出不变）
//  - share.js        共享层：ctx 上下文（popup/overlay/glowBtn）+ bind2DColorPicker
//  - window-chrome.js  窗口化逻辑：拖拽、打开/关闭与任务栏注册、最大化/还原、边缘缩放
//  - tabs/*.js       每个标签页一个文件：面板 HTML + 控件绑定
//  - index.js        本文件：弹窗创建/生命周期/标签页切换编排 + 对外导出 initSettingsPopup
// ============================================================
//  
// ============================================================
import { appState } from '../../../module0_AppState.js';
import { createSettingsCtx } from './share.js';
import { initSettingsDrag, initOpenClose, initMaximizeResize } from './window-chrome.js';
import { displayPanelHtml, bindDisplayMain, bindDisplaySimple3D, bindDisplayRenderPerf } from './tabs/display.js';
import { editorPanelHtml, bindEditorTab } from './tabs/editor.js';
import { view2dPanelHtml, bind2DViewTab } from './tabs/view2d.js';
import { themePanelHtml, bindThemeTab } from './tabs/theme.js';
import { startupPanelHtml, bindStartupTab } from './tabs/startup.js';
import { notificationPanelHtml, bindNotificationTab } from './tabs/notification.js';
import { savepathPanelHtml, bindSavepathTab } from './tabs/savepath.js';
import { helpPanelHtml, bindHelpTab } from './tabs/help.js';

export function initSettingsPopup(glowBtn) {
    function updateGlowBtnText() {
      glowBtn.textContent = '\u2699\uFE0F';
      glowBtn.title = '\u8BBE\u7F6E';
    }
    appState.updateGlowBtnText = updateGlowBtnText;
    updateGlowBtnText();

    if (!window.__glowPopup) {
      // ── 遮罩层（只用于视觉，不阻挡点击）──
      const overlay = document.createElement('div');
      overlay.id = 'settingsOverlay';
      overlay.style.cssText = `
        display: none;
        position: fixed;
        inset: 0;
        pointer-events: none;
      `;
      document.body.appendChild(overlay);

      const popup = document.createElement('div');
      popup.id = 'settingsPopup';
      popup.className = 'rich-modal';
      popup.innerHTML = `
  <div class="rich-modal-content settings-modal-content" style="width:580px;height:560px;min-width:400px;min-height:360px;">
  <div class="rich-modal-header" style="cursor:default;">
    <h2>\u2699\uFE0F \u8BBE\u7F6E</h2>
    <div class="caption-buttons">
      <button class="caption-btn settings-min-btn" title="\u6700\u5C0F\u5316">
        <svg viewBox="0 0 10 10"><line x1="2" y1="5" x2="8" y2="5"/></svg>
      </button>
      <button class="caption-btn settings-max-btn" title="\u6700\u5927\u5316">
        <svg viewBox="0 0 10 10"><rect x="2" y="2" width="6" height="6" rx="0"/></svg>
      </button>
      <button class="caption-btn close settings-close-btn" title="\u5173\u95ED">
        <svg viewBox="0 0 10 10"><line x1="2" y1="2" x2="8" y2="8"/><line x1="8" y1="2" x2="2" y2="8"/></svg>
      </button>
    </div>
  </div>
  <div class="panel-accent-line"></div>
  <div style="display:flex; flex:1; overflow:hidden; min-height:0;">
  <div class="settings-tabs">
    <div class="settings-tab active" data-tab="display">\uD83D\uDDA5\uFE0F \u663E\u793A</div>
    <div class="settings-tab" data-tab="editor">\uD83D\uDCDD \u7F16\u8F91\u5668</div>
    <div class="settings-tab" data-tab="2dview">\uD83D\uDCCF 2D \u89C6\u56FE</div>
    <div class="settings-tab" data-tab="theme">\uD83C\uDFA8 \u4E3B\u9898</div>
    <div class="settings-tab" data-tab="startup">\uD83D\uDE80 \u542F\u52A8</div>
    <div class="settings-tab" data-tab="notification">\uD83D\uDD14 \u901A\u77E5</div>
    <div class="settings-tab" data-tab="savepath">\uD83D\uDCC2 \u6587\u4EF6\u4F4D\u7F6E</div>
    <div class="settings-tab" data-tab="help">\uD83D\uDCD6 \u4F7F\u7528\u5E2E\u52A9</div>
  </div>
  <div class="settings-body" style="flex:1; overflow-y:auto;">
${displayPanelHtml}
${editorPanelHtml}
${view2dPanelHtml}
${themePanelHtml}
${startupPanelHtml}
${notificationPanelHtml}
${savepathPanelHtml}
${helpPanelHtml}
</div>
</div>
  </div>
`;
      document.body.appendChild(popup);

      const ctx = createSettingsCtx(popup, overlay, glowBtn);

      bindHelpTab(ctx);

      // ── 动态 Z-Index 管理（统一由 WindowManager 管理）──
      if (window.WindowManager) {
        window.WindowManager.registerElement(popup, (zi) => {
          if (overlay) overlay.style.zIndex = zi - 1;
        });
        window.WindowManager.bringToFront(popup);
        if (overlay) overlay.style.zIndex = window.WindowManager._topZIndex - 1;
      }

      bindDisplayMain(ctx);
      initSettingsDrag(ctx);
      bindDisplaySimple3D(ctx);
      bindStartupTab(ctx);
      bindThemeTab(ctx);
      bindNotificationTab(ctx);
      initOpenClose(ctx);
      initMaximizeResize(ctx);

      // ── 标签页切换（左边栏 Windows 风格）──
      document.querySelectorAll('#settingsPopup .settings-tab').forEach(tab => {
        tab.addEventListener('click', function () {
          const tabName = this.dataset.tab;
          // 切换标签高亮
          document.querySelectorAll('#settingsPopup .settings-tab').forEach(t => {
            t.classList.toggle('active', t.dataset.tab === tabName);
          });
          // 切换面板
          document.querySelectorAll('#settingsPopup .settings-tab-panel').forEach(p => {
            p.style.display = p.dataset.panel === tabName ? 'block' : 'none';
          });
        });
      });

      bindSavepathTab(ctx);
      bindDisplayRenderPerf(ctx);
      bindEditorTab(ctx);
      bind2DViewTab(ctx);
    }
}
