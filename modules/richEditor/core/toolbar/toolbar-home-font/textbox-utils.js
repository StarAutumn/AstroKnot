import { state } from '../../../shared-state.js';

// ── TextBox 辅助函数 ──
// 检测是否正在编辑 overlay textbox
export function isEditingTextBox() {
  return state.editingTextBox && state.editingTextBoxData;
}

// 获取当前编辑的 textbox 元素
export function getEditingTextBoxElement() {
  return state.editingTextBox;
}

// 保存 textbox 当前选区
export function saveTextBoxSelection() {
  const el = getEditingTextBoxElement();
  if (!el) return null;
  const selection = window.getSelection();
  if (selection.rangeCount > 0) {
    try {
      state._textBoxSavedRange = selection.getRangeAt(0).cloneRange();
      return state._textBoxSavedRange;
    } catch (e) {
      return null;
    }
  }
  return null;
}

// 恢复 textbox 选区并聚焦
export function restoreTextBoxSelection() {
  const el = getEditingTextBoxElement();
  if (!el) return false;
  if (state._textBoxSavedRange) {
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(state._textBoxSavedRange);
    el.focus();
    return true;
  }
  return false;
}

// 在 textbox 中执行格式化命令（自动保存和恢复选区）
export function execTextBoxCommand(cmd, value) {
  if (!restoreTextBoxSelection()) return false;
  document.execCommand(cmd, false, value || null);
  saveTextBoxSelection();
  return true;
}

// 在 textbox 中应用字体
export function applyTextBoxFont(fontFamily) {
  if (!restoreTextBoxSelection()) return false;
  document.execCommand('fontName', false, fontFamily);
  saveTextBoxSelection();
  return true;
}

// 在 textbox 中应用字号（需要转换为像素值）
export function applyTextBoxFontSize(ptSize) {
  if (!restoreTextBoxSelection()) return false;
  // document.execCommand('fontSize' 使用 1-7 的索引，不太好用
  // 直接使用像素值
  const pxSize = Math.round(parseFloat(ptSize) * 96 / 72);
  document.execCommand('fontSize', false, '7'); // 先设置最大字号
  // 然后修改选中的字体大小
  const el = getEditingTextBoxElement();
  if (el) {
    const spans = el.querySelectorAll('font[size="7"]');
    spans.forEach(span => {
      span.removeAttribute('size');
      span.style.fontSize = pxSize + 'px';
    });
  }
  saveTextBoxSelection();
  return true;
}

// 全局 mousedown 监听器：在点击工具栏前保存 textbox 选区
let _textBoxSelectionSaved = false;
export function _setupTextBoxSelectionGuard() {
  document.addEventListener('mousedown', function (e) {
    if (!isEditingTextBox()) return;
    // 检查是否点击了 TinyMCE 工具栏区域、菜单、颜色面板或tab
    const toolbar = e.target.closest('.tox-toolbar, .tox-toolbar__group, .tox-menubar, [role="toolbar"], .tox-menu, .tox-collection');
    const colorPanel = e.target.closest('#gradientCustomPanel, #backcolorCustomPanel, #underlineColorPanel');
    const tab = e.target.closest('.tb-menubar-tab');
    if (toolbar || colorPanel || tab) {
      saveTextBoxSelection();
      _textBoxSelectionSaved = true;
    }
  }, true); // 使用 capture 阶段，确保在 TinyMCE 处理之前执行
}
_setupTextBoxSelectionGuard();