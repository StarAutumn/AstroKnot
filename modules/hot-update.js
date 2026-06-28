// ============================================================
//  热更新引擎 (Hot Module Replacement)
//  - CSS 文件 → 热替换 <link> 标签，实时生效不刷新，零状态丢失
//  - JS / HTML → 保存关键状态 → 自动重载 → 恢复状态
// ============================================================

const STATE_KEY = '__HMR_STATE__';

const stateFields = new Map();

/**
 * 注册一个需要跨重载保留的状态字段
 * @param {string} key     存储键名
 * @param {Function} save   同步函数，返回要保存的值
 * @param {Function} restore 异步函数，接收保存的值进行恢复
 */
export function registerHMRState(key, save, restore) {
  stateFields.set(key, { save, restore });
}

function swapCSS(filePath) {
  const fileName = filePath.replace(/\\/g, '/').split('/').pop();
  const links = document.querySelectorAll('link[rel="stylesheet"]');
  let swapped = false;
  for (const link of links) {
    const href = link.getAttribute('href') || '';
    if (href.includes(fileName) || fileName.includes(href.split('/').pop())) {
      link.setAttribute('href', href.split('?')[0] + '?hmr=' + Date.now());
      swapped = true;
    }
  }
  if (!swapped && fileName.includes('style')) {
    for (const link of links) {
      const href = link.getAttribute('href') || '';
      if (href.endsWith('.css')) {
        link.setAttribute('href', href.split('?')[0] + '?hmr=' + Date.now());
        break;
      }
    }
  }
  return swapped;
}

function saveState() {
  const state = {};
  for (const [key, { save }] of stateFields) {
    try {
      const val = save();
      if (val !== undefined && val !== null) state[key] = val;
    } catch (e) {
      console.warn('[HMR] 保存状态 "' + key + '" 失败:', e);
    }
  }
  try {
    sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {}
}

async function restoreState() {
  let raw;
  try {
    raw = sessionStorage.getItem(STATE_KEY);
    sessionStorage.removeItem(STATE_KEY);
  } catch {}
  if (!raw) return;
  let state;
  try { state = JSON.parse(raw); } catch { return; }
  for (const [key, { restore }] of stateFields) {
    if (key in state) {
      try { await restore(state[key]); } catch (e) {
        console.warn('[HMR] 恢复状态 "' + key + '" 失败:', e);
      }
    }
  }
}

export function initHotUpdate() {
  const api = window.api;
  if (!api || !api.onHotUpdate) {
    console.log('[HMR] IPC 通道未就绪');
    return;
  }

  api.onHotUpdate(({ type, filePath }) => {
    if (type === 'css') {
      swapCSS(filePath);
      console.log('[HMR] CSS 热更新: ' + filePath.split('/').pop());
    } else {
      saveState();
      console.log('[HMR] 检测到变更，保存状态后重载: ' + filePath.split('/').pop());
      setTimeout(() => location.reload(), 100);
    }
  });

  restoreState();

  console.log('[HMR] 热更新引擎已启动');
}