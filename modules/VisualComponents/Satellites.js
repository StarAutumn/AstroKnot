// ============================================================
//  VisualComponents / Satellites.js — 折叠父节点的旋转小卫星
//  3D 中被折叠的父节点（toggleChildren 隐藏其后代，判定方式与
//  expandAllNodes 一致：第一个子节点 mesh 不可见）周围放一组
//  绕球自由旋转的小卫星：
//    - 样式与连线螺旋粒子同款：单点 THREE.Points + PointsMaterial
//      （glowTex 辉光贴图 / size 0.38 略大于粒子 / 加法混合）
//    - 色相随时间流动（各卫星相位错开）
//    - 每颗卫星随机轨道平面 / 半径 / 角速度（方向随机）→ 自由旋转
//    - 数量 = 该节点折叠隐藏的后代节点数（嵌套折叠全部计入）
//  每帧由 module14 调用 updateNodeSatellites(tm)：折叠集合比对自愈
//  （展开 → 卫星移除；再折叠 → 重建），无需事件挂钩
// ============================================================
import * as THREE from 'three';
import { appState } from '../module0_AppState.js';
import { countDescendants } from '../TreeData/data-factory.js';

// 卫星数量软上限（防极端大子树一次生成过多光点）
const _MAX_SATS = 200;

const _sats = new Map();   // 父节点 id → { items: [{points,u,v,radius,speed,phase,hueOff}], count }
let _satGeometry = null;   // 共享单顶点几何（光点位置由 Object3D.position 控制）
const _tmpPos = new THREE.Vector3();

// 随机单位向量（轨道平面法向）
function _randomUnit() {
  const u = Math.random() * 2 - 1;
  const phi = Math.PI * 2 * Math.random();
  const s = Math.sqrt(1 - u * u);
  return new THREE.Vector3(s * Math.cos(phi), u, s * Math.sin(phi));
}

// 创建卫星组并按后代数填充
function _createSatGroup(id, node) {
  const grp = { items: [], count: 0 };
  _sats.set(id, grp);
  _resizeSatGroup(grp, countDescendants(node), node);
  return grp;
}

// 增量调整卫星数量（新增随机轨道，删除从尾部弹出）
function _resizeSatGroup(grp, count, node) {
  count = Math.max(0, Math.min(count, _MAX_SATS));
  while (grp.items.length > count) {
    const s = grp.items.pop();
    appState.scene.remove(s.points);
    s.points.material.dispose();   // 几何共享不释放
  }
  // 轨道半径控制在节点圆环之内：球面外沿 → 圆环半径之间
  //（节点圆环半径 = NODE_RADIUS + 0.22，见 nodes/mesh.js TorusGeometry）
  const nodeR = appState.NODE_RADIUS * (node.sizeScale || 1);
  const ringR = nodeR + 0.22;
  while (grp.items.length < count) {
    if (!_satGeometry) {
      _satGeometry = new THREE.BufferGeometry();
      _satGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
    }
    // 与连线螺旋粒子同款的光点材质，尺寸单独调大（卫星观感比粒子略大）
    const mat = new THREE.PointsMaterial({
      map: appState.glowTex,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      size: 0.38,
      sizeAttenuation: true,
      opacity: 1
    });
    const points = new THREE.Points(_satGeometry, mat);
    points.frustumCulled = false;
    appState.scene.add(points);
    // 随机轨道平面 → 平面内正交基 (u, v)，圆周运动 = cos·u + sin·v
    const n = _randomUnit();
    const ref = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const u = new THREE.Vector3().crossVectors(ref, n).normalize();
    const v = new THREE.Vector3().crossVectors(n, u).normalize();
    grp.items.push({
      points, u, v,
      radius: nodeR + 0.08 + Math.random() * Math.max(0.05, ringR - nodeR - 0.1),
      speed: (0.5 + Math.random() * 1.1) * (Math.random() < 0.5 ? -1 : 1),
      phase: Math.random() * Math.PI * 2,
      hueOff: Math.random()
    });
  }
  grp.count = count;
}

function _disposeGroup(id, grp) {
  for (const s of grp.items) {
    appState.scene.remove(s.points);
    s.points.material.dispose();
  }
  _sats.delete(id);
}

// 每帧同步 + 动画（module14 主循环调用）
export function updateNodeSatellites(tm) {
  if (!appState.scene) return;

  // 折叠父节点收集（判定与 toggleChildren/expandAllNodes 一致）
  const seen = new Set();
  for (const [id, node] of appState.nodeMap) {
    if (!node.children || !node.children.length) continue;
    const firstObj = appState.nodeMeshes.get(node.children[0].id);
    if (!firstObj || firstObj.mesh.visible) continue;   // 未折叠
    seen.add(id);
    const grp = _sats.get(id);
    if (!grp) {
      _createSatGroup(id, node);
    } else {
      const real = countDescendants(node);
      if (real !== grp.count) _resizeSatGroup(grp, real, node);
    }
  }
  for (const [id, grp] of _sats) {
    if (!seen.has(id)) _disposeGroup(id, grp);   // 已展开 → 移除卫星
  }

  // 逐帧动画：绕节点球心圆周运动 + 色相流动
  for (const [id, grp] of _sats) {
    const obj = appState.nodeMeshes.get(id);
    if (!obj || !obj.mesh.visible) {
      for (const s of grp.items) s.points.visible = false;   // 父节点隐藏时卫星跟随隐藏
      continue;
    }
    const p = obj.mesh.position;
    for (const s of grp.items) {
      s.points.visible = true;
      const ang = s.phase + tm * s.speed;
      _tmpPos.copy(s.u).multiplyScalar(Math.cos(ang) * s.radius);
      _tmpPos.addScaledVector(s.v, Math.sin(ang) * s.radius);
      s.points.position.copy(p).add(_tmpPos);
      s.points.material.color.setHSL(((tm * 0.12 + s.hueOff) % 1 + 1) % 1, 0.9, 0.62);
    }
  }
}

