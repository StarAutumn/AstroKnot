// ============================================================
//  calendar / calendar-popup.js — 日历弹窗三视图 + 时钟 tick
// ============================================================
import { state, setRefreshPopup } from './shared-state.js';
import { solarToLunar, getFestival, getShichen } from './lunar-utils.js';
import {
  fmtDate, getSchedule, getDayEvents, getWeeklyCell,
  getMondayOf, getWeekNumber, isWeeklyActiveAtWeek,
  colorForTitle, parseSlotRange,
  removeEvent, removeWeeklyAt, clearAll, getStats
} from './schedule-store.js';
import {
  openEventForm, openWeeklyForm, openSlotMenu,
  hideEventForm, hideSlotMenu, hideSlotTimeForm, hideFirstWeekForm,
  addSlotClicked, openFirstWeekForm
} from './schedule-forms.js';
import {
  renderAnniversaryView, bindAnniversaryEvents,
  setRefreshAnniversary
} from './anniversary-view.js';
import { hideAnniversaryForm } from './anniversary-form.js';
import { getTabs, addTab, removeTab } from './items-tabs-store.js';
import { openAddTabForm, hideAddTabForm } from './add-tab-form.js';
import { openShiftForm, editShiftForm } from './shift-form.js';
import { getShiftSchedules, getDayShifts, removeShiftSchedule, loadActiveShiftId, saveActiveShiftId } from './shift-store.js';
import { getNotificationHistory, clearNotificationHistory, removeNotificationItem } from './notification-store.js';

const { monthNames, weekHeaders, weekDayNames, weekColOrder } = state;

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function renderTabs() {
  const tabs = [['month', '月'], ['week', '周'], ['day', '日'], ['items', '事项'], ['anniversary', '倒计时']];
  let html = '<div style="display:flex;gap:6px;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,0.08);">';
  tabs.forEach(function (t) {
    const active = state.calView === t[0];
    const bg = active ? 'background:rgba(0,255,255,0.18);color:#eef;' : 'color:#8ab;';
    html += '<div class="cal-tab" data-tab="' + t[0] + '" style="cursor:pointer;padding:6px 14px;border-radius:8px;font-size:14px;font-weight:600;' + bg + '">' + t[1] + '</div>';
  });
  html += '</div>';
  return html;
}

function renderMonthView() {
  const year = state.calViewDate.getFullYear();
  const month = state.calViewDate.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const isThisMonth = today.getFullYear() === year && today.getMonth() === month;

  let html = '<div style="display:flex;flex-direction:column;height:100%;">';
  // 顶部：上一月 / 年月 / 下一月
  html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">';
  html += '<div class="cal-nav" data-nav="prev" style="cursor:pointer;font-size:20px;color:#8ab;padding:2px 12px;border-radius:6px;line-height:1;">\u2039</div>';
  html += '<div style="font-weight:600;color:#eef;font-size:17px;letter-spacing:0.5px;">' + year + '\u5E74 ' + monthNames[month] + '</div>';
  html += '<div class="cal-nav" data-nav="next" style="cursor:pointer;font-size:20px;color:#8ab;padding:2px 12px;border-radius:6px;line-height:1;">\u203A</div>';
  html += '</div>';

  // 中间：星期表头 + 日期网格 flex:1 撑满
  html += '<div style="flex:1;display:flex;flex-direction:column;overflow-y:auto;">';
  // 星期表头
  html += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px;margin-bottom:5px;">';
  weekHeaders.forEach(function (w) {
    html += '<div style="text-align:center;font-size:12px;color:#6a9;padding:4px 0;">' + w + '</div>';
  });
  html += '</div>';

  // 日期网格
  const schedule = getSchedule();
  html += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px;flex:1;">';
  for (let i = 0; i < firstWeekday; i++) html += '<div></div>';
  for (let day = 1; day <= daysInMonth; day++) {
    const isToday = isThisMonth && day === today.getDate();
    const lunar = solarToLunar(year, month + 1, day);
    const lunarLabel = (lunar.dayName === '\u521D\u4E00') ? lunar.monthName : lunar.dayName;
    const festival = getFestival(year, month + 1, day);
    const showFestival = festival && festival !== lunarLabel;
    const subLabel = showFestival ? festival : lunarLabel;
    const subColor = showFestival ? '#ffb86c' : '#6a9';
    const dateStr = fmtDate(new Date(year, month, day));
    const weekday = new Date(year, month, day).getDay();
    const evCount = getDayEvents(dateStr).length;
    const weeklyCount = schedule.weekly.filter(w => w.weekday === weekday).length;
    const shiftInfo = state.activeShiftId ? getDayShifts(dateStr, state.activeShiftId) : [];
    const hasShift = shiftInfo.length > 0;
    const hasSched = evCount > 0 || weeklyCount > 0 || hasShift;

    let bg = 'background:rgba(0,0,0,0.3);';
    let border = 'border:1px solid rgba(255,255,255,0.15);';
    let textColor = 'color:#b0d8ee;';

    // 如果有班次，使用班次颜色作为背景
    if (hasShift) {
      const shift = shiftInfo[0];
      bg = 'background:' + shift.shiftColor + '20;';
    }

    if (isToday) {
      bg = 'background:rgba(0,255,255,0.18);';
      border = 'border:1px solid rgba(0,255,255,0.45);';
      textColor = 'color:#eef;font-weight:600;';
    }

    html += '<div class="cal-day" data-day="' + day + '" style="text-align:center;padding:5px 0 4px;border-radius:6px;cursor:pointer;position:relative;' + bg + border + textColor + '">';
    html += '<div style="font-size:14px;line-height:1.2;">' + day + '</div>';
    html += '<div style="font-size:10px;color:' + subColor + ';line-height:1.1;margin-top:1px;font-weight:' + (showFestival ? '600' : '400') + ';">' + subLabel + '</div>';

    // 在农历日期下方显示班次小字
    if (hasShift) {
      const shift = shiftInfo[0];
      html += '<div style="font-size:8px;color:' + shift.shiftColor + ';line-height:1;margin-top:1px;font-weight:500;">' + shift.shiftLabel + '</div>';
    }

    if (hasSched) {
      const dots = [];
      if (evCount > 0) dots.push('background:#5ee8ff;');
      if (weeklyCount > 0) dots.push('background:#c9a8ff;');
      // 班次已经有颜色背景和小字显示，不再添加点
      html += '<div style="position:absolute;bottom:2px;left:50%;transform:translateX(-50%);display:flex;gap:3px;">';
      dots.forEach(function (d) { html += '<div style="width:4px;height:4px;border-radius:50%;' + d + '"></div>'; });
      html += '</div>';
    }
    html += '</div>';
  }
  html += '</div>';
  html += '</div>';

  // 底部：排班按钮 + 图例 + 今日农历（固定）
  const lunarToday = solarToLunar(today.getFullYear(), today.getMonth() + 1, today.getDate());
  const scToday = getShichen(today.getHours(), today.getMinutes());

  const shiftSchedules = getShiftSchedules();
  const activeShift = shiftSchedules.find(s => s.id === state.activeShiftId);
  const btnLabel = activeShift ? activeShift.name : '排班';
  html += '<div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.08);">';
  html += '<div style="position:relative;margin-bottom:8px;">';
  html += '<div class="cal-shift-btn" style="display:inline-flex;align-items:center;gap:4px;padding:5px 12px;border-radius:6px;background:rgba(255,180,80,0.15);border:1px solid rgba(255,180,80,0.35);color:#ffb86c;font-size:12px;font-weight:600;cursor:pointer;">' + escapeHtml(btnLabel) + ' ▾</div>';
  if (state.shiftDropdownVisible) {
    html += '<div id="shiftDropdown" style="position:absolute;top:100%;left:0;margin-top:4px;background:#1a1d2e;border:1px solid rgba(255,255,255,0.15);border-radius:8px;padding:6px;min-width:160px;box-shadow:0 4px 16px rgba(0,0,0,0.4);z-index:10;">';
    if (shiftSchedules.length > 0) {
      const noShiftActive = !state.activeShiftId;
      const noShiftBg = noShiftActive ? 'background:rgba(255,180,80,0.2);' : '';
      const noShiftColor = noShiftActive ? '#ffb86c;' : '#eef;';
      html += '<div class="shift-schedule-item" data-schedule-id="" style="padding:6px 10px;border-radius:4px;cursor:pointer;font-size:12px;color:' + noShiftColor + noShiftBg + 'display:flex;align-items:center;justify-content:space-between;">';
      html += '<span>不排班</span>';
      html += '<span style="color:#8ab;font-size:10px;">' + (noShiftActive ? '✓' : '') + '</span>';
      html += '</div>';
      html += '<div style="height:1px;background:rgba(255,255,255,0.1);margin:4px 0;"></div>';
      shiftSchedules.forEach(function (s) {
        const isActive = s.id === state.activeShiftId;
        const itemBg = isActive ? 'background:rgba(255,180,80,0.2);' : '';
        const itemColor = isActive ? '#ffb86c;' : '#eef;';
        const typeLabel = s.type === 'regular' ? '规律' : '倒班';
        html += '<div class="shift-schedule-item" data-schedule-id="' + s.id + '" style="padding:6px 10px;border-radius:4px;cursor:pointer;font-size:12px;color:' + itemColor + itemBg + 'display:flex;align-items:center;justify-content:space-between;">';
        html += '<span>' + escapeHtml(s.name) + '</span>';
        html += '<span style="color:#8ab;font-size:10px;">' + typeLabel + (isActive ? ' ✓' : '') + '</span>';
        html += '</div>';
      });
      html += '<div style="height:1px;background:rgba(255,255,255,0.1);margin:4px 0;"></div>';
    }
    html += '<div class="shift-new-btn" style="padding:6px 10px;border-radius:4px;cursor:pointer;font-size:12px;color:#ffb86c;font-weight:600;">+ 新建班表</div>';
    html += '</div>';
  }
  html += '</div>';
  html += '<div style="display:flex;gap:14px;font-size:11px;color:#6a9;flex-wrap:wrap;">';
  html += '<span><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#5ee8ff;vertical-align:middle;margin-right:4px;"></span>\u65E5\u7A0B</span>';
  html += '<span><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#c9a8ff;vertical-align:middle;margin-right:4px;"></span>\u8BFE\u7A0B</span>';
  if (state.activeShiftId) {
    html += '<span><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#ffb86c;vertical-align:middle;margin-right:4px;"></span>\u73ED\u8868</span>';
  }
  html += '</div>';
  html += '<div style="margin-top:6px;">';
  html += '<div style="font-weight:600;color:#eef;margin-bottom:4px;font-size:13px;">\uD83D\uDCC5 ' + lunarToday.ganZhiYear + '\u5E74 [' + lunarToday.zodiac + '\u5E74]</div>';
  html += '<div style="color:#9cc;font-size:12px;">' + lunarToday.monthName + lunarToday.dayName + '</div>';
  html += '<div style="margin-top:3px;color:#6a9;font-size:11px;">\u23F3 ' + scToday.name + ' (' + scToday.range + ')</div>';
  html += '</div>';
  html += '</div>';
  html += '</div>';
  return html;
}

