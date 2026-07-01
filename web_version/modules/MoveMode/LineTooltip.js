// ============================================================
//  连线信息提示框
// ============================================================
import * as THREE from 'three';
import { appState } from '../module0_AppState.js';
import { rebuildAllLines } from '../VisualComponents/index.js';
import { saveCurrentProjectData } from '../module2_TreeData.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

// 连线信息提示框（全局单例）
const lineTooltip = document.createElement('div');
lineTooltip.id = 'lineTooltip';
lineTooltip.style.cssText = `
  position: fixed; background: rgba(10,25,40,0.94); backdrop-filter: blur(10px);
  border: 1px solid rgba(0,255,255,0.6); border-radius: 16px; padding: 10px 16px;
  color: #eef; font-size: 13px; font-family: system-ui, sans-serif; z-index: 600;
  display: none; max-width: 300px; box-shadow: 0 8px 24px rgba(0,0,0,0.6);
  pointer-events: auto;
`;
document.body.appendChild(lineTooltip);

// ─── 辅助：通过 userData 查找对应的 crossEdge ───
function _getCrossEdge(userData) {
  if (userData._crossEdgeRef) return userData._crossEdgeRef;
  return appState.crossEdges.find(e =>
    (e.source === userData.startId && e.target === userData.endId) ||
    (e.source === userData.endId && e.target === userData.startId)
  );
}

// ─── 辅助：通过 userData 查找 lineItem（引用对比 + ID 回退） ───
function _getLineItem(userData) {
  let item = appState.lineItems.find(it => it.line.mesh.userData === userData);
  if (item) return item;
  return appState.lineItems.find(it => {
    const ud = it.line.mesh.userData;
    return ud.edgeType === userData.edgeType &&
      ((ud.startId === userData.startId && ud.endId === userData.endId) ||
       (ud.startId === userData.endId && ud.endId === userData.startId));
  });
}

