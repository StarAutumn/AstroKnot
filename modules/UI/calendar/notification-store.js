// ============================================================
//  calendar / notification-store.js — 提醒通知模块
// ============================================================
// 通知规则：
//   上班（规律/倒班，非休息，且已设置上班时间）：提前 N 小时 M 分钟（班表设置） + 到点
//   上课（周课表）：提前 N 分钟（课程设置） + 到点
//   事项（schedule events）：
//     无日期无时间 → 不通知
//     有日期无时间 → 当天启动时通知（闪屏后1-2s）
//     无日期有时间 → 每天提前N分钟（事项设置） + 到点通知
//     有日期有时间 → 当天启动通知 + 提前N分钟 + 到点通知
//   倒计时（anniversary type=countdown）：提前 N 天（设置） + 当天
//   纪念日/生日/节日（anniversary）：暂不支持定时通知
// 仅在应用运行时触发；已发送的通知按 当日+类型+ID+种类 去重。
// 倒班班次需通过右键菜单设置上班时间后才会提醒。

import { state } from './shared-state.js';
import { appState } from '../../module0_AppState.js';
import { getDayShifts, getShiftSchedule } from './shift-store.js';
import { getShiftTypeById } from './shift-types-store.js';
import {
  getSchedule, getDayEvents, getMondayOf,
  getWeekNumber, isWeeklyActiveAtWeek, parseSlotRange, fmtDate
} from './schedule-store.js';
import { getItems, computeDisplay } from './anniversary-store.js';

// ==================== 事项通知 ====================
// 事项通知规则：
//   无日期无时间（长期事项） → 不通知
//   有日期无时间 → 当天启动时通知（闪屏后1-2s）
//   无日期有时间 → 每天提前10分钟 + 到点通知
//   有日期有时间 → 当天启动通知 + 提前10分钟 + 到点通知

const SENT_KEY = 'astroknot_notified';
const CHECK_INTERVAL = 30000;  // 30 秒轮询
const WINDOW_MS = 120000;      // 触发时间窗（2 分钟）容错

function loadSent() {
  try { return JSON.parse(localStorage.getItem(SENT_KEY) || '{}'); }
  catch { return {}; }
}

function saveSent(obj) {
  try { localStorage.setItem(SENT_KEY, JSON.stringify(obj)); } catch {}
}

function markSent(key, sent) {
  sent[key] = Date.now();
  const cutoff = Date.now() - 3 * 86400000;
  for (const k in sent) {
    if (sent[k] < cutoff) delete sent[k];
  }
  saveSent(sent);
}

// ==================== 通知历史（通知中心） ====================
const HISTORY_KEY = 'astroknot_notif_history';
const MAX_HISTORY = 50;

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }
  catch { return []; }
}

function saveHistory(arr) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(arr)); } catch {}
}

function recordHistory(title, body, type) {
  const arr = loadHistory();
  arr.unshift({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title: title || '',
    body: body || '',
    type: type || '',
    ts: Date.now()
  });
  if (arr.length > MAX_HISTORY) arr.length = MAX_HISTORY;
  saveHistory(arr);
}

export function getNotificationHistory() { return loadHistory(); }
export function clearNotificationHistory() { saveHistory([]); }
export function removeNotificationItem(id) {
  saveHistory(loadHistory().filter(function (h) { return h.id !== id; }));
}

// ==================== Win11 风格通知卡片 UI ====================
const DISMISS_MS = 5000; // 自动消失时间（毫秒）
const MAX_NOTIFS = 4;    // 同时显示的最大通知数

let notifStylesInjected = false;
let notifContainer = null;

