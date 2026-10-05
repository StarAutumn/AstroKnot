// ============================================================
//  video-editor/tabs.js — 各标签页内容渲染
//  11 个 renderXxxTab + updateSpeedPresets/updateRotatePresets/updateFlipPresets
//  + bindSlider/bindInputNumber（滑块与数字输入绑定，自动刷新预览）
// ============================================================

import {
  fmtTime, fmtTimeFull,
  videoEditorModal,
  editorVideoData, previewVideo, videoDuration, isProcessing,
  trimStart, setTrimStart, trimEnd, setTrimEnd,
  compressCrf, setCompressCrf, compressScale, setCompressScale,
  convertFormat, setConvertFormat,
  speedValue, setSpeedValue,
  watermarkText, setWatermarkText, watermarkPosition, setWatermarkPosition,
  watermarkColor, setWatermarkColor, watermarkFontSize, setWatermarkFontSize,
  activeFilters,
  filterBrightness, setFilterBrightness, filterContrast, setFilterContrast,
  filterSaturation, setFilterSaturation,
  filterBlur, setFilterBlur, filterSharpen, setFilterSharpen,
  setCropX, setCropY, setCropW, setCropH,
  rotateAngle, setRotateAngle, flipDirection, setFlipDirection,
  audioFormat, setAudioFormat, audioVolume, setAudioVolume,
  gifStartTime, setGifStartTime, gifDuration, setGifDuration,
  gifFps, setGifFps, gifWidth, setGifWidth,
  srtContent, setSrtContent, subStyle
} from './share.js';
import { updatePreview, updateTrimLabels, updateTrimRangeUI } from './preview.js';
import { setProcessing } from './index.js';
import {
  captureFrame, reverseVideo, extractAudio, adjustVolume,
  videoToGif, burnSubtitle, generateSRTTemplate
} from '../ffmpeg-service.js';
import { transactRender } from '../overlay/overlay-images/index.js';

export function renderTrimTab(content) {
  content.innerHTML =
    '<div class="ve-section-title">时间裁剪</div>' +
    '<div class="ve-param-row">' +
    '  <label>起始时间</label>' +
    '  <span id="veTrimStartLabel">' + fmtTimeFull(trimStart) + '</span>' +
    '</div>' +
    '<div class="ve-param-row">' +
    '  <label>结束时间</label>' +
    '  <span id="veTrimEndLabel">' + fmtTimeFull(trimEnd || videoDuration) + '</span>' +
    '</div>' +
    '<div class="ve-param-row">' +
    '  <label>裁剪时长</label>' +
    '  <span id="veTrimDurLabel">' + fmtTimeFull((trimEnd || videoDuration) - trimStart) + '</span>' +
    '</div>' +
    '<div class="ve-hint">在预览进度条上拖动裁剪手柄选择范围</div>' +
    '<div class="ve-param-row" style="margin-top:8px">' +
    '  <label>精确起始 (秒)</label>' +
    '  <input type="number" id="veTrimStartInput" value="' + trimStart.toFixed(1) + '" min="0" max="' + videoDuration.toFixed(1) + '" step="0.1" class="ve-input">' +
    '</div>' +
    '<div class="ve-param-row">' +
    '  <label>精确结束 (秒)</label>' +
    '  <input type="number" id="veTrimEndInput" value="' + (trimEnd || videoDuration).toFixed(1) + '" min="0" max="' + videoDuration.toFixed(1) + '" step="0.1" class="ve-input">' +
    '</div>';

  let startInput = document.getElementById('veTrimStartInput');
  let endInput = document.getElementById('veTrimEndInput');
  if (startInput) {
    startInput.addEventListener('input', function () {
      setTrimStart(Math.max(0, Math.min(parseFloat(this.value) || 0, videoDuration)));
      updateTrimLabels();
      updateTrimRangeUI();
    });
  }
  if (endInput) {
    endInput.addEventListener('input', function () {
      setTrimEnd(Math.max(trimStart, Math.min(parseFloat(this.value) || videoDuration, videoDuration)));
      updateTrimLabels();
      updateTrimRangeUI();
    });
  }

  updateTrimRangeUI();
}

