import { modalRich } from './dom-refs.js';
import { state } from './shared-state.js';
import { showSavedToast } from './utils.js';
import { showTinyUI, addLineNumbersToPreBlocks } from './core/code-blocks.js';
import { contentStyle } from './content-style.js';
import { initTOC, buildTOC } from './toc.js';
import { appState } from '../module0_AppState.js';
import { saveCurrentProjectData } from '../module2_TreeData.js';
import { showToast } from '../module5_SelectAndEdit.js';
import { showWindow, hideWindow } from '../UI/Window.js';
import { getOverlayImagesData, setOverlayImagesData, clearOverlayImages, renderAll } from './core/overlay/index.js';
import { ensureOverlayBlock, getAllBlockIds, setupBlockResizeObservers, getActiveBlockId, pctToPx, stripOverlayBlocksFromHTML } from './core/overlay/index.js';
import { renderChartContent } from './core/overlay/overlay-chart.js';
import { renderExcelContent } from './core/overlay/overlay-excel.js';
import { renderSlideshowContent } from './core/overlay/overlay-slideshow.js';
import { renderVideoContent } from './core/overlay/overlay-video.js';
import { renderAudioContent } from './core/overlay/overlay-audio.js';
import { getDrawData, setDrawData, clearDrawData } from './core/toolbar/toolbar-draw.js';

let _modalTitleRenameBound = false;

// ============================================================
//  全局模态框 Z-Index 管理（两个编辑器共享）
// ============================================================
if (!window._modalZIndexBase) {
    window._modalZIndexBase = 1000;
}
window._bringModalToFront = window._bringModalToFront || function (modalEl) {
    window._modalZIndexBase++;
    modalEl.style.zIndex = window._modalZIndexBase;
    if (window.Taskbar) {
    }
};

// ============================================================
//  编辑器标签页管理
// ============================================================
let _editorTabs = [];
let _activeTabKey = null;
let _tabDragIdx = -1;
let _lastEditorTargetIdx = -1;

function _makeTabKey(type, id) {
  return type + '_' + id;
}

function _findTabIndex(tabKey) {
  for (let i = 0; i < _editorTabs.length; i++) {
    if (_editorTabs[i].key === tabKey) return i;
  }
  return -1;
}

function _getTabName(type, id) {
  if (type === 'quicknote') {
    let note = appState.quickNotes.find(function (n) { return n.id === id; });
    return (note && note.title) ? note.title : '未命名';
  } else {
    let node = appState.nodeMap.get(id);
    return node ? node.name : '未命名';
  }
}

function _renderEditorTabs() {
  let tabBar = document.getElementById('editorTabBar');
  if (!tabBar) return;

  if (_editorTabs.length <= 1) {
    tabBar.style.display = 'none';
    return;
  }

  tabBar.style.display = 'flex';
  tabBar.innerHTML = '';

  for (let i = 0; i < _editorTabs.length; i++) {
    let tab = _editorTabs[i];
    let tabEl = document.createElement('div');
    tabEl.className = 'editor-tab';
    if (tab.key === _activeTabKey) tabEl.classList.add('active');

    let icon = document.createElement('span');
    icon.className = 'tab-icon';
    icon.textContent = tab.type === 'quicknote' ? '📝' : '📘';

    let label = document.createElement('span');
    label.className = 'tab-label';
    let currentName = _getTabName(tab.type, tab.id);
    label.textContent = currentName;
    label.title = currentName;

    let closeBtn = document.createElement('span');
    closeBtn.className = 'tab-close';
    closeBtn.textContent = '✕';

    tabEl.appendChild(icon);
    tabEl.appendChild(label);
    tabEl.appendChild(closeBtn);

    (function (tKey) {
      tabEl.addEventListener('click', function (e) {
        if (e.target === closeBtn) return;
        _switchToTab(tKey);
      });
      closeBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        _closeTab(tKey);
      });
    })(tab.key);

    tabEl.draggable = true;

    tabBar.appendChild(tabEl);
  }

  _initEditorDragEvents(tabBar);
}

function _initEditorDragEvents(tabBar) {
  if (tabBar._editorDragInited) return;
  tabBar._editorDragInited = true;

  tabBar.addEventListener('dragstart', function (e) {
    const tabEl = e.target.closest('.editor-tab');
    if (!tabEl) return;
    const idx = Array.from(tabBar.children).indexOf(tabEl);
    if (idx < 0) return;
    _tabDragIdx = idx;
    _lastEditorTargetIdx = idx;
    tabEl.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', idx);
  });

  tabBar.addEventListener('dragover', function (e) {
    e.preventDefault();
    if (_tabDragIdx < 0) return;

    const tabs = Array.from(tabBar.children);
    const cursorX = e.clientX;

    let targetIdx = tabs.length - 1;
    for (let i = 0; i < tabs.length; i++) {
      const rect = tabs[i].getBoundingClientRect();
      if (cursorX < rect.left + rect.width / 2) {
        targetIdx = i;
        break;
      }
    }

    if (targetIdx === _lastEditorTargetIdx) return;
    _lastEditorTargetIdx = targetIdx;

    _applyEditorPush(tabBar, _tabDragIdx, targetIdx);
  });

  tabBar.addEventListener('dragleave', function () {
    tabBar.querySelectorAll('.editor-tab').forEach(function (el) {
      el.classList.remove('drag-over');
    });
  });

  tabBar.addEventListener('drop', function (e) {
    e.preventDefault();
    if (_tabDragIdx < 0) return;
    const from = _tabDragIdx;
    let to = _lastEditorTargetIdx;
    if (to < 0) to = from;
    _editorFinalize(tabBar, from, to);
    _tabDragIdx = -1;
    _lastEditorTargetIdx = -1;
    tabBar.querySelectorAll('.editor-tab').forEach(function (el) {
      el.classList.remove('dragging', 'drag-over');
    });
  });

  tabBar.addEventListener('dragend', function () {
    _editorResetTransforms(tabBar);
    _tabDragIdx = -1;
    _lastEditorTargetIdx = -1;
    tabBar.querySelectorAll('.editor-tab').forEach(function (el) {
      el.classList.remove('dragging', 'drag-over');
    });
  });
}

function _applyEditorPush(tabBar, fromIdx, targetIdx) {
  const tabs = Array.from(tabBar.children);
  for (let i = 0; i < tabs.length; i++) {
    tabs[i].style.transition = 'none';
    tabs[i].style.transform = '';
  }
  if (targetIdx === fromIdx) {
    void tabBar.offsetHeight;
    return;
  }
  const shiftW = tabs[fromIdx].offsetWidth;
  if (targetIdx > fromIdx) {
    for (let i = fromIdx + 1; i <= targetIdx; i++) {
      tabs[i].style.transform = 'translateX(-' + shiftW + 'px)';
    }
  } else {
    for (let i = targetIdx; i < fromIdx; i++) {
      tabs[i].style.transform = 'translateX(' + shiftW + 'px)';
    }
  }
  void tabBar.offsetHeight;
  for (let i = 0; i < tabs.length; i++) {
    tabs[i].style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
  }
}

function _editorFinalize(tabBar, fromIdx, targetIdx) {
  const tabs = Array.from(tabBar.children);
  for (let i = 0; i < tabs.length; i++) {
    tabs[i].style.transition = 'none';
    tabs[i].style.transform = '';
  }
  void tabBar.offsetHeight;
  if (targetIdx === fromIdx) return;
  const draggedEl = tabs[fromIdx];
  const insertIdx = targetIdx > fromIdx ? targetIdx - 1 : targetIdx;
  tabBar.removeChild(draggedEl);
  if (insertIdx >= tabBar.children.length) {
    tabBar.appendChild(draggedEl);
  } else {
    tabBar.insertBefore(draggedEl, tabBar.children[insertIdx]);
  }
  const movedObj = _editorTabs.splice(fromIdx, 1)[0];
  const arrInsert = targetIdx > fromIdx ? targetIdx - 1 : targetIdx;
  _editorTabs.splice(arrInsert, 0, movedObj);
}

