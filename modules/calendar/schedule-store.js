// ============================================================
//  calendar / schedule-store.js — 日程数据层 + 业务逻辑
// ============================================================
import { state } from './shared-state.js';

const SCHED_KEY = 'astroknot_schedule';

// 内部状态（模块级单例）
let schedule = loadSchedule();

// ── 数据加载/保存 ──
function loadSchedule() {
  try {
    const raw = localStorage.getItem(SCHED_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      return {
        events: Array.isArray(d.events) ? d.events : [],
        weekly: Array.isArray(d.weekly) ? d.weekly : [],
        slots: Array.isArray(d.slots) && d.slots.length ? d.slots : state.defaultSlots.slice(),
        firstWeekDate: typeof d.firstWeekDate === 'string' ? d.firstWeekDate : ''
      };
    }
  } catch {}
  return { events: [], weekly: [], slots: state.defaultSlots.slice(), firstWeekDate: '' };
}

function saveSchedule() {
  try { localStorage.setItem(SCHED_KEY, JSON.stringify(schedule)); } catch {}
}

// ── 工具函数 ──
export function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + dd;
}

export function parseDate(s) {
  const p = s.split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2]);
}

export function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

// ── 查询函数 ──
export function getSchedule() { return schedule; }
export function getDayEvents(dateStr) {
  return schedule.events.filter(e => e.date === dateStr).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
}
export function getWeeklyCell(weekday, slotIdx) {
  return schedule.weekly.find(w => w.weekday === weekday && w.slot === slotIdx);
}

// 取某日所在周的周一（本地时区）
export function getMondayOf(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dow = x.getDay(); // 0=周日, 1=周一
  x.setDate(x.getDate() - (dow === 0 ? 6 : dow - 1));
  return x;
}

// 计算某周一相对于 firstWeekDate 是第几周（从 1 开始）；未设置或为过去周返回 0
export function getWeekNumber(weekMonday) {
  if (!schedule.firstWeekDate) return 0;
  const f = parseDate(schedule.firstWeekDate);
  const fMon = getMondayOf(f);
  const diffDays = Math.round((weekMonday.getTime() - fMon.getTime()) / 86400000);
  if (diffDays < 0) return 0;
  return Math.floor(diffDays / 7) + 1;
}

// 判断某门课程在指定第几周是否应显示
// 综合考虑：repeat（每周/单周/双周）+ weekStart/weekEnd（周次范围）
export function isWeeklyActiveAtWeek(cell, weekNum) {
  if (!cell) return false;
  const rep = cell.repeat || 'weekly';
  // 未设置起始周 → 不做单双周与周次范围限制（全显示）
  if (!weekNum) return true;
  // 周次范围限制
  if (cell.weekStart != null && weekNum < cell.weekStart) return false;
  if (cell.weekEnd != null && weekNum > cell.weekEnd) return false;
  // 单双周限制
  if (rep === 'odd' && weekNum % 2 === 0) return false;
  if (rep === 'even' && weekNum % 2 === 1) return false;
  return true;
}

// ── 课程颜色：按标题确定性取色，同一课程名永远同色 ──
const coursePalette = [
  { bar: '#5ee8ff', bg: 'rgba(94,232,255,0.14)' },   // 青
  { bar: '#ffb86c', bg: 'rgba(255,184,108,0.14)' },   // 橙
  { bar: '#c8a8ff', bg: 'rgba(200,168,255,0.14)' },   // 紫
  { bar: '#7af0a8', bg: 'rgba(122,240,168,0.14)' },   // 绿
  { bar: '#ff8fa3', bg: 'rgba(255,143,163,0.14)' },   // 粉
  { bar: '#ffd166', bg: 'rgba(255,209,102,0.14)' },   // 黄
  { bar: '#9ad9ff', bg: 'rgba(154,217,255,0.14)' },   // 浅蓝
  { bar: '#b8e986', bg: 'rgba(184,233,134,0.14)' },   // 黄绿
  { bar: '#f5a8c0', bg: 'rgba(245,168,192,0.14)' },   // 玫红
  { bar: '#a8e6ff', bg: 'rgba(168,230,255,0.14)' }    // 天蓝
];

