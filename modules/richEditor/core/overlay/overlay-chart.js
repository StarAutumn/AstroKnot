// ============================================================
//  overlay-chart.js — 图表 overlay 类型（ECharts 预览 + 编辑）
// ============================================================
import { overlayImages, getNextZIndex, ensureOverlay, renderAll, transactRender, selectImage, getInsertY } from './overlay-images.js';
import { getActiveBlockId, getBlockWidth, pxToPct } from './overlay-block.js';
import { openChartEditor } from './overlay-chart-editor.js';

// ── 图表类型定义 ──
export const CHART_TYPES = {
  // 柱状图系列
  bar:            { label: '柱状图',     icon: '📊', group: '柱状图' },
  barStack:       { label: '堆叠柱状图', icon: '📊', group: '柱状图' },
  barHorizontal:  { label: '条形图',     icon: '📊', group: '柱状图' },
  barWaterfall:   { label: '瀑布图',     icon: '📊', group: '柱状图' },
  barPictorial:   { label: '象形柱图',   icon: '📊', group: '柱状图' },
  // 折线图系列
  line:           { label: '折线图',     icon: '📈', group: '折线图' },
  lineStack:      { label: '堆叠折线图', icon: '📈', group: '折线图' },
  lineArea:       { label: '面积图',     icon: '📈', group: '折线图' },
  lineAreaStack:  { label: '堆叠面积图', icon: '📈', group: '折线图' },
  // 饼图系列
  pie:            { label: '饼状图',     icon: '🥧', group: '饼图' },
  pieDoughnut:    { label: '环形图',     icon: '🍩', group: '饼图' },
  pieRose:        { label: '南丁格尔玫瑰图', icon: '🌹', group: '饼图' },
  pieRoseDoughnut:{ label: '南丁格尔环形图', icon: '🌹', group: '饼图' },
  sunburst:       { label: '旭日图',     icon: '☀️', group: '饼图' },
  // 散点/气泡
  scatter:        { label: '散点图',     icon: '⚬', group: '散点' },
  effectScatter:  { label: '涟漪散点图', icon: '💫', group: '散点' },
  bubble:         { label: '气泡图',     icon: '⚪', group: '散点' },
  // 雷达
  radar:          { label: '雷达图',     icon: '🕸', group: '雷达' },
  radarArea:      { label: '填充雷达图', icon: '🕸', group: '雷达' },
  // 其他
  funnel:         { label: '漏斗图',     icon: '🔻', group: '其他' },
  gauge:          { label: '仪表盘',     icon: '🕐', group: '其他' },
  treemap:        { label: '矩形树图',   icon: '🧩', group: '其他' },
  heatmap:        { label: '热力图',     icon: '🌡', group: '其他' },
  boxplot:        { label: '箱线图',     icon: '📦', group: '其他' },
  candlestick:    { label: 'K线图',      icon: '💹', group: '其他' },
  sankey:         { label: '桑基图',     icon: '🔀', group: '其他' },
  parallel:       { label: '平行坐标图', icon: '||', group: '其他' },
  themeRiver:     { label: '主题河流图', icon: '〰️', group: '其他' },
  graph:          { label: '关系图',     icon: '🕸️', group: '其他' },
  tree:           { label: '树图',       icon: '🌳', group: '其他' }
};

// ── 颜色主题定义 ──
export const CHART_THEMES = {
  default:    { name: '默认主题', colors: ['#5470c6','#91cc75','#fac858','#ee6666','#73c0de','#3ba272','#fc8452','#9a60b4','#ea7ccc'] },
  dark:       { name: '暗色系',   colors: ['#dd6b66','#759aa0','#e7dc5f','#f0c3aa','#91cc75','#fac858','#ee6666','#73c0de','#9a60b4'] },
  vintage:    { name: '复古风',   colors: ['#d87c7c','#919e8b','#d7ab82','#6e7074','#61a0a8','#efa18d','#787464','#cc7e63','#724e58'] },
  macarons:   { name: '马卡龙',   colors: ['#2ec7c9','#b6a2de','#5ab1ef','#ffb980','#d87a80','#8d98b3','#e5cf0d','#97b552','#95706d'] },
  fresh:      { name: '清新绿',   colors: ['#00acee','#4cb8a4','#ffd285','#ff7b72','#8a8a8a','#16a085','#27ae60','#3498db','#2980b9'] },
  neon:       { name: '霓虹灯',   colors: ['#ff0080','#00ffff','#ff00ff','#ffff00','#00ff00','#8000ff','#ff4000','#0080ff','#80ff00'] }
};

