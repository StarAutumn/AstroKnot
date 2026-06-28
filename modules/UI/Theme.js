// ============================================================
//  UI / Theme.js — 主题系统 + 3D 极简模式切换
// ============================================================
import * as THREE from 'three';
import { appState } from '../module0_AppState.js';

// ========== UI 主题切换 ==========
const THEMES = {
  cyan:    { accent: '#0ff', accentRgb: '0,255,255',   border: 'rgba(0,255,255,0.5)', borderSubtle: 'rgba(0,255,255,0.3)', divider: '#2c6e7e', dividerSoft: '#1c525a', btnBg: '#1a3a44', btnHover: '#2c6e7e', active: '#2c7a6e', glow: '#0ff', panelBg: 'rgba(8,18,28,0.94)', accentLight: '#aef0ff', bgDark: '#07161f', bgDarkSoft: '#111c24', gradientFrom: '#1e7a8c', gradientTo: '#0f3b48', gradientHoverFrom: '#2c9eaf', gradientHoverTo: '#1a525f' },
  green:   { accent: '#0f8', accentRgb: '0,255,136',   border: 'rgba(0,255,136,0.5)', borderSubtle: 'rgba(0,255,136,0.3)', divider: '#2c7e4e', dividerSoft: '#1c5230', btnBg: '#1a4434', btnHover: '#2c7e4e', active: '#2c7a4e', glow: '#0f8', panelBg: 'rgba(8,28,18,0.94)', accentLight: '#a0ffe0', bgDark: '#061f11', bgDarkSoft: '#112c1c', gradientFrom: '#1e8c4e', gradientTo: '#0f4826', gradientHoverFrom: '#2caf5e', gradientHoverTo: '#1a5f32' },
  orange:  { accent: '#f90', accentRgb: '255,153,0',   border: 'rgba(255,153,0,0.5)', borderSubtle: 'rgba(255,153,0,0.3)', divider: '#7e5c2c', dividerSoft: '#52381c', btnBg: '#44321a', btnHover: '#7e5c2c', active: '#7a5c2c', glow: '#f90', panelBg: 'rgba(28,18,8,0.94)', accentLight: '#ffd0a0', bgDark: '#1f1106', bgDarkSoft: '#2c1c11', gradientFrom: '#8c5e1e', gradientTo: '#482e0f', gradientHoverFrom: '#af7c2c', gradientHoverTo: '#5f421a' },
  purple:  { accent: '#b4f', accentRgb: '170,85,255',  border: 'rgba(170,85,255,0.5)', borderSubtle: 'rgba(170,85,255,0.3)', divider: '#4e2c7e', dividerSoft: '#301c52', btnBg: '#341a44', btnHover: '#4e2c7e', active: '#4a2c7a', glow: '#b4f', panelBg: 'rgba(18,8,28,0.94)', accentLight: '#cfa0ff', bgDark: '#11061f', bgDarkSoft: '#1c112c', gradientFrom: '#5e1e8c', gradientTo: '#2e0f48', gradientHoverFrom: '#7c2caf', gradientHoverTo: '#421a5f' },
  pink:    { accent: '#f5a', accentRgb: '255,85,170',  border: 'rgba(255,85,170,0.5)', borderSubtle: 'rgba(255,85,170,0.3)', divider: '#7e2c5e', dividerSoft: '#521c3e', btnBg: '#441a34', btnHover: '#7e2c5e', active: '#7a2c5e', glow: '#f5a', panelBg: 'rgba(28,8,18,0.94)', accentLight: '#ffa0d0', bgDark: '#1f0611', bgDarkSoft: '#2c111c', gradientFrom: '#8c1e5e', gradientTo: '#480f2e', gradientHoverFrom: '#af2c7c', gradientHoverTo: '#5f1a42' },
  silver:  { accent: '#aef', accentRgb: '170,200,255', border: 'rgba(170,200,255,0.5)', borderSubtle: 'rgba(170,200,255,0.3)', divider: '#3e5e7e', dividerSoft: '#2e4e6e', btnBg: '#2a3a54', btnHover: '#3e5e7e', active: '#3e5e7a', glow: '#aef', panelBg: 'rgba(12,16,28,0.94)', accentLight: '#d0e0ff', bgDark: '#0c101f', bgDarkSoft: '#181c2c', gradientFrom: '#4e6e9e', gradientTo: '#1e2e4e', gradientHoverFrom: '#6e8ebf', gradientHoverTo: '#2e3e6e' }
};

