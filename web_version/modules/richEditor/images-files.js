import { state } from './shared-state.js';

function getTinyImgInput() {
  if (!state.tinyImgInput) {
    state.tinyImgInput = document.createElement('input');
    state.tinyImgInput.type = 'file';
    state.tinyImgInput.accept = 'image/*';
    state.tinyImgInput.style.display = 'none';
    document.body.appendChild(state.tinyImgInput);
    state.tinyImgInput.addEventListener('change', function () {
      if (this.files && this.files[0]) {
        insertTinyImage(this.files[0]);
        this.value = '';
      }
    });
  }
  return state.tinyImgInput;
}

export function openTinyImagePicker() {
  getTinyImgInput().click();
}

export function insertTinyFile() {
  let fileInput = document.getElementById('hiddenFileInput');
  if (!fileInput) {
    fileInput = document.createElement('input');
    fileInput.id = 'hiddenFileInput';
    fileInput.type = 'file';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
  }
  if (!state.tinyEditor) return;

  state.tinyEditor.focus();

  fileInput.accept = '*';
  fileInput.onchange = function () {
    if (fileInput.files[0]) {
      insertTinyFileFromFile(fileInput.files[0]);
    }
    fileInput.value = '';
  };

  fileInput.click();
}

/**
 * 将外部文件作为文件下载按钮插入 TinyMCE 编辑区
 * @param {File} file - 从拖放或文件选择器获得的文件对象
 */
export function insertTinyFileFromFile(file) {
  if (!state.tinyEditor || !file) return;
  const filePath = file.path || URL.createObjectURL(file);
  const fileExtension = file.name.split('.').pop().toLowerCase();

  const iconMap = {
    'pdf': '📄',
    'doc': '📝',
    'docx': '📝',
    'txt': '📄',
    'xls': '📊',
    'xlsx': '📊',
    'ppt': '📈',
    'pptx': '📈',
    'zip': '📦',
    'rar': '📦',
    'exe': '⚙️',
    'lnk': '🔗',
    'url': '🌐',
    'html': '🌐',
    'htm': '🌐',
    'md': '📝',
    'json': '📋',
    'xml': '📋',
    'jpg': '🖼️',
    'jpeg': '🖼️',
    'png': '🖼️',
    'gif': '🖼️',
    'mp4': '🎬',
    'mp3': '🎵',
    'avi': '🎬',
    'mov': '🎬'
  };

  const icon = iconMap[fileExtension] || '📎';
  const text = `${icon} ${file.name}`;

  const fileLinkHtml = '<a ' +
    'class="file-link file-link-btn" ' +
    'contenteditable="false" ' +
    'href="' + filePath + '" ' +
    'download="' + file.name + '" ' +
    'target="_blank" ' +
    'style="display:inline-flex;align-items:center;gap:0.5em;padding:0.4em 0.8em;' +
    'background:linear-gradient(135deg,#1e7a8c,#0f3b48);color:#fff!important;border-radius:1em;font-size:0.875em;' +
    'text-decoration:none;border:1px solid rgba(0,255,255,0.3);margin:0.25em;">' +
    text +
    '</a>\u200B';

  state.tinyEditor.insertContent(fileLinkHtml);
}