function ensureNotifStyles() {
  if (notifStylesInjected) return;
  notifStylesInjected = true;
  const style = document.createElement('style');
  style.id = 'astroknot-notif-style';
  style.textContent = `
@keyframes astroknotNotifIn {
  from { transform: translateX(120%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
@keyframes astroknotNotifOut {
  from { transform: translateX(0); opacity: 1; max-height: 200px; margin-top: 0; }
  to { transform: translateX(120%); opacity: 0; max-height: 0; margin-top: -8px; }
}
.astroknot-notif-container {
  position: fixed;
  right: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 9999999;
  width: 360px;
  max-width: calc(100vw - 24px);
  pointer-events: none;
  font-family: "Segoe UI Variable", "Segoe UI", system-ui, -apple-system, sans-serif;
}
.astroknot-notif-card {
  pointer-events: auto;
  background: var(--panel-bg, rgba(14, 24, 34, 0.94));
  backdrop-filter: blur(16px) saturate(140%);
  -webkit-backdrop-filter: blur(16px) saturate(140%);
  border: 1px solid rgba(0, 255, 255, 0.25);
  border-radius: 10px;
  padding: 12px 14px 10px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(0, 255, 255, 0.08) inset, 0 0 14px rgba(0, 255, 255, 0.1);
  color: #eef;
  animation: astroknotNotifIn 0.32s cubic-bezier(0.2, 0.9, 0.3, 1);
  position: relative;
  overflow: hidden;
}
.astroknot-notif-card.out { animation: astroknotNotifOut 0.28s ease-in forwards; }
.astroknot-notif-head {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 6px;
}
.astroknot-notif-icon { width: 16px; height: 16px; flex: 0 0 16px; filter: drop-shadow(0 0 4px rgba(0,255,255,0.4)); }
.astroknot-notif-app { font-size: 12px; color: #5ee8ff; font-weight: 400; letter-spacing: 0.3px; }
.astroknot-notif-close {
  margin-left: auto;
  width: 22px; height: 22px;
  border: none; background: transparent;
  color: rgba(170, 187, 204, 0.7); cursor: pointer;
  border-radius: 4px;
  display: flex; align-items: center; justify-content: center;
  font-size: 15px; line-height: 1; padding: 0;
  transition: background 0.15s, color 0.15s;
}
.astroknot-notif-close:hover { background: rgba(0, 255, 255, 0.12); color: #fff; }
.astroknot-notif-title { font-size: 13px; font-weight: 600; color: #eef; margin-bottom: 2px; }
.astroknot-notif-body { font-size: 12px; color: #b0d8ee; line-height: 1.4; }
`;
  document.head.appendChild(style);
}

// 读取任务栏高度，把通知容器定位在任务栏正上方
function positionContainerAboveTaskbar() {
  if (!notifContainer) return;
  const tb = document.getElementById('taskbar');
  const tbH = tb ? tb.offsetHeight : 0;
  notifContainer.style.bottom = (tbH + 8) + 'px';
}

function ensureNotifContainer() {
  if (!notifContainer || !document.body.contains(notifContainer)) {
    notifContainer = document.createElement('div');
    notifContainer.className = 'astroknot-notif-container';
    document.body.appendChild(notifContainer);
  }
  // 每次定位，确保任务栏高度变化时仍贴在其上方
  positionContainerAboveTaskbar();
  return notifContainer;
}

function dismissNotif(card) {
  if (!card || card.classList.contains('out')) return;
  card.classList.add('out');
  card.addEventListener('animationend', function handler(e) {
    if (e.animationName !== 'astroknotNotifOut') return;
    card.removeEventListener('animationend', handler);
    if (card.parentNode) card.parentNode.removeChild(card);
  });
}

// ==================== 提示音效（Web Audio 合成，按类型区分） ====================
let audioCtx = null;

function ensureAudioCtx() {
  if (!audioCtx) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = AC ? new AC() : null;
    } catch { audioCtx = null; }
  }
  return audioCtx;
}

// 单音：正弦波 + ADSR 包络，避免爆音
function playTone(ctx, freq, startAt, duration, peak) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, startAt);
  osc.connect(gain);
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(peak, startAt + 0.006);    // attack 6ms
  gain.gain.setValueAtTime(peak, startAt + duration - 0.04);   // sustain
  gain.gain.linearRampToValueAtTime(0, startAt + duration);    // release 40ms
  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
}

