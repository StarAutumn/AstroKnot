// ============================================================
//  video-editor.js — 视频编辑器 UI（基于 FFmpeg.wasm）
//  功能：裁剪、压缩、转码、变速、水印、截图、滤镜、高级剪辑、音频、GIF、字幕
// ============================================================

import { renderAll, transactRender } from './overlay/overlay-images.js';
import {
  getFFmpeg, isFFmpegLoaded,
  trimVideo, compressVideo, convertVideo, captureFrame,
  changeSpeed, addTextWatermark, getVideoInfo,
  applyVideoFilter, cropFrameArea, rotateVideo, flipVideo, reverseVideo,
  extractAudio, replaceAudio, adjustVolume,
  videoToGif, gifToVideo,
  burnSubtitle, generateSRTTemplate
} from './ffmpeg-service.js';

// ── 状态 ──
let videoEditorModal = null;
let editorVideoData = null;
let previewVideo = null;
let videoDuration = 0;
let activeTab = 'trim';
let isProcessing = false;

// 裁剪参数
let trimStart = 0;
let trimEnd = 0;
let trimDragging = null; // 'start' | 'end' | null

// 压缩参数
let compressCrf = 28;
let compressScale = 1;

// 转码参数
let convertFormat = 'webm';

// 变速参数
let speedValue = 1;

// 水印参数
let watermarkText = '';
let watermarkPosition = 'bottom-right';
let watermarkColor = '#ffffff';
let watermarkFontSize = 24;

// 滤镜参数
let activeFilters = {}; // { grayscale: false, sepia: false, brightness: 50, ... }
let filterBrightness = 50;
let filterContrast = 50;
let filterSaturation = 50;
let filterBlur = 0;
let filterSharpen = 0;

// 高级剪辑参数
let cropX = 0, cropY = 0, cropW = 1, cropH = 1;
let rotateAngle = 0; // 90/180/270
let flipDirection = ''; // 'h' | 'v'

// 音频参数
let audioFormat = 'mp3';
let audioVolume = 1.0;
let replaceAudioFile = null;

// GIF 参数
let gifStartTime = 0;
let gifDuration = 5;
let gifFps = 15;
let gifWidth = 480;

// 字幕参数
let srtContent = '';
let subStyle = { fontSize: 24, color: '#ffffff', position: 'bottom', outlineColor: '#000000' };

// ── 工具函数 ──
function fmtTime(s) {
  if (!s || isNaN(s)) return '0:00';
  let m = Math.floor(s / 60);
  let sec = Math.floor(s % 60);
  return m + ':' + (sec < 10 ? '0' : '') + sec;
}

function fmtTimeFull(s) {
  if (!s || isNaN(s)) return '0:00.0';
  let m = Math.floor(s / 60);
  let sec = Math.floor(s % 60);
  let ms = Math.floor((s % 1) * 10);
  return m + ':' + (sec < 10 ? '0' : '') + sec + '.' + ms;
}

// ── 主入口 ──
export function openVideoEditor(imgData) {
  if (!imgData || imgData.type !== 'video') return;
  editorVideoData = imgData;
  activeTab = 'trim';

  // 重置参数
  trimStart = 0;
  trimEnd = 0;
  compressCrf = 28;
  compressScale = 1;
  convertFormat = 'webm';
  speedValue = 1;
  watermarkText = '';
  watermarkPosition = 'bottom-right';
  watermarkColor = '#ffffff';
  watermarkFontSize = 24;
  activeFilters = {};
  filterBrightness = 50; filterContrast = 50; filterSaturation = 50;
  filterBlur = 0; filterSharpen = 0;
  cropX = 0; cropY = 0; cropW = 1; cropH = 1;
  rotateAngle = 0; flipDirection = '';
  audioFormat = 'mp3'; audioVolume = 1.0; replaceAudioFile = null;
  gifStartTime = 0; gifDuration = 5; gifFps = 15; gifWidth = 480;
  srtContent = generateSRTTemplate();
  subStyle = { fontSize: 24, color: '#ffffff', position: 'bottom', outlineColor: '#000000' };

  buildUI();
  document.body.appendChild(videoEditorModal);
  initPreview();
}

