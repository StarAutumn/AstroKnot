// ============================================================
//  overlay/overlay-images/share.js — 共享状态与通用工具
//  - 模块级可变状态：overlayImages / selectedImageIds（数组与 Set 仅原地变更、
//    引用恒定，直接导出）；nextZIndex / dragInfo / resizeInfo / ctxMenuEl
//    （可变标量，跨文件经 getter/setter 存取）
//  - z-index 工具：getNextZIndex / resetZIndex；插入坐标工具：getInsertY /
//    getInsertX / _updatePctFromPx
//  - 选中读取：getSelectedImage / getSelectedImages / findImageDataById
//  - 颜色工具 rgbaToHex；右键菜单元素清理 hideContextMenu / hideContextMenuOnOutside
// ============================================================

import { getActiveBlockId, getBlockWidth, pxToPct } from '../overlay-block.js';
let overlayImages = [];
let nextZIndex = 100;
let selectedImageIds = new Set();
let ctxMenuEl = null;
let dragInfo = null;
let resizeInfo = null;

// ── 可变状态 getter/setter（ESM import 绑定只读，跨文件一律经此存取）──
function getZIndexValue() { return nextZIndex; }
function setZIndexValue(v) { nextZIndex = v; }
function getDragInfo() { return dragInfo; }
function setDragInfo(v) { dragInfo = v; }
function getResizeInfo() { return resizeInfo; }
function setResizeInfo(v) { resizeInfo = v; }
function getCtxMenuEl() { return ctxMenuEl; }
function setCtxMenuEl(v) { ctxMenuEl = v; }

export function getNextZIndex() {
  return nextZIndex++;
}

export function resetZIndex(val) {
  nextZIndex = val || 100;
}

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

export {
  overlayImages, selectedImageIds,
  getZIndexValue, setZIndexValue,
  getDragInfo, setDragInfo,
  getResizeInfo, setResizeInfo,
  getCtxMenuEl, setCtxMenuEl,
  rgbaToHex,
  hideContextMenuOnOutside, hideContextMenu,
  findImageDataById, _updatePctFromPx
};
