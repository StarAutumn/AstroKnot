// ============================================================
//  richEditor/word-count.js — 字数统计按钮 + 弹出详情框
// ============================================================
import { state } from './shared-state.js';

/** 统计：中文单字、连续字母数字串各计 1 */
function countWords(text) {
  const m = text.match(/[\u4e00-\u9fff\u3400-\u4dbf]|[a-zA-Z0-9]+/g) || [];
  return m.length;
}

/** 统计纯中文字数 */
function countChinese(text) {
  return (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
}

/**
 * 去除 overlay 后提取纯文本
 * 快路径：文档没有 overlay 容器时直接读 textContent（原生实现，比 cloneNode 快一个数量级）；
 * 有 overlay 时才深拷贝并剔除该容器（偶发场景，保证与旧行为逐字一致）
 */
function getTextNoOverlay(el) {
  if (!el) return '';
  if (!el.querySelector('#overlayImageContainer')) return el.textContent || '';
  const clone = el.cloneNode(true);
  const ov = clone.querySelector('#overlayImageContainer');
  if (ov) ov.remove();
  return clone.textContent || '';
}

// 全文统计缓存：文本未变（如仅光标移动）时跳过两轮全文正则
let _lastFullText = null;
let _lastFullStats = null;

/** 全文统计 */
function getFullStats() {
  const body = state.tinyEditor?.getBody();
  const text = getTextNoOverlay(body).trim();
  if (_lastFullText === text && _lastFullStats) return _lastFullStats;
  const total = countWords(text);
  const cn = countChinese(text);
  _lastFullText = text;
  _lastFullStats = { total, cn, nonCn: total - cn };
  return _lastFullStats;
}

/** 选中文本统计 */
function getSelectedStats() {
  if (!state.tinyEditor || state.tinyEditor.selection.isCollapsed()) return null;
  const selHtml = state.tinyEditor.selection.getContent();
  if (!selHtml) return null;
  const tmp = document.createElement('div');
  tmp.innerHTML = selHtml;
  const text = getTextNoOverlay(tmp).trim();
  if (!text) return null;
  const total = countWords(text);
  const cn = countChinese(text);
  const nonCn = total - cn;
  return { total, cn, nonCn };
}

/** 弹出字数详情框 */
function showWcPopup() {
  const sel = getSelectedStats();
  const stats = sel || getFullStats();
  document.getElementById('wcTotal').textContent = stats.total + (sel ? ' / ' + getFullStats().total : '');
  document.getElementById('wcChinese').textContent = stats.cn;
  document.getElementById('wcNonChinese').textContent = stats.nonCn;

  const popup = document.getElementById('wcPopup');
  const btn = document.getElementById('wcBtn');
  if (btn) {
    const r = btn.getBoundingClientRect();
    popup.style.top = '';
    popup.style.bottom = (window.innerHeight - r.top + 6) + 'px';
    popup.style.right = (window.innerWidth - r.right) + 'px';
  }
  popup.style.display = 'block';
}

/** 隐藏弹出框 */
function hideWcPopup() {
  document.getElementById('wcPopup').style.display = 'none';
}

/** 更新按钮上的字数 */
export function updateWordCount() {
  const btn = document.getElementById('wcBtn');
  if (!btn) return;
  const sel = getSelectedStats();
  if (sel) {
    btn.textContent = sel.total + ' 字';
  } else {
    btn.textContent = getFullStats().total + ' 字';
  }
}

/** 绑定事件 */
export function bindWordCount() {
  if (!state.tinyEditor) return;

  const btn = document.getElementById('wcBtn');
  const popup = document.getElementById('wcPopup');
  if (!btn || !popup) return;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (popup.style.display === 'block') hideWcPopup();
    else showWcPopup();
  });

  document.addEventListener('click', (e) => {
    if (popup.style.display !== 'block') return;
    if (!popup.contains(e.target) && e.target !== btn) hideWcPopup();
  });

  // 字数统计要遍历整个编辑区：统一走 200ms 防抖，
  // 避免每次按键、每次光标移动都重算（原先 input 与 selectionchange 各触发一次）
  let _wcTimer = null;
  function scheduleWordCount() {
    if (_wcTimer) clearTimeout(_wcTimer);
    _wcTimer = setTimeout(function () {
      _wcTimer = null;
      updateWordCount();
    }, 200);
  }

  // 编辑器内容变化时刷新
  state.tinyEditor.on('change input undo redo mouseup keyup', scheduleWordCount);

  // selectionchange：取消高亮后恢复全文统计（比 mouseup 更及时）
  document.addEventListener('selectionchange', () => {
    if (state.tinyEditor && state.tinyEditor.selection.isCollapsed()) {
      scheduleWordCount();
    }
  });

  updateWordCount();
}
