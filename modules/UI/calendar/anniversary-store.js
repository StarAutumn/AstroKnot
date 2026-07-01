// ============================================================
//  calendar / anniversary-store.js — 纪念日/倒计时/生日/节日 数据层
// ============================================================
// 数据结构：
//   { id, type, title, dateType, year, month, day, isLeap, note }
//   type: 'countdown'(一次性倒计时) | 'anniversary'(纪念日,每年) |
//         'birthday'(生日,每年) | 'festival'(节日,每年)
//   dateType: 'solar' | 'lunar'（对于 birthday：表示庆祝方式，而非出生日期历法）
//   year: 0 表示每年重复（无固定年份）；对于 birthday 表示出生年份（可能未知）
//   isLeap: 仅当 dateType='lunar' 且 type='birthday' 时有效，表示农历闰月
//   注意：出生日期始终为公历（事实），但生日可按公历或农历方式庆祝
const KEY = 'astroknot_anniversary';

let items = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (Array.isArray(d.items)) return d.items;
    }
  } catch {}
  return [];
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify({ items })); } catch {}
}

export function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
export function getItems() { return items; }

export function addItem(item) {
  item.id = uid();
  items.push(item);
  save();
  return item;
}

export function updateItem(id, patch) {
  const idx = items.findIndex(it => it.id === id);
  if (idx >= 0) {
    items[idx] = Object.assign({}, items[idx], patch, { id });
    save();
  }
}

export function removeItem(id) {
  items = items.filter(it => it.id !== id);
  save();
}

export function clearAllAnniversary() {
  items = [];
  save();
}

export function getAnniversaryStats() {
  return {
    countdown: items.filter(i => i.type === 'countdown').length,
    anniversary: items.filter(i => i.type === 'anniversary').length,
    birthday: items.filter(i => i.type === 'birthday').length,
    festival: items.filter(i => i.type === 'festival').length,
    total: items.length
  };
}

// 农历转公历 Date
function lunarToSolarDate(year, month, day, isLeap) {
  const Lunar = window.Lunar;
  if (!Lunar) return null;
  try {
    const lunar = Lunar.fromYmd(year, month, day, isLeap ? 1 : 0);
    const solar = lunar.getSolar();
    return new Date(solar.getYear(), solar.getMonth() - 1, solar.getDay());
  } catch {
    return null;
  }
}

function solarToDate(year, month, day) {
  return new Date(year, month - 1, day);
}

// 公历转农历（返回月、日、是否闰月）
function solarToLunarInfo(year, month, day) {
  const Solar = window.Solar;
  if (!Solar) return null;
  try {
    const solar = Solar.fromYmd(year, month, day);
    const lunar = solar.getLunar();
    const lm = lunar.getMonth(); // 负数表示闰月
    return {
      month: Math.abs(lm),
      day: lunar.getDay(),
      isLeap: lm < 0
    };
  } catch {
    return null;
  }
}

