// ============================================================
//  calendar / anniversary-form.js — 纪念日/倒计时/生日/节日 表单
// ============================================================
import { state } from './shared-state.js';
import {
  addItem, updateItem, removeItem, getItems
} from './anniversary-store.js';
import { solarToLunar } from './lunar-utils.js';

let editMode = 'add'; // 'add' | 'edit'
let editId = null;

const TYPE_LABELS = {
  countdown: '倒计时',
  anniversary: '纪念日',
  birthday: '生日',
  festival: '节日'
};

// ── 节日数据库 ─────────────────────────────────────────────
// 公历节日（按月分组，每月多个节日）
const SOLAR_FESTIVALS_BY_MONTH = {
  1: [
    { name: '元旦', day: 1 },
    { name: '警察节', day: 10 }
  ],
  2: [
    { name: '情人节', day: 14 },
    { name: '国际母语日', day: 21 }
  ],
  3: [
    { name: '学雷锋纪念日', day: 5 },
    { name: '妇女节', day: 8 },
    { name: '植树节', day: 12 },
    { name: '国际消费者权益日', day: 15 },
    { name: '世界睡眠日', day: 21 },
    { name: '世界水日', day: 22 }
  ],
  4: [
    { name: '愚人节', day: 1 },
    { name: '清明节', day: 4, note: '节气' },
    { name: '世界卫生日', day: 7 },
    { name: '世界地球日', day: 22 },
    { name: '世界读书日', day: 23 }
  ],
  5: [
    { name: '劳动节', day: 1 },
    { name: '青年节', day: 4 },
    { name: '世界红十字日', day: 8 },
    { name: '母亲节', day: 0, note: '第二个周日' },
    { name: '护士节', day: 12 },
    { name: '世界无烟日', day: 31 }
  ],
  6: [
    { name: '儿童节', day: 1 },
    { name: '世界环境日', day: 5 },
    { name: '全国爱眼日', day: 6 },
    { name: '父亲节', day: 0, note: '第三个周日' },
    { name: '世界难民日', day: 20 }
  ],
  7: [
    { name: '建党节', day: 1 },
    { name: '国际合作节', day: 6 },
    { name: '世界人口日', day: 11 }
  ],
  8: [
    { name: '建军节', day: 1 },
    { name: '国际青年节', day: 12 },
    { name: '世界摄影日', day: 19 }
  ],
  9: [
    { name: '抗战胜利纪念日', day: 3 },
    { name: '教师节', day: 10 },
    { name: '世界预防自杀日', day: 10 },
    { name: '国际和平日', day: 21 },
    { name: '世界无车日', day: 22 },
    { name: '全国爱牙日', day: 20 }
  ],
  10: [
    { name: '国庆节', day: 1 },
    { name: '世界教师日', day: 5 },
    { name: '世界精神卫生日', day: 10 },
    { name: '世界标准日', day: 14 },
    { name: '全球洗手日', day: 15 },
    { name: '世界粮食日', day: 16 },
    { name: '万圣节', day: 31 }
  ],
  11: [
    { name: '记者节', day: 8 },
    { name: '光棍节', day: 11 },
    { name: '世界糖尿病日', day: 14 },
    { name: '国际大学生节', day: 17 },
    { name: '世界儿童日', day: 20 },
    { name: '感恩节', day: 0, note: '第四个周四' }
  ],
  12: [
    { name: '世界艾滋病日', day: 1 },
    { name: '全国交通安全日', day: 2 },
    { name: '国际残疾人日', day: 3 },
    { name: '宪法日', day: 4 },
    { name: '国际志愿者日', day: 5 },
    { name: '圣诞节', day: 25 },
    { name: '跨年夜', day: 31 }
  ]
};

