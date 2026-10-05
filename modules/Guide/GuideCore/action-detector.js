// ============================================================
//  GuideCore/action-detector.js — 操作检测器（ActionDetector）
//  统一管理各种用户操作的检测逻辑
//  （自 GuideCore.js 逐字迁移）
// ============================================================

export class ActionDetector {
  constructor() {
    this._intervals = [];
    this._observers = [];
    this._eventListeners = [];
    this._cleanupFns = [];
    this._initialValues = {};
    this._prevValue = {};
  }

  /** 记录初始状态（用于变化检测） */
  snapshot(key, value) {
    this._initialValues[key] = value;
  }

  /** 轮询检测（每 300ms 检查一次） */
  poll(conditionFn, onDetected, key) {
    const id = setInterval(() => {
      try {
        if (conditionFn()) {
          clearInterval(id);
          const idx = this._intervals.indexOf(id);
          if (idx >= 0) this._intervals.splice(idx, 1);
          onDetected();
        }
      } catch (e) { /* ignore */ }
    }, 300);
    this._intervals.push(id);
    return id;
  }

  /** DOM 属性变化观察 */
  observeStyle(el, onDetected) {
    if (!el) return null;
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.attributeName === 'style' || m.attributeName === 'class') {
          observer.disconnect();
          onDetected();
          return;
        }
      }
    });
    observer.observe(el, { attributes: true, attributeFilter: ['style', 'class'] });
    this._observers.push(observer);
    return observer;
  }

  /** DOM 事件监听（一次性） */
  listenOnce(el, event, onDetected) {
    if (!el) return null;
    const handler = () => {
      el.removeEventListener(event, handler);
      onDetected();
    };
    el.addEventListener(event, handler);
    this._eventListeners.push({ el, event, handler });
    return handler;
  }

  /** 注册清理函数 */
  onCleanup(fn) {
    this._cleanupFns.push(fn);
  }

  /** 清理所有监听 */
  cleanup() {
    for (const id of this._intervals) clearInterval(id);
    this._intervals = [];
    for (const ob of this._observers) ob.disconnect();
    this._observers = [];
    for (const { el, event, handler } of this._eventListeners) {
      el.removeEventListener(event, handler);
    }
    this._eventListeners = [];
    for (const fn of this._cleanupFns) fn();
    this._cleanupFns = [];
    this._initialValues = {};
  }
}
