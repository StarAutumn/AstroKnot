// ============================================================
//  calendar / shift-form.js — 排班编辑弹窗
// ============================================================
import { state, refreshPopup } from './shared-state.js';
import { addShiftSchedule, getShiftSchedule, updateShiftSchedule } from './shift-store.js';
import { fmtDate } from './schedule-store.js';
import { getShiftTypes, addShiftType, updateShiftType, updateShiftTypeWorkTime, removeShiftType } from './shift-types-store.js';

const weekLabels = ['一', '二', '三', '四', '五', '六', '日'];
// 按钮顺序对应的真实星期几（JS Date.getDay: 0=周日, 1=周一...）
const weekDayMap = [1, 2, 3, 4, 5, 6, 0]; // 一=1, 二=2...日=0

// ── 创建 Overlay DOM ──
const overlay = document.createElement('div');
overlay.id = 'shiftFormOverlay';
overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);display:none;align-items:center;justify-content:center;z-index:10001;';
overlay.innerHTML = `
  <div style="width:460px;max-width:92vw;max-height:88vh;overflow-y:auto;background:#1a1d2e;border-radius:12px;padding:18px;box-shadow:0 8px 32px rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.1);">
    <div id="shiftFormTitle" style="font-size:15px;font-weight:600;color:#eef;margin-bottom:14px;">新建班表</div>

    <!-- 班表名称 -->
    <div style="margin-bottom:12px;">
      <div style="font-size:11px;color:#8ab;margin-bottom:4px;">班表名称</div>
      <input id="shiftNameInput" type="text" placeholder="输入班表名称" style="width:100%;box-sizing:border-box;padding:7px 10px;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:#eef;font-size:13px;outline:none;" />
    </div>

    <!-- 提前提醒时间 -->
    <div style="margin-bottom:12px;">
      <div style="font-size:11px;color:#8ab;margin-bottom:4px;">提前提醒时间</div>
      <div style="display:flex;align-items:center;gap:6px;">
        <select id="reminderHourSelect" style="flex:1;box-sizing:border-box;padding:7px 10px;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:#eef;font-size:13px;outline:none;">
          <option value="0">0</option>
          <option value="1" selected>1</option>
          <option value="2">2</option>
          <option value="3">3</option>
          <option value="4">4</option>
          <option value="5">5</option>
          <option value="6">6</option>
          <option value="7">7</option>
          <option value="8">8</option>
          <option value="9">9</option>
          <option value="10">10</option>
          <option value="11">11</option>
          <option value="12">12</option>
        </select>
        <span style="color:#8ab;font-size:12px;">时</span>
        <select id="reminderMinuteSelect" style="flex:1;box-sizing:border-box;padding:7px 10px;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:#eef;font-size:13px;outline:none;">
          <option value="0" selected>00</option>
          <option value="15">15</option>
          <option value="30">30</option>
          <option value="45">45</option>
        </select>
        <span style="color:#8ab;font-size:12px;">分</span>
      </div>
    </div>

    <!-- 班表类型 -->
    <div style="margin-bottom:12px;">
      <div style="font-size:11px;color:#8ab;margin-bottom:4px;">班表类型</div>
      <select id="shiftTypeSelect" style="width:100%;box-sizing:border-box;padding:7px 10px;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:#eef;font-size:13px;outline:none;">
        <option value="regular">上班规律</option>
        <option value="shift">倒班</option>
      </select>
    </div>

    <!-- 上班规律配置区域 -->
    <div id="regularConfig">
      <!-- 日期范围 -->
      <div style="margin-bottom:12px;">
        <div style="font-size:11px;color:#8ab;margin-bottom:4px;">开始日期</div>
        <input id="shiftStartDateInput" type="text" readonly placeholder="点击选择日期" style="width:100%;box-sizing:border-box;padding:7px 10px;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:#eef;font-size:13px;outline:none;cursor:pointer;" />
        <div id="shiftStartMiniCal" style="margin-top:8px;display:none;padding:8px;background:rgba(0,0,0,0.3);border-radius:8px;border:1px solid rgba(255,255,255,0.1);"></div>
      </div>
      <div style="margin-bottom:12px;">
        <div style="font-size:11px;color:#8ab;margin-bottom:4px;">结束日期（不选为长期）</div>
        <div style="display:flex;gap:6px;align-items:center;">
          <input id="shiftEndDateInput" type="text" readonly placeholder="点击选择日期" style="flex:1;box-sizing:border-box;padding:7px 10px;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:#eef;font-size:13px;outline:none;cursor:pointer;" />
          <button id="shiftEndDateClear" style="padding:6px 10px;border-radius:6px;border:1px solid rgba(255,100,100,0.3);background:rgba(255,100,100,0.1);color:#e88;font-size:12px;cursor:pointer;">清除</button>
        </div>
        <div id="shiftEndMiniCal" style="margin-top:8px;display:none;padding:8px;background:rgba(0,0,0,0.3);border-radius:8px;border:1px solid rgba(255,255,255,0.1);"></div>
      </div>

      <!-- 大小周开关 -->
      <div style="margin-bottom:12px;display:flex;align-items:center;gap:10px;">
        <span style="font-size:11px;color:#8ab;">大小周</span>
        <label style="position:relative;display:inline-block;width:36px;height:20px;cursor:pointer;">
          <input id="bigSmallWeekToggle" type="checkbox" style="opacity:0;width:0;height:0;">
          <span id="toggleSlider" style="position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(255,255,255,0.15);border-radius:10px;transition:0.3s;"></span>
          <span id="toggleKnob" style="position:absolute;top:2px;left:2px;width:16px;height:16px;background:#8ab;border-radius:50%;transition:0.3s;"></span>
        </label>
      </div>

      <!-- 普通模式：单行星期选择 -->
      <div id="weekdaysNormal" style="margin-bottom:12px;">
        <div style="font-size:11px;color:#8ab;margin-bottom:4px;">工作日</div>
        <div id="weekdayBtns" style="display:flex;gap:6px;">
          ${weekLabels.map((w, i) => `<div class="weekday-btn" data-idx="${i}" data-day="${weekDayMap[i]}" style="flex:1;text-align:center;padding:8px 0;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:rgba(0,0,0,0.3);color:#8ab;cursor:pointer;font-size:13px;font-weight:500;">${w}</div>`).join('')}
        </div>
      </div>

      <!-- 大小周模式：大周小周两行 -->
      <div id="weekdaysBigSmall" style="margin-bottom:12px;display:none;">
        <div style="font-size:11px;color:#8ab;margin-bottom:4px;">大周工作日</div>
        <div id="bigWeekdayBtns" style="display:flex;gap:6px;margin-bottom:8px;">
          ${weekLabels.map((w, i) => `<div class="big-weekday-btn" data-idx="${i}" data-day="${weekDayMap[i]}" style="flex:1;text-align:center;padding:8px 0;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:rgba(0,0,0,0.3);color:#8ab;cursor:pointer;font-size:13px;font-weight:500;">${w}</div>`).join('')}
        </div>
        <div style="font-size:11px;color:#8ab;margin-bottom:4px;">小周工作日</div>
        <div id="smallWeekdayBtns" style="display:flex;gap:6px;">
          ${weekLabels.map((w, i) => `<div class="small-weekday-btn" data-idx="${i}" data-day="${weekDayMap[i]}" style="flex:1;text-align:center;padding:8px 0;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:rgba(0,0,0,0.3);color:#8ab;cursor:pointer;font-size:13px;font-weight:500;">${w}</div>`).join('')}
        </div>
      </div>

      <!-- 首周大/小周选择 -->
      <div id="firstWeekConfig" style="margin-bottom:12px;display:none;">
        <div style="font-size:11px;color:#8ab;margin-bottom:4px;">首周处于</div>
        <select id="firstWeekSelect" style="width:100%;box-sizing:border-box;padding:7px 10px;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:#eef;font-size:13px;outline:none;">
          <option value="big">大周</option>
          <option value="small">小周</option>
        </select>
      </div>

      <!-- 上班时间 -->
      <div style="margin-bottom:12px;">
        <div style="font-size:11px;color:#8ab;margin-bottom:4px;">上班时间</div>
        <div style="display:flex;align-items:center;gap:6px;">
          <select id="workHourSelect" style="flex:1;box-sizing:border-box;padding:7px 10px;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:#eef;font-size:13px;outline:none;">
            ${Array.from({length:24}, (_, i) => `<option value="${i}">${String(i).padStart(2,'0')}</option>`).join('')}
          </select>
          <span style="color:#8ab;font-size:14px;">:</span>
          <select id="workMinuteSelect" style="flex:1;box-sizing:border-box;padding:7px 10px;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:#eef;font-size:13px;outline:none;">
            ${Array.from({length:60}, (_, i) => `<option value="${i}">${String(i).padStart(2,'0')}</option>`).join('')}
          </select>
        </div>
      </div>
    </div>

    <!-- 倒班配置区域 -->
    <div id="shiftConfig" style="display:none;margin-bottom:12px;">
      <!-- 排班方式 -->
      <div style="margin-bottom:12px;">
        <div style="font-size:11px;color:#8ab;margin-bottom:4px;">排班方式</div>
        <select id="shiftSubTypeSelect" style="width:100%;box-sizing:border-box;padding:7px 10px;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:#eef;font-size:13px;outline:none;">
          <option value="manual">手动排班</option>
          <option value="pattern">规律排班</option>
        </select>
      </div>

      <!-- 手动排班配置 -->
      <div id="manualShiftConfig">
        <!-- 日历表 -->
        <div style="margin-bottom:12px;">
          <div style="font-size:11px;color:#8ab;margin-bottom:4px;">选择日期</div>
          <div id="shiftManualCal" style="padding:10px;background:rgba(0,0,0,0.3);border-radius:8px;border:1px solid rgba(255,255,255,0.1);"></div>
        </div>
        <!-- 班次选择 -->
        <div style="margin-bottom:12px;">
          <div style="font-size:11px;color:#8ab;margin-bottom:6px;">选择班次</div>
          <div id="shiftTypeBtns" style="display:flex;gap:8px;flex-wrap:wrap;"></div>
          <div style="margin-top:6px;display:flex;gap:8px;">
            <div id="addShiftTypeBtn" style="flex:1;text-align:center;padding:6px 0;border-radius:6px;border:1px dashed rgba(255,255,255,0.3);background:rgba(0,0,0,0.2);color:#8ab;cursor:pointer;font-size:11px;">+ 新增班次</div>
            <div id="deleteShiftBtn" style="flex:1;text-align:center;padding:6px 0;border-radius:6px;border:1px solid rgba(255,100,100,0.4);background:rgba(0,0,0,0.3);color:#ff6464;cursor:pointer;font-size:11px;">删除班次</div>
          </div>
        </div>
      </div>

      <!-- 规律排班配置 -->
      <div id="patternShiftConfig" style="display:none;">
        <!-- 日历表 -->
        <div style="margin-bottom:12px;">
          <div style="font-size:11px;color:#8ab;margin-bottom:4px;">开始日期</div>
          <div id="patternManualCal" style="padding:10px;background:rgba(0,0,0,0.3);border-radius:8px;border:1px solid rgba(255,255,255,0.1);"></div>
        </div>
        <!-- 轮班周期 -->
        <div style="margin-bottom:12px;">
          <div style="font-size:11px;color:#8ab;margin-bottom:4px;">轮班周期（点击班次按钮添加）</div>
          <div id="patternCycleBox" style="padding:10px;background:rgba(0,0,0,0.3);border-radius:8px;border:1px solid rgba(255,255,255,0.1);min-height:40px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
            <div style="font-size:11px;color:#6a9;">点击下方班次按钮添加周期</div>
          </div>
          <div style="margin-top:6px;display:flex;gap:8px;">
            <div id="clearCycleBtn" style="flex:1;text-align:center;padding:6px 0;border-radius:6px;border:1px solid rgba(255,100,100,0.4);background:rgba(0,0,0,0.3);color:#ff6464;cursor:pointer;font-size:11px;">清空周期</div>
          </div>
        </div>
        <!-- 班次选择 -->
        <div style="margin-bottom:12px;">
          <div style="font-size:11px;color:#8ab;margin-bottom:6px;">选择班次</div>
          <div id="patternShiftTypeBtns" style="display:flex;gap:8px;flex-wrap:wrap;"></div>
          <div style="margin-top:6px;display:flex;gap:8px;">
            <div id="patternAddShiftTypeBtn" style="flex:1;text-align:center;padding:6px 0;border-radius:6px;border:1px dashed rgba(255,255,255,0.3);background:rgba(0,0,0,0.2);color:#8ab;cursor:pointer;font-size:11px;">+ 新增班次</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 按钮 -->
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px;">
      <button id="shiftFormCancel" style="padding:8px 18px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:transparent;color:#8ab;font-size:13px;cursor:pointer;">取消</button>
      <button id="shiftFormConfirm" style="padding:8px 18px;border-radius:6px;border:1px solid rgba(0,255,255,0.3);background:rgba(0,255,255,0.15);color:#5ee8ff;font-size:13px;cursor:pointer;font-weight:600;">保存</button>
    </div>
  </div>
`;

