// ============================================================
//  Fishbone / mode.js — 主干绘制模式的进入/退出
//  职责：模式状态切换、提示条、光标、菜单隐藏
// ============================================================

import { appState } from '../module0_AppState.js';
import { canvas } from '../2DView/shared.js';
import { mark2DDirty, draw } from '../2DView/render/index.js';
import { hideBlankContextMenu } from '../module8_ContextMenu.js';
import { showToast } from '../SelectAndEdit/index.js';
import { trunkDrawMode, setTrunkDrawMode, setCurrentTrunk, resetDrawState,
         branchDrawMode, setBranchDrawMode,
         nodeCreateMode, setNodeCreateMode, resetBranchDragState,
         setDraw3DFrame } from './state.js';
import { hideFishbone3DPreview } from './render3d.js';

// 提示条（复用 convertChildHint 的样式约定，不阻塞交互）
function _ensureHint() {
  let hint = document.getElementById('fishboneTrunkHint');
  if (!hint) {
    hint = document.createElement('div');
    hint.id = 'fishboneTrunkHint';
    hint.style.cssText = 'display:none;position:fixed;left:50%;bottom:64px;transform:translateX(-50%);' +
      'background:rgba(30,18,6,0.92);border:1px solid rgba(255,193,77,0.65);border-radius:24px;' +
      'padding:10px 24px;z-index:9999;color:#ffe2ae;font-size:14px;pointer-events:none;' +
      'box-shadow:0 4px 20px rgba(0,0,0,0.6);font-family:system-ui,sans-serif;';
    document.body.appendChild(hint);
  }
  return hint;
}

function _showHint(text) {
  const hint = _ensureHint();
  hint.textContent = text;
  hint.style.display = 'block';
}

function _hideHint() {
  const hint = document.getElementById('fishboneTrunkHint');
  if (hint) hint.style.display = 'none';
}

// 同步设置 2D 画布与 3D 渲染器的光标
function _setCursors(cursor) {
  if (canvas) canvas.style.cursor = cursor;
  if (appState.renderer?.domElement) appState.renderer.domElement.style.cursor = cursor;
}

function _redrawIf2D() {
  if (appState.is2DView) {
    mark2DDirty();
    draw();
  }
}

// 进入主干绘制模式（空白菜单"🐟 绘制主干线段"按钮触发）
export function startTrunkDrawMode() {
  if (trunkDrawMode) return;
  if (branchDrawMode) cancelBranchDrawMode();   // 与分支绘制互斥
  setTrunkDrawMode(true);
  setCurrentTrunk(null);   // 一次会话绘制一条主干
  resetDrawState();
  hideBlankContextMenu();
  _showHint('🐟 主干绘制中：按住左键从一点拖到另一点画线段，松手后可分段继续；右键或 Esc 退出');
  _setCursors('crosshair');
  showToast('🐟 主干绘制：按住拖动画线，右键退出', 2000);
  _redrawIf2D();
}

// 退出主干绘制模式（右键 / Esc）。已提交的线段保留
export function cancelTrunkDrawMode() {
  if (!trunkDrawMode) return;
  setTrunkDrawMode(false);
  setCurrentTrunk(null);
  resetDrawState();
  setDraw3DFrame(null);   // 清空随机模式 3D 画线取景帧
  _hideHint();
  _setCursors('');
  hideFishbone3DPreview();
  _redrawIf2D();
}

export function isTrunkDrawMode() {
  return trunkDrawMode;
}

// 进入分支绘制模式（连线标签"🌿 添加分支"按钮触发）：
// 在线段上按下选起点（自动吸附），拖到空白处松手生成分支线段，可连续画，右键 / Esc 退出
export function startBranchDrawMode() {
  if (branchDrawMode) return;
  if (trunkDrawMode) cancelTrunkDrawMode();   // 与主干绘制互斥
  setBranchDrawMode(true);
  resetBranchDragState();
  _showHint('🌿 分支绘制中：在线段上按下选起点，拖到空白处松手生成，可连续绘制；右键或 Esc 退出');
  _setCursors('crosshair');
  showToast('🌿 分支绘制：线上选起点，拖到空白松手', 2000);
  _redrawIf2D();
}

// 退出分支绘制模式（右键 / Esc）。已提交的分支保留
export function cancelBranchDrawMode() {
  if (!branchDrawMode) return;
  setBranchDrawMode(false);
  resetBranchDragState();
  _hideHint();
  _setCursors('');
  hideFishbone3DPreview();
  _redrawIf2D();
}

export function isBranchDrawMode() {
  return branchDrawMode;
}

// 进入节点创建模式（连线标签"🟢 新建节点"按钮触发，一次性）：
// 在线段上按下选起点（自动吸附），拖到空白处松手 → 松手点 = 新节点左边缘中点，
// 同时生成 线上起点 → 节点 的分支连线；右键 / Esc 取消
export function startFishboneNodeCreateMode() {
  if (nodeCreateMode) return;
  if (trunkDrawMode) cancelTrunkDrawMode();     // 与主干绘制互斥
  if (branchDrawMode) cancelBranchDrawMode();   // 与分支绘制互斥
  setNodeCreateMode(true);
  resetBranchDragState();
  _showHint('🟢 节点创建：在线段上按下选起点，拖到空白处松手（松手点 = 新节点左边缘中点）；右键或 Esc 取消');
  _setCursors('crosshair');
  showToast('🟢 新建节点：线上选起点，空白松手落节点', 2000);
  _redrawIf2D();
}

// 取消节点创建模式（右键 / Esc，或成功创建后自动退出）
export function cancelFishboneNodeCreateMode() {
  if (!nodeCreateMode) return;
  setNodeCreateMode(false);
  resetBranchDragState();
  _hideHint();
  _setCursors('');
  hideFishbone3DPreview();
  _redrawIf2D();
}

export function isFishboneNodeCreateMode() {
  return nodeCreateMode;
}
