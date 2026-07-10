// ============================================================
//  LayerManager / index.js — 图层管理浮动面板
//  负责图层列表渲染、拖拽排序、右键菜单、增删改
//  面板可拖拽移动、点击按钮切换展开/折叠
// ============================================================

import { appState } from '../module0_AppState.js';
import { showConfirm } from '../module4_Confirm.js';
import { saveCurrentProjectData } from '../module2_TreeData.js';
import * as THREE from 'three';

let dragSrcIndex = null;
const CARD_HUES = [200, 170, 260, 140, 320, 80, 40, 290, 220, 180];

// 慢双击重命名状态
let _lastClickedLayerId = null;
let _lastLayerClickTime = 0;
let _layerRenameActive = false;

export function initLayerManager() {
  const panel = document.getElementById('layerManagerModal');
  if (!panel) return;

  // 切换展开/折叠
  document.getElementById('layerIconBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (panel.style.display === 'none' || !panel.style.display) {
      openLayerPanel(panel);
    } else {
      closeLayerPanel(panel);
    }
  });

  // 关闭按钮
  document.getElementById('closeLayerModalBtn')?.addEventListener('click', () => {
    closeLayerPanel(panel);
  });

  // 新建图层
  document.getElementById('addLayerBtn')?.addEventListener('click', () => {
    const newLayer = appState.createLayer('图层 ' + (appState.layers.length + 1));
    renderLayerList();
    const item = document.querySelector(`.layer-item[data-layer-id="${newLayer.id}"]`);
    if (item) item.scrollIntoView({ behavior: 'smooth' });
  });

  // 图层总览按钮
  document.getElementById('overviewLayersBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    openOverview();
  });

  // ESC 关闭总览
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const overview = document.getElementById('layerOverview');
      if (overview && overview.style.display !== 'none') {
        closeOverview();
      }
    }
  });

  // 阻止浏览器默认右键菜单（总览内）
  document.getElementById('layerOverview')?.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });

  // 点击总览背景关闭总览
  document.getElementById('layerOverview')?.addEventListener('click', (e) => {
    if (e.target.closest('.layer-overview-content')) return;
    closeOverview();
  });

  // 关闭右键菜单
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('layerContextMenu');
    if (menu && menu.style.display !== 'none' && !menu.contains(e.target) && e.button !== 2) {
      menu.style.display = 'none';
    }
  });

  // ========== 拖拽移动面板 ==========
  const header = document.getElementById('layerPanelHeader');
  if (header) {
    let dragging = false;
    let startX, startY, startLeft, startTop;

    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = panel.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      panel.style.right = 'auto';
      panel.style.top = startTop + 'px';
      panel.style.left = startLeft + 'px';
      panel.style.transition = 'none';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const newLeft = startLeft + dx;
      const newTop = startTop + dy;
      panel.style.left = Math.max(0, Math.min(newLeft, window.innerWidth - panel.offsetWidth)) + 'px';
      panel.style.top = Math.max(0, Math.min(newTop, window.innerHeight - panel.offsetHeight)) + 'px';
    });

    document.addEventListener('mouseup', () => {
      if (dragging) {
        dragging = false;
        panel.style.transition = '';
      }
    });
  }
}

function openLayerPanel(panel) {
  renderLayerList();
  const btn = document.getElementById('layerIconBtn');
  if (btn) {
    const btnRect = btn.getBoundingClientRect();
    panel.style.top = (btnRect.bottom + 4) + 'px';
    panel.style.left = 'auto';
    panel.style.right = (window.innerWidth - btnRect.right) + 'px';
  }
  panel.style.display = 'flex';
}

function closeLayerPanel(panel) {
  panel.style.display = 'none';
}

// ============================================================
//  图层总览（全屏 3D 层叠视图）
// ============================================================
function openOverview() {
  const overlay = document.getElementById('layerOverview');
  if (!overlay) return;
  // 关闭可能还开着的右键菜单
  const menu = document.getElementById('layerContextMenu');
  if (menu) menu.style.display = 'none';
  renderOverviewCards();
  overlay.style.display = 'flex';
  // 关闭浮动面板
  const panel = document.getElementById('layerManagerModal');
  if (panel) panel.style.display = 'none';
}

