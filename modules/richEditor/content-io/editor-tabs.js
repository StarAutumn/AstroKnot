// ============================================================
//  content-io/editor-tabs.js — 编辑器标签页管理（纯 UI）
// ============================================================

import { appState } from '../../module0_AppState.js';
import { saveCurrentProjectData } from '../../module2_TreeData.js';

// ── 标签页状态 ──
let _editorTabs = [];
let _activeTabKey = null;
let _tabDragIdx = -1;
let _lastEditorTargetIdx = -1;

// ── 状态访问器 ──
export function getEditorTabs() { return _editorTabs; }
export function getActiveTabKey() { return _activeTabKey; }
export function setActiveTabKey(key) { _activeTabKey = key; }

export function _makeTabKey(type, id) {
  return type + '_' + id;
}

export function _findTabIndex(tabKey) {
  for (let i = 0; i < _editorTabs.length; i++) {
    if (_editorTabs[i].key === tabKey) return i;
  }
  return -1;
}

export function _getTabName(type, id) {
  if (type === 'quicknote') {
    let note = appState.quickNotes.find(function (n) { return n.id === id; });
    return (note && note.title) ? note.title : '未命名';
  } else {
    let node = appState.nodeMap.get(id);
    return node ? node.name : '未命名';
  }
}

export function _updateModalTitle() {
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

export function _renderEditorTabs() {
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

export function _addTab(type, id) {
  let key = _makeTabKey(type, id);
  _editorTabs.push({
    key: key,
    type: type,
    id: id,
    name: _getTabName(type, id)
  });
  _activeTabKey = key;
}

export function _tabSwitchTo(type, id) {
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

// ── 注入式回调（解决循环依赖）──
// _switchToTab 和 _closeTab 涉及内容逻辑，由 editor-content-io.js 注入
let _switchToTabFn = null;
let _closeTabFn = null;

export function setSwitchToTabFn(fn) { _switchToTabFn = fn; }
export function setCloseTabFn(fn) { _closeTabFn = fn; }

export function _switchToTab(tabKey) {
  if (_switchToTabFn) { _switchToTabFn(tabKey); return; }
  console.warn('[editor-tabs] _switchToTab not yet bound');
}

export function _closeTab(tabKey) {
  if (_closeTabFn) { _closeTabFn(tabKey); return; }
  console.warn('[editor-tabs] _closeTab not yet bound');
}

// ── 标签页重命名 ──
let _modalTitleRenameBound = false;

export function initModalTitleRename() {
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
