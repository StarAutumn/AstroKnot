// ============================================================
//  AIChat UI 层：对话框动画、消息气泡、历史面板、模式切换
// ============================================================

import { HISTORY_KEY, MAX_HISTORY, MODES } from './config.js';
import { restoreStateSnapshot, getSnapshotDiff } from './tools.js';

// ─── 模块级 UI 状态 ──────────────────────────────
let _aiDialogMinimized = true;
let _aiDialogSavedRect = null;
let _historyPanelOpen = false;
let _currentMode = 'chat';
let _conversationHistory = [];

// ─── 状态访问器 ──────────────────────────────────
export function getConversationHistory() { return _conversationHistory; }
export function setConversationHistory(h) { _conversationHistory = h; }
export function getCurrentMode() { return _currentMode; }
export function setCurrentMode(m) { _currentMode = m; }
export function isDialogMinimized() { return _aiDialogMinimized; }
export function isHistoryPanelOpen() { return _historyPanelOpen; }

// ─── 飞入/飞出动画 ─────────────────────────────────────

function _getAiTaskbarTarget(dialog) {
  const btn = document.getElementById('aiTaskbarBtn');
  const rect = dialog.getBoundingClientRect();
  if (btn) {
    const btnRect = btn.getBoundingClientRect();
    const targetCenterX = btnRect.left + btnRect.width / 2;
    const targetCenterY = btnRect.top + btnRect.height / 2;
    const dx = targetCenterX - (rect.left + rect.width / 2);
    const dy = targetCenterY - (rect.top + rect.height / 2);
    const scale = Math.min(40 / rect.width, 20 / rect.height);
    return { dx: dx, dy: dy, scale: scale };
  }
  const destX = Math.round(window.innerWidth / 2 - rect.width / 2);
  const destY = window.innerHeight - 44;
  const dx = destX - rect.left;
  const dy = destY - rect.top;
  const scale = Math.min(48 / rect.width, 24 / rect.height);
  return { dx: dx, dy: dy, scale: scale };
}

function _animateAiMinimize(dialog, done) {
  const t = _getAiTaskbarTarget(dialog);
  const anim = dialog.animate([
    { transform: 'translate(0, 0) scale(1)', opacity: 1 },
    { transform: 'translate(' + t.dx + 'px, ' + t.dy + 'px) scale(' + t.scale + ')', opacity: 0.15 }
  ], {
    duration: 250,
    easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
  });
  if (done) anim.onfinish = done;
}

function _animateAiRestore(dialog, done) {
  const t = _getAiTaskbarTarget(dialog);
  const anim = dialog.animate([
    { transform: 'translate(' + t.dx + 'px, ' + t.dy + 'px) scale(' + t.scale + ')', opacity: 0.15 },
    { transform: 'translate(0, 0) scale(1)', opacity: 1 }
  ], {
    duration: 250,
    easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
  });
  if (done) anim.onfinish = done;
}

function _bringAIToFront(dialog) {
  if (!window._aiZIndex) window._aiZIndex = 100000;
  window._aiZIndex++;
  dialog.style.zIndex = window._aiZIndex;
}

export function toggleAIDialog() {
  const dialog = document.getElementById('aiFloatingDialog');
  if (!dialog) return;

  if (!_aiDialogMinimized) {
    const rect = dialog.getBoundingClientRect();
    _aiDialogSavedRect = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    };
    dialog.style.left = rect.left + 'px';
    dialog.style.top = rect.top + 'px';
    dialog.style.width = rect.width + 'px';
    dialog.style.height = rect.height + 'px';
    dialog.style.right = 'auto';
    dialog.style.bottom = 'auto';

    _animateAiMinimize(dialog, function () {
      dialog.classList.add('minimized');
    });
    _aiDialogMinimized = true;
  } else {
    dialog.classList.remove('minimized');
    if (_aiDialogSavedRect) {
      dialog.style.left = _aiDialogSavedRect.left + 'px';
      dialog.style.top = _aiDialogSavedRect.top + 'px';
      dialog.style.width = _aiDialogSavedRect.width + 'px';
      dialog.style.height = _aiDialogSavedRect.height + 'px';
      dialog.style.right = 'auto';
      dialog.style.bottom = 'auto';
    }
    _bringAIToFront(dialog);
    _animateAiRestore(dialog);
    _aiDialogMinimized = false;
  }
}

