// ============================================================
//  toolbar/toolbar-draw.js — 绘图 tab（画笔工具）
// ============================================================

import { overlayImages, ensureOverlay, renderAll, transactRender, selectImage, getNextZIndex, getInsertY } from '../overlay/overlay-images.js';

let drawCanvasEl = null;
let drawCtx = null;
let isDrawing = false;
let currentTool = 'pen';
let currentColor = '#aef0ff';
let currentSize = 3;
let currentLineStyle = 'solid';
let drawHistory = [];
let drawHistoryIdx = -1;
let drawActive = false;
let rainbowHue = 0;
let lastDrawX = 0;
let lastDrawY = 0;
let tempCanvas = null;
let tempCtx = null;

function getEditorBody() {
  return document.querySelector('#ckEditorContainer .mce-content-body');
}

function createDrawCanvas() {
  let body = getEditorBody();
  if (!body) return null;
  if (drawCanvasEl && drawCanvasEl.parentNode === body) return drawCanvasEl;
  removeDrawCanvas();

  drawCanvasEl = document.createElement('canvas');
  let w = body.scrollWidth || 800;
  let h = body.scrollHeight || 600;
  drawCanvasEl.width = w;
  drawCanvasEl.height = h;
  drawCanvasEl.id = 'drawCanvasOverlay';
  drawCanvasEl.style.cssText =
    'position:absolute;left:0;top:0;width:' + w + 'px;height:' + h + 'px;' +
    'z-index:6;pointer-events:none;cursor:crosshair;';
  body.appendChild(drawCanvasEl);
  drawCtx = drawCanvasEl.getContext('2d');
  return drawCanvasEl;
}

function removeDrawCanvas() {
  if (drawCanvasEl && drawCanvasEl.parentNode) {
    drawCanvasEl.parentNode.removeChild(drawCanvasEl);
  }
  drawCanvasEl = null;
  drawCtx = null;
}

function getCanvasPos(e) {
  let rect = drawCanvasEl.getBoundingClientRect();
  let body = getEditorBody();
  let scrollX = body ? body.scrollLeft : 0;
  let scrollY = body ? body.scrollTop : 0;
  let scaleX = drawCanvasEl.width / rect.width;
  let scaleY = drawCanvasEl.height / rect.height;
  return {
    x: (e.clientX - rect.left + scrollX) * scaleX,
    y: (e.clientY - rect.top + scrollY) * scaleY
  };
}

function ensureTempCanvas() {
  if (!drawCanvasEl) return;
  if (tempCanvas && tempCanvas.parentNode) return;
  tempCanvas = document.createElement('canvas');
  tempCanvas.width = drawCanvasEl.width;
  tempCanvas.height = drawCanvasEl.height;
  tempCanvas.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;z-index:7;pointer-events:none;';
  drawCanvasEl.parentNode.appendChild(tempCanvas);
  tempCtx = tempCanvas.getContext('2d');
}

function removeTempCanvas() {
  if (tempCanvas && tempCanvas.parentNode) {
    tempCanvas.parentNode.removeChild(tempCanvas);
  }
  tempCanvas = null;
  tempCtx = null;
}