function closeOverview() {
  const overlay = document.getElementById('layerOverview');
  if (overlay) overlay.style.display = 'none';
}

function renderOverviewCards() {
  const container = document.getElementById('layerOverviewCards');
  if (!container) return;

  container.innerHTML = '';
  const sorted = [...appState.layers].sort((a, b) => a.order - b.order);
  const total = sorted.length;

  // 保存每行的 index 用于拖拽
  sorted.forEach((layer, index) => {
    const hue = CARD_HUES[index % CARD_HUES.length];
    const nodeCount = layer.nodeIds ? layer.nodeIds.size : 0;
    const isCurrent = layer.id === appState.currentLayerId;

    // 行容器：纸片 + 侧标签
    const row = document.createElement('div');
    row.className = 'layer-paper-row';
    row.draggable = true;
    row.dataset.layerId = layer.id;
    row.dataset.index = index;

    // 纸片
    const card = document.createElement('div');
    card.className = 'layer-card' + (isCurrent ? ' active' : '');
    card.dataset.layerId = layer.id;
    card.style.zIndex = total - index;

    // 金色节点亮点（数量和节点数一致，最多 30 颗避免太密）
    const dotCount = Math.min(nodeCount, 30);
    for (let d = 0; d < dotCount; d++) {
      const dot = document.createElement('div');
      dot.className = 'layer-card-dot';
      const left = 8 + Math.random() * 82;
      const top = 8 + Math.random() * 72;
      dot.style.left = left + '%';
      dot.style.top = top + '%';
      dot.style.animationDelay = (Math.random() * 2.5).toFixed(2) + 's';
      card.appendChild(dot);
    }

    // 侧标签
    const label = document.createElement('div');
    label.className = 'layer-paper-label';
    label.innerHTML = `
      <div class="layer-label-index" style="color:hsl(${hue},60%,60%)">第 ${index + 1} 层</div>
      <div class="layer-label-name">${escapeHtml(layer.name)}</div>
      <div class="layer-label-meta">
        <span>📦 ${nodeCount} 节点</span>
        ${isCurrent ? '<span class="layer-label-current">当前</span>' : ''}
      </div>
    `;

    row.appendChild(label);
    row.appendChild(card);

    // 左键：进入图层（点卡或标签都生效）
    const clickHandler = (e) => {
      e.stopPropagation();
      switchToLayer(layer.id);
      closeOverview();
    };
    card.addEventListener('click', clickHandler);
    label.addEventListener('click', clickHandler);

    // 右键菜单（整个行）
    const contextHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      showLayerContextMenu(e.clientX, e.clientY, layer);
    };
    row.addEventListener('contextmenu', contextHandler);

    // ---- 拖拽排序 ----
    row.addEventListener('dragstart', (e) => {
      dragSrcIndex = index;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', layer.id);
      row.classList.add('dragging');
      // 其他行推挤动画准备
      document.querySelectorAll('.layer-paper-row').forEach((r, i) => {
        if (i !== index) r.dataset.pushOffset = '0';
      });
    });

    row.addEventListener('dragend', () => {
      document.querySelectorAll('.layer-paper-row').forEach(r => {
        r.classList.remove('dragging', 'drag-over');
        r.style.transform = '';
        delete r.dataset.pushOffset;
      });
      container.querySelectorAll('.layer-paper-row-gap').forEach(el => el.remove());
      dragSrcIndex = null;
    });

    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (dragSrcIndex === null || dragSrcIndex === index) return;

      // 清除所有 push 和 gap
      document.querySelectorAll('.layer-paper-row').forEach(r => {
        r.classList.remove('drag-over');
        r.style.transform = '';
      });
      container.querySelectorAll('.layer-paper-row-gap').forEach(el => el.remove());

      row.classList.add('drag-over');

      // 推挤效果：在目标位置插入一个占位的间隙
      const gapEl = document.createElement('div');
      gapEl.className = 'layer-paper-row-gap';
      gapEl.style.cssText = 'height:100px;flex-shrink:0;transition:height 0.3s ease;';

      // 如果拖拽方向是向下（source < target），gap 插在目标后面，反之插在前面
      if (dragSrcIndex < index) {
        // 插在目标行后面
        if (row.nextSibling) {
          container.insertBefore(gapEl, row.nextSibling);
        } else {
          container.appendChild(gapEl);
        }
      } else {
        // 插在目标行前面
        container.insertBefore(gapEl, row);
      }

      // 推挤：把 dragSrc 到 target 之间的行向 gap 方向推移
      const allRows = [...container.querySelectorAll('.layer-paper-row')];
      const srcRow = allRows.find(r => parseInt(r.dataset.index) === dragSrcIndex);
      if (srcRow) {
        const srcIdx = allRows.indexOf(srcRow);
        const tgtIdx = allRows.indexOf(row);
        const dir = srcIdx < tgtIdx ? 1 : -1;
        for (let i = Math.min(srcIdx, tgtIdx); i <= Math.max(srcIdx, tgtIdx); i++) {
          if (i !== srcIdx && i !== tgtIdx) {
            const offset = 100 - 28; // ~72px = row height - negative margin
            allRows[i].style.transform = `translateY(${dir * offset}px)`;
            allRows[i].style.transition = 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
          }
        }
      }
    });

    row.addEventListener('dragleave', (e) => {
      // 只在真正离开行时才移除高亮
      if (!row.contains(e.relatedTarget)) {
        row.classList.remove('drag-over');
      }
    });

    row.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (dragSrcIndex === null || dragSrcIndex === index) return;

      // 清除效果
      document.querySelectorAll('.layer-paper-row').forEach(r => {
        r.classList.remove('dragging', 'drag-over');
        r.style.transform = '';
        r.style.transition = '';
      });
      container.querySelectorAll('.layer-paper-row-gap').forEach(el => el.remove());

      // 关闭右键菜单
      const ctxMenu = document.getElementById('layerContextMenu');
      if (ctxMenu) ctxMenu.style.display = 'none';

      reorderLayers(dragSrcIndex, index);
      dragSrcIndex = null;
      // 重新渲染总览
      renderOverviewCards();
    });

    container.appendChild(row);
  });
}

