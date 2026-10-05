// ============================================================
//  calendar / shift-form/pattern.js — 手动排班/规律排班渲染与规律排班按钮事件
//  （拆分自 shift-form.js）
// ============================================================

import {
  elManualCal, elPatternCal, elPatternShiftTypeBtns, elPatternCycleBox,
  elPatternAddShiftTypeBtn, elClearCycleBtn
} from './dom.js';
import {
  manualCalYear, manualCalMonth, selectedManualDate, assignedShifts,
  patternCalYear, patternCalMonth, selectedPatternDate, patternCycle,
  setManualCalYear, setManualCalMonth, setSelectedManualDate,
  setPatternCalYear, setPatternCalMonth, setSelectedPatternDate, setPatternCycle
} from './state.js';
import { showInputDialog, showAlertDialog } from './dialogs.js';
import { showShiftTypeMenu, renderShiftTypeBtns } from './types-ui.js';
import { fmtDate } from '../../schedule/schedule-store.js';
import { getShiftTypes, addShiftType } from '../shift-types-store.js';

// ── 手动排班日历渲染 ──
export function renderManualMiniCal() {
  if (!manualCalYear) {
    const now = new Date();
    setManualCalYear(now.getFullYear());
    setManualCalMonth(now.getMonth());
  }

  const firstDay = new Date(manualCalYear, manualCalMonth, 1).getDay();
  const daysInMonth = new Date(manualCalYear, manualCalMonth + 1, 0).getDate();
  const today = new Date();
  const todayStr = fmtDate(today);
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
  const types = getShiftTypes();

  let html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">';
  html += '<div class="manual-cal-nav" data-dir="-1" style="cursor:pointer;color:#8ab;padding:2px 8px;font-size:14px;">&#9664;</div>';
  html += '<div style="color:#eef;font-size:13px;font-weight:500;">' + manualCalYear + '年' + (manualCalMonth + 1) + '月</div>';
  html += '<div class="manual-cal-nav" data-dir="1" style="cursor:pointer;color:#8ab;padding:2px 8px;font-size:14px;">&#9654;</div>';
  html += '</div>';

  // 星期标题
  html += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:4px;">';
  weekDays.forEach(function (w) {
    html += '<div style="text-align:center;font-size:10px;color:#8ab;padding:2px 0;">' + w + '</div>';
  });
  html += '</div>';

  // 日期格子
  html += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;">';
  for (let i = 0; i < firstDay; i++) {
    html += '<div></div>';
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = fmtDate(new Date(manualCalYear, manualCalMonth, day));
    const isToday = dateStr === todayStr;
    const isSelected = dateStr === selectedManualDate;
    const shiftTypeId = assignedShifts[dateStr];
    const shiftType = types.find(t => t.id === shiftTypeId);
    
    let bg = 'background:rgba(0,0,0,0.3);';
    let border = 'border:1px solid rgba(255,255,255,0.15);';
    let textColor = 'color:#eef;';

    if (isSelected) {
      bg = 'background:rgba(0,255,255,0.25);';
      border = 'border:1px solid rgba(0,255,255,0.4);';
      textColor = 'color:#5ee8ff;';
    } else if (isToday) {
      border = 'border:1px solid rgba(255,180,80,0.5);';
    }

    // 班次小字
    let shiftLabelHtml = '';
    if (shiftType) {
      bg = 'background:' + shiftType.color + '20;';
      shiftLabelHtml = '<div style="font-size:8px;color:' + shiftType.color + ';margin-top:1px;">' + shiftType.name + '</div>';
    }

    html += '<div class="manual-cal-day" data-date="' + dateStr + '" style="text-align:center;padding:3px 0;border-radius:4px;cursor:pointer;font-size:11px;' + bg + border + textColor + 'min-height:28px;">';
    html += '<div>' + day + '</div>';
    html += shiftLabelHtml;
    html += '</div>';
  }
  html += '</div>';

  elManualCal.innerHTML = html;

  // 绑定日期点击
  elManualCal.querySelectorAll('.manual-cal-day').forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.stopPropagation();
      setSelectedManualDate(el.dataset.date);
      renderManualMiniCal();
    });
  });

  // 绑定月份导航
  elManualCal.querySelectorAll('.manual-cal-nav').forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.stopPropagation();
      const dir = parseInt(el.dataset.dir, 10);
      setManualCalMonth(manualCalMonth + dir);
      if (manualCalMonth < 0) { setManualCalMonth(11); setManualCalYear(manualCalYear - 1); }
      if (manualCalMonth > 11) { setManualCalMonth(0); setManualCalYear(manualCalYear + 1); }
      renderManualMiniCal();
    });
  });
}