function _editorResetTransforms(tabBar) {
  const tabs = Array.from(tabBar.children);
  for (let i = 0; i < tabs.length; i++) {
    tabs[i].style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
    tabs[i].style.transform = '';
  }
}

function _switchToTab(tabKey) {
  if (!state.tinyEditor) return;
  if (tabKey === _activeTabKey) return;

  // 切换标签页时退出分屏模式
  if (appState.splitScreenNodeId) {
    deactivateSplitScreen();
  }

  saveCurrentContentCK();

  let idx = _findTabIndex(tabKey);
  if (idx < 0) return;

  let tab = _editorTabs[idx];
  _activeTabKey = tabKey;

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
    state.tinyEditor.setContent(note ? (note.content || '') : '');
    setOverlayImagesData(note ? (note.overlayImages || []) : []);
    requestAnimationFrame(function () { renderAll(); });
    setDrawData(note ? note.drawData : null);
  } else {
    let node = appState.nodeMap.get(tab.id);
    state.tinyEditor.setContent(node ? (node.richContent || '') : '');
    setOverlayImagesData(node ? (node.overlayImages || []) : []);
    requestAnimationFrame(function () { renderAll(); });
    setDrawData(node ? node.drawData : null);
  }

  state.tinyEditor.focus();
  state.tinyInitialContent = state.tinyEditor.getContent();
  if (window.Taskbar) window.Taskbar.syncLabel(_getTabName(tab.type, tab.id), tab.type);
}