// 农历传统节日（按农历月分组）
const LUNAR_FESTIVALS_BY_MONTH = {
  1: [
    { name: '春节', day: 1 },
    { name: '元宵节', day: 15 }
  ],
  2: [
    { name: '龙头节', day: 2, note: '龙抬头' },
    { name: '花朝节', day: 12, note: '百花生日' }
  ],
  3: [
    { name: '上巳节', day: 3, note: '三月三' }
  ],
  5: [
    { name: '端午节', day: 5 }
  ],
  7: [
    { name: '七夕节', day: 7, note: '乞巧节' },
    { name: '中元节', day: 15, note: '鬼节' }
  ],
  8: [
    { name: '中秋节', day: 15 }
  ],
  9: [
    { name: '重阳节', day: 9 }
  ],
  10: [
    { name: '寒衣节', day: 1 },
    { name: '下元节', day: 15 }
  ],
  12: [
    { name: '腊八节', day: 8 },
    { name: '小年', day: 23 },
    { name: '除夕', day: 30, note: '大年三十' }
  ]
};

// 二十四节气（按顺序排列，由日历库精确计算日期）
const JIEQI_LIST = [
  { name: '小寒' },
  { name: '大寒' },
  { name: '立春' },
  { name: '雨水' },
  { name: '惊蛰' },
  { name: '春分' },
  { name: '清明' },
  { name: '谷雨' },
  { name: '立夏' },
  { name: '小满' },
  { name: '芒种' },
  { name: '夏至' },
  { name: '小暑' },
  { name: '大暑' },
  { name: '立秋' },
  { name: '处暑' },
  { name: '白露' },
  { name: '秋分' },
  { name: '寒露' },
  { name: '霜降' },
  { name: '立冬' },
  { name: '小雪' },
  { name: '大雪' },
  { name: '冬至' }
];

// 生成节日选择 HTML
function buildFestivalSelectHTML() {
  // 公历节日（左侧，按月分组）
  let leftHtml = '<div style="flex:1;"><div style="font-size:12px;color:#5ee8ff;font-weight:600;margin-bottom:6px;">公历节日</div>';
  const solarMonths = Object.keys(SOLAR_FESTIVALS_BY_MONTH).sort((a, b) => a - b);
  solarMonths.forEach(function (m) {
    const festivals = SOLAR_FESTIVALS_BY_MONTH[m];
    leftHtml += '<div style="font-size:11px;color:#8ab;margin:4px 0;">' + m + '月</div>';
    festivals.forEach(function (f) {
      const note = f.note ? ' <span style="color:#6a9;font-size:10px;">(' + f.note + ')</span>' : '';
      const isDynamic = f.day === 0; // day=0 表示动态计算（如母亲节）
      leftHtml += '<div class="fest-solar-item" data-month="' + m + '" data-day="' + f.day + '" data-name="' + f.name + '" data-is-dynamic="' + (isDynamic ? '1' : '0') + '" style="padding:6px 8px;margin:2px 0;border-radius:6px;background:rgba(0,0,0,0.25);cursor:pointer;color:#eef;font-size:12px;">' + f.name + note + '</div>';
    });
  });
  leftHtml += '</div>';

  // 农历节日（右侧：传统节日按月分组 + 节气单独分类）
  let rightHtml = '<div style="flex:1;"><div style="font-size:12px;color:#c8a8ff;font-weight:600;margin-bottom:6px;">农历节日</div>';
  const lunarMonthNames = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '腊月'];

  // 传统节日（按农历月分组）
  const lunarMonths = Object.keys(LUNAR_FESTIVALS_BY_MONTH).sort((a, b) => a - b);
  lunarMonths.forEach(function (m) {
    const festivals = LUNAR_FESTIVALS_BY_MONTH[m];
    rightHtml += '<div style="font-size:11px;color:#8ab;margin:4px 0;">' + lunarMonthNames[parseInt(m, 10) - 1] + '</div>';
    festivals.forEach(function (f) {
      const note = f.note ? ' <span style="color:#6a9;font-size:10px;">(' + f.note + ')</span>' : '';
      rightHtml += '<div class="fest-lunar-item" data-month="' + m + '" data-day="' + f.day + '" data-name="' + f.name + '" data-is-jieqi="0" style="padding:6px 8px;margin:2px 0;border-radius:6px;background:rgba(0,0,0,0.25);cursor:pointer;color:#eef;font-size:12px;">' + f.name + note + '</div>';
    });
  });

  // 二十四节气（单独分类，不按月分组）
  rightHtml += '<div style="font-size:11px;color:#da8;margin:8px 0 4px 0;border-top:1px solid rgba(255,200,100,0.15);padding-top:6px;">二十四节气</div>';
  JIEQI_LIST.forEach(function (f) {
    rightHtml += '<div class="fest-lunar-item" data-month="0" data-day="0" data-name="' + f.name + '" data-is-jieqi="1" style="padding:6px 8px;margin:2px 0;border-radius:6px;background:rgba(0,0,0,0.25);cursor:pointer;color:#eef;font-size:12px;">' + f.name + '</div>';
  });

  rightHtml += '</div>';

  return '<div id="festivalSelector" style="display:none;margin-bottom:12px;padding:12px;background:rgba(0,0,0,0.3);border-radius:8px;border:1px solid rgba(0,255,255,0.1);"><div style="display:flex;gap:12px;max-height:280px;overflow-y:auto;">' + leftHtml + rightHtml + '</div></div>';
}

