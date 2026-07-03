// ============================================================
//  content-io/editor-content-io.js — 内容读写 + sandbox/普通UI切换
// ============================================================

import { modalRich } from '../dom-refs.js';
import { state } from '../shared-state.js';
import { showSavedToast } from '../utils.js';
import { showTinyUI } from '../core/code-blocks.js';
import { initTOC } from '../toc.js';
import { appState } from '../../module0_AppState.js';
import { saveCurrentProjectData } from '../../module2_TreeData.js';
import { showToast } from '../../module5_SelectAndEdit.js';
import { showWindow, hideWindow } from '../../UI/Window.js';
import { getOverlayImagesData, setOverlayImagesData, clearOverlayImages, renderAll } from '../core/overlay/index.js';
import { stripOverlayBlocksFromHTML } from '../core/overlay/index.js';
import { getDrawData, setDrawData, clearDrawData } from '../core/toolbar/toolbar-draw.js';
import { getSandboxHtml } from '../sandbox/index.js';
import {
  _makeTabKey, _findTabIndex, _getTabName, _renderEditorTabs, _addTab,
  _tabSwitchTo, _updateModalTitle, initModalTitleRename,
  getEditorTabs, getActiveTabKey, setActiveTabKey,
  setSwitchToTabFn, setCloseTabFn
} from './editor-tabs.js';
import {
  setModalState, initModalWindowControls,
  _pauseSandboxIframe, _resumeSandboxIframe,
  getModalWindowState, setModalOpenTimestamp, setCloseModalCKFn
} from './modal-window.js';
import { deactivateSplitScreen } from './split-screen.js';

// ── 注入回调：将内容相关的标签页逻辑绑定到 editor-tabs ──
setSwitchToTabFn(_switchToTab);
setCloseTabFn(_closeTab);
setCloseModalCKFn(closeModalCK);

// ── sandbox / 普通笔记 UI 切换辅助函数 ──

function _applySandboxUI(nodeId) {
  const sandboxContent = getSandboxHtml(nodeId);
  if (!sandboxContent) return false;

  const richToolbar = document.getElementById('richToolbar');
  if (richToolbar) richToolbar.style.display = 'none';
  const tocSidebar = document.getElementById('tocSidebar');
  if (tocSidebar) tocSidebar.style.display = 'none';
  const toggleToolbarBtn = document.getElementById('toggleToolbarBtn');
  if (toggleToolbarBtn) toggleToolbarBtn.style.display = 'none';
  const exportWordBtn = document.getElementById('exportWordBtn');
  if (exportWordBtn) exportWordBtn.style.display = 'none';
  const clearFormatBtn = document.getElementById('clearFormatBtn');
  if (clearFormatBtn) clearFormatBtn.style.display = 'none';
  const wcBtn = document.getElementById('wcBtn');
  if (wcBtn) wcBtn.style.display = 'none';
  const editCodeBtn = document.getElementById('editSandboxCodeBtn');
  if (editCodeBtn) editCodeBtn.style.display = 'inline-block';

  const ckEl = document.getElementById('ckEditorContainer');
  if (ckEl) {
    let sandboxIframe = document.getElementById('sandboxPreviewIframe');
    if (!sandboxIframe) {
      sandboxIframe = document.createElement('iframe');
      sandboxIframe.id = 'sandboxPreviewIframe';
      sandboxIframe.style.cssText = 'width:100%;height:100%;border:none;background:#fff;position:absolute;top:0;left:0;z-index:5;';
      sandboxIframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-modals allow-popups');
      ckEl.style.position = 'relative';
      ckEl.appendChild(sandboxIframe);
    }
    sandboxIframe.srcdoc = sandboxContent;
    sandboxIframe.style.display = 'block';
  }

  return true;
}

