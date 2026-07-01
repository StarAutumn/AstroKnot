// ============================================================
//  overlay/overlay-slideshow.js — 内嵌 Swiper 幻灯片组件
// ============================================================

import { overlayImages, renderAll, transactRender, getNextZIndex, getInsertY } from './overlay-images.js';
import { getActiveBlockId, getBlockWidth, pxToPct } from './overlay-block.js';

// ── 切换效果列表 ──
export const SLIDE_EFFECTS = {
  slide: { label: '滑动', value: 'slide' },
  fade: { label: '淡入', value: 'fade' },
  cube: { label: '立方体', value: 'cube' },
  coverflow: { label: '3D流', value: 'coverflow' },
  flip: { label: '翻页', value: 'flip' },
  cards: { label: '卡片', value: 'cards' }
};

// ── 默认页面模板 ──
function defaultSlide(index) {
  return {
    id: 'slide-' + Date.now() + '-' + index,
    title: '第 ' + (index + 1) + ' 页',
    content: '<p style="text-align:center;color:#aaa;font-size:16px;padding-top:40%;">第 ' + (index + 1) + ' 页 — 双击编辑内容</p>',
    bgColor: '#1a1a2e',
    bgImage: ''
  };
}

// ── 插入新幻灯片 ──
export function addSlideshow() {
  let blockId = getActiveBlockId();
  let blockW = blockId ? getBlockWidth(blockId) : 800;
  let w = Math.min(560, blockW - 40);
  let h = Math.min(380, 500);
  let x = Math.max(0, (blockW - w) / 2);
  let y = getInsertY();

  let slides = [defaultSlide(0), defaultSlide(1), defaultSlide(2)];

  let slideshowData = {
    type: 'slideshow',
    id: 'oly-slide-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
    blockId: blockId,
    x: x,
    y: y,
    width: w,
    height: h,
    zIndex: getNextZIndex(),
    rotation: 0,
    leftPct: pxToPct(x, blockW),
    widthPct: pxToPct(w, blockW),
    _refWidth: blockW,
    // 幻灯片配置
    title: '',
    effect: 'slide',        // 切换效果
    autoplay: false,        // 自动播放
    autoplayDelay: 3000,    // 自动播放间隔(ms)
    loop: true,             // 循环播放
    showNavigation: true,   // 显示箭头
    showPagination: true,   // 显示分页点
    speed: 500,             // 切换速度(ms)
    // 页面数据
    slides: slides
  };

  overlayImages.push(slideshowData);
  renderAll();
  transactRender();
}