const overlay = document.createElement('div');
overlay.id = 'annFormOverlay';
overlay.style.cssText = `
  position: fixed; inset: 0; z-index: 1000002;
  background: rgba(0,0,0,0.5);
  display: none; align-items: center; justify-content: center;
`;
overlay.innerHTML = `
  <div id="annFormBox" style="
    background: rgba(15, 25, 40, 0.96);
    backdrop-filter: blur(16px);
    border: 1px solid rgba(0, 255, 255, 0.25);
    border-radius: 12px;
    padding: 18px 20px;
    width: 340px;
    box-shadow: 0 8px 40px rgba(0,0,0,0.6);
    color: #b0d8ee;
    font-family: system-ui, -apple-system, sans-serif;
  ">
    <div id="annFormTitle" style="font-size:15px;font-weight:600;color:#eef;margin-bottom:14px;">添加纪念日</div>

    <div style="margin-bottom:12px;">
      <div style="font-size:11px;color:#8ab;margin-bottom:5px;">类型</div>
      <select id="annType" style="width:100%;padding:7px 10px;background:rgba(0,0,0,0.4);border:1px solid rgba(0,255,255,0.2);border-radius:6px;color:#eef;font-size:13px;box-sizing:border-box;">
        <option value="countdown">倒计时（一次性）</option>
        <option value="anniversary">纪念日（每年）</option>
        <option value="birthday">生日（每年）</option>
        <option value="festival">节日（每年）</option>
      </select>
    </div>

    <div style="margin-bottom:12px;">
      <div id="annTitleLabel" style="font-size:11px;color:#8ab;margin-bottom:5px;">名称</div>
      <input id="annTitle" type="text" placeholder="例如：结婚纪念日 / 春节 / 小明" style="width:100%;padding:7px 10px;background:rgba(0,0,0,0.4);border:1px solid rgba(0,255,255,0.2);border-radius:6px;color:#eef;font-size:13px;box-sizing:border-box;" />
    </div>

    <div id="annDateTypeWrap" style="display:flex;gap:8px;margin-bottom:12px;">
      <div style="flex:1;">
        <div id="annDateTypeLabel" style="font-size:11px;color:#8ab;margin-bottom:5px;">历法</div>
        <select id="annDateType" style="width:100%;padding:7px 10px;background:rgba(0,0,0,0.4);border:1px solid rgba(0,255,255,0.2);border-radius:6px;color:#eef;font-size:13px;box-sizing:border-box;">
          <option value="solar">公历</option>
          <option value="lunar">农历</option>
        </select>
      </div>
    </div>

    <div id="annBirthdayHint" style="margin-bottom:12px;display:none;padding:8px 10px;background:rgba(0,255,255,0.05);border-radius:6px;font-size:11px;color:#7af0a8;">
      💡 出生日期为公历，可选择按公历或农历方式庆祝生日
    </div>

    <!-- 节日选择器（动态填充） -->
    <div id="festivalSelectorWrap"></div>

    <!-- 日期输入区域（节日类型时隐藏） -->
    <div id="annDateInputWrap" style="margin-bottom:12px;">
      <input id="annYear" type="hidden" />
      <input id="annMonth" type="hidden" />
      <input id="annDay" type="hidden" />
      <div id="annDateDisplay" style="padding:7px 10px;background:rgba(0,0,0,0.4);border:1px solid rgba(0,255,255,0.2);border-radius:6px;color:#6a9;font-size:13px;cursor:pointer;margin-bottom:6px;">点击下方日历选择日期</div>
      <div id="annMiniCal" style="padding:8px;background:rgba(0,0,0,0.3);border-radius:8px;border:1px solid rgba(255,255,255,0.1);"></div>
    </div>

    <!-- 提前提醒天数 -->
    <div style="margin-bottom:12px;">
      <div style="font-size:11px;color:#8ab;margin-bottom:5px;">提前提醒天数</div>
      <select id="annReminderDays" style="width:100%;padding:7px 10px;background:rgba(0,0,0,0.4);border:1px solid rgba(0,255,255,0.2);border-radius:6px;color:#eef;font-size:13px;box-sizing:border-box;">
        <option value="0">当天提醒</option>
        <option value="1">提前 1 天</option>
        <option value="2" selected>提前 2 天</option>
        <option value="3">提前 3 天</option>
        <option value="5">提前 5 天</option>
        <option value="7">提前 7 天</option>
        <option value="14">提前 14 天</option>
        <option value="30">提前 30 天</option>
      </select>
    </div>

    <div style="margin-bottom:14px;">
      <div style="font-size:11px;color:#8ab;margin-bottom:5px;">备注（可选）</div>
      <input id="annNote" type="text" placeholder="例如：一起去看海" style="width:100%;padding:7px 10px;background:rgba(0,0,0,0.4);border:1px solid rgba(0,255,255,0.2);border-radius:6px;color:#eef;font-size:13px;box-sizing:border-box;" />
    </div>

    <div style="display:flex;gap:8px;">
      <button id="annSaveBtn" style="flex:1;padding:8px;background:rgba(0,255,255,0.15);border:1px solid rgba(0,255,255,0.4);border-radius:6px;color:#eef;font-size:13px;cursor:pointer;">保存</button>
      <button id="annDeleteBtn" style="padding:8px 14px;background:rgba(255,143,163,0.15);border:1px solid rgba(255,143,163,0.4);border-radius:6px;color:#ff8fa3;font-size:13px;cursor:pointer;display:none;">删除</button>
      <button id="annCancelBtn" style="padding:8px 14px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.15);border-radius:6px;color:#8ab;font-size:13px;cursor:pointer;">取消</button>
    </div>
  </div>
`;
document.body.appendChild(overlay);