export function colorForTitle(title) {
  if (!title) return coursePalette[0];
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) >>> 0;
  return coursePalette[h % coursePalette.length];
}

// 解析时段字符串 "08:00-09:40" → {start, end} 分钟数；解析失败返回 null
export function parseSlotRange(slotStr) {
  if (!slotStr) return null;
  const m = slotStr.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return { start: +m[1] * 60 + +m[2], end: +m[3] * 60 + +m[4] };
}

// 两节课在同一周是否时间冲突：同 weekday、时段重叠、周范围重叠、重复周期兼容
export function coursesConflictAt(a, b, weekNum) {
  if (a.weekday !== b.weekday) return false;
  // 时段范围必须重叠
  const ra = parseSlotRange(schedule.slots[a.slot]);
  const rb = parseSlotRange(schedule.slots[b.slot]);
  if (ra && rb && (ra.end <= rb.start || rb.end <= ra.start)) return false;
  // 周范围是否重叠
  const aS = a.weekStart != null ? a.weekStart : 1;
  const aE = a.weekEnd != null ? a.weekEnd : 999;
  const bS = b.weekStart != null ? b.weekStart : 1;
  const bE = b.weekEnd != null ? b.weekEnd : 999;
  if (aE < bS || bE < aS) return false;
  // 重复周期是否兼容
  const ra2 = a.repeat || 'weekly';
  const rb2 = b.repeat || 'weekly';
  if (ra2 === 'weekly' || rb2 === 'weekly') {
    // weekly 与任何都冲突（只要范围重叠）
  } else if (ra2 === rb2) {
    // 都是 odd 或都是 even，且范围重叠 → 冲突
  } else {
    return false; // 一单一双，不冲突
  }
  // 若给了 weekNum，进一步检查该周是否两节都上
  if (weekNum) {
    if (!isWeeklyActiveAtWeek(a, weekNum) || !isWeeklyActiveAtWeek(b, weekNum)) return false;
  }
  return true;
}

// ── 增删改 ──
export function addEvent(ev) {
  schedule.events.push(ev);
  saveSchedule();
}
export function removeEvent(id) {
  schedule.events = schedule.events.filter(ev => ev.id !== id);
  saveSchedule();
}
export function setWeeklyAt(weekday, slot, course) {
  schedule.weekly = schedule.weekly.filter(w => !(w.weekday === weekday && w.slot === slot));
  schedule.weekly.push(course);
  saveSchedule();
}
export function removeWeeklyAt(weekday, slot) {
  schedule.weekly = schedule.weekly.filter(w => !(w.weekday === weekday && w.slot === slot));
  saveSchedule();
}
export function addSlot(timeStr) {
  schedule.slots.push(timeStr);
  saveSchedule();
}
export function setSlotAt(idx, timeStr) {
  if (idx >= 0 && idx < schedule.slots.length) {
    schedule.slots[idx] = timeStr;
    saveSchedule();
  }
}
export function removeSlotAt(idx) {
  if (idx < 0 || idx >= schedule.slots.length) return;
  schedule.slots.splice(idx, 1);
  // 修正 weekly 中大于 idx 的 slot 编号
  schedule.weekly.forEach(function (w) {
    if (w.slot > idx) w.slot -= 1;
    else if (w.slot === idx) w.slot = -1;
  });
  schedule.weekly = schedule.weekly.filter(w => w.slot >= 0);
  saveSchedule();
}
export function setFirstWeekDate(dateStr) {
  schedule.firstWeekDate = dateStr;
  saveSchedule();
}
export function clearAll() {
  schedule = { events: [], weekly: [], slots: state.defaultSlots.slice(), firstWeekDate: '' };
  saveSchedule();
}

// 获取统计（供清空按钮使用）
export function getStats() {
  return {
    events: schedule.events.length,
    weekly: schedule.weekly.length,
    slots: schedule.slots.length
  };
}
