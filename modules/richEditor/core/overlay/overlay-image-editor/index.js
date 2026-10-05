// ============================================================
//  overlay/overlay-image-editor/index.js — 图片高级编辑器（入口）
//  由原 overlay/overlay-image-editor.js 拆分（对外导出不变）：
//    share.js  — 模块级可变状态中枢 + setter
//    modal.js  — 编辑器弹窗 DOM 构建（createEditorModal）
//    modes.js  — 滤镜/自由旋转/画笔/文字水印模式 + 工具按钮高亮
//    adjust.js — 格式面板/调整滑块/画布旋转翻转/图片加载/裁剪
//    index.js  — 应用变更/关闭弹窗/对外 API（本文件）
//  依赖方向：index → {modal,modes,adjust,share}；modal → {modes,adjust,share,index}；
//    modes ↔ adjust（highlightToolButton / destroyCropper 运行时互调）；
//    modes/adjust → share（modal→index 为函数声明运行时回调，无加载期循环初始化）
// ============================================================

import { transactRender } from '../overlay-images/index.js';

//  图片编辑器（裁剪 / 旋转 / 翻转 / 参数调整）
//  依赖: Cropper.js (MIT)
// ============================================================

import { createEditorModal } from './modal.js';
import { deactivateAllModes, flattenDrawToCanvas, flattenTextToCanvas } from './modes.js';
import {
  destroyCropper, loadEditorImage, startCropMode, activateAdjustMode,
  applyFormatLivePreview, applyAdjustFilters
} from './adjust.js';
import {
  editorModal, editorImgData, editorCropper, editorOriginalSrc, editorWorkingSrc,
  editorOriginalW, editorOriginalH, drawState, textItems,
  setEditorModal, setEditorCanvas, setEditorCtx, setEditorImgData,
  setEditorOriginalSrc, setEditorWorkingSrc, setEditorOriginalW, setEditorOriginalH,
  setCurrentEditorMode, setCurrentFilterPreset, setFreeRotateAngle,
  setDrawState, setTextState, setTextItems
} from './share.js';

export function applyEditorChanges() {
  if (!editorImgData) return;

  // 合并画笔标注
  if (drawState.active && drawState.paths.length > 0) {
    flattenDrawToCanvas();
  }
  // 合并文字水印
  if (textItems.length > 0) {
    flattenTextToCanvas();
  }

  if (editorCropper) {
    let croppedCanvas = editorCropper.getCroppedCanvas();
    if (croppedCanvas) {
      setEditorWorkingSrc(croppedCanvas.toDataURL('image/png'));
    }
    destroyCropper();
  }

  finishApply();

  function finishApply() {
    let finalSrc = editorWorkingSrc || editorOriginalSrc;
    let finalImg = new Image();
    finalImg.onload = function () {
      editorImgData.src = finalSrc;
      if (editorOriginalW != null) { editorImgData.width = editorOriginalW; }
      if (editorOriginalH != null) { editorImgData.height = editorOriginalH; }

      editorImgData.fmtBorderWidth = parseInt(document.getElementById('olyFmtBorderWidth').value) || 0;
      editorImgData.fmtBorderColor = document.getElementById('olyFmtBorderColor').value;
      editorImgData.fmtBorderStyle = document.getElementById('olyFmtBorderStyle').value;
      editorImgData.fmtShadowX = parseInt(document.getElementById('olyFmtShadowX').value) || 0;
      editorImgData.fmtShadowY = parseInt(document.getElementById('olyFmtShadowY').value) || 0;
      editorImgData.fmtShadowBlur = parseInt(document.getElementById('olyFmtShadowBlur').value) || 0;
      editorImgData.fmtShadowColor = document.getElementById('olyFmtShadowColor').value;
      editorImgData.fmtShadowOpacity = (parseInt(document.getElementById('olyFmtShadowOpacity').value) || 50) / 100;
      editorImgData.fmtGlowSize = parseInt(document.getElementById('olyFmtGlowSize').value) || 0;
      editorImgData.fmtGlowColor = document.getElementById('olyFmtGlowColor').value;
      editorImgData.fmtGlowOpacity = (parseInt(document.getElementById('olyFmtGlowOpacity').value) || 0) / 100;
      editorImgData.fmtSoftEdge = parseInt(document.getElementById('olyFmtSoftEdge').value) || 0;
      editorImgData.fmtReflectOpacity = parseInt(document.getElementById('olyFmtReflectOpacity').value) || 0;
      editorImgData.fmtReflectSize = parseInt(document.getElementById('olyFmtReflectSize').value) || 0;
      editorImgData.fmtReflectDistance = parseInt(document.getElementById('olyFmtReflectDistance').value) || 0;

      editorImgData.adjBrightness = parseInt(document.getElementById('olyAdjBrightness').value);
      editorImgData.adjContrast = parseInt(document.getElementById('olyAdjContrast').value);
      editorImgData.adjSaturation = parseInt(document.getElementById('olyAdjSaturation').value);
      editorImgData.adjHue = parseInt(document.getElementById('olyAdjHue').value);
      editorImgData.adjBlur = parseInt(document.getElementById('olyAdjBlur').value);
      editorImgData.adjOpacity = parseInt(document.getElementById('olyAdjOpacity').value);

      closeEditorModal();
      transactRender();
    };
    finalImg.src = finalSrc;
  }
}

export function closeEditorModal() {
  destroyCropper();
  deactivateAllModes();

  if (editorModal && editorModal.parentNode) {
    editorModal.parentNode.removeChild(editorModal);
  }
  setEditorModal(null);
  setEditorCanvas(null);
  setEditorCtx(null);
  setEditorImgData(null);
  setEditorOriginalSrc(null);
  setEditorWorkingSrc(null);
  setEditorOriginalW(null);
  setEditorOriginalH(null);
  setCurrentEditorMode('adjust');
  setCurrentFilterPreset('none');
  setFreeRotateAngle(0);
  setDrawState({ active: false, eraser: false, paths: [] });
  setTextState({ active: false, items: [] });
  setTextItems([]);
}

