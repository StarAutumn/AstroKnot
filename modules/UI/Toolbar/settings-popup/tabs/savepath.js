// ============================================================
//  UI/Toolbar/settings-popup/tabs/savepath.js — 「文件位置」标签页
// ============================================================
//  - savepathPanelHtml：面板 HTML（项目保存位置 / 应急备份间隔 / 快速笔记存放位置）
//  - bindSavepathTab：保存路径浏览/清除、应急备份间隔、快速笔记路径绑定
// ============================================================
//  
// ============================================================
import { appState } from '../../../../module0_AppState.js';
import { saveSettingsToStorage } from '../../../Theme.js';

export const savepathPanelHtml = `  <div class="settings-tab-panel" data-panel="savepath" style="display:none; padding:8px 16px 14px;">
    <div class="setting-section">
      <div class="setting-label">\u9879\u76EE\u4FDD\u5B58\u4F4D\u7F6E</div>
      <div style="font-size:11px; color:var(--text-secondary); margin-bottom:8px; line-height:1.4;">
        \u4FDD\u5B58\u9879\u76EE\u65F6\u5C06\u76F4\u63A5\u4FDD\u5B58\u5230\u6B64\u8DEF\u5F84
      </div>
      <div style="display:flex; gap:8px; align-items:center;">
        <input type="text" id="savePathInput" readonly placeholder="\u672A\u8BBE\u7F6E" 
          style="flex:1; background:var(--input-bg); border:1px solid var(--divider); border-radius:6px; color:var(--accent-light); font-size:12px; padding:6px 10px; outline:none; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
        <button id="browseSavePathBtn" 
          style="padding:6px 14px; background:rgba(0,255,255,0.12); border:1px solid var(--accent); border-radius:6px; color:var(--accent-light); cursor:pointer; font-size:12px; white-space:nowrap; transition:background 0.15s;">
          \uD83D\uDCC1 \u6D4F\u89C8...
        </button>
      </div>
      <button id="clearSavePathBtn" 
        style="margin-top:8px; padding:4px 14px; background:rgba(255,80,80,0.1); border:1px solid rgba(255,80,80,0.25); border-radius:6px; color:#ff6b6b; cursor:pointer; font-size:11px; transition:background 0.15s;">
        \u2715 \u6E05\u9664
      </button>
    </div>
    <div class="setting-section" style="margin-top:16px; padding-top:12px; border-top:1px solid var(--divider);">
      <div class="setting-label">\u5E94\u6025\u5907\u4EFD\u95F4\u9694\uFF08\u5206\u949F\uFF09</div>
      <div style="font-size:11px; color:var(--text-secondary); margin-bottom:8px; line-height:1.4;">
        \u5B9A\u65F6\u81EA\u52A8\u5907\u4EFD\u5230\u7CFB\u7EDF\u76EE\u5F55\uFF0C\u610F\u5916\u5173\u95ED/\u5D29\u6E83\u540E\u542F\u52A8\u53EF\u6062\u590D\u3002\u8BBE\u4E3A 0 \u5173\u95ED\u3002
      </div>
      <div style="display:flex; gap:8px; align-items:center;">
        <input type="number" id="emergencyIntervalInput" min="0" max="60" step="1"
          style="width:80px; background:var(--input-bg); border:1px solid var(--divider); border-radius:6px; color:var(--accent-light); font-size:12px; padding:6px 10px; outline:none;">
        <span style="font-size:11px; color:var(--text-secondary);">\u5206\u949F\uFF080 \u5173\u95ED\uFF0C\u9ED8\u8BA4 2\uFF09</span>
      </div>
    </div>
    <div class="setting-section" style="margin-top:16px; padding-top:12px; border-top:1px solid var(--divider);">
      <div class="setting-label">\u5FEB\u901F\u7B14\u8BB0\u5B58\u653E\u4F4D\u7F6E</div>
      <div style="font-size:11px; color:var(--text-secondary); margin-bottom:8px; line-height:1.4;">
        \u5FEB\u901F\u7B14\u8BB0\u5C06\u4FDD\u5B58\u5230\u6B64\u8DEF\u5F84
      </div>
      <div style="display:flex; gap:8px; align-items:center;">
        <input type="text" id="quickNotePathInput" readonly placeholder="\u672A\u8BBE\u7F6E" 
          style="flex:1; background:var(--input-bg); border:1px solid var(--divider); border-radius:6px; color:var(--accent-light); font-size:12px; padding:6px 10px; outline:none; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
        <button id="browseQuickNotePathBtn" 
          style="padding:6px 14px; background:rgba(0,255,255,0.12); border:1px solid var(--accent); border-radius:6px; color:var(--accent-light); cursor:pointer; font-size:12px; white-space:nowrap; transition:background 0.15s;">
          \uD83D\uDCC1 \u6D4F\u89C8...
        </button>
      </div>
      <button id="clearQuickNotePathBtn" 
        style="margin-top:8px; padding:4px 14px; background:rgba(255,80,80,0.1); border:1px solid rgba(255,80,80,0.25); border-radius:6px; color:#ff6b6b; cursor:pointer; font-size:11px; transition:background 0.15s;">
        \u2715 \u6E05\u9664
      </button>
    </div>
  </div>`

