// ============================================================
//   AstroKnot.js — 纯 3D 知识图谱编辑器（入口文件）
//   功能：导入所有模块，初始化场景、UI 组件，启动应用
// ============================================================

// ---------- 第三方库 ----------
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// ---------- 模块0：全局状态 ----------
import { appState } from './modules/module0_AppState.js';

// ---------- 模块1：纹理 ----------
import { createIrregularGlowTexture } from './modules/module1_Textures.js';

// ---------- 模块2：数据结构&项目管理 ----------
import { initProjects } from './modules/module2_TreeData.js';
// ---------- 模块3：历史记录 ----------
import './modules/module3_History.js';
import { applyHistoryState } from './modules/module3_History.js';

// ---------- 模块4：确认弹窗 ----------
import './modules/module4_Confirm.js';

// ---------- 模块5：节点编辑操作 ----------
import {
  clearSelected, setSelectedNode, getPrimarySelectedId, updateSelectionUI,
  deleteSelectedNodes, addNode, renamePrimaryNode, addConnection, removeConnection,
  setAsSource, setAsTarget, toggleChildren
} from './modules/module5_SelectAndEdit.js';

// ---------- 模块6：3D组件 ----------
import {
  buildSceneFromTree, rebuildAllLines, updateLinesVis, updateNodeVisuals,
  createNodeMesh, destroyNodeMesh, generateRandomPosition
} from './modules/VisualComponents/index.js';

// ---------- 模块7：场景初始化 ----------
import { initScene } from './modules/module7_SceneInit.js';
initScene();

// ---------- 模块8：右键菜单 ----------
import { bindContextMenuEvents } from './modules/module8_ContextMenu.js';

// ---------- 模块9：文件IO ----------
import { saveNetworkToFile, loadNetworkFromFile } from './modules/module9_FileIO.js';

// ---------- 应急备份（崩溃兑底 + 启动恢复）----------
import { initEmergencyBackup } from './modules/emergencyBackup.js';
import { initVersionAutoSave } from './modules/versionGraph/versionAutoSave.js';
import { initVersionAtmosphere } from './modules/versionGraph/versionAtmosphere.js';
import { initNodeDiskSync } from './modules/nodeDiskSync.js';

// ---------- 模块10：富文本编辑器 ----------
import { initRichEditor } from './modules/richEditor/index.js';
import './modules/AppLibrary/ide/index.js';

// ---------- 模块11：快速笔记 ----------
import { initQuickNotes } from './modules/module11_QuickNotes.js';

// ---------- 模块12：UI事件绑定 ----------
import {
  bindUndoRedo, bindMinimizePanel, bindHelpModal, bindFullscreenAndTab,
  bindToolbarButtons, bindResize, bindSearch,
  bindKeyboardMovement, bindGlobalSearch, initUITheme, initAIFloatingDialog, initTaskbarClock, bindZoomToggle
} from './modules/UI/index.js';

// ---------- 任务栏（多进程管理） ----------
import './modules/taskbar.js';

// ---------- 模块13：移动模式 ----------
import { initMoveMode } from './modules/MoveMode/index.js';

// ---------- 模块14：动画循环 ----------
import { animate } from './modules/module14_Animation.js';

// ---------- 模块15：AI 对话框 ----------
import { initAIChat } from './modules/AIChat/index.js';

// ---------- 模块16：2D 思维导图视图 ----------
import { init2DView, toggle2DView } from './modules/2DView/index.js';

// ---------- 图层管理模块 ----------
import { initLayerManager } from './modules/LayerManager/index.js';

// ---------- 快捷启动 Dock ----------
import { initDock } from './modules/UI/Dock.js';

// ---------- 窗口管理系统 ----------
import './modules/UI/window-manager.js';

// ---------- 新手引导 ----------
import { initGuide, startGuideIfNeeded } from './modules/Guide/index.js';

// ---------- 数据目录首次设置 ----------
import { startDataSetup } from './modules/DataSetup/index.js';

// ---------- 开始首页 ----------
import { showStartPage, hideStartPage } from './modules/StartPage/index.js';



