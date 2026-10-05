// ============================================================
//  overlay-image-editor/modes.js — 编辑器模式管理
//  滤镜预设 / 自由旋转 / 画笔标注 / 文字水印 / 工具按钮高亮
// ============================================================

import {
  drawState, textState, filterPresets, textItems,
  editorCanvas, editorCtx, editorModal, editorOriginalSrc, editorWorkingSrc,
  setCurrentEditorMode, setCurrentFilterPreset, setFreeRotateAngle, setTextItems, setEditorWorkingSrc
} from './share.js';
import { destroyCropper } from './adjust.js';

export function deactivateAllModes() {
  // 退出画笔模式
  if (drawState.active) exitDrawMode();
  // 退出文字模式
  if (textState.active) exitTextMode();
  // 退出裁剪模式
  destroyCropper();
  // 重置自由旋转预览
  if (freeRotateAngle !== 0) {
    let canvas = document.getElementById('olyEditorCanvas');
    if (canvas) canvas.style.transform = '';
  }
}

export function activateFilterMode() {
  destroyCropper();
  highlightToolButton('filter');
  setCurrentEditorMode('filter');
}

export function applyFilterPreset(presetName) {
  setCurrentFilterPreset(presetName);
  if (!editorCtx || !editorCanvas) return;
  let filter = filterPresets[presetName] || '';
  let img = new Image();
  img.onload = function () {
    editorCtx.clearRect(0, 0, editorCanvas.width, editorCanvas.height);
    editorCtx.filter = filter || 'none';
    editorCtx.drawImage(img, 0, 0, editorCanvas.width, editorCanvas.height);
    editorCtx.filter = 'none';
  };
  img.src = editorWorkingSrc || editorOriginalSrc;
}

// ── 自由旋转 ──
export function activateFreeRotateMode() {
  destroyCropper();
  highlightToolButton('freeRotate');
  setCurrentEditorMode('freeRotate');
}

export function previewFreeRotate(degrees) {
  setFreeRotateAngle(degrees);
  let canvas = document.getElementById('olyEditorCanvas');
  if (canvas) canvas.style.transform = 'rotate(' + degrees + 'deg)';
}

export function applyFreeRotate() {
  if (freeRotateAngle === 0 || !editorCanvas || !editorCtx) return;
  let degrees = freeRotateAngle;
  let radians = degrees * Math.PI / 180;
  let img = new Image();
  img.onload = function () {
    let w = editorCanvas.width;
    let h = editorCanvas.height;
    // 计算旋转后的画布大小
    let cos = Math.abs(Math.cos(radians));
    let sin = Math.abs(Math.sin(radians));
    let newW = Math.ceil(w * cos + h * sin);
    let newH = Math.ceil(w * sin + h * cos);
    let tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = newW;
    tmpCanvas.height = newH;
    let tmpCtx = tmpCanvas.getContext('2d');
    tmpCtx.translate(newW / 2, newH / 2);
    tmpCtx.rotate(radians);
    tmpCtx.drawImage(img, -w / 2, -h / 2, w, h);
    // 更新编辑器画布
    editorCanvas.width = newW;
    editorCanvas.height = newH;
    editorCtx.drawImage(tmpCanvas, 0, 0);
    setEditorWorkingSrc(editorCanvas.toDataURL('image/png'));
    // 重置旋转预览
    editorCanvas.style.transform = '';
    setFreeRotateAngle(0);
    document.getElementById('olyFreeRotate').value = 0;
    document.getElementById('olyFreeRotateVal').textContent = '0°';
  };
  img.src = editorCanvas.toDataURL('image/png');
}

