// ============================================================
//  window-manager.js - 统一窗口管理系统
//  管理所有模态框窗口的状态、动画、拖拽、调整大小
//  各窗口模块自行管理 Taskbar（通过 onStateChange 回调）
// ============================================================

/**
 * 窗口状态枚举
 */
const WindowState = {
  MAXIMIZED: 'maximized',
  WINDOWED: 'windowed',
  MINIMIZED: 'minimized'
};

/**
 * 窗口实例类
 */
class WindowInstance {
  constructor(options) {
    this.id = options.id;
    this.title = options.title;
    this.container = options.container;
    this.content = options.content;
    this.header = options.header;
    this.icon = options.icon || '📄';
    this.initialState = options.initialState || WindowState.MAXIMIZED;
    this.resizable = options.resizable !== false;
    this.onClose = options.onClose;
    this.onStateChange = options.onStateChange;

    // 窗口化时保存的位置和尺寸
    this._winLeft = -1;
    this._winTop = -1;
    this._winWidth = null;   // 字符串 '800px' 或 null
    this._winHeight = null;

    // 当前状态
    this._state = null;
    // 最小化前的状态（用于 restore 时恢复到原来的最大化/窗口化）
    this._stateBeforeMinimize = null;

    // 动画引用（用于取消未完成的动画，防止 onfinish 竞态）
    this._minimizeAnim = null;
    this._restoreAnim = null;

    // 拖拽
    this._dragging = false;
    this._dragShiftX = 0;
    this._dragShiftY = 0;

    // 调整大小
    this._resizing = false;
    this._resizeDir = '';
    this._resizeStartX = 0;
    this._resizeStartY = 0;
    this._resizeStartW = 0;
    this._resizeStartH = 0;
    this._resizeStartL = 0;
    this._resizeStartT = 0;

    this._init();
  }

  _init() {
    // 标题栏双击
    if (this.header) {
      this.header.addEventListener('dblclick', (e) => {
        if (e.target.closest('.caption-btn')) return;
        this.toggleMaximize();
      });
    }

    // 标题栏拖拽
    if (this.header) {
      this.header.addEventListener('mousedown', (e) => {
        if (e.target.closest('.caption-btn')) return;
        if (this._state !== WindowState.WINDOWED) return;
        this._startDrag(e);
      });
    }

    // resize handles
    if (this.resizable && this.content) {
      const handles = this.content.querySelectorAll('.win-resize-handle, .modal-resize-handle');
      handles.forEach(handle => {
        handle.addEventListener('mousedown', (e) => {
          if (this._state !== WindowState.WINDOWED) return;
          this._startResize(e, handle.dataset.handle || 'se');
        });
      });
    }

    // 全局事件（只绑一次）
    this._boundMouseMove = (e) => this._onMouseMove(e);
    this._boundMouseUp = (e) => this._onMouseUp(e);
    document.addEventListener('mousemove', this._boundMouseMove);
    document.addEventListener('mouseup', this._boundMouseUp);
  }

  // ==================== 状态 ====================

  getState() { return this._state; }

  setState(newState) {
    const prevState = this._state;
    this._state = newState;

    if (newState === WindowState.MAXIMIZED || newState === WindowState.WINDOWED) {
      // 从最小化恢复 → 用弹入动画
      if (prevState === WindowState.MINIMIZED) {
        this._restoreFromMinimized(newState);
        return;
      }

      // 首次打开（prevState === null）→ 直接应用目标布局，无需 snapshot
      if (prevState === null) {
        this.container.classList.remove(WindowState.MAXIMIZED, WindowState.WINDOWED, WindowState.MINIMIZED, 'closing');
        this.container.classList.add(newState);
        this._applyLayout(newState);
        if (this.onStateChange) this.onStateChange(newState, prevState);
        return;
      }

      // 正常切换 → 先冻结起点，再设目标（让 transition 平滑过渡）
      this._snapshotCurrentPosition();
      this.container.classList.remove(WindowState.MAXIMIZED, WindowState.WINDOWED, WindowState.MINIMIZED, 'closing');
      this.container.classList.add(newState);
      // 安全网：如果容器被残留的 display:none 隐藏，恢复显示
      if (this.container.style.display === 'none') this.container.style.display = 'flex';
      this._applyLayoutWithTransition(newState);

    } else if (newState === WindowState.MINIMIZED) {
      // 记住最小化前的状态，用于 restore 时恢复
      if (prevState === WindowState.MAXIMIZED || prevState === WindowState.WINDOWED) {
        this._stateBeforeMinimize = prevState;
      }
      this._animateMinimize();
    }

    if (this.onStateChange) this.onStateChange(newState, prevState);
  }

