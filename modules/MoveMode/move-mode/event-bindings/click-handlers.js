// ============================================================
//  MoveMode / event-bindings / click-handlers.js
//  3D 鼠标/触摸事件：拖拽节点、长按旋转、非移动模式右键菜单、单击、双击、连线提示
//  本模块在 initMoveMode 中最后调用，需要 renderer.domElement 就绪
//
//  注意：drag3DNode / drag3DWasMoved 是 shared.js 的 export let，
//  作为 ES Module live binding，import 后在回调内读取即为最新值。
// ============================================================

import * as THREE from 'three';
import { appState } from '../../../module0_AppState.js';
import {
  clearSelected, setSelectedNode,
  completeAddConnection, completeRemoveConnection, cancelConnectionMode, showToast
} from '../../../SelectAndEdit/index.js';
import {
  showBlankContextMenu, hideBlankContextMenu, showContextMenu, hideContextMenu,
  completeConvertChildMode, cancelConvertChildMode
} from '../../../module8_ContextMenu.js';
import { openRichEditor } from '../../../richEditor/index.js';
import { showLineTooltip, hideLineTooltip } from '../../LineTooltip.js';
import { clearFishboneSegHighlight, highlightFishboneSeg, rebuildFishbone3D, refreshFishboneTrunkPositions, FISHBONE_3D_SCALE, computeFishboneSkeleton3D, trunkPointTo3D, fishboneLayerY } from '../../../Fishbone/render3d.js';
import { showFishboneContextMenu } from '../../../Fishbone/context-menu.js';
import { collectFishboneSubtree2D, projectOnTrunk2D } from '../../../Fishbone/render2d.js';
import { collectDescendantIds } from '../../../2DView/Layout.js';
import { getNodeLayoutSize } from '../../../2DView/shared.js';
import { updateLinesForNodes } from '../../../VisualComponents/index.js';
import { handleLabelClick } from '../../../VisualComponents/nodes/interaction.js';
import {
  getHitNodeId,
  getRaycastTargets,
  isMoveMode,
  moveTargetId, setMoveTargetId,
  drag3DNode, setDrag3DNode,
  drag3DWasMoved, setDrag3DWasMoved,
  drag3DStart, drag3DStartPos,
  isRotatingView3D, setIsRotatingView3D,
  dragPlane, dragPlaneHit,
  dragPlaneStartHit, dragStartPositions,
  rotateStartMouse, rotateStartCamPos, rotateStartTarget,
  ray, mouse,
  longPressTimer, setLongPressTimer,
  longPressStartPos, setLongPressStartPos,
  isLongPressRotating, setIsLongPressRotating,
  longPressRotateStart, longPressRotateCamStart, longPressRotateTargetStart,
  LONG_PRESS_DURATION,
  setLastBlankMenuMouse
} from '../../shared.js';
import { collectDescendants, resolveOverlapAfterMove } from '../shared-internal.js';

// ── 鱼骨「移动线路」拖动状态（按住线路期间持有，松手收尾清空）──
// kind: 'translate' 整体平移 | 'rotate' 端点抓取旋转（改朝向） | 'slide' 支路沿干路滑动
// { kind, rot, slide, subtreeIds, startHit, moved, anchor,
//   trunks: [{t, pts}], nodes: [{id, anchorX, anchorY, h}], nodes3D: [{id, x, y, z}] }
let _fbMoveDrag = null;

// 线路渲染骨架 3D 点（图层模式 = 2D 平面映射；随机模式 = 3D 骨架，末端接节点球心）
function _grabSkeletonPts3D(t) {
  if (appState.layer3DLayout) {
    const ly = fishboneLayerY(t.layerId);
    return (t.points || []).map(p => trunkPointTo3D(p, ly));
  }
  const sk = computeFishboneSkeleton3D(t);
  if (t.endNodeId && sk.length >= 2) {
    const np = appState.positions.get(t.endNodeId);
    if (np) sk[sk.length - 1] = np.clone();
  }
  return sk;
}