// 按通知类型播放不同音效
function playSound(type) {
  try {
    const ctx = ensureAudioCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      // 尚未通过用户交互恢复，异步尝试恢复，本次不响（避免抢跑）
      ctx.resume().catch(function () {});
      return;
    }
    const t = ctx.currentTime;
    const peak = 0.16;
    if (type === 'work') {
      // 上班：两声上扬 C5→E5，明快
      playTone(ctx, 523.25, t, 0.13, peak);
      playTone(ctx, 659.25, t + 0.16, 0.14, peak);
    } else if (type === 'class') {
      // 上课：单声柔和 C5
      playTone(ctx, 523.25, t, 0.22, peak * 0.9);
    } else if (type === 'countdown') {
      // 倒计时：两声下行 E5→C5，带紧迫感
      playTone(ctx, 659.25, t, 0.15, peak);
      playTone(ctx, 523.25, t + 0.18, 0.20, peak);
    } else {
      // 默认：单声
      playTone(ctx, 523.25, t, 0.18, peak * 0.9);
    }
  } catch {}
}

function notify(title, body, type) {
  try {
    // 无论通知是否启用，都记录到通知历史
    recordHistory(title, body, type);

    // 检查通知是否启用
    const enabled = appState.notificationEnabled !== false;
    if (!enabled) {
      // 通知关闭：不显示弹窗、不播放音效，但历史记录已保存
      return;
    }

    ensureNotifStyles();

    // 检查是否静音
    const muted = appState.notificationMuted === true;
    if (!muted) {
      playSound(type);
    }

    const container = ensureNotifContainer();

    // 超过最大数量时移除最旧的
    while (container.children.length >= MAX_NOTIFS) {
      container.removeChild(container.firstChild);
    }

    const card = document.createElement('div');
    card.className = 'astroknot-notif-card';
    card.innerHTML =
      '<div class="astroknot-notif-head">'
      + '<svg class="astroknot-notif-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">'
      + '<path d="M12 2l2.9 6.9L22 9.8l-5.4 5.2L18 22l-6-3.4L6 22l1.4-7L2 9.8l7.1-.9L12 2z" fill="#5ee8ff"/>'
      + '</svg>'
      + '<span class="astroknot-notif-app">AstroKnot</span>'
      + '<button class="astroknot-notif-close" aria-label="关闭">&times;</button>'
      + '</div>'
      + '<div class="astroknot-notif-title"></div>'
      + '<div class="astroknot-notif-body"></div>';

    // 用 textContent 防注入
    card.querySelector('.astroknot-notif-title').textContent = title || '';
    card.querySelector('.astroknot-notif-body').textContent = body || '';

    container.appendChild(card);

    // 关闭按钮
    card.querySelector('.astroknot-notif-close').addEventListener('click', function () {
      dismissNotif(card);
    });

    // 自动消失（悬停时暂停计时）
    let timer = setTimeout(function () { dismissNotif(card); }, DISMISS_MS);
    card.addEventListener('mouseenter', function () { clearTimeout(timer); });
    card.addEventListener('mouseleave', function () {
      timer = setTimeout(function () { dismissNotif(card); }, DISMISS_MS);
    });
  } catch {}
}

function todayStr() { return fmtDate(new Date()); }

// 通用时间点通知：在 [target, target+WINDOW] 窗口内触发一次
function fireTimed(now, target, sent, key, title, body, type) {
  if (now >= target && now.getTime() - target.getTime() < WINDOW_MS && !sent[key]) {
    notify(title, body, type);
    markSent(key, sent);
  }
}