const elTitle = overlay.querySelector('#annTitle');
const elType = overlay.querySelector('#annType');
const elDateTypeWrap = overlay.querySelector('#annDateTypeWrap');
const elDateTypeLabel = overlay.querySelector('#annDateTypeLabel');
const elDateType = overlay.querySelector('#annDateType');
const elBirthdayHint = overlay.querySelector('#annBirthdayHint');
const elFestivalWrap = overlay.querySelector('#festivalSelectorWrap');
const elDateInputWrap = overlay.querySelector('#annDateInputWrap');
const elYear = overlay.querySelector('#annYear');
const elMonth = overlay.querySelector('#annMonth');
const elDay = overlay.querySelector('#annDay');
const elDateDisplay = overlay.querySelector('#annDateDisplay');
const elMiniCal = overlay.querySelector('#annMiniCal');
const elReminderDays = overlay.querySelector('#annReminderDays');
const elNote = overlay.querySelector('#annNote');
const elSave = overlay.querySelector('#annSaveBtn');
const elDelete = overlay.querySelector('#annDeleteBtn');
const elCancel = overlay.querySelector('#annCancelBtn');
const elFormTitle = overlay.querySelector('#annFormTitle');

let annCalYear = new Date().getFullYear();
let annCalMonth = new Date().getMonth();

