// ============================================================
//  calendar / shift-form/dialogs.js — 通用对话框（输入/提示/确认/上班时间）
//  （拆分自 shift-form.js）
// ============================================================

import { renderManualMiniCal, renderPatternMiniCal } from './pattern.js';
import { getShiftTypes, updateShiftTypeWorkTime } from '../shift-types-store.js';

// ── 自定义输入对话框 ──
export function showInputDialog(title, placeholder, onConfirm) {
  const dialog = document.createElement('div');
  dialog.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:100002;';
  dialog.innerHTML = `
    <div style="width:300px;max-width:90vw;background:#1a1d2e;border-radius:10px;padding:16px;box-shadow:0 8px 32px rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.1);">
      <div style="font-size:13px;color:#eef;margin-bottom:12px;">${title}</div>
      <input type="text" placeholder="${placeholder}" style="width:100%;box-sizing:border-box;padding:8px 10px;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:#eef;font-size:13px;outline:none;" />
      <div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end;">
        <button class="cancel-btn" style="padding:6px 14px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:transparent;color:#8ab;font-size:12px;cursor:pointer;">取消</button>
        <button class="confirm-btn" style="padding:6px 14px;border-radius:6px;border:1px solid rgba(0,255,255,0.3);background:rgba(0,255,255,0.15);color:#5ee8ff;font-size:12px;cursor:pointer;">确定</button>
      </div>
    </div>
  `;
  document.body.appendChild(dialog);

  const input = dialog.querySelector('input');
  const cancelBtn = dialog.querySelector('.cancel-btn');
  const confirmBtn = dialog.querySelector('.confirm-btn');

  setTimeout(() => input.focus(), 50);

  cancelBtn.addEventListener('click', () => dialog.remove());
  confirmBtn.addEventListener('click', () => {
    const value = input.value.trim();
    if (value) {
      onConfirm(value);
    }
    dialog.remove();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const value = input.value.trim();
      if (value) {
        onConfirm(value);
      }
      dialog.remove();
    } else if (e.key === 'Escape') {
      dialog.remove();
    }
  });
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.remove();
  });
}

// ── 自定义提示对话框 ──
export function showAlertDialog(message) {
  const dialog = document.createElement('div');
  dialog.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:100002;';
  dialog.innerHTML = `
    <div style="width:280px;max-width:90vw;background:#1a1d2e;border-radius:10px;padding:16px;box-shadow:0 8px 32px rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.1);">
      <div style="font-size:13px;color:#eef;margin-bottom:16px;text-align:center;">${message}</div>
      <div style="display:flex;justify-content:center;">
        <button class="ok-btn" style="padding:8px 20px;border-radius:6px;border:1px solid rgba(0,255,255,0.3);background:rgba(0,255,255,0.15);color:#5ee8ff;font-size:13px;cursor:pointer;">确定</button>
      </div>
    </div>
  `;
  document.body.appendChild(dialog);

  const okBtn = dialog.querySelector('.ok-btn');
  okBtn.addEventListener('click', () => dialog.remove());
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.remove();
  });
}

// ── 自定义确认对话框 ──
export function showConfirmDialog(message, onConfirm) {
  const dialog = document.createElement('div');
  dialog.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:100002;';
  dialog.innerHTML = `
    <div style="width:280px;max-width:90vw;background:#1a1d2e;border-radius:10px;padding:16px;box-shadow:0 8px 32px rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.1);">
      <div style="font-size:13px;color:#eef;margin-bottom:16px;text-align:center;">${message}</div>
      <div style="display:flex;gap:8px;justify-content:center;">
        <button class="cancel-btn" style="padding:8px 14px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:transparent;color:#8ab;font-size:13px;cursor:pointer;">取消</button>
        <button class="confirm-btn" style="padding:8px 14px;border-radius:6px;border:1px solid rgba(255,100,100,0.4);background:rgba(255,100,100,0.2);color:#ff8fa3;font-size:13px;cursor:pointer;">确定</button>
      </div>
    </div>
  `;
  document.body.appendChild(dialog);

  const cancelBtn = dialog.querySelector('.cancel-btn');
  const confirmBtn = dialog.querySelector('.confirm-btn');

  cancelBtn.addEventListener('click', () => dialog.remove());
  confirmBtn.addEventListener('click', () => {
    onConfirm();
    dialog.remove();
  });
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.remove();
  });
}

// ── 设置上班时间对话框 ──
export function showWorkTimeDialog(typeId) {
  const typeInfo = getShiftTypes().find(t => t.id === typeId);
  if (!typeInfo) return;

  const currentHour = typeInfo.workHour != null ? typeInfo.workHour : 9;
  const currentMinute = typeInfo.workMinute != null ? typeInfo.workMinute : 0;

  // 生成时/分选项
  const hourOptions = Array.from({length:24}, (_, i) =>
    `<option value="${i}" ${i === currentHour ? 'selected' : ''}>${String(i).padStart(2,'0')}</option>`
  ).join('');
  const minuteOptions = Array.from({length:60}, (_, i) =>
    `<option value="${i}" ${i === currentMinute ? 'selected' : ''}>${String(i).padStart(2,'0')}</option>`
  ).join('');

  const dialog = document.createElement('div');
  dialog.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:100002;';
  dialog.innerHTML = `
    <div style="width:300px;max-width:90vw;background:#1a1d2e;border-radius:10px;padding:16px;box-shadow:0 8px 32px rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.1);">
      <div style="font-size:13px;color:#eef;margin-bottom:12px;">设置「${typeInfo.name}」上班时间</div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
        <select class="wt-hour" style="flex:1;padding:8px 10px;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:#eef;font-size:13px;outline:none;">${hourOptions}</select>
        <span style="color:#8ab;font-size:16px;font-weight:600;">:</span>
        <select class="wt-minute" style="flex:1;padding:8px 10px;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:#eef;font-size:13px;outline:none;">${minuteOptions}</select>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button class="cancel-btn" style="padding:6px 14px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:transparent;color:#8ab;font-size:12px;cursor:pointer;">取消</button>
        <button class="confirm-btn" style="padding:6px 14px;border-radius:6px;border:1px solid rgba(0,255,255,0.3);background:rgba(0,255,255,0.15);color:#5ee8ff;font-size:12px;cursor:pointer;">确定</button>
      </div>
    </div>
  `;
  document.body.appendChild(dialog);

  const hourSel = dialog.querySelector('.wt-hour');
  const minuteSel = dialog.querySelector('.wt-minute');
  const cancelBtn = dialog.querySelector('.cancel-btn');
  const confirmBtn = dialog.querySelector('.confirm-btn');

  cancelBtn.addEventListener('click', () => dialog.remove());
  confirmBtn.addEventListener('click', () => {
    const hour = parseInt(hourSel.value, 10);
    const minute = parseInt(minuteSel.value, 10);
    updateShiftTypeWorkTime(typeId, hour, minute);
    renderManualMiniCal();
    renderPatternMiniCal();
    dialog.remove();
  });
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.remove();
  });
}
