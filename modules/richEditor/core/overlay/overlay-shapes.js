import { state } from '../../shared-state.js';
import { overlayImages, getNextZIndex, ensureOverlay, renderAll, transactRender, selectImage, getInsertY, getInsertX } from './overlay-images.js';
import { getActiveBlockId, getBlockElement, getBlockWidth, pxToPct } from './overlay-block.js';

let SHAPE_CATEGORIES = {
  line: ['line', 'arrow', 'arrowDouble', 'curve', 'polyline', 'scribble'],
  basic: ['rect', 'roundedRect', 'ellipse', 'circle', 'triangle', 'rightTriangle', 'diamond', 'pentagon', 'hexagon', 'octagon', 'parallelogram', 'trapezoid', 'cross', 'moon', 'cylinder', 'cube', 'donut', 'arc', 'plaque', 'bevel', 'frame', 'noSymbol', 'halfFrame'],
  arrowBlock: ['arrowRight'],
  flowchart: ['flowProcess', 'flowDecision', 'flowData', 'flowDocument', 'flowMultiDoc', 'flowTerminator', 'flowPreparation', 'flowManualInput', 'flowManualOperation', 'flowCard', 'flowDelay', 'flowDisplay', 'flowStoredData', 'flowInternalStorage', 'flowMerge', 'flowExtract', 'flowOr', 'flowSummingJunction', 'flowSort', 'flowCollate', 'flowOffPageLink', 'flowPredefinedProcess', 'flowAlternateProcess'],
  starBanner: ['star4', 'star', 'star6', 'star8', 'star12', 'star16', 'star24', 'star32', 'wave', 'doubleWave', 'scroll'],
  callout: ['calloutRect', 'calloutRounded', 'calloutOval', 'calloutCloud', 'calloutLine', 'calloutBorder', 'calloutAccent']
};
let SHAPE_TYPES = [];
Object.keys(SHAPE_CATEGORIES).forEach(function (k) {
  SHAPE_TYPES = SHAPE_TYPES.concat(SHAPE_CATEGORIES[k]);
});
let SHAPE_LABELS = {
  line: '直线', arrow: '箭头', arrowDouble: '双向箭头', curve: '曲线', polyline: '折线', scribble: '自由曲线',
  rect: '矩形', roundedRect: '圆角矩形', ellipse: '椭圆', circle: '圆形',
  triangle: '三角形', rightTriangle: '直角三角形', diamond: '菱形',
  pentagon: '五边形', hexagon: '六边形', octagon: '八边形',
  parallelogram: '平行四边形', trapezoid: '梯形', cross: '十字形',
  moon: '新月形',
  cylinder: '圆柱形', cube: '立方体', donut: '圆环', arc: '弧形',
  plaque: '缺角矩形', bevel: '斜角矩形', frame: '图文框',
  noSymbol: '禁止符号', halfFrame: '半框',
  arrowRight: '箭头',
  flowProcess: '过程', flowDecision: '决策', flowData: '数据', flowDocument: '文档',
  flowMultiDoc: '多文档', flowTerminator: '终止', flowPreparation: '准备',
  flowManualInput: '手动输入', flowManualOperation: '手动操作', flowCard: '卡片',
  flowDelay: '延迟', flowDisplay: '显示', flowStoredData: '存储数据',
  flowInternalStorage: '内部存储', flowMerge: '合并', flowExtract: '提取',
  flowOr: '或', flowSummingJunction: '汇总', flowSort: '排序', flowCollate: '整理', flowOffPageLink: '离页连接',
  flowPredefinedProcess: '预定义过程', flowAlternateProcess: '交替过程',
  star4: '四角星', star: '五角星', star6: '六角星', star8: '八角星',
  star12: '十二角星', star16: '十六角星', star24: '二十四角星', star32: '三十二角星',
  wave: '波形', doubleWave: '双波形', scroll: '卷形',
  calloutRect: '矩形标注', calloutRounded: '圆角矩形标注', calloutOval: '椭圆标注',
  calloutCloud: '云形标注', calloutLine: '线形标注', calloutBorder: '边框标注', calloutAccent: '强调标注'
};
export { SHAPE_CATEGORIES, SHAPE_LABELS };
export function buildShapeThumbnail(shapeType) {
  let sw = 1.5, m = 2.5, w = 24, h = 24;
  let head = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g fill="#2c6e7e" fill-opacity="0.35" stroke="#aef0ff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">';
  let foot = '</g></svg>';
  let p = '';

  if (/^(line|arrow|arrowDouble|curve|polyline|scribble)$/.test(shapeType)) {
    p += '<line x1="' + m + '" y1="12" x2="' + (w - m) + '" y2="12" fill="none"/>';
    if (shapeType === 'arrow') p += '<polygon points="22,12 16,9 16,15" fill="#aef0ff" fill-opacity="1"/>';
    else if (shapeType === 'arrowDouble') p += '<polygon points="22,12 16,9 16,15" fill="#aef0ff" fill-opacity="1"/><polygon points="2,12 8,9 8,15" fill="#aef0ff" fill-opacity="1"/>';
    else if (shapeType === 'curve') p = '<path d="M2,12 Q12,5 22,12" fill="none"/>';
    else if (shapeType === 'polyline') p = '<polyline points="2,12 8,3 14,20 20,5 22,12" fill="none"/>';
    else if (shapeType === 'scribble') p = '<path d="M2,12 C6,5 10,20 14,8 C18,18 20,10 22,12" fill="none"/>';
  } else if (/^(rect|roundedRect|plaque|bevel|frame|flowProcess|flowCard|flowInternalStorage|flowPreparation|flowManualInput|flowManualOperation|flowDisplay|flowStoredData|flowPredefinedProcess)$/.test(shapeType)) {
    let rx = (shapeType === 'roundedRect' || shapeType === 'flowTerminator') ? 4 : 0;
    p = '<rect x="' + m + '" y="3" width="' + (w - m * 2) + '" height="18" rx="' + rx + '"/>';
  } else if (/^(ellipse|circle|flowTerminator|flowDelay)$/.test(shapeType)) {
    p = '<ellipse cx="12" cy="12" rx="9" ry="8"/>';
  } else if (/^triangle$/.test(shapeType)) {
    p = '<polygon points="12,2 21,20 3,20"/>';
  } else if (/^rightTriangle$/.test(shapeType)) {
    p = '<polygon points="2,2 2,21 21,21"/>';
  } else if (/^diamond$/.test(shapeType)) {
    p = '<polygon points="12,1 22,12 12,23 2,12"/>';
  } else if (/^pentagon$/.test(shapeType)) {
    p = '<polygon points="12,2 21,9 18,21 6,21 3,9"/>';
  } else if (/^hexagon$/.test(shapeType)) {
    p = '<polygon points="7,2 17,2 22,12 17,22 7,22 2,12"/>';
  } else if (/^octagon$/.test(shapeType)) {
    p = '<polygon points="7,2 17,2 22,7 22,17 17,22 7,22 2,17 2,7"/>';
  } else if (/^parallelogram$/.test(shapeType)) {
    p = '<polygon points="5,3 22,3 19,21 2,21"/>';
  } else if (/^trapezoid$/.test(shapeType)) {
    p = '<polygon points="5,3 19,3 22,21 2,21"/>';
  } else if (/^cross$/.test(shapeType)) {
    p = '<path d="M7,2 L17,2 L17,7 L22,7 L22,17 L17,17 L17,22 L7,22 L7,17 L2,17 L2,7 L7,7Z"/>';
  } else if (/^heart$/.test(shapeType)) {
    p = '<path d="M12,21 C5,15 1,11 1,7 C1,4 4,2 7,2 C10,2 12,5 12,7 C12,5 14,2 17,2 C20,2 23,4 23,7 C23,11 19,15 12,21Z"/>';
  } else if (/^teardrop$/.test(shapeType)) {
    p = '<path d="M12,3 C6,9 5,14 12,21 C19,14 18,9 12,3Z"/>';
  } else if (/^moon$/.test(shapeType)) {
    p = '<path d="M18,4 C14,6 12,9 12,12 C12,16 14,19 18,20 C14,18 8,16 8,12 C8,8 14,6 18,4Z"/>';
  } else if (/^lightning$/.test(shapeType)) {
    p = '<polygon points="13,2 8,12 11,12 9,22 16,11 13,11 15,2"/>';
  } else if (/^cylinder$/.test(shapeType)) {
    p = '<ellipse cx="12" cy="5" rx="7" ry="2.5"/><path d="M5,5 L5,19 A7,2.5 0 0,0 19,19 L19,5" fill="none"/>';
  } else if (/^cube$/.test(shapeType)) {
    p = '<polygon points="5,7 5,19 12,22 19,19 19,7 12,4"/><polyline points="5,7 12,10 12,22" fill="none"/>';
  } else if (/^donut$/.test(shapeType)) {
    p = '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/>';
  } else if (/^arc$/.test(shapeType)) {
    p = '<path d="M18,6 A8,8 0 0,1 6,6" fill="none"/>';
  } else if (/^braceLeft$/.test(shapeType)) {
    p = '<path d="M20,4 C14,6 8,8 7,12 C8,16 14,18 20,20" fill="none"/>';
  } else if (/^braceRight$/.test(shapeType)) {
    p = '<path d="M4,4 C10,6 16,8 17,12 C16,16 10,18 4,20" fill="none"/>';
  } else if (/^bracketLeft$/.test(shapeType)) {
    p = '<path d="M17,2 L6,2 L6,5 L17,5 L17,7 L6,7 L6,17 L17,17 L17,19 L6,19 L6,22 L17,22" fill="none"/>';
  } else if (/^bracketRight$/.test(shapeType)) {
    p = '<path d="M7,2 L18,2 L18,5 L7,5 L7,7 L18,7 L18,17 L7,17 L7,19 L18,19 L18,22 L7,22" fill="none"/>';
  } else if (/^cloud$/.test(shapeType)) {
    p = '<path d="M7,15 A3,3 0 0,1 7,10 A4,4 0 0,1 4,12 A3,3 0 0,1 7,15 A4,4 0 0,1 10,17 A5,5 0 0,1 19,14 A3,3 0 0,1 16,9 A4,4 0 0,1 7,15Z"/>';
  } else if (/^noSymbol$/.test(shapeType)) {
    p = '<circle cx="12" cy="12" r="10"/><line x1="4" y1="4" x2="20" y2="20"/>';
  } else if (/^blockArc$/.test(shapeType)) {
    p = '<path d="M12,2 A10,10 0 0,1 22,9 L17,9 A5,5 0 0,0 12,7Z"/>';
  } else if (/^plus$/.test(shapeType)) {
    p = '<path d="M8,2 L16,2 L16,8 L22,8 L22,16 L16,16 L16,22 L8,22 L8,16 L2,16 L2,8 L8,8Z"/>';
  } else if (/^halfFrame$/.test(shapeType)) {
    p = '<path d="M2,2 L22,2 L22,7 L16,7 L16,22 L10,22 L10,7 L2,7Z"/>';
  } else if (/^(arrowRight|arrowLeft|arrowUp|arrowDown|chevron|pentagonArrow|notchedArrow|circularArrow|bentArrowUp|stripedArrow)$/.test(shapeType)) {
    p = '<polygon points="2,7 14,7 14,2 22,12 14,22 14,17 2,17"/>';
  } else if (/^(flowDecision|flowOr)$/.test(shapeType)) {
    p = '<polygon points="12,2 22,12 12,22 2,12"/>';
  } else if (/^(flowData|flowSort)$/.test(shapeType)) {
    p = '<polygon points="6,3 18,3 22,12 18,21 6,21 2,12"/>';
  } else if (/^(flowDocument|flowAlternateProcess)$/.test(shapeType)) {
    p = '<path d="M3,2 L22,2 L22,20 L3,20Z M22,2 L22,6 L18,6 L18,2Z"/>';
  } else if (/^flowMultiDoc$/.test(shapeType)) {
    p = '<path d="M2,5 L20,5 L20,22 L2,22Z M4,3 L22,3 L22,20"/>';
  } else if (/^flowMerge$/.test(shapeType)) {
    p = '<polygon points="12,2 22,12 12,22 2,12 M6,12 L18,12"/>';
  } else if (/^flowExtract$/.test(shapeType)) {
    p = '<polygon points="12,2 22,12 12,22 2,12 M12,8 L12,16 M7,12 L17,12"/>';
  } else if (/^flowSummingJunction$/.test(shapeType)) {
    p = '<circle cx="12" cy="12" r="10"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="12" y1="6" x2="12" y2="18"/>';
  } else if (/^flowCollate$/.test(shapeType)) {
    p = '<polygon points="4,2 20,2 22,14 12,22 2,14"/>';
  } else if (/^flowOffPageLink$/.test(shapeType)) {
    p = '<polygon points="12,2 22,12 12,22 7,15 12,12 7,9"/>';
  } else if (/^star\d*$/.test(shapeType)) {
    let pts = '';
    let sides = 5;
    if (shapeType === 'star4') sides = 4;
    else if (shapeType === 'star6') sides = 6;
    else if (shapeType === 'star8') sides = 8;
    else if (shapeType === 'star12') sides = 12;
    else if (shapeType === 'star16') sides = 16;
    else if (shapeType === 'star24') sides = 24;
    else if (shapeType === 'star32') sides = 32;
    let inner = 0.42;
    for (let si = 0; si < sides * 2; si++) {
      let a2 = Math.PI * si / sides - Math.PI / 2;
      let r2 = (si % 2 === 0) ? 10 : 10 * inner;
      pts += (12 + r2 * Math.cos(a2)).toFixed(1) + ',' + (12 + r2 * Math.sin(a2)).toFixed(1) + ' ';
    }
    p = '<polygon points="' + pts.trim() + '"/>';
  } else if (/^(wave|doubleWave)$/.test(shapeType)) {
    p = '<path d="M2,12 C5,5 9,20 12,12 C15,5 19,20 22,12" fill="none"/>';
  } else if (/^scroll$/.test(shapeType)) {
    p = '<path d="M5,2 L22,2 C22,8 18,10 22,14 C22,20 18,22 5,22Z"/>';
  } else if (/^ribbonUp$/.test(shapeType)) {
    p = '<polygon points="6,2 18,2 15,10 22,10 18,22 12,14 6,22 2,10 9,10"/>';
  } else if (/^ribbonDown$/.test(shapeType)) {
    p = '<polygon points="6,22 18,22 15,14 22,14 18,2 12,10 6,2 2,14 9,14"/>';
  } else if (/^calloutRect$/.test(shapeType)) {
    p = '<rect x="2" y="2" width="20" height="17"/><polygon points="12,19 15,22 17,19"/>';
  } else if (/^calloutRounded$/.test(shapeType)) {
    p = '<rect x="2" y="2" width="20" height="17" rx="3"/><polygon points="12,19 15,22 17,19"/>';
  } else if (/^calloutOval$/.test(shapeType)) {
    p = '<ellipse cx="12" cy="9" rx="10" ry="7.5"/><polygon points="12,16 15,20 17,16"/>';
  } else if (/^calloutCloud$/.test(shapeType)) {
    p = '<path d="M7,14 A3,3 0 0,1 7,9 A4,4 0 0,1 4,11 A3,3 0 0,1 7,14 A4,4 0 0,1 10,16 A5,5 0 0,1 19,13 A3,3 0 0,1 16,8 A4,4 0 0,1 7,14Z"/><polygon points="12,17 15,21 17,17"/>';
  } else if (/^calloutLine$/.test(shapeType)) {
    p = '<line x1="2" y1="12" x2="16" y2="12" fill="none"/><polygon points="16,12 12,9 12,15" fill="#aef0ff" fill-opacity="1"/>';
  } else if (/^calloutBorder$/.test(shapeType)) {
    p = '<rect x="2" y="2" width="20" height="12"/><polygon points="12,14 15,17 17,14"/><polygon points="12,14 9,17 7,14"/>';
  } else if (/^calloutAccent$/.test(shapeType)) {
    p = '<rect x="2" y="2" width="20" height="16"/><line x1="12" y1="18" x2="12" y2="22"/>';
  } else if (/^flowPunchedTape$/.test(shapeType)) {
    p = '<polygon points="6,2 18,2 22,22 2,22"/>';
  } else {
    p = '<rect x="' + m + '" y="3" width="' + (w - m * 2) + '" height="18" rx="1"/>';
  }

  return head + p + foot;
}

