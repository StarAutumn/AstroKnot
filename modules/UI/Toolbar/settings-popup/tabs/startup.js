// ============================================================
//  UI/Toolbar/settings-popup/tabs/startup.js — 「启动」标签页
// ============================================================
//  - startupPanelHtml：面板 HTML（启动默认视图 / 默认视图 / 开始页面背景 / 应用栏布局）
//  - bindStartupTab：启动视图、开始页背景（含自定义图片浏览）、应用栏布局与桌面图标排列绑定
// ============================================================
//  
// ============================================================
import { appState } from '../../../../module0_AppState.js';
import { saveSettingsToStorage } from '../../../Theme.js';

export const startupPanelHtml = `  <div class="settings-tab-panel" data-panel="startup" style="display:none; padding:8px 16px 14px;">
  <div style="margin-top: 12px;">
    <div style="font-size:12px; color:var(--text-secondary); margin-bottom:10px;">\uD83D\uDE80 \u542F\u52A8\u9ED8\u8BA4\u89C6\u56FE</div>
    <style>
      #startupModeSelect option, #startupWindowModeSelect option, #uiModeSelect option { background:var(--panel-bg); color:var(--accent-light) !important; }
    </style>
    <select id="startupModeSelect" style="width:100%; background:transparent; color:var(--accent-light); height:26px; font-size:12px; border:1px solid var(--divider); border-radius:4px; padding:0 6px; cursor:pointer; outline:none; margin-bottom:8px;">
      <option value="3d_full">3D \u534E\u4E3D\u6A21\u5F0F</option>
      <option value="3d_simple">3D \u7B80\u6D01\u6A21\u5F0F</option>
      <option value="2d">2D \u6A21\u5F0F</option>
    </select>
  </div>
  <div style="margin-top: 6px; padding-top: 6px;">
    <div style="font-size:11px; color:var(--text-secondary); margin-bottom:6px;">\uD83D\uDDA5\uFE0F \u9ED8\u8BA4\u89C6\u56FE</div>
    <select id="startupWindowModeSelect" style="width:100%; background:transparent; color:var(--accent-light); height:26px; font-size:11px; border:1px solid var(--divider); border-radius:4px; padding:0 6px; cursor:pointer; outline:none;">
      <option value="windowed">\u7A97\u53E3\u5316</option>
      <option value="fullscreen">\u5168\u5C4F</option>
    </select>
  </div>
  <div style="margin-top: 12px; padding-top: 12px; border-top:1px solid var(--divider);">
    <div style="font-size:12px; color:var(--text-secondary); margin-bottom:10px;">\uD83C\uDF20 \u5F00\u59CB\u9875\u9762\u80CC\u666F</div>
    <style>
      #startPageBackgroundSelect option { background:var(--panel-bg); color:var(--accent-light) !important; }
    </style>
    <select id="startPageBackgroundSelect" style="width:100%; background:transparent; color:var(--accent-light); height:26px; font-size:12px; border:1px solid var(--divider); border-radius:4px; padding:0 6px; cursor:pointer; outline:none;">
      <option value="ribbon">\uD83C\uDF08 \u7011\u5E03\u5149\u5E26</option>
      <option value="custom">\uD83D\uDDBC\uFE0F \u672C\u5730\u56FE\u7247/\u52A8\u56FE</option>
    </select>
    <div id="customBgRow" style="display:none; margin-top:8px; gap:6px; align-items:center;">
      <input type="text" id="customBgPathInput" style="flex:1; background:var(--panel-bg); color:var(--accent-light); height:26px; font-size:11px; border:1px solid var(--divider); border-radius:4px; padding:0 8px; outline:none;" placeholder="未选择图片" readonly>
      <button id="customBgBrowseBtn" style="flex-shrink:0; background:var(--accent); color:white; height:26px; padding:0 10px; border:none; border-radius:4px; cursor:pointer; font-size:11px;">\u6D4F\u89C8</button>
    </div>
  </div>
  <div style="margin-top: 12px; padding-top: 12px; border-top:1px solid var(--divider);">
    <div style="font-size:12px; color:var(--text-secondary); margin-bottom:10px;">\uD83D\uDDA5\uFE0F \u5E94\u7528\u680F\u5E03\u5C40</div>
    <style>
      #dockLayoutModeSelect option { background:var(--panel-bg); color:var(--accent-light) !important; }
    </style>
    <select id="dockLayoutModeSelect" style="width:100%; background:transparent; color:var(--accent-light); height:26px; font-size:12px; border:1px solid var(--divider); border-radius:4px; padding:0 6px; cursor:pointer; outline:none;">
      <option value="sidebar">\uD83D\uDCC2 \u4FA7\u8FB9\u680F\u5217\u8868</option>
      <option value="desktop">\uD83D\uDDA5\uFE0F Windows \u684C\u9762\u56FE\u6807</option>
    </select>
    <div id="dockGridModeRow" style="margin-top:10px; display:none;">
      <style>
        #dockGridModeSelect option { background:var(--panel-bg); color:var(--accent-light) !important; }
      </style>
      <div style="font-size:12px; color:var(--text-secondary); margin-bottom:6px;">\uD83D\uDCE0 \u684C\u9762\u56FE\u6807\u6392\u5217</div>
      <select id="dockGridModeSelect" style="width:100%; background:transparent; color:var(--accent-light); height:26px; font-size:12px; border:1px solid var(--divider); border-radius:4px; padding:0 6px; cursor:pointer; outline:none;">
        <option value="free">\uD83C\uDD4F \u81EA\u7531\u5E03\u5C40</option>
        <option value="grid">\uD83D\uDD32 \u7F51\u683C\u5E03\u5C40</option>
      </select>
      <div style="font-size:10px; color:var(--text-secondary); margin-top:6px; line-height:1.4;">
        \u7F51\u683C\u5E03\u5C40\u65F6\u56FE\u6807\u81EA\u7531\u6392\u5217\u5230\u683C\u5B50\u4E2D\u5FC3\uFF0C\u6392\u52A8\u4E00\u4E2A\u683C\u5B50\u79FB\u5230\u4E00\u4E2A\u683C\u5B50\u3002
      </div>
    </div>
    <div style="font-size:10px; color:var(--text-secondary); margin-top:6px; line-height:1.4;">
      \u684C\u9762\u56FE\u6807\u6A21\u5F0F\u4E0B\uFF0C\u5FEB\u6377\u542F\u52A8\u4E0E\u5E94\u7528\u5E93\u5408\u5E76\u663E\u793A\u4E3A\u684C\u9762\u56FE\u6807\uFF0C\u4EC5\u5728 2D/3D \u754C\u9762\u53EF\u89C1\u3002
    </div>
  </div>
  </div>`

