// ============================================================
//  模块0：全局状态管理器 (AppState)
//  目标：封装所有共享数据和方法，消除全局变量
// ============================================================
import * as THREE from 'three';

class AppState {
  constructor() {
    // ---------- 数据结构 ----------
    this.methodsTree = null;
    this.crossEdges = [];
    this.nodeMap = new Map();
    this.positions = new Map();
    this.selectedNodeIds = new Set();
    this.lastSelectedNodeId = null;
    this.sourceNodeId = null;
    this.targetNodeId = null;
    this.connectionMode = null;
    this.connectionSourceId = null;
    this.clipboard = [];
    this.projects = [];
    this.currentProjectId = null;
    this.currentProjectSavePath = null;
    this.quickNoteSavePath = null;
    // 应急备份间隔（分钟），0=关闭，默认 2 分钟
    this.emergencyBackupInterval = 2;
    

    // ---------- THREE 核心组件 ----------
    this.scene = null;
    this.camera = null;
    this.controls = null;
    this.renderer = null;
    this.labelRenderer = null;
    this.effectComposer = null;
    this.bloomPass = null;
    this.backGlow = null;

    // ---------- 纹理/资源 ----------
    this.glowTex = null;
    this.panoramaTexture = null;

    // ---------- 背景效果 ----------
    this.starGroups = [];
    this.nebulaFlowGroups = [];
    this.flowField = null;
    this.nodeGlowEnabled = true;
    this.nodeGlowOpacity = 1.0;
    this.surfaceGlowOpacity = 1.0;
    this.ringGlowOpacity = 1.0;
    this.ringRotationSpeed = 1.0;
    this.lineGlowOpacity = 1.0;
    this.skyBrightness = 1.0;
    this.skySaturation = 1.0;
    this.simple3D = true;            // 默认启动为 3D 极简模式
    this.particleVisible = true;
    this.meteorVisible = true;
    this.ringVisible = true;
    this.showAllLabels = true;
    this.treeEdgeLabels = new Map();  // key: "startId->endId" → { label, labelHidden }, 树连线标签后备存储
    this.skyRotationSpeed = 1.0;
    this.startupMode = '3d_simple';  // 默认启动模式：3D 极简
    this.startPageBackground = 'ribbon';  // 'ribbon' | 'spaceship'
    this.simpleBgColor = '#000000';
    this.bgColor2D = '#01010c';
    this.gridColor2D = '#1a2a34';

    // ── 编辑器设置 ──
    this.editorFontSize = 14;
    this.editorLightMode = false;
    this.editorPageView = false;

    // ── 渲染性能 ──
    this.bloomStrength = 0.2;
    this.particleDensity = 'high';   // 'low' | 'medium' | 'high'
    this.cameraFOV = 40;
    this.pixelRatioCap = 1.5;

    // ── 2D 视图几何 ──
    this.nodeWidth2D = 120;
    this.nodeHeight2D = 40;
    this.hGap2D = 60;
    this.vGap2D = 20;
    this.gridSize2D = 40;

    // 过渡动画状态
    this.transitionProgress = 1;
    this.transitionTarget = 1;
    this.transitionDuration = 1.5;
    this.transitionActive = false;
    this._originalBloomStrength = 0.2;

    // ---------- 节点与线段 ----------
    this.nodeMeshes = new Map();
    this.lineItems = [];
    this.NODE_RADIUS = 0.22;

    // ---------- UI 元素 ----------
    this.contextTargetId = null;
    this.quickNotes = [];
    this.currentQuickNoteId = null;
    this.currentEditNodeId = null;
    this.editorOpen = false;
    this.VIRTUAL_ROOT_ID = "__VIRTUAL_ROOT__";
    this.editorType = 'tinymce';

    // ---------- 相机动画 ----------
    this.cameraAnimTarget = null;
    this.cameraAnimDuration = 0.8;
    this.cameraAnimProgress = 0;
    this.cameraAnimActive = false;
    this.cameraAnimStartPos = new THREE.Vector3();
    this.cameraAnimStartTarget = new THREE.Vector3();

    // ---------- 3D 排列动画 ----------
    this.arrangeAnimActive = false;
    this.arrangeAnimPhase = 'idle';        // 'idle' | 'fadeOut' | 'move' | 'fadeIn'
    this.arrangeAnimProgress = 0;
    this.arrangeAnimFadeOutDuration = 0.4;
    this.arrangeAnimMoveDuration = 0.6;
    this.arrangeAnimFadeInDuration = 0.4;
    this._arrangeStartPositions = null;     // Map<id, Vector3>
    this._arrangeTargetPositions = null;    // Map<id, Vector3>
    this._arrangeDeferredEffects = null;    // 延迟添加的视觉效果（图层高亮矩形等）
    this._arrangeAnimLineControl = false;   // true 时渲染循环跳过连线 opacity 赋值

    // ---------- 2D 排列动画 ----------
    this.arrangeAnim2DActive = false;
    this.arrangeAnim2DPhase = 'idle';       // 'idle' | 'fadeOut' | 'move' | 'fadeIn'
    this.arrangeAnim2DProgress = 0;
    this.arrangeAnim2DFadeOutDuration = 0.3;
    this.arrangeAnim2DMoveDuration = 0.5;
    this.arrangeAnim2DFadeInDuration = 0.3;
    this._arrange2DStartPositions = null;    // Map<id, {x, y}>
    this._arrange2DTargetPositions = null;   // Map<id, {x, y}>
    this._arrange2DLineAlpha = 1;            // 连线全局 alpha（动画帧计算）
    this._arrange2DEased = 0;                // move 阶段 eased progress（动画帧计算，draw 复用）

    // ---------- 2D 视图（全屏） ----------
    this.positions2D = new Map();
    this.collapsed2D = new Set();
    this.toggle2DCollapse = null;

    // ---------- 图层管理 ----------
    this.layers = [];
    this.currentLayerId = null;
    this.layer3DLayout = false;
    this.layer3DSpacing = 4;
  }

