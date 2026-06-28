// ============================================================
//  应急备份模块（崩溃/强杀兑底）
//  策略：
//    1. 定时自动备份：按 appState.emergencyBackupInterval 分钟间隔，内容有变化才写
//    2. 退出同步落盘：before-quit 时主进程发 emergency-flush，本模块同步写一次再回应
//    3. 启动恢复：检查 manifest 中 pending 备份，弹窗提示恢复
//  存储：userData/emergency-backups/（系统级持久），每项目只保留最新一份
// ============================================================
import { appState } from './module0_AppState.js';
import { getEmergencySnapshot, restoreEmergencySnapshot, saveCurrentProjectData, renderProjectList } from './module2_TreeData.js';
import { showToast } from './module5_SelectAndEdit.js';

let _timer = null;          // 定时器句柄
let _lastHash = '';         // 上次备份的内容哈希，用于跳过无变化写入
let _isElectron = typeof window !== 'undefined' && window.__ELECTRON__ && window.api;

/**
 * 初始化应急备份：启动恢复检查 + 启动定时器 + 监听退出落盘
 */
export function initEmergencyBackup() {
  if (!_isElectron) return;
  // 启动恢复检查（延迟到 UI 就绪）
  setTimeout(checkAndPromptRecovery, 1500);
  // 启动定时器
  scheduleNext();
  // 监听退出时同步落盘
  window.api.onEmergencyFlush(flushNow);
}

/**
 * 按设置间隔启动下一次定时备份
 */
function scheduleNext() {
  if (_timer) { clearTimeout(_timer); _timer = null; }
  const minutes = Number(appState.emergencyBackupInterval);
  if (!minutes || minutes <= 0) return; // 0=关闭
  const ms = minutes * 60 * 1000;
  _timer = setTimeout(doBackup, ms);
}

/**
 * 执行一次备份（内容无变化则跳过）
 */
async function doBackup() {
  try {
    if (!appState.currentProjectId) { scheduleNext(); return; }
    // 空闲时序列化，避免卡帧
    await idle();
    const snap = getEmergencySnapshot();
    if (!snap) { scheduleNext(); return; }
    const json = JSON.stringify(snap.snapshot);
    const hash = simpleHash(json);
    if (hash === _lastHash) { scheduleNext(); return; } // 无变化跳过
    _lastHash = hash;
    const result = await window.api.emergencySave({
      projectId: snap.projectId,
      projectName: snap.projectName,
      snapshot: snap.snapshot
    });
    if (!result || !result.success) {
      console.warn('[应急备份] 备份失败:', result && result.error);
      _lastHash = ''; // 失败后重置，下次重试
    }
  } catch (e) {
    console.warn('[应急备份] 异常:', e);
    _lastHash = '';
  } finally {
    scheduleNext();
  }
}

/**
 * 退出时同步落盘（before-quit 触发，主进程等 2 秒）
 */
function flushNow() {
  try {
    if (!appState.currentProjectId) { window.api.emergencyFlushReady(); return; }
    const snap = getEmergencySnapshot();
    if (snap) {
      // 正常退出：保存备份但标记 pending=false，避免下次启动弹恢复提示
      // 真正的崩溃（任务管理器强杀/断电）不会触发 before-quit，靠定时备份的 pending=true 兜底
      window.api.emergencySave({
        projectId: snap.projectId,
        projectName: snap.projectName,
        snapshot: snap.snapshot,
        pending: false
      }).then(() => window.api.emergencyFlushReady())
         .catch(() => window.api.emergencyFlushReady());
      return;
    }
  } catch (e) {
    console.warn('[应急备份] 退出落盘异常:', e);
  }
  window.api.emergencyFlushReady();
}

/**
 * 启动时检查待恢复备份并弹窗
 */
async function checkAndPromptRecovery() {
  try {
    const res = await window.api.emergencyList();
    if (!res || !res.list || res.list.length === 0) return;
    showRecoveryDialog(res.list);
  } catch (e) {
    console.warn('[应急备份] 启动恢复检查失败:', e);
  }
}

/**
 * 显示恢复弹窗
 */