document.body.appendChild(overlay);

// 注册到共享状态
state.shiftFormOverlay = overlay;

// ── DOM 引用 ──
const elTitle = overlay.querySelector('#shiftFormTitle');
const elName = overlay.querySelector('#shiftNameInput');
const elReminderHour = overlay.querySelector('#reminderHourSelect');
const elReminderMinute = overlay.querySelector('#reminderMinuteSelect');
const elType = overlay.querySelector('#shiftTypeSelect');
const elRegularConfig = overlay.querySelector('#regularConfig');
const elShiftConfig = overlay.querySelector('#shiftConfig');
const elStartDate = overlay.querySelector('#shiftStartDateInput');
const elStartMiniCal = overlay.querySelector('#shiftStartMiniCal');
const elEndDate = overlay.querySelector('#shiftEndDateInput');
const elEndDateClear = overlay.querySelector('#shiftEndDateClear');
const elEndMiniCal = overlay.querySelector('#shiftEndMiniCal');
const elBigSmallToggle = overlay.querySelector('#bigSmallWeekToggle');
const elToggleSlider = overlay.querySelector('#toggleSlider');
const elToggleKnob = overlay.querySelector('#toggleKnob');
const elWeekdaysNormal = overlay.querySelector('#weekdaysNormal');
const elWeekdaysBigSmall = overlay.querySelector('#weekdaysBigSmall');
const elFirstWeekConfig = overlay.querySelector('#firstWeekConfig');
const elFirstWeek = overlay.querySelector('#firstWeekSelect');
const elWorkHour = overlay.querySelector('#workHourSelect');
const elWorkMinute = overlay.querySelector('#workMinuteSelect');
const elConfirm = overlay.querySelector('#shiftFormConfirm');
const elCancel = overlay.querySelector('#shiftFormCancel');