export function applyUITheme(themeName) {
  let styleId = 'ui-theme-override';
  let existing = document.getElementById(styleId);

  if (themeName === 'cyan') {
    if (existing) existing.remove();
    // 重置 CSS 变量为默认青色
    let root = document.documentElement;
    root.style.removeProperty('--accent');
    root.style.removeProperty('--accent-light');
    root.style.removeProperty('--divider');
    root.style.removeProperty('--panel-bg');
    root.style.removeProperty('--panel-border');
    root.style.removeProperty('--header-bg');
    root.style.removeProperty('--btn-bg');
    root.style.removeProperty('--btn-hover');
    root.style.removeProperty('--text-primary');
    root.style.removeProperty('--text-secondary');
    localStorage.setItem('knowledge_graph_ui_theme', 'cyan');
    document.querySelectorAll('.ui-theme-swatch').forEach(function (s) {
      s.style.border = s.dataset.theme === 'cyan' ? '2px solid #fff' : '2px solid rgba(255,255,255,0.3)';
    });
    return;
  }

  let t = THEMES[themeName];
  if (!t) return;

  localStorage.setItem('knowledge_graph_ui_theme', themeName);

  if (existing) existing.remove();

  // 更新 CSS 变量，让 var(--accent-light) / var(--divider) 等也跟随主题
  let root = document.documentElement;
  root.style.setProperty('--accent', t.accent);
  root.style.setProperty('--accent-light', t.accentLight);
  root.style.setProperty('--divider', t.divider);
  root.style.setProperty('--panel-bg', t.panelBg);
  root.style.setProperty('--panel-border', t.border);
  root.style.setProperty('--header-bg', 'rgba(0,0,0,0.45)');
  root.style.setProperty('--btn-bg', t.btnBg);
  root.style.setProperty('--btn-hover', t.btnHover);
  root.style.setProperty('--text-primary', t.accentLight);
  root.style.setProperty('--text-secondary', t.divider);

  let css = [
    '::-webkit-scrollbar-track{background:' + t.bgDark + '!important}',
    '::-webkit-scrollbar-thumb{background:rgba(' + t.accentRgb + ',0.2)!important}',
    '::-webkit-scrollbar-thumb:hover{background:rgba(' + t.accentRgb + ',0.4)!important}',
    'input{background:' + t.bgDark + '!important;border-color:' + t.divider + '!important}',
    '#info{border-left-color:' + t.accent + '!important}',
    '#controls{border-color:' + t.border + '!important}',
    '.control-btn{background:' + t.btnBg + '!important;color:' + t.accentLight + '!important}',
    '.control-btn:hover{background:' + t.btnHover + '!important}',
    '.status{color:' + t.accent + '!important;border-color:' + t.border + '!important}',
    '#globalSearchInput{border-color:' + t.border + '!important}',
    '#globalSearchInput:focus{border-color:' + t.accent + '!important}',
    '.global-search-item{border-bottom-color:rgba(' + t.accentRgb + ',0.15)!important}',
    '#aiFloatingDialog,.editor-panel,.project-panel,#quickNotesBar,#nodeContextMenu,#blankContextMenu,#moveControlBar,.rich-modal-content,.quick-editor-content,.help-modal,.global-search-dropdown,.search-dropdown,#settingsPopup{border-color:' + t.border + '!important}',
    '#aiFloatingDialog .ai-drag-header{border-color:' + t.border + '!important}',
    '.panel-header,.project-header,.quick-header,.rich-modal-header,.quick-editor-header,.help-modal-header,.move-control-header{border-bottom-color:' + t.borderSubtle + '!important}',
    '.panel-header h3,.project-header h4,.quick-header h4,#modalNodeTitle,.quick-editor-header h2,.help-modal-header h2,.menu-title,#contextNodeName,#moveControlBar .move-title{color:' + t.accent + '!important}',
    '.panel-header button,.project-header button,.quick-header button{color:' + t.accent + '!important}',
    '.panel-header button:hover,.quick-header button:hover{background:' + t.btnHover + '!important}',
    '.menu-row input[type=range]::-webkit-slider-thumb,input[type=range]::-webkit-slider-thumb{background:' + t.accent + '!important;box-shadow:0 0 8px ' + t.accent + '66!important}',
    '.menu-row input[type=color]{border-color:' + t.divider + '!important}',
    '.menu-row button{background:' + t.btnBg + '!important}',
    '.menu-row button:hover{background:' + t.btnHover + '!important}',
    '.project-item.active{border:1px solid ' + t.accent + '!important;background:' + t.btnBg + '!important;border-left-color:' + t.accent + '!important}',
    '.project-item:hover{background:' + t.btnHover + '!important}',
    '#newProjectBtn{background:' + t.btnBg + '!important}',
    '#newProjectBtn:hover{background:' + t.btnHover + '!important}',
    '.search-area input{background:' + t.bgDark + '!important;border-color:' + t.divider + '!important}',
    '#searchDropdown2{border-color:' + t.divider + '!important}',
    '#searchDropdown2 div{border-bottom-color:' + t.dividerSoft + '!important}',
    '#searchDropdown2 div:hover{background:' + t.btnHover + '!important}',
    '.editor-panel,.project-panel,#quickNotesBar{background:' + t.panelBg + '!important}',
    '#undoBtn,#redoBtn,#zoomIn,#zoomOut{background:' + t.btnBg + '!important}',
    '#undoBtn:hover,#redoBtn:hover,#zoomIn:hover,#zoomOut:hover{background:' + t.btnHover + '!important}',
    '#contextRenameInput{border-color:' + t.divider + '!important}',
    '#renameModalTitleBtn{color:' + t.accent + '!important}',
    '#addChildNodeBtn,#addNextNodeBtn,#copyNodeBtn,#pasteNodeBtn,#moveNodeBtn,#toggleChildrenContextBtn,#locateOtherViewBtn{background:' + t.divider + '!important}',
    '#nodeContextMenu .menu-title{border-bottom-color:' + t.divider + '!important}',
    '#moveControlBar button{background:' + t.btnBg + '!important}',
    '#moveControlBar button:hover{background:' + t.btnHover + '!important}',
    '.move-hint-text{color:' + t.accentLight + '!important}',
    '#closeModalBtn,.quick-editor-header button,.help-modal-header button{background:' + t.btnBg + '!important}',
    '#closeModalBtn:hover,.quick-editor-header button:hover,.help-modal-header button:hover{background:' + t.btnHover + '!important}',
    '.help-modal-body h3{color:' + t.accent + '!important}',
    '.quick-item:hover{background:' + t.btnHover + '!important}',
    '.quick-editor-toolbar{border-bottom-color:' + t.divider + '!important}',
    '.quick-editor-area{background:' + t.bgDarkSoft + '!important}',
    '.quick-editor-wordcount{background:' + t.btnBg + '!important;border-top-color:' + t.divider + '!important}',
    '.rich-modal-header,.quick-editor-header{background:' + t.btnBg + '!important}',
    '.tree-sidebar{border-right-color:' + t.divider + '!important}',
    '.tree-search{border-bottom-color:' + t.divider + '!important}',
    '.tree-search input{background:' + t.bgDark + '!important;border-color:' + t.divider + '!important}',
    '.tree-node-item:hover{background:' + t.btnBg + '!important}',
    '.tree-node-item.active{background:' + t.active + '!important}',
    '.tree-collapse-btn{background:' + t.btnBg + '!important;color:' + t.accentLight + '!important}',
    '.tree-collapse-btn:hover{background:' + t.btnHover + '!important}',
    '.resize-handle:hover,.resize-handle.active{background:' + t.border + '!important}',
    '.arrange-popup button{background:' + t.btnBg + '!important}',
    '.arrange-popup button:hover{background:' + t.btnHover + '!important}',
    '#aiFloatingDialog .ai-drag-header h4{color:' + t.accent + '!important}',
    '#aiFloatingDialog .ai-drag-header .ai-header-btn{color:' + t.accent + '!important}',
    '#aiFloatingDialog .ai-drag-header .ai-header-btn:hover{background:' + t.btnHover + '!important}',
    '#aiModelSelect{background:' + t.btnBg + '!important;color:' + t.accent + '!important}',
    '#aiModelSelect:hover{background:' + t.btnHover + '!important}',
    '#aiAgentSelect{background:' + t.btnBg + '!important;color:' + t.accent + '!important}',
    '#aiAgentSelect:hover{background:' + t.btnHover + '!important}',
    '#aiFloatingDialog .ai-chat-input textarea{background:' + t.bgDark + '!important;border-color:' + t.divider + '!important}',
    '#aiFloatingDialog .ai-chat-input textarea:focus{border-color:' + t.accent + '!important}',
    '#aiFloatingDialog .ai-send-btn{background:' + t.btnBg + '!important}',
    '#aiFloatingDialog .ai-send-btn:hover{background:' + t.btnHover + '!important}',
    '#aiFloatingDialog .ai-message.system{background:' + t.active + '!important}',
    '#ckEditorContainer .tox .tox-tbtn:hover{background:' + t.dividerSoft + '!important}',
    '#ckEditorContainer .tox .tox-tbtn--enabled,#ckEditorContainer .tox .tox-tbtn--enabled:hover{background:' + t.active + '!important}',
    '#ckEditorContainer .tox .tox-editor-header{border-bottom-color:' + t.divider + '!important}',
    '#ckEditorContainer .tox .tox-statusbar{border-top-color:' + t.divider + '!important}',
    '.tox-dialog-wrap .tox-dialog,#ckEditorContainer .tox .tox-dialog{background:#0d1f2b!important;border:1px solid ' + t.divider + '!important;border-radius:14px!important;box-shadow:0 6px 30px rgba(0,0,0,0.8)!important}',
    '.tox-dialog-wrap .tox-dialog__header,#ckEditorContainer .tox .tox-dialog__header{background:#0d1f2b!important;color:#ccd!important;border-bottom:1px solid ' + t.divider + '!important}',
    '.tox-dialog-wrap .tox-dialog__body,#ckEditorContainer .tox .tox-dialog__body{background:#0d1f2b!important;color:#ccd!important}',
    '.tox-dialog-wrap .tox-dialog__footer,#ckEditorContainer .tox .tox-dialog__footer{background:#0d1f2b!important;border-top:1px solid ' + t.divider + '!important}',
    '.tox-dialog-wrap .tox-button,#ckEditorContainer .tox .tox-button{background:' + t.dividerSoft + '!important;color:#ccd!important;border:1px solid ' + t.divider + '!important;border-radius:6px!important}',
    '.tox-dialog-wrap .tox-button:hover,#ckEditorContainer .tox .tox-button:hover{background:' + t.divider + '!important;color:#fff!important}',
    '.tox-dialog-wrap .tox-button--primary,#ckEditorContainer .tox .tox-button--primary{background:' + t.divider + '!important;border:none!important;color:#fff!important;font-weight:bold!important}',
    '#ckEditorContainer .tox .tox-listboxfield .tox-listbox--select,#ckEditorContainer .tox .tox-textfield,#ckEditorContainer .tox .tox-toolbar-textfield,#ckEditorContainer .tox select{border-color:' + t.divider + '!important}',
    '#ckEditorContainer .tox .tox-collection--list .tox-collection__item--enabled{background:' + t.active + '!important}',
    '#ckEditorContainer .tox .tox-menu{border-color:' + t.divider + '!important}',
    '#ckEditorContainer .tox .tox-collection__item:hover{background:' + t.dividerSoft + '!important}',
    '#ckEditorContainer .tox .tox-tbtn[title="展开/折叠工具栏"]{background:' + t.btnHover + '!important;color:' + t.accentLight + '!important}',
    '.tmce-resize-handle{background:' + t.divider + '!important;border-color:' + t.accentLight + '!important}',
    '.tmce-resize-handle:hover{background:' + t.btnHover + '!important}',
    '.oly-resize-handle{background:' + t.divider + '!important;border-color:' + t.accentLight + '!important}',
    '.oly-resize-handle:hover{background:' + t.btnHover + '!important;border-color:#fff!important}',
    '#olyContextMenu{background:#0d1f2b!important;border-color:' + t.divider + '!important}',
    '#olyEditorPanel{background:#0d1f2b!important;border-color:' + t.divider + '!important}',
    '#customConfirmModal>div,#customPromptModal>div{border-color:' + t.divider + '!important}',
    '#confirmOkBtn,#promptOkBtn{background:' + t.divider + '!important}',
    '#promptInputField{background:' + t.bgDark + '!important;border-color:' + t.divider + '!important}',
    // ── 任务栏 ──
    '#taskbar{background:' + t.panelBg + '!important;border-top-color:' + t.borderSubtle + '!important;box-shadow:0 -4px 20px rgba(0,0,0,0.5),0 0 0 1px rgba(' + t.accentRgb + ',0.06) inset,0 -1px 12px rgba(' + t.accentRgb + ',0.15),0 -2px 30px rgba(' + t.accentRgb + ',0.06)!important}',
    '.taskbar-left{border-right-color:' + t.borderSubtle + '!important}',
    '#taskbarClock{color:' + t.accentLight + '!important}',
    '#taskbarWeather{color:' + t.accentLight + '!important}',
    '#weatherCtxMenu .ctx-item:hover{background:rgba(' + t.accentRgb + ',0.12)!important}',
    // ── 任务栏标签 ──
    '.taskbar-tab{background:' + t.btnBg + '!important;border-color:' + t.dividerSoft + '!important}',
    '.taskbar-tab:hover{background:' + t.btnHover + '!important}',
    '.taskbar-tab.active{background:' + t.active + '!important;border-color:' + t.borderSubtle + '!important}',
    '.taskbar-tab .tab-close:hover{background:' + t.btnHover + '!important}',
    // ── 任务栏搜索 ──
    '.taskbar-search-container input{background:' + t.bgDark + '!important;border-color:' + t.divider + '!important;color:' + t.accentLight + '!important}',
    '.taskbar-search-container input:focus{border-color:' + t.accent + '!important}',
    '.taskbar-search-container input.node-selected{border-color:' + t.accent + '!important}',
    '.taskbar-search-container .search-dropdown{background:' + t.panelBg + '!important;border-color:' + t.divider + '!important}',
    '.taskbar-search-container .search-dropdown div{border-bottom-color:' + t.dividerSoft + '!important}',
    '.taskbar-search-container .search-dropdown div:hover{background:' + t.btnHover + '!important}',
    // ── Dock 面板 ──
    '.dock-panel{background:' + t.panelBg + '!important;border-color:' + t.border + '!important}',
    '.dock-panel-header{border-bottom-color:' + t.borderSubtle + '!important}',
    '.dock-panel-title{color:' + t.accent + '!important}',
    '.dock-panel-add-btn{background:' + t.btnBg + '!important;color:' + t.accent + '!important}',
    '.dock-panel-add-btn:hover{background:' + t.btnHover + '!important}',
    '.dock-panel-item{background:' + t.btnBg + '!important}',
    '.dock-panel-item:hover{background:' + t.btnHover + '!important}',
    '.dock-panel-item.selected{border-color:' + t.accent + '!important;background:' + t.active + '!important}',
    '.dock-panel-item .dock-label{color:' + t.accentLight + '!important}',
    // ── Dock 右键菜单 ──
    '.dock-context-menu{background:' + t.panelBg + '!important;border-color:' + t.divider + '!important}',
    '.dock-context-item{color:' + t.accentLight + '!important}',
    '.dock-context-item:hover{background:' + t.btnHover + '!important}',
    '.dock-context-separator{border-top-color:' + t.dividerSoft + '!important}',
    // ── Dock 滚动条 ──
    '.dock-panel-items::-webkit-scrollbar-track{background:transparent!important}',
    '.dock-panel-items::-webkit-scrollbar-thumb{background:rgba(' + t.accentRgb + ',0.2)!important}',
    '.dock-panel-items::-webkit-scrollbar-thumb:hover{background:rgba(' + t.accentRgb + ',0.4)!important}',
    // ── 设置面板 ──
    '#settingsPopup{background:' + t.panelBg + '!important;border-color:' + t.border + '!important}',
    '#settingsPopup .settings-header{background:' + t.btnBg + '!important;border-bottom-color:' + t.borderSubtle + '!important}',
    '#settingsPopup .settings-header h3{color:' + t.accent + '!important}',
    '#settingsPopup .settings-header .settings-close-btn{color:' + t.accentLight + '!important}',
    '#settingsPopup .settings-header .settings-close-btn:hover{background:' + t.btnHover + '!important}',
    '#settingsPopup .settings-body select{border-color:' + t.divider + '!important;color:' + t.accentLight + '!important}',
    '#settingsPopup .settings-body select option{background:' + t.bgDark + '!important}',
    // ── Toggle Switch ──
    '.toggle-slider{background:' + t.btnBg + '!important;border-color:' + t.borderSubtle + '!important}',
    '.toggle-slider::before{background:' + t.divider + '!important}',
    '.toggle-switch input:checked + .toggle-slider{background:rgba(' + t.accentRgb + ',0.15)!important;border-color:' + t.border + '!important;box-shadow:0 0 8px rgba(' + t.accentRgb + ',0.2)!important}',
    '.toggle-switch input:checked + .toggle-slider::before{background:' + t.accent + '!important;box-shadow:0 0 6px rgba(' + t.accentRgb + ',0.5)!important}',
    // ── 缩放弹出 ──
    '.zoom-popup{background:' + t.panelBg + '!important;border-color:' + t.border + '!important}',
    '.zoom-popup button{background:' + t.btnBg + '!important;color:' + t.accentLight + '!important}',
    '.zoom-popup button:hover{background:' + t.btnHover + '!important}',
    // ── 时钟/日期 ──
    '#clockTime{color:' + t.accentLight + '!important}',
    '#clockDate{color:' + t.divider + '!important}',
    // ── 滑动条轨道 ──
    'input[type="range"]::-webkit-slider-runnable-track{background:' + t.bgDark + '!important;border-color:rgba(' + t.accentRgb + ',0.15)!important}',
    'input[type="range"]::-moz-range-track{background:' + t.bgDark + '!important;border-color:rgba(' + t.accentRgb + ',0.15)!important}',
    'input[type="range"]::-webkit-slider-thumb{background:' + t.accent + '!important;box-shadow:0 0 8px rgba(' + t.accentRgb + ',0.45)!important}',
    'input[type="range"]:hover::-webkit-slider-thumb{box-shadow:0 0 14px rgba(' + t.accentRgb + ',0.7)!important}',
    'input[type="range"]::-moz-range-thumb{background:' + t.accent + '!important;box-shadow:0 0 8px rgba(' + t.accentRgb + ',0.45)!important}',
    'input[type="range"]:hover::-moz-range-thumb{box-shadow:0 0 14px rgba(' + t.accentRgb + ',0.7)!important}',
    // ── 富文本编辑器 ──
    '#ckEditorContainer{background:' + t.bgDark + '!important}',
    '#ckEditorContainer .tox .tox-toolbar,#ckEditorContainer .tox .tox-toolbar__primary{background:' + t.bgDarkSoft + '!important;border-bottom-color:' + t.divider + '!important}',
    '#ckEditorContainer .tox .tox-tbtn{color:' + t.accentLight + '!important}',
    '#ckEditorContainer .tox .tox-tbtn:hover{background:' + t.dividerSoft + '!important;color:#fff!important}',
    '#ckEditorContainer .tox .tox-tbtn--enabled,#ckEditorContainer .tox .tox-tbtn--enabled:hover{background:' + t.active + '!important;color:#fff!important}',
    '#ckEditorContainer .tox .tox-tbtn svg{fill:' + t.accentLight + '!important}',
    '#ckEditorContainer .tox .tox-tbtn:hover svg{fill:#fff!important}',
    '#ckEditorContainer .tox .tox-tbtn--enabled svg{fill:#fff!important}',
    '#ckEditorContainer .tox .tox-edit-area__iframe{background:' + t.bgDark + '!important}',
    '#ckEditorContainer .tox .tox-editor-header{border-bottom-color:' + t.divider + '!important;background:' + t.bgDarkSoft + '!important}',
    '#ckEditorContainer #tinymce-editor-textarea.mce-content-body{background:' + t.bgDark + '!important;color:' + t.accentLight + '!important}',
    '#ckEditorContainer .tox .tox-statusbar{border-top-color:' + t.divider + '!important;background:' + t.bgDarkSoft + '!important}',
    '#ckEditorContainer .tox .tox-split-button:hover{background:' + t.dividerSoft + '!important}',
    '#ckEditorContainer .tox .tox-tbtn--select{color:' + t.accentLight + '!important}',
    '#ckEditorContainer .tox .tox-listboxfield .tox-listbox--select{border-color:' + t.divider + '!important}',
    '#ckEditorContainer .tox .tox-listbox--select .tox-listbox__select-label{color:' + t.accentLight + '!important}',
    '#ckEditorContainer .tox .tox-charmap button{background:' + t.btnBg + '!important;border-color:' + t.dividerSoft + '!important;color:' + t.accentLight + '!important}',
    '#ckEditorContainer .tox .tox-charmap button:hover{background:' + t.btnHover + '!important}',
    '#ckEditorContainer .tox .tox-emoticons button{background:' + t.btnBg + '!important;border-color:' + t.dividerSoft + '!important;color:' + t.accentLight + '!important}',
    '#ckEditorContainer .tox .tox-emoticons button:hover{background:' + t.btnHover + '!important}',
    '#ckEditorContainer .tox .tox-searchreplace input{background:' + t.bgDark + '!important;border-color:' + t.divider + '!important;color:' + t.accentLight + '!important}',
    '#ckEditorContainer .tox .tox-menu,.tox-tinymce-aux .tox-menu{background:' + t.panelBg + '!important;border-color:' + t.divider + '!important}',
    '#ckEditorContainer .tox .tox-collection--list .tox-collection__item{color:' + t.accentLight + '!important}',
    '#ckEditorContainer .tox .tox-collection--list .tox-collection__item--enabled{background:' + t.active + '!important}',
    '#ckEditorContainer .tox .tox-collection__item:hover{background:' + t.dividerSoft + '!important}',
    '#ckEditorContainer .tox .tox-tbtn[title="展开/折叠工具栏"]{background:' + t.btnHover + '!important;color:' + t.accentLight + '!important}',
    '#ckEditorContainer .tox .tox-tbtn.tox-tbtn--select.tox-tbtn--bespoke .tox-tbtn__select-label{color:' + t.accentLight + '!important}',
    '#ckEditorContainer .tox .tox-tbtn.tox-tbtn--select.tox-tbtn--bespoke .tox-tbtn__select-chevron{color:' + t.accentLight + '!important}',
    '#ckEditorContainer .mce-content-body pre{background:' + t.bgDarkSoft + '!important;border-color:' + t.divider + '!important}',
    '#ckEditorContainer .tmce-code-wrapper .tmce-line-numbers{background:' + t.bgDarkSoft + '!important;border-right-color:' + t.divider + '!important;color:' + t.divider + '!important}',
    '#ckEditorContainer .tmce-code-wrapper .tmce-code-area{background:' + t.bgDark + '!important;color:' + t.accentLight + '!important}',
    // ── TinyMCE 对话框 ──
    '.tox-dialog-wrap .tox-dialog,#ckEditorContainer .tox .tox-dialog{background:' + t.bgDarkSoft + '!important;border-color:' + t.divider + '!important}',
    '.tox-dialog-wrap .tox-dialog__header,#ckEditorContainer .tox .tox-dialog__header{background:' + t.bgDarkSoft + '!important;color:' + t.accentLight + '!important;border-bottom-color:' + t.dividerSoft + '!important}',
    '.tox-dialog-wrap .tox-dialog__title,#ckEditorContainer .tox .tox-dialog__title{color:' + t.accentLight + '!important}',
    '.tox-dialog-wrap .tox-dialog__body,#ckEditorContainer .tox .tox-dialog__body{background:' + t.bgDarkSoft + '!important;color:' + t.accentLight + '!important}',
    '.tox-dialog-wrap .tox-dialog__body .tox-dialog__body-content,#ckEditorContainer .tox .tox-dialog__body .tox-dialog__body-content{background:' + t.bgDarkSoft + '!important;color:' + t.accentLight + '!important}',
    '.tox-dialog-wrap .tox-dialog__footer,#ckEditorContainer .tox .tox-dialog__footer{background:' + t.bgDarkSoft + '!important;border-top-color:' + t.dividerSoft + '!important}',
    '.tox-dialog-wrap .tox-button,#ckEditorContainer .tox .tox-button{background:' + t.btnBg + '!important;color:' + t.accentLight + '!important;border-color:' + t.divider + '!important}',
    '.tox-dialog-wrap .tox-button:hover,#ckEditorContainer .tox .tox-button:hover{background:' + t.btnHover + '!important;color:#fff!important}',
    '.tox-dialog-wrap .tox-button--primary,#ckEditorContainer .tox .tox-button--primary{background:' + t.active + '!important;border:none!important;color:#fff!important}',
    '.tox-dialog-wrap .tox-button--primary:hover,#ckEditorContainer .tox .tox-button--primary:hover{background:' + t.btnHover + '!important}',
    '.tox-dialog-wrap .tox-listboxfield .tox-listbox--select,.tox-dialog-wrap .tox-textfield,.tox-dialog-wrap .tox-toolbar-textfield,.tox-dialog-wrap select,#ckEditorContainer .tox .tox-listboxfield .tox-listbox--select,#ckEditorContainer .tox .tox-textfield,#ckEditorContainer .tox .tox-toolbar-textfield,#ckEditorContainer .tox select{background:' + t.bgDark + '!important;border-color:' + t.divider + '!important;color:' + t.accentLight + '!important}',
    // ── 图层总览 ──
    '.layer-overview-bg{background:radial-gradient(ellipse at center,rgba(' + t.accentRgb + ',0.06) 0%,rgba(0,5,15,0.98) 70%)!important}',
    '.layer-overview-title{color:' + t.accent + '!important;text-shadow:0 0 20px rgba(' + t.accentRgb + ',0.4)!important}',
    '.layer-overview-hint{color:' + t.divider + '!important}',
    '.layer-card{border-color:rgba(' + t.accentRgb + ',0.28)!important;border-bottom-color:rgba(' + t.accentRgb + ',0.25)!important;box-shadow:0 0 8px rgba(' + t.accentRgb + ',0.12),0 0 20px rgba(' + t.accentRgb + ',0.08),inset 0 0 30px rgba(' + t.accentRgb + ',0.04)!important}',
    '.layer-card:hover{border-color:rgba(' + t.accentRgb + ',0.7)!important;border-bottom-color:rgba(' + t.accentRgb + ',0.6)!important;box-shadow:0 0 14px rgba(' + t.accentRgb + ',0.3),0 0 30px rgba(' + t.accentRgb + ',0.2),0 0 50px rgba(' + t.accentRgb + ',0.15),inset 0 0 40px rgba(' + t.accentRgb + ',0.1)!important}',
    '.layer-card.active{border-color:rgba(' + t.accentRgb + ',0.7)!important;border-bottom-color:rgba(' + t.accentRgb + ',0.55)!important;box-shadow:0 0 10px rgba(' + t.accentRgb + ',0.2),0 0 25px rgba(' + t.accentRgb + ',0.15),0 0 45px rgba(' + t.accentRgb + ',0.1),0 0 0 2px rgba(' + t.accentRgb + ',0.12),inset 0 0 35px rgba(' + t.accentRgb + ',0.06)!important}',
    '.layer-paper-row.drag-over .layer-card{border-color:rgba(' + t.accentRgb + ',0.9)!important;border-bottom-color:rgba(' + t.accentRgb + ',0.8)!important;box-shadow:0 0 14px rgba(' + t.accentRgb + ',0.4),0 0 30px rgba(' + t.accentRgb + ',0.25),0 0 50px rgba(' + t.accentRgb + ',0.15),inset 0 0 40px rgba(' + t.accentRgb + ',0.12)!important}',
    '.layer-label-name{color:' + t.accentLight + '!important}',
    '.layer-card:hover~.layer-paper-label .layer-label-name,.layer-paper-row:hover .layer-label-name{color:' + t.accent + '!important}',
    '.layer-overview-btn{background:rgba(' + t.accentRgb + ',0.25)!important;border-color:rgba(' + t.accentRgb + ',0.4)!important}',
    '.layer-overview-btn:hover{background:rgba(' + t.accentRgb + ',0.45)!important;border-color:rgba(' + t.accentRgb + ',0.7)!important}',
    // ── 图层管理面板 ──
    '.tree-sidebar{background:' + t.panelBg + '!important;border-right-color:' + t.divider + '!important}',
    '.tree-search{border-bottom-color:' + t.divider + '!important}',
    '.tree-search input{background:' + t.bgDark + '!important;border-color:' + t.divider + '!important;color:' + t.accentLight + '!important}',
    '.tree-node-item:hover{background:' + t.btnBg + '!important}',
    '.tree-node-item.active{background:' + t.active + '!important}',
    '.tree-collapse-btn{background:' + t.btnBg + '!important;color:' + t.accentLight + '!important}',
    '.tree-collapse-btn:hover{background:' + t.btnHover + '!important}'
  ].join('\n');

  let style = document.createElement('style');
  style.id = styleId;
  style.textContent = css;
  document.head.appendChild(style);

  document.querySelectorAll('.ui-theme-swatch').forEach(function (s) {
    s.style.border = s.dataset.theme === themeName ? '2px solid #fff' : '2px solid rgba(255,255,255,0.3)';
  });
}

