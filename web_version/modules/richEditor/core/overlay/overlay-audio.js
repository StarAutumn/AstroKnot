// ============================================================
//  overlay-audio.js — 音频播放器 overlay 类型
// ============================================================
import { overlayImages, getNextZIndex, ensureOverlay, renderAll, transactRender, selectImage, getInsertY, getInsertX } from './overlay-images.js';
import { getActiveBlockId, getBlockWidth, pxToPct } from './overlay-block.js';

// SoundTouch 动态加载（避免导入失败导致整个模块崩溃）
let _SoundTouchNode = null;
async function getSoundTouchNode() {
  if (_SoundTouchNode !== null) return _SoundTouchNode;
  try {
    let mod = await import('@soundtouchjs/audio-worklet');
    _SoundTouchNode = mod.SoundTouchNode;
  } catch (e) {
    console.warn('[AudioPlayer] SoundTouch 库加载失败:', e);
    _SoundTouchNode = false; // 标记为不可用
  }
  return _SoundTouchNode;
}

let _audioInput = null;

function getAudioInput() {
  if (!_audioInput) {
    _audioInput = document.createElement('input');
    _audioInput.type = 'file';
    _audioInput.accept = 'audio/*';
    _audioInput.style.display = 'none';
    document.body.appendChild(_audioInput);
    _audioInput.addEventListener('change', function () {
      if (this.files && this.files[0]) {
        addAudioFromFile(this.files[0]);
        this.value = '';
      }
    });
  }
  return _audioInput;
}

export function openAudioPicker() {
  getAudioInput().click();
}

export function addAudioFromFile(file) {
  if (!file || !file.type.startsWith('audio/')) return;
  let blockId = getActiveBlockId();
  let blockW = blockId ? getBlockWidth(blockId) : 800;
  let w = Math.min(360, blockW - 40);
  let x = Math.max(0, (blockW - w) / 2);
  let y = getInsertY();
  let reader = new FileReader();
  reader.onload = function (e) {
    let dataUrl = e.target.result;
    let audioData = {
      type: 'audio',
      id: 'oly-audio-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
      blockId: blockId,
      src: dataUrl,
      srcType: 'dataUrl',
      fileName: file.name,
      x: x,
      y: y,
      width: w,
      height: 80,
      zIndex: getNextZIndex(),
      autoplay: false,
      loop: false,
      muted: false,
      volume: 1,
      leftPct: pxToPct(x, blockW),
      widthPct: pxToPct(w, blockW),
      _refWidth: blockW
    };
    overlayImages.push(audioData);
    selectImage(audioData.id);
    transactRender();
  };
  reader.readAsDataURL(file);
}

export function addAudioFromUrl(url) {
  let blockId = getActiveBlockId();
  let blockW = blockId ? getBlockWidth(blockId) : 800;
  let w = Math.min(360, blockW - 40);
  let x = Math.max(0, (blockW - w) / 2);
  let y = getInsertY();
  let audioData = {
    type: 'audio',
    id: 'oly-audio-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
    blockId: blockId,
    src: url,
    srcType: 'url',
    fileName: '',
    x: x,
    y: y,
    width: w,
    height: 80,
    zIndex: getNextZIndex(),
    autoplay: false,
    loop: false,
    muted: false,
    volume: 1,
    leftPct: pxToPct(x, blockW),
    widthPct: pxToPct(w, blockW),
    _refWidth: blockW
  };
  overlayImages.push(audioData);
  selectImage(audioData.id);
  transactRender();
}

