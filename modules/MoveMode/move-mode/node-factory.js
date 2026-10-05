// ============================================================
//  MoveMode / move-mode / node-factory.js — 节点创建工厂
//  - createNodeInProject / placeNodeIn3D / placeNodeIn2D / _computeRadialPosition
//  - getNextRootName / getNextGlobalChildName / getNextChildName
// ============================================================

import * as THREE from 'three';
import { appState } from '../../module0_AppState.js';
import { withHistory } from '../../module3_History.js';
import { saveCurrentProjectData } from '../../TreeData/index.js';
import {
  generateRandomPosition, createNodeMesh,
  addSingleTreeLine
} from '../../VisualComponents/index.js';
import { hideContextMenu, hideBlankContextMenu } from '../../module8_ContextMenu.js';
import { apply3DWith2DLayoutImmediate } from '../../UI/Resize.js';
import {
  lastBlankMenuMouse
} from '../shared.js';
import {
  generateNodeId, _findParentNode, _getNodeDepth
} from './shared-internal.js';

// ============================================================
//  在 3D 场景中根据鼠标位置或径向位置放置节点
// ============================================================
function placeNodeIn3D(newId, basePos) {
  if (appState.layer3DLayout) {
    // 2D排列模式：在当前图层平面内放置节点
    const sortedLayers = [...appState.layers].sort((a, b) => a.order - b.order);
    const curLayerIdx = sortedLayers.findIndex(l => l.id === appState.currentLayerId);
    const layerY = curLayerIdx >= 0 ? curLayerIdx * appState.layer3DSpacing : 0;

    if (lastBlankMenuMouse.x || lastBlankMenuMouse.y) {
      const mouse2 = new THREE.Vector2();
      mouse2.x = (lastBlankMenuMouse.x / window.innerWidth) * 2 - 1;
      mouse2.y = -(lastBlankMenuMouse.y / window.innerHeight) * 2 + 1;
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse2, appState.camera);
      const layerPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -layerY);
      const hitPoint = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(layerPlane, hitPoint)) {
        appState.positions.set(newId, hitPoint);
        return;
      }
    }
    // 回退：在当前图层平面中心附近随机
    let newPos = new THREE.Vector3((Math.random() - 0.5) * 2, layerY, (Math.random() - 0.5) * 2);
    appState.positions.set(newId, newPos);
    return;
  }

  // 有右键菜单位置 → 射线投射到场景
  if (lastBlankMenuMouse.x || lastBlankMenuMouse.y) {
    const mouse2 = new THREE.Vector2();
    mouse2.x = (lastBlankMenuMouse.x / window.innerWidth) * 2 - 1;
    mouse2.y = -(lastBlankMenuMouse.y / window.innerHeight) * 2 + 1;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse2, appState.camera);
    const dir = raycaster.ray.direction.clone().normalize();
    const distance = 10;
    let newPos = appState.camera.position.clone().add(dir.multiplyScalar(distance));
    // 防重叠
    const minDist = 2.5;
    const maxIter = 10;
    const pushStep = 0.8;
    for (let iter = 0; iter < maxIter; iter++) {
      let overlapping = false;
      for (let [otherId, otherPos] of appState.positions.entries()) {
        if (otherId === appState.VIRTUAL_ROOT_ID || otherId === newId) continue;
        const dist = newPos.distanceTo(otherPos);
        if (dist < minDist) {
          overlapping = true;
          const pushDir = new THREE.Vector3().subVectors(newPos, otherPos).normalize();
          if (pushDir.length() < 0.01) pushDir.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
          newPos.add(pushDir.multiplyScalar(pushStep));
          break;
        }
      }
      if (!overlapping) break;
    }
    appState.positions.set(newId, newPos);
  } else {
    // 无右键位置 → 径向放置在父节点周围
    let newPos = _computeRadialPosition(newId);
    appState.positions.set(newId, newPos);
  }
}