  rebuildNodeMapFromTree() {
    this.nodeMap.clear();
    const traverse = (n) => {
      if (n.id !== this.VIRTUAL_ROOT_ID) {
        if (n.sizeScale === undefined) n.sizeScale = 1.0;
        if (n.ringSpeedFactor === undefined) n.ringSpeedFactor = 1.0;
        if (n.fixedColor === undefined) n.fixedColor = null;
        if (n.activeMode === undefined) n.activeMode = null; // null=自动推断, 'text'=文本, 'code'=代码
        this.nodeMap.set(n.id, n);
      }
      if (n.children) n.children.forEach(traverse);
    };
    traverse(this.methodsTree);
  }

  getCurrentLayer() {
    return this.layers.find(l => l.id === this.currentLayerId) || null;
  }

  createLayer(name) {
    const id = 'layer_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    const order = this.layers.length;
    const layer = { id, name, order, nodeIds: new Set(), positions2D: new Map() };
    this.layers.push(layer);
    return layer;
  }

  deleteLayer(layerId) {
    if (this.layers.length <= 1) return;
    const idx = this.layers.findIndex(l => l.id === layerId);
    if (idx === -1) return;
    const deletedLayer = this.layers[idx];
    const targetLayer = this.layers.find(l => l.id !== layerId);
    if (targetLayer && deletedLayer.nodeIds) {
      for (const nodeId of deletedLayer.nodeIds) {
        targetLayer.nodeIds.add(nodeId);
        if (deletedLayer.positions2D.has(nodeId)) {
          targetLayer.positions2D.set(nodeId, deletedLayer.positions2D.get(nodeId));
        }
      }
    }
    this.layers.splice(idx, 1);
    if (this.currentLayerId === layerId) {
      this.switchLayer(this.layers[0].id);
    }
  }

  switchLayer(layerId) {
    const curLayer = this.getCurrentLayer();
    if (curLayer) {
      curLayer.positions2D = new Map(this.positions2D);
    }
    this.currentLayerId = layerId;
    const newLayer = this.getCurrentLayer();
    if (newLayer) {
      this.positions2D = newLayer.positions2D || new Map();
    }
    this._normalizeLayerOrders();
  }

  initDefaultLayer() {
    if (this.layers.length > 0) return;
    const layer = this.createLayer('默认图层');
    if (this.nodeMap) {
      for (const nodeId of this.nodeMap.keys()) {
        layer.nodeIds.add(nodeId);
      }
    }
    this.currentLayerId = layer.id;
    layer.positions2D = this.positions2D;
  }

  getLayerForNode(nodeId) {
    for (const layer of this.layers) {
      if (layer.nodeIds && layer.nodeIds.has(nodeId)) return layer;
    }
    return null;
  }

  addNodeToCurrentLayer(nodeId) {
    const layer = this.getCurrentLayer();
    if (layer) {
      if (!layer.nodeIds) layer.nodeIds = new Set();
      layer.nodeIds.add(nodeId);
    }
  }

  removeNodeFromLayer(nodeId) {
    for (const layer of this.layers) {
      if (layer.nodeIds) layer.nodeIds.delete(nodeId);
      if (layer.positions2D) layer.positions2D.delete(nodeId);
    }
  }

  _normalizeLayerOrders() {
    const sorted = [...this.layers].sort((a, b) => a.order - b.order);
    sorted.forEach((layer, i) => { layer.order = i; });
  }

  clearSelected() {
    this.selectedNodeIds.clear();
    this.lastSelectedNodeId = null;
    if (this.updateSelectionUI) this.updateSelectionUI();
    if (this.hideContextMenu) this.hideContextMenu();
  }

  getPrimarySelectedId() {
    if (this.lastSelectedNodeId && this.selectedNodeIds.has(this.lastSelectedNodeId))
      return this.lastSelectedNodeId;
    if (this.selectedNodeIds.size > 0) return Array.from(this.selectedNodeIds)[0];
    return null;
  }