function insertTinyImage(file) {
  if (!file || !file.type.startsWith('image/')) return;
  if (!state.tinyEditor) return;
  let reader = new FileReader();
  reader.onload = function () {
    let dataUrl = reader.result;
    let imgId = 'tmce-img-' + Date.now();
    let wrapperHtml = '<div class="tmce-resizable-image-wrapper" data-img-id="' + imgId + '" style="display:inline-block;position:relative;max-width:100%;cursor:move;">' +
      '<img src="' + dataUrl + '" style="max-width:100%;display:block;" />' +
      '<div class="tmce-resize-handle tmce-resize-nw" style="position:absolute;left:-6px;top:-6px;width:12px;height:12px;background:#2c6e7e;border:1px solid #fff;cursor:nw-resize;border-radius:2px;"></div>' +
      '<div class="tmce-resize-handle tmce-resize-ne" style="position:absolute;right:-6px;top:-6px;width:12px;height:12px;background:#2c6e7e;border:1px solid #fff;cursor:ne-resize;border-radius:2px;"></div>' +
      '<div class="tmce-resize-handle tmce-resize-sw" style="position:absolute;left:-6px;bottom:-6px;width:12px;height:12px;background:#2c6e7e;border:1px solid #fff;cursor:sw-resize;border-radius:2px;"></div>' +
      '<div class="tmce-resize-handle tmce-resize-se" style="position:absolute;right:-6px;bottom:-6px;width:12px;height:12px;background:#2c6e7e;border:1px solid #fff;cursor:se-resize;border-radius:2px;"></div>' +
      '</div>';
    state.tinyEditor.insertContent(wrapperHtml + '\u200B');
    requestAnimationFrame(function () {
      let wrapper = state.tinyEditor.dom.select('.tmce-resizable-image-wrapper[data-img-id="' + imgId + '"]')[0];
      if (wrapper) bindTinyImageEvents(wrapper);
    });
  };
  reader.readAsDataURL(file);
}

function bindTinyImageEvents(wrapper) {
  if (!wrapper || wrapper.dataset.bound === '1') return;
  wrapper.dataset.bound = '1';

  wrapper.addEventListener('mousedown', function (e) {
    if (e.target.classList.contains('tmce-resize-handle')) return;
    e.preventDefault();
    let cs = window.getComputedStyle(wrapper);
    let curML = parseFloat(cs.marginLeft) || 0;
    let curMT = parseFloat(cs.marginTop) || 0;
    wrapper.classList.add('tmce-dragging');
    state.tmceImgDragInfo = {
      wrapper: wrapper,
      startX: e.clientX,
      startY: e.clientY,
      startMarginLeft: curML,
      startMarginTop: curMT,
      isMove: true
    };
  });

  let handles = wrapper.querySelectorAll('.tmce-resize-handle');
  handles.forEach(function (handle) {
    handle.addEventListener('mousedown', function (e) {
      e.preventDefault();
      e.stopPropagation();
      let img = wrapper.querySelector('img');
      let rect = img.getBoundingClientRect();
      img.style.maxWidth = 'none';
      wrapper.classList.add('tmce-dragging');
      state.tmceImgDragInfo = {
        wrapper: wrapper,
        img: img,
        startX: e.clientX,
        startY: e.clientY,
        startW: rect.width,
        startH: rect.height,
        isResize: true,
        handle: handle
      };
    });
  });
}