// ========== 浅色/深色模式切换 ==========
export function applyUIMode(mode) {
  const isLight = mode === 'light';
  document.body.classList.toggle('light-mode', isLight);
  document.documentElement.classList.toggle('light-mode', isLight);

  // 清除旧主题色板在 documentElement 上设置的内联 CSS 变量
  const varsToClean = ['--accent', '--accent-light', '--divider', '--panel-bg', '--panel-border',
    '--header-bg', '--btn-bg', '--btn-hover', '--text-primary', '--text-secondary'];
  varsToClean.forEach(v => document.documentElement.style.removeProperty(v));

  // 移除旧的主题色板覆盖样式
  const oldThemeStyle = document.getElementById('ui-theme-override');
  if (oldThemeStyle) oldThemeStyle.remove();

  // 移除富文本编辑器浅色覆盖（改用全局反色滤镜，不再需要）
  const richOverride = document.getElementById(RICH_EDITOR_LIGHT_OVERRIDE_ID);
  if (richOverride) richOverride.remove();

  // 浅色模式：关闭装饰效果
  if (isLight) {
    document.body.classList.add('no-header-circuit', 'no-header-circuit-anim');
    const tb = document.getElementById('taskbar');
    if (tb) tb.classList.add('no-rainbow');
    // 农历/天气弹窗：反色滤镜会自动处理，清除内联样式让滤镜生效
    ['lunarPopup', 'weatherPopup'].forEach(id => {
      const p = document.getElementById(id);
      if (p) {
        p.style.background = '';
        p.style.borderColor = '';
        p.style.color = '';
        p.style.boxShadow = '';
      }
    });
  } else {
    // 深色模式：恢复用户设置
    document.body.classList.toggle('no-header-circuit', appState.headerCircuit === false);
    document.body.classList.toggle('no-header-circuit-anim', appState.headerCircuitAnim === false);
    const tb = document.getElementById('taskbar');
    if (tb) tb.classList.toggle('no-rainbow', appState.taskbarRainbow === false);
    // 恢复弹窗内联样式
    ['lunarPopup', 'weatherPopup'].forEach(id => {
      const p = document.getElementById(id);
      if (p) {
        p.style.background = 'rgba(10, 20, 30, 0.93)';
        p.style.borderColor = 'rgba(0, 255, 255, 0.2)';
        p.style.color = '#b0d8ee';
        p.style.boxShadow = '0 4px 20px rgba(0,0,0,0.5)';
      }
    });
    // 深色模式下恢复旧的主题色（如果有保存）
    const savedTheme = localStorage.getItem('knowledge_graph_ui_theme');
    if (savedTheme && savedTheme !== 'cyan') {
      applyUITheme(savedTheme);
    }
  }

  localStorage.setItem('astroknot_ui_mode', mode);
}