export function renderCompressTab(content) {
  content.innerHTML =
    '<div class="ve-section-title">视频压缩</div>' +
    '<div class="ve-param-row">' +
    '  <label>质量 (CRF)</label>' +
    '  <input type="range" id="veCrfSlider" min="18" max="51" value="' + compressCrf + '" class="ve-slider">' +
    '  <span id="veCrfLabel">' + compressCrf + '</span>' +
    '</div>' +
    '<div class="ve-hint">CRF 越小质量越高、文件越大（18=高质量 51=低质量）</div>' +
    '<div class="ve-param-row">' +
    '  <label>缩放比例</label>' +
    '  <select id="veScaleSelect" class="ve-select">' +
    '    <option value="1"' + (compressScale === 1 ? ' selected' : '') + '>原始尺寸</option>' +
    '    <option value="0.75"' + (compressScale === 0.75 ? ' selected' : '') + '>75%</option>' +
    '    <option value="0.5"' + (compressScale === 0.5 ? ' selected' : '') + '>50%</option>' +
    '  </select>' +
    '</div>';

  let crfSlider = document.getElementById('veCrfSlider');
  let crfLabel = document.getElementById('veCrfLabel');
  if (crfSlider) {
    crfSlider.addEventListener('input', function () {
      setCompressCrf(parseInt(this.value));
      if (crfLabel) crfLabel.textContent = compressCrf;
    });
  }
  let scaleSelect = document.getElementById('veScaleSelect');
  if (scaleSelect) {
    scaleSelect.addEventListener('change', function () {
      setCompressScale(parseFloat(this.value));
    });
  }
}

export function renderConvertTab(content) {
  content.innerHTML =
    '<div class="ve-section-title">格式转换</div>' +
    '<div class="ve-param-row">' +
    '  <label>目标格式</label>' +
    '  <select id="veFormatSelect" class="ve-select">' +
    '    <option value="webm"' + (convertFormat === 'webm' ? ' selected' : '') + '>WebM (VP8+Vorbis)</option>' +
    '    <option value="mp4"' + (convertFormat === 'mp4' ? ' selected' : '') + '>MP4 (H.264+AAC)</option>' +
    '    <option value="avi"' + (convertFormat === 'avi' ? ' selected' : '') + '>AVI</option>' +
    '  </select>' +
    '</div>' +
    '<div class="ve-hint">WebM 适合网页嵌入，MP4 兼容性最好</div>';

  let formatSelect = document.getElementById('veFormatSelect');
  if (formatSelect) {
    formatSelect.addEventListener('change', function () {
      setConvertFormat(this.value);
    });
  }
}

export function renderSpeedTab(content) {
  content.innerHTML =
    '<div class="ve-section-title">播放速度</div>' +
    '<div class="ve-param-row">' +
    '  <label>速度倍率</label>' +
    '  <input type="range" id="veSpeedSlider" min="0.25" max="4" step="0.25" value="' + speedValue + '" class="ve-slider">' +
    '  <span id="veSpeedLabel">' + speedValue + 'x</span>' +
    '</div>' +
    '<div class="ve-speed-presets">' +
    '  <button class="ve-preset-btn' + (speedValue === 0.5 ? ' ve-preset-active' : '') + '" data-speed="0.5">0.5x</button>' +
    '  <button class="ve-preset-btn' + (speedValue === 0.75 ? ' ve-preset-active' : '') + '" data-speed="0.75">0.75x</button>' +
    '  <button class="ve-preset-btn' + (speedValue === 1 ? ' ve-preset-active' : '') + '" data-speed="1">1x</button>' +
    '  <button class="ve-preset-btn' + (speedValue === 1.5 ? ' ve-preset-active' : '') + '" data-speed="1.5">1.5x</button>' +
    '  <button class="ve-preset-btn' + (speedValue === 2 ? ' ve-preset-active' : '') + '" data-speed="2">2x</button>' +
    '</div>';

  let speedSlider = document.getElementById('veSpeedSlider');
  let speedLabel = document.getElementById('veSpeedLabel');
  if (speedSlider) {
    speedSlider.addEventListener('input', function () {
      setSpeedValue(parseFloat(this.value));
      if (speedLabel) speedLabel.textContent = speedValue + 'x';
      updateSpeedPresets();
    });
  }

  content.querySelectorAll('.ve-preset-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      setSpeedValue(parseFloat(this.dataset.speed));
      if (speedSlider) speedSlider.value = speedValue;
      if (speedLabel) speedLabel.textContent = speedValue + 'x';
      updateSpeedPresets();
      updatePreview();
    });
  });
}