function showRecoveryDialog(list) {
  // 防止重复弹窗
  if (document.getElementById('emergencyRecoveryOverlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'emergencyRecoveryOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:100000;display:flex;align-items:center;justify-content:center;font-family:inherit;';
  const dialog = document.createElement('div');
  dialog.style.cssText = 'background:#0f1e26;border:1px solid #2c6e7e;border-radius:10px;padding:20px 24px;max-width:480px;width:90%;color:#aef0ff;box-shadow:0 8px 32px rgba(0,0,0,0.5);';
  const title = document.createElement('div');
  title.style.cssText = 'font-size:15px;font-weight:bold;margin-bottom:6px;color:#5ee8ff;';
  title.textContent = '⚠ 检测到上次异常退出';
  const desc = document.createElement('div');
  desc.style.cssText = 'font-size:12px;line-height:1.6;color:#8fb0c0;margin-bottom:14px;';
  desc.innerHTML = '发现 ' + list.length + ' 个未恢复的项目备份。是否恢复？<br>未恢复的备份将在下次启动继续提示。';
  dialog.appendChild(title);
  dialog.appendChild(desc);
  // 备份列表
  const listEl = document.createElement('div');
  listEl.style.cssText = 'max-height:200px;overflow-y:auto;margin-bottom:14px;';
  list.forEach(item => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:rgba(46,110,126,0.15);border:1px solid #2c6e7e40;border-radius:6px;margin-bottom:6px;font-size:12px;';
    const info = document.createElement('div');
    const time = new Date(item.savedAt);
    const timeStr = time.toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
    info.innerHTML = '<div style="color:#aef0ff;">' + escapeHtml(item.projectName) + '</div><div style="color:#6f8fa0;font-size:11px;margin-top:2px;">备份于 ' + timeStr + '</div>';
    const btn = document.createElement('button');
    btn.textContent = '恢复';
    btn.style.cssText = 'padding:5px 14px;background:rgba(0,255,200,0.15);border:1px solid #2c7a6e;border-radius:4px;color:#5ee8ff;cursor:pointer;font-size:11px;';
    btn.onclick = async () => {
      btn.disabled = true;
      btn.textContent = '恢复中...';
      const r = await window.api.emergencyRestore(item.projectId);
      if (r && r.success) {
        restoreEmergencySnapshot(r.snapshot, r.projectName);
        showToast('已恢复“' + item.projectName + '”的应急备份');
        overlay.remove();
      } else {
        btn.disabled = false;
        btn.textContent = '恢复';
        showToast('恢复失败：' + (r && r.error));
      }
    };
    row.appendChild(info);
    row.appendChild(btn);
    listEl.appendChild(row);
  });
  dialog.appendChild(listEl);
  // 底部按钮
  const btns = document.createElement('div');
  btns.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';
  const ignoreAll = document.createElement('button');
  ignoreAll.textContent = '全部忽略并删除备份';
  ignoreAll.style.cssText = 'padding:7px 14px;background:rgba(255,80,80,0.1);border:1px solid rgba(255,80,80,0.3);border-radius:6px;color:#ff8a8a;cursor:pointer;font-size:12px;';
  ignoreAll.onclick = async () => {
    await window.api.emergencyDismissAll();
    showToast('已忽略并清除全部应急备份');
    overlay.remove();
  };
  const later = document.createElement('button');
  later.textContent = '稍后';
  later.style.cssText = 'padding:7px 14px;background:rgba(255,255,255,0.05);border:1px solid #2c6e7e;border-radius:6px;color:#aef0ff;cursor:pointer;font-size:12px;';
  later.onclick = () => overlay.remove();
  btns.appendChild(ignoreAll);
  btns.appendChild(later);
  dialog.appendChild(btns);
  overlay.appendChild(dialog);
  overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') overlay.remove(); });
  document.body.appendChild(overlay);
}

// ── 工具函数 ──
function idle() {
  return new Promise(resolve => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => resolve(), { timeout: 1000 });
    } else {
      setTimeout(resolve, 50);
    }
  });
}
// 轻量字符串哈希（非加密，仅用于变化检测）
function simpleHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return h + '' + s.length;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/**
 * 设置变更后重置定时器（设置面板调用）
 */
export function resetEmergencyBackupTimer() {
  _lastHash = ''; // 间隔变了，下次强制写一次
  scheduleNext();
}