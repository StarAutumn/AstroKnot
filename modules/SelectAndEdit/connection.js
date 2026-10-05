// ============================================================
//  模块5：选中系统与节点编辑操作 —— 连线管理
//  由 module5_SelectAndEdit.js 拆分
// ============================================================
import { appState } from '../module0_AppState.js';
import { withHistory } from '../module3_History.js';
import { showPrompt } from '../module4_Confirm.js';
import { saveCurrentProjectData } from '../TreeData/index.js';
import { rebuildAllLines } from '../VisualComponents/index.js';
import { showToast } from './toast.js';
import { computeConnectedHighlight, getPrimarySelectedId, updateSelectionUI } from './selection.js';

// ==================== 连线管理 ====================

/**
 * 添加交叉连线（源 -> 目标）
 * 弹出输入框让用户可选地输入标签，标签存入 crossEdges
 */
export function addConnection() {
  if (!appState.sourceNodeId || !appState.targetNodeId) {
    showToast("请先设置源节点和目标节点");
    return;
  }
  if (appState.sourceNodeId === appState.targetNodeId) {
    showToast("不能自连");
    return;
  }
  // 允许重复添加，不再检查是否存在
  showPrompt("请输入连线标签（可选，最多20字）", "", (label) => {
    if (label && label.length > 20) {
      showToast("标签不能超过20字");
      return;
    }
    withHistory(() => {
      appState.crossEdges.push({
        source: appState.sourceNodeId,
        target: appState.targetNodeId,
        label: label || "",
        labelHidden: true
      });
      rebuildAllLines();
      saveCurrentProjectData();
      computeConnectedHighlight();
      if (appState.is2DView && appState.refresh2DView) appState.refresh2DView();
    })();
  });
}

export const removeConnection = withHistory(function () {
  if (!appState.sourceNodeId || !appState.targetNodeId) {
    showToast("请先设置源节点和目标节点");
    return;
  }
  let before = appState.crossEdges.length;
  appState.crossEdges = appState.crossEdges.filter(e => !(e.source === appState.sourceNodeId && e.target === appState.targetNodeId) && !(e.source === appState.targetNodeId && e.target === appState.sourceNodeId));
  if (appState.crossEdges.length === before) {
    showToast("未找到连线");
    return;
  }
  rebuildAllLines();
  saveCurrentProjectData();
  computeConnectedHighlight();
});

function ensureConnectionHint() {
  let hint = document.getElementById('connectionHint');
  if (!hint) {
    hint = document.createElement('div');
    hint.id = 'connectionHint';
    hint.style.cssText = 'display:none;position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:rgba(10,25,40,0.94);border:1px solid rgba(0,255,255,0.6);border-radius:24px;padding:10px 24px;z-index:9999;color:#aef0ff;font-size:14px;pointer-events:none;box-shadow:0 4px 20px rgba(0,0,0,0.6);';
    document.body.appendChild(hint);
  }
  return hint;
}

export function startAddConnectionMode(nodeId) {
  appState.connectionMode = 'add';
  appState.connectionSourceId = nodeId;
  let hint = ensureConnectionHint();
  hint.textContent = '🔗 请选择目标节点，右键取消添加连线';
  hint.style.display = 'block';
  if (appState.renderer && appState.renderer.domElement) {
    appState.renderer.domElement.style.cursor = 'crosshair';
  }
}

export function startRemoveConnectionMode(nodeId) {
  appState.connectionMode = 'remove';
  appState.connectionSourceId = nodeId;
  let hint = ensureConnectionHint();
  hint.textContent = '🔗 请选择目标节点，右键取消删除连线';
  hint.style.display = 'block';
  if (appState.renderer && appState.renderer.domElement) {
    appState.renderer.domElement.style.cursor = 'crosshair';
  }
}

export function cancelConnectionMode() {
  let hint = document.getElementById('connectionHint');
  if (hint) hint.style.display = 'none';
  appState.connectionMode = null;
  appState.connectionSourceId = null;
  if (appState.renderer && appState.renderer.domElement) {
    appState.renderer.domElement.style.cursor = '';
  }
}

export function completeAddConnection(targetNodeId) {
  let srcId = appState.connectionSourceId;
  cancelConnectionMode();
  if (srcId === targetNodeId) {
    showToast('不能自连');
    return;
  }
  showPrompt('请输入连线标签（可选，最多20字）', '', function (label) {
    if (label && label.length > 20) {
      showToast('标签不能超过20字');
      return;
    }
    withHistory(function () {
      appState.crossEdges.push({
        source: srcId,
        target: targetNodeId,
        label: label || '',
        labelHidden: !label  // 有标签文字则显示，无标签则隐藏
      });
      rebuildAllLines();
      saveCurrentProjectData();
      computeConnectedHighlight();
      if (appState.is2DView && appState.refresh2DView) appState.refresh2DView();
    })();
  });
}

/**
 * 完成自由绘制连线（带锚点和拐点）
 */
export function completeAddConnectionWithWaypoints(sourceNodeId, sourceAnchor, targetNodeId, targetAnchor, waypoints) {
  if (sourceNodeId === targetNodeId) {
    showToast('不能自连');
    return;
  }
  // 自由绘制完成后也取消连线模式（如果还在的话）
  if (appState.connectionMode) cancelConnectionMode();
  showPrompt('请输入连线标签（可选，最多20字）', '', function (label) {
    if (label && label.length > 20) {
      showToast('标签不能超过20字');
      return;
    }
    withHistory(function () {
      appState.crossEdges.push({
        source: sourceNodeId,
        target: targetNodeId,
        sourceAnchor: sourceAnchor || null,
        targetAnchor: targetAnchor || null,
        waypoints: waypoints && waypoints.length > 0 ? waypoints.map(p => ({ x: p.x, y: p.y })) : null,
        label: label || '',
        labelHidden: !label  // 有标签文字则显示，无标签则隐藏
      });
      rebuildAllLines();
      saveCurrentProjectData();
      computeConnectedHighlight();
      if (appState.is2DView && appState.refresh2DView) appState.refresh2DView();
    })();
  });
}

