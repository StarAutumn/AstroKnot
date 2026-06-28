// ============================================================
//  overlay/overlay-image-editor.js — 图片高级编辑器
// ============================================================

import { transactRender } from './overlay-images.js';

//  图片编辑器（裁剪 / 旋转 / 翻转 / 参数调整）
//  依赖: Cropper.js (MIT)
// ============================================================

let editorModal = null;
let editorCanvas = null;
let editorCtx = null;
let editorCropper = null;
let editorImgData = null;
let editorOriginalSrc = null;
let editorWorkingSrc = null;
let editorOriginalW = null;
let editorOriginalH = null;

function createEditorModal() {
  if (editorModal && editorModal.parentNode) return;

  let C = {
    bg0: '#0a1620', bg1: '#0d1f2b', bg2: '#142835', bg3: '#1a3a44',
    accent: '#2c6e7e', accentH: '#3a8090', accentA: '#4a9eae',
    txt: '#aef0ff', txt2: '#8899aa', hi: '#00e5ff',
    border: '#1a3a44', danger: '#ff6666', green: '#99ffcc',
    redBtn: '#3a2a2a', redBd: '#6a4a4a', redTxt: '#ff9999',
    greenBtn: '#2a5a4a', greenBd: '#4a8a6a'
  };

  let btnStyle =
    'display:block;width:100%;padding:8px 12px;border:1px solid ' + C.border + ';border-radius:6px;' +
    'background:' + C.bg2 + ';color:' + C.txt2 + ';cursor:pointer;font-size:12px;' +
    'text-align:left;transition:all 0.15s;margin-bottom:4px;';
  let sliderCSS =
    'width:100%;margin-bottom:8px;';
  let labelCSS = 'display:flex;justify-content:space-between;margin-bottom:2px;';
  let fmtSubCSS = 'color:' + C.txt2 + ';font-size:10px;margin:8px 0 4px;text-transform:uppercase;letter-spacing:0.5px;' +
    'padding-top:6px;border-top:1px solid ' + C.border + ';';
  let fmtRowCSS = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;';
  let fmtLabelCSS = 'color:' + C.txt2 + ';font-size:10px;white-space:nowrap;';
  let fmtInputCSS =
    'background:' + C.bg3 + ';border:1px solid ' + C.border + ';color:' + C.txt + ';' +
    'border-radius:3px;padding:2px 5px;font-size:10px;width:80px;';
  let fmtSelectCSS =
    'background:' + C.bg3 + ';border:1px solid ' + C.border + ';color:' + C.txt + ';' +
    'border-radius:3px;padding:2px 4px;font-size:10px;';
  let fmtColorCSS = 'width:26px;height:20px;border:1px solid ' + C.border + ';border-radius:3px;' +
    'cursor:pointer;padding:0;background:transparent;';
  let fmtSecHeader = 'padding:8px 10px;cursor:pointer;font-size:11px;font-weight:600;color:' + C.txt + ';' +
    'display:flex;align-items:center;gap:6px;border-bottom:1px solid ' + C.border + ';' +
    'background:' + C.bg2 + ';user-select:none;';
  let fmtSecBody = 'padding:6px 10px;overflow:hidden;';

  editorModal = document.createElement('div');
  editorModal.id = 'olyEditorModal';
  editorModal.style.cssText =
    'position:fixed;z-index:100000;inset:0;background:rgba(0,0,0,0.85);' +
    'display:flex;align-items:center;justify-content:center;';

  editorModal.innerHTML =
    '<div id="olyEditorPanel" style="' +
      'background:' + C.bg1 + ';border:1px solid ' + C.accent + ';border-radius:12px;' +
      'width:96vw;height:94vh;display:flex;flex-direction:column;overflow:hidden;' +
    '">' +

      // ── header ──
      '<div style="display:flex;align-items:center;justify-content:space-between;' +
        'padding:10px 16px;background:' + C.bg0 + ';border-bottom:1px solid ' + C.border + ';flex-shrink:0;">' +
        '<span style="color:' + C.txt + ';font-weight:600;font-size:14px;">图片编辑</span>' +
        '<div style="display:flex;gap:6px;">' +
          '<button id="olyEditorReset" style="background:' + C.bg2 + ';border:1px solid ' + C.accent + ';color:' + C.txt2 + ';' +
            'padding:5px 14px;border-radius:5px;cursor:pointer;font-size:12px;">重置</button>' +
          '<button id="olyEditorCancel" style="background:' + C.redBtn + ';border:1px solid ' + C.redBd + ';color:' + C.redTxt + ';' +
            'padding:5px 14px;border-radius:5px;cursor:pointer;font-size:12px;">取消</button>' +
          '<button id="olyEditorApply" style="background:' + C.greenBtn + ';border:1px solid ' + C.greenBd + ';color:' + C.green + ';' +
            'padding:5px 18px;border-radius:5px;cursor:pointer;font-size:12px;font-weight:600;">应用</button>' +
        '</div>' +
      '</div>' +

      // ── body: sidebar + canvas + format panel ──
      '<div style="flex:1;display:flex;overflow:hidden;">' +

        // ── left sidebar: tool buttons only ──
        '<div style="width:160px;flex-shrink:0;background:' + C.bg0 + ';border-right:1px solid ' + C.border + ';' +
          'padding:10px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;">' +
          '<div style="color:' + C.txt2 + ';font-size:10px;text-transform:uppercase;margin-bottom:6px;letter-spacing:1px;">工具</div>' +
          '<div id="olyEditorToolbar">' +
            '<button class="oly-edit-tool oly-tool-active" data-tool="adjust" style="' + btnStyle + '">⚙ 调整参数</button>' +
            '<button class="oly-edit-tool" data-tool="filter" style="' + btnStyle + '">🎨 滤镜预设</button>' +
            '<button class="oly-edit-tool" data-tool="crop" style="' + btnStyle + '">✂ 裁剪</button>' +
            '<button class="oly-edit-tool" data-tool="rotate" style="' + btnStyle + '">↻ 旋转 90°</button>' +
            '<button class="oly-edit-tool" data-tool="freeRotate" style="' + btnStyle + '">🔄 自由旋转</button>' +
            '<button class="oly-edit-tool" data-tool="flipH" style="' + btnStyle + '">⇔ 水平翻转</button>' +
            '<button class="oly-edit-tool" data-tool="flipV" style="' + btnStyle + '">⇕ 垂直翻转</button>' +
            '<button class="oly-edit-tool" data-tool="draw" style="' + btnStyle + '">🖌 画笔标注</button>' +
            '<button class="oly-edit-tool" data-tool="text" style="' + btnStyle + '">T 文字水印</button>' +
          '</div>' +
        '</div>' +

        // ── center canvas area ──
        '<div id="olyEditorCanvasWrap" style="flex:1;overflow:visible;display:flex;align-items:center;' +
          'justify-content:center;background:' + C.bg0 + ';padding:30px;position:relative;">' +
          '<canvas id="olyEditorCanvas" style="max-width:100%;max-height:100%;display:block;"></canvas>' +
          // 画笔覆盖层（画笔模式下显示）
          '<canvas id="olyDrawOverlay" style="position:absolute;top:0;left:0;pointer-events:none;display:none;cursor:crosshair;"></canvas>' +
          // 文字输入框（文字模式下显示）
          '<div id="olyTextInputWrap" style="display:none;position:absolute;z-index:10;">' +
            '<textarea id="olyTextInput" placeholder="输入文字..." style="' +
              'background:rgba(0,0,0,0.5);border:2px dashed ' + C.hi + ';color:#fff;font-size:24px;' +
              'padding:4px 8px;resize:both;min-width:60px;min-height:32px;outline:none;border-radius:4px;"></textarea>' +
          '</div>' +
        '</div>' +

        // ── right format panel (260px, collapsible sections) ──
        '<div id="olyFormatPanel" style="width:260px;flex-shrink:0;background:' + C.bg0 + ';' +
          'border-left:1px solid ' + C.border + ';overflow-y:auto;overflow-x:hidden;' +
          'display:flex;flex-direction:column;transition:width 0.25s;position:relative;">' +

          // panel toggle button
          '<div id="olyFmtPanelToggle" title="折叠面板" style="position:absolute;left:0;top:50%;transform:translateY(-50%);' +
            'width:8px;height:40px;background:' + C.accent + ';border-radius:4px 0 0 4px;cursor:pointer;' +
            'display:flex;align-items:center;justify-content:center;z-index:5;">' +
            '<span id="olyFmtPanelToggleArrow" style="color:' + C.txt + ';font-size:8px;">◀</span>' +
          '</div>' +

          // ── 填充与线条 ──
          '<div class="oly-fmt-section" style="border-bottom:1px solid ' + C.border + ';">' +
            '<div class="oly-fmt-header" data-section="fillLine" style="' + fmtSecHeader + '">' +
              '<span class="oly-fmt-arrow">▼</span> 填充与线条</div>' +
            '<div class="oly-fmt-body" id="olyFmtFillLine" style="' + fmtSecBody + '">' +
              '<div style="' + fmtSubCSS + 'border-top:none;padding-top:0;">填充</div>' +
              '<div style="' + fmtRowCSS + '">' +
                '<span style="' + fmtLabelCSS + '">透明度</span>' +
                '<span style="color:' + C.txt + ';font-size:10px;" id="olyAdjOpacityVal">100%</span></div>' +
              '<input type="range" id="olyAdjOpacity" min="0" max="100" value="100" style="' + sliderCSS + '">' +
              '<div style="' + fmtSubCSS + '">线条</div>' +
              '<div style="' + fmtRowCSS + '">' +
                '<span style="' + fmtLabelCSS + '">颜色</span>' +
                '<input type="color" id="olyFmtBorderColor" value="#aef0ff" style="' + fmtColorCSS + '">' +
              '</div>' +
              '<div style="' + fmtRowCSS + '">' +
                '<span style="' + fmtLabelCSS + '">宽度</span>' +
                '<input type="number" id="olyFmtBorderWidth" min="0" max="50" value="0" style="' + fmtInputCSS + ';width:46px;">' +
                '<span style="color:' + C.txt2 + ';font-size:10px;">px</span>' +
              '</div>' +
              '<div style="' + fmtRowCSS + '">' +
                '<span style="' + fmtLabelCSS + '">线型</span>' +
                '<select id="olyFmtBorderStyle" style="' + fmtSelectCSS + '">' +
                  '<option value="solid">实线</option>' +
                  '<option value="dashed">虚线</option>' +
                  '<option value="dotted">点线</option>' +
                  '<option value="double">双线</option>' +
                  '<option value="groove">凹槽</option>' +
                  '<option value="ridge">凸起</option>' +
                '</select>' +
              '</div>' +
            '</div>' +
          '</div>' +

          // ── 效果 ──
          '<div class="oly-fmt-section" style="border-bottom:1px solid ' + C.border + ';">' +
            '<div class="oly-fmt-header" data-section="effects" style="' + fmtSecHeader + '">' +
              '<span class="oly-fmt-arrow">▼</span> 效果</div>' +
            '<div class="oly-fmt-body" id="olyFmtEffects" style="' + fmtSecBody + '">' +
              '<div style="' + fmtSubCSS + 'border-top:none;padding-top:0;">阴影</div>' +
              '<div style="' + fmtRowCSS + '">' +
                '<span style="' + fmtLabelCSS + '">颜色</span>' +
                '<input type="color" id="olyFmtShadowColor" value="#000000" style="' + fmtColorCSS + '">' +
              '</div>' +
              '<div style="' + fmtRowCSS + '">' +
                '<span style="' + fmtLabelCSS + '">透明度</span>' +
                '<span style="color:' + C.txt + ';font-size:10px;" id="olyFmtShadowOpVal">50%</span></div>' +
              '<input type="range" id="olyFmtShadowOpacity" min="0" max="100" value="50" style="' + sliderCSS + '">' +
              '<div style="' + fmtRowCSS + '">' +
                '<span style="' + fmtLabelCSS + '">模糊</span>' +
                '<span style="color:' + C.txt + ';font-size:10px;" id="olyFmtShadowBlurVal">10px</span></div>' +
              '<input type="range" id="olyFmtShadowBlur" min="0" max="100" value="10" style="' + sliderCSS + '">' +
              '<div style="' + fmtRowCSS + '">' +
                '<span style="' + fmtLabelCSS + '">水平距离</span>' +
                '<span style="color:' + C.txt + ';font-size:10px;" id="olyFmtShadowXVal">3px</span></div>' +
              '<input type="range" id="olyFmtShadowX" min="-100" max="100" value="3" style="' + sliderCSS + '">' +
              '<div style="' + fmtRowCSS + '">' +
                '<span style="' + fmtLabelCSS + '">垂直距离</span>' +
                '<span style="color:' + C.txt + ';font-size:10px;" id="olyFmtShadowYVal">3px</span></div>' +
              '<input type="range" id="olyFmtShadowY" min="-100" max="100" value="3" style="' + sliderCSS + '">' +

              '<div style="' + fmtSubCSS + '">映像</div>' +
              '<div style="' + fmtRowCSS + '">' +
                '<span style="' + fmtLabelCSS + '">透明度</span>' +
                '<span style="color:' + C.txt + ';font-size:10px;" id="olyFmtReflectOpVal">0%</span></div>' +
              '<input type="range" id="olyFmtReflectOpacity" min="0" max="100" value="0" style="' + sliderCSS + '">' +
              '<div style="' + fmtRowCSS + '">' +
                '<span style="' + fmtLabelCSS + '">大小</span>' +
                '<span style="color:' + C.txt + ';font-size:10px;" id="olyFmtReflectSizeVal">0%</span></div>' +
              '<input type="range" id="olyFmtReflectSize" min="0" max="100" value="0" style="' + sliderCSS + '">' +
              '<div style="' + fmtRowCSS + '">' +
                '<span style="' + fmtLabelCSS + '">距离</span>' +
                '<span style="color:' + C.txt + ';font-size:10px;" id="olyFmtReflectDistVal">0px</span></div>' +
              '<input type="range" id="olyFmtReflectDistance" min="0" max="50" value="0" style="' + sliderCSS + '">' +

              '<div style="' + fmtSubCSS + '">发光</div>' +
              '<div style="' + fmtRowCSS + '">' +
                '<span style="' + fmtLabelCSS + '">颜色</span>' +
                '<input type="color" id="olyFmtGlowColor" value="#aef0ff" style="' + fmtColorCSS + '">' +
              '</div>' +
              '<div style="' + fmtRowCSS + '">' +
                '<span style="' + fmtLabelCSS + '">大小</span>' +
                '<span style="color:' + C.txt + ';font-size:10px;" id="olyFmtGlowSizeVal">0px</span></div>' +
              '<input type="range" id="olyFmtGlowSize" min="0" max="100" value="0" style="' + sliderCSS + '">' +
              '<div style="' + fmtRowCSS + '">' +
                '<span style="' + fmtLabelCSS + '">透明度</span>' +
                '<span style="color:' + C.txt + ';font-size:10px;" id="olyFmtGlowOpVal">0%</span></div>' +
              '<input type="range" id="olyFmtGlowOpacity" min="0" max="100" value="0" style="' + sliderCSS + '">' +

              '<div style="' + fmtSubCSS + '">柔化边缘</div>' +
              '<div style="' + fmtRowCSS + '">' +
                '<span style="' + fmtLabelCSS + '">大小</span>' +
                '<span style="color:' + C.txt + ';font-size:10px;" id="olyFmtSoftEdgeVal">0px</span></div>' +
              '<input type="range" id="olyFmtSoftEdge" min="0" max="100" value="0" style="' + sliderCSS + '">' +
            '</div>' +
          '</div>' +

          // ── 图片 ──
          '<div class="oly-fmt-section" style="border-bottom:1px solid ' + C.border + ';">' +
            '<div class="oly-fmt-header" data-section="picture" style="' + fmtSecHeader + '">' +
              '<span class="oly-fmt-arrow">▼</span> 图片</div>' +
            '<div class="oly-fmt-body" id="olyFmtPicture" style="' + fmtSecBody + '">' +
              '<div style="' + fmtSubCSS + 'border-top:none;padding-top:0;">图片更正</div>' +
              '<div style="' + fmtRowCSS + '">' +
                '<span style="' + fmtLabelCSS + '">亮度</span>' +
                '<span style="color:' + C.txt + ';font-size:10px;" id="olyAdjBrightVal">100%</span></div>' +
              '<input type="range" id="olyAdjBrightness" min="0" max="200" value="100" style="' + sliderCSS + '">' +
              '<div style="' + fmtRowCSS + '">' +
                '<span style="' + fmtLabelCSS + '">对比度</span>' +
                '<span style="color:' + C.txt + ';font-size:10px;" id="olyAdjContrastVal">100%</span></div>' +
              '<input type="range" id="olyAdjContrast" min="0" max="200" value="100" style="' + sliderCSS + '">' +
              '<div style="' + fmtSubCSS + '">图片颜色</div>' +
              '<div style="' + fmtRowCSS + '">' +
                '<span style="' + fmtLabelCSS + '">饱和度</span>' +
                '<span style="color:' + C.txt + ';font-size:10px;" id="olyAdjSatVal">100%</span></div>' +
              '<input type="range" id="olyAdjSaturation" min="0" max="200" value="100" style="' + sliderCSS + '">' +
              '<div style="' + fmtRowCSS + '">' +
                '<span style="' + fmtLabelCSS + '">色调</span>' +
                '<span style="color:' + C.txt + ';font-size:10px;" id="olyAdjHueVal">0°</span></div>' +
              '<input type="range" id="olyAdjHue" min="0" max="360" value="0" style="' + sliderCSS + '">' +
              '<div style="' + fmtRowCSS + '">' +
                '<span style="' + fmtLabelCSS + '">模糊</span>' +
                '<span style="color:' + C.txt + ';font-size:10px;" id="olyAdjBlurVal">0px</span></div>' +
              '<input type="range" id="olyAdjBlur" min="0" max="20" value="0" style="' + sliderCSS + '">' +
            '</div>' +
          '</div>' +

          // ── 滤镜预设 ──
          '<div class="oly-fmt-section" style="border-bottom:1px solid ' + C.border + ';">' +
            '<div class="oly-fmt-header" data-section="filterPresets" style="' + fmtSecHeader + '">' +
              '<span class="oly-fmt-arrow">▼</span> 滤镜预设</div>' +
            '<div class="oly-fmt-body" id="olyFmtFilterPresets" style="' + fmtSecBody + '">' +
              '<div id="olyFilterGrid" style="display:grid;grid-template-columns:1fr 1fr;gap:4px;">' +
                '<button class="oly-filter-preset oly-filter-active" data-filter="none" style="' +
                  'padding:6px;border:1px solid ' + C.border + ';border-radius:4px;background:' + C.bg2 + ';' +
                  'color:' + C.txt2 + ';font-size:10px;cursor:pointer;text-align:center;">原图</button>' +
                '<button class="oly-filter-preset" data-filter="grayscale" style="' +
                  'padding:6px;border:1px solid ' + C.border + ';border-radius:4px;background:' + C.bg2 + ';' +
                  'color:' + C.txt2 + ';font-size:10px;cursor:pointer;text-align:center;">灰度</button>' +
                '<button class="oly-filter-preset" data-filter="invert" style="' +
                  'padding:6px;border:1px solid ' + C.border + ';border-radius:4px;background:' + C.bg2 + ';' +
                  'color:' + C.txt2 + ';font-size:10px;cursor:pointer;text-align:center;">反色</button>' +
                '<button class="oly-filter-preset" data-filter="sepia" style="' +
                  'padding:6px;border:1px solid ' + C.border + ';border-radius:4px;background:' + C.bg2 + ';' +
                  'color:' + C.txt2 + ';font-size:10px;cursor:pointer;text-align:center;">复古</button>' +
                '<button class="oly-filter-preset" data-filter="warm" style="' +
                  'padding:6px;border:1px solid ' + C.border + ';border-radius:4px;background:' + C.bg2 + ';' +
                  'color:' + C.txt2 + ';font-size:10px;cursor:pointer;text-align:center;">暖色</button>' +
                '<button class="oly-filter-preset" data-filter="cool" style="' +
                  'padding:6px;border:1px solid ' + C.border + ';border-radius:4px;background:' + C.bg2 + ';' +
                  'color:' + C.txt2 + ';font-size:10px;cursor:pointer;text-align:center;">冷色</button>' +
                '<button class="oly-filter-preset" data-filter="vintage" style="' +
                  'padding:6px;border:1px solid ' + C.border + ';border-radius:4px;background:' + C.bg2 + ';' +
                  'color:' + C.txt2 + ';font-size:10px;cursor:pointer;text-align:center;">怀旧</button>' +
                '<button class="oly-filter-preset" data-filter="dramatic" style="' +
                  'padding:6px;border:1px solid ' + C.border + ';border-radius:4px;background:' + C.bg2 + ';' +
                  'color:' + C.txt2 + ';font-size:10px;cursor:pointer;text-align:center;">戏剧</button>' +
                '<button class="oly-filter-preset" data-filter="sketch" style="' +
                  'padding:6px;border:1px solid ' + C.border + ';border-radius:4px;background:' + C.bg2 + ';' +
                  'color:' + C.txt2 + ';font-size:10px;cursor:pointer;text-align:center;">素描</button>' +
                '<button class="oly-filter-preset" data-filter="emboss" style="' +
                  'padding:6px;border:1px solid ' + C.border + ';border-radius:4px;background:' + C.bg2 + ';' +
                  'color:' + C.txt2 + ';font-size:10px;cursor:pointer;text-align:center;">浮雕</button>' +
                '<button class="oly-filter-preset" data-filter="bright" style="' +
                  'padding:6px;border:1px solid ' + C.border + ';border-radius:4px;background:' + C.bg2 + ';' +
                  'color:' + C.txt2 + ';font-size:10px;cursor:pointer;text-align:center;">明亮</button>' +
                '<button class="oly-filter-preset" data-filter="fade" style="' +
                  'padding:6px;border:1px solid ' + C.border + ';border-radius:4px;background:' + C.bg2 + ';' +
                  'color:' + C.txt2 + ';font-size:10px;cursor:pointer;text-align:center;">褪色</button>' +
              '</div>' +
            '</div>' +
          '</div>' +

          // ── 自由旋转 ──
          '<div class="oly-fmt-section" style="border-bottom:1px solid ' + C.border + ';">' +
            '<div class="oly-fmt-header" data-section="freeRotate" style="' + fmtSecHeader + '">' +
              '<span class="oly-fmt-arrow">▼</span> 自由旋转</div>' +
            '<div class="oly-fmt-body" id="olyFmtFreeRotate" style="' + fmtSecBody + '">' +
              '<div style="' + fmtRowCSS + '">' +
                '<span style="' + fmtLabelCSS + '">角度</span>' +
                '<span style="color:' + C.txt + ';font-size:10px;" id="olyFreeRotateVal">0°</span></div>' +
              '<input type="range" id="olyFreeRotate" min="-180" max="180" value="0" style="' + sliderCSS + '">' +
              '<div style="display:flex;gap:4px;margin-top:4px;">' +
                '<button id="olyFreeRotateApply" style="flex:1;padding:4px;border:1px solid ' + C.greenBd + ';border-radius:4px;' +
                  'background:' + C.greenBtn + ';color:' + C.green + ';font-size:10px;cursor:pointer;">应用旋转</button>' +
                '<button id="olyFreeRotateReset" style="flex:1;padding:4px;border:1px solid ' + C.border + ';border-radius:4px;' +
                  'background:' + C.bg2 + ';color:' + C.txt2 + ';font-size:10px;cursor:pointer;">重置</button>' +
              '</div>' +
            '</div>' +
          '</div>' +

          // ── 画笔标注 ──
          '<div class="oly-fmt-section" style="border-bottom:1px solid ' + C.border + ';">' +
            '<div class="oly-fmt-header" data-section="draw" style="' + fmtSecHeader + '">' +
              '<span class="oly-fmt-arrow">▼</span> 画笔标注</div>' +
            '<div class="oly-fmt-body" id="olyFmtDraw" style="' + fmtSecBody + '">' +
              '<div style="' + fmtRowCSS + '">' +
                '<span style="' + fmtLabelCSS + '">颜色</span>' +
                '<input type="color" id="olyDrawColor" value="#ff3333" style="' + fmtColorCSS + '">' +
              '</div>' +
              '<div style="' + fmtRowCSS + '">' +
                '<span style="' + fmtLabelCSS + '">粗细</span>' +
                '<span style="color:' + C.txt + ';font-size:10px;" id="olyDrawSizeVal">3px</span></div>' +
              '<input type="range" id="olyDrawSize" min="1" max="30" value="3" style="' + sliderCSS + '">' +
              '<div style="display:flex;gap:4px;margin-top:4px;">' +
                '<button id="olyDrawEraser" style="flex:1;padding:4px;border:1px solid ' + C.border + ';border-radius:4px;' +
                  'background:' + C.bg2 + ';color:' + C.txt2 + ';font-size:10px;cursor:pointer;">橡皮擦</button>' +
                '<button id="olyDrawClear" style="flex:1;padding:4px;border:1px solid ' + C.redBd + ';border-radius:4px;' +
                  'background:' + C.redBtn + ';color:' + C.redTxt + ';font-size:10px;cursor:pointer;">清除画笔</button>' +
              '</div>' +
              '<div style="display:flex;gap:4px;margin-top:4px;">' +
                '<button id="olyDrawFlatten" style="flex:1;padding:4px;border:1px solid ' + C.greenBd + ';border-radius:4px;' +
                  'background:' + C.greenBtn + ';color:' + C.green + ';font-size:10px;cursor:pointer;">合并到图片</button>' +
              '</div>' +
            '</div>' +
          '</div>' +

          // ── 文字水印 ──
          '<div class="oly-fmt-section" style="border-bottom:1px solid ' + C.border + ';">' +
            '<div class="oly-fmt-header" data-section="textWatermark" style="' + fmtSecHeader + '">' +
              '<span class="oly-fmt-arrow">▼</span> 文字水印</div>' +
            '<div class="oly-fmt-body" id="olyFmtTextWatermark" style="' + fmtSecBody + '">' +
              '<div style="' + fmtRowCSS + '">' +
                '<span style="' + fmtLabelCSS + '">文字</span>' +
                '<input type="text" id="olyTextContent" value="" placeholder="输入水印文字" style="' + fmtInputCSS + ';width:120px;">' +
              '</div>' +
              '<div style="' + fmtRowCSS + '">' +
                '<span style="' + fmtLabelCSS + '">字体</span>' +
                '<select id="olyTextFont" style="' + fmtSelectCSS + '">' +
                  '<option value="sans-serif">默认</option>' +
                  '<option value="serif">衬线</option>' +
                  '<option value="monospace">等宽</option>' +
                  '<option value="cursive">手写</option>' +
                '</select>' +
              '</div>' +
              '<div style="' + fmtRowCSS + '">' +
                '<span style="' + fmtLabelCSS + '">大小</span>' +
                '<span style="color:' + C.txt + ';font-size:10px;" id="olyTextSizeVal">32px</span></div>' +
              '<input type="range" id="olyTextSize" min="12" max="120" value="32" style="' + sliderCSS + '">' +
              '<div style="' + fmtRowCSS + '">' +
                '<span style="' + fmtLabelCSS + '">颜色</span>' +
                '<input type="color" id="olyTextColor" value="#ffffff" style="' + fmtColorCSS + '">' +
              '</div>' +
              '<div style="' + fmtRowCSS + '">' +
                '<span style="' + fmtLabelCSS + '">透明度</span>' +
                '<span style="color:' + C.txt + ';font-size:10px;" id="olyTextOpacityVal">100%</span></div>' +
              '<input type="range" id="olyTextOpacity" min="0" max="100" value="100" style="' + sliderCSS + '">' +
              '<div style="' + fmtRowCSS + '">' +
                '<span style="' + fmtLabelCSS + '">描边</span>' +
                '<input type="color" id="olyTextStroke" value="#000000" style="' + fmtColorCSS + '">' +
              '</div>' +
              '<div style="display:flex;gap:4px;margin-top:4px;">' +
                '<button id="olyTextPlace" style="flex:1;padding:4px;border:1px solid ' + C.accent + ';border-radius:4px;' +
                  'background:' + C.bg2 + ';color:' + C.txt + ';font-size:10px;cursor:pointer;">放置文字</button>' +
                '<button id="olyTextFlatten" style="flex:1;padding:4px;border:1px solid ' + C.greenBd + ';border-radius:4px;' +
                  'background:' + C.greenBtn + ';color:' + C.green + ';font-size:10px;cursor:pointer;">合并到图片</button>' +
              '</div>' +
            '</div>' +
          '</div>' +

        '</div>' +

      '</div>' +
    '</div>';

  document.body.appendChild(editorModal);

  editorModal.addEventListener('mousedown', function (e) {
    if (e.target === editorModal) closeEditorModal();
  });

  document.getElementById('olyEditorCancel').addEventListener('click', closeEditorModal);
  document.getElementById('olyEditorReset').addEventListener('click', function () {
    if (editorImgData) {
      editorWorkingSrc = editorOriginalSrc;
      editorImgData.src = editorOriginalSrc;
      destroyCropper();
      loadEditorImage(editorOriginalSrc);
      resetAdjustSliders();
      resetFormatControls();
    }
  });

  document.getElementById('olyEditorApply').addEventListener('click', applyEditorChanges);

  let tools = editorModal.querySelectorAll('.oly-edit-tool');
  for (let i = 0; i < tools.length; i++) {
    tools[i].addEventListener('click', function () {
      let tool = this.dataset.tool;
      let isActive = this.classList.contains('oly-tool-active');
      if (isActive) return;
      deactivateAllModes();
      switch (tool) {
        case 'crop': startCropMode(); break;
        case 'adjust': activateAdjustMode(); break;
        case 'filter': activateFilterMode(); break;
        case 'rotate': applyCanvasRotate(); break;
        case 'freeRotate': activateFreeRotateMode(); break;
        case 'flipH': applyCanvasFlip('h'); break;
        case 'flipV': applyCanvasFlip('v'); break;
        case 'draw': activateDrawMode(); break;
        case 'text': activateTextMode(); break;
      }
    });
  }

  bindAdjustSliders();
  bindFormatPanelControls();
  applyAdjustFilters();
  applyFormatLivePreview();

  let toggle = document.getElementById('olyFmtPanelToggle');
  let panel = document.getElementById('olyFormatPanel');
  let arrow = document.getElementById('olyFmtPanelToggleArrow');
  let collapsed = false;
  toggle.addEventListener('click', function () {
    collapsed = !collapsed;
    if (collapsed) {
      panel.style.width = '14px';
      panel.style.minWidth = '14px';
      arrow.textContent = '▶';
      toggle.style.borderRadius = '0 4px 4px 0';
      toggle.style.left = '3px';
    } else {
      panel.style.width = '260px';
      panel.style.minWidth = '';
      arrow.textContent = '◀';
      toggle.style.borderRadius = '4px 0 0 4px';
      toggle.style.left = '0';
    }
  });

  // ── 滤镜预设绑定 ──
  let filterPresets = editorModal.querySelectorAll('.oly-filter-preset');
  filterPresets.forEach(function (btn) {
    btn.addEventListener('click', function () {
      filterPresets.forEach(function (b) { b.classList.remove('oly-filter-active'); });
      this.classList.add('oly-filter-active');
      applyFilterPreset(this.dataset.filter);
    });
  });

  // ── 自由旋转绑定 ──
  let freeRotateSlider = document.getElementById('olyFreeRotate');
  freeRotateSlider.addEventListener('input', function () {
    document.getElementById('olyFreeRotateVal').textContent = this.value + '°';
    previewFreeRotate(parseInt(this.value));
  });
  document.getElementById('olyFreeRotateApply').addEventListener('click', applyFreeRotate);
  document.getElementById('olyFreeRotateReset').addEventListener('click', function () {
    freeRotateSlider.value = 0;
    document.getElementById('olyFreeRotateVal').textContent = '0°';
    previewFreeRotate(0);
  });

  // ── 画笔标注绑定 ──
  document.getElementById('olyDrawSize').addEventListener('input', function () {
    document.getElementById('olyDrawSizeVal').textContent = this.value + 'px';
  });
  document.getElementById('olyDrawEraser').addEventListener('click', function () {
    this.classList.toggle('oly-draw-eraser-active');
  });
  document.getElementById('olyDrawClear').addEventListener('click', clearDrawOverlay);
  document.getElementById('olyDrawFlatten').addEventListener('click', flattenDrawToCanvas);

  // ── 文字水印绑定 ──
  document.getElementById('olyTextSize').addEventListener('input', function () {
    document.getElementById('olyTextSizeVal').textContent = this.value + 'px';
  });
  document.getElementById('olyTextOpacity').addEventListener('input', function () {
    document.getElementById('olyTextOpacityVal').textContent = this.value + '%';
  });
  document.getElementById('olyTextPlace').addEventListener('click', placeTextOnCanvas);
  document.getElementById('olyTextFlatten').addEventListener('click', flattenTextToCanvas);
}

