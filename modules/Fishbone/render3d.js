// ============================================================
//  Fishbone / render3d.js — 鱼骨主干的 3D 场景渲染
//  与普通连线同款渲染：每段 = 一条 PolylineFlowLine
//  （彩虹管 + 辉光管 + 螺旋粒子，同交叉折线连线）。
//  分段衔接圆滑：按全局 Catmull-Rom 切线推导每段三次贝塞尔
//  控制点后密集采样，相邻段切线连续（C1），衔接处无折角；
//  所有主干点放置同半径小球封口，圆滑端点与接缝。
//  每段独立成线 → mesh.userData 标记 trunkId/segId/segIndex，
//  支持点击选中（黄色高亮）+ 连线标签改名/改色/删除。
//  主干数据仍以 2D 世界坐标存储，3D 中按固定比例映射到所属图层的水平面：
//    3D = (x2d * SCALE, 层高, y2d * SCALE)，反向换算即可互通两视图；
//    layer3DLayout 模式下层高 = 层序 × layer3DSpacing（与节点图层堆叠一致）
// ============================================================

import * as THREE from 'three';
import { appState } from '../module0_AppState.js';
import { PolylineFlowLine } from '../VisualComponents/FlowLines.js';
import {
  isDraggingSeg, segStart, segCurrent, selectedSeg, setSelectedSeg,
  isDraggingBranch, branchHit, branchCurrent, draw3DFrame
} from './state.js';
import { syncFishboneNodeLinks, projectOnTrunk2D } from './render2d.js';
import {
  getFishboneHiddenTrunkIds, getFishboneHiddenNodeIds, refreshFishboneHiddenCache,
  getFishboneAnimState
} from './visibility.js';

// 2D 世界坐标 → 3D 场景缩放比例（x/z 统一比例保证 2D 形状与线段角度不变形）。
// 全局共用：节点 2D 排列的 3D 映射（Resize.js）、跨组连线航点（LineManager.js）与
// 鱼骨主干都用此常数，保证节点/连线/鱼骨在图层平面内严格同比例、鱼骨分支精确接到节点。
// 0.012：同级节点 2D 垂直间距 60px → 0.72，大于节点球径（0.22×2×sizeScale≈0.66）不重叠
export const FISHBONE_3D_SCALE = 0.012;
// 3D 渲染平面基础高度（无图层布局时的场景原点水平面）
export const FISHBONE_3D_Y = 0;

// 图层 → 3D 平面高度：layer3DLayout 模式下按层序 × 层间距堆叠，
// 与节点 3D 图层摆放约定一致（node-factory 的 sortedLayers × layer3DSpacing）
export function fishboneLayerY(layerId) {
  if (!appState.layer3DLayout) return FISHBONE_3D_Y;
  const sortedLayers = [...appState.layers].sort((a, b) => a.order - b.order);
  const idx = sortedLayers.findIndex(l => l.id === layerId);
  return idx >= 0 ? idx * (appState.layer3DSpacing || 4) : FISHBONE_3D_Y;
}

// 当前图层的鱼骨平面（3D 画线/拾取的射线求交用；随图层高度变化动态生成）
export function currentFishbonePlane() {
  return new THREE.Plane(new THREE.Vector3(0, 1, 0), -fishboneLayerY(appState.currentLayerId));
}

// ============================================================
//  随机模式（非图层排列）3D 骨架：与 2D 完全解耦
//  - 每段朝向随机（单位球随机方向），长度保留 2D 段长 × SCALE
//  - 根干线：随机 3D 锚点（trunk._3dPos，惰性生成并持久化）
//  - 分支：起点 = 父干线骨架上按 2D 投影同比例的分叉点（分叉位置保留）
//          + 自由偏移（trunk._3dOff，拖动分支时更新）
//  - 段朝向存 trunk.dirs3D（随数据持久化，跨帧/跨会话稳定）
// ============================================================
function _randomUnitVec3() {
  const u = Math.random() * 2 - 1;
  const phi = Math.random() * Math.PI * 2;
  const s = Math.sqrt(1 - u * u);
  return [s * Math.cos(phi), u, s * Math.sin(phi)];
}

// 根干线随机锚点：球壳半径 2.5–7 内随机分布（与节点随机散布风格一致）
function _randomAnchor3() {
  const r = 2.5 + Math.random() * 4.5;
  const v = _randomUnitVec3();
  return [v[0] * r, v[1] * r, v[2] * r];
}

// 每段随机朝向数组（与段数同步：尾部增删保留已有方向，旧数据惰性生成）
function _ensureDirs3D(trunk) {
  const n = (trunk.points || []).length - 1;
  if (!Array.isArray(trunk.dirs3D)) trunk.dirs3D = [];
  while (trunk.dirs3D.length > n) trunk.dirs3D.pop();
  while (trunk.dirs3D.length < n) trunk.dirs3D.push(_randomUnitVec3());
  return trunk.dirs3D;
}

