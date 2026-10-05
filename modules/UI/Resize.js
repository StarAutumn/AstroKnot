// ============================================================
//  UI / Resize.js — 窗口缩放 + 自动布局弹出
// ============================================================
import * as THREE from 'three';
import { appState } from '../module0_AppState.js';
import { processSidebar2DPanning } from '../richEditor/tree-panel/index.js';
import { layoutTree, assignCoordinates, extractNodePositions } from '../2DView/index.js';
import { rebuildAllLines, generateRandomPosition } from '../VisualComponents/index.js';
import { saveCurrentProjectData } from '../TreeData/index.js';
import { groupRects } from '../2DView/shared.js';
import { startArrangeAnimation, skipArrangeAnimation, startArrangeAnimation2D, skipArrangeAnimation2D } from './ArrangeAnimation.js';
import { snapshotFishboneArrangeStart, finishFishboneArrangeTarget, rebuildFishbone3D, FISHBONE_3D_SCALE } from '../Fishbone/render3d.js';
import { computeAutoArrangeTargets } from '../2DView/index.js';

// 3D 按 2D 布局重排函数，由 bindResize() 内部注册
// （内部实现依赖 bindResize 作用域内的函数，故通过此变量暴露给其他模块）
export let arrange3DWith2DLayout = null;
// 即时应用 2D 布局（无动画），供滑动条拖动过程中实时预览
export let apply3DWith2DLayoutImmediate = null;