// ============================================================
//  启动应用
// ============================================================
initRichEditor();
initQuickNotes();
initAIChat(); 
bindContextMenuEvents();
initMoveMode();

// 初始化项目并决定是否显示开始首页
const hasProjects = initProjects();

// ---------- 应急备份初始化 ----------
initEmergencyBackup();
initVersionAutoSave();
initVersionAtmosphere();
initNodeDiskSync();

init2DView();
initLayerManager();
bindUndoRedo();
bindMinimizePanel();
bindHelpModal();
bindFullscreenAndTab();
initUITheme();
bindToolbarButtons();
bindResize();
bindSearch();
bindGlobalSearch();
bindKeyboardMovement();

// ---------- 显示开始首页（移到 bindToolbarButtons 之后，确保 __glowPopup 已初始化） ----------
if (!hasProjects) {
  showStartPage();
}

// ---------- 快捷启动 Dock ----------
initDock();

// ---------- 停靠面板 ----------
initAIFloatingDialog();
initTaskbarClock();
bindZoomToggle();

// ---------- 新手引导 ----------
initGuide();

// ---------- 热更新 + 压力测试（仅开发模式；打包后模块不存在则静默跳过）----------
(async function loadDevModules() {
  let initHotUpdate, registerHMRState;

  // ── 热更新 ──
  try {
    ({ initHotUpdate, registerHMRState } = await import('./modules/hot-update.js'));
  } catch { return; }  // 打包环境：模块不存在，静默退出

  // ── 项目核心数据：热更新跨重载保留所有节点/连线/位置/图层等 ──
  registerHMRState('projectData',
  // Save：序列化所有用户数据到 sessionStorage
  () => {
    appState.saveCurrentProjectData();
    const toVecData = (map) => [...map].map(([k, v]) => [k, { x: v.x, y: v.y, z: v.z }]);
    const toPos2DData = (map) => [...map].map(([k, v]) => [k, { x: v.x, y: v.y }]);
    const nr = {}; const no = {};
    for (const [id, node] of appState.nodeMap) {
      if (node.richContent) nr[id] = node.richContent;
      if (node.overlayImages?.length) no[id] = node.overlayImages;
    }
    return {
      methodsTree: JSON.stringify(appState.methodsTree),
      crossEdges: JSON.stringify(appState.crossEdges),
      positions: toVecData(appState.positions),
      positions2D: toPos2DData(appState.positions2D),
      collapsed2D: [...appState.collapsed2D],
      selectedNodeIds: [...appState.selectedNodeIds],
      layers: appState.layers.map(l => ({
        id: l.id, name: l.name, order: l.order,
        nodeIds: [...(l.nodeIds || [])],
        positions2D: Object.fromEntries([...(l.positions2D || new Map())].map(([k, v]) => [k, { x: v.x, y: v.y }]))
      })),
      currentLayerId: appState.currentLayerId,
      currentProjectId: appState.currentProjectId,
      is2DView: appState.is2DView,
      nodeRichContents: nr,
      nodeOverlayImages: no,
      cameraView: {
        position: { x: appState.camera?.position?.x ?? 0, y: appState.camera?.position?.y ?? 4.5, z: appState.camera?.position?.z ?? 8 },
        target: { x: appState.controls?.target?.x ?? 0, y: appState.controls?.target?.y ?? 0.2, z: appState.controls?.target?.z ?? 0 }
      },
    };
  },
  // Restore：页面重载后重建完整场景
  async (val) => {
    if (!val?.methodsTree) return;

    // 1. 恢复核心数据结构
    appState.methodsTree = JSON.parse(val.methodsTree);
    appState.crossEdges = JSON.parse(val.crossEdges);
    appState.rebuildNodeMapFromTree();

    // 2. 恢复 3D / 2D 位置
    appState.positions.clear();
    for (const [k, v] of val.positions) {
      appState.positions.set(k, new THREE.Vector3(v.x, v.y, v.z));
    }
    appState.positions2D.clear();
    for (const [k, v] of val.positions2D) {
      appState.positions2D.set(k, { x: v.x, y: v.y });
    }

    // 3. 恢复折叠状态、图层、当前项目
    appState.collapsed2D = new Set(val.collapsed2D || []);
    if (val.layers?.length) {
      appState.layers = val.layers.map(l => ({
        ...l, nodeIds: new Set(l.nodeIds || []),
        positions2D: new Map(Object.entries(l.positions2D || {}))
      }));
    }
    appState.currentLayerId = val.currentLayerId || appState.layers[0]?.id;
    appState.currentProjectId = val.currentProjectId || appState.currentProjectId;

    // 4. 重建 3D 场景（先销毁旧网格，再从恢复的数据构建）
    buildSceneFromTree();

    // 5. 恢复富文本内容和贴图
    for (const [id, cont] of Object.entries(val.nodeRichContents || {})) {
      if (appState.nodeMap.has(id)) appState.nodeMap.get(id).richContent = cont;
    }
    for (const [id, oi] of Object.entries(val.nodeOverlayImages || {})) {
      if (appState.nodeMap.has(id)) appState.nodeMap.get(id).overlayImages = oi;
    }

    // 6. 恢复选中状态
    appState.selectedNodeIds = new Set(val.selectedNodeIds || []);
    if (val.selectedNodeIds?.length) {
      appState.lastSelectedNodeId = val.selectedNodeIds[val.selectedNodeIds.length - 1];
    }
    if (typeof updateSelectionUI === 'function') updateSelectionUI();

    // 7. 恢复相机视角
    const cv = val.cameraView;
    if (cv && appState.camera && appState.controls) {
      appState.camera.position.set(cv.position.x, cv.position.y, cv.position.z);
      appState.controls.target.set(cv.target.x, cv.target.y, cv.target.z);
      appState.controls.update();
    }

    // 8. 恢复 2D/3D 视图模式
    if (val.is2DView && !appState.is2DView && typeof toggle2DView === 'function') {
      toggle2DView();
    }

    // 9. 刷新节点外观
    if (typeof updateNodeVisuals === 'function') updateNodeVisuals();

    console.log('[HMR] ✅ 场景数据已恢复（节点、连线、位置、视角均已保留）');
  }
);

registerHMRState('is2DView',
  () => appState.is2DView,
  (val) => { if (val && !appState.is2DView) toggle2DView?.(); }
);
registerHMRState('settings',
  () => ({
    nodeGlowOpacity: appState.nodeGlowOpacity,
    skyBrightness: appState.skyBrightness,
    skySaturation: appState.skySaturation,
    skyRotationSpeed: appState.skyRotationSpeed,
    surfaceGlowOpacity: appState.surfaceGlowOpacity,
    ringGlowOpacity: appState.ringGlowOpacity,
    ringRotationSpeed: appState.ringRotationSpeed,
    lineGlowOpacity: appState.lineGlowOpacity,
    particleVisible: appState.particleVisible,
    meteorVisible: appState.meteorVisible,
    ringVisible: appState.ringVisible,
    simple3D: appState.simple3D,
    startupMode: appState.startupMode,
    simpleBgColor: appState.simpleBgColor,
    bgColor2D: appState.bgColor2D,
    gridColor2D: appState.gridColor2D,
    showAllLabels: appState.showAllLabels,
  }),
  (val) => {
    if (!val) return;
    Object.assign(appState, val);
    // 应用简洁模式（在 restoreFullEffects 执行后触发）
    if (val.simple3D && typeof toggleSimple3DMode === 'function') {
      toggleSimple3DMode(true);
    }
  }
);
  initHotUpdate();

  // ── 压力测试 ──
  try { await import('./modules/StressTest.js'); } catch { /* 打包后模块不存在 */ }
})();