// 倒班相关DOM引用
const elSubType = overlay.querySelector('#shiftSubTypeSelect');
const elManualConfig = overlay.querySelector('#manualShiftConfig');
const elPatternConfig = overlay.querySelector('#patternShiftConfig');
const elManualCal = overlay.querySelector('#shiftManualCal');
const elShiftTypeBtns = overlay.querySelector('#shiftTypeBtns');
const elAddShiftTypeBtn = overlay.querySelector('#addShiftTypeBtn');
const elDeleteShiftBtn = overlay.querySelector('#deleteShiftBtn');

// 规律排班相关DOM引用
const elPatternCal = overlay.querySelector('#patternManualCal');
const elPatternCycleBox = overlay.querySelector('#patternCycleBox');
const elPatternShiftTypeBtns = overlay.querySelector('#patternShiftTypeBtns');
const elPatternAddShiftTypeBtn = overlay.querySelector('#patternAddShiftTypeBtn');
const elClearCycleBtn = overlay.querySelector('#clearCycleBtn');

// ── 状态 ──
let weekdays = [0, 0, 0, 0, 0, 0, 0]; // 普通模式
let bigWeekdays = [0, 0, 0, 0, 0, 0, 0]; // 大周
let smallWeekdays = [0, 0, 0, 0, 0, 0, 0]; // 小周
let startDate = '';
let endDate = '';
let startCalYear, startCalMonth;
let endCalYear, endCalMonth;
let whichCal = null; // 'start' or 'end'，标记当前展开的是哪个日历

