import { state } from '../../shared-state.js';
import { overlayImages, getNextZIndex, ensureOverlay, renderAll, transactRender, selectImage, rgbaToHex, getInsertY, getInsertX, getSelectedImage } from './overlay-images.js';
import { DEFAULT_COLORS } from './overlay-shapes.js';
import { getActiveBlockId, getBlockElement, getBlockWidth, pxToPct } from './overlay-block.js';

// 辅助函数：设置 textbox 编辑状态
function setEditingTextBoxState(textDiv, imgData) {
  state.editingTextBox = textDiv;
  state.editingTextBoxData = imgData;
}

// 辅助函数：清除 textbox 编辑状态
function clearEditingTextBoxState() {
  state.editingTextBox = null;
  state.editingTextBoxData = null;
}

export function addTextBox() {
  ensureOverlay();
  let blockId = getActiveBlockId();
  if (!blockId) return;

  let blockW = getBlockWidth(blockId);
  let id = 'oly-text-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);

  let w = 260;
  let x = Math.max(0, (blockW - w) / 2);

  let textData = {
    type: 'textbox',
    id: id,
    blockId: blockId,
    x: x,
    y: getInsertY(),
    width: w,
    height: 80,
    zIndex: getNextZIndex(),
    text: '',
    fontSize: 16,
    fontFamily: 'Microsoft YaHei, sans-serif',
    color: DEFAULT_COLORS.text,
    backgroundColor: 'transparent',
    textAlign: 'left',
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    lineHeight: 1.5,
    leftPct: pxToPct(x, blockW),
    widthPct: pxToPct(w, blockW),
    _refWidth: blockW
  };
  overlayImages.push(textData);
  selectImage(id);
  transactRender();
}

export function renderTextBoxContent(item, imgData) {
  let isEditing = imgData._editing === true;

  let textDiv = document.createElement('div');
  if (isEditing) {
    textDiv.setAttribute('contenteditable', 'true');
  }
  textDiv.className = 'oly-textbox-content';
  textDiv.style.cssText =
    'width:100%;height:100%;outline:none;overflow:auto;' +
    'font-size:' + imgData.fontSize + 'px;' +
    'font-family:' + imgData.fontFamily + ';' +
    'color:' + (imgData.textColor || imgData.color) + ';' +
    'text-align:' + imgData.textAlign + ';' +
    'background:' + (imgData.backgroundColor || 'transparent') + ';' +
    'font-weight:' + (imgData.bold ? 'bold' : 'normal') + ';' +
    'font-style:' + (imgData.italic ? 'italic' : 'normal') + ';' +
    'text-decoration:' + ((imgData.underline ? 'underline ' : '') + (imgData.strikethrough ? 'line-through' : '')).trim() + ';' +
    'line-height:' + (imgData.lineHeight || 1.5) + ';' +
    'padding:4px 6px;word-wrap:break-word;white-space:pre-wrap;';

  if (imgData.textShadow) {
    textDiv.style.textShadow = imgData.textShadow;
  }
  if (imgData.textGradient) {
    textDiv.style.backgroundImage = imgData.textGradient;
    textDiv.style.backgroundClip = 'text';
    textDiv.style.webkitBackgroundClip = 'text';
    textDiv.style.color = 'transparent';
  }

  if (isEditing) {
    textDiv.style.pointerEvents = 'auto';
    textDiv.style.cursor = 'text';
    textDiv.innerHTML = imgData.html || imgData.text || '';

    // 设置编辑状态，让工具栏能够检测到
    setEditingTextBoxState(textDiv, imgData);

    textDiv.addEventListener('blur', function (e) {
      // 检查是否是因为点击工具栏面板/菜单/tab而失去焦点
      // 如果是，不清除编辑状态，保持选区以便应用格式
      const forecolorPanel = document.getElementById('gradientCustomPanel');
      const backcolorPanel = document.getElementById('backcolorCustomPanel');
      const underlinePanel = document.getElementById('underlineColorPanel');
      const activePanel = (forecolorPanel && forecolorPanel.style.display === 'block') ||
                          (backcolorPanel && backcolorPanel.style.display === 'block') ||
                          (underlinePanel && underlinePanel.style.display === 'block');
      // 也检查是否 TinyMCE 菜单或工具栏 tab 正在显示/交互
      const activeMenu = document.querySelector('.tox-menu, .tox-collection');
      const activeTab = document.querySelector('.tb-menubar-tab:focus, .tb-menubar-tab:active');

      if (activePanel || activeMenu || activeTab) {
        // 不清除编辑状态，让工具栏能够继续操作
        return;
      }

      saveTextBoxEdit(imgData, textDiv);
      // 清除编辑状态
      clearEditingTextBoxState();
      setTimeout(function () {
        const selected = getSelectedImage();
        if (selected && selected.id === imgData.id && !imgData._editing) {
          transactRender();
        }
      }, 0);
    });
  } else {
    textDiv.style.pointerEvents = 'none';
    textDiv.style.cursor = 'move';
    if (imgData.html) {
      textDiv.innerHTML = imgData.html;
    } else if (imgData.text) {
      textDiv.textContent = imgData.text;
    } else {
      textDiv.textContent = '双击输入文字';
    }
  }

  item.appendChild(textDiv);
}

