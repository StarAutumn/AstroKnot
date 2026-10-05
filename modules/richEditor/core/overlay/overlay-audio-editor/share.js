// ============================================================
//  overlay-audio-editor/share.js — 音频编辑器共享层
//  模块级可变状态（ESM live binding 供跨文件读取，写入统一走 set* 导出）
//  + 工具函数（fmtTime/fmtTimeFull/clamp）+ 颜色常量 C
// ============================================================

// ── 状态变量 ──
export let audioEditorModal = null;
export let wavesurferInstance = null;
export let editorAudioData = null;
export let regionsPlugin = null;

// 音频效果链
export let audioCtx = null;
export let sourceNode = null;
export let lowEQNode = null;
export let midEQNode = null;
export let highEQNode = null;
export let compressorNode = null;
export let reverbNode = null;
export let reverbGainNode = null;
export let dryGainNode = null;
export let masterGain = null;
export let analyserNode = null;
export let effectsReady = false;

// 频谱分析
export let specCanvas = null;
export let specCtx2d = null;
export let specAnimId = null;
export let peakHolds = new Float32Array(64);
export let peakDecay = new Float32Array(64);

// 标记
export let markers = [];
export let markerIdSeq = 0;
export let markerColors = ['#00e5ff', '#ff6b9d', '#ffd93d', '#6bff6b', '#ff6b6b', '#b388ff', '#ffab40'];

// 效果参数
export let eqLow = 0;
export let eqMid = 0;
export let eqHigh = 0;
export let fadeInDur = 0;
export let fadeOutDur = 0;
export let compThreshold = -24;
export let compRatio = 12;
export let compAttack = 0.003;
export let compRelease = 0.25;
export let compEnabled = false;
export let reverbMix = 0;
export let reverbDecay = 2;
export let reverbEnabled = false;

// 波形样式
export let waveformStyle = 'fill'; // 'fill' | 'line' | 'mirror'

// 速度与音调
export let playbackSpeed = 1;   // 播放速度倍率 (0.25 ~ 4)
export let pitchShift = 0;      // 音调偏移（半音，-24 ~ +24）
export let pitchShifterNode = null; // SoundTouch 高品质音调偏移节点

// 反转播放
export let isReversed = false;

// A/B 对比
export let abState = 'A'; // 'A' = 当前效果, 'B' = 旁通
export let savedParams = null;

// 当前标签页
export let activeTab = 'eq';

// 进度条拖动状态
export let isSeekDragging = false;

// 键盘监听引用
export let keyHandlerRef = null;
// ── 工具函数 ──
export function fmtTime(s) {
  if (!s || isNaN(s)) return '0:00';
  let m = Math.floor(s / 60);
  let sec = Math.floor(s % 60);
  return m + ':' + (sec < 10 ? '0' : '') + sec;
}

export function fmtTimeFull(s) {
  if (!s || isNaN(s)) return '0:00.000';
  let m = Math.floor(s / 60);
  let sec = Math.floor(s % 60);
  let ms = Math.floor((s % 1) * 1000);
  return m + ':' + (sec < 10 ? '0' : '') + sec + '.' + (ms < 10 ? '00' : ms < 100 ? '0' : '') + ms;
}

export function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
// ── 颜色常量 ──
export var C = {
  bg0: '#0a1620', bg1: '#0d1f2b', bg2: '#142835', bg3: '#1a3a44',
  accent: '#2c6e7e', accentH: '#3a8090', accentA: '#4a9eae',
  txt: '#aef0ff', txt2: '#8899aa', hi: '#00e5ff',
  border: '#1a3a44', danger: '#ff6666', green: '#99ffcc',
  redBtn: '#3a2a2a', redBd: '#6a4a4a', redTxt: '#ff9999',
  greenBtn: '#2a5a4a', greenBd: '#4a8a6a'
};

// ── 状态写入 setter（ESM import 绑定为只读，跨文件写入统一走 set* 导出） ──
export function setAudioEditorModal(v) { audioEditorModal = v; }
export function setWavesurferInstance(v) { wavesurferInstance = v; }
export function setEditorAudioData(v) { editorAudioData = v; }
export function setRegionsPlugin(v) { regionsPlugin = v; }
export function setAudioCtx(v) { audioCtx = v; }
export function setSourceNode(v) { sourceNode = v; }
export function setLowEQNode(v) { lowEQNode = v; }
export function setMidEQNode(v) { midEQNode = v; }
export function setHighEQNode(v) { highEQNode = v; }
export function setCompressorNode(v) { compressorNode = v; }
export function setReverbNode(v) { reverbNode = v; }
export function setReverbGainNode(v) { reverbGainNode = v; }
export function setDryGainNode(v) { dryGainNode = v; }
export function setMasterGain(v) { masterGain = v; }
export function setAnalyserNode(v) { analyserNode = v; }
export function setEffectsReady(v) { effectsReady = v; }
export function setSpecCanvas(v) { specCanvas = v; }
export function setSpecCtx2d(v) { specCtx2d = v; }
export function setSpecAnimId(v) { specAnimId = v; }
export function setMarkers(v) { markers = v; }
export function setMarkerIdSeq(v) { markerIdSeq = v; }
export function setEqLow(v) { eqLow = v; }
export function setEqMid(v) { eqMid = v; }
export function setEqHigh(v) { eqHigh = v; }
export function setFadeInDur(v) { fadeInDur = v; }
export function setFadeOutDur(v) { fadeOutDur = v; }
export function setCompThreshold(v) { compThreshold = v; }
export function setCompRatio(v) { compRatio = v; }
export function setCompAttack(v) { compAttack = v; }
export function setCompRelease(v) { compRelease = v; }
export function setCompEnabled(v) { compEnabled = v; }
export function setReverbMix(v) { reverbMix = v; }
export function setReverbDecay(v) { reverbDecay = v; }
export function setReverbEnabled(v) { reverbEnabled = v; }
export function setWaveformStyle(v) { waveformStyle = v; }
export function setPlaybackSpeed(v) { playbackSpeed = v; }
export function setPitchShift(v) { pitchShift = v; }
export function setPitchShifterNode(v) { pitchShifterNode = v; }
export function setIsReversed(v) { isReversed = v; }
export function setAbState(v) { abState = v; }
export function setSavedParams(v) { savedParams = v; }
export function setActiveTab(v) { activeTab = v; }
export function setIsSeekDragging(v) { isSeekDragging = v; }
export function setKeyHandlerRef(v) { keyHandlerRef = v; }

// ── 标记 ID 自增（原 markerIdSeq++ 语义） ──
export function nextMarkerId() { return markerIdSeq++; }

