// ============================================================
//  StressTest.js — 压力测试模块
//  用法：在浏览器控制台输入 stressTest.show() 打开面板
// ============================================================

import * as THREE from 'three';
import { appState } from './module0_AppState.js';
import { createNodeMesh, addSingleTreeLine } from './VisualComponents/index.js';

// ── 测试状态 ──
let testNodeIds = new Set();
let testRootId = null;
let panelEl = null;
let running = false;
let cancelFlag = false;

// ── FPS 测量 ──
let fpsStartTime = 0;
let fpsFrameCount = 0;
let fpsResult = 60;
let fpsRunning = false;

function _startFPS() {
  fpsStartTime = performance.now();
  fpsFrameCount = 0;
  fpsResult = 60;
  fpsRunning = true;
  _tickFPS();
}

function _tickFPS() {
  if (!fpsRunning) return;
  fpsFrameCount++;
  const elapsed = performance.now() - fpsStartTime;
  if (elapsed >= 1000) {
    fpsResult = Math.round(fpsFrameCount * 1000 / elapsed);
    fpsStartTime = performance.now();
    fpsFrameCount = 0;
    if (panelEl) {
      const el = panelEl.querySelector('#stFps');
      if (el) el.textContent = fpsResult + ' FPS';
    }
  }
  requestAnimationFrame(_tickFPS);
}

function _stopFPS() {
  fpsRunning = false;
}

// ── Draw Call 统计 ──
function _getDrawCalls() {
  return appState.renderer?.info?.render?.calls ?? 0;
}

function _getTriangleCount() {
  return appState.renderer?.info?.render?.triangles ?? 0;
}

// ── 节点/连线计数 ──
function _countNodes() {
  return appState.nodeMap.size;
}

function _countLines() {
  return appState.lineItems.length;
}

// ── 生成 ID ──
function _genId(prefix, idx) {
  return prefix + Date.now() + '_' + idx;
}

// ── 生成测试树 ──
function _generateTree(rootPos, nodeCount, branchingFactor, layerY) {
  if (running) return;
  running = true;
  cancelFlag = false;

  const names = [
    '认知科学', '神经网络', '深度学习', 'NLP', 'CV', '强化学习', 'GNN',
    'Transformer', 'Attention', 'BERT', 'GPT', '扩散模型', 'VAE', 'GAN',
    '自监督', '迁移学习', '元学习', '联邦学习', '知识蒸馏', '剪枝', '量化',
    '推理优化', '部署', 'MCP', 'Agent', 'RAG', '向量数据库', '嵌入',
    '交叉熵', '梯度下降', 'Adam', 'SGD', '正则化', 'Dropout', 'BatchNorm',
    'LayerNorm', '激活函数', '损失函数', '反向传播', '卷积', '池化',
    '残差网络', 'DenseNet', 'EfficientNet', 'YOLO', 'SAM', 'CLIP',
    'StableDiffusion', 'LLaMA', 'Mixtral', 'DeepSeek', 'Qwen', '文心',
    '星火', 'Prompt工程', '思维链', '少样本', '零样本', '微调', 'LoRA',
    'RLHF', 'DPO', '幻觉', '对齐', '安全', '可解释性', '因果推断',
    '图计算', '时间序列', '异常检测', '推荐系统', '搜索', '知识图谱'
  ];

  const rootName = names[0] + ' (根)';
  const rootId = _genId('ST_ROOT_', 0);
  const rootNode = {
    id: rootId, name: rootName, desc: '压力测试根节点',
    children: [], sizeScale: 3.0,
    ringSpeedFactor: 1.0, fixedColor: null
  };

  appState.nodeMap.set(rootId, rootNode);
  appState.addNodeToCurrentLayer(rootId);
  appState.positions.set(rootId, rootPos.clone());
  createNodeMesh(rootNode, rootPos);
  testNodeIds.add(rootId);
  testRootId = rootId;

  if (!appState.methodsTree.children) appState.methodsTree.children = [];
  appState.methodsTree.children.push(rootNode);

  // BFS
  const queue = [{ parentNode: rootNode, parentId: appState.VIRTUAL_ROOT_ID, parentPos: rootPos, depth: 0 }];
  let totalGen = 1;
  let nameIdx = 1;

  outer:
  while (queue.length > 0 && totalGen < nodeCount) {
    if (cancelFlag) break;
    const { parentNode, parentId, parentPos, depth } = queue.shift();
    const count = Math.min(branchingFactor, nodeCount - totalGen);

    for (let i = 0; i < count; i++) {
      if (cancelFlag || totalGen >= nodeCount) break outer;

      const angle = (i / count) * Math.PI * 2;
      const r = (depth + 1) * 3.5;
      const childPos = new THREE.Vector3(
        parentPos.x + Math.cos(angle) * r,
        layerY + (Math.random() - 0.5) * depth * 0.5,
        parentPos.z + Math.sin(angle) * r
      );

      const nm = names[nameIdx % names.length];
      nameIdx++;
      const childId = _genId('ST_', totalGen);
      const childNode = {
        id: childId, name: nm + ' ' + nameIdx,
        desc: '测试节点 #' + totalGen,
        children: [], sizeScale: depth > 3 ? 0.7 : 1.0,
        ringSpeedFactor: 0.5 + Math.random() * 1.5, fixedColor: null
      };

      appState.nodeMap.set(childId, childNode);
      appState.addNodeToCurrentLayer(childId);
      appState.positions.set(childId, childPos);
      createNodeMesh(childNode, childPos);
      testNodeIds.add(childId);

      if (!parentNode.children) parentNode.children = [];
      parentNode.children.push(childNode);

      addSingleTreeLine(parentId === appState.VIRTUAL_ROOT_ID ? rootId : parentId, childId);

      totalGen++;
      queue.push({ parentNode: childNode, parentId: childId, parentPos: childPos, depth: depth + 1 });
    }
  }

  _updateStats();
  running = false;
}

