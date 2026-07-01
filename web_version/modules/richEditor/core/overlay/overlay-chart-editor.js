// ============================================================
//  overlay-chart-editor.js — 图表编辑器弹窗（ECharts）
// ============================================================
import { renderAll, transactRender, overlayImages } from './overlay-images.js';
import { CHART_TYPES, CHART_THEMES, extractChartData, buildEChartsOption } from './overlay-chart.js';

let editorModal = null;
let previewChartInstance = null;
let currentChartData = null;
let currentChartType = 'bar';

// ── 样式配置状态 ──
let chartStyle = {
  theme: 'default',
  animation: true,
  showDataLabel: false,
  legendPos: 'top',
  gridTop: 40,
  gridBottom: 30,
  gridLeft: 60,
  gridRight: 20,
  tooltipTrigger: 'item'
};

// ── 打开编辑器 ──
export function openChartEditor(imgData) {
  currentChartData = imgData;
  currentChartType = imgData.chartType || 'bar';

  if (typeof echarts === 'undefined') {
    alert('ECharts 未加载，请检查网络连接或 CDN 资源是否可用。');
    return;
  }

  // 创建弹窗
  if (!editorModal) {
    editorModal = document.createElement('div');
    editorModal.id = 'chartEditorModal';
    editorModal.style.cssText =
      'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:99999;' +
      'display:none;flex-direction:column;align-items:center;justify-content:center;' +
      'background:rgba(0,0,0,0.6);';
    document.body.appendChild(editorModal);
  }

  editorModal.innerHTML = '';
  editorModal.style.display = 'flex';

  // 主容器
  let container = document.createElement('div');
  container.style.cssText =
    'width:92vw;height:88vh;max-width:1400px;max-height:900px;' +
    'background:#1a1a2e;border-radius:8px;overflow:hidden;' +
    'display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,0.5);';

  // ── 顶部工具栏 ──
  let toolbar = document.createElement('div');
  toolbar.style.cssText =
    'height:44px;background:#16213e;display:flex;align-items:center;padding:0 12px;' +
    'border-bottom:1px solid #2c6e7e;gap:8px;flex-shrink:0;';

  let titleSpan = document.createElement('span');
  titleSpan.style.cssText = 'flex:1;color:#aef0ff;font-size:14px;font-weight:bold;';
  titleSpan.textContent = '图表编辑器';

  let saveBtn = createBtn('保存', '#0a8a6e', function () { saveToOverlay(); });
  let cancelBtn = createBtn('取消', '#6e2c2c', function () { closeEditor(); });
  let exportPngBtn = createBtn('导出PNG', '#2c6e7e', function () { exportChartImage('png'); });
  let exportSvgBtn = createBtn('导出SVG', '#3ba272', function () { exportChartImage('svg'); });

  toolbar.appendChild(titleSpan);
  toolbar.appendChild(exportPngBtn);
  toolbar.appendChild(exportSvgBtn);
  toolbar.appendChild(saveBtn);
  toolbar.appendChild(cancelBtn);

  // ── 内容区：三栏（左:类型 | 中:预览 | 右:数据）可拖拽缩放+折叠 ──
  let content = document.createElement('div');
  content.style.cssText = 'flex:1;display:flex;overflow:hidden;position:relative;';

  // ---- 左侧面板：图表标题 + 图表类型（一列、可折叠） ----
  let leftPanel = document.createElement('div');
  leftPanel.id = 'chartLeftPanel';
  leftPanel.style.cssText =
    'width:220px;min-width:32px;background:#16213e;border-right:1px solid #2c6e7e;' +
    'display:flex;flex-direction:column;overflow:hidden;transition:width 0.2s;flex-shrink:0;';

  let leftHeader = document.createElement('div');
  leftHeader.style.cssText =
    'height:28px;display:flex;align-items:center;padding:0 6px;flex-shrink:0;' +
    'background:#0f1629;border-bottom:1px solid #2c6e7e;gap:4px;';

  let leftCollapseBtn = document.createElement('span');
  leftCollapseBtn.textContent = '◀';
  leftCollapseBtn.title = '折叠/展开';
  leftCollapseBtn.style.cssText = 'cursor:pointer;color:#aef0ff;font-size:10px;opacity:0.7;padding:2px 4px;';
  leftCollapseBtn.addEventListener('click', function () { togglePanel('left'); });

  let leftHeaderTitle = document.createElement('span');
  leftHeaderTitle.style.cssText = 'flex:1;color:#aef0ff;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
  leftHeaderTitle.textContent = '图表配置';

  leftHeader.appendChild(leftCollapseBtn);
  leftHeader.appendChild(leftHeaderTitle);

  let leftBody = document.createElement('div');
  leftBody.id = 'chartLeftBody';
  leftBody.style.cssText = 'flex:1;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:6px;';

  // ── 图表标题 ──
  let titleGroup = createFormGroup('标题');
  let titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.value = imgData.chartTitle || '';
  titleInput.placeholder = '输入图表标题';
  titleInput.style.cssText = INPUT_STYLE;
  titleInput.addEventListener('input', function () { updatePreview(); });
  titleGroup.appendChild(titleInput);

  // ── 图表类型（按分组、一列） ──
  let typeGroup = createFormGroup('图表类型');
  let typeContainer = document.createElement('div');
  typeContainer.style.cssText = 'display:flex;flex-direction:column;gap:1px;';

  let groups = {};
  Object.keys(CHART_TYPES).forEach(function (key) {
    let g = CHART_TYPES[key].group || '其他';
    if (!groups[g]) groups[g] = [];
    groups[g].push(key);
  });

  Object.keys(groups).forEach(function (groupName) {
    let groupLabel = document.createElement('div');
    groupLabel.style.cssText = 'color:#555;font-size:9px;margin-top:3px;padding:0 2px;';
    groupLabel.textContent = groupName;
    typeContainer.appendChild(groupLabel);

    groups[groupName].forEach(function (key) {
      let btn = document.createElement('button');
      btn.textContent = CHART_TYPES[key].icon + ' ' + CHART_TYPES[key].label;
      btn.dataset.chartType = key;
      btn.style.cssText =
        'width:100%;padding:3px 5px;border:1px solid #2c6e7e;border-radius:2px;cursor:pointer;' +
        'background:#1a1a2e;color:#ccc;font-size:10px;text-align:left;transition:all 0.15s;';

      if (key === currentChartType) {
        btn.classList.add('chart-type-active');
        btn.style.background = '#2c6e7e';
        btn.style.color = '#fff';
        btn.style.borderColor = '#aef0ff';
      }

      btn.addEventListener('click', function () {
        typeContainer.querySelectorAll('.chart-type-active').forEach(function (b) {
          b.classList.remove('chart-type-active');
          b.style.background = '#1a1a2e';
          b.style.color = '#ccc';
          b.style.borderColor = '#2c6e7e';
        });
        btn.classList.add('chart-type-active');
        btn.style.background = '#2c6e7e';
        btn.style.color = '#fff';
        btn.style.borderColor = '#aef0ff';
        currentChartType = key;
        updatePreview();
      });

      typeContainer.appendChild(btn);
    });
  });

  typeGroup.appendChild(typeContainer);

  leftBody.appendChild(titleGroup);
  leftBody.appendChild(typeGroup);

  // ── 样式配置（可折叠） ──
  let styleGroup = createFormGroup('样式设置');
  let styleContainer = document.createElement('div');
  styleContainer.style.cssText = 'display:flex;flex-direction:column;gap:4px;';

  // 颜色主题选择
  let themeLabel = document.createElement('label');
  themeLabel.style.cssText = 'color:#aaa;font-size:10px;display:flex;align-items:center;gap:4px;';
  themeLabel.textContent = '主题';
  let themeSelect = document.createElement('select');
  themeSelect.id = 'chartThemeSelect';
  Object.keys(CHART_THEMES).forEach(function (k) {
    let o = document.createElement('option');
    o.value = k;
    o.textContent = CHART_THEMES[k].name;
    if (k === (imgData.chartStyle && imgData.chartStyle.theme) || k === 'default') o.selected = true;
    themeSelect.appendChild(o);
  });
  themeSelect.style.cssText = 'flex:1;padding:2px 4px;background:#1a1a2e;border:1px solid #2c6e7e;color:#ccc;font-size:10px;';
  themeSelect.addEventListener('change', function () { chartStyle.theme = this.value; updatePreview(); });
  themeLabel.appendChild(themeSelect);
  styleContainer.appendChild(themeLabel);

  // 动画开关
  let animRow = document.createElement('div');
  animRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:4px;';
  let animLbl = document.createElement('span');
  animLbl.textContent = '动画';
  animLbl.style.cssText = 'color:#aaa;font-size:10px;';
  let animToggle = document.createElement('input');
  animToggle.type = 'checkbox';
  animToggle.checked = imgData.chartStyle ? (imgData.chartStyle.animation !== false) : true;
  animToggle.style.cssText = 'accent-color:#2c6e7e;';
  animToggle.addEventListener('change', function () { chartStyle.animation = this.checked; updatePreview(); });
  animRow.appendChild(animLbl);
  animRow.appendChild(animToggle);
  styleContainer.appendChild(animRow);

  // 数据标签开关
  let labelRow = document.createElement('div');
  labelRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:4px;';
  let labelLbl = document.createElement('span');
  labelLbl.textContent = '数据标签';
  labelLbl.style.cssText = 'color:#aaa;font-size:10px;';
  let labelToggle = document.createElement('input');
  labelToggle.type = 'checkbox';
  labelToggle.checked = !!(imgData.chartStyle && imgData.chartStyle.showDataLabel);
  labelToggle.style.cssText = 'accent-color:#2c6e7e;';
  labelToggle.addEventListener('change', function () { chartStyle.showDataLabel = this.checked; updatePreview(); });
  labelRow.appendChild(labelLbl);
  labelRow.appendChild(labelToggle);
  styleContainer.appendChild(labelRow);

  // 图例位置
  let legendLabel = document.createElement('label');
  legendLabel.style.cssText = 'color:#aaa;font-size:10px;display:flex;align-items:center;gap:4px;';
  legendLabel.textContent = '图例位置';
  let legendSelect = document.createElement('select');
  ['top','bottom','left','right'].forEach(function (p) {
    let o = document.createElement('option');
    o.value = p;
    o.textContent = p === 'top' ? '顶部' : p === 'bottom' ? '底部' : p === 'left' ? '左侧' : '右侧';
    if ((imgData.chartStyle && imgData.chartStyle.legendPos) === p || (!imgData.chartStyle && p === 'top')) o.selected = true;
    legendSelect.appendChild(o);
  });
  legendSelect.style.cssText = 'flex:1;padding:2px 4px;background:#1a1a2e;border:1px solid #2c6e7e;color:#ccc;font-size:10px;';
  legendSelect.addEventListener('change', function () { chartStyle.legendPos = this.value; updatePreview(); });
  legendLabel.appendChild(legendSelect);
  styleContainer.appendChild(legendLabel);

  // Tooltip 触发方式
  let tipLabel = document.createElement('label');
  tipLabel.style.cssText = 'color:#aaa;font-size:10px;display:flex;align-items:center;gap:4px;';
  tipLabel.textContent = '提示方式';
  let tipSelect = document.createElement('select');
  [{v:'item',l:'数据点'},{v:'axis',l:'坐标轴'}].forEach(function (p) {
    let o = document.createElement('option');
    o.value = p.v;
    o.textContent = p.l;
    if ((imgData.chartStyle && imgData.chartStyle.tooltipTrigger) === p.v || (!imgData.chartStyle && p.v === 'item')) o.selected = true;
    tipSelect.appendChild(o);
  });
  tipSelect.style.cssText = 'flex:1;padding:2px 4px;background:#1a1a2e;border:1px solid #2c6e7e;color:#ccc;font-size:10px;';
  tipSelect.addEventListener('change', function () { chartStyle.tooltipTrigger = this.value; updatePreview(); });
  tipLabel.appendChild(tipSelect);
  styleContainer.appendChild(tipLabel);

  // 网格边距
  let gridLabel = document.createElement('div');
  gridLabel.style.cssText = 'color:#aaa;font-size:10px;margin-top:2px;';
  gridLabel.textContent = '网格边距';
  styleContainer.appendChild(gridLabel);

  let gridInputs = {};
  ['gridTop','gridBottom','gridLeft','gridRight'].forEach(function (key, i) {
    let row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:3px;';
    let lbl = document.createElement('span');
    lbl.style.cssText = 'color:#666;font-size:9px;width:36px;';
    lbl.textContent = key.replace('grid', '');
    let inp = document.createElement('input');
    inp.type = 'number';
    inp.min = '0';
    inp.max = '200';
    inp.value = (imgData.chartStyle && imgData.chartStyle[key] != null) ? imgData.chartStyle[key] : chartStyle[key];
    inp.style.cssText = 'width:50px;padding:1px 3px;background:#1a1a2e;border:1px solid #2c6e7e;color:#ccc;font-size:9px;';
    inp.dataset.gridKey = key;
    inp.addEventListener('input', function () { chartStyle[this.dataset.gridKey] = parseInt(this.value) || 0; updatePreview(); });
    gridInputs[key] = inp;
    row.appendChild(lbl);
    row.appendChild(inp);
    styleContainer.appendChild(row);
  });

  styleGroup.appendChild(styleContainer);
  leftBody.appendChild(styleGroup);
  leftPanel.appendChild(leftHeader);
  leftPanel.appendChild(leftBody);

  // ---- 左拖拽分隔条 ----
  let leftDragHandle = document.createElement('div');
  leftDragHandle.style.cssText =
    'width:5px;cursor:col-resize;flex-shrink:0;background:transparent;' +
    'position:relative;z-index:10;';
  leftDragHandle.addEventListener('mousedown', function (e) { startDrag(e, 'left'); });

  // ---- 中间预览区 ----
  let centerPanel = document.createElement('div');
  centerPanel.id = 'chartCenterPanel';
  centerPanel.style.cssText = 'flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0;';

  let previewLabel = document.createElement('div');
  previewLabel.style.cssText =
    'height:28px;display:flex;align-items:center;padding:0 10px;' +
    'background:#0f1629;border-bottom:1px solid #2c6e7e;color:#aef0ff;font-size:12px;flex-shrink:0;';
  previewLabel.textContent = '预览';

  let previewArea = document.createElement('div');
  previewArea.id = 'chartPreviewArea';
  previewArea.style.cssText = 'flex:1;overflow:hidden;';

  centerPanel.appendChild(previewLabel);
  centerPanel.appendChild(previewArea);

  // ---- 右拖拽分隔条 ----
  let rightDragHandle = document.createElement('div');
  rightDragHandle.style.cssText =
    'width:5px;cursor:col-resize;flex-shrink:0;background:transparent;' +
    'position:relative;z-index:10;';
  rightDragHandle.addEventListener('mousedown', function (e) { startDrag(e, 'right'); });

  // ---- 右侧面板：数据来源 + 数据编辑（可折叠） ----
  let rightPanel = document.createElement('div');
  rightPanel.id = 'chartRightPanel';
  rightPanel.style.cssText =
    'width:320px;min-width:32px;background:#16213e;border-left:1px solid #2c6e7e;' +
    'display:flex;flex-direction:column;overflow:hidden;transition:width 0.2s;flex-shrink:0;';

  let rightHeader = document.createElement('div');
  rightHeader.style.cssText =
    'height:28px;display:flex;align-items:center;padding:0 6px;flex-shrink:0;' +
    'background:#0f1629;border-bottom:1px solid #2c6e7e;gap:4px;';

  let rightHeaderTitle = document.createElement('span');
  rightHeaderTitle.style.cssText = 'flex:1;color:#aef0ff;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
  rightHeaderTitle.textContent = '数据';

  let rightCollapseBtn = document.createElement('span');
  rightCollapseBtn.textContent = '▶';
  rightCollapseBtn.title = '折叠/展开';
  rightCollapseBtn.style.cssText = 'cursor:pointer;color:#aef0ff;font-size:10px;opacity:0.7;padding:2px 4px;';
  rightCollapseBtn.addEventListener('click', function () { togglePanel('right'); });

  rightHeader.appendChild(rightHeaderTitle);
  rightHeader.appendChild(rightCollapseBtn);

  let rightBody = document.createElement('div');
  rightBody.id = 'chartRightBody';
  rightBody.style.cssText = 'flex:1;display:flex;flex-direction:column;overflow:hidden;';

  // 右侧上半：数据来源
  let dataSourceArea = document.createElement('div');
  dataSourceArea.style.cssText = 'flex-shrink:0;padding:6px 8px;background:#0f1629;border-bottom:1px solid #2c6e7e;';

  let sourceSelect = document.createElement('select');
  sourceSelect.style.cssText = 'width:100%;padding:4px 6px;background:#1a1a2e;border:1px solid #2c6e7e;border-radius:3px;color:#ccc;font-size:11px;';
  let manualOpt = document.createElement('option');
  manualOpt.value = '';
  manualOpt.textContent = '✏️ 手动输入数据';
  sourceSelect.appendChild(manualOpt);

  overlayImages.forEach(function (item) {
    if (item.type === 'excel') {
      let opt = document.createElement('option');
      opt.value = item.id;
      let sheetData = item.univerSnapshot || item.defaultData;
      let sheetName = '';
      if (sheetData && sheetData.sheets) {
        let firstKey = Object.keys(sheetData.sheets)[0];
        if (firstKey) sheetName = sheetData.sheets[firstKey].name || '';
      }
      opt.textContent = '📊 ' + (sheetName || '表格') + ' (' + item.id.slice(-6) + ')';
      if (imgData.sourceExcelId === item.id) opt.selected = true;
      sourceSelect.appendChild(opt);
    }
  });
  dataSourceArea.appendChild(sourceSelect);

  // 数据范围
  let rangeRow = document.createElement('div');
  rangeRow.style.cssText = 'display:none;gap:3px;margin-top:4px;flex-wrap:wrap;';
  rangeRow.id = 'chartRangeRow';

  let rangeLabels = ['起始行', '结束行', '起始列', '结束列'];
  let rangeKeys = ['startRow', 'endRow', 'startCol', 'endCol'];
  let rangeDefaults = [0, 4, 0, 3];
  let rangeInputs = {};

  rangeKeys.forEach(function (key, i) {
    let label = document.createElement('label');
    label.style.cssText = 'color:#aaa;font-size:9px;display:flex;flex-direction:column;gap:1px;width:48%;';
    label.textContent = rangeLabels[i];
    let inp = document.createElement('input');
    inp.type = 'number';
    inp.min = '0';
    inp.value = (imgData.dataRange && imgData.dataRange[key] != null) ? imgData.dataRange[key] : rangeDefaults[i];
    inp.style.cssText = 'width:100%;padding:2px 4px;background:#1a1a2e;border:1px solid #2c6e7e;border-radius:2px;color:#ccc;font-size:10px;';
    inp.addEventListener('input', function () { updatePreview(); });
    rangeInputs[key] = inp;
    label.appendChild(inp);
    rangeRow.appendChild(label);
  });

  let refreshDataBtn = document.createElement('button');
  refreshDataBtn.textContent = '从表格刷新';
  refreshDataBtn.style.cssText = 'padding:2px 8px;border:none;border-radius:2px;cursor:pointer;background:#2c6e7e;color:#fff;font-size:10px;margin-top:2px;';
  refreshDataBtn.addEventListener('click', function () { syncDataFromSource(); });
  rangeRow.appendChild(refreshDataBtn);

  dataSourceArea.appendChild(rangeRow);

  let linkStatus = document.createElement('div');
  linkStatus.id = 'chartLinkStatus';
  linkStatus.style.cssText = 'display:none;margin-top:2px;padding:2px 6px;border-radius:2px;font-size:9px;';
  dataSourceArea.appendChild(linkStatus);

  sourceSelect.addEventListener('change', function () {
    if (sourceSelect.value) {
      rangeRow.style.display = 'flex';
      linkStatus.style.display = 'block';
      linkStatus.textContent = '🔗 已关联表格';
      linkStatus.style.background = 'rgba(10,138,110,0.2)';
      linkStatus.style.color = '#0a8a6e';
      syncDataFromSource();
    } else {
      rangeRow.style.display = 'none';
      linkStatus.style.display = 'block';
      linkStatus.textContent = '✏️ 手动模式';
      linkStatus.style.background = 'rgba(44,110,126,0.2)';
      linkStatus.style.color = '#aef0ff';
      buildDataEditor(dataEditorContainer, imgData.chartData);
    }
    updatePreview();
  });

  if (imgData.sourceExcelId) {
    rangeRow.style.display = 'flex';
    linkStatus.style.display = 'block';
    linkStatus.textContent = '🔗 已关联表格';
    linkStatus.style.background = 'rgba(10,138,110,0.2)';
    linkStatus.style.color = '#0a8a6e';
  }

  // 右侧下半：数据编辑
  let dataEditArea = document.createElement('div');
  dataEditArea.style.cssText = 'flex:1;display:flex;flex-direction:column;overflow:hidden;padding:6px 8px;gap:4px;';

  let dataEditorLabel = document.createElement('div');
  dataEditorLabel.style.cssText = 'color:#aef0ff;font-size:11px;flex-shrink:0;';
  dataEditorLabel.textContent = '数据编辑';

  let dataEditorContainer = document.createElement('div');
  dataEditorContainer.id = 'chartDataEditor';
  dataEditorContainer.style.cssText = 'flex:1;overflow:auto;';

  dataEditArea.appendChild(dataEditorLabel);
  dataEditArea.appendChild(dataEditorContainer);

  rightBody.appendChild(dataSourceArea);
  rightBody.appendChild(dataEditArea);
  rightPanel.appendChild(rightHeader);
  rightPanel.appendChild(rightBody);

  // ── 组装主容器 ──
  content.appendChild(leftPanel);
  content.appendChild(leftDragHandle);
  content.appendChild(centerPanel);
  content.appendChild(rightDragHandle);
  content.appendChild(rightPanel);
  container.appendChild(toolbar);
  container.appendChild(content);
  editorModal.appendChild(container);

  // ── 拖拽缩放逻辑 ──
  let isDragging = false;
  let dragTarget = null;
  let startX = 0;
  let startSize = 220;

  function startDrag(e, side) {
    isDragging = true;
    startX = e.clientX;
    dragTarget = side;
    if (side === 'left') {
      startSize = parseInt(leftPanel.style.width) || 220;
    } else {
      startSize = parseInt(rightPanel.style.width) || 320;
    }
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', stopDrag);
    e.preventDefault();
  }

  function onDrag(e) {
    if (!isDragging) return;
    let delta = e.clientX - startX;
    if (dragTarget === 'left') {
      let newW = Math.max(32, Math.min(400, startSize + delta));
      leftPanel.style.width = newW + 'px';
    } else {
      let newW = Math.max(32, Math.min(500, startSize - delta));
      rightPanel.style.width = newW + 'px';
    }
  }

  function stopDrag() {
    isDragging = false;
    dragTarget = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', stopDrag);
  }

  // ── 折叠/展开逻辑 ──
  function togglePanel(side) {
    if (side === 'left') {
      let body = leftBody;
      let btn = leftCollapseBtn;
      if (body.style.display === 'none') {
        body.style.display = 'flex';
        leftPanel.style.width = startSize + 'px';
        btn.textContent = '◀';
      } else {
        startSize = parseInt(leftPanel.style.width) || 220;
        body.style.display = 'none';
        leftPanel.style.width = '32px';
        btn.textContent = '▶';
      }
    } else {
      let body = rightBody;
      let btn = rightCollapseBtn;
      if (body.style.display === 'none') {
        body.style.display = 'flex';
        rightPanel.style.width = startSize + 'px';
        btn.textContent = '▶';
      } else {
        startSize = parseInt(rightPanel.style.width) || 320;
        body.style.display = 'none';
        rightPanel.style.width = '32px';
        btn.textContent = '◀';
      }
    }
    // 触发 echarts 重新适配
    setTimeout(function () {
      if (previewChartInstance) previewChartInstance.resize();
    }, 250);
  }

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

  // ── 初始化数据编辑器 ──
  // 如果有关联表格，先从表格提取数据填充编辑器
  if (imgData.sourceExcelId) {
    let extractedData = getChartDataFromSource(imgData.sourceExcelId, imgData.dataRange);
    if (extractedData && extractedData.categories.length > 0) {
      buildDataEditor(dataEditorContainer, extractedData);
    } else {
      buildDataEditor(dataEditorContainer, imgData.chartData);
    }
  } else {
    buildDataEditor(dataEditorContainer, imgData.chartData);
  }

  // ── 初始预览 ──
  updatePreview();

  // ── 从关联表格提取数据并同步到编辑器 ──
  function syncDataFromSource() {
    let sourceId = sourceSelect.value;
    if (!sourceId) return;

    let range = {
      startRow: parseInt(rangeInputs.startRow.value) || 0,
      endRow: parseInt(rangeInputs.endRow.value) || 4,
      startCol: parseInt(rangeInputs.startCol.value) || 0,
      endCol: parseInt(rangeInputs.endCol.value) || 3
    };

    let extractedData = getChartDataFromSource(sourceId, range);
    if (extractedData && extractedData.categories.length > 0) {
      buildDataEditor(dataEditorContainer, extractedData);
      updatePreview();
    } else {
      linkStatus.textContent = '⚠️ 未从表格中提取到有效数据，请检查范围';
      linkStatus.style.background = 'rgba(238,102,102,0.2)';
      linkStatus.style.color = '#ee6666';
    }
  }

  // ── 从指定表格源提取数据 ──
  function getChartDataFromSource(sourceId, range) {
    let excelItem = overlayImages.find(function (item) { return item.id === sourceId; });
    if (!excelItem) return null;
    return extractChartData(excelItem, range);
  }

  // ── 更新预览函数 ──
  function updatePreview() {
    let chartTitle = titleInput.value;
    let chartData;

    if (sourceSelect.value) {
      // 关联表格模式：从编辑器读取（已经同步过了）
      chartData = readDataFromEditor();
    } else {
      chartData = readDataFromEditor();
    }

    // 渲染预览
    if (previewChartInstance) {
      try { previewChartInstance.dispose(); } catch (e) { /* ignore */ }
    }

    let option = buildEChartsOption(currentChartType, chartData, chartTitle);

    // ── 应用样式配置 ──
    // 颜色主题
    let themeColors = CHART_THEMES[chartStyle.theme] ? CHART_THEMES[chartStyle.theme].colors : CHART_THEMES.default.colors;
    option.color = themeColors;

    // 动画
    if (!chartStyle.animation) {
      option.animation = false;
      option.series.forEach(function (s) {
        s.animation = false;
      });
    }

    // 数据标签
    if (chartStyle.showDataLabel && option.series) {
      option.series.forEach(function (s) {
        s.label = { show: true, position: 'top', color: '#ccc', fontSize: 10 };
        s.emphasis = s.emphasis || {};
        s.emphasis.label = { show: true, fontWeight: 'bold' };
      });
    }

    // 图例位置
    if (option.legend && typeof option.legend === 'object') {
      option.legend[chartStyle.legendPos] = 10;
      // 清除其他方向的位置
      ['top','bottom','left','right'].forEach(function (p) {
        if (p !== chartStyle.legendPos) delete option.legend[p];
      });
    }

    // 网格边距（仅对有 grid 的图表生效）
    if (option.grid) {
      option.grid.top = chartStyle.gridTop;
      option.grid.bottom = chartStyle.gridBottom;
      option.grid.left = chartStyle.gridLeft;
      option.grid.right = chartStyle.gridRight;
    }

    // Tooltip 触发方式
    if (option.tooltip) {
      option.tooltip.trigger = chartStyle.tooltipTrigger;
    }

    try {
      previewChartInstance = echarts.init(previewArea, null, { renderer: 'canvas' });
      previewChartInstance.setOption(option);
    } catch (e) {
      console.warn('[ChartEditor] 预览渲染失败:', e);
    }
  }

  // ── 从数据编辑器读取数据 ──
  function readDataFromEditor() {
    let table = dataEditorContainer.querySelector('table');
    if (!table) return currentChartData.chartData || { categories: [], series: [] };

    let rows = table.querySelectorAll('tr');
    if (rows.length < 2) return currentChartData.chartData || { categories: [], series: [] };

    let categories = [];
    let seriesList = [];

    // 第一行 = 系列名（"分类"单元格是纯文本无 input，所以 headerCells 只有系列输入框）
    let headerCells = rows[0].querySelectorAll('input');
    for (let c = 0; c < headerCells.length; c++) {
      seriesList.push({ name: headerCells[c].value || ('系列' + (c + 1)), data: [] });
    }

    // 数据行（跳过表头和添加行按钮行）
    for (let r = 1; r < rows.length; r++) {
      let cells = rows[r].querySelectorAll('input');
      if (cells.length < 2) continue;

      let catVal = (cells[0].value || '').trim();
      categories.push(catVal || ('类别' + categories.length));

      for (let c = 1; c < cells.length; c++) {
        if (seriesList[c - 1]) {
          seriesList[c - 1].data.push(Number(cells[c].value) || 0);
        }
      }
    }

    // 确保每个系列的数据长度与分类一致
    seriesList.forEach(function (s) {
      while (s.data.length < categories.length) s.data.push(0);
    });

    // 如果没有读到任何数据，回退到原始数据
    if (categories.length === 0 && seriesList.length === 0) {
      return currentChartData.chartData || { categories: ['类别1', '类别2', '类别3', '类别4'], series: [{ name: '系列1', data: [120, 200, 150, 80] }, { name: '系列2', data: [90, 150, 180, 120] }] };
    }

    return { categories: categories, series: seriesList };
  }
}