function renderWeekView() {
  const weekStart = getMondayOf(state.calViewDate);
  const weekDates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    weekDates.push(d);
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const now = new Date();
  const isThisWeek = weekStart.getTime() === getMondayOf(now).getTime();
  const weekNum = getWeekNumber(weekStart);

  let html = '<div style="display:flex;flex-direction:column;height:100%;">';
  // 顶部导航固定
  const weekEnd = weekDates[6];
  html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">';
  html += '<div class="cal-nav" data-nav="prev-week" style="cursor:pointer;font-size:20px;color:#8ab;padding:2px 12px;border-radius:6px;line-height:1;">\u2039</div>';
  const titleStr = (weekDates[0].getMonth() + 1) + '/' + weekDates[0].getDate() + ' - ' + (weekEnd.getMonth() + 1) + '/' + weekEnd.getDate();
  const weekBadge = weekNum > 0
    ? '<span style="color:#5ee8ff;font-size:12px;margin-left:10px;padding:2px 8px;background:rgba(0,255,255,0.1);border-radius:6px;">\u7B2C' + weekNum + '\u5468</span>'
    : '<span style="color:#5a7;font-size:11px;margin-left:10px;">\u672A\u8BBE\u7F6E\u8D77\u59CB\u5468</span>';
  html += '<div style="display:flex;align-items:baseline;font-weight:600;color:#eef;font-size:16px;letter-spacing:0.3px;">' + titleStr + weekBadge + '</div>';
  html += '<div class="cal-nav" data-nav="next-week" style="cursor:pointer;font-size:20px;color:#8ab;padding:2px 12px;border-radius:6px;line-height:1;">\u203A</div>';
  html += '</div>';

  // 中间课程表 flex:1 撑满
  html += '<div style="flex:1;overflow-y:auto;">';
  const schedule = getSchedule();
  const slots = schedule.slots;
  html += '<div style="display:grid;grid-template-columns:78px repeat(7, 1fr);gap:3px;font-size:12px;">';
  // 表头行
  html += '<div style="padding:5px 2px;color:#6a9;text-align:center;font-size:11px;">\u65F6\u95F4</div>';
  weekColOrder.forEach(function (wd, colIdx) {
    const d = weekDates[colIdx];
    const isToday = d.getTime() === today.getTime();
    const fest = getFestival(d.getFullYear(), d.getMonth() + 1, d.getDate());
    const bg = isToday ? 'background:rgba(0,255,255,0.12);color:#eef;font-weight:600;' : 'color:#8ab;';
    html += '<div style="padding:5px 0;text-align:center;' + bg + 'border-radius:6px;">';
    html += '<div style="font-size:12px;">' + weekDayNames[wd].slice(1) + '</div>';
    html += '<div style="font-size:11px;color:#6a9;margin-top:1px;">' + (d.getMonth() + 1) + '/' + d.getDate() + '</div>';
    if (fest) html += '<div style="font-size:9px;color:#ffb86c;margin-top:1px;font-weight:500;line-height:1.1;">' + escapeHtml(fest) + '</div>';
    html += '</div>';
  });

  // 各时段行
  slots.forEach(function (slot, sIdx) {
    // 当前节判定：今天在本周内 + 当前时间落在该时段内
    const slotRange = parseSlotRange(slot);
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const isCurrentSlot = isThisWeek && slotRange && nowMin >= slotRange.start && nowMin < slotRange.end;
    html += '<div class="cal-slot-label" data-slot="' + sIdx + '" style="padding:5px 2px;color:' + (isCurrentSlot ? '#ffe066' : '#6a9') + ';text-align:center;font-size:11px;line-height:1.3;cursor:default;border-radius:4px;' + (isCurrentSlot ? 'background:rgba(255,224,102,0.12);font-weight:600;' : '') + '">' + slot + '</div>';
    weekColOrder.forEach(function (wd, colIdx) {
      const cell = getWeeklyCell(wd, sIdx);
      const todayDate = weekDates[colIdx];
      const isToday = todayDate.getTime() === today.getTime();
      const active = isWeeklyActiveAtWeek(cell, weekNum);
      const isCurrentCell = isToday && isCurrentSlot;
      const col = active && cell ? colorForTitle(cell.title) : null;
      const bg = col ? col.bg : (isToday ? 'rgba(0,255,255,0.05)' : 'transparent');
      let border = '1px solid rgba(255,255,255,0.04);';
      if (isCurrentCell) border = '1px solid #ffe066;box-shadow:0 0 0 1px rgba(255,224,102,0.3);';
      else if (active && cell) border = '1px solid ' + col.bar + '33;';
      html += '<div class="cal-cell" data-weekday="' + wd + '" data-slot="' + sIdx + '" style="position:relative;padding:6px 4px 6px 8px;border-radius:6px;cursor:pointer;min-height:44px;background:' + bg + ';' + border + '">';
      if (active && cell) {
        html += '<div style="position:absolute;left:0;top:0;bottom:0;width:3px;background:' + col.bar + ';border-radius:6px 0 0 6px;"></div>';
        const repeat = cell.repeat || 'weekly';
        const rangeLabel = (cell.weekStart != null || cell.weekEnd != null)
          ? '\u3010' + (cell.weekStart != null ? cell.weekStart : '?') + '-' + (cell.weekEnd != null ? cell.weekEnd : '?') + '\u5468\u3011'
          : '';
        const repLabel = repeat === 'weekly' ? '' : (repeat === 'odd' ? '\u3010\u5355\u5468\u3011' : '\u3010\u53CC\u5468\u3011');
        const tagLabel = rangeLabel || repLabel;
        html += '<div style="color:#eef;font-size:12px;font-weight:500;line-height:1.2;">' + escapeHtml(cell.title) + (tagLabel ? '<span style="font-size:9px;color:#c8a8ff;margin-left:3px;">' + tagLabel + '</span>' : '') + '</div>';
        if (cell.teacher) html += '<div style="color:#9cc;font-size:10px;margin-top:2px;line-height:1.1;">' + escapeHtml(cell.teacher) + '</div>';
        const locParts = [];
        if (cell.building) locParts.push(cell.building);
        if (cell.room) locParts.push(cell.room);
        if (locParts.length) html += '<div style="color:#9aa;font-size:10px;margin-top:1px;line-height:1.1;">' + escapeHtml(locParts.join(' ')) + '</div>';
        if (cell.note) html += '<div style="color:#9aa;font-size:10px;margin-top:1px;line-height:1.1;">' + escapeHtml(cell.note) + '</div>';
      }
      html += '</div>';
    });
  });
  html += '</div>';
  html += '</div>';

  // 底部提示 + 按钮（固定）
  html += '<div style="margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.06);font-size:11px;color:#6a9;">';
  html += '\u8BFE\u7A0B\u8868\u4E3A\u5468\u671F\u91CD\u590D\u6A21\u677F\uFF0C\u70B9\u51FB\u5355\u5143\u683C\u7F16\u8F91 / \u6E05\u7A7A\uFF0C\u53F3\u952E\u65F6\u6BB5\u8C03\u6574 / \u5220\u9664';
  html += '</div>';
  html += '<div style="display:flex;gap:8px;margin-top:8px;">';
  html += '<div class="cal-add-slot" style="flex:1;text-align:center;padding:8px;border:1px dashed rgba(0,255,255,0.25);border-radius:8px;cursor:pointer;color:#5ee8ff;font-size:13px;">+ \u6DFB\u52A0\u4E00\u8282</div>';
  const fwLabel = schedule.firstWeekDate ? '\u8D77\u59CB\u5468\uFF1A' + schedule.firstWeekDate : '\u8BBE\u7F6E\u7B2C\u4E00\u5468\u65E5\u671F';
  html += '<div class="cal-set-firstweek" style="flex:1;text-align:center;padding:8px;border:1px dashed rgba(0,255,255,0.25);border-radius:8px;cursor:pointer;color:#5ee8ff;font-size:13px;">\uD83D\uDD04 ' + escapeHtml(fwLabel) + '</div>';
  html += '<div class="cal-clear-all" style="flex:0 0 auto;text-align:center;padding:8px 14px;border:1px dashed rgba(255,143,163,0.35);border-radius:8px;cursor:pointer;color:#ff8fa3;font-size:13px;">\uD83D\uDDD1 \u6E05\u7A7A</div>';
  html += '</div>';
  html += '</div>';
  return html;
}

