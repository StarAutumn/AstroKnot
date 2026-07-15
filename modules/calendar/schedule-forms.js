// ============================================================
//  calendar / schedule-forms.js — 表单/右键菜单/对话框
// ============================================================
import { state, refreshPopup } from './shared-state.js';
import {
  uid, fmtDate, parseDate, getMondayOf,
  getSchedule, getWeeklyCell, coursesConflictAt, parseSlotRange,
  addEvent, setWeeklyAt, removeWeeklyAt, addSlot, setSlotAt, removeSlotAt,
  setFirstWeekDate
} from './schedule-store.js';

const { weekDayNames } = state;

// ==================== 日程/课程编辑表单 ====================
const eventFormOverlay = document.createElement('div');
eventFormOverlay.id = 'schedFormOverlay';
eventFormOverlay.style.cssText = `
  position: fixed; inset: 0; z-index: 1000001;
  background: rgba(0,0,0,0.5);
  display: none; align-items: center; justify-content: center;
`;
eventFormOverlay.innerHTML = `
  <div id="schedFormBox" style="
    background: rgba(15, 25, 40, 0.96);
    backdrop-filter: blur(16px);
    border: 1px solid rgba(0, 255, 255, 0.25);
    border-radius: 12px;
    padding: 18px 20px;
    min-width: 300px;
    box-shadow: 0 8px 40px rgba(0,0,0,0.6);
    color: #b0d8ee;
    font-size: 13px;
  ">
    <div id="schedFormTitle" style="font-weight:600;color:#eef;margin-bottom:12px;font-size:14px;"></div>
    <div style="display:flex;flex-direction:column;gap:10px;min-width:280px;">
      <div id="schedTimeWrap" style="display:none;flex-direction:column;gap:8px;">
        <div>
          <div style="font-size:11px;color:#8ab;margin-bottom:4px;">日期（可选，不填为长期事项）</div>
          <input id="schedDateInput" type="hidden" />
          <div id="schedDateDisplay" style="padding:7px 10px;background:rgba(0,0,0,0.4);border:1px solid rgba(0,255,255,0.2);border-radius:6px;color:#6a9;font-size:13px;cursor:pointer;">点击下方日历选择日期</div>
          <div id="schedMiniCal" style="margin-top:6px;padding:8px;background:rgba(0,0,0,0.3);border-radius:8px;border:1px solid rgba(255,255,255,0.1);"></div>
        </div>
        <div>
          <div style="font-size:11px;color:#8ab;margin-bottom:4px;">时间（可选，不填则置顶）</div>
          <div style="display:flex;gap:6px;align-items:center;">
            <select id="schedHourInput" style="flex:1;box-sizing:border-box;padding:7px 10px;background:rgba(0,0,0,0.4);border:1px solid rgba(0,255,255,0.2);border-radius:6px;color:#eef;font-size:13px;outline:none;">
              <option value="">--</option>
              ${Array.from({length:24},(_,i)=>'<option value="'+i+'">'+String(i).padStart(2,'0')+'</option>').join('')}
            </select>
            <span style="color:#8ab;font-size:14px;">:</span>
            <select id="schedMinuteInput" style="flex:1;box-sizing:border-box;padding:7px 10px;background:rgba(0,0,0,0.4);border:1px solid rgba(0,255,255,0.2);border-radius:6px;color:#eef;font-size:13px;outline:none;">
              <option value="">--</option>
              ${Array.from({length:60},(_,i)=>'<option value="'+i+'">'+String(i).padStart(2,'0')+'</option>').join('')}
            </select>
          </div>
        </div>
        <div id="schedEventReminderWrap" style="display:none;">
          <div style="font-size:11px;color:#8ab;margin-bottom:4px;">提前提醒时间（分钟）</div>
          <select id="schedEventReminder" style="width:100%;box-sizing:border-box;padding:7px 10px;background:rgba(0,0,0,0.4);border:1px solid rgba(0,255,255,0.2);border-radius:6px;color:#eef;font-size:13px;outline:none;">
            <option value="5">5 分钟</option>
            <option value="10" selected>10 分钟</option>
            <option value="15">15 分钟</option>
            <option value="20">20 分钟</option>
            <option value="30">30 分钟</option>
            <option value="45">45 分钟</option>
            <option value="60">60 分钟</option>
          </select>
        </div>
      </div>
      <div>
        <div style="font-size:11px;color:#8ab;margin-bottom:4px;" id="schedTitleLabel">\u6807\u9898</div>
        <input id="schedTitleInput" type="text" placeholder="\u4F8B\u5982\uFF1A\u5F00\u4F1A / \u9AD8\u6570" style="width:100%;box-sizing:border-box;padding:7px 10px;background:rgba(0,0,0,0.4);border:1px solid rgba(0,255,255,0.2);border-radius:6px;color:#eef;font-size:13px;outline:none;" />
      </div>
      <div id="schedWeeklyFields" style="display:none;flex-direction:column;gap:10px;">
        <div>
          <div style="font-size:11px;color:#8ab;margin-bottom:4px;">\u4EBA\u5458\uFF08\u6559\u5E08\uFF09</div>
          <input id="schedTeacherInput" type="text" placeholder="\u53EF\u9009" style="width:100%;box-sizing:border-box;padding:7px 10px;background:rgba(0,0,0,0.4);border:1px solid rgba(0,255,255,0.2);border-radius:6px;color:#eef;font-size:13px;outline:none;" />
        </div>
        <div style="display:flex;gap:8px;">
          <div style="flex:1;">
            <div style="font-size:11px;color:#8ab;margin-bottom:4px;">\u6559\u5B66\u697C</div>
            <input id="schedBuildingInput" type="text" placeholder="\u53EF\u9009" style="width:100%;box-sizing:border-box;padding:7px 10px;background:rgba(0,0,0,0.4);border:1px solid rgba(0,255,255,0.2);border-radius:6px;color:#eef;font-size:13px;outline:none;" />
          </div>
          <div style="flex:1;">
            <div style="font-size:11px;color:#8ab;margin-bottom:4px;">\u6559\u5BA4\u95E8\u724C\u53F7</div>
            <input id="schedRoomInput" type="text" placeholder="\u53EF\u9009" style="width:100%;box-sizing:border-box;padding:7px 10px;background:rgba(0,0,0,0.4);border:1px solid rgba(0,255,255,0.2);border-radius:6px;color:#eef;font-size:13px;outline:none;" />
          </div>
        </div>
        <div>
          <div style="font-size:11px;color:#8ab;margin-bottom:4px;">\u91CD\u590D\u5468\u671F</div>
          <select id="schedRepeatInput" style="width:100%;box-sizing:border-box;padding:7px 10px;background:rgba(0,0,0,0.4);border:1px solid rgba(0,255,255,0.2);border-radius:6px;color:#eef;font-size:13px;outline:none;">
            <option value="weekly">\u6BCF\u5468</option>
            <option value="odd">\u5355\u5468</option>
            <option value="even">\u53CC\u5468</option>
          </select>
        </div>
        <div>
          <div style="font-size:11px;color:#8ab;margin-bottom:4px;">\u7B2C\u51E0\u5468\u5230\u7B2C\u51E0\u5468\uFF08\u7559\u7A7A\u8868\u793A\u5168\u5B66\u671F\uFF09</div>
          <div style="display:flex;gap:8px;align-items:center;">
            <input id="schedWeekStartInput" type="number" min="1" placeholder="\u8D77" style="flex:1;box-sizing:border-box;padding:7px 10px;background:rgba(0,0,0,0.4);border:1px solid rgba(0,255,255,0.2);border-radius:6px;color:#eef;font-size:13px;outline:none;" />
            <span style="color:#8ab;font-size:12px;">\u2014</span>
            <input id="schedWeekEndInput" type="number" min="1" placeholder="\u6B62" style="flex:1;box-sizing:border-box;padding:7px 10px;background:rgba(0,0,0,0.4);border:1px solid rgba(0,255,255,0.2);border-radius:6px;color:#eef;font-size:13px;outline:none;" />
          </div>
        </div>
        <div>
          <div style="font-size:11px;color:#8ab;margin-bottom:4px;">\u63D0\u524D\u63D0\u9192\u65F6\u95F4\uFF08\u5206\u949F\uFF09</div>
          <select id="schedReminderInput" style="width:100%;box-sizing:border-box;padding:7px 10px;background:rgba(0,0,0,0.4);border:1px solid rgba(0,255,255,0.2);border-radius:6px;color:#eef;font-size:13px;outline:none;">
            <option value="5">5 \u5206\u949F</option>
            <option value="10" selected>10 \u5206\u949F</option>
            <option value="15">15 \u5206\u949F</option>
            <option value="20">20 \u5206\u949F</option>
            <option value="30">30 \u5206\u949F</option>
            <option value="45">45 \u5206\u949F</option>
            <option value="60">60 \u5206\u949F</option>
          </select>
        </div>
      </div>
      <div id="schedQuadrantWrap" style="display:none;">
        <div style="font-size:11px;color:#8ab;margin-bottom:4px;">象限分类</div>
        <select id="schedQuadrantInput" style="width:100%;box-sizing:border-box;padding:7px 10px;background:rgba(0,0,0,0.4);border:1px solid rgba(0,255,255,0.2);border-radius:6px;color:#eef;font-size:13px;outline:none;">
          <option value="q1">重要紧急</option>
          <option value="q2">重要不紧急</option>
          <option value="q3">不重要紧急</option>
          <option value="q4">不重要不紧急</option>
        </select>
      </div>
      <div id="schedNoteWrap">
        <div style="font-size:11px;color:#8ab;margin-bottom:4px;">\u5907\u6CE8</div>
        <input id="schedNoteInput" type="text" placeholder="\u53EF\u9009" style="width:100%;box-sizing:border-box;padding:7px 10px;background:rgba(0,0,0,0.4);border:1px solid rgba(0,255,255,0.2);border-radius:6px;color:#eef;font-size:13px;outline:none;" />
      </div>
    </div>
    <div style="display:flex;gap:10px;margin-top:14px;justify-content:flex-end;">
      <button id="schedFormClear" style="display:none;padding:6px 14px;border-radius:6px;border:1px solid rgba(255,100,100,0.3);background:transparent;color:#e88;cursor:pointer;font-size:13px;">\u6E05\u7A7A</button>
      <button id="schedFormCancel" style="padding:6px 18px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);background:transparent;color:#8ab;cursor:pointer;font-size:13px;">\u53D6\u6D88</button>
      <button id="schedFormConfirm" style="padding:6px 18px;border-radius:6px;border:none;background:rgba(0,255,255,0.2);color:#eef;cursor:pointer;font-size:13px;font-weight:500;">\u786E\u5B9A</button>
    </div>
  </div>
`;
document.body.appendChild(eventFormOverlay);

