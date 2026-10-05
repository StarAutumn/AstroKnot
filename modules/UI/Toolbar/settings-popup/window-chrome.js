// ============================================================
//  UI/Toolbar/settings-popup/window-chrome.js — 弹窗窗口化逻辑
// ============================================================
//  - initSettingsDrag：拖拽移动（拖动 settings-modal-content）
//  - initOpenClose：glowBtn 点击打开/收起（含任务栏注册）+ 关闭/最小化按钮 + 遮罩点击
//  - hideSettingsPopup：关闭设置面板（模块级，原闭包函数提升）
//  - initMaximizeResize：最大化/还原 + 边缘自由缩放
// ============================================================
//  
// ============================================================
import { appState } from '../../../module0_AppState.js';
import { saveSettingsToStorage } from '../../Theme.js';

// ── 拖拽（拖动 settings-modal-content）──
export function initSettingsDrag(ctx) {
  const { popup } = ctx;

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
}

export function initOpenClose(ctx) {
  const { glowBtn } = ctx;

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
    const startPageBackgroundSelect = gp.popup.querySelector('#startPageBackgroundSelect');
    if (startPageBackgroundSelect) startPageBackgroundSelect.value = appState.startPageBackground || 'ribbon';
    // 恢复自定义背景行
    const customBgRow2 = gp.popup.querySelector('#customBgRow');
    if (customBgRow2) customBgRow2.style.display = (appState.startPageBackground === 'custom') ? 'flex' : 'none';
    const customBgPathInput2 = gp.popup.querySelector('#customBgPathInput');
    if (customBgPathInput2) customBgPathInput2.value = appState.customBgPath || '';
    // 恢复应用栏布局模式
    const dockLayoutModeSelect2 = gp.popup.querySelector('#dockLayoutModeSelect');
    if (dockLayoutModeSelect2) dockLayoutModeSelect2.value = appState.dockLayoutMode || 'sidebar';
    const dockGridModeRow2 = gp.popup.querySelector('#dockGridModeRow');
    const dockGridModeSelect2 = gp.popup.querySelector('#dockGridModeSelect');
    if (dockGridModeRow2) dockGridModeRow2.style.display = (appState.dockLayoutMode === 'desktop') ? 'block' : 'none';
    if (dockGridModeSelect2) dockGridModeSelect2.value = appState.dockGridMode || 'free';
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
    // 同步通知设置
    const notifEnableChk = gp.popup.querySelector('#notificationEnableCheck');
    const notifMuteWrap = gp.popup.querySelector('#notificationMuteWrap');
    const notifMuteChk = gp.popup.querySelector('#notificationMuteCheck');
    if (notifEnableChk) notifEnableChk.checked = appState.notificationEnabled !== false;
    if (notifMuteWrap) notifMuteWrap.style.display = appState.notificationEnabled !== false ? '' : 'none';
    if (notifMuteChk) notifMuteChk.checked = appState.notificationMuted === true;
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
              gp.popup.classList.add('minimized');
              gp.popup.classList.remove('windowed', 'maximized');
              gp.popup.style.display = 'none';
              content.style.transform = '';
              if (window.Taskbar) window.Taskbar.setEditorActive('settings', false);
            };
          } else {
            // 恢复显示
            gp.popup.classList.remove('minimized');
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
        maximize: function () {
          // 从最小化恢复时先显示
          if (gp.popup.classList.contains('minimized')) {
            gp.popup.classList.remove('minimized');
            gp.popup.style.display = '';
          }
          // 切换最大化/窗口化
          if (gp.popup.classList.contains('maximized')) {
            gp.popup.classList.remove('maximized');
            gp.popup.classList.add('windowed');
          } else {
            gp.popup.classList.remove('windowed');
            gp.popup.classList.add('maximized');
          }
          if (window._bringModalToFront) window._bringModalToFront(gp.popup);
          if (window.Taskbar) window.Taskbar.setEditorActive('settings', true);
        },
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
            gp.popup.classList.add('minimized');
            gp.popup.classList.remove('windowed', 'maximized');
            gp.popup.style.display = 'none';
            content.style.transform = '';
            if (window.Taskbar) window.Taskbar.setEditorActive('settings', false);
          };
        }
      });
    }
  });

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
      gp.popup.classList.add('minimized');
      gp.popup.classList.remove('windowed', 'maximized');
      gp.popup.style.display = 'none';
      content.style.transform = '';
      if (window.Taskbar) window.Taskbar.setEditorActive('settings', false);
    };
  });

  // 遮罩点击关闭
  document.querySelector('#settingsOverlay')?.addEventListener('click', hideSettingsPopup);
}

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
  // 恢复 z-index
  popup.style.zIndex = '';
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

export function initMaximizeResize(ctx) {
  const { popup } = ctx;

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
}

