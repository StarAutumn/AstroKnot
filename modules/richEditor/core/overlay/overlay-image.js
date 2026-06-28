// ============================================================
//  overlay/overlay-image.js — 图片专属功能
// ============================================================

import { overlayImages, getNextZIndex, selectImage, transactRender, getInsertY, getInsertX } from './overlay-images.js';
import { getActiveBlockId, getBlockWidth, pxToPct } from './overlay-block.js';

let _fileInput = null;

function getFileInput() {
  if (!_fileInput) {
    _fileInput = document.createElement('input');
    _fileInput.type = 'file';
    _fileInput.accept = 'image/*';
    _fileInput.multiple = true;
    _fileInput.style.display = 'none';
    document.body.appendChild(_fileInput);
    _fileInput.addEventListener('change', function () {
      if (this.files) {
        for (let i = 0; i < this.files.length; i++) {
          addImageFromFile(this.files[i]);
        }
        this.value = '';
      }
    });
  }
  return _fileInput;
}

export function openImagePicker() {
  getFileInput().click();
}

export function addImageFromFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  let reader = new FileReader();
  reader.onload = function () {
    let dataUrl = reader.result;
    let img = new Image();
    img.onload = function () {
      let maxW = 300;
      let maxH = 200;
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w > maxW || h > maxH) {
        let ratio = Math.min(maxW / w, maxH / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      let blockId = getActiveBlockId();
      let blockW = blockId ? getBlockWidth(blockId) : 800;
      let x = Math.max(0, (blockW - w) / 2);
      let y = getInsertY();
      let imgData = {
        type: 'image',
        id: 'oly-img-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
        blockId: blockId,
        src: dataUrl,
        x: x,
        y: y,
        width: w,
        height: h,
        zIndex: getNextZIndex(),
        leftPct: pxToPct(x, blockW),
        widthPct: pxToPct(w, blockW),
        _refWidth: blockW
      };
      overlayImages.push(imgData);
      selectImage(imgData.id);
      transactRender();
    };
    img.src = dataUrl;
  };
  reader.readAsDataURL(file);
}

export function renderImageContent(item, imgData) {
  let img = document.createElement('img');
  img.src = imgData.src;

  let style =
    'width:100%;height:100%;object-fit:contain;display:block;' +
    'pointer-events:none;user-select:none;-webkit-user-drag:none;';

  if (imgData.fmtBorderWidth > 0) {
    style += 'border:' + imgData.fmtBorderWidth + 'px ' + (imgData.fmtBorderStyle || 'solid') + ' ' + (imgData.fmtBorderColor || '#aef0ff') + ';';
    style += 'box-sizing:border-box;';
  }

  let filter = '';

  if (imgData.fmtShadowBlur > 0 && imgData.fmtShadowOpacity > 0) {
    let hex = imgData.fmtShadowColor || '#000000';
    let r = parseInt(hex.slice(1, 3), 16);
    let g = parseInt(hex.slice(3, 5), 16);
    let b = parseInt(hex.slice(5, 7), 16);
    filter += 'drop-shadow(' + (imgData.fmtShadowX || 0) + 'px ' + (imgData.fmtShadowY || 0) + 'px ' + imgData.fmtShadowBlur + 'px rgba(' + r + ',' + g + ',' + b + ',' + imgData.fmtShadowOpacity + ')) ';
  }

  if (imgData.fmtGlowSize > 0 && imgData.fmtGlowOpacity > 0) {
    let gr = parseInt((imgData.fmtGlowColor || '#aef0ff').slice(1, 3), 16);
    let gg = parseInt((imgData.fmtGlowColor || '#aef0ff').slice(3, 5), 16);
    let gb = parseInt((imgData.fmtGlowColor || '#aef0ff').slice(5, 7), 16);
    filter += 'drop-shadow(0 0 ' + imgData.fmtGlowSize + 'px rgba(' + gr + ',' + gg + ',' + gb + ',' + imgData.fmtGlowOpacity + ')) ';
  }

  let adjB = imgData.adjBrightness != null ? imgData.adjBrightness : 100;
  let adjC = imgData.adjContrast != null ? imgData.adjContrast : 100;
  let adjS = imgData.adjSaturation != null ? imgData.adjSaturation : 100;
  let adjH = imgData.adjHue || 0;
  let adjBl = imgData.adjBlur || 0;
  let adjO = imgData.adjOpacity != null ? imgData.adjOpacity : 100;
  if (adjB !== 100) filter += 'brightness(' + (adjB / 100) + ') ';
  if (adjC !== 100) filter += 'contrast(' + (adjC / 100) + ') ';
  if (adjS !== 100) filter += 'saturate(' + (adjS / 100) + ') ';
  if (adjH !== 0) filter += 'hue-rotate(' + adjH + 'deg) ';
  if (adjBl > 0) filter += 'blur(' + adjBl + 'px) ';
  if (adjO !== 100) filter += 'opacity(' + (adjO / 100) + ') ';

  if (filter) style += 'filter:' + filter.trim() + ';';

  if (imgData.fmtSoftEdge > 0) {
    style += '-webkit-mask-image:radial-gradient(ellipse at center, black ' + (100 - imgData.fmtSoftEdge) + '%, transparent 100%);';
    style += 'mask-image:radial-gradient(ellipse at center, black ' + (100 - imgData.fmtSoftEdge) + '%, transparent 100%);';
  }

  if (imgData.fmtReflectOpacity > 0 && imgData.fmtReflectSize > 0) {
    style += '-webkit-box-reflect:below ' + (imgData.fmtReflectDistance || 0) + 'px ' +
      'linear-gradient(transparent, rgba(255,255,255,' + (imgData.fmtReflectOpacity / 100) + ') ' + (imgData.fmtReflectSize) + '%);';
    style += 'overflow:visible;';
    style += 'margin-bottom:' + (imgData.fmtReflectDistance || 0) + 'px;';
  }

  img.style.cssText = style;
  img.draggable = false;
  item.appendChild(img);
}
