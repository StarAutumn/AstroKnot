// ============================================================
//  browser/browser-context-menu.js — 自定义右键菜单
//  选中文本/图片/链接/通用操作 + 网页转节点/Markdown 剪藏
// ============================================================

import { clipFullPageToNode, clipSelectionToNode, clipImageToNode, clipLinkToNode, clipPageToMarkdownNode } from './browser-node-clip.js';

export class BrowserContextMenu {
  /**
   * @param {Object} opts
   * @param {HTMLElement} opts.content - 浏览器内容容器（用于定位菜单）
   * @param {Function} opts.createTab(url) - 创建新标签回调
   * @param {Function} opts.openFindBar()  - 打开查找栏回调
   * @param {Function} [opts.onClipNotify] - 剪藏结果通知回调 (msg) => void
   */
  constructor({ content, createTab, openFindBar, onClipNotify }) {
    this._content = content;
    this._createTab = createTab;
    this._openFindBar = openFindBar;
    this._onClipNotify = onClipNotify || (() => {});
    // 监听剪藏事件 → 转发到通知回调
    this._clipHandler = (e) => {
      const msg = e.detail && e.detail.message;
      if (msg) this._onClipNotify(msg);
    };
    window.addEventListener('astroknot-browser-clip', this._clipHandler);
  }

  /** 销毁：移除事件监听 */
  destroy() {
    if (this._clipHandler) window.removeEventListener('astroknot-browser-clip', this._clipHandler);
  }