export function renderAudioContent(item, imgData) {
  let wrapper = document.createElement('div');
  wrapper.style.cssText =
    'width:100%;height:100%;position:relative;overflow:hidden;' +
    'background:linear-gradient(135deg,rgba(10,30,40,0.95),rgba(5,15,25,0.98));' +
    'border:1px solid rgba(0,255,255,0.15);border-radius:8px;' +
    'display:flex;flex-direction:column;padding:10px 14px;box-sizing:border-box;';

  // 音频元素（隐藏）
  let audio = document.createElement('audio');
  audio.src = imgData.src;
  audio.preload = 'metadata';
  audio.dataset.olyAudioId = imgData.id;

  // 上排：播放按钮 + 文件名 + 音量
  let topRow = document.createElement('div');
  topRow.style.cssText = 'display:flex;align-items:center;gap:10px;flex:1;min-height:0;';

  // 播放按钮
  let playBtn = document.createElement('div');
  playBtn.innerHTML = '&#9654;';
  playBtn.style.cssText =
    'color:var(--accent,#0ff);font-size:18px;cursor:pointer;width:32px;height:32px;' +
    'border-radius:50%;border:1.5px solid var(--accent,#0ff);' +
    'display:flex;align-items:center;justify-content:center;flex-shrink:0;' +
    'padding-left:2px;transition:background 0.15s;';
  playBtn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  playBtn.addEventListener('mouseenter', function () { playBtn.style.background = 'rgba(0,255,255,0.12)'; });
  playBtn.addEventListener('mouseleave', function () { playBtn.style.background = ''; });
  playBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    if (audio.paused) { audio.play(); } else { audio.pause(); }
  });

  // 文件名 + 时间
  let infoCol = document.createElement('div');
  infoCol.style.cssText = 'flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;';
  let nameEl = document.createElement('div');
  nameEl.style.cssText = 'color:var(--accent-light,#aef0ff);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
  nameEl.textContent = imgData.fileName || '音频';
  let timeEl = document.createElement('div');
  timeEl.style.cssText = 'color:#6a8a9a;font-size:10px;font-family:monospace;';
  function fmtTime(s) {
    if (!s || isNaN(s)) return '0:00';
    let m = Math.floor(s / 60);
    let sec = Math.floor(s % 60);
    return m + ':' + (sec < 10 ? '0' : '') + sec;
  }
  timeEl.textContent = '0:00 / 0:00';
  infoCol.appendChild(nameEl);
  infoCol.appendChild(timeEl);

  // 音量按钮
  let volBtn = document.createElement('div');
  volBtn.innerHTML = '&#128264;';
  volBtn.style.cssText = 'color:#8ab;font-size:12px;cursor:pointer;flex-shrink:0;';
  volBtn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  volBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    audio.muted = !audio.muted;
    imgData.muted = audio.muted;
    volBtn.innerHTML = audio.muted ? '&#128263;' : '&#128264;';
  });

  // 循环按钮
  let loopBtn = document.createElement('div');
  loopBtn.innerHTML = '&#8635;';
  loopBtn.style.cssText = 'color:' + (imgData.loop ? 'var(--accent,#0ff)' : '#556') + ';font-size:12px;cursor:pointer;flex-shrink:0;';
  loopBtn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  loopBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    audio.loop = !audio.loop;
    imgData.loop = audio.loop;
    loopBtn.style.color = audio.loop ? 'var(--accent,#0ff)' : '#556';
  });

  topRow.appendChild(playBtn);
  topRow.appendChild(infoCol);
  topRow.appendChild(volBtn);
  topRow.appendChild(loopBtn);

  // 下排：可拖动进度条
  let progressWrap = document.createElement('div');
  progressWrap.style.cssText =
    'width:100%;height:20px;position:relative;cursor:pointer;flex-shrink:0;margin-top:4px;' +
    'border-radius:3px;overflow:hidden;';

  // 进度轨道背景
  let progressTrack = document.createElement('div');
  progressTrack.style.cssText =
    'position:absolute;top:0;left:0;width:100%;height:100%;' +
    'background:rgba(0,255,255,0.06);border-radius:3px;';

  // 已播放进度
  let progressFill = document.createElement('div');
  progressFill.style.cssText =
    'position:absolute;top:0;left:0;height:100%;width:0%;' +
    'background:linear-gradient(90deg,rgba(0,229,255,0.3),rgba(0,229,255,0.15));' +
    'border-radius:3px;pointer-events:none;';

  // 拖动手柄
  let progressThumb = document.createElement('div');
  progressThumb.style.cssText =
    'position:absolute;top:50%;left:0%;width:10px;height:10px;' +
    'background:#00e5ff;border-radius:50%;transform:translate(-50%,-50%);' +
    'box-shadow:0 0 6px rgba(0,229,255,0.5);pointer-events:none;' +
    'transition:left 0.05s linear;z-index:2;';

  // Canvas 波形可视化
  let canvas = document.createElement('canvas');
  canvas.style.cssText = 'width:100%;height:100%;display:block;border-radius:3px;position:relative;z-index:1;';
  canvas.width = 400;
  canvas.height = 20;
  let ctx = canvas.getContext('2d');

  progressWrap.appendChild(progressTrack);
  progressWrap.appendChild(progressFill);
  progressWrap.appendChild(canvas);
  progressWrap.appendChild(progressThumb);

  // 拖动逻辑
  let isDragging = false;
  function seekFromEvent(e) {
    let rect = progressWrap.getBoundingClientRect();
    let ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    if (audio.duration && isFinite(audio.duration)) {
      audio.currentTime = ratio * audio.duration;
    }
    progressFill.style.width = (ratio * 100) + '%';
    progressThumb.style.left = (ratio * 100) + '%';
  }
  progressWrap.addEventListener('mousedown', function (e) {
    e.stopPropagation();
    isDragging = true;
    seekFromEvent(e);
  });
  document.addEventListener('mousemove', function (e) {
    if (isDragging) seekFromEvent(e);
  });
  document.addEventListener('mouseup', function () {
    isDragging = false;
  });

  // ── 音频效果链（应用编辑器保存的效果） ──
  let fxChain = null;

  async function setupEffectsChain() {
    if (fxChain) return;
    let hasEQ = (imgData.eqLow || imgData.eqMid || imgData.eqHigh);
    let hasComp = imgData.compEnabled;
    let hasReverb = imgData.reverbEnabled && imgData.reverbMix > 0;
    let hasPitch = imgData.pitchShift && imgData.pitchShift !== 0;
    let hasSpeed = imgData.playbackSpeed && imgData.playbackSpeed !== 1;
    if (!hasEQ && !hasComp && !hasReverb && !hasPitch && !hasSpeed) return;

    try {
      let actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') await actx.resume();

      let src = actx.createMediaElementSource(audio);

      // EQ
      let lowEQ = actx.createBiquadFilter();
      lowEQ.type = 'lowshelf'; lowEQ.frequency.value = 320; lowEQ.gain.value = imgData.eqLow || 0;
      let midEQ = actx.createBiquadFilter();
      midEQ.type = 'peaking'; midEQ.frequency.value = 1000; midEQ.Q.value = 0.7; midEQ.gain.value = imgData.eqMid || 0;
      let highEQ = actx.createBiquadFilter();
      highEQ.type = 'highshelf'; highEQ.frequency.value = 3200; highEQ.gain.value = imgData.eqHigh || 0;

      // 压缩器
      let comp = actx.createDynamicsCompressor();
      if (hasComp) {
        comp.threshold.value = imgData.compressorThreshold != null ? imgData.compressorThreshold : -24;
        comp.ratio.value = imgData.compressorRatio != null ? imgData.compressorRatio : 12;
        comp.attack.value = 0.003; comp.release.value = 0.25; comp.knee.value = 6;
      } else {
        comp.threshold.value = 0; comp.ratio.value = 1;
      }

      // 混响
      let reverb = actx.createConvolver();
      let reverbGain = actx.createGain();
      let dryGain = actx.createGain();
      if (hasReverb) {
        let sr = actx.sampleRate;
        let decay = imgData.reverbDecay || 2;
        let impLen = Math.max(1, Math.ceil(sr * decay));
        let impulse = actx.createBuffer(2, impLen, sr);
        for (let ch = 0; ch < 2; ch++) {
          let data = impulse.getChannelData(ch);
          for (let i = 0; i < impLen; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / impLen, 2);
          }
        }
        reverb.buffer = impulse;
        reverbGain.gain.value = imgData.reverbMix || 0;
        dryGain.gain.value = 1 - (imgData.reverbMix || 0) * 0.5;
      } else {
        reverbGain.gain.value = 0;
        dryGain.gain.value = 1;
      }

      // 主增益
      let masterGain = actx.createGain();
      masterGain.gain.value = imgData.volume ?? 1;

      // 分析器（用于可视化）
      let analyser = actx.createAnalyser();
      analyser.fftSize = 128;

      // 尝试使用 SoundTouch 高品质音调偏移
      let pitchShifter = null;
      if (hasPitch || hasSpeed) {
        let SoundTouchNode = await getSoundTouchNode();
        if (SoundTouchNode) {
          try {
            await SoundTouchNode.register(actx, 'lib/soundtouch-processor.js');
            audio.preservesPitch = false;
            pitchShifter = new SoundTouchNode({ context: actx });
            pitchShifter.pitchSemitones.value = imgData.pitchShift || 0;
            pitchShifter.playbackRate.value = imgData.playbackSpeed || 1;
          } catch (stErr) {
            console.warn('[AudioPlayer] SoundTouch Worklet 注册失败，使用浏览器原生播放:', stErr);
            audio.playbackRate = imgData.playbackSpeed || 1;
          }
        } else {
          // SoundTouch 库不可用，回退到浏览器原生
          audio.playbackRate = imgData.playbackSpeed || 1;
        }
      }

      // 连接: src → EQ → comp → [dry/wet reverb] → [pitchShifter] → masterGain → analyser → dest
      src.connect(lowEQ);
      lowEQ.connect(midEQ);
      midEQ.connect(highEQ);
      highEQ.connect(comp);

      comp.connect(dryGain);
      comp.connect(reverb);
      reverb.connect(reverbGain);

      if (pitchShifter) {
        dryGain.connect(pitchShifter);
        reverbGain.connect(pitchShifter);
        pitchShifter.connect(masterGain);
      } else {
        dryGain.connect(masterGain);
        reverbGain.connect(masterGain);
      }

      masterGain.connect(analyser);
      analyser.connect(actx.destination);

      fxChain = { ctx: actx, source: src, analyser: analyser, pitchShifter: pitchShifter };
    } catch (e) {
      console.warn('[AudioPlayer] 效果链创建失败:', e);
      // 最终回退：至少应用速度
      if (imgData.playbackSpeed && imgData.playbackSpeed !== 1) {
        audio.playbackRate = imgData.playbackSpeed;
      }
    }
  }

  // 波形动画
  let animId = null;
  let standaloneAnalyser = null;
  let standaloneCtx = null;
  let standaloneSource = null;

  function startVisualizer() {
    // 如果有效果链，使用效果链的分析器
    if (fxChain && fxChain.analyser) {
      if (fxChain.ctx.state === 'suspended') fxChain.ctx.resume();
      let analyser = fxChain.analyser;
      let bufLen = analyser.frequencyBinCount;
      let dataArr = new Uint8Array(bufLen);

      function draw() {
        animId = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArr);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        let barW = canvas.width / bufLen;
        for (let i = 0; i < bufLen; i++) {
          let h = (dataArr[i] / 255) * canvas.height;
          let x = i * barW;
          let gradient = ctx.createLinearGradient(x, canvas.height - h, x, canvas.height);
          gradient.addColorStop(0, 'rgba(0,255,255,0.8)');
          gradient.addColorStop(1, 'rgba(0,255,255,0.15)');
          ctx.fillStyle = gradient;
          ctx.fillRect(x, canvas.height - h, barW - 0.5, h);
        }
      }
      draw();
      return;
    }

    // 无效果链，创建独立分析器
    if (!standaloneCtx) {
      try {
        standaloneCtx = new (window.AudioContext || window.webkitAudioContext)();
        standaloneSource = standaloneCtx.createMediaElementSource(audio);
        standaloneAnalyser = standaloneCtx.createAnalyser();
        standaloneAnalyser.fftSize = 128;
        standaloneSource.connect(standaloneAnalyser);
        standaloneAnalyser.connect(standaloneCtx.destination);
      } catch (e) { return; }
    }
    if (standaloneCtx.state === 'suspended') standaloneCtx.resume();
    let bufLen = standaloneAnalyser.frequencyBinCount;
    let dataArr = new Uint8Array(bufLen);

    function draw() {
      animId = requestAnimationFrame(draw);
      standaloneAnalyser.getByteFrequencyData(dataArr);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let barW = canvas.width / bufLen;
      for (let i = 0; i < bufLen; i++) {
        let h = (dataArr[i] / 255) * canvas.height;
        let x = i * barW;
        let gradient = ctx.createLinearGradient(x, canvas.height - h, x, canvas.height);
        gradient.addColorStop(0, 'rgba(0,255,255,0.8)');
        gradient.addColorStop(1, 'rgba(0,255,255,0.15)');
        ctx.fillStyle = gradient;
        ctx.fillRect(x, canvas.height - h, barW - 0.5, h);
      }
    }
    draw();
  }

  function stopVisualizer() {
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < 64; i++) {
      let h = 2 + Math.random() * 3;
      let x = (i / 64) * canvas.width;
      ctx.fillStyle = 'rgba(0,255,255,0.15)';
      ctx.fillRect(x, canvas.height - h, canvas.width / 64 - 0.5, h);
    }
  }

  // 音频事件
  audio.addEventListener('play', function () {
    playBtn.innerHTML = '&#10074;&#10074;';
    playBtn.style.paddingLeft = '0';
    setupEffectsChain(); // 首次播放时初始化效果链
    startVisualizer();
  });
  audio.addEventListener('pause', function () {
    playBtn.innerHTML = '&#9654;';
    playBtn.style.paddingLeft = '2px';
    stopVisualizer();
  });
  audio.addEventListener('ended', function () {
    if (!audio.loop) {
      playBtn.innerHTML = '&#9654;';
      playBtn.style.paddingLeft = '2px';
      stopVisualizer();
    }
  });
  audio.addEventListener('timeupdate', function () {
    if (isDragging) return;
    if (audio.duration && isFinite(audio.duration)) {
      let pct = (audio.currentTime / audio.duration) * 100;
      progressFill.style.width = pct + '%';
      progressThumb.style.left = pct + '%';
      timeEl.textContent = fmtTime(audio.currentTime) + ' / ' + fmtTime(audio.duration);
    }
  });
  audio.addEventListener('loadedmetadata', function () {
    timeEl.textContent = '0:00 / ' + fmtTime(audio.duration);
  });

  // 恢复状态
  audio.volume = 1; // 音量由效果链 masterGain 控制，或无效果链时默认1
  audio.muted = imgData.muted ?? false;
  audio.loop = imgData.loop ?? false;
  if (imgData.muted) volBtn.innerHTML = '&#128263;';
  if (imgData.loop) loopBtn.style.color = 'var(--accent,#0ff)';

  // 初始静态波形
  stopVisualizer();

  wrapper.appendChild(audio);
  wrapper.appendChild(topRow);
  wrapper.appendChild(progressWrap);
  item.appendChild(wrapper);
}
