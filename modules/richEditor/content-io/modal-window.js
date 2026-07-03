// ============================================================
//  content-io/modal-window.js — 模态窗口三态控制
//  最大化 / 窗口化 / 最小化 + iframe 暂停/恢复
// ============================================================

import { modalRich } from '../dom-refs.js';
import { state } from '../shared-state.js';
import { appState } from '../../module0_AppState.js';
import { _getTabName, getActiveTabKey, getEditorTabs, _findTabIndex, _renderEditorTabs, _makeTabKey } from './editor-tabs.js';

// ── 模态窗口状态 ──
let _modalWindowState = 'maximized';
let _prevModalState = 'maximized';
let _windowedLeft = -1;
let _windowedTop = -1;
let _windowedWidth = null;
let _windowedHeight = null;
let _modalOpenTimestamp = 0;

// ── 沙盒 iframe 缓存 ──
let _sandboxIframeSrcdoc = '';

export function getModalWindowState() { return _modalWindowState; }
export function getModalOpenTimestamp() { return _modalOpenTimestamp; }
export function setModalOpenTimestamp(t) { _modalOpenTimestamp = t; }

// ── 性能优化：最小化/关闭时暂停沙盒 iframe，恢复时重运行 ──

export function _pauseSandboxIframe() {
  const iframe = document.getElementById('sandboxPreviewIframe');
  if (iframe && iframe.style.display !== 'none') {
    _sandboxIframeSrcdoc = iframe.srcdoc || '';
    iframe.srcdoc = '';
  }
}

export function _resumeSandboxIframe() {
  const iframe = document.getElementById('sandboxPreviewIframe');
  if (iframe && _sandboxIframeSrcdoc) {
    iframe.srcdoc = _sandboxIframeSrcdoc;
  }
}

// ── 窗口位置计算 ──

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
  content.style.transform = '';
  const t = _getTaskbarTarget(content, 'rich');
  const anim = content.animate([
    { transform: 'translate(0, 0) scale(1)', opacity: 1 },
    { transform: 'translate(' + t.dx + 'px, ' + t.dy + 'px) scale(' + t.scale + ')', opacity: 0.1 }
  ], {
    duration: 220,
    easing: 'cubic-bezier(0.7, 0, 0.8, 0.3)'
  });
  if (done) anim.onfinish = done;
}

function _animateRestore(content, done) {
  content.style.transform = '';
  const t = _getTaskbarTarget(content, 'rich');
  const anim = content.animate([
    { transform: 'translate(' + t.dx + 'px, ' + t.dy + 'px) scale(' + t.scale + ')', opacity: 0.1 },
    { transform: 'translate(0, 0) scale(1)', opacity: 1 }
  ], {
    duration: 250,
    easing: 'cubic-bezier(0.1, 0.9, 0.2, 1)'
  });
  if (done) anim.onfinish = done;
}

// ── 三态切换 ──

export function setModalState(newState) {
  const prevState = _modalWindowState;
  _modalWindowState = newState;
  window._modalWindowState = newState;

  const content = modalRich.querySelector('.rich-modal-content');

  // 最小化 → 先播放缩入动画，再隐藏
  if (newState === 'minimized' && prevState !== 'minimized' && content) {
    _prevModalState = prevState;
    _pauseSandboxIframe();
    content.style.transition = 'none';
    _animateMinimize(content, function () {
      content.style.transition = '';
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
    _resumeSandboxIframe();
    content.style.transition = 'none';
    modalRich.classList.remove('maximized', 'windowed', 'minimized');
    _applyModalLayout(newState, content);
    void content.offsetWidth;
    content.style.transition = '';
    _animateRestore(content);
    _updateMaxIcon(newState);
    window._pause3DAnimation = (newState === 'maximized');
    appState.editorOpen = (newState === 'maximized');
    if (window.Taskbar) window.Taskbar.setEditorActive('rich', newState !== 'minimized');
    return;
  }

  // 普通切换（maximized ↔ windowed，带平滑过渡动画）
  if (content) {
    const rect = content.getBoundingClientRect();
    content.style.transition = 'none';
    content.style.left = rect.left + 'px';
    content.style.top = rect.top + 'px';
    content.style.width = rect.width + 'px';
    content.style.height = rect.height + 'px';
    content.style.transform = '';
    void content.offsetWidth;
    content.style.transition = '';
  }
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
    content.style.transform = '';

    let targetW, targetH;
    if (_windowedWidth && _windowedHeight) {
      targetW = parseInt(_windowedWidth);
      targetH = parseInt(_windowedHeight);
      content.style.width = _windowedWidth;
      content.style.height = _windowedHeight;
    } else {
      targetW = Math.round(window.innerWidth * 0.75);
      targetH = Math.round(window.innerHeight * 0.8);
      content.style.width = '';
      content.style.height = '';
    }

    if (_windowedLeft >= 0 && _windowedTop >= 0) {
      content.style.left = _windowedLeft + 'px';
      content.style.top = _windowedTop + 'px';
    } else {
      const cx = Math.round((window.innerWidth - targetW) / 2);
      const cy = Math.round((window.innerHeight - targetH) / 2);
      content.style.left = cx + 'px';
      content.style.top = cy + 'px';
      _windowedLeft = cx;
      _windowedTop = cy;
    }
  }
}

// ── 注入式回调（解决循环依赖：modal-window → editor-content-io）──
let _closeModalCKFn = null;
export function setCloseModalCKFn(fn) { _closeModalCKFn = fn; }

// ── 窗口控制按钮初始化 ──

export function initModalWindowControls() {
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
      if (_closeModalCKFn) _closeModalCKFn();
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
        _windowedWidth = content.style.width || (content.offsetWidth + 'px');
        _windowedHeight = content.style.height || (content.offsetHeight + 'px');
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
        _windowedWidth = content.style.width || (content.offsetWidth + 'px');
        _windowedHeight = content.style.height || (content.offsetHeight + 'px');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  });
}
