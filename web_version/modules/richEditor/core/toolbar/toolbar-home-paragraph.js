// ============================================================
//  toolbar/toolbar-home-paragraph.js — 开始 → 段落区域
// ============================================================

import { state } from '../../shared-state.js';

export function registerParagraphRegion(editor) {
  try {
    editor.ui.registry.addMenuButton('lineheight', {
      text: '行距',
      tooltip: '行高',
      fetch: function (callback) {
        let items = [
          { type: 'menuitem', text: '单倍行距 1.0', onAction: function () { setLineHeight('1.0'); } },
          { type: 'menuitem', text: '1.15', onAction: function () { setLineHeight('1.15'); } },
          { type: 'menuitem', text: '1.5 倍行距', onAction: function () { setLineHeight('1.5'); } },
          { type: 'menuitem', text: '双倍行距 2.0', onAction: function () { setLineHeight('2.0'); } },
          { type: 'menuitem', text: '2.5', onAction: function () { setLineHeight('2.5'); } },
          { type: 'menuitem', text: '3.0', onAction: function () { setLineHeight('3.0'); } }
        ];
        callback(items);
      },
      onSetup: function (api) {
        function updateState() {
          let node = editor.selection.getNode();
          let block = editor.dom.getParent(node, 'p,div,h1,h2,h3,h4,h5,h6,li,blockquote');
          if (block) {
            let lh = editor.dom.getStyle(block, 'line-height');
            if (lh && lh !== 'normal') {
              api.setActive(true);
            } else {
              api.setActive(false);
            }
          } else {
            api.setActive(false);
          }
        }
        editor.on('NodeChange', updateState);
        return function () { editor.off('NodeChange', updateState); };
      }
    });
  } catch (e) {
    console.error('[TinyMCE] lineheight 按钮注册失败:', e);
  }

  try {
    editor.ui.registry.addButton('paraspacing', {
      text: '\u6BB5\u8DDD',
      tooltip: '\u6BB5\u524D\u6BB5\u540E\u95F4\u8DDD',
      onAction: function () { showParaSpacingPanel(); }
    });
  } catch (e) {
    console.error('[TinyMCE] paraspacing 按钮注册失败:', e);
  }

  try {
    editor.ui.registry.addToggleButton('dropcap', {
      text: '\u5218',
      tooltip: '\u9996\u5B57\u4E0B\u6C89',
      onAction: function () {
        let ed = state.tinyEditor;
        if (!ed) return;
        ed.undoManager.transact(function () {
          let node = ed.selection.getNode();
          let block = ed.dom.getParent(node, 'p,div,h1,h2,h3,h4,h5,h6');
          if (!block) return;
          if (block.className && block.className.indexOf('tmce-dropcap') !== -1) {
            block.className = block.className.replace(/\s*tmce-dropcap\s*/g, ' ').trim();
            if (!block.className) block.removeAttribute('class');
          } else {
            block.className = (block.className || '') + ' tmce-dropcap';
          }
        });
      },
      onSetup: function (api) {
        function updateState() {
          let node = editor.selection.getNode();
          let block = editor.dom.getParent(node, 'p,div,h1,h2,h3,h4,h5,h6');
          api.setActive(!!(block && block.className && block.className.indexOf('tmce-dropcap') !== -1));
        }
        editor.on('NodeChange', updateState);
        return function () { editor.off('NodeChange', updateState); };
      }
    });
  } catch (e) {
    console.error('[TinyMCE] dropcap 按钮注册失败:', e);
  }

  try {
    editor.ui.registry.addToggleButton('myalignjustify', {
      icon: 'align-justify',
      tooltip: '两端对齐',
      onAction: function () {
        let ed = state.tinyEditor;
        if (!ed) return;
        ed.execCommand('JustifyFull');
      },
      onSetup: function (api) {
        function updateState() {
          let node = editor.selection.getNode();
          let block = editor.dom.getParent(node, 'p,div,h1,h2,h3,h4,h5,h6,li,blockquote');
          if (block) {
            let ta = editor.dom.getStyle(block, 'text-align');
            let taLast = editor.dom.getStyle(block, 'text-align-last');
            api.setActive(ta === 'justify' && taLast !== 'justify');
          } else {
            api.setActive(false);
          }
        }
        editor.on('NodeChange', updateState);
        return function () { editor.off('NodeChange', updateState); };
      }
    });
  } catch (e) {
    console.error('[TinyMCE] myalignjustify 按钮注册失败:', e);
  }

  try {
    editor.ui.registry.addToggleButton('customdistributed', {
      text: '分散',
      tooltip: '分散对齐',
      onAction: function () {
        let ed = state.tinyEditor;
        if (!ed) return;
        ed.undoManager.transact(function () {
          let blocks = ed.selection.getSelectedBlocks();
          if (blocks.length === 0) {
            let node = ed.selection.getNode();
            let block = ed.dom.getParent(node, 'p,div,h1,h2,h3,h4,h5,h6,li,blockquote');
            if (block) blocks = [block];
          }
          blocks.forEach(function (b) {
            let taLast = ed.dom.getStyle(b, 'text-align-last');
            if (taLast === 'justify') {
              ed.dom.setStyle(b, 'text-align-last', '');
            } else {
              ed.dom.setStyle(b, 'text-align', 'justify');
              ed.dom.setStyle(b, 'text-align-last', 'justify');
            }
          });
        });
      },
      onSetup: function (api) {
        function updateState() {
          let node = editor.selection.getNode();
          let block = editor.dom.getParent(node, 'p,div,h1,h2,h3,h4,h5,h6,li,blockquote');
          if (block) {
            let taLast = editor.dom.getStyle(block, 'text-align-last');
            api.setActive(taLast === 'justify');
          } else {
            api.setActive(false);
          }
        }
        editor.on('NodeChange', updateState);
        return function () { editor.off('NodeChange', updateState); };
      }
    });
  } catch (e) {
    console.error('[TinyMCE] customdistributed 按钮注册失败:', e);
  }

  function showParaSpacingPanel() {
    var ed = state.tinyEditor;
    if (!ed) return;
    var existing = document.getElementById('paraSpacingOverlay');
    if (existing) existing.remove();

    var node = ed.selection.getNode();
    var block = ed.dom.getParent(node, 'p,div,h1,h2,h3,h4,h5,h6,li,blockquote');
    var beforeVal = 0, afterVal = 0.6;
    if (block) {
      var mt = ed.dom.getStyle(block, 'margin-top');
      var mb = ed.dom.getStyle(block, 'margin-bottom');
      if (mt) {
        var m1 = mt.match(/^([\d.]+)/);
        if (m1) beforeVal = parseFloat(m1[1]);
      }
      if (mb) {
        var m2 = mb.match(/^([\d.]+)/);
        if (m2) afterVal = parseFloat(m2[1]);
      }
      var fs = parseFloat(window.getComputedStyle(block).fontSize) || 14;
      if (mt && mt.indexOf('px') > -1) beforeVal = Math.round(beforeVal / fs * 10) / 10;
      if (mb && mb.indexOf('px') > -1) afterVal = Math.round(afterVal / fs * 10) / 10;
    }
    beforeVal = Math.round(beforeVal * 10) / 10;
    afterVal = Math.round(afterVal * 10) / 10;

    var overlay = document.createElement('div');
    overlay.id = 'paraSpacingOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:10002;background:rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;';

    var dlg = document.createElement('div');
    dlg.style.cssText = 'background:#0d1f2b;border:1px solid #2c6e7e;border-radius:14px;padding:20px;box-shadow:0 6px 30px rgba(0,0,0,0.8);min-width:300px;max-width:350px;';

    var titleBar = document.createElement('div');
    titleBar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;';
    var titleLabel = document.createElement('span');
    titleLabel.textContent = '\u6BB5\u524D\u6BB5\u540E\u95F4\u8DDD';
    titleLabel.style.cssText = 'color:#ccd;font-size:15px;font-weight:bold;';
    titleBar.appendChild(titleLabel);
    var closeBtn = document.createElement('span');
    closeBtn.textContent = '\u2715';
    closeBtn.style.cssText = 'color:#8899aa;cursor:pointer;font-size:16px;';
    closeBtn.addEventListener('click', function () { overlay.remove(); });
    titleBar.appendChild(closeBtn);
    dlg.appendChild(titleBar);

    var body = document.createElement('div');
    body.style.cssText = 'display:flex;flex-direction:column;gap:12px;';

    function createSpacingRow(labelText, initialValue) {
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:6px;';

      var label = document.createElement('span');
      label.textContent = labelText;
      label.style.cssText = 'color:#8899aa;font-size:13px;width:36px;';
      row.appendChild(label);

      var input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.max = '20';
      input.step = '0.1';
      input.value = initialValue;
      input.style.cssText = 'flex:1;background:#0a1a24;border:1px solid #2c6e7e;color:#eef;border-radius:6px;padding:6px 8px;font-size:14px;outline:none;text-align:center;width:60px;';
      row.appendChild(input);

      var unitLabel = document.createElement('span');
      unitLabel.textContent = '\u884C';
      unitLabel.style.cssText = 'color:#8899aa;font-size:12px;width:20px;';
      row.appendChild(unitLabel);

      var decBtn = document.createElement('button');
      decBtn.textContent = '\u2212';
      decBtn.style.cssText = 'background:#1a2a34;border:1px solid #2c4a5a;color:#8899aa;border-radius:6px;width:30px;height:30px;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;line-height:1;';
      decBtn.addEventListener('click', function () {
        var v = parseFloat(input.value) || 0;
        input.value = Math.max(0, Math.round((v - 0.1) * 10) / 10);
      });
      row.appendChild(decBtn);

      var incBtn = document.createElement('button');
      incBtn.textContent = '+';
      incBtn.style.cssText = 'background:#1a2a34;border:1px solid #2c4a5a;color:#8899aa;border-radius:6px;width:30px;height:30px;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;line-height:1;';
      incBtn.addEventListener('click', function () {
        var v = parseFloat(input.value) || 0;
        input.value = Math.round((v + 0.1) * 10) / 10;
      });
      row.appendChild(incBtn);

      return { row: row, input: input };
    }

    var mtInput, mbInput;

    var mtResult = createSpacingRow('\u6BB5\u524D', beforeVal);
    mtInput = mtResult.input;
    body.appendChild(mtResult.row);

    var mbResult = createSpacingRow('\u6BB5\u540E', afterVal);
    mbInput = mbResult.input;
    body.appendChild(mbResult.row);

    var btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;margin-top:8px;';

    var cancelBtn = document.createElement('button');
    cancelBtn.textContent = '\u53D6\u6D88';
    cancelBtn.style.cssText = 'flex:1;background:#1a2a34;border:1px solid #2c4a5a;color:#8899aa;border-radius:8px;padding:8px;cursor:pointer;font-size:13px;';
    cancelBtn.addEventListener('click', function () { overlay.remove(); });
    btnRow.appendChild(cancelBtn);

    var applyBtn = document.createElement('button');
    applyBtn.textContent = '\u5E94\u7528';
    applyBtn.style.cssText = 'flex:1;background:#2c6e7e;color:#fff;border:none;border-radius:8px;padding:8px;cursor:pointer;font-size:13px;';
    applyBtn.addEventListener('click', function () {
      var mtVal = parseFloat(mtInput.value);
      var mbVal = parseFloat(mbInput.value);
      if (isNaN(mtVal) || isNaN(mbVal) || mtVal < 0 || mbVal < 0) {
        if (isNaN(mtVal) || mtVal < 0) mtInput.style.borderColor = '#e44';
        if (isNaN(mbVal) || mbVal < 0) mbInput.style.borderColor = '#e44';
        return;
      }
      overlay.remove();
      ed.undoManager.transact(function () {
        var blk = ed.dom.getParent(ed.selection.getNode(), 'p,div,h1,h2,h3,h4,h5,h6,li,blockquote');
        if (!blk) return;
        var fs = parseFloat(window.getComputedStyle(blk).fontSize) || 14;
        ed.dom.setStyle(blk, 'margin-top', (mtVal * fs) + 'px');
        ed.dom.setStyle(blk, 'margin-bottom', (mbVal * fs) + 'px');
      });
    });
    btnRow.appendChild(applyBtn);
    body.appendChild(btnRow);

    dlg.appendChild(body);
    overlay.appendChild(dlg);
    document.body.appendChild(overlay);

    setTimeout(function () { mtInput.focus(); mtInput.select(); }, 50);

    mtInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') applyBtn.click();
      else if (e.key === 'Escape') overlay.remove();
    });
    mbInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') applyBtn.click();
      else if (e.key === 'Escape') overlay.remove();
    });
  }

  function setLineHeight(value) {
    let editor = state.tinyEditor;
    if (!editor) return;
    editor.undoManager.transact(function () {
      let blocks = editor.selection.getSelectedBlocks();
      if (blocks.length === 0) {
        let node = editor.selection.getNode();
        let block = editor.dom.getParent(node, 'p,div,h1,h2,h3,h4,h5,h6,li,blockquote');
        if (block) blocks = [block];
      }
      blocks.forEach(function (block) {
        editor.dom.setStyle(block, 'line-height', value);
      });
    });
  }
}