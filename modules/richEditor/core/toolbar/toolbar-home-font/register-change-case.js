import { changeCase } from './shared.js';

export function registerChangeCase(editor) {
  try {
    editor.ui.registry.addMenuButton('changecase', {
      text: 'Aa',
      tooltip: '更改大小写',
      fetch: function (callback) {
        let items = [
          { type: 'menuitem', text: '全部小写', onAction: function () { changeCase('lower'); } },
          { type: 'menuitem', text: '全部大写', onAction: function () { changeCase('upper'); } },
          { type: 'menuitem', text: '每个单词首字母大写', onAction: function () { changeCase('word'); } },
          { type: 'menuitem', text: '句首字母大写', onAction: function () { changeCase('sentence'); } }
        ];
        callback(items);
      }
    });
  } catch (e) {
    console.error('[TinyMCE] changecase 按钮注册失败:', e);
  }
}