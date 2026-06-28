// ============================================================
//  ffmpeg-service.js — FFmpeg.wasm 服务层
//  提供 FFmpeg 实例管理、视频裁剪/压缩/转码/截图等核心操作
// ============================================================

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL, fetchFile } from '@ffmpeg/util';

let ffmpeg = null;
let loaded = false;
let loading = false;

/**
 * 获取已初始化的 FFmpeg 实例（懒加载，首次调用时加载 wasm）
 */
export async function getFFmpeg() {
  if (loaded && ffmpeg) return ffmpeg;
  if (loading) {
    // 等待正在进行的加载完成
    return new Promise(function (resolve, reject) {
      let check = setInterval(function () {
        if (loaded && ffmpeg) { clearInterval(check); resolve(ffmpeg); }
      }, 100);
      setTimeout(function () { clearInterval(check); reject(new Error('FFmpeg 加载超时')); }, 60000);
    });
  }

  loading = true;
  ffmpeg = new FFmpeg();

  ffmpeg.on('log', function (_ref) {
    // 可选：输出 FFmpeg 日志
    // console.log('[FFmpeg]', _ref.message);
  });

  ffmpeg.on('progress', function (_ref) {
    // 进度回调，由各操作自行监听
  });

  try {
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
    await ffmpeg.load({
      coreURL: await toBlobURL(baseURL + '/ffmpeg-core.js', 'text/javascript'),
      wasmURL: await toBlobURL(baseURL + '/ffmpeg-core.wasm', 'application/wasm'),
    });
    loaded = true;
    console.log('[FFmpeg] 加载完成');
    return ffmpeg;
  } catch (e) {
    console.error('[FFmpeg] 加载失败:', e);
    ffmpeg = null;
    loaded = false;
    throw e;
  } finally {
    loading = false;
  }
}

/**
 * 检查 FFmpeg 是否已加载
 */
export function isFFmpegLoaded() {
  return loaded;
}

// ── 工具函数 ──

function fmtTimeFFmpeg(seconds) {
  if (!seconds || isNaN(seconds) || seconds < 0) return '00:00:00';
  let h = Math.floor(seconds / 3600);
  let m = Math.floor((seconds % 3600) / 60);
  let s = Math.floor(seconds % 60);
  let ms = Math.floor((seconds % 1) * 100);
  return String(h).padStart(2, '0') + ':' +
         String(m).padStart(2, '0') + ':' +
         String(s).padStart(2, '0') + '.' +
         String(ms).padStart(2, '0');
}

function dataUrlToUint8Array(dataUrl) {
  let base64 = dataUrl.split(',')[1];
  let binary = atob(base64);
  let bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function uint8ArrayToDataUrl(bytes, mimeType) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return 'data:' + mimeType + ';base64,' + btoa(binary);
}

// ── 视频操作 API ──

/**
 * 裁剪视频（精确时间范围）
 * @param {string} src - 视频源（dataUrl 或 URL）
 * @param {string} srcType - 'dataUrl' | 'url'
 * @param {number} startTime - 起始时间（秒）
 * @param {number} duration - 持续时间（秒）
 * @param {function} onProgress - 进度回调 (ratio: 0~1)
 * @returns {Promise<{dataUrl: string, duration: number}>}
 */
export async function trimVideo(src, srcType, startTime, duration, onProgress) {
  const ff = await getFFmpeg();

  // 写入输入文件
  let inputData;
  if (srcType === 'dataUrl') {
    inputData = dataUrlToUint8Array(src);
  } else {
    inputData = await fetchFile(src);
  }
  await ff.writeFile('input.mp4', inputData);

  // 设置进度监听
  if (onProgress) {
    ff.on('progress', function handler(_ref) {
      onProgress(_ref.progress);
    });
  }

  try {
    // 执行裁剪
    await ff.exec([
      '-i', 'input.mp4',
      '-ss', fmtTimeFFmpeg(startTime),
      '-t', fmtTimeFFmpeg(duration),
      '-c:v', 'libx264',
      '-c:a', 'aac',
      '-preset', 'fast',
      '-y',
      'output.mp4'
    ]);

    let outputData = await ff.readFile('output.mp4');
    let dataUrl = uint8ArrayToDataUrl(outputData, 'video/mp4');

    // 清理临时文件
    try { await ff.deleteFile('input.mp4'); } catch (e) {}
    try { await ff.deleteFile('output.mp4'); } catch (e) {}

    return { dataUrl: dataUrl };
  } finally {
    ff.off('progress');
  }
}