// 倒班手动排班状态
let manualCalYear, manualCalMonth;
let selectedManualDate = ''; // 当前选中的日期
let assignedShifts = {}; // { '2026-06-29': 'day', '2026-06-30': 'night', ... }

// 规律排班状态
let patternCalYear, patternCalMonth;
let selectedPatternDate = ''; // 规律排班选中的开始日期
let patternCycle = []; // 轮班周期数组 ['day', 'night', 'rest', ...]

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
        startCalMonth += dir;
        if (startCalMonth < 0) { startCalMonth = 11; startCalYear--; }
        if (startCalMonth > 11) { startCalMonth = 0; startCalYear++; }
        renderStartCal();
      } else if (whichCal === 'end') {
        endCalMonth += dir;
        if (endCalMonth < 0) { endCalMonth = 11; endCalYear--; }
        if (endCalMonth > 11) { endCalMonth = 0; endCalYear++; }
        renderEndCal();
      }
    });
  });
}

function renderStartCal() {
  renderMiniCalendar(elStartMiniCal, startCalYear, startCalMonth, startDate, function (dateStr) {
    startDate = dateStr;
    const parts = dateStr.split('-');
    elStartDate.value = parts[0] + '/' + parts[1] + '/' + parts[2];
    elStartMiniCal.style.display = 'none';
  });
}