// 端点旋转+拉伸：抓取端精确跟随鼠标（远离支点拉长 / 靠近支点缩短），另一端为支点固定，
// 整棵子树绕支点刚性旋转 + 等比缩放（形状不变）。
// 随机模式：dirs3D 旋转、_3dOff/_3dPos/节点 3D 旋转+缩放（支点相对），子树 2D 点绕 2D 支点
// 等比缩放（3D 段长 = 2D 段长×SCALE，长度自动同步，2D 支线视图同步拉伸）；图层模式在平面内
// 旋转+缩放 2D points + 节点 2D/3D（同角同比），2D/3D 自动一致
function _applyFbRotate() {
  const R = _fbMoveDrag.rot;
  if (!appState.layer3DLayout) {
    // 随机模式：最小旋转四元数 v0 → v1（v1 = 当前平面命中点相对支点）+ 等比 |v1|/|v0|
    const v1 = new THREE.Vector3().subVectors(dragPlaneHit, R.pivot3);
    if (R.v0.lengthSq() < 1e-9 || v1.lengthSq() < 1e-9) return;
    const sc = Math.max(0.1, Math.min(10, v1.length() / R.v0.length()));
    const q = new THREE.Quaternion().setFromUnitVectors(R.v0.clone().normalize(), v1.normalize());
    for (const sn of R.trunks) {
      if (sn.dirs) sn.t.dirs3D = sn.dirs.map(d => new THREE.Vector3(d[0], d[1], d[2]).applyQuaternion(q).toArray());
      if (sn.off) sn.t._3dOff = new THREE.Vector3(sn.off[0], sn.off[1], sn.off[2]).applyQuaternion(q).multiplyScalar(sc).toArray();
      if (sn.pos) sn.t._3dPos = new THREE.Vector3(sn.pos[0], sn.pos[1], sn.pos[2]).sub(R.pivot3).applyQuaternion(q).multiplyScalar(sc).add(R.pivot3).toArray();
      // 拉伸：子树 2D 点绕 2D 支点等比缩放 → 3D 段长同步缩放
      sn.t.points = sn.pts.map(p => ({ x: R.p2.x + (p.x - R.p2.x) * sc, y: R.p2.y + (p.y - R.p2.y) * sc }));
    }
    // 末端节点：3D 球心绕支点旋转+缩放；2D 左边缘中点绕 2D 支点等比缩放（保持 2D/3D 末端连接）
    for (const bs of _fbMoveDrag.nodes3D) {
      const newPos = new THREE.Vector3(bs.x, bs.y, bs.z).sub(R.pivot3).applyQuaternion(q).multiplyScalar(sc).add(R.pivot3);
      appState.positions.set(bs.id, newPos);
      const obj = appState.nodeMeshes.get(bs.id);
      if (obj) {
        obj.mesh.position.copy(newPos);
        if (obj.label) obj.label.position.set(newPos.x, newPos.y + appState.NODE_RADIUS + 0.28, newPos.z);
      }
    }
    for (const ns of _fbMoveDrag.nodes) {
      appState.positions2D.set(ns.id, {
        x: R.p2.x + (ns.anchorX - R.p2.x) * sc,
        y: R.p2.y + (ns.anchorY - R.p2.y) * sc - ns.h / 2
      });
    }
    refreshFishboneTrunkPositions([..._fbMoveDrag.subtreeIds]);
    return;
  }
  // 图层模式：平面内旋转+等比缩放（2D (x,y) 与 3D (X,Z) 同角同比，y 保持）
  const target2 = { x: dragPlaneHit.x / FISHBONE_3D_SCALE, y: dragPlaneHit.z / FISHBONE_3D_SCALE };
  const dA = Math.atan2(target2.y - R.pivot2.y, target2.x - R.pivot2.x)
           - Math.atan2(R.grab2.y - R.pivot2.y, R.grab2.x - R.pivot2.x);
  const sc = Math.max(0.1, Math.min(10, Math.hypot(target2.x - R.pivot2.x, target2.y - R.pivot2.y) /
                                     Math.max(1e-9, Math.hypot(R.grab2.x - R.pivot2.x, R.grab2.y - R.pivot2.y))));
  const cos = Math.cos(dA), sin = Math.sin(dA);
  const rot2 = (x, y) => ({
    x: R.pivot2.x + ((x - R.pivot2.x) * cos - (y - R.pivot2.y) * sin) * sc,
    y: R.pivot2.y + ((x - R.pivot2.x) * sin + (y - R.pivot2.y) * cos) * sc
  });
  for (const sn of R.trunks) sn.t.points = sn.pts.map(p => rot2(p.x, p.y));
  for (const ns of _fbMoveDrag.nodes) {
    const c = rot2(ns.anchorX, ns.anchorY);   // 左边缘中点绕支点旋转+缩放
    appState.positions2D.set(ns.id, { x: c.x, y: c.y - ns.h / 2 });
  }
  for (const bs of _fbMoveDrag.nodes3D) {
    const nx = R.pivot3.x + ((bs.x - R.pivot3.x) * cos - (bs.z - R.pivot3.z) * sin) * sc;
    const nz = R.pivot3.z + ((bs.x - R.pivot3.x) * sin + (bs.z - R.pivot3.z) * cos) * sc;
    const newPos = new THREE.Vector3(nx, bs.y, nz);
    appState.positions.set(bs.id, newPos);
    const obj = appState.nodeMeshes.get(bs.id);
    if (obj) {
      obj.mesh.position.copy(newPos);
      if (obj.label) obj.label.position.set(newPos.x, newPos.y + appState.NODE_RADIUS + 0.28, newPos.z);
    }
  }
  refreshFishboneTrunkPositions([..._fbMoveDrag.subtreeIds]);
  if (_fbMoveDrag.nodes.length) updateLinesForNodes(_fbMoveDrag.nodes.map(n => n.id));
}