function saveTextBoxEdit(imgData, textDiv) {
  if (!imgData._editing) return;
  imgData.html = textDiv.innerHTML;
  imgData.text = textDiv.textContent || '';
  imgData._editing = false;
  hideTextBoxToolbar();
}

function showTextBoxToolbar(item, imgData, textDiv) {
  hideTextBoxToolbar();

  let existingToolbar = document.getElementById('olyTextBoxToolbar');
  if (existingToolbar) existingToolbar.remove();

  let toolbar = document.createElement('div');
  toolbar.id = 'olyTextBoxToolbar';
  toolbar.style.cssText =
    'position:absolute;left:0;top:-40px;height:34px;display:flex;align-items:center;gap:2px;' +
    'background:#0d1f2b;border:1px solid #2c6e7e;border-radius:6px;padding:2px 6px;' +
    'z-index:100;white-space:nowrap;box-shadow:0 2px 10px rgba(0,0,0,0.5);';

  toolbar.innerHTML = buildTextBoxToolbarHTML();
  item.appendChild(toolbar);

  bindTextBoxToolbarEvents(toolbar, imgData, textDiv);
}
function buildTextBoxToolbarHTML() {
  let fonts = ['Microsoft YaHei', 'SimSun', 'SimHei', 'KaiTi', 'Arial', 'Times New Roman', 'Courier New', 'Georgia', 'Verdana'];
  let fontOpts = fonts.map(function (f) { return '<option value="' + f + '">' + f + '</option>'; }).join('');

  return '' +
    '<select class="oly-tb-font" style="background:#1a3a44;color:#c8e6ff;border:1px solid #2c6e7e;border-radius:3px;padding:2px 4px;font-size:11px;max-width:100px;">' + fontOpts + '</select>' +
    '<select class="oly-tb-size" style="background:#1a3a44;color:#c8e6ff;border:1px solid #2c6e7e;border-radius:3px;padding:2px;font-size:11px;width:50px;">' +
      '<option value="8">8</option><option value="9">9</option><option value="10">10</option><option value="11">11</option><option value="12" selected>12</option><option value="14">14</option><option value="16">16</option><option value="18">18</option><option value="20">20</option><option value="24">24</option><option value="28">28</option><option value="32">32</option><option value="36">36</option><option value="48">48</option><option value="64">64</option>' +
    '</select>' +
    '<button class="oly-tb-btn" data-cmd="bold" title="加粗" style="font-weight:bold;">B</button>' +
    '<button class="oly-tb-btn" data-cmd="italic" title="斜体" style="font-style:italic;">I</button>' +
    '<button class="oly-tb-btn" data-cmd="underline" title="下划线" style="text-decoration:underline;">U</button>' +
    '<button class="oly-tb-btn" data-cmd="strikethrough" title="删除线" style="text-decoration:line-through;">S</button>' +
    '<input type="color" class="oly-tb-forecolor" title="文字颜色" value="#c8e6ff" style="width:20px;height:20px;border:1px solid #2c6e7e;border-radius:3px;cursor:pointer;padding:0;background:transparent;">' +
    '<input type="color" class="oly-tb-backcolor" title="背景颜色" value="#000000" style="width:20px;height:20px;border:1px solid #2c6e7e;border-radius:3px;cursor:pointer;padding:0;background:transparent;">' +
    '<span style="color:#3a5a6a;">|</span>' +
    '<button class="oly-tb-btn" data-cmd="justifyLeft" title="左对齐">≡</button>' +
    '<button class="oly-tb-btn" data-cmd="justifyCenter" title="居中">≡</button>' +
    '<button class="oly-tb-btn" data-cmd="justifyRight" title="右对齐">≡</button>' +
    '<select class="oly-tb-lineheight" style="background:#1a3a44;color:#c8e6ff;border:1px solid #2c6e7e;border-radius:3px;padding:2px;font-size:11px;width:44px;">' +
      '<option value="1">1.0</option><option value="1.15">1.15</option><option value="1.5" selected>1.5</option><option value="2">2.0</option><option value="2.5">2.5</option><option value="3">3.0</option>' +
    '</select>';
}

