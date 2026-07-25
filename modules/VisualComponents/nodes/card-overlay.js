// ============================================================
//  nodes/card-overlay.js — 3D 卡片正文 DOM overlay
//  ─ 每帧投影 3D 卡片位置到屏幕坐标，创建/更新 DOM div 覆盖正文区
//  ─ overlay 有 pointer-events:auto，原生滚轮滚动 + 阻止冒泡避免相机缩放
//  ─ 转发 pointerdown/click/dblclick/contextmenu 到 renderer.domElement，保留节点交互
// ============================================================
import * as THREE from 'three';
import { appState } from '../../module0_AppState.js';
import { saveCurrentProjectData } from '../../module2_TreeData.js';
import { CARD_WORLD_SCALE } from './card-canvas.js';

const _cardBodyOverlays3D = new Map();  // nodeId -> HTMLElement
let _cardOverlayContainer3D = null;
let _tmpCamFwd = null;
const _projVec3 = new THREE.Vector3();

// 视图过渡标志：过渡期间 3D 卡片 mesh/overlay 不立即隐藏，由 2D canvas clipPath 动画自然覆盖
let _viewTransitioning = false;

export function isViewTransitioning() { return _viewTransitioning; }
export function setViewTransitioning(val) { _viewTransitioning = val; }

