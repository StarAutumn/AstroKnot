// ============================================================
//  nodes/textures.js — 共享 Canvas 纹理（节点发光面 + 卡片图标 + 扫描线）
//  所有节点/卡片复用同一份纹理，避免每节点创建 ~200KB canvas
// ============================================================
import * as THREE from 'three';
import { appState } from '../../module0_AppState.js';

// ==================== 共享 Canvas 纹理 ====================
let _sharedGlowSphereTex = null;
let _sharedGlowRingTex = null;
let _sharedSurfaceGlowTex = null;

export function _getSharedGlowSphereTex() {
  if (_sharedGlowSphereTex) return _sharedGlowSphereTex;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.2, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.5)');
  grad.addColorStop(0.8, 'rgba(255,255,255,0.08)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  _sharedGlowSphereTex = new THREE.CanvasTexture(canvas);
  return _sharedGlowSphereTex;
}

export function _getSharedGlowRingTex() {
  if (_sharedGlowRingTex) return _sharedGlowRingTex;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(canvas.width, canvas.height);
  const data = imageData.data;

  const vGradient = new Array(canvas.height);
  for (let y = 0; y < canvas.height; y++) {
    const t = y / (canvas.height - 1);
    let brightness;
    if (t <= 0.5) brightness = t / 0.5;
    else brightness = (1 - t) / 0.5;
    brightness = Math.pow(brightness, 1.5);
    vGradient[y] = Math.max(0, Math.min(1, brightness));
  }

  const periods = 3;
  for (let x = 0; x < canvas.width; x++) {
    const u = x / canvas.width;
    const phase = u * periods * Math.PI * 2;
    const hBrightness = 0.4 + 0.6 * Math.sin(phase);
    for (let y = 0; y < canvas.height; y++) {
      const idx = (y * canvas.width + x) * 4;
      const vBright = vGradient[y];
      const alpha = hBrightness * vBright;
      data[idx] = 255;
      data[idx + 1] = 255;
      data[idx + 2] = 255;
      data[idx + 3] = Math.round(alpha * 255);
    }
  }
  ctx.putImageData(imageData, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(1, 1);
  _sharedGlowRingTex = tex;
  return tex;
}

export function _getSharedSurfaceGlowTex() {
  if (_sharedSurfaceGlowTex) return _sharedSurfaceGlowTex;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const sgrad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  sgrad.addColorStop(0, 'rgba(255,255,255,0)');
  sgrad.addColorStop(0.6, 'rgba(255,255,255,0)');
  sgrad.addColorStop(0.75, 'rgba(255,255,255,0.9)');
  sgrad.addColorStop(0.9, 'rgba(255,255,255,0.2)');
  sgrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sgrad;
  ctx.fillRect(0, 0, 256, 256);
  _sharedSurfaceGlowTex = new THREE.CanvasTexture(canvas);
  return _sharedSurfaceGlowTex;
}

// 共享扫描线图案（4px 高，1px 透明 + 3px 青色线，所有卡片复用）
let _scanlinePattern = null;
export function _getScanlinePattern() {
  if (_scanlinePattern) return _scanlinePattern;
  const tile = document.createElement('canvas');
  tile.width = 1;
  tile.height = 4;
  const tctx = tile.getContext('2d');
  tctx.fillStyle = '#7ff';
  tctx.fillRect(0, 0, 1, 1);  // 顶部 1px 青线，下方 3px 透明
  _scanlinePattern = tctx.createPattern(tile, 'repeat');
  return _scanlinePattern;
}

// ── 共享发光面纹理（所有卡片复用，避免每节点创建径向渐变 canvas） ──
let _sharedCardGlowTex = null;
export function _getSharedCardGlowTex() {
  if (_sharedCardGlowTex) return _sharedCardGlowTex;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(0,255,255,0.6)');
  grad.addColorStop(0.5, 'rgba(0,255,255,0.2)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  _sharedCardGlowTex = new THREE.CanvasTexture(canvas);
  return _sharedCardGlowTex;
}

// ── 卡片模式节点球体上的文档图标 ──
let _sharedCardIconTex = null;
export function _createCardIcon() {
  // 共享纹理：64x64 Canvas 画一个文档/文本图标
  if (!_sharedCardIconTex) {
    const size = 64;
    const cvs = document.createElement('canvas');
    cvs.width = size; cvs.height = size;
    const ctx = cvs.getContext('2d');
    // 透明背景
    ctx.clearRect(0, 0, size, size);
    // 文档图标：圆角矩形 + 折角 + 文本行
    const m = 8; // margin
    const w = size - m * 2;
    const h = size - m * 2;
    const r = 6;
    // 文档主体
    ctx.beginPath();
    ctx.moveTo(m + r, m);
    ctx.lineTo(m + w - 10, m);
    ctx.lineTo(m + w, m + 10);
    ctx.lineTo(m + w, m + h - r);
    ctx.arcTo(m + w, m + h, m + w - r, m + h, r);
    ctx.lineTo(m + r, m + h);
    ctx.arcTo(m, m + h, m, m + h - r, r);
    ctx.lineTo(m, m + r);
    ctx.arcTo(m, m, m + r, m, r);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0, 200, 220, 0.55)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.9)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // 折角
    ctx.beginPath();
    ctx.moveTo(m + w - 10, m);
    ctx.lineTo(m + w - 10, m + 10);
    ctx.lineTo(m + w, m + 10);
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // 文本行（3条横线模拟文字）
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.lineWidth = 2;
    const lx = m + 12;
    const lx2 = m + w - 8;
    for (let i = 0; i < 3; i++) {
      const ly = m + 20 + i * 9;
      const end = i === 2 ? lx2 - 10 : lx2;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(end, ly);
      ctx.stroke();
    }
    _sharedCardIconTex = new THREE.CanvasTexture(cvs);
    _sharedCardIconTex.needsUpdate = true;
  }
  // 小平面贴在球体前方表面
  const iconSize = 0.3; // 世界单位，接近球体半径大小
  const geo = new THREE.PlaneGeometry(iconSize, iconSize);
  const mat = new THREE.MeshBasicMaterial({
    map: _sharedCardIconTex,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending
  });
  const plane = new THREE.Mesh(geo, mat);
  // 放在球体正前方表面
  const R = appState.NODE_RADIUS || 0.22;
  plane.position.set(0, 0, R + 0.005);
  plane.userData._isCardIcon = true;
  return plane;
}