// 计算随机模式的 3D 骨架点（纯几何，不含 endNodeId 节点球心覆盖）；
// 分支先递归算父骨架，起点按 2D 投影 (segIndex, t) 落在父骨架对应分叉位置
export function computeFishboneSkeleton3D(trunk, _seen) {
  const pts = trunk.points || [];
  if (!pts.length) return [];
  _seen = _seen || new Set();
  const dirs = _ensureDirs3D(trunk);
  let start = null;
  const parent = (!trunk.detached && trunk.parentId && trunk.parentId !== trunk.id)
    ? (appState.fishboneTrunks || []).find(t => t.id === trunk.parentId) : null;
  if (parent && !_seen.has(parent.id)) {
    _seen.add(trunk.id);
    const pPts = computeFishboneSkeleton3D(parent, _seen);
    const proj = projectOnTrunk2D(parent.id, pts[0].x, pts[0].y);
    if (pPts.length >= 2 && proj && proj.segIndex < pPts.length - 1) {
      const pPts2 = parent.points || [];
      const L2 = Math.hypot(pPts2[proj.segIndex + 1].x - pPts2[proj.segIndex].x,
                            pPts2[proj.segIndex + 1].y - pPts2[proj.segIndex].y);
      const pd = parent.dirs3D[proj.segIndex] || [0, 1, 0];
      start = pPts[proj.segIndex].clone()
        .addScaledVector(new THREE.Vector3(pd[0], pd[1], pd[2]), proj.t * L2 * FISHBONE_3D_SCALE);
    } else if (pPts.length) {
      start = pPts[0].clone();   // 投影失败（父数据异常）：挂父骨架起点兜底
    }
  }
  if (!start) {
    if (!Array.isArray(trunk._3dPos)) trunk._3dPos = _randomAnchor3();
    start = new THREE.Vector3(trunk._3dPos[0], trunk._3dPos[1], trunk._3dPos[2]);
  } else if (Array.isArray(trunk._3dOff)) {
    start.add(new THREE.Vector3(trunk._3dOff[0], trunk._3dOff[1], trunk._3dOff[2]));
  }
  const out = [start.clone()];
  let cur = start;
  for (let i = 0; i < pts.length - 1; i++) {
    const L2 = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    const d = dirs[i] || [0, 1, 0];
    cur = cur.clone().addScaledVector(new THREE.Vector3(d[0], d[1], d[2]), L2 * FISHBONE_3D_SCALE);
    out.push(cur.clone());
  }
  return out;
}

// 管径（与 FlowLines.js 直管半径一致）
const TUBE_RADIUS = 0.03;
// 每段贝塞尔采样数（getPoints(n) 生成 n+1 个点，密集采样保证圆滑）
const SEG_SAMPLES = 9;

// 2D 主干点 → 3D 场景坐标（layerY：目标图层平面高度；预览等单点换算传当前图层高度）
export function trunkPointTo3D(p, layerY = FISHBONE_3D_Y) {
  return new THREE.Vector3(p.x * FISHBONE_3D_SCALE, layerY, p.y * FISHBONE_3D_SCALE);
}

// 3D 场景坐标 → 2D 主干点
export function trunkPointFrom3D(v) {
  return { x: v.x / FISHBONE_3D_SCALE, y: v.z / FISHBONE_3D_SCALE };
}

// ── 随机模式 3D 画线取景帧换算（帧由 interaction.js 捕获，存 state.draw3DFrame）──
// 帧局部 2D 坐标 → 3D 场景点：center + right·(x·SCALE) + up·(y·SCALE)
// 由于 right/up 为单位正交基，|帧位移| = |2D 位移|·SCALE → 预览与提交后的骨架严格一致
export function fishboneFramePoint3D(p) {
  if (!draw3DFrame) return null;
  return draw3DFrame.center.clone()
    .addScaledVector(draw3DFrame.right, p.x * FISHBONE_3D_SCALE)
    .addScaledVector(draw3DFrame.up, p.y * FISHBONE_3D_SCALE);
}

// 帧局部 2D 位移 → 3D 位移向量（未归一化，模长 = |2D 位移| × SCALE）
export function fishboneFrameVec3(dx, dy) {
  return draw3DFrame.right.clone().multiplyScalar(dx * FISHBONE_3D_SCALE)
    .addScaledVector(draw3DFrame.up, dy * FISHBONE_3D_SCALE);
}

// ── 段元数据（segs）规范化：保证 segs.length === points.length - 1 ──
// 兼容旧数据（无 segs 字段）与撤销/重做后的深拷贝对象
function _newSegId() {
  return 'seg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
}

function _normalizeSegs(trunk) {
  if (!Array.isArray(trunk.segs)) trunk.segs = [];
  while (trunk.segs.length > trunk.points.length - 1) trunk.segs.pop();
  while (trunk.segs.length < trunk.points.length - 1) {
    trunk.segs.push({ id: _newSegId(), label: '', labelHidden: true, customColor: null });
  }
  return trunk.segs;
}

// ── 每段几何采样：全局 Catmull-Rom 切线 → 三次贝塞尔控制点 ──
// B0=P1, B1=P1+(P2-P0)/6, B2=P2-(P3-P1)/6, B3=P2（端点处镜像补点）
// 相邻段共用切线 → C1 连续，衔接处圆滑
// startDir3（可选，仅首段生效）：覆盖起点切向 → 分支首段与父干线方向融合（平滑衔接）
function _segSamplePoints(pts3D, i, startDir3) {
  const P1 = pts3D[i], P2 = pts3D[i + 1];
  const P0 = i > 0 ? pts3D[i - 1] : P1.clone().multiplyScalar(2).sub(P2);
  const P3 = i < pts3D.length - 2 ? pts3D[i + 2] : P2.clone().multiplyScalar(2).sub(P1);
  const B1 = (i === 0 && startDir3)
    ? P1.clone().addScaledVector(startDir3, P1.distanceTo(P2) / 3)
    : P1.clone().add(P2.clone().sub(P0).multiplyScalar(1 / 6));
  const B2 = P2.clone().sub(P3.clone().sub(P1).multiplyScalar(1 / 6));
  return new THREE.CubicBezierCurve3(P1.clone(), B1, B2, P2.clone()).getPoints(SEG_SAMPLES);
}

