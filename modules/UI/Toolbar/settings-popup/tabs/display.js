// ============================================================
//  UI/Toolbar/settings-popup/tabs/display.js — 「显示」标签页
// ============================================================
//  - displayPanelHtml：面板 HTML（天空/球体/圆环/连线滑块、简洁模式、2D 配色、渲染性能）
//  - bindDisplayMain：滑块/可见性开关绑定 + window.__glowPopup 引用登记
//  - bindDisplaySimple3D：简洁模式开关与背景颜色、2D 模式配色绑定
//  - bindDisplayRenderPerf：FOV / Bloom / 像素比 / 粒子密度绑定
// ============================================================
//  
// ============================================================
import * as THREE from 'three';
import { appState } from '../../../../module0_AppState.js';
import { toggleSimple3DMode, saveSettingsToStorage } from '../../../Theme.js';
import { bind2DColorPicker } from '../share.js';

export const displayPanelHtml = `  <div class="settings-tab-panel active" data-panel="display" style="padding:8px 16px 14px;">
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
  </div>`

export function bindDisplayMain(ctx) {
  const { popup, overlay } = ctx;

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
}

export function bindDisplaySimple3D(ctx) {

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
}

export function bindDisplayRenderPerf(ctx) {
  const { popup } = ctx;

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
}

