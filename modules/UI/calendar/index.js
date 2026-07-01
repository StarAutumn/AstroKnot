// ============================================================
//  calendar / index.js — 日历子系统入口组装器
// ============================================================
// 本文件是 calendar/ 子目录的统一入口，负责按依赖顺序触发各模块
// 初始化，并对外暴露 initTaskbarClock。
//
// 子模块组成：
//   ├── shared-state.js      共享状态与刷新回调
//   ├── lunar-utils.js        农历/节气/节日/时辰（基于 lunar-javascript）
//   ├── schedule-store.js     日程数据层 + 冲突/颜色/周次逻辑
//   ├── schedule-forms.js     表单/右键菜单/时间对话框/第一周对话框
//   ├── calendar-popup.js     三视图渲染 + 时钟 tick + 弹窗交互
//   ├── anniversary-store.js  纪念日/倒计时/生日/节日 数据层
//   ├── anniversary-form.js   纪念日编辑表单
//   ├── anniversary-view.js   纪念日列表视图
//   ├── shift-form.js         排班编辑弹窗
//   ├── shift-store.js        排班数据层
//   └── weather.js            天气组件
//
// lunar-javascript 由 index.html 以 UMD script 加载，
// 挂载 Solar/Lunar 到 window，lunar-utils.js / anniversary-store.js 直接读取 window.Solar/Lunar。

import './schedule-store.js';        // 触发 localStorage 加载（副作用）
import './schedule-forms.js';       // 触发表单/菜单 DOM 创建（副作用）
import './anniversary-store.js';    // 触发纪念日数据加载（副作用）
import './anniversary-form.js';     // 触发纪念日表单 DOM 创建（副作用）
import './shift-form.js';           // 触发排班编辑弹窗 DOM 创建（副作用）
import { initCalendarPopup } from './calendar-popup.js';
import { initWeather } from './weather.js';
import { initNotifications } from './notification-store.js';

// ==================== 任务栏时钟入口 ====================
export function initTaskbarClock() {
  // 1) 日历弹窗 + 时钟 tick + 三视图交互
  initCalendarPopup();
  // 2) 天气组件（含右键菜单、悬浮弹窗）
  initWeather();
  // 3) 提醒通知（上班/上课/倒计时）
  initNotifications();
}
