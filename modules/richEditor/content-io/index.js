// ============================================================
//  content-io/index.js — 聚合导出
// ============================================================

// ── 全局 Z-Index 管理已统一迁移到 WindowManager ──
// WindowManager.bringToFront() 同时支持 WindowInstance 和 DOM 元素
// WindowManager.registerElement() 注册点击自动置顶
// 所有模态框共享同一个 z-index 计数器，点击谁谁在最上面
window._bringModalToFront = function (modalEl) {
  if (window.WindowManager) {
    window.WindowManager.bringToFront(modalEl);
  }
};

// ── 导出：editor-content-io（内容读写 + sandbox/普通UI切换）──
export {
  saveCurrentContentCK,
  openRichEditorCK,
  closeModalCK,
  setQuillReference,
  getCKEditorContent,
  setCKEditorContent,
  loadTinyContent
} from './editor-content-io.js';

// ── 导出：modal-window（窗口三态控制）──
export {
  setModalState,
  initModalWindowControls,
  _pauseSandboxIframe,
  _resumeSandboxIframe
} from './modal-window.js';

// ── 导出：split-screen（分屏功能）──
export {
  activateSplitScreen,
  deactivateSplitScreen,
  initSplitScreenDrag
} from './split-screen.js';

// ── 导出：editor-tabs（标签页管理）──
export {
  initModalTitleRename,
  _updateModalTitle,
  _makeTabKey,
  _findTabIndex,
  _getTabName,
  _renderEditorTabs,
  _renderBreadcrumb
} from './editor-tabs.js';
