// ============================================================
//  toolbar/toolbar-home-font.js — 开始 → 字体区域
// ============================================================

import { state } from '../../shared-state.js';
import { syncFileLinkMceStyle } from '../../images-files.js';
import { showSavedToast, getCKEditorInstance, isCKEditorActive, rgbToHex, getCurrentTinyFontColor } from '../../utils.js';
import { showTinyUI } from '../code-blocks.js';
import { registerListFeatures } from '../../lists.js';
import { showTinyImageContextMenu } from '../../images-files.js';
import { saveCurrentContentCK } from '../../content-io.js';
import { escapeHtml, saveCurrentProjectData } from '../../../module2_TreeData.js';
import { appState } from '../../../module0_AppState.js';

export function registerFontRegion(editor) {
      let cnFonts = [
        { label: '宋体', family: '\'宋体\', SimSun, serif' },
        { label: '仿宋', family: '\'仿宋\', FangSong, \'FangSong_GB2312\', serif' },
        { label: '黑体', family: '\'黑体\', SimHei, \'Microsoft YaHei\', sans-serif' },
        { label: '楷体', family: '\'楷体\', KaiTi, \'KaiTi_GB2312\', serif' },
        { label: '隶书', family: '\'隶书\', LiSu, \'华文隶书\', serif' },
        { label: '微软雅黑', family: '\'微软雅黑\', \'Microsoft YaHei\', sans-serif' },
        { label: '等线', family: '\'等线\', \'Segoe UI\', \'DengXian\', sans-serif' },
        { label: '幼圆', family: '\'幼圆\', YouYuan, \'Yuanti SC\', sans-serif' },
        { label: '华文仿宋', family: '\'华文仿宋\', STFangsong, serif' },
        { label: '华文行楷', family: '\'华文行楷\', STXingkai, cursive' },
        { label: '华文琥珀', family: '\'华文琥珀\', STHupo, cursive' },
        { label: '华文新魏', family: '\'华文新魏\', STXinwei, serif' },
        { label: '华文细黑', family: '\'华文细黑\', STXihei, \'Microsoft YaHei\', sans-serif' },
        { label: '方正黑体', family: '\'方正黑体\', \'FZHei\', \'FZHei-B01S\', sans-serif' },
        { label: '方正楷体', family: '\'方正楷体\', \'FZKai\', \'FZKai-Z03S\', serif' },
        { label: '方正舒体', family: '\'方正舒体\', \'FZShuTi\', serif' },
        { label: '方正姚体', family: '\'方正姚体\', \'FZYaoTi\', serif' },
        { label: '苹方', family: '\'PingFang SC\', \'苹方\', \'Helvetica Neue\', sans-serif' },
        { label: '思源黑体', family: '\'Source Han Sans\', \'Noto Sans CJK SC\', \'思源黑体\', sans-serif' },
        { label: '思源宋体', family: '\'Source Han Serif\', \'Noto Serif CJK SC\', \'思源宋体\', serif' },
        { label: '微软正黑体', family: '\'微软正黑体\', \'Microsoft JhengHei\', sans-serif' },
        { label: '冬青黑体', family: '\'冬青黑体\', \'Hiragino Sans GB\', \'Hiragino Sans\', sans-serif' }
      ];

      let enFonts = [
        { label: 'Arial', family: 'Arial, sans-serif' },
        { label: 'Times New Roman', family: '\'Times New Roman\', serif' },
        { label: 'Calibri', family: 'Calibri, sans-serif' },
        { label: 'Courier New', family: '\'Courier New\', monospace' },
        { label: 'Georgia', family: 'Georgia, serif' },
        { label: 'Verdana', family: 'Verdana, sans-serif' },
        { label: 'Segoe UI', family: '\'Segoe UI\', sans-serif' },
        { label: 'Comic Sans MS', family: '\'Comic Sans MS\', cursive' }
      ];

      let cnFontNameMap = {};
      cnFonts.forEach(function (f) {
        let parts = f.family.split(',');
        parts.forEach(function (p) {
          let name = p.trim().replace(/['"]/g, '');
          if (name && !/^(serif|sans-serif|monospace|cursive|fantasy)$/i.test(name)) {
            cnFontNameMap[name] = f.label;
            cnFontNameMap[name.toLowerCase()] = f.label;
          }
        });
        cnFontNameMap[f.label] = f.label;
        cnFontNameMap[f.label.toLowerCase()] = f.label;
      });

      let enFontNameMap = {};
      enFonts.forEach(function (f) {
        let name = f.family.split(',')[0].trim().replace(/['"]/g, '');
        enFontNameMap[name] = f.label;
        enFontNameMap[name.toLowerCase()] = f.label;
        enFontNameMap[f.label] = f.label;
        enFontNameMap[f.label.toLowerCase()] = f.label;
      });

      function getActualFontFamily(node) {
        if (!node) return null;
        const style = window.getComputedStyle(node);
        let family = style.fontFamily;
        if (!family) return null;
        family = family.split(',')[0].trim().replace(/['"]/g, '');
        return family;
      }

      function getFontFromTextNode(textNode, isChinese) {
        let node = textNode.parentNode;
        while (node && node.nodeType === 1) {
          if (node.tagName === 'SPAN' && node.style && node.style.fontFamily) {
            return node.style.fontFamily.split(',')[0].trim().replace(/['"]/g, '');
          }
          if (['P','DIV','H1','H2','H3','H4','H5','H6','LI','TD','TH','BLOCKQUOTE','BODY'].includes(node.tagName)) {
            break;
          }
          node = node.parentNode;
        }
        return null;
      }

      function getCurrentFonts(ed) {
        let chFont = null;
        let enFont = null;
        const selection = ed.selection.getSel();
        if (!selection || selection.rangeCount === 0) return { chFont: '中文字体', enFont: '英文字体' };

        const range = selection.getRangeAt(0);
        let container = range.commonAncestorContainer;
        if (container.nodeType === 3) container = container.parentNode;

        const span = container.nodeType === 1 ? container.closest('span[style*="font-family"]') : null;
        if (span) {
          const family = span.style.fontFamily;
          if (family) {
            for (const f of cnFonts) {
              if (family.includes(f.label) || family.includes(f.family.split(',')[0].replace(/['"]/g, ''))) {
                chFont = f.label;
                break;
              }
            }
            for (const f of enFonts) {
              if (family.includes(f.label)) {
                enFont = f.label;
                break;
              }
            }
          }
        }

        if (!chFont || !enFont) {
          const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
            acceptNode: (node) => {
              if (range.intersectsNode(node)) return NodeFilter.FILTER_ACCEPT;
              return NodeFilter.FILTER_SKIP;
            }
          });
          let firstTextNode = walker.nextNode();
          if (!firstTextNode && container.nodeType === 3) firstTextNode = container;
          if (firstTextNode) {
            let rawFont = getFontFromTextNode(firstTextNode, true);
            if (rawFont) {
              if (!chFont) {
                let inCN = cnFonts.some(function (f) {
                  return rawFont.toLowerCase().includes(f.label.toLowerCase()) ||
                    f.family.toLowerCase().includes(rawFont.toLowerCase());
                });
                if (inCN) chFont = rawFont;
              }
              if (!enFont) {
                let inEN = enFonts.some(function (f) {
                  return rawFont.toLowerCase().includes(f.label.toLowerCase()) ||
                    f.family.toLowerCase().includes(rawFont.toLowerCase());
                });
                if (inEN) enFont = rawFont;
              }
            }
          }
        }

        if (!chFont) {
          chFont = '中文字体';
        }
        if (!enFont) {
          enFont = '英文字体';
        }

        if (chFont && chFont !== '中文字体') {
          const matched = cnFonts.find(f =>
            chFont.toLowerCase().includes(f.label.toLowerCase()) ||
            chFont.toLowerCase().includes(f.family.toLowerCase().replace(/['"]/g, ''))
          );
          if (matched) chFont = matched.label;
          else if (cnFontNameMap[chFont]) chFont = cnFontNameMap[chFont];
          else if (cnFontNameMap[chFont.toLowerCase()]) chFont = cnFontNameMap[chFont.toLowerCase()];
        }
        if (enFont && enFont !== '英文字体') {
          const matched = enFonts.find(f => enFont.toLowerCase().includes(f.label.toLowerCase()));
          if (matched) enFont = matched.label;
          else if (enFontNameMap[enFont]) enFont = enFontNameMap[enFont];
          else if (enFontNameMap[enFont.toLowerCase()]) enFont = enFontNameMap[enFont.toLowerCase()];
        }

        return { chFont: chFont || '中文字体', enFont: enFont || '英文字体' };
      }

      let cnFontBtnEl = null;
      let enFontBtnEl = null;

      function updateFontButtonLabels() {
        let result = getCurrentFonts(editor);
        let cap = function (t) { return t.length > 10 ? t.slice(0, 9) + '…' : t; };

        if (cnFontBtnEl) {
          let sl = cnFontBtnEl.querySelector('.tox-mbtn__select-label, .tox-tbtn__select-label');
          if (sl) sl.textContent = cap(result.chFont);
        }
        if (enFontBtnEl) {
          let sl = enFontBtnEl.querySelector('.tox-mbtn__select-label, .tox-tbtn__select-label');
          if (sl) sl.textContent = cap(result.enFont);
        }
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

      try {
        editor.ui.registry.addMenuButton('cnfontfamily', {
          text: '中文',
          tooltip: '中文字体（仅对汉字生效）',
          fetch: function (callback) {
            let items = [];
            items.push({
              type: 'menuitem', text: '清除', onAction: function () {
                removeFontByRegex(editor, '[\\u4e00-\\u9fff\\u3400-\\u4dbf]+');
              }
            });
            cnFonts.forEach(function (f) {
              items.push({
                type: 'menuitem', text: f.label, onAction: function () {
                  applyFontByRegex(editor, f.family, '[\\u4e00-\\u9fff\\u3400-\\u4dbf]+');
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
            let items = [];
            items.push({
              type: 'menuitem', text: '清除', onAction: function () {
                removeFontByRegex(editor, '[A-Za-z0-9]+');
              }
            });
            enFonts.forEach(function (f) {
              items.push({
                type: 'menuitem', text: f.label, onAction: function () {
                  applyFontByRegex(editor, f.family, '[A-Za-z0-9]+');
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

      try {
        let chbStyle = 'border: 0.5px solid currentColor; padding: 3px 6px;';
        editor.addCommand('mceCharBorder', function () {
          let rng = editor.selection.getRng();

          let _syncLiBorder = function () {
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
                let hasBorder = li.querySelector('span.charborder');
                if (hasBorder) {
                  li.style.setProperty('--mkr-border', chbStyle);
                } else {
                  li.style.removeProperty('--mkr-border');
                }
              });
            } catch (e3) {}
          };

          editor.undoManager.transact(function () {
            let spanWalker = document.createTreeWalker(
              editor.getBody(),
              NodeFilter.SHOW_ELEMENT,
              {
                acceptNode: function (el) {
                  if (el.nodeName === 'SPAN' && el.classList && el.classList.contains('charborder') && rng.intersectsNode(el)) {
                    return NodeFilter.FILTER_ACCEPT;
                  }
                  return NodeFilter.FILTER_SKIP;
                }
              }
            );

            let spansToRemove = [];
            let sp;
            while ((sp = spanWalker.nextNode())) {
              spansToRemove.push(sp);
            }

            if (rng.collapsed && spansToRemove.length === 0) {
              let node = editor.selection.getNode();
              let wrapper = editor.dom.getParent(node, 'span.charborder');
              if (wrapper) spansToRemove.push(wrapper);
            }

            if (spansToRemove.length > 0) {
              let hasPartial = false;
              for (let si = 0; si < spansToRemove.length; si++) {
                const sp = spansToRemove[si];
                const fullText = sp.textContent || '';
                if (fullText && editor.selection.getContent({ format: 'text' }).length < fullText.length) {
                  hasPartial = true;
                  break;
                }
              }
              if (hasPartial) {
                const html = editor.selection.getContent();
                editor.selection.setContent(html);
                _syncLiBorder();
                return;
              }
              spansToRemove.forEach(function (sp) {
                let parent = sp.parentNode;
                while (sp.firstChild) {
                  parent.insertBefore(sp.firstChild, sp);
                }
                parent.removeChild(sp);
              });
              _syncLiBorder();
              return;
            }

            if (rng.collapsed) return;

            let _trackSpan = function (node) {
              if (!node) return;
              if (!firstSpan || (node.compareDocumentPosition(firstSpan) & Node.DOCUMENT_POSITION_FOLLOWING)) {
                firstSpan = node;
              }
              if (!lastSpan || (lastSpan.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING)) {
                lastSpan = node;
              }
            };

            let firstSpan = null;
            let lastSpan = null;

            let rubyWalker = document.createTreeWalker(
              editor.getBody(),
              NodeFilter.SHOW_ELEMENT,
              {
                acceptNode: function (el) {
                  if (el.nodeName !== 'RUBY') return NodeFilter.FILTER_SKIP;
                  if (!rng.intersectsNode(el)) return NodeFilter.FILTER_SKIP;
                  let p = el.parentNode;
                  while (p && p !== editor.getBody()) {
                    if (p.classList && p.classList.contains('charborder')) return NodeFilter.FILTER_SKIP;
                    p = p.parentNode;
                  }
                  return NodeFilter.FILTER_ACCEPT;
                }
              }
            );

            let rubyElements = [];
            let ru;
            while ((ru = rubyWalker.nextNode())) {
              if (rubyElements.indexOf(ru) === -1) rubyElements.push(ru);
            }

            let charborderWrappers = [];

            if (rubyElements.length > 0) {
              rubyElements.sort(function (a, b) {
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
              let curGroup = [rubyElements[0]];
              for (let ri = 1; ri < rubyElements.length; ri++) {
                if (_isConsecutiveRuby(rubyElements[ri - 1], rubyElements[ri])) {
                  curGroup.push(rubyElements[ri]);
                } else {
                  rubyGroups.push(curGroup);
                  curGroup = [rubyElements[ri]];
                }
              }
              rubyGroups.push(curGroup);

              rubyGroups.forEach(function (group) {
                let sp = editor.dom.create('span', { 'class': 'charborder', style: chbStyle });
                let firstRuby = group[0];
                let lastRuby = group[group.length - 1];
                firstRuby.parentNode.insertBefore(sp, firstRuby);
                let mov = firstRuby;
                while (mov) {
                  let nxt = mov.nextSibling;
                  sp.appendChild(mov);
                  if (mov === lastRuby) break;
                  mov = nxt;
                }
                charborderWrappers.push(sp);
                _trackSpan(sp);
              });
            }

            let textWalker = document.createTreeWalker(
              editor.getBody(),
              NodeFilter.SHOW_TEXT,
              {
                acceptNode: function (tn) {
                  if (!rng.intersectsNode(tn)) return NodeFilter.FILTER_SKIP;
                  if (tn.textContent.trim().length === 0) return NodeFilter.FILTER_SKIP;
                  let p = tn.parentNode;
                  if (p && (p.nodeName === 'RUBY' || p.nodeName === 'RT')) return NodeFilter.FILTER_SKIP;
                  while (p && p !== editor.getBody()) {
                    if (charborderWrappers.indexOf(p) !== -1) return NodeFilter.FILTER_SKIP;
                    if (p.classList && p.classList.contains('charborder')) return NodeFilter.FILTER_SKIP;
                    p = p.parentNode;
                  }
                  return NodeFilter.FILTER_ACCEPT;
                }
              }
            );

            let textEntries = [];
            let tn;
            while ((tn = textWalker.nextNode())) {
              let startOff = 0;
              let endOff = tn.textContent.length;
              if (tn === rng.startContainer) startOff = rng.startOffset;
              if (tn === rng.endContainer) endOff = rng.endOffset;
              if (startOff < endOff) {
                textEntries.push({ node: tn, start: startOff, end: endOff });
              }
            }

            textEntries.forEach(function (entry, idx) {
              let tn = entry.node;
              let start = entry.start;
              let end = entry.end;

              if (end < tn.textContent.length) {
                tn.splitText(end);
              }
              let selectedNode = start > 0 ? tn.splitText(start) : tn;

              let sp = editor.dom.create('span', { 'class': 'charborder', style: chbStyle });
              selectedNode.parentNode.insertBefore(sp, selectedNode);
              sp.appendChild(selectedNode);

              _trackSpan(sp);
            });

            (function _mergeAdjacentCharborders() {
              const _blockTags = { P:1, DIV:1, LI:1, UL:1, OL:1, H1:1, H2:1, H3:1, H4:1, H5:1, H6:1, BLOCKQUOTE:1, TABLE:1, TR:1, TD:1, TH:1, THEAD:1, TBODY:1, TFOOT:1, SECTION:1, ARTICLE:1, HEADER:1, FOOTER:1, NAV:1, ASIDE:1, MAIN:1, FIGURE:1, FIGCAPTION:1, PRE:1, HR:1, FORM:1, FIELDSET:1, ADDRESS:1, DL:1, DT:1, DD:1 };
              const _skipTags = { IMG:1, VIDEO:1, AUDIO:1, IFRAME:1, OBJECT:1, EMBED:1, INPUT:1, BUTTON:1, SELECT:1, TEXTAREA:1, CANVAS:1, SVG:1, RUBY:1, RT:1, RP:1 };

              function _canAbsorb(el) {
                if (el.nodeType !== 1) return false;
                if (_blockTags[el.nodeName]) return false;
                if (_skipTags[el.nodeName]) return false;
                if (el.classList && el.classList.contains('charborder')) return false;
                if (el.querySelector && el.querySelector('span.charborder')) return false;
                return true;
              }

              let allBorders = editor.getBody().querySelectorAll('span.charborder');
              let mergedSet = new Set();
              for (let bi = 0; bi < allBorders.length; bi++) {
                let sp = allBorders[bi];
                if (mergedSet.has(sp)) continue;
let next = sp.nextSibling;
                while (next) {
                  if (next.nodeType === 3) {
                    if (next.textContent.trim() === '') { next = next.nextSibling; continue; }
                    break;
                  }
                  if (next.nodeType === 1 && (next.nodeName === 'BR' || next.nodeName === 'WBR')) {
                    sp.appendChild(next);
                    next = next.nextSibling;
                    continue;
                  }
                  if (next.nodeType === 1 && next.classList && next.classList.contains('charborder')) {
                    while (next.firstChild) {
                      sp.appendChild(next.firstChild);
                    }
                    let rm = next;
                    next = next.nextSibling;
                    if (rm.parentNode) rm.parentNode.removeChild(rm);
                    mergedSet.add(rm);
                    if (firstSpan === rm) firstSpan = sp;
                    if (lastSpan === rm) lastSpan = sp;
                  } else if (_canAbsorb(next)) {
                    sp.appendChild(next);
                    next = sp.nextSibling;
                  } else if (next.nodeType === 1 && next.querySelector('span.charborder')) {
                    // 吸收包含字符边框的内联元素（如 strong/sup/sub 等），
                    // 同时展开其中的内层字符边框，避免嵌套/分段
                    let innerBorders = next.querySelectorAll('span.charborder');
                    for (let ib = innerBorders.length - 1; ib >= 0; ib--) {
                      let innerSpan = innerBorders[ib];
                      if (firstSpan === innerSpan) firstSpan = sp;
                      if (lastSpan === innerSpan) lastSpan = sp;
                      while (innerSpan.firstChild) {
                        innerSpan.parentNode.insertBefore(innerSpan.firstChild, innerSpan);
                      }
                      innerSpan.parentNode.removeChild(innerSpan);
                    }
                    sp.appendChild(next);
                    next = sp.nextSibling;
                  } else {
                    break;
                  }
                }
              }
            })();

            if (firstSpan) {
              let restoredRng = document.createRange();
              restoredRng.setStartBefore(firstSpan);
              restoredRng.setEndAfter(lastSpan);
              editor.selection.setRng(restoredRng);
            }

            _syncLiBorder();
          });
        });
      } catch (e) {
        console.error('[TinyMCE] mceCharBorder 命令注册失败:', e);
      }

      try {
        editor.ui.registry.addToggleButton('charborder', {
          text: '□',
          tooltip: '字符边框',
          onAction: function (api) {
            let wasActive = api.isActive();
            editor.execCommand('mceCharBorder', false);
            api.setActive(!wasActive);
          },
          onSetup: function (api) {
            function updateState() {
              let node = editor.selection.getNode();
              let hasBorder = editor.dom.getParent(node, 'span.charborder');
              api.setActive(!!hasBorder);
            }
            updateState();
            editor.on('NodeChange', updateState);
            return function () {
              editor.off('NodeChange', updateState);
            };
          }
        });
      } catch (e) {
        console.error('[TinyMCE] charborder 按钮注册失败:', e);
      }

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
            editor.execCommand('mceFontSizeUp');
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
            editor.execCommand('mceFontSizeDown');
          }
        });
      } catch (e) {
        console.error('[TinyMCE] fontminus 按钮注册失败:', e);
      }

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

      try {
        editor.ui.registry.addMenuButton('changecase', {
          text: 'Aa',
          tooltip: '更改大小写',
          fetch: function (callback) {
            let items = [
              { type: 'menuitem', text: '全部小写', onAction: function () { changeCase('lower'); } },
              { type: 'menuitem', text: '全部大写', onAction: function () { changeCase('upper'); } },
              { type: 'menuitem', text: '每个单词首字母大写', onAction: function () { changeCase('word'); } },
              { type: 'menuitem', text: '句首字母大写', onAction: function () { changeCase('sentence'); } }
            ];
            callback(items);
          }
        });
      } catch (e) {
        console.error('[TinyMCE] changecase 按钮注册失败:', e);
      }

      function convertToTraditional() {
        let editor = state.tinyEditor;
        if (!editor) return;
        if (typeof OpenCC === 'undefined' || !OpenCC.Converter) {
          editor.notificationManager.open({ text: '简繁转换库加载失败，请刷新页面后重试', type: 'error' });
          return;
        }

        let rng = editor.selection.getRng();
        if (rng.collapsed) return;

        let s2t = OpenCC.Converter({ from: 'cn', to: 'tw' });
        let bookmark = editor.selection.getBookmark(2);

        editor.undoManager.transact(function () {
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

        try { editor.selection.moveToBookmark(bookmark); } catch (e) {}
      }

      function convertToSimplified() {
        let editor = state.tinyEditor;
        if (!editor) return;
        if (typeof OpenCC === 'undefined' || !OpenCC.Converter) {
          editor.notificationManager.open({ text: '简繁转换库加载失败，请刷新页面后重试', type: 'error' });
          return;
        }

        let rng = editor.selection.getRng();
        if (rng.collapsed) return;

        let t2s = OpenCC.Converter({ from: 'tw', to: 'cn' });
        let bookmark = editor.selection.getBookmark(2);

        editor.undoManager.transact(function () {
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

        try { editor.selection.moveToBookmark(bookmark); } catch (e) {}
      }

      try {
        editor.ui.registry.addButton('jian2fan', {
          text: '繁',
          tooltip: '转为繁体',
          onAction: convertToTraditional
        });
      } catch (e) {
        console.error('[TinyMCE] jian2fan 按钮注册失败:', e);
      }

      try {
        editor.ui.registry.addButton('fan2jian', {
          text: '简',
          tooltip: '转为简体',
          onAction: convertToSimplified
        });
      } catch (e) {
        console.error('[TinyMCE] fan2jian 按钮注册失败:', e);
      }

      function changeCase(mode) {
        let editor = state.tinyEditor;
        let selectedText = editor.selection.getContent({ format: 'text' });
        if (!selectedText) return;
        let doc = editor.getDoc();
        let sel = editor.selection.getSel();
        if (!sel || sel.rangeCount === 0) return;
        let range = sel.getRangeAt(0);
        // 遍历选区内的所有文本节点，保留 HTML 标签
        let iter = doc.createNodeIterator(
          range.commonAncestorContainer,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode: function (node) {
              try {
                if (range.intersectsNode(node)) return NodeFilter.FILTER_ACCEPT;
              } catch (e) {}
              return NodeFilter.FILTER_REJECT;
            }
          },
          false
        );
        let node;
        while ((node = iter.nextNode())) {
          let text = node.textContent || '';
          let startOff = (node === range.startContainer) ? range.startOffset : 0;
          let endOff = (node === range.endContainer) ? range.endOffset : text.length;
          if (startOff >= endOff) continue;
          let before = text.substring(0, startOff);
          let target = text.substring(startOff, endOff);
          let after = text.substring(endOff);
          let converted;
          switch (mode) {
            case 'lower': converted = target.toLowerCase(); break;
            case 'upper': converted = target.toUpperCase(); break;
            case 'word': converted = target.replace(/\b\w/g, function (m) { return m.toUpperCase(); }); break;
            case 'sentence':
              converted = target.replace(/(^|[.?!]\s*)(\w)/g, function (m) { return m.toUpperCase(); });
              break;
          }
          if (converted !== target) {
            node.textContent = before + converted + after;
          }
        }
      }

      function addPinyin() {
        let editor = state.tinyEditor;
        if (!editor) return;
        if (!window.pinyinPro || !window.pinyinPro.pinyin) {
          editor.notificationManager.open({ text: '拼音库加载失败，请刷新页面后重试', type: 'error' });
          return;
        }

let rng = editor.selection.getRng();
        if (rng.collapsed) return;

        function _buildRubyFrag(text) {
          let fragment = document.createDocumentFragment();
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
                fragment.appendChild(ruby);
              }
            } else {
              let nonStart = i;
              while (i < text.length && !/[\u4e00-\u9fff]/.test(text[i])) i++;
              fragment.appendChild(document.createTextNode(text.substring(nonStart, i)));
            }
          }
          return fragment;
        }

        let hasRuby = false;
        let body = editor.getBody();
        let checkIter = document.createNodeIterator(
          body,
          NodeFilter.SHOW_TEXT,
          { acceptNode: function (n) {
            try { return rng.intersectsNode(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT; }
            catch (e) { return NodeFilter.FILTER_REJECT; }
          }},
          false
        );
        let cn;
        while ((cn = checkIter.nextNode())) {
          if (cn.parentNode.nodeName === 'RUBY') { hasRuby = true; break; }
        }

if (hasRuby) {
          editor.undoManager.transact(function () {
            let rubyEls = [];
            let re = document.createNodeIterator(
              body,
              NodeFilter.SHOW_ELEMENT,
              { acceptNode: function (el) {
                try { return el.nodeName === 'RUBY' && rng.intersectsNode(el) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT; }
                catch (e) { return NodeFilter.FILTER_REJECT; }
              }},
              false
            );
            let rb;
            while ((rb = re.nextNode())) { if (rubyEls.indexOf(rb) === -1) rubyEls.push(rb); }

            let firstNew = null;
            let lastNew = null;

            rubyEls.forEach(function (rb) {
              let text = '';
              for (let c = rb.firstChild; c; c = c.nextSibling) {
                if (c.nodeType === 3 || (c.nodeType === 1 && c.nodeName !== 'RT')) {
                  text += c.textContent || '';
                }
              }
              let parent = rb.parentNode;
              if (parent) {
                let textNode = document.createTextNode(text);
                parent.replaceChild(textNode, rb);
                if (!firstNew) firstNew = textNode;
                lastNew = textNode;
              }
            });

            if (firstNew && lastNew) {
              try {
                let restoredRng = document.createRange();
                restoredRng.setStart(firstNew, 0);
                restoredRng.setEnd(lastNew, lastNew.textContent.length);
                editor.selection.setRng(restoredRng);
              } catch (e) {}
            }
          });
          return;
        }

editor.undoManager.transact(function () {
          _wrapTextNodesInSel(editor, function (parent, before, text) {
            let frag = _buildRubyFrag(text);
            parent.insertBefore(frag, before);
          });
        });
      }

      try {
        editor.ui.registry.addButton('pinyin', {
          text: '拼',
          tooltip: '汉字注音',
          onAction: addPinyin
        });
      } catch (e) {
        console.error('[TinyMCE] pinyin 按钮注册失败:', e);
      }

      try {
        editor.ui.registry.addToggleButton('customemphasis', {
          text: '\u25CF',
          tooltip: '着重号',
          onAction: function () {
            let ed = state.tinyEditor;
            if (!ed) return;
            if (ed.selection.isCollapsed()) return;

            ed.undoManager.transact(function () {
              let rng = ed.selection.getRng();
              let doc = ed.getDoc();

              // ── 收集选区内所有文本节点 ──
              // commonAncestorContainer 可能是文本节点本身（当选区在同一段文字内时），
              // 文本节点没有子节点，TreeWalker 会直接返回空 → 改用父元素
              let walkRoot = rng.commonAncestorContainer;
              if (walkRoot.nodeType === Node.TEXT_NODE) walkRoot = walkRoot.parentNode;
              let textNodes = [];
              let tw = doc.createTreeWalker(
                walkRoot,
                NodeFilter.SHOW_TEXT,
                { acceptNode: function (tn) {
                  try { return rng.intersectsNode(tn) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT; }
                  catch (e) { return NodeFilter.FILTER_REJECT; }
                }}
              );
              let tn;
              while ((tn = tw.nextNode())) textNodes.push(tn);
              if (textNodes.length === 0) return;

              // 保存原始选区边界（文本节点 + 偏移），随后 DOM 修改后用于重建 Range
              let origSC = rng.startContainer, origSO = rng.startOffset;
              let origEC = rng.endContainer, origEO = rng.endOffset;
              let firstText = textNodes[0];
              let lastText = textNodes[textNodes.length - 1];

              // ── 判断是否「全部已着重」→ 决定 toggle 方向 ──
              let allEmphasized = true;
              for (let k = 0; k < textNodes.length; k++) {
                if (!ed.dom.getParent(textNodes[k], 'span[data-emphasis]')) {
                  allEmphasized = false;
                  break;
                }
              }

              // ═══════════════════════════════════════════
              //  公共：构建有效 Range 的辅助函数
              // ═══════════════════════════════════════════
              function _buildRange(firstNode, firstOff, lastNode, lastOff) {
                let nr = doc.createRange();
                try {
                  nr.setStart(firstNode, Math.min(firstOff, firstNode.nodeType === 3 ? firstNode.length : 0));
                  nr.setEnd(lastNode, Math.min(lastOff, lastNode.nodeType === 3 ? lastNode.length : 0));
                } catch (e) { return null; }
                return nr;
              }

              if (allEmphasized) {
                // ═══ 移除着重号 ═══
                // 保存边界：unWrap 后文本节点仍存在，只是换了 parent
                let firstOff = (firstText === origSC) ? origSO : 0;
                let lastOff  = (lastText === origEC) ? origEO : lastText.length;

                let emphasisSpans = [];
                let walker = doc.createTreeWalker(
                  ed.getBody(), NodeFilter.SHOW_ELEMENT,
                  { acceptNode: function (el) {
                    if (el.nodeName !== 'SPAN' || !el.hasAttribute('data-emphasis')) return NodeFilter.FILTER_SKIP;
                    try { return rng.intersectsNode(el) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP; }
                    catch (e) { return NodeFilter.FILTER_SKIP; }
                  }}
                );
                let e;
                while ((e = walker.nextNode())) emphasisSpans.push(e);
                for (let i = emphasisSpans.length - 1; i >= 0; i--) {
                  let el = emphasisSpans[i];
                  let parent = el.parentNode;
                  if (!parent) continue;
                  while (el.firstChild) parent.insertBefore(el.firstChild, el);
                  parent.removeChild(el);
                }

                // 用原始文本节点引用重建 Range（文本节点只被移动，未被销毁）
                let restoredRng = _buildRange(firstText, firstOff, lastText, lastOff);
                if (restoredRng) {
                  ed.selection.setRng(restoredRng);
                } else {
                  ed.focus();
                }
              } else {
                // ═══ 添加着重号 ═══
                let node = ed.selection.getNode();
                let gradSpan = ed.dom.getParent(node, 'span.gradient-text');
                let emphasisColorExtra = '';
                if (gradSpan) {
                  let bgImage = gradSpan.style.backgroundImage || '';
                  let match = bgImage.match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)/);
                  if (match) {
                    emphasisColorExtra = 'text-emphasis-color:' + match[0] + ';-webkit-text-emphasis-color:' + match[0] + ';';
                  }
                }
                let styleStr = 'text-emphasis:dot;-webkit-text-emphasis:dot;text-emphasis-position:under;-webkit-text-emphasis-position:under;' + emphasisColorExtra;

                // 先清除选区内已有的着重号 span，避免嵌套
                let oldSpans = [];
                let ws = doc.createTreeWalker(
                  ed.getBody(), NodeFilter.SHOW_ELEMENT,
                  { acceptNode: function (el) {
                    if (el.nodeName !== 'SPAN' || !el.hasAttribute('data-emphasis')) return NodeFilter.FILTER_SKIP;
                    try { return rng.intersectsNode(el) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP; }
                    catch (e) { return NodeFilter.FILTER_SKIP; }
                  }}
                );
                let oe;
                while ((oe = ws.nextNode())) oldSpans.push(oe);
                for (let s = oldSpans.length - 1; s >= 0; s--) {
                  let p = oldSpans[s].parentNode;
                  if (!p) continue;
                  while (oldSpans[s].firstChild) p.insertBefore(oldSpans[s].firstChild, oldSpans[s]);
                  p.removeChild(oldSpans[s]);
                }

                // 用原始边界重建临时 Range 来收集文本节点（不用 ed.selection.getRng()，它在 DOM 变动后已偏移）
                let tempRng = _buildRange(origSC, origSO, origEC, origEO);
                if (!tempRng) { ed.focus(); return; }

                textNodes = [];
                let walkRoot2 = tempRng.commonAncestorContainer;
                if (walkRoot2.nodeType === Node.TEXT_NODE) walkRoot2 = walkRoot2.parentNode;
                let tw2 = doc.createTreeWalker(
                  walkRoot2,
                  NodeFilter.SHOW_TEXT,
                  { acceptNode: function (tn2) {
                    try { return tempRng.intersectsNode(tn2) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT; }
                    catch (e) { return NodeFilter.FILTER_REJECT; }
                  }}
                );
                while ((tn = tw2.nextNode())) textNodes.push(tn);
                if (textNodes.length === 0) { ed.focus(); return; }

                let modifiedSpans = [];

                // 从后往前逐文本节点包裹
                for (let i = textNodes.length - 1; i >= 0; i--) {
                  let textNode = textNodes[i];
                  let startOff = (textNode === origSC) ? origSO : 0;
                  let endOff = (textNode === origEC) ? origEO : textNode.length;
                  if (startOff >= endOff) continue;

                  if (startOff === 0 && endOff === textNode.length) {
                    let span = doc.createElement('span');
                    span.setAttribute('data-emphasis', '1');
                    span.style.cssText = styleStr;
                    textNode.parentNode.insertBefore(span, textNode);
                    span.appendChild(textNode);
                    modifiedSpans.push(span);
                  } else {
                    textNode.splitText(startOff);
                    let middle = textNode.nextSibling;
                    middle.splitText(endOff - startOff);
                    let span = doc.createElement('span');
                    span.setAttribute('data-emphasis', '1');
                    span.style.cssText = styleStr;
                    middle.parentNode.insertBefore(span, middle);
                    span.appendChild(middle);
                    modifiedSpans.push(span);
                  }
                }

                // 用新创建 span 重建选区
                modifiedSpans.reverse(); // 从后往前收集的，反转成文档顺序
                if (modifiedSpans.length > 0) {
                  let firstSpan = modifiedSpans[0];
                  let lastSpan = modifiedSpans[modifiedSpans.length - 1];
                  let fn = firstSpan.firstChild || firstSpan;
                  let ln = lastSpan.lastChild || lastSpan;
                  let newRng = _buildRange(fn, 0, ln, ln.nodeType === 3 ? ln.length : 0);
                  if (newRng) ed.selection.setRng(newRng);
                  else ed.focus();
                } else {
                  ed.focus();
                }
              }
            });
          },
          onSetup: function (api) {
            function update() {
              const node = editor.selection.getNode();
              api.setActive(!!editor.dom.getParent(node, 'span[data-emphasis]'));
            }
            editor.on('NodeChange', update);
            return function () { editor.off('NodeChange', update); };
          }
        });
      } catch (e) {
        console.error('[TinyMCE] customemphasis 注册失败:', e);
      }

      try {
        let underlineStyles = ['solid', 'double', 'dashed', 'dotted', 'wavy'];
        let underlineLabels = {
          solid: '实线下划线',
          double: '双下划线',
          dashed: '虚线下划线',
          dotted: '点线下划线',
          wavy: '波浪下划线'
        };

        function _nativeUnwrap(el) {
          let parent = el.parentNode;
          if (!parent) return;
          while (el.firstChild) {
            parent.insertBefore(el.firstChild, el);
          }
          parent.removeChild(el);
        }

        function toggleUnderlineStyle(style) {
          let ed = state.tinyEditor;
          if (!ed) return;

          function _hasUnderline(el) {
            if (el.nodeName === 'U') return true;
            let deco = ed.dom.getStyle(el, 'text-decoration') || el.style.textDecoration || '';
            return /\bunderline\b/.test(deco);
          }
          function _getUnderlineStyle(el) {
            let inline = el.style.textDecoration || '';
            if (!inline) return '';
            let parts = inline.split(/\s+/);
            for (let i = 0; i < parts.length; i++) {
              if (/^(solid|double|dashed|dotted|wavy)$/.test(parts[i])) return parts[i];
            }
            return '';
          }

          function _scanUnderlineEls(range) {
            let walker = document.createTreeWalker(
              ed.getBody(),
              NodeFilter.SHOW_ELEMENT,
              {
                acceptNode: function(el) {
                  if (el.nodeName !== 'SPAN' && el.nodeName !== 'U') return NodeFilter.FILTER_SKIP;
                  if (!_hasUnderline(el)) return NodeFilter.FILTER_SKIP;
                  try { if (range.intersectsNode(el)) return NodeFilter.FILTER_ACCEPT; } catch (e) {}
                  return NodeFilter.FILTER_SKIP;
                }
              },
              false
            );
            let result = [];
            let e;
            while ((e = walker.nextNode())) { result.push(e); }
            return result;
          }

          ed.undoManager.transact(function () {
            let rng = ed.selection.getRng();

            if (rng.collapsed) {
              let node = ed.selection.getNode();
              let cur = node;
              while (cur && cur.nodeType !== 9 && cur !== ed.getBody() && cur.parentNode) {
                if (cur.nodeName === 'SPAN' || cur.nodeName === 'U') {
                  if (_hasUnderline(cur)) {
                    let cs = _getUnderlineStyle(cur);
                    if (cs === style) {
                      _nativeUnwrap(cur);
                    } else {
                      let pc = ed.dom.getStyle(cur, 'text-decoration-color');
                      ed.dom.setStyle(cur, 'text-decoration', 'underline ' + style);
                      if (pc && pc !== 'currentColor') { ed.dom.setStyle(cur, 'text-decoration-color', pc); }
                    }
                    break;
                  }
                }
                cur = cur.parentNode;
              }
              return;
            }

            let underlineEls = _scanUnderlineEls(rng);

            if (underlineEls.length === 0) {
              let savedRng0 = rng.cloneRange();
              ed.execCommand('underline');
              let newEls0 = _scanUnderlineEls(savedRng0);
              for (let a = 0; a < newEls0.length; a++) {
                ed.dom.setStyle(newEls0[a], 'text-decoration', 'underline ' + style);
              }
              setTimeout(function () {
                let n = ed.selection.getNode();
                let ln = ed.dom.getParent(n, 'li');
                if (ln) {
                  let cd = ln.style.getPropertyValue('--mkr-text-deco') || '';
                  let p = cd.split(/\s+/).filter(Boolean);
                  if (p.indexOf('underline') === -1) p.push('underline');
                  ln.style.setProperty('--mkr-text-deco', p.length > 0 ? p.join(' ') : null);
                }
              }, 10);
              return;
            }

            let allSame = true;
            for (let u = 0; u < underlineEls.length; u++) {
              if (_getUnderlineStyle(underlineEls[u]) !== style) { allSame = false; break; }
            }

            if (allSame) {
              for (let r = underlineEls.length - 1; r >= 0; r--) {
                if (underlineEls[r].parentNode) _nativeUnwrap(underlineEls[r]);
              }
              ed.focus();
              setTimeout(function () {
                let n = ed.selection.getNode();
                let ln = ed.dom.getParent(n, 'li');
                if (ln) {
                  let cd = ln.style.getPropertyValue('--mkr-text-deco') || '';
                  let p = cd.split(/\s+/).filter(Boolean);
                  p = p.filter(function (x) { return x !== 'underline'; });
                  ln.style.setProperty('--mkr-text-deco', p.length > 0 ? p.join(' ') : null);
                }
              }, 10);
              return;
            }

            // 直接修改已有下划线元素的样式，避免 unWrap + execCommand 重建
            // 导致 DOM 变更后选区偏移，第一行下划线丢失
            for (let i = 0; i < underlineEls.length; i++) {
              let el = underlineEls[i];
              let pc = ed.dom.getStyle(el, 'text-decoration-color');
              ed.dom.setStyle(el, 'text-decoration', 'underline ' + style);
              if (pc && pc !== 'currentColor') {
                ed.dom.setStyle(el, 'text-decoration-color', pc);
              }
            }

            ed.focus();
            setTimeout(function () {
              let n = ed.selection.getNode();
              let ln = ed.dom.getParent(n, 'li');
              if (ln) {
                let cd = ln.style.getPropertyValue('--mkr-text-deco') || '';
                let p = cd.split(/\s+/).filter(Boolean);
                if (p.indexOf('underline') === -1) p.push('underline');
                ln.style.setProperty('--mkr-text-deco', p.length > 0 ? p.join(' ') : null);
              }
            }, 10);
          });

        }

        function applyUnderlineColor(color) {
          let ed = state.tinyEditor;
          if (!ed) return;

          function _hasUnderline(el) {
            if (el.nodeName === 'U') return true;
            let deco = ed.dom.getStyle(el, 'text-decoration') || el.style.textDecoration || '';
            return /\bunderline\b/.test(deco);
          }

          function _scanUnderlineEls(range) {
            let walker = document.createTreeWalker(
              ed.getBody(),
              NodeFilter.SHOW_ELEMENT,
              {
                acceptNode: function(el) {
                  if (el.nodeName !== 'SPAN' && el.nodeName !== 'U') return NodeFilter.FILTER_SKIP;
                  if (!_hasUnderline(el)) return NodeFilter.FILTER_SKIP;
                  try { if (range.intersectsNode(el)) return NodeFilter.FILTER_ACCEPT; } catch (e) {}
                  return NodeFilter.FILTER_SKIP;
                }
              },
              false
            );
            let result = [];
            let e;
            while ((e = walker.nextNode())) { result.push(e); }
            return result;
          }

          ed.undoManager.transact(function () {
            let rng = ed.selection.getRng();
            let underlineEls = _scanUnderlineEls(rng);

            if (underlineEls.length > 0) {
              for (let i = 0; i < underlineEls.length; i++) {
                if (color) {
                  ed.dom.setStyle(underlineEls[i], 'text-decoration-color', color);
                } else {
                  underlineEls[i].style.removeProperty('text-decoration-color');
                }
              }
            } else if (color) {
              ed.execCommand('underline');
              let afterRng = ed.selection.getRng();
              let newEls = _scanUnderlineEls(afterRng);
              for (let j = 0; j < newEls.length; j++) {
                ed.dom.setStyle(newEls[j], 'text-decoration-color', color);
              }
            }

            setTimeout(function () {
              let n = ed.selection.getNode();
              let ln = ed.dom.getParent(n, 'li');
              if (ln) {
                let cd = ln.style.getPropertyValue('--mkr-text-deco') || '';
                let p = cd.split(/\s+/).filter(Boolean);
                if (color) {
                  if (p.indexOf('underline') === -1) p.push('underline');
                }
                ln.style.setProperty('--mkr-text-deco', p.length > 0 ? p.join(' ') : null);
              }
            }, 10);
          });
        }

        function showUnderlineColorPanel(anchorEl) {
          let existingPanel = document.getElementById('underlineColorPanel');
          if (existingPanel) { existingPanel.remove(); return; }

          let panel = document.createElement('div');
          panel.id = 'underlineColorPanel';
          panel.style.cssText = 'position:fixed;z-index:10002;background:#0d1f2b;border:1px solid #2c6e7e;border-radius:12px;padding:10px;box-shadow:0 4px 20px rgba(0,0,0,0.7);min-width:220px;';

          let titleRow = document.createElement('div');
          titleRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;';
          let label = document.createElement('span');
          label.textContent = '下划线颜色';
          label.style.cssText = 'color:#8899aa;font-size:11px;';
          titleRow.appendChild(label);
          panel.appendChild(titleRow);

          let grid = document.createElement('div');
          grid.style.cssText = 'display:grid;grid-template-columns:repeat(10,20px);gap:2px;margin-bottom:8px;';
          solidColors.forEach(function (color) {
            let swatch = document.createElement('div');
            swatch.style.cssText = 'width:20px;height:20px;background:' + color + ';border-radius:3px;cursor:pointer;border:1px solid #444;box-sizing:border-box;';
            swatch.addEventListener('mousedown', function (e) {
              e.preventDefault();
              applyUnderlineColor(color);
              panel.remove();
            });
            swatch.addEventListener('mouseenter', function () { swatch.style.border = '2px solid #fff'; });
            swatch.addEventListener('mouseleave', function () { swatch.style.border = '1px solid #444'; });
            grid.appendChild(swatch);
          });
          panel.appendChild(grid);

          let defaultBtn = document.createElement('div');
          defaultBtn.textContent = '↩ 跟随字体颜色';
          defaultBtn.style.cssText = 'background:#1a3a44;border:1px solid #2c6e7e;color:#ccd;cursor:pointer;border-radius:5px;padding:5px 8px;font-size:12px;text-align:center;margin-bottom:6px;';
          defaultBtn.addEventListener('mousedown', function (e) {
            e.preventDefault();
            applyUnderlineColor(null);
            panel.remove();
          });
          panel.appendChild(defaultBtn);

          let customRow = document.createElement('div');
          customRow.style.cssText = 'display:flex;align-items:center;gap:6px;';
          let customInput = document.createElement('input');
          customInput.type = 'color';
          customInput.value = '#ff0000';
          customInput.style.cssText = 'width:28px;height:24px;border:none;cursor:pointer;padding:0;background:none;';
          customInput.addEventListener('input', function () {
            applyUnderlineColor(customInput.value);
            panel.remove();
          });
          customRow.appendChild(customInput);
          let pickLabel = document.createElement('span');
          pickLabel.textContent = '取色器';
          pickLabel.style.cssText = 'color:#8899aa;font-size:11px;';
          customRow.appendChild(pickLabel);
          panel.appendChild(customRow);

          let rect = anchorEl.getBoundingClientRect();
          panel.style.left = rect.left + 'px';
          panel.style.top = (rect.bottom + 3) + 'px';

          let closeHandler = function (e) {
            if (!panel.contains(e.target)) {
              panel.remove();
              document.removeEventListener('click', closeHandler);
            }
          };
          setTimeout(function () {
            document.addEventListener('click', closeHandler);
          }, 0);

          document.body.appendChild(panel);
        }

        editor.ui.registry.addSplitButton('customunderline', {
          text: 'U̲',
          tooltip: '下划线',
          chevronTooltip: '下划线样式选项',
          onAction: function () {
            // 点击大按钮 → 直接应用默认下划线（标准下划线逻辑）
            const ed = state.tinyEditor;
            if (!ed) return;
            const node = ed.selection.getNode();
            const gradSpan = ed.dom.getParent(node, 'span.gradient-text');
            if (gradSpan) {
              const bgImage = gradSpan.style.backgroundImage;
              if (bgImage) {
                const existingGU = ed.dom.getParent(node, 'span.gradient-underline');
                if (existingGU) {
                  ed.dom.remove(existingGU, true);
                  return;
                }
                const html = ed.selection.getContent();
                if (html && !ed.selection.isCollapsed()) {
                  ed.selection.setContent('<span class="gradient-underline" style="border-bottom:2px solid;border-image:' + bgImage + ' 1;padding-bottom:0;display:inline;">' + html + '</span>');
                  return;
                }
              }
            }
            // 检查选中文本是否已有下划线 → toggle off
            let hasUl = false;
            let cur = node;
            while (cur && cur !== ed.getBody() && cur.parentNode) {
              if (cur.nodeName === 'SPAN' || cur.nodeName === 'U') {
                let deco = ed.dom.getStyle(cur, 'text-decoration') || cur.style.textDecoration || '';
                if (/\bunderline\b/.test(deco)) { hasUl = true; break; }
              }
              cur = cur.parentNode;
            }
            if (hasUl) {
              toggleUnderlineStyle('solid');
            } else {
              ed.execCommand('underline');
            }
          },
          onItemAction: function (api, value) {
            if (value === '_color') {
              let el = document.querySelector('[aria-label="下划线"]');
              if (el) showUnderlineColorPanel(el);
            } else {
              toggleUnderlineStyle(value);
            }
          },
          fetch: function (callback) {
            let items = [];
            underlineStyles.forEach(function (style) {
              items.push({
                type: 'choiceitem',
                text: underlineLabels[style],
                value: style
              });
            });
            items.push({ type: 'separator' });
            items.push({
              type: 'choiceitem',
              text: '下划线颜色...',
              value: '_color'
            });
            callback(items);
          },
          onSetup: function (api) {
            function updateState() {
              let ed = state.tinyEditor;
              if (!ed) return;
              let node = ed.selection.getNode();
              let hasUnderline = false;
              if (ed.dom.getParent(node, 'span.gradient-underline')) {
                api.setActive(true);
                return;
              }
              let cur = node;
              while (cur && cur !== ed.getBody() && cur.parentNode) {
                if (cur.nodeName === 'SPAN' || cur.nodeName === 'U') {
                  let deco = ed.dom.getStyle(cur, 'text-decoration') || cur.style.textDecoration || '';
                  if (/\bunderline\b/.test(deco)) {
                    hasUnderline = true;
                    break;
                  }
                }
                cur = cur.parentNode;
              }
              api.setActive(hasUnderline);
            }
            editor.on('NodeChange', updateState);
            return function () {
              editor.off('NodeChange', updateState);
            };
          }
        });
      } catch (e) {
        console.error('[TinyMCE] customunderline 按钮注册失败:', e);
      }

      registerListFeatures(editor, state);

      (function _installListBackspaceHandler() {
        const _TRACK_ATTR = 'data-bs-track';
        let _step = 0;

        function _isAtStart(block, sc, offset) {
          if (!block || offset !== 0) return false;
          let fc = block.firstChild;
          while (fc && fc.nodeType === 1 && fc.tagName === 'BR') { fc = fc.nextSibling; }
          if (sc === block) return true;
          if (sc.nodeType === 3 && sc === fc) return true;
          if (sc.nodeType === 1 && sc === fc) return true;
          return false;
        }

        function _findTracked() {
          return document.querySelector('[' + _TRACK_ATTR + ']');
        }

        function _mark(el) {
          el.setAttribute(_TRACK_ATTR, '1');
        }

        function _unmark() {
          const el = _findTracked();
          if (el) el.removeAttribute(_TRACK_ATTR);
          _step = 0;
        }

        function _cursorToBlockStart(block) {
          const tw = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, null, false);
          const tn = tw.firstChild();
          if (tn) {
            const r = document.createRange();
            r.setStart(tn, 0);
            r.setEnd(tn, 0);
            const sel = editor.selection.getSel();
            if (sel && sel.rangeCount > 0) { sel.removeAllRanges(); sel.addRange(r); }
          } else {
            editor.selection.setCursorLocation(block, 0);
          }
        }

        function _cursorToPrevEnd(block) {
          const prev = block.previousElementSibling;
          if (!prev) return;
          const tw = document.createTreeWalker(prev, NodeFilter.SHOW_TEXT, null, false);
          const tn = tw.lastChild();
          if (tn) {
            const r = document.createRange();
            r.setStart(tn, tn.length);
            r.setEnd(tn, tn.length);
            const sel = editor.selection.getSel();
            if (sel && sel.rangeCount > 0) { sel.removeAllRanges(); sel.addRange(r); }
          } else {
            editor.selection.setCursorLocation(prev, prev.childNodes.length);
          }
        }

        function _outdentTopLi(li) {
          editor.undoManager.transact(function () {
            const ol = li.parentNode;
            const parentLi = editor.dom.getParent(ol, 'li');

            if (parentLi) {
              const afterSibs = [];
              let nxt = li.nextSibling;
              while (nxt) { afterSibs.push(nxt); nxt = nxt.nextSibling; }
              editor.dom.insertAfter(li, parentLi);
              if (afterSibs.length > 0) {
                const nl = document.createElement(ol.tagName);
                for (let i = 0; i < afterSibs.length; i++) { nl.appendChild(afterSibs[i]); }
                editor.dom.insertAfter(nl, li);
              }
              if (!ol.hasChildNodes() && ol.parentNode) { ol.parentNode.removeChild(ol); }
              _mark(li);
              _cursorToBlockStart(li);
            } else {
              const p = document.createElement('p');
              while (li.firstChild) { p.appendChild(li.firstChild); }
              const st = editor.dom.getAttrib(li, 'style');
              if (st) p.setAttribute('style', st);
              editor.dom.insertAfter(p, li);
              li.parentNode.removeChild(li);
              if (!ol.hasChildNodes() && ol.parentNode) { ol.parentNode.removeChild(ol); }
              _mark(p);
              _cursorToBlockStart(p);
            }
          });
        }

        editor.on('keydown', function (e) {
          if (e.keyCode !== 8 && e.key !== 'Backspace') { _unmark(); return; }
          if (e.ctrlKey || e.metaKey || e.altKey) { _unmark(); return; }

          const node = editor.selection.getNode();
          const rng = editor.selection.getRng();
          if (!rng.collapsed) { _unmark(); return; }

          const sc = rng.startContainer;
          const off = rng.startOffset;

          const li = editor.dom.getParent(node, 'li');
          const p = editor.dom.getParent(node, 'p');

          let block = null;
          if (li && _isAtStart(li, sc, off)) block = li;
          else if (p && _isAtStart(p, sc, off)) block = p;
          else { _unmark(); return; }

          const tracked = _findTracked();

          if (_step === 0 && block.tagName === 'LI') {
            e.preventDefault();
            _outdentTopLi(block);
            _step = 1;
            return;
          }

          if (_step === 1) {
            if (tracked && (block === tracked || block.contains(tracked) || tracked.contains(block))) {
              e.preventDefault();
              _cursorToBlockStart(tracked);
              _step = 2;
              return;
            } else if (block.tagName === 'LI') {
              _unmark();
              e.preventDefault();
              _outdentTopLi(block);
              _step = 1;
              return;
            }
            _unmark();
            return;
          }

          if (_step === 2) {
            if (tracked && (block === tracked || block.contains(tracked) || tracked.contains(block))) {
              e.preventDefault();
              _unmark();
              _cursorToPrevEnd(tracked);
              return;
            } else if (block.tagName === 'LI') {
              _unmark();
              e.preventDefault();
              _outdentTopLi(block);
              _step = 1;
              return;
            }
            _unmark();
            return;
          }

          _unmark();
        });
      })();

      editor.on('ExecCommand', function(e) {
        let cmd = e.command.toLowerCase();
        let styleMap = {
          'fontsize': 'font-size',
          'fontname': 'font-family',
          'forecolor': 'color',
          'backcolor': 'background-color',
          'hilitecolor': 'background-color',
          'mcefontsizeup': 'font-size',
          'mcefontsizedown': 'font-size'
        };
        let prop = styleMap[cmd];
        if (prop) {
          let node = editor.selection.getNode();
          let li = editor.dom.getParent(node, 'li');
          if (!li) return;
          let value = e.value;
          if (cmd === 'mcefontsizeup' || cmd === 'mcefontsizedown') {
            value = editor.queryCommandValue('fontsize');
          }
          let varMap = {
            'font-size': '--mkr-font-size',
            'font-family': '--mkr-font-family',
            'color': '--mkr-color',
            'background-color': '--mkr-bg-color'
          };
          let mkrVar = varMap[prop];
          setTimeout(function () {
            if (value) {
              if (mkrVar) { li.style.setProperty(mkrVar, value); }
              if (cmd === 'forecolor') {
                li.style.removeProperty('--mkr-bg-image');
                li.style.removeProperty('--mkr-bg-clip');
                li.style.removeProperty('--mkr-text-fill');
              }
              if (cmd === 'backcolor' || cmd === 'hilitecolor') {
                li.style.removeProperty('--mkr-bg-image');
              }
            } else {
              if (mkrVar) { li.style.removeProperty(mkrVar); }
            }
          }, 0);
          return;
        }
        if (cmd === 'bold' || cmd === 'italic') {
          setTimeout(function () {
            let node = editor.selection.getNode();
            let li = editor.dom.getParent(node, 'li');
            if (!li) return;
            if (cmd === 'bold') {
              let isBold = editor.queryCommandState('Bold');
              li.style.setProperty('--mkr-font-weight', isBold ? 'bold' : null);
            } else {
              let isItalic = editor.queryCommandState('Italic');
              li.style.setProperty('--mkr-font-style', isItalic ? 'italic' : null);
            }
          }, 10);
          return;
        }
        if (cmd === 'underline' || cmd === 'strikethrough') {
          setTimeout(function () {
            let node = editor.selection.getNode();
            let li = editor.dom.getParent(node, 'li');
            if (!li) return;
            let decoVal = cmd === 'underline' ? 'underline' : 'line-through';
            let current = li.style.getPropertyValue('--mkr-text-deco') || '';
            let parts = current.split(/\s+/).filter(Boolean);
            let isActive = editor.queryCommandState(cmd === 'underline' ? 'Underline' : 'Strikethrough');
            if (isActive) {
              if (parts.indexOf(decoVal) === -1) parts.push(decoVal);
            } else {
              parts = parts.filter(function (p) { return p !== decoVal; });
            }
            li.style.setProperty('--mkr-text-deco', parts.length > 0 ? parts.join(' ') : null);
          }, 10);
          return;
        }
        if (cmd === 'removeformat') {
          let rng = editor.selection.getRng();
          let hasSelection = !rng.collapsed;

          if (hasSelection) {
            editor.undoManager.transact(function () {
              let rubyEls = [];
              let re = document.createNodeIterator(
                rng.commonAncestorContainer,
                NodeFilter.SHOW_ELEMENT,
                { acceptNode: function (el) {
                  try { return el.nodeName === 'RUBY' && rng.intersectsNode(el) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT; }
                  catch (e) { return NodeFilter.FILTER_REJECT; }
                }},
                false
              );
              let rb;
              while ((rb = re.nextNode())) { if (rubyEls.indexOf(rb) === -1) rubyEls.push(rb); }
              for (let i = rubyEls.length - 1; i >= 0; i--) {
                let rb = rubyEls[i];
                let text = '';
                for (let c = rb.firstChild; c; c = c.nextSibling) {
                  if (c.nodeType === 3 || (c.nodeType === 1 && c.nodeName !== 'RT')) {
                    text += c.textContent || '';
                  }
                }
                let parent = rb.parentNode;
                if (parent) {
                  parent.replaceChild(document.createTextNode(text), rb);
                  parent.normalize();
                }
              }

              let customSpans = [];
              let csWalk = document.createTreeWalker(editor.getBody(), NodeFilter.SHOW_ELEMENT, {
                acceptNode: function (el) {
                  if (el.nodeName === 'SPAN' && rng.intersectsNode(el) &&
                      (el.classList.contains('gradient-text') || el.classList.contains('gradient-bg') ||
                       el.classList.contains('tmce-backcolor') || el.classList.contains('charborder'))) {
                    return NodeFilter.FILTER_ACCEPT;
                  }
                  return NodeFilter.FILTER_SKIP;
                }
              });
              let cs;
              while ((cs = csWalk.nextNode())) customSpans.push(cs);
              for (let i = customSpans.length - 1; i >= 0; i--) {
                try { editor.dom.unwrap(customSpans[i]); } catch (e) {}
              }
            });
          }

          setTimeout(function () {
            let node = editor.selection.getNode();
            let li = editor.dom.getParent(node, 'li');
            if (li) {
              [
                '--mkr-color', '--mkr-font-size', '--mkr-font-family',
                '--mkr-font-weight', '--mkr-font-style', '--mkr-text-deco',
                '--mkr-bg-color', '--mkr-border',
                '--mkr-bg-image', '--mkr-bg-clip', '--mkr-text-fill'
              ].forEach(function (v) { li.style.removeProperty(v); });
            }
            let body = editor.getBody();
            if (body) body.normalize();
          }, 30);
          return;
        }
      });

      let solidColors = [
        '#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#efefef', '#f3f3f3', '#ffffff',
        '#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff',
        '#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc',
        '#dd7e6b', '#ea9999', '#f9cb9c', '#ffe599', '#b6d7a8', '#a2c4c9', '#a4c2f4', '#9fc5e8', '#b4a7d6', '#d5a6bd'
      ];

      let gradientPresets = [
        { text: '暖色渐变', gradient: 'linear-gradient(to right, #ff416c, #ff4b2b)' },
        { text: '冷色渐变', gradient: 'linear-gradient(to right, #2193b0, #6dd5ed)' },
        { text: '紫金渐变', gradient: 'linear-gradient(to right, #8e2de2, #f7b733)' },
        { text: '海洋渐变', gradient: 'linear-gradient(to right, #00b4db, #0083b0)' },
        { text: '霓虹渐变', gradient: 'linear-gradient(to right, #fc466b, #3f5efb)' },
        { text: '日落渐变', gradient: 'linear-gradient(to right, #fdc830, #f37335)' },
        { text: '极光渐变', gradient: 'linear-gradient(to right, #11998e, #38ef7d)' },
        { text: '粉蓝渐变', gradient: 'linear-gradient(to right, #f093fb, #f5576c)' }
      ];

      function _wrapTextNodesInSel(editor, wrapFn) {
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
              // 不修改字符边框的边框样式 — 字符边框不应受文字渐变影响
              if (de.hasAttribute('data-emphasis')) {
                if (isGrad) {
                  // 渐变文字 → 着重号颜色跟随渐变的第一个色值
                  let match = gradientCss.match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)/);
                  if (match) {
                    de.style.setProperty('text-emphasis-color', match[0]);
                    de.style.setProperty('-webkit-text-emphasis-color', match[0]);
                  }
                } else {
                  // 纯色文字 → 着重号继承 currentColor
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
        if (panel.style.display === 'block') { panel.style.display = 'none'; delete state.tinyEditor._savedRange; return; }
        let editor = state.tinyEditor;
        if (editor) {
          let rng = editor.selection.getRng();
          if (!rng.collapsed) { editor._savedRange = rng.cloneRange(); }
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
        if (panel.style.display === 'block') { panel.style.display = 'none'; delete state.tinyEditor._savedBackRange; return; }
        let editor = state.tinyEditor;
        if (editor) {
          let rng = editor.selection.getRng();
          if (!rng.collapsed) { editor._savedBackRange = rng.cloneRange(); }
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
