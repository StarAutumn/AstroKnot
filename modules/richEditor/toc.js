// toc.js — 富文本编辑器右侧可折叠目录侧边栏

import * as HTPL from './heading-templates.js';

let _updateTimer = null;

export function initTOC(editor) {
  if (!editor || document.getElementById('tocSidebar')) return;

  const wrapper = document.getElementById('editPanelsWrapper');
  if (!wrapper) return;

  injectStyles();

  const sidebar = document.createElement('div');
  sidebar.id = 'tocSidebar';
  sidebar.className = 'toc-sidebar';
  sidebar.setAttribute('data-collapsed', 'false');

  const tab = document.createElement('div');
  tab.className = 'toc-tab';
  tab.textContent = '\u25B6';
  tab.title = '\u6298\u53E0\u76EE\u5F55';
  tab.addEventListener('click', () => togglePanel(sidebar));
  sidebar.appendChild(tab);

  const body = document.createElement('div');
  body.className = 'toc-body';

  const header = document.createElement('div');
  header.className = 'toc-header';
  const titleSpan = document.createElement('span');
  titleSpan.textContent = '\u76EE\u5F55';
  header.appendChild(titleSpan);

  const btnGroup = document.createElement('div');
  btnGroup.style.cssText = 'display:flex;gap:4px;align-items:center;';

  // 模板管理按钮
  const tplBtn = document.createElement('button');
  tplBtn.className = 'toc-refresh';
  tplBtn.textContent = '\u2699';
  tplBtn.title = '\u6807\u9898\u6837\u5F0F\u6A21\u677F\u7BA1\u7406';
  tplBtn.addEventListener('click', () => _showTemplateDialog(editor));
  btnGroup.appendChild(tplBtn);

  // 样式编辑按钮
  const styleBtn = document.createElement('button');
  styleBtn.className = 'toc-refresh toc-style-btn';
  styleBtn.textContent = '\u270E';
  styleBtn.title = '\u4FEE\u6539\u5F53\u524D\u6807\u9898\u5185\u8054\u6837\u5F0F';
  styleBtn.addEventListener('click', () => _showHeadingStyleDialog(editor));
  btnGroup.appendChild(styleBtn);

  const refreshBtn = document.createElement('button');
  refreshBtn.className = 'toc-refresh';
  refreshBtn.textContent = '\u21BB';
  refreshBtn.title = '\u5237\u65B0\u76EE\u5F55';
  refreshBtn.addEventListener('click', () => buildTOC(editor, treeBody));
  btnGroup.appendChild(refreshBtn);

  header.appendChild(btnGroup);
  body.appendChild(header);

  const treeBody = document.createElement('div');
  treeBody.className = 'toc-tree';
  body.appendChild(treeBody);

  sidebar.appendChild(body);
  wrapper.appendChild(sidebar);

  buildTOC(editor, treeBody);

  editor.on('NodeChange', () => {
    if (_updateTimer) clearTimeout(_updateTimer);
    _updateTimer = setTimeout(() => buildTOC(editor, treeBody), 500);
  });
  editor.on('SetContent', () => {
    setTimeout(() => buildTOC(editor, treeBody), 100);
  });
}

function togglePanel(sidebar) {
  const collapsed = sidebar.getAttribute('data-collapsed') === 'true';
  sidebar.setAttribute('data-collapsed', collapsed ? 'false' : 'true');
  const tab = sidebar.querySelector('.toc-tab');
  tab.textContent = collapsed ? '\u25B6' : '\u25C0';
  tab.title = collapsed ? '\u6298\u53E0\u76EE\u5F55' : '\u5C55\u5F00\u76EE\u5F55';
}

