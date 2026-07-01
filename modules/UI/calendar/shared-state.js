// ============================================================
//  calendar / shared-state.js — 跨模块共享状态
// ============================================================
// 各子模块通过此对象读写日历状态，避免传参地狱。
// 字段在 initTaskbarClock 入口处填充（见 index.js）。

export const state = {
  // 时钟元素与弹窗
  clockEl: null,
  calPopup: null,

  // 日历视图状态
  calViewDate: new Date(),
  calSelectedDate: new Date(),
  calView: 'month',
  calVisible: false,

  // 月/周/日常量
  monthNames: ['\u4E00\u6708', '\u4E8C\u6708', '\u4E09\u6708', '\u56DB\u6708', '\u4E94\u6708', '\u516D\u6708', '\u4E03\u6708', '\u516B\u6708', '\u4E5D\u6708', '\u5341\u6708', '\u5341\u4E00\u6708', '\u5341\u4E8C\u6708'],
  weekHeaders: ['\u65E5', '\u4E00', '\u4E8C', '\u4E09', '\u56DB', '\u4E94', '\u516D'],
  weekDayNames: ['\u5468\u65E5', '\u5468\u4E00', '\u5468\u4E8C', '\u5468\u4E09', '\u5468\u56DB', '\u5468\u4E94', '\u5468\u516D'],
  // 周一开头的列顺序（值为 JS getDay()：1=周一 … 6=周六, 0=周日）
  weekColOrder: [1, 2, 3, 4, 5, 6, 0],
  // 默认时段模板（清空或重置时使用）
  defaultSlots: ['08:00-09:40', '10:00-11:40', '14:00-15:40', '16:00-17:40', '19:00-20:40'],

  // 表单/对话框/右键菜单的 DOM 引用（由 schedule-forms.js 创建并填充）
  eventFormOverlay: null,
  slotMenu: null,
  slotTimeOverlay: null,
  firstWeekOverlay: null,

  // 纪念日表单 DOM 引用（由 anniversary-form.js 创建并填充）
  annFormOverlay: null,
  // 纪念日视图刷新回调（由 calendar-popup.js 注册）
  refreshAnniversary: null,

  // 日视图事项列表标签页状态
  dayListTab: 'all',

  // 事项视图标签页状态
  itemsTab: 'all',

  // 排班编辑弹窗 DOM 引用（由 shift-form.js 创建）
  shiftFormOverlay: null,

  // 排班下拉菜单显示状态
  shiftDropdownVisible: false,

  // 当前选中的排班方案 ID
  activeShiftId: null,

  // 通知中心展开状态（日历弹窗内）
  notifCenterOpen: true
};

// 刷新弹窗回调：由 calendar-popup.js 注册，供 schedule-forms.js / schedule-store.js 调用
export let refreshPopup = function () {};
export function setRefreshPopup(fn) { refreshPopup = fn; }
