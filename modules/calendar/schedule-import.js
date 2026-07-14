// ============================================================
//  calendar / schedule-import.js — 从教务系统导入课表（功能 21）
//  流程：配置教务URL → 打开浏览器(导入模式) → 识别课程表 → 预览 → 写入
// ============================================================

import { state } from './shared-state.js';
import { getSchedule, setWeeklyAt, addSlot } from './schedule-store.js';

const JWXT_URL_KEY = 'astroknot-jwxt-url';
const DEFAULT_JWXT_URL = '';

/** 获取保存的教务系统 URL */
function getJwxtUrl() {
  return localStorage.getItem(JWXT_URL_KEY) || DEFAULT_JWXT_URL;
}
function setJwxtUrl(url) {
  localStorage.setItem(JWXT_URL_KEY, url);
}

/**
 * 入口：打开课表导入流程
 * @param {Function} refreshPopup - 日历刷新回调
 */
export function openScheduleImport(refreshPopup) {
  _showUrlConfigDialog(refreshPopup);
}

// ════════════════════════════════════════════════════════════
//  第一步：URL 配置对话框
// ════════════════════════════════════════════════════════════

function _showUrlConfigDialog(refreshPopup) {
  // 移除已有对话框
  const old = document.getElementById('cal-schedule-import-dialog');
  if (old) old.remove();

  const overlay = document.createElement('div');
  overlay.id = 'cal-schedule-import-dialog';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:100100;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);';

  const dialog = document.createElement('div');
  dialog.style.cssText = 'width:520px;max-width:92vw;background:rgba(15,25,40,0.98);border:1px solid rgba(0,255,255,0.2);border-radius:12px;box-shadow:0 12px 48px rgba(0,0,0,0.6);padding:24px;color:#eef;font-size:13px;';

  const currentUrl = getJwxtUrl();
  dialog.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
      <span style="font-size:20px;">📚</span>
      <h3 style="margin:0;font-size:16px;color:#5ee8ff;">从教务系统导入课表</h3>
    </div>
    <div style="margin-bottom:14px;">
      <label style="display:block;margin-bottom:6px;color:#9cc;font-size:12px;">教务系统网址（课程表页面）</label>
      <input id="cal-jwxt-url-input" type="text" value="${currentUrl.replace(/"/g, '&quot;')}"
        placeholder="例如：https://jwxt.your-school.edu.cn/jsxsd/xskbj/xskbj_list.do"
        style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid rgba(0,255,255,0.2);border-radius:6px;background:rgba(0,0,0,0.4);color:#eef;font-size:13px;outline:none;" />
    </div>
    <div style="margin-bottom:18px;padding:10px;background:rgba(200,168,255,0.08);border-radius:6px;font-size:11px;color:#a9b;line-height:1.6;">
      <strong style="color:#c8a8ff;">使用说明：</strong><br>
      1. 填写教务系统课程表页面的网址，点击"打开浏览器"<br>
      2. 在打开的浏览器中登录教务系统，导航到课程表页面<br>
      3. 点击浏览器右下角"识别课程表"按钮<br>
      4. 在预览对话框中确认/修改课程信息后导入
    </div>
    <div style="display:flex;gap:10px;justify-content:flex-end;">
      <button id="cal-jwxt-cancel" style="padding:8px 18px;border:1px solid rgba(255,255,255,0.15);border-radius:6px;background:transparent;color:#9cc;cursor:pointer;font-size:13px;">取消</button>
      <button id="cal-jwxt-open" style="padding:8px 18px;border:none;border-radius:6px;background:rgba(0,255,255,0.2);color:#5ee8ff;cursor:pointer;font-size:13px;font-weight:600;">🌐 打开浏览器</button>
    </div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  const urlInput = dialog.querySelector('#cal-jwxt-url-input');
  const closeDialog = () => overlay.remove();

  dialog.querySelector('#cal-jwxt-cancel').addEventListener('click', closeDialog);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeDialog(); });

  dialog.querySelector('#cal-jwxt-open').addEventListener('click', () => {
    const url = urlInput.value.trim();
    if (!url) {
      urlInput.style.borderColor = 'rgba(255,80,80,0.5)';
      urlInput.focus();
      return;
    }
    setJwxtUrl(url);
    closeDialog();
    _openBrowserForImport(url, refreshPopup);
  });

  urlInput.focus();
}

// ════════════════════════════════════════════════════════════
//  第二步：打开浏览器（导入模式）
// ════════════════════════════════════════════════════════════

let _extractedHandler = null;

