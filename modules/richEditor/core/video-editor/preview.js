// ============================================================
//  video-editor/preview.js — 视频预览与进度条
//  initPreview（loadedmetadata/timeupdate/play/pause 事件绑定）
//  updatePreview（按当前 Tab 参数实时应用 CSS 滤镜/裁切/旋转/翻转）
//  + 进度条拖动与裁剪手柄（onSeekBarMouseDown/seekToPosition/onTrimHandle*）
//  + updateTrimLabels / updateTrimRangeUI
// ============================================================

import {
  videoEditorModal, previewVideo, videoDuration, activeTab,
  trimStart, trimEnd, trimDragging,
  activeFilters,
  filterBrightness, filterContrast, filterSaturation, filterBlur, filterSharpen,
  speedValue,
  cropX, cropY, cropW, cropH, rotateAngle, flipDirection,
  fmtTime, fmtTimeFull,
  setVideoDuration, setTrimStart, setTrimEnd, setTrimDragging
} from './share.js';

export function initPreview() {
  if (!previewVideo) return;

  previewVideo.addEventListener('loadedmetadata', function () {
    setVideoDuration(previewVideo.duration);
    setTrimEnd(videoDuration);
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
export function updatePreview() {
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
export function onSeekBarMouseDown(e) {
  let seekBar = document.getElementById('veSeekBar');
  if (!seekBar) return;

  // 检查是否点击了裁剪手柄
  if (activeTab === 'trim') {
    let handleStart = document.getElementById('veTrimHandleStart');
    let handleEnd = document.getElementById('veTrimHandleEnd');
    if (handleStart && handleStart.contains(e.target)) {
      setTrimDragging('start');
      e.preventDefault();
      document.addEventListener('mousemove', onTrimHandleMove);
      document.addEventListener('mouseup', onTrimHandleUp);
      return;
    }
    if (handleEnd && handleEnd.contains(e.target)) {
      setTrimDragging('end');
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
    setTrimStart(Math.min(time, trimEnd - 0.1));
  } else if (trimDragging === 'end') {
    setTrimEnd(Math.max(time, trimStart + 0.1));
  }

  updateTrimLabels();
  updateTrimRangeUI();
}

function onTrimHandleUp() {
  setTrimDragging(null);
  document.removeEventListener('mousemove', onTrimHandleMove);
  document.removeEventListener('mouseup', onTrimHandleUp);
}

export function updateTrimLabels() {
  let startLabel = document.getElementById('veTrimStartLabel');
  let endLabel = document.getElementById('veTrimEndLabel');
  let durLabel = document.getElementById('veTrimDurLabel');
  if (startLabel) startLabel.textContent = fmtTimeFull(trimStart);
  if (endLabel) endLabel.textContent = fmtTimeFull(trimEnd || videoDuration);
  if (durLabel) durLabel.textContent = fmtTimeFull((trimEnd || videoDuration) - trimStart);
}

export function updateTrimRangeUI() {
  let range = document.getElementById('veTrimRange');
  if (!range || !videoDuration) return;

  let startPct = (trimStart / videoDuration) * 100;
  let endPct = ((trimEnd || videoDuration) / videoDuration) * 100;
  range.style.left = startPct + '%';
  range.style.width = (endPct - startPct) + '%';
}