function renderEndCal() {
  renderMiniCalendar(elEndMiniCal, endCalYear, endCalMonth, endDate, function (dateStr) {
    endDate = dateStr;
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
  whichCal = 'start';
  if (elStartMiniCal.style.display === 'block') renderStartCal();
});

elEndDate.addEventListener('click', function (e) {
  e.stopPropagation();
  elStartMiniCal.style.display = 'none';
  elEndMiniCal.style.display = elEndMiniCal.style.display === 'none' ? 'block' : 'none';
  whichCal = 'end';
  if (elEndMiniCal.style.display === 'block') renderEndCal();
});

elEndDateClear.addEventListener('click', function (e) {
  e.stopPropagation();
  endDate = '';
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
function updateToggle() {
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

// ── 班次按钮渲染 ──
function renderShiftTypeBtns() {
  const types = getShiftTypes();
  let html = '';
  types.forEach(function (t) {
    html += '<div class="shift-type-btn" data-type="' + t.id + '" style="text-align:center;padding:8px 0;border-radius:6px;border:1px solid ' + t.color + ';background:rgba(0,0,0,0.3);color:' + t.color + ';cursor:pointer;font-size:12px;font-weight:500;min-width:60px;">' + t.name + '</div>';
  });
  elShiftTypeBtns.innerHTML = html;
  
  // 绑定班次按钮点击
  elShiftTypeBtns.querySelectorAll('.shift-type-btn').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (!selectedManualDate) return;
      const type = btn.dataset.type;
      assignedShifts[selectedManualDate] = type;
      renderManualMiniCal();
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

// ── 班次右键菜单 ──
function showShiftTypeMenu(x, y, typeId) {
  // 移除旧菜单
  const oldMenu = document.getElementById('shiftTypeMenu');
  if (oldMenu) oldMenu.remove();
  
  const menu = document.createElement('div');
  menu.id = 'shiftTypeMenu';
  menu.style.cssText = 'position:fixed;top:' + y + 'px;left:' + x + 'px;background:rgba(30,30,45,0.98);border:1px solid rgba(255,255,255,0.15);border-radius:8px;padding:6px 0;min-width:100px;z-index:1000001;box-shadow:0 4px 20px rgba(0,0,0,0.5);';
  
  // 重命名
  menu.innerHTML += '<div class="shift-type-menu-item" data-action="rename" data-id="' + typeId + '" style="padding:8px 12px;cursor:pointer;font-size:12px;color:#eef;border-radius:4px;margin:2px 4px;">重命名</div>';
  // 设置上班时间（休息不需要）
  if (typeId !== 'rest') {
    menu.innerHTML += '<div class="shift-type-menu-item" data-action="settime" data-id="' + typeId + '" style="padding:8px 12px;cursor:pointer;font-size:12px;color:#eef;border-radius:4px;margin:2px 4px;">设置上班时间</div>';
  }
  // 删除（默认班次不允许删除）
  const isDefault = (typeId === 'day' || typeId === 'night' || typeId === 'rest');
  if (!isDefault) {
    menu.innerHTML += '<div class="shift-type-menu-item" data-action="delete" data-id="' + typeId + '" style="padding:8px 12px;cursor:pointer;font-size:12px;color:#ff6464;border-radius:4px;margin:2px 4px;">删除</div>';
  }
  
  document.body.appendChild(menu);
  
  // 绑定菜单项点击
  menu.querySelectorAll('.shift-type-menu-item').forEach(function (item) {
    item.addEventListener('click', function (e) {
      e.stopPropagation();
      const action = item.dataset.action;
      const id = item.dataset.id;
      menu.remove();
      
      if (action === 'rename') {
        showInputDialog('请输入新的班次名称', '例如：加班', function (newName) {
          if (updateShiftType(id, newName)) {
            renderShiftTypeBtns();
            renderManualMiniCal();
            renderPatternShiftTypeBtns(); // 同步更新规律排班班次按钮
            renderPatternCycleBox(); // 同步更新轮班周期方框
            renderPatternMiniCal(); // 同步更新规律排班日历
          } else {
            showAlertDialog('班次名称已存在或更新失败');
          }
        });
      } else if (action === 'settime') {
        showWorkTimeDialog(id);
      } else if (action === 'delete') {
        showConfirmDialog('确定删除该班次？', function () {
          removeShiftType(id);
          // 清除使用该班次的日期（手动排班）
          Object.keys(assignedShifts).forEach(function (dateStr) {
            if (assignedShifts[dateStr] === id) {
              delete assignedShifts[dateStr];
            }
          });
          // 清除使用该班次的周期（规律排班）
          patternCycle = patternCycle.filter(function (typeId) {
            return typeId !== id;
          });
          renderShiftTypeBtns();
          renderManualMiniCal();
          renderPatternShiftTypeBtns(); // 同步更新规律排班班次按钮
          renderPatternCycleBox(); // 同步更新轮班周期方框
          renderPatternMiniCal(); // 同步更新规律排班日历
        });
      }
    });
    
    item.addEventListener('mouseenter', function () {
      item.style.background = 'rgba(255,255,255,0.1)';
    });
    item.addEventListener('mouseleave', function () {
      item.style.background = 'transparent';
    });
  });
  
  // 点击外部关闭（使用 mousedown + pointerdown + 捕获模式）
  setTimeout(function () {
    document.addEventListener('mousedown', closeShiftTypeMenu, true);
    document.addEventListener('pointerdown', closeShiftTypeMenu, true);
  }, 0);
}

function closeShiftTypeMenu() {
  const menu = document.getElementById('shiftTypeMenu');
  if (menu) menu.remove();
  document.removeEventListener('mousedown', closeShiftTypeMenu, true);
  document.removeEventListener('pointerdown', closeShiftTypeMenu, true);
}

// ── 自定义输入对话框 ──
function showInputDialog(title, placeholder, onConfirm) {
  const dialog = document.createElement('div');
  dialog.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:100002;';
  dialog.innerHTML = `
    <div style="width:300px;max-width:90vw;background:#1a1d2e;border-radius:10px;padding:16px;box-shadow:0 8px 32px rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.1);">
      <div style="font-size:13px;color:#eef;margin-bottom:12px;">${title}</div>
      <input type="text" placeholder="${placeholder}" style="width:100%;box-sizing:border-box;padding:8px 10px;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:#eef;font-size:13px;outline:none;" />
      <div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end;">
        <button class="cancel-btn" style="padding:6px 14px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:transparent;color:#8ab;font-size:12px;cursor:pointer;">取消</button>
        <button class="confirm-btn" style="padding:6px 14px;border-radius:6px;border:1px solid rgba(0,255,255,0.3);background:rgba(0,255,255,0.15);color:#5ee8ff;font-size:12px;cursor:pointer;">确定</button>
      </div>
    </div>
  `;
  document.body.appendChild(dialog);

  const input = dialog.querySelector('input');
  const cancelBtn = dialog.querySelector('.cancel-btn');
  const confirmBtn = dialog.querySelector('.confirm-btn');

  setTimeout(() => input.focus(), 50);

  cancelBtn.addEventListener('click', () => dialog.remove());
  confirmBtn.addEventListener('click', () => {
    const value = input.value.trim();
    if (value) {
      onConfirm(value);
    }
    dialog.remove();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const value = input.value.trim();
      if (value) {
        onConfirm(value);
      }
      dialog.remove();
    } else if (e.key === 'Escape') {
      dialog.remove();
    }
  });
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.remove();
  });
}

// ── 自定义提示对话框 ──
function showAlertDialog(message) {
  const dialog = document.createElement('div');
  dialog.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:100002;';
  dialog.innerHTML = `
    <div style="width:280px;max-width:90vw;background:#1a1d2e;border-radius:10px;padding:16px;box-shadow:0 8px 32px rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.1);">
      <div style="font-size:13px;color:#eef;margin-bottom:16px;text-align:center;">${message}</div>
      <div style="display:flex;justify-content:center;">
        <button class="ok-btn" style="padding:8px 20px;border-radius:6px;border:1px solid rgba(0,255,255,0.3);background:rgba(0,255,255,0.15);color:#5ee8ff;font-size:13px;cursor:pointer;">确定</button>
      </div>
    </div>
  `;
  document.body.appendChild(dialog);

  const okBtn = dialog.querySelector('.ok-btn');
  okBtn.addEventListener('click', () => dialog.remove());
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.remove();
  });
}

