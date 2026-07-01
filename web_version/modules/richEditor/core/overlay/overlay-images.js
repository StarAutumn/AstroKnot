import { state } from '../../shared-state.js';
import { renderShapeContent, getShapeCategory } from './overlay-shapes.js';
import { renderTextBoxContent, hideTextBoxToolbar, enterTextBoxEdit } from './overlay-textbox.js';
import { renderVideoContent } from './overlay-video.js';
import { renderAudioContent } from './overlay-audio.js';
import { renderImageContent } from './overlay-image.js';
import { renderExcelContent } from './overlay-excel.js';
import { renderChartContent } from './overlay-chart.js';
import { openAudioEditor } from './overlay-audio-editor.js';
import { openExcelEditor } from './overlay-excel-editor.js';
import { openChartEditor } from './overlay-chart-editor.js';
import { renderSlideshowContent, openSlideshowEditor } from './overlay-slideshow.js';
import { openVideoEditor } from '../video-editor.js';
import { switchToShapeFormatTab, hideShapeFormatTab } from '../toolbar-layout.js';
import {
  ensureOverlayBlock, getActiveBlockId, getAllBlockIds,
  getBlockElement, getBlockWidth, pctToPx, pxToPct,
  updateBlockSizer, updateAllBlockSizers, setupBlockResizeObservers
} from './overlay-block.js';

export { SHAPE_CATEGORIES, SHAPE_LABELS, buildShapeThumbnail } from './overlay-shapes.js';

let overlayImages = [];
let nextZIndex = 100;
let selectedImageIds = new Set();
let ctxMenuEl = null;
let dragInfo = null;

function deselectImage() {
  if (selectedImageIds.size === 0) return;
  selectedImageIds.clear();
  hideShapeFormatTab();
  renderAll();
}
let _preDragState = null;

export function getNextZIndex() {
  return nextZIndex++;
}

export function resetZIndex(val) {
  nextZIndex = val || 100;
}
let resizeInfo = null;

export function getInsertY() {
  // 返回当前块内的插入 Y 坐标
  let blockId = getActiveBlockId();
  if (blockId) {
    let maxY = 20;
    overlayImages.forEach(function (item) {
      if (item.blockId === blockId) {
        let bottom = (item.y || 0) + (item.height || 0);
        if (bottom > maxY) maxY = bottom;
      }
    });
    return maxY + 10;
  }
  return 20;
}

export function getInsertX() {
  // 返回当前块内的居中 X 坐标（px）
  let blockId = getActiveBlockId();
  if (blockId) {
    let w = getBlockWidth(blockId);
    return w / 2;
  }
  return 400;
}

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

