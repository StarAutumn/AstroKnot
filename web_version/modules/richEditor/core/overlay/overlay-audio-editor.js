// ============================================================
//  overlay-audio-editor.js — 增强版音频编辑器（WaveSurfer.js + Web Audio API）
// ============================================================
import { renderAll, transactRender } from './overlay-images.js';

// SoundTouch 动态加载
let _SoundTouchNode = null;
async function getSoundTouchNode() {
  if (_SoundTouchNode !== null) return _SoundTouchNode;
  try {
    let mod = await import('@soundtouchjs/audio-worklet');
    _SoundTouchNode = mod.SoundTouchNode;
  } catch (e) {
    console.warn('[AudioEditor] SoundTouch 库加载失败:', e);
    _SoundTouchNode = false;
  }
  return _SoundTouchNode;
}

// ── 状态变量 ──
let audioEditorModal = null;
let wavesurferInstance = null;
let editorAudioData = null;
let regionsPlugin = null;

// 音频效果链
let audioCtx = null;
let sourceNode = null;
let lowEQNode = null;
let midEQNode = null;
let highEQNode = null;
let compressorNode = null;
let reverbNode = null;
let reverbGainNode = null;
let dryGainNode = null;
let masterGain = null;
let analyserNode = null;
let effectsReady = false;

// 频谱分析
let specCanvas = null;
let specCtx2d = null;
let specAnimId = null;
let peakHolds = new Float32Array(64);
let peakDecay = new Float32Array(64);

// 标记
let markers = [];
let markerIdSeq = 0;
let markerColors = ['#00e5ff', '#ff6b9d', '#ffd93d', '#6bff6b', '#ff6b6b', '#b388ff', '#ffab40'];

// 效果参数
let eqLow = 0;
let eqMid = 0;
let eqHigh = 0;
let fadeInDur = 0;
let fadeOutDur = 0;
let compThreshold = -24;
let compRatio = 12;
let compAttack = 0.003;
let compRelease = 0.25;
let compEnabled = false;
let reverbMix = 0;
let reverbDecay = 2;
let reverbEnabled = false;

// 波形样式
let waveformStyle = 'fill'; // 'fill' | 'line' | 'mirror'

// 速度与音调
let playbackSpeed = 1;   // 播放速度倍率 (0.25 ~ 4)
let pitchShift = 0;      // 音调偏移（半音，-24 ~ +24）
let pitchShifterNode = null; // SoundTouch 高品质音调偏移节点

// 反转播放
let isReversed = false;

// A/B 对比
let abState = 'A'; // 'A' = 当前效果, 'B' = 旁通
let savedParams = null;

// 当前标签页
let activeTab = 'eq';

// 进度条拖动状态
let isSeekDragging = false;

// 键盘监听引用
let keyHandlerRef = null;

// ── 工具函数 ──
function fmtTime(s) {
  if (!s || isNaN(s)) return '0:00';
  let m = Math.floor(s / 60);
  let sec = Math.floor(s % 60);
  return m + ':' + (sec < 10 ? '0' : '') + sec;
}

