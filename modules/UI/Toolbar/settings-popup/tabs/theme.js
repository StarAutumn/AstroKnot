// ============================================================
//  UI/Toolbar/settings-popup/tabs/theme.js — 「主题」标签页
// ============================================================
//  - themePanelHtml：面板 HTML（界面模式 / 七彩流光特效 / 电路板底纹）
//  - bindThemeTab：界面模式下拉、任务栏七彩流光、标题栏电路板底纹与焊盘闪烁绑定
// ============================================================
//  
// ============================================================
import { appState } from '../../../../module0_AppState.js';
import { applyUIMode, saveSettingsToStorage } from '../../../Theme.js';

export const themePanelHtml = `  <div class="settings-tab-panel" data-panel="theme" style="display:none; padding:8px 16px 14px;">
  <div style="margin-top: 10px; padding-top: 8px;">
    <div style="font-size:12px; color:var(--text-secondary); margin-bottom:10px;">🎨 界面模式</div>
    <select id="uiModeSelect" style="width:100%; background:transparent; color:var(--accent-light); height:26px; font-size:12px; border:1px solid var(--divider); border-radius:4px; padding:0 6px; cursor:pointer; outline:none;">
      <option value="dark">深色模式</option>
      <option value="light">浅色模式</option>
    </select>
  </div>
  <div id="darkOnlySettings" class="dark-only" style="margin-top: 14px; padding-top: 8px; border-top: 1px solid var(--divider);">
    <div style="display:flex; align-items:center; justify-content:space-between;">
      <span style="font-size:12px; color:var(--text-secondary);">🌈 任务栏 & 标题栏七彩流光特效</span>
      <label class="toggle-switch"><input type="checkbox" id="taskbarRainbowCheck"><span class="toggle-slider"></span></label>
    </div>
  </div>
  <div class="dark-only" style="margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--divider);">
    <div style="display:flex; align-items:center; justify-content:space-between;">
      <span style="font-size:12px; color:var(--text-secondary);">🔌 标题栏电路板底纹</span>
      <label class="toggle-switch"><input type="checkbox" id="headerCircuitCheck"><span class="toggle-slider"></span></label>
    </div>
    <div id="headerCircuitAnimWrap" style="display:none; margin-top:8px; padding-left:16px;">
      <div style="display:flex; align-items:center; justify-content:space-between;">
        <span style="font-size:11px; color:var(--text-secondary);">✨ 焊盘呼吸闪烁</span>
        <label class="toggle-switch"><input type="checkbox" id="headerCircuitAnimCheck"><span class="toggle-slider"></span></label>
      </div>
    </div>
  </div>
  </div>`

export function bindThemeTab(ctx) {
  const { popup } = ctx;

  // 绑定界面模式（深色/浅色）下拉框
  const uiModeSelect = popup.querySelector('#uiModeSelect');
  if (uiModeSelect) {
    uiModeSelect.value = appState.uiMode || 'dark';
    uiModeSelect.addEventListener('change', function (e) {
      appState.uiMode = e.target.value;
      applyUIMode(e.target.value);
      saveSettingsToStorage();
    });
  }

  // 绑定任务栏 & 标题栏七彩流光开关
  const rainbowCheck = popup.querySelector('#taskbarRainbowCheck');
  if (rainbowCheck) {
    rainbowCheck.checked = appState.taskbarRainbow !== false;
    rainbowCheck.addEventListener('change', function (e) {
      appState.taskbarRainbow = e.target.checked;
      document.getElementById('taskbar').classList.toggle('no-rainbow', !e.target.checked);
      const ab = document.getElementById('appTitleBar');
      if (ab) ab.classList.toggle('no-rainbow', !e.target.checked);
      saveSettingsToStorage();
    });
  }

  // 绑定标题栏电路板底纹开关
  const headerCircuitCheck = popup.querySelector('#headerCircuitCheck');
  const headerCircuitAnimWrap = popup.querySelector('#headerCircuitAnimWrap');
  const headerCircuitAnimCheck = popup.querySelector('#headerCircuitAnimCheck');
  if (headerCircuitCheck) {
    headerCircuitCheck.checked = appState.headerCircuit !== false;
    if (headerCircuitAnimWrap) {
      headerCircuitAnimWrap.style.display = headerCircuitCheck.checked ? '' : 'none';
    }
    headerCircuitCheck.addEventListener('change', function (e) {
      appState.headerCircuit = e.target.checked;
      document.body.classList.toggle('no-header-circuit', !e.target.checked);
      if (headerCircuitAnimWrap) {
        headerCircuitAnimWrap.style.display = e.target.checked ? '' : 'none';
      }
      saveSettingsToStorage();
    });
  }
  // 绑定焊盘呼吸闪烁开关
  if (headerCircuitAnimCheck) {
    headerCircuitAnimCheck.checked = appState.headerCircuitAnim !== false;
    headerCircuitAnimCheck.addEventListener('change', function (e) {
      appState.headerCircuitAnim = e.target.checked;
      document.body.classList.toggle('no-header-circuit-anim', !e.target.checked);
      saveSettingsToStorage();
    });
  }
}

