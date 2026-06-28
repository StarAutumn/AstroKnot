// ============================================================
//  版本自动保存：监听项目保存事件，自动产生版本站点
//  策略：
//    1. 用户主动保存项目（saveAllProjects）→ 派发 'astroknot-project-saved' 事件
//    2. 本模块监听该事件，自动创建 commit
//    3. 若当前 HEAD 在历史站（detached）→ commit 函数自动产生新分支
//    4. 内容无变化则跳过（commit 函数内置去重）
// ============================================================

import { appState } from '../module0_AppState.js';
import { getEmergencySnapshot } from '../module2_TreeData.js';
import { commit as versionCommit, amend as versionAmend, clearCache } from './versionGraph.js';

let _initialized = false;
let _isCommitting = false; // 防止重入

/**
 * 初始化版本自动保存：监听项目保存事件
 */
export function initVersionAutoSave() {
  if (_initialized) return;
  _initialized = true;
  window.addEventListener('astroknot-project-saved', handleProjectSaved);
}

/**
 * 处理项目保存事件：自动创建版本站点
 */
async function handleProjectSaved() {
  if (_isCommitting) return; // 防止重入
  const pid = appState.currentProjectId;
  if (!pid) return;
  _isCommitting = true;
  try {
    const snap = getEmergencySnapshot();
    if (!snap) return;
    // 自动提交，label 默认为空（用户可通过右键重命名设置）
    const result = await versionCommit(pid, snap.snapshot, '');
    // 静默处理：不弹窗，只在控制台记录
    if (result.skipped) {
      console.log('[版本图] 内容无变化，跳过');
    } else {
      console.log('[版本图] 自动保存站点:', result.commitId, '分支:', result.branchName);
    }
    // 通知版本图面板刷新（如果打开着）
    window.dispatchEvent(new CustomEvent('astroknot-version-updated'));
  } catch (e) {
    console.warn('[版本图] 自动保存失败:', e);
  } finally {
    _isCommitting = false;
  }
}

/**
 * 原地更新当前时间点的快照（不新建时间点）
 * 供"自动排列"等纯位置变更操作调用：把结果保存到当前 HEAD commit 里。
 * 若没有任何 commit（首次），则退化为新建 commit。
 * @returns {Promise<void>}
 */
export async function amendCurrent() {
  if (_isCommitting) return;
  const pid = appState.currentProjectId;
  if (!pid) return;
  _isCommitting = true;
  try {
    const snap = getEmergencySnapshot();
    if (!snap) return;
    // 优先 amend 当前 HEAD commit；无 commit 时退化为新建
    const result = await versionAmend(pid, snap.snapshot);
    if (!result) {
      // 还没有任何时间点，退化为新建（首次提交）
      const r = await versionCommit(pid, snap.snapshot, '');
      console.log('[版本图] 首次自动保存站点:', r.commitId, '分支:', r.branchName);
    } else if (result.skipped) {
      console.log('[版本图] 排列后内容无变化，跳过 amend');
    } else {
      console.log('[版本图] 已更新当前时间点:', result.commitId);
    }
    window.dispatchEvent(new CustomEvent('astroknot-version-updated'));
  } catch (e) {
    console.warn('[版本图] amend 失败:', e);
  } finally {
    _isCommitting = false;
  }
}

// microtask 去重：同一次同步调用栈中多次 scheduleAmend 只会执行一次 amendCurrent
let _amendPending = false;
/**
 * 调度一次 amend（microtask 去重）
 * 供自动排列等同步操作末尾调用：即使内部多次触发，也只会在当前同步代码执行完后执行一次。
 */
export function scheduleAmend() {
  if (_amendPending) return;
  _amendPending = true;
  queueMicrotask(async () => {
    _amendPending = false;
    try {
      await amendCurrent();
    } catch (e) {
      console.warn('[版本图] scheduleAmend 执行失败:', e);
    }
  });
}

/**
 * 项目切换时清除版本图缓存
 */
export function onProjectSwitch(oldProjectId) {
  if (oldProjectId) clearCache(oldProjectId);
}