let DEFAULT_COLORS = {
  fill: 'rgba(44,110,126,0.3)',
  stroke: '#4a9eae',
  text: '#c8e6ff'
};
export { DEFAULT_COLORS };

function getShapeCategory(shapeType) {
  for (let cat in SHAPE_CATEGORIES) {
    if (SHAPE_CATEGORIES[cat].indexOf(shapeType) >= 0) return cat;
  }
  return 'basic';
}
export { getShapeCategory };
export function addShape(shapeType) {
  if (!SHAPE_TYPES.includes(shapeType)) shapeType = 'rect';
  ensureOverlay();
  let blockId = getActiveBlockId();
  if (!blockId) return;

  let blockW = getBlockWidth(blockId);
  let id = 'oly-shape-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
  let isLine = SHAPE_CATEGORIES.line.indexOf(shapeType) >= 0;

  let defaultSizes = {
    rect: [160, 120], roundedRect: [160, 120], ellipse: [140, 140], circle: [130, 130],
    triangle: [120, 100], rightTriangle: [120, 100], diamond: [110, 110],
    pentagon: [120, 110], hexagon: [120, 110], octagon: [120, 120],
    parallelogram: [150, 100], trapezoid: [150, 100],
    heart: [100, 90], teardrop: [100, 120], moon: [100, 100], lightning: [80, 120],
    cylinder: [120, 140], cube: [120, 120], donut: [120, 120], arc: [140, 100],
    plaque: [140, 100], bevel: [140, 100], frame: [150, 110], cross: [100, 100],
    star: [120, 120],
    arrowRight: [170, 80], arrowLeft: [170, 80], arrowUp: [80, 170], arrowDown: [80, 170],
    chevron: [140, 80], pentagonArrow: [150, 90], notchedArrow: [160, 80], circularArrow: [120, 120],
    flowProcess: [160, 80], flowDecision: [130, 100], flowData: [160, 80],
    flowDocument: [140, 100], flowMultiDoc: [140, 110], flowTerminator: [150, 80],
    flowPreparation: [130, 100], flowManualInput: [150, 80], flowManualOperation: [140, 80],
    flowCard: [130, 90], flowDelay: [100, 120],
    flowDisplay: [130, 100], flowStoredData: [130, 90], flowInternalStorage: [130, 80],
    flowMerge: [120, 120], flowExtract: [120, 120], flowOr: [100, 100],
    flowSummingJunction: [100, 100], flowSort: [120, 120], flowCollate: [120, 100], flowOffPageLink: [100, 100],
    star4: [100, 120], star6: [120, 120], star8: [120, 120],
    star12: [120, 120], star16: [130, 130], star24: [140, 140], star32: [150, 150],
    wave: [160, 60], doubleWave: [160, 80], scroll: [120, 100], ribbonUp: [140, 80], ribbonDown: [140, 80],
    calloutRect: [160, 120], calloutRounded: [160, 120], calloutOval: [150, 110],
    calloutCloud: [160, 120], calloutLine: [150, 80], calloutBorder: [160, 80], calloutAccent: [150, 80],
    line: [200, 2], arrow: [200, 16], arrowDouble: [200, 16], curve: [200, 40],
    polyline: [200, 50], scribble: [200, 40],
    braceLeft: [60, 150], braceRight: [60, 150], bracketLeft: [50, 140], bracketRight: [50, 140],
    cloud: [140, 90], noSymbol: [120, 120], blockArc: [120, 120], plus: [120, 120], halfFrame: [140, 100],
    bentArrowUp: [100, 160], stripedArrow: [170, 80],
    flowPredefinedProcess: [160, 80], flowAlternateProcess: [160, 80]
  };
  let size = defaultSizes[shapeType] || [160, 120];

  let x = Math.max(0, (blockW - size[0]) / 2);
  let y = getInsertY();

  let shapeData = {
    type: 'shape',
    id: id,
    blockId: blockId,
    shapeType: shapeType,
    category: getShapeCategory(shapeType),
    x: x,
    y: y,
    width: size[0],
    height: size[1],
    zIndex: getNextZIndex(),
    fillColor: isLine ? 'none' : DEFAULT_COLORS.fill,
    strokeColor: DEFAULT_COLORS.stroke,
    strokeWidth: 2,
    opacity: 1,
    leftPct: pxToPct(x, blockW),
    widthPct: pxToPct(size[0], blockW),
    _refWidth: blockW
  };
  overlayImages.push(shapeData);
  selectImage(id);
  transactRender();
}

