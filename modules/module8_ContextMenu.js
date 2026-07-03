// ============================================================
//  模块8：右键菜单与空白菜单（使用 appState）
// ============================================================
import { appState } from './module0_AppState.js';
import { saveCurrentProjectData, renderProjectList } from './module2_TreeData.js';
import { updateNodeVisuals, addSingleTreeLine } from './VisualComponents/index.js';
import { showPrompt, showConfirm } from './module4_Confirm.js';
import { showLineTooltip, hideLineTooltip } from './MoveMode/LineTooltip.js';
import { clearSelected, setSelectedNode, getPrimarySelectedId, updateSelectionUI, deleteSelectedNodes, toggleChildren, startAddConnectionMode, startRemoveConnectionMode, cancelConnectionMode, showToast } from './module5_SelectAndEdit.js';
import { withHistory } from './module3_History.js';
import { activateSplitScreen } from './richEditor/content-io/index.js';

let contextMenuEventsBound = false;

// 获取 DOM 元素
const contextMenu = document.getElementById('nodeContextMenu');
const blankContextMenu = document.getElementById('blankContextMenu');

// ---------- 空白菜单 ----------
export function showBlankContextMenu(x, y) {
  blankContextMenu.style.display = 'flex';
  blankContextMenu.style.zIndex = '9999';
  blankContextMenu.style.visibility = 'hidden';
  blankContextMenu.style.left = '0px';
  blankContextMenu.style.top = '0px';

  const menuWidth = blankContextMenu.offsetWidth;
  const menuHeight = blankContextMenu.offsetHeight;
  const winW = window.innerWidth;
  const winH = window.innerHeight;
  const TASKBAR = 44;

  let left = x + 4;
  let top = y + 4;
  if (left + menuWidth > winW) left = Math.max(0, winW - menuWidth - 4);
  if (top + menuHeight > winH - TASKBAR) top = Math.max(0, winH - TASKBAR - menuHeight - 4);

  blankContextMenu.style.left = left + 'px';
  blankContextMenu.style.top = top + 'px';
  blankContextMenu.style.visibility = 'visible';
}

export function hideBlankContextMenu() {
  blankContextMenu.style.display = 'none';
}

// ---------- 跨图层节点导航 ----------
function _navigateToCrossLayerNode(targetNodeId) {
  const layer = appState.getLayerForNode(targetNodeId);
  if (!layer) return;
  appState.switchLayer(layer.id);
  hideContextMenu();
  if (appState.is2DView) {
    if (appState.refresh2DView) appState.refresh2DView();
    if (appState.focusOnNode2D) setTimeout(() => appState.focusOnNode2D(targetNodeId), 50);
  }
}

// ============================================================
//  跨图层子菜单：重命名 / 删除连线
// ============================================================
function _removeCrossLayerSubmenu() {
  const m = document.getElementById('crossLayerSubMenu');
  if (m) m.remove();
}

function _showCrossLayerSubMenu(x, y, edge, currentNodeId) {
  _removeCrossLayerSubmenu();
  hideLineTooltip();

  const userData = {
    edgeType: 'cross',
    startId: edge.source,
    endId: edge.target,
    label: edge.label || '',
    labelHidden: edge.labelHidden !== false,
    customColor: edge.customColor || null,
    parentId: null,
    _crossEdgeRef: edge
  };

  showLineTooltip(x, y, userData, '10001');
}

// ============================================================
//  刷新跨图层连接节点列表（供 showContextMenu / 子菜单共用）
// ============================================================
function _populateCrossLayerSection(nodeId) {
  const crossSection = document.getElementById('crossLayerSection');
  const sourceList = document.getElementById('crossLayerSourceList');
  const targetList = document.getElementById('crossLayerTargetList');
  if (!crossSection || !sourceList || !targetList) return;

  // 清空动态内容（保留标题）
  while (sourceList.children.length > 1) sourceList.removeChild(sourceList.lastChild);
  while (targetList.children.length > 1) targetList.removeChild(targetList.lastChild);

  const crossEdges = appState.crossEdges || [];
  let hasCrossLayer = false;

  for (const edge of crossEdges) {
    const srcLayer = appState.getLayerForNode(edge.source);
    const tgtLayer = appState.getLayerForNode(edge.target);
    if (!srcLayer || !tgtLayer || srcLayer.id === tgtLayer.id) continue;

    // 当前节点是源 → 目标节点列表
    if (edge.source === nodeId) {
      hasCrossLayer = true;
      const tgtNode = appState.nodeMap.get(edge.target);
      if (!tgtNode) continue;
      targetList.appendChild(_createCrossLayerItem(edge, tgtNode.name, tgtLayer.name, edge.target, nodeId));
    }
    // 当前节点是目标 → 源节点列表
    if (edge.target === nodeId) {
      hasCrossLayer = true;
      const srcNode = appState.nodeMap.get(edge.source);
      if (!srcNode) continue;
      sourceList.appendChild(_createCrossLayerItem(edge, srcNode.name, srcLayer.name, edge.source, nodeId));
    }
  }

  crossSection.style.display = hasCrossLayer ? 'block' : 'none';
}

