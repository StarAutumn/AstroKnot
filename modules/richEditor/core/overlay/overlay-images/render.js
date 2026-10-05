// ============================================================
//  overlay/overlay-images/render.js — canvas 渲染与选中管理
//  - ensureOverlay / renderAll：按 blockId 分组把 overlayImages 渲染为
//    .oly-img-item（选中框/缩放/旋转把手、各类型内容分发、事件挂接）
//  - renderMergedContent / transactRender（undo 事务渲染）
//  - 选中管理：deselectImage / selectImage / deleteSelectedImage
//  - 合并绘图：renderItemToCanvas / buildShapeSvg / generateStarPoints
// ============================================================

import { state } from '../../../shared-state.js';
import { renderShapeContent } from '../overlay-shapes.js';
import { renderTextBoxContent, hideTextBoxToolbar } from '../overlay-textbox.js';
import { renderVideoContent } from '../overlay-video.js';
import { renderAudioContent } from '../overlay-audio.js';
import { renderImageContent } from '../overlay-image.js';
import { renderExcelContent } from '../overlay-excel.js';
import { renderChartContent } from '../overlay-chart.js';
import { openAudioEditor } from '../overlay-audio-editor/index.js';
import { openExcelEditor } from '../overlay-excel-editor.js';
import { openChartEditor } from '../overlay-chart-editor.js';
import { renderDocumentContent } from '../overlay-document.js';
import { switchToShapeFormatTab, hideShapeFormatTab } from '../../toolbar-layout.js';
import {
  ensureOverlayBlock, getActiveBlockId, getAllBlockIds,
  getBlockElement, pctToPx, updateAllBlockSizers
} from '../overlay-block.js';
import {
  overlayImages, selectedImageIds, setDragInfo,
  getSelectedImage, findImageDataById, hideContextMenu
} from './share.js';
/**
 * 确保画布块存在，并获取当前活动块的引用。
 * 兼容旧模式：如果页面中仍有 #overlayImageContainer，也会清理它。
 */
function ensureOverlay() {
  // 清理旧的全局 overlay 容器
  let oldContainer = document.getElementById('overlayImageContainer');
  if (oldContainer && oldContainer.parentNode) {
    oldContainer.parentNode.removeChild(oldContainer);
  }

  // 确保至少有一个画布块
  let blockIds = getAllBlockIds();
  if (blockIds.length === 0) {
    // 如果没有块，需要通过 TinyMCE 插入
    // 这里由调用者负责先调用 ensureOverlayBlock
    return;
  }
}

