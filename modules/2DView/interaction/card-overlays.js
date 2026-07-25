// ============================================================
//  2DView / interaction / card-overlays.js — 卡片/网页节点 DOM overlay 与 resize 把手
// ============================================================

import { appState } from '../../module0_AppState.js';
import { saveCurrentProjectData } from '../../module2_TreeData.js';
import {
  canvas, visible, transform,
  BASE_NODE_WIDTH, BASE_NODE_HEIGHT
} from '../shared.js';
import {
  getCardSize, getCardOffset, _cardBodyRects, setPostDrawHook,
  isNodeInCurrentLayer, getNodeVisibilityAlpha
} from '../render/index.js';

// ── 卡片 resize 状态（mouse-events.js 需要读写） ──
let isCardResizing = false;
let cardResizeInfo = null;  // { nodeId, handle, startX, startY, origW, origH }

export function getCardResizeState() { return { isCardResizing, cardResizeInfo }; }
export function setCardResizeStart(state) {
  isCardResizing = true;
  cardResizeInfo = state;
  // 立即禁用所有 overlay 及其子元素（含 iframeWrap）的 pointer-events
  // 避免 iframe 捕获 mousemove/mouseup 导致拖拽不跟光标或无法退出拉伸
  for (const div of _cardBodyOverlays.values()) {
    div.style.pointerEvents = 'none';
    const iframeWrap = div.querySelector('[data-webpage-body]');
    if (iframeWrap) iframeWrap.style.pointerEvents = 'none';
  }
}
export function resetCardResize() {
  isCardResizing = false;
  cardResizeInfo = null;
  // 恢复 overlay 及其子元素的 pointer-events
  for (const div of _cardBodyOverlays.values()) {
    div.style.pointerEvents = 'auto';
    const iframeWrap = div.querySelector('[data-webpage-body]');
    if (iframeWrap) iframeWrap.style.pointerEvents = 'auto';
  }
}

// ── 卡片正文 DOM overlay：真实渲染 richContent HTML ──
const _cardBodyOverlays = new Map();  // nodeId -> HTMLElement
let _cardOverlayContainer = null;

