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
} from '../../../module5_SelectAndEdit.js';
import {
  showBlankContextMenu, hideBlankContextMenu, showContextMenu, hideContextMenu,
  completeConvertChildMode, cancelConvertChildMode
} from '../../../module8_ContextMenu.js';
import { openRichEditor } from '../../../richEditor/index.js';
import { showLineTooltip, hideLineTooltip } from '../../LineTooltip.js';
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

export function bindClickHandlers() {
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
    if (appState.is2DView) return;
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