// —— 上班通知 ——
function checkWork(now, sent) {
  if (!state.activeShiftId) return;
  const ds = todayStr();

  // 获取班表的提前提醒时间设置
  const schedule = getShiftSchedule(state.activeShiftId);
  const reminderHour = schedule && schedule.reminderHour != null ? schedule.reminderHour : 1;
  const reminderMinute = schedule && schedule.reminderMinute != null ? schedule.reminderMinute : 0;
  const reminderMs = (reminderHour * 60 + reminderMinute) * 60 * 1000;
  // 生成提醒文本
  const reminderText = reminderHour > 0
    ? (reminderMinute > 0 ? reminderHour + ' 小时 ' + reminderMinute + ' 分钟' : reminderHour + ' 小时')
    : (reminderMinute > 0 ? reminderMinute + ' 分钟' : '即将');

  const shifts = getDayShifts(ds, state.activeShiftId);
  shifts.forEach(function (sh) {
    if (!sh.isWork) return; // 休息班次不提醒

    let hour, minute;
    if (sh.workHour != null) {
      // 规律班表自带上班时间
      hour = sh.workHour;
      minute = sh.workMinute || 0;
    } else {
      // 倒班子类型：从班次类型取上班时间
      const t = getShiftTypeById(sh.shiftType);
      if (!t || t.workHour == null) return; // 未设置上班时间，跳过
      hour = t.workHour;
      minute = t.workMinute || 0;
    }

    const start = new Date(now);
    start.setHours(hour, minute, 0, 0);
    const label = sh.shiftLabel || '上班';
    const base = 'work:' + ds + ':' + (sh.shiftType || 'work');

    fireTimed(now, new Date(start.getTime() - reminderMs), sent, base + ':pre',
      '上班提醒', reminderText + '后开始上班：' + label, 'work');
    fireTimed(now, start, sent, base + ':atStart',
      '上班时间到', label + ' 开始', 'work');
  });
}

// —— 上课通知 ——
// 仅处理周课表，当日事项由 checkItems 处理
function checkClass(now, sent) {
  const ds = todayStr();
  const today0 = new Date(now);
  today0.setHours(0, 0, 0, 0);
  const weekday = today0.getDay();
  const weekNum = getWeekNumber(getMondayOf(today0));
  const schedule = getSchedule();

  const starts = []; // { start: Date, title, reminder }

  // 周课表
  schedule.weekly.forEach(function (w) {
    if (w.weekday !== weekday) return;
    if (!isWeeklyActiveAtWeek(w, weekNum)) return;
    const r = parseSlotRange(schedule.slots[w.slot]);
    if (!r) return;
    const d = new Date(today0);
    // r.start 是从午夜 0 点起的总分钟数（如 08:00 → 480），拆成时分更明确
    d.setHours(Math.floor(r.start / 60), r.start % 60, 0, 0);
    starts.push({ start: d, title: w.title || '课程', reminder: w.reminder || 10 });
  });

  starts.forEach(function (c) {
    const reminderMs = (c.reminder || 10) * 60 * 1000;
    const reminderText = (c.reminder || 10) + ' 分钟';
    const base = 'class:' + ds + ':' + c.title + ':' + c.start.getTime();
    fireTimed(now, new Date(c.start.getTime() - reminderMs), sent, base + ':pre',
      '上课提醒', reminderText + '后开始上课：' + c.title, 'class');
    fireTimed(now, c.start, sent, base + ':atStart',
      '上课时间到', c.title + ' 开始', 'class');
  });
}

// —— 倒计时通知 ——
function checkCountdown(now, sent) {
  const ds = todayStr();
  const today0 = new Date(now);
  today0.setHours(0, 0, 0, 0);
  getItems().forEach(function (it) {
    if (it.type !== 'countdown') return;
    const disp = computeDisplay(it, today0);
    if (disp.daysLeft == null) return;

    const reminderDays = it.reminderDays != null ? it.reminderDays : 2;

    if (disp.daysLeft === reminderDays) {
      const k = 'countdown:' + ds + ':' + it.id + ':pre' + reminderDays + 'd';
      if (!sent[k]) {
        notify('倒计时提醒', '【' + it.title + '】还有 ' + reminderDays + ' 天', 'countdown');
        markSent(k, sent);
      }
    }
    if (disp.isToday) {
      const k = 'countdown:' + ds + ':' + it.id + ':today';
      if (!sent[k]) {
        notify('倒计时到啦', '【' + it.title + '】就是今天', 'countdown');
        markSent(k, sent);
      }
    }
  });
}

