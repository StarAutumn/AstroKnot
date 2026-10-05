// ============================================================
//  Fishbone / interaction.js — 主干绘制交互（2D/3D 通用）
//  在 document 捕获阶段拦截鼠标事件：
//    - 绘制模式下左键按下 → 拖动 → 松开 生成一条线段
//    - 松手后可从线段末端继续分段绘制
//    - 右键 / Esc 退出绘制模式
//  捕获阶段拦截可先于 2D 画布处理器与 3D OrbitControls / 长按旋转执行
// ============================================================

import * as THREE from 'three';
import { appState } from '../module0_AppState.js';
import { canvas, transform } from '../2DView/shared.js';
import { mark2DDirty, draw } from '../2DView/render/index.js';
import { withHistory } from '../module3_History.js';
import { saveCurrentProjectData } from '../TreeData/index.js';
import {
  trunkDrawMode, isDraggingSeg, segStart, segCurrent, downClient, currentTrunk,
  setCurrentTrunk, setDraggingSeg, setSegStart, setSegCurrent, setDownClient, resetDrawState,
  branchDrawMode, nodeCreateMode, isDraggingBranch, branchHit, branchCurrent,
  setDraggingBranch, setBranchHit, setBranchCurrent, resetBranchDragState,
  draw3DFrame, setDraw3DFrame
} from './state.js';
import { cancelTrunkDrawMode, cancelBranchDrawMode, cancelFishboneNodeCreateMode } from './mode.js';
import { addFishboneBranchWithHistory, addFishboneNodeWithHistory } from './ops.js';
import {
  rebuildFishbone3D, updateFishbone3DPreview, trunkPointFrom3D,
  FISHBONE_3D_SCALE, fishboneFramePoint3D, fishboneFrameVec3,
  pickFishboneSeg3D, fishboneLayerY
} from './render3d.js';
import { projectOnFishboneSeg2D } from './render2d.js';
import { showToast } from '../SelectAndEdit/index.js';

let _listenersBound = false;

// 随机模式 3D 分支拖拽状态：叉点 3D 位置 + 叉点在取景帧上的局部锚点
// （拖拽位移 = 帧局部 2D 位移 → 提交时种子 _3dOff=[0,0,0] + dirs3D=[帧方向]）
let _branch3D = null;

// ---------- 随机模式 3D 画线：相机前取景帧 ----------

// 在相机前方固定距离捕获取景平面正交基（取景距离 5 单位，比新建节点的 10 更近，
// 画线视野更大、轨迹更跟手）：一次绘制会话只捕获一次，
// 整个会话的所有线段落在同一取景平面上
function _captureDraw3DFrame() {
  const cam = appState.camera;
  if (!cam) return;
  const normal = new THREE.Vector3();
  cam.getWorldDirection(normal);   // 相机视轴 = 帧法线
  const center = cam.position.clone().addScaledVector(normal, 5);
  let right = new THREE.Vector3().crossVectors(normal, new THREE.Vector3(0, 1, 0));
  if (right.lengthSq() < 1e-6) right = new THREE.Vector3().crossVectors(normal, new THREE.Vector3(0, 0, 1));
  right.normalize();
  const up = new THREE.Vector3().crossVectors(right, normal).normalize();
  setDraw3DFrame({ center, normal, right, up });
}

// 帧局部 2D 位移 → 单位 3D 方向（提交时逐段固化进 dirs3D，轨迹即骨架）
function _dir3(p, q) {
  return fishboneFrameVec3(p.x - q.x, p.y - q.y).normalize().toArray();
}

// ---------- 坐标换算 ----------

// 指针射线 ∩ 取景帧 → 帧局部 2D 坐标（随机模式主干画线与分支拖拽共用）
function _rayToFrameLocal(e) {
  const dom = appState.renderer?.domElement;
  if (!dom || !appState.camera || !draw3DFrame) return null;
  const ndc = new THREE.Vector2(
    (e.clientX / dom.clientWidth) * 2 - 1,
    -(e.clientY / dom.clientHeight) * 2 + 1
  );
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, appState.camera);
  const f = draw3DFrame;
  const hit = new THREE.Vector3();
  if (!ray.ray.intersectPlane(new THREE.Plane(f.normal, -f.normal.dot(f.center)), hit)) return null;
  const local = hit.sub(f.center);
  return {
    x: local.dot(f.right) / FISHBONE_3D_SCALE,
    y: local.dot(f.up) / FISHBONE_3D_SCALE
  };
}

