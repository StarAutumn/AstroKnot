import { convertToTraditional, convertToSimplified } from './shared.js';

export function registerCharConvert(editor) {
  try {
    editor.ui.registry.addButton('jian2fan', {
      text: '繁',
      tooltip: '转为繁体',
      onAction: convertToTraditional
    });
  } catch (e) {
    console.error('[TinyMCE] jian2fan 按钮注册失败:', e);
  }

  try {
    editor.ui.registry.addButton('fan2jian', {
      text: '简',
      tooltip: '转为简体',
      onAction: convertToSimplified
    });
  } catch (e) {
    console.error('[TinyMCE] fan2jian 按钮注册失败:', e);
  }
}