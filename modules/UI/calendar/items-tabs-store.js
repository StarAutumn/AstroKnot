// ============================================================
//  calendar / items-tabs-store.js — 事项标签数据管理
// ============================================================
// 标签数据持久化存储，支持增删改

const TABS_KEY = 'astroknot_items_tabs';

// 默认标签（不可删除）
const DEFAULT_TABS = [
  { id: 'all', name: '全部', isDefault: true }
];

// 加载标签
function loadTabs() {
  try {
    const raw = localStorage.getItem(TABS_KEY);
    if (raw) {
      const custom = JSON.parse(raw);
      // 合并默认标签和自定义标签
      return DEFAULT_TABS.concat(custom);
    }
  } catch {}
  return DEFAULT_TABS.slice();
}

let tabs = loadTabs();

function saveTabs() {
  // 只保存自定义标签（非默认）
  const custom = tabs.filter(t => !t.isDefault);
  try {
    localStorage.setItem(TABS_KEY, JSON.stringify(custom));
  } catch {}
}

// 获取所有标签
export function getTabs() {
  return tabs;
}

// 添加自定义标签
export function addTab(name) {
  if (!name || name.trim() === '') return null;
  const trimmed = name.trim();
  // 检查是否已存在同名标签
  if (tabs.some(t => t.name === trimmed)) return null;
  const newTab = {
    id: 'custom_' + Date.now().toString(36),
    name: trimmed,
    isDefault: false
  };
  tabs.push(newTab);
  saveTabs();
  return newTab;
}

// 删除自定义标签
export function removeTab(id) {
  const tab = tabs.find(t => t.id === id);
  if (!tab || tab.isDefault) return false; // 不能删除默认标签
  tabs = tabs.filter(t => t.id !== id);
  saveTabs();
  return true;
}

// 重命名自定义标签
export function renameTab(id, newName) {
  if (!newName || newName.trim() === '') return false;
  const trimmed = newName.trim();
  const tab = tabs.find(t => t.id === id);
  if (!tab || tab.isDefault) return false;
  // 检查是否已存在同名标签
  if (tabs.some(t => t.name === trimmed && t.id !== id)) return false;
  tab.name = trimmed;
  saveTabs();
  return true;
}