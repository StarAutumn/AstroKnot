// 排班数据存储模块
import { getShiftTypes } from './shift-types-store.js';
import { isHoliday, isWorkday, getWorkdayInfo } from './holidays-store.js';

const STORAGE_KEY = 'astroknot_shifts';
const ACTIVE_SHIFT_KEY = 'astroknot_active_shift';

// 班表数据结构：
// 上班规律: { id, name, type: 'regular', startDate, endDate, bigSmallWeek: bool,
//   weekdays: [0/1...0/1],  // 关闭大小周时的工作日（1=上班）
//   bigWeekdays: [...], smallWeekdays: [...],  // 开启大小周时
//   firstWeekBig: bool  // 首周是否大周
// }
// 倒班-手动: { id, name, type: 'shift', subType: 'manual',
//   shifts: { '2026-06-29': 'day', '2026-06-30': 'night' }  // dateStr -> 班次类型
// }
// 倒班-规律: { id, name, type: 'shift', subType: 'pattern', startDate, cycle: ['day', 'night', 'rest'] }
let shiftSchedules = [];

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) shiftSchedules = JSON.parse(raw);
  } catch (e) {
    shiftSchedules = [];
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(shiftSchedules));
}

load();

export function getShiftSchedules() {
  return shiftSchedules.slice();
}

export function getShiftSchedule(id) {
  return shiftSchedules.find(s => s.id === id) || null;
}

export function addShiftSchedule(data) {
  const item = {
    id: 'sh_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    ...data
  };
  shiftSchedules.push(item);
  save();
  return item;
}

export function updateShiftSchedule(id, data) {
  const idx = shiftSchedules.findIndex(s => s.id === id);
  if (idx < 0) return null;
  Object.assign(shiftSchedules[idx], data);
  save();
  return shiftSchedules[idx];
}

export function removeShiftSchedule(id) {
  const idx = shiftSchedules.findIndex(s => s.id === id);
  if (idx < 0) return false;
  shiftSchedules.splice(idx, 1);
  save();
  return true;
}

// 获取某日的班次（上班规律类型）
function getRegularDayShifts(schedule, dateStr) {
  // 检查日期范围
  if (schedule.startDate && dateStr < schedule.startDate) return [];
  if (schedule.endDate && dateStr > schedule.endDate) return [];

  const date = new Date(dateStr);
  const dow = date.getDay(); // 0=周日, 6=周六

  // 优先判断法定节假日：如果是法定节假日，不显示"上班"
  if (isHoliday(dateStr)) {
    return []; // 法定节假日不上班
  }

  // 判断是否是调休工作日（周末调整为工作日）
  if (isWorkday(dateStr)) {
    const workdayInfo = getWorkdayInfo(dateStr);
    return [{
      scheduleName: schedule.name,
      isWork: true,
      isAdjustedWorkday: true,
      workdayName: workdayInfo ? workdayInfo.name : '调休',
      shiftType: 'work',
      shiftLabel: '上班',
      shiftColor: '#ffb86c',
      workHour: schedule.workHour != null ? schedule.workHour : 9,
      workMinute: schedule.workMinute != null ? schedule.workMinute : 0
    }];
  }

  let isWorkDay = false;
  let isBigWeek = undefined;

  if (schedule.bigSmallWeek) {
    // 大小周模式
    // 计算当前周是第几周（从startDate开始）
    const start = new Date(schedule.startDate);
    const startMon = new Date(start);
    const startDow = start.getDay();
    startMon.setDate(start.getDate() - (startDow === 0 ? 6 : startDow - 1));

    const curMon = new Date(date);
    const curDow = date.getDay();
    curMon.setDate(date.getDate() - (curDow === 0 ? 6 : curDow - 1));

    const weekDiff = Math.round((curMon.getTime() - startMon.getTime()) / (7 * 86400000));
    if (weekDiff < 0) return [];

    // 判断当前周是大周还是小周
    const isFirstBig = schedule.firstWeekBig !== false;
    isBigWeek = (weekDiff % 2 === 0) ? isFirstBig : !isFirstBig;
    const weekdays = isBigWeek ? schedule.bigWeekdays : schedule.smallWeekdays;

    isWorkDay = weekdays && weekdays[dow];
  } else {
    // 普通模式
    isWorkDay = schedule.weekdays && schedule.weekdays[dow];
  }

  if (!isWorkDay) return [];

  return [{
    scheduleName: schedule.name,
    isWork: true,
    shiftType: 'work',
    shiftLabel: '上班',
    shiftColor: '#ffb86c',
    isBigWeek,
    workHour: schedule.workHour != null ? schedule.workHour : 9,
    workMinute: schedule.workMinute != null ? schedule.workMinute : 0
  }];
}

