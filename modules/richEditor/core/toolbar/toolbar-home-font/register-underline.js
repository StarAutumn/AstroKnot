import { state } from '../../../shared-state.js';
import { solidColors } from './shared.js';

export function registerUnderline(editor, shared) {
  const { updateFontButtonLabels } = shared;

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
}