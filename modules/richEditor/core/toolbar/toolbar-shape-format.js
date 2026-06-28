// ============================================================
//  toolbar/toolbar-shape-format.js — 图形格式 tab
// ============================================================

import { overlayImages, getSelectedImages, renderAll, transactRender, rgbaToHex, deleteSelectedImage } from '../overlay/overlay-images.js';
import { SHAPE_CATEGORIES, SHAPE_LABELS, buildShapeThumbnail, addShape } from '../overlay/overlay-shapes.js';
import { addTextBox, enterTextBoxEdit } from '../overlay/overlay-textbox.js';
import { getActiveBlockId, getBlockWidth } from '../overlay/overlay-block.js';

export function registerShapeFormatTab(editor) {

  // ── 插入形状（快速选择） ──
  try {
    let quickShapes = ['rect', 'roundedRect', 'ellipse', 'triangle', 'diamond', 'arrow', 'star', 'calloutRect'];
    quickShapes.forEach(function (key) {
      editor.ui.registry.addIcon('qshape-' + key, buildShapeThumbnail(key));
    });
    editor.ui.registry.addMenuButton('shapeformatInsertShape', {
      icon: 'highlight-bg-color',
      tooltip: '插入形状',
      text: '插入形状',
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
                return { type: 'menuitem', icon: 'qshape-' + key, text: SHAPE_LABELS[key] || key, onAction: function () {
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
    console.error('[ShapeFormat] shapeformatInsertShape 注册失败:', e);
  }

  // ── 插入文本框 ──
  try {
    editor.ui.registry.addButton('shapeformatInsertTextbox', {
      icon: 'new-document',
      tooltip: '插入文本框',
      text: '文本框',
      onAction: function () {
        addTextBox();
      }
    });
  } catch (e) {
    console.error('[ShapeFormat] shapeformatInsertTextbox 注册失败:', e);
  }

  // ── 形状填充颜色 ──
  try {
    editor.ui.registry.addButton('shapeformatFill', {
      icon: 'fill',
      tooltip: '形状填充',
      text: '填充',
      onAction: function () {
        let items = getSelectedImages();
        if (items.length === 0) return;
        let sel = items[0];
        let input = document.createElement('input');
        input.type = 'color';
        input.value = rgbaToHex(sel.fillColor) || '#2c6e7e';
        input.style.cssText = 'position:fixed;top:-100px;left:-100px;';
        document.body.appendChild(input);
        input.addEventListener('input', function () {
          items.forEach(function(s) { s.fillColor = input.value; });
          renderAll();
        });
        input.addEventListener('change', function () {
          items.forEach(function(s) { s.fillColor = input.value; });
          transactRender();
          document.body.removeChild(input);
        });
        input.click();
      }
    });
  } catch (e) {
    console.error('[ShapeFormat] shapeformatFill 注册失败:', e);
  }

  // ── 形状轮廓颜色 ──
  try {
    editor.ui.registry.addButton('shapeformatStroke', {
      icon: 'border-style',
      tooltip: '形状轮廓',
      text: '轮廓',
      onAction: function () {
        let items = getSelectedImages();
        if (items.length === 0) return;
        let sel = items[0];
        let input = document.createElement('input');
        input.type = 'color';
        input.value = rgbaToHex(sel.strokeColor) || '#4a9eae';
        input.style.cssText = 'position:fixed;top:-100px;left:-100px;';
        document.body.appendChild(input);
        input.addEventListener('input', function () {
          items.forEach(function(s) { s.strokeColor = input.value; });
          renderAll();
        });
        input.addEventListener('change', function () {
          items.forEach(function(s) { s.strokeColor = input.value; });
          transactRender();
          document.body.removeChild(input);
        });
        input.click();
      }
    });
  } catch (e) {
    console.error('[ShapeFormat] shapeformatStroke 注册失败:', e);
  }

  // ── 轮廓粗细 ──
  try {
    editor.ui.registry.addMenuButton('shapeformatStrokeWidth', {
      icon: 'line',
      tooltip: '轮廓粗细',
      text: '粗细',
      fetch: function (callback) {
        callback([
          { type: 'menuitem', text: '1px', onAction: function () { setStrokeWidth(1); } },
          { type: 'menuitem', text: '2px', onAction: function () { setStrokeWidth(2); } },
          { type: 'menuitem', text: '3px', onAction: function () { setStrokeWidth(3); } },
          { type: 'menuitem', text: '4px', onAction: function () { setStrokeWidth(4); } },
          { type: 'menuitem', text: '6px', onAction: function () { setStrokeWidth(6); } },
          { type: 'menuitem', text: '8px', onAction: function () { setStrokeWidth(8); } },
          { type: 'menuitem', text: '无轮廓', onAction: function () { setStrokeWidth(0); } }
        ]);
      }
    });
  } catch (e) {
    console.error('[ShapeFormat] shapeformatStrokeWidth 注册失败:', e);
  }

  // ── 形状阴影 ──
  try {
    editor.ui.registry.addMenuButton('shapeformatShadow', {
      icon: 'shadow',
      tooltip: '形状阴影',
      text: '阴影',
      fetch: function (callback) {
        callback([
          { type: 'menuitem', text: '无阴影', onAction: function () { setShapeShadow('none'); } },
          { type: 'menuitem', text: '右下偏移', onAction: function () { setShapeShadow('2px 2px 4px rgba(0,0,0,0.5)'); } },
          { type: 'menuitem', text: '左下偏移', onAction: function () { setShapeShadow('-2px 2px 4px rgba(0,0,0,0.5)'); } },
          { type: 'menuitem', text: '居中阴影', onAction: function () { setShapeShadow('0 0 8px rgba(0,0,0,0.6)'); } },
          { type: 'menuitem', text: '长阴影', onAction: function () { setShapeShadow('4px 4px 12px rgba(0,0,0,0.4)'); } },
          { type: 'menuitem', text: '内阴影', onAction: function () { setShapeShadow('inset 0 2px 6px rgba(0,0,0,0.5)'); } }
        ]);
      }
    });
  } catch (e) {
    console.error('[ShapeFormat] shapeformatShadow 注册失败:', e);
  }

  // ── 形状透明度 ──
  try {
    editor.ui.registry.addMenuButton('shapeformatOpacity', {
      icon: 'opacity',
      tooltip: '形状透明度',
      text: '透明度',
      fetch: function (callback) {
        callback([
          { type: 'menuitem', text: '100%', onAction: function () { setShapeOpacity(1); } },
          { type: 'menuitem', text: '80%', onAction: function () { setShapeOpacity(0.8); } },
          { type: 'menuitem', text: '60%', onAction: function () { setShapeOpacity(0.6); } },
          { type: 'menuitem', text: '40%', onAction: function () { setShapeOpacity(0.4); } },
          { type: 'menuitem', text: '20%', onAction: function () { setShapeOpacity(0.2); } }
        ]);
      }
    });
  } catch (e) {
    console.error('[ShapeFormat] shapeformatOpacity 注册失败:', e);
  }

  // ── 艺术字样式（文本框专用） ──
  try {
    editor.ui.registry.addMenuButton('shapeformatWordArt', {
      icon: 'format',
      tooltip: '艺术字样式',
      text: '艺术字',
      fetch: function (callback) {
        callback([
          { type: 'menuitem', text: '编辑文字', onAction: function () {
            let items = getSelectedImages().filter(function(s) { return s.type === 'textbox'; });
            if (items.length > 0) enterTextBoxEdit(items[0]);
          } },
          { type: 'menuitem', text: '白色文字', onAction: function () { setTextBoxStyle('#ffffff', 'none'); } },
          { type: 'menuitem', text: '黑色文字', onAction: function () { setTextBoxStyle('#000000', 'none'); } },
          { type: 'menuitem', text: '青色发光', onAction: function () { setTextBoxStyle('#00e5ff', '0 0 10px #00e5ff'); } },
          { type: 'menuitem', text: '金色描边', onAction: function () { setTextBoxStyle('#ffd700', '1px 1px 0 #b8860b'); } },
          { type: 'menuitem', text: '红色阴影', onAction: function () { setTextBoxStyle('#ff4444', '2px 2px 4px rgba(0,0,0,0.5)'); } },
          { type: 'menuitem', text: '渐变文字', onAction: function () { setTextBoxGradient(); } }
        ]);
      }
    });
  } catch (e) {
    console.error('[ShapeFormat] shapeformatWordArt 注册失败:', e);
  }

  // ── 文字颜色 ──
  try {
    editor.ui.registry.addButton('shapeformatTextColor', {
      icon: 'text-color',
      tooltip: '文字颜色',
      text: '字色',
      onAction: function () {
        let items = getSelectedImages().filter(function(s) { return s.type === 'textbox'; });
        if (items.length === 0) return;
        let sel = items[0];
        let input = document.createElement('input');
        input.type = 'color';
        input.value = rgbaToHex(sel.textColor) || '#c8e6ff';
        input.style.cssText = 'position:fixed;top:-100px;left:-100px;';
        document.body.appendChild(input);
        input.addEventListener('input', function () {
          items.forEach(function(s) { s.textColor = input.value; });
          renderAll();
        });
        input.addEventListener('change', function () {
          items.forEach(function(s) { s.textColor = input.value; });
          transactRender();
          document.body.removeChild(input);
        });
        input.click();
      }
    });
  } catch (e) {
    console.error('[ShapeFormat] shapeformatTextColor 注册失败:', e);
  }

  // ── 对齐 ──
  try {
    editor.ui.registry.addMenuButton('shapeformatAlign', {
      icon: 'align-center',
      tooltip: '对齐',
      text: '对齐',
      fetch: function (callback) {
        callback([
          { type: 'menuitem', text: '左对齐', onAction: function () { alignSelected('left'); } },
          { type: 'menuitem', text: '水平居中', onAction: function () { alignSelected('center-h'); } },
          { type: 'menuitem', text: '右对齐', onAction: function () { alignSelected('right'); } },
          { type: 'menuitem', text: '顶部对齐', onAction: function () { alignSelected('top'); } },
          { type: 'menuitem', text: '垂直居中', onAction: function () { alignSelected('center-v'); } },
          { type: 'menuitem', text: '底部对齐', onAction: function () { alignSelected('bottom'); } }
        ]);
      }
    });
  } catch (e) {
    console.error('[ShapeFormat] shapeformatAlign 注册失败:', e);
  }

  // ── 旋转 ──
  try {
    editor.ui.registry.addMenuButton('shapeformatRotate', {
      icon: 'rotate-right',
      tooltip: '旋转',
      text: '旋转',
      fetch: function (callback) {
        callback([
          { type: 'menuitem', text: '顺时针 90°', onAction: function () { rotateSelected(90); } },
          { type: 'menuitem', text: '逆时针 90°', onAction: function () { rotateSelected(-90); } },
          { type: 'menuitem', text: '顺时针 45°', onAction: function () { rotateSelected(45); } },
          { type: 'menuitem', text: '逆时针 45°', onAction: function () { rotateSelected(-45); } },
          { type: 'menuitem', text: '水平翻转', onAction: function () { flipSelected('h'); } },
          { type: 'menuitem', text: '垂直翻转', onAction: function () { flipSelected('v'); } },
          { type: 'menuitem', text: '重置旋转', onAction: function () { rotateSelected(0, true); } }
        ]);
      }
    });
  } catch (e) {
    console.error('[ShapeFormat] shapeformatRotate 注册失败:', e);
  }

  // ── 图层 ──
  try {
    editor.ui.registry.addMenuButton('shapeformatLayer', {
      icon: 'layer',
      tooltip: '图层顺序',
      text: '图层',
      fetch: function (callback) {
        callback([
          { type: 'menuitem', text: '置于顶层', onAction: function () { moveLayer('front'); } },
          { type: 'menuitem', text: '上移一层', onAction: function () { moveLayer('up'); } },
          { type: 'menuitem', text: '下移一层', onAction: function () { moveLayer('down'); } },
          { type: 'menuitem', text: '置于底层', onAction: function () { moveLayer('back'); } }
        ]);
      }
    });
  } catch (e) {
    console.error('[ShapeFormat] shapeformatLayer 注册失败:', e);
  }

  // ── 删除 ──
  try {
    editor.ui.registry.addButton('shapeformatDelete', {
      icon: 'remove',
      tooltip: '删除选中',
      text: '删除',
      onAction: function () {
        deleteSelectedImage();
      }
    });
  } catch (e) {
    console.error('[ShapeFormat] shapeformatDelete 注册失败:', e);
  }
}

// ── 辅助函数 ──

function setStrokeWidth(w) {
  let items = getSelectedImages();
  items.forEach(function(sel) { sel.strokeWidth = w; });
  transactRender();
}

function setShapeShadow(shadow) {
  let items = getSelectedImages();
  items.forEach(function(sel) { sel.shadow = shadow; });
  transactRender();
}

function setShapeOpacity(opacity) {
  let items = getSelectedImages();
  items.forEach(function(sel) { sel.opacity = opacity; });
  transactRender();
}

function setTextBoxStyle(color, textShadow) {
  let items = getSelectedImages().filter(function(s) { return s.type === 'textbox'; });
  items.forEach(function(sel) {
    sel.textColor = color;
    if (textShadow) sel.textShadow = textShadow;
    else sel.textShadow = '';
  });
  transactRender();
}

function setTextBoxGradient() {
  let items = getSelectedImages().filter(function(s) { return s.type === 'textbox'; });
  items.forEach(function(sel) {
    sel.textColor = '';
    sel.textGradient = 'linear-gradient(135deg, #00e5ff, #a855f7, #ec4899)';
  });
  transactRender();
}

function alignSelected(dir) {
  let items = getSelectedImages();
  if (items.length === 0) return;
  let blockId = getActiveBlockId();
  let blockW = blockId ? getBlockWidth(blockId) : 800;
  items.forEach(function(sel) {
    switch (dir) {
      case 'left': sel.x = 0; break;
      case 'center-h': sel.x = Math.max(0, (blockW - sel.width) / 2); break;
      case 'right': sel.x = Math.max(0, blockW - sel.width); break;
      case 'top': sel.y = 0; break;
      case 'center-v': sel.y = Math.max(0, 500 - sel.height); break;
      case 'bottom': sel.y = Math.max(0, 500 - sel.height); break;
    }
  });
  transactRender();
}

function rotateSelected(deg, reset) {
  let items = getSelectedImages();
  items.forEach(function(sel) {
    if (reset) {
      sel.rotation = 0;
      sel.flipH = false;
      sel.flipV = false;
    } else {
      sel.rotation = ((sel.rotation || 0) + deg) % 360;
    }
  });
  transactRender();
}

function flipSelected(dir) {
  let items = getSelectedImages();
  items.forEach(function(sel) {
    if (dir === 'h') sel.flipH = !sel.flipH;
    else sel.flipV = !sel.flipV;
  });
  transactRender();
}

function moveLayer(dir) {
  let items = getSelectedImages();
  if (items.length === 0) return;
  // 对多选项按当前索引排序，保持相对顺序
  let indices = items.map(function(sel) { return overlayImages.indexOf(sel); }).sort(function(a, b) { return a - b; });
  if (dir === 'up') {
    // 从后往前移动，保持相对顺序
    for (let i = indices.length - 1; i >= 0; i--) {
      let idx = indices[i];
      if (idx < overlayImages.length - 1) {
        let item = overlayImages.splice(idx, 1)[0];
        overlayImages.splice(idx + 1, 0, item);
      }
    }
  } else if (dir === 'down') {
    for (let i = 0; i < indices.length; i++) {
      let idx = indices[i];
      if (idx > 0) {
        let item = overlayImages.splice(idx, 1)[0];
        overlayImages.splice(idx - 1, 0, item);
      }
    }
  } else if (dir === 'front') {
    // 先移除所有选中项，再追加到末尾
    let removed = [];
    for (let i = overlayImages.length - 1; i >= 0; i--) {
      if (items.indexOf(overlayImages[i]) >= 0) {
        removed.unshift(overlayImages.splice(i, 1)[0]);
      }
    }
    overlayImages.push.apply(overlayImages, removed);
  } else if (dir === 'back') {
    let removed = [];
    for (let i = overlayImages.length - 1; i >= 0; i--) {
      if (items.indexOf(overlayImages[i]) >= 0) {
        removed.unshift(overlayImages.splice(i, 1)[0]);
      }
    }
    overlayImages.unshift.apply(overlayImages, removed);
  }
  // 重新分配 zIndex
  overlayImages.forEach(function(item, i) {
    item.zIndex = i + 1;
  });
  transactRender();
}
