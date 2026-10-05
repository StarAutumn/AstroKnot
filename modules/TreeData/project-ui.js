// ============================================================
//  TreeData/project-ui：项目列表渲染、重命名交互与项目项右键菜单（模块2拆分）
// ============================================================
import { appState } from '../module0_AppState.js';
import { showToast } from '../SelectAndEdit/index.js';
import { saveCurrentProjectData } from './persistence.js';
import { loadProject } from './loadProject.js';
import { copyCurrentProject, deleteProject } from './project-crud.js';

/**
 * 渲染项目列表到 DOM
 * 为每个项目生成带重命名/删除按钮的 UI 项
 */
export function renderProjectList() {
  const c = document.getElementById('projectList');
  if (!c) return;
  c.innerHTML = '';
  // 获取搜索关键词（小写）
  const searchInput = document.getElementById('projectSearchInput');
  const keyword = searchInput ? searchInput.value.trim().toLowerCase() : '';

  const filtered = keyword
    ? appState.projects.filter(p => p.name.toLowerCase().includes(keyword))
    : appState.projects;

  if (filtered.length === 0) {
    c.innerHTML = '<div style="padding:12px;color:#88aacc;text-align:center;">没有匹配的项目</div>';
    return;
  }

  filtered.forEach(proj => {
    const d = document.createElement('div');
    d.className = 'project-item' + (proj.id === appState.currentProjectId ? ' active' : '');
    d.dataset.projectId = proj.id;
    d.innerHTML = `<span class="project-name">${escapeHtml(proj.name)}</span>`;
    d.addEventListener('contextmenu', onProjectItemContextMenu);
    c.appendChild(d);
  });
}

/**
 * 绑定项目列表的事件处理（使用事件委托）
 */
export function bindProjectListEvents() {
  const c = document.getElementById('projectList');
  if (!c) return;
  
  // 先移除可能存在的监听器，避免重复绑定
  c.removeEventListener('click', projectListClickHandler);
  c.removeEventListener('keydown', projectListKeydownHandler);
  
  c.addEventListener('click', projectListClickHandler);
  c.addEventListener('keydown', projectListKeydownHandler);
}

/**
 * 慢双击重命名状态
 */
let _lastProjectClickId = null;
let _lastProjectClickTime = 0;
let _projectRenameActive = false;

/**
 * 项目列表点击处理函数 + 慢双击重命名
 */
function projectListClickHandler(e) {
  const target = e.target;
  const projectItem = target.closest('.project-item');
  if (!projectItem || target.closest('.project-name-input')) return;

  const id = projectItem.dataset.projectId;
  if (!id) return;
  if (_projectRenameActive) return;

  // 慢双击检测：同一选中项目在 300-1500ms 内再次单击 → 进入重命名
  const now = Date.now();
  if (appState.currentProjectId === id && _lastProjectClickId === id
      && now - _lastProjectClickTime > 300 && now - _lastProjectClickTime < 1500) {
    startRename(projectItem);
    _lastProjectClickId = null;
    _lastProjectClickTime = 0;
    return;
  }

  // 普通单击 → 加载项目
  loadProject(id);
  _lastProjectClickId = id;
  _lastProjectClickTime = now;
}

/**
 * 项目列表键盘事件处理函数
 */
function projectListKeydownHandler(e) {
  const input = document.querySelector('.project-name-input');
  if (!input) return;
  
  if (e.key === 'Enter') {
    e.stopPropagation();
    finishRename(input, true);
  } else if (e.key === 'Escape') {
    e.stopPropagation();
    finishRename(input, false);
  }
}

/**
 * 开始重命名编辑
 */
function startRename(projectItem) {
  const nameSpan = projectItem.querySelector('.project-name');
  if (!nameSpan) return;

  _projectRenameActive = true;
  const currentName = nameSpan.textContent;

  const input = document.createElement('input');
  input.type = 'text';
  input.value = currentName;
  input.className = 'project-name-input';
  input.style.cssText = `
    flex: 1;
    background: #0a1a24;
    border: 1px solid #0ff;
    color: #eef;
    padding: 6px 10px;
    border-radius: 16px;
    font-size: 12px;
    outline: none;
  `;

  nameSpan.parentNode.replaceChild(input, nameSpan);

  setTimeout(() => {
    input.focus();
    input.select();
  }, 0);

  const finishRenameFromBlur = () => finishRename(input, true);
  input.addEventListener('blur', finishRenameFromBlur);
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
    if (ev.key === 'Escape') { ev.preventDefault(); input.value = currentName; finishRename(input, false); }
  });
}

/**
 * 完成重命名编辑
 */
function finishRename(input, save) {
  _projectRenameActive = false;
  const projectItem = input.closest('.project-item');

  if (save) {
    const newName = input.value.trim();
    const id = projectItem?.dataset.projectId;

    if (newName && id) {
      const p = appState.projects.find(proj => proj.id === id);
      if (p && p.name !== newName) {
        p.name = newName;
        renderProjectList();
        return;
      }
    }
  }
  
  const currentName = input.value;
  const nameSpan = document.createElement('span');
  nameSpan.className = 'project-name';
  nameSpan.textContent = currentName;
  input.parentNode.replaceChild(nameSpan, input);
}

/**
 * HTML 转义，防止 XSS
 * @param {string} s 输入字符串
 * @returns {string} 转义后的字符串
 */