function showLineTooltip(x, y, userData, zIndexOverride) {
  const { edgeType, parentId, startId, endId, label } = userData;
  const startNode = appState.nodeMap.get(startId);
  const endNode = appState.nodeMap.get(endId);
  const startName = startNode ? startNode.name : startId;
  const endName = endNode ? endNode.name : endId;
  let infoText = '';
  if (edgeType === 'tree') {
    infoText = `父节点：${startName}<br>子节点：${endName}`;
  } else {
    infoText = `源节点：${startName}<br>目标节点：${endName}`;
  }
  const currentLabel = label || '点击添加标签';

  lineTooltip.innerHTML = `
    <div style="font-size:16px; font-weight:bold; margin-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.2); padding-bottom:4px; display:flex; align-items:center; gap:6px;">
      🏷️ <span class="tooltip-label-text" contenteditable="true" spellcheck="false"
        style="outline:none; min-width:60px; display:inline-block; background:rgba(255,255,255,0.1); border-radius:4px; padding:2px 6px;">${currentLabel}</span>
    </div>
    <div style="font-size:12px;">${infoText}</div>
    <div style="margin-top:8px; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
      <label style="font-size:12px;">🎨 连线颜色</label>
      <input type="color" id="lineColorPicker" value="${userData.customColor || '#ffffff'}" style="width:36px; height:28px; padding:0; border:none; border-radius:6px; cursor:pointer;">
      <button id="lineColorReset" style="font-size:11px; padding:2px 8px; background:#2c4a5a; border:none; color:white; border-radius:12px; cursor:pointer;">默认</button>
    </div>
    <div style="margin-top:8px; text-align:center;">
      <button class="tooltip-save-label" title="保存标签"
        style="display:inline-flex; align-items:center; gap:4px; background:#2c6e7e; border:none; color:white; padding:4px 18px; border-radius:14px; cursor:pointer; font-size:13px;">
        <span>💾</span> <span>保存</span>
      </button>
    </div>
    <div id="lineTooltipDeleteSection" style="${userData.edgeType === 'cross' ? '' : 'display:none;'}margin-top:10px; border-top:1px solid rgba(255,100,100,0.15); padding-top:8px;">
      <button id="deleteLineBtn"
        style="width:100%; display:flex; align-items:center; justify-content:center; gap:4px; background:#3a1515; border:1px solid #6a2a2a; color:#ff6666; padding:4px 10px; border-radius:12px; cursor:pointer; font-size:12px;">
        🗑️ 删除此连线
      </button>
    </div>
  `;

  const labelSpan = lineTooltip.querySelector('.tooltip-label-text');
  const saveBtn = lineTooltip.querySelector('.tooltip-save-label');

  function ensureLabelObj(lineItem) {
    if (!lineItem.line.labelObj) {
      const div = document.createElement('div');
      div.textContent = '';
      div.className = 'line-label';
      div.style.cssText = 'color:#000000;font-size:12px;background:#ffffff;backdrop-filter:blur(6px);padding:2px 10px;border-radius:40px;border:1px solid #cccccc;white-space:nowrap;pointer-events:none;';
      const obj = new CSS2DObject(div);
      // PolylineFlowLine 用 points 数组，SpiralFlowLine 用 start/end
      let mid;
      if (lineItem.line.points && lineItem.line.points.length >= 2) {
        // 折线：取路径中点
        if (lineItem.line.curve) {
          mid = lineItem.line.curve.getPointAt(0.5);
        } else {
          const pts = lineItem.line.points;
          const lastIdx = pts.length - 2;
          mid = new THREE.Vector3().addVectors(pts[lastIdx], pts[lastIdx + 1]).multiplyScalar(0.5);
        }
      } else if (lineItem.line.start && lineItem.line.end) {
        mid = new THREE.Vector3().addVectors(lineItem.line.start, lineItem.line.end).multiplyScalar(0.5);
      } else {
        mid = new THREE.Vector3();
      }
      obj.position.copy(mid);
      obj.visible = false;
      appState.scene.add(obj);
      lineItem.line.labelObj = obj;
    }
    return lineItem.line.labelObj;
  }

  function saveLabelData() {
    const newContent = labelSpan.innerText.trim();
    const finalLabel = (newContent === '' || newContent === '点击添加标签') ? '' : newContent;
    userData.label = finalLabel;
    // 统一由缩放面板的全局开关控制显示/隐藏，此处始终设为显示
    userData.labelHidden = false;
    const lineItem = _getLineItem(userData);
    if (lineItem) {
      lineItem.line.mesh.userData.label = finalLabel;
      lineItem.line.mesh.userData.labelHidden = false;
    }
    // 树连线：同步写入后备持久化存储（避免 2D 视图 lineItem 为 null 时丢失）
    if (userData.edgeType === 'tree' && userData.startId && userData.endId) {
      const treeKey = `${userData.startId}->${userData.endId}`;
      appState.treeEdgeLabels.set(treeKey, { label: finalLabel, labelHidden: false });
    }
    if (userData.edgeType === 'cross') {
      const edge = _getCrossEdge(userData);
      if (edge) { edge.label = finalLabel; edge.labelHidden = false; }
    }
    if (lineItem) {
      const labelObj = ensureLabelObj(lineItem);
      labelObj.element.textContent = finalLabel || ' ';
      labelObj.visible = lineItem.line.mesh.visible && appState.showAllLabels;
    }
    saveCurrentProjectData();
    if (appState.is2DView && appState.refresh2DView) appState.refresh2DView();
    if (appState.refreshTreePanel) appState.refreshTreePanel();
  }

  labelSpan.addEventListener('focus', () => {
    if (labelSpan.innerText.trim() === '点击添加标签') labelSpan.innerText = '';
  });
  labelSpan.addEventListener('click', (e) => {
    e.stopPropagation();
    if (labelSpan.innerText.trim() === '点击添加标签') {
      setTimeout(() => {
        const range = document.createRange();
        range.selectNodeContents(labelSpan);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }, 10);
    }
  });

  saveBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    saveLabelData();
  });

  [labelSpan, saveBtn].forEach(el => {
    el.addEventListener('mousedown', (e) => e.stopPropagation());
  });
  const colorPicker = lineTooltip.querySelector('#lineColorPicker');
  const resetBtn = lineTooltip.querySelector('#lineColorReset');

  function applyLineColor(hexColor) {
    const lineItem = _getLineItem(userData);
    const key = `${userData.startId}->${userData.endId}`;
    // 独立持久化 Map，不依赖 3D lineItem 是否存在
    if (!appState.treeEdgeCustomColors) appState.treeEdgeCustomColors = new Map();
    
    if (hexColor) {
      if (lineItem) {
        lineItem.line.setCustomColor(new THREE.Color(hexColor));
      }
      userData.customColor = hexColor;
      appState.treeEdgeCustomColors.set(key, hexColor);
      if (userData.edgeType === 'cross') {
        const edge = _getCrossEdge(userData);
        if (edge) edge.customColor = hexColor;
      }
    } else {
      if (lineItem) {
        lineItem.line.setCustomColor(null);
      }
      userData.customColor = null;
      appState.treeEdgeCustomColors.delete(key);
      if (userData.edgeType === 'cross') {
        const edge = _getCrossEdge(userData);
        if (edge) edge.customColor = null;
      }
      rebuildAllLines();
    }
    saveCurrentProjectData();
    if (appState.refresh2DView) appState.refresh2DView();
    if (appState.refreshTreePanel) appState.refreshTreePanel();
  }

  colorPicker.addEventListener('input', (e) => applyLineColor(e.target.value));
  resetBtn.addEventListener('click', () => {
    applyLineColor(null);
    colorPicker.value = '#ffffff';
  });

  [colorPicker, resetBtn].forEach(el => el.addEventListener('mousedown', e => e.stopPropagation()));

  // ── 删除按钮（直接删除，不弹提示框）──
  const deleteBtn = lineTooltip.querySelector('#deleteLineBtn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (userData.edgeType !== 'cross') return;
      const edge = _getCrossEdge(userData);
      if (!edge) return;
      const idx = appState.crossEdges.indexOf(edge);
      if (idx >= 0) appState.crossEdges.splice(idx, 1);
      hideLineTooltip();
      saveCurrentProjectData();
      rebuildAllLines();  // 同步重建 3D 连线，确保删除后场景中的连线 mesh 也被销毁
      if (appState.refresh2DView) appState.refresh2DView();
      if (appState.refreshTreePanel) appState.refreshTreePanel();
    });
    deleteBtn.addEventListener('mousedown', e => e.stopPropagation());
  }

  lineTooltip.style.left = Math.min(x, window.innerWidth - 320) + 'px';
  lineTooltip.style.top = Math.min(y, window.innerHeight - 160) + 'px';
  lineTooltip.style.zIndex = zIndexOverride || '600';
  lineTooltip.style.display = 'block';
}

function hideLineTooltip() {
  lineTooltip.style.display = 'none';
}

export { showLineTooltip, hideLineTooltip };