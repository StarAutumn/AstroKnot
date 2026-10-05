// ============================================================
//  video-editor/ui.js — 弹窗 DOM 构建与 Tab 切换
//  buildUI（预览面板/播放控制/Tab 栏/进度条/应用按钮等 DOM 构建）
//  updateTabUI（按 activeTab 分派到 tabs.js 的 renderXxxTab）
// ============================================================

import {
  videoEditorModal, setVideoEditorModal,
  previewVideo, setPreviewVideo,
  editorVideoData,
  activeTab, setActiveTab
} from './share.js';
import { onSeekBarMouseDown, updatePreview } from './preview.js';
import {
  renderTrimTab, renderCompressTab, renderConvertTab, renderSpeedTab,
  renderWatermarkTab, renderSnapshotTab, renderFilterTab, renderAdvancedTab,
  renderAudioTab, renderGifTab, renderSubtitleTab
} from './tabs.js';
import { closeVideoEditor, onApply, onEscKey } from './index.js';

// ── 构建 UI ──
export function buildUI() {
  if (videoEditorModal) {
    try { videoEditorModal.remove(); } catch (e) {}
  }

  setVideoEditorModal(document.createElement('div'));
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
  setPreviewVideo(document.createElement('video'));
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
      setActiveTab(tab.id);
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
