// ============================================================
//  2DView / interaction / fishbone-mouse.js — 鱼骨 2D 编辑鼠标交互
//  从 mouse-events.js 下沉的鱼骨编辑交互（fishboneEdit / selectedSeg 等状态
//  仍由 Fishbone/state.js 持有）：按下（端点拖动 / 干段单击选中与平移候选 /
//  分支锁定干线滑动 / 自由端相似变换）、拖动（端点改向改长 / 分支弧长滑动 /
//  线体平移 / tooltip 处理）、收尾（3D 同步与落盘），以及段选中高亮取消。
//  对外 API：
//    fishboneMouseDownDeselect(worldPos)  段选中后点击别处 → 取消高亮（不消费事件）
//    fishboneMouseDown(e, worldPos)       按下；返回 true = 事件已消费，原 onMouseDown 应 return
//    fishboneMouseMove(e, pos)            pos 为画布坐标；返回 true = 事件已消费
//    fishboneMouseUp()                    收尾；返回 true = 事件已消费
// ============================================================

import { appState } from '../../module0_AppState.js';
import { saveCurrentProjectData } from '../../TreeData/index.js';
import {
  canvas, transform,
  setDragging, setNodeDragging,
  boxSelectSegKeys, clearBoxSelectSegKeys,
  lineTooltipJustOpened, setLineTooltipJustOpened,
  getNodeLayoutSize
} from '../shared.js';
import { draw, mark2DDirty } from '../render/index.js';
import { collectDescendantIds } from '../Layout.js';
import { canvasToWorld } from './coordinate-utils.js';
import { hitTestFishboneSeg2D, hitTestFishboneEndpoint2D,
         projectOnTrunk2D, collectFishboneSubtree2D } from '../../Fishbone/render2d.js';
import { fishboneEdit, setFishboneEdit, selectedSeg } from '../../Fishbone/state.js';
import { trunkPointTo3D, fishboneLayerY, rebuildFishbone3D, clearFishboneSegHighlight, highlightFishboneSeg } from '../../Fishbone/render3d.js';
import { updateLinesForNodes } from '../../VisualComponents/index.js';

// 鱼骨节点快照：以"左边缘中点"为变换参考点（与分支终点连接点一致），
// 旋转/缩放后按 anchor 反推左上角，保证分支终点与节点严格吻合；
// isFishbone 标记鱼骨本体节点（松手后需同步 3D 以保持鱼骨线端点连接），
// 树后代节点仅 2D 跟随（与普通拖节点一致，3D 布局独立）
function _fishboneNodeAnchorSnapshot(id, isFishbone = false) {
  const node = appState.nodeMap.get(id);
  const pos = appState.positions2D.get(id);
  const { height } = getNodeLayoutSize(node, (node && node.sizeScale) || 1);
  return { id, isFishbone, anchorX: pos ? pos.x : 0, anchorY: pos ? pos.y + height / 2 : 0, h: height };
}

// 干线 polyline 上弧长 s 处的坐标（s 需钳位在 [0, 总长]），分支沿干线滑动用
function _pointAtArc(pts, cum, s) {
  for (let i = 1; i < pts.length; i++) {
    if (s <= cum[i] || i === pts.length - 1) {
      const segLen = cum[i] - cum[i - 1];
      const t = segLen > 0 ? (s - cum[i - 1]) / segLen : 0;
      return {
        x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t,
        y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t
      };
    }
  }
  const last = pts[pts.length - 1];
  return { x: last.x, y: last.y };
}

// 鱼骨段选中后点击别处（空白/节点/连线等）：取消选中高亮
// （端点属于鱼骨本体，拖端点编辑时保留高亮；下方鱼骨段命中分支内会重置为新段）
// 不消费事件：调用后原 onMouseDown 继续走原流程
export function fishboneMouseDownDeselect(worldPos) {
  if ((selectedSeg || boxSelectSegKeys.size) && !hitTestFishboneEndpoint2D(worldPos.x, worldPos.y)) {
    clearFishboneSegHighlight();
    clearBoxSelectSegKeys();
    mark2DDirty();
    draw();
  }
}