function bindFormatPanelControls() {
  let sectionHeaders = document.querySelectorAll('.oly-fmt-header');
  sectionHeaders.forEach(function (header) {
    header.addEventListener('click', function () {
      let body = this.nextElementSibling;
      let arrow = this.querySelector('.oly-fmt-arrow');
      if (!body || !arrow) return;
      if (body.style.display === 'none') {
        body.style.display = '';
        arrow.textContent = '▼';
      } else {
        body.style.display = 'none';
        arrow.textContent = '▶';
      }
    });
  });

  let fmtSliders = [
    { id: 'olyFmtShadowOpacity', valId: 'olyFmtShadowOpVal', unit: '%' },
    { id: 'olyFmtShadowBlur', valId: 'olyFmtShadowBlurVal', unit: 'px' },
    { id: 'olyFmtShadowX', valId: 'olyFmtShadowXVal', unit: 'px' },
    { id: 'olyFmtShadowY', valId: 'olyFmtShadowYVal', unit: 'px' },
    { id: 'olyFmtReflectOpacity', valId: 'olyFmtReflectOpVal', unit: '%' },
    { id: 'olyFmtReflectSize', valId: 'olyFmtReflectSizeVal', unit: '%' },
    { id: 'olyFmtReflectDistance', valId: 'olyFmtReflectDistVal', unit: 'px' },
    { id: 'olyFmtGlowSize', valId: 'olyFmtGlowSizeVal', unit: 'px' },
    { id: 'olyFmtGlowOpacity', valId: 'olyFmtGlowOpVal', unit: '%' },
    { id: 'olyFmtSoftEdge', valId: 'olyFmtSoftEdgeVal', unit: 'px' }
  ];

  fmtSliders.forEach(function (s) {
    let el = document.getElementById(s.id);
    if (!el) return;
    el.addEventListener('input', function () {
      let valEl = document.getElementById(s.valId);
      if (valEl) valEl.textContent = this.value + s.unit;
      applyFormatLivePreview();
    });
  });

  let colorInputs = [
    'olyFmtBorderColor', 'olyFmtShadowColor', 'olyFmtGlowColor'
  ];
  colorInputs.forEach(function (id) {
    let el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', function () { applyFormatLivePreview(); });
  });

  let borderInputs = ['olyFmtBorderWidth', 'olyFmtBorderStyle'];
  borderInputs.forEach(function (id) {
    let el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', function () { applyFormatLivePreview(); });
  });
}

