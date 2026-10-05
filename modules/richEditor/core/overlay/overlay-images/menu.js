// ============================================================
//  overlay/overlay-images/menu.js — 多选/对齐/右键菜单/图层操作
//  - 多选右键菜单 showMultiSelectContextMenu（合并/对齐/图层/批量删除）
//  - mergeSelectedItems（离屏 canvas 合并）+ multiLayerAction / alignItems /
//    deleteMultiSelected
//  - 单元素右键菜单 showContextMenu（内嵌 getContextMenuItems /
//    pickColorForShape，保持原嵌套结构）
//  - 图层操作：bringToFront / sendToBack / moveUp / moveDown / deleteImage
// ============================================================

import { enterTextBoxEdit } from '../overlay-textbox.js';
import { openVideoEditor } from '../../video-editor/index.js';
import { openAudioEditor } from '../overlay-audio-editor/index.js';
import { openExcelEditor } from '../overlay-excel-editor.js';
import { openChartEditor } from '../overlay-chart-editor.js';
import { openAdvancedEditor, openCropEditor, openAdjustEditor, rotateImage, flipImage } from '../overlay-image-editor/index.js';
import {
  overlayImages, selectedImageIds, getNextZIndex, getZIndexValue, setZIndexValue,
  getSelectedImages, rgbaToHex, hideContextMenu, hideContextMenuOnOutside, setCtxMenuEl
} from './share.js';
import { renderAll, transactRender, deselectImage, renderItemToCanvas } from './render.js';
// ── 多选右键菜单 ──
function showMultiSelectContextMenu(x, y) {
  hideContextMenu();
  let ctxMenuEl = document.createElement('div');
  setCtxMenuEl(ctxMenuEl);
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
      zIndex: getNextZIndex(),
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

// ── 多选图层操作 ──
function multiLayerAction(action) {
  let items = getSelectedImages();
  items.forEach(function (item) {
    if (action === 'front') {
      item.zIndex = getNextZIndex();
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
  let ctxMenuEl = document.createElement('div');
  setCtxMenuEl(ctxMenuEl);
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
  } else if (type === 'chart') {
    items = [
      { label: '━━ 图表编辑 ━━', action: null, separator: true },
      { label: '📊 打开编辑器', action: function () { openChartEditor(imgData); } },
      { label: '━━ 图表类型 ━━', action: null, separator: true },
      { label: '柱状图', action: function () { imgData.chartType = 'bar'; renderAll(); } },
      { label: '堆叠柱状图', action: function () { imgData.chartType = 'barStack'; renderAll(); } },
      { label: '条形图', action: function () { imgData.chartType = 'barHorizontal'; renderAll(); } },
      { label: '折线图', action: function () { imgData.chartType = 'line'; renderAll(); } },
      { label: '面积图', action: function () { imgData.chartType = 'lineArea'; renderAll(); } },
      { label: '饼状图', action: function () { imgData.chartType = 'pie'; renderAll(); } },
      { label: '环形图', action: function () { imgData.chartType = 'pieDoughnut'; renderAll(); } },
      { label: '散点图', action: function () { imgData.chartType = 'scatter'; renderAll(); } },
      { label: '雷达图', action: function () { imgData.chartType = 'radar'; renderAll(); } },
      { label: '漏斗图', action: function () { imgData.chartType = 'funnel'; renderAll(); } },
      { label: '仪表盘', action: function () { imgData.chartType = 'gauge'; renderAll(); } },
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

function bringToFront(imgData) {
  imgData.zIndex = getNextZIndex();
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
  if (imgData.zIndex >= getZIndexValue()) setZIndexValue(imgData.zIndex + 1);
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

export { showMultiSelectContextMenu, showContextMenu };
