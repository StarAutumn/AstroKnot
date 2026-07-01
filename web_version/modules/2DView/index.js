// ============================================================
//  2DView / index.js — 汇总导出入口
//  对外暴露与原 module16_2DView.js 相同的 API
// ============================================================

export {
  init2DView, show2DView, hide2DView, toggle2DView, refresh2DView,
  resizeCanvas, toggle2DCollapse
} from './Core.js';

export {
  layoutTree, assignCoordinates, extractNodePositions,
  resolveNodeOverlaps, resolveNodeLineOverlaps, collectDescendantIds,
  isNextStepNode
} from './Layout.js';

export { draw } from './Render.js';

export {
  focusOnNode2D, startMultiNodeMove,
  groupNodes, autoArrangeTreeLayout,
  zoom2D, reset2DView,
  process2DPanning, get2DKeys, set2DKey
} from './Interaction.js';

export {
  groupRects,
  BASE_NODE_WIDTH, BASE_NODE_HEIGHT, H_GAP, V_GAP,
  POLYLINE_PEG_X, POLYLINE_PEG_Y,
  getNodeAnchors
} from './shared.js';