function drawPencilTexture(ctx, x, y, size, color) {
  let count = Math.max(2, Math.floor(size * 3));
  for (let i = 0; i < count; i++) {
    let angle = Math.random() * Math.PI * 2;
    let dist = Math.random() * size * 1.5;
    let px = x + Math.cos(angle) * dist;
    let py = y + Math.sin(angle) * dist;
    let r = Math.random() * size * 0.3 + 0.3;
    ctx.globalAlpha = Math.random() * 0.4 + 0.2;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPencilSegment(ctx, x0, y0, x1, y1, size, color) {
  let dx = x1 - x0;
  let dy = y1 - y0;
  let dist = Math.sqrt(dx * dx + dy * dy);
  let steps = Math.max(1, Math.floor(dist / 2));
  for (let s = 0; s <= steps; s++) {
    let t = steps === 0 ? 0 : s / steps;
    let px = x0 + dx * t;
    let py = y0 + dy * t;
    drawPencilTexture(ctx, px, py, size, color);
  }
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  let a = s * Math.min(l, 1 - l);
  let f = function (n) {
    let k = (n + h / 30) % 12;
    let color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return '#' + f(0) + f(8) + f(4);
}

function startDrawMode() {
  let canvas = createDrawCanvas();
  if (!canvas) return;
  drawActive = true;
  canvas.style.pointerEvents = 'auto';
  canvas.style.cursor = 'crosshair';
  isDrawing = false;

  canvas.onpointerdown = function (e) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    isDrawing = true;
    canvas.setPointerCapture(e.pointerId);
    let pos = getCanvasPos(e);
    lastDrawX = pos.x;
    lastDrawY = pos.y;

    if (currentTool === 'highlighter') {
      ensureTempCanvas();
      tempCtx.lineCap = 'round';
      tempCtx.lineJoin = 'round';
      tempCtx.lineWidth = currentSize * 4;
      tempCtx.strokeStyle = currentColor;
      tempCtx.globalAlpha = 1;
      tempCtx.globalCompositeOperation = 'source-over';
      tempCtx.setLineDash([]);
      tempCtx.beginPath();
      tempCtx.moveTo(pos.x, pos.y);
    } else if (currentTool === 'pencil') {
      drawCtx.globalCompositeOperation = 'source-over';
      drawPencilTexture(drawCtx, pos.x, pos.y, Math.max(1, currentSize * 0.8), currentColor);
      drawCtx.globalAlpha = 1;
    } else if (currentTool === 'rainbow') {
      drawCtx.globalCompositeOperation = 'source-over';
      drawCtx.lineCap = 'round';
      drawCtx.lineJoin = 'round';
      drawCtx.lineWidth = currentSize;
      drawCtx.globalAlpha = 1;
      drawCtx.setLineDash([]);
      rainbowHue = 0;
      drawCtx.strokeStyle = hslToHex(rainbowHue, 100, 50);
      drawCtx.beginPath();
      drawCtx.moveTo(pos.x, pos.y);
    } else if (currentTool === 'eraser') {
      drawCtx.globalCompositeOperation = 'destination-out';
      drawCtx.lineWidth = currentSize * 6;
      drawCtx.globalAlpha = 1;
      drawCtx.lineCap = 'round';
      drawCtx.lineJoin = 'round';
      drawCtx.setLineDash([]);
      drawCtx.beginPath();
      drawCtx.moveTo(pos.x, pos.y);
    } else {
      drawCtx.globalCompositeOperation = 'source-over';
      drawCtx.strokeStyle = currentColor;
      drawCtx.globalAlpha = 1;
      drawCtx.lineWidth = currentSize;
      drawCtx.lineCap = 'round';
      drawCtx.lineJoin = 'round';
      if (currentLineStyle === 'dashed') {
        drawCtx.setLineDash([12, 6]);
      } else if (currentLineStyle === 'dotted') {
        drawCtx.setLineDash([3, 6]);
      } else {
        drawCtx.setLineDash([]);
      }
      drawCtx.beginPath();
      drawCtx.moveTo(pos.x, pos.y);
    }
  };

  canvas.onpointermove = function (e) {
    if (!isDrawing) return;
    let pos = getCanvasPos(e);

    if (currentTool === 'pencil') {
      drawPencilSegment(drawCtx, lastDrawX, lastDrawY, pos.x, pos.y, Math.max(1, currentSize * 0.8), currentColor);
      drawCtx.globalAlpha = 1;
      drawCtx.globalCompositeOperation = 'source-over';
    } else if (currentTool === 'highlighter') {
      if (tempCtx) {
        tempCtx.lineTo(pos.x, pos.y);
        tempCtx.stroke();
      }
    } else if (currentTool === 'rainbow') {
      rainbowHue = (rainbowHue + 2) % 360;
      drawCtx.strokeStyle = hslToHex(rainbowHue, 100, 50);
      drawCtx.beginPath();
      drawCtx.moveTo(lastDrawX, lastDrawY);
      drawCtx.lineTo(pos.x, pos.y);
      drawCtx.stroke();
    } else {
      drawCtx.lineTo(pos.x, pos.y);
      drawCtx.stroke();
    }
    lastDrawX = pos.x;
    lastDrawY = pos.y;
  };

  canvas.onpointerup = function (e) {
    if (!isDrawing) return;
    isDrawing = false;

    if (currentTool === 'highlighter' && tempCanvas && tempCtx) {
      drawCtx.globalCompositeOperation = 'source-over';
      drawCtx.globalAlpha = 0.35;
      drawCtx.drawImage(tempCanvas, 0, 0);
      drawCtx.globalAlpha = 1;
      tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
      removeTempCanvas();
    }

    drawCtx.globalAlpha = 1;
    drawCtx.globalCompositeOperation = 'source-over';
    drawCtx.setLineDash([]);
    saveDrawState();
  };

  canvas.onpointerleave = function () {
    if (!isDrawing) return;
  };
}

function stopDrawMode() {
  drawActive = false;
  removeTempCanvas();
  if (drawCanvasEl) {
    drawCanvasEl.style.pointerEvents = 'none';
    drawCanvasEl.style.cursor = 'default';
    drawCanvasEl.onpointerdown = null;
    drawCanvasEl.onpointermove = null;
    drawCanvasEl.onpointerup = null;
    drawCanvasEl.onpointerleave = null;
  }
  isDrawing = false;
}

function saveDrawState() {
  if (!drawCanvasEl || !drawCtx) return;
  let dataUrl = drawCanvasEl.toDataURL('image/png');
  drawHistory = drawHistory.slice(0, drawHistoryIdx + 1);
  drawHistory.push(dataUrl);
  drawHistoryIdx = drawHistory.length - 1;
}

function undoDraw() {
  if (drawHistoryIdx <= 0) {
    if (drawCtx && drawCanvasEl) {
      drawCtx.clearRect(0, 0, drawCanvasEl.width, drawCanvasEl.height);
      drawHistoryIdx = -1;
    }
    return;
  }
  drawHistoryIdx--;
  restoreDrawState(drawHistory[drawHistoryIdx]);
}

function redoDraw() {
  if (drawHistoryIdx >= drawHistory.length - 1) return;
  drawHistoryIdx++;
  restoreDrawState(drawHistory[drawHistoryIdx]);
}

function restoreDrawState(dataUrl) {
  if (!drawCanvasEl || !drawCtx) return;
  let img = new Image();
  img.onload = function () {
    drawCtx.clearRect(0, 0, drawCanvasEl.width, drawCanvasEl.height);
    drawCtx.drawImage(img, 0, 0);
  };
  img.src = dataUrl;
}

function clearDraw() {
  if (!drawCanvasEl || !drawCtx) return;
  drawCtx.clearRect(0, 0, drawCanvasEl.width, drawCanvasEl.height);
  drawHistory = [];
  drawHistoryIdx = -1;
}

function saveDrawAsOverlay() {
  if (!drawCanvasEl) return;
  let dataUrl = drawCanvasEl.toDataURL('image/png');
  ensureOverlay();
  let body = getEditorBody();
  let imgData = {
    type: 'image',
    id: 'oly-draw-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
    src: dataUrl,
    x: 0,
    y: 0,
    width: drawCanvasEl.width,
    height: drawCanvasEl.height,
    zIndex: getNextZIndex()
  };
  overlayImages.push(imgData);
  selectImage(imgData.id);
  transactRender();
  clearDraw();
  removeDrawCanvas();
  drawActive = false;
}

export function getDrawData() {
  if (!drawCanvasEl) return null;
  let dataUrl = drawCanvasEl.toDataURL('image/png');
  if (!dataUrl || dataUrl === 'data:,') return null;
  return {
    canvasDataUrl: dataUrl,
    history: drawHistory.slice(),
    historyIdx: drawHistoryIdx,
    tool: currentTool,
    color: currentColor,
    size: currentSize,
    lineStyle: currentLineStyle,
    canvasWidth: drawCanvasEl.width,
    canvasHeight: drawCanvasEl.height
  };
}

export function setDrawData(data) {
  if (!data) return;
  if (data.color) currentColor = data.color;
  if (data.size) currentSize = data.size;
  if (data.lineStyle) currentLineStyle = data.lineStyle;
  if (data.tool) currentTool = data.tool;
  if (data.history) drawHistory = data.history.slice();
  if (data.historyIdx != null) drawHistoryIdx = data.historyIdx;

  if (data.canvasDataUrl && data.canvasDataUrl !== 'data:,') {
    let canvas = createDrawCanvas();
    if (!canvas) return;
    let img = new Image();
    img.onload = function () {
      if (drawCtx) {
        drawCtx.clearRect(0, 0, drawCanvasEl.width, drawCanvasEl.height);
        drawCtx.drawImage(img, 0, 0);
      }
    };
    img.src = data.canvasDataUrl;
    canvas.style.pointerEvents = 'none';
  }
}

export function clearDrawData() {
  clearDraw();
  removeDrawCanvas();
  removeTempCanvas();
  drawActive = false;
  drawHistory = [];
  drawHistoryIdx = -1;
}

export function registerDrawTab(editor) {
  // ── 画笔 ──
  try {
    editor.ui.registry.addIcon('draw-pen',
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#aef0ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M12 19l7-7 3 3-7 7-3-3z"/>' +
      '<path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>' +
      '<path d="M2 2l7.586 7.586"/>' +
      '<circle cx="11" cy="11" r="2"/>' +
      '</svg>'
    );
    editor.ui.registry.addButton('drawPen', {
      icon: 'draw-pen',
      tooltip: '画笔',
      onAction: function () {
        currentTool = 'pen';
        startDrawMode();
      }
    });
  } catch (e) { console.error('[TinyMCE] drawPen 注册失败:', e); }

  // ── 铅笔 ──
  try {
    editor.ui.registry.addIcon('draw-pencil',
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#aef0ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<line x1="18" y1="2" x2="22" y2="6"/>' +
      '<path d="M7.5 20.5L4 4l16.5 3.5L12 15z"/>' +
      '<path d="M15 21l-3-3"/>' +
      '</svg>'
    );
    editor.ui.registry.addButton('drawPencil', {
      icon: 'draw-pencil',
      tooltip: '铅笔',
      onAction: function () {
        currentTool = 'pencil';
        startDrawMode();
      }
    });
  } catch (e) { console.error('[TinyMCE] drawPencil 注册失败:', e); }

  // ── 荧光笔 ──
  try {
    editor.ui.registry.addIcon('draw-highlighter',
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#aef0ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M12 17l-5 5H3v-4l5-5"/>' +
      '<path d="M17 3l4 4L8 20l-4-4L17 3z"/>' +
      '</svg>'
    );
    editor.ui.registry.addButton('drawHighlighter', {
      icon: 'draw-highlighter',
      tooltip: '荧光笔',
      onAction: function () {
        currentTool = 'highlighter';
        startDrawMode();
      }
    });
  } catch (e) { console.error('[TinyMCE] drawHighlighter 注册失败:', e); }

  // ── 橡皮擦 ──
  try {
    editor.ui.registry.addIcon('draw-eraser',
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#aef0ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M20 20H7L3 16l9-9 8 8-4 4z"/>' +
      '<path d="M6.5 13.5L12 8"/>' +
      '</svg>'
    );
    editor.ui.registry.addButton('drawEraser', {
      icon: 'draw-eraser',
      tooltip: '橡皮擦',
      onAction: function () {
        currentTool = 'eraser';
        startDrawMode();
      }
    });
  } catch (e) { console.error('[TinyMCE] drawEraser 注册失败:', e); }

  // ── 彩色线条笔 ──
  try {
    editor.ui.registry.addIcon('draw-rainbow',
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round">' +
      '<path d="M4 18 Q8 6 12 12 Q16 18 20 6" stroke="#ff0000"/>' +
      '<path d="M4 16 Q8 4 12 10 Q16 16 20 4" stroke="#ff8800"/>' +
      '<path d="M4 14 Q8 2 12 8 Q16 14 20 2" stroke="#ffff00"/>' +
      '<path d="M4 12 Q8 0 12 6 Q16 12 20 0" stroke="#00ff00"/>' +
      '<path d="M4 10 Q8 -2 12 4 Q16 10 20 -2" stroke="#0088ff"/>' +
      '<path d="M4 8 Q8 -4 12 2 Q16 8 20 -4" stroke="#8800ff"/>' +
      '</svg>'
    );
    editor.ui.registry.addButton('drawRainbow', {
      icon: 'draw-rainbow',
      tooltip: '彩色线条笔',
      onAction: function () {
        currentTool = 'rainbow';
        startDrawMode();
      }
    });
  } catch (e) { console.error('[TinyMCE] drawRainbow 注册失败:', e); }

  // ── 颜色选择 ──
  try {
    editor.ui.registry.addButton('drawColor', {
      text: '🎨',
      tooltip: '画笔颜色',
      onAction: function () {
        let input = document.createElement('input');
        input.type = 'color';
        input.value = currentColor;
        input.style.cssText = 'position:absolute;opacity:0;pointer-events:none;';
        document.body.appendChild(input);
        input.addEventListener('input', function () {
          currentColor = input.value;
        });
        input.click();
        setTimeout(function () { if (input.parentNode) document.body.removeChild(input); }, 30000);
      }
    });
  } catch (e) { console.error('[TinyMCE] drawColor 注册失败:', e); }

  // ── 粗细 ──
  try {
    editor.ui.registry.addMenuButton('drawSize', {
      text: '粗细',
      tooltip: '画笔粗细',
      fetch: function (callback) {
        callback([
          { type: 'menuitem', text: '极细 (1px)', onAction: function () { currentSize = 1; } },
          { type: 'menuitem', text: '细 (2px)', onAction: function () { currentSize = 2; } },
          { type: 'menuitem', text: '中 (3px)', onAction: function () { currentSize = 3; } },
          { type: 'menuitem', text: '粗 (5px)', onAction: function () { currentSize = 5; } },
          { type: 'menuitem', text: '特粗 (8px)', onAction: function () { currentSize = 8; } },
          { type: 'menuitem', text: '超粗 (12px)', onAction: function () { currentSize = 12; } }
        ]);
      }
    });
  } catch (e) { console.error('[TinyMCE] drawSize 注册失败:', e); }

  // ── 线型 ──
  try {
    editor.ui.registry.addMenuButton('drawLineStyle', {
      text: '线型',
      tooltip: '线条样式',
      fetch: function (callback) {
        callback([
          { type: 'menuitem', text: '实线 ————', onAction: function () { currentLineStyle = 'solid'; } },
          { type: 'menuitem', text: '虚线 ––––––', onAction: function () { currentLineStyle = 'dashed'; } },
          { type: 'menuitem', text: '点线 ·······', onAction: function () { currentLineStyle = 'dotted'; } }
        ]);
      }
    });
  } catch (e) { console.error('[TinyMCE] drawLineStyle 注册失败:', e); }

  // ── 撤销 ──
  try {
    editor.ui.registry.addButton('drawUndo', {
      icon: 'undo',
      tooltip: '撤销绘图',
      onAction: function () { undoDraw(); }
    });
  } catch (e) { console.error('[TinyMCE] drawUndo 注册失败:', e); }

  // ── 重做 ──
  try {
    editor.ui.registry.addButton('drawRedo', {
      icon: 'redo',
      tooltip: '重做绘图',
      onAction: function () { redoDraw(); }
    });
  } catch (e) { console.error('[TinyMCE] drawRedo 注册失败:', e); }

  // ── 清除 ──
  try {
    editor.ui.registry.addButton('drawClear', {
      icon: 'remove',
      tooltip: '清除画布',
      onAction: function () { clearDraw(); }
    });
  } catch (e) { console.error('[TinyMCE] drawClear 注册失败:', e); }

  // ── 保存为图片 ──
  try {
    editor.ui.registry.addButton('drawSave', {
      icon: 'export',
      tooltip: '保存为图片',
      onAction: function () { saveDrawAsOverlay(); }
    });
  } catch (e) { console.error('[TinyMCE] drawSave 注册失败:', e); }

  // ── 停止绘图 ──
  try {
    editor.ui.registry.addButton('drawStop', {
      icon: 'close',
      tooltip: '退出绘图',
      onAction: function () { stopDrawMode(); }
    });
  } catch (e) { console.error('[TinyMCE] drawStop 注册失败:', e); }
}
