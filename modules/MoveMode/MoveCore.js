// ============================================================
//  移动模式核心、节点工厂、事件绑定
// ============================================================
import * as THREE from 'three';
import { appState } from '../module0_AppState.js';
import { currentMouseWorld } from '../2DView/shared.js';
import { withHistory } from '../module3_History.js';
import { saveCurrentProjectData } from '../module2_TreeData.js';
import { generateRandomPosition, createNodeMesh, destroyNodeMesh, rebuildAllLines, addSingleTreeLine, updateLinesForNodes } from '../VisualComponents/index.js';
import { clearSelected, setSelectedNode, getPrimarySelectedId, updateSelectionUI, deleteSelectedNodes, showToast, addNode, renamePrimaryNode, toggleChildren, expandAllNodes, completeAddConnection, completeRemoveConnection, cancelConnectionMode } from '../module5_SelectAndEdit.js';
import { hideBlankContextMenu, showBlankContextMenu, showContextMenu, hideContextMenu, completeConvertChildMode, cancelConvertChildMode } from '../module8_ContextMenu.js';
import { openRichEditor } from '../richEditor/index.js';
import { showLineTooltip, hideLineTooltip } from './LineTooltip.js';
import {
  getHitNodeId,
  isMoveMode, setIsMoveMode,
  lastBlankMenuMouse, setLastBlankMenuMouse,
  moveTargetId, setMoveTargetId,
  moveInitialPositions3D, setMoveInitialPositions3D,
  moveControlBar,
  renameToggleBtn, contextRenameInput, contextNodeNameSpan,
  drag3DNode, setDrag3DNode,
  drag3DStart, drag3DStartPos,
  isRotatingView3D, setIsRotatingView3D,
  drag3DWasMoved, setDrag3DWasMoved,
  dragPlane, dragPlaneHit,
  dragPlaneStartHit, dragStartPositions,
  rotateStartMouse, rotateStartCamPos, rotateStartTarget,
  ray, mouse,
  longPressTimer, setLongPressTimer,
  longPressStartPos, setLongPressStartPos,
  isLongPressRotating, setIsLongPressRotating,
  longPressRotateStart, longPressRotateCamStart, longPressRotateTargetStart,
  LONG_PRESS_DURATION
} from './shared.js';

// ========== 工具函数 ==========

function collectDescendants(rootId) {
  const ids = new Set();
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop();
    if (!ids.has(id)) {
      ids.add(id);
      const node = appState.nodeMap.get(id);
      if (node && node.children) node.children.forEach(ch => stack.push(ch.id));
    }
  }
  return ids;
}

function resolveOverlapAfterMove(movedRootId) {
  const movedIds = collectDescendants(movedRootId);
  const movedSet = new Set(movedIds);
  const allNodes = Array.from(appState.nodeMeshes.keys());
  const iterations = 5;
  for (let iter = 0; iter < iterations; iter++) {
    let anyOverlap = false;
    for (const id of movedIds) {
      const movedObj = appState.nodeMeshes.get(id);
      if (!movedObj) continue;
      const movedScale = (appState.nodeMap.get(id)?.sizeScale || 1);
      const movedRadius = (appState.NODE_RADIUS + 0.22 + 0.022) * movedScale;
      const movedPos = appState.positions.get(id);
      if (!movedPos) continue;
      for (const otherId of allNodes) {
        if (movedSet.has(otherId)) continue;
        const otherObj = appState.nodeMeshes.get(otherId);
        if (!otherObj || !otherObj.mesh.visible) continue;
        const otherScale = (appState.nodeMap.get(otherId)?.sizeScale || 1);
        const otherRadius = (appState.NODE_RADIUS + 0.22 + 0.022) * otherScale;
        const otherPos = appState.positions.get(otherId);
        if (!otherPos) continue;
        const delta = new THREE.Vector3().subVectors(movedPos, otherPos);
        const dist = delta.length();
        const minDist = movedRadius + otherRadius;
        if (dist < minDist && dist > 0.001) {
          anyOverlap = true;
          const pushDir = delta.normalize();
          const overlap = minDist - dist;
          movedPos.add(pushDir.clone().multiplyScalar(overlap));
          movedObj.mesh.position.copy(movedPos);
          if (movedObj.label) movedObj.label.position.set(movedPos.x, movedPos.y + appState.NODE_RADIUS + 0.28, movedPos.z);
        }
      }
    }
    if (!anyOverlap) break;
  }
  // 🔧 增量更新：只刷新被移动节点涉及的连线，避免销毁重建其余连线
  updateLinesForNodes([...movedIds]);
}