export function buildTOC(editor, container) {
  const docBody = editor.getBody();
  if (!docBody) return;

  const allElements = docBody.querySelectorAll('h1, h2, h3, h4, h5, h6, li');
  if (allElements.length === 0) {
    container.innerHTML = '<div class="toc-empty">\u5F53\u524D\u6587\u6863\u65E0\u6807\u9898</div>';
    return;
  }

  function getListDepth(el) {
    var depth = 0;
    var parent = el.parentElement;
    while (parent && parent !== docBody) {
      if (parent.tagName === 'OL' || parent.tagName === 'UL') {
        depth++;
      }
      parent = parent.parentElement;
    }
    return Math.max(depth - 1, 0);
  }

  var hasHeadings = docBody.querySelector('h1, h2, h3, h4, h5, h6');
  if (!hasHeadings) {
    var listItems = docBody.querySelectorAll('li');
    if (listItems.length === 0) {
      container.innerHTML = '<div class="toc-empty">\u5F53\u524D\u6587\u6863\u65E0\u6807\u9898</div>';
      return;
    }
  }

  var html = '<ul class="toc-list">';
  allElements.forEach(function (el) {
    var tagName = el.tagName.toLowerCase();
    var isLi = tagName === 'li';
    var level, type;

    if (!isLi) {
      level = parseInt(tagName.substring(1));
      type = 'heading';
    } else {
      var depth = getListDepth(el);
      level = Math.min(depth + 2, 6);
      type = 'list';
    }

    var text;
    if (isLi) {
      text = getListItemText(el);
    } else {
      text = el.getAttribute('data-toc-title') || (el.textContent || '').trim();
    }
    if (!text) {
      text = isLi ? '\u5217\u8868\u9879' : ('\u6807\u9898 ' + level);
    }
    if (!el.id) {
      el.id = 'toc-' + type + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 8);
    }
    var safeText = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    var markerHtml;
    if (type === 'heading') {
      var numSpan = el.querySelector('.toc-num');
      var numText = numSpan ? (numSpan.textContent || '').trim() : '';
      if (numText) {
        markerHtml = '<span class="toc-marker">' + numText.replace(/ /g, '&nbsp;') + '</span>';
      } else {
        markerHtml = '<span class="toc-dot"></span>';
      }
    } else {
      var markerText = getListItemMarker(el);
      markerHtml = '<span class="toc-marker">' + markerText.replace(/ /g, '&nbsp;') + '</span>';
    }
    html += '<li class="toc-item toc-l' + level + ' toc-type-' + type + '" data-id="' + el.id + '">' +
      '<a href="#" data-id="' + el.id + '">' + markerHtml + safeText + '</a></li>';
  });
  html += '</ul>';
  container.innerHTML = html;

  container.querySelectorAll('a').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      var id = a.getAttribute('data-id');
      var el = editor.getBody().querySelector('#' + CSS.escape(id));
      if (!el) return;
      editor.selection.select(el);
      editor.focus();
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.style.outline = '2px solid #0ff';
      el.style.outlineOffset = '2px';
      setTimeout(function () { el.style.outline = ''; }, 1500);
    });
  });
}

// ─── 标题内联样式编辑对话框 ───

