// ============================================================
//  UI/Toolbar/settings-popup/tabs/notification.js — 「通知」标签页
// ============================================================
//  - notificationPanelHtml：面板 HTML（开启通知 / 静音模式开关）
//  - bindNotificationTab：通知开关与静音开关绑定
// ============================================================
//  
// ============================================================
import { appState } from '../../../../module0_AppState.js';
import { saveSettingsToStorage } from '../../../Theme.js';

export const notificationPanelHtml = `  <div class="settings-tab-panel" data-panel="notification" style="display:none; padding:8px 16px 14px;">
    <div class="setting-section">
      <div style="display:flex; align-items:center; justify-content:space-between;">
        <span style="font-size:12px;">\uD83D\uDD14 \u5F00\u542F\u901A\u77E5</span>
        <label class="toggle-switch"><input type="checkbox" id="notificationEnableCheck"><span class="toggle-slider"></span></label>
      </div>
      <div style="font-size:10px; color:var(--text-secondary); margin-top:6px; line-height:1.4;">
        \u5F00\u542F\u540E\u5C06\u5728\u5230\u8D44\u65F6\u663E\u793A\u5F39\u7A97\u5E76\u64AD\u653E\u63D0\u793A\u97F3\uFF0C\u901A\u77E5\u4E2D\u793A\u4ECD\u6709\u8BB0\u8F66\u3002\u5173\u95ED\u540E\u4E0D\u663E\u793A\u5F39\u7A97\u3001\u4E0D\u64AD\u653E\u97F3\u6548\uFF0C\u4F46\u901A\u77E5\u4E2D\u793A\u8BB0\u8F66\u4E0D\u53D8\u3002
      </div>
    </div>
    <div id="notificationMuteWrap" class="setting-section" style="margin-top:12px; padding-top:12px; border-top:1px solid var(--divider);">
      <div style="display:flex; align-items:center; justify-content:space-between;">
        <span style="font-size:12px;">\uD83D\uDD07 \u9759\u97F3\u6A21\u5F0F</span>
        <label class="toggle-switch"><input type="checkbox" id="notificationMuteCheck"><span class="toggle-slider"></span></label>
      </div>
      <div style="font-size:10px; color:var(--text-secondary); margin-top:6px; line-height:1.4;">
        \u9759\u97F0\u540E\u4E0D\u64AD\u653E\u63D0\u793A\u97F0\uFF0C\u4F46\u4F1A\u663E\u793A\u5F39\u7A97\u901A\u77E5\u3002
      </div>
    </div>
  </div>`

export function bindNotificationTab(ctx) {
  const { popup } = ctx;

  // 绑定通知开关
  const notificationEnableCheck = popup.querySelector('#notificationEnableCheck');
  const notificationMuteWrap = popup.querySelector('#notificationMuteWrap');
  const notificationMuteCheck = popup.querySelector('#notificationMuteCheck');
  if (notificationEnableCheck) {
    notificationEnableCheck.checked = appState.notificationEnabled !== false;
    if (notificationMuteWrap) {
      notificationMuteWrap.style.display = notificationEnableCheck.checked ? '' : 'none';
    }
    notificationEnableCheck.addEventListener('change', function (e) {
      appState.notificationEnabled = e.target.checked;
      if (notificationMuteWrap) {
        notificationMuteWrap.style.display = e.target.checked ? '' : 'none';
      }
      saveSettingsToStorage();
    });
  }
  // 绑定静音开关
  if (notificationMuteCheck) {
    notificationMuteCheck.checked = appState.notificationMuted === true;
    notificationMuteCheck.addEventListener('change', function (e) {
      appState.notificationMuted = e.target.checked;
      saveSettingsToStorage();
    });
  }
}

