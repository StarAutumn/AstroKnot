// ============================================================
//  overlay/overlay-images/drag.js — 拖拽/自动滚动/全局事件
//  - 模块加载即注册的全局监听：mousemove（拖拽/缩放/旋转）、mouseup（含 undo
//    事务）、keydown（Delete/Escape）、mousedown（空白处取消选中）、click
//    （右键菜单外点击关闭）
//  - startAutoScroll / stopAutoScroll / _updateDraggedElements（RAF 直改 DOM，
//    避免整体重建导致音频播放器卡顿）
//  - _preDragState / _autoScrollRaf / _dragRenderRaf 为本模块内部状态；
//    dragInfo / resizeInfo / ctxMenuEl 等跨文件状态经 share.js 存取
// ============================================================

import { state } from '../../../shared-state.js';
import { getBlockElement, getActiveBlockId } from '../overlay-block.js';
import {
  overlayImages, selectedImageIds, findImageDataById, _updatePctFromPx,
  getDragInfo, setDragInfo, getResizeInfo, setResizeInfo, getCtxMenuEl, hideContextMenu
} from './share.js';
import { renderAll, deleteSelectedImage, deselectImage } from './render.js';

let _preDragState = null;
let _autoScrollRaf = null;
let _dragRenderRaf = null;

function startAutoScroll(e) {
  stopAutoScroll();
  function tick() {
    let dragInfo = getDragInfo();
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
    _updateDraggedElements();
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

// 拖动时直接更新 DOM 元素位置，避免重建整个 overlay（解决音频播放器卡顿）
function _updateDraggedElements() {
  let dragInfo = getDragInfo();
  if (!dragInfo) return;
  let dx = dragInfo._currentDx || 0;
  let dy = dragInfo._currentDy || 0;

  let body = document.querySelector('#ckEditorContainer .mce-content-body');
  if (!body) return;

  // 多选拖拽：移动所有选中项的 DOM
  if (selectedImageIds.size > 1 && selectedImageIds.has(dragInfo.imgData.id)) {
    selectedImageIds.forEach(function(sid) {
      let el = body.querySelector('[data-oly-id="' + sid + '"]');
      let orig = dragInfo._multiOrigins && dragInfo._multiOrigins[sid];
      if (el && orig) {
        el.style.left = (orig.x + dx) + 'px';
        el.style.top = (orig.y + dy) + 'px';
      }
    });
  } else {
    // 单选拖拽
    let el = body.querySelector('[data-oly-id="' + dragInfo.imgData.id + '"]');
    if (el) {
      el.style.left = (dragInfo.origX + dx) + 'px';
      el.style.top = (dragInfo.origY + dy) + 'px';
    }
  }
}

document.addEventListener('mousemove', function (e) {
  let dragInfo = getDragInfo();
  let resizeInfo = getResizeInfo();
  if (dragInfo) {
    if (!_preDragState) _preDragState = JSON.parse(JSON.stringify(overlayImages));
    let dx = e.clientX - dragInfo.startX;
    let dy = e.clientY - dragInfo.startY;
    dragInfo._currentDx = dx;
    dragInfo._currentDy = dy;

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

    // 多选拖拽：更新数据位置
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

    // 使用 RAF 节流，直接更新 DOM 位置而不重建
    if (!_dragRenderRaf) {
      _dragRenderRaf = requestAnimationFrame(function() {
        _dragRenderRaf = null;
        _updateDraggedElements();
      });
    }
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
  let dragInfo = getDragInfo();
  let resizeInfo = getResizeInfo();
  stopAutoScroll();
  if (_dragRenderRaf) {
    cancelAnimationFrame(_dragRenderRaf);
    _dragRenderRaf = null;
  }

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

  // 拖动结束后重新渲染，确保 DOM 与数据同步
  if (dragInfo) {
    renderAll();
  }

  setDragInfo(null);
  setResizeInfo(null);
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
  let ctxMenuEl = getCtxMenuEl();
  if (ctxMenuEl && !ctxMenuEl.contains(e.target)) {
    hideContextMenu();
  }
});
