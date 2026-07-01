// ============================================================
//  toolbar/toolbar-view.js — 视图 tab（页面视图 / Web版式 / 深色浅色）
// ============================================================

const LIGHT_KEY = 'richEditor_lightMode';
const PAGEVIEW_KEY = 'richEditor_pageView';
const PAPERSIZE_KEY = 'richEditor_paperSize';

// ── 图标 SVG ──
const MOON_SVG = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
const SUN_SVG = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
const PAGE_SVG = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/></svg>';
const WEB_SVG = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>';

// 纸张尺寸配置 (mm → px, 按 96dpi)
const PAPER_SIZES = {
  'A4':    { w: 210, h: 297 },
  'A3':    { w: 297, h: 420 },
  'B5':    { w: 176, h: 250 },
  'Letter':{ w: 216, h: 279 },
  'Legal': { w: 216, h: 356 },
};

function mmToPx(mm) {
  return Math.round(mm * 96 / 25.4);
}

/**
 * 注册视图 Tab 的工具栏按钮
 */
export function registerViewTab(editor) {
  // ── 图标注册 ──
  editor.ui.registry.addIcon('view-dark-icon', MOON_SVG);
  editor.ui.registry.addIcon('view-light-icon', SUN_SVG);
  editor.ui.registry.addIcon('view-page-icon', PAGE_SVG);
  editor.ui.registry.addIcon('view-web-icon', WEB_SVG);

  let pageApi = null;
  let webApi = null;
  let darkApi = null;

  // 获取保存的状态
  let isPageView = localStorage.getItem(PAGEVIEW_KEY) === '1';
  let savedSize = localStorage.getItem(PAPERSIZE_KEY) || 'A4';

  // 初始化页面视图状态
  if (isPageView) {
    applyPageView(savedSize);
  }

  // ══════════ 页面视图按钮 ══════════
  editor.ui.registry.addToggleButton('viewPageBtn', {
    icon: 'view-page-icon',
    text: '页面视图',
    tooltip: '切换到页面视图',
    onSetup: function (api) {
      pageApi = api;
      api.setActive(isPageView);
      return function () {};
    },
    onAction: function (api) {
      if (isPageView) return; // 已经是页面视图
      isPageView = true;
      applyPageView(savedSize);
      localStorage.setItem(PAGEVIEW_KEY, '1');
      api.setActive(true);
      if (webApi) webApi.setActive(false);
    }
  });

  // ══════════ Web 版式按钮 ══════════
  editor.ui.registry.addToggleButton('viewWebBtn', {
    icon: 'view-web-icon',
    text: 'Web版式',
    tooltip: '切换到 Web 版式',
    onSetup: function (api) {
      webApi = api;
      api.setActive(!isPageView);
      return function () {};
    },
    onAction: function (api) {
      if (!isPageView) return; // 已经是 Web 版式
      isPageView = false;
      applyWebView();
      localStorage.setItem(PAGEVIEW_KEY, '0');
      api.setActive(true);
      if (pageApi) pageApi.setActive(false);
    }
  });

  // ══════════ 深色/浅色模式切换按钮 ══════════
  // 初始状态：从 localStorage 读取
  var initialLight = localStorage.getItem(LIGHT_KEY) === '1';
  if (initialLight) {
    var initCk = document.getElementById('ckEditorContainer');
    if (initCk) initCk.classList.add('editor-light-mode');
  }

  editor.ui.registry.addButton('viewDarkMode', {
    icon: initialLight ? 'view-dark-icon' : 'view-light-icon',
    text: initialLight ? '深色模式' : '浅色模式',
    tooltip: '切换深色/浅色模式',
    onSetup: function (api) {
      darkApi = api;
      return function () {};
    },
    onAction: function (api) {
      var ck = document.getElementById('ckEditorContainer');
      if (!ck) return;
      var isLight = ck.classList.toggle('editor-light-mode');
      localStorage.setItem(LIGHT_KEY, isLight ? '1' : '0');
      var body = editor.getBody();
      if (body) {
        body.style.color = isLight ? '#333333' : '';
        body.style.backgroundColor = isLight ? '#ffffff' : '';
      }
      // 使用 TinyMCE API 更新按钮（会正确触发内部重渲染）
      api.setIcon(isLight ? 'view-dark-icon' : 'view-light-icon');
      api.setText(isLight ? '深色模式' : '浅色模式');
    }
  });

  // ══════════ 纸张尺寸下拉菜单（放在布局工具栏） ══════════
  var paperSizeApi = null;
  editor.ui.registry.addMenuButton('paperSize', {
    icon: 'view-page-icon',
    text: savedSize,
    tooltip: '纸张尺寸',
    onSetup: function (api) {
      paperSizeApi = api;
      return function () {};
    },
    fetch: function (callback) {
      var items = [];
      var sizeNames = Object.keys(PAPER_SIZES);
      for (var i = 0; i < sizeNames.length; i++) {
        (function (name) {
          items.push({
            type: 'togglemenuitem',
            text: name,
            active: savedSize === name,
            onAction: function () {
              savedSize = name;
              localStorage.setItem(PAPERSIZE_KEY, name);
              if (paperSizeApi) paperSizeApi.setText(name);
              if (isPageView) {
                applyPageView(name);
              }
            }
          });
        })(sizeNames[i]);
      }
      callback(items);
    }
  });

  // ── 深色/浅色按钮更新（供外部调用） ──
  function updateDarkBtn(isLight) {
    if (darkApi) {
      darkApi.setIcon(isLight ? 'view-dark-icon' : 'view-light-icon');
      darkApi.setText(isLight ? '深色模式' : '浅色模式');
    }
  }

  // ── 应用页面视图 ──
  function applyPageView(sizeName) {
    var ck = document.getElementById('ckEditorContainer');
    if (!ck) return;
    ck.classList.add('editor-page-view');

    var size = PAPER_SIZES[sizeName] || PAPER_SIZES['A4'];
    var pw = mmToPx(size.w);
    var ph = mmToPx(size.h);

    // 设置 CSS 变量，让 style.css 读取
    ck.style.setProperty('--page-width', pw + 'px');
    ck.style.setProperty('--page-height', ph + 'px');

    // 编辑器内容区也应用纸张宽度
    var body = editor.getBody();
    if (body) {
      body.style.width = pw + 'px';
      body.style.maxWidth = pw + 'px';
      body.style.margin = '20px auto';
      body.style.padding = '40px 60px';
      body.style.boxShadow = '0 2px 16px rgba(0,0,0,0.15)';
      body.style.backgroundColor = '#fff';
      body.style.borderRadius = '2px';
      body.style.minHeight = ph + 'px';
    }
  }

  // ── 应用 Web 版式 ──
  function applyWebView() {
    var ck = document.getElementById('ckEditorContainer');
    if (!ck) return;
    ck.classList.remove('editor-page-view');
    ck.style.removeProperty('--page-width');
    ck.style.removeProperty('--page-height');

    var body = editor.getBody();
    if (body) {
      body.style.width = '';
      body.style.maxWidth = '';
      body.style.margin = '';
      body.style.padding = '';
      body.style.boxShadow = '';
      body.style.backgroundColor = '';
      body.style.borderRadius = '';
      body.style.minHeight = '';
    }
  }

  // 导出供外部调用
  window.__viewModeUpdateBtn = updateDarkBtn;
}
