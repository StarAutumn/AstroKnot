// ============================================================
//  UI / Keyboard.js — 键盘事件、撤销/重做、WASD 移动
// ============================================================
import * as THREE from 'three';
import { appState } from '../module0_AppState.js';
import { applyHistoryState } from '../module3_History.js';
import { processSidebar2DPanning, setSidebar2DKey, isSidebar2DFocused } from '../richEditor/tree-panel.js';
import { keyboardEventBound, setKeyboardEventBound, keys2D, keys, toggleFullscreen, isInputActive } from './shared.js';
import { toggleSimple3DMode } from './Theme.js';
import { hideWindow } from './Window.js';
import { copySelectedNodes, pasteNodes } from '../MoveMode/MoveCore.js';

//=========== 获取 DOM 元素引用 ==========
const contextMenu = document.getElementById('nodeContextMenu');

//=========== 撤销/重做 & 键盘事件 ==========
export function bindUndoRedo() {
  document.getElementById('undoBtn').onclick = () => {
    const s = appState.history.undo();
    if (s) applyHistoryState(s);
  };
  document.getElementById('redoBtn').onclick = () => {
    const s = appState.history.redo();
    if (s) applyHistoryState(s);
  };
  if (keyboardEventBound) return;
  setKeyboardEventBound(true);

  window.addEventListener('keydown', e => {
    if (isInputActive()) return;
    if (isSidebar2DFocused()) {
      const k = e.key.toLowerCase();
      if (!e.ctrlKey && (k === 'w' || k === 'a' || k === 's' || k === 'd' ||
          e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        setSidebar2DKey(e.key, true);
        e.preventDefault();
        return;
      }
    }
    if (appState.is2DView) {
      if (e.key === 'F1') {
        e.preventDefault();
        document.body.classList.toggle('hide-ui');
        return;
      }
      if (e.key in keys2D) {
        if (appState.set2DKey) appState.set2DKey(e.key, true);
        e.preventDefault();
      }
      return;
    }
    if (e.ctrlKey && e.key === 'z') {
      e.preventDefault();
      const s = appState.history.undo();
      if (s) applyHistoryState(s);
    } else if (e.ctrlKey && e.key === 'y') {
      e.preventDefault();
      const s = appState.history.redo();
      if (s) applyHistoryState(s);
    } else if (e.ctrlKey && e.key === 'c') {
      e.preventDefault();
      copySelectedNodes();
    } else if (e.ctrlKey && e.key === 'v') {
      e.preventDefault();
      pasteNodes();
    } else if (e.key === 'Escape') {
      const helpModal = document.getElementById('helpModal');
      if (helpModal && helpModal.style.display === 'flex') { hideWindow(helpModal); return; }
      if (contextMenu && contextMenu.style.display === 'flex') return;
    } else if (e.key === 'F1') {
      e.preventDefault();
      document.body.classList.toggle('hide-ui');
    } else if (e.key === 'F2') {
      e.preventDefault();
      toggleSimple3DMode(!appState.simple3D);
      const simpleCheck = document.getElementById('simple3DCheck');
      if (simpleCheck) simpleCheck.checked = appState.simple3D;
    } else {
      const k = e.key.toLowerCase();
      if (k in keys) { keys[k] = true; e.preventDefault(); }
      if (e.key === ' ') { keys[' '] = true; e.preventDefault(); }
      if (e.key === 'Control') { keys.ctrl = true; e.preventDefault(); }
    }
  });
  window.addEventListener('keyup', e => {
    if (isSidebar2DFocused()) {
      const k = e.key.toLowerCase();
      if (!e.ctrlKey && (k === 'w' || k === 'a' || k === 's' || k === 'd' ||
          e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        setSidebar2DKey(e.key, false);
        return;
      }
    }
    if (appState.is2DView) {
      if (appState.set2DKey) appState.set2DKey(e.key, false);
      return;
    }
    if (isInputActive()) return;
    const k = e.key.toLowerCase();
    if (k in keys) { keys[k] = false; e.preventDefault(); }
    if (e.key === ' ') { keys[' '] = false; e.preventDefault(); }
    if (e.key === 'Control') { keys.ctrl = false; e.preventDefault(); }
  });
}

//=========== 键盘 WASD 移动 ==========
export function processMovement() {
  if (appState.is2DView) return;
  if (isInputActive()) return;
  const speed = 0.08;
  const dir = new THREE.Vector3();
  appState.camera.getWorldDirection(dir);
  const right = new THREE.Vector3().crossVectors(dir, appState.camera.up).normalize();
  let dx = 0, dy = 0, dz = 0;
  if (keys.w) { dx += dir.x; dz += dir.z; }
  if (keys.s) { dx -= dir.x; dz -= dir.z; }
  if (keys.a) { dx -= right.x; dz -= right.z; }
  if (keys.d) { dx += right.x; dz += right.z; }
  if (keys[' ']) dy += 1;
  if (keys.ctrl) dy -= 1;
  const move = new THREE.Vector3(dx, dy, dz).normalize().multiplyScalar(speed);
  appState.controls.target.add(move);
  appState.camera.position.add(move);
}

export function bindKeyboardMovement() {
  if (keyboardEventBound) return;
}