function updateSpeedPresets() {
  let btns = videoEditorModal.querySelectorAll('.ve-preset-btn');
  btns.forEach(function (btn) {
    btn.classList.toggle('ve-preset-active', parseFloat(btn.dataset.speed) === speedValue);
  });
}

export function renderWatermarkTab(content) {
  content.innerHTML =
    '<div class="ve-section-title">文字水印</div>' +
    '<div class="ve-param-row">' +
    '  <label>水印文字</label>' +
    '  <input type="text" id="veWmText" value="' + watermarkText + '" placeholder="输入水印文字" class="ve-input" style="flex:1">' +
    '</div>' +
    '<div class="ve-param-row">' +
    '  <label>位置</label>' +
    '  <select id="veWmPosition" class="ve-select">' +
    '    <option value="top-left"' + (watermarkPosition === 'top-left' ? ' selected' : '') + '>左上</option>' +
    '    <option value="top-right"' + (watermarkPosition === 'top-right' ? ' selected' : '') + '>右上</option>' +
    '    <option value="bottom-left"' + (watermarkPosition === 'bottom-left' ? ' selected' : '') + '>左下</option>' +
    '    <option value="bottom-right"' + (watermarkPosition === 'bottom-right' ? ' selected' : '') + '>右下</option>' +
    '    <option value="center"' + (watermarkPosition === 'center' ? ' selected' : '') + '>居中</option>' +
    '  </select>' +
    '</div>' +
    '<div class="ve-param-row">' +
    '  <label>颜色</label>' +
    '  <input type="color" id="veWmColor" value="' + watermarkColor + '" class="ve-color-input">' +
    '</div>' +
    '<div class="ve-param-row">' +
    '  <label>字号</label>' +
    '  <input type="range" id="veWmFontSize" min="12" max="72" value="' + watermarkFontSize + '" class="ve-slider">' +
    '  <span id="veWmFontSizeLabel">' + watermarkFontSize + '</span>' +
    '</div>';

  let wmText = document.getElementById('veWmText');
  if (wmText) wmText.addEventListener('input', function () { setWatermarkText(this.value); });

  let wmPos = document.getElementById('veWmPosition');
  if (wmPos) wmPos.addEventListener('change', function () { setWatermarkPosition(this.value); });

  let wmColor = document.getElementById('veWmColor');
  if (wmColor) wmColor.addEventListener('input', function () { setWatermarkColor(this.value); });

  let wmSize = document.getElementById('veWmFontSize');
  let wmSizeLabel = document.getElementById('veWmFontSizeLabel');
  if (wmSize) {
    wmSize.addEventListener('input', function () {
      setWatermarkFontSize(parseInt(this.value));
      if (wmSizeLabel) wmSizeLabel.textContent = watermarkFontSize;
    });
  }
}

