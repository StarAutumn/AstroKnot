// ============================================================
//  overlay-video.js — 视频播放器 overlay 类型
// ============================================================
import { overlayImages, getNextZIndex, ensureOverlay, renderAll, transactRender, selectImage, getInsertY, getInsertX } from './overlay-images.js';
import { getActiveBlockId, getBlockWidth, pxToPct } from './overlay-block.js';

let _videoInput = null;

function getVideoInput() {
  if (!_videoInput) {
    _videoInput = document.createElement('input');
    _videoInput.type = 'file';
    _videoInput.accept = 'video/*';
    _videoInput.style.display = 'none';
    document.body.appendChild(_videoInput);
    _videoInput.addEventListener('change', function () {
      if (this.files && this.files[0]) {
        addVideoFromFile(this.files[0]);
        this.value = '';
      }
    });
  }
  return _videoInput;
}

export function openVideoPicker() {
  getVideoInput().click();
}

export function addVideoFromFile(file) {
  if (!file || !file.type.startsWith('video/')) return;
  let blockId = getActiveBlockId();
  let blockW = blockId ? getBlockWidth(blockId) : 800;
  let w = Math.min(480, blockW - 40);
  let h = Math.round(w * 9 / 16);
  let x = Math.max(0, (blockW - w) / 2);
  let y = getInsertY();
  let reader = new FileReader();
  reader.onload = function (e) {
    let dataUrl = e.target.result;
    let videoData = {
      type: 'video',
      id: 'oly-video-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
      blockId: blockId,
      src: dataUrl,
      srcType: 'dataUrl',
      fileName: file.name,
      x: x,
      y: y,
      width: w,
      height: h,
      zIndex: getNextZIndex(),
      autoplay: false,
      loop: false,
      muted: false,
      volume: 1,
      leftPct: pxToPct(x, blockW),
      widthPct: pxToPct(w, blockW),
      _refWidth: blockW
    };
    overlayImages.push(videoData);
    selectImage(videoData.id);
    transactRender();
  };
  reader.readAsDataURL(file);
}

export function addVideoFromUrl(url) {
  let blockId = getActiveBlockId();
  let blockW = blockId ? getBlockWidth(blockId) : 800;
  let w = Math.min(480, blockW - 40);
  let h = Math.round(w * 9 / 16);
  let x = Math.max(0, (blockW - w) / 2);
  let y = getInsertY();
  let videoData = {
    type: 'video',
    id: 'oly-video-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
    blockId: blockId,
    src: url,
    srcType: 'url',
    fileName: '',
    x: x,
    y: y,
    width: w,
    height: h,
    zIndex: getNextZIndex(),
    autoplay: false,
    loop: false,
    muted: false,
    volume: 1,
    leftPct: pxToPct(x, blockW),
    widthPct: pxToPct(w, blockW),
    _refWidth: blockW
  };
  overlayImages.push(videoData);
  selectImage(videoData.id);
  transactRender();
}

