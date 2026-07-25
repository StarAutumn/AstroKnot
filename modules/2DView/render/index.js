// ============================================================
//  2DView / render / index.js — 渲染模块入口聚合
//  - 对外 API 与原 Render.js 完全兼容
//  - 各子模块职责：
//      frame-state.js    帧内状态中枢（_frameNow / 索引 / 缓存 / 命中区）
//      visibility.js     图层过滤 / 动画进度 / 可见性
//      shape-utils.js    形状绘制 / 文本工具 / 卡片尺寸
//      node-renderers.js 普通节点 / 卡片节点 / 网页节点
//      edge-renderers.js 连线 / 折线 / 锚点 / 自由绘制预览
//      scene-renderers.js 树递归 / 跨层连线 / 组群 / 框选 / 视口
//      draw.js           主绘制函数 draw()
// ============================================================

export { draw } from './draw.js';

export {
  mark2DDirty,
  setPostDrawHook,
  _cardRenameHitAreas,
  _cardBodyRects
} from './frame-state.js';

export {
  isNodeInCurrentLayer,
  getNodeVisibilityAlpha
} from './visibility.js';

export {
  getCardSize,
  getCardOffset
} from './shape-utils.js';