export function renderShapeContent(item, imgData) {
  let svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.style.cssText = 'display:block;pointer-events:none;overflow:visible;';
  svg.setAttribute('viewBox', '0 0 ' + imgData.width + ' ' + imgData.height);
  svg.setAttribute('preserveAspectRatio', 'none');

  let shapeEl;
  let st = imgData.shapeType;
  let w = imgData.width;
  let h = imgData.height;
  let sw = imgData.strokeWidth || 2;
  let isLine = imgData.category === 'line';
  let m = sw / 2;

  if (st === 'line') {
    shapeEl = createLine(w, h, m, m, w - m, h - m, false, false);
  } else if (st === 'arrow') {
    shapeEl = createLine(w, h, m, m, w - m, h - m, false, true);
  } else if (st === 'arrowDouble') {
    shapeEl = createLine(w, h, m, m, w - m, h - m, true, true);
  } else if (st === 'curve') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    let cx = w / 2, cy = h / 2;
    shapeEl.setAttribute('d', 'M' + m + ',' + m + ' Q' + cx + ',' + cy + ' ' + (w - m) + ',' + (h - m));
  } else if (st === 'polyline') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    let segW = w / 4, segH = h / 4;
    shapeEl.setAttribute('points', m + ',' + m + ' ' + segW + ',' + (h - m) + ' ' + (segW * 2) + ',' + m + ' ' + (segW * 3) + ',' + (h - m) + ' ' + (w - m) + ',' + (h - m));
  } else if (st === 'scribble') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    shapeEl.setAttribute('d', 'M' + m + ',' + m + ' C' + (w * 0.25) + ',' + (h * 0.9) + ' ' + (w * 0.25) + ',' + (h * 0.1) + ' ' + (w * 0.5) + ',' + (h * 0.5) + ' C' + (w * 0.75) + ',' + (h * 0.9) + ' ' + (w * 0.75) + ',' + (h * 0.1) + ' ' + (w - m) + ',' + (h - m));
  } else if (st === 'rect' || st === 'flowProcess' || st === 'flowCard' || st === 'flowInternalStorage' || st === 'plaque') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    shapeEl.setAttribute('x', sw); shapeEl.setAttribute('y', sw);
    shapeEl.setAttribute('width', w - sw * 2); shapeEl.setAttribute('height', h - sw * 2);
  } else if (st === 'roundedRect' || st === 'flowTerminator' || st === 'flowStoredData' || st === 'calloutRounded') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    shapeEl.setAttribute('x', sw); shapeEl.setAttribute('y', sw);
    shapeEl.setAttribute('width', w - sw * 2); shapeEl.setAttribute('height', h - sw * 2);
    shapeEl.setAttribute('rx', Math.min(w, h) * 0.15); shapeEl.setAttribute('ry', Math.min(w, h) * 0.15);
  } else if (st === 'ellipse' || st === 'calloutOval') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    shapeEl.setAttribute('cx', w / 2); shapeEl.setAttribute('cy', h / 2);
    shapeEl.setAttribute('rx', w / 2 - sw); shapeEl.setAttribute('ry', h / 2 - sw);
  } else if (st === 'circle' || st === 'flowOr') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    let r = Math.min(w, h) / 2 - sw;
    shapeEl.setAttribute('cx', w / 2); shapeEl.setAttribute('cy', h / 2);
    shapeEl.setAttribute('rx', r); shapeEl.setAttribute('ry', r);
  } else if (st === 'triangle' || st === 'flowMerge') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    shapeEl.setAttribute('points', w / 2 + ',' + sw + ' ' + (w - sw) + ',' + (h - sw) + ' ' + sw + ',' + (h - sw));
  } else if (st === 'rightTriangle') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    shapeEl.setAttribute('points', sw + ',' + sw + ' ' + sw + ',' + (h - sw) + ' ' + (w - sw) + ',' + (h - sw));
  } else if (st === 'diamond' || st === 'flowDecision') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    shapeEl.setAttribute('points', w / 2 + ',' + sw + ' ' + (w - sw) + ',' + h / 2 + ' ' + w / 2 + ',' + (h - sw) + ' ' + sw + ',' + h / 2);
  } else if (st === 'pentagon') {
    shapeEl = createRegularPolygon(5, w, h, sw);
  } else if (st === 'hexagon' || st === 'flowPreparation') {
    shapeEl = createRegularPolygon(6, w, h, sw);
  } else if (st === 'octagon') {
    shapeEl = createRegularPolygon(8, w, h, sw);
  } else if (st === 'star') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    shapeEl.setAttribute('points', createStarPoints(5, w, h, sw));
  } else if (st === 'star4') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    shapeEl.setAttribute('points', createStarPoints(4, w, h, sw));
  } else if (st === 'star6') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    shapeEl.setAttribute('points', createStarPoints(6, w, h, sw));
  } else if (st === 'star8') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    shapeEl.setAttribute('points', createStarPoints(8, w, h, sw));
  } else if (st === 'star12') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    shapeEl.setAttribute('points', createStarPoints(12, w, h, sw));
  } else if (st === 'star16') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    shapeEl.setAttribute('points', createStarPoints(16, w, h, sw));
  } else if (st === 'star24') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    shapeEl.setAttribute('points', createStarPoints(24, w, h, sw));
  } else if (st === 'star32') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    shapeEl.setAttribute('points', createStarPoints(32, w, h, sw));
  } else if (st === 'parallelogram' || st === 'flowData') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    let skew = w * 0.2;
    shapeEl.setAttribute('points', (sw + skew) + ',' + sw + ' ' + (w - sw) + ',' + sw + ' ' + (w - sw - skew) + ',' + (h - sw) + ' ' + sw + ',' + (h - sw));
  } else if (st === 'trapezoid' || st === 'flowManualOperation') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    let topInset = w * 0.25;
    shapeEl.setAttribute('points', (sw + topInset) + ',' + sw + ' ' + (w - sw - topInset) + ',' + sw + ' ' + (w - sw) + ',' + (h - sw) + ' ' + sw + ',' + (h - sw));
  } else if (st === 'heart') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    let cxH = w / 2, cyH = h * 0.35, rH = Math.min(w, h) * 0.25;
    shapeEl.setAttribute('d', 'M' + cxH + ',' + (h - sw) +
      ' C' + (cxH - rH * 1.5) + ',' + (cyH + rH) + ' ' + sw + ',' + (cyH * 0.5) + ' ' + cxH + ',' + (sw + rH * 0.6) +
      ' C' + (w - sw) + ',' + (cyH * 0.5) + ' ' + (cxH + rH * 1.5) + ',' + (cyH + rH) + ' ' + cxH + ',' + (h - sw));
  } else if (st === 'teardrop') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    let tcx = w / 2, tcy = h * 0.3, tr = Math.min(w * 0.45, h * 0.3);
    shapeEl.setAttribute('d', 'M' + tcx + ',' + (tcy - tr) +
      ' A' + tr + ',' + tr + ' 0 0,0 ' + tcx + ',' + (tcy + tr) +
      ' L' + tcx + ',' + (h - sw) + ' Z');
  } else if (st === 'moon') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    let mcx = w * 0.45, mcy = h / 2, mr = Math.min(w, h) * 0.42;
    shapeEl.setAttribute('d', 'M' + (mcx + mr * 0.3) + ',' + (mcy - mr) +
      ' A' + mr + ',' + mr + ' 0 1,1 ' + (mcx + mr * 0.3) + ',' + (mcy + mr) +
      ' A' + (mr * 0.75) + ',' + (mr * 0.75) + ' 0 1,0 ' + (mcx + mr * 0.3) + ',' + (mcy - mr) + ' Z');
  } else if (st === 'lightning') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    shapeEl.setAttribute('points',
      (w * 0.5) + ',' + sw + ' ' + (w * 0.25) + ',' + (h * 0.45) + ' ' +
      (w * 0.55) + ',' + (h * 0.4) + ' ' + (w * 0.3) + ',' + (h * 0.7) + ' ' +
      (w * 0.6) + ',' + (h * 0.55) + ' ' + (w * 0.35) + ',' + (h - sw));
  } else if (st === 'cylinder') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    let cyRx = w / 2 - sw, cyRy = Math.min(h * 0.12, w * 0.25), cyTop = sw + cyRy, cyBot = h - sw - cyRy;
    let body = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    body.setAttribute('d', 'M' + sw + ',' + cyTop +
      ' L' + sw + ',' + cyBot +
      ' A' + cyRx + ',' + cyRy + ' 0 0,0 ' + (w - sw) + ',' + cyBot +
      ' L' + (w - sw) + ',' + cyTop + ' Z');
    let topEl = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    topEl.setAttribute('cx', w / 2); topEl.setAttribute('cy', cyTop);
    topEl.setAttribute('rx', cyRx); topEl.setAttribute('ry', cyRy);
    shapeEl.appendChild(body);
    shapeEl.appendChild(topEl);
  } else if (st === 'cube') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    let fx = w * 0.25, fy = h * 0.28, bx = w * 0.75, by = h * 0.12, by2 = h * 0.72, bby = h - sw;
    shapeEl.setAttribute('points',
      fx + ',' + fy + ' ' + bx + ',' + by + ' ' + (w - sw) + ',' + by + ' ' +
      (w - sw) + ',' + by2 + ' ' + bx + ',' + bby + ' ' + fx + ',' + (fy + h * 0.44) + ' ' +
      (fx - fx * 0.4) + ',' + (fy + h * 0.24) + ' ' + (fx - fx * 0.4) + ',' + (fy - h * 0.24));
  } else if (st === 'donut') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    let doCx = w / 2, doCy = h / 2, doR = Math.min(w, h) / 2 - sw, doIr = doR * 0.45;
    shapeEl.setAttribute('fill-rule', 'evenodd');
    shapeEl.setAttribute('d', 'M' + doCx + ',' + (doCy - doR) +
      ' A' + doR + ',' + doR + ' 0 1,0 ' + doCx + ',' + (doCy + doR) +
      ' A' + doR + ',' + doR + ' 0 1,0 ' + doCx + ',' + (doCy - doR) + ' Z' +
      ' M' + doCx + ',' + (doCy - doIr) +
      ' A' + doIr + ',' + doIr + ' 0 1,1 ' + doCx + ',' + (doCy + doIr) +
      ' A' + doIr + ',' + doIr + ' 0 1,1 ' + doCx + ',' + (doCy - doIr) + ' Z');
  } else if (st === 'arc') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    let arcCx = w / 2, arcCy = h * 0.9, arcR = Math.min(w, h) * 0.8;
    shapeEl.setAttribute('d', 'M' + sw + ',' + (h - sw) +
      ' A' + arcR + ',' + arcR + ' 0 0,1 ' + (w - sw) + ',' + (h - sw));
    shapeEl.setAttribute('fill', 'none');
  } else if (st === 'bevel') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    let bv = Math.min(w, h) * 0.12;
    shapeEl.setAttribute('points', sw + ',' + (sw + bv) + ' ' + (sw + bv) + ',' + sw + ' ' +
      (w - sw - bv) + ',' + sw + ' ' + (w - sw) + ',' + (sw + bv) + ' ' +
      (w - sw) + ',' + (h - sw - bv) + ' ' + (w - sw - bv) + ',' + (h - sw) + ' ' +
      (sw + bv) + ',' + (h - sw) + ' ' + sw + ',' + (h - sw - bv));
  } else if (st === 'frame') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    let frIn = Math.min(w, h) * 0.12;
    shapeEl.setAttribute('fill-rule', 'evenodd');
    shapeEl.setAttribute('d', 'M' + sw + ',' + sw + ' L' + (w - sw) + ',' + sw +
      ' L' + (w - sw) + ',' + (h - sw) + ' L' + sw + ',' + (h - sw) + ' Z' +
      ' M' + frIn + ',' + frIn + ' L' + (w - frIn) + ',' + frIn +
      ' L' + (w - frIn) + ',' + (h - frIn) + ' L' + frIn + ',' + (h - frIn) + ' Z');
  } else if (st === 'cross') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    let barW = w * 0.3, barH = h * 0.3;
    let crX = (w - barW) / 2, crY = (h - barH) / 2;
    shapeEl.setAttribute('d', 'M' + crX + ',' + sw +
      ' L' + (crX + barW) + ',' + sw +
      ' L' + (crX + barW) + ',' + crY +
      ' L' + (w - sw) + ',' + crY +
      ' L' + (w - sw) + ',' + (crY + barH) +
      ' L' + (crX + barW) + ',' + (crY + barH) +
      ' L' + (crX + barW) + ',' + (h - sw) +
      ' L' + crX + ',' + (h - sw) +
      ' L' + crX + ',' + (crY + barH) +
      ' L' + sw + ',' + (crY + barH) +
      ' L' + sw + ',' + crY +
      ' L' + crX + ',' + crY + ' Z');
  } else if (st === 'arrowRight' || st === 'arrowLeft' || st === 'arrowUp' || st === 'arrowDown') {
    let ap = calcArrowPoints(st, w, h, sw);
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    shapeEl.setAttribute('points', ap);
  } else if (st === 'chevron') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    shapeEl.setAttribute('points',
      sw + ',' + (h * 0.2) + ' ' + (w * 0.6) + ',' + (h * 0.2) + ' ' +
      (w * 0.6) + ',' + sw + ' ' + (w - sw) + ',' + (h / 2) + ' ' +
      (w * 0.6) + ',' + (h - sw) + ' ' + (w * 0.6) + ',' + (h * 0.8) + ' ' +
      sw + ',' + (h * 0.8));
  } else if (st === 'pentagonArrow') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    shapeEl.setAttribute('points',
      sw + ',' + (h * 0.35) + ' ' + (w * 0.5) + ',' + (h * 0.35) + ' ' +
      (w * 0.5) + ',' + sw + ' ' + (w - sw) + ',' + (h / 2) + ' ' +
      (w * 0.5) + ',' + (h - sw) + ' ' + (w * 0.5) + ',' + (h * 0.65) + ' ' +
      sw + ',' + (h * 0.65));
  } else if (st === 'notchedArrow') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    shapeEl.setAttribute('points',
      sw + ',' + (h * 0.25) + ' ' + (w * 0.6) + ',' + (h * 0.25) + ' ' +
      (w * 0.6) + ',' + sw + ' ' + (w - sw) + ',' + (h / 2) + ' ' +
      (w * 0.6) + ',' + (h - sw) + ' ' + (w * 0.6) + ',' + (h * 0.75) + ' ' +
      sw + ',' + (h * 0.75) + ' ' + sw + ',' + (h * 0.6) + ' ' +
      (w * 0.35) + ',' + (h * 0.6) + ' ' + (w * 0.35) + ',' + (h * 0.4) + ' ' +
      sw + ',' + (h * 0.4));
  } else if (st === 'circularArrow') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    let caCx = w / 2, caCy = h / 2, caR = Math.min(w, h) / 2 - sw;
    shapeEl.setAttribute('fill', 'none');
    shapeEl.setAttribute('d', 'M' + (caCx + caR * 0.7) + ',' + (caCy - caR * 0.7) +
      ' A' + caR + ',' + caR + ' 0 1,1 ' + (caCx - caR * 0.5) + ',' + (caCy + caR * 0.85));
    let caHead = createArrowHead(caCx - caR * 0.5, caCy + caR * 0.85, caCx - caR * 0.3, caCy + caR * 0.7, -1, caR * 0.25);
    let caG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    caG.appendChild(shapeEl);
    if (caHead) caG.appendChild(caHead);
    shapeEl = caG;
  } else if (st === 'flowDocument') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    let fdCY = h * 0.85;
    shapeEl.setAttribute('d', 'M' + sw + ',' + sw +
      ' L' + (w - sw) + ',' + sw +
      ' L' + (w - sw) + ',' + fdCY +
      ' Q' + (w * 0.75) + ',' + (fdCY + h * 0.1) + ' ' + (w * 0.5) + ',' + fdCY +
      ' Q' + (w * 0.25) + ',' + (fdCY - h * 0.1) + ' ' + sw + ',' + fdCY + ' Z');
  } else if (st === 'flowMultiDoc') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    let mdCY = h * 0.72;
    let md1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    md1.setAttribute('d', 'M' + (sw + w * 0.08) + ',' + (sw + h * 0.1) +
      ' L' + (w - sw - w * 0.08) + ',' + (sw + h * 0.1) +
      ' L' + (w - sw - w * 0.08) + ',' + mdCY +
      ' Q' + (w * 0.7) + ',' + (mdCY + h * 0.08) + ' ' + (w * 0.5) + ',' + mdCY +
      ' Q' + (w * 0.3) + ',' + (mdCY - h * 0.08) + ' ' + (sw + w * 0.08) + ',' + mdCY + ' Z');
    let md2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    md2.setAttribute('d', 'M' + sw + ',' + sw +
      ' L' + (w - sw - w * 0.04) + ',' + sw +
      ' L' + (w - sw - w * 0.04) + ',' + (mdCY - h * 0.06) +
      ' Q' + (w * 0.65) + ',' + (mdCY + h * 0.02) + ' ' + (w * 0.5) + ',' + (mdCY - h * 0.06) +
      ' Q' + (w * 0.35) + ',' + (mdCY - h * 0.14) + ' ' + sw + ',' + (mdCY - h * 0.06) + ' Z');
    shapeEl.appendChild(md1);
    shapeEl.appendChild(md2);
  } else if (st === 'flowManualInput') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    shapeEl.setAttribute('points', sw + ',' + (sw + h * 0.2) + ' ' + sw + ',' + (h - sw) + ' ' +
      (w - sw) + ',' + (h - sw) + ' ' + (w - sw) + ',' + sw + ' ' +
      sw + ',' + (sw + h * 0.2));
  } else if (st === 'flowDelay') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    let dlR = h / 2 - sw;
    shapeEl.setAttribute('d', 'M' + sw + ',' + (h - sw) +
      ' L' + (w - dlR) + ',' + (h - sw) +
      ' A' + dlR + ',' + dlR + ' 0 0,1 ' + (w - dlR) + ',' + sw +
      ' L' + sw + ',' + sw + ' Z');
  } else if (st === 'flowDisplay') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    let dsR = Math.min(w, h * 0.4);
    shapeEl.setAttribute('d', 'M' + sw + ',' + (h - sw) +
      ' L' + (w - dsR) + ',' + (h - sw) +
      ' A' + dsR + ',' + (h / 2 - sw) + ' 0 0,1 ' + (w - dsR) + ',' + sw +
      ' L' + sw + ',' + sw + ' Z');
  } else if (st === 'flowExtract') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    shapeEl.setAttribute('points', w / 2 + ',' + sw + ' ' +
      (w - sw) + ',' + (h * 0.35) + ' ' +
      (w - sw) + ',' + (h - sw) + ' ' +
      sw + ',' + (h - sw) + ' ' +
      sw + ',' + (h * 0.35));
  } else if (st === 'flowSummingJunction') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    let sjR = Math.min(w, h) / 2 - sw;
    let sjCircle = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    sjCircle.setAttribute('cx', w / 2); sjCircle.setAttribute('cy', h / 2);
    sjCircle.setAttribute('rx', sjR); sjCircle.setAttribute('ry', sjR);
    let sjLineH = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    sjLineH.setAttribute('x1', w * 0.2); sjLineH.setAttribute('y1', h / 2);
    sjLineH.setAttribute('x2', w * 0.8); sjLineH.setAttribute('y2', h / 2);
    sjLineH.setAttribute('stroke', imgData.strokeColor || DEFAULT_COLORS.stroke);
    sjLineH.setAttribute('stroke-width', sw);
    let sjLineV = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    sjLineV.setAttribute('x1', w / 2); sjLineV.setAttribute('y1', h * 0.2);
    sjLineV.setAttribute('x2', w / 2); sjLineV.setAttribute('y2', h * 0.8);
    sjLineV.setAttribute('stroke', imgData.strokeColor || DEFAULT_COLORS.stroke);
    sjLineV.setAttribute('stroke-width', sw);
    shapeEl.appendChild(sjCircle);
    shapeEl.appendChild(sjLineH);
    shapeEl.appendChild(sjLineV);
  } else if (st === 'flowSort') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    shapeEl.setAttribute('points', w / 2 + ',' + sw + ' ' +
      (w - sw) + ',' + (h * 0.35) + ' ' +
      (w * 0.6) + ',' + (h * 0.35) + ' ' +
      (w * 0.6) + ',' + (h - sw) + ' ' +
      (w * 0.4) + ',' + (h - sw) + ' ' +
      (w * 0.4) + ',' + (h * 0.35) + ' ' +
      sw + ',' + (h * 0.35));
  } else if (st === 'flowCollate') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    shapeEl.setAttribute('points', w / 2 + ',' + sw + ' ' +
      (w - sw) + ',' + (h - sw) + ' ' + sw + ',' + (h - sw));
  } else if (st === 'flowOffPageLink') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    shapeEl.setAttribute('points', sw + ',' + sw + ' ' +
      (w - sw) + ',' + (h / 2) + ' ' + sw + ',' + (h - sw) + ' ' +
      (sw + w * 0.12) + ',' + (h / 2));
  } else if (st === 'calloutRect') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    let rx = Math.min(w, h) * 0.1;
    let tailW = w * 0.15, tailH = h * 0.2, tailX = w * 0.15;
    let bodyH = h - tailH;
    shapeEl.setAttribute('d', 'M' + sw + ',' + (bodyH - rx) +
      ' Q' + sw + ',' + sw + ' ' + (sw + rx) + ',' + sw +
      ' L' + (w - sw - rx) + ',' + sw +
      ' Q' + (w - sw) + ',' + sw + ' ' + (w - sw) + ',' + (sw + rx) +
      ' L' + (w - sw) + ',' + (bodyH - rx) +
      ' Q' + (w - sw) + ',' + bodyH + ' ' + (w - sw - rx) + ',' + bodyH +
      ' L' + (tailX + tailW) + ',' + bodyH +
      ' L' + (tailX + tailW / 2) + ',' + (h - sw) +
      ' L' + tailX + ',' + bodyH +
      ' L' + (sw + rx) + ',' + bodyH +
      ' Q' + sw + ',' + bodyH + ' ' + sw + ',' + (bodyH - rx) + ' Z');
  } else if (st === 'calloutCloud') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    let clCx = w / 2, clCy = h / 2, clR = Math.min(w, h) * 0.3;
    let clBumps = 6;
    let clD = '';
    for (let clI = 0; clI < clBumps; clI++) {
      let clAngle = (Math.PI * 2 * clI) / clBumps - Math.PI / 2;
      let clBx = clCx + clR * Math.cos(clAngle);
      let clBy = clCy + clR * Math.sin(clAngle);
      clD += (clI === 0 ? 'M' : '') + clBx + ',' + clBy + ' ';
    }
    clD += 'Z';
    let tailTx = w * 0.12, tailTy = h * 0.85;
    clD += ' M' + tailTx + ',' + (tailTy - h * 0.08) + ' L' + (tailTx + w * 0.1) + ',' + (h - sw) + ' L' + (tailTx + w * 0.15) + ',' + (tailTy - h * 0.05);
    shapeEl.setAttribute('d', clD);
  } else if (st === 'calloutLine') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    shapeEl.setAttribute('d', 'M' + sw + ',' + (h - sw) +
      ' L' + (w * 0.25) + ',' + (h * 0.35) + ' L' + (w - sw) + ',' + sw);
    shapeEl.setAttribute('fill', 'none');
  } else if (st === 'calloutBorder') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    shapeEl.setAttribute('d', 'M' + sw + ',' + sw +
      ' L' + (w * 0.85) + ',' + sw +
      ' L' + (w * 0.85) + ',' + (h * 0.7) +
      ' L' + (w * 0.55) + ',' + (h * 0.7) +
      ' L' + (w * 0.45) + ',' + (h - sw) +
      ' L' + (w * 0.4) + ',' + (h * 0.7) +
      ' L' + sw + ',' + (h * 0.7) + ' Z');
  } else if (st === 'calloutAccent') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    shapeEl.setAttribute('d', 'M' + sw + ',' + sw +
      ' L' + (w - sw) + ',' + sw +
      ' L' + (w * 0.7) + ',' + (h * 0.5) +
      ' L' + (w - sw) + ',' + (h - sw) +
      ' L' + sw + ',' + (h - sw) + ' Z');
  } else if (st === 'wave') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    shapeEl.setAttribute('d', 'M' + sw + ',' + (h / 2) +
      ' Q' + (w * 0.25) + ',' + sw + ' ' + (w * 0.5) + ',' + (h / 2) +
      ' T' + (w - sw) + ',' + (h / 2));
    shapeEl.setAttribute('fill', 'none');
  } else if (st === 'doubleWave') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    shapeEl.setAttribute('d', 'M' + sw + ',' + (h * 0.35) +
      ' Q' + (w * 0.25) + ',' + sw + ' ' + (w * 0.5) + ',' + (h * 0.35) +
      ' T' + (w - sw) + ',' + (h * 0.35) +
      ' M' + sw + ',' + (h * 0.65) +
      ' Q' + (w * 0.25) + ',' + (h * 0.45) + ' ' + (w * 0.5) + ',' + (h * 0.65) +
      ' T' + (w - sw) + ',' + (h * 0.65));
    shapeEl.setAttribute('fill', 'none');
  } else if (st === 'scroll') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    let scR = Math.min(w * 0.12, h * 0.08);
    shapeEl.setAttribute('d', 'M' + sw + ',' + (h * 0.7) +
      ' A' + scR + ',' + scR + ' 0 0,0 ' + (sw + scR * 2) + ',' + (h * 0.7) +
      ' L' + (w - sw) + ',' + (h * 0.7) +
      ' A' + scR + ',' + scR + ' 0 0,1 ' + (w - sw) + ',' + (h * 0.85) +
      ' L' + sw + ',' + (h * 0.85) +
      ' A' + scR + ',' + scR + ' 0 0,1 ' + sw + ',' + (h * 0.7) + ' Z' +
      ' M' + sw + ',' + (h * 0.15) +
      ' A' + scR + ',' + scR + ' 0 0,0 ' + (sw + scR * 2) + ',' + (h * 0.15) +
      ' L' + (w - sw) + ',' + (h * 0.15) +
      ' A' + scR + ',' + scR + ' 0 0,1 ' + (w - sw) + ',' + (h * 0.3) +
      ' L' + sw + ',' + (h * 0.3) +
      ' A' + scR + ',' + scR + ' 0 0,1 ' + sw + ',' + (h * 0.15) + ' Z');
  } else if (st === 'ribbonUp') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    shapeEl.setAttribute('points',
      (w * 0.3) + ',' + sw + ' ' + (w * 0.7) + ',' + sw + ' ' +
      (w * 0.65) + ',' + (h * 0.5) + ' ' + (w - sw) + ',' + (h * 0.5) + ' ' +
      (w * 0.7) + ',' + (h - sw) + ' ' + (w * 0.5) + ',' + (h * 0.6) + ' ' +
      (w * 0.3) + ',' + (h - sw) + ' ' + (w * 0.35) + ',' + (h * 0.5) + ' ' +
      sw + ',' + (h * 0.5));
  } else if (st === 'ribbonDown') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    shapeEl.setAttribute('points',
      (w * 0.3) + ',' + (h - sw) + ' ' + (w * 0.7) + ',' + (h - sw) + ' ' +
      (w * 0.65) + ',' + (h * 0.5) + ' ' + (w - sw) + ',' + (h * 0.5) + ' ' +
      (w * 0.7) + ',' + sw + ' ' + (w * 0.5) + ',' + (h * 0.4) + ' ' +
      (w * 0.3) + ',' + sw + ' ' + (w * 0.35) + ',' + (h * 0.5) + ' ' +
      sw + ',' + (h * 0.5));
  } else if (st === 'braceLeft') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    shapeEl.setAttribute('d', 'M' + (w * 0.2) + ',' + (h * 0.1) +
      ' C' + (w * 0.5) + ',' + (h * 0.28) + ' ' + (w * 0.5) + ',' + (h * 0.44) + ' ' + (w * 0.38) + ',' + (h / 2) +
      ' C' + (w * 0.5) + ',' + (h * 0.56) + ' ' + (w * 0.5) + ',' + (h * 0.72) + ' ' + (w * 0.2) + ',' + (h * 0.9) +
      ' L' + (w * 0.8) + ',' + (h * 0.9) +
      ' L' + (w * 0.8) + ',' + (h * 0.78) +
      ' L' + (w * 0.2) + ',' + (h * 0.78) +
      ' C' + (w * 0.4) + ',' + (h * 0.65) + ' ' + (w * 0.4) + ',' + (h * 0.35) + ' ' + (w * 0.2) + ',' + (h * 0.22) +
      ' L' + (w * 0.8) + ',' + (h * 0.22) +
      ' L' + (w * 0.8) + ',' + (h * 0.1) + ' Z');
  } else if (st === 'braceRight') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    shapeEl.setAttribute('d', 'M' + (w * 0.8) + ',' + (h * 0.1) +
      ' C' + (w * 0.5) + ',' + (h * 0.28) + ' ' + (w * 0.5) + ',' + (h * 0.44) + ' ' + (w * 0.62) + ',' + (h / 2) +
      ' C' + (w * 0.5) + ',' + (h * 0.56) + ' ' + (w * 0.5) + ',' + (h * 0.72) + ' ' + (w * 0.8) + ',' + (h * 0.9) +
      ' L' + (w * 0.2) + ',' + (h * 0.9) +
      ' L' + (w * 0.2) + ',' + (h * 0.78) +
      ' L' + (w * 0.8) + ',' + (h * 0.78) +
      ' C' + (w * 0.6) + ',' + (h * 0.65) + ' ' + (w * 0.6) + ',' + (h * 0.35) + ' ' + (w * 0.8) + ',' + (h * 0.22) +
      ' L' + (w * 0.2) + ',' + (h * 0.22) +
      ' L' + (w * 0.2) + ',' + (h * 0.1) + ' Z');
  } else if (st === 'bracketLeft') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    shapeEl.setAttribute('d', 'M' + (w * 0.7) + ',' + sw +
      ' L' + (w * 0.3) + ',' + sw +
      ' L' + (w * 0.3) + ',' + (h * 0.18) +
      ' L' + (w - sw) + ',' + (h * 0.18) +
      ' L' + (w - sw) + ',' + (h * 0.28) +
      ' L' + (w * 0.3) + ',' + (h * 0.28) +
      ' L' + (w * 0.3) + ',' + (h * 0.72) +
      ' L' + (w - sw) + ',' + (h * 0.72) +
      ' L' + (w - sw) + ',' + (h * 0.82) +
      ' L' + (w * 0.3) + ',' + (h * 0.82) +
      ' L' + (w * 0.3) + ',' + (h - sw) +
      ' L' + (w * 0.7) + ',' + (h - sw) + ' Z');
  } else if (st === 'bracketRight') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    shapeEl.setAttribute('d', 'M' + (w * 0.3) + ',' + sw +
      ' L' + (w * 0.7) + ',' + sw +
      ' L' + (w * 0.7) + ',' + (h * 0.18) +
      ' L' + sw + ',' + (h * 0.18) +
      ' L' + sw + ',' + (h * 0.28) +
      ' L' + (w * 0.7) + ',' + (h * 0.28) +
      ' L' + (w * 0.7) + ',' + (h * 0.72) +
      ' L' + sw + ',' + (h * 0.72) +
      ' L' + sw + ',' + (h * 0.82) +
      ' L' + (w * 0.7) + ',' + (h * 0.82) +
      ' L' + (w * 0.7) + ',' + (h - sw) +
      ' L' + (w * 0.3) + ',' + (h - sw) + ' Z');
  } else if (st === 'cloud') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    shapeEl.setAttribute('d', 'M' + (w * 0.28) + ',' + (h * 0.62) +
      ' A' + (w * 0.1) + ',' + (h * 0.15) + ' 0 0,0 ' + (w * 0.28) + ',' + (h * 0.35) +
      ' A' + (w * 0.18) + ',' + (h * 0.25) + ' 0 0,0 ' + (w * 0.12) + ',' + (h * 0.58) +
      ' A' + (w * 0.12) + ',' + (h * 0.12) + ' 0 0,0 ' + (w * 0.28) + ',' + (h * 0.65) +
      ' A' + (w * 0.18) + ',' + (h * 0.12) + ' 0 0,0 ' + (w * 0.52) + ',' + (h * 0.68) +
      ' A' + (w * 0.22) + ',' + (h * 0.13) + ' 0 0,0 ' + (w * 0.8) + ',' + (h * 0.55) +
      ' A' + (w * 0.13) + ',' + (h * 0.15) + ' 0 0,0 ' + (w * 0.65) + ',' + (h * 0.35) +
      ' A' + (w * 0.2) + ',' + (h * 0.22) + ' 0 0,0 ' + (w * 0.28) + ',' + (h * 0.62) + ' Z');
  } else if (st === 'noSymbol') {
    let gNo = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    let circleNo = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circleNo.setAttribute('cx', w / 2);
    circleNo.setAttribute('cy', h / 2);
    circleNo.setAttribute('r', Math.min(w, h) / 2 - sw);
    gNo.appendChild(circleNo);
    let lineNo = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    lineNo.setAttribute('x1', w * 0.18);
    lineNo.setAttribute('y1', h * 0.18);
    lineNo.setAttribute('x2', w * 0.82);
    lineNo.setAttribute('y2', h * 0.82);
    lineNo.setAttribute('stroke-width', sw * 1.5);
    gNo.appendChild(lineNo);
    shapeEl = gNo;
  } else if (st === 'blockArc') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    let baR = Math.min(w, h) / 2 - sw;
    let baIr = baR * 0.35;
    shapeEl.setAttribute('d', 'M' + (w / 2) + ',' + sw +
      ' A' + baR + ',' + baR + ' 0 0,1 ' + (w - sw) + ',' + (h / 2) +
      ' A' + baR + ',' + baR + ' 0 0,1 ' + (w * 0.7) + ',' + (h - sw) +
      ' L' + (w * 0.7) + ',' + (h - sw - baIr) +
      ' A' + baIr + ',' + baIr + ' 0 0,0 ' + (w - sw - baIr) + ',' + (h / 2) +
      ' A' + baIr + ',' + baIr + ' 0 0,0 ' + (w / 2) + ',' + (sw + baIr) + ' Z');
  } else if (st === 'plus') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    let pT = w * 0.22;
    shapeEl.setAttribute('points',
      (w / 2 - pT) + ',' + sw + ' ' +
      (w / 2 + pT) + ',' + sw + ' ' +
      (w / 2 + pT) + ',' + (h / 2 - pT) + ' ' +
      (w - sw) + ',' + (h / 2 - pT) + ' ' +
      (w - sw) + ',' + (h / 2 + pT) + ' ' +
      (w / 2 + pT) + ',' + (h / 2 + pT) + ' ' +
      (w / 2 + pT) + ',' + (h - sw) + ' ' +
      (w / 2 - pT) + ',' + (h - sw) + ' ' +
      (w / 2 - pT) + ',' + (h / 2 + pT) + ' ' +
      sw + ',' + (h / 2 + pT) + ' ' +
      sw + ',' + (h / 2 - pT) + ' ' +
      (w / 2 - pT) + ',' + (h / 2 - pT));
  } else if (st === 'halfFrame') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    shapeEl.setAttribute('d', 'M' + sw + ',' + sw +
      ' L' + (w - sw) + ',' + sw +
      ' L' + (w - sw) + ',' + (h * 0.25) +
      ' L' + (w * 0.7) + ',' + (h * 0.25) +
      ' L' + (w * 0.7) + ',' + (h - sw) +
      ' L' + (w * 0.4) + ',' + (h - sw) +
      ' L' + (w * 0.4) + ',' + (h * 0.25) +
      ' L' + sw + ',' + (h * 0.25) + ' Z');
  } else if (st === 'bentArrowUp') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    shapeEl.setAttribute('points',
      (w * 0.45) + ',' + (h - sw) + ' ' +
      (w * 0.55) + ',' + (h - sw) + ' ' +
      (w * 0.55) + ',' + (h * 0.35) + ' ' +
      (w - sw) + ',' + (h * 0.35) + ' ' +
      (w / 2) + ',' + sw + ' ' +
      sw + ',' + (h * 0.35) + ' ' +
      (w * 0.45) + ',' + (h * 0.35));
  } else if (st === 'stripedArrow') {
    shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    shapeEl.setAttribute('points',
      sw + ',' + (h * 0.35) + ' ' +
      (w * 0.55) + ',' + (h * 0.35) + ' ' +
      (w * 0.55) + ',' + sw + ' ' +
      (w - sw) + ',' + (h / 2) + ' ' +
      (w * 0.55) + ',' + (h - sw) + ' ' +
      (w * 0.55) + ',' + (h * 0.65) + ' ' +
      sw + ',' + (h * 0.65));
  } else if (st === 'flowPredefinedProcess') {
    let fppg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    let fppr = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    fppr.setAttribute('x', sw);
    fppr.setAttribute('y', sw);
    fppr.setAttribute('width', w - sw * 2);
    fppr.setAttribute('height', h - sw * 2);
    fppg.appendChild(fppr);
    let sbW = Math.max(4, w * 0.08);
    let fppl = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    fppl.setAttribute('x1', sw + sbW);
    fppl.setAttribute('y1', sw);
    fppl.setAttribute('x2', sw + sbW);
    fppl.setAttribute('y2', h - sw);
    fppl.setAttribute('stroke-width', sw);
    fppg.appendChild(fppl);
    let fppr2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    fppr2.setAttribute('x1', w - sw - sbW);
    fppr2.setAttribute('y1', sw);
    fppr2.setAttribute('x2', w - sw - sbW);
    fppr2.setAttribute('y2', h - sw);
    fppr2.setAttribute('stroke-width', sw);
    fppg.appendChild(fppr2);
    shapeEl = fppg;
  } else if (st === 'flowAlternateProcess') {
    let fapg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    let fapr = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    fapr.setAttribute('x', sw + 3);
    fapr.setAttribute('y', sw + 3);
    fapr.setAttribute('width', w - sw * 2 - 6);
    fapr.setAttribute('height', h - sw * 2 - 6);
    fapr.setAttribute('rx', h * 0.2);
    fapr.setAttribute('ry', h * 0.2);
    fapg.appendChild(fapr);
    shapeEl = fapg;
  }

  if (shapeEl) {
    shapeEl.setAttribute('fill', imgData.fillColor || DEFAULT_COLORS.fill);
    shapeEl.setAttribute('stroke', imgData.strokeColor || DEFAULT_COLORS.stroke);
    shapeEl.setAttribute('stroke-width', sw);
    if (isLine) shapeEl.setAttribute('fill', 'none');
    shapeEl.setAttribute('opacity', imgData.opacity != null ? imgData.opacity : 1);
    svg.appendChild(shapeEl);
  }

  item.appendChild(svg);
}

