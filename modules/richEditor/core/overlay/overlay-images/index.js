// ============================================================
//  overlay/overlay-images — 图片/形状浮层（由 overlay-images.js 拆分，对外导出不变）
//  文件夹结构（本文件为主入口 + 事件绑定入口）：
//    share.js  共享可变状态（overlayImages/selectedImageIds/zIndex/dragInfo/
//              resizeInfo/ctxMenuEl）+ z-index、插入坐标、选中读取、菜单清理工具
//    render.js canvas 渲染（renderAll/renderItemToCanvas/buildShapeSvg 等）+ 选中管理
//    data.js   数据读写（get/setOverlayImagesData/clearOverlayImages）
//    menu.js   多选/对齐/右键菜单/图层操作
//    drag.js   拖拽/自动滚动/全局事件监听（模块加载即注册）
//    index.js  bindOverlayEvents 编排 + 对外导出（re-export 各子模块）
//  依赖方向（单向）：index → {menu,drag,render,data,share}；menu/drag → {render,share}；
//    render → share；data → {render,share}（setOverlayImagesData 延迟调用 renderAll）
// ============================================================

import { findImageDataById, selectedImageIds, overlayImages, setResizeInfo } from './share.js';
import { selectImage } from './render.js';
import { showMultiSelectContextMenu, showContextMenu } from './menu.js';

export { SHAPE_CATEGORIES, SHAPE_LABELS, buildShapeThumbnail } from '../overlay-shapes.js';
export { getNextZIndex, resetZIndex, getInsertY, getInsertX, getSelectedImage, getSelectedImages, overlayImages, rgbaToHex, hideContextMenu, findImageDataById } from './share.js';
export { clearOverlayImages, getOverlayImagesData, setOverlayImagesData } from './data.js';
export { renderAll, transactRender, selectImage, deleteSelectedImage, ensureOverlay } from './render.js';
export { showContextMenu } from './menu.js';

// 图片编辑器功能已拆分到 overlay-image-editor/index.js
export { openAdvancedEditor, openCropEditor, openAdjustEditor, rotateImage, flipImage } from '../overlay-image-editor/index.js';

import './drag.js';

export function bindOverlayEvents() {
  document.addEventListener('mousedown', function (e) {
    let rotHandleEl = e.target.closest('.oly-rotate-handle');
    if (rotHandleEl) {
      e.preventDefault();
      e.stopPropagation();
      let item = rotHandleEl.closest('.oly-img-item');
      if (!item) return;
      let imgId = item.dataset.olyId;
      let imgData = findImageDataById(imgId);
      if (!imgData) return;
      selectImage(imgId);
      rotHandleEl.style.cursor = 'grabbing';
      let rect = item.getBoundingClientRect();
      let cx = rect.left + rect.width / 2;
      let cy = rect.top + rect.height / 2;
      let initAngle = Math.atan2(e.clientY - cy, e.clientX - cx);
      if (imgData.rotation == null) imgData.rotation = 0;
      setResizeInfo({
        imgData: imgData,
        startX: e.clientX,
        startY: e.clientY,
        origX: imgData.x,
        origY: imgData.y,
        origW: imgData.width,
        origH: imgData.height,
        corner: 'rotate',
        initAngle: initAngle,
        origRotation: imgData.rotation
      });
      return;
    }

    let handle = e.target.closest('.oly-resize-handle');
    if (handle) {
      e.preventDefault();
      e.stopPropagation();
      let item = handle.closest('.oly-img-item');
      if (!item) return;
      let imgId = item.dataset.olyId;
      let imgData = findImageDataById(imgId);
      if (!imgData) return;
      selectImage(imgId);
      let corner = '';
      if (handle.classList.contains('oly-resize-nw')) corner = 'nw';
      else if (handle.classList.contains('oly-resize-n')) corner = 'n';
      else if (handle.classList.contains('oly-resize-ne')) corner = 'ne';
      else if (handle.classList.contains('oly-resize-w')) corner = 'w';
      else if (handle.classList.contains('oly-resize-e')) corner = 'e';
      else if (handle.classList.contains('oly-resize-sw')) corner = 'sw';
      else if (handle.classList.contains('oly-resize-s')) corner = 's';
      else if (handle.classList.contains('oly-resize-se')) corner = 'se';
      setResizeInfo({
        imgData: imgData,
        startX: e.clientX,
        startY: e.clientY,
        origX: imgData.x,
        origY: imgData.y,
        origW: imgData.width,
        origH: imgData.height,
        corner: corner,
        aspectLock: true
      });
      return;
    }
  }, true);

  document.addEventListener('contextmenu', function (e) {
    let item = e.target.closest('.oly-img-item');
    if (item) {
      e.preventDefault();
      let imgId = item.dataset.olyId;
      // 如果右键点击的元素已在多选范围内，显示多选菜单
      if (selectedImageIds.size > 1 && selectedImageIds.has(imgId)) {
        showMultiSelectContextMenu(e.clientX, e.clientY);
        return;
      }
      let imgData = null;
      for (let i = 0; i < overlayImages.length; i++) {
        if (overlayImages[i].id === imgId) { imgData = overlayImages[i]; break; }
      }
      if (imgData) {
        selectImage(imgId);
        showContextMenu(imgData, e.clientX, e.clientY);
      }
    }
  });
}
