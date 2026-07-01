// ============================================================
//  overlay-excel-editor.js — Univer 表格编辑器弹窗
//  通过 CDN UMD 全局命名空间加载 Univer
// ============================================================
import { renderAll, transactRender, overlayImages } from './overlay-images.js';
import { extractChartData, buildEChartsOption } from './overlay-chart.js';

let editorModal = null;
let univerInstance = null;
let univerAPI = null;
let currentExcelData = null;
let zIndexObserver = null;

// ── MutationObserver：确保 Univer 浮动元素 z-index 高于编辑器弹窗 ──
function startZIndexObserver() {
  stopZIndexObserver();
  function fixZIndex() {
    // 提升 body 上所有 Univer 浮动元素的 z-index
    document.querySelectorAll('[class*="univer"]').forEach(function (el) {
      if (el === editorModal) return;
      if (el.closest('#excelEditorModal')) return;
      let style = getComputedStyle(el);
      let pos = style.position;
      if (pos === 'fixed' || pos === 'absolute') {
        el.style.zIndex = '100000';
      }
    });
  }
  fixZIndex();
  zIndexObserver = new MutationObserver(function () {
    fixZIndex();
  });
  zIndexObserver.observe(document.body, { childList: true, subtree: true });
}

function stopZIndexObserver() {
  if (zIndexObserver) {
    zIndexObserver.disconnect();
    zIndexObserver = null;
  }
}

// ── 检查 Univer 是否已通过 CDN 加载 ──
function getUniverGlobals() {
  if (!window.UniverPresets || !window.UniverPresetSheetsCore || !window.UniverCore) {
    return null;
  }
  return {
    createUniver: window.UniverPresets.createUniver,
    LocaleType: window.UniverCore.LocaleType,
    mergeLocales: window.UniverCore.mergeLocales,
    // 核心预设
    UniverSheetsCorePreset: window.UniverPresetSheetsCore.UniverSheetsCorePreset,
    UniverPresetSheetsCoreZhCN: window.UniverPresetSheetsCoreZhCN,
    // 筛选
    UniverSheetsFilterPreset: window.UniverPresetSheetsFilter
      ? window.UniverPresetSheetsFilter.UniverSheetsFilterPreset : null,
    UniverPresetSheetsFilterZhCN: window.UniverPresetSheetsFilterZhCN || null,
    // 排序
    UniverSheetsSortPreset: window.UniverPresetSheetsSort
      ? window.UniverPresetSheetsSort.UniverSheetsSortPreset : null,
    UniverPresetSheetsSortZhCN: window.UniverPresetSheetsSortZhCN || null,
    // 查找替换
    UniverSheetsFindReplacePreset: window.UniverPresetSheetsFindReplace
      ? window.UniverPresetSheetsFindReplace.UniverSheetsFindReplacePreset : null,
    UniverPresetSheetsFindReplaceZhCN: window.UniverPresetSheetsFindReplaceZhCN || null,
    // 条件格式
    UniverSheetsConditionalFormattingPreset: window.UniverPresetSheetsConditionalFormatting
      ? window.UniverPresetSheetsConditionalFormatting.UniverSheetsConditionalFormattingPreset : null,
    UniverPresetSheetsConditionalFormattingZhCN: window.UniverPresetSheetsConditionalFormattingZhCN || null,
    // 数据验证
    UniverSheetsDataValidationPreset: window.UniverPresetSheetsDataValidation
      ? window.UniverPresetSheetsDataValidation.UniverSheetsDataValidationPreset : null,
    UniverPresetSheetsDataValidationZhCN: window.UniverPresetSheetsDataValidationZhCN || null,
    // 绘图
    UniverSheetsDrawingPreset: window.UniverPresetSheetsDrawing
      ? window.UniverPresetSheetsDrawing.UniverSheetsDrawingPreset : null,
    UniverPresetSheetsDrawingZhCN: window.UniverPresetSheetsDrawingZhCN || null,
    // 超链接
    UniverSheetsHyperLinkPreset: window.UniverPresetSheetsHyperLink
      ? window.UniverPresetSheetsHyperLink.UniverSheetsHyperLinkPreset : null,
    UniverPresetSheetsHyperLinkZhCN: window.UniverPresetSheetsHyperLinkZhCN || null,
    // 评论
    UniverSheetsThreadCommentPreset: window.UniverPresetSheetsThreadComment
      ? window.UniverPresetSheetsThreadComment.UniverSheetsThreadCommentPreset : null,
    UniverPresetSheetsThreadCommentZhCN: window.UniverPresetSheetsThreadCommentZhCN || null
  };
}

