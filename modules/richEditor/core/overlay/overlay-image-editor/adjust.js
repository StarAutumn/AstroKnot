// ============================================================
//  overlay-image-editor/adjust.js — 调整与画布操作
//  格式面板绑定/预览/重置、调整滑块、画布旋转/翻转、图片加载、
//  Cropper.js 裁剪（依赖: Cropper.js (MIT)）
// ============================================================

import {
  editorCanvas, editorCtx, editorCropper, editorModal, editorOriginalSrc,
  setEditorCanvas, setEditorCtx, setEditorCropper, setEditorWorkingSrc
} from './share.js';
import { highlightToolButton } from './modes.js';

export function bindFormatPanelControls() {
  let sectionHeaders = document.querySelectorAll('.oly-fmt-header');
  sectionHeaders.forEach(function (header) {
    header.addEventListener('click', function () {
      let body = this.nextElementSibling;
      let arrow = this.querySelector('.oly-fmt-arrow');
      if (!body || !arrow) return;
      if (body.style.display === 'none') {
        body.style.display = '';
        arrow.textContent = '▼';
      } else {
        body.style.display = 'none';
        arrow.textContent = '▶';
      }
    });
  });

  let fmtSliders = [
    { id: 'olyFmtShadowOpacity', valId: 'olyFmtShadowOpVal', unit: '%' },
    { id: 'olyFmtShadowBlur', valId: 'olyFmtShadowBlurVal', unit: 'px' },
    { id: 'olyFmtShadowX', valId: 'olyFmtShadowXVal', unit: 'px' },
    { id: 'olyFmtShadowY', valId: 'olyFmtShadowYVal', unit: 'px' },
    { id: 'olyFmtReflectOpacity', valId: 'olyFmtReflectOpVal', unit: '%' },
    { id: 'olyFmtReflectSize', valId: 'olyFmtReflectSizeVal', unit: '%' },
    { id: 'olyFmtReflectDistance', valId: 'olyFmtReflectDistVal', unit: 'px' },
    { id: 'olyFmtGlowSize', valId: 'olyFmtGlowSizeVal', unit: 'px' },
    { id: 'olyFmtGlowOpacity', valId: 'olyFmtGlowOpVal', unit: '%' },
    { id: 'olyFmtSoftEdge', valId: 'olyFmtSoftEdgeVal', unit: 'px' }
  ];

  fmtSliders.forEach(function (s) {
    let el = document.getElementById(s.id);
    if (!el) return;
    el.addEventListener('input', function () {
      let valEl = document.getElementById(s.valId);
      if (valEl) valEl.textContent = this.value + s.unit;
      applyFormatLivePreview();
    });
  });

  let colorInputs = [
    'olyFmtBorderColor', 'olyFmtShadowColor', 'olyFmtGlowColor'
  ];
  colorInputs.forEach(function (id) {
    let el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', function () { applyFormatLivePreview(); });
  });

  let borderInputs = ['olyFmtBorderWidth', 'olyFmtBorderStyle'];
  borderInputs.forEach(function (id) {
    let el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', function () { applyFormatLivePreview(); });
  });
}

export function applyFormatLivePreview() {
  let canvas = document.getElementById('olyEditorCanvas');
  if (!canvas) return;

  let bw = parseInt(document.getElementById('olyFmtBorderWidth').value) || 0;
  let bc = document.getElementById('olyFmtBorderColor').value || '#aef0ff';
  let bs = document.getElementById('olyFmtBorderStyle').value || 'solid';

  let sx = parseInt(document.getElementById('olyFmtShadowX').value) || 0;
  let sy = parseInt(document.getElementById('olyFmtShadowY').value) || 0;
  let sb = parseInt(document.getElementById('olyFmtShadowBlur').value) || 0;
  let sc = document.getElementById('olyFmtShadowColor').value || '#000000';
  let so = (parseInt(document.getElementById('olyFmtShadowOpacity').value) || 50) / 100;

  let gs = parseInt(document.getElementById('olyFmtGlowSize').value) || 0;
  let gc = document.getElementById('olyFmtGlowColor').value || '#aef0ff';
  let go = (parseInt(document.getElementById('olyFmtGlowOpacity').value) || 0) / 100;

  let se = parseInt(document.getElementById('olyFmtSoftEdge').value) || 0;

  let filter = '';

  if (sb > 0 && so > 0) {
    let hex = sc;
    let r = parseInt(hex.slice(1, 3), 16);
    let g = parseInt(hex.slice(3, 5), 16);
    let b = parseInt(hex.slice(5, 7), 16);
    filter += ' drop-shadow(' + sx + 'px ' + sy + 'px ' + sb + 'px rgba(' + r + ',' + g + ',' + b + ',' + so + '))';
  }

  if (gs > 0 && go > 0) {
    let hr = parseInt(gc.slice(1, 3), 16);
    let hg = parseInt(gc.slice(3, 5), 16);
    let hb = parseInt(gc.slice(5, 7), 16);
    filter += ' drop-shadow(0 0 ' + gs + 'px rgba(' + hr + ',' + hg + ',' + hb + ',' + go + '))';
  }

  canvas.style.filter = filter.trim() || 'none';
  canvas.style.border = bw > 0 ? bw + 'px ' + bs + ' ' + bc : 'none';
  canvas.style.boxSizing = 'border-box';

  if (se > 0) {
    canvas.style.maskImage = 'radial-gradient(ellipse at center, black ' + (100 - se) + '%, transparent 100%)';
    canvas.style.webkitMaskImage = 'radial-gradient(ellipse at center, black ' + (100 - se) + '%, transparent 100%)';
  } else {
    canvas.style.maskImage = '';
    canvas.style.webkitMaskImage = '';
  }
}

