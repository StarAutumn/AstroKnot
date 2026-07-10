// ============================================================
//  模块11：快速笔记（使用主编辑器，仅保留数据管理）
//  持久化：Electron 环境下通过 IPC 保存到文件系统，
//         非 Electron 环境回退到 localStorage
// ============================================================

import { appState } from './module0_AppState.js';
import { escapeHtml, hideItemContextMenu, showItemContextMenu } from './module2_TreeData.js';
import { showConfirm } from './module4_Confirm.js';
import { openRichEditorCK, initCKEditor } from './richEditor/index.js';

// 从 HTML 内容提取纯文本并获取第一句话（最多20字）
function getFirstSentence(html) {
  if (!html) return '';
  // 创建一个临时 div 来提取纯文本
  const div = document.createElement('div');
  div.innerHTML = html;
  const text = (div.textContent || div.innerText || '').trim();
  if (!text) return '';
  // 按句号、感叹号、问号或换行分割，取第一句
  const match = text.match(/^([^。！？\n]+)[。！？]?/);
  if (match) {
    return match[1].trim().substring(0, 20) + (match[1].length > 20 ? '…' : '');
  }
  return text.substring(0, 20) + (text.length > 20 ? '…' : '');
}

// ---------- 持久化 ----------

// 防抖定时器
let _saveTimer = null;

// 慢双击重命名状态
let _lastQNoteClickId = null;
let _lastQNoteClickTime = 0;
let _qnoteRenameActive = false;

/**
 * 从磁盘/localStorage 加载快速笔记
 */
export async function loadQuickNotes() {
  const isElectron = typeof window !== 'undefined' && window.__ELECTRON__ && window.api;

  if (isElectron) {
    try {
      const result = await window.api.loadQuickNotes({
        savePath: appState.quickNoteSavePath || null
      });

      if (result.success) {
        appState.quickNotes = result.notes || [];

        // 磁盘无数据，但 localStorage 有旧数据 → 自动迁移
        if (appState.quickNotes.length === 0 && !localStorage.getItem('qnotes_migrated')) {
          const legacyData = localStorage.getItem('knowledge_graph_quick_notes');
          if (legacyData) {
            await migrateFromLocalStorage(legacyData);
          }
        }
        return;
      }
    } catch (err) {
      console.error('[快速笔记加载] IPC 失败，回退 localStorage:', err);
    }
  }

  // 非 Electron 环境或 IPC 失败时回退到 localStorage
  try {
    const saved = localStorage.getItem('knowledge_graph_quick_notes');
    appState.quickNotes = saved ? JSON.parse(saved) : [];
  } catch { appState.quickNotes = []; }
}

/**
 * 从 localStorage 旧数据迁移到文件系统
 */
async function migrateFromLocalStorage(legacyJson) {
  try {
    let notes = JSON.parse(legacyJson);
    if (!Array.isArray(notes) || notes.length === 0) return;

    const isElectron = typeof window !== 'undefined' && window.__ELECTRON__ && window.api;
    if (!isElectron) return;

    const result = await window.api.saveQuickNotes({
      savePath: appState.quickNoteSavePath || null,
      notes: notes
    });

    if (result.success) {
      // 迁移成功，清除 localStorage 旧数据
      localStorage.removeItem('knowledge_graph_quick_notes');
      localStorage.setItem('qnotes_migrated', '1');
      appState.quickNotes = notes;
      console.log('[快速笔记迁移] 已从 localStorage 迁移到文件系统，共', notes.length, '条笔记');
    }
  } catch (err) {
    console.error('[快速笔记迁移] 失败:', err);
  }
}

/**
 * 保存快速笔记（防抖 300ms，Electron 环境 IPC 写入文件系统，否则 localStorage）
 */
export function saveQuickNotes() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(async () => {
    _saveTimer = null;
    await _doSaveQuickNotes();
  }, 300);
}

/**
 * 立即保存（无防抖，用于关键操作如应用退出时）
 */
export async function saveQuickNotesNow() {
  if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
  await _doSaveQuickNotes();
}

async function _doSaveQuickNotes() {
  const isElectron = typeof window !== 'undefined' && window.__ELECTRON__ && window.api;

  if (isElectron) {
    try {
      const result = await window.api.saveQuickNotes({
        savePath: appState.quickNoteSavePath || null,
        notes: appState.quickNotes
      });
      if (!result.success) {
        console.error('[快速笔记保存] 失败:', result.error);
      }
      return;
    } catch (err) {
      console.error('[快速笔记保存] 异常:', err);
    }
  }

  // 非 Electron 环境或 IPC 失败时回退到 localStorage
  try {
    localStorage.setItem('knowledge_graph_quick_notes', JSON.stringify(appState.quickNotes));
  } catch (err) {
    console.error('[快速笔记保存] localStorage 写入失败:', err);
  }
}

