// ============================================================
//  toolbar/toolbar-home-edit.js — 开始 → 编辑区域
// ============================================================

export function registerEditRegion(editor) {
  try {
    editor.ui.registry.addButton('selectall', {
      text: '全选',
      tooltip: '全选',
      onAction: function () {
        editor.execCommand('SelectAll');
      }
    });
  } catch (e) {
    console.error('[TinyMCE] selectall 按钮注册失败:', e);
  }
}