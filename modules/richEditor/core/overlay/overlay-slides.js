// ============================================================
//  overlay/overlay-slides.js — 幻灯片演示模块（Reveal.js）
// ============================================================

import { overlayImages, renderAll, transactRender } from './overlay-images.js';
import { getBlockElement, getActiveBlockId } from './overlay-block.js';
import { buildEChartsOption } from './overlay-chart.js';

// ── 分页符 CSS 样式 ──
const SLIDE_BREAK_STYLE = `
  <style id="slide-break-styles">
    hr.slide-break {
      border: none !important;
      height: 4px !important;
      background: linear-gradient(90deg, transparent, #2c6e7e 20%, #0a8a6e 50%, #2c6e7e 80%, transparent) !important;
      margin: 24px 0 !important;
      position: relative !important;
      page-break-after: always;
    }
    hr.slide-break::after {
      content: '—— 幻灯片分页 ——';
      display: block;
      text-align: center;
      color: #0a8a6e;
      font-size: 11px;
      margin-top: 4px;
      letter-spacing: 2px;
    }
  </style>
`;

// 注入分页符样式
if (!document.getElementById('slide-break-styles')) {
  document.head.insertAdjacentHTML('beforeend', SLIDE_BREAK_STYLE);
}

// ── 插入分页符 ──
export function insertSlideBreak() {
  let editor = tinymce.activeEditor;
  if (!editor) return;
  editor.insertContent('<hr class="slide-break" />');
}

// ── 获取幻灯片页数 ──
export function getSlideCount() {
  let editorBody = document.getElementById('tinymce-editor-textarea');
  if (!editorBody) return 1;
  let breaks = editorBody.querySelectorAll('hr.slide-break');
  return breaks.length + 1;
}

// ── 进入演示模式 ──
export function startPresentation() {
  if (typeof Reveal === 'undefined') {
    alert('Reveal.js 未加载，请检查网络连接');
    return;
  }

  let editorBody = document.getElementById('tinymce-editor-textarea');
  if (!editorBody) {
    alert('编辑器内容未找到');
    return;
  }

  // 收集内容
  let slides = splitContentToSlides(editorBody);
  let overlayData = collectOverlayData();

  // 创建演示容器
  let presentContainer = document.createElement('div');
  presentContainer.id = 'presentationContainer';
  presentContainer.style.cssText =
    'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:999999;' +
    'background:#000;display:flex;flex-direction:column;';

  // 顶部控制栏
  let controlBar = document.createElement('div');
  controlBar.style.cssText =
    'height:36px;background:#111;display:flex;align-items:center;padding:0 12px;gap:8px;' +
    'border-bottom:1px solid #333;flex-shrink:0;z-index:10;';

  let slideInfo = document.createElement('span');
  slideInfo.style.cssText = 'color:#aef0ff;font-size:12px;flex:1;';
  slideInfo.textContent = '幻灯片演示 — 共 ' + slides.length + ' 页';

  let exitBtn = document.createElement('button');
  exitBtn.textContent = '退出演示 (ESC)';
  exitBtn.style.cssText =
    'padding:4px 12px;border:1px solid #2c6e7e;border-radius:3px;background:transparent;' +
    'color:#aef0ff;cursor:pointer;font-size:11px;';
  exitBtn.addEventListener('click', function () { exitPresentation(); });

  let overviewBtn = document.createElement('button');
  overviewBtn.textContent = '总览';
  overviewBtn.style.cssText =
    'padding:4px 12px;border:1px solid #2c6e7e;border-radius:3px;background:transparent;' +
    'color:#aef0ff;cursor:pointer;font-size:11px;';
  overviewBtn.addEventListener('click', function () {
    if (window._revealInstance) window._revealInstance.toggleOverview();
  });

  let pdfBtn = document.createElement('button');
  pdfBtn.textContent = '打印/PDF';
  pdfBtn.style.cssText =
    'padding:4px 12px;border:1px solid #2c6e7e;border-radius:3px;background:transparent;' +
    'color:#aef0ff;cursor:pointer;font-size:11px;';
  pdfBtn.addEventListener('click', function () {
    if (window._revealInstance) window._revealInstance.print();
  });

  controlBar.appendChild(slideInfo);
  controlBar.appendChild(overviewBtn);
  controlBar.appendChild(pdfBtn);
  controlBar.appendChild(exitBtn);

  // Reveal 容器
  let revealRoot = document.createElement('div');
  revealRoot.className = 'reveal';
  revealRoot.style.cssText = 'flex:1;overflow:hidden;';

  let slidesContainer = document.createElement('div');
  slidesContainer.className = 'slides';

  // 构建每页幻灯片
  slides.forEach(function (slideContent, idx) {
    let section = document.createElement('section');
    section.setAttribute('data-slide-index', idx);

    // 幻灯片内容容器
    let contentDiv = document.createElement('div');
    contentDiv.className = 'slide-content';
    contentDiv.style.cssText =
      'width:100%;height:100%;padding:40px 60px;box-sizing:border-box;' +
      'font-family:"Microsoft YaHei","PingFang SC",sans-serif;color:#eee;' +
      'font-size:18px;line-height:1.6;overflow:auto;position:relative;';

    contentDiv.innerHTML = slideContent;

    // 渲染该页的 overlay 元素（图表、形状等）
    let pageOverlays = overlayData.filter(function (od) { return od.slideIndex === idx; });
    if (pageOverlays.length > 0) {
      let overlayLayer = document.createElement('div');
      overlayLayer.className = 'slide-overlay-layer';
      overlayLayer.style.cssText =
        'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
      pageOverlays.forEach(function (od) {
        renderOverlayInSlide(overlayLayer, od);
      });
      contentDiv.style.position = 'relative';
      contentDiv.appendChild(overlayLayer);
    }

    section.appendChild(contentDiv);
    slidesContainer.appendChild(section);
  });

  revealRoot.appendChild(slidesContainer);
  presentContainer.appendChild(controlBar);
  presentContainer.appendChild(revealRoot);
  document.body.appendChild(presentContainer);

  // 隐藏原始页面
  document.body.style.overflow = 'hidden';

  // 初始化 Reveal.js
  try {
    let instance = new Reveal(revealRoot, {
      hash: false,
      history: false,
      transition: 'slide',
      transitionSpeed: 'default',
      backgroundTransition: 'fade',
      width: '100%',
      height: '100%',
      margin: 0,
      minScale: 0.2,
      maxScale: 2,
      controls: true,
      controlsTutorial: true,
      progress: true,
      slideNumber: true,
      showSlideNumber: 'all',
      keyboard: true,
      overview: true,
      center: false,
      touch: true,
      loop: false,
      rtl: false,
      help: true,
      autoPlayMedia: true,
      preloadIframes: null
    });

    instance.initialize().then(function () {
      window._revealInstance = instance;

      // 延迟渲染图表
      setTimeout(function () {
        renderAllChartsInPresentation();
      }, 500);

      // 更新页码信息
      instance.on('slidechanged', function (e) {
        let current = e.indexh + 1;
        slideInfo.textContent = '幻灯片演示 — ' + current + ' / ' + slides.length;
      });
    });
  } catch (e) {
    console.error('[Reveal.js] 初始化失败:', e);
    alert('演示模式初始化失败: ' + e.message);
    exitPresentation();
  }
}