// 支路滑动：分叉点沿干路骨架移动（鼠标命中点 → 干线 3D 骨架最近点，自然钳制在两端内），
// 弧长比例映射回干线 2D 折线 → 子树 2D 刚性平移（3D 骨架随分叉投影自动跟随），节点同步跟随
function _applyFbSlide() {
  const S = _fbMoveDrag.slide;
  const pSk = _grabSkeletonPts3D(S.parent);
  if (pSk.length < 2) return;
  // 干线 3D 骨架最近点
  let best = null;
  for (let i = 0; i < pSk.length - 1; i++) {
    const a = pSk[i], b = pSk[i + 1];
    const ab = new THREE.Vector3().subVectors(b, a);
    const len2 = ab.lengthSq();
    const tt = len2 > 1e-9 ? Math.max(0, Math.min(1, new THREE.Vector3().subVectors(dragPlaneHit, a).dot(ab) / len2)) : 0;
    const cp = a.clone().addScaledVector(ab, tt);
    const d = cp.distanceToSquared(dragPlaneHit);
    if (!best || d < best.d) best = { d, cp, i };
  }
  if (!best) return;
  // 3D 弧长 → 比例（2D/3D 段长成比例，比例一致）
  let s3 = 0, total3 = 0;
  for (let i = 0; i < pSk.length - 1; i++) {
    const L = pSk[i].distanceTo(pSk[i + 1]);
    if (i < best.i) s3 += L;
    total3 += L;
  }
  s3 += pSk[best.i].distanceTo(best.cp);
  const frac = total3 > 1e-9 ? Math.max(0, Math.min(1, s3 / total3)) : 0;
  // 比例 → 干线 2D 折线上的目标分叉点
  const p2 = S.parent.points || [];
  let total2 = 0;
  const segLens = [];
  for (let i = 0; i < p2.length - 1; i++) {
    const L = Math.hypot(p2[i + 1].x - p2[i].x, p2[i + 1].y - p2[i].y);
    segLens.push(L);
    total2 += L;
  }
  if (total2 <= 1e-9) return;
  let target2 = { ...p2[p2.length - 1] };
  {
    let target = frac * total2, acc = 0;
    for (let i = 0; i < segLens.length; i++) {
      if (acc + segLens[i] >= target && segLens[i] > 1e-9) {
        const tt = (target - acc) / segLens[i];
        target2 = { x: p2[i].x + (p2[i + 1].x - p2[i].x) * tt, y: p2[i].y + (p2[i + 1].y - p2[i].y) * tt };
        break;
      }
      acc += segLens[i];
    }
  }
  const dx2 = target2.x - S.fork2.x, dy2 = target2.y - S.fork2.y;
  const deltaFork3 = best.cp.clone().sub(S.fork3);
  // 子树 2D 刚性平移（快照重算，无累积误差）
  for (const snap of _fbMoveDrag.trunks) {
    snap.t.points = snap.pts.map(p => ({ x: p.x + dx2, y: p.y + dy2 }));
  }
  // 节点 2D 左上角与 3D 球心随分叉位移同步（保持末端连接）
  for (const ns of _fbMoveDrag.nodes) {
    appState.positions2D.set(ns.id, { x: ns.anchorX + dx2, y: ns.anchorY + dy2 - ns.h / 2 });
  }
  for (const bs of _fbMoveDrag.nodes3D) {
    const newPos = new THREE.Vector3(bs.x + deltaFork3.x, bs.y + deltaFork3.y, bs.z + deltaFork3.z);
    appState.positions.set(bs.id, newPos);
    const obj = appState.nodeMeshes.get(bs.id);
    if (obj) {
      obj.mesh.position.copy(newPos);
      if (obj.label) obj.label.position.set(newPos.x, newPos.y + appState.NODE_RADIUS + 0.28, newPos.z);
    }
  }
  refreshFishboneTrunkPositions([..._fbMoveDrag.subtreeIds]);
  if (_fbMoveDrag.nodes.length) updateLinesForNodes(_fbMoveDrag.nodes.map(n => n.id));
}