function _applyNormalUI(node) {
  const sandboxIframe = document.getElementById('sandboxPreviewIframe');
  if (sandboxIframe) sandboxIframe.style.display = 'none';

  const richToolbar = document.getElementById('richToolbar');
  if (richToolbar) richToolbar.style.display = '';
  const tocSidebar = document.getElementById('tocSidebar');
  if (tocSidebar) tocSidebar.style.display = '';
  const toggleToolbarBtn = document.getElementById('toggleToolbarBtn');
  if (toggleToolbarBtn) toggleToolbarBtn.style.display = '';
  const exportWordBtn = document.getElementById('exportWordBtn');
  if (exportWordBtn) exportWordBtn.style.display = '';
  const clearFormatBtn = document.getElementById('clearFormatBtn');
  if (clearFormatBtn) clearFormatBtn.style.display = '';
  const wcBtn = document.getElementById('wcBtn');
  if (wcBtn) wcBtn.style.display = '';
  const editCodeBtn = document.getElementById('editSandboxCodeBtn');
  if (editCodeBtn) editCodeBtn.style.display = 'none';

  state.tinyEditor.setContent(node ? (node.richContent || '') : '');
  setOverlayImagesData(node ? (node.overlayImages || []) : []);
  requestAnimationFrame(function () { renderAll(); });
  setDrawData(node ? node.drawData : null);
}

function _isNodeSandbox(node) {
  if (!node) return false;
  return !!(node.sandboxMode || (node.htmlSource && node.htmlSource.mode === 'sandbox') || node.fileSystem);
}

// ── 标签页切换（内容感知）──

function _switchToTab(tabKey) {
  if (!state.tinyEditor) return;
  if (tabKey === getActiveTabKey()) return;

  if (appState.splitScreenNodeId) {
    deactivateSplitScreen();
  }

  saveCurrentContentCK();

  let idx = _findTabIndex(tabKey);
  if (idx < 0) return;

  let tabs = getEditorTabs();
  let tab = tabs[idx];
  setActiveTabKey(tabKey);

  if (tab.type === 'quicknote') {
    appState.currentQuickNoteId = tab.id;
    appState.currentEditNodeId = null;
  } else {
    appState.currentEditNodeId = tab.id;
    appState.currentQuickNoteId = null;
  }

  _updateModalTitle();
  _renderEditorTabs();

  if (tab.type === 'quicknote') {
    let note = appState.quickNotes.find(function (n) { return n.id === tab.id; });
    _applyNormalUI(null);
    state.tinyEditor.setContent(note ? (note.content || '') : '');
    setOverlayImagesData(note ? (note.overlayImages || []) : []);
    requestAnimationFrame(function () { renderAll(); });
    setDrawData(note ? note.drawData : null);
  } else {
    let node = appState.nodeMap.get(tab.id);
    if (_isNodeSandbox(node)) {
      if (!_applySandboxUI(tab.id)) {
        _applyNormalUI(node);
      } else {
        state.tinyInitialContent = getSandboxHtml(tab.id);
      }
    } else {
      _applyNormalUI(node);
    }
  }

  if (!_isNodeSandbox(appState.nodeMap.get(tab.id)) || tab.type === 'quicknote') {
    state.tinyEditor.focus();
    state.tinyInitialContent = state.tinyEditor.getContent();
  }
  if (window.Taskbar) window.Taskbar.syncLabel(_getTabName(tab.type, tab.id), tab.type);
}

// ── 标签页关闭（内容感知）──

function _closeTab(tabKey) {
  if (tabKey === getActiveTabKey()) {
    saveCurrentContentCK();
  }

  let idx = _findTabIndex(tabKey);
  if (idx < 0) return;

  let tabs = getEditorTabs();
  tabs.splice(idx, 1);

  if (tabs.length === 0) {
    setActiveTabKey(null);
    clearOverlayImages();
    clearDrawData();
    deactivateSplitScreen();
    window._pause3DAnimation = false;
    modalRich.classList.remove('maximized', 'windowed', 'minimized');
    window._modalWindowState = 'maximized';
    hideWindow(modalRich);
    appState.editorOpen = false;
    appState.currentEditNodeId = null;
    appState.currentQuickNoteId = null;

    if (window.Taskbar) window.Taskbar.removeEditor();

    let tabBar = document.getElementById('editorTabBar');
    if (tabBar) tabBar.style.display = 'none';
    return;
  }

  let nextIdx = Math.min(idx, tabs.length - 1);
  _switchToTab(tabs[nextIdx].key);
}

// ── 内容保存 ──

