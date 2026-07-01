// ============================================================
//  UI / index.js — 汇总导出所有 UI 子模块
// ============================================================
export { keyboardEventBound, setKeyboardEventBound, toggleFullscreen, setToggleFullscreen, keys2D, keys, isInputActive } from './shared.js';
export { applyUITheme, toggleSimple3DMode, initUITheme, saveSettingsToStorage } from './Theme.js';
export { bindUndoRedo, bindKeyboardMovement, processMovement } from './Keyboard.js';
export { bindMinimizePanel, bindHelpModal, bindFullscreenAndTab, bindZoomToggle, showWindow, hideWindow } from './Window.js';
export { bindSearch, bindGlobalSearch } from './Search.js';
export { bindResize } from './Resize.js';
export { bindToolbarButtons } from './Toolbar.js';
export { initAIFloatingDialog } from './AiDialog.js';
export { initTaskbarClock } from './calendar/index.js';