// ============================================================
//  计算节点的球面径向位置（3D默认排列）
//  根节点在球心，子节点在球面上一级一级向外立体展开
// ============================================================
function _computeRadialPosition(newId) {
  const SHELL_RADIUS_BASE = 3.0;
  const SHELL_RADIUS_STEP = 2.5;
  const SHELL_RADIUS_ROOT = 1.2;

  const node = appState.nodeMap.get(newId);
  if (!node) return new THREE.Vector3(0, 0, 0);

  const rootNode = appState.methodsTree;
  const realRoots = rootNode?.children || [];

  // 判断是否为根节点
  const isRoot = realRoots.some(r => r && r.id === newId);
  if (isRoot) {
    const rootIndex = realRoots.findIndex(r => r && r.id === newId);
    const rootCount = realRoots.length;
    if (rootCount === 1) {
      return new THREE.Vector3(0, 0, 0);
    }
    // 多根：斐波那契球面采样
    const golden = (1 + Math.sqrt(5)) / 2;
    const i = rootIndex;
    const theta = Math.acos(1 - 2 * (i + 0.5) / rootCount);
    const phi = 2 * Math.PI * i / golden;
    return new THREE.Vector3(
      Math.sin(theta) * Math.cos(phi) * SHELL_RADIUS_ROOT,
      Math.cos(theta) * SHELL_RADIUS_ROOT,
      Math.sin(theta) * Math.sin(phi) * SHELL_RADIUS_ROOT
    );
  }

  // 子节点：基于父节点方向在球面上展开
  const parentNode = _findParentNode(newId);
  if (parentNode) {
    const parentPos = appState.positions.get(parentNode.id);
    if (parentPos) {
      // 计算父节点方向（避免零向量产生 NaN）
      let parentDirNorm;
      if (parentPos.length() > 0.01) {
        parentDirNorm = parentPos.clone().normalize();
      } else {
        // 父在原点：按父节点在兄弟中的序号分配方向
        const grandParent = _findParentNode(parentNode.id);
        const parentSiblings = (grandParent?.children || []).filter(c => c && c.id);
        const parentIdx = parentSiblings.findIndex(c => c.id === parentNode.id);
        const angle = parentSiblings.length <= 1 ? 0 : (parentIdx / parentSiblings.length) * Math.PI * 2;
        parentDirNorm = new THREE.Vector3(Math.cos(angle), 0.5, Math.sin(angle)).normalize();
      }
      const siblings = (parentNode.children || []).filter(c => c && c.id);
      const siblingIndex = siblings.findIndex(c => c.id === newId);
      const siblingCount = siblings.length;
      const depth = _getNodeDepth(newId);
      const shellRadius = SHELL_RADIUS_BASE + (depth - 1) * SHELL_RADIUS_STEP;

      // 构建局部坐标系
      const up = parentDirNorm;
      let right = new THREE.Vector3(1, 0, 0);
      if (Math.abs(up.dot(right)) > 0.9) right = new THREE.Vector3(0, 1, 0);
      right = new THREE.Vector3().crossVectors(up, right).normalize();
      const forward = new THREE.Vector3().crossVectors(right, up).normalize();

      let childDir;
      if (siblingCount <= 1) {
        childDir = parentDirNorm.clone();
      } else {
        // 斐波那契螺旋分布在锥体内
        const coneHalfAngle = Math.PI / 3;
        const golden = (1 + Math.sqrt(5)) / 2;
        const i = siblingIndex;
        const theta = Math.acos(1 - (i + 0.5) / siblingCount * (1 - Math.cos(coneHalfAngle)));
        const phi = 2 * Math.PI * i / golden;
        const localX = Math.sin(theta) * Math.cos(phi);
        const localY = Math.cos(theta);
        const localZ = Math.sin(theta) * Math.sin(phi);
        childDir = new THREE.Vector3()
          .addScaledVector(right, localX)
          .addScaledVector(up, localY)
          .addScaledVector(forward, localZ)
          .normalize();
      }

      return childDir.multiplyScalar(shellRadius);
    }
  }

  // 回退：随机位置
  return generateRandomPosition(Array.from(appState.positions.values()), new THREE.Vector3(0, 0, 0));
}

// ============================================================
//  在 2D 场景中放置节点
// ============================================================
function placeNodeIn2D(newId, parentId, offsetX, offsetY) {
  // 子节点：临时放在父节点附近（自动排列会重新计算最终位置）
  if (parentId) {
    let parentPos2d = appState.positions2D.get(parentId);
    if (parentPos2d) {
      appState.positions2D.set(newId, { x: parentPos2d.x + (offsetX || 160), y: parentPos2d.y + (offsetY || 10) });
      return;
    }
  }

  // 根节点：使用右键菜单位置
  // 优先使用侧边栏预转换的世界坐标
  if (appState._isSidebarContextMenu && appState._sidebarWorldPos) {
    const worldPos = appState._sidebarWorldPos;
    // 消费后清理，防止影响后续操作
    appState._sidebarWorldPos = null;
    appState._isSidebarContextMenu = false;
    appState.positions2D.set(newId, { x: worldPos.x, y: worldPos.y });
    return;
  }

  let rcp = appState._lastRightClickPos || { x: 0, y: 0 };
  let canvas2d = document.getElementById('view2dCanvas');
  let rect2d = canvas2d.getBoundingClientRect();
  let cx = rcp.x - rect2d.left;
  let cy = rcp.y - rect2d.top;
  let tf = appState.view2DTransform;
  let wx = (cx - canvas2d.width / 2 - tf.offsetX) / tf.scale;
  let wy = (cy - canvas2d.height / 2 - tf.offsetY) / tf.scale;

  appState.positions2D.set(newId, { x: wx, y: wy });
}

