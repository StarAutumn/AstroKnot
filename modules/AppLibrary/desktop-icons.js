// ============================================================
//  AppLibrary/desktop-icons.js — 桌面图标纯函数工具集
//  职责：桌面图标位置的 localStorage 持久化（读取 / 保存 /
//  删除 / 清空）、默认网格布局位置计算与初始化、桌面图标
//  DOM 元素构建、网格吸附（含占用格碰撞互换，模拟
//  Windows 桌面图标拖拽行为）
//  实现说明：文件级纯函数，不依赖任何类的实例状态，
//  由 AppPanel.js 按需 import 使用；函数之间的互相调用
//  不受模块拆分影响，Dock.js 通过 window 上挂载的
//  _removeDesktopIconPosition 间接复用删除位置的能力
// ============================================================

import { appState } from '../module0_AppState.js';

const DESKTOP_POS_KEY = 'astroknot-desktop-icon-positions';

/** 加载所有保存的图标位置 */
export function _loadDesktopPositions() {
  try {
    return JSON.parse(localStorage.getItem(DESKTOP_POS_KEY)) || {};
  } catch { return {}; }
}

/** 保存单个图标位置 */
export function _saveDesktopIconPosition(key, pos) {
  const all = _loadDesktopPositions();
  all[key] = { left: Math.round(pos.left), top: Math.round(pos.top) };
  localStorage.setItem(DESKTOP_POS_KEY, JSON.stringify(all));
}

/** 删除单个图标位置 */
export function _removeDesktopIconPosition(key) {
  const all = _loadDesktopPositions();
  if (all[key]) {
    delete all[key];
    localStorage.setItem(DESKTOP_POS_KEY, JSON.stringify(all));
  }
}

/** 清除所有图标位置 */
export function _clearDesktopPositions() {
  localStorage.removeItem(DESKTOP_POS_KEY);
}

/** 获取默认位置（网格排列） */
export function _getDefaultPosition(key, totalCount) {
  const gapX = 84; // 80px 图标 + 4px 间距（高密度）
  const gapY = 84; // 80px 图标 + 4px 间距（高密度）
  const startX = 8;
  const startY = 8;
  const cols = Math.max(1, Math.floor((window.innerWidth - 160) / gapX) || 10);

  // 对所有已知 key 排序，新 key 排在末尾
  const keys = _getAllKeys();
  let idx = keys.indexOf(key);
  if (idx < 0) {
    idx = keys.length; // 新 key 排在末尾
  }
  const col = idx % cols;
  const row = Math.floor(idx / cols);

  // 网格布局时使用吸附后的位置，自由布局时直接计算
  if (appState.dockGridMode === 'grid') {
    return _snapToGrid(startX + col * gapX, startY + row * gapY);
  }
  return {
    left: startX + col * gapX,
    top: startY + row * gapY
  };
}

/** 获取所有已保存的 key 列表 */
export function _getAllKeys() {
  const positions = _loadDesktopPositions();
  return Object.keys(positions).sort();
}

/** 初始化默认位置（为所有应用计算默认位置） */
export function _initDefaultDesktopPositions(apps) {
  const positions = _loadDesktopPositions();
  let changed = false;
  const gapX = 84; // 80px 图标 + 4px 间距（高密度）
  const gapY = 84; // 80px 图标 + 4px 间距（高密度）
  const startX = 8;
  const startY = 8;
  const cols = Math.max(1, Math.floor((window.innerWidth - 160) / gapX) || 10);

  apps.forEach((app, i) => {
    const key = 'app:' + app.id;
    if (!positions[key]) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      positions[key] = { left: startX + col * gapX, top: startY + row * gapY };
      changed = true;
    }
  });

  if (changed) localStorage.setItem(DESKTOP_POS_KEY, JSON.stringify(positions));
}

/** 检测是否为图片路径 */
export function _isImagePath(icon) {
  if (!icon || typeof icon !== 'string') return false;
  // 支持：相对路径、http(s) URL、data URI
  return /\.(png|jpe?g|gif|svg|webp|bmp|ico)$/i.test(icon) ||
         /^https?:\/\//i.test(icon) ||
         /^data:image\//i.test(icon);
}