// ── 规律排班日历渲染 ──
export function renderPatternMiniCal() {
  if (!patternCalYear) {
    const now = new Date();
    setPatternCalYear(now.getFullYear());
    setPatternCalMonth(now.getMonth());
  }

  const firstDay = new Date(patternCalYear, patternCalMonth, 1).getDay();
  const daysInMonth = new Date(patternCalYear, patternCalMonth + 1, 0).getDate();
  const today = new Date();
  const todayStr = fmtDate(today);
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
  const types = getShiftTypes();

  // 计算天数差（用于确定周期中的班次）
  function getShiftForDate(dateStr) {
    if (!selectedPatternDate || patternCycle.length === 0) return null;

    // 解析日期
    const dateParts = dateStr.split('-');
    const dateObj = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
    const startParts = selectedPatternDate.split('-');
    const startDateObj = new Date(parseInt(startParts[0]), parseInt(startParts[1]) - 1, parseInt(startParts[2]));

    // 计算天数差（只计算开始日期之后的日期）
    const diffTime = dateObj.getTime() - startDateObj.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return null; // 开始日期之前的日期不显示班次

    // 根据周期长度循环
    const cycleIndex = diffDays % patternCycle.length;
    const shiftTypeId = patternCycle[cycleIndex];
    return types.find(t => t.id === shiftTypeId);
  }

  let html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">';
  html += '<div class="pattern-cal-nav" data-dir="-1" style="cursor:pointer;color:#8ab;padding:2px 8px;font-size:14px;">&#9664;</div>';
  html += '<div style="color:#eef;font-size:13px;font-weight:500;">' + patternCalYear + '年' + (patternCalMonth + 1) + '月</div>';
  html += '<div class="pattern-cal-nav" data-dir="1" style="cursor:pointer;color:#8ab;padding:2px 8px;font-size:14px;">&#9654;</div>';
  html += '</div>';

  // 星期标题
  html += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:4px;">';
  weekDays.forEach(function (w) {
    html += '<div style="text-align:center;font-size:10px;color:#8ab;padding:2px 0;">' + w + '</div>';
  });
  html += '</div>';

  // 日期格子
  html += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;">';
  for (let i = 0; i < firstDay; i++) {
    html += '<div></div>';
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = fmtDate(new Date(patternCalYear, patternCalMonth, day));
    const isToday = dateStr === todayStr;
    const isSelected = dateStr === selectedPatternDate;
    const shiftType = getShiftForDate(dateStr);

    let bg = 'background:rgba(0,0,0,0.3);';
    let border = 'border:1px solid rgba(255,255,255,0.15);';
    let textColor = 'color:#eef;';

    if (isSelected) {
      bg = 'background:rgba(0,255,255,0.25);';
      border = 'border:1px solid rgba(0,255,255,0.4);';
      textColor = 'color:#5ee8ff;';
    } else if (isToday) {
      border = 'border:1px solid rgba(255,180,80,0.5);';
    }

    // 班次小字
    let shiftLabelHtml = '';
    if (shiftType) {
      bg = 'background:' + shiftType.color + '20;';
      shiftLabelHtml = '<div style="font-size:8px;color:' + shiftType.color + ';margin-top:1px;">' + shiftType.name + '</div>';
    }

    html += '<div class="pattern-cal-day" data-date="' + dateStr + '" style="text-align:center;padding:3px 0;border-radius:4px;cursor:pointer;font-size:11px;' + bg + border + textColor + 'min-height:28px;">';
    html += '<div>' + day + '</div>';
    html += shiftLabelHtml;
    html += '</div>';
  }
  html += '</div>';

  elPatternCal.innerHTML = html;

  // 绑定日期点击
  elPatternCal.querySelectorAll('.pattern-cal-day').forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.stopPropagation();
      setSelectedPatternDate(el.dataset.date);
      renderPatternMiniCal();
    });
  });

  // 绑定月份导航
  elPatternCal.querySelectorAll('.pattern-cal-nav').forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.stopPropagation();
      const dir = parseInt(el.dataset.dir, 10);
      setPatternCalMonth(patternCalMonth + dir);
      if (patternCalMonth < 0) { setPatternCalMonth(11); setPatternCalYear(patternCalYear - 1); }
      if (patternCalMonth > 11) { setPatternCalMonth(0); setPatternCalYear(patternCalYear + 1); }
      renderPatternMiniCal();
    });
  });
}