export function renderSnapshotTab(content) {
  content.innerHTML =
    '<div class="ve-section-title">视频截图</div>' +
    '<div class="ve-hint">截取当前播放位置的帧画面为 PNG 图片</div>' +
    '<div class="ve-param-row">' +
    '  <label>当前时间</label>' +
    '  <span id="veSnapTime">' + fmtTimeFull(previewVideo ? previewVideo.currentTime : 0) + '</span>' +
    '</div>' +
    '<button class="ve-snapshot-btn" id="veSnapshotBtn">截取当前帧</button>' +
    '<div id="veSnapPreview" class="ve-snap-preview" style="display:none"></div>';

  let snapBtn = document.getElementById('veSnapshotBtn');
  if (snapBtn) {
    snapBtn.addEventListener('click', async function () {
      if (!previewVideo || isProcessing) return;
      let time = previewVideo.currentTime;
      setProcessing(true, '截取帧...');
      try {
        let result = await captureFrame(editorVideoData.src, editorVideoData.srcType, time);
        let preview = document.getElementById('veSnapPreview');
        if (preview) {
          preview.style.display = 'block';
          preview.innerHTML = '';
          let img = document.createElement('img');
          img.src = result.dataUrl;
          img.style.cssText = 'max-width:100%;border-radius:6px;border:1px solid #2c6e7e;';
          preview.appendChild(img);
          let saveBtn = document.createElement('button');
          saveBtn.className = 've-snapshot-btn';
          saveBtn.textContent = '插入截图到文档';
          saveBtn.style.marginTop = '8px';
          saveBtn.addEventListener('click', function () {
            // 将截图作为图片 overlay 插入
            let overlayRect = document.querySelector('#ckEditorContainer .mce-content-body');
            let imgData = {
              type: 'image',
              id: 'oly-img-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
              src: result.dataUrl,
              x: editorVideoData.x + editorVideoData.width + 20,
              y: editorVideoData.y,
              width: Math.min(320, editorVideoData.width),
              height: Math.round(Math.min(320, editorVideoData.width) * (editorVideoData.height / editorVideoData.width)),
              zIndex: editorVideoData.zIndex + 1
            };
            import('../overlay/overlay-images/index.js').then(function (mod) {
              mod.overlayImages.push(imgData);
              mod.transactRender();
            });
          });
          preview.appendChild(saveBtn);
        }
      } catch (e) {
        console.error('[VideoEditor] 截图失败:', e);
      } finally {
        setProcessing(false);
      }
    });
  }
}

export function renderFilterTab(content) {
  let filterDefs = [
    { key: 'grayscale', label: '灰度', toggle: true },
    { key: 'sepia', label: '复古', toggle: true },
    { key: 'invert', label: '反色', toggle: true },
    { key: 'warm', label: '暖色', toggle: true },
    { key: 'cool', label: '冷色', toggle: true },
    { key: 'vignette', label: '暗角', toggle: true },
    { key: 'noise', label: '噪点', toggle: true },
    { key: 'pixelate', label: '像素化', toggle: true },
  ];

  let togglesHtml = filterDefs.map(function (f) {
    return '<div class="ve-filter-toggle' + (activeFilters[f.key] ? ' ve-filter-active' : '') + '" data-key="' + f.key + '">' + f.label + '</div>';
  }).join('');

  content.innerHTML =
    '<div class="ve-section-title">滤镜效果</div>' +
    '<div class="ve-filter-grid">' + togglesHtml + '</div>' +
    '<div class="ve-section-title" style="margin-top:14px">参数调节</div>' +
    '<div class="ve-param-row">' +
    '  <label>亮度</label>' +
    '  <input type="range" id="veFiltBright" min="0" max="100" value="' + filterBrightness + '" class="ve-slider">' +
    '  <span style="min-width:28px">' + filterBrightness + '</span>' +
    '</div>' +
    '<div class="ve-param-row">' +
    '  <label>对比度</label>' +
    '  <input type="range" id="veFiltContrast" min="0" max="100" value="' + filterContrast + '" class="ve-slider">' +
    '  <span style="min-width:28px">' + filterContrast + '</span>' +
    '</div>' +
    '<div class="ve-param-row">' +
    '  <label>饱和度</label>' +
    '  <input type="range" id="veFiltSatur" min="0" max="100" value="' + filterSaturation + '" class="ve-slider">' +
    '  <span style="min-width:28px">' + filterSaturation + '</span>' +
    '</div>' +
    '<div class="ve-param-row">' +
    '  <label>模糊</label>' +
    '  <input type="range" id="veFiltBlur" min="0" max="20" value="' + filterBlur + '" class="ve-slider">' +
    '  <span style="min-width:28px">' + filterBlur + '</span>' +
    '</div>' +
    '<div class="ve-param-row">' +
    '  <label>锐化</label>' +
    '  <input type="range" id="veFiltSharp" min="0" max="50" value="' + filterSharpen + '" class="ve-slider">' +
    '  <span style="min-width:28px">' + filterSharpen + '</span>' +
    '</div>';

  // 滤镜开关
  content.querySelectorAll('.ve-filter-toggle').forEach(function (el) {
    el.addEventListener('click', function () {
      activeFilters[this.dataset.key] = !activeFilters[this.dataset.key];
      this.classList.toggle('ve-filter-active');
      updatePreview();
    });
  });

  // 参数滑块
  bindSlider('veFiltBright', function (v) { setFilterBrightness(v); });
  bindSlider('veFiltContrast', function (v) { setFilterContrast(v); });
  bindSlider('veFiltSatur', function (v) { setFilterSaturation(v); });
  bindSlider('veFiltBlur', function (v) { setFilterBlur(v); });
  bindSlider('veFiltSharp', function (v) { setFilterSharpen(v); });
}