// ============================================================
//  渲染图层列表
// ============================================================
export function renderLayerList() {
  const list = document.getElementById('layerList');
  if (!list) return;

  list.innerHTML = '';

  const sorted = [...appState.layers].sort((a, b) => a.order - b.order);

  sorted.forEach((layer, index) => {
    const item = document.createElement('div');
    item.className = 'layer-item' + (layer.id === appState.currentLayerId ? ' active' : '');
    item.dataset.layerId = layer.id;
    item.dataset.index = index;
    item.draggable = true;

    item.innerHTML = `
      <span class="layer-drag-handle">⠿</span>
      <span class="layer-name">${escapeHtml(layer.name)}</span>
      <span class="layer-node-count">${layer.nodeIds ? layer.nodeIds.size : 0} 个节点</span>
    `;

    // 点击切换图层 + 慢双击重命名
    item.addEventListener('click', (e) => {
      if (e.target.closest('.layer-drag-handle')) return;
      if (_layerRenameActive) return;

      const now = Date.now();
      // 慢双击检测：同一选中图层在 300-1500ms 内再次单击 → 进入重命名
      if (appState.currentLayerId === layer.id && _lastClickedLayerId === layer.id
          && now - _lastLayerClickTime > 300 && now - _lastLayerClickTime < 1500) {
        startRenameLayer(layer);
        _lastClickedLayerId = null;
        _lastLayerClickTime = 0;
        return;
      }

      // 普通单击 → 切换图层
      switchToLayer(layer.id);
      _lastClickedLayerId = layer.id;
      _lastLayerClickTime = now;
    });

    // 右键菜单
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showLayerContextMenu(e.clientX, e.clientY, layer);
    });

    // 拖拽排序
    item.addEventListener('dragstart', (e) => {
      dragSrcIndex = index;
      e.dataTransfer.effectAllowed = 'move';
      item.classList.add('dragging');
    });

    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      document.querySelectorAll('.layer-item').forEach(el => el.classList.remove('drag-over'));
      dragSrcIndex = null;
    });

    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      document.querySelectorAll('.layer-item').forEach(el => el.classList.remove('drag-over'));
      item.classList.add('drag-over');
    });

    item.addEventListener('drop', (e) => {
      e.preventDefault();
      item.classList.remove('drag-over');
      if (dragSrcIndex !== null && dragSrcIndex !== index) {
        reorderLayers(dragSrcIndex, index);
      }
    });

    list.appendChild(item);
  });
}

