import { addPinyin } from './shared.js';

export function registerPinyin(editor) {
      try {
        editor.ui.registry.addButton('pinyin', {
          text: '拼',
          tooltip: '汉字注音',
          onAction: addPinyin
        });
      } catch (e) {
        console.error('[TinyMCE] pinyin 按钮注册失败:', e);
      }
}