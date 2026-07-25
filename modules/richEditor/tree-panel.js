import { appState } from '../module0_AppState.js';
import { setSelectedNode, clearSelected } from '../module5_SelectAndEdit.js';
import { openRichEditor } from './index.js';
import { showContextMenu, hideContextMenu, showBlankContextMenu, hideBlankContextMenu } from '../module8_ContextMenu.js';
import { showToast } from '../module5_SelectAndEdit.js';
import {
  layoutTree, assignCoordinates, extractNodePositions,
  resolveNodeOverlaps, resolveNodeLineOverlaps,
  isNextStepNode, groupRects,
  BASE_NODE_WIDTH, BASE_NODE_HEIGHT, H_GAP, V_GAP,
  POLYLINE_PEG_X, POLYLINE_PEG_Y,
  getNodeAnchors, getNodeLayoutSize
} from '../2DView/index.js';

const PAN_SPEED = 6;

// ── 全局连线呼吸色：全色域缓慢循环，与主 2D 视图保持一致 ──
function getBreathingLineColor() {
  const t = Date.now() * 0.001;
  const hue = (t % 30) / 8 * 360;
  const sat = 70 + 6 * Math.sin(t * 0.3);
  const lit = 50 + 4 * Math.sin(t * 0.35);
  return `hsl(${hue}, ${sat}%, ${lit}%)`;
}

// ── 多实例状态存储 ──
const instances = new Map(); // canvasId -> state

let windowListenersInited = false;
let draggingInstanceId = null;

function createState(container, canvas) {
  const ctx = canvas.getContext('2d');
  return {
    container,
    canvas,
    ctx,
    visible: true,
    transform: { offsetX: 0, offsetY: 0, scale: 1 },
    isDragging: false,
    dragStart: { x: 0, y: 0 },
    nodeHitAreas: [],
    highlightedNodeId: null,
    animations: [],
    keys: { w: false, a: false, s: false, d: false, ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false }
  };
}

function getActiveState() {
  if (draggingInstanceId && instances.has(draggingInstanceId)) {
    return instances.get(draggingInstanceId);
  }
  for (const [id, s] of instances) {
    if (document.activeElement === s.canvas) return s;
  }
  return instances.size > 0 ? instances.values().next().value : null;
}