const schedTitle = eventFormOverlay.querySelector('#schedTitleInput');
const schedDateInput = eventFormOverlay.querySelector('#schedDateInput');
const schedDateDisplay = eventFormOverlay.querySelector('#schedDateDisplay');
const schedMiniCal = eventFormOverlay.querySelector('#schedMiniCal');
const schedHourInput = eventFormOverlay.querySelector('#schedHourInput');
const schedMinuteInput = eventFormOverlay.querySelector('#schedMinuteInput');
const schedEventReminderWrap = eventFormOverlay.querySelector('#schedEventReminderWrap');
const schedEventReminder = eventFormOverlay.querySelector('#schedEventReminder');
const schedNote = eventFormOverlay.querySelector('#schedNoteInput');
const schedTimeWrap = eventFormOverlay.querySelector('#schedTimeWrap');
const schedWeeklyFields = eventFormOverlay.querySelector('#schedWeeklyFields');
const schedTitleLabel = eventFormOverlay.querySelector('#schedTitleLabel');
const schedTeacher = eventFormOverlay.querySelector('#schedTeacherInput');
const schedBuilding = eventFormOverlay.querySelector('#schedBuildingInput');
const schedRoom = eventFormOverlay.querySelector('#schedRoomInput');
const schedRepeat = eventFormOverlay.querySelector('#schedRepeatInput');
const schedWeekStart = eventFormOverlay.querySelector('#schedWeekStartInput');
const schedWeekEnd = eventFormOverlay.querySelector('#schedWeekEndInput');
const schedReminder = eventFormOverlay.querySelector('#schedReminderInput');
const schedNoteWrap = eventFormOverlay.querySelector('#schedNoteWrap');
const schedQuadrantWrap = eventFormOverlay.querySelector('#schedQuadrantWrap');
const schedQuadrant = eventFormOverlay.querySelector('#schedQuadrantInput');
const schedFormTitle = eventFormOverlay.querySelector('#schedFormTitle');
const schedFormClear = eventFormOverlay.querySelector('#schedFormClear');
const schedFormConfirm = eventFormOverlay.querySelector('#schedFormConfirm');
const schedFormCancel = eventFormOverlay.querySelector('#schedFormCancel');