function _injectCardOverlayStyle3D() {
  if (document.getElementById('astroknot-card-overlay-style')) return;
  const style = document.createElement('style');
  style.id = 'astroknot-card-overlay-style';
  // 与 2D 视图共用 [data-card-overlay] 选择器（2D overlay 在 3D 视图时已隐藏，无冲突）
  style.textContent = `
[data-card-overlay] { color:#cde; font-size:13px; font-family:system-ui,sans-serif; line-height:1.6; }
[data-card-overlay] p { margin:4px 0; }
[data-card-overlay] h1,[data-card-overlay] h2,[data-card-overlay] h3,[data-card-overlay] h4,[data-card-overlay] h5,[data-card-overlay] h6 { color:#e0f0ff; margin:8px 0 4px; font-weight:600; line-height:1.3; }
[data-card-overlay] h1 { font-size:1.6em; }
[data-card-overlay] h2 { font-size:1.4em; }
[data-card-overlay] h3 { font-size:1.2em; }
[data-card-overlay] h4 { font-size:1.05em; }
[data-card-overlay] h5,[data-card-overlay] h6 { font-size:1em; }
[data-card-overlay] a { color:#5cc8ff; text-decoration:underline; }
[data-card-overlay] img,[data-card-overlay] video { max-width:100%; height:auto; border-radius:4px; }
[data-card-overlay] ul,[data-card-overlay] ol { margin:4px 0; padding-left:1.6em; }
[data-card-overlay] ul ul,[data-card-overlay] ol ol,[data-card-overlay] ul ol,[data-card-overlay] ol ul { padding-left:1.4em; }
[data-card-overlay] li { margin:2px 0; }
[data-card-overlay] table { border-collapse:collapse; width:100%; margin:6px 0; font-size:0.95em; }
[data-card-overlay] th,[data-card-overlay] td { border:1px solid #2c6e7e; padding:4px 8px; text-align:left; vertical-align:top; }
[data-card-overlay] th { background:#1a3545; color:#c0f0ff; font-weight:600; }
[data-card-overlay] tr:nth-child(even) td { background:rgba(255,255,255,0.03); }
[data-card-overlay] blockquote { margin:6px 0; padding:4px 12px; border-left:3px solid #2c6e7e; background:rgba(0,255,255,0.04); color:#9bb; }
[data-card-overlay] pre { background:#0d1b23 !important; border:1px solid #2c6e7e !important; border-radius:8px !important; padding:10px 12px !important; margin:6px 0 !important; overflow-x:auto !important; font-family:Consolas,Monaco,"Courier New",monospace !important; font-size:12px !important; line-height:1.5 !important; color:#c8e6ff !important; text-shadow:none !important; }
[data-card-overlay] pre code { background:transparent !important; border:none !important; padding:0 !important; color:inherit !important; text-shadow:none !important; }
[data-card-overlay] :not(pre)>code { background:#1a2a34 !important; border:1px solid #2c6e7e !important; border-radius:3px !important; padding:1px 5px !important; font-family:Consolas,Monaco,"Courier New",monospace !important; font-size:0.9em !important; color:#c8e6ff !important; }
[data-card-overlay] hr { border:none; border-top:1px solid #2c6e7e; margin:8px 0; }
[data-card-overlay] sup,[data-card-overlay] sub { font-size:0.55em; }
[data-card-overlay] rt { font-size:0.45em; line-height:1; opacity:0.75; }
[data-card-overlay] ruby { ruby-align:center; }
[data-card-overlay] span.gradient-text { background-clip:text; -webkit-background-clip:text; background-size:100% 100%; background-repeat:no-repeat; }
[data-card-overlay] .mce-object,[data-card-overlay] img[data-mce-object] { display:inline-block; }
[data-card-overlay] *[data-mce-selected] { outline:none; }
[data-card-overlay] p.tmce-dropcap::first-letter { font-size:3.5em; float:left; line-height:0.8; margin-right:6px; margin-top:2px; font-weight:bold; color:inherit; }
[data-card-overlay] .tmce-columns-2 { column-count:2; column-gap:2em; }
[data-card-overlay] .tmce-columns-3 { column-count:3; column-gap:1.5em; }
[data-card-overlay] .tmce-code-wrapper { display:flex !important; background:#0d1b23 !important; border:1px solid #2c6e7e !important; border-radius:8px !important; overflow:hidden !important; margin:6px 0 !important; }
[data-card-overlay] .tmce-line-numbers { flex-shrink:0; display:flex; flex-direction:column; padding:10px 0; background:#0d1b23; color:#3a5a6a; user-select:none; text-align:right; min-width:40px; font-family:Consolas,Monaco,"Courier New",monospace; font-size:12px; line-height:1.5; border-right:1px solid #1a2a34; overflow:hidden; }
[data-card-overlay] .tmce-line-numbers span { display:block; padding:0 10px 0 6px; line-height:1.5; }
[data-card-overlay] .tmce-code-area { flex:1; overflow:auto; min-width:0; }
[data-card-overlay] .tmce-code-wrapper pre { margin:0 !important; border:none !important; border-radius:0 !important; padding:10px 12px !important; }
[data-card-overlay] .hljs { color:#c8e6ff !important; background-color:transparent !important; }
[data-card-overlay] .hljs-comment,.hljs-quote,.hljs-doctag { color:#5a7a8a !important; font-style:italic !important; }
[data-card-overlay] .hljs-keyword,.hljs-selector-tag,.hljs-tag,.hljs-section,.hljs-name { color:#00e5ff !important; }
[data-card-overlay] .hljs-string,.hljs-regexp,.hljs-meta-string,.hljs-symbol,.hljs-bullet,.hljs-link,.hljs-addition { color:#ffd93d !important; }
[data-card-overlay] .hljs-number,.hljs-literal,.hljs-attr,.hljs-attribute,.hljs-variable,.hljs-template-variable,.hljs-deletion { color:#ff6b9d !important; }
[data-card-overlay] .hljs-type,.hljs-class .hljs-title,.hljs-function .hljs-title,.hljs-title,.hljs-built_in { color:#6bff6b !important; }
[data-card-overlay]::-webkit-scrollbar { width:6px; height:6px; }
[data-card-overlay]::-webkit-scrollbar-track { background:rgba(255,255,255,0.04); }
[data-card-overlay]::-webkit-scrollbar-thumb { background:rgba(0,255,255,0.35); border-radius:3px; }
[data-card-overlay]::-webkit-scrollbar-thumb:hover { background:rgba(0,255,255,0.55); }
`;
  document.head.appendChild(style);
}