function getTinyImageCtxMenu() {
  if (state._tmceImgCtxMenu) return state._tmceImgCtxMenu;
  let menu = document.createElement('div');
  menu.id = 'tmceImgContextMenu';
  menu.style.cssText = 'display:none;position:fixed;z-index:9999;background:#0d1f2b;border:1px solid #2c6e7e;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,0.7);padding:6px 0;min-width:180px;';

  let items = [
    { label: '⫷ 左对齐', action: 'alignLeft' },
    { label: '⫾ 居中', action: 'alignCenter' },
    { label: '⫸ 右对齐', action: 'alignRight' },
    { label: '━ 默认（取消对齐）', action: 'alignNone' },
    { type: 'separator' },
    { label: '📌 浮于文字上方', action: 'floatAboveText' },
    { label: '📎 衬于文字下方', action: 'floatBelowText' },
    { label: '🔄 重置文字环绕', action: 'resetTextWrap' },
    { type: 'separator' },
    { label: '透明度调节', action: null, slider: true }
  ];

  items.forEach(function (item) {
    if (item.type === 'separator') {
      let sep = document.createElement('div');
      sep.style.cssText = 'height:1px;background:#1e3a44;margin:4px 0;';
      menu.appendChild(sep);
      return;
    }
    if (item.slider) {
      let sliderRow = document.createElement('div');
      sliderRow.style.cssText = 'padding:6px 14px;display:flex;align-items:center;gap:8px;';
      let sliderLabel = document.createElement('span');
      sliderLabel.textContent = '🔆 ';
      sliderLabel.style.cssText = 'color:#aef0ff;font-size:13px;white-space:nowrap;';
      let slider = document.createElement('input');
      slider.type = 'range';
      slider.min = '0.1';
      slider.max = '1';
      slider.step = '0.05';
      slider.value = '1';
      slider.style.cssText = 'flex:1;height:4px;accent-color:#0ff;';
      let valSpan = document.createElement('span');
      valSpan.textContent = '100%';
      valSpan.style.cssText = 'color:#aef0ff;font-size:12px;min-width:36px;text-align:right;';
      slider.addEventListener('input', function () {
        valSpan.textContent = Math.round(parseFloat(slider.value) * 100) + '%';
        if (state._tmceImgCtxTarget) {
          let img = state._tmceImgCtxTarget.querySelector('img');
          if (img) img.style.opacity = slider.value;
          state._tmceImgCtxTarget.style.opacity = slider.value;
        }
      });
      slider.addEventListener('mousedown', function (ev) { ev.stopPropagation(); });
      sliderRow.appendChild(sliderLabel);
      sliderRow.appendChild(slider);
      sliderRow.appendChild(valSpan);
      menu.appendChild(sliderRow);
      return;
    }
    let menuItem = document.createElement('div');
    menuItem.style.cssText = 'padding:7px 16px;color:#dde;font-size:13px;cursor:pointer;white-space:nowrap;transition:background 0.15s;';
    menuItem.textContent = item.label;
    menuItem.addEventListener('mouseenter', function () { this.style.background = '#1a3a44'; });
    menuItem.addEventListener('mouseleave', function () { this.style.background = ''; });
    menuItem.addEventListener('click', function () {
      let wrapper = state._tmceImgCtxTarget;
      let img = wrapper ? wrapper.querySelector('img') : null;
      let action = item.action;
      hideTinyImageContextMenu();
      if (!wrapper) return;
      switch (action) {
        case 'alignLeft':
          wrapper.style.cssFloat = 'left';
          wrapper.style.display = 'inline-block';
          wrapper.style.marginLeft = '';
          wrapper.style.marginRight = '';
          if (img) { img.style.cssFloat = ''; img.style.display = ''; img.style.marginLeft = ''; img.style.marginRight = ''; }
          break;
        case 'alignCenter':
          wrapper.style.cssFloat = '';
          wrapper.style.display = 'block';
          wrapper.style.marginLeft = 'auto';
          wrapper.style.marginRight = 'auto';
          if (img) { img.style.cssFloat = ''; img.style.display = ''; img.style.marginLeft = ''; img.style.marginRight = ''; }
          break;
        case 'alignRight':
          wrapper.style.cssFloat = 'right';
          wrapper.style.display = 'inline-block';
          wrapper.style.marginLeft = '';
          wrapper.style.marginRight = '';
          if (img) { img.style.cssFloat = ''; img.style.display = ''; img.style.marginLeft = ''; img.style.marginRight = ''; }
          break;
        case 'alignNone':
          wrapper.style.cssFloat = '';
          wrapper.style.display = '';
          wrapper.style.marginLeft = '';
          wrapper.style.marginRight = '';
          if (img) { img.style.cssFloat = ''; img.style.display = ''; img.style.marginLeft = ''; img.style.marginRight = ''; }
          break;
        case 'floatAboveText':
          wrapper.style.position = 'relative';
          wrapper.style.zIndex = '10';
          wrapper.style.isolation = '';
          if (img) { img.style.position = ''; img.style.zIndex = ''; }
          break;
        case 'floatBelowText':
          wrapper.style.position = 'static';
          wrapper.style.zIndex = '';
          wrapper.style.isolation = 'isolate';
          if (img) { img.style.position = 'relative'; img.style.zIndex = '-1'; }
          break;
        case 'resetTextWrap':
          wrapper.style.position = '';
          wrapper.style.zIndex = '';
          wrapper.style.isolation = '';
          if (img) { img.style.position = ''; img.style.zIndex = ''; }
          break;
      }
    });
    menu.appendChild(menuItem);
  });

  document.body.appendChild(menu);

  let hideOnOutsideClick = function (e) {
    if (e.type === 'contextmenu') {
      hideTinyImageContextMenu();
      return;
    }
    if (menu.style.display === 'block' && !menu.contains(e.target)) {
      hideTinyImageContextMenu();
    }
  };

  document.addEventListener('click', function wrapper(e) {
    if (e.__tmceImgMenuHandled) return;
    e.__tmceImgMenuHandled = true;
    setTimeout(function () {
      hideOnOutsideClick(e);
    }, 0);
  }, true);
  document.addEventListener('contextmenu', function wrapper(e) {
    if (e.__tmceImgMenuHandled) return;
    e.__tmceImgMenuHandled = true;
    hideOnOutsideClick(e);
  }, true);

  state._tmceImgCtxMenu = menu;
  return menu;
}