// ============================================================
//  创建节点并添加到项目和场景
// ============================================================
export function createNodeInProject({ name, desc, sizeScale, nodeType, blockType, isStepFlow, parentId, offsetX, offsetY, asNextStep }) {
  let createdNode = null;
  const doAdd = withHistory(function () {
    const parentNode = parentId ? appState.nodeMap.get(parentId) : appState.methodsTree;
    if (!parentNode) return;
    const newId = generateNodeId();
    let newNode = {
      id: newId, name, desc, children: [],
      sizeScale: sizeScale || 1.5,
      ringSpeedFactor: parentId ? (appState.nodeMap.get(parentId)?.ringSpeedFactor || 1.0) : 1.0,
      fixedColor: parentId ? (appState.nodeMap.get(parentId)?.fixedColor || null) : null
    };
    if (nodeType) newNode.nodeType = nodeType;
    if (blockType) newNode.blockType = blockType;
    if (isStepFlow) newNode.isStepFlow = true;

    if (!parentNode.children) parentNode.children = [];
    parentNode.children.push(newNode);
    appState.nodeMap.set(newId, newNode);
    appState.addNodeToCurrentLayer(newId);

    if (appState.is2DView) {
      let existing3d = Array.from(appState.positions.values());
      let base3d = parentId && appState.positions.has(parentId)
        ? appState.positions.get(parentId)
        : new THREE.Vector3(0, 0, 0);
      let randPos = generateRandomPosition(existing3d, base3d);
      appState.positions.set(newId, randPos);
      placeNodeIn2D(newId, parentId, offsetX, offsetY);
      createNodeMesh(newNode, randPos);
    } else {
      let basePos = parentId && appState.positions.has(parentId)
        ? appState.positions.get(parentId)
        : null;
      placeNodeIn3D(newId, basePos);
      const pos = appState.positions.get(newId);
      createNodeMesh(newNode, pos);
      // 3D 模式创建也同步登记 2D 位置（父节点附近），保证切换到 2D 时新节点就近出现
      placeNodeIn2D(newId, parentId, offsetX, offsetY);
    }

    // 增量添加连线，避免销毁重建导致其他连线粒子动画重置
    if (parentId && parentId !== appState.VIRTUAL_ROOT_ID) {
      addSingleTreeLine(parentId, newId);
    }
    // 派发节点创建事件（供 nodeDiskSync 监听器实时创建磁盘文件夹）
    window.dispatchEvent(new CustomEvent('astroknot-node-created', {
      detail: { nodeId: newId, node: newNode }
    }));
    saveCurrentProjectData();

    if (parentId) {
      hideContextMenu();
      if (appState.refreshTreePanel) appState.refreshTreePanel();
    } else {
      hideBlankContextMenu();
      if (appState.refreshTreePanel) appState.refreshTreePanel();
    }
    // 无条件刷新：refresh2DView 内部仅 2D 可见时才重绘，不可见时只置布局脏标记，
    // 保证 3D 模式下增删改查后切到 2D 时布局重算（否则新节点不显示/已删节点残留）
    if (appState.refresh2DView) appState.refresh2DView();

    // 创建子节点后自动重排子树，避免重叠（纯数据操作，3D 模式下同样安全）
    if (parentId && appState.arrangeSubtreeIncremental) {
      appState.arrangeSubtreeIncremental(parentId);
      if (appState.refresh2DView) appState.refresh2DView();
    }

    // 勾选「排列实时同步」：2D 位置登记+子树重排完成后，把当前 2D 布局整体映射到 3D，
    // 新节点在 3D 出现在父节点旁的映射位置（而非随机散布），3D 布局始终由 2D 决定。
    // (true, false)：仅映射当前图层，且与「自动排列」同源（computeAutoArrangeTargets），
    // 多图层项目下创建非首层节点也能正确同步（旧参数 false 只映射第一图层存储布局）
    if (typeof localStorage !== 'undefined' &&
        localStorage.getItem('astroknot_arrange3DSync') === '1' &&
        typeof apply3DWith2DLayoutImmediate === 'function') {
      try { apply3DWith2DLayoutImmediate(true, false); } catch (e) { console.warn('[node-factory] 3D 同步映射失败:', e); }
    }

    createdNode = newNode;
  });
  doAdd();
  return createdNode;
}

// ============================================================
//  计算全局根节点的序号名称（根节点1、根节点2...）
// ============================================================
export function getNextRootName() {
  const roots = appState.methodsTree?.children || [];
  let maxNum = 0;
  roots.forEach(root => {
    const match = root.name.match(/^根节点(\d+)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  });
  return '根节点' + (maxNum + 1);
}

// ============================================================
//  计算全局子节点的序号名称（子节点1、子节点2...）
//  遍历整个树的所有节点，找到所有子节点（非根节点）的最大序号
// ============================================================
export function getNextGlobalChildName() {
  let maxNum = 0;
  const roots = appState.methodsTree?.children || [];

  function walkChildren(node) {
    if (!node.children) return;
    node.children.forEach(child => {
      const match = child.name.match(/^子节点(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
      walkChildren(child);
    });
  }

  roots.forEach(root => walkChildren(root));
  return '子节点' + (maxNum + 1);
}

// ============================================================
//  计算子节点的序号名称（仅用于特殊场景，如步骤节点）
// ============================================================
export function getNextChildName(parentNode, pattern, prefix, startIndex) {
  const children = parentNode.children || [];
  let maxNum = 0;
  children.forEach(child => {
    const match = child.name.match(pattern);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  });
  return prefix + (maxNum + 1);
}

// 暴露给 AI Agent 调用
window.createNodeInProject = createNodeInProject;