// 计算条目下一次发生日期
function nextOccurrence(item, today) {
  // 倒计时（一次性）
  if (item.type === 'countdown') {
    if (item.dateType === 'lunar') {
      return lunarToSolarDate(item.year, item.month, item.day, item.isLeap);
    }
    return solarToDate(item.year, item.month, item.day);
  }

  // 生日（每年重复）
  if (item.type === 'birthday') {
    // 出生日期始终为公历
    const birthYear = item.year || 0;
    const birthMonth = item.month;
    const birthDay = item.day;

    // 确定农历月日（如果按农历庆祝）
    let lunarMonth = item.lunarMonth;
    let lunarDay = item.lunarDay;
    let isLunarLeap = item.isLeap || false;

    // 若没有存储农历信息，需要从出生公历日期计算
    if (item.dateType === 'lunar' && (!lunarMonth || !lunarDay)) {
      // 如果有出生年份，用出生年份的公历日期转换农历
      // 如果没有出生年份，用今年作为参考年份
      const refYear = birthYear > 0 ? birthYear : today.getFullYear();
      const info = solarToLunarInfo(refYear, birthMonth, birthDay);
      if (info) {
        lunarMonth = info.month;
        lunarDay = info.day;
        isLunarLeap = info.isLeap;
      }
    }

    // 根据庆祝方式计算下一个生日
    const today0 = new Date(today);
    today0.setHours(0, 0, 0, 0);

    if (item.dateType === 'lunar') {
      // 农历庆祝：每年按农历月日找对应的公历日期
      const tryYear = function (y) {
        try {
          return lunarToSolarDate(y, lunarMonth, lunarDay, isLunarLeap);
        } catch {
          // 闰月不存在时降级为平月
          return lunarToSolarDate(y, lunarMonth, lunarDay, false);
        }
      };

      let y = today0.getFullYear();
      let d = tryYear(y);
      for (let i = 0; i < 5; i++) {
        if (!d) { y += 1; d = tryYear(y); continue; }
        const dd = new Date(d);
        dd.setHours(0, 0, 0, 0);
        if (dd.getTime() >= today0.getTime()) return d;
        y += 1;
        d = tryYear(y);
      }
      return d;
    } else {
      // 公历庆祝：直接用今年或明年的对应月日
      let y = today0.getFullYear();
      let d = solarToDate(y, birthMonth, birthDay);
      const dd = new Date(d);
      dd.setHours(0, 0, 0, 0);
      if (dd.getTime() >= today0.getTime()) return d;
      // 今年已过，取明年
      return solarToDate(y + 1, birthMonth, birthDay);
    }
  }

  // 纪念日 / 节日（每年重复）
  const today0 = new Date(today);
  today0.setHours(0, 0, 0, 0);

  // 动态节日处理（如母亲节、父亲节、感恩节）
  // month 表示月份，day=0 表示动态，标题决定具体规则
  if (item.type === 'festival' && item.isDynamic) {
    // 根据节日名称确定规则
    const name = item.title;
    const m = item.month; // 月份

    // 计算某年某月的第几个周几
    // 母亲节：5月第二个周日
    // 父亲节：6月第三个周日
    // 感恩节：11月第四个周四
    const calcDynamic = function (year, month, nthWeek, weekDay) {
      // weekDay: 0=周日, 1=周一, ..., 6=周六
      // nthWeek: 1=第一个, 2=第二个, ...
      const firstDay = new Date(year, month - 1, 1);
      const firstWeekDay = firstDay.getDay();
      // 计算第 nthWeek 个 weekDay 的日期
      // 公式：第一个 weekDay 的日期 = 1 + ((weekDay - firstWeekDay + 7) % 7)
      const firstTarget = 1 + ((weekDay - firstWeekDay + 7) % 7);
      const targetDate = firstTarget + (nthWeek - 1) * 7;
      return new Date(year, month - 1, targetDate);
    };

    let nthWeek, weekDay;
    if (name === '母亲节') {
      nthWeek = 2; weekDay = 0; // 5月第二个周日
    } else if (name === '父亲节') {
      nthWeek = 3; weekDay = 0; // 6月第三个周日
    } else if (name === '感恩节') {
      nthWeek = 4; weekDay = 4; // 11月第四个周四
    } else {
      return null; // 未知的动态节日
    }

    const y = today0.getFullYear();
    let d = calcDynamic(y, m, nthWeek, weekDay);
    if (d.getTime() < today0.getTime()) {
      // 今年已过，计算明年
      d = calcDynamic(y + 1, m, nthWeek, weekDay);
    }
    return d;
  }

  // 节气节日特殊处理（立春、清明、冬至等）
  if (item.type === 'festival' && item.isJieQi) {
    // 使用 lunar-javascript 计算节气日期
    const Solar = window.Solar;
    if (!Solar) return null;

    // 节气名称对应公历月份和大致起始日期
    // 用于缩小搜索范围
    const JIEQI_SEARCH_RANGE = {
      '小寒': { month: 1, startDay: 5 },
      '大寒': { month: 1, startDay: 18 },
      '立春': { month: 2, startDay: 3 },
      '雨水': { month: 2, startDay: 18 },
      '惊蛰': { month: 3, startDay: 5 },
      '春分': { month: 3, startDay: 20 },
      '清明': { month: 4, startDay: 4 },
      '谷雨': { month: 4, startDay: 19 },
      '立夏': { month: 5, startDay: 5 },
      '小满': { month: 5, startDay: 20 },
      '芒种': { month: 6, startDay: 5 },
      '夏至': { month: 6, startDay: 20 },
      '小暑': { month: 7, startDay: 6 },
      '大暑': { month: 7, startDay: 22 },
      '立秋': { month: 8, startDay: 7 },
      '处暑': { month: 8, startDay: 22 },
      '白露': { month: 9, startDay: 7 },
      '秋分': { month: 9, startDay: 22 },
      '寒露': { month: 10, startDay: 8 },
      '霜降': { month: 10, startDay: 23 },
      '立冬': { month: 11, startDay: 7 },
      '小雪': { month: 11, startDay: 22 },
      '大雪': { month: 12, startDay: 6 },
      '冬至': { month: 12, startDay: 21 }
    };

    const jieQiName = item.title;
    const range = JIEQI_SEARCH_RANGE[jieQiName];
    if (!range) return null;

    const tryYear = function (y) {
      // 考虑小寒、大寒可能在次年1月（农历十二月对应次年公历1月）
      // 如果是农历12月的小寒/大寒，需要查次年1月
      const searchMonth = (jieQiName === '小寒' || jieQiName === '大寒') ? 1 : range.month;
      const searchYear = (jieQiName === '小寒' || jieQiName === '大寒') ? y + 1 : y;

      for (let d = range.startDay; d <= range.startDay + 5; d++) {
        try {
          const solar = Solar.fromYmd(searchYear, searchMonth, d);
          const lunar = solar.getLunar();
          const jq = lunar.getJieQi();
          if (jq === jieQiName) {
            return new Date(searchYear, searchMonth - 1, d);
          }
        } catch {}
      }
      return null;
    };

    let y = today0.getFullYear();
    let d = tryYear(y);
    for (let i = 0; i < 5; i++) {
      if (!d) { y += 1; d = tryYear(y); continue; }
      const dd = new Date(d);
      dd.setHours(0, 0, 0, 0);
      if (dd.getTime() >= today0.getTime()) return d;
      y += 1;
      d = tryYear(y);
    }
    return d;
  }

  // 每年重复：今年开始往后找
  const tryYear = function (y) {
    if (item.dateType === 'lunar') {
      try {
        return lunarToSolarDate(y, item.month, item.day, item.isLeap);
      } catch {
        return lunarToSolarDate(y, item.month, item.day, false);
      }
    }
    return solarToDate(y, item.month, item.day);
  };

  let y = today0.getFullYear();
  let d = tryYear(y);
  for (let i = 0; i < 5; i++) {
    if (!d) { y += 1; d = tryYear(y); continue; }
    const dd = new Date(d);
    dd.setHours(0, 0, 0, 0);
    if (dd.getTime() >= today0.getTime()) return d;
    y += 1;
    d = tryYear(y);
  }
  return d;
}

