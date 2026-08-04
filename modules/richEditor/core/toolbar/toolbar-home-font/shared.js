// ============================================================
//  shared.js — 跨功能共享的工具函数和数据
// ============================================================

import { state } from '../../../shared-state.js';

// ── 颜色预设 ──
export const solidColors = [
  '#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#efefef', '#f3f3f3', '#ffffff',
  '#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff',
  '#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc',
  '#dd7e6b', '#ea9999', '#f9cb9c', '#ffe599', '#b6d7a8', '#a2c4c9', '#a4c2f4', '#9fc5e8', '#b4a7d6', '#d5a6bd'
];

export const gradientPresets = [
  { text: '暖色渐变', gradient: 'linear-gradient(to right, #ff416c, #ff4b2b)' },
  { text: '冷色渐变', gradient: 'linear-gradient(to right, #2193b0, #6dd5ed)' },
  { text: '紫金渐变', gradient: 'linear-gradient(to right, #8e2de2, #f7b733)' },
  { text: '海洋渐变', gradient: 'linear-gradient(to right, #00b4db, #0083b0)' },
  { text: '霓虹渐变', gradient: 'linear-gradient(to right, #fc466b, #3f5efb)' },
  { text: '日落渐变', gradient: 'linear-gradient(to right, #fdc830, #f37335)' },
  { text: '极光渐变', gradient: 'linear-gradient(to right, #11998e, #38ef7d)' },
  { text: '粉蓝渐变', gradient: 'linear-gradient(to right, #f093fb, #f5576c)' }
];

// ── 文本节点包裹工具 ──
export function _wrapTextNodesInSel(editor, wrapFn) {
  let rng = editor.selection.getRng();
  if (rng.collapsed) return false;
  let iter = document.createNodeIterator(
    rng.commonAncestorContainer,
    NodeFilter.SHOW_TEXT,
    { acceptNode: function (node) {
      try { return rng.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT; }
      catch (e) { return NodeFilter.FILTER_REJECT; }
    }},
    false
  );
  let textNodes = [];
  let n;
  while ((n = iter.nextNode())) textNodes.push(n);
  if (textNodes.length === 0) return false;

  let firstNew = null;
  let lastNew = null;

  function _trackWrapper(node) {
    if (!node) return;
    if (!firstNew || (node.compareDocumentPosition(firstNew) & Node.DOCUMENT_POSITION_FOLLOWING)) {
      firstNew = node;
    }
    if (!lastNew || (lastNew.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING)) {
      lastNew = node;
    }
  }

  let rubySet = [];
  textNodes.forEach(function (tn) {
    let p = tn.parentNode;
    if (p && p.nodeName === 'RUBY' && rubySet.indexOf(p) === -1) rubySet.push(p);
  });

  let rubyWrappers = [];

  if (rubySet.length > 0) {
    rubySet.sort(function (a, b) {
      return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
    });

    function _isConsecutiveRuby(prev, curr) {
      if (prev.parentNode !== curr.parentNode) return false;
      let between = prev.nextSibling;
      while (between && between !== curr) {
        if (between.nodeType === 3) {
          if (/[^\s\p{P}]/u.test(between.textContent)) return false;
        } else if (between.nodeType === 1 && between.nodeName === 'RUBY') {
        } else {
          return false;
        }
        between = between.nextSibling;
      }
      return between === curr;
    }

    let rubyGroups = [];
    let curGroup = [rubySet[0]];
    for (let ri = 1; ri < rubySet.length; ri++) {
      if (_isConsecutiveRuby(rubySet[ri - 1], rubySet[ri])) {
        curGroup.push(rubySet[ri]);
      } else {
        rubyGroups.push(curGroup);
        curGroup = [rubySet[ri]];
      }
    }
    rubyGroups.push(curGroup);

    rubyGroups.forEach(function (group) {
      let firstRuby = group[0];
      let lastRuby = group[group.length - 1];
      let parent = firstRuby.parentNode;
      let prevSib = firstRuby.previousSibling;
      wrapFn(parent, firstRuby, '');
      let wrapper = firstRuby.previousSibling;
      if (wrapper && wrapper.nodeType === 1 && wrapper !== prevSib) {
        let mov = firstRuby;
        while (mov) {
          let nxt = mov.nextSibling;
          wrapper.appendChild(mov);
          if (mov === lastRuby) break;
          mov = nxt;
        }
        rubyWrappers.push(wrapper);
        _trackWrapper(wrapper);
      }
    });
  }

  let filtered = textNodes.filter(function (tn) {
    let p = tn.parentNode;
    if (!p) return false;
    if (p.nodeName === 'RUBY') return false;
    if (p.nodeName === 'RT') return false;
    let anc = p;
    while (anc && anc !== editor.getBody()) {
      if (rubyWrappers.indexOf(anc) !== -1) return false;
      anc = anc.parentNode;
    }
    return true;
  });

  filtered.forEach(function (tn) {
    let text = tn.textContent || '';
    let startOff = (tn === rng.startContainer) ? rng.startOffset : 0;
    let endOff = (tn === rng.endContainer) ? rng.endOffset : text.length;
    if (startOff >= endOff) return;
    let before = text.substring(0, startOff);
    let target = text.substring(startOff, endOff);
    let after = text.substring(endOff);
    if (!target) return;
    let parent = tn.parentNode;
    if (before) parent.insertBefore(document.createTextNode(before), tn);

    let prevSib = tn.previousSibling;
    wrapFn(parent, tn, target);
    let firstInserted = prevSib ? prevSib.nextSibling : parent.firstChild;
    let lastInserted = tn.previousSibling;

    _trackWrapper(firstInserted);
    if (lastInserted && lastInserted !== firstInserted) _trackWrapper(lastInserted);

    if (after) parent.insertBefore(document.createTextNode(after), tn.nextSibling || null);
    parent.removeChild(tn);
  });

  if (firstNew && lastNew) {
    try {
      let newRng = document.createRange();
      if (firstNew.nodeType === 3) {
        newRng.setStart(firstNew, 0);
      } else {
        newRng.setStartBefore(firstNew);
      }
      if (lastNew.nodeType === 3) {
        newRng.setEnd(lastNew, lastNew.textContent.length);
      } else {
        newRng.setEndAfter(lastNew);
      }
      editor.selection.setRng(newRng);
    } catch (e) {}
  }

  return true;
}