// ========== 富文本编辑器 + TinyMCE 浅色模式（统一 <style> 注入） ==========
const RICH_EDITOR_LIGHT_OVERRIDE_ID = 'rich-editor-light-override';

function applyRichEditorLightMode(isLight) {
  const existing = document.getElementById(RICH_EDITOR_LIGHT_OVERRIDE_ID);
  if (existing) existing.remove();
  if (!isLight) return;

  const css = `
/* ═══ 富文本编辑器容器 ═══ */
#ckEditorContainer { background: rgba(225,238,248,0.98) !important; }
#richToolbar { background: transparent !important; }
#toolbarDock { background: transparent !important; }

/* ═══ 标签栏（文件标签） ═══ */
.editor-tab-bar {
  background: #c8dce8 !important;
  border-bottom-color: rgba(0,100,160,0.2) !important;
}
.editor-tab-bar::-webkit-scrollbar-thumb { background: rgba(0,100,160,0.3) !important; }
.editor-tab {
  border-right-color: rgba(0,100,160,0.15) !important;
  color: #3a5a72 !important;
}
.editor-tab:hover {
  background: rgba(0,100,160,0.08) !important;
  color: #102433 !important;
}
.editor-tab.active {
  background: rgba(0,100,160,0.12) !important;
  color: #006fa0 !important;
}
.editor-tab .tab-close { color: #6a8a9a !important; }
.editor-tab .tab-close:hover {
  background: rgba(200,60,60,0.15) !important;
  color: #cc4444 !important;
}

/* ═══ 目录侧边栏 ═══ */
.tree-sidebar {
  background: #e2ecf4 !important;
  border-right-color: rgba(0,100,160,0.2) !important;
}
.tree-search input {
  background: #eef3f8 !important;
  border-color: rgba(0,100,160,0.25) !important;
  color: #102433 !important;
}
.tree-node-item { color: #102433 !important; }
.tree-node-item:hover { background: rgba(0,100,160,0.06) !important; }
.tree-node-item.active { background: rgba(0,100,160,0.1) !important; color: #006fa0 !important; }
.tree-collapse-btn { background: #c8dce8 !important; color: #4a6a7a !important; }

/* ═══ 分割线 ═══ */
#splitDivider { background: #c0d4e6 !important; }
#treeResizeHandle { background: #d0dde8 !important; }

/* ═══ TinyMCE oxide-dark 强制浅色 ═══ */
.tox .tox-toolbar,
.tox .tox-toolbar__primary,
.tox .tox-toolbar__overflow {
  background: #d8e4ef !important;
  border-bottom: 1px solid #b0c8dc !important;
}
.tox .tox-editor-header { background: #d8e4ef !important; }
.tox .tox-toolbar__group { border-right-color: #c0d4e6 !important; }
.tox .tox-tbtn { color: #1a3a52 !important; background: transparent !important; }
.tox .tox-tbtn:hover { background: rgba(0,100,160,0.1) !important; color: #006fa0 !important; }
.tox .tox-tbtn--enabled,
.tox .tox-tbtn--enabled:hover { background: rgba(0,100,160,0.15) !important; color: #006fa0 !important; }
.tox .tox-tbtn svg { fill: #4a6a82 !important; }
.tox .tox-tbtn:hover svg { fill: #006fa0 !important; }
.tox .tox-tbtn--enabled svg { fill: #006fa0 !important; }
.tox .tox-split-button { color: #1a3a52 !important; background: transparent !important; }
.tox .tox-split-button:hover { background: rgba(0,100,160,0.1) !important; }
.tox .tox-split-button svg { fill: #4a6a82 !important; }
.tox .tox-toolbar-textfield,
.tox .tox-toolbar-textfield:focus {
  background: #e8f0f6 !important;
  border-color: #9cc0d8 !important;
  color: #1a3a52 !important;
}
.tox .tox-dialog { background: #edf3f8 !important; border-color: #b0c8dc !important; box-shadow: 0 8px 32px rgba(0,30,60,0.18) !important; }
.tox .tox-dialog__header { background: #d8e4ef !important; border-bottom-color: #c0d4e6 !important; }
.tox .tox-dialog__title { color: #1a3a52 !important; }
.tox .tox-dialog__body { background: #edf3f8 !important; color: #1a3a52 !important; }
.tox .tox-dialog__footer { background: #d8e4ef !important; border-top-color: #c0d4e6 !important; }
.tox .tox-dialog__close svg { fill: #5a7a92 !important; }
.tox .tox-dialog__close:hover svg { fill: #cc3333 !important; }
.tox .tox-textfield,
.tox .tox-select select,
.tox .tox-listboxfield .tox-listbox--select {
  background: #e8f0f6 !important;
  border-color: #9cc0d8 !important;
  color: #1a3a52 !important;
}
.tox .tox-textfield:focus,
.tox .tox-select select:focus { border-color: #006fa0 !important; box-shadow: 0 0 4px rgba(0,111,160,0.2) !important; }
.tox .tox-button { background: #d0dde8 !important; border-color: #b0c8dc !important; color: #1a3a52 !important; }
.tox .tox-button:hover { background: #bcd0e0 !important; }
.tox .tox-button--primary { background: #006fa0 !important; border-color: #006fa0 !important; color: #fff !important; }
.tox .tox-button--primary:hover { background: #005a88 !important; }
.tox .tox-button[disabled] { background: #e0e8ee !important; color: #8aa0b0 !important; border-color: #d0dde8 !important; }
.tox .tox-collection__item { color: #1a3a52 !important; }
.tox .tox-collection__item:hover { background: rgba(0,100,160,0.08) !important; }
.tox .tox-collection__item--enabled { background: rgba(0,100,160,0.12) !important; color: #006fa0 !important; }
.tox .tox-collection--list { background: #edf3f8 !important; border-color: #b0c8dc !important; }
.tox .tox-tab { color: #4a6a82 !important; }
.tox .tox-tab:hover { color: #006fa0 !important; }
.tox .tox-tab--active { color: #006fa0 !important; border-bottom-color: #006fa0 !important; }
.tox .tox-checkbox__label { color: #1a3a52 !important; }
.tox .tox-checkbox__icons svg { fill: #4a6a82 !important; }
.tox .tox-checkbox__icons.selected svg { fill: #006fa0 !important; }
.tox .tox-swatch { border-color: rgba(0,0,0,0.12) !important; }
.tox .tox-label { color: #3a5a72 !important; }
.tox .tox-collection__item-separator { border-top-color: #d0dde8 !important; }
.tox .tox-searchreplace .tox-form__group input {
  background: #e8f0f6 !important;
  border-color: #9cc0d8 !important;
  color: #1a3a52 !important;
}
/* 工具栏折叠按钮 */
#toolbarDock [data-toolbar-toggle] { color: #3a5a72 !important; }
/* 工具栏分组标题伪元素（字体/段落/编辑） */
#toolbarDock .tox-toolbar-overlord .tox-toolbar::before { color: #3a5a72 !important; }
`;
  const style = document.createElement('style');
  style.id = RICH_EDITOR_LIGHT_OVERRIDE_ID;
  style.textContent = css;
  document.head.appendChild(style);
  console.log('[浅色模式] 富文本编辑器浅色样式已注入，规则数:', css.split('!important').length - 1);
}

