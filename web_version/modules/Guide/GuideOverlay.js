// ============================================================
//  GuideOverlay.js — DOM 遮罩层 + SVG 高亮裁剪 + 气泡渲染
// ============================================================

/**
 * 引导遮罩叠加层
 * 负责：全屏半透明遮罩、SVG clip-path 高亮、浮动气泡
 */
export class GuideOverlay {
  constructor() {
    this.overlay = null;
    this.svgMask = null;
    this.highlightRect = null;
    this.bubble = null;
    this._resizeHandler = null;
    this._currentTarget = null;
    this._position = 'bottom';
    this._visible = false;
    this._rect = { x: 0, y: 0, w: 0, h: 0, r: 12 };
  }

  /** 创建 DOM 结构并挂载到 body */
  mount() {
    // 创建遮罩容器
    this.overlay = document.createElement('div');
    this.overlay.id = 'guideOverlay';
    this.overlay.className = 'guide-overlay';
    this.overlay.innerHTML = `
      <svg class="guide-svg-mask" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <mask id="guideHighlightMask">
            <rect width="100%" height="100%" fill="white" />
            <rect id="guideHighlightCutout" x="0" y="0" width="0" height="0" rx="12" ry="12" fill="black" />
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.35)" mask="url(#guideHighlightMask)" />
        <!-- 高亮边框 -->
        <rect id="guideHighlightBorder" x="0" y="0" width="0" height="0" rx="12" ry="12"
              fill="none" stroke="rgba(0,255,255,0.6)" stroke-width="2" />
      </svg>
      <div class="guide-bubble" id="guideBubble">
        <div class="guide-bubble-arrow"></div>
        <div class="guide-bubble-header">
          <span class="guide-bubble-title" id="guideBubbleTitle"></span>
          <span class="guide-bubble-progress" id="guideBubbleProgress"></span>
        </div>
        <div class="guide-bubble-body" id="guideBubbleBody"></div>
        <div class="guide-bubble-footer">
          <button class="guide-btn guide-btn-skip" id="guideSkipBtn">跳过</button>
          <div class="guide-nav-btns">
            <button class="guide-btn guide-btn-next" id="guideNextBtn">下一步 →</button>
          </div>
        </div>
        <!-- 成功反馈层 -->
        <div class="guide-success-overlay" id="guideSuccessOverlay" style="display:none;">
          <div class="guide-success-icon">✅</div>
          <div class="guide-success-text">完成！</div>
        </div>
      </div>
    `;
    document.body.appendChild(this.overlay);

    // 缓存关键元素引用
    this.svgMask = this.overlay.querySelector('.guide-svg-mask');
    this.overlayRect = this.svgMask?.querySelector('rect[fill]');
    this.highlightCutout = this.overlay.querySelector('#guideHighlightCutout');
    this.highlightBorder = this.overlay.querySelector('#guideHighlightBorder');
    this.bubble = this.overlay.querySelector('#guideBubble');
    this.titleEl = this.overlay.querySelector('#guideBubbleTitle');
    this.progressEl = this.overlay.querySelector('#guideBubbleProgress');
    this.bodyEl = this.overlay.querySelector('#guideBubbleBody');
    this.bubbleArrow = this.overlay.querySelector('.guide-bubble-arrow');

    // resize 跟随
    this._resizeHandler = () => this._updateHighlight();
    window.addEventListener('resize', this._resizeHandler);

    // 初始隐藏
    this.overlay.style.display = 'none';
  }