// ── 退出演示模式 ──
export function exitPresentation() {
  if (window._revealInstance) {
    try { window._revealInstance.destroy(); } catch (e) { /* ignore */ }
    window._revealInstance = null;
  }
  let container = document.getElementById('presentationContainer');
  if (container) container.remove();
  document.body.style.overflow = '';
}

// ── 将编辑器内容按分页符拆分为幻灯片 ──
function splitContentToSlides(editorBody) {
  let slides = [];

  // 克隆编辑器 body 避免修改原始 DOM
  let clone = editorBody.cloneNode(true);

  // 移除 overlay 容器（overlay 元素单独处理）
  let overlayContainers = clone.querySelectorAll('#overlayImageContainer');
  overlayContainers.forEach(function (oc) { oc.remove(); });

  // 找到所有分页符
  let breaks = clone.querySelectorAll('hr.slide-break');

  if (breaks.length === 0) {
    // 没有分页符 → 整个内容作为一页
    slides.push(clone.innerHTML);
  } else {
    // 按分页符拆分
    let children = Array.from(clone.childNodes);
    let currentSlideParts = [];

    children.forEach(function (child) {
      if (child.nodeType === 1 && child.tagName === 'HR' && child.classList.contains('slide-break')) {
        // 遇到分页符 → 保存当前页，开始新页
        slides.push(currentSlideParts.join(''));
        currentSlideParts = [];
      } else {
        currentSlideParts.push(serializeNode(child));
      }
    });

    // 最后一页
    if (currentSlideParts.length > 0) {
      slides.push(currentSlideParts.join(''));
    }
  }

  // 过滤空页
  slides = slides.filter(function (s) { return s.trim().length > 0; });

  // 如果所有页都为空，至少保留一页
  if (slides.length === 0) {
    slides.push('<p style="color:#666;text-align:center;margin-top:40vh;">空白幻灯片</p>');
  }

  return slides;
}

// 序列化 DOM 节点
function serializeNode(node) {
  if (node.nodeType === 3) return node.textContent;
  if (node.nodeType === 1) return node.outerHTML;
  return '';
}