// ========== 设置持久化（localStorage） ==========
const SETTINGS_STORAGE_KEY = 'astroknot_settings';

export function saveSettingsToStorage() {
  const settings = {
    nodeGlowOpacity: appState.nodeGlowOpacity,
    skyBrightness: appState.skyBrightness,
    skySaturation: appState.skySaturation,
    skyRotationSpeed: appState.skyRotationSpeed,
    surfaceGlowOpacity: appState.surfaceGlowOpacity,
    ringGlowOpacity: appState.ringGlowOpacity,
    ringRotationSpeed: appState.ringRotationSpeed,
    lineGlowOpacity: appState.lineGlowOpacity,
    particleVisible: appState.particleVisible,
    meteorVisible: appState.meteorVisible,
    ringVisible: appState.ringVisible,
    simple3D: appState.simple3D,
    startupMode: appState.startupMode || '3d_full',
    startupWindowMode: appState.startupWindowMode || 'windowed',
    simpleBgColor: appState.simpleBgColor,
    bgColor2D: appState.bgColor2D,
    gridColor2D: appState.gridColor2D,
    currentProjectSavePath: appState.currentProjectSavePath || null,
    quickNoteSavePath: appState.quickNoteSavePath || null,
    editorFontSize: appState.editorFontSize ?? 14,
    editorLightMode: appState.editorLightMode ?? false,
    editorPageView: appState.editorPageView ?? false,
    bloomStrength: appState.bloomStrength ?? 0.2,
    particleDensity: appState.particleDensity ?? 'high',
    cameraFOV: appState.cameraFOV ?? 40,
    pixelRatioCap: appState.pixelRatioCap ?? 1.5,
    nodeWidth2D: appState.nodeWidth2D ?? 120,
    nodeHeight2D: appState.nodeHeight2D ?? 40,
    hGap2D: appState.hGap2D ?? 60,
    vGap2D: appState.vGap2D ?? 20,
    gridSize2D: appState.gridSize2D ?? 40,
    taskbarRainbow: appState.taskbarRainbow ?? true,
    headerCircuit: appState.headerCircuit ?? true,
    headerCircuitAnim: appState.headerCircuitAnim ?? true,
    uiMode: appState.uiMode ?? 'dark',
    emergencyBackupInterval: appState.emergencyBackupInterval ?? 2,
  };
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {}
}