function renderDayView() {
  const dateStr = fmtDate(state.calSelectedDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const selDay = new Date(state.calSelectedDate);
  selDay.setHours(0, 0, 0, 0);
  const isToday = selDay.getTime() === today.getTime();
  const dow = state.calSelectedDate.getDay(); // 星期几（0-6）
  const events = getDayEvents(dateStr);
  const schedule = getSchedule();

  const sortedEvents = events.slice().sort(function (a, b) {
    const aHasTime = a.time && a.time.trim() !== '';
    const bHasTime = b.time && b.time.trim() !== '';
    if (!aHasTime && bHasTime) return -1;
    if (aHasTime && !bHasTime) return 1;
    if (!aHasTime && !bHasTime) return 0;
    return (a.time || '').localeCompare(b.time || '');
  });

  let html = '<div style="display:flex;flex-direction:column;height:100%;">';
  // 顶部导航固定
  html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">';
  html += '<div class="cal-nav" data-nav="prev-day" style="cursor:pointer;font-size:20px;color:#8ab;padding:2px 12px;border-radius:6px;line-height:1;">\u2039</div>';
  const titleStr = state.calSelectedDate.getFullYear() + '/' + (state.calSelectedDate.getMonth() + 1) + '/' + state.calSelectedDate.getDate() + ' ' + weekDayNames[dow];
  html += '<div style="font-weight:600;color:#eef;font-size:15px;">' + titleStr + (isToday ? ' (\u4ECA\u65E5)' : '') + '</div>';
  html += '<div class="cal-nav" data-nav="next-day" style="cursor:pointer;font-size:20px;color:#8ab;padding:2px 12px;border-radius:6px;line-height:1;">\u203A</div>';
  html += '</div>';

  // 农历信息
  const lunar = solarToLunar(state.calSelectedDate.getFullYear(), state.calSelectedDate.getMonth() + 1, state.calSelectedDate.getDate());
  const festival = getFestival(state.calSelectedDate.getFullYear(), state.calSelectedDate.getMonth() + 1, state.calSelectedDate.getDate());
  html += '<div style="margin-bottom:10px;padding:7px 10px;background:rgba(0,255,255,0.05);border-radius:8px;font-size:12px;color:#9cc;">';
  html += '\uD83D\uDCC4 ' + lunar.ganZhiYear + '\u5E74 ' + lunar.monthName + lunar.dayName + ' (' + lunar.zodiac + '\u5E74)';
  if (festival) html += ' <span style="color:#ffb86c;font-weight:600;margin-left:6px;">\uD83C\uDF89 ' + escapeHtml(festival) + '</span>';
  html += '</div>';

  // 中间：左右两栏 flex:1 撑满
  const longTermEvents = schedule.events.filter(ev => !ev.date || ev.date === '').sort(function (a, b) {
    const aHasTime = a.time && a.time.trim() !== '';
    const bHasTime = b.time && b.time.trim() !== '';
    if (!aHasTime && bHasTime) return -1;
    if (aHasTime && !bHasTime) return 1;
    if (!aHasTime && !bHasTime) return 0;
    return (a.time || '').localeCompare(b.time || '');
  });

  html += '<div style="flex:1;display:grid;grid-template-columns:1fr 1.5fr;gap:10px;overflow-y:auto;">';

  // 左栏：长期事项
  html += '<div style="border-radius:8px;padding:8px;background:rgba(255,200,100,0.08);border:1px solid rgba(255,200,100,0.2);display:flex;flex-direction:column;">';
  html += '<div style="color:#ffb86c;font-size:12px;font-weight:600;margin-bottom:6px;padding:4px 6px;border-radius:4px;background:rgba(255,200,100,0.15);">长期事项</div>';
  html += '<div style="flex:1;overflow-y:auto;">';
  if (longTermEvents.length === 0) {
    html += '<div style="text-align:center;color:#5a7;font-size:11px;padding:10px 0;">暂无</div>';
  } else {
    longTermEvents.forEach(function (ev) {
      const qColors = { 'q1': '#ff5555', 'q2': '#ff9944', 'q3': '#55cc55', 'q4': '#5588ff' };
      const barColor = ev.quadrant ? qColors[ev.quadrant] : '#ffb86c';
      html += '<div class="cal-event" data-id="' + ev.id + '" style="display:flex;align-items:flex-start;gap:6px;padding:6px 8px;margin-bottom:4px;border-radius:6px;background:rgba(0,0,0,0.2);">';
      html += '<div style="width:3px;align-self:stretch;background:' + barColor + ';border-radius:2px;flex-shrink:0;"></div>';
      html += '<div style="flex:1;min-width:0;">';
      html += '<div style="color:#eef;font-size:12px;font-weight:500;word-break:break-word;">' + escapeHtml(ev.title) + '</div>';
      html += '<div style="color:#8ab;font-size:10px;margin-top:1px;">' + (ev.time || '全天') + '</div>';
      html += '</div>';
      html += '<div class="cal-del" data-id="' + ev.id + '" style="cursor:pointer;color:#6a9;padding:0 4px;font-size:11px;">\u2715</div>';
      html += '</div>';
    });
  }
  html += '</div>';
  html += '</div>';

  // 右栏：今日日程
  html += '<div style="border-radius:8px;padding:8px;background:rgba(0,255,255,0.05);border:1px solid rgba(0,255,255,0.15);display:flex;flex-direction:column;">';
  html += '<div style="color:#5ee8ff;font-size:12px;font-weight:600;margin-bottom:6px;padding:4px 6px;border-radius:4px;background:rgba(0,255,255,0.1);">今日日程</div>';
  html += '<div style="flex:1;overflow-y:auto;">';
  if (sortedEvents.length === 0) {
    html += '<div style="text-align:center;color:#5a7;font-size:11px;padding:10px 0;">暂无</div>';
  } else {
    sortedEvents.forEach(function (ev) {
      const qColors = { 'q1': '#ff5555', 'q2': '#ff9944', 'q3': '#55cc55', 'q4': '#5588ff' };
      const barColor = ev.quadrant ? qColors[ev.quadrant] : '#5ee8ff';
      html += '<div class="cal-event" data-id="' + ev.id + '" style="display:flex;align-items:flex-start;gap:6px;padding:6px 8px;margin-bottom:4px;border-radius:6px;background:rgba(0,0,0,0.2);">';
      html += '<div style="width:3px;align-self:stretch;background:' + barColor + ';border-radius:2px;flex-shrink:0;"></div>';
      html += '<div style="flex:1;min-width:0;">';
      html += '<div style="color:#eef;font-size:12px;font-weight:500;word-break:break-word;">' + escapeHtml(ev.title) + '</div>';
      html += '<div style="color:#8ab;font-size:10px;margin-top:1px;">' + (ev.time || '全天') + '</div>';
      html += '</div>';
      html += '<div class="cal-del" data-id="' + ev.id + '" style="cursor:pointer;color:#6a9;padding:0 4px;font-size:11px;">\u2715</div>';
      html += '</div>';
    });
  }
  html += '</div>';
  html += '</div>';

  html += '</div>';
  return html;
}

// 通知相对时间显示
function relTime(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
  const d = new Date(ts);
  return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

// 通知中心：日历左侧栏，显示历史通知（可折叠）
function renderNotificationCenter() {
  const list = getNotificationHistory();
  const open = state.notifCenterOpen;
  const width = open ? 240 : 42;
  let html = '<div class="notif-center" style="width:' + width + 'px;flex-shrink:0;margin-right:14px;border-right:1px solid rgba(0,255,255,0.12);background:rgba(0,0,0,0.22);display:flex;flex-direction:column;overflow:hidden;">';
  if (!open) {
    // 折叠：竖向窄条
    html += '<div class="notif-center-head" style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:12px 0;cursor:pointer;user-select:none;">';
    html += '<svg width="15" height="15" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 3a6 6 0 00-6 6v3.5L4 16h16l-2-3.5V9a6 6 0 00-6-6z" fill="none" stroke="#5ee8ff" stroke-width="1.8"/></svg>';
    html += '<div style="writing-mode:vertical-rl;font-size:12px;color:#5ee8ff;font-weight:600;letter-spacing:3px;">通知</div>';
    if (list.length > 0) {
      html += '<span style="background:rgba(0,255,255,0.2);color:#5ee8ff;font-size:10px;padding:1px 6px;border-radius:8px;line-height:1.4;">' + list.length + '</span>';
    }
    html += '<span style="font-size:10px;color:#8ab;">▸</span>';
    html += '</div>';
  } else {
    // 展开：固定宽度列
    html += '<div class="notif-center-head" style="display:flex;align-items:center;gap:7px;padding:8px 10px;cursor:pointer;user-select:none;border-bottom:1px solid rgba(0,255,255,0.1);">';
    html += '<svg width="14" height="14" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0;"><path d="M12 3a6 6 0 00-6 6v3.5L4 16h16l-2-3.5V9a6 6 0 00-6-6z" fill="none" stroke="#5ee8ff" stroke-width="1.8"/></svg>';
    html += '<span style="font-size:13px;color:#5ee8ff;font-weight:600;">通知</span>';
    if (list.length > 0) {
      html += '<span style="background:rgba(0,255,255,0.2);color:#5ee8ff;font-size:10px;padding:1px 6px;border-radius:8px;line-height:1.4;">' + list.length + '</span>';
    }
    html += '<span style="margin-left:auto;font-size:10px;color:#8ab;">▾</span>';
    html += '</div>';
    if (list.length === 0) {
      html += '<div style="flex:1;padding:18px 10px;text-align:center;color:#5a7;font-size:11px;">暂无通知</div>';
    } else {
      html += '<div style="flex:1;overflow-y:auto;padding:6px;">';
      list.forEach(function (n) {
        const typeColor = n.type === 'work' ? '#ffb86c' : (n.type === 'class' ? '#5ee8ff' : (n.type === 'countdown' ? '#c8a8ff' : '#8ab'));
        html += '<div class="notif-item" data-id="' + n.id + '" style="display:flex;gap:7px;padding:6px 7px;margin-bottom:4px;border-radius:6px;background:rgba(0,0,0,0.25);align-items:flex-start;">';
        html += '<div style="width:3px;align-self:stretch;background:' + typeColor + ';border-radius:2px;flex-shrink:0;"></div>';
        html += '<div style="flex:1;min-width:0;">';
        html += '<div style="color:#eef;font-size:12px;font-weight:500;word-break:break-word;">' + escapeHtml(n.title) + '</div>';
        if (n.body) html += '<div style="color:#b0d8ee;font-size:11px;margin-top:2px;word-break:break-word;">' + escapeHtml(n.body) + '</div>';
        html += '<div style="color:#5a7;font-size:10px;margin-top:3px;">' + relTime(n.ts) + '</div>';
        html += '</div>';
        html += '<span class="notif-item-del" data-id="' + n.id + '" style="cursor:pointer;color:#6a9;font-size:12px;padding:0 2px;flex-shrink:0;">×</span>';
        html += '</div>';
      });
      html += '</div>';
      html += '<div style="padding:6px 10px;border-top:1px solid rgba(0,255,255,0.1);text-align:right;">';
      html += '<span class="notif-clear-all" style="cursor:pointer;font-size:11px;color:#ff8866;">清空全部</span>';
      html += '</div>';
    }
  }
  html += '</div>';
  return html;
}

function renderCalendar() {
  let html = '<div style="display:flex;align-items:stretch;height:100%;">';
  html += renderNotificationCenter();
  html += '<div style="flex:1;min-width:300px;display:flex;flex-direction:column;height:100%;min-height:0;">';
  html += renderTabs();
  html += '<div style="flex:1;min-height:0;">';
  if (state.calView === 'month') html += renderMonthView();
  else if (state.calView === 'week') html += renderWeekView();
  else if (state.calView === 'day') html += renderDayView();
  else if (state.calView === 'items') html += renderItemsView();
  else if (state.calView === 'anniversary') html += renderAnniversaryView();
  html += '</div>';
  html += '</div>';
  html += '</div>';
  return html;
}

// ── 事项视图：显示所有日程事项 ──
function renderItemsView() {
  const schedule = getSchedule();
  const allEvents = schedule.events.slice();
  const tabs = getTabs();

  const activeTab = tabs.find(t => t.id === state.itemsTab) || tabs[0];
  let filteredEvents = [];
  if (activeTab.id === 'all') {
    filteredEvents = allEvents;
  } else {
    filteredEvents = allEvents.filter(ev => ev.tabId === activeTab.id);
  }

  const q1Events = filteredEvents.filter(ev => ev.quadrant === 'q1');
  const q2Events = filteredEvents.filter(ev => ev.quadrant === 'q2');
  const q3Events = filteredEvents.filter(ev => ev.quadrant === 'q3');
  const q4Events = filteredEvents.filter(ev => ev.quadrant === 'q4');

  function sortEvents(events) {
    return events.slice().sort(function (a, b) {
      const aHasTime = a.time && a.time.trim() !== '';
      const bHasTime = b.time && b.time.trim() !== '';
      if (!aHasTime && bHasTime) return -1;
      if (aHasTime && !bHasTime) return 1;
      if (!aHasTime && !bHasTime) return 0;
      return (a.time || '').localeCompare(b.time || '');
    });
  }

  let html = '<div style="display:flex;flex-direction:column;height:100%;min-height:0;">';

  // 标签栏固定
  html += '<div style="display:flex;gap:4px;margin-bottom:8px;align-items:center;flex-wrap:wrap;">';
  tabs.forEach(function (tab) {
    const isActive = state.itemsTab === tab.id || (!state.itemsTab && tab.id === 'all');
    const bg = isActive ? 'background:rgba(0,255,255,0.18);color:#eef;' : 'color:#8ab;';
    html += '<div class="items-tab" data-tab="' + tab.id + '" style="cursor:pointer;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:500;' + bg + 'display:flex;align-items:center;gap:4px;">';
    html += '<span>' + escapeHtml(tab.name) + '</span>';
    if (!tab.isDefault) {
      html += '<span class="items-tab-del" data-tab-id="' + tab.id + '" style="color:#e88;font-size:10px;margin-left:2px;cursor:pointer;">×</span>';
    }
    html += '</div>';
  });
  html += '<div class="items-add-tab" style="cursor:pointer;padding:4px 8px;border-radius:6px;font-size:11px;color:#5ee8ff;border:1px dashed rgba(0,255,255,0.3);">+ 新增</div>';
  html += '</div>';

  // 四象限区块 flex:1 撑满
  const quadrants = [
    { id: 'q1', name: '重要紧急', color: '#ff5555', events: sortEvents(q1Events) },
    { id: 'q2', name: '重要不紧急', color: '#ff9944', events: sortEvents(q2Events) },
    { id: 'q3', name: '不重要紧急', color: '#55cc55', events: sortEvents(q3Events) },
    { id: 'q4', name: '不重要不紧急', color: '#5588ff', events: sortEvents(q4Events) }
  ];

  html += '<div style="flex:1;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:8px;min-height:0;">';

  quadrants.forEach(function (q) {
    html += '<div style="border-radius:10px;padding:8px;background:' + q.color + '20;border:1px solid ' + q.color + '50;display:flex;flex-direction:column;min-height:0;height:100%;">';
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;padding:4px 6px;border-radius:4px;background:' + q.color + '35;">';
    html += '<div style="color:' + q.color + ';font-size:12px;font-weight:600;">' + q.name + '</div>';
    html += '<div class="cal-add-item-q" data-quadrant="' + q.id + '" style="cursor:pointer;color:' + q.color + ';font-size:16px;font-weight:600;width:20px;height:20px;display:flex;align-items:center;justify-content:center;border-radius:4px;">+</div>';
    html += '</div>';
    html += '<div class="cal-quadrant-scroll" style="flex:1;overflow-y:auto;min-height:0;">';
    if (q.events.length === 0) {
      html += '<div style="text-align:center;color:#5a7;font-size:11px;padding:10px 0;">暂无</div>';
    } else {
      q.events.forEach(function (ev) {
        html += '<div class="cal-event" data-id="' + ev.id + '" style="display:flex;align-items:flex-start;gap:6px;padding:6px 8px;margin-bottom:4px;border-radius:6px;background:rgba(0,0,0,0.25);">';
        html += '<div style="width:3px;align-self:stretch;background:' + q.color + ';border-radius:2px;flex-shrink:0;"></div>';
        html += '<div style="flex:1;min-width:0;">';
        html += '<div style="color:#eef;font-size:12px;font-weight:500;word-break:break-word;">' + escapeHtml(ev.title) + '</div>';
        html += '<div style="color:#8ab;font-size:10px;margin-top:1px;">' + (ev.time || '\u5168\u5929') + '</div>';
        html += '</div>';
        html += '<div class="cal-del" data-id="' + ev.id + '" style="cursor:pointer;color:#6a9;padding:0 4px;font-size:11px;">\u2715</div>';
        html += '</div>';
      });
    }

    html += '</div>'; // 关闭 flex:1 内容容器
    html += '</div>'; // 关闭象限区块外层容器
  });

  html += '</div>'; // 关闭 grid 容器

  html += '</div>';
  return html;
}

function positionCalendar() {
  const calPopup = state.calPopup;
  const el = state.clockEl;
  calPopup.style.visibility = 'hidden';
  calPopup.style.display = 'block';
  const refRect = el.getBoundingClientRect();
  let left = refRect.right - calPopup.offsetWidth;
  if (left < 8) left = 8;
  if (left + calPopup.offsetWidth > window.innerWidth - 8) left = window.innerWidth - 8 - calPopup.offsetWidth;
  let top = refRect.top - calPopup.offsetHeight - 8;
  if (top < 8) top = refRect.bottom + 8;
  if (top + calPopup.offsetHeight > window.innerHeight - 8) top = window.innerHeight - 8 - calPopup.offsetHeight;
  if (top < 8) top = 8;
  calPopup.style.left = left + 'px';
  calPopup.style.top = top + 'px';
  calPopup.style.visibility = 'visible';
}

export function refreshPopup() {
  state.calPopup.innerHTML = renderCalendar();
  positionCalendar();
}

// 注册刷新回调到共享状态（供 schedule-forms 调用）
setRefreshPopup(refreshPopup);
// 注册纪念日视图刷新回调（供 anniversary-form / anniversary-view 调用）
setRefreshAnniversary(refreshPopup);

function showCalendar() {
  state.calViewDate = new Date();
  state.calSelectedDate = new Date();
  state.calView = 'month';
  refreshPopup();
  state.calVisible = true;
  // 展开动画
  state.calPopup.style.pointerEvents = 'auto';
  requestAnimationFrame(function () {
    state.calPopup.style.opacity = '1';
    state.calPopup.style.transform = 'translateY(0) scale(1)';
  });
}

export function hideCalendar() {
  state.calVisible = false;
  state.calPopup.style.pointerEvents = 'none';
  state.calPopup.style.opacity = '0';
  state.calPopup.style.transform = 'translateY(8px) scale(0.96)';
  // 折叠动画结束后再隐藏
  setTimeout(function () {
    if (!state.calVisible) state.calPopup.style.display = 'none';
  }, 180);
}

// 弹窗内事件委托
function bindPopupEvents() {
  const calPopup = state.calPopup;
  const el = state.clockEl;

  el.addEventListener('click', function (e) {
    e.stopPropagation();
    if (state.calVisible) { hideCalendar(); return; }
    showCalendar();
  });

  calPopup.addEventListener('click', function (e) {
    // 通知中心：删除单项
    const notifDel = e.target.closest('.notif-item-del');
    if (notifDel) {
      e.stopPropagation();
      removeNotificationItem(notifDel.dataset.id);
      refreshPopup();
      return;
    }
    // 通知中心：清空全部
    if (e.target.closest('.notif-clear-all')) {
      e.stopPropagation();
      clearNotificationHistory();
      refreshPopup();
      return;
    }
    // 通知中心：展开/折叠
    if (e.target.closest('.notif-center-head')) {
      e.stopPropagation();
      state.notifCenterOpen = !state.notifCenterOpen;
      refreshPopup();
      return;
    }
    // Tab 切换
    const tab = e.target.closest('.cal-tab');
    if (tab) {
      e.stopPropagation();
      state.calView = tab.dataset.tab;
      refreshPopup();
      return;
    }
    // 导航
    const nav = e.target.closest('.cal-nav');
    if (nav) {
      e.stopPropagation();
      const act = nav.dataset.nav;
      if (act === 'prev') state.calViewDate.setMonth(state.calViewDate.getMonth() - 1);
      else if (act === 'next') state.calViewDate.setMonth(state.calViewDate.getMonth() + 1);
      else if (act === 'prev-week') state.calViewDate.setDate(state.calViewDate.getDate() - 7);
      else if (act === 'next-week') state.calViewDate.setDate(state.calViewDate.getDate() + 7);
      else if (act === 'prev-day') state.calSelectedDate.setDate(state.calSelectedDate.getDate() - 1);
      else if (act === 'next-day') state.calSelectedDate.setDate(state.calSelectedDate.getDate() + 1);
      refreshPopup();
      return;
    }
    // 日期格点击 → 切到日视图
    const dayCell = e.target.closest('.cal-day');
    if (dayCell && state.calView === 'month') {
      e.stopPropagation();
      const day = parseInt(dayCell.dataset.day, 10);
      state.calSelectedDate = new Date(state.calViewDate.getFullYear(), state.calViewDate.getMonth(), day);
      state.calView = 'day';
      refreshPopup();
      return;
    }
    // 添加日程
    const addBtn = e.target.closest('.cal-add');
    if (addBtn) {
      e.stopPropagation();
      openEventForm({ date: addBtn.dataset.date });
      return;
    }
    // 事项视图：删除标签（优先处理，因为删除按钮在标签内部）
    const tabDelBtn = e.target.closest('.items-tab-del');
    if (tabDelBtn) {
      e.stopPropagation();
      const tabId = tabDelBtn.dataset.tabId;
      if (removeTab(tabId)) {
        // 如果当前标签被删除，切换回全部
        if (state.itemsTab === tabId) state.itemsTab = 'all';
        refreshPopup();
      }
      return;
    }
    // 事项视图：标签栏切换
    const itemsTab = e.target.closest('.items-tab');
    if (itemsTab) {
      e.stopPropagation();
      state.itemsTab = itemsTab.dataset.tab;
      refreshPopup();
      return;
    }
    // 事项视图：新增标签
    const addTabBtn = e.target.closest('.items-add-tab');
    if (addTabBtn) {
      e.stopPropagation();
      openAddTabForm();
      return;
    }
    // 事项视图：象限加号新建按钮
    const addItemQBtn = e.target.closest('.cal-add-item-q');
    if (addItemQBtn) {
      e.stopPropagation();
      const quadrant = addItemQBtn.dataset.quadrant || 'q1';
      openEventForm({ date: fmtDate(new Date()), tabId: state.itemsTab || 'all', quadrant: quadrant });
      return;
    }
    // 事项视图：右下角添加事项按钮（已删除，保留兼容）
    const addItemBtn = e.target.closest('.cal-add-item');
    if (addItemBtn) {
      e.stopPropagation();
      openEventForm({ date: fmtDate(new Date()), tabId: state.itemsTab || 'all' });
      return;
    }
    // 排班按钮
    const shiftBtn = e.target.closest('.cal-shift-btn');
    if (shiftBtn) {
      e.stopPropagation();
      state.shiftDropdownVisible = !state.shiftDropdownVisible;
      refreshPopup();
      return;
    }
    // 新建班表按钮
    const shiftNewBtn = e.target.closest('.shift-new-btn');
    if (shiftNewBtn) {
      e.stopPropagation();
      state.shiftDropdownVisible = false;
      openShiftForm();
      return;
    }
    // 选择排班方案
    const shiftItem = e.target.closest('.shift-schedule-item');
    if (shiftItem) {
      e.stopPropagation();
      const itemId = shiftItem.dataset.scheduleId;
      // 空ID表示"不排班"
      state.activeShiftId = itemId || null;
      saveActiveShiftId(state.activeShiftId);
      state.shiftDropdownVisible = false;
      refreshPopup();
      return;
    }
    // 删除日程
    const delBtn = e.target.closest('.cal-del');
    if (delBtn) {
      e.stopPropagation();
      removeEvent(delBtn.dataset.id);
      refreshPopup();
      return;
    }
    // 删除周期课程
    const wDelBtn = e.target.closest('.cal-weekly-del');
    if (wDelBtn) {
      e.stopPropagation();
      const wd = parseInt(wDelBtn.dataset.weekday, 10);
      const sl = parseInt(wDelBtn.dataset.slot, 10);
      removeWeeklyAt(wd, sl);
      refreshPopup();
      return;
    }
    // 课程表单元格点击 → 编辑
    const cell = e.target.closest('.cal-cell');
    if (cell && state.calView === 'week') {
      e.stopPropagation();
      const weekday = parseInt(cell.dataset.weekday, 10);
      const slot = parseInt(cell.dataset.slot, 10);
      openWeeklyForm(weekday, slot);
      return;
    }
    // 添加一节
    const addSlotBtn = e.target.closest('.cal-add-slot');
    if (addSlotBtn && state.calView === 'week') {
      e.stopPropagation();
      addSlotClicked();
      return;
    }
    // 设置第一周日期
    const fwBtn = e.target.closest('.cal-set-firstweek');
    if (fwBtn && state.calView === 'week') {
      e.stopPropagation();
      openFirstWeekForm();
      return;
    }
    // 清空全部数据
    const clearBtn = e.target.closest('.cal-clear-all');
    if (clearBtn && state.calView === 'week') {
      e.stopPropagation();
      const stats = getStats();
      const total = stats.events + stats.weekly + stats.slots;
      if (total === 0) return;
      const msg = '\u786E\u8BA4\u6E05\u7A7A\u5168\u90E8\u6570\u636E\uFF1F\n\n\u5C06\u5220\u9664\uFF1A\n\u00B7 \u65E5\u7A0B ' + stats.events + ' \u6761\n\u00B7 \u8BFE\u7A0B ' + stats.weekly + ' \u6761\n\u00B7 \u65F6\u6BB5 ' + stats.slots + ' \u4E2A\n\u00B7 \u8D77\u59CB\u5468\u8BBE\u7F6E\n\n\u6B64\u64CD\u4F5C\u4E0D\u53EF\u64A4\u9500\uFF01';
      if (!window.confirm(msg)) return;
      clearAll();
      state.calView = 'week';
      refreshPopup();
      return;
    }
  });

  // 右键时段格 → 弹出菜单
  calPopup.addEventListener('contextmenu', function (e) {
    // 右键排班选项 → 弹出编辑/删除菜单
    const shiftItem = e.target.closest('.shift-schedule-item');
    if (shiftItem && state.shiftDropdownVisible) {
      const sid = shiftItem.dataset.scheduleId;
      if (!sid) return; // "不排班"项不弹菜单
      e.preventDefault();
      e.stopPropagation();
      openShiftItemMenu(e.clientX, e.clientY, sid);
      return;
    }

    const slotLabel = e.target.closest('.cal-slot-label');
    if (!slotLabel || state.calView !== 'week') return;
    e.preventDefault();
    e.stopPropagation();
    const slotIdx = parseInt(slotLabel.dataset.slot, 10);
    openSlotMenu(e.clientX, e.clientY, slotIdx);
  });

  // 点击外部关闭 - 使用 pointerdown 捕获阶段
  document.addEventListener('pointerdown', function (e) {
    if (!state.calVisible) return;
    // 点击弹窗内部不关闭
    if (calPopup.contains(e.target)) return;
    // 点击时钟元素不关闭（用于切换）
    if (el.contains(e.target)) return;
    // 点击其他表单/菜单不关闭
    if (state.eventFormOverlay && state.eventFormOverlay.style.display === 'flex') return;
    if (state.slotTimeOverlay && state.slotTimeOverlay.style.display === 'flex') return;
    if (state.firstWeekOverlay && state.firstWeekOverlay.style.display === 'flex') return;
    if (state.slotMenu && state.slotMenu.style.display === 'block') return;
    if (state.annFormOverlay && state.annFormOverlay.style.display === 'flex') return;
    // 其他区域都关闭
    hideCalendar();
  }, true); // 捕获阶段

  // 同时在 Three.js canvas 上监听（确保在 OrbitControls 之前触发）
  setTimeout(function () {
    const canvas = document.querySelector('canvas');
    if (canvas) {
      canvas.addEventListener('pointerdown', function (e) {
        if (state.calVisible) hideCalendar();
      }, true); // 捕获阶段
    }
  }, 100); // 延迟确保 canvas 已创建

  // Esc 关闭
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (state.slotTimeOverlay && state.slotTimeOverlay.style.display === 'flex') { hideSlotTimeForm(); return; }
      if (state.firstWeekOverlay && state.firstWeekOverlay.style.display === 'flex') { hideFirstWeekForm(); return; }
      if (state.slotMenu && state.slotMenu.style.display === 'block') { hideSlotMenu(); return; }
      if (state.eventFormOverlay && state.eventFormOverlay.style.display === 'flex') { hideEventForm(); return; }
      if (state.annFormOverlay && state.annFormOverlay.style.display === 'flex') { hideAnniversaryForm(); return; }
      if (state.calVisible) hideCalendar();
    }
  });

  // 窗口大小变化时重新定位
  window.addEventListener('resize', function () {
    if (state.calVisible) positionCalendar();
  });
}