export function renderAll() {
  ensureOverlay();

  let body = document.querySelector('#ckEditorContainer .mce-content-body');
  if (!body) return;

  // 清理旧的全局容器
  let ghostOverlays = document.querySelectorAll('#overlayImageContainer');
  for (let gi = 0; gi < ghostOverlays.length; gi++) {
    if (ghostOverlays[gi].parentNode) {
      ghostOverlays[gi].parentNode.removeChild(ghostOverlays[gi]);
    }
  }

  // 清理所有画布块内的旧 .oly-img-item 和 .tmce-overlay-sizer
  body.querySelectorAll('.tmce-overlay-block .oly-img-item').forEach(function (el) { el.remove(); });
  body.querySelectorAll('.tmce-overlay-block .tmce-overlay-sizer').forEach(function (el) { el.remove(); });

  // 按 blockId 分组渲染
  let blockIds = getAllBlockIds();

  // 兼容：没有 blockId 的元素归入第一个块
  if (blockIds.length === 0 && overlayImages.length > 0) {
    // 没有块但有 overlay 数据，尝试自动创建块
    ensureOverlayBlock(state.tinyEditor);
    blockIds = getAllBlockIds();
    if (blockIds.length === 0) return;
  }

  overlayImages.forEach(function (imgData) {
    let targetBlockId = imgData.blockId || (blockIds.length > 0 ? blockIds[0] : null);
    if (!targetBlockId) return;

    let blockEl = getBlockElement(targetBlockId);
    // 如果 blockId 对应的块已不存在（被删除），重新分配到第一个可用块
    if (!blockEl && blockIds.length > 0) {
      targetBlockId = blockIds[0];
      imgData.blockId = targetBlockId;
      blockEl = getBlockElement(targetBlockId);
    }
    if (!blockEl) return;

    let currentBlockWidth = blockEl.clientWidth || 800;

    // 计算渲染坐标：使用百分比或 _refWidth 缩放
    let displayX, displayW;
    if (imgData.leftPct != null) {
      displayX = pctToPx(imgData.leftPct, currentBlockWidth);
      displayW = pctToPx(imgData.widthPct, currentBlockWidth);
    } else {
      // 旧数据：用绝对 px，根据 _refWidth 缩放
      let refWidth = imgData._refWidth || currentBlockWidth;
      let scaleX = currentBlockWidth / refWidth;
      displayX = (imgData.x || 0) * scaleX;
      displayW = (imgData.width || 200) * scaleX;
    }

    let item = document.createElement('div');
    item.className = 'oly-img-item';
    item.dataset.olyId = imgData.id;
    item.dataset.blockId = targetBlockId;
    item.style.cssText =
      'position:absolute;' +
      'left:' + displayX + 'px;' +
      'top:' + imgData.y + 'px;' +
      'width:' + displayW + 'px;' +
      'height:' + imgData.height + 'px;' +
      'z-index:' + imgData.zIndex + ';' +
      'cursor:move;' +
      'box-sizing:content-box;';

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

    if (selectedImageIds.has(imgData.id)) {
      let isEditingTextBox = imgData.type === 'textbox' && imgData._editing;
      item.style.outline = isEditingTextBox ? '3px solid #00e5ff' : '2px solid #00ffff';
      item.style.outlineOffset = '1px';
      if (isEditingTextBox) {
        item.style.boxShadow = '0 0 12px rgba(0,229,255,0.25)';
      }

      let handles = isEditingTextBox ? [] : ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'];

      handles.forEach(function (handleId) {
        let handle = document.createElement('div');
        handle.className = 'oly-resize-handle oly-resize-' + handleId;
        handle.style.cssText =
          'position:absolute;width:12px;height:12px;' +
          'background:#2c6e7e;border:1px solid #aef0ff;border-radius:50%;z-index:10;';

        if (handleId === 'nw' || handleId === 'n' || handleId === 'ne') handle.style.top = '-6px';
        if (handleId === 'sw' || handleId === 's' || handleId === 'se') handle.style.bottom = '-6px';
        if (handleId === 'nw' || handleId === 'w' || handleId === 'sw') handle.style.left = '-6px';
        if (handleId === 'ne' || handleId === 'e' || handleId === 'se') handle.style.right = '-6px';
        if (handleId === 'n' || handleId === 's') { handle.style.left = '50%'; handle.style.marginLeft = '-6px'; }
        if (handleId === 'w' || handleId === 'e') { handle.style.top = '50%'; handle.style.marginTop = '-6px'; }

        if (handleId === 'nw') handle.style.cursor = 'nw-resize';
        else if (handleId === 'n') handle.style.cursor = 'n-resize';
        else if (handleId === 'ne') handle.style.cursor = 'ne-resize';
        else if (handleId === 'w') handle.style.cursor = 'w-resize';
        else if (handleId === 'e') handle.style.cursor = 'e-resize';
        else if (handleId === 'sw') handle.style.cursor = 'sw-resize';
        else if (handleId === 's') handle.style.cursor = 's-resize';
        else if (handleId === 'se') handle.style.cursor = 'se-resize';
        item.appendChild(handle);
      });

      if (!isEditingTextBox) {
        let rotHandle = document.createElement('div');
        rotHandle.className = 'oly-rotate-handle';
        rotHandle.style.cssText =
          'position:absolute;top:-26px;left:50%;margin-left:-6px;' +
          'width:12px;height:12px;' +
          'background:#00e5ff;border:2px solid #aef0ff;' +
          'border-radius:50%;z-index:10;cursor:grab;';
        rotHandle.title = '旋转';
        let rotLine = document.createElement('div');
        rotLine.className = 'oly-rotate-line';
        rotLine.style.cssText =
          'position:absolute;top:-14px;left:50%;' +
          'width:1px;height:10px;' +
          'background:#00e5ff;z-index:9;';
        item.appendChild(rotLine);
        item.appendChild(rotHandle);
      }
    }

    if (imgData.type === 'shape') {
      renderShapeContent(item, imgData);
    } else if (imgData.type === 'textbox') {
      renderTextBoxContent(item, imgData);
    } else if (imgData.type === 'video') {
      renderVideoContent(item, imgData);
    } else if (imgData.type === 'audio') {
      renderAudioContent(item, imgData);
    } else if (imgData.type === 'excel') {
      renderExcelContent(item, imgData);
    } else if (imgData.type === 'chart') {
      renderChartContent(item, imgData);
    } else if (imgData.type === 'document') {
      renderDocumentContent(item, imgData);
    } else if (imgData.type === 'merged') {
      renderMergedContent(item, imgData);
    } else {
      renderImageContent(item, imgData);
    }

    item.addEventListener('mousedown', function (e) {
      if (e.target.classList.contains('oly-resize-handle')) return;
      if (imgData.type === 'textbox' && imgData._editing) {
        return;
      }
      // 右键点击已多选的元素时，保持多选状态不变（让 contextmenu 处理）
      if (e.button === 2 && selectedImageIds.size > 1 && selectedImageIds.has(imgData.id)) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      selectImage(imgData.id, e.ctrlKey || e.metaKey);
      // 获取所在画布块的 rect
      let blockEl = item.closest('.tmce-overlay-block');
      let overlayRect = blockEl ? blockEl.getBoundingClientRect() : { left: 0, top: 0 };
      setDragInfo({
        imgData: imgData,
        startX: e.clientX,
        startY: e.clientY,
        origX: imgData.x,
        origY: imgData.y,
        overlayLeft: overlayRect.left,
        overlayTop: overlayRect.top
      });
    });

    if (imgData.type === 'textbox') {
      item.addEventListener('dblclick', function (e) {
        e.preventDefault();
        e.stopPropagation();
        selectImage(imgData.id);
        imgData._editing = true;
        renderAll();
        setTimeout(function () {
          let blockEl = getBlockElement(imgData.blockId || getActiveBlockId());
          let editable = blockEl && blockEl.querySelector('[data-oly-id="' + imgData.id + '"] [contenteditable]');
          if (editable) editable.focus();
        }, 50);
      });
    }

    if (imgData.type === 'audio') {
      item.addEventListener('dblclick', function (e) {
        e.preventDefault();
        e.stopPropagation();
        openAudioEditor(imgData);
      });
    }

    if (imgData.type === 'excel') {
      item.addEventListener('dblclick', function (e) {
        e.preventDefault();
        e.stopPropagation();
        openExcelEditor(imgData);
      });
    }

    if (imgData.type === 'chart') {
      item.addEventListener('dblclick', function (e) {
        e.preventDefault();
        e.stopPropagation();
        openChartEditor(imgData);
      });
    }

    blockEl.appendChild(item);
  });

  // 更新所有块的 sizer 高度
  updateAllBlockSizers();
}