  toggleMaximize() {
    if (this._state === WindowState.MAXIMIZED) this.setState(WindowState.WINDOWED);
    else if (this._state === WindowState.WINDOWED) this.setState(WindowState.MAXIMIZED);
    else if (this._state === WindowState.MINIMIZED) this.setState(this._stateBeforeMinimize || WindowState.MAXIMIZED);
  }

  minimize() { if (this._state !== WindowState.MINIMIZED) this.setState(WindowState.MINIMIZED); }

  restore() {
    if (this._state === WindowState.MINIMIZED) {
      this.setState(this._stateBeforeMinimize || WindowState.MAXIMIZED);
    }
  }

  maximize() { this.setState(WindowState.MAXIMIZED); }

  // ==================== 布局 ====================

  _applyLayout(state) {
    const c = this.content;
    if (!c) return;

    if (state === WindowState.MAXIMIZED) {
      c.style.left = '';
      c.style.top = '';
      c.style.width = '';
      c.style.height = '';
      c.style.transform = '';
    } else if (state === WindowState.WINDOWED) {
      c.style.transform = '';

      // 尺寸
      if (this._winWidth && this._winHeight) {
        c.style.width = this._winWidth;
        c.style.height = this._winHeight;
      } else {
        c.style.width = '';
        c.style.height = '';
      }

      // 位置
      if (this._winLeft >= 0 && this._winTop >= 0) {
        c.style.left = this._winLeft + 'px';
        c.style.top = this._winTop + 'px';
      } else {
        // 首次窗口化：用 CSS 默认比例居中
        const tw = this._winWidth ? parseInt(this._winWidth) : Math.round(window.innerWidth * 0.75);
        const th = this._winHeight ? parseInt(this._winHeight) : Math.round(window.innerHeight * 0.8);
        const cx = Math.round((window.innerWidth - tw) / 2);
        const cy = Math.round((window.innerHeight - th) / 2);
        c.style.left = cx + 'px';
        c.style.top = cy + 'px';
        this._winLeft = cx;
        this._winTop = cy;
      }
    }
  }

  /** 冻结当前视觉位置为内联像素值 */
  _snapshotCurrentPosition() {
    if (!this.content) return;
    const r = this.content.getBoundingClientRect();
    const c = this.content;
    c.style.transition = 'none';
    c.style.left = r.left + 'px';
    c.style.top = r.top + 'px';
    c.style.width = r.width + 'px';
    c.style.height = r.height + 'px';
    c.style.transform = '';
    void c.offsetWidth;
  }

  /** 应用目标布局，使用 !important transition 以覆盖 CSS 的 transition:none */
  _applyLayoutWithTransition(state) {
    if (!this.content) return;
    
    // 用 !important 覆盖 .rich-modal.maximized .rich-modal-content 的 transition: none !important
    this.content.style.setProperty('transition',
      'left 0.25s cubic-bezier(0.1, 0.9, 0.2, 1), ' +
      'top 0.25s cubic-bezier(0.1, 0.9, 0.2, 1), ' +
      'width 0.25s cubic-bezier(0.1, 0.9, 0.2, 1), ' +
      'height 0.25s cubic-bezier(0.1, 0.9, 0.2, 1), ' +
      'border-radius 0.25s cubic-bezier(0.1, 0.9, 0.2, 1)',
      'important');
    
    this._applyLayout(state);
    
    // 过渡完成后移除 inline !important transition
    setTimeout(() => {
      if (this.content) this.content.style.removeProperty('transition');
    }, 300);
  }

  // ==================== 动画 ====================

