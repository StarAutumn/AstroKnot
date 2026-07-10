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
  getModalWindowState, getPrevModalState, setModalOpenTimestamp, setCloseModalCKFn
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

  // ── 模式切换按钮：代码模式下显示"笔记模式" ──
  const toggleModeBtn = document.getElementById('toggleModeBtn');
  if (toggleModeBtn) {
    toggleModeBtn.textContent = '🔄 笔记模式';
    toggleModeBtn.style.borderColor = '#5a8aaa';
    toggleModeBtn.style.color = '#5a8aaa';
  }

  // ── 编辑代码按钮：代码模式下显示 ──
  const editCodeBtn = document.getElementById('editSandboxCodeBtn');
  if (editCodeBtn) editCodeBtn.style.display = 'inline-block';
  const editSourceBtn = document.getElementById('editSourceCodeBtn');
  if (editSourceBtn) editSourceBtn.style.display = 'none';

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

  // ── 模式切换按钮：文本模式下显示"Web项目" ──
  const toggleModeBtn = document.getElementById('toggleModeBtn');
  if (toggleModeBtn) {
    toggleModeBtn.textContent = '🔄 Web项目';
    toggleModeBtn.style.borderColor = '#5a8aaa';
    toggleModeBtn.style.color = '#5a8aaa';
  }

  // ── 源码按钮：文本模式下显示 ──
  const editCodeBtn = document.getElementById('editSandboxCodeBtn');
  if (editCodeBtn) editCodeBtn.style.display = 'none';
  const editSourceBtn = document.getElementById('editSourceCodeBtn');
  if (editSourceBtn) {
    editSourceBtn.style.display = 'inline-block';
    editSourceBtn.textContent = '📝 HTML源码模式';
  }

  state.tinyEditor.setContent(node ? (node.richContent || '') : '');
  setOverlayImagesData(node ? (node.overlayImages || []) : []);
  requestAnimationFrame(function () { renderAll(); });
  setDrawData(node ? node.drawData : null);
}

function _isNodeSandbox(node) {
  if (!node) return false;
  // activeMode 为 'code' 时视为沙盒模式
  if (node.activeMode === 'code') return true;
  // 兼容：旧节点没有 activeMode 但有沙盒标志
  if (!node.activeMode) {
    return !!(node.sandboxMode || (node.htmlSource && node.htmlSource.mode === 'sandbox') || node.fileSystem);
  }
  return false;
}

// ── 标签页切换（内容感知）──

function _switchToTab(tabKey) {
  if (!state.tinyEditor) return;
  if (tabKey === getActiveTabKey()) return;

  // 退出源码模式
  if (_sourceModeActive) {
    _exitSourceMode();
  }

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

  // 切换标签页时聚焦到对应节点
  if (tab.type === 'node' && tab.id) {
    if (typeof window.centerOnNode === 'function') window.centerOnNode(tab.id);
  }

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
    
    // 播放"由大变小"的关闭动画
    const content = modalRich.querySelector('.rich-modal-content');
    if (content) {
      const targetRect = content.getBoundingClientRect();
      const targetW = targetRect.width;
      const targetH = targetRect.height;
      const targetL = targetRect.left;
      const targetT = targetRect.top;
      const endW = Math.max(targetW * 0.5, 200);
      const endH = Math.max(targetH * 0.5, 150);
      const endL = targetL + (targetW - endW) / 2;
      const endT = targetT + (targetH - endH) / 2;
      
      content.style.transition = 'none';
      const anim = content.animate([
        { left: targetL + 'px', top: targetT + 'px', width: targetW + 'px', height: targetH + 'px', opacity: 1 },
        { left: endL + 'px', top: endT + 'px', width: endW + 'px', height: endH + 'px', opacity: 0 }
      ], { duration: 180, easing: 'cubic-bezier(0.4, 0, 0.6, 1)' });
      anim.onfinish = _finishCloseTab;
      setTimeout(_finishCloseTab, 250);
    } else {
      _finishCloseTab();
    }
    
    function _finishCloseTab() {
      modalRich.style.display = 'none';
      modalRich.classList.remove('maximized', 'windowed', 'minimized');
      window._modalWindowState = 'maximized';
      if (content) content.style.transition = '';
    }
    
    appState.editorOpen = false;
    appState.currentEditNodeId = null;
    appState.currentQuickNoteId = null;

    if (window.Taskbar) window.Taskbar.removeEditor();

    let tabBar = document.getElementById('editorTabBar');
    if (tabBar) tabBar.style.display = 'none';
    let breadcrumb = document.getElementById('editorBreadcrumb');
    if (breadcrumb) breadcrumb.style.display = 'none';
    return;
  }

  let nextIdx = Math.min(idx, tabs.length - 1);
  _switchToTab(tabs[nextIdx].key);
}

// ── 内容保存 ──

