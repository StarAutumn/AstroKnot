// ============================================================
//  toolbar/toolbar-doc-layout.js — 布局 tab
// ============================================================

import { state } from '../../shared-state.js';

export function registerLayoutTab(editor) {
  try {
    editor.ui.registry.addMenuButton('columns', {
      text: '\u5206\u680F',
      tooltip: '\u5206\u680F',
      fetch: function (callback) {
        callback([
          { type: 'menuitem', text: '1\u680F', onAction: function () { _applyColumns(1); } },
          { type: 'menuitem', text: '2\u680F', onAction: function () { _applyColumns(2); } },
          { type: 'menuitem', text: '3\u680F', onAction: function () { _applyColumns(3); } },
          { type: 'separator' },
          { type: 'menuitem', text: '\u53D6\u6D88\u5206\u680F', onAction: function () { _removeColumns(); } }
        ]);
      },
      onSetup: function (api) {
        function updateState() {
          let node = editor.selection.getNode();
          let w = _getColumnsWrapper(node);
          api.setActive(!!w);
          if (w) {
            let m = w.className.match(/tmce-columns-(\d+)/);
            api.setText(m ? '\u5206' + m[1] + '\u680F' : '\u5206\u680F');
          } else {
            api.setText('\u5206\u680F');
          }
        }
        editor.on('NodeChange', updateState);
        return function () { editor.off('NodeChange', updateState); };
      }
    });
  } catch (e) {
    console.error('[TinyMCE] columns 按钮注册失败:', e);
  }

  function _getColumnsWrapper(block) {
    var el = block;
    while (el && el !== editor.getBody()) {
      if (el.className && (/tmce-columns-\d+/).test(el.className)) return el;
      el = el.parentNode;
    }
    return null;
  }

  function _applyColumns(n) {
    var ed = state.tinyEditor;
    if (!ed) return;
    ed.undoManager.transact(function () {
      var blocks = ed.selection.getSelectedBlocks();
      if (!blocks || blocks.length === 0) {
        var node = ed.selection.getNode();
        var block = ed.dom.getParent(node, 'p,div,h1,h2,h3,h4,h5,h6');
        if (block) blocks = [block];
      }
      if (!blocks || blocks.length === 0) return;
      var wrapper = _getColumnsWrapper(blocks[0]);
      if (wrapper) {
        wrapper.className = wrapper.className.replace(/tmce-columns-\d+/g, '').trim();
        wrapper.className = (wrapper.className || '') + ' tmce-columns-' + n;
        return;
      }
      var doc = ed.getDoc();
      var container = doc.createElement('div');
      container.className = 'tmce-columns-' + n;
      var parent = blocks[0].parentNode;
      var refNode = blocks[blocks.length - 1].nextSibling;
      parent.insertBefore(container, refNode);
      blocks.forEach(function (b) { container.appendChild(b); });
    });
  }

  function _removeColumns() {
    var ed = state.tinyEditor;
    if (!ed) return;
    ed.undoManager.transact(function () {
      var node = ed.selection.getNode();
      var wrapper = _getColumnsWrapper(node);
      if (!wrapper) return;
      var parent = wrapper.parentNode;
      while (wrapper.firstChild) parent.insertBefore(wrapper.firstChild, wrapper);
      parent.removeChild(wrapper);
    });
  }
}