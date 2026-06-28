// ============================================================
//  UI / LunarCalendar.js — 时钟/天气/农历
// ============================================================

// ==================== 农历与时辰工具 ====================
// 农历查找表（1900-2100年）来自公共领域算法
const LUNAR_INFO = [
  0x04bd8,0x04ae0,0x0a570,0x054d5,0x0d260,0x0d950,0x16554,0x056a0,0x09ad0,0x055d2, // 1900-1909
  0x04ae0,0x0a5b6,0x0a4d0,0x0d250,0x1d255,0x0b540,0x0d6a0,0x0ada2,0x095b0,0x14977, // 1910-1919
  0x04970,0x0a4b0,0x0b4b5,0x06a50,0x06d40,0x1ab54,0x02b60,0x09570,0x052f2,0x04970, // 1920-1929
  0x06566,0x0d4a0,0x0ea50,0x06e95,0x05ad0,0x02b60,0x186e3,0x092e0,0x1c8d7,0x0c950, // 1930-1939
  0x0d4a0,0x1d8a6,0x0b550,0x056a0,0x1a5b4,0x025d0,0x092d0,0x0d2b2,0x0a950,0x0b557, // 1940-1949
  0x06ca0,0x0b550,0x15355,0x04da0,0x0a5b0,0x14573,0x052b0,0x0a9a8,0x0e950,0x06aa0, // 1950-1959
  0x0aea6,0x0ab50,0x04b60,0x0aae4,0x0a570,0x05260,0x0f263,0x0d950,0x05b57,0x056a0, // 1960-1969
  0x096d0,0x04dd5,0x04ad0,0x0a4d0,0x0d4d4,0x0d250,0x0d558,0x0b540,0x0b6a0,0x195a6, // 1970-1979
  0x095b0,0x049b0,0x0a974,0x0a4b0,0x0b27a,0x06a50,0x06d40,0x0af46,0x0ab60,0x09570, // 1980-1989
  0x04af5,0x04970,0x064b0,0x074a3,0x0ea50,0x06b58,0x05ac0,0x0ab60,0x096d5,0x092e0, // 1990-1999
  0x0c960,0x0d954,0x0d4a0,0x0da50,0x07552,0x056a0,0x0abb7,0x025d0,0x092d0,0x0cab5, // 2000-2009
  0x0a950,0x0b4a0,0x0baa4,0x0ad50,0x055d9,0x04ba0,0x0a5b0,0x15176,0x052b0,0x0a930, // 2010-2019
  0x07954,0x06aa0,0x0ad50,0x05b52,0x04b60,0x0a6e6,0x0a4e0,0x0d260,0x0ea65,0x0d530, // 2020-2029
  0x05aa0,0x076a3,0x096d0,0x04afb,0x04ad0,0x0a4d0,0x1d0b6,0x0d250,0x0d520,0x0dd45, // 2030-2039
  0x0b5a0,0x056d0,0x055b2,0x049b0,0x0a577,0x0a4b0,0x0aa50,0x1b255,0x06d20,0x0ada0, // 2040-2049
  0x14b63,0x09370,0x049f8,0x04970,0x064b0,0x168a6,0x0ea50,0x06aa0,0x1a6c4,0x0aae0, // 2050-2059
  0x092e0,0x0d2e3,0x0c960,0x0d557,0x0d4a0,0x0da50,0x05d55,0x056a0,0x0a6d0,0x055d4, // 2060-2069
  0x052d0,0x0a9b8,0x0a950,0x0b4a0,0x0b6a6,0x0ad50,0x055a0,0x0aba4,0x0a5b0,0x052b0, // 2070-2079
  0x0b273,0x06930,0x07337,0x06aa0,0x0ad50,0x14b55,0x04b60,0x0a570,0x054e4,0x0d160, // 2080-2089
  0x0e968,0x0d520,0x0daa0,0x16aa6,0x056d0,0x04ae0,0x0a9d4,0x0a4d0,0x0d150,0x0f252, // 2090-2099
  0x0d520 // 2100
];
const HEAVENLY = ['\u7532','\u4E59','\u4E19','\u4E01','\u620A','\u5DF1','\u5E9A','\u8F9B','\u58EC','\u7678'];
const EARTHLY = ['\u5B50','\u4E11','\u5BC5','\u536F','\u8FB0','\u5DF3','\u5348','\u672A','\u7533','\u9149','\u620C','\u4EA5'];
const ZODIAC = ['\u9F20','\u725B','\u864E','\u5154','\u9F99','\u86C7','\u9A6C','\u7F8A','\u7334','\u9E21','\u72D7','\u732A'];
const LUNAR_MONTHS = ['\u6B63','\u4E8C','\u4E09','\u56DB','\u4E94','\u516D','\u4E03','\u516B','\u4E5D','\u5341','\u51AC','\u814A'];
const LUNAR_DAYS = ['\u521D\u4E00','\u521D\u4E8C','\u521D\u4E09','\u521D\u56DB','\u521D\u4E94','\u521D\u516D','\u521D\u4E03','\u521D\u516B','\u521D\u4E5D','\u521D\u5341',
  '\u5341\u4E00','\u5341\u4E8C','\u5341\u4E09','\u5341\u56DB','\u5341\u4E94','\u5341\u516D','\u5341\u4E03','\u5341\u516B','\u5341\u4E5D','\u4E8C\u5341',
  '\u5EFF\u4E00','\u5EFF\u4E8C','\u5EFF\u4E09','\u5EFF\u56DB','\u5EFF\u4E94','\u5EFF\u516D','\u5EFF\u4E03','\u5EFF\u516B','\u5EFF\u4E5D','\u4E09\u5341'];
const SHICHEN = [
  { name:'\u5B50\u65F6', range:'23:00-00:59' },
  { name:'\u4E11\u65F6', range:'01:00-02:59' },
  { name:'\u5BC5\u65F6', range:'03:00-04:59' },
  { name:'\u536F\u65F6', range:'05:00-06:59' },
  { name:'\u8FB0\u65F6', range:'07:00-08:59' },
  { name:'\u5DF3\u65F6', range:'09:00-10:59' },
  { name:'\u5348\u65F6', range:'11:00-12:59' },
  { name:'\u672A\u65F6', range:'13:00-14:59' },
  { name:'\u7533\u65F6', range:'15:00-16:59' },
  { name:'\u9149\u65F6', range:'17:00-18:59' },
  { name:'\u620C\u65F6', range:'19:00-20:59' },
  { name:'\u4EA5\u65F6', range:'21:00-22:59' }
];

