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

// 浏览器原生拖拽一旦启动，会生成「整个画布块」的半透明拖影跟随鼠标，
// 并把高频 mousemove 合并成低频 drag 事件，导致自定义拖拽又卡又飘。
// 画布块内的拖拽全部由本模块的 mousemove 逻辑处理，这里统一掐掉原生拖拽。
// 注意：必须用 stopImmediatePropagation——TinyMCE 7 的 dragstart 监听同样挂在
// document 捕获阶段（同节点同阶段），普通 stopPropagation 拦不住它，它会继续
// cloneNode 整块塞进 mce-drag-container（opacity 0.5）生成拖影。
document.addEventListener('dragstart', function (e) {
  let t = e.target;
  if (t && t.closest && t.closest('.tmce-overlay-block')) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }
}, true);

let _preDragState = null;
let _autoScrollRaf = null;
let _dragRenderRaf = null;

// 几何字段：拖拽/缩放/旋转只会改动这些字段，
// undo 快照不再深拷贝整个 overlayImages（可能含 base64 音视频，体积巨大）
const _GEO_KEYS = ['x', 'y', 'width', 'height', 'rotation', 'leftPct', 'widthPct'];

function _snapshotGeometry() {
  return overlayImages.map(function (d) {
    let snap = { id: d.id };
    for (let i = 0; i < _GEO_KEYS.length; i++) {
      let k = _GEO_KEYS[i];
      if (d[k] !== undefined) snap[k] = d[k];
    }
    return snap;
  });
}

function _applyGeometrySnapshot(snap) {
  if (!snap) return;
  for (let i = 0; i < snap.length; i++) {
    let s = snap[i];
    let d = findImageDataById(s.id);
    if (!d) continue;
    for (let j = 0; j < _GEO_KEYS.length; j++) {
      let k = _GEO_KEYS[j];
      if (s[k] === undefined) delete d[k];
      else d[k] = s[k];
    }
  }
}

// 直接改 DOM 的旋转（不重建元素，避免音视频重解码/图表重建）
function _applyRotationDom(el, imgData) {
  el.style.transformOrigin = 'center center';
  let t = 'rotate(' + (imgData.rotation || 0) + 'deg)';
  if (imgData.flipH || imgData.flipV) {
    t += ' scale(' + (imgData.flipH ? -1 : 1) + ',' + (imgData.flipV ? -1 : 1) + ')';
  }
  el.style.transform = t;
}

// 缩放时图表需要重新布局（RAF 节流）
let _chartResizeRaf = null;
function _scheduleChartResize(el) {
  if (_chartResizeRaf || !el) return;
  let holder = el._olyChart;
  _chartResizeRaf = requestAnimationFrame(function () {
    _chartResizeRaf = null;
    if (holder && holder.inst && !holder.pending) {
      try { holder.inst.resize(); } catch (e) { /* 忽略 */ }
    }
  });
}