function fmtTimeFull(s) {
  if (!s || isNaN(s)) return '0:00.000';
  let m = Math.floor(s / 60);
  let sec = Math.floor(s % 60);
  let ms = Math.floor((s % 1) * 1000);
  return m + ':' + (sec < 10 ? '0' : '') + sec + '.' + (ms < 10 ? '00' : ms < 100 ? '0' : '') + ms;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ── 主入口 ──
export function openAudioEditor(imgData) {
  if (!window.WaveSurfer) {
    alert('音频编辑器未加载，请检查网络连接后刷新页面');
    return;
  }
  editorAudioData = imgData;
  // 恢复持久化参数
  markers = (imgData.markers || []).map(function (m) { return Object.assign({}, m); });
  markerIdSeq = markers.reduce(function (mx, m) { return Math.max(mx, m.id || 0); }, 0) + 1;
  eqLow = imgData.eqLow || 0;
  eqMid = imgData.eqMid || 0;
  eqHigh = imgData.eqHigh || 0;
  fadeInDur = imgData.fadeInDur || 0;
  fadeOutDur = imgData.fadeOutDur || 0;
  compThreshold = imgData.compressorThreshold != null ? imgData.compressorThreshold : -24;
  compRatio = imgData.compressorRatio != null ? imgData.compressorRatio : 12;
  compEnabled = imgData.compEnabled || false;
  reverbMix = imgData.reverbMix || 0;
  reverbDecay = imgData.reverbDecay || 2;
  reverbEnabled = imgData.reverbEnabled || false;
  waveformStyle = imgData.waveformStyle || 'fill';
  playbackSpeed = imgData.playbackSpeed || 1;
  pitchShift = imgData.pitchShift || 0;
  isReversed = false;
  abState = 'A';
  savedParams = null;
  activeTab = 'eq';
  effectsReady = false;
  peakHolds.fill(0);
  peakDecay.fill(0);

  createAudioEditorModal();
}

// ── 颜色常量 ──
var C = {
  bg0: '#0a1620', bg1: '#0d1f2b', bg2: '#142835', bg3: '#1a3a44',
  accent: '#2c6e7e', accentH: '#3a8090', accentA: '#4a9eae',
  txt: '#aef0ff', txt2: '#8899aa', hi: '#00e5ff',
  border: '#1a3a44', danger: '#ff6666', green: '#99ffcc',
  redBtn: '#3a2a2a', redBd: '#6a4a4a', redTxt: '#ff9999',
  greenBtn: '#2a5a4a', greenBd: '#4a8a6a'
};

// ── 创建弹窗 ──
function createAudioEditorModal() {
  if (audioEditorModal && audioEditorModal.parentNode) return;

  audioEditorModal = document.createElement('div');
  audioEditorModal.id = 'olyAudioEditorModal';
  audioEditorModal.style.cssText =
    'position:fixed;z-index:100000;inset:0;background:rgba(0,0,0,0.88);' +
    'display:flex;align-items:center;justify-content:center;';

  audioEditorModal.innerHTML =
    '<div style="' +
      'background:' + C.bg1 + ';border:1px solid ' + C.accent + ';border-radius:12px;' +
      'width:96vw;max-width:1200px;height:90vh;max-height:820px;' +
      'display:flex;flex-direction:column;overflow:hidden;' +
    '">' +

    // ── header ──
    '<div style="display:flex;align-items:center;justify-content:space-between;' +
      'padding:10px 16px;background:' + C.bg0 + ';border-bottom:1px solid ' + C.border + ';flex-shrink:0;">' +
      '<div style="display:flex;align-items:center;gap:8px;">' +
        '<span style="color:' + C.hi + ';font-size:16px;">&#9835;</span>' +
        '<span style="color:' + C.txt + ';font-weight:600;font-size:14px;">音频编辑器</span>' +
        '<span id="audioEdFileName" style="color:' + C.txt2 + ';font-size:11px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-left:8px;">' +
          (editorAudioData.fileName || '音频') + '</span>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:10px;">' +
        '<button id="audioEdCancel" style="background:' + C.redBtn + ';border:1px solid ' + C.redBd + ';color:' + C.redTxt + ';' +
          'padding:5px 14px;border-radius:5px;cursor:pointer;font-size:12px;">取消</button>' +
        '<button id="audioEdApply" style="background:' + C.greenBtn + ';border:1px solid ' + C.greenBd + ';color:' + C.green + ';' +
          'padding:5px 18px;border-radius:5px;cursor:pointer;font-size:12px;font-weight:600;">确定</button>' +
      '</div>' +
    '</div>' +

    // ── 工具栏 ──
    '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0;padding:8px 14px;' +
      'background:' + C.bg2 + ';border-bottom:1px solid ' + C.border + ';flex-wrap:wrap;">' +
      // 播放控制
      '<button id="audioEdSkipBack" title="后退5秒" style="' + toolBtnStyle(C.bg3, C.border, C.txt2) + '">&#9198;</button>' +
      '<button id="audioEdPlayBtn" title="播放/暂停 (Space)" style="' +
        'width:38px;height:38px;border-radius:50%;border:2px solid ' + C.hi + ';' +
        'background:transparent;color:' + C.hi + ';font-size:15px;cursor:pointer;' +
        'display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background 0.15s;' +
      '">&#9654;</button>' +
      '<button id="audioEdStopBtn" title="停止" style="' + toolBtnStyle(C.bg3, C.border, C.txt2) + '">&#9632;</button>' +
      '<button id="audioEdSkipFwd" title="前进5秒" style="' + toolBtnStyle(C.bg3, C.border, C.txt2) + '">&#9197;</button>' +
      // 分隔
      '<div style="width:1px;height:22px;background:' + C.border + ';flex-shrink:0;"></div>' +
      // 音量
      '<span id="audioEdVolIcon" style="color:' + C.txt2 + ';font-size:13px;cursor:pointer;" title="静音切换 (M)">&#128264;</span>' +
      '<input id="audioEdVolume" type="range" min="0" max="100" value="100" style="width:70px;">' +
      // 分隔
      '<div style="width:1px;height:22px;background:' + C.border + ';flex-shrink:0;"></div>' +
      // 速度
      '<span style="color:' + C.txt2 + ';font-size:10px;">速度</span>' +
      '<button id="audioEdSpeedDec" title="减速" style="' + numBtnStyle() + '">-</button>' +
      '<input id="audioEdSpeed" type="number" min="0.25" max="4" step="0.05" value="' + playbackSpeed.toFixed(2) + '" style="' + numInputStyle(48) + '">' +
      '<button id="audioEdSpeedInc" title="加速" style="' + numBtnStyle() + '">+</button>' +
      '<span style="color:' + C.txt2 + ';font-size:9px;">x</span>' +
      // 音调
      '<span style="color:' + C.txt2 + ';font-size:10px;margin-left:4px;">音调</span>' +
      '<button id="audioEdPitchDec" title="降调" style="' + numBtnStyle() + '">-</button>' +
      '<input id="audioEdPitch" type="number" min="-24" max="24" step="1" value="' + pitchShift + '" style="' + numInputStyle(38) + '">' +
      '<button id="audioEdPitchInc" title="升调" style="' + numBtnStyle() + '">+</button>' +
      '<span style="color:' + C.txt2 + ';font-size:9px;">st</span>' +
      // 循环
      '<button id="audioEdLoopBtn" title="循环播放 (L)" style="' +
        'padding:3px 8px;border-radius:4px;border:1px solid ' + C.border + ';' +
        'background:' + C.bg2 + ';color:' + (editorAudioData.loop ? C.hi : C.txt2) + ';' +
        'font-size:11px;cursor:pointer;flex-shrink:0;' +
      '">&#8635;</button>' +
      // 分隔
      '<div style="width:1px;height:22px;background:' + C.border + ';flex-shrink:0;"></div>' +
      // 缩放
      '<span style="color:' + C.txt2 + ';font-size:10px;">缩放</span>' +
      '<input id="audioEdZoom" type="range" min="1" max="500" value="1" style="width:80px;">' +
      // 分隔
      '<div style="width:1px;height:22px;background:' + C.border + ';flex-shrink:0;"></div>' +
      // 工具按钮
      '<button id="audioEdFadeIn" title="淡入" style="' + toolBtnStyle(C.bg3, C.accent, C.txt) + '">&#9656;&#9656; 淡入</button>' +
      '<button id="audioEdFadeOut" title="淡出" style="' + toolBtnStyle(C.bg3, C.accent, C.txt) + '">淡出 &#9656;&#9656;</button>' +
      '<button id="audioEdAddMarker" title="添加标记" style="' + toolBtnStyle(C.bg3, C.accent, C.txt) + '">&#128204; 标记</button>' +
      // 分隔
      '<div style="width:1px;height:22px;background:' + C.border + ';flex-shrink:0;"></div>' +
      '<button id="audioEdReverse" title="反转播放" style="' + toolBtnStyle(C.bg3, C.accent, C.txt) + '">&#8634; 反转</button>' +
      '<button id="audioEdNormalize" title="归一化" style="' + toolBtnStyle(C.bg3, C.accent, C.txt) + '">&#8593; 归一化</button>' +
      '<button id="audioEdWaveStyle" title="波形样式" style="' + toolBtnStyle(C.bg3, C.accent, C.txt) + '">&#8776; 波形</button>' +
      '<button id="audioEdAB" title="A/B对比 (旁通效果)" style="' + toolBtnStyle(C.bg3, C.accent, C.txt) + '">A/B</button>' +
      // 分隔
      '<div style="width:1px;height:22px;background:' + C.border + ';flex-shrink:0;"></div>' +
      '<button id="audioEdExport" title="导出WAV" style="' + toolBtnStyle('#2a4a3a', '#4a8a6a', C.green) + '">&#128190; 导出</button>' +
    '</div>' +

    // ── 主体区域 ──
    '<div style="flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;padding:12px 16px;gap:8px;">' +

      // 波形
      '<div id="audioEdWaveform" style="' +
        'flex:1;min-height:100px;background:' + C.bg0 + ';border:1px solid ' + C.border + ';' +
        'border-radius:8px;overflow:hidden;position:relative;' +
      '"></div>' +

      // 频谱分析器
      '<canvas id="audioEdSpectrum" style="' +
        'height:72px;min-height:72px;max-height:72px;width:100%;' +
        'background:' + C.bg0 + ';border:1px solid ' + C.border + ';' +
        'border-radius:6px;' +
      '"></canvas>' +

      // 时间显示
      '<div style="display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">' +
        '<span id="audioEdCurrentTime" style="color:' + C.hi + ';font-size:13px;font-family:monospace;">0:00.000</span>' +
        '<span id="audioEdAudioInfo" style="color:' + C.txt2 + ';font-size:10px;"></span>' +
        '<span id="audioEdDuration" style="color:' + C.txt2 + ';font-size:12px;font-family:monospace;">0:00.000</span>' +
      '</div>' +

      // 可拖动进度条
      '<div id="audioEdSeekBar" style="' +
        'width:100%;height:14px;position:relative;cursor:pointer;flex-shrink:0;margin-top:4px;' +
        'border-radius:7px;overflow:hidden;background:' + C.bg3 + ';' +
      '">' +
        '<div id="audioEdSeekFill" style="' +
          'position:absolute;top:0;left:0;height:100%;width:0%;' +
          'background:linear-gradient(90deg,rgba(0,229,255,0.4),rgba(0,229,255,0.15));' +
          'border-radius:7px;pointer-events:none;' +
        '"></div>' +
        '<div id="audioEdSeekThumb" style="' +
          'position:absolute;top:50%;left:0%;width:12px;height:12px;' +
          'background:#00e5ff;border-radius:50%;transform:translate(-50%,-50%);' +
          'box-shadow:0 0 8px rgba(0,229,255,0.6);pointer-events:none;' +
          'z-index:2;transition:left 0.05s linear;' +
        '"></div>' +
      '</div>' +

    '</div>' +

    // ── 底部面板 ──
    '<div style="flex-shrink:0;border-top:1px solid ' + C.border + ';background:' + C.bg0 + ';">' +
      // 标签栏
      '<div style="display:flex;border-bottom:1px solid ' + C.border + ';">' +
        '<button class="aed-tab" data-tab="eq" style="' + tabBtnStyle(true) + '">均衡器</button>' +
        '<button class="aed-tab" data-tab="effects" style="' + tabBtnStyle(false) + '">效果</button>' +
        '<button class="aed-tab" data-tab="markers" style="' + tabBtnStyle(false) + '">标记</button>' +
        '<button class="aed-tab" data-tab="shortcuts" style="' + tabBtnStyle(false) + '">快捷键</button>' +
      '</div>' +
      // 标签内容
      '<div id="aedTabContent" style="padding:10px 16px;max-height:160px;overflow-y:auto;">' +
        buildEqTabContent() +
      '</div>' +
    '</div>' +

    // ── 区域信息 ──
    '<div id="audioEdRegionInfo" style="display:none;flex-shrink:0;padding:6px 12px;' +
      'background:' + C.bg2 + ';border-top:1px solid ' + C.accent + ';' +
      'font-size:11px;color:' + C.txt2 + ';">' +
    '</div>' +

    '</div>';

  document.body.appendChild(audioEditorModal);

  // 隐藏数字输入框的浏览器默认spinner
  var numStyle = document.createElement('style');
  numStyle.textContent =
    '#audioEdSpeed::-webkit-inner-spin-button,#audioEdSpeed::-webkit-outer-spin-button,' +
    '#audioEdPitch::-webkit-inner-spin-button,#audioEdPitch::-webkit-outer-spin-button' +
    '{-webkit-appearance:none;margin:0;}';
  document.head.appendChild(numStyle);

  // 初始化频谱画布
  initSpectrumCanvas();

  // 绑定事件
  bindAudioEditorEvents();

  // 初始化 WaveSurfer
  initWaveSurfer();
}

function toolBtnStyle(bg, bd, color) {
  return 'padding:3px 8px;border-radius:4px;border:1px solid ' + bd + ';' +
    'background:' + bg + ';color:' + color + ';font-size:11px;cursor:pointer;flex-shrink:0;' +
    'transition:background 0.12s;';
}

function numBtnStyle() {
  return 'width:22px;height:22px;border-radius:3px;border:1px solid ' + C.border + ';' +
    'background:' + C.bg3 + ';color:' + C.txt + ';font-size:13px;font-weight:bold;' +
    'cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;' +
    'padding:0;line-height:1;';
}

function numInputStyle(w) {
  return 'width:' + w + 'px;height:22px;border-radius:3px;border:1px solid ' + C.border + ';' +
    'background:' + C.bg0 + ';color:' + C.hi + ';font-size:11px;text-align:center;' +
    'font-family:monospace;padding:0 2px;outline:none;flex-shrink:0;' +
    '-moz-appearance:textfield;' +
    '-webkit-appearance:none;' +
    'appearance:textfield;';
}

function tabBtnStyle(active) {
  return 'padding:6px 16px;border:none;background:' + (active ? C.bg0 : 'transparent') + ';' +
    'color:' + (active ? C.hi : C.txt2) + ';font-size:12px;cursor:pointer;' +
    'border-bottom:2px solid ' + (active ? C.hi : 'transparent') + ';' +
    'transition:all 0.15s;';
}

function buildEqTabContent() {
  return '<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">' +
    // 低频
    '<div style="display:flex;align-items:center;gap:6px;">' +
      '<span style="color:' + C.txt2 + ';font-size:10px;width:24px;">低频</span>' +
      '<input id="audioEdEQLow" type="range" min="-12" max="12" value="' + eqLow + '" step="0.5" style="width:90px;">' +
      '<span id="audioEdEQLowVal" style="color:' + C.hi + ';font-size:10px;width:36px;font-family:monospace;">' + (eqLow > 0 ? '+' : '') + eqLow + 'dB</span>' +
    '</div>' +
    // 中频
    '<div style="display:flex;align-items:center;gap:6px;">' +
      '<span style="color:' + C.txt2 + ';font-size:10px;width:24px;">中频</span>' +
      '<input id="audioEdEQMid" type="range" min="-12" max="12" value="' + eqMid + '" step="0.5" style="width:90px;">' +
      '<span id="audioEdEQMidVal" style="color:' + C.hi + ';font-size:10px;width:36px;font-family:monospace;">' + (eqMid > 0 ? '+' : '') + eqMid + 'dB</span>' +
    '</div>' +
    // 高频
    '<div style="display:flex;align-items:center;gap:6px;">' +
      '<span style="color:' + C.txt2 + ';font-size:10px;width:24px;">高频</span>' +
      '<input id="audioEdEQHigh" type="range" min="-12" max="12" value="' + eqHigh + '" step="0.5" style="width:90px;">' +
      '<span id="audioEdEQHighVal" style="color:' + C.hi + ';font-size:10px;width:36px;font-family:monospace;">' + (eqHigh > 0 ? '+' : '') + eqHigh + 'dB</span>' +
    '</div>' +
    // 分隔
    '<div style="width:1px;height:24px;background:' + C.border + ';flex-shrink:0;"></div>' +
    // 淡入
    '<div style="display:flex;align-items:center;gap:4px;">' +
      '<span style="color:' + C.txt2 + ';font-size:10px;">淡入</span>' +
      '<input id="audioEdFadeInVal" type="number" min="0" max="30" step="0.5" value="' + fadeInDur + '" style="' +
        'width:48px;background:' + C.bg3 + ';border:1px solid ' + C.border + ';color:' + C.txt + ';' +
        'border-radius:3px;padding:2px 4px;font-size:11px;text-align:center;' +
      '">' +
      '<span style="color:' + C.txt2 + ';font-size:10px;">s</span>' +
    '</div>' +
    // 淡出
    '<div style="display:flex;align-items:center;gap:4px;">' +
      '<span style="color:' + C.txt2 + ';font-size:10px;">淡出</span>' +
      '<input id="audioEdFadeOutVal" type="number" min="0" max="30" step="0.5" value="' + fadeOutDur + '" style="' +
        'width:48px;background:' + C.bg3 + ';border:1px solid ' + C.border + ';color:' + C.txt + ';' +
        'border-radius:3px;padding:2px 4px;font-size:11px;text-align:center;' +
      '">' +
      '<span style="color:' + C.txt2 + ';font-size:10px;">s</span>' +
    '</div>' +
    // 重置
    '<button id="audioEdResetFX" style="padding:3px 10px;border-radius:4px;border:1px solid ' + C.redBd + ';' +
      'background:' + C.redBtn + ';color:' + C.redTxt + ';font-size:10px;cursor:pointer;">重置效果</button>' +
  '</div>';
}

function buildMarkersTabContent() {
  var html = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">' +
    '<span style="color:' + C.txt2 + ';font-size:11px;">点击波形上的 &#128204;标记 按钮在当前播放位置添加标记</span>' +
  '</div>';
  if (markers.length === 0) {
    html += '<div style="color:' + C.txt2 + ';font-size:11px;text-align:center;padding:8px;">暂无标记</div>';
  } else {
    html += '<div style="display:flex;flex-direction:column;gap:4px;">';
    markers.forEach(function (m) {
      html += '<div style="display:flex;align-items:center;gap:8px;padding:4px 8px;background:' + C.bg2 + ';border-radius:4px;">' +
        '<span style="width:8px;height:8px;border-radius:50%;background:' + m.color + ';flex-shrink:0;"></span>' +
        '<span style="color:' + C.hi + ';font-size:11px;font-family:monospace;width:70px;">' + fmtTimeFull(m.time) + '</span>' +
        '<input class="aed-marker-label" data-mid="' + m.id + '" value="' + (m.label || '') + '" placeholder="标记名称" style="' +
          'flex:1;background:transparent;border:1px solid ' + C.border + ';color:' + C.txt + ';' +
          'border-radius:3px;padding:2px 6px;font-size:11px;min-width:60px;' +
        '">' +
        '<button class="aed-marker-seek" data-mid="' + m.id + '" style="' + toolBtnStyle(C.bg3, C.accent, C.txt) + '">跳转</button>' +
        '<button class="aed-marker-del" data-mid="' + m.id + '" style="' + toolBtnStyle(C.redBtn, C.redBd, C.redTxt) + '">&#10005;</button>' +
      '</div>';
    });
    html += '</div>';
  }
  return html;
}

function buildShortcutsTabContent() {
  return '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px 20px;font-size:11px;">' +
    shortcutRow('Space', '播放/暂停') +
    shortcutRow('&#8592; / &#8594;', '后退/前进 5秒') +
    shortcutRow('&#8593; / &#8595;', '音量 增/减') +
    shortcutRow('Home', '跳到开头') +
    shortcutRow('End', '跳到末尾') +
    shortcutRow('M', '静音切换') +
    shortcutRow('L', '循环切换') +
    shortcutRow('R', '反转播放') +
    shortcutRow('B', 'A/B对比切换') +
    shortcutRow('Ctrl+S', '应用并关闭') +
    shortcutRow('Esc', '取消关闭') +
  '</div>';
}

function shortcutRow(key, desc) {
  return '<div style="display:flex;align-items:center;gap:6px;">' +
    '<kbd style="background:' + C.bg3 + ';border:1px solid ' + C.border + ';border-radius:3px;' +
      'padding:1px 6px;color:' + C.hi + ';font-size:10px;font-family:monospace;">' + key + '</kbd>' +
    '<span style="color:' + C.txt2 + ';">' + desc + '</span>' +
  '</div>';
}

// ── 效果标签页 ──
function buildEffectsTabContent() {
  return '<div style="display:flex;gap:16px;flex-wrap:wrap;">' +

    // 压缩器
    '<div style="flex:1;min-width:240px;padding:8px 10px;background:' + C.bg2 + ';border-radius:6px;border:1px solid ' + C.border + ';">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">' +
        '<span style="color:' + C.hi + ';font-size:12px;font-weight:600;">压缩器</span>' +
        '<label style="display:flex;align-items:center;gap:4px;cursor:pointer;">' +
          '<input id="audioEdCompEnable" type="checkbox" ' + (compEnabled ? 'checked' : '') + ' style="accent-color:' + C.hi + ';">' +
          '<span style="color:' + C.txt2 + ';font-size:10px;">启用</span>' +
        '</label>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:4px;' + (compEnabled ? '' : 'opacity:0.5;pointer-events:none;') + '" id="audioEdCompControls">' +
        // 阈值
        '<div style="display:flex;align-items:center;gap:6px;">' +
          '<span style="color:' + C.txt2 + ';font-size:10px;width:36px;">阈值</span>' +
          '<input id="audioEdCompThresh" type="range" min="-60" max="0" value="' + compThreshold + '" step="1" style="flex:1;">' +
          '<span id="audioEdCompThreshVal" style="color:' + C.hi + ';font-size:10px;width:40px;font-family:monospace;">' + compThreshold + 'dB</span>' +
        '</div>' +
        // 比率
        '<div style="display:flex;align-items:center;gap:6px;">' +
          '<span style="color:' + C.txt2 + ';font-size:10px;width:36px;">比率</span>' +
          '<input id="audioEdCompRatio" type="range" min="1" max="20" value="' + compRatio + '" step="0.5" style="flex:1;">' +
          '<span id="audioEdCompRatioVal" style="color:' + C.hi + ';font-size:10px;width:40px;font-family:monospace;">' + compRatio + ':1</span>' +
        '</div>' +
        // 启动
        '<div style="display:flex;align-items:center;gap:6px;">' +
          '<span style="color:' + C.txt2 + ';font-size:10px;width:36px;">启动</span>' +
          '<input id="audioEdCompAttack" type="range" min="0" max="1" value="' + compAttack + '" step="0.001" style="flex:1;">' +
          '<span id="audioEdCompAttackVal" style="color:' + C.hi + ';font-size:10px;width:40px;font-family:monospace;">' + (compAttack * 1000).toFixed(0) + 'ms</span>' +
        '</div>' +
        // 释放
        '<div style="display:flex;align-items:center;gap:6px;">' +
          '<span style="color:' + C.txt2 + ';font-size:10px;width:36px;">释放</span>' +
          '<input id="audioEdCompRelease" type="range" min="0.01" max="1" value="' + compRelease + '" step="0.01" style="flex:1;">' +
          '<span id="audioEdCompReleaseVal" style="color:' + C.hi + ';font-size:10px;width:40px;font-family:monospace;">' + (compRelease * 1000).toFixed(0) + 'ms</span>' +
        '</div>' +
      '</div>' +
    '</div>' +

    // 混响
    '<div style="flex:1;min-width:240px;padding:8px 10px;background:' + C.bg2 + ';border-radius:6px;border:1px solid ' + C.border + ';">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">' +
        '<span style="color:' + C.hi + ';font-size:12px;font-weight:600;">混响</span>' +
        '<label style="display:flex;align-items:center;gap:4px;cursor:pointer;">' +
          '<input id="audioEdReverbEnable" type="checkbox" ' + (reverbEnabled ? 'checked' : '') + ' style="accent-color:' + C.hi + ';">' +
          '<span style="color:' + C.txt2 + ';font-size:10px;">启用</span>' +
        '</label>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:4px;' + (reverbEnabled ? '' : 'opacity:0.5;pointer-events:none;') + '" id="audioEdReverbControls">' +
        // 混合量
        '<div style="display:flex;align-items:center;gap:6px;">' +
          '<span style="color:' + C.txt2 + ';font-size:10px;width:36px;">混合</span>' +
          '<input id="audioEdReverbMix" type="range" min="0" max="100" value="' + Math.round(reverbMix * 100) + '" step="1" style="flex:1;">' +
          '<span id="audioEdReverbMixVal" style="color:' + C.hi + ';font-size:10px;width:40px;font-family:monospace;">' + Math.round(reverbMix * 100) + '%</span>' +
        '</div>' +
        // 衰减
        '<div style="display:flex;align-items:center;gap:6px;">' +
          '<span style="color:' + C.txt2 + ';font-size:10px;width:36px;">衰减</span>' +
          '<input id="audioEdReverbDecay" type="range" min="0.5" max="8" value="' + reverbDecay + '" step="0.1" style="flex:1;">' +
          '<span id="audioEdReverbDecayVal" style="color:' + C.hi + ';font-size:10px;width:40px;font-family:monospace;">' + reverbDecay.toFixed(1) + 's</span>' +
        '</div>' +
      '</div>' +
    '</div>' +

  '</div>';
}

function bindEffectsControls() {
  var compEnable = audioEditorModal.querySelector('#audioEdCompEnable');
  var compThresh = audioEditorModal.querySelector('#audioEdCompThresh');
  var compRatioEl = audioEditorModal.querySelector('#audioEdCompRatio');
  var compAttackEl = audioEditorModal.querySelector('#audioEdCompAttack');
  var compReleaseEl = audioEditorModal.querySelector('#audioEdCompRelease');
  var reverbEnable = audioEditorModal.querySelector('#audioEdReverbEnable');
  var reverbMixEl = audioEditorModal.querySelector('#audioEdReverbMix');
  var reverbDecayEl = audioEditorModal.querySelector('#audioEdReverbDecay');

  if (compEnable) compEnable.addEventListener('change', function () {
    compEnabled = this.checked;
    updateCompressor();
    renderTabContent();
  });
  if (compThresh) compThresh.addEventListener('input', function () {
    compThreshold = parseFloat(this.value);
    var valEl = audioEditorModal.querySelector('#audioEdCompThreshVal');
    if (valEl) valEl.textContent = compThreshold + 'dB';
    updateCompressor();
  });
  if (compRatioEl) compRatioEl.addEventListener('input', function () {
    compRatio = parseFloat(this.value);
    var valEl = audioEditorModal.querySelector('#audioEdCompRatioVal');
    if (valEl) valEl.textContent = compRatio + ':1';
    updateCompressor();
  });
  if (compAttackEl) compAttackEl.addEventListener('input', function () {
    compAttack = parseFloat(this.value);
    var valEl = audioEditorModal.querySelector('#audioEdCompAttackVal');
    if (valEl) valEl.textContent = (compAttack * 1000).toFixed(0) + 'ms';
    updateCompressor();
  });
  if (compReleaseEl) compReleaseEl.addEventListener('input', function () {
    compRelease = parseFloat(this.value);
    var valEl = audioEditorModal.querySelector('#audioEdCompReleaseVal');
    if (valEl) valEl.textContent = (compRelease * 1000).toFixed(0) + 'ms';
    updateCompressor();
  });
  if (reverbEnable) reverbEnable.addEventListener('change', function () {
    reverbEnabled = this.checked;
    updateReverb();
    renderTabContent();
  });
  if (reverbMixEl) reverbMixEl.addEventListener('input', function () {
    reverbMix = parseInt(this.value) / 100;
    var valEl = audioEditorModal.querySelector('#audioEdReverbMixVal');
    if (valEl) valEl.textContent = Math.round(reverbMix * 100) + '%';
    updateReverb();
  });
  if (reverbDecayEl) reverbDecayEl.addEventListener('change', function () {
    reverbDecay = parseFloat(this.value);
    var valEl = audioEditorModal.querySelector('#audioEdReverbDecayVal');
    if (valEl) valEl.textContent = reverbDecay.toFixed(1) + 's';
    updateReverb();
  });
}

// ── 频谱画布初始化 ──
function initSpectrumCanvas() {
  specCanvas = audioEditorModal.querySelector('#audioEdSpectrum');
  if (!specCanvas) return;
  resizeSpectrumCanvas();
}

function resizeSpectrumCanvas() {
  if (!specCanvas) return;
  var dpr = window.devicePixelRatio || 1;
  var rect = specCanvas.getBoundingClientRect();
  specCanvas.width = Math.floor(rect.width * dpr);
  specCanvas.height = Math.floor(rect.height * dpr);
  specCtx2d = specCanvas.getContext('2d');
  specCtx2d.scale(dpr, dpr);
}

// ── 事件绑定 ──
function bindAudioEditorEvents() {
  var cancelBtn = audioEditorModal.querySelector('#audioEdCancel');
  var applyBtn = audioEditorModal.querySelector('#audioEdApply');
  var playBtn = audioEditorModal.querySelector('#audioEdPlayBtn');
  var stopBtn = audioEditorModal.querySelector('#audioEdStopBtn');
  var skipBack = audioEditorModal.querySelector('#audioEdSkipBack');
  var skipFwd = audioEditorModal.querySelector('#audioEdSkipFwd');
  var volIcon = audioEditorModal.querySelector('#audioEdVolIcon');
  var volumeSlider = audioEditorModal.querySelector('#audioEdVolume');
  var speedSelect = audioEditorModal.querySelector('#audioEdSpeed');
  var speedDecBtn = audioEditorModal.querySelector('#audioEdSpeedDec');
  var speedIncBtn = audioEditorModal.querySelector('#audioEdSpeedInc');
  var pitchInput = audioEditorModal.querySelector('#audioEdPitch');
  var pitchDecBtn = audioEditorModal.querySelector('#audioEdPitchDec');
  var pitchIncBtn = audioEditorModal.querySelector('#audioEdPitchInc');
  var loopBtn = audioEditorModal.querySelector('#audioEdLoopBtn');
  var zoomSlider = audioEditorModal.querySelector('#audioEdZoom');
  var fadeInBtn = audioEditorModal.querySelector('#audioEdFadeIn');
  var fadeOutBtn = audioEditorModal.querySelector('#audioEdFadeOut');
  var addMarkerBtn = audioEditorModal.querySelector('#audioEdAddMarker');
  var exportBtn = audioEditorModal.querySelector('#audioEdExport');
  var reverseBtn = audioEditorModal.querySelector('#audioEdReverse');
  var normalizeBtn = audioEditorModal.querySelector('#audioEdNormalize');
  var waveStyleBtn = audioEditorModal.querySelector('#audioEdWaveStyle');
  var abBtn = audioEditorModal.querySelector('#audioEdAB');

  cancelBtn.addEventListener('click', function () { closeAudioEditor(); });
  applyBtn.addEventListener('click', function () { applyAudioEditorChanges(); });

  // 播放/暂停
  playBtn.addEventListener('click', function () {
    if (!wavesurferInstance) return;
    resumeAudioCtx();
    wavesurferInstance.playPause();
  });
  playBtn.addEventListener('mouseenter', function () { playBtn.style.background = 'rgba(0,229,255,0.12)'; });
  playBtn.addEventListener('mouseleave', function () { playBtn.style.background = 'transparent'; });

  // 停止
  stopBtn.addEventListener('click', function () {
    if (!wavesurferInstance) return;
    wavesurferInstance.stop();
  });

  // 前进/后退
  skipBack.addEventListener('click', function () {
    if (!wavesurferInstance) return;
    var t = wavesurferInstance.getCurrentTime() - 5;
    wavesurferInstance.setTime(Math.max(0, t));
  });
  skipFwd.addEventListener('click', function () {
    if (!wavesurferInstance) return;
    var dur = wavesurferInstance.getDuration();
    var t = wavesurferInstance.getCurrentTime() + 5;
    wavesurferInstance.setTime(Math.min(dur, t));
  });

  // 音量
  var isMuted = false;
  volIcon.addEventListener('click', function () {
    isMuted = !isMuted;
    var vol = isMuted ? 0 : volumeSlider.value / 100;
    if (masterGain) masterGain.gain.value = vol;
    else if (wavesurferInstance) wavesurferInstance.setVolume(vol);
    volIcon.innerHTML = isMuted ? '&#128263;' : '&#128264;';
  });

  volumeSlider.addEventListener('input', function () {
    var vol = this.value / 100;
    if (masterGain) masterGain.gain.value = vol;
    else if (wavesurferInstance) wavesurferInstance.setVolume(vol);
    if (editorAudioData) editorAudioData.volume = vol;
  });

  // 速度与音调（独立控制）
  function applySpeedAndPitch() {
    if (!wavesurferInstance) return;
    // 速度：仅控制播放速率
    var rate = playbackSpeed;
    if (isReversed) rate = -Math.abs(rate);
    wavesurferInstance.setPlaybackRate(rate);
    // 音调：通过 SoundTouchNode 独立偏移，不影响速度
    if (pitchShifterNode) {
      pitchShifterNode.pitchSemitones.value = pitchShift;
      pitchShifterNode.playbackRate.value = rate;
    }
  }
  function clampSpeed(v) { return Math.round(Math.min(4, Math.max(0.25, v)) * 100) / 100; }
  function clampPitch(v) { return Math.round(Math.min(24, Math.max(-24, v))); }

  speedSelect.addEventListener('change', function () {
    playbackSpeed = clampSpeed(parseFloat(this.value) || 1);
    this.value = playbackSpeed.toFixed(2);
    applySpeedAndPitch();
  });
  speedDecBtn.addEventListener('click', function () {
    playbackSpeed = clampSpeed(playbackSpeed - 0.05);
    speedSelect.value = playbackSpeed.toFixed(2);
    applySpeedAndPitch();
  });
  speedIncBtn.addEventListener('click', function () {
    playbackSpeed = clampSpeed(playbackSpeed + 0.05);
    speedSelect.value = playbackSpeed.toFixed(2);
    applySpeedAndPitch();
  });
  pitchInput.addEventListener('change', function () {
    pitchShift = clampPitch(parseInt(this.value) || 0);
    this.value = pitchShift;
    applySpeedAndPitch();
  });
  pitchDecBtn.addEventListener('click', function () {
    pitchShift = clampPitch(pitchShift - 1);
    pitchInput.value = pitchShift;
    applySpeedAndPitch();
  });
  pitchIncBtn.addEventListener('click', function () {
    pitchShift = clampPitch(pitchShift + 1);
    pitchInput.value = pitchShift;
    applySpeedAndPitch();
  });

  // 循环
  loopBtn.addEventListener('click', function () {
    if (!wavesurferInstance) return;
    var looping = !wavesurferInstance.options.loop;
    wavesurferInstance.options.loop = looping;
    if (editorAudioData) editorAudioData.loop = looping;
    loopBtn.style.color = looping ? '#00e5ff' : '#8899aa';
  });

  // 缩放
  zoomSlider.addEventListener('input', function () {
    if (!wavesurferInstance) return;
    wavesurferInstance.zoom(Number(this.value));
  });

  // 淡入
  fadeInBtn.addEventListener('click', function () {
    var input = audioEditorModal.querySelector('#audioEdFadeInVal');
    var dur = input ? parseFloat(input.value) : 1;
    if (isNaN(dur) || dur <= 0) dur = 1;
    fadeInDur = dur;
    if (input) input.value = dur;
    applyFadeEffect('in');
  });

  // 淡出
  fadeOutBtn.addEventListener('click', function () {
    var input = audioEditorModal.querySelector('#audioEdFadeOutVal');
    var dur = input ? parseFloat(input.value) : 1;
    if (isNaN(dur) || dur <= 0) dur = 1;
    fadeOutDur = dur;
    if (input) input.value = dur;
    applyFadeEffect('out');
  });

  // 添加标记
  addMarkerBtn.addEventListener('click', function () {
    if (!wavesurferInstance) return;
    var time = wavesurferInstance.getCurrentTime();
    addMarkerAtTime(time);
  });

  // 导出
  exportBtn.addEventListener('click', function () { exportWAV(); });

  // 反转播放
  reverseBtn.addEventListener('click', function () {
    if (!wavesurferInstance) return;
    isReversed = !isReversed;
    applySpeedAndPitch();
    reverseBtn.style.color = isReversed ? C.hi : C.txt2;
    reverseBtn.style.borderColor = isReversed ? C.hi : C.accent;
  });

  // 归一化
  normalizeBtn.addEventListener('click', function () {
    if (!wavesurferInstance) return;
    var decoded = wavesurferInstance.getDecodedData();
    if (!decoded) return;
    // 找到最大振幅
    var maxAmp = 0;
    for (var ch = 0; ch < decoded.numberOfChannels; ch++) {
      var data = decoded.getChannelData(ch);
      for (var i = 0; i < data.length; i++) {
        var abs = Math.abs(data[i]);
        if (abs > maxAmp) maxAmp = abs;
      }
    }
    if (maxAmp > 0 && maxAmp < 1) {
      var gain = 1 / maxAmp;
      // 通过主增益应用归一化
      if (masterGain) {
        var vol = editorAudioData.volume ?? 1;
        masterGain.gain.value = vol * gain;
      }
      normalizeBtn.style.color = C.hi;
      normalizeBtn.style.borderColor = C.hi;
      setTimeout(function () {
        normalizeBtn.style.color = C.txt;
        normalizeBtn.style.borderColor = C.accent;
      }, 1500);
    } else if (maxAmp >= 1) {
      // 已经是满幅，无需归一化
      normalizeBtn.style.color = C.green;
      setTimeout(function () { normalizeBtn.style.color = C.txt; }, 1000);
    }
  });

  // 波形样式切换
  waveStyleBtn.addEventListener('click', function () {
    var styles = ['fill', 'line', 'mirror'];
    var idx = styles.indexOf(waveformStyle);
    waveformStyle = styles[(idx + 1) % styles.length];
    applyWaveformStyle();
    var labels = { fill: '填充', line: '线条', mirror: '镜像' };
    waveStyleBtn.innerHTML = '&#8776; ' + labels[waveformStyle];
  });

  // A/B 对比
  abBtn.addEventListener('click', function () {
    if (abState === 'A') {
      // 保存当前参数，切换到旁通
      savedParams = {
        eqLow: eqLow, eqMid: eqMid, eqHigh: eqHigh,
        compEnabled: compEnabled, reverbEnabled: reverbEnabled,
        fadeInDur: fadeInDur, fadeOutDur: fadeOutDur,
        playbackSpeed: playbackSpeed, pitchShift: pitchShift
      };
      // 旁通所有效果
      if (lowEQNode) lowEQNode.gain.value = 0;
      if (midEQNode) midEQNode.gain.value = 0;
      if (highEQNode) highEQNode.gain.value = 0;
      if (compressorNode) { compressorNode.threshold.value = 0; compressorNode.ratio.value = 1; }
      if (reverbGainNode) reverbGainNode.gain.value = 0;
      if (dryGainNode) dryGainNode.gain.value = 1;
      // 旁通速度和音调
      playbackSpeed = 1; pitchShift = 0;
      applySpeedAndPitch();
      var spEl = audioEditorModal.querySelector('#audioEdSpeed');
      var ptEl = audioEditorModal.querySelector('#audioEdPitch');
      if (spEl) spEl.value = '1.00';
      if (ptEl) ptEl.value = '0';
      abState = 'B';
      abBtn.textContent = 'B (旁通)';
      abBtn.style.color = '#ffd93d';
      abBtn.style.borderColor = '#ffd93d';
    } else {
      // 恢复效果参数
      if (savedParams) {
        eqLow = savedParams.eqLow; eqMid = savedParams.eqMid; eqHigh = savedParams.eqHigh;
        compEnabled = savedParams.compEnabled; reverbEnabled = savedParams.reverbEnabled;
        fadeInDur = savedParams.fadeInDur; fadeOutDur = savedParams.fadeOutDur;
        playbackSpeed = savedParams.playbackSpeed; pitchShift = savedParams.pitchShift;
        if (lowEQNode) lowEQNode.gain.value = eqLow;
        if (midEQNode) midEQNode.gain.value = eqMid;
        if (highEQNode) highEQNode.gain.value = eqHigh;
        updateCompressor();
        updateReverb();
        applySpeedAndPitch();
        var spEl2 = audioEditorModal.querySelector('#audioEdSpeed');
        var ptEl2 = audioEditorModal.querySelector('#audioEdPitch');
        if (spEl2) spEl2.value = playbackSpeed.toFixed(2);
        if (ptEl2) ptEl2.value = pitchShift;
      }
      abState = 'A';
      abBtn.textContent = 'A/B';
      abBtn.style.color = C.txt;
      abBtn.style.borderColor = C.accent;
    }
  });

  // 可拖动进度条
  var seekBar = audioEditorModal.querySelector('#audioEdSeekBar');
  var seekFill = audioEditorModal.querySelector('#audioEdSeekFill');
  var seekThumb = audioEditorModal.querySelector('#audioEdSeekThumb');

  function seekFromMouseEvent(e) {
    if (!wavesurferInstance) return;
    var rect = seekBar.getBoundingClientRect();
    var ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    var dur = wavesurferInstance.getDuration();
    if (dur && isFinite(dur)) {
      wavesurferInstance.setTime(ratio * dur);
    }
    seekFill.style.width = (ratio * 100) + '%';
    seekThumb.style.left = (ratio * 100) + '%';
  }

  seekBar.addEventListener('mousedown', function (e) {
    e.stopPropagation();
    isSeekDragging = true;
    seekFromMouseEvent(e);
  });
  document.addEventListener('mousemove', function (e) {
    if (isSeekDragging) seekFromMouseEvent(e);
  });
  document.addEventListener('mouseup', function () {
    isSeekDragging = false;
  });

  // EQ 滑块
  bindEQSliders();

  // 淡入淡出输入
  var fadeInInput = audioEditorModal.querySelector('#audioEdFadeInVal');
  var fadeOutInput = audioEditorModal.querySelector('#audioEdFadeOutVal');
  if (fadeInInput) fadeInInput.addEventListener('change', function () { fadeInDur = parseFloat(this.value) || 0; });
  if (fadeOutInput) fadeOutInput.addEventListener('change', function () { fadeOutDur = parseFloat(this.value) || 0; });

  // 重置效果
  var resetBtn = audioEditorModal.querySelector('#audioEdResetFX');
  if (resetBtn) resetBtn.addEventListener('click', function () { resetEffects(); });

  // 标签切换
  var tabs = audioEditorModal.querySelectorAll('.aed-tab');
  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      activeTab = this.dataset.tab;
      tabs.forEach(function (t) {
        t.style.color = t.dataset.tab === activeTab ? C.hi : C.txt2;
        t.style.borderBottom = '2px solid ' + (t.dataset.tab === activeTab ? C.hi : 'transparent');
        t.style.background = t.dataset.tab === activeTab ? C.bg0 : 'transparent';
      });
      renderTabContent();
    });
  });

  // 标记列表事件委托
  var tabContent = audioEditorModal.querySelector('#aedTabContent');
  tabContent.addEventListener('click', function (e) {
    var target = e.target;
    if (target.classList.contains('aed-marker-seek')) {
      var mid = parseInt(target.dataset.mid);
      var m = markers.find(function (mk) { return mk.id === mid; });
      if (m && wavesurferInstance) wavesurferInstance.setTime(m.time);
    }
    if (target.classList.contains('aed-marker-del')) {
      var mid2 = parseInt(target.dataset.mid);
      removeMarker(mid2);
    }
  });
  tabContent.addEventListener('change', function (e) {
    if (e.target.classList.contains('aed-marker-label')) {
      var mid = parseInt(e.target.dataset.mid);
      var m = markers.find(function (mk) { return mk.id === mid; });
      if (m) m.label = e.target.value;
      renderMarkersOnWaveform();
    }
  });

  // 点击背景关闭
  audioEditorModal.addEventListener('mousedown', function (e) {
    if (e.target === audioEditorModal) closeAudioEditor();
  });

  // 键盘快捷键
  keyHandlerRef = handleKeyboard;
  document.addEventListener('keydown', keyHandlerRef);
}