function applyFormatLivePreview() {
  let canvas = document.getElementById('olyEditorCanvas');
  if (!canvas) return;

  let bw = parseInt(document.getElementById('olyFmtBorderWidth').value) || 0;
  let bc = document.getElementById('olyFmtBorderColor').value || '#aef0ff';
  let bs = document.getElementById('olyFmtBorderStyle').value || 'solid';

  let sx = parseInt(document.getElementById('olyFmtShadowX').value) || 0;
  let sy = parseInt(document.getElementById('olyFmtShadowY').value) || 0;
  let sb = parseInt(document.getElementById('olyFmtShadowBlur').value) || 0;
  let sc = document.getElementById('olyFmtShadowColor').value || '#000000';
  let so = (parseInt(document.getElementById('olyFmtShadowOpacity').value) || 50) / 100;

  let gs = parseInt(document.getElementById('olyFmtGlowSize').value) || 0;
  let gc = document.getElementById('olyFmtGlowColor').value || '#aef0ff';
  let go = (parseInt(document.getElementById('olyFmtGlowOpacity').value) || 0) / 100;

  let se = parseInt(document.getElementById('olyFmtSoftEdge').value) || 0;

  let filter = '';

  if (sb > 0 && so > 0) {
    let hex = sc;
    let r = parseInt(hex.slice(1, 3), 16);
    let g = parseInt(hex.slice(3, 5), 16);
    let b = parseInt(hex.slice(5, 7), 16);
    filter += ' drop-shadow(' + sx + 'px ' + sy + 'px ' + sb + 'px rgba(' + r + ',' + g + ',' + b + ',' + so + '))';
  }

  if (gs > 0 && go > 0) {
    let hr = parseInt(gc.slice(1, 3), 16);
    let hg = parseInt(gc.slice(3, 5), 16);
    let hb = parseInt(gc.slice(5, 7), 16);
    filter += ' drop-shadow(0 0 ' + gs + 'px rgba(' + hr + ',' + hg + ',' + hb + ',' + go + '))';
  }

  canvas.style.filter = filter.trim() || 'none';
  canvas.style.border = bw > 0 ? bw + 'px ' + bs + ' ' + bc : 'none';
  canvas.style.boxSizing = 'border-box';

  if (se > 0) {
    canvas.style.maskImage = 'radial-gradient(ellipse at center, black ' + (100 - se) + '%, transparent 100%)';
    canvas.style.webkitMaskImage = 'radial-gradient(ellipse at center, black ' + (100 - se) + '%, transparent 100%)';
  } else {
    canvas.style.maskImage = '';
    canvas.style.webkitMaskImage = '';
  }
}