// ── 从 Univer 快照或默认数据中提取图表数据 ──
export function extractChartData(excelData, range) {
  let snapshot = excelData.univerSnapshot || excelData.defaultData;
  if (!snapshot || !snapshot.sheets) return { categories: [], series: [] };

  let sheetKeys = Object.keys(snapshot.sheets);
  let firstSheet = snapshot.sheets[sheetKeys[0]];
  if (!firstSheet || !firstSheet.cellData) return { categories: [], series: [] };

  let cellData = firstSheet.cellData;
  let startRow = range.startRow || 0;
  let endRow = range.endRow != null ? range.endRow : 20;
  let startCol = range.startCol || 0;
  let endCol = range.endCol != null ? range.endCol : 10;

  let categories = [];
  let seriesMap = {};

  for (let r = startRow; r <= endRow; r++) {
    if (!cellData[r]) continue;
    let label = (cellData[r][startCol] && cellData[r][startCol].v != null) ? String(cellData[r][startCol].v) : '';

    if (r === startRow) {
      // 第一行 = 系列名
      for (let c = startCol + 1; c <= endCol; c++) {
        let name = (cellData[r][c] && cellData[r][c].v != null) ? String(cellData[r][c].v) : ('系列' + (c - startCol));
        seriesMap[c] = { name: name, data: [] };
      }
    } else {
      categories.push(label);
      for (let c = startCol + 1; c <= endCol; c++) {
        if (seriesMap[c]) {
          let rawVal = (cellData[r][c] && cellData[r][c].v != null) ? cellData[r][c].v : 0;
          seriesMap[c].data.push(Number(rawVal) || 0);
        }
      }
    }
  }

  return { categories: categories, series: Object.values(seriesMap) };
}

