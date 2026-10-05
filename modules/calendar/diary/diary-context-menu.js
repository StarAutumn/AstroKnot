// ============================================================
//  calendar / diary-context-menu.js — 日历日期右键菜单
// ============================================================
// 在月视图日期格上右键时弹出，提供三个操作：
//   1. 📝 添加日记 / ✏️ 编辑日记（根据是否已有日记切换文案）
//   2. 🗑️ 删除日记（仅当已有日记时显示）
//   3. 📌 日记插入为节点（仅当已有日记时显示）
//
// 菜单样式与 schedule-forms.js 的 slotMenu 保持一致。

import { hasDiary, readDiary, fmtDiaryDate } from './diary-store.js';
import { openDiaryEditor, deleteDiaryFromMenu } from './diary-editor.js';
import { state } from '../shared-state.js';
import { showConfirm } from '../../module4_Confirm.js';

let _menu = null;
let _currentDateStr = null;

/**
 * 创建菜单 DOM（仅一次）
 */
function _ensureMenu() {
  if (_menu) return _menu;

  _menu = document.createElement('div');
  _menu.id = 'diaryMenu';
  _menu.style.cssText = `
    position: fixed; z-index: 1000003;
    background: rgba(15, 25, 40, 0.96);
    backdrop-filter: blur(16px);
    border: 1px solid rgba(0, 255, 255, 0.25);
    border-radius: 8px;
    padding: 4px 0;
    min-width: 160px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.6);
    color: #b0d8ee;
    font-size: 13px;
    display: none;
    user-select: none;
  `;
  _menu.innerHTML = `
    <div class="diary-menu-item" data-act="add" style="padding:8px 16px;cursor:pointer;">📝 添加日记</div>
    <div class="diary-menu-item" data-act="delete" style="padding:8px 16px;cursor:pointer;color:#e88;display:none;">🗑️ 删除日记</div>
    <div class="diary-menu-item" data-act="insert" style="padding:8px 16px;cursor:pointer;color:#c8a8ff;display:none;">📌 日记插入为节点</div>
  `;
  document.body.appendChild(_menu);

  // 菜单项点击
  _menu.addEventListener('click', function (e) {
    const item = e.target.closest('.diary-menu-item');
    if (!item) return;
    e.stopPropagation();
    const act = item.dataset.act;
    const dateStr = _currentDateStr;
    hideDiaryMenu();
    if (!dateStr) return;

    if (act === 'add') {
      _openEditor(dateStr);
    } else if (act === 'delete') {
      _deleteDiary(dateStr);
    } else if (act === 'insert') {
      _insertAsNode(dateStr);
    }
  });

  // 点击外部关闭菜单
  const closeHandler = function (e) {
    if (_menu && _menu.style.display !== 'none' && !_menu.contains(e.target)) {
      hideDiaryMenu();
    }
  };
  document.addEventListener('mousedown', closeHandler, true);
  document.addEventListener('pointerdown', closeHandler, true);
  document.addEventListener('contextmenu', function (e) {
    if (_menu && !_menu.contains(e.target) && (!state.calPopup || !state.calPopup.contains(e.target))) {
      hideDiaryMenu();
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') hideDiaryMenu();
  });

  return _menu;
}

/**
 * 打开日记右键菜单
 * @param {number} x - 屏幕坐标 x
 * @param {number} y - 屏幕坐标 y
 * @param {Date} date - 对应的日期
 */
export function openDiaryMenu(x, y, date) {
  const menu = _ensureMenu();
  const dateStr = fmtDiaryDate(date);
  _currentDateStr = dateStr;

  // 根据是否已有日记调整菜单项
  const exists = hasDiary(dateStr);
  const addItem = menu.querySelector('[data-act="add"]');
  const delItem = menu.querySelector('[data-act="delete"]');
  const insItem = menu.querySelector('[data-act="insert"]');

  if (addItem) addItem.textContent = exists ? '✏️ 编辑日记' : '📝 添加日记';
  if (delItem) delItem.style.display = exists ? 'block' : 'none';
  if (insItem) insItem.style.display = exists ? 'block' : 'none';

  // 定位菜单
  menu.style.display = 'block';
  menu.style.left = '0px';
  menu.style.top = '0px';
  const w = menu.offsetWidth;
  const h = menu.offsetHeight;
  let left = x, top = y;
  if (left + w > window.innerWidth - 8) left = window.innerWidth - 8 - w;
  if (top + h > window.innerHeight - 8) top = window.innerHeight - 8 - h;
  menu.style.left = left + 'px';
  menu.style.top = top + 'px';
}

/**
 * 关闭日记右键菜单
 */
export function hideDiaryMenu() {
  if (_menu) _menu.style.display = 'none';
  _currentDateStr = null;
}

// ── 菜单动作处理 ──

async function _openEditor(dateStr) {
  const parts = dateStr.split('-');
  const date = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  await openDiaryEditor(date);
}

async function _deleteDiary(dateStr) {
  showConfirm('确定删除 ' + dateStr + ' 的日记吗？（此操作不可撤销）', async () => {
    const result = await deleteDiaryFromMenu(dateStr);
    if (result && result.success) {
      _showToast('日记已删除');
    } else {
      _showToast('删除失败: ' + (result && result.error ? result.error : '未知错误'), 'error');
    }
  }, null, '删除日记');
}

async function _insertAsNode(dateStr) {
  // 读取日记内容
  const result = await readDiary(dateStr);
  if (!result || !result.success || !result.content) {
    _showToast('日记内容为空，无法插入', 'error');
    return;
  }

  const content = result.content;

  // 检查项目是否已加载
  if (typeof window.createNodeInProject !== 'function') {
    _showToast('无法创建节点：项目未加载', 'error');
    return;
  }

  // 动态导入 withHistory 和 saveCurrentProjectData（避免循环依赖）
  try {
    const { withHistory } = await import('../../module3_History.js');
    const { saveCurrentProjectData } = await import('../../TreeData/index.js');

    withHistory(function () {
      const displayTitle = '📔 ' + dateStr + ' 日记';
      const newNode = window.createNodeInProject({
        name: displayTitle,
        desc: content.replace(/<[^>]*>/g, '').substring(0, 80),
        sizeScale: 1.0,
        parentId: null,
        offsetX: 100, offsetY: 0,
      });
      if (newNode) {
        newNode.richContent = content;
        newNode.content = content;
        saveCurrentProjectData();
        _showToast('已添加为节点: ' + displayTitle);
      }
    })();
  } catch (err) {
    console.error('[diary-context-menu] 插入为节点失败:', err);
    _showToast('插入失败: ' + err.message, 'error');
  }
}

// ── Toast（复用 diary-editor 的 Toast，避免重复创建）──
function _showToast(msg, type) {
  let toast = document.getElementById('diaryToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'diaryToast';
    toast.style.cssText = `
      position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
      padding: 10px 20px; border-radius: 8px;
      background: rgba(15, 25, 40, 0.95); color: #eef;
      font-size: 13px; z-index: 1000010;
      border: 1px solid rgba(0, 255, 255, 0.3);
      box-shadow: 0 4px 20px rgba(0,0,0,0.4);
      transition: opacity 0.3s;
      pointer-events: none;
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  if (type === 'error') {
    toast.style.borderColor = 'rgba(255, 143, 163, 0.5)';
    toast.style.color = '#ff8fa3';
  } else {
    toast.style.borderColor = 'rgba(0, 255, 255, 0.3)';
    toast.style.color = '#eef';
  }
  toast.style.opacity = '1';
  toast.style.display = 'block';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(function () {
    toast.style.opacity = '0';
  }, 2500);
}