function _openBrowserForImport(url, refreshPopup) {
  // 注册一次性事件监听：接收浏览器识别结果
  if (_extractedHandler) {
    window.removeEventListener('astroknot-schedule-extracted', _extractedHandler);
  }
  _extractedHandler = (e) => {
    const rawCourses = e.detail && e.detail.courses;
    if (rawCourses && rawCourses.length >= 0) {
      _showPreviewDialog(rawCourses, refreshPopup);
    }
  };
  window.addEventListener('astroknot-schedule-extracted', _extractedHandler);

  // 通过 AppRunner 打开浏览器，传入 importMode
  if (!window.AppRunner) {
    alert('应用运行器未就绪，无法打开浏览器');
    return;
  }
  window.AppRunner.open({
    id: 'schedule-import-browser',
    name: '教务系统导入',
    icon: '📚',
    type: 'browser',
    defaultUrl: url,
    importMode: 'schedule',
  });
}

// ════════════════════════════════════════════════════════════
//  第三步：预览对话框
// ════════════════════════════════════════════════════════════

/**
 * 解析单元格原始文本为结构化课程信息
 */
function _parseCellText(rawText, weekday, slot) {
  if (!rawText || !rawText.trim()) return null;
  const text = rawText.trim();
  const lines = text.split(/\n|<br\s*\/?>/i).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  const course = {
    weekday: weekday,
    slot: slot,
    title: '',
    teacher: '',
    repeat: 'weekly',
    weekStart: null,
    weekEnd: null,
    building: '',
    room: '',
    note: '',
  };

  // 第一行通常是课程名
  course.title = lines[0];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // 教师匹配
    if (!course.teacher) {
      const teacherMatch = line.match(/(?:教师|老师|讲师|授课)[:：]?\s*([^\s\(\（]+)/);
      if (teacherMatch) {
        course.teacher = teacherMatch[1];
        continue;
      }
      // 括号内的可能是教师
      const parenMatch = line.match(/[\(\（]([^）\)]{2,8})[\)\）]/);
      if (parenMatch && !course.teacher && lines.length <= 3) {
        course.teacher = parenMatch[1];
        continue;
      }
    }
    // 周次匹配：1-16周 / 第1-16周 / 1~16周 / 1,3,5周
    const weekMatch = line.match(/(?:第)?(\d{1,2})\s*[-~～至]\s*(\d{1,2})\s*周/);
    if (weekMatch) {
      course.weekStart = parseInt(weekMatch[1], 10);
      course.weekEnd = parseInt(weekMatch[2], 10);
      // 检查同行的单双周
      if (/单周|单/.test(line)) course.repeat = 'odd';
      else if (/双周|双/.test(line)) course.repeat = 'even';
      continue;
    }
    // 单双周
    if (/^单周?$/.test(line) || line === '单') { course.repeat = 'odd'; continue; }
    if (/^双周?$/.test(line) || line === '双') { course.repeat = 'even'; continue; }
    // 单独周次列表如 1,3,5,7周
    const weekListMatch = line.match(/^(\d{1,2}(?:[,，]\d{1,2})+)\s*周$/);
    if (weekListMatch) {
      const nums = weekListMatch[1].split(/[,，]/).map((n) => parseInt(n, 10)).filter(Boolean);
      if (nums.length > 0) {
        course.weekStart = Math.min(...nums);
        course.weekEnd = Math.max(...nums);
        const allOdd = nums.every((n) => n % 2 === 1);
        const allEven = nums.every((n) => n % 2 === 0);
        if (allOdd) course.repeat = 'odd';
        else if (allEven) course.repeat = 'even';
      }
      continue;
    }
    // 地点匹配：教学楼+门牌号，如 教三301 / 教学楼A302 / 第三教学楼405
    const locMatch = line.match(/^(.+?)(\d{2,5}[A-Za-z]?)$/);
    if (locMatch && !course.building) {
      course.building = locMatch[1].trim();
      course.room = locMatch[2].trim();
      continue;
    }
    // 其他信息存入 note
    if (!course.note) course.note = line;
    else course.note += ' ' + line;
  }

  return course;
}

/**
 * 显示预览对话框
 */