function resetFormatControls() {
  let fmtDefaults = [
    { id: 'olyFmtBorderWidth', val: '0' },
    { id: 'olyFmtBorderColor', val: '#aef0ff' },
    { id: 'olyFmtShadowColor', val: '#000000' },
    { id: 'olyFmtShadowOpacity', val: '50', valId: 'olyFmtShadowOpVal', unit: '%' },
    { id: 'olyFmtShadowBlur', val: '10', valId: 'olyFmtShadowBlurVal', unit: 'px' },
    { id: 'olyFmtShadowX', val: '3', valId: 'olyFmtShadowXVal', unit: 'px' },
    { id: 'olyFmtShadowY', val: '3', valId: 'olyFmtShadowYVal', unit: 'px' },
    { id: 'olyFmtReflectOpacity', val: '0', valId: 'olyFmtReflectOpVal', unit: '%' },
    { id: 'olyFmtReflectSize', val: '0', valId: 'olyFmtReflectSizeVal', unit: '%' },
    { id: 'olyFmtReflectDistance', val: '0', valId: 'olyFmtReflectDistVal', unit: 'px' },
    { id: 'olyFmtGlowColor', val: '#aef0ff' },
    { id: 'olyFmtGlowSize', val: '0', valId: 'olyFmtGlowSizeVal', unit: 'px' },
    { id: 'olyFmtGlowOpacity', val: '0', valId: 'olyFmtGlowOpVal', unit: '%' },
    { id: 'olyFmtSoftEdge', val: '0', valId: 'olyFmtSoftEdgeVal', unit: 'px' }
  ];
  fmtDefaults.forEach(function (d) {
    let el = document.getElementById(d.id);
    if (el) {
      if (el.type === 'color') el.value = d.val;
      else el.value = d.val;
    }
    if (d.valId) {
      let vel = document.getElementById(d.valId);
      if (vel) vel.textContent = d.val + (d.unit || '');
    }
  });
  let bs = document.getElementById('olyFmtBorderStyle');
  if (bs) bs.value = 'solid';
  let canvas = document.getElementById('olyEditorCanvas');
  if (canvas) {
    canvas.style.filter = '';
    canvas.style.border = 'none';
    canvas.style.maskImage = '';
    canvas.style.webkitMaskImage = '';
  }
}