let formMode = null; // 'event' | 'weekly'
let formCtx = null;  // {date} | {weekday, slot}
let schedCalYear = new Date().getFullYear();
let schedCalMonth = new Date().getMonth();

// 事项模式：时间变化时显示/隐藏提前提醒时间
function updateEventReminderVisibility() {
  const hasTime = schedHourInput.value !== '' && schedMinuteInput.value !== '';
  schedEventReminderWrap.style.display = hasTime ? '' : 'none';
}
schedHourInput.addEventListener('change', function () {
  if (formMode === 'event') updateEventReminderVisibility();
});
schedMinuteInput.addEventListener('change', function () {
  if (formMode === 'event') updateEventReminderVisibility();
});

// 渲染小型日历
function renderSchedMiniCal() {
  const year = schedCalYear;
  const month = schedCalMonth;
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const selectedDate = schedDateInput.value;
  const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
  let html = '';
  html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">';
  html += '<div class="sched-cal-nav" data-dir="-1" style="cursor:pointer;color:#8ab;padding:2px 8px;font-size:14px;">&#9664;</div>';
  html += '<div style="color:#eef;font-size:12px;font-weight:500;">' + year + '年 ' + monthNames[month] + '</div>';
  html += '<div class="sched-cal-nav" data-dir="1" style="cursor:pointer;color:#8ab;padding:2px 8px;font-size:14px;">&#9654;</div>';
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
    html += '<div class="sched-cal-day" data-date="' + dateStr + '" style="text-align:center;padding:3px 0;border-radius:4px;cursor:pointer;font-size:11px;' + bg + '">' + day + '</div>';
  }
  html += '</div>';
  schedMiniCal.innerHTML = html;
}

// 日历点击事件
schedMiniCal.addEventListener('click', function (e) {
  const navBtn = e.target.closest('.sched-cal-nav');
  if (navBtn) {
    e.stopPropagation();
    const dir = parseInt(navBtn.dataset.dir, 10);
    schedCalMonth += dir;
    if (schedCalMonth < 0) { schedCalMonth = 11; schedCalYear--; }
    if (schedCalMonth > 11) { schedCalMonth = 0; schedCalYear++; }
    renderSchedMiniCal();
    return;
  }
  const dayBtn = e.target.closest('.sched-cal-day');
  if (dayBtn) {
    e.stopPropagation();
    const dateStr = dayBtn.dataset.date;
    schedDateInput.value = dateStr;
    schedDateDisplay.textContent = dateStr;
    schedDateDisplay.style.color = '#eef';
    renderSchedMiniCal();
  }
});

