// ============================================================
//  UI / Resize.js — 窗口缩放 + 自动布局弹出
// ============================================================
import * as THREE from 'three';
import { appState } from '../module0_AppState.js';
import { processSidebar2DPanning } from '../richEditor/tree-panel.js';
import { layoutTree, assignCoordinates, extractNodePositions } from '../2DView/index.js';
import { rebuildAllLines, generateRandomPosition } from '../VisualComponents/index.js';
import { saveCurrentProjectData } from '../module2_TreeData.js';
import { groupRects } from '../2DView/shared.js';
import { startArrangeAnimation, skipArrangeAnimation, startArrangeAnimation2D, skipArrangeAnimation2D } from './ArrangeAnimation.js';
import { computeAutoArrangeTargets } from '../2DView/index.js';

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

  _clearLayerVisuals();
  const { targetPositions, deferredEffects } = compute3DDefaultTargets();
  startArrangeAnimation(targetPositions, deferredEffects);
}

// ============================================================
//  3D 按 2D 布局排列 — 计算目标位置（不应用）
//  返回 { targetPositions: Map<id, Vector3>, deferredEffects }
// ============================================================
function compute3DWith2DLayoutTargets() {
  const rootNode = appState.methodsTree;
  if (!rootNode || !rootNode.id) return { targetPositions: new Map(), deferredEffects: { type: '2DLayout' } };

  const LAYER_SPACING = 4;
  const sortedLayers = [...appState.layers].sort((a, b) => a.order - b.order);

  // 保存当前图层的 2D 位置
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
  if (referencePositions) {
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
          adjustedX * 0.005,
          yBase,
          adjustedY * 0.015
        );
        targetPositions.set(id, worldPos);
      }
    });
  }

  // 3. 树遍历修正 X 坐标（操作 targetPositions 而非 appState.positions）
  {
    const SCALE = 0.015, BASE_W = 120;
    function applyEdgeOffset(node, parentId, parentBaseX, parentAdjustedX) {
      const pos = targetPositions.get(node.id);
      if (!pos) return;
      const baseX = pos.x;
      let adjustedX;
      if (parentId && parentId !== appState.VIRTUAL_ROOT_ID) {
        const pNode = appState.nodeMap.get(parentId);
        adjustedX = pNode
          ? parentAdjustedX + (baseX - parentBaseX) - (pNode.sizeScale || 1) * BASE_W * SCALE
          : baseX;
      } else {
        adjustedX = baseX;
      }
      pos.x = adjustedX;
      (node.children || []).forEach(c => applyEdgeOffset(c, node.id, baseX, adjustedX));
    }
    applyEdgeOffset(appState.methodsTree, null, 0, 0);
  }

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
    const X_SCALE = 0.005, Z_SCALE = 0.015;
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
// ============================================================
function arrange3DWith2DLayout() {
  // 动画中再点击 → 跳过当前动画后重新排列
  if (appState.arrangeAnimActive) {
    skipArrangeAnimation();
    // 重新计算并启动
  }

  const rootNode = appState.methodsTree;
  if (!rootNode || !rootNode.id) return;

  _clearLayerVisuals();
  const { targetPositions, deferredEffects } = compute3DWith2DLayoutTargets();
  startArrangeAnimation(targetPositions, deferredEffects);
}

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

    document.getElementById('arrangeTreeBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (appState.autoArrangeTreeLayout) appState.autoArrangeTreeLayout();
    });

    document.getElementById('arrangeAllLayersBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      arrangeAllLayers();
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
