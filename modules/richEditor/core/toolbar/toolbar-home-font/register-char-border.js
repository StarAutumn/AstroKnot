import { state } from '../../../shared-state.js';

export function registerCharBorder(editor, shared) {
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
}