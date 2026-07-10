// ============================================================
//  calendar / shift-types-store.js — 班次类型数据存储
// ============================================================

const STORAGE_KEY = 'calendar_shift_types';

// 默认班次类型
const DEFAULT_SHIFT_TYPES = [
  { id: 'day', name: '白班', color: '#ffc864' },
  { id: 'night', name: '夜班', color: '#6496ff' },
  { id: 'rest', name: '休息', color: '#64c864' }
];

let shiftTypes = [];

// 加载班次类型
function loadShiftTypes() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      shiftTypes = JSON.parse(saved);
    } else {
      shiftTypes = DEFAULT_SHIFT_TYPES.slice();
      saveShiftTypes();
    }
  } catch (e) {
    shiftTypes = DEFAULT_SHIFT_TYPES.slice();
  }
}

// 保存班次类型
function saveShiftTypes() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(shiftTypes));
}

// 获取所有班次类型
export function getShiftTypes() {
  if (shiftTypes.length === 0) {
    loadShiftTypes();
  }
  return shiftTypes.slice();
}

// 添加班次类型
export function addShiftType(name) {
  if (!name || !name.trim()) return null;
  
  // 检查是否已存在同名班次
  const exists = shiftTypes.some(t => t.name === name.trim());
  if (exists) return null;
  
  // 生成唯一ID
  const id = 'shift_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  
  // 随机颜色
  const colors = ['#ff6464', '#ff96c8', '#ff8c64', '#c8ff64', '#64c8ff', '#96c8ff', '#c864ff', '#ff64c8'];
  const color = colors[Math.floor(Math.random() * colors.length)];
  
  shiftTypes.push({ id, name: name.trim(), color });
  saveShiftTypes();
  return { id, name: name.trim(), color };
}

// 更新班次类型（重命名）
export function updateShiftType(id, newName) {
  if (!newName || !newName.trim()) return false;

  const idx = shiftTypes.findIndex(t => t.id === id);
  if (idx === -1) return false;

  // 检查是否已存在同名班次（排除自身）
  const exists = shiftTypes.some(t => t.name === newName.trim() && t.id !== id);
  if (exists) return false;

  shiftTypes[idx].name = newName.trim();
  saveShiftTypes();
  return true;
}

// 更新班次类型的上班时间
export function updateShiftTypeWorkTime(id, hour, minute) {
  const idx = shiftTypes.findIndex(t => t.id === id);
  if (idx === -1) return false;

  shiftTypes[idx].workHour = hour;
  shiftTypes[idx].workMinute = minute;
  saveShiftTypes();
  return true;
}

// 删除班次类型
export function removeShiftType(id) {
  // 不允许删除默认班次
  if (id === 'day' || id === 'night' || id === 'rest') return false;
  
  const idx = shiftTypes.findIndex(t => t.id === id);
  if (idx === -1) return false;
  
  shiftTypes.splice(idx, 1);
  saveShiftTypes();
  return true;
}

// 根据ID获取班次信息
export function getShiftTypeById(id) {
  return shiftTypes.find(t => t.id === id) || null;
}

// 初始化加载
loadShiftTypes();