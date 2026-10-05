// ============================================================
//  overlay/overlay-images/data.js — 数据读写
//  - clearOverlayImages：清空 overlay 数据与 DOM 残留
//  - getOverlayImagesData：按类型序列化字段
//  - setOverlayImagesData：反序列化 + item 构造 + blockId 分配 + 延迟渲染
// ============================================================

import { getShapeCategory } from '../overlay-shapes.js';
import { hideTextBoxToolbar } from '../overlay-textbox.js';
import {
  ensureOverlayBlock, getAllBlockIds, getBlockElement, getBlockWidth,
  pxToPct, setupBlockResizeObservers
} from '../overlay-block.js';
import { overlayImages, selectedImageIds, getNextZIndex, getZIndexValue, setZIndexValue } from './share.js';
import { renderAll } from './render.js';
export function clearOverlayImages() {
  hideTextBoxToolbar();
  overlayImages.length = 0;
  selectedImageIds.clear();
  setZIndexValue(100);
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
    } else if (item.type === 'document') {
      base.docType = item.docType || 'pdf';
      base.src = item.src;
      base.srcType = item.srcType || 'dataUrl';
      base.fileName = item.fileName || '';
      base.currentPage = item.currentPage || 1;
      base.totalPages = item.totalPages || 0;
      base.zoom = item.zoom || 100;
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
  // 不能用 overlayImages = [] 重新赋值！
  // 因为其他模块（overlay-chart.js 等）通过 import { overlayImages } 持有原数组引用，
  // 重新赋值会导致它们 push 到旧数组，数据丢失。
  // 必须原地修改：先清空再 push。
  overlayImages.length = 0;
  selectedImageIds.clear();
  setZIndexValue(100);
  if (data && data.length > 0) {
    let newItems = data.map(function (d) {
      if (d.zIndex >= getZIndexValue()) setZIndexValue(d.zIndex + 1);
      let item = {
        type: d.type || 'image',
        id: d.id || ('oly-img-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6)),
        blockId: d.blockId || null,
        x: d.x || 0,
        y: d.y || 0,
        width: d.width || 200,
        height: d.height || 150,
        zIndex: d.zIndex || getNextZIndex()
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
      } else if (item.type === 'document') {
        item.docType = d.docType || 'pdf';
        item.src = d.src;
        item.srcType = d.srcType || 'dataUrl';
        item.fileName = d.fileName || '';
        item.currentPage = d.currentPage || 1;
        item.totalPages = d.totalPages || 0;
        item.zoom = d.zoom || 100;
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
    // 原地 push，保持数组引用不变（其他模块通过 import 持有同一引用）
    for (let i = 0; i < newItems.length; i++) {
      overlayImages.push(newItems[i]);
    }
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