function _closeTab(tabKey) {
  if (tabKey === _activeTabKey) {
    saveCurrentContentCK();
  }

  let idx = _findTabIndex(tabKey);
  if (idx < 0) return;

  _editorTabs.splice(idx, 1);

  if (_editorTabs.length === 0) {
    _activeTabKey = null;
    clearOverlayImages();
    clearDrawData();
    deactivateSplitScreen();
    window._pause3DAnimation = false;
    modalRich.classList.remove('maximized', 'windowed', 'minimized');
    _modalWindowState = 'maximized';
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

  let nextIdx = Math.min(idx, _editorTabs.length - 1);
  _switchToTab(_editorTabs[nextIdx].key);
}

function _updateModalTitle() {
  let titleEl = document.getElementById('modalNodeTitle');
  if (!titleEl) return;
  let renameBtn = document.getElementById('renameModalTitleBtn');

  if (appState.currentQuickNoteId) {
    let note = appState.quickNotes.find(function (n) { return n.id === appState.currentQuickNoteId; });
    titleEl.textContent = '';
    titleEl.appendChild(document.createTextNode('📘 快速笔记: ' + (note ? (note.title || '未命名') : '未命名')));
    if (renameBtn) renameBtn.style.display = 'inline';
  } else if (appState.currentEditNodeId) {
    let node = appState.nodeMap.get(appState.currentEditNodeId);
    titleEl.textContent = '';
    titleEl.appendChild(document.createTextNode('📘 编辑笔记: ' + (node ? node.name : '未命名')));
    if (renameBtn) renameBtn.style.display = 'inline';
  } else {
    titleEl.textContent = '';
    titleEl.appendChild(document.createTextNode('编辑笔记'));
  }
}

function _addTab(type, id) {
  let key = _makeTabKey(type, id);
  _editorTabs.push({
    key: key,
    type: type,
    id: id,
    name: _getTabName(type, id)
  });
  _activeTabKey = key;
}

function _tabSwitchTo(type, id) {
  let key = _makeTabKey(type, id);
  let existingIdx = _findTabIndex(key);
  if (existingIdx >= 0) {
    _switchToTab(key);
    return;
  }

  _addTab(type, id);

  if (type === 'quicknote') {
    appState.currentQuickNoteId = id;
    appState.currentEditNodeId = null;
  } else {
    appState.currentEditNodeId = id;
    appState.currentQuickNoteId = null;
  }

  _updateModalTitle();
  _renderEditorTabs();
}

function initModalTitleRename() {
  if (_modalTitleRenameBound) return;
  _modalTitleRenameBound = true;

  let titleEl = document.getElementById('modalNodeTitle');
  let renameBtn = document.getElementById('renameModalTitleBtn');
  if (!titleEl || !renameBtn) return;

  function startRename() {
    if (titleEl.querySelector('input')) return;

    let currentTitle = titleEl.textContent.replace(/^[📘]+\s*(快速笔记|编辑笔记):\s*/, '').trim();

    let input = document.createElement('input');
    input.type = 'text';
    input.value = currentTitle;
    input.style.cssText = 'background:#0a1a24;border:1px solid #0ff;color:#eef;padding:4px 10px;border-radius:16px;font-size:1.2rem;font-weight:bold;width:280px;outline:none;';

    titleEl.textContent = '';
    titleEl.appendChild(input);

    setTimeout(function () { input.focus(); input.select(); }, 0);

    function finish(save) {
      let newName = input.value.trim();
      let isQuickNote = !!appState.currentQuickNoteId;
      let isNode = !!appState.currentEditNodeId;

      if (save && newName) {
        if (isQuickNote) {
          let note = appState.quickNotes.find(function (n) { return n.id === appState.currentQuickNoteId; });
          if (note && note.title !== newName) {
            note.title = newName;
            if (appState.saveQuickNotes) appState.saveQuickNotes();
            if (appState.renderQuickNotesList) appState.renderQuickNotesList();
            if (window.Taskbar) window.Taskbar.syncLabel(newName, 'quicknote');
          }
          titleEl.textContent = '';
          titleEl.appendChild(document.createTextNode('📘 快速笔记: ' + newName));
        } else if (isNode) {
          let node = appState.nodeMap.get(appState.currentEditNodeId);
          if (node && node.name !== newName) {
            node.name = newName;
            let obj = appState.nodeMeshes.get(appState.currentEditNodeId);
            if (obj && obj.label) obj.label.element.textContent = newName;
            saveCurrentProjectData();
            if (typeof window.forceRefreshTreePanel === 'function') window.forceRefreshTreePanel();
            if (window.Taskbar) window.Taskbar.syncLabel(newName, 'node');
          }
          titleEl.textContent = '';
          titleEl.appendChild(document.createTextNode('📘 编辑笔记: ' + newName));
        }
        let activeIdx = _findTabIndex(_activeTabKey);
        if (activeIdx >= 0) {
          _editorTabs[activeIdx].name = newName;
          _renderEditorTabs();
        }
      } else {
        titleEl.textContent = '';
        if (isQuickNote) {
          let note = appState.quickNotes.find(function (n) { return n.id === appState.currentQuickNoteId; });
          titleEl.appendChild(document.createTextNode('📘 快速笔记: ' + (note ? (note.title || '未命名') : (currentTitle || '未命名'))));
        } else if (isNode) {
          let node = appState.nodeMap.get(appState.currentEditNodeId);
          titleEl.appendChild(document.createTextNode('📘 编辑笔记: ' + (node ? node.name : (currentTitle || '未命名'))));
        } else {
          titleEl.appendChild(document.createTextNode('编辑笔记'));
        }
      }

      titleEl.style.cursor = 'pointer';
      titleEl.title = '点击重命名';
    }

    titleEl.style.cursor = 'text';
    titleEl.title = '';

    input.addEventListener('blur', function () { finish(false); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
  }

  titleEl.style.cursor = 'pointer';
  titleEl.title = '点击重命名';
  titleEl.addEventListener('click', function (e) {
    if (e.target.tagName === 'INPUT') return;
    startRename();
  });

  renameBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    startRename();
  });
}

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
      // 分屏模式下，保存到当前活动面板对应的节点
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
            if (_modalWindowState === 'minimized') {
              setModalState(_prevModalState || 'maximized');
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

    appState.editorOpen = true;
    _modalOpenTimestamp = Date.now();
    if (renameBtn) renameBtn.style.display = 'inline';
    showTinyUI();
    showWindow(modalRich);
    window._bringModalToFront(modalRich);
    setModalState('maximized');
    initModalWindowControls();
    setTimeout(function () {
      if (typeof window.refreshTreePanel === 'function') window.refreshTreePanel();
    }, 200);

    state.tinyEditor.setContent(node.richContent || '');
    setOverlayImagesData(node.overlayImages || []);
    requestAnimationFrame(function () { renderAll(); });
    setDrawData(node.drawData || null);
    state.tinyEditor.focus();
    state.tinyInitialContent = state.tinyEditor.getContent();

    if (window.Taskbar) {
      window.Taskbar.addOrUpdateEditor('rich', {
        label: node.name || '',
        icon: '📘',
        active: true,
        activate: function () {
          if (_modalWindowState === 'minimized') {
            setModalState(_prevModalState || 'maximized');
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

export function closeModalCK() {
  function _cleanupAndHide() {
    deactivateSplitScreen();
    window._pause3DAnimation = false;

    // 先播关闭动画（保留 windowed/maximized 类，防止内容塌缩）
    hideWindow(modalRich, function () {
      // 动画结束后再清理 overlay 数据和状态
      clearOverlayImages();
      clearDrawData();
      modalRich.classList.remove('maximized', 'windowed', 'minimized');
      _modalWindowState = 'maximized';
      window._modalWindowState = 'maximized';

      let tabBar = document.getElementById('editorTabBar');
      if (tabBar) tabBar.style.display = 'none';

      _editorTabs = [];
      _activeTabKey = null;
      if (window.Taskbar) window.Taskbar.removeEditor('rich');
      appState.currentEditNodeId = null;
      appState.currentQuickNoteId = null;
      window._closeRichEditor = closeModalCK;
    });

    appState.editorOpen = false;
  }

  if (_editorTabs.length > 1) {
    saveCurrentContentCK();
    let idx = _findTabIndex(_activeTabKey);
    _editorTabs.splice(idx, 1);
    let nextIdx = Math.min(idx, _editorTabs.length - 1);
    _switchToTab(_editorTabs[nextIdx].key);
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

// ============================================================
//  分屏功能：两个面板共用一个 TinyMCE 实例
//  - 活动面板：包含 TinyMCE 编辑器 + overlay 层（可编辑）
//  - 非活动面板：显示 HTML 预览 + overlay 预览（只读）
//  - 点击面板/目录/标题栏切换活动面板
// ============================================================

function _saveCurrentActiveNode() {
  if (!state.tinyEditor) return;
  let activeId = appState._activeSplitPanel === 'B' ? appState.splitScreenNodeId : appState.currentEditNodeId;
  if (!activeId) return;
  let node = appState.nodeMap.get(activeId);
  if (!node) return;
  node.richContent = stripOverlayBlocksFromHTML(state.tinyEditor.getContent());
  node.overlayImages = getOverlayImagesData();
  node.drawData = getDrawData();
  node._scrollY = state.tinyEditor.getBody().scrollTop || state.tinyEditor.getWin().scrollY || 0;
  try { node._bookmark = state.tinyEditor.selection.getBookmark(2, true); } catch (e) { node._bookmark = null; }

  if (appState.splitScreenNodeId) {
    let previewId = appState._activeSplitPanel === 'B' ? appState.currentEditNodeId : appState.splitScreenNodeId;
    let previewNode = appState.nodeMap.get(previewId);
    if (previewNode) {
      let previewPanel = appState._activeSplitPanel === 'B' ? document.getElementById('editPanelA') : document.getElementById('editPanelB');
      let previewWrapper = previewPanel ? previewPanel.querySelector('.split-preview-wrapper') : null;
      if (previewWrapper) {
        previewNode._scrollY = previewWrapper.scrollTop || 0;
      }
    }
  }
}

function _restoreEditorState(node) {
  if (!node || !state.tinyEditor) return;
  if (node._bookmark) {
    try { state.tinyEditor.selection.moveToBookmark(node._bookmark); } catch (e) {}
  }
  let scrollY = node._scrollY || node._previewScrollY || 0;
  if (scrollY > 0) {
    requestAnimationFrame(function () {
      try { state.tinyEditor.getBody().scrollTop = scrollY; } catch (e) {}
      try { state.tinyEditor.getWin().scrollTo(0, scrollY); } catch (e) {}
    });
  }
}

function _renderPreviewInPanel(panel, node) {
  let existing = panel.querySelector('.split-preview-wrapper');
  if (existing) existing.remove();

  if (!node) return;

  let wrapper = document.createElement('div');
  wrapper.className = 'split-preview-wrapper';
  wrapper.style.cssText =
    'position:absolute;top:0;left:0;right:0;bottom:0;overflow:auto;' +
    'background:#0d1b23;';

  let contentDiv = document.createElement('div');
  contentDiv.className = 'mce-content-body';
  contentDiv.style.cssText =
    'position:relative;min-height:100%;padding:16px;color:#c8e6ff;font-family:Microsoft YaHei,sans-serif;' +
    'font-size:15px;line-height:1.7;overflow-y:auto;';
  contentDiv.innerHTML = node.richContent || '<p style="color:#5a8a9a;font-style:italic;">（空笔记）</p>';

  let styleEl = document.createElement('style');
  styleEl.textContent = contentStyle;
  contentDiv.insertBefore(styleEl, contentDiv.firstChild);

  wrapper.appendChild(contentDiv);

  _addPreviewLineNumbers(contentDiv);

  if (node.overlayImages && node.overlayImages.length > 0) {
    // 画布块模式：在 HTML 中的 .tmce-overlay-block 内渲染 overlay 元素
    let overlayByBlock = {};
    node.overlayImages.forEach(function (imgData) {
      let bid = imgData.blockId || '_default';
      if (!overlayByBlock[bid]) overlayByBlock[bid] = [];
      overlayByBlock[bid].push(imgData);
    });

    // 为预览中的画布块添加 overlay 元素
    let previewBlocks = contentDiv.querySelectorAll('.tmce-overlay-block');
    previewBlocks.forEach(function (blockEl) {
      let bid = blockEl.getAttribute('data-block-id');
      let items = overlayByBlock[bid] || [];
      if (items.length === 0) return;

      blockEl.style.position = 'relative';
      delete overlayByBlock[bid];

      let blockW = blockEl.clientWidth || 800;

      items.forEach(function (imgData) {
        let displayX, displayW;
        if (imgData.leftPct != null) {
          displayX = pctToPx(imgData.leftPct, blockW);
          displayW = pctToPx(imgData.widthPct, blockW);
        } else {
          let refWidth = imgData._refWidth || blockW;
          let scaleX = blockW / refWidth;
          displayX = (imgData.x || 0) * scaleX;
          displayW = (imgData.width || 200) * scaleX;
        }

        let item = document.createElement('div');
        item.style.cssText =
          'position:absolute;' +
          'left:' + displayX + 'px;' +
          'top:' + imgData.y + 'px;' +
          'width:' + displayW + 'px;' +
          'height:' + imgData.height + 'px;' +
          'z-index:' + (imgData.zIndex || 100) + ';' +
          'cursor:move;box-sizing:content-box;pointer-events:none;overflow:hidden;';
        if (imgData.rotation) {
          item.style.transformOrigin = 'center center';
          item.style.transform = 'rotate(' + imgData.rotation + 'deg)';
        }
        if (imgData.flipH || imgData.flipV) {
          let sx = imgData.flipH ? -1 : 1;
          let sy = imgData.flipV ? -1 : 1;
          let existing = item.style.transform || '';
          item.style.transformOrigin = 'center center';
          item.style.transform = existing + ' scale(' + sx + ',' + sy + ')';
        }
        if (imgData.shadow) {
          item.style.filter = (item.style.filter || '') + ' drop-shadow(' + imgData.shadow + ')';
        }
        if (imgData.opacity != null && imgData.opacity !== 1) {
          item.style.opacity = imgData.opacity;
        }

        if (imgData.type === 'image' && imgData.src) {
          let img = document.createElement('img');
          img.src = imgData.src;
          img.style.cssText = 'width:100%;height:100%;object-fit:contain;pointer-events:none;';
          item.appendChild(img);
        } else if (imgData.type === 'shape') {
          let svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svg.setAttribute('width', '100%');
          svg.setAttribute('height', '100%');
          svg.style.overflow = 'visible';
          let shapeType = imgData.shapeType || 'rect';
          let fill = imgData.fillColor || '#2c6e7e';
          let stroke = imgData.strokeColor || '#aef0ff';
          let sw = imgData.strokeWidth || 2;
          let w = imgData.width || 200;
          let h = imgData.height || 150;
          let el;
          if (shapeType === 'circle' || shapeType === 'ellipse') {
            el = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
            el.setAttribute('cx', w / 2); el.setAttribute('cy', h / 2);
            el.setAttribute('rx', w / 2 - sw); el.setAttribute('ry', h / 2 - sw);
          } else if (shapeType === 'triangle') {
            el = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            el.setAttribute('points', (w/2)+','+sw+' '+(w-sw)+','+(h-sw)+' '+sw+','+(h-sw));
          } else {
            el = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            el.setAttribute('x', sw / 2); el.setAttribute('y', sw / 2);
            el.setAttribute('width', Math.max(1, w - sw)); el.setAttribute('height', Math.max(1, h - sw));
            el.setAttribute('rx', '4');
          }
          el.setAttribute('fill', fill); el.setAttribute('stroke', stroke); el.setAttribute('stroke-width', sw);
          svg.appendChild(el);
          item.appendChild(svg);
        } else if (imgData.type === 'textbox') {
          let tbDiv = document.createElement('div');
          tbDiv.style.cssText =
            'width:100%;height:100%;overflow:hidden;padding:8px;' +
            'font-size:' + (imgData.fontSize || 16) + 'px;' +
            'color:' + (imgData.color || '#ccd') + ';' +
            'font-family:' + (imgData.fontFamily || 'Microsoft YaHei,sans-serif') + ';' +
            'text-align:' + (imgData.textAlign || 'left') + ';' +
            'line-height:' + (imgData.lineHeight || 1.5) + ';' +
            'background:' + (imgData.backgroundColor || 'transparent') + ';';
          if (imgData.bold) tbDiv.style.fontWeight = 'bold';
          if (imgData.italic) tbDiv.style.fontStyle = 'italic';
          tbDiv.innerHTML = imgData.html || imgData.text || '';
          item.appendChild(tbDiv);
        } else if (imgData.type === 'chart') {
          renderChartContent(item, imgData);
        } else if (imgData.type === 'excel') {
          renderExcelContent(item, imgData);
        } else if (imgData.type === 'audio') {
          renderAudioContent(item, imgData);
        } else if (imgData.type === 'video') {
          renderVideoContent(item, imgData);
        } else if (imgData.type === 'slideshow') {
          renderSlideshowContent(item, imgData);
        }

        blockEl.appendChild(item);
      });

      // 更新块 sizer
      let maxBottom = 0;
      items.forEach(function (imgData) {
        let bottom = (imgData.y || 0) + (imgData.height || 0);
        if (bottom > maxBottom) maxBottom = bottom;
      });
      blockEl.style.minHeight = Math.max(200, maxBottom + 20) + 'px';
    });

    // 兼容旧数据：没有画布块的 overlay 元素
    let remainingIds = Object.keys(overlayByBlock);
    if (remainingIds.length > 0) {
      let fallbackItems = [];
      remainingIds.forEach(function (bid) {
        fallbackItems = fallbackItems.concat(overlayByBlock[bid]);
      });
      if (fallbackItems.length > 0) {
        let overlayDiv = document.createElement('div');
        overlayDiv.id = 'splitPreviewOverlay';
        overlayDiv.setAttribute('contenteditable', 'false');
        overlayDiv.style.cssText =
          'position:absolute;top:0;left:0;right:0;pointer-events:none;z-index:5;';

        fallbackItems.forEach(function (imgData) {
          let item = document.createElement('div');
          item.style.cssText =
            'position:absolute;' +
            'left:' + (imgData.x || 0) + 'px;' +
            'top:' + (imgData.y || 0) + 'px;' +
            'width:' + (imgData.width || 200) + 'px;' +
            'height:' + (imgData.height || 150) + 'px;' +
            'z-index:' + (imgData.zIndex || 100) + ';' +
            'cursor:move;box-sizing:content-box;pointer-events:none;overflow:hidden;';

          if (imgData.type === 'image' && imgData.src) {
            let img = document.createElement('img');
            img.src = imgData.src;
            img.style.cssText = 'width:100%;height:100%;object-fit:contain;pointer-events:none;';
            item.appendChild(img);
          } else if (imgData.type === 'shape') {
            let svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('width', '100%');
            svg.setAttribute('height', '100%');
            svg.style.overflow = 'visible';
            let shapeType = imgData.shapeType || 'rect';
            let fill = imgData.fillColor || '#2c6e7e';
            let stroke = imgData.strokeColor || '#aef0ff';
            let sw = imgData.strokeWidth || 2;
            let el;
            if (shapeType === 'circle' || shapeType === 'ellipse') {
              el = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
              el.setAttribute('cx', imgData.width / 2); el.setAttribute('cy', imgData.height / 2);
              el.setAttribute('rx', imgData.width / 2 - sw); el.setAttribute('ry', imgData.height / 2 - sw);
            } else {
              el = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
              el.setAttribute('x', sw / 2); el.setAttribute('y', sw / 2);
              el.setAttribute('width', Math.max(1, imgData.width - sw)); el.setAttribute('height', Math.max(1, imgData.height - sw));
              el.setAttribute('rx', '4');
            }
            el.setAttribute('fill', fill); el.setAttribute('stroke', stroke); el.setAttribute('stroke-width', sw);
            svg.appendChild(el);
            item.appendChild(svg);
          } else if (imgData.type === 'textbox') {
            let tbDiv = document.createElement('div');
            tbDiv.style.cssText =
              'width:100%;height:100%;overflow:hidden;padding:8px;' +
              'font-size:' + (imgData.fontSize || 16) + 'px;' +
              'color:' + (imgData.color || '#ccd') + ';' +
              'font-family:' + (imgData.fontFamily || 'Microsoft YaHei,sans-serif') + ';' +
              'text-align:' + (imgData.textAlign || 'left') + ';' +
              'line-height:' + (imgData.lineHeight || 1.5) + ';' +
              'background:' + (imgData.backgroundColor || 'transparent') + ';';
            if (imgData.bold) tbDiv.style.fontWeight = 'bold';
            if (imgData.italic) tbDiv.style.fontStyle = 'italic';
            tbDiv.innerHTML = imgData.html || imgData.text || '';
            item.appendChild(tbDiv);
          }
          overlayDiv.appendChild(item);
        });

        contentDiv.style.position = 'relative';
        contentDiv.appendChild(overlayDiv);
      }
    }
  }

  panel.appendChild(wrapper);

  if (node._scrollY > 0) {
    requestAnimationFrame(function () { wrapper.scrollTop = node._scrollY; });
  }
}

function _addPreviewLineNumbers(container) {
  let pres = container.querySelectorAll('pre:not(.tmce-has-lines)');
  pres.forEach(function (pre) {
    if (pre.closest('.tmce-code-wrapper')) return;
    let code = pre.querySelector('code');
    let textSource = code || pre;
    let rawText = textSource.textContent || '';
    let lines = rawText.split('\n');
    let lineNumbersHtml = lines.map(function (_, i) {
      return '<span>' + (i + 1) + '</span>';
    }).join('');

    let wrapperEl = document.createElement('div');
    wrapperEl.className = 'tmce-code-wrapper';
    wrapperEl.setAttribute('contenteditable', 'false');
    pre.setAttribute('contenteditable', 'false');

    let lineDiv = document.createElement('div');
    lineDiv.className = 'tmce-line-numbers';
    lineDiv.setAttribute('contenteditable', 'false');
    lineDiv.innerHTML = lineNumbersHtml;

    let codeArea = document.createElement('div');
    codeArea.className = 'tmce-code-area';

    pre.classList.add('tmce-has-lines');
    pre.parentNode.insertBefore(wrapperEl, pre);
    wrapperEl.appendChild(lineDiv);
    codeArea.appendChild(pre);
    wrapperEl.appendChild(codeArea);

    if (code && window.hljs && !code.hasAttribute('data-highlighted')) {
      code.classList.add('hljs');
      hljs.highlightElement(code);
    }
  });
}

function _removePreviewFromPanel(panel) {
  let existing = panel.querySelector('.split-preview-wrapper');
  if (existing) existing.remove();
}

// 拖到左边缘时：关闭分屏，切换到分屏节点作为主节点编辑
function _switchToSplitNode() {
  if (!appState.splitScreenNodeId) return;

  _saveCurrentActiveNode();

  let splitNodeId = appState.splitScreenNodeId;
  let splitNode = appState.nodeMap.get(splitNodeId);
  if (!splitNode) { deactivateSplitScreen(); return; }

  let editPanelA = document.getElementById('editPanelA');
  let editPanelB = document.getElementById('editPanelB');
  let splitDivider = document.getElementById('splitDivider');

  // 冻结渲染
  if (editPanelA) editPanelA.style.visibility = 'hidden';
  if (editPanelB) editPanelB.style.visibility = 'hidden';

  let editorContainer = document.getElementById('ckEditorContainer');

  if (editorContainer && editPanelA && editorContainer.parentElement !== editPanelA) {
    _removePreviewFromPanel(editPanelA);
    editPanelA.appendChild(editorContainer);
  }

  if (editPanelA) { editPanelA.classList.remove('split-panel-active'); editPanelA.style.flex = '1'; }
  if (editPanelB) { editPanelB.classList.remove('split-panel-active'); editPanelB.style.display = 'none'; _removePreviewFromPanel(editPanelB); }
  if (splitDivider) { splitDivider.style.display = 'none'; }

  appState.splitScreenNodeId = null;
  appState._activeSplitPanel = null;
  appState._splitPrimaryRatio = null;
  appState.currentEditNodeId = splitNodeId;
  appState.currentQuickNoteId = null;

  if (state.tinyEditor) {
    state.tinyEditor.setContent(splitNode.richContent || '');
    state.tinyInitialContent = splitNode.richContent || '';
    setOverlayImagesData(splitNode.overlayImages || []);
    requestAnimationFrame(function () { renderAll(); });
    setDrawData(splitNode.drawData || null);
    showTinyUI();
    _restoreEditorState(splitNode);
  }

  _updateSplitTitle();
  _updateSplitTOC();

  let tabKey = _makeTabKey('node', splitNodeId);
  let idx = _findTabIndex(tabKey);
  if (idx >= 0) { _activeTabKey = tabKey; _renderEditorTabs(); }
  if (window.Taskbar) window.Taskbar.syncLabel(splitNode.name, 'node');

  // 下一帧统一显示
  requestAnimationFrame(function () {
    if (editPanelA) editPanelA.style.visibility = '';
    state.tinyEditor.focus();
  });
}

function _updateSplitTitle() {
  let titleEl = document.getElementById('modalNodeTitle');
  if (!titleEl) return;
  let activeId = appState._activeSplitPanel === 'B' ? appState.splitScreenNodeId : appState.currentEditNodeId;
  let node = activeId ? appState.nodeMap.get(activeId) : null;
  let name = node ? node.name : '未命名';
  titleEl.textContent = '';
  titleEl.appendChild(document.createTextNode('📘 编辑笔记: ' + name));
}

function _updateSplitTOC() {
  if (!state.tinyEditor) return;
  let tocSidebar = document.getElementById('tocSidebar');
  if (!tocSidebar) return;
  let treeBody = tocSidebar.querySelector('.toc-tree');
  if (treeBody) {
    buildTOC(state.tinyEditor, treeBody);
  }
}

export function activateSplitScreen(nodeId) {
  if (!appState.currentEditNodeId || !appState.editorOpen) return;
  if (nodeId === appState.currentEditNodeId) return;
  if (!state.tinyEditor) return;

  let node = appState.nodeMap.get(nodeId);
  if (!node) return;

  // 保存当前编辑内容
  _saveCurrentActiveNode();

  appState.splitScreenNodeId = nodeId;
  appState._activeSplitPanel = 'A';

  let editPanelA = document.getElementById('editPanelA');
  let editPanelB = document.getElementById('editPanelB');
  let splitDivider = document.getElementById('splitDivider');
  if (!editPanelA || !editPanelB || !splitDivider) return;

  // 确保 ckEditorContainer 在 editPanelA 中
  let editorContainer = document.getElementById('ckEditorContainer');
  if (editorContainer && editorContainer.parentElement !== editPanelA) {
    editPanelA.appendChild(editorContainer);
  }

  // 在 editPanelB 中渲染第二个节点的预览
  _removePreviewFromPanel(editPanelB);
  _renderPreviewInPanel(editPanelB, node);

  // 显示分屏
  splitDivider.style.display = 'flex';
  editPanelB.style.display = 'flex';
  editPanelA.style.flex = '1';
  editPanelB.style.flex = '1';

  editPanelA.classList.add('split-panel-active');
  editPanelB.classList.remove('split-panel-active');

  showTinyUI();
  state.tinyEditor.focus();
}

export function deactivateSplitScreen() {
  if (!appState.splitScreenNodeId) return;

  _saveCurrentActiveNode();

  let editPanelA = document.getElementById('editPanelA');
  let editPanelB = document.getElementById('editPanelB');
  let splitDivider = document.getElementById('splitDivider');

  // 冻结渲染，防止中间状态闪现
  if (editPanelA) editPanelA.style.visibility = 'hidden';
  if (editPanelB) editPanelB.style.visibility = 'hidden';

  let editorContainer = document.getElementById('ckEditorContainer');

  if (editorContainer && editPanelA && editorContainer.parentElement !== editPanelA) {
    _removePreviewFromPanel(editPanelA);
    editPanelA.appendChild(editorContainer);
  }

  if (editPanelA) { editPanelA.classList.remove('split-panel-active'); editPanelA.style.flex = '1'; }
  if (editPanelB) { editPanelB.classList.remove('split-panel-active'); editPanelB.style.display = 'none'; _removePreviewFromPanel(editPanelB); }
  if (splitDivider) { splitDivider.style.display = 'none'; }

  appState.splitScreenNodeId = null;
  appState._activeSplitPanel = null;
  appState._splitPrimaryRatio = null;

  if (state.tinyEditor && appState.currentEditNodeId) {
    let node = appState.nodeMap.get(appState.currentEditNodeId);
    if (node) {
      state.tinyEditor.setContent(node.richContent || '');
      state.tinyInitialContent = node.richContent || '';
      setOverlayImagesData(node.overlayImages || []);
      requestAnimationFrame(function () { renderAll(); });
      setDrawData(node.drawData || null);
      _restoreEditorState(node);
    }
    showTinyUI();
  }

  _updateSplitTitle();

  // 下一帧统一显示
  requestAnimationFrame(function () {
    if (editPanelA) editPanelA.style.visibility = '';
    state.tinyEditor.focus();
  });
}

function _swapSplitPanels() {
  if (!appState.splitScreenNodeId || !state.tinyEditor) return;
  if (appState._swapping) return;
  appState._swapping = true;

  _saveCurrentActiveNode();

  let panelA = document.getElementById('editPanelA');
  let panelB = document.getElementById('editPanelB');
  let wrapper = document.getElementById('editPanelsWrapper');
  if (!panelA || !panelB || !wrapper) { appState._swapping = false; return; }

  let wrapperRect = wrapper.getBoundingClientRect();
  let panelARect = panelA.getBoundingClientRect();
  let panelBRect = panelB.getBoundingClientRect();
  let divider = document.getElementById('splitDivider');

  // 创建两个克隆用于动画
  let cloneA = panelA.cloneNode(true);
  cloneA.style.cssText =
    'position:absolute;top:0;left:0;width:' + panelARect.width + 'px;height:100%;z-index:20;pointer-events:none;overflow:hidden;';
  wrapper.appendChild(cloneA);

  let cloneB = panelB.cloneNode(true);
  cloneB.style.cssText =
    'position:absolute;top:0;left:' + (panelBRect.left - wrapperRect.left) + 'px;width:' + panelBRect.width + 'px;height:100%;z-index:20;pointer-events:none;overflow:hidden;';
  wrapper.appendChild(cloneB);

  // 隐藏原始面板
  panelA.style.visibility = 'hidden';
  panelB.style.visibility = 'hidden';
  if (divider) divider.style.visibility = 'hidden';

  // 动画：A滑到B的位置，B滑到A的位置
  let duration = 300;
  let startTime = performance.now();
  let startLeftA = 0;
  let startLeftB = panelBRect.left - wrapperRect.left;
  let endLeftA = startLeftB;
  let endLeftB = 0;

  function animate(now) {
    let elapsed = now - startTime;
    let t = Math.min(elapsed / duration, 1);
    // ease-in-out
    t = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

    cloneA.style.left = (startLeftA + (endLeftA - startLeftA) * t) + 'px';
    cloneB.style.left = (startLeftB + (endLeftB - startLeftB) * t) + 'px';

    if (t < 1) {
      requestAnimationFrame(animate);
    } else {
      // 动画结束，移除克隆
      cloneA.remove();
      cloneB.remove();

      // 交换数据
      let tempId = appState.currentEditNodeId;
      appState.currentEditNodeId = appState.splitScreenNodeId;
      appState.splitScreenNodeId = tempId;

      let mainNode = appState.nodeMap.get(appState.currentEditNodeId);
      let splitNode = appState.nodeMap.get(appState.splitScreenNodeId);

      let editorContainer = document.getElementById('ckEditorContainer');
      if (editorContainer) panelA.appendChild(editorContainer);

      _removePreviewFromPanel(panelB);
      _renderPreviewInPanel(panelB, splitNode);

      if (mainNode) {
        state.tinyEditor.setContent(mainNode.richContent || '');
        setOverlayImagesData(mainNode.overlayImages || []);
        requestAnimationFrame(function () { renderAll(); });
        _restoreEditorState(mainNode);
      }

      appState._activeSplitPanel = 'A';
      panelA.classList.add('split-panel-active');
      panelB.classList.remove('split-panel-active');
      _updateSplitTitle();

      panelA.style.visibility = '';
      panelB.style.visibility = '';
      if (divider) divider.style.visibility = '';
      appState._swapping = false;
    }
  }

  requestAnimationFrame(animate);
}

function _switchActivePanel(targetPanelId) {
  if (appState._activeSplitPanel === targetPanelId) return;
  if (!state.tinyEditor) return;
  if (!appState.splitScreenNodeId) return;

  let panelA = document.getElementById('editPanelA');
  let panelB = document.getElementById('editPanelB');
  let editorContainer = document.getElementById('ckEditorContainer');
  if (!panelA || !panelB || !editorContainer) return;

  _saveCurrentActiveNode();

  let primaryId = appState.currentEditNodeId;
  let secondaryId = appState.splitScreenNodeId;
  appState._activeSplitPanel = targetPanelId;

  // 先冻结两个面板的渲染，防止中间状态闪现
  panelA.style.visibility = 'hidden';
  panelB.style.visibility = 'hidden';

  // 所有DOM操作在不可见状态下完成
  if (targetPanelId === 'A') {
    _removePreviewFromPanel(panelA);
    panelA.appendChild(editorContainer);
    _removePreviewFromPanel(panelB);
    _renderPreviewInPanel(panelB, appState.nodeMap.get(secondaryId));
    let priNode = appState.nodeMap.get(primaryId);
    if (priNode) {
      state.tinyEditor.setContent(priNode.richContent || '');
      state.tinyInitialContent = priNode.richContent || '';
      setOverlayImagesData(priNode.overlayImages || []);
      requestAnimationFrame(function () { renderAll(); });
      setDrawData(priNode.drawData || null);
      _restoreEditorState(priNode);
    }
  } else {
    _removePreviewFromPanel(panelB);
    panelB.appendChild(editorContainer);
    _removePreviewFromPanel(panelA);
    _renderPreviewInPanel(panelA, appState.nodeMap.get(primaryId));
    let secNode = appState.nodeMap.get(secondaryId);
    if (secNode) {
      state.tinyEditor.setContent(secNode.richContent || '');
      state.tinyInitialContent = secNode.richContent || '';
      setOverlayImagesData(secNode.overlayImages || []);
      requestAnimationFrame(function () { renderAll(); });
      setDrawData(secNode.drawData || null);
      _restoreEditorState(secNode);
    }
  }

  showTinyUI();
  panelA.classList.toggle('split-panel-active', targetPanelId === 'A');
  panelB.classList.toggle('split-panel-active', targetPanelId === 'B');
  _updateSplitTitle();
  _updateSplitTOC();

  // 下一帧统一显示，浏览器只做一次绘制
  requestAnimationFrame(function () {
    panelA.style.visibility = '';
    panelB.style.visibility = '';
    state.tinyEditor.focus();
  });
}

let _splitDragBound = false;
export function initSplitScreenDrag() {
  if (_splitDragBound) return;
  _splitDragBound = true;

  let splitDivider = document.getElementById('splitDivider');
  if (!splitDivider) return;

  let swapBtn = document.getElementById('splitSwapBtn');
  if (swapBtn) {
    swapBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      e.preventDefault();
      _swapSplitPanels();
    });
  }

  let dragging = false;
  let dragStartX = 0;
  let dragStartRatio = 0.5;

  splitDivider.addEventListener('mousedown', function (e) {
    if (e.button !== 0) return;
    if (e.target.closest('#splitSwapBtn')) return;
    e.preventDefault();
    dragging = true;
    dragStartX = e.clientX;
    dragStartRatio = appState._splitPrimaryRatio || 0.5;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  window.addEventListener('mousemove', function (e) {
    if (!dragging) return;
    let wrapper = document.getElementById('editPanelsWrapper');
    let panelA = document.getElementById('editPanelA');
    if (!wrapper || !panelA) return;

    let rect = wrapper.getBoundingClientRect();
    let dividerWidth = 6;
    let totalFlex = rect.width - dividerWidth;
    let deltaX = e.clientX - dragStartX;
    let deltaRatio = deltaX / totalFlex;
    let ratio = dragStartRatio + deltaRatio;

    // 拖到左边缘：切换到分屏节点（关闭左面板，保留右面板）
    if (ratio <= 0.03) {
      dragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      _switchToSplitNode();
      return;
    }
    // 拖到右边缘：切换回主节点（关闭右面板，保留左面板）
    if (ratio >= 0.97) {
      dragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      deactivateSplitScreen();
      return;
    }

    ratio = Math.max(0.1, Math.min(0.9, ratio));
    let flexA = ratio;
    let flexB = 1 - ratio;
    panelA.style.flex = flexA.toFixed(4);
    let panelB = document.getElementById('editPanelB');
    if (panelB) panelB.style.flex = flexB.toFixed(4);
    appState._splitPrimaryRatio = ratio;
  });

  window.addEventListener('mouseup', function () {
    if (!dragging) return;
    dragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });

  // 点击 editPanelA 切换活动面板
  let panelA = document.getElementById('editPanelA');
  if (panelA) {
    panelA.addEventListener('mousedown', function (e) {
      if (!appState.splitScreenNodeId) return;
      if (appState._activeSplitPanel === 'A') return;
      if (e.target.closest('#splitDivider')) return;
      _switchActivePanel('A');
    });
  }

  // 点击 editPanelB 切换活动面板
  let panelB = document.getElementById('editPanelB');
  if (panelB) {
    panelB.addEventListener('mousedown', function (e) {
      if (!appState.splitScreenNodeId) return;
      if (appState._activeSplitPanel === 'B') return;
      if (e.target.closest('#splitDivider')) return;
      _switchActivePanel('B');
    });
  }

  // 点击标题栏切换活动面板
  let modalHeader = document.querySelector('.rich-modal-header');
  if (modalHeader) {
    modalHeader.addEventListener('click', function (e) {
      if (!appState.splitScreenNodeId) return;
      if (e.target.closest('.caption-buttons')) return;
      if (e.target.closest('#renameModalTitleBtn')) return;
      if (e.target.tagName === 'INPUT') return;
      // 点击标题栏切换到另一个面板
      let target = appState._activeSplitPanel === 'A' ? 'B' : 'A';
      _switchActivePanel(target);
    });
  }
}

window._taskbarOpenEditor = openRichEditorCK;
window._taskbarCloseEditor = closeModalCK;

// ============================================================
//  模态窗口三态控制：最大化 / 窗口化 / 最小化
// ============================================================
let _modalWindowState = 'maximized';
let _prevModalState = 'maximized';
let _windowedLeft = -1;
let _windowedTop = -1;

function _centerWindow() {
    let content = modalRich.querySelector('.rich-modal-content');
    if (!content) return;
    let w = content.offsetWidth;
    let h = content.offsetHeight;
    content.style.left = Math.round((window.innerWidth - w) / 2) + 'px';
    content.style.top = Math.round((window.innerHeight - h) / 2) + 'px';
}

function _updateMaxIcon(state) {
    let maxSvg = document.getElementById('maximizeIcon');
    let maxBtn = document.getElementById('maximizeModalBtn');
    if (state === 'maximized') {
        if (maxSvg) maxSvg.innerHTML = '<rect x="3" y="0" width="5" height="5" rx="0"/><rect x="0" y="4" width="5" height="5" rx="0"/>';
        if (maxBtn) maxBtn.title = '窗口化';
    } else {
        if (maxSvg) maxSvg.innerHTML = '<rect x="2" y="2" width="6" height="6" rx="0"/>';
        if (maxBtn) maxBtn.title = '最大化';
    }
}

function _getTaskbarTarget(content, editorKey) {
  const tabEl = document.querySelector('.taskbar-tab[data-editor-key="' + editorKey + '"]');
  const rect = content.getBoundingClientRect();
  if (tabEl) {
    const tabRect = tabEl.getBoundingClientRect();
    const targetCenterX = tabRect.left + tabRect.width / 2;
    const targetCenterY = tabRect.top + tabRect.height / 2;
    const dx = targetCenterX - (rect.left + rect.width / 2);
    const dy = targetCenterY - (rect.top + rect.height / 2);
    const scale = Math.min(40 / rect.width, 20 / rect.height);
    return { dx: dx, dy: dy, scale: scale };
  }
  const destX = Math.round(window.innerWidth / 2 - rect.width / 2);
  const destY = window.innerHeight - 36;
  const dx = destX - rect.left;
  const dy = destY - rect.top;
  const scale = Math.min(48 / rect.width, 24 / rect.height);
  return { dx: dx, dy: dy, scale: scale };
}

function _animateMinimize(content, done) {
  const t = _getTaskbarTarget(content, 'rich');
  const anim = content.animate([
    { transform: 'translate(0, 0) scale(1)', opacity: 1 },
    { transform: 'translate(' + t.dx + 'px, ' + t.dy + 'px) scale(' + t.scale + ')', opacity: 0.15 }
  ], {
    duration: 250,
    easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
  });
  if (done) anim.onfinish = done;
}

function _animateRestore(content, done) {
  const t = _getTaskbarTarget(content, 'rich');
  const anim = content.animate([
    { transform: 'translate(' + t.dx + 'px, ' + t.dy + 'px) scale(' + t.scale + ')', opacity: 0.15 },
    { transform: 'translate(0, 0) scale(1)', opacity: 1 }
  ], {
    duration: 250,
    easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
  });
  if (done) anim.onfinish = done;
}

function setModalState(newState) {
  const prevState = _modalWindowState;
  _modalWindowState = newState;
  window._modalWindowState = newState;

  const content = modalRich.querySelector('.rich-modal-content');

  // 最小化 → 先播放缩入动画，再隐藏
  if (newState === 'minimized' && prevState !== 'minimized' && content) {
    _prevModalState = prevState;
    _animateMinimize(content, function () {
      modalRich.classList.remove('maximized', 'windowed', 'minimized');
      modalRich.classList.add('minimized');
    });
    _updateMaxIcon(newState);
    window._pause3DAnimation = false;
    appState.editorOpen = false;
    if (window.Taskbar) window.Taskbar.setEditorActive('rich', false);
    return;
  }

  // 从最小化恢复 → 先设好布局再播放弹入动画
  if (prevState === 'minimized' && newState !== 'minimized' && content) {
    modalRich.classList.remove('maximized', 'windowed', 'minimized');
    _applyModalLayout(newState, content);
    _animateRestore(content);
    _updateMaxIcon(newState);
    window._pause3DAnimation = (newState === 'maximized');
    appState.editorOpen = (newState === 'maximized');
    if (window.Taskbar) window.Taskbar.setEditorActive('rich', newState !== 'minimized');
    return;
  }

  // 普通切换（maximized ↔ windowed，无动画）
  modalRich.classList.remove('maximized', 'windowed', 'minimized');
  _applyModalLayout(newState, content);
  _updateMaxIcon(newState);
  window._pause3DAnimation = (newState === 'maximized');
  appState.editorOpen = (newState === 'maximized');
  if (window.Taskbar) window.Taskbar.setEditorActive('rich', newState !== 'minimized');
}

function _applyModalLayout(state, content) {
  if (!content) return;
  if (state === 'maximized') {
    modalRich.classList.add('maximized');
    content.style.left = '';
    content.style.top = '';
    content.style.width = '';
    content.style.height = '';
    content.style.transform = '';
  } else if (state === 'windowed') {
    modalRich.classList.add('windowed');
    content.style.left = '';
    content.style.top = '';
    content.style.transform = '';
    if (_windowedLeft >= 0 && _windowedTop >= 0) {
      content.style.left = _windowedLeft + 'px';
      content.style.top = _windowedTop + 'px';
    } else {
      requestAnimationFrame(function () { _centerWindow(); });
    }
  }
}

let _modalDrag = null;

let _modalOpenTimestamp = 0;  // 记录编辑器打开的时间戳，用于防穿透

function initModalWindowControls() {
    if (window._modalWindowControlsBound) return;
    window._modalWindowControlsBound = true;

    let minBtn = document.getElementById('minimizeModalBtn');
    let maxBtn = document.getElementById('maximizeModalBtn');
    let closeBtn = document.getElementById('closeModalBtn');
    let header = modalRich.querySelector('.rich-modal-header');

    modalRich.addEventListener('mousedown', function () {
        window._bringModalToFront(modalRich);
    });

    if (minBtn) {
        minBtn.addEventListener('click', function () {
            // 防穿透：编辑器刚打开 300ms 内忽略最小化按钮点击
            if (Date.now() - _modalOpenTimestamp < 300) return;
            setModalState('minimized');
        });
    }

    if (maxBtn) {
        maxBtn.addEventListener('click', function () {
            if (_modalWindowState === 'windowed') {
                setModalState('maximized');
            } else {
                setModalState('windowed');
            }
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', function (e) {
            if (Date.now() - _modalOpenTimestamp < 300) return;
            closeModalCK();
        });
    }

    if (header) {
        header.addEventListener('dblclick', function (e) {
            if (e.target.closest('button')) return;
            if (_modalWindowState === 'maximized') {
                setModalState('windowed');
            } else if (_modalWindowState === 'windowed') {
                setModalState('maximized');
            }
        });
    }

    // ── 标题栏拖拽（仅窗口化时生效）──
    if (header) {
        header.addEventListener('mousedown', function (e) {
            if (e.target.closest('button')) return;
            if (_modalWindowState !== 'windowed') return;

            let content = modalRich.querySelector('.rich-modal-content');
            if (!content) return;

            let rect = content.getBoundingClientRect();
            let shiftX = e.clientX - rect.left;
            let shiftY = e.clientY - rect.top;

            content.style.transition = 'none';

            function onMouseMove(ev) {
                let l = ev.clientX - shiftX;
                let t = ev.clientY - shiftY;
                content.style.left = l + 'px';
                content.style.top = t + 'px';
                content.style.transform = '';
            }

            function onMouseUp() {
                content.style.transition = '';
                _windowedLeft = parseFloat(content.style.left) || 0;
                _windowedTop = parseFloat(content.style.top) || 0;
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            }

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            e.preventDefault();
        });
    }

    initModalResize();
}

function initModalResize() {
    if (window._modalResizeBound) return;
    window._modalResizeBound = true;

    let content = modalRich.querySelector('.rich-modal-content');
    if (!content) return;

    let minW = 400;
    let minH = 300;

    let edges = [
        { dir: 'n',  top: '0', left: '8px', right: '8px', bottom: '', width: '', height: '6px', cursor: 'ns-resize' },
        { dir: 's',  top: '', left: '8px', right: '8px', bottom: '0', width: '', height: '6px', cursor: 'ns-resize' },
        { dir: 'e',  top: '8px', left: '', right: '0', bottom: '8px', width: '6px', height: '', cursor: 'ew-resize' },
        { dir: 'w',  top: '8px', left: '0', right: '', bottom: '8px', width: '6px', height: '', cursor: 'ew-resize' },
        { dir: 'ne', top: '0', left: '', right: '0', bottom: '', width: '16px', height: '16px', cursor: 'nesw-resize' },
        { dir: 'nw', top: '0', left: '0', right: '', bottom: '', width: '16px', height: '16px', cursor: 'nwse-resize' },
        { dir: 'se', top: '', left: '', right: '0', bottom: '0', width: '16px', height: '16px', cursor: 'nwse-resize' },
        { dir: 'sw', top: '', left: '0', right: '', bottom: '0', width: '16px', height: '16px', cursor: 'nesw-resize' }
    ];

    edges.forEach(function (e) {
        let handle = document.createElement('div');
        handle.className = 'modal-resize-handle modal-resize-' + e.dir;
        handle.style.cssText =
            'position:absolute;z-index:10;pointer-events:auto;cursor:' + e.cursor + ';' +
            (e.top ? 'top:' + e.top + ';' : '') +
            (e.bottom ? 'bottom:' + e.bottom + ';' : '') +
            (e.left ? 'left:' + e.left + ';' : '') +
            (e.right ? 'right:' + e.right + ';' : '') +
            (e.width ? 'width:' + e.width + ';' : '') +
            (e.height ? 'height:' + e.height + ';' : '');

        content.appendChild(handle);

        handle.addEventListener('mousedown', function (ev) {
            if (_modalWindowState !== 'windowed') return;
            ev.preventDefault();
            ev.stopPropagation();

            let rect = content.getBoundingClientRect();
            let sx = ev.clientX;
            let sy = ev.clientY;
            let sLeft = rect.left;
            let sTop = rect.top;
            let sWidth = rect.width;
            let sHeight = rect.height;

            content.style.transition = 'none';

            let dir = e.dir;

            function onMove(mev) {
                let dx = mev.clientX - sx;
                let dy = mev.clientY - sy;
                let nw = sWidth;
                let nh = sHeight;
                let nl = sLeft;
                let nt = sTop;

                if (dir.indexOf('e') >= 0) nw = Math.max(minW, sWidth + dx);
                if (dir.indexOf('w') >= 0) { nw = Math.max(minW, sWidth - dx); nl = sLeft + dx; }
                if (dir.indexOf('s') >= 0) nh = Math.max(minH, sHeight + dy);
                if (dir.indexOf('n') >= 0) { nh = Math.max(minH, sHeight - dy); nt = sTop + dy; }

                content.style.left = nl + 'px';
                content.style.top = nt + 'px';
                content.style.width = nw + 'px';
                content.style.height = nh + 'px';
            }

            function onUp() {
                content.style.transition = '';
                _windowedLeft = parseFloat(content.style.left) || 0;
                _windowedTop = parseFloat(content.style.top) || 0;
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            }

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    });
}

window.restoreModalFromTaskbar = function () {
    if (_modalWindowState === 'minimized') {
        setModalState('maximized');
        modalRich.style.display = '';
    }
    window._bringModalToFront(modalRich);
};

window._taskbarActivateWindow = function () {
    if (!modalRich) return;
    if (_modalWindowState === 'minimized') {
        setModalState('maximized');
        modalRich.style.display = '';
    }
    window._bringModalToFront(modalRich);
    if (state.tinyEditor) {
        setTimeout(function () { state.tinyEditor.focus(); }, 50);
    }
};