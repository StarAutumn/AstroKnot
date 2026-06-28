// ============================================================
//  UI / Window.js — 窗口/面板控制
// ============================================================
import { appState } from '../module0_AppState.js';
import { setToggleFullscreen } from './shared.js';

// ============================================================
//  全局窗口开关动画辅助
// ============================================================
export function showWindow(el, displayType) {
  if (!el) return;
  el.classList.remove('window-open', 'window-close');
  el.style.display = displayType || 'flex';
  void el.offsetWidth;
  el.classList.add('window-open');
}
export function hideWindow(el, callback) {
  if (!el) return;
  if (el.style.display === 'none') { if (callback) callback(); return; }
  el.classList.remove('window-open');
  el.classList.add('window-close');
  function onEnd(e) {
    // 仅响应 window-close 动画结束，忽略其他动画（如 window-open 的 fadeIn）
    if (e && e.animationName !== 'winFadeOut') return;
    el.removeEventListener('animationend', onEnd);
    el.classList.remove('window-close');
    el.style.display = 'none';
    if (callback) callback();
  }
  el.addEventListener('animationend', onEnd);
  setTimeout(function () {
    if (el.classList.contains('window-close')) {
      el.removeEventListener('animationend', onEnd);
      el.classList.remove('window-close');
      el.style.display = 'none';
      if (callback) callback();
    }
  }, 220);
}
// 兼容旧代码的全局引用
window._showWindow = showWindow;
window._hideWindow = hideWindow;

// ---------- 左侧编辑器面板最小化 ----------
export function bindMinimizePanel() {
  const btn = document.getElementById('minimizePanelBtn');
  if (!btn) return;
  const content = document.getElementById('panelContent');
  if (!content) return;
  btn.onclick = function () {
    const collapsed = content.classList.contains('collapsed');
    if (collapsed) {
      content.classList.remove('collapsed');
      this.textContent = '─';
    } else {
      content.classList.add('collapsed');
      this.textContent = '□';
    }
  };
}

// ── 帮助模态框（改为打开设置面板的「使用帮助」标签）──
export function bindHelpModal() {
  const helpBtn = document.getElementById('helpBtn');
  if (!helpBtn) return;
  helpBtn.addEventListener('click', () => {
    const gp = window.__glowPopup;
    if (!gp) return;
    // 如果设置已打开，直接切到帮助标签
    if (gp.popup.classList.contains('windowed')) {
      const helpTab = gp.popup.querySelector('.settings-tab[data-tab="help"]');
      if (helpTab) helpTab.click();
      return;
    }
    // 打开设置
    const glowBtn = document.getElementById('toggleNodeGlowBtn');
    if (glowBtn) glowBtn.click();
    // 切到帮助标签
    const helpTab = gp.popup.querySelector('.settings-tab[data-tab="help"]');
    if (helpTab) helpTab.click();
  });
}

// ---------- 全屏 & Tab 隐藏 UI ----------
export function bindFullscreenAndTab() {
  const titleBar = document.getElementById('appTitleBar');
  const fullscreenBtn = document.getElementById('fullscreenBtn');

  /** 更新全屏 UI 状态 */
  function updateFullscreenUI(isFullscreen) {
    // 标题栏
    if (titleBar) {
      titleBar.classList.toggle('fullscreen-hidden', isFullscreen);
    }
    // 按钮图标
    if (fullscreenBtn) {
      fullscreenBtn.textContent = isFullscreen ? '🗖' : '⛶';
      fullscreenBtn.title = isFullscreen ? '窗口化' : '全屏';
    }
  }

  const toggleFn = () => {
    if (window.api?.toggleFullscreen) {
      window.api.toggleFullscreen();
    }
  };
  setToggleFullscreen(toggleFn);
  fullscreenBtn?.addEventListener('click', toggleFn);

  // 自定义事件（浏览器全屏）
  window.addEventListener('fullscreen-change', (e) => {
    updateFullscreenUI(!!e.detail);
  });

  // Electron IPC 全屏状态变化
  window.api?.onFullscreenChange?.((isFullscreen) => {
    updateFullscreenUI(!!isFullscreen);
  });

  // 浏览器原生全屏事件
  document.addEventListener('fullscreenchange', () => {
    updateFullscreenUI(!!document.fullscreenElement);
  });
}

