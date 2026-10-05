// ============================================================
//  overlay-audio-editor.js — 增强版音频编辑器（WaveSurfer.js + Web Audio API）
// ============================================================
// ------------------------------------------------------------
//  拆分后的文件夹结构（本文件为主入口，对外导出不变）：
//    share.js        模块级可变状态 + 工具函数 + 颜色常量
//    ui.js           弹窗与各标签页 HTML 构建
//    bindings.js     事件绑定 / 键盘快捷键 / 频谱 / 标记 / 选区
//    audio-engine.js Web Audio 效果链与 WAV 导出
//    index.js        打开/关闭/应用生命周期编排（本文件）
// ------------------------------------------------------------

import { transactRender } from '../overlay-images/index.js';
import {
  fmtTime, fmtTimeFull,
  audioEditorModal, setAudioEditorModal, wavesurferInstance, setWavesurferInstance,
  editorAudioData, setEditorAudioData, regionsPlugin, setRegionsPlugin,
  sourceNode, setSourceNode, lowEQNode, setLowEQNode, midEQNode, setMidEQNode,
  highEQNode, setHighEQNode, compressorNode, setCompressorNode, reverbNode, setReverbNode,
  reverbGainNode, setReverbGainNode, dryGainNode, setDryGainNode,
  pitchShifterNode, setPitchShifterNode, masterGain, setMasterGain,
  analyserNode, setAnalyserNode, audioCtx, setAudioCtx,
  setEffectsReady, setSpecCanvas, setSpecCtx2d,
  keyHandlerRef, setKeyHandlerRef,
  markers, setMarkers, setMarkerIdSeq,
  eqLow, setEqLow, eqMid, setEqMid, eqHigh, setEqHigh,
  fadeInDur, setFadeInDur, fadeOutDur, setFadeOutDur,
  compThreshold, setCompThreshold, compRatio, setCompRatio, compEnabled, setCompEnabled,
  reverbMix, setReverbMix, reverbDecay, setReverbDecay, reverbEnabled, setReverbEnabled,
  waveformStyle, setWaveformStyle, playbackSpeed, setPlaybackSpeed, pitchShift, setPitchShift,
  setIsReversed, setAbState, setSavedParams, setActiveTab,
  peakHolds, peakDecay, isSeekDragging
} from './share.js';
import { buildAudioEditorModal } from './ui.js';
import { initSpectrumCanvas, bindAudioEditorEvents, stopSpectrumAnimation, startSpectrumAnimation, renderMarkersOnWaveform, applyWaveformStyle, updateRegionInfo } from './bindings.js';
import { setupEffectsChain, scheduleFadeAutomation } from './audio-engine.js';

// ── 主入口 ──
export function openAudioEditor(imgData) {
  if (!window.WaveSurfer) {
    alert('音频编辑器未加载，请检查网络连接后刷新页面');
    return;
  }
  setEditorAudioData(imgData);
  // 恢复持久化参数
  setMarkers((imgData.markers || []).map(function (m) { return Object.assign({}, m); }));
  setMarkerIdSeq(markers.reduce(function (mx, m) { return Math.max(mx, m.id || 0); }, 0) + 1);
  setEqLow(imgData.eqLow || 0);
  setEqMid(imgData.eqMid || 0);
  setEqHigh(imgData.eqHigh || 0);
  setFadeInDur(imgData.fadeInDur || 0);
  setFadeOutDur(imgData.fadeOutDur || 0);
  setCompThreshold(imgData.compressorThreshold != null ? imgData.compressorThreshold : -24);
  setCompRatio(imgData.compressorRatio != null ? imgData.compressorRatio : 12);
  setCompEnabled(imgData.compEnabled || false);
  setReverbMix(imgData.reverbMix || 0);
  setReverbDecay(imgData.reverbDecay || 2);
  setReverbEnabled(imgData.reverbEnabled || false);
  setWaveformStyle(imgData.waveformStyle || 'fill');
  setPlaybackSpeed(imgData.playbackSpeed || 1);
  setPitchShift(imgData.pitchShift || 0);
  setIsReversed(false);
  setAbState('A');
  setSavedParams(null);
  setActiveTab('eq');
  setEffectsReady(false);
  peakHolds.fill(0);
  peakDecay.fill(0);

  createAudioEditorModal();
}

// ── 创建弹窗（编排：构建 → 频谱画布 → 事件绑定 → WaveSurfer 初始化，与原 createAudioEditorModal 语句顺序一致） ──
function createAudioEditorModal() {
  buildAudioEditorModal();
  initSpectrumCanvas();
  bindAudioEditorEvents();
  initWaveSurfer();
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
    setRegionsPlugin(window.WaveSurfer.Regions.create());
    wsOptions.plugins = [regionsPlugin];
  }

  try {
    setWavesurferInstance(window.WaveSurfer.create(wsOptions));
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

// ── 应用并关闭 ──
export function applyAudioEditorChanges() {
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

export function closeAudioEditor() {
  stopSpectrumAnimation();

  if (wavesurferInstance) {
    try { wavesurferInstance.destroy(); } catch (_) {}
    setWavesurferInstance(null);
  }
  setRegionsPlugin(null);

  // 清理音频效果链
  if (sourceNode) { try { sourceNode.disconnect(); } catch (_) {} setSourceNode(null); }
  if (lowEQNode) { try { lowEQNode.disconnect(); } catch (_) {} setLowEQNode(null); }
  if (midEQNode) { try { midEQNode.disconnect(); } catch (_) {} setMidEQNode(null); }
  if (highEQNode) { try { highEQNode.disconnect(); } catch (_) {} setHighEQNode(null); }
  if (compressorNode) { try { compressorNode.disconnect(); } catch (_) {} setCompressorNode(null); }
  if (reverbNode) { try { reverbNode.disconnect(); } catch (_) {} setReverbNode(null); }
  if (reverbGainNode) { try { reverbGainNode.disconnect(); } catch (_) {} setReverbGainNode(null); }
  if (dryGainNode) { try { dryGainNode.disconnect(); } catch (_) {} setDryGainNode(null); }
  if (pitchShifterNode) { try { pitchShifterNode.disconnect(); } catch (_) {} setPitchShifterNode(null); }
  if (masterGain) { try { masterGain.disconnect(); } catch (_) {} setMasterGain(null); }
  if (analyserNode) { try { analyserNode.disconnect(); } catch (_) {} setAnalyserNode(null); }
  if (audioCtx) { try { audioCtx.close(); } catch (_) {} setAudioCtx(null); }
  setEffectsReady(false);

  // 移除键盘监听
  if (keyHandlerRef) {
    document.removeEventListener('keydown', keyHandlerRef);
    setKeyHandlerRef(null);
  }

  if (audioEditorModal && audioEditorModal.parentNode) {
    audioEditorModal.parentNode.removeChild(audioEditorModal);
  }
  setAudioEditorModal(null);
  setEditorAudioData(null);
  setSpecCanvas(null);
  setSpecCtx2d(null);
}
