// ============================================================
//  overlay-audio-editor/audio-engine.js — Web Audio 纯逻辑
//  SoundTouch 动态加载 / setupEffectsChain 效果链 / generateImpulseResponse
//  updateCompressor / updateReverb / resumeAudioCtx / 淡入淡出 / exportWAV + encodeWAV
// ============================================================

import {
  wavesurferInstance, editorAudioData,
  audioCtx, setAudioCtx, sourceNode, setSourceNode,
  lowEQNode, setLowEQNode, midEQNode, setMidEQNode, highEQNode, setHighEQNode,
  compressorNode, setCompressorNode, reverbNode, setReverbNode,
  reverbGainNode, setReverbGainNode, dryGainNode, setDryGainNode,
  masterGain, setMasterGain, analyserNode, setAnalyserNode,
  pitchShifterNode, setPitchShifterNode, effectsReady, setEffectsReady,
  eqLow, eqMid, eqHigh, fadeInDur, fadeOutDur,
  compEnabled, compThreshold, compRatio, compAttack, compRelease,
  reverbEnabled, reverbMix, reverbDecay,
  playbackSpeed, pitchShift
} from './share.js';

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

// ── 音频效果链 ──
export async function setupEffectsChain() {
  if (effectsReady) return;
  try {
    var mediaEl = wavesurferInstance ? wavesurferInstance.getMediaElement() : null;
    if (!mediaEl) {
      console.warn('[AudioEditor] 未找到音频元素，效果链未连接');
      return;
    }

    setAudioCtx(new (window.AudioContext || window.webkitAudioContext)());
    if (audioCtx.state === 'suspended') await audioCtx.resume();

    setSourceNode(audioCtx.createMediaElementSource(mediaEl));

    // 低频均衡器 (Low Shelf ~320Hz)
    setLowEQNode(audioCtx.createBiquadFilter());
    lowEQNode.type = 'lowshelf';
    lowEQNode.frequency.value = 320;
    lowEQNode.gain.value = eqLow;

    // 中频均衡器 (Peaking ~1000Hz)
    setMidEQNode(audioCtx.createBiquadFilter());
    midEQNode.type = 'peaking';
    midEQNode.frequency.value = 1000;
    midEQNode.Q.value = 0.7;
    midEQNode.gain.value = eqMid;

    // 高频均衡器 (High Shelf ~3200Hz)
    setHighEQNode(audioCtx.createBiquadFilter());
    highEQNode.type = 'highshelf';
    highEQNode.frequency.value = 3200;
    highEQNode.gain.value = eqHigh;

    // 压缩器
    setCompressorNode(audioCtx.createDynamicsCompressor());
    compressorNode.threshold.value = compEnabled ? compThreshold : 0;
    compressorNode.ratio.value = compEnabled ? compRatio : 1;
    compressorNode.attack.value = compAttack;
    compressorNode.release.value = compRelease;
    compressorNode.knee.value = 6;

    // 混响（使用干/湿混合）
    setReverbNode(audioCtx.createConvolver());
    setReverbGainNode(audioCtx.createGain()); // 湿信号
    setDryGainNode(audioCtx.createGain()); // 干信号
    dryGainNode.gain.value = 1;
    reverbGainNode.gain.value = reverbEnabled ? reverbMix : 0;
    if (reverbEnabled) {
      generateImpulseResponse(reverbDecay);
    }

    // 主增益
    setMasterGain(audioCtx.createGain());
    masterGain.gain.value = editorAudioData.volume ?? 1;

    // 分析器
    setAnalyserNode(audioCtx.createAnalyser());
    analyserNode.fftSize = 256;
    analyserNode.smoothingTimeConstant = 0.8;

    // 音调偏移（尝试 SoundTouch 高品质 WSOLA 算法）
    var SoundTouchNodeCtor = await getSoundTouchNode();
    setPitchShifterNode(null);
    if (SoundTouchNodeCtor) {
      try {
        await SoundTouchNodeCtor.register(audioCtx, 'lib/soundtouch-processor.js');
        mediaEl.preservesPitch = false;
        setPitchShifterNode(new SoundTouchNodeCtor({ context: audioCtx }));
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

    setEffectsReady(true);
    console.log('[AudioEditor] 效果链已连接（含压缩器+混响+音调偏移）');
  } catch (e) {
    console.warn('[AudioEditor] 效果链连接失败:', e);
    setEffectsReady(false);
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
export function updateCompressor() {
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
export function updateReverb() {
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

export function resumeAudioCtx() {
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

// ── 淡入淡出 ──
export function applyFadeEffect(type) {
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

export function scheduleFadeAutomation() {
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

// ── 导出 WAV ──
export function exportWAV() {
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
