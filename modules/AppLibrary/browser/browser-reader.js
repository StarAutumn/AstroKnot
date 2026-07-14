// ============================================================
//  browser/browser-reader.js — 阅读模式 + 暗色模式强制
//  阅读模式：检测文章类页面，注入 CSS 隐藏侧边栏/广告/评论
//  暗色模式：通过 webview.insertCSS() 注入暗色样式表
// ============================================================

/** 阅读模式 CSS：隐藏常见非内容元素，优化正文排版 */
const READER_CSS = `
  /* 隐藏常见广告/侧边栏/评论/推荐元素 */
  [class*="ad-"], [class*="ads-"], [class*="advert"], [id*="ad-"], [id*="ads-"],
  [class*="sidebar"], [id*="sidebar"], [class*="side-bar"], [id*="side-bar"],
  [class*="comment"], [id*="comment"], [class*="recommend"], [id*="recommend"],
  [class*="related"], [id*="related"], [class*="popup"], [id*="popup"],
  [class*="newsletter"], [id*="newsletter"], [class*="subscribe"], [id*="subscribe"],
  [class*="share"], [id*="share"], [class*="social"], [id*="social"],
  [class*="banner"], [id*="banner"], [class*="promo"], [id*="promo"],
  [class*="footer"], [id*="footer"], [class*="header-nav"], [id*="header-nav"],
  nav, aside, [role="complementary"], [role="banner"], [role="contentinfo"],
  iframe[src*="ads"], iframe[src*="doubleclick"], iframe[src*="facebook"],
  .modal, .overlay, .backdrop, .popup-wrap, .tip-wrap,
  [class*="float"], [class*="fixed-bar"], [id*="fixed-bar"] {
    display: none !important;
  }
  /* 优化正文排版 */
  body {
    background: #fafafa !important;
    color: #2c2c2c !important;
    font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif !important;
    line-height: 1.8 !important;
  }
  article, main, .article, .post, .content, .entry-content, .article-content, #content {
    max-width: 780px !important;
    margin: 0 auto !important;
    padding: 32px 24px !important;
    background: #fff !important;
    box-shadow: 0 1px 4px rgba(0,0,0,0.06) !important;
    border-radius: 4px !important;
  }
  article p, main p, .article p, .post p, .content p, .entry-content p {
    font-size: 17px !important;
    line-height: 1.85 !important;
    color: #333 !important;
    margin: 1em 0 !important;
  }
  article h1, main h1, .article h1, .post h1, h1 {
    font-size: 28px !important;
    margin: 0.6em 0 0.4em !important;
    color: #1a1a1a !important;
  }
  article h2, main h2, .article h2, h2 {
    font-size: 22px !important;
    margin: 1.2em 0 0.5em !important;
    color: #222 !important;
  }
  article img, main img, .article img, .post img, .content img {
    max-width: 100% !important;
    height: auto !important;
    border-radius: 4px !important;
  }
  article a, main a, .article a {
    color: #2563eb !important;
    text-decoration: none !important;
  }
  article a:hover { text-decoration: underline !important; }
  article blockquote, main blockquote {
    border-left: 4px solid #d1d5db !important;
    padding: 8px 16px !important;
    margin: 1em 0 !important;
    color: #555 !important;
    background: #f9f9f9 !important;
  }
  article pre, main pre, .article pre {
    background: #f5f5f5 !important;
    padding: 12px 16px !important;
    border-radius: 4px !important;
    overflow-x: auto !important;
    font-size: 14px !important;
  }
`;