// ============================================================
//  切换图层
// ============================================================
function switchToLayer(layerId) {
  if (layerId === appState.currentLayerId) return;
  appState.switchLayer(layerId);
  renderLayerList();

  // 3D 模式：相机移到该图层第一个根节点 + 高亮矩形闪烁
  if (!appState.is2DView && appState.layerHighlights && appState.layerHighlights.length > 0) {
    const sortedLayers = [...appState.layers].sort((a, b) => a.order - b.order);
    const layerIdx = sortedLayers.findIndex(l => l.id === layerId);
    const layer = sortedLayers[layerIdx];
    if (layer && layer.nodeIds) {
      // 找到该图层第一个有位置的节点
      let targetPos = null;
      for (const id of layer.nodeIds) {
        const pos = appState.positions.get(id);
        if (pos) { targetPos = pos.clone(); break; }
      }
      if (targetPos) {
        const distance = 8.0;
        const toCamera = new THREE.Vector3().subVectors(appState.camera.position, targetPos).normalize();
        const cameraPos = targetPos.clone().add(toCamera.clone().multiplyScalar(distance));
        cameraPos.y += 0.5;
        appState.cameraAnimStartPos.copy(appState.camera.position);
        appState.cameraAnimStartTarget.copy(appState.controls.target);
        appState.cameraAnimTarget = {
          cameraPos: cameraPos,
          controlsTarget: targetPos.clone()
        };
        appState.cameraAnimProgress = 0;
        appState.cameraAnimDuration = 0.8;
        appState.cameraAnimActive = true;
      }

      // 持续蓝色荧光高亮选中图层
      for (let i = 0; i < appState.layerHighlights.length; i++) {
        const hl = appState.layerHighlights[i];
        if (!hl || !hl.material) continue;
        const u = hl.material.uniforms;
        if (u) {
          if (i === layerIdx) {
            u.uColor.value.setHex(0xffa200);
            u.uOpacity.value = 0.6;
            u.uHighlight.value = 1.0;
          } else {
            u.uColor.value.setHex(0x4488ff);
            u.uOpacity.value = 0.45;
            u.uHighlight.value = 0.0;
          }
        }
      }
    }
  }

  if (appState.is2DView && appState.refresh2DView) {
    appState.refresh2DView();
  }
  // 刷新树形面板 2D 视图（层数条切换后同步）
  if (typeof refreshTreePanel === 'function') refreshTreePanel();
  else if (appState.refreshTreePanel) appState.refreshTreePanel();
}

// ============================================================
//  拖拽排序
// ============================================================
function reorderLayers(fromIdx, toIdx) {
  const sorted = [...appState.layers].sort((a, b) => a.order - b.order);
  const [moved] = sorted.splice(fromIdx, 1);
  sorted.splice(toIdx, 0, moved);
  sorted.forEach((layer, i) => { layer.order = i; });
  renderLayerList();
  saveCurrentProjectData();
}

