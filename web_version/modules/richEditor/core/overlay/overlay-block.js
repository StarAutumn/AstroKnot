// ============================================================
//  overlay/overlay-block.js — 画布块管理（多画布块模式）
//
//  画布块 .tmce-overlay-block 是插入在 TinyMCE 文字流中的
//  contenteditable=false 块容器，类似代码块 .tmce-code-wrapper。
//  块宽度跟随容器自动伸缩，块内元素用百分比水平坐标。
// ============================================================

import { overlayImages, renderAll, transactRender } from './overlay-images.js';

let _blockIdCounter = 0;
let _lastClickedBlockId = null; // 上一次点击的画布块 ID

function nextBlockId() {
  return 'ob-' + Date.now() + '-' + (++_blockIdCounter);
}

/**
 * 记录被点击的画布块，并高亮显示
 */
function _onBlockClick(e) {
  let blockEl = e.target.closest('.tmce-overlay-block');
  if (!blockEl) return;

  let clickedId = blockEl.getAttribute('data-block-id');
  _lastClickedBlockId = clickedId;

  // 高亮当前块，取消其他块高亮
  let body = document.querySelector('#ckEditorContainer .mce-content-body');
  if (body) {
    let allBlocks = body.querySelectorAll('.tmce-overlay-block');
    for (let i = 0; i < allBlocks.length; i++) {
      allBlocks[i].classList.toggle('tmce-overlay-block-active', allBlocks[i].getAttribute('data-block-id') === clickedId);
    }
  }
}

/**
 * 绑定画布块点击事件（在 setupBlockResizeObservers 中调用）
 */
function _bindBlockClickEvents() {
  let body = document.querySelector('#ckEditorContainer .mce-content-body');
  if (!body) return;

  // 使用事件委托，避免重复绑定
  if (!body._overlayBlockClickBound) {
    body.addEventListener('click', function (e) {
      _onBlockClick(e);
    });
    body._overlayBlockClickBound = true;
  }
}

/**
 * 在当前光标位置插入一个画布块，返回 blockId
 */
export function insertOverlayBlock(editor) {
  if (!editor) return null;

  let blockId = nextBlockId();
  let placeholder = document.createElement('div');
  placeholder.className = 'tmce-overlay-block';
  placeholder.setAttribute('contenteditable', 'false');
  placeholder.setAttribute('data-block-id', blockId);
  placeholder.style.minHeight = '200px';

  editor.insertContent(placeholder.outerHTML);

  // 让 TinyMCE 渲染后，给新块设置 ResizeObserver
  requestAnimationFrame(function () {
    setupBlockResizeObservers();
  });

  return blockId;
}

/**
 * 获取当前活动的画布块 ID（优先取光标所在块，否则取第一个块）
 */
export function getActiveBlockId() {
  let body = document.querySelector('#ckEditorContainer .mce-content-body');
  if (!body) return null;

  // 优先使用上次点击的画布块
  if (_lastClickedBlockId) {
    let el = body.querySelector('.tmce-overlay-block[data-block-id="' + _lastClickedBlockId + '"]');
    if (el) return _lastClickedBlockId;
    // 块已被删除，清除缓存
    _lastClickedBlockId = null;
  }

  // 尝试从光标位置找
  let sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    let node = sel.anchorNode;
    while (node && node !== body) {
      if (node.nodeType === 1) {
        let el = node;
        if (el.classList && el.classList.contains('tmce-overlay-block')) {
          return el.getAttribute('data-block-id');
        }
      }
      node = node.parentNode;
    }
  }

  // 回退：取第一个块
  let firstBlock = body.querySelector('.tmce-overlay-block');
  return firstBlock ? firstBlock.getAttribute('data-block-id') : null;
}

/**
 * 获取编辑区中所有画布块的 blockId 列表
 */
export function getAllBlockIds() {
  let body = document.querySelector('#ckEditorContainer .mce-content-body');
  if (!body) return [];
  let blocks = body.querySelectorAll('.tmce-overlay-block');
  let ids = [];
  for (let i = 0; i < blocks.length; i++) {
    ids.push(blocks[i].getAttribute('data-block-id'));
  }
  return ids;
}

/**
 * 确保至少有一个画布块存在，没有则自动创建一个
 * 返回 blockId
 */
export function ensureOverlayBlock(editor) {
  let ids = getAllBlockIds();
  if (ids.length > 0) return ids[0];

  // 没有块，自动创建
  if (!editor) {
    // 尝试从全局获取
    let body = document.querySelector('#ckEditorContainer .mce-content-body');
    if (!body) return null;
    // 直接在 body 末尾创建
    let blockId = nextBlockId();
    let el = document.createElement('div');
    el.className = 'tmce-overlay-block';
    el.setAttribute('contenteditable', 'false');
    el.setAttribute('data-block-id', blockId);
    el.style.minHeight = '200px';
    body.appendChild(el);
    return blockId;
  }

  return insertOverlayBlock(editor);
}

