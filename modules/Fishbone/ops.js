// ============================================================
//  Fishbone / ops.js — 鱼骨线段的编辑操作（改名 / 改色 / 删除）
//  供 LineTooltip 的鱼骨分支调用；删除走 withHistory 撤销体系
// ============================================================
import * as THREE from 'three';
import { appState } from '../module0_AppState.js';
import { withHistory } from '../module3_History.js';
import { saveCurrentProjectData } from '../TreeData/index.js';
import { showConfirm } from '../module4_Confirm.js';
import { showToast } from '../SelectAndEdit/index.js';
import { BASE_NODE_HEIGHT, getNodeWidth, canvas, transform } from '../2DView/shared.js';
import { createNodeMesh, destroyNodeMesh, removeLinesForNodes, updateLinesVis } from '../VisualComponents/index.js';
import { canvasToWorld } from '../2DView/interaction/coordinate-utils.js';
import { draw, mark2DDirty } from '../2DView/render/index.js';
import {
  rebuildFishbone3D, findFishboneSegLine, refreshFishboneSeg, clearFishboneSegHighlight,
  trunkPointTo3D, FISHBONE_3D_SCALE, setFishboneTrunkOpacity, fishboneLayerY,
  computeFishboneSkeleton3D
} from './render3d.js';
import { collectFishboneSubtree2D, projectOnTrunk2D } from './render2d.js';
import { collectDescendantIds } from '../2DView/Layout.js';
import { FISHBONE_NODE_SCALE, selectedSeg, fishboneAttachMode, setFishboneAttachMode, fishboneMoveMode, setFishboneMoveMode } from './state.js';
import {
  getFishboneHiddenNodeIds, getFishboneHiddenTrunkIds, refreshFishboneHiddenCache,
  startFishboneAnim, collectNodeWithDescendants, isFishboneNodeHidden
} from './visibility.js';
import { labelAnimScale } from '../VisualComponents/nodes/mesh.js';

// 通过 userData（trunkId + segId）定位主干与段索引
function _locateSeg(userData) {
  const trunk = (appState.fishboneTrunks || []).find(t => t.id === userData.trunkId);
  if (!trunk || !Array.isArray(trunk.segs)) return null;
  const segIndex = trunk.segs.findIndex(s => s.id === userData.segId);
  if (segIndex < 0) return null;
  return { trunk, seg: trunk.segs[segIndex], segIndex };
}

// 改名：写入 seg 元数据并持久化（连线 userData / 3D 标签由 LineTooltip 维护）
export function saveFishboneSegLabel(userData, finalLabel) {
  const hit = _locateSeg(userData);
  if (!hit) return;
  hit.seg.label = finalLabel;
  hit.seg.labelHidden = false;
  saveCurrentProjectData();
}

// 改色：hexColor 为空 = 恢复默认
// （PolylineFlowLine.setCustomColor(null) 是 no-op，reset 需重建该段连线）
export function setFishboneSegColor(userData, hexColor) {
  const hit = _locateSeg(userData);
  if (!hit) return;
  hit.seg.customColor = hexColor || null;
  const line = findFishboneSegLine(userData.trunkId, userData.segId);
  if (hexColor) {
    if (line) {
      line.mesh.userData.customColor = hexColor;
      line.setCustomColor(new THREE.Color(hexColor));
    }
  } else {
    if (line) line.mesh.userData.customColor = null;
    refreshFishboneSeg(hit.trunk.id, hit.segIndex);   // 重建该段恢复默认彩虹色
  }
  saveCurrentProjectData();
}

// 批量改色（框选多选）：keys 为 'trunkId|segId' 集合（2DView/shared boxSelectSegKeys）；
// hexColor 为空 = 恢复默认。与 setFishboneSegColor 同语义，循环外统一持久化一次
export function setFishboneSegColorBatch(keys, hexColor) {
  if (!keys || !keys.size) return;
  for (const trunk of (appState.fishboneTrunks || [])) {
    const segs = Array.isArray(trunk.segs) ? trunk.segs : [];
    for (let i = 0; i < segs.length; i++) {
      const sg = segs[i];
      if (!sg || !keys.has(trunk.id + '|' + sg.id)) continue;
      sg.customColor = hexColor || null;
      const line = findFishboneSegLine(trunk.id, sg.id);
      if (hexColor) {
        if (line) {
          line.mesh.userData.customColor = hexColor;
          line.setCustomColor(new THREE.Color(hexColor));
        }
      } else {
        if (line) line.mesh.userData.customColor = null;
        refreshFishboneSeg(trunk.id, i);   // 重建该段恢复默认彩虹色
      }
    }
  }
  saveCurrentProjectData();
  mark2DDirty();
  draw();
}