// 点击"清除日期"
schedDateDisplay.addEventListener('click', function (e) {
  e.stopPropagation();
  schedDateInput.value = '';
  schedDateDisplay.textContent = '点击下方日历选择日期';
  schedDateDisplay.style.color = '#6a9';
  renderSchedMiniCal();
});

export function openEventForm(ctx) {
  formMode = 'event';
  formCtx = ctx;
  schedFormTitle.textContent = '\uD83D\uDDD2\uFE0F \u6DFB\u52A0\u65E5\u7A0B';
  schedTimeWrap.style.display = 'flex';
  schedWeeklyFields.style.display = 'none';
  schedQuadrantWrap.style.display = '';
  schedNoteWrap.style.display = '';
  schedTitleLabel.textContent = '\u6807\u9898';
  schedTitle.placeholder = '\u4F8B\u5982\uFF1A\u5F00\u4F1A / \u9AD8\u6570';
  schedTitle.value = '';
  // 日期默认值
  const initDate = ctx.date || '';
  schedDateInput.value = initDate;
  if (initDate) {
    schedDateDisplay.textContent = initDate;
    schedDateDisplay.style.color = '#eef';
    const parts = initDate.split('-');
    if (parts.length === 3) {
      schedCalYear = parseInt(parts[0], 10);
      schedCalMonth = parseInt(parts[1], 10) - 1;
    }
  } else {
    schedDateDisplay.textContent = '点击下方日历选择日期';
    schedDateDisplay.style.color = '#6a9';
    schedCalYear = new Date().getFullYear();
    schedCalMonth = new Date().getMonth();
  }
  renderSchedMiniCal();
  // 时间默认值
  if (ctx.time && ctx.time.includes(':')) {
    const parts = ctx.time.split(':');
    schedHourInput.value = parts[0] || '';
    schedMinuteInput.value = parts[1] || '';
  } else {
    schedHourInput.value = '';
    schedMinuteInput.value = '';
  }
  schedEventReminder.value = '10'; // 默认10分钟
  updateEventReminderVisibility();
  schedNote.value = '';
  schedQuadrant.value = ctx.quadrant || 'q1';
  schedFormClear.style.display = 'none';
  showForm();
}

export function openWeeklyForm(weekday, slot) {
  formMode = 'weekly';
  formCtx = { weekday, slot };
  const existing = getWeeklyCell(weekday, slot);
  schedFormTitle.textContent = '\uD83D\uDCDA \u8BFE\u7A0B\uFF08' + weekDayNames[weekday] + ' \u00B7 \u7B2C' + (slot + 1) + '\u8282\uFF09';
  schedTimeWrap.style.display = 'none';
  schedWeeklyFields.style.display = 'flex';
  schedNoteWrap.style.display = 'none';
  schedTitleLabel.textContent = '\u8BFE\u7A0B';
  schedTitle.placeholder = '\u4F8B\u5982\uFF1A\u9AD8\u6570';
  schedTitle.value = existing ? existing.title : '';
  schedTeacher.value = existing ? (existing.teacher || '') : '';
  schedBuilding.value = existing ? (existing.building || '') : '';
  schedRoom.value = existing ? (existing.room || '') : '';
  schedRepeat.value = existing ? (existing.repeat || 'weekly') : 'weekly';
  schedWeekStart.value = existing ? (existing.weekStart != null ? existing.weekStart : '') : '';
  schedWeekEnd.value = existing ? (existing.weekEnd != null ? existing.weekEnd : '') : '';
  schedReminder.value = existing ? (existing.reminder != null ? String(existing.reminder) : '10') : '10';
  schedNote.value = existing ? (existing.note || '') : '';
  schedFormClear.style.display = existing ? '' : 'none';
  showForm();
}

function showForm() {
  eventFormOverlay.style.display = 'flex';
  setTimeout(function () { schedTitle.focus(); }, 50);
}

export function hideEventForm() {
  eventFormOverlay.style.display = 'none';
  formMode = null;
  formCtx = null;
}