// 注入一次 scoped 样式
let _cardOverlayStyleInjected = false;
function _injectCardOverlayStyle() {
  if (_cardOverlayStyleInjected) return;
  _cardOverlayStyleInjected = true;
  const style = document.createElement('style');
  style.id = 'astroknot-card-overlay-style';
  // 所有规则限定在 [data-card-overlay] 下，避免污染全局
  style.textContent = `
[data-card-overlay] { color:#cde; font-size:13px; font-family:system-ui,sans-serif; line-height:1.6; }
[data-card-overlay] p { margin:4px 0; }
[data-card-overlay] h1,[data-card-overlay] h2,[data-card-overlay] h3,[data-card-overlay] h4,[data-card-overlay] h5,[data-card-overlay] h6 { color:#e0f0ff; margin:8px 0 4px; font-weight:600; line-height:1.3; }
[data-card-overlay] h1 { font-size:1.6em; }
[data-card-overlay] h2 { font-size:1.4em; }
[data-card-overlay] h3 { font-size:1.2em; }
[data-card-overlay] h4 { font-size:1.05em; }
[data-card-overlay] h5,[data-card-overlay] h6 { font-size:1em; }
[data-card-overlay] a { color:#5cc8ff; text-decoration:underline; }
[data-card-overlay] img,[data-card-overlay] video { max-width:100%; height:auto; border-radius:4px; }
[data-card-overlay] ul,[data-card-overlay] ol { margin:4px 0; padding-left:1.6em; }
[data-card-overlay] ul ul,[data-card-overlay] ol ol,[data-card-overlay] ul ol,[data-card-overlay] ol ul { padding-left:1.4em; }
[data-card-overlay] li { margin:2px 0; }
[data-card-overlay] table { border-collapse:collapse; width:100%; margin:6px 0; font-size:0.95em; }
[data-card-overlay] th,[data-card-overlay] td { border:1px solid #2c6e7e; padding:4px 8px; text-align:left; vertical-align:top; }
[data-card-overlay] th { background:#1a3545; color:#c0f0ff; font-weight:600; }
[data-card-overlay] tr:nth-child(even) td { background:rgba(255,255,255,0.03); }
[data-card-overlay] blockquote { margin:6px 0; padding:4px 12px; border-left:3px solid #2c6e7e; background:rgba(0,255,255,0.04); color:#9bb; }
[data-card-overlay] pre { background:#0d1b23 !important; border:1px solid #2c6e7e !important; border-radius:8px !important; padding:10px 12px !important; margin:6px 0 !important; overflow-x:auto !important; font-family:Consolas,Monaco,"Courier New",monospace !important; font-size:12px !important; line-height:1.5 !important; color:#c8e6ff !important; text-shadow:none !important; }
[data-card-overlay] pre code { background:transparent !important; border:none !important; padding:0 !important; color:inherit !important; text-shadow:none !important; }
[data-card-overlay] :not(pre)>code { background:#1a2a34 !important; border:1px solid #2c6e7e !important; border-radius:3px !important; padding:1px 5px !important; font-family:Consolas,Monaco,"Courier New",monospace !important; font-size:0.9em !important; color:#c8e6ff !important; }
[data-card-overlay] hr { border:none; border-top:1px solid #2c6e7e; margin:8px 0; }
[data-card-overlay] sup,[data-card-overlay] sub { font-size:0.55em; }
[data-card-overlay] rt { font-size:0.45em; line-height:1; opacity:0.75; }
[data-card-overlay] ruby { ruby-align:center; }
[data-card-overlay] span.gradient-text { background-clip:text; -webkit-background-clip:text; background-size:100% 100%; background-repeat:no-repeat; }
[data-card-overlay] .mce-object,[data-card-overlay] img[data-mce-object] { display:inline-block; }
[data-card-overlay] *[data-mce-selected] { outline:none; }
[data-card-overlay] p.tmce-dropcap::first-letter { font-size:3.5em; float:left; line-height:0.8; margin-right:6px; margin-top:2px; font-weight:bold; color:inherit; }
[data-card-overlay] .tmce-columns-2 { column-count:2; column-gap:2em; }
[data-card-overlay] .tmce-columns-3 { column-count:3; column-gap:1.5em; }
[data-card-overlay] .tmce-code-wrapper { display:flex !important; background:#0d1b23 !important; border:1px solid #2c6e7e !important; border-radius:8px !important; overflow:hidden !important; margin:6px 0 !important; }
[data-card-overlay] .tmce-line-numbers { flex-shrink:0; display:flex; flex-direction:column; padding:10px 0; background:#0d1b23; color:#3a5a6a; user-select:none; text-align:right; min-width:40px; font-family:Consolas,Monaco,"Courier New",monospace; font-size:12px; line-height:1.5; border-right:1px solid #1a2a34; overflow:hidden; }
[data-card-overlay] .tmce-line-numbers span { display:block; padding:0 10px 0 6px; line-height:1.5; }
[data-card-overlay] .tmce-code-area { flex:1; overflow:auto; min-width:0; }
[data-card-overlay] .tmce-code-wrapper pre { margin:0 !important; border:none !important; border-radius:0 !important; padding:10px 12px !important; }
[data-card-overlay] .hljs { color:#c8e6ff !important; background-color:transparent !important; }
[data-card-overlay] .hljs-comment,.hljs-quote,.hljs-doctag { color:#5a7a8a !important; font-style:italic !important; }
[data-card-overlay] .hljs-keyword,.hljs-selector-tag,.hljs-tag,.hljs-section,.hljs-name { color:#00e5ff !important; }
[data-card-overlay] .hljs-string,.hljs-regexp,.hljs-meta-string,.hljs-symbol,.hljs-bullet,.hljs-link,.hljs-addition { color:#ffd93d !important; }
[data-card-overlay] .hljs-number,.hljs-literal,.hljs-attr,.hljs-attribute,.hljs-variable,.hljs-template-variable,.hljs-deletion { color:#ff6b9d !important; }
[data-card-overlay] .hljs-type,.hljs-class .hljs-title,.hljs-function .hljs-title,.hljs-title,.hljs-built_in { color:#6bff6b !important; }
/* 滚动条 */
[data-card-overlay]::-webkit-scrollbar { width:6px; height:6px; }
[data-card-overlay]::-webkit-scrollbar-track { background:rgba(255,255,255,0.04); }
[data-card-overlay]::-webkit-scrollbar-thumb { background:rgba(0,255,255,0.35); border-radius:3px; }
[data-card-overlay]::-webkit-scrollbar-thumb:hover { background:rgba(0,255,255,0.55); }
`;
  document.head.appendChild(style);
}

