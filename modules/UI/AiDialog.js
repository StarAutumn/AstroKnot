// ============================================================
//  UI / AiDialog.js — AI 浮动对话框（拖拽与自由拉伸）
// ============================================================

// ==================== AI 浮窗拖拽与自由拉伸 ====================
export function initAIFloatingDialog() {
  const dialog = document.getElementById('aiFloatingDialog');
  if (!dialog) return;

  // 点击浮窗任意位置时置顶（始终在最上层）
  dialog.addEventListener('mousedown', function () {
    if (!window._aiZIndex) window._aiZIndex = 100000;
    window._aiZIndex++;
    dialog.style.zIndex = window._aiZIndex;
  });

  // ---------- 拖拽 ----------
  const header = dialog.querySelector('.ai-drag-header');
  let dragX = 0, dragY = 0, dragL = 0, dragT = 0;
  let isDragging = false;

  header.addEventListener('mousedown', (e) => {
    if (e.target.tagName === 'SELECT' || e.target.tagName === 'BUTTON') return;
    e.preventDefault();
    isDragging = true;
    dragL = dialog.offsetLeft;
    dragT = dialog.offsetTop;
    dragX = e.clientX;
    dragY = e.clientY;
    dialog.style.left = dragL + 'px';
    dialog.style.top = dragT + 'px';
    dialog.style.right = 'auto';
    dialog.style.bottom = 'auto';
    document.body.style.userSelect = 'none';
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    dialog.style.left = (dragL + e.clientX - dragX) + 'px';
    dialog.style.top = (dragT + e.clientY - dragY) + 'px';
  });

  window.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      document.body.style.userSelect = '';
    }
  });

  // ---------- 八方向拉伸 ----------
  const handles = dialog.querySelectorAll('.floating-resize-handle');
  let resizing = false;
  let resizeHandle = '';
  let startX = 0, startY = 0;
  let startW = 0, startH = 0;
  let startL = 0, startT = 0;

  handles.forEach(h => {
    h.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      resizing = true;
      resizeHandle = h.getAttribute('data-handle');
      startW = dialog.offsetWidth;
      startH = dialog.offsetHeight;
      startL = dialog.offsetLeft;
      startT = dialog.offsetTop;
      startX = e.clientX;
      startY = e.clientY;
      dialog.style.left = startL + 'px';
      dialog.style.top = startT + 'px';
      dialog.style.right = 'auto';
      dialog.style.bottom = 'auto';
      document.body.style.userSelect = 'none';
      document.body.style.cursor = getComputedStyle(h).cursor;
    });
  });

  window.addEventListener('mousemove', (e) => {
    if (!resizing) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    let newL = startL, newT = startT, newW = startW, newH = startH;

    if (resizeHandle.includes('e')) newW = Math.max(240, startW + dx);
    if (resizeHandle.includes('w')) { newW = Math.max(240, startW - dx); newL = startL + startW - newW; }
    if (resizeHandle.includes('s')) newH = Math.max(200, startH + dy);
    if (resizeHandle.includes('n')) { newH = Math.max(200, startH - dy); newT = startT + startH - newH; }

    dialog.style.left = newL + 'px';
    dialog.style.top = newT + 'px';
    dialog.style.width = newW + 'px';
    dialog.style.height = newH + 'px';
  });

  window.addEventListener('mouseup', () => {
    if (resizing) {
      resizing = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    }
  });
}