function bindTextBoxToolbarEvents(toolbar, imgData, textDiv) {
  let btns = toolbar.querySelectorAll('.oly-tb-btn');
  for (let i = 0; i < btns.length; i++) {
    btns[i].addEventListener('mousedown', function (e) {
      e.preventDefault();
      e.stopPropagation();
      textDiv.focus();
      let cmd = this.getAttribute('data-cmd');
      document.execCommand(cmd, false, null);
    });
  }

  let fontSel = toolbar.querySelector('.oly-tb-font');
  if (fontSel) {
    fontSel.value = imgData.fontFamily || 'Microsoft YaHei';
    fontSel.addEventListener('change', function () {
      textDiv.focus();
      document.execCommand('fontName', false, this.value);
    });
  }

  let sizeSel = toolbar.querySelector('.oly-tb-size');
  if (sizeSel) {
    sizeSel.value = String(imgData.fontSize || 16);
    sizeSel.addEventListener('change', function () {
      textDiv.focus();
      document.execCommand('fontSize', false, this.value);
    });
  }

  let foreColor = toolbar.querySelector('.oly-tb-forecolor');
  if (foreColor) {
    foreColor.value = rgbaToHex(imgData.color) || '#c8e6ff';
    foreColor.addEventListener('input', function () {
      textDiv.focus();
      document.execCommand('foreColor', false, this.value);
    });
  }

  let backColor = toolbar.querySelector('.oly-tb-backcolor');
  if (backColor) {
    backColor.addEventListener('input', function () {
      textDiv.focus();
      document.execCommand('hiliteColor', false, this.value);
    });
  }

  let lineH = toolbar.querySelector('.oly-tb-lineheight');
  if (lineH) {
    lineH.value = String(imgData.lineHeight || 1.5);
    lineH.addEventListener('change', function () {
      textDiv.focus();
      document.execCommand('insertHTML', false, '');
      let sel = window.getSelection();
      if (sel.rangeCount) {
        let range = sel.getRangeAt(0);
        let span = document.createElement('span');
        span.style.lineHeight = this.value;
        range.surroundContents(span);
        sel.removeAllRanges();
      }
      imgData.lineHeight = parseFloat(this.value);
    });
  }
}

function hideTextBoxToolbar() {
  let tb = document.getElementById('olyTextBoxToolbar');
  if (tb) tb.remove();
}

function enterTextBoxEdit(imgData) {
  imgData._editing = true;
  renderAll();
  setTimeout(function () {
    let blockEl = getBlockElement(imgData.blockId || getActiveBlockId());
    let editable = blockEl && blockEl.querySelector('[data-oly-id="' + imgData.id + '"] [contenteditable]');
    if (editable) editable.focus();
  }, 100);
}

// 导出辅助函数供工具栏使用
export { hideTextBoxToolbar, enterTextBoxEdit, setEditingTextBoxState, clearEditingTextBoxState };