function bindEQSliders() {
  var lowSlider = audioEditorModal.querySelector('#audioEdEQLow');
  var midSlider = audioEditorModal.querySelector('#audioEdEQMid');
  var highSlider = audioEditorModal.querySelector('#audioEdEQHigh');
  var lowVal = audioEditorModal.querySelector('#audioEdEQLowVal');
  var midVal = audioEditorModal.querySelector('#audioEdEQMidVal');
  var highVal = audioEditorModal.querySelector('#audioEdEQHighVal');

  if (lowSlider) lowSlider.addEventListener('input', function () {
    eqLow = parseFloat(this.value);
    if (lowEQNode) lowEQNode.gain.value = eqLow;
    if (lowVal) lowVal.textContent = (eqLow > 0 ? '+' : '') + eqLow + 'dB';
  });
  if (midSlider) midSlider.addEventListener('input', function () {
    eqMid = parseFloat(this.value);
    if (midEQNode) midEQNode.gain.value = eqMid;
    if (midVal) midVal.textContent = (eqMid > 0 ? '+' : '') + eqMid + 'dB';
  });
  if (highSlider) highSlider.addEventListener('input', function () {
    eqHigh = parseFloat(this.value);
    if (highEQNode) highEQNode.gain.value = eqHigh;
    if (highVal) highVal.textContent = (eqHigh > 0 ? '+' : '') + eqHigh + 'dB';
  });
}