/**
 * 删除指定画布块（同时删除块内的所有 overlay 元素）
 */
export function removeOverlayBlock(blockId) {
  // 删除数据
  for (let i = overlayImages.length - 1; i >= 0; i--) {
    if (overlayImages[i].blockId === blockId) {
      overlayImages.splice(i, 1);
    }
  }

  // 删除 DOM
  let body = document.querySelector('#ckEditorContainer .mce-content-body');
  if (body) {
    let el = body.querySelector('.tmce-overlay-block[data-block-id="' + blockId + '"]');
    if (el) el.remove();
  }

  renderAll();
}

/**
 * 获取指定画布块 DOM 元素
 */
export function getBlockElement(blockId) {
  let body = document.querySelector('#ckEditorContainer .mce-content-body');
  if (!body) return null;
  return body.querySelector('.tmce-overlay-block[data-block-id="' + blockId + '"]');
}

/**
 * 获取块的当前宽度
 */
export function getBlockWidth(blockId) {
  let el = getBlockElement(blockId);
  return el ? el.clientWidth : 800;
}

/**
 * 更新块的 sizer 高度（让块能容纳所有内部元素）
 */
export function updateBlockSizer(blockId) {
  let el = getBlockElement(blockId);
  if (!el) return;

  // 计算块内最底部元素的 bottom 值
  let maxBottom = 0;
  overlayImages.forEach(function (item) {
    if (item.blockId === blockId) {
      let bottom = (item.y || 0) + (item.height || 0);
      if (bottom > maxBottom) maxBottom = bottom;
    }
  });

  let newMinHeight = Math.max(100, maxBottom + 20);
  el.style.minHeight = newMinHeight + 'px';
  // 同时写 data 属性，防止 TinyMCE getContent 丢失 style
  el.setAttribute('data-min-height', newMinHeight);
}

/**
 * 更新所有块的 sizer
 */
export function updateAllBlockSizers() {
  let ids = getAllBlockIds();
  ids.forEach(function (bid) {
    updateBlockSizer(bid);
  });
}

// ── ResizeObserver 监听块宽度变化 ──
let _blockResizeObserver = null;

export function setupBlockResizeObservers() {
  if (_blockResizeObserver) _blockResizeObserver.disconnect();

  let body = document.querySelector('#ckEditorContainer .mce-content-body');
  if (!body) return;

  _blockResizeObserver = new ResizeObserver(function () {
    renderAll();
  });

  let blocks = body.querySelectorAll('.tmce-overlay-block');
  for (let i = 0; i < blocks.length; i++) {
    _blockResizeObserver.observe(blocks[i]);
  }

  // 绑定点击事件（委托方式，只绑一次）
  _bindBlockClickEvents();
}

/**
 * 在 HTML 保存/加载时，清理画布块的内部 overlay 内容（只保留占位 div）
 */
export function stripOverlayBlocksFromHTML(html) {
  if (!html) return html;
  let div = document.createElement('div');
  div.innerHTML = html;

  let blocks = div.querySelectorAll('.tmce-overlay-block');
  blocks.forEach(function (block) {
    // 移除所有 .oly-img-item 子元素，保留块容器
    let items = block.querySelectorAll('.oly-img-item');
    items.forEach(function (item) { item.remove(); });
    // 移除 sizer
    let sizers = block.querySelectorAll('.tmce-overlay-sizer');
    sizers.forEach(function (s) { s.remove(); });
    // 从 data-min-height 恢复 style.min-height（防止 TinyMCE 丢失动态样式）
    let dataMinH = block.getAttribute('data-min-height');
    if (dataMinH) {
      block.style.minHeight = dataMinH + 'px';
    }
    // 插入不可见占位符，防止 TinyMCE 压缩空块
    if (!block.querySelector('.tmce-overlay-sizer')) {
      let sizer = document.createElement('div');
      sizer.className = 'tmce-overlay-sizer';
      sizer.setAttribute('contenteditable', 'false');
      sizer.style.cssText = 'display:block;width:100%;pointer-events:none;';
      let minH = dataMinH || parseInt(block.style.minHeight) || 200;
      sizer.style.height = minH + 'px';
      block.appendChild(sizer);
    }
  });

  return div.innerHTML;
}

/**
 * px 坐标 → 百分比坐标（用于数据存储）
 */
export function pxToPct(pxVal, refWidth) {
  if (!refWidth || refWidth <= 0) return 0;
  return (pxVal / refWidth) * 100;
}

/**
 * 百分比坐标 → px 坐标（用于渲染）
 */
export function pctToPx(pctVal, currentWidth) {
  if (!currentWidth || currentWidth <= 0) return 0;
  return (pctVal / 100) * currentWidth;
}