function _showPreviewDialog(rawCourses, refreshPopup) {
  // 移除已有对话框
  const old = document.getElementById('cal-schedule-preview-dialog');
  if (old) old.remove();

  // 解析所有原始课程数据
  const schedule = getSchedule();
  const slots = schedule.slots;
  const parsedCourses = [];

  for (const rc of rawCourses) {
    if (!rc.rawText || !rc.rawText.trim()) continue;
    // 如果当前 slots 不够，自动添加
    while (slots.length <= rc.slot) {
      addSlot('00:00-00:00');
    }
    const course = _parseCellText(rc.rawText, rc.weekday, rc.slot);
    if (course && course.title) {
      parsedCourses.push(course);
    }
  }

  const overlay = document.createElement('div');
  overlay.id = 'cal-schedule-preview-dialog';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:100100;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);';

  const dialog = document.createElement('div');
  dialog.style.cssText = 'width:860px;max-width:96vw;max-height:88vh;display:flex;flex-direction:column;background:rgba(15,25,40,0.98);border:1px solid rgba(0,255,255,0.2);border-radius:12px;box-shadow:0 12px 48px rgba(0,0,0,0.6);color:#eef;font-size:13px;';

  const weekDayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  dialog.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid rgba(0,255,255,0.1);">
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:18px;">📋</span>
        <h3 style="margin:0;font-size:15px;color:#5ee8ff;">课程表识别预览</h3>
        <span id="cal-preview-count" style="font-size:11px;color:#9cc;padding:2px 8px;background:rgba(0,255,255,0.1);border-radius:6px;">0 门课程</span>
      </div>
      <button id="cal-preview-close" style="border:none;background:transparent;color:#9cc;font-size:18px;cursor:pointer;padding:4px 8px;">✕</button>
    </div>
    <div id="cal-preview-body" style="flex:1;overflow-y:auto;padding:16px 20px;"></div>
    <div style="display:flex;gap:10px;justify-content:flex-end;padding:14px 20px;border-top:1px solid rgba(0,255,255,0.1);">
      <button id="cal-preview-cancel" style="padding:8px 18px;border:1px solid rgba(255,255,255,0.15);border-radius:6px;background:transparent;color:#9cc;cursor:pointer;font-size:13px;">取消</button>
      <button id="cal-preview-confirm" style="padding:8px 22px;border:none;border-radius:6px;background:rgba(0,255,255,0.25);color:#5ee8ff;cursor:pointer;font-size:13px;font-weight:600;">✓ 确认导入</button>
    </div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  const bodyEl = dialog.querySelector('#cal-preview-body');
  const countEl = dialog.querySelector('#cal-preview-count');
  const closeDialog = () => overlay.remove();

  dialog.querySelector('#cal-preview-close').addEventListener('click', closeDialog);
  dialog.querySelector('#cal-preview-cancel').addEventListener('click', closeDialog);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeDialog(); });

  // 渲染可编辑的课程列表
  function renderList() {
    countEl.textContent = parsedCourses.length + ' 门课程';
    if (parsedCourses.length === 0) {
      bodyEl.innerHTML = '<div style="text-align:center;padding:40px 0;color:#6a9;font-size:13px;">未能识别到课程信息<br><span style="font-size:11px;">请尝试在课程表页面点击"识别课程表"，或手动添加课程</span></div>';
      return;
    }
    bodyEl.innerHTML = '';
    parsedCourses.forEach((course, idx) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:grid;grid-template-columns:60px 70px 1fr 100px 90px 120px 120px 28px;gap:6px;align-items:center;padding:6px 4px;border-bottom:1px solid rgba(255,255,255,0.04);';
      const repeatOptions = ['weekly', 'odd', 'even'].map((r) => {
        const label = r === 'weekly' ? '每周' : (r === 'odd' ? '单周' : '双周');
        return '<option value="' + r + '"' + (course.repeat === r ? ' selected' : '') + '>' + label + '</option>';
      }).join('');
      row.innerHTML = `
        <select data-field="weekday" style="padding:4px;background:rgba(0,0,0,0.4);color:#eef;border:1px solid rgba(0,255,255,0.15);border-radius:4px;font-size:11px;">
          ${[1,2,3,4,5,6,0].map((wd) => '<option value="' + wd + '"' + (course.weekday === wd ? ' selected' : '') + '>' + weekDayNames[wd] + '</option>').join('')}
        </select>
        <select data-field="slot" style="padding:4px;background:rgba(0,0,0,0.4);color:#eef;border:1px solid rgba(0,255,255,0.15);border-radius:4px;font-size:11px;">
          ${slots.map((s, si) => '<option value="' + si + '"' + (course.slot === si ? ' selected' : '') + '>第' + (si+1) + '节</option>').join('')}
        </select>
        <input data-field="title" value="${(course.title || '').replace(/"/g, '&quot;')}" style="padding:4px 6px;background:rgba(0,0,0,0.4);color:#eef;border:1px solid rgba(0,255,255,0.15);border-radius:4px;font-size:12px;width:100%;box-sizing:border-box;" />
        <input data-field="teacher" value="${(course.teacher || '').replace(/"/g, '&quot;')}" placeholder="教师" style="padding:4px 6px;background:rgba(0,0,0,0.4);color:#eef;border:1px solid rgba(0,255,255,0.15);border-radius:4px;font-size:11px;width:100%;box-sizing:border-box;" />
        <input data-field="weekRange" value="${course.weekStart ? course.weekStart + '-' + course.weekEnd : ''}" placeholder="如 1-16" style="padding:4px 6px;background:rgba(0,0,0,0.4);color:#eef;border:1px solid rgba(0,255,255,0.15);border-radius:4px;font-size:11px;width:100%;box-sizing:border-box;" />
        <select data-field="repeat" style="padding:4px;background:rgba(0,0,0,0.4);color:#eef;border:1px solid rgba(0,255,255,0.15);border-radius:4px;font-size:11px;">${repeatOptions}</select>
        <input data-field="location" value="${(course.building ? course.building : '') + (course.room ? ' ' + course.room : '')}" placeholder="教学楼 门牌号" style="padding:4px 6px;background:rgba(0,0,0,0.4);color:#eef;border:1px solid rgba(0,255,255,0.15);border-radius:4px;font-size:11px;width:100%;box-sizing:border-box;" />
        <button data-action="delete" style="border:none;background:transparent;color:#ff8fa3;cursor:pointer;font-size:14px;padding:2px;">✕</button>
      `;
      // 绑定字段变化
      row.querySelectorAll('[data-field]').forEach((el) => {
        el.addEventListener('change', () => {
          const field = el.dataset.field;
          let val = el.value;
          if (field === 'weekday' || field === 'slot') val = parseInt(val, 10);
          if (field === 'weekRange') {
            const m = val.match(/(\d{1,2})\s*[-~～]\s*(\d{1,2})/);
            if (m) { course.weekStart = parseInt(m[1], 10); course.weekEnd = parseInt(m[2], 10); }
            else { course.weekStart = null; course.weekEnd = null; }
          } else if (field === 'location') {
            const lm = val.match(/^(.+?)\s+(\d+[A-Za-z]?)$/);
            if (lm) { course.building = lm[1].trim(); course.room = lm[2].trim(); }
            else { course.building = val.trim(); course.room = ''; }
          } else {
            course[field] = val;
          }
        });
      });
      row.querySelector('[data-action="delete"]').addEventListener('click', () => {
        parsedCourses.splice(idx, 1);
        renderList();
      });
      bodyEl.appendChild(row);
    });
  }

  renderList();

  // 确认导入
  dialog.querySelector('#cal-preview-confirm').addEventListener('click', () => {
    let imported = 0;
    for (const course of parsedCourses) {
      if (!course.title || !course.title.trim()) continue;
      setWeeklyAt(course.weekday, course.slot, {
        weekday: course.weekday,
        slot: course.slot,
        title: course.title.trim(),
        teacher: course.teacher || '',
        repeat: course.repeat || 'weekly',
        weekStart: course.weekStart,
        weekEnd: course.weekEnd,
        building: course.building || '',
        room: course.room || '',
        note: course.note || '',
      });
      imported++;
    }
    closeDialog();
    if (refreshPopup) refreshPopup();
    // 提示
    _showToast('已导入 ' + imported + ' 门课程');
  });
}

