// ============================================================
//  content-io/split-screen.js — 分屏功能
// ============================================================

import { modalRich } from '../dom-refs.js';
import { state } from '../shared-state.js';
import { contentStyle } from '../content-style.js';
import { appState } from '../../module0_AppState.js';
import { showTinyUI, addLineNumbersToPreBlocks } from '../core/code-blocks.js';
import { initTOC, buildTOC } from '../toc.js';
import { getOverlayImagesData, setOverlayImagesData, renderAll } from '../core/overlay/index.js';
import { pctToPx, stripOverlayBlocksFromHTML } from '../core/overlay/index.js';
import { renderChartContent } from '../core/overlay/overlay-chart.js';
import { renderExcelContent } from '../core/overlay/overlay-excel.js';
import { renderSlideshowContent } from '../core/overlay/overlay-slideshow.js';
import { renderVideoContent } from '../core/overlay/overlay-video.js';
import { renderAudioContent } from '../core/overlay/overlay-audio.js';
import { getDrawData, setDrawData } from '../core/toolbar/toolbar-draw.js';
import { _makeTabKey, _findTabIndex, _renderEditorTabs, getActiveTabKey, getEditorTabs, setActiveTabKey, _updateModalTitle } from './editor-tabs.js';

function _saveCurrentActiveNode() {
  if (!state.tinyEditor) return;
  let activeId = appState._activeSplitPanel === 'B' ? appState.splitScreenNodeId : appState.currentEditNodeId;
  if (!activeId) return;
  let node = appState.nodeMap.get(activeId);
  if (!node) return;
  node.richContent = stripOverlayBlocksFromHTML(state.tinyEditor.getContent());
  node.overlayImages = getOverlayImagesData();
  node.drawData = getDrawData();
  node._scrollY = state.tinyEditor.getBody().scrollTop || state.tinyEditor.getWin().scrollY || 0;
  try { node._bookmark = state.tinyEditor.selection.getBookmark(2, true); } catch (e) { node._bookmark = null; }

  if (appState.splitScreenNodeId) {
    let previewId = appState._activeSplitPanel === 'B' ? appState.currentEditNodeId : appState.splitScreenNodeId;
    let previewNode = appState.nodeMap.get(previewId);
    if (previewNode) {
      let previewPanel = appState._activeSplitPanel === 'B' ? document.getElementById('editPanelA') : document.getElementById('editPanelB');
      let previewWrapper = previewPanel ? previewPanel.querySelector('.split-preview-wrapper') : null;
      if (previewWrapper) {
        previewNode._scrollY = previewWrapper.scrollTop || 0;
      }
    }
  }
}

function _restoreEditorState(node) {
  if (!node || !state.tinyEditor) return;
  if (node._bookmark) {
    try { state.tinyEditor.selection.moveToBookmark(node._bookmark); } catch (e) {}
  }
  let scrollY = node._scrollY || node._previewScrollY || 0;
  if (scrollY > 0) {
    requestAnimationFrame(function () {
      try { state.tinyEditor.getBody().scrollTop = scrollY; } catch (e) {}
      try { state.tinyEditor.getWin().scrollTo(0, scrollY); } catch (e) {}
    });
  }
}

