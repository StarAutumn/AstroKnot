// ============================================================
//  toolbar/toolbar-insert.js — 插入 tab
// ============================================================

import { toolbarDock } from '../../dom-refs.js';
import { getCurrentTinyFontColor, clearEditingFormulaImg } from '../../utils.js';
import { openTinyMceCodeEditor } from '../code-blocks.js';
import { insertTinyFile } from '../../images-files.js';
import { openImagePicker, SHAPE_CATEGORIES, SHAPE_LABELS, buildShapeThumbnail, addShape, addTextBox, openVideoPicker, openAudioPicker, addExcel, addChart, insertSlideBreak, startPresentation, addSlideshow, insertOverlayBlock, openDocumentPicker } from '../overlay/index.js';

export function registerInsertTab(editor) {
  try {
    editor.ui.registry.addButton('toolbartoggle', {
      text: '▲',
      tooltip: '展开/折叠工具栏',
      onAction: function () {
        toolbarDock.classList.toggle('tmce-toolbar-collapsed');
        let btn = toolbarDock.querySelector('[data-toolbar-toggle]');
        if (btn) {
          btn.innerHTML = toolbarDock.classList.contains('tmce-toolbar-collapsed') ? '▼' : '▲';
        }
      }
    });
  } catch (e) {
    console.error('[TinyMCE] toolbartoggle 注册失败:', e);
  }

  try {
    editor.ui.registry.addButton('insertTinyImage', {
      icon: 'image',
      text: '插入图片',
      tooltip: '从文件选择插入图片',
      onAction: function () {
        editor.execCommand('mceImage');
      }
    });
  } catch (e) {
    console.error('[TinyMCE] insertTinyImage 注册失败:', e);
  }

  try {
    editor.ui.registry.addButton('customimage', {
      icon: 'gallery',
      text: '浮动图片',
      tooltip: '插入浮动叠加图片',
      onAction: function () {
        openImagePicker();
      }
    });
  } catch (e) {
    console.error('[TinyMCE] customimage 注册失败:', e);
  }

  try {
    editor.ui.registry.addButton('insertOverlayBlock', {
      icon: 'new-document',
      text: '画布块',
      tooltip: '插入画布块（可放置图片、视频、图形等）',
      onAction: function () {
        insertOverlayBlock(editor);
      }
    });
  } catch (e) {
    console.error('[TinyMCE] insertOverlayBlock 注册失败:', e);
  }

  try {
    let allShapeKeys = [];
    Object.keys(SHAPE_CATEGORIES).forEach(function (catKey) {
      Array.prototype.push.apply(allShapeKeys, SHAPE_CATEGORIES[catKey]);
    });
    allShapeKeys.forEach(function (key) {
      editor.ui.registry.addIcon('shape-' + key, buildShapeThumbnail(key));
    });
  } catch (e) {
    console.error('[TinyMCE] shape icons 注册失败:', e);
  }

  try {
    editor.ui.registry.addMenuButton('customshape', {
      icon: 'highlight-bg-color',
      text: '形状',
      tooltip: '形状',
      fetch: function (callback) {
        let catDefs = [
          { key: 'line', title: '线条' },
          { key: 'basic', title: '基本形状' },
          { key: 'arrowBlock', title: '箭头总汇' },
          { key: 'flowchart', title: '流程图' },
          { key: 'starBanner', title: '星与旗帜' },
          { key: 'callout', title: '标注' }
        ];
        let items = catDefs.map(function (cat) {
          return {
            type: 'nestedmenuitem',
            text: cat.title,
            getSubmenuItems: function () {
              return (SHAPE_CATEGORIES[cat.key] || []).map(function (key) {
                return { type: 'menuitem', icon: 'shape-' + key, text: SHAPE_LABELS[key] || key, onAction: function () {
                  addShape(key);
                } };
              });
            }
          };
        });
        callback(items);
      }
    });
  } catch (e) {
    console.error('[TinyMCE] customshape 注册失败:', e);
  }

  try {
    editor.ui.registry.addButton('customtextbox', {
      icon: 'new-document',
      text: '文本框',
      tooltip: '文本框',
      onAction: function () {
        addTextBox();
      }
    });
  } catch (e) {
    console.error('[TinyMCE] customtextbox 注册失败:', e);
  }

  try {
    editor.ui.registry.addIcon('custom-video-icon',
      '<svg width="48" height="48" viewBox="0 0 48 48" fill="#2c6e7e" fill-opacity="0" stroke="#aef0ff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
      '<rect x="4" y="8" width="40" height="32" rx="4" ry="4"/>' +
      '<polygon points="20 16 32 24 20 32" fill="#aef0ff" fill-opacity="0"/>' +
      '</svg>'
    );
    editor.ui.registry.addButton('customvideo', {
      icon: 'custom-video-icon',
      text: '视频',
      tooltip: '视频',
      onAction: function () {
        openVideoPicker();
      }
    });
  } catch (e) {
    console.error('[TinyMCE] customvideo 注册失败:', e);
  }

  try {
    editor.ui.registry.addIcon('custom-audio-icon',
      '<svg width="48" height="48" viewBox="0 0 48 48" fill="#2c6e7e" fill-opacity="0.35" stroke="#aef0ff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M18 36V10l24-4v26"/>' +
      '<circle cx="12" cy="36" r="6" fill="#aef0ff" fill-opacity="1"/>' +
      '<circle cx="36" cy="32" r="6" fill="#aef0ff" fill-opacity="1"/>' +
      '</svg>'
    );
    editor.ui.registry.addButton('customaudio', {
      icon: 'custom-audio-icon',
      text: '音频',
      tooltip: '音频',
      onAction: function () {
        openAudioPicker();
      }
    });
  } catch (e) {
    console.error('[TinyMCE] customaudio 注册失败:', e);
  }

  try {
    editor.ui.registry.addIcon('custom-document-icon',
      '<svg width="48" height="48" viewBox="0 0 48 48" fill="#2c6e7e" fill-opacity="0.35" stroke="#aef0ff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
      '<rect x="8" y="4" width="32" height="40" rx="3"/>' +
      '<line x1="14" y1="14" x2="34" y2="14"/>' +
      '<line x1="14" y1="20" x2="34" y2="20"/>' +
      '<line x1="14" y1="26" x2="28" y2="26"/>' +
      '<line x1="14" y1="32" x2="22" y2="32"/>' +
      '</svg>'
    );
    editor.ui.registry.addButton('customdocument', {
      icon: 'custom-document-icon',
      text: '文档',
      tooltip: '插入文档预览（PDF/Word/PPT）',
      onAction: function () {
        openDocumentPicker();
      }
    });
  } catch (e) {
    console.error('[TinyMCE] customdocument 注册失败:', e);
  }

  try {
    editor.ui.registry.addButton('customlink', {
      icon: 'link',
      text: '文件',
      tooltip: '文件',
      onAction: function () {
        insertTinyFile();
      }
    });
  } catch (e) {
    console.error('[TinyMCE] customlink 注册失败:', e);
  }

  try {
    editor.ui.registry.addIcon('custom-excel-icon',
      '<svg width="48" height="48" viewBox="0 0 48 48" fill="#2c6e7e" fill-opacity="0.35" stroke="#aef0ff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
      '<rect x="6" y="4" width="36" height="40" rx="3" ry="3"/>' +
      '<line x1="6" y1="16" x2="42" y2="16"/>' +
      '<line x1="6" y1="28" x2="42" y2="28"/>' +
      '<line x1="20" y1="4" x2="20" y2="44"/>' +
      '<line x1="34" y1="4" x2="34" y2="44"/>' +
      '</svg>'
    );
    editor.ui.registry.addButton('customexcel', {
      icon: 'custom-excel-icon',
      text: '表格',
      tooltip: '表格',
      onAction: function () {
        addExcel();
      }
    });
  } catch (e) {
    console.error('[TinyMCE] customexcel 注册失败:', e);
  }

  try {
    editor.ui.registry.addIcon('custom-chart-icon',
      '<svg width="48" height="48" viewBox="0 0 48 48" fill="#2c6e7e" fill-opacity="0.35" stroke="#aef0ff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
      '<rect x="4" y="4" width="40" height="40" rx="3" ry="3"/>' +
      '<line x1="12" y1="36" x2="12" y2="20"/>' +
      '<line x1="20" y1="36" x2="20" y2="14"/>' +
      '<line x1="28" y1="36" x2="28" y2="24"/>' +
      '<line x1="36" y1="36" x2="36" y2="10"/>' +
      '<line x1="8" y1="36" x2="40" y2="36"/>' +
      '</svg>'
    );
    editor.ui.registry.addButton('customchart', {
      icon: 'custom-chart-icon',
      text: '图表',
      tooltip: '图表',
      onAction: function () {
        addChart();
      }
    });
  } catch (e) {
    console.error('[TinyMCE] customchart 注册失败:', e);
  }

  try {
    editor.ui.registry.addButton('customformula', {
      icon: 'highlight-bg-color',
      text: '公式',
      tooltip: '公式',
      onAction: function () {
        clearEditingFormulaImg();
        let formulaModal = document.getElementById('formulaEditorModal');
        let formulaInput = document.getElementById('formulaMathfield');
        let formulaColorPicker = document.getElementById('formulaColorPicker');
        if (!formulaModal || !formulaInput) return;
        if (formulaInput.setValue) {
          formulaInput.setValue('');
        }
        const defaultColor = getCurrentTinyFontColor();
        if (formulaColorPicker) formulaColorPicker.value = defaultColor;
        formulaModal.style.display = 'block';
        formulaInput.focus();
      }
    });
  } catch (e) {
    console.error('[TinyMCE] customformula 注册失败:', e);
  }

  try {
    editor.ui.registry.addMenuButton('customtable', {
      icon: 'table',
      text: '表格',
      tooltip: '插入表格',
      fetch: function (callback) {
        callback([
          { type: 'menuitem', text: '插入表格', onAction: function () { editor.execCommand('mceInsertTableDialog'); } },
          { type: 'menuitem', text: '表格属性', onAction: function () { editor.execCommand('mceTableProps'); } },
          { type: 'menuitem', text: '删除表格', onAction: function () { editor.execCommand('mceTableDelete'); } },
          { type: 'separator' },
          { type: 'menuitem', text: '上方插入行', onAction: function () { editor.execCommand('mceTableInsertRowBefore'); } },
          { type: 'menuitem', text: '下方插入行', onAction: function () { editor.execCommand('mceTableInsertRowAfter'); } },
          { type: 'menuitem', text: '删除行', onAction: function () { editor.execCommand('mceTableDeleteRow'); } },
          { type: 'separator' },
          { type: 'menuitem', text: '左侧插入列', onAction: function () { editor.execCommand('mceTableInsertColBefore'); } },
          { type: 'menuitem', text: '右侧插入列', onAction: function () { editor.execCommand('mceTableInsertColAfter'); } },
          { type: 'menuitem', text: '删除列', onAction: function () { editor.execCommand('mceTableDeleteCol'); } }
        ]);
      }
    });
  } catch (e) {
    console.error('[TinyMCE] customtable 注册失败:', e);
  }

  try {
    editor.ui.registry.addButton('customcharmap', {
      icon: 'insert-character',
      text: '特殊符号',
      tooltip: '特殊符号',
      onAction: function () {
        editor.execCommand('mceShowCharmap');
      }
    });
  } catch (e) {
    console.error('[TinyMCE] customcharmap 注册失败:', e);
  }

  try {
    editor.ui.registry.addIcon('custom-emoticon',
      '<svg width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="9" cy="9" r="1.2" fill="currentColor"/><circle cx="15" cy="9" r="1.2" fill="currentColor"/><path d="M8 14c.8 1.5 2.2 2 4 2s3.2-.5 4-2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>'
    );
    editor.ui.registry.addButton('customemoticons', {
      icon: 'custom-emoticon',
      text: '表情',
      tooltip: '表情符号',
      onAction: function () {
        editor.execCommand('mceEmoticons');
      }
    });
  } catch (e) {
    console.error('[TinyMCE] customemoticons 注册失败:', e);
  }

  try {
    editor.ui.registry.addButton('codeeditor', {
      icon: 'code-sample',
      text: '代码块',
      tooltip: '代码块',
      onAction: function () {
        openTinyMceCodeEditor(editor, 'javascript', '', null);
      }
    });
  } catch (e) {
    console.error('[TinyMCE] codeeditor 注册失败:', e);
  }

  try {
    editor.ui.registry.addMenuButton('customdatetime', {
      icon: 'insert-time',
      text: '日期时间',
      tooltip: '日期时间',
      fetch: function (callback) {
        var now = new Date();
        var y = now.getFullYear();
        var m = String(now.getMonth() + 1).padStart(2, '0');
        var d = String(now.getDate()).padStart(2, '0');
        var h = String(now.getHours()).padStart(2, '0');
        var min = String(now.getMinutes()).padStart(2, '0');
        var s = String(now.getSeconds()).padStart(2, '0');
        var formats = [
          { text: y + '-' + m + '-' + d, value: y + '-' + m + '-' + d },
          { text: y + '/' + m + '/' + d, value: y + '/' + m + '/' + d },
          { text: y + '年' + m + '月' + d + '日', value: y + '年' + m + '月' + d + '日' },
          { text: h + ':' + min + ':' + s, value: h + ':' + min + ':' + s },
          { text: h + ':' + min, value: h + ':' + min },
          { text: y + '-' + m + '-' + d + ' ' + h + ':' + min + ':' + s, value: y + '-' + m + '-' + d + ' ' + h + ':' + min + ':' + s },
          { text: y + '年' + m + '月' + d + '日 ' + h + ':' + min, value: y + '年' + m + '月' + d + '日 ' + h + ':' + min }
        ];
        callback(formats.map(function (f) {
          return {
            type: 'menuitem',
            text: f.text,
            onAction: function () {
              editor.insertContent(f.value);
            }
          };
        }));
      }
    });
  } catch (e) {
    console.error('[TinyMCE] customdatetime 注册失败:', e);
  }

  // ── 幻灯片分页符 ──
  try {
    editor.ui.registry.addIcon('slide-break-icon',
      '<svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="#aef0ff" stroke-width="2.5" stroke-linecap="round">' +
      '<line x1="4" y1="24" x2="44" y2="24" stroke-dasharray="4 3"/>' +
      '<polygon points="20,18 28,24 20,30" fill="#aef0ff" fill-opacity="0.3"/>' +
      '</svg>'
    );
    editor.ui.registry.addButton('customslidebreak', {
      icon: 'slide-break-icon',
      text: '分页',
      tooltip: '插入幻灯片分页符',
      onAction: function () {
        insertSlideBreak();
      }
    });
  } catch (e) {
    console.error('[TinyMCE] customslidebreak 注册失败:', e);
  }

  // ── 演示模式 ──
  try {
    editor.ui.registry.addIcon('presentation-icon',
      '<svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="#aef0ff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
      '<rect x="4" y="6" width="40" height="28" rx="3" fill="#2c6e7e" fill-opacity="0.2"/>' +
      '<line x1="24" y1="34" x2="24" y2="42"/>' +
      '<line x1="16" y1="42" x2="32" y2="42"/>' +
      '<polygon points="20,14 32,20 20,26" fill="#aef0ff" fill-opacity="0.5"/>' +
      '</svg>'
    );
    editor.ui.registry.addButton('custompresentation', {
      icon: 'presentation-icon',
      text: '演示',
      tooltip: '进入幻灯片演示模式',
      onAction: function () {
        startPresentation();
      }
    });
  } catch (e) {
    console.error('[TinyMCE] custompresentation 注册失败:', e);
  }

  // ── 内嵌幻灯片（Swiper） ──
  try {
    editor.ui.registry.addIcon('slideshow-icon',
      '<svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="#aef0ff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
      '<rect x="4" y="8" width="40" height="28" rx="3" fill="#16213e" fill-opacity="0.8"/>' +
      '<line x1="4" y1="20" x2="44" y2="20" stroke-dasharray="3 2"/>' +
      '<polygon points="18,14 24,17 18,20" fill="#aef0ff" fill-opacity="0.5"/>' +
      '<polygon points="18,26 24,29 18,32" fill="#aef0ff" fill-opacity="0.5"/>' +
      '<line x1="28" y1="15" x2="36" y2="19"/>' +
      '<line x1="28" y1="27" x2="36" y2="31"/>' +
      '</svg>'
    );
    editor.ui.registry.addButton('customslideshow', {
      icon: 'slideshow-icon',
      text: '幻灯片',
      tooltip: '插入内嵌幻灯片（Swiper）',
      onAction: function () {
        addSlideshow();
      }
    });
  } catch (e) {
    console.error('[TinyMCE] customslideshow 注册失败:', e);
  }
}