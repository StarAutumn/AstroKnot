// ============================================================
//  模块1：纹理与背景资源（所有纹理存入 appState）
// ============================================================
import * as THREE from 'three';
import { appState } from './module0_AppState.js';

export function createGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.2, 'rgba(255,255,255,0.9)');
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  gradient.addColorStop(0.7, 'rgba(255,255,255,0.2)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

export function createPanoramaTexture(opacityScale = 1.0) {
  const canvas = document.createElement('canvas');
  const W = 8192, H = 4096;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // 1. 深空底色
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, '#010118');
  bgGrad.addColorStop(0.3, '#030a22');
  bgGrad.addColorStop(0.7, '#010a1c');
  bgGrad.addColorStop(1, '#000812');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  function drawPeriodic(x, y, fn) {
    for (let off of [0, -W, W]) {
      ctx.save();
      ctx.translate(off, 0);
      fn(x, y);
      ctx.restore();
    }
  }

  // 2. 大量彩色星云层
  for (let i = 0; i < 40; i++) {
    const cx = Math.random() * W;
    const cy = Math.random() * H;
    const rx = 500 + Math.random() * 1500;
    const ry = 250 + Math.random() * 700;
    const rotation = Math.random() * Math.PI;
    const hue = (i * 30 + Math.random() * 25) % 360;
    const saturation = 55 + Math.random() * 35;
    const lightness = 25 + Math.random() * 25;

    drawPeriodic(cx, cy, (x, y) => {
      ctx.translate(x, y);
      ctx.rotate(rotation);
      ctx.scale(rx / 800, ry / 500);
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 400);
      grad.addColorStop(0, `hsla(${hue}, ${saturation}%, ${lightness}%, ${(0.04 * opacityScale).toFixed(3)})`);
      grad.addColorStop(0.15, `hsla(${hue}, ${saturation}%, ${lightness}%, ${(0.035 * opacityScale).toFixed(3)})`);
      grad.addColorStop(0.4, `hsla(${hue}, ${saturation * 0.9}%, ${lightness * 0.9}%, ${(0.02 * opacityScale).toFixed(3)})`);
      grad.addColorStop(0.7, `hsla(${hue}, ${saturation * 0.8}%, ${lightness * 0.8}%, ${(0.008 * opacityScale).toFixed(4)})`);
      grad.addColorStop(0.9, `hsla(${hue}, ${saturation * 0.6}%, ${lightness * 0.7}%, ${(0.002 * opacityScale).toFixed(4)})`);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.fillRect(-400, -400, 800, 800);
    });

    for (let j = 0; j < 4; j++) {
      const offsetX = (Math.random() - 0.5) * rx * 0.5;
      const offsetY = (Math.random() - 0.5) * ry * 0.5;
      const childR = 150 + Math.random() * 350;
      const childRot = Math.random() * Math.PI;
      drawPeriodic(cx + offsetX, cy + offsetY, (x, y) => {
        ctx.translate(x, y);
        ctx.rotate(childRot);
        ctx.scale(childR / 400, childR / 400);
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 200);
        grad.addColorStop(0, `hsla(${hue}, ${saturation}%, ${lightness}%, ${(0.05 * opacityScale).toFixed(3)})`);
        grad.addColorStop(0.3, `hsla(${hue}, ${saturation}%, ${lightness}%, ${(0.04 * opacityScale).toFixed(3)})`);
        grad.addColorStop(0.6, `hsla(${hue}, ${saturation * 0.8}%, ${lightness * 0.8}%, ${(0.015 * opacityScale).toFixed(3)})`);
        grad.addColorStop(0.85, `hsla(${hue}, ${saturation * 0.6}%, ${lightness * 0.7}%, ${(0.003 * opacityScale).toFixed(4)})`);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.fillRect(-200, -200, 400, 400);
      });
    }
  }

  // 3. 大型柔软扩散光晕
  for (let i = 0; i < 15; i++) {
    const cx = Math.random() * W;
    const cy = Math.random() * H;
    const rx = 1000 + Math.random() * 2000;
    const ry = 500 + Math.random() * 1000;
    const rot = Math.random() * Math.PI * 0.2;
    const hue = 200 + Math.random() * 160;
    drawPeriodic(cx, cy, (x, y) => {
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.scale(rx / 1200, ry / 700);
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 600);
      grad.addColorStop(0, `hsla(${hue}, 70%, 50%, ${(0.015 * opacityScale).toFixed(3)})`);
      grad.addColorStop(0.4, `hsla(${hue}, 60%, 40%, ${(0.008 * opacityScale).toFixed(4)})`);
      grad.addColorStop(0.8, `hsla(${hue}, 50%, 30%, ${(0.001 * opacityScale).toFixed(4)})`);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.fillRect(-600, -600, 1200, 1200);
    });
  }

  // 4. 银河彩虹泛光层
  const continuousSteps = 200;
  const coreCyMin = H * 0.40;
  const coreCyMax = H * 0.60;
  for (let i = 0; i < continuousSteps; i++) {
    const cx = (i / continuousSteps) * W;
    const cy = coreCyMin + Math.random() * (coreCyMax - coreCyMin);
    const rx = 2800 + Math.random() * 2200;
    const ry = 350 + Math.random() * 650;
    const rot = Math.random() * Math.PI * 0.12;
    const angle = (cx / W) * Math.PI * 2;
    const hue = (angle * 180 / Math.PI + i * 2) % 360;

    drawPeriodic(cx, cy, (x, y) => {
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.scale(rx / 800, ry / 400);
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 400);
      grad.addColorStop(0, `hsla(${hue}, 85%, 60%, ${(0.008 * opacityScale).toFixed(4)})`);
      grad.addColorStop(0.2, `hsla(${hue}, 80%, 55%, ${(0.006 * opacityScale).toFixed(4)})`);
      grad.addColorStop(0.45, `hsla(${hue}, 75%, 50%, ${(0.0025 * opacityScale).toFixed(4)})`);
      grad.addColorStop(0.75, `hsla(${hue}, 70%, 45%, ${(0.0006 * opacityScale).toFixed(6)})`);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.fillRect(-400, -400, 800, 800);
    });

    for (let j = 0; j < 80; j++) {
      const offsetX = (Math.random() - 0.5) * rx * 0.4;
      const offsetY = (Math.random() - 0.5) * ry * 0.6;
      const childR = 280 + Math.random() * 400;
      drawPeriodic(cx + offsetX, cy + offsetY, (x, y) => {
        ctx.translate(x, y);
        ctx.scale(childR / 400, childR / 400);
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 200);
        grad.addColorStop(0, `hsla(${hue}, 80%, 60%, ${(0.006 * opacityScale).toFixed(4)})`);
        grad.addColorStop(0.35, `hsla(${hue}, 75%, 55%, ${(0.003 * opacityScale).toFixed(4)})`);
        grad.addColorStop(0.7, `hsla(${hue}, 70%, 50%, ${(0.0008 * opacityScale).toFixed(6)})`);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.fillRect(-200, -200, 400, 400);
      });
    }
  }

  // 5. 银河大型柔软扩散光晕
  for (let i = 0; i < 30; i++) {
    const cx = Math.random() * W;
    const cy = H * 0.40 + Math.random() * H * 0.20;
    const rx = 3000 + Math.random() * 3000;
    const ry = 500 + Math.random() * 700;
    const rot = Math.random() * Math.PI * 0.1;
    const hue = 200 + Math.random() * 140;
    drawPeriodic(cx, cy, (x, y) => {
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.scale(rx / 1500, ry / 700);
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 600);
      grad.addColorStop(0, `hsla(${hue}, 80%, 60%, ${(0.01 * opacityScale).toFixed(3)})`);
      grad.addColorStop(0.4, `hsla(${hue}, 70%, 50%, ${(0.004 * opacityScale).toFixed(4)})`);
      grad.addColorStop(0.8, `hsla(${hue}, 60%, 40%, ${(0.0005 * opacityScale).toFixed(5)})`);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.fillRect(-600, -600, 1200, 1200);
    });
  }

  // 6. 上下边缘零星泛光
  const scatterCount = 80;
  for (let i = 0; i < scatterCount; i++) {
    const cx = Math.random() * W;
    const cy = (Math.random() < 0.5) ? H * 0.15 + Math.random() * H * 0.12 : H * 0.73 + Math.random() * H * 0.12;
    const rx = 500 + Math.random() * 2000;
    const ry = 100 + Math.random() * 200;
    const rot = Math.random() * Math.PI * 0.15;
    const angle = (cx / W) * Math.PI * 2;
    const hue = (angle * 180 / Math.PI + i * 8) % 360;

    drawPeriodic(cx, cy, (x, y) => {
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.scale(rx / 800, ry / 400);
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 400);
      grad.addColorStop(0, `hsla(${hue}, 85%, 60%, ${(0.08 * opacityScale).toFixed(3)})`);
      grad.addColorStop(0.25, `hsla(${hue}, 80%, 55%, ${(0.05 * opacityScale).toFixed(3)})`);
      grad.addColorStop(0.55, `hsla(${hue}, 75%, 50%, ${(0.015 * opacityScale).toFixed(3)})`);
      grad.addColorStop(0.8, `hsla(${hue}, 70%, 45%, ${(0.003 * opacityScale).toFixed(4)})`);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.fillRect(-400, -400, 800, 800);
    });

    for (let j = 0; j < 5; j++) {
      const offX = (Math.random() - 0.5) * rx * 0.4;
      const offY = (Math.random() - 0.5) * ry * 0.5;
      const childR = 120 + Math.random() * 300;
      drawPeriodic(cx + offX, cy + offY, (x, y) => {
        ctx.translate(x, y);
        ctx.scale(childR / 400, childR / 400);
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 200);
        grad.addColorStop(0, `hsla(${hue}, 80%, 60%, ${(0.05 * opacityScale).toFixed(3)})`);
        grad.addColorStop(0.4, `hsla(${hue}, 75%, 55%, ${(0.02 * opacityScale).toFixed(3)})`);
        grad.addColorStop(0.75, `hsla(${hue}, 70%, 50%, ${(0.003 * opacityScale).toFixed(4)})`);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.fillRect(-200, -200, 400, 400);
      });
    }
  }

  // 银河密集星星带
  const galaxyCenterY = H * 0.47;
  const galaxyHalfWidth = H * 0.25;
  for (let i = 0; i < 150000; i++) {
    const cx = Math.random() * W;
    const y = galaxyCenterY + (Math.random() - 0.5) * galaxyHalfWidth * 2;
    if (y < 0 || y > H) continue;
    const distFromCenter = Math.abs(y - galaxyCenterY) / galaxyHalfWidth;
    const edgeFade = Math.max(0, 1 - distFromCenter * 1.3);
    const alpha = (Math.random() * 0.4 + 0.1) * edgeFade;
    if (alpha < 0.02) continue;
    const hue = (cx / W) * 360;
    const saturation = 85 + Math.random() * 15;
    const lightness = 170 + Math.random() * 25;
    const radius = Math.random() * 3.5 + 0.2;
    drawPeriodic(cx, y, (x, y) => {
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`;
      ctx.fill();
    });
  }
  // 3.5d 更密集、颜色鲜艳的中心亮星
  const brightCoreY = H * 0.52;
  const brightHalfHeight = H * 0.08;
  const denseStarCount2 = 100000;
  for (let i = 0; i < denseStarCount2; i++) {
    const cx = Math.random() * W;
    const y = brightCoreY + (Math.random() - 0.5) * brightHalfHeight * 2;
    if (y < 0 || y > H) continue;
    const distFromCenter = Math.abs(y - brightCoreY) / brightHalfHeight;
    const centerFade = Math.max(0, 1 - distFromCenter * 1.4);
    const alpha = (Math.random() * 0.8 + 0.2) * centerFade;
    if (alpha < 0.15) continue;
    const hue = Math.random() * 360;
    const saturation = 70 + Math.random() * 30;
    const lightness = 50 + Math.random() * 30;
    const radius = Math.random() * 3.0 + 0.8;
    drawPeriodic(cx, y, (x, y) => {
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`;
      ctx.fill();
    });
  }
  // 散布全色域亮星
  for (let i = 0; i < 10000; i++) {
    const cx = Math.random() * W;
    const cy = Math.random() * H;
    const radius = Math.random() * 2 + 0.8;
    const alpha = Math.random() * 0.9 + 0.1;
    const hue = Math.random() * 360;
    const saturation = 20 + Math.random() * 50;
    const lightness = 65 + Math.random() * 30;
    drawPeriodic(cx, cy, (x, y) => {
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`;
      ctx.fill();
    });
  }

  // 暗星背景
  for (let i = 0; i < 16000; i++) {
    const cx = Math.random() * W;
    const cy = Math.random() * H;
    const radius = Math.random() * 1.2 + 0.2;
    const alpha = Math.random() * 0.25 + 0.05;
    drawPeriodic(cx, cy, (x, y) => {
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200,220,255,${alpha})`;
      ctx.fill();
    });
  }

  // 巨型亮星 + 彩色十字光芒
  for (let i = 0; i < 20; i++) {
    const cx = Math.random() * W;
    const cy = Math.random() * H;
    const shineSize = 120 + Math.random() * 240;
    const hue = (i * 30) % 360;
    drawPeriodic(cx, cy, (x, y) => {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const gh = ctx.createLinearGradient(x - shineSize, y, x + shineSize, y);
      gh.addColorStop(0, 'transparent');
      gh.addColorStop(0.5, `hsla(${hue}, 90%, 80%, 0.45)`);
      gh.addColorStop(1, 'transparent');
      ctx.fillStyle = gh;
      ctx.fillRect(x - shineSize, y - 3, shineSize * 2, 7);
      const gv = ctx.createLinearGradient(x, y - shineSize, x, y + shineSize);
      gv.addColorStop(0, 'transparent');
      gv.addColorStop(0.5, `hsla(${hue}, 90%, 80%, 0.45)`);
      gv.addColorStop(1, 'transparent');
      ctx.fillStyle = gv;
      ctx.fillRect(x - 3, y - shineSize, 7, shineSize * 2);
      ctx.restore();
    });
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(1, 1);
  return tex;
}

// 初始化基础纹理并存入 appState
appState.glowTex = createGlowTexture();
appState.panoramaTexture = createPanoramaTexture(1.0);

export function createIrregularGlowTexture(baseHue) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  const layers = 6 + Math.floor(Math.random() * 4);
  for (let i = 0; i < layers; i++) {
    const cx = 200 + Math.random() * 600;
    const cy = 200 + Math.random() * 600;
    const rx = 80 + Math.random() * 400;
    const ry = 80 + Math.random() * 400;
    const rotation = Math.random() * Math.PI;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.scale(rx / 200, ry / 200);
    const hue = (baseHue + Math.random() * 0.2) % 1;
    const saturation = 0.4 + Math.random() * 0.4;
    const lightness = 0.5 + Math.random() * 0.3;
    const color = `hsla(${hue * 360}, ${saturation * 100}%, ${lightness * 100}%, 0.15)`;
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 200);
    gradient.addColorStop(0, color);
    gradient.addColorStop(0.6, `hsla(${hue * 360}, ${saturation * 100}%, ${lightness * 100}%, 0.05)`);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, 200, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  return new THREE.CanvasTexture(canvas);
}