// 渲染带农历显示的日历表
function renderAnnMiniCal() {
  const year = annCalYear;
  const month = annCalMonth;
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const selectedYear = elYear.value;
  const selectedMonth = elMonth.value;
  const selectedDay = elDay.value;
  const selectedDate = (selectedYear && selectedMonth && selectedDay)
    ? selectedYear + '-' + String(selectedMonth).padStart(2, '0') + '-' + String(selectedDay).padStart(2, '0')
    : '';
  const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
  let html = '';
  html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">';
  html += '<div class="ann-cal-nav" data-dir="-1" style="cursor:pointer;color:#8ab;padding:2px 8px;font-size:14px;">&#9664;</div>';
  html += '<div style="color:#eef;font-size:12px;font-weight:500;">' + year + '年 ' + monthNames[month] + '</div>';
  html += '<div class="ann-cal-nav" data-dir="1" style="cursor:pointer;color:#8ab;padding:2px 8px;font-size:14px;">&#9654;</div>';
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
    const lunarInfo = solarToLunar(year, month + 1, day);
    const lunarDayText = lunarInfo ? lunarInfo.dayName : '';
    const bg = isSelected ? 'background:rgba(0,255,255,0.35);color:#fff;font-weight:600;'
      : (isToday ? 'background:rgba(0,255,255,0.15);color:#eef;font-weight:600;' : 'color:#b0d8ee;');
    html += '<div class="ann-cal-day" data-year="' + year + '" data-month="' + (month + 1) + '" data-day="' + day + '" style="text-align:center;padding:3px 2px;border-radius:4px;cursor:pointer;font-size:11px;' + bg + 'position:relative;">';
    html += '<div>' + day + '</div>';
    html += '<div style="font-size:8px;color:' + (isSelected ? '#ccc' : '#8ab') + ';">' + lunarDayText + '</div>';
    html += '</div>';
  }
  html += '</div>';
  elMiniCal.innerHTML = html;
}

// 日历点击事件
elMiniCal.addEventListener('click', function (e) {
  const navBtn = e.target.closest('.ann-cal-nav');
  if (navBtn) {
    e.stopPropagation();
    const dir = parseInt(navBtn.dataset.dir, 10);
    annCalMonth += dir;
    if (annCalMonth < 0) { annCalMonth = 11; annCalYear--; }
    if (annCalMonth > 11) { annCalMonth = 0; annCalYear++; }
    renderAnnMiniCal();
    return;
  }
  const dayBtn = e.target.closest('.ann-cal-day');
  if (dayBtn) {
    e.stopPropagation();
    const y = parseInt(dayBtn.dataset.year, 10);
    const m = parseInt(dayBtn.dataset.month, 10);
    const d = parseInt(dayBtn.dataset.day, 10);
    elYear.value = y;
    elMonth.value = m;
    elDay.value = d;
    const lunarInfo = solarToLunar(y, m, d);
    const displayText = y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0') + (lunarInfo ? ' (' + lunarInfo.monthName + lunarInfo.dayName + ')' : '');
    elDateDisplay.textContent = displayText;
    elDateDisplay.style.color = '#eef';
    renderAnnMiniCal();
  }
});

// 点击日期显示区域清除日期
elDateDisplay.addEventListener('click', function (e) {
  e.stopPropagation();
  elYear.value = '';
  elMonth.value = '';
  elDay.value = '';
  elDateDisplay.textContent = '点击下方日历选择日期';
  elDateDisplay.style.color = '#6a9';
  renderAnnMiniCal();
});
const elTitleLabel = overlay.querySelector('#annTitleLabel');

// 填充节日选择器并绑定事件
elFestivalWrap.innerHTML = buildFestivalSelectHTML();
const elFestivalSelector = elFestivalWrap.querySelector('#festivalSelector');
let selectedFestival = null; // { name, dateType, month, day, isLeap }

// 公历节日点击事件
elFestivalWrap.addEventListener('click', function (e) {
  const solarItem = e.target.closest('.fest-solar-item');
  if (solarItem) {
    e.stopPropagation();
    const month = parseInt(solarItem.dataset.month, 10);
    const day = parseInt(solarItem.dataset.day, 10);
    const name = solarItem.dataset.name;
    const isDynamic = solarItem.dataset.isDynamic === '1';
    selectedFestival = {
      name,
      dateType: 'solar',
      month,
      day,
      isLeap: false,
      isDynamic // 如母亲节、父亲节、感恩节（需动态计算）
    };
    // 高亮选中
    elFestivalWrap.querySelectorAll('.fest-solar-item, .fest-lunar-item').forEach(function (el) {
      el.style.background = 'rgba(0,0,0,0.25)';
      el.style.border = '';
    });
    solarItem.style.background = 'rgba(0,255,255,0.15)';
    solarItem.style.border = '1px solid rgba(0,255,255,0.4)';
    // 自动填充标题
    elTitle.value = selectedFestival.name;
    return;
  }
  const lunarItem = e.target.closest('.fest-lunar-item');
  if (lunarItem) {
    e.stopPropagation();
    const month = parseInt(lunarItem.dataset.month, 10);
    const day = parseInt(lunarItem.dataset.day, 10);
    const name = lunarItem.dataset.name;
    const isJieQi = lunarItem.dataset.isJieqi === '1';
    selectedFestival = {
      name,
      dateType: 'lunar',
      month,
      day,
      isLeap: false,
      isJieQi // 节气节日（如立春、清明、冬至等）
    };
    // 高亮选中
    elFestivalWrap.querySelectorAll('.fest-solar-item, .fest-lunar-item').forEach(function (el) {
      el.style.background = 'rgba(0,0,0,0.25)';
      el.style.border = '';
    });
    lunarItem.style.background = 'rgba(200,168,255,0.15)';
    lunarItem.style.border = '1px solid rgba(200,168,255,0.4)';
    // 自动填充标题
    elTitle.value = selectedFestival.name;
  }
});