export function resetFormatControls() {
  let fmtDefaults = [
    { id: 'olyFmtBorderWidth', val: '0' },
    { id: 'olyFmtBorderColor', val: '#aef0ff' },
    { id: 'olyFmtShadowColor', val: '#000000' },
    { id: 'olyFmtShadowOpacity', val: '50', valId: 'olyFmtShadowOpVal', unit: '%' },
    { id: 'olyFmtShadowBlur', val: '10', valId: 'olyFmtShadowBlurVal', unit: 'px' },
    { id: 'olyFmtShadowX', val: '3', valId: 'olyFmtShadowXVal', unit: 'px' },
    { id: 'olyFmtShadowY', val: '3', valId: 'olyFmtShadowYVal', unit: 'px' },
    { id: 'olyFmtReflectOpacity', val: '0', valId: 'olyFmtReflectOpVal', unit: '%' },
    { id: 'olyFmtReflectSize', val: '0', valId: 'olyFmtReflectSizeVal', unit: '%' },
    { id: 'olyFmtReflectDistance', val: '0', valId: 'olyFmtReflectDistVal', unit: 'px' },
    { id: 'olyFmtGlowColor', val: '#aef0ff' },
    { id: 'olyFmtGlowSize', val: '0', valId: 'olyFmtGlowSizeVal', unit: 'px' },
    { id: 'olyFmtGlowOpacity', val: '0', valId: 'olyFmtGlowOpVal', unit: '%' },
    { id: 'olyFmtSoftEdge', val: '0', valId: 'olyFmtSoftEdgeVal', unit: 'px' }
  ];
  fmtDefaults.forEach(function (d) {
    let el = document.getElementById(d.id);
    if (el) {
      if (el.type === 'color') el.value = d.val;
      else el.value = d.val;
    }
    if (d.valId) {
      let vel = document.getElementById(d.valId);
      if (vel) vel.textContent = d.val + (d.unit || '');
    }
  });
  let bs = document.getElementById('olyFmtBorderStyle');
  if (bs) bs.value = 'solid';
  let canvas = document.getElementById('olyEditorCanvas');
  if (canvas) {
    canvas.style.filter = '';
    canvas.style.border = 'none';
    canvas.style.maskImage = '';
    canvas.style.webkitMaskImage = '';
  }
}

export function resetAdjustSliders() {
  let defaults = [
    { id: 'olyAdjBrightness', valId: 'olyAdjBrightVal', val: 100, unit: '%' },
    { id: 'olyAdjContrast', valId: 'olyAdjContrastVal', val: 100, unit: '%' },
    { id: 'olyAdjSaturation', valId: 'olyAdjSatVal', val: 100, unit: '%' },
    { id: 'olyAdjBlur', valId: 'olyAdjBlurVal', val: 0, unit: 'px' },
    { id: 'olyAdjHue', valId: 'olyAdjHueVal', val: 0, unit: '°' },
    { id: 'olyAdjOpacity', valId: 'olyAdjOpacityVal', val: 100, unit: '%' }
  ];
  defaults.forEach(function (d) {
    let el = document.getElementById(d.id);
    let valEl = document.getElementById(d.valId);
    if (el) el.value = d.val;
    if (valEl) valEl.textContent = d.val + d.unit;
  });
}

export function activateAdjustMode() {
  destroyCropper();
  let wrap = document.getElementById('olyEditorCanvasWrap');
  if (wrap) wrap.style.overflow = 'visible';
  if (editorCanvas) editorCanvas.style.display = 'block';
  applyAdjustFilters();
  highlightToolButton('adjust');
}

export function bindAdjustSliders() {
  let sliders = [
    { id: 'olyAdjBrightness', valId: 'olyAdjBrightVal', unit: '%' },
    { id: 'olyAdjContrast', valId: 'olyAdjContrastVal', unit: '%' },
    { id: 'olyAdjSaturation', valId: 'olyAdjSatVal', unit: '%' },
    { id: 'olyAdjBlur', valId: 'olyAdjBlurVal', unit: 'px' },
    { id: 'olyAdjHue', valId: 'olyAdjHueVal', unit: '°' },
    { id: 'olyAdjOpacity', valId: 'olyAdjOpacityVal', unit: '%' }
  ];
  sliders.forEach(function (s) {
    let el = document.getElementById(s.id);
    if (!el) return;
    el.addEventListener('input', function () {
      let valEl = document.getElementById(s.valId);
      if (valEl) valEl.textContent = this.value + s.unit;
      applyAdjustFilters();
    });
  });
}