// 点到线段最短距离（叉点归属判定用，复用临时向量）
const _sdB = new THREE.Vector3(), _sdP = new THREE.Vector3();
function _distPointSeg(p, a, b) {
  _sdP.subVectors(p, a);
  _sdB.subVectors(b, a);
  const len2 = _sdB.lengthSq();
  if (len2 < 1e-12) return _sdP.length();
  const t = Math.min(1, Math.max(0, _sdP.dot(_sdB) / len2));
  return Math.sqrt(Math.max(0, _sdP.lengthSq() - 2 * t * _sdP.dot(_sdB) + t * t * len2));
}

// 分支（parentId）首段起点切向 = 父干线在叉点处最近的段弦方向。
// 叉点在两条模式下都精确落在父骨架弦上（随机模式按 (segIndex,t) 定位、图层模式按 2D 映射），
// 最近段搜索即可稳定还原归属段 → 分支像支流一样从干线平滑长出
function _branchStartDir3(trunk, pts3D) {
  if (!trunk.parentId || pts3D.length < 2) return null;
  const parent = (appState.fishboneTrunks || []).find(t => t.id === trunk.parentId);
  if (!parent) return null;
  const pPts = _trunkPts3D(parent);
  if (pPts.length < 2) return null;
  const fp = pts3D[0];
  let best = -1, bestD = Infinity;
  for (let j = 0; j < pPts.length - 1; j++) {
    const d = _distPointSeg(fp, pPts[j], pPts[j + 1]);
    if (d < bestD) { bestD = d; best = j; }
  }
  if (best < 0) return null;
  const dir = pPts[best + 1].clone().sub(pPts[best]);
  return dir.lengthSq() < 1e-12 ? null : dir.normalize();
}

// 段采样统一入口：首段带分支切向融合，其余段走原采样
function _samplesFor(trunk, pts3D, i) {
  return _segSamplePoints(pts3D, i, i === 0 ? _branchStartDir3(trunk, pts3D) : null);
}

// 端点封口小球共享几何体/材质（模块级单例，避免每端点重复创建）
let _capGeometry = null;
let _capMaterial = null;
function _capAssets() {
  if (!_capGeometry) {
    _capGeometry = new THREE.SphereGeometry(TUBE_RADIUS, 10, 8);
    _capMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x996688,
      emissiveIntensity: 1.5,
      transparent: true
    });
  }
  return { geometry: _capGeometry, material: _capMaterial };
}

// ── 节点连接（endNodeId）的 3D 端点解析 ──
// 分支终点连着节点时，3D 中直接接到节点球心（拖动节点实时跟随）；
// 节点位置缺失时优雅降级回 2D 平面映射点
function _endNodePos3D(trunk) {
  if (!trunk.endNodeId) return null;
  return appState.positions.get(trunk.endNodeId) || null;
}

// 主干点 → 3D 采样点数组（终点连节点时最后一点 = 节点球心）；
// 图层排列模式：各点落在该干线所属图层平面（2D 映射）；
// 随机模式：独立 3D 骨架（每段随机朝向，长度保留，与 2D 无位置映射）
function _trunkPts3D(trunk) {
  const pts3D = !appState.layer3DLayout
    ? computeFishboneSkeleton3D(trunk)
    : (trunk.points || []).map(p => new THREE.Vector3(p.x * FISHBONE_3D_SCALE, fishboneLayerY(trunk.layerId), p.y * FISHBONE_3D_SCALE));
  const nodePos = _endNodePos3D(trunk);
  if (nodePos && pts3D.length >= 2) pts3D[pts3D.length - 1] = nodePos.clone();
  return pts3D;
}

function _makeCapSphere(pos3) {
  const { geometry, material } = _capAssets();
  // 独立材质克隆：折叠/展开动画需按干线独立调透明度（共享材质会互相影响）
  const mesh = new THREE.Mesh(geometry, material.clone());
  mesh.position.copy(pos3);
  appState.scene.add(mesh);
  return mesh;
}

// ── 每主干的渲染状态 ──
// st = { ref: 主干对象, count: 已渲染点数, lines: (PolylineFlowLine|null)[], caps: Mesh[] }
// lines[i] 对应第 i 段（退化段为 null，跳过管线防止 TubeGeometry NaN）
const _trunkState = new Map();
let _previewLine = null;   // 拖拽预览线（细线引导，提交后替换为同款连线）
let _layer3DKey = null;    // 图层布局签名（变化 → 干线按新层高强制重建）

// 选中高亮状态存于 state.js 的 selectedSeg（2D/3D 共用，跨重建保持；
// 段被删除/撤销后由 _refreshHighlight 自动清除）

function _ensureFlatItems() {
  if (!appState.fishboneLineItems) appState.fishboneLineItems = [];
  return appState.fishboneLineItems;
}

// 从 _trunkState 重建 flat 数组（module14 动画/显隐循环与射线检测使用）
function _rebuildFlatItems() {
  const arr = _ensureFlatItems();
  arr.length = 0;
  for (const [trunkId, st] of _trunkState) {
    for (const line of st.lines) {
      if (line) arr.push({ trunkId, line });
    }
  }
}

// 创建一条段的连线（含 userData 标记与自定义色恢复）
function _makeSegLine(trunk, segIndex) {
  const pts3D = _trunkPts3D(trunk);
  const seg = trunk.segs[segIndex];
  const line = new PolylineFlowLine(_samplesFor(trunk, pts3D, segIndex), Math.random(), {
    startId: null,
    endId: null,
    edgeType: 'fishbone',
    label: seg.label || '',
    labelHidden: seg.labelHidden !== false,
    customColor: null
  });
  line.mesh.userData.trunkId = trunk.id;
  line.mesh.userData.segId = seg.id;
  line.mesh.userData.segIndex = segIndex;
  line.mesh.userData.customColor = seg.customColor || null;
  if (seg.customColor) line.setCustomColor(new THREE.Color(seg.customColor));
  return line;
}