export function clearOverlayImages() {
  hideTextBoxToolbar();
  overlayImages = [];
  selectedImageIds.clear();
  nextZIndex = 100;
  // 清理旧容器
  let oldContainer = document.getElementById('overlayImageContainer');
  if (oldContainer && oldContainer.parentNode) {
    oldContainer.parentNode.removeChild(oldContainer);
  }
  // 清理所有画布块内的 overlay 元素
  let body = document.querySelector('#ckEditorContainer .mce-content-body');
  if (body) {
    body.querySelectorAll('.tmce-overlay-block .oly-img-item').forEach(function (el) { el.remove(); });
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
    // 没有块但有 overlay 数据，跳过（需要先创建块）
    return;
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
    } else if (imgData.type === 'slideshow') {
      renderSlideshowContent(item, imgData);
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
      dragInfo = {
        imgData: imgData,
        startX: e.clientX,
        startY: e.clientY,
        origX: imgData.x,
        origY: imgData.y,
        overlayLeft: overlayRect.left,
        overlayTop: overlayRect.top
      };
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

function rgbaToHex(color) {
  if (!color || color === 'transparent') return '#2c6e7e';
  if (color.startsWith('#')) return color;
  if (color.startsWith('rgb')) {
    let m = color.match(/[\d.]+/g);
    if (m && m.length >= 3) {
      return '#' + m.slice(0, 3).map(function (x) {
        let hex = parseInt(x).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
      }).join('');
    }
  }
  return '#2c6e7e';
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

export function getSelectedImage() {
  if (selectedImageIds.size === 0) return null;
  let firstId = selectedImageIds.values().next().value;
  for (let i = 0; i < overlayImages.length; i++) {
    if (overlayImages[i].id === firstId) return overlayImages[i];
  }
  return null;
}

export function getSelectedImages() {
  return overlayImages.filter(function(img) {
    return selectedImageIds.has(img.id);
  });
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

export function getOverlayImagesData() {
  return overlayImages.map(function (item) {
    let base = {
      type: item.type || 'image',
      id: item.id,
      blockId: item.blockId || null,
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
      zIndex: item.zIndex
    };
    // 百分比坐标
    if (item.leftPct != null) base.leftPct = item.leftPct;
    if (item.widthPct != null) base.widthPct = item.widthPct;
    if (item._refWidth != null) base._refWidth = item._refWidth;
    if (item.rotation) base.rotation = item.rotation;
    if (item.flipH) base.flipH = item.flipH;
    if (item.flipV) base.flipV = item.flipV;
    if (item.shadow) base.shadow = item.shadow;
    if (item.type === 'shape') {
      base.shapeType = item.shapeType;
      base.fillColor = item.fillColor;
      base.strokeColor = item.strokeColor;
      base.strokeWidth = item.strokeWidth;
      base.opacity = item.opacity;
    } else if (item.type === 'textbox') {
      base.html = item.html;
      base.text = item.text;
      base.fontSize = item.fontSize;
      base.fontFamily = item.fontFamily;
      base.color = item.color;
      base.backgroundColor = item.backgroundColor;
      base.textAlign = item.textAlign;
      base.bold = item.bold;
      base.italic = item.italic;
      base.underline = item.underline;
      base.strikethrough = item.strikethrough;
      base.lineHeight = item.lineHeight;
      if (item.textColor) base.textColor = item.textColor;
      if (item.textShadow) base.textShadow = item.textShadow;
      if (item.textGradient) base.textGradient = item.textGradient;
    } else if (item.type === 'video') {
      base.src = item.src;
      base.srcType = item.srcType;
      base.fileName = item.fileName;
      base.loop = item.loop;
      base.muted = item.muted;
      base.volume = item.volume;
    } else if (item.type === 'audio') {
      base.src = item.src;
      base.srcType = item.srcType;
      base.fileName = item.fileName;
      base.loop = item.loop;
      base.muted = item.muted;
      base.volume = item.volume;
      if (item.eqLow != null) base.eqLow = item.eqLow;
      if (item.eqMid != null) base.eqMid = item.eqMid;
      if (item.eqHigh != null) base.eqHigh = item.eqHigh;
      if (item.fadeInDur != null) base.fadeInDur = item.fadeInDur;
      if (item.fadeOutDur != null) base.fadeOutDur = item.fadeOutDur;
      if (item.markers && item.markers.length > 0) base.markers = item.markers;
      if (item.compressorThreshold != null) base.compressorThreshold = item.compressorThreshold;
      if (item.compressorRatio != null) base.compressorRatio = item.compressorRatio;
      if (item.compEnabled != null) base.compEnabled = item.compEnabled;
      if (item.reverbMix != null) base.reverbMix = item.reverbMix;
      if (item.reverbDecay != null) base.reverbDecay = item.reverbDecay;
      if (item.reverbEnabled != null) base.reverbEnabled = item.reverbEnabled;
      if (item.waveformStyle != null) base.waveformStyle = item.waveformStyle;
      if (item.playbackSpeed != null) base.playbackSpeed = item.playbackSpeed;
      if (item.pitchShift != null) base.pitchShift = item.pitchShift;
    } else if (item.type === 'excel') {
      if (item.univerSnapshot) base.univerSnapshot = JSON.parse(JSON.stringify(item.univerSnapshot));
      if (item.defaultData) base.defaultData = JSON.parse(JSON.stringify(item.defaultData));
    } else if (item.type === 'chart') {
      base.chartType = item.chartType || 'bar';
      base.chartTitle = item.chartTitle || '';
      if (item.sourceExcelId) base.sourceExcelId = item.sourceExcelId;
      if (item.dataRange) base.dataRange = item.dataRange;
      if (item.chartData) base.chartData = item.chartData;
      if (item.echartsOption) base.echartsOption = item.echartsOption;
      if (item.chartStyle) base.chartStyle = item.chartStyle;
    } else if (item.type === 'slideshow') {
      base.title = item.title || '';
      base.effect = item.effect || 'slide';
      base.autoplay = item.autoplay || false;
      base.autoplayDelay = item.autoplayDelay || 3000;
      base.loop = item.loop !== false;
      base.showNavigation = item.showNavigation !== false;
      base.showPagination = item.showPagination !== false;
      base.speed = item.speed || 500;
      if (item.slides) base.slides = item.slides;
    } else {
      base.src = item.src;
      // 图片高级格式
      if (item.fmtBorderWidth) base.fmtBorderWidth = item.fmtBorderWidth;
      if (item.fmtBorderColor) base.fmtBorderColor = item.fmtBorderColor;
      if (item.fmtBorderStyle) base.fmtBorderStyle = item.fmtBorderStyle;
      if (item.fmtShadowX) base.fmtShadowX = item.fmtShadowX;
      if (item.fmtShadowY) base.fmtShadowY = item.fmtShadowY;
      if (item.fmtShadowBlur) base.fmtShadowBlur = item.fmtShadowBlur;
      if (item.fmtShadowColor) base.fmtShadowColor = item.fmtShadowColor;
      if (item.fmtShadowOpacity != null) base.fmtShadowOpacity = item.fmtShadowOpacity;
      if (item.fmtGlowSize) base.fmtGlowSize = item.fmtGlowSize;
      if (item.fmtGlowColor) base.fmtGlowColor = item.fmtGlowColor;
      if (item.fmtGlowOpacity != null) base.fmtGlowOpacity = item.fmtGlowOpacity;
      if (item.fmtSoftEdge) base.fmtSoftEdge = item.fmtSoftEdge;
      if (item.fmtReflectOpacity) base.fmtReflectOpacity = item.fmtReflectOpacity;
      if (item.fmtReflectSize) base.fmtReflectSize = item.fmtReflectSize;
      if (item.fmtReflectDistance) base.fmtReflectDistance = item.fmtReflectDistance;
      if (item.adjBrightness != null && item.adjBrightness !== 100) base.adjBrightness = item.adjBrightness;
      if (item.adjContrast != null && item.adjContrast !== 100) base.adjContrast = item.adjContrast;
      if (item.adjSaturation != null && item.adjSaturation !== 100) base.adjSaturation = item.adjSaturation;
      if (item.adjHue != null && item.adjHue !== 0) base.adjHue = item.adjHue;
      if (item.adjBlur != null && item.adjBlur !== 0) base.adjBlur = item.adjBlur;
      if (item.adjOpacity != null && item.adjOpacity !== 100) base.adjOpacity = item.adjOpacity;
    }
    if (item.type === 'merged') {
      base.mergeChildren = item.mergeChildren;
    }
    return base;
  });
}

export function setOverlayImagesData(data) {
  overlayImages = [];
  selectedImageIds.clear();
  nextZIndex = 100;
  if (data && data.length > 0) {
    overlayImages = data.map(function (d) {
      if (d.zIndex >= nextZIndex) nextZIndex = d.zIndex + 1;
      let item = {
        type: d.type || 'image',
        id: d.id || ('oly-img-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6)),
        blockId: d.blockId || null,
        x: d.x || 0,
        y: d.y || 0,
        width: d.width || 200,
        height: d.height || 150,
        zIndex: d.zIndex || nextZIndex++
      };
      // 百分比坐标
      if (d.leftPct != null) item.leftPct = d.leftPct;
      if (d.widthPct != null) item.widthPct = d.widthPct;
      if (d._refWidth != null) item._refWidth = d._refWidth;
      if (d.rotation) item.rotation = d.rotation;
      if (d.flipH) item.flipH = d.flipH;
      if (d.flipV) item.flipV = d.flipV;
      if (d.shadow) item.shadow = d.shadow;
      if (item.type === 'shape') {
        item.shapeType = d.shapeType || 'rect';
        item.category = d.category || getShapeCategory(item.shapeType);
        if (item.category === 'line' && d.fillColor != null && d.fillColor !== 'none') {
          item.fillColor = 'none';
        } else {
          item.fillColor = d.fillColor || DEFAULT_COLORS.fill;
        }
        item.strokeColor = d.strokeColor || DEFAULT_COLORS.stroke;
        item.strokeWidth = d.strokeWidth || 2;
        item.opacity = d.opacity || 1;
      } else if (item.type === 'textbox') {
        item.html = d.html || d.text || '';
        item.text = d.text || '双击输入文字';
        item.fontSize = d.fontSize || 16;
        item.fontFamily = d.fontFamily || 'Microsoft YaHei, sans-serif';
        item.color = d.color || DEFAULT_COLORS.text;
        item.backgroundColor = d.backgroundColor || 'transparent';
        item.textAlign = d.textAlign || 'left';
        item.bold = d.bold || false;
        item.italic = d.italic || false;
        item.underline = d.underline || false;
        item.strikethrough = d.strikethrough || false;
        item.lineHeight = d.lineHeight || 1.5;
        if (d.textColor) item.textColor = d.textColor;
        if (d.textShadow) item.textShadow = d.textShadow;
        if (d.textGradient) item.textGradient = d.textGradient;
      } else if (item.type === 'video') {
        item.src = d.src;
        item.srcType = d.srcType || 'url';
        item.fileName = d.fileName || '';
        item.loop = d.loop || false;
        item.muted = d.muted || false;
        item.volume = d.volume != null ? d.volume : 1;
      } else if (item.type === 'audio') {
        item.src = d.src;
        item.srcType = d.srcType || 'url';
        item.fileName = d.fileName || '';
        item.loop = d.loop || false;
        item.muted = d.muted || false;
        item.volume = d.volume != null ? d.volume : 1;
        item.eqLow = d.eqLow || 0;
        item.eqMid = d.eqMid || 0;
        item.eqHigh = d.eqHigh || 0;
        item.fadeInDur = d.fadeInDur || 0;
        item.fadeOutDur = d.fadeOutDur || 0;
        item.markers = (d.markers || []).map(function (m) { return Object.assign({}, m); });
        item.compressorThreshold = d.compressorThreshold != null ? d.compressorThreshold : -24;
        item.compressorRatio = d.compressorRatio != null ? d.compressorRatio : 12;
        item.compEnabled = d.compEnabled || false;
        item.reverbMix = d.reverbMix != null ? d.reverbMix : 0;
        item.reverbDecay = d.reverbDecay != null ? d.reverbDecay : 2;
        item.reverbEnabled = d.reverbEnabled || false;
        item.waveformStyle = d.waveformStyle || 'fill';
        item.playbackSpeed = d.playbackSpeed || 1;
        item.pitchShift = d.pitchShift || 0;
      } else if (item.type === 'excel') {
        item.univerSnapshot = d.univerSnapshot ? JSON.parse(JSON.stringify(d.univerSnapshot)) : null;
        item.defaultData = d.defaultData ? JSON.parse(JSON.stringify(d.defaultData)) : null;
      } else if (item.type === 'chart') {
        item.chartType = d.chartType || 'bar';
        item.chartTitle = d.chartTitle || '';
        item.sourceExcelId = d.sourceExcelId || '';
        item.dataRange = d.dataRange || { startRow: 0, endRow: 4, startCol: 0, endCol: 3 };
        item.chartData = d.chartData || { categories: ['类别1', '类别2', '类别3', '类别4'], series: [{ name: '系列1', data: [120, 200, 150, 80] }, { name: '系列2', data: [90, 150, 180, 120] }] };
        item.echartsOption = d.echartsOption || null;
        if (d.chartStyle) item.chartStyle = d.chartStyle;
      } else if (item.type === 'slideshow') {
        item.title = d.title || '';
        item.effect = d.effect || 'slide';
        item.autoplay = d.autoplay || false;
        item.autoplayDelay = d.autoplayDelay || 3000;
        item.loop = d.loop !== false;
        item.showNavigation = d.showNavigation !== false;
        item.showPagination = d.showPagination !== false;
        item.speed = d.speed || 500;
        if (d.slides && Array.isArray(d.slides) && d.slides.length > 0) {
          item.slides = d.slides;
        } else {
          item.slides = [
            { id: 'slide-default-0', title: '第 1 页', content: '<p style="text-align:center;color:#aaa;font-size:16px;padding-top:40%;">第 1 页</p>', bgColor: '#1a1a2e', bgImage: '' },
            { id: 'slide-default-1', title: '第 2 页', content: '<p style="text-align:center;color:#aaa;font-size:16px;padding-top:40%;">第 2 页</p>', bgColor: '#1a1a2e', bgImage: '' },
            { id: 'slide-default-2', title: '第 3 页', content: '<p style="text-align:center;color:#aaa;font-size:16px;padding-top:40%;">第 3 页</p>', bgColor: '#1a1a2e', bgImage: '' }
          ];
        }
      } else if (item.type === 'merged') {
        item.mergeChildren = (d.mergeChildren || []).slice();
        item.src = d.src;
      } else {
        item.src = d.src;
        if (d.fmtBorderWidth) item.fmtBorderWidth = d.fmtBorderWidth;
        if (d.fmtBorderColor) item.fmtBorderColor = d.fmtBorderColor;
        if (d.fmtBorderStyle) item.fmtBorderStyle = d.fmtBorderStyle;
        if (d.fmtShadowX) item.fmtShadowX = d.fmtShadowX;
        if (d.fmtShadowY) item.fmtShadowY = d.fmtShadowY;
        if (d.fmtShadowBlur) item.fmtShadowBlur = d.fmtShadowBlur;
        if (d.fmtShadowColor) item.fmtShadowColor = d.fmtShadowColor;
        if (d.fmtShadowOpacity != null) item.fmtShadowOpacity = d.fmtShadowOpacity;
        if (d.fmtGlowSize) item.fmtGlowSize = d.fmtGlowSize;
        if (d.fmtGlowColor) item.fmtGlowColor = d.fmtGlowColor;
        if (d.fmtGlowOpacity != null) item.fmtGlowOpacity = d.fmtGlowOpacity;
        if (d.fmtSoftEdge) item.fmtSoftEdge = d.fmtSoftEdge;
        if (d.fmtReflectOpacity) item.fmtReflectOpacity = d.fmtReflectOpacity;
        if (d.fmtReflectSize) item.fmtReflectSize = d.fmtReflectSize;
        if (d.fmtReflectDistance) item.fmtReflectDistance = d.fmtReflectDistance;
        if (d.adjBrightness != null) item.adjBrightness = d.adjBrightness;
        if (d.adjContrast != null) item.adjContrast = d.adjContrast;
        if (d.adjSaturation != null) item.adjSaturation = d.adjSaturation;
        if (d.adjHue != null) item.adjHue = d.adjHue;
        if (d.adjBlur != null) item.adjBlur = d.adjBlur;
        if (d.adjOpacity != null) item.adjOpacity = d.adjOpacity;
      }
      return item;
    });
  }
  // 为没有 blockId 的旧数据自动分配 blockId
  let blockIds = getAllBlockIds();

  // 如果有 overlay 数据但没有画布块，自动创建
  if (blockIds.length === 0 && overlayImages.length > 0) {
    ensureOverlayBlock(null);
    blockIds = getAllBlockIds();
  }

  overlayImages.forEach(function (item) {
    // 如果 blockId 对应的块已不存在，重新分配
    if (item.blockId && !getBlockElement(item.blockId)) {
      item.blockId = null;
    }
    if (!item.blockId) {
      if (blockIds.length > 0) {
        item.blockId = blockIds[0];
      }
      // 如果旧数据没有百分比坐标，根据当前块宽度计算
      if (item.leftPct == null && item.x != null) {
        let bw = getBlockWidth(item.blockId || (blockIds.length > 0 ? blockIds[0] : null)) || 800;
        item.leftPct = pxToPct(item.x, bw);
        item.widthPct = pxToPct(item.width, bw);
        item._refWidth = bw;
      }
    }
  });
  // 延迟渲染，确保 TinyMCE setContent 后画布块 DOM 已就绪
  requestAnimationFrame(function () {
    renderAll();
    setupBlockResizeObservers();
  });
}

// ── 多选右键菜单 ──
function showMultiSelectContextMenu(x, y) {
  hideContextMenu();
  ctxMenuEl = document.createElement('div');
  ctxMenuEl.id = 'olyContextMenu';
  ctxMenuEl.style.cssText =
    'position:fixed;z-index:99999;background:#0d1f2b;border:1px solid #2c6e7e;' +
    'border-radius:8px;padding:4px 0;box-shadow:0 4px 16px rgba(0,0,0,0.6);' +
    'min-width:180px;left:0px;top:0px;visibility:hidden;';

  let selItems = getSelectedImages();

  let items = [
    { label: '━━ 多选操作 (' + selItems.length + ' 项) ━━', action: null, separator: true },
    { label: '📦 合并为一张图片', action: function () { mergeSelectedItems(); } },
    { label: '━━ 排列对齐 ━━', action: null, separator: true },
    { label: '⬅ 左对齐', action: function () { alignItems('left'); } },
    { label: '➡ 右对齐', action: function () { alignItems('right'); } },
    { label: '↔ 水平居中', action: function () { alignItems('hcenter'); } },
    { label: '⇔ 等距水平排列', action: function () { alignItems('hdistribute'); } },
    { label: '⬆ 上对齐', action: function () { alignItems('top'); } },
    { label: '⬇ 下对齐', action: function () { alignItems('bottom'); } },
    { label: '⇕ 等距竖直排列', action: function () { alignItems('vdistribute'); } }
  ];

  items = items.concat([
    { label: '━━ 图层顺序 ━━', action: null, separator: true },
    { label: '置于顶层', action: function () { multiLayerAction('front'); } },
    { label: '置于底层', action: function () { multiLayerAction('back'); } },
    { label: '━━ 删除 ━━', action: null, separator: true },
    { label: '🗑 批量删除', action: function () { deleteMultiSelected(); } }
  ]);

  items.forEach(function (item) {
    let div = document.createElement('div');
    div.textContent = item.label;
    div.style.cssText =
      'padding:6px 16px;cursor:pointer;color:#c8e6ff;font-size:13px;' +
      'white-space:nowrap;';
    if (item.separator) {
      div.style.cssText =
        'padding:6px 16px;color:#5a8aaa;font-size:11px;' +
        'white-space:nowrap;cursor:default;border-top:1px solid #1a3a44;';
    }
    if (!item.separator && item.action) {
      div.addEventListener('mouseenter', function () { div.style.background = '#1c525a'; });
      div.addEventListener('mouseleave', function () { div.style.background = ''; });
      div.addEventListener('mousedown', function (e) {
        e.preventDefault();
        e.stopPropagation();
        item.action();
        hideContextMenu();
      });
    }
    ctxMenuEl.appendChild(div);
  });

  // 先加入 DOM 才能读取 offset 尺寸
  document.body.appendChild(ctxMenuEl);

  const TASKBAR = 44;
  const menuW = ctxMenuEl.offsetWidth;
  const menuH = ctxMenuEl.offsetHeight;
  const winW = window.innerWidth;
  const winH = window.innerHeight;
  let left = x + 4;
  let top = y + 4;
  if (left + menuW > winW) left = Math.max(0, winW - menuW - 4);
  if (top + menuH > winH - TASKBAR) top = Math.max(0, winH - TASKBAR - menuH - 4);
  ctxMenuEl.style.left = left + 'px';
  ctxMenuEl.style.top = top + 'px';
  ctxMenuEl.style.visibility = 'visible';

  setTimeout(function () {
    document.addEventListener('mousedown', hideContextMenuOnOutside, true);
  }, 0);
}

// ── 合并选中项为一张图片 ──
function mergeSelectedItems() {
  let selItems = getSelectedImages();
  if (selItems.length < 2) return;

  // 计算包围盒
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  selItems.forEach(function (item) {
    if (item.x < minX) minX = item.x;
    if (item.y < minY) minY = item.y;
    if (item.x + item.width > maxX) maxX = item.x + item.width;
    if (item.y + item.height > maxY) maxY = item.y + item.height;
  });

  let bw = maxX - minX;
  let bh = maxY - minY;

  // 创建离屏 canvas
  let canvas = document.createElement('canvas');
  canvas.width = bw;
  canvas.height = bh;
  let ctx = canvas.getContext('2d');

  // 加载所有元素到 canvas
  let loadPromises = selItems.map(function (item) {
    return renderItemToCanvas(ctx, item, item.x - minX, item.y - minY);
  });

  Promise.all(loadPromises).then(function () {
    let dataUrl = canvas.toDataURL('image/png');
    let mergedId = 'oly-merged-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
    let mergedData = {
      type: 'merged',
      id: mergedId,
      x: minX,
      y: minY,
      width: bw,
      height: bh,
      zIndex: nextZIndex++,
      src: dataUrl,
      mergeChildren: selItems.map(function (s) { return s.id; })
    };

    // 删除原始元素
    let ids = new Set(mergedData.mergeChildren);
    for (let i = overlayImages.length - 1; i >= 0; i--) {
      if (ids.has(overlayImages[i].id)) {
        overlayImages.splice(i, 1);
      }
    }

    overlayImages.push(mergedData);
    selectedImageIds.clear();
    selectedImageIds.add(mergedId);
    transactRender();
  });
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

// ── 多选图层操作 ──
function multiLayerAction(action) {
  let items = getSelectedImages();
  items.forEach(function (item) {
    if (action === 'front') {
      item.zIndex = nextZIndex++;
    } else if (action === 'back') {
      let minZ = Infinity;
      overlayImages.forEach(function (img) {
        if (img !== item && img.zIndex < minZ) minZ = img.zIndex;
      });
      item.zIndex = minZ > 1 ? minZ - 1 : 1;
    }
  });
  transactRender();
}

// ── 排列对齐 ──
function alignItems(mode) {
  let items = getSelectedImages();
  if (items.length < 2) return;

  // 以第一个选中项为锚点（左对齐/右对齐/上对齐/下对齐）
  let anchor = items[0];

  if (mode === 'left') {
    items.forEach(function (item) { item.x = anchor.x; });
  } else if (mode === 'right') {
    items.forEach(function (item) { item.x = anchor.x + anchor.width - item.width; });
  } else if (mode === 'hcenter') {
    let centerX = anchor.x + anchor.width / 2;
    items.forEach(function (item) { item.x = centerX - item.width / 2; });
  } else if (mode === 'top') {
    items.forEach(function (item) { item.y = anchor.y; });
  } else if (mode === 'bottom') {
    items.forEach(function (item) { item.y = anchor.y + anchor.height - item.height; });
  } else if (mode === 'hdistribute') {
    // 按 x 排序，等距水平排列
    let sorted = items.slice().sort(function (a, b) { return a.x - b.x; });
    let totalW = sorted.reduce(function (sum, item) { return sum + item.width; }, 0);
    let first = sorted[0], last = sorted[sorted.length - 1];
    let gap = (last.x + last.width - first.x - totalW) / (sorted.length - 1);
    let curX = first.x;
    sorted.forEach(function (item) {
      item.x = curX;
      curX += item.width + gap;
    });
  } else if (mode === 'vdistribute') {
    // 按 y 排序，等距竖直排列
    let sorted = items.slice().sort(function (a, b) { return a.y - b.y; });
    let totalH = sorted.reduce(function (sum, item) { return sum + item.height; }, 0);
    let first = sorted[0], last = sorted[sorted.length - 1];
    let gap = (last.y + last.height - first.y - totalH) / (sorted.length - 1);
    let curY = first.y;
    sorted.forEach(function (item) {
      item.y = curY;
      curY += item.height + gap;
    });
  }
  transactRender();
}

// ── 批量删除 ──
function deleteMultiSelected() {
  let ids = new Set(selectedImageIds);
  for (let i = overlayImages.length - 1; i >= 0; i--) {
    if (ids.has(overlayImages[i].id)) {
      overlayImages.splice(i, 1);
    }
  }
  selectedImageIds.clear();
  transactRender();
}

// ── 单元素右键菜单 ──
function showContextMenu(imgData, x, y) {
  hideContextMenu();
  ctxMenuEl = document.createElement('div');
  ctxMenuEl.id = 'olyContextMenu';
  ctxMenuEl.style.cssText =
    'position:fixed;z-index:99999;background:#0d1f2b;border:1px solid #2c6e7e;' +
    'border-radius:8px;padding:4px 0;box-shadow:0 4px 16px rgba(0,0,0,0.6);' +
    'min-width:160px;left:0px;top:0px;visibility:hidden;';

  let items = getContextMenuItems(imgData);

function getContextMenuItems(imgData) {
  let type = imgData.type || 'image';
  let items = [];
  let layerItems = [
    { label: '置于顶层', action: function () { bringToFront(imgData); } },
    { label: '置于底层', action: function () { sendToBack(imgData); } },
    { label: '上移一层', action: function () { moveUp(imgData); } },
    { label: '下移一层', action: function () { moveDown(imgData); } }
  ];
  let deleteItem = { label: '删除', action: function () { deleteImage(imgData); } };

  if (type === 'image') {
    items = [
      { label: '━━ 编辑图片 ━━', action: null, separator: true },
      { label: '🎨 高级编辑', action: function () { openAdvancedEditor(imgData); } },
      { label: '✂ 裁剪', action: function () { openCropEditor(imgData); } },
      { label: '↻ 旋转 90°', action: function () { rotateImage(imgData, 90); } },
      { label: '⇔ 水平翻转', action: function () { flipImage(imgData, 'h'); } },
      { label: '⇕ 垂直翻转', action: function () { flipImage(imgData, 'v'); } },
      { label: '⚙ 调整参数', action: function () { openAdjustEditor(imgData); } },
      { label: '━━ 图层顺序 ━━', action: null, separator: true }
    ].concat(layerItems).concat([
      { label: '━━ 删除 ━━', action: null, separator: true },
      deleteItem
    ]);
  } else if (type === 'shape') {
    items = [
      { label: '━━ 形状编辑 ━━', action: null, separator: true },
      { label: '填充颜色...', action: function () { pickColorForShape(imgData, 'fillColor'); } },
      { label: '线条颜色...', action: function () { pickColorForShape(imgData, 'strokeColor'); } },
      { label: '━━ 图层顺序 ━━', action: null, separator: true }
    ].concat(layerItems).concat([
      { label: '━━ 删除 ━━', action: null, separator: true },
      deleteItem
    ]);
  } else if (type === 'textbox') {
    items = [
      { label: '━━ 文字编辑 ━━', action: null, separator: true },
      { label: '✎ 编辑文字', action: function () { enterTextBoxEdit(imgData); } },
      { label: '━━ 图层顺序 ━━', action: null, separator: true }
    ].concat(layerItems).concat([
      { label: '━━ 删除 ━━', action: null, separator: true },
      deleteItem
    ]);
  } else if (type === 'video') {
    items = [
      { label: '━━ 视频编辑 ━━', action: null, separator: true },
      { label: '🎬 打开编辑器', action: function () { openVideoEditor(imgData); } },
      { label: '━━ 视频播放 ━━', action: null, separator: true },
      { label: imgData.loop ? '✓ 循环播放' : '○ 循环播放', action: function () { imgData.loop = !imgData.loop; renderAll(); } },
      { label: imgData.muted ? '✓ 静音' : '○ 静音', action: function () { imgData.muted = !imgData.muted; renderAll(); } },
      { label: '━━ 图层顺序 ━━', action: null, separator: true }
    ].concat(layerItems).concat([
      { label: '━━ 删除 ━━', action: null, separator: true },
      deleteItem
    ]);
  } else if (type === 'audio') {
    items = [
      { label: '━━ 音频编辑 ━━', action: null, separator: true },
      { label: '🎵 打开编辑器', action: function () { openAudioEditor(imgData); } },
      { label: '━━ 音频播放 ━━', action: null, separator: true },
      { label: imgData.loop ? '✓ 循环播放' : '○ 循环播放', action: function () { imgData.loop = !imgData.loop; renderAll(); } },
      { label: imgData.muted ? '✓ 静音' : '○ 静音', action: function () { imgData.muted = !imgData.muted; renderAll(); } },
      { label: '━━ 图层顺序 ━━', action: null, separator: true }
    ].concat(layerItems).concat([
      { label: '━━ 删除 ━━', action: null, separator: true },
      deleteItem
    ]);
  } else if (type === 'excel') {
    items = [
      { label: '━━ 表格编辑 ━━', action: null, separator: true },
      { label: '📊 打开编辑器', action: function () { openExcelEditor(imgData); } },
      { label: '━━ 图层顺序 ━━', action: null, separator: true }
    ].concat(layerItems).concat([
      { label: '━━ 删除 ━━', action: null, separator: true },
      deleteItem
    ]);
  }

  return items;
}

function pickColorForShape(imgData, prop) {
  let input = document.createElement('input');
  input.type = 'color';
  if (prop === 'fillColor') {
    input.value = rgbaToHex(imgData.fillColor) || '#2c6e7e';
  } else if (prop === 'strokeColor') {
    input.value = rgbaToHex(imgData.strokeColor) || '#4a9eae';
  } else if (prop === 'backgroundColor') {
    input.value = rgbaToHex(imgData.backgroundColor) || '#000000';
  } else {
    input.value = rgbaToHex(imgData.color) || '#c8e6ff';
  }
  input.style.cssText = 'position:fixed;top:-100px;left:-100px;';
  document.body.appendChild(input);
  input.addEventListener('input', function () {
    imgData[prop] = input.value;
    renderAll();
  });
  input.addEventListener('change', function () {
    imgData[prop] = input.value;
    transactRender();
    document.body.removeChild(input);
  });
  input.addEventListener('blur', function () {
    setTimeout(function () {
      if (input.parentNode) document.body.removeChild(input);
    }, 200);
  });
  input.click();
}

  items.forEach(function (item) {
    let div = document.createElement('div');
    div.textContent = item.label;
    div.style.cssText =
      'padding:6px 16px;cursor:pointer;color:#c8e6ff;font-size:13px;' +
      'white-space:nowrap;';
    if (item.separator) {
      div.style.cssText =
        'padding:6px 16px;color:#5a8aaa;font-size:11px;' +
        'white-space:nowrap;cursor:default;border-top:1px solid #1a3a44;';
    }
    if (!item.separator && item.action) {
      div.addEventListener('mouseenter', function () { div.style.background = '#1c525a'; });
      div.addEventListener('mouseleave', function () { div.style.background = ''; });
      div.addEventListener('mousedown', function (e) {
        e.preventDefault();
        e.stopPropagation();
        item.action();
        hideContextMenu();
      });
    }
    ctxMenuEl.appendChild(div);
  });

  // 先加入 DOM 才能读取 offset 尺寸
  document.body.appendChild(ctxMenuEl);

  const TASKBAR = 44;
  const menuW = ctxMenuEl.offsetWidth;
  const menuH = ctxMenuEl.offsetHeight;
  const winW = window.innerWidth;
  const winH = window.innerHeight;
  let left = x + 4;
  let top = y + 4;
  if (left + menuW > winW) left = Math.max(0, winW - menuW - 4);
  if (top + menuH > winH - TASKBAR) top = Math.max(0, winH - TASKBAR - menuH - 4);
  ctxMenuEl.style.left = left + 'px';
  ctxMenuEl.style.top = top + 'px';
  ctxMenuEl.style.visibility = 'visible';

  setTimeout(function () {
    document.addEventListener('mousedown', hideContextMenuOnOutside, true);
  }, 0);
}

function hideContextMenuOnOutside(e) {
  if (ctxMenuEl && !ctxMenuEl.contains(e.target)) {
    hideContextMenu();
  }
}

function hideContextMenu() {
  if (ctxMenuEl) {
    try { document.body.removeChild(ctxMenuEl); } catch (e) { }
    ctxMenuEl = null;
    document.removeEventListener('mousedown', hideContextMenuOnOutside, true);
  }
}

function bringToFront(imgData) {
  imgData.zIndex = nextZIndex++;
  transactRender();
}

function sendToBack(imgData) {
  let minZ = Infinity;
  overlayImages.forEach(function (img) {
    if (img !== imgData && img.zIndex < minZ) minZ = img.zIndex;
  });
  imgData.zIndex = minZ > 1 ? minZ - 1 : 1;
  transactRender();
}

function moveUp(imgData) {
  imgData.zIndex += 1;
  if (imgData.zIndex >= nextZIndex) nextZIndex = imgData.zIndex + 1;
  transactRender();
}

function moveDown(imgData) {
  imgData.zIndex -= 1;
  if (imgData.zIndex < 1) imgData.zIndex = 1;
  transactRender();
}

function deleteImage(imgData) {
  for (let i = overlayImages.length - 1; i >= 0; i--) {
    if (overlayImages[i].id === imgData.id) {
      overlayImages.splice(i, 1);
      break;
    }
  }
  if (selectedImageIds.has(imgData.id)) deselectImage();
  transactRender();
}

let _autoScrollRaf = null;

function startAutoScroll(e) {
  stopAutoScroll();
  function tick() {
    let body = document.querySelector('#ckEditorContainer .mce-content-body');
    if (!body || !dragInfo) { stopAutoScroll(); return; }
    let rect = body.getBoundingClientRect();
    let edgeZone = 60;
    let speed = 8;
    let relY = e.clientY - rect.top;
    if (relY < edgeZone && relY >= 0) {
      let factor = 1 - relY / edgeZone;
      body.scrollTop -= speed * factor;
      // 同步更新拖拽偏移量，让元素跟随滚动
      dragInfo.startY += speed * factor;
      if (dragInfo._multiOrigins) {
        for (let sid in dragInfo._multiOrigins) {
          dragInfo._multiOrigins[sid].y += speed * factor;
        }
      }
    } else if (relY > rect.height - edgeZone && relY <= rect.height) {
      let factor = (relY - (rect.height - edgeZone)) / edgeZone;
      body.scrollTop += speed * factor;
      dragInfo.startY -= speed * factor;
      if (dragInfo._multiOrigins) {
        for (let sid in dragInfo._multiOrigins) {
          dragInfo._multiOrigins[sid].y -= speed * factor;
        }
      }
    }
    renderAll();
    _autoScrollRaf = requestAnimationFrame(tick);
  }
  _autoScrollRaf = requestAnimationFrame(tick);
}

function stopAutoScroll() {
  if (_autoScrollRaf) {
    cancelAnimationFrame(_autoScrollRaf);
    _autoScrollRaf = null;
  }
}

document.addEventListener('mousemove', function (e) {
  if (dragInfo) {
    if (!_preDragState) _preDragState = JSON.parse(JSON.stringify(overlayImages));
    let dx = e.clientX - dragInfo.startX;
    let dy = e.clientY - dragInfo.startY;

    // 自动滚动：鼠标接近编辑器视口边缘时触发
    let body = document.querySelector('#ckEditorContainer .mce-content-body');
    if (body) {
      let rect = body.getBoundingClientRect();
      let edgeZone = 60;
      let relY = e.clientY - rect.top;
      if ((relY < edgeZone && relY >= 0) || (relY > rect.height - edgeZone && relY <= rect.height)) {
        if (!_autoScrollRaf) startAutoScroll(e);
      } else {
        stopAutoScroll();
      }
    }

    // 多选拖拽：移动所有选中项
    if (selectedImageIds.size > 1 && selectedImageIds.has(dragInfo.imgData.id)) {
      // 保存每个选中项的原始位置（首次移动时）
      if (!dragInfo._multiOrigins) {
        dragInfo._multiOrigins = {};
        selectedImageIds.forEach(function(sid) {
          let img = findImageDataById(sid);
          if (img) dragInfo._multiOrigins[sid] = { x: img.x, y: img.y };
        });
      }
      selectedImageIds.forEach(function(sid) {
        let img = findImageDataById(sid);
        let orig = dragInfo._multiOrigins[sid];
        if (img && orig) {
          img.x = Math.max(-50, orig.x + dx);
          img.y = Math.max(-50, orig.y + dy);
          // 更新百分比坐标
          _updatePctFromPx(img);
        }
      });
    } else {
      dragInfo.imgData.x = Math.max(-50, dragInfo.origX + dx);
      dragInfo.imgData.y = Math.max(-50, dragInfo.origY + dy);
      // 更新百分比坐标
      _updatePctFromPx(dragInfo.imgData);
    }
    renderAll();
    return;
  }
  if (resizeInfo) {
    if (!_preDragState) _preDragState = JSON.parse(JSON.stringify(overlayImages));
    if (resizeInfo.corner === 'rotate') {
      let blockEl = getBlockElement(resizeInfo.imgData.blockId || getActiveBlockId());
      let item = blockEl && blockEl.querySelector('[data-oly-id="' + resizeInfo.imgData.id + '"]');
      let rect = item ? item.getBoundingClientRect() : null;
      if (!rect) return;
      let cx = rect.left + rect.width / 2;
      let cy = rect.top + rect.height / 2;
      let angle = Math.atan2(e.clientY - cy, e.clientX - cx);
      let delta = (angle - resizeInfo.initAngle) * 180 / Math.PI;
      let newRotation = (resizeInfo.origRotation + delta) % 360;
      if (e.shiftKey) {
        newRotation = Math.round(newRotation / 15) * 15;
      }
      resizeInfo.imgData.rotation = newRotation;
      renderAll();
      return;
    }

    let rdx = e.clientX - resizeInfo.startX;
    let rdy = e.clientY - resizeInfo.startY;
    let newW = resizeInfo.origW;
    let newH = resizeInfo.origH;
    let newX = resizeInfo.origX;
    let newY = resizeInfo.origY;
    let minSize = 30;

    if (resizeInfo.corner.indexOf('e') >= 0) {
        newW = Math.max(minSize, resizeInfo.origW + rdx);
      }
      if (resizeInfo.corner.indexOf('w') >= 0) {
        newW = Math.max(minSize, resizeInfo.origW - rdx);
        newX = resizeInfo.origX + resizeInfo.origW - newW;
      }
      if (resizeInfo.corner.indexOf('s') >= 0) {
        newH = Math.max(minSize, resizeInfo.origH + rdy);
      }
      if (resizeInfo.corner.indexOf('n') >= 0) {
        newH = Math.max(minSize, resizeInfo.origH - rdy);
        newY = resizeInfo.origY + resizeInfo.origH - newH;
    }

    if (e.shiftKey || resizeInfo.aspectLock) {
      if (resizeInfo.corner === 'se' || resizeInfo.corner === 'nw') {
        let scale = Math.max(newW / resizeInfo.origW, newH / resizeInfo.origH);
        newW = resizeInfo.origW * scale;
        newH = resizeInfo.origH * scale;
        if (resizeInfo.corner === 'nw') {
          newX = resizeInfo.origX + resizeInfo.origW - newW;
          newY = resizeInfo.origY + resizeInfo.origH - newH;
        }
      } else if (resizeInfo.corner === 'sw' || resizeInfo.corner === 'ne') {
        let scale2 = Math.max(newW / resizeInfo.origW, newH / resizeInfo.origH);
        newW = resizeInfo.origW * scale2;
        newH = resizeInfo.origH * scale2;
        if (resizeInfo.corner === 'sw') {
          newX = resizeInfo.origX + resizeInfo.origW - newW;
        } else {
          newY = resizeInfo.origY + resizeInfo.origH - newH;
        }
      }
    }

    resizeInfo.imgData.x = newX;
    resizeInfo.imgData.y = newY;
    resizeInfo.imgData.width = newW;
    resizeInfo.imgData.height = newH;
    _updatePctFromPx(resizeInfo.imgData);
    renderAll();
    return;
  }
});

document.addEventListener('mouseup', function () {
  stopAutoScroll();
  if (resizeInfo && resizeInfo.corner === 'rotate') {
    let rotEl = document.querySelector('.oly-rotate-handle');
    if (rotEl) rotEl.style.cursor = 'grab';
  }

  if (_preDragState && state.tinyEditor && state.tinyEditor.undoManager) {
    var postState = JSON.parse(JSON.stringify(overlayImages));
    var preState = _preDragState;
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
  }

  dragInfo = null;
  resizeInfo = null;
  _preDragState = null;
});

document.addEventListener('keydown', function (e) {
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (selectedImageIds.size > 0) {
      e.preventDefault();
      deleteSelectedImage();
      return;
    }
    let activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) return;
  }
  if (e.key === 'Escape') {
    deselectImage();
  }
});

document.addEventListener('mousedown', function (e) {
  if (selectedImageIds.size > 0) {
    // 点击 TinyMCE 工具栏/菜单/对话框等 UI 元素时不取消选中
    if (e.target.closest('.tox-toolbar, .tox-tbtn, .tox-menu, .tox-collection, .tox-dialog, .tox-dialog__body, .tox-button, .tox-textfield, .tox-checkbox, .tox-select, .tox-listbox, .tox-split-button, .tox-editor-header, .tox-editor-container > .tox-toolbar-overlord, .tox-editor-dock, .tox-sidebar, .tox-statusbar, #toolbarDock, .tb-menubar-tab')) {
      return;
    }
    let clickedOnImage = e.target.closest('.oly-img-item');
    let clickedOnResizeHandle = e.target.closest('.oly-resize-handle');
    let clickedOnRotateHandle = e.target.closest('.oly-rotate-handle');
    let clickedOnContextMenu = e.target.closest('#olyContextMenu');
    if (!clickedOnImage && !clickedOnResizeHandle && !clickedOnRotateHandle && !clickedOnContextMenu) {
      deselectImage();
    }
  }
});

document.addEventListener('click', function (e) {
  if (ctxMenuEl && !ctxMenuEl.contains(e.target)) {
    hideContextMenu();
  }
});

function findImageDataById(id) {
  for (let i = 0; i < overlayImages.length; i++) {
    if (overlayImages[i].id === id) return overlayImages[i];
  }
  return null;
}

/**
 * 根据 px 值更新百分比坐标
 * 在拖拽/缩放后调用
 */
function _updatePctFromPx(imgData) {
  let blockId = imgData.blockId || getActiveBlockId();
  if (!blockId) return;
  let blockW = getBlockWidth(blockId);
  if (!blockW || blockW <= 0) return;
  imgData.leftPct = pxToPct(imgData.x, blockW);
  imgData.widthPct = pxToPct(imgData.width, blockW);
  imgData._refWidth = blockW;
}
export function bindOverlayEvents() {
  document.addEventListener('mousedown', function (e) {
    let rotHandleEl = e.target.closest('.oly-rotate-handle');
    if (rotHandleEl) {
      e.preventDefault();
      e.stopPropagation();
      let item = rotHandleEl.closest('.oly-img-item');
      if (!item) return;
      let imgId = item.dataset.olyId;
      let imgData = findImageDataById(imgId);
      if (!imgData) return;
      selectImage(imgId);
      rotHandleEl.style.cursor = 'grabbing';
      let rect = item.getBoundingClientRect();
      let cx = rect.left + rect.width / 2;
      let cy = rect.top + rect.height / 2;
      let initAngle = Math.atan2(e.clientY - cy, e.clientX - cx);
      if (imgData.rotation == null) imgData.rotation = 0;
      resizeInfo = {
        imgData: imgData,
        startX: e.clientX,
        startY: e.clientY,
        origX: imgData.x,
        origY: imgData.y,
        origW: imgData.width,
        origH: imgData.height,
        corner: 'rotate',
        initAngle: initAngle,
        origRotation: imgData.rotation
      };
      return;
    }

    let handle = e.target.closest('.oly-resize-handle');
    if (handle) {
      e.preventDefault();
      e.stopPropagation();
      let item = handle.closest('.oly-img-item');
      if (!item) return;
      let imgId = item.dataset.olyId;
      let imgData = findImageDataById(imgId);
      if (!imgData) return;
      selectImage(imgId);
      let corner = '';
      if (handle.classList.contains('oly-resize-nw')) corner = 'nw';
      else if (handle.classList.contains('oly-resize-n')) corner = 'n';
      else if (handle.classList.contains('oly-resize-ne')) corner = 'ne';
      else if (handle.classList.contains('oly-resize-w')) corner = 'w';
      else if (handle.classList.contains('oly-resize-e')) corner = 'e';
      else if (handle.classList.contains('oly-resize-sw')) corner = 'sw';
      else if (handle.classList.contains('oly-resize-s')) corner = 's';
      else if (handle.classList.contains('oly-resize-se')) corner = 'se';
      resizeInfo = {
        imgData: imgData,
        startX: e.clientX,
        startY: e.clientY,
        origX: imgData.x,
        origY: imgData.y,
        origW: imgData.width,
        origH: imgData.height,
        corner: corner,
        aspectLock: true
      };
      return;
    }
  }, true);

  document.addEventListener('contextmenu', function (e) {
    let item = e.target.closest('.oly-img-item');
    if (item) {
      e.preventDefault();
      let imgId = item.dataset.olyId;
      // 如果右键点击的元素已在多选范围内，显示多选菜单
      if (selectedImageIds.size > 1 && selectedImageIds.has(imgId)) {
        showMultiSelectContextMenu(e.clientX, e.clientY);
        return;
      }
      let imgData = null;
      for (let i = 0; i < overlayImages.length; i++) {
        if (overlayImages[i].id === imgId) { imgData = overlayImages[i]; break; }
      }
      if (imgData) {
        selectImage(imgId);
        showContextMenu(imgData, e.clientX, e.clientY);
      }
    }
  });
}



// 图片编辑器功能已拆分到 overlay-image-editor.js
import { openAdvancedEditor, openCropEditor, openAdjustEditor, rotateImage, flipImage } from './overlay-image-editor.js';

export { overlayImages, ensureOverlay, rgbaToHex, showContextMenu, hideContextMenu, findImageDataById, openAdvancedEditor, openCropEditor, openAdjustEditor, rotateImage, flipImage };
