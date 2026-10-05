// ============================================================
//  calendar / shift-form/index.js — 排班编辑弹窗：对外接口与保存逻辑
//  （拆分自 shift-form.js）本目录拆分结构：
//    dom.js      — Overlay DOM 构建与元素引用（模块顶层立即执行）
//    state.js    — 表单状态与 setXxx setter
//    dialogs.js  — 通用对话框
//    calendar.js — 迷你日历渲染与常规配置区事件（日期选择/类型切换/大小周/星期按钮）
//    types-ui.js — 班次按钮渲染、班次右键菜单、新增/删除班次按钮事件
//    pattern.js  — 手动/规律排班渲染与规律排班按钮事件
//    index.js    — openShiftForm / editShiftForm 对外接口与保存事件
// ============================================================

import {
  overlay,
  elTitle, elName, elReminderHour, elReminderMinute, elType, elRegularConfig, elShiftConfig,
  elStartDate, elEndDate, elStartMiniCal, elEndMiniCal, elBigSmallToggle, elFirstWeek,
  elWorkHour, elWorkMinute, elSubType, elManualConfig, elPatternConfig, elConfirm, elCancel
} from './dom.js';
import {
  startDate, endDate, weekdays, bigWeekdays, smallWeekdays, assignedShifts, selectedPatternDate, patternCycle,
  setStartDate, setEndDate, setWeekdays, setBigWeekdays, setSmallWeekdays,
  setStartCalYear, setStartCalMonth, setEndCalYear, setEndCalMonth,
  setManualCalYear, setManualCalMonth, setSelectedManualDate, setAssignedShifts,
  setPatternCalYear, setPatternCalMonth, setSelectedPatternDate, setPatternCycle
} from './state.js';
import { updateToggle } from './calendar.js';
import { renderShiftTypeBtns } from './types-ui.js';
import { renderManualMiniCal, renderPatternShiftTypeBtns, renderPatternCycleBox, renderPatternMiniCal } from './pattern.js';
import { showAlertDialog } from './dialogs.js';
import { refreshPopup } from '../../shared-state.js';
import { addShiftSchedule, getShiftSchedule, updateShiftSchedule } from '../shift-store.js';

// ── 公开函数 ──
let editingId = null;

export function openShiftForm() {
  editingId = null;
  elTitle.textContent = '新建班表';
  elName.value = '';
  elReminderHour.value = '1'; // 默认提前1小时
  elReminderMinute.value = '0';
  elType.value = 'regular';
  elRegularConfig.style.display = 'block';
  elShiftConfig.style.display = 'none';
  elStartDate.value = '';
  elEndDate.value = '';
  elStartMiniCal.style.display = 'none';
  elEndMiniCal.style.display = 'none';
  setStartDate('');
  setEndDate('');
  // 默认：不开启大小周，点亮一二三四五（周一至周五）
  setWeekdays([0, 1, 1, 1, 1, 1, 0]); // 索引0=周日, 1=周一...6=周六
  // 大周默认点亮一二三四五六（周一至周六）
  setBigWeekdays([0, 1, 1, 1, 1, 1, 1]);
  // 小周默认点亮一二三四五（周一至周五）
  setSmallWeekdays([0, 1, 1, 1, 1, 1, 0]);
  elBigSmallToggle.checked = false;
  elFirstWeek.value = 'big';
  elWorkHour.value = '9';
  elWorkMinute.value = '0';
  updateToggle();

  // 重置倒班状态
  elSubType.value = 'manual';
  elManualConfig.style.display = 'block';
  elPatternConfig.style.display = 'none';
  setManualCalYear(null);
  setManualCalMonth(null);
  setSelectedManualDate('');
  setAssignedShifts({});

  // 重置规律排班状态
  setPatternCalYear(null);
  setPatternCalMonth(null);
  setSelectedPatternDate('');
  setPatternCycle([]);

  // 初始化班次按钮
  renderShiftTypeBtns();

  // 设置星期按钮样式（根据默认点亮状态）
  function initBtns(selector, arr) {
    overlay.querySelectorAll(selector).forEach(function (btn) {
      const day = parseInt(btn.dataset.day, 10);
      if (arr[day]) {
        btn.style.background = 'rgba(0,255,255,0.25)';
        btn.style.color = '#5ee8ff';
        btn.style.borderColor = 'rgba(0,255,255,0.4)';
      } else {
        btn.style.background = 'rgba(0,0,0,0.3)';
        btn.style.color = '#8ab';
        btn.style.borderColor = 'rgba(255,255,255,0.2)';
      }
    });
  }
  initBtns('.weekday-btn', weekdays);
  initBtns('.big-weekday-btn', bigWeekdays);
  initBtns('.small-weekday-btn', smallWeekdays);

  // 默认显示当前月
  const now = new Date();
  setStartCalYear(now.getFullYear());
  setStartCalMonth(now.getMonth());
  setEndCalYear(now.getFullYear());
  setEndCalMonth(now.getMonth());

  overlay.style.display = 'flex';
  setTimeout(function () { elName.focus(); }, 50);
}