// 删除一段（撤销体系）：
//  仅一段 → 删除整条主干；首段 → 头删；末段 → 尾删；中段 → 主干分裂为两条
export const deleteFishboneSegmentWithHistory = withHistory(function (userData) {
  const hit = _locateSeg(userData);
  if (!hit) return;
  clearFishboneSegHighlight();
  const { trunk, segIndex } = hit;
  const trunks = appState.fishboneTrunks;
  const pts = trunk.points;
  const segs = trunk.segs;

  if (segs.length <= 1) {
    // 仅一段：整条主干移除；其直接子支提升为主干路（parentId 悬空会导致永久失联）
    // 随机模式：先按原父子关系冻结各提升子支的当前 3D 起点（移除后父查找失效会随机飞散）
    if (!appState.layer3DLayout) {
      for (const t of trunks) {
        if (t.parentId === trunk.id) {
          const sk = computeFishboneSkeleton3D(t);
          if (sk.length) t._3dPos = sk[0].toArray();
        }
      }
    }
    const i = trunks.indexOf(trunk);
    if (i >= 0) trunks.splice(i, 1);
    for (const t of trunks) {
      if (t.parentId === trunk.id) {
        delete t.parentId;
        t.detached = true;   // 迁移豁免：防 ensureFishboneParentIds 按起点贴合重新标回
      }
    }
  } else if (segIndex === 0) {
    pts.shift();
    segs.shift();
  } else if (segIndex === segs.length - 1) {
    pts.pop();
    segs.pop();
  } else {
    // 中段：前半保留在原主干，后半生成新主干（seg 拆分后两侧数量均满足 segs = points - 1）
    const tail = {
      id: 'trunk_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      points: pts.slice(segIndex + 1),
      segs: segs.slice(segIndex + 1),
      layerId: trunk.layerId || appState.currentLayerId   // 分裂出的尾段继承源干线图层
    };
    // 随机模式：尾段沿用源线段随机朝向，锚点冻结在前半段 3D 末端（避免分裂后飞散）
    if (Array.isArray(trunk.dirs3D)) {
      tail.dirs3D = trunk.dirs3D.slice(segIndex + 1);
      trunk.dirs3D = trunk.dirs3D.slice(0, segIndex);
    }
    trunk.points = pts.slice(0, segIndex + 1);
    trunk.segs = segs.slice(0, segIndex);
    if (!appState.layer3DLayout) {
      const frontPts = computeFishboneSkeleton3D(trunk);
      if (frontPts.length) tail._3dPos = frontPts[frontPts.length - 1].toArray();
    }
    trunks.push(tail);
  }
  rebuildFishbone3D();
  saveCurrentProjectData();
});

// ── 分支绘制（连线标签"添加分支"按钮 → 线上选起点 → 空白处终点）──

function _newIds(prefix) {
  return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
}

function _emptySegMeta() {
  return { id: _newIds('seg'), label: '', labelHidden: true, customColor: null };
}

// 分支 trunk 数据追加（纯数据操作，不触发重建/保存）：
//  分支作为独立主干存储：{ id, points: [起点, 终点], segs: [1 段] }
//  起点直接用线上吸附点（hit.point），原线段顶点不变 —— 直线为一个整体，不因分叉而分段
//  endNodeId：可选，终点连着该节点的"左边缘中点"（新建节点时传入，节点拖动后端点跟随）
//  seed3D：可选（随机模式 3D 拖拽创建）——提交骨架种子 { off, dirs }，
//          必须在首次 rebuild 惰性生成随机朝向之前写入，使 3D 骨架 = 拖拽轨迹
function _appendBranchTrunk(hit, endPoint, endNodeId = null, seed3D = null) {
  const trunk = (appState.fishboneTrunks || []).find(t => t.id === hit.trunkId);
  if (!trunk || !Array.isArray(trunk.segs)) return false;
  if (hit.segIndex < 0 || hit.segIndex >= trunk.segs.length) return false;

  const branch = {
    id: _newIds('trunk'),
    points: [{ x: hit.point.x, y: hit.point.y }, { x: endPoint.x, y: endPoint.y }],
    segs: [_emptySegMeta()],
    parentId: trunk.id,   // 父子关系持久化：起点贴合几何判定在分支滑到干线端点（重合）后失效
    layerId: trunk.layerId || appState.currentLayerId   // 分支继承父干线图层
  };
  if (endNodeId) branch.endNodeId = endNodeId;
  if (seed3D) {
    if (seed3D.off) branch._3dOff = seed3D.off.slice();
    if (seed3D.dirs) branch.dirs3D = seed3D.dirs.map(d => d.slice());
  }
  appState.fishboneTrunks.push(branch);
  return branch;   // 返回分支对象（随机模式创建节点时需要算 3D 骨架末端）
}

// 提交一条分支（撤销体系）：hit = 线上吸附起点，endPoint = 空白处终点
export const addFishboneBranchWithHistory = withHistory(function (hit, endPoint, seed3D) {
  if (!hit || !endPoint) return;
  if (!_appendBranchTrunk(hit, endPoint, null, seed3D)) return;
  rebuildFishbone3D();
  saveCurrentProjectData();
});