export function renderAdvancedTab(content) {
  content.innerHTML =
    '<div class="ve-section-title">画面裁切</div>' +
    '<div class="ve-hint">按比例裁掉视频画面的边缘区域</div>' +
    '<div class="ve-param-row"><label>左边</label><input type="range" id="veCropX" min="0" max="49" value="0" step="1" class="ve-slider"><span id="veCropXVal">0%</span></div>' +
    '<div class="ve-param-row"><label>上边</label><input type="range" id="veCropY" min="0" max="49" value="0" step="1" class="ve-slider"><span id="veCropYVal">0%</span></div>' +
    '<div class="ve-param-row"><label>宽度</label><input type="range" id="veCropW" min="10" max="100" value="100" step="1" class="ve-slider"><span id="veCropWVal">100%</span></div>' +
    '<div class="ve-param-row"><label>高度</label><input type="range" id="veCropH" min="10" max="100" value="100" step="1" class="ve-slider"><span id="veCropHVal">100%</span></div>' +

    '<div class="ve-section-title" style="margin-top:16px">旋转 / 翻转</div>' +
    '<div class="ve-rotate-grid">' +
    '  <button class="ve-preset-btn ve-preset-active" data-angle="0">原始</button>' +
    '  <button class="ve-preset-btn" data-angle="90">顺时针 90°</button>' +
    '  <button class="ve-preset-btn" data-angle="180">180°</button>' +
    '  <button class="ve-preset-btn" data-angle="270">顺时针 270°</button>' +
    '</div>' +
    '<div class="ve-flip-grid">' +
    '  <button class="ve-preset-btn" data-flip="h">水平翻转</button>' +
    '  <button class="ve-preset-btn" data-flip="v">垂直翻转</button>' +
    '</div>' +

    '<div class="ve-section-title" style="margin-top:16px">倒放</div>' +
    '<button class="ve-snapshot-btn" id="veReverseBtn">倒放视频（含音频）</button>';

  // 裁切滑块
  bindSlider('veCropX', function (v) { setCropX(v / 100); document.getElementById('veCropXVal').textContent = v + '%'; });
  bindSlider('veCropY', function (v) { setCropY(v / 100); document.getElementById('veCropYVal').textContent = v + '%'; });
  bindSlider('veCropW', function (v) { setCropW(v / 100); document.getElementById('veCropWVal').textContent = v + '%'; });
  bindSlider('veCropH', function (v) { setCropH(v / 100); document.getElementById('veCropHVal').textContent = v + '%'; });

  // 旋转按钮
  content.querySelectorAll('[data-angle]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      setRotateAngle(parseInt(this.dataset.angle));
      updateRotatePresets();
      updatePreview();
    });
  });

  // 翻转按钮
  content.querySelectorAll('[data-flip]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      setFlipDirection(flipDirection === this.dataset.flip ? '' : this.dataset.flip);
      updateFlipPresets();
      updatePreview();
    });
  });

  // 倒放按钮
  let revBtn = document.getElementById('veReverseBtn');
  if (revBtn) {
    revBtn.addEventListener('click', async function () {
      if (isProcessing) return;
      setProcessing(true, '倒放中...');
      try {
        let result = await reverseVideo(editorVideoData.src, editorVideoData.srcType,
          function (p) { setProcessing(true, '倒放中... ' + Math.round(p * 100) + '%'); }
        );
        if (result.dataUrl) { editorVideoData.src = result.dataUrl; editorVideoData.srcType = 'dataUrl'; if (previewVideo) previewVideo.src = result.dataUrl; transactRender(); }
      } catch (e) { console.error(e); }
      finally { setProcessing(false); }
    });
  }

  updateRotatePresets();
}