// ── 自定义确认对话框 ──
function showConfirmDialog(message, onConfirm) {
  const dialog = document.createElement('div');
  dialog.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:100002;';
  dialog.innerHTML = `
    <div style="width:280px;max-width:90vw;background:#1a1d2e;border-radius:10px;padding:16px;box-shadow:0 8px 32px rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.1);">
      <div style="font-size:13px;color:#eef;margin-bottom:16px;text-align:center;">${message}</div>
      <div style="display:flex;gap:8px;justify-content:center;">
        <button class="cancel-btn" style="padding:8px 14px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:transparent;color:#8ab;font-size:13px;cursor:pointer;">取消</button>
        <button class="confirm-btn" style="padding:8px 14px;border-radius:6px;border:1px solid rgba(255,100,100,0.4);background:rgba(255,100,100,0.2);color:#ff8fa3;font-size:13px;cursor:pointer;">确定</button>
      </div>
    </div>
  `;
  document.body.appendChild(dialog);

  const cancelBtn = dialog.querySelector('.cancel-btn');
  const confirmBtn = dialog.querySelector('.confirm-btn');

  cancelBtn.addEventListener('click', () => dialog.remove());
  confirmBtn.addEventListener('click', () => {
    onConfirm();
    dialog.remove();
  });
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.remove();
  });
}