// 指针射线 ∩ 指定高度水平面 → 2D 世界坐标（3D 分支/节点创建按源干线图层换算）
function _eventToPlane2D(e, layerY) {
  const dom = appState.renderer?.domElement;
  if (!dom || !appState.camera) return null;
  const ndc = new THREE.Vector2(
    (e.clientX / dom.clientWidth) * 2 - 1,
    -(e.clientY / dom.clientHeight) * 2 + 1
  );
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, appState.camera);
  const hit = new THREE.Vector3();
  if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -layerY), hit)) return null;
  return trunkPointFrom3D(hit);
}

// 绘制模式下接收指针事件的目标元素（2D 画布 或 3D 渲染器）
function _activeDrawDom() {
  if (appState.is2DView) return canvas || null;
  return appState.renderer?.domElement || null;
}

// 事件 → 主干 2D 世界坐标（2D：画布变换反算；3D：射线与水平面求交）
function _eventToTrunk2D(e) {
  if (appState.is2DView && canvas) {
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    return {
      x: (cx - canvas.width / 2 - transform.offsetX) / transform.scale,
      y: (cy - canvas.height / 2 - transform.offsetY) / transform.scale
    };
  }
  // 随机模式 3D 画线：指针射线与相机前取景帧求交 → 帧局部 2D 坐标
  // （仅主干绘制使用；分支/节点创建走射线拾取或源干线图层平面换算）
  if (trunkDrawMode && !appState.layer3DLayout && draw3DFrame) {
    return _rayToFrameLocal(e);
  }
  return _eventToPlane2D(e, fishboneLayerY(appState.currentLayerId));
}

// ---------- 线段提交（含撤销/重做） ----------

