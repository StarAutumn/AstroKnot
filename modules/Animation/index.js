// ============================================================
//  模块14：动画循环（使用 appState）——由 module14_Animation.js 拆分
//  animate() 主编排：帧门控 → 暂停/2D 分支 → 各子系统按序调度
//  由 module14_Animation.js 拆分，原路径的引用请指向 ./Animation/index.js
// ============================================================
import { appState } from '../module0_AppState.js';
import { processMovement } from '../UI/Keyboard.js';
import { _bumpRenderFrame, updateCardBillboards } from '../VisualComponents/index.js';
import { getVersionDecay } from '../versionGraph/versionAtmosphere.js';
import { updateFishbone3D } from '../Fishbone/render3d.js';
import { updateNodeSatellites } from '../VisualComponents/Satellites.js';
import { _updateLabelZIndices } from './labels.js';
import { updateNodeMeshColors } from './node-colors.js';
import { updateTransitionEffects, updateBackgroundFx, updateSkyAndGlow, updateMeteors } from './scene-fx.js';
import { updateLines, updateNodeAnimations } from './lines-nodes.js';
import { updateArrange3D, updateArrange2D, updateCameraAnimation } from './arrange.js';
import { updateParticleOpacityTransition, renderFrame } from './render.js';

let tm = 0;
let _frameSkipCounter = 0;  // HSL 节流用：每 2 帧更新一次非选中节点 HSL 颜色

// ── 帧率控制：锁 90fps，用户空闲 30s 后降至 50fps ──
const _TARGET_INTERVAL = 1000 / 90;   // 90fps ≈ 11.11ms
const _IDLE_INTERVAL = 1000 / 50;     // 50fps = 20ms
const _IDLE_THRESHOLD = 30000;        // 30s 无操作进入空闲
let _last3DFrameTime = 0;
let _interactionListenersInited = false;

function _initInteractionListeners() {
  if (_interactionListenersInited) return;
  _interactionListenersInited = true;
  appState.lastInteractionTime = performance.now();
  const _update = () => { appState.lastInteractionTime = performance.now(); };
  // 被动监听用户交互，仅更新时间戳（极低开销）
  for (const evt of ['mousedown', 'mousemove', 'keydown', 'wheel', 'touchstart']) {
    window.addEventListener(evt, _update, { passive: true });
  }
}