// 提交"分支线 + 新节点"（撤销体系，单条历史：一次撤销同时撤销节点与分支线）：
//  hit = 线上吸附起点；endPoint = 空白处松手点 = 新节点左边缘中点
//  节点为根级节点（鱼骨线无父子语义，挂载到 methodsTree），3D 位置按鱼骨平面映射
export const addFishboneNodeWithHistory = withHistory(function (hit, endPoint, seed3D) {
  if (!hit || !endPoint) return;
  // 校验线上起点所属段仍存在（撤销/切换后可能失效）
  const srcTrunk = (appState.fishboneTrunks || []).find(t => t.id === hit.trunkId);
  if (!srcTrunk || !Array.isArray(srcTrunk.segs) ||
      hit.segIndex < 0 || hit.segIndex >= srcTrunk.segs.length) return;

  // 1) 新建根级节点：松手点 = 左边缘中点 → 左上角 = (endPoint.x, endPoint.y - h/2)
  const scale = FISHBONE_NODE_SCALE;
  const nodeH = BASE_NODE_HEIGHT * scale;
  let newId = 'N' + Date.now() + Math.floor(Math.random() * 10000);
  while (appState.nodeMap.has(newId)) newId = 'N' + Date.now() + Math.floor(Math.random() * 10000);
  const newNode = {
    id: newId, name: '新节点', desc: '鱼骨分支节点', children: [],
    sizeScale: scale, ringSpeedFactor: 1.0, fixedColor: null
  };
  if (!appState.methodsTree.children) appState.methodsTree.children = [];
  appState.methodsTree.children.push(newNode);
  appState.nodeMap.set(newId, newNode);
  appState.addNodeToCurrentLayer(newId);
  const topLeft = { x: endPoint.x, y: endPoint.y - nodeH / 2 };
  const center = { x: endPoint.x + getNodeWidth(newNode, scale) / 2, y: endPoint.y };
  appState.positions2D.set(newId, topLeft);

  // 2) 先建分支线（随机模式需按骨架末端决定节点 3D 位置）：
  //    线上吸附点 → 节点左边缘中点（endNodeId 标记连接，节点拖动后端点跟随）
  const branch = _appendBranchTrunk(hit, endPoint, newId, seed3D);

  let pos3D;
  if (!appState.layer3DLayout) {
    // 随机模式：节点 3D 位置 = 分支随机骨架末端（与 2D 无映射；渲染时末端由 endNodeId 接节点球心）
    const sk = branch ? computeFishboneSkeleton3D(branch) : null;
    pos3D = (sk && sk.length >= 2) ? sk[sk.length - 1].clone()
      : new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 6);
  } else {
    // 图层模式：落在源干线所属图层平面（跨图层点击时与分支线同层）
    pos3D = trunkPointTo3D(center, fishboneLayerY(srcTrunk.layerId || appState.currentLayerId));
  }
  appState.positions.set(newId, pos3D);
  createNodeMesh(newNode, pos3D);
  // 派发节点创建事件（供 nodeDiskSync 监听器实时创建磁盘文件夹）
  window.dispatchEvent(new CustomEvent('astroknot-node-created', {
    detail: { nodeId: newId, node: newNode }
  }));

  rebuildFishbone3D();
  saveCurrentProjectData();
  if (appState.refreshTreePanel) appState.refreshTreePanel();
  if (appState.is2DView && appState.refresh2DView) appState.refresh2DView();
});

// ============================================================
//  鱼骨图操作（连线标签按钮区）：
//  折叠展开支路 / 变成主干路 / 变成支路 / 定位 2-3D / 复制 / 删除整图
// ============================================================

// ── 工具：按 id 找干线 ──
function _findTrunk(trunkId) {
  return (appState.fishboneTrunks || []).find(t => t.id === trunkId) || null;
}

// ── 工具：沿 parentId 上溯到根干线（带环保护）──
function _rootOf(trunk) {
  let cur = trunk;
  const seen = new Set([cur.id]);
  while (cur.parentId && !seen.has(cur.parentId)) {
    const parent = _findTrunk(cur.parentId);
    if (!parent) break;
    cur = parent;
    seen.add(cur.id);
  }
  return cur;
}

// ── 工具：2D 视图刷新 ──
function _refresh2D() {
  mark2DDirty();
  if (appState.is2DView && appState.refresh2DView) appState.refresh2DView();
}

// ── 工具：新增唯一节点 id ──
function _newNodeId() {
  let id;
  do {
    id = 'N' + Date.now() + Math.floor(Math.random() * 100000);
  } while (appState.nodeMap.has(id));
  return id;
}

// ── 3D 折叠/展开动画（与普通节点折叠动画同款：500ms easeOut，缩放+透明度渐变）──
// nodeIds = 可见性翻转的节点；trunkIds = 可见性翻转的干线（段连线/封口球同步淡入淡出）；
// target = true 展开 / false 折叠。重复触发时上一个动画立即固化终态再开新的。
let _fbToggleAnim = null;

