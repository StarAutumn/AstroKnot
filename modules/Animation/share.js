// ============================================================
//  模块14：动画共享常量（由 module14_Animation.js 拆分）
//  极简/华丽模式颜色常量 + 复用临时向量/颜色，避免每帧每节点 new 造成 GC 压力
// ============================================================
import * as THREE from 'three';

// 极简模式颜色常量（避免每帧每节点 new THREE.Color() 造成 GC 压力）
export const _SIMPLE_COL_SEL = new THREE.Color(0xFFD700);
export const _SIMPLE_COL_STEP = new THREE.Color(0xAA44FF);
export const _SIMPLE_COL_CONN = new THREE.Color(0x4488FF);
export const _SIMPLE_COL_DEFAULT = new THREE.Color(0xaaddff);

// 华丽模式 fixedColor 分支颜色常量
export const _FIXED_COL_STEP = new THREE.Color(0xAA44FF);
export const _FIXED_COL_CONN = new THREE.Color(0x4488FF);

// 华丽模式选中/连接状态颜色常量（避免每帧每节点 setHex 重复解析）
export const _LUXE_COL_SEL = new THREE.Color(0xFFD700);
export const _LUXE_COL_SEL_GLOW = new THREE.Color(0xFFAA55);
export const _LUXE_COL_SEL_RING = new THREE.Color(0xFFCC44);
export const _LUXE_COL_SEL_SURF = new THREE.Color(0xFFAA33);
export const _LUXE_COL_STEP = new THREE.Color(0xAA44FF);
export const _LUXE_COL_CONN = new THREE.Color(0x4488FF);

// 复用临时向量/颜色，避免每帧每节点 new
export const _camForward = new THREE.Vector3();
export const _tmpToNode = new THREE.Vector3();
export const _tmpColor = new THREE.Color();
export const _tmpRingColor = new THREE.Color();