// ── 标签内容渲染 ──
function renderTabContent() {
  var el = audioEditorModal.querySelector('#aedTabContent');
  if (!el) return;
  if (activeTab === 'eq') {
    el.innerHTML = buildEqTabContent();
    bindEQSliders();
    var fadeInInput = el.querySelector('#audioEdFadeInVal');
    var fadeOutInput = el.querySelector('#audioEdFadeOutVal');
    if (fadeInInput) fadeInInput.addEventListener('change', function () { fadeInDur = parseFloat(this.value) || 0; });
    if (fadeOutInput) fadeOutInput.addEventListener('change', function () { fadeOutDur = parseFloat(this.value) || 0; });
    var resetBtn = el.querySelector('#audioEdResetFX');
    if (resetBtn) resetBtn.addEventListener('click', function () { resetEffects(); });
  } else if (activeTab === 'effects') {
    el.innerHTML = buildEffectsTabContent();
    bindEffectsControls();
  } else if (activeTab === 'markers') {
    el.innerHTML = buildMarkersTabContent();
  } else if (activeTab === 'shortcuts') {
    el.innerHTML = buildShortcutsTabContent();
  }
}

// ── 键盘快捷键 ──
function handleKeyboard(e) {
  if (!audioEditorModal || !audioEditorModal.parentNode) return;
  // 忽略输入框内的按键
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

  var handled = true;
  switch (e.key) {
    case ' ':
      if (wavesurferInstance) { resumeAudioCtx(); wavesurferInstance.playPause(); }
      break;
    case 'ArrowLeft':
      if (wavesurferInstance) wavesurferInstance.setTime(Math.max(0, wavesurferInstance.getCurrentTime() - 5));
      break;
    case 'ArrowRight':
      if (wavesurferInstance) wavesurferInstance.setTime(Math.min(wavesurferInstance.getDuration(), wavesurferInstance.getCurrentTime() + 5));
      break;
    case 'ArrowUp':
      if (wavesurferInstance) {
        var vol = clamp((editorAudioData.volume || 1) + 0.05, 0, 1);
        if (masterGain) masterGain.gain.value = vol;
        wavesurferInstance.setVolume(vol);
        editorAudioData.volume = vol;
        var vs = audioEditorModal.querySelector('#audioEdVolume');
        if (vs) vs.value = Math.round(vol * 100);
      }
      break;
    case 'ArrowDown':
      if (wavesurferInstance) {
        var vol2 = clamp((editorAudioData.volume || 1) - 0.05, 0, 1);
        if (masterGain) masterGain.gain.value = vol2;
        wavesurferInstance.setVolume(vol2);
        editorAudioData.volume = vol2;
        var vs2 = audioEditorModal.querySelector('#audioEdVolume');
        if (vs2) vs2.value = Math.round(vol2 * 100);
      }
      break;
    case 'Home':
      if (wavesurferInstance) wavesurferInstance.setTime(0);
      break;
    case 'End':
      if (wavesurferInstance) wavesurferInstance.setTime(wavesurferInstance.getDuration());
      break;
    case 'm': case 'M':
      audioEditorModal.querySelector('#audioEdVolIcon').click();
      break;
    case 'l': case 'L':
      audioEditorModal.querySelector('#audioEdLoopBtn').click();
      break;
    case 'r': case 'R':
      audioEditorModal.querySelector('#audioEdReverse').click();
      break;
    case 'b': case 'B':
      audioEditorModal.querySelector('#audioEdAB').click();
      break;
    case 's': case 'S':
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); applyAudioEditorChanges(); }
      else handled = false;
      break;
    case 'Escape':
      closeAudioEditor();
      break;
    default:
      handled = false;
  }
  if (handled) e.preventDefault();
}

