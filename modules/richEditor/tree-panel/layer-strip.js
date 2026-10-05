// ============================================================
//  richEditor/tree-panel/layer-strip.js — 层数条（树形面板2D视图左侧）
// ============================================================
import { appState } from '../../module0_AppState.js';
import { instances } from './share.js';
import { resizeSidebarCanvas } from './index.js';

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
