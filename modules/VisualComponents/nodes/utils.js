// ============================================================
//  nodes/utils.js — 工具函数：随机位置生成 + 缓动函数
// ============================================================
import * as THREE from 'three';

// ==================== 随机位置生成 ====================
export function generateRandomPosition(existing, base = new THREE.Vector3(0, 0, 0)) {
  let pos, safe = false, tries = 0;
  while (!safe && tries < 30) {
    let a1 = Math.random() * Math.PI * 2,
      a2 = Math.random() * Math.PI * 2,
      r = 1.6 + Math.random() * 1.2;
    let off = new THREE.Vector3(Math.sin(a1) * Math.cos(a2) * r,
      Math.sin(a1) * Math.sin(a2) * r * 0.8,
      Math.cos(a1) * r);
    pos = base.clone().add(off);
    let minD = Infinity;
    for (let p of existing) minD = Math.min(minD, pos.distanceTo(p));
    if (minD > 0.9) safe = true;
    tries++;
  }
  return pos;
}

export function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export function easeInBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return c3 * t * t * t - c1 * t * t;
}