function resetAdjustSliders() {
  let defaults = [
    { id: 'olyAdjBrightness', valId: 'olyAdjBrightVal', val: 100, unit: '%' },
    { id: 'olyAdjContrast', valId: 'olyAdjContrastVal', val: 100, unit: '%' },
    { id: 'olyAdjSaturation', valId: 'olyAdjSatVal', val: 100, unit: '%' },
    { id: 'olyAdjBlur', valId: 'olyAdjBlurVal', val: 0, unit: 'px' },
    { id: 'olyAdjHue', valId: 'olyAdjHueVal', val: 0, unit: '°' },
    { id: 'olyAdjOpacity', valId: 'olyAdjOpacityVal', val: 100, unit: '%' }
  ];
  defaults.forEach(function (d) {
    let el = document.getElementById(d.id);
    let valEl = document.getElementById(d.valId);
    if (el) el.value = d.val;
    if (valEl) valEl.textContent = d.val + d.unit;
  });
}

function activateAdjustMode() {
  destroyCropper();
  let wrap = document.getElementById('olyEditorCanvasWrap');
  if (wrap) wrap.style.overflow = 'visible';
  if (editorCanvas) editorCanvas.style.display = 'block';
  applyAdjustFilters();
  highlightToolButton('adjust');
}

// ── 模式管理 ──
let currentEditorMode = 'adjust';
let drawState = { active: false, eraser: false, paths: [] };
let textState = { active: false, items: [] };
let freeRotateAngle = 0;

function deactivateAllModes() {
  // 退出画笔模式
  if (drawState.active) exitDrawMode();
  // 退出文字模式
  if (textState.active) exitTextMode();
  // 退出裁剪模式
  destroyCropper();
  // 重置自由旋转预览
  if (freeRotateAngle !== 0) {
    let canvas = document.getElementById('olyEditorCanvas');
    if (canvas) canvas.style.transform = '';
  }
}

