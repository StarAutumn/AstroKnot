export const state = {
  tinyEditor: null,
  tinyInitialContent: '',
  tinyEditorId: 'tinymce-editor',

  _tmceEditingFormulaImg: null,

  _tmceLineNumTimer: null,

  tinyImgInput: null,

  tmceImgDragInfo: null,

  _tmceImgCtxMenu: null,
  _tmceImgCtxTarget: null,

  _tmceFileLinkCtxMenu: null,
  _tmceFileLinkCtxTarget: null,

  // 当前正在编辑的 textbox 元素（overlay-images 中的文本框）
  editingTextBox: null,
  editingTextBoxData: null,

  // 画布块交互中（拖拽/缩放/旋转）：期间禁止全文序列化类操作（flush 写盘等），避免掉帧
  overlayInteracting: false
};