export function loadEditorImage(src) {
  if (!editorCanvas) {
    setEditorCanvas(document.getElementById('olyEditorCanvas'));
    setEditorCtx(editorCanvas.getContext('2d'));
  }
  let img = new Image();
  img.onload = function () {
    let maxW = editorCanvas.parentNode.clientWidth - 40;
    let maxH = editorCanvas.parentNode.clientHeight - 40;
    let w = img.naturalWidth;
    let h = img.naturalHeight;
    let scale = Math.min(maxW / w, maxH / h, 1);
    editorCanvas.width = Math.round(w * scale);
    editorCanvas.height = Math.round(h * scale);
    editorCanvas.style.display = 'block';
    editorCtx.filter = 'none';
    editorCtx.drawImage(img, 0, 0, editorCanvas.width, editorCanvas.height);
  };
  img.src = src;
}

export function applyAdjustFilters() {
  if (!editorCtx || !editorCanvas) return;
  let brightness = parseInt(document.getElementById('olyAdjBrightness').value) / 100;
  let contrast = parseInt(document.getElementById('olyAdjContrast').value) / 100;
  let saturation = parseInt(document.getElementById('olyAdjSaturation').value) / 100;
  let blur = parseInt(document.getElementById('olyAdjBlur').value);
  let hue = parseInt(document.getElementById('olyAdjHue').value);
  let opacity = parseInt(document.getElementById('olyAdjOpacity').value) / 100;

  let filter = '';
  if (brightness !== 1) filter += 'brightness(' + brightness + ') ';
  if (contrast !== 1) filter += 'contrast(' + contrast + ') ';
  if (saturation !== 1) filter += 'saturate(' + saturation + ') ';
  if (blur > 0) filter += 'blur(' + blur + 'px) ';
  if (hue !== 0) filter += 'hue-rotate(' + hue + 'deg) ';
  if (opacity !== 1) filter += 'opacity(' + opacity + ') ';

  let img = new Image();
  img.onload = function () {
    editorCtx.filter = filter.trim() || 'none';
    editorCtx.clearRect(0, 0, editorCanvas.width, editorCanvas.height);
    editorCtx.drawImage(img, 0, 0, editorCanvas.width, editorCanvas.height);
    editorCtx.filter = 'none';
  };
  img.src = editorOriginalSrc;
}

export function applyCanvasRotate() {
  if (!editorCanvas || !editorCtx) return;
  destroyCropper();
  let img = new Image();
  img.onload = function () {
    let w = editorCanvas.width;
    let h = editorCanvas.height;
    editorCanvas.width = h;
    editorCanvas.height = w;
    editorCtx.clearRect(0, 0, h, w);
    editorCtx.save();
    editorCtx.translate(h, 0);
    editorCtx.rotate(Math.PI / 2);
    editorCtx.drawImage(img, 0, 0, w, h);
    editorCtx.restore();
    setEditorWorkingSrc(editorCanvas.toDataURL('image/png'));
  };
  img.src = editorCanvas.toDataURL('image/png');
}

export function applyCanvasFlip(direction) {
  if (!editorCanvas || !editorCtx) return;
  destroyCropper();
  let img = new Image();
  img.onload = function () {
    editorCtx.clearRect(0, 0, editorCanvas.width, editorCanvas.height);
    editorCtx.save();
    if (direction === 'h') {
      editorCtx.translate(editorCanvas.width, 0);
      editorCtx.scale(-1, 1);
    } else {
      editorCtx.translate(0, editorCanvas.height);
      editorCtx.scale(1, -1);
    }
    editorCtx.drawImage(img, 0, 0, editorCanvas.width, editorCanvas.height);
    editorCtx.restore();
    setEditorWorkingSrc(editorCanvas.toDataURL('image/png'));
  };
  img.src = editorCanvas.toDataURL('image/png');
}

export function destroyCropper() {
  if (editorCropper) {
    editorCropper.destroy();
    setEditorCropper(null);
  }
  let wrap = document.getElementById('olyEditorCanvasWrap');
  if (wrap) wrap.style.overflow = 'visible';
  if (editorCanvas) editorCanvas.style.display = 'block';
}

export function startCropMode() {
  if (!editorCanvas) return;
  destroyCropper();
  let wrap = document.getElementById('olyEditorCanvasWrap');
  if (wrap) wrap.style.overflow = 'hidden';

  editorCanvas.style.display = 'block';

  if (typeof Cropper !== 'undefined') {
    setEditorCropper(new Cropper(editorCanvas, {
      viewMode: 1,
      autoCropArea: 0.8,
      responsive: true,
      background: false
    }));
  }

  let tools = editorModal.querySelectorAll('.oly-edit-tool');
  for (let i = 0; i < tools.length; i++) {
    tools[i].classList.remove('oly-tool-active');
  }
  let cropBtn = editorModal.querySelector('.oly-edit-tool[data-tool="crop"]');
  if (cropBtn) cropBtn.classList.add('oly-tool-active');
}
