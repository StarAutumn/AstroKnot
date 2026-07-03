// ============================================================
//  richEditor/index.js — 入口汇总，对外的公开 API
// ============================================================

// ─── 原有导出 ───
export { initCKEditor, saveCurrentContent, openRichEditor, closeModal, initRichEditor } from './core/init.js';
export { refreshTreePanel, bindTreeSidebar, processSidebar2DPanning, setSidebar2DKey, isSidebar2DFocused, initSidebar2DView, bindSidebarSearch } from './tree-panel.js';
export { insertFormulaToTiny, bindFormulaEditor } from './core/formula.js';
export { saveCurrentContentCK, openRichEditorCK, closeModalCK, setQuillReference, getCKEditorContent, setCKEditorContent, loadTinyContent, activateSplitScreen, deactivateSplitScreen, initSplitScreenDrag, setModalState, initModalWindowControls, initModalTitleRename } from './content-io/index.js';
export { openTinyImagePicker, insertTinyFile, insertTinyFileFromFile, showTinyImageContextMenu, showFileLinkContextMenu } from './images-files.js';
export { openImagePicker, getOverlayImagesData, setOverlayImagesData, clearOverlayImages, SHAPE_CATEGORIES, SHAPE_LABELS, buildShapeThumbnail, insertOverlayBlock, getActiveBlockId, getAllBlockIds, ensureOverlayBlock, removeOverlayBlock, getBlockElement, getBlockWidth, updateBlockSizer, updateAllBlockSizers, setupBlockResizeObservers, stripOverlayBlocksFromHTML } from './core/overlay/index.js';

export { addLineNumbersToPreBlocks, syncLineNumbersDebounced, stripLineNumbersFromHTML, showTinyUI, openTinyMceCodeEditor, ensureMonaco, toMonacoLang } from './core/code-blocks.js';
export { showSavedToast, getCKEditorInstance, isCKEditorActive, setEditingFormulaImg, getEditingFormulaImg, clearEditingFormulaImg, rgbToHex, getCurrentTinyFontColor } from './utils.js';
export { contentStyle } from './content-style.js';
export { modalRich, ckContainer } from './dom-refs.js';
export { state } from './shared-state.js';
export { openHtmlSandboxEditor, closeHtmlSandboxEditor, isNodeSandbox, getSandboxHtml, renderSandboxContent } from './sandbox/index.js';