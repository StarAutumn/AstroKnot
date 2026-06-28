// ============================================================
//  模块4：非阻塞确认弹窗
//  使用自定义模态框代替原生 confirm，支持更美观的 UI 和更好的用户体验
// ============================================================


/**
 * 显示一个自定义的确认弹窗（非阻塞）
 * 提供"确认"和"取消"两个按钮，并在按下后执行相应的回调函数
 * 按下 Esc 键等同于取消
 *
 * @param {string} message - 要显示的消息内容
 * @param {Function} onConfirm - 用户点击"确认"时执行的回调
 * @param {Function} [onCancel] - 用户点击"取消"或按 Esc 时执行的回调（可选）
 * @param {string} [title] - 弹窗标题（可选，默认自动匹配图标类型）
 */
export function showConfirm(message, onConfirm, onCancel, title) {
  // 移除已经存在的弹窗（避免叠加）
  const existing = document.getElementById('customConfirmModal');
  if (existing) existing.remove();

  const dialogTitle = title || '提示';
  const isClose = dialogTitle.includes('关闭');
  const isDelete = dialogTitle.includes('删除');
  const icon = isClose ? '⏻' : isDelete ? '✕' : '⚡';

  // 创建遮罩层容器
  const overlay = document.createElement('div');
  overlay.id = 'customConfirmModal';
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: var(--modal-overlay); backdrop-filter: blur(12px);
    display: flex; align-items: center; justify-content: center;
    z-index: 10000; font-family: 'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif;
    user-select: none;
  `;

  overlay.innerHTML = `
    <div style="background: var(--panel-bg); backdrop-filter: blur(24px);
                border: 1px solid var(--panel-border); border-radius: var(--panel-radius); width: 380px;
                box-shadow: var(--panel-shadow); overflow: hidden;">
      <div class="confirm-header" style="display:flex;align-items:center;gap:10px;padding:14px 20px;
                  background:var(--header-bg);">
        <span style="font-size:16px;">${icon}</span>
        <span style="color:var(--text-primary);font-size:14px;font-weight:600;flex:1;">${dialogTitle}</span>
        <span class="confirm-close-btn" style="width:26px;height:26px;border-radius:8px;
                  background:rgba(255,255,255,0.06);display:flex;align-items:center;justify-content:center;
                  cursor:pointer;font-size:14px;color:var(--text-secondary);transition:background 0.15s,color 0.15s;"
                  onmouseenter="this.style.background='rgba(196,43,28,0.65)';this.style.color='#fff'"
                  onmouseleave="this.style.background='rgba(255,255,255,0.06)';this.style.color='var(--text-secondary)'"
                  id="confirmCloseXBtn">✕</span>
      </div>
      <div class="panel-accent-line" style="height:2px;background:var(--tech-line);flex-shrink:0;"></div>
      <div style="padding: 16px 20px 4px 20px; color:var(--text-secondary);font-size:13px;line-height:1.6;">
        ${message}
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;padding:14px 20px;">
        <button id="confirmCancelBtn" style="background:rgba(255,255,255,0.06);color:var(--text-primary);
                border:none;padding:6px 20px;border-radius:6px;cursor:pointer;font-size:13px;font-family:inherit;
                min-height:32px;transition:background 0.15s;"
                onmouseenter="this.style.background='var(--btn-hover)'"
                onmouseleave="this.style.background='rgba(255,255,255,0.06)'">取消</button>
        <button id="confirmOkBtn" style="background:var(--accent);color:#06121a;border:none;
                padding:6px 20px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;font-family:inherit;
                min-height:32px;transition:opacity 0.15s;"
                onmouseenter="this.style.opacity='0.85'"
                onmouseleave="this.style.opacity='1'">确定</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  
  // 添加 tabindex 使弹窗能够接收键盘事件
  overlay.setAttribute('tabindex', '0');
  overlay.focus();

  // 移除弹窗的辅助函数
  const remove = () => {
    if (overlay && overlay.parentNode) overlay.remove();
  };

  // 绑定按钮事件（包括右上角 X 按钮）
  const bindClose = (btn) => {
    if (btn) {
      btn.addEventListener('click', () => { remove(); if (onCancel) onCancel(); });
    }
  };
  bindClose(document.getElementById('confirmCancelBtn'));
  bindClose(document.getElementById('confirmCloseXBtn'));

  document.getElementById('confirmOkBtn').addEventListener('click', () => {
    remove();
    if (onConfirm) onConfirm();
  });

  // 按 Esc 键触发取消
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      remove();
      if (onCancel) onCancel();
    }
  });
}