function openCropEditor(imgData) {
  setEditorImgData(imgData);
  setEditorOriginalSrc(imgData.src);
  setEditorWorkingSrc(imgData.src);
  setEditorOriginalW(imgData.width);
  setEditorOriginalH(imgData.height);
  createEditorModal();
  loadEditorImage(imgData.src);
  setTimeout(function () { startCropMode(); }, 200);
}

function _loadFormatValuesFromData(imgData) {
  if (!imgData) return;
  let el = function (id) { return document.getElementById(id); };
  let setVal = function (id, val) { let e = el(id); if (e) e.value = val; };
  let setCheck = function (id, val) { let e = el(id); if (e) e.checked = val; };

  if (imgData.fmtBorderWidth != null) setVal('olyFmtBorderWidth', imgData.fmtBorderWidth);
  if (imgData.fmtBorderColor) setVal('olyFmtBorderColor', imgData.fmtBorderColor);
  if (imgData.fmtBorderStyle) setVal('olyFmtBorderStyle', imgData.fmtBorderStyle);

  if (imgData.fmtShadowX != null) setVal('olyFmtShadowX', imgData.fmtShadowX);
  if (imgData.fmtShadowY != null) setVal('olyFmtShadowY', imgData.fmtShadowY);
  if (imgData.fmtShadowBlur != null) setVal('olyFmtShadowBlur', imgData.fmtShadowBlur);
  if (imgData.fmtShadowColor) setVal('olyFmtShadowColor', imgData.fmtShadowColor);
  if (imgData.fmtShadowOpacity != null) setVal('olyFmtShadowOpacity', Math.round(imgData.fmtShadowOpacity * 100));

  if (imgData.fmtGlowSize != null) setVal('olyFmtGlowSize', imgData.fmtGlowSize);
  if (imgData.fmtGlowColor) setVal('olyFmtGlowColor', imgData.fmtGlowColor);
  if (imgData.fmtGlowOpacity != null) setVal('olyFmtGlowOpacity', Math.round(imgData.fmtGlowOpacity * 100));

  if (imgData.fmtSoftEdge != null) setVal('olyFmtSoftEdge', imgData.fmtSoftEdge);

  if (imgData.fmtReflectOpacity != null) setVal('olyFmtReflectOpacity', imgData.fmtReflectOpacity);
  if (imgData.fmtReflectSize != null) setVal('olyFmtReflectSize', imgData.fmtReflectSize);
  if (imgData.fmtReflectDistance != null) setVal('olyFmtReflectDistance', imgData.fmtReflectDistance);

  if (imgData.adjBrightness != null) setVal('olyAdjBrightness', imgData.adjBrightness);
  else setVal('olyAdjBrightness', 100);
  if (imgData.adjContrast != null) setVal('olyAdjContrast', imgData.adjContrast);
  else setVal('olyAdjContrast', 100);
  if (imgData.adjSaturation != null) setVal('olyAdjSaturation', imgData.adjSaturation);
  else setVal('olyAdjSaturation', 100);
  if (imgData.adjHue != null) setVal('olyAdjHue', imgData.adjHue);
  else setVal('olyAdjHue', 0);
  if (imgData.adjBlur != null) setVal('olyAdjBlur', imgData.adjBlur);
  else setVal('olyAdjBlur', 0);
  if (imgData.adjOpacity != null) setVal('olyAdjOpacity', imgData.adjOpacity);
  else setVal('olyAdjOpacity', 100);

  applyFormatLivePreview();
  applyAdjustFilters();
}

function openAdjustEditor(imgData) {
  setEditorImgData(imgData);
  setEditorOriginalSrc(imgData.src);
  setEditorWorkingSrc(imgData.src);
  setEditorOriginalW(imgData.width);
  setEditorOriginalH(imgData.height);
  createEditorModal();
  loadEditorImage(imgData.src);
  setTimeout(function () {
    activateAdjustMode();
    _loadFormatValuesFromData(imgData);
  }, 200);
}

function rotateImage(imgData, degrees) {
  let img = new Image();
  img.onload = function () {
    let canvas = document.createElement('canvas');
    if (degrees === 90 || degrees === 270) {
      canvas.width = img.naturalHeight;
      canvas.height = img.naturalWidth;
    } else {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
    }
    let ctx = canvas.getContext('2d');
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(degrees * Math.PI / 180);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    ctx.restore();
    let newSrc = canvas.toDataURL('image/png');
    imgData.src = newSrc;
    imgData.width = canvas.width;
    imgData.height = canvas.height;
    transactRender();
  };
  img.src = imgData.src;
}

// ============================================================
//  高级图片编辑器 — 打开自研全功能图片编辑器
//  可直接裁剪、调整滤镜、旋转、翻转
// ============================================================

function openAdvancedEditor(imgData) {
  openAdjustEditor(imgData);
}

function flipImage(imgData, direction) {
  let img = new Image();
  img.onload = function () {
    let canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    let ctx = canvas.getContext('2d');
    ctx.save();
    if (direction === 'h') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    } else {
      ctx.translate(0, canvas.height);
      ctx.scale(1, -1);
    }
    ctx.drawImage(img, 0, 0);
    ctx.restore();
    imgData.src = canvas.toDataURL('image/png');
    transactRender();
  };
  img.src = imgData.src;
}


export { openAdvancedEditor, openCropEditor, openAdjustEditor, rotateImage, flipImage };
