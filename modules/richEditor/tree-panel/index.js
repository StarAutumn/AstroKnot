// ============================================================
//  richEditor/tree-panel/index.js — 树形面板 2D 视图入口
//  - 由原 richEditor/tree-panel.js 拆分：初始化/窗口级监听仍在此文件
//  - 绘制见 draw-nodes.js / render.js，交互见 interact.js，层数条见 layer-strip.js
//  - 底部 re-export 全部 16 个对外导出，外部导入语义与原单文件完全一致
// ============================================================
import { appState } from '../../module0_AppState.js';
import { setSelectedNode, clearSelected, showToast } from '../../SelectAndEdit/index.js';
import { openRichEditor } from '../index.js';
import { showContextMenu, hideContextMenu, showBlankContextMenu, hideBlankContextMenu } from '../../module8_ContextMenu.js';
import { instances, createState, getActiveState, getWindowListenersInited, setWindowListenersInited, getDraggingInstanceId, setDraggingInstanceId } from './share.js';
import { drawSidebar2D, toggleSidebarCollapse } from './render.js';
import { initLayerStrip } from './layer-strip.js';

export { refreshSidebar2DView, processSidebar2DPanning } from './render.js';
export { setSidebar2DKey, isSidebar2DFocused, centerOnNode, refreshTreePanel, bindSidebarSearch, bindTreeSidebar } from './interact.js';
export { renderLayerStrip, initLayerStrip } from './layer-strip.js';
export { drawSidebar2D, toggleSidebarCollapse };

function initWindowListeners() {
  if (getWindowListenersInited()) return;
  setWindowListenersInited(true);

  window.addEventListener('mousemove', (e) => {
    if (!getDraggingInstanceId()) return;
    const s = instances.get(getDraggingInstanceId());
    if (!s || !s.isDragging) return;
    const rect = s.canvas.getBoundingClientRect();
    const pos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    s.transform.offsetX = pos.x - s.dragStart.x;
    s.transform.offsetY = pos.y - s.dragStart.y;
    drawSidebar2D(s);
  });

  window.addEventListener('mouseup', (e) => {
    if (!getDraggingInstanceId()) return;
    const s = instances.get(getDraggingInstanceId());
    if (!s || !s.isDragging) {
      setDraggingInstanceId(null);
      return;
    }
    s.isDragging = false;
    s.canvas.style.cursor = 'grab';
    const rect = s.canvas.getBoundingClientRect();
    const pos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const worldPos = canvasToWorld(pos.x, pos.y, s);
    const hit = s.nodeHitAreas.find(area =>
      worldPos.x >= area.x && worldPos.x <= area.x + area.width &&
      worldPos.y >= area.y && worldPos.y <= area.y + area.height
    );
    if (hit?.id) {
      setSelectedNode(hit.id, e.ctrlKey);
    } else {
      clearSelected();
    }
    drawSidebar2D(s);
    setDraggingInstanceId(null);
  });
}

export function getStateById(canvasId) {
  return instances.get(canvasId) || null;
}

