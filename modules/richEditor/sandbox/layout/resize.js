// ============================================================
//  sandbox-resize.js — 面板尺寸调整（拖拽 Resize Handle）
//  从原沙盒 IDE 拆分：侧边栏等面板的拖拽缩放
// ============================================================

export class SandboxResize {
  /**
   * @param {import('../core/context').SandboxContext} ctx - 沙箱共享上下文
   */
  constructor(ctx) {
    /** @private */
    this._ctx = ctx;
  }

  // ════════════════════════════════════════════════════════════
  //  生命周期
  // ════════════════════════════════════════════════════════════

  /** 初始化模块，绑定 resize 手柄事件 */
  init() {
    this._initResizeHandles();
  }

  /** 销毁模块（无持久状态需清理） */
  destroy() {
    // no-op
  }

  // ════════════════════════════════════════════════════════════
  //  Resize Handle 绑定
  // ════════════════════════════════════════════════════════════

  _initResizeHandles() {
    const content = this._ctx.content;
    const sidebarHandle = content ? content.querySelector('.sandbox-resize-sidebar') : null;
    if (sidebarHandle) this._initSingleResize(sidebarHandle, 'sidebar');
  }

  /**
   * 初始化单个 resize 手柄
   * @param {HTMLElement} handle - 拖拽手柄元素
   * @param {'sidebar'} type - 面板类型
   */
  _initSingleResize(handle, type) {
    let startX = 0;
    let startW = 0;
    let targetEl = null;

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startX = e.clientX;

      if (type === 'sidebar') {
        targetEl = document.getElementById('sandboxSidePanel');
        if (targetEl) startW = targetEl.offsetWidth;
      }

      handle.classList.add('active');

      // 拖拽期间禁用指针事件，防止 iframe / 编辑器抢夺鼠标
      if (this._ctx.preview) this._ctx.preview.style.pointerEvents = 'none';
      const monacoEl = document.getElementById('sandboxMonacoContainer');
      if (monacoEl) monacoEl.style.pointerEvents = 'none';

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    const onMove = (e) => {
      if (!targetEl) return;

      let newW;
      if (type === 'sidebar') {
        newW = startW + (e.clientX - startX);
        newW = Math.max(120, Math.min(400, newW));
      }

      targetEl.style.width = newW + 'px';
      targetEl.style.flex = 'none';

      if (this._ctx.monacoEditor) this._ctx.monacoEditor.layout();
    };

    const onUp = () => {
      handle.classList.remove('active');

      // 恢复指针事件
      if (this._ctx.preview) this._ctx.preview.style.pointerEvents = '';
      const monacoEl = document.getElementById('sandboxMonacoContainer');
      if (monacoEl) monacoEl.style.pointerEvents = '';

      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }
}

console.log('[sandbox-resize] 模块已加载');