function _disposeTrunkRender(st) {
  for (const line of st.lines) if (line) line.dispose();
  for (const cap of st.caps) {
    appState.scene.remove(cap);
    if (cap.material) cap.material.dispose();   // 封口球为独立克隆材质，需一并释放
  }
  st.lines = [];
  st.caps = [];
}

// 单条主干整体重建
function _rebuildTrunk(trunk) {
  const st = _trunkState.get(trunk.id);
  if (st) _disposeTrunkRender(st);
  const pts = trunk.points || [];
  const pts3D = _trunkPts3D(trunk);
  const newState = {
    ref: trunk, count: pts.length, lines: [], caps: [],
    endNodePos: _endNodePos3D(trunk)?.clone() || null   // 渲染时的节点球心（每帧比对检测拖动）
  };
  for (const p3 of pts3D) newState.caps.push(_makeCapSphere(p3));
  if (pts.length >= 2) {
    for (let i = 0; i < pts.length - 1; i++) {
      if (pts3D[i].distanceTo(pts3D[i + 1]) < 1e-4) {
        newState.lines.push(null);   // 退化段跳过管线
      } else {
        newState.lines.push(_makeSegLine(trunk, i));
      }
    }
  }
  _trunkState.set(trunk.id, newState);
}

// ── 3D 移动模式：points 坐标平移（引用与段数不变）时的轻量每帧刷新 ──
// 段数一致 → 逐段 updatePositions + 端点球移动；否则整条重建兜底。
// 注意：rebuildFishbone3D 的未变化检查只比对引用/点数，不比对坐标，
// 平移拖动必须走此处（或 force 重建）才能让 3D 线跟随
export function refreshFishboneTrunkPositions(trunkIds) {
  for (const id of trunkIds) {
    const trunk = (appState.fishboneTrunks || []).find(t => t.id === id);
    if (!trunk) continue;
    const st = _trunkState.get(id);
    const pts = trunk.points || [];
    if (st && st.ref === trunk && pts.length === st.count && pts.length >= 2) {
      const pts3D = _trunkPts3D(trunk);
      for (let i = 0; i < pts.length - 1; i++) {
        const line = st.lines[i];
        if (line) line.updatePositions(_samplesFor(trunk, pts3D, i));
      }
      for (let i = 0; i < st.caps.length && i < pts3D.length; i++) {
        st.caps[i].position.copy(pts3D[i]);
      }
      st.endNodePos = _endNodePos3D(trunk)?.clone() || null;
    } else {
      _rebuildTrunk(trunk);
    }
  }
}

// 绘制中追加一段：增量创建新段连线 + 末端封口球
// （新点会使上一段末端切线由镜像点变为真实点 → 上一段刷新采样）
function _appendTrunkSegment(trunk, st) {
  const pts = trunk.points;
  const pts3D = _trunkPts3D(trunk);
  const prevIdx = st.lines.length - 1;
  if (prevIdx >= 0 && st.lines[prevIdx] && pts.length >= 3) {
    st.lines[prevIdx].updatePositions(_samplesFor(trunk, pts3D, prevIdx));
  }
  const newIdx = pts.length - 2;
  if (pts3D[newIdx].distanceTo(pts3D[newIdx + 1]) < 1e-4) {
    st.lines.push(null);
  } else {
    st.lines.push(_makeSegLine(trunk, newIdx));
  }
  st.caps.push(_makeCapSphere(pts3D[pts.length - 1]));
  st.count = pts.length;
}

// 重建主干的 3D 渲染（提交线段 / 加载项目 / 撤销重做 / 段元数据变化后调用）
// force=true：忽略引用与数量比对，强制全部重建
export function rebuildFishbone3D(force = false) {
  if (!appState.scene || !appState.glowTex) return;
  const trunks = appState.fishboneTrunks || [];
  const hidden = getFishboneHiddenTrunkIds();   // 被折叠隐藏的干线不参与渲染（alive 检查自动清场）
  const alive = new Set();

  for (const trunk of trunks) {
    if (!trunk.layerId) trunk.layerId = appState.currentLayerId;   // 旧数据惰性迁移：打上当前图层
    if (hidden.has(trunk.id)) continue;
    alive.add(trunk.id);
    _normalizeSegs(trunk);
    const pts = trunk.points || [];
    const st = _trunkState.get(trunk.id);

    // 未变化：跳过
    if (!force && st && st.ref === trunk && pts.length === st.count) continue;

    // 绘制中追加一段（主干对象引用未变 = 未经历撤销/重载）：增量
    if (!force && st && st.ref === trunk && pts.length === st.count + 1) {
      _appendTrunkSegment(trunk, st);
    } else {
      _rebuildTrunk(trunk);   // 其余情况（新建 / 撤销缩点 / 对象被替换 / force）
    }
  }

  // 清理已不存在的主干（切换项目等）
  for (const [id, st] of [..._trunkState]) {
    if (!alive.has(id)) {
      _disposeTrunkRender(st);
      _trunkState.delete(id);
    }
  }

  _rebuildFlatItems();
  _refreshHighlight();
}

// ── 段级查找 / 高亮 ──

export function findFishboneSegLine(trunkId, segId) {
  const st = _trunkState.get(trunkId);
  if (!st) return null;
  for (const line of st.lines) {
    if (line && line.mesh.userData.segId === segId) return line;
  }
  return null;
}