schedFormConfirm.addEventListener('click', function (e) {
  e.stopPropagation();
  const title = schedTitle.value.trim();
  if (!title) { schedTitle.focus(); return; }
  if (formMode === 'event') {
    const dateVal = schedDateInput.value; // YYYY-MM-DD 或空
    const hourVal = schedHourInput.value;
    const minuteVal = schedMinuteInput.value;
    const timeVal = (hourVal !== '' && minuteVal !== '') 
      ? String(parseInt(hourVal,10)).padStart(2,'0') + ':' + String(parseInt(minuteVal,10)).padStart(2,'0')
      : '';
    const reminder = timeVal ? (parseInt(schedEventReminder.value, 10) || 10) : null;
    addEvent({
      id: uid(),
      date: dateVal,
      time: timeVal,
      reminder: reminder,
      title: title,
      note: schedNote.value.trim(),
      quadrant: schedQuadrant.value,
      tabId: formCtx.tabId || 'all'
    });
  } else if (formMode === 'weekly') {
    const ws = schedWeekStart.value === '' ? null : parseInt(schedWeekStart.value, 10);
    const we = schedWeekEnd.value === '' ? null : parseInt(schedWeekEnd.value, 10);
    const newCourse = {
      id: uid(),
      weekday: formCtx.weekday,
      slot: formCtx.slot,
      title: title,
      teacher: schedTeacher.value.trim(),
      building: schedBuilding.value.trim(),
      room: schedRoom.value.trim(),
      repeat: schedRepeat.value,
      weekStart: (ws != null && !isNaN(ws)) ? ws : null,
      weekEnd: (we != null && !isNaN(we)) ? we : null,
      reminder: parseInt(schedReminder.value, 10) || 10,
      note: schedNote.value.trim()
    };
    // 冲突检测：与同周其他课程比较（排除正在替换的同位置课程）
    const others = getSchedule().weekly.filter(w => !(w.weekday === formCtx.weekday && w.slot === formCtx.slot));
    const conflicts = [];
    others.forEach(function (o) {
      if (coursesConflictAt(newCourse, o, null)) {
        const parts = [];
        parts.push(weekDayNames[o.weekday] + ' 第' + (o.slot + 1) + '节');
        parts.push('\u300C' + o.title + '\u300D');
        if (o.teacher) parts.push(o.teacher);
        conflicts.push(parts.join(' '));
      }
    });
    if (conflicts.length > 0) {
      const msg = '\u26A0\uFE0F \u68C0\u6D4B\u5230\u8BFE\u7A0B\u51B2\u7A81\uFF1A\n\n' + conflicts.join('\n') + '\n\n\u4E0E\u5F53\u524D\u8BFE\u7A0B\u5728\u540C\u4E00\u5929\u7684\u65F6\u6BB5/\u5468\u6B21\u91CD\u53E0\u3002\n\u662F\u5426\u4ECD\u8981\u4FDD\u5B58\uFF1F';
      if (!window.confirm(msg)) return;
    }
    setWeeklyAt(formCtx.weekday, formCtx.slot, newCourse);
  }
  hideEventForm();
  refreshPopup();
});

schedFormCancel.addEventListener('click', function (e) { e.stopPropagation(); hideEventForm(); });
eventFormOverlay.addEventListener('click', function (e) {
  if (e.target === eventFormOverlay) hideEventForm();
});
schedFormClear.addEventListener('click', function (e) {
  e.stopPropagation();
  if (formMode === 'weekly' && formCtx) {
    removeWeeklyAt(formCtx.weekday, formCtx.slot);
    hideEventForm();
    refreshPopup();
  }
});
[schedTitle, schedNote, schedTeacher, schedBuilding, schedRoom, schedWeekStart, schedWeekEnd, schedDateInput, schedHourInput, schedMinuteInput].forEach(function (inp) {
  inp.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); schedFormConfirm.click(); }
    if (e.key === 'Escape') hideEventForm();
  });
  inp.addEventListener('click', function (e) { e.stopPropagation(); });
});
schedRepeat.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') hideEventForm();
});
schedRepeat.addEventListener('click', function (e) { e.stopPropagation(); });
schedRepeat.addEventListener('change', function (e) { e.stopPropagation(); });

// ==================== 时段右键菜单 ====================
const slotMenu = document.createElement('div');
slotMenu.id = 'slotMenu';
slotMenu.style.cssText = `
  position: fixed; z-index: 1000002;
  background: rgba(15, 25, 40, 0.96);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(0, 255, 255, 0.25);
  border-radius: 8px;
  padding: 4px 0;
  min-width: 120px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.6);
  color: #b0d8ee;
  font-size: 13px;
  display: none;
  user-select: none;
`;
slotMenu.innerHTML = `
  <div class="slot-menu-item" data-act="edit" style="padding:8px 16px;cursor:pointer;">\u270F\uFE0F \u4FEE\u6539\u65F6\u95F4</div>
  <div class="slot-menu-item" data-act="delete" style="padding:8px 16px;cursor:pointer;color:#e88;">\u2715 \u5220\u9664\u8BE5\u8282</div>
`;
document.body.appendChild(slotMenu);
let slotMenuIdx = -1;

export function openSlotMenu(x, y, slotIdx) {
  slotMenuIdx = slotIdx;
  slotMenu.style.display = 'block';
  // 临时显示测量尺寸
  slotMenu.style.left = '0px';
  slotMenu.style.top = '0px';
  const w = slotMenu.offsetWidth;
  const h = slotMenu.offsetHeight;
  let left = x, top = y;
  if (left + w > window.innerWidth - 8) left = window.innerWidth - 8 - w;
  if (top + h > window.innerHeight - 8) top = window.innerHeight - 8 - h;
  slotMenu.style.left = left + 'px';
  slotMenu.style.top = top + 'px';
}

export function hideSlotMenu() {
  slotMenu.style.display = 'none';
  slotMenuIdx = -1;
}

