// ============================================================
//  MoveMode / event-bindings / move-controls.js
//  移动模式控制栏（确认/取消）+ 选中节点大小/速度/颜色滑块
// ============================================================

import { appState } from '../../../module0_AppState.js';
import { saveCurrentProjectData } from '../../../TreeData/index.js';
import { rebuildAllLines } from '../../../VisualComponents/index.js';
import { boxSelectSegKeys } from '../../../2DView/shared.js';
import { setFishboneSegColorBatch } from '../../../Fishbone/ops.js';
import { exitMoveMode } from '../move-core.js';

export function bindMoveControls() {
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
      // 框选的鱼骨线段：批量改色（同一次选择器的实时预览）
      if (boxSelectSegKeys.size) setFishboneSegColorBatch(boxSelectSegKeys, color);
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
      // 框选的鱼骨线段：批量恢复默认彩虹色
      if (boxSelectSegKeys.size) setFishboneSegColorBatch(boxSelectSegKeys, null);
      if (nodeFixedColorPicker) nodeFixedColorPicker.value = '#ffffff';
      saveCurrentProjectData();
      rebuildAllLines();
      if (appState.refresh2DView) appState.refresh2DView();
      if (appState.refreshTreePanel) appState.refreshTreePanel();
    });
  }
}