function _renderPreviewInPanel(panel, node) {
  let existing = panel.querySelector('.split-preview-wrapper');
  if (existing) existing.remove();

  if (!node) return;

  let wrapper = document.createElement('div');
  wrapper.className = 'split-preview-wrapper';
  wrapper.style.cssText =
    'position:absolute;top:0;left:0;right:0;bottom:0;overflow:auto;' +
    'background:#0d1b23;';

  let contentDiv = document.createElement('div');
  contentDiv.className = 'mce-content-body';
  contentDiv.style.cssText =
    'position:relative;min-height:100%;padding:16px;color:#c8e6ff;font-family:Microsoft YaHei,sans-serif;' +
    'font-size:15px;line-height:1.7;overflow-y:auto;';
  contentDiv.innerHTML = node.richContent || '<p style="color:#5a8a9a;font-style:italic;">（空笔记）</p>';

  let styleEl = document.createElement('style');
  styleEl.textContent = contentStyle;
  contentDiv.insertBefore(styleEl, contentDiv.firstChild);

  wrapper.appendChild(contentDiv);

  _addPreviewLineNumbers(contentDiv);

  if (node.overlayImages && node.overlayImages.length > 0) {
    let overlayByBlock = {};
    node.overlayImages.forEach(function (imgData) {
      let bid = imgData.blockId || '_default';
      if (!overlayByBlock[bid]) overlayByBlock[bid] = [];
      overlayByBlock[bid].push(imgData);
    });

    let previewBlocks = contentDiv.querySelectorAll('.tmce-overlay-block');
    previewBlocks.forEach(function (blockEl) {
      let bid = blockEl.getAttribute('data-block-id');
      let items = overlayByBlock[bid] || [];
      if (items.length === 0) return;

      blockEl.style.position = 'relative';
      delete overlayByBlock[bid];

      let blockW = blockEl.clientWidth || 800;

      items.forEach(function (imgData) {
        let displayX, displayW;
        if (imgData.leftPct != null) {
          displayX = pctToPx(imgData.leftPct, blockW);
          displayW = pctToPx(imgData.widthPct, blockW);
        } else {
          let refWidth = imgData._refWidth || blockW;
          let scaleX = blockW / refWidth;
          displayX = (imgData.x || 0) * scaleX;
          displayW = (imgData.width || 200) * scaleX;
        }

        let item = document.createElement('div');
        item.style.cssText =
          'position:absolute;' +
          'left:' + displayX + 'px;' +
          'top:' + imgData.y + 'px;' +
          'width:' + displayW + 'px;' +
          'height:' + imgData.height + 'px;' +
          'z-index:' + (imgData.zIndex || 100) + ';' +
          'cursor:move;box-sizing:content-box;pointer-events:none;overflow:hidden;';
        if (imgData.rotation) {
          item.style.transformOrigin = 'center center';
          item.style.transform = 'rotate(' + imgData.rotation + 'deg)';
        }
        if (imgData.flipH || imgData.flipV) {
          let sx = imgData.flipH ? -1 : 1;
          let sy = imgData.flipV ? -1 : 1;
          let existing = item.style.transform || '';
          item.style.transformOrigin = 'center center';
          item.style.transform = existing + ' scale(' + sx + ',' + sy + ')';
        }
        if (imgData.shadow) {
          item.style.filter = (item.style.filter || '') + ' drop-shadow(' + imgData.shadow + ')';
        }
        if (imgData.opacity != null && imgData.opacity !== 1) {
          item.style.opacity = imgData.opacity;
        }

        if (imgData.type === 'image' && imgData.src) {
          let img = document.createElement('img');
          img.src = imgData.src;
          img.style.cssText = 'width:100%;height:100%;object-fit:contain;pointer-events:none;';
          item.appendChild(img);
        } else if (imgData.type === 'shape') {
          let svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svg.setAttribute('width', '100%');
          svg.setAttribute('height', '100%');
          svg.style.overflow = 'visible';
          let shapeType = imgData.shapeType || 'rect';
          let fill = imgData.fillColor || '#2c6e7e';
          let stroke = imgData.strokeColor || '#aef0ff';
          let sw = imgData.strokeWidth || 2;
          let w = imgData.width || 200;
          let h = imgData.height || 150;
          let el;
          if (shapeType === 'circle' || shapeType === 'ellipse') {
            el = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
            el.setAttribute('cx', w / 2); el.setAttribute('cy', h / 2);
            el.setAttribute('rx', w / 2 - sw); el.setAttribute('ry', h / 2 - sw);
          } else if (shapeType === 'triangle') {
            el = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            el.setAttribute('points', (w/2)+','+sw+' '+(w-sw)+','+(h-sw)+' '+sw+','+(h-sw));
          } else {
            el = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            el.setAttribute('x', sw / 2); el.setAttribute('y', sw / 2);
            el.setAttribute('width', Math.max(1, w - sw)); el.setAttribute('height', Math.max(1, h - sw));
            el.setAttribute('rx', '4');
          }
          el.setAttribute('fill', fill); el.setAttribute('stroke', stroke); el.setAttribute('stroke-width', sw);
          svg.appendChild(el);
          item.appendChild(svg);
        } else if (imgData.type === 'textbox') {
          let tbDiv = document.createElement('div');
          tbDiv.style.cssText =
            'width:100%;height:100%;overflow:hidden;padding:8px;' +
            'font-size:' + (imgData.fontSize || 16) + 'px;' +
            'color:' + (imgData.color || '#ccd') + ';' +
            'font-family:' + (imgData.fontFamily || 'Microsoft YaHei,sans-serif') + ';' +
            'text-align:' + (imgData.textAlign || 'left') + ';' +
            'line-height:' + (imgData.lineHeight || 1.5) + ';' +
            'background:' + (imgData.backgroundColor || 'transparent') + ';';
          if (imgData.bold) tbDiv.style.fontWeight = 'bold';
          if (imgData.italic) tbDiv.style.fontStyle = 'italic';
          tbDiv.innerHTML = imgData.html || imgData.text || '';
          item.appendChild(tbDiv);
        } else if (imgData.type === 'chart') {
          renderChartContent(item, imgData);
        } else if (imgData.type === 'excel') {
          renderExcelContent(item, imgData);
        } else if (imgData.type === 'audio') {
          renderAudioContent(item, imgData);
        } else if (imgData.type === 'video') {
          renderVideoContent(item, imgData);
        } else if (imgData.type === 'slideshow') {
          renderSlideshowContent(item, imgData);
        }

        blockEl.appendChild(item);
      });

      let maxBottom = 0;
      items.forEach(function (imgData) {
        let bottom = (imgData.y || 0) + (imgData.height || 0);
        if (bottom > maxBottom) maxBottom = bottom;
      });
      blockEl.style.minHeight = Math.max(200, maxBottom + 20) + 'px';
    });

    // 兼容旧数据：没有画布块的 overlay 元素
    let remainingIds = Object.keys(overlayByBlock);
    if (remainingIds.length > 0) {
      let fallbackItems = [];
      remainingIds.forEach(function (bid) {
        fallbackItems = fallbackItems.concat(overlayByBlock[bid]);
      });
      if (fallbackItems.length > 0) {
        let overlayDiv = document.createElement('div');
        overlayDiv.id = 'splitPreviewOverlay';
        overlayDiv.setAttribute('contenteditable', 'false');
        overlayDiv.style.cssText =
          'position:absolute;top:0;left:0;right:0;pointer-events:none;z-index:5;';

        fallbackItems.forEach(function (imgData) {
          let item = document.createElement('div');
          item.style.cssText =
            'position:absolute;' +
            'left:' + (imgData.x || 0) + 'px;' +
            'top:' + (imgData.y || 0) + 'px;' +
            'width:' + (imgData.width || 200) + 'px;' +
            'height:' + (imgData.height || 150) + 'px;' +
            'z-index:' + (imgData.zIndex || 100) + ';' +
            'cursor:move;box-sizing:content-box;pointer-events:none;overflow:hidden;';

          if (imgData.type === 'image' && imgData.src) {
            let img = document.createElement('img');
            img.src = imgData.src;
            img.style.cssText = 'width:100%;height:100%;object-fit:contain;pointer-events:none;';
            item.appendChild(img);
          } else if (imgData.type === 'shape') {
            let svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('width', '100%');
            svg.setAttribute('height', '100%');
            svg.style.overflow = 'visible';
            let shapeType = imgData.shapeType || 'rect';
            let fill = imgData.fillColor || '#2c6e7e';
            let stroke = imgData.strokeColor || '#aef0ff';
            let sw = imgData.strokeWidth || 2;
            let el;
            if (shapeType === 'circle' || shapeType === 'ellipse') {
              el = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
              el.setAttribute('cx', imgData.width / 2); el.setAttribute('cy', imgData.height / 2);
              el.setAttribute('rx', imgData.width / 2 - sw); el.setAttribute('ry', imgData.height / 2 - sw);
            } else {
              el = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
              el.setAttribute('x', sw / 2); el.setAttribute('y', sw / 2);
              el.setAttribute('width', Math.max(1, imgData.width - sw)); el.setAttribute('height', Math.max(1, imgData.height - sw));
              el.setAttribute('rx', '4');
            }
            el.setAttribute('fill', fill); el.setAttribute('stroke', stroke); el.setAttribute('stroke-width', sw);
            svg.appendChild(el);
            item.appendChild(svg);
          } else if (imgData.type === 'textbox') {
            let tbDiv = document.createElement('div');
            tbDiv.style.cssText =
              'width:100%;height:100%;overflow:hidden;padding:8px;' +
              'font-size:' + (imgData.fontSize || 16) + 'px;' +
              'color:' + (imgData.color || '#ccd') + ';' +
              'font-family:' + (imgData.fontFamily || 'Microsoft YaHei,sans-serif') + ';' +
              'text-align:' + (imgData.textAlign || 'left') + ';' +
              'line-height:' + (imgData.lineHeight || 1.5) + ';' +
              'background:' + (imgData.backgroundColor || 'transparent') + ';';
            if (imgData.bold) tbDiv.style.fontWeight = 'bold';
            if (imgData.italic) tbDiv.style.fontStyle = 'italic';
            tbDiv.innerHTML = imgData.html || imgData.text || '';
            item.appendChild(tbDiv);
          }
          overlayDiv.appendChild(item);
        });

        contentDiv.style.position = 'relative';
        contentDiv.appendChild(overlayDiv);
      }
    }
  }

  panel.appendChild(wrapper);

  if (node._scrollY > 0) {
    requestAnimationFrame(function () { wrapper.scrollTop = node._scrollY; });
  }
}

