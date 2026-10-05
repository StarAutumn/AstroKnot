// ============================================================
//  overlay-audio-editor/bindings.js — 事件绑定与运行时 UI 行为
//  bindAudioEditorEvents / bindEQSliders / bindEffectsControls / renderTabContent
//  handleKeyboard（键盘快捷键）/ 频谱画布动画 / 标记管理 / 选区信息
//  resetEffects / applyWaveformStyle
// ============================================================

import {
  C, clamp, fmtTimeFull, nextMarkerId,
  audioEditorModal, wavesurferInstance, editorAudioData,
  masterGain, lowEQNode, midEQNode, highEQNode, compressorNode,
  reverbGainNode, dryGainNode, pitchShifterNode, regionsPlugin, analyserNode,
  peakHolds, peakDecay,
  specCanvas, setSpecCanvas, specCtx2d, setSpecCtx2d, specAnimId, setSpecAnimId,
  markers, setMarkers, markerColors,
  activeTab, setActiveTab, eqLow, setEqLow, eqMid, setEqMid, eqHigh, setEqHigh,
  compEnabled, compThreshold, setCompThreshold, compRatio, setCompRatio, compAttack, setCompAttack,
  compRelease, setCompRelease,
  reverbMix, setReverbMix, reverbDecay, setReverbDecay, setReverbEnabled,
  waveformStyle, setWaveformStyle, playbackSpeed, setPlaybackSpeed, pitchShift, setPitchShift,
  isReversed, setIsReversed, abState, setAbState, savedParams, setSavedParams,
  isSeekDragging, setIsSeekDragging, keyHandlerRef, setKeyHandlerRef,
  setFadeInDur, setFadeOutDur, setCompEnabled
} from './share.js';
import { buildEqTabContent, buildEffectsTabContent, buildMarkersTabContent, buildShortcutsTabContent } from './ui.js';
import { updateCompressor, updateReverb, resumeAudioCtx, applyFadeEffect, exportWAV } from './audio-engine.js';
import { closeAudioEditor, applyAudioEditorChanges } from './index.js';

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
    setCompEnabled(this.checked);
    updateCompressor();
    renderTabContent();
  });
  if (compThresh) compThresh.addEventListener('input', function () {
    setCompThreshold(parseFloat(this.value));
    var valEl = audioEditorModal.querySelector('#audioEdCompThreshVal');
    if (valEl) valEl.textContent = compThreshold + 'dB';
    updateCompressor();
  });
  if (compRatioEl) compRatioEl.addEventListener('input', function () {
    setCompRatio(parseFloat(this.value));
    var valEl = audioEditorModal.querySelector('#audioEdCompRatioVal');
    if (valEl) valEl.textContent = compRatio + ':1';
    updateCompressor();
  });
  if (compAttackEl) compAttackEl.addEventListener('input', function () {
    setCompAttack(parseFloat(this.value));
    var valEl = audioEditorModal.querySelector('#audioEdCompAttackVal');
    if (valEl) valEl.textContent = (compAttack * 1000).toFixed(0) + 'ms';
    updateCompressor();
  });
  if (compReleaseEl) compReleaseEl.addEventListener('input', function () {
    setCompRelease(parseFloat(this.value));
    var valEl = audioEditorModal.querySelector('#audioEdCompReleaseVal');
    if (valEl) valEl.textContent = (compRelease * 1000).toFixed(0) + 'ms';
    updateCompressor();
  });
  if (reverbEnable) reverbEnable.addEventListener('change', function () {
    setReverbEnabled(this.checked);
    updateReverb();
    renderTabContent();
  });
  if (reverbMixEl) reverbMixEl.addEventListener('input', function () {
    setReverbMix(parseInt(this.value) / 100);
    var valEl = audioEditorModal.querySelector('#audioEdReverbMixVal');
    if (valEl) valEl.textContent = Math.round(reverbMix * 100) + '%';
    updateReverb();
  });
  if (reverbDecayEl) reverbDecayEl.addEventListener('change', function () {
    setReverbDecay(parseFloat(this.value));
    var valEl = audioEditorModal.querySelector('#audioEdReverbDecayVal');
    if (valEl) valEl.textContent = reverbDecay.toFixed(1) + 's';
    updateReverb();
  });
}