// ── WaveSurfer 初始化 ──
function initWaveSurfer() {
  var container = audioEditorModal.querySelector('#audioEdWaveform');
  if (!container || !window.WaveSurfer) return;

  var wsOptions = {
    container: container,
    waveColor: 'rgba(0,229,255,0.4)',
    progressColor: 'rgba(0,229,255,0.8)',
    cursorColor: '#00e5ff',
    cursorWidth: 2,
    height: 'auto',
    barWidth: 2,
    barGap: 1,
    barRadius: 2,
    normalize: true,
    url: editorAudioData.src,
    volume: editorAudioData.volume ?? 1,
    playbackRate: 1,
    loop: editorAudioData.loop ?? false,
  };

  // Regions 插件
  if (window.WaveSurfer && window.WaveSurfer.Regions) {
    regionsPlugin = window.WaveSurfer.Regions.create();
    wsOptions.plugins = [regionsPlugin];
  }

  try {
    wavesurferInstance = window.WaveSurfer.create(wsOptions);
  } catch (e) {
    console.error('[AudioEditor] WaveSurfer 创建失败:', e);
    container.innerHTML = '<div style="color:#ff6666;padding:20px;text-align:center;">波形加载失败</div>';
    return;
  }

  var playBtn = audioEditorModal.querySelector('#audioEdPlayBtn');
  var currentTimeEl = audioEditorModal.querySelector('#audioEdCurrentTime');
  var durationEl = audioEditorModal.querySelector('#audioEdDuration');
  var infoEl = audioEditorModal.querySelector('#audioEdAudioInfo');

  wavesurferInstance.on('ready', function () {
    var dur = wavesurferInstance.getDuration();
    durationEl.textContent = fmtTimeFull(dur);
    currentTimeEl.textContent = '0:00.000';

    // 恢复音量
    var vol = editorAudioData.volume ?? 1;
    var volumeSlider = audioEditorModal.querySelector('#audioEdVolume');
    if (volumeSlider) volumeSlider.value = Math.round(vol * 100);

    // 设置效果链
    setupEffectsChain(); // async — 不阻塞后续初始化

    // 显示音频信息
    var decoded = wavesurferInstance.getDecodedData();
    if (decoded && infoEl) {
      infoEl.textContent = decoded.numberOfChannels + '声道 | ' + decoded.sampleRate + 'Hz | ' + fmtTime(dur);
    }

    // 恢复标记
    renderMarkersOnWaveform();

    // 应用波形样式
    applyWaveformStyle();
  });

  wavesurferInstance.on('play', function () {
    playBtn.innerHTML = '&#10074;&#10074;';
    startSpectrumAnimation();
    scheduleFadeAutomation();
  });

  wavesurferInstance.on('pause', function () {
    playBtn.innerHTML = '&#9654;';
    stopSpectrumAnimation();
  });

  wavesurferInstance.on('stop', function () {
    playBtn.innerHTML = '&#9654;';
    stopSpectrumAnimation();
  });

  wavesurferInstance.on('timeupdate', function (currentTime) {
    currentTimeEl.textContent = fmtTimeFull(currentTime);
    // 更新进度条
    var dur = wavesurferInstance.getDuration();
    if (dur && isFinite(dur) && !isSeekDragging) {
      var sf = audioEditorModal.querySelector('#audioEdSeekFill');
      var st = audioEditorModal.querySelector('#audioEdSeekThumb');
      var pct = (currentTime / dur) * 100;
      if (sf) sf.style.width = pct + '%';
      if (st) st.style.left = pct + '%';
    }
  });

  wavesurferInstance.on('error', function (e) {
    console.error('[AudioEditor] WaveSurfer 错误:', e);
    container.innerHTML = '<div style="color:#ff6666;padding:20px;text-align:center;">音频加载失败</div>';
  });

  // Regions 相关
  if (regionsPlugin) {
    regionsPlugin.enableDragSelection({ color: 'rgba(0,229,255,0.15)' });

    regionsPlugin.on('region-updated', function (region) {
      if (region.data && region.data.isMarker) return;
      updateRegionInfo(region);
    });

    regionsPlugin.on('region-clicked', function (region, e) {
      e.stopPropagation();
      if (region.data && region.data.isMarker) {
        if (wavesurferInstance) wavesurferInstance.setTime(region.start);
        return;
      }
      region.play();
    });
  }
}