function _createCrossLayerItem(edge, nodeName, layerName, connectedNodeId, currentNodeId) {
  const item = document.createElement('div');
  item.style.cssText = 'display:flex;align-items:center;justify-content:space-between;' +
    'background:#1a3545;border:1px solid #2c6e7e;border-radius:4px;padding:3px 8px;' +
    'font-size:11px;cursor:pointer;user-select:none;';

  // 左侧：节点名(图层名)
  const nameSpan = document.createElement('span');
  nameSpan.style.cssText = 'color:#c0f0ff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
  nameSpan.textContent = `${nodeName} (${layerName})`;

  // 右侧：连线名称标签
  const labelSpan = document.createElement('span');
  labelSpan.style.cssText = 'color:#ffd700;font-size:10px;margin-left:6px;flex-shrink:0;';
  labelSpan.textContent = edge.label || '';

  item.appendChild(nameSpan);
  item.appendChild(labelSpan);

  // 左键 → 跳转定位
  item.addEventListener('click', () => _navigateToCrossLayerNode(connectedNodeId));

  // 右键 → 子菜单
  item.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    _showCrossLayerSubMenu(e.clientX, e.clientY, edge, currentNodeId);
  });

  return item;
}

// ---------- 节点右键菜单 ----------
export function showContextMenu(x, y, nodeId) {
  const node = appState.nodeMap.get(nodeId);
  if (!node) return;
  appState.contextTargetId = nodeId;

  document.getElementById('contextNodeName').textContent = node.name;
  document.getElementById('contextNodeName').style.display = 'inline';
  document.getElementById('contextRenameInput').style.display = 'none';
  document.getElementById('contextRenameInput').value = node.name;

  const sizeSlider = document.getElementById('nodeSizeSlider');
  sizeSlider.value = node.sizeScale || 1;
  document.getElementById('nodeSizeValue').textContent = parseFloat(sizeSlider.value).toFixed(1);

  const speedSlider = document.getElementById('ringSpeedSlider');
  speedSlider.value = node.ringSpeedFactor ?? 1;
  document.getElementById('ringSpeedValue').textContent = parseFloat(speedSlider.value).toFixed(1);

  document.getElementById('nodeFixedColorPicker').value = node.fixedColor || '#ffffff';

  // ── 节点形状 ──
  const shapeSelect = document.getElementById('nodeShapeSelect');
  if (shapeSelect) shapeSelect.value = node.nodeShape || 'roundedRect';

  // ── 3D 节点形状 ──
  const shape3DSelect = document.getElementById('node3DShapeSelect');
  if (shape3DSelect) shape3DSelect.value = node.node3DShape || 'sphere';

  // ── 跨图层连接节点列表 ──
  _populateCrossLayerSection(nodeId);

  document.getElementById('alignSection').style.display = 'none';

  document.getElementById('alignSection').style.display = 'none';
  document.getElementById('alignRowHorizontal').style.display = 'none';
  document.getElementById('alignRowVertical').style.display = 'none';
  document.getElementById('groupRow').style.display = 'none';

  contextMenu.style.display = 'flex';
  contextMenu.style.zIndex = '9999';
  contextMenu.style.visibility = 'hidden';
  contextMenu.style.left = '0px';
  contextMenu.style.top = '0px';

  const menuWidth = contextMenu.offsetWidth;
  const menuHeight = contextMenu.offsetHeight;
  const winW = window.innerWidth;
  const winH = window.innerHeight;
  const TASKBAR = 44;

  let left = x + 4;
  let top = y + 4;
  if (left + menuWidth > winW) left = Math.max(0, winW - menuWidth - 4);
  if (top + menuHeight > winH - TASKBAR) top = Math.max(0, winH - TASKBAR - menuHeight - 4);

  contextMenu.style.left = left + 'px';
  contextMenu.style.top = top + 'px';
  contextMenu.style.visibility = 'visible';

  // “变成根节点”按钮仅在非根节点的右键菜单出现，“变成子节点”按钮仅在根节点的右键菜单出现
  const isRoot = _isRootNode(nodeId);
  const convertRootRow = document.getElementById('convertRootRow');
  if (convertRootRow) convertRootRow.style.display = isRoot ? 'none' : 'flex';
  const convertChildRow = document.getElementById('convertChildRow');
  if (convertChildRow) convertChildRow.style.display = isRoot ? 'flex' : 'none';

  if (appState._isSidebarContextMenu) {
    document.getElementById('addChildNodeBtn').style.display = 'block';
    document.getElementById('addNextNodeBtn').style.display = 'block';
    document.getElementById('toggleChildrenContextBtn').style.display = 'block';
    document.getElementById('copyNodeBtn').style.display = 'none';
    document.getElementById('moveNodeBtn').style.display = 'none';
    document.getElementById('locateOtherViewBtn').style.display = 'none';
    document.getElementById('deleteNodeContextBtn').style.display = 'none';
    document.getElementById('addConnectionContextBtn').style.display = 'none';
    document.getElementById('removeConnectionContextBtn').style.display = 'none';

    const splitScreenRow = document.getElementById('splitScreenRow');
    if (splitScreenRow) {
      const isEditingOtherNode = appState.editorOpen && nodeId !== appState.currentEditNodeId;
      splitScreenRow.style.display = isEditingOtherNode ? 'flex' : 'none';
    }
  } else {
    document.getElementById('addChildNodeBtn').style.display = 'block';
    document.getElementById('addNextNodeBtn').style.display = 'block';
    document.getElementById('toggleChildrenContextBtn').style.display = 'block';
    document.getElementById('copyNodeBtn').style.display = 'block';
    document.getElementById('moveNodeBtn').style.display = 'block';
    document.getElementById('locateOtherViewBtn').style.display = 'block';
    document.getElementById('deleteNodeContextBtn').style.display = 'block';
    document.getElementById('addConnectionContextBtn').style.display = 'block';
    document.getElementById('removeConnectionContextBtn').style.display = 'block';

    const splitScreenRow = document.getElementById('splitScreenRow');
    if (splitScreenRow) {
      const isEditingOtherNode = appState.editorOpen && nodeId !== appState.currentEditNodeId;
      splitScreenRow.style.display = isEditingOtherNode ? 'flex' : 'none';
    }
  }

  const locateBtn = document.getElementById('locateOtherViewBtn');
  if (locateBtn) {
    locateBtn.textContent = appState.is2DView ? '定位到 3D 视图' : '定位到 2D 视图';
  }
}