function _addPreviewLineNumbers(container) {
  let pres = container.querySelectorAll('pre:not(.tmce-has-lines)');
  pres.forEach(function (pre) {
    if (pre.closest('.tmce-code-wrapper')) return;
    let code = pre.querySelector('code');
    let textSource = code || pre;
    let rawText = textSource.textContent || '';
    let lines = rawText.split('\n');
    let lineNumbersHtml = lines.map(function (_, i) {
      return '<span>' + (i + 1) + '</span>';
    }).join('');

    let wrapperEl = document.createElement('div');
    wrapperEl.className = 'tmce-code-wrapper';
    wrapperEl.setAttribute('contenteditable', 'false');
    pre.setAttribute('contenteditable', 'false');

    let lineDiv = document.createElement('div');
    lineDiv.className = 'tmce-line-numbers';
    lineDiv.setAttribute('contenteditable', 'false');
    lineDiv.innerHTML = lineNumbersHtml;

    let codeArea = document.createElement('div');
    codeArea.className = 'tmce-code-area';

    pre.classList.add('tmce-has-lines');
    pre.parentNode.insertBefore(wrapperEl, pre);
    wrapperEl.appendChild(lineDiv);
    codeArea.appendChild(pre);
    wrapperEl.appendChild(codeArea);

    if (code && window.hljs && !code.hasAttribute('data-highlighted')) {
      code.classList.add('hljs');
      hljs.highlightElement(code);
    }
  });
}