// ── 根据 chartType 生成 ECharts 配置 ──
export function buildEChartsOption(chartType, chartData, title) {
  let cats = chartData.categories || [];
  let series = chartData.series || [];

  // 安全兜底：分类不能为空
  if (!cats.length) cats = ['类别1', '类别2', '类别3', '类别4'];
  // 安全兜底：至少一个系列
  if (!series.length) series = [{ name: '系列1', data: cats.map(function () { return 0; }) }];
  // 确保每个系列数据长度与分类一致
  series.forEach(function (s) {
    if (!s.data) s.data = [];
    while (s.data.length < cats.length) s.data.push(0);
    if (s.data.length > cats.length) s.data = s.data.slice(0, cats.length);
  });

  let baseOption = {
    backgroundColor: 'transparent',
    title: {
      text: title || '',
      left: 'center',
      top: 10,
      textStyle: { color: '#aef0ff', fontSize: 14, fontWeight: 'bold' }
    },
    tooltip: { trigger: 'axis' },
    legend: {
      bottom: 0,
      textStyle: { color: '#ccc', fontSize: 11 }
    },
    grid: { left: 50, right: 20, top: 40, bottom: 40 },
    xAxis: { type: 'category', data: cats, axisLabel: { color: '#aaa' }, axisLine: { lineStyle: { color: '#444' } } },
    yAxis: { type: 'value', axisLabel: { color: '#aaa' }, splitLine: { lineStyle: { color: '#333' } }, axisLine: { lineStyle: { color: '#444' } } },
    color: ['#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de', '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc']
  };

  switch (chartType) {
    case 'bar':
      baseOption.series = series.map(function (s) {
        return { name: s.name, type: 'bar', data: s.data };
      });
      break;

    case 'barStack':
      baseOption.series = series.map(function (s) {
        return { name: s.name, type: 'bar', stack: 'total', data: s.data };
      });
      break;

    case 'barHorizontal':
      baseOption.xAxis = { type: 'value', axisLabel: { color: '#aaa' }, splitLine: { lineStyle: { color: '#333' } } };
      baseOption.yAxis = { type: 'category', data: cats, axisLabel: { color: '#aaa' }, axisLine: { lineStyle: { color: '#444' } } };
      baseOption.series = series.map(function (s) {
        return { name: s.name, type: 'bar', data: s.data };
      });
      break;

    case 'barWaterfall':
      // 瀑布图：用堆叠柱状图模拟，辅助系列隐藏
      if (series.length > 0) {
        let sData = series[0].data;
        let helperData = [];
        let positiveData = [];
        let negativeData = [];
        for (let i = 0; i < sData.length; i++) {
          if (i === 0) {
            helperData.push(0);
            positiveData.push(Math.max(sData[i], 0));
            negativeData.push(Math.min(sData[i], 0));
          } else {
            let prev = sData[i - 1] || 0;
            let curr = sData[i];
            if (curr >= prev) {
              helperData.push(prev);
              positiveData.push(curr - prev);
              negativeData.push(0);
            } else {
              helperData.push(curr);
              positiveData.push(0);
              negativeData.push(prev - curr);
            }
          }
        }
        baseOption.series = [
          { name: '辅助', type: 'bar', stack: 'total', data: helperData, itemStyle: { borderColor: 'transparent', color: 'transparent' }, emphasis: { itemStyle: { borderColor: 'transparent', color: 'transparent' } } },
          { name: series[0].name + '(正)', type: 'bar', stack: 'total', data: positiveData, itemStyle: { color: '#5470c6' } },
          { name: series[0].name + '(负)', type: 'bar', stack: 'total', data: negativeData, itemStyle: { color: '#ee6666' } }
        ];
      }
      break;

    case 'barPictorial':
      // 象形柱图
      baseOption.series = series.map(function (s) {
        return {
          name: s.name, type: 'pictorialBar', data: s.data,
          symbol: 'rect',
          symbolRepeat: true,
          symbolSize: ['60%', 4],
          symbolMargin: 1,
          itemStyle: { color: '#5470c6' }
        };
      });
      break;

    case 'line':
      baseOption.series = series.map(function (s) {
        return { name: s.name, type: 'line', data: s.data, smooth: true };
      });
      break;

    case 'lineStack':
      baseOption.series = series.map(function (s) {
        return { name: s.name, type: 'line', stack: 'total', data: s.data, smooth: true };
      });
      break;

    case 'lineArea':
      baseOption.series = series.map(function (s) {
        return { name: s.name, type: 'line', data: s.data, smooth: true, areaStyle: { opacity: 0.3 } };
      });
      break;

    case 'lineAreaStack':
      baseOption.series = series.map(function (s) {
        return { name: s.name, type: 'line', stack: 'total', data: s.data, smooth: true, areaStyle: { opacity: 0.3 } };
      });
      break;

    case 'pie':
      baseOption.tooltip = { trigger: 'item' };
      baseOption.xAxis = undefined;
      baseOption.yAxis = undefined;
      baseOption.grid = undefined;
      if (series.length > 0) {
        baseOption.series = [{
          type: 'pie',
          radius: '60%',
          center: ['50%', '50%'],
          data: cats.map(function (cat, i) {
            return { name: cat, value: series[0].data[i] || 0 };
          }),
          label: { color: '#ccc' },
          itemStyle: { borderRadius: 4 }
        }];
      }
      break;

    case 'pieDoughnut':
      baseOption.tooltip = { trigger: 'item' };
      baseOption.xAxis = undefined;
      baseOption.yAxis = undefined;
      baseOption.grid = undefined;
      if (series.length > 0) {
        baseOption.series = [{
          type: 'pie',
          radius: ['35%', '60%'],
          center: ['50%', '50%'],
          data: cats.map(function (cat, i) {
            return { name: cat, value: series[0].data[i] || 0 };
          }),
          label: { color: '#ccc' },
          itemStyle: { borderRadius: 4 }
        }];
      }
      break;

    case 'pieRose':
      baseOption.tooltip = { trigger: 'item' };
      baseOption.xAxis = undefined;
      baseOption.yAxis = undefined;
      baseOption.grid = undefined;
      if (series.length > 0) {
        baseOption.series = [{
          type: 'pie',
          radius: '60%',
          roseType: 'radius',
          center: ['50%', '50%'],
          data: cats.map(function (cat, i) {
            return { name: cat, value: series[0].data[i] || 0 };
          }),
          label: { color: '#ccc' },
          itemStyle: { borderRadius: 4 }
        }];
      }
      break;

    case 'pieRoseDoughnut':
      baseOption.tooltip = { trigger: 'item' };
      baseOption.xAxis = undefined;
      baseOption.yAxis = undefined;
      baseOption.grid = undefined;
      if (series.length > 0) {
        baseOption.series = [{
          type: 'pie',
          radius: ['25%', '60%'],
          roseType: 'area',
          center: ['50%', '50%'],
          data: cats.map(function (cat, i) {
            return { name: cat, value: series[0].data[i] || 0 };
          }),
          label: { color: '#ccc' },
          itemStyle: { borderRadius: 6 }
        }];
      }
      break;

    case 'scatter':
      baseOption.tooltip = { trigger: 'item' };
      baseOption.series = series.map(function (s) {
        return { name: s.name, type: 'scatter', data: s.data.map(function (v, i) { return [i, v]; }), symbolSize: 8 };
      });
      break;

    case 'bubble':
      baseOption.tooltip = { trigger: 'item' };
      baseOption.series = series.map(function (s, si) {
        return {
          name: s.name, type: 'scatter',
          data: s.data.map(function (v, i) {
            // 气泡大小由第二个系列决定，如果没有则用固定值
            let size = (series[1] && series[1].data[i]) ? Math.max(Math.abs(series[1].data[i]), 5) : 15;
            return [i, v, size];
          }),
          symbolSize: function (val) { return val[2]; }
        };
      });
      break;

    case 'radar':
      baseOption.tooltip = { trigger: 'item' };
      baseOption.xAxis = undefined;
      baseOption.yAxis = undefined;
      baseOption.grid = undefined;
      baseOption.radar = {
        indicator: cats.map(function (cat) { return { name: cat, max: undefined }; }),
        axisName: { color: '#aaa' },
        splitArea: { areaStyle: { color: ['rgba(44,110,126,0.1)', 'rgba(44,110,126,0.05)'] } }
      };
      baseOption.series = [{
        type: 'radar',
        data: series.map(function (s) { return { name: s.name, value: s.data }; })
      }];
      break;

    case 'radarArea':
      baseOption.tooltip = { trigger: 'item' };
      baseOption.xAxis = undefined;
      baseOption.yAxis = undefined;
      baseOption.grid = undefined;
      baseOption.radar = {
        indicator: cats.map(function (cat) { return { name: cat, max: undefined }; }),
        axisName: { color: '#aaa' },
        splitArea: { areaStyle: { color: ['rgba(44,110,126,0.1)', 'rgba(44,110,126,0.05)'] } }
      };
      baseOption.series = [{
        type: 'radar',
        data: series.map(function (s) { return { name: s.name, value: s.data, areaStyle: { opacity: 0.3 } }; })
      }];
      break;

    case 'funnel':
      baseOption.tooltip = { trigger: 'item' };
      baseOption.xAxis = undefined;
      baseOption.yAxis = undefined;
      baseOption.grid = undefined;
      if (series.length > 0) {
        baseOption.series = [{
          type: 'funnel',
          left: '10%',
          width: '80%',
          data: cats.map(function (cat, i) {
            return { name: cat, value: series[0].data[i] || 0 };
          }),
          label: { color: '#ccc', position: 'inside' },
          itemStyle: { borderWidth: 0 }
        }];
      }
      break;

    case 'gauge':
      baseOption.tooltip = { trigger: 'item' };
      baseOption.xAxis = undefined;
      baseOption.yAxis = undefined;
      baseOption.grid = undefined;
      if (series.length > 0 && series[0].data.length > 0) {
        // 仪表盘取第一个系列第一个值
        let gaugeVal = series[0].data[0] || 0;
        let maxVal = Math.max.apply(null, series[0].data) * 1.5 || 100;
        baseOption.series = [{
          type: 'gauge',
          detail: { formatter: '{value}', color: '#aef0ff', fontSize: 20 },
          data: [{ value: gaugeVal, name: cats[0] || '' }],
          max: maxVal,
          axisLine: { lineStyle: { color: [[0.3, '#91cc75'], [0.7, '#5470c6'], [1, '#ee6666']] } },
          pointer: { itemStyle: { color: '#aef0ff' } },
          axisTick: { lineStyle: { color: '#666' } },
          splitLine: { lineStyle: { color: '#666' } },
          axisLabel: { color: '#aaa' },
          title: { color: '#ccc' }
        }];
      }
      break;

    case 'treemap':
      baseOption.tooltip = { trigger: 'item' };
      baseOption.xAxis = undefined;
      baseOption.yAxis = undefined;
      baseOption.grid = undefined;
      if (series.length > 0) {
        baseOption.series = [{
          type: 'treemap',
          data: cats.map(function (cat, i) {
            return { name: cat, value: series[0].data[i] || 0 };
          }),
          label: { color: '#ccc' },
          upperLabel: { show: true, height: 20, color: '#fff' },
          itemStyle: { borderColor: '#1a1a2e', borderWidth: 2, gapWidth: 2 }
        }];
      }
      break;

    case 'heatmap':
      baseOption.tooltip = { trigger: 'item' };
      baseOption.xAxis = { type: 'category', data: cats, axisLabel: { color: '#aaa' }, axisLine: { lineStyle: { color: '#444' } }, splitArea: { show: true } };
      baseOption.yAxis = { type: 'category', data: series.map(function (s) { return s.name; }), axisLabel: { color: '#aaa' }, axisLine: { lineStyle: { color: '#444' } }, splitArea: { show: true } };
      baseOption.grid = { left: 60, right: 40, top: 40, bottom: 40 };
      baseOption.visualMap = {
        min: 0,
        max: 200,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        textStyle: { color: '#aaa' },
        inRange: { color: ['#16213e', '#2c6e7e', '#aef0ff'] }
      };
      // 构建热力图数据 [x, y, value]
      let heatData = [];
      series.forEach(function (s, yi) {
        s.data.forEach(function (v, xi) {
          heatData.push([xi, yi, v || 0]);
        });
      });
      baseOption.series = [{
        type: 'heatmap',
        data: heatData,
        label: { show: true, color: '#ccc', fontSize: 10 },
        emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.5)' } }
      }];
      break;

    case 'boxplot':
      baseOption.tooltip = { trigger: 'item' };
      // 箱线图需要将原始数据转换为箱线数据
      if (series.length > 0) {
        let boxData = series.map(function (s) {
          let sorted = s.data.slice().sort(function (a, b) { return a - b; });
          let q1 = sorted[Math.floor(sorted.length * 0.25)] || 0;
          let q2 = sorted[Math.floor(sorted.length * 0.5)] || 0;
          let q3 = sorted[Math.floor(sorted.length * 0.75)] || 0;
          let min = sorted[0] || 0;
          let max = sorted[sorted.length - 1] || 0;
          return [min, q1, q2, q3, max];
        });
        baseOption.series = [{
          type: 'boxplot',
          data: boxData,
          xAxisIndex: 0,
          yAxisIndex: 0
        }];
        baseOption.xAxis = { type: 'category', data: series.map(function (s) { return s.name; }), axisLabel: { color: '#aaa' }, axisLine: { lineStyle: { color: '#444' } } };
      }
      break;

    case 'candlestick':
      baseOption.tooltip = { trigger: 'axis' };
      // K线图需要 OHLC 数据，这里用多系列模拟：开/收/低/高
      if (series.length >= 4) {
        let kData = cats.map(function (_, i) {
          return [series[0].data[i], series[1].data[i], series[2].data[i], series[3].data[i]];
        });
        baseOption.series = [{
          type: 'candlestick',
          data: kData,
          itemStyle: { color: '#91cc75', color0: '#ee6666', borderColor: '#91cc75', borderColor0: '#ee6666' }
        }];
      } else if (series.length > 0) {
        // 数据不足4组时，用单系列模拟
        let kData = series[0].data.map(function (v) {
          let open = v * (0.95 + Math.random() * 0.1);
          let close = v * (0.95 + Math.random() * 0.1);
          let low = Math.min(open, close) * 0.97;
          let high = Math.max(open, close) * 1.03;
          return [+open.toFixed(2), +close.toFixed(2), +low.toFixed(2), +high.toFixed(2)];
        });
        baseOption.series = [{
          type: 'candlestick',
          data: kData,
          itemStyle: { color: '#91cc75', color0: '#ee6666', borderColor: '#91cc75', borderColor0: '#ee6666' }
        }];
      }
      break;

    case 'sankey':
      baseOption.tooltip = { trigger: 'item' };
      baseOption.xAxis = undefined;
      baseOption.yAxis = undefined;
      baseOption.grid = undefined;
      if (series.length > 0) {
        // 桑基图：分类作为节点，数值作为边
        let nodes = cats.map(function (cat) { return { name: cat }; });
        nodes.push({ name: series[0].name || '目标' });
        let links = cats.map(function (cat, i) {
          return { source: cat, target: series[0].name || '目标', value: Math.abs(series[0].data[i]) || 1 };
        });
        baseOption.series = [{
          type: 'sankey',
          data: nodes,
          links: links,
          emphasis: { focus: 'adjacency' },
          lineStyle: { color: 'gradient', curveness: 0.5 },
          label: { color: '#ccc' }
        }];
      }
      break;

    case 'parallel':
      baseOption.tooltip = { trigger: 'item' };
      baseOption.xAxis = undefined;
      baseOption.yAxis = undefined;
      baseOption.grid = undefined;
      baseOption.parallelAxis = cats.map(function (cat, i) {
        return { dim: i, name: cat, nameTextStyle: { color: '#aaa' }, axisLabel: { color: '#aaa' } };
      });
      baseOption.parallel = {
        left: 60,
        right: 40,
        top: 40,
        bottom: 40,
        axisLine: { lineStyle: { color: '#444' } },
        axisLabel: { color: '#aaa' }
      };
      baseOption.series = [{
        type: 'parallel',
        data: series.map(function (s) { return s.data; }),
        lineStyle: { width: 2, opacity: 0.5 }
      }];
      break;

    case 'sunburst':
      // 旭日图：从数据构建层级结构
      let sunData = [];
      series.forEach(function (s) {
        sunData.push({
          name: s.name,
          children: cats.map(function (cat, ci) {
            return { name: cat, value: s.data[ci] || 0 };
          })
        });
      });
      baseOption.tooltip = { trigger: 'item' };
      baseOption.legend = undefined;
      baseOption.xAxis = undefined;
      baseOption.yAxis = undefined;
      baseOption.grid = undefined;
      baseOption.series = [{
        type: 'sunburst',
        radius: ['10%', '85%'],
        center: ['50%', '50%'],
        sort: null,
        emphasis: { focus: 'ancestor' },
        levels: [{}, {
          r0: '15%', r: '35%', itemStyle: { borderWidth: 2 }
        }, {
          r0: '35%', r: '70%', itemStyle: { borderWidth: 1 }
        }, {
          r0: '70%', r: '72%', label: { rotate: 'tangential' }
        }],
        data: sunData
      }];
      break;

    case 'effectScatter':
      // 涟漪散点图：用系列1作为X，系列2作为Y（或用第一个系列的值）
      baseOption.xAxis = { type: 'value', axisLabel: { color: '#aaa' }, splitLine: { lineStyle: { color: '#222' } } };
      baseOption.yAxis = { type: 'value', axisLabel: { color: '#aaa' }, splitLine: { lineStyle: { color: '#222' } } };
      baseOption.tooltip = { trigger: 'item', formatter: function (p) { return p.name + ': (' + p.value[0] + ', ' + p.value[1] + ')'; } };
      if (series.length >= 2) {
        baseOption.series = [{
          type: 'effectScatter',
          showEffectOn: 'render',
          rippleEffect: { brushType: 'stroke', scale: 4 },
          symbolSize: 12,
          data: cats.map(function (c, i) { return [series[0].data[i], series[1].data[i], c]; })
        }];
      } else {
        baseOption.series = [{
          type: 'effectScatter',
          showEffectOn: 'render',
          rippleEffect: { brushType: 'stroke', scale: 3 },
          symbolSize: 10,
          data: cats.map(function (c, i) { return [i, series[0].data[i], c]; })
        }];
      }
      break;

    case 'themeRiver':
      // 主题河流图：将数据转为时间序列格式
      let riverData = [];
      cats.forEach(function (cat, i) {
        series.forEach(function (s) {
          riverData.push({ date: cat, name: s.name, value: s.data[i] || 0 });
        });
      });
      baseOption.tooltip = { trigger: 'axis', axisPointer: { type: 'line' } };
      baseOption.legend = undefined;
      baseOption.xAxis = undefined;
      baseOption.yAxis = undefined;
      baseOption.grid = undefined;
      baseOption.singleAxis = {
        left: 60,
        right: 40,
        top: 40,
        bottom: 80,
        axisTick: {},
        axisLine: { lineStyle: { color: '#444' } },
        axisLabel: { color: '#aaa' }
      };
      baseOption.series = [{
        type: 'themeRiver',
        data: riverData.sort(function (a, b) { return a.date.localeCompare(b.date); }),
        label: { color: '#aaa', formatter: '{b}' }
      }];
      break;

    case 'graph':
      // 关系图：从数据构建节点和边
      let graphNodes = [];
      let graphLinks = [];
      graphNodes.push({ name: '中心', symbolSize: 30, category: 0 });
      series.forEach(function (s, si) {
        graphNodes.push({ name: s.name, symbolSize: Math.max(15, Math.min(40, s.data.reduce(function (a, v) { return a + v; }, 0) / cats.length)), category: si % 9 });
        graphLinks.push({ source: '中心', target: s.name, value: s.data.reduce(function (a, v) { return a + v; }, 0) });
        cats.forEach(function (c, ci) {
          if ((si === 0 && ci < 3) || s.data[ci] > 0) {
            graphNodes.push({ name: c + '-' + s.name, symbolSize: Math.max(8, s.data[ci]), category: si % 9 });
            graphLinks.push({ source: s.name, target: c + '-' + s.name, value: s.data[ci] });
          }
        });
      });
      baseOption.tooltip = {};
      baseOption.legend = undefined;
      baseOption.xAxis = undefined;
      baseOption.yAxis = undefined;
      baseOption.grid = undefined;
      baseOption.animationDurationUpdate = 1500;
      baseOption.animationEasingUpdate = 'quinticInOut';
      baseOption.series = [{
        type: 'graph',
        layout: 'force',
        data: graphNodes,
        links: graphLinks,
        roam: true,
        draggable: true,
        force: { repulsion: 200, edgeLength: [80, 200] },
        label: { show: true, position: 'right', color: '#ccc', fontSize: 10 },
        lineStyle: { width: 1.5, curveness: 0.3, opacity: 0.6 },
        emphasis: { focus: 'adjacency', lineStyle: { width: 3 } },
        categories: CHART_THEMES.default.colors.map(function (c) { return { itemStyle: { color: c } }; })
      }];
      break;

    case 'tree':
      // 树图：从数据构建树结构
      let treeData = {
        name: imgData.chartTitle || '根节点',
        children: series.map(function (s) {
          return {
            name: s.name,
            children: cats.filter(function (_, i) { return (s.data[i] || 0) > 0; }).map(function (c, ci) {
              let origIdx = cats.indexOf(c);
              return { name: c, value: s.data[origIdx], children: [] };
            })
          };
        }).filter(function (n) { return n.children.length > 0; })
      };
      baseOption.tooltip = { trigger: 'item', triggerOn: 'mousemove' };
      baseOption.legend = undefined;
      baseOption.xAxis = undefined;
      baseOption.yAxis = undefined;
      baseOption.grid = undefined;
      baseOption.series = [{
        type: 'tree',
        orient: 'LR',
        data: [treeData],
        left: '8%',
        right: '8%',
        top: '6%',
        bottom: '6%',
        symbol: 'rect',
        symbolSize: [90, 36],
        initialTreeDepth: -1,
        label: { color: '#ccc', fontSize: 11, position: 'top' },
        leaves: { label: { color: '#aaa', fontSize: 10 } },
        expandAndCollapse: true,
        animationDuration: 550,
        animationDurationUpdate: 750,
        lineStyle: { color: '#555', width: 1.5, curveness: 0.5 }
      }];
      break;

    default:
      baseOption.series = series.map(function (s) {
        return { name: s.name, type: 'bar', data: s.data };
      });
  }

  return baseOption;
}

