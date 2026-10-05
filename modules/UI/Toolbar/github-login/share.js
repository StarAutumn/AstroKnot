// ============================================================
//  UI/Toolbar/github-login/share.js — GitHub 登录面板共享层（状态与工具中枢）
// ============================================================
//  （原 github-login.js 拆分为文件夹版本；本文件承载跨文件共享的模块级状态
//    与小工具，不导入任何兄弟文件）
//  - 模块级状态 _overlay/_currentToken/_selectedRepo/_currentRepos：
//    跨文件整体赋值必须走对应 setXxx setter（ESM 绑定只读）；
//    _currentRepos 的元素操作（push/unshift 等）可直接用导入的绑定
//  - GITHUB_ICON_SVG：GitHub 官方图标
//  - getHiddenRepos/addHiddenRepo/removeHiddenRepo：隐藏仓库 localStorage 存取
//  - _formatTime/_formatSize：格式化工具
// ============================================================

// ── 模块级状态（原单文件闭包变量的显式载体）──
export let _overlay = null;
export let _currentToken = null;
export let _selectedRepo = null;
export let _currentRepos = [];

// 状态整体赋值统一走 setter（跨文件对 ESM 绑定只读）
export function setOverlay(v) { _overlay = v; }
export function setCurrentToken(v) { _currentToken = v; }
export function setSelectedRepo(v) { _selectedRepo = v; }
export function setCurrentRepos(v) { _currentRepos = v; }

// ── GitHub 官方图标（Octocat Mark，fill: currentColor 自适应颜色）──
export const GITHUB_ICON_SVG = '<svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden="true" style="display:block;">' +
  '<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>';

// ── 隐藏仓库的本地存储 ──
export function getHiddenRepos() {
  try { return JSON.parse(localStorage.getItem('gh_hidden_repos') || '[]'); } catch (_) { return []; }
}
export function addHiddenRepo(fullName) {
  const list = getHiddenRepos();
  if (!list.includes(fullName)) { list.push(fullName); localStorage.setItem('gh_hidden_repos', JSON.stringify(list)); }
}
export function removeHiddenRepo(fullName) {
  const list = getHiddenRepos();
  const idx = list.indexOf(fullName);
  if (idx >= 0) { list.splice(idx, 1); localStorage.setItem('gh_hidden_repos', JSON.stringify(list)); }
}

/** 格式化时间为"刚刚/X分钟前/X小时前/X天前/日期" */
export function _formatTime(isoStr) {
  if (!isoStr) return '从未';
  const d = new Date(isoStr);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
  if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
  if (diff < 86400 * 7) return Math.floor(diff / 86400) + ' 天前';
  return d.toLocaleDateString('zh-CN');
}

/** 格式化字节大小 */
export function _formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(2) + ' GB';
}