export function hideContextMenu() {
  if (contextMenu) contextMenu.style.display = 'none';
  if (blankContextMenu) blankContextMenu.style.display = 'none';
  _removeCrossLayerSubmenu();
  hideLineTooltip();
  const crossSection = document.getElementById('crossLayerSection');
  if (crossSection) crossSection.style.display = 'none';
  appState.contextTargetId = null;
  appState._isSidebarContextMenu = false;
}
appState.hideContextMenu = hideContextMenu;

function applyContextChanges() {
  if (!appState.contextTargetId) return;
  
  const sizeValue = parseFloat(document.getElementById('nodeSizeSlider').value);
  const speedValue = parseFloat(document.getElementById('ringSpeedSlider').value);
  const col = document.getElementById('nodeFixedColorPicker').value;
  const colorValue = (col && col !== '#ffffff') ? col : null;
  const shapeValue = document.getElementById('nodeShapeSelect')?.value || 'roundedRect';
  const shape3DValue = document.getElementById('node3DShapeSelect')?.value || 'sphere';

  if (appState.contextTargetId === 'multi') {
    for (const id of appState.selectedNodeIds) {
      const node = appState.nodeMap.get(id);
      if (node) {
        node.sizeScale = sizeValue;
        node.ringSpeedFactor = speedValue;
        node.fixedColor = colorValue;
        node.nodeShape = shapeValue;
        node.node3DShape = shape3DValue;
        updateNodeVisuals(id);
      }
    }
  } else {
    const node = appState.nodeMap.get(appState.contextTargetId);
    if (!node) return;
    node.sizeScale = sizeValue;
    node.ringSpeedFactor = speedValue;
    node.fixedColor = colorValue;
    node.nodeShape = shapeValue;
    node.node3DShape = shape3DValue;
    updateNodeVisuals(appState.contextTargetId);
  }
  
  saveCurrentProjectData();
  if (appState.refresh2DView) appState.refresh2DView();
  if (appState.refreshTreePanel) appState.refreshTreePanel();
}