slotMenu.addEventListener('click', function (e) {
  const item = e.target.closest('.slot-menu-item');
  if (!item) return;
  e.stopPropagation();
  const act = item.dataset.act;
  const idx = slotMenuIdx;
  hideSlotMenu();
  if (idx < 0 || idx >= getSchedule().slots.length) return;
  if (act === 'delete') {
    removeSlotAt(idx);
    refreshPopup();
  } else if (act === 'edit') {
    openSlotTimeForm(idx);
  }
});

// 点击外部关闭右键菜单（使用捕获模式确保 3D canvas 点击也能关闭）
const slotMenuCloseHandler = function (e) {
  if (slotMenu.style.display !== 'none' && !slotMenu.contains(e.target)) {
    hideSlotMenu();
  }
};
document.addEventListener('mousedown', slotMenuCloseHandler, true);
document.addEventListener('pointerdown', slotMenuCloseHandler, true);
document.addEventListener('contextmenu', function (e) {
  if (!slotMenu.contains(e.target) && !state.calPopup.contains(e.target)) hideSlotMenu();
});
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') hideSlotMenu();
});

// ==================== 修改时段时间对话框 ====================
const slotTimeOverlay = document.createElement('div');
slotTimeOverlay.id = 'slotTimeOverlay';
slotTimeOverlay.style.cssText = `
  position: fixed; inset: 0; z-index: 1000001;
  background: rgba(0,0,0,0.5);
  display: none; align-items: center; justify-content: center;
`;
slotTimeOverlay.innerHTML = `
  <div style="
    background: rgba(15, 25, 40, 0.96);
    backdrop-filter: blur(16px);
    border: 1px solid rgba(0, 255, 255, 0.25);
    border-radius: 12px;
    padding: 18px 20px;
    min-width: 280px;
    box-shadow: 0 8px 40px rgba(0,0,0,0.6);
    color: #b0d8ee;
    font-size: 13px;
  ">
    <div id="slotTimeTitle" style="font-weight:600;color:#eef;margin-bottom:12px;font-size:14px;">\u4FEE\u6539\u65F6\u6BB5\u65F6\u95F4</div>
    <div style="display:flex;align-items:center;gap:6px;">
      <select id="slotStartHour" style="padding:8px 6px;background:rgba(0,0,0,0.4);border:1px solid rgba(0,255,255,0.2);border-radius:6px;color:#eef;font-size:13px;outline:none;"></select>
      <span style="color:#8ab;font-size:12px;">:</span>
      <select id="slotStartMin" style="padding:8px 6px;background:rgba(0,0,0,0.4);border:1px solid rgba(0,255,255,0.2);border-radius:6px;color:#eef;font-size:13px;outline:none;"></select>
      <span style="color:#8ab;font-size:13px;margin:0 4px;">\u2014</span>
      <select id="slotEndHour" style="padding:8px 6px;background:rgba(0,0,0,0.4);border:1px solid rgba(0,255,255,0.2);border-radius:6px;color:#eef;font-size:13px;outline:none;"></select>
      <span style="color:#8ab;font-size:12px;">:</span>
      <select id="slotEndMin" style="padding:8px 6px;background:rgba(0,0,0,0.4);border:1px solid rgba(0,255,255,0.2);border-radius:6px;color:#eef;font-size:13px;outline:none;"></select>
    </div>
    <div id="slotTimeWarn" style="display:none;margin-top:8px;padding:6px 10px;background:rgba(255,143,163,0.12);border:1px solid rgba(255,143,163,0.35);border-radius:6px;color:#ff8fa3;font-size:11px;line-height:1.4;"></div>
    <div style="display:flex;gap:10px;margin-top:14px;justify-content:flex-end;">
      <button id="slotTimeCancel" style="padding:6px 18px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);background:transparent;color:#8ab;cursor:pointer;font-size:13px;">\u53D6\u6D88</button>
      <button id="slotTimeConfirm" style="padding:6px 18px;border-radius:6px;border:none;background:rgba(0,255,255,0.2);color:#eef;cursor:pointer;font-size:13px;font-weight:500;">\u786E\u5B9A</button>
    </div>
  </div>
`;
document.body.appendChild(slotTimeOverlay);
const slotStartHour = slotTimeOverlay.querySelector('#slotStartHour');
const slotStartMin = slotTimeOverlay.querySelector('#slotStartMin');
const slotEndHour = slotTimeOverlay.querySelector('#slotEndHour');
const slotEndMin = slotTimeOverlay.querySelector('#slotEndMin');
const slotTimeWarn = slotTimeOverlay.querySelector('#slotTimeWarn');
const slotTimeConfirm = slotTimeOverlay.querySelector('#slotTimeConfirm');
const slotTimeCancel = slotTimeOverlay.querySelector('#slotTimeCancel');
// 小时选项 0-23，分钟选项 0/5/10.../55
function fillHourSelect(sel) {
  sel.innerHTML = '';
  for (let h = 0; h <= 23; h++) {
    const o = document.createElement('option');
    const v = (h < 10 ? '0' : '') + h;
    o.value = v; o.textContent = v;
    sel.appendChild(o);
  }
}
function fillMinSelect(sel) {
  sel.innerHTML = '';
  for (let m = 0; m < 60; m += 5) {
    const o = document.createElement('option');
    const v = (m < 10 ? '0' : '') + m;
    o.value = v; o.textContent = v;
    sel.appendChild(o);
  }
}
[slotStartHour, slotEndHour].forEach(fillHourSelect);
[slotStartMin, slotEndMin].forEach(fillMinSelect);

