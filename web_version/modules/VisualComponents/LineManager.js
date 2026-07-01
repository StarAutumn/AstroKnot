// ============================================================
//  模块6 子模块：连线管理 (增删改 + 可视化控制)
// ============================================================
import * as THREE from 'three';
import { appState } from '../module0_AppState.js';
import { SpiralFlowLine, PolylineFlowLine } from './FlowLines.js';

// 2D 坐标转 3D 坐标（与 Resize.js arrange3DWith2DLayout 保持一致的比例）
function to3DFrom2D(x2d, y2d, baseY) {
  return new THREE.Vector3(x2d * 0.005, baseY, y2d * 0.015);
}

// ==================== 增量添加单条树连线 ====================
export function addSingleTreeLine(parentId, childId) {
  if (!parentId || parentId === appState.VIRTUAL_ROOT_ID) return;
  if (!appState.positions.has(parentId) || !appState.positions.has(childId)) return;
  const exists = appState.lineItems.some(it => it.startId === parentId && it.endId === childId && it.edgeType === 'tree');
  if (exists) return;
  let l = new SpiralFlowLine(
    appState.positions.get(parentId),
    appState.positions.get(childId),
    Math.random(),
    {
      startId: parentId,
      endId: childId,
      edgeType: 'tree',
      parentId: parentId,
      label: '',
      labelHidden: true,
      customColor: null
    }
  );
  appState.scene.add(l.mesh);
  appState.lineItems.push({ line: l, startId: parentId, endId: childId, edgeType: 'tree' });
}

// ==================== 增量移除连线 ====================
export function removeLinesForNodes(nodeIds) {
  const idSet = new Set(nodeIds);
  for (let i = appState.lineItems.length - 1; i >= 0; i--) {
    const it = appState.lineItems[i];
    if (idSet.has(it.startId) || idSet.has(it.endId)) {
      it.line.dispose();
      appState.lineItems.splice(i, 1);
    }
  }
}

// ==================== 重建所有连线 ====================
export function rebuildAllLines() {
  // 1. 收集现有树连线的标签及颜色信息
  const treeLabelMap = new Map();
  for (let it of appState.lineItems) {
    const ud = it.line.mesh.userData;
    if (ud.edgeType === 'tree') {
      const key = `${ud.startId}->${ud.endId}`;
      treeLabelMap.set(key, {
        label: ud.label || '',
        labelHidden: ud.labelHidden !== undefined ? ud.labelHidden : true,
        customColor: it.line.customColor ? '#' + it.line.customColor.getHexString() : null
      });
    }
  }

  // 2. 销毁所有旧连线
  for (let it of appState.lineItems) it.line.dispose();
  appState.lineItems = [];

  // 3. 生成树连线（带标签恢复）
  function addTree(node, pid) {
    if (pid && pid !== appState.VIRTUAL_ROOT_ID && appState.positions.has(pid) && appState.positions.has(node.id)) {
      const key = `${pid}->${node.id}`;
      const saved = treeLabelMap.get(key) || { label: '', labelHidden: true, customColor: null };
      let l = new SpiralFlowLine(
        appState.positions.get(pid),
        appState.positions.get(node.id),
        Math.random(),
        {
          startId: pid,
          endId: node.id,
          edgeType: 'tree',
          parentId: pid,
          label: saved.label,
          labelHidden: saved.labelHidden,
          customColor: saved.customColor ? new THREE.Color(saved.customColor) : null
        }
      );
      appState.scene.add(l.mesh);
      appState.lineItems.push({ line: l, startId: pid, endId: node.id, edgeType: 'tree' });
    }
    if (node.children) node.children.forEach(c => addTree(c, node.id));
  }
  addTree(appState.methodsTree, null);

  // 4. 交叉连线
  const edgeCountMap = new Map();
  const getEdgeKey = (s, t) => [s, t].sort().join('->');
  appState.crossEdges.forEach(e => {
    const key = getEdgeKey(e.source, e.target);
    edgeCountMap.set(key, (edgeCountMap.get(key) || 0) + 1);
  });
  const edgeIndexMap = new Map();

  for (let e of appState.crossEdges) {
    if (appState.positions.has(e.source) && appState.positions.has(e.target)) {
      const key = getEdgeKey(e.source, e.target);
      if (!edgeIndexMap.has(key)) edgeIndexMap.set(key, 0);
      const flowIndex = edgeIndexMap.get(key);
      edgeIndexMap.set(key, flowIndex + 1);

      if (e.waypoints && e.waypoints.length > 0) {
        const srcPos3D = appState.positions.get(e.source);
        const tgtPos3D = appState.positions.get(e.target);
        const baseY = srcPos3D.y;

        const points3D = [srcPos3D.clone()];
        for (const wp of e.waypoints) {
          points3D.push(to3DFrom2D(wp.x, wp.y, baseY));
        }
        points3D.push(tgtPos3D.clone());

        let pl = new PolylineFlowLine(points3D, Math.random(), {
          startId: e.source,
          endId: e.target,
          edgeType: 'cross',
          label: e.label || '',
          labelHidden: e.labelHidden !== undefined ? e.labelHidden : true,
          customColor: e.customColor || null
        });
        appState.scene.add(pl.mesh);
        appState.lineItems.push({ line: pl, startId: e.source, endId: e.target, edgeType: 'cross', isPolyline: true });
        continue;
      }

      let l = new SpiralFlowLine(
        appState.positions.get(e.source),
        appState.positions.get(e.target),
        Math.random(),
        {
          startId: e.source,
          endId: e.target,
          edgeType: 'cross',
          label: e.label || '',
          labelHidden: e.labelHidden !== undefined ? e.labelHidden : true,
          customColor: e.customColor || null,
          flowIndex: flowIndex
        }
      );
      appState.scene.add(l.mesh);
      appState.lineItems.push({ line: l, startId: e.source, endId: e.target, edgeType: 'cross' });
    }
  }
  updateLinesVis();
}

// ==================== 拖拽时增量更新连线 ====================
export function updateLinesForNodes(movedNodeIds) {
  const idSet = new Set(movedNodeIds);
  for (let it of appState.lineItems) {
    if (idSet.has(it.startId) || idSet.has(it.endId)) {
      const startPos = appState.positions.get(it.startId);
      const endPos = appState.positions.get(it.endId);
      if (!startPos || !endPos) continue;

      if (it.isPolyline && it.line instanceof PolylineFlowLine) {
        const edgeData = appState.crossEdges.find(e =>
          e.source === it.startId && e.target === it.endId &&
          e.waypoints && e.waypoints.length > 0
        );
        const baseY = startPos.y;
        const points3D = [startPos.clone()];
        if (edgeData?.waypoints) {
          for (const wp of edgeData.waypoints) {
            points3D.push(to3DFrom2D(wp.x, wp.y, baseY));
          }
        }
        points3D.push(endPos.clone());
        it.line.updatePositions(points3D);
      } else {
        it.line.updatePositions(startPos, endPos);
      }
    }
  }
}

// ==================== 连线可见性控制 ====================
export function updateLinesVis() {
  for (let it of appState.lineItems) {
    let sv = appState.nodeMeshes.get(it.startId)?.visible ?? false;
    let ev = appState.nodeMeshes.get(it.endId)?.visible ?? false;
    it.line.setVisible(sv && ev);
  }
}