  /** 销毁 DOM */
  destroy() {
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
      this._resizeHandler = null;
    }
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }
    this.overlay = null;
    this.bubble = null;
    this.svgMask = null;
  }

  /** 设置按钮引用（供 Guide/index.js 绑定事件） */
  getButtons() {
    return {
      skip: this.overlay?.querySelector('#guideSkipBtn'),
      prev: this.overlay?.querySelector('#guidePrevBtn'),
      next: this.overlay?.querySelector('#guideNextBtn'),
      close: null, // modal 模式动态创建
    };
  }

  /** 显示遮罩 */
  show() {
    if (!this.overlay) return;
    this.overlay.style.display = '';
    this._visible = true;
    // 默认不拦截点击（action 步骤需要透传鼠标事件到 3D 场景）
    this.overlay.classList.remove('guide-block-clicks');
    requestAnimationFrame(() => {
      this.overlay.style.opacity = '1';
    });
  }

  /** 隐藏遮罩 */
  hide() {
    if (!this.overlay) return;
    this.overlay.style.opacity = '0';
    this._visible = false;
    const onTransEnd = () => {
      this.overlay.style.display = 'none';
      this.overlay.removeEventListener('transitionend', onTransEnd);
    };
    this.overlay.addEventListener('transitionend', onTransEnd);
    setTimeout(() => {
      if (!this._visible) this.overlay.style.display = 'none';
    }, 600);
  }

  /** modal 步骤需要拦截背景点击，action/3d 步骤需要透传 */
  setBlockClicks(block) {
    if (!this.overlay) return;
    if (block) {
      this.overlay.classList.add('guide-block-clicks');
    } else {
      this.overlay.classList.remove('guide-block-clicks');
    }
  }

  /**
   * 高亮一个 DOM 元素（气泡始终固定在左侧，通过 SVG 切窗 + 箭头连线指示目标）
   * @param {string|null} selector - CSS 选择器，null 则不显示高亮
   */
  highlight(selector) {
    if (!selector) {
      this._hideHighlight();
      this._currentTarget = null;
      this._positionBubble(null);
      return;
    }

    const el = document.querySelector(selector);
    if (!el) {
      this._hideHighlight();
      this._positionBubble(null);
      return;
    }

    this._currentTarget = el;
    this._updateHighlight();
  }

  /** 更新高亮窗口位置 */
  _updateHighlight() {
    if (!this._currentTarget) {
      this._hideHighlight();
      this._positionBubble(null);
      return;
    }

    const rect = this._currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      this._hideHighlight();
      this._positionBubble(null);
      return;
    }

    // 高亮区域留 8px 内边距
    const pad = 8;
    this._rect = {
      x: rect.left - pad,
      y: rect.top - pad,
      w: rect.width + pad * 2,
      h: rect.height + pad * 2,
      r: 10,
    };

    // 更新 SVG mask 裁剪区域
    if (this.highlightCutout) {
      this.highlightCutout.setAttribute('x', this._rect.x);
      this.highlightCutout.setAttribute('y', this._rect.y);
      this.highlightCutout.setAttribute('width', this._rect.w);
      this.highlightCutout.setAttribute('height', this._rect.h);
      this.highlightCutout.setAttribute('rx', this._rect.r);
      this.highlightCutout.setAttribute('ry', this._rect.r);
    }

    // 更新高亮边框
    if (this.highlightBorder) {
      this.highlightBorder.setAttribute('x', this._rect.x);
      this.highlightBorder.setAttribute('y', this._rect.y);
      this.highlightBorder.setAttribute('width', this._rect.w);
      this.highlightBorder.setAttribute('height', this._rect.h);
      this.highlightBorder.setAttribute('rx', this._rect.r);
      this.highlightBorder.setAttribute('ry', this._rect.r);
    }

    // 更新 SVG 尺寸
    if (this.svgMask) {
      this.svgMask.setAttribute('width', window.innerWidth);
      this.svgMask.setAttribute('height', window.innerHeight);
    }

    this._positionBubble(this._rect);
  }

  /** 隐藏高亮窗口 */
  _hideHighlight() {
    this._rect = { x: 0, y: 0, w: 0, h: 0, r: 12 };
    if (this.highlightCutout) {
      this.highlightCutout.setAttribute('width', '0');
      this.highlightCutout.setAttribute('height', '0');
    }
    if (this.highlightBorder) {
      this.highlightBorder.setAttribute('width', '0');
      this.highlightBorder.setAttribute('height', '0');
    }
    // 清理箭头
    if (this._arrowLine) { this._arrowLine.remove(); this._arrowLine = null; }
    if (this._arrowHead) { this._arrowHead.remove(); this._arrowHead = null; }
  }

  /**
   * 定位气泡 — 始终固定在屏幕左侧
   * 有目标时额外绘制箭头连线从气泡到高亮切窗
   */
  _positionBubble(targetRect) {
    if (!this.bubble) return;

    this.bubble.classList.remove('pos-top', 'pos-bottom', 'pos-left', 'pos-right', 'pos-center', 'pos-top-half');

    // 有高亮目标 → 正常遮罩深度；无目标 → 更透明
    if (this.overlayRect) {
      this.overlayRect.setAttribute('fill', targetRect ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.15)');
    }

    // 始终固定在左侧
    this.bubble.classList.add('pos-center');
    this.bubble.style.top = '50%';
    this.bubble.style.left = '5%';
    this.bubble.style.transform = 'translate(0, -50%)';
    this.bubble.style.maxWidth = '420px';
    this.bubbleArrow.style.display = 'none';

    // 绘制箭头连线（从气泡右侧到目标切窗）
    this._updateArrowLine(targetRect);
  }

  /** 绘制 SVG 箭头连线：气泡右侧边缘 → 高亮切窗中心 */
  _updateArrowLine(targetRect) {
    // 移除旧箭头
    if (this._arrowLine) { this._arrowLine.remove(); this._arrowLine = null; }
    if (!targetRect || !this.svgMask) return;

    const bw = this.bubble.offsetWidth || 420;
    const bh = this.bubble.offsetHeight || 200;
    const bubbleLeft = parseInt(this.bubble.style.left, 10) || 0;
    const bubbleTop = parseInt(this.bubble.style.top, 10) || 0;

    // 气泡右侧中点（简化：translate(0,-50%) 后 bubbleTop 是中心，此句为顶部位置）
    // 实际气泡顶部 = 50% - bh/2，右侧边缘 = bubbleLeft + bw
    const bubbleRight = bubbleLeft + bw;
    const bubbleCenterY = bubbleTop;  // top:50% + translate(0,-50%) 后这里就是垂直中点

    // 目标切窗中心
    const targetX = targetRect.x + targetRect.w / 2;
    const targetY = targetRect.y + targetRect.h / 2;

    // 绘制曲线：用二次贝塞尔，控制点偏移
    const cpx = bubbleRight + (targetX - bubbleRight) * 0.4;
    const cpy = bubbleCenterY;
    const pathD = `M ${bubbleRight} ${bubbleCenterY} Q ${cpx} ${cpy}, ${targetX} ${targetY}`;

    const ns = 'http://www.w3.org/2000/svg';
    const arrow = document.createElementNS(ns, 'path');
    arrow.setAttribute('d', pathD);
    arrow.setAttribute('fill', 'none');
    arrow.setAttribute('stroke', 'rgba(0,255,255,0.5)');
    arrow.setAttribute('stroke-width', '2');
    arrow.setAttribute('stroke-dasharray', '6 4');
    arrow.setAttribute('pointer-events', 'none');

    // 目标端箭头三角
    const arrowSize = 8;
    const angle = Math.atan2(targetY - bubbleCenterY, targetX - bubbleRight);
    const tip = `${targetX},${targetY}`;
    const p1 = `${targetX - arrowSize * Math.cos(angle - 0.5)},${targetY - arrowSize * Math.sin(angle - 0.5)}`;
    const p2 = `${targetX - arrowSize * Math.cos(angle + 0.5)},${targetY - arrowSize * Math.sin(angle + 0.5)}`;
    const arrowHead = document.createElementNS(ns, 'polygon');
    arrowHead.setAttribute('points', `${tip} ${p1} ${p2}`);
    arrowHead.setAttribute('fill', 'rgba(0,255,255,0.7)');
    arrowHead.setAttribute('pointer-events', 'none');

    // 将箭头插入 SVG
    this.svgMask.appendChild(arrow);
    this.svgMask.appendChild(arrowHead);
    this._arrowLine = arrow;  // 保存引用，方便下次移除时一并清理
    this._arrowHead = arrowHead;
  }

  /** 隐藏高亮窗口 */
  _hideHighlight() {
    this._rect = { x: 0, y: 0, w: 0, h: 0, r: 12 };
    if (this.highlightCutout) {
      this.highlightCutout.setAttribute('width', '0');
      this.highlightCutout.setAttribute('height', '0');
    }
    if (this.highlightBorder) {
      this.highlightBorder.setAttribute('width', '0');
      this.highlightBorder.setAttribute('height', '0');
    }
    // 清理箭头
    if (this._arrowLine) { this._arrowLine.remove(); this._arrowLine = null; }
    if (this._arrowHead) { this._arrowHead.remove(); this._arrowHead = null; }
  }

  /**
   * 更新气泡内容
   * @param {object} step - 引导步骤对象
   * @param {string} progress - 进度文字，如 "3 / 18"
   */
  updateContent(step, progress) {
    if (this.titleEl) this.titleEl.textContent = step.title;
    if (this.progressEl) this.progressEl.textContent = progress;
    if (this.bodyEl) {
      this.bodyEl.innerHTML = step.html || `<p style="font-size:14px;color:#cde;">${step.text}</p>`;
    }
  }

  /**
   * 更新按钮状态
   * @param {boolean} isModal - 是否为 modal 步骤（只有单个按钮）
   * @param {boolean} isLast - 是否最后一步
   * @param {string} btnText - 按钮文字（modal 步骤可用）
   */
  updateButtons(isModal, isLast, btnText) {
    const skipBtn = this.overlay?.querySelector('#guideSkipBtn');
    const nextBtn = this.overlay?.querySelector('#guideNextBtn');

    // modal 步骤：不显示跳过按钮，next 按钮使用自定义文字
    if (skipBtn) {
      skipBtn.style.display = isModal ? 'none' : '';
    }
    if (nextBtn) {
      if (isModal && btnText) {
        nextBtn.textContent = btnText;
        nextBtn.classList.add('guide-btn-action');
      } else if (isModal) {
        nextBtn.textContent = '下一步 →';
        nextBtn.classList.add('guide-btn-action');
      } else if (isLast) {
        nextBtn.textContent = '完成 ✨';
        nextBtn.classList.add('guide-btn-finish');
      } else {
        nextBtn.textContent = '下一步 →';
        nextBtn.classList.remove('guide-btn-finish', 'guide-btn-action');
      }
      // action 步骤：隐藏手动 next 按钮
      nextBtn.style.display = isModal ? '' : 'none';
    }
  }

  /**
   * 显示操作完成的成功反馈动画
   * @param {Function} onDone - 动画完成后的回调
   */
  showSuccess(onDone) {
    const successOverlay = this.overlay?.querySelector('#guideSuccessOverlay');
    const bubble = this.bubble;
    if (!successOverlay || !bubble) {
      if (onDone) setTimeout(onDone, 600);
      return;
    }

    // 隐藏 footer
    const footer = bubble.querySelector('.guide-bubble-footer');
    if (footer) footer.style.opacity = '0';

    // 显示成功反馈
    successOverlay.style.display = 'flex';
    successOverlay.classList.add('guide-success-show');

    // 0.9s 后回调
    setTimeout(() => {
      successOverlay.classList.remove('guide-success-show');
      successOverlay.style.display = 'none';
      if (footer) footer.style.opacity = '';
      if (onDone) onDone();
    }, 900);
  }

  /** 获取是否可见 */
  get visible() {
    return this._visible;
  }
}