// 折叠/展开动画：按干线设置透明度（段连线 + 封口球 + 泛光/粒子同步渐隐渐显）
export function setFishboneTrunkOpacity(trunkId, opacity) {
  const st = _trunkState.get(trunkId);
  if (!st) return;
  for (const line of st.lines) {
    if (!line) continue;
    line.setOpacity(opacity);
    if (line.glowTube && line.glowTube.material) {
      line.glowTube.material.transparent = true;
      line.glowTube.material.opacity = opacity * 0.9;
    }
    if (line.particlePoints && line.particlePoints.material) {
      line.particlePoints.material.transparent = true;
      line.particlePoints.material.opacity = opacity;
    }
  }
  for (const cap of st.caps) {
    if (!cap.material) continue;
    cap.material.transparent = true;
    cap.material.opacity = opacity;
  }
}

// 高亮染色 / 恢复（黄色高亮；恢复时回到默认彩虹或段自定义色）
function _applySegTint(line, tinted) {
  if (!line || !line.mesh || !line.mesh.material) return;
  const meshMat = line.mesh.material;
  if (tinted) {
    meshMat.color.set(0xFFD700);
    meshMat.emissive.set(0xCCAA00);
    if (line.glowTube) line.glowTube.material.color.set(0xFFE066);
    if (line.particlePoints) line.particlePoints.material.color.set(0xFFE066);
    return;
  }
  const custom = line.mesh.userData.customColor;
  if (custom) {
    line.setCustomColor(new THREE.Color(custom));   // 恢复自定义色
  } else {
    meshMat.color.set(0xffffff);
    meshMat.emissive.set(0x996688);
    if (line.glowTube) line.glowTube.material.color.set(0xffffff);
    if (line.particlePoints) line.particlePoints.material.color.set(0xffffff);
  }
}

// 点击选中：黄色高亮指定段（2D/3D 共用 selectedSeg 状态）
export function highlightFishboneSeg(trunkId, segId) {
  clearFishboneSegHighlight();
  setSelectedSeg({ trunkId, segId });
  const line = findFishboneSegLine(trunkId, segId);
  if (line) _applySegTint(line, true);
}

// 清除高亮（tooltip 关闭 / 删除段时调用）
export function clearFishboneSegHighlight() {
  if (!selectedSeg) return;
  const line = findFishboneSegLine(selectedSeg.trunkId, selectedSeg.segId);
  if (line) _applySegTint(line, false);
  setSelectedSeg(null);
}

// 重建后恢复高亮（段仍存在则重新染色，不存在则清除）
function _refreshHighlight() {
  if (!selectedSeg) return;
  const line = findFishboneSegLine(selectedSeg.trunkId, selectedSeg.segId);
  if (!line) { setSelectedSeg(null); return; }
  _applySegTint(line, true);
}

// 单段刷新：段元数据（颜色 reset 等）变化后重建该段连线
// （PolylineFlowLine.setCustomColor(null) 是 no-op，无法直接恢复彩虹默认色）
export function refreshFishboneSeg(trunkId, segIndex) {
  const trunk = (appState.fishboneTrunks || []).find(t => t.id === trunkId);
  if (!trunk) return;
  const st = _trunkState.get(trunkId);
  if (!st || st.ref !== trunk || st.count !== (trunk.points || []).length) {
    rebuildFishbone3D();   // 状态不一致 → 整体重建兜底
    return;
  }
  if (segIndex < 0 || segIndex >= st.lines.length) return;
  const arr = _ensureFlatItems();
  const old = st.lines[segIndex];
  if (old) {
    const fi = arr.findIndex(it => it.line === old);
    if (fi >= 0) arr.splice(fi, 1);
    old.dispose();
  }
  const pts3D = _trunkPts3D(trunk);
  if (pts3D[segIndex].distanceTo(pts3D[segIndex + 1]) < 1e-4) {
    st.lines[segIndex] = null;
  } else {
    const line = _makeSegLine(trunk, segIndex);
    st.lines[segIndex] = line;
    arr.push({ trunkId, line });
  }
}

// ============================================================
//  排列方式切换动画：鱼骨线随节点同步平滑移动
//  - 快照须在 layer3DLayout 翻转前调用（捕获当前模式渲染点）
//  - 目标点按目标模式参数化计算（不读运行中的 appState.layer3DLayout）
//  - move 阶段逐帧 lerp 直接刷新段管线/封口球，与节点同一缓动；
//    期间抑制本文件的层签名重建 / 2D 同步 / 节点跟随，结束后强制重建落定
// ============================================================
const _fbArrangeAnim = { active: false, items: [] };   // items: [{ trunk, start: Vector3[], target: Vector3[] }]

// 参数化图层平面高度（与 fishboneLayerY 同式，但层间距显式传入）
function _fishboneLayerYWith(layerId, spacing) {
  const sortedLayers = [...appState.layers].sort((a, b) => a.order - b.order);
  const idx = sortedLayers.findIndex(l => l.id === layerId);
  return idx >= 0 ? idx * (spacing || 4) : FISHBONE_3D_Y;
}

// 参数化骨架点：layered=true → 2D 映射；false → 随机骨架。
// nodeOverride：末端连节点时用返回值覆盖末点（球心跟随，与 _trunkPts3D 一致）
function _pts3DMode(trunk, layered, spacing, nodeOverride) {
  const pts = trunk.points || [];
  let pts3D;
  if (layered) {
    const layerY = _fishboneLayerYWith(trunk.layerId, spacing);
    pts3D = pts.map(p => new THREE.Vector3(p.x * FISHBONE_3D_SCALE, layerY, p.y * FISHBONE_3D_SCALE));
  } else {
    pts3D = computeFishboneSkeleton3D(trunk);
  }
  if (nodeOverride && pts3D.length >= 2) {
    const np = nodeOverride();
    if (np) pts3D[pts3D.length - 1] = np.clone();
  }
  return pts3D;
}