function _showHeadingStyleDialog(editor) {
  var node = editor.selection.getNode();
  var heading = editor.dom.getParent(node, 'h1,h2,h3,h4,h5,h6');
  if (!heading) {
    // 尝试从 body 中找第一个 heading 作为默认
    var firstH = editor.getBody().querySelector('h1,h2,h3,h4,h5,h6');
    if (!firstH) {
      editor.windowManager.alert('\u5F53\u524D\u6587\u6863\u65E0\u6807\u9898\uFF0C\u8BF7\u5148\u901A\u8FC7\u53F3\u952E\u63D2\u5165\u76EE\u5F55\u521B\u5EFA\u6807\u9898\u3002');
      return;
    }
    heading = firstH;
  }

  var tag = heading.tagName.toLowerCase();
  var titleText = heading.getAttribute('data-toc-title') || heading.textContent.trim();
  var id = heading.id;
  if (!id) {
    id = 'toc-heading-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6);
    heading.id = id;
  }

  // 读取当前内联样式
  var curFontSize = editor.dom.getStyle(heading, 'font-size') || '';
  var curWeight = editor.dom.getStyle(heading, 'font-weight') || '';
  var curMargin = editor.dom.getStyle(heading, 'margin-bottom') || '';

  // 去掉 px 后缀用于输入框
  var fontSizeNum = parseFloat(curFontSize) || '';
  var marginNum = parseFloat(curMargin) || '';

  var overlay = document.createElement('div');
  overlay.id = 'headingStyleOverlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:10010;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;';

  var dlg = document.createElement('div');
  dlg.style.cssText = 'background:#0d1f2b;border:1px solid #2c6e7e;border-radius:14px;padding:16px 20px;box-shadow:0 6px 30px rgba(0,0,0,0.8);min-width:340px;max-width:420px;';

  // 标题栏
  var titleBar = document.createElement('div');
  titleBar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;';
  var titleEl = document.createElement('span');
  titleEl.textContent = '\u7F16\u8F91\u5185\u8054\u6837\u5F0F \u2014 ' + tag.toUpperCase();
  titleEl.style.cssText = 'color:#ccd;font-size:14px;font-weight:bold;';
  titleBar.appendChild(titleEl);
  var closeBtn = document.createElement('span');
  closeBtn.textContent = '\u2715';
  closeBtn.style.cssText = 'color:#8899aa;cursor:pointer;font-size:16px;';
  closeBtn.addEventListener('click', function () { overlay.remove(); });
  titleBar.appendChild(closeBtn);
  dlg.appendChild(titleBar);

  // 标题文字展示
  var textInfo = document.createElement('div');
  textInfo.style.cssText = 'background:#061218;border:1px solid #1e3a44;border-radius:6px;padding:6px 10px;margin-bottom:12px;color:#5a8a9a;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
  textInfo.textContent = '\u6807\u9898\u6587\u5B57: ' + (titleText.length > 40 ? titleText.substring(0, 40) + '...' : titleText);
  dlg.appendChild(textInfo);

  function _row(label, child) {
    var r = document.createElement('div');
    r.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:10px;';
    var lb = document.createElement('span');
    lb.textContent = label;
    lb.style.cssText = 'color:#8899aa;font-size:12px;flex-shrink:0;min-width:56px;';
    r.appendChild(lb);
    r.appendChild(child);
    return r;
  }

  // 字号
  var fontSizeInput = document.createElement('input');
  fontSizeInput.type = 'number';
  fontSizeInput.value = fontSizeNum;
  fontSizeInput.min = '8';
  fontSizeInput.max = '72';
  fontSizeInput.step = '1';
  fontSizeInput.style.cssText = 'width:60px;background:#122;border:1px solid #2c6e7e;color:#ccd;border-radius:4px;padding:4px 8px;font-size:13px;text-align:center;';
  var unitWrap = document.createElement('span');
  unitWrap.style.cssText = 'color:#8899aa;font-size:11px;';
  unitWrap.textContent = 'px';
  var fontSizeRow = _row('\u5B57\u53F7:', fontSizeInput);
  fontSizeRow.appendChild(unitWrap);
  dlg.appendChild(fontSizeRow);

  // 字体粗细
  var isBold = curWeight === 'bold' || curWeight === '700' || curWeight === '600' || curWeight === '800' || curWeight === '900';
  var weightToggle = document.createElement('button');
  weightToggle.style.cssText = 'padding:4px 14px;border-radius:4px;cursor:pointer;font-size:13px;' +
    (isBold
      ? 'background:#2c6e7e;border:1px solid #5ab;color:#fff;font-weight:bold;'
      : 'background:#122;border:1px solid #2c6e7e;color:#8899aa;');
  weightToggle.textContent = isBold ? 'B' : 'B';
  weightToggle.dataset.bold = isBold ? '1' : '0';
  weightToggle.addEventListener('click', function () {
    if (weightToggle.dataset.bold === '1') {
      weightToggle.dataset.bold = '0';
      weightToggle.style.background = '#122';
      weightToggle.style.border = '1px solid #2c6e7e';
      weightToggle.style.color = '#8899aa';
      weightToggle.style.fontWeight = 'normal';
    } else {
      weightToggle.dataset.bold = '1';
      weightToggle.style.background = '#2c6e7e';
      weightToggle.style.border = '1px solid #5ab';
      weightToggle.style.color = '#fff';
      weightToggle.style.fontWeight = 'bold';
    }
  });
  var weightWrap = document.createElement('span');
  weightWrap.appendChild(weightToggle);
  var clearWeightBtn = document.createElement('button');
  clearWeightBtn.textContent = '\u9ED8\u8BA4';
  clearWeightBtn.style.cssText = 'margin-left:6px;padding:4px 8px;background:none;border:1px solid #2c4a5a;color:#4a7a8a;border-radius:4px;cursor:pointer;font-size:11px;';
  clearWeightBtn.addEventListener('click', function () {
    weightToggle.dataset.bold = '-1';
    weightToggle.style.background = '#0d1f2b';
    weightToggle.style.border = '1px dashed #2c4a5a';
    weightToggle.style.color = '#4a6a7a';
    weightToggle.style.fontWeight = 'normal';
  });
  weightWrap.appendChild(clearWeightBtn);
  dlg.appendChild(_row('\u7C97\u4F53:', weightWrap));

  // 下边距
  var marginInput = document.createElement('input');
  marginInput.type = 'number';
  marginInput.value = marginNum;
  marginInput.min = '0';
  marginInput.max = '100';
  marginInput.step = '1';
  marginInput.style.cssText = 'width:60px;background:#122;border:1px solid #2c6e7e;color:#ccd;border-radius:4px;padding:4px 8px;font-size:13px;text-align:center;';
  var marginRow = _row('\u4E0B\u8FB9\u8DDD:', marginInput);
  var marginUnit = document.createElement('span');
  marginUnit.textContent = 'px';
  marginUnit.style.cssText = 'color:#8899aa;font-size:11px;';
  marginRow.appendChild(marginUnit);
  dlg.appendChild(marginRow);

  // 预览
  var previewLabel = document.createElement('div');
  previewLabel.textContent = '\u9884\u89C8:';
  previewLabel.style.cssText = 'color:#8899aa;font-size:11px;margin-bottom:4px;margin-top:4px;';
  dlg.appendChild(previewLabel);
  var preview = document.createElement('div');
  preview.style.cssText = 'background:#061218;border:1px solid #1e3a44;border-radius:8px;padding:8px 12px;margin-bottom:14px;min-height:28px;display:flex;align-items:center;';
  preview.textContent = titleText.length > 30 ? titleText.substring(0, 30) + '...' : titleText;
  function _updatePreview() {
    var fs = fontSizeInput.value ? fontSizeInput.value + 'px' : '';
    var fw = '';
    if (weightToggle.dataset.bold === '1') fw = 'bold';
    else if (weightToggle.dataset.bold === '-1') fw = 'normal';
    preview.style.fontSize = fs || '';
    if (fw) preview.style.fontWeight = fw; else preview.style.fontWeight = '';
  }
  fontSizeInput.addEventListener('input', _updatePreview);
  weightToggle.addEventListener('click', function () { setTimeout(_updatePreview, 10); });
  clearWeightBtn.addEventListener('click', function () { setTimeout(_updatePreview, 10); });
  _updatePreview();
  dlg.appendChild(preview);

  // 按钮
  var btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:8px;';
  var cancelBtn = document.createElement('button');
  cancelBtn.textContent = '\u53D6\u6D88';
  cancelBtn.style.cssText = 'flex:1;background:#1a3a44;border:1px solid #2c6e7e;color:#ccd;cursor:pointer;border-radius:6px;padding:7px;font-size:13px;';
  cancelBtn.addEventListener('click', function () { overlay.remove(); });
  btnRow.appendChild(cancelBtn);
  var applyBtn = document.createElement('button');
  applyBtn.textContent = '\u5E94\u7528';
  applyBtn.style.cssText = 'flex:1;background:#2c6e7e;border:none;color:#fff;cursor:pointer;border-radius:6px;padding:7px;font-size:13px;font-weight:bold;';
  applyBtn.addEventListener('click', function () {
    editor.undoManager.transact(function () {
      // 字号
      if (fontSizeInput.value) {
        editor.dom.setStyle(heading, 'font-size', fontSizeInput.value + 'px');
      } else {
        editor.dom.setStyle(heading, 'font-size', null);
      }
      // 粗体
      if (weightToggle.dataset.bold === '1') {
        editor.dom.setStyle(heading, 'font-weight', 'bold');
      } else if (weightToggle.dataset.bold === '-1') {
        editor.dom.setStyle(heading, 'font-weight', 'normal');
      } else {
        editor.dom.setStyle(heading, 'font-weight', null);
      }
      // 下边距
      if (marginInput.value !== '') {
        editor.dom.setStyle(heading, 'margin-bottom', marginInput.value + 'px');
      } else {
        editor.dom.setStyle(heading, 'margin-bottom', null);
      }
    });
    overlay.remove();
  });
  btnRow.appendChild(applyBtn);
  dlg.appendChild(btnRow);

  dlg.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  overlay.appendChild(dlg);
  document.body.appendChild(overlay);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });

  setTimeout(function () { fontSizeInput.focus(); fontSizeInput.select(); }, 100);
}