export function saveCurrentContentCK() {
  // 如果处于源码模式，先退出再保存
  if (_sourceModeActive) {
    _exitSourceMode();
  }
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
    // 代码模式下触发沙盒保存事件，不保存 TinyMCE 内容到 richContent
    if (node && node.activeMode === 'code') {
      document.dispatchEvent(new CustomEvent('sandbox-save'));
      showSavedToast();
      return;
    }
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
      // 直接显示容器，动画由 setModalState() 中的 animate() 实现（Windows 风格由小变大）
      modalRich.classList.remove('window-open', 'window-close');
      modalRich.style.display = 'flex';
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
              setModalState(getPrevModalState() || 'maximized');
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
        modalRich.classList.remove('window-open', 'window-close');
        modalRich.style.display = 'flex';
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
                setModalState(getPrevModalState() || 'maximized');
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
        // 自动聚焦到当前编辑的节点
        setTimeout(function () {
          if (typeof window.refreshTreePanel === 'function') window.refreshTreePanel();
          if (typeof window.centerOnNode === 'function') window.centerOnNode(nodeId);
        }, 200);
        return;
      }
    }

    // ── 正常笔记模式 ──
    appState.editorOpen = true;
    setModalOpenTimestamp(Date.now());
    if (renameBtn) renameBtn.style.display = 'inline';
    showTinyUI();
    modalRich.classList.remove('window-open', 'window-close');
    modalRich.style.display = 'flex';
    window._bringModalToFront(modalRich);
    setModalState('maximized');
    initModalWindowControls();
    setTimeout(function () {
      if (typeof window.refreshTreePanel === 'function') window.refreshTreePanel();
      // 自动聚焦到当前编辑的节点
      if (appState.currentEditNodeId && typeof window.centerOnNode === 'function') window.centerOnNode(appState.currentEditNodeId);
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
            setModalState(getPrevModalState() || 'maximized');
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
  // 退出源码模式
  if (_sourceModeActive) {
    _exitSourceMode();
  }

  function _cleanupAndHide() {
    deactivateSplitScreen();
    window._pause3DAnimation = false;
    _pauseSandboxIframe();

    // 播放"由大变小"的关闭动画（Windows 风格）
    const content = modalRich.querySelector('.rich-modal-content');
    if (content) {
      const targetRect = content.getBoundingClientRect();
      const targetW = targetRect.width;
      const targetH = targetRect.height;
      const targetL = targetRect.left;
      const targetT = targetRect.top;
      
      // 结束状态：缩小到中心的 50%
      const endW = Math.max(targetW * 0.5, 200);
      const endH = Math.max(targetH * 0.5, 150);
      const endL = targetL + (targetW - endW) / 2;
      const endT = targetT + (targetH - endH) / 2;
      
      content.style.transition = 'none';
      
      const anim = content.animate([
        { left: targetL + 'px', top: targetT + 'px', width: targetW + 'px', height: targetH + 'px', opacity: 1 },
        { left: endL + 'px', top: endT + 'px', width: endW + 'px', height: endH + 'px', opacity: 0 }
      ], {
        duration: 180,
        easing: 'cubic-bezier(0.4, 0, 0.6, 1)'
      });
      
      const finishClose = () => {
        content.style.transition = '';
        _finishClose();
      };
      anim.onfinish = finishClose;
      setTimeout(finishClose, 250);
    } else {
      _finishClose();
    }
    
    function _finishClose() {
      modalRich.style.display = 'none';
      modalRich.classList.remove('maximized', 'windowed', 'minimized');
      window._modalWindowState = 'maximized';

      let tabBar = document.getElementById('editorTabBar');
      if (tabBar) tabBar.style.display = 'none';
      let breadcrumb = document.getElementById('editorBreadcrumb');
      if (breadcrumb) breadcrumb.style.display = 'none';

      let tabs = getEditorTabs();
      tabs.length = 0;
      setActiveTabKey(null);
      if (window.Taskbar) window.Taskbar.removeEditor('rich');
      appState.currentEditNodeId = null;
      appState.currentQuickNoteId = null;
      window._closeRichEditor = closeModalCK;
    }

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

// ════════════════════════════════════════════════════════════
//  源码编辑模式（在文本编辑器内用 Monaco 编辑 richContent 原生 HTML）
// ════════════════════════════════════════════════════════════

let _sourceModeActive = false;
let _sourceMonacoEditor = null;
let _sourceMonacoContainer = null;

function _enterSourceMode() {
  if (!state.tinyEditor) return;

  // 先退出已有的源码模式
  if (_sourceModeActive) return;

  // 获取当前 richContent 的原生HTML
  const rawHtml = state.tinyEditor.getContent();

  // 创建/显示 Monaco 容器
  const ckEl = document.getElementById('ckEditorContainer');
  if (!ckEl) return;

  if (!_sourceMonacoContainer) {
    _sourceMonacoContainer = document.createElement('div');
    _sourceMonacoContainer.id = 'sourceMonacoContainer';
    _sourceMonacoContainer.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:10;background:#0d1b23;';
    ckEl.style.position = 'relative';
    ckEl.appendChild(_sourceMonacoContainer);
  }

  _sourceMonacoContainer.style.display = 'block';

  const editSourceBtn = document.getElementById('editSourceCodeBtn');
  if (editSourceBtn) editSourceBtn.textContent = '📝 可视化';

  _sourceModeActive = true;

  // 使用已有的 ensureMonaco 加载 Monaco
  import('../core/code-blocks.js').then(({ ensureMonaco }) => {
    ensureMonaco(() => {
      if (_sourceMonacoEditor) {
        _sourceMonacoEditor.dispose();
      }
      _sourceMonacoEditor = monaco.editor.create(_sourceMonacoContainer, {
        value: rawHtml,
        language: 'html',
        theme: 'astroknot-dark',
        automaticLayout: true,
        minimap: { enabled: false },
        fontSize: 13,
        wordWrap: 'on',
        scrollBeyondLastLine: false,
      });
      _sourceMonacoEditor.focus();
    });
  });
}

function _exitSourceMode() {
  if (!_sourceMonacoEditor || !state.tinyEditor) return;

  const newHtml = _sourceMonacoEditor.getValue();

  // 销毁 Monaco 实例
  _sourceMonacoEditor.dispose();
  _sourceMonacoEditor = null;

  // 隐藏容器
  if (_sourceMonacoContainer) {
    _sourceMonacoContainer.style.display = 'none';
  }

  // 将源码设置回 TinyMCE（TinyMCE 会过滤不安全标签）
  state.tinyEditor.setContent(newHtml);
  state.tinyEditor.focus();

  const editSourceBtn = document.getElementById('editSourceCodeBtn');
  if (editSourceBtn) editSourceBtn.textContent = '📝 HTML源码模式';

  _sourceModeActive = false;
}

function _toggleSourceMode() {
  if (_sourceModeActive) {
    _exitSourceMode();
  } else {
    _enterSourceMode();
  }
}

// 绑定源码按钮事件
const _editSourceCodeBtn = document.getElementById('editSourceCodeBtn');
if (_editSourceCodeBtn) {
  _editSourceCodeBtn.addEventListener('click', () => _toggleSourceMode());
}

// ── 模式切换按钮事件 ──
const _toggleModeBtn = document.getElementById('toggleModeBtn');
if (_toggleModeBtn) {
  _toggleModeBtn.addEventListener('click', function () {
    const nodeId = appState.currentEditNodeId;
    const node = appState.nodeMap.get(nodeId);
    if (!node) return;

    const currentMode = node.activeMode || 'text';
    if (currentMode === 'text') {
      // 文本模式 → 切换到代码模式
      window.switchNodeToCodeMode(nodeId);
    } else {
      // 代码模式 → 切换到文本模式
      window.switchNodeToTextMode(nodeId);
    }
  });
}

// ════════════════════════════════════════════════════════════
//  模式切换全局函数（供右键菜单等外部模块通过 window 调用）
// ════════════════════════════════════════════════════════════

window.switchNodeToCodeMode = async function(nodeId) {
  const node = appState.nodeMap.get(nodeId);
  if (!node) return;

  // 保存当前文本内容
  if (appState.currentEditNodeId === nodeId) {
    saveCurrentContentCK();
  }

  // 确保 fileSystem 存在
  if (!node.fileSystem) {
    const { migrateHtmlSource } = await import('../sandbox/core/virtual-fs.js');
    node.fileSystem = migrateHtmlSource(null);
  }

  node.activeMode = 'code';
  saveCurrentProjectData();
  showToast('已切换为代码模式，双击节点将打开代码编辑器');

  // 如果当前正在编辑此节点，立即切换UI
  if (appState.currentEditNodeId === nodeId && appState.editorOpen) {
    if (_applySandboxUI(nodeId)) {
      state.tinyInitialContent = getSandboxHtml(nodeId);
    }
  }
};

window.switchNodeToTextMode = function(nodeId) {
  const node = appState.nodeMap.get(nodeId);
  if (!node) return;

  node.activeMode = 'text';
  saveCurrentProjectData();
  showToast('已切换为文本模式，双击节点将打开文本编辑器');

  // 如果当前正在编辑此节点，立即切换UI
  if (appState.currentEditNodeId === nodeId && appState.editorOpen) {
    _applyNormalUI(node);
    state.tinyEditor.focus();
    state.tinyInitialContent = state.tinyEditor.getContent();
  }
};

// ── 全局引用 ──
window._taskbarOpenEditor = openRichEditorCK;
window._taskbarCloseEditor = closeModalCK;

window.restoreModalFromTaskbar = function () {
  if (getModalWindowState() === 'minimized') {
    setModalState(getPrevModalState() || 'maximized');
    modalRich.style.display = '';
  }
  window._bringModalToFront(modalRich);
};

window._taskbarActivateWindow = function () {
  if (!modalRich) return;
  if (getModalWindowState() === 'minimized') {
    setModalState(getPrevModalState() || 'maximized');
    modalRich.style.display = '';
  }
  window._bringModalToFront(modalRich);
  if (state.tinyEditor) {
    setTimeout(function () { state.tinyEditor.focus(); }, 50);
  }
};
