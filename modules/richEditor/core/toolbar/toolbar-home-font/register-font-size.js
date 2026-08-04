// ============================================================
//  toolbar/toolbar-home-font/register-font-size.js — 字号注册
// ============================================================

import { state } from '../../../shared-state.js';

// ── TextBox 辅助函数 ──
function isEditingTextBox() {
  return state.editingTextBox && state.editingTextBoxData;
}

function getEditingTextBoxElement() {
  return state.editingTextBox;
}

function saveTextBoxSelection() {
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

function restoreTextBoxSelection() {
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

export function registerFontSize(editor) {
  let fontsizeOptions = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 48, 52, 56, 60, 64, 68, 72];

  try {
    editor.addCommand('mceFontSizeUp', function () {
      editor.undoManager.transact(function () {
        let node = editor.selection.getNode();
        let fontSize = editor.dom.getStyle(node, 'font-size');
        if (!fontSize) {
          fontSize = editor.dom.getStyle(node, 'font-size', true);
        }
        let currentPt = 16;
        if (fontSize) {
          let ptMatch = fontSize.match(/^([\d.]+)\s*pt$/i);
          if (ptMatch) {
            currentPt = parseFloat(ptMatch[1]);
          } else {
            let pxMatch = fontSize.match(/^([\d.]+)\s*px$/i);
            if (pxMatch) {
              currentPt = Math.round(parseFloat(pxMatch[1]) * 72 / 96);
            }
          }
        }
        let newPt = currentPt;
        for (let i = 0; i < fontsizeOptions.length; i++) {
          if (fontsizeOptions[i] > currentPt) {
            newPt = fontsizeOptions[i];
            break;
          }
        }
        editor.execCommand('FontSize', false, newPt + 'pt');
      });
    });
  } catch (e) {
    console.error('[TinyMCE] mceFontSizeUp 命令注册失败:', e);
  }

  try {
    editor.addCommand('mceFontSizeDown', function () {
      editor.undoManager.transact(function () {
        let node = editor.selection.getNode();
        let fontSize = editor.dom.getStyle(node, 'font-size');
        if (!fontSize) {
          fontSize = editor.dom.getStyle(node, 'font-size', true);
        }
        let currentPt = 16;
        if (fontSize) {
          let ptMatch = fontSize.match(/^([\d.]+)\s*pt$/i);
          if (ptMatch) {
            currentPt = parseFloat(ptMatch[1]);
          } else {
            let pxMatch = fontSize.match(/^([\d.]+)\s*px$/i);
            if (pxMatch) {
              currentPt = Math.round(parseFloat(pxMatch[1]) * 72 / 96);
            }
          }
        }
        let newPt = currentPt;
        for (let i = fontsizeOptions.length - 1; i >= 0; i--) {
          if (fontsizeOptions[i] < currentPt) {
            newPt = fontsizeOptions[i];
            break;
          }
        }
        editor.execCommand('FontSize', false, newPt + 'pt');
      });
    });
  } catch (e) {
    console.error('[TinyMCE] mceFontSizeDown 命令注册失败:', e);
  }

  try {
    editor.ui.registry.addButton('fontplus', {
      text: 'A▲',
      tooltip: '增大字号',
      onAction: function () {
        if (isEditingTextBox()) {
          saveTextBoxSelection();
          restoreTextBoxSelection();
          const selection = window.getSelection();
          if (selection.rangeCount > 0 && !selection.getRangeAt(0).collapsed) {
            const range = selection.getRangeAt(0);
            const fragments = range.extractContents();
            const span = document.createElement('span');
            let currentPx = 16;
            if (fragments.firstChild && fragments.firstChild.nodeType === 1) {
              const style = fragments.firstChild.style;
              if (style.fontSize) {
                currentPx = parseFloat(style.fontSize);
              }
            }
            const newPx = currentPx + 2;
            span.style.fontSize = newPx + 'px';
            span.appendChild(fragments);
            range.insertNode(span);
          }
        } else {
          editor.execCommand('mceFontSizeUp');
        }
      }
    });
  } catch (e) {
    console.error('[TinyMCE] fontplus 按钮注册失败:', e);
  }

  try {
    editor.ui.registry.addButton('fontminus', {
      text: 'A▼',
      tooltip: '减小字号',
      onAction: function () {
        if (isEditingTextBox()) {
          saveTextBoxSelection();
          restoreTextBoxSelection();
          const selection = window.getSelection();
          if (selection.rangeCount > 0 && !selection.getRangeAt(0).collapsed) {
            const range = selection.getRangeAt(0);
            const fragments = range.extractContents();
            const span = document.createElement('span');
            let currentPx = 16;
            if (fragments.firstChild && fragments.firstChild.nodeType === 1) {
              const style = fragments.firstChild.style;
              if (style.fontSize) {
                currentPx = parseFloat(style.fontSize);
              }
            }
            const newPx = Math.max(8, currentPx - 2);
            span.style.fontSize = newPx + 'px';
            span.appendChild(fragments);
            range.insertNode(span);
          }
        } else {
          editor.execCommand('mceFontSizeDown');
        }
      }
    });
  } catch (e) {
    console.error('[TinyMCE] fontminus 按钮注册失败:', e);
  }
}