// ── 渲染合并后的内容（作为图片展示） ──
function renderMergedContent(item, imgData) {
  if (!imgData.mergeChildren || !imgData.src) return;
  let img = document.createElement('img');
  img.src = imgData.src;
  img.style.cssText = 'width:100%;height:100%;display:block;pointer-events:none;';
  item.appendChild(img);
}

export function transactRender() {
  if (state.tinyEditor && state.tinyEditor.undoManager) {
    var preState = JSON.parse(JSON.stringify(overlayImages));
    renderAll();
    var postState = JSON.parse(JSON.stringify(overlayImages));
    state.tinyEditor.undoManager.add({
      undo: function () {
        overlayImages.length = 0;
        Array.prototype.push.apply(overlayImages, JSON.parse(JSON.stringify(preState)));
        selectedImageIds.clear();
        renderAll();
      },
      redo: function () {
        overlayImages.length = 0;
        Array.prototype.push.apply(overlayImages, JSON.parse(JSON.stringify(postState)));
        selectedImageIds.clear();
        renderAll();
      }
    });
  } else {
    renderAll();
  }
}

function deselectImage() {
  if (selectedImageIds.size === 0) return;
  selectedImageIds.clear();
  hideShapeFormatTab();
  renderAll();
}

export function selectImage(id, isCtrlKey) {
  if (!id) {
    deselectImage();
    return;
  }
  let prev = getSelectedImage();
  if (prev && prev.type === 'textbox' && prev._editing) {
    prev._editing = false;
    hideTextBoxToolbar();
  }

  if (isCtrlKey) {
    if (selectedImageIds.has(id)) {
      selectedImageIds.delete(id);
    } else {
      selectedImageIds.add(id);
    }
  } else {
    selectedImageIds.clear();
    selectedImageIds.add(id);
  }

  renderAll();
  hideContextMenu();

  // 选中形状/文本框时切换到图形格式 tab
  // 但如果 textbox 正在编辑文字，则不切换，让用户能使用开始工具栏编辑文字
  let hasEditingTextbox = Array.from(selectedImageIds).some(function(sid) {
    let sel = findImageDataById(sid);
    return sel && sel.type === 'textbox' && sel._editing === true;
  });

  if (hasEditingTextbox) {
    // textbox 正在编辑文字，不切换tab，保持当前tab让用户使用文字编辑工具
    return;
  }

  let hasShapeOrTextbox = Array.from(selectedImageIds).some(function(sid) {
    let sel = findImageDataById(sid);
    return sel && (sel.type === 'shape' || sel.type === 'textbox');
  });

  if (hasShapeOrTextbox) {
    switchToShapeFormatTab();
  } else {
    hideShapeFormatTab();
  }
}

