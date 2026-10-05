// ============================================================
//  video-editor/share.js — 视频编辑器共享层
//  模块级可变状态中枢：ESM live binding 供各文件读取，写入统一走 set* 导出
//  + 工具函数（fmtTime/fmtTimeFull）
// ============================================================

// ── 状态 ──
export let videoEditorModal = null;
export let editorVideoData = null;
export let previewVideo = null;
export let videoDuration = 0;
export let activeTab = 'trim';
export let isProcessing = false;

// 裁剪参数
export let trimStart = 0;
export let trimEnd = 0;
export let trimDragging = null; // 'start' | 'end' | null

// 压缩参数
export let compressCrf = 28;
export let compressScale = 1;

// 转码参数
export let convertFormat = 'webm';

// 变速参数
export let speedValue = 1;

// 水印参数
export let watermarkText = '';
export let watermarkPosition = 'bottom-right';
export let watermarkColor = '#ffffff';
export let watermarkFontSize = 24;

// 滤镜参数
export let activeFilters = {}; // { grayscale: false, sepia: false, brightness: 50, ... }
export let filterBrightness = 50;
export let filterContrast = 50;
export let filterSaturation = 50;
export let filterBlur = 0;
export let filterSharpen = 0;

// 高级剪辑参数
export let cropX = 0;
export let cropY = 0;
export let cropW = 1;
export let cropH = 1;
export let rotateAngle = 0; // 90/180/270
export let flipDirection = ''; // 'h' | 'v'

// 音频参数
export let audioFormat = 'mp3';
export let audioVolume = 1.0;
export let replaceAudioFile = null;

// GIF 参数
export let gifStartTime = 0;
export let gifDuration = 5;
export let gifFps = 15;
export let gifWidth = 480;

// 字幕参数
export let srtContent = '';
export let subStyle = { fontSize: 24, color: '#ffffff', position: 'bottom', outlineColor: '#000000' };

// ── 状态写入 setter ──
export function setVideoEditorModal(v) { videoEditorModal = v; }
export function setEditorVideoData(v) { editorVideoData = v; }
export function setPreviewVideo(v) { previewVideo = v; }
export function setVideoDuration(v) { videoDuration = v; }
export function setActiveTab(v) { activeTab = v; }
export function setIsProcessing(v) { isProcessing = v; }
export function setTrimStart(v) { trimStart = v; }
export function setTrimEnd(v) { trimEnd = v; }
export function setTrimDragging(v) { trimDragging = v; }
export function setCompressCrf(v) { compressCrf = v; }
export function setCompressScale(v) { compressScale = v; }
export function setConvertFormat(v) { convertFormat = v; }
export function setSpeedValue(v) { speedValue = v; }
export function setWatermarkText(v) { watermarkText = v; }
export function setWatermarkPosition(v) { watermarkPosition = v; }
export function setWatermarkColor(v) { watermarkColor = v; }
export function setWatermarkFontSize(v) { watermarkFontSize = v; }
export function setActiveFilters(v) { activeFilters = v; }
export function setFilterBrightness(v) { filterBrightness = v; }
export function setFilterContrast(v) { filterContrast = v; }
export function setFilterSaturation(v) { filterSaturation = v; }
export function setFilterBlur(v) { filterBlur = v; }
export function setFilterSharpen(v) { filterSharpen = v; }
export function setCropX(v) { cropX = v; }
export function setCropY(v) { cropY = v; }
export function setCropW(v) { cropW = v; }
export function setCropH(v) { cropH = v; }
export function setRotateAngle(v) { rotateAngle = v; }
export function setFlipDirection(v) { flipDirection = v; }
export function setAudioFormat(v) { audioFormat = v; }
export function setAudioVolume(v) { audioVolume = v; }
export function setReplaceAudioFile(v) { replaceAudioFile = v; }
export function setGifStartTime(v) { gifStartTime = v; }
export function setGifDuration(v) { gifDuration = v; }
export function setGifFps(v) { gifFps = v; }
export function setGifWidth(v) { gifWidth = v; }
export function setSrtContent(v) { srtContent = v; }
export function setSubStyle(v) { subStyle = v; }

// ── 工具函数 ──
export function fmtTime(s) {
  if (!s || isNaN(s)) return '0:00';
  let m = Math.floor(s / 60);
  let sec = Math.floor(s % 60);
  return m + ':' + (sec < 10 ? '0' : '') + sec;
}

export function fmtTimeFull(s) {
  if (!s || isNaN(s)) return '0:00.0';
  let m = Math.floor(s / 60);
  let sec = Math.floor(s % 60);
  let ms = Math.floor((s % 1) * 10);
  return m + ':' + (sec < 10 ? '0' : '') + sec + '.' + ms;
}