function _animateFishbone3D(nodeIds, trunkIds, target) {
  if (_fbToggleAnim) {
    cancelAnimationFrame(_fbToggleAnim.raf);
    _fbToggleAnim.finish();
    _fbToggleAnim = null;
  }

  // 相连树连线（端点任一在动画集合内）：与普通折叠动画一致淡入淡出
  const idSet = new Set(nodeIds);
  const affLines = (appState.lineItems || []).filter(it => idSet.has(it.startId) || idSet.has(it.endId));
  // 动画接管连线/节点透明度期间，渲染循环跳过其 opacity 覆盖
  appState._lineToggleAnimActive = true;

  if (target) {
    // 展开：先摆好初始态（可见 + 缩放/透明度 0），树连线置 0 后再恢复可见防闪现
    for (const id of nodeIds) {
      const obj = appState.nodeMeshes.get(id);
      if (!obj) continue;
      obj.mesh.visible = true;
      obj.visible = true;
      if (obj.label) obj.label.visible = true;
      obj.mesh.scale.set(0.05, 0.05, 0.05);
      if (obj.label) labelAnimScale(obj.label, 0.05);
      if (obj.mesh.material) { obj.mesh.material.transparent = true; obj.mesh.material.opacity = 0; }
      if (obj.label && obj.label.element) obj.label.element.style.opacity = 0;
      if (obj.glowSphere && obj.glowSphere.material) { obj.glowSphere.material.transparent = true; obj.glowSphere.material.opacity = 0; }
      if (obj.ring && obj.ring.material) { obj.ring.material.transparent = true; obj.ring.material.opacity = 0; }
      if (obj.surfaceGlowSphere) {
        obj.surfaceGlowSphere.visible = !appState.simple3D;
        obj.surfaceGlowSphere.scale.set(0.05, 0.05, 0.05);
        if (obj.surfaceGlowSphere.material) { obj.surfaceGlowSphere.material.transparent = true; obj.surfaceGlowSphere.material.opacity = 0; }
      }
    }
    for (const l of affLines) { l.line.setVisible(true); l.line.setOpacity(0); }
    for (const tid of trunkIds) setFishboneTrunkOpacity(tid, 0);
  }

  const start = performance.now();
  const dur = 500;

  // 终态固化（动画走完或被新动画/撤销重做打断时调用）。
  // 以当前折叠缓存为准而非动画启动时的方向：动画期间状态可能已被撤销/重做改变
  function finish() {
    refreshFishboneHiddenCache();
    const showGlow = !appState.simple3D;
    for (const id of nodeIds) {
      const obj = appState.nodeMeshes.get(id);
      if (!obj) continue;
      const vis = !isFishboneNodeHidden(id);
      obj.mesh.visible = vis;
      obj.visible = vis;
      if (obj.label) obj.label.visible = vis;
      obj.mesh.scale.set(1, 1, 1);
      if (obj.label) labelAnimScale(obj.label, 1);
      if (obj.mesh.material) { obj.mesh.material.transparent = false; obj.mesh.material.opacity = 1; }
      if (obj.label && obj.label.element) obj.label.element.style.opacity = vis ? 1 : 0;
      if (obj.glowSphere && obj.glowSphere.material) {
        obj.glowSphere.visible = vis && showGlow;
        obj.glowSphere.material.transparent = true;
        obj.glowSphere.material.opacity = vis && showGlow ? 1 : 0;
      }
      if (obj.ring && obj.ring.material) { obj.ring.material.transparent = false; obj.ring.material.opacity = 1; }
      if (obj.surfaceGlowSphere) {
        obj.surfaceGlowSphere.visible = vis && showGlow;
        obj.surfaceGlowSphere.scale.set(1, 1, 1);
        if (obj.surfaceGlowSphere.material) {
          obj.surfaceGlowSphere.material.transparent = true;
          obj.surfaceGlowSphere.material.opacity = vis && showGlow ? 1 : 0;
        }
      }
    }
    for (const l of affLines) {
      const vis = !isFishboneNodeHidden(l.startId) && !isFishboneNodeHidden(l.endId);
      l.line.setVisible(vis);
      l.line.setOpacity(vis ? 1 : 0);
      if (showGlow) {
        if (l.line.glowTube) { l.line.glowTube.visible = vis; l.line.glowTube.material.opacity = vis ? 0.9 : 0; }
        if (l.line.particlePoints) { l.line.particlePoints.visible = vis; l.line.particlePoints.material.opacity = vis ? 1 : 0; }
        if (l.line.trailPointsMerged) l.line.trailPointsMerged.visible = vis;
      }
    }
    const nowHiddenTrunks = getFishboneHiddenTrunkIds();
    for (const tid of trunkIds) {
      if (!nowHiddenTrunks.has(tid)) setFishboneTrunkOpacity(tid, 1);   // 仍显示的干线恢复全显，其余随重建清场
    }
    rebuildFishbone3D();   // 幂等：隐藏干线段的渲染被移除，未变化的主干自动跳过
    updateLinesVis();
    appState._lineToggleAnimActive = false;
  }

  function step(now) {
    const t = Math.min(1, (now - start) / dur);
    const ease = 1 - Math.pow(1 - t, 2);
    const sc = Math.max(0.05, target ? ease : 1 - ease);
    const opacity = target ? ease : 1 - ease;
    const showGlow = !appState.simple3D;

    for (const id of nodeIds) {
      const obj = appState.nodeMeshes.get(id);
      if (!obj) continue;
      obj.mesh.scale.set(sc, sc, sc);
      if (obj.label) labelAnimScale(obj.label, sc);
      if (obj.mesh.material) { obj.mesh.material.transparent = true; obj.mesh.material.opacity = opacity; }
      if (obj.glowSphere && obj.glowSphere.material && showGlow) { obj.glowSphere.material.transparent = true; obj.glowSphere.material.opacity = opacity; }
      if (obj.ring && obj.ring.material) { obj.ring.material.transparent = true; obj.ring.material.opacity = opacity; }
      if (obj.label && obj.label.element) obj.label.element.style.opacity = opacity;
      if (obj.surfaceGlowSphere && showGlow) {
        obj.surfaceGlowSphere.scale.set(sc, sc, sc);
        if (obj.surfaceGlowSphere.material) {
          obj.surfaceGlowSphere.material.transparent = true;
          obj.surfaceGlowSphere.material.opacity = opacity;
        }
      }
    }
    for (const l of affLines) {
      l.line.setOpacity(opacity);
      if (showGlow) {
        if (l.line.glowTube && l.line.glowTube.material) l.line.glowTube.material.opacity = opacity * 0.9;
        if (l.line.particlePoints && l.line.particlePoints.material) l.line.particlePoints.material.opacity = opacity;
      }
    }
    for (const tid of trunkIds) setFishboneTrunkOpacity(tid, opacity);

    if (t < 1) {
      _fbToggleAnim.raf = requestAnimationFrame(step);
      return;
    }
    _fbToggleAnim = null;
    finish();
  }

  _fbToggleAnim = { raf: 0, finish };
  _fbToggleAnim.raf = requestAnimationFrame(step);
}

