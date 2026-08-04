import { state } from '../../../shared-state.js';
import { syncFileLinkMceStyle } from '../../../images-files.js';
import { isEditingTextBox, getEditingTextBoxElement, saveTextBoxSelection, restoreTextBoxSelection, _setupTextBoxSelectionGuard } from './textbox-utils.js';
import { _wrapTextNodesInSel, solidColors, gradientPresets } from './shared.js';

export function registerColorPicker(editor, shared) {
  const { updateFontButtonLabels } = shared;

  

  function syncDecorations(rng, color, gradientCss) {
    let editor = state.tinyEditor;
    if (!editor || rng.collapsed) return;
    let isGrad = !!gradientCss;
    try {
      let walker = document.createTreeWalker(editor.getBody(), NodeFilter.SHOW_ELEMENT, {
        acceptNode: function (el) {
          if (el.nodeName !== 'U' && el.nodeName !== 'S' && el.nodeName !== 'STRIKE' && el.nodeName !== 'SPAN') return NodeFilter.FILTER_SKIP;
          try { return rng.intersectsNode(el) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP; }
          catch (e) { return NodeFilter.FILTER_SKIP; }
        }
      });
      let de;
      while ((de = walker.nextNode())) {
        if (de.nodeName === 'U' || (de.nodeName === 'SPAN' && (de.classList.contains('gradient-underline') || /\bunderline\b/.test(de.style.textDecoration || '')))) {
          if (isGrad && de.classList.contains('gradient-underline') && de.style.borderImage) {
            de.style.borderImage = gradientCss + ' 1';
          } else {
            de.style.textDecorationColor = color;
          }
        }
        if (de.nodeName === 'S' || de.nodeName === 'STRIKE' || (de.nodeName === 'SPAN' && /\bline-through\b/.test(de.style.textDecoration || ''))) {
          de.style.textDecorationColor = color;
        }
        if (de.nodeName === 'SPAN') {
          if (de.hasAttribute('data-emphasis')) {
            if (isGrad) {
              let match = gradientCss.match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)/);
              if (match) {
                de.style.setProperty('text-emphasis-color', match[0]);
                de.style.setProperty('-webkit-text-emphasis-color', match[0]);
              }
            } else {
              de.style.removeProperty('text-emphasis-color');
              de.style.removeProperty('-webkit-text-emphasis-color');
            }
          }
        }
      }
    } catch (e) {}
  }

  function applyTextGradient(gradientCss) {
    let editor = state.tinyEditor;
    if (!editor) return;
    let rng = editor.selection.getRng();
    if (rng.collapsed && editor._savedRange) { rng = editor._savedRange; }
    delete editor._savedRange;
    if (rng.collapsed) return;

    let firstColorMatch = gradientCss.match(/(#[0-9a-fA-F]{6,8}|#[0-9a-fA-F]{3,6}|rgba?\([^)]+\))/);
    let firstColor = firstColorMatch ? firstColorMatch[1] : 'inherit';

    let _syncLi = function () {
      let lisToCheck = [];
      try {
        let liW = document.createTreeWalker(
          editor.getBody(), NodeFilter.SHOW_ELEMENT,
          { acceptNode: function (el) { return el.nodeName === 'LI' && rng.intersectsNode(el) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP; }},
          false
        );
        let l;
        while ((l = liW.nextNode())) { if (lisToCheck.indexOf(l) === -1) lisToCheck.push(l); }
        lisToCheck.forEach(function (li) {
          let hasGrad = li.querySelector('span.gradient-text');
          if (hasGrad) {
            li.style.setProperty('--mkr-bg-image', gradientCss);
            li.style.setProperty('--mkr-bg-clip', 'text');
            li.style.setProperty('--mkr-text-fill', 'transparent');
            li.style.setProperty('--mkr-color', firstColor);
          } else {
            li.style.removeProperty('--mkr-bg-image');
            li.style.removeProperty('--mkr-bg-clip');
            li.style.removeProperty('--mkr-text-fill');
          }
        });
      } catch (e3) {}
    };

    editor.undoManager.transact(function () {

      let clearSpans = [];
      let cwalker = document.createTreeWalker(editor.getBody(), NodeFilter.SHOW_ELEMENT, {
        acceptNode: function (el) {
          if (el.nodeName === 'SPAN' && el.classList.contains('gradient-text') && rng.intersectsNode(el))
            return NodeFilter.FILTER_ACCEPT;
          return NodeFilter.FILTER_SKIP;
        }
      });
      let cs;
      while ((cs = cwalker.nextNode())) clearSpans.push(cs);
      clearSpans.forEach(function (s) {
        try { editor.dom.unwrap(s); } catch (e) {}
      });

      _wrapTextNodesInSel(editor, function (parent, before, text) {
        let span = editor.dom.create('span', {
          'class': 'gradient-text',
          'style': 'background-image:' + gradientCss + ';-webkit-text-fill-color:transparent;color:' + firstColor + ';'
        }, text);
        parent.insertBefore(span, before);
      });
      _syncLi();
      syncDecorations(rng, firstColor, gradientCss);
    });
  }

  function applySolidForecolor(color) {
    // 检测是否正在编辑 textbox
    if (isEditingTextBox()) {
      const el = getEditingTextBoxElement();
      if (el) {
        // 使用保存的选区
        if (state._textBoxSavedRange) {
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(state._textBoxSavedRange);
        }
        el.focus();
        document.execCommand('foreColor', false, color);
        // 重新保存选区，以便下次操作
        saveTextBoxSelection();
      }
      return;
    }

    let editor = state.tinyEditor;
    if (!editor) return;
    let rng = editor.selection.getRng();
    if (rng.collapsed && editor._savedRange) { rng = editor._savedRange; }
    delete editor._savedRange;
    if (rng.collapsed) return;

    let gradSpans = [];
    let walker = document.createTreeWalker(editor.getBody(), NodeFilter.SHOW_ELEMENT, {
      acceptNode: function (el) {
        if (el.nodeName === 'SPAN' && el.classList && el.classList.contains('gradient-text') && rng.intersectsNode(el))
          return NodeFilter.FILTER_ACCEPT;
        return NodeFilter.FILTER_SKIP;
      }
    });
    let sp;
    while ((sp = walker.nextNode())) gradSpans.push(sp);

    if (gradSpans.length > 0) {
      editor.undoManager.transact(function () {
        gradSpans.forEach(function (s) {
          s.classList.remove('gradient-text');
          s.style.removeProperty('background-image');
          s.style.removeProperty('-webkit-text-fill-color');
          s.style.color = color;
        });
        let lisToClear = [];
        try {
          let liWalk = document.createTreeWalker(
            editor.getBody(), NodeFilter.SHOW_ELEMENT,
            { acceptNode: function (el) { return el.nodeName === 'LI' && !el.querySelector('span.gradient-text') && rng.intersectsNode(el) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP; }},
            false
          );
          let ln;
          while ((ln = liWalk.nextNode())) { if (lisToClear.indexOf(ln) === -1) lisToClear.push(ln); }
          lisToClear.forEach(function (li) {
            li.style.removeProperty('--mkr-bg-image');
            li.style.removeProperty('--mkr-bg-clip');
            li.style.removeProperty('--mkr-text-fill');
            li.style.setProperty('--mkr-color', color);
          });
        } catch (e4) {}
      });
      let sRng = editor.selection.getRng();
      if (!sRng.collapsed) syncDecorations(sRng, color, null);
      return;
    }

    let lisToStyle = [];
    try {
      let liW = document.createTreeWalker(
        editor.getBody(), NodeFilter.SHOW_ELEMENT,
        { acceptNode: function (el) { return el.nodeName === 'LI' && rng.intersectsNode(el) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP; }},
        false
      );
      let lEl;
      while ((lEl = liW.nextNode())) { if (lisToStyle.indexOf(lEl) === -1) lisToStyle.push(lEl); }
    } catch (e2) {}

    editor.undoManager.transact(function () {
      _wrapTextNodesInSel(editor, function (parent, before, text) {
        let span = editor.dom.create('span', { 'style': 'color:' + color + ';' }, text);
        parent.insertBefore(span, before);
      });
      lisToStyle.forEach(function (li) {
        li.style.setProperty('--mkr-color', color);
        li.style.removeProperty('--mkr-bg-image');
        li.style.removeProperty('--mkr-bg-clip');
        li.style.removeProperty('--mkr-text-fill');
      });
      syncDecorations(rng, color, null);
    });
  }

  let forecolorPanel = null;

  function applySolidBackcolor(color, opacity) {
    // 检测是否正在编辑 textbox
    if (isEditingTextBox()) {
      const el = getEditingTextBoxElement();
      if (el) {
        // 使用保存的选区
        if (state._textBoxSavedBackRange) {
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(state._textBoxSavedBackRange);
        }
        el.focus();
        // hiliteColor 用于背景颜色
        let alpha = (opacity !== undefined && opacity < 100) ? (opacity / 100) : 1;
        let rgbaColor = color;
        if (alpha < 1) {
          let rr = parseInt(color.slice(1, 3), 16);
          let gg = parseInt(color.slice(3, 5), 16);
          let bb = parseInt(color.slice(5, 7), 16);
          rgbaColor = 'rgba(' + rr + ',' + gg + ',' + bb + ',' + alpha + ')';
        }
        document.execCommand('hiliteColor', false, rgbaColor);
        // 重新保存选区，以便下次操作
        saveTextBoxSelection();
      }
      return;
    }

    let editor = state.tinyEditor;
    if (!editor) return;
    let rng = editor.selection.getRng();
    if (rng.collapsed && editor._savedBackRange) { rng = editor._savedBackRange; }
    delete editor._savedBackRange;
    if (rng.collapsed) return;

    let alpha = (opacity !== undefined && opacity < 100) ? (opacity / 100) : 1;
    let rgbaColor = color;
    if (alpha < 1) {
      let rr = parseInt(color.slice(1, 3), 16);
      let gg = parseInt(color.slice(3, 5), 16);
      let bb = parseInt(color.slice(5, 7), 16);
      rgbaColor = 'rgba(' + rr + ',' + gg + ',' + bb + ',' + alpha + ')';
    }

    let _syncLiBg = function () {
      let lisToCheck = [];
      try {
        let liW = document.createTreeWalker(
          editor.getBody(), NodeFilter.SHOW_ELEMENT,
          { acceptNode: function (el) { return el.nodeName === 'LI' && rng.intersectsNode(el) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP; }},
          false
        );
        let l;
        while ((l = liW.nextNode())) { if (lisToCheck.indexOf(l) === -1) lisToCheck.push(l); }
        lisToCheck.forEach(function (li) {
          let hasGradBg = li.querySelector('span.gradient-bg');
          if (!hasGradBg) {
            li.style.removeProperty('--mkr-bg-image');
            li.style.setProperty('--mkr-bg-color', rgbaColor);
          }
        });
      } catch (e3) {}
    };

    let gradBgSpans = [];
    let gbWalker = document.createTreeWalker(editor.getBody(), NodeFilter.SHOW_ELEMENT, {
      acceptNode: function (el) {
        if (el.nodeName === 'SPAN' && el.classList && el.classList.contains('gradient-bg') && rng.intersectsNode(el))
          return NodeFilter.FILTER_ACCEPT;
        return NodeFilter.FILTER_SKIP;
      }
    });
    let gs;
    while ((gs = gbWalker.nextNode())) gradBgSpans.push(gs);

    if (gradBgSpans.length > 0) {
      editor.undoManager.transact(function () {
        editor._backcolorSpans = [];
        gradBgSpans.forEach(function (s) {
          s.classList.remove('gradient-bg');
          s.classList.add('tmce-backcolor');
          s.style.removeProperty('background-image');
          s.removeAttribute('data-original-gradient');
          s.style.backgroundColor = rgbaColor;
          editor._backcolorSpans.push(s);
        });
        let lisToClear = [];
        try {
          let liWalk = document.createTreeWalker(
            editor.getBody(), NodeFilter.SHOW_ELEMENT,
            { acceptNode: function (el) { return el.nodeName === 'LI' && !el.querySelector('span.gradient-bg') && rng.intersectsNode(el) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP; }},
            false
          );
          let ln;
          while ((ln = liWalk.nextNode())) { if (lisToClear.indexOf(ln) === -1) lisToClear.push(ln); }
          lisToClear.forEach(function (li) {
            li.style.removeProperty('--mkr-bg-image');
            li.style.setProperty('--mkr-bg-color', rgbaColor);
          });
        } catch (e4) {}
      });
      return;
    }

    editor.undoManager.transact(function () {
      editor._backcolorSpans = [];

      let existingBgSpans = [];
      let bgWalker = document.createTreeWalker(editor.getBody(), NodeFilter.SHOW_ELEMENT, {
        acceptNode: function (el) {
          if (el.nodeName === 'SPAN' && el.classList && el.classList.contains('tmce-backcolor') && rng.intersectsNode(el))
            return NodeFilter.FILTER_ACCEPT;
          return NodeFilter.FILTER_SKIP;
        }
      });
      let bs;
      while ((bs = bgWalker.nextNode())) existingBgSpans.push(bs);
      existingBgSpans.forEach(function (s) { try { editor.dom.unwrap(s); } catch (e) {} });

      let existingGradBgSpans = [];
      let gbWalker2 = document.createTreeWalker(editor.getBody(), NodeFilter.SHOW_ELEMENT, {
        acceptNode: function (el) {
          if (el.nodeName === 'SPAN' && el.classList && el.classList.contains('gradient-bg') && rng.intersectsNode(el))
            return NodeFilter.FILTER_ACCEPT;
          return NodeFilter.FILTER_SKIP;
        }
      });
      let gs2;
      while ((gs2 = gbWalker2.nextNode())) existingGradBgSpans.push(gs2);
      existingGradBgSpans.forEach(function (s) { try { editor.dom.unwrap(s); } catch (e) {} });

      let gradTextSpans = [];
      let gtWalker = document.createTreeWalker(editor.getBody(), NodeFilter.SHOW_ELEMENT, {
        acceptNode: function (el) {
          if (el.nodeName === 'SPAN' && el.classList && el.classList.contains('gradient-text') && rng.intersectsNode(el))
            return NodeFilter.FILTER_ACCEPT;
          return NodeFilter.FILTER_SKIP;
        }
      });
      let gts;
      while ((gts = gtWalker.nextNode())) gradTextSpans.push(gts);

      if (gradTextSpans.length > 0) {
        gradTextSpans.sort(function (a, b) {
          return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
        });
        gradTextSpans.forEach(function (s) {
          let wrapper = editor.dom.create('span', {
            'class': 'tmce-backcolor',
            'style': 'background-color:' + rgbaColor + ';'
          });
          s.parentNode.insertBefore(wrapper, s);
          wrapper.appendChild(s);
          editor._backcolorSpans.push(wrapper);
        });
      } else {
        _wrapTextNodesInSel(editor, function (parent, before, text) {
          let span = editor.dom.create('span', {
            'class': 'tmce-backcolor',
            'style': 'background-color:' + rgbaColor + ';'
          }, text);
          parent.insertBefore(span, before);
          editor._backcolorSpans.push(span);
        });
      }

      let firstBg = editor._backcolorSpans.length > 0 ? editor._backcolorSpans[0] : null;
      let lastBg = editor._backcolorSpans.length > 0 ? editor._backcolorSpans[editor._backcolorSpans.length - 1] : null;
      if (firstBg && lastBg) {
        try {
          let newRng = document.createRange();
          newRng.setStartBefore(firstBg);
          newRng.setEndAfter(lastBg);
          editor.selection.setRng(newRng);
        } catch (e) {}
      }

      _syncLiBg();
    });
  }

  function applyAlphaToGradient(css, alpha) {
    let a = alpha >= 1 ? 1 : alpha;
    css = css.replace(/#([0-9a-fA-F]{6})\b/g, function (m, h) {
      return 'rgba(' + parseInt(h.substr(0, 2), 16) + ',' + parseInt(h.substr(2, 2), 16) + ',' + parseInt(h.substr(4, 2), 16) + ',' + a + ')';
    });
    css = css.replace(/#([0-9a-fA-F]{3})\b/g, function (m, h) {
      return 'rgba(' + parseInt(h[0] + h[0], 16) + ',' + parseInt(h[1] + h[1], 16) + ',' + parseInt(h[2] + h[2], 16) + ',' + a + ')';
    });
    css = css.replace(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/g, function (m, r, g, b) {
      return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
    });
    css = css.replace(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*[\d.]+\s*\)/g, function (m, r, g, b) {
      return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
    });
    return css;
  }

  function applyBackgroundGradient(gradientCss) {
    let editor = state.tinyEditor;
    if (!editor) return;
    let rng = editor.selection.getRng();
    if (rng.collapsed && editor._savedBackRange) { rng = editor._savedBackRange; }
    delete editor._savedBackRange;
    if (rng.collapsed) return;

    let _syncLi = function () {
      let lisToCheck = [];
      try {
        let liW = document.createTreeWalker(
          editor.getBody(), NodeFilter.SHOW_ELEMENT,
          { acceptNode: function (el) { return el.nodeName === 'LI' && rng.intersectsNode(el) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP; }},
          false
        );
        let l;
        while ((l = liW.nextNode())) { if (lisToCheck.indexOf(l) === -1) lisToCheck.push(l); }
        lisToCheck.forEach(function (li) {
          let hasGrad = li.querySelector('span.gradient-bg');
          if (hasGrad) {
            li.style.setProperty('--mkr-bg-image', gradientCss);
          } else {
            li.style.removeProperty('--mkr-bg-image');
          }
          li.style.removeProperty('--mkr-bg-clip');
          li.style.removeProperty('--mkr-text-fill');
        });
      } catch (e3) {}
    };

    editor.undoManager.transact(function () {
      editor._backcolorSpans = [];

      let clearSpans = [];
      let csWalker = document.createTreeWalker(editor.getBody(), NodeFilter.SHOW_ELEMENT, {
        acceptNode: function (el) {
          if (el.nodeName === 'SPAN' && rng.intersectsNode(el) &&
              (el.classList.contains('gradient-bg') || el.classList.contains('tmce-backcolor'))) {
            return NodeFilter.FILTER_ACCEPT;
          }
          return NodeFilter.FILTER_SKIP;
        }
      });
      let cs;
      while ((cs = csWalker.nextNode())) clearSpans.push(cs);
      clearSpans.forEach(function (s) { try { editor.dom.unwrap(s); } catch (e) {} });

      let gtSpans = [];
      let gtWalker = document.createTreeWalker(editor.getBody(), NodeFilter.SHOW_ELEMENT, {
        acceptNode: function (el) {
          if (el.nodeName === 'SPAN' && el.classList.contains('gradient-text') && rng.intersectsNode(el))
            return NodeFilter.FILTER_ACCEPT;
          return NodeFilter.FILTER_SKIP;
        }
      });
      let gts;
      while ((gts = gtWalker.nextNode())) gtSpans.push(gts);

      if (gtSpans.length > 0) {
        gtSpans.sort(function (a, b) {
          return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
        });
        gtSpans.forEach(function (s) {
          let wrapper = editor.dom.create('span', {
            'class': 'gradient-bg',
            'style': 'background-image:' + gradientCss + ';',
            'data-original-gradient': gradientCss
          });
          s.parentNode.insertBefore(wrapper, s);
          wrapper.appendChild(s);
          editor._backcolorSpans.push(wrapper);
        });
      } else {
        _wrapTextNodesInSel(editor, function (parent, before, text) {
          let span = editor.dom.create('span', {
            'class': 'gradient-bg',
            'style': 'background-image:' + gradientCss + ';',
            'data-original-gradient': gradientCss
          }, text);
          parent.insertBefore(span, before);
          editor._backcolorSpans.push(span);
        });
      }

      let firstBg = editor._backcolorSpans.length > 0 ? editor._backcolorSpans[0] : null;
      let lastBg = editor._backcolorSpans.length > 0 ? editor._backcolorSpans[editor._backcolorSpans.length - 1] : null;
      if (firstBg && lastBg) {
        try {
          let newRng = document.createRange();
          newRng.setStartBefore(firstBg);
          newRng.setEndAfter(lastBg);
          editor.selection.setRng(newRng);
        } catch (e) {}
      }

      _syncLi();
    });
  }

  function ensureForecolorPanel() {
    if (forecolorPanel) return forecolorPanel;
    let panel = document.createElement('div');
    panel.id = 'gradientCustomPanel';
    panel.style.cssText = 'display:none;position:fixed;z-index:10001;background:#0d1f2b;border:1px solid #2c6e7e;border-radius:12px;padding:10px;box-shadow:0 4px 20px rgba(0,0,0,0.7);min-width:200px;';

    let titleRow = document.createElement('div');
    titleRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;';
    let solidLabel = document.createElement('span');
    solidLabel.textContent = '标准颜色';
    solidLabel.style.cssText = 'color:#8899aa;font-size:11px;';
    titleRow.appendChild(solidLabel);
    let curDisplay = document.createElement('span');
    curDisplay.id = 'forecolorCurDisplay';
    curDisplay.style.cssText = 'font-size:11px;color:#8899aa;';
    titleRow.appendChild(curDisplay);
    panel.appendChild(titleRow);

    let grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(10,20px);gap:2px;margin-bottom:8px;';
    solidColors.forEach(function (color) {
      let swatch = document.createElement('div');
      swatch.style.cssText = 'width:20px;height:20px;background:' + color + ';border-radius:3px;cursor:pointer;border:1px solid #444;box-sizing:border-box;';
      swatch.addEventListener('mousedown', function (e) {
        e.preventDefault();
        applySolidForecolor(color);
        curDisplay.textContent = color;
        curDisplay.style.color = color;
      });
      swatch.addEventListener('mouseenter', function () { swatch.style.border = '2px solid #fff'; });
      swatch.addEventListener('mouseleave', function () { swatch.style.border = '1px solid #444'; });
      grid.appendChild(swatch);
    });
    panel.appendChild(grid);

    let customRow = document.createElement('div');
    customRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:8px;';
    let customInput = document.createElement('input');
    customInput.type = 'color';
    customInput.id = 'forecolorCustomColor';
    customInput.value = '#ff0000';
    customInput.style.cssText = 'width:28px;height:24px;border:none;cursor:pointer;padding:0;background:none;';
    customInput.addEventListener('focus', function () {
      let ed = state.tinyEditor;
      if (!ed) return;
      customInput._bookmark = ed.selection.getBookmark();
    });
    customInput.addEventListener('input', function () {
      let ed = state.tinyEditor;
      if (ed && customInput._bookmark) {
        ed.selection.moveToBookmark(customInput._bookmark);
        customInput._bookmark = null;
      }
      applySolidForecolor(customInput.value);
      curDisplay.textContent = customInput.value;
      curDisplay.style.color = customInput.value;
    });
    customRow.appendChild(customInput);
    let pickLabel = document.createElement('span');
    pickLabel.textContent = '取色器';
    pickLabel.style.cssText = 'color:#8899aa;font-size:11px;';
    customRow.appendChild(pickLabel);
    panel.appendChild(customRow);

    let sep1 = document.createElement('div');
    sep1.style.cssText = 'height:1px;background:#1e3a44;margin:6px 0;';
    panel.appendChild(sep1);

    let gradLabel = document.createElement('div');
    gradLabel.textContent = '渐变颜色';
    gradLabel.style.cssText = 'color:#8899aa;font-size:11px;margin-bottom:5px;';
    panel.appendChild(gradLabel);

    gradientPresets.forEach(function (p) {
      let btn = document.createElement('div');
      btn.style.cssText = 'background:' + p.gradient + ';color:#fff;padding:3px 8px;border-radius:5px;cursor:pointer;margin-bottom:3px;font-size:12px;text-align:center;text-shadow:0 1px 2px rgba(0,0,0,0.5);';
      btn.textContent = p.text;
      btn.addEventListener('mousedown', function (e) { e.preventDefault(); applyTextGradient(p.gradient); });
      panel.appendChild(btn);
    });

    let sep2 = document.createElement('div');
    sep2.style.cssText = 'height:1px;background:#1e3a44;margin:6px 0;';
    panel.appendChild(sep2);

    let customGradBtn = document.createElement('div');
    customGradBtn.textContent = '自定义渐变...';
    customGradBtn.style.cssText = 'background:#1a3a44;border:1px solid #2c6e7e;color:#ccd;cursor:pointer;border-radius:5px;padding:5px 8px;font-size:12px;text-align:center;';
    customGradBtn.addEventListener('mousedown', function (e) {
      e.preventDefault();
      let ed = state.tinyEditor;
      let bm = ed ? ed.selection.getBookmark() : null;
      showCustomGradientDialog(bm, applyTextGradient);
    });
    panel.appendChild(customGradBtn);

    document.body.appendChild(panel);
    document.addEventListener('click', function (e) {
      if (panel.style.display === 'block' && !panel.contains(e.target) && !e.target.closest('[aria-label="文本颜色"]')) {
        panel.style.display = 'none';
        if (state.tinyEditor) delete state.tinyEditor._savedRange;
      }
    });
    forecolorPanel = panel;
    return panel;
  }

  function showForecolorPanel(anchorEl) {
    let panel = ensureForecolorPanel();
    if (panel.style.display === 'block') { panel.style.display = 'none'; if (state.tinyEditor) delete state.tinyEditor._savedRange; return; }

    // TextBox 编辑时保存选区
    if (isEditingTextBox()) {
      const el = getEditingTextBoxElement();
      if (el) {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
          state._textBoxSavedRange = selection.getRangeAt(0).cloneRange();
        }
      }
    } else {
      let editor = state.tinyEditor;
      if (editor) {
        let rng = editor.selection.getRng();
        if (!rng.collapsed) { editor._savedRange = rng.cloneRange(); }
      }
    }

    let rect = anchorEl.getBoundingClientRect();
    panel.style.display = 'block';
    panel.style.left = Math.min(rect.left, window.innerWidth - 230) + 'px';
    panel.style.top = (rect.bottom + 4) + 'px';
  }

  let backcolorPanel = null;

  function ensureBackcolorPanel() {
    if (backcolorPanel) return backcolorPanel;
    let panel = document.createElement('div');
    panel.id = 'backcolorCustomPanel';
    panel._colorTarget = null;
    panel._originalBackground = null;
    panel.style.cssText = 'display:none;position:fixed;z-index:10001;background:#0d1f2b;border:1px solid #2c6e7e;border-radius:12px;padding:10px;box-shadow:0 4px 20px rgba(0,0,0,0.7);min-width:200px;';

    let titleRow = document.createElement('div');
    titleRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;';
    let solidLabel = document.createElement('span');
    solidLabel.textContent = '标准颜色';
    solidLabel.style.cssText = 'color:#8899aa;font-size:11px;';
    titleRow.appendChild(solidLabel);
    let curDisplay = document.createElement('span');
    curDisplay.id = 'backcolorCurDisplay';
    curDisplay.style.cssText = 'font-size:11px;color:#8899aa;';
    titleRow.appendChild(curDisplay);
    panel.appendChild(titleRow);

    let opacitySlider = panel._opacitySlider = document.createElement('input');
    opacitySlider.type = 'range';
    opacitySlider.min = '10';
    opacitySlider.max = '100';
    opacitySlider.value = '100';
    function getOpacity() { return parseInt(opacitySlider.value); }

    let grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(10,20px);gap:2px;margin-bottom:8px;';
    solidColors.forEach(function (color) {
      let swatch = document.createElement('div');
      swatch.style.cssText = 'width:20px;height:20px;background:' + color + ';border-radius:3px;cursor:pointer;border:1px solid #444;box-sizing:border-box;';
      swatch.addEventListener('mousedown', function (e) {
        e.preventDefault();
        if (panel._colorTarget) {
          panel._currentBackcolor = color;
          panel._colorTarget.style.background = color;
          panel._colorTarget.style.removeProperty('opacity');
          syncFileLinkMceStyle(panel._colorTarget);
          curDisplay.textContent = color;
          curDisplay.style.color = color;
          return;
        }
        panel._currentBackcolor = color;
        applySolidBackcolor(color, getOpacity());
        curDisplay.textContent = color;
        curDisplay.style.color = color;
      });
      swatch.addEventListener('mouseenter', function () { swatch.style.border = '2px solid #fff'; });
      swatch.addEventListener('mouseleave', function () { swatch.style.border = '1px solid #444'; });
      grid.appendChild(swatch);
    });
    panel.appendChild(grid);

    let customRow = document.createElement('div');
    customRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:8px;';
    let customInput = document.createElement('input');
    customInput.type = 'color';
    customInput.id = 'backcolorCustomColor';
    customInput.value = '#ff0000';
    customInput.style.cssText = 'width:28px;height:24px;border:none;cursor:pointer;padding:0;background:none;';
    customInput.addEventListener('focus', function () {
      let ed = state.tinyEditor;
      if (!ed) return;
      customInput._bookmark = ed.selection.getBookmark();
    });
    customInput.addEventListener('input', function () {
      if (panel._colorTarget) {
        panel._currentBackcolor = customInput.value;
        panel._colorTarget.style.background = customInput.value;
        panel._colorTarget.style.removeProperty('opacity');
        syncFileLinkMceStyle(panel._colorTarget);
        curDisplay.textContent = customInput.value;
        curDisplay.style.color = customInput.value;
        return;
      }
      let ed = state.tinyEditor;
      if (ed && customInput._bookmark) {
        ed.selection.moveToBookmark(customInput._bookmark);
        customInput._bookmark = null;
      }
      panel._currentBackcolor = customInput.value;
      applySolidBackcolor(customInput.value, getOpacity());
      curDisplay.textContent = customInput.value;
      curDisplay.style.color = customInput.value;
    });
    customRow.appendChild(customInput);
    let pickLabel = document.createElement('span');
    pickLabel.textContent = '取色器';
    pickLabel.style.cssText = 'color:#8899aa;font-size:11px;';
    customRow.appendChild(pickLabel);
    panel.appendChild(customRow);

    let sep1 = document.createElement('div');
    sep1.style.cssText = 'height:1px;background:#1e3a44;margin:6px 0;';
    panel.appendChild(sep1);

    let gradLabel = document.createElement('div');
    gradLabel.textContent = '渐变背景';
    gradLabel.style.cssText = 'color:#8899aa;font-size:11px;margin-bottom:5px;';
    panel.appendChild(gradLabel);

    gradientPresets.forEach(function (p) {
      let btn = document.createElement('div');
      btn.style.cssText = 'background:' + p.gradient + ';color:#fff;padding:3px 8px;border-radius:5px;cursor:pointer;margin-bottom:3px;font-size:12px;text-align:center;text-shadow:0 1px 2px rgba(0,0,0,0.5);';
      btn.textContent = p.text;
      btn.addEventListener('mousedown', function (e) {
        e.preventDefault();
        if (panel._colorTarget) {
          panel._colorTarget.style.background = p.gradient;
          panel._colorTarget.style.removeProperty('opacity');
          syncFileLinkMceStyle(panel._colorTarget);
          return;
        }
        applyBackgroundGradient(p.gradient);
      });
      panel.appendChild(btn);
    });

    let sep2 = document.createElement('div');
    sep2.style.cssText = 'height:1px;background:#1e3a44;margin:6px 0;';
    panel.appendChild(sep2);

    let customGradBtn = document.createElement('div');
    customGradBtn.textContent = '自定义渐变...';
    customGradBtn.style.cssText = 'background:#1a3a44;border:1px solid #2c6e7e;color:#ccd;cursor:pointer;border-radius:5px;padding:5px 8px;font-size:12px;text-align:center;';
    customGradBtn.addEventListener('mousedown', function (e) {
      e.preventDefault();
      if (panel._colorTarget) {
        showCustomGradientDialog(null, function (gradientCss) {
          panel._colorTarget.style.background = gradientCss;
          panel._colorTarget.style.removeProperty('opacity');
          syncFileLinkMceStyle(panel._colorTarget);
        });
        return;
      }
      let ed = state.tinyEditor;
      let bm = ed ? ed.selection.getBookmark() : null;
      showCustomGradientDialog(bm, applyBackgroundGradient);
    });
    panel.appendChild(customGradBtn);

    let sep3 = document.createElement('div');
    sep3.style.cssText = 'height:1px;background:#1e3a44;margin:6px 0;';
    panel.appendChild(sep3);

    let opacityRow = document.createElement('div');
    opacityRow.style.cssText = 'display:flex;align-items:center;gap:6px;';
    let opacityLabel = document.createElement('span');
    opacityLabel.textContent = '透明度';
    opacityLabel.style.cssText = 'color:#8899aa;font-size:11px;flex-shrink:0;';
    opacityRow.appendChild(opacityLabel);
    opacitySlider.style.cssText = 'flex:1;accent-color:#2c6e7e;';
    opacityRow.appendChild(opacitySlider);
    let opacityDisplay = document.createElement('span');
    opacityDisplay.textContent = '100%';
    opacityDisplay.style.cssText = 'color:#ccd;font-size:12px;min-width:36px;text-align:center;';
    opacityRow.appendChild(opacityDisplay);
    opacitySlider.addEventListener('input', function () {
      opacityDisplay.textContent = opacitySlider.value + '%';
      if (panel._colorTarget) {
        let op = getOpacity();
        panel._colorTarget.style.opacity = (op >= 100) ? '' : (op / 100);
        syncFileLinkMceStyle(panel._colorTarget);
        return;
      }
      let editor = state.tinyEditor;
      if (!editor) return;
      let spans = editor._backcolorSpans;
      if (!spans || spans.length === 0) return;
      let op = getOpacity();
      spans.forEach(function (span) {
        if (!span || !span.parentNode) return;
        if (span.classList.contains('gradient-bg') && span.dataset.originalGradient) {
          span.style.removeProperty('opacity');
          let orig = span.dataset.originalGradient;
          span.style.backgroundImage = applyAlphaToGradient(orig, op / 100);
        } else if (panel._currentBackcolor) {
          if (op >= 100) { span.style.backgroundColor = panel._currentBackcolor; }
          else {
            let c = panel._currentBackcolor;
            let rr = parseInt(c.slice(1, 3), 16);
            let gg = parseInt(c.slice(3, 5), 16);
            let bb = parseInt(c.slice(5, 7), 16);
            span.style.backgroundColor = 'rgba(' + rr + ',' + gg + ',' + bb + ',' + (op / 100) + ')';
          }
        }
      });
    });
    panel.appendChild(opacityRow);

    let restoreRow = document.createElement('div');
    restoreRow.style.cssText = 'display:none;margin-top:6px;';
    panel._restoreRow = restoreRow;
    let restoreBtn = document.createElement('button');
    restoreBtn.textContent = '🔄 恢复默认';
    restoreBtn.style.cssText = 'background:#2c4a5a;color:#eef;border:1px solid #2c6e7e;border-radius:8px;padding:4px 12px;cursor:pointer;font-size:12px;width:100%;';
    restoreBtn.addEventListener('mousedown', function (e) {
      e.preventDefault();
      if (panel._colorTarget) {
        panel._colorTarget.style.background = panel._originalBackground || '';
        panel._colorTarget.style.removeProperty('opacity');
        syncFileLinkMceStyle(panel._colorTarget);
      }
    });
    restoreRow.appendChild(restoreBtn);
    panel.appendChild(restoreRow);

    document.body.appendChild(panel);
    document.addEventListener('click', function (e) {
      if (panel.style.display === 'block' && !panel.contains(e.target) && !e.target.closest('[aria-label="背景颜色"]')) {
        panel.style.display = 'none';
        panel._colorTarget = null;
        panel._originalBackground = null;
        if (panel._restoreRow) panel._restoreRow.style.display = 'none';
        if (state.tinyEditor) delete state.tinyEditor._savedBackRange;
      }
    });
    backcolorPanel = panel;
    return panel;
  }

  editor._ensureBackcolorPanel = ensureBackcolorPanel;

  function showBackcolorPanel(anchorEl) {
    let panel = ensureBackcolorPanel();
    panel._colorTarget = null;
    panel._originalBackground = null;
    if (panel._restoreRow) panel._restoreRow.style.display = 'none';
    if (panel.style.display === 'block') { panel.style.display = 'none'; if (state.tinyEditor) delete state.tinyEditor._savedBackRange; return; }

    // TextBox 编辑时保存选区
    if (isEditingTextBox()) {
      const el = getEditingTextBoxElement();
      if (el) {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
          state._textBoxSavedBackRange = selection.getRangeAt(0).cloneRange();
        }
      }
    } else {
      let editor = state.tinyEditor;
      if (editor) {
        let rng = editor.selection.getRng();
        if (!rng.collapsed) { editor._savedBackRange = rng.cloneRange(); }
      }
    }

    let rect = anchorEl.getBoundingClientRect();
    panel.style.display = 'block';
    panel.style.left = Math.min(rect.left, window.innerWidth - 230) + 'px';
    panel.style.top = (rect.bottom + 4) + 'px';
  }

  function showCustomGradientDialog(bookmark, targetFn) {
    let existingDlg = document.getElementById('customGradientOverlay');
    if (existingDlg) { existingDlg.remove(); }

    let overlay = document.createElement('div');
    overlay.id = 'customGradientOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:10002;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;';

    let dlg = document.createElement('div');
    dlg.id = 'customGradientDialog';
    dlg.style.cssText = 'background:#0d1f2b;border:1px solid #2c6e7e;border-radius:14px;padding:14px;box-shadow:0 6px 30px rgba(0,0,0,0.8);min-width:360px;max-width:420px;';

    let titleBar = document.createElement('div');
    titleBar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;';
    let titleLabel = document.createElement('span');
    titleLabel.textContent = '自定义渐变';
    titleLabel.style.cssText = 'color:#ccd;font-size:14px;font-weight:bold;';
    titleBar.appendChild(titleLabel);
    let closeBtn = document.createElement('span');
    closeBtn.textContent = '\u2715';
    closeBtn.style.cssText = 'color:#8899aa;cursor:pointer;font-size:16px;';
    closeBtn.addEventListener('click', function () { overlay.remove(); });
    titleBar.appendChild(closeBtn);
    dlg.appendChild(titleBar);

    let previewBar = document.createElement('div');
    previewBar.id = 'gradPreviewBar';
    previewBar.style.cssText = 'width:100%;height:36px;border-radius:6px;border:1px solid #2c6e7e;margin-bottom:10px;';
    dlg.appendChild(previewBar);

    let stopsContainer = document.createElement('div');
    stopsContainer.style.cssText = 'margin-bottom:8px;max-height:200px;overflow-y:auto;';

    let stops = [
      { color: '#ff416c', position: 0 },
      { color: '#4a86e8', position: 100 }
    ];

    function buildGradientCSS() {
      stops.sort(function (a, b) { return a.position - b.position; });
      let parts = stops.map(function (s) { return s.color + ' ' + s.position + '%'; });
      return parts.join(', ');
    }

    function updatePreview() {
      let angle = parseInt(angleInput.value) || 0;
      let css = 'linear-gradient(' + angle + 'deg, ' + buildGradientCSS() + ')';
      previewBar.style.background = css;
    }

    function renderStops() {
      stopsContainer.innerHTML = '';
      stops.forEach(function (stop, index) {
        let row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:5px;';

        let colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.value = stop.color;
        colorInput.style.cssText = 'width:28px;height:24px;border:none;cursor:pointer;padding:0;background:none;flex-shrink:0;';
        colorInput.addEventListener('input', function () {
          stop.color = colorInput.value;
          updatePreview();
        });
        row.appendChild(colorInput);

        let posLabel = document.createElement('span');
        posLabel.textContent = '位置:';
        posLabel.style.cssText = 'color:#8899aa;font-size:11px;flex-shrink:0;';
        row.appendChild(posLabel);

        let posInput = document.createElement('input');
        posInput.type = 'number';
        posInput.min = '0';
        posInput.max = '100';
        posInput.value = stop.position;
        posInput.style.cssText = 'width:48px;background:#122;border:1px solid #2c6e7e;color:#ccd;border-radius:4px;padding:2px 4px;font-size:12px;text-align:center;';
        posInput.addEventListener('input', function () {
          let v = parseInt(posInput.value);
          if (isNaN(v)) v = 0;
          if (v < 0) v = 0;
          if (v > 100) v = 100;
          stop.position = v;
          posInput.value = v;
          updatePreview();
        });
        posInput.addEventListener('change', function () {
          let v = parseInt(posInput.value);
          if (isNaN(v)) v = 0;
          if (v < 0) v = 0;
          if (v > 100) v = 100;
          stop.position = v;
          posInput.value = v;
          updatePreview();
        });
        row.appendChild(posInput);

        let pctLabel = document.createElement('span');
        pctLabel.textContent = '%';
        pctLabel.style.cssText = 'color:#8899aa;font-size:11px;flex-shrink:0;';
        row.appendChild(pctLabel);

        if (stops.length > 2) {
          let delBtn = document.createElement('button');
          delBtn.textContent = '\u2715';
          delBtn.style.cssText = 'background:#3a1a1a;border:1px solid #6e2c2c;color:#e88;cursor:pointer;border-radius:4px;padding:1px 5px;font-size:12px;flex-shrink:0;';
          delBtn.addEventListener('click', function () {
            stops.splice(index, 1);
            renderStops();
            updatePreview();
          });
          row.appendChild(delBtn);
        }

        stopsContainer.appendChild(row);
      });
    }

    let stopsLabel = document.createElement('div');
    stopsLabel.textContent = '色标';
    stopsLabel.style.cssText = 'color:#8899aa;font-size:11px;margin-bottom:4px;';
    dlg.appendChild(stopsLabel);
    dlg.appendChild(stopsContainer);

    let addStopBtn = document.createElement('button');
    addStopBtn.textContent = '+ 添加色标';
    addStopBtn.style.cssText = 'background:#1a3a44;border:1px solid #2c6e7e;color:#aac;cursor:pointer;border-radius:5px;padding:3px 10px;font-size:12px;margin-bottom:10px;width:100%;';
    addStopBtn.addEventListener('click', function () {
      let midPos = 50;
      if (stops.length > 0) {
        let sum = 0;
        stops.forEach(function (s) { sum += s.position; });
        midPos = Math.round(sum / stops.length);
      }
      stops.push({ color: '#ffffff', position: midPos });
      renderStops();
      updatePreview();
    });
    dlg.appendChild(addStopBtn);

    let sepD = document.createElement('div');
    sepD.style.cssText = 'height:1px;background:#1e3a44;margin:6px 0;';
    dlg.appendChild(sepD);

    let dirLabel = document.createElement('div');
    dirLabel.textContent = '渐变方向';
    dirLabel.style.cssText = 'color:#8899aa;font-size:11px;margin-bottom:4px;';
    dlg.appendChild(dirLabel);

    let angleRow = document.createElement('div');
    angleRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;';

    let angleInput = document.createElement('input');
    angleInput.type = 'range';
    angleInput.min = '0';
    angleInput.max = '360';
    angleInput.value = '90';
    angleInput.style.cssText = 'flex:1;accent-color:#2c6e7e;';
    angleRow.appendChild(angleInput);

    let angleDisplay = document.createElement('span');
    angleDisplay.textContent = '90°';
    angleDisplay.style.cssText = 'color:#ccd;font-size:13px;min-width:36px;text-align:center;';
    angleRow.appendChild(angleDisplay);

    angleInput.addEventListener('input', function () {
      let v = parseInt(angleInput.value);
      angleDisplay.textContent = v + '\u00B0';
      updatePreview();
    });
    dlg.appendChild(angleRow);

    let dirPresets = [
      { char: '\u2192', angle: 90, label: '右' },
      { char: '\u2198', angle: 135, label: '右下' },
      { char: '\u2193', angle: 180, label: '下' },
      { char: '\u2199', angle: 225, label: '左下' },
      { char: '\u2190', angle: 270, label: '左' },
      { char: '\u2196', angle: 315, label: '左上' },
      { char: '\u2191', angle: 0, label: '上' },
      { char: '\u2197', angle: 45, label: '右上' }
    ];
    let dirGrid = document.createElement('div');
    dirGrid.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-bottom:10px;';
    dirPresets.forEach(function (dp) {
      let db = document.createElement('button');
      db.textContent = dp.char;
      db.title = dp.angle + '\u00B0 ' + dp.label;
      db.style.cssText = 'background:#1a3a44;border:1px solid #2c6e7e;color:#ccd;cursor:pointer;border-radius:4px;padding:3px;font-size:14px;text-align:center;';
      db.addEventListener('click', function () {
        angleInput.value = dp.angle;
        angleDisplay.textContent = dp.angle + '\u00B0';
        updatePreview();
      });
      dirGrid.appendChild(db);
    });
    dlg.appendChild(dirGrid);

    let btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;';

    let cancelBtn = document.createElement('button');
    cancelBtn.textContent = '取消';
    cancelBtn.style.cssText = 'flex:1;background:#1a3a44;border:1px solid #2c6e7e;color:#ccd;cursor:pointer;border-radius:6px;padding:6px;font-size:13px;';
    cancelBtn.addEventListener('click', function () { overlay.remove(); });
    btnRow.appendChild(cancelBtn);

    let applyBtn = document.createElement('button');
    applyBtn.textContent = '应用渐变';
    applyBtn.style.cssText = 'flex:1;background:#2c6e7e;border:none;color:#fff;cursor:pointer;border-radius:6px;padding:6px;font-size:13px;font-weight:bold;';
    applyBtn.addEventListener('click', function () {
      let ed = state.tinyEditor;
      if (ed && bookmark) { ed.selection.moveToBookmark(bookmark); }
      let angle = parseInt(angleInput.value) || 0;
      let css = 'linear-gradient(' + angle + 'deg, ' + buildGradientCSS() + ')';
      (targetFn || applyTextGradient)(css);
      overlay.remove();
    });
    btnRow.appendChild(applyBtn);
    dlg.appendChild(btnRow);

    dlg.addEventListener('mousedown', function (e) {
      e.stopPropagation();
    });

    overlay.appendChild(dlg);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) overlay.remove();
    });

    renderStops();
    updatePreview();
  }

  try {
    editor.ui.registry.addToggleButton('customforecolor', {
      text: 'A',
      tooltip: '文本颜色',
      onAction: function (api) {
        // 如果正在编辑 textbox，先保存选区
        if (isEditingTextBox()) {
          saveTextBoxSelection();
        }
        let wasActive = api.isActive();
        let el = document.querySelector('[aria-label="文本颜色"]');
        if (el) showForecolorPanel(el);
        api.setActive(wasActive);
      },
      onSetup: function (api) {
        function updateState() {
          let node = editor.selection.getNode();
          let gradSpan = editor.dom.getParent(node, 'span.gradient-text');
          let fc = editor.queryCommandValue('forecolor');
          if (gradSpan) { api.setText('\u25C8'); api.setActive(true); }
          else if (fc && fc !== '#ffffff' && fc !== '#fff' && fc !== 'rgb(255,255,255)') { api.setText('A'); api.setActive(true); }
          else { api.setText('A'); api.setActive(false); }
        }
        updateState();
        editor.on('NodeChange', updateState);
        return function () { editor.off('NodeChange', updateState); };
      }
    });
  } catch (e) {
    console.error('[TinyMCE] customforecolor 按钮注册失败:', e);
  }

  try {
    editor.ui.registry.addToggleButton('custombackcolor', {
      text: 'BG',
      tooltip: '背景颜色',
      onAction: function (api) {
        // 如果正在编辑 textbox，先保存选区
        if (isEditingTextBox()) {
          saveTextBoxSelection();
        }
        let wasActive = api.isActive();
        let el = document.querySelector('[aria-label="背景颜色"]');
        if (el) showBackcolorPanel(el);
        api.setActive(wasActive);
      },
      onSetup: function (api) {
        function updateState() {
          let node = editor.selection.getNode();
          let bc = editor.queryCommandValue('backcolor');
          if (bc && bc !== '#ffffff' && bc !== '#fff' && bc !== 'rgb(255,255,255)') { api.setText('BG'); api.setActive(true); }
          else { api.setText('BG'); api.setActive(false); }
        }
        updateState();
        editor.on('NodeChange', updateState);
        return function () { editor.off('NodeChange', updateState); };
      }
    });
  } catch (e) {
    console.error('[TinyMCE] custombackcolor 按钮注册失败:', e);
  }
}