export function bindClickHandlers() {
  // 鱼骨线路拖动收尾：强制重建（刷新拾取列表）。不落盘、不退出移动模式——
  // 与节点拖拽一致，由控制栏「确定」落盘 /「取消」还原
  function _finishFbMove() {
    if (!_fbMoveDrag) return;
    const moved = _fbMoveDrag.moved;
    const nodeIds = _fbMoveDrag.nodes.map(n => n.id);
    _fbMoveDrag = null;
    if (appState.controls) appState.controls.enabled = true;
    if (moved) {
      rebuildFishbone3D(true);   // force：拾取列表 _rebuildFlatItems 必须按新位置重建
      if (nodeIds.length) updateLinesForNodes(nodeIds);
    }
  }

  // ========== 3D 鼠标/触摸事件 ==========
  const rendererDom = appState.renderer?.domElement;
  if (!rendererDom) return;

  // pointerdown（capture 阶段）：在 OrbitControls 之前拦截节点点击
  rendererDom.addEventListener('pointerdown', (e) => {
    if (appState.is2DView) return;
    if (e.button !== 0) return;
    if (e.target.closest('#editorPanel,#richEditorModal,input,textarea,[contenteditable="true"]')) return;

    // 移动模式（与节点同款）：按住鱼骨线路拖动平移其子树（capture 拦截，优先于节点拖拽）；
    // 拖拽目标动态取被点击的线路（不限进入模式的入口），未命中线路则落到下方节点拖拽
    if (isMoveMode) {
      mouse.x = (e.clientX / rendererDom.clientWidth) * 2 - 1;
      mouse.y = -(e.clientY / rendererDom.clientHeight) * 2 + 1;
      ray.setFromCamera(mouse, appState.camera);
      const fishMeshes = [];
      for (const fit of (appState.fishboneLineItems || [])) {
        if (fit.line && fit.line.mesh) fishMeshes.push(fit.line.mesh);
      }
      const fishHits = fishMeshes.length ? ray.intersectObjects(fishMeshes) : [];
      if (fishHits.length) {
        const hitTrunkId = fishHits[0].object.userData?.trunkId;
        const root = (appState.fishboneTrunks || []).find(t => t.id === hitTrunkId);
        const subtree = root ? collectFishboneSubtree2D(root) : [];
        const subtreeIds = new Set(subtree.map(t => t.id));
        // 阻止 OrbitControls / 节点拖拽处理此事件
        e.stopImmediatePropagation();
        // 拖动平面：图层排列模式 = 水平面（y 固定）；
        // 随机模式 = 过抓取点、面向相机（可向任意 3D 方向拖动，与节点拖拽一致）
        if (appState.layer3DLayout) {
          dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), fishHits[0].point);
        } else {
          const camDir = new THREE.Vector3();
          appState.camera.getWorldDirection(camDir);
          dragPlane.setFromNormalAndCoplanarPoint(camDir.negate(), fishHits[0].point);
        }
        ray.ray.intersectPlane(dragPlane, dragPlaneStartHit);
        dragPlaneHit.copy(dragPlaneStartHit);
        // ── 拖拽种类判定：抓在端点附近 → 旋转（改朝向）；支路线体 → 沿干路滑动；其余 → 整体平移 ──
        // 支路骨架起点钉在父线分叉点上（只能绕分叉点转）→ 抓支路远端才旋转，抓起点端退化为滑动
        let kind = 'translate', rot = null, slide = null;
        if (root) {
          const skPts = _grabSkeletonPts3D(root);
          if (skPts.length >= 2) {
            const dS = fishHits[0].point.distanceTo(skPts[0]);
            const dE = fishHits[0].point.distanceTo(skPts[skPts.length - 1]);
            const isBranch = root.parentId && !root.detached;
            const grabStart = dS <= dE;
            const randOff = (!appState.layer3DLayout && Array.isArray(root._3dOff)) ? root._3dOff : [0, 0, 0];
            if (Math.min(dS, dE) <= 0.18 && !(isBranch && grabStart)) {
              // 端点抓取：抓取端跟随鼠标（旋转+拉伸），另一端为支点，整棵子树刚性变形
              kind = 'rotate';
              if (!appState.layer3DLayout) {
                for (const t of subtree) computeFishboneSkeleton3D(t);   // 惰性补齐 dirs3D，防旋转中随机跳变
              }
              let pivot3, grab3;
              if (isBranch) {
                // 支路：绕分叉点旋转（随机模式骨架起点含 _3dOff，需扣除得真实分叉点）
                pivot3 = appState.layer3DLayout
                  ? skPts[0].clone()
                  : skPts[0].clone().sub(new THREE.Vector3(randOff[0], randOff[1], randOff[2]));
                grab3 = skPts[skPts.length - 1].clone();
              } else if (grabStart) {
                pivot3 = skPts[skPts.length - 1].clone();
                grab3 = skPts[0].clone();
              } else {
                pivot3 = skPts[0].clone();
                grab3 = skPts[skPts.length - 1].clone();
              }
              // 2D 缩放支点（拉伸时子树 2D 点绕其等比缩放；图层模式与 pivot2 一致；
              // 随机模式：抓起点端 → 远端 2D 点固定，抓远端/支路 → 起点 2D 点固定）
              const rPts = root.points || [];
              const p2 = appState.layer3DLayout
                ? { x: pivot3.x / FISHBONE_3D_SCALE, y: pivot3.z / FISHBONE_3D_SCALE }
                : (grabStart ? { x: rPts[rPts.length - 1].x, y: rPts[rPts.length - 1].y }
                             : { x: rPts[0].x, y: rPts[0].y });
              rot = {
                pivot3,
                v0: grab3.clone().sub(pivot3),
                p2,
                pivot2: { x: pivot3.x / FISHBONE_3D_SCALE, y: pivot3.z / FISHBONE_3D_SCALE },
                grab2: { x: grab3.x / FISHBONE_3D_SCALE, y: grab3.z / FISHBONE_3D_SCALE },
                trunks: subtree.map(t => ({
                  t,
                  dirs: Array.isArray(t.dirs3D) ? t.dirs3D.map(d => d.slice()) : null,
                  off: Array.isArray(t._3dOff) ? t._3dOff.slice() : null,
                  pos: Array.isArray(t._3dPos) ? t._3dPos.slice() : null,
                  pts: (t.points || []).map(p => ({ x: p.x, y: p.y }))
                }))
              };
            } else if (isBranch) {
              // 支路线体抓取：分叉点贴干路骨架滑动（形状/朝向不变）
              const parent = (appState.fishboneTrunks || []).find(t => t.id === root.parentId);
              const p0 = (root.points || [])[0];
              if (parent && p0) {
                const proj = projectOnTrunk2D(parent.id, p0.x, p0.y);
                if (proj) {
                  kind = 'slide';
                  slide = {
                    parent,
                    fork2: { x: proj.x, y: proj.y },
                    fork3: skPts[0].clone().sub(new THREE.Vector3(randOff[0], randOff[1], randOff[2]))
                  };
                }
              }
            }
          }
        }
        // 随机模式平移锚点（仅整体平移使用；旋转/滑动不写锚点）
        let anchor = null;
        if (!appState.layer3DLayout && root && kind === 'translate') {
          if (!Array.isArray(root._3dPos)) {
            const sk = computeFishboneSkeleton3D(root);
            root._3dPos = sk.length ? sk[0].toArray() : [0, 0, 0];
          }
          anchor = { t: root, field: '_3dPos', start3: root._3dPos.slice() };
        }
        _fbMoveDrag = {
          kind, rot, slide,
          subtreeIds,
          startHit: dragPlaneStartHit.clone(),
          moved: false,
          anchor,
          trunks: subtree.map(t => ({ t, pts: (t.points || []).map(p => ({ x: p.x, y: p.y })) })),
          nodes: [], nodes3D: []
        };
        // 末端节点及其树后代：2D positions2D / 3D positions 同步平移
        const allNodeIds = new Set();
        for (const t of subtree) {
          if (!t.endNodeId) continue;
          allNodeIds.add(t.endNodeId);
          for (const did of collectDescendantIds(t.endNodeId)) allNodeIds.add(did);
        }
        for (const nid of allNodeIds) {
          const p2 = appState.positions2D.get(nid);
          const p3 = appState.positions.get(nid);
          if (!p2 || !p3) continue;
          const node = appState.nodeMap.get(nid);
          const { height } = getNodeLayoutSize(node, (node && node.sizeScale) || 1);
          _fbMoveDrag.nodes.push({ id: nid, anchorX: p2.x, anchorY: p2.y + height / 2, h: height });
          _fbMoveDrag.nodes3D.push({ id: nid, x: p3.x, y: p3.y, z: p3.z });
        }
        if (appState.controls) appState.controls.enabled = false;
        return;
      }
      // 未命中线路 → 继续走节点拖拽
    }

    if (!isMoveMode && !appState.layer3DLayout) return;

    mouse.x = (e.clientX / rendererDom.clientWidth) * 2 - 1;
    mouse.y = -(e.clientY / rendererDom.clientHeight) * 2 + 1;
    ray.setFromCamera(mouse, appState.camera);
    const spheres = getRaycastTargets();
    const hits = ray.intersectObjects(spheres, true);
    if (hits.length) {
      const id = getHitNodeId(hits);
      if (id) {
        // 阻止 OrbitControls 处理此事件，避免与节点拖拽冲突
        e.stopImmediatePropagation();
        // 动态设置拖拽目标为被点击的节点（不限于最初进入移动模式的节点）
        setMoveTargetId(id);
        setDrag3DNode(true);
        setDrag3DWasMoved(false);
        drag3DStart.set(e.clientX, e.clientY);
        const pos = appState.positions.get(id);
        if (pos) {
          drag3DStartPos.copy(pos);
          if (appState.layer3DLayout) {
            // 2D排列模式：使用水平平面（Y = 节点所在图层高度）
            const layerY = pos.y;
            dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, layerY, 0));
          } else {
            const camDir = new THREE.Vector3();
            appState.camera.getWorldDirection(camDir);
            dragPlane.setFromNormalAndCoplanarPoint(camDir, drag3DStartPos);
          }
          ray.ray.intersectPlane(dragPlane, dragPlaneStartHit);
          dragPlaneHit.copy(dragPlaneStartHit);
          dragStartPositions.clear();
          const movedIds = collectDescendants(id);
          for (const mid of movedIds) {
            const mpos = appState.positions.get(mid);
            if (mpos) dragStartPositions.set(mid, mpos.clone());
          }
        }
      }
    }
  }, true); // capture phase

  // mousedown: 非移动模式的长按旋转
  rendererDom.addEventListener('mousedown', (e) => {
    if (appState.is2DView) return;
    if (e.button !== 0) return;
    if (e.target.closest('#editorPanel,#richEditorModal,input,textarea,[contenteditable="true"]')) return;

    // 移动模式下节点拖拽已在 pointerdown capture 中处理
    // 空白点击交由 OrbitControls 处理
    if (isMoveMode) return;

    // 非移动模式：检测是否点击节点（用于双击打开编辑器区分）
    mouse.x = (e.clientX / rendererDom.clientWidth) * 2 - 1;
    mouse.y = -(e.clientY / rendererDom.clientHeight) * 2 + 1;
    ray.setFromCamera(mouse, appState.camera);
    const spheres = getRaycastTargets();
    const hits = ray.intersectObjects(spheres, true);
    if (!hits.length) {
      // 点击空白：启动长按旋转
      setLongPressStartPos(e.clientX, e.clientY);
      setLongPressTimer(setTimeout(() => {
        setIsLongPressRotating(true);
        appState.controls.enabled = false;
        longPressRotateStart.set(e.clientX, e.clientY);
        longPressRotateCamStart.copy(appState.camera.position);
        longPressRotateTargetStart.copy(appState.controls.target);
      }, LONG_PRESS_DURATION));
    }
  });

  // mousemove: 拖拽节点移动 / 旋转视图
  rendererDom.addEventListener('mousemove', (e) => {
    if (appState.is2DView) return;
    if (_fbMoveDrag) {
      // 鱼骨「移动线路」拖动
      mouse.x = (e.clientX / rendererDom.clientWidth) * 2 - 1;
      mouse.y = -(e.clientY / rendererDom.clientHeight) * 2 + 1;
      ray.setFromCamera(mouse, appState.camera);
      if (ray.ray.intersectPlane(dragPlane, dragPlaneHit)) {
        _fbMoveDrag.moved = true;
        // 按拖拽种类分发：端点抓取旋转（改朝向）/ 支路沿干路滑动 / 整体平移
        if (_fbMoveDrag.kind === 'rotate') { _applyFbRotate(); return; }
        if (_fbMoveDrag.kind === 'slide') { _applyFbSlide(); return; }
        const delta3 = new THREE.Vector3().subVectors(dragPlaneHit, _fbMoveDrag.startHit);
        if (!appState.layer3DLayout && _fbMoveDrag.anchor) {
          // 随机模式：3D 骨架整体自由平移（含 y），2D 数据不动（与 2D 无映射）
          const a = _fbMoveDrag.anchor;
          a.t[a.field] = [a.start3[0] + delta3.x, a.start3[1] + delta3.y, a.start3[2] + delta3.z];
          // 末端节点 3D 球心随拖动平面自由移动（与普通节点拖拽一致）
          for (const bs of _fbMoveDrag.nodes3D) {
            const newPos = new THREE.Vector3(bs.x + delta3.x, bs.y + delta3.y, bs.z + delta3.z);
            appState.positions.set(bs.id, newPos);
            const obj = appState.nodeMeshes.get(bs.id);
            if (obj) {
              obj.mesh.position.copy(newPos);
              if (obj.label) obj.label.position.set(newPos.x, newPos.y + appState.NODE_RADIUS + 0.28, newPos.z);
            }
          }
          refreshFishboneTrunkPositions([..._fbMoveDrag.subtreeIds]);
          return;
        }
        const dx2 = delta3.x / FISHBONE_3D_SCALE;
        const dy2 = delta3.z / FISHBONE_3D_SCALE;
        // 干线 points：从按下时快照重算，避免累积误差
        for (const snap of _fbMoveDrag.trunks) {
          snap.t.points = snap.pts.map(p => ({ x: p.x + dx2, y: p.y + dy2 }));
        }
        // 节点 2D 左上角（anchor = 左边缘中点反推）与 3D 球心同步
        for (const ns of _fbMoveDrag.nodes) {
          appState.positions2D.set(ns.id, { x: ns.anchorX + dx2, y: ns.anchorY + dy2 - ns.h / 2 });
        }
        for (const bs of _fbMoveDrag.nodes3D) {
          const newPos = new THREE.Vector3(bs.x + delta3.x, bs.y, bs.z + delta3.z);
          appState.positions.set(bs.id, newPos);
          const obj = appState.nodeMeshes.get(bs.id);
          if (obj) {
            obj.mesh.position.copy(newPos);
            if (obj.label) obj.label.position.set(newPos.x, newPos.y + appState.NODE_RADIUS + 0.28, newPos.z);
          }
        }
        // 干线增量刷新 + 节点树连线刷新
        refreshFishboneTrunkPositions([..._fbMoveDrag.subtreeIds]);
        if (_fbMoveDrag.nodes.length) updateLinesForNodes(_fbMoveDrag.nodes.map(n => n.id));
      }
      return;
    }
    if (drag3DNode && moveTargetId) {
      // 射线-平面交点计算精确拖拽位移（光标完全跟随）
      mouse.x = (e.clientX / rendererDom.clientWidth) * 2 - 1;
      mouse.y = -(e.clientY / rendererDom.clientHeight) * 2 + 1;
      ray.setFromCamera(mouse, appState.camera);
      if (ray.ray.intersectPlane(dragPlane, dragPlaneHit)) {
        setDrag3DWasMoved(true);
        // 偏移量基于本次拖动开始时的鼠标交点，消除初始跳变
        const offset = new THREE.Vector3().subVectors(dragPlaneHit, dragPlaneStartHit);
        for (const [id, basePos] of dragStartPositions) {
          const newPos = basePos.clone().add(offset);
          appState.positions.set(id, newPos);
          const obj = appState.nodeMeshes.get(id);
          if (obj) {
            obj.mesh.position.copy(newPos);
            if (obj.label) obj.label.position.set(newPos.x, newPos.y + appState.NODE_RADIUS + 0.28, newPos.z);
          }
        }
        updateLinesForNodes([...dragStartPositions.keys()]);
      }
    } else if (isRotatingView3D || isLongPressRotating) {
      const startMouse = isLongPressRotating ? longPressRotateStart : rotateStartMouse;
      const startCamPos = isLongPressRotating ? longPressRotateCamStart : rotateStartCamPos;
      const startTarget = isLongPressRotating ? longPressRotateTargetStart : rotateStartTarget;
      const dx = e.clientX - startMouse.x, dy = e.clientY - startMouse.y;
      const deltaTarget = new THREE.Vector3().subVectors(startCamPos, startTarget);
      const radius = deltaTarget.length();
      const phi = Math.acos(deltaTarget.y / radius) || 0;
      const theta = Math.atan2(deltaTarget.x, deltaTarget.z);
      const rotateSpeed = 0.005;
      const newTheta = theta - dx * rotateSpeed;
      const newPhi = Math.max(0.1, Math.min(Math.PI - 0.1, phi - dy * rotateSpeed));
      const newDir = new THREE.Vector3().setFromSpherical(new THREE.Spherical(radius, newPhi, newTheta));
      const newCamPos = startTarget.clone().add(newDir);
      appState.camera.position.copy(newCamPos);
      appState.controls.target.copy(startTarget);
      appState.controls.update();
    }
  });

  // mouseup
  window.addEventListener('mouseup', () => {
    if (appState.is2DView) return;
    // 鱼骨「移动线路」松手收尾（优先于节点拖拽，两者互斥）
    if (_fbMoveDrag) { _finishFbMove(); return; }
    if (drag3DNode) {
      if (isMoveMode && moveTargetId && drag3DWasMoved) {
        resolveOverlapAfterMove(moveTargetId);
      }
      dragStartPositions.clear();
      setDrag3DNode(false);
      setDrag3DWasMoved(false);
      // NOTE: 不 touch controls.enabled —— 节点拖拽未禁用 controls
    }
    setIsRotatingView3D(false);
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
    setIsLongPressRotating(false);
    if (appState.controls && !drag3DNode) appState.controls.enabled = true;
  });

  window.addEventListener('blur', () => {
    if (appState.is2DView) return;
    // 拖动中失焦：数据已写入，按收尾处理防状态悬挂
    if (_fbMoveDrag) _finishFbMove();
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
    setIsLongPressRotating(false);
    // blur 时恢复 controls，避免移动模式下拖拽中失焦导致 controls 永久禁用
    if (appState.controls && !drag3DNode) appState.controls.enabled = true;
    // 清理拖拽状态
    if (drag3DNode) {
      dragStartPositions.clear();
      setDrag3DNode(false);
      setDrag3DWasMoved(false);
    }
  });

  // ---- 非移动模式右键菜单 ----
  rendererDom.addEventListener('contextmenu', e => {
    if (appState.is2DView) return;
    e.preventDefault();
    // 鱼骨线段右键菜单（2D 在 2DView/interaction/context-menu.js 分发；此处 3D 同款能力）
    // 任意模式可用（与单击选中一致），命中优先于节点/空白菜单
    mouse.x = (e.clientX / rendererDom.clientWidth) * 2 - 1;
    mouse.y = -(e.clientY / rendererDom.clientHeight) * 2 + 1;
    ray.setFromCamera(mouse, appState.camera);
    const fishMeshes = [];
    for (const fit of (appState.fishboneLineItems || [])) {
      if (fit.line && fit.line.mesh) fishMeshes.push(fit.line.mesh);
    }
    if (fishMeshes.length) {
      const fishHits = ray.intersectObjects(fishMeshes);
      if (fishHits.length > 0) {
        const fud = fishHits[0].object.userData;
        if (fud && fud.edgeType === 'fishbone') {
          hideLineTooltip();
          showFishboneContextMenu(e.clientX, e.clientY, fud);
          return;
        }
      }
    }
    if (isMoveMode) return;
    if (appState.connectionMode) {
      cancelConnectionMode();
      return;
    }
    if (appState.convertChildMode) {
      cancelConvertChildMode();
      return;
    }
    const spheres = getRaycastTargets();
    const hits = ray.intersectObjects(spheres, true);
    if (hits.length) {
      const id = getHitNodeId(hits);
      if (!id) return;
      if (!appState.selectedNodeIds.has(id)) setSelectedNode(id, false);
      hideBlankContextMenu();
      if (appState.selectedNodeIds.size > 1) {
        appState.contextTargetId = 'multi';
        const ctxMenu = document.getElementById('nodeContextMenu');
        document.getElementById('contextNodeName').textContent = `${appState.selectedNodeIds.size} 个节点`;
        document.getElementById('contextNodeName').style.display = 'inline';
        document.getElementById('contextRenameInput').style.display = 'none';
        document.getElementById('nodeSizeSlider').value = 1;
        document.getElementById('nodeSizeValue').textContent = '1.0';
        document.getElementById('ringSpeedSlider').value = 1;
        document.getElementById('ringSpeedValue').textContent = '1.0';
        document.getElementById('nodeFixedColorPicker').value = '#ffffff';
        document.getElementById('addChildNodeBtn').style.display = 'none';
        document.getElementById('addNextNodeBtn').style.display = 'none';
        document.getElementById('toggleChildrenContextBtn').style.display = 'none';
        document.getElementById('locateOtherViewBtn').style.display = 'none';
        document.getElementById('addConnectionContextBtn').style.display = 'none';
        document.getElementById('removeConnectionContextBtn').style.display = 'none';
        document.getElementById('alignSection').style.display = 'none';
        document.getElementById('alignRowHorizontal').style.display = 'none';
        document.getElementById('alignRowVertical').style.display = 'none';
        document.getElementById('groupRow').style.display = 'none';
        document.getElementById('splitScreenRow').style.display = 'none';
        document.getElementById('copyNodeBtn').style.display = 'none';
        document.getElementById('moveNodeBtn').style.display = 'block';
        document.getElementById('deleteNodeContextBtn').style.display = 'block';
        ctxMenu.style.display = 'flex';
        ctxMenu.style.zIndex = '9999';
        ctxMenu.style.visibility = 'hidden';
        ctxMenu.style.left = '0px';
        ctxMenu.style.top = '0px';
        const menuWidth = ctxMenu.offsetWidth;
        const menuHeight = ctxMenu.offsetHeight;
        const winW = window.innerWidth;
        const winH = window.innerHeight;
        const TASKBAR = 44;
        let left = e.clientX + 4;
        let top = e.clientY + 4;
        if (left + menuWidth > winW) left = Math.max(0, winW - menuWidth - 4);
        if (top + menuHeight > winH - TASKBAR) top = Math.max(0, winH - TASKBAR - menuHeight - 4);
        ctxMenu.style.left = left + 'px';
        ctxMenu.style.top = top + 'px';
        ctxMenu.style.visibility = 'visible';
      } else {
        showContextMenu(e.clientX, e.clientY, id);
      }
    } else {
      clearSelected();
      hideContextMenu();
      setLastBlankMenuMouse(e.clientX, e.clientY);
      appState._lastRightClickPos = { x: e.clientX, y: e.clientY };
      showBlankContextMenu(e.clientX, e.clientY);
    }
  });

  // ---- 单击：节点选中 / 连线提示 ----
  rendererDom.addEventListener('click', e => {
    if (appState.is2DView) return;
    if (e.target.closest('#editorPanel,#richEditorModal,input,textarea,[contenteditable="true"]')) return;
    e.stopPropagation();

    mouse.x = (e.clientX / rendererDom.clientWidth) * 2 - 1;
    mouse.y = -(e.clientY / rendererDom.clientHeight) * 2 + 1;
    ray.setFromCamera(mouse, appState.camera);

    if (appState.connectionMode) {
      let spheres = getRaycastTargets();
      let hits = ray.intersectObjects(spheres, true);
      if (hits.length) {
        let targetId = getHitNodeId(hits);
        if (!targetId) return;
        if (targetId === appState.connectionSourceId) {
          showToast('不能自连');
          return;
        }
        if (appState.connectionMode === 'add') {
          completeAddConnection(targetId);
        } else if (appState.connectionMode === 'remove') {
          completeRemoveConnection(targetId);
        }
        return;
      }
      return;
    }

    // “变成子节点”选择目标模式
    if (appState.convertChildMode) {
      let spheres = getRaycastTargets();
      let hits = ray.intersectObjects(spheres, true);
      if (hits.length) {
        let targetId = getHitNodeId(hits);
        if (targetId) completeConvertChildMode(targetId);
      }
      return;
    }

    const lineMeshes = appState.lineItems.map(it => it.line.mesh);
    // 鱼骨段连线参与同一轮射线检测（命中后由 userData.edgeType 区分）
    for (const fit of (appState.fishboneLineItems || [])) {
      if (fit.line && fit.line.mesh) lineMeshes.push(fit.line.mesh);
    }
    const lineHits = ray.intersectObjects(lineMeshes);
    if (lineHits.length > 0 && lineHits[0].object.userData?.edgeType === 'fishbone') {
      // 单击只选中：高亮该段（标签/颜色等编辑功能在右键菜单）
      const fud = lineHits[0].object.userData;
      clearFishboneSegHighlight();
      highlightFishboneSeg(fud.trunkId, fud.segId);
      return;
    }
    // 未命中鱼骨线（空白/节点/普通连线）：取消鱼骨段选中状态
    clearFishboneSegHighlight();
    if (lineHits.length > 0) {
      const ud = lineHits[0].object.userData;
      if (ud && ud.startId && ud.endId) {
        showLineTooltip(e.clientX, e.clientY, ud);
        return;
      }
    }

    const lineTooltipEl = document.getElementById('lineTooltip');
    if (lineTooltipEl && lineTooltipEl.style.display === 'block') {
      hideLineTooltip();
    }

    let spheres = getRaycastTargets();
    let hits = ray.intersectObjects(spheres, true);
    if (hits.length) {
      const id = getHitNodeId(hits);
      if (id) {
        // 检测是否点击了标签 Sprite（慢双击重命名）
        const hitLabel = hits.find(h => h.object.userData && h.object.userData._labelNodeId);
        if (hitLabel) {
          const node = appState.nodeMap.get(id);
          if (node) handleLabelClick(null, node);
        }
        setSelectedNode(id, e.ctrlKey);
      }
      else if (!e.ctrlKey) clearSelected();
    } else if (!e.ctrlKey) clearSelected();
  });

  // ---- 双击节点打开编辑器 ----
  rendererDom.addEventListener('dblclick', e => {
    if (appState.is2DView) return;
    if (e.target.closest('#editorPanel,#richEditorModal')) return;
    mouse.x = (e.clientX / rendererDom.clientWidth) * 2 - 1;
    mouse.y = -(e.clientY / rendererDom.clientHeight) * 2 + 1;
    ray.setFromCamera(mouse, appState.camera);
    let spheres = getRaycastTargets();
    let hits = ray.intersectObjects(spheres, true);
    if (hits.length) {
      const id = getHitNodeId(hits);
      if (id) {
        const node = appState.nodeMap.get(id);
        // 网页节点双击 → 打开内置浏览器加载页面
        if (node && node.displayMode === 'webpage') {
          if (window.AppRunner) {
            let url = node.webUrl || '';
            // URL智能识别：不含协议前缀时补 https://
            if (url && !/^https?:\/\//i.test(url) && !url.startsWith('file://') && !url.startsWith('data:')) {
              url = (url.includes('.') && !url.includes(' ')) ? 'https://' + url : 'https://www.bing.com/search?q=' + encodeURIComponent(url);
            }
            window.AppRunner.open({ id: 'webpage-' + id, name: node.name || '网页', type: 'browser', defaultUrl: url || undefined });
          }
          return;
        }
        openRichEditor(id);
      }
    }
  });

  // ---- 隐藏连线提示框 ----
  document.addEventListener('click', (e) => {
    if (appState.is2DView) return;
    const lt = document.getElementById('lineTooltip');
    if (lt && lt.style.display === 'block') {
      if (lt.contains(e.target)) return;
      const isExempt = e.target.closest('#editorPanel,#projectPanel,#richEditorModal,#quickEditorModal,input,textarea,[contenteditable="true"],.rich-modal-content,.quick-editor-content');
      if (!isExempt) {
        hideLineTooltip();
      }
    }
  });
}