function loadSettingsFromStorage() {
  let raw;
  try {
    raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
  } catch {}
  if (!raw) return;
  let saved;
  try { saved = JSON.parse(raw); } catch { return; }
  if (typeof saved.nodeGlowOpacity === 'number') appState.nodeGlowOpacity = saved.nodeGlowOpacity;
  if (typeof saved.skyBrightness === 'number') appState.skyBrightness = saved.skyBrightness;
  if (typeof saved.skySaturation === 'number') appState.skySaturation = saved.skySaturation;
  if (typeof saved.skyRotationSpeed === 'number') appState.skyRotationSpeed = saved.skyRotationSpeed;
  if (typeof saved.surfaceGlowOpacity === 'number') appState.surfaceGlowOpacity = saved.surfaceGlowOpacity;
  if (typeof saved.ringGlowOpacity === 'number') appState.ringGlowOpacity = saved.ringGlowOpacity;
  if (typeof saved.ringRotationSpeed === 'number') appState.ringRotationSpeed = saved.ringRotationSpeed;
  if (typeof saved.lineGlowOpacity === 'number') appState.lineGlowOpacity = saved.lineGlowOpacity;
  if (typeof saved.particleVisible === 'boolean') appState.particleVisible = saved.particleVisible;
  if (typeof saved.meteorVisible === 'boolean') appState.meteorVisible = saved.meteorVisible;
  if (typeof saved.ringVisible === 'boolean') appState.ringVisible = saved.ringVisible;
  if (typeof saved.simple3D === 'boolean') appState.simple3D = saved.simple3D;
  if (saved.startupMode) appState.startupMode = saved.startupMode;
  if (saved.startupWindowMode) appState.startupWindowMode = saved.startupWindowMode;
  if (saved.simpleBgColor) appState.simpleBgColor = saved.simpleBgColor;
  if (saved.bgColor2D) appState.bgColor2D = saved.bgColor2D;
  if (saved.gridColor2D) appState.gridColor2D = saved.gridColor2D;
  if (saved.currentProjectSavePath !== undefined) appState.currentProjectSavePath = saved.currentProjectSavePath;
  if (saved.quickNoteSavePath !== undefined) appState.quickNoteSavePath = saved.quickNoteSavePath;
  if (typeof saved.editorFontSize === 'number') appState.editorFontSize = saved.editorFontSize;
  if (typeof saved.editorLightMode === 'boolean') appState.editorLightMode = saved.editorLightMode;
  if (typeof saved.editorPageView === 'boolean') appState.editorPageView = saved.editorPageView;
  if (typeof saved.bloomStrength === 'number') appState.bloomStrength = saved.bloomStrength;
  if (saved.particleDensity) appState.particleDensity = saved.particleDensity;
  if (typeof saved.cameraFOV === 'number') appState.cameraFOV = saved.cameraFOV;
  if (typeof saved.pixelRatioCap === 'number') appState.pixelRatioCap = saved.pixelRatioCap;
  if (typeof saved.nodeWidth2D === 'number') appState.nodeWidth2D = saved.nodeWidth2D;
  if (typeof saved.nodeHeight2D === 'number') appState.nodeHeight2D = saved.nodeHeight2D;
  if (typeof saved.hGap2D === 'number') appState.hGap2D = saved.hGap2D;
  if (typeof saved.vGap2D === 'number') appState.vGap2D = saved.vGap2D;
  if (typeof saved.gridSize2D === 'number') appState.gridSize2D = saved.gridSize2D;
  if (typeof saved.taskbarRainbow === 'boolean') appState.taskbarRainbow = saved.taskbarRainbow;
  if (typeof saved.headerCircuit === 'boolean') appState.headerCircuit = saved.headerCircuit;
  if (typeof saved.headerCircuitAnim === 'boolean') appState.headerCircuitAnim = saved.headerCircuitAnim;
  if (typeof saved.uiMode === 'string') appState.uiMode = saved.uiMode;
  if (typeof saved.emergencyBackupInterval === 'number') appState.emergencyBackupInterval = saved.emergencyBackupInterval;
}