// 获取某日的班次（只返回当前选中的班表数据）
export function getDayShifts(dateStr, activeShiftId) {
  const result = [];
  const types = getShiftTypes(); // 获取所有班次类型（用于查找颜色和名称）

  // 只处理当前选中的班表
  if (!activeShiftId) return result;

  const s = shiftSchedules.find(schedule => schedule.id === activeShiftId);
  if (!s) return result;

  if (s.type === 'regular') {
    const shifts = getRegularDayShifts(s, dateStr);
    result.push(...shifts);
  } else if (s.type === 'shift') {
    // 倒班类型
    if (s.subType === 'manual' && s.shifts) {
      // 手动排班
      const shiftType = s.shifts[dateStr];
      if (shiftType) {
        const typeInfo = types.find(t => t.id === shiftType);
        const defaultLabels = { day: '白班', night: '夜班', rest: '休息' };
        const defaultColors = { day: '#ffc864', night: '#6496ff', rest: '#64c864' };
        result.push({
          scheduleName: s.name,
          shiftType: shiftType,
          shiftLabel: typeInfo ? typeInfo.name : (defaultLabels[shiftType] || shiftType),
          shiftColor: typeInfo ? typeInfo.color : (defaultColors[shiftType] || '#8ab'),
          isWork: shiftType !== 'rest'
        });
      }
    } else if (s.subType === 'pattern' && s.cycle && s.startDate) {
      // 规律排班：根据周期循环计算
      // 检查日期是否在开始日期之后
      if (dateStr < s.startDate) return result;

      // 计算天数差
      const dateParts = dateStr.split('-');
      const dateObj = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
      const startParts = s.startDate.split('-');
      const startDateObj = new Date(parseInt(startParts[0]), parseInt(startParts[1]) - 1, parseInt(startParts[2]));

      const diffTime = dateObj.getTime() - startDateObj.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays >= 0) {
        // 根据周期长度循环
        const cycleIndex = diffDays % s.cycle.length;
        const shiftTypeId = s.cycle[cycleIndex];

        const typeInfo = types.find(t => t.id === shiftTypeId);
        const defaultLabels = { day: '白班', night: '夜班', rest: '休息' };
        const defaultColors = { day: '#ffc864', night: '#6496ff', rest: '#64c864' };

        result.push({
          scheduleName: s.name,
          shiftType: shiftTypeId,
          shiftLabel: typeInfo ? typeInfo.name : (defaultLabels[shiftTypeId] || shiftTypeId),
          shiftColor: typeInfo ? typeInfo.color : (defaultColors[shiftTypeId] || '#8ab'),
          isWork: shiftTypeId !== 'rest'
        });
      }
    }
  }
  return result;
}

// ── 当前选中的排班方案持久化 ──

export function loadActiveShiftId() {
  try {
    return localStorage.getItem(ACTIVE_SHIFT_KEY) || null;
  } catch (e) {
    return null;
  }
}

export function saveActiveShiftId(id) {
  try {
    if (id) {
      localStorage.setItem(ACTIVE_SHIFT_KEY, id);
    } else {
      localStorage.removeItem(ACTIVE_SHIFT_KEY);
    }
  } catch (e) {}
}