// 鱼骨编辑拖动按下：返回 true 表示事件已消费（原内联块的 return），false 继续原流程
export function fishboneMouseDown(e, worldPos) {
  // 鱼骨编辑拖动：端点优先（拖端点改向改长，另一端固定），其次线体（点击弹标签 / 拖动平移全图）
  const fishEpHit = hitTestFishboneEndpoint2D(worldPos.x, worldPos.y);
  if (fishEpHit) {
    e.preventDefault();
    setDragging(false);
    setNodeDragging(false);
    if (appState.hideLineTooltip) appState.hideLineTooltip();
    const edit = { type: 'endpoint', trunkId: fishEpHit.trunk.id, pointIndex: fishEpHit.pointIndex, moved: false };
    // 分支起点端点 → 锁定父干线滑动（parentId 持久化关系，重合端点不受几何误判影响）；
    // 干路端点 / 分支自由端 → 自由拖动（旋转+缩放）。
    // 不做几何回退：干路端点贴合支路时会被误锁成"沿支路滑动"
    if (fishEpHit.trunk.parentId && fishEpHit.pointIndex === 0) {
      edit.onTrunkId = fishEpHit.trunk.parentId;
    }
    // 自由端点 → 以另一端为锚做旋转+等比缩放相似变换，子树（干线+子支+节点）刚体跟随
    if (!edit.onTrunkId) {
      const pts = fishEpHit.trunk.points || [];
      const anchorIdx = fishEpHit.pointIndex === 0 ? pts.length - 1 : 0;
      edit.originE = { x: pts[fishEpHit.pointIndex].x, y: pts[fishEpHit.pointIndex].y };
      edit.anchor = { x: pts[anchorIdx].x, y: pts[anchorIdx].y };
      const subtree = collectFishboneSubtree2D(fishEpHit.trunk);
      edit.snapshot = subtree.map(t => ({
        id: t.id,
        points: (t.points || []).map(p => ({ x: p.x, y: p.y }))
      }));
      const nodeIds = [...new Set(subtree.filter(t => t.endNodeId).map(t => t.endNodeId))];
      // 鱼骨节点 + 其树后代（子节点、后代卡片）整体跟随变换
      const fishSet = new Set(nodeIds);
      const allNodeIds = [...new Set(nodeIds.flatMap(id => [id, ...collectDescendantIds(id)]))];
      edit.nodeSnapshots = allNodeIds.map(id => _fishboneNodeAnchorSnapshot(id, fishSet.has(id)));
    }
    setFishboneEdit(edit);
    canvas.style.cursor = 'grabbing';
    return true;
  }

  // 鱼骨主干段命中检测：单击只选中（黄色高亮该段），标签/颜色等编辑功能在右键菜单
  const fishHit = hitTestFishboneSeg2D(worldPos.x, worldPos.y);
  if (fishHit) {
    e.preventDefault();
    setDragging(false);
    setNodeDragging(false);
    canvas.style.cursor = 'grab';
    if (appState.hideLineTooltip) appState.hideLineTooltip();   // 关闭残留的连线标签面板
    clearFishboneSegHighlight();
    // highlightFishboneSeg 按段 id 匹配（2D 绘制 / 3D 染色均比对 segId），segIndex 需先转 id
    const hitSegId = fishHit.trunk.segs?.[fishHit.segIndex]?.id;
    if (hitSegId) highlightFishboneSeg(fishHit.trunk.id, hitSegId);
    // 2D 为事件驱动渲染：mousedown 后不主动 draw 高亮不会显示
    mark2DDirty();
    draw();
    // 记录平移候选：移动超过阈值后拖动该干线及其子支（支路上的节点跟着移动）
    const subtree = collectFishboneSubtree2D(fishHit.trunk);
    const nodeIds = [...new Set(subtree.filter(t => t.endNodeId).map(t => t.endNodeId))];
    // 鱼骨节点 + 其树后代（子节点、后代卡片）一起平移
    const fishSet = new Set(nodeIds);
    const allNodeIds = [...new Set(nodeIds.flatMap(id => [id, ...collectDescendantIds(id)]))];
    // 分支判定：仅按创建时记录的 parentId（每帧迁移已为旧分支补标；分支滑到干线端点
    // 重合后几何判定会误判父子——干路起点贴合支路时几何回退会把干路锁成"沿支路滑动"）；
    // 无 parentId = 根干路 → 自由平移整棵子树
    let parentTrunk = null;
    if (fishHit.trunk.parentId) {
      parentTrunk = (appState.fishboneTrunks || []).find(t => t.id === fishHit.trunk.parentId) || null;
    }
    let slide = null;
    const startPt = fishHit.trunk.points && fishHit.trunk.points[0];
    if (parentTrunk && startPt) {
      const proj = projectOnTrunk2D(parentTrunk.id, startPt.x, startPt.y);
      if (proj) {
        const lpts = parentTrunk.points || [];
        // 弧长表：cum[i] = 到第 i 个顶点的累计长度
        const cum = [0];
        for (let i = 1; i < lpts.length; i++) {
          cum.push(cum[i - 1] + Math.hypot(lpts[i].x - lpts[i - 1].x, lpts[i].y - lpts[i - 1].y));
        }
        const segLen = cum[proj.segIndex + 1] - cum[proj.segIndex];
        const a = lpts[proj.segIndex], b = lpts[proj.segIndex + 1];
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        // 分支起点初始弧长位置 + 所在段单位切向：鼠标切向位移 1:1 映射为弧长，
        // 弧长钳位 [0, 总长] → 起点「到干线起点即停、到干线终点可达」，无法脱离
        slide = {
          pts: lpts,
          cum,
          total: cum[cum.length - 1] || 0,
          s0: cum[proj.segIndex] + proj.t * segLen,
          tx: (b.x - a.x) / len, ty: (b.y - a.y) / len,
          proj0: { x: proj.x, y: proj.y }
        };
      }
    }
    setFishboneEdit({
      type: 'translate',
      startWorld: { x: worldPos.x, y: worldPos.y },
      slide,
      subtreeTrunkIds: subtree.map(t => t.id),
      snapshot: subtree.map(t => ({
        id: t.id,
        points: (t.points || []).map(p => ({ x: p.x, y: p.y }))
      })),
      nodeSnapshots: allNodeIds.map(id => _fishboneNodeAnchorSnapshot(id, fishSet.has(id))),
      moved: false
    });
    return true;
  }

  return false;
}

