// ============================================================
//  移动模式共享状态
// ============================================================
import * as THREE from 'three';
import { appState } from '../module0_AppState.js';

// 从 raycaster 结果中找到带有 userData.id 的命中对象（向上遍历父级）
export function getHitNodeId(hits) {
  for (const hit of hits) {
    let obj = hit.object;
    while (obj) {
      if (obj.userData && obj.userData.id) return obj.userData.id;
      obj = obj.parent;
    }
  }
  return null;
}

// 移动模式状态
export let isMoveMode = false;
export let lastBlankMenuMouse = { x: 0, y: 0 };
export let moveTargetId = null;
export let moveInitialPositions3D = null;

export function setIsMoveMode(v) { isMoveMode = v; }
export function setLastBlankMenuMouse(x, y) { lastBlankMenuMouse.x = x; lastBlankMenuMouse.y = y; }
export function setMoveTargetId(id) { moveTargetId = id; }
export function setMoveInitialPositions3D(m) { moveInitialPositions3D = m; }

// DOM 引用
export const moveControlBar = document.getElementById('moveControlBar');
export const renameToggleBtn = document.getElementById('contextRenameToggleBtn');
export const contextRenameInput = document.getElementById('contextRenameInput');
export const contextNodeNameSpan = document.getElementById('contextNodeName');

// 3D 拖拽 / 旋转状态
export let drag3DNode = false;
export const drag3DStart = new THREE.Vector2();
export const drag3DStartPos = new THREE.Vector3();
export let isRotatingView3D = false;
export const rotateStartMouse = new THREE.Vector2();
export const rotateStartCamPos = new THREE.Vector3();
export const rotateStartTarget = new THREE.Vector3();
export const ray = new THREE.Raycaster();
export const mouse = new THREE.Vector2();

export function setDrag3DNode(v) { drag3DNode = v; }
export function setIsRotatingView3D(v) { isRotatingView3D = v; }

// 3D 拖拽：标记是否实际移动过（防止点击触发防重叠）
export let drag3DWasMoved = false;
export function setDrag3DWasMoved(v) { drag3DWasMoved = v; }

// 3D 拖拽：射线-平面交点（用于精确跟踪光标）
export const dragPlane = new THREE.Plane();
export const dragPlaneHit = new THREE.Vector3();
// 每次拖动开始时鼠标在平面上的初始交点（用于偏移基准）
export const dragPlaneStartHit = new THREE.Vector3();
// 每次拖动开始时所有受影响节点的当前位置（与 moveInitialPositions3D 分离，用于取消恢复）
export const dragStartPositions = new Map();

// 长按旋转
export let longPressTimer = null;
export let longPressStartPos = { x: 0, y: 0 };
export let isLongPressRotating = false;
export const longPressRotateStart = new THREE.Vector2();
export const longPressRotateCamStart = new THREE.Vector3();
export const longPressRotateTargetStart = new THREE.Vector3();
export const LONG_PRESS_DURATION = 250;

export function setLongPressTimer(t) { longPressTimer = t; }
export function setLongPressStartPos(x, y) { longPressStartPos.x = x; longPressStartPos.y = y; }
export function setIsLongPressRotating(v) { isLongPressRotating = v; }