// ── 网页节点球体上的地球图标 ──
let _sharedWebpageIconTex = null;
export function _createWebpageIcon() {
  if (!_sharedWebpageIconTex) {
    const size = 64;
    const cvs = document.createElement('canvas');
    cvs.width = size; cvs.height = size;
    const ctx = cvs.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    const cx = size / 2, cy = size / 2, r = 22;
    // 地球主体
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 160, 200, 0.5)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.9)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // 经线
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.6)';
    ctx.lineWidth = 1.2;
    // 竖椭圆（经线）
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 0.35, r, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 0.7, r, 0, 0, Math.PI * 2);
    ctx.stroke();
    // 横线（纬线）
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * 0.3, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * 0.65, 0, 0, Math.PI * 2);
    ctx.stroke();
    // 赤道高亮
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * 0.05, 0, 0, Math.PI * 2);
    ctx.stroke();
    _sharedWebpageIconTex = new THREE.CanvasTexture(cvs);
    _sharedWebpageIconTex.needsUpdate = true;
  }
  const iconSize = 0.3;
  const geo = new THREE.PlaneGeometry(iconSize, iconSize);
  const mat = new THREE.MeshBasicMaterial({
    map: _sharedWebpageIconTex,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending
  });
  const plane = new THREE.Mesh(geo, mat);
  const R = appState.NODE_RADIUS || 0.22;
  plane.position.set(0, 0, R + 0.005);
  plane.userData._isWebpageIcon = true;
  return plane;
}