// ── 插入空白图表 ──
export function addChart() {
  let blockId = getActiveBlockId();
  let blockW = blockId ? getBlockWidth(blockId) : 800;
  let w = Math.min(560, blockW - 40);
  let h = Math.min(380, 500);
  let x = Math.max(0, (blockW - w) / 2);
  let y = getInsertY();

  let chartData = {
    type: 'chart',
    id: 'oly-chart-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
    blockId: blockId,
    x: x,
    y: y,
    width: w,
    height: h,
    zIndex: getNextZIndex(),
    leftPct: pxToPct(x, blockW),
    widthPct: pxToPct(w, blockW),
    _refWidth: blockW,
    // 图表类型
    chartType: 'bar',
    // 图表标题
    chartTitle: '',
    // 关联的表格 ID（可选）
    sourceExcelId: '',
    // 数据范围
    dataRange: { startRow: 0, endRow: 4, startCol: 0, endCol: 3 },
    // 图表数据（独立模式）
    chartData: {
      categories: ['类别1', '类别2', '类别3', '类别4'],
      series: [
        { name: '系列1', data: [120, 200, 150, 80] },
        { name: '系列2', data: [90, 150, 180, 120] }
      ]
    },
    // ECharts 完整配置（保存后填充）
    echartsOption: null,
    // SVG 快照（用于静态预览）
    chartSvg: ''
  };

  overlayImages.push(chartData);
  selectImage(chartData.id);
  transactRender();

  // 立即打开编辑器
  openChartEditor(chartData);
}