function _getCardOverlayContainer() {
  if (_cardOverlayContainer && document.body.contains(_cardOverlayContainer)) return _cardOverlayContainer;
  _injectCardOverlayStyle();
  const container = document.createElement('div');
  container.id = 'astroknot-card-overlays';
  container.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;z-index:50;overflow:visible;';
  document.body.appendChild(container);
  _cardOverlayContainer = container;
  return container;
}

// 同步所有卡片正文 overlay 的位置/尺寸/内容/透明度
export function syncCardOverlays() {
  const container = _getCardOverlayContainer();
  // 2D 视图不可见时隐藏所有 overlay（切换到 3D 时）
  if (!visible) {
    if (container.style.display !== 'none') container.style.display = 'none';
    return;
  }
  if (container.style.display === 'none') container.style.display = '';
  const rect = canvas.getBoundingClientRect();
  const seen = new Set();
  for (const r of _cardBodyRects) {
    seen.add(r.id);
    const node = appState.nodeMap.get(r.id);
    if (!node) continue;
    // 图层过滤：非当前图层的卡片 overlay 隐藏（避免在别的图层还能点到/看到该卡片）
    if (!isNodeInCurrentLayer(r.id)) continue;

    const isWebpage = r._webpage;

    let div = _cardBodyOverlays.get(r.id);
    if (!div) {
      div = document.createElement('div');
      div.dataset.cardOverlay = r.id;

      if (isWebpage) {
        // ── 网页节点：搜索栏 + iframe ──
        div.style.cssText = 'position:fixed;pointer-events:none;overflow:hidden;' +
          'background:transparent;box-sizing:border-box;';

        // 搜索栏容器
        const searchWrap = document.createElement('div');
        searchWrap.dataset.webpageSearch = r.id;
        searchWrap.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:32px;pointer-events:auto;display:flex;align-items:center;gap:4px;padding:0 6px;' +
          'background:rgba(0,30,40,0.9);border-bottom:1px solid rgba(0,255,255,0.3);';
        // 搜索图标
        const searchIcon = document.createElement('span');
        searchIcon.textContent = '🔍';
        searchIcon.style.cssText = 'font-size:13px;flex-shrink:0;';
        searchWrap.appendChild(searchIcon);
        // 搜索输入框
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.dataset.webpageInput = r.id;
        searchInput.placeholder = '输入网址或搜索...';
        searchInput.value = node.webUrl || '';
        searchInput.style.cssText = 'flex:1;min-width:0;background:rgba(0,20,30,0.8);border:1px solid rgba(0,255,255,0.3);border-radius:4px;' +
          'color:#cde;font-size:12px;padding:2px 8px;outline:none;font-family:system-ui,sans-serif;';
        searchInput.addEventListener('focus', () => { searchInput.style.borderColor = 'rgba(0,255,255,0.8)'; });
        searchInput.addEventListener('blur', () => { searchInput.style.borderColor = 'rgba(0,255,255,0.3)'; });
        // 回车导航
        searchInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            const val = searchInput.value.trim();
            if (!val) return;
            node.webUrl = val;
            // 判断是URL还是搜索词
            let url = val;
            if (!/^https?:\/\//i.test(val) && !val.startsWith('file://') && !val.startsWith('data:')) {
              // 包含 . 且无空格 → 当作URL
              if (val.includes('.') && !val.includes(' ')) {
                url = 'https://' + val;
              } else {
                // 搜索词 → 用搜索引擎
                url = 'https://www.bing.com/search?q=' + encodeURIComponent(val);
              }
            }
            const iframe = div.querySelector('iframe[data-webpage-iframe]');
            if (iframe) iframe.src = url;
            saveCurrentProjectData();
          }
        });
        // 阻止输入框的键盘事件冒泡到Canvas快捷键
        searchInput.addEventListener('keydown', (e) => { e.stopPropagation(); });
        searchWrap.appendChild(searchInput);
        // 搜索栏双击（非输入框）→ 转发到 Canvas，打开浏览器
        searchWrap.addEventListener('dblclick', (e) => {
          if (e.target === searchInput) return;  // 输入框内双击不转发
          e.stopPropagation();
          canvas.dispatchEvent(new MouseEvent('dblclick', {
            button: e.button,
            clientX: e.clientX,
            clientY: e.clientY,
            ctrlKey: e.ctrlKey,
            shiftKey: e.shiftKey,
            altKey: e.altKey,
            metaKey: e.metaKey,
            bubbles: true,
            cancelable: true
          }));
        });
        div.appendChild(searchWrap);

        // iframe 区域（底部留出 resize 把手空间，避免遮挡右下角把手）
        const iframeWrap = document.createElement('div');
        iframeWrap.dataset.webpageBody = r.id;
        iframeWrap.style.cssText = 'position:absolute;left:0;top:32px;right:12px;bottom:12px;pointer-events:auto;overflow:hidden;';
        const iframe = document.createElement('iframe');
        iframe.dataset.webpageIframe = '';
        iframe.style.cssText = 'width:100%;height:100%;border:none;background:#0d1820;';
        // 不设置 sandbox，避免限制 iframe 加载外部网页
        if (node.webUrl) {
          // URL智能处理：不含协议前缀时补 https://
          let url = node.webUrl;
          if (!/^https?:\/\//i.test(url) && !url.startsWith('file://') && !url.startsWith('data:')) {
            url = (url.includes('.') && !url.includes(' ')) ? 'https://' + url : 'https://www.bing.com/search?q=' + encodeURIComponent(url);
          }
          iframe.src = url;
        }
        iframeWrap.appendChild(iframe);
        div.appendChild(iframeWrap);
      } else {
        // ── 普通卡片节点：富文本渲染 ──
        div.style.cssText = 'position:fixed;pointer-events:auto;overflow-y:auto;overflow-x:hidden;' +
          'background:transparent;box-sizing:border-box;word-break:break-word;' +
          'padding:2px 6px 2px 2px;' +
          'scrollbar-width:thin;scrollbar-color:rgba(0,255,255,0.4) rgba(255,255,255,0.06);';
      }

      // 阻止滚轮事件冒泡到 Canvas，避免误触平移缩放
      div.addEventListener('wheel', (e) => { e.stopPropagation(); });
      // 文件链接点击拦截：用系统默认应用打开文件而非下载
      div.addEventListener('click', (e) => {
        const a = e.target.closest('a');
        if (a && a.href) {
          const href = a.href;
          // 本地文件路径或 blob URL → 用系统默认应用打开
          if (href.startsWith('file://') || href.startsWith('blob:') || (href.includes(':\\') && !/^https?:\/\//i.test(href))) {
            e.preventDefault();
            e.stopPropagation();
            // 转换为实际文件路径
            let filePath = href;
            if (href.startsWith('file:///')) filePath = decodeURIComponent(href.slice(8));
            else if (href.startsWith('file://')) filePath = decodeURIComponent(href.slice(7));
            else if (href.startsWith('blob:')) { window.open(href, '_blank'); return; }
            if (window.api && window.api.openLocalFile) {
              window.api.openLocalFile(filePath);
            } else {
              window.open(href, '_blank');
            }
            return;
          }
          // 带有 download 属性的文件链接 → 也用系统应用打开
          if (a.hasAttribute('download') && a.classList.contains('file-link')) {
            e.preventDefault();
            e.stopPropagation();
            let filePath = href;
            if (href.startsWith('file:///')) filePath = decodeURIComponent(href.slice(8));
            else if (href.startsWith('file://')) filePath = decodeURIComponent(href.slice(7));
            if (window.api && window.api.openLocalFile) {
              window.api.openLocalFile(filePath);
            } else {
              window.open(href, '_blank');
            }
            return;
          }
          // 普通超链接 → 在内置浏览器中打开
          if (/^https?:\/\//i.test(href)) {
            e.preventDefault();
            e.stopPropagation();
            if (window.AppRunner) {
              window.AppRunner.open({ id: 'card-link-browser', name: '浏览器', type: 'browser', defaultUrl: href });
            } else {
              window.open(href, '_blank');
            }
          }
        }
      });
      // mousedown：非交互元素转发到 Canvas，让节点选中/拖拽/框选正常工作
      div.addEventListener('mousedown', (e) => {
        // 点击了交互元素（链接/按钮/输入框/可编辑）→ 不拦截，让其正常工作
        const interactive = e.target.closest('a, button, input, textarea, select, [contenteditable="true"], iframe');
        if (interactive) {
          e.stopPropagation();
          return;
        }
        // 按住 Alt 键 → 允许文本选择，不转发到 Canvas
        if (e.altKey) {
          e.stopPropagation();
          return;
        }
        // 非交互元素 → 转发 mousedown 到 Canvas
        e.stopPropagation();
        canvas.dispatchEvent(new MouseEvent('mousedown', {
          button: e.button,
          clientX: e.clientX,
          clientY: e.clientY,
          ctrlKey: e.ctrlKey,
          shiftKey: e.shiftKey,
          altKey: e.altKey,
          metaKey: e.metaKey,
          bubbles: true,
          cancelable: true
        }));
      });
      // dblclick：转发到 Canvas，双击卡片正文区域也能打开编辑器
      div.addEventListener('dblclick', (e) => {
        const interactive = e.target.closest('a, button, input, textarea, select, [contenteditable="true"], iframe');
        if (interactive) {
          e.stopPropagation();
          return;
        }
        if (e.altKey) {
          e.stopPropagation();
          return;
        }
        e.stopPropagation();
        canvas.dispatchEvent(new MouseEvent('dblclick', {
          button: e.button,
          clientX: e.clientX,
          clientY: e.clientY,
          ctrlKey: e.ctrlKey,
          shiftKey: e.shiftKey,
          altKey: e.altKey,
          metaKey: e.metaKey,
          bubbles: true,
          cancelable: true
        }));
      });
      container.appendChild(div);
      _cardBodyOverlays.set(r.id, div);
    }

    // 透明度与卡片同步
    const alpha = (typeof r.alpha === 'number') ? r.alpha : 1;
    div.style.opacity = alpha.toFixed(3);
    div.style.visibility = alpha < 0.05 ? 'hidden' : 'visible';

    // resize 期间禁用 overlay 交互（含 iframeWrap，避免 iframe 捕获 mousemove/mouseup）
    const pe = isCardResizing ? 'none' : 'auto';
    div.style.pointerEvents = pe;
    const _iframeWrap = div.querySelector('[data-webpage-body]');
    if (_iframeWrap) _iframeWrap.style.pointerEvents = pe;

    // 世界坐标 → 屏幕坐标
    const sx = r.x * transform.scale + canvas.width / 2 + transform.offsetX + rect.left;
    const sy = r.y * transform.scale + canvas.height / 2 + transform.offsetY + rect.top;
    const s = transform.scale;

    if (isWebpage) {
      // 网页节点：overlay覆盖整个卡片区域（搜索栏+iframe）
      // 使用搜索栏矩形的左上角，加上卡片总宽高
      const sb = r._searchBarRect;
      // 定位用缩放后的坐标，但宽高用逻辑尺寸，通过 CSS transform:scale 缩放内容
      const fullX = (sb.x - 10) * s + canvas.width / 2 + transform.offsetX + rect.left;
      const fullY = sb.y * s + canvas.height / 2 + transform.offsetY + rect.top;
      const logicW = sb.width + 20;   // searchBarW + 两侧padding
      const logicH = r.height + sb.height + 14;  // bodyH + searchBarH + 分隔线间隙
      div.style.left = fullX + 'px';
      div.style.top = fullY + 'px';
      div.style.width = logicW + 'px';
      div.style.height = logicH + 'px';
      div.style.transform = `scale(${s})`;
      div.style.transformOrigin = 'top left';
      // 更新搜索栏高度（用逻辑尺寸，缩放由 transform 处理）
      const searchWrap = div.querySelector('[data-webpage-search]');
      if (searchWrap) searchWrap.style.height = sb.height + 'px';
      const iframeWrap = div.querySelector('[data-webpage-body]');
      if (iframeWrap) iframeWrap.style.top = sb.height + 'px';
      // 同步搜索输入值（仅当input未获焦时，避免打断用户输入）
      const searchInput = div.querySelector('[data-webpage-input]');
      if (searchInput && document.activeElement !== searchInput) {
        const url = node.webUrl || '';
        if (searchInput.value !== url) searchInput.value = url;
      }
    } else {
      // 普通卡片节点：宽高用逻辑尺寸，通过 CSS transform:scale 缩放内容
      div.style.left = sx + 'px';
      div.style.top = sy + 'px';
      div.style.width = r.width + 'px';
      div.style.height = r.height + 'px';
      div.style.transform = `scale(${s})`;
      div.style.transformOrigin = 'top left';
      // 内容更新（仅当 node 的 richContent 变化时）
      const html = node.richContent || node.desc || '';
      if (div._lastHtml !== html) {
        div.innerHTML = html;
        div._lastHtml = html;
      }
    }
  }
  // 移除不再存在的 overlay
  for (const [id, div] of _cardBodyOverlays) {
    if (!seen.has(id)) {
      div.remove();
      _cardBodyOverlays.delete(id);
    }
  }
}