/**
 * 压缩视频
 * @param {string} src - 视频源
 * @param {string} srcType - 'dataUrl' | 'url'
 * @param {number} crf - 压缩质量 (0~51, 越小质量越高, 默认 28)
 * @param {number} scale - 缩放比例 (0.5, 0.75, 1)
 * @param {function} onProgress - 进度回调
 * @returns {Promise<{dataUrl: string}>}
 */
export async function compressVideo(src, srcType, crf, scale, onProgress) {
  const ff = await getFFmpeg();

  let inputData;
  if (srcType === 'dataUrl') {
    inputData = dataUrlToUint8Array(src);
  } else {
    inputData = await fetchFile(src);
  }
  await ff.writeFile('input.mp4', inputData);

  if (onProgress) {
    ff.on('progress', function (_ref) {
      onProgress(_ref.progress);
    });
  }

  try {
    let args = ['-i', 'input.mp4'];

    // 缩放
    if (scale && scale < 1) {
      args.push('-vf', 'scale=iw*' + scale + ':ih*' + scale);
    }

    args.push(
      '-c:v', 'libx264',
      '-crf', String(crf || 28),
      '-preset', 'fast',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-y', 'output.mp4'
    );

    await ff.exec(args);

    let outputData = await ff.readFile('output.mp4');
    let dataUrl = uint8ArrayToDataUrl(outputData, 'video/mp4');

    try { await ff.deleteFile('input.mp4'); } catch (e) {}
    try { await ff.deleteFile('output.mp4'); } catch (e) {}

    return { dataUrl: dataUrl };
  } finally {
    ff.off('progress');
  }
}

/**
 * 转码视频格式
 * @param {string} src - 视频源
 * @param {string} srcType - 'dataUrl' | 'url'
 * @param {string} format - 目标格式 'webm' | 'mp4' | 'avi'
 * @param {function} onProgress - 进度回调
 * @returns {Promise<{dataUrl: string, mimeType: string}>}
 */
export async function convertVideo(src, srcType, format, onProgress) {
  const ff = await getFFmpeg();

  let inputData;
  if (srcType === 'dataUrl') {
    inputData = dataUrlToUint8Array(src);
  } else {
    inputData = await fetchFile(src);
  }

  let inputExt = 'mp4';
  let outputName = 'output.' + format;

  await ff.writeFile('input.' + inputExt, inputData);

  if (onProgress) {
    ff.on('progress', function (_ref) {
      onProgress(_ref.progress);
    });
  }

  try {
    let args = ['-i', 'input.' + inputExt];

    if (format === 'webm') {
      args.push('-c:v', 'libvpx', '-c:a', 'libvorbis', '-b:v', '1M', '-y', outputName);
    } else if (format === 'avi') {
      args.push('-c:v', 'libx264', '-c:a', 'mp3lame', '-y', outputName);
    } else {
      args.push('-c:v', 'libx264', '-c:a', 'aac', '-preset', 'fast', '-y', outputName);
    }

    await ff.exec(args);

    let outputData = await ff.readFile(outputName);
    let mimeMap = { webm: 'video/webm', mp4: 'video/mp4', avi: 'video/x-msvideo' };
    let mimeType = mimeMap[format] || 'video/mp4';
    let dataUrl = uint8ArrayToDataUrl(outputData, mimeType);

    try { await ff.deleteFile('input.' + inputExt); } catch (e) {}
    try { await ff.deleteFile(outputName); } catch (e) {}

    return { dataUrl: dataUrl, mimeType: mimeType };
  } finally {
    ff.off('progress');
  }
}

/**
 * 截取视频帧（截图）
 * @param {string} src - 视频源
 * @param {string} srcType - 'dataUrl' | 'url'
 * @param {number} time - 截图时间点（秒）
 * @returns {Promise<{dataUrl: string}>} 图片 dataUrl (PNG)
 */
export async function captureFrame(src, srcType, time) {
  const ff = await getFFmpeg();

  let inputData;
  if (srcType === 'dataUrl') {
    inputData = dataUrlToUint8Array(src);
  } else {
    inputData = await fetchFile(src);
  }
  await ff.writeFile('input.mp4', inputData);

  await ff.exec([
    '-i', 'input.mp4',
    '-ss', fmtTimeFFmpeg(time),
    '-frames:v', '1',
    '-y', 'frame.png'
  ]);

  let frameData = await ff.readFile('frame.png');
  let dataUrl = uint8ArrayToDataUrl(frameData, 'image/png');

  try { await ff.deleteFile('input.mp4'); } catch (e) {}
  try { await ff.deleteFile('frame.png'); } catch (e) {}

  return { dataUrl: dataUrl };
}

