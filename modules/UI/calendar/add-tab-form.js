// ============================================================
//  calendar / add-tab-form.js — 新增标签弹窗
// ============================================================
import { addTab } from './items-tabs-store.js';
import { refreshPopup } from './shared-state.js';

let overlay = null;
let elName = null;

function buildHtml() {
  return '<div style="display:flex;flex-direction:column;gap:12px;">' +
    '<div style="font-size:14px;font-weight:600;color:#5ee8ff;">新增标签</div>' +
    '<input type="text" id="add-tab-name" placeholder="标签名称" maxlength="20" style="width:100%;padding:8px 10px;border-radius:6px;border:1px solid rgba(0,255,255,0.2);background:rgba(0,0,0,0.3);color:#eef;font-size:13px;outline:none;" />' +
    '<div style="display:flex;justify-content:flex-end;gap:8px;">' +
      '<button id="add-tab-cancel" style="padding:6px 16px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.05);color:#8ab;font-size:12px;cursor:pointer;">取消</button>' +
      '<button id="add-tab-confirm" style="padding:6px 16px;border-radius:6px;border:none;background:rgba(0,255,255,0.2);color:#5ee8ff;font-size:12px;cursor:pointer;font-weight:600;">确定</button>' +
    '</div>' +
  '</div>';
}

function createOverlay() {
  overlay = document.createElement('div');
  overlay.id = 'add-tab-overlay';
  overlay.style.cssText = 'display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:100000;align-items:center;justify-content:center;';
  overlay.innerHTML = '<div style="background:rgba(20,20,30,0.95);padding:16px;border-radius:12px;border:1px solid rgba(0,255,255,0.15);min-width:200px;max-width:300px;">' + buildHtml() + '</div>';
  document.body.appendChild(overlay);

  elName = overlay.querySelector('#add-tab-name');

  // 事件绑定
  overlay.querySelector('#add-tab-cancel').addEventListener('click', function(e) {
    e.stopPropagation();
    hideAddTabForm();
  });

  overlay.querySelector('#add-tab-confirm').addEventListener('click', function(e) {
    e.stopPropagation();
    confirmAdd();
  });

  elName.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      confirmAdd();
    }
  });

  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) {
      hideAddTabForm();
    }
  });
}

function confirmAdd() {
  const name = elName.value.trim();
  if (!name) {
    elName.focus();
    return;
  }
  const newTab = addTab(name);
  if (newTab) {
    hideAddTabForm();
    refreshPopup();
  } else {
    // 标签已存在或添加失败
    elName.style.borderColor = 'rgba(255,100,100,0.5)';
    setTimeout(function() {
      elName.style.borderColor = 'rgba(0,255,255,0.2)';
    }, 500);
  }
}

export function openAddTabForm() {
  if (!overlay) createOverlay();
  elName.value = '';
  overlay.style.display = 'flex';
  setTimeout(function() { elName.focus(); }, 50);
}

export function hideAddTabForm() {
  if (overlay) overlay.style.display = 'none';
}