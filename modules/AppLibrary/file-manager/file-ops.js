// ============================================================
//  file-manager/file-ops.js — 文件增删改与剪贴板（原型混入）
//  职责：新建文件夹/文件、删除单项与批量删除、重命名、
//  复制/剪切/粘贴、复制路径
//  实现说明：以原型混入（Object.assign(FileManagerApp.prototype, ...)）
//  挂载到 FileManagerApp——方法体通过 this 访问实例状态
//  （this._clipboard / this._selectedItems / this._currentPath 等），
//  与写在 class 体内完全等价；输入/确认对话框与提示由
//  ui-widgets.js 的混入方法提供，刷新仍由 index.js 编排
// ============================================================

export const fileOpsMethods = {
  // ════════════════════════════════════════════════════════════
  //  文件操作
  // ════════════════════════════════════════════════════════════

  async _newFolder() {
    const name = await this._promptInput('新建文件夹', '文件夹名称', '新建文件夹');
    if (!name) return;
    try {
      await window.api.fmCreateItem(this._currentPath, name, 'directory');
      this._refresh();
    } catch (e) {
      this._showToast('创建失败: ' + e.message, 'error');
    }
  },

  async _newFile() {
    const name = await this._promptInput('新建文件', '文件名称', '新建文件.txt');
    if (!name) return;
    try {
      await window.api.fmCreateItem(this._currentPath, name, 'file');
      this._refresh();
    } catch (e) {
      this._showToast('创建失败: ' + e.message, 'error');
    }
  },

  async _deleteItem(name, type) {
    const relPath = this._currentPath ? this._currentPath + '/' + name : name;
    const typeName = type === 'directory' ? '文件夹' : '文件';
    const confirmed = await this._showConfirm(`确定删除${typeName}「${name}」吗？`, '此操作不可撤销。');
    if (!confirmed) return;
    try {
      await window.api.fmDeleteItem(relPath);
      this._selectedItems.delete(name);
      this._refresh();
    } catch (e) {
      this._showToast('删除失败: ' + e.message, 'error');
    }
  },

  /** 批量删除选中项 */
  async _deleteSelected() {
    if (this._selectedItems.size === 0) return;
    const count = this._selectedItems.size;
    const confirmed = await this._showConfirm(
      `确定删除选中的 ${count} 项吗？`,
      '此操作不可撤销。'
    );
    if (!confirmed) return;

    const items = Array.from(this._selectedItems);
    let success = 0, failed = 0;
    for (const name of items) {
      const el = this._content.querySelector(`.fm-item[data-name="${CSS.escape(name)}"]`);
      const type = el?.dataset.type || 'file';
      const relPath = this._currentPath ? this._currentPath + '/' + name : name;
      try {
        await window.api.fmDeleteItem(relPath);
        this._selectedItems.delete(name);
        success++;
      } catch (e) {
        failed++;
      }
    }
    this._refresh();
    if (failed > 0) {
      this._showToast(`删除完成：成功 ${success} 项，失败 ${failed} 项`, 'error');
    } else {
      this._showToast(`已删除 ${success} 项`);
    }
  },

  async _renameItem(name, type) {
    const newName = await this._promptInput('重命名', '新名称', name);
    if (!newName || newName === name) return;
    const relPath = this._currentPath ? this._currentPath + '/' + name : name;
    try {
      await window.api.fmRenameItem(relPath, newName);
      this._selectedItems.delete(name);
      this._selectedItems.add(newName);
      this._refresh();
    } catch (e) {
      this._showToast('重命名失败: ' + e.message, 'error');
    }
  },

  _copy() {
    this._clipboard = {
      action: 'copy',
      _srcPath: this._currentPath,
      items: Array.from(this._selectedItems).map(name => {
        const el = this._content.querySelector(`.fm-item[data-name="${CSS.escape(name)}"]`);
        return { name, type: el?.dataset.type || 'file' };
      })
    };
    this._showToast('已复制 ' + this._clipboard.items.length + ' 项');
  },

  _cut() {
    this._clipboard = {
      action: 'cut',
      _srcPath: this._currentPath,
      items: Array.from(this._selectedItems).map(name => {
        const el = this._content.querySelector(`.fm-item[data-name="${CSS.escape(name)}"]`);
        return { name, type: el?.dataset.type || 'file' };
      })
    };
    this._showToast('已剪切 ' + this._clipboard.items.length + ' 项');
  },

  async _paste() {
    if (!this._clipboard) return;
    try {
      for (const item of this._clipboard.items) {
        const srcPath = this._clipboard._srcPath
          ? this._clipboard._srcPath + '/' + item.name
          : item.name;
        await window.api.fmCopyItem(srcPath, this._currentPath, item.name, this._clipboard.action === 'cut');
      }
      if (this._clipboard.action === 'cut') {
        this._clipboard = null;
      }
      this._refresh();
    } catch (e) {
      this._showToast('粘贴失败: ' + e.message, 'error');
    }
  },

  _copyPath(relPath) {
    navigator.clipboard.writeText('AstroKnot-Data/' + relPath).then(() => {
      this._showToast('已复制路径');
    });
  }
};