export function deleteSelectedImage() {
  if (selectedImageIds.size === 0) return;
  for (let i = overlayImages.length - 1; i >= 0; i--) {
    if (selectedImageIds.has(overlayImages[i].id)) {
      overlayImages.splice(i, 1);
    }
  }
  deselectImage();
  transactRender();
}

// ── 将单个元素绘制到 canvas ──
function renderItemToCanvas(ctx, item, ox, oy) {
  return new Promise(function (resolve) {
    if (item.type === 'image') {
      let img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        ctx.save();
        let iw = item.width || img.width;
        let ih = item.height || img.height;
        if (item.rotation) {
          let cx = ox + iw / 2;
          let cy = oy + ih / 2;
          ctx.translate(cx, cy);
          ctx.rotate(item.rotation * Math.PI / 180);
          ctx.drawImage(img, -iw / 2, -ih / 2, iw, ih);
        } else {
          ctx.drawImage(img, ox, oy, iw, ih);
        }
        ctx.restore();
        resolve();
      };
      img.onerror = function () { resolve(); };
      img.src = item.src;
    } else if (item.type === 'shape') {
      // 生成 SVG 字符串渲染形状
      let svgStr = buildShapeSvg(item);
      let blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
      let url = URL.createObjectURL(blob);
      let img = new Image();
      img.onload = function () {
        ctx.drawImage(img, ox, oy, item.width, item.height);
        URL.revokeObjectURL(url);
        resolve();
      };
      img.onerror = function () { resolve(); };
      img.src = url;
    } else if (item.type === 'textbox') {
      // 直接在 canvas 上绘制文字
      ctx.save();
      let fontSize = item.fontSize || 16;
      ctx.font = (item.bold ? 'bold ' : '') + (item.italic ? 'italic ' : '') + fontSize + 'px ' + (item.fontFamily || 'Microsoft YaHei, sans-serif');
      ctx.fillStyle = item.textColor || item.color || '#c8e6ff';
      ctx.textAlign = item.textAlign || 'left';
      ctx.textBaseline = 'top';
      let lines = (item.html || item.text || '').split(/<br\s*\/?>/i);
      let lineH = (item.lineHeight || 1.5) * fontSize;
      let tx = item.textAlign === 'center' ? ox + item.width / 2 : (item.textAlign === 'right' ? ox + item.width : ox + 4);
      let ty = oy + 4;
      // 背景
      if (item.backgroundColor && item.backgroundColor !== 'transparent') {
        ctx.fillStyle = item.backgroundColor;
        ctx.fillRect(ox, oy, item.width, item.height);
        ctx.fillStyle = item.textColor || item.color || '#c8e6ff';
      }
      lines.forEach(function (line) {
        let text = line.replace(/<[^>]+>/g, '');
        if (item.underline && text) {
          let tw = ctx.measureText(text).width;
          ctx.fillText(text, tx, ty);
          let uy = ty + fontSize * 0.15;
          ctx.beginPath();
          ctx.moveTo(tx, uy);
          ctx.lineTo(tx + tw, uy);
          ctx.stroke();
        } else {
          ctx.fillText(text, tx, ty);
        }
        ty += lineH;
      });
      ctx.restore();
      resolve();
    } else {
      // 其他类型（video/audio/excel）画占位符
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(ox, oy, item.width, item.height);
      ctx.strokeStyle = '#2c6e7e';
      ctx.lineWidth = 1;
      ctx.strokeRect(ox, oy, item.width, item.height);
      ctx.fillStyle = '#5a8aaa';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.type, ox + item.width / 2, oy + item.height / 2);
      resolve();
    }
  });
}