// ─── 消息气泡 ──────────────────────────────────────────

function _copyText(text) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(function () {});
  } else {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (_) {}
    document.body.removeChild(ta);
  }
}

// ─── 回退确认弹窗 ────────────────────────────────────

function _showRollbackConfirmDialog(historyIdx) {
  // 计算变化
  var diff = getSnapshotDiff(historyIdx);
  if (!diff) {
    rollbackConversation(historyIdx);
    return;
  }

  // 收集变化描述
  var addedNames = diff.added.map(function(x) { return x.split('|')[1] || x.split('|')[0]; });

  // 找到用户消息气泡，在其后插入确认条
  var msgs = document.getElementById('aiChatMessages');
  if (!msgs) return;
  var userMsg = msgs.querySelector('.ai-message.user[data-history-idx="' + historyIdx + '"]');
  if (!userMsg) return;

  // 如果已存在确认条则不再重复创建
  var existing = userMsg.nextElementSibling;
  if (existing && existing.classList.contains('ai-rollback-bar')) return;

  var bar = document.createElement('div');
  bar.className = 'ai-rollback-bar';

  var title = document.createElement('div');
  title.className = 'ai-rollbar-title';
  title.textContent = '确定要回退至此次问答重新发起吗？';

  var body = document.createElement('div');
  body.className = 'ai-rollbar-body';
  if (addedNames.length > 0) {
    body.textContent = '将移除以下节点：';
    var list = document.createElement('div');
    list.className = 'ai-rollbar-nodes';
    addedNames.slice(0, 15).forEach(function(name) {
      var item = document.createElement('div');
      item.className = 'ai-rollbar-node-item';
      item.textContent = '• ' + name;
      list.appendChild(item);
    });
    if (addedNames.length > 15) {
      var more = document.createElement('div');
      more.className = 'ai-rollbar-node-item ai-rollbar-more';
      more.textContent = '… 及其他 ' + (addedNames.length - 15) + ' 个节点';
      list.appendChild(more);
    }
    body.appendChild(list);
  }
  if (diff.addedEdges.length > 0) {
    var edgeText = document.createElement('div');
    edgeText.className = 'ai-rollbar-edge-info';
    edgeText.textContent = '将移除 ' + diff.addedEdges.length + ' 条连线';
    body.appendChild(edgeText);
  }
  if (addedNames.length === 0 && diff.addedEdges.length === 0) {
    body.textContent = '本轮对话未产生可回退的变更';
  }

  var btnRow = document.createElement('div');
  btnRow.className = 'ai-rollbar-actions';

  var confirmBtn = document.createElement('button');
  confirmBtn.className = 'ai-rollbar-btn ai-rollbar-confirm';
  confirmBtn.textContent = '确认回退';

  var cancelBtn = document.createElement('button');
  cancelBtn.className = 'ai-rollbar-btn ai-rollbar-cancel';
  cancelBtn.textContent = '取消';

  btnRow.appendChild(confirmBtn);
  btnRow.appendChild(cancelBtn);
  bar.appendChild(title);
  bar.appendChild(body);
  bar.appendChild(btnRow);
  userMsg.parentNode.insertBefore(bar, userMsg.nextElementSibling);

  cancelBtn.addEventListener('click', function () { bar.remove(); });
  confirmBtn.addEventListener('click', function () {
    bar.remove();
    rollbackConversation(historyIdx);
  });
}

export function rollbackConversation(historyIdx) {
  // 回退到第 historyIdx 条用户消息之前
  const msgs = document.getElementById('aiChatMessages');
  if (!msgs) return;
  const userMsg = msgs.querySelector('.ai-message.user[data-history-idx="' + historyIdx + '"]');
  if (!userMsg) return;
  // 收集从该消息开始（包括自身）往后的所有消息
  let node = userMsg;
  const toRemove = [];
  while (node) {
    toRemove.push(node);
    node = node.nextElementSibling;
  }
  toRemove.forEach(function (el) { el.remove(); });
  // 截断对话历史
  _conversationHistory.splice(Number(historyIdx));
  // 恢复状态快照（图谱结构 + 刷新视图）
  restoreStateSnapshot(historyIdx);
}