export function saveCurrentContentCK() {
  if (!state.tinyEditor) return;
  const rawContent = state.tinyEditor.getContent();
  const htmlContent = stripOverlayBlocksFromHTML(rawContent);

  if (appState.currentQuickNoteId) {
    const note = appState.quickNotes.find(n => n.id === appState.currentQuickNoteId);
    if (note) {
      note.content = htmlContent;
      note.overlayImages = getOverlayImagesData();
      note.drawData = getDrawData();
      if (!note.title) {
        note.title = state.tinyEditor.getContent({ format: 'text' }).trim().substring(0, 30) || '';
      }
      if (appState.saveQuickNotes) appState.saveQuickNotes();
      if (appState.renderQuickNotesList) appState.renderQuickNotesList();
      showSavedToast();
      state.tinyInitialContent = htmlContent;
    }
    return;
  }

  if (appState.currentEditNodeId) {
    const node = appState.nodeMap.get(appState.currentEditNodeId);
    if (node) {
      if (appState.splitScreenNodeId && appState._activeSplitPanel === 'B') {
        const secNode = appState.nodeMap.get(appState.splitScreenNodeId);
        if (secNode) {
          secNode.richContent = htmlContent;
          secNode.overlayImages = getOverlayImagesData();
          secNode.drawData = getDrawData();
        }
      } else {
        node.richContent = htmlContent;
        node.overlayImages = getOverlayImagesData();
        node.drawData = getDrawData();
      }
      showSavedToast();
      saveCurrentProjectData();
    }
  }
}

// ── 打开编辑器 ──

export function openRichEditorCK(nodeIdOrNull, quickNoteId, initCKEditorFn) {
  function doOpen() {
    const nodeId = nodeIdOrNull;
    initModalTitleRename();
    let renameBtn = document.getElementById('renameModalTitleBtn');

    if (quickNoteId) {
      saveCurrentContentCK();
      _tabSwitchTo('quicknote', quickNoteId);
      const note = appState.quickNotes.find(function (n) { return n.id === quickNoteId; });
      if (!note) return;

      if (renameBtn) renameBtn.style.display = 'inline';
      showTinyUI();
      appState.editorOpen = true;
      showWindow(modalRich);
      window._bringModalToFront(modalRich);
      setModalState('maximized');
      initModalWindowControls();
      setTimeout(function () {
        if (typeof window.refreshTreePanel === 'function') window.refreshTreePanel();
      }, 200);

      state.tinyEditor.setContent(note.content || '');
      setOverlayImagesData(note.overlayImages || []);
      requestAnimationFrame(function () { renderAll(); });
      setDrawData(note.drawData || null);
      state.tinyEditor.focus();
      state.tinyInitialContent = state.tinyEditor.getContent();
      if (window.Taskbar) {
        window.Taskbar.addOrUpdateEditor('rich', {
          label: note.title || '',
          icon: '📝',
          active: true,
          activate: function () {
            if (getModalWindowState() === 'minimized') {
              setModalState('maximized');
            } else {
              setModalState('minimized');
            }
            window._bringModalToFront(modalRich);
            if (state.tinyEditor) {
              setTimeout(function () { state.tinyEditor.focus(); }, 50);
            }
          },
          close: closeModalCK,
          maximize: function () { setModalState('maximized'); },
          minimize: function () { setModalState('minimized'); }
        });
      }
      return;
    }

    saveCurrentContentCK();
    _tabSwitchTo('node', nodeId);
    const node = appState.nodeMap.get(nodeId);
    if (!node) return;

    // ── 判断是否为沙盒模式 ──
    if (_isNodeSandbox(node)) {
      if (_applySandboxUI(nodeId)) {
        showTinyUI();
        appState.editorOpen = true;
        showWindow(modalRich);
        window._bringModalToFront(modalRich);
        setModalState('maximized');
        initModalWindowControls();
        if (renameBtn) renameBtn.style.display = 'inline';

        appState.currentEditNodeId = nodeId;
        state.tinyInitialContent = getSandboxHtml(nodeId);

        if (window.Taskbar) {
          window.Taskbar.addOrUpdateEditor('rich', {
            label: node.name || '',
            icon: '📘',
            active: true,
            activate: function () {
              if (getModalWindowState() === 'minimized') {
                setModalState('maximized');
              } else {
                setModalState('minimized');
              }
              window._bringModalToFront(modalRich);
            },
            close: closeModalCK,
            maximize: function () { setModalState('maximized'); },
            minimize: function () { setModalState('minimized'); }
          });
        }
        return;
      }
    }

    // ── 正常笔记模式 ──
    appState.editorOpen = true;
    setModalOpenTimestamp(Date.now());
    if (renameBtn) renameBtn.style.display = 'inline';
    showTinyUI();
    showWindow(modalRich);
    window._bringModalToFront(modalRich);
    setModalState('maximized');
    initModalWindowControls();
    setTimeout(function () {
      if (typeof window.refreshTreePanel === 'function') window.refreshTreePanel();
    }, 200);

    _applyNormalUI(node);
    state.tinyEditor.focus();
    state.tinyInitialContent = state.tinyEditor.getContent();

    if (window.Taskbar) {
      window.Taskbar.addOrUpdateEditor('rich', {
        label: node.name || '',
        icon: '📘',
        active: true,
        activate: function () {
          if (getModalWindowState() === 'minimized') {
            setModalState('maximized');
          } else {
            setModalState('minimized');
          }
          window._bringModalToFront(modalRich);
          if (state.tinyEditor) {
            setTimeout(function () { state.tinyEditor.focus(); }, 50);
          }
        },
        close: closeModalCK,
        maximize: function () { setModalState('maximized'); },
        minimize: function () { setModalState('minimized'); }
      });
    }
  }

  if (!state.tinyEditor) {
    if (initCKEditorFn) {
      initCKEditorFn().then(function (success) {
        if (success) {
          initTOC(state.tinyEditor);
          doOpen();
        } else {
          showToast('TinyMCE 加载失败，请检查网络连接');
        }
      });
    } else {
      showToast('编辑器尚未初始化');
    }
    return;
  }

  initTOC(state.tinyEditor);
  doOpen();
}