// 读取当前选择的时段范围（分钟数），无效返回 null
function readSlotFormRange() {
  const sh = parseInt(slotStartHour.value, 10);
  const sm = parseInt(slotStartMin.value, 10);
  const eh = parseInt(slotEndHour.value, 10);
  const em = parseInt(slotEndMin.value, 10);
  if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return null;
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  if (end <= start) return null;
  return { start: start, end: end };
}

// 实时检测时段冲突：起始早于上一节结束、结束晚于下一节开始、本节起止倒置
function checkSlotConflict(idx) {
  const slots = getSchedule().slots;
  const r = readSlotFormRange();
  if (!r) return { type: 'invalid', msg: '\u7ED3\u675F\u65F6\u95F4\u5FC5\u987B\u665A\u4E8E\u8D77\u59CB\u65F6\u95F4' };
  // 上一节（idx-1）的结束时间
  if (idx > 0) {
    const prev = parseSlotRange(slots[idx - 1]);
    if (prev && r.start < prev.end) {
      return { type: 'prev', msg: '\u8D77\u59CB\u65F6\u95F4\u65E9\u4E8E\u4E0A\u4E00\u8282\u7ED3\u675F\uFF08' + slots[idx - 1] + '\uFF09' };
    }
  }
  // 下一节（idx+1）的开始时间
  if (idx < slots.length - 1) {
    const next = parseSlotRange(slots[idx + 1]);
    if (next && r.end > next.start) {
      return { type: 'next', msg: '\u7ED3\u675F\u65F6\u95F4\u665A\u4E8E\u4E0B\u4E00\u8282\u5F00\u59CB\uFF08' + slots[idx + 1] + '\uFF09' };
    }
  }
  return null;
}
function updateSlotWarn() {
  const idx = parseInt(slotTimeOverlay.dataset.idx, 10);
  const c = checkSlotConflict(idx);
  if (c) {
    slotTimeWarn.style.display = '';
    slotTimeWarn.textContent = '\u26A0\uFE0F ' + c.msg;
  } else {
    slotTimeWarn.style.display = 'none';
    slotTimeWarn.textContent = '';
  }
}

export function openSlotTimeForm(slotIdx) {
  const cur = getSchedule().slots[slotIdx] || '';
  const m = cur.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
  const sH = m ? m[1] : '08';
  const sM = m ? m[2] : '00';
  const eH = m ? m[3] : '09';
  const eM = m ? m[4] : '40';
  slotStartHour.value = sH;
  slotStartMin.value = sM;
  slotEndHour.value = eH;
  slotEndMin.value = eM;
  slotTimeOverlay.style.display = 'flex';
  slotTimeOverlay.dataset.idx = String(slotIdx);
  updateSlotWarn();
  setTimeout(function () { slotStartHour.focus(); }, 50);
}

export function hideSlotTimeForm() {
  slotTimeOverlay.style.display = 'none';
}

slotTimeConfirm.addEventListener('click', function (e) {
  e.stopPropagation();
  const idx = parseInt(slotTimeOverlay.dataset.idx, 10);
  const r = readSlotFormRange();
  if (!r) { updateSlotWarn(); return; }
  // 冲突时弹确认
  const c = checkSlotConflict(idx);
  if (c) {
    const msg = '\u26A0\uFE0F \u65F6\u6BB5\u51B2\u7A81\uFF1A' + c.msg + '\n\n\u662F\u5426\u4ECD\u8981\u4FDD\u5B58\uFF1F';
    if (!window.confirm(msg)) return;
  }
  const val = slotStartHour.value + ':' + slotStartMin.value + '-' + slotEndHour.value + ':' + slotEndMin.value;
  if (!isNaN(idx) && idx >= 0) {
    setSlotAt(idx, val);
  }
  hideSlotTimeForm();
  refreshPopup();
});
slotTimeCancel.addEventListener('click', function (e) { e.stopPropagation(); hideSlotTimeForm(); });
slotTimeOverlay.addEventListener('click', function (e) {
  if (e.target === slotTimeOverlay) hideSlotTimeForm();
});
[slotStartHour, slotStartMin, slotEndHour, slotEndMin].forEach(function (sel) {
  sel.addEventListener('change', updateSlotWarn);
  sel.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); slotTimeConfirm.click(); }
    if (e.key === 'Escape') hideSlotTimeForm();
  });
  sel.addEventListener('click', function (e) { e.stopPropagation(); });
});

// 修改时间对话框打开时，阻止外部点击关闭日历
document.addEventListener('click', function (e) {
  if (slotTimeOverlay.style.display === 'flex' && !slotTimeOverlay.contains(e.target)) {
    // 由各自身的事件处理，这里不干预
  }
}, true);