function _getCardOverlayContainer3D() {
  if (_cardOverlayContainer3D && document.body.contains(_cardOverlayContainer3D)) return _cardOverlayContainer3D;
  _injectCardOverlayStyle3D();
  const container = document.createElement('div');
  container.id = 'astroknot-card-overlays-3d';
  container.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;z-index:40;overflow:visible;';
  document.body.appendChild(container);
  _cardOverlayContainer3D = container;
  return container;
}

// 移除指定卡片的 3D overlay
export function removeCardOverlay3D(nodeId) {
  const div = _cardBodyOverlays3D.get(nodeId);
  if (div) {
    div.remove();
    _cardBodyOverlays3D.delete(nodeId);
  }
}

// 清空所有 3D overlay（视图切换/销毁全部节点时调用）
export function clearAllCardOverlays3D() {
  for (const [, div] of _cardBodyOverlays3D) div.remove();
  _cardBodyOverlays3D.clear();
  if (_cardOverlayContainer3D && _cardOverlayContainer3D.style.display !== 'none') {
    _cardOverlayContainer3D.style.display = 'none';
  }
}

// 渐变 3D overlay 容器透明度（视图切换时与 2D 展开动画同步）
// targetOpacity: 0=渐隐, 1=渐入; duration: 毫秒
export function fadeCardOverlays3D(targetOpacity, duration) {
  const c = _getCardOverlayContainer3D();
  if (!c) return;
  c.style.display = '';
  c.style.transition = 'none';
  c.style.opacity = targetOpacity === 1 ? '0' : '1';
  void c.offsetHeight; // 强制回流，确保起始值生效
  c.style.transition = `opacity ${duration}ms cubic-bezier(0.4, 0.0, 0.2, 1)`;
  c.style.opacity = String(targetOpacity);
  setTimeout(() => {
    // 渐隐完成后清空
    if (targetOpacity === 0) clearAllCardOverlays3D();
  }, duration + 50);
}

// 在 renderer.domElement 上注册 capture 阶段 wheel 监听器：
// 光标在卡片上时滚轮滚动 overlay 正文（阻止 OrbitControls 缩放），否则放行相机缩放
let _wheelListener3DAttached = false;
const _wheelRaycaster = new THREE.Raycaster();
const _wheelMouseNDC = new THREE.Vector2();
function _attachWheelListener3D() {
  if (_wheelListener3DAttached) return;
  const rendererDom = appState.renderer?.domElement;
  if (!rendererDom) return;
  _wheelListener3DAttached = true;
  rendererDom.addEventListener('wheel', (e) => {
    // 2D 视图或无相机时不拦截
    if (appState.is2DView || !appState.camera) return;
    // 无可见卡片时不拦截
    if (_cardBodyOverlays3D.size === 0) return;
    // 计算 NDC 并射线检测
    const rect = rendererDom.getBoundingClientRect();
    _wheelMouseNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    _wheelMouseNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    _wheelRaycaster.setFromCamera(_wheelMouseNDC, appState.camera);
    const cardLabels = [];
    for (const [, obj] of appState.nodeMeshes) {
      if (obj.cardLabel && obj.cardLabel.visible) cardLabels.push(obj.cardLabel);
    }
    if (cardLabels.length === 0) return;
    const hits = _wheelRaycaster.intersectObjects(cardLabels, true);
    if (hits.length === 0) return;
    // 找到命中的卡片节点 ID
    let hitObj = hits[0].object;
    while (hitObj && !hitObj.userData?.nodeId) hitObj = hitObj.parent;
    const nodeId = hitObj?.userData?.nodeId;
    if (!nodeId) return;
    const overlay = _cardBodyOverlays3D.get(nodeId);
    if (!overlay) return;
    // 内容不需滚动时放行相机缩放
    if (overlay.scrollHeight <= overlay.clientHeight) return;
    // 已在边界时放行相机缩放（嵌套滚动容器行为）
    const delta = e.deltaY || 0;
    const atTop = overlay.scrollTop <= 0;
    const atBottom = overlay.scrollTop + overlay.clientHeight >= overlay.scrollHeight - 1;
    if (delta < 0 && atTop) return;
    if (delta > 0 && atBottom) return;
    // 滚动 overlay，阻止 OrbitControls 缩放
    overlay.scrollTop += delta;
    e.preventDefault();
    e.stopPropagation();
  }, { passive: false, capture: true });
}

