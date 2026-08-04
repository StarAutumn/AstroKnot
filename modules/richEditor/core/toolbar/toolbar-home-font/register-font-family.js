// ============================================================
//  toolbar/toolbar-home-font/register-font-family.js — 字体族注册
// ============================================================

import { state } from '../../../shared-state.js';
import { _wrapTextNodesInSel } from './shared.js';

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

function execTextBoxCommand(cmd, value) {
  if (!restoreTextBoxSelection()) return false;
  document.execCommand(cmd, false, value || null);
  saveTextBoxSelection();
  return true;
}

function applyTextBoxFont(fontFamily) {
  if (!restoreTextBoxSelection()) return false;
  document.execCommand('fontName', false, fontFamily);
  saveTextBoxSelection();
  return true;
}

export function registerFontFamily(editor, shared) {
  const { cnFonts, enFonts, cnFontNameMap, enFontNameMap, getCurrentFonts, updateFontButtonLabels } = shared;

  let cnFontBtnEl = null;
  let enFontBtnEl = null;

  function fixFontSizeBtnWidth() {
    try {
      var dock = document.getElementById('toolbarDock');
      if (!dock) return;
      var btns = dock.querySelectorAll('.tox-tbtn--select[data-mce-name="fontsize"]');
      btns.forEach(function(btn) {
        btn.style.setProperty('width', '48px', 'important');
        btn.style.setProperty('max-width', '50px', 'important');
        btn.style.setProperty('min-width', '38px', 'important');
        if (!btn._fsObserver) {
          btn._fsObserver = new MutationObserver(function() {
            if (btn.style.width !== '48px') {
              btn.style.setProperty('width', '48px', 'important');
              btn.style.setProperty('max-width', '50px', 'important');
              btn.style.setProperty('min-width', '38px', 'important');
            }
          });
          btn._fsObserver.observe(btn, { attributes: true, attributeFilter: ['style'] });
        }
      });
    } catch(e) { console.warn('[TinyMCE] fixFontSizeBtnWidth:', e); }
  }

  function cacheFontBtnRefs() {
    let container = editor.getContainer();
    if (!container) return;
    let sel = '.tox-mbtn[aria-label="中文字体（仅对汉字生效）"], .tox-tbtn[aria-label="中文字体（仅对汉字生效）"]';
    cnFontBtnEl = container.querySelector(sel);
    sel = '.tox-mbtn[aria-label="英文字体（仅对英文生效）"], .tox-tbtn[aria-label="英文字体（仅对英文生效）"]';
    enFontBtnEl = container.querySelector(sel);
  }

  function applyFontByRegex(ed, fontFamily, regexPattern) {
    let rng = ed.selection.getRng();
    if (rng.collapsed) return;

    let startLi = ed.dom.getParent(rng.startContainer, 'li');
    let endLi = ed.dom.getParent(rng.endContainer, 'li');
    if (startLi && endLi && startLi !== endLi) {
      ed.undoManager.transact(function () {
        _wrapTextNodesInSel(ed, function (parent, before, text) {
          let regex = new RegExp(regexPattern, 'g');
          let segs = [];
          let last = 0, m;
          regex.lastIndex = 0;
          while ((m = regex.exec(text)) !== null) {
            if (m.index > last) segs.push(document.createTextNode(text.substring(last, m.index)));
            let sp = document.createElement('span');
            sp.style.fontFamily = fontFamily;
            sp.textContent = m[0];
            segs.push(sp);
            last = m.index + m[0].length;
          }
          if (last < text.length) segs.push(document.createTextNode(text.substring(last)));
          segs.forEach(function (c) { parent.insertBefore(c, before); });
        });
        let lisToStyle = [];
        try {
          let liWalker = document.createTreeWalker(
            ed.getBody(), NodeFilter.SHOW_ELEMENT,
            { acceptNode: function (el) { return el.nodeName === 'LI' && rng.intersectsNode(el) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP; }},
            false
          );
          let liEl;
          while ((liEl = liWalker.nextNode())) { if (lisToStyle.indexOf(liEl) === -1) lisToStyle.push(liEl); }
          lisToStyle.forEach(function (l) { l.style.setProperty('--mkr-font-family', fontFamily); });
        } catch (e2) {}
      });
      updateFontButtonLabels();
      return;
    }

    ed.undoManager.transact(function () {
      let contents = rng.extractContents();
      let regex = new RegExp(regexPattern, 'g');
      let walker = document.createTreeWalker(contents, NodeFilter.SHOW_TEXT);
      let textNodes = [];
      let n;
      while ((n = walker.nextNode())) { textNodes.push(n); }
      textNodes.forEach(function (tn) {
        let text = tn.textContent;
        let parent = tn.parentNode;
        let segs = [];
        let last = 0, m;
        regex.lastIndex = 0;
        while ((m = regex.exec(text)) !== null) {
          if (m.index > last) segs.push(document.createTextNode(text.substring(last, m.index)));
          let sp = document.createElement('span');
          sp.style.fontFamily = fontFamily;
          sp.textContent = m[0];
          segs.push(sp);
          last = m.index + m[0].length;
        }
        if (last < text.length) segs.push(document.createTextNode(text.substring(last)));
        if (segs.length > 0) {
          segs.forEach(function (c) { parent.insertBefore(c, tn); });
          parent.removeChild(tn);
        }
      });
      rng.insertNode(contents);
      ed.selection.setRng(rng);
      let li = ed.dom.getParent(ed.selection.getNode(), 'li');
      if (li) { li.style.setProperty('--mkr-font-family', fontFamily); }
      updateFontButtonLabels();
    });
  }

  function removeFontByRegex(ed, regexPattern) {
    let rng = ed.selection.getRng();
    if (rng.collapsed) return;

    let startLi = ed.dom.getParent(rng.startContainer, 'li');
    let endLi = ed.dom.getParent(rng.endContainer, 'li');
    if (startLi && endLi && startLi !== endLi) {
      ed.undoManager.transact(function () {
        let regex = new RegExp(regexPattern, 'g');
        let selSpans = [];
        try {
          let allSpans = ed.getBody().querySelectorAll('span');
          allSpans.forEach(function (sp) {
            if (sp.style.fontFamily && regex.test(sp.textContent || '') && rng.intersectsNode(sp))
              selSpans.push(sp);
          });
        } catch (e) {}
        selSpans.forEach(function (sp) {
          let p = sp.parentNode;
          while (sp.firstChild) { p.insertBefore(sp.firstChild, sp); }
          p.removeChild(sp);
        });
        let lisToStyle = [];
        try {
          let liWalker = document.createTreeWalker(
            ed.getBody(), NodeFilter.SHOW_ELEMENT,
            { acceptNode: function (el) { return el.nodeName === 'LI' && rng.intersectsNode(el) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP; }},
            false
          );
          let liEl;
          while ((liEl = liWalker.nextNode())) { if (lisToStyle.indexOf(liEl) === -1) lisToStyle.push(liEl); }
          lisToStyle.forEach(function (l) { l.style.removeProperty('--mkr-font-family'); });
        } catch (e2) {}
      });
      updateFontButtonLabels();
      return;
    }

    ed.undoManager.transact(function () {
      let contents = rng.extractContents();
      let regex = new RegExp(regexPattern, 'g');
      let spans = contents.querySelectorAll('span');
      spans.forEach(function (sp) {
        if (sp.style.fontFamily && regex.test(sp.textContent || '')) {
          let p = sp.parentNode;
          while (sp.firstChild) { p.insertBefore(sp.firstChild, sp); }
          p.removeChild(sp);
        }
      });
      rng.insertNode(contents);
      ed.selection.setRng(rng);
      let li = ed.dom.getParent(ed.selection.getNode(), 'li');
      if (li) { li.style.removeProperty('--mkr-font-family'); }
      updateFontButtonLabels();
    });
  }

  editor.on('NodeChange', updateFontButtonLabels);
  editor.on('SelectionChange', updateFontButtonLabels);
  editor.on('init', function () {
    requestAnimationFrame(function () {
      cacheFontBtnRefs();
      updateFontButtonLabels();
      fixFontSizeBtnWidth();
    });
  });

  try {
    editor.ui.registry.addMenuButton('cnfontfamily', {
      text: '中文',
      tooltip: '中文字体（仅对汉字生效）',
      fetch: function (callback) {
        if (isEditingTextBox()) {
          saveTextBoxSelection();
        }
        let items = [];
        items.push({
          type: 'menuitem', text: '清除', onAction: function () {
            if (isEditingTextBox()) {
              execTextBoxCommand('removeFormat');
            } else {
              removeFontByRegex(editor, '[\\u4e00-\\u9fff\\u3400-\\u4dbf]+');
            }
          }
        });
        cnFonts.forEach(function (f) {
          items.push({
            type: 'menuitem', text: f.label, onAction: function () {
              if (isEditingTextBox()) {
                applyTextBoxFont(f.family);
              } else {
                applyFontByRegex(editor, f.family, '[\\u4e00-\\u9fff\\u3400-\\u4dbf]+');
              }
            }
          });
        });
        callback(items);
      },
      onSetup: function () {
        cacheFontBtnRefs();
        updateFontButtonLabels();
        return function () { cnFontBtnEl = null; };
      }
    });
  } catch (e) {
    console.error('[TinyMCE] cnfontfamily 注册失败:', e);
  }

  try {
    editor.ui.registry.addMenuButton('enfontfamily', {
      text: '英文',
      tooltip: '英文字体（仅对英文生效）',
      fetch: function (callback) {
        if (isEditingTextBox()) {
          saveTextBoxSelection();
        }
        let items = [];
        items.push({
          type: 'menuitem', text: '清除', onAction: function () {
            if (isEditingTextBox()) {
              execTextBoxCommand('removeFormat');
            } else {
              removeFontByRegex(editor, '[A-Za-z0-9]+');
            }
          }
        });
        enFonts.forEach(function (f) {
          items.push({
            type: 'menuitem', text: f.label, onAction: function () {
              if (isEditingTextBox()) {
                applyTextBoxFont(f.family);
              } else {
                applyFontByRegex(editor, f.family, '[A-Za-z0-9]+');
              }
            }
          });
        });
        callback(items);
      },
      onSetup: function () {
        cacheFontBtnRefs();
        updateFontButtonLabels();
        return function () { enFontBtnEl = null; };
      }
    });
  } catch (e) {
    console.error('[TinyMCE] enfontfamily 注册失败:', e);
  }
}