function createLine(w, h, x1, y1, x2, y2, headStart, headEnd) {
  let g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  let line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', x1); line.setAttribute('y1', y1);
  line.setAttribute('x2', x2); line.setAttribute('y2', y2);
  g.appendChild(line);

  let headSize = Math.min(w, h) * 0.4;
  if (headStart) {
    let ah1 = createArrowHead(x1, y1, x2, y2, -1, headSize);
    if (ah1) g.appendChild(ah1);
  }
  if (headEnd) {
    let ah2 = createArrowHead(x2, y2, x1, y1, -1, headSize);
    if (ah2) g.appendChild(ah2);
  }
  return g;
}

function createArrowHead(tipX, tipY, fromX, fromY, dir, size) {
  let poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  let dx = tipX - fromX, dy = tipY - fromY;
  let len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return null;
  let ux = dx / len, uy = dy / len;
  let px = -uy, py = ux;
  let baseX = tipX - ux * size * dir * -1;
  let baseY = tipY - uy * size * dir * -1;
  let hw = size * 0.4;
  poly.setAttribute('points',
    tipX + ',' + tipY + ' ' +
    (baseX + px * hw) + ',' + (baseY + py * hw) + ' ' +
    (baseX - px * hw) + ',' + (baseY - py * hw));
  poly.setAttribute('fill', 'currentColor');
  return poly;
}