function updatePlaceholder() {
  const t = elType.value;
  const dt = elDateType.value;

  // 节日类型：显示节日选择器，隐藏日期输入
  if (t === 'festival') {
    elFestivalSelector.style.display = '';
    elDateTypeWrap.style.display = 'none';
    elBirthdayHint.style.display = 'none';
    elDateInputWrap.style.display = 'none';
    elTitleLabel.textContent = '节日名称（可编辑）';
    elTitle.placeholder = '点击下方选择节日';
    selectedFestival = null; // 重置选择
    // 重置高亮
    elFestivalWrap.querySelectorAll('.fest-solar-item, .fest-lunar-item').forEach(function (el) {
      el.style.background = 'rgba(0,0,0,0.25)';
      el.style.border = '';
    });
    return;
  }

  // 非节日类型：隐藏节日选择器
  elFestivalSelector.style.display = 'none';
  elDateInputWrap.style.display = '';

  // 生日类型特殊显示：庆祝方式选择，隐藏闰月，显示提示
  if (t === 'birthday') {
    elDateTypeLabel.textContent = '庆祝方式';
    elDateTypeWrap.style.display = '';
    elBirthdayHint.style.display = '';
    elTitleLabel.textContent = '姓名';
    elTitle.placeholder = '例如：小明 / 妈妈';
  } else {
    // 其他类型：历法选择
    elDateTypeLabel.textContent = '历法';
    elDateTypeWrap.style.display = '';
    elBirthdayHint.style.display = 'none';

    if (t === 'countdown') {
      elTitleLabel.textContent = '事件名称';
      elTitle.placeholder = '例如：项目截止 / 出发旅行';
    } else if (t === 'anniversary') {
      elTitleLabel.textContent = '纪念日名称';
      elTitle.placeholder = '例如：结婚纪念日 / 入职周年';
    }
  }
}

elType.addEventListener('change', updatePlaceholder);
elDateType.addEventListener('change', updatePlaceholder);

function showForm() {
  overlay.style.display = 'flex';
  updatePlaceholder();
  renderAnnMiniCal();
}

function hideForm() {
  overlay.style.display = 'none';
}

