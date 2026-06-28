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

/** 去除 overlay 后提取纯文本 */
function getTextNoOverlay(el) {
  if (!el) return '';
  const clone = el.cloneNode(true);
  const ov = clone.querySelector('#overlayImageContainer');
  if (ov) ov.remove();
  return clone.textContent || '';
}

/** 全文统计 */
function getFullStats() {
  const body = state.tinyEditor?.getBody();
  const text = getTextNoOverlay(body).trim();
  const total = countWords(text);
  const cn = countChinese(text);
  const nonCn = total - cn;
  return { total, cn, nonCn };
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
  const stats = getSelectedStats() || getFullStats();
  const isSel = !!getSelectedStats();
  document.getElementById('wcTotal').textContent = stats.total + (isSel ? ' / ' + getFullStats().total : '');
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

  // 编辑器内容变化时刷新
  state.tinyEditor.on('change input undo redo mouseup keyup', updateWordCount);

  // selectionchange：取消高亮后立刻恢复全文统计（比 mouseup 更及时）
  document.addEventListener('selectionchange', () => {
    if (state.tinyEditor && state.tinyEditor.selection.isCollapsed()) {
      updateWordCount();
    }
  });

  updateWordCount();
}