export function addMessage(role, text) {
  const msgs = document.getElementById('aiChatMessages');
  if (!msgs) return;
  const div = document.createElement('div');
  div.className = 'ai-message ' + role;

  if (role === 'user') {
    const historyIdx = _conversationHistory.length - 1;
    div.dataset.historyIdx = String(historyIdx);
    div.dataset.msgText = text;

    const actions = document.createElement('div');
    actions.className = 'ai-msg-actions';

    const rollbackBtn = document.createElement('button');
    rollbackBtn.className = 'ai-msg-rollback';
    rollbackBtn.title = '回退到本轮对话发起前';
    rollbackBtn.textContent = '↩';
    rollbackBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      _showRollbackConfirmDialog(historyIdx);
    });

    const copyBtn = document.createElement('button');
    copyBtn.className = 'ai-msg-copy';
    copyBtn.title = '复制该对话框的内容';
    copyBtn.textContent = '📋';
    copyBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      _copyText(text);
    });

    actions.appendChild(rollbackBtn);
    actions.appendChild(copyBtn);

    const textSpan = document.createElement('span');
    textSpan.className = 'ai-msg-text';
    textSpan.textContent = text;

    div.appendChild(actions);
    div.appendChild(textSpan);
  } else {
    div.textContent = text;
  }

  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

export function addLoading() {
  const msgs = document.getElementById('aiChatMessages');
  if (!msgs) return;
  const wrapper = document.createElement('div');
  wrapper.className = 'ai-message assistant';
  wrapper.id = 'aiLoadingMsg';
  const dots = document.createElement('div');
  dots.className = 'ai-loading';
  dots.innerHTML = '<span>思考中</span><span class="ai-loading-dot"></span><span class="ai-loading-dot"></span><span class="ai-loading-dot"></span>';
  wrapper.appendChild(dots);
  msgs.appendChild(wrapper);
  msgs.scrollTop = msgs.scrollHeight;
}

export function removeLoading() {
  const el = document.getElementById('aiLoadingMsg');
  if (el) el.remove();
}

// ─── 模式切换 ──────────────────────────────────────
export function switchMode(newMode) {
  if (newMode === _currentMode) return;
  _currentMode = newMode;

  const dialog = document.getElementById('aiFloatingDialog');
  if (dialog) dialog.classList.toggle('agent-mode', newMode === 'agent');
}

// ─── 历史对话管理 ─────────────────────────────────

function _escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function _getHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch (_) { return []; }
}

export function saveCurrentToHistory() {
  const msgs = document.getElementById('aiChatMessages');
  if (!msgs) return;
  const userMsgs = Array.from(msgs.children).filter(function (m) {
    return m.classList.contains('user');
  });
  if (userMsgs.length === 0) return;

  const title = userMsgs[0].textContent.slice(0, 30) || '对话';
  const html = msgs.innerHTML;
  const history = _getHistory();
  history.unshift({
    id: Date.now(),
    title: title,
    mode: _currentMode,
    html: html,
    history: _conversationHistory.slice(),
    time: new Date().toLocaleString()
  });
  if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch (_) {
    history.splice(-5);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch (_) {}
  }
}

function _loadHistoryEntry(id) {
  const history = _getHistory();
  const entry = history.find(function (h) { return h.id === id; });
  if (!entry) return;

  const msgs = document.getElementById('aiChatMessages');
  if (msgs) msgs.innerHTML = entry.html;
  _conversationHistory = entry.history || [];
  _currentMode = entry.mode || 'chat';
  const agentSelect = document.getElementById('aiAgentSelect');
  if (agentSelect) agentSelect.value = _currentMode;
  toggleHistoryPanel(false);
}

function _deleteHistoryEntry(id) {
  let history = _getHistory();
  history = history.filter(function (h) { return h.id !== id; });
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  renderHistoryPanel();
}

function _clearAllHistory() {
  localStorage.removeItem(HISTORY_KEY);
  renderHistoryPanel();
}