export function showTinyImageContextMenu(wrapper, evt) {
  state._tmceImgCtxTarget = wrapper;
  let menu = getTinyImageCtxMenu();
  let slider = menu.querySelector('input[type="range"]');
  if (slider) {
    let img = wrapper.querySelector('img');
    let curOpacity = img ? parseFloat(img.style.opacity) : NaN;
    if (isNaN(curOpacity)) curOpacity = 1;
    slider.value = curOpacity;
    let valSpan = menu.querySelector('input[type="range"] + span');
    if (valSpan) valSpan.textContent = Math.round(curOpacity * 100) + '%';
  }
  menu.style.display = 'block';
  menu.style.visibility = 'hidden';
  let menuW = menu.offsetWidth;
  let menuH = menu.offsetHeight;
  let winW = window.innerWidth;
  let winH = window.innerHeight;
  const TASKBAR = 44;
  let left = Math.min(evt.clientX + 2, winW - menuW - 4);
  let top = Math.min(evt.clientY + 2, winH - TASKBAR - menuH - 4);
  menu.style.left = Math.max(0, left) + 'px';
  menu.style.top = Math.max(0, top) + 'px';
  menu.style.visibility = 'visible';
}

function hideTinyImageContextMenu() {
  if (state._tmceImgCtxMenu) {
    state._tmceImgCtxMenu.style.display = 'none';
  }
  state._tmceImgCtxTarget = null;
}

/**
 * 同步 data-mce-style 属性与真实 style，确保 TinyMCE 序列化时读取到最新样式
 * TinyMCE 的 getContent() 对 contenteditable="false" 元素使用 data-mce-style 而非实时 style
 */
export function syncFileLinkMceStyle(el) {
  if (!el || !el.classList.contains('file-link')) return;
  el.setAttribute('data-mce-style', el.getAttribute('style'));
}