// ── 打开编辑器 ──
export function openExcelEditor(imgData) {
  currentExcelData = imgData;

  let univerGlobals = getUniverGlobals();
  if (!univerGlobals) {
    alert('Univer 表格编辑器未加载，请检查网络连接或 CDN 资源是否可用。');
    return;
  }

  // 创建弹窗
  if (!editorModal) {
    editorModal = document.createElement('div');
    editorModal.id = 'excelEditorModal';
    editorModal.style.cssText =
      'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:99999;' +
      'display:none;flex-direction:column;align-items:center;justify-content:center;';
    document.body.appendChild(editorModal);
  }

  editorModal.innerHTML = '';
  editorModal.style.display = 'flex';

  // 编辑器容器
  let container = document.createElement('div');
  container.style.cssText =
    'width:95vw;height:85vh;max-width:1600px;max-height:1100px;' +
    'background:#1a1a2e;border-radius:8px;overflow:visible;' +
    'display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,0.5);';

  // 顶部工具栏
  let toolbar = document.createElement('div');
  toolbar.style.cssText =
    'height:40px;background:#16213e;display:flex;align-items:center;padding:0 12px;' +
    'border-bottom:1px solid #2c6e7e;gap:8px;flex-shrink:0;';

  let titleSpan = document.createElement('span');
  titleSpan.style.cssText = 'flex:1;color:#aef0ff;font-size:14px;font-weight:bold;';
  titleSpan.textContent = '表格编辑器 (Univer)';

  let saveBtn = createBtn('保存', '#0a8a6e', function () {
    saveToOverlay();
  });

  let cancelBtn = createBtn('取消', '#6e2c2c', function () {
    closeEditor();
  });

  toolbar.appendChild(titleSpan);
  toolbar.appendChild(saveBtn);
  toolbar.appendChild(cancelBtn);

  // Univer 挂载点
  let containerId = 'univer-container-' + Date.now();
  let univerContainer = document.createElement('div');
  univerContainer.id = containerId;
  univerContainer.style.cssText = 'flex:1;overflow:visible;';

  container.appendChild(toolbar);
  container.appendChild(univerContainer);
  editorModal.appendChild(container);

  // 点击背景关闭
  editorModal.addEventListener('mousedown', function (e) {
    if (e.target === editorModal) closeEditor();
  });

  // ESC 关闭
  let escHandler = function (e) {
    if (e.key === 'Escape') {
      closeEditor();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);

  // 初始化 Univer
  const {
    createUniver, LocaleType, mergeLocales,
    UniverSheetsCorePreset, UniverPresetSheetsCoreZhCN,
    UniverSheetsFilterPreset, UniverPresetSheetsFilterZhCN,
    UniverSheetsSortPreset, UniverPresetSheetsSortZhCN,
    UniverSheetsFindReplacePreset, UniverPresetSheetsFindReplaceZhCN,
    UniverSheetsConditionalFormattingPreset, UniverPresetSheetsConditionalFormattingZhCN,
    UniverSheetsDataValidationPreset, UniverPresetSheetsDataValidationZhCN,
    UniverSheetsDrawingPreset, UniverPresetSheetsDrawingZhCN,
    UniverSheetsHyperLinkPreset, UniverPresetSheetsHyperLinkZhCN,
    UniverSheetsThreadCommentPreset, UniverPresetSheetsThreadCommentZhCN
  } = univerGlobals;

  // 准备初始数据
  let workbookData = null;
  if (imgData.univerSnapshot) {
    workbookData = JSON.parse(JSON.stringify(imgData.univerSnapshot));
  } else if (imgData.defaultData) {
    workbookData = JSON.parse(JSON.stringify(imgData.defaultData));
  }

  try {
    // 合并所有语言包
    let localeParts = [UniverPresetSheetsCoreZhCN];
    if (UniverPresetSheetsFilterZhCN) localeParts.push(UniverPresetSheetsFilterZhCN);
    if (UniverPresetSheetsSortZhCN) localeParts.push(UniverPresetSheetsSortZhCN);
    if (UniverPresetSheetsFindReplaceZhCN) localeParts.push(UniverPresetSheetsFindReplaceZhCN);
    if (UniverPresetSheetsConditionalFormattingZhCN) localeParts.push(UniverPresetSheetsConditionalFormattingZhCN);
    if (UniverPresetSheetsDataValidationZhCN) localeParts.push(UniverPresetSheetsDataValidationZhCN);
    if (UniverPresetSheetsDrawingZhCN) localeParts.push(UniverPresetSheetsDrawingZhCN);
    if (UniverPresetSheetsHyperLinkZhCN) localeParts.push(UniverPresetSheetsHyperLinkZhCN);
    if (UniverPresetSheetsThreadCommentZhCN) localeParts.push(UniverPresetSheetsThreadCommentZhCN);

    let localeData = mergeLocales.apply(null, localeParts.filter(Boolean));

    // 构建 presets 列表
    let presets = [
      UniverSheetsCorePreset({
        container: containerId
      })
    ];
    if (UniverSheetsFilterPreset) presets.push(UniverSheetsFilterPreset());
    if (UniverSheetsSortPreset) presets.push(UniverSheetsSortPreset());
    if (UniverSheetsFindReplacePreset) presets.push(UniverSheetsFindReplacePreset());
    if (UniverSheetsConditionalFormattingPreset) presets.push(UniverSheetsConditionalFormattingPreset());
    if (UniverSheetsDataValidationPreset) presets.push(UniverSheetsDataValidationPreset());
    if (UniverSheetsDrawingPreset) presets.push(UniverSheetsDrawingPreset());
    if (UniverSheetsHyperLinkPreset) presets.push(UniverSheetsHyperLinkPreset());
    if (UniverSheetsThreadCommentPreset) presets.push(UniverSheetsThreadCommentPreset());

    const result = createUniver({
      locale: LocaleType.ZH_CN,
      locales: {
        [LocaleType.ZH_CN]: localeData
      },
      presets: presets
    });

    univerInstance = result.univer;
    univerAPI = result.univerAPI;

    // 创建工作簿
    if (workbookData) {
      univerAPI.createWorkbook(workbookData);
    } else {
      univerAPI.createWorkbook({});
    }

    // 启动 z-index 修复，确保 Univer 浮动元素在弹窗之上
    startZIndexObserver();
  } catch (e) {
    console.error('[ExcelEditor] Univer 初始化失败:', e);
    univerContainer.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#ff6b6b;font-size:14px;padding:20px;text-align:center;">' +
      'Univer 初始化失败: ' + e.message + '</div>';
  }
}

// ── 保存数据到 overlay ──
function saveToOverlay() {
  if (!univerAPI || !currentExcelData) {
    closeEditor();
    return;
  }

  try {
    let activeWorkbook = univerAPI.getActiveWorkbook();
    if (activeWorkbook) {
      let snapshot = activeWorkbook.save();
      // 深拷贝，防止 Univer 实例销毁后引用失效
      currentExcelData.univerSnapshot = JSON.parse(JSON.stringify(snapshot));
      delete currentExcelData.defaultData;
    }
  } catch (e) {
    console.error('[ExcelEditor] 保存失败:', e);
  }

  renderAll();
  transactRender();

  // 刷新所有关联此表格的图表
  refreshLinkedCharts(currentExcelData.id);

  closeEditor();
}

// ── 关闭编辑器 ──
function closeEditor() {
  stopZIndexObserver();
  if (univerInstance) {
    try {
      univerInstance.dispose();
    } catch (e) {
      console.warn('[ExcelEditor] Univer dispose 失败:', e);
    }
    univerInstance = null;
    univerAPI = null;
  }

  if (editorModal) {
    editorModal.style.display = 'none';
    editorModal.innerHTML = '';
  }
  currentExcelData = null;
}

// ── 辅助：创建按钮 ──
function createBtn(text, bgColor, onClick) {
  let btn = document.createElement('button');
  btn.textContent = text;
  btn.style.cssText =
    'padding:4px 16px;border:none;border-radius:4px;cursor:pointer;' +
    'background:' + bgColor + ';color:#fff;font-size:13px;font-weight:bold;' +
    'transition:opacity 0.15s;';
  btn.addEventListener('mouseenter', function () { btn.style.opacity = '0.85'; });
  btn.addEventListener('mouseleave', function () { btn.style.opacity = '1'; });
  btn.addEventListener('click', onClick);
  return btn;
}

// ── 刷新所有关联指定表格的图表 ──
function refreshLinkedCharts(excelId) {
  if (!excelId) return;

  overlayImages.forEach(function (item) {
    if (item.type === 'chart' && item.sourceExcelId === excelId) {
      let excelItem = overlayImages.find(function (e) { return e.id === excelId; });
      if (!excelItem) return;

      let extractedData = extractChartData(excelItem, item.dataRange || { startRow: 0, endRow: 4, startCol: 0, endCol: 3 });
      if (extractedData && extractedData.categories.length > 0) {
        item.chartData = extractedData;
        item.echartsOption = buildEChartsOption(item.chartType, extractedData, item.chartTitle);
      }
    }
  });
}
