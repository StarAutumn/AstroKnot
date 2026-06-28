// ============================================================
//  overlay-excel.js — 表格 overlay 类型（Univer 预览 + 编辑）
// ============================================================
import { overlayImages, getNextZIndex, ensureOverlay, renderAll, transactRender, selectImage, getInsertY } from './overlay-images.js';
import { getActiveBlockId, getBlockWidth, pxToPct } from './overlay-block.js';
import { openExcelEditor } from './overlay-excel-editor.js';

// ── 插入空白表格 ──
export function addExcel() {
  let blockId = getActiveBlockId();
  let blockW = blockId ? getBlockWidth(blockId) : 800;
  let w = Math.min(640, blockW - 40);
  let h = Math.min(400, 500);
  let x = Math.max(0, (blockW - w) / 2);
  let y = getInsertY();

  let excelData = {
    type: 'excel',
    id: 'oly-excel-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
    blockId: blockId,
    x: x,
    y: y,
    width: w,
    height: h,
    zIndex: getNextZIndex(),
    leftPct: pxToPct(x, blockW),
    widthPct: pxToPct(w, blockW),
    _refWidth: blockW,
    // Univer 快照数据（序列化）
    univerSnapshot: null,
    // 默认 3 行 4 列示例数据（IWorkbookData 格式）
    defaultData: {
      id: 'wb-default',
      name: '工作簿',
      sheetOrder: ['sheet1'],
      sheets: {
        sheet1: {
          id: 'sheet1',
          name: 'Sheet1',
          rowCount: 100,
          columnCount: 26,
          defaultRowHeight: 24,
          defaultColumnWidth: 80,
          cellData: {
            0: { 0: { v: '' }, 1: { v: 'A' }, 2: { v: 'B' }, 3: { v: 'C' } },
            1: { 0: { v: '1' }, 1: { v: '' }, 2: { v: '' }, 3: { v: '' } },
            2: { 0: { v: '2' }, 1: { v: '' }, 2: { v: '' }, 3: { v: '' } },
            3: { 0: { v: '3' }, 1: { v: '' }, 2: { v: '' }, 3: { v: '' } }
          }
        }
      }
    }
  };

  overlayImages.push(excelData);
  selectImage(excelData.id);
  transactRender();
}

// ── 渲染表格预览内容 ──
export function renderExcelContent(item, imgData) {
  let wrapper = document.createElement('div');
  wrapper.style.cssText =
    'width:100%;height:100%;position:relative;overflow:hidden;' +
    'background:#1a1a2e;border:1px solid #2c6e7e;border-radius:4px;';

  // 标题栏
  let titleBar = document.createElement('div');
  titleBar.style.cssText =
    'height:28px;background:#16213e;display:flex;align-items:center;padding:0 8px;' +
    'border-bottom:1px solid #2c6e7e;font-size:12px;color:#aef0ff;gap:6px;flex-shrink:0;';

  let icon = document.createElement('span');
  icon.innerHTML = '&#128202;';
  icon.style.fontSize = '13px';

  let title = document.createElement('span');
  title.textContent = '表格';
  title.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';

  let editBtn = document.createElement('span');
  editBtn.innerHTML = '&#9998;';
  editBtn.style.cssText = 'cursor:pointer;font-size:13px;opacity:0.7;';
  editBtn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  editBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    openExcelEditor(imgData);
  });

  titleBar.appendChild(icon);
  titleBar.appendChild(title);
  titleBar.appendChild(editBtn);

  // 表格预览区
  let preview = document.createElement('div');
  preview.style.cssText =
    'flex:1;overflow:auto;padding:4px;font-size:11px;color:#ccc;font-family:monospace;';

  // 渲染简单网格预览
  let data = imgData.univerSnapshot || imgData.defaultData;
  if (data && data.sheets) {
    let sheetKeys = data.sheetOrder || Object.keys(data.sheets);
    let firstSheet = data.sheets[sheetKeys[0]];
    if (firstSheet && firstSheet.cellData) {
      let table = document.createElement('table');
      table.style.cssText =
        'border-collapse:collapse;width:100%;table-layout:fixed;';

      let cellData = firstSheet.cellData;
      let styles = data.styles || {};  // 样式字典
      let maxRow = 0, maxCol = 0;
      Object.keys(cellData).forEach(function (r) {
        let ri = parseInt(r);
        if (ri > maxRow) maxRow = ri;
        Object.keys(cellData[r]).forEach(function (c) {
          let ci = parseInt(c);
          if (ci > maxCol) maxCol = ci;
        });
      });

      // 限制预览行数
      let showRows = Math.min(maxRow + 1, 20);
      let showCols = Math.min(maxCol + 1, 10);

      for (let r = 0; r < showRows; r++) {
        let tr = document.createElement('tr');
        for (let c = 0; c < showCols; c++) {
          let td = document.createElement('td');
          td.style.cssText =
            'border:1px solid #2c6e7e;padding:2px 4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' +
            (r === 0 ? 'background:#16213e;color:#aef0ff;font-weight:bold;' : '');
          let cell = cellData[r] && cellData[r][c];

          // 应用单元格样式
          if (cell) {
            let displayText = cell.v != null ? String(cell.v) : '';
            // cell.p 为富文本，优先使用
            if (cell.p && cell.p.body && cell.p.body.dataStream) {
              displayText = cell.p.body.dataStream.replace(/\r?\n/g, ' ').replace(/\u0012/g, '').trim();
            }
            td.textContent = displayText;

            // 应用样式（通过 cell.s 样式ID 或内联样式）
            let styleId = cell.s;
            let styleData = null;
            if (typeof styleId === 'string' && styles[styleId]) {
              styleData = styles[styleId];
            } else if (typeof styleId === 'object' && styleId !== null) {
              // 内联样式对象
              styleData = styleId;
            }
            if (styleData) {
              applyCellStyle(td, styleData);
            }
          }

          tr.appendChild(td);
        }
        table.appendChild(tr);
      }

      if (maxRow + 1 > showRows || maxCol + 1 > showCols) {
        let more = document.createElement('div');
        more.style.cssText = 'text-align:center;color:#666;padding:4px;font-size:10px;';
        more.textContent = '... 双击编辑查看完整表格 ...';
        preview.appendChild(table);
        preview.appendChild(more);
      } else {
        preview.appendChild(table);
      }
    }
  }

  wrapper.appendChild(titleBar);
  wrapper.appendChild(preview);
  item.appendChild(wrapper);
}

