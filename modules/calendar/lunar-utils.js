// ============================================================
//  calendar / lunar-utils.js — 农历/节气/节日/时辰
// ============================================================
// lunar-javascript 由 index.html 以 UMD script 加载，挂载 Solar/Lunar 到 window
const Solar = window.Solar;

// 时辰表：子时跨两天 23:00-00:59
const SHICHEN = [
  { name: '\u5B50\u65F6', range: '23:00-00:59' },
  { name: '\u4E11\u65F6', range: '01:00-02:59' },
  { name: '\u5BC5\u65F6', range: '03:00-04:59' },
  { name: '\u536F\u65F6', range: '05:00-06:59' },
  { name: '\u8FB0\u65F6', range: '07:00-08:59' },
  { name: '\u5DF3\u65F6', range: '09:00-10:59' },
  { name: '\u5348\u65F6', range: '11:00-12:59' },
  { name: '\u672A\u65F6', range: '13:00-14:59' },
  { name: '\u7533\u65F6', range: '15:00-16:59' },
  { name: '\u9149\u65F6', range: '17:00-18:59' },
  { name: '\u620C\u65F6', range: '19:00-20:59' },
  { name: '\u4EA5\u65F6', range: '21:00-22:59' }
];

// 公历转农历（返回结构兼容旧代码）
export function solarToLunar(year, month, day) {
  const solar = Solar.fromYmd(year, month, day);
  const lunar = solar.getLunar();
  const lm = lunar.getMonth(); // 闰月为负数
  const isLeap = lm < 0;
  return {
    year: lunar.getYear(),
    month: Math.abs(lm),
    day: lunar.getDay(),
    isLeap,
    ganZhiYear: lunar.getYearInGanZhi(),
    zodiac: lunar.getYearShengXiao(),
    monthName: lunar.getMonthInChinese() + '\u6708',
    dayName: lunar.getDayInChinese()
  };
}

// 取某日的节日名（公历节日 / 农历节日 / 24节气），无则返回空字符串
// 优先级：24节气（当天） > 农历节日 > 公历节日
export function getFestival(year, month, day) {
  try {
    const solar = Solar.fromYmd(year, month, day);
    const lunar = solar.getLunar();
    // 1. 24节气（当天恰好为节气日时返回节气名，如"立春"）
    const jq = lunar.getJieQi();
    if (jq) return jq;
    // 2. 农历节日（春节、元宵、端午、中秋、七夕、重阳、腊八、小年、除夕等）
    const lunarF = lunar.getFestivals();
    if (lunarF && lunarF.length) return lunarF[0];
    // 3. 公历节日（元旦、劳动节、国庆、圣诞、母亲节、父亲节、感恩节等）
    const solarF = solar.getFestivals();
    if (solarF && solarF.length) return solarF[0];
  } catch (e) {
    // 极端日期（超出库支持范围）静默返回空
  }
  return '';
}

// 根据小时分钟返回时辰
export function getShichen(hour, minute) {
  const totalMin = hour * 60 + minute;
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