function getFileLinkCtxMenu() {
  if (state._tmceFileLinkCtxMenu) return state._tmceFileLinkCtxMenu;
  let menu = document.createElement('div');
  menu.id = 'tmceFileLinkCtxMenu';
  menu.style.cssText = 'display:none;position:fixed;z-index:9999;background:#0d1f2b;border:1px solid #2c6e7e;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,0.7);padding:6px 0;min-width:180px;';

  let items = [
    { label: '📂 打开文件所在位置', action: 'openLocation' },
    { type: 'separator' },
    { label: '↗ 上标', action: 'superscript' },
    { label: '↘ 下标', action: 'subscript' },
    { label: '🔄 恢复默认', action: 'reset' },
    { type: 'separator' },
    { label: '🎨 自定义修改按钮颜色', action: 'customColor' }
  ];

  items.forEach(function (item) {
    if (item.type === 'separator') {
      let sep = document.createElement('div');
      sep.style.cssText = 'height:1px;background:#1e3a44;margin:4px 0;';
      menu.appendChild(sep);
      return;
    }
    let menuItem = document.createElement('div');
    menuItem.style.cssText = 'padding:7px 16px;color:#dde;font-size:13px;cursor:pointer;white-space:nowrap;transition:background 0.15s;';
    menuItem.textContent = item.label;
    menuItem.addEventListener('mouseenter', function () { this.style.background = '#1a3a44'; });
    menuItem.addEventListener('mouseleave', function () { this.style.background = ''; });
    menuItem.addEventListener('click', function () {
      let el = state._tmceFileLinkCtxTarget;
      let action = item.action;
      hideFileLinkContextMenu();
      if (!el) return;
      switch (action) {
        case 'openLocation':
          if (el.classList.contains('url-link-btn')) {
            let url = el.getAttribute('data-href');
            if (url) {
              if (window.api && window.api.openExternalUrl) {
                window.api.openExternalUrl(url);
              } else {
                window.open(url, '_blank');
              }
            }
          } else {
            let href = el.getAttribute('href');
            if (href && !href.startsWith('http')) {
              if (window.api && window.api.showFileInFolder) {
                window.api.showFileInFolder(href);
              }
            } else if (href) {
              if (window.api && window.api.openExternalUrl) {
                window.api.openExternalUrl(href);
              } else {
                window.open(href, '_blank');
              }
            }
          }
          break;
        case 'superscript':
          el.style.verticalAlign = 'super';
          el.style.fontSize = '0.625em';
          el.style.padding = '0.15em 0.4em';
          el.style.gap = '0.3em';
          syncFileLinkMceStyle(el);
          break;
        case 'subscript':
          el.style.verticalAlign = 'sub';
          el.style.fontSize = '0.625em';
          el.style.padding = '0.15em 0.4em';
          el.style.gap = '0.3em';
          syncFileLinkMceStyle(el);
          break;
        case 'reset':
          el.style.verticalAlign = '';
          el.style.fontSize = '0.875em';
          el.style.padding = '0.4em 0.8em';
          el.style.gap = '0.5em';
          syncFileLinkMceStyle(el);
          break;
        case 'customColor':
          let panel = state.tinyEditor && state.tinyEditor._ensureBackcolorPanel ? state.tinyEditor._ensureBackcolorPanel() : null;
          if (!panel) return;
          panel._colorTarget = el;
          panel._originalBackground = el.style.background || getComputedStyle(el).background;
          if (panel._restoreRow) panel._restoreRow.style.display = 'block';
          if (panel._opacitySlider) panel._opacitySlider.value = '100';
          let curDisplay = document.getElementById('backcolorCurDisplay');
          if (curDisplay) curDisplay.textContent = '';
          let rect = el.getBoundingClientRect();
          setTimeout(function () {
            panel.style.left = Math.min(rect.left, window.innerWidth - 230) + 'px';
            panel.style.top = (rect.bottom + 4) + 'px';
            panel.style.display = 'block';
          }, 0);
          break;
      }
    });
    menu.appendChild(menuItem);
  });

  document.body.appendChild(menu);

  let hideOnOutsideClick = function (e) {
    if (e.type === 'contextmenu') {
      hideFileLinkContextMenu();
      return;
    }
    if (menu.style.display === 'block' && !menu.contains(e.target)) {
      hideFileLinkContextMenu();
    }
  };

  document.addEventListener('click', function wrapper(e) {
    if (e.__tmceFileMenuHandled) return;
    e.__tmceFileMenuHandled = true;
    setTimeout(function () {
      hideOnOutsideClick(e);
    }, 0);
  }, true);
  document.addEventListener('contextmenu', function wrapper(e) {
    if (e.__tmceFileMenuHandled) return;
    e.__tmceFileMenuHandled = true;
    hideOnOutsideClick(e);
  }, true);

  state._tmceFileLinkCtxMenu = menu;
  return menu;
}

