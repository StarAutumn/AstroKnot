// ============================================================
//  calendar / shift-form/calendar.js — 迷你日历渲染与常规配置区事件
//  （拆分自 shift-form.js；日期输入/类型切换/大小周/星期按钮的顶层绑定在此文件）
// ============================================================

import {
  overlay,
  elStartDate, elEndDate, elEndDateClear, elStartMiniCal, elEndMiniCal,
  elType, elRegularConfig, elShiftConfig, elSubType, elManualConfig, elPatternConfig,
  elBigSmallToggle, elToggleSlider, elToggleKnob, elWeekdaysNormal, elWeekdaysBigSmall, elFirstWeekConfig
} from './dom.js';
import {
  whichCal, startCalYear, startCalMonth, endCalYear, endCalMonth, startDate, endDate,
  weekdays, bigWeekdays, smallWeekdays,
  setStartDate, setEndDate, setWhichCal, setStartCalYear, setStartCalMonth, setEndCalYear, setEndCalMonth
} from './state.js';
import { renderShiftTypeBtns } from './types-ui.js';
import { renderManualMiniCal, renderPatternShiftTypeBtns, renderPatternCycleBox, renderPatternMiniCal } from './pattern.js';

// ── 迷你日历渲染 ──
function renderMiniCalendar(container, year, month, selectedDate, onPick) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
  let html = '';
  html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">';
  html += '<div class="shift-cal-nav" data-dir="-1" style="cursor:pointer;color:#8ab;padding:2px 8px;font-size:14px;">&#9664;</div>';
  html += '<div style="color:#eef;font-size:12px;font-weight:500;">' + year + '年 ' + monthNames[month] + '</div>';
  html += '<div class="shift-cal-nav" data-dir="1" style="cursor:pointer;color:#8ab;padding:2px 8px;font-size:14px;">&#9654;</div>';
  html += '</div>';

  html += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:1px;margin-bottom:2px;">';
  ['日', '一', '二', '三', '四', '五', '六'].forEach(function (d) {
    html += '<div style="text-align:center;font-size:10px;color:#6a9;padding:2px 0;">' + d + '</div>';
  });
  html += '</div>';

  html += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:1px;">';
  for (let i = 0; i < firstDay; i++) html += '<div></div>';
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day);
    const isToday = d.getTime() === today.getTime();
    const dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
    const isSelected = dateStr === selectedDate;
    const bg = isSelected ? 'background:rgba(0,255,255,0.35);color:#fff;font-weight:600;'
      : (isToday ? 'background:rgba(0,255,255,0.15);color:#eef;font-weight:600;' : 'color:#b0d8ee;');
    html += '<div class="shift-cal-day" data-date="' + dateStr + '" style="text-align:center;padding:3px 0;border-radius:4px;cursor:pointer;font-size:11px;' + bg + '">' + day + '</div>';
  }
  html += '</div>';

  container.innerHTML = html;

  // 绑定事件
  container.querySelectorAll('.shift-cal-day').forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.stopPropagation();
      onPick(el.dataset.date);
    });
  });
  container.querySelectorAll('.shift-cal-nav').forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.stopPropagation();
      const dir = parseInt(el.dataset.dir, 10);
      if (whichCal === 'start') {
        setStartCalMonth(startCalMonth + dir);
        if (startCalMonth < 0) { setStartCalMonth(11); setStartCalYear(startCalYear - 1); }
        if (startCalMonth > 11) { setStartCalMonth(0); setStartCalYear(startCalYear + 1); }
        renderStartCal();
      } else if (whichCal === 'end') {
        setEndCalMonth(endCalMonth + dir);
        if (endCalMonth < 0) { setEndCalMonth(11); setEndCalYear(endCalYear - 1); }
        if (endCalMonth > 11) { setEndCalMonth(0); setEndCalYear(endCalYear + 1); }
        renderEndCal();
      }
    });
  });
}