// ── 音频效果链 ──
async function setupEffectsChain() {
  if (effectsReady) return;
  try {
    var mediaEl = wavesurferInstance ? wavesurferInstance.getMediaElement() : null;
    if (!mediaEl) {
      console.warn('[AudioEditor] 未找到音频元素，效果链未连接');
      return;
    }

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') await audioCtx.resume();

    sourceNode = audioCtx.createMediaElementSource(mediaEl);

    // 低频均衡器 (Low Shelf ~320Hz)
    lowEQNode = audioCtx.createBiquadFilter();
    lowEQNode.type = 'lowshelf';
    lowEQNode.frequency.value = 320;
    lowEQNode.gain.value = eqLow;

    // 中频均衡器 (Peaking ~1000Hz)
    midEQNode = audioCtx.createBiquadFilter();
    midEQNode.type = 'peaking';
    midEQNode.frequency.value = 1000;
    midEQNode.Q.value = 0.7;
    midEQNode.gain.value = eqMid;

    // 高频均衡器 (High Shelf ~3200Hz)
    highEQNode = audioCtx.createBiquadFilter();
    highEQNode.type = 'highshelf';
    highEQNode.frequency.value = 3200;
    highEQNode.gain.value = eqHigh;

    // 压缩器
    compressorNode = audioCtx.createDynamicsCompressor();
    compressorNode.threshold.value = compEnabled ? compThreshold : 0;
    compressorNode.ratio.value = compEnabled ? compRatio : 1;
    compressorNode.attack.value = compAttack;
    compressorNode.release.value = compRelease;
    compressorNode.knee.value = 6;

    // 混响（使用干/湿混合）
    reverbNode = audioCtx.createConvolver();
    reverbGainNode = audioCtx.createGain(); // 湿信号
    dryGainNode = audioCtx.createGain(); // 干信号
    dryGainNode.gain.value = 1;
    reverbGainNode.gain.value = reverbEnabled ? reverbMix : 0;
    if (reverbEnabled) {
      generateImpulseResponse(reverbDecay);
    }

    // 主增益
    masterGain = audioCtx.createGain();
    masterGain.gain.value = editorAudioData.volume ?? 1;

    // 分析器
    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 256;
    analyserNode.smoothingTimeConstant = 0.8;

    // 音调偏移（尝试 SoundTouch 高品质 WSOLA 算法）
    var SoundTouchNodeCtor = await getSoundTouchNode();
    pitchShifterNode = null;
    if (SoundTouchNodeCtor) {
      try {
        await SoundTouchNodeCtor.register(audioCtx, 'lib/soundtouch-processor.js');
        mediaEl.preservesPitch = false;
        pitchShifterNode = new SoundTouchNodeCtor({ context: audioCtx });
        pitchShifterNode.pitchSemitones.value = pitchShift;
        pitchShifterNode.playbackRate.value = playbackSpeed;
      } catch (stErr) {
        console.warn('[AudioEditor] SoundTouch Worklet 注册失败:', stErr);
        mediaEl.playbackRate = playbackSpeed;
      }
    } else {
      mediaEl.playbackRate = playbackSpeed;
    }

    // 连接链路: source → EQ → compressor → [dry/wet reverb] → [pitchShifter] → gain → analyser → destination
    sourceNode.connect(lowEQNode);
    lowEQNode.connect(midEQNode);
    midEQNode.connect(highEQNode);
    highEQNode.connect(compressorNode);

    // 混响并行路由: compressor → dry → [pitchShifter] → masterGain
    //                            → reverb → wet → [pitchShifter] → masterGain
    compressorNode.connect(dryGainNode);
    compressorNode.connect(reverbNode);
    reverbNode.connect(reverbGainNode);

    if (pitchShifterNode) {
      dryGainNode.connect(pitchShifterNode);
      reverbGainNode.connect(pitchShifterNode);
      pitchShifterNode.connect(masterGain);
    } else {
      dryGainNode.connect(masterGain);
      reverbGainNode.connect(masterGain);
    }

    masterGain.connect(analyserNode);
    analyserNode.connect(audioCtx.destination);

    effectsReady = true;
    console.log('[AudioEditor] 效果链已连接（含压缩器+混响+音调偏移）');
  } catch (e) {
    console.warn('[AudioEditor] 效果链连接失败:', e);
    effectsReady = false;
  }
}

// ── 生成脉冲响应（混响） ──
function generateImpulseResponse(duration) {
  if (!audioCtx || !reverbNode) return;
  var sr = audioCtx.sampleRate;
  var len = Math.max(1, Math.ceil(sr * duration));
  var impulse = audioCtx.createBuffer(2, len, sr);
  for (var ch = 0; ch < 2; ch++) {
    var data = impulse.getChannelData(ch);
    for (var i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    }
  }
  try {
    reverbNode.buffer = impulse;
  } catch (e) {
    console.warn('[AudioEditor] 混响脉冲设置失败:', e);
  }
}

