// ============================================================
//  UI / Toolbar.js — 工具栏按钮（设置弹窗、缩放、保存/加载等）
// ============================================================
import * as THREE from 'three';
import { appState } from '../module0_AppState.js';
import { saveAllProjects, loadNetworkFromFile, importMarkdownFile } from '../module9_FileIO.js';
import { updateLinesVis } from '../VisualComponents/index.js';
import { showPrompt, showConfirm } from '../module4_Confirm.js';
import { createNewProject } from '../module2_TreeData.js';
import { toggleSimple3DMode, applyUIMode, saveSettingsToStorage } from './Theme.js';
import { loadProject } from '../module2_TreeData.js';
import { checkout as versionCheckout, getGraph, renameCommit } from '../versionGraph/versionGraph.js';
import { renderVersionMapInto } from '../versionGraph/versionMap.js';

// ---------- 工具栏按钮 ----------
export function bindToolbarButtons() {
  // 暴露 showPrompt 给版本图模块使用（避免循环依赖）
  window._showPrompt = showPrompt;
  // ---------- 泛光/重置布局按钮（根据视图切换功能） ----------
  const glowBtn = document.getElementById('toggleNodeGlowBtn');
  if (glowBtn) {
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
    <div class="settings-tab" data-tab="savepath">\uD83D\uDCC2 \u6587\u4EF6\u4F4D\u7F6E</div>
    <div class="settings-tab" data-tab="help">\uD83D\uDCD6 \u4F7F\u7528\u5E2E\u52A9</div>
  </div>
  <div class="settings-body" style="flex:1; overflow-y:auto;">
  <div class="settings-tab-panel active" data-panel="display" style="padding:8px 16px 14px;">
  <div style="display:flex; align-items:center; gap:10px;">
    <span></span>
    <input type="range" min="0" max="3" step="0.01" value="1" style="flex:1" class="sky-speed-slider">
    <span>\u23E9</span>
  </div>
  <div style="text-align:center; margin-top:4px; font-size:11px; color:var(--text-secondary);">
    \u5929\u7A7A\u8F6C\u901F <span class="sky-speed-value">1.00</span>
  </div>
  <div style="display:flex; align-items:center; gap:10px; margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--divider);">
    <span>\uD83C\uDF19</span>
    <input type="range" min="0" max="2" step="0.01" value="1" style="flex:1" class="sky-brightness-slider">
    <span>\uD83D\uDCA1</span>
  </div>
  <div style="text-align:center; margin-top:4px; font-size:11px; color:var(--text-secondary);">
    \u5929\u7A7A\u4EAE\u5EA6 <span class="sky-brightness-value">1.00</span>
  </div>
  <div style="display:flex; align-items:center; gap:10px; margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--divider);">
    <span>\uD83C\uDFA8</span>
    <input type="range" min="0" max="2.5" step="0.01" value="1" style="flex:1" class="sky-saturation-slider">
    <span>\uD83C\uDF08</span>
  </div>
  <div style="text-align:center; margin-top:4px; font-size:11px; color:var(--text-secondary);">
    \u5929\u7A7A\u9971\u548C\u5EA6 <span class="sky-saturation-value">1.00</span>
  </div>
  <div style="display:flex; align-items:center; gap:10px; margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--divider);">
    <span>\uD83C\uDF19</span>
    <input type="range" min="0" max="1" step="0.01" value="1" style="flex:1" class="glow-slider">
    <span>\u2600\uFE0F</span>
  </div>
  <div style="text-align:center; margin-top:4px; font-size:11px; color:var(--text-secondary);">
    \u7403\u4F53\u6CDB\u5149 <span class="glow-value">1.00</span>
  </div>
  <div style="display:flex; align-items:center; gap:10px; margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--divider);">
    <span>\uD83D\uDD2E</span>
    <input type="range" min="0" max="1" step="0.01" value="1" style="flex:1" class="surface-glow-slider">
    <span>\u2728</span>
  </div>
  <div style="text-align:center; margin-top:4px; font-size:11px; color:var(--text-secondary);">
    \u6CDB\u5149\u7403\u58F3 <span class="surface-glow-value">1.00</span>
  </div>
  <div style="display:flex; align-items:center; justify-content:space-between; margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--divider);">
    <label style="font-size:12px; cursor: pointer; color:var(--text-primary);">\uD83D\uDD18 \u663E\u793A\u5706\u73AF</label>
    <label class="toggle-switch"><input type="checkbox" class="ring-visibility-check" checked><span class="toggle-slider"></span></label>
  </div>
  <div style="display:flex; align-items:center; gap:10px; margin-top: 4px; padding-top: 8px; border-top: 1px solid var(--divider);">
    <span>\uD83D\uDCAB</span>
    <input type="range" min="0" max="1" step="0.01" value="1" style="flex:1" class="ring-glow-slider">
    <span>\uD83E\uDE90</span>
  </div>
  <div style="text-align:center; margin-top:4px; font-size:11px; color:var(--text-secondary);">
    \u5706\u73AF\u6CDB\u5149 <span class="ring-glow-value">1.00</span>
  </div>
  <div style="display:flex; align-items:center; gap:10px; margin-top: 4px; padding-top: 8px; border-top: 1px solid var(--divider);">
    <span>\uD83D\uDD04</span>
    <input type="range" min="0" max="3" step="0.01" value="1" style="flex:1" class="ring-speed-slider">
    <span>\u23E9</span>
  </div>
  <div style="text-align:center; margin-top:4px; font-size:11px; color:var(--text-secondary);">
    \u5149\u73AF\u8F6C\u901F <span class="ring-speed-value">1.00</span>
  </div>
  <div style="display:flex; align-items:center; gap:10px; margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--divider);">
    <span>\uD83C\uDF08</span>
    <input type="range" min="0" max="1" step="0.01" value="1" style="flex:1" class="line-glow-slider">
    <span>\uD83D\uDD17</span>
  </div>
  <div style="text-align:center; margin-top:4px; font-size:11px; color:var(--text-secondary);">
    \u8FDE\u7EBF\u6CDB\u5149\u7BA1 <span class="line-glow-value">1.00</span>
  </div>
  <div style="display:flex; align-items:center; justify-content:space-between; margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--divider);">
    <label style="font-size:12px; cursor: pointer; color:var(--text-primary);">\u663E\u793A\u8FDE\u7EBF\u7C92\u5B50</label>
    <label class="toggle-switch"><input type="checkbox" class="particle-visibility-check" checked><span class="toggle-slider"></span></label>
  </div>
  <div style="display:flex; align-items:center; justify-content:space-between; margin-top: 4px; padding-top: 8px; border-top: 1px solid var(--divider);">
    <label style="font-size:12px; cursor: pointer; color:var(--text-primary);">\uD83D\uDCAB \u663E\u793A\u6D41\u661F</label>
    <label class="toggle-switch"><input type="checkbox" class="meteor-visibility-check" checked><span class="toggle-slider"></span></label>
  </div>
  <div style="display:flex; align-items:center; justify-content:space-between; margin-top: 4px; padding-top: 8px; border-top: 1px solid var(--divider);">
    <label style="font-size:12px; cursor: pointer; color:var(--text-primary);">\u7B80\u6D01\u6A21\u5F0F</label>
    <label class="toggle-switch"><input type="checkbox" id="simple3DCheck"><span class="toggle-slider"></span></label>
  </div>
  <div id="simpleBgRow" style="display:none; align-items:center; gap:8px; margin-top:4px; padding:4px 8px;">
    <span style="font-size:11px; color:var(--text-secondary);">\u80CC\u666F\u989C\u8272</span>
    <input type="color" id="simpleBgColorPicker" value="#000000" style="width:32px;height:24px;border:none;border-radius:4px;cursor:pointer;background:transparent;padding:0;">
    <input type="text" id="simpleBgHexInput" value="#000000" style="flex:1;background:transparent;border:1px solid var(--divider);border-radius:4px;color:var(--accent-light);font-size:11px;padding:2px 6px;height:22px;outline:none;font-family:monospace;">
  </div>
  <div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--divider);">
    <div style="font-size:11px; color:var(--text-secondary); margin-bottom:6px;">\u2082 2D \u6A21\u5F0F\u914D\u8272</div>
    <div style="display:flex; align-items:center; gap:8px; margin-top:4px; padding:4px 8px;">
      <span style="font-size:11px; color:var(--text-secondary); min-width:50px;">\u80CC\u666F</span>
      <input type="color" id="bg2DColorPicker" value="#01010c" style="width:32px;height:24px;border:none;border-radius:4px;cursor:pointer;background:transparent;padding:0;">
      <input type="text" id="bg2DHexInput" value="#01010c" style="flex:1;background:transparent;border:1px solid var(--divider);border-radius:4px;color:var(--accent-light);font-size:11px;padding:2px 6px;height:22px;outline:none;font-family:monospace;">
    </div>
    <div style="display:flex; align-items:center; gap:8px; margin-top:4px; padding:4px 8px;">
      <span style="font-size:11px; color:var(--text-secondary); min-width:50px;">\u7F51\u683C</span>
      <input type="color" id="grid2DColorPicker" value="#1a2a34" style="width:32px;height:24px;border:none;border-radius:4px;cursor:pointer;background:transparent;padding:0;">
      <input type="text" id="grid2DHexInput" value="#1a2a34" style="flex:1;background:transparent;border:1px solid var(--divider);border-radius:4px;color:var(--accent-light);font-size:11px;padding:2px 6px;height:22px;outline:none;font-family:monospace;">
    </div>
  </div>
  <div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--divider);">
    <div style="font-size:11px; color:var(--text-secondary); margin-bottom:6px;">\uD83D\uDD2D \u6E32\u67D3\u6027\u80FD</div>
    <div style="display:flex; align-items:center; gap:10px; margin-top:4px;">
      <span style="font-size:11px; min-width:40px;">FOV</span>
      <input type="range" min="30" max="70" step="1" value="40" style="flex:1" class="fov-slider">
      <span class="fov-value" style="font-size:11px; min-width:24px; text-align:right;">40\u00B0</span>
    </div>
    <div style="display:flex; align-items:center; gap:10px; margin-top:4px;">
      <span style="font-size:11px; min-width:40px;">Bloom</span>
      <input type="range" min="0" max="1.5" step="0.01" value="0.2" style="flex:1" class="bloom-slider">
      <span class="bloom-value" style="font-size:11px; min-width:28px; text-align:right;">0.20</span>
    </div>
    <div style="display:flex; align-items:center; gap:10px; margin-top:4px;">
      <span style="font-size:11px; min-width:40px;">\u50CF\u7D20\u6BD4</span>
      <select class="pixelratio-select" style="flex:1; background:transparent; color:var(--accent-light); height:24px; font-size:11px; border:1px solid var(--divider); border-radius:4px; padding:0 4px; cursor:pointer; outline:none;">
        <option value="1">1.0x</option>
        <option value="1.5">1.5x</option>
        <option value="2">2.0x</option>
      </select>
    </div>
    <div style="display:flex; align-items:center; gap:10px; margin-top:4px;">
      <span style="font-size:11px; min-width:40px;">\u7C92\u5B50</span>
      <select class="particle-density-select" style="flex:1; background:transparent; color:var(--accent-light); height:24px; font-size:11px; border:1px solid var(--divider); border-radius:4px; padding:0 4px; cursor:pointer; outline:none;">
        <option value="low">\u4F4E</option>
        <option value="medium">\u4E2D</option>
        <option value="high">\u9AD8</option>
      </select>
    </div>
    <div style="font-size:10px; color:var(--text-secondary); margin-top:4px;">\u26A0 \u7C92\u5B50\u5BC6\u5EA6\u9700\u91CD\u542F\u5E94\u7528\u751F\u6548</div>
  </div>
  </div>
  <div class="settings-tab-panel" data-panel="editor" style="display:none; padding:8px 16px 14px;">
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
  </div>
  <div class="settings-tab-panel" data-panel="2dview" style="display:none; padding:8px 16px 14px;">
    <div class="setting-section">
      <div class="setting-label">\uD83D\uDCCF \u8282\u70B9\u9ED8\u8BA4\u5C3A\u5BF8</div>
      <div style="display:flex; gap:10px;">
        <div style="flex:1;">
          <span style="font-size:11px; color:var(--text-secondary);">\u5BBD\u5EA6</span>
          <input type="number" class="node-width2d-input" value="120" min="60" max="200" step="5"
            style="width:100%; background:transparent; border:1px solid var(--divider); border-radius:4px; color:var(--accent-light); font-size:12px; padding:3px 8px; height:26px; outline:none;">
        </div>
        <div style="flex:1;">
          <span style="font-size:11px; color:var(--text-secondary);">\u9AD8\u5EA6</span>
          <input type="number" class="node-height2d-input" value="40" min="20" max="80" step="5"
            style="width:100%; background:transparent; border:1px solid var(--divider); border-radius:4px; color:var(--accent-light); font-size:12px; padding:3px 8px; height:26px; outline:none;">
        </div>
      </div>
    </div>
    <div class="setting-section" style="margin-top:12px; padding-top:12px; border-top:1px solid var(--divider);">
      <div class="setting-label">\uD83D\uDCCF \u8282\u70B9\u95F4\u8DDD</div>
      <div style="display:flex; gap:10px;">
        <div style="flex:1;">
          <span style="font-size:11px; color:var(--text-secondary);">\u6C34\u5E73</span>
          <input type="number" class="hgap2d-input" value="60" min="20" max="120" step="5"
            style="width:100%; background:transparent; border:1px solid var(--divider); border-radius:4px; color:var(--accent-light); font-size:12px; padding:3px 8px; height:26px; outline:none;">
        </div>
        <div style="flex:1;">
          <span style="font-size:11px; color:var(--text-secondary);">\u5782\u76F4</span>
          <input type="number" class="vgap2d-input" value="20" min="10" max="60" step="5"
            style="width:100%; background:transparent; border:1px solid var(--divider); border-radius:4px; color:var(--accent-light); font-size:12px; padding:3px 8px; height:26px; outline:none;">
        </div>
      </div>
    </div>
    <div class="setting-section" style="margin-top:12px; padding-top:12px; border-top:1px solid var(--divider);">
      <div style="display:flex; align-items:center; gap:10px;">
        <span style="font-size:11px; min-width:50px;">\u7F51\u683C\u5927\u5C0F</span>
        <input type="number" class="gridsize2d-input" value="40" min="20" max="80" step="5"
          style="flex:1; background:transparent; border:1px solid var(--divider); border-radius:4px; color:var(--accent-light); font-size:12px; padding:3px 8px; height:26px; outline:none;">
      </div>
    </div>
    <div style="font-size:10px; color:var(--text-secondary); margin-top:8px;">\u26A0 \u9700\u8981\u91CD\u65B0\u52A0\u8F7D2D\u89C6\u56FE\u751F\u6548</div>
  </div>
  <div class="settings-tab-panel" data-panel="theme" style="display:none; padding:8px 16px 14px;">
  <div style="margin-top: 10px; padding-top: 8px;">
    <div style="font-size:12px; color:var(--text-secondary); margin-bottom:10px;">🎨 界面模式</div>
    <select id="uiModeSelect" style="width:100%; background:transparent; color:var(--accent-light); height:26px; font-size:12px; border:1px solid var(--divider); border-radius:4px; padding:0 6px; cursor:pointer; outline:none;">
      <option value="dark">深色模式</option>
      <option value="light">浅色模式</option>
    </select>
  </div>
  <div id="darkOnlySettings" class="dark-only" style="margin-top: 14px; padding-top: 8px; border-top: 1px solid var(--divider);">
    <div style="display:flex; align-items:center; justify-content:space-between;">
      <span style="font-size:12px; color:var(--text-secondary);">🌈 任务栏七彩流光特效</span>
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
  </div>
  <div class="settings-tab-panel" data-panel="startup" style="display:none; padding:8px 16px 14px;">
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
  </div>
  <div class="settings-tab-panel" data-panel="savepath" style="display:none; padding:8px 16px 14px;">
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
  </div>
  <div class="settings-tab-panel" data-panel="help" style="display:none; padding:8px 16px 14px;">
    <div style="display:flex; justify-content:flex-end; margin-bottom:8px;">
      <button id="guideTriggerBtn" class="help-header-guide-btn" style="background:rgba(0,255,255,0.12); border:1px solid var(--accent); border-radius:6px; color:var(--accent-light); cursor:pointer; font-size:12px; padding:5px 14px; transition:background 0.15s;">\u8FDB\u5165\u6559\u7A0B</button>
    </div>
    <div id="settingsHelpContent" style="color:#c0e0f0; line-height:1.6; font-size:12px;"></div>
  </div>
