// ============================================================
//  calendar / weather.js — 天气组件
// ============================================================

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

export function initWeather() {
  fetchWeather();
  setInterval(fetchWeather, 30 * 60 * 1000);
}