function _removePreviewFromPanel(panel) {
  let existing = panel.querySelector('.split-preview-wrapper');
  if (existing) existing.remove();
}

// 拖到左边缘时：关闭分屏，切换到分屏节点作为主节点编辑
function _switchToSplitNode() {
  if (!appState.splitScreenNodeId) return;

  _saveCurrentActiveNode();

  let splitNodeId = appState.splitScreenNodeId;
  let splitNode = appState.nodeMap.get(splitNodeId);
  if (!splitNode) { deactivateSplitScreen(); return; }

  let editPanelA = document.getElementById('editPanelA');
  let editPanelB = document.getElementById('editPanelB');
  let splitDivider = document.getElementById('splitDivider');

  if (editPanelA) editPanelA.style.visibility = 'hidden';
  if (editPanelB) editPanelB.style.visibility = 'hidden';

  let editorContainer = document.getElementById('ckEditorContainer');

  if (editorContainer && editPanelA && editorContainer.parentElement !== editPanelA) {
    _removePreviewFromPanel(editPanelA);
    editPanelA.appendChild(editorContainer);
  }

  if (editPanelA) { editPanelA.classList.remove('split-panel-active'); editPanelA.style.flex = '1'; }
  if (editPanelB) { editPanelB.classList.remove('split-panel-active'); editPanelB.style.display = 'none'; _removePreviewFromPanel(editPanelB); }
  if (splitDivider) { splitDivider.style.display = 'none'; }

  appState.splitScreenNodeId = null;
  appState._activeSplitPanel = null;
  appState._splitPrimaryRatio = null;
  appState.currentEditNodeId = splitNodeId;
  appState.currentQuickNoteId = null;

  if (state.tinyEditor) {
    state.tinyEditor.setContent(splitNode.richContent || '');
    state.tinyInitialContent = splitNode.richContent || '';
    setOverlayImagesData(splitNode.overlayImages || []);
    requestAnimationFrame(function () { renderAll(); });
    setDrawData(splitNode.drawData || null);
    showTinyUI();
    _restoreEditorState(splitNode);
  }

  _updateSplitTitle();
  _updateSplitTOC();

  let tabKey = _makeTabKey('node', splitNodeId);
  let idx = _findTabIndex(tabKey);
  if (idx >= 0) { setActiveTabKey(tabKey); _renderEditorTabs(); }
  if (window.Taskbar) window.Taskbar.syncLabel(splitNode.name, 'node');

  requestAnimationFrame(function () {
    if (editPanelA) editPanelA.style.visibility = '';
    state.tinyEditor.focus();
  });
}