// ── 频谱画布初始化 ──
export function initSpectrumCanvas() {
  setSpecCanvas(audioEditorModal.querySelector('#audioEdSpectrum'));
  if (!specCanvas) return;
  resizeSpectrumCanvas();
}

function resizeSpectrumCanvas() {
  if (!specCanvas) return;
  var dpr = window.devicePixelRatio || 1;
  var rect = specCanvas.getBoundingClientRect();
  specCanvas.width = Math.floor(rect.width * dpr);
  specCanvas.height = Math.floor(rect.height * dpr);
  setSpecCtx2d(specCanvas.getContext('2d'));
  specCtx2d.scale(dpr, dpr);
}

// ── 事件绑定 ──
export function bindAudioEditorEvents() {
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
    setPlaybackSpeed(clampSpeed(parseFloat(this.value) || 1));
    this.value = playbackSpeed.toFixed(2);
    applySpeedAndPitch();
  });
  speedDecBtn.addEventListener('click', function () {
    setPlaybackSpeed(clampSpeed(playbackSpeed - 0.05));
    speedSelect.value = playbackSpeed.toFixed(2);
    applySpeedAndPitch();
  });
  speedIncBtn.addEventListener('click', function () {
    setPlaybackSpeed(clampSpeed(playbackSpeed + 0.05));
    speedSelect.value = playbackSpeed.toFixed(2);
    applySpeedAndPitch();
  });
  pitchInput.addEventListener('change', function () {
    setPitchShift(clampPitch(parseInt(this.value) || 0));
    this.value = pitchShift;
    applySpeedAndPitch();
  });
  pitchDecBtn.addEventListener('click', function () {
    setPitchShift(clampPitch(pitchShift - 1));
    pitchInput.value = pitchShift;
    applySpeedAndPitch();
  });
  pitchIncBtn.addEventListener('click', function () {
    setPitchShift(clampPitch(pitchShift + 1));
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
    setFadeInDur(dur);
    if (input) input.value = dur;
    applyFadeEffect('in');
  });

  // 淡出
  fadeOutBtn.addEventListener('click', function () {
    var input = audioEditorModal.querySelector('#audioEdFadeOutVal');
    var dur = input ? parseFloat(input.value) : 1;
    if (isNaN(dur) || dur <= 0) dur = 1;
    setFadeOutDur(dur);
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
    setIsReversed(!isReversed);
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
    setWaveformStyle(styles[(idx + 1) % styles.length]);
    applyWaveformStyle();
    var labels = { fill: '填充', line: '线条', mirror: '镜像' };
    waveStyleBtn.innerHTML = '&#8776; ' + labels[waveformStyle];
  });

  // A/B 对比
  abBtn.addEventListener('click', function () {
    if (abState === 'A') {
      // 保存当前参数，切换到旁通
      setSavedParams({
        eqLow: eqLow, eqMid: eqMid, eqHigh: eqHigh,
        compEnabled: compEnabled, reverbEnabled: reverbEnabled,
        fadeInDur: fadeInDur, fadeOutDur: fadeOutDur,
        playbackSpeed: playbackSpeed, pitchShift: pitchShift
      });
      // 旁通所有效果
      if (lowEQNode) lowEQNode.gain.value = 0;
      if (midEQNode) midEQNode.gain.value = 0;
      if (highEQNode) highEQNode.gain.value = 0;
      if (compressorNode) { compressorNode.threshold.value = 0; compressorNode.ratio.value = 1; }
      if (reverbGainNode) reverbGainNode.gain.value = 0;
      if (dryGainNode) dryGainNode.gain.value = 1;
      // 旁通速度和音调
      setPlaybackSpeed(1); setPitchShift(0);
      applySpeedAndPitch();
      var spEl = audioEditorModal.querySelector('#audioEdSpeed');
      var ptEl = audioEditorModal.querySelector('#audioEdPitch');
      if (spEl) spEl.value = '1.00';
      if (ptEl) ptEl.value = '0';
      setAbState('B');
      abBtn.textContent = 'B (旁通)';
      abBtn.style.color = '#ffd93d';
      abBtn.style.borderColor = '#ffd93d';
    } else {
      // 恢复效果参数
      if (savedParams) {
        setEqLow(savedParams.eqLow); setEqMid(savedParams.eqMid); setEqHigh(savedParams.eqHigh);
        setCompEnabled(savedParams.compEnabled); setReverbEnabled(savedParams.reverbEnabled);
        setFadeInDur(savedParams.fadeInDur); setFadeOutDur(savedParams.fadeOutDur);
        setPlaybackSpeed(savedParams.playbackSpeed); setPitchShift(savedParams.pitchShift);
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
      setAbState('A');
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
    setIsSeekDragging(true);
    seekFromMouseEvent(e);
  });
  document.addEventListener('mousemove', function (e) {
    if (isSeekDragging) seekFromMouseEvent(e);
  });
  document.addEventListener('mouseup', function () {
    setIsSeekDragging(false);
  });

  // EQ 滑块
  bindEQSliders();

  // 淡入淡出输入
  var fadeInInput = audioEditorModal.querySelector('#audioEdFadeInVal');
  var fadeOutInput = audioEditorModal.querySelector('#audioEdFadeOutVal');
  if (fadeInInput) fadeInInput.addEventListener('change', function () { setFadeInDur(parseFloat(this.value) || 0); });
  if (fadeOutInput) fadeOutInput.addEventListener('change', function () { setFadeOutDur(parseFloat(this.value) || 0); });

  // 重置效果
  var resetBtn = audioEditorModal.querySelector('#audioEdResetFX');
  if (resetBtn) resetBtn.addEventListener('click', function () { resetEffects(); });

  // 标签切换
  var tabs = audioEditorModal.querySelectorAll('.aed-tab');
  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      setActiveTab(this.dataset.tab);
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
  setKeyHandlerRef(handleKeyboard);
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
    setEqLow(parseFloat(this.value));
    if (lowEQNode) lowEQNode.gain.value = eqLow;
    if (lowVal) lowVal.textContent = (eqLow > 0 ? '+' : '') + eqLow + 'dB';
  });
  if (midSlider) midSlider.addEventListener('input', function () {
    setEqMid(parseFloat(this.value));
    if (midEQNode) midEQNode.gain.value = eqMid;
    if (midVal) midVal.textContent = (eqMid > 0 ? '+' : '') + eqMid + 'dB';
  });
  if (highSlider) highSlider.addEventListener('input', function () {
    setEqHigh(parseFloat(this.value));
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
    if (fadeInInput) fadeInInput.addEventListener('change', function () { setFadeInDur(parseFloat(this.value) || 0); });
    if (fadeOutInput) fadeOutInput.addEventListener('change', function () { setFadeOutDur(parseFloat(this.value) || 0); });
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

function resetEffects() {
  setEqLow(0); setEqMid(0); setEqHigh(0);
  setFadeInDur(0); setFadeOutDur(0);
  setCompEnabled(false); setCompThreshold(-24); setCompRatio(12); setCompAttack(0.003); setCompRelease(0.25);
  setReverbEnabled(false); setReverbMix(0); setReverbDecay(2);

  if (lowEQNode) lowEQNode.gain.value = 0;
  if (midEQNode) midEQNode.gain.value = 0;
  if (highEQNode) highEQNode.gain.value = 0;
  if (masterGain) masterGain.gain.cancelScheduledValues(0);
  updateCompressor();
  updateReverb();

  renderTabContent();
}

// ── 波形样式 ──
export function applyWaveformStyle() {
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
export function startSpectrumAnimation() {
  if (specAnimId) return;
  drawSpectrum();
}

export function stopSpectrumAnimation() {
  if (specAnimId) {
    cancelAnimationFrame(specAnimId);
    setSpecAnimId(null);
  }
}

function drawSpectrum() {
  if (!specCanvas || !specCtx2d) { setSpecAnimId(null); return; }

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

  setSpecAnimId(requestAnimationFrame(drawSpectrum));
}

// ── 标记管理 ──
function addMarkerAtTime(time) {
  var id = nextMarkerId();
  var color = markerColors[markers.length % markerColors.length];
  var m = { id: id, time: time, label: '标记 ' + id, color: color };
  markers.push(m);
  renderMarkersOnWaveform();
  if (activeTab === 'markers') renderTabContent();
}

function removeMarker(id) {
  setMarkers(markers.filter(function (m) { return m.id !== id; }));
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

export function renderMarkersOnWaveform() {
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
export function updateRegionInfo(region) {
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