function applyDefaultStartupMode() {
  const isFirstRun = !localStorage.getItem('astroknot_first_run');
  const mode = appState.startupMode || (isFirstRun ? '3d_simple' : '3d_full');
  if (mode === '2d') {
    requestAnimationFrame(() => appState.show2DView?.(true));
  } else if (mode === '3d_simple') {
    appState.simple3D = true;
    requestAnimationFrame(() => {
      if (typeof toggleSimple3DMode === 'function') toggleSimple3DMode(true);
    });
  } else if (mode === '3d_full') {
    appState.simple3D = false;
  }
}

/** 启动时根据设置自动进入全屏 */
function applyStartupWindowMode() {
  if (appState.startupWindowMode === 'fullscreen') {
    requestAnimationFrame(() => {
      if (window.api?.toggleFullscreen) {
        window.api.toggleFullscreen();
      }
    });
  }
}

// ========== 极简模式切换（带过渡动画） ==========
function resetEffectsForTransition() {
  if (appState.bloomPass) {
    appState._originalBloomStrength = appState.bloomPass.strength;
    appState.bloomPass.strength = 0;
  }
  appState.starGroups.forEach(g => {
    if (g.points) { g.points.visible = true; g.points.material.opacity = 0; }
  });
  appState.nebulaFlowGroups.forEach(n => {
    if (n.material) { n.visible = true; n.material.opacity = 0; }
  });
  if (appState.flowField) { appState.flowField.visible = true; appState.flowField.material.opacity = 0; }
  if (appState.skySphere) {
    appState.skySphere.visible = true;
    if (appState.skySphere.material.uniforms) {
      appState.skySphere.material.uniforms.transitionProgress.value = 0;
    }
  }
  if (appState.meteors) {
    appState.meteors.forEach(m => { if (m.group && !m.active) m.group.visible = false; });
  }
  for (let [id, obj] of appState.nodeMeshes.entries()) {
    if (obj.ring) { obj.ring.visible = appState.ringVisible !== false; obj.ring.scale.set(0, 0, 0); }
    if (obj.glowRing) { obj.glowRing.visible = appState.ringVisible !== false; obj.glowRing.scale.set(0, 0, 0); }
    if (obj.glowSphere) { obj.glowSphere.visible = true; obj.glowSphere.scale.set(0, 0, 0); }
    if (obj.surfaceGlowSphere) { obj.surfaceGlowSphere.visible = true; obj.surfaceGlowSphere.scale.set(0, 0, 0); }
  }
  for (let it of appState.lineItems) {
    if (it.line.glowTube) { it.line.glowTube.visible = true; it.line.glowTube.material.opacity = 0; }
    it.line.endFlowAnimation();
    if (it.line.particlePoints) { it.line.particlePoints.visible = true; it.line.particlePoints.material.opacity = 0; }
    if (it.line.trailPointsMerged) { it.line.trailPointsMerged.visible = true; if (it.line.trailPointsMerged.material.uniforms) it.line.trailPointsMerged.material.uniforms.uOpacity.value = 0; }
  }
  if (appState.backGlow) { appState.backGlow.visible = true; appState.backGlow.intensity = 0; }
  if (appState.scene.fog) appState.scene.fog.density = 0;
}

