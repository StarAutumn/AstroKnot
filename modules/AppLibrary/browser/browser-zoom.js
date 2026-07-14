// ============================================================
//  browser/browser-zoom.js — 缩放控制
//  调用 webview.setZoomLevel，每个标签独立记录
// ============================================================

const ZOOM_STEP = 0.1;  // 每次 ±10%
const ZOOM_MIN = 0.3;
const ZOOM_MAX = 3.0;

export class BrowserZoom {
  /**
   * @param {Object} opts
   * @param {HTMLButtonElement} opts.zoomOutBtn - 缩小按钮
   * @param {HTMLElement}       opts.zoomLevel  - 百分比显示
   * @param {HTMLButtonElement} opts.zoomInBtn  - 放大按钮
   * @param {Function} opts.getActiveTab        - 获取当前活跃标签
   * @param {Function} opts.getActiveTabId       - 获取当前活跃标签 ID
   */
  constructor({ zoomOutBtn, zoomLevel, zoomInBtn, getActiveTab, getActiveTabId }) {
    this._zoomLevelEl = zoomLevel;
    this._getActiveTab = getActiveTab;
    this._getActiveTabId = getActiveTabId;
    this._levels = new Map(); // tabId → zoomLevel

    zoomInBtn.addEventListener('click', () => this.zoomIn());
    zoomOutBtn.addEventListener('click', () => this.zoomOut());
    zoomLevel.addEventListener('click', () => this.reset());
  }

  /** 放大 */
  zoomIn() { this._setDelta(ZOOM_STEP); }

  /** 缩小 */
  zoomOut() { this._setDelta(-ZOOM_STEP); }

  /** 重置到 100% */
  reset() {
    const tabId = this._getActiveTabId();
    const tab = this._getActiveTab();
    if (!tab || !tab.ready) return;
    this._levels.set(tabId, 0);
    try { tab.webview.setZoomLevel(0); } catch (_) {}
    this.updateDisplay();
  }

  /** 更新缩放显示（切换标签时调用） */
  updateDisplay() {
    const tabId = this._getActiveTabId();
    const level = this._levels.get(tabId) || 0;
    const pct = Math.round((1 + level) * 100);
    this._zoomLevelEl.textContent = pct + '%';
    this._zoomLevelEl.style.opacity = pct === 100 ? '0.5' : '1';
  }

  _setDelta(delta) {
    const tabId = this._getActiveTabId();
    const tab = this._getActiveTab();
    if (!tab || !tab.ready) return;
    const current = this._levels.get(tabId) || 0;
    const newLevel = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, current + delta));
    this._levels.set(tabId, newLevel);
    try { tab.webview.setZoomLevel(newLevel); } catch (_) {}
    this.updateDisplay();
  }
}
