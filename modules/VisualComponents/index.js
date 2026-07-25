// ============================================================
//  模块6：3D 可视化组件
//  入口文件 — 实际代码在 FlowLines / Nodes / LineManager / SceneBuilder
// ============================================================

// ── 连线 3D 类 + 帧计数器 ──
export { _bumpRenderFrame, SpiralFlowLine, PolylineFlowLine } from './FlowLines.js';

// ── 节点网格 + 动画 ──
export { generateRandomPosition, animateDeleteNode, createNodeMesh, updateNodeVisuals, destroyNodeMesh, destroyNodeMeshImmediate, updateCardTexture, updateCardBillboards, removeCardOverlay3D, clearAllCardOverlays3D, fadeCardOverlays3D, setViewTransitioning } from './nodes/index.js';

// ── 连线管理 ──
export { addSingleTreeLine, removeLinesForNodes, rebuildAllLines, updateLinesForNodes, updateLinesVis } from './LineManager.js';

// ── 场景构建 ──
export { buildSceneFromTree } from './SceneBuilder.js';