elSave.addEventListener('click', function () {
  const type = elType.value;
  const title = elTitle.value.trim();
  if (!title) { elTitle.focus(); return; }

  // 提前提醒天数
  const reminderDays = parseInt(elReminderDays.value, 10) || 2;

  // 节日类型：从 selectedFestival 获取数据
  if (type === 'festival') {
    if (!selectedFestival) {
      // 提示用户选择节日
      alert('请先在下方选择一个节日');
      return;
    }
    const data = {
      type,
      title: title || selectedFestival.name,
      dateType: selectedFestival.dateType,
      year: 0, // 节日每年重复
      month: selectedFestival.month,
      day: selectedFestival.day,
      isLeap: selectedFestival.isLeap || false,
      isJieQi: selectedFestival.isJieQi || false,
      isDynamic: selectedFestival.isDynamic || false,
      reminderDays,
      note: elNote.value.trim()
    };
    if (editMode === 'edit' && editId) {
      updateItem(editId, data);
    } else {
      addItem(data);
    }
    hideForm();
    if (typeof state.refreshAnniversary === 'function') state.refreshAnniversary();
    return;
  }

  // 非节日类型：从输入框读取数据
  const year = parseInt(elYear.value, 10) || 0;
  const month = parseInt(elMonth.value, 10) || 1;
  const day = parseInt(elDay.value, 10) || 1;
  if (type === 'countdown' && year <= 0) { elYear.focus(); return; }

  const dateType = elDateType.value;

  // 如果选择农历庆祝，自动计算农历月日和闰月信息
  let lunarMonth = null;
  let lunarDay = null;
  let lunarIsLeap = false;

  if (dateType === 'lunar' && year > 0) {
    const lunarInfo = solarToLunar(year, month, day);
    if (lunarInfo) {
      lunarMonth = lunarInfo.month;
      lunarDay = lunarInfo.day;
      lunarIsLeap = lunarInfo.isLeap;
    }
  }

  const data = {
    type,
    title,
    dateType,
    year,
    month,
    day,
    isLeap: lunarIsLeap,
    lunarMonth,
    lunarDay,
    reminderDays,
    note: elNote.value.trim()
  };

  if (editMode === 'edit' && editId) {
    updateItem(editId, data);
  } else {
    addItem(data);
  }
  hideForm();
  if (typeof state.refreshAnniversary === 'function') state.refreshAnniversary();
});

elDelete.addEventListener('click', function () {
  if (editMode !== 'edit' || !editId) return;
  if (!window.confirm('确认删除该条目？')) return;
  removeItem(editId);
  hideForm();
  if (typeof state.refreshAnniversary === 'function') state.refreshAnniversary();
});

elCancel.addEventListener('click', hideForm);

// 外部点击关闭
overlay.addEventListener('click', function (e) {
  if (e.target === overlay) hideForm();
});

export function openAnniversaryForm() {
  editMode = 'add';
  editId = null;
  elFormTitle.textContent = '添加纪念日 / 倒计时';
  elType.value = 'countdown';
  elTitle.value = '';
  elDateType.value = 'solar';
  const today = new Date();
  elYear.value = today.getFullYear();
  elMonth.value = today.getMonth() + 1;
  elDay.value = today.getDate();
  annCalYear = today.getFullYear();
  annCalMonth = today.getMonth();
  const lunarInfo = solarToLunar(today.getFullYear(), today.getMonth() + 1, today.getDate());
  elDateDisplay.textContent = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0') + (lunarInfo ? ' (' + lunarInfo.monthName + lunarInfo.dayName + ')' : '');
  elDateDisplay.style.color = '#eef';
  elReminderDays.value = '2'; // 默认提前2天
  elNote.value = '';
  elDelete.style.display = 'none';
  showForm();
}

export function editAnniversaryForm(id) {
  const item = getItems().find(it => it.id === id);
  if (!item) return;
  editMode = 'edit';
  editId = id;
  elFormTitle.textContent = '编辑：' + item.title;
  elType.value = item.type;
  elTitle.value = item.title || '';
  elDateType.value = item.dateType || 'solar';
  elYear.value = item.year || 0;
  elMonth.value = item.month || 1;
  elDay.value = item.day || 1;
  if (item.year && item.month && item.day) {
    annCalYear = item.year;
    annCalMonth = item.month - 1;
    const lunarInfo = solarToLunar(item.year, item.month, item.day);
    elDateDisplay.textContent = item.year + '-' + String(item.month).padStart(2, '0') + '-' + String(item.day).padStart(2, '0') + (lunarInfo ? ' (' + lunarInfo.monthName + lunarInfo.dayName + ')' : '');
    elDateDisplay.style.color = '#eef';
  } else {
    annCalYear = new Date().getFullYear();
    annCalMonth = new Date().getMonth();
    elDateDisplay.textContent = '点击下方日历选择日期';
    elDateDisplay.style.color = '#6a9';
  }
  elReminderDays.value = item.reminderDays != null ? String(item.reminderDays) : '2';
  elNote.value = item.note || '';
  elDelete.style.display = '';
  showForm();
}

export function hideAnniversaryForm() { hideForm(); }

// 暴露 DOM 给 shared-state（供 calendar-popup 检查是否打开）
state.annFormOverlay = overlay;