// ── 折叠 / 展开支路：trunk.collapsed 标记，子支递归隐藏，末端节点及树后代一并隐藏；
//    显隐带与普通节点折叠/展开同款的过渡动画（2D alpha 渐隐 / 3D 缩放+透明度）──
export const toggleFishboneCollapseWithHistory = withHistory(function (trunkId) {
  const trunk = _findTrunk(trunkId);
  if (!trunk) return;
  refreshFishboneHiddenCache();   // 确保翻转前隐藏缓存最新
  const prevHiddenNodes = new Set(getFishboneHiddenNodeIds());
  const prevHiddenTrunks = getFishboneHiddenTrunkIds();
  trunk.collapsed = !trunk.collapsed;
  refreshFishboneHiddenCache();
  const hiddenNodes = getFishboneHiddenNodeIds();
  const hiddenTrunks = getFishboneHiddenTrunkIds();
  const treeTrunks = collectFishboneSubtree2D(trunk);
  const target = !trunk.collapsed;   // true = 展开
  const direction = target ? 'expand' : 'collapse';

  // 收集可见性翻转的节点（末端节点 + 树后代）与干线（动画对象）；
  // 已处于隐藏状态的嵌套折叠子树不重复动画
  const flipNodeSet = new Set();
  for (const t of treeTrunks) {
    if (!t.endNodeId) continue;
    for (const id of collectNodeWithDescendants(t.endNodeId)) {
      if (prevHiddenNodes.has(id) !== hiddenNodes.has(id)) flipNodeSet.add(id);
    }
  }
  const flipTrunks = [];
  for (const t of treeTrunks) {
    if (prevHiddenTrunks.has(t.id) !== hiddenTrunks.has(t.id)) flipTrunks.push(t.id);
  }

  // 2D alpha 过渡注册（2D 视图 300ms 与普通 2D 折叠动画一致；干线支路线同步渐隐）
  if (flipNodeSet.size) startFishboneAnim(flipNodeSet, direction, appState.is2DView ? 300 : 500);
  if (flipTrunks.length) startFishboneAnim(flipTrunks, direction, 300);

  // 选中段位于被折叠子树内时清除高亮
  if (selectedSeg) {
    let cur = _findTrunk(selectedSeg.trunkId);
    const seen = new Set();
    while (cur && cur.parentId && !seen.has(cur.parentId)) {
      seen.add(cur.id);
      const p = _findTrunk(cur.parentId);
      if (!p) break;
      if (p.collapsed) { clearFishboneSegHighlight(); break; }
      cur = p;
    }
  }

  if (target) rebuildFishbone3D();   // 展开：先重建出恢复显示的干线段再淡入
  if (flipNodeSet.size || flipTrunks.length) {
    _animateFishbone3D([...flipNodeSet], flipTrunks, target);
  } else if (!target) {
    rebuildFishbone3D();   // 无可见翻转（嵌套折叠）：直接清场
  }
  saveCurrentProjectData();
  _refresh2D();
  showToast(trunk.collapsed ? '已折叠支路' : '已展开支路');
});

// ── 变成主干路：删除 parentId 提升为根干路；detached 标记豁免旧数据几何迁移 ──
export const promoteFishboneTrunkWithHistory = withHistory(function (trunkId) {
  const trunk = _findTrunk(trunkId);
  if (!trunk || !trunk.parentId) return;
  // 随机模式：提升前冻结当前 3D 起点（脱离父干线后按根干线锚点渲染，防止飞散）
  if (!appState.layer3DLayout) {
    const sk = computeFishboneSkeleton3D(trunk);
    if (sk.length) trunk._3dPos = sk[0].toArray();
  }
  delete trunk.parentId;
  trunk.detached = true;
  saveCurrentProjectData();
  _refresh2D();
  showToast('已变为主干路');
});