// ── 更新压缩器参数 ──
function updateCompressor() {
  if (!compressorNode) return;
  if (compEnabled) {
    compressorNode.threshold.value = compThreshold;
    compressorNode.ratio.value = compRatio;
    compressorNode.attack.value = compAttack;
    compressorNode.release.value = compRelease;
  } else {
    compressorNode.threshold.value = 0;
    compressorNode.ratio.value = 1;
  }
}

// ── 更新混响参数 ──
function updateReverb() {
  if (!reverbGainNode || !dryGainNode) return;
  if (reverbEnabled) {
    reverbGainNode.gain.value = reverbMix;
    dryGainNode.gain.value = 1 - reverbMix * 0.5; // 干信号略减，避免爆音
    generateImpulseResponse(reverbDecay);
  } else {
    reverbGainNode.gain.value = 0;
    dryGainNode.gain.value = 1;
  }
}

function resumeAudioCtx() {
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

// ── 淡入淡出 ──
function applyFadeEffect(type) {
  if (!wavesurferInstance) return;
  var dur = wavesurferInstance.getDuration();
  var cur = wavesurferInstance.getCurrentTime();

  if (type === 'in') {
    // 从当前位置开始淡入
    if (masterGain && audioCtx) {
      masterGain.gain.cancelScheduledValues(audioCtx.currentTime);
      masterGain.gain.setValueAtTime(0, audioCtx.currentTime);
      masterGain.gain.linearRampToValueAtTime(editorAudioData.volume ?? 1, audioCtx.currentTime + fadeInDur);
    }
  } else {
    // 从当前位置开始淡出到末尾
    if (masterGain && audioCtx) {
      var remaining = dur - cur;
      var fadeLen = Math.min(fadeOutDur, remaining);
      masterGain.gain.cancelScheduledValues(audioCtx.currentTime);
      masterGain.gain.setValueAtTime(editorAudioData.volume ?? 1, audioCtx.currentTime);
      masterGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + fadeLen);
    }
  }
}

function scheduleFadeAutomation() {
  if (!masterGain || !audioCtx || !wavesurferInstance) return;
  if (fadeInDur <= 0 && fadeOutDur <= 0) return;

  var cur = wavesurferInstance.getCurrentTime();
  var dur = wavesurferInstance.getDuration();
  var vol = editorAudioData.volume ?? 1;

  masterGain.gain.cancelScheduledValues(audioCtx.currentTime);

  // 淡入
  if (fadeInDur > 0 && cur < fadeInDur) {
    masterGain.gain.setValueAtTime(0, audioCtx.currentTime);
    masterGain.gain.linearRampToValueAtTime(vol, audioCtx.currentTime + (fadeInDur - cur));
  } else {
    masterGain.gain.setValueAtTime(vol, audioCtx.currentTime);
  }

  // 淡出
  if (fadeOutDur > 0) {
    var fadeOutStart = dur - fadeOutDur;
    if (cur < fadeOutStart) {
      masterGain.gain.setValueAtTime(vol, audioCtx.currentTime + (fadeOutStart - cur));
    }
    masterGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + (dur - cur));
  }
}

function resetEffects() {
  eqLow = 0; eqMid = 0; eqHigh = 0;
  fadeInDur = 0; fadeOutDur = 0;
  compEnabled = false; compThreshold = -24; compRatio = 12; compAttack = 0.003; compRelease = 0.25;
  reverbEnabled = false; reverbMix = 0; reverbDecay = 2;

  if (lowEQNode) lowEQNode.gain.value = 0;
  if (midEQNode) midEQNode.gain.value = 0;
  if (highEQNode) highEQNode.gain.value = 0;
  if (masterGain) masterGain.gain.cancelScheduledValues(0);
  updateCompressor();
  updateReverb();

  renderTabContent();
}

// ── 波形样式 ──
function applyWaveformStyle() {
  if (!wavesurferInstance) return;
  var container = audioEditorModal.querySelector('#audioEdWaveform');
  if (!container) return;
  var canvas = container.querySelector('canvas');
  if (!canvas) return;

  // 移除旧样式覆盖
  var existingStyle = container.querySelector('.aed-wave-style');
  if (existingStyle) existingStyle.remove();

  var styleEl = document.createElement('style');
  styleEl.className = 'aed-wave-style';

  if (waveformStyle === 'line') {
    styleEl.textContent =
      '#audioEdWaveform canvas { filter: none !important; }' +
      '#audioEdWaveform { --wave-color: rgba(0,229,255,0.9); }';
    // WaveSurfer v7 使用 waveColor 选项
    try {
      wavesurferInstance.setOptions({
        waveColor: 'rgba(0,229,255,0.9)',
        progressColor: 'rgba(0,229,255,0.4)',
        fillParent: true
      });
    } catch (_) {}
  } else if (waveformStyle === 'mirror') {
    try {
      wavesurferInstance.setOptions({
        waveColor: 'rgba(0,229,255,0.7)',
        progressColor: 'rgba(0,229,255,0.3)',
        height: 'auto'
      });
    } catch (_) {}
  } else {
    // fill (default)
    try {
      wavesurferInstance.setOptions({
        waveColor: '#00e5ff',
        progressColor: 'rgba(0,229,255,0.3)'
      });
    } catch (_) {}
  }

  container.appendChild(styleEl);
}

// ── 频谱分析器 ──
function startSpectrumAnimation() {
  if (specAnimId) return;
  drawSpectrum();
}

function stopSpectrumAnimation() {
  if (specAnimId) {
    cancelAnimationFrame(specAnimId);
    specAnimId = null;
  }
}

function drawSpectrum() {
  if (!specCanvas || !specCtx2d) { specAnimId = null; return; }

  var W = specCanvas.getBoundingClientRect().width;
  var H = specCanvas.getBoundingClientRect().height;

  specCtx2d.clearRect(0, 0, W, H);

  var barCount = 64;
  var barW = Math.max(1, Math.floor(W / barCount) - 1);
  var gap = 1;

  if (analyserNode) {
    var bufLen = analyserNode.frequencyBinCount;
    var dataArr = new Uint8Array(bufLen);
    analyserNode.getByteFrequencyData(dataArr);

    var step = Math.max(1, Math.floor(bufLen / barCount));

    for (var i = 0; i < barCount; i++) {
      var val = dataArr[i * step] || 0;
      var barH = (val / 255) * H;
      var x = i * (barW + gap);

      // 峰值保持
      if (barH > peakHolds[i]) {
        peakHolds[i] = barH;
        peakDecay[i] = 0;
      } else {
        peakDecay[i] += 0.8;
        peakHolds[i] = Math.max(0, peakHolds[i] - peakDecay[i]);
      }

      // 绘制频谱条
      var grad = specCtx2d.createLinearGradient(x, H, x, H - barH);
      grad.addColorStop(0, 'rgba(0,229,255,0.2)');
      grad.addColorStop(0.5, 'rgba(0,229,255,0.6)');
      grad.addColorStop(1, 'rgba(0,229,255,0.95)');
      specCtx2d.fillStyle = grad;
      specCtx2d.fillRect(x, H - barH, barW, barH);

      // 绘制峰值指示
      if (peakHolds[i] > 2) {
        specCtx2d.fillStyle = '#00e5ff';
        specCtx2d.fillRect(x, H - peakHolds[i] - 2, barW, 2);
      }
    }
  } else {
    // 无分析器时绘制静态装饰
    for (var j = 0; j < barCount; j++) {
      var x2 = j * (barW + gap);
      var h2 = 2 + Math.sin(j * 0.3) * 2;
      specCtx2d.fillStyle = 'rgba(0,229,255,0.15)';
      specCtx2d.fillRect(x2, H - h2, barW, h2);
    }
  }

  specAnimId = requestAnimationFrame(drawSpectrum);
}

// ── 标记管理 ──
function addMarkerAtTime(time) {
  var id = markerIdSeq++;
  var color = markerColors[markers.length % markerColors.length];
  var m = { id: id, time: time, label: '标记 ' + id, color: color };
  markers.push(m);
  renderMarkersOnWaveform();
  if (activeTab === 'markers') renderTabContent();
}

function removeMarker(id) {
  markers = markers.filter(function (m) { return m.id !== id; });
  // 移除波形上的标记 region
  if (regionsPlugin) {
    var regs = regionsPlugin.getRegions();
    regs.forEach(function (r) {
      if (r.data && r.data.isMarker && r.data.markerId === id) {
        r.remove();
      }
    });
  }
  renderTabContent();
}

function renderMarkersOnWaveform() {
  if (!regionsPlugin) return;
  // 先移除旧标记
  var regs = regionsPlugin.getRegions();
  regs.forEach(function (r) {
    if (r.data && r.data.isMarker) r.remove();
  });
  // 添加新标记
  markers.forEach(function (m) {
    try {
      regionsPlugin.addRegion({
        start: m.time,
        end: m.time + 0.01,
        color: m.color + '55',
        content: m.label,
        drag: true,
        resize: false,
        data: { isMarker: true, markerId: m.id }
      });
    } catch (_) {}
  });
}

