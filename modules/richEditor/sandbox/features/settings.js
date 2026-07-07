// ============================================================
//  sandbox-settings.js — 设置面板模块
//  显示/隐藏设置面板、加载/保存/应用编辑器设置
// ============================================================

const STORAGE_KEY = 'sandbox-ide-settings';

export class SandboxSettings {
  /**
   * @param {import('../core/context.js').SandboxContext} ctx
   */
  constructor(ctx) {
    this._ctx = ctx;
  }

  // ─── 生命周期 ────────────────────────────────────────────

  init() {
    this._ctx.registerAction('settings', () => this.showSettingsPanel());
  }

  destroy() {
    // 无需清理
  }

  // ─── 显示设置面板 ──────────────────────────────────────

  showSettingsPanel() {
    const panel = document.getElementById('sandboxSettingsPanel');
    const monacoEditor = this._ctx.monacoEditor;
    if (!panel || !monacoEditor) return;

    // 加载当前值
    document.getElementById('settingFontSize').value = monacoEditor.getFontSize();
    document.getElementById('settingLineHeight').value = monacoEditor._editor.getOption(window.monaco.editor.EditorOption.lineHeight) || 22;
    document.getElementById('settingTabSize').value = monacoEditor.getTabSize();

    const wrapOn = monacoEditor.isWordWrapEnabled();
    const wrapToggle = document.getElementById('settingWordWrap');
    wrapToggle.classList.toggle('on', wrapOn);
    wrapToggle.dataset.on = wrapOn;

    const minimapOn = monacoEditor.isMinimapEnabled();
    const minimapToggle = document.getElementById('settingMinimap');
    minimapToggle.classList.toggle('on', minimapOn);
    minimapToggle.dataset.on = minimapOn;

    // 空白字符
    let whitespace = false;
    try {
      whitespace = monacoEditor._editor.getOption(window.monaco.editor.EditorOption.renderWhitespace) !== 'none';
    } catch (e) {}
    const wsToggle = document.getElementById('settingWhitespace');
    wsToggle.classList.toggle('on', whitespace);
    wsToggle.dataset.on = whitespace;

    // 绑定 toggle 点击
    panel.querySelectorAll('.sandbox-setting-toggle').forEach(t => {
      t.onclick = () => {
        const on = t.classList.toggle('on');
        t.dataset.on = on;
      };
    });

    // 保存按钮
    const saveBtn = document.getElementById('sandboxSettingsSave');
    saveBtn.onclick = () => this.applySettings();

    // 取消/关闭
    document.getElementById('sandboxSettingsCancel').onclick = () => this.hideSettingsPanel();
    document.getElementById('sandboxSettingsClose').onclick = () => this.hideSettingsPanel();

    panel.classList.add('active');

    // 从 localStorage 加载持久化设置
    this.loadSettings();
  }

  // ─── 隐藏设置面板 ──────────────────────────────────────

  hideSettingsPanel() {
    const panel = document.getElementById('sandboxSettingsPanel');
    if (panel) panel.classList.remove('active');
  }

  // ─── 应用设置 ──────────────────────────────────────────

  applySettings() {
    const monacoEditor = this._ctx.monacoEditor;
    if (!monacoEditor || !monacoEditor._editor) return;

    const fontSize = parseInt(document.getElementById('settingFontSize').value) || 14;
    const lineHeight = parseInt(document.getElementById('settingLineHeight').value) || 22;
    const tabSize = parseInt(document.getElementById('settingTabSize').value) || 2;
    const wordWrap = document.getElementById('settingWordWrap').dataset.on === 'true';
    const minimap = document.getElementById('settingMinimap').dataset.on === 'true';
    const whitespace = document.getElementById('settingWhitespace').dataset.on === 'true';

    monacoEditor._editor.updateOptions({
      fontSize,
      lineHeight,
      tabSize,
      indentSize: tabSize,
      wordWrap: wordWrap ? 'on' : 'off',
      minimap: { enabled: minimap },
      renderWhitespace: whitespace ? 'all' : 'none',
    });

    // 持久化
    const settings = { fontSize, lineHeight, tabSize, wordWrap, minimap, whitespace };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {}

    // 通知状态栏更新
    this._ctx.emit('updateStatusBar');
    this.hideSettingsPanel();
    this._ctx.setStatus('设置已保存');
  }

  // ─── 从 localStorage 加载设置到 UI ────────────────────

  loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      document.getElementById('settingFontSize').value = s.fontSize || 14;
      document.getElementById('settingLineHeight').value = s.lineHeight || 22;
      document.getElementById('settingTabSize').value = s.tabSize || 2;
      const wrapT = document.getElementById('settingWordWrap');
      wrapT.classList.toggle('on', s.wordWrap !== false);
      wrapT.dataset.on = s.wordWrap !== false;
      const mmT = document.getElementById('settingMinimap');
      mmT.classList.toggle('on', s.minimap !== false);
      mmT.dataset.on = s.minimap !== false;
      const wsT = document.getElementById('settingWhitespace');
      wsT.classList.toggle('on', s.whitespace === true);
      wsT.dataset.on = s.whitespace === true;
    } catch (e) {}
  }

  // ─── 应用持久化的编辑器设置（启动时调用） ─────────────

  applyPersistedSettings() {
    const monacoEditor = this._ctx.monacoEditor;
    if (!monacoEditor || !monacoEditor._editor) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      monacoEditor._editor.updateOptions({
        fontSize: s.fontSize || 14,
        lineHeight: s.lineHeight || 22,
        tabSize: s.tabSize || 2,
        indentSize: s.tabSize || 2,
        wordWrap: s.wordWrap !== false ? 'on' : 'off',
        minimap: { enabled: s.minimap !== false },
        renderWhitespace: s.whitespace ? 'all' : 'none',
      });
    } catch (e) {}
  }
}

console.log('[sandbox-settings] 模块已加载');