// ── 画笔标注 ──
export function activateDrawMode() {
  destroyCropper();
  drawState.active = true;
  drawState.eraser = false;
  highlightToolButton('draw');
  setCurrentEditorMode('draw');

  let overlay = document.getElementById('olyDrawOverlay');
  let canvas = document.getElementById('olyEditorCanvas');
  if (!overlay || !canvas) return;

  // 对齐覆盖层到画布
  let rect = canvas.getBoundingClientRect();
  let wrapRect = canvas.parentElement.getBoundingClientRect();
  overlay.style.left = (rect.left - wrapRect.left) + 'px';
  overlay.style.top = (rect.top - wrapRect.top) + 'px';
  overlay.width = rect.width;
  overlay.height = rect.height;
  overlay.style.width = rect.width + 'px';
  overlay.style.height = rect.height + 'px';
  overlay.style.display = 'block';
  overlay.style.pointerEvents = 'auto';
  overlay.style.cursor = 'crosshair';

  let drawCtx = overlay.getContext('2d');
  let isDrawing = false;
  let lastX = 0, lastY = 0;

  function getPos(e) {
    let r = overlay.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function startDraw(e) {
    isDrawing = true;
    let pos = getPos(e);
    lastX = pos.x;
    lastY = pos.y;
  }

  function doDraw(e) {
    if (!isDrawing) return;
    let pos = getPos(e);
    let size = parseInt(document.getElementById('olyDrawSize').value) || 3;
    // 缩放比例（覆盖层可能和实际画布不同大小）
    let scaleX = editorCanvas.width / overlay.width;
    let scaleY = editorCanvas.height / overlay.height;

    drawCtx.beginPath();
    drawCtx.moveTo(lastX, lastY);
    drawCtx.lineTo(pos.x, pos.y);
    drawCtx.lineWidth = size;
    drawCtx.lineCap = 'round';
    drawCtx.lineJoin = 'round';

    if (drawState.eraser) {
      drawCtx.globalCompositeOperation = 'destination-out';
      drawCtx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      drawCtx.globalCompositeOperation = 'source-over';
      drawCtx.strokeStyle = document.getElementById('olyDrawColor').value;
    }
    drawCtx.stroke();

    // 记录路径
    drawState.paths.push({
      x1: lastX * scaleX, y1: lastY * scaleY,
      x2: pos.x * scaleX, y2: pos.y * scaleY,
      size: size * scaleX,
      color: drawState.eraser ? 'eraser' : document.getElementById('olyDrawColor').value
    });

    lastX = pos.x;
    lastY = pos.y;
  }

  function endDraw() { isDrawing = false; }

  overlay._onMouseDown = startDraw;
  overlay._onMouseMove = doDraw;
  overlay._onMouseUp = endDraw;
  overlay.addEventListener('mousedown', startDraw);
  overlay.addEventListener('mousemove', doDraw);
  overlay.addEventListener('mouseup', endDraw);
  overlay.addEventListener('mouseleave', endDraw);
}

function exitDrawMode() {
  drawState.active = false;
  let overlay = document.getElementById('olyDrawOverlay');
  if (overlay) {
    overlay.style.display = 'none';
    overlay.style.pointerEvents = 'none';
    if (overlay._onMouseDown) overlay.removeEventListener('mousedown', overlay._onMouseDown);
    if (overlay._onMouseMove) overlay.removeEventListener('mousemove', overlay._onMouseMove);
    if (overlay._onMouseUp) overlay.removeEventListener('mouseup', overlay._onMouseUp);
    if (overlay._onMouseLeave) overlay.removeEventListener('mouseleave', overlay._onMouseLeave);
  }
}

export function clearDrawOverlay() {
  let overlay = document.getElementById('olyDrawOverlay');
  if (overlay) {
    let ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, overlay.width, overlay.height);
  }
  drawState.paths = [];
}

export function flattenDrawToCanvas() {
  if (!editorCanvas || !editorCtx) return;
  let overlay = document.getElementById('olyDrawOverlay');
  if (!overlay) return;

  // 将覆盖层绘制到主画布（按比例缩放）
  editorCtx.drawImage(overlay, 0, 0, editorCanvas.width, editorCanvas.height);
  setEditorWorkingSrc(editorCanvas.toDataURL('image/png'));
  clearDrawOverlay();
}

export function activateTextMode() {
  destroyCropper();
  textState.active = true;
  highlightToolButton('text');
  setCurrentEditorMode('text');
}

function exitTextMode() {
  textState.active = false;
  let wrap = document.getElementById('olyTextInputWrap');
  if (wrap) wrap.style.display = 'none';
}

export function placeTextOnCanvas() {
  let content = document.getElementById('olyTextContent').value;
  if (!content.trim() || !editorCanvas || !editorCtx) return;

  let font = document.getElementById('olyTextFont').value;
  let size = parseInt(document.getElementById('olyTextSize').value) || 32;
  let color = document.getElementById('olyTextColor').value;
  let opacity = (parseInt(document.getElementById('olyTextOpacity').value) || 100) / 100;
  let stroke = document.getElementById('olyTextStroke').value;

  // 在画布中心放置文字
  let x = editorCanvas.width / 2;
  let y = editorCanvas.height / 2;

  textItems.push({ text: content, x: x, y: y, font: font, size: size, color: color, opacity: opacity, stroke: stroke });
  renderTextItems();
}

function renderTextItems() {
  if (!editorCanvas || !editorCtx) return;
  // 先重绘底图
  let img = new Image();
  img.onload = function () {
    editorCtx.clearRect(0, 0, editorCanvas.width, editorCanvas.height);
    editorCtx.drawImage(img, 0, 0, editorCanvas.width, editorCanvas.height);
    // 绘制所有文字
    textItems.forEach(function (item) {
      editorCtx.save();
      editorCtx.globalAlpha = item.opacity;
      editorCtx.font = 'bold ' + item.size + 'px ' + item.font;
      editorCtx.textAlign = 'center';
      editorCtx.textBaseline = 'middle';
      // 描边
      if (item.stroke) {
        editorCtx.strokeStyle = item.stroke;
        editorCtx.lineWidth = Math.max(1, item.size / 12);
        editorCtx.strokeText(item.text, item.x, item.y);
      }
      // 填充
      editorCtx.fillStyle = item.color;
      editorCtx.fillText(item.text, item.x, item.y);
      editorCtx.restore();
    });
  };
  img.src = editorWorkingSrc || editorOriginalSrc;
}

export function flattenTextToCanvas() {
  if (textItems.length === 0) return;
  // 文字已经渲染到画布上了，只需更新 workingSrc
  setEditorWorkingSrc(editorCanvas.toDataURL('image/png'));
  setTextItems([]);
}

export function highlightToolButton(toolName) {
  let tools = editorModal.querySelectorAll('.oly-edit-tool');
  for (let i = 0; i < tools.length; i++) {
    tools[i].classList.remove('oly-tool-active');
  }
  let btn = editorModal.querySelector('.oly-edit-tool[data-tool="' + toolName + '"]');
  if (btn) btn.classList.add('oly-tool-active');
}