/** 创建桌面图标 DOM 元素（通用） */
export function _createDesktopIconElement(name, iconText, id, source) {
  const el = document.createElement('div');
  el.className = 'desktop-icon';
  el.dataset.appId = id;
  el.dataset.source = source;

  const img = document.createElement('div');
  img.className = 'desktop-icon-img';

  if (_isImagePath(iconText)) {
    // 图片路径：创建 <img> 元素
    const imgEl = document.createElement('img');
    imgEl.src = iconText;
    imgEl.alt = name;
    imgEl.draggable = false;
    img.appendChild(imgEl);
  } else {
    // emoji 或文本
    img.textContent = iconText;
  }
  el.appendChild(img);

  const label = document.createElement('div');
  label.className = 'desktop-icon-label';
  label.textContent = name;
  el.appendChild(label);

  return el;
}

/** 网格吸附：将任意坐标吸附到最近的格子中心 */
export function _snapToGrid(left, top) {
  const CELL_WIDTH = 84;
  const CELL_HEIGHT = 84;
  const START_X = 8;
  const START_Y = 8;

  const col = Math.round((left - START_X) / CELL_WIDTH);
  const row = Math.round((top - START_Y) / CELL_HEIGHT);
  const safeCol = Math.max(0, col);
  const safeRow = Math.max(0, row);

  return {
    left: START_X + safeCol * CELL_WIDTH,
    top: START_Y + safeRow * CELL_HEIGHT
  };
}

/**
 * 网格吸附（带碰撞互换）：目标格空闲则直接入格；被可见图标占用则与其
 * 互换位置（Windows 桌面行为）——占用者移到被拖图标原格。
 * 占用判定基于桌面层实际渲染的图标（offsetLeft/offsetTop 量化到格子），
 * 而非历史位置表：已删除应用残留的幽灵记录不再把图标弹开，
 * 未写入位置表的默认位置图标也参与碰撞，避免重叠。
 */
export function _snapToGridWithCollision(left, top, excludeEl, originLeft, originTop) {
  const CELL_WIDTH = 84;
  const CELL_HEIGHT = 84;
  const START_X = 8;
  const START_Y = 8;

  const targetCol = Math.max(0, Math.round((left - START_X) / CELL_WIDTH));
  const targetRow = Math.max(0, Math.round((top - START_Y) / CELL_HEIGHT));
  const cellPos = (col, row) => ({ left: START_X + col * CELL_WIDTH, top: START_Y + row * CELL_HEIGHT });

  const layer = document.getElementById('desktopIconsLayer');
  const icons = layer ? Array.from(layer.querySelectorAll('.desktop-icon')) : [];

  // 目标格占用者：除被拖图标外，量化后落在同格的可见图标
  const occupant = icons.find(el => {
    if (el === excludeEl) return false;
    const col = Math.max(0, Math.round((el.offsetLeft - START_X) / CELL_WIDTH));
    const row = Math.max(0, Math.round((el.offsetTop - START_Y) / CELL_HEIGHT));
    return col === targetCol && row === targetRow;
  });

  if (occupant) {
    // 互换：占用者 → 被拖图标原格（DOM 与位置表同步更新）
    const origin = cellPos(
      Math.max(0, Math.round(((originLeft != null ? originLeft : START_X) - START_X) / CELL_WIDTH)),
      Math.max(0, Math.round(((originTop != null ? originTop : START_Y) - START_Y) / CELL_HEIGHT))
    );
    occupant.style.left = origin.left + 'px';
    occupant.style.top = origin.top + 'px';
    const occKey = occupant.dataset.source === 'app'
      ? 'app:' + occupant.dataset.appId
      : 'ext:' + occupant.dataset.appId;
    _saveDesktopIconPosition(occKey, origin);
  }

  return cellPos(targetCol, targetRow);
}