// ---------- 列表渲染 ----------
export function renderQuickNotesList() {
    const list = document.getElementById('quickNotesList');
    if (!list) return;

    // 获取搜索关键词
    const searchInput = document.getElementById('quickNoteSearchInput');
    const keyword = searchInput ? searchInput.value.trim().toLowerCase() : '';
    const filtered = keyword
        ? appState.quickNotes.filter(n => {
            const title = n.title || getFirstSentence(n.content) || '未命名笔记';
            return title.toLowerCase().includes(keyword);
          })
        : appState.quickNotes;

    if (filtered.length === 0) {
        list.innerHTML = '<div style="padding:12px;color:#88aacc;text-align:center;">没有匹配的笔记</div>';
        return;
    }

    list.innerHTML = filtered.map(note => {
        const displayTitle = note.title || getFirstSentence(note.content) || '未命名笔记';
        return `
            <div class="quick-item" data-id="${note.id}">
                <span class="qnote-title">${escapeHtml(displayTitle)}</span>
            </div>
        `;
    }).join('');

    // 右键菜单事件
    list.querySelectorAll('.quick-item').forEach(item => {
        item.addEventListener('contextmenu', function (e) {
            e.preventDefault();
            e.stopPropagation();
            hideItemContextMenu();
            let noteId = this.dataset.id;
            const note = appState.quickNotes.find(n => n.id === noteId);
            const noteTitle = note ? (note.title || getFirstSentence(note.content) || '未命名笔记') : '笔记';

            showItemContextMenu(e.clientX, e.clientY, [
                { label: '📋 复制笔记', action: function () {
                    let orig = appState.quickNotes.find(function (n) { return n.id === noteId; });
                    if (!orig) return;
                    let newId = 'qnote_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
                    appState.quickNotes.push({
                        id: newId,
                        title: (orig.title || '未命名笔记') + ' (副本)',
                        content: orig.content || '',
                        overlayImages: orig.overlayImages || [],
                        drawData: orig.drawData || null
                    });
                    saveQuickNotes();
                    renderQuickNotesList();
                }},
                { label: '✏️ 重命名', action: function () { startQuickNoteRename(item); } },
                { sep: true },
                { label: '📄 另存为 HTML...', action: async function () {
                    if (!note) return;
                    const htmlContent = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + escapeHtml(noteTitle) + '</title><style>body{font-family:system-ui,sans-serif;padding:20px;line-height:1.6;}</style></head><body>' + (note.content || '') + '</body></html>';
                    if (window.api && window.api.exportFile) {
                        const result = await window.api.exportFile({
                            content: htmlContent,
                            defaultName: noteTitle + '.html',
                            filters: [{ name: 'HTML 文件', extensions: ['html'] }]
                        });
                        if (!result.canceled) {
                            showToast('已导出: ' + result.path);
                        }
                    }
                }},
                { label: '📝 另存为 Markdown...', action: async function () {
                    if (!note) return;
                    // 简单 HTML 转 Markdown：提取纯文本
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = note.content || '';
                    const mdContent = '# ' + noteTitle + '\n\n' + tempDiv.textContent.replace(/\n+/g, '\n\n');
                    if (window.api && window.api.exportFile) {
                        const result = await window.api.exportFile({
                            content: mdContent,
                            defaultName: noteTitle + '.md',
                            filters: [{ name: 'Markdown 文件', extensions: ['md'] }]
                        });
                        if (!result.canceled) {
                            showToast('已导出: ' + result.path);
                        }
                    }
                }},
                { sep: true },
                { label: '🗑️ 删除', action: function () {
                    showConfirm('确定删除这条笔记？', function () {
                        appState.quickNotes = appState.quickNotes.filter(function (n) { return n.id !== noteId; });
                        saveQuickNotes();
                        renderQuickNotesList();
                        if (appState.currentQuickNoteId === noteId) {
                            document.getElementById('richEditorModal').style.display = 'none';
                            appState.currentQuickNoteId = null;
                        }
                    }, null, '删除笔记');
                }}
            ]);
        });
    });

    // 点击笔记项打开编辑器 + 慢双击重命名
    list.querySelectorAll('.quick-item').forEach(item => {
        item.addEventListener('click', () => {
            if (item.querySelector('.qnote-title-input')) return;
            if (_qnoteRenameActive) return;

            const noteId = item.dataset.id;
            const now = Date.now();

            // 慢双击检测：同一选中笔记在 300-1500ms 内再次单击 → 进入重命名
            if (appState.currentQuickNoteId === noteId && _lastQNoteClickId === noteId
                && now - _lastQNoteClickTime > 300 && now - _lastQNoteClickTime < 1500) {
                startQuickNoteRename(item);
                _lastQNoteClickId = null;
                _lastQNoteClickTime = 0;
                return;
            }

            // 普通单击 → 打开编辑器
            openRichEditorCK(null, noteId, initCKEditor);
            _lastQNoteClickId = noteId;
            _lastQNoteClickTime = now;
        });
    });
}