// ── 清理测试数据 ──
function _cleanup() {
  cancelFlag = true;
  running = false;

  for (const id of testNodeIds) {
    const obj = appState.nodeMeshes.get(id);
    if (obj) {
      appState.scene.remove(obj.mesh);
      if (obj.label) {
        appState.scene.remove(obj.label);
        if (obj.label.element) obj.label.element.remove();
      }
      if (obj.glowSphere) obj.mesh.remove(obj.glowSphere);
      if (obj.ring) obj.mesh.remove(obj.ring);
      if (obj.glowRing) obj.mesh.remove(obj.glowRing);
      if (obj.surfaceGlowSphere) {
        appState.scene.remove(obj.surfaceGlowSphere);
        obj.surfaceGlowSphere.material.dispose();
        obj.surfaceGlowSphere.geometry.dispose();
      }
      obj.mesh.geometry.dispose();
      obj.mesh.material.dispose();
      appState.nodeMeshes.delete(id);
    }
    appState.positions.delete(id);
    appState.nodeMap.delete(id);
    appState.positions2D.delete(id);
  }

  if (testRootId) {
    const rootNode = appState.nodeMap.get(testRootId);
    if (rootNode && appState.methodsTree.children) {
      const idx = appState.methodsTree.children.findIndex(c => c.id === testRootId);
      if (idx !== -1) appState.methodsTree.children.splice(idx, 1);
    }
  }

  appState.lineItems = appState.lineItems.filter(it => {
    if (testNodeIds.has(it.startId) || testNodeIds.has(it.endId)) {
      it.line.mesh.removeFromParent?.();
      it.line.glowTube?.removeFromParent?.();
      it.line.particlePoints?.removeFromParent?.();
      it.line.trailPointsMerged?.removeFromParent?.();
      if (it.line.labelObj) it.line.labelObj.removeFromParent?.();
      return false;
    }
    return true;
  });

  appState.crossEdges = appState.crossEdges.filter(e =>
    !testNodeIds.has(e.source) && !testNodeIds.has(e.target)
  );

  testNodeIds.clear();
  testRootId = null;
  _updateStats();
}