// ── 构建数据编辑表格 ──
function buildDataEditor(container, chartData) {
  container.innerHTML = '';

  let cats = chartData.categories || [];
  let series = chartData.series || [];

  let table = document.createElement('table');
  table.style.cssText =
    'border-collapse:collapse;width:100%;font-size:12px;';

  // 表头行
  let thead = document.createElement('tr');
  let th0 = document.createElement('td');
  th0.style.cssText = 'padding:4px;color:#666;border:1px solid #2c6e7e;text-align:center;font-size:11px;';
  th0.textContent = '分类';
  thead.appendChild(th0);

  series.forEach(function (s, i) {
    let th = document.createElement('td');
    th.style.cssText = 'padding:3px;border:1px solid #2c6e7e;text-align:center;position:relative;';
    let inp = document.createElement('input');
    inp.type = 'text';
    inp.value = s.name;
    inp.style.cssText = 'width:calc(100% - 14px);background:transparent;border:none;color:#aef0ff;font-size:11px;text-align:center;';
    // 系列名修改时实时刷新
    inp.addEventListener('input', function () { updatePreview(); });
    th.appendChild(inp);
    // 删除系列按钮
    let delSeriesBtn = document.createElement('span');
    delSeriesBtn.textContent = '×';
    delSeriesBtn.title = '删除此系列';
    delSeriesBtn.style.cssText =
      'cursor:pointer;color:#ee6666;font-size:12px;position:absolute;right:2px;top:50%;' +
      'transform:translateY(-50%);line-height:1;';
    delSeriesBtn.addEventListener('click', function () {
      if (chartData.series.length <= 1) return; // 至少保留一个系列
      chartData.series.splice(i, 1);
      buildDataEditor(container, chartData);
      updatePreview();
    });
    th.appendChild(delSeriesBtn);
    thead.appendChild(th);
  });

  // 添加系列按钮列
  let thAdd = document.createElement('td');
  thAdd.style.cssText = 'padding:4px;border:1px solid #2c6e7e;text-align:center;';
  let addSeriesBtn = document.createElement('span');
  addSeriesBtn.textContent = '+';
  addSeriesBtn.style.cssText = 'cursor:pointer;color:#0a8a6e;font-size:16px;font-weight:bold;';
  addSeriesBtn.addEventListener('click', function () {
    chartData.series.push({ name: '新系列', data: cats.map(function () { return 0; }) });
    buildDataEditor(container, chartData);
    updatePreview();
  });
  thAdd.appendChild(addSeriesBtn);
  thead.appendChild(thAdd);

  table.appendChild(thead);

  // 数据行
  cats.forEach(function (cat, ri) {
    let tr = document.createElement('tr');

    let tdCat = document.createElement('td');
    tdCat.style.cssText = 'padding:3px;border:1px solid #2c6e7e;';
    let catInput = document.createElement('input');
    catInput.type = 'text';
    catInput.value = cat;
    catInput.style.cssText = 'width:100%;background:transparent;border:none;color:#ccc;font-size:12px;';
    catInput.addEventListener('input', function () { updatePreview(); });
    tdCat.appendChild(catInput);
    tr.appendChild(tdCat);

    series.forEach(function (s) {
      let td = document.createElement('td');
      td.style.cssText = 'padding:3px;border:1px solid #2c6e7e;';
      let inp = document.createElement('input');
      inp.type = 'number';
      inp.value = s.data[ri] != null ? s.data[ri] : 0;
      inp.style.cssText = 'width:100%;background:transparent;border:none;color:#ccc;font-size:12px;text-align:right;';
      inp.addEventListener('input', function () { updatePreview(); });
      td.appendChild(inp);
      tr.appendChild(td);
    });

    // 删除行按钮
    let tdDel = document.createElement('td');
    tdDel.style.cssText = 'padding:3px;border:1px solid #2c6e7e;text-align:center;';
    let delBtn = document.createElement('span');
    delBtn.textContent = '×';
    delBtn.style.cssText = 'cursor:pointer;color:#ee6666;font-size:14px;';
    delBtn.addEventListener('click', function () {
      // 至少保留1行数据
      if (chartData.categories.length <= 1) return;
      chartData.categories.splice(ri, 1);
      chartData.series.forEach(function (s) { s.data.splice(ri, 1); });
      buildDataEditor(container, chartData);
      updatePreview();
    });
    tdDel.appendChild(delBtn);
    tr.appendChild(tdDel);

    table.appendChild(tr);
  });

  // 添加行按钮
  let addRow = document.createElement('tr');
  let addRowTd = document.createElement('td');
  addRowTd.colSpan = series.length + 2;
  addRowTd.style.cssText = 'padding:4px;border:1px solid #2c6e7e;text-align:center;';
  let addRowBtn = document.createElement('span');
  addRowBtn.textContent = '+ 添加行';
  addRowBtn.style.cssText = 'cursor:pointer;color:#0a8a6e;font-size:12px;';
  addRowBtn.addEventListener('click', function () {
    chartData.categories.push('类别' + (chartData.categories.length + 1));
    chartData.series.forEach(function (s) { s.data.push(0); });
    buildDataEditor(container, chartData);
    updatePreview();
  });
  addRowTd.appendChild(addRowBtn);
  addRow.appendChild(addRowTd);
  table.appendChild(addRow);

  container.appendChild(table);
}

