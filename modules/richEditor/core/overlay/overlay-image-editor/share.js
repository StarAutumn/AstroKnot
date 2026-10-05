// ============================================================
//  overlay-image-editor/share.js — 图片编辑器共享状态层
//  模块级可变状态中枢（ESM live binding 供跨文件读取，写入统一走 set* 导出）
// ============================================================

// ── 核心状态 ──
export let editorModal = null;
export let editorCanvas = null;
export let editorCtx = null;
export let editorCropper = null;
export let editorImgData = null;
export let editorOriginalSrc = null;
export let editorWorkingSrc = null;
export let editorOriginalW = null;
export let editorOriginalH = null;

// ── 模式管理 ──
export let currentEditorMode = 'adjust';
export let drawState = { active: false, eraser: false, paths: [] };
export let textState = { active: false, items: [] };
export let freeRotateAngle = 0;

// ── 滤镜预设 ──
export let filterPresets = {
  none: '',
  grayscale: 'grayscale(100%)',
  invert: 'invert(100%)',
  sepia: 'sepia(80%) saturate(120%)',
  warm: 'sepia(30%) saturate(140%) brightness(105%)',
  cool: 'saturate(80%) hue-rotate(180deg) brightness(105%)',
  vintage: 'sepia(40%) contrast(90%) brightness(95%) saturate(80%)',
  dramatic: 'contrast(150%) brightness(90%) saturate(130%)',
  sketch: 'grayscale(100%) contrast(200%) brightness(110%)',
  emboss: 'contrast(120%) brightness(90%) saturate(0%)',
  bright: 'brightness(130%) contrast(110%) saturate(120%)',
  fade: 'brightness(110%) contrast(85%) saturate(70%)'
};
export let currentFilterPreset = 'none';

// ── 文字水印 ──
export let textItems = []; // { text, x, y, font, size, color, opacity, stroke }

// ── setter（跨文件赋值专用；对象属性赋值仍在各文件原地保留） ──
export function setEditorModal(v) { editorModal = v; }
export function setEditorCanvas(v) { editorCanvas = v; }
export function setEditorCtx(v) { editorCtx = v; }
export function setEditorCropper(v) { editorCropper = v; }
export function setEditorImgData(v) { editorImgData = v; }
export function setEditorOriginalSrc(v) { editorOriginalSrc = v; }
export function setEditorWorkingSrc(v) { editorWorkingSrc = v; }
export function setEditorOriginalW(v) { editorOriginalW = v; }
export function setEditorOriginalH(v) { editorOriginalH = v; }
export function setCurrentEditorMode(v) { currentEditorMode = v; }
export function setDrawState(v) { drawState = v; }
export function setTextState(v) { textState = v; }
export function setFreeRotateAngle(v) { freeRotateAngle = v; }
export function setFilterPresets(v) { filterPresets = v; }
export function setCurrentFilterPreset(v) { currentFilterPreset = v; }
export function setTextItems(v) { textItems = v; }
