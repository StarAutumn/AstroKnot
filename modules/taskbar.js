// ============================================================
//  taskbar.js — 底部固定任务栏：多进程管理
// ============================================================

let _openItems = [];
let _taskbarDragIdx = -1;
let _taskbarLastTarget = -1;
let _tabCtxMenu = null;
let _tabCtxMenuTarget = null;

// 创建任务栏右键菜单（只创建一次）
function _ensureCtxMenu() {
    if (_tabCtxMenu) return;
    _tabCtxMenu = document.createElement('div');
    _tabCtxMenu.className = 'taskbar-ctx-menu';
    _tabCtxMenu.innerHTML = `
        <button data-action="close" class="taskbar-ctx-close">✕ 关闭</button>
    `;
    _tabCtxMenu.style.display = 'none';
    document.body.appendChild(_tabCtxMenu);

    // 点击菜单之外的任何地方关闭
    document.addEventListener('click', function () {
        _hideCtxMenu();
    });

    // 菜单项点击处理
    _tabCtxMenu.addEventListener('click', function (e) {
        e.stopPropagation();
        var btn = e.target.closest('button');
        if (!btn || !_tabCtxMenuTarget) return;
        var action = btn.dataset.action;
        var t = _tabCtxMenuTarget;
        _hideCtxMenu();

        if (action === 'close') {
            if (typeof t.close === 'function') t.close();
        }
    });
}

function _showCtxMenu(item, anchorEl) {
    _ensureCtxMenu();
    _tabCtxMenuTarget = item;

    // 先显示但透明，获取菜单实际高度
    _tabCtxMenu.style.display = 'flex';
    _tabCtxMenu.style.opacity = '0';
    _tabCtxMenu.style.transform = 'translateY(8px) scaleY(0.6)';
    _tabCtxMenu.style.transformOrigin = 'bottom center';
    void _tabCtxMenu.offsetHeight; // 强制回流以获取尺寸

    var rect = anchorEl.getBoundingClientRect();
    var menuH = _tabCtxMenu.offsetHeight;
    var menuW = _tabCtxMenu.offsetWidth;
    var left = rect.left + (rect.width - menuW) / 2;

    // 不超出屏幕左右边界
    if (left < 8) left = 8;
    if (left + menuW > window.innerWidth - 8) left = window.innerWidth - 8 - menuW;

    _tabCtxMenu.style.left = left + 'px';
    // 在任务栏上方弹出
    _tabCtxMenu.style.top = (rect.top - menuH - 6) + 'px';

    // 执行展开动画
    requestAnimationFrame(function () {
        _tabCtxMenu.style.transition = 'opacity 0.18s ease-out, transform 0.18s ease-out';
        _tabCtxMenu.style.opacity = '1';
        _tabCtxMenu.style.transform = 'translateY(0) scaleY(1)';
    });
}

function _hideCtxMenu() {
    if (!_tabCtxMenu) return;
    _tabCtxMenu.style.transition = 'opacity 0.12s ease-in, transform 0.12s ease-in';
    _tabCtxMenu.style.opacity = '0';
    _tabCtxMenu.style.transform = 'translateY(4px) scaleY(0.8)';
    _tabCtxMenu.addEventListener('transitionend', function handler() {
        _tabCtxMenu.removeEventListener('transitionend', handler);
        _tabCtxMenu.style.display = 'none';
        _tabCtxMenu.style.transition = '';
    });
    _tabCtxMenuTarget = null;
}

/** 检测是否为图片路径 */
function _isImagePath(icon) {
    if (!icon || typeof icon !== 'string') return false;
    return /\.(png|jpe?g|gif|svg|webp|bmp|ico)$/i.test(icon) ||
           /^https?:\/\//i.test(icon) ||
           /^data:image\//i.test(icon);
}

