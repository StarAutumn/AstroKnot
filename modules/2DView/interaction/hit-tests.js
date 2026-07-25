// ============================================================
//  2DView / interaction / hit-tests.js — 锚点/快速创建/组群矩形命中检测
// ============================================================

import { appState } from '../../module0_AppState.js';
import { createNodeInProject, getNextChildName } from '../../MoveMode/move-mode/index.js';
import {
  nodeHitAreas, groupRects,
  HANDLE_SIZE, getGroupHandlePositions,
  ANCHOR_HIT_RADIUS, ANCHOR_KEYS, getNodeAnchors,
  QUICK_ADD_HIT_RADIUS
} from '../shared.js';

// 锚点命中检测：返回 { nodeId, anchorKey } 或 null
export function hitTestAnchorOnAnyNode(worldX, worldY) {
  for (const area of nodeHitAreas) {
    if (!area.id) continue;
    const anchors = getNodeAnchors(area.x, area.y, area.width, area.height);
    for (const key of ANCHOR_KEYS) {
      const pt = anchors[key];
      const dx = worldX - pt.x;
      const dy = worldY - pt.y;
      if (dx * dx + dy * dy <= ANCHOR_HIT_RADIUS * ANCHOR_HIT_RADIUS) {
        return { nodeId: area.id, anchorKey: key };
      }
    }
  }
  return null;
}

// 快速创建子节点按钮命中检测
// 右框中点 → 'child'(文本子节点)；下框中点 → 'step'(步骤子节点)
// 返回 { nodeId, type } 或 null
export function hitTestQuickAddButton(worldX, worldY) {
  for (const area of nodeHitAreas) {
    if (!area.id) continue;
    // card 和 webpage 模式节点也支持快速创建子节点
    // 右框中点（文本子节点）
    const rightX = area.x + area.width;
    const rightY = area.y + area.height / 2;
    const dxR = worldX - rightX;
    const dyR = worldY - rightY;
    if (dxR * dxR + dyR * dyR <= QUICK_ADD_HIT_RADIUS * QUICK_ADD_HIT_RADIUS) {
      return { nodeId: area.id, type: 'child' };
    }
    // 下框中点（步骤子节点）
    const botX = area.x + area.width / 2;
    const botY = area.y + area.height;
    const dxB = worldX - botX;
    const dyB = worldY - botY;
    if (dxB * dxB + dyB * dyB <= QUICK_ADD_HIT_RADIUS * QUICK_ADD_HIT_RADIUS) {
      return { nodeId: area.id, type: 'step' };
    }
  }
  return null;
}

// 根据按钮类型创建子节点
export function quickAddChildNode(parentId, type) {
  const parentNode = appState.nodeMap.get(parentId);
  if (!parentNode) return;
  if (type === 'step') {
    const nextName = getNextChildName(parentNode, /^下一步(\d+)$/, '下一步');
    createNodeInProject({
      name: nextName, desc: '📖 自定义节点', sizeScale: 1.0,
      parentId, offsetX: 0, offsetY: 60, isStepFlow: true
    });
  } else {
    const childName = getNextChildName(parentNode, /^子节点(\d+)$/, '子节点');
    createNodeInProject({
      name: childName, desc: '📖 自定义节点', sizeScale: 1.0,
      parentId, offsetX: 160, offsetY: 10
    });
  }
}

// 组群矩形把手命中检测：返回 'nw'|'ne'|'sw'|'se'|null
export function hitTestGroupHandle(worldPos, gr) {
  if (!gr) return null;
  const hs = HANDLE_SIZE;
  const handles = getGroupHandlePositions(gr);
  for (const [corner, h] of Object.entries(handles)) {
    if (worldPos.x >= h.x && worldPos.x <= h.x + hs &&
        worldPos.y >= h.y && worldPos.y <= h.y + hs) {
      return corner;
    }
  }
  return null;
}

// 组群矩形本体命中检测：返回索引或 -1
export function hitTestGroupRect(worldPos) {
  for (let i = groupRects.length - 1; i >= 0; i--) {
    const gr = groupRects[i];
    if (gr.layerId && gr.layerId !== appState.currentLayerId) continue;
    if (worldPos.x >= gr.x && worldPos.x <= gr.x + gr.width &&
        worldPos.y >= gr.y && worldPos.y <= gr.y + gr.height) {
      return i;
    }
  }
  return -1;
}