function _updateSplitTitle() {
  let titleEl = document.getElementById('modalNodeTitle');
  if (!titleEl) return;
  let activeId = appState._activeSplitPanel === 'B' ? appState.splitScreenNodeId : appState.currentEditNodeId;
  let node = activeId ? appState.nodeMap.get(activeId) : null;
  let name = node ? node.name : '未命名';
  titleEl.textContent = '';
  titleEl.appendChild(document.createTextNode('📘 编辑笔记: ' + name));
}

function _updateSplitTOC() {
  if (!state.tinyEditor) return;
  let tocSidebar = document.getElementById('tocSidebar');
  if (!tocSidebar) return;
  let treeBody = tocSidebar.querySelector('.toc-tree');
  if (treeBody) {
    buildTOC(state.tinyEditor, treeBody);
  }
}

export function activateSplitScreen(nodeId) {
  if (!appState.currentEditNodeId || !appState.editorOpen) return;
  if (nodeId === appState.currentEditNodeId) return;
  if (!state.tinyEditor) return;

  let node = appState.nodeMap.get(nodeId);
  if (!node) return;

  _saveCurrentActiveNode();

  appState.splitScreenNodeId = nodeId;
  appState._activeSplitPanel = 'A';

  let editPanelA = document.getElementById('editPanelA');
  let editPanelB = document.getElementById('editPanelB');
  let splitDivider = document.getElementById('splitDivider');
  if (!editPanelA || !editPanelB || !splitDivider) return;

  let editorContainer = document.getElementById('ckEditorContainer');
  if (editorContainer && editorContainer.parentElement !== editPanelA) {
    editPanelA.appendChild(editorContainer);
  }

  _removePreviewFromPanel(editPanelB);
  _renderPreviewInPanel(editPanelB, node);

  splitDivider.style.display = 'flex';
  editPanelB.style.display = 'flex';
  editPanelA.style.flex = '1';
  editPanelB.style.flex = '1';

  editPanelA.classList.add('split-panel-active');
  editPanelB.classList.remove('split-panel-active');

  showTinyUI();
  state.tinyEditor.focus();
}

export function deactivateSplitScreen() {
  if (!appState.splitScreenNodeId) return;

  _saveCurrentActiveNode();

  let editPanelA = document.getElementById('editPanelA');
  let editPanelB = document.getElementById('editPanelB');
  let splitDivider = document.getElementById('splitDivider');

  if (editPanelA) editPanelA.style.visibility = 'hidden';
  if (editPanelB) editPanelB.style.visibility = 'hidden';

  let editorContainer = document.getElementById('ckEditorContainer');

  if (editorContainer && editPanelA && editorContainer.parentElement !== editPanelA) {
    _removePreviewFromPanel(editPanelA);
    editPanelA.appendChild(editorContainer);
  }

  if (editPanelA) { editPanelA.classList.remove('split-panel-active'); editPanelA.style.flex = '1'; }
  if (editPanelB) { editPanelB.classList.remove('split-panel-active'); editPanelB.style.display = 'none'; _removePreviewFromPanel(editPanelB); }
  if (splitDivider) { splitDivider.style.display = 'none'; }

  appState.splitScreenNodeId = null;
  appState._activeSplitPanel = null;
  appState._splitPrimaryRatio = null;

  if (state.tinyEditor && appState.currentEditNodeId) {
    let node = appState.nodeMap.get(appState.currentEditNodeId);
    if (node) {
      state.tinyEditor.setContent(node.richContent || '');
      state.tinyInitialContent = node.richContent || '';
      setOverlayImagesData(node.overlayImages || []);
      requestAnimationFrame(function () { renderAll(); });
      setDrawData(node.drawData || null);
      _restoreEditorState(node);
    }
    showTinyUI();
  }

  _updateSplitTitle();

  requestAnimationFrame(function () {
    if (editPanelA) editPanelA.style.visibility = '';
    state.tinyEditor.focus();
  });
}