// 计算展示信息：剩余天数、年龄等
export function computeDisplay(item, today) {
  const today0 = new Date(today);
  today0.setHours(0, 0, 0, 0);
  const next = nextOccurrence(item, today);
  if (!next) {
    return { daysLeft: null, nextDate: null, age: null, isToday: false, isPast: false };
  }
  const next0 = new Date(next);
  next0.setHours(0, 0, 0, 0);
  const diffDays = Math.round((next0.getTime() - today0.getTime()) / 86400000);
  const isToday = diffDays === 0;

  let age = null;
  if (item.type === 'birthday' && item.year && item.year > 0) {
    age = today0.getFullYear() - item.year;
    const thisYearOccur = nextOccurrence(Object.assign({}, item, { type: 'anniversary' }), today0);
    if (thisYearOccur) {
      const o = new Date(thisYearOccur);
      o.setHours(0, 0, 0, 0);
      if (o.getTime() > today0.getTime()) age -= 1;
    }
  }

  return {
    daysLeft: diffDays,
    nextDate: next,
    age,
    isToday,
    isPast: item.type === 'countdown' && diffDays < 0
  };
}

// 排序：按剩余天数升序（已过的倒计时排到最后）
export function getSortedItems(today) {
  return items
    .map(it => ({ item: it, display: computeDisplay(it, today) }))
    .sort((a, b) => {
      const da = a.display.daysLeft;
      const db = b.display.daysLeft;
      if (da == null && db == null) return 0;
      if (da == null) return 1;
      if (db == null) return -1;
      if (da < 0 && db >= 0) return 1;
      if (db < 0 && da >= 0) return -1;
      return da - db;
    });
}