// ========== 移动模式 ==========

function enterMoveMode(nodeId) {
  if (!appState.nodeMap.has(nodeId)) return;
  hideContextMenu();
  setMoveTargetId(nodeId);
  setIsMoveMode(true);
  moveControlBar.style.display = 'flex';
  // 保持 controls 启用，让空白拖动走 OrbitControls 原生旋转逻辑
  setMoveInitialPositions3D(new Map());
  for (let [id, pos] of appState.positions.entries()) {
    moveInitialPositions3D.set(id, pos.clone());
  }
}

function exitMoveMode(save) {
  if (!isMoveMode) return;
  if (!save) {
    if (moveInitialPositions3D) {
      for (let [id, pos] of moveInitialPositions3D.entries()) {
        appState.positions.set(id, pos.clone());
        const obj = appState.nodeMeshes.get(id);
        if (obj) {
          obj.mesh.position.copy(pos);
          if (obj.label) obj.label.position.set(pos.x, pos.y + appState.NODE_RADIUS + 0.28, pos.z);
        }
      }
      updateLinesForNodes([...moveInitialPositions3D.keys()]);
    }
  } else {
    updateLinesForNodes([...moveInitialPositions3D.keys()]);
    saveCurrentProjectData();
  }
  setIsMoveMode(false);
  setMoveTargetId(null);
  setMoveInitialPositions3D(null);
  moveControlBar.style.display = 'none';
  appState.controls.enabled = true;
}

function saveRenameAndRestore() {
  if (contextRenameInput.style.display === 'none') return;
  const newName = contextRenameInput.value.trim();
  if (newName && appState.contextTargetId) renamePrimaryNode(newName);
  contextNodeNameSpan.style.display = 'inline';
  contextRenameInput.style.display = 'none';
}

// ========== 节点创建工厂（消除 9 个按钮的重复代码） ==========

function generateNodeId() {
  let newId = 'N' + Date.now() + Math.floor(Math.random() * 10000);
  while (appState.nodeMap.has(newId)) newId = 'N' + Date.now() + Math.floor(Math.random() * 10000);
  return newId;
}

/**
 * 在 3D 场景中根据鼠标位置或随机位置放置节点
 */
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
    let existing = Array.from(appState.positions.values());
    let base = basePos || new THREE.Vector3(0, 0, 0);
    let newPos = generateRandomPosition(existing, base);
    appState.positions.set(newId, newPos);
  }
}

/**
 * 在 2D 场景中放置节点
 */
function placeNodeIn2D(newId, parentId, offsetX, offsetY) {
  // 子节点：放在父节点附近（固定偏移）
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

/**
 * 创建节点并添加到项目和场景
 */
export function createNodeInProject({ name, desc, sizeScale, nodeType, blockType, isStepFlow, parentId, offsetX, offsetY, asNextStep }) {
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
    }

    // 增量添加连线，避免销毁重建导致其他连线粒子动画重置
    if (parentId && parentId !== appState.VIRTUAL_ROOT_ID) {
      addSingleTreeLine(parentId, newId);
    }
    saveCurrentProjectData();

    if (parentId) {
      hideContextMenu();
      if (appState.refreshTreePanel) appState.refreshTreePanel();
    } else {
      hideBlankContextMenu();
      if (appState.refreshTreePanel) appState.refreshTreePanel();
    }
    if (appState.is2DView && appState.refresh2DView) appState.refresh2DView();
  });
  doAdd();
}

/**
 * 计算子节点的序号名称
 */
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

// ========== 初始化事件绑定 ==========