  saveCurrentProjectData() {
    if (!this.currentProjectId) return;
    const proj = this.projects.find(p => p.id === this.currentProjectId);
    if (!proj) return;
    const nr = {};
    for (const [id, node] of this.nodeMap.entries()) {
      if (node.richContent) nr[id] = node.richContent;
    }
    const no = {};
    for (const [id, node] of this.nodeMap.entries()) {
      if (node.overlayImages && node.overlayImages.length > 0) no[id] = node.overlayImages;
    }
    const po = new Map();
    for (const [id, v] of this.positions.entries()) po.set(id, v.clone());
    const p2d = new Map();
    for (const [id, v] of this.positions2D.entries()) p2d.set(id, { x: v.x, y: v.y });
    const collapsed = Array.from(this.collapsed2D);
    const layersData = this.layers.map(l => ({
      id: l.id,
      name: l.name,
      order: l.order,
      nodeIds: Array.from(l.nodeIds || []),
      positions2D: Object.fromEntries(
        [...(l.positions2D || [])].map(([k, v]) => [k, { x: v.x, y: v.y }])
      )
    }));
    const cameraView = {
      position: { x: this.camera?.position?.x || 0, y: this.camera?.position?.y || 4.5, z: this.camera?.position?.z || 8 },
      target: { x: this.controls?.target?.x || 0, y: this.controls?.target?.y || 0.2, z: this.controls?.target?.z || 0 }
    };
    proj.data = {
      methodsTree: JSON.parse(JSON.stringify(this.methodsTree)),
      crossEdges: JSON.parse(JSON.stringify(this.crossEdges)),
      positions: po,
      positions2D: p2d,
      collapsed2D: collapsed,
      layers: layersData,
      currentLayerId: this.currentLayerId,
      nodeRichContents: nr,
      nodeOverlayImages: no,
      cameraView: cameraView,
    };
  }

  loadProject(projectId, buildSceneCallback) {
    if (this.currentProjectId === projectId) return;
    if (this.currentProjectId) this.saveCurrentProjectData();
    const proj = this.projects.find(p => p.id === projectId);
    if (!proj) return;
    const data = proj.data;
    this.methodsTree = JSON.parse(JSON.stringify(data.methodsTree));
    this.crossEdges = JSON.parse(JSON.stringify(data.crossEdges));
    this.rebuildNodeMapFromTree();
    this.positions.clear();
    for (const [k, v] of data.positions.entries()) this.positions.set(k, v.clone());
    this.positions2D.clear();
    if (data.positions2D) {
      for (const [k, v] of data.positions2D.entries()) this.positions2D.set(k, v);
    }
    this.collapsed2D = new Set(data.collapsed2D || []);
    if (data.layers && data.layers.length > 0) {
      this.layers = data.layers.map(l => ({
        ...l,
        nodeIds: new Set(l.nodeIds || []),
        positions2D: new Map(Object.entries(l.positions2D || {}).map(([k, v]) => [k, v]))
      }));
    }
    this.currentLayerId = data.currentLayerId || (this.layers[0]?.id || null);
    const curL = this.getCurrentLayer();
    if (curL) this.positions2D = curL.positions2D;
    for (const [id, cont] of Object.entries(data.nodeRichContents || {})) {
      if (this.nodeMap.has(id)) this.nodeMap.get(id).richContent = cont;
    }
    for (const [id, oi] of Object.entries(data.nodeOverlayImages || {})) {
      if (this.nodeMap.has(id)) this.nodeMap.get(id).overlayImages = oi;
    }
    this.clearSelected();
    if (buildSceneCallback) buildSceneCallback();
    const cv = data.cameraView || { position: { x: 0, y: 4.5, z: 8 }, target: { x: 0, y: 0.2, z: 0 } };
    this.camera.position.set(cv.position.x, cv.position.y, cv.position.z);
    this.controls.target.set(cv.target.x, cv.target.y, cv.target.z);
    this.controls.enableDamping = false;
    this.controls.update();
    this.controls.enableDamping = true;
    this.currentProjectId = projectId;
  }
}

const appState = new AppState();

export function makePanelDraggable(panel, handle) {
  let isDragging = false;
  let startX, startY;
  let initialLeft, initialTop;

  handle.addEventListener('mousedown', (e) => {
    if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' ||
      e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
    e.preventDefault();
    const rect = panel.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;
    startX = e.clientX;
    startY = e.clientY;
    isDragging = true;
    panel.style.position = 'fixed';
    panel.style.left = initialLeft + 'px';
    panel.style.top = initialTop + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    panel.style.transform = 'none';
    panel.style.margin = '0';
    panel.style.transition = 'none';
    document.body.style.userSelect = 'none';
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    e.preventDefault();
    let newLeft = initialLeft + (e.clientX - startX);
    let newTop = initialTop + (e.clientY - startY);
    const panelWidth = panel.offsetWidth;
    const panelHeight = panel.offsetHeight;
    newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - panelWidth));
    newTop = Math.max(0, Math.min(newTop, window.innerHeight - panelHeight));
    panel.style.left = newLeft + 'px';
    panel.style.top = newTop + 'px';
  });

  window.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      document.body.style.userSelect = '';
      panel.style.transition = '';
    }
  });
}

window.appState = appState;
export { appState };