export function renderVideoContent(item, imgData) {
  let wrapper = document.createElement('div');
  wrapper.style.cssText = 'width:100%;height:100%;position:relative;overflow:hidden;background:#000;border-radius:4px;';

  // 视频元素
  let video = document.createElement('video');
  video.src = imgData.src;
  video.preload = 'metadata';
  video.playsInline = true;
  video.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block;';
  // 不在 video 上 stopPropagation，让父级拖拽系统能接收到 mousedown
  video.dataset.olyVideoId = imgData.id;

  // 控制栏
  let controls = document.createElement('div');
  controls.className = 'oly-video-controls';
  controls.style.cssText =
    'position:absolute;bottom:0;left:0;right:0;' +
    'background:linear-gradient(transparent,rgba(0,0,0,0.85));' +
    'padding:6px 10px;display:flex;align-items:center;gap:8px;' +
    'opacity:0;transition:opacity 0.2s;pointer-events:auto;z-index:5;';

  wrapper.addEventListener('mouseenter', function () { controls.style.opacity = '1'; });
  wrapper.addEventListener('mouseleave', function () { if (!video.paused) controls.style.opacity = '0'; });

  // 播放/暂停
  let playBtn = document.createElement('div');
  playBtn.innerHTML = '&#9654;';
  playBtn.style.cssText = 'color:#fff;font-size:14px;cursor:pointer;width:24px;text-align:center;flex-shrink:0;';
  playBtn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  playBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    if (video.paused) { video.play(); } else { video.pause(); }
  });

  // 进度条
  let progressWrap = document.createElement('div');
  progressWrap.style.cssText =
    'flex:1;height:4px;background:rgba(255,255,255,0.2);border-radius:2px;cursor:pointer;position:relative;';
  let progressFill = document.createElement('div');
  progressFill.style.cssText = 'height:100%;background:var(--accent,#0ff);border-radius:2px;width:0%;pointer-events:none;';
  progressWrap.appendChild(progressFill);
  progressWrap.addEventListener('mousedown', function (e) {
    e.stopPropagation();
    let rect = progressWrap.getBoundingClientRect();
    let ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    if (video.duration) video.currentTime = ratio * video.duration;
  });

  // 时间
  let timeLabel = document.createElement('div');
  timeLabel.style.cssText = 'color:#ccc;font-size:11px;flex-shrink:0;font-family:monospace;min-width:70px;text-align:center;';
  function fmtTime(s) {
    if (!s || isNaN(s)) return '0:00';
    let m = Math.floor(s / 60);
    let sec = Math.floor(s % 60);
    return m + ':' + (sec < 10 ? '0' : '') + sec;
  }
  timeLabel.textContent = '0:00 / 0:00';

  // 音量
  let volBtn = document.createElement('div');
  volBtn.innerHTML = '&#128264;';
  volBtn.style.cssText = 'color:#fff;font-size:13px;cursor:pointer;flex-shrink:0;';
  volBtn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  volBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    video.muted = !video.muted;
    imgData.muted = video.muted;
    volBtn.innerHTML = video.muted ? '&#128263;' : '&#128264;';
  });

  // 循环
  let loopBtn = document.createElement('div');
  loopBtn.innerHTML = '&#8635;';
  loopBtn.style.cssText = 'color:' + (imgData.loop ? 'var(--accent,#0ff)' : '#888') + ';font-size:14px;cursor:pointer;flex-shrink:0;';
  loopBtn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  loopBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    video.loop = !video.loop;
    imgData.loop = video.loop;
    loopBtn.style.color = video.loop ? 'var(--accent,#0ff)' : '#888';
  });

  // 全屏
  let fsBtn = document.createElement('div');
  fsBtn.innerHTML = '&#9974;';
  fsBtn.style.cssText = 'color:#fff;font-size:13px;cursor:pointer;flex-shrink:0;';
  fsBtn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  fsBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    if (wrapper.requestFullscreen) wrapper.requestFullscreen();
    else if (wrapper.webkitRequestFullscreen) wrapper.webkitRequestFullscreen();
  });

  controls.appendChild(playBtn);
  controls.appendChild(progressWrap);
  controls.appendChild(timeLabel);
  controls.appendChild(volBtn);
  controls.appendChild(loopBtn);
  controls.appendChild(fsBtn);

  // 居中播放按钮（暂停时显示）
  let centerPlay = document.createElement('div');
  centerPlay.innerHTML = '&#9654;';
  centerPlay.style.cssText =
    'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);' +
    'width:48px;height:48px;border-radius:50%;' +
    'background:rgba(0,0,0,0.6);border:2px solid rgba(255,255,255,0.5);' +
    'color:#fff;font-size:20px;display:flex;align-items:center;justify-content:center;' +
    'cursor:pointer;pointer-events:auto;z-index:4;transition:opacity 0.2s;' +
    'padding-left:3px;';
  centerPlay.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  centerPlay.addEventListener('click', function (e) {
    e.stopPropagation();
    video.play();
  });

  // 视频事件
  video.addEventListener('play', function () {
    playBtn.innerHTML = '&#10074;&#10074;';
    centerPlay.style.opacity = '0';
    centerPlay.style.pointerEvents = 'none';
    controls.style.opacity = '1';
  });
  video.addEventListener('pause', function () {
    playBtn.innerHTML = '&#9654;';
    centerPlay.style.opacity = '1';
    centerPlay.style.pointerEvents = 'auto';
  });
  video.addEventListener('ended', function () {
    if (!video.loop) {
      playBtn.innerHTML = '&#9654;';
      centerPlay.style.opacity = '1';
      centerPlay.style.pointerEvents = 'auto';
    }
  });
  video.addEventListener('timeupdate', function () {
    if (video.duration) {
      let pct = (video.currentTime / video.duration) * 100;
      progressFill.style.width = pct + '%';
      timeLabel.textContent = fmtTime(video.currentTime) + ' / ' + fmtTime(video.duration);
    }
  });
  video.addEventListener('loadedmetadata', function () {
    timeLabel.textContent = '0:00 / ' + fmtTime(video.duration);
  });

  // 恢复状态
  video.volume = imgData.volume ?? 1;
  video.muted = imgData.muted ?? false;
  video.loop = imgData.loop ?? false;
  if (imgData.muted) volBtn.innerHTML = '&#128263;';
  if (imgData.loop) loopBtn.style.color = 'var(--accent,#0ff)';

  wrapper.appendChild(video);
  wrapper.appendChild(centerPlay);
  wrapper.appendChild(controls);
  item.appendChild(wrapper);
}