function renderStartCal() {
  renderMiniCalendar(elStartMiniCal, startCalYear, startCalMonth, startDate, function (dateStr) {
    setStartDate(dateStr);
    const parts = dateStr.split('-');
    elStartDate.value = parts[0] + '/' + parts[1] + '/' + parts[2];
    elStartMiniCal.style.display = 'none';
  });
}

function renderEndCal() {
  renderMiniCalendar(elEndMiniCal, endCalYear, endCalMonth, endDate, function (dateStr) {
    setEndDate(dateStr);
    const parts = dateStr.split('-');
    elEndDate.value = parts[0] + '/' + parts[1] + '/' + parts[2];
    elEndMiniCal.style.display = 'none';
  });
}

// ── 日期输入框事件 ──
elStartDate.addEventListener('click', function (e) {
  e.stopPropagation();
  elEndMiniCal.style.display = 'none';
  elStartMiniCal.style.display = elStartMiniCal.style.display === 'none' ? 'block' : 'none';
  setWhichCal('start');
  if (elStartMiniCal.style.display === 'block') renderStartCal();
});

elEndDate.addEventListener('click', function (e) {
  e.stopPropagation();
  elStartMiniCal.style.display = 'none';
  elEndMiniCal.style.display = elEndMiniCal.style.display === 'none' ? 'block' : 'none';
  setWhichCal('end');
  if (elEndMiniCal.style.display === 'block') renderEndCal();
});

elEndDateClear.addEventListener('click', function (e) {
  e.stopPropagation();
  setEndDate('');
  elEndDate.value = '';
  elEndMiniCal.style.display = 'none';
});

// ── 班表类型切换 ──
elType.addEventListener('change', function () {
  const type = elType.value;
  if (type === 'regular') {
    elRegularConfig.style.display = 'block';
    elShiftConfig.style.display = 'none';
  } else {
    elRegularConfig.style.display = 'none';
    elShiftConfig.style.display = 'block';
    // 初始化手动排班日历和班次按钮
    renderShiftTypeBtns();
    renderManualMiniCal();
  }
});

// ── 子类型切换（手动/规律） ──
elSubType.addEventListener('change', function () {
  const subType = elSubType.value;
  if (subType === 'manual') {
    elManualConfig.style.display = 'block';
    elPatternConfig.style.display = 'none';
    renderShiftTypeBtns();
    renderManualMiniCal();
  } else {
    elManualConfig.style.display = 'none';
    elPatternConfig.style.display = 'block';
    renderPatternShiftTypeBtns();
    renderPatternCycleBox();
    renderPatternMiniCal();
  }
});

// ── 大小周开关 ──
export function updateToggle() {
  const checked = elBigSmallToggle.checked;
  if (checked) {
    elToggleSlider.style.background = 'rgba(0,255,255,0.4)';
    elToggleKnob.style.left = '18px';
    elToggleKnob.style.background = '#5ee8ff';
    elWeekdaysNormal.style.display = 'none';
    elWeekdaysBigSmall.style.display = 'block';
    elFirstWeekConfig.style.display = 'block';
  } else {
    elToggleSlider.style.background = 'rgba(255,255,255,0.15)';
    elToggleKnob.style.left = '2px';
    elToggleKnob.style.background = '#8ab';
    elWeekdaysNormal.style.display = 'block';
    elWeekdaysBigSmall.style.display = 'none';
    elFirstWeekConfig.style.display = 'none';
  }
}

elBigSmallToggle.addEventListener('change', updateToggle);

// ── 星期按钮点击 ──
function bindWeekdayBtns(selector, arr) {
  const btns = overlay.querySelectorAll(selector);
  btns.forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      const day = parseInt(btn.dataset.day, 10); // 真实星期几 (0-6)
      arr[day] = arr[day] ? 0 : 1;
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
  });
}

bindWeekdayBtns('.weekday-btn', weekdays);
bindWeekdayBtns('.big-weekday-btn', bigWeekdays);
bindWeekdayBtns('.small-weekday-btn', smallWeekdays);