export function toggleHistoryPanel(forceState) {
  _historyPanelOpen = typeof forceState === 'boolean' ? forceState : !_historyPanelOpen;
  const panel = document.getElementById('aiHistoryPanel');
  if (!panel) return;
  if (_historyPanelOpen) {
    renderHistoryPanel();
    panel.classList.add('open');
  } else {
    panel.classList.remove('open');
  }
}

export function renderHistoryPanel() {
  const panel = document.getElementById('aiHistoryPanel');
  if (!panel) return;
  const history = _getHistory();

  if (history.length === 0) {
    panel.innerHTML = '<div class="ai-history-header"><span>历史对话</span></div><div class="ai-history-empty">暂无历史对话</div>';
    return;
  }

  let html = '<div class="ai-history-header"><span>历史对话</span><button class="ai-history-clear" id="aiHistoryClearAll">清空</button></div>';
  html += '<div class="ai-history-list">';
  history.forEach(function (entry) {
    html += '<div class="ai-history-item" data-id="' + entry.id + '">' +
      '<div class="ai-history-item-info">' +
        '<div class="ai-history-item-title" id="hist-title-' + entry.id + '">' + _escapeHtml(entry.title) + '</div>' +
        '<div class="ai-history-item-meta">' + (entry.mode === 'agent' ? '🤖 Agent' : '🗣️ Chat') + ' · ' + entry.time + '</div>' +
      '</div>' +
      '<div class="ai-history-item-actions">' +
        '<button class="ai-history-item-btn" data-rename="' + entry.id + '" title="重命名">✏️</button>' +
        '<button class="ai-history-item-btn" data-export="' + entry.id + '" title="导出">⤴️</button>' +
        '<button class="ai-history-item-btn del" data-del="' + entry.id + '" title="删除">✕</button>' +
      '</div>' +
    '</div>';
  });
  html += '</div>';
  panel.innerHTML = html;

  panel.querySelectorAll('.ai-history-item').forEach(function (item) {
    item.addEventListener('click', function (e) {
      if (e.target.closest('.ai-history-item-btn')) return;
      _loadHistoryEntry(Number(item.dataset.id));
    });
  });

  panel.querySelectorAll('[data-rename]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      const id = Number(btn.dataset.rename);
      const titleEl = document.getElementById('hist-title-' + id);
      if (!titleEl) return;
      const currentTitle = titleEl.textContent;
      const input = document.createElement('input');
      input.type = 'text';
      input.value = currentTitle;
      input.className = 'ai-history-rename-input';
      input.maxLength = 40;
      titleEl.replaceWith(input);
      input.focus();
      input.select();

      function commit() {
        const newTitle = input.value.trim() || currentTitle;
        _renameHistoryEntry(id, newTitle);
      }
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { input.value = currentTitle; input.blur(); }
      });
    });
  });

  panel.querySelectorAll('[data-export]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      _exportHistoryEntry(Number(btn.dataset.export));
    });
  });

  panel.querySelectorAll('[data-del]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      _deleteHistoryEntry(Number(btn.dataset.del));
    });
  });

  const clearBtn = document.getElementById('aiHistoryClearAll');
  if (clearBtn) clearBtn.addEventListener('click', _clearAllHistory);
}

function _renameHistoryEntry(id, newTitle) {
  const history = _getHistory();
  const entry = history.find(function (h) { return h.id === id; });
  if (!entry) return;
  entry.title = newTitle;
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  renderHistoryPanel();
}