// ── 构建 UI ──
function buildUI() {
  if (videoEditorModal) {
    try { videoEditorModal.remove(); } catch (e) {}
  }

  videoEditorModal = document.createElement('div');
  videoEditorModal.className = 've-overlay';
  videoEditorModal.innerHTML = '';

  let dialog = document.createElement('div');
  dialog.className = 've-dialog';

  // ── 标题栏 ──
  let header = document.createElement('div');
  header.className = 've-header';
  header.innerHTML =
    '<span class="ve-title">视频编辑器</span>' +
    '<span class="ve-subtitle" id="veVideoInfo">加载中...</span>';
  let closeBtn = document.createElement('div');
  closeBtn.className = 've-close-btn';
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', closeVideoEditor);
  header.appendChild(closeBtn);
  dialog.appendChild(header);

  // ── 主体 ──
  let body = document.createElement('div');
  body.className = 've-body';

  // 左侧：预览
  let previewPanel = document.createElement('div');
  previewPanel.className = 've-preview-panel';

  let previewWrap = document.createElement('div');
  previewWrap.className = 've-preview-wrap';
  previewVideo = document.createElement('video');
  previewVideo.className = 've-preview-video';
  previewVideo.preload = 'metadata';
  previewVideo.playsInline = true;
  previewVideo.controls = false;
  previewVideo.src = editorVideoData.src;
  previewWrap.appendChild(previewVideo);

  // 播放控制
  let playBar = document.createElement('div');
  playBar.className = 've-play-bar';

  let playBtn = document.createElement('div');
  playBtn.className = 've-play-btn';
  playBtn.textContent = '▶';
  playBtn.addEventListener('click', function () {
    if (previewVideo.paused) { previewVideo.play(); } else { previewVideo.pause(); }
  });

  let timeLabel = document.createElement('div');
  timeLabel.className = 've-time-label';
  timeLabel.id = 'veTimeLabel';
  timeLabel.textContent = '0:00 / 0:00';

  let seekBar = document.createElement('div');
  seekBar.className = 've-seek-bar';
  seekBar.id = 'veSeekBar';
  let seekFill = document.createElement('div');
  seekFill.className = 've-seek-fill';
  seekFill.id = 'veSeekFill';
  seekBar.appendChild(seekFill);

  // 裁剪范围指示器
  let trimRange = document.createElement('div');
  trimRange.className = 've-trim-range';
  trimRange.id = 'veTrimRange';
  let trimHandleStart = document.createElement('div');
  trimHandleStart.className = 've-trim-handle ve-trim-handle-start';
  trimHandleStart.id = 'veTrimHandleStart';
  let trimHandleEnd = document.createElement('div');
  trimHandleEnd.className = 've-trim-handle ve-trim-handle-end';
  trimHandleEnd.id = 'veTrimHandleEnd';
  trimRange.appendChild(trimHandleStart);
  trimRange.appendChild(trimHandleEnd);
  seekBar.appendChild(trimRange);

  seekBar.addEventListener('mousedown', onSeekBarMouseDown);

  playBar.appendChild(playBtn);
  playBar.appendChild(timeLabel);
  playBar.appendChild(seekBar);

  previewPanel.appendChild(previewWrap);
  previewPanel.appendChild(playBar);
  body.appendChild(previewPanel);

  // 右侧：工具面板
  let toolPanel = document.createElement('div');
  toolPanel.className = 've-tool-panel';

  // Tab 栏
  let tabBar = document.createElement('div');
  tabBar.className = 've-tab-bar';

  let tabs = [
    { id: 'trim', label: '裁剪' },
    { id: 'compress', label: '压缩' },
    { id: 'convert', label: '转码' },
    { id: 'speed', label: '变速' },
    { id: 'watermark', label: '水印' },
    { id: 'snapshot', label: '截图' },
    { id: 'filter', label: '滤镜' },
    { id: 'advanced', label: '高级' },
    { id: 'audio', label: '音频' },
    { id: 'gif', label: 'GIF' },
    { id: 'subtitle', label: '字幕' }
  ];

  tabs.forEach(function (tab) {
    let btn = document.createElement('div');
    btn.className = 've-tab-btn' + (tab.id === activeTab ? ' ve-tab-active' : '');
    btn.textContent = tab.label;
    btn.dataset.tab = tab.id;
    btn.addEventListener('click', function () {
      activeTab = tab.id;
      updateTabUI();
    });
    tabBar.appendChild(btn);
  });

  toolPanel.appendChild(tabBar);

  // Tab 内容
  let tabContent = document.createElement('div');
  tabContent.className = 've-tab-content';
  tabContent.id = 'veTabContent';

  toolPanel.appendChild(tabContent);

  // 进度条
  let progressWrap = document.createElement('div');
  progressWrap.className = 've-progress-wrap';
  progressWrap.id = 'veProgressWrap';
  progressWrap.style.display = 'none';
  let progressBar = document.createElement('div');
  progressBar.className = 've-progress-bar';
  let progressFill = document.createElement('div');
  progressFill.className = 've-progress-fill';
  progressFill.id = 'veProgressFill';
  progressBar.appendChild(progressFill);
  let progressLabel = document.createElement('div');
  progressLabel.className = 've-progress-label';
  progressLabel.id = 'veProgressLabel';
  progressLabel.textContent = '处理中...';
  progressWrap.appendChild(progressBar);
  progressWrap.appendChild(progressLabel);
  toolPanel.appendChild(progressWrap);

  // 应用按钮
  let applyBtn = document.createElement('button');
  applyBtn.className = 've-apply-btn';
  applyBtn.id = 'veApplyBtn';
  applyBtn.textContent = '应用';
  applyBtn.addEventListener('click', onApply);
  toolPanel.appendChild(applyBtn);

  body.appendChild(toolPanel);
  dialog.appendChild(body);
  videoEditorModal.appendChild(dialog);

  // 点击遮罩关闭
  videoEditorModal.addEventListener('mousedown', function (e) {
    if (e.target === videoEditorModal) closeVideoEditor();
  });

  // ESC 关闭
  document.addEventListener('keydown', onEscKey);

  updateTabUI();
  updatePreview();
}