/**
 * 调整视频速度
 * @param {string} src - 视频源
 * @param {string} srcType - 'dataUrl' | 'url'
 * @param {number} speed - 速度倍率 (0.25~4)
 * @param {function} onProgress - 进度回调
 * @returns {Promise<{dataUrl: string}>}
 */
export async function changeSpeed(src, srcType, speed, onProgress) {
  const ff = await getFFmpeg();

  let inputData;
  if (srcType === 'dataUrl') {
    inputData = dataUrlToUint8Array(src);
  } else {
    inputData = await fetchFile(src);
  }
  await ff.writeFile('input.mp4', inputData);

  if (onProgress) {
    ff.on('progress', function (_ref) {
      onProgress(_ref.progress);
    });
  }

  try {
    let videoFilter = 'setpts=' + (1 / speed) + '*PTS';
    let audioFilter = 'atempo=' + speed;

    // atempo 范围 0.5~2，超出需要链式
    if (speed < 0.5 || speed > 2) {
      let factors = [];
      let remaining = speed;
      while (remaining < 0.5) { factors.push(0.5); remaining /= 0.5; }
      while (remaining > 2) { factors.push(2); remaining /= 2; }
      factors.push(remaining);
      audioFilter = factors.map(function (f) { return 'atempo=' + f; }).join(',');
    }

    await ff.exec([
      '-i', 'input.mp4',
      '-filter:v', videoFilter,
      '-filter:a', audioFilter,
      '-c:v', 'libx264',
      '-c:a', 'aac',
      '-preset', 'fast',
      '-y', 'output.mp4'
    ]);

    let outputData = await ff.readFile('output.mp4');
    let dataUrl = uint8ArrayToDataUrl(outputData, 'video/mp4');

    try { await ff.deleteFile('input.mp4'); } catch (e) {}
    try { await ff.deleteFile('output.mp4'); } catch (e) {}

    return { dataUrl: dataUrl };
  } finally {
    ff.off('progress');
  }
}

/**
 * 添加文字水印
 * @param {string} src - 视频源
 * @param {string} srcType - 'dataUrl' | 'url'
 * @param {string} text - 水印文字
 * @param {string} position - 位置 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'
 * @param {string} color - 文字颜色
 * @param {number} fontSize - 字号
 * @param {function} onProgress - 进度回调
 * @returns {Promise<{dataUrl: string}>}
 */