// ── 变成支路：进入选择模式（点击目标线段完成挂载）──
export function startFishboneAttach(trunkId) {
  setFishboneAttachMode({ trunkId });
  if (canvas) canvas.style.cursor = 'crosshair';
  showToast('请点击目标鱼骨线段完成挂载（Esc / 右键取消）');
}

export function cancelFishboneAttach() {
  if (!fishboneAttachMode) return;
  setFishboneAttachMode(null);
  if (canvas) canvas.style.cursor = 'grab';
  showToast('已取消挂载');
}

// ── 移动线路：进入统一移动模式（与节点移动同款：顶部 ✅确定/❌取消 控制栏，取消可还原）──
// 2D 视图直接拖线体即可移动，无需进入模式；3D 进入后按住任意线路拖动平移其子树，
// 与节点拖拽共存（同一移动模式内），「确定」落盘 /「取消」还原 / Esc 取消
export function startFishboneMove(trunkId) {
  if (appState.is2DView) {
    showToast('2D 视图可直接拖动线体移动线路');
    return;
  }
  if (!appState.enterMoveMode) return;
  appState.enterMoveMode(null);   // 无节点目标：仅显示控制栏 + 快照节点 3D 位置
  // 鱼骨快照（取消还原用）：全部干线 2D 点 + 3D 锚点/朝向 + 末端节点（含树后代）2D/3D 位置
  const trunks = appState.fishboneTrunks || [];
  const fbSnap = {
    trunks: trunks.map(t => ({
      t,
      pts: (t.points || []).map(p => ({ x: p.x, y: p.y })),
      p3: Array.isArray(t._3dPos) ? t._3dPos.slice() : null,
      o3: Array.isArray(t._3dOff) ? t._3dOff.slice() : null,
      d3: Array.isArray(t.dirs3D) ? t.dirs3D.map(d => d.slice()) : null
    })),
    nodes: []
  };
  const _seenMoveNodes = new Set();
  for (const t of trunks) {
    if (!t.endNodeId) continue;
    for (const nid of [t.endNodeId, ...collectDescendantIds(t.endNodeId)]) {
      if (_seenMoveNodes.has(nid)) continue;
      _seenMoveNodes.add(nid);
      const p2 = appState.positions2D.get(nid);
      const p3 = appState.positions.get(nid);
      if (p2 && p3) fbSnap.nodes.push({ id: nid, p2: { x: p2.x, y: p2.y }, p3: p3.clone() });
    }
  }
  appState._fishboneMoveRestore = () => {
    for (const s of fbSnap.trunks) {
      s.t.points = s.pts;
      if (s.p3) s.t._3dPos = s.p3; else delete s.t._3dPos;
      if (s.o3) s.t._3dOff = s.o3; else delete s.t._3dOff;
      if (s.d3) s.t.dirs3D = s.d3; else delete s.t.dirs3D;
    }
    for (const ns of fbSnap.nodes) {
      appState.positions2D.set(ns.id, ns.p2);
      appState.positions.set(ns.id, ns.p3.clone());
    }
    rebuildFishbone3D(true);
    mark2DDirty();
  };
  showToast('移动模式：按住线路拖动调整位置，「确定」保存 /「取消」还原');
}

export function cancelFishboneMove() {
  if (!fishboneMoveMode) return;
  setFishboneMoveMode(null);
  if (appState.renderer && appState.renderer.domElement) appState.renderer.domElement.style.cursor = '';
}

// ── 变成支路：起点/自由端吸附投影到目标干线，写入 parentId（挂载目标由 mousedown 校验）──
export const completeFishboneAttachWithHistory = withHistory(function (targetTrunk) {
  const mode = fishboneAttachMode;
  setFishboneAttachMode(null);
  if (canvas) canvas.style.cursor = 'grab';
  if (!mode || !targetTrunk) return;
  const src = _findTrunk(mode.trunkId);
  if (!src || src.id === targetTrunk.id) return;
  const pts = src.points || [];
  if (pts.length < 2) return;
  // 附着端：endNodeId 分支固定起点（终点连着节点不可动）；其余取离目标投影更近的一端
  let idx = 0;
  if (!src.endNodeId) {
    const p0 = projectOnTrunk2D(targetTrunk.id, pts[0].x, pts[0].y);
    const pl = projectOnTrunk2D(targetTrunk.id, pts[pts.length - 1].x, pts[pts.length - 1].y);
    if (p0 && pl && pl.d < p0.d) idx = pts.length - 1;
  }
  const proj = projectOnTrunk2D(targetTrunk.id, pts[idx].x, pts[idx].y);
  if (!proj) return;
  pts[idx] = { x: proj.x, y: proj.y };
  src.parentId = targetTrunk.id;
  delete src.detached;
  delete src._3dPos;   // 随机模式：挂载后起点吸附到目标干线分叉点，清除根锚点/自由偏移
  delete src._3dOff;
  refreshFishboneHiddenCache();
  rebuildFishbone3D(true);
  updateLinesVis();
  saveCurrentProjectData();
  _refresh2D();
  showToast('已挂载为支路');
});