// ── 保存数据到 overlay ──
function saveToOverlay() {
  if (!currentChartData) {
    closeEditor();
    return;
  }

  let modal = document.getElementById('chartEditorModal');
  if (!modal) { closeEditor(); return; }

  // 读取配置
  let titleInput = modal.querySelector('input[type="text"]');
  let sourceSelect = modal.querySelector('select');
  let rangeInputs = {};
  modal.querySelectorAll('#chartRangeRow input[type="number"]').forEach(function (inp, i) {
    let keys = ['startRow', 'endRow', 'startCol', 'endCol'];
    rangeInputs[keys[i]] = parseInt(inp.value) || 0;
  });

  // 从数据编辑器读取
  let dataEditorContainer = modal.querySelector('#chartDataEditor');
  let chartData = readDataFromEditorElement(dataEditorContainer);

  // 如果关联了表格，从表格重新提取最新数据（确保保存时数据是最新的）
  let sourceId = sourceSelect ? sourceSelect.value : '';
  if (sourceId) {
    let excelItem = overlayImages.find(function (item) { return item.id === sourceId; });
    if (excelItem) {
      let extractedData = extractChartData(excelItem, {
        startRow: rangeInputs.startRow || 0,
        endRow: rangeInputs.endRow || 4,
        startCol: rangeInputs.startCol || 0,
        endCol: rangeInputs.endCol || 3
      });
      if (extractedData && extractedData.categories.length > 0) {
        chartData = extractedData;
      }
    }
  }

  // 更新 overlay 数据
  currentChartData.chartTitle = titleInput ? titleInput.value : '';
  currentChartData.chartType = currentChartType;
  currentChartData.sourceExcelId = sourceId;
  currentChartData.dataRange = rangeInputs;
  currentChartData.chartData = chartData;
  currentChartData.echartsOption = buildEChartsOption(currentChartType, chartData, currentChartData.chartTitle);
  // 保存样式配置
  currentChartData.chartStyle = Object.assign({}, chartStyle);

  renderAll();
  transactRender();
  closeEditor();
}