// ─── 模板管理对话框 ───

function _showTemplateDialog(editor) {
  var existing = document.getElementById('headingTplOverlay');
  if (existing) existing.remove();

  var tplList = HTPL.loadTemplates();
  var curTpl = HTPL.getCurrentTemplate();

  var overlay = document.createElement('div');
  overlay.id = 'headingTplOverlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:10010;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;';

  var dlg = document.createElement('div');
  dlg.style.cssText = 'background:#0d1f2b;border:1px solid #2c6e7e;border-radius:14px;padding:16px 20px;box-shadow:0 6px 30px rgba(0,0,0,0.8);min-width:480px;max-width:540px;max-height:80vh;overflow-y:auto;';

  // 收集每级编辑控件引用
  var levelInputs = {}; // { 1: {fs, fw, mb}, 2: ... }

  function _buildDlgContent() {
    dlg.innerHTML = '';
    levelInputs = {};
    tplList = HTPL.loadTemplates();
    curTpl = HTPL.getCurrentTemplate();

    // --- 标题栏 ---
    var titleBar = document.createElement('div');
    titleBar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;';
    var titleEl = document.createElement('span');
    titleEl.textContent = '\u6807\u9898\u6837\u5F0F\u6A21\u677F';
    titleEl.style.cssText = 'color:#ccd;font-size:14px;font-weight:bold;';
    titleBar.appendChild(titleEl);
    var closeBtn = document.createElement('span');
    closeBtn.textContent = '\u2715';
    closeBtn.style.cssText = 'color:#8899aa;cursor:pointer;font-size:16px;';
    closeBtn.addEventListener('click', function () { overlay.remove(); });
    titleBar.appendChild(closeBtn);
    dlg.appendChild(titleBar);

    // --- 模板选择 + 新建 ---
    var selRow = document.createElement('div');
    selRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:12px;';
    var selLabel = document.createElement('span');
    selLabel.textContent = '\u5F53\u524D\u6A21\u677F:';
    selLabel.style.cssText = 'color:#8899aa;font-size:12px;flex-shrink:0;';
    selRow.appendChild(selLabel);

    var sel = document.createElement('select');
    sel.style.cssText = 'flex:1;background:#122;border:1px solid #2c6e7e;color:#ccd;border-radius:4px;padding:4px 8px;font-size:13px;cursor:pointer;';
    tplList.forEach(function (t) {
      var opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.name + (t.builtin ? ' (\u5185\u7F6E)' : '');
      if (t.id === HTPL.getCurrentTemplateId()) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', function () {
      HTPL.setCurrentTemplateId(sel.value);
      curTpl = HTPL.getCurrentTemplate();
      _buildDlgContent();
    });
    selRow.appendChild(sel);

    var newBtn = document.createElement('button');
    newBtn.textContent = '\u65B0\u5EFA';
    newBtn.style.cssText = 'background:#1a3a44;border:1px solid #2c6e7e;color:#8899aa;cursor:pointer;border-radius:4px;padding:4px 10px;font-size:12px;flex-shrink:0;';
    newBtn.addEventListener('click', function () {
      var name = prompt('\u6A21\u677F\u540D\u79F0:', '\u81EA\u5B9A\u4E49\u6A21\u677F');
      if (!name || !name.trim()) return;
      var tpl = HTPL.createTemplate(name.trim());
      HTPL.setCurrentTemplateId(tpl.id);
      curTpl = tpl;
      _buildDlgContent();
    });
    selRow.appendChild(newBtn);
    dlg.appendChild(selRow);

    // --- 可编辑表格 ---
    var tableWrap = document.createElement('div');
    tableWrap.style.cssText = 'background:#061218;border:1px solid #1e3a44;border-radius:6px;padding:4px;margin-bottom:10px;';

    // 表头
    var headerRow = document.createElement('div');
    headerRow.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 6px;border-bottom:1px solid #1e3a44;margin-bottom:2px;';
    var hLvl = _cell('h', 'color:#4a7a8a;font-size:10px;min-width:22px;');
    var hFs  = _cell('\u5B57\u53F7', 'color:#8899aa;font-size:10px;min-width:44px;text-align:center;');
    var hFw  = _cell('\u7C97\u4F53', 'color:#8899aa;font-size:10px;min-width:36px;text-align:center;');
    var hInd = _cell('\u7F29\u8FDB', 'color:#8899aa;font-size:10px;min-width:44px;text-align:center;');
    var hMb  = _cell('\u95F4\u8DDD', 'color:#8899aa;font-size:10px;min-width:44px;text-align:center;');
    headerRow.appendChild(hLvl); headerRow.appendChild(hFs); headerRow.appendChild(hFw); headerRow.appendChild(hInd); headerRow.appendChild(hMb);
    tableWrap.appendChild(headerRow);

    var levels = curTpl && curTpl.levels ? curTpl.levels : {};

    for (var lv = 1; lv <= 6; lv++) {
      var styles = levels[lv] || {};
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:3px 6px;' + (lv % 2 === 0 ? 'background:rgba(44,110,126,0.04);' : '');

      // h1~h6 标签
      row.appendChild(_cell('h' + lv, 'color:#4a7a8a;font-size:11px;min-width:22px;'));

      // 字号输入
      var fsInput = document.createElement('input');
      fsInput.type = 'number';
      fsInput.value = parseFloat(styles.fontSize) || '';
      fsInput.placeholder = '-';
      fsInput.min = '8'; fsInput.max = '72';
      fsInput.style.cssText = 'width:40px;background:#122;border:1px solid #1e3a44;color:#ccd;border-radius:3px;padding:2px 4px;font-size:11px;text-align:center;';
      row.appendChild(fsInput);

      // 粗体切换
      var isBold = styles.fontWeight === 'bold';
      var fwBtn = document.createElement('button');
      fwBtn.textContent = 'B';
      fwBtn.style.cssText = 'width:32px;padding:2px 0;border-radius:3px;cursor:pointer;font-size:11px;font-weight:bold;' +
        (isBold ? 'background:#2c6e7e;border:1px solid #5ab;color:#fff;' : 'background:#122;border:1px solid #1e3a44;color:#4a6a7a;');
      (function(btn, lvl) {
        var bold = isBold;
        btn.addEventListener('click', function () {
          bold = !bold;
          btn.style.background = bold ? '#2c6e7e' : '#122';
          btn.style.borderColor = bold ? '#5ab' : '#1e3a44';
          btn.style.color = bold ? '#fff' : '#4a6a7a';
          levelInputs[lvl]._bold = bold;
        });
      })(fwBtn, lv);
      row.appendChild(fwBtn);

      // 缩进输入
      var indInput = document.createElement('input');
      indInput.type = 'number';
      indInput.value = parseFloat(styles.paddingLeft) || '';
      indInput.placeholder = '-';
      indInput.min = '0'; indInput.max = '20'; indInput.step = '0.5';
      indInput.style.cssText = 'width:40px;background:#122;border:1px solid #1e3a44;color:#ccd;border-radius:3px;padding:2px 4px;font-size:11px;text-align:center;';
      row.appendChild(indInput);

      // 间距输入
      var mbInput = document.createElement('input');
      mbInput.type = 'number';
      mbInput.value = parseFloat(styles.marginBottom) || '';
      mbInput.placeholder = '-';
      mbInput.min = '0'; mbInput.max = '100';
      mbInput.style.cssText = 'width:40px;background:#122;border:1px solid #1e3a44;color:#ccd;border-radius:3px;padding:2px 4px;font-size:11px;text-align:center;';
      row.appendChild(mbInput);

      levelInputs[lv] = { fs: fsInput, fw: fwBtn, ind: indInput, mb: mbInput, _bold: isBold };
      tableWrap.appendChild(row);
    }
    dlg.appendChild(tableWrap);

    // --- 按钮行 ---
    var btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:6px;';

    var saveBtn = document.createElement('button');
    saveBtn.textContent = '\u4FDD\u5B58\u6A21\u677F';
    saveBtn.style.cssText = 'flex:1;background:#2c6e7e;border:none;color:#fff;cursor:pointer;border-radius:6px;padding:7px;font-size:12px;font-weight:bold;';
    saveBtn.addEventListener('click', function () {
      _saveTemplate();
      overlay.remove();
    });
    btnRow.appendChild(saveBtn);

    var applyBtn = document.createElement('button');
    applyBtn.textContent = '\u5E94\u7528\u5230\u5168\u90E8\u6807\u9898';
    applyBtn.style.cssText = 'flex:1;background:#1a3a44;border:1px solid #2c6e7e;color:#ccd;cursor:pointer;border-radius:6px;padding:7px;font-size:12px;';
    applyBtn.addEventListener('click', function () {
      _saveTemplate();
      HTPL.applyTemplateToAll(editor);
      overlay.remove();
    });
    btnRow.appendChild(applyBtn);

    var delBtn = document.createElement('button');
    delBtn.textContent = '\u5220\u9664';
    delBtn.style.cssText = 'flex:1;background:#1a3a44;border:1px solid #3a1e1e;color:#aa5555;cursor:pointer;border-radius:6px;padding:7px;font-size:12px;';
    delBtn.addEventListener('click', function () {
      curTpl = HTPL.getCurrentTemplate();
      if (!curTpl || curTpl.builtin) {
        editor.windowManager.alert('\u5185\u7F6E\u6A21\u677F\u4E0D\u53EF\u5220\u9664\u3002');
        return;
      }
      if (!confirm('\u786E\u5B9A\u5220\u9664\u6A21\u677F\u300C' + curTpl.name + '\u300D\uFF1F')) return;
      HTPL.deleteTemplate(curTpl.id);
      curTpl = HTPL.getCurrentTemplate();
      _buildDlgContent();
    });
    btnRow.appendChild(delBtn);

    dlg.appendChild(btnRow);

    // 提示
    var hint = document.createElement('div');
    hint.style.cssText = 'color:#3a5a6a;font-size:10px;margin-top:8px;';
    hint.textContent = '\u7F16\u8F91\u540E\u70B9\u201C\u4FDD\u5B58\u6A21\u677F\u201D\u6216\u201C\u5E94\u7528\u201D\uFF0C\u65B0\u5EFA\u6807\u9898\u65F6\u81EA\u52A8\u5957\u7528\u3002';
    dlg.appendChild(hint);
  }

  function _saveTemplate() {
    curTpl = HTPL.getCurrentTemplate();
    if (!curTpl || curTpl.builtin) {
      // 内置模板不可写 → 自动创建副本
      curTpl = HTPL.createTemplate(curTpl ? curTpl.name + ' \u526F\u672C' : '\u81EA\u5B9A\u4E49\u6A21\u677F');
      HTPL.setCurrentTemplateId(curTpl.id);
    }
    var levels = {};
    for (var lv = 1; lv <= 6; lv++) {
      var inp = levelInputs[lv];
      if (!inp) continue;
      var entry = {};
      var fsVal = inp.fs.value.trim();
      if (fsVal && !isNaN(parseFloat(fsVal))) entry.fontSize = fsVal + 'px';
      entry.fontWeight = inp._bold ? 'bold' : 'normal';
      var mbVal = inp.mb.value.trim();
      if (mbVal && !isNaN(parseFloat(mbVal))) entry.marginBottom = mbVal + 'px';
      var indVal = inp.ind.value.trim();
      if (indVal && !isNaN(parseFloat(indVal))) entry.paddingLeft = indVal + 'em';
      if (Object.keys(entry).length > 0) levels[lv] = entry;
    }
    HTPL.updateTemplate(curTpl.id, { levels: levels });
    curTpl = HTPL.getCurrentTemplate();
  }

  function _cell(text, style) {
    var span = document.createElement('span');
    span.textContent = text;
    span.style.cssText = style + 'flex-shrink:0;';
    return span;
  }

  _buildDlgContent();

  dlg.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  overlay.appendChild(dlg);
  document.body.appendChild(overlay);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
}