export function completeRemoveConnection(targetNodeId) {
  let srcId = appState.connectionSourceId;
  let edges = [];
  for (let i = 0; i < appState.crossEdges.length; i++) {
    let e = appState.crossEdges[i];
    if ((e.source === srcId && e.target === targetNodeId) || (e.source === targetNodeId && e.target === srcId)) {
      edges.push({ index: i, edge: e });
    }
  }
  cancelConnectionMode();
  if (edges.length === 0) {
    showToast('未找到连线');
    return;
  }
  if (edges.length === 1) {
    withHistory(function () {
      appState.crossEdges.splice(edges[0].index, 1);
      rebuildAllLines();
      saveCurrentProjectData();
      computeConnectedHighlight();
      if (appState.is2DView && appState.refresh2DView) appState.refresh2DView();
    })();
    return;
  }
  showConnectionSelectDialog(edges, srcId, targetNodeId);
}

export function showConnectionSelectDialog(edges, srcId, targetNodeId) {
  let existing = document.getElementById('connectionSelectModal');
  if (existing) existing.remove();

  let srcName = (appState.nodeMap.get(srcId) || {}).name || srcId;
  let tgtName = (appState.nodeMap.get(targetNodeId) || {}).name || targetNodeId;

  let overlay = document.createElement('div');
  overlay.id = 'connectionSelectModal';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:10001;font-family:system-ui,sans-serif;';

  let listHtml = '';
  for (let i = 0; i < edges.length; i++) {
    let e = edges[i].edge;
    let label = e.label || '（无标签）';
    listHtml += '<label style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:#07161f;border-radius:8px;cursor:pointer;margin-bottom:6px;">' +
      '<input type="checkbox" class="conn-cb" value="' + i + '" checked style="accent-color:#0ff;">' +
      '<span style="color:#c8e6ff;font-size:13px;">' + label + '</span>' +
      '</label>';
  }

  overlay.innerHTML =
    '<div style="background:#0a1a24;border:1px solid #2c6e7e;border-radius:16px;padding:24px 28px;max-width:420px;box-shadow:0 8px 32px rgba(0,0,0,0.6);">' +
    '<p style="color:#eef;font-size:15px;margin:0 0 4px 0;">删除连线</p>' +
    '<p style="color:#5a7a8a;font-size:12px;margin:0 0 16px 0;">' + srcName + ' ↔ ' + tgtName + ' 之间有 ' + edges.length + ' 条连线</p>' +
    '<div style="max-height:220px;overflow-y:auto;">' + listHtml + '</div>' +
    '<div style="display:flex;justify-content:flex-end;gap:12px;margin-top:16px;">' +
    '<button id="connDelCancelBtn" style="background:#2a3a4a;color:#eef;border:none;padding:8px 20px;border-radius:20px;cursor:pointer;font-size:14px;">取消</button>' +
    '<button id="connDelOkBtn" style="background:#6a2c2c;color:#fff;border:none;padding:8px 20px;border-radius:20px;cursor:pointer;font-size:14px;">删除选中</button>' +
    '</div></div>';

  document.body.appendChild(overlay);
  overlay.setAttribute('tabindex', '0');
  overlay.focus();

  let remove = function () {
    if (overlay && overlay.parentNode) overlay.remove();
  };

  document.getElementById('connDelCancelBtn').addEventListener('click', remove);

  document.getElementById('connDelOkBtn').addEventListener('click', function () {
    let cbs = document.querySelectorAll('.conn-cb:checked');
    let indices = [];
    for (let j = 0; j < cbs.length; j++) {
      indices.push(parseInt(cbs[j].value));
    }
    remove();
    if (indices.length === 0) return;
    indices.sort(function (a, b) { return b - a; });
    withHistory(function () {
      for (let k = 0; k < indices.length; k++) {
        appState.crossEdges.splice(edges[indices[k]].index, 1);
      }
      rebuildAllLines();
      saveCurrentProjectData();
      computeConnectedHighlight();
      if (appState.is2DView && appState.refresh2DView) appState.refresh2DView();
    })();
  });

  overlay.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { e.stopPropagation(); remove(); }
  });
}

export function setAsSource() {
  let id = getPrimarySelectedId();
  if (id) {
    appState.sourceNodeId = id;
    updateSelectionUI();
  } else showToast("请先选中一个节点");
}

export function setAsTarget() {
  let id = getPrimarySelectedId();
  if (id) {
    appState.targetNodeId = id;
    updateSelectionUI();
  } else showToast("请先选中一个节点");
}

/**
 * 清空连线源节点
 */
export function clearSourceNode() {
  appState.sourceNodeId = null;
  updateSelectionUI();
}

/**
 * 清空连线目标节点
 */
export function clearTargetNode() {
  appState.targetNodeId = null;
  updateSelectionUI();
}

/**
 * 一键清空源和目标节点
 */
export function clearBothNodes() {
  appState.sourceNodeId = null;
  appState.targetNodeId = null;
  updateSelectionUI();
}