function _renderItems() {
    let container = document.getElementById('taskbarTabs');
    if (!container) return;
    container.innerHTML = '';

    for (let i = 0; i < _openItems.length; i++) {
        let item = _openItems[i];
        let tabEl = document.createElement('div');
        tabEl.className = 'taskbar-tab';
        if (item.active) {
            tabEl.classList.add('active');
            tabEl.classList.add('focused');
        }

        let icon = document.createElement('span');
        icon.className = 'tab-icon';
        if (_isImagePath(item.icon)) {
            let imgEl = document.createElement('img');
            imgEl.src = item.icon;
            imgEl.alt = item.label || '';
            imgEl.draggable = false;
            icon.appendChild(imgEl);
        } else {
            icon.textContent = item.icon || '📘';
        }

        let label = document.createElement('span');
        label.className = 'tab-label';
        label.textContent = item.label;

        let closeBtn = document.createElement('span');
        closeBtn.className = 'tab-close';
        closeBtn.textContent = '✕';

        tabEl.appendChild(icon);
        tabEl.appendChild(label);
        tabEl.appendChild(closeBtn);

        (function (t) {
            tabEl.addEventListener('click', function (e) {
                if (e.target === closeBtn) return;
                e.stopPropagation();
                if (typeof t.activate === 'function') {
                    t.activate();
                }
            });
            closeBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                if (typeof t.close === 'function') {
                    t.close();
                }
            });
            // 右键菜单
            tabEl.addEventListener('contextmenu', function (e) {
                e.preventDefault();
                e.stopPropagation();
                _showCtxMenu(t, tabEl);
            });
        })(item);

        tabEl.draggable = true;
        tabEl.dataset.editorKey = item.id;

        container.appendChild(tabEl);
    }

    _initTaskbarDragEvents(container);
}

function _initTaskbarDragEvents(container) {
    if (container._taskbarDragInited) return;
    container._taskbarDragInited = true;

    container.addEventListener('dragstart', function (e) {
        const tabEl = e.target.closest('.taskbar-tab');
        if (!tabEl) return;
        const idx = Array.from(container.children).indexOf(tabEl);
        if (idx < 0) return;
        _taskbarDragIdx = idx;
        _taskbarLastTarget = idx;
        tabEl.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', idx);
    });

    container.addEventListener('dragover', function (e) {
        e.preventDefault();
        if (_taskbarDragIdx < 0) return;

        const tabs = Array.from(container.children);
        const cursorX = e.clientX;

        let targetIdx = tabs.length - 1;
        for (let i = 0; i < tabs.length; i++) {
            const rect = tabs[i].getBoundingClientRect();
            if (cursorX < rect.left + rect.width / 2) {
                targetIdx = i;
                break;
            }
        }

        if (targetIdx === _taskbarLastTarget) return;
        _taskbarLastTarget = targetIdx;

        // 推挤式动画：只用 transform 制造间隙，不动 DOM
        _applyTaskbarPush(container, _taskbarDragIdx, targetIdx);
    });

    container.addEventListener('dragleave', function () {
        container.querySelectorAll('.taskbar-tab').forEach(function (el) {
            el.classList.remove('drag-over');
        });
    });

    container.addEventListener('drop', function (e) {
        e.preventDefault();
        if (_taskbarDragIdx < 0) return;
        const from = _taskbarDragIdx;
        let to = _taskbarLastTarget;
        if (to < 0) to = from;
        _taskbarFinalize(container, from, to);
        _taskbarDragIdx = -1;
        _taskbarLastTarget = -1;
        container.querySelectorAll('.taskbar-tab').forEach(function (el) {
            el.classList.remove('dragging', 'drag-over');
        });
    });

    container.addEventListener('dragend', function () {
        _taskbarResetTransforms(container);
        _taskbarDragIdx = -1;
        _taskbarLastTarget = -1;
        container.querySelectorAll('.taskbar-tab').forEach(function (el) {
            el.classList.remove('dragging', 'drag-over');
        });
    });
}