export function showFileLinkContextMenu(el, evt) {
  state._tmceFileLinkCtxTarget = el;
  let menu = getFileLinkCtxMenu();
  menu.style.display = 'block';
  menu.style.visibility = 'hidden';
  let menuW = menu.offsetWidth;
  let menuH = menu.offsetHeight;
  let winW = window.innerWidth;
  let winH = window.innerHeight;
  const TASKBAR = 44;
  let left = Math.min(evt.clientX + 2, winW - menuW - 4);
  let top = Math.min(evt.clientY + 2, winH - TASKBAR - menuH - 4);
  menu.style.left = Math.max(0, left) + 'px';
  menu.style.top = Math.max(0, top) + 'px';
  menu.style.visibility = 'visible';
}

function hideFileLinkContextMenu() {
  if (state._tmceFileLinkCtxMenu) {
    state._tmceFileLinkCtxMenu.style.display = 'none';
  }
  state._tmceFileLinkCtxTarget = null;
}

// 远程图片拖拽放入编辑器
document.addEventListener('mousemove', function imageFileMousemove(e) {
  if (!state.tmceImgDragInfo) return;
  if (state.tmceImgDragInfo.isMove) {
    let dx = e.clientX - state.tmceImgDragInfo.startX;
    let dy = e.clientY - state.tmceImgDragInfo.startY;
    state.tmceImgDragInfo.wrapper.style.marginLeft = (state.tmceImgDragInfo.startMarginLeft + dx) + 'px';
    state.tmceImgDragInfo.wrapper.style.marginTop = (state.tmceImgDragInfo.startMarginTop + dy) + 'px';
  } else if (state.tmceImgDragInfo.isResize) {
    let handle = state.tmceImgDragInfo.handle;
    let dx = e.clientX - state.tmceImgDragInfo.startX;
    let dy = e.clientY - state.tmceImgDragInfo.startY;
    let aspect = state.tmceImgDragInfo.startW / (state.tmceImgDragInfo.startH || 1);
    let newW, newH;
    if (handle.classList.contains('tmce-resize-se')) {
      newW = Math.max(20, state.tmceImgDragInfo.startW + dx);
      newH = Math.max(20, state.tmceImgDragInfo.startH + dy);
    } else if (handle.classList.contains('tmce-resize-sw')) {
      newW = Math.max(20, state.tmceImgDragInfo.startW - dx);
      newH = Math.max(20, state.tmceImgDragInfo.startH + dy);
    } else if (handle.classList.contains('tmce-resize-ne')) {
      newW = Math.max(20, state.tmceImgDragInfo.startW + dx);
      newH = Math.max(20, state.tmceImgDragInfo.startH - dy);
    } else if (handle.classList.contains('tmce-resize-nw')) {
      newW = Math.max(20, state.tmceImgDragInfo.startW - dx);
      newH = Math.max(20, state.tmceImgDragInfo.startH - dy);
    }
    if (newW && newH) {
      state.tmceImgDragInfo.img.style.width = newW + 'px';
      state.tmceImgDragInfo.img.style.height = newH + 'px';
    }
  }
});

document.addEventListener('mouseup', function imageFileMouseup() {
  if (state.tmceImgDragInfo && state.tmceImgDragInfo.img) {
    state.tmceImgDragInfo.img.style.maxWidth = '';
  }
  if (state.tmceImgDragInfo && state.tmceImgDragInfo.wrapper) {
    state.tmceImgDragInfo.wrapper.classList.remove('tmce-dragging');
  }
  state.tmceImgDragInfo = null;
});