// ── Tab 内容渲染 ──
function updateTabUI() {
  // 更新 tab 按钮状态
  let tabBtns = videoEditorModal.querySelectorAll('.ve-tab-btn');
  tabBtns.forEach(function (btn) {
    btn.classList.toggle('ve-tab-active', btn.dataset.tab === activeTab);
  });

  let content = document.getElementById('veTabContent');
  if (!content) return;
  content.innerHTML = '';

  // 裁剪范围指示器可见性
  let trimRange = document.getElementById('veTrimRange');
  if (trimRange) {
    trimRange.style.display = activeTab === 'trim' ? 'block' : 'none';
  }

  // 应用按钮
  let applyBtn = document.getElementById('veApplyBtn');
  if (applyBtn) {
    applyBtn.style.display = (activeTab === 'snapshot' || activeTab === 'audio' || activeTab === 'gif' || activeTab === 'subtitle') ? 'none' : '';
  }

  if (activeTab === 'trim') {
    renderTrimTab(content);
  } else if (activeTab === 'compress') {
    renderCompressTab(content);
  } else if (activeTab === 'convert') {
    renderConvertTab(content);
  } else if (activeTab === 'speed') {
    renderSpeedTab(content);
  } else if (activeTab === 'watermark') {
    renderWatermarkTab(content);
  } else if (activeTab === 'snapshot') {
    renderSnapshotTab(content);
  } else if (activeTab === 'filter') {
    renderFilterTab(content);
  } else if (activeTab === 'advanced') {
    renderAdvancedTab(content);
  } else if (activeTab === 'audio') {
    renderAudioTab(content);
  } else if (activeTab === 'gif') {
    renderGifTab(content);
  } else if (activeTab === 'subtitle') {
    renderSubtitleTab(content);
  }

  updatePreview();
}

