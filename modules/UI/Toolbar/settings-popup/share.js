// ============================================================
//  UI/Toolbar/settings-popup/share.js — 设置弹窗共享层
// ============================================================
//  - createSettingsCtx：构造跨文件共享的上下文对象（popup/overlay 弹窗 DOM 引用 +
//    glowBtn 触发按钮），替代原 initSettingsPopup 闭包变量
//  - bind2DColorPicker：2D 模式颜色选择器 + 十六进制输入绑定（原闭包内公共小工具）
// ============================================================
//  
// ============================================================
import { appState } from '../../../module0_AppState.js';
import { saveSettingsToStorage } from '../../Theme.js';

// ── 上下文对象：原闭包变量（popup/overlay/glowBtn）的显式传递载体 ──
export function createSettingsCtx(popup, overlay, glowBtn) {
  return { popup, overlay, glowBtn };
}

// 绑定 2D 模式背景颜色
export function bind2DColorPicker(pickerId, hexId, stateKey, refresh) {
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