// 同步所有 3D 卡片正文 overlay：位置/尺寸/内容/可见性
export function syncCardOverlays3D() {
  const container = _getCardOverlayContainer3D();
  // 2D 视图或相机未就绪时隐藏所有 overlay（视图过渡期间保留，由 clipPath 动画自然覆盖）
  if ((appState.is2DView || !appState.camera || !appState.renderer) && !_viewTransitioning) {
    if (container.style.display !== 'none') container.style.display = 'none';
    return;
  }
  if (container.style.display === 'none' && !_viewTransitioning) container.style.display = '';

  // 注册滚轮监听器（仅注册一次，由内部 _wheelListener3DAttached 标志守护）
  _attachWheelListener3D();

  const camera = appState.camera;
  const rendererDom = appState.renderer.domElement;
  const rect = rendererDom.getBoundingClientRect();
  const camPos = camera.position;
  const fovRad = camera.fov * Math.PI / 180;
  const tanHalfFov = Math.tan(fovRad / 2);
  // pxPerWorld = rect.height / (2 * dist * tanHalfFov)，提取 1/dist 系数避免重复除法
  const pxPerWorldBase = rect.height / (2 * tanHalfFov);

  if (!_tmpCamFwd) _tmpCamFwd = new THREE.Vector3();
  camera.getWorldDirection(_tmpCamFwd);

  const seen = new Set();
  for (const [id, obj] of appState.nodeMeshes.entries()) {
    if (!obj.cardLabel) continue;  // cardLabel 存在即处理（不管 visible）
    const node = appState.nodeMap.get(id);
    if (!node || (node.displayMode !== 'card' && node.displayMode !== 'webpage')) continue;

    // 正文透明度：根据动画状态计算
    // expanding: t < 1 时正文隐藏，t 接近 1 时渐显
    // stabilizing/stable: 完全显示
    // fading: 正文渐隐（卡片框架不动）
    // collapsing: 正文已隐藏
    const animState = obj.cardLabel.userData._cardAnimState;
    const animT = obj.cardLabel.userData._cardAnimT ?? 0;
    let bodyOpacity = 0;
    if (animState === 'expanding') {
      // 展开前80%正文隐藏，后20%渐显
      bodyOpacity = Math.max(0, (animT - 0.8) / 0.2);
    } else if (animState === 'stabilizing' || animState === 'stable') {
      bodyOpacity = 1;
    } else if (animState === 'fading') {
      // 正文渐隐
      bodyOpacity = obj.cardLabel.userData._cardFadeT ?? 0;
    } else if (animState === 'collapsing') {
      // 正文已隐藏
      bodyOpacity = 0;
    } else {
      bodyOpacity = 0;
    }

    // cardLabel 不可见且不在动画中时跳过
    if ((!obj.cardLabel.visible && animState === 'none') || obj.cardLabel.userData._offscreen) continue;

    // 使用 cardLabel 的位置（已在节点上方），而非 mesh 位置
    const worldPos = obj.cardLabel.position;
    // 视锥裁剪：相机后方或过远时跳过
    _projVec3.subVectors(worldPos, camPos);
    const dist = _projVec3.length();
    if (dist <= 0.01) continue;
    _projVec3.divideScalar(dist);  // 归一化为方向向量
    const dot = _projVec3.dot(_tmpCamFwd);
    if (dot < 0 || dist > 80) continue;

    // 投影到屏幕像素坐标
    _projVec3.copy(worldPos).project(camera);
    const screenX = (_projVec3.x * 0.5 + 0.5) * rect.width + rect.left;
    const screenY = (-_projVec3.y * 0.5 + 0.5) * rect.height + rect.top;

    // 卡片屏幕尺寸（billboard 朝向相机，投影为矩形）
    const cardW = node.cardWidth || 220;
    const cardH = node.cardHeight || 200;
    const planeW = cardW * CARD_WORLD_SCALE;
    const planeH = cardH * CARD_WORLD_SCALE;
    const pxPerWorld = pxPerWorldBase / dist;
    const screenW = planeW * pxPerWorld;
    const screenH = planeH * pxPerWorld;

    // 正文区域布局
    const padding = 10;
    let titleAreaH, bodyX, bodyY, bodyWCanvas, bodyHCanvas;
    const isWebpage3D = node.displayMode === 'webpage';
    if (isWebpage3D) {
      titleAreaH = 32;  // 搜索栏高度
      bodyX = padding;
      bodyY = padding + titleAreaH + 4;
      bodyWCanvas = cardW - padding * 2;
      bodyHCanvas = Math.max(0, cardH - padding - titleAreaH - 4 - padding);
    } else {
      titleAreaH = 30;
      bodyX = padding;
      bodyY = padding + titleAreaH;
      bodyWCanvas = cardW - padding * 2;
      bodyHCanvas = Math.max(0, cardH - padding - titleAreaH - padding);
    }

    // 正文区域占卡片的比例 → 屏幕像素
    const bodyScreenX = screenX - screenW / 2 + (bodyX / cardW) * screenW;
    const bodyScreenY = screenY - screenH / 2 + (bodyY / cardH) * screenH;
    const bodyScreenW = (bodyWCanvas / cardW) * screenW;
    const bodyScreenH = (bodyHCanvas / cardH) * screenH;

    // 太小时不显示 overlay（避免无效 DOM 操作）
    if (bodyScreenW < 10 || bodyScreenH < 10) continue;

    seen.add(id);
    let div = _cardBodyOverlays3D.get(id);
    if (!div) {
      div = document.createElement('div');
      div.dataset.cardOverlay = id;
      if (isWebpage3D) {
        // ── 网页节点3D overlay：搜索栏 + iframe ──
        div.style.cssText = 'position:fixed;pointer-events:none;overflow:hidden;' +
          'background:transparent;box-sizing:border-box;';
        // 搜索栏
        const searchWrap = document.createElement('div');
        searchWrap.dataset.webpageSearch3D = id;
        searchWrap.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:32px;pointer-events:auto;display:flex;align-items:center;gap:4px;padding:0 6px;' +
          'background:rgba(0,30,40,0.9);border-bottom:1px solid rgba(0,255,255,0.3);';
        const searchIcon = document.createElement('span');
        searchIcon.textContent = '🔍';
        searchIcon.style.cssText = 'font-size:13px;flex-shrink:0;';
        searchWrap.appendChild(searchIcon);
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.dataset.webpageInput3D = id;
        searchInput.placeholder = '输入网址或搜索...';
        searchInput.value = node.webUrl || '';
        searchInput.style.cssText = 'flex:1;min-width:0;background:rgba(0,20,30,0.8);border:1px solid rgba(0,255,255,0.3);border-radius:4px;' +
          'color:#cde;font-size:12px;padding:2px 8px;outline:none;font-family:system-ui,sans-serif;';
        searchInput.addEventListener('keydown', (e) => { e.stopPropagation(); });
        searchInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const val = searchInput.value.trim();
            if (!val) return;
            node.webUrl = val;
            let url = val;
            if (!/^https?:\/\//i.test(val) && !val.startsWith('file://') && !val.startsWith('data:')) {
              url = val.includes('.') && !val.includes(' ') ? 'https://' + val : 'https://www.bing.com/search?q=' + encodeURIComponent(val);
            }
            const iframe = div.querySelector('iframe[data-webpage-iframe-3d]');
            if (iframe) iframe.src = url;
            saveCurrentProjectData();
          }
        });
        searchWrap.appendChild(searchInput);
        div.appendChild(searchWrap);
        // iframe（不设 sandbox，让外部网页正常加载）
        const iframeWrap = document.createElement('div');
        iframeWrap.dataset.webpageBody3D = id;
        iframeWrap.style.cssText = 'position:absolute;left:0;top:32px;width:100%;bottom:0;pointer-events:auto;overflow:hidden;';
        const iframe = document.createElement('iframe');
        iframe.dataset.webpageIframe3d = '';
        iframe.style.cssText = 'width:100%;height:100%;border:none;background:#0d1820;';
        if (node.webUrl) {
          let url = node.webUrl;
          if (!/^https?:\/\//i.test(url) && !url.startsWith('file://') && !url.startsWith('data:')) {
            url = (url.includes('.') && !url.includes(' ')) ? 'https://' + url : 'https://www.bing.com/search?q=' + encodeURIComponent(url);
          }
          iframe.src = url;
        }
        iframeWrap.appendChild(iframe);
        div.appendChild(iframeWrap);
      } else {
        div.style.cssText = 'position:fixed;pointer-events:none;overflow-y:auto;overflow-x:hidden;' +
          'background:transparent;box-sizing:border-box;word-break:break-word;' +
          'padding:2px 6px 2px 2px;' +
          'scrollbar-width:thin;scrollbar-color:rgba(0,255,255,0.4) rgba(255,255,255,0.06);';
      }
      container.appendChild(div);
      _cardBodyOverlays3D.set(id, div);
    }
    // z-index 按距离排序
    div.style.zIndex = String(1000 - Math.floor(dist * 10));
    div.style.left = bodyScreenX + 'px';
    div.style.top = bodyScreenY + 'px';
    div.style.width = bodyScreenW + 'px';
    div.style.height = bodyScreenH + 'px';
    // 正文透明度跟随动画状态
    div.style.opacity = String(bodyOpacity);
    // 内容更新
    if (isWebpage3D) {
      // 网页节点：overlay覆盖完整区域（搜索栏+iframe）
      const searchBarY2 = screenY - screenH / 2 + (padding / cardH) * screenH;
      const searchBarH2 = (titleAreaH / cardH) * screenH;
      div.style.left = (screenX - screenW / 2 + (padding / cardW) * screenW) + 'px';
      div.style.top = searchBarY2 + 'px';
      div.style.width = bodyScreenW + 'px';
      div.style.height = (bodyScreenH + searchBarH2 + 4 * (screenH / cardH)) + 'px';
      // 同步搜索栏高度
      const searchWrap = div.querySelector('[data-webpage-search3d]');
      if (searchWrap) searchWrap.style.height = searchBarH2 + 'px';
      const iframeWrap = div.querySelector('[data-webpage-body3d]');
      if (iframeWrap) iframeWrap.style.top = searchBarH2 + 'px';
      // 同步输入值
      const searchInput = div.querySelector('[data-webpage-input3d]');
      if (searchInput && document.activeElement !== searchInput) {
        const url = node.webUrl || '';
        if (searchInput.value !== url) searchInput.value = url;
      }
    } else {
      // 普通卡片节点
      const html = node.richContent || node.desc || '';
      if (div._lastHtml !== html) {
        div.innerHTML = html;
        div._lastHtml = html;
      }
    }
  }
  // 移除不再可见的 overlay
  for (const [id, div] of _cardBodyOverlays3D) {
    if (!seen.has(id)) {
      div.remove();
      _cardBodyOverlays3D.delete(id);
    }
  }
}