function renderTrimTab(content) {
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
      trimStart = Math.max(0, Math.min(parseFloat(this.value) || 0, videoDuration));
      updateTrimLabels();
      updateTrimRangeUI();
    });
  }
  if (endInput) {
    endInput.addEventListener('input', function () {
      trimEnd = Math.max(trimStart, Math.min(parseFloat(this.value) || videoDuration, videoDuration));
      updateTrimLabels();
      updateTrimRangeUI();
    });
  }

  updateTrimRangeUI();
}

function renderCompressTab(content) {
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
      compressCrf = parseInt(this.value);
      if (crfLabel) crfLabel.textContent = compressCrf;
    });
  }
  let scaleSelect = document.getElementById('veScaleSelect');
  if (scaleSelect) {
    scaleSelect.addEventListener('change', function () {
      compressScale = parseFloat(this.value);
    });
  }
}

function renderConvertTab(content) {
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
      convertFormat = this.value;
    });
  }
}

function renderSpeedTab(content) {
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
      speedValue = parseFloat(this.value);
      if (speedLabel) speedLabel.textContent = speedValue + 'x';
      updateSpeedPresets();
    });
  }

  content.querySelectorAll('.ve-preset-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      speedValue = parseFloat(this.dataset.speed);
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

function renderWatermarkTab(content) {
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
  if (wmText) wmText.addEventListener('input', function () { watermarkText = this.value; });

  let wmPos = document.getElementById('veWmPosition');
  if (wmPos) wmPos.addEventListener('change', function () { watermarkPosition = this.value; });

  let wmColor = document.getElementById('veWmColor');
  if (wmColor) wmColor.addEventListener('input', function () { watermarkColor = this.value; });

  let wmSize = document.getElementById('veWmFontSize');
  let wmSizeLabel = document.getElementById('veWmFontSizeLabel');
  if (wmSize) {
    wmSize.addEventListener('input', function () {
      watermarkFontSize = parseInt(this.value);
      if (wmSizeLabel) wmSizeLabel.textContent = watermarkFontSize;
    });
  }
}

function renderSnapshotTab(content) {
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
            import('./overlay/overlay-images.js').then(function (mod) {
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

function renderFilterTab(content) {
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
  bindSlider('veFiltBright', function (v) { filterBrightness = v; });
  bindSlider('veFiltContrast', function (v) { filterContrast = v; });
  bindSlider('veFiltSatur', function (v) { filterSaturation = v; });
  bindSlider('veFiltBlur', function (v) { filterBlur = v; });
  bindSlider('veFiltSharp', function (v) { filterSharpen = v; });
}

function renderAdvancedTab(content) {
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
  bindSlider('veCropX', function (v) { cropX = v / 100; document.getElementById('veCropXVal').textContent = v + '%'; });
  bindSlider('veCropY', function (v) { cropY = v / 100; document.getElementById('veCropYVal').textContent = v + '%'; });
  bindSlider('veCropW', function (v) { cropW = v / 100; document.getElementById('veCropWVal').textContent = v + '%'; });
  bindSlider('veCropH', function (v) { cropH = v / 100; document.getElementById('veCropHVal').textContent = v + '%'; });

  // 旋转按钮
  content.querySelectorAll('[data-angle]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      rotateAngle = parseInt(this.dataset.angle);
      updateRotatePresets();
      updatePreview();
    });
  });

  // 翻转按钮
  content.querySelectorAll('[data-flip]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      flipDirection = flipDirection === this.dataset.flip ? '' : this.dataset.flip;
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

function renderAudioTab(content) {
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
  if (fmtSelect) fmtSelect.addEventListener('change', function () { audioFormat = this.value; });

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
      audioVolume = parseFloat(this.value) / 100;
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

function renderGifTab(content) {
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

  bindInputNumber('veGifStart', function (v) { gifStartTime = v; });
  bindInputNumber('veGifDur', function (v) { gifDuration = v; });
  bindSlider('veGifFps', function (v) { gifFps = v; document.getElementById('veGifFpsLabel').textContent = v; });
  bindSlider('veGifWidth', function (v) { gifWidth = v; document.getElementById('veGifWidthLabel').textContent = v; });

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
            import('./overlay/overlay-images.js').then(function (mod) {
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

function renderSubtitleTab(content) {
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
  if (srtArea) srtArea.addEventListener('input', function () { srtContent = this.value; });

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
      srtContent = generateSRTTemplate();
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
function initPreview() {
  if (!previewVideo) return;

  previewVideo.addEventListener('loadedmetadata', function () {
    videoDuration = previewVideo.duration;
    trimEnd = videoDuration;
    let infoEl = document.getElementById('veVideoInfo');
    if (infoEl) {
      infoEl.textContent = previewVideo.videoWidth + 'x' + previewVideo.videoHeight + ' | ' + fmtTime(videoDuration);
    }
    updateTrimLabels();
    updateTrimRangeUI();
  });

  previewVideo.addEventListener('timeupdate', function () {
    let timeLabel = document.getElementById('veTimeLabel');
    let seekFill = document.getElementById('veSeekFill');
    if (timeLabel) timeLabel.textContent = fmtTime(previewVideo.currentTime) + ' / ' + fmtTime(videoDuration);
    if (seekFill && videoDuration > 0) {
      seekFill.style.width = (previewVideo.currentTime / videoDuration * 100) + '%';
    }
    // 更新截图 tab 的时间
    let snapTime = document.getElementById('veSnapTime');
    if (snapTime) snapTime.textContent = fmtTimeFull(previewVideo.currentTime);
  });

  previewVideo.addEventListener('play', function () {
    let btn = videoEditorModal.querySelector('.ve-play-btn');
    if (btn) btn.textContent = '❚❚';
  });
  previewVideo.addEventListener('pause', function () {
    let btn = videoEditorModal.querySelector('.ve-play-btn');
    if (btn) btn.textContent = '▶';
  });
}

// ── 实时预览：根据当前 Tab 参数动态更新视频画面 ──
function updatePreview() {
  if (!previewVideo) return;

  // 重置所有效果
  let cssFilters = [];
  let transform = '';

  // === 滤镜 Tab 的效果 ===
  if (activeFilters.grayscale) cssFilters.push('grayscale(100%)');
  if (activeFilters.sepia) cssFilters.push('sepia(100%)');
  if (activeFilters.invert) cssFilters.push('invert(100%)');
  if (activeFilters.warm) {
    cssFilters.push('sepia(20%)', 'saturate(1.2)');
    cssFilters.push('brightness(1.05)', 'contrast(1.05)');
  }
  if (activeFilters.cool) {
    cssFilters.push('saturate(0.9)');
    cssFilters.push('brightness(0.98)', 'contrast(1.03)');
  }
  if (activeFilters.vignette) cssFilters.push('brightness(0.85)');
  if (activeFilters.noise) { /* CSS 无法模拟噪点，需 FFmpeg */ }

  // 参数滑块（始终生效，不受 Tab 切换影响）
  cssFilters.push('brightness(' + (filterBrightness / 50 + 0.5) + ')');
  cssFilters.push('contrast(' + (filterContrast / 50 + 0.5) + ')');
  cssFilters.push('saturate(' + (filterSaturation / 50 + 0.5) + ')');
  if (filterBlur > 0) cssFilters.push('blur(' + filterBlur + 'px)');
  if (filterSharpen > 0) cssFilters.push('contrast(' + (1 + filterSharpen / 25) + ')');

  // === 变速 Tab ===
  if (previewVideo && speedValue > 0 && speedValue !== 1) {
    previewVideo.playbackRate = speedValue;
  } else if (previewVideo) {
    previewVideo.playbackRate = 1;
  }

  // === 高级 Tab：裁切 / 旋转 / 翻转 ===
  let transforms = [];
  if (cropX > 0 || cropY > 0 || cropW < 1 || cropH < 1) {
    // 用 clip-path 模拟裁切
    let left = cropX * 100;
    let top = cropY * 100;
    let right = 100 - (cropX + cropW) * 100;
    let bottom = 100 - (cropY + cropH) * 100;
    previewVideo.style.clipPath = 'inset(' + top + '% ' + right + '% ' + bottom + '% ' + left + '%)';
  } else {
    previewVideo.style.clipPath = '';
  }
  if (rotateAngle === 90) transforms.push('rotate(90deg)');
  else if (rotateAngle === 180) transforms.push('rotate(180deg)');
  else if (rotateAngle === 270) transforms.push('rotate(270deg)');
  if (flipDirection === 'h') transforms.push('scaleX(-1)');
  if (flipDirection === 'v') transforms.push('scaleY(-1)');
  transform = transforms.join(' ');

  // 应用
  previewVideo.style.filter = cssFilters.length > 0 ? cssFilters.join(' ') : '';
  previewVideo.style.transform = transform || '';

  // 像素化用 image-rendering 模拟
  if (activeFilters.pixelate) {
    previewVideo.style.imageRendering = 'pixelated';
    let px = Math.max(2, Math.round(activeFilters.pixelate ? 10 : 0));
    previewVideo.style.width = (previewVideo.videoWidth / px) + 'px';
    previewVideo.style.height = (previewVideo.videoHeight / px) + 'px';
  } else {
    previewVideo.style.imageRendering = '';
    previewVideo.style.width = '';
    previewVideo.style.height = '';
  }
}

// ── 进度条拖动 ──
function onSeekBarMouseDown(e) {
  let seekBar = document.getElementById('veSeekBar');
  if (!seekBar) return;

  // 检查是否点击了裁剪手柄
  if (activeTab === 'trim') {
    let handleStart = document.getElementById('veTrimHandleStart');
    let handleEnd = document.getElementById('veTrimHandleEnd');
    if (handleStart && handleStart.contains(e.target)) {
      trimDragging = 'start';
      e.preventDefault();
      document.addEventListener('mousemove', onTrimHandleMove);
      document.addEventListener('mouseup', onTrimHandleUp);
      return;
    }
    if (handleEnd && handleEnd.contains(e.target)) {
      trimDragging = 'end';
      e.preventDefault();
      document.addEventListener('mousemove', onTrimHandleMove);
      document.addEventListener('mouseup', onTrimHandleUp);
      return;
    }
  }

  // 普通拖动 seek
  seekToPosition(e, seekBar);
  function onMove(ev) { seekToPosition(ev, seekBar); }
  function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function seekToPosition(e, seekBar) {
  let rect = seekBar.getBoundingClientRect();
  let ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  if (previewVideo && videoDuration > 0) {
    previewVideo.currentTime = ratio * videoDuration;
  }
}

function onTrimHandleMove(e) {
  let seekBar = document.getElementById('veSeekBar');
  if (!seekBar || !videoDuration) return;
  let rect = seekBar.getBoundingClientRect();
  let ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  let time = ratio * videoDuration;

  if (trimDragging === 'start') {
    trimStart = Math.min(time, trimEnd - 0.1);
  } else if (trimDragging === 'end') {
    trimEnd = Math.max(time, trimStart + 0.1);
  }

  updateTrimLabels();
  updateTrimRangeUI();
}

function onTrimHandleUp() {
  trimDragging = null;
  document.removeEventListener('mousemove', onTrimHandleMove);
  document.removeEventListener('mouseup', onTrimHandleUp);
}

function updateTrimLabels() {
  let startLabel = document.getElementById('veTrimStartLabel');
  let endLabel = document.getElementById('veTrimEndLabel');
  let durLabel = document.getElementById('veTrimDurLabel');
  if (startLabel) startLabel.textContent = fmtTimeFull(trimStart);
  if (endLabel) endLabel.textContent = fmtTimeFull(trimEnd || videoDuration);
  if (durLabel) durLabel.textContent = fmtTimeFull((trimEnd || videoDuration) - trimStart);
}

function updateTrimRangeUI() {
  let range = document.getElementById('veTrimRange');
  if (!range || !videoDuration) return;

  let startPct = (trimStart / videoDuration) * 100;
  let endPct = ((trimEnd || videoDuration) / videoDuration) * 100;
  range.style.left = startPct + '%';
  range.style.width = (endPct - startPct) + '%';
}

// ── 应用操作 ──
async function onApply() {
  if (isProcessing || !editorVideoData) return;

  if (activeTab === 'snapshot') return; // 截图有自己的按钮

  setProcessing(true, '准备中...');

  // 确保 FFmpeg 已加载
  if (!isFFmpegLoaded()) {
    setProcessing(true, '正在加载 FFmpeg 引擎（首次加载约 30MB）...');
  }

  try {
    let result;

    if (activeTab === 'trim') {
      let dur = (trimEnd || videoDuration) - trimStart;
      if (dur <= 0.1) { setProcessing(false); return; }
      setProcessing(true, '裁剪中...');
      result = await trimVideo(
        editorVideoData.src, editorVideoData.srcType,
        trimStart, dur,
        function (p) { setProcessing(true, '裁剪中... ' + Math.round(p * 100) + '%'); }
      );
    } else if (activeTab === 'compress') {
      setProcessing(true, '压缩中...');
      result = await compressVideo(
        editorVideoData.src, editorVideoData.srcType,
        compressCrf, compressScale,
        function (p) { setProcessing(true, '压缩中... ' + Math.round(p * 100) + '%'); }
      );
    } else if (activeTab === 'convert') {
      setProcessing(true, '转码中...');
      result = await convertVideo(
        editorVideoData.src, editorVideoData.srcType,
        convertFormat,
        function (p) { setProcessing(true, '转码中... ' + Math.round(p * 100) + '%'); }
      );
    } else if (activeTab === 'speed') {
      if (speedValue === 1) { setProcessing(false); return; }
      setProcessing(true, '变速处理中...');
      result = await changeSpeed(
        editorVideoData.src, editorVideoData.srcType,
        speedValue,
        function (p) { setProcessing(true, '变速处理中... ' + Math.round(p * 100) + '%'); }
      );
    } else if (activeTab === 'watermark') {
      if (!watermarkText.trim()) { setProcessing(false); return; }
      setProcessing(true, '添加水印中...');
      result = await addTextWatermark(
        editorVideoData.src, editorVideoData.srcType,
        watermarkText, watermarkPosition, watermarkColor, watermarkFontSize,
        function (p) { setProcessing(true, '添加水印中... ' + Math.round(p * 100) + '%'); }
      );
    } else if (activeTab === 'filter') {
      setProcessing(true, '应用滤镜中...');
      let filters = [];
      for (let k in activeFilters) { if (activeFilters[k]) filters.push({ type: k }); }
      if (filterBrightness !== 50) filters.push({ type: 'brightness', value: filterBrightness });
      if (filterContrast !== 50) filters.push({ type: 'contrast', value: filterContrast });
      if (filterSaturation !== 50) filters.push({ type: 'saturation', value: filterSaturation });
      if (filterBlur > 0) filters.push({ type: 'blur', value: filterBlur });
      if (filterSharpen > 0) filters.push({ type: 'sharpen', value: filterSharpen });
      if (filters.length === 0) { setProcessing(false); return; }
      result = await applyVideoFilter(
        editorVideoData.src, editorVideoData.srcType, filters,
        function (p) { setProcessing(true, '应用滤镜... ' + Math.round(p * 100) + '%'); }
      );
    } else if (activeTab === 'advanced') {
      // 裁切
      let needCrop = cropX > 0 || cropY > 0 || cropW < 1 || cropH < 1;
      // 旋转
      let needRotate = rotateAngle !== 0;
      // 翻转
      let needFlip = flipDirection !== '';
      if (!needCrop && !needRotate && !needFlip) { setProcessing(false); return; }

      if (needCrop) {
        setProcessing(true, '裁切画面...');
        result = await cropFrameArea(
          editorVideoData.src, editorVideoData.srcType,
          cropX, cropY, cropW, cropH,
          function (p) { setProcessing(true, '裁切中... ' + Math.round(p * 100) + '%'); }
        );
        editorVideoData.src = result.dataUrl; editorVideoData.srcType = 'dataUrl';
      }
      if (needRotate) {
        setProcessing(true, '旋转中...');
        result = await rotateVideo(
          editorVideoData.src, editorVideoData.srcType, rotateAngle,
          function (p) { setProcessing(true, '旋转中... ' + Math.round(p * 100) + '%'); }
        );
        editorVideoData.src = result.dataUrl; editorVideoData.srcType = 'dataUrl';
      }
      if (needFlip) {
        setProcessing(true, '翻转中...');
        result = await flipVideo(
          editorVideoData.src, editorVideoData.srcType, flipDirection,
          function (p) { setProcessing(true, '翻转中... ' + Math.round(p * 100) + '%'); }
        );
        editorVideoData.src = result.dataUrl; editorVideoData.srcType = 'dataUrl';
      }
    } else if (activeTab === 'audio') {
      // 音频操作有独立按钮处理（提取/音量），此处不重复
      return;
    } else if (activeTab === 'gif') {
      // GIF 有独立按钮
      return;
    } else if (activeTab === 'subtitle') {
      // 字幕有独立按钮
      return;
    }

    if (result && result.dataUrl) {
      // 更新视频数据
      editorVideoData.src = result.dataUrl;
      editorVideoData.srcType = 'dataUrl';
      if (result.mimeType) {
        // 转码后可能格式变化
      }
      // 更新预览
      if (previewVideo) {
        previewVideo.src = result.dataUrl;
        // 清除所有 CSS 预览效果（已写入视频本身）
        previewVideo.style.filter = '';
        previewVideo.style.transform = '';
        previewVideo.style.clipPath = '';
        previewVideo.style.imageRendering = '';
        previewVideo.style.width = '';
        previewVideo.style.height = '';
        previewVideo.playbackRate = 1;
      }
      // 重置参数为默认值，避免效果叠加
      activeFilters = {};
      filterBrightness = 50; filterContrast = 50; filterSaturation = 50;
      filterBlur = 0; filterSharpen = 0;
      speedValue = 1; rotateAngle = 0; flipDirection = '';
      cropX = 0; cropY = 0; cropW = 1; cropH = 1;
      transactRender();
    }
  } catch (e) {
    console.error('[VideoEditor] 处理失败:', e);
  } finally {
    setProcessing(false);
  }
}

// ── 处理状态 ──
function setProcessing(processing, label) {
  isProcessing = processing;
  let progressWrap = document.getElementById('veProgressWrap');
  let progressLabel = document.getElementById('veProgressLabel');
  let applyBtn = document.getElementById('veApplyBtn');

  if (progressWrap) progressWrap.style.display = processing ? 'block' : 'none';
  if (progressLabel) progressLabel.textContent = label || '';
  if (applyBtn) {
    applyBtn.disabled = processing;
    applyBtn.textContent = processing ? '处理中...' : '应用';
  }
}

// ── 关闭 ──
function onEscKey(e) {
  if (e.key === 'Escape') closeVideoEditor();
}

function closeVideoEditor() {
  if (previewVideo) {
    previewVideo.pause();
    previewVideo.src = '';
  }
  if (videoEditorModal) {
    videoEditorModal.remove();
    videoEditorModal = null;
  }
  editorVideoData = null;
  document.removeEventListener('keydown', onEscKey);
}