// ==================== 设置第一周日期对话框 ====================
const firstWeekOverlay = document.createElement('div');
firstWeekOverlay.id = 'firstWeekOverlay';
firstWeekOverlay.style.cssText = `
  position: fixed; inset: 0; z-index: 1000001;
  background: rgba(0,0,0,0.5);
  display: none; align-items: center; justify-content: center;
`;
firstWeekOverlay.innerHTML = `
  <div style="
    background: rgba(15, 25, 40, 0.96);
    backdrop-filter: blur(16px);
    border: 1px solid rgba(0, 255, 255, 0.25);
    border-radius: 12px;
    padding: 18px 20px;
    min-width: 300px;
    box-shadow: 0 8px 40px rgba(0,0,0,0.6);
    color: #b0d8ee;
    font-size: 13px;
  ">
    <div style="font-weight:600;color:#eef;margin-bottom:8px;font-size:14px;">\uD83D\uDD04 \u8BBE\u7F6E\u7B2C\u4E00\u5468\u7684\u65E5\u671F</div>
    <div style="margin-bottom:10px;font-size:11px;color:#8ab;line-height:1.5;">\u8BF7\u9009\u62E9\u7B2C\u4E00\u5468\u7684\u661F\u671F\u4E00\u65E5\u671F\uFF0C\u8BFE\u7A0B\u8868\u5C06\u4ECE\u8BE5\u5468\u5F00\u59CB\u8BA1\u7B97\u201C\u7B2C\u51E0\u5468\u201D\u3002</div>
    <input id="firstWeekInput" type="date" style="width:100%;box-sizing:border-box;padding:8px 10px;background:rgba(0,0,0,0.4);border:1px solid rgba(0,255,255,0.2);border-radius:6px;color:#eef;font-size:13px;outline:none;color-scheme:dark;" />
    <div style="display:flex;gap:10px;margin-top:14px;justify-content:flex-end;">
      <button id="firstWeekClear" style="padding:6px 14px;border-radius:6px;border:1px solid rgba(255,100,100,0.3);background:transparent;color:#e88;cursor:pointer;font-size:13px;">\u6E05\u9664</button>
      <button id="firstWeekCancel" style="padding:6px 18px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);background:transparent;color:#8ab;cursor:pointer;font-size:13px;">\u53D6\u6D88</button>
      <button id="firstWeekConfirm" style="padding:6px 18px;border-radius:6px;border:none;background:rgba(0,255,255,0.2);color:#eef;cursor:pointer;font-size:13px;font-weight:500;">\u786E\u5B9A</button>
    </div>
  </div>
`;
document.body.appendChild(firstWeekOverlay);
const firstWeekInput = firstWeekOverlay.querySelector('#firstWeekInput');
const firstWeekConfirm = firstWeekOverlay.querySelector('#firstWeekConfirm');
const firstWeekCancel = firstWeekOverlay.querySelector('#firstWeekCancel');
const firstWeekClear = firstWeekOverlay.querySelector('#firstWeekClear');

export function openFirstWeekForm() {
  firstWeekInput.value = getSchedule().firstWeekDate || '';
  firstWeekOverlay.style.display = 'flex';
  setTimeout(function () { firstWeekInput.focus(); }, 50);
}
export function hideFirstWeekForm() {
  firstWeekOverlay.style.display = 'none';
}
firstWeekConfirm.addEventListener('click', function (e) {
  e.stopPropagation();
  const val = firstWeekInput.value;
  if (val) {
    // 自动对齐到所选日期所在周的周一
    const d = parseDate(val);
    if (!d || isNaN(d.getTime())) { firstWeekInput.focus(); return; }
    setFirstWeekDate(fmtDate(getMondayOf(d)));
  } else {
    setFirstWeekDate('');
  }
  hideFirstWeekForm();
  refreshPopup();
});
firstWeekCancel.addEventListener('click', function (e) { e.stopPropagation(); hideFirstWeekForm(); });
firstWeekClear.addEventListener('click', function (e) {
  e.stopPropagation();
  setFirstWeekDate('');
  hideFirstWeekForm();
  refreshPopup();
});
firstWeekOverlay.addEventListener('click', function (e) {
  if (e.target === firstWeekOverlay) hideFirstWeekForm();
});
firstWeekInput.addEventListener('keydown', function (e) {
  if (e.key === 'Enter') { e.preventDefault(); firstWeekConfirm.click(); }
  if (e.key === 'Escape') hideFirstWeekForm();
});
firstWeekInput.addEventListener('click', function (e) { e.stopPropagation(); });

// firstWeek 对话框打开时阻止外部点击关闭日历
document.addEventListener('click', function (e) {
  if (firstWeekOverlay.style.display === 'flex' && !firstWeekOverlay.contains(e.target)) {
    // 由各自身的事件处理，这里不干预
  }
}, true);

// 暴露 DOM 引用给 shared-state（供 calendar-popup 检查是否打开）
state.eventFormOverlay = eventFormOverlay;
state.slotMenu = slotMenu;
state.slotTimeOverlay = slotTimeOverlay;
state.firstWeekOverlay = firstWeekOverlay;

// 导出 addSlot 入口（供 calendar-popup 点击"添加一节"按钮调用）
export function addSlotClicked() {
  addSlot('08:00-09:40');
  refreshPopup();
}