function updateRotatePresets() {
  let c = document.getElementById('veTabContent');
  if (c) c.querySelectorAll('[data-angle]').forEach(function (btn) {
    btn.classList.toggle('ve-preset-active', parseInt(btn.dataset.angle) === rotateAngle);
  });
}
function updateFlipPresets() {
  let c = document.getElementById('veTabContent');
  if (c) c.querySelectorAll('[data-flip]').forEach(function (btn) {
    btn.classList.toggle('ve-preset-active', flipDirection === btn.dataset.flip);
  });
}

export function renderAudioTab(content) {
  content.innerHTML =
    '<div class="ve-section-title">提取音频</div>' +
    '<div class="ve-param-row">' +
    '  <label>输出格式</label>' +
    '  <select id="veAudioFmt" class="ve-select">' +
    '    <option value="mp3"' + (audioFormat === 'mp3' ? ' selected' : '') + '>MP3</option>' +
    '    <option value="wav"' + (audioFormat === 'wav' ? ' selected' : '') + '>WAV</option>' +
    '  </select>' +
    '</div>' +
    '<button class="ve-snapshot-btn" id="veExtractAudioBtn">提取音频并下载</button>' +
    '<div id="veAudioResult" class="ve-audio-result" style="display:none"></div>' +

    '<div class="ve-section-title" style="margin-top:16px">音量调节</div>' +
    '<div class="ve-param-row">' +
    '  <label>音量倍率</label>' +
    '  <input type="range" id="veVolumeSlider" min="0" max="300" value="' + (audioVolume * 100) + '" class="ve-slider">' +
    '  <span id="veVolumeLabel">' + audioVolume.toFixed(2) + 'x</span>' +
    '</div>' +
    '<button class="ve-snapshot-btn" id="veAdjustVolBtn">应用音量调整</button>';

  let fmtSelect = document.getElementById('veAudioFmt');
  if (fmtSelect) fmtSelect.addEventListener('change', function () { setAudioFormat(this.value); });

  // 提取音频
  let extractBtn = document.getElementById('veExtractAudioBtn');
  if (extractBtn) {
    extractBtn.addEventListener('click', async function () {
      if (isProcessing) return;
      setProcessing(true, '提取音频...');
      try {
        let result = await extractAudio(editorVideoData.src, editorVideoData.srcType, audioFormat,
          function (p) { setProcessing(true, '提取中... ' + Math.round(p * 100) + '%'); }
        );
        let resEl = document.getElementById('veAudioResult');
        if (resEl) {
          resEl.style.display = 'block';
          resEl.innerHTML = '<audio controls src="' + result.dataUrl + '" style="width:100%;margin-bottom:6px"></audio>' +
            '<button class="ve-snapshot-btn" id="veDownloadAudioBtn">下载 ' + result.fileName + '</button>';
          let dlBtn = document.getElementById('veDownloadAudioBtn');
          if (dlBtn) dlBtn.addEventListener('click', function () {
            let a = document.createElement('a');
            a.href = result.dataUrl; a.download = result.fileName; a.click();
          });
        }
      } catch (e) { console.error(e); }
      finally { setProcessing(false); }
    });
  }

  // 音量滑块
  let volSlider = document.getElementById('veVolumeSlider');
  let volLabel = document.getElementById('veVolumeLabel');
  if (volSlider) {
    volSlider.addEventListener('input', function () {
      setAudioVolume(parseFloat(this.value) / 100);
      if (volLabel) volLabel.textContent = audioVolume.toFixed(2) + 'x';
    });
  }

  // 应用音量
  let volApplyBtn = document.getElementById('veAdjustVolBtn');
  if (volApplyBtn) {
    volApplyBtn.addEventListener('click', async function () {
      if (isProcessing || audioVolume === 1.0) return;
      setProcessing(true, '调整音量...');
      try {
        let result = await adjustVolume(editorVideoData.src, editorVideoData.srcType, audioVolume,
          function (p) { setProcessing(true, '处理中... ' + Math.round(p * 100) + '%'); }
        );
        if (result.dataUrl) { editorVideoData.src = result.dataUrl; editorVideoData.srcType = 'dataUrl'; if (previewVideo) previewVideo.src = result.dataUrl; transactRender(); }
      } catch (e) { console.error(e); }
      finally { setProcessing(false); }
    });
  }
}