export function initMoveMode() {
  // 注册退出移动模式的钩子，供 history 模块在撤销/重做时自动退出移动模式
  appState.exitMoveMode = (save) => exitMoveMode(save);

  if (renameToggleBtn) {
    renameToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      contextNodeNameSpan.style.display = 'none';
      contextRenameInput.style.display = 'inline-block';
      contextRenameInput.focus();
      contextRenameInput.select();
    });
  }
  if (contextRenameInput) {
    contextRenameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        saveRenameAndRestore();
      } else if (e.key === 'Escape') {
        contextRenameInput.value = appState.nodeMap.get(appState.contextTargetId)?.name || '';
        e.stopPropagation();
        saveRenameAndRestore();
      }
    });
    contextRenameInput.addEventListener('mousedown', (e) => e.stopPropagation());
    contextRenameInput.addEventListener('click', (e) => e.stopPropagation());
    contextRenameInput.addEventListener('blur', () => saveRenameAndRestore());
  }

  // ---- 空白处右键菜单：添加根节点按钮 ----
  const addRootBtn = document.getElementById('addRootNodeBtn');
  if (addRootBtn) {
    addRootBtn.addEventListener('click', () => createNodeInProject({ name: '新根节点', desc: '📖 顶层节点', sizeScale: 1.5 }));
  }

  const addStepRootBtn = document.getElementById('addStepRootNodeBtn');
  if (addStepRootBtn) {
    addStepRootBtn.addEventListener('click', () => createNodeInProject({ name: '下一步1', desc: '📖 步骤节点', sizeScale: 1.5, isStepFlow: true }));
  }

  const addBlockRootBtn = document.getElementById('addBlockRootNodeBtn');
  if (addBlockRootBtn) {
    addBlockRootBtn.addEventListener('click', () => createNodeInProject({ name: '新块节点', desc: '📦 块编辑器节点', sizeScale: 1.5, nodeType: 'block' }));
  }

  const addVideoRootBtn = document.getElementById('addVideoRootNodeBtn');
  if (addVideoRootBtn) {
    addVideoRootBtn.addEventListener('click', () => createNodeInProject({ name: '新视频块节点', desc: '🎬 视频播放器节点', sizeScale: 1.5, nodeType: 'block', blockType: 'video' }));
  }

  const addBlockStepRootBtn = document.getElementById('addBlockStepRootNodeBtn');
  if (addBlockStepRootBtn) {
    addBlockStepRootBtn.addEventListener('click', () => createNodeInProject({ name: '块步骤 1', desc: '📦 块编辑器步骤节点', sizeScale: 1.5, nodeType: 'block', isStepFlow: true }));
  }

  // ---- 空白处右键菜单：粘贴节点 ----
  const pasteBtn = document.getElementById('pasteNodeBtn');
  if (pasteBtn) {
    pasteBtn.addEventListener('click', () => {
      pasteNodes();
      hideBlankContextMenu();
    });
  }

  // ---- 空白处右键菜单：设置 ----
  const blankSettingsBtn = document.getElementById('blankSettingsBtn');
  if (blankSettingsBtn) {
    blankSettingsBtn.addEventListener('click', () => {
      hideBlankContextMenu();
      const glowBtn = document.getElementById('toggleNodeGlowBtn');
      if (glowBtn) glowBtn.click();
    });
  }

  // ---- 右键菜单：操作按钮 ----
  document.getElementById('toggleChildrenContextBtn')?.addEventListener('click', () => {
    if (!appState.contextTargetId) return;
    toggleChildren();
  });
  // 展开全部节点（任务栏 🔼 弹出框中的 ⊞ 按钮）
  document.getElementById('expandAllNodesBtn')?.addEventListener('click', () => {
    expandAllNodes();
  });
  document.getElementById('deleteNodeContextBtn')?.addEventListener('click', () => {
    if (appState.contextTargetId) deleteSelectedNodes();
  });
  document.getElementById('copyNodeBtn')?.addEventListener('click', () => {
    copySelectedNodes();
    hideContextMenu();
  });
  document.getElementById('moveNodeBtn')?.addEventListener('click', () => {
    if (!appState.contextTargetId) return;
    if (appState.contextTargetId === 'multi') {
      if (appState.is2DView && appState.startMultiNodeMove) {
        appState.startMultiNodeMove();
        return;
      }
      const primaryId = getPrimarySelectedId();
      if (primaryId) enterMoveMode(primaryId);
      return;
    }
    enterMoveMode(appState.contextTargetId);
  });

  // ---- 右键菜单：添加子节点 ----
  document.getElementById('addChildNodeBtn')?.addEventListener('click', () => {
    if (!appState.contextTargetId) return;
    const parentId = appState.contextTargetId;
    const parentNode = appState.nodeMap.get(parentId);
    if (!parentNode) return;
    const childName = getNextChildName(parentNode, /^子节点(\d+)$/, '子节点');
    createNodeInProject({
      name: childName, desc: '📖 自定义节点', sizeScale: 1.0,
      parentId, offsetX: 160, offsetY: 10
    });
  });

  // ---- 右键菜单：添加下一步节点 ----
  document.getElementById('addNextNodeBtn')?.addEventListener('click', () => {
    if (!appState.contextTargetId) return;
    const parentId = appState.contextTargetId;
    const parentNode = appState.nodeMap.get(parentId);
    if (!parentNode) return;
    const nextName = getNextChildName(parentNode, /^下一步(\d+)$/, '下一步');
    createNodeInProject({
      name: nextName, desc: '📖 自定义节点', sizeScale: 1.0,
      parentId, offsetX: 0, offsetY: 60, isStepFlow: true
    });
  });

  // ---- 移动模式控制栏 ----
 document.getElementById('moveConfirmBtn')?.addEventListener('click', () => exitMoveMode(true));
 document.getElementById('moveCancelBtn')?.addEventListener('click', () => exitMoveMode(false));

  // ---- 选中节点大小/速度/颜色滑块 ----
  const nodeSizeSlider = document.getElementById('nodeSizeSlider');
  const nodeSizeValue = document.getElementById('nodeSizeValue');
  const ringSpeedSlider = document.getElementById('ringSpeedSlider');
  const ringSpeedValue = document.getElementById('ringSpeedValue');
  const nodeFixedColorPicker = document.getElementById('nodeFixedColorPicker');
  const clearColorBtn = document.getElementById('clearNodeFixedColorBtn');

  function applySliderToSelected(value, isSize) {
    if (appState.contextTargetId === 'multi') {
      for (const sid of appState.selectedNodeIds) {
        const node = appState.nodeMap.get(sid);
        if (node) {
          if (isSize) node.sizeScale = parseFloat(value);
          else node.ringSpeedFactor = parseFloat(value);
        }
        const obj = appState.nodeMeshes.get(sid);
        if (obj) {
          const scale = appState.nodeMap.get(sid)?.sizeScale || 1;
          obj.mesh.scale.set(scale, scale, scale);
        }
      }
      saveCurrentProjectData();
      rebuildAllLines();
      if (appState.is2DView && appState.refresh2DView) appState.refresh2DView();
    } else {
      const id = appState.contextTargetId;
      if (!id) return;
      const node = appState.nodeMap.get(id);
      if (!node) return;
      if (isSize) node.sizeScale = parseFloat(value);
      else node.ringSpeedFactor = parseFloat(value);
      const obj = appState.nodeMeshes.get(id);
      if (obj) {
        const scale = node.sizeScale || 1;
        obj.mesh.scale.set(scale, scale, scale);
      }
      saveCurrentProjectData();
      rebuildAllLines();
      if (appState.is2DView && appState.refresh2DView) appState.refresh2DView();
    }
  }

  if (nodeSizeSlider) {
    nodeSizeSlider.addEventListener('input', () => {
      const v = nodeSizeSlider.value;
      nodeSizeValue.textContent = parseFloat(v).toFixed(1);
      applySliderToSelected(v, true);
    });
  }
  if (ringSpeedSlider) {
    ringSpeedSlider.addEventListener('input', () => {
      const v = ringSpeedSlider.value;
      ringSpeedValue.textContent = parseFloat(v).toFixed(1);
      applySliderToSelected(v, false);
    });
  }
  if (nodeFixedColorPicker) {
    nodeFixedColorPicker.addEventListener('input', () => {
      const color = nodeFixedColorPicker.value;
      for (const sid of appState.selectedNodeIds) {
        const node = appState.nodeMap.get(sid);
        if (node) node.fixedColor = color;
        const obj = appState.nodeMeshes.get(sid);
        if (obj && obj.mesh.material) obj.mesh.material.color.set(color);
      }
      saveCurrentProjectData();
      if (appState.refresh2DView) appState.refresh2DView();
      if (appState.refreshTreePanel) appState.refreshTreePanel();
    });
  }
  if (clearColorBtn) {
    clearColorBtn.addEventListener('click', () => {
      for (const sid of appState.selectedNodeIds) {
        const node = appState.nodeMap.get(sid);
        if (node) node.fixedColor = null;
        const obj = appState.nodeMeshes.get(sid);
        if (obj && obj.mesh.material) obj.mesh.material.color.set('#ff6600');
      }
      if (nodeFixedColorPicker) nodeFixedColorPicker.value = '#ffffff';
      saveCurrentProjectData();
      rebuildAllLines();
      if (appState.refresh2DView) appState.refresh2DView();
      if (appState.refreshTreePanel) appState.refreshTreePanel();
    });
  }

  // ---- 连接模式按钮 ----
  document.getElementById('addConnectionContextBtn')?.addEventListener('click', () => {
    if (!appState.contextTargetId) return;
    appState.connectionMode = 'add';
    appState.connectionSourceId = appState.contextTargetId;
    showToast('点击另一个节点建立连接');
    hideContextMenu();
  });
  document.getElementById('removeConnectionContextBtn')?.addEventListener('click', () => {
    if (!appState.contextTargetId) return;
    appState.connectionMode = 'remove';
    appState.connectionSourceId = appState.contextTargetId;
    showToast('点击另一个节点移除连接');
    hideContextMenu();
  });

  // ---- 定位到另一个视图（先切换视图再居中节点） ----
  document.getElementById('locateOtherViewBtn')?.addEventListener('click', () => {
    if (!appState.contextTargetId) return;
    const id = appState.contextTargetId;
    if (appState.is2DView) {
      // 2D -> 切换到3D并居中
      if (appState.hide2DView) appState.hide2DView();
      if (appState.camera && appState.controls) {
        const pos = appState.positions.get(id);
        if (pos) {
          appState.camera.position.set(pos.x, pos.y + 5, pos.z + 5);
          appState.controls.target.copy(pos);
          appState.controls.enableDamping = false;
          appState.controls.update();
          appState.controls.enableDamping = true;
        }
      }
    } else {
      // 3D -> 切换到2D并居中
      if (appState.show2DView) appState.show2DView(true); // 无动画快速切换
      if (appState.focusOnNode2D && appState.positions2D.has(id)) {
        // 延迟一帧等2D视图渲染完成
        requestAnimationFrame(() => appState.focusOnNode2D(id));
      }
    }
    hideContextMenu();
  });

  // ---- 对齐按钮 ----
  document.getElementById('alignRowHorizontal')?.addEventListener('click', () => {
    if (!appState.selectedNodeIds.size) return;
    const ids = Array.from(appState.selectedNodeIds);
    if (ids.length < 2) return;
    const midY = ids.reduce((sum, id) => sum + (appState.positions.get(id)?.y || 0), 0) / ids.length;
    for (const id of ids) {
      const pos = appState.positions.get(id);
      if (pos) {
        pos.y = midY;
        const obj = appState.nodeMeshes.get(id);
        if (obj) {
          obj.mesh.position.y = midY;
          if (obj.label) obj.label.position.set(pos.x, pos.y + appState.NODE_RADIUS + 0.28, pos.z);
        }
      }
    }
    rebuildAllLines();
    saveCurrentProjectData();
    hideContextMenu();
  });

  document.getElementById('alignRowVertical')?.addEventListener('click', () => {
    if (!appState.selectedNodeIds.size) return;
    const ids = Array.from(appState.selectedNodeIds);
    if (ids.length < 2) return;
    const midX = ids.reduce((sum, id) => sum + (appState.positions.get(id)?.x || 0), 0) / ids.length;
    for (const id of ids) {
      const pos = appState.positions.get(id);
      if (pos) {
        pos.x = midX;
        const obj = appState.nodeMeshes.get(id);
        if (obj) {
          obj.mesh.position.x = midX;
          if (obj.label) obj.label.position.set(pos.x, pos.y + appState.NODE_RADIUS + 0.28, pos.z);
        }
      }
    }
    rebuildAllLines();
    saveCurrentProjectData();
    hideContextMenu();
  });

  document.getElementById('groupRow')?.addEventListener('click', () => {
    if (!appState.selectedNodeIds.size) return;
    const ids = Array.from(appState.selectedNodeIds);
    if (ids.length < 2) return;
    const parentNode = appState.nodeMap.get(appState.contextTargetId);
    if (!parentNode) return;
    const groupName = parentNode.name + ' 分组';
    const groupId = 'G' + Date.now() + Math.floor(Math.random() * 10000);
    while (appState.nodeMap.has(groupId)) groupId = 'G' + Date.now() + Math.floor(Math.random() * 10000);
    const groupNode = { id: groupId, name: groupName, desc: '📁 分组节点', children: [], sizeScale: 2.0, ringSpeedFactor: 1.0, fixedColor: null };
    appState.nodeMap.set(groupId, groupNode);
    if (!parentNode.children) parentNode.children = [];
    const groupIdx = parentNode.children.length;
    parentNode.children.push(groupNode);
    for (const childId of ids) {
      const childNode = appState.nodeMap.get(childId);
      if (!childNode) continue;
      const idx = parentNode.children.indexOf(childNode);
      if (idx >= 0) parentNode.children.splice(idx, 1);
      groupNode.children.push(childNode);
    }
    const avgPos = new THREE.Vector3(0, 0, 0);
    let count = 0;
    for (const id of ids) {
      const pos = appState.positions.get(id);
      if (pos) { avgPos.add(pos); count++; }
    }
    if (count) {
      avgPos.divideScalar(count);
      avgPos.y += 3;
      appState.positions.set(groupId, avgPos);
      createNodeMesh(groupNode, avgPos);
    }
    rebuildAllLines();
    saveCurrentProjectData();
    hideContextMenu();
    if (appState.is2DView && appState.refresh2DView) appState.refresh2DView();
    if (appState.refreshTreePanel) appState.refreshTreePanel();
  });

  document.getElementById('splitScreenRow')?.addEventListener('click', () => {
    if (!appState.selectedNodeIds.size) return;
    const ids = Array.from(appState.selectedNodeIds);
    if (ids.length < 2) return;
    appState.splitScreenNodeIds = ids;
    appState.splitScreenNodeIndex = 0;
    if (appState.openSplitScreenPanel) appState.openSplitScreenPanel();
    hideContextMenu();
  });

  // ========== 3D 鼠标/触摸事件 ==========
  const rendererDom = appState.renderer?.domElement;
  if (!rendererDom) return;

  // pointerdown（capture 阶段）：在 OrbitControls 之前拦截节点点击
  rendererDom.addEventListener('pointerdown', (e) => {
    if (appState.is2DView) return;
    if (e.button !== 0) return;
    if (e.target.closest('#editorPanel,#richEditorModal,input,textarea,[contenteditable="true"]')) return;
    if (!isMoveMode && !appState.layer3DLayout) return;

    mouse.x = (e.clientX / rendererDom.clientWidth) * 2 - 1;
    mouse.y = -(e.clientY / rendererDom.clientHeight) * 2 + 1;
    ray.setFromCamera(mouse, appState.camera);
    const spheres = Array.from(appState.nodeMeshes.values()).map(v => v.mesh);
    const hits = ray.intersectObjects(spheres);
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
    const spheres = Array.from(appState.nodeMeshes.values()).map(v => v.mesh);
    const hits = ray.intersectObjects(spheres);
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
    if (isMoveMode) return;
    if (appState.connectionMode) {
      cancelConnectionMode();
      return;
    }
    if (appState.convertChildMode) {
      cancelConvertChildMode();
      return;
    }
    mouse.x = (e.clientX / rendererDom.clientWidth) * 2 - 1;
    mouse.y = -(e.clientY / rendererDom.clientHeight) * 2 + 1;
    ray.setFromCamera(mouse, appState.camera);
    const spheres = Array.from(appState.nodeMeshes.values()).map(v => v.mesh);
    const hits = ray.intersectObjects(spheres);
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
      let spheres = Array.from(appState.nodeMeshes.values()).map(v => v.mesh);
      let hits = ray.intersectObjects(spheres);
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
      let spheres = Array.from(appState.nodeMeshes.values()).map(v => v.mesh);
      let hits = ray.intersectObjects(spheres);
      if (hits.length) {
        let targetId = getHitNodeId(hits);
        if (targetId) completeConvertChildMode(targetId);
      }
      return;
    }

    const lineMeshes = appState.lineItems.map(it => it.line.mesh);
    const lineHits = ray.intersectObjects(lineMeshes);
    if (lineHits.length > 0) {
      const mesh = lineHits[0].object;
      const ud = mesh.userData;
      if (ud && ud.startId && ud.endId) {
        showLineTooltip(e.clientX, e.clientY, ud);
        return;
      }
    }

    const lineTooltipEl = document.getElementById('lineTooltip');
    if (lineTooltipEl && lineTooltipEl.style.display === 'block') {
      hideLineTooltip();
    }

    let spheres = Array.from(appState.nodeMeshes.values()).map(v => v.mesh);
    let hits = ray.intersectObjects(spheres);
    if (hits.length) {
      const id = getHitNodeId(hits);
      if (id) setSelectedNode(id, e.ctrlKey);
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
    let spheres = Array.from(appState.nodeMeshes.values()).map(v => v.mesh);
    let hits = ray.intersectObjects(spheres);
    if (hits.length) {
      const id = getHitNodeId(hits);
      if (id) openRichEditor(id);
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

// 挂载到全局状态，供2D视图调用
appState.showLineTooltip = showLineTooltip;
appState.hideLineTooltip = hideLineTooltip;

// ========== 复制粘贴功能 ==========

/**
 * 深拷贝节点树，保留 _oldId 用于粘贴时重建父子关系
 */
function deepCloneNode(node) {
  const clone = {
    _oldId: node._oldId || node.id,
    name: node.name,
    desc: node.desc || '',
    children: [],
    sizeScale: node.sizeScale || 1.0,
    ringSpeedFactor: node.ringSpeedFactor ?? 1.0,
    fixedColor: node.fixedColor || null
  };
  if (node.nodeType) clone.nodeType = node.nodeType;
  if (node.blockType) clone.blockType = node.blockType;
  if (node.isStepFlow) clone.isStepFlow = true;
  if (node.richContent) clone.richContent = node.richContent;
  if (node.children) {
    clone.children = node.children.map(child => deepCloneNode(child));
  }
  return clone;
}

/**
 * 复制当前选中的节点到剪贴板
 * - 框选时自动包含所有子节点
 * - 保存 3D/2D 位置和 crossEdges
 */
export function copySelectedNodes() {
  const selectedIds = appState.selectedNodeIds.size > 0
    ? Array.from(appState.selectedNodeIds)
    : (appState.contextTargetId ? [appState.contextTargetId] : []);

  if (selectedIds.length === 0) {
    showToast('没有选中任何节点');
    return;
  }

  // 1. 收集所有需要复制的 ID：选中节点 + 所有子孙节点
  const allIds = new Set(selectedIds);
  function collectDescendants(node) {
    if (node.children) node.children.forEach(child => {
      allIds.add(child.id);
      collectDescendants(child);
    });
  }
  for (const id of selectedIds) {
    const node = appState.nodeMap.get(id);
    if (node) collectDescendants(node);
  }

  // 2. 建立父子关系映射
  const parentMap = {};
  function buildParentMap(node, parentId) {
    if (parentId && parentId !== appState.VIRTUAL_ROOT_ID) {
      parentMap[node.id] = parentId;
    }
    if (node.children) node.children.forEach(c => buildParentMap(c, node.id));
  }
  buildParentMap(appState.methodsTree, null);

  // 3. 克隆每个选中节点，只保留在 allIds 中的子节点
  function cloneWithFilteredChildren(node) {
    const clone = deepCloneNode(node);
    if (clone.children) {
      clone.children = clone.children
        .filter(c => allIds.has(c._oldId))
        .map(c => cloneWithFilteredChildren(c));
    }
    return clone;
  }

  const nodeDataList = selectedIds
    .map(id => appState.nodeMap.get(id))
    .filter(Boolean)
    .map(node => cloneWithFilteredChildren(node));

  // 4. 确定哪些原本选中节点应粘贴为根节点（父节点不在复制集中）
  const trueRootOldIds = new Set(selectedIds.filter(id => {
    const pid = parentMap[id];
    return !pid || !allIds.has(pid);
  }));

  // 5. 保存位置
  const savedPositions2D = {};
  const savedPositions = {};
  for (const id of allIds) {
    if (appState.positions2D.has(id)) {
      const p = appState.positions2D.get(id);
      savedPositions2D[id] = { x: p.x, y: p.y };
    }
    if (appState.positions.has(id)) {
      savedPositions[id] = appState.positions.get(id).clone();
    }
  }

  // 6. 保存复制集内部的 crossEdges
  const savedCrossEdges = appState.crossEdges
    .filter(e => allIds.has(e.source) && allIds.has(e.target))
    .map(e => ({ ...e }));

  // 7. 存入剪贴板
  appState.clipboard = {
    nodeDataList,
    trueRootOldIds,
    allOldIds: new Set(allIds),
    parentMap,
    positions2D: savedPositions2D,
    positions: savedPositions,
    crossEdges: savedCrossEdges
  };

  showToast(`已复制 ${selectedIds.length} 个节点${allIds.size > selectedIds.length ? `（含子节点共 ${allIds.size} 个）` : ''}`);
}

/**
 * 递归处理一个克隆节点：分配新 ID、创建 mesh、设置位置
 * @returns {Object} 新节点（id 已替换）
 */
function pasteNodeTree(clonedNode, idMap, offX, offY, offZ, offX2d, offY2d, existingPositions) {
  const oldId = clonedNode._oldId;
  const newId = generateNodeId();
  idMap[oldId] = newId;

  const newNode = { ...clonedNode, id: newId };
  delete newNode._oldId;

  // 设置 2D 位置（使用独立的 2D 偏移）
  const clip = appState.clipboard;
  if (clip.positions2D[oldId]) {
    const op = clip.positions2D[oldId];
    appState.positions2D.set(newId, { x: op.x + offX2d, y: op.y + offY2d });
  }

  // 设置 3D 位置
  if (clip.positions[oldId]) {
    const op = clip.positions[oldId];
    appState.positions.set(newId, new THREE.Vector3(
      op.x + offX, op.y + offY, op.z + offZ
    ));
  } else {
    const randPos = generateRandomPosition(existingPositions, new THREE.Vector3(0, 0, 0));
    appState.positions.set(newId, randPos);
  }

  appState.nodeMap.set(newId, newNode);
  appState.addNodeToCurrentLayer(newId);

  const pos = appState.positions.get(newId);
  createNodeMesh(newNode, pos);

  // 递归处理子节点
  if (newNode.children) {
    newNode.children = newNode.children.map(child =>
      pasteNodeTree(child, idMap, offX, offY, offZ, offX2d, offY2d, existingPositions)
    );
  }

  return newNode;
}

/**
 * 粘贴剪贴板中的节点。
 * - 若子节点的父节点也在复制集中 → 保持父子关系
 * - 若子节点的父节点不在复制集中 → 粘贴为根节点
 * - 保持原始相对布局位置
 */
export function pasteNodes() {
  const clip = appState.clipboard;
  if (!clip || !clip.nodeDataList || clip.nodeDataList.length === 0) {
    showToast('剪贴板为空');
    return;
  }

  withHistory(() => {
    const idMap = {};
    const existingPositions = Array.from(appState.positions.values());

    // 计算复制集中心点（3D），对其应用偏移防止重叠
    let sumX = 0, sumY = 0, sumZ = 0, count3d = 0;
    for (const oldId of clip.allOldIds) {
      const p = clip.positions[oldId];
      if (p) { sumX += p.x; sumY += p.y; sumZ += p.z; count3d++; }
    }
    const ctrX = count3d ? sumX / count3d : 0;
    const ctrY = count3d ? sumY / count3d : 0;
    const ctrZ = count3d ? sumZ / count3d : 0;
    const offX = -ctrX + 3;
    const offY = -ctrY;
    const offZ = -ctrZ + 3;

    // 计算 2D 位置中心偏移（2D 模式下粘贴到鼠标光标位置，否则使用固定偏移）
    let sum2dX = 0, sum2dY = 0, count2d = 0;
    for (const oldId of clip.allOldIds) {
      const p = clip.positions2D[oldId];
      if (p) { sum2dX += p.x; sum2dY += p.y; count2d++; }
    }
    const ctr2dX = count2d ? sum2dX / count2d : 0;
    const ctr2dY = count2d ? sum2dY / count2d : 0;
    const off2dX = appState.is2DView ? (currentMouseWorld.x - ctr2dX) : (-ctr2dX + 80);
    const off2dY = appState.is2DView ? (currentMouseWorld.y - ctr2dY) : (-ctr2dY + 80);

    // 只处理「真·根节点」（其父不在复制集中）
    for (const clonedNode of clip.nodeDataList) {
      const oldId = clonedNode._oldId;
      if (clip.trueRootOldIds.has(oldId)) {
        const newNode = pasteNodeTree(clonedNode, idMap, offX, offY, offZ, off2dX, off2dY, existingPositions);
        if (!appState.methodsTree.children) appState.methodsTree.children = [];
        appState.methodsTree.children.push(newNode);
      }
    }

    // 复制 crossEdges
    for (const edge of clip.crossEdges) {
      const newSource = idMap[edge.source];
      const newTarget = idMap[edge.target];
      if (newSource && newTarget) {
        appState.crossEdges.push({
          source: newSource,
          target: newTarget,
          label: edge.label || '',
          labelHidden: edge.labelHidden !== false,
          customColor: edge.customColor || null
        });
      }
    }

    rebuildAllLines();
    saveCurrentProjectData();
    if (appState.refreshTreePanel) appState.refreshTreePanel();
    if (appState.is2DView && appState.refresh2DView) appState.refresh2DView();

    showToast(`已粘贴 ${clip.trueRootOldIds.size} 个节点`);
  })();
}