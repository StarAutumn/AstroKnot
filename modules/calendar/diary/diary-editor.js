// ============================================================
//  calendar / diary-editor.js — 日记编辑器（复用现有富文本编辑器）
// ============================================================
// 将日记作为"虚拟快速笔记"注入 appState.quickNotes，
// 然后调用 openRichEditorCK 打开现有的节点富文本编辑器。
// 保存时通过 _isDiary 标志拦截，写入日记存储而非快速笔记存储。

import { fmtDiaryDate, readDiary, saveDiary, deleteDiary, hasDiary, reloadDiaryIndex } from './diary-store.js';

// ── 状态 ──
let _currentDateStr = null;

const _weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/**
 * 格式化日期标题为中文显示
 */
function _formatDateTitle(dateStr) {
  const parts = dateStr.split('-');
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  const date = new Date(y, m - 1, d);
  const wd = _weekDays[date.getDay()];
  return y + '年' + m + '月' + d + '日 ' + wd;
}

/**
 * 获取日记对应的虚拟笔记 ID
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {string} 如 'diary_2026-07-19'
 */
function _diaryNoteId(dateStr) {
  return 'diary_' + dateStr;
}

/**
 * 打开日记编辑器（复用现有富文本编辑器）
 * @param {Date} date - 要编辑的日期
 */
export async function openDiaryEditor(date) {
  const dateStr = fmtDiaryDate(date);
  _currentDateStr = dateStr;
  const noteId = _diaryNoteId(dateStr);

  // 读取日记内容
  const result = await readDiary(dateStr);
  const content = (result && result.success && result.content) ? result.content : '';

  // 注入虚拟笔记到 appState.quickNotes
  if (!window.appState) {
    console.error('[diary-editor] appState 不可用');
    return;
  }
  // 如果已存在（上次未清理），先移除
  window.appState.quickNotes = window.appState.quickNotes.filter(function (n) {
    return n.id !== noteId;
  });

  const virtualNote = {
    id: noteId,
    title: '📔 ' + _formatDateTitle(dateStr),
    content: content,
    overlayImages: [],
    drawData: null,
    activeMode: 'text',
    _isDiary: true,
    _diaryDateStr: dateStr
  };
  window.appState.quickNotes.push(virtualNote);

  // 调用现有编辑器打开
  try {
    const { openRichEditorCK } = await import('../../richEditor/index.js');
    const { initCKEditor } = await import('../../richEditor/index.js');
    openRichEditorCK(null, noteId, initCKEditor);
  } catch (err) {
    console.error('[diary-editor] 打开编辑器失败:', err);
    // 清理虚拟笔记
    window.appState.quickNotes = window.appState.quickNotes.filter(function (n) {
      return n.id !== noteId;
    });
  }
}

/**
 * 从 appState.quickNotes 中移除日记虚拟笔记
 * 在编辑器关闭后调用
 */
export function cleanupDiaryNote() {
  if (!_currentDateStr) return;
  const noteId = _diaryNoteId(_currentDateStr);
  if (window.appState && window.appState.quickNotes) {
    window.appState.quickNotes = window.appState.quickNotes.filter(function (n) {
      return n.id !== noteId;
    });
  }
  _currentDateStr = null;
}

/**
 * 保存日记内容（由 saveCurrentContentCK 调用）
 * @param {string} dateStr - YYYY-MM-DD
 * @param {string} content - HTML 内容
 */
export async function saveDiaryFromEditor(dateStr, content) {
  const result = await saveDiary(dateStr, content);
  if (result && result.success) {
    // 刷新日历索引
    await reloadDiaryIndex();
    if (window._refreshCalendarAfterDiary) {
      window._refreshCalendarAfterDiary();
    }
  }
  return result;
}

/**
 * 删除日记
 * @param {string} dateStr - YYYY-MM-DD
 */
export async function deleteDiaryFromMenu(dateStr) {
  const result = await deleteDiary(dateStr);
  if (result && result.success) {
    await reloadDiaryIndex();
    if (window._refreshCalendarAfterDiary) {
      window._refreshCalendarAfterDiary();
    }
  }
  return result;
}
