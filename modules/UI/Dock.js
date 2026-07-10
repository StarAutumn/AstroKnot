// ============================================================
//  UI / Dock.js — 左边缘悬浮 Dock（外部程序快捷方式 + 文件拖拽）
//  光标移到左边缘自动弹出，移出自动隐藏
//  双击打开 / 单击选中 / Ctrl 多选 / 右键菜单适配多选
//  支持从外部拖拽文件放入：图片→overlay、音频→overlay、视频→overlay、可执行文件→快捷方式
// ============================================================

import { addImageFromFile } from '../richEditor/core/overlay/overlay-image.js';
import { addAudioFromFile } from '../richEditor/core/overlay/overlay-audio.js';
import { addVideoFromFile } from '../richEditor/core/overlay/overlay-video.js';

const STORAGE_KEY = 'astroknot_dock_items';
const PIN_KEY = 'astroknot_dock_pinned';
let hideTimer = null;
let contextMenuEl = null;
let isPinned = localStorage.getItem(PIN_KEY) === 'true';
let selectedPaths = new Set();
let _fileDragCounter = 0; // 全局文件拖拽计数器（用于显示/隐藏 dock）

// 慢双击重命名状态
let _lastClickedPath = null;
let _lastClickTime = 0;
let _renameActive = false; // 重命名进行中，屏蔽其他点击事件

// ---- 持久化 ----

function getSavedItems() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}

function saveItems(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

// ---- 启动外部程序 ----

function launchApp(filePath) {
  if (!filePath) return;
  if (window.api && window.api.openLocalFile) {
    window.api.openLocalFile(filePath);
  }
}

// ---- 右键菜单（适配多选） ----

function showContextMenu(e, item) {
  e.preventDefault();
  e.stopPropagation();
  hideContextMenu();

  // 右键点击的项目不在选中集合中 => 单选它
  if (!selectedPaths.has(item.path)) {
    selectedPaths.clear();
    selectedPaths.add(item.path);
    updateSelectedClass();
  }

  const selectedCount = selectedPaths.size;
  const isSingle = selectedCount === 1;

  contextMenuEl = document.createElement('div');
  contextMenuEl.className = 'dock-context-menu';

  const menuItems = [
    {
      label: isSingle ? '打开' : `打开 (${selectedCount} 项)`,
      icon: '▶',
      action: () => {
        const items = getSavedItems();
        for (const p of selectedPaths) {
          const found = items.find(i => i.path === p);
          if (found) launchApp(found.path);
        }
      }
    },
    {
      label: '打开文件所在位置',
      icon: '📂',
      action: () => {
        if (window.api && window.api.showFileInFolder) {
          const first = selectedPaths.values().next().value;
          if (first) window.api.showFileInFolder(first);
        }
      }
    },
    { type: 'separator' },
    {
      label: '重命名',
      icon: '✏',
      disabled: !isSingle,
      action: () => { if (isSingle) renameItem(Array.from(selectedPaths)[0]); }
    },
    {
      label: isSingle ? '从快速启动移除' : `移除 (${selectedCount} 项)`,
      icon: '🗑',
      action: () => removeItems(selectedPaths)
    },
    { type: 'separator' },
    {
      label: '属性',
      icon: 'ℹ',
      disabled: !isSingle,
      action: () => { if (isSingle) showProperties(Array.from(selectedPaths)[0]); }
    }
  ];

  for (const it of menuItems) {
    if (it.type === 'separator') {
      const sep = document.createElement('div');
      sep.className = 'dock-context-separator';
      contextMenuEl.appendChild(sep);
      continue;
    }
    const btn = document.createElement('div');
    btn.className = 'dock-context-item' + (it.disabled ? ' disabled' : '');
    btn.innerHTML = `<span class="ctx-icon">${it.icon}</span><span class="ctx-label">${it.label}</span>`;
    if (!it.disabled) {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        hideContextMenu();
        it.action();
      });
    }
    contextMenuEl.appendChild(btn);
  }

  const x = Math.min(e.clientX, window.innerWidth - 200);
  const y = Math.min(e.clientY, window.innerHeight - menuItems.length * 36);
  contextMenuEl.style.left = x + 'px';
  contextMenuEl.style.top = y + 'px';
  document.body.appendChild(contextMenuEl);

  setTimeout(() => {
    document.addEventListener('click', hideContextMenu, { once: true });
  }, 0);
}

