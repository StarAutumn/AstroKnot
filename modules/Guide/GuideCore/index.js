// ============================================================
//  GuideCore/index.js — 新手引导状态机（主入口，对外导出不变）
//  每一步都要求用户亲手操作，检测到正确操作后自动进入下一步
// ------------------------------------------------------------
//  拆分后的文件夹结构：
//    steps.js           STEPS 步骤定义数组（+ KBD 模板函数）
//    action-detector.js ActionDetector 检测资源管理类
//    detection.js       GuideStateMachine 的操作检测方法集（原型混入）
//    index.js           状态机壳（状态/导航/事件/持久化）+ 出口函数
// ------------------------------------------------------------

import { STEPS } from './steps.js';
import { ActionDetector } from './action-detector.js';
import { guideDetectionMethods } from './detection.js';

const GUIDE_BASE_KEY = 'astroknot_guide_completed';
const GUIDE_STEP_BASE_KEY = 'astroknot_guide_current_step';

/** 获取带版本号的存储键，版本不同则自动重置教程 */
function _versionKey(base) {
  const v = (window.api && window.api.appVersion) || '0.0.0';
  return `${base}_v${v}`;
}
function _completedKey() { return _versionKey(GUIDE_BASE_KEY); }
function _stepKey()     { return _versionKey(GUIDE_STEP_BASE_KEY); }

// ================================================================
//  引导状态机
// ================================================================
class GuideStateMachine {
  constructor() {
    this.steps = STEPS;
    this.currentIndex = 0;
    this.completed = false;
    this.active = false;
    this._listeners = {};
    this._detector = new ActionDetector();
    this._origControlsState = null;
  }

  get currentStep() { return this.steps[this.currentIndex]; }
  get totalSteps()   { return this.steps.length; }
  get progress()     { return `${this.currentIndex + 1} / ${this.totalSteps}`; }

  // ---- localStorage ----
  load() {
    this.completed = localStorage.getItem(_completedKey()) === 'true';
    const saved = localStorage.getItem(_stepKey());
    if (saved !== null) {
      const idx = parseInt(saved, 10);
      if (!isNaN(idx) && idx >= 0 && idx < this.totalSteps) this.currentIndex = idx;
    }
  }
  save() {
    localStorage.setItem(_completedKey(), this.completed ? 'true' : 'false');
    localStorage.setItem(_stepKey(), String(this.currentIndex));
  }
  markCompleted() { this.completed = true; this.save(); }

  // ---- 导航 ----
  start() { this.load(); if (this.completed) return false; this.currentIndex = 0; this.active = true; this.save(); return true; }
  next() {
    if (this.currentIndex < this.totalSteps - 1) { this.currentIndex++; this.save(); return true; }
    this.markCompleted(); this.active = false; return false;
  }
  prev() { if (this.currentIndex > 0) { this.currentIndex--; this.save(); return true; } return false; }
  skip() { this.markCompleted(); this.active = false; }

  /** 跳转到指定步骤（用于调试/测试，跳过中间步骤的检测） */
  goToStep(index) {
    if (index >= 0 && index < this.totalSteps) {
      this.currentIndex = index;
      this.active = true;
      this.save();
      return true;
    }
    console.warn(`[Guide] goToStep: 无效步骤索引 ${index}，有效范围 0-${this.totalSteps - 1}`);
    return false;
  }

  // ---- 事件 ----
  on(event, handler) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(handler);
  }
  off(event, handler) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(h => h !== handler);
  }
  emit(event, ...args) {
    if (!this._listeners[event]) return;
    for (const h of this._listeners[event]) h(...args);
  }
}

// 操作检测方法集（startDetection/stopDetection/controls 管理/destroy）混入
Object.assign(GuideStateMachine.prototype, guideDetectionMethods);

// ---- 单例 ----
let _instance = null;

export function getGuideStateMachine() {
  if (!_instance) _instance = new GuideStateMachine();
  return _instance;
}

export function isGuideCompleted() {
  return localStorage.getItem(_completedKey()) === 'true';
}

export function resetGuide() {
  localStorage.removeItem(_completedKey());
  localStorage.removeItem(_stepKey());
  if (_instance) {
    _instance.completed = false;
    _instance.currentIndex = 0;
    _instance.active = false;
  }
}