// 鱼骨编辑拖动：返回 true 表示事件已消费
export function fishboneMouseMove(e, pos) {
  // ── 鱼骨编辑拖动（拖端点改向改长 / 拖线体平移全图） ──
  if (fishboneEdit) {
    e.preventDefault();
    const worldPos = canvasToWorld(pos.x, pos.y);
    if (fishboneEdit.type === 'endpoint') {
      const trunk = (appState.fishboneTrunks || []).find(t => t.id === fishboneEdit.trunkId);
      const pt = trunk && trunk.points[fishboneEdit.pointIndex];
      if (pt) {
        if (fishboneEdit.onTrunkId) {
          // 只能沿所在干线滑动：投影吸附到按下时锁定的干线
          const on = projectOnTrunk2D(fishboneEdit.onTrunkId, worldPos.x, worldPos.y);
          if (on) {
            if (!fishboneEdit.moved && Math.hypot(on.x - pt.x, on.y - pt.y) > 0.5) fishboneEdit.moved = true;
            pt.x = on.x;
            pt.y = on.y;
          }
        } else if (fishboneEdit.snapshot) {
          // 旋转 + 等比缩放相似变换：绕固定锚点 F，P' = F + s·R(θ)·(P−F)
          // 干线、子支、节点（左边缘中点）整体刚体跟随；从按下快照重算避免累积误差
          if (!fishboneEdit.moved &&
              Math.hypot(worldPos.x - fishboneEdit.originE.x, worldPos.y - fishboneEdit.originE.y) > 1 / transform.scale) {
            fishboneEdit.moved = true;
          }
          const A = fishboneEdit.anchor;
          const s0 = Math.hypot(fishboneEdit.originE.x - A.x, fishboneEdit.originE.y - A.y);
          const s1 = Math.hypot(worldPos.x - A.x, worldPos.y - A.y);
          if (s0 > 1e-6 && s1 > 1e-6) {
            const scale = s1 / s0;
            const rot = Math.atan2(worldPos.y - A.y, worldPos.x - A.x) -
                        Math.atan2(fishboneEdit.originE.y - A.y, fishboneEdit.originE.x - A.x);
            const cos = Math.cos(rot), sin = Math.sin(rot);
            const xf = (px, py) => ({
              x: A.x + scale * (cos * (px - A.x) - sin * (py - A.y)),
              y: A.y + scale * (sin * (px - A.x) + cos * (py - A.y))
            });
            for (const snap of fishboneEdit.snapshot) {
              const tk = (appState.fishboneTrunks || []).find(t => t.id === snap.id);
              if (!tk) continue;
              tk.points = snap.points.map(p => xf(p.x, p.y));
            }
            for (const ns of (fishboneEdit.nodeSnapshots || [])) {
              const pos = appState.positions2D.get(ns.id);
              if (pos) {
                const t = xf(ns.anchorX, ns.anchorY);
                pos.x = t.x;
                pos.y = t.y - ns.h / 2;
              }
            }
          }
          pt.x = worldPos.x;   // 被拖端点精确落在鼠标（构造上等于 xf(originE)，兼作退化保护）
          pt.y = worldPos.y;
        } else {
          pt.x = worldPos.x;
          pt.y = worldPos.y;
        }
      }
    } else if (fishboneEdit.type === 'translate') {
      let dx, dy;
      if (fishboneEdit.slide) {
        // 分支沿所在干线滑动：鼠标切向位移 1:1 映射为弧长，钳位 [0, 总长]
        // → 起点「到干线起点即停、到干线终点可达」，分支整体保持形状、无法脱离干线
        const sl = fishboneEdit.slide;
        const along = (worldPos.x - fishboneEdit.startWorld.x) * sl.tx +
                      (worldPos.y - fishboneEdit.startWorld.y) * sl.ty;
        const s = Math.max(0, Math.min(sl.total, sl.s0 + along));
        const proj = _pointAtArc(sl.pts, sl.cum, s);
        dx = proj.x - sl.proj0.x;
        dy = proj.y - sl.proj0.y;
      } else {
        dx = worldPos.x - fishboneEdit.startWorld.x;
        dy = worldPos.y - fishboneEdit.startWorld.y;
      }
      if (!fishboneEdit.moved && Math.hypot(dx, dy) > 4 / transform.scale) {
        fishboneEdit.moved = true;
        // 仅关 tooltip，保留鱼骨段选中高亮（拖动与选中属同一会话，缩放越大阈值越小，
        // 单击的微小移动也会触发此分支，不能清掉 mousedown 刚设置的段高亮）
        if (appState.hideLineTooltip) appState.hideLineTooltip(true);
      }
      if (fishboneEdit.moved) {
        // 从按下时快照重算，避免逐帧累积误差；节点按锚点（左边缘中点）平移后反推左上角
        for (const snap of fishboneEdit.snapshot) {
          const trunk = (appState.fishboneTrunks || []).find(t => t.id === snap.id);
          if (!trunk) continue;
          trunk.points = snap.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
        }
        for (const ns of (fishboneEdit.nodeSnapshots || [])) {
          const pos = appState.positions2D.get(ns.id);
          if (pos) {
            pos.x = ns.anchorX + dx;
            pos.y = ns.anchorY + dy - ns.h / 2;
          }
        }
      }
    }
    mark2DDirty();
    draw();
    return true;
  }
  return false;
}