function hideContextMenu() {
  if (contextMenuEl) {
    contextMenuEl.remove();
    contextMenuEl = null;
  }
}

// ---- 菜单动作（路径导向，适配多选） ----

function removeItems(paths) {
  const items = getSavedItems();
  const remaining = items.filter(i => !paths.has(i.path));
  saveItems(remaining);
  selectedPaths.clear();
  renderDock();
}

/**
 * 开始内联重命名（慢双击或右键菜单触发）
 * @param {HTMLElement} el - dock 项 DOM 元素
 * @param {Object} item - dock 项数据 { path, name, ... }
 */
function _startInlineRename(el, item) {
  const label = el.querySelector('.dock-label');
  if (!label) return;

  _renameActive = true;
  const originalName = label.textContent;

  const input = document.createElement('input');
  input.className = 'dock-rename-input';
  input.value = originalName;
  input.style.width = Math.max(label.offsetWidth + 20, 60) + 'px';
  label.replaceWith(input);
  input.focus();
  input.select();

  const finish = (save) => {
    _renameActive = false;
    const newName = save ? (input.value.trim() || originalName) : originalName;
    if (newName !== originalName) {
      const items = getSavedItems();
      const idx = items.findIndex(i => i.path === item.path);
      if (idx >= 0) items[idx].name = newName;
      saveItems(items);
    }
    renderDock();
  };

  input.addEventListener('blur', () => finish(true));
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
    if (ev.key === 'Escape') { ev.preventDefault(); finish(false); }
  });
}

/**
 * 右键菜单触发的重命名（找到对应 DOM 元素后调用内联重命名）
 */
function renameItem(targetPath) {
  const container = document.getElementById('dockPanelItems');
  if (!container) return;
  for (const child of container.children) {
    if (child.dataset.path !== targetPath) continue;
    const items = getSavedItems();
    const item = items.find(i => i.path === targetPath);
    if (item) _startInlineRename(child, item);
    break;
  }
}