// ─── 列表项辅助函数 ───

function getListItemText(li) {
  var clone = li.cloneNode(true);
  var childLists = clone.querySelectorAll('ol, ul');
  childLists.forEach(function (el) { el.remove(); });
  return (clone.textContent || '').trim();
}

function getListItemMarker(li) {
  var parent = li.parentElement;
  if (!parent || parent.tagName !== 'OL') return '\u2022';

  // Build hierarchical path: [rootIdx, childIdx, ...]
  var path = [];
  var currentLi = li;
  var currentOl = parent;

  while (currentOl && currentOl.tagName === 'OL') {
    var siblings = currentOl.querySelectorAll(':scope > li');
    var idx = Array.from(siblings).indexOf(currentLi);
    if (idx === -1) break;
    path.unshift(idx + 1);
    var containerLi = currentOl.parentElement;
    if (!containerLi || containerLi.tagName !== 'LI') break;
    currentLi = containerLi;
    currentOl = containerLi.parentElement;
  }

  if (path.length === 0) return '1.';
  return path.join('.') + '.';
}

function injectStyles() {
  if (document.getElementById('toc-style')) return;
  var style = document.createElement('style');
  style.id = 'toc-style';
  style.textContent =
    '.toc-sidebar{display:flex;flex-direction:row;background:rgba(10,22,32,0.98);border-left:1px solid #1e3a44;overflow:hidden;flex-shrink:0;transition:width .22s ease;position:relative}' +
    '.toc-sidebar[data-collapsed="false"]{width:260px}' +
    '.toc-sidebar[data-collapsed="true"]{width:22px}' +
    '.toc-tab{width:22px;min-width:22px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#4a7a8a;font-size:11px;user-select:none;background:rgba(44,110,126,0.08);transition:background .15s,color .15s}' +
    '.toc-tab:hover{background:rgba(44,110,126,0.2);color:#aef0ff}' +
    '.toc-body{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0}' +
    '.toc-sidebar[data-collapsed="true"] .toc-body{display:none}' +
    '.toc-header{display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid #1e3a44;flex-shrink:0;color:#88aacc;font-size:13px;font-weight:600;letter-spacing:.5px}' +
    '.toc-refresh{background:none;border:1px solid #2c4a5a;color:#4a7a8a;border-radius:4px;width:24px;height:24px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;transition:color .15s,border-color .15s}' +
    '.toc-refresh:hover{color:#aef0ff;border-color:#0ff}' +
    '.toc-tree{flex:1;overflow-y:auto;padding:4px 0}' +
    '.toc-tree::-webkit-scrollbar{width:4px}' +
    '.toc-tree::-webkit-scrollbar-thumb{background:#1e3a44;border-radius:2px}' +
    '.toc-empty{padding:20px 12px;color:#4a6a7a;font-size:12px;text-align:center}' +
    '.toc-list{list-style:none;margin:0;padding:0}' +
    '.toc-item a{display:flex;align-items:center;gap:6px;padding:4px 12px;color:#7a9aab;font-size:12px;text-decoration:none;cursor:pointer;border-left:2px solid transparent;transition:background .1s,color .1s,border-color .1s;line-height:1.4}' +
    '.toc-item a:hover{background:rgba(44,110,126,0.1);color:#aef0ff;border-left-color:#2c6e7e}' +
    '.toc-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#2c4a5a;flex-shrink:0}' +
    '.toc-item a:hover .toc-dot{background:#0ff}' +
    '.toc-item a{gap:4px}' +
    '.toc-marker{color:#4a7a8a;font-size:11px;flex-shrink:0;min-width:24px;text-align:right;white-space:nowrap;font-family:\'Fira Code\',\'Consolas\',monospace}' +
    '.toc-l1 a{padding-left:12px}' +
    '.toc-l1 .toc-dot{width:8px;height:8px;background:#0ff}' +
    '.toc-l2 a{padding-left:28px}' +
    '.toc-l3 a{padding-left:44px}' +
    '.toc-l4 a{padding-left:60px}' +
    '.toc-l5 a{padding-left:76px}' +
    '.toc-l6 a{padding-left:92px}';
  document.head.appendChild(style);
}