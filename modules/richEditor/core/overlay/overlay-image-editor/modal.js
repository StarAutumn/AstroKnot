// ============================================================
//  overlay-image-editor/modal.js — 编辑器弹窗 DOM 构建
//  createEditorModal（弹窗结构 + 工具面板 + 事件绑定编排）
// ============================================================

import { editorModal, editorImgData, editorOriginalSrc, setEditorModal, setEditorWorkingSrc } from './share.js';
import {
  deactivateAllModes, activateFilterMode, activateFreeRotateMode, activateDrawMode, activateTextMode,
  applyFilterPreset, previewFreeRotate, applyFreeRotate, clearDrawOverlay, flattenDrawToCanvas,
  placeTextOnCanvas, flattenTextToCanvas
} from './modes.js';
import {
  destroyCropper, loadEditorImage, resetAdjustSliders, resetFormatControls, startCropMode,
  activateAdjustMode, applyCanvasRotate, applyCanvasFlip, bindAdjustSliders, bindFormatPanelControls,
  applyAdjustFilters, applyFormatLivePreview
} from './adjust.js';
import { closeEditorModal, applyEditorChanges } from './index.js';

export function createEditorModal() {
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

  setEditorModal(document.createElement('div'));
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
      setEditorWorkingSrc(editorOriginalSrc);
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