function _swapSplitPanels() {
  if (!appState.splitScreenNodeId || !state.tinyEditor) return;
  if (appState._swapping) return;
  appState._swapping = true;

  _saveCurrentActiveNode();

  let panelA = document.getElementById('editPanelA');
  let panelB = document.getElementById('editPanelB');
  let wrapper = document.getElementById('editPanelsWrapper');
  if (!panelA || !panelB || !wrapper) { appState._swapping = false; return; }

  let wrapperRect = wrapper.getBoundingClientRect();
  let panelARect = panelA.getBoundingClientRect();
  let panelBRect = panelB.getBoundingClientRect();
  let divider = document.getElementById('splitDivider');

  let cloneA = panelA.cloneNode(true);
  cloneA.style.cssText =
    'position:absolute;top:0;left:0;width:' + panelARect.width + 'px;height:100%;z-index:20;pointer-events:none;overflow:hidden;';
  wrapper.appendChild(cloneA);

  let cloneB = panelB.cloneNode(true);
  cloneB.style.cssText =
    'position:absolute;top:0;left:' + (panelBRect.left - wrapperRect.left) + 'px;width:' + panelBRect.width + 'px;height:100%;z-index:20;pointer-events:none;overflow:hidden;';
  wrapper.appendChild(cloneB);

  panelA.style.visibility = 'hidden';
  panelB.style.visibility = 'hidden';
  if (divider) divider.style.visibility = 'hidden';

  let duration = 300;
  let startTime = performance.now();
  let startLeftA = 0;
  let startLeftB = panelBRect.left - wrapperRect.left;
  let endLeftA = startLeftB;
  let endLeftB = 0;

  function animate(now) {
    let elapsed = now - startTime;
    let t = Math.min(elapsed / duration, 1);
    t = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

    cloneA.style.left = (startLeftA + (endLeftA - startLeftA) * t) + 'px';
    cloneB.style.left = (startLeftB + (endLeftB - startLeftB) * t) + 'px';

    if (t < 1) {
      requestAnimationFrame(animate);
    } else {
      cloneA.remove();
      cloneB.remove();

      let tempId = appState.currentEditNodeId;
      appState.currentEditNodeId = appState.splitScreenNodeId;
      appState.splitScreenNodeId = tempId;

      let mainNode = appState.nodeMap.get(appState.currentEditNodeId);
      let splitNode = appState.nodeMap.get(appState.splitScreenNodeId);

      let editorContainer = document.getElementById('ckEditorContainer');
      if (editorContainer) panelA.appendChild(editorContainer);

      _removePreviewFromPanel(panelB);
      _renderPreviewInPanel(panelB, splitNode);

      if (mainNode) {
        state.tinyEditor.setContent(mainNode.richContent || '');
        setOverlayImagesData(mainNode.overlayImages || []);
        requestAnimationFrame(function () { renderAll(); });
        _restoreEditorState(mainNode);
      }

      appState._activeSplitPanel = 'A';
      panelA.classList.add('split-panel-active');
      panelB.classList.remove('split-panel-active');
      _updateSplitTitle();

      panelA.style.visibility = '';
      panelB.style.visibility = '';
      if (divider) divider.style.visibility = '';
      appState._swapping = false;
    }
  }

  requestAnimationFrame(animate);
}