// ---------- 判断节点是否为根节点（虚拟根的直接子节点） ----------
function _isRootNode(nodeId) {
  const roots = appState.methodsTree && appState.methodsTree.children;
  return !!(roots && roots.some(c => c && c.id === nodeId));
}

// ---------- 在树中查找节点的父节点 ----------
function _findParentOfNode(nodeId) {
  const stack = [appState.methodsTree];
  while (stack.length) {
    const cur = stack.pop();
    if (cur && cur.children) {
      for (const c of cur.children) {
        if (c && c.id === nodeId) return cur;
        stack.push(c);
      }
    }
  }
  return null;
}

// ---------- 将节点断开与父节点的连线，变成根节点 ----------
// makeStep=true → 步骤根节点；makeStep=false → 文本根节点
const convertNodeToRoot = withHistory(function (nodeId, makeStep) {
  const node = appState.nodeMap.get(nodeId);
  if (!node) return;
  if (_isRootNode(nodeId)) return;             // 已是根节点，无需处理
  const parent = _findParentOfNode(nodeId);
  if (!parent || !parent.children) return;
  const idx = parent.children.findIndex(c => c && c.id === nodeId);
  if (idx === -1) return;

  // 从原父节点摘除，挂到虚拟根下成为根节点
  parent.children.splice(idx, 1);
  if (!appState.methodsTree.children) appState.methodsTree.children = [];
  appState.methodsTree.children.push(node);

  // 设置节点类型：步骤根节点 / 文本根节点
  if (makeStep) node.isStepFlow = true;
  else delete node.isStepFlow;
  // 根节点默认大小为普通子节点的 1.5 倍
  node.sizeScale = 1.5;

  // 移除原父→当前节点的 3D 树连线（仅这一条，保留其与子节点的连线）
  for (let i = appState.lineItems.length - 1; i >= 0; i--) {
    const it = appState.lineItems[i];
    if (it.edgeType === 'tree' && it.startId === parent.id && it.endId === nodeId) {
      it.line.dispose();
      appState.lineItems.splice(i, 1);
      break;
    }
  }

  updateNodeVisuals(nodeId);
  saveCurrentProjectData();
  if (appState.refresh2DView) appState.refresh2DView();
  if (appState.refreshTreePanel) appState.refreshTreePanel();
});

// ---------- 判断 candidateId 是否为 ancestorId 的后代（避免环路） ----------
function _isDescendantOf(candidateId, ancestorId) {
  const ancestor = appState.nodeMap.get(ancestorId);
  if (!ancestor || !ancestor.children) return false;
  const stack = [...ancestor.children];
  while (stack.length) {
    const cur = stack.pop();
    if (cur && cur.id === candidateId) return true;
    if (cur && cur.children) stack.push(...cur.children);
  }
  return false;
}

// ---------- “变成子节点”选择目标模式 ----------
// makeStep=true → 步骤子节点；makeStep=false → 文本子节点
function _ensureConvertChildHint() {
  let hint = document.getElementById('convertChildHint');
  if (!hint) {
    hint = document.createElement('div');
    hint.id = 'convertChildHint';
    hint.style.cssText = 'display:none;position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:rgba(10,25,40,0.94);border:1px solid rgba(0,255,255,0.6);border-radius:24px;padding:10px 24px;z-index:9999;color:#aef0ff;font-size:14px;pointer-events:none;box-shadow:0 4px 20px rgba(0,0,0,0.6);';
    document.body.appendChild(hint);
  }
  return hint;
}

export function startConvertChildMode(nodeId, makeStep) {
  appState.convertChildMode = makeStep ? 'step' : 'text';
  appState.convertChildSourceId = nodeId;
  const hint = _ensureConvertChildHint();
  hint.textContent = '请单击选择其他节点，点击后原来的根节点变成选择节点的子节点';
  hint.style.display = 'block';
  if (appState.renderer && appState.renderer.domElement) {
    appState.renderer.domElement.style.cursor = 'crosshair';
  }
}