// ── 设置上班时间对话框 ──
function showWorkTimeDialog(typeId) {
  const typeInfo = getShiftTypes().find(t => t.id === typeId);
  if (!typeInfo) return;

  const currentHour = typeInfo.workHour != null ? typeInfo.workHour : 9;
  const currentMinute = typeInfo.workMinute != null ? typeInfo.workMinute : 0;

  // 生成时/分选项
  const hourOptions = Array.from({length:24}, (_, i) =>
    `<option value="${i}" ${i === currentHour ? 'selected' : ''}>${String(i).padStart(2,'0')}</option>`
  ).join('');
  const minuteOptions = Array.from({length:60}, (_, i) =>
    `<option value="${i}" ${i === currentMinute ? 'selected' : ''}>${String(i).padStart(2,'0')}</option>`
  ).join('');

  const dialog = document.createElement('div');
  dialog.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:100002;';
  dialog.innerHTML = `
    <div style="width:300px;max-width:90vw;background:#1a1d2e;border-radius:10px;padding:16px;box-shadow:0 8px 32px rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.1);">
      <div style="font-size:13px;color:#eef;margin-bottom:12px;">设置「${typeInfo.name}」上班时间</div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
        <select class="wt-hour" style="flex:1;padding:8px 10px;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:#eef;font-size:13px;outline:none;">${hourOptions}</select>
        <span style="color:#8ab;font-size:16px;font-weight:600;">:</span>
        <select class="wt-minute" style="flex:1;padding:8px 10px;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:#eef;font-size:13px;outline:none;">${minuteOptions}</select>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button class="cancel-btn" style="padding:6px 14px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:transparent;color:#8ab;font-size:12px;cursor:pointer;">取消</button>
        <button class="confirm-btn" style="padding:6px 14px;border-radius:6px;border:1px solid rgba(0,255,255,0.3);background:rgba(0,255,255,0.15);color:#5ee8ff;font-size:12px;cursor:pointer;">确定</button>
      </div>
    </div>
  `;
  document.body.appendChild(dialog);

  const hourSel = dialog.querySelector('.wt-hour');
  const minuteSel = dialog.querySelector('.wt-minute');
  const cancelBtn = dialog.querySelector('.cancel-btn');
  const confirmBtn = dialog.querySelector('.confirm-btn');

  cancelBtn.addEventListener('click', () => dialog.remove());
  confirmBtn.addEventListener('click', () => {
    const hour = parseInt(hourSel.value, 10);
    const minute = parseInt(minuteSel.value, 10);
    updateShiftTypeWorkTime(typeId, hour, minute);
    renderManualMiniCal();
    renderPatternMiniCal();
    dialog.remove();
  });
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.remove();
  });
}

// ── 新增班次 ──
elAddShiftTypeBtn.addEventListener('click', function (e) {
  e.stopPropagation();
  showInputDialog('请输入班次名称', '例如：加班', function (name) {
    const result = addShiftType(name);
    if (result) {
      renderShiftTypeBtns();
    } else {
      showAlertDialog('班次名称已存在');
    }
  });
});

// ── 删除选中日期的班次 ──
elDeleteShiftBtn.addEventListener('click', function (e) {
  e.stopPropagation();
  if (!selectedManualDate) return;
  if (assignedShifts[selectedManualDate]) {
    delete assignedShifts[selectedManualDate];
    renderManualMiniCal();
  }
});

// ── 手动排班日历渲染 ──
function renderManualMiniCal() {
  if (!manualCalYear) {
    const now = new Date();
    manualCalYear = now.getFullYear();
    manualCalMonth = now.getMonth();
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
      selectedManualDate = el.dataset.date;
      renderManualMiniCal();
    });
  });

  // 绑定月份导航
  elManualCal.querySelectorAll('.manual-cal-nav').forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.stopPropagation();
      const dir = parseInt(el.dataset.dir, 10);
      manualCalMonth += dir;
      if (manualCalMonth < 0) { manualCalMonth = 11; manualCalYear--; }
      if (manualCalMonth > 11) { manualCalMonth = 0; manualCalYear++; }
      renderManualMiniCal();
    });
  });
}