// 编辑已有班表
export function editShiftForm(scheduleId) {
  const s = getShiftSchedule(scheduleId);
  if (!s) return;
  editingId = scheduleId;
  elTitle.textContent = '编辑班表';

  elName.value = s.name || '';
  // 提前提醒时间
  elReminderHour.value = s.reminderHour != null ? String(s.reminderHour) : '1';
  elReminderMinute.value = s.reminderMinute != null ? String(s.reminderMinute) : '0';
  elType.value = s.type || 'regular';
  elRegularConfig.style.display = s.type === 'regular' ? 'block' : 'none';
  elShiftConfig.style.display = s.type === 'shift' ? 'block' : 'none';

  setStartDate(s.startDate || '');
  setEndDate(s.endDate || '');
  if (startDate) {
    const parts = startDate.split('-');
    elStartDate.value = parts[0] + '/' + parts[1] + '/' + parts[2];
    setStartCalYear(parseInt(parts[0], 10));
    setStartCalMonth(parseInt(parts[1], 10) - 1);
  } else {
    const now = new Date();
    setStartCalYear(now.getFullYear());
    setStartCalMonth(now.getMonth());
  }
  if (endDate) {
    const parts = endDate.split('-');
    elEndDate.value = parts[0] + '/' + parts[1] + '/' + parts[2];
    setEndCalYear(parseInt(parts[0], 10));
    setEndCalMonth(parseInt(parts[1], 10) - 1);
  } else {
    const now = new Date();
    setEndCalYear(now.getFullYear());
    setEndCalMonth(now.getMonth());
  }
  elStartMiniCal.style.display = 'none';
  elEndMiniCal.style.display = 'none';

  // 大小周
  elBigSmallToggle.checked = !!s.bigSmallWeek;
  updateToggle();

  // 上班时间
  elWorkHour.value = s.workHour != null ? String(s.workHour) : '9';
  elWorkMinute.value = s.workMinute != null ? String(s.workMinute) : '0';

  // 恢复星期按钮状态
  function setBtns(selector, arr) {
    const btns = overlay.querySelectorAll(selector);
    btns.forEach(function (btn) {
      const day = parseInt(btn.dataset.day, 10); // 真实星期几 (0-6)
      if (arr[day]) {
        btn.style.background = 'rgba(0,255,255,0.25)';
        btn.style.color = '#5ee8ff';
        btn.style.borderColor = 'rgba(0,255,255,0.4)';
      } else {
        btn.style.background = 'rgba(0,0,0,0.3)';
        btn.style.color = '#8ab';
        btn.style.borderColor = 'rgba(255,255,255,0.2)';
      }
    });
  }

  if (s.bigSmallWeek) {
    setBigWeekdays((s.bigWeekdays || [0,0,0,0,0,0,0]).slice());
    setSmallWeekdays((s.smallWeekdays || [0,0,0,0,0,0,0]).slice());
    setWeekdays([0, 0, 0, 0, 0, 0, 0]);
    setBtns('.big-weekday-btn', bigWeekdays);
    setBtns('.small-weekday-btn', smallWeekdays);
    elFirstWeek.value = s.firstWeekBig !== false ? 'big' : 'small';
  } else {
    setWeekdays((s.weekdays || [0,0,0,0,0,0,0]).slice());
    setBigWeekdays([0, 0, 0, 0, 0, 0, 0]);
    setSmallWeekdays([0, 0, 0, 0, 0, 0, 0]);
    setBtns('.weekday-btn', weekdays);
    elFirstWeek.value = 'big';
  }

  // 倒班数据恢复
  if (s.type === 'shift') {
    elSubType.value = s.subType || 'manual';
    elManualConfig.style.display = (s.subType || 'manual') === 'manual' ? 'block' : 'none';
    elPatternConfig.style.display = s.subType === 'pattern' ? 'block' : 'none';

    if (s.subType === 'pattern') {
      // 规律排班数据恢复
      setPatternCycle((s.cycle || []).slice());
      setSelectedPatternDate(s.startDate || '');
      setPatternCalYear(null);
      setPatternCalMonth(null);
      setAssignedShifts({});
      setManualCalYear(null);
      setManualCalMonth(null);
      setSelectedManualDate('');

      renderPatternShiftTypeBtns();
      renderPatternCycleBox();
      renderPatternMiniCal();
    } else {
      // 手动排班数据恢复
      setAssignedShifts((s.shifts || {}));
      setManualCalYear(null);
      setManualCalMonth(null);
      setSelectedManualDate('');
      setPatternCycle([]);
      setSelectedPatternDate('');
      setPatternCalYear(null);
      setPatternCalMonth(null);

      renderShiftTypeBtns();
      renderManualMiniCal();
    }
  } else {
    // 上班规律时重置倒班状态
    elSubType.value = 'manual';
    elManualConfig.style.display = 'block';
    elPatternConfig.style.display = 'none';
    setAssignedShifts({});
    setSelectedManualDate('');
    setPatternCycle([]);
    setSelectedPatternDate('');
    setPatternCalYear(null);
    setPatternCalMonth(null);
  }

  overlay.style.display = 'flex';
  setTimeout(function () { elName.focus(); }, 50);
}