export function bindStartupTab(ctx) {

  // 绑定启动默认视图下拉
  const startupModeSelect = document.getElementById('startupModeSelect');
  if (startupModeSelect) {
    startupModeSelect.value = appState.startupMode || '3d_full';
    startupModeSelect.addEventListener('change', () => {
      appState.startupMode = startupModeSelect.value;
      saveSettingsToStorage();
    });
  }

  // 绑定默认视图（窗口化/全屏）下拉
  const startupWindowModeSelect = document.getElementById('startupWindowModeSelect');
  if (startupWindowModeSelect) {
    startupWindowModeSelect.value = appState.startupWindowMode || 'windowed';
    startupWindowModeSelect.addEventListener('change', () => {
      appState.startupWindowMode = startupWindowModeSelect.value;
      saveSettingsToStorage();
    });
  }

  // 绑定开始页面背景下拉
  const startPageBackgroundSelect = document.getElementById('startPageBackgroundSelect');
  const customBgRow = document.getElementById('customBgRow');
  const customBgPathInput = document.getElementById('customBgPathInput');
  const customBgBrowseBtn = document.getElementById('customBgBrowseBtn');
  if (startPageBackgroundSelect) {
    startPageBackgroundSelect.value = appState.startPageBackground || 'ribbon';
    // 初始显示/隐藏自定义背景行
    if (customBgRow) customBgRow.style.display = (startPageBackgroundSelect.value === 'custom') ? 'flex' : 'none';
    if (customBgPathInput) customBgPathInput.value = appState.customBgPath || '';
    startPageBackgroundSelect.addEventListener('change', () => {
      appState.startPageBackground = startPageBackgroundSelect.value;
      if (customBgRow) customBgRow.style.display = (appState.startPageBackground === 'custom') ? 'flex' : 'none';
      saveSettingsToStorage();
      // 实时应用背景
      document.dispatchEvent(new CustomEvent('start-page-bg-change'));
    });
  }
  // 绑定浏览按钮
  if (customBgBrowseBtn && !customBgBrowseBtn.hasAttribute('data-bound')) {
    customBgBrowseBtn.setAttribute('data-bound', 'true');
    customBgBrowseBtn.addEventListener('click', async () => {
      if (!window.__ELECTRON__ || !window.api?.selectImageFile) return;
      const result = await window.api.selectImageFile();
      if (result.canceled || !result.path) return;
      appState.customBgPath = result.path;
      if (customBgPathInput) customBgPathInput.value = result.path;
      saveSettingsToStorage();
      // 实时应用背景
      document.dispatchEvent(new CustomEvent('start-page-bg-change'));
    });
  }

  // 绑定应用栏布局模式下拉
  const dockLayoutModeSelect = document.getElementById('dockLayoutModeSelect');
  const dockGridModeRow = document.getElementById('dockGridModeRow');
  const dockGridModeSelect = document.getElementById('dockGridModeSelect');
  if (dockLayoutModeSelect) {
    dockLayoutModeSelect.value = appState.dockLayoutMode || 'sidebar';
    // 初始化时根据模式显示/隐藏 dockGridModeRow
    if (dockGridModeRow) {
      dockGridModeRow.style.display = (dockLayoutModeSelect.value === 'desktop') ? 'block' : 'none';
    }
    dockLayoutModeSelect.addEventListener('change', () => {
      appState.dockLayoutMode = dockLayoutModeSelect.value;
      // 切换显示/隐藏 dockGridModeRow
      if (dockGridModeRow) {
        dockGridModeRow.style.display = (dockLayoutModeSelect.value === 'desktop') ? 'block' : 'none';
      }
      saveSettingsToStorage();
      document.dispatchEvent(new CustomEvent('dock-layout-mode-change'));
    });
  }

  // 绑定桌面图标排列下拉
  if (dockGridModeSelect) {
    dockGridModeSelect.value = appState.dockGridMode || 'free';
    dockGridModeSelect.addEventListener('change', () => {
      appState.dockGridMode = dockGridModeSelect.value;
      saveSettingsToStorage();
      document.dispatchEvent(new CustomEvent('dock-grid-mode-change'));
    });
  }
}

