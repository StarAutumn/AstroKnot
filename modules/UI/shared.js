// ============================================================
//  UI / shared.js — 共享状态
// ============================================================

// ========== 全局事件监听器注册标志 ==========
export let keyboardEventBound = false;
export function setKeyboardEventBound(v) { keyboardEventBound = v; }

export let toggleFullscreen = null;
export function setToggleFullscreen(fn) { toggleFullscreen = fn; }

export const keys2D = { w: false, a: false, s: false, d: false, ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false };

export const keys = { w: false, a: false, s: false, d: false, ' ': false, shift: false };

export function isInputActive() {
  const el = document.activeElement;
  if (!el) return false;
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable) return true;
  // 检测 iframe 编辑器（如 TinyMCE）：焦点在 iframe 内部的内容可编辑区域
  if (el.tagName === 'IFRAME') {
    try {
      const doc = el.contentDocument || el.contentWindow.document;
      const activeEl = doc.activeElement;
      return activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);
    } catch (e) {
      return false;
    }
  }
  return false;
}