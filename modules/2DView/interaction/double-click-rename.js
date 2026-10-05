// ============================================================
//  2DView / interaction / double-click-rename.js — 慢双击重命名
//  从 mouse-events.js 下沉的慢双击重命名：同一节点在 300ms~1.5s 时间窗内
//  二次单击（已选中、非 card 模式）时，在 canvas 上覆盖 input 完成内联重命名。
//  对外 API：
//    checkSlowDoubleClick(hit)  每次节点单击调用：满足慢双击则启动重命名、复位
//                               记录并返回 true（调用方应立即 return）；否则记录
//                               本次点击（id + 时间戳）返回 false
//    resetSlowDoubleClick()     点击空白等场景清除上次点击节点记录
//    is2DRenameActive()         重命名输入框是否活跃（mousedown blur / handleClick 守卫用）
// ============================================================

import { appState } from '../../module0_AppState.js';
import { canvas, transform } from '../shared.js';
import { saveCurrentProjectData } from '../../TreeData/index.js';
import { draw } from '../render/index.js';

// ── 慢双击重命名状态（模块内部） ──
let _last2DClickedId = null;
let _last2DClickTime = 0;
let _2dRenameActive = false;

// 慢双击判定（原 handleClick 节点命中分支内联逻辑）
export function checkSlowDoubleClick(hit) {
  const now = Date.now();
  const hitNode = appState.nodeMap.get(hit.id);
  // card 模式跳过慢双击重命名（用铅笔按钮替代）
  const isCard = hitNode && hitNode.displayMode === 'card';
  if (!isCard && appState.selectedNodeIds.has(hit.id) && _last2DClickedId === hit.id
      && now - _last2DClickTime > 300 && now - _last2DClickTime < 1500) {
    _start2DRename(hit);
    _last2DClickedId = null;
    _last2DClickTime = 0;
    return true;
  }

  _last2DClickedId = hit.id;
  _last2DClickTime = now;
  return false;
}

// 点击空白处：清除上次单击节点记录（原 handleClick 空白分支内的状态复位）
export function resetSlowDoubleClick() {
  _last2DClickedId = null;
}

// 重命名输入框是否活跃
export function is2DRenameActive() {
  return _2dRenameActive;
}

// ============================================================
//  2D 节点内联重命名（在 canvas 上覆盖 input 元素）
// ============================================================
function _start2DRename(hitArea) {
  const node = appState.nodeMap.get(hitArea.id);
  if (!node) return;

  _2dRenameActive = true;
  const originalName = node.name;

  // 将世界坐标转为 canvas 屏幕坐标
  const screenX = hitArea.x * transform.scale + canvas.width / 2 + transform.offsetX;
  const screenY = hitArea.y * transform.scale + canvas.height / 2 + transform.offsetY;
  const screenW = hitArea.width * transform.scale;
  const screenH = hitArea.height * transform.scale;

  // 获取 canvas 的页面位置
  const rect = canvas.getBoundingClientRect();

  const input = document.createElement('input');
  input.type = 'text';
  input.value = originalName;
  input.className = 'node-2d-rename-input';
  input.style.cssText = `
    position: fixed;
    left: ${rect.left + screenX}px;
    top: ${rect.top + screenY + screenH / 2 - 13}px;
    width: ${Math.max(screenW, 60)}px;
    height: 26px;
    background: #0a1a24;
    border: 1px solid #0ff;
    color: #fff;
    padding: 0 6px;
    border-radius: 13px;
    font-size: 12px;
    outline: none;
    text-align: center;
    z-index: 10000;
    pointer-events: auto;
  `;

  document.body.appendChild(input);
  input.focus();
  input.select();

  let finished = false;
  const finish = (save) => {
    if (finished) return;
    finished = true;
    _2dRenameActive = false;
    const newName = save ? (input.value.trim() || originalName) : originalName;
    try {
      if (newName !== originalName) {
        node.name = newName;
        saveCurrentProjectData();
        if (typeof window.forceRefreshTreePanel === 'function') window.forceRefreshTreePanel();
        // 更新 3D 标签
        const obj = appState.nodeMeshes.get(hitArea.id);
        if (obj && obj.label) obj.label.element.textContent = newName;
        draw();
      }
    } finally {
      input.remove();
    }
  };

  input.addEventListener('blur', () => finish(true));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
}
