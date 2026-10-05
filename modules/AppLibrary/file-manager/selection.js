// ============================================================
//  file-manager/selection.js — 拖拽框选（原型混入）
//  职责：文件列表空白处按住左键拖出选框，实时选中与选框
//  相交的文件项，支持 Ctrl 追加多选，松开后清除选框并刷新选中态
//  实现说明：以原型混入（Object.assign(FileManagerApp.prototype, ...)）
//  挂载到 FileManagerApp——方法体通过 this 访问实例状态
//  （this._isSelecting / this._selectionBox / this._selectedItems 等），
//  与写在 class 体内完全等价；mousedown/mousemove/mouseup
//  事件绑定仍由 index.js 的 _bindEvents 统一编排
// ============================================================

export const selectionMethods = {
  // ════════════════════════════════════════════════════════════
  //  拖拽框选
  // ════════════════════════════════════════════════════════════

  _onSelectionStart(e) {
    // 只在空白区域或按住 Ctrl 时启动框选
    if (e.target.closest('.fm-item') && !e.ctrlKey && !e.shiftKey) return;
    if (e.button !== 0) return; // 只响应左键

    const fileList = this._content.querySelector('#fmFileList');
    const rect = fileList.getBoundingClientRect();
    this._isSelecting = true;
    this._selectionStart = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      clientX: e.clientX,
      clientY: e.clientY
    };

    // 如果不是 Ctrl 多选模式，清空现有选择
    if (!e.ctrlKey && !e.shiftKey) {
      this._selectedItems.clear();
      this._updateSelectionUI();
    }

    // 创建选框元素
    const box = document.createElement('div');
    box.className = 'fm-selection-box';
    box.style.left = this._selectionStart.x + 'px';
    box.style.top = this._selectionStart.y + 'px';
    box.style.width = '0';
    box.style.height = '0';
    fileList.appendChild(box);
    this._selectionBox = box;

    e.preventDefault();
  },

  _onSelectionMove(e) {
    if (!this._isSelecting || !this._selectionBox) return;

    const fileList = this._content.querySelector('#fmFileList');
    const rect = fileList.getBoundingClientRect();

    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    const left = Math.min(this._selectionStart.x, currentX);
    const top = Math.min(this._selectionStart.y, currentY);
    const width = Math.abs(currentX - this._selectionStart.x);
    const height = Math.abs(currentY - this._selectionStart.y);

    this._selectionBox.style.left = left + 'px';
    this._selectionBox.style.top = top + 'px';
    this._selectionBox.style.width = width + 'px';
    this._selectionBox.style.height = height + 'px';

    // 实时选中框内的项目
    this._selectItemsInBox(left, top, width, height, e.ctrlKey);
  },

  _onSelectionEnd(e) {
    if (!this._isSelecting) return;
    this._isSelecting = false;

    if (this._selectionBox) {
      this._selectionBox.remove();
      this._selectionBox = null;
    }

    this._updateSelectionUI();
  },

  /** 选中框内的所有项目 */
  _selectItemsInBox(boxLeft, boxTop, boxWidth, boxHeight, isCtrl) {
    const fileList = this._content.querySelector('#fmFileList');
    const items = fileList.querySelectorAll('.fm-item');
    const fileListRect = fileList.getBoundingClientRect();

    // 如果不是 Ctrl 多选，先清空
    if (!isCtrl) {
      this._selectedItems.clear();
    }

    items.forEach(item => {
      const itemRect = item.getBoundingClientRect();
      const itemLeft = itemRect.left - fileListRect.left;
      const itemTop = itemRect.top - fileListRect.top;
      const itemRight = itemLeft + itemRect.width;
      const itemBottom = itemTop + itemRect.height;

      // 检测交集
      const intersects = !(
        itemRight < boxLeft ||
        itemLeft > boxLeft + boxWidth ||
        itemBottom < boxTop ||
        itemTop > boxTop + boxHeight
      );

      if (intersects) {
        this._selectedItems.add(item.dataset.name);
      }
    });
  }
};
