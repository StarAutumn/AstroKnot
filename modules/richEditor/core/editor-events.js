// ============================================================
//  richEditor/editor-events.js — 编辑器事件绑定（初始化后）
// ============================================================

import { state } from '../shared-state.js';
import { toolbarDock, ckContainer } from '../dom-refs.js';
import { showTinyImageContextMenu, showFileLinkContextMenu, insertTinyFileFromFile } from '../images-files.js';
import { syncLineNumbersDebounced } from './code-blocks.js';
import { addLineNumbersToPreBlocks } from './code-blocks.js';
import { openTinyMceCodeEditor } from './code-blocks.js';
import { setEditingFormulaImg } from '../utils.js';
import { bindOverlayEvents } from './overlay/index.js';
import { injectMenuBar, injectToggleButton } from './toolbar-layout.js';
import { bindWordCount } from '../word-count.js';
import { showTocContextMenu } from '../insert-toc.js';

export function bindEditorPostInit(editors) {
    state.tinyEditor = editors[0];

    bindOverlayEvents();
    bindWordCount();

    let body = state.tinyEditor.getBody();
    if (body) {
      let editorDoc = body.ownerDocument;
      if (editorDoc) {
        editorDoc.addEventListener('contextmenu', function (e) {
          if (!body.contains(e.target)) return;
          let overlayImg = e.target.closest('.oly-img-item');
          if (overlayImg) return;
          let wrapper = e.target.closest('.tmce-resizable-image-wrapper');
          if (wrapper) {
            e.preventDefault();
            e.stopImmediatePropagation();
            showTinyImageContextMenu(wrapper, e);
            return;
          }
          let fileLink = e.target.closest('.file-link');
          if (fileLink) {
            e.preventDefault();
            e.stopImmediatePropagation();
            showFileLinkContextMenu(fileLink, e);
            return;
          }
          e.preventDefault();
          e.stopImmediatePropagation();
          showTocContextMenu(state.tinyEditor, e.clientX, e.clientY);
          return;
        }, true);
      }

      let observer = new MutationObserver(function () {
        syncLineNumbersDebounced(state.tinyEditor);
      });
      observer.observe(body, {
        childList: true,
        subtree: true
      });

      // ---- 外部文件拖入编辑区 → 自动变成文件按钮 ----
      // 使用捕获阶段确保自定义处理器在 TinyMCE 默认处理之前执行
      body.addEventListener('dragover', function (e) {
        if (!e.dataTransfer || !e.dataTransfer.types || !Array.from(e.dataTransfer.types).includes('Files')) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        e.dataTransfer.dropEffect = 'copy';
        body.classList.add('tmce-drag-over');
      }, true);

      body.addEventListener('dragleave', function (e) {
        if (!body.contains(e.relatedTarget)) {
          body.classList.remove('tmce-drag-over');
        }
      }, true);

      body.addEventListener('drop', function (e) {
        if (!e.dataTransfer || !e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        body.classList.remove('tmce-drag-over');
        state.tinyEditor.focus();
        const range = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null;
        if (range) {
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        }
        for (const file of e.dataTransfer.files) {
          insertTinyFileFromFile(file);
        }
      }, true);

      // 同样在 TinyMCE 编辑器事件层拦截
      state.tinyEditor.on('DragOver', function (e) {
        if (!e.event || !e.event.dataTransfer || !Array.from(e.event.dataTransfer.types).includes('Files')) return;
        e.preventDefault();
      });
      state.tinyEditor.on('Drop', function (e) {
        if (!e.event || !e.event.dataTransfer || !e.event.dataTransfer.files || e.event.dataTransfer.files.length === 0) return;
        e.preventDefault();
      });
    }

    let zoomSlider = document.getElementById('editorZoomSlider');
    let zoomInput = document.getElementById('editorZoomInput');

    function applyEditorZoom(val) {
      if (!body) return;
      body.style.zoom = (val / 100);
      if (zoomSlider && parseFloat(zoomSlider.value) !== val) zoomSlider.value = val;
      if (zoomInput && parseFloat(zoomInput.value) !== val) zoomInput.value = val;

      let needScroll = val > 100;
      let editWrapper = document.querySelector('.edit-area-wrapper');
      if (editWrapper) {
        editWrapper.style.setProperty('overflow-x', needScroll ? 'auto' : 'hidden', 'important');
      }
      let quickBody = document.querySelector('.quick-editor-body');
      if (quickBody) {
        quickBody.style.overflowX = needScroll ? 'auto' : '';
      }
    }

    if (zoomSlider) {
      zoomSlider.addEventListener('input', function () {
        applyEditorZoom(parseFloat(this.value));
      });
    }

    if (zoomInput) {
      zoomInput.addEventListener('input', function () {
        let v = parseFloat(this.value);
        if (isNaN(v)) return;
        v = Math.max(25, Math.min(300, v));
        applyEditorZoom(v);
      });
      zoomInput.addEventListener('change', function () {
        let v = parseFloat(this.value);
        if (isNaN(v) || v < 25) this.value = 25;
        if (v > 300) this.value = 300;
        applyEditorZoom(parseFloat(this.value));
      });
      zoomInput.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          let v = parseFloat(this.value) || 100;
          v += (e.key === 'ArrowUp' ? 5 : -5);
          v = Math.max(25, Math.min(300, v));
          this.value = v;
          applyEditorZoom(v);
        }
      });
    }

    applyEditorZoom(100);

    addLineNumbersToPreBlocks(state.tinyEditor);

    (function setupEditorSearch() {
      let body = state.tinyEditor.getBody();
      let container = document.querySelector('.caption-buttons');
      if (!body || !container) return;

      let searchWrap = document.createElement('div');
      searchWrap.className = 'editor-search-bar';
      searchWrap.style.cssText = 'display:flex;align-items:center;gap:6px;';

      let innerWrap = document.createElement('div');
      innerWrap.style.cssText = 'position:relative;display:flex;align-items:center;gap:4px;';

      let input = document.createElement('input');
      input.type = 'text';
      input.placeholder = '搜索...';
      input.style.cssText = 'width:150px;height:28px;background:#07161f;border:1px solid #2c6e7e;color:#c8e6ff;font-size:12px;padding:2px 28px 2px 8px;border-radius:4px;outline:none;';

      let clearBtn = document.createElement('button');
      clearBtn.innerHTML = '\u2715';
      clearBtn.style.cssText = 'display:none;position:absolute;right:4px;top:50%;transform:translateY(-50%);width:18px;height:18px;background:none;border:none;color:#88aacc;cursor:pointer;font-size:12px;line-height:18px;padding:0;z-index:1;';

      let infoSpan = document.createElement('span');
      infoSpan.style.cssText = 'font-size:11px;color:#5a7a8a;white-space:nowrap;';

      let dropdown = document.createElement('div');
      dropdown.className = 'editor-search-dropdown-menu';
      dropdown.style.cssText = 'display:none;position:absolute;top:32px;right:0;width:340px;max-height:260px;overflow-y:auto;background:#0a1a24;border:1px solid #2c6e7e;border-radius:8px;z-index:99999;box-shadow:0 4px 16px rgba(0,0,0,0.6);';

      innerWrap.appendChild(input);
      innerWrap.appendChild(clearBtn);
      innerWrap.appendChild(dropdown);
      searchWrap.appendChild(innerWrap);
      searchWrap.appendChild(infoSpan);

      container.insertBefore(searchWrap, container.firstChild);

      let debounceTimer = null;
      let matches = [];
      let keyword = '';

      function doSearch() {
        keyword = input.value.trim();
        matches = [];
        dropdown.innerHTML = '';

        if (!keyword || keyword.length < 1) {
          clearBtn.style.display = 'none';
          infoSpan.textContent = '';
          dropdown.style.display = 'none';
          return;
        }

        clearBtn.style.display = 'inline-block';

        let kw = keyword.toLowerCase();
        let walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
          acceptNode: function (node) {
            let parent = node.parentNode;
            if (parent && (parent.closest('script') || parent.closest('style') || parent.closest('.tox-dialog'))) {
              return NodeFilter.FILTER_REJECT;
            }
            return node.textContent.toLowerCase().indexOf(kw) !== -1 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
          }
        }, false);

        let node;
        let matchIndex = 0;
        while ((node = walker.nextNode())) {
          let text = node.textContent;
          let lowerText = text.toLowerCase();
          let idx = -1;
          while ((idx = lowerText.indexOf(kw, idx + 1)) !== -1) {
            let ctxStart = Math.max(0, idx - 25);
            let ctxEnd = Math.min(text.length, idx + kw.length + 25);
            let prefix = ctxStart > 0 ? '...' : '';
            let suffix = ctxEnd < text.length ? '...' : '';
            let context = prefix + text.substring(ctxStart, ctxEnd).replace(/\s+/g, ' ') + suffix;
            matches.push({ index: matchIndex, node: node, offset: idx, context: context });
            matchIndex++;
          }
        }

        infoSpan.textContent = matches.length + ' 个';

        if (matches.length === 0) {
          dropdown.style.display = 'none';
          return;
        }

        let maxShow = Math.min(matches.length, 25);
        for (let i = 0; i < maxShow; i++) {
          (function (m) {
            let item = document.createElement('div');
            item.style.cssText = 'padding:5px 10px;color:#aef0ff;font-size:12px;cursor:pointer;border-bottom:1px solid #1a3a44;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
            item.title = m.context;
            let hlCtx = m.context.replace(new RegExp('(' + keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'), '<b style="color:#ffeb3b;background:#3a2a00;padding:0 1px;border-radius:2px;">$1</b>');
            item.innerHTML = (m.index + 1) + '. ' + hlCtx;
            item.addEventListener('mousedown', function (e) {
              e.preventDefault();
              goToMatch(m);
            });
            dropdown.appendChild(item);
          })(matches[i]);
        }

        if (matches.length > maxShow) {
          let more = document.createElement('div');
          more.style.cssText = 'padding:5px 10px;color:#5a7a8a;font-size:11px;text-align:center;';
          more.textContent = '\u2026\u8fd8\u6709 ' + (matches.length - maxShow) + ' \u4e2a\u7ed3\u679c';
          dropdown.appendChild(more);
        }

        dropdown.style.display = 'block';
      }

      function goToMatch(match) {
        dropdown.style.display = 'none';
        try {
          let range = document.createRange();
          range.setStart(match.node, match.offset);
          range.setEnd(match.node, match.offset + keyword.length);
          let span = document.createElement('span');
          span.className = 'editor-search-flash';
          span.style.cssText = 'background:#ffeb3b;color:#000;border-radius:2px;padding:1px 0;';
          range.surroundContents(span);

          let flashCount = 0;
          let flashTimer = setInterval(function () {
            span.style.backgroundColor = flashCount % 2 === 0 ? '#ff9800' : '#ffeb3b';
            flashCount++;
            if (flashCount >= 6) {
              clearInterval(flashTimer);
              span.style.backgroundColor = '';
              setTimeout(function () {
                let p = span.parentNode;
                if (p) {
                  while (span.firstChild) { p.insertBefore(span.firstChild, span); }
                  p.removeChild(span);
                  p.normalize();
                }
              }, 300);
            }
          }, 150);

          let rect = span.getBoundingClientRect();
          let bodyRect = body.getBoundingClientRect();
          if (rect.top < bodyRect.top || rect.bottom > bodyRect.bottom) {
            body.scrollTop = body.scrollTop + rect.top - bodyRect.top - bodyRect.height / 3;
          }
        } catch (err) {
          let range2 = document.createRange();
          range2.setStart(match.node, match.offset);
          let rect2 = range2.getBoundingClientRect();
          let bodyRect2 = body.getBoundingClientRect();
          if (rect2.top < bodyRect2.top || rect2.bottom > bodyRect2.bottom) {
            body.scrollTop = body.scrollTop + rect2.top - bodyRect2.top - bodyRect2.height / 3;
          }
        }
      }

      input.addEventListener('input', function () {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(doSearch, 200);
      });

      input.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          input.value = '';
          doSearch();
          input.blur();
        }
      });

      clearBtn.addEventListener('click', function () {
        input.value = '';
        doSearch();
        input.focus();
      });

      document.addEventListener('click', function (e) {
        if (!searchWrap.contains(e.target)) {
          dropdown.style.display = 'none';
        }
      });
    })();

    state.tinyEditor.on('dblclick', function (e) {
      let formulaImg = e.target.closest('.tmce-formula-img');
      if (!formulaImg) return;
      e.preventDefault();
      let latex = formulaImg.getAttribute('data-latex');
      if (!latex) {
        latex = formulaImg.alt || '';
      }
      if (!latex) return;
      let formulaModal = document.getElementById('formulaEditorModal');
      let formulaInput = document.getElementById('formulaMathfield');
      let formulaColorPicker = document.getElementById('formulaColorPicker');
      if (!formulaModal || !formulaInput) return;
      setEditingFormulaImg(formulaImg);
      if (formulaInput.setValue) {
        formulaInput.setValue(latex);
      } else {
        formulaInput.value = latex;
      }
      if (formulaColorPicker) {
        let savedColor = formulaImg.getAttribute('data-color');
        if (savedColor) {
          formulaColorPicker.value = savedColor;
        }
      }
      formulaInput.dispatchEvent(new Event('input', { bubbles: true }));
      formulaModal.style.display = 'block';
      formulaInput.focus();
    });

    if (body) {
      body.addEventListener('dblclick', function (e) {
        let wrapper = e.target.closest('.tmce-code-wrapper');
        if (!wrapper) return;
        e.preventDefault();
        let pre = wrapper.querySelector('pre');
        let codeEl = pre ? pre.querySelector('code') : null;
        let code = codeEl ? codeEl.textContent : (pre ? pre.textContent : '');
        let lang = 'javascript';
        if (pre) {
          let match = pre.className.match(/language-(\w+)/);
          if (match) lang = match[1];
        }
        openTinyMceCodeEditor(state.tinyEditor, lang, code, wrapper);
      });
    }

    if (!window.__tmceFileLinkBound) {
      window.__tmceFileLinkBound = true;
      state.tinyEditor.on('click', function (e) {
        let fileLink = e.target.closest('.file-link');
        if (fileLink) {
          e.preventDefault();
          let href = fileLink.getAttribute('href');
          if (href) {
            if (href.startsWith('http://') || href.startsWith('https://')) {
              if (window.api && window.api.openExternalUrl) {
                window.api.openExternalUrl(href);
              } else {
                window.open(href, '_blank');
              }
            } else {
              if (window.api && window.api.openLocalFile) {
                window.api.openLocalFile(href);
              }
            }
          }
        }
      });
    }

    console.log('[TinyMCE] 初始化成功');
    injectMenuBar();
    injectToggleButton();
}