// ── 应用 Univer 单元格样式到 DOM 元素 ──
// Univer IStyleBase/IStyleData 使用缩写属性名：
//   ff=fontFamily, fs=fontSize, it=italic(0/1), bl=bold(0/1),
//   cl=foreground color, bg=background color,
//   ul=underline, st=strikethrough, ol=overline,
//   va=baselineOffset, n=numfmt, bd=border, bbl=bottomBorderLine
//   ht=horizontalAlign, vt=verticalAlign, tr=textRotation,
//   tb=wrapStrategy, pd=padding
function applyCellStyle(td, styleData) {
  // 字体
  if (styleData.ff) td.style.fontFamily = styleData.ff;
  if (styleData.fs) td.style.fontSize = styleData.fs + 'px';
  if (styleData.it === 1) td.style.fontStyle = 'italic';
  if (styleData.bl === 1) td.style.fontWeight = 'bold';

  // 文本装饰线（下划线 / 删除线 / 上划线）
  // Univer 格式: { s: 1, cl: { rgb: "#rrggbb" } }  或  { s: 0 }
  let deco = [];
  if (styleData.ul && styleData.ul.s === 1) deco.push('underline');
  if (styleData.st && styleData.st.s === 1) deco.push('line-through');
  if (styleData.ol && styleData.ol.s === 1) deco.push('overline');
  if (deco.length) td.style.textDecoration = deco.join(' ');

  // 前景色（字体颜色）  格式: { rgb: "#rrggbb" }  或字符串
  if (styleData.cl) {
    let c = styleData.cl;
    if (c.rgb) td.style.color = c.rgb;              // 已含 # 前缀
    else if (typeof c === 'string') td.style.color = c;
  }
  // 背景色
  if (styleData.bg) {
    let b = styleData.bg;
    if (b.rgb) td.style.backgroundColor = b.rgb;
    else if (typeof b === 'string') td.style.backgroundColor = b;
  }

  // 边框 bd
  // IBorderData: { t, b, l, r, tl_br, bl_tr, tl_bc, bc_tr, ml_tr, tl_mr }
  // 四边: t=上 b=下 l=左 r=右
  // 斜线: tl_br=左上→右下 bl_tr=左下→右上
  //       tl_bc=左上→底部中 bc_tr=底部中→右上
  //       ml_tr=左中→右上 tl_mr=左上→右中
  // IBorderStyleData: { s: BorderStyleType, cl: { rgb: "#rrggbb" } }
  if (styleData.bd) {
    let bd = styleData.bd;
    function borderCss(item) {
      if (!item || item.s === 0 || item.s === undefined) return '';
      let styleMap = {
        0: 'none', 1: 'solid', 2: 'solid', 3: 'dashed',
        4: 'dotted', 5: 'double', 6: 'solid', 7: 'dashed',
        8: 'dashed', 9: 'dashed', 10: 'dashed',
        11: 'dashed', 12: 'dashed', 13: 'dashed'
      };
      let widthMap = {
        0: '0', 1: '1px', 2: '2px', 3: '1px',
        4: '1px', 5: '3px', 6: '1px', 7: '2px',
        8: '1px', 9: '2px', 10: '1px',
        11: '2px', 12: '1px', 13: '2px'
      };
      let style = styleMap[item.s] || 'solid';
      let width = widthMap[item.s] || '1px';
      let color = (item.cl && item.cl.rgb) ? item.cl.rgb : '#999999';
      return style + ' ' + width + ' ' + color;
    }
    // 四边边框
    if (bd.t) td.style.borderTop = borderCss(bd.t);
    if (bd.b) td.style.borderBottom = borderCss(bd.b);
    if (bd.l) td.style.borderLeft = borderCss(bd.l);
    if (bd.r) td.style.borderRight = borderCss(bd.r);
    // 斜线边框 — 用 CSS background 渐变模拟
    let diagonals = [];
    if (bd.tl_br) diagonals.push({ type: 'tl_br', css: borderCss(bd.tl_br) });
    if (bd.bl_tr) diagonals.push({ type: 'bl_tr', css: borderCss(bd.bl_tr) });
    if (bd.tl_bc) diagonals.push({ type: 'tl_bc', css: borderCss(bd.tl_bc) });
    if (bd.bc_tr) diagonals.push({ type: 'bc_tr', css: borderCss(bd.bc_tr) });
    if (bd.ml_tr) diagonals.push({ type: 'ml_tr', css: borderCss(bd.ml_tr) });
    if (bd.tl_mr) diagonals.push({ type: 'tl_mr', css: borderCss(bd.tl_mr) });
    if (diagonals.length > 0) {
      applyDiagonalBorders(td, diagonals);
    }
  }

  // 对齐  ht=horizontal  vt=vertical  (枚举: 0=left/top, 1=center, 2=right/bottom)
  if (styleData.ht !== undefined) {
    let hMap = { 0: 'left', 1: 'center', 2: 'right' };
    td.style.textAlign = hMap[styleData.ht] || 'left';
  }
  if (styleData.vt !== undefined) {
    let vMap = { 0: 'top', 1: 'middle', 2: 'bottom' };
    td.style.verticalAlign = vMap[styleData.vt] || 'middle';
  }

  // 文字旋转  tr 可以是数字角度或对象 { a: angle }
  if (styleData.tr !== undefined) {
    let angle = typeof styleData.tr === 'number' ? styleData.tr : (styleData.tr.a || 0);
    if (angle) td.style.transform = 'rotate(' + (-angle) + 'deg)';
  }
}

