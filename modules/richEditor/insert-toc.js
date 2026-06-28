// ============================================================
// insert-toc.js — 右键将选中文字添加到右侧目录栏
// ============================================================

import { renumberAllHeadings } from './lists.js';
import { getStylesForLevel } from './heading-templates.js';

let _ctxMenuEl = null;

// ─── 右键菜单 ───

export function showTocContextMenu(editor, x, y) {
  hideTocContextMenu();

  var rng = editor.selection.getRng();
  var hasSelection = !rng.collapsed;

  _ctxMenuEl = document.createElement('div');
  _ctxMenuEl.id = 'tmceTocCtxMenu';

  var items = [];

  if (hasSelection) {
    // 有选中文字 → 弹出标题级别子菜单
    var levels = [
      { text: '\u6807\u9898 1', level: 1 },
      { text: '\u6807\u9898 2', level: 2 },
      { text: '\u6807\u9898 3', level: 3 },
      { text: '\u6807\u9898 4', level: 4 },
      { text: '\u6807\u9898 5', level: 5 },
      { text: '\u6807\u9898 6', level: 6 }
    ];
    items.push('<div class="tmce-ctx-label">\u63D2\u5165\u76EE\u5F55 (\u4F5C\u4E3A)</div>');
    levels.forEach(function (lv) {
      items.push('<div data-action="toc-' + lv.level + '">\u2514 ' + lv.text + '</div>');
    });
  } else {
    // 没选中 → 提示
    items.push('<div class="tmce-ctx-label">\u63D2\u5165\u76EE\u5F55</div>');
    items.push('<div class="tmce-ctx-disabled">\u8BF7\u5148\u9009\u4E2D\u6587\u5B57</div>');
  }

  // 重新编号 — 始终可用
  items.push('<div class="tmce-ctx-sep"></div>');
  items.push('<div data-action="renumber">\uD83D\uDD04 \u91CD\u65B0\u7F16\u53F7\u6240\u6709\u6807\u9898</div>');

  _ctxMenuEl.innerHTML = items.join('');
  _ctxMenuEl.style.cssText =
    'position:fixed;z-index:10010;background:#0d1f2b;border:1px solid #2c6e7e;border-radius:8px;' +
    'padding:4px 0;min-width:170px;box-shadow:0 4px 20px rgba(0,0,0,0.7);' +
    'left:' + x + 'px;top:' + y + 'px;';

  // 样式
  var labels = _ctxMenuEl.querySelectorAll('.tmce-ctx-label');
  labels.forEach(function (el) {
    el.style.cssText = 'padding:4px 14px;color:#5a8a9a;font-size:11px;white-space:nowrap;';
  });
  var disabled = _ctxMenuEl.querySelectorAll('.tmce-ctx-disabled');
  disabled.forEach(function (el) {
    el.style.cssText = 'padding:7px 14px;color:#4a5a6a;font-size:12px;white-space:nowrap;font-style:italic;';
  });
  var seps = _ctxMenuEl.querySelectorAll('.tmce-ctx-sep');
  seps.forEach(function (el) {
    el.style.cssText = 'border-top:1px solid #1e3a44;margin:4px 0;';
  });

  var actionItems = _ctxMenuEl.querySelectorAll('[data-action]');
  actionItems.forEach(function (el) {
    el.style.cssText = 'padding:7px 14px 7px 20px;color:#ccd;cursor:pointer;font-size:13px;white-space:nowrap;transition:background .12s;';
    el.addEventListener('mouseenter', function () {
      this.style.background = '#2c6e7e';
      this.style.color = '#fff';
    });
    el.addEventListener('mouseleave', function () {
      this.style.background = '';
      this.style.color = '#ccd';
    });
    el.addEventListener('click', function () {
      var action = el.getAttribute('data-action');
      hideTocContextMenu();
      if (action && action.startsWith('toc-')) {
        var level = parseInt(action.split('-')[1]);
        var selText = editor.selection.getContent({ format: 'text' }).trim();
        if (selText) {
          addToToc(editor, selText, level);
        }
      } else if (action === 'renumber') {
        renumberAllHeadings(editor);
      }
    });
  });

  document.body.appendChild(_ctxMenuEl);

  // 点击其他地方关闭
  var close = function (e) {
    if (_ctxMenuEl && !_ctxMenuEl.contains(e.target)) {
      hideTocContextMenu();
      document.removeEventListener('mousedown', close, true);
      document.removeEventListener('keydown', escClose, true);
    }
  };
  var escClose = function (e) {
    if (e.key === 'Escape') {
      hideTocContextMenu();
      document.removeEventListener('mousedown', close, true);
      document.removeEventListener('keydown', escClose, true);
    }
  };
  setTimeout(function () {
    document.addEventListener('mousedown', close, true);
    document.addEventListener('keydown', escClose, true);
  }, 0);
}

export function hideTocContextMenu() {
  if (_ctxMenuEl) {
    _ctxMenuEl.remove();
    _ctxMenuEl = null;
  }
}

// ─── 核心：将选中文字转为标题 → 自动出现在右侧目录栏 ───

// 扫描编辑区内所有现有 h1-h6，计算新标题的层级编号
function _detectNextNumber(editor, level) {
  var body = editor.getBody();
  if (!body) return '1';

  var allH = body.querySelectorAll('h1,h2,h3,h4,h5,h6');
  var counters = [0, 0, 0, 0, 0, 0];

  // 遍历所有现有标题，推进计数器
  allH.forEach(function (el) {
    var lv = parseInt(el.tagName.substring(1));
    counters[lv - 1]++;
    for (var i = lv; i < 6; i++) counters[i] = 0;
  });

  // 新标题在当前层级递增，更深层级归零
  counters[level - 1]++;
  for (var i = level; i < 6; i++) counters[i] = 0;

  return counters.slice(0, level).join('.');
}

function addToToc(editor, text, level) {
  if (!text) return;

  var tagName = 'h' + level;

  editor.undoManager.transact(function () {
    // 删除选中内容
    editor.execCommand('Delete');

    // 生成唯一 ID（右侧 toc 导航需要）
    var id = 'toc-h-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6);

    // 自动检测编号
    var num = _detectNextNumber(editor, level);

    var safeText = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // 读取当前模板中对应级别的内联样式
    var tplStyles = getStylesForLevel(level);
    var styleParts = [];
    Object.keys(tplStyles).forEach(function (prop) {
      styleParts.push(prop + ':' + tplStyles[prop]);
    });
    var styleAttr = styleParts.length > 0 ? ' style="' + styleParts.join(';') + '"' : '';

    var html = '<' + tagName + ' id="' + id + '" data-toc-title="' + safeText + '"' + styleAttr + '>' +
      '<span class="toc-num" contenteditable="false">' + num + '</span> ' +
      safeText +
      '</' + tagName + '>';

    editor.insertContent(html);
  });

  // 右侧目录栏的 NodeChange 监听会自动刷新，无需手动调用
}