function _applyTaskbarPush(container, fromIdx, targetIdx) {
    const tabs = Array.from(container.children);
    // 先清除上一次的过渡和位移
    for (let i = 0; i < tabs.length; i++) {
        tabs[i].style.transition = 'none';
        tabs[i].style.transform = '';
    }
    if (targetIdx === fromIdx) {
        void container.offsetHeight;
        return;
    }
    const shiftW = tabs[fromIdx].offsetWidth;
    if (targetIdx > fromIdx) {
        // 向右拖：从 fromIdx+1 到 targetIdx 的元素向左推
        for (let i = fromIdx + 1; i <= targetIdx; i++) {
            tabs[i].style.transform = 'translateX(-' + shiftW + 'px)';
        }
    } else {
        // 向左拖：从 targetIdx 到 fromIdx-1 的元素向右推
        for (let i = targetIdx; i < fromIdx; i++) {
            tabs[i].style.transform = 'translateX(' + shiftW + 'px)';
        }
    }
    void container.offsetHeight;
    for (let i = 0; i < tabs.length; i++) {
        tabs[i].style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
    }
}

function _taskbarFinalize(container, fromIdx, targetIdx) {
    const tabs = Array.from(container.children);
    // 清除所有 transform
    for (let i = 0; i < tabs.length; i++) {
        tabs[i].style.transition = 'none';
        tabs[i].style.transform = '';
    }
    void container.offsetHeight;
    if (targetIdx === fromIdx) return;
    // 重排 DOM：把拖拽元素放到目标位置
    const draggedEl = tabs[fromIdx];
    const insertIdx = targetIdx > fromIdx ? targetIdx - 1 : targetIdx;
    container.removeChild(draggedEl);
    if (insertIdx >= container.children.length) {
        container.appendChild(draggedEl);
    } else {
        container.insertBefore(draggedEl, container.children[insertIdx]);
    }
    // 同步更新数组
    const movedObj = _openItems.splice(fromIdx, 1)[0];
    const arrInsert = targetIdx > fromIdx ? targetIdx - 1 : targetIdx;
    _openItems.splice(arrInsert, 0, movedObj);
}

function _taskbarResetTransforms(container) {
    const tabs = Array.from(container.children);
    for (let i = 0; i < tabs.length; i++) {
        tabs[i].style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
        tabs[i].style.transform = '';
    }
}

window.Taskbar = {
    _entries: {},

    addOrUpdateEditor: function (key, config) {
        let existing = this._entries[key];
        if (config.active) {
            for (let k in this._entries) {
                if (k !== key) {
                    this._entries[k].active = false;
                }
            }
        }
        if (existing) {
            existing.label = config.label || existing.label;
            existing.icon = config.icon || existing.icon;
            existing.active = config.active !== undefined ? config.active : existing.active;
            if (config.activate) existing.activate = config.activate;
            if (config.close) existing.close = config.close;
            if (config.maximize) existing.maximize = config.maximize;
            if (config.minimize) existing.minimize = config.minimize;
        } else {
            let entry = {
                id: key,
                icon: config.icon || '📘',
                label: config.label || '',
                active: config.active || false,
                activate: config.activate || function () {},
                close: config.close || function () {},
                maximize: config.maximize || null,
                minimize: config.minimize || null
            };
            this._entries[key] = entry;
            _openItems.push(entry);
        }
        _renderItems();
    },

    removeEditor: function (key) {
        let entry = this._entries[key];
        if (!entry) return;
        let idx = _openItems.indexOf(entry);
        if (idx >= 0) _openItems.splice(idx, 1);
        delete this._entries[key];
        _renderItems();
    },

    setEditorActive: function (key, active) {
        // 兼容旧版单参数调用：setEditorActive(active) → setEditorActive('rich', active)
        if (active === undefined) {
            active = key;
            key = 'rich';
        }
        let entry = this._entries[key];
        if (!entry) return;
        if (active) {
            for (let k in this._entries) {
                if (k !== key) {
                    this._entries[k].active = false;
                }
            }
        }
        entry.active = active;
        _renderItems();
    },

    // 向后兼容：旧版 syncLabel 只管理 'rich' 条目
    syncLabel: function (name, type) {
        this.addOrUpdateEditor('rich', {
            label: name,
            icon: type === 'quicknote' ? '📝' : '📘',
            active: !!name
        });
    },

    clear: function () {
        _openItems = [];
        this._entries = {};
        _renderItems();
    }
};