// ── 滤镜预设 ──
let filterPresets = {
  none: '',
  grayscale: 'grayscale(100%)',
  invert: 'invert(100%)',
  sepia: 'sepia(80%) saturate(120%)',
  warm: 'sepia(30%) saturate(140%) brightness(105%)',
  cool: 'saturate(80%) hue-rotate(180deg) brightness(105%)',
  vintage: 'sepia(40%) contrast(90%) brightness(95%) saturate(80%)',
  dramatic: 'contrast(150%) brightness(90%) saturate(130%)',
  sketch: 'grayscale(100%) contrast(200%) brightness(110%)',
  emboss: 'contrast(120%) brightness(90%) saturate(0%)',
  bright: 'brightness(130%) contrast(110%) saturate(120%)',
  fade: 'brightness(110%) contrast(85%) saturate(70%)'
};
let currentFilterPreset = 'none';

function activateFilterMode() {
  destroyCropper();
  highlightToolButton('filter');
  currentEditorMode = 'filter';
}

function applyFilterPreset(presetName) {
  currentFilterPreset = presetName;
  if (!editorCtx || !editorCanvas) return;
  let filter = filterPresets[presetName] || '';
  let img = new Image();
  img.onload = function () {
    editorCtx.clearRect(0, 0, editorCanvas.width, editorCanvas.height);
    editorCtx.filter = filter || 'none';
    editorCtx.drawImage(img, 0, 0, editorCanvas.width, editorCanvas.height);
    editorCtx.filter = 'none';
  };
  img.src = editorWorkingSrc || editorOriginalSrc;
}

// ── 自由旋转 ──
function activateFreeRotateMode() {
  destroyCropper();
  highlightToolButton('freeRotate');
  currentEditorMode = 'freeRotate';
}

function previewFreeRotate(degrees) {
  freeRotateAngle = degrees;
  let canvas = document.getElementById('olyEditorCanvas');
  if (canvas) canvas.style.transform = 'rotate(' + degrees + 'deg)';
}

function applyFreeRotate() {
  if (freeRotateAngle === 0 || !editorCanvas || !editorCtx) return;
  let degrees = freeRotateAngle;
  let radians = degrees * Math.PI / 180;
  let img = new Image();
  img.onload = function () {
    let w = editorCanvas.width;
    let h = editorCanvas.height;
    // 计算旋转后的画布大小
    let cos = Math.abs(Math.cos(radians));
    let sin = Math.abs(Math.sin(radians));
    let newW = Math.ceil(w * cos + h * sin);
    let newH = Math.ceil(w * sin + h * cos);
    let tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = newW;
    tmpCanvas.height = newH;
    let tmpCtx = tmpCanvas.getContext('2d');
    tmpCtx.translate(newW / 2, newH / 2);
    tmpCtx.rotate(radians);
    tmpCtx.drawImage(img, -w / 2, -h / 2, w, h);
    // 更新编辑器画布
    editorCanvas.width = newW;
    editorCanvas.height = newH;
    editorCtx.drawImage(tmpCanvas, 0, 0);
    editorWorkingSrc = editorCanvas.toDataURL('image/png');
    // 重置旋转预览
    editorCanvas.style.transform = '';
    freeRotateAngle = 0;
    document.getElementById('olyFreeRotate').value = 0;
    document.getElementById('olyFreeRotateVal').textContent = '0°';
  };
  img.src = editorCanvas.toDataURL('image/png');
}

// ── 画笔标注 ──
function activateDrawMode() {
  destroyCropper();
  drawState.active = true;
  drawState.eraser = false;
  highlightToolButton('draw');
  currentEditorMode = 'draw';

  let overlay = document.getElementById('olyDrawOverlay');
  let canvas = document.getElementById('olyEditorCanvas');
  if (!overlay || !canvas) return;

  // 对齐覆盖层到画布
  let rect = canvas.getBoundingClientRect();
  let wrapRect = canvas.parentElement.getBoundingClientRect();
  overlay.style.left = (rect.left - wrapRect.left) + 'px';
  overlay.style.top = (rect.top - wrapRect.top) + 'px';
  overlay.width = rect.width;
  overlay.height = rect.height;
  overlay.style.width = rect.width + 'px';
  overlay.style.height = rect.height + 'px';
  overlay.style.display = 'block';
  overlay.style.pointerEvents = 'auto';
  overlay.style.cursor = 'crosshair';

  let drawCtx = overlay.getContext('2d');
  let isDrawing = false;
  let lastX = 0, lastY = 0;

  function getPos(e) {
    let r = overlay.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function startDraw(e) {
    isDrawing = true;
    let pos = getPos(e);
    lastX = pos.x;
    lastY = pos.y;
  }

  function doDraw(e) {
    if (!isDrawing) return;
    let pos = getPos(e);
    let size = parseInt(document.getElementById('olyDrawSize').value) || 3;
    // 缩放比例（覆盖层可能和实际画布不同大小）
    let scaleX = editorCanvas.width / overlay.width;
    let scaleY = editorCanvas.height / overlay.height;

    drawCtx.beginPath();
    drawCtx.moveTo(lastX, lastY);
    drawCtx.lineTo(pos.x, pos.y);
    drawCtx.lineWidth = size;
    drawCtx.lineCap = 'round';
    drawCtx.lineJoin = 'round';

    if (drawState.eraser) {
      drawCtx.globalCompositeOperation = 'destination-out';
      drawCtx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      drawCtx.globalCompositeOperation = 'source-over';
      drawCtx.strokeStyle = document.getElementById('olyDrawColor').value;
    }
    drawCtx.stroke();

    // 记录路径
    drawState.paths.push({
      x1: lastX * scaleX, y1: lastY * scaleY,
      x2: pos.x * scaleX, y2: pos.y * scaleY,
      size: size * scaleX,
      color: drawState.eraser ? 'eraser' : document.getElementById('olyDrawColor').value
    });

    lastX = pos.x;
    lastY = pos.y;
  }

  function endDraw() { isDrawing = false; }

  overlay._onMouseDown = startDraw;
  overlay._onMouseMove = doDraw;
  overlay._onMouseUp = endDraw;
  overlay.addEventListener('mousedown', startDraw);
  overlay.addEventListener('mousemove', doDraw);
  overlay.addEventListener('mouseup', endDraw);
  overlay.addEventListener('mouseleave', endDraw);
}

function exitDrawMode() {
  drawState.active = false;
  let overlay = document.getElementById('olyDrawOverlay');
  if (overlay) {
    overlay.style.display = 'none';
    overlay.style.pointerEvents = 'none';
    if (overlay._onMouseDown) overlay.removeEventListener('mousedown', overlay._onMouseDown);
    if (overlay._onMouseMove) overlay.removeEventListener('mousemove', overlay._onMouseMove);
    if (overlay._onMouseUp) overlay.removeEventListener('mouseup', overlay._onMouseUp);
    if (overlay._onMouseLeave) overlay.removeEventListener('mouseleave', overlay._onMouseLeave);
  }
}

function clearDrawOverlay() {
  let overlay = document.getElementById('olyDrawOverlay');
  if (overlay) {
    let ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, overlay.width, overlay.height);
  }
  drawState.paths = [];
}

function flattenDrawToCanvas() {
  if (!editorCanvas || !editorCtx) return;
  let overlay = document.getElementById('olyDrawOverlay');
  if (!overlay) return;

  // 将覆盖层绘制到主画布（按比例缩放）
  editorCtx.drawImage(overlay, 0, 0, editorCanvas.width, editorCanvas.height);
  editorWorkingSrc = editorCanvas.toDataURL('image/png');
  clearDrawOverlay();
}

// ── 文字水印 ──
let textItems = []; // { text, x, y, font, size, color, opacity, stroke }

function activateTextMode() {
  destroyCropper();
  textState.active = true;
  highlightToolButton('text');
  currentEditorMode = 'text';
}

function exitTextMode() {
  textState.active = false;
  let wrap = document.getElementById('olyTextInputWrap');
  if (wrap) wrap.style.display = 'none';
}

function placeTextOnCanvas() {
  let content = document.getElementById('olyTextContent').value;
  if (!content.trim() || !editorCanvas || !editorCtx) return;

  let font = document.getElementById('olyTextFont').value;
  let size = parseInt(document.getElementById('olyTextSize').value) || 32;
  let color = document.getElementById('olyTextColor').value;
  let opacity = (parseInt(document.getElementById('olyTextOpacity').value) || 100) / 100;
  let stroke = document.getElementById('olyTextStroke').value;

  // 在画布中心放置文字
  let x = editorCanvas.width / 2;
  let y = editorCanvas.height / 2;

  textItems.push({ text: content, x: x, y: y, font: font, size: size, color: color, opacity: opacity, stroke: stroke });
  renderTextItems();
}