// ════════════════════════════════════════════════════════════
//  提取脚本（注入 webview 执行）
//  在页面中找到课程表表格，提取每个单元格的文本和位置
// ════════════════════════════════════════════════════════════

/**
 * 在 webview 内执行：识别课程表并返回原始单元格数据
 * 此函数会被 .toString() 后注入 webview，不能引用外部变量
 * 返回 JSON 字符串：{ courses: [{ weekday, slot, rawText }], debug: string }
 */
export function extractScheduleScript() {
  // 周几关键词 → JS getDay() 值
  var dayMap = {};
  dayMap['周一'] = 1; dayMap['星期一'] = 1; dayMap['Mon'] = 1; dayMap['一'] = 1;
  dayMap['周二'] = 2; dayMap['星期二'] = 2; dayMap['Tue'] = 2; dayMap['二'] = 2;
  dayMap['周三'] = 3; dayMap['星期三'] = 3; dayMap['Wed'] = 3; dayMap['三'] = 3;
  dayMap['周四'] = 4; dayMap['星期四'] = 4; dayMap['Thu'] = 4; dayMap['四'] = 4;
  dayMap['周五'] = 5; dayMap['星期五'] = 5; dayMap['Fri'] = 5; dayMap['五'] = 5;
  dayMap['周六'] = 6; dayMap['星期六'] = 6; dayMap['Sat'] = 6; dayMap['六'] = 6;
  dayMap['周日'] = 0; dayMap['周天'] = 0; dayMap['星期日'] = 0; dayMap['星期天'] = 0; dayMap['Sun'] = 0; dayMap['日'] = 0;

  var tables = document.querySelectorAll('table');
  if (!tables.length) return JSON.stringify({ courses: [], debug: 'no table found' });

  // 评分每个表格：找最像课程表的
  var best = null;
  var bestScore = -1;
  for (var ti = 0; ti < tables.length; ti++) {
    var tbl = tables[ti];
    var rows = tbl.querySelectorAll('tr');
    if (rows.length < 2) continue;
    // 统计单元格数和列数
    var firstRowCells = rows[0].querySelectorAll('th, td');
    var score = rows.length * firstRowCells.length;
    // 检查表头是否含周几关键词
    var headerText = '';
    firstRowCells.forEach(function (c) { headerText += c.textContent + ' '; });
    var dayCount = 0;
    for (var key in dayMap) {
      if (headerText.indexOf(key) >= 0) dayCount++;
    }
    score += dayCount * 100;
    if (score > bestScore) { bestScore = score; best = tbl; }
  }

  if (!best) return JSON.stringify({ courses: [], debug: 'no suitable table' });

  var allRows = best.querySelectorAll('tr');
  if (allRows.length < 2) return JSON.stringify({ courses: [], debug: 'table too small' });

  // 第一行通常是表头，解析列 → weekday 映射
  var headerCells = allRows[0].querySelectorAll('th, td');
  var colToWeekday = {}; // 列索引 → weekday (0-6)
  var firstDataCol = 0; // 第一个数据列（跳过标签列）
  for (var ci = 0; ci < headerCells.length; ci++) {
    var hText = headerCells[ci].textContent.trim();
    for (var key in dayMap) {
      if (hText.indexOf(key) >= 0) {
        colToWeekday[ci] = dayMap[key];
        break;
      }
    }
  }
  // 如果表头没找到周几，假设列 1-7 = 周一到周日
  if (Object.keys(colToWeekday).length === 0) {
    var cols = headerCells.length;
    for (var c = 1; c < cols && c <= 7; c++) {
      colToWeekday[c] = c; // 1=周一...
    }
    firstDataCol = 1;
  } else {
    // 找到第一个含 weekday 的列作为数据起始
    for (var ck in colToWeekday) { firstDataCol = Math.max(firstDataCol, parseInt(ck, 10)); break; }
  }

  var courses = [];
  // 遍历数据行（跳过表头）
  for (var ri = 1; ri < allRows.length; ri++) {
    var dataCells = allRows[ri].querySelectorAll('td, th');
    if (!dataCells.length) continue;
    var slot = ri - 1; // 第 ri-1 个时段（0-based）

    for (var dc = 0; dc < dataCells.length; dc++) {
      var weekday = colToWeekday[dc];
      if (weekday === undefined) continue; // 跳过非数据列（标签列）
      var cellText = dataCells[dc].innerText || dataCells[dc].textContent || '';
      cellText = cellText.replace(/\r/g, '').trim();
      if (!cellText) continue;
      // 一个单元格可能含多门课（用 --- 或空行分隔）
      var parts = cellText.split(/\n\s*\n|\n-{2,}|\n／／/);
      for (var pi = 0; pi < parts.length; pi++) {
        var part = parts[pi].trim();
        if (part) courses.push({ weekday: weekday, slot: slot, rawText: part });
      }
    }
  }

  return JSON.stringify({ courses: courses, debug: 'found ' + courses.length + ' cells' });
}

// ════════════════════════════════════════════════════════════
//  工具：轻量提示
// ════════════════════════════════════════════════════════════

function _showToast(msg) {
  const toast = document.createElement('div');
  toast.textContent = msg;
  toast.style.cssText = 'position:fixed;bottom:60px;left:50%;transform:translateX(-50%);padding:10px 22px;background:rgba(0,255,255,0.15);border:1px solid rgba(0,255,255,0.3);border-radius:8px;color:#5ee8ff;font-size:13px;z-index:100200;backdrop-filter:blur(8px);box-shadow:0 4px 16px rgba(0,0,0,0.4);';
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.transition = 'opacity 0.3s'; toast.style.opacity = '0'; }, 2000);
  setTimeout(() => toast.remove(), 2400);
}

// 暴露提取脚本供浏览器模块调用
window.__extractScheduleScript = extractScheduleScript;
