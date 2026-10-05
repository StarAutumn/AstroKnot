// ============================================================
//  calendar / shift-form/state.js — 排班表单状态与 setter
//  （拆分自 shift-form.js；跨文件整体赋值统一走 setXxx，下标/元素修改保持原样）
// ============================================================

// ── 状态 ──
export let weekdays = [0, 0, 0, 0, 0, 0, 0]; // 普通模式
export let bigWeekdays = [0, 0, 0, 0, 0, 0, 0]; // 大周
export let smallWeekdays = [0, 0, 0, 0, 0, 0, 0]; // 小周
export let startDate = '';
export let endDate = '';
export let startCalYear, startCalMonth;
export let endCalYear, endCalMonth;
export let whichCal = null; // 'start' or 'end'，标记当前展开的是哪个日历

// 倒班手动排班状态
export let manualCalYear, manualCalMonth;
export let selectedManualDate = ''; // 当前选中的日期
export let assignedShifts = {}; // { '2026-06-29': 'day', '2026-06-30': 'night', ... }

// 规律排班状态
export let patternCalYear, patternCalMonth;
export let selectedPatternDate = ''; // 规律排班选中的开始日期
export let patternCycle = []; // 轮班周期数组 ['day', 'night', 'rest', ...]

// ── 跨文件整体赋值 setter ──
export function setWeekdays(v) { weekdays = v; }
export function setBigWeekdays(v) { bigWeekdays = v; }
export function setSmallWeekdays(v) { smallWeekdays = v; }
export function setStartDate(v) { startDate = v; }
export function setEndDate(v) { endDate = v; }
export function setStartCalYear(v) { startCalYear = v; }
export function setStartCalMonth(v) { startCalMonth = v; }
export function setEndCalYear(v) { endCalYear = v; }
export function setEndCalMonth(v) { endCalMonth = v; }
export function setWhichCal(v) { whichCal = v; }
export function setManualCalYear(v) { manualCalYear = v; }
export function setManualCalMonth(v) { manualCalMonth = v; }
export function setSelectedManualDate(v) { selectedManualDate = v; }
export function setAssignedShifts(v) { assignedShifts = v; }
export function setPatternCalYear(v) { patternCalYear = v; }
export function setPatternCalMonth(v) { patternCalMonth = v; }
export function setSelectedPatternDate(v) { selectedPatternDate = v; }
export function setPatternCycle(v) { patternCycle = v; }
