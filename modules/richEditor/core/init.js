// ============================================================
//  richEditor/init.js — 主初始化入口
// ============================================================

import { appState } from '../../module0_AppState.js';

import { modalRich, ckContainer, toolbarDock } from '../dom-refs.js';
import { state } from '../shared-state.js';
import { contentStyle } from '../content-style.js';
import { stripLineNumbersFromHTML } from './code-blocks.js';
import { bindFormulaEditor } from './formula.js';
import { saveCurrentContentCK, openRichEditorCK, closeModalCK, initSplitScreenDrag } from '../content-io.js';
import { refreshTreePanel, bindTreeSidebar } from '../tree-panel.js';

import { injectToolbarGridCSS } from './toolbar-layout.js';
import { registerToolbarButtons } from './toolbar-buttons.js';
import { bindEditorPostInit } from './editor-events.js';

export function initCKEditor() {
  if (typeof tinymce === 'undefined') {
    console.warn('TinyMCE 未加载，请检查 CDN 连接');
    return Promise.resolve(false);
  }

  let textareaId = 'tinymce-editor-textarea';
  let textareaEl = document.getElementById(textareaId);

  ckContainer.style.display = 'flex';

  // ─── 注入三栏网格 CSS ───
  injectToolbarGridCSS();

  console.log('[TinyMCE] 开始初始化, container:', ckContainer.offsetWidth, 'x', ckContainer.offsetHeight);
  console.log('[TinyMCE] tinymce 全局对象:', typeof tinymce);
  console.log('[TinyMCE] textarea:', textareaEl ? textareaEl.offsetWidth : 'null');

  return tinymce.init({
    selector: '#' + textareaId,
    license_key: 'gpl',
    promotion: false,
    branding: false,
    inline: true,
    fixed_toolbar_container: '#toolbarDock',
    language: 'zh_CN',
    language_url: 'https://cdn.tiny.cloud/1/gpl/tinymce/7/langs/zh_CN.js',
    skin_url: 'https://cdn.jsdelivr.net/npm/tinymce@7/skins/ui/oxide-dark',
    content_css: 'https://cdn.jsdelivr.net/npm/tinymce@7/skins/content/dark/content.min.css',
    content_style: contentStyle +
      'body{font-size:' + (appState.editorFontSize || 14) + 'px !important;}' +
      'span.gradient-text{background-clip:text;-webkit-background-clip:text;background-size:100% 100%;background-repeat:no-repeat;}',
    icons_url: 'https://cdn.jsdelivr.net/npm/tinymce@7/icons/default/icons.min.js',
    theme_url: 'https://cdn.jsdelivr.net/npm/tinymce@7/themes/silver/theme.min.js',
    plugin_base_url: 'https://cdn.jsdelivr.net/npm/tinymce@7/plugins/',
    plugins: [
      'advlist', 'anchor', 'autolink', 'charmap', 'code',
      'emoticons', 'fullscreen', 'image', 'importcss',
      'insertdatetime', 'link', 'lists', 'media', 'nonbreaking',
      'pagebreak', 'preview', 'quickbars', 'searchreplace',
      'table', 'visualblocks', 'visualchars'
    ],
    file_picker_types: 'image',
    file_picker_callback: function (cb, value, meta) {
      if (meta.filetype !== 'image') return;
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = function () {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function () {
          cb(reader.result, { title: file.name });
        };
        reader.readAsDataURL(file);
      };
      input.click();
    },
    toolbar: [
      // ══════ 字体 ══════
      'cnfontfamily enfontfamily fontsize fontplus fontminus charsapcing changecase removeformat charborder',
      'bold italic customunderline strikethrough customemphasis superscript subscript customforecolor custombackcolor fan2jian jian2fan pinyin',
      // ══════ 段落 ══════
      'custombullist customnumlist outdent indent dropcap',
      'alignleft aligncenter alignright myalignjustify customdistributed lineheight paraspacing blockquote hr',
      // ══════ 编辑 ══════
      'searchreplace selectall',
      // ══════ 插入 ══════
      'customtable insertTinyImage customformula customlink codeeditor customcharmap customemoticons customdatetime | insertOverlayBlock customexcel customchart customimage customshape customtextbox customaudio customvideo customslideshow customdocument fullscreen',
      // ══════ 审阅 ══════
      'customslidebreak custompresentation',
      // ══════ 布局 ══════
      'paperSize columns',
      // ══════ 图形格式 ══════
      'shapeformatInsertShape shapeformatInsertTextbox | shapeformatFill shapeformatStroke shapeformatStrokeWidth shapeformatShadow shapeformatOpacity | shapeformatWordArt shapeformatTextColor | shapeformatAlign shapeformatRotate shapeformatLayer | shapeformatDelete',
      // ══════ 绘图 ══════
      'drawPen drawPencil drawHighlighter drawEraser drawRainbow | drawColor drawSize drawLineStyle | drawUndo drawRedo drawClear | drawSave drawStop',
      // ══════ 视图 ══════
      'viewPageBtn viewWebBtn viewDarkMode'
    ],
    fontfamily_formats: [
      '默认字体=',
      '宋体=宋体, SimSun, serif',
      '仿宋=仿宋, FangSong, FangSong_GB2312, serif',
      '黑体=黑体, SimHei, Microsoft YaHei, sans-serif',
      '楷体=楷体, KaiTi, KaiTi_GB2312, serif',
      '隶书=隶书, LiSu, serif',
      '微软雅黑=微软雅黑, Microsoft YaHei, sans-serif',
      '等线=等线, Segoe UI, DengXian, sans-serif',
      '幼圆=幼圆, YouYuan, sans-serif',
      '华文仿宋=华文仿宋, STFangsong, serif',
      '华文行楷=华文行楷, STXingkai, cursive',
      '华文琥珀=华文琥珀, STHupo, cursive',
      '华文新魏=华文新魏, STXinwei, serif',
      '华文细黑=华文细黑, STXihei, Microsoft YaHei, sans-serif',
      '方正黑体=方正黑体, FZHei, FZHei-B01S, sans-serif',
      '方正楷体=方正楷体, FZKai, FZKai-Z03S, serif',
      '方正舒体=方正舒体, FZShuTi, serif',
      '方正姚体=方正姚体, FZYaoTi, serif',
      '苹方=PingFang SC, 苹方, Helvetica Neue, sans-serif',
      '思源黑体=Source Han Sans, Noto Sans CJK SC, 思源黑体, sans-serif',
      '思源宋体=Source Han Serif, Noto Serif CJK SC, 思源宋体, serif',
      '微软正黑体=微软正黑体, Microsoft JhengHei, sans-serif',
      '冬青黑体=冬青黑体, Hiragino Sans GB, Hiragino Sans, sans-serif',
      'Arial=Arial, sans-serif',
      'Times New Roman=Times New Roman, serif',
      'Calibri=Calibri, sans-serif',
      'Courier New=Courier New, monospace',
      'Georgia=Georgia, serif',
      'Verdana=Verdana, sans-serif',
      'Segoe UI=Segoe UI, sans-serif',
      'Comic Sans MS=Comic Sans MS, cursive'
    ].join(';'),
    font_size_formats: '5px 6px 7px 8px 9px 10px 11px 12px 13px 14px 15px 16px 17px 18px 19px 20px 22px 24px 26px 28px 30px 32px 34px 36px 38px 40px 42px 44px 48px 52px 56px 60px 64px 68px 72px',
    font_size_style_values: '5px,6px,7px,8px,9px,10px,11px,12px,13px,14px,15px,16px,17px,18px,19px,20px,22px,24px,26px,28px,30px,32px,34px,36px,38px,40px,42px,44px,48px,52px,56px,60px,64px,68px,72px',
    line_height_formats: '1 1.1 1.15 1.2 1.3 1.4 1.5 1.6 1.7 1.8 1.9 2 2.1 2.2 2.3 2.4 2.5 2.6 2.7 2.8 2.9 3',
    indentation: '1em',
    style_formats: [
      { title: '正文', block: 'p', styles: { fontSize: '14px', lineHeight: '1.6', margin: '0 0 8px', padding: '0' } },
      { title: '标题1', block: 'h1', styles: { fontSize: '28px', fontWeight: 'bold', color: '#1a1a1a', margin: '0 0 8px', padding: '0' } },
      { title: '标题2', block: 'h2', styles: { fontSize: '24px', fontWeight: 'bold', color: '#2a2a2a', margin: '0 0 6px', padding: '0' } },
      { title: '标题3', block: 'h3', styles: { fontSize: '20px', fontWeight: 'bold', color: '#3a3a3a', margin: '0 0 4px', padding: '0' } },
      { title: '标题4', block: 'h4', styles: { fontSize: '16px', fontWeight: 'bold', color: '#444', margin: '0 0 4px', padding: '0' } },
      { title: '标题5', block: 'h5', styles: { fontSize: '14px', fontWeight: 'bold', color: '#555', margin: '0 0 4px', padding: '0' } },
      { title: '引用', block: 'blockquote', styles: { fontSize: '14px', borderLeft: '3px solid #6a9fb5', padding: '4px 12px', margin: '8px 0', color: '#666' } },
      { title: '代码块', block: 'pre', styles: { fontFamily: 'Consolas, monospace', fontSize: '13px', background: '#1e1e2e', padding: '12px', borderRadius: '4px' } },
      { title: '标记', inline: 'mark', styles: { background: '#fff3cd', padding: '2px 4px', borderRadius: '2px' } },
    ],
    menubar: false,
    statusbar: false,
    resize: false,
    quickbars_insert_toolbar: false,
    quickbars_selection_toolbar: false,
    toolbar_persist: true,
    table_toolbar: 'tableprops tabledelete | tableinsertrowbefore tableinsertrowafter tabledeleterow | tableinsertcolbefore tableinsertcolafter tabledeletecol',
    image_title: true,
    link_default_target: '_blank',
    paste_data_images: false,
    importcss_append: true,
    valid_styles: {
      span: 'color,font-size,font-family,font-style,font-weight,letter-spacing,text-decoration,vertical-align,background-color,background-image,background,transform,transform-origin,display,margin-right,margin-left,margin-top,margin-bottom,text-emphasis,-webkit-text-emphasis,text-emphasis-position,-webkit-text-emphasis-position,position,left,bottom,font-size,line-height,white-space,pointer-events,overflow,text-align,text-align-last,text-indent,padding-left,padding-right,padding-top,padding-bottom,-webkit-text-fill-color,-webkit-background-clip,background-clip',
      '*': 'color,font-size,font-family,font-style,font-weight,letter-spacing,text-decoration,vertical-align,background-color,background-image,background,transform,transform-origin,display,height,width,margin,margin-right,margin-left,margin-top,margin-bottom,padding,padding-left,padding-right,padding-top,padding-bottom,border,text-align,text-align-last,text-indent,float,border-radius,opacity,box-shadow,text-emphasis,-webkit-text-emphasis,text-emphasis-position,-webkit-text-emphasis-position,position,left,bottom,line-height,white-space,pointer-events,overflow,-webkit-text-fill-color,-webkit-background-clip,background-clip,gap,align-items,flex-direction,flex-wrap,justify-content,cursor,user-select'
    },
    extended_valid_elements: 'svg[*],line[*],polygon[*],rect[*],ellipse[*],path[*],circle[*],g[*],defs[*],use[*],text[*],div[contenteditable|data-block-id|data-min-height|class|style|min-height]',
    setup: function (editor) {
      editor.on('GetContent', function (e) {
        e.content = stripLineNumbersFromHTML(e.content);
      });

      editor.on('BeforeExecCommand', function (e) {
        if (e.command === 'mceCodeSample') {
          let node = editor.selection.getNode();
          if (node && node.closest('.tmce-code-wrapper')) {
            e.preventDefault();
          }
        }

        if (e.command === 'alignleft' || e.command === 'JustifyLeft' || e.command === 'aligncenter' || e.command === 'JustifyCenter' || e.command === 'alignright' || e.command === 'JustifyRight' || e.command === 'alignjustify' || e.command === 'JustifyFull') {
          let selNode = editor.selection.getNode();
          let wrapper = selNode && selNode.closest ? selNode.closest('.tmce-resizable-image-wrapper') : null;
          if (!wrapper) return;
          e.preventDefault();
          let img = wrapper.querySelector('img');
          if (e.command === 'alignleft' || e.command === 'JustifyLeft') {
            wrapper.style.cssFloat = 'left';
            wrapper.style.display = 'inline-block';
            wrapper.style.marginLeft = '';
            wrapper.style.marginRight = '';
            if (img) { img.style.cssFloat = ''; img.style.display = ''; img.style.marginLeft = ''; img.style.marginRight = ''; }
          } else if (e.command === 'aligncenter' || e.command === 'JustifyCenter') {
            wrapper.style.cssFloat = '';
            wrapper.style.display = 'block';
            wrapper.style.marginLeft = 'auto';
            wrapper.style.marginRight = 'auto';
            if (img) { img.style.cssFloat = ''; img.style.display = ''; img.style.marginLeft = ''; img.style.marginRight = ''; }
          } else if (e.command === 'alignright' || e.command === 'JustifyRight') {
            wrapper.style.cssFloat = 'right';
            wrapper.style.display = 'inline-block';
            wrapper.style.marginLeft = '';
            wrapper.style.marginRight = '';
            if (img) { img.style.cssFloat = ''; img.style.display = ''; img.style.marginLeft = ''; img.style.marginRight = ''; }
          } else if (e.command === 'alignjustify' || e.command === 'JustifyFull') {
            wrapper.style.cssFloat = '';
            wrapper.style.display = 'block';
            wrapper.style.marginLeft = 'auto';
            wrapper.style.marginRight = 'auto';
            if (img) { img.style.cssFloat = ''; img.style.display = ''; img.style.marginLeft = ''; img.style.marginRight = ''; }
          }
        }

        });

      // 任何对齐命令执行后，清除 text-align-last 残留，确保能从"分散对齐"切换出去
      editor.on('ExecCommand', function (e) {
        if (e.command === 'JustifyLeft' || e.command === 'JustifyCenter' || e.command === 'JustifyRight' || e.command === 'JustifyFull' ||
            e.command === 'alignleft' || e.command === 'aligncenter' || e.command === 'alignright' || e.command === 'alignjustify') {
          requestAnimationFrame(function () {
            let node = editor.selection.getNode();
            let block = editor.dom.getParent(node, 'p,div,h1,h2,h3,h4,h5,h6,li,blockquote');
            if (block && editor.dom.getStyle(block, 'text-align-last') === 'justify') {
              editor.dom.setStyle(block, 'text-align-last', '');
            }
          });
        }
      });

      editor._isComposing = false;
      editor.on('compositionstart', function () {
        editor._isComposing = true;
      });
      editor.on('compositionend', function () {
        editor._isComposing = false;
        setTimeout(function () {
          let body = editor.getBody();
          if (!body) return;
          let spans = body.querySelectorAll('span.tmce-backcolor, span.gradient-bg');
          for (let i = 0; i < spans.length; i++) {
            let s = spans[i];
            if (!s.parentNode) continue;
            let text = s.textContent || '';
            if (text.trim().length === 0) {
              try { editor.dom.remove(s); } catch (e) {}
              continue;
            }
            if (s.childNodes.length === 0 && s.textContent) continue;
            let hasBrokenChild = false;
            for (let ci = 0; ci < s.childNodes.length; ci++) {
              let child = s.childNodes[ci];
              if (child.nodeType === 1) {
                let ctag = child.nodeName;
                if (ctag !== 'SPAN' && ctag !== 'RUBY' && ctag !== 'RT' && ctag !== 'RP' && ctag !== 'U' && ctag !== 'EM' && ctag !== 'STRONG' && ctag !== 'B' && ctag !== 'I' && ctag !== 'SUB' && ctag !== 'SUP') {
                  hasBrokenChild = true;
                  break;
                }
              }
            }
            if (hasBrokenChild) {
              let bgStyle = s.style.backgroundColor || '';
              let bgImg = s.style.backgroundImage || '';
              let origGrad = s.dataset.originalGradient || '';
              let isGrad = s.classList.contains('gradient-bg');
              let frag = document.createDocumentFragment();
              while (s.firstChild) {
                frag.appendChild(s.firstChild);
              }
              let parent = s.parentNode;
              let next = s.nextSibling;
              parent.removeChild(s);
              let newSpan = document.createElement('span');
              if (isGrad) {
                newSpan.className = 'gradient-bg';
                newSpan.style.backgroundImage = bgImg;
                if (origGrad) newSpan.dataset.originalGradient = origGrad;
              } else if (bgStyle) {
                newSpan.style.backgroundColor = bgStyle;
              }
              newSpan.appendChild(frag);
              parent.insertBefore(newSpan, next);
            }
          }
        }, 50);
      });
      registerToolbarButtons(editor);

      function fetchPageTitle(url) {
        if (window.api && window.api.fetchPageTitle) {
          return window.api.fetchPageTitle(url);
        }
        return new Promise(function (resolve) {
          try {
            let xhr = new XMLHttpRequest();
            xhr.open('GET', url, true);
            xhr.timeout = 8000;
            xhr.onload = function () {
              if (xhr.status >= 200 && xhr.status < 400) {
                let match = xhr.responseText.match(/<title[^>]*>([^<]+)<\/title>/i);
                resolve(match ? match[1].trim() : null);
              } else {
                resolve(null);
              }
            };
            xhr.onerror = function () { resolve(null); };
            xhr.ontimeout = function () { resolve(null); };
            xhr.send();
          } catch (e) {
            resolve(null);
          }
        });
      }

      function openLinkUrl(url) {
        if (url.startsWith('http://') || url.startsWith('https://')) {
          if (window.api && window.api.openExternalUrl) {
            window.api.openExternalUrl(url);
          } else {
            window.open(url, '_blank');
          }
        } else if (url.startsWith('file:')) {
          if (window.api && window.api.openLocalFile) {
            window.api.openLocalFile(url);
          }
        }
      }

      editor.on('paste', function (e) {
        if (!e.clipboardData) return;
        const text = e.clipboardData.getData('text/plain');
        if (!text) return;
        const urlRegex = /(https?:\/\/[^\s]+)/gi;
        const urls = text.match(urlRegex);
        if (urls && urls.length > 0 && urls[0] === text.trim()) {
          e.preventDefault();
          const url = urls[0];
          const urlLinkHtml = '<span ' +
            'class="file-link url-link-btn" ' +
            'contenteditable="false" ' +
            'data-href="' + url + '" ' +
            'style="display:inline-flex;align-items:center;gap:0.5em;padding:0.4em 0.8em;' +
            'background:linear-gradient(135deg,#2c6e7e,#1a3a44);color:#fff!important;border-radius:1em;font-size:0.875em;' +
            'text-decoration:none;border:1px solid rgba(0,255,255,0.3);margin:0.25em;cursor:pointer;">' +
            '🔗 ' + url +
            '</span>\u200B';
          editor.insertContent(urlLinkHtml);

          fetchPageTitle(url).then(function (title) {
            if (!title) return;
            let spans = editor.dom.select('span.url-link-btn[data-href="' + url + '"]');
            spans.forEach(function (sp) {
              sp.textContent = '🔗 ' + title;
            });
          });
        } else if (urls && urls.length > 0) {
          e.preventDefault();
          let processed = text;
          urls.forEach(function (url) {
            let urlLinkHtml = '<span ' +
              'class="file-link url-link-btn" ' +
              'contenteditable="false" ' +
              'data-href="' + url + '" ' +
              'style="display:inline-flex;align-items:center;gap:0.5em;padding:0.4em 0.8em;' +
              'background:linear-gradient(135deg,#2c6e7e,#1a3a44);color:#fff!important;border-radius:1em;font-size:0.875em;' +
              'text-decoration:none;border:1px solid rgba(0,255,255,0.3);margin:0.25em;cursor:pointer;">' +
              '🔗 ' + url +
              '</span>\u200B';
            processed = processed.split(url).join(urlLinkHtml);
            fetchPageTitle(url).then(function (title) {
              if (!title) return;
              let spans = editor.dom.select('span.url-link-btn[data-href="' + url + '"]');
              spans.forEach(function (sp) {
                sp.textContent = '🔗 ' + title;
              });
            });
          });
          editor.insertContent(processed);
        }
      });

      editor.on('click', function (e) {
        let link = e.target.closest('a');
        if (link && link.href) {
          e.preventDefault();
          let url = link.getAttribute('href');
          openLinkUrl(url);
          return;
        }
        let urlBtn = e.target.closest('.url-link-btn');
        if (urlBtn) {
          e.preventDefault();
          let url = urlBtn.getAttribute('data-href');
          if (url) openLinkUrl(url);
        }
      });

      editor.on('SkinLoaded', function () {
        console.log('[TinyMCE] 皮肤加载完成');

        setTimeout(function () {
          let toggleBtn = toolbarDock.querySelector('[title="展开/折叠工具栏"]');
          if (toggleBtn) {
            toggleBtn.setAttribute('data-toolbar-toggle', '1');
            toggleBtn.innerHTML = '▲';
            toggleBtn.title = '展开/折叠工具栏';
            toggleBtn.addEventListener('click', function (e) {
              e.preventDefault();
              e.stopPropagation();
              toolbarDock.classList.toggle('tmce-toolbar-collapsed');
              toggleBtn.innerHTML = toolbarDock.classList.contains('tmce-toolbar-collapsed') ? '▼' : '▲';
            });
          }
          ckContainer.style.display = 'flex';
        }, 300);

      });
    }
  }).then(function (editors) {
    bindEditorPostInit(editors);

    // ── 恢复浅色模式状态 ──
    setTimeout(function () {
      if (localStorage.getItem('richEditor_lightMode') === '1') {
        const ck = document.getElementById('ckEditorContainer');
        if (ck) {
          ck.classList.add('editor-light-mode');
          const editor = tinymce.activeEditor;
          if (editor && editor.getBody()) {
            editor.getBody().style.color = '#333333';
            editor.getBody().style.backgroundColor = '#ffffff';
          }
          // 更新按钮图标和文字（浅色模式下显示月亮+深色模式）
          setTimeout(function () {
            if (window.__viewModeUpdateBtn) window.__viewModeUpdateBtn(true);
          }, 300);
        }
      }
    }, 200);

    return true;
  }).catch(function (err) {
    console.error('[TinyMCE] 初始化失败:', err);
    return false;
  });
}