// 时钟 tick
function pad(n) { return n < 10 ? '0' + n : '' + n; }

const weekDays = ['\u5468\u65E5', '\u5468\u4E00', '\u5468\u4E8C', '\u5468\u4E09', '\u5468\u56DB', '\u5468\u4E94', '\u5468\u516D'];

function tick() {
  const now = new Date();
  const hh = pad(now.getHours());
  const mm = pad(now.getMinutes());
  const wd = weekDays[now.getDay()];
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();

  const timeEl = document.getElementById('clockTime');
  const dateEl = document.getElementById('clockDate');
  if (timeEl) timeEl.textContent = hh + ':' + mm;
  if (dateEl) dateEl.textContent = wd + ' ' + y + '/' + m + '/' + d;
}

// 排班选项右键菜单
function openShiftItemMenu(x, y, scheduleId) {
  // 移除已有菜单
  const existing = document.getElementById('shiftItemMenu');
  if (existing) existing.remove();

  const menu = document.createElement('div');
  menu.id = 'shiftItemMenu';
  menu.style.cssText = 'position:fixed;top:' + y + 'px;left:' + x + 'px;background:#1a1d2e;border:1px solid rgba(255,255,255,0.15);border-radius:8px;padding:4px;min-width:100px;box-shadow:0 4px 16px rgba(0,0,0,0.5);z-index:1000000;';
  menu.innerHTML = ''
    + '<div class="shift-item-edit" style="padding:6px 12px;border-radius:4px;cursor:pointer;font-size:12px;color:#5ee8ff;">编辑</div>'
    + '<div class="shift-item-del" style="padding:6px 12px;border-radius:4px;cursor:pointer;font-size:12px;color:#ff6666;">删除</div>';
  document.body.appendChild(menu);

  // 防止超出视口
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 4) + 'px';
  if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 4) + 'px';

  // 编辑
  menu.querySelector('.shift-item-edit').addEventListener('click', function (e) {
    e.stopPropagation();
    menu.remove();
    state.shiftDropdownVisible = false;
    editShiftForm(scheduleId);
    refreshPopup();
  });

  // 删除
  menu.querySelector('.shift-item-del').addEventListener('click', function (e) {
    e.stopPropagation();
    menu.remove();
    removeShiftSchedule(scheduleId);
    if (state.activeShiftId === scheduleId) {
      state.activeShiftId = null;
      saveActiveShiftId(null);
    }
    refreshPopup();
  });

  // 点击外部关闭
  setTimeout(function () {
    document.addEventListener('click', function closeMenu(ev) {
      if (!menu.contains(ev.target)) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    });
  }, 0);
}