// ── 生成形状 SVG 字符串 ──
function buildShapeSvg(item) {
  let w = item.width || 100;
  let h = item.height || 100;
  let sw = item.strokeWidth || 2;
  let fillColor = item.fillColor || '#1a3a4a';
  let strokeColor = item.strokeColor || '#2c6e7e';
  let opacity = item.opacity != null ? item.opacity : 1;
  let m = sw / 2;

  // 基础形状路径
  function polyPoints(pts) {
    return pts.map(function(p) { return p[0] + ',' + p[1]; }).join(' ');
  }

  let d = '';
  let tag = 'rect';
  let attrs = {};

  switch (item.shapeType) {
    case 'rect': case 'flowProcess': case 'flowCard': case 'flowInternalStorage': case 'plaque':
      tag = 'rect'; attrs = { x: sw, y: sw, width: w - sw * 2, height: h - sw * 2 }; break;
    case 'roundedRect': case 'flowTerminator': case 'flowStoredData': case 'calloutRounded':
      tag = 'rect'; attrs = { x: sw, y: sw, width: w - sw * 2, height: h - sw * 2, rx: Math.min(w, h) * 0.15, ry: Math.min(w, h) * 0.15 }; break;
    case 'ellipse': case 'calloutOval':
      tag = 'ellipse'; attrs = { cx: w / 2, cy: h / 2, rx: w / 2 - sw, ry: h / 2 - sw }; break;
    case 'circle': case 'flowOr':
      tag = 'ellipse'; let r = Math.min(w, h) / 2 - sw; attrs = { cx: w / 2, cy: h / 2, rx: r, ry: r }; break;
    case 'triangle': case 'flowMerge':
      tag = 'polygon'; attrs = { points: polyPoints([[w / 2, m], [w - m, h - m], [m, h - m]]) }; break;
    case 'diamond': case 'flowDecision':
      tag = 'polygon'; attrs = { points: polyPoints([[w / 2, m], [w - m, h / 2], [w / 2, h - m], [m, h / 2]]) }; break;
    case 'star':
      tag = 'polygon'; attrs = { points: generateStarPoints(5, w, h, sw) }; break;
    case 'line':
      tag = 'line'; attrs = { x1: m, y1: m, x2: w - m, y2: h - m }; break;
    case 'arrow':
      tag = 'line'; attrs = { x1: m, y1: m, x2: w - m, y2: h - m, 'marker-end': 'url(#arrow)' }; break;
    default:
      tag = 'rect'; attrs = { x: sw, y: sw, width: w - sw * 2, height: h - sw * 2 }; break;
  }

  let attrStr = Object.keys(attrs).map(function(k) { return k + '="' + attrs[k] + '"'; }).join(' ');

  let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' +
    '<defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 Z" fill="' + strokeColor + '"/></marker></defs>' +
    '<' + tag + ' ' + attrStr + ' fill="' + fillColor + '" stroke="' + strokeColor + '" stroke-width="' + sw + '" opacity="' + opacity + '"/>' +
    '</svg>';
  return svg;
}

function generateStarPoints(n, w, h, sw) {
  let cx = w / 2, cy = h / 2;
  let outerR = Math.min(w, h) / 2 - sw;
  let innerR = outerR * 0.4;
  let pts = [];
  for (let i = 0; i < n * 2; i++) {
    let angle = (i * Math.PI / n) - Math.PI / 2;
    let r = i % 2 === 0 ? outerR : innerR;
    pts.push((cx + r * Math.cos(angle)).toFixed(1) + ',' + (cy + r * Math.sin(angle)).toFixed(1));
  }
  return pts.join(' ');
}

export { ensureOverlay, deselectImage, renderItemToCanvas };
