// ============================================================
//  overlay-audio-editor/ui.js — 弹窗 HTML 构建
//  buildAudioEditorModal（原 createAudioEditorModal 的 DOM 构建部分）
//  + 各标签页内容构建（EQ/效果/标记/快捷键）+ 样式小工具
// ============================================================

import {
  C, audioEditorModal, setAudioEditorModal, editorAudioData,
  playbackSpeed, pitchShift,
  eqLow, eqMid, eqHigh, fadeInDur, fadeOutDur,
  compEnabled, compThreshold, compRatio, compAttack, compRelease,
  reverbEnabled, reverbMix, reverbDecay,
  markers, fmtTimeFull
} from './share.js';

// ── 创建弹窗 ──
export function buildAudioEditorModal() {
  if (audioEditorModal && audioEditorModal.parentNode) return;

  setAudioEditorModal(document.createElement('div'));
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

export function buildEqTabContent() {
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

export function buildMarkersTabContent() {
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

export function buildShortcutsTabContent() {
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
export function buildEffectsTabContent() {
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
