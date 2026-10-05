// ============================================================
//  Fishbone / index.js — 鱼骨图模块入口
//  职责：绑定空白菜单"绘制主干线段"按钮，注册交互事件
//  数据：appState.fishboneTrunks = [{ id, points: [{x, y}] }]
//        主干点为 2D 世界坐标，3D 模式按固定比例映射到水平面渲染
// ============================================================

import { appState } from '../module0_AppState.js';
import { startTrunkDrawMode, startBranchDrawMode, startFishboneNodeCreateMode } from './mode.js';
import { cancelFishboneMove } from './ops.js';
import { initFishboneInteraction } from './interaction.js';

let _inited = false;

export function initFishbone() {
  if (_inited) return;
  _inited = true;

  // 空白右键菜单按钮（2D/3D 共用同一菜单 DOM）
  const btn = document.getElementById('drawFishboneTrunkBtn');
  if (btn) {
    btn.addEventListener('click', () => startTrunkDrawMode());
  }

  initFishboneInteraction();

  // 连线标签"🌿 添加分支"/"🟢 新建节点"按钮经此钩子进入对应模式
  // （appState 钩子模式，规避 LineTooltip → mode.js → module8_ContextMenu → LineTooltip 循环依赖）
  appState.startFishboneBranchDraw = startBranchDrawMode;
  appState.startFishboneNodeCreate = startFishboneNodeCreateMode;
  // Esc 取消「移动线路」经此钩子（module8_ContextMenu 不能直接 import ops.js）
  appState.cancelFishboneMove = cancelFishboneMove;
}

export { startTrunkDrawMode, cancelTrunkDrawMode, isTrunkDrawMode } from './mode.js';
export { startBranchDrawMode, cancelBranchDrawMode, isBranchDrawMode } from './mode.js';
export { startFishboneNodeCreateMode, cancelFishboneNodeCreateMode, isFishboneNodeCreateMode } from './mode.js';