export async function addTextWatermark(src, srcType, text, position, color, fontSize, onProgress) {
  const ff = await getFFmpeg();

  let inputData;
  if (srcType === 'dataUrl') {
    inputData = dataUrlToUint8Array(src);
  } else {
    inputData = await fetchFile(src);
  }
  await ff.writeFile('input.mp4', inputData);

  if (onProgress) {
    ff.on('progress', function (_ref) {
      onProgress(_ref.progress);
    });
  }

  try {
    let posMap = {
      'top-left': 'x=10:y=10',
      'top-right': 'x=w-tw-10:y=10',
      'bottom-left': 'x=10:y=h-th-10',
      'bottom-right': 'x=w-tw-10:y=h-th-10',
      'center': 'x=(w-tw)/2:y=(h-th)/2'
    };
    let pos = posMap[position] || posMap['bottom-right'];
    let escapedText = text.replace(/'/g, "\\'").replace(/:/g, '\\:');

    await ff.exec([
      '-i', 'input.mp4',
      '-vf', "drawtext=text='" + escapedText + "':" + pos + ":fontsize=" + (fontSize || 24) + ":fontcolor=" + (color || 'white') + ":shadowcolor=black:shadowx=1:shadowy=1",
      '-c:v', 'libx264',
      '-c:a', 'copy',
      '-preset', 'fast',
      '-y', 'output.mp4'
    ]);

    let outputData = await ff.readFile('output.mp4');
    let dataUrl = uint8ArrayToDataUrl(outputData, 'video/mp4');

    try { await ff.deleteFile('input.mp4'); } catch (e) {}
    try { await ff.deleteFile('output.mp4'); } catch (e) {}

    return { dataUrl: dataUrl };
  } finally {
    ff.off('progress');
  }
}

/**
 * 获取视频信息（时长、分辨率等）
 * @param {string} src - 视频源
 * @param {string} srcType - 'dataUrl' | 'url'
 * @returns {Promise<{duration: number, width: number, height: number}>}
 */
export async function getVideoInfo(src, srcType) {
  return new Promise(function (resolve) {
    let video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = function () {
      resolve({
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight
      });
      URL.revokeObjectURL(video.src);
    };
    video.onerror = function () {
      resolve({ duration: 0, width: 0, height: 0 });
    };
    if (srcType === 'dataUrl') {
      video.src = src;
    } else {
      video.src = src;
    }
  });
}

// ═══════════════════════════════════════════
//  滤镜效果
// ═══════════════════════════════════════════

/**
 * 应用视频滤镜（支持组合多个滤镜）
 * @param {string} src - 视频源
 * @param {string} srcType - 'dataUrl' | 'url'
 * @param {Array<{type:string, value:number}>} filters - 滤镜列表
 *   type: 'grayscale' | 'sepia' | 'brightness' | 'contrast' | 'saturation' | 'hue' | 'blur' | 'sharpen' | 'invert' | 'vignette' | 'warm' | 'cool'
 *   value: 参数值 (0~100 或具体数值)
 * @param {function} onProgress - 进度回调
 * @returns {Promise<{dataUrl: string}>}
 */
export async function applyVideoFilter(src, srcType, filters, onProgress) {
  const ff = await getFFmpeg();

  let inputData;
  if (srcType === 'dataUrl') {
    inputData = dataUrlToUint8Array(src);
  } else {
    inputData = await fetchFile(src);
  }
  await ff.writeFile('input.mp4', inputData);

  if (onProgress) {
    ff.on('progress', function (_ref) { onProgress(_ref.progress); });
  }

  try {
    // 构建 vf 链
    let vfParts = [];
    for (let i = 0; i < filters.length; i++) {
      let f = filters[i];
      switch (f.type) {
        case 'grayscale':
          vfParts.push('format=yuva420p,colorchannelmixer=.3:.4:.3:0:.3:.4:.3:0:.3:.3:.3');
          break;
        case 'sepia':
          vfParts.push('format=yuva420p,colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131');
          break;
        case 'brightness':
          vfParts.push('eq=brightness=' + ((f.value / 100) - 0.5));
          break;
        case 'contrast':
          vfParts.push('eq=contrast=' + (1 + f.value / 50));
          break;
        case 'saturation':
          vfParts.push('eq=saturation=' + (1 + f.value / 50));
          break;
        case 'hue':
          vfParts.push('eq=hue=' + (f.value));
          break;
        case 'blur':
          vfParts.push('boxblur=' + (f.value || 2) + ':' + (f.value || 2) + ':0.8:' + (f.value || 2) + ':' + (f.value || 2) + ':0.8');
          break;
        case 'sharpen':
          vfParts.push('unsharp=5:5:' + (f.value / 10) + ':5:5:' + (f.value / 10));
          break;
        case 'invert':
          vfParts.push('negate');
          break;
        case 'vignette':
          let vi = Math.max(1, f.value);
          vfParts.push('vignette=PI/4:' + vi + ':PI/4:' + vi + ':0.6:0.5');
          break;
        case 'warm':
          vfParts.push('eq=saturation=1.1:brightness=0.05:contrast=1.05');
          break;
        case 'cool':
          vfParts.push('eq=saturation=0.9:brightness=-0.02:contrast=1.03');
          break;
        case 'noise':
          vfParts.push('noise=all=' + (f.value / 200 + 0.005) + ':allf=t+u');
          break;
        case 'pixelate':
          let px = Math.max(2, Math.round(f.value));
          vfParts.push('scale=iw/' + px + ':-1:flags=neighbor,scale=' + px + '*iw:-1:flags=neighbor');
          break;
      }
    }

    let args = ['-i', 'input.mp4'];
    if (vfParts.length > 0) {
      args.push('-vf', vfParts.join(','));
    }
    args.push('-c:v', 'libx264', '-c:a', 'copy', '-preset', 'fast', '-y', 'output.mp4');

    await ff.exec(args);

    let outputData = await ff.readFile('output.mp4');
    let dataUrl = uint8ArrayToDataUrl(outputData, 'video/mp4');

    try { await ff.deleteFile('input.mp4'); } catch (e) {}
    try { await ff.deleteFile('output.mp4'); } catch (e) {}

    return { dataUrl: dataUrl };
  } finally {
    ff.off('progress');
  }
}

// ═══════════════════════════════════════════
//  高级剪辑：画面裁切、旋转、翻转、倒放、拼接
// ═══════════════════════════════════════════

/**
 * 裁切视频画面区域（非时间裁剪，是裁掉画面的边缘）
 * @param {string} src - 视频源
 * @param {string} srcType - 'dataUrl' | 'url'
 * @param {number} x - 左边裁掉的像素比例 (0~0.5)
 * @param {number} y - 上边裁掉的像素比例 (0~0.5)
 * @param {number} w - 宽度比例 (0.1~1)
 * @param {number} h - 高度比例 (0.1~1)
 * @param {function} onProgress - 进度回调
 * @returns {Promise<{dataUrl: string}>}
 */
export async function cropFrameArea(src, srcType, x, y, w, h, onProgress) {
  const ff = await getFFmpeg();

  let inputData;
  if (srcType === 'dataUrl') {
    inputData = dataUrlToUint8Array(src);
  } else {
    inputData = await fetchFile(src);
  }
  await ff.writeFile('input.mp4', inputData);

  if (onProgress) {
    ff.on('progress', function (_ref) { onProgress(_ref.progress); });
  }

  try {
    await ff.exec([
      '-i', 'input.mp4',
      '-vf', 'crop=iw*' + w + ':ih*' + h + ':iw*' + x + ':ih*' + y,
      '-c:v', 'libx264',
      '-c:a', 'copy',
      '-preset', 'fast',
      '-y', 'output.mp4'
    ]);

    let outputData = await ff.readFile('output.mp4');
    let dataUrl = uint8ArrayToDataUrl(outputData, 'video/mp4');

    try { await ff.deleteFile('input.mp4'); } catch (e) {}
    try { await ff.deleteFile('output.mp4'); } catch (e) {}

    return { dataUrl: dataUrl };
  } finally {
    ff.off('progress');
  }
}

/**
 * 旋转视频（90° / 180° / 270°）
 * @param {string} src - 视频源
 * @param {string} srcType - 'dataUrl' | 'url'
 * @param {number} angle - 角度 90 | 180 | 270
 * @param {function} onProgress - 进度回调
 * @returns {Promise<{dataUrl: string}>}
 */
export async function rotateVideo(src, srcType, angle, onProgress) {
  const ff = await getFFmpeg();

  let inputData;
  if (srcType === 'dataUrl') {
    inputData = dataUrlToUint8Array(src);
  } else {
    inputData = await fetchFile(src);
  }
  await ff.writeFile('input.mp4', inputData);

  if (onProgress) {
    ff.on('progress', function (_ref) { onProgress(_ref.progress); });
  }

  try {
    // transpose: 1=顺时针90°, 2=顺时针180°, 3=顺时针270°
    let transposeMap = { 90: 1, 180: 2, 270: 3 };
    let t = transposeMap[angle] || 1;

    await ff.exec([
      '-i', 'input.mp4',
      '-vf', 'transpose=' + t,
      '-c:v', 'libx264',
      '-c:a', 'aac',
      '-preset', 'fast',
      '-y', 'output.mp4'
    ]);

    let outputData = await ff.readFile('output.mp4');
    let dataUrl = uint8ArrayToDataUrl(outputData, 'video/mp4');

    try { await ff.deleteFile('input.mp4'); } catch (e) {}
    try { await ff.deleteFile('output.mp4'); } catch (e) {}

    return { dataUrl: dataUrl };
  } finally {
    ff.off('progress');
  }
}

/**
 * 翻转视频（水平 / 垂直）
 * @param {string} src - 视频源
 * @param {string} srcType - 'dataUrl' | 'url'
 * @param {string} direction - 'h' | 'v'
 * @param {function} onProgress - 进度回调
 * @returns {Promise<{dataUrl: string}>}
 */
export async function flipVideo(src, srcType, direction, onProgress) {
  const ff = await getFFmpeg();

  let inputData;
  if (srcType === 'dataUrl') {
    inputData = dataUrlToUint8Array(src);
  } else {
    inputData = await fetchFile(src);
  }
  await ff.writeFile('input.mp4', inputData);

  if (onProgress) {
    ff.on('progress', function (_ref) { onProgress(_ref.progress); });
  }

  try {
    let filter = direction === 'h' ? 'hflip' : 'vflip';
    await ff.exec([
      '-i', 'input.mp4',
      '-vf', filter,
      '-c:v', 'libx264',
      '-c:a', 'copy',
      '-preset', 'fast',
      '-y', 'output.mp4'
    ]);

    let outputData = await ff.readFile('output.mp4');
    let dataUrl = uint8ArrayToDataUrl(outputData, 'video/mp4');

    try { await ff.deleteFile('input.mp4'); } catch (e) {}
    try { await ff.deleteFile('output.mp4'); } catch (e) {}

    return { dataUrl: dataUrl };
  } finally {
    ff.off('progress');
  }
}

/**
 * 倒放视频（音频也一起倒放）
 * @param {string} src - 视频源
 * @param {string} srcType - 'dataUrl' | 'url'
 * @param {function} onProgress - 进度回调
 * @returns {Promise<{dataUrl: string}>}
 */
export async function reverseVideo(src, srcType, onProgress) {
  const ff = await getFFmpeg();

  let inputData;
  if (srcType === 'dataUrl') {
    inputData = dataUrlToUint8Array(src);
  } else {
    inputData = await fetchFile(src);
  }
  await ff.writeFile('input.mp4', inputData);

  if (onProgress) {
    ff.on('progress', function (_ref) { onProgress(_ref.progress); });
  }

  try {
    await ff.exec([
      '-i', 'input.mp4',
      '-vf', 'reverse',
      '-af', 'areverse',
      '-c:v', 'libx264',
      '-c:a', 'aac',
      '-preset', 'fast',
      '-y', 'output.mp4'
    ]);

    let outputData = await ff.readFile('output.mp4');
    let dataUrl = uint8ArrayToDataUrl(outputData, 'video/mp4');

    try { await ff.deleteFile('input.mp4'); } catch (e) {}
    try { await ff.deleteFile('output.mp4'); } catch (e) {}

    return { dataUrl: dataUrl };
  } finally {
    ff.off('progress');
  }
}

// ═══════════════════════════════════════════
//  音频操作：提取、替换、音量调节
// ═══════════════════════════════════════════

/**
 * 提取音频轨道为 MP3/WAV
 * @param {string} src - 视频源
 * @param {string} srcType - 'dataUrl' | 'url'
 * @param {string} format - 'mp3' | 'wav'
 * @param {function} onProgress - 进度回调
 * @returns {Promise<{dataUrl: string, mimeType: string}>}
 */
export async function extractAudio(src, srcType, format, onProgress) {
  const ff = await getFFmpeg();

  let inputData;
  if (srcType === 'dataUrl') {
    inputData = dataUrlToUint8Array(src);
  } else {
    inputData = await fetchFile(src);
  }
  await ff.writeFile('input.mp4', inputData);

  if (onProgress) {
    ff.on('progress', function (_ref) { onProgress(_ref.progress); });
  }

  try {
    let outName = 'output.' + format;
    if (format === 'mp3') {
      await ff.exec(['-i', 'input.mp4', '-vn', '-acodec', 'libmp3lame', '-q:a', '2', '-y', outName]);
    } else {
      await ff.exec(['-i', 'input.mp4', '-vn', '-acodec', 'pcm_s16le', '-y', outName]);
    }

    let outputData = await ff.readFile(outName);
    let mimeMap = { mp3: 'audio/mpeg', wav: 'audio/wav' };
    let dataUrl = uint8ArrayToDataUrl(outputData, mimeMap[format]);

    try { await ff.deleteFile('input.mp4'); } catch (e) {}
    try { await ff.deleteFile(outName); } catch (e) {}

    return { dataUrl: dataUrl, mimeType: mimeMap[format], fileName: 'extracted_audio.' + format };
  } finally {
    ff.off('progress');
  }
}

/**
 * 替换视频的音频轨道
 * @param {string} videoSrc - 视频源
 * @param {string} videoSrcType - 'dataUrl' | 'url'
 * @param {string|Uint8Array} audioSource - 新音频源（dataUrl 或 Uint8Array）
 * @param {string} audioSourceType - 'dataUrl' | 'uint8array'
 * @param {number} volume - 音量倍率 (0~3)
 * @param {function} onProgress - 进度回调
 * @returns {Promise<{dataUrl: string}>}
 */
export async function replaceAudio(videoSrc, videoSrcType, audioSource, audioSourceType, volume, onProgress) {
  const ff = await getFFmpeg();

  let videoInput;
  if (videoSrcType === 'dataUrl') {
    videoInput = dataUrlToUint8Array(videoSrc);
  } else {
    videoInput = await fetchFile(videoSrc);
  }
  await ff.writeFile('video.mp4', videoInput);

  let audioInput;
  if (audioSourceType === 'uint8array') {
    audioInput = audioSource;
  } else {
    audioInput = dataUrlToUint8Array(audioSource);
  }
  await ff.writeFile('new_audio.mp3', audioInput);

  if (onProgress) {
    ff.on('progress', function (_ref) { onProgress(_ref.progress); });
  }

  try {
    let volFilter = '';
    if (volume !== undefined && volume !== 1) {
      volFilter = ',volume=' + volume;
    }

    await ff.exec([
      '-i', 'video.mp4',
      '-i', 'new_audio.mp3',
      '-map', '0:v:0',
      '-map', '1:a:0',
      '-filter_complex', '[1:a]' + volFilter + '[aout]',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-shortest',
      '-y', 'output.mp4'
    ]);

    let outputData = await ff.readFile('output.mp4');
    let dataUrl = uint8ArrayToDataUrl(outputData, 'video/mp4');

    try { await ff.deleteFile('video.mp4'); } catch (e) {}
    try { await ff.deleteFile('new_audio.mp3'); } catch (e) {}
    try { await ff.deleteFile('output.mp4'); } catch (e) {}

    return { dataUrl: dataUrl };
  } finally {
    ff.off('progress');
  }
}

/**
 * 调整视频音量
 * @param {string} src - 视频源
 * @param {string} srcType - 'dataUrl' | 'url'
 * @param {number} volume - 音量倍率 (0~3, 1=原始)
 * @param {function} onProgress - 进度回调
 * @returns {Promise<{dataUrl: string}>}
 */
export async function adjustVolume(src, srcType, volume, onProgress) {
  const ff = await getFFmpeg();

  let inputData;
  if (srcType === 'dataUrl') {
    inputData = dataUrlToUint8Array(src);
  } else {
    inputData = await fetchFile(src);
  }
  await ff.writeFile('input.mp4', inputData);

  if (onProgress) {
    ff.on('progress', function (_ref) { onProgress(_ref.progress); });
  }

  try {
    await ff.exec([
      '-i', 'input.mp4',
      '-af', 'volume=' + volume,
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-y', 'output.mp4'
    ]);

    let outputData = await ff.readFile('output.mp4');
    let dataUrl = uint8ArrayToDataUrl(outputData, 'video/mp4');

    try { await ff.deleteFile('input.mp4'); } catch (e) {}
    try { await ff.deleteFile('output.mp4'); } catch (e) {}

    return { dataUrl: dataUrl };
  } finally {
    ff.off('progress');
  }
}

// ═══════════════════════════════════════════
//  GIF 互转
// ═══════════════════════════════════════════

/**
 * 视频 → GIF
 * @param {string} src - 视频源
 * @param {string} srcType - 'dataUrl' | 'url'
 * @param {number} startTime - 起始时间（秒）
 * @param {number} duration - 时长（秒），0 表示全片
 * @param {number} fps - 帧率 (5~30)
 * @param {number} width - 最大宽度像素
 * @param {function} onProgress - 进度回调
 * @returns {Promise<{dataUrl: string}>}
 */
export async function videoToGif(src, srcType, startTime, duration, fps, width, onProgress) {
  const ff = await getFFmpeg();

  let inputData;
  if (srcType === 'dataUrl') {
    inputData = dataUrlToUint8Array(src);
  } else {
    inputData = await fetchFile(src);
  }
  await ff.writeFile('input.mp4', inputData);

  if (onProgress) {
    ff.on('progress', function (_ref) { onProgress(_ref.progress); });
  }

  try {
    let args = [
      '-i', 'input.mp4',
      '-ss', fmtTimeFFmpeg(startTime || 0),
    ];
    if (duration > 0) {
      args.push('-t', String(duration));
    }
    args.push(
      '-vf', 'fps=' + (fps || 15) + ',scale=' + (width || 480) + ':-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse',
      '-loop', '0',
      '-y', 'output.gif'
    );

    await ff.exec(args);

    let outputData = await ff.readFile('output.gif');
    let dataUrl = uint8ArrayToDataUrl(outputData, 'image/gif');

    try { await ff.deleteFile('input.mp4'); } catch (e) {}
    try { await ff.deleteFile('output.gif'); } catch (e) {}

    return { dataUrl: dataUrl };
  } finally {
    ff.off('progress');
  }
}

/**
 * GIF → 视频
 * @param {string} gifSrc - GIF 数据 URL
 * @param {string} srcType - 'dataUrl'
 * @param {number} loopCount - 循环次数 (-1=无限, 0=不循环, n=n次)
 * @param {function} onProgress - 进度回调
 * @returns {Promise<{dataUrl: string}>}
 */
export async function gifToVideo(gifSrc, srcType, loopCount, onProgress) {
  const ff = await getFFmpeg();

  let inputData;
  if (srcType === 'dataUrl') {
    inputData = dataUrlToUint8Array(gifSrc);
  } else {
    inputData = await fetchFile(gifSrc);
  }
  await ff.writeFile('input.gif', inputData);

  if (onProgress) {
    ff.on('progress', function (_ref) { onProgress(_ref.progress); });
  }

  try {
    let args = [
      '-f', 'gif', '-i', 'input.gif',
      '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-preset', 'fast',
      '-y', 'output.mp4'
    ];

    await ff.exec(args);

    let outputData = await ff.readFile('output.mp4');
    let dataUrl = uint8ArrayToDataUrl(outputData, 'video/mp4');

    try { await ff.deleteFile('input.gif'); } catch (e) {}
    try { await ff.deleteFile('output.mp4'); } catch (e) {}

    return { dataUrl: dataUrl };
  } finally {
    ff.off('progress');
  }
}

// ═══════════════════════════════════════════
//  字幕功能
// ═══════════════════════════════════════════

/**
 * 烧录 SRT 字幕到视频中
 * @param {string} src - 视频源
 * @param {string} srcType - 'dataUrl' | 'url'
 * @param {string} srtContent - SRT 格式字幕文本
 * @param {object} style - 字幕样式 { fontSize, color, position, outlineColor }
 * @param {function} onProgress - 进度回调
 * @returns {Promise<{dataUrl: string}>}
 */
export async function burnSubtitle(src, srcType, srtContent, style, onProgress) {
  const ff = await getFFmpeg();

  let inputData;
  if (srcType === 'dataUrl') {
    inputData = dataUrlToUint8Array(src);
  } else {
    inputData = await fetchFile(src);
  }
  await ff.writeFile('input.mp4', inputData);
  await ff.writeFile('sub.srt', new TextEncoder().encode(srtContent));

  if (onProgress) {
    ff.on('progress', function (_ref) { onProgress(_ref.progress); });
  }

  try {
    let s = style || {};
    let posMap = { top: 'top=20', bottom: 'bottom=20', center: '(text_h-line_h)/2' };
    let pos = posMap[s.position] || 'bottom=20';
    let escapedSrt = srtContent.replace(/'/g, "\\'").replace(/:/g, '\\:').replace(/\n/g, '\\n');

    await ff.exec([
      '-i', 'input.mp4',
      '-vf', "subtitles=sub.srt:force_style='" +
        "FontSize=" + (s.fontSize || 24) +
        ",PrimaryColour=&H" + hexToABGR(s.color || '#ffffff') +
        ",OutlineColour=&H" + hexToABGR(s.outlineColor || '#000000') +
        ",Outline=2," + pos + "'",
      '-c:v', 'libx264',
      '-c:a', 'aac',
      '-preset', 'fast',
      '-y', 'output.mp4'
    ]);

    let outputData = await ff.readFile('output.mp4');
    let dataUrl = uint8ArrayToDataUrl(outputData, 'video/mp4');

    try { await ff.deleteFile('input.mp4'); } catch (e) {}
    try { await ff.deleteFile('sub.srt'); } catch (e) {}
    try { await ff.deleteFile('output.mp4'); } catch (e) {}

    return { dataUrl: dataUrl };
  } finally {
    ff.off('progress');
  }
}

/**
 * 将 #RRGGBB 转换为 ASS 字幕颜色格式 &HAABBGGRR
 */
function hexToABGR(hex) {
  let r = parseInt(hex.slice(1, 3), 16);
  let g = parseInt(hex.slice(3, 5), 16);
  let b = parseInt(hex.slice(5, 7), 16);
  return ('00' + b.toString(16)).slice(-2) +
         ('00' + g.toString(16)).slice(-2) +
         ('00' + r.toString(16)).slice(-2);
}

/**
 * 生成默认 SRT 内容模板
 */
export function generateSRTTemplate() {
  return (
    '1\n' +
    '00:00:00,000 --> 00:00:03,000\n' +
    '第一行字幕文字\n' +
    '\n' +
    '2\n' +
    '00:00:04,000 --> 00:00:07,000\n' +
    '第二行字幕文字\n' +
    '\n'
  );
}