function startAutoScroll(e) {
  stopAutoScroll();
  function tick() {
    let dragInfo = getDragInfo();
    let body = (dragInfo && dragInfo._bodyEl) || document.querySelector('#ckEditorContainer .mce-content-body');
    if (!body || !dragInfo) { stopAutoScroll(); return; }
    let rect = dragInfo._bodyRect || body.getBoundingClientRect();
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

  // 位移必须用 transform（合成器路径）而非 left/top：
  // Windows 125% 等非整数 DPR 下，canvas/video 等合成层改 left/top 移动会
  // 因光栅化 tile 错位在旧位置留下半透明残影（表现为「整个画布框虚影」），
  // translate 由合成器直接移动整层、不经过重绘，可彻底消除残影。
  // left/top 固定为拖拽起点，松手后 renderAll 按数据坐标落位并清掉 transform。
  function _place(el, origX, origY) {
    el.style.left = origX + 'px';
    el.style.top = origY + 'px';
    el.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
  }

  // 优先使用 mousedown 时缓存的元素，避免每帧 querySelector
  if (selectedImageIds.size > 1 && selectedImageIds.has(dragInfo.imgData.id)) {
    selectedImageIds.forEach(function(sid) {
      let el = (dragInfo._multiEls && dragInfo._multiEls[sid]) ||
        document.querySelector('[data-oly-id="' + sid + '"]');
      let orig = dragInfo._multiOrigins && dragInfo._multiOrigins[sid];
      if (el && orig) _place(el, orig.x, orig.y);
    });
  } else {
    let el = dragInfo.el;
    if (!el || !el.isConnected) el = document.querySelector('[data-oly-id="' + dragInfo.imgData.id + '"]');
    if (el) _place(el, dragInfo.origX, dragInfo.origY);
  }
}

document.addEventListener('mousemove', function (e) {
  let dragInfo = getDragInfo();
  let resizeInfo = getResizeInfo();
  // 交互标志：供 flush 写盘等重操作判断是否推迟（拖拽中全文序列化会掉帧）
  state.overlayInteracting = !!(dragInfo || resizeInfo);
  if (dragInfo) {
    if (!_preDragState) _preDragState = _snapshotGeometry();
    let dx = e.clientX - dragInfo.startX;
    let dy = e.clientY - dragInfo.startY;
    dragInfo._currentDx = dx;
    dragInfo._currentDy = dy;

    // 自动滚动：鼠标接近编辑器视口边缘时触发
    // 缓存滚动容器与其 rect，避免每次 mousemove 都触发布局计算
    if (!dragInfo._bodyEl || !dragInfo._bodyEl.isConnected) {
      dragInfo._bodyEl = document.querySelector('#ckEditorContainer .mce-content-body');
      dragInfo._bodyRect = dragInfo._bodyEl ? dragInfo._bodyEl.getBoundingClientRect() : null;
    }
    let bodyRect = dragInfo._bodyRect;
    if (bodyRect) {
      let edgeZone = 60;
      let relY = e.clientY - bodyRect.top;
      if ((relY < edgeZone && relY >= 0) || (relY > bodyRect.height - edgeZone && relY <= bodyRect.height)) {
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
        dragInfo._multiEls = {};
        selectedImageIds.forEach(function(sid) {
          let img = findImageDataById(sid);
          if (img) dragInfo._multiOrigins[sid] = { x: img.x, y: img.y };
          let el = document.querySelector('[data-oly-id="' + sid + '"]');
          if (el) dragInfo._multiEls[sid] = el;
        });
      }
      selectedImageIds.forEach(function(sid) {
        let img = findImageDataById(sid);
        let orig = dragInfo._multiOrigins[sid];
        if (img && orig) {
          img.x = Math.max(-50, orig.x + dx);
          img.y = Math.max(-50, orig.y + dy);
          // 更新百分比坐标（用缓存的块宽，避免读 clientWidth 强制重排）
          _updatePctFromPx(img, dragInfo.blockW);
        }
      });
    } else {
      dragInfo.imgData.x = Math.max(-50, dragInfo.origX + dx);
      dragInfo.imgData.y = Math.max(-50, dragInfo.origY + dy);
      // 更新百分比坐标（用缓存的块宽，避免读 clientWidth 强制重排）
      _updatePctFromPx(dragInfo.imgData, dragInfo.blockW);
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
    if (!_preDragState) _preDragState = _snapshotGeometry();
    if (resizeInfo.corner === 'rotate') {
      let item = resizeInfo.el;
      if (!item || !item.isConnected) {
        let blockEl = getBlockElement(resizeInfo.imgData.blockId || getActiveBlockId());
        item = blockEl && blockEl.querySelector('[data-oly-id="' + resizeInfo.imgData.id + '"]');
      }
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
      // 直改 DOM：不重建元素，避免音视频重新解码、ECharts 实例重建
      _applyRotationDom(item, resizeInfo.imgData);
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
    _updatePctFromPx(resizeInfo.imgData, resizeInfo.blockW);

    // 直改 DOM：仅更新几何样式，音视频/图表内容原地保留
    let resEl = resizeInfo.el;
    if (!resEl || !resEl.isConnected) {
      let resBlockEl = getBlockElement(resizeInfo.imgData.blockId || getActiveBlockId());
      resEl = resBlockEl && resBlockEl.querySelector('[data-oly-id="' + resizeInfo.imgData.id + '"]');
    }
    if (resEl) {
      // 位置偏移走 transform（合成器路径）：非整数 DPR 下 left/top 移动会留下
      // 旧位置残影；left/top 固定为缩放起点，松手后 renderAll 按数据坐标落位。
      let offX = newX - resizeInfo.origX;
      let offY = newY - resizeInfo.origY;
      resEl.style.left = resizeInfo.origX + 'px';
      resEl.style.top = resizeInfo.origY + 'px';
      resEl.style.transform = 'translate(' + offX + 'px,' + offY + 'px)';
      resEl.style.width = newW + 'px';
      resEl.style.height = newH + 'px';
      if (resEl._olyChart) _scheduleChartResize(resEl);
    }
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
    var postState = _snapshotGeometry();
    var preState = _preDragState;
    // TinyMCE 的 add() 内部会对全文做快照（大文档数百毫秒），
    // 推迟到下一帧执行，避免松手瞬间主线程卡死
    setTimeout(function () {
      state.tinyEditor.undoManager.add({
        undo: function () {
          _applyGeometrySnapshot(preState);
          selectedImageIds.clear();
          renderAll();
        },
        redo: function () {
          _applyGeometrySnapshot(postState);
          selectedImageIds.clear();
          renderAll();
        }
      });
    }, 0);
  }

  // 拖动/缩放结束后渲染一次，确保 DOM 与数据同步（图表也会重新布局）
  if (dragInfo || resizeInfo) {
    renderAll();
  }

  setDragInfo(null);
  setResizeInfo(null);
  state.overlayInteracting = false;
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
