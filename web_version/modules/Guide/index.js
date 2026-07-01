// ============================================================
//  Guide/index.js — 新手引导入口：交互式操作驱动引导
//  用户每完成一步操作 → 自动检测 → 成功反馈 → 进入下一步
// ============================================================
import { getGuideStateMachine, isGuideCompleted, resetGuide } from './GuideCore.js';
import { GuideOverlay } from './GuideOverlay.js';
import { Guide3D } from './Guide3D.js';
import { isProjectEmpty, createTutorialProject, resetTutorialFlag } from './GuideTutorial.js';
import { hideWindow } from '../UI/Window.js';

let sm = null;
let overlay = null;
let guide3D = null;
let _boundSkip = null;
let _boundKey = null;
let _guideTriggerBtn = null;
let _stepTransitionTimer = null;

// ================================================================
//  公开 API
// ================================================================

/** 启动引导（自动检测空项目并创建教程数据） */
export async function startGuide() {
  try {
    resetTutorialFlag();
    sm = getGuideStateMachine();
    resetGuide();
    sm = getGuideStateMachine();

    // 提前创建 overlay（用于教程创建期间的提示）
    if (!overlay) { overlay = new GuideOverlay(); overlay.mount(); }
    if (!guide3D) { guide3D = new Guide3D(); }

    // 空白项目 → 自动创建教程演示数据
    if (isProjectEmpty()) {
      overlay.highlight(null);
      overlay.updateContent({
        title: '📦 准备教程项目',
        html: '<p style="color:#cde;text-align:center;">正在为你创建演示知识图谱…</p>',
      }, '');
      overlay.updateButtons(true, false, '');
      overlay.setBlockClicks(true);
      overlay.show();

      const ok = await createTutorialProject();
      if (!ok) {
        console.warn('[Guide] 教程项目创建失败，将在空项目中启动引导');
      }
    }

    sm.active = true;
    sm.saveControlsState();
    _bindButtons();
    _bindKeyboard();
    _showStep(sm.currentIndex);
    overlay.show();
  } catch (err) {
    console.error('[Guide] startGuide 异常:', err);
    // 发生任何错误时清理状态
    if (overlay) overlay.hide();
  }
}

/** 首次启动自动弹出 */
export async function startGuideIfNeeded() {
  // 检测是否首次安装：如果是，强制重置教程标记
  let firstRun = false;
  try {
    if (window.api && typeof window.api.checkFirstRun === 'function') {
      firstRun = await window.api.checkFirstRun();
    }
  } catch (_) { /* 非关键路径，失败不影响 */ }
  
  if (firstRun) {
    // 全新安装：清除所有教程标记，确保教程一定弹出
    resetGuide();
  }
  
  if (!isGuideCompleted() && !(getGuideStateMachine().active)) {
    setTimeout(() => startGuide(), 2000);
  }
}

export function destroyGuide() {
  _clearTransition();
  if (sm) { sm.stopDetection(); sm.restoreControls(); sm.destroy(); sm = null; }
  if (overlay) { overlay.destroy(); overlay = null; }
  if (guide3D) { guide3D.destroy(); guide3D = null; }
  _unbindButtons();
  _unbindKeyboard();
}

// ================================================================
//  步骤展示
// ================================================================

function _showStep(index) {
  _clearTransition();
  sm.stopDetection();
  const step = sm.steps[index];
  if (!step) return;

  // 清理上一轮的 3D 元素
  guide3D.cleanup();

  // 执行 beforeShow
  if (step.beforeShow) {
    try { step.beforeShow(overlay, guide3D); } catch (e) { console.warn('[Guide] beforeShow:', e); }
  }

  // 配置 controls
  sm.configureControls();

  // 根据类型渲染界面（气泡始终固定在左侧，target 仅用于 SVG 高亮切窗 + 箭头）
  if (step.type === 'highlight') {
    overlay.highlight(step.target);
    overlay.setBlockClicks(false);
  } else if (step.type === 'modal') {
    overlay.highlight(null);
    overlay.setBlockClicks(true);    // modal 拦截背景点击
  } else {
    // action / 3d
    if (step.target) {
      overlay.highlight(step.target);
    } else {
      overlay.highlight(null);
    }
    overlay.setBlockClicks(false);   // 透传鼠标事件
  }

  // 3D 场景辅助：高亮节点 + 标注
  _setup3DHints(step);

  // 更新气泡
  overlay.updateContent(step, sm.progress);
  overlay.updateButtons(step.type === 'modal', index === sm.totalSteps - 1, step.btnText);

  // action 步骤：启动操作检测
  if (step.type === 'action' && step.waitFor) {
    sm.startDetection(() => {
      _onActionCompleted();
    }, guide3D);
  }
}

/** 为 3D / action 步骤设置场景辅助元素 */
function _setup3DHints(step) {
  try {
    const nodeId = step.highlightFirstNode ? guide3D.getFirstNodeId() : guide3D.getFirstNodeId();
    if (nodeId) {
      guide3D.highlightNode(nodeId);
      const pos = guide3D.getFirstNodePosition();
      if (pos && step.hint3D) {
        guide3D.showIndicator(step.hint3D, pos);
      }
    }
  } catch (e) { /* ignore */ }
}

// ================================================================
//  操作完成 → 成功反馈 → 自动推进
// ================================================================