function _exportHistoryEntry(id) {
  const history = _getHistory();
  const entry = history.find(function (h) { return h.id === id; });
  if (!entry) return;
  const msgs = document.createElement('div');
  msgs.innerHTML = entry.html;
  const text = Array.from(msgs.children)
    .map(function (m) { return '[' + (m.className.replace('ai-message ', '')) + '] ' + m.textContent; })
    .join('\n---\n');
  const blob = new Blob([text], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (entry.title || '对话') + '_' + entry.time + '.txt';
  a.click();
  URL.revokeObjectURL(a.href);
}

export function stopGeneration(abortController) {
  if (abortController) {
    abortController.abort();
  }
}

// ─── Markdown 知识树预览面板 ──────────────────────────

/**
 * 显示 Markdown 预览面板，等待用户确认导入
 * @param {string} markdown - 原始 Markdown 文本
 * @param {string} topic - 主题名称
 * @param {number} nodeCount - 节点数
 * @param {number} contentCount - 含内容的节点数
 * @param {Function} onConfirm - 确认导入回调
 * @param {Function} onCancel - 取消导入回调
 * @param {string} parentId - 可选，插入到的父节点 ID
 */
export function showMarkdownPreview(markdown, topic, nodeCount, contentCount, onConfirm, onCancel, parentId) {
  const existing = document.getElementById('aiMarkdownPreview');
  if (existing) existing.remove();

  const msgs = document.getElementById('aiChatMessages');
  if (!msgs) return;

  let parentLabel = '根级别';
  if (parentId) {
    const pNode = appState.nodeMap ? appState.nodeMap.get(parentId) : null;
    parentLabel = pNode ? '「' + pNode.name + '」下方' : parentId;
  }

  const panel = document.createElement('div');
  panel.id = 'aiMarkdownPreview';
  panel.className = 'ai-md-preview';

  const header = document.createElement('div');
  header.className = 'ai-md-preview-header';
  header.innerHTML = '<span class="ai-md-preview-title">🚀 知识树预览：' + _escapeHtml(topic) + '</span>' +
    '<span class="ai-md-preview-stats">' + nodeCount + ' 个节点 · ' + contentCount + ' 个含内容 · 插入到 ' + _escapeHtml(parentLabel) + '</span>';
  panel.appendChild(header);

  // 预览区域（渲染 Markdown 为简易 HTML）
  const preview = document.createElement('div');
  preview.className = 'ai-md-preview-body';
  preview.innerHTML = _renderMarkdownSimple(markdown);
  panel.appendChild(preview);

  // 操作按钮
  const actions = document.createElement('div');
  actions.className = 'ai-md-preview-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'ai-md-preview-btn cancel';
  cancelBtn.textContent = '取消';
  cancelBtn.addEventListener('click', function () {
    panel.remove();
    if (onCancel) onCancel();
  });

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'ai-md-preview-btn confirm';
  confirmBtn.textContent = '导入到知识图谱';
  confirmBtn.addEventListener('click', async function () {
    confirmBtn.disabled = true;
    confirmBtn.textContent = '导入中...';
    if (onConfirm) await onConfirm();
    panel.remove();
  });

  actions.appendChild(cancelBtn);
  actions.appendChild(confirmBtn);
  panel.appendChild(actions);

  msgs.appendChild(panel);
  msgs.scrollTop = msgs.scrollHeight;
}

/**
 * 简易 Markdown → HTML 渲染（仅支持标题、粗体、斜体、代码块、列表）
 */
function _renderMarkdownSimple(md) {
  let html = _escapeHtml(md);

  // 代码块
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, function (_, lang, code) {
    return '<pre class="md-code-block"><code>' + code + '</code></pre>';
  });

  // 标题（带层级缩进和颜色）
  html = html.replace(/^(#{1,6})\s+(.+)$/gm, function (_, hashes, text) {
    const level = hashes.length;
    const colors = ['#0ff', '#4df', '#8cf', '#abf', '#c9f', '#ddf'];
    const color = colors[Math.min(level - 1, colors.length - 1)];
    const indent = (level - 1) * 20;
    const sizes = ['15px', '14px', '13px', '12px', '12px', '12px'];
    const size = sizes[Math.min(level - 1, sizes.length - 1)];
    return '<div style="color:' + color + ';font-size:' + size + ';font-weight:600;margin:' +
      (level === 1 ? '8px' : '4px') + ' 0 2px ' + indent + 'px;padding-left:6px;border-left:2px solid ' + color + ';">' + text + '</div>';
  });

  // 粗体
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // 斜体
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // 行内代码
  html = html.replace(/`([^`]+)`/g, '<code style="background:rgba(0,255,255,0.1);padding:1px 4px;border-radius:3px;font-size:11px;">$1</code>');
  // 无序列表
  html = html.replace(/^[-*]\s+(.+)$/gm, '<div style="padding-left:16px;">• $1</div>');
  // 有序列表
  html = html.replace(/^\d+\.\s+(.+)$/gm, '<div style="padding-left:16px;">$1</div>');
  // 换行
  html = html.replace(/\n/g, '<br>');

  return html;
}