export function cancelConvertChildMode() {
  const hint = document.getElementById('convertChildHint');
  if (hint) hint.style.display = 'none';
  appState.convertChildMode = null;
  appState.convertChildSourceId = null;
  if (appState.renderer && appState.renderer.domElement) {
    appState.renderer.domElement.style.cursor = '';
  }
}

// ---------- 完成转换：根节点 → 目标节点的子节点 ----------
const completeConvertChildMode = withHistory(function (targetNodeId) {
  const srcId = appState.convertChildSourceId;
  const makeStep = appState.convertChildMode === 'step';
  cancelConvertChildMode();

  if (!srcId) return;
  if (srcId === targetNodeId) { showToast('不能选择自身'); return; }
  const srcNode = appState.nodeMap.get(srcId);
  const tgtNode = appState.nodeMap.get(targetNodeId);
  if (!srcNode || !tgtNode) return;
  // 目标不能是源的后代（会形成环路）
  if (_isDescendantOf(targetNodeId, srcId)) { showToast('不能选择该节点的子节点'); return; }
  // 源必须是根节点
  const roots = appState.methodsTree && appState.methodsTree.children;
  if (!roots) return;
  const idx = roots.findIndex(c => c && c.id === srcId);
  if (idx === -1) return;

  // 从虚拟根摘除，挂到目标节点下
  roots.splice(idx, 1);
  if (!tgtNode.children) tgtNode.children = [];
  tgtNode.children.push(srcNode);

  // 设置节点类型
  if (makeStep) srcNode.isStepFlow = true;
  else delete srcNode.isStepFlow;
  // 变为子节点，恢复普通子节点大小
  srcNode.sizeScale = 1.0;

  // 添加 3D 树连线
  addSingleTreeLine(targetNodeId, srcId);

  updateNodeVisuals(srcId);
  saveCurrentProjectData();
  if (appState.refresh2DView) appState.refresh2DView();
  if (appState.refreshTreePanel) appState.refreshTreePanel();
});

export { completeConvertChildMode };