function _onActionCompleted() {
  sm.stopDetection();
  guide3D.cleanup();

  // 显示成功反馈 0.9s 后自动进下一步
  overlay.showSuccess(() => {
    const hasNext = sm.next();
    if (hasNext) {
      _showStep(sm.currentIndex);
    } else {
      _completeGuide();
    }
  });
}

function _clearTransition() {
  if (_stepTransitionTimer) {
    clearTimeout(_stepTransitionTimer);
    _stepTransitionTimer = null;
  }
}

// ================================================================
//  按钮 & 键盘绑定
// ================================================================

function _bindButtons() {
  if (_boundSkip) return;

  _boundSkip = () => _skipGuide();

  // 用事件委托，因为按钮在 GuideOverlay 内部
  document.addEventListener('click', _delegateBtnClick, true);
}

function _unbindButtons() {
  document.removeEventListener('click', _delegateBtnClick, true);
  _boundSkip = null;
}

function _delegateBtnClick(e) {
  if (!sm || !sm.active) return;
  const target = e.target;

  if (target.id === 'guideSkipBtn' || target.closest('#guideSkipBtn')) {
    e.stopPropagation();
    _skipGuide();
  } else if (target.id === 'guideNextBtn' || target.closest('#guideNextBtn')) {
    e.stopPropagation();
    _nextStepManual();
  }
}

/** 手动点「下一步」（仅 modal 步骤可用） */
function _nextStepManual() {
  if (!sm || !sm.active) return;
  const step = sm.currentStep;
  // modal 步骤允许手动推进
  if (step && step.type === 'modal') {
    sm.stopDetection();
    const hasNext = sm.next();
    if (hasNext) {
      _showStep(sm.currentIndex);
    } else {
      _completeGuide();
    }
  }
}

function _bindKeyboard() {
  if (_boundKey) return;
  _boundKey = (e) => {
    if (!sm || !sm.active) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      _skipGuide();
    }
  };
  document.addEventListener('keydown', _boundKey, true);
}

function _unbindKeyboard() {
  if (_boundKey) {
    document.removeEventListener('keydown', _boundKey, true);
    _boundKey = null;
  }
}

function _skipGuide() {
  if (!sm || !sm.active) return;
  sm.stopDetection();
  sm.skip();
  _completeGuide();
}

function _completeGuide() {
  sm.markCompleted();
  sm.active = false;
  sm.stopDetection();
  sm.restoreControls();
  _unbindButtons();
  _unbindKeyboard();
  _clearTransition();
  guide3D?.cleanup();
  overlay?.hide();
  _showF2Hint();
}

/** 教程完成后弹出轻量 F2 提示（仅首次），8 秒或按 F2 后自动消失 */
function _showF2Hint() {
  const f2Key = `astroknot_f2_hint_shown_v${(window.api && window.api.appVersion) || '0.0.0'}`;
  if (localStorage.getItem(f2Key)) return;
  localStorage.setItem(f2Key, 'true');

  const tip = document.createElement('div');
  tip.id = 'guideF2Hint';
  tip.className = 'guide-f2-hint';
  tip.innerHTML = `💡 试试按 <kbd>F2</kbd> 切换到完整 3D 效果`;
  document.body.appendChild(tip);

  // 入场动画
  requestAnimationFrame(() => tip.classList.add('show'));

  let dismissed = false;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    tip.classList.remove('show');
    setTimeout(() => tip.remove(), 400);
  };

  // 按 F2 自动消失
  const onF2 = (e) => { if (e.key === 'F2') dismiss(); };
  document.addEventListener('keydown', onF2, true);

  // 8 秒后自动消失
  const timer = setTimeout(dismiss, 8000);

  // 点击关闭
  tip.addEventListener('click', () => { clearTimeout(timer); dismiss(); });

  // 清理
  const cleanup = () => {
    clearTimeout(timer);
    document.removeEventListener('keydown', onF2, true);
  };
  tip.addEventListener('transitionend', () => {
    if (!tip.classList.contains('show')) { cleanup(); tip.remove(); }
  });
}

// ================================================================
//  帮助面板中的「进入教程」按钮
// ================================================================

export function initGuide() {
  sm = getGuideStateMachine();
  sm.load();

  // 绑定帮助面板里的「进入教程」按钮
  _guideTriggerBtn = document.getElementById('guideTriggerBtn');
  if (_guideTriggerBtn) {
    _guideTriggerBtn.addEventListener('click', () => {
      if (sm?.active) return;
      try {
        // 关闭原来的帮助模态框（如果有）
        const helpModal = document.getElementById('helpModal');
        if (helpModal) hideWindow(helpModal);
        // 关闭设置弹窗（如果有）
        const settingsPopup = document.getElementById('settingsPopup');
        if (settingsPopup) {
          settingsPopup.classList.remove('windowed', 'maximized');
          if (window.Taskbar) window.Taskbar.removeEditor('settings');
        }

        // 移除可能残留的 F2 提示
        const f2Hint = document.getElementById('guideF2Hint');
        if (f2Hint) f2Hint.remove();

        // 切换到 3D 极简模式
        const st = window.appState;
        if (st) {
          st.is2DView = false;
          st.simple3D = true;
          if (typeof window.toggleSimple3DMode === 'function') {
            window.toggleSimple3DMode(true);
          }
        }

        startGuide();
      } catch (err) {
        console.error('[Guide] 启动失败:', err);
      }
    });
  }
}