// —— 事项通知（定时） ——
// 仅处理有时间的事项：提前N分钟 + 到点
function checkItems(now, sent) {
  const ds = todayStr();
  const today0 = new Date(now);
  today0.setHours(0, 0, 0, 0);
  const sched = getSchedule();

  sched.events.forEach(function (ev) {
    // 必须有时间才走定时通知
    if (!ev.time) return;

    const m = ev.time.match(/^(\d{1,2}):(\d{2})/);
    if (!m) return;
    const hour = +m[1];
    const minute = +m[2];

    // 判断是否当天需要通知
    let isToday = false;
    if (ev.date) {
      // 有日期：仅该日期通知
      isToday = ev.date === ds;
    } else {
      // 无日期有时间：每天通知（长期事项）
      isToday = true;
    }

    if (!isToday) return;

    const reminder = ev.reminder || 10; // 提前提醒时间（分钟）
    const reminderMs = reminder * 60 * 1000;
    const reminderText = reminder + ' 分钟';

    const start = new Date(today0);
    start.setHours(hour, minute, 0, 0);
    const base = 'item:' + ds + ':' + ev.id + ':' + ev.time;

    fireTimed(now, new Date(start.getTime() - reminderMs), sent, base + ':pre',
      '事项提醒', reminderText + '后：' + (ev.title || '事项'), 'item');
    fireTimed(now, start, sent, base + ':atTime',
      '事项时间到', (ev.title || '事项') + ' 开始', 'item');
  });
}

// —— 事项通知（启动时） ——
// 处理当天事项在软件启动后通知
// 规则：
//   有日期无时间 → 当天启动时通知一次
//   有日期有时间 → 当天启动时通知一次（额外还有定时通知）
export function checkStartupItems() {
  try {
    const ds = todayStr();
    const sent = loadSent();
    const sched = getSchedule();

    sched.events.forEach(function (ev) {
      // 必须有日期才走启动通知
      if (!ev.date) return;
      // 仅处理当天事项
      if (ev.date !== ds) return;

      // 有日期的事项：启动时通知一次
      const base = 'item:' + ds + ':' + ev.id + ':startup';
      if (!sent[base]) {
        const hasTime = ev.time && ev.time.match(/^\d{1,2}:\d{2}/);
        const body = hasTime
          ? (ev.title || '事项') + ' · ' + ev.time
          : (ev.title || '事项') + ' · 今天';
        notify('事项提醒', body, 'item');
        markSent(base, sent);
      }
    });
  } catch {}
}

function checkAll() {
  try {
    const now = new Date();
    const sent = loadSent();
    checkWork(now, sent);
    checkClass(now, sent);
    checkCountdown(now, sent);
    checkItems(now, sent);
  } catch {}
}

export function initNotifications() {
  ensureNotifStyles();
  checkAll();
  setInterval(checkAll, CHECK_INTERVAL);
  // 浏览器自动播放策略：首次用户交互后恢复 AudioContext
  const resumeAudio = function () {
    const ctx = ensureAudioCtx();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(function () {});
    window.removeEventListener('pointerdown', resumeAudio);
    window.removeEventListener('keydown', resumeAudio);
  };
  window.addEventListener('pointerdown', resumeAudio);
  window.addEventListener('keydown', resumeAudio);
  // 预览入口（调试用）：控制台调用 window.__astroknotTestNotify('标题', '正文', 'work')
  window.__astroknotTestNotify = notify;

  // 事项启动通知：闪屏动画后 1-2 秒执行
  setTimeout(checkStartupItems, 1500);
}