// ── 渲染幻灯片到 overlay ──
export function renderSlideshowContent(item, imgData) {
  let wrapper = document.createElement('div');
  wrapper.style.cssText =
    'width:100%;height:100%;position:relative;overflow:hidden;' +
    'background:#1a1a2e;border:1px solid #2c6e7e;border-radius:4px;display:flex;flex-direction:column;';

  // 标题栏
  let titleBar = document.createElement('div');
  titleBar.style.cssText =
    'height:26px;background:#16213e;display:flex;align-items:center;padding:0 8px;' +
    'border-bottom:1px solid #2c6e7e;font-size:11px;color:#aef0ff;gap:6px;flex-shrink:0;';

  let icon = document.createElement('span');
  icon.innerHTML = '&#127916;';
  let title = document.createElement('span');
  let effectLabel = SLIDE_EFFECTS[imgData.effect] ? SLIDE_EFFECTS[imgData.effect].label : '幻灯片';
  title.textContent = imgData.title || ('幻灯片 · ' + effectLabel);
  title.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';

  let editBtn = document.createElement('span');
  editBtn.innerHTML = '&#9998;';
  editBtn.style.cssText = 'cursor:pointer;font-size:12px;opacity:0.7;';
  editBtn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  editBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    openSlideshowEditor(imgData);
  });

  titleBar.appendChild(icon);
  titleBar.appendChild(title);
  titleBar.appendChild(editBtn);

  // Swiper 容器
  let swiperContainer = document.createElement('div');
  swiperContainer.className = 'oly-swiper-container';
  swiperContainer.style.cssText = 'flex:1;overflow:hidden;position:relative;';

  let swiperWrapper = document.createElement('div');
  swiperWrapper.className = 'swiper-wrapper';

  // 渲染每页
  let slides = imgData.slides || [];
  if (slides.length === 0) slides = [defaultSlide(0)];

  slides.forEach(function (slide) {
    let slideEl = document.createElement('div');
    slideEl.className = 'swiper-slide';
    slideEl.style.cssText =
      'width:100%;height:100%;overflow:auto;' +
      'background:' + (slide.bgColor || '#1a1a2e') + ';' +
      'position:relative;display:flex;align-items:center;justify-content:center;';

    if (slide.bgImage) {
      slideEl.style.backgroundImage = "url('" + slide.bgImage + "')";
      slideEl.style.backgroundSize = 'cover';
      slideEl.style.backgroundPosition = 'center';
    }

    let contentDiv = document.createElement('div');
    contentDiv.style.cssText = 'width:100%;height:100%;padding:12px;box-sizing:border-box;color:#ccc;font-size:13px;line-height:1.5;overflow:auto;';
    contentDiv.innerHTML = slide.content || '';
    slideEl.appendChild(contentDiv);

    swiperWrapper.appendChild(slideEl);
  });

  // 分页指示器
  let paginationDiv = document.createElement('div');
  paginationDiv.className = 'swiper-pagination';
  paginationDiv.style.cssText = 'bottom:4px!important;';

  // 导航箭头
  let prevBtn = document.createElement('div');
  prevBtn.className = 'swiper-button-prev';
  prevBtn.style.cssText = 'color:#aef0ff!important;width:20px;height:20px;';

  let nextBtn = document.createElement('div');
  nextBtn.className = 'swiper-button-next';
  nextBtn.style.cssText = 'color:#aef0ff!important;width:20px;height:20px;';

  swiperContainer.appendChild(swiperWrapper);
  if (imgData.showPagination !== false) swiperContainer.appendChild(paginationDiv);
  if (imgData.showNavigation !== false) {
    swiperContainer.appendChild(prevBtn);
    swiperContainer.appendChild(nextBtn);
  }
  wrapper.appendChild(titleBar);
  wrapper.appendChild(swiperContainer);
  item.appendChild(wrapper);

  // 初始化 Swiper
  if (typeof Swiper !== 'undefined') {
    requestAnimationFrame(function () {
      try {
        let swiperConfig = {
          el: swiperContainer,
          loop: imgData.loop !== false,
          effect: imgData.effect || 'slide',
          speed: imgData.speed || 500,
          grabCursor: true,
          keyboard: { enabled: true },
          mousewheel: { enabled: true, forceToAxis: true },
          observer: true,
          observeParents: true,
          pagination: imgData.showPagination !== false ? { el: '.swiper-pagination', clickable: true } : false,
          navigation: imgData.showNavigation !== false ? { prevEl: '.swiper-button-prev', nextEl: '.swiper-button-next' } : false,
          on: {
            init: function () {
              // 如果自动播放，初始化后启动
              if (imgData.autoplay && this.params.autoplay) {
                this.autoplay.start();
              }
            }
          }
        };

        // 自动播放配置
        if (imgData.autoplay) {
          swiperConfig.autoplay = {
            delay: imgData.autoplayDelay || 3000,
            disableOnInteraction: false,
            pauseOnMouseEnter: true
          };
        }

        // 特效特定配置
        if (imgData.effect === 'cube') {
          swiperConfig.cubeEffect = {
            shadow: true,
            slideShadows: true,
            shadowOffset: 20,
            shadowScale: 0.94
          };
        }
        if (imgData.effect === 'coverflow') {
          swiperConfig.coverflowEffect = {
            rotate: 50,
            stretch: 0,
            depth: 100,
            modifier: 1,
            slideShadows: true
          };
        }
        if (imgData.effect === 'flip') {
          swiperConfig.flipEffect = {
            limitRotation: true,
            slideShadows: true
          };
        }
        if (imgData.effect === 'cards') {
          swiperConfig.cardsEffect = {
            perSlideOffset: 8,
            perSlideRotate: 2,
            rotate: true,
            slideShadows: true
          };
        }

        let swiperInstance = new Swiper(swiperContainer, swiperConfig);
        item._swiperInstance = swiperInstance;

        // 存储引用，用于后续销毁/重建
        item._swiperContainer = swiperContainer;
      } catch (e) {
        console.error('[Swiper] 初始化失败:', e);
        swiperContainer.innerHTML = '<div style="color:#ee6666;text-align:center;padding:40px;">Swiper 加载失败</div>';
      }
    });
  } else {
    swiperContainer.innerHTML = '<div style="color:#ee6666;text-align:center;padding:40px;">Swiper.js 未加载</div>';
  }

  // 双击编辑
  item.addEventListener('dblclick', function (e) {
    e.preventDefault();
    e.stopPropagation();
    openSlideshowEditor(imgData);
  });
}