// ===== 快速笔记重命名 =====
function startQuickNoteRename(item) {
    const titleSpan = item.querySelector('.qnote-title');
    if (!titleSpan) return;

    _qnoteRenameActive = true;
    const currentTitle = titleSpan.textContent;

    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentTitle;
    input.className = 'qnote-title-input';
    input.style.cssText = 'flex:1;background:#0a1a24;border:1px solid #0ff;color:#eef;padding:3px 8px;border-radius:14px;font-size:12px;outline:none;';

    titleSpan.parentNode.replaceChild(input, titleSpan);

    setTimeout(function () { input.focus(); input.select(); }, 0);

    input.addEventListener('blur', function () { finishQuickNoteRename(input, true); });
    input.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
        if (ev.key === 'Escape') { ev.preventDefault(); input.value = currentTitle; finishQuickNoteRename(input, false); }
    });
}

function finishQuickNoteRename(input, save) {
    _qnoteRenameActive = false;
    let item = input.closest('.quick-item');

    if (save) {
        let newTitle = input.value.trim();
        let id = item ? item.dataset.id : null;
        if (newTitle && id) {
            let note = appState.quickNotes.find(function (n) { return n.id === id; });
            if (note) {
                note.title = newTitle;
                saveQuickNotes();
                renderQuickNotesList();
                if (appState.currentQuickNoteId === id) {
                    let mt = document.getElementById('modalNodeTitle');
                    if (mt) mt.innerText = '📘 快速笔记: ' + newTitle;
                }
                return;
            }
        } else if (id && !newTitle) {
            let note2 = appState.quickNotes.find(function (n) { return n.id === id; });
            if (note2) {
                note2.title = '';
                saveQuickNotes();
                renderQuickNotesList();
                if (appState.currentQuickNoteId === id) {
                    let mt2 = document.getElementById('modalNodeTitle');
                    if (mt2) mt2.innerText = '📘 快速笔记: 未命名';
                }
                return;
            }
        }
    }

    let displayTitle = input.value || '未命名笔记';
    let titleSpan = document.createElement('span');
    titleSpan.className = 'qnote-title';
    titleSpan.textContent = displayTitle;
    input.parentNode.replaceChild(titleSpan, input);
}

// ---------- 初始化 ----------
export async function initQuickNotes() {
    await loadQuickNotes();
    renderQuickNotesList();
    appState.saveQuickNotes = saveQuickNotes;
    appState.saveQuickNotesNow = saveQuickNotesNow;
    appState.renderQuickNotesList = renderQuickNotesList;

    // 绑定搜索输入事件
    const si = document.getElementById('quickNoteSearchInput');
    if (si) si.addEventListener('input', renderQuickNotesList);

    // 键盘事件：Enter 确认 / Escape 取消重命名
    const ql = document.getElementById('quickNotesList');
    if (ql) {
        ql.addEventListener('keydown', function (e) {
            let input = ql.querySelector('.qnote-title-input');
            if (!input) return;
            if (e.key === 'Enter') { e.stopPropagation(); finishQuickNoteRename(input, true); }
            else if (e.key === 'Escape') { e.stopPropagation(); finishQuickNoteRename(input, false); }
        });
    }

    // 新建快速笔记按钮
    const newBtn = document.getElementById('newQuickNoteBtn');
    if (newBtn) {
        newBtn.onclick = function () {
            const noteId = 'qnote_' + Date.now();
            const newNote = { id: noteId, title: '', content: '' };
            appState.quickNotes.unshift(newNote);
            saveQuickNotes();
            renderQuickNotesList();
            openRichEditorCK(null, noteId, initCKEditor);
        };
    }
}