function renderTextItems() {
  if (!editorCanvas || !editorCtx) return;
  // 先重绘底图
  let img = new Image();
  img.onload = function () {
    editorCtx.clearRect(0, 0, editorCanvas.width, editorCanvas.height);
    editorCtx.drawImage(img, 0, 0, editorCanvas.width, editorCanvas.height);
    // 绘制所有文字
    textItems.forEach(function (item) {
      editorCtx.save();
      editorCtx.globalAlpha = item.opacity;
      editorCtx.font = 'bold ' + item.size + 'px ' + item.font;
      editorCtx.textAlign = 'center';
      editorCtx.textBaseline = 'middle';
      // 描边
      if (item.stroke) {
        editorCtx.strokeStyle = item.stroke;
        editorCtx.lineWidth = Math.max(1, item.size / 12);
        editorCtx.strokeText(item.text, item.x, item.y);
      }
      // 填充
      editorCtx.fillStyle = item.color;
      editorCtx.fillText(item.text, item.x, item.y);
      editorCtx.restore();
    });
  };
  img.src = editorWorkingSrc || editorOriginalSrc;
}

function flattenTextToCanvas() {
  if (textItems.length === 0) return;
  // 文字已经渲染到画布上了，只需更新 workingSrc
  editorWorkingSrc = editorCanvas.toDataURL('image/png');
  textItems = [];
}

function highlightToolButton(toolName) {
  let tools = editorModal.querySelectorAll('.oly-edit-tool');
  for (let i = 0; i < tools.length; i++) {
    tools[i].classList.remove('oly-tool-active');
  }
  let btn = editorModal.querySelector('.oly-edit-tool[data-tool="' + toolName + '"]');
  if (btn) btn.classList.add('oly-tool-active');
}

function bindAdjustSliders() {
  let sliders = [
    { id: 'olyAdjBrightness', valId: 'olyAdjBrightVal', unit: '%' },
    { id: 'olyAdjContrast', valId: 'olyAdjContrastVal', unit: '%' },
    { id: 'olyAdjSaturation', valId: 'olyAdjSatVal', unit: '%' },
    { id: 'olyAdjBlur', valId: 'olyAdjBlurVal', unit: 'px' },
    { id: 'olyAdjHue', valId: 'olyAdjHueVal', unit: '°' },
    { id: 'olyAdjOpacity', valId: 'olyAdjOpacityVal', unit: '%' }
  ];
  sliders.forEach(function (s) {
    let el = document.getElementById(s.id);
    if (!el) return;
    el.addEventListener('input', function () {
      let valEl = document.getElementById(s.valId);
      if (valEl) valEl.textContent = this.value + s.unit;
      applyAdjustFilters();
    });
  });
}

function loadEditorImage(src) {
  if (!editorCanvas) {
    editorCanvas = document.getElementById('olyEditorCanvas');
    editorCtx = editorCanvas.getContext('2d');
  }
  let img = new Image();
  img.onload = function () {
    let maxW = editorCanvas.parentNode.clientWidth - 40;
    let maxH = editorCanvas.parentNode.clientHeight - 40;
    let w = img.naturalWidth;
    let h = img.naturalHeight;
    let scale = Math.min(maxW / w, maxH / h, 1);
    editorCanvas.width = Math.round(w * scale);
    editorCanvas.height = Math.round(h * scale);
    editorCanvas.style.display = 'block';
    editorCtx.filter = 'none';
    editorCtx.drawImage(img, 0, 0, editorCanvas.width, editorCanvas.height);
  };
  img.src = src;
}

function applyAdjustFilters() {
  if (!editorCtx || !editorCanvas) return;
  let brightness = parseInt(document.getElementById('olyAdjBrightness').value) / 100;
  let contrast = parseInt(document.getElementById('olyAdjContrast').value) / 100;
  let saturation = parseInt(document.getElementById('olyAdjSaturation').value) / 100;
  let blur = parseInt(document.getElementById('olyAdjBlur').value);
  let hue = parseInt(document.getElementById('olyAdjHue').value);
  let opacity = parseInt(document.getElementById('olyAdjOpacity').value) / 100;

  let filter = '';
  if (brightness !== 1) filter += 'brightness(' + brightness + ') ';
  if (contrast !== 1) filter += 'contrast(' + contrast + ') ';
  if (saturation !== 1) filter += 'saturate(' + saturation + ') ';
  if (blur > 0) filter += 'blur(' + blur + 'px) ';
  if (hue !== 0) filter += 'hue-rotate(' + hue + 'deg) ';
  if (opacity !== 1) filter += 'opacity(' + opacity + ') ';

  let img = new Image();
  img.onload = function () {
    editorCtx.filter = filter.trim() || 'none';
    editorCtx.clearRect(0, 0, editorCanvas.width, editorCanvas.height);
    editorCtx.drawImage(img, 0, 0, editorCanvas.width, editorCanvas.height);
    editorCtx.filter = 'none';
  };
  img.src = editorOriginalSrc;
}

function applyCanvasRotate() {
  if (!editorCanvas || !editorCtx) return;
  destroyCropper();
  let img = new Image();
  img.onload = function () {
    let w = editorCanvas.width;
    let h = editorCanvas.height;
    editorCanvas.width = h;
    editorCanvas.height = w;
    editorCtx.clearRect(0, 0, h, w);
    editorCtx.save();
    editorCtx.translate(h, 0);
    editorCtx.rotate(Math.PI / 2);
    editorCtx.drawImage(img, 0, 0, w, h);
    editorCtx.restore();
    editorWorkingSrc = editorCanvas.toDataURL('image/png');
  };
  img.src = editorCanvas.toDataURL('image/png');
}

function applyCanvasFlip(direction) {
  if (!editorCanvas || !editorCtx) return;
  destroyCropper();
  let img = new Image();
  img.onload = function () {
    editorCtx.clearRect(0, 0, editorCanvas.width, editorCanvas.height);
    editorCtx.save();
    if (direction === 'h') {
      editorCtx.translate(editorCanvas.width, 0);
      editorCtx.scale(-1, 1);
    } else {
      editorCtx.translate(0, editorCanvas.height);
      editorCtx.scale(1, -1);
    }
    editorCtx.drawImage(img, 0, 0, editorCanvas.width, editorCanvas.height);
    editorCtx.restore();
    editorWorkingSrc = editorCanvas.toDataURL('image/png');
  };
  img.src = editorCanvas.toDataURL('image/png');
}

function destroyCropper() {
  if (editorCropper) {
    editorCropper.destroy();
    editorCropper = null;
  }
  let wrap = document.getElementById('olyEditorCanvasWrap');
  if (wrap) wrap.style.overflow = 'visible';
  if (editorCanvas) editorCanvas.style.display = 'block';
}

function startCropMode() {
  if (!editorCanvas) return;
  destroyCropper();
  let wrap = document.getElementById('olyEditorCanvasWrap');
  if (wrap) wrap.style.overflow = 'hidden';

  editorCanvas.style.display = 'block';

  if (typeof Cropper !== 'undefined') {
    editorCropper = new Cropper(editorCanvas, {
      viewMode: 1,
      autoCropArea: 0.8,
      responsive: true,
      background: false
    });
  }

  let tools = editorModal.querySelectorAll('.oly-edit-tool');
  for (let i = 0; i < tools.length; i++) {
    tools[i].classList.remove('oly-tool-active');
  }
  let cropBtn = editorModal.querySelector('.oly-edit-tool[data-tool="crop"]');
  if (cropBtn) cropBtn.classList.add('oly-tool-active');
}