// 移除指定卡片的 overlay（切换回 default 模式时调用）
export function removeCardOverlay(nodeId) {
  const div = _cardBodyOverlays.get(nodeId);
  if (div) {
    div.remove();
    _cardBodyOverlays.delete(nodeId);
  }
}

// 移除指定网页节点的 overlay（切换回 default 模式时调用）
export function removeWebpageOverlay(nodeId) {
  removeCardOverlay(nodeId);  // 网页节点overlay也存储在同一个Map中
}

// 卡片 resize 边缘命中检测：返回 'nw'|'n'|'ne'|'e'|'se'|'s'|'sw'|'w'|null
// 命中区域为卡片边缘的条带（无可见把手），四个角优先级高于四个边
export function hitTestCardHandle(worldPos, nodeId) {
  const node = appState.nodeMap.get(nodeId);
  const pos = appState.positions2D.get(nodeId);
  if (!node || !pos || (node.displayMode !== 'card' && node.displayMode !== 'webpage')) return null;
  const scale = node.sizeScale || 1;
  const { w: cardW, h: cardH } = getCardSize(node, scale);
  const off = getCardOffset(node, scale);
  // 边缘命中条带宽度（世界坐标）
  const EW = 8;
  const cx = pos.x + off.dx;
  const cy = pos.y + off.dy;
  // 不在卡片外扩 EW 范围内 → 不命中
  if (worldPos.x < cx - EW || worldPos.x > cx + cardW + EW ||
      worldPos.y < cy - EW || worldPos.y > cy + cardH + EW) return null;
  // 判断在哪条边/角的条带内
  const onLeft = worldPos.x >= cx - EW && worldPos.x <= cx + EW;
  const onRight = worldPos.x >= cx + cardW - EW && worldPos.x <= cx + cardW + EW;
  const onTop = worldPos.y >= cy - EW && worldPos.y <= cy + EW;
  const onBottom = worldPos.y >= cy + cardH - EW && worldPos.y <= cy + cardH + EW;
  // 四个角优先
  if (onLeft && onTop) return 'nw';
  if (onRight && onTop) return 'ne';
  if (onLeft && onBottom) return 'sw';
  if (onRight && onBottom) return 'se';
  // 四条边
  if (onTop) return 'n';
  if (onBottom) return 's';
  if (onLeft) return 'w';
  if (onRight) return 'e';
  return null;
}