// ---------- 绑定内部事件 ----------
export function bindContextMenuEvents() {
  if (contextMenuEventsBound) return;
  contextMenuEventsBound = true;

  const sizeSlider = document.getElementById('nodeSizeSlider');
  const speedSlider = document.getElementById('ringSpeedSlider');
  const colorPicker = document.getElementById('nodeFixedColorPicker');
  const clearColorBtn = document.getElementById('clearFixedColorBtn');
  const resetDefaultsBtn = document.getElementById('resetNodeDefaultsBtn');

  if (sizeSlider) {
    sizeSlider.addEventListener('input', () => {
      document.getElementById('nodeSizeValue').textContent = parseFloat(sizeSlider.value).toFixed(1);
      applyContextChanges();
    });
  }
  if (speedSlider) {
    speedSlider.addEventListener('input', () => {
      document.getElementById('ringSpeedValue').textContent = parseFloat(speedSlider.value).toFixed(1);
      applyContextChanges();
    });
  }
  if (colorPicker) colorPicker.addEventListener('input', applyContextChanges);
  if (clearColorBtn) {
    clearColorBtn.addEventListener('click', () => {
      colorPicker.value = '#ffffff';
      applyContextChanges();
    });
  }
  const shapeSelect = document.getElementById('nodeShapeSelect');
  if (shapeSelect) {
    shapeSelect.addEventListener('change', applyContextChanges);
  }
  const shape3DSelect = document.getElementById('node3DShapeSelect');
  if (shape3DSelect) {
    shape3DSelect.addEventListener('change', applyContextChanges);
  }
  if (resetDefaultsBtn) {
    resetDefaultsBtn.addEventListener('click', () => {
      if (!appState.contextTargetId) return;
      
      sizeSlider.value = 1;
      document.getElementById('nodeSizeValue').textContent = '1.0';
      speedSlider.value = 1;
      document.getElementById('ringSpeedValue').textContent = '1.0';
      colorPicker.value = '#ffffff';
      if (shapeSelect) shapeSelect.value = 'roundedRect';
      if (shape3DSelect) shape3DSelect.value = 'sphere';

      if (appState.contextTargetId === 'multi') {
        for (const id of appState.selectedNodeIds) {
          const node = appState.nodeMap.get(id);
          if (node) {
            node.sizeScale = 1.0;
            node.ringSpeedFactor = 1.0;
            node.fixedColor = null;
            node.nodeShape = 'roundedRect';
            node.node3DShape = 'sphere';
            updateNodeVisuals(id);
          }
        }
      } else {
        const node = appState.nodeMap.get(appState.contextTargetId);
        if (!node) return;
        node.sizeScale = 1.0;
        node.ringSpeedFactor = 1.0;
        node.fixedColor = null;
        node.nodeShape = 'roundedRect';
        node.node3DShape = 'sphere';
        updateNodeVisuals(appState.contextTargetId);
      }
      
      saveCurrentProjectData();
      if (appState.refresh2DView) appState.refresh2DView();
      if (appState.refreshTreePanel) appState.refreshTreePanel();
    });
  }

  document.addEventListener('click', (e) => {
    // 检查是否点击在其他模态框内，避免误关闭右键菜单
    const isInModal = e.target.closest('#customConfirmModal, #customPromptModal');
    const isInSubMenu = e.target.closest('#crossLayerSubMenu');
    const isInLineTooltip = e.target.closest('#lineTooltip');
    if (isInModal || isInSubMenu || isInLineTooltip) return;
    // 如果连线标签框正在显示，不关闭右键菜单（hideContextMenu 会误关标签框）
    const lt = document.getElementById('lineTooltip');
    if (lt && lt.style.display === 'block') return;
    
    if (!contextMenu.contains(e.target) && e.button !== 2) hideContextMenu();
    if (!blankContextMenu.contains(e.target) && e.button !== 2) hideBlankContextMenu();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (appState.connectionMode) {
        cancelConnectionMode();
        return;
      }
      if (appState.convertChildMode) {
        cancelConvertChildMode();
        return;
      }
      hideContextMenu();
      hideBlankContextMenu();
    }
  });
  
  document.getElementById('toggleChildrenContextBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();          // 防止任何默认行为
    const id = appState.contextTargetId;
    if (!id) return;
    if (appState._isSidebarContextMenu) {
      appState._isSidebarContextMenu = false;
      if (appState.toggleSidebarCollapse) {
        appState.toggleSidebarCollapse(id);
      }
    } else if (appState.is2DView && appState.toggle2DCollapse) {
      appState.toggle2DCollapse(id);
    }
    toggleChildren();
  });

  document.getElementById('addConnectionContextBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    let id = appState.contextTargetId;
    if (!id) return;
    hideContextMenu();
    startAddConnectionMode(id);
  });

  document.getElementById('removeConnectionContextBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    let id = appState.contextTargetId;
    if (!id) return;
    hideContextMenu();
    startRemoveConnectionMode(id);
  });

  document.getElementById('splitScreenBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    let id = appState.contextTargetId;
    if (!id) return;
    hideContextMenu();
    activateSplitScreen(id);
  });

  document.getElementById('openHtmlEditorBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    let id = appState.contextTargetId;
    if (!id) return;
    hideContextMenu();
    if (window.openHtmlSandboxEditor) {
      window.openHtmlSandboxEditor(id);
    }
  });

  const convertToTextRootBtn = document.getElementById('convertToTextRootBtn');
  if (convertToTextRootBtn) {
    convertToTextRootBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const id = appState.contextTargetId;
      if (!id) return;
      hideContextMenu();
      convertNodeToRoot(id, false);
    });
  }

  const convertToStepRootBtn = document.getElementById('convertToStepRootBtn');
  if (convertToStepRootBtn) {
    convertToStepRootBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const id = appState.contextTargetId;
      if (!id) return;
      hideContextMenu();
      convertNodeToRoot(id, true);
    });
  }

  const convertToTextChildBtn = document.getElementById('convertToTextChildBtn');
  if (convertToTextChildBtn) {
    convertToTextChildBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const id = appState.contextTargetId;
      if (!id) return;
      hideContextMenu();
      startConvertChildMode(id, false);
    });
  }

  const convertToStepChildBtn = document.getElementById('convertToStepChildBtn');
  if (convertToStepChildBtn) {
    convertToStepChildBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const id = appState.contextTargetId;
      if (!id) return;
      hideContextMenu();
      startConvertChildMode(id, true);
    });
  }
}