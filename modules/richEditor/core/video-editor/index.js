// ============================================================
//  video-editor.js — 视频编辑器 UI（基于 FFmpeg.wasm）
//  功能：裁剪、压缩、转码、变速、水印、截图、滤镜、高级剪辑、音频、GIF、字幕
// ============================================================
// ------------------------------------------------------------
//  拆分后的文件夹结构（本文件为主入口，对外仅导出 openVideoEditor）：
//    share.js    模块级可变状态中枢 + 工具函数（fmtTime/fmtTimeFull）
//    preview.js  预览初始化 / 实时预览 / 进度条与裁剪手柄拖动
//    tabs.js     各标签页内容渲染 + 滑块/数字输入绑定
//    ui.js       弹窗 DOM 构建与 Tab 切换
//    index.js    打开/应用/处理状态/关闭生命周期编排（本文件）
//  说明：onApply/setProcessing/onEscKey/closeVideoEditor 因被 ui.js、
//  tabs.js 内部引用而导出（同 overlay-audio-editor 的 closeAudioEditor 模式），
//  对外 API 仍只有 openVideoEditor。
// ------------------------------------------------------------

import { transactRender } from '../overlay/overlay-images/index.js';
import {
  generateSRTTemplate, isFFmpegLoaded,
  trimVideo, compressVideo, convertVideo,
  changeSpeed, addTextWatermark,
  applyVideoFilter, cropFrameArea, rotateVideo, flipVideo
} from '../ffmpeg-service.js';
import {
  videoEditorModal, setVideoEditorModal,
  editorVideoData, setEditorVideoData,
  previewVideo, videoDuration,
  activeTab, setActiveTab,
  isProcessing, setIsProcessing,
  trimStart, setTrimStart, trimEnd, setTrimEnd,
  compressCrf, setCompressCrf, compressScale, setCompressScale,
  convertFormat, setConvertFormat,
  speedValue, setSpeedValue,
  watermarkText, setWatermarkText, watermarkPosition, setWatermarkPosition,
  watermarkColor, setWatermarkColor, watermarkFontSize, setWatermarkFontSize,
  activeFilters, setActiveFilters,
  filterBrightness, setFilterBrightness, filterContrast, setFilterContrast,
  filterSaturation, setFilterSaturation,
  filterBlur, setFilterBlur, filterSharpen, setFilterSharpen,
  cropX, setCropX, cropY, setCropY, cropW, setCropW, cropH, setCropH,
  rotateAngle, setRotateAngle, flipDirection, setFlipDirection,
  setAudioFormat, setAudioVolume, setReplaceAudioFile,
  setGifStartTime, setGifDuration, setGifFps, setGifWidth,
  setSrtContent, setSubStyle
} from './share.js';
import { buildUI } from './ui.js';
import { initPreview } from './preview.js';

// ── 主入口 ──
export function openVideoEditor(imgData) {
  if (!imgData || imgData.type !== 'video') return;
  setEditorVideoData(imgData);
  setActiveTab('trim');

  // 重置参数
  setTrimStart(0);
  setTrimEnd(0);
  setCompressCrf(28);
  setCompressScale(1);
  setConvertFormat('webm');
  setSpeedValue(1);
  setWatermarkText('');
  setWatermarkPosition('bottom-right');
  setWatermarkColor('#ffffff');
  setWatermarkFontSize(24);
  setActiveFilters({});
  setFilterBrightness(50); setFilterContrast(50); setFilterSaturation(50);
  setFilterBlur(0); setFilterSharpen(0);
  setCropX(0); setCropY(0); setCropW(1); setCropH(1);
  setRotateAngle(0); setFlipDirection('');
  setAudioFormat('mp3'); setAudioVolume(1.0); setReplaceAudioFile(null);
  setGifStartTime(0); setGifDuration(5); setGifFps(15); setGifWidth(480);
  setSrtContent(generateSRTTemplate());
  setSubStyle({ fontSize: 24, color: '#ffffff', position: 'bottom', outlineColor: '#000000' });

  buildUI();
  document.body.appendChild(videoEditorModal);
  initPreview();
}

// ── 应用操作 ──
export async function onApply() {
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
      setActiveFilters({});
      setFilterBrightness(50); setFilterContrast(50); setFilterSaturation(50);
      setFilterBlur(0); setFilterSharpen(0);
      setSpeedValue(1); setRotateAngle(0); setFlipDirection('');
      setCropX(0); setCropY(0); setCropW(1); setCropH(1);
      transactRender();
    }
  } catch (e) {
    console.error('[VideoEditor] 处理失败:', e);
  } finally {
    setProcessing(false);
  }
}

// ── 处理状态 ──
export function setProcessing(processing, label) {
  setIsProcessing(processing);
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
export function onEscKey(e) {
  if (e.key === 'Escape') closeVideoEditor();
}

export function closeVideoEditor() {
  if (previewVideo) {
    previewVideo.pause();
    previewVideo.src = '';
  }
  if (videoEditorModal) {
    videoEditorModal.remove();
    setVideoEditorModal(null);
  }
  setEditorVideoData(null);
  document.removeEventListener('keydown', onEscKey);
}
