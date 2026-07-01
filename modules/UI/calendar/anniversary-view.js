// ============================================================
//  calendar / anniversary-view.js — 倒计时/纪念日/生日/节日 视图
// ============================================================
import {
  getSortedItems, getAnniversaryStats, clearAllAnniversary
} from './anniversary-store.js';
import { openAnniversaryForm, editAnniversaryForm } from './anniversary-form.js';
import { state } from './shared-state.js';

const TYPE_META = {
  countdown:   { icon: '⏳', label: '倒计时', color: '#ffb86c' },
  anniversary: { icon: '💝', label: '纪念日', color: '#ff8fa3' },
  birthday:    { icon: '🎂', label: '生日',   color: '#c8a8ff' },
  festival:    { icon: '🎉', label: '节日',   color: '#7af0a8' }
};

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function fmtDateChinese(d) {
  if (!d) return '';
  return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
}

// 渲染单个条目卡片
function renderCard(item, display) {
  const meta = TYPE_META[item.type] || TYPE_META.countdown;
  const daysLeft = display.daysLeft;

  // 距离文案
  let dayText;
  if (daysLeft === null) {
    dayText = '<span style="color:#6a9;">日期无效</span>';
  } else if (daysLeft === 0) {
    dayText = '<span style="color:#7af0a8;font-weight:600;">就是今天 🎉</span>';
  } else if (daysLeft > 0) {
    dayText = '还有 <span style="color:' + meta.color + ';font-weight:600;font-size:18px;">' + daysLeft + '</span> 天';
  } else {
    // 已过
    dayText = '已过 <span style="color:#6a9;font-weight:600;font-size:18px;">' + Math.abs(daysLeft) + '</span> 天';
  }

  // 副标题：日期 + 农历标记
  const dateLabel = fmtDateChinese(display.nextDate);
  // 生日类型特殊处理：农历庆祝而非农历出生
  let calTag = '';
  if (item.dateType === 'lunar') {
    if (item.type === 'birthday') {
      calTag = ' <span style="color:#c8a8ff;font-size:10px;">[农历庆祝]</span>';
    } else {
      calTag = ' <span style="color:#c8a8ff;font-size:10px;">[农历]</span>';
    }
  }
  const yearTag = (item.type === 'countdown') ? '' : ' <span style="color:#6a9;font-size:10px;">[每年]</span>';
  const ageTag = (item.type === 'birthday' && display.age != null)
    ? ' <span style="color:#c8a8ff;font-size:11px;">(' + display.age + '岁)</span>'
    : '';

  let html = '<div class="ann-card" data-id="' + item.id + '" style="display:flex;gap:10px;padding:10px 12px;margin-bottom:6px;border-radius:8px;background:rgba(0,255,255,0.05);border-left:3px solid ' + meta.color + ';cursor:pointer;">';
  html += '<div style="font-size:20px;line-height:1.2;">' + meta.icon + '</div>';
  html += '<div style="flex:1;min-width:0;">';
  html += '<div style="display:flex;align-items:baseline;justify-content:space-between;gap:8px;">';
  html += '<div style="color:#eef;font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(item.title) + ageTag + '</div>';
  html += '<div style="color:#9cc;font-size:12px;flex-shrink:0;">' + dayText + '</div>';
  html += '</div>';
  html += '<div style="color:#8ab;font-size:11px;margin-top:3px;">' + dateLabel + calTag + yearTag + (item.note ? ' · ' + escapeHtml(item.note) : '') + '</div>';
  html += '</div>';
  html += '</div>';
  return html;
}

export function renderAnniversaryView() {
  const today = new Date();
  const sorted = getSortedItems(today);
  const stats = getAnniversaryStats();

  let html = '<div style="display:flex;flex-direction:column;height:100%;">';
  // 标题 + 统计（固定）
  html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,0.08);">';
  html += '<div style="font-weight:600;color:#eef;font-size:16px;">纪念日 & 倒计时</div>';
  html += '<div style="font-size:11px;color:#6a9;">共 ' + stats.total + ' 条</div>';
  html += '</div>';

  // 列表 flex:1 撑满
  html += '<div style="flex:1;overflow-y:auto;">';
  if (sorted.length === 0) {
    html += '<div style="text-align:center;color:#5a7;padding:30px 0;font-size:12px;">还没有纪念日或倒计时<br>点击下方"+ 添加"开始记录</div>';
  } else {
    sorted.forEach(function (entry) {
      html += renderCard(entry.item, entry.display);
    });
  }
  html += '</div>';

  // 操作按钮（固定底部）
  html += '<div style="display:flex;gap:8px;margin-top:10px;">';
  html += '<div class="ann-add" style="flex:1;text-align:center;padding:8px;border:1px dashed rgba(0,255,255,0.25);border-radius:8px;cursor:pointer;color:#5ee8ff;font-size:13px;">+ 添加</div>';
  if (stats.total > 0) {
    html += '<div class="ann-clear" style="flex:0 0 auto;text-align:center;padding:8px 14px;border:1px dashed rgba(255,143,163,0.35);border-radius:8px;cursor:pointer;color:#ff8fa3;font-size:13px;">🗑 清空</div>';
  }
  html += '</div>';
  html += '</div>';
  return html;
}

// 事件委托（在 calendar-popup 中调用一次即可）
export function bindAnniversaryEvents(calPopup) {
  calPopup.addEventListener('click', function (e) {
    // 点击卡片 → 编辑
    const card = e.target.closest('.ann-card');
    if (card) {
      e.stopPropagation();
      editAnniversaryForm(card.dataset.id);
      return;
    }
    // 添加按钮
    const addBtn = e.target.closest('.ann-add');
    if (addBtn) {
      e.stopPropagation();
      openAnniversaryForm();
      return;
    }
    // 清空按钮
    const clearBtn = e.target.closest('.ann-clear');
    if (clearBtn) {
      e.stopPropagation();
      const stats = getAnniversaryStats();
      if (stats.total === 0) return;
      const msg = '确认清空全部纪念日数据？\n\n将删除：\n· 倒计时 ' + stats.countdown + ' 条\n· 纪念日 ' + stats.anniversary + ' 条\n· 生日 ' + stats.birthday + ' 条\n· 节日 ' + stats.festival + ' 条\n\n此操作不可撤销！';
      if (!window.confirm(msg)) return;
      clearAllAnniversary();
      if (typeof state.refreshAnniversary === 'function') state.refreshAnniversary();
      return;
    }
  });
}

// 刷新回调（注入到 shared-state）
export function setRefreshAnniversary(fn) {
  state.refreshAnniversary = fn;
}