// ── 大小写转换 ──
export function changeCase(mode) {
  let ed = state.tinyEditor;
  if (!ed) return;
  let sel = ed.selection.getContent();
  if (!sel) return;
  let target = sel;
  switch (mode) {
    case 'lower': target = sel.toLowerCase(); break;
    case 'upper': target = sel.toUpperCase(); break;
    case 'word': target = sel.replace(/\b\w/g, function (m) { return m.toUpperCase(); }); break;
    case 'sentence':
      target = sel.replace(/(^|[.?!]\s*)(\w)/g, function (m) { return m.toUpperCase(); });
      break;
  }
  ed.selection.setContent(target);
}

// ── 简繁转换 ──
export function convertToTraditional() {
  let ed = state.tinyEditor;
  if (!ed) return;
  if (typeof OpenCC === 'undefined' || !OpenCC.Converter) {
    ed.notificationManager.open({ text: '简繁转换库加载失败，请刷新页面后重试', type: 'error' });
    return;
  }
  let rng = ed.selection.getRng();
  if (rng.collapsed) return;
  let s2t = OpenCC.Converter({ from: 'cn', to: 'tw' });
  let bookmark = ed.selection.getBookmark(2);
  ed.undoManager.transact(function () {
    let iter = document.createNodeIterator(
      rng.commonAncestorContainer,
      NodeFilter.SHOW_TEXT,
      { acceptNode: function (n) {
        try { return rng.intersectsNode(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT; }
        catch (e) { return NodeFilter.FILTER_REJECT; }
      }},
      false
    );
    let node;
    while ((node = iter.nextNode())) {
      if (node.parentNode && (node.parentNode.nodeName === 'RT' || node.parentNode.nodeName === 'RUBY')) continue;
      let text = node.textContent || '';
      let startOff = (node === rng.startContainer) ? rng.startOffset : 0;
      let endOff = (node === rng.endContainer) ? rng.endOffset : text.length;
      if (startOff >= endOff) continue;
      let before = text.substring(0, startOff);
      let target = text.substring(startOff, endOff);
      let after = text.substring(endOff);
      let converted = s2t(target);
      if (converted !== target) {
        node.textContent = before + converted + after;
      }
    }
  });
  try { ed.selection.moveToBookmark(bookmark); } catch (e) {}
}

export function convertToSimplified() {
  let ed = state.tinyEditor;
  if (!ed) return;
  if (typeof OpenCC === 'undefined' || !OpenCC.Converter) {
    ed.notificationManager.open({ text: '简繁转换库加载失败，请刷新页面后重试', type: 'error' });
    return;
  }
  let rng = ed.selection.getRng();
  if (rng.collapsed) return;
  let t2s = OpenCC.Converter({ from: 'tw', to: 'cn' });
  let bookmark = ed.selection.getBookmark(2);
  ed.undoManager.transact(function () {
    let iter = document.createNodeIterator(
      rng.commonAncestorContainer,
      NodeFilter.SHOW_TEXT,
      { acceptNode: function (n) {
        try { return rng.intersectsNode(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT; }
        catch (e) { return NodeFilter.FILTER_REJECT; }
      }},
      false
    );
    let node;
    while ((node = iter.nextNode())) {
      if (node.parentNode && (node.parentNode.nodeName === 'RT' || node.parentNode.nodeName === 'RUBY')) continue;
      let text = node.textContent || '';
      let startOff = (node === rng.startContainer) ? rng.startOffset : 0;
      let endOff = (node === rng.endContainer) ? rng.endOffset : text.length;
      if (startOff >= endOff) continue;
      let before = text.substring(0, startOff);
      let target = text.substring(startOff, endOff);
      let after = text.substring(endOff);
      let converted = t2s(target);
      if (converted !== target) {
        node.textContent = before + converted + after;
      }
    }
  });
  try { ed.selection.moveToBookmark(bookmark); } catch (e) {}
}

// ── 汉字注音 ──
export function addPinyin() {
  let ed = state.tinyEditor;
  if (!ed) return;
  let sel = ed.selection.getContent();
  if (!sel) { ed.notificationManager.open({ text: '请先选择文本', type: 'info' }); return; }

  function _buildRubyFrag(text) {
    let frag = document.createDocumentFragment();
    let i = 0;
    while (i < text.length) {
      if (/[\u4e00-\u9fff]/.test(text[i])) {
        let chStart = i;
        while (i < text.length && /[\u4e00-\u9fff]/.test(text[i])) i++;
        let chBlock = text.substring(chStart, i);
        let pyArr = [];
        try {
          pyArr = window.pinyinPro.pinyin(chBlock, { toneType: 'symbol', type: 'array' });
        } catch (e) {}
        for (let j = 0; j < chBlock.length; j++) {
          let ruby = document.createElement('ruby');
          ruby.appendChild(document.createTextNode(chBlock[j]));
          let rt = document.createElement('rt');
          rt.setAttribute('contenteditable', 'false');
          rt.textContent = pyArr[j] || chBlock[j];
          rt.style.setProperty('-webkit-text-fill-color', 'currentColor');
          rt.style.setProperty('-webkit-background-clip', 'border-box');
          rt.style.setProperty('background-image', 'none');
          ruby.appendChild(rt);
          frag.appendChild(ruby);
        }
      } else {
        let nonStart = i;
        while (i < text.length && !/[\u4e00-\u9fff]/.test(text[i])) i++;
        frag.appendChild(document.createTextNode(text.substring(nonStart, i)));
      }
    }
    return frag;
  }

  let rng = ed.selection.getRng();
  if (rng.collapsed) {
    let found = false;
    let iter = document.createNodeIterator(ed.getBody(), NodeFilter.SHOW_ALL, {
      acceptNode: function (el) {
        if (el.nodeType === 1 && el.nodeName === 'RUBY') { return NodeFilter.FILTER_ACCEPT; }
        return NodeFilter.FILTER_SKIP;
      }
    });
    let rubyEls = [];
    let n;
    while ((n = iter.nextNode())) rubyEls.push(n);
    if (rubyEls.length > 0) {
      rubyEls.forEach(function (rb) {
        let p = rb.parentNode;
        if (p) {
          let txt = document.createTextNode(rb.textContent);
          p.insertBefore(txt, rb);
          p.removeChild(rb);
        }
      });
      found = true;
    }
    if (!found) {
      ed.notificationManager.open({ text: '请先选择文本', type: 'info' });
    }
    return;
  }

  ed.undoManager.transact(function () {
    _wrapTextNodesInSel(ed, function (parent, before, text) {
      let frag = _buildRubyFrag(text);
      parent.insertBefore(frag, before);
      parent.removeChild(before);
    });
  });
}