  open(initialState) {
    this.container.style.display = 'flex';
    this.container.classList.remove('closing', 'window-close', 'window-open');
    
    // 先应用目标状态，获取目标尺寸
    this._state = initialState || this.initialState;
    this.container.classList.add(this._state);
    this._applyLayout(this._state);
    
    // 播放打开动画（Windows 原生风格：从 95% 展开，快速淡入）
    // 使用 animate() 直接动画 width/height/left/top，不用 transform:scale（避免 position:fixed 卡顿）
    if (this.content) {
      const targetRect = this.content.getBoundingClientRect();
      const targetW = targetRect.width;
      const targetH = targetRect.height;
      const targetL = targetRect.left;
      const targetT = targetRect.top;
      
      // 起始状态：从中心点开始，尺寸为目标的 95%（几乎不放大，Windows 原生风格）
      const startW = targetW * 0.95;
      const startH = targetH * 0.95;
      const startL = targetL + (targetW - startW) / 2;
      const startT = targetT + (targetH - startH) / 2;
      
      // 设置起始状态
      this.content.style.transition = 'none';
      this.content.style.left = startL + 'px';
      this.content.style.top = startT + 'px';
      this.content.style.width = startW + 'px';
      this.content.style.height = startH + 'px';
      this.content.style.opacity = '0';
      void this.content.offsetWidth;
      
      // 播放动画（200ms，Windows 原生打开速度）
      const anim = this.content.animate([
        { left: startL + 'px', top: startT + 'px', width: startW + 'px', height: startH + 'px', opacity: 0 },
        { left: targetL + 'px', top: targetT + 'px', width: targetW + 'px', height: targetH + 'px', opacity: 1 }
      ], {
        duration: 200,
        easing: 'cubic-bezier(0.16, 1, 0.3, 1)'  // ease-out 曲线，类似 Windows
      });
      
      anim.onfinish = () => {
        this.content.style.transition = '';
        this.content.style.opacity = '';
        // 恢复 CSS 控制的布局（移除内联样式，让 CSS 类接管）
        if (this._state === WindowState.MAXIMIZED) {
          this.content.style.left = '';
          this.content.style.top = '';
          this.content.style.width = '';
          this.content.style.height = '';
        }
      };
    }
    
    WindowManager.bringToFront(this);
  }

  close() {
    // 取消所有进行中的动画，防止 onfinish 竞态
    if (this._minimizeAnim) { this._minimizeAnim.cancel(); this._minimizeAnim = null; }
    if (this._restoreAnim) { this._restoreAnim.cancel(); this._restoreAnim = null; }

    if (this._state === WindowState.MINIMIZED) {
      this.container.style.display = 'none';
      this.container.classList.remove(WindowState.MINIMIZED);
      this._state = null;
      if (this.onClose) this.onClose();
    } else if (this.content) {
      // 播放关闭动画（Windows 原生风格：几乎不缩小，快速淡出）
      const targetRect = this.content.getBoundingClientRect();
      const targetW = targetRect.width;
      const targetH = targetRect.height;
      const targetL = targetRect.left;
      const targetT = targetRect.top;

      // 结束状态：缩小到中心的 95%（几乎不缩小，Windows 原生风格）
      const endW = targetW * 0.95;
      const endH = targetH * 0.95;
      const endL = targetL + (targetW - endW) / 2;
      const endT = targetT + (targetH - endH) / 2;

      // 移除可能残留的 window-open 类
      this.container.classList.remove('window-open');
      this.container.classList.add('closing');

      // 设置起始状态
      this.content.style.transition = 'none';

      // 播放动画（150ms，Windows 原生关闭速度）
      const anim = this.content.animate([
        { left: targetL + 'px', top: targetT + 'px', width: targetW + 'px', height: targetH + 'px', opacity: 1 },
        { left: endL + 'px', top: endT + 'px', width: endW + 'px', height: endH + 'px', opacity: 0 }
      ], {
        duration: 150,
        easing: 'cubic-bezier(0.4, 0, 0.6, 1)'  // ease-in
      });

      const finishClose = () => {
        this.container.classList.remove('closing', WindowState.MAXIMIZED, WindowState.WINDOWED);
        this.container.style.display = 'none';
        this.content.style.transition = '';
        this._state = null;
        if (this.onClose) this.onClose();
      };

      anim.onfinish = finishClose;
      // 兜底
      setTimeout(finishClose, 200);
    } else {
      // 无 content 时直接关闭
      this.container.classList.remove(WindowState.MAXIMIZED, WindowState.WINDOWED);
      this.container.style.display = 'none';
      this._state = null;
      if (this.onClose) this.onClose();
    }
  }

  _getTaskbarTab() {
    return document.querySelector(`.taskbar-tab[data-editor-key="${this.id}"]`);
  }