// ── 关闭编辑器 ──

export function closeModalCK() {
  function _cleanupAndHide() {
    deactivateSplitScreen();
    window._pause3DAnimation = false;
    _pauseSandboxIframe();

    hideWindow(modalRich, function () {
      clearOverlayImages();
      clearDrawData();
      modalRich.classList.remove('maximized', 'windowed', 'minimized');
      window._modalWindowState = 'maximized';

      let tabBar = document.getElementById('editorTabBar');
      if (tabBar) tabBar.style.display = 'none';

      let tabs = getEditorTabs();
      tabs.length = 0;
      setActiveTabKey(null);
      if (window.Taskbar) window.Taskbar.removeEditor('rich');
      appState.currentEditNodeId = null;
      appState.currentQuickNoteId = null;
      window._closeRichEditor = closeModalCK;
    });

    appState.editorOpen = false;
  }

  let tabs = getEditorTabs();
  if (tabs.length > 1) {
    saveCurrentContentCK();
    let idx = _findTabIndex(getActiveTabKey());
    tabs.splice(idx, 1);
    let nextIdx = Math.min(idx, tabs.length - 1);
    _switchToTab(tabs[nextIdx].key);
    return;
  }

  if (!state.tinyEditor) {
    _cleanupAndHide();
    return;
  }
  const currentContent = state.tinyEditor.getContent();
  let currentOverlayData = getOverlayImagesData();
  if (currentContent !== state.tinyInitialContent || currentOverlayData.length > 0) {
    saveCurrentContentCK();
    _cleanupAndHide();
  } else {
    _cleanupAndHide();
  }
}

// ── 其他导出 ──

export function setQuillReference(quillInstance) {
}

export function getCKEditorContent() {
  return state.tinyEditor ? state.tinyEditor.getContent() : '';
}

export function setCKEditorContent(html) {
  if (!state.tinyEditor) return;
  state.tinyEditor.setContent(html || '');
  state.tinyInitialContent = state.tinyEditor.getContent();
}

export function loadTinyContent(content) {
  showTinyUI();
  state.tinyEditor.setContent(content || '');
  state.tinyEditor.focus();
  state.tinyInitialContent = state.tinyEditor.getContent();
}

// ── 全局引用 ──
window._taskbarOpenEditor = openRichEditorCK;
window._taskbarCloseEditor = closeModalCK;

window.restoreModalFromTaskbar = function () {
  if (getModalWindowState() === 'minimized') {
    setModalState('maximized');
    modalRich.style.display = '';
  }
  window._bringModalToFront(modalRich);
};

window._taskbarActivateWindow = function () {
  if (!modalRich) return;
  if (getModalWindowState() === 'minimized') {
    setModalState('maximized');
    modalRich.style.display = '';
  }
  window._bringModalToFront(modalRich);
  if (state.tinyEditor) {
    setTimeout(function () { state.tinyEditor.focus(); }, 50);
  }
};
