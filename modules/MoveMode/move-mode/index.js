// ============================================================
//  MoveMode / move-mode / index.js — 移动模式模块入口聚合
//  - 对外 API 与原 MoveCore.js 完全兼容
//  - 各子模块职责：
//      shared-internal.js           模块内部工具（节点树遍历 / 重叠消解 / ID 生成）
//      move-core.js                 移动模式状态机（enter/exit/saveRename）
//      node-factory.js              节点创建工厂（createNodeInProject / placeNode* / getNext*Name）
//      clipboard.js                 复制粘贴（copy/paste + deepClone/pasteNodeTree）
//      event-bindings/index.js      initMoveMode 主函数（编排 7 个子绑定）
//      event-bindings/blank-context-menu.js   空白处右键菜单
//      event-bindings/node-context-menu.js    节点右键菜单
//      event-bindings/move-controls.js        移动控制栏 + 滑块
//      event-bindings/connection-controls.js  连接模式 + 定位
//      event-bindings/align-buttons.js        对齐 / 分组 / 分屏
//      event-bindings/click-handlers.js       3D 鼠标事件 / 单击 / 双击 / 连线提示
// ============================================================

export { initMoveMode } from './event-bindings/index.js';

export {
  createNodeInProject,
  getNextRootName,
  getNextGlobalChildName,
  getNextChildName
} from './node-factory.js';

export { copySelectedNodes, pasteNodes } from './clipboard.js';

// 挂载连线提示到全局状态（原 MoveCore.js 末尾的顶层语句）
import { appState } from '../../module0_AppState.js';
import { showLineTooltip, hideLineTooltip } from '../LineTooltip.js';
appState.showLineTooltip = showLineTooltip;
appState.hideLineTooltip = hideLineTooltip;