// 鱼骨编辑拖动收尾：返回 true 表示事件已消费
export function fishboneMouseUp() {
  // ── 鱼骨编辑拖动收尾（端点旋转缩放 / 沿线滑动 / 整体平移） ──
  if (fishboneEdit) {
    const wasEdit = fishboneEdit;
    setFishboneEdit(null);
    canvas.style.cursor = 'grab';
    mark2DDirty();
    draw();
    if (!wasEdit.moved) {
      // 视为点击：标签已在按下时弹出/隐藏，仅复位 justOpened 标记
      if (lineTooltipJustOpened) setLineTooltipJustOpened(false);
    } else {
      // 鱼骨本体节点：2D 位置同步到 3D（球心 = 左边缘中点映射，保持鱼骨线端点连接）；
      // 树后代仅 2D 跟随（与普通拖节点一致，3D 布局独立）。
      // 随机模式（非图层排列）：3D 位置独立于 2D，不做平面映射同步
      const syncedIds = [];
      if (appState.layer3DLayout) {
        for (const ns of (wasEdit.nodeSnapshots || [])) {
          if (!ns.isFishbone) continue;
          const node = appState.nodeMap.get(ns.id);
          const pos2D = appState.positions2D.get(ns.id);
          if (!node || !pos2D) continue;
          // 映射到宿主干线所属图层平面（鱼骨节点 3D 位置由 2D 坐标推导，需与干线同层）
          const hostTrunk = (appState.fishboneTrunks || []).find(t => t.endNodeId === ns.id);
          const ly = fishboneLayerY(hostTrunk?.layerId || appState.currentLayerId);
          const pos3D = trunkPointTo3D({ x: pos2D.x, y: pos2D.y + ns.h / 2 }, ly);
          appState.positions.set(ns.id, pos3D);
          const obj = appState.nodeMeshes.get(ns.id);
          if (obj && obj.mesh) obj.mesh.position.copy(pos3D);
          syncedIds.push(ns.id);
        }
      }
      rebuildFishbone3D(true);   // 干线/子支几何已变，强制重建 3D 线
      if (syncedIds.length) updateLinesForNodes(syncedIds);   // 同步鱼骨节点的 3D 树连线
      if (appState.hideLineTooltip) appState.hideLineTooltip(true);   // 保留段选中高亮
      saveCurrentProjectData();   // 拖动结果落盘
    }
    return true;
  }
  return false;
}
