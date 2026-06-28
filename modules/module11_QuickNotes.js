// ============================================================
//  模块11：快速笔记（使用主编辑器，仅保留数据管理）
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
export function loadQuickNotes() {
    try {
        const saved = localStorage.getItem('knowledge_graph_quick_notes');
        appState.quickNotes = saved ? JSON.parse(saved) : [];
    } catch { appState.quickNotes = []; }
}

export function saveQuickNotes() {
    localStorage.setItem('knowledge_graph_quick_notes', JSON.stringify(appState.quickNotes));
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
            showItemContextMenu(e.clientX, e.clientY, [
                { label: '📋 复制笔记', action: function () {
                    let orig = appState.quickNotes.find(function (n) { return n.id === noteId; });
                    if (!orig) return;
                    let newId = 'note_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
                    appState.quickNotes.push({
                        id: newId,
                        title: (orig.title || '未命名笔记') + ' (副本)',
                        content: orig.content || ''
                    });
                    saveQuickNotes();
                    renderQuickNotesList();
                }},
                { label: '✏️ 重命名', action: function () { startQuickNoteRename(item); } },
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

    // 点击笔记项打开编辑器（编辑中不触发）
    list.querySelectorAll('.quick-item').forEach(item => {
        item.addEventListener('click', () => {
            if (item.querySelector('.qnote-title-input')) return;
            const noteId = item.dataset.id;
            openRichEditorCK(null, noteId, initCKEditor);
        });
    });
}

// ===== 快速笔记重命名 =====
function startQuickNoteRename(item) {
    const titleSpan = item.querySelector('.qnote-title');
    if (!titleSpan) return;

    const currentTitle = titleSpan.textContent;

    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentTitle;
    input.className = 'qnote-title-input';
    input.style.cssText = 'flex:1;background:#0a1a24;border:1px solid #0ff;color:#eef;padding:3px 8px;border-radius:14px;font-size:12px;outline:none;';

    titleSpan.parentNode.replaceChild(input, titleSpan);

    setTimeout(function () { input.focus(); input.select(); }, 0);

    let cancelHandler = function (e) {
        if (!item.contains(e.target)) {
            finishQuickNoteRename(input, false);
            document.removeEventListener('click', cancelHandler);
        }
    };
    document.addEventListener('click', cancelHandler);
}

function finishQuickNoteRename(input, save) {
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
export function initQuickNotes() {
    loadQuickNotes();
    renderQuickNotesList();
    appState.saveQuickNotes = saveQuickNotes;
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