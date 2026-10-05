// ============================================================
//  MoveMode / move-mode / move-core.js — 移动模式状态机
//  - enterMoveMode / exitMoveMode / saveRenameAndRestore
// ============================================================

import { appState } from '../../module0_AppState.js';
import { saveCurrentProjectData } from '../../TreeData/index.js';
import { renamePrimaryNode } from '../../SelectAndEdit/index.js';
import {
  isMoveMode, setIsMoveMode,
  moveTargetId, setMoveTargetId,
  moveInitialPositions3D, setMoveInitialPositions3D,
  moveControlBar,
  contextRenameInput, contextNodeNameSpan
} from '../shared.js';
import { updateLinesForNodes } from '../../VisualComponents/index.js';

// ============================================================
//  进入移动模式
// ============================================================
export function enterMoveMode(nodeId) {
  if (appState.arrangeAnimActive) return;  // 排列动画中禁止拖拽
  if (nodeId && !appState.nodeMap.has(nodeId)) return;   // nodeId 可为 null（鱼骨「移动线路」入口无节点目标）
  setMoveTargetId(nodeId || null);
  setIsMoveMode(true);
  moveControlBar.style.display = 'flex';
  // 保持 controls 启用，让空白拖动走 OrbitControls 原生旋转逻辑
  setMoveInitialPositions3D(new Map());
  for (let [id, pos] of appState.positions.entries()) {
    moveInitialPositions3D.set(id, pos.clone());
  }
}

// ============================================================
//  退出移动模式
// ============================================================
export function exitMoveMode(save) {
  if (!isMoveMode) return;
  if (!save) {
    if (moveInitialPositions3D) {
      for (let [id, pos] of moveInitialPositions3D.entries()) {
        appState.positions.set(id, pos.clone());
        const obj = appState.nodeMeshes.get(id);
        if (obj) {
          obj.mesh.position.copy(pos);
          if (obj.label) obj.label.position.set(pos.x, pos.y + appState.NODE_RADIUS + 0.28, pos.z);
        }
      }
      updateLinesForNodes([...moveInitialPositions3D.keys()]);
    }
    // 鱼骨「移动线路」还原钩子：干线 2D 点 / 3D 锚点 / 末端节点 2D 位置 + 3D 重建
    // （ops.startFishboneMove 注册；节点位置还原已在上方完成，此处补鱼骨自身数据）
    if (appState._fishboneMoveRestore) appState._fishboneMoveRestore();
  } else {
    updateLinesForNodes([...moveInitialPositions3D.keys()]);
    saveCurrentProjectData();
  }
  appState._fishboneMoveRestore = null;
  setIsMoveMode(false);
  setMoveTargetId(null);
  setMoveInitialPositions3D(null);
  moveControlBar.style.display = 'none';
  appState.controls.enabled = true;
}

// ============================================================
//  保存重命名并恢复显示
// ============================================================
export function saveRenameAndRestore() {
  if (contextRenameInput.style.display === 'none') return;
  const newName = contextRenameInput.value.trim();
  if (newName && appState.contextTargetId) renamePrimaryNode(newName);
  contextNodeNameSpan.style.display = 'inline';
  contextRenameInput.style.display = 'none';
}