</div>
</div>
  </div>
`;
      document.body.appendChild(popup);

      // ── 将 #helpModal 中的帮助内容复制到设置面板中 ──
      const helpModalBody = document.querySelector('#helpModal .help-modal-body');
      const settingsHelpContent = popup.querySelector('#settingsHelpContent');
      if (helpModalBody && settingsHelpContent) {
        settingsHelpContent.appendChild(helpModalBody.cloneNode(true));
      }

      // ── 动态 Z-Index 管理（与编辑器模态框共享同一层级栈）──
      if (!window._modalZIndexBase) window._modalZIndexBase = 1000;
      window._modalZIndexBase += 10;
      popup.style.zIndex = window._modalZIndexBase;
      overlay.style.zIndex = window._modalZIndexBase - 1;
      popup.addEventListener('mousedown', function () {
        window._modalZIndexBase += 10;
        popup.style.zIndex = window._modalZIndexBase;
        overlay.style.zIndex = window._modalZIndexBase - 1;
      });

      const slider = popup.querySelector('.glow-slider');
      const valueSpan = popup.querySelector('.glow-value');
      const skySlider = popup.querySelector('.sky-brightness-slider');
      const skyValueSpan = popup.querySelector('.sky-brightness-value');
      const skySpeedSlider = popup.querySelector('.sky-speed-slider');
      const skySpeedValueSpan = popup.querySelector('.sky-speed-value');
      const surfaceSlider = popup.querySelector('.surface-glow-slider');
      const surfaceValueSpan = popup.querySelector('.surface-glow-value');
      const ringSlider = popup.querySelector('.ring-glow-slider');
      const ringValueSpan = popup.querySelector('.ring-glow-value');
      const lineSlider = popup.querySelector('.line-glow-slider');
      const lineValueSpan = popup.querySelector('.line-glow-value');
      const particleCheck = popup.querySelector('.particle-visibility-check');
      if (slider && valueSpan) {
        slider.value = appState.nodeGlowOpacity ?? 1;
        valueSpan.textContent = (appState.nodeGlowOpacity ?? 1).toFixed(2);
        slider.addEventListener('input', () => {
          const val = parseFloat(slider.value);
          appState.nodeGlowOpacity = val;
          valueSpan.textContent = val.toFixed(2);
          saveSettingsToStorage();
        });
      }
      if (skySpeedSlider && skySpeedValueSpan) {
        skySpeedSlider.value = appState.skyRotationSpeed ?? 1;
        skySpeedValueSpan.textContent = (appState.skyRotationSpeed ?? 1).toFixed(2);
        skySpeedSlider.addEventListener('input', () => {
          const val = parseFloat(skySpeedSlider.value);
          appState.skyRotationSpeed = val;
          skySpeedValueSpan.textContent = val.toFixed(2);
          saveSettingsToStorage();
        });
      }
      if (skySlider && skyValueSpan) {
        skySlider.value = appState.skyBrightness ?? 1;
        skyValueSpan.textContent = (appState.skyBrightness ?? 1).toFixed(2);
        skySlider.addEventListener('input', () => {
          const val = parseFloat(skySlider.value);
          appState.skyBrightness = val;
          skyValueSpan.textContent = val.toFixed(2);
          saveSettingsToStorage();
        });
      }
      const skySatSlider = popup.querySelector('.sky-saturation-slider');
      const skySatValueSpan = popup.querySelector('.sky-saturation-value');
      if (skySatSlider && skySatValueSpan) {
        skySatSlider.value = appState.skySaturation ?? 1.0;
        skySatValueSpan.textContent = (appState.skySaturation ?? 1.0).toFixed(2);
        skySatSlider.addEventListener('input', () => {
          const val = parseFloat(skySatSlider.value);
          appState.skySaturation = val;
          skySatValueSpan.textContent = val.toFixed(2);
          saveSettingsToStorage();
        });
      }
      if (surfaceSlider && surfaceValueSpan) {
        surfaceSlider.value = appState.surfaceGlowOpacity ?? 1;
        surfaceValueSpan.textContent = (appState.surfaceGlowOpacity ?? 1).toFixed(2);
        surfaceSlider.addEventListener('input', () => {
          const val = parseFloat(surfaceSlider.value);
          appState.surfaceGlowOpacity = val;
          surfaceValueSpan.textContent = val.toFixed(2);
          saveSettingsToStorage();
        });
      }
      if (ringSlider && ringValueSpan) {
        ringSlider.value = appState.ringGlowOpacity ?? 1;
        ringValueSpan.textContent = (appState.ringGlowOpacity ?? 1).toFixed(2);
        ringSlider.addEventListener('input', () => {
          const val = parseFloat(ringSlider.value);
          appState.ringGlowOpacity = val;
          ringValueSpan.textContent = val.toFixed(2);
          saveSettingsToStorage();
        });
      }
      if (lineSlider && lineValueSpan) {
        lineSlider.value = appState.lineGlowOpacity ?? 1;
        lineValueSpan.textContent = (appState.lineGlowOpacity ?? 1).toFixed(2);
        lineSlider.addEventListener('input', () => {
          const val = parseFloat(lineSlider.value);
          appState.lineGlowOpacity = val;
          lineValueSpan.textContent = val.toFixed(2);
          saveSettingsToStorage();
        });
      }
      const ringSpeedSlider = popup.querySelector('.ring-speed-slider');
      const ringSpeedValueSpan = popup.querySelector('.ring-speed-value');
      if (ringSpeedSlider && ringSpeedValueSpan) {
        ringSpeedSlider.value = appState.ringRotationSpeed ?? 1;
        ringSpeedValueSpan.textContent = (appState.ringRotationSpeed ?? 1).toFixed(2);
        ringSpeedSlider.addEventListener('input', () => {
          const val = parseFloat(ringSpeedSlider.value);
          appState.ringRotationSpeed = val;
          ringSpeedValueSpan.textContent = val.toFixed(2);
          saveSettingsToStorage();
        });
      }
      if (particleCheck) {
        particleCheck.checked = appState.particleVisible;
        particleCheck.addEventListener('change', (e) => {
          appState.particleVisible = e.target.checked;
          saveSettingsToStorage();
        });
      }
      const meteorCheck = popup.querySelector('.meteor-visibility-check');
      if (meteorCheck) {
        meteorCheck.checked = appState.meteorVisible ?? true;
        meteorCheck.addEventListener('change', (e) => {
          appState.meteorVisible = e.target.checked;
          if (appState.meteors) {
            appState.meteors.forEach(m => {
              if (m.group) m.group.visible = e.target.checked;
            });
          }
          saveSettingsToStorage();
        });
      }
      const ringCheck = popup.querySelector('.ring-visibility-check');
      if (ringCheck) {
        ringCheck.checked = appState.ringVisible ?? true;
        ringCheck.addEventListener('change', (e) => {
          appState.ringVisible = e.target.checked;
          for (const [, obj] of appState.nodeMeshes) {
            if (obj.ring) obj.ring.visible = e.target.checked;
            if (obj.glowRing) {
              obj.glowRing.visible = e.target.checked && (appState.ringGlowOpacity ?? 1) > 0;
            }
          }
          saveSettingsToStorage();
        });
      }
      window.__glowPopup = { popup, overlay, slider, valueSpan, skySlider, skyValueSpan, skySpeedSlider, skySpeedValueSpan, surfaceSlider, surfaceValueSpan, ringSlider, ringValueSpan, lineSlider, lineValueSpan, particleCheck, meteorCheck, ringCheck };

      // ── 拖拽（拖动 settings-modal-content）──
      (function initSettingsDrag() {
        let isDragging = false, dragOffX, dragOffY;
        const content = popup.querySelector('.settings-modal-content');
        if (!content) return;
        const header = content.querySelector('.rich-modal-header');
        if (!header) return;
        header.style.cursor = 'default';
        header.addEventListener('mousedown', function (e) {
          if (e.target.closest('.caption-btn')) return;
          isDragging = true;
          const r = content.getBoundingClientRect();
          dragOffX = e.clientX - r.left;
          dragOffY = e.clientY - r.top;
          content.style.transition = 'none';  // 关闭过渡，跟手拖拽
          e.preventDefault();
        });
        document.addEventListener('mousemove', function (e) {
          if (!isDragging) return;
          content.style.left = (e.clientX - dragOffX) + 'px';
          content.style.top = (e.clientY - dragOffY) + 'px';
        });
        document.addEventListener('mouseup', function () {
          isDragging = false;
          content.style.transition = '';  // 恢复过渡
        });
      })();

      // 绑定简洁模式开关（修正）
      const simpleCheck = document.getElementById('simple3DCheck');
      if (simpleCheck) {
        simpleCheck.checked = appState.simple3D;
        simpleCheck.addEventListener('change', (e) => {
          toggleSimple3DMode(e.target.checked);
          const bgRow = document.getElementById('simpleBgRow');
          if (bgRow) bgRow.style.display = e.target.checked ? 'flex' : 'none';
        });
      }

      // 绑定简洁模式背景颜色
      const bgRow = document.getElementById('simpleBgRow');
      if (bgRow) bgRow.style.display = appState.simple3D ? 'flex' : 'none';

      const bgPicker = document.getElementById('simpleBgColorPicker');
      const bgHexInput = document.getElementById('simpleBgHexInput');
      if (bgPicker && bgHexInput) {
        bgPicker.value = appState.simpleBgColor || '#000000';
        bgHexInput.value = appState.simpleBgColor || '#000000';
        bgPicker.addEventListener('input', () => {
          const color = bgPicker.value;
          appState.simpleBgColor = color;
          bgHexInput.value = color;
          if (appState.simple3D && appState.scene) {
            appState.scene.background = new THREE.Color(color);
          }
          saveSettingsToStorage();
        });
        bgHexInput.addEventListener('change', () => {
          let val = bgHexInput.value.trim();
          if (/^#?[0-9a-f]{6}$/i.test(val.replace('#',''))) {
            if (!val.startsWith('#')) val = '#' + val;
            appState.simpleBgColor = val;
            bgPicker.value = val;
            if (appState.simple3D && appState.scene) {
              appState.scene.background = new THREE.Color(val);
            }
            saveSettingsToStorage();
          } else {
            bgHexInput.value = appState.simpleBgColor || '#000000';
          }
        });
      }

      // 绑定 2D 模式背景颜色
      function bind2DColorPicker(pickerId, hexId, stateKey, refresh) {
        const picker = document.getElementById(pickerId);
        const hexInput = document.getElementById(hexId);
        if (!picker || !hexInput) return;
        picker.value = appState[stateKey] || '#000000';
        hexInput.value = appState[stateKey] || '#000000';
        picker.addEventListener('input', () => {
          appState[stateKey] = picker.value;
          hexInput.value = picker.value;
          saveSettingsToStorage();
          if (refresh && typeof refresh === 'function') refresh();
        });
        hexInput.addEventListener('change', () => {
          let val = hexInput.value.trim();
          if (/^#?[0-9a-f]{6}$/i.test(val.replace('#',''))) {
            if (!val.startsWith('#')) val = '#' + val;
            appState[stateKey] = val;
            picker.value = val;
            saveSettingsToStorage();
            if (refresh && typeof refresh === 'function') refresh();
          } else {
            hexInput.value = appState[stateKey] || '#000000';
          }
        });
      }
      bind2DColorPicker('bg2DColorPicker', 'bg2DHexInput', 'bgColor2D', () => appState.refresh2DView?.());
      bind2DColorPicker('grid2DColorPicker', 'grid2DHexInput', 'gridColor2D', () => appState.refresh2DView?.());

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

      // 绑定任务栏七彩流光开关
      const rainbowCheck = popup.querySelector('#taskbarRainbowCheck');
      if (rainbowCheck) {
        rainbowCheck.checked = appState.taskbarRainbow !== false;
        rainbowCheck.addEventListener('change', function (e) {
          appState.taskbarRainbow = e.target.checked;
          document.getElementById('taskbar').classList.toggle('no-rainbow', !e.target.checked);
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

      glowBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // 打开/切换设置面板时自动关闭 AstroKnot 菜单
        (function closeAstroMenu() {
          const menu = document.getElementById('astroKnotMenu');
          if (menu && menu.classList.contains('show')) {
            menu.classList.add('hiding');
            menu.addEventListener('animationend', function onEnd() {
              menu.removeEventListener('animationend', onEnd);
              menu.classList.remove('show', 'hiding');
            });
          }
        })();
        const gp = window.__glowPopup;
        if (!gp) return;
        if (gp.popup.classList.contains('windowed')) {
          hideSettingsPopup();
          return;
        }
        const simpleCheck = gp.popup.querySelector('#simple3DCheck');
        if (simpleCheck) simpleCheck.checked = appState.simple3D;
        const nodeGlowSlider = gp.popup.querySelector('.glow-slider');
        const nodeGlowValueSpan = gp.popup.querySelector('.glow-value');
        if (nodeGlowSlider) {
          nodeGlowSlider.value = appState.nodeGlowOpacity ?? 1;
        }
        if (nodeGlowValueSpan) {
          nodeGlowValueSpan.textContent = (appState.nodeGlowOpacity ?? 1).toFixed(2);
        }
        const skySlider = gp.popup.querySelector('.sky-brightness-slider');
        const skyValueSpan = gp.popup.querySelector('.sky-brightness-value');
        if (skySlider) {
          skySlider.value = appState.skyBrightness ?? 1;
        }
        if (skyValueSpan) {
          skyValueSpan.textContent = (appState.skyBrightness ?? 1).toFixed(2);
        }
        const skySpeedSlider = gp.popup.querySelector('.sky-speed-slider');
        const skySpeedValueSpan = gp.popup.querySelector('.sky-speed-value');
        if (skySpeedSlider) {
          skySpeedSlider.value = appState.skyRotationSpeed ?? 1;
        }
        if (skySpeedValueSpan) {
          skySpeedValueSpan.textContent = (appState.skyRotationSpeed ?? 1).toFixed(2);
        }
        const skySatSlider = gp.popup.querySelector('.sky-saturation-slider');
        const skySatValueSpan = gp.popup.querySelector('.sky-saturation-value');
        if (skySatSlider) {
          skySatSlider.value = appState.skySaturation ?? 1.0;
        }
        if (skySatValueSpan) {
          skySatValueSpan.textContent = (appState.skySaturation ?? 1.0).toFixed(2);
        }
        const surfaceSlider = gp.popup.querySelector('.surface-glow-slider');
        const surfaceValueSpan = gp.popup.querySelector('.surface-glow-value');
        if (surfaceSlider) {
          surfaceSlider.value = appState.surfaceGlowOpacity ?? 1;
        }
        if (surfaceValueSpan) {
          surfaceValueSpan.textContent = (appState.surfaceGlowOpacity ?? 1).toFixed(2);
        }
        const ringSlider = gp.popup.querySelector('.ring-glow-slider');
        const ringValueSpan = gp.popup.querySelector('.ring-glow-value');
        if (ringSlider) {
          ringSlider.value = appState.ringGlowOpacity ?? 1;
        }
        if (ringValueSpan) {
          ringValueSpan.textContent = (appState.ringGlowOpacity ?? 1).toFixed(2);
        }
        const ringSpeedSlider = gp.popup.querySelector('.ring-speed-slider');
        const ringSpeedValueSpan = gp.popup.querySelector('.ring-speed-value');
        if (ringSpeedSlider) {
          ringSpeedSlider.value = appState.ringRotationSpeed ?? 1;
        }
        if (ringSpeedValueSpan) {
          ringSpeedValueSpan.textContent = (appState.ringRotationSpeed ?? 1).toFixed(2);
        }
        const lineSlider = gp.popup.querySelector('.line-glow-slider');
        const lineValueSpan = gp.popup.querySelector('.line-glow-value');
        if (lineSlider) {
          lineSlider.value = appState.lineGlowOpacity ?? 1;
        }
        if (lineValueSpan) {
          lineValueSpan.textContent = (appState.lineGlowOpacity ?? 1).toFixed(2);
        }
        const particleCheck = gp.popup.querySelector('.particle-visibility-check');
        if (particleCheck) particleCheck.checked = appState.particleVisible;
        const meteorCheck = gp.popup.querySelector('.meteor-visibility-check');
        if (meteorCheck) meteorCheck.checked = appState.meteorVisible ?? true;
        const ringCheck = gp.popup.querySelector('.ring-visibility-check');
        if (ringCheck) ringCheck.checked = appState.ringVisible ?? true;
        const startupModeSelect = gp.popup.querySelector('#startupModeSelect');
        if (startupModeSelect) startupModeSelect.value = appState.startupMode || '3d_full';
        const startupWindowModeSelect = gp.popup.querySelector('#startupWindowModeSelect');
        if (startupWindowModeSelect) startupWindowModeSelect.value = appState.startupWindowMode || 'windowed';
        // 恢复简洁模式背景颜色
        const bgRow = gp.popup.querySelector('#simpleBgRow');
        if (bgRow) bgRow.style.display = appState.simple3D ? 'flex' : 'none';
        const bgPicker = gp.popup.querySelector('#simpleBgColorPicker');
        const bgHexInput = gp.popup.querySelector('#simpleBgHexInput');
        if (bgPicker) bgPicker.value = appState.simpleBgColor || '#000000';
        if (bgHexInput) bgHexInput.value = appState.simpleBgColor || '#000000';
        // 恢复 2D 配色
        const bg2DPicker = gp.popup.querySelector('#bg2DColorPicker');
        const bg2DHex = gp.popup.querySelector('#bg2DHexInput');
        if (bg2DPicker) bg2DPicker.value = appState.bgColor2D || '#01010c';
        if (bg2DHex) bg2DHex.value = appState.bgColor2D || '#01010c';
        const grid2DPicker = gp.popup.querySelector('#grid2DColorPicker');
        const grid2DHex = gp.popup.querySelector('#grid2DHexInput');
        if (grid2DPicker) grid2DPicker.value = appState.gridColor2D || '#1a2a34';
        if (grid2DHex) grid2DHex.value = appState.gridColor2D || '#1a2a34';
        // 窗口化显示并居中
        gp.popup.classList.remove('maximized');
        gp.popup.classList.add('windowed');
        if (window._bringModalToFront) window._bringModalToFront(gp.popup);
        const panel = gp.popup.querySelector('.settings-modal-content');
        if (panel) {
          panel.style.left = Math.round((window.innerWidth - panel.offsetWidth) / 2) + 'px';
          panel.style.top = Math.round((window.innerHeight - panel.offsetHeight) / 2) + 'px';
        }
        // 同步保存路径输入框
        const savePathInput = gp.popup.querySelector('#savePathInput');
        if (savePathInput) {
          savePathInput.value = appState.currentProjectSavePath || '';
        }
        const emergencyIntervalInput = gp.popup.querySelector('#emergencyIntervalInput');
        if (emergencyIntervalInput) {
          emergencyIntervalInput.value = appState.emergencyBackupInterval ?? 2;
        }
        const quickNotePathInput = gp.popup.querySelector('#quickNotePathInput');
        if (quickNotePathInput) {
          quickNotePathInput.value = appState.quickNoteSavePath || '';
        }
        // 同步渲染性能
        const fovSlider = gp.popup.querySelector('.fov-slider');
        const fovValueEl = gp.popup.querySelector('.fov-value');
        if (fovSlider) { fovSlider.value = appState.cameraFOV ?? 40; if (fovValueEl) fovValueEl.textContent = (appState.cameraFOV ?? 40) + '\u00B0'; }
        const bloomSlider = gp.popup.querySelector('.bloom-slider');
        const bloomValueEl = gp.popup.querySelector('.bloom-value');
        if (bloomSlider) { bloomSlider.value = appState.bloomStrength ?? 0.2; if (bloomValueEl) bloomValueEl.textContent = (appState.bloomStrength ?? 0.2).toFixed(2); }
        const pixelRatioSelect = gp.popup.querySelector('.pixelratio-select');
        if (pixelRatioSelect) pixelRatioSelect.value = String(appState.pixelRatioCap ?? 1.5);
        const particleDensitySelect = gp.popup.querySelector('.particle-density-select');
        if (particleDensitySelect) particleDensitySelect.value = appState.particleDensity ?? 'high';
        // 同步编辑器
        const editorFontSlider = gp.popup.querySelector('.editor-fontsize-slider');
        const editorFontVal = gp.popup.querySelector('.editor-fontsize-value');
        if (editorFontSlider) { editorFontSlider.value = appState.editorFontSize ?? 14; if (editorFontVal) editorFontVal.textContent = (appState.editorFontSize ?? 14) + 'px'; }
        const editorLightChk = gp.popup.querySelector('.editor-lightmode-check');
        if (editorLightChk) editorLightChk.checked = appState.editorLightMode ?? false;
        const editorPgViewChk = gp.popup.querySelector('.editor-pageview-check');
        if (editorPgViewChk) editorPgViewChk.checked = appState.editorPageView ?? false;
        // 同步 2D 视图
        const nw2d = gp.popup.querySelector('.node-width2d-input');
        if (nw2d) nw2d.value = appState.nodeWidth2D ?? 120;
        const nh2d = gp.popup.querySelector('.node-height2d-input');
        if (nh2d) nh2d.value = appState.nodeHeight2D ?? 40;
        const hg2d = gp.popup.querySelector('.hgap2d-input');
        if (hg2d) hg2d.value = appState.hGap2D ?? 60;
        const vg2d = gp.popup.querySelector('.vgap2d-input');
        if (vg2d) vg2d.value = appState.vGap2D ?? 20;
        const gs2d = gp.popup.querySelector('.gridsize2d-input');
        if (gs2d) gs2d.value = appState.gridSize2D ?? 40;
        // 任务栏进程
        if (window.Taskbar) {
          window.Taskbar.addOrUpdateEditor('settings', {
            icon: '\u2699\uFE0F',
            label: '\u8BBE\u7F6E',
            active: true,
            activate: function () {
              // 切换：可见时最小化，不可见时恢复
              var isVisible = gp.popup.style.display !== 'none' && (gp.popup.classList.contains('windowed') || gp.popup.classList.contains('maximized'));
              if (isVisible) {
                // 最小化
                const content = gp.popup.querySelector('.settings-modal-content');
                if (!content) { gp.popup.style.display = 'none'; if (window.Taskbar) window.Taskbar.setEditorActive('settings', false); return; }
                const tabEl = document.querySelector('.taskbar-tab[data-editor-key="settings"]');
                const rect = content.getBoundingClientRect();
                let dx, dy, scale;
                if (tabEl) {
                  const tabRect = tabEl.getBoundingClientRect();
                  dx = (tabRect.left + tabRect.width / 2) - (rect.left + rect.width / 2);
                  dy = (tabRect.top + tabRect.height / 2) - (rect.top + rect.height / 2);
                  scale = Math.min(40 / rect.width, 20 / rect.height);
                } else { dx = 0; dy = 0; scale = 0.1; }
                const anim = content.animate([
                  { transform: 'translate(0, 0) scale(1)', opacity: 1 },
                  { transform: 'translate(' + dx + 'px, ' + dy + 'px) scale(' + scale + ')', opacity: 0.15 }
                ], { duration: 250, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' });
                anim.onfinish = function () {
                  gp.popup.style.display = 'none';
                  content.style.transform = '';
                  if (window.Taskbar) window.Taskbar.setEditorActive('settings', false);
                };
              } else {
                // 恢复显示
                gp.popup.classList.add('windowed');
                gp.popup.style.display = '';
                if (window._bringModalToFront) window._bringModalToFront(gp.popup);
                if (window.Taskbar) window.Taskbar.setEditorActive('settings', true);
                // 弹入动画
                const content = gp.popup.querySelector('.settings-modal-content');
                if (content) {
                  const tabEl = document.querySelector('.taskbar-tab[data-editor-key="settings"]');
                  const rect = content.getBoundingClientRect();
                  let dx, dy, scale;
                  if (tabEl) {
                    const tabRect = tabEl.getBoundingClientRect();
                    dx = (tabRect.left + tabRect.width / 2) - (rect.left + rect.width / 2);
                    dy = (tabRect.top + tabRect.height / 2) - (rect.top + rect.height / 2);
                    scale = Math.min(40 / rect.width, 20 / rect.height);
                  } else { dx = 0; dy = 0; scale = 0.3; }
                  content.animate([
                    { transform: 'translate(' + dx + 'px, ' + dy + 'px) scale(' + scale + ')', opacity: 0.15 },
                    { transform: 'translate(0, 0) scale(1)', opacity: 1 }
                  ], { duration: 250, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' });
                }
              }
            },
            close: hideSettingsPopup,
            maximize: function () { gp.popup.classList.add('windowed'); if (window._bringModalToFront) window._bringModalToFront(gp.popup); },
            minimize: function () {
              const content = gp.popup.querySelector('.settings-modal-content');
              if (!content) { gp.popup.style.display = 'none'; return; }
              const tabEl = document.querySelector('.taskbar-tab[data-editor-key="settings"]');
              const rect = content.getBoundingClientRect();
              let dx, dy, scale;
              if (tabEl) {
                const tabRect = tabEl.getBoundingClientRect();
                dx = (tabRect.left + tabRect.width / 2) - (rect.left + rect.width / 2);
                dy = (tabRect.top + tabRect.height / 2) - (rect.top + rect.height / 2);
                scale = Math.min(40 / rect.width, 20 / rect.height);
              } else { dx = 0; dy = 0; scale = 0.1; }
              const anim = content.animate([
                { transform: 'translate(0, 0) scale(1)', opacity: 1 },
                { transform: 'translate(' + dx + 'px, ' + dy + 'px) scale(' + scale + ')', opacity: 0.15 }
              ], { duration: 250, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' });
              anim.onfinish = function () {
                gp.popup.style.display = 'none';
                content.style.transform = '';
                if (window.Taskbar) window.Taskbar.setEditorActive('settings', false);
              };
            }
          });
        }
      });

      function hideSettingsPopup() {
        const gp = window.__glowPopup;
        if (!gp) return;
        // 关闭设置面板时统一保存一次，确保所有修改都持久化
        saveSettingsToStorage();
        // 关闭设置面板时也自动收起 AstroKnot 菜单
        (function closeAstroMenu() {
          const menu = document.getElementById('astroKnotMenu');
          if (menu && menu.classList.contains('show')) {
            menu.classList.add('hiding');
            menu.addEventListener('animationend', function onEnd() {
              menu.removeEventListener('animationend', onEnd);
              menu.classList.remove('show', 'hiding');
            });
          }
        })();
        const popup = gp.popup;
        // 最大化模式：直接关闭，无动画
        if (popup.classList.contains('maximized')) {
          popup.classList.remove('maximized');
          if (window.Taskbar) window.Taskbar.removeEditor('settings');
          return;
        }
        // 窗口模式：播放关闭动画后隐藏
        popup.classList.add('closing');
        setTimeout(() => {
          popup.classList.remove('windowed', 'closing');
          if (window.Taskbar) window.Taskbar.removeEditor('settings');
        }, 200);
      }

      // 关闭按钮
      document.querySelector('#settingsPopup .settings-close-btn')?.addEventListener('click', hideSettingsPopup);

      // 最小化按钮 — 带缩入动画
      document.querySelector('#settingsPopup .settings-min-btn')?.addEventListener('click', function () {
        const gp = window.__glowPopup;
        if (!gp) return;
        const content = gp.popup.querySelector('.settings-modal-content');
        if (!content) return;
        // 计算目标位置（任务栏进程图标）
        const tabEl = document.querySelector('.taskbar-tab[data-editor-key="settings"]');
        const rect = content.getBoundingClientRect();
        let dx, dy, scale;
        if (tabEl) {
          const tabRect = tabEl.getBoundingClientRect();
          dx = (tabRect.left + tabRect.width / 2) - (rect.left + rect.width / 2);
          dy = (tabRect.top + tabRect.height / 2) - (rect.top + rect.height / 2);
          scale = Math.min(40 / rect.width, 20 / rect.height);
        } else {
          dx = 0;
          dy = window.innerHeight - rect.top;
          scale = 0.1;
        }
        const anim = content.animate([
          { transform: 'translate(0, 0) scale(1)', opacity: 1 },
          { transform: 'translate(' + dx + 'px, ' + dy + 'px) scale(' + scale + ')', opacity: 0.15 }
        ], { duration: 250, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' });
        anim.onfinish = function () {
          gp.popup.style.display = 'none';
          content.style.transform = '';
          if (window.Taskbar) window.Taskbar.setEditorActive('settings', false);
        };
      });

      // 遮罩点击关闭
      document.querySelector('#settingsOverlay')?.addEventListener('click', hideSettingsPopup);

      // ── 最大化/窗口化切换 ──
      let _settingsMaximized = false;
      let _settingsPrevRect = null;
      const settingsContent = popup.querySelector('.settings-modal-content');
      const maxBtn = popup.querySelector('.settings-max-btn');
      if (maxBtn && settingsContent) {
        function _updateMaxIcon(isMaxed) {
          const svg = maxBtn.querySelector('svg');
          if (!svg) return;
          if (isMaxed) {
            svg.innerHTML = '<rect x="3" y="0" width="5" height="5" rx="0"/><rect x="0" y="4" width="5" height="5" rx="0"/>';
            maxBtn.title = '\u7A97\u53E3\u5316';
          } else {
            svg.innerHTML = '<rect x="2" y="2" width="6" height="6" rx="0"/>';
            maxBtn.title = '\u6700\u5927\u5316';
          }
        }
        maxBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          if (_settingsMaximized) {
            // 还原
            _settingsMaximized = false;
            settingsContent.style.left = (_settingsPrevRect?.left || 0) + 'px';
            settingsContent.style.top = (_settingsPrevRect?.top || 0) + 'px';
            settingsContent.style.width = (_settingsPrevRect?.width || 550) + 'px';
            settingsContent.style.height = (_settingsPrevRect?.height || 520) + 'px';
            settingsContent.style.borderRadius = '';
            settingsContent.style.border = '';
            _updateMaxIcon(false);
          } else {
            // 最大化
            _settingsPrevRect = settingsContent.getBoundingClientRect();
            _settingsMaximized = true;
            settingsContent.style.left = '0px';
            // Web 环境无自定义标题栏，不需要预留 38px
            const titleBarH = window.__ELECTRON__ ? 38 : 0;
            const taskbarH = 44;
            settingsContent.style.top = titleBarH + 'px';
            settingsContent.style.width = '100vw';
            settingsContent.style.height = 'calc(100vh - ' + taskbarH + 'px - ' + titleBarH + 'px)';
            settingsContent.style.borderRadius = '0';
            settingsContent.style.border = 'none';
            _updateMaxIcon(true);
          }
        });
      }

      // ── 自由缩放（边缘拖拽手柄）──
      if (settingsContent) {
        const edges = [
          { d:'n',  t:'0',  l:'8px', r:'8px',  b:'',   w:'',   h:'6px',  c:'ns-resize' },
          { d:'s',  t:'',   l:'8px', r:'8px',  b:'0',  w:'',   h:'6px',  c:'ns-resize' },
          { d:'e',  t:'8px',l:'',    r:'0',    b:'8px',w:'6px',h:'',    c:'ew-resize' },
          { d:'w',  t:'8px',l:'0',   r:'',     b:'8px',w:'6px',h:'',    c:'ew-resize' },
          { d:'ne', t:'0',  l:'',    r:'0',    b:'',   w:'14px',h:'14px',c:'nesw-resize' },
          { d:'nw', t:'0',  l:'0',   r:'',     b:'',   w:'14px',h:'14px',c:'nwse-resize' },
          { d:'se', t:'',   l:'',    r:'0',    b:'0',  w:'14px',h:'14px',c:'nwse-resize' },
          { d:'sw', t:'',   l:'0',   r:'',     b:'0',  w:'14px',h:'14px',c:'nesw-resize' }
        ];
        edges.forEach(e => {
          const h = document.createElement('div');
          h.className = 'modal-resize-handle modal-resize-' + e.d;
          h.style.cssText = 'position:absolute;z-index:10;pointer-events:auto;cursor:' + e.c + ';' +
            (e.t ? 'top:' + e.t + ';' : '') + (e.b ? 'bottom:' + e.b + ';' : '') +
            (e.l ? 'left:' + e.l + ';' : '') + (e.r ? 'right:' + e.r + ';' : '') +
            (e.w ? 'width:' + e.w + ';' : '') + (e.h ? 'height:' + e.h + ';' : '');
          settingsContent.appendChild(h);
          _bindResizeHandle(h, e.d);
        });
      }

      function _bindResizeHandle(handle, dir) {
        let startX, startY, startW, startH, startL, startT;
        handle.addEventListener('mousedown', function (e) {
          if (_settingsMaximized) return;
          e.preventDefault(); e.stopPropagation();
          startX = e.clientX; startY = e.clientY;
          const r = settingsContent.getBoundingClientRect();
          startW = r.width; startH = r.height; startL = r.left; startT = r.top;
          settingsContent.style.transition = 'none';  // 关闭过渡，跟手缩放
          document.body.style.userSelect = 'none';
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
        });
        function onMove(e) {
          const dx = e.clientX - startX, dy = e.clientY - startY;
          let nw = startW, nh = startH, nl = startL, nt = startT;
          if (dir.includes('e')) nw = Math.max(350, startW + dx);
          if (dir.includes('w')) { nw = Math.max(350, startW - dx); nl = startL + dx; }
          if (dir.includes('s')) nh = Math.max(280, startH + dy);
          if (dir.includes('n')) { nh = Math.max(280, startH - dy); nt = startT + dy; }
          settingsContent.style.width = nw + 'px';
          settingsContent.style.height = nh + 'px';
          settingsContent.style.left = nl + 'px';
          settingsContent.style.top = nt + 'px';
        }
        function onUp() {
          settingsContent.style.transition = '';  // 恢复过渡
          document.body.style.userSelect = '';
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        }
      }

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
            const mod = await import('../emergencyBackup.js');
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

      // ── 渲染性能：FOV ──
      const fovSlider = popup.querySelector('.fov-slider');
      const fovValueEl = popup.querySelector('.fov-value');
      if (fovSlider) {
        fovSlider.addEventListener('input', () => {
          appState.cameraFOV = parseFloat(fovSlider.value);
          if (fovValueEl) fovValueEl.textContent = fovSlider.value + '\u00B0';
          if (appState.camera) { appState.camera.fov = appState.cameraFOV; appState.camera.updateProjectionMatrix(); }
          saveSettingsToStorage();
        });
      }

      // ── 渲染性能：Bloom ──
      const bloomSlider = popup.querySelector('.bloom-slider');
      const bloomValueEl = popup.querySelector('.bloom-value');
      if (bloomSlider) {
        bloomSlider.addEventListener('input', () => {
          appState.bloomStrength = parseFloat(bloomSlider.value);
          if (bloomValueEl) bloomValueEl.textContent = appState.bloomStrength.toFixed(2);
          if (appState.bloomPass) appState.bloomPass.strength = appState.bloomStrength;
          saveSettingsToStorage();
        });
      }

      // ── 渲染性能：像素比 ──
      const pixelRatioSelect = popup.querySelector('.pixelratio-select');
      if (pixelRatioSelect) {
        pixelRatioSelect.addEventListener('change', () => {
          appState.pixelRatioCap = parseFloat(pixelRatioSelect.value);
          if (appState.renderer) appState.renderer.setPixelRatio(Math.min(window.devicePixelRatio, appState.pixelRatioCap));
          saveSettingsToStorage();
        });
      }

      // ── 渲染性能：粒子密度 ──
      const particleDensitySelect = popup.querySelector('.particle-density-select');
      if (particleDensitySelect) {
        particleDensitySelect.addEventListener('change', () => {
          appState.particleDensity = particleDensitySelect.value;
          saveSettingsToStorage();
        });
      }

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

      // ── 2D 视图：节点宽度 ──
      const nw2d = popup.querySelector('.node-width2d-input');
      if (nw2d) {
        nw2d.addEventListener('change', () => {
          appState.nodeWidth2D = parseInt(nw2d.value);
          saveSettingsToStorage();
        });
      }

      // ── 2D 视图：节点高度 ──
      const nh2d = popup.querySelector('.node-height2d-input');
      if (nh2d) {
        nh2d.addEventListener('change', () => {
          appState.nodeHeight2D = parseInt(nh2d.value);
          saveSettingsToStorage();
        });
      }

      // ── 2D 视图：水平间距 ──
      const hg2d = popup.querySelector('.hgap2d-input');
      if (hg2d) {
        hg2d.addEventListener('change', () => {
          appState.hGap2D = parseInt(hg2d.value);
          saveSettingsToStorage();
        });
      }

      // ── 2D 视图：垂直间距 ──
      const vg2d = popup.querySelector('.vgap2d-input');
      if (vg2d) {
        vg2d.addEventListener('change', () => {
          appState.vGap2D = parseInt(vg2d.value);
          saveSettingsToStorage();
        });
      }

      // ── 2D 视图：网格大小 ──
      const gs2d = popup.querySelector('.gridsize2d-input');
      if (gs2d) {
        gs2d.addEventListener('change', () => {
          appState.gridSize2D = parseInt(gs2d.value);
          saveSettingsToStorage();
        });
      }

    }
  }

  // 取消重置视角功能，改为隐藏按钮
  const resetViewBtn = document.getElementById('resetView');
  if (resetViewBtn) {
    resetViewBtn.style.display = 'none';
  }
  document.getElementById('zoomIn').onclick = () => {
    if (appState.is2DView && appState.zoom2D) {
      appState.zoom2D(1.1);
    } else {
      appState.camera.fov = Math.max(25, appState.camera.fov - 4);
      appState.camera.updateProjectionMatrix();
    }
  };
  document.getElementById('zoomOut').onclick = () => {
    if (appState.is2DView && appState.zoom2D) {
      appState.zoom2D(0.9);
    } else {
      appState.camera.fov = Math.min(70, appState.camera.fov + 4);
      appState.camera.updateProjectionMatrix();
    }
  };
  document.getElementById('saveNetworkBtn').onclick = saveAllProjects;
  document.getElementById('loadNetworkBtn').onclick = loadNetworkFromFile;
  document.getElementById('importMarkdownBtn').onclick = importMarkdownFile;
  const toggleLabelsBtn = document.getElementById('toggleLabelsBtn');
  if (toggleLabelsBtn) {
    toggleLabelsBtn.onclick = () => {
      appState.showAllLabels = !appState.showAllLabels;
      toggleLabelsBtn.style.opacity = appState.showAllLabels ? '1' : '0.4';
      toggleLabelsBtn.title = appState.showAllLabels ? '隐藏连线标签' : '显示连线标签';
      saveSettingsToStorage();
      updateLinesVis();  // 刷新 3D 连线标签可见性
      if (appState.is2DView && appState.refresh2DView) appState.refresh2DView();
      if (appState.refreshTreePanel) appState.refreshTreePanel();
    };
  }
  document.getElementById('newProjectBtn').onclick = () => {
    showPrompt("\u8BF7\u8F93\u5165\u65B0\u9879\u76EE\u540D\u79F0", "\u65B0\u77E5\u8BC6\u7F51\u7EDC", (name) => {
      if (name) createNewProject(name);
    });
  };

  // ══════════════════════════════════════════════════
  //  版本时间线（地铁线路图）模态框
  // ══════════════════════════════════════════════════
  (function initVersionMap() {
    const btn = document.getElementById('versionMapBtn');
    if (!btn) return;

    // 模态框（复用 rich-modal 样式，与设置/文本编辑器一模一样）
    const popup = document.createElement('div');
    popup.id = 'versionMapPopup';
    popup.className = 'rich-modal';
    popup.innerHTML = `
  <div class="rich-modal-content versionmap-modal-content" style="width:720px;height:480px;min-width:420px;min-height:320px;">
    <div class="rich-modal-header" style="cursor:default;">
      <h2>\uD83D\uDD70\uFE0F \u7248\u672C\u65F6\u95F4\u7EBF</h2>
      <div class="caption-buttons">
        <button class="caption-btn versionmap-min-btn" title="\u6700\u5C0F\u5316">
          <svg viewBox="0 0 10 10"><line x1="2" y1="5" x2="8" y2="5"/></svg>
        </button>
        <button class="caption-btn versionmap-max-btn" title="\u6700\u5927\u5316">
          <svg viewBox="0 0 10 10"><rect x="2" y="2" width="6" height="6" rx="0"/></svg>
        </button>
        <button class="caption-btn close versionmap-close-btn" title="\u5173\u95ED">
          <svg viewBox="0 0 10 10"><line x1="2" y1="2" x2="8" y2="8"/><line x1="8" y1="2" x2="2" y2="8"/></svg>
        </button>
      </div>
    </div>
    <div class="panel-accent-line"></div>
    <div class="versionmap-body" style="flex:1;overflow:auto;padding:16px 20px;display:flex;flex-direction:column;gap:12px;">
      <div style="font-size:12px;color:var(--text-secondary);line-height:1.5;">
        \u70B9\u51FB\u7AD9\u70B9\u53EF\u56DE\u5230\u8BE5\u7248\u672C\u3002\u5728\u5386\u53F2\u7AD9\u70B9\u7F16\u8F91\u540E\u4FDD\u5B58\uFF0C\u4F1A\u81EA\u52A8\u4EA7\u751F\u65B0\u5206\u652F\u3002
      </div>
      <div id="versionMapSVG" style="flex:1;min-height:180px;border:1px solid var(--divider);border-radius:8px;background:rgba(0,0,0,0.15);overflow:hidden;position:relative;">
      </div>
      <div style="display:flex;gap:8px;align-items:center;justify-content:space-between;">
        <div style="font-size:11px;color:var(--text-secondary);line-height:1.5;">
          \u70B9\u51FB\u7AD9\u70B9\u53EF\u56DE\u5230\u8BE5\u7248\u672C \u00B7 \u4FDD\u5B58\u9879\u76EE\u65F6\u81EA\u52A8\u4EA7\u751F\u65B0\u7AD9\u70B9 \u00B7 \u5728\u5386\u53F2\u7AD9\u7F16\u8F91\u540E\u4FDD\u5B58\u4F1A\u81EA\u52A8\u4EA7\u751F\u65B0\u5206\u652F
        </div>
        <span id="vmStatusText" style="font-size:10px;color:var(--text-secondary);flex-shrink:0;">\u52A0\u8F7D\u4E2D...</span>
      </div>
    </div>
  </div>`;
    document.body.appendChild(popup);
    window.__versionMapPopup = { popup };

    // ── 打开 ──
    function showVersionMap() {
      const mc = popup.querySelector('.versionmap-modal-content');
      if (popup.classList.contains('minimized')) {
        // 从最小化恢复
        popup.classList.remove('minimized');
        popup.classList.add('windowed');
        if (mc) {
          const tabEl = document.querySelector('.taskbar-tab[data-editor-key="versionmap"]');
          const rect = mc.getBoundingClientRect();
          let dx = 0, dy = 0, scale = 0.1;
          if (tabEl) {
            const tabRect = tabEl.getBoundingClientRect();
            dx = (tabRect.left + tabRect.width / 2) - (rect.left + rect.width / 2);
            dy = (tabRect.top + tabRect.height / 2) - (rect.top + rect.height / 2);
            scale = Math.min(40 / rect.width, 20 / rect.height);
          }
          mc.style.transform = 'translate(' + dx + 'px, ' + dy + 'px) scale(' + scale + ')';
          mc.style.opacity = '0.15';
          requestAnimationFrame(() => {
            mc.style.transition = 'transform 0.25s cubic-bezier(0.4,0,0.2,1), opacity 0.25s';
            mc.style.transform = 'translate(0,0) scale(1)';
            mc.style.opacity = '1';
            setTimeout(() => { mc.style.transition = ''; mc.style.transform = ''; }, 260);
          });
        }
        if (window.Taskbar) window.Taskbar.setEditorActive('versionmap', true);
        if (window._bringModalToFront) window._bringModalToFront(popup);
        return;
      }
      // 首次或重新打开
      popup.classList.remove('closing', 'maximized');
      popup.classList.add('windowed');
      if (mc) {
        mc.style.left = Math.max(40, (window.innerWidth - 720) / 2) + 'px';
        mc.style.top = Math.max(40, (window.innerHeight - 480) / 2) + 'px';
        mc.style.width = '720px';
        mc.style.height = '480px';
        mc.style.borderRadius = '';
        mc.style.border = '';
      }
      if (window.Taskbar) window.Taskbar.addOrUpdateEditor('versionmap', {
        icon: '🕐',
        label: '版本时间线',
        active: true,
        activate: function () {
          var isVis = popup.classList.contains('windowed') || popup.classList.contains('maximized');
          if (isVis && !popup.classList.contains('minimized')) {
            // 最小化
            const content = popup.querySelector('.versionmap-modal-content');
            if (!content) { popup.classList.add('minimized'); popup.classList.remove('windowed'); return; }
            const tabEl = document.querySelector('.taskbar-tab[data-editor-key="versionmap"]');
            const rect = content.getBoundingClientRect();
            let dx = 0, dy = 0, scale = 0.1;
            if (tabEl) {
              const tabRect = tabEl.getBoundingClientRect();
              dx = (tabRect.left + tabRect.width / 2) - (rect.left + rect.width / 2);
              dy = (tabRect.top + tabRect.height / 2) - (rect.top + rect.height / 2);
              scale = Math.min(40 / rect.width, 20 / rect.height);
            }
            const anim = content.animate([
              { transform: 'translate(0,0) scale(1)', opacity: 1 },
              { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + scale + ')', opacity: 0.15 }
            ], { duration: 250, easing: 'cubic-bezier(0.4,0,0.2,1)' });
            anim.onfinish = function () {
              popup.classList.add('minimized');
              popup.classList.remove('windowed');
              content.style.transform = '';
              if (window.Taskbar) window.Taskbar.setEditorActive('versionmap', false);
            };
          } else {
            // 恢复
            showVersionMap();
          }
        },
        close: hideVersionMap,
        maximize: function () { popup.classList.add('windowed'); popup.classList.remove('minimized'); if (window._bringModalToFront) window._bringModalToFront(popup); if (window.Taskbar) window.Taskbar.setEditorActive('versionmap', true); },
        minimize: function () {
          const content = popup.querySelector('.versionmap-modal-content');
          if (!content) { popup.classList.add('minimized'); popup.classList.remove('windowed'); return; }
          const tabEl = document.querySelector('.taskbar-tab[data-editor-key="versionmap"]');
          const rect = content.getBoundingClientRect();
          let dx = 0, dy = 0, scale = 0.1;
          if (tabEl) {
            const tabRect = tabEl.getBoundingClientRect();
            dx = (tabRect.left + tabRect.width / 2) - (rect.left + rect.width / 2);
            dy = (tabRect.top + tabRect.height / 2) - (rect.top + rect.height / 2);
            scale = Math.min(40 / rect.width, 20 / rect.height);
          }
          const anim = content.animate([
            { transform: 'translate(0,0) scale(1)', opacity: 1 },
            { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + scale + ')', opacity: 0.15 }
          ], { duration: 250, easing: 'cubic-bezier(0.4,0,0.2,1)' });
          anim.onfinish = function () {
            popup.classList.add('minimized');
            popup.classList.remove('windowed');
            content.style.transform = '';
            if (window.Taskbar) window.Taskbar.setEditorActive('versionmap', false);
          };
        }
      });
      if (window._bringModalToFront) window._bringModalToFront(popup);
    }

    // ── 关闭 ──
    function hideVersionMap() {
      if (popup.classList.contains('maximized')) {
        popup.classList.remove('maximized', 'windowed');
        if (window.Taskbar) window.Taskbar.removeEditor('versionmap');
        return;
      }
      popup.classList.add('closing');
      setTimeout(() => {
        popup.classList.remove('windowed', 'closing', 'maximized', 'minimized');
        if (window.Taskbar) window.Taskbar.removeEditor('versionmap');
      }, 200);
    }

    // ── 按钮切换 ──
    btn.addEventListener('click', () => {
      const isVisible = popup.classList.contains('windowed') || popup.classList.contains('maximized');
      if (isVisible && !popup.classList.contains('minimized')) hideVersionMap();
      else showVersionMap();
    });

    // ── 关闭按钮 ──
    popup.querySelector('.versionmap-close-btn')?.addEventListener('click', hideVersionMap);

    // ── 最小化按钮（带缩入动画）──
    popup.querySelector('.versionmap-min-btn')?.addEventListener('click', function () {
      const content = popup.querySelector('.versionmap-modal-content');
      if (!content) { popup.classList.add('minimized'); popup.classList.remove('windowed'); return; }
      const tabEl = document.querySelector('.taskbar-tab[data-editor-key="versionmap"]');
      const rect = content.getBoundingClientRect();
      let dx = 0, dy = 0, scale = 0.1;
      if (tabEl) {
        const tabRect = tabEl.getBoundingClientRect();
        dx = (tabRect.left + tabRect.width / 2) - (rect.left + rect.width / 2);
        dy = (tabRect.top + tabRect.height / 2) - (rect.top + rect.height / 2);
        scale = Math.min(40 / rect.width, 20 / rect.height);
      }
      const anim = content.animate([
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + scale + ')', opacity: 0.15 }
      ], { duration: 250, easing: 'cubic-bezier(0.4,0,0.2,1)' });
      anim.onfinish = function () {
        popup.classList.add('minimized');
        popup.classList.remove('windowed');
        content.style.transform = '';
        if (window.Taskbar) window.Taskbar.setEditorActive('versionmap', false);
      };
    });

    // ── 最大化/还原按钮 ──
    let _vmMax = false;
    let _vmPrevRect = null;
    const vmContent = popup.querySelector('.versionmap-modal-content');
    const vmMaxBtn = popup.querySelector('.versionmap-max-btn');
    function _updateMaxIcon(isMaxed) {
      const svg = vmMaxBtn?.querySelector('svg');
      if (!svg) return;
      if (isMaxed) {
        svg.innerHTML = '<rect x="3" y="0" width="5" height="5" rx="0"/><rect x="0" y="4" width="5" height="5" rx="0"/>';
        vmMaxBtn.title = '\u7A97\u53E3\u5316';
      } else {
        svg.innerHTML = '<rect x="2" y="2" width="6" height="6" rx="0"/>';
        vmMaxBtn.title = '\u6700\u5927\u5316';
      }
    }
    if (vmMaxBtn && vmContent) {
      vmMaxBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (_vmMax) {
          _vmMax = false;
          vmContent.style.left = (_vmPrevRect?.left || 0) + 'px';
          vmContent.style.top = (_vmPrevRect?.top || 0) + 'px';
          vmContent.style.width = (_vmPrevRect?.width || 720) + 'px';
          vmContent.style.height = (_vmPrevRect?.height || 480) + 'px';
          vmContent.style.borderRadius = '';
          vmContent.style.border = '';
          _updateMaxIcon(false);
        } else {
          _vmPrevRect = vmContent.getBoundingClientRect();
          _vmMax = true;
          const titleBarH = window.__ELECTRON__ ? 38 : 0;
          const taskbarH = 44;
          vmContent.style.left = '0px';
          vmContent.style.top = titleBarH + 'px';
          vmContent.style.width = '100vw';
          vmContent.style.height = 'calc(100vh - ' + taskbarH + 'px - ' + titleBarH + 'px)';
          vmContent.style.borderRadius = '0';
          vmContent.style.border = 'none';
          _updateMaxIcon(true);
        }
      });
    }

    // ── 拖动标题栏 ──
    const vmHeader = popup.querySelector('.rich-modal-header');
    if (vmHeader && vmContent) {
      let _vmDrag = false, _vmSX, _vmSY, _vmSL, _vmST;
      vmHeader.addEventListener('mousedown', function (e) {
        if (e.target.closest('.caption-buttons') || _vmMax) return;
        _vmDrag = true; _vmSX = e.clientX; _vmSY = e.clientY;
        var r = vmContent.getBoundingClientRect();
        _vmSL = r.left; _vmST = r.top;
        vmContent.style.transition = 'none';
        e.preventDefault();
      });
      document.addEventListener('mousemove', function (e) {
        if (!_vmDrag) return;
        vmContent.style.left = (_vmSL + e.clientX - _vmSX) + 'px';
        vmContent.style.top = (_vmST + e.clientY - _vmSY) + 'px';
      });
      document.addEventListener('mouseup', function () {
        if (_vmDrag) { _vmDrag = false; vmContent.style.transition = ''; }
      });
    }

    // ── 自由缩放（边缘拖拽手柄）──
    if (vmContent) {
      const edges = [
        { d:'n',  t:'0',  l:'8px', r:'8px',  b:'',   w:'',   h:'6px',  c:'ns-resize' },
        { d:'s',  t:'',   l:'8px', r:'8px',  b:'0',  w:'',   h:'6px',  c:'ns-resize' },
        { d:'e',  t:'8px',l:'',    r:'0',    b:'8px',w:'6px',h:'',    c:'ew-resize' },
        { d:'w',  t:'8px',l:'0',   r:'',     b:'8px',w:'6px',h:'',    c:'ew-resize' },
        { d:'ne', t:'0',  l:'',    r:'0',    b:'',   w:'14px',h:'14px',c:'nesw-resize' },
        { d:'nw', t:'0',  l:'0',   r:'',     b:'',   w:'14px',h:'14px',c:'nwse-resize' },
        { d:'se', t:'',   l:'',    r:'0',    b:'0',  w:'14px',h:'14px',c:'nwse-resize' },
        { d:'sw', t:'',   l:'0',   r:'',     b:'0',  w:'14px',h:'14px',c:'nesw-resize' }
      ];
      edges.forEach(function (edge) {
        var h = document.createElement('div');
        h.style.cssText = 'position:absolute;z-index:10;' +
          (edge.t ? 'top:' + edge.t + ';' : '') +
          (edge.b ? 'bottom:' + edge.b + ';' : '') +
          (edge.l ? 'left:' + edge.l + ';' : '') +
          (edge.r ? 'right:' + edge.r + ';' : '') +
          (edge.w ? 'width:' + edge.w + ';' : '') +
          (edge.h ? 'height:' + edge.h + ';' : '') +
          'cursor:' + edge.c + ';';
        h.addEventListener('mousedown', function (e) {
          if (_vmMax) return;
          e.preventDefault(); e.stopPropagation();
          var startX = e.clientX, startY = e.clientY;
          var rect = vmContent.getBoundingClientRect();
          vmContent.style.transition = 'none';
          function onMove(ev) {
            var dx = ev.clientX - startX, dy = ev.clientY - startY;
            var nl = rect.left, nt = rect.top, nw = rect.width, nh = rect.height;
            if (edge.d.includes('e')) nw = Math.max(420, rect.width + dx);
            if (edge.d.includes('w')) { nw = Math.max(420, rect.width - dx); nl = rect.left + rect.width - nw; }
            if (edge.d.includes('s')) nh = Math.max(320, rect.height + dy);
            if (edge.d.includes('n')) { nh = Math.max(320, rect.height - dy); nt = rect.top + rect.height - nh; }
            vmContent.style.left = nl + 'px'; vmContent.style.top = nt + 'px';
            vmContent.style.width = nw + 'px'; vmContent.style.height = nh + 'px';
          }
          function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            vmContent.style.transition = '';
          }
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
        });
        vmContent.appendChild(h);
      });
    }

    // ── 刷新版本图显示 ──
    async function refreshVersionMap() {
      const svgContainer = document.getElementById('versionMapSVG');
      const statusEl = document.getElementById('vmStatusText');
      if (!svgContainer) return;
      const pid = appState.currentProjectId;
      if (!pid) {
        svgContainer.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-secondary);font-size:13px;">请先打开一个项目</div>';
        if (statusEl) statusEl.textContent = '无当前项目';
        return;
      }
      try {
        const graph = await getGraph(pid);
        renderVersionMapInto(svgContainer, graph, {
          onCheckoutCommit: function (commitId) {
            handleCheckout(commitId);
          },
          onRenameCommit: async function (commitId, newName) {
            const ok = await renameCommit(pid, commitId, newName);
            if (ok) refreshVersionMap();
          }
        });
        const n = (graph.commits || []).length;
        const b = (graph.branches || []).length;
        if (statusEl) statusEl.textContent = n + ' 个站点 · ' + b + ' 条分支';
      } catch (e) {
        svgContainer.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#ff6b6b;font-size:12px;">加载失败: ' + esc(e.message) + '</div>';
        if (statusEl) statusEl.textContent = '加载失败';
      }
    }

    function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

    // ── 检出 commit（切到该版本，保留当前项目 ID 以维持版本图关联） ──
    async function handleCheckout(commitId) {
      const pid = appState.currentProjectId;
      if (!pid) return;
      showConfirm('切换到该版本？当前未保存的修改会丢失。', async () => {
        try {
          const result = await versionCheckout(pid, commitId);
          if (result && result.snapshot) {
            // 将快照转换为项目数据格式（positions 转回 Map<Vector3>）
            const snap = result.snapshot;
            const posMap = new Map();
            if (snap.positions) {
              for (const id in snap.positions) {
                const p = snap.positions[id];
                posMap.set(id, new THREE.Vector3(p.x, p.y, p.z));
              }
            }
            const data = {
              methodsTree: snap.methodsTree,
              crossEdges: snap.crossEdges || [],
              positions: posMap,
              positions2D: snap.positions2D || {},
              collapsed2D: snap.collapsed2D || [],
              nodeRichContents: snap.nodeRichContents || {},
              nodeOverlayImages: snap.nodeOverlayImages || {},
              layers: (snap.layers || []).map(l => ({
                id: l.id, name: l.name, order: l.order,
                nodeIds: new Set(l.nodeIds || []),
                positions2D: new Map(Object.entries(l.positions2D || {}))
              })),
              currentLayerId: snap.currentLayerId || null,
              treeEdgeLabels: snap.treeEdgeLabels || {},
              cameraView: snap.cameraView || { position: { x: 0, y: 4.5, z: 8 }, target: { x: 0, y: 0.2, z: 0 } }
            };
            // 更新当前项目的数据
            const proj = appState.projects.find(p => p.id === pid);
            if (proj) proj.data = data;
            // 强制重载（loadProject 会跳过相同项目，所以临时清空 currentProjectId）
            appState.currentProjectId = null;
            loadProject(pid);
            await refreshVersionMap();
          } else {
            alert('切换失败：版本数据缺失');
          }
        } catch (e) {
          alert('切换失败: ' + e.message);
        }
      });
    }

    // ── 打开时刷新 ──
    const origShowVersionMap = showVersionMap;
    showVersionMap = function () {
      origShowVersionMap();
      setTimeout(refreshVersionMap, 100);
    };

    // ── 监听版本更新事件（自动保存产生新站点时刷新面板） ──
    window.addEventListener('astroknot-version-updated', function () {
      if (popup.classList.contains('windowed') || popup.classList.contains('maximized')) {
        refreshVersionMap();
      }
    });

    // ── 监听项目切换事件（新建/切换项目时刷新面板，显示当前项目的版本图） ──
    window.addEventListener('astroknot-project-switched', function () {
      if (popup.classList.contains('windowed') || popup.classList.contains('maximized')) {
        refreshVersionMap();
      }
    });
  })();
}