const commitSegment = withHistory(function (a, b) {
  // 一次绘制会话 = 一条主干（mode.js 进入模式时已将 currentTrunk 置空）
  // 撤销/重做会深拷贝替换主干数组，旧 currentTrunk 引用失效 → 自动开新主干
  const existing = appState.fishboneTrunks || (appState.fishboneTrunks = []);
  let trunk = (currentTrunk && existing.includes(currentTrunk)) ? currentTrunk : null;
  if (!trunk) {
    trunk = { id: 'trunk_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), points: [], layerId: appState.currentLayerId };
    existing.push(trunk);
    setCurrentTrunk(trunk);
  }

  const pts = trunk.points;
  const last = pts[pts.length - 1];
  // 随机模式 3D 画线：逐段固化 3D 骨架（dirs3D 与段数同步），
  // 首段起点存 _3dPos；dir = normalize(帧位移)，长度 = |2D 位移|×SCALE → 骨架 ≡ 鼠标轨迹
  const frameOn = !appState.layer3DLayout && draw3DFrame;
  if (frameOn) {
    if (!pts.length) trunk._3dPos = fishboneFramePoint3D(a).toArray();
    if (!Array.isArray(trunk.dirs3D)) trunk.dirs3D = [];
  }
  // 段起点与上一段末端重合 → 接续分段；不重合 → 形成分支跳线
  if (!last || Math.hypot(last.x - a.x, last.y - a.y) > 0.5) {
    if (frameOn && last) trunk.dirs3D.push(_dir3(a, last));   // 跳线段方向
    pts.push({ x: a.x, y: a.y });
  }
  if (frameOn) trunk.dirs3D.push(_dir3(b, a));
  pts.push({ x: b.x, y: b.y });

  rebuildFishbone3D();
  saveCurrentProjectData();
});

// 随机模式分支 3D 种子：_3dOff 归零（起点钉在叉点）+ dirs3D = 帧位移方向，
// 使提交后的骨架严格等于拖拽轨迹（段长 = 2D 段长 × SCALE 的性质保持）
function _branchSeed3D(hit, b) {
  if (!hit || !hit.point || !b) return null;
  if (Math.hypot(b.x - hit.point.x, b.y - hit.point.y) < 1e-6) return null;
  return { off: [0, 0, 0], dirs: [_dir3(b, hit.point)] };
}

// ---------- 事件处理（document 捕获阶段） ----------

function _onPointerDown(e) {
  if (e.button !== 0) return;
  const dom = _activeDrawDom();
  if (!dom || e.target !== dom) return;   // 点在画布/渲染器之外不接管

  // ── 分支 / 节点创建：仅在鱼骨线段上按下时接管（自动吸附投影点），空白处放行常规行为 ──
  if (branchDrawMode || nodeCreateMode) {
    if (!appState.is2DView) {
      // 3D：射线直接拾取可见段管线（随机/图层模式均所见即所得）
      const pick = pickFishboneSeg3D(e);
      if (!pick) return;
      e.preventDefault();
      e.stopPropagation();
      setBranchHit({ trunkId: pick.trunk.id, segIndex: pick.segIndex, t: pick.t, point: pick.point });
      setBranchCurrent(pick.point);
      setDraggingBranch(true);
      setDownClient({ x: e.clientX, y: e.clientY });
      // 随机模式：捕获取景帧，记录叉点在帧上的局部锚点（拖拽位移 = 帧 2D 位移）
      _branch3D = null;
      if (!appState.layer3DLayout) {
        _captureDraw3DFrame();
        if (draw3DFrame && pick.point3) {
          const local = pick.point3.clone().sub(draw3DFrame.center);
          _branch3D = {
            fork3: pick.point3.clone(),
            forkF: {
              x: local.dot(draw3DFrame.right) / FISHBONE_3D_SCALE,
              y: local.dot(draw3DFrame.up) / FISHBONE_3D_SCALE
            }
          };
        }
      }
      return;
    }
    const p = _eventToTrunk2D(e);
    if (!p) return;
    const hit = projectOnFishboneSeg2D(p.x, p.y);
    if (!hit) return;   // 未落在线上：不启动分支绘制
    e.preventDefault();
    e.stopPropagation();
    setBranchHit({ trunkId: hit.trunk.id, segIndex: hit.segIndex, t: hit.t, point: hit.point });
    setBranchCurrent(hit.point);
    setDraggingBranch(true);
    setDownClient({ x: e.clientX, y: e.clientY });
    return;
  }

  if (!trunkDrawMode) return;
  e.preventDefault();
  e.stopPropagation();

  // 随机模式 3D 画线：会话首次落笔捕获相机前取景帧
  // （currentTrunk 为空 ⇔ 会话尚未提交过线段；无条件覆盖以自愈残留陈旧帧）
  if (!appState.is2DView && !appState.layer3DLayout && !currentTrunk) _captureDraw3DFrame();

  const p = _eventToTrunk2D(e);
  if (!p) return;
  setDownClient({ x: e.clientX, y: e.clientY });
  setSegStart(p);
  setSegCurrent(p);
  setDraggingSeg(true);
}

// 阻断鼠标路径上的其余处理器（3D 长按旋转 / 2D 框选、节点拖拽等）
// 分支绘制模式：仅在已成功在线上按下（isDraggingBranch）时阻断，空白按下放行
function _onMouseDownBlock(e) {
  if (e.button !== 0) return;
  if (isDraggingBranch) {
    const dom = _activeDrawDom();
    if (!dom || e.target !== dom) return;
    e.preventDefault();
    e.stopPropagation();
    return;
  }
  if (!trunkDrawMode) return;
  const dom = _activeDrawDom();
  if (!dom || e.target !== dom) return;
  e.preventDefault();
  e.stopPropagation();
}

function _onPointerMove(e) {
  // ── 分支 / 节点创建拖拽预览 ──
  if ((branchDrawMode || nodeCreateMode) && isDraggingBranch) {
    let p = null;
    if (!appState.is2DView) {
      if (!appState.layer3DLayout && _branch3D && draw3DFrame) {
        // 随机模式：帧上拖拽位移（相对叉点锚点）= 分支 2D 位移
        const curF = _rayToFrameLocal(e);
        if (curF && branchHit && branchHit.point) {
          p = {
            x: branchHit.point.x + (curF.x - _branch3D.forkF.x),
            y: branchHit.point.y + (curF.y - _branch3D.forkF.y)
          };
        }
      } else {
        // 图层模式：源干线所属图层平面
        const st = (appState.fishboneTrunks || []).find(t => t.id === branchHit?.trunkId);
        p = st ? _eventToPlane2D(e, fishboneLayerY(st.layerId)) : null;
      }
    } else {
      p = _eventToTrunk2D(e);
    }
    if (!p) return;
    setBranchCurrent(p);
    if (appState.is2DView) {
      mark2DDirty();
      draw();
    } else {
      updateFishbone3DPreview();
    }
    return;
  }
  if (!trunkDrawMode || !isDraggingSeg) return;
  const p = _eventToTrunk2D(e);
  if (!p) return;
  setSegCurrent(p);
  if (appState.is2DView) {
    mark2DDirty();
    draw();
  } else {
    updateFishbone3DPreview();
  }
}

function _onPointerUp(e) {
  // ── 分支 / 节点创建拖拽松手 ──
  if ((branchDrawMode || nodeCreateMode) && isDraggingBranch) {
    setDraggingBranch(false);
    const hit = branchHit, b = branchCurrent;
    const moved = downClient ? Math.hypot(e.clientX - downClient.x, e.clientY - downClient.y) : 0;
    setDownClient(null);
    resetBranchDragState();
    const seed = _branch3D ? _branchSeed3D(hit, b) : null;
    _branch3D = null;
    const ok = moved >= 4 && hit && b && hit.point &&
               Math.hypot(b.x - hit.point.x, b.y - hit.point.y) >= 1;
    if (nodeCreateMode) {
      // 一次性：成功即提交并退出模式；拖拽太短则提示后保留模式重试
      if (ok) {
        addFishboneNodeWithHistory(hit, b, seed);
        cancelFishboneNodeCreateMode();
      } else {
        showToast('🌿 拖拽距离太短，未创建节点', 1600);
      }
    } else if (ok) {
      addFishboneBranchWithHistory(hit, b, seed);   // 分支模式：保留模式，可连续画
    }
    if (!appState.is2DView) setDraw3DFrame(null);   // 分支拖拽的临时取景帧用完即清
    if (appState.is2DView) { mark2DDirty(); draw(); }
    else updateFishbone3DPreview();
    return;
  }

  if (!trunkDrawMode || !isDraggingSeg) return;
  setDraggingSeg(false);

  // 轻点（未拖动）不生成线段，绘制会话保持
  const moved = downClient ? Math.hypot(e.clientX - downClient.x, e.clientY - downClient.y) : 0;
  const a = segStart, b = segCurrent;
  setDownClient(null);
  resetDrawState();
  if (moved < 4 || !a || !b) {
    if (appState.is2DView) { mark2DDirty(); draw(); }
    else updateFishbone3DPreview();
    return;
  }

  commitSegment(a, b);
  if (appState.is2DView) { mark2DDirty(); draw(); }
  else updateFishbone3DPreview();
}

// 右键退出绘制模式（阻止空白菜单弹出）
function _onContextMenu(e) {
  const dom = _activeDrawDom();
  if (nodeCreateMode) {
    if (!dom || !dom.contains(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    cancelFishboneNodeCreateMode();
    return;
  }
  if (branchDrawMode) {
    if (!dom || !dom.contains(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    cancelBranchDrawMode();
    return;
  }
  if (!trunkDrawMode) return;
  if (!dom || !dom.contains(e.target)) return;
  e.preventDefault();
  e.stopPropagation();
  cancelTrunkDrawMode();
}

// 绘制模式下屏蔽画布上的左键 click / dblclick（防误选节点、误开编辑器）
function _onClickBlock(e) {
  if (e.button !== 0) return;
  if (!trunkDrawMode) return;
  const dom = _activeDrawDom();
  if (!dom || !dom.contains(e.target)) return;
  e.preventDefault();
  e.stopPropagation();
}

function _onKeyDown(e) {
  if (e.key !== 'Escape') return;
  if (nodeCreateMode) cancelFishboneNodeCreateMode();
  else if (branchDrawMode) cancelBranchDrawMode();
  else if (trunkDrawMode) cancelTrunkDrawMode();
}

// ---------- 初始化 ----------

export function initFishboneInteraction() {
  if (_listenersBound) return;
  _listenersBound = true;

  document.addEventListener('pointerdown', _onPointerDown, true);
  document.addEventListener('mousedown', _onMouseDownBlock, true);
  document.addEventListener('pointermove', _onPointerMove, true);
  document.addEventListener('pointerup', _onPointerUp, true);
  document.addEventListener('contextmenu', _onContextMenu, true);
  document.addEventListener('click', _onClickBlock, true);
  document.addEventListener('dblclick', _onClickBlock, true);
  window.addEventListener('keydown', _onKeyDown);
}
