// ============================================================
//  browser/utils.js — 浏览器通用工具函数
// ============================================================

const SEARCH_ENGINE_KEY = 'astroknot-search-engine';

/** 搜索引擎配置 */
export const SEARCH_ENGINES = [
  { id: 'baidu',    name: '百度',     url: 'https://www.baidu.com/s?wd=' },
  { id: 'google',   name: 'Google',   url: 'https://www.google.com/search?q=' },
  { id: 'bing',     name: 'Bing',     url: 'https://www.bing.com/search?q=' },
  { id: 'duckduckgo', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
];

/**
 * 获取当前选中的搜索引擎
 * @returns {Object} 引擎配置 { id, name, url }
 */
export function getSearchEngine() {
  const saved = localStorage.getItem(SEARCH_ENGINE_KEY);
  if (saved) {
    const found = SEARCH_ENGINES.find(e => e.id === saved);
    if (found) return found;
  }
  return SEARCH_ENGINES[0]; // 默认百度
}

/**
 * 设置搜索引擎
 * @param {string} engineId - 引擎 ID
 */
export function setSearchEngine(engineId) {
  localStorage.setItem(SEARCH_ENGINE_KEY, engineId);
}

/**
 * 判断输入是 URL 还是搜索词
 * URL 特征：含点号、localhost、IP 地址、以 http 开头
 * @param {string} input
 * @returns {boolean}
 */
export function isUrl(input) {
  const s = input.trim();
  if (/^https?:\/\//i.test(s)) return true;
  if (/^localhost(:\d+)?$/i.test(s)) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(s)) return true;
  return /^[a-zA-Z0-9\u4e00-\u9fa5-]+(\.[a-zA-Z0-9\u4e00-\u9fa5-]+)+$/.test(s);
}

/**
 * 将用户输入转换为可导航的 URL
 * @param {string} input - URL 或搜索词
 * @returns {string} 完整 URL
 */
export function inputToUrl(input) {
  const s = (input || '').trim();
  if (!s) return 'about:blank';
  if (isUrl(s)) {
    return /^https?:\/\//i.test(s) ? s : 'https://' + s;
  }
  const engine = getSearchEngine();
  return engine.url + encodeURIComponent(s);
}

/** User-Agent 预设列表 */
export const USER_AGENTS = [
  { id: 'desktop-chrome', name: 'Chrome 桌面',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' },
  { id: 'desktop-edge',   name: 'Edge 桌面',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0' },
  { id: 'desktop-firefox',name: 'Firefox 桌面',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0' },
  { id: 'mobile-chrome',  name: 'Chrome 安卓',
    ua: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' },
  { id: 'mobile-safari',  name: 'Safari iOS',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
  { id: 'ipad',           name: 'Safari iPad',
    ua: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
];

const UA_KEY = 'astroknot-browser-ua';

/**
 * 获取当前选中的 User-Agent
 * @returns {Object} { id, name, ua }
 */
export function getUserAgent() {
  const saved = localStorage.getItem(UA_KEY);
  if (saved) {
    const found = USER_AGENTS.find(u => u.id === saved);
    if (found) return found;
  }
  return USER_AGENTS[0];
}

/**
 * 设置 User-Agent
 * @param {string} uaId - USER_AGENTS 中的 id
 */
export function setUserAgent(uaId) {
  localStorage.setItem(UA_KEY, uaId);
}

/** 兼容旧引用：动态返回当前 UA 字符串 */
export const BROWSER_UA = USER_AGENTS[0].ua;

/** 新标签页默认 URL */
export const NEWTAB_URL = 'https://www.bing.com';
