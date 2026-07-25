// ============================================================
//  calendar / diary-store.js — 日记数据层
// ============================================================
// 日记按日期组织，存储在 AstroKnot-Data/diaries/YYYY-MM/YYYY-MM-DD.html
// 索引文件 diaries/diary-index.json 记录所有日记的元数据。
//
// 本模块负责：
//   - 加载/保存/删除日记内容
//   - 维护内存中的日记索引（日期 → 元数据）
//   - 提供 hasDiary(date) 快速查询，用于日历日期标记
//
// 所有磁盘操作通过 window.api 的 IPC 通道完成（见 main.js 的 diary-* 处理器）。

// 内存中的日记索引：Map<dateStr 'YYYY-MM-DD', {date, title, updatedAt, createdAt}>
const _diaryIndex = new Map();
let _indexLoaded = false;

/**
 * 格式化日期为 YYYY-MM-DD
 * @param {Date} date
 * @returns {string}
 */
export function fmtDiaryDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}

/**
 * 从磁盘加载日记索引（仅加载一次，后续使用内存缓存）
 * @returns {Promise<void>}
 */
export async function loadDiaryIndex() {
  if (_indexLoaded) return;
  if (!window.api || !window.api.listDiaries) {
    _indexLoaded = true;
    return;
  }
  try {
    const result = await window.api.listDiaries();
    if (result && result.success && Array.isArray(result.diaries)) {
      _diaryIndex.clear();
      for (const entry of result.diaries) {
        if (entry && entry.date) {
          _diaryIndex.set(entry.date, entry);
        }
      }
    }
  } catch (err) {
    console.error('[diary-store] 加载日记索引失败:', err);
  }
  _indexLoaded = true;
}

/**
 * 强制重新加载索引（删除/保存后调用以同步）
 */
export async function reloadDiaryIndex() {
  _indexLoaded = false;
  await loadDiaryIndex();
}

/**
 * 检查某日期是否有日记
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {boolean}
 */
export function hasDiary(dateStr) {
  return _diaryIndex.has(dateStr);
}

/**
 * 获取某日期的日记元数据
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {Object|null}
 */
export function getDiaryMeta(dateStr) {
  return _diaryIndex.get(dateStr) || null;
}

/**
 * 获取所有有日记的日期集合
 * @returns {string[]} YYYY-MM-DD 数组
 */
export function getAllDiaryDates() {
  return Array.from(_diaryIndex.keys());
}

/**
 * 读取日记内容
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {Promise<{success, content, exists}>}
 */
export async function readDiary(dateStr) {
  if (!window.api || !window.api.readDiary) {
    return { success: false, error: 'API unavailable', content: '', exists: false };
  }
  try {
    const result = await window.api.readDiary(dateStr);
    return result;
  } catch (err) {
    console.error('[diary-store] 读取日记失败:', err);
    return { success: false, error: err.message, content: '', exists: false };
  }
}

/**
 * 保存日记内容
 * @param {string} dateStr - YYYY-MM-DD
 * @param {string} content - HTML 内容
 * @returns {Promise<{success}>}
 */
export async function saveDiary(dateStr, content) {
  if (!window.api || !window.api.saveDiary) {
    return { success: false, error: 'API unavailable' };
  }
  try {
    const result = await window.api.saveDiary(dateStr, content);
    if (result && result.success) {
      // 更新内存索引
      const now = new Date().toISOString();
      let title = '';
      try {
        const text = (content || '').replace(/<[^>]*>/g, '').trim();
        title = text.substring(0, 30);
      } catch (_) { title = ''; }
      const existing = _diaryIndex.get(dateStr);
      if (existing) {
        existing.title = title;
        existing.updatedAt = now;
      } else {
        _diaryIndex.set(dateStr, { date: dateStr, title, updatedAt: now, createdAt: now });
      }
    }
    return result;
  } catch (err) {
    console.error('[diary-store] 保存日记失败:', err);
    return { success: false, error: err.message };
  }
}

/**
 * 删除日记
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {Promise<{success}>}
 */
export async function deleteDiary(dateStr) {
  if (!window.api || !window.api.deleteDiary) {
    return { success: false, error: 'API unavailable' };
  }
  try {
    const result = await window.api.deleteDiary(dateStr);
    if (result && result.success) {
      _diaryIndex.delete(dateStr);
    }
    return result;
  } catch (err) {
    console.error('[diary-store] 删除日记失败:', err);
    return { success: false, error: err.message };
  }
}