function initWindowListeners() {
  if (windowListenersInited) return;
  windowListenersInited = true;

  window.addEventListener('mousemove', (e) => {
    if (!draggingInstanceId) return;
    const s = instances.get(draggingInstanceId);
    if (!s || !s.isDragging) return;
    const rect = s.canvas.getBoundingClientRect();
    const pos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    s.transform.offsetX = pos.x - s.dragStart.x;
    s.transform.offsetY = pos.y - s.dragStart.y;
    drawSidebar2D(s);
  });

  window.addEventListener('mouseup', (e) => {
    if (!draggingInstanceId) return;
    const s = instances.get(draggingInstanceId);
    if (!s || !s.isDragging) {
      draggingInstanceId = null;
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
    draggingInstanceId = null;
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
    blurActiveEditor();
    canvas.focus();
    s.highlightedNodeId = null;
    s.isDragging = false;
    const rect = canvas.getBoundingClientRect();
    const pos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    s.isDragging = true;
    draggingInstanceId = canvasId;
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

  canvas.addEventListener('dblclick', (e) => {
    const rect = canvas.getBoundingClientRect();
    const pos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const worldPos = canvasToWorld(pos.x, pos.y, s);
    const hit = s.nodeHitAreas.find(area =>
      worldPos.x >= area.x && worldPos.x <= area.x + area.width &&
      worldPos.y >= area.y && worldPos.y <= area.y + area.height
    );
    if (hit?.id) {
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
    }
  });

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

function blurActiveEditor() {
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

// ── HTML 转纯文本（用于卡片正文摘要） ──
function _sidebarHtmlToPlain(html) {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return (tmp.textContent || '').replace(/\s+/g, ' ').trim();
}

// ── 绘制卡片节点（树状面板版，只显示标题+摘要，不渲染富文本HTML） ──
function drawSidebarNodeCard(x, y, node, s, selected, alpha, highlighted, connected, connectedStep, isCurrentlyEditing) {
  const scale = node.sizeScale || 1;
  const { width: w, height: h } = getNodeLayoutSize(node, scale);
  const padding = 4 * scale;
  const fontSize = Math.max(8, 11 * scale);
  const titleFontSize = fontSize + 1;
  const titleAreaH = titleFontSize + 6;
  const bodyH = Math.max(0, h - padding - titleAreaH - padding);

  let borderColor = '#5a8a9a';
  if (node.id) {
    const obj = appState.nodeMeshes.get(node.id);
    if (obj?.mesh?.material?.color) borderColor = '#' + obj.mesh.material.color.getHexString();
    else if (node.fixedColor) borderColor = node.fixedColor;
  }

  // 检测跨图层连接
  const hasCrossEdges = node.id && appState.crossEdges && appState.crossEdges.some(e => {
    if (e.source !== node.id && e.target !== node.id) return false;
    const srcLayer = appState.getLayerForNode ? appState.getLayerForNode(e.source) : null;
    const tgtLayer = appState.getLayerForNode ? appState.getLayerForNode(e.target) : null;
    return !srcLayer || !tgtLayer || srcLayer.id !== tgtLayer.id;
  });

  const ctx = s.ctx;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);

  // 跨图层呼吸外圈
  if (hasCrossEdges && !highlighted) {
    const breath = Math.sin(performance.now() * 0.003) * 0.5 + 0.8;
    const gap = 3 + breath * 4;
    const outerAlpha = 0.6 + breath * 0.4;
    ctx.save();
    ctx.globalAlpha = alpha * outerAlpha;
    ctx.strokeStyle = isCurrentlyEditing ? '#00cc66' : borderColor;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = isCurrentlyEditing ? '#00cc66' : borderColor;
    ctx.shadowBlur = 4 + breath * 6;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-gap, -gap, w + gap * 2, h + gap * 2, (6 + gap) * scale);
    else ctx.rect(-gap, -gap, w + gap * 2, h + gap * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 卡片背景（状态颜色与普通节点一致）
  if (isCurrentlyEditing) {
    const pulse = 0.6 + 0.4 * Math.sin(performance.now() * 0.003);
    ctx.shadowColor = '#00cc66';
    ctx.shadowBlur = 10 + pulse * 6;
    ctx.fillStyle = '#0a3a1a';
    ctx.strokeStyle = '#00cc66';
    ctx.lineWidth = 2.5;
  } else if (selected) {
    ctx.fillStyle = '#3a3520';
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 2.5;
  } else if (highlighted) {
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#0a2a3a';
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 2.5;
  } else if (connectedStep) {
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.006);
    ctx.shadowColor = '#AA44FF';
    ctx.shadowBlur = 14 + pulse * 8;
    ctx.fillStyle = '#2a1a3a';
    ctx.strokeStyle = '#AA44FF';
    ctx.lineWidth = 2.5;
  } else if (connected) {
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.006);
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 14 + pulse * 8;
    ctx.fillStyle = '#2a4a5a';
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 2.5;
  } else {
    ctx.fillStyle = '#0d1820';
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1.5;
  }
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(0, 0, w, h, 6 * scale);
  else ctx.rect(0, 0, w, h);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';

  // 标题
  ctx.fillStyle = isCurrentlyEditing ? '#00ff88' : selected ? '#FFD700' : highlighted ? '#00ffff' : connectedStep ? '#CCAAFF' : connected ? '#00ffff' : '#0ff';
  ctx.font = `bold ${titleFontSize}px system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const titleMaxChars = Math.max(5, Math.floor((w - padding * 2) / (titleFontSize * 0.6)));
  const titleText = (node.name || '').slice(0, titleMaxChars);
  ctx.fillText('📄 ' + titleText, padding, padding);

  // 分隔线
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(padding, padding + titleFontSize + 2);
  ctx.lineTo(w - padding, padding + titleFontSize + 2);
  ctx.stroke();

  // 正文摘要（纯文本多行，不渲染 HTML）
  if (bodyH > 0) {
    const plainText = _sidebarHtmlToPlain(node.richContent || node.desc || '');
    if (plainText) {
      ctx.fillStyle = '#9bb';
      ctx.font = `${fontSize}px system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const charPerLine = Math.max(1, Math.floor((w - padding * 2) / (fontSize * 0.55)));
      const lineHeight = fontSize * 1.3;
      const maxLines = Math.max(1, Math.floor(bodyH / lineHeight));
      let remaining = plainText;
      for (let i = 0; i < maxLines && remaining.length > 0; i++) {
        const line = remaining.slice(0, charPerLine);
        remaining = remaining.slice(charPerLine);
        ctx.fillText(line, padding, padding + titleAreaH + i * lineHeight);
      }
      if (remaining.length > 0) {
        // 最后一行加省略号
        const lastY = padding + titleAreaH + (maxLines - 1) * lineHeight;
        ctx.fillText('…', padding + charPerLine * fontSize * 0.55, lastY);
      }
    }
  }

  ctx.restore();
}

// ── 绘制基础元素 ──
function drawSidebarNode(x, y, node, s, selected = false, alpha = 1, highlighted = false, connected = false, connectedStep = false, isCurrentlyEditing = false) {
  // 卡片/网页模式走独立绘制路径（与主 2D 视图一致）
  if (node.displayMode === 'card' || node.displayMode === 'webpage') {
    return drawSidebarNodeCard(x, y, node, s, selected, alpha, highlighted, connected, connectedStep, isCurrentlyEditing);
  }
  const scale = node.sizeScale || 1;
  const w = BASE_NODE_WIDTH * scale;
  const h = BASE_NODE_HEIGHT * scale;
  const fontSize = Math.max(10, 14 * scale);
  const shape = node.nodeShape || (isNextStepNode(node) ? 'stadium' : 'roundedRect');

  let borderColor = '#5a8a9a';
  if (node.id) {
    // 从 3D mesh 材质读取颜色，与主 2D 视图完全一致
    const obj = appState.nodeMeshes.get(node.id);
    if (obj?.mesh?.material?.color) {
      borderColor = '#' + obj.mesh.material.color.getHexString();
    } else if (node.fixedColor) {
      borderColor = node.fixedColor;
    }
  }

  // 检测是否有跨图层连接（仅跨层级连线显示呼吸效果，同层级用户连线不显示）
  const hasCrossEdges = node.id && appState.crossEdges && appState.crossEdges.some(e => {
    if (e.source !== node.id && e.target !== node.id) return false;
    const srcLayer = appState.getLayerForNode ? appState.getLayerForNode(e.source) : null;
    const tgtLayer = appState.getLayerForNode ? appState.getLayerForNode(e.target) : null;
    return !srcLayer || !tgtLayer || srcLayer.id !== tgtLayer.id;
  });

  const ctx = s.ctx;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);

  if (isCurrentlyEditing) {
    // 当前正在编辑的节点：绿色背景，持续高亮
    const pulse = 0.6 + 0.4 * Math.sin(performance.now() * 0.003);
    ctx.shadowColor = '#00cc66';
    ctx.shadowBlur = 10 + pulse * 6;
    ctx.fillStyle = '#0a3a1a';
    ctx.strokeStyle = '#00cc66';
    ctx.lineWidth = 2.5;
  } else if (selected) {
    // 选中节点保持金色高亮，不被 connected 覆盖
    ctx.fillStyle = '#FFD700';
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 2;
  } else if (highlighted) {
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#0a2a3a';
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 3;
  } else if (connectedStep) {
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.006);
    ctx.shadowColor = '#AA44FF';
    ctx.shadowBlur = 14 + pulse * 8;
    ctx.fillStyle = '#2a1a3a';
    ctx.strokeStyle = '#AA44FF';
    ctx.lineWidth = 3;
  } else if (connected) {
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.006);
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 14 + pulse * 8;
    ctx.fillStyle = '#2a4a5a';
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 3;
  } else {
    ctx.fillStyle = '#1e2a32';
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 2;
  }
  drawSidebarNodeShape(ctx, 0, 0, w, h, shape, scale);

  // 跨图层连接 → 外圈双实线（带呼吸动画）
  if (hasCrossEdges && !highlighted) {
    const breath = Math.sin(performance.now() * 0.003) * 0.5 + 0.8;
    const gap = 3 + breath * 4;
    const outerAlpha = 0.6 + breath * 0.4;
    ctx.globalAlpha = alpha * outerAlpha;
    ctx.strokeStyle = isCurrentlyEditing ? '#00cc66' : borderColor;
    ctx.lineWidth = 3;
    ctx.shadowColor = isCurrentlyEditing ? '#00cc66' : borderColor;
    ctx.shadowBlur = 4 + breath * 6;
    drawSidebarNodeShape(ctx, -gap, -gap, w + gap * 2, h + gap * 2, shape, scale + gap / Math.max(w, h));
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = alpha;
  }

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.fillStyle = isCurrentlyEditing ? '#00ff88' : selected ? '#000' : highlighted ? '#00ffff' : connectedStep ? '#CCAAFF' : connected ? '#00ffff' : '#c0f0ff';
  ctx.font = `${fontSize}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(node.name || '', w / 2, h / 2);
  ctx.restore();
}

// ── 绘制节点形状（支持四种图形） ──
function drawSidebarNodeShape(ctx, sx, sy, sw, sh, shape, scale) {
  ctx.beginPath();
  switch (shape) {
    case 'diamond':
      ctx.moveTo(sx + sw / 2, sy);
      ctx.lineTo(sx + sw, sy + sh / 2);
      ctx.lineTo(sx + sw / 2, sy + sh);
      ctx.lineTo(sx, sy + sh / 2);
      ctx.closePath();
      break;
    case 'ellipse':
      ctx.ellipse(sx + sw / 2, sy + sh / 2, sw / 2, sh / 2, 0, 0, Math.PI * 2);
      break;
    case 'stadium': {
      const r = Math.min(sw, sh) / 2;
      if (sw >= sh) {
        ctx.moveTo(sx + r, sy);
        ctx.lineTo(sx + sw - r, sy);
        ctx.arc(sx + sw - r, sy + sh / 2, r, -Math.PI / 2, Math.PI / 2);
        ctx.lineTo(sx + r, sy + sh);
        ctx.arc(sx + r, sy + sh / 2, r, Math.PI / 2, -Math.PI / 2);
      } else {
        ctx.moveTo(sx, sy + r);
        ctx.lineTo(sx, sy + sh - r);
        ctx.arc(sx + sw / 2, sy + sh - r, r, 0, Math.PI);
        ctx.lineTo(sx + sw, sy + r);
        ctx.arc(sx + sw / 2, sy + r, r, Math.PI, 0);
      }
      ctx.closePath();
      break;
    }
    case 'roundedRect':
    default:
      if (ctx.roundRect) ctx.roundRect(sx, sy, sw, sh, 8 * scale);
      else ctx.rect(sx, sy, sw, sh);
      break;
  }
  ctx.fill();
  ctx.stroke();
}

function drawSidebarLine(x1, y1, x2, y2, ctx, alpha = 1, color = '#2c6e7e', dash = [], glow = false, glowColor = null) {
  const lineWidth = glow ? 3 : 2;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash(dash);
  ctx.stroke();
  ctx.setLineDash([]);

  // 光晕闪烁效果
  if (glow) {
    const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.008);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = glowColor || color;
    ctx.lineWidth = 5 + pulse * 4;
    ctx.globalAlpha = alpha * (0.3 + pulse * 0.3);
    ctx.setLineDash(dash);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = alpha;
  }

  const angle = Math.atan2(y2 - y1, x2 - x1);
  const arrowLen = 12;
  const tipX = x2 - 4 * Math.cos(angle);
  const tipY = y2 - 4 * Math.sin(angle);
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(tipX - arrowLen * Math.cos(angle - Math.PI / 7), tipY - arrowLen * Math.sin(angle - Math.PI / 7));
  ctx.lineTo(tipX - arrowLen * Math.cos(angle + Math.PI / 7), tipY - arrowLen * Math.sin(angle + Math.PI / 7));
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

// 绘制树状面板中的折线（多段线）
function drawSidebarPolyline(points, ctx, alpha = 1, color = '#2c6e7e', dash = [], glow = false, glowColor = null) {
  if (points.length < 2) return;
  const lineWidth = glow ? 3 : 2;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash(dash);
  ctx.stroke();
  ctx.setLineDash([]);

  // 光晕闪烁效果（只在最后一段）
  if (glow) {
    const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.008);
    const lastIdx = points.length - 2;
    ctx.beginPath();
    ctx.moveTo(points[lastIdx].x, points[lastIdx].y);
    ctx.lineTo(points[lastIdx + 1].x, points[lastIdx + 1].y);
    ctx.strokeStyle = glowColor || color;
    ctx.lineWidth = 5 + pulse * 4;
    ctx.globalAlpha = alpha * (0.3 + pulse * 0.3);
    ctx.setLineDash(dash);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = alpha;
  }

  // 箭头画在终点
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  const angle = Math.atan2(last.y - prev.y, last.x - prev.x);
  const arrowLen = 12;
  const tipX = last.x - 4 * Math.cos(angle);
  const tipY = last.y - 4 * Math.sin(angle);
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(tipX - arrowLen * Math.cos(angle - Math.PI / 7), tipY - arrowLen * Math.sin(angle - Math.PI / 7));
  ctx.lineTo(tipX - arrowLen * Math.cos(angle + Math.PI / 7), tipY - arrowLen * Math.sin(angle + Math.PI / 7));
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

// 计算折线第 3 段的中点（标签放置位），不足则回退全路径中点
function getSidebarPolylineThirdSegmentMidpoint(points) {
  if (points.length >= 4) {
    return { x: (points[2].x + points[3].x) / 2, y: (points[2].y + points[3].y) / 2 };
  }
  return getSidebarPolylineMidpoint(points);
}

// 计算折线路径的长度中点
function getSidebarPolylineMidpoint(points) {
  if (points.length < 2) return { x: points[0]?.x || 0, y: points[0]?.y || 0 };
  let totalLen = 0;
  const segLens = [];
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    segLens.push(Math.sqrt(dx * dx + dy * dy));
    totalLen += segLens[segLens.length - 1];
  }
  if (totalLen === 0) return { x: (points[0].x + points[points.length - 1].x) / 2, y: (points[0].y + points[points.length - 1].y) / 2 };
  const halfLen = totalLen / 2;
  let acc = 0;
  for (let i = 0; i < segLens.length; i++) {
    if (acc + segLens[i] >= halfLen) {
      const t = segLens[i] > 0 ? (halfLen - acc) / segLens[i] : 0.5;
      return { x: points[i].x + (points[i + 1].x - points[i].x) * t, y: points[i].y + (points[i + 1].y - points[i].y) * t };
    }
    acc += segLens[i];
  }
  const last = points.length - 1;
  return { x: points[last].x, y: points[last].y };
}

function findParentNode(nodeId) {
  const root = appState.methodsTree;
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    if (current.children) {
      for (const child of current.children) {
        if (child.id === nodeId) return current;
        stack.push(child);
      }
    }
  }
  return null;
}

function getAnimationProgress(s, nodeId) {
  const anim = s.animations.find(a => a.nodeId === nodeId);
  if (!anim) return null;
  const elapsed = performance.now() - anim.startTime;
  const t = Math.min(1, elapsed / anim.duration);
  const progress = anim.direction === 'expand' ? t : (1 - t);
  return { progress, finished: t >= 1, direction: anim.direction };
}

function getNodeVisibilityAlpha(s, nodeId) {
  let alpha = 1;
  let currentId = nodeId;
  while (currentId) {
    const node = appState.nodeMap.get(currentId);
    if (!node) break;
    const parent = findParentNode(currentId);
    if (!parent) break;
    const animState = getAnimationProgress(s, parent.id);
    if (appState.collapsed2D.has(parent.id)) {
      if (animState && animState.direction === 'expand') alpha *= animState.progress;
      else return 0;
    } else if (animState && animState.direction === 'collapse') alpha *= animState.progress;
    currentId = parent.id;
  }
  return alpha;
}

export function toggleSidebarCollapse(nodeId) {
  if (!appState.nodeMap.has(nodeId)) return;
  const wasCollapsed = appState.collapsed2D.has(nodeId);
  const direction = wasCollapsed ? 'expand' : 'collapse';
  for (const [_, s] of instances) {
    s.animations = s.animations.filter(a => a.nodeId !== nodeId);
    s.animations.push({ nodeId, direction, startTime: performance.now(), duration: 300 });
    requestAnimationFrame(() => {
      if (s.visible) drawSidebar2D(s);
    });
  }
}

// ── 递归绘制树 ──
function drawSidebarTreeRecursive(layout, positionMap, s, parentCollapsedProgress = null, isRoot = true, layerNodeIds = null) {
  if (!layout?.node) return;
  const { node, width, height } = layout;
  const nodeId = node.id;
  const isSelected = nodeId ? appState.selectedNodeIds.has(nodeId) : false;
  const isHighlighted = nodeId === s.highlightedNodeId;
  const isConnected = nodeId && appState.connectedNodeIds && appState.connectedNodeIds.has(nodeId);
  const isConnectedStep = nodeId && appState.connectedStepNodeIds && appState.connectedStepNodeIds.has(nodeId);
  const isCurrentlyEditing = nodeId === appState.currentEditNodeId;
  const pos = positionMap.get(nodeId);

  // 图层过滤：不在当前图层的节点降低透明度
  const inLayer = !layerNodeIds || (nodeId && layerNodeIds.has(nodeId));

  if (pos && !isRoot && inLayer) {
    let nodeAlpha = 1;
    if (parentCollapsedProgress !== null) nodeAlpha = parentCollapsedProgress;
    drawSidebarNode(pos.x, pos.y, node, s, isSelected, nodeAlpha, isHighlighted, isConnected, isConnectedStep, isCurrentlyEditing);
  }

  const isCurrentlyCollapsed = appState.collapsed2D.has(nodeId);
  const animState = getAnimationProgress(s, nodeId);
  let effectiveProgress = null;
  if (animState) {
    if (animState.finished) {
      s.animations = s.animations.filter(a => a.nodeId !== nodeId);
      if (animState.direction === 'collapse') appState.collapsed2D.add(nodeId);
      else appState.collapsed2D.delete(nodeId);
      if (animState.direction === 'collapse') return;
    } else effectiveProgress = animState.progress;
  } else effectiveProgress = parentCollapsedProgress;

  if (isCurrentlyCollapsed && !animState) return;

  for (const child of layout.children) {
    const childPos = positionMap.get(child.node.id);
    if (!childPos) continue;

    const isStepNode = isNextStepNode(child.node);
    const isChildConnected = child.node.id && appState.connectedNodeIds && appState.connectedNodeIds.has(child.node.id);
    const isChildConnectedStep = child.node.id && appState.connectedStepNodeIds && appState.connectedStepNodeIds.has(child.node.id);
    const isEdgeEndpointSelected = (nodeId && appState.selectedNodeIds.has(nodeId)) || (child.node.id && appState.selectedNodeIds.has(child.node.id));
    const isGlowing = (isChildConnected || isChildConnectedStep) && isEdgeEndpointSelected;
    const dynamicHue = (Date.now() * 0.02) % 360;
    let lineColor = isChildConnectedStep ? '#AA44FF' : isChildConnected ? '#00ccff' : getBreathingLineColor();
    let glowColor = isChildConnectedStep ? '#AA44FF' : isChildConnected ? '#00ffff' : null;
    let customColorHex = null;
    let lineItem = null;
    if (nodeId && !isRoot && !isStepNode) {
      lineItem = appState.lineItems.find(item => item.startId === nodeId && item.endId === child.node.id);
      if (lineItem?.line.customColor) {
        customColorHex = '#' + lineItem.line.customColor.getHexString();
        lineColor = customColorHex;
      }
    }

    const parentX = pos ? pos.x : layout.x;
    const parentY = pos ? pos.y : layout.y;
    let parentOutputX, parentOutputY, childInputX, childInputY;
    if (isStepNode) {
      parentOutputX = parentX + width / 2;
      parentOutputY = parentY + height;
      childInputX = childPos.x + child.width / 2;
      childInputY = childPos.y;
    } else {
      parentOutputX = parentX + width;
      parentOutputY = parentY + height / 2;
      childInputX = childPos.x;
      childInputY = childPos.y + child.height / 2;
    }

    const childAlpha = effectiveProgress !== null ? effectiveProgress : 1;
    // 图层过滤：子节点不在当前图层则跳过
    const childInLayer = !layerNodeIds || (child.node.id && layerNodeIds.has(child.node.id));
    if (!childInLayer) continue;
    const dashPattern = isStepNode ? [8, 3, 2, 3] : [];
    let labelMidX, labelMidY;
    if (!isRoot && nodeId !== null) {
      if (isStepNode) {
        // Step 折线：父下框中点 → 下短距拐点 → 左右延伸到子节点竖直线 → 下连到子上框中点
        const pegY = parentOutputY + POLYLINE_PEG_Y;
        const polyPoints = [
          { x: parentOutputX, y: parentOutputY },
          { x: parentOutputX, y: pegY },
          { x: childInputX,  y: pegY },
          { x: childInputX,  y: childInputY }
        ];
        drawSidebarPolyline(polyPoints, s.ctx, childAlpha, lineColor, dashPattern, isGlowing, glowColor);
        const mid = getSidebarPolylineThirdSegmentMidpoint(polyPoints);
        labelMidX = mid.x;
        labelMidY = mid.y;
      } else {
        // 普通父子连线改为折线
        const pegX = parentOutputX + POLYLINE_PEG_X;
        const polyPoints = [
          { x: parentOutputX, y: parentOutputY },
          { x: pegX,         y: parentOutputY },
          { x: pegX,         y: childInputY },
          { x: childInputX,  y: childInputY }
        ];
        drawSidebarPolyline(polyPoints, s.ctx, childAlpha, lineColor, dashPattern, isGlowing, glowColor);
        const mid = getSidebarPolylineThirdSegmentMidpoint(polyPoints);
        labelMidX = mid.x;
        labelMidY = mid.y;
      }
      const treeKey = `${nodeId}->${child.node.id}`;
      const treeMeta = appState.treeEdgeLabels.get(treeKey);
      const edgeLabel = lineItem?.line.mesh.userData.label || treeMeta?.label;
      const edgeLabelHidden = lineItem?.line.mesh.userData.labelHidden ?? treeMeta?.labelHidden ?? true;
      if (edgeLabel && !edgeLabelHidden && appState.showAllLabels) {
        s.ctx.fillStyle = '#ffd966';
        s.ctx.font = '11px system-ui, sans-serif';
        s.ctx.textAlign = 'center';
        s.ctx.textBaseline = 'middle';
        s.ctx.fillText(edgeLabel, labelMidX, labelMidY - 8);
      }
    }
    drawSidebarTreeRecursive(child, positionMap, s, effectiveProgress, false, layerNodeIds);
  }
}

function drawSidebarCrossEdges(positionMap, s, layerNodeIds = null) {
  const edges = appState.crossEdges || [];
  for (const edge of edges) {
    const sourceAlpha = getNodeVisibilityAlpha(s, edge.source);
    const targetAlpha = getNodeVisibilityAlpha(s, edge.target);
    const edgeAlpha = Math.min(sourceAlpha, targetAlpha);
    if (edgeAlpha <= 0) continue;
    // 图层隔离：有一端不在当前图层则不画线（由双边框指示）
    const sourceInLayer = !layerNodeIds || (edge.source && layerNodeIds.has(edge.source));
    const targetInLayer = !layerNodeIds || (edge.target && layerNodeIds.has(edge.target));
    if (!sourceInLayer || !targetInLayer) continue;
    const sourcePos = positionMap.get(edge.source);
    const targetPos = positionMap.get(edge.target);
    if (!sourcePos || !targetPos) continue;
    const sourceScale = appState.nodeMap.get(edge.source)?.sizeScale || 1;
    const targetScale = appState.nodeMap.get(edge.target)?.sizeScale || 1;
    // 卡片模式使用卡片尺寸，普通节点使用基础尺寸
    const srcNode = appState.nodeMap.get(edge.source);
    const tgtNode = appState.nodeMap.get(edge.target);
    const srcSize = getNodeLayoutSize(srcNode, sourceScale);
    const tgtSize = getNodeLayoutSize(tgtNode, targetScale);
    // 锚点支持
    let x1, y1, x2, y2;
    if (edge.sourceAnchor) {
      const srcAnchors = getNodeAnchors(sourcePos.x, sourcePos.y, srcSize.width, srcSize.height);
      const sa = srcAnchors[edge.sourceAnchor];
      x1 = sa ? sa.x : sourcePos.x + srcSize.width / 2;
      y1 = sa ? sa.y : sourcePos.y + srcSize.height;
    } else {
      x1 = sourcePos.x + srcSize.width / 2;
      y1 = sourcePos.y + srcSize.height;
    }
    if (edge.targetAnchor) {
      const tgtAnchors = getNodeAnchors(targetPos.x, targetPos.y, tgtSize.width, tgtSize.height);
      const ta = tgtAnchors[edge.targetAnchor];
      x2 = ta ? ta.x : targetPos.x + tgtSize.width / 2;
      y2 = ta ? ta.y : targetPos.y;
    } else {
      x2 = targetPos.x + tgtSize.width / 2;
      y2 = targetPos.y;
    }
    const isCrossSourceConnected = appState.connectedNodeIds && appState.connectedNodeIds.has(edge.source);
    const isCrossTargetConnected = appState.connectedNodeIds && appState.connectedNodeIds.has(edge.target);
    const isCrossSourceConnectedStep = appState.connectedStepNodeIds && appState.connectedStepNodeIds.has(edge.source);
    const isCrossTargetConnectedStep = appState.connectedStepNodeIds && appState.connectedStepNodeIds.has(edge.target);
    const isCrossEndConnected = isCrossSourceConnected || isCrossSourceConnectedStep || isCrossTargetConnected || isCrossTargetConnectedStep;
    let strokeColor = edge.customColor || getBreathingLineColor();
    let crossGlowColor = null;
    if (!edge.customColor) {
      if (isCrossSourceConnectedStep || isCrossTargetConnectedStep) {
        strokeColor = '#AA44FF';
        crossGlowColor = '#AA44FF';
      } else if (isCrossSourceConnected || isCrossTargetConnected) {
        strokeColor = '#00ccff';
        crossGlowColor = '#00ffff';
      }
    }
    // 有拐点则画折线，否则画直线
    if (edge.waypoints && edge.waypoints.length > 0) {
      const points = [{ x: x1, y: y1 }];
      for (const wp of edge.waypoints) points.push({ x: wp.x, y: wp.y });
      points.push({ x: x2, y: y2 });
      drawSidebarPolyline(points, s.ctx, edgeAlpha, strokeColor, [6, 4], isCrossEndConnected, crossGlowColor);
      if (edge.label && !edge.labelHidden && appState.showAllLabels) {
        const midPt = getSidebarPolylineThirdSegmentMidpoint(points);
        s.ctx.save();
        s.ctx.globalAlpha = edgeAlpha;
        s.ctx.fillStyle = '#ffd966';
        s.ctx.font = '11px system-ui, sans-serif';
        s.ctx.textAlign = 'center';
        s.ctx.textBaseline = 'middle';
        s.ctx.fillText(edge.label, midPt.x, midPt.y - 8);
        s.ctx.restore();
      }
    } else {
      drawSidebarLine(x1, y1, x2, y2, s.ctx, edgeAlpha, strokeColor, [6, 4], isCrossEndConnected, crossGlowColor);
      if (edge.label && !edge.labelHidden && appState.showAllLabels) {
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        s.ctx.save();
        s.ctx.globalAlpha = edgeAlpha;
        s.ctx.fillStyle = '#ffd966';
        s.ctx.font = '11px system-ui, sans-serif';
        s.ctx.textAlign = 'center';
        s.ctx.textBaseline = 'middle';
        s.ctx.fillText(edge.label, midX, midY - 8);
        s.ctx.restore();
      }
    }
  }
}

// ── 主绘制函数（接受状态参数） ──
export function drawSidebar2D(s) {
  if (!s) s = getActiveState();
  if (!s || !s.visible || !s.ctx || !s.canvas) return;
  if (!appState.methodsTree) return;

  const { ctx, canvas, transform } = s;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = appState.bgColor2D || '#01010c';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const proj = appState.projects.find(p => p.id === appState.currentProjectId);
  const projectName = proj ? proj.name : '🧬 知识网络';
  ctx.fillStyle = '#5a8a9a';
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(projectName, 8, 6);

  ctx.save();
  ctx.translate(canvas.width / 2 + transform.offsetX, canvas.height / 2 + transform.offsetY);
  ctx.scale(transform.scale, transform.scale);

  ctx.strokeStyle = appState.gridColor2D || '#1a2a34';
  ctx.lineWidth = 0.5;
  const gridSize = 40;
  const startX = -canvas.width, endX = canvas.width * 2;
  const startY = -canvas.height, endY = canvas.height * 2;
  for (let x = startX; x < endX; x += gridSize) { ctx.beginPath(); ctx.moveTo(x, startY); ctx.lineTo(x, endY); ctx.stroke(); }
  for (let y = startY; y < endY; y += gridSize) { ctx.beginPath(); ctx.moveTo(startX, y); ctx.lineTo(endX, y); ctx.stroke(); }

  // 绘制组群矩形
  for (const gr of groupRects) {
    if (gr.layerId && gr.layerId !== appState.currentLayerId) continue;
    ctx.save();
    const hexToRgba = (hex, a) => {
      const r = parseInt(hex.slice(1,3), 16);
      const g = parseInt(hex.slice(3,5), 16);
      const b = parseInt(hex.slice(5,7), 16);
      return `rgba(${r},${g},${b},${a})`;
    };
    const alpha = gr.fillOpacity !== undefined ? gr.fillOpacity : 0.25;
    ctx.fillStyle = hexToRgba(gr.fillColor || '#4a3c7e', alpha);
    ctx.strokeStyle = gr.borderColor || '#7a6aae';
    ctx.lineWidth = gr.lineWidth !== undefined ? gr.lineWidth : 1.5;
    const dashMap = { solid: [], dashed: [6, 4], dotted: [2, 4] };
    ctx.setLineDash(dashMap[gr.lineStyle] || [6, 4]);
    const br = gr.borderRadius || 0;
    ctx.beginPath();
    if (br > 0 && ctx.roundRect) {
      ctx.roundRect(gr.x, gr.y, gr.width, gr.height, br);
    } else {
      ctx.rect(gr.x, gr.y, gr.width, gr.height);
    }
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    // 绘制组群名称标签
    if (gr.name) {
      ctx.font = '11px system-ui, sans-serif';
      const textMetrics = ctx.measureText(gr.name);
      const labelH = 18;
      const labelPad = 5;
      const labelW = textMetrics.width + labelPad * 2;
      const labelX = gr.x + 3;
      const labelY = gr.y + 3;
      ctx.fillStyle = hexToRgba(gr.borderColor || '#7a6aae', 0.85);
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(labelX, labelY, labelW, labelH, 3);
      else ctx.rect(labelX, labelY, labelW, labelH);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(gr.name, labelX + labelPad, labelY + labelH / 2);
    }
    ctx.restore();
  }

  s.nodeHitAreas = [];

  const layout = layoutTree(appState.methodsTree);
  const rootStartX = -canvas.width / 2 + 30;
  const rootStartY = -layout.subtreeHeight / 2;
  assignCoordinates(layout, rootStartX, rootStartY);

  const existingPosIds = new Set(appState.positions2D.keys());
  const positionMap = extractNodePositions(layout);
  // 确保渲染时虚拟根节点和真实根节点使用存储的位置
  const methodsRoot = appState.methodsTree;
  if (methodsRoot && methodsRoot.id) {
    const rootStored = appState.positions2D.get(methodsRoot.id);
    if (rootStored) positionMap.set(methodsRoot.id, { x: rootStored.x, y: rootStored.y });
    for (const child of (methodsRoot.children || [])) {
      if (child && child.id) {
        const childStored = appState.positions2D.get(child.id);
        if (childStored) positionMap.set(child.id, { x: childStored.x, y: childStored.y });
      }
    }
  }
  resolveNodeOverlaps(positionMap, existingPosIds);
  resolveNodeLineOverlaps(positionMap, layout, existingPosIds);

  // 获取当前图层节点集合，用于过滤显示
  const curLayer = appState.getCurrentLayer();
  const layerNodeIds = curLayer?.nodeIds || null;

  drawSidebarCrossEdges(positionMap, s, layerNodeIds);
  drawSidebarTreeRecursive(layout, positionMap, s, null, true, layerNodeIds);

  for (const [id, pos] of positionMap.entries()) {
    const node = appState.nodeMap.get(id);
    if (node) {
      const scale = node.sizeScale || 1;
      // 卡片模式使用卡片尺寸，普通节点使用基础尺寸
      const { width: nw, height: nh } = getNodeLayoutSize(node, scale);
      s.nodeHitAreas.push({ id, x: pos.x, y: pos.y, width: nw, height: nh });
    }
  }

  ctx.restore();

  if (s.animations.length > 0) {
    requestAnimationFrame(() => {
      if (s.visible) drawSidebar2D(s);
    });
  }
}

export function refreshSidebar2DView() {
  for (const [_, s] of instances) resizeSidebarCanvas(s);
}

// ── 键盘平移 ──
export function processSidebar2DPanning() {
  const s = getActiveState();
  if (!s || !s.canvas) return;
  let dx = 0, dy = 0;
  if (s.keys.a || s.keys.ArrowLeft) dx += PAN_SPEED;
  if (s.keys.d || s.keys.ArrowRight) dx -= PAN_SPEED;
  if (s.keys.w || s.keys.ArrowUp) dy += PAN_SPEED;
  if (s.keys.s || s.keys.ArrowDown) dy -= PAN_SPEED;
  if (dx !== 0 || dy !== 0) {
    s.highlightedNodeId = null;
    s.transform.offsetX += dx;
    s.transform.offsetY += dy;
    drawSidebar2D(s);
  }
}

export function setSidebar2DKey(key, value) {
  for (const [_, s] of instances) {
    if (document.activeElement === s.canvas && key in s.keys) {
      s.keys[key] = value;
      return;
    }
  }
  const s = getActiveState();
  if (s && key in s.keys) s.keys[key] = value;
}

export function isSidebar2DFocused() {
  for (const [_, s] of instances) {
    if (document.activeElement === s.canvas) return true;
  }
  return false;
}

// ── 居中定位 ──
export function centerOnNode(nodeId) {
  const pos = appState.positions2D.get(nodeId);
  const s = getActiveState();
  if (!pos || !s || !s.canvas) return false;
  const node = appState.nodeMap.get(nodeId);
  const scale = node?.sizeScale || 1;
  // 卡片模式使用卡片尺寸居中，普通节点使用基础尺寸
  const { width: nw, height: nh } = getNodeLayoutSize(node, scale);
  const nodeCX = pos.x + nw / 2;
  const nodeCY = pos.y + nh / 2;
  // 如果是当前正在编辑的节点，不设置 highlightedNodeId（已有绿色高亮）
  if (nodeId !== appState.currentEditNodeId) {
    s.highlightedNodeId = nodeId;
  }
  s.transform.offsetX = -nodeCX * s.transform.scale;
  s.transform.offsetY = -nodeCY * s.transform.scale;
  drawSidebar2D(s);
  return true;
}

export function refreshTreePanel() {
  for (const [_, s] of instances) resizeSidebarCanvas(s);
  // 同时刷新层数条
  for (const id of ['treeLayerStrip']) {
    renderLayerStrip(id);
  }
}

// ── 搜索绑定 ──
export function bindSidebarSearch() {
  const searchInput = document.getElementById('treeSearchInput');
  if (!searchInput) return;

  let searchDropdown = document.getElementById('treeSearchDropdown');
  if (!searchDropdown) {
    searchDropdown = document.createElement('div');
    searchDropdown.id = 'treeSearchDropdown';
    searchDropdown.style.cssText = 'display:none;position:absolute;top:100%;left:0;right:0;background:rgba(10,25,40,0.96);border:1px solid rgba(0,255,255,0.5);border-radius:0 0 12px 12px;max-height:200px;overflow-y:auto;z-index:5000;box-shadow:0 8px 24px rgba(0,0,0,0.7);';
    const searchContainer = searchInput.parentElement;
    if (searchContainer) {
      searchContainer.style.position = 'relative';
      searchContainer.appendChild(searchDropdown);
    }
  }

  searchInput.addEventListener('input', () => {
    const kw = searchInput.value.trim().toLowerCase();
    if (!kw || !appState.methodsTree) {
      searchDropdown.style.display = 'none';
      return;
    }

    const matches = [];
    for (const [id, node] of appState.nodeMap.entries()) {
      if (node.name.toLowerCase().includes(kw) || id.toLowerCase().includes(kw)) {
        matches.push({ id, name: node.name });
      }
    }

    if (matches.length === 0) {
      searchDropdown.style.display = 'none';
      return;
    }

    searchDropdown.innerHTML = '';
    matches.slice(0, 15).forEach(m => {
      const item = document.createElement('div');
      item.style.cssText = 'padding:8px 12px;cursor:pointer;color:#c0f0ff;font-size:13px;border-bottom:1px solid rgba(0,255,255,0.1);transition:background 0.15s;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
      item.textContent = m.name;
      item.addEventListener('mouseenter', () => { item.style.background = 'rgba(0,255,255,0.12)'; });
      item.addEventListener('mouseleave', () => { item.style.background = ''; });
      item.addEventListener('click', () => {
        searchInput.value = '';
        searchDropdown.style.display = 'none';
        centerOnNode(m.id);
        const s = getActiveState();
        if (s?.canvas) {
          s.canvas.focus();
          blurActiveEditor();
        }
      });
      searchDropdown.appendChild(item);
    });
    searchDropdown.style.display = 'block';
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      searchDropdown.style.display = 'none';
      searchInput.blur();
    }
  });

  document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !searchDropdown.contains(e.target)) {
      searchDropdown.style.display = 'none';
    }
  });
}

export function bindTreeSidebar() {
  const treeSidebar = document.getElementById('treeSidebar');
  const toggleTreeBtn = document.getElementById('toggleTreeBtn');
  const resizeHandle = document.getElementById('treeResizeHandle');

  initSidebar2DView();

  bindSidebarSearch();

  let isResizingTree = false;
  let startXTree, startWidthTree, savedWidth = 260;

  function setCollapsed(collapsed) {
    if (!treeSidebar) return;
    if (collapsed) {
      treeSidebar.classList.add('collapsed');
      treeSidebar.style.width = '0';
      if (toggleTreeBtn) toggleTreeBtn.textContent = '▶';
    } else {
      treeSidebar.classList.remove('collapsed');
      treeSidebar.style.width = savedWidth + 'px';
      if (toggleTreeBtn) toggleTreeBtn.textContent = '◀';
      setTimeout(() => {
        for (const [_, s] of instances) resizeSidebarCanvas(s);
      }, 100);
    }
  }

  if (toggleTreeBtn) {
    toggleTreeBtn.textContent = treeSidebar.classList.contains('collapsed') ? '▶' : '◀';
    toggleTreeBtn.removeEventListener('click', () => { });
    toggleTreeBtn.addEventListener('click', () => {
      const collapsed = treeSidebar.classList.contains('collapsed');
      setCollapsed(!collapsed);
    });
  }

  if (resizeHandle && treeSidebar) {
    let rafIdTree = null;
    let pendingWidth = 0;

    resizeHandle.addEventListener('mousedown', (e) => {
      if (treeSidebar.classList.contains('collapsed')) return;
      e.preventDefault();
      isResizingTree = true;
      startXTree = e.clientX;
      startWidthTree = treeSidebar.offsetWidth;
      pendingWidth = startWidthTree;
      resizeHandle.classList.add('active');
      treeSidebar.classList.add('resizing'); // 禁用 width 过渡，避免追赶滞后
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
    });

    window.addEventListener('mousemove', (e) => {
      if (!isResizingTree) return;
      const delta = e.clientX - startXTree;
      pendingWidth = Math.max(150, startWidthTree + delta);
      // rAF 节流：一帧只触发一次回流
      if (rafIdTree === null) {
        rafIdTree = requestAnimationFrame(() => {
          rafIdTree = null;
          treeSidebar.style.width = pendingWidth + 'px';
        });
      }
    });

    window.addEventListener('mouseup', () => {
      if (!isResizingTree) return;
      isResizingTree = false;
      // 取消未执行的 rAF，立即落定最终宽度
      if (rafIdTree !== null) {
        cancelAnimationFrame(rafIdTree);
        rafIdTree = null;
      }
      treeSidebar.style.width = pendingWidth + 'px';
      savedWidth = pendingWidth;
      treeSidebar.classList.remove('resizing');
      resizeHandle.classList.remove('active');
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      // canvas 重绘延后到下一帧，避免与 mouseup 回流叠加
      requestAnimationFrame(() => {
        for (const [_, s] of instances) resizeSidebarCanvas(s);
      });
    });
  }

  if (!treeSidebar.classList.contains('collapsed')) {
    setTimeout(() => {
      for (const [_, s] of instances) resizeSidebarCanvas(s);
    }, 100);
  }
}

// ============================================================
//  层数条（树形面板2D视图左侧）
// ============================================================
const STRIP_HUES = [200, 170, 260, 140, 320, 80, 40, 290, 220, 180];

/**
 * 渲染指定层数条容器
 */
export function renderLayerStrip(stripId) {
  const el = document.getElementById(stripId);
  if (!el) return;
  const sorted = [...appState.layers].sort((a, b) => a.order - b.order);
  el.innerHTML = '';
  sorted.forEach((layer, i) => {
    const hue = STRIP_HUES[i % STRIP_HUES.length];
    const isActive = layer.id === appState.currentLayerId;
    const item = document.createElement('div');
    item.className = 'layer-strip-item' + (isActive ? ' active' : '');
    item.dataset.layerId = layer.id;
    item.title = `${layer.name} (第 ${i + 1} 层)`;
    item.style.background = `linear-gradient(90deg, hsl(${hue},60%,50%), hsl(${hue},60%,35%))`;
    const label = document.createElement('span');
    label.className = 'strip-label';
    label.textContent = `${i + 1}`;
    item.appendChild(label);
    el.appendChild(item);
  });
}

/**
 * 初始化层数条：渲染 + 点击切换
 */
export function initLayerStrip(stripId) {
  renderLayerStrip(stripId);
  const el = document.getElementById(stripId);
  if (!el) return;

  el.addEventListener('click', (e) => {
    const item = e.target.closest('.layer-strip-item');
    if (!item) return;
    const layerId = item.dataset.layerId;
    if (!layerId || layerId === appState.currentLayerId) return;
    appState.switchLayer(layerId);
    // 刷新所有层数条
    for (const id of ['treeLayerStrip']) {
      renderLayerStrip(id);
    }
    // 刷新树形面板 2D 视图
    for (const [_, s] of instances) resizeSidebarCanvas(s);
    // 同步全屏 2D 视图（如果开着）
    if (appState.is2DView && appState.refresh2DView) {
      appState.refresh2DView();
    }
  });
}