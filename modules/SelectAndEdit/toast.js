// ============================================================
//  模块5：选中系统与节点编辑操作 —— Toast 轻提示
//  由 module5_SelectAndEdit.js 拆分
// ============================================================
export function showToast(message, duration) {
  // 如果已存在提示，先移除
  const old = document.querySelector('.astronot-toast');
  if (old) old.remove();

  const dur = duration || 2500;
  const toast = document.createElement('div');
  toast.className = 'astronot-toast';
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed; top: calc(var(--titlebar-height, 38px) + 12px); left: 50%; transform: translateX(-50%);
    background: rgba(10,25,40,0.96); backdrop-filter: blur(8px);
    border: 1px solid rgba(0,255,255,0.6); color: #eef;
    padding: 10px 24px; border-radius: 40px;
    font-size: 14px; z-index: 100000;
    max-width: 80vw; max-height: 60vh; overflow: auto; white-space: pre-wrap;
    animation: astronotToastFade ${dur}ms ease forwards;
    pointer-events: none;
  `;

  // 注入动画样式（仅一次）
  if (!document.getElementById('astronot-toast-style')) {
    const style = document.createElement('style');
    style.id = 'astronot-toast-style';
    style.textContent = `
      @keyframes astronotToastFade {
        0% { opacity: 0; transform: translate(-50%, -20px); }
        10% { opacity: 1; transform: translate(-50%, 0); }
        85% { opacity: 1; transform: translate(-50%, 0); }
        100% { opacity: 0; transform: translate(-50%, -20px); }
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), dur + 100);
}