// 排列动画开始：捕获所有干线当前模式的渲染点（须在 layer3DLayout 翻转前调用）
export function snapshotFishboneArrangeStart() {
  cancelFishboneArrangeAnimation();
  const trunks = appState.fishboneTrunks || [];
  for (const trunk of trunks) {
    if (!(trunk.points || []).length) continue;
    _fbArrangeAnim.items.push({
      trunk,
      start: _pts3DMode(trunk, appState.layer3DLayout, appState.layer3DSpacing || 4,
        () => appState.positions.get(trunk.endNodeId))
    });
  }
}

// 排列动画目标：按目标模式参数化计算渲染点（末点取节点目标位，与节点动画终点一致）
export function finishFishboneArrangeTarget(targetLayered, targetSpacing) {
  if (!_fbArrangeAnim.items.length) return;
  const targets = appState._arrangeTargetPositions;
  for (const item of _fbArrangeAnim.items) {
    item.target = _pts3DMode(item.trunk, targetLayered, targetSpacing,
      () => (targets && targets.get(item.trunk.endNodeId)) || appState.positions.get(item.trunk.endNodeId));
  }
  _fbArrangeAnim.active = true;
}

// move 阶段逐帧调用：与节点同一 eased 线性插值，直接刷新段管线采样与封口球
export function updateFishboneArrangeAnimation(eased) {
  if (!_fbArrangeAnim.active) return;
  for (const item of _fbArrangeAnim.items) {
    const st = _trunkState.get(item.trunk.id);
    if (!st || st.ref !== item.trunk) continue;
    const n = Math.min(item.start.length, item.target.length);
    if (n < 2) continue;
    const pts = new Array(n);
    for (let i = 0; i < n; i++) pts[i] = item.start[i].clone().lerp(item.target[i], eased);
    for (let i = 0; i < n - 1 && i < st.lines.length; i++) {
      if (st.lines[i]) st.lines[i].updatePositions(_segSamplePoints(pts, i));
    }
    for (let i = 0; i < st.caps.length && i < n; i++) {
      st.caps[i].position.copy(pts[i]);
    }
  }
}

// 结束/跳过：清状态（随后由 rebuildFishbone3D(true) 落到最终渲染）
export function cancelFishboneArrangeAnimation() {
  _fbArrangeAnim.active = false;
  _fbArrangeAnim.items = [];
}

// ── 折叠支路衔接处的呼吸光圆环 ──
// collapsed 干线（自身未被折叠隐藏）的每个直接子支叉点处放一组光效：
// 有轴向厚度的发光环带（套在管线上，沿干线方向有宽度、两端渐隐）
// + 更长的柔光柱壳包裹叉点；
// 尺寸正弦呼吸 + 色相循环流动 + 透明度同步脉动，标记"此处有折叠的支路"（展开入口）；
// 嵌套折叠时只在最外层折叠处放（自身已被隐藏的干线不放，防止悬空）
const _collapseRings = new Map();   // 子支 trunk.id → { ring, glow, phase }
let _ringGeometry = null;
let _glowGeometry = null;
let _glowTex = null;

// 子支 id 哈希 → 0~6.28 相位（多环错峰呼吸/变色）
function _hashPhase(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 628) / 100;
}

// 光柱壳贴图：沿轴线两端渐隐的白色渐变（additive 下 black = 透明）
function _makeGlowTex() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.85)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 64);
  return new THREE.CanvasTexture(c);
}

// 子支在父干线上的叉点位姿：位置 = 骨架首点；轴 = 父干线在叉点处的段方向
//（环带/光柱均以 +Z 为轴向，对齐干线方向 → 套在管线上；方向解析失败时保持原朝向）
const _RING_AXIS = new THREE.Vector3(0, 0, 1);   // 环带/光柱共用轴向
function _forkPose3D(branch) {
  const pts3D = _trunkPts3D(branch);
  if (pts3D.length < 2) return null;
  return { pos: pts3D[0], dir: _branchStartDir3(branch, pts3D) };
}