// ── 规律排班日历渲染 ──
function renderPatternMiniCal() {
  if (!patternCalYear) {
    const now = new Date();
    patternCalYear = now.getFullYear();
    patternCalMonth = now.getMonth();
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
      selectedPatternDate = el.dataset.date;
      renderPatternMiniCal();
    });
  });

  // 绑定月份导航
  elPatternCal.querySelectorAll('.pattern-cal-nav').forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.stopPropagation();
      const dir = parseInt(el.dataset.dir, 10);
      patternCalMonth += dir;
      if (patternCalMonth < 0) { patternCalMonth = 11; patternCalYear--; }
      if (patternCalMonth > 11) { patternCalMonth = 0; patternCalYear++; }
      renderPatternMiniCal();
    });
  });
}

// ── 规律排班班次按钮渲染 ──
function renderPatternShiftTypeBtns() {
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
function renderPatternCycleBox() {
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
  patternCycle = [];
  renderPatternCycleBox();
});

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
  startDate = '';
  endDate = '';
  // 默认：不开启大小周，点亮一二三四五（周一至周五）
  weekdays = [0, 1, 1, 1, 1, 1, 0]; // 索引0=周日, 1=周一...6=周六
  // 大周默认点亮一二三四五六（周一至周六）
  bigWeekdays = [0, 1, 1, 1, 1, 1, 1];
  // 小周默认点亮一二三四五（周一至周五）
  smallWeekdays = [0, 1, 1, 1, 1, 1, 0];
  elBigSmallToggle.checked = false;
  elFirstWeek.value = 'big';
  elWorkHour.value = '9';
  elWorkMinute.value = '0';
  updateToggle();

  // 重置倒班状态
  elSubType.value = 'manual';
  elManualConfig.style.display = 'block';
  elPatternConfig.style.display = 'none';
  manualCalYear = null;
  manualCalMonth = null;
  selectedManualDate = '';
  assignedShifts = {};

  // 重置规律排班状态
  patternCalYear = null;
  patternCalMonth = null;
  selectedPatternDate = '';
  patternCycle = [];

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
  startCalYear = now.getFullYear();
  startCalMonth = now.getMonth();
  endCalYear = now.getFullYear();
  endCalMonth = now.getMonth();

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

  startDate = s.startDate || '';
  endDate = s.endDate || '';
  if (startDate) {
    const parts = startDate.split('-');
    elStartDate.value = parts[0] + '/' + parts[1] + '/' + parts[2];
    startCalYear = parseInt(parts[0], 10);
    startCalMonth = parseInt(parts[1], 10) - 1;
  } else {
    const now = new Date();
    startCalYear = now.getFullYear();
    startCalMonth = now.getMonth();
  }
  if (endDate) {
    const parts = endDate.split('-');
    elEndDate.value = parts[0] + '/' + parts[1] + '/' + parts[2];
    endCalYear = parseInt(parts[0], 10);
    endCalMonth = parseInt(parts[1], 10) - 1;
  } else {
    const now = new Date();
    endCalYear = now.getFullYear();
    endCalMonth = now.getMonth();
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
    bigWeekdays = (s.bigWeekdays || [0,0,0,0,0,0,0]).slice();
    smallWeekdays = (s.smallWeekdays || [0,0,0,0,0,0,0]).slice();
    weekdays = [0, 0, 0, 0, 0, 0, 0];
    setBtns('.big-weekday-btn', bigWeekdays);
    setBtns('.small-weekday-btn', smallWeekdays);
    elFirstWeek.value = s.firstWeekBig !== false ? 'big' : 'small';
  } else {
    weekdays = (s.weekdays || [0,0,0,0,0,0,0]).slice();
    bigWeekdays = [0, 0, 0, 0, 0, 0, 0];
    smallWeekdays = [0, 0, 0, 0, 0, 0, 0];
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
      patternCycle = (s.cycle || []).slice();
      selectedPatternDate = s.startDate || '';
      patternCalYear = null;
      patternCalMonth = null;
      assignedShifts = {};
      manualCalYear = null;
      manualCalMonth = null;
      selectedManualDate = '';

      renderPatternShiftTypeBtns();
      renderPatternCycleBox();
      renderPatternMiniCal();
    } else {
      // 手动排班数据恢复
      assignedShifts = (s.shifts || {});
      manualCalYear = null;
      manualCalMonth = null;
      selectedManualDate = '';
      patternCycle = [];
      selectedPatternDate = '';
      patternCalYear = null;
      patternCalMonth = null;

      renderShiftTypeBtns();
      renderManualMiniCal();
    }
  } else {
    // 上班规律时重置倒班状态
    elSubType.value = 'manual';
    elManualConfig.style.display = 'block';
    elPatternConfig.style.display = 'none';
    assignedShifts = {};
    selectedManualDate = '';
    patternCycle = [];
    selectedPatternDate = '';
    patternCalYear = null;
    patternCalMonth = null;
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