  _animateMinimize() {
    const c = this.content;
    const tab = this._getTaskbarTab();

    // 取消正在进行的恢复动画
    if (this._restoreAnim) { this._restoreAnim.cancel(); this._restoreAnim = null; }

    if (!tab) {
      this.container.style.display = 'none';
      this.container.classList.add(WindowState.MINIMIZED);
      return;
    }

    c.style.transition = 'none';
    c.style.transform = '';

    const sr = c.getBoundingClientRect();
    const tr = tab.getBoundingClientRect();
    const dx = (tr.left + tr.width / 2) - (sr.left + sr.width / 2);
    const dy = (tr.top + tr.height / 2) - (sr.top + sr.height / 2);
    const scale = Math.min(40 / sr.width, 20 / sr.height);

    const anim = c.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: `translate(${dx}px,${dy}px) scale(${scale})`, opacity: 0.1 }
    ], { duration: 220, easing: 'cubic-bezier(0.7,0,0.8,0.3)' });

    this._minimizeAnim = anim;
    anim.onfinish = () => {
      // 守卫：如果已被新动画取代（cancel 不会触发 onfinish，但已排队的会），跳过
      if (this._minimizeAnim !== anim) return;
      this._minimizeAnim = null;
      c.style.transition = '';
      this.container.style.display = 'none';
      this.container.classList.add(WindowState.MINIMIZED);
    };
  }

  _restoreFromMinimized(targetState) {
    const c = this.content;
    const tab = this._getTaskbarTab();

    // 取消正在进行的最小化动画，防止其 onfinish 覆盖恢复后的 DOM 状态
    if (this._minimizeAnim) { this._minimizeAnim.cancel(); this._minimizeAnim = null; }

    // 先设好目标布局
    c.style.transition = 'none';
    c.style.transform = '';
    this.container.classList.remove(WindowState.MINIMIZED);
    this.container.style.display = 'flex';
    this.container.classList.add(targetState);
    this._applyLayout(targetState);
    void c.offsetWidth;

    if (!tab) {
      c.style.transition = '';
      if (this.onStateChange) this.onStateChange(targetState, WindowState.MINIMIZED);
      return;
    }

    // 弹入动画
    const targetR = c.getBoundingClientRect();
    const tabR = tab.getBoundingClientRect();
    const dx = (tabR.left + tabR.width / 2) - (targetR.left + targetR.width / 2);
    const dy = (tabR.top + tabR.height / 2) - (targetR.top + targetR.height / 2);
    const scale = Math.min(40 / targetR.width, 20 / targetR.height);

    const anim = c.animate([
      { transform: `translate(${dx}px,${dy}px) scale(${scale})`, opacity: 0.1 },
      { transform: 'translate(0,0) scale(1)', opacity: 1 }
    ], { duration: 250, easing: 'cubic-bezier(0.1,0.9,0.2,1)' });

    this._restoreAnim = anim;
    anim.onfinish = () => {
      if (this._restoreAnim !== anim) return;
      this._restoreAnim = null;
      c.style.transition = '';
    };
    if (this.onStateChange) this.onStateChange(targetState, WindowState.MINIMIZED);
  }

  // ==================== 拖拽 ====================

  _startDrag(e) {
    const r = this.content.getBoundingClientRect();
    this._dragging = true;
    this._dragShiftX = e.clientX - r.left;
    this._dragShiftY = e.clientY - r.top;

    this.content.style.transition = 'none';
    this.content.style.left = r.left + 'px';
    this.content.style.top = r.top + 'px';
    this.content.style.transform = '';

    document.body.style.cursor = 'grabbing';
    e.preventDefault();
  }

  _onDrag(e) {
    if (!this._dragging) return;
    const l = e.clientX - this._dragShiftX;
    const t = e.clientY - this._dragShiftY;
    this.content.style.left = l + 'px';
    this.content.style.top = t + 'px';
    this._winLeft = l;
    this._winTop = t;
  }

  _endDrag() {
    if (!this._dragging) return;
    this._dragging = false;
    this.content.style.transition = '';
    document.body.style.cursor = '';
    // 保存尺寸
    this._winWidth = this.content.style.width || (this.content.offsetWidth + 'px');
    this._winHeight = this.content.style.height || (this.content.offsetHeight + 'px');
  }

  // ==================== 调整大小 ====================

  _startResize(e, dir) {
    this._resizing = true;
    this._resizeDir = dir;
    this._resizeStartX = e.clientX;
    this._resizeStartY = e.clientY;

    const r = this.content.getBoundingClientRect();
    this._resizeStartW = r.width;
    this._resizeStartH = r.height;
    this._resizeStartL = r.left;
    this._resizeStartT = r.top;

    this.content.style.transition = 'none';
    this.content.style.left = r.left + 'px';
    this.content.style.top = r.top + 'px';
    this.content.style.width = r.width + 'px';
    this.content.style.height = r.height + 'px';
    this.content.style.transform = '';

    e.preventDefault();
  }

  _onResize(e) {
    if (!this._resizing) return;
    const dx = e.clientX - this._resizeStartX;
    const dy = e.clientY - this._resizeStartY;
    const d = this._resizeDir;

    let nw = this._resizeStartW, nh = this._resizeStartH;
    let nl = this._resizeStartL, nt = this._resizeStartT;

    if (d.includes('e')) nw += dx;
    if (d.includes('w')) { nw -= dx; nl += dx; }
    if (d.includes('s')) nh += dy;
    if (d.includes('n')) { nh -= dy; nt += dy; }

    if (nw < 400) { if (d.includes('w')) nl = this._resizeStartL + this._resizeStartW - 400; nw = 400; }
    if (nh < 300) { if (d.includes('n')) nt = this._resizeStartT + this._resizeStartH - 300; nh = 300; }

    this.content.style.left = nl + 'px';
    this.content.style.top = nt + 'px';
    this.content.style.width = nw + 'px';
    this.content.style.height = nh + 'px';

    this._winLeft = nl;
    this._winTop = nt;
    this._winWidth = nw + 'px';
    this._winHeight = nh + 'px';
  }

  _endResize() {
    if (!this._resizing) return;
    this._resizing = false;
    this.content.style.transition = '';
  }

  // ==================== 全局事件 ====================

  _onMouseMove(e) {
    if (this._dragging) this._onDrag(e);
    if (this._resizing) this._onResize(e);
  }

  _onMouseUp(e) {
    this._endDrag();
    this._endResize();
  }

  // ==================== 标题 ====================

  setTitle(title) {
    this.title = title;
    const el = this.container.querySelector('.rich-modal-header h2');
    if (el) el.textContent = title;
    const tabLabel = document.querySelector(`.taskbar-tab[data-editor-key="${this.id}"] .tab-label`);
    if (tabLabel) tabLabel.textContent = title;
  }
}