// ── 2D/3D 相互定位：切换视图并把视野中心对准整棵鱼骨（含末端节点）包围盒 ──
export function locateFishboneTree(trunkId) {
  const trunk = _findTrunk(trunkId);
  if (!trunk) return;
  const subtree = collectFishboneSubtree2D(_rootOf(trunk));
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const eat = (x, y) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  for (const t of subtree) {
    for (const p of (t.points || [])) eat(p.x, p.y);
    if (t.endNodeId) {
      const p = appState.positions2D.get(t.endNodeId);
      if (p) eat(p.x, p.y);
    }
  }
  if (minX === Infinity) return;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;

  if (appState.is2DView) {
    // 2D → 3D：切换视图后走相机聚焦动画（module14 渲染循环每帧 easeInOutCubic 推进，
    // 与 UI/Search.js 节点定位同款字段；须在 hide2DView 之后再设字段）
    if (appState.hide2DView) appState.hide2DView();
    let c3;
    if (!appState.layer3DLayout) {
      // 随机模式：按 3D 骨架几何中心聚焦（与 2D 无位置映射）
      const sum = new THREE.Vector3();
      let n = 0;
      for (const t of subtree) {
        for (const p of computeFishboneSkeleton3D(t)) { sum.add(p); n++; }
      }
      if (!n) return;
      c3 = sum.divideScalar(n);
    } else {
      c3 = trunkPointTo3D({ x: cx, y: cy }, fishboneLayerY(trunk.layerId || appState.currentLayerId));   // 聚焦到干线所属图层平面
    }
    if (appState.camera && appState.controls) {
      appState.cameraAnimStartPos.copy(appState.camera.position);
      appState.cameraAnimStartTarget.copy(appState.controls.target);
      appState.cameraAnimTarget = {
        cameraPos: new THREE.Vector3(c3.x, c3.y + 5, c3.z + 5),
        controlsTarget: new THREE.Vector3(c3.x, c3.y, c3.z)
      };
      appState.cameraAnimProgress = 0;
      appState.cameraAnimDuration = 0.8;
      appState.cameraAnimActive = true;
    }
  } else {
    // 3D → 2D：切换视图后 600ms 缓动平移视口到包围盒中心（保持当前缩放，
    // 与 focusOnNode2D 同款 rAF 缓动模式）
    if (appState.show2DView) appState.show2DView(true);
    requestAnimationFrame(() => {
      const centerWorld = canvasToWorld(canvas.width / 2, canvas.height / 2);
      const targetOffsetX = transform.offsetX + (centerWorld.x - cx) * transform.scale;
      const targetOffsetY = transform.offsetY + (centerWorld.y - cy) * transform.scale;
      const startOffsetX = transform.offsetX;
      const startOffsetY = transform.offsetY;
      const duration = 600;
      const startTime = performance.now();
      function animateLocate(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
        transform.offsetX = startOffsetX + (targetOffsetX - startOffsetX) * eased;
        transform.offsetY = startOffsetY + (targetOffsetY - startOffsetY) * eased;
        draw();
        if (progress < 1) requestAnimationFrame(animateLocate);
        else {
          transform.offsetX = targetOffsetX;
          transform.offsetY = targetOffsetY;
          draw();
        }
      }
      requestAnimationFrame(animateLocate);
    });
  }
}

// ── 复制鱼骨图：深拷贝整棵树（新干线 + 新节点森林），整体偏移 60px ──
const _COPY_OFFSET = 60;

