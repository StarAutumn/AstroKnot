import { state } from '../../../shared-state.js';

export function registerEmphasis(editor, shared) {
  const { updateFontButtonLabels } = shared;

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
}