// ── 更新统计 ──
function _updateStats() {
  if (!panelEl) return;
  panelEl.querySelector('#stNodes').textContent = _countNodes();
  panelEl.querySelector('#stLines').textContent = _countLines();
  panelEl.querySelector('#stDrawCalls').textContent = _getDrawCalls();
  panelEl.querySelector('#stTriangles').textContent = _getTriangleCount();

  let mode = '华丽 3D';
  if (appState.is2DView) mode = '2D';
  else if (appState.simple3D) mode = '极简 3D';
  panelEl.querySelector('#stMode').textContent = mode;
}

// ── 模式切换 ──
function _switchMode(mode) {
  switch (mode) {
    case 'gorgeous':
      appState.is2DView = false;
      appState.simple3D = false;
      break;
    case 'simple':
      appState.is2DView = false;
      appState.simple3D = true;
      break;
    case '2d':
      appState.is2DView = true;
      if (appState.refresh2DView) appState.refresh2DView();
      break;
  }
  _updateStats();
}

// ── UI 面板 ──
function _createPanel() {
  if (panelEl) return;

  panelEl = document.createElement('div');
  panelEl.id = 'stressTestPanel';
  panelEl.style.cssText = `
    position:fixed; top:60px; right:10px; z-index:100000;
    background:rgba(12,20,30,0.92); border:1px solid #3a5060;
    border-radius:10px; padding:14px; width:280px;
    font-family:system-ui,sans-serif; font-size:12px;
    color:#c0d8e8; backdrop-filter:blur(10px);
    box-shadow:0 4px 20px rgba(0,0,0,0.5);
    user-select:none;
  `;

  panelEl.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <b style="font-size:14px;color:#6af">⚡ 压力测试</b>
      <span id="stMode" style="font-size:11px;background:#1a3040;padding:2px 8px;border-radius:10px">华丽 3D</span>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px">
      <div style="background:#1a2835;border-radius:6px;padding:6px 8px">
        <div style="color:#5a8a9a;font-size:10px">节点</div>
        <div id="stNodes" style="font-size:18px;font-weight:bold;color:#f0faff">0</div>
      </div>
      <div style="background:#1a2835;border-radius:6px;padding:6px 8px">
        <div style="color:#5a8a9a;font-size:10px">连线</div>
        <div id="stLines" style="font-size:18px;font-weight:bold;color:#f0faff">0</div>
      </div>
      <div style="background:#1a2835;border-radius:6px;padding:6px 8px">
        <div style="color:#5a8a9a;font-size:10px">Draw Calls</div>
        <div id="stDrawCalls" style="font-size:18px;font-weight:bold;color:#ffcc66">0</div>
      </div>
      <div style="background:#1a2835;border-radius:6px;padding:6px 8px">
        <div style="color:#5a8a9a;font-size:10px">FPS</div>
        <div id="stFps" style="font-size:18px;font-weight:bold;color:#66ff88">0</div>
      </div>
      <div style="background:#1a2835;border-radius:6px;padding:6px 8px;grid-column:1/-1">
        <div style="color:#5a8a9a;font-size:10px">三角形</div>
        <div id="stTriangles" style="font-size:14px;font-weight:bold;color:#aaa">0</div>
      </div>
    </div>

    <div style="margin-bottom:8px">
      <label style="display:block;font-size:11px;color:#5a8a9a;margin-bottom:3px">节点数量</label>
      <div style="display:flex;gap:4px">
        <input id="stNodeCount" type="range" min="50" max="2000" value="300" step="50"
          style="flex:1;accent-color:#4488ff">
        <span id="stNodeCountVal" style="min-width:40px;text-align:right">300</span>
      </div>
    </div>

    <div style="margin-bottom:10px">
      <label style="display:block;font-size:11px;color:#5a8a9a;margin-bottom:3px">分支因子</label>
      <div style="display:flex;gap:4px">
        <input id="stBranch" type="range" min="2" max="10" value="3" step="1"
          style="flex:1;accent-color:#4488ff">
        <span id="stBranchVal" style="min-width:20px;text-align:right">3</span>
      </div>
    </div>

    <div style="display:flex;gap:6px;margin-bottom:8px">
      <button id="stRun" style="flex:1;padding:8px;background:#2a5a3a;border:none;border-radius:6px;color:#fff;cursor:pointer;font-weight:bold">生成</button>
      <button id="stClean" style="flex:1;padding:8px;background:#5a2a2a;border:none;border-radius:6px;color:#fff;cursor:pointer;font-weight:bold">清除</button>
    </div>

    <div style="display:flex;gap:4px;margin-bottom:4px">
      <button id="stModeG" style="flex:1;padding:6px;background:#2a3a5a;border:1px solid #4a6a8a;border-radius:4px;color:#aad;cursor:pointer;font-size:10px">华丽</button>
      <button id="stModeS" style="flex:1;padding:6px;background:#2a3a5a;border:1px solid #4a6a8a;border-radius:4px;color:#aad;cursor:pointer;font-size:10px">极简</button>
      <button id="stMode2D" style="flex:1;padding:6px;background:#2a3a5a;border:1px solid #4a6a8a;border-radius:4px;color:#aad;cursor:pointer;font-size:10px">2D</button>
    </div>

    <div id="stStatus" style="font-size:11px;color:#5a8a9a;margin-top:4px;min-height:16px"></div>
  `;

  document.body.appendChild(panelEl);

  // 事件绑定
  const nodeSlider = panelEl.querySelector('#stNodeCount');
  const nodeVal = panelEl.querySelector('#stNodeCountVal');
  nodeSlider.addEventListener('input', () => { nodeVal.textContent = nodeSlider.value; });

  const branchSlider = panelEl.querySelector('#stBranch');
  const branchVal = panelEl.querySelector('#stBranchVal');
  branchSlider.addEventListener('input', () => { branchVal.textContent = branchSlider.value; });

  panelEl.querySelector('#stRun').addEventListener('click', () => {
    const count = parseInt(nodeSlider.value);
    const branch = parseInt(branchSlider.value);
    const st = panelEl.querySelector('#stStatus');
    st.textContent = '生成中...';
    const layerY = appState.layer3DLayout
      ? appState.layers.findIndex(l => l.id === appState.currentLayerId) * appState.layer3DSpacing
      : 0;
    _generateTree(new THREE.Vector3(0, layerY, 0), count, branch, layerY);
    setTimeout(() => {
      st.textContent = '完成! 可切换模式查看 (华丽/极简/2D)';
    }, 500);
  });

  panelEl.querySelector('#stClean').addEventListener('click', () => {
    panelEl.querySelector('#stStatus').textContent = '清理中...';
    _cleanup();
    panelEl.querySelector('#stStatus').textContent = '已清除';
  });

  panelEl.querySelector('#stModeG').addEventListener('click', () => _switchMode('gorgeous'));
  panelEl.querySelector('#stModeS').addEventListener('click', () => _switchMode('simple'));
  panelEl.querySelector('#stMode2D').addEventListener('click', () => _switchMode('2d'));

  _startFPS();
}

// ── 公共 API ──
export function show() {
  _createPanel();
  _updateStats();
}

export function hide() {
  if (panelEl) { panelEl.remove(); panelEl = null; }
  _stopFPS();
}

export function run(nodeCount = 300, branchingFactor = 3) {
  _createPanel();
  const layerY = appState.layer3DLayout
    ? appState.layers.findIndex(l => l.id === appState.currentLayerId) * appState.layer3DSpacing
    : 0;
  _generateTree(new THREE.Vector3(0, layerY, 0), nodeCount, branchingFactor, layerY);
}

export function cleanup() {
  _cleanup();
  hide();
}

// 挂载 window，控制台直接调用
if (typeof window !== 'undefined') {
  window.stressTest = { show, hide, run, cleanup };
}