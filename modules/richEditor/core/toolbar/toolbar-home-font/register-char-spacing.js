import { state } from '../../../shared-state.js';
import { _wrapTextNodesInSel } from './shared.js';

export function registerCharSpacing(editor) {
      try {
        editor.ui.registry.addMenuButton('charsapcing', {
          text: '间距',
          tooltip: '字符间距',
          fetch: function (callback) {
            callback([
              {
                type: 'menuitem', text: '缩放...',
                onAction: function () { showCustomScaleDialog(); }
              },
              {
                type: 'nestedmenuitem', text: '间距',
                getSubmenuItems: function () {
                  return [
                    { type: 'menuitem', text: '正常', onAction: function () { applyCharSpacing('spacing', 'normal'); } },
                    { type: 'menuitem', text: '加宽 1px', onAction: function () { applyCharSpacing('spacing', 'wide1'); } },
                    { type: 'menuitem', text: '加宽 2px', onAction: function () { applyCharSpacing('spacing', 'wide2'); } },
                    { type: 'menuitem', text: '加宽 3px', onAction: function () { applyCharSpacing('spacing', 'wide3'); } },
                    { type: 'menuitem', text: '紧缩', onAction: function () { applyCharSpacing('spacing', 'tight'); } }
                  ];
                }
              },
              {
                type: 'nestedmenuitem', text: '位置',
                getSubmenuItems: function () {
                  return [
                    { type: 'menuitem', text: '正常基线', onAction: function () { applyCharSpacing('position', 'baseline'); } },
                    { type: 'menuitem', text: '上标', onAction: function () { applyCharSpacing('position', 'super'); } },
                    { type: 'menuitem', text: '下标', onAction: function () { applyCharSpacing('position', 'sub'); } },
                    { type: 'menuitem', text: '上移 4px', onAction: function () { applyCharSpacing('position', 'up4'); } },
                    { type: 'menuitem', text: '下移 4px', onAction: function () { applyCharSpacing('position', 'down4'); } }
                  ];
                }
              }
            ]);
          }
        });
      } catch (e) {
        console.error('[TinyMCE] charsapcing 按钮注册失败:', e);
      }

      function showCustomScaleDialog() {
        var ed = state.tinyEditor;
        if (!ed) return;
        var bookmark = ed.selection.getBookmark();

        var existingOverlay = document.getElementById('customScaleOverlay');
        if (existingOverlay) existingOverlay.remove();

        var overlay = document.createElement('div');
        overlay.id = 'customScaleOverlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:10002;background:rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;';

        var dlg = document.createElement('div');
        dlg.style.cssText = 'background:#0d1f2b;border:1px solid #2c6e7e;border-radius:14px;padding:20px;box-shadow:0 6px 30px rgba(0,0,0,0.8);min-width:280px;max-width:320px;';

        var titleBar = document.createElement('div');
        titleBar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;';
        var titleLabel = document.createElement('span');
        titleLabel.textContent = '字符缩放';
        titleLabel.style.cssText = 'color:#ccd;font-size:15px;font-weight:bold;';
        titleBar.appendChild(titleLabel);
        var closeBtn = document.createElement('span');
        closeBtn.textContent = '\u2715';
        closeBtn.style.cssText = 'color:#8899aa;cursor:pointer;font-size:16px;';
        closeBtn.addEventListener('click', function () { overlay.remove(); });
        titleBar.appendChild(closeBtn);
        dlg.appendChild(titleBar);

        var body = document.createElement('div');
        body.style.cssText = 'display:flex;flex-direction:column;gap:10px;';

        var label = document.createElement('div');
        label.textContent = '缩放比例 (%)';
        label.style.cssText = 'color:#8899aa;font-size:12px;';
        body.appendChild(label);

        var inputRow = document.createElement('div');
        inputRow.style.cssText = 'display:flex;align-items:center;gap:8px;';

        var input = document.createElement('input');
        input.type = 'number';
        input.min = '10';
        input.max = '500';
        input.value = '100';
        input.style.cssText = 'flex:1;background:#0a1a24;border:1px solid #2c6e7e;color:#eef;border-radius:6px;padding:8px 10px;font-size:14px;outline:none;text-align:center;';
        inputRow.appendChild(input);

        var pctLabel = document.createElement('span');
        pctLabel.textContent = '%';
        pctLabel.style.cssText = 'color:#8899aa;font-size:13px;';
        inputRow.appendChild(pctLabel);
        body.appendChild(inputRow);

        var hint = document.createElement('div');
        hint.textContent = '100% = 正常宽度，>100% = 加宽，<100% = 缩窄';
        hint.style.cssText = 'color:#4a7a8a;font-size:11px;margin-top:2px;';
        body.appendChild(hint);

        var btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:8px;margin-top:6px;';

        var cancelBtn = document.createElement('button');
        cancelBtn.textContent = '取消';
        cancelBtn.style.cssText = 'flex:1;background:#1a2a34;border:1px solid #2c4a5a;color:#8899aa;border-radius:8px;padding:8px;cursor:pointer;font-size:13px;';
        cancelBtn.addEventListener('click', function () { overlay.remove(); });
        btnRow.appendChild(cancelBtn);

        var applyBtn = document.createElement('button');
        applyBtn.textContent = '应用';
        applyBtn.style.cssText = 'flex:1;background:#2c6e7e;color:#fff;border:none;border-radius:8px;padding:8px;cursor:pointer;font-size:13px;';
        applyBtn.addEventListener('click', function () {
          var val = parseFloat(input.value);
          if (isNaN(val) || val < 1) {
            input.style.borderColor = '#e44';
            return;
          }
          overlay.remove();
          ed.selection.moveToBookmark(bookmark);
          applyCharSpacing('scale', 'custom_' + val);
        });
        btnRow.appendChild(applyBtn);
        body.appendChild(btnRow);

        dlg.appendChild(body);
        overlay.appendChild(dlg);
        document.body.appendChild(overlay);

        setTimeout(function () { input.focus(); input.select(); }, 50);

        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') {
            applyBtn.click();
          } else if (e.key === 'Escape') {
            overlay.remove();
          }
        });
      }

      function applyCharSpacing(category, action) {
        try {
          var ed = state.tinyEditor;
          if (!ed) return;
          if (category === 'scale') {
            var scaleVal;
            if (action && action.indexOf('custom_') === 0) {
              var pct = parseFloat(action.replace('custom_', ''));
              if (isNaN(pct) || pct <= 0) return;
              scaleVal = pct / 100;
            } else {
              switch (action) {
                case 'p100': scaleVal = 1; break;
                case 'p120': scaleVal = 1.2; break;
                case 'p150': scaleVal = 1.5; break;
                case 'p200': scaleVal = 2; break;
                case 'p80': scaleVal = 0.8; break;
                case 'p60': scaleVal = 0.6; break;
                default: return;
              }
            }
            if (scaleVal === 1) return;
            ed.focus();
            var nativeSel = ed.selection.getSel();
            if (!nativeSel || nativeSel.rangeCount === 0) return;
            var nativeRng = nativeSel.getRangeAt(0);
            if (nativeRng.collapsed) return;
            var fontList = [];
            var walkRoot = nativeRng.commonAncestorContainer.nodeType === 3
              ? nativeRng.commonAncestorContainer.parentNode
              : nativeRng.commonAncestorContainer;
            var walker = document.createTreeWalker(walkRoot, NodeFilter.SHOW_TEXT, null, false);
            var tn;
            while ((tn = walker.nextNode())) {
              if (nativeRng.intersectsNode(tn)) {
                var cs = tn.parentElement.ownerDocument.defaultView.getComputedStyle(tn.parentElement);
                var txt = tn.textContent;
                var s = tn === nativeRng.startContainer ? nativeRng.startOffset : 0;
                var e = tn === nativeRng.endContainer ? nativeRng.endOffset : txt.length;
                for (var i = s; i < e; i++) {
                  if (!/^\s$/.test(txt[i])) {
                    fontList.push({ fontSize: cs.fontSize, fontFamily: cs.fontFamily });
                  }
                }
              }
            }
            var html = ed.selection.getContent({format: 'html'});
            if (!html) return;
            var tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            var allSpans = tempDiv.getElementsByTagName('span');
            for (var si = allSpans.length - 1; si >= 0; si--) {
              if (allSpans[si].style.transform && allSpans[si].style.transform.indexOf('scaleX') !== -1) {
                while (allSpans[si].firstChild) {
                  allSpans[si].parentNode.insertBefore(allSpans[si].firstChild, allSpans[si]);
                }
                allSpans[si].parentNode.removeChild(allSpans[si]);
              }
            }
            var cleanedHtml = tempDiv.innerHTML;
            var bookmark = ed.selection.getBookmark();
            var bodyEl = ed.getBody();
            var measSpan = ed.dom.create('span', {
              style: 'display:inline-block;position:absolute;visibility:hidden;'
            });
            bodyEl.appendChild(measSpan);
            var cache = {};
            var tokens = cleanedHtml.match(/(<[^>]+>)|(&[^;]+;)|(.)/g) || [];
            var charIdx = 0;
            var wrapped = tokens.map(function(token) {
              if (token.charAt(0) === '<' || token.charAt(0) === '&') return token;
              if (/^\s$/.test(token)) return token;
              var info = fontList[charIdx++];
              if (info) {
                var key = token + '|' + info.fontSize + '|' + info.fontFamily;
                var w = cache[key];
                if (w === undefined) {
                  measSpan.style.fontSize = info.fontSize;
                  measSpan.style.fontFamily = info.fontFamily;
                  measSpan.textContent = token;
                  w = measSpan.offsetWidth;
                  cache[key] = w;
                }
                var marginPx = w * (scaleVal - 1);
                return '<span style="display:inline-block;transform:scaleX(' + scaleVal + ');transform-origin:0 50%;margin-right:' + marginPx.toFixed(2) + 'px;">' + token + '</span>';
              }
              return '<span style="display:inline-block;transform:scaleX(' + scaleVal + ');transform-origin:0 50%;">' + token + '</span>';
            }).join('');
            bodyEl.removeChild(measSpan);
            ed.selection.setContent(wrapped);
            ed.selection.moveToBookmark(bookmark);
            return;
          }
          var html = ed.selection.getContent();
          if (!html) return;
          var styleStr = '';
          if (category === 'spacing') {
            switch (action) {
              case 'normal': break;
              case 'wide1': styleStr = 'letter-spacing:1px;'; break;
              case 'wide2': styleStr = 'letter-spacing:2px;'; break;
              case 'wide3': styleStr = 'letter-spacing:3px;'; break;
              case 'tight': styleStr = 'letter-spacing:-0.5px;'; break;
              default: return;
            }
            if (styleStr) {
              _wrapTextNodesInSel(ed, function (parent, before, text) {
                var span = ed.dom.create('span', { 'style': styleStr }, text);
                parent.insertBefore(span, before);
              });
            }
            return;
          }
          if (category === 'position') {
            switch (action) {
              case 'baseline': break;
              case 'super': styleStr = 'vertical-align:super;'; break;
              case 'sub': styleStr = 'vertical-align:sub;'; break;
              case 'up4': styleStr = 'vertical-align:4px;'; break;
              case 'down4': styleStr = 'vertical-align:-4px;'; break;
              default: return;
            }
            if (styleStr) {
              _wrapTextNodesInSel(ed, function (parent, before, text) {
                var span = ed.dom.create('span', { 'style': styleStr }, text);
                parent.insertBefore(span, before);
              });
            }
          }
        } catch (e) {
          console.warn('[TinyMCE] applyCharSpacing:', e);
        }
      }
}