// ── 收集 overlay 元素数据及其所属页码 ──
function collectOverlayData() {
  let editorBody = document.getElementById('tinymce-editor-textarea');
  if (!editorBody) return [];

  let overlayItems = [];
  // 在所有画布块中查找 .oly-item 元素
  let blocks = editorBody.querySelectorAll('.tmce-overlay-block');
  if (blocks.length === 0) return [];

  let overlayElements = [];
  blocks.forEach(function (block) {
    block.querySelectorAll('.oly-item').forEach(function (el) {
      overlayElements.push(el);
    });
  });

  // 获取分页符位置
  let breaks = editorBody.querySelectorAll('hr.slide-break');
  let breakPositions = [];
  breaks.forEach(function (br) {
    breakPositions.push(br.offsetTop);
  });
  breakPositions.push(Infinity); // 最后一页的边界

  overlayElements.forEach(function (el) {
    let id = el.getAttribute('data-id');
    if (!id) return;
    let imgData = overlayImages.find(function (item) { return item.id === id; });
    if (!imgData) return;

    // 根据 overlay 的 Y 坐标判断属于哪一页
    let itemY = imgData.y || 0;
    let slideIndex = 0;
    for (let i = 0; i < breakPositions.length; i++) {
      if (itemY < breakPositions[i]) {
        slideIndex = i;
        break;
      }
    }

    overlayItems.push({
      slideIndex: slideIndex,
      imgData: imgData,
      element: el
    });
  });

  return overlayItems;
}

// ── 在幻灯片中渲染 overlay 元素 ──
function renderOverlayInSlide(container, overlayItem) {
  let imgData = overlayItem.imgData;
  let el = document.createElement('div');
  el.style.cssText =
    'position:absolute;pointer-events:auto;' +
    'left:' + (imgData.x || 0) + 'px;' +
    'top:' + (imgData.y || 0) + 'px;' +
    'width:' + (imgData.width || 200) + 'px;' +
    'height:' + (imgData.height || 150) + 'px;' +
    'transform:rotate(' + (imgData.rotation || 0) + 'deg);' +
    'overflow:hidden;';

  if (imgData.type === 'chart') {
    el.className = 'slide-chart-placeholder';
    el.setAttribute('data-chart-type', imgData.chartType || 'bar');
    el.setAttribute('data-chart-title', imgData.chartTitle || '');
    el.style.background = '#1a1a2e';
    el.style.border = '1px solid #2c6e7e';
    el.style.borderRadius = '4px';
    // 图表将在 Reveal 初始化后用 ECharts 渲染
    el.innerHTML = '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#666;font-size:12px;">加载中...</div>';
  } else if (imgData.type === 'image') {
    let img = document.createElement('img');
    img.src = imgData.src || '';
    img.style.cssText = 'width:100%;height:100%;object-fit:contain;';
    el.appendChild(img);
  } else if (imgData.type === 'shape') {
    let svg = imgData.svgContent || '';
    el.innerHTML = svg;
    let svgEl = el.querySelector('svg');
    if (svgEl) {
      svgEl.style.width = '100%';
      svgEl.style.height = '100%';
    }
  } else if (imgData.type === 'textbox') {
    el.innerHTML = imgData.htmlContent || '<p>文本框</p>';
    el.style.background = imgData.fillColor || 'transparent';
    el.style.border = imgData.strokeColor ? ('1px solid ' + imgData.strokeColor) : 'none';
    el.style.padding = '8px';
    el.style.fontSize = '14px';
    el.style.color = '#eee';
    el.style.overflow = 'auto';
  } else if (imgData.type === 'excel') {
    el.style.background = '#1a1a2e';
    el.style.border = '1px solid #2c6e7e';
    el.style.borderRadius = '4px';
    el.innerHTML = '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#666;font-size:12px;">📊 表格数据</div>';
  } else if (imgData.type === 'video') {
    let video = document.createElement('video');
    video.src = imgData.src || '';
    video.style.cssText = 'width:100%;height:100%;object-fit:contain;';
    video.controls = true;
    el.appendChild(video);
  } else if (imgData.type === 'audio') {
    let audio = document.createElement('audio');
    audio.src = imgData.src || '';
    audio.controls = true;
    audio.style.cssText = 'width:100%;';
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    el.appendChild(audio);
  }

  container.appendChild(el);
}

// ── 渲染演示模式中的所有图表 ──
function renderAllChartsInPresentation() {
  if (typeof echarts === 'undefined') return;

  let chartPlaceholders = document.querySelectorAll('.slide-chart-placeholder');
  chartPlaceholders.forEach(function (el) {
    let chartType = el.getAttribute('data-chart-type') || 'bar';
    let chartTitle = el.getAttribute('data-chart-title') || '';

    // 从 overlayImages 找到对应的图表数据
    let id = el.getAttribute('data-chart-id');
    let imgData = id ? overlayImages.find(function (item) { return item.id === id; }) : null;

    // 清空占位内容
    el.innerHTML = '';
    let chartDiv = document.createElement('div');
    chartDiv.style.cssText = 'width:100%;height:100%;';
    el.appendChild(chartDiv);

    try {
      let chart = echarts.init(chartDiv);
      let option = buildEChartsOption(chartType, imgData ? imgData.chartData : { categories: [], series: [] }, chartTitle);
      chart.setOption(option);

      // 监听窗口大小变化
      let resizeHandler = function () {
        try { chart.resize(); } catch (e) { /* ignore */ }
      };
      window.addEventListener('resize', resizeHandler);
    } catch (e) {
      el.innerHTML = '<div style="color:#ee6666;font-size:12px;text-align:center;padding:20px;">图表渲染失败</div>';
    }
  });
}
