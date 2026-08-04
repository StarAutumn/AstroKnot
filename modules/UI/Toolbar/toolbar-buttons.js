// ============================================================
//  UI/Toolbar/toolbar-buttons.js — 工具栏按钮（缩放、保存/加载/导入、标签切换、新建项目）
// ============================================================
import { appState } from '../../module0_AppState.js';
import { saveAllProjects, loadNetworkFromFile, importMarkdownFile } from '../../module9_FileIO.js';
import { updateLinesVis } from '../../VisualComponents/index.js';
import { showPrompt } from '../../module4_Confirm.js';
import { createNewProject } from '../../module2_TreeData.js';
import { saveSettingsToStorage } from '../Theme.js';

export function bindSimpleToolbarButtons() {
  // 取消重置视角功能，改为隐藏按钮
  const resetViewBtn = document.getElementById('resetView');
  if (resetViewBtn) {
    resetViewBtn.style.display = 'none';
  }
  document.getElementById('zoomIn').onclick = () => {
    if (appState.is2DView && appState.zoom2D) {
      appState.zoom2D(1.1);
    } else {
      appState.camera.fov = Math.max(25, appState.camera.fov - 4);
      appState.camera.updateProjectionMatrix();
    }
  };
  document.getElementById('zoomOut').onclick = () => {
    if (appState.is2DView && appState.zoom2D) {
      appState.zoom2D(0.9);
    } else {
      appState.camera.fov = Math.min(70, appState.camera.fov + 4);
      appState.camera.updateProjectionMatrix();
    }
  };
  document.getElementById('saveNetworkBtn').onclick = saveAllProjects;
  document.getElementById('loadNetworkBtn').onclick = loadNetworkFromFile;
  document.getElementById('importMarkdownBtn').onclick = importMarkdownFile;
  const toggleLabelsBtn = document.getElementById('toggleLabelsBtn');
  if (toggleLabelsBtn) {
    toggleLabelsBtn.onclick = () => {
      appState.showAllLabels = !appState.showAllLabels;
      toggleLabelsBtn.style.opacity = appState.showAllLabels ? '1' : '0.4';
      toggleLabelsBtn.title = appState.showAllLabels ? '隐藏连线标签' : '显示连线标签';
      saveSettingsToStorage();
      updateLinesVis();  // 刷新 3D 连线标签可见性
      if (appState.is2DView && appState.refresh2DView) appState.refresh2DView();
      if (appState.refreshTreePanel) appState.refreshTreePanel();
    };
  }
  document.getElementById('newProjectBtn').onclick = () => {
    showPrompt("\u8BF7\u8F93\u5165\u65B0\u9879\u76EE\u540D\u79F0", "\u65B0\u77E5\u8BC6\u7F51\u7EDC", (name) => {
      if (name) createNewProject(name);
    });
  };
}