export function renderGifTab(content) {
  content.innerHTML =
    '<div class="ve-section-title">视频 → GIF</div>' +
    '<div class="ve-param-row">' +
    '  <label>起始时间(秒)</label>' +
    '  <input type="number" id="veGifStart" value="' + gifStartTime + '" min="0" step="0.5" class="ve-input">' +
    '</div>' +
    '<div class="ve-param-row">' +
    '  <label>时长(秒)</label>' +
    '  <input type="number" id="veGifDur" value="' + gifDuration + '" min="0.5" max="30" step="0.5" class="ve-input">' +
    '</div>' +
    '<div class="ve-param-row">' +
    '  <label>帧率(FPS)</label>' +
    '  <input type="range" id="veGifFps" min="5" max="30" value="' + gifFps + '" class="ve-slider">' +
    '  <span id="veGifFpsLabel">' + gifFps + '</span>' +
    '</div>' +
    '<div class="ve-param-row">' +
    '  <label>最大宽度(px)</label>' +
    '  <input type="range" id="veGifWidth" min="120" max="800" value="' + gifWidth + '" step="40" class="ve-slider">' +
    '  <span id="veGifWidthLabel">' + gifWidth + '</span>' +
    '</div>' +
    '<button class="ve-snapshot-btn" id="veToGifBtn">生成 GIF</button>' +
    '<div id="veGifPreview" class="ve-gif-preview" style="display:none"></div>';

  bindInputNumber('veGifStart', function (v) { setGifStartTime(v); });
  bindInputNumber('veGifDur', function (v) { setGifDuration(v); });
  bindSlider('veGifFps', function (v) { setGifFps(v); document.getElementById('veGifFpsLabel').textContent = v; });
  bindSlider('veGifWidth', function (v) { setGifWidth(v); document.getElementById('veGifWidthLabel').textContent = v; });

  let toGifBtn = document.getElementById('veToGifBtn');
  if (toGifBtn) {
    toGifBtn.addEventListener('click', async function () {
      if (isProcessing) return;
      setProcessing(true, '生成 GIF...');
      try {
        let result = await videoToGif(editorVideoData.src, editorVideoData.srcType, gifStartTime, gifDuration, gifFps, gifWidth,
          function (p) { setProcessing(true, '生成 GIF... ' + Math.round(p * 100) + '%'); }
        );
        let preview = document.getElementById('veGifPreview');
        if (preview) {
          preview.style.display = 'block';
          preview.innerHTML = '';
          let img = document.createElement('img');
          img.src = result.dataUrl;
          img.style.cssText = 'max-width:100%;border-radius:6px;border:1px solid #2c6e7e;';
          preview.appendChild(img);
          let btnRow = document.createElement('div');
          btnRow.style.cssText = 'display:flex;gap:8px;margin-top:8px;';
          let insBtn = document.createElement('button');
          insBtn.className = 've-snapshot-btn';
          insBtn.textContent = '插入 GIF 到文档';
          insBtn.style.flex = '1';
          insBtn.addEventListener('click', function () {
            let imgData = {
              type: 'image',
              id: 'oly-img-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
              src: result.dataUrl,
              x: editorVideoData.x + 20, y: editorVideoData.y,
              width: Math.min(320, gifWidth), height: Math.min(240, gifWidth * 0.75),
              zIndex: editorVideoData.zIndex + 1
            };
            import('../overlay/overlay-images/index.js').then(function (mod) {
              mod.overlayImages.push(imgData);
              mod.transactRender();
            });
          });
          let dlBtn = document.createElement('button');
          dlBtn.className = 've-snapshot-btn';
          dlBtn.textContent = '下载 GIF';
          dlBtn.style.flex = '1';
          dlBtn.addEventListener('click', function () {
            let a = document.createElement('a');
            a.href = result.dataUrl; a.download = 'output.gif'; a.click();
          });
          btnRow.appendChild(insBtn);
          btnRow.appendChild(dlBtn);
          preview.appendChild(btnRow);
        }
      } catch (e) { console.error(e); }
      finally { setProcessing(false); }
    });
  }
}