function _syncCollapseRings(tm) {
  const trunks = appState.fishboneTrunks || [];
  const hidden = getFishboneHiddenTrunkIds();
  const wanted = new Set();
  for (const P of trunks) {
    if (!P.collapsed || hidden.has(P.id)) continue;
    for (const C of trunks) {
      if (C.parentId !== P.id) continue;
      wanted.add(C.id);
      let r = _collapseRings.get(C.id);
      if (!r) {
        // 共享几何/贴图惰性创建：
        //  环带 = 有轴向厚度的圆筒（沿干线方向的宽度），套在管线上，两端沿轴渐隐；
        //  光柱壳 = 更长的柔光筒包裹叉点
        if (!_ringGeometry) {
          _ringGeometry = new THREE.CylinderGeometry(0.16, 0.16, 0.14, 48, 1, true);
          _ringGeometry.rotateX(Math.PI / 2);   // 轴向 Y → Z，与环法线一致
          _glowGeometry = new THREE.CylinderGeometry(0.1, 0.1, 0.6, 24, 1, true);
          _glowGeometry.rotateX(Math.PI / 2);
          _glowTex = _makeGlowTex();
        }
        const ringMesh = new THREE.Mesh(_ringGeometry, new THREE.MeshBasicMaterial({
          map: _glowTex, transparent: true, opacity: 0.8, side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending, depthWrite: false
        }));
        const glowMesh = new THREE.Mesh(_glowGeometry, new THREE.MeshBasicMaterial({
          map: _glowTex, transparent: true, opacity: 0.35, side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending, depthWrite: false
        }));
        ringMesh.renderOrder = 5;
        glowMesh.renderOrder = 5;
        appState.scene.add(ringMesh);
        appState.scene.add(glowMesh);
        r = { ring: ringMesh, glow: glowMesh, phase: _hashPhase(C.id) };
        _collapseRings.set(C.id, r);
      }
    }
  }
  for (const [id, r] of _collapseRings) {
    if (wanted.has(id)) continue;
    appState.scene.remove(r.ring);
    appState.scene.remove(r.glow);
    r.ring.material.dispose();   // 几何/贴图共享不释放，材质独立释放
    r.glow.material.dispose();
    _collapseRings.delete(id);
  }
  // 逐帧动画：位置/朝向跟随叉点轴线 + 呼吸 + 色相流动（环与光柱同步）
  for (const [id, r] of _collapseRings) {
    const C = trunks.find(t => t.id === id);
    const fd = C ? _forkPose3D(C) : null;
    if (fd) {
      r.ring.position.copy(fd.pos);
      r.glow.position.copy(fd.pos);
      if (fd.dir) {
        r.ring.quaternion.setFromUnitVectors(_RING_AXIS, fd.dir);
        r.glow.quaternion.copy(r.ring.quaternion);
      }
    }
    const s = 1 + 0.22 * Math.sin(tm * 2.6 + r.phase);
    const hue = ((tm * 0.1 + r.phase * 0.1) % 1 + 1) % 1;
    r.ring.scale.setScalar(s);
    r.glow.scale.setScalar(s);
    r.ring.material.color.setHSL(hue, 0.85, 0.62);
    r.glow.material.color.setHSL(hue, 0.85, 0.62);
    r.ring.material.opacity = 0.6 + 0.3 * Math.sin(tm * 2.6 + r.phase);
    r.glow.material.opacity = 0.25 + 0.15 * Math.sin(tm * 2.6 + r.phase);
  }
}

// 每帧更新（module14 主循环调用，与普通连线同步流光/粒子动画）
export function updateFishbone3D(tm) {
  // 图层布局变化（切换排列模式/层序调整/层间距变化/干线图层迁移）→ 按新层高强制重建
  // （排列动画期间由 updateFishboneArrangeAnimation 逐帧接管，抑制重建）
  if (!_fbArrangeAnim.active) {
    const layerKey = appState.layer3DLayout + '|' + (appState.layer3DSpacing || 4) + '|' +
      appState.layers.map(l => l.id + ':' + (l.order ?? 0)).join(',') + '|' +
      (appState.fishboneTrunks || []).map(t => t.layerId || '').join(',');
    if (layerKey !== _layer3DKey) {
      _layer3DKey = layerKey;
      rebuildFishbone3D(true);
    }
  }

  // 折叠可见性：刷新缓存 + 强制隐藏被折叠的末端节点及其树后代
  // （仅强制隐藏不强制显示，展开时由操作显式恢复，避免与图层系统抢占显隐权）
  refreshFishboneHiddenCache();
  for (const id of getFishboneHiddenNodeIds()) {
    // 折叠动画进行中的节点由动画接管显隐（渐隐完成后注册表过期，自动恢复强制隐藏）
    if (getFishboneAnimState(id)) continue;
    const obj = appState.nodeMeshes.get(id);
    if (obj && obj.mesh.visible) {
      obj.mesh.visible = false;
      if (obj.label) obj.label.visible = false;
    }
  }

  // 折叠支路衔接处的呼吸光圆环（叉点位置 / 呼吸缩放 / 色相流动逐帧更新）
  _syncCollapseRings(tm);

  // 先同步节点连接端点：2D 中拖过节点后切到 3D，此处重建受影响 trunk 保持连接
  // （排列动画期间跳过，防止重建覆盖逐帧插值）
  if (!_fbArrangeAnim.active && syncFishboneNodeLinks()) {
    for (const trunk of (appState.fishboneTrunks || [])) {
      if (!trunk.endNodeId) continue;
      const st = _trunkState.get(trunk.id);
      if (st && st.ref === trunk) _rebuildTrunk(trunk);
    }
    _rebuildFlatItems();
  }

  // 3D 拖动节点跟随：endNodeId 分支终点实时接到节点球心
  // （move-core 3D 移动模式拖动时每帧更新 appState.positions，此处检测变化并更新最后一段；
  //   排列动画期间跳过 —— 末点已由排列动画按节点同缓动插值接管）
  if (!_fbArrangeAnim.active) {
    for (const st of _trunkState.values()) {
      const trunk = st.ref;
      if (!trunk || !trunk.endNodeId) continue;
      const nodePos = appState.positions.get(trunk.endNodeId);
      if (!nodePos) continue;
      if (st.endNodePos && st.endNodePos.distanceToSquared(nodePos) < 1e-10) continue;
      const lastIdx = st.lines.length - 1;
      if (lastIdx >= 0 && st.lines[lastIdx]) {
        const pts3D = _trunkPts3D(trunk);
        if (pts3D.length >= 2 &&
            pts3D[pts3D.length - 2].distanceTo(pts3D[pts3D.length - 1]) >= 1e-4) {
          st.lines[lastIdx].updatePositions(_samplesFor(trunk, pts3D, lastIdx));
        }
      }
      // 末端封口球同步到球心（与线终点一致）
      if (st.caps.length) st.caps[st.caps.length - 1].position.copy(nodePos);
      st.endNodePos = nodePos.clone();
    }
  }

  for (const fit of _ensureFlatItems()) {
    if (fit.line && fit.line.mesh.visible) fit.line.update(tm);
  }
}