document.getElementById('modeToggleBtn').addEventListener('click', toggle2DView);

// ---------- 自定义标题栏交互 ----------
(function initTitleBar() {
  const api = window.api;
  if (!api) return;

  const tbMin = document.getElementById('tbMinBtn');
  const tbMax = document.getElementById('tbMaxBtn');
  const tbClose = document.getElementById('tbCloseBtn');

  // 按钮事件
  tbMin?.addEventListener('click', () => api.winMinimize());
  tbClose?.addEventListener('click', () => {
    if (typeof window.requestAppClose === 'function') {
      window.requestAppClose();
    } else {
      api.winClose(); // 兜底：确认函数尚未初始化时直接关闭
    }
  });
  tbMax?.addEventListener('click', () => api.winMaximize());

  // HMR 开关（仅开发版显示）
  if (api.isDev && api.hmrToggle && api.hmrGetEnabled) {
    api.isDev().then((isDev) => {
      if (!isDev) return;
      const hmrWrap = document.getElementById('hmrToggle');
      const hmrCheckbox = document.getElementById('hmrCheckbox');
      if (!hmrWrap || !hmrCheckbox) return;
      hmrWrap.style.display = 'flex';
      // 同步当前状态
      api.hmrGetEnabled().then((enabled) => {
        hmrCheckbox.checked = !!enabled;
      });
      hmrCheckbox.addEventListener('change', () => {
        api.hmrToggle(hmrCheckbox.checked);
      });
    });
  }

  // 监听最大化状态变化，切换按钮图标
  window.addEventListener('maximize-change', (e) => {
    window.__isMaximized = !!e.detail;
    if (tbMax) tbMax.textContent = e.detail ? '❐' : '☐';
  });

  // IPC 最大化变化通知
  api.onMaximizeChange?.((isMaximized) => {
    window.__isMaximized = !!isMaximized;
    if (tbMax) tbMax.textContent = isMaximized ? '❐' : '☐';
  });

  // 全屏时隐藏标题栏 + 调整模态框位置
  api.onFullscreenChange?.((isFullscreen) => {
    if (titleBar) titleBar.style.display = isFullscreen ? 'none' : 'flex';
    document.body.classList.toggle('is-fullscreen', isFullscreen);
    document.body.classList.toggle('is-not-fullscreen', !isFullscreen);
    // 派发自定义事件，供 Window.js 全屏按钮图标更新
    window.dispatchEvent(new CustomEvent('fullscreen-change', { detail: isFullscreen }));
  });

  // 双击标题栏最大化/还原
  document.getElementById('appTitleBar')?.addEventListener('dblclick', (e) => {
    if (e.target.tagName === 'BUTTON') return;
    api.winMaximize();
  });

  // 标题栏右键菜单
  const tbMenu = document.getElementById('titlebarContextMenu');
  const titleBar = document.getElementById('appTitleBar');

  titleBar?.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (!tbMenu) return;
    tbMenu.style.display = 'flex';
    tbMenu.style.left = e.clientX + 'px';
    tbMenu.style.top = e.clientY + 'px';

    // 更新最大化按钮文字
    const tcmMax = document.getElementById('tcmMaximize');
    if (tcmMax && window.__isMaximized !== undefined) {
      tcmMax.textContent = window.__isMaximized ? '还原' : '最大化';
    }
  });

  // 点击其他地方关闭菜单
  document.addEventListener('click', () => {
    if (tbMenu) tbMenu.style.display = 'none';
  });

  // 菜单项事件
  document.getElementById('tcmRestore')?.addEventListener('click', () => api.winUnmaximize());
  document.getElementById('tcmMinimize')?.addEventListener('click', () => api.winMinimize());
  document.getElementById('tcmMaximize')?.addEventListener('click', () => api.winMaximize());
  document.getElementById('tcmClose')?.addEventListener('click', () => api.winClose());
})();


animate();

// ── 数据目录首次设置：首次启动引导用户选择存储位置 ──
(async function initDataSetupAndGuide() {
  await startDataSetup();
  // 数据目录设置完成后，启动新手引导
  startGuideIfNeeded();
})();

// ── 启动闪屏：首帧渲染完成后渐变消失 ──
requestAnimationFrame(function () {
  requestAnimationFrame(function () {
    const splash = document.getElementById('appSplash');
    if (splash) {
      splash.classList.add('hidden');
      // 停止涟漪动画以释放资源
      if (window._splashRippleStop) window._splashRippleStop();
      setTimeout(function () { splash.remove(); }, 600);
    }
  });
});