// ── 公开初始化函数 ──
export function initSidebar2DViewForTarget(containerId, canvasId) {
  if (instances.has(canvasId)) return;

  const container = document.getElementById(containerId);
  const canvas = document.getElementById(canvasId);
  if (!container || !canvas) return;

  const s = createState(container, canvas);
  instances.set(canvasId, s);

  canvas.tabIndex = 0;
  resizeSidebarCanvas(s);

  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 2) return;
    // 笔记选择模式：拦截单击，命中节点后触发回调插入笔记链接
    if (window._notePickerCallback) {
      const rect = canvas.getBoundingClientRect();
      const pos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const worldPos = canvasToWorld(pos.x, pos.y, s);
      const hit = s.nodeHitAreas.find(area =>
        worldPos.x >= area.x && worldPos.x <= area.x + area.width &&
        worldPos.y >= area.y && worldPos.y <= area.y + area.height
      );
      e.preventDefault();
      e.stopPropagation();
      if (hit?.id) {
        if (hit.id === appState.currentEditNodeId) {
          window._notePickerCallback = null;
          showToast('不可插入当前打开的笔记');
          return;
        }
        const node = appState.nodeMap.get(hit.id);
        const nodeName = node?.name || '未命名';
        const cb = window._notePickerCallback;
        window._notePickerCallback = null;
        cb(hit.id, nodeName);
      } else {
        window._notePickerCallback = null;
        showToast('未点中节点，已取消插入笔记');
      }
      return;
    }
    blurActiveEditor();
    canvas.focus();
    s.highlightedNodeId = null;
    s.isDragging = false;
    const rect = canvas.getBoundingClientRect();
    const pos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    s.isDragging = true;
    setDraggingInstanceId(canvasId);
    s.dragStart = { x: pos.x - s.transform.offsetX, y: pos.y - s.transform.offsetY };
    s.canvas.style.cursor = 'grabbing';
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    s.transform.scale *= delta;
    s.transform.scale = Math.max(0.1, Math.min(3, s.transform.scale));
    drawSidebar2D(s);
  }, { passive: false });

  // 打开命中的节点（双击鼠标 / 双触手指共用）
  const openNodeFromHit = (hit) => {
    if (!hit?.id) return;
    const node = appState.nodeMap.get(hit.id);
    // 网页节点双击 → 打开内置浏览器加载页面
    if (node && node.displayMode === 'webpage') {
      if (window.AppRunner) {
        let url = node.webUrl || '';
        // URL智能识别：不含协议前缀时补 https://
        if (url && !/^https?:\/\//i.test(url) && !url.startsWith('file://') && !url.startsWith('data:')) {
          url = (url.includes('.') && !url.includes(' ')) ? 'https://' + url : 'https://www.bing.com/search?q=' + encodeURIComponent(url);
        }
        window.AppRunner.open({ id: 'webpage-' + hit.id, name: node.name || '网页', type: 'browser', defaultUrl: url || undefined });
      }
      return;
    }
    // 如果双击的是当前正在编辑的节点，弹出提示而非重新打开
    if (hit.id === appState.currentEditNodeId) {
      showToast('该节点已在编辑中');
      return;
    }
    openRichEditor(hit.id);
  };

  canvas.addEventListener('dblclick', (e) => {
    const rect = canvas.getBoundingClientRect();
    const pos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const worldPos = canvasToWorld(pos.x, pos.y, s);
    const hit = s.nodeHitAreas.find(area =>
      worldPos.x >= area.x && worldPos.x <= area.x + area.width &&
      worldPos.y >= area.y && worldPos.y <= area.y + area.height
    );
    openNodeFromHit(hit);
  });

  // ── 触摸手势（平板端）：单指拖拽平移、双指捏合缩放、点按选择、双触打开 ──
  canvas.style.touchAction = 'none'; // 禁止浏览器滚动/系统手势抢占触摸事件
  s._touch = { pointers: new Map(), pinch: null, singleDragging: false, lastTap: null };

  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return; // 鼠标走原 mousedown 逻辑
    if (window._notePickerCallback) return; // 笔记选择模式：不拦截，由合成 mouse 事件走原点击流程
    e.preventDefault(); // 抑制触摸合成的 mouse 事件，避免与原拖拽逻辑双重处理
    blurActiveEditor();
    canvas.focus();
    s.highlightedNodeId = null;
    if (s._touch.pointers.size >= 2) return; // 最多跟踪两指
    canvas.setPointerCapture(e.pointerId);
    const rect = canvas.getBoundingClientRect();
    const p = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    s._touch.pointers.set(e.pointerId, p);
    if (s._touch.pointers.size === 1) {
      // 单指：开始平移（复用鼠标拖拽的偏移状态字段）
      s._touch.singleDragging = true;
      setDraggingInstanceId(canvasId);
      s.dragStart = { x: p.x - s.transform.offsetX, y: p.y - s.transform.offsetY };
      canvas.style.cursor = 'grabbing';
    } else {
      // 第二指落下 → 从平移切换为捏合缩放
      s._touch.singleDragging = false;
      canvas.style.cursor = '';
      const pts = [...s._touch.pointers.values()];
      s._touch.pinch = {
        dist0: Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) || 1,
        mid0: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 },
        scale0: s.transform.scale,
        offset0: { x: s.transform.offsetX, y: s.transform.offsetY }
      };
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') return;
    if (!s._touch.pointers.has(e.pointerId)) return;
    const rect = canvas.getBoundingClientRect();
    const p = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    s._touch.pointers.set(e.pointerId, p);
    if (s._touch.singleDragging) {
      s.transform.offsetX = p.x - s.dragStart.x;
      s.transform.offsetY = p.y - s.dragStart.y;
      drawSidebar2D(s);
    } else if (s._touch.pinch && s._touch.pointers.size === 2) {
      const pts = [...s._touch.pointers.values()];
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) || 1;
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const t = s._touch.pinch;
      const scale = Math.max(0.1, Math.min(3, t.scale0 * dist / t.dist0));
      // 缩放围绕捏合中点：中点下的世界坐标保持不动
      const worldX = (t.mid0.x - t.offset0.x) / t.scale0;
      const worldY = (t.mid0.y - t.offset0.y) / t.scale0;
      s.transform.scale = scale;
      s.transform.offsetX = mid.x - worldX * scale;
      s.transform.offsetY = mid.y - worldY * scale;
      drawSidebar2D(s);
    }
  });

  const _endTouchPointer = (e) => {
    if (e.pointerType === 'mouse') return;
    if (!s._touch.pointers.has(e.pointerId)) return;
    s._touch.pointers.delete(e.pointerId);
    if (s._touch.singleDragging) {
      // 单指抬起 → 结束平移并按落点选择节点（与鼠标 mouseup 行为一致）
      s._touch.singleDragging = false;
      canvas.style.cursor = '';
      if (getDraggingInstanceId() === canvasId) setDraggingInstanceId(null);
      const rect = canvas.getBoundingClientRect();
      const worldPos = canvasToWorld(e.clientX - rect.left, e.clientY - rect.top, s);
      const hit = s.nodeHitAreas.find(area =>
        worldPos.x >= area.x && worldPos.x <= area.x + area.width &&
        worldPos.y >= area.y && worldPos.y <= area.y + area.height
      );
      if (hit?.id) {
        setSelectedNode(hit.id, false);
        // 双触打开：同一节点 400ms 内两次点按
        const now = Date.now();
        if (s._touch.lastTap && s._touch.lastTap.nodeId === hit.id && now - s._touch.lastTap.time < 400) {
          s._touch.lastTap = null;
          openNodeFromHit(hit);
        } else {
          s._touch.lastTap = { nodeId: hit.id, time: now };
        }
      } else {
        clearSelected();
        s._touch.lastTap = null;
      }
      drawSidebar2D(s);
    } else if (s._touch.pinch) {
      s._touch.pinch = null;
      // 抬起一指后剩一指 → 无缝切回单指平移
      if (s._touch.pointers.size === 1) {
        const p = [...s._touch.pointers.values()][0];
        s._touch.singleDragging = true;
        s.dragStart = { x: p.x - s.transform.offsetX, y: p.y - s.transform.offsetY };
        canvas.style.cursor = 'grabbing';
      } else if (s._touch.pointers.size === 0 && getDraggingInstanceId() === canvasId) {
        setDraggingInstanceId(null);
      }
    }
  };
  canvas.addEventListener('pointerup', _endTouchPointer);
  canvas.addEventListener('pointercancel', _endTouchPointer);

  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const pos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const worldPos = canvasToWorld(pos.x, pos.y, s);
    const hit = s.nodeHitAreas.find(area =>
      worldPos.x >= area.x && worldPos.x <= area.x + area.width &&
      worldPos.y >= area.y && worldPos.y <= area.y + area.height
    );
    if (hit?.id) {
      setSelectedNode(hit.id, e.ctrlKey);
      appState._isSidebarContextMenu = true;
      showContextMenu(e.clientX, e.clientY, hit.id);
    } else {
      clearSelected();
      hideContextMenu();
      appState._lastRightClickPos = { x: e.clientX, y: e.clientY };
      appState._isSidebarContextMenu = true;
      // 预转换世界坐标，供 placeNodeIn2D 在创建根节点时使用
      appState._sidebarWorldPos = worldPos;
      showBlankContextMenu(e.clientX, e.clientY);
    }
  });

  window.addEventListener('resize', () => resizeSidebarCanvas(s));

  initWindowListeners();

  appState.refreshTreePanel = () => {
    for (const [_, inst] of instances) resizeSidebarCanvas(inst);
  };
  appState.toggleSidebarCollapse = toggleSidebarCollapse;
  appState.sidebar2DKeys = getActiveState()?.keys || {};

  // 启动持续刷新循环，确保树形面板 2D 视图实时同步主视图的颜色变化
  if (!window._sidebarRefreshStarted) {
    window._sidebarRefreshStarted = true;
    // 帧率控制：与 3D 主循环一致，锁 90fps，空闲 30s 后降至 50fps
    const _TARGET_INTERVAL = 1000 / 90;
    const _IDLE_INTERVAL = 1000 / 50;
    const _IDLE_THRESHOLD = 30000;
    let _lastSidebarFrame = 0;
    function sidebarRefreshLoop() {
      requestAnimationFrame(sidebarRefreshLoop);
      const _now = performance.now();
      const _idle = (_now - (appState.lastInteractionTime || _now)) > _IDLE_THRESHOLD;
      const _interval = _idle ? _IDLE_INTERVAL : _TARGET_INTERVAL;
      if (_now - _lastSidebarFrame < _interval) return;
      _lastSidebarFrame = _now;
      try {
        for (const [_, inst] of instances) {
          if (!inst.visible) continue;
          // 容器零尺寸时跳过绘制（编辑器关闭/面板折叠时 canvas 无可见区域）
          // 用 offsetWidth/Height 避免强制布局重排
          if (inst.canvas.offsetWidth === 0 || inst.canvas.offsetHeight === 0) continue;
          drawSidebar2D(inst);
        }
      } catch (e) {
        // 避免单个绘制错误中断循环
      }
    }
    requestAnimationFrame(sidebarRefreshLoop);
  }
}

export function initSidebar2DView() {
  initSidebar2DViewForTarget('treeContainer', 'tree2dCanvas');
  initLayerStrip('treeLayerStrip');
}

export function blurActiveEditor() {
  const el = document.activeElement;
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
    el.blur();
  }
}

// ── Canvas 尺寸 ──
export function resizeSidebarCanvas(s) {
  if (!s) s = getActiveState();
  if (!s || !s.canvas || !s.container) return;
  const rect = s.container.getBoundingClientRect();
  s.canvas.width = Math.round(rect.width);
  s.canvas.height = Math.round(rect.height);
  if (s.visible) drawSidebar2D(s);
}

function canvasToWorld(canvasX, canvasY, s) {
  return {
    x: (canvasX - s.canvas.width / 2 - s.transform.offsetX) / s.transform.scale,
    y: (canvasY - s.canvas.height / 2 - s.transform.offsetY) / s.transform.scale
  };
}
