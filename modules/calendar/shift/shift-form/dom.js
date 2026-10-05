// ============================================================
//  calendar / shift-form/dom.js — 排班编辑弹窗：Overlay DOM 构建与元素引用
//  （拆分自 shift-form.js；本文件保持模块顶层立即执行，语句顺序与原文件一致）
// ============================================================

import { state } from '../../shared-state.js';

export const weekLabels = ['一', '二', '三', '四', '五', '六', '日'];
// 按钮顺序对应的真实星期几（JS Date.getDay: 0=周日, 1=周一...）
export const weekDayMap = [1, 2, 3, 4, 5, 6, 0]; // 一=1, 二=2...日=0

// ── 创建 Overlay DOM ──
export const overlay = document.createElement('div');
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
export const elTitle = overlay.querySelector('#shiftFormTitle');
export const elName = overlay.querySelector('#shiftNameInput');
export const elReminderHour = overlay.querySelector('#reminderHourSelect');
export const elReminderMinute = overlay.querySelector('#reminderMinuteSelect');
export const elType = overlay.querySelector('#shiftTypeSelect');
export const elRegularConfig = overlay.querySelector('#regularConfig');
export const elShiftConfig = overlay.querySelector('#shiftConfig');
export const elStartDate = overlay.querySelector('#shiftStartDateInput');
export const elStartMiniCal = overlay.querySelector('#shiftStartMiniCal');
export const elEndDate = overlay.querySelector('#shiftEndDateInput');
export const elEndDateClear = overlay.querySelector('#shiftEndDateClear');
export const elEndMiniCal = overlay.querySelector('#shiftEndMiniCal');
export const elBigSmallToggle = overlay.querySelector('#bigSmallWeekToggle');
export const elToggleSlider = overlay.querySelector('#toggleSlider');
export const elToggleKnob = overlay.querySelector('#toggleKnob');
export const elWeekdaysNormal = overlay.querySelector('#weekdaysNormal');
export const elWeekdaysBigSmall = overlay.querySelector('#weekdaysBigSmall');
export const elFirstWeekConfig = overlay.querySelector('#firstWeekConfig');
export const elFirstWeek = overlay.querySelector('#firstWeekSelect');
export const elWorkHour = overlay.querySelector('#workHourSelect');
export const elWorkMinute = overlay.querySelector('#workMinuteSelect');
export const elConfirm = overlay.querySelector('#shiftFormConfirm');
export const elCancel = overlay.querySelector('#shiftFormCancel');

// 倒班相关DOM引用
export const elSubType = overlay.querySelector('#shiftSubTypeSelect');
export const elManualConfig = overlay.querySelector('#manualShiftConfig');
export const elPatternConfig = overlay.querySelector('#patternShiftConfig');
export const elManualCal = overlay.querySelector('#shiftManualCal');
export const elShiftTypeBtns = overlay.querySelector('#shiftTypeBtns');
export const elAddShiftTypeBtn = overlay.querySelector('#addShiftTypeBtn');
export const elDeleteShiftBtn = overlay.querySelector('#deleteShiftBtn');

// 规律排班相关DOM引用
export const elPatternCal = overlay.querySelector('#patternManualCal');
export const elPatternCycleBox = overlay.querySelector('#patternCycleBox');
export const elPatternShiftTypeBtns = overlay.querySelector('#patternShiftTypeBtns');
export const elPatternAddShiftTypeBtn = overlay.querySelector('#patternAddShiftTypeBtn');
export const elClearCycleBtn = overlay.querySelector('#clearCycleBtn');
