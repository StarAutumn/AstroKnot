import { state } from './shared-state.js';

export function showSavedToast() {
  const wrapper = document.getElementById('ckEditorContainer');
  if (!wrapper) return;
  const old = wrapper.querySelector('.save-toast');
  if (old) old.remove();

  const toast = document.createElement('div');
  toast.className = 'save-toast';
  toast.textContent = '笔记已保存';
  toast.style.cssText = `
    position: absolute; top: 0; left: 0; right: 0; height: 30px;
    background: linear-gradient(90deg, #2c7a6e, transparent);
    color: white; text-align: center; line-height: 30px;
    font-size: 13px; z-index: 10;
    animation: toastFade 2s ease forwards;
    pointer-events: none;
  `;

  if (!document.getElementById('toast-style')) {
    const style = document.createElement('style');
    style.id = 'toast-style';
    style.textContent = `
      @keyframes toastFade {
        0% { opacity: 0; transform: translateY(-10px); }
        15% { opacity: 1; transform: translateY(0); }
        70% { opacity: 1; transform: translateY(0); }
        100% { opacity: 0; transform: translateY(-10px); }
      }
    `;
    document.head.appendChild(style);
  }
  wrapper.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);
}

export function getCKEditorInstance() {
  return state.tinyEditor;
}

export function isCKEditorActive() {
  return true;
}

export function setEditingFormulaImg(img) {
  state._tmceEditingFormulaImg = img;
}

export function getEditingFormulaImg() {
  return state._tmceEditingFormulaImg;
}

export function clearEditingFormulaImg() {
  state._tmceEditingFormulaImg = null;
}

export function rgbToHex(rgb) {
  if (!rgb) return '#eef';
  if (rgb.startsWith('#')) return rgb;
  const match = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
  if (!match) return '#eef';
  return '#' + [1, 2, 3].map(i => parseInt(match[i]).toString(16).padStart(2, '0')).join('');
}

export function getCurrentTinyFontColor() {
  if (!state.tinyEditor) return '#eef';
  const color = state.tinyEditor.formatter.get('color');
  if (color) {
    return rgbToHex(color);
  }
  const body = state.tinyEditor.getBody();
  if (body) {
    const computed = window.getComputedStyle(body);
    return rgbToHex(computed.color);
  }
  return '#eef';
}