function showProperties(targetPath) {
  const items = getSavedItems();
  const item = items.find(i => i.path === targetPath);
  if (!item) return;

  const overlay = document.createElement('div');
  overlay.className = 'dock-props-overlay';
  overlay.innerHTML = `
    <div class="dock-props-box">
      <div class="dock-props-title">快捷方式属性</div>
      <div class="dock-props-row"><span class="props-label">名称</span><span class="props-value">${item.name}</span></div>
      <div class="dock-props-row"><span class="props-label">路径</span><span class="props-value" style="word-break:break-all;font-size:11px">${item.path}</span></div>
      <div class="dock-props-row"><span class="props-label">类型</span><span class="props-value">${item.path.split('.').pop().toUpperCase()} 文件</span></div>
      <button class="dock-props-close">关闭</button>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('.dock-props-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

// ---- 图标 emoji 回退 ----

function _getEmojiForExt(filePath) {
  const ext = (filePath || '').split('.').pop().toLowerCase();
  if (ext === 'exe') return '⚙';
  if (ext === 'lnk') return '🔗';
  if (ext === 'bat' || ext === 'cmd') return '💻';
  if (['url', 'html', 'htm'].includes(ext)) return '🌐';
  return '📄';
}

// ---- 图标提取 ----

/**
 * 启动时重新提取所有图标（清除旧数据，用新的 PowerShell 方案重新提取）
 */
function _retryFailedIcons() {
  if (!window.api || !window.api.extractExeIcon) return;
  const items = getSavedItems();
  let needsSave = false;
  for (const item of items) {
    // 清除所有旧 iconData — 旧版用 Electron getFileIcon 提取的质量差/白纸图标
    // 改用 PowerShell + System.Drawing 重新提取
    if (item.iconData) {
      item.iconData = null;
      needsSave = true;
    }
    extractAndCacheIcon(item, items);
  }
  if (needsSave) saveItems(items);
}

async function extractAndCacheIcon(item, items) {
  try {
    if (window.api && window.api.extractExeIcon) {
      const dataUri = await window.api.extractExeIcon(item.path);
      if (dataUri && dataUri.length > 100) {
        item.iconData = dataUri;
        saveItems(items);
        renderDock();
      } else {
        console.warn('[Dock] 图标提取返回数据过短，跳过:', item.path);
      }
    }
  } catch (e) {
    console.warn('[Dock] 图标提取失败:', item.path, e.message);
  }
}

// ---- 选中状态 ----

function updateSelectedClass() {
  const container = document.getElementById('dockPanelItems');
  if (!container) return;
  for (const child of container.children) {
    child.classList.toggle('selected', selectedPaths.has(child.dataset.path));
  }
}

// ---- 渲染 ----

function renderDock() {
  const container = document.getElementById('dockPanelItems');
  if (!container) return;
  const items = getSavedItems();
  container.innerHTML = '';
  for (const item of items) {
    const el = document.createElement('div');
    el.className = 'dock-panel-item' + (selectedPaths.has(item.path) ? ' selected' : '');
    el.dataset.path = item.path;
    el.title = `${item.name}\n${item.path}`;

    const iconSpan = document.createElement('span');
    iconSpan.className = 'dock-icon';
    if (item.iconData) {
      const img = document.createElement('img');
      img.src = item.iconData;
      img.style.width = '24px';
      img.style.height = '24px';
      img.style.imageRendering = 'auto';
      img.draggable = false;
      // 图标加载失败时回退到 emoji，并清除损坏的 iconData
      img.addEventListener('error', () => {
        item.iconData = null;
        const savedItems = getSavedItems();
        const si = savedItems.find(i => i.path === item.path);
        if (si) { si.iconData = null; saveItems(savedItems); }
        iconSpan.innerHTML = '';
        iconSpan.textContent = _getEmojiForExt(item.path);
      });
      iconSpan.appendChild(img);
    } else {
      iconSpan.textContent = _getEmojiForExt(item.path);
    }
    el.appendChild(iconSpan);

    const labelSpan = document.createElement('span');
    labelSpan.className = 'dock-label';
    labelSpan.textContent = item.name;
    el.appendChild(labelSpan);

    // 单击：选中（Ctrl 多选）+ 慢双击重命名
    el.addEventListener('click', (e) => {
      if (_renameActive) return; // 重命名进行中，不处理

      const now = Date.now();
      // 慢双击检测：同一选中项在 300-1500ms 内再次单击 → 进入重命名
      if (selectedPaths.has(item.path) && _lastClickedPath === item.path
          && now - _lastClickTime > 300 && now - _lastClickTime < 1500) {
        _startInlineRename(el, item);
        _lastClickedPath = null;
        _lastClickTime = 0;
        return;
      }

      // 普通单击 → 选中
      if (e.ctrlKey || e.metaKey) {
        if (selectedPaths.has(item.path)) selectedPaths.delete(item.path);
        else selectedPaths.add(item.path);
      } else {
        selectedPaths.clear();
        selectedPaths.add(item.path);
      }
      updateSelectedClass();

      _lastClickedPath = item.path;
      _lastClickTime = now;
    });

    // 双击：启动
    el.addEventListener('dblclick', () => launchApp(item.path));
    el.addEventListener('contextmenu', (e) => showContextMenu(e, item));

    container.appendChild(el);
  }
}

// ---- 添加（批量） ----

function addApp() {
  const input = document.createElement('input');
  input.type = 'file';

  // ── 跨平台文件类型适配 ──
  const platform = window._platform || 'win32'; // 从 preload.js 获取平台信息
  const acceptTypes = {
    win32: '.exe,.lnk,.bat,.cmd,.url,.com',
    darwin: '.app,.command,.sh,.workflow',
    linux: '.desktop,.sh,.bin'
  };
  input.accept = acceptTypes[platform] || acceptTypes.win32;

  input.multiple = true;
  input.style.display = 'none';
  document.body.appendChild(input);

  input.addEventListener('change', () => {
    const files = Array.from(input.files || []);
    if (files.length === 0) { document.body.removeChild(input); return; }

    const items = getSavedItems();
    let changed = false;

    // ── 跨平台扩展名移除 ──
    const extPatterns = {
      win32: /\.(exe|lnk|bat|cmd|url|com)$/i,
      darwin: /\.(app|command|sh|workflow)$/i,
      linux: /\.(desktop|sh|bin)$/i
    };
    const extRegex = extPatterns[platform] || extPatterns.win32;

    for (const file of files) {
      const name = file.name.replace(extRegex, '');
      const path = file.path;
      if (!items.some(i => i.path === path)) {
        items.push({ name, path });
        changed = true;
      }
    }

    if (changed) {
      saveItems(items);
      renderDock();
      // 只提取新添加项的图标（它们没有 iconData）
      for (const item of items) {
        if (!item.iconData) extractAndCacheIcon(item, items);
      }
    }

    document.body.removeChild(input);
  });

  input.click();
}

// ---- 显示/隐藏 ----

function showDock() {
  if (isPinned) return;
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  const panel = document.getElementById('dockPanel');
  if (panel) panel.classList.add('visible');
}

function hideDock() {
  if (isPinned) return;
  if (hideTimer) return;
  hideTimer = setTimeout(() => {
    const panel = document.getElementById('dockPanel');
    if (panel) panel.classList.remove('visible');
    hideTimer = null;
  }, 300);
}

// ---- 初始化 ----

export function initDock() {
  const triggerZone = document.createElement('div');
  triggerZone.className = 'dock-trigger-zone';
  document.body.appendChild(triggerZone);
  triggerZone.addEventListener('mouseenter', showDock);

  const panel = document.getElementById('dockPanel');
  if (panel) {
    panel.addEventListener('mouseenter', showDock);
    panel.addEventListener('mouseleave', hideDock);
  }

  const addBtn = document.getElementById('dockPanelAddBtn');
  if (addBtn) addBtn.addEventListener('click', addApp);

  const pinBtn = document.getElementById('dockPanelPinBtn');
  if (pinBtn) {
    pinBtn.addEventListener('click', () => {
      isPinned = !isPinned;
      localStorage.setItem(PIN_KEY, isPinned);
      pinBtn.classList.toggle('pinned', isPinned);
      pinBtn.textContent = isPinned ? '📍' : '📌';
      if (isPinned) {
        const panel = document.getElementById('dockPanel');
        if (panel) panel.classList.add('visible');
      }
    });
    if (isPinned) {
      pinBtn.classList.add('pinned');
      pinBtn.textContent = '📍';
      const panel = document.getElementById('dockPanel');
      if (panel) panel.classList.add('visible');
    }
  }

  renderDock();

  // ---- 文件拖拽支持 ----
  initFileDrop(panel);

  // ---- 启动时重新提取失败的图标 ----
  _retryFailedIcons();

  // ---- 应用库面板初始化 ----
  initAppPanel();
}

// ---- 应用库面板 ----

let _appPanel = null;

async function initAppPanel() {
  // Web 版跳过（无 window.api）
  if (!window.__ELECTRON__ || !window.api) return;

  // 动态导入避免循环依赖
  const { AppManager } = await import('../AppLibrary/AppManager.js');
  const { AppPanel } = await import('../AppLibrary/AppPanel.js');
  const { AppRunner } = await import('../AppLibrary/AppRunner.js');

  const appManager = new AppManager();
  const appRunner = new AppRunner();
  _appPanel = new AppPanel(appManager, appRunner);

  // 全局可访问（供 3D 场景拖拽使用）
  window.AppManager = appManager;
  window.AppRunner = appRunner;
  window.AppPanel = _appPanel;

  await _appPanel.refresh();
}

// ---- 文件拖拽：从外部拖入文件到快捷栏 ----

function initFileDrop(panel) {
  if (!panel) return;
  if (panel._fileDropInited) return;
  panel._fileDropInited = true;

  // 全局检测文件拖入窗口 → 自动弹出 dock
  document.addEventListener('dragenter', function (e) {
    if (!e.dataTransfer || !e.dataTransfer.types) return;
    if (!Array.from(e.dataTransfer.types).includes('Files')) return;
    _fileDragCounter++;
    if (_fileDragCounter === 1 && !isPinned) {
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      const p = document.getElementById('dockPanel');
      if (p) p.classList.add('visible');
    }
  });

  document.addEventListener('dragleave', function (e) {
    if (!e.dataTransfer || !e.dataTransfer.types) return;
    if (!Array.from(e.dataTransfer.types).includes('Files')) return;
    _fileDragCounter--;
    if (_fileDragCounter <= 0) {
      _fileDragCounter = 0;
      if (!document.contains(e.relatedTarget) && e.relatedTarget !== document) {
        if (!isPinned) {
          hideTimer = setTimeout(function () {
            const p = document.getElementById('dockPanel');
            if (p) p.classList.remove('visible');
            hideTimer = null;
          }, 200);
        }
      }
    }
  });

  // 文件拖过 dock 时高亮
  panel.addEventListener('dragover', function (e) {
    e.preventDefault();
    e.stopPropagation();
    if (!e.dataTransfer.types || !Array.from(e.dataTransfer.types).includes('Files')) return;
    e.dataTransfer.dropEffect = 'copy';
    panel.classList.add('drag-over');
  });

  panel.addEventListener('dragleave', function (e) {
    e.stopPropagation();
    if (!panel.contains(e.relatedTarget)) {
      panel.classList.remove('drag-over');
    }
  });

  // 文件放入 dock
  panel.addEventListener('drop', function (e) {
    e.preventDefault();
    e.stopPropagation();
    _fileDragCounter = 0;
    panel.classList.remove('drag-over');

    const files = Array.from(e.dataTransfer.files || []);
    if (files.length === 0) return;

    if (!isPinned) {
      setTimeout(function () {
        const p = document.getElementById('dockPanel');
        if (p) p.classList.remove('visible');
      }, 500);
    }

    const shortcutItems = getSavedItems();
    let shortcutChanged = false;

    for (const file of files) {
      const type = file.type || '';
      const ext = file.name.split('.').pop().toLowerCase();

      if (type.startsWith('image/')) {
        addImageFromFile(file);
      } else if (type.startsWith('audio/')) {
        addAudioFromFile(file);
      } else if (type.startsWith('video/')) {
        addVideoFromFile(file);
      } else if (/^(exe|lnk|bat|cmd|url|com|msi)$/i.test(ext)) {
        const name = file.name.replace(/\.(exe|lnk|bat|cmd|url|com|msi)$/i, '');
        const path = file.path;
        if (path && !shortcutItems.some(function (i) { return i.path === path; })) {
          shortcutItems.push({ name: name, path: path });
          shortcutChanged = true;
        }
      } else {
        const path = file.path;
        if (path && !shortcutItems.some(function (i) { return i.path === path; })) {
          shortcutItems.push({ name: file.name, path: path });
          shortcutChanged = true;
        }
      }
    }

    if (shortcutChanged) {
      saveItems(shortcutItems);
      renderDock();
      for (const item of shortcutItems) {
        if (!item.iconData) extractAndCacheIcon(item, shortcutItems);
      }
    }
  });
}