function calcArrowPoints(dir, w, h, sw) {
  if (dir === 'arrowLeft') {
    return (w - sw) + ',' + (h * 0.35) + ' ' +
      (w * 0.35) + ',' + (h * 0.35) + ' ' +
      (w * 0.35) + ',' + sw + ' ' +
      sw + ',' + (h / 2) + ' ' +
      (w * 0.35) + ',' + (h - sw) + ' ' +
      (w * 0.35) + ',' + (h * 0.65) + ' ' +
      (w - sw) + ',' + (h * 0.65);
  }
  if (dir === 'arrowUp') {
    return (w * 0.35) + ',' + (h - sw) + ' ' +
      (w * 0.35) + ',' + (h * 0.35) + ' ' +
      sw + ',' + (h * 0.35) + ' ' +
      (w / 2) + ',' + sw + ' ' +
      (w - sw) + ',' + (h * 0.35) + ' ' +
      (w * 0.65) + ',' + (h * 0.35) + ' ' +
      (w * 0.65) + ',' + (h - sw);
  }
  if (dir === 'arrowDown') {
    return (w * 0.35) + ',' + sw + ' ' +
      (w * 0.35) + ',' + (h * 0.65) + ' ' +
      sw + ',' + (h * 0.65) + ' ' +
      (w / 2) + ',' + (h - sw) + ' ' +
      (w - sw) + ',' + (h * 0.65) + ' ' +
      (w * 0.65) + ',' + (h * 0.65) + ' ' +
      (w * 0.65) + ',' + sw;
  }
  return sw + ',' + (h * 0.35) + ' ' +
    (w * 0.65) + ',' + (h * 0.35) + ' ' +
    (w * 0.65) + ',' + sw + ' ' +
    (w - sw) + ',' + (h / 2) + ' ' +
    (w * 0.65) + ',' + (h - sw) + ' ' +
    (w * 0.65) + ',' + (h * 0.65) + ' ' +
    sw + ',' + (h * 0.65);
}

function createRegularPolygon(sides, w, h, sw) {
  let poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  let cx = w / 2, cy = h / 2;
  let rx = w / 2 - sw, ry = h / 2 - sw;
  let pts = [];
  for (let i = 0; i < sides; i++) {
    let angle = (Math.PI * 2 * i) / sides - Math.PI / 2;
    pts.push((cx + rx * Math.cos(angle)).toFixed(1) + ',' + (cy + ry * Math.sin(angle)).toFixed(1));
  }
  poly.setAttribute('points', pts.join(' '));
  return poly;
}

function createStarPoints(points, w, h, sw) {
  let cx = w / 2, cy = h / 2;
  let outerR = Math.min(w, h) / 2 - sw;
  let innerR = outerR * 0.4;
  let pts = [];
  for (let i = 0; i < points * 2; i++) {
    let angle = (Math.PI * i) / points - Math.PI / 2;
    let r = i % 2 === 0 ? outerR : innerR;
    pts.push((cx + r * Math.cos(angle)).toFixed(1) + ',' + (cy + r * Math.sin(angle)).toFixed(1));
  }
  return pts.join(' ');
}
