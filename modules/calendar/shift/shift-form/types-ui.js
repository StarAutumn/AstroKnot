// ============================================================
//  calendar / shift-form/types-ui.js — 班次按钮渲染、右键菜单、新增/删除班次按钮事件
//  （拆分自 shift-form.js）
// ============================================================

import { elShiftTypeBtns, elAddShiftTypeBtn, elDeleteShiftBtn } from './dom.js';
import { selectedManualDate, assignedShifts, patternCycle, setPatternCycle } from './state.js';
import { showInputDialog, showAlertDialog, showConfirmDialog, showWorkTimeDialog } from './dialogs.js';
import { renderManualMiniCal, renderPatternShiftTypeBtns, renderPatternCycleBox, renderPatternMiniCal } from './pattern.js';
import { getShiftTypes, addShiftType, updateShiftType, removeShiftType } from '../shift-types-store.js';

// ── 班次按钮渲染 ──
export function renderShiftTypeBtns() {
  const types = getShiftTypes();
  let html = '';
  types.forEach(function (t) {
    html += '<div class="shift-type-btn" data-type="' + t.id + '" style="text-align:center;padding:8px 0;border-radius:6px;border:1px solid ' + t.color + ';background:rgba(0,0,0,0.3);color:' + t.color + ';cursor:pointer;font-size:12px;font-weight:500;min-width:60px;">' + t.name + '</div>';
  });
  elShiftTypeBtns.innerHTML = html;
  
  // 绑定班次按钮点击
  elShiftTypeBtns.querySelectorAll('.shift-type-btn').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (!selectedManualDate) return;
      const type = btn.dataset.type;
      assignedShifts[selectedManualDate] = type;
      renderManualMiniCal();
    });
    
    // 右键菜单（重命名、删除）
    btn.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      e.stopPropagation();
      const typeId = btn.dataset.type;
      showShiftTypeMenu(e.clientX, e.clientY, typeId);
    });
  });
}

// ── 班次右键菜单 ──
export function showShiftTypeMenu(x, y, typeId) {
  // 移除旧菜单
  const oldMenu = document.getElementById('shiftTypeMenu');
  if (oldMenu) oldMenu.remove();
  
  const menu = document.createElement('div');
  menu.id = 'shiftTypeMenu';
  menu.style.cssText = 'position:fixed;top:' + y + 'px;left:' + x + 'px;background:rgba(30,30,45,0.98);border:1px solid rgba(255,255,255,0.15);border-radius:8px;padding:6px 0;min-width:100px;z-index:1000001;box-shadow:0 4px 20px rgba(0,0,0,0.5);';
  
  // 重命名
  menu.innerHTML += '<div class="shift-type-menu-item" data-action="rename" data-id="' + typeId + '" style="padding:8px 12px;cursor:pointer;font-size:12px;color:#eef;border-radius:4px;margin:2px 4px;">重命名</div>';
  // 设置上班时间（休息不需要）
  if (typeId !== 'rest') {
    menu.innerHTML += '<div class="shift-type-menu-item" data-action="settime" data-id="' + typeId + '" style="padding:8px 12px;cursor:pointer;font-size:12px;color:#eef;border-radius:4px;margin:2px 4px;">设置上班时间</div>';
  }
  // 删除（默认班次不允许删除）
  const isDefault = (typeId === 'day' || typeId === 'night' || typeId === 'rest');
  if (!isDefault) {
    menu.innerHTML += '<div class="shift-type-menu-item" data-action="delete" data-id="' + typeId + '" style="padding:8px 12px;cursor:pointer;font-size:12px;color:#ff6464;border-radius:4px;margin:2px 4px;">删除</div>';
  }
  
  document.body.appendChild(menu);
  
  // 绑定菜单项点击
  menu.querySelectorAll('.shift-type-menu-item').forEach(function (item) {
    item.addEventListener('click', function (e) {
      e.stopPropagation();
      const action = item.dataset.action;
      const id = item.dataset.id;
      menu.remove();
      
      if (action === 'rename') {
        showInputDialog('请输入新的班次名称', '例如：加班', function (newName) {
          if (updateShiftType(id, newName)) {
            renderShiftTypeBtns();
            renderManualMiniCal();
            renderPatternShiftTypeBtns(); // 同步更新规律排班班次按钮
            renderPatternCycleBox(); // 同步更新轮班周期方框
            renderPatternMiniCal(); // 同步更新规律排班日历
          } else {
            showAlertDialog('班次名称已存在或更新失败');
          }
        });
      } else if (action === 'settime') {
        showWorkTimeDialog(id);
      } else if (action === 'delete') {
        showConfirmDialog('确定删除该班次？', function () {
          removeShiftType(id);
          // 清除使用该班次的日期（手动排班）
          Object.keys(assignedShifts).forEach(function (dateStr) {
            if (assignedShifts[dateStr] === id) {
              delete assignedShifts[dateStr];
            }
          });
          // 清除使用该班次的周期（规律排班）
          setPatternCycle(patternCycle.filter(function (typeId) {
            return typeId !== id;
          }));
          renderShiftTypeBtns();
          renderManualMiniCal();
          renderPatternShiftTypeBtns(); // 同步更新规律排班班次按钮
          renderPatternCycleBox(); // 同步更新轮班周期方框
          renderPatternMiniCal(); // 同步更新规律排班日历
        });
      }
    });
    
    item.addEventListener('mouseenter', function () {
      item.style.background = 'rgba(255,255,255,0.1)';
    });
    item.addEventListener('mouseleave', function () {
      item.style.background = 'transparent';
    });
  });
  
  // 点击外部关闭（使用 mousedown + pointerdown + 捕获模式）
  setTimeout(function () {
    document.addEventListener('mousedown', closeShiftTypeMenu, true);
    document.addEventListener('pointerdown', closeShiftTypeMenu, true);
  }, 0);
}

export function closeShiftTypeMenu() {
  const menu = document.getElementById('shiftTypeMenu');
  if (menu) menu.remove();
  document.removeEventListener('mousedown', closeShiftTypeMenu, true);
  document.removeEventListener('pointerdown', closeShiftTypeMenu, true);
}

// ── 新增班次 ──
elAddShiftTypeBtn.addEventListener('click', function (e) {
  e.stopPropagation();
  showInputDialog('请输入班次名称', '例如：加班', function (name) {
    const result = addShiftType(name);
    if (result) {
      renderShiftTypeBtns();
    } else {
      showAlertDialog('班次名称已存在');
    }
  });
});

// ── 删除选中日期的班次 ──
elDeleteShiftBtn.addEventListener('click', function (e) {
  e.stopPropagation();
  if (!selectedManualDate) return;
  if (assignedShifts[selectedManualDate]) {
    delete assignedShifts[selectedManualDate];
    renderManualMiniCal();
  }
});