/**
 * 显示自定义输入弹窗（非阻塞）
 * @param {string} message 提示文字
 * @param {string} defaultValue 输入框默认值
 * @param {Function} onConfirm 确认回调，参数为输入值（已 trim）
 * @param {Function} [onCancel] 取消回调（可选）
 */
export function showPrompt(message, defaultValue, onConfirm, onCancel) {
  const existing = document.getElementById('customPromptModal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'customPromptModal';
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: var(--modal-overlay); backdrop-filter: blur(12px);
    display: flex; align-items: center; justify-content: center;
    z-index: 10000; font-family: system-ui, sans-serif;
  `;

  overlay.innerHTML = `
    <div style="background: var(--panel-bg); border: 1px solid var(--panel-border);
                border-radius: var(--panel-radius); width: 380px;
                box-shadow: var(--panel-shadow); overflow: hidden;">
      <div style="display:flex;align-items:center;gap:8px;padding:12px 18px;
                  background:var(--header-bg);">
        <span style="color:var(--text-primary);font-size:14px;font-weight:600;flex:1;">📝 输入</span>
        <span id="promptCloseXBtn" style="width:26px;height:26px;border-radius:8px;
                  background:rgba(255,255,255,0.06);display:flex;align-items:center;justify-content:center;
                  cursor:pointer;font-size:14px;color:var(--text-secondary);transition:background 0.15s,color 0.15s;"
                  onmouseenter="this.style.background='rgba(196,43,28,0.65)';this.style.color='#fff'"
                  onmouseleave="this.style.background='rgba(255,255,255,0.06)';this.style.color='var(--text-secondary)'">✕</span>
      </div>
      <div class="panel-accent-line" style="height:2px;background:var(--tech-line);flex-shrink:0;"></div>
      <div style="padding:16px 18px;">
        <p style="color:var(--text-secondary);font-size:13px;margin:0 0 12px 0;line-height:1.6;">${message}</p>
        <input id="promptInputField" type="text" value="${defaultValue || ''}"
               style="width:100%;background:var(--input-bg);border:1px solid var(--input-border);
                      color:var(--text-primary);padding:8px 12px;border-radius:8px;
                      font-size:13px;margin-bottom:14px;outline:none;font-family:inherit;" autofocus>
        <div style="display:flex;justify-content:flex-end;gap:8px;">
          <button id="promptCancelBtn" style="background:rgba(255,255,255,0.06);color:var(--text-primary);
                  border:none;padding:6px 18px;border-radius:6px;cursor:pointer;font-size:13px;font-family:inherit;
                  transition:background 0.15s;"
                  onmouseenter="this.style.background='var(--btn-hover)'"
                  onmouseleave="this.style.background='rgba(255,255,255,0.06)'">取消</button>
          <button id="promptOkBtn" style="background:var(--accent);color:#06121a;border:none;
                  padding:6px 18px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;font-family:inherit;
                  transition:opacity 0.15s;"
                  onmouseenter="this.style.opacity='0.85'"
                  onmouseleave="this.style.opacity='1'">确定</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  
  overlay.setAttribute('tabindex', '0');
  overlay.focus();
  
  const input = document.getElementById('promptInputField');
  input.focus();
  input.select();

  const remove = () => {
    if (overlay && overlay.parentNode) overlay.remove();
  };

  const cancelH = () => { remove(); if (onCancel) onCancel(); };

  document.getElementById('promptOkBtn').addEventListener('click', () => {
    const val = input.value.trim();
    remove();
    if (onConfirm) onConfirm(val);
  });

  document.getElementById('promptCancelBtn').addEventListener('click', cancelH);
  const closeX = document.getElementById('promptCloseXBtn');
  if (closeX) closeX.addEventListener('click', cancelH);

  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      cancelH();
    } else if (e.key === 'Enter') {
      e.stopPropagation();
      const val = input.value.trim();
      remove();
      if (onConfirm) onConfirm(val);
    }
  });
}