function solarToLunar(year, month, day) {
  // 基准：1900年1月31日 = 农历庚子年正月初一
  let baseDate = new Date(1900, 0, 31);
  let target = new Date(year, month - 1, day);
  let offset = Math.floor((target - baseDate) / 86400000);

  let lunarYear, lunarMonth, lunarDay, isLeap = false;

  // 查找年份
  for (lunarYear = 1900; lunarYear < 2101 && offset > 0; lunarYear++) {
    let yearDays = 0;
    let info = LUNAR_INFO[lunarYear - 1900];
    let leapMonth = info >> 16 & 0xf;
    let monthBits = info & 0xffff;
    let monthCount = leapMonth ? 13 : 12;
    for (let i = 0; i < monthCount; i++) {
      yearDays += (monthBits & (1 << i)) ? 30 : 29;
    }
    if (offset < yearDays) break;
    offset -= yearDays;
  }

  if (offset < 0) { offset += yearDays; lunarYear--; }

  let info = LUNAR_INFO[lunarYear - 1900];
  let leapMonth = info >> 16 & 0xf;
  let monthBits = info & 0xffff;
  let monthCount = leapMonth ? 13 : 12;

  for (let i = 0; i < monthCount; i++) {
    let days = (monthBits & (1 << i)) ? 30 : 29;
    if (offset < days) {
      lunarMonth = i + 1;
      lunarDay = offset + 1;
      break;
    }
    offset -= days;
  }

  if (leapMonth && lunarMonth > leapMonth) {
    lunarMonth--;
    if (lunarMonth === leapMonth) isLeap = true;
  }

  let ganZhiYear = HEAVENLY[(lunarYear - 4) % 10] + EARTHLY[(lunarYear - 4) % 12];
  let zodiac = ZODIAC[(lunarYear - 4) % 12];

  return {
    year: lunarYear,
    month: lunarMonth,
    day: lunarDay,
    isLeap,
    ganZhiYear,
    zodiac,
    monthName: (isLeap ? '\u95F0' : '') + LUNAR_MONTHS[lunarMonth - 1] + '\u6708',
    dayName: LUNAR_DAYS[lunarDay - 1]
  };
}

function getShichen(hour, minute) {
  let totalMin = hour * 60 + minute;
  // 子时跨两天：23:00-00:59
  if (totalMin >= 23 * 60 || totalMin < 1 * 60) return SHICHEN[0];
  if (totalMin < 3 * 60) return SHICHEN[1];
  if (totalMin < 5 * 60) return SHICHEN[2];
  if (totalMin < 7 * 60) return SHICHEN[3];
  if (totalMin < 9 * 60) return SHICHEN[4];
  if (totalMin < 11 * 60) return SHICHEN[5];
  if (totalMin < 13 * 60) return SHICHEN[6];
  if (totalMin < 15 * 60) return SHICHEN[7];
  if (totalMin < 17 * 60) return SHICHEN[8];
  if (totalMin < 19 * 60) return SHICHEN[9];
  if (totalMin < 21 * 60) return SHICHEN[10];
  return SHICHEN[11];
}