// ── 3D 分支/节点创建：射线拾取鱼骨段管线 ──
// 返回 { trunk, segIndex, t, point(2D 吸附点), point3(骨架上精确叉点) }；未命中返回 null。
// 直接对可见段管线（含辉光管）求交，随机/图层两模式均所见即所得
export function pickFishboneSeg3D(e) {
  const dom = appState.renderer?.domElement;
  if (!dom || !appState.camera) return null;
  const ndc = new THREE.Vector2(
    (e.clientX / dom.clientWidth) * 2 - 1,
    -(e.clientY / dom.clientHeight) * 2 + 1
  );
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, appState.camera);

  // 命中对象 → { trunkId, segIndex }（辉光管与主管线属同一段）
  const byObj = new Map();
  for (const [, st] of _trunkState) {
    for (const line of st.lines) {
      if (!line || !line.mesh) continue;
      const si = line.mesh.userData.segIndex;
      if (line.mesh.visible) byObj.set(line.mesh, { trunkId: line.mesh.userData.trunkId, segIndex: si });
      if (line.glowTube && line.glowTube.visible) byObj.set(line.glowTube, { trunkId: line.mesh.userData.trunkId, segIndex: si });
    }
  }
  if (!byObj.size) return null;
  const hits = ray.intersectObjects([...byObj.keys()], false);
  for (const h of hits) {
    const entry = byObj.get(h.object);
    if (!entry) continue;
    const trunk = (appState.fishboneTrunks || []).find(t => t.id === entry.trunkId);
    if (!trunk) continue;
    const pts3D = _trunkPts3D(trunk);
    const si = entry.segIndex;
    if (si < 0 || si >= pts3D.length - 1) continue;
    const a3 = pts3D[si], b3 = pts3D[si + 1];
    const segLen2 = a3.distanceToSquared(b3);
    const t = segLen2 < 1e-10 ? 0
      : Math.max(0, Math.min(1, h.point.clone().sub(a3).dot(b3.clone().sub(a3)) / segLen2));
    const pa = (trunk.points || [])[si], pb = (trunk.points || [])[si + 1];
    if (!pa || !pb) continue;
    return {
      trunk, segIndex: si, t,
      point: { x: pa.x + (pb.x - pa.x) * t, y: pa.y + (pb.y - pa.y) * t },
      point3: a3.clone().lerp(b3, t)
    };
  }
  return null;
}

// 拖拽预览线（interaction.js 在 3D 模式 pointermove 时调用；主干绘制与分支绘制共用）
export function updateFishbone3DPreview() {
  // 分支绘制与主干绘制互斥，取当前活动的一组预览起终点
  const branchActive = isDraggingBranch && branchHit && branchCurrent;
  const segActive = isDraggingSeg && segStart && segCurrent;
  const a2d = branchActive ? branchHit.point : segStart;
  const b2d = branchActive ? branchCurrent : segCurrent;
  if ((!branchActive && !segActive) || !a2d || !b2d || !appState.scene) {
    hideFishbone3DPreview();
    return;
  }
  if (!_previewLine) {
    const geom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const mat = new THREE.LineBasicMaterial({
      color: 0xffe9b3, transparent: true, opacity: 0.9, depthWrite: false
    });
    _previewLine = new THREE.Line(geom, mat);
    _previewLine.renderOrder = 6;
    _previewLine.visible = false;
    appState.scene.add(_previewLine);
  }
  const posAttr = _previewLine.geometry.attributes.position;
  let a, b;
  if (segActive && !appState.layer3DLayout && draw3DFrame) {
    // 随机模式 3D 画线：预览线落在相机前取景帧上（与提交后的骨架轨迹严格一致）
    a = fishboneFramePoint3D(a2d);
    b = fishboneFramePoint3D(b2d);
  } else if (branchActive && !appState.layer3DLayout && draw3DFrame) {
    // 随机模式分支：起点钉在父干线骨架叉点，终点 = 叉点 + 帧位移
    //（与提交时种子的 _3dOff=[0,0,0] + dirs3D=[帧方向] 严格一致）
    const bt = (appState.fishboneTrunks || []).find(t => t.id === branchHit.trunkId);
    const pts3D = bt ? _trunkPts3D(bt) : null;
    if (pts3D && pts3D.length >= 2 && branchHit.segIndex < pts3D.length - 1) {
      a = pts3D[branchHit.segIndex].clone().lerp(pts3D[branchHit.segIndex + 1], branchHit.t);
      b = a.clone().add(fishboneFrameVec3(b2d.x - a2d.x, b2d.y - a2d.y));
    } else {
      a = trunkPointTo3D(a2d, FISHBONE_3D_Y);
      b = trunkPointTo3D(b2d, FISHBONE_3D_Y);
    }
  } else {
    // 图层模式：分支/节点创建落源干线所属图层平面；主干绘制落当前图层平面
    const srcTrunk = branchActive ? (appState.fishboneTrunks || []).find(t => t.id === branchHit.trunkId) : null;
    const layerY = srcTrunk ? fishboneLayerY(srcTrunk.layerId) : fishboneLayerY(appState.currentLayerId);
    a = trunkPointTo3D(a2d, layerY);
    b = trunkPointTo3D(b2d, layerY);
  }
  posAttr.setXYZ(0, a.x, a.y, a.z);
  posAttr.setXYZ(1, b.x, b.y, b.z);
  posAttr.needsUpdate = true;
  _previewLine.visible = true;
}

export function hideFishbone3DPreview() {
  if (_previewLine) _previewLine.visible = false;
}