export function animate() {
  requestAnimationFrame(animate);
  // 帧率控制：锁 90fps，空闲 30s 后降至 30fps
  _initInteractionListeners();
  const _now = performance.now();
  const _idle = (_now - (appState.lastInteractionTime || _now)) > _IDLE_THRESHOLD;
  const _interval = _idle ? _IDLE_INTERVAL : _TARGET_INTERVAL;
  const _elapsed = _now - _last3DFrameTime;
  if (_last3DFrameTime > 0 && _elapsed < _interval) return;
  // 真实 delta time（秒）：动画速度与帧率解耦，144Hz/60Hz 下速度一致
  // 首帧用默认 0.016；后续用真实间隔，clamp 到 0.05 避免卡顿后大跳变
  const _frameDt = _last3DFrameTime > 0 ? Math.min(0.05, _elapsed / 1000) : 0.016;
  _last3DFrameTime = _now;

  if (document.hidden) return;                        // 页面隐藏时跳过渲染，减少 GPU 压力
  _frameSkipCounter = (_frameSkipCounter + 1) & 0x1;  // 0/1 交替
  _bumpRenderFrame();  // 粒子分帧交错用，每帧递增

  if (window._pause3DAnimation) {
    // 最大化模式：只更新节点颜色和连线颜色，其余特效暂停
    processMovement();
    // 版本氛围：checkout 到越早站点动画越慢（decay 1=正常，接近 0=几乎静止）
    // 用平方让衰减更陡峭：早期站点速度下降更快
    const _vDecay = getVersionDecay();
    const _speedFactor = 0.005 + _vDecay * _vDecay * 0.995;
    tm += _frameDt * _speedFactor;
    appState.tm = tm;

    // ========== 连线颜色更新 ==========
    for (let it of appState.lineItems) {
      const isConnectedLine = appState.connectedLineItems ? appState.connectedLineItems.has(it) : false;
      const isConnectedStepLine = appState.connectedStepLineItems ? appState.connectedStepLineItems.has(it) : false;
      if (isConnectedStepLine) {
        it.line.mesh.material.color.setHex(0xAA44FF);
        it.line.mesh.material.emissive.setHex(0x8822CC);
      } else if (isConnectedLine) {
        it.line.mesh.material.color.setHex(0x4488FF);
        it.line.mesh.material.emissive.setHex(0x3366DD);
      } else if (!it.line.customColor) {
        it.line.mesh.material.color.setHex(0xffffff);
        it.line.mesh.material.emissive.setHex(0x996688);
      }
      if (it.line.glowTube) {
        if (isConnectedStepLine) {
          it.line.glowTube.material.color.setHex(0xAA44FF);
        } else if (isConnectedLine) {
          it.line.glowTube.material.color.setHex(0x4488FF);
        } else if (!it.line.customColor) {
          it.line.glowTube.material.color.setHex(0xffffff);
        }
      }
    }

    // ========== 节点颜色更新（完整 HSL 循环，与 2D 常驻模式共用） ==========
    updateNodeMeshColors(tm, _frameSkipCounter);

    // ========== 图层水面波纹更新 ==========
    if (appState.layerHighlights) {
      for (const hl of appState.layerHighlights) {
        if (hl.material && hl.material.uniforms && hl.material.uniforms.uTime) {
          hl.material.uniforms.uTime.value = tm;
        }
      }
    }

    // ========== 渲染 ==========
    try {
      // 2D 模式跳过整条 3D 渲染管线（与主循环同规则）；视图过渡期间继续渲染，
      // 避免 3D→2D 展开/2D→3D 收缩过程中 3D 背景冻结或揭开后延迟启动
      if (!appState.is2DView || appState._viewTransitioning) {
        updateCardBillboards(tm);
        _updateLabelZIndices();
        appState.controls.update();
        if (appState.simple3D && appState.renderer) {
          appState.renderer.render(appState.scene, appState.camera);
        } else {
          appState.effectComposer.render();
        }
        appState.labelRenderer.render(appState.scene, appState.camera);
      }
    } catch (e) { console.error('渲染异常(暂停模式):', e); }

    if (appState.is2DView && typeof appState.redraw2DView === 'function') {
      appState.redraw2DView();
    }
    return;
  }

  // 2D 常驻模式：暂停 3D 运动与渲染（切换过渡期豁免，_viewTransitioning 由切换编排设置），
  // 仅保留 tm 时钟推进 + 节点颜色呼吸 + 2D 排列动画推进 + 2D 重绘；tm 单时钟推进保证切回 3D 时
  // 星空相位/流光/颜色相位无缝衔接
  if (appState.is2DView && !appState._viewTransitioning) {
    const _vDecay = getVersionDecay();
    tm += _frameDt * (0.005 + _vDecay * _vDecay * 0.995);
    appState.tm = tm;
    updateNodeMeshColors(tm, _frameSkipCounter);  // 2D 卡片边框色读取 3D mesh 材质色，颜色循环不能停
    updateArrange2D(_frameDt);  // 2D 排列动画相位推进（此分支提前 return，不推进会导致排列冻结）
    if (typeof appState.redraw2DView === 'function') appState.redraw2DView();
    return;
  }

  processMovement();
  // 版本氛围：checkout 到越早站点动画越慢（decay 1=正常，接近 0=几乎静止）
  // 用平方让衰减更陡峭：早期站点速度下降更快
  const _vDecay = getVersionDecay();
  const _speedFactor = 0.005 + _vDecay * _vDecay * 0.995;
  tm += _frameDt * _speedFactor;
  appState.tm = tm;

  updateTransitionEffects(tm, _frameDt);

  updateBackgroundFx(tm);

  updateLines(tm);

  // ========== 鱼骨主干连线更新（同款流光/粒子动画） ==========
  updateFishbone3D(tm);

  // ========== 折叠父节点的旋转小卫星（数量 = 隐藏的后代节点数） ==========
  updateNodeSatellites(tm);

  updateNodeAnimations(tm, _frameDt, _frameSkipCounter);

  updateSkyAndGlow(tm);

  updateCameraAnimation(_frameDt);

  updateArrange3D(tm, _frameDt);

  updateArrange2D(_frameDt);

  updateMeteors(_frameDt);

  updateParticleOpacityTransition();

  renderFrame(tm);
}