/** 暗色模式 CSS：强制暗色背景 */
const DARK_CSS = `
  html, body {
    background: #1a1a2e !important;
    color: #e0e0e0 !important;
  }
  * {
    background-color: transparent !important;
    color: #e0e0e0 !important;
    border-color: #444 !important;
  }
  /* 保留图片原色 */
  img, video, canvas, svg, picture {
    background: transparent !important;
  }
  /* 输入框暗色 */
  input, textarea, select, button {
    background: #2a2a3e !important;
    color: #e0e0e0 !important;
    border: 1px solid #444 !important;
  }
  input::placeholder, textarea::placeholder { color: #888 !important; }
  /* 链接颜色 */
  a { color: #6cb6ff !important; }
  a:visited { color: #c585d8 !important; }
  /* 代码块 */
  pre, code {
    background: #16162a !important;
    color: #e0e0e0 !important;
  }
  /* 表格 */
  table { border-color: #444 !important; }
  th, td { border-color: #444 !important; }
  /* 常见白底容器 */
  div, section, article, header, footer, nav, aside, main {
    background-color: #1e1e32 !important;
  }
  /* 阴影改为深色 */
  [style*="box-shadow"], [style*="background: #fff"], [style*="background:#fff"],
  [style*="background: white"], [style*="background:white"] {
    background-color: #1e1e32 !important;
  }
`;

/** 保存已注入的 CSS key，便于移除（Electron webview insertCSS 返回 key） */
export class BrowserReader {
  /**
   * @param {Object} opts
   * @param {Function} opts.getActiveTab - 获取当前活跃标签 { webview, ready }
   */
  constructor({ getActiveTab }) {
    this._getTab = getActiveTab;
    /** @type {Map<string, string>} tabId → readerCssKey */
    this._readerKeys = new Map();
    /** @type {Map<string, string>} tabId → darkCssKey */
    this._darkKeys = new Map();
    /** @type {Set<string>} 启用阅读模式的 tabId */
    this._readerOn = new Set();
    /** @type {Set<string>} 启用暗色模式的 tabId */
    this._darkOn = new Set();
  }

  /**
   * 切换阅读模式
   * @param {string} tabId
   * @returns {boolean} 切换后状态
   */
  async toggleReader(tabId) {
    const tab = this._getTab();
    if (!tab || !tab.ready) return false;
    if (this._readerOn.has(tabId)) {
      // 关闭：移除 CSS（Electron 31+ 支持 removeInsertedCSS，否则忽略）
      const key = this._readerKeys.get(tabId);
      if (key) {
        try { await tab.webview.removeInsertedCSS(key); } catch (_) {}
        this._readerKeys.delete(tabId);
      }
      this._readerOn.delete(tabId);
      return false;
    } else {
      // 开启
      try {
        const key = await tab.webview.insertCSS(READER_CSS);
        this._readerKeys.set(tabId, key);
        this._readerOn.add(tabId);
        return true;
      } catch (_) { return false; }
    }
  }

  /**
   * 切换暗色模式
   * @param {string} tabId
   * @returns {boolean} 切换后状态
   */
  async toggleDark(tabId) {
    const tab = this._getTab();
    if (!tab || !tab.ready) return false;
    if (this._darkOn.has(tabId)) {
      const key = this._darkKeys.get(tabId);
      if (key) {
        try { await tab.webview.removeInsertedCSS(key); } catch (_) {}
        this._darkKeys.delete(tabId);
      }
      this._darkOn.delete(tabId);
      return false;
    } else {
      try {
        const key = await tab.webview.insertCSS(DARK_CSS);
        this._darkKeys.set(tabId, key);
        this._darkOn.add(tabId);
        return true;
      } catch (_) { return false; }
    }
  }

  /** 当前标签是否启用阅读模式 */
  isReaderOn(tabId) { return this._readerOn.has(tabId); }

  /** 当前标签是否启用暗色模式 */
  isDarkOn(tabId) { return this._darkOn.has(tabId); }

  /** 清理指定标签的状态（标签关闭时调用） */
  clearTab(tabId) {
    this._readerKeys.delete(tabId);
    this._darkKeys.delete(tabId);
    this._readerOn.delete(tabId);
    this._darkOn.delete(tabId);
  }
}