export function bindResize() {
  window.addEventListener('resize', () => {
    appState.camera.aspect = window.innerWidth / window.innerHeight;
    appState.camera.updateProjectionMatrix();
    appState.renderer.setSize(window.innerWidth, window.innerHeight);
    appState.effectComposer.setSize(window.innerWidth, window.innerHeight);
    appState.labelRenderer.setSize(window.innerWidth, window.innerHeight);
    if (appState.renderer && appState.renderer.domElement) {
      appState.renderer.domElement.style.width = window.innerWidth + 'px';
      appState.renderer.domElement.style.height = window.innerHeight + 'px';
    }
  });

  // ============================================================
//  所有图层自动排列（2D 模式下遍历所有图层逐一重排，带动画）
// ============================================================
function arrangeAllLayers() {
  // 动画中再点击 → 跳过当前动画后重新排列
  if (appState.arrangeAnim2DActive) {
    skipArrangeAnimation2D();
    // 继续执行下面的计算+启动
  }

  const sortedLayers = [...appState.layers].sort((a, b) => a.order - b.order);
  const rootNode = appState.methodsTree;
  if (!rootNode || !rootNode.id) return;

  // 保存当前图层
  const curLayer = appState.getCurrentLayer();
  if (curLayer) {
    curLayer.positions2D = new Map(appState.positions2D);
  }

  // 1. 先用第一个图层跑一次布局，拿到标准位置映射
  let referencePositions = null;
  const firstLayer = sortedLayers[0];
  if (firstLayer) {
    appState.currentLayerId = firstLayer.id;
    appState.positions2D = firstLayer.positions2D || new Map();

    // 计算目标位置（不修改 positions2D，不调用 draw）
    const targets = computeAutoArrangeTargets();
    // 将目标位置作为参考基准
    referencePositions = new Map(targets);
    // 同时保存到图层（后续恢复后使用）
    firstLayer.positions2D = new Map(targets);
  }

  // 2. 其余图层：用第一个图层的标准位置覆盖，并偏移对齐
  let anchorPos = null;
  if (firstLayer) {
    for (const [id, pos] of (referencePositions || [])) {
      if (id !== rootNode.id && firstLayer.nodeIds && firstLayer.nodeIds.has(id)) {
        anchorPos = { x: pos.x, y: pos.y };
        break;
      }
    }
  }

  for (let i = 1; i < sortedLayers.length; i++) {
    const layer = sortedLayers[i];
    appState.currentLayerId = layer.id;
    appState.positions2D = layer.positions2D || new Map();

    if (referencePositions) {
      // 用第一个图层的标准位置覆盖当前图层
      for (const [nodeId, pos] of referencePositions) {
        appState.positions2D.set(nodeId, { x: pos.x, y: pos.y });
      }

      // 计算当前图层的目标位置
      const layerTargets = computeAutoArrangeTargets();

      // 应用偏移对齐
      if (anchorPos && layer.nodeIds) {
        let layerPrimaryPos = null;
        for (const [id, pos] of layerTargets) {
          if (id !== rootNode.id && layer.nodeIds.has(id)) {
            layerPrimaryPos = { x: pos.x, y: pos.y };
            break;
          }
        }
        if (layerPrimaryPos) {
          const offsetX = anchorPos.x - layerPrimaryPos.x;
          const offsetY = anchorPos.y - layerPrimaryPos.y;
          if (offsetX !== 0 || offsetY !== 0) {
            for (const [id, pos] of layerTargets) {
              if (id !== rootNode.id) {
                pos.x += offsetX;
                pos.y += offsetY;
              }
            }
          }
        }
      }

      layer.positions2D = new Map(layerTargets);
    } else {
      layer.positions2D = new Map(appState.positions2D);
    }
  }

  // 恢复当前图层
  if (curLayer) {
    appState.currentLayerId = curLayer.id;
    appState.positions2D = curLayer.positions2D || new Map();
  }

  // 合并所有图层的目标位置为统一的 targetPositions Map
  const targetPositions = new Map();
  for (const layer of sortedLayers) {
    if (layer.positions2D) {
      for (const [id, pos] of layer.positions2D) {
        // 后面的图层会覆盖前面图层的同 id 位置（正常情况下不会冲突）
        targetPositions.set(id, { x: pos.x, y: pos.y });
      }
    }
  }

  // 启动 2D 排列动画
  if (targetPositions.size > 0) {
    startArrangeAnimation2D(targetPositions);
  }
}

// ============================================================
//  清除图层高亮矩形和3D组群矩形
// ============================================================
function _clearLayerVisuals() {
  if (appState.layerHighlights) {
    appState.layerHighlights.forEach(h => appState.scene.remove(h));
    appState.layerHighlights = [];
  }
  if (appState.groupRectMeshes) {
    appState.groupRectMeshes.forEach(m => appState.scene.remove(m));
    appState.groupRectMeshes = [];
  }
}

// ============================================================
//  3D 默认散布排列 — 计算目标位置（不应用）
// ============================================================
function compute3DDefaultTargets() {
  appState.layer3DLayout = false;

  const targetPositions = new Map();
  const rootNode = appState.methodsTree;
  if (!rootNode || !rootNode.children || rootNode.children.length === 0) {
    return { targetPositions, deferredEffects: { type: 'default', layerBtnHidden: true } };
  }

  // ── 球面径向排列：根节点在球心，子节点在球面上一级一级向外立体展开 ──
  const SHELL_RADIUS_BASE = 3.0;   // 第一层球面半径
  const SHELL_RADIUS_STEP = 2.5;   // 每级递增半径

  // 1. 计算每个节点的深度
  const depthMap = new Map();
  function calcDepth(node, depth) {
    if (!node || !node.id) return;
    depthMap.set(node.id, depth);
    for (const child of (node.children || [])) {
      calcDepth(child, depth + 1);
    }
  }
  calcDepth(rootNode, 0);

  // 2. 真实根节点（depth=1）：排在球心附近
  const realRoots = (rootNode.children || []).filter(c => c && c.id);
  if (realRoots.length === 1) {
    targetPositions.set(realRoots[0].id, new THREE.Vector3(0, 0, 0));
  } else if (realRoots.length > 1) {
    // 多根：在球心附近的小球面上均匀分布（斐波那契球面采样）
    _distributeOnSphere(realRoots, SHELL_RADIUS_BASE * 0.4, targetPositions);
  }

  // 3. 递归排列子节点：每个父节点的子节点在父方向外侧的球面上展开
  function arrangeChildrenSpherical(parentNode, parentDir, availableAngleSpan) {
    if (!parentNode || !parentNode.children) return;
    const children = parentNode.children.filter(c => c && c.id);
    if (children.length === 0) return;

    const parentPos = targetPositions.get(parentNode.id);
    if (!parentPos) return;

    // 使用传入的父方向（已在外层处理了零向量情况）
    const parentDirNorm = parentDir.clone().normalize();

    // 子节点所在球面半径
    const childDepth = depthMap.get(children[0].id) || 2;
    const shellRadius = SHELL_RADIUS_BASE + (childDepth - 1) * SHELL_RADIUS_STEP;

    // 在父方向周围的球面上分布子节点
    // 构建局部坐标系：以父方向为"上"方向
    const up = parentDirNorm;
    let right = new THREE.Vector3(1, 0, 0);
    if (Math.abs(up.dot(right)) > 0.9) right = new THREE.Vector3(0, 1, 0);
    right = new THREE.Vector3().crossVectors(up, right).normalize();
    const forward = new THREE.Vector3().crossVectors(right, up).normalize();

    // 子节点在父方向锥体内分布
    const coneHalfAngle = Math.min(availableAngleSpan / 2, Math.PI / 3); // 最大60度半锥角
    const nChildren = children.length;

    for (let i = 0; i < nChildren; i++) {
      const child = children[i];

      // 计算子节点在锥体内的方向
      let childDir;
      if (nChildren === 1) {
        childDir = parentDirNorm.clone();
      } else {
        // 斐波那契螺旋分布在锥体内
        const golden = (1 + Math.sqrt(5)) / 2;
        const theta = Math.acos(1 - (i + 0.5) / nChildren * (1 - Math.cos(coneHalfAngle)));
        const phi = 2 * Math.PI * i / golden;

        // 球坐标转局部笛卡尔
        const localX = Math.sin(theta) * Math.cos(phi);
        const localY = Math.cos(theta);  // 沿父方向
        const localZ = Math.sin(theta) * Math.sin(phi);

        childDir = new THREE.Vector3()
          .addScaledVector(right, localX)
          .addScaledVector(up, localY)
          .addScaledVector(forward, localZ)
          .normalize();
      }

      // 子节点位置 = 方向 × 球面半径
      targetPositions.set(child.id, childDir.multiplyScalar(shellRadius));

      // 递归：子节点扇区缩小
      const subSpan = availableAngleSpan / Math.max(nChildren, 1);
      arrangeChildrenSpherical(child, childDir.clone().normalize(), subSpan);
    }
  }

  // 每个真实根节点的子节点分配等分扇区
  for (let ri = 0; ri < realRoots.length; ri++) {
    const rootId = realRoots[ri].id;
    const rootPos = targetPositions.get(rootId);
    // 计算根节点的方向向量（避免原点归零产生 NaN）
    let rootDir;
    if (rootPos && rootPos.length() > 0.01) {
      rootDir = rootPos.clone().normalize();
    } else {
      // 根在原点：按序号分配均匀方向
      const angle = realRoots.length === 1 ? 0 : (ri / realRoots.length) * Math.PI * 2;
      rootDir = new THREE.Vector3(Math.cos(angle), 0.5, Math.sin(angle)).normalize();
    }
    const rootSpan = (Math.PI * 2) / realRoots.length;
    const rootNodeObj = appState.nodeMap.get(rootId);
    arrangeChildrenSpherical(rootNodeObj, rootDir, rootSpan);
  }

  const deferredEffects = { type: 'default', layerBtnHidden: true };
  return { targetPositions, deferredEffects };
}

// 斐波那契球面均匀采样
function _distributeOnSphere(nodes, radius, positionMap) {
  const n = nodes.length;
  const golden = (1 + Math.sqrt(5)) / 2;
  for (let i = 0; i < n; i++) {
    const theta = Math.acos(1 - 2 * (i + 0.5) / n);
    const phi = 2 * Math.PI * i / golden;
    positionMap.set(nodes[i].id, new THREE.Vector3(
      Math.sin(theta) * Math.cos(phi) * radius,
      Math.cos(theta) * radius,
      Math.sin(theta) * Math.sin(phi) * radius
    ));
  }
}

// ============================================================
//  3D 默认散布排列（带动画）
// ============================================================
function arrange3DDefault() {
  // 动画中再点击 → 跳过当前动画后重新排列
  if (appState.arrangeAnimActive) {
    skipArrangeAnimation();
    // 重新计算并启动
  }

  // 先捕获鱼骨线当前模式渲染点（compute3DDefaultTargets 内部会立即翻转 layer3DLayout）
  snapshotFishboneArrangeStart();
  _clearLayerVisuals();
  const { targetPositions, deferredEffects } = compute3DDefaultTargets();
  startArrangeAnimation(targetPositions, deferredEffects);
  // 目标 = 随机模式骨架（末点吸附节点目标位，随节点同步移动）
  finishFishboneArrangeTarget(false, appState.layer3DSpacing || 4);
}

// ============================================================
//  3D 按 2D 布局排列 — 计算目标位置（不应用）
//  返回 { targetPositions: Map<id, Vector3>, deferredEffects }
// ============================================================
function compute3DWith2DLayoutTargets(useArrangeTargets = false, allLayers = true) {
  const rootNode = appState.methodsTree;
  if (!rootNode || !rootNode.id) return { targetPositions: new Map(), deferredEffects: { type: '2DLayout' } };

  // 每层之间的 Y 轴间距，可在图层管理面板的滑动条中调节
  const LAYER_SPACING = appState.layer3DSpacing ?? 4;
  const sortedLayers = [...appState.layers].sort((a, b) => a.order - b.order);

  // 保存当前图层的 2D 位置
  const curLayer = appState.getCurrentLayer();
  if (curLayer) {
    curLayer.positions2D = new Map(appState.positions2D);
  }

  const firstLayer = sortedLayers[0];
  // 1. useArrangeTargets=false：用第一个图层跑一次布局，拿到标准位置映射
  //    useArrangeTargets=true：跳过（第 2 步逐图层用与「自动排列」同源的 computeAutoArrangeTargets）
  let referencePositions = null;
  if (!useArrangeTargets && firstLayer) {
    appState.currentLayerId = firstLayer.id;
    appState.positions2D = firstLayer.positions2D || new Map();
    const rootPos = appState.positions2D.get(rootNode.id) || { x: -500, y: -200 };

    // 保存真实根节点的位置
    const realRootPositions = new Map();
    for (const child of (rootNode.children || [])) {
      if (child && child.id) {
        const saved = appState.positions2D.get(child.id);
        if (saved) realRootPositions.set(child.id, { x: saved.x, y: saved.y });
      }
    }

    const layout = layoutTree(rootNode);
    assignCoordinates(layout, 0, 0);
    const positions = extractNodePositions(layout);
    // 虚拟根节点 + 真实根节点位置不参与重排
    positions.set(rootNode.id, { x: rootPos.x, y: rootPos.y });
    appState.positions2D.set(rootNode.id, { x: rootPos.x, y: rootPos.y });
    for (const [id, saved] of realRootPositions) {
      positions.set(id, { x: saved.x, y: saved.y });
      appState.positions2D.set(id, { x: saved.x, y: saved.y });
    }
    const rootLayoutPos = positions.get(rootNode.id);
    if (rootLayoutPos) {
      const offsetX = rootPos.x - rootLayoutPos.x;
      const offsetY = rootPos.y - rootLayoutPos.y;
      for (const [id, pos] of positions) {
        if (id === rootNode.id || realRootPositions.has(id)) continue;
        pos.x += offsetX;
        pos.y += offsetY;
      }
    }
    referencePositions = new Map(positions);
  }

  // 2. 用统一的标准位置映射到各图层的 3D 坐标（写入 targetPositions，不修改 appState.positions/mesh）
  const targetPositions = new Map();
  if (useArrangeTargets) {
    // 与 2D「自动排列」完全同源：逐图层 computeAutoArrangeTargets（锚定各图层自己的真实根位置
    // 重排子树），保证 3D 同步映射 = 2D 排列结果。此前用 layoutTree 自行推导，与排列算法
    // 不一致导致勾选同步后 3D 布局与 2D 对不上。
    // allLayers=false：仅映射当前图层（「自动排列」只排当前图层，其余图层 3D 保持原位）
    const layersToMap = allLayers ? sortedLayers : sortedLayers.filter(l => curLayer && l.id === curLayer.id);
    for (const layer of layersToMap) {
      const yBase = sortedLayers.indexOf(layer) * LAYER_SPACING;
      appState.currentLayerId = layer.id;
      appState.positions2D = layer.positions2D || new Map();
      const layerTargets = computeAutoArrangeTargets();
      for (const [id, pos] of layerTargets) {
        // x/z 等比映射（FISHBONE_3D_SCALE 全局共用）：3D 布局保持 2D 排列的形状比例
        targetPositions.set(id, new THREE.Vector3(pos.x * FISHBONE_3D_SCALE, yBase, pos.y * FISHBONE_3D_SCALE));
      }
    }
  } else if (referencePositions) {
    // 找到第一个图层的 primary node（第一个非虚拟根且在图层中的节点）作为锚点
    let anchorPos = null;
    if (firstLayer) {
      for (const [id, pos] of referencePositions.entries()) {
        if (id !== rootNode.id && firstLayer.nodeIds && firstLayer.nodeIds.has(id)) {
          anchorPos = { x: pos.x, y: pos.y };
          break;
        }
      }
    }

    sortedLayers.forEach((layer, layerIdx) => {
      const yBase = layerIdx * LAYER_SPACING;

      // 计算当前图层的偏移量，使其 primary node 对齐到第一个图层的锚点位置
      let offsetX = 0, offsetY = 0;
      if (anchorPos && layer.nodeIds) {
        for (const [id, pos] of referencePositions.entries()) {
          if (id !== rootNode.id && layer.nodeIds.has(id)) {
            offsetX = anchorPos.x - pos.x;
            offsetY = anchorPos.y - pos.y;
            break;
          }
        }
      }

      for (const [id, pos] of referencePositions.entries()) {
        if (layer.nodeIds && !layer.nodeIds.has(id)) continue;
        // 应用偏移量，使该图层节点对齐到第一个图层的对应位置
        const adjustedX = pos.x + offsetX;
        const adjustedY = pos.y + offsetY;
        const worldPos = new THREE.Vector3(
          adjustedX * FISHBONE_3D_SCALE,
          yBase,
          adjustedY * FISHBONE_3D_SCALE
        );
        targetPositions.set(id, worldPos);
      }
    });
  }

  // 3.（已移除旧的 applyEdgeOffset X 修正）旧逻辑按 0.015 系数把每级子树向 -X 拉回
  //    一个卡片宽，导致 3D 树沿 -X 镜像生长且与 2D 排列形状不符（用户反馈「比例不对」）。
  //    现在节点用 FISHBONE_3D_SCALE x/z 等比映射，与节点球连线（球心到球心）天然无遮挡，
  //    3D 布局与 2D 排列严格同形同向，不再做任何 X 修正。

  // 4. 为每层节点创建半透明高亮矩形（不添加到 scene，存入 deferredEffects）
  const layerHighlights = [];
  {
    sortedLayers.forEach((layer, layerIdx) => {
      const yBase = layerIdx * LAYER_SPACING;
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      let hasNode = false;

      for (const id of (layer.nodeIds || [])) {
        const pos = targetPositions.get(id);
        if (!pos) continue;
        hasNode = true;
        if (pos.x < minX) minX = pos.x;
        if (pos.x > maxX) maxX = pos.x;
        if (pos.z < minZ) minZ = pos.z;
        if (pos.z > maxZ) maxZ = pos.z;
      }

      if (!hasNode) return;

      const PAD = 0.5;
      const w = maxX - minX + PAD * 2;
      const h = maxZ - minZ + PAD * 2;
      const geom = new THREE.PlaneGeometry(Math.max(w, 0.1), Math.max(h, 0.1), 64, 64);

      // 水面波纹着色器
      const waterUniforms = {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0x4488ff) },
        uOpacity: { value: 0.45 },
        uHighlight: { value: 0.0 }
      };
      const waterMat = new THREE.ShaderMaterial({
        uniforms: waterUniforms,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        vertexShader: `
          uniform float uTime;
          varying vec2 vUv;
          varying float vWave;
          void main() {
            vUv = uv;
            vec3 pos = position;
            // 多层波纹叠加
            float wave1 = sin(pos.x * 6.0 + uTime * 1.2) * cos(pos.y * 5.0 + uTime * 0.8) * 0.015;
            float wave2 = sin(pos.x * 10.0 - uTime * 1.5) * sin(pos.y * 8.0 + uTime * 1.1) * 0.008;
            float wave3 = cos(pos.x * 3.0 + pos.y * 4.0 + uTime * 0.6) * 0.01;
            pos.z += wave1 + wave2 + wave3;
            vWave = wave1 + wave2 + wave3;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uTime;
          uniform vec3 uColor;
          uniform float uOpacity;
          uniform float uHighlight;
          varying vec2 vUv;
          varying float vWave;
          void main() {
            // 流动泛光
            float flow1 = sin(vUv.x * 12.0 + uTime * 1.5) * cos(vUv.y * 10.0 - uTime * 1.0);
            float flow2 = sin(vUv.x * 8.0 - uTime * 0.7 + vUv.y * 6.0) * 0.5;
            float flow = (flow1 + flow2) * 0.5 + 0.5;

            // 自由运动波纹
            float ripple = sin(length(vUv - 0.5) * 20.0 - uTime * 3.0) * 0.5 + 0.5;
            ripple *= smoothstep(0.5, 0.0, length(vUv - 0.5));

            // 中心泛光
            float glow = smoothstep(0.6, 0.0, length(vUv - 0.5)) * 0.3;

            // 波峰高光
            float specular = pow(max(0.0, vWave * 30.0), 2.0) * 0.4;

            float alpha = (0.15 + flow * 0.12 + ripple * 0.1 + glow + specular) * uOpacity;
            alpha = clamp(alpha, 0.0, 0.85);

            vec3 col = uColor + specular * vec3(0.3, 0.5, 1.0);
            col += uHighlight * vec3(0.1, 0.2, 0.4);

            gl_FragColor = vec4(col, alpha);
          }
        `
      });

      const plane = new THREE.Mesh(geom, waterMat);
      plane.rotation.x = -Math.PI / 2; // 平放在 XZ 平面
      plane.position.set((minX + maxX) / 2, yBase, (minZ + maxZ) / 2);
      plane.renderOrder = 999;
      // 不添加到 scene，存入数组延迟添加
      layerHighlights.push(plane);
    });
  }

  // 5. 绘制3D组群矩形（不添加到 scene，存入 deferredEffects）
  const groupRectMeshes = [];
  {
    // 与节点同一等比映射系数，保证组群矩形与节点不错位
    const X_SCALE = FISHBONE_3D_SCALE, Z_SCALE = FISHBONE_3D_SCALE;
    for (const gr of groupRects) {
      // 找到组群所属图层
      let layerIdx = -1;
      if (gr.layerId) {
        layerIdx = sortedLayers.findIndex(l => l.id === gr.layerId);
      }
      if (layerIdx < 0) {
        // 无 layerId 时尝试通过 nodeIds 找图层
        for (let li = 0; li < sortedLayers.length; li++) {
          const layer = sortedLayers[li];
          if (gr.nodeIds && gr.nodeIds.some(nid => layer.nodeIds && layer.nodeIds.has(nid))) {
            layerIdx = li;
            break;
          }
        }
      }
      if (layerIdx < 0) continue;

      const yBase = layerIdx * LAYER_SPACING;
      const cx = (gr.x + gr.width / 2) * X_SCALE;
      const cz = (gr.y + gr.height / 2) * Z_SCALE;
      const w = Math.max(gr.width * X_SCALE, 0.05);
      const h = Math.max(gr.height * Z_SCALE, 0.05);

      // 半透明填充
      const geom = new THREE.PlaneGeometry(w, h);
      const fillAlpha = gr.fillOpacity !== undefined ? gr.fillOpacity : 0.25;
      const mat = new THREE.MeshBasicMaterial({
        color: gr.fillColor ? parseInt(gr.fillColor.slice(1), 16) : 0x4a3c7e,
        transparent: true,
        opacity: fillAlpha,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      const plane = new THREE.Mesh(geom, mat);
      plane.rotation.x = -Math.PI / 2;
      plane.position.set(cx, yBase + 0.01, cz);
      plane.renderOrder = 998;
      // 不添加到 scene
      groupRectMeshes.push(plane);

      // 边框线
      const edgeGeom = new THREE.EdgesGeometry(new THREE.PlaneGeometry(w, h));
      const edgeMat = new THREE.LineBasicMaterial({
        color: gr.borderColor ? parseInt(gr.borderColor.slice(1), 16) : 0x7a6aae,
        transparent: true,
        opacity: 0.8
      });
      const edgeLine = new THREE.LineSegments(edgeGeom, edgeMat);
      edgeLine.rotation.x = -Math.PI / 2;
      edgeLine.position.set(cx, yBase + 0.02, cz);
      edgeLine.renderOrder = 999;
      // 不添加到 scene
      groupRectMeshes.push(edgeLine);
    }
  }

  // 恢复当前图层
  if (curLayer) {
    appState.currentLayerId = curLayer.id;
    appState.positions2D = curLayer.positions2D || new Map();
  }

  const deferredEffects = {
    type: '2DLayout',
    layer3DLayout: true,
    layer3DSpacing: LAYER_SPACING,
    layerHighlights,
    groupRectMeshes,
    layerBtnVisible: true
  };

  return { targetPositions, deferredEffects };
}

// ============================================================
//  3D 按 2D 布局排列（带动画）
//  注册到模块级导出变量，供图层管理面板调节层间距后调用
// ============================================================
arrange3DWith2DLayout = function (useArrangeTargets = false, allLayers = true) {
  // 动画中再点击 → 跳过当前动画后重新排列
  if (appState.arrangeAnimActive) {
    skipArrangeAnimation();
    // 重新计算并启动
  }

  const rootNode = appState.methodsTree;
  if (!rootNode || !rootNode.id) return;

  // 捕获鱼骨线当前（随机模式）渲染点；layer3DLayout 翻转推迟到 move 结束的 fx 中
  snapshotFishboneArrangeStart();
  _clearLayerVisuals();
  const { targetPositions, deferredEffects } = compute3DWith2DLayoutTargets(useArrangeTargets, allLayers);
  startArrangeAnimation(targetPositions, deferredEffects);
  // 目标 = 图层 2D 映射（层间距显式传入，不读运行中的 layer3DLayout）
  finishFishboneArrangeTarget(true, appState.layer3DSpacing ?? 4);
};

// 即时应用 2D 布局（无动画），供滑动条实时预览层间距
apply3DWith2DLayoutImmediate = function (useArrangeTargets = false, allLayers = true) {
  const rootNode = appState.methodsTree;
  if (!rootNode || !rootNode.id) return;

  // 若动画正在播放，先跳过动画避免冲突
  if (appState.arrangeAnimActive) {
    skipArrangeAnimation();
  }

  _clearLayerVisuals();
  const { targetPositions, deferredEffects } = compute3DWith2DLayoutTargets(useArrangeTargets, allLayers);

  // 直接应用目标位置（无动画）
  for (const [id, targetPos] of targetPositions) {
    const pos = appState.positions.get(id);
    if (pos) pos.copy(targetPos);
    const obj = appState.nodeMeshes.get(id);
    if (obj) {
      obj.mesh.position.copy(targetPos);
      if (obj.label) {
        obj.label.position.set(targetPos.x, targetPos.y + appState.NODE_RADIUS + 0.28, targetPos.z);
      }
    }
  }

  // 与动画版 deferred fx（ArrangeAnimation.js 的 fx.layer3DLayout）一致：
  // 2D 布局映射语义 = 图层排列模式，即时落位直接翻转（否则鱼骨等仍按随机模式渲染）
  appState.layer3DLayout = true;

  // 重建连线
  rebuildAllLines();

  // 鱼骨线即时落位：动画版由 finishFishboneArrangeTarget + 逐帧插值处理，
  // 即时版没有插值过程，直接强制重建，让鱼骨主干与节点同帧落到图层平面的映射位置
  rebuildFishbone3D(true);

  // 恢复连线透明度
  for (let it of appState.lineItems) {
    it.line.setOpacity(1);
    if (it.line.glowTube) it.line.glowTube.material.opacity = (appState.lineGlowOpacity ?? 1);
    if (it.line.particlePoints) it.line.particlePoints.material.opacity = 1;
    if (it.line.trailPointsMerged?.material?.uniforms) {
      it.line.trailPointsMerged.material.uniforms.uOpacity.value = 0.6;
    }
  }

  // 应用延迟视觉效果（图层高亮矩形等）
  if (deferredEffects.layerHighlights) {
    appState.layerHighlights = deferredEffects.layerHighlights;
    for (const hl of deferredEffects.layerHighlights) appState.scene.add(hl);
  }
  if (deferredEffects.groupRectMeshes) {
    appState.groupRectMeshes = deferredEffects.groupRectMeshes;
    for (const m of deferredEffects.groupRectMeshes) appState.scene.add(m);
  }
};

  // ---------- 自动排列按钮（任务栏） ----------
  const arrangeBtn = document.getElementById('arrangeBtn');
  const arrangePopup = document.getElementById('arrangePopup');
  const arrangeTreeBtn = document.getElementById('arrangeTreeBtn');
  const arrangeAllLayersBtn = document.getElementById('arrangeAllLayersBtn');
  const arrange3DDefaultBtn = document.getElementById('arrange3DDefaultBtn');
  const arrange3D2DBtn = document.getElementById('arrange3D2DBtn');
  if (arrangeBtn && arrangePopup) {
    arrangeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      arrangePopup.classList.toggle('show');
    });

    document.addEventListener('pointerdown', (e) => {
      if (!arrangePopup.contains(e.target) && e.target !== arrangeBtn) {
        arrangePopup.classList.remove('show');
      }
    });

    // ---------- 排列实时同步 2D→3D 勾选框（状态持久化 + 联动按钮状态）----------
    const arrange3DSyncCheckbox = document.getElementById('arrange3DSyncCheckbox');
    // 勾选同步后：「2D模式排列」高亮（2D 排列时自动触发它）；「默认排列」（随机散布）禁用——
    // 随机布局会破坏 2D↔3D 的同步映射
    const _updateArrangeSyncUI = () => {
      const on = !!arrange3DSyncCheckbox?.checked;
      if (arrange3D2DBtn) {
        arrange3D2DBtn.classList.toggle('sync-active', on);
        arrange3D2DBtn.title = on ? '排列实时同步已开启：2D 排列时自动执行此排列' : '';
      }
      if (arrange3DDefaultBtn) {
        arrange3DDefaultBtn.disabled = on;
        arrange3DDefaultBtn.title = on ? '随机散布会破坏 2D↔3D 同步映射，请先取消勾选「排列实时同步」' : '';
      }
    };
    if (arrange3DSyncCheckbox) {
      arrange3DSyncCheckbox.checked = localStorage.getItem('astroknot_arrange3DSync') === '1';
      arrange3DSyncCheckbox.addEventListener('change', () => {
        localStorage.setItem('astroknot_arrange3DSync', arrange3DSyncCheckbox.checked ? '1' : '0');
        _updateArrangeSyncUI();
      });
      _updateArrangeSyncUI();  // 启动时按持久化状态恢复按钮可用性
    }
    // 勾选后：2D 排列启动时同步映射 3D 布局（复用「2D模式排列」逻辑）。
    // useArrangeTargets=true：3D 目标直接用与「自动排列」同源的 computeAutoArrangeTargets，
    // 保证 3D 布局 = 2D 排列结果（此前自行推导布局与排列算法不一致导致不同步）。
    // 3D 模式：3D 排列动画与 2D 排列动画并行播放；
    // 2D 常驻模式：主循环暂停 updateArrange3D（3D 排列动画不会推进），
    // 改用即时应用版本直接落位，切到 3D 即为同步后的布局
    // allLayers：自动排列只排当前图层→false；所有图层排列→true
    const sync3DIfEnabled = (allLayers) => {
      if (!arrange3DSyncCheckbox?.checked) return;
      if (appState.is2DView) {
        apply3DWith2DLayoutImmediate(true, allLayers);
      } else {
        arrange3DWith2DLayout(true, allLayers);
      }
    };

    document.getElementById('arrangeTreeBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (appState.autoArrangeTreeLayout) appState.autoArrangeTreeLayout();
      sync3DIfEnabled(false);
    });

    document.getElementById('arrangeAllLayersBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      arrangeAllLayers();
      sync3DIfEnabled(true);
    });

    document.getElementById('arrange3DDefaultBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      arrange3DDefault();
    });

    document.getElementById('arrange3D2DBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      arrange3DWith2DLayout();
    });
  }
}

// ==================== 2D平移循环（统一处理） ====================
function start2DPanningLoop() {
  function loop() {
    if (appState.is2DView && appState.process2DPanning) {
      appState.process2DPanning();
    }
    processSidebar2DPanning();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}
start2DPanningLoop();