function restoreFullEffects() {
  if (appState.bloomPass) {
    appState.bloomPass.strength = appState._originalBloomStrength ?? 0.2;
  }
  if (appState.skySphere && appState.skySphere.material.uniforms) {
    appState.skySphere.material.uniforms.transitionProgress.value = 1.0;
  }
  appState.starGroups.forEach(g => { if (g.points) g.points.material.opacity = g.baseOpacity || 0.9; });
  appState.nebulaFlowGroups.forEach(n => { if (n.material) n.material.opacity = 0.5; });
  if (appState.flowField) appState.flowField.material.opacity = 0.4;
  for (let [id, obj] of appState.nodeMeshes.entries()) {
    if (obj.ring) obj.ring.scale.set(1, 1, 1);
    if (obj.glowRing) obj.glowRing.scale.set(1, 1, 1);
    if (obj.glowSphere) obj.glowSphere.scale.set(1, 1, 1);
    if (obj.surfaceGlowSphere) obj.surfaceGlowSphere.scale.set(1, 1, 1);
  }
  for (let it of appState.lineItems) {
    if (it.line.glowTube) it.line.glowTube.material.opacity = 1;
    if (it.line.particlePoints) it.line.particlePoints.material.opacity = 1;
    if (it.line.trailPointsMerged?.material?.uniforms) it.line.trailPointsMerged.material.uniforms.uOpacity.value = 1;
  }
  if (appState.backGlow) appState.backGlow.intensity = 0.7;
  if (appState.scene.fog) appState.scene.fog.density = 0.004;
}
window.restoreFullEffects = restoreFullEffects;

export function toggleSimple3DMode(targetSimple) {
  if (targetSimple) {
    appState.simple3D = true;
    appState.transitionActive = false;
    if (appState.skySphere) appState.skySphere.visible = false;
    [...appState.starGroups, ...(appState.nebulaFlowGroups || [])].forEach(g => {
      if (g.points) g.points.visible = false;
    });
    if (appState.flowField) appState.flowField.visible = false;
    if (appState.meteors) appState.meteors.forEach(m => { if (m.group) m.group.visible = false; });
    for (let [id, obj] of appState.nodeMeshes.entries()) {
      if (obj.ring) obj.ring.visible = false;
      if (obj.glowRing) obj.glowRing.visible = false;
      if (obj.glowSphere) obj.glowSphere.visible = false;
      if (obj.surfaceGlowSphere) obj.surfaceGlowSphere.visible = false;
    }
    for (let it of appState.lineItems) {
      if (it.line.glowTube) it.line.glowTube.visible = false;
      if (it.line.particlePoints) it.line.particlePoints.visible = false;
      if (it.line.trailPointsMerged) it.line.trailPointsMerged.visible = false;
    }
    if (appState.backGlow) appState.backGlow.visible = false;
    if (appState.scene.fog) appState.scene.fog.density = 0;
    if (appState.scene) {
      appState.scene.background = new THREE.Color(appState.simpleBgColor || '#000000');
    }
  } else {
    appState.simple3D = false;
    appState.transitionTarget = 1;
    appState.transitionActive = true;
    appState.transitionProgress = 0;
    if (appState.scene) appState.scene.background = null;
    resetEffectsForTransition();
  }
  saveSettingsToStorage();
}
window.toggleSimple3DMode = toggleSimple3DMode;

// ========== 初始化 UI 主题 ==========
export function initUITheme() {
  loadSettingsFromStorage();
  // 应用界面模式（深色/浅色）
  const uiMode = appState.uiMode || 'dark';
  applyUIMode(uiMode);
  // 从旧 localStorage 键同步编辑器设置到 appState
  try {
    const lm = localStorage.getItem('richEditor_lightMode');
    if (lm !== null && appState.editorLightMode === false) appState.editorLightMode = (lm === '1');
    const pv = localStorage.getItem('richEditor_pageView');
    if (pv !== null && appState.editorPageView === false) appState.editorPageView = (pv === '1');
    const fs = localStorage.getItem('richEditor_fontSize');
    if (fs !== null && appState.editorFontSize === 14) appState.editorFontSize = parseInt(fs, 10);
    if (appState.editorFontSize !== 14) {
      document.documentElement.style.setProperty('--editor-font-size', appState.editorFontSize + 'px');
    }
  } catch {}
  applyDefaultStartupMode();
  applyStartupWindowMode();
}