// ── 区域信息 ──
function updateRegionInfo(region) {
  var infoEl = audioEditorModal.querySelector('#audioEdRegionInfo');
  if (!infoEl) return;
  infoEl.style.display = 'block';
  infoEl.innerHTML =
    '<span style="color:' + C.hi + ';">选区</span> ' +
    fmtTimeFull(region.start) + ' — ' + fmtTimeFull(region.end) +
    ' <span style="color:' + C.txt2 + ';">(时长 ' + fmtTimeFull(region.end - region.start) + ')</span>' +
    ' <button id="audioEdPlayRegion" style="margin-left:8px;padding:2px 8px;border-radius:3px;border:1px solid ' + C.accent + ';' +
      'background:' + C.bg2 + ';color:' + C.txt + ';cursor:pointer;font-size:10px;">播放选区</button>' +
    ' <button id="audioEdLoopRegion" style="margin-left:4px;padding:2px 8px;border-radius:3px;border:1px solid ' + C.accent + ';' +
      'background:' + C.bg2 + ';color:' + C.txt + ';cursor:pointer;font-size:10px;">循环选区</button>' +
    ' <button id="audioEdTrimRegion" style="margin-left:4px;padding:2px 8px;border-radius:3px;border:1px solid ' + C.redBd + ';' +
      'background:' + C.redBtn + ';color:' + C.redTxt + ';cursor:pointer;font-size:10px;">裁剪到选区</button>' +
    ' <button id="audioEdDeleteRegion" style="margin-left:4px;padding:2px 8px;border-radius:3px;border:1px solid ' + C.accent + ';' +
      'background:' + C.bg2 + ';color:' + C.txt2 + ';cursor:pointer;font-size:10px;">删除选区</button>';

  infoEl.querySelector('#audioEdPlayRegion').addEventListener('click', function () { region.play(); });
  infoEl.querySelector('#audioEdLoopRegion').addEventListener('click', function () {
    region.play();
    // 循环播放选区
    function onEnd() {
      if (wavesurferInstance && wavesurferInstance.isPlaying()) {
        wavesurferInstance.setTime(region.start);
      }
    }
    var checkLoop = setInterval(function () {
      if (!wavesurferInstance || !wavesurferInstance.isPlaying()) {
        clearInterval(checkLoop);
        return;
      }
      if (wavesurferInstance.getCurrentTime() >= region.end) onEnd();
    }, 50);
  });
  infoEl.querySelector('#audioEdTrimRegion').addEventListener('click', function () { trimToRegion(region); });
  infoEl.querySelector('#audioEdDeleteRegion').addEventListener('click', function () { region.remove(); infoEl.style.display = 'none'; });
}

function trimToRegion(region) {
  if (!wavesurferInstance || !region) return;
  wavesurferInstance.setTime(region.start);
  wavesurferInstance.play();
  function onTimeUpdate(currentTime) {
    if (currentTime >= region.end) {
      wavesurferInstance.pause();
      wavesurferInstance.un('timeupdate', onTimeUpdate);
    }
  }
  wavesurferInstance.on('timeupdate', onTimeUpdate);
}

// ── 导出 WAV ──
function exportWAV() {
  if (!wavesurferInstance) return;
  var decoded = wavesurferInstance.getDecodedData();
  if (!decoded) {
    alert('无法获取音频数据');
    return;
  }

  var numCh = decoded.numberOfChannels;
  var sr = decoded.sampleRate;
  var dur = decoded.duration;

  // 速度影响输出时长，音调通过 detune 独立控制不影响时长
  var outputDur = dur / playbackSpeed;

  try {
    var offlineCtx = new OfflineAudioContext(numCh, Math.ceil(outputDur * sr), sr);
    var source = offlineCtx.createBufferSource();
    source.buffer = decoded;

    // 应用速度和音调
    source.playbackRate.value = playbackSpeed;
    source.detune.value = pitchShift * 100; // 半音转音分

    // 应用 EQ
    var oLow = offlineCtx.createBiquadFilter();
    oLow.type = 'lowshelf'; oLow.frequency.value = 320; oLow.gain.value = eqLow;

    var oMid = offlineCtx.createBiquadFilter();
    oMid.type = 'peaking'; oMid.frequency.value = 1000; oMid.Q.value = 0.7; oMid.gain.value = eqMid;

    var oHigh = offlineCtx.createBiquadFilter();
    oHigh.type = 'highshelf'; oHigh.frequency.value = 3200; oHigh.gain.value = eqHigh;

    // 应用压缩器
    var oComp = offlineCtx.createDynamicsCompressor();
    if (compEnabled) {
      oComp.threshold.value = compThreshold;
      oComp.ratio.value = compRatio;
      oComp.attack.value = compAttack;
      oComp.release.value = compRelease;
      oComp.knee.value = 6;
    } else {
      oComp.threshold.value = 0;
      oComp.ratio.value = 1;
    }

    // 应用混响
    var oDry = offlineCtx.createGain();
    var oWet = offlineCtx.createGain();
    var oReverb = offlineCtx.createConvolver();
    if (reverbEnabled && reverbMix > 0) {
      // 生成离线脉冲响应
      var impLen = Math.max(1, Math.ceil(sr * reverbDecay));
      var impulse = offlineCtx.createBuffer(2, impLen, sr);
      for (var ch = 0; ch < 2; ch++) {
        var impData = impulse.getChannelData(ch);
        for (var ii = 0; ii < impLen; ii++) {
          impData[ii] = (Math.random() * 2 - 1) * Math.pow(1 - ii / impLen, 2);
        }
      }
      oReverb.buffer = impulse;
      oDry.gain.value = 1 - reverbMix * 0.5;
      oWet.gain.value = reverbMix;
    } else {
      oDry.gain.value = 1;
      oWet.gain.value = 0;
    }

    // 应用淡入淡出
    var oGain = offlineCtx.createGain();
    if (fadeInDur > 0) {
      oGain.gain.setValueAtTime(0, 0);
      oGain.gain.linearRampToValueAtTime(1, fadeInDur);
    }
    if (fadeOutDur > 0) {
      var fadeStart = Math.max(fadeInDur, outputDur - fadeOutDur);
      if (fadeInDur <= 0) oGain.gain.setValueAtTime(1, 0);
      else oGain.gain.setValueAtTime(1, fadeInDur);
      oGain.gain.setValueAtTime(1, fadeStart);
      oGain.gain.linearRampToValueAtTime(0, outputDur);
    }

    // 连接: source → EQ → comp → [dry/wet reverb] → fadeGain → destination
    source.connect(oLow);
    oLow.connect(oMid);
    oMid.connect(oHigh);
    oHigh.connect(oComp);

    oComp.connect(oDry);
    oComp.connect(oReverb);
    oReverb.connect(oWet);
    oDry.connect(oGain);
    oWet.connect(oGain);

    oGain.connect(offlineCtx.destination);

    source.start(0);

    offlineCtx.startRendering().then(function (rendered) {
      var wav = encodeWAV(rendered);
      var blob = new Blob([wav], { type: 'audio/wav' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = (editorAudioData.fileName || 'audio').replace(/\.[^.]+$/, '') + '_edited.wav';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
    });
  } catch (e) {
    console.error('[AudioEditor] 导出失败:', e);
    alert('导出失败: ' + e.message);
  }
}

function encodeWAV(audioBuffer) {
  var numCh = audioBuffer.numberOfChannels;
  var sr = audioBuffer.sampleRate;
  var bitDepth = 16;
  var bytesPerSample = bitDepth / 8;
  var blockAlign = numCh * bytesPerSample;
  var dataLen = audioBuffer.length * blockAlign;
  var buffer = new ArrayBuffer(44 + dataLen);
  var view = new DataView(buffer);

  // RIFF header
  writeStr(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLen, true);
  writeStr(view, 8, 'WAVE');
  writeStr(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numCh, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeStr(view, 36, 'data');
  view.setUint32(40, dataLen, true);

  // 交错写入采样数据
  var channels = [];
  for (var i = 0; i < numCh; i++) channels.push(audioBuffer.getChannelData(i));
  var offset = 44;
  for (var s = 0; s < audioBuffer.length; s++) {
    for (var ch = 0; ch < numCh; ch++) {
      var sample = Math.max(-1, Math.min(1, channels[ch][s]));
      var intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, intSample | 0, true);
      offset += 2;
    }
  }
  return buffer;
}

function writeStr(view, offset, str) {
  for (var i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

// ── 应用并关闭 ──
function applyAudioEditorChanges() {
  if (!editorAudioData || !wavesurferInstance) {
    closeAudioEditor();
    return;
  }

  // 保存播放状态
  editorAudioData.volume = masterGain ? masterGain.gain.value : (wavesurferInstance.getVolume ? wavesurferInstance.getVolume() : 1);
  editorAudioData.loop = wavesurferInstance.options.loop || false;

  // 保存效果参数
  editorAudioData.eqLow = eqLow;
  editorAudioData.eqMid = eqMid;
  editorAudioData.eqHigh = eqHigh;
  editorAudioData.fadeInDur = fadeInDur;
  editorAudioData.fadeOutDur = fadeOutDur;
  editorAudioData.compressorThreshold = compThreshold;
  editorAudioData.compressorRatio = compRatio;
  editorAudioData.compEnabled = compEnabled;
  editorAudioData.reverbMix = reverbMix;
  editorAudioData.reverbDecay = reverbDecay;
  editorAudioData.reverbEnabled = reverbEnabled;
  editorAudioData.waveformStyle = waveformStyle;
  editorAudioData.playbackSpeed = playbackSpeed;
  editorAudioData.pitchShift = pitchShift;
  editorAudioData.markers = markers.map(function (m) { return { id: m.id, time: m.time, label: m.label, color: m.color }; });

  closeAudioEditor();
  transactRender();
}

function closeAudioEditor() {
  stopSpectrumAnimation();

  if (wavesurferInstance) {
    try { wavesurferInstance.destroy(); } catch (_) {}
    wavesurferInstance = null;
  }
  regionsPlugin = null;

  // 清理音频效果链
  if (sourceNode) { try { sourceNode.disconnect(); } catch (_) {} sourceNode = null; }
  if (lowEQNode) { try { lowEQNode.disconnect(); } catch (_) {} lowEQNode = null; }
  if (midEQNode) { try { midEQNode.disconnect(); } catch (_) {} midEQNode = null; }
  if (highEQNode) { try { highEQNode.disconnect(); } catch (_) {} highEQNode = null; }
  if (compressorNode) { try { compressorNode.disconnect(); } catch (_) {} compressorNode = null; }
  if (reverbNode) { try { reverbNode.disconnect(); } catch (_) {} reverbNode = null; }
  if (reverbGainNode) { try { reverbGainNode.disconnect(); } catch (_) {} reverbGainNode = null; }
  if (dryGainNode) { try { dryGainNode.disconnect(); } catch (_) {} dryGainNode = null; }
  if (pitchShifterNode) { try { pitchShifterNode.disconnect(); } catch (_) {} pitchShifterNode = null; }
  if (masterGain) { try { masterGain.disconnect(); } catch (_) {} masterGain = null; }
  if (analyserNode) { try { analyserNode.disconnect(); } catch (_) {} analyserNode = null; }
  if (audioCtx) { try { audioCtx.close(); } catch (_) {} audioCtx = null; }
  effectsReady = false;

  // 移除键盘监听
  if (keyHandlerRef) {
    document.removeEventListener('keydown', keyHandlerRef);
    keyHandlerRef = null;
  }

  if (audioEditorModal && audioEditorModal.parentNode) {
    audioEditorModal.parentNode.removeChild(audioEditorModal);
  }
  audioEditorModal = null;
  editorAudioData = null;
  specCanvas = null;
  specCtx2d = null;
}