export function renderSubtitleTab(content) {
  content.innerHTML =
    '<div class="ve-section-title">烧录 SRT 字幕</div>' +
    '<div class="ve-param-row">' +
    '  <label>字幕位置</label>' +
    '  <select id="veSubPos" class="ve-select">' +
    '    <option value="bottom"' + (subStyle.position === 'bottom' ? ' selected' : '') + '>底部</option>' +
    '    <option value="top"' + (subStyle.position === 'top' ? ' selected' : '') + '>顶部</option>' +
    '    <option value="center"' + (subStyle.position === 'center' ? ' selected' : '') + '>居中</option>' +
    '  </select>' +
    '</div>' +
    '<div class="ve-param-row">' +
    '  <label>字号</label>' +
    '  <input type="range" id="veSubFontSize" min="12" max="48" value="' + subStyle.fontSize + '" class="ve-slider">' +
    '  <span id="veSubFontSizeLabel">' + subStyle.fontSize + '</span>' +
    '</div>' +
    '<div class="ve-param-row">' +
    '  <label>文字颜色</label>' +
    '  <input type="color" id="veSubColor" value="' + subStyle.color + '" class="ve-color-input">' +
    '</div>' +
    '<div class="ve-param-row">' +
    '  <label>描边颜色</label>' +
    '  <input type="color" id="veSubOutline" value="' + subStyle.outlineColor + '" class="ve-color-input">' +
    '</div>' +
    '<div class="ve-sub-label">SRT 字幕内容：</div>' +
    '<textarea id="veSrtContent" class="ve-textarea" rows="12" placeholder="输入 SRT 格式字幕...">' + srtContent.replace(/</g, '&lt;') + '</textarea>' +
    '<div style="display:flex;gap:8px;margin-top:8px">' +
    '  <button class="ve-snapshot-btn" id="veBurnSubBtn" style="flex:1">烧录字幕到视频</button>' +
    '  <button class="ve-snapshot-btn" id="veResetSrtBtn" style="flex:0.4">重置模板</button>' +
    '</div>';

  let posSel = document.getElementById('veSubPos');
  if (posSel) posSel.addEventListener('change', function () { subStyle.position = this.value; });

  let fsSlider = document.getElementById('veSubFontSize');
  let fsLabel = document.getElementById('veSubFontSizeLabel');
  if (fsSlider) fsSlider.addEventListener('input', function () { subStyle.fontSize = parseInt(this.value); if (fsLabel) fsLabel.textContent = this.value; });

  let colorIn = document.getElementById('veSubColor');
  if (colorIn) colorIn.addEventListener('input', function () { subStyle.color = this.value; });

  let outIn = document.getElementById('veSubOutline');
  if (outIn) outIn.addEventListener('input', function () { subStyle.outlineColor = this.value; });

  let srtArea = document.getElementById('veSrtContent');
  if (srtArea) srtArea.addEventListener('input', function () { setSrtContent(this.value); });

  let burnBtn = document.getElementById('veBurnSubBtn');
  if (burnBtn) {
    burnBtn.addEventListener('click', async function () {
      if (isProcessing || !srtContent.trim()) return;
      setProcessing(true, '烧录字幕...');
      try {
        let result = await burnSubtitle(editorVideoData.src, editorVideoData.srcType, srtContent, subStyle,
          function (p) { setProcessing(true, '烧录中... ' + Math.round(p * 100) + '%'); }
        );
        if (result.dataUrl) { editorVideoData.src = result.dataUrl; editorVideoData.srcType = 'dataUrl'; if (previewVideo) previewVideo.src = result.dataUrl; transactRender(); }
      } catch (e) { console.error(e); }
      finally { setProcessing(false); }
    });
  }

  let resetBtn = document.getElementById('veResetSrtBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', function () {
      setSrtContent(generateSRTTemplate());
      let area = document.getElementById('veSrtContent');
      if (area) area.value = srtContent;
    });
  }
}

// ── 工具：绑定滑块（自动刷新预览）──
function bindSlider(id, onChange) {
  let el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('input', function () {
    let val = parseFloat(this.value);
    onChange(val);
    let span = el.nextElementSibling;
    if (span && span.tagName === 'SPAN') span.textContent = val;
    updatePreview();
  });
}
function bindInputNumber(id, onChange) {
  let el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('change', function () { onChange(parseFloat(this.value)); updatePreview(); });
}