function hideShiftForm() {
  overlay.style.display = 'none';
}

// ── 保存事件 ──
elConfirm.addEventListener('click', function (e) {
  e.stopPropagation();
  const name = elName.value.trim();
  if (!name) { elName.focus(); return; }

  const type = elType.value;
  if (type === 'regular') {
    if (!startDate) { elStartDate.click(); return; }

    const isBigSmall = elBigSmallToggle.checked;
    let data = {
      name: name,
      type: 'regular',
      startDate: startDate,
      endDate: endDate || null,
      bigSmallWeek: isBigSmall,
      workHour: parseInt(elWorkHour.value, 10),
      workMinute: parseInt(elWorkMinute.value, 10),
      reminderHour: parseInt(elReminderHour.value, 10),
      reminderMinute: parseInt(elReminderMinute.value, 10)
    };

    if (isBigSmall) {
      data.bigWeekdays = bigWeekdays;
      data.smallWeekdays = smallWeekdays;
      data.firstWeekBig = elFirstWeek.value === 'big';
    } else {
      data.weekdays = weekdays;
    }

    if (editingId) {
      updateShiftSchedule(editingId, data);
    } else {
      addShiftSchedule(data);
    }
  } else if (type === 'shift') {
    // 倒班类型
    const subType = elSubType.value;
    if (subType === 'manual') {
      // 手动排班
      if (Object.keys(assignedShifts).length === 0) {
        showAlertDialog('请至少为一个日期设置班次');
        return;
      }
      let data = {
        name: name,
        type: 'shift',
        subType: 'manual',
        shifts: assignedShifts // { dateStr: 'day'|'night'|'rest' }
      };
      if (editingId) {
        updateShiftSchedule(editingId, data);
      } else {
        addShiftSchedule(data);
      }
    } else if (subType === 'pattern') {
      // 规律排班
      if (!selectedPatternDate) {
        showAlertDialog('请选择开始日期');
        return;
      }
      if (patternCycle.length === 0) {
        showAlertDialog('请设置轮班周期');
        return;
      }
      let data = {
        name: name,
        type: 'shift',
        subType: 'pattern',
        startDate: selectedPatternDate,
        cycle: patternCycle // ['day', 'night', 'rest', ...]
      };
      if (editingId) {
        updateShiftSchedule(editingId, data);
      } else {
        addShiftSchedule(data);
      }
    }
  }

  editingId = null;
  hideShiftForm();
  refreshPopup();
});

elCancel.addEventListener('click', function (e) { e.stopPropagation(); hideShiftForm(); });

overlay.addEventListener('click', function (e) {
  if (e.target === overlay) hideShiftForm();
});
