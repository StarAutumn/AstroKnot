// ============================================================
//  UI/Toolbar/index.js — 工具栏协调器
// ============================================================
import { initSettingsPopup } from './settings-popup.js';
import { bindSimpleToolbarButtons } from './toolbar-buttons.js';
import { initVersionMapModal } from './version-map-modal.js';
import { initGitHubLogin } from './github-login.js';
import { showPrompt } from '../../module4_Confirm.js';

export function bindToolbarButtons() {
  // 暴露 showPrompt 给版本图模块使用（避免循环依赖）
  window._showPrompt = showPrompt;

  // ---------- 设置弹窗 ----------
  const glowBtn = document.getElementById('toggleNodeGlowBtn');
  if (glowBtn) {
    initSettingsPopup(glowBtn);
  }

  // ---------- GitHub 登录 ----------
  initGitHubLogin();

  // ---------- 其他工具栏按钮 ----------
  bindSimpleToolbarButtons();

  // ---------- 版本时间线模态框 ----------
  initVersionMapModal();
}