// ==================== AstroKnot 菜单按钮 ====================
(function initAstroKnotMenu() {
  const btn = document.getElementById('astroKnotBtn');
  const menu = document.getElementById('astroKnotMenu');
  if (!btn || !menu) return;

  function hideMenu() {
    if (!menu.classList.contains('show')) return;
    menu.classList.add('hiding');
    menu.addEventListener('animationend', function onEnd() {
      menu.removeEventListener('animationend', onEnd);
      menu.classList.remove('show', 'hiding');
    });
  }

  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    if (menu.classList.contains('show')) {
      hideMenu();
    } else {
      const rect = btn.getBoundingClientRect();
      menu.style.left = rect.left + 'px';
      menu.classList.remove('hiding');
      menu.classList.add('show');
    }
  });

  document.addEventListener('pointerdown', function (e) {
    if (!menu.contains(e.target) && e.target !== btn) {
      hideMenu();
    }
  });

  // 关闭确认（菜单按钮 + 标题栏按钮共用）
  window.requestAppClose = function () {
    const existing = document.getElementById('customCloseModal');
    if (existing) existing.remove();

    const projects = appState.projects || [];

    // 若所有项目都没有节点（未变动 / 新建未创建），直接退出，不弹确认框
    const hasAnyNode = projects.some(p => {
      const tree = p?.data?.methodsTree;
      return tree && Array.isArray(tree.children) && tree.children.length > 0;
    });
    if (!hasAnyNode) {
      if (window.api?.closeApp) window.api.closeApp();
      return;
    }
    let projectListHtml = projects.map(p => {
      const isCurrent = p.id === appState.currentProjectId;
      const name = String(p.name || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      return `<div style="padding:3px 0;${isCurrent ? 'color:#ffd966;' : 'color:#b0e0ff;'}">${isCurrent ? '▶ ' : '&nbsp;&nbsp;'}${name}</div>`;
    }).join('');

    const overlay = document.createElement('div');
    overlay.id = 'customCloseModal';
    overlay.style.cssText =
      'position:fixed;top:0;left:0;width:100%;height:100%;' +
      'background:var(--modal-overlay);backdrop-filter:blur(12px);' +
      'display:flex;align-items:center;justify-content:center;z-index:10000;' +
      'font-family:system-ui,sans-serif;user-select:none;';
    overlay.setAttribute('tabindex', '0');

    overlay.innerHTML = `
      <div style="background:var(--panel-bg);backdrop-filter:blur(24px);
                  border:1px solid var(--panel-border);border-radius:var(--panel-radius);
                  width:400px;box-shadow:var(--panel-shadow);overflow:hidden;">
        <div style="background:var(--header-bg);padding:14px 20px;
                    display:flex;align-items:center;gap:10px;">
          <span style="font-size:18px;">⏻</span>
          <span style="color:var(--text-primary);font-size:14px;font-weight:600;flex:1;">关闭应用程序</span>
          <span id="closeModalX" style="width:26px;height:26px;border-radius:8px;
                    background:rgba(255,255,255,0.06);display:flex;align-items:center;justify-content:center;
                    cursor:pointer;font-size:14px;color:var(--text-secondary);"
                    onmouseenter="this.style.background='rgba(196,43,28,0.65)';this.style.color='#fff'"
                    onmouseleave="this.style.background='rgba(255,255,255,0.06)';this.style.color='var(--text-secondary)'">✕</span>
        </div>
        <div class="panel-accent-line" style="height:2px;background:var(--tech-line);flex-shrink:0;"></div>
        <div style="padding:14px 20px 8px;color:var(--text-secondary);font-size:13px;line-height:1.6;">
          📁 所有网络项目：<div style="max-height:160px;overflow-y:auto;margin-top:6px;">${projectListHtml}</div>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:8px;padding:10px 20px 14px;">
          <button id="closeCancelBtn" style="background:rgba(255,255,255,0.06);color:var(--text-primary);
                  border:none;padding:6px 16px;border-radius:6px;cursor:pointer;font-size:12px;font-family:inherit;
                  min-height:32px;transition:background 0.15s;"
                  onmouseenter="this.style.background='var(--btn-hover)'"
                  onmouseleave="this.style.background='rgba(255,255,255,0.06)'">取消</button>
          <button id="closeNoSaveBtn" style="background:rgba(255,80,80,0.15);color:#ff6b6b;
                  border:1px solid rgba(255,80,80,0.3);padding:6px 16px;border-radius:6px;cursor:pointer;
                  font-size:12px;font-family:inherit;min-height:32px;transition:background 0.15s;"
                  onmouseenter="this.style.background='rgba(255,80,80,0.28)'"
                  onmouseleave="this.style.background='rgba(255,80,80,0.15)'">不保存退出</button>
          <button id="closeSaveBtn" style="background:var(--accent);color:#06121a;border:none;
                  padding:6px 16px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;
                  font-family:inherit;min-height:32px;transition:opacity 0.15s;"
                  onmouseenter="this.style.opacity='0.85'"
                  onmouseleave="this.style.opacity='1'">💾 保存并退出</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);
    overlay.focus();

    const remove = () => { if (overlay.parentNode) overlay.remove(); };
    const doClose = () => { if (window.api?.closeApp) window.api.closeApp(); };

    document.getElementById('closeCancelBtn').addEventListener('click', remove);
    document.getElementById('closeModalX').addEventListener('click', remove);
    document.getElementById('closeNoSaveBtn').addEventListener('click', () => { remove(); doClose(); });

    document.getElementById('closeSaveBtn').addEventListener('click', () => {
      remove();
      // 批量保存，完成后关闭
      import('../module9_FileIO.js').then(mod => {
        mod.saveAllProjects().then(() => {
          setTimeout(doClose, 300);
        });
      }).catch(() => doClose());
    });

    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); remove(); }
    });
  };

  const closeBtn = document.getElementById('closeAstroKnotMenuBtn');
  if (closeBtn) {
    closeBtn.addEventListener('click', window.requestAppClose);
  }
})();

// ==================== 缩放弹出面板切换 ====================
export function bindZoomToggle() {
  const btn = document.getElementById('toggleZoomPanelBtn');
  const popup = document.getElementById('zoomPopup');
  if (!btn || !popup) return;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    popup.classList.toggle('show');
  });

  document.addEventListener('pointerdown', (e) => {
    if (!popup.contains(e.target) && e.target !== btn) {
      popup.classList.remove('show');
    }
  });
}