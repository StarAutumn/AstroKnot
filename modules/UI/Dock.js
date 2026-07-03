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

function renameItem(targetPath) {
  const container = document.getElementById('dockPanelItems');
  const children = container.children;
  for (const child of children) {
    if (child.dataset.path !== targetPath) continue;
    const label = child.querySelector('.dock-label');
    if (!label) continue;
    const input = document.createElement('input');
    input.className = 'dock-rename-input';
    input.value = label.textContent;
    input.style.width = Math.max(label.offsetWidth + 20, 60) + 'px';
    label.replaceWith(input);
    input.focus();
    input.select();

    const finish = () => {
      const newName = input.value.trim() || label.textContent;
      const items = getSavedItems();
      const idx = items.findIndex(i => i.path === targetPath);
      if (idx >= 0) items[idx].name = newName;
      saveItems(items);
      renderDock();
    };

    input.addEventListener('blur', finish);
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') input.blur();
      if (ev.key === 'Escape') { input.value = label.textContent; input.blur(); }
    });
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

// ---- 图标提取 ----

async function extractAndCacheIcon(item, items) {
  try {
    if (window.api && window.api.extractExeIcon) {
      const dataUri = await window.api.extractExeIcon(item.path);
      if (dataUri && dataUri.length > 100) {
        item.iconData = dataUri;
        saveItems(items);
        renderDock();
      }
    }
  } catch (e) { /* emoji fallback */ }
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
      img.style.width = '20px';
      img.style.height = '20px';
      img.draggable = false;
      iconSpan.appendChild(img);
    } else {
      const ext = (item.path || '').split('.').pop().toLowerCase();
      if (ext === 'exe') iconSpan.textContent = '⚙';
      else if (ext === 'lnk') iconSpan.textContent = '🔗';
      else if (ext === 'bat' || ext === 'cmd') iconSpan.textContent = '💻';
      else if (['url', 'html', 'htm'].includes(ext)) iconSpan.textContent = '🌐';
      else iconSpan.textContent = '📄';
    }
    el.appendChild(iconSpan);

    const labelSpan = document.createElement('span');
    labelSpan.className = 'dock-label';
    labelSpan.textContent = item.name;
    el.appendChild(labelSpan);

    // 单击：选中（Ctrl 多选）
    el.addEventListener('click', (e) => {
      if (e.ctrlKey || e.metaKey) {
        if (selectedPaths.has(item.path)) selectedPaths.delete(item.path);
        else selectedPaths.add(item.path);
      } else {
        selectedPaths.clear();
        selectedPaths.add(item.path);
      }
      updateSelectedClass();
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