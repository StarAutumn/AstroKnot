// ============================================================
//  UI/Toolbar/settings-popup/tabs/editor.js — 「编辑器」标签页
// ============================================================
//  - editorPanelHtml：面板 HTML（字体大小 / 浅色模式 / 页面视图）
//  - bindEditorTab：编辑器字体大小、浅色模式、页面视图绑定
// ============================================================
//  
// ============================================================
import { appState } from '../../../../module0_AppState.js';
import { saveSettingsToStorage } from '../../../Theme.js';

export const editorPanelHtml = `  <div class="settings-tab-panel" data-panel="editor" style="display:none; padding:8px 16px 14px;">
    <div class="setting-section">
      <div class="setting-label">\uD83D\uDCDD \u7F16\u8F91\u5668\u5B57\u4F53\u5927\u5C0F</div>
      <div style="display:flex; align-items:center; gap:10px;">
        <span style="font-size:11px;">Aa</span>
        <input type="range" min="12" max="24" step="1" value="14" style="flex:1" class="editor-fontsize-slider">
        <span class="editor-fontsize-value" style="font-size:11px; min-width:28px; text-align:right;">14px</span>
      </div>
    </div>
    <div class="setting-section" style="margin-top:12px; padding-top:12px; border-top:1px solid var(--divider);">
      <div style="display:flex; align-items:center; justify-content:space-between;">
        <span style="font-size:12px;">\u2600\uFE0F \u6D45\u8272\u6A21\u5F0F</span>
        <label class="toggle-switch"><input type="checkbox" class="editor-lightmode-check"><span class="toggle-slider"></span></label>
      </div>
    </div>
    <div class="setting-section" style="margin-top:8px; padding-top:8px; border-top:1px solid var(--divider);">
      <div style="display:flex; align-items:center; justify-content:space-between;">
        <span style="font-size:12px;">\uD83D\uDCC4 \u9875\u9762\u89C6\u56FE</span>
        <label class="toggle-switch"><input type="checkbox" class="editor-pageview-check"><span class="toggle-slider"></span></label>
      </div>
    </div>
  </div>`

export function bindEditorTab(ctx) {
  const { popup } = ctx;

  // ── 编辑器：字体大小 ──
  const editorFontSlider = popup.querySelector('.editor-fontsize-slider');
  const editorFontVal = popup.querySelector('.editor-fontsize-value');
  if (editorFontSlider) {
    editorFontSlider.addEventListener('input', () => {
      appState.editorFontSize = parseInt(editorFontSlider.value);
      if (editorFontVal) editorFontVal.textContent = appState.editorFontSize + 'px';
      document.documentElement.style.setProperty('--editor-font-size', appState.editorFontSize + 'px');
      localStorage.setItem('richEditor_fontSize', String(appState.editorFontSize));
      saveSettingsToStorage();
    });
  }

  // ── 编辑器：浅色模式 ──
  const editorLightChk = popup.querySelector('.editor-lightmode-check');
  if (editorLightChk) {
    editorLightChk.addEventListener('change', () => {
      appState.editorLightMode = editorLightChk.checked;
      localStorage.setItem('richEditor_lightMode', editorLightChk.checked ? '1' : '0');
      saveSettingsToStorage();
    });
  }

  // ── 编辑器：页面视图 ──
  const editorPgViewChk = popup.querySelector('.editor-pageview-check');
  if (editorPgViewChk) {
    editorPgViewChk.addEventListener('change', () => {
      appState.editorPageView = editorPgViewChk.checked;
      localStorage.setItem('richEditor_pageView', editorPgViewChk.checked ? '1' : '0');
      saveSettingsToStorage();
    });
  }
}