  /**
   * 显示右键菜单
   * @param {Electron.WebviewTag} webview - 触发菜单的 webview
   * @param {Event} e - context-menu 事件
   */
  async show(webview, e) {
    e.preventDefault();
    // 先移除已有的右键菜单和遮罩（webview 内的右键不会冒泡到 document，closeMenu 无法触发）
    this._content.querySelectorAll('.app-browser-context-menu, .app-browser-ctx-overlay').forEach(el => el.remove());
    const menu = document.createElement('div');
    menu.className = 'app-browser-context-menu';
    const ctx = e.params || {};
    const items = [];

    // 文本选中时 → 复制/搜索/转节点
    if (ctx.selectionText) {
      items.push({ label: '📋 复制', action: () => {
        try { webview.copy(); } catch (_) {}
      }});
      const short = ctx.selectionText.length > 20 ? ctx.selectionText.substring(0, 20) + '…' : ctx.selectionText;
      items.push({ label: '🔍 搜索: ' + short, action: () => {
        this._createTab('https://www.baidu.com/s?wd=' + encodeURIComponent(ctx.selectionText));
      }});
      items.push({ label: '📝 转为文本节点', action: () => {
        clipSelectionToNode(webview, ctx);
      }});
      items.push({ type: 'separator' });
    }

    // 图片 → 复制地址/新标签打开/转节点
    if (ctx.mediaType === 'image' && ctx.srcURL) {
      items.push({ label: '🖼 复制图片地址', action: () => {
        navigator.clipboard.writeText(ctx.srcURL).catch(() => {});
      }});
      items.push({ label: '🔗 在新标签打开图片', action: () => {
        this._createTab(ctx.srcURL);
      }});
      items.push({ label: '🖼 转为图片节点', action: () => {
        clipImageToNode(webview, ctx);
      }});
      items.push({ type: 'separator' });
    }

    // 链接 → 新标签/复制/转节点
    if (ctx.linkURL) {
      items.push({ label: '🔗 在新标签打开', action: () => {
        this._createTab(ctx.linkURL);
      }});
      items.push({ label: '📋 复制链接地址', action: () => {
        navigator.clipboard.writeText(ctx.linkURL).catch(() => {});
      }});
      items.push({ label: '🔗 转为链接节点', action: () => {
        clipLinkToNode(webview, ctx);
      }});
      items.push({ type: 'separator' });
    }

    // 网页转节点：整页 / Markdown 剪藏
    items.push({ label: '🌐 转为 Web 项目节点（整页）', action: () => {
      clipFullPageToNode(webview, ctx);
    }});
    items.push({ label: '📋 Markdown 剪藏为节点树', action: () => {
      clipPageToMarkdownNode(webview);
    }});
    items.push({ type: 'separator' });

    // 通用操作
    items.push({ label: '← 后退', action: () => { if (webview.canGoBack()) webview.goBack(); }});
    items.push({ label: '→ 前进', action: () => { if (webview.canGoForward()) webview.goForward(); }});
    items.push({ label: '🔄 刷新', action: () => webview.reload() });
    items.push({ type: 'separator' });
    items.push({ label: '📋 全选', action: () => { try { webview.selectAll(); } catch (_) {} }});
    items.push({ type: 'separator' });
    items.push({ label: '🔍 页面查找', action: () => this._openFindBar() });
    items.push({ label: '🔧 检查元素', action: () => {
      try { webview.inspectElement(ctx.x || 0, ctx.y || 0); } catch (_) {}
    }});

    // 渲染菜单
    for (const it of items) {
      if (it.type === 'separator') {
        const sep = document.createElement('div');
        sep.className = 'dock-context-separator';
        menu.appendChild(sep);
      } else {
        const btn = document.createElement('div');
        btn.className = 'dock-context-item';
        btn.textContent = it.label;
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          menu.remove();
          it.action();
        });
        menu.appendChild(btn);
      }
    }

    // ── 定位：优先使用注入捕获器存储的视口坐标 ──
    // Electron context-menu 的 params.x/y 坐标系不可靠（疑似屏幕坐标，会导致菜单严重偏下），
    // 改用注入到 webview 内部的 contextmenu 捕获监听器记录的 clientX/clientY（webview 视口坐标）。
    // DOM contextmenu 事件先于 Electron context-menu 事件触发，故读取时坐标已是最新的。
    let vx = (e.params && e.params.x != null) ? e.params.x : 0;
    let vy = (e.params && e.params.y != null) ? e.params.y : 0;
    try {
      const raw = await webview.executeJavaScript('JSON.stringify(window.__astroknotCtxPos || null)', true);
      if (raw) {
        const pos = JSON.parse(raw);
        // 仅接受 1 秒内的新鲜坐标，避免使用陈旧值
        if (pos && pos.ts && (Date.now() - pos.ts < 1000)) {
          vx = pos.x;
          vy = pos.y;
        }
      }
    } catch (_) {}

    const wvRect = webview.getBoundingClientRect();
    // 使用 fixed 定位 + 纯视口坐标，规避 offset parent / border / padding 干扰
    // clientX/clientY 是 webview 视口坐标，加上 webview 在外层视口的位置即为光标视口坐标
    let left = wvRect.left + vx;
    let top = wvRect.top + vy;

    // 先隐藏附加以测量尺寸，再修正越界
    menu.style.position = 'fixed';
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
    menu.style.visibility = 'hidden';
    this._content.appendChild(menu);

    // 防止超出屏幕
    const mr = menu.getBoundingClientRect();
    const menuW = mr.width;
    const menuH = mr.height;

    // 水平越界：向左平移贴合右边
    if (left + menuW > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - menuW - 8);
    }

    // 垂直越界：若在光标下方会溢出底部，则翻转到光标上方显示；
    // 上方也放不下时再贴合视口底部
    if (top + menuH > window.innerHeight - 8) {
      const aboveTop = (wvRect.top + vy) - menuH; // 光标上方
      if (aboveTop >= 8) {
        top = aboveTop;
      } else {
        top = Math.max(8, window.innerHeight - menuH - 8);
      }
    }

    if (left < 8) left = 8;
    if (top < 8) top = 8;
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
    menu.style.visibility = '';

    // 透明遮罩：覆盖 content 区域，捕获 webview 内的点击（webview 事件不冒泡到 document）
    const overlay = document.createElement('div');
    overlay.className = 'app-browser-ctx-overlay';
    overlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:10001;background:transparent;';
    this._content.appendChild(overlay);

    // 点击关闭：遮罩捕获 webview 区域点击，document 捕获 UI 区域点击
    const closeMenu = (ev) => {
      if (menu.contains(ev.target)) return;
      menu.remove();
      overlay.remove();
      document.removeEventListener('mousedown', closeMenu);
    };
    overlay.addEventListener('mousedown', closeMenu);
    setTimeout(() => document.addEventListener('mousedown', closeMenu), 0);
  }
}