// ── 导出图表图片 ──
function exportChartImage(format) {
  if (!previewChartInstance) {
    alert('预览图表尚未渲染，请稍后再试');
    return;
  }
  try {
    let url;
    if (format === 'png') {
      url = previewChartInstance.getDataURL({
        type: 'png',
        pixelRatio: 2,
        backgroundColor: '#0f1629'
      });
    } else if (format === 'svg') {
      // SVG 需要通过 SVGRenderer 获取
      // 先尝试用 canvas 方式导出，如果不行则提示
      url = previewChartInstance.getDataURL({
        type: 'svg',
        backgroundColor: '#0f1629'
      });
    }
    if (url) {
      let link = document.createElement('a');
      link.download = (currentChartData.chartTitle || 'chart') + '_' + Date.now() + '.' + format;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  } catch (e) {
    console.warn('[ChartEditor] 导出失败:', e);
    alert('导出失败: ' + e.message + '\n\n提示：PNG 格式兼容性最好，SVG 可能需要重新初始化为 svg 渲染器。');
  }
}

// ── 从编辑器 DOM 读取数据 ──
function readDataFromEditorElement(container) {
  if (!container) return { categories: [], series: [] };

  let table = container.querySelector('table');
  if (!table) return { categories: [], series: [] };

  let rows = table.querySelectorAll('tr');
  if (rows.length < 2) return { categories: [], series: [] };

  let categories = [];
  let seriesList = [];

  // 第一行 = 系列名（"分类"单元格是纯文本无 input，所以 headerCells 只有系列输入框）
  let headerCells = rows[0].querySelectorAll('input');
  for (let c = 0; c < headerCells.length; c++) {
    seriesList.push({ name: headerCells[c].value || ('系列' + (c + 1)), data: [] });
  }

  // 数据行（跳过表头和添加行按钮行）
  for (let r = 1; r < rows.length; r++) {
    let cells = rows[r].querySelectorAll('input');
    if (cells.length < 2) continue;

    let catVal = (cells[0].value || '').trim();
    categories.push(catVal || ('类别' + categories.length));

    for (let c = 1; c < cells.length; c++) {
      if (seriesList[c - 1]) {
        seriesList[c - 1].data.push(Number(cells[c].value) || 0);
      }
    }
  }

  // 确保每个系列的数据长度与分类一致
  seriesList.forEach(function (s) {
    while (s.data.length < categories.length) s.data.push(0);
  });

  // 安全兜底
  if (categories.length === 0 && seriesList.length === 0) {
    return { categories: ['类别1', '类别2', '类别3', '类别4'], series: [{ name: '系列1', data: [120, 200, 150, 80] }, { name: '系列2', data: [90, 150, 180, 120] }] };
  }

  return { categories: categories, series: seriesList };
}

// ── 关闭编辑器 ──
function closeEditor() {
  if (previewChartInstance) {
    try { previewChartInstance.dispose(); } catch (e) { /* ignore */ }
    previewChartInstance = null;
  }

  if (editorModal) {
    editorModal.style.display = 'none';
    editorModal.innerHTML = '';
  }
  currentChartData = null;
}

// ── 辅助：创建表单分组 ──
function createFormGroup(label) {
  let group = document.createElement('div');
  group.style.cssText = 'display:flex;flex-direction:column;gap:6px;';

  let labelEl = document.createElement('div');
  labelEl.style.cssText = 'color:#aef0ff;font-size:12px;font-weight:bold;';
  labelEl.textContent = label;

  group.appendChild(labelEl);
  return group;
}

// ── 辅助：创建按钮 ──
function createBtn(text, bgColor, onClick) {
  let btn = document.createElement('button');
  btn.textContent = text;
  btn.style.cssText =
    'padding:6px 16px;border:none;border-radius:4px;cursor:pointer;' +
    'background:' + bgColor + ';color:#fff;font-size:13px;font-weight:bold;' +
    'transition:opacity 0.15s;';
  btn.addEventListener('mouseenter', function () { btn.style.opacity = '0.85'; });
  btn.addEventListener('mouseleave', function () { btn.style.opacity = '1'; });
  btn.addEventListener('click', onClick);
  return btn;
}

const INPUT_STYLE =
  'width:100%;padding:6px 8px;background:#1a1a2e;border:1px solid #2c6e7e;border-radius:4px;color:#ccc;font-size:13px;';