/**
 * 窗口管理器（全局单例）
 */
const WindowManager = {
  _windows: new Map(),
  _topZIndex: 1500, // 模态框 z-index 从 1500 起，低于任务栏 2000
  _registeredElements: new Map(), // el → mousedown handler

  create(options) {
    const win = new WindowInstance(options);
    this._windows.set(options.id, win);
    return win;
  },

  get(id) { return this._windows.get(id); },

  /**
   * 统一置顶方法，支持 WindowInstance 或 DOM 元素
   * 所有模态框/窗口共享同一个 z-index 计数器，点击谁谁在最上面
   */
  bringToFront(target) {
    this._topZIndex++;
    // 上限 1999，不超过任务栏 z-index: 2000
    if (this._topZIndex >= 2000) this._topZIndex = 1501;
    const el = (target instanceof WindowInstance) ? target.container : target;
    if (el) el.style.zIndex = this._topZIndex;
  },

  /**
   * 注册 DOM 元素，点击时自动置顶
   * 用于非 WindowInstance 的模态框（如笔记编辑器、版本图等）
   * @param {HTMLElement} el - 要注册的元素
   * @param {Function} [onToFront] - 置顶时的回调，参数为新 z-index
   */
  registerElement(el, onToFront) {
    if (!el || this._registeredElements.has(el)) return;
    const handler = () => {
      this.bringToFront(el);
      if (onToFront) onToFront(this._topZIndex);
    };
    el.addEventListener('mousedown', handler);
    this._registeredElements.set(el, { handler, onToFront });
  },

  /**
   * 取消注册
   */
  unregisterElement(el) {
    const entry = this._registeredElements.get(el);
    if (entry) {
      el.removeEventListener('mousedown', entry.handler);
      this._registeredElements.delete(el);
    }
  },

  destroy(id) { this._windows.delete(id); }
};

// 导出
window.WindowState = WindowState;
window.WindowManager = WindowManager;

console.log('[window-manager] 模块已加载');