// ── 规律排班班次按钮渲染 ──
export function renderPatternShiftTypeBtns() {
  const types = getShiftTypes();
  let html = '';
  types.forEach(function (t) {
    html += '<div class="pattern-shift-type-btn" data-type="' + t.id + '" style="text-align:center;padding:8px 0;border-radius:6px;border:1px solid ' + t.color + ';background:rgba(0,0,0,0.3);color:' + t.color + ';cursor:pointer;font-size:12px;font-weight:500;min-width:60px;">' + t.name + '</div>';
  });
  elPatternShiftTypeBtns.innerHTML = html;

  // 绑定班次按钮点击（添加到轮班周期）
  elPatternShiftTypeBtns.querySelectorAll('.pattern-shift-type-btn').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      const type = btn.dataset.type;
      patternCycle.push(type);
      renderPatternCycleBox();
    });

    // 右键菜单（重命名、删除）
    btn.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      e.stopPropagation();
      const typeId = btn.dataset.type;
      showShiftTypeMenu(e.clientX, e.clientY, typeId);
    });
  });
}

// ── 轮班周期方框渲染 ──
export function renderPatternCycleBox() {
  const types = getShiftTypes();

  if (patternCycle.length === 0) {
    elPatternCycleBox.innerHTML = '<div style="font-size:11px;color:#6a9;">点击下方班次按钮添加周期</div>';
    return;
  }

  let html = '';
  patternCycle.forEach(function (typeId, idx) {
    const type = types.find(t => t.id === typeId);
    if (type) {
      html += '<div class="cycle-item" data-idx="' + idx + '" style="padding:6px 12px;border-radius:6px;border:1px solid ' + type.color + ';background:' + type.color + '20;color:' + type.color + ';cursor:pointer;font-size:12px;display:flex;align-items:center;gap:4px;">';
      html += '<span>' + type.name + '</span>';
      html += '<span class="cycle-remove" data-idx="' + idx + '" style="font-size:10px;color:' + type.color + ';opacity:0.6;margin-left:2px;">×</span>';
      html += '</div>';
    }
  });
  elPatternCycleBox.innerHTML = html;

  // 绑定删除按钮
  elPatternCycleBox.querySelectorAll('.cycle-remove').forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.stopPropagation();
      const idx = parseInt(el.dataset.idx, 10);
      patternCycle.splice(idx, 1);
      renderPatternCycleBox();
    });
  });
}

// ── 规律排班新增班次 ──
elPatternAddShiftTypeBtn.addEventListener('click', function (e) {
  e.stopPropagation();
  showInputDialog('请输入班次名称', '例如：加班', function (name) {
    const result = addShiftType(name);
    if (result) {
      renderPatternShiftTypeBtns();
      renderShiftTypeBtns(); // 同步更新手动排班的班次按钮
      renderPatternCycleBox(); // 更新周期方框颜色
    } else {
      showAlertDialog('班次名称已存在');
    }
  });
});

// ── 清空周期 ──
elClearCycleBtn.addEventListener('click', function (e) {
  e.stopPropagation();
  setPatternCycle([]);
  renderPatternCycleBox();
});
