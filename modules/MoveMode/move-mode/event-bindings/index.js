// ============================================================
//  MoveMode / event-bindings / index.js — initMoveMode 主函数
//  编排各子绑定模块，原 730 行的 initMoveMode 现仅负责顺序调用
// ============================================================

import { appState } from '../../../module0_AppState.js';
import {
  renameToggleBtn, contextRenameInput, contextNodeNameSpan
} from '../../shared.js';
import { enterMoveMode, exitMoveMode, saveRenameAndRestore } from '../move-core.js';
import { bindBlankContextMenu } from './blank-context-menu.js';
import { bindNodeContextMenu } from './node-context-menu.js';
import { bindMoveControls } from './move-controls.js';
import { bindConnectionControls } from './connection-controls.js';
import { bindAlignButtons } from './align-buttons.js';
import { bindClickHandlers } from './click-handlers.js';

// 重命名输入框绑定（独立小函数，便于在主流程中清晰调用）
function bindRenameInput() {
  if (renameToggleBtn) {
    renameToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      contextNodeNameSpan.style.display = 'none';
      contextRenameInput.style.display = 'inline-block';
      contextRenameInput.focus();
      contextRenameInput.select();
    });
  }
  if (contextRenameInput) {
    contextRenameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        saveRenameAndRestore();
      } else if (e.key === 'Escape') {
        contextRenameInput.value = appState.nodeMap.get(appState.contextTargetId)?.name || '';
        e.stopPropagation();
        saveRenameAndRestore();
      }
    });
    contextRenameInput.addEventListener('mousedown', (e) => e.stopPropagation());
    contextRenameInput.addEventListener('click', (e) => e.stopPropagation());
    contextRenameInput.addEventListener('blur', () => saveRenameAndRestore());
  }
}

// ============================================================
//  初始化移动模式：注册退出钩子 + 绑定所有 UI 事件
// ============================================================
export function initMoveMode() {
  // 注册退出移动模式的钩子，供 history 模块在撤销/重做时自动退出移动模式
  appState.exitMoveMode = (save) => exitMoveMode(save);
  // 注册进入移动模式钩子：鱼骨「移动线路」复用统一移动模式（nodeId 传 null，规避循环依赖）
  appState.enterMoveMode = (nodeId) => enterMoveMode(nodeId);

  // 1. 重命名输入框
  bindRenameInput();

  // 2. 空白处右键菜单（添加各类根节点 / 粘贴 / 设置 / 应用库）
  bindBlankContextMenu();

  // 3. 节点右键菜单（操作按钮 / 添加子节点 / 添加下一步）
  bindNodeContextMenu();

  // 4. 移动模式控制栏 + 大小/速度/颜色滑块
  bindMoveControls();

  // 5. 连接模式按钮 + 定位到另一视图
  bindConnectionControls();

  // 6. 对齐按钮（水平/垂直对齐 / 分组 / 分屏）
  bindAlignButtons();

  // 7. 3D 鼠标事件（拖拽 / 长按旋转 / 右键菜单 / 单击 / 双击 / 连线提示）
  //    放在最后，依赖 renderer.domElement 就绪
  bindClickHandlers();
}