export function initCalendarPopup() {
  // 创建日历弹窗
  const calPopup = document.createElement('div');
  calPopup.id = 'clockCalendarPopup';
  calPopup.style.cssText = `
    position: fixed;
    background: rgba(10, 20, 30, 0.95);
    backdrop-filter: blur(16px);
    border: 1px solid rgba(0, 255, 255, 0.25);
    border-radius: 14px;
    padding: 18px 20px 14px;
    color: #b0d8ee;
    font-size: 14px;
    z-index: 999999;
    display: none;
    width: 700px;
    height: 700px;
    box-shadow: 0 12px 48px rgba(0,0,0,0.65);
    user-select: none;
    font-family: system-ui, -apple-system, sans-serif;
    opacity: 0;
    transform: translateY(8px) scale(0.96);
    transform-origin: bottom right;
    transition: opacity 180ms ease, transform 180ms cubic-bezier(0.2, 0.9, 0.3, 1);
    pointer-events: none;
  `;
  document.body.appendChild(calPopup);

  // 添加滚动条样式
  const scrollStyle = document.createElement('style');
  scrollStyle.textContent = `
    .cal-quadrant-scroll::-webkit-scrollbar { width: 6px; }
    .cal-quadrant-scroll::-webkit-scrollbar-track { background: rgba(0,0,0,0.1); border-radius: 3px; }
    .cal-quadrant-scroll::-webkit-scrollbar-thumb { background: rgba(0,255,255,0.3); border-radius: 3px; }
    .cal-quadrant-scroll::-webkit-scrollbar-thumb:hover { background: rgba(0,255,255,0.5); }
    .cal-quadrant-scroll { scrollbar-width: thin; scrollbar-color: rgba(0,255,255,0.3) rgba(0,0,0,0.1); }
  `;
  document.head.appendChild(scrollStyle);

  state.clockEl = document.getElementById('taskbarClock');
  state.calPopup = calPopup;
  if (!state.clockEl) return;

  // 恢复上次选中的排班方案
  const savedShiftId = loadActiveShiftId();
  if (savedShiftId) {
    // 确认该班表仍然存在
    const schedules = getShiftSchedules();
    if (schedules.some(s => s.id === savedShiftId)) {
      state.activeShiftId = savedShiftId;
    }
  }

  // 弹窗打开时定期刷新（保持当前节高亮实时更新 + 纪念日倒计时）
  setInterval(function () {
    if (calPopup.style.display === 'block' && (state.calView === 'week' || state.calView === 'anniversary')) refreshPopup();
  }, 30000);

  // 绑定事件
  bindPopupEvents();
  // 绑定纪念日视图事件
  bindAnniversaryEvents(calPopup);

  // 启动时钟
  tick();
  setInterval(tick, 10000);
}