function applyEditorChanges() {
  if (!editorImgData) return;

  // 合并画笔标注
  if (drawState.active && drawState.paths.length > 0) {
    flattenDrawToCanvas();
  }
  // 合并文字水印
  if (textItems.length > 0) {
    flattenTextToCanvas();
  }

  if (editorCropper) {
    let croppedCanvas = editorCropper.getCroppedCanvas();
    if (croppedCanvas) {
      editorWorkingSrc = croppedCanvas.toDataURL('image/png');
    }
    destroyCropper();
  }

  finishApply();

  function finishApply() {
    let finalSrc = editorWorkingSrc || editorOriginalSrc;
    let finalImg = new Image();
    finalImg.onload = function () {
      editorImgData.src = finalSrc;
      if (editorOriginalW != null) { editorImgData.width = editorOriginalW; }
      if (editorOriginalH != null) { editorImgData.height = editorOriginalH; }

      editorImgData.fmtBorderWidth = parseInt(document.getElementById('olyFmtBorderWidth').value) || 0;
      editorImgData.fmtBorderColor = document.getElementById('olyFmtBorderColor').value;
      editorImgData.fmtBorderStyle = document.getElementById('olyFmtBorderStyle').value;
      editorImgData.fmtShadowX = parseInt(document.getElementById('olyFmtShadowX').value) || 0;
      editorImgData.fmtShadowY = parseInt(document.getElementById('olyFmtShadowY').value) || 0;
      editorImgData.fmtShadowBlur = parseInt(document.getElementById('olyFmtShadowBlur').value) || 0;
      editorImgData.fmtShadowColor = document.getElementById('olyFmtShadowColor').value;
      editorImgData.fmtShadowOpacity = (parseInt(document.getElementById('olyFmtShadowOpacity').value) || 50) / 100;
      editorImgData.fmtGlowSize = parseInt(document.getElementById('olyFmtGlowSize').value) || 0;
      editorImgData.fmtGlowColor = document.getElementById('olyFmtGlowColor').value;
      editorImgData.fmtGlowOpacity = (parseInt(document.getElementById('olyFmtGlowOpacity').value) || 0) / 100;
      editorImgData.fmtSoftEdge = parseInt(document.getElementById('olyFmtSoftEdge').value) || 0;
      editorImgData.fmtReflectOpacity = parseInt(document.getElementById('olyFmtReflectOpacity').value) || 0;
      editorImgData.fmtReflectSize = parseInt(document.getElementById('olyFmtReflectSize').value) || 0;
      editorImgData.fmtReflectDistance = parseInt(document.getElementById('olyFmtReflectDistance').value) || 0;

      editorImgData.adjBrightness = parseInt(document.getElementById('olyAdjBrightness').value);
      editorImgData.adjContrast = parseInt(document.getElementById('olyAdjContrast').value);
      editorImgData.adjSaturation = parseInt(document.getElementById('olyAdjSaturation').value);
      editorImgData.adjHue = parseInt(document.getElementById('olyAdjHue').value);
      editorImgData.adjBlur = parseInt(document.getElementById('olyAdjBlur').value);
      editorImgData.adjOpacity = parseInt(document.getElementById('olyAdjOpacity').value);

      closeEditorModal();
      transactRender();
    };
    finalImg.src = finalSrc;
  }
}

function closeEditorModal() {
  destroyCropper();
  deactivateAllModes();

  if (editorModal && editorModal.parentNode) {
    editorModal.parentNode.removeChild(editorModal);
  }
  editorModal = null;
  editorCanvas = null;
  editorCtx = null;
  editorImgData = null;
  editorOriginalSrc = null;
  editorWorkingSrc = null;
  editorOriginalW = null;
  editorOriginalH = null;
  currentEditorMode = 'adjust';
  currentFilterPreset = 'none';
  freeRotateAngle = 0;
  drawState = { active: false, eraser: false, paths: [] };
  textState = { active: false, items: [] };
  textItems = [];
}

function openCropEditor(imgData) {
  editorImgData = imgData;
  editorOriginalSrc = imgData.src;
  editorWorkingSrc = imgData.src;
  editorOriginalW = imgData.width;
  editorOriginalH = imgData.height;
  createEditorModal();
  loadEditorImage(imgData.src);
  setTimeout(function () { startCropMode(); }, 200);
}

function _loadFormatValuesFromData(imgData) {
  if (!imgData) return;
  let el = function (id) { return document.getElementById(id); };
  let setVal = function (id, val) { let e = el(id); if (e) e.value = val; };
  let setCheck = function (id, val) { let e = el(id); if (e) e.checked = val; };

  if (imgData.fmtBorderWidth != null) setVal('olyFmtBorderWidth', imgData.fmtBorderWidth);
  if (imgData.fmtBorderColor) setVal('olyFmtBorderColor', imgData.fmtBorderColor);
  if (imgData.fmtBorderStyle) setVal('olyFmtBorderStyle', imgData.fmtBorderStyle);

  if (imgData.fmtShadowX != null) setVal('olyFmtShadowX', imgData.fmtShadowX);
  if (imgData.fmtShadowY != null) setVal('olyFmtShadowY', imgData.fmtShadowY);
  if (imgData.fmtShadowBlur != null) setVal('olyFmtShadowBlur', imgData.fmtShadowBlur);
  if (imgData.fmtShadowColor) setVal('olyFmtShadowColor', imgData.fmtShadowColor);
  if (imgData.fmtShadowOpacity != null) setVal('olyFmtShadowOpacity', Math.round(imgData.fmtShadowOpacity * 100));

  if (imgData.fmtGlowSize != null) setVal('olyFmtGlowSize', imgData.fmtGlowSize);
  if (imgData.fmtGlowColor) setVal('olyFmtGlowColor', imgData.fmtGlowColor);
  if (imgData.fmtGlowOpacity != null) setVal('olyFmtGlowOpacity', Math.round(imgData.fmtGlowOpacity * 100));

  if (imgData.fmtSoftEdge != null) setVal('olyFmtSoftEdge', imgData.fmtSoftEdge);

  if (imgData.fmtReflectOpacity != null) setVal('olyFmtReflectOpacity', imgData.fmtReflectOpacity);
  if (imgData.fmtReflectSize != null) setVal('olyFmtReflectSize', imgData.fmtReflectSize);
  if (imgData.fmtReflectDistance != null) setVal('olyFmtReflectDistance', imgData.fmtReflectDistance);

  if (imgData.adjBrightness != null) setVal('olyAdjBrightness', imgData.adjBrightness);
  else setVal('olyAdjBrightness', 100);
  if (imgData.adjContrast != null) setVal('olyAdjContrast', imgData.adjContrast);
  else setVal('olyAdjContrast', 100);
  if (imgData.adjSaturation != null) setVal('olyAdjSaturation', imgData.adjSaturation);
  else setVal('olyAdjSaturation', 100);
  if (imgData.adjHue != null) setVal('olyAdjHue', imgData.adjHue);
  else setVal('olyAdjHue', 0);
  if (imgData.adjBlur != null) setVal('olyAdjBlur', imgData.adjBlur);
  else setVal('olyAdjBlur', 0);
  if (imgData.adjOpacity != null) setVal('olyAdjOpacity', imgData.adjOpacity);
  else setVal('olyAdjOpacity', 100);

  applyFormatLivePreview();
  applyAdjustFilters();
}

function openAdjustEditor(imgData) {
  editorImgData = imgData;
  editorOriginalSrc = imgData.src;
  editorWorkingSrc = imgData.src;
  editorOriginalW = imgData.width;
  editorOriginalH = imgData.height;
  createEditorModal();
  loadEditorImage(imgData.src);
  setTimeout(function () {
    activateAdjustMode();
    _loadFormatValuesFromData(imgData);
  }, 200);
}

function rotateImage(imgData, degrees) {
  let img = new Image();
  img.onload = function () {
    let canvas = document.createElement('canvas');
    if (degrees === 90 || degrees === 270) {
      canvas.width = img.naturalHeight;
      canvas.height = img.naturalWidth;
    } else {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
    }
    let ctx = canvas.getContext('2d');
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(degrees * Math.PI / 180);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    ctx.restore();
    let newSrc = canvas.toDataURL('image/png');
    imgData.src = newSrc;
    imgData.width = canvas.width;
    imgData.height = canvas.height;
    transactRender();
  };
  img.src = imgData.src;
}

// ============================================================
//  高级图片编辑器 — 打开自研全功能图片编辑器
//  可直接裁剪、调整滤镜、旋转、翻转
// ============================================================

function openAdvancedEditor(imgData) {
  openAdjustEditor(imgData);
}

function flipImage(imgData, direction) {
  let img = new Image();
  img.onload = function () {
    let canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    let ctx = canvas.getContext('2d');
    ctx.save();
    if (direction === 'h') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    } else {
      ctx.translate(0, canvas.height);
      ctx.scale(1, -1);
    }
    ctx.drawImage(img, 0, 0);
    ctx.restore();
    imgData.src = canvas.toDataURL('image/png');
    transactRender();
  };
  img.src = imgData.src;
}


export { openAdvancedEditor, openCropEditor, openAdjustEditor, rotateImage, flipImage };