// ============================================================
//  右键菜单
// ============================================================
function showLayerContextMenu(x, y, layer) {
  const menu = document.getElementById('layerContextMenu');
  if (!menu) return;

  menu.dataset.layerId = layer.id;
  menu.style.display = 'flex';
  menu.style.visibility = 'hidden';
  menu.style.left = '0px';
  menu.style.top = '0px';

  const menuWidth = menu.offsetWidth;
  const menuHeight = menu.offsetHeight;
  const winW = window.innerWidth;
  const winH = window.innerHeight;

  let left = x + 4;
  let top = y + 4;
  if (left + menuWidth > winW) left = Math.max(0, winW - menuWidth - 4);
  if (top + menuHeight > winH - 48) top = Math.max(0, winH - 48 - menuHeight - 4);

  menu.style.left = left + 'px';
  menu.style.top = top + 'px';
  menu.style.visibility = 'visible';

  const renameBtn = document.getElementById('renameLayerBtn');
  const addBelowBtn = document.getElementById('addLayerBelowBtn');
  const deleteBtn = document.getElementById('deleteLayerBtn');
  if (renameBtn) {
    renameBtn.onclick = (e) => {
      e.stopPropagation();
      menu.style.display = 'none';
      startRenameLayer(layer);
    };
  }
  if (addBelowBtn) {
    addBelowBtn.onclick = (e) => {
      e.stopPropagation();
      menu.style.display = 'none';
      addLayerBelow(layer);
      // 同步刷新总览（如果总览开着）
      const overview = document.getElementById('layerOverview');
      if (overview && overview.style.display !== 'none') {
        renderOverviewCards();
      }
    };
  }
  if (deleteBtn) {
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      menu.style.display = 'none';
      if (appState.layers.length <= 1) {
        if (typeof window.showToast === 'function') window.showToast('至少保留一个图层');
        return;
      }
      showConfirm(`确定删除图层 "${layer.name}"？图层中的节点不会被删除，将移至默认图层。`, () => {
        appState.deleteLayer(layer.id);
        renderLayerList();
        if (appState.is2DView && appState.refresh2DView) appState.refresh2DView();
        // 同步刷新总览
        const overview = document.getElementById('layerOverview');
        if (overview && overview.style.display !== 'none') {
          renderOverviewCards();
        }
      }, null, '删除图层');
    };
  }
}

// ============================================================
//  在本图层下新建图层
// ============================================================
function addLayerBelow(layer) {
  const maxOrder = Math.max(...appState.layers.map(l => l.order), 0);
  const newLayer = appState.createLayer('图层 ' + (appState.layers.length + 1));
  // 将新图层排在目标图层之后
  const sorted = [...appState.layers].sort((a, b) => a.order - b.order);
  const targetIdx = sorted.findIndex(l => l.id === layer.id);
  const newIdx = sorted.findIndex(l => l.id === newLayer.id);
  if (newIdx !== -1) sorted.splice(newIdx, 1);
  sorted.splice(targetIdx + 1, 0, newLayer);
  sorted.forEach((l, i) => { l.order = i; });
  renderLayerList();
  saveCurrentProjectData();
}

// ============================================================
//  内联重命名
// ============================================================
function startRenameLayer(layer) {
  const item = document.querySelector(`.layer-item[data-layer-id="${layer.id}"]`);
  if (!item) return;

  const nameSpan = item.querySelector('.layer-name');
  if (!nameSpan) return;

  _layerRenameActive = true;
  const oldName = layer.name;
  const input = document.createElement('input');
  input.type = 'text';
  input.value = oldName;
  input.className = 'layer-rename-input';
  input.style.cssText = 'flex:1;background:#07161f;border:1px solid #0ff;color:#eef;padding:2px 6px;border-radius:12px;font-size:13px;min-width:80px;';

  nameSpan.replaceWith(input);
  input.focus();
  input.select();

  const finish = (save) => {
    _layerRenameActive = false;
    const newName = save ? (input.value.trim() || oldName) : oldName;
    if (newName !== oldName) {
      layer.name = newName;
      saveCurrentProjectData();
    }
    renderLayerList();
  };

  input.addEventListener('blur', () => finish(true));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}