// ── 渲染图表预览内容 ──
export function renderChartContent(item, imgData) {
  let wrapper = document.createElement('div');
  wrapper.style.cssText =
    'width:100%;height:100%;position:relative;overflow:hidden;' +
    'background:#1a1a2e;border:1px solid #2c6e7e;border-radius:4px;display:flex;flex-direction:column;';

  // 标题栏
  let titleBar = document.createElement('div');
  titleBar.style.cssText =
    'height:28px;background:#16213e;display:flex;align-items:center;padding:0 8px;' +
    'border-bottom:1px solid #2c6e7e;font-size:12px;color:#aef0ff;gap:6px;flex-shrink:0;';

  let icon = document.createElement('span');
  icon.innerHTML = '&#128202;';

  let title = document.createElement('span');
  let typeLabel = CHART_TYPES[imgData.chartType] ? CHART_TYPES[imgData.chartType].label : '图表';
  let linkIndicator = imgData.sourceExcelId ? '🔗 ' : '';
  title.textContent = linkIndicator + (imgData.chartTitle || typeLabel);
  title.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';

  let editBtn = document.createElement('span');
  editBtn.innerHTML = '&#9998;';
  editBtn.style.cssText = 'cursor:pointer;font-size:13px;opacity:0.7;';
  editBtn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  editBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    openChartEditor(imgData);
  });

  titleBar.appendChild(icon);
  titleBar.appendChild(title);
  titleBar.appendChild(editBtn);

  // 图表渲染区
  let chartArea = document.createElement('div');
  chartArea.style.cssText = 'flex:1;overflow:hidden;position:relative;';

  wrapper.appendChild(titleBar);
  wrapper.appendChild(chartArea);
  item.appendChild(wrapper);

  // 使用 ECharts 渲染
  if (typeof echarts !== 'undefined') {
    requestAnimationFrame(function () {
      let chartContainer = document.createElement('div');
      chartContainer.style.cssText = 'width:100%;height:100%;';
      chartArea.appendChild(chartContainer);

      let option = buildEChartsOption(imgData.chartType, imgData.chartData, imgData.chartTitle);

      // 应用保存的样式配置
      if (imgData.chartStyle) {
        let cs = imgData.chartStyle;
        // 颜色主题
        if (cs.theme && CHART_THEMES[cs.theme]) {
          option.color = CHART_THEMES[cs.theme].colors;
        }
        // 动画
        if (cs.animation === false) {
          option.animation = false;
          if (option.series) option.series.forEach(function (s) { s.animation = false; });
        }
        // 数据标签
        if (cs.showDataLabel && option.series) {
          option.series.forEach(function (s) {
            s.label = { show: true, position: 'top', color: '#ccc', fontSize: 10 };
          });
        }
        // 图例位置
        if (option.legend && typeof option.legend === 'object' && cs.legendPos) {
          ['top','bottom','left','right'].forEach(function (p) { delete option.legend[p]; });
          option.legend[cs.legendPos] = 10;
        }
        // 网格边距
        if (option.grid && cs.gridTop != null) {
          option.grid.top = cs.gridTop;
          option.grid.bottom = cs.gridBottom;
          option.grid.left = cs.gridLeft;
          option.grid.right = cs.gridRight;
        }
        // Tooltip
        if (option.tooltip && cs.tooltipTrigger) {
          option.tooltip.trigger = cs.tooltipTrigger;
        }
      }
      try {
        let chartInstance = echarts.init(chartContainer, null, { renderer: 'canvas' });
        chartInstance.setOption(option);

        // 保存 SVG 快照
        try {
          imgData.chartSvg = chartInstance.getDataURL({ type: 'svg', pixelRatio: 1 });
        } catch (e) { /* ignore */ }

        // 存储 chart 实例以便后续 resize
        chartContainer._echartsInstance = chartInstance;
      } catch (e) {
        console.warn('[Chart] ECharts 渲染失败:', e);
        chartArea.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#ff6b6b;font-size:12px;">图表渲染失败</div>';
      }
    });
  } else {
    chartArea.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#666;font-size:12px;">ECharts 未加载</div>';
  }
}