// ── 编辑器弹窗 ──
let slideshowEditorModal = null;
let currentSlideshowData = null;

export function openSlideshowEditor(imgData) {
  currentSlideshowData = imgData;

  if (!slideshowEditorModal) {
    slideshowEditorModal = document.createElement('div');
    slideshowEditorModal.id = 'slideshowEditorModal';
    slideshowEditorModal.style.cssText =
      'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:99999;' +
      'display:none;flex-direction:column;align-items:center;justify-content:center;' +
      'background:rgba(0,0,0,0.65);';
    document.body.appendChild(slideshowEditorModal);
  }

  slideshowEditorModal.innerHTML = '';
  slideshowEditorModal.style.display = 'flex';

  // 主容器
  let container = document.createElement('div');
  container.style.cssText =
    'width:92vw;height:88vh;max-width:1300px;max-height:900px;' +
    'background:#1a1a2e;border-radius:8px;overflow:hidden;' +
    'display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,0.5);';

  // ── 顶部工具栏 ──
  let toolbar = document.createElement('div');
  toolbar.style.cssText =
    'height:42px;background:#16213e;display:flex;align-items:center;padding:0 14px;' +
    'border-bottom:1px solid #2c6e7e;gap:10px;flex-shrink:0;';

  let titleSpan = document.createElement('span');
  titleSpan.style.cssText = 'flex:1;color:#aef0ff;font-size:14px;font-weight:bold;';
  titleSpan.textContent = '幻灯片编辑器';

  let saveBtn = createSBtn('保存', '#0a8a6e', function () { saveSlideshow(); });
  let cancelBtn = createSBtn('取消', '#6e2c2c', function () { closeSlideshowEditor(); });

  toolbar.appendChild(titleSpan);
  toolbar.appendChild(saveBtn);
  toolbar.appendChild(cancelBtn);

  // ── 内容区：左右布局 ──
  let content = document.createElement('div');
  content.style.cssText = 'flex:1;display:flex;overflow:hidden;';

  // ---- 左侧：设置 + 页面管理 ----
  let leftPanel = document.createElement('div');
  leftPanel.style.cssText =
    'width:320px;min-width:280px;background:#16213e;border-right:1px solid #2c6e7e;' +
    'display:flex;flex-direction:column;overflow-y:auto;flex-shrink:0;';

  // 基本设置区
  let settingsGroup = createSFormGroup('基本设置');

  // 标题
  let titleLabel = document.createElement('label');
  titleLabel.style.cssText = 'color:#aaa;font-size:11px;margin-bottom:3px;display:block;';
  titleLabel.textContent = '标题';
  let titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.value = imgData.title || '';
  titleInput.placeholder = '输入幻灯片标题';
  titleInput.style.cssText = S_INPUT_STYLE;
  settingsGroup.appendChild(titleLabel);
  settingsGroup.appendChild(titleInput);

  // 切换效果
  let effectLabel = document.createElement('label');
  effectLabel.style.cssText = 'color:#aaa;font-size:11px;margin-bottom:3px;display:block;margin-top:8px;';
  effectLabel.textContent = '切换效果';
  let effectSelect = document.createElement('select');
  Object.values(SLIDE_EFFECTS).forEach(function (ef) {
    let opt = document.createElement('option');
    opt.value = ef.value;
    opt.textContent = ef.label;
    if (imgData.effect === ef.value) opt.selected = true;
    effectSelect.appendChild(opt);
  });
  effectSelect.style.cssText = S_INPUT_STYLE;
  settingsGroup.appendChild(effectLabel);
  settingsGroup.appendChild(effectSelect);

  // 设置行（自动播放、循环等）
  let toggleRow = document.createElement('div');
  toggleRow.style.cssText = 'display:flex;gap:16px;margin-top:10px;flex-wrap:wrap;';

  let autoPlayToggle = createSToggle('自动播放', imgData.autoplay);
  let loopToggle = createSToggle('循环', imgData.loop !== false);
  let navToggle = createSToggle('箭头导航', imgData.showNavigation !== false);
  let pagToggle = createSToggle('分页圆点', imgData.showPagination !== false);

  toggleRow.appendChild(autoPlayToggle.container);
  toggleRow.appendChild(loopToggle.container);
  toggleRow.appendChild(navToggle.container);
  toggleRow.appendChild(pagToggle.container);
  settingsGroup.appendChild(toggleRow);

  // 播放速度
  let speedRow = document.createElement('div');
  speedRow.style.cssText = 'display:flex;gap:10px;margin-top:8px;align-items:center;';
  let speedLabel = document.createElement('label');
  speedLabel.style.cssText = 'color:#aaa;font-size:11px;white-space:nowrap;';
  speedLabel.textContent = '切换速度';
  let speedInput = document.createElement('input');
  speedInput.type = 'number';
  speedInput.min = '200';
  speedInput.max = '2000';
  speedInput.step = '100';
  speedInput.value = imgData.speed || 500;
  speedInput.style.cssText = S_INPUT_STYLE + 'width:80px;';
  let speedUnit = document.createElement('span');
  speedUnit.style.cssText = 'color:#666;font-size:10px;';
  speedUnit.textContent = 'ms';
  speedRow.appendChild(speedLabel);
  speedRow.appendChild(speedInput);
  speedRow.appendChild(speedUnit);

  // 自动播放间隔
  let delayRow = document.createElement('div');
  delayRow.style.cssText = 'display:flex;gap:10px;margin-top:6px;align-items:center;';
  let delayLabel = document.createElement('label');
  delayLabel.style.cssText = 'color:#aaa;font-size:11px;white-space:nowrap;';
  delayLabel.textContent = '播放间隔';
  let delayInput = document.createElement('input');
  delayInput.type = 'number';
  delayInput.min = '1000';
  delayInput.max = '10000';
  delayInput.step = '500';
  delayInput.value = imgData.autoplayDelay || 3000;
  delayInput.style.cssText = S_INPUT_STYLE + 'width:80px;';
  let delayUnit = document.createElement('span');
  delayUnit.style.cssText = 'color:#666;font-size:10px;';
  delayUnit.textContent = 'ms';
  delayRow.appendChild(delayLabel);
  delayRow.appendChild(delayInput);
  delayRow.appendChild(delayUnit);

  settingsGroup.appendChild(speedRow);
  settingsGroup.appendChild(delayRow);

  leftPanel.appendChild(settingsGroup);

  // 页面管理区
  let pagesGroup = createSFormGroup('页面管理');

  let pagesList = document.createElement('div');
  pagesList.id = 'slideshowPagesList';
  pagesList.style.cssText = 'display:flex;flex-direction:column;gap:6px;max-height:400px;overflow-y:auto;';

  let slides = imgData.slides || [];
  slides.forEach(function (slide, idx) {
    pagesList.appendChild(buildPageItem(slide, idx));
  });

  // 添加页面按钮
  let addPageBtn = document.createElement('button');
  addPageBtn.textContent = '+ 添加新页面';
  addPageBtn.style.cssText =
    'margin-top:8px;padding:6px 0;border:1px dashed #2c6e7e;border-radius:4px;' +
    'background:transparent;color:#0a8a6e;cursor:pointer;font-size:12px;width:100%;';
  addPageBtn.addEventListener('click', function () {
    let newIdx = slides.length;
    let newSlide = defaultSlide(newIdx);
    slides.push(newSlide);
    pagesList.appendChild(buildPageItem(newSlide, newIdx));
    refreshPreview();
  });

  pagesGroup.appendChild(pagesList);
  pagesGroup.appendChild(addPageBtn);
  leftPanel.appendChild(pagesGroup);

  // ---- 右侧：预览 ----
  let rightPanel = document.createElement('div');
  rightPanel.style.cssText = 'flex:1;display:flex;flex-direction:column;overflow:hidden;';

  let previewLabel = document.createElement('div');
  previewLabel.style.cssText = 'color:#aef0ff;font-size:12px;padding:8px 12px;flex-shrink:0;border-bottom:1px solid #2c6e7e;';
  previewLabel.textContent = '实时预览';

  let previewArea = document.createElement('div');
  previewArea.id = 'slideshowPreviewArea';
  previewArea.style.cssText = 'flex:1;position:relative;overflow:hidden;';

  rightPanel.appendChild(previewLabel);
  rightPanel.appendChild(previewArea);

  // 组装
  content.appendChild(leftPanel);
  content.appendChild(rightPanel);
  container.appendChild(toolbar);
  container.appendChild(content);
  slideshowEditorModal.appendChild(container);

  // 点击背景关闭
  slideshowEditorModal.addEventListener('mousedown', function (e) {
    if (e.target === slideshowEditorModal) closeSlideshowEditor();
  });

  // ESC 关闭
  let escHandler = function (e) {
    if (e.key === 'Escape') {
      closeSlideshowEditor();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);

  // 初始预览
  refreshPreview();

  // ── 刷新预览函数 ──
  function refreshPreview() {
    previewArea.innerHTML = '';

    let currentEffect = effectSelect.value;
    let isAutoPlay = autoPlayToggle.checked;
    let isLoop = loopToggle.checked;
    let showNav = navToggle.checked;
    let showPag = pagToggle.checked;
    let spd = parseInt(speedInput.value) || 500;
    let dly = parseInt(delayInput.value) || 3000;

    let previewSlides = slides.length > 0 ? slides : [defaultSlide(0)];

    let swContainer = document.createElement('div');
    swContainer.style.cssText = 'width:100%;height:100%;';

    let swWrapper = document.createElement('div');
    swWrapper.className = 'swiper-wrapper';
    swWrapper.style.cssText = 'height:100%;';

    previewSlides.forEach(function (slide) {
      let sEl = document.createElement('div');
      sEl.className = 'swiper-slide';
      sEl.style.cssText =
        'width:100%;height:100%;overflow:auto;' +
        'background:' + (slide.bgColor || '#1a1a2e') + ';' +
        'display:flex;align-items:center;justify-content:center;';

      if (slide.bgImage) {
        sEl.style.backgroundImage = "url('" + slide.bgImage + "')";
        sEl.style.backgroundSize = 'cover';
        sEl.style.backgroundPosition = 'center';
      }

      let cDiv = document.createElement('div');
      cDiv.innerHTML = slide.content || '';
      cDiv.style.cssText = 'width:100%;height:100%;padding:16px;box-sizing:border-box;color:#ccc;font-size:13px;line-height:1.5;overflow:auto;';
      sEl.appendChild(cDiv);
      swWrapper.appendChild(sEl);
    });

    swContainer.appendChild(swWrapper);

    if (showPag) {
      let pag = document.createElement('div');
      pag.className = 'swiper-pagination';
      pag.style.cssText = 'bottom:4px!important;';
      swContainer.appendChild(pag);
    }
    if (showNav) {
      let pBtn = document.createElement('div');
      pBtn.className = 'swiper-button-prev';
      pBtn.style.cssText = 'color:#aef0ff!important;';
      let nBtn = document.createElement('div');
      nBtn.className = 'swiper-button-next';
      nBtn.style.cssText = 'color:#aef0ff!important;';
      swContainer.appendChild(pBtn);
      swContainer.appendChild(nBtn);
    }

    previewArea.appendChild(swContainer);

    if (typeof Swiper !== 'undefined') {
      setTimeout(function () {
        let config = {
          el: swContainer,
          loop: isLoop,
          effect: currentEffect,
          speed: spd,
          grabCursor: true,
          observer: true,
          observeParents: true,
          pagination: showPag ? { el: '.swiper-pagination', clickable: true } : false,
          navigation: showNav ? { prevEl: '.swiper-button-prev', nextEl: '.swiper-button-next' } : false
        };

        if (isAutoPlay) {
          config.autoplay = { delay: dly, disableOnInteraction: false, pauseOnMouseEnter: true };
        }
        if (currentEffect === 'cube') {
          config.cubeEffect = { shadow: true, slideShadows: true, shadowOffset: 20, shadowScale: 0.94 };
        }
        if (currentEffect === 'coverflow') {
          config.coverflowEffect = { rotate: 50, stretch: 0, depth: 100, modifier: 1, slideShadows: true };
        }
        if (currentEffect === 'flip') {
          config.flipEffect = { limitRotation: true, slideShadows: true };
        }
        if (currentEffect === 'cards') {
          config.cardsEffect = { perSlideOffset: 8, perSlideRotate: 2, rotate: true, slideShadows: true };
        }

        try {
          new Swiper(swContainer, config);
        } catch (e) { /* ignore */ }
      }, 100);
    }
  }

  // 绑定设置变更事件
  effectSelect.addEventListener('change', refreshPreview);
  autoPlayToggle.input.addEventListener('change', refreshPreview);
  loopToggle.input.addEventListener('change', refreshPreview);
  navToggle.input.addEventListener('change', refreshPreview);
  pagToggle.input.addEventListener('change', refreshPreview);
  speedInput.addEventListener('input', refreshPreview);
  delayInput.addEventListener('input', refreshPreview);
  titleInput.addEventListener('input', function () { imgData.title = titleInput.value; });

  // ── 构建单个页面项 ──
  function buildPageItem(slide, idx) {
    let item = document.createElement('div');
    item.style.cssText =
      'border:1px solid #2c6e7e;border-radius:4px;padding:8px;background:#0f1629;position:relative;';

    let header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:6px;';

    let numBadge = document.createElement('span');
    numBadge.style.cssText = 'background:#2c6e7e;color:#fff;font-size:10px;padding:1px 6px;border-radius:3px;min-width:18px;text-align:center;';
    numBadge.textContent = idx + 1;

    let titleInp = document.createElement('input');
    titleInp.type = 'text';
    titleInp.value = slide.title || '';
    titleInp.placeholder = '页面标题';
    titleInp.style.cssText = S_INPUT_STYLE + 'flex:1;font-size:11px;';
    titleInp.addEventListener('input', function () { slide.title = titleInp.value; });

    let delBtn = document.createElement('span');
    delBtn.textContent = '×';
    delBtn.title = '删除此页';
    delBtn.style.cssText = 'cursor:pointer;color:#ee6666;font-size:16px;font-weight:bold;flex-shrink:0;';
    delBtn.addEventListener('click', function () {
      if (slides.length <= 1) return;
      let i = slides.indexOf(slide);
      if (i > -1) slides.splice(i, 1);
      item.remove();
      refreshPreview();
    });

    header.appendChild(numBadge);
    header.appendChild(titleInp);
    header.appendChild(delBtn);
    item.appendChild(header);

    // 背景色
    let bgRow = document.createElement('div');
    bgRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px;';

    let bgLabel = document.createElement('span');
    bgLabel.style.cssText = 'color:#888;font-size:10px;white-space:nowrap;';
    bgLabel.textContent = '背景色';
    let bgInput = document.createElement('input');
    bgInput.type = 'color';
    bgInput.value = slide.bgColor || '#1a1a2e';
    bgInput.style.cssText = 'width:28px;height:22px;border:1px solid #333;background:none;cursor:pointer;padding:0;';
    bgInput.addEventListener('input', function () {
      slide.bgColor = bgInput.value;
      refreshPreview();
    });
    bgRow.appendChild(bgLabel);
    bgRow.appendChild(bgInput);
    item.appendChild(bgRow);

    // 内容编辑
    let contentLabel = document.createElement('label');
    contentLabel.style.cssText = 'color:#888;font-size:10px;display:block;margin-top:4px;';
    contentLabel.textContent = '页面内容 (HTML)';
    let contentTA = document.createElement('textarea');
    contentTA.value = slide.content || '';
    contentTA.placeholder = '支持 HTML 内容...';
    contentTA.style.cssText =
      'width:100%;height:60px;background:#1a1a2e;border:1px solid #2c6e7e;border-radius:3px;' +
      'color:#ccc;font-size:11px;padding:4px;resize:vertical;font-family:monospace;';
    contentTA.addEventListener('input', function () {
      slide.content = contentTA.value;
      refreshPreview();
    });
    item.appendChild(contentLabel);
    item.appendChild(contentTA);

    return item;
  }

  // ── 保存 ──
  function saveSlideshow() {
    imgData.title = titleInput.value;
    imgData.effect = effectSelect.value;
    imgData.autoplay = autoPlayToggle.checked;
    imgData.loop = loopToggle.checked;
    imgData.showNavigation = navToggle.checked;
    imgData.showPagination = pagToggle.checked;
    imgData.speed = parseInt(speedInput.value) || 500;
    imgData.autoplayDelay = parseInt(delayInput.value) || 3000;
    imgData.slides = slides.filter(function (s) { return s; });

    renderAll();
    transactRender();
    closeSlideshowEditor();
  }

  // ── 关闭 ──
  function closeSlideshowEditor() {
    slideshowEditorModal.style.display = 'none';
    currentSlideshowData = null;
  }
}

// ── UI 辅助函数 ──
function createSBtn(text, color, onClick) {
  let btn = document.createElement('button');
  btn.textContent = text;
  btn.style.cssText =
    'padding:5px 16px;border:none;border-radius:4px;cursor:pointer;' +
    'background:' + color + ';color:#fff;font-size:12px;font-weight:bold;';
  btn.addEventListener('click', onClick);
  return btn;
}

const S_INPUT_STYLE =
  'width:100%;padding:5px 8px;background:#1a1a2e;border:1px solid #2c6e7e;' +
  'border-radius:3px;color:#ccc;font-size:12px;outline:none;box-sizing:border-box;' +
  'transition:border-color 0.15s;';

const S_INPUT_FOCUS = 'input:focus{ border-color:#0a8a6e !important; }';

function createSFormGroup(label) {
  let group = document.createElement('div');
  group.style.cssText = 'padding:10px 12px;border-bottom:1px solid #2c6e7e;';

  let title = document.createElement('div');
  title.style.cssText = 'color:#aef0ff;font-size:12px;font-weight:bold;margin-bottom:8px;';
  title.textContent = label;
  group.insertBefore(title, group.firstChild);

  return group;
}

function createSToggle(label, checked) {
  let container = document.createElement('label');
  container.style.cssText = 'display:flex;align-items:center;gap:4px;cursor:pointer;font-size:11px;color:#aaa;';

  let input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = !!checked;
  input.style.cssText = 'accent-color:#0a8a6e;cursor:pointer;';

  container.appendChild(input);
  container.appendChild(document.createTextNode(label));

  return { container: container, input: input, get checked() { return input.checked; } };
}
