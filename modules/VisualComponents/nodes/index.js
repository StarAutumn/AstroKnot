// ============================================================
//  nodes/index.js — 3D 节点网格 + 动画 子模块入口
//  聚合 re-export 对外 API（保持与原 Nodes.js 兼容）
// ============================================================

// ── utils ──
export { generateRandomPosition } from './utils.js';

// ── animations ──
export { animateDeleteNode } from './animations.js';

// ── card-label ──
export { updateCardTexture } from './card-label.js';

// ── card-billboard ──
export { updateCardBillboards } from './card-billboard.js';

// ── card-overlay ──
export {
  removeCardOverlay3D,
  clearAllCardOverlays3D,
  setViewTransitioning,
  fadeCardOverlays3D
} from './card-overlay.js';

// ── mesh ──
export {
  createNodeMesh,
  updateNodeVisuals,
  destroyNodeMesh,
  destroyNodeMeshImmediate
} from './mesh.js';
