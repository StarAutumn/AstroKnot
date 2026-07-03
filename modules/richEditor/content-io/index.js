// ============================================================
//  content-io/index.js — 聚合导出
// ============================================================

// ── 全局 Z-Index 管理（两个编辑器共享）──
if (!window._modalZIndexBase) {
  window._modalZIndexBase = 1000;
}
window._bringModalToFront = window._bringModalToFront || function (modalEl) {
  window._modalZIndexBase++;
  modalEl.style.zIndex = window._modalZIndexBase;
  if (window.Taskbar) {
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
  _renderEditorTabs
} from './editor-tabs.js';