// ── 斜线边框渲染（用于中文斜线表头） ──
// 使用内联 SVG 叠加在单元格上
function applyDiagonalBorders(td, diagonals) {
  td.style.position = 'relative';
  let svgNS = 'http://www.w3.org/2000/svg';
  let svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';

  diagonals.forEach(function (d) {
    let line = document.createElementNS(svgNS, 'line');
    line.setAttribute('stroke', '#999999');
    line.setAttribute('stroke-width', '1');
    // 从 borderCss 中提取颜色和线宽
    let css = d.css;
    let parts = css.split(' ');
    if (parts.length >= 3) {
      // parts: [style, width, color]
      line.setAttribute('stroke-width', parts[1].replace('px', ''));
      line.setAttribute('stroke', parts[2]);
      if (parts[0] === 'dashed') line.setAttribute('stroke-dasharray', '4,2');
      else if (parts[0] === 'dotted') line.setAttribute('stroke-dasharray', '1,2');
    }
    // 根据斜线类型设置起止坐标
    // 坐标使用百分比，通过 viewBox 映射
    let x1 = '0', y1 = '0', x2 = '100', y2 = '100';
    switch (d.type) {
      case 'tl_br': x1 = '0'; y1 = '0'; x2 = '100'; y2 = '100'; break;
      case 'bl_tr': x1 = '0'; y1 = '100'; x2 = '100'; y2 = '0'; break;
      case 'tl_bc': x1 = '0'; y1 = '0'; x2 = '50'; y2 = '100'; break;
      case 'bc_tr': x1 = '50'; y1 = '100'; x2 = '100'; y2 = '0'; break;
      case 'ml_tr': x1 = '0'; y1 = '50'; x2 = '100'; y2 = '0'; break;
      case 'tl_mr': x1 = '0'; y1 = '0'; x2 = '100'; y2 = '50'; break;
    }
    line.setAttribute('x1', x1 + '%');
    line.setAttribute('y1', y1 + '%');
    line.setAttribute('x2', x2 + '%');
    line.setAttribute('y2', y2 + '%');
    svg.appendChild(line);
  });

  td.appendChild(svg);
}
