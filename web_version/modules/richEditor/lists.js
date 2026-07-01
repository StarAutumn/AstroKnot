// ============================================================
// lists.js – 列表功能（项目符号，编号）
// ============================================================

export function registerListFeatures(editor, state) {

  function _injectEditorCSS(ed, id, css) {
    let doc = ed.getDoc();
    let styleEl = doc.getElementById('tmce-custom-list-styles');
    if (!styleEl) {
      styleEl = doc.createElement('style');
      styleEl.id = 'tmce-custom-list-styles';
      (doc.head || doc.documentElement).appendChild(styleEl);
    }
    let prefix = '/* ' + id + ' */';
    let pattern = new RegExp('/\\*\\s*' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\*/(?:\\n|.)*?(?=/\\*|$)', 'g');
    styleEl.textContent = styleEl.textContent.replace(pattern, '');
    styleEl.textContent += '\n' + prefix + '\n' + css + '\n';
  }

  let _bulletPresets = [
    { text: '● 实心圆', char: '●' },
    { text: '○ 空心圆', char: '○' },
    { text: '■ 实心方块', char: '■' },
    { text: '□ 空心方块', char: '□' },
    { text: '◆ 实心菱形', char: '◆' },
    { text: '► 实心箭头', char: '►' },
    { text: '✓ 对勾', char: '✓' },
    { text: '☞ 手指', char: '☞' },
    { text: '✿ 花朵', char: '✿' },
    { text: '⚡ 闪电', char: '⚡' }
  ];

  function _applyCustomBulvar(ed, char, indent, gap) {
    let indentVal = (indent !== undefined && indent !== null && indent !== '') ? indent : '0';
    let gapVal = (gap !== undefined && gap !== null && gap !== '') ? gap : '0.3em';
    ed.undoManager.transact(function () {
      let node = ed.selection.getNode();
      let ul = ed.dom.getParent(node, 'ul');
      if (!ul) {
        ed.execCommand('InsertUnorderedList');
        ul = ed.dom.getParent(ed.selection.getNode(), 'ul');
        if (!ul) return;
        let sib = ul.previousSibling;
        while (sib && sib.nodeType === 1 && /^(P|H[1-6]|DIV|OL|UL)$/.test(sib.tagName)) {
          if (sib.tagName === 'UL' && sib.getAttribute('data-bullet-id')) {
            while (ul.firstChild) sib.appendChild(ul.firstChild);
            if (ul.parentNode) ul.parentNode.removeChild(ul);
            ul = sib;
            break;
          }
          sib = sib.previousSibling;
        }
        // 不 return，继续向下执行以应用自定义项目符号样式
      }
      if (ul.nodeName !== 'UL') {
        ed.execCommand('InsertUnorderedList');
        ul = ed.dom.getParent(ed.selection.getNode(), 'ul');
        if (!ul) return;
      }
      ul.removeAttribute('data-bullet-id');
      ul.removeAttribute('data-number-id');
      let cleanedClasses = ul.className.split(/\s+/).filter(function (c) { return !/^ml-/.test(c); });
      ul.className = cleanedClasses.join(' ');
      let uid = 'cb' + Date.now() + Math.random().toString(36).slice(2, 6);
      ul.setAttribute('data-bullet-id', uid);
      ul.style.listStyleType = 'none';
      ul.style.removeProperty('list-style-type');
      ul.style.setProperty('list-style-type', 'none', 'important');
      _injectEditorCSS(ed, uid,
        'ul[data-bullet-id="' + uid + '"] { list-style-type: none !important; padding-left: ' + indentVal + ' !important; }' +
        'ul[data-bullet-id="' + uid + '"] > li { list-style-type: none !important; }' +
        'ul[data-bullet-id="' + uid + '"] > li::marker { content: none; }' +
        'ul[data-bullet-id="' + uid + '"] > li::before { content: "' + char.replace(/"/g, '\\"') + '"; margin-right: ' + gapVal + '; color:inherit;font-size:var(--mkr-font-size,inherit);font-family:var(--mkr-font-family,inherit);font-weight:var(--mkr-font-weight,inherit);font-style:var(--mkr-font-style,inherit);text-decoration-line:var(--mkr-text-deco,inherit);border:var(--mkr-border,inherit);background-color:var(--mkr-bg-color,inherit);background-image:var(--mkr-bg-image,inherit);-webkit-background-clip:var(--mkr-bg-clip,inherit);-webkit-text-fill-color:var(--mkr-text-fill,inherit)}'
      );
    });
  }

  // ─── 方案A：JS 显式编号，用 attr(data-li-num) 彻底绕过 CSS counter ───
  function _formatListNumber(n, style, prefix, suffix) {
    let numStr;
    switch (style) {
      case 'decimal':           numStr = String(n); break;
      case 'lower-alpha':       numStr = String.fromCharCode(96 + ((n - 1) % 26) + 1); break;
      case 'upper-alpha':       numStr = String.fromCharCode(64 + ((n - 1) % 26) + 1); break;
      case 'lower-roman':       numStr = _toRomanNum(n).toLowerCase(); break;
      case 'upper-roman':       numStr = _toRomanNum(n); break;
      case 'cjk-ideographic':   numStr = _toCJKNumber(n); break;
      case 'simp-chinese-formal': numStr = _toCJKFormalNum(n); break;
      default:                  numStr = String(n);
    }
    return (prefix || '') + numStr + (suffix || '');
  }

  function _toRomanNum(n) {
    if (n <= 0 || n > 3999) return String(n);
    var vals = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
    var syms = ['M', 'CM', 'D', 'CD', 'C', 'XC', 'L', 'XL', 'X', 'IX', 'V', 'IV', 'I'];
    var res = '';
    for (var i = 0; i < vals.length; i++) {
      while (n >= vals[i]) { res += syms[i]; n -= vals[i]; }
    }
    return res;
  }

  function _toCJKNumber(n) {
    var digits = ['\u96F6', '\u4E00', '\u4E8C', '\u4E09', '\u56DB', '\u4E94', '\u516D', '\u4E03', '\u516B', '\u4E5D'];
    if (n <= 0) return '\u96F6';
    if (n < 10) return digits[n];
    if (n === 10) return '\u5341';
    if (n < 20) return '\u5341' + digits[n - 10];
    if (n < 100) {
      var tens = Math.floor(n / 10), ones = n % 10;
      return digits[tens] + '\u5341' + (ones > 0 ? digits[ones] : '');
    }
    return String(n);
  }

  function _toCJKFormalNum(n) {
    var digits = ['\u96F6', '\u58F9', '\u8D30', '\u53C1', '\u8086', '\u4F0D', '\u9646', '\u67D2', '\u634C', '\u7396'];
    if (n <= 0) return '\u96F6';
    if (n < 10) return digits[n];
    if (n === 10) return '\u62FE';
    if (n < 20) return '\u62FE' + digits[n - 10];
    if (n < 100) {
      var tens = Math.floor(n / 10), ones = n % 10;
      return digits[tens] + '\u62FE' + (ones > 0 ? digits[ones] : '');
    }
    return String(n);
  }

  // 跨 ol 遍历：从 srcOl 往前扫描，累计所有同级 ol[data-number-id] 中的 li 总数
  function _countPrevLiTotal(srcOl) {
    var total = 0;
    var sib = srcOl.previousSibling;
    while (sib && sib.nodeType === 1 && /^(P|H[1-6]|DIV|OL|UL)$/.test(sib.tagName)) {
      if (sib.tagName === 'OL' && sib.getAttribute('data-number-id')) {
        // 只计直接子 li（避免算到嵌套 ol 里的 li）
        var count = 0;
        for (var c = sib.firstChild; c; c = c.nextSibling) {
          if (c.nodeName === 'LI') count++;
        }
        total += count;
        // 继续往前，因为前面可能还有更多 ol（跨多个段落）
        sib = sib.previousSibling;
        continue;
      }
      sib = sib.previousSibling;
    }
    return total;
  }

  // 同步一个 ol 的编号：给每个 li 设置独立的 counter-reset: cli-num N
  // 用 counter(cli-num) 读取，100% 可靠跨 ol 连续
  function _syncOneNumberedList(ol) {
    var cfgStr = ol.getAttribute('data-num-cfg');
    var cfg = { style: 'decimal', prefix: '', suffix: '' };
    if (cfgStr) {
      try { var parsed = JSON.parse(cfgStr); cfg = parsed; } catch(e) {}
    }
    var style = cfg.style || 'decimal';
    var prefix = cfg.prefix || '';
    var suffix = cfg.suffix || '';
    var start = parseInt(cfg.start) || 1;

    // 累加前面同级 ol 的 li 数量（跨 ol 续号）
    var offset = _countPrevLiTotal(ol);

    var idx = 0;
    for (var c = ol.firstChild; c; c = c.nextSibling) {
      if (c.nodeName === 'LI') {
        var numVal = start + offset + idx;
        // 设置独立 counter-reset，每个 li 的::before 读自己的 counter
        c.style.setProperty('counter-reset', 'cli-num ' + numVal, 'important');
        // 同时保存备份属性用于调试
        c.setAttribute('data-li-num', _formatListNumber(numVal, style, prefix, suffix));
        idx++;
      }
    }
  }

  // 同步编辑区内所有编号列表
  function _syncAllNumberedLists(ed) {
    if (!ed) return;
    try {
      var body = ed.getBody();
      if (!body) return;
      var ols = body.querySelectorAll('ol[data-number-id]');
      for (var i = 0; i < ols.length; i++) {
        _syncOneNumberedList(ols[i]);
      }
    } catch(e) {}
  }

  function _applyCustomNumber(ed, cfg) {
    var indentVal = (cfg.indent !== undefined && cfg.indent !== null && cfg.indent !== '') ? cfg.indent : '0';
    var gapVal   = (cfg.gap     !== undefined && cfg.gap     !== null && cfg.gap     !== '') ? cfg.gap     : '0.3em';
    var targetOl = null;  // 在事务内捕获引用
    ed.undoManager.transact(function () {
      var node = ed.selection.getNode();
      var ol = ed.dom.getParent(node, 'ol');
      if (!ol) {
        ed.execCommand('InsertOrderedList');
        ol = ed.dom.getParent(ed.selection.getNode(), 'ol');
        if (!ol) return;
      }
      if (ol.nodeName !== 'OL') {
        ed.execCommand('InsertOrderedList');
        ol = ed.dom.getParent(ed.selection.getNode(), 'ol');
        if (!ol) return;
      }

      // 清除旧属性
      ol.removeAttribute('data-bullet-id');
      ol.removeAttribute('data-number-id');
      var cleanedClasses = ol.className.split(/\s+/).filter(function (c) { return !/^ml-/.test(c); });
      ol.className = cleanedClasses.join(' ');

      var uid = 'cn' + Date.now() + Math.random().toString(36).slice(2, 6);
      ol.setAttribute('data-number-id', uid);
      ol.setAttribute('data-num-cfg', JSON.stringify({
        style: cfg.style || 'decimal',
        prefix: cfg.prefix || '',
        suffix: cfg.suffix || '',
        start: cfg.start || 1,
        indent: indentVal,
        gap: gapVal
      }));
      ol.style.listStyleType = 'none';
      ol.style.setProperty('list-style-type', 'none', 'important');
      // 禁用可能冲突的 counter 属性
      ol.style.setProperty('counter-reset', 'none', 'important');
      ol.style.setProperty('counter-increment', 'none', 'important');

      // 注入 CSS：每个 li 用独立 counter-reset: cli-num N，::before 读 counter(cli-num)
      // prefix/suffix 通过 CSS 自定义属性传入，style 硬编码在 counter() 参数中
      _injectEditorCSS(ed, uid,
        'ol[data-number-id="' + uid + '"] { ' +
          'list-style-type: none !important; ' +
          'padding-left: ' + indentVal + ' !important; ' +
          'counter-reset: none !important; ' +
          '--li-prefix: "' + (cfg.prefix || '').replace(/"/g, '\\"') + '"; ' +
          '--li-suffix: "' + (cfg.suffix || '').replace(/"/g, '\\"') + '"; ' +
        '}' +
        'ol[data-number-id="' + uid + '"] > li { ' +
          'list-style-type: none !important; ' +
          'counter-increment: none !important; ' +
          'position: relative; ' +
        '}' +
        'ol[data-number-id="' + uid + '"] > li::marker { ' +
          'content: none !important; ' +
          'display: none !important; ' +
        '}' +
        'ol[data-number-id="' + uid + '"] > li::before { ' +
          'content: var(--li-prefix) counter(cli-num, ' + (cfg.style || 'decimal') + ') var(--li-suffix) !important; ' +
          'display: inline !important; ' +
          'margin-right: ' + gapVal + '; ' +
          'white-space: pre !important; ' +
          'color:inherit;font-size:var(--mkr-font-size,inherit);font-family:var(--mkr-font-family,inherit);' +
          'font-weight:var(--mkr-font-weight,inherit);font-style:var(--mkr-font-style,inherit);' +
          'text-decoration-line:var(--mkr-text-deco,inherit);border:var(--mkr-border,inherit);' +
          'background-color:var(--mkr-bg-color,inherit);background-image:var(--mkr-bg-image,inherit);' +
          '-webkit-background-clip:var(--mkr-bg-clip,inherit);-webkit-text-fill-color:var(--mkr-text-fill,inherit)}'
      );

      targetOl = ol;
    });

    // 在事务外同步编号，确保 DOM 已稳定
    if (targetOl) {
      (function (ol) {
        setTimeout(function () { _syncOneNumberedList(ol); }, 0);
      })(targetOl);
    }
  }

  function _showDefineBulletDialog(ed) {
    let existing = document.getElementById('defineBulletOverlay');
    if (existing) existing.remove();

    let overlay = document.createElement('div');
    overlay.id = 'defineBulletOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:10002;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;';

    let dlg = document.createElement('div');
    dlg.style.cssText = 'background:#0d1f2b;border:1px solid #2c6e7e;border-radius:14px;padding:16px;box-shadow:0 6px 30px rgba(0,0,0,0.8);min-width:380px;max-width:440px;';

    let titleBar = document.createElement('div');
    titleBar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;';
    let titleEl = document.createElement('span');
    titleEl.textContent = '定义新项目符号';
    titleEl.style.cssText = 'color:#ccd;font-size:14px;font-weight:bold;';
    titleBar.appendChild(titleEl);
    let closeBtn = document.createElement('span');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'color:#8899aa;cursor:pointer;font-size:16px;';
    closeBtn.addEventListener('click', function () { overlay.remove(); });
    titleBar.appendChild(closeBtn);
    dlg.appendChild(titleBar);

    let previewArea = document.createElement('div');
    previewArea.style.cssText = 'background:#061218;border:1px solid #1e3a44;border-radius:8px;padding:8px 12px;margin-bottom:10px;min-height:24px;color:#ccd;font-size:13px;';
    previewArea.textContent = '项目符号行';
    dlg.appendChild(previewArea);

    let charGrid = document.createElement('div');
    charGrid.style.cssText = 'display:grid;grid-template-columns:repeat(8, 1fr);gap:3px;margin-bottom:10px;max-height:180px;overflow-y:auto;';
    let allChars = '●○■□◆◇►▲▼★☆✓✔✗✘☐☑☒☞☛☜✿❀⚡♠♣♥♦♪♫☀☁☂☃★☆✈⚙ℹ➤➜➢☰☱☲☳☴☵☶☷✉📁№℗®©™';
    let selectedChar = '●';
    function buildGrid() {
      charGrid.innerHTML = '';
      for (let i = 0; i < allChars.length; i++) {
        (function (c) {
          let cell = document.createElement('div');
          cell.textContent = c;
          cell.style.cssText = 'width:100%;aspect-ratio:1;display:flex;align-items:center;justify-content:center;cursor:pointer;border-radius:4px;font-size:18px;background:' + (c === selectedChar ? '#2c6e7e' : '#122') + ';color:' + (c === selectedChar ? '#fff' : '#ccd') + ';border:1px solid ' + (c === selectedChar ? '#5ab' : '#1e3a44') + ';';
          cell.addEventListener('click', function () {
            selectedChar = c;
            previewArea.textContent = c + '  项目符号行';
            buildGrid();
          });
          charGrid.appendChild(cell);
        })(allChars[i]);
      }
    }
    buildGrid();
    dlg.appendChild(charGrid);

    let customRow = document.createElement('div');
    customRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:12px;';
    let customLabel = document.createElement('span');
    customLabel.textContent = '自定义字符:';
    customLabel.style.cssText = 'color:#8899aa;font-size:11px;flex-shrink:0;';
    customRow.appendChild(customLabel);
    let customInput = document.createElement('input');
    customInput.type = 'text';
    customInput.placeholder = '输入符号';
    customInput.maxLength = 2;
    customInput.style.cssText = 'width:60px;background:#122;border:1px solid #2c6e7e;color:#ccd;border-radius:4px;padding:3px 6px;font-size:13px;text-align:center;';
    customInput.addEventListener('input', function () {
      let v = customInput.value.trim();
      if (v) { selectedChar = v; previewArea.textContent = v + '  项目符号行'; buildGrid(); }
    });
    customRow.appendChild(customInput);
    dlg.appendChild(customRow);

    let indentRow = document.createElement('div');
    indentRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:8px;';
    let indentLabel = document.createElement('span');
    indentLabel.textContent = '缩进位置:';
    indentLabel.style.cssText = 'color:#8899aa;font-size:11px;flex-shrink:0;min-width:64px;';
    indentRow.appendChild(indentLabel);
    let indentInput = document.createElement('input');
    indentInput.type = 'text';
    indentInput.value = '0';
    indentInput.style.cssText = 'width:56px;background:#122;border:1px solid #2c6e7e;color:#ccd;border-radius:4px;padding:3px 6px;font-size:13px;text-align:center;';
    indentRow.appendChild(indentInput);
    let indentUnit = document.createElement('span');
    indentUnit.textContent = 'em';
    indentUnit.style.cssText = 'color:#8899aa;font-size:11px;';
    indentRow.appendChild(indentUnit);
    dlg.appendChild(indentRow);

    let gapRow = document.createElement('div');
    gapRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:12px;';
    let gapLabel = document.createElement('span');
    gapLabel.textContent = '符号间距:';
    gapLabel.style.cssText = 'color:#8899aa;font-size:11px;flex-shrink:0;min-width:64px;';
    gapRow.appendChild(gapLabel);
    let gapInput = document.createElement('input');
    gapInput.type = 'text';
    gapInput.value = '0.3';
    gapInput.style.cssText = 'width:56px;background:#122;border:1px solid #2c6e7e;color:#ccd;border-radius:4px;padding:3px 6px;font-size:13px;text-align:center;';
    gapRow.appendChild(gapInput);
    let gapUnit = document.createElement('span');
    gapUnit.textContent = 'em';
    gapUnit.style.cssText = 'color:#8899aa;font-size:11px;';
    gapRow.appendChild(gapUnit);
    dlg.appendChild(gapRow);

    let btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;';
    let cancelBtn = document.createElement('button');
    cancelBtn.textContent = '取消';
    cancelBtn.style.cssText = 'flex:1;background:#1a3a44;border:1px solid #2c6e7e;color:#ccd;cursor:pointer;border-radius:6px;padding:6px;font-size:13px;';
    cancelBtn.addEventListener('click', function () { overlay.remove(); });
    btnRow.appendChild(cancelBtn);
    let okBtn = document.createElement('button');
    okBtn.textContent = '确定';
    okBtn.style.cssText = 'flex:1;background:#2c6e7e;border:none;color:#fff;cursor:pointer;border-radius:6px;padding:6px;font-size:13px;font-weight:bold;';
    okBtn.addEventListener('click', function () {
      _applyCustomBulvar(ed, selectedChar, indentInput.value + 'em', gapInput.value + 'em');
      overlay.remove();
    });
    btnRow.appendChild(okBtn);
    dlg.appendChild(btnRow);

    dlg.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    overlay.appendChild(dlg);
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
  }

  function _showDefineNumberDialog(ed) {
    let existing = document.getElementById('defineNumberOverlay');
    if (existing) existing.remove();

    let overlay = document.createElement('div');
    overlay.id = 'defineNumberOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:10002;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;';

    let dlg = document.createElement('div');
    dlg.style.cssText = 'background:#0d1f2b;border:1px solid #2c6e7e;border-radius:14px;padding:16px;box-shadow:0 6px 30px rgba(0,0,0,0.8);min-width:380px;max-width:440px;';

    let titleBar = document.createElement('div');
    titleBar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;';
    let titleEl = document.createElement('span');
    titleEl.textContent = '定义新编号格式';
    titleEl.style.cssText = 'color:#ccd;font-size:14px;font-weight:bold;';
    titleBar.appendChild(titleEl);
    let closeBtn = document.createElement('span');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'color:#8899aa;cursor:pointer;font-size:16px;';
    closeBtn.addEventListener('click', function () { overlay.remove(); });
    titleBar.appendChild(closeBtn);
    dlg.appendChild(titleBar);

    let numStyles = [
      { text: '1, 2, 3, ...', value: 'decimal' },
      { text: 'a, b, c, ...', value: 'lower-alpha' },
      { text: 'A, B, C, ...', value: 'upper-alpha' },
      { text: 'i, ii, iii, ...', value: 'lower-roman' },
      { text: 'I, II, III, ...', value: 'upper-roman' },
      { text: '一, 二, 三, ...', value: 'cjk-ideographic' },
      { text: '壹, 贰, 叁, ...', value: 'simp-chinese-formal' }
    ];

    function buildRow(label, child) {
      let row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px;';
      let lb = document.createElement('span');
      lb.textContent = label;
      lb.style.cssText = 'color:#8899aa;font-size:11px;flex-shrink:0;min-width:56px;';
      row.appendChild(lb);
      row.appendChild(child);
      return row;
    }

    function buildInput(cls) {
      let inp = document.createElement('input');
      inp.type = 'text';
      inp.className = cls;
      inp.style.cssText = 'background:#122;border:1px solid #2c6e7e;color:#ccd;border-radius:4px;padding:4px 8px;font-size:13px;flex:1;';
      return inp;
    }

    let selStyle = 'decimal';
    let styleSelect = document.createElement('select');
    styleSelect.style.cssText = 'background:#122;border:1px solid #2c6e7e;color:#ccd;border-radius:4px;padding:4px 8px;font-size:13px;flex:1;';
    numStyles.forEach(function (ns) {
      let opt = document.createElement('option');
      opt.value = ns.value;
      opt.textContent = ns.text;
      styleSelect.appendChild(opt);
    });
    styleSelect.addEventListener('change', function () { selStyle = styleSelect.value; updatePreview(); });
    dlg.appendChild(buildRow('编号样式:', styleSelect));

    let prefixInput = buildInput('num-prefix');
    prefixInput.placeholder = '如: ( ';
    dlg.appendChild(buildRow('前缀:', prefixInput));

    let suffixInput = buildInput('num-suffix');
    suffixInput.placeholder = '如: )';
    dlg.appendChild(buildRow('后缀:', suffixInput));

    let startInput = buildInput('num-start');
    startInput.type = 'number';
    startInput.value = '1';
    startInput.min = '1';
    startInput.style.cssText = startInput.style.cssText.replace('flex:1;', 'width:70px;flex:none;');
    dlg.appendChild(buildRow('起始编号:', startInput));

    let indentInput = buildInput('num-indent');
    indentInput.type = 'text';
    indentInput.value = '0';
    indentInput.style.cssText = indentInput.style.cssText.replace('flex:1;', 'width:56px;flex:none;text-align:center;');
    dlg.appendChild(buildRow('缩进位置:', indentInput));
    let indentUnit = document.createElement('span');
    indentUnit.textContent = ' em';
    indentUnit.style.cssText = 'color:#8899aa;font-size:11px;margin-left:-4px;';
    indentInput.parentNode.appendChild(indentUnit);

    let gapInput = buildInput('num-gap');
    gapInput.type = 'text';
    gapInput.value = '0.3';
    gapInput.style.cssText = gapInput.style.cssText.replace('flex:1;', 'width:56px;flex:none;text-align:center;');
    dlg.appendChild(buildRow('符号间距:', gapInput));
    let gapUnit = document.createElement('span');
    gapUnit.textContent = ' em';
    gapUnit.style.cssText = 'color:#8899aa;font-size:11px;margin-left:-4px;';
    gapInput.parentNode.appendChild(gapUnit);

    let previewLabel = document.createElement('div');
    previewLabel.textContent = '预览:';
    previewLabel.style.cssText = 'color:#8899aa;font-size:11px;margin-bottom:4px;';
    dlg.appendChild(previewLabel);

    let previewArea = document.createElement('div');
    previewArea.style.cssText = 'background:#061218;border:1px solid #1e3a44;border-radius:8px;padding:8px 12px;margin-bottom:12px;color:#ccd;font-size:13px;min-height:24px;';
    function updatePreview() {
      previewArea.textContent = (prefixInput.value || '') + '1' + (suffixInput.value || '');
    }
    updatePreview();
    prefixInput.addEventListener('input', updatePreview);
    suffixInput.addEventListener('input', updatePreview);

    dlg.appendChild(previewArea);

    let btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;';
    let cancelBtn = document.createElement('button');
    cancelBtn.textContent = '取消';
    cancelBtn.style.cssText = 'flex:1;background:#1a3a44;border:1px solid #2c6e7e;color:#ccd;cursor:pointer;border-radius:6px;padding:6px;font-size:13px;';
    cancelBtn.addEventListener('click', function () { overlay.remove(); });
    btnRow.appendChild(cancelBtn);
    let okBtn = document.createElement('button');
    okBtn.textContent = '确定';
    okBtn.style.cssText = 'flex:1;background:#2c6e7e;border:none;color:#fff;cursor:pointer;border-radius:6px;padding:6px;font-size:13px;font-weight:bold;';
    okBtn.addEventListener('click', function () {
      _applyCustomNumber(ed, {
        style: styleSelect.value,
        prefix: prefixInput.value,
        suffix: suffixInput.value,
        start: parseInt(startInput.value) || 1,
        indent: indentInput.value + 'em',
        gap: gapInput.value + 'em'
      });
      overlay.remove();
    });
    btnRow.appendChild(okBtn);
    dlg.appendChild(btnRow);

    dlg.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    overlay.appendChild(dlg);
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
  }

  try {
    editor.ui.registry.addMenuButton('custombullist', {
      icon: 'unordered-list',
      tooltip: '项目符号',
      fetch: function (callback) {
        var items = [];
        _bulletPresets.forEach(function (p) {
          items.push({
            type: 'menuitem', text: p.text,
            onAction: function () { _applyCustomBulvar(editor, p.char); }
          });
        });
        items.push({ type: 'separator' });
        items.push({
          type: 'menuitem', text: '定义新项目符号…',
          onAction: function () { _showDefineBulletDialog(editor); }
        });
        callback(items);
      },
      onSetup: function (api) {
        function updateState() {
          var node = editor.selection.getNode();
          var ul = editor.dom.getParent(node, 'ul');
          if (ul) { api.setActive(true); }
          else { api.setActive(false); }
        }
        editor.on('NodeChange', updateState);
        return function () { editor.off('NodeChange', updateState); };
      }
    });
  } catch (e) {
    console.error('[TinyMCE] custombullist 按钮注册失败:', e);
  }

  try {
    editor.ui.registry.addMenuButton('customnumlist', {
      icon: 'ordered-list',
      tooltip: '编号列表',
      fetch: function (callback) {
        var items = [];
        var numPresets = [
          { text: '1.  2.  3.  ...', style: 'decimal', prefix: '', suffix: '.' },
          { text: '1)  2)  3)  ...', style: 'decimal', prefix: '', suffix: ')' },
          { text: '(1)  (2)  (3) ...', style: 'decimal', prefix: '(', suffix: ')' },
          { text: 'a.  b.  c.  ...', style: 'lower-alpha', prefix: '', suffix: '.' },
          { text: 'A.  B.  C.  ...', style: 'upper-alpha', prefix: '', suffix: '.' },
          { text: 'i.  ii.  iii.  ...', style: 'lower-roman', prefix: '', suffix: '.' },
          { text: 'I.  II.  III.  ...', style: 'upper-roman', prefix: '', suffix: '.' },
          { text: '一、  二、  三、  ...', style: 'cjk-ideographic', prefix: '', suffix: '、' }
        ];
        numPresets.forEach(function (p) {
          items.push({
            type: 'menuitem', text: p.text,
            onAction: function () { _applyCustomNumber(editor, { style: p.style, prefix: p.prefix, suffix: p.suffix, start: 1 }); }
          });
        });
        items.push({ type: 'separator' });
        items.push({
          type: 'menuitem', text: '定义新编号格式…',
          onAction: function () { _showDefineNumberDialog(editor); }
        });
        callback(items);
      },
      onSetup: function (api) {
        function updateState() {
          var node = editor.selection.getNode();
          var ol = editor.dom.getParent(node, 'ol');
          if (ol) { api.setActive(true); }
          else { api.setActive(false); }
        }
        editor.on('NodeChange', updateState);
        return function () { editor.off('NodeChange', updateState); };
      }
    });
  } catch (e) {
    console.error('[TinyMCE] customnumlist 按钮注册失败:', e);
  }

  // ─── 自动同步：监听编辑区变化 → 重新计算所有编号列表的 --li-num ───
  var _syncTimer = null;
  function _debouncedSync() {
    if (_syncTimer) clearTimeout(_syncTimer);
    _syncTimer = setTimeout(function () {
      _syncTimer = null;
      _syncAllNumberedLists(editor);
    }, 80);
  }

  // 关键事件：所有可能改变列表结构的 DOM 操作都触发同步
  editor.on('NodeChange', _debouncedSync);
  editor.on('input', _debouncedSync);
  editor.on('SetContent', function () {
    setTimeout(function () { _syncAllNumberedLists(editor); }, 100);
  });
  editor.on('keyup', function (e) {
    if (e.keyCode === 13 || e.keyCode === 8 || e.keyCode === 46) {
      _debouncedSync();
    }
  });
  // ExecCommand 拦截：TinyMCE 内部列表命令（缩进/取消缩进/切换列表类型等）
  editor.on('ExecCommand', function (e) {
    var cmd = (e.command || '').toLowerCase();
    if (/^(insertorderedlist|insertunorderedlist|indent|outdent|mceindent|mceoutdent)$/.test(cmd)) {
      _debouncedSync();
    }
  });
  editor.on('undo', function () { setTimeout(function () { _syncAllNumberedLists(editor); }, 30); });
  editor.on('redo', function () { setTimeout(function () { _syncAllNumberedLists(editor); }, 30); });
  // 初始加载后同步
  editor.on('init', function () {
    setTimeout(function () { _syncAllNumberedLists(editor); }, 300);
  });

}

// ============================================================
// 公用：重新编号所有语义化标题 (h1-h6 中带 .toc-num 的)
// ============================================================

export function renumberAllHeadings(editor) {
  var body = editor.getBody();
  if (!body) return;

  var headings = body.querySelectorAll('h1,h2,h3,h4,h5,h6');
  var counters = [0, 0, 0, 0, 0, 0];

  editor.undoManager.transact(function () {
    headings.forEach(function (el) {
      var lv = parseInt(el.tagName.substring(1));
      counters[lv - 1]++;
      for (var i = lv; i < 6; i++) counters[i] = 0;

      var num = counters.slice(0, lv).join('.');

      // 已有编号 span → 只更新文本
      var numSpan = el.querySelector('.toc-num');
      if (numSpan) {
        numSpan.textContent = num;
      } else {
        // 旧格式兼容：在开头插入编号 span
        numSpan = document.createElement('span');
        numSpan.className = 'toc-num';
        numSpan.contentEditable = 'false';
        numSpan.textContent = num;
        el.insertBefore(numSpan, el.firstChild);
        el.insertBefore(document.createTextNode(' '), numSpan.nextSibling);
      }

      // 补上 data-toc-title（如果缺失）
      if (!el.getAttribute('data-toc-title')) {
        var titleText = el.textContent.trim();
        el.setAttribute('data-toc-title', titleText);
      }
    });
  });
}