export function escapeHtml(s) {
  return s.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[m]);
}

// ==================== 项目项右键菜单 ====================
function getOrCreateItemContextMenu() {
  let menu = document.getElementById('itemContextMenu');
  if (!menu) {
    menu = document.createElement('div');
    menu.id = 'itemContextMenu';
    document.body.appendChild(menu);
  }
  return menu;
}

export function hideItemContextMenu() {
  let menu = document.getElementById('itemContextMenu');
  if (menu) menu.style.display = 'none';
}

export function showItemContextMenu(x, y, items) {
  let menu = getOrCreateItemContextMenu();
  menu.innerHTML = '';
  
  items.forEach(function (item) {
    if (item.sep) {
      let sep = document.createElement('div');
      sep.className = 'ctx-sep';
      menu.appendChild(sep);
      return;
    }
    let el = document.createElement('div');
    el.className = 'ctx-item';
    el.textContent = item.label;
    el.addEventListener('click', function (e) {
      e.stopPropagation();
      menu.style.display = 'none';
      if (item.action) item.action(e);
    });
    menu.appendChild(el);
  });
  
  menu.style.display = 'block';
  menu.style.visibility = 'hidden';
  menu.style.left = '0px';
  menu.style.top = '0px';
  
  let menuW = menu.offsetWidth;
  let menuH = menu.offsetHeight;
  let winW = window.innerWidth;
  let winH = window.innerHeight;
  const TASKBAR = 44;
  
  let left = x + 4;
  let top = y + 4;
  if (left + menuW > winW) left = Math.max(0, winW - menuW - 4);
  if (top + menuH > winH - TASKBAR) top = Math.max(0, winH - TASKBAR - menuH - 4);
  
  menu.style.left = left + 'px';
  menu.style.top = top + 'px';
  menu.style.visibility = 'visible';
}

function onProjectItemContextMenu(e) {
  e.preventDefault();
  e.stopPropagation();
  hideItemContextMenu();

  let projectItem = e.currentTarget;
  let projId = projectItem.dataset.projectId;
  const proj = appState.projects.find(p => p.id === projId);

  showItemContextMenu(e.clientX, e.clientY, [
    { label: '💾 保存', action: function () {
        // 当前项目先同步实时状态（非当前项目保存其最近一次同步的快照数据）
        if (proj && proj.id === appState.currentProjectId) saveCurrentProjectData();
        if (window.__TABLET__) {
          // [tablet-fix] 平板文件层已随 saveCurrentProjectData 落盘（ProjectFsShim.projectSaveAll），
          // 不再模拟点击 saveNetworkBtn 触发批量保存流程（原「批量保存完成」提示与右键单项操作语义不符）
          const cur = appState.projects.find(p => p.id === appState.currentProjectId);
          showToast(cur ? '已保存项目: ' + cur.name : '项目已保存');
          // [tablet-fix] 派发保存事件驱动版本时间线自动产生节点（与桌面保存按钮链路 module9:337 一致）
          window.dispatchEvent(new CustomEvent('astroknot-project-saved'));
          return;
        }
        // [desktop-fix] 桌面：只保存右键点击的项目（不再模拟点击 saveNetworkBtn 批量保存）
        import('../module9_FileIO.js').then(async ({ saveProjectOne }) => {
          const r = await saveProjectOne(proj);
          if (r.status === 'saved') showToast('已保存项目: ' + proj.name);
          else if (r.status === 'unchanged') showToast('项目「' + proj.name + '」无变化，已确认落盘');
          else if (r.status === 'skipped') showToast('项目「' + proj.name + '」未打开，无数据可保存');
          else if (r.status === 'failed') showToast('保存失败: ' + proj.name);
          // 派发保存事件，驱动版本时间线自动产生节点（与批量保存尾部一致）
          // skipped 未落盘，不派发（避免给当前打开项目误提交版本节点）
          if (r.status !== 'canceled' && r.status !== 'skipped') window.dispatchEvent(new CustomEvent('astroknot-project-saved'));
        });
    }},
    { label: '📋 复制项目', action: function () { copyCurrentProject(); } },
    { label: '✏️ 重命名', action: function () { startRename(projectItem); } },
    { sep: true },
    { label: '📂 打开文件所在位置', action: function () {
        if (!proj) return;
        const folderPath = proj.folderPath;
        if (folderPath && window.api && window.api.showFileInFolder) {
          window.api.showFileInFolder(folderPath);
        } else {
          showToast('项目尚未保存到磁盘');
        }
    }},
    { label: '📄 另存为...', action: async function () {
        if (!proj) return;
        const folderPath = proj.folderPath;
        const projectName = proj.name || 'knowledge_graph';
        if (!folderPath) {
          showToast('项目尚未保存，请先保存');
          return;
        }
        if (window.api && window.api.saveProjectAs) {
          const result = await window.api.saveProjectAs(folderPath, projectName);
          if (!result.canceled) {
            showToast('项目已另存为: ' + result.path);
          }
        }
    }},
    { sep: true },
    { label: '🗑️ 删除', title: '普通点击移入回收站；按住 Shift 永久删除', action: function (e) { deleteProject(projId, e && e.shiftKey); } }
  ]);
}

document.addEventListener('click', function (e) {
  let menu = document.getElementById('itemContextMenu');
  if (menu && !menu.contains(e.target)) {
    menu.style.display = 'none';
  }
});

window.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    hideItemContextMenu();
  }
});