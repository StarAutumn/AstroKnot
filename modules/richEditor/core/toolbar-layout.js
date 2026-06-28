// ============================================================
//  richEditor/toolbar-layout.js — 工具栏布局（CSS + 菜单栏 + 折叠按钮）
// ============================================================

export function injectToolbarGridCSS() {
  const styleId = 'tb-grid-style';
  if (document.getElementById(styleId)) return;
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    #toolbarDock {
        min-height: 122px !important;
        transition: min-height 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
      }
      #toolbarDock.collapsed {
        min-height: 10px !important;
      }
    #toolbarDock .tox-toolbar-overlord {
        display: grid !important;
        grid-template-columns: auto auto auto !important;
        background: transparent !important;
        height: 94px !important;
        overflow: hidden !important;
        transition: height 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease !important;
        opacity: 1 !important;
      }
      #toolbarDock.collapsed .tox-toolbar-overlord {
        height: 0 !important;
        opacity: 0 !important;
        transition: height 0.2s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.12s ease !important;
      }
    #toolbarDock .tox-toolbar-overlord .tox-toolbar {
      flex-wrap: wrap !important;
      background: transparent !important;
      padding: 2px 6px !important;
      margin: 0 !important;
      border: none !important;
      justify-content: center;
    }
    #toolbarDock .tox-toolbar-overlord .tox-toolbar:nth-child(1) { grid-column: 1; grid-row: 1; }
    #toolbarDock .tox-toolbar-overlord .tox-toolbar:nth-child(2) { grid-column: 1; grid-row: 2; }
    #toolbarDock .tox-toolbar-overlord .tox-toolbar:nth-child(3) { grid-column: 2; grid-row: 1; }
    #toolbarDock .tox-toolbar-overlord .tox-toolbar:nth-child(4) { grid-column: 2; grid-row: 2; }
    #toolbarDock .tox-toolbar-overlord .tox-toolbar:nth-child(5) { grid-column: 3; grid-row: 1; }
    #toolbarDock .tox-toolbar-overlord .tox-toolbar:nth-child(1)::before,
    #toolbarDock .tox-toolbar-overlord .tox-toolbar:nth-child(3)::before,
    #toolbarDock .tox-toolbar-overlord .tox-toolbar:nth-child(5)::before {
      content: '字体';
      display: block;
      width: 100%;
      font-size: 11px;
      color: #406070;
      padding: 0 4px 2px;
      letter-spacing: 0.5px;
    }
    #toolbarDock .tox-toolbar-overlord .tox-toolbar:nth-child(3)::before { content: '段落'; }
    #toolbarDock .tox-toolbar-overlord .tox-toolbar:nth-child(5)::before { content: '编辑'; }
    #toolbarDock .tox-toolbar-overlord .tox-toolbar:nth-child(1),
    #toolbarDock .tox-toolbar-overlord .tox-toolbar:nth-child(2) {
      padding-right: 10px !important;
      border-right: 1px solid #2c6e7e40 !important;
    }
    #toolbarDock .tox-toolbar-overlord .tox-toolbar:nth-child(3),
    #toolbarDock .tox-toolbar-overlord .tox-toolbar:nth-child(4) {
      padding-right: 10px !important;
      border-right: 1px solid #2c6e7e40 !important;
    }
    #toolbarDock .tox-toolbar-overlord .tox-toolbar:nth-child(5) {
      padding-right: 10px !important;
      border-right: 1px solid #2c6e7e40 !important;
    }
    /* ─── 折叠按钮 ─── */
    #toolbarDock .tb-toggle-bar {
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 1px 0;
      cursor: pointer;
      user-select: none;
      border-top: 1px solid #2c6e7e20;
      margin-top: 2px;
    }
    #toolbarDock .tb-toggle-bar:hover {
      background: #2c6e7e0a;
    }
    #toolbarDock .tb-toggle-btn {
      font-size: 11px;
      color: #507080;
      letter-spacing: 0.3px;
      display: inline-flex;
      align-items: center;
      gap: 3px;
    }
    #toolbarDock .tb-toggle-btn .tb-toggle-arrow {
      display: inline-block;
      transition: transform 0.3s ease;
    }
    #toolbarDock.collapsed .tb-toggle-btn .tb-toggle-arrow {
      transform: rotate(180deg);
    }
    /* ─── 缩小按钮 ─── */
    #toolbarDock .tox-tbtn {
      height: 26px !important;
      min-width: 26px !important;
      font-size: 11px !important;
      padding: 0 3px !important;
      margin: 0 !important;
    }
    #toolbarDock .tox-tbtn--select {
      padding: 0 2px !important;
    }
    #toolbarDock .tox-tbtn.tox-tbtn--select.tox-tbtn--bespoke[data-mce-name="fontsize"],
    #toolbarDock .tox-tbtn.tox-tbtn--select.tox-tbtn--bespoke[aria-label*="字体大小"] {
      min-width: 38px !important;
      max-width: 50px !important;
      width: 48px !important;
      overflow: hidden !important;
    }
    #toolbarDock .tox-tbtn.tox-tbtn--select.tox-tbtn--bespoke[data-mce-name="fontsize"] .tox-tbtn__select-label,
    #toolbarDock .tox-tbtn.tox-tbtn--select.tox-tbtn--bespoke[aria-label*="字体大小"] .tox-tbtn__select-label {
      max-width: 32px !important;
      min-width: 32px !important;
      padding: 0 !important;
      font-size: 11px;
    }
    #toolbarDock .tox-tbtn__select-label {
      font-size: 11px !important;
      line-height: 24px !important;
    }
    #toolbarDock .tox-toolbar__group {
      padding: 1px 0 !important;
      margin: 0 1px !important;
    }
    #toolbarDock .tox-split-button {
      height: 26px !important;
    }
    /* ─── 顶部菜单栏 ─── */
    #toolbarDock .tb-menubar {
      display: flex;
      align-items: center;
      height: 28px;
      padding: 0 4px;
      border-bottom: 1px solid #2c6e7e25;
      margin-bottom: 2px;
    }
    #toolbarDock .tb-menubar-tab {
      font-size: 12px;
      color: #5a7a8a;
      font-weight: 500;
      padding: 0 8px;
      cursor: pointer;
      letter-spacing: 0.5px;
      line-height: 26px;
      border-radius: 3px 3px 0 0;
      user-select: none;
      transition: color 0.15s, background 0.15s;
    }
    #toolbarDock .tb-menubar-tab:hover {
      background: #2c6e7e12;
      color: #7fc1d0;
    }
    #toolbarDock .tb-menubar-tab--active {
      color: #8ad4e6;
      font-weight: 600;
      background: #2c6e7e18;
      border-bottom: 2px solid #4fc3f7;
    }
    #toolbarDock .tb-menubar-sep {
      width: 1px;
      height: 16px;
      background: #2c6e7e30;
      margin: 0 4px;
    }
    #toolbarDock .tb-menubar-btn {
      font-size: 13px;
      color: #406070;
      padding: 2px 5px;
      cursor: pointer;
      border-radius: 3px;
      line-height: 20px;
      user-select: none;
    }
    #toolbarDock .tb-menubar-btn:hover {
      background: #2c6e7e15;
    }
    /* ─── Tab 切换：默认（开始）显示 1-6 行 ─── */
    #toolbarDock.tb-tab-home .tox-toolbar-overlord .tox-toolbar:nth-child(n+6) { display: none !important; }
    /* ─── Tab 切换：插入显示第 6 行，双列 ─── */
    #toolbarDock.tb-tab-insert .tox-toolbar-overlord .tox-toolbar { display: none !important; }
    #toolbarDock.tb-tab-insert .tox-toolbar-overlord .tox-toolbar:nth-child(6) { display: flex !important; flex-wrap: wrap !important; }
    #toolbarDock.tb-tab-insert .tox-toolbar-overlord {
      grid-template-columns: 1fr !important;
    }
    #toolbarDock.tb-tab-insert .tox-toolbar-overlord .tox-toolbar:nth-child(6) {
      grid-column: 1 !important;
      align-self: flex-start !important;
    }
    /* 插入 tab 双列布局：按 .tox-toolbar__group 分列 */
    #toolbarDock.tb-tab-insert .tox-toolbar:nth-child(6) {
      flex-direction: row !important;
      gap: 0 16px !important;
      padding-top: 18px !important;
      position: relative !important;
    }
    #toolbarDock.tb-tab-insert .tox-toolbar:nth-child(6) > .tox-toolbar__group {
      flex-direction: row !important;
      flex-wrap: wrap !important;
      align-items: flex-start !important;
      align-content: flex-start !important;
      max-width: calc(50% - 8px) !important;
    }
    /* 插入标签标题：左列 - 文字层插入 */
    #toolbarDock.tb-tab-insert .tox-toolbar:nth-child(6)::before {
      content: '文字层插入';
      position: absolute;
      top: 0;
      left: 6px;
      font-size: 11px;
      color: #406070;
      letter-spacing: 0.5px;
      white-space: nowrap;
    }
    /* 插入标签标题：右列 - Overlay层自由插入 */
    #toolbarDock.tb-tab-insert .tox-toolbar:nth-child(6)::after {
      content: 'Overlay层自由插入';
      position: absolute;
      top: 0;
      left: 50%;
      font-size: 11px;
      color: #406070;
      letter-spacing: 0.5px;
      white-space: nowrap;
    }
    /* 第一列右边框（分界线） */
    #toolbarDock.tb-tab-insert .tox-toolbar:nth-child(6) > .tox-toolbar__group:nth-child(1) {
      padding-right: 10px !important;
      border-right: 1px solid #2c6e7e40 !important;
    }
    /* 第二列左边距 */
    #toolbarDock.tb-tab-insert .tox-toolbar:nth-child(6) > .tox-toolbar__group:nth-child(3) {
      padding-left: 10px !important;
    }
    /* 插入 tab 隐藏 TinyMCE 自带的 | 分隔符 */
    #toolbarDock.tb-tab-insert .tox-toolbar__separator {
      display: none !important;
    }
    /* 插入 tab 按钮：图标在上，文字在下 */
    #toolbarDock.tb-tab-insert .tox-tbtn {
      flex-direction: column !important;
      height: 70px !important;
      min-height: 70px !important;
      min-width: 50px !important;
      padding: 4px 4px 0 !important;
      gap: 2px !important;
      align-items: center !important;
      justify-content: flex-start !important;
    }
    #toolbarDock.tb-tab-insert .tox-tbtn svg,
    #toolbarDock.tb-tab-insert .tox-tbtn img {
      width: 28px !important;
      height: 28px !important;
      flex-shrink: 0 !important;
    }
    #toolbarDock.tb-tab-insert .tox-tbtn .tox-icon {
      width: 28px !important;
      height: 28px !important;
      flex-shrink: 0 !important;
    }
    /* 按钮文字：图标→文字→箭头（参考 Word 风格） */
    #toolbarDock.tb-tab-insert .tox-tbtn .tox-tbtn__select-label {
      font-size: 10px !important;
      line-height: 1.3 !important;
      text-align: center !important;
      display: block !important;
      width: 100% !important;
      margin: 0 !important;
      order: 2 !important;
    }
    /* 箭头排在最下面 */
    #toolbarDock.tb-tab-insert .tox-tbtn .tox-tbtn__select-chevron {
      order: 3 !important;
      margin-top: auto !important;
      padding-top: 2px !important;
    }
    #toolbarDock.tb-tab-insert .tox-tbtn .tox-tbtn__select-chevron svg {
      width: 10px !important;
      height: 10px !important;
    }
    /* ─── Tab 切换：审阅显示第 7 行 ─── */
    #toolbarDock.tb-tab-review .tox-toolbar-overlord .tox-toolbar { display: none !important; }
    #toolbarDock.tb-tab-review .tox-toolbar-overlord .tox-toolbar:nth-child(7) { display: flex !important; }
    #toolbarDock.tb-tab-review .tox-toolbar-overlord {
      grid-template-columns: 1fr !important;
    }
    #toolbarDock.tb-tab-review .tox-toolbar-overlord .tox-toolbar:nth-child(7) {
      grid-column: 1 !important;
      align-self: center !important;
    }
    #toolbarDock.tb-tab-review .tox-toolbar-overlord .tox-toolbar:nth-child(7)::before {
      content: '审阅';
      display: block;
      width: 100%;
      font-size: 11px;
      color: #406070;
      padding: 0 4px 2px;
      letter-spacing: 0.5px;
    }
    /* ─── Tab 切换：布局显示第 8 行，单列 ─── */
    #toolbarDock.tb-tab-layout .tox-toolbar-overlord .tox-toolbar { display: none !important; }
    #toolbarDock.tb-tab-layout .tox-toolbar-overlord .tox-toolbar:nth-child(8) { display: flex !important; }
    #toolbarDock.tb-tab-layout .tox-toolbar-overlord {
      grid-template-columns: 1fr !important;
    }
    #toolbarDock.tb-tab-layout .tox-toolbar-overlord .tox-toolbar:nth-child(8) {
      grid-column: 1 !important;
      align-self: center !important;
    }
    #toolbarDock.tb-tab-layout .tox-toolbar-overlord .tox-toolbar:nth-child(8)::before {
      content: '布局';
      display: block;
      width: 100%;
      font-size: 11px;
      color: #406070;
      padding: 0 4px 2px;
      letter-spacing: 0.5px;
    }
    /* ─── Tab 切换：图形格式显示第 9 行 ─── */
    #toolbarDock.tb-tab-shapeformat .tox-toolbar-overlord .tox-toolbar { display: none !important; }
    #toolbarDock.tb-tab-shapeformat .tox-toolbar-overlord .tox-toolbar:nth-child(9) { display: flex !important; }
    #toolbarDock.tb-tab-shapeformat .tox-toolbar-overlord {
      grid-template-columns: 1fr !important;
    }
    #toolbarDock.tb-tab-shapeformat .tox-toolbar-overlord .tox-toolbar:nth-child(9) {
      grid-column: 1 !important;
      align-self: center !important;
    }
    #toolbarDock.tb-tab-shapeformat .tox-toolbar-overlord .tox-toolbar:nth-child(9)::before {
      content: '图形格式';
      display: block;
      width: 100%;
      font-size: 11px;
      color: #406070;
      padding: 0 4px 2px;
      letter-spacing: 0.5px;
    }
    /* ─── 图形格式 tab 高亮 ─── */
    #toolbarDock .tb-menubar-tab[data-tab="图形格式"] {
      display: none;
    }
    #toolbarDock.tb-show-shapeformat .tb-menubar-tab[data-tab="图形格式"] {
      display: inline-block;
    }
    /* ─── Tab 切换：其他 tab 显示开发中提示 ─── */
    #toolbarDock.tb-tab-other .tox-toolbar-overlord { display: none !important; }
    #toolbarDock.tb-tab-other .tb-other-placeholder {
      display: flex !important;
    }
    /* ─── Tab 切换：视图显示第 11 行 ─── */
    #toolbarDock.tb-tab-view .tox-toolbar-overlord .tox-toolbar { display: none !important; }
    #toolbarDock.tb-tab-view .tox-toolbar-overlord .tox-toolbar:nth-child(11) { display: flex !important; }
    #toolbarDock.tb-tab-view .tb-other-placeholder { display: none !important; }
    #toolbarDock.tb-tab-view .tox-toolbar-overlord {
      grid-template-columns: 1fr !important;
    }
    #toolbarDock.tb-tab-view .tox-toolbar-overlord .tox-toolbar:nth-child(11) {
      grid-column: 1 !important;
      align-self: center !important;
    }
    /* 视图 Tab 按钮竖排（和插入工具栏一致） */
    #toolbarDock.tb-tab-view .tox-tbtn {
      flex-direction: column !important;
      height: 70px !important;
      min-height: 70px !important;
      min-width: 50px !important;
      padding: 4px 4px 0 !important;
      gap: 2px !important;
      align-items: center !important;
      justify-content: flex-start !important;
    }
    #toolbarDock.tb-tab-view .tox-tbtn svg,
    #toolbarDock.tb-tab-view .tox-tbtn img {
      width: 28px !important;
      height: 28px !important;
      flex-shrink: 0 !important;
    }
    #toolbarDock.tb-tab-view .tox-tbtn .tox-icon {
      width: 28px !important;
      height: 28px !important;
      flex-shrink: 0 !important;
    }
    /* ─── Tab 切换：绘图显示第 10 行 ─── */
    #toolbarDock.tb-tab-draw .tox-toolbar-overlord .tox-toolbar { display: none !important; }
    #toolbarDock.tb-tab-draw .tox-toolbar-overlord .tox-toolbar:nth-child(10) { display: flex !important; }
    #toolbarDock.tb-tab-draw .tox-toolbar-overlord {
      grid-template-columns: 1fr !important;
    }
    #toolbarDock.tb-tab-draw .tox-toolbar-overlord .tox-toolbar:nth-child(10) {
      grid-column: 1 !important;
      align-self: center !important;
    }
    #toolbarDock.tb-tab-draw .tox-toolbar-overlord .tox-toolbar:nth-child(10)::before {
      content: '绘图工具';
      display: block;
      width: 100%;
      font-size: 11px;
      color: #406070;
      padding: 0 4px 2px;
      letter-spacing: 0.5px;
    }
    #toolbarDock.tb-tab-draw .tox-tbtn {
      height: 40px !important;
      min-width: 40px !important;
      padding: 3px 5px !important;
    }
    #toolbarDock.tb-tab-draw .tox-tbtn svg {
      width: 24px !important;
      height: 24px !important;
    }
    /* ─── 其他 tab 开发中占位 ─── */
    #toolbarDock .tb-other-placeholder {
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 94px;
      color: #607888;
      user-select: none;
      overflow: hidden;
      opacity: 1;
      transition: height 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease;
    }
    #toolbarDock.collapsed .tb-other-placeholder {
      height: 0 !important;
      opacity: 0 !important;
      transition: height 0.2s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.12s ease;
    }
    #toolbarDock .tb-other-placeholder-icon {
      font-size: 28px;
      margin-bottom: 6px;
      opacity: 0.5;
    }
    #toolbarDock .tb-other-placeholder-text {
      font-size: 13px;
      font-weight: 500;
      letter-spacing: 0.5px;
    }
    #toolbarDock .tb-other-placeholder-sub {
      font-size: 11px;
      color: #8a9faa;
      margin-top: 3px;
    }
  `;
  document.head.appendChild(style);
}

export function injectToggleButton() {
  const dock = document.getElementById('toolbarDock');
  if (!dock) return;
  if (dock.querySelector('.tb-toggle-bar')) return;

  const bar = document.createElement('div');
  bar.className = 'tb-toggle-bar';
  bar.innerHTML = '<span class="tb-toggle-btn"><span class="tb-toggle-arrow">▲</span> 收起工具栏</span>';
  bar.addEventListener('click', function () {
    dock.classList.toggle('collapsed');
    const btn = bar.querySelector('.tb-toggle-btn');
    btn.lastChild.textContent = dock.classList.contains('collapsed') ? ' 展开工具栏' : ' 收起工具栏';
  });
  dock.appendChild(bar);
}

export function injectMenuBar() {
  const dock = document.getElementById('toolbarDock');
  if (!dock) return;
  if (dock.querySelector('.tb-menubar')) return;

  const bar = document.createElement('div');
  bar.className = 'tb-menubar';
  const tabs = ['开始','插入','绘图','设计','布局','引用','审阅','视图','图形格式'];
  bar.innerHTML =
    '<span class="tb-menubar-btn" data-cmd="undo">↩</span>' +
    '<span class="tb-menubar-btn" data-cmd="redo">↪</span>' +
    '<span class="tb-menubar-sep"></span>' +
    tabs.map(function(t) {
      return '<span class="tb-menubar-tab' + (t === '开始' ? ' tb-menubar-tab--active' : '') + '" data-tab="' + t + '">' + t + '</span>';
    }).join('');

  if (typeof tinymce !== 'undefined') {
    const editor = tinymce.activeEditor;
    if (editor) {
      bar.querySelector('[data-cmd="undo"]').onclick = function () {
        if (editor && editor.undoManager) editor.undoManager.undo();
      };
      bar.querySelector('[data-cmd="redo"]').onclick = function () {
        if (editor && editor.undoManager) editor.undoManager.redo();
      };
    }
  }

  bar.querySelectorAll('.tb-menubar-tab').forEach(function(el) {
    el.addEventListener('click', function() {
      var tab = el.getAttribute('data-tab');
      bar.querySelectorAll('.tb-menubar-tab').forEach(function(t) { t.classList.remove('tb-menubar-tab--active'); });
      el.classList.add('tb-menubar-tab--active');

      dock.classList.remove('tb-tab-home', 'tb-tab-insert', 'tb-tab-draw', 'tb-tab-layout', 'tb-tab-other', 'tb-tab-shapeformat', 'tb-tab-view', 'tb-tab-review');
      if (tab === '开始') {
        dock.classList.add('tb-tab-home');
      } else if (tab === '插入') {
        dock.classList.add('tb-tab-insert');
      } else if (tab === '绘图') {
        dock.classList.add('tb-tab-draw');
      } else if (tab === '布局') {
        dock.classList.add('tb-tab-layout');
      } else if (tab === '图形格式') {
        dock.classList.add('tb-tab-shapeformat');
      } else if (tab === '视图') {
        dock.classList.add('tb-tab-view');
      } else if (tab === '审阅') {
        dock.classList.add('tb-tab-review');
      } else {
        dock.classList.add('tb-tab-other');
        var ph = dock.querySelector('.tb-other-placeholder');
        if (ph) {
          ph.querySelector('.tb-other-placeholder-text').textContent = '「' + tab + '」功能正在开发中';
          ph.querySelector('.tb-other-placeholder-sub').textContent = '敬请期待';
        }
      }
    });
  });

  dock.classList.add('tb-tab-home');

  // 注入"开发中"占位元素
  if (!dock.querySelector('.tb-other-placeholder')) {
    var ph = document.createElement('div');
    ph.className = 'tb-other-placeholder';
    ph.innerHTML =
      '<div class="tb-other-placeholder-icon">🚧</div>' +
      '<div class="tb-other-placeholder-text">功能正在开发中</div>' +
      '<div class="tb-other-placeholder-sub">敬请期待</div>';
    dock.appendChild(ph);
  }

  if (dock.firstChild) {
    dock.insertBefore(bar, dock.firstChild);
  } else {
    dock.appendChild(bar);
  }
}

// ── 切换到图形格式 tab（选中形状/文本框时调用） ──
export function switchToShapeFormatTab() {
  const dock = document.getElementById('toolbarDock');
  if (!dock) return;
  dock.classList.add('tb-show-shapeformat');
  dock.classList.remove('tb-tab-home', 'tb-tab-insert', 'tb-tab-layout', 'tb-tab-other', 'tb-tab-shapeformat', 'tb-tab-view', 'tb-tab-draw', 'tb-tab-review');
  dock.classList.add('tb-tab-shapeformat');
  const tab = dock.querySelector('.tb-menubar-tab[data-tab="图形格式"]');
  if (tab) {
    dock.querySelectorAll('.tb-menubar-tab').forEach(function(t) { t.classList.remove('tb-menubar-tab--active'); });
    tab.classList.add('tb-menubar-tab--active');
  }
}

// ── 隐藏图形格式 tab（取消选中时调用） ──
export function hideShapeFormatTab() {
  const dock = document.getElementById('toolbarDock');
  if (!dock) return;
  dock.classList.remove('tb-show-shapeformat');
  // 如果当前在图形格式 tab，切回开始
  if (dock.classList.contains('tb-tab-shapeformat')) {
    dock.classList.remove('tb-tab-shapeformat');
    dock.classList.add('tb-tab-home');
    const homeTab = dock.querySelector('.tb-menubar-tab[data-tab="开始"]');
    if (homeTab) {
      dock.querySelectorAll('.tb-menubar-tab').forEach(function(t) { t.classList.remove('tb-menubar-tab--active'); });
      homeTab.classList.add('tb-menubar-tab--active');
    }
  }
}