export function saveCurrentContent() {
  saveCurrentContentCK();
}

export function openRichEditor(nodeIdOrNull, quickNoteId = null) {
  // 如果是快速笔记，直接打开富文本编辑器
  if (quickNoteId) {
    openRichEditorCK(nodeIdOrNull, quickNoteId, initCKEditor);
    return;
  }
  
  // 检查节点类型
  const node = appState.nodeMap.get(nodeIdOrNull);
  // 普通节点，打开富文本编辑器
  openRichEditorCK(nodeIdOrNull, quickNoteId, initCKEditor);
}

export function closeModal() {
  closeModalCK();
}

export function initRichEditor() {
  initCKEditor();
  initSplitScreenDrag();
  bindFormulaEditor();
  bindTreeSidebar();

  const formulaModal = document.getElementById('formulaEditorModal');
  if (formulaModal && formulaModal.parentNode) {
    document.body.appendChild(formulaModal);
  }

  const safeClick = (id, fn) => {
    const el = document.getElementById(id);
    if (el) el.onclick = fn;
  };

  safeClick('closeModalBtn', closeModal);
  safeClick('toggleToolbarBtn', () => document.getElementById('richToolbar').classList.toggle('collapsed'));

  safeClick('saveRichContentBtn', saveCurrentContent);
  safeClick('exportWordBtn', () => {
    const content = state.tinyEditor ? state.tinyEditor.getContent() : '';
    const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>笔记导出</title><style>body{font-family:system-ui;padding:20px;}</style></head><body>' + content + '</body></html>';
    const blob = new Blob([html], { type: 'application/msword' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '笔记导出.doc';
    a.click();
    URL.revokeObjectURL(a.href);
  });
  safeClick('exportPdfBtn', () => {
    const content = state.tinyEditor ? state.tinyEditor.getContent() : '';
    const pw = window.open('', '_blank', 'width=800,height=600');
    pw.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>打印</title><style>body{font-family:system-ui;padding:20px;}</style></head><body>' + content + '</body></html>');
    pw.document.close();
    pw.focus();
    setTimeout(() => pw.print(), 500);
  });
  safeClick('clearFormatBtn', () => {
    if (state.tinyEditor) {
      state.tinyEditor.execCommand('RemoveFormat');
    }
  });

  safeClick('insertFormulaBtn', () => {
    // Handled by bindFormulaEditor
  });
}

window.refreshTreePanel = refreshTreePanel;

window.forceRefreshTreePanel = function() {
  const treeSidebar = document.getElementById('treeSidebar');
  const toggleTreeBtn = document.getElementById('toggleTreeBtn');
  if (!treeSidebar || !toggleTreeBtn) return;
  const wasCollapsed = treeSidebar.classList.contains('collapsed');
  if (wasCollapsed) {
    toggleTreeBtn.click();
  } else {
    if (typeof refreshTreePanel === 'function') refreshTreePanel();
  }
};