export const duplicateFishboneTreeWithHistory = withHistory(function (trunkId) {
  const src = _findTrunk(trunkId);
  if (!src) return;
  const subtree = collectFishboneSubtree2D(_rootOf(src));
  if (!subtree.length) return;

  const idMap = new Map();      // 旧干线 id → 新干线 id
  const nodeIdMap = new Map();  // 旧节点 id → 新节点 id
  const delta3 = new THREE.Vector3(_COPY_OFFSET * FISHBONE_3D_SCALE, 0, _COPY_OFFSET * FISHBONE_3D_SCALE);

  // 节点森林克隆：endNodeId 节点及其树后代整体克隆（同节点被多条分支引用时去重）
  const cloneNodeTree = (oldId) => {
    if (nodeIdMap.has(oldId)) return nodeIdMap.get(oldId);
    const node = appState.nodeMap.get(oldId);
    if (!node) return null;
    const newId = _newNodeId();
    nodeIdMap.set(oldId, newId);
    const clone = JSON.parse(JSON.stringify(node));
    clone.id = newId;
    clone.children = [];
    if (node.children) {
      for (const ch of node.children) {
        const cid = cloneNodeTree(ch.id);
        if (cid) clone.children.push(appState.nodeMap.get(cid));
      }
    }
    if (!appState.methodsTree.children) appState.methodsTree.children = [];
    appState.methodsTree.children.push(clone);
    appState.nodeMap.set(newId, clone);
    appState.addNodeToCurrentLayer(newId);
    const pos2 = appState.positions2D.get(oldId);
    if (pos2) appState.positions2D.set(newId, { x: pos2.x + _COPY_OFFSET, y: pos2.y + _COPY_OFFSET });
    const pos3 = appState.positions.get(oldId);
    if (pos3) {
      const np3 = pos3.clone().add(delta3);
      appState.positions.set(newId, np3);
      createNodeMesh(clone, np3);
    }
    // 派发节点创建事件（供 nodeDiskSync 实时创建磁盘文件夹）
    window.dispatchEvent(new CustomEvent('astroknot-node-created', {
      detail: { nodeId: newId, node: clone }
    }));
    return newId;
  };

  // 干线克隆（先分配新 id，再按依赖顺序写入 parentId / endNodeId 映射）
  for (const t of subtree) {
    idMap.set(t.id, 'trunk_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + idMap.size);
  }
  for (const t of subtree) {
    const copy = {
      id: idMap.get(t.id),
      points: (t.points || []).map(p => ({ x: p.x + _COPY_OFFSET, y: p.y + _COPY_OFFSET })),
      segs: (t.segs || []).map(s => ({
        id: 'seg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + Math.floor(Math.random() * 1000),
        label: s.label || '',
        labelHidden: s.labelHidden !== false,
        customColor: s.customColor || null
      })),
      collapsed: false,
      layerId: t.layerId || appState.currentLayerId   // 副本继承源干线图层
    };
    if (t.parentId) copy.parentId = idMap.get(t.parentId) || t.parentId;
    if (t.endNodeId) {
      const nid = cloneNodeTree(t.endNodeId);
      if (nid) copy.endNodeId = nid;
    }
    appState.fishboneTrunks.push(copy);
  }

  refreshFishboneHiddenCache();
  rebuildFishbone3D();
  saveCurrentProjectData();
  if (appState.refreshTreePanel) appState.refreshTreePanel();
  _refresh2D();
  showToast('已复制鱼骨图');
});

// ── 删除鱼骨图：整棵树（干线 + 子支 + 末端节点及其树后代），带确认，单条撤销 ──
export function deleteFishboneTree(trunkId) {
  const trunk = _findTrunk(trunkId);
  if (!trunk) return;
  const subtree = collectFishboneSubtree2D(trunk);
  const allIds = new Set();
  for (const t of subtree) {
    if (!t.endNodeId) continue;
    allIds.add(t.endNodeId);
    const node = appState.nodeMap.get(t.endNodeId);
    const collect = (n) => {
      if (!n || !n.children) return;
      for (const ch of n.children) {
        if (ch.id && !allIds.has(ch.id)) {
          allIds.add(ch.id);
          collect(appState.nodeMap.get(ch.id));
        }
      }
    };
    collect(node);
  }
  const msg = allIds.size
    ? `确定删除该鱼骨图（${subtree.length} 条干线、${allIds.size} 个节点及其内容）吗？`
    : `确定删除该鱼骨图（${subtree.length} 条干线）吗？`;
  showConfirm(msg, () => deleteFishboneTreeCommit(subtree.map(t => t.id), allIds), null, '删除鱼骨图');
}

const deleteFishboneTreeCommit = withHistory(function (trunkIdSet, allIds) {
  const ids = new Set(trunkIdSet);
  appState.fishboneTrunks = (appState.fishboneTrunks || []).filter(t => !ids.has(t.id));
  const infos = [];
  for (const id of allIds) {
    const node = appState.nodeMap.get(id);
    if (!node) continue;
    infos.push({ id, name: node.name || '未命名' });
    // 从方法树移除
    const removeFromParent = (parent, targetId) => {
      if (!parent || !parent.children) return false;
      const idx = parent.children.findIndex(c => c.id === targetId);
      if (idx !== -1) {
        parent.children.splice(idx, 1);
        return true;
      }
      for (const child of parent.children) {
        if (removeFromParent(child, targetId)) return true;
      }
      return false;
    };
    removeFromParent(appState.methodsTree, id);
    destroyNodeMesh(id);
    appState.positions.delete(id);
    appState.positions2D.delete(id);
    appState.nodeMap.delete(id);
    appState.removeNodeFromLayer(id);
    if (appState.sourceNodeId === id) appState.sourceNodeId = null;
    if (appState.targetNodeId === id) appState.targetNodeId = null;
  }
  if (allIds.size) {
    // 派发节点删除事件（供 nodeDiskSync 实时删除磁盘文件夹）
    window.dispatchEvent(new CustomEvent('astroknot-node-deleted', {
      detail: { nodeIds: Array.from(allIds), nodes: infos }
    }));
    appState.crossEdges = appState.crossEdges.filter(e => !allIds.has(e.source) && !allIds.has(e.target));
    removeLinesForNodes(allIds);
  }
  // 选中段随树删除时清除高亮
  if (selectedSeg && ids.has(selectedSeg.trunkId)) clearFishboneSegHighlight();
  refreshFishboneHiddenCache();
  rebuildFishbone3D();
  updateLinesVis();
  saveCurrentProjectData();
  if (typeof window.forceRefreshTreePanel === 'function') window.forceRefreshTreePanel();
  _refresh2D();
  showToast('已删除鱼骨图');
});