// ==================== 任务栏时钟（含农历悬浮） ====================
export function initTaskbarClock() {
  let el = document.getElementById('taskbarClock');
  if (!el) return;

  // 创建日历弹窗（点击时钟打开，类似 Windows）
  let calPopup = document.createElement('div');
  calPopup.id = 'clockCalendarPopup';
  calPopup.style.cssText = `
    position: fixed;
    background: rgba(10, 20, 30, 0.95);
    backdrop-filter: blur(16px);
    border: 1px solid rgba(0, 255, 255, 0.25);
    border-radius: 12px;
    padding: 14px 16px 12px;
    color: #b0d8ee;
    font-size: 12.5px;
    z-index: 999999;
    display: none;
    min-width: 268px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.6);
    user-select: none;
    font-family: system-ui, -apple-system, sans-serif;
  `;
  document.body.appendChild(calPopup);

  let calViewDate = new Date();
  let calSelectedDate = new Date();
  let calVisible = false;
  let calView = 'month';
  const monthNames = ['\u4E00\u6708','\u4E8C\u6708','\u4E09\u6708','\u56DB\u6708','\u4E94\u6708','\u516D\u6708','\u4E03\u6708','\u516B\u6708','\u4E5D\u6708','\u5341\u6708','\u5341\u4E00\u6708','\u5341\u4E8C\u6708'];
  const weekHeaders = ['\u65E5','\u4E00','\u4E8C','\u4E09','\u56DB','\u4E94','\u516D'];
  const weekDayNames = ['\u5468\u65E5','\u5468\u4E00','\u5468\u4E8C','\u5468\u4E09','\u5468\u56DB','\u5468\u4E94','\u5468\u516D'];
  const defaultSlots = ['08:00-09:40','10:00-11:40','14:00-15:40','16:00-17:40','19:00-20:40'];

  // ==================== 日程数据层（localStorage） ====================
  const SCHED_KEY = 'astroknot_schedule';
  let schedule = loadSchedule();
  function loadSchedule() {
    try {
      const raw = localStorage.getItem(SCHED_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        return {
          events: Array.isArray(d.events) ? d.events : [],
          weekly: Array.isArray(d.weekly) ? d.weekly : [],
          slots: Array.isArray(d.slots) && d.slots.length ? d.slots : defaultSlots.slice()
        };
      }
    } catch {}
    return { events: [], weekly: [], slots: defaultSlots.slice() };
  }
  function saveSchedule() {
    try { localStorage.setItem(SCHED_KEY, JSON.stringify(schedule)); } catch {}
  }
  function fmtDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + dd;
  }
  function parseDate(s) {
    const p = s.split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function getDayEvents(dateStr) {
    return schedule.events.filter(e => e.date === dateStr).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  }
  function getWeeklyCell(weekday, slotIdx) {
    return schedule.weekly.find(w => w.weekday === weekday && w.slot === slotIdx);
  }

  // ── 天气组件 ──
  const weatherEl = document.getElementById('taskbarWeather');
  const weatherIconEl = document.getElementById('weatherIcon');
  const weatherTempEl = document.getElementById('weatherTemp');

  const wmoIcons = {
    0: '\u2600\uFE0F', 1: '\uD83C\uDF24\uFE0F', 2: '\u26C5', 3: '\u2601\uFE0F',
    45: '\uD83C\uDF2B\uFE0F', 48: '\uD83C\uDF2B\uFE0F',
    51: '\uD83C\uDF26\uFE0F', 53: '\uD83C\uDF26\uFE0F', 55: '\uD83C\uDF26\uFE0F',
    56: '\uD83C\uDF27\uFE0F', 57: '\uD83C\uDF27\uFE0F',
    61: '\uD83C\uDF27\uFE0F', 63: '\uD83C\uDF27\uFE0F', 65: '\uD83C\uDF27\uFE0F',
    66: '\uD83C\uDF27\uFE0F', 67: '\uD83C\uDF27\uFE0F',
    71: '\uD83C\uDF28\uFE0F', 73: '\uD83C\uDF28\uFE0F', 75: '\uD83C\uDF28\uFE0F', 77: '\uD83C\uDF28\uFE0F',
    80: '\uD83C\uDF26\uFE0F', 81: '\uD83C\uDF26\uFE0F', 82: '\uD83C\uDF26\uFE0F',
    85: '\uD83C\uDF28\uFE0F', 86: '\uD83C\uDF28\uFE0F',
    95: '\u26C8\uFE0F', 96: '\u26C8\uFE0F', 99: '\u26C8\uFE0F'
  };
  const wmoDescs = {
    0: '\u6674\u5929', 1: '\u5C11\u4E91', 2: '\u591A\u4E91', 3: '\u9634\u5929',
    45: '\u96FE', 48: '\u96FE\u51C1',
    51: '\u5C0F\u6BDB\u6BDB\u96E8', 53: '\u6BDB\u6BDB\u96E8', 55: '\u5927\u6BDB\u6BDB\u96E8',
    56: '\u51BB\u6BDB\u6BDB\u96E8', 57: '\u51BB\u6BDB\u6BDB\u96E8',
    61: '\u5C0F\u96E8', 63: '\u4E2D\u96E8', 65: '\u5927\u96E8',
    66: '\u51BB\u96E8', 67: '\u51BB\u96E8',
    71: '\u5C0F\u96EA', 73: '\u4E2D\u96EA', 75: '\u5927\u96EA', 77: '\u96EA\u7C92',
    80: '\u9635\u96E8', 81: '\u4E2D\u9635\u96E8', 82: '\u5927\u9635\u96E8',
    85: '\u5C0F\u9635\u96EA', 86: '\u5927\u9635\u96EA',
    95: '\u96F7\u66B4', 96: '\u96F7\u66B4+\u51B0\u96F9', 99: '\u96F7\u66B4+\u51B0\u96F9'
  };

  let weatherCoords = null;
  let weatherCityName = '';
  let weatherCurrent = null;
  let weatherDaily = null;
  let weatherHourly = null;

  // 创建天气悬浮弹窗
  const weatherPopup = document.createElement('div');
  weatherPopup.id = 'weatherPopup';
  weatherPopup.style.cssText = `
    position: fixed;
    background: rgba(10, 20, 30, 0.93);
    backdrop-filter: blur(16px);
    border: 1px solid rgba(0, 255, 255, 0.2);
    border-radius: 10px;
    padding: 12px 16px;
    color: #b0d8ee;
    font-size: 12.5px;
    line-height: 1.6;
    pointer-events: none;
    z-index: 999999;
    visibility: hidden;
    min-width: 180px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
  `;
  document.body.appendChild(weatherPopup);

  async function getCoords() {
    let coords = null;
    // 先尝试浏览器定位
    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          timeout: 5000, maximumAge: 600000
        });
      });
      coords = { lat: pos.coords.latitude, lon: pos.coords.longitude };
    } catch {
      // 浏览器定位失败 → 用 IP 定位（多服务降级）
      const ipServices = [
        async () => {
          const r = await fetch('https://ipinfo.io/json');
          const d = await r.json();
          if (d && d.loc) { const s = d.loc.split(','); return { lat: +s[0], lon: +s[1], city: d.city, region: d.region }; }
          return null;
        },
        async () => {
          const r = await fetch('https://geolocation-db.com/json/');
          const d = await r.json();
          if (d && d.latitude != null) return { lat: d.latitude, lon: d.longitude, city: d.city };
          return null;
        }
      ];
      for (const svc of ipServices) {
        try {
          const result = await svc();
          if (result) {
            coords = { lat: result.lat, lon: result.lon };
            if (result.city) weatherCityName = result.city + (result.region ? ', ' + result.region : '');
            break;
          }
        } catch {}
      }
    }
    return coords;
  }

  async function fetchWeather() {
    try {
      if (!weatherCoords) {
        weatherCoords = await getCoords();
        if (!weatherCoords) {
          weatherTempEl.textContent = '--\u00B0C';
          return;
        }
      }
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${weatherCoords.lat}&longitude=${weatherCoords.lon}&current_weather=true&daily=temperature_2m_max,temperature_2m_min,weathercode&hourly=temperature_2m,weathercode&timezone=auto&forecast_days=1`;
      const resp = await fetch(url);
      if (!resp.ok) return;
      const data = await resp.json();
      if (data) {
        if (data.current_weather) { updateWeatherDisplay(data.current_weather); weatherCurrent = data.current_weather; }
        if (data.daily) weatherDaily = data.daily;
        if (data.hourly) weatherHourly = data.hourly;
      }
    } catch {}
  }

  function updateWeatherDisplay(cw) {
    if (!weatherIconEl || !weatherTempEl) return;
    const code = cw.weathercode;
    const icon = wmoIcons[code] || '\uD83C\uDF21\uFE0F';
    const temp = Math.round(cw.temperature);
    weatherIconEl.textContent = icon;
    weatherTempEl.textContent = temp + '\u00B0C';
  }

  function buildWeatherPopupContent() {
    const now = new Date();
    const hh = now.getHours();
    let html = '';

    // 位置
    if (weatherCityName) {
      html += `<div style="font-weight:600;color:#eef;margin-bottom:4px;">\uD83D\uDCCD ${weatherCityName}</div>`;
    } else {
      html += `<div style="font-weight:600;color:#eef;margin-bottom:4px;">\uD83D\uDCCD \u5F53\u524D\u4F4D\u7F6E</div>`;
    }

    // 当前天气
    if (weatherCurrent) {
      const cw = weatherCurrent;
      const desc = wmoDescs[cw.weathercode] || '';
      html += `<div style="font-size:22px;display:flex;align-items:center;gap:8px;margin:4px 0;">
        ${wmoIcons[cw.weathercode] || '\uD83C\uDF21\uFE0F'} <span style="font-size:26px;font-weight:700;color:#eef;">${Math.round(cw.temperature)}\u00B0C</span>
        <span style="font-size:13px;color:#8ab;">${desc}</span>
      </div>`;
    }

    // 今日高低温
    if (weatherDaily && weatherDaily.temperature_2m_max && weatherDaily.temperature_2m_min) {
      const hi = Math.round(weatherDaily.temperature_2m_max[0]);
      const lo = Math.round(weatherDaily.temperature_2m_min[0]);
      html += `<div style="margin:2px 0 6px;font-size:13px;color:#8ab;">
        \uD83D\uDD3A ${hi}\u00B0C &nbsp; \uD83D\uDD3B ${lo}\u00B0C
      </div>`;
    }

    // 逐时预报（取当前时间之后的若干整点）
    if (weatherHourly && weatherHourly.time && weatherHourly.temperature_2m) {
      html += `<div style="border-top:1px solid rgba(255,255,255,0.08);padding-top:6px;margin-top:4px;font-size:12px;color:#8ab;font-weight:500;">\u4ECA\u65E5\u9010\u65F6</div>`;
      html += `<div style="display:flex;gap:6px;margin-top:4px;flex-wrap:wrap;">`;
      const times = weatherHourly.time;
      const temps = weatherHourly.temperature_2m;
      const codes = weatherHourly.weathercode;
      // 取当前小时及之后，每隔 3 小时，最多 6 个
      let found = false;
      for (let i = 0; i < times.length; i++) {
        const t = new Date(times[i]);
        if (t.getHours() >= hh && !found || (found && t.getHours() % 3 === 0)) {
          if (!found) found = true;
          if (html.split('flex-item').length > 7) break;
          const icon = wmoIcons[codes[i]] || '\uD83C\uDF21\uFE0F';
          html += `<div class="flex-item" style="display:flex;flex-direction:column;align-items:center;gap:1px;">
            <span style="font-size:11px;color:#6a9;">${String(t.getHours()).padStart(2,'0')}:00</span>
            <span style="font-size:16px;">${icon}</span>
            <span style="font-size:12px;color:#eef;">${Math.round(temps[i])}\u00B0</span>
          </div>`;
        }
      }
      html += `</div>`;
    }

    // 更新提示
    html += `<div style="margin-top:6px;padding-top:4px;border-top:1px solid rgba(255,255,255,0.06);font-size:11px;color:#5a8;">\u70B9\u51FB\u5237\u65B0 \u00B7 \u6BCF30\u5206\u949F\u81EA\u52A8\u66F4\u65B0</div>`;

    return html;
  }

  // 启动时从 localStorage 恢复天气城市
  try {
    const saved = JSON.parse(localStorage.getItem('astroknot_weather'));
    if (saved && saved.coords) {
      weatherCoords = saved.coords;
      weatherCityName = saved.city || '';
    }
  } catch {}

  fetchWeather();
  setInterval(fetchWeather, 30 * 60 * 1000);

  // ── 右键菜单（手动定位） ──
  const weatherCtxMenu = document.createElement('div');
  weatherCtxMenu.id = 'weatherCtxMenu';
  weatherCtxMenu.style.cssText = `
    position: fixed;
    background: rgba(15, 25, 40, 0.95);
    backdrop-filter: blur(16px);
    border: 1px solid rgba(0, 255, 255, 0.2);
    border-radius: 8px;
    padding: 4px 0;
    color: #b0d8ee;
    font-size: 13px;
    z-index: 1000000;
    visibility: hidden;
    min-width: 140px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.6);
    overflow: hidden;
  `;
  weatherCtxMenu.innerHTML = `
    <div class="ctx-item" data-action="set-location" style="padding:6px 14px;cursor:pointer;display:flex;align-items:center;gap:8px;">
      <span>\uD83D\uDCCD</span><span>\u624B\u52A8\u5B9A\u4F4D...</span>
    </div>
    <div class="ctx-item" data-action="reset-location" style="padding:6px 14px;cursor:pointer;display:flex;align-items:center;gap:8px;">
      <span>\uD83D\uDD04</span><span>\u6062\u590D\u81EA\u52A8\u5B9A\u4F4D</span>
    </div>
  `;
  document.body.appendChild(weatherCtxMenu);

  // ── 自定义输入弹窗（替代 prompt） ──
  const weatherDialogOverlay = document.createElement('div');
  weatherDialogOverlay.id = 'weatherDialogOverlay';
  weatherDialogOverlay.style.cssText = `
    position: fixed; inset: 0; z-index: 1000001;
    background: rgba(0,0,0,0.5);
    display: none; align-items: center; justify-content: center;
  `;
  weatherDialogOverlay.innerHTML = `
    <div id="weatherDialogBox" style="
      background: rgba(15, 25, 40, 0.96);
      backdrop-filter: blur(16px);
      border: 1px solid rgba(0, 255, 255, 0.25);
      border-radius: 12px;
      padding: 20px 24px;
      min-width: 280px;
      box-shadow: 0 8px 40px rgba(0,0,0,0.6);
      color: #b0d8ee;
      font-size: 13px;
    ">
      <div style="font-weight:600;color:#eef;margin-bottom:12px;font-size:14px;">\uD83D\uDCCD \u624B\u52A8\u5B9A\u4F4D</div>
      <input id="weatherCityInput" type="text" placeholder="\u8F93\u5165\u57CE\u5E02\u540D\u79F0\uFF08\u4E2D/\u82F1\u6587\uFF09"
        style="
          width:100%;box-sizing:border-box;padding:8px 10px;
          background:rgba(0,0,0,0.4);border:1px solid rgba(0,255,255,0.2);
          border-radius:6px;color:#eef;font-size:13px;outline:none;
        " />
      <div style="display:flex;gap:10px;margin-top:14px;justify-content:flex-end;">
        <button id="weatherDialogCancel" style="
          padding:6px 18px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);
          background:transparent;color:#8ab;cursor:pointer;font-size:13px;
        ">\u53D6\u6D88</button>
        <button id="weatherDialogConfirm" style="
          padding:6px 18px;border-radius:6px;border:none;
          background:rgba(0,255,255,0.2);color:#eef;cursor:pointer;font-size:13px;font-weight:500;
        ">\u786E\u5B9A</button>
      </div>
    </div>
  `;
  document.body.appendChild(weatherDialogOverlay);

  const weatherDialogInput = weatherDialogOverlay.querySelector('#weatherCityInput');
  const weatherDialogConfirm = weatherDialogOverlay.querySelector('#weatherDialogConfirm');
  const weatherDialogCancel = weatherDialogOverlay.querySelector('#weatherDialogCancel');

  let weatherDialogResolve = null;

  function showWeatherDialog(defaultValue) {
    weatherDialogOverlay.style.display = 'flex';
    weatherDialogInput.value = defaultValue || '';
    setTimeout(() => {
      weatherDialogInput.focus({ preventScroll: true });
      weatherDialogInput.select();
    }, 50);
    return new Promise((resolve) => {
      weatherDialogResolve = resolve;
    });
  }

  function hideWeatherDialog(result) {
    weatherDialogOverlay.style.display = 'none';
    if (weatherDialogResolve) {
      weatherDialogResolve(result);
      weatherDialogResolve = null;
    }
  }

  weatherDialogConfirm.addEventListener('click', (e) => {
    e.stopPropagation();
    hideWeatherDialog(weatherDialogInput.value);
  });
  weatherDialogCancel.addEventListener('click', (e) => {
    e.stopPropagation();
    hideWeatherDialog(null);
  });
  weatherDialogOverlay.addEventListener('click', (e) => {
    if (e.target === weatherDialogOverlay) hideWeatherDialog(null);
  });
  weatherDialogInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') hideWeatherDialog(weatherDialogInput.value);
    if (e.key === 'Escape') hideWeatherDialog(null);
  });

  async function doSetLocation(city) {
    try {
      const geoResp = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city.trim())}&count=1&language=zh&format=json`);
      if (!geoResp.ok) { alert('\u67E5\u8BE2\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u57CE\u5E02\u540D'); return; }
      const geoData = await geoResp.json();
      if (geoData && geoData.results && geoData.results.length > 0) {
        const loc = geoData.results[0];
        weatherCoords = { lat: loc.latitude, lon: loc.longitude };
        weatherCityName = loc.name + (loc.admin1 ? ', ' + loc.admin1 : '') + (loc.country ? ', ' + loc.country : '');
        weatherCurrent = null;
        weatherDaily = null;
        weatherHourly = null;
        weatherTempEl.textContent = '--\u00B0C';
        // 保存到 localStorage，下次打开自动恢复
        try { localStorage.setItem('astroknot_weather', JSON.stringify({ coords: weatherCoords, city: weatherCityName })); } catch {}
        await fetchWeather();
      } else {
        alert('\u672A\u627E\u5230\u8BE5\u57CE\u5E02\uFF0C\u8BF7\u91CD\u65B0\u8F93\u5165');
      }
    } catch {
      alert('\u7F51\u7EDC\u9519\u8BEF\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5');
    }
  }

  // 右键菜单点击处理
  weatherCtxMenu.addEventListener('click', function (e) {
    const item = e.target.closest('.ctx-item');
    if (!item) return;
    e.stopPropagation();
    weatherCtxMenu.style.visibility = 'hidden';

    const action = item.dataset.action;
    if (action === 'set-location') {
      showWeatherDialog(weatherCityName || '').then(city => {
        if (city && city.trim() !== '') doSetLocation(city);
      });
    } else if (action === 'reset-location') {
      weatherCoords = null;
      weatherCityName = '';
      weatherCurrent = null;
      weatherDaily = null;
      weatherHourly = null;
      weatherTempEl.textContent = '--\u00B0C';
      try { localStorage.removeItem('astroknot_weather'); } catch {}
      fetchWeather();
    }
  });

  // 点击其他地方隐藏右键菜单（排除菜单本身）
  document.addEventListener('click', function () {
    weatherCtxMenu.style.visibility = 'hidden';
  });

  if (weatherEl) {
    weatherEl.addEventListener('click', (e) => {
      e.stopPropagation();
      weatherCtxMenu.style.visibility = 'hidden';
      weatherCoords = null;
      weatherCityName = '';
      weatherCurrent = null;
      weatherDaily = null;
      weatherHourly = null;
      weatherTempEl.textContent = '--\u00B0C';
      fetchWeather();
    });

    weatherEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      weatherCtxMenu.style.visibility = 'hidden';
      weatherCtxMenu.style.left = e.clientX + 'px';
      weatherCtxMenu.style.top = e.clientY + 'px';
      weatherCtxMenu.style.visibility = 'visible';
      // 防超出屏幕底部
      const menuRect = weatherCtxMenu.getBoundingClientRect();
      if (menuRect.bottom > window.innerHeight) {
        weatherCtxMenu.style.top = (e.clientY - menuRect.height) + 'px';
      }
    });

    weatherEl.addEventListener('mouseenter', function (e) {
      weatherPopup.innerHTML = buildWeatherPopupContent();
      weatherPopup.style.visibility = 'hidden';
      const refRect = weatherEl.getBoundingClientRect();
      weatherPopup.style.left = (refRect.left + refRect.width / 2 - 90) + 'px';
      weatherPopup.style.top = (refRect.top - weatherPopup.offsetHeight - 8) + 'px';
      weatherPopup.style.visibility = 'visible';
    });

    weatherEl.addEventListener('mouseleave', function () {
      weatherPopup.style.visibility = 'hidden';
    });
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  let weekDays = ['\u5468\u65E5', '\u5468\u4E00', '\u5468\u4E8C', '\u5468\u4E09', '\u5468\u56DB', '\u5468\u4E94', '\u5468\u516D'];

  function tick() {
    let now = new Date();
    let hh = pad(now.getHours());
    let mm = pad(now.getMinutes());
    let wd = weekDays[now.getDay()];
    let y = now.getFullYear();
    let m = now.getMonth() + 1;
    let d = now.getDate();

    const timeEl = document.getElementById('clockTime');
    const dateEl = document.getElementById('clockDate');
    if (timeEl) timeEl.textContent = hh + ':' + mm;
    if (dateEl) dateEl.textContent = wd + ' ' + y + '/' + m + '/' + d;
  }

  tick();
  setInterval(tick, 10000);

  // ==================== 日历弹窗（点击时钟打开） ====================
  function renderTabs() {
    const tabs = [['month', '\u6708'], ['week', '\u5468'], ['day', '\u65E5']];
    let html = '<div style="display:flex;gap:4px;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.08);">';
    tabs.forEach(function (t) {
      const active = calView === t[0];
      const bg = active ? 'background:rgba(0,255,255,0.18);color:#eef;' : 'color:#8ab;';
      html += '<div class="cal-tab" data-tab="' + t[0] + '" style="cursor:pointer;padding:4px 14px;border-radius:6px;font-size:12.5px;font-weight:600;' + bg + '">' + t[1] + '</div>';
    });
    html += '</div>';
    return html;
  }

  function renderMonthView() {
    const year = calViewDate.getFullYear();
    const month = calViewDate.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    const isThisMonth = today.getFullYear() === year && today.getMonth() === month;

    let html = '';
    // 顶部：上一月 / 年月 / 下一月
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">';
    html += '<div class="cal-nav" data-nav="prev" style="cursor:pointer;font-size:16px;color:#8ab;padding:2px 10px;border-radius:4px;line-height:1;">\u2039</div>';
    html += '<div style="font-weight:600;color:#eef;font-size:14px;letter-spacing:0.5px;">' + year + '\u5E74 ' + monthNames[month] + '</div>';
    html += '<div class="cal-nav" data-nav="next" style="cursor:pointer;font-size:16px;color:#8ab;padding:2px 10px;border-radius:4px;line-height:1;">\u203A</div>';
    html += '</div>';

    // 星期表头
    html += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:4px;">';
    weekHeaders.forEach(function (w) {
      html += '<div style="text-align:center;font-size:11px;color:#6a9;padding:3px 0;">' + w + '</div>';
    });
    html += '</div>';

    // 日期网格
    html += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;">';
    for (let i = 0; i < firstWeekday; i++) html += '<div></div>';
    for (let day = 1; day <= daysInMonth; day++) {
      const isToday = isThisMonth && day === today.getDate();
      let lunar = solarToLunar(year, month + 1, day);
      let lunarLabel = (lunar.dayName === '\u521D\u4E00') ? lunar.monthName : lunar.dayName;
      const dateStr = fmtDate(new Date(year, month, day));
      const weekday = new Date(year, month, day).getDay();
      const evCount = getDayEvents(dateStr).length;
      const weeklyCount = schedule.weekly.filter(w => w.weekday === weekday).length;
      const hasSched = evCount > 0 || weeklyCount > 0;
      let bg = isToday
        ? 'background:rgba(0,255,255,0.18);color:#eef;font-weight:600;box-shadow:inset 0 0 0 1px rgba(0,255,255,0.45);'
        : 'color:#b0d8ee;';
      html += '<div class="cal-day" data-day="' + day + '" style="text-align:center;padding:3px 0 2px;border-radius:4px;cursor:pointer;position:relative;' + bg + '">';
      html += '<div style="font-size:12px;line-height:1.2;">' + day + '</div>';
      html += '<div style="font-size:9px;color:#6a9;line-height:1.1;">' + lunarLabel + '</div>';
      if (hasSched) {
        const dots = [];
        if (evCount > 0) dots.push('background:#5ee8ff;');
        if (weeklyCount > 0) dots.push('background:#c9a8ff;');
        html += '<div style="position:absolute;bottom:1px;left:50%;transform:translateX(-50%);display:flex;gap:2px;">';
        dots.forEach(function (d) { html += '<div style="width:3px;height:3px;border-radius:50%;' + d + '"></div>'; });
        html += '</div>';
      }
      html += '</div>';
    }
    html += '</div>';

    // 图例 + 今日农历
    const lunarToday = solarToLunar(today.getFullYear(), today.getMonth() + 1, today.getDate());
    const scToday = getShichen(today.getHours(), today.getMinutes());
    html += '<div style="margin-top:8px;display:flex;gap:12px;font-size:10px;color:#6a9;">';
    html += '<span><span style="display:inline-block;width:5px;height:5px;border-radius:50%;background:#5ee8ff;vertical-align:middle;margin-right:3px;"></span>\u65E5\u7A0B</span>';
    html += '<span><span style="display:inline-block;width:5px;height:5px;border-radius:50%;background:#c9a8ff;vertical-align:middle;margin-right:3px;"></span>\u8BFE\u7A0B</span>';
    html += '</div>';
    html += '<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.08);">';
    html += '<div style="font-weight:600;color:#eef;margin-bottom:3px;">\uD83D\uDCC5 ' + lunarToday.ganZhiYear + '\u5E74 [' + lunarToday.zodiac + '\u5E74]</div>';
    html += '<div style="color:#9cc;">' + lunarToday.monthName + lunarToday.dayName + '</div>';
    html += '<div style="margin-top:2px;color:#6a9;">\u23F3 ' + scToday.name + ' (' + scToday.range + ')</div>';
    html += '</div>';
    return html;
  }

  function renderWeekView() {
    // 获取当前周（基于 calViewDate）
    const base = new Date(calViewDate);
    base.setHours(0, 0, 0, 0);
    const dow = base.getDay();
    const weekStart = new Date(base);
    weekStart.setDate(base.getDate() - dow);
    const weekDates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      weekDates.push(d);
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let html = '';
    // 周导航
    const weekEnd = weekDates[6];
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">';
    html += '<div class="cal-nav" data-nav="prev-week" style="cursor:pointer;font-size:16px;color:#8ab;padding:2px 10px;border-radius:4px;line-height:1;">\u2039</div>';
    const titleStr = (weekDates[0].getMonth() + 1) + '/' + weekDates[0].getDate() + ' - ' + (weekEnd.getMonth() + 1) + '/' + weekEnd.getDate();
    html += '<div style="font-weight:600;color:#eef;font-size:13px;letter-spacing:0.3px;">' + titleStr + '</div>';
    html += '<div class="cal-nav" data-nav="next-week" style="cursor:pointer;font-size:16px;color:#8ab;padding:2px 10px;border-radius:4px;line-height:1;">\u203A</div>';
    html += '</div>';

    // 课程表网格：第一列时段，7列星期
    const slots = schedule.slots;
    html += '<div style="display:grid;grid-template-columns:62px repeat(7, 1fr);gap:2px;font-size:11px;">';
    // 表头行
    html += '<div style="padding:4px 2px;color:#6a9;text-align:center;font-size:10px;">\u65F6\u95F4</div>';
    weekDates.forEach(function (d, i) {
      const isToday = d.getTime() === today.getTime();
      const bg = isToday ? 'background:rgba(0,255,255,0.12);color:#eef;font-weight:600;' : 'color:#8ab;';
      html += '<div style="padding:4px 0;text-align:center;' + bg + 'border-radius:4px;">';
      html += '<div style="font-size:10px;">' + weekDayNames[i].slice(1) + '</div>';
      html += '<div style="font-size:10px;color:#6a9;">' + (d.getMonth() + 1) + '/' + d.getDate() + '</div>';
      html += '</div>';
    });

    // 各时段行
    slots.forEach(function (slot, sIdx) {
      html += '<div style="padding:4px 2px;color:#6a9;text-align:center;font-size:10px;line-height:1.3;">' + slot + '</div>';
      for (let w = 0; w < 7; w++) {
        const cell = getWeeklyCell(w, sIdx);
        const todayDate = weekDates[w];
        const isToday = todayDate.getTime() === today.getTime();
        let bg = cell ? 'background:rgba(201,168,255,0.16);' : (isToday ? 'background:rgba(0,255,255,0.05);' : '');
        html += '<div class="cal-cell" data-weekday="' + w + '" data-slot="' + sIdx + '" style="padding:4px 3px;border-radius:4px;cursor:pointer;min-height:34px;' + bg + 'border:1px solid rgba(255,255,255,0.04);">';
        if (cell) {
          html += '<div style="color:#eef;font-size:11px;font-weight:500;line-height:1.2;">' + escapeHtml(cell.title) + '</div>';
          if (cell.note) html += '<div style="color:#9aa;font-size:9px;margin-top:1px;line-height:1.1;">' + escapeHtml(cell.note) + '</div>';
        }
        html += '</div>';
      }
    });
    html += '</div>';

    html += '<div style="margin-top:8px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.06);font-size:10px;color:#6a9;">';
    html += '\u8BFE\u7A0B\u8868\u4E3A\u5468\u671F\u91CD\u590D\u6A21\u677F\uFF0C\u70B9\u51FB\u5355\u5143\u683C\u7F16\u8F91 / \u6E05\u7A7A';
    html += '</div>';
    return html;
  }

  function renderDayView() {
    const dateStr = fmtDate(calSelectedDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selDay = new Date(calSelectedDate);
    selDay.setHours(0, 0, 0, 0);
    const isToday = selDay.getTime() === today.getTime();
    const dow = calSelectedDate.getDay();
    const events = getDayEvents(dateStr);
    const weeklyToday = schedule.weekly.filter(w => w.weekday === dow).sort((a, b) => a.slot - b.slot);

    let html = '';
    // 日期导航
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">';
    html += '<div class="cal-nav" data-nav="prev-day" style="cursor:pointer;font-size:16px;color:#8ab;padding:2px 10px;border-radius:4px;line-height:1;">\u2039</div>';
    const titleStr = calSelectedDate.getFullYear() + '/' + (calSelectedDate.getMonth() + 1) + '/' + calSelectedDate.getDate() + ' ' + weekDayNames[dow];
    html += '<div style="font-weight:600;color:#eef;font-size:13px;">' + titleStr + (isToday ? ' (\u4ECA\u65E5)' : '') + '</div>';
    html += '<div class="cal-nav" data-nav="next-day" style="cursor:pointer;font-size:16px;color:#8ab;padding:2px 10px;border-radius:4px;line-height:1;">\u203A</div>';
    html += '</div>';

    // 当日农历
    const lunar = solarToLunar(calSelectedDate.getFullYear(), calSelectedDate.getMonth() + 1, calSelectedDate.getDate());
    html += '<div style="margin-bottom:8px;padding:5px 8px;background:rgba(0,255,255,0.05);border-radius:6px;font-size:11px;color:#9cc;">';
    html += '\uD83D\uDCC4 ' + lunar.ganZhiYear + '\u5E74 ' + lunar.monthName + lunar.dayName + ' (' + lunar.zodiac + '\u5E74)';
    html += '</div>';

    // 日程列表
    if (events.length === 0) {
      html += '<div style="text-align:center;color:#5a7;padding:16px 0;font-size:11px;">\u672C\u65E5\u65E0\u65E5\u7A0B</div>';
    } else {
      events.forEach(function (ev) {
        html += '<div class="cal-event" data-id="' + ev.id + '" style="display:flex;align-items:flex-start;gap:6px;padding:6px 8px;margin-bottom:4px;border-radius:6px;background:rgba(0,255,255,0.06);">';
        html += '<div style="width:4px;align-self:stretch;background:#5ee8ff;border-radius:2px;flex-shrink:0;"></div>';
        html += '<div style="flex:1;min-width:0;">';
        html += '<div style="color:#eef;font-size:12px;font-weight:500;">' + escapeHtml(ev.title) + '</div>';
        html += '<div style="color:#8ab;font-size:10px;margin-top:1px;">' + (ev.time || '\u5168\u5929') + (ev.note ? ' \u00B7 ' + escapeHtml(ev.note) : '') + '</div>';
        html += '</div>';
        html += '<div class="cal-del" data-id="' + ev.id + '" style="cursor:pointer;color:#6a9;padding:0 4px;font-size:11px;">\u2715</div>';
        html += '</div>';
      });
    }

    // 课程（周期重复）
    if (weeklyToday.length > 0) {
      html += '<div style="margin-top:6px;font-size:10px;color:#c9a8ff;font-weight:500;">\u5468\u671F\u8BFE\u7A0B</div>';
      weeklyToday.forEach(function (w) {
        html += '<div class="cal-event" style="display:flex;align-items:flex-start;gap:6px;padding:6px 8px;margin-top:4px;border-radius:6px;background:rgba(201,168,255,0.08);">';
        html += '<div style="width:4px;align-self:stretch;background:#c9a8ff;border-radius:2px;flex-shrink:0;"></div>';
        html += '<div style="flex:1;min-width:0;">';
        html += '<div style="color:#eef;font-size:12px;font-weight:500;">' + escapeHtml(w.title) + '</div>';
        html += '<div style="color:#8ab;font-size:10px;margin-top:1px;">' + (schedule.slots[w.slot] || '') + (w.note ? ' \u00B7 ' + escapeHtml(w.note) : '') + '</div>';
        html += '</div>';
        html += '<div class="cal-weekly-del" data-weekday="' + w.weekday + '" data-slot="' + w.slot + '" style="cursor:pointer;color:#6a9;padding:0 4px;font-size:11px;">\u2715</div>';
        html += '</div>';
      });
    }

    // 添加按钮
    html += '<div class="cal-add" data-date="' + dateStr + '" style="margin-top:8px;text-align:center;padding:6px;border:1px dashed rgba(0,255,255,0.25);border-radius:6px;cursor:pointer;color:#5ee8ff;font-size:12px;">+ \u6DFB\u52A0\u65E5\u7A0B</div>';
    return html;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function renderCalendar() {
    let html = renderTabs();
    if (calView === 'month') html += renderMonthView();
    else if (calView === 'week') html += renderWeekView();
    else html += renderDayView();
    return html;
  }

  function positionCalendar() {
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

  function refreshPopup() {
    calPopup.innerHTML = renderCalendar();
    positionCalendar();
  }

  function showCalendar() {
    calViewDate = new Date();
    calSelectedDate = new Date();
    calView = 'month';
    refreshPopup();
    calVisible = true;
  }

  function hideCalendar() {
    calPopup.style.display = 'none';
    calVisible = false;
  }

  el.addEventListener('click', function (e) {
    e.stopPropagation();
    if (calVisible) { hideCalendar(); return; }
    showCalendar();
  });

  // 弹窗内事件委托
  calPopup.addEventListener('click', function (e) {
    // Tab 切换
    const tab = e.target.closest('.cal-tab');
    if (tab) {
      e.stopPropagation();
      calView = tab.dataset.tab;
      refreshPopup();
      return;
    }
    // 导航
    const nav = e.target.closest('.cal-nav');
    if (nav) {
      e.stopPropagation();
      const act = nav.dataset.nav;
      if (act === 'prev') calViewDate.setMonth(calViewDate.getMonth() - 1);
      else if (act === 'next') calViewDate.setMonth(calViewDate.getMonth() + 1);
      else if (act === 'prev-week') calViewDate.setDate(calViewDate.getDate() - 7);
      else if (act === 'next-week') calViewDate.setDate(calViewDate.getDate() + 7);
      else if (act === 'prev-day') calSelectedDate.setDate(calSelectedDate.getDate() - 1);
      else if (act === 'next-day') calSelectedDate.setDate(calSelectedDate.getDate() + 1);
      refreshPopup();
      return;
    }
    // 日期格点击 → 切到日视图
    const dayCell = e.target.closest('.cal-day');
    if (dayCell && calView === 'month') {
      e.stopPropagation();
      const day = parseInt(dayCell.dataset.day, 10);
      calSelectedDate = new Date(calViewDate.getFullYear(), calViewDate.getMonth(), day);
      calView = 'day';
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
    // 删除日程
    const delBtn = e.target.closest('.cal-del');
    if (delBtn) {
      e.stopPropagation();
      const id = delBtn.dataset.id;
      schedule.events = schedule.events.filter(ev => ev.id !== id);
      saveSchedule();
      refreshPopup();
      return;
    }
    // 删除周期课程
    const wDelBtn = e.target.closest('.cal-weekly-del');
    if (wDelBtn) {
      e.stopPropagation();
      const wd = parseInt(wDelBtn.dataset.weekday, 10);
      const sl = parseInt(wDelBtn.dataset.slot, 10);
      schedule.weekly = schedule.weekly.filter(w => !(w.weekday === wd && w.slot === sl));
      saveSchedule();
      refreshPopup();
      return;
    }
    // 课程表单元格点击 → 编辑
    const cell = e.target.closest('.cal-cell');
    if (cell && calView === 'week') {
      e.stopPropagation();
      const weekday = parseInt(cell.dataset.weekday, 10);
      const slot = parseInt(cell.dataset.slot, 10);
      openWeeklyForm(weekday, slot);
      return;
    }
  });

  // 点击外部关闭
  document.addEventListener('click', function (e) {
    if (!calVisible) return;
    if (calPopup.contains(e.target) || el.contains(e.target)) return;
    if (eventFormOverlay && eventFormOverlay.style.display === 'flex') return;
    hideCalendar();
  });

  // Esc 关闭
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (eventFormOverlay && eventFormOverlay.style.display === 'flex') { hideEventForm(); return; }
      if (calVisible) hideCalendar();
    }
  });

  // 窗口大小变化时重新定位
  window.addEventListener('resize', function () {
    if (calVisible) positionCalendar();
  });

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
      <div style="display:flex;flex-direction:column;gap:10px;min-width:260px;">
        <div id="schedTimeWrap" style="display:none;">
          <div style="font-size:11px;color:#8ab;margin-bottom:4px;">\u65F6\u95F4</div>
          <input id="schedTimeInput" type="text" placeholder="14:00" style="width:100%;box-sizing:border-box;padding:7px 10px;background:rgba(0,0,0,0.4);border:1px solid rgba(0,255,255,0.2);border-radius:6px;color:#eef;font-size:13px;outline:none;" />
        </div>
        <div>
          <div style="font-size:11px;color:#8ab;margin-bottom:4px;">\u6807\u9898</div>
          <input id="schedTitleInput" type="text" placeholder="\u4F8B\u5982\uFF1A\u5F00\u4F1A / \u9AD8\u6570" style="width:100%;box-sizing:border-box;padding:7px 10px;background:rgba(0,0,0,0.4);border:1px solid rgba(0,255,255,0.2);border-radius:6px;color:#eef;font-size:13px;outline:none;" />
        </div>
        <div>
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
  const schedTime = eventFormOverlay.querySelector('#schedTimeInput');
  const schedNote = eventFormOverlay.querySelector('#schedNoteInput');
  const schedTimeWrap = eventFormOverlay.querySelector('#schedTimeWrap');
  const schedFormTitle = eventFormOverlay.querySelector('#schedFormTitle');
  const schedFormClear = eventFormOverlay.querySelector('#schedFormClear');
  const schedFormConfirm = eventFormOverlay.querySelector('#schedFormConfirm');
  const schedFormCancel = eventFormOverlay.querySelector('#schedFormCancel');

  let formMode = null; // 'event' | 'weekly'
  let formCtx = null;  // {date} | {weekday, slot}

  function openEventForm(ctx) {
    formMode = 'event';
    formCtx = ctx;
    schedFormTitle.textContent = '\uD83D\uDDD2\uFE0F \u6DFB\u52A0\u65E5\u7A0B';
    schedTimeWrap.style.display = '';
    schedTime.placeholder = '14:00';
    schedTitle.value = '';
    schedTime.value = '';
    schedNote.value = '';
    schedFormClear.style.display = 'none';
    showForm();
  }

  function openWeeklyForm(weekday, slot) {
    formMode = 'weekly';
    formCtx = { weekday, slot };
    const existing = getWeeklyCell(weekday, slot);
    schedFormTitle.textContent = '\uD83D\uDCDA \u8BFE\u7A0B\uFF08' + weekDayNames[weekday] + ' \u00B7 \u7B2C' + (slot + 1) + '\u8282\uFF09';
    schedTimeWrap.style.display = 'none';
    schedTitle.value = existing ? existing.title : '';
    schedNote.value = existing ? existing.note : '';
    schedFormClear.style.display = existing ? '' : 'none';
    showForm();
  }

  function showForm() {
    eventFormOverlay.style.display = 'flex';
    setTimeout(function () { schedTitle.focus(); }, 50);
  }

  function hideEventForm() {
    eventFormOverlay.style.display = 'none';
    formMode = null;
    formCtx = null;
  }

  schedFormConfirm.addEventListener('click', function (e) {
    e.stopPropagation();
    const title = schedTitle.value.trim();
    if (!title) { schedTitle.focus(); return; }
    if (formMode === 'event') {
      schedule.events.push({
        id: uid(),
        date: formCtx.date,
        time: schedTime.value.trim(),
        title: title,
        note: schedNote.value.trim()
      });
    } else if (formMode === 'weekly') {
      schedule.weekly = schedule.weekly.filter(w => !(w.weekday === formCtx.weekday && w.slot === formCtx.slot));
      schedule.weekly.push({
        id: uid(),
        weekday: formCtx.weekday,
        slot: formCtx.slot,
        title: title,
        note: schedNote.value.trim()
      });
    }
    saveSchedule();
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
      schedule.weekly = schedule.weekly.filter(w => !(w.weekday === formCtx.weekday && w.slot === formCtx.slot));
      saveSchedule();
      hideEventForm();
      refreshPopup();
    }
  });
  [schedTitle, schedTime, schedNote].forEach(function (inp) {
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); schedFormConfirm.click(); }
      if (e.key === 'Escape') hideEventForm();
    });
    inp.addEventListener('click', function (e) { e.stopPropagation(); });
  });
}