export function bindSavepathTab(ctx) {

  // ── 项目保存路径：浏览文件夹 ──
  const browseBtn = document.querySelector('#settingsPopup #browseSavePathBtn');
  const savePathInput = document.querySelector('#settingsPopup #savePathInput');
  const clearPathBtn = document.querySelector('#settingsPopup #clearSavePathBtn');

  if (browseBtn) {
    browseBtn.addEventListener('click', async () => {
      if (!window.api) {
        alert('此功能需要在 Electron 环境中运行');
        return;
      }
      const result = await window.api.selectFolder();
      if (result.canceled) return;
      appState.currentProjectSavePath = result.path;
      if (savePathInput) savePathInput.value = result.path;
      saveSettingsToStorage();
    });
  }

  // ── 项目保存路径：清除 ──
  if (clearPathBtn) {
    clearPathBtn.addEventListener('click', () => {
      appState.currentProjectSavePath = null;
      if (savePathInput) savePathInput.value = '';
      saveSettingsToStorage();
    });
  }

  // ── 应急备份间隔 ──
  const emergencyIntervalInput = document.querySelector('#settingsPopup #emergencyIntervalInput');
  if (emergencyIntervalInput) {
    emergencyIntervalInput.value = appState.emergencyBackupInterval ?? 2;
    emergencyIntervalInput.addEventListener('change', async () => {
      let v = parseInt(emergencyIntervalInput.value, 10);
      if (isNaN(v) || v < 0) v = 0;
      if (v > 60) v = 60;
      emergencyIntervalInput.value = v;
      appState.emergencyBackupInterval = v;
      saveSettingsToStorage();
      try {
        const mod = await import('../../../../emergencyBackup.js');
        if (mod.resetEmergencyBackupTimer) mod.resetEmergencyBackupTimer();
      } catch (_) {}
    });
  }

  // ── 快速笔记存放位置：浏览文件夹 ──
  const quickNoteBrowseBtn = document.querySelector('#settingsPopup #browseQuickNotePathBtn');
  const quickNotePathInput = document.querySelector('#settingsPopup #quickNotePathInput');
  const quickNoteClearBtn = document.querySelector('#settingsPopup #clearQuickNotePathBtn');

  if (quickNoteBrowseBtn) {
    quickNoteBrowseBtn.addEventListener('click', async () => {
      if (!window.api) {
        alert('此功能需要在 Electron 环境中运行');
        return;
      }
      const result = await window.api.selectFolder();
      if (result.canceled) return;
      appState.quickNoteSavePath = result.path;
      if (quickNotePathInput) quickNotePathInput.value = result.path;
      saveSettingsToStorage();
    });
  }

  // ── 快速笔记存放位置：清除 ──
  if (quickNoteClearBtn) {
    quickNoteClearBtn.addEventListener('click', () => {
      appState.quickNoteSavePath = null;
      if (quickNotePathInput) quickNotePathInput.value = '';
      saveSettingsToStorage();
    });
  }
}