function _switchActivePanel(targetPanelId) {
  if (appState._activeSplitPanel === targetPanelId) return;
  if (!state.tinyEditor) return;
  if (!appState.splitScreenNodeId) return;

  let panelA = document.getElementById('editPanelA');
  let panelB = document.getElementById('editPanelB');
  let editorContainer = document.getElementById('ckEditorContainer');
  if (!panelA || !panelB || !editorContainer) return;

  _saveCurrentActiveNode();

  let primaryId = appState.currentEditNodeId;
  let secondaryId = appState.splitScreenNodeId;
  appState._activeSplitPanel = targetPanelId;

  panelA.style.visibility = 'hidden';
  panelB.style.visibility = 'hidden';

  if (targetPanelId === 'A') {
    _removePreviewFromPanel(panelA);
    panelA.appendChild(editorContainer);
    _removePreviewFromPanel(panelB);
    _renderPreviewInPanel(panelB, appState.nodeMap.get(secondaryId));
    let priNode = appState.nodeMap.get(primaryId);
    if (priNode) {
      state.tinyEditor.setContent(priNode.richContent || '');
      state.tinyInitialContent = priNode.richContent || '';
      setOverlayImagesData(priNode.overlayImages || []);
      requestAnimationFrame(function () { renderAll(); });
      setDrawData(priNode.drawData || null);
      _restoreEditorState(priNode);
    }
  } else {
    _removePreviewFromPanel(panelB);
    panelB.appendChild(editorContainer);
    _removePreviewFromPanel(panelA);
    _renderPreviewInPanel(panelA, appState.nodeMap.get(primaryId));
    let secNode = appState.nodeMap.get(secondaryId);
    if (secNode) {
      state.tinyEditor.setContent(secNode.richContent || '');
      state.tinyInitialContent = secNode.richContent || '';
      setOverlayImagesData(secNode.overlayImages || []);
      requestAnimationFrame(function () { renderAll(); });
      setDrawData(secNode.drawData || null);
      _restoreEditorState(secNode);
    }
  }

  showTinyUI();
  panelA.classList.toggle('split-panel-active', targetPanelId === 'A');
  panelB.classList.toggle('split-panel-active', targetPanelId === 'B');
  _updateSplitTitle();
  _updateSplitTOC();

  requestAnimationFrame(function () {
    panelA.style.visibility = '';
    panelB.style.visibility = '';
    state.tinyEditor.focus();
  });
}

let _splitDragBound = false;
export function initSplitScreenDrag() {
  if (_splitDragBound) return;
  _splitDragBound = true;

  let splitDivider = document.getElementById('splitDivider');
  if (!splitDivider) return;

  let swapBtn = document.getElementById('splitSwapBtn');
  if (swapBtn) {
    swapBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      e.preventDefault();
      _swapSplitPanels();
    });
  }

  let dragging = false;
  let dragStartX = 0;
  let dragStartRatio = 0.5;

  splitDivider.addEventListener('mousedown', function (e) {
    if (e.button !== 0) return;
    if (e.target.closest('#splitSwapBtn')) return;
    e.preventDefault();
    dragging = true;
    dragStartX = e.clientX;
    dragStartRatio = appState._splitPrimaryRatio || 0.5;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  window.addEventListener('mousemove', function (e) {
    if (!dragging) return;
    let wrapper = document.getElementById('editPanelsWrapper');
    let panelA = document.getElementById('editPanelA');
    if (!wrapper || !panelA) return;

    let rect = wrapper.getBoundingClientRect();
    let dividerWidth = 6;
    let totalFlex = rect.width - dividerWidth;
    let deltaX = e.clientX - dragStartX;
    let deltaRatio = deltaX / totalFlex;
    let ratio = dragStartRatio + deltaRatio;

    if (ratio <= 0.03) {
      dragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      _switchToSplitNode();
      return;
    }
    if (ratio >= 0.97) {
      dragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      deactivateSplitScreen();
      return;
    }

    ratio = Math.max(0.1, Math.min(0.9, ratio));
    let flexA = ratio;
    let flexB = 1 - ratio;
    panelA.style.flex = flexA.toFixed(4);
    let panelB = document.getElementById('editPanelB');
    if (panelB) panelB.style.flex = flexB.toFixed(4);
    appState._splitPrimaryRatio = ratio;
  });

  window.addEventListener('mouseup', function () {
    if (!dragging) return;
    dragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });

  let panelA = document.getElementById('editPanelA');
  if (panelA) {
    panelA.addEventListener('mousedown', function (e) {
      if (!appState.splitScreenNodeId) return;
      if (appState._activeSplitPanel === 'A') return;
      if (e.target.closest('#splitDivider')) return;
      _switchActivePanel('A');
    });
  }

  let panelB = document.getElementById('editPanelB');
  if (panelB) {
    panelB.addEventListener('mousedown', function (e) {
      if (!appState.splitScreenNodeId) return;
      if (appState._activeSplitPanel === 'B') return;
      if (e.target.closest('#splitDivider')) return;
      _switchActivePanel('B');
    });
  }

  let modalHeader = document.querySelector('.rich-modal-header');
  if (modalHeader) {
    modalHeader.addEventListener('click', function (e) {
      if (!appState.splitScreenNodeId) return;
      if (e.target.closest('.caption-buttons')) return;
      if (e.target.closest('#renameModalTitleBtn')) return;
      if (e.target.tagName === 'INPUT') return;
      let target = appState._activeSplitPanel === 'A' ? 'B' : 'A';
      _switchActivePanel(target);
    });
  }
}
