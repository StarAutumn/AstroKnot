// ============================================================
//  overlay-document.js — 文档预览 overlay 类型（PDF / DOCX）
//
//  渲染策略（全平台本地渲染，无外部服务依赖）：
//    PDF   → pdf.js 直接渲染
//    DOCX  → docx-preview 渲染
// ============================================================
import { overlayImages, getNextZIndex, ensureOverlay, renderAll, transactRender, selectImage, getInsertY, getInsertX } from './overlay-images.js';
import { getActiveBlockId, getBlockWidth, pxToPct } from './overlay-block.js';

let _docInput = null;
let _pdfLib = null;
let _docxLib = null;

function getDocInput() {
  if (!_docInput) {
    _docInput = document.createElement('input');
    _docInput.type = 'file';
    _docInput.accept = '.pdf,.docx';
    _docInput.style.display = 'none';
    document.body.appendChild(_docInput);
    _docInput.addEventListener('change', function () {
      if (this.files && this.files[0]) {
        addDocumentFromFile(this.files[0]);
        this.value = '';
      }
    });
  }
  return _docInput;
}

export function openDocumentPicker() {
  getDocInput().click();
}

function detectDocType(fileName) {
  let ext = fileName.split('.').pop().toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx') return 'docx';
  return 'pdf';
}

export function addDocumentFromFile(file) {
  let docType = detectDocType(file.name);
  let blockId = getActiveBlockId();
  let blockW = blockId ? getBlockWidth(blockId) : 800;
  let w = Math.min(560, blockW - 40);
  let h = Math.round(w * 1.3);
  let x = Math.max(0, (blockW - w) / 2);
  let y = getInsertY();
  let reader = new FileReader();
  reader.onload = function (e) {
    let dataUrl = e.target.result;
    let docData = {
      type: 'document',
      id: 'oly-doc-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
      blockId: blockId,
      docType: docType,
      src: dataUrl,
      srcType: 'dataUrl',
      fileName: file.name,
      x: x,
      y: y,
      width: w,
      height: h,
      zIndex: getNextZIndex(),
      currentPage: 1,
      totalPages: 0,
      zoom: 100,
      leftPct: pxToPct(x, blockW),
      widthPct: pxToPct(w, blockW),
      _refWidth: blockW
    };
    overlayImages.push(docData);
    selectImage(docData.id);
    transactRender();
  };
  reader.readAsDataURL(file);
}

// ── PDF 库加载 ──

async function loadPdfLib() {
  if (_pdfLib) return _pdfLib;
  let pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
  _pdfLib = pdfjsLib;
  return _pdfLib;
}

async function loadDocxLib() {
  if (_docxLib) return _docxLib;
  _docxLib = window.docx;
  if (!_docxLib) throw new Error('docx-preview 库未加载');
  return _docxLib;
}

// ── PDF 渲染（全平台通用） ──

async function renderPdfPages(container, imgData) {
  container.innerHTML = '';
  let loading = document.createElement('div');
  loading.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100%;color:#888;font-size:13px;';
  loading.textContent = '加载 PDF 中…';
  container.appendChild(loading);
  try {
    let pdfjsLib = await loadPdfLib();
    let data = imgData.src;
    if (data.startsWith('data:')) {
      let raw = atob(data.split(',')[1]);
      let arr = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
      data = arr;
    }
    let pdf = await pdfjsLib.getDocument(data).promise;
    imgData.totalPages = pdf.numPages;
    container.innerHTML = '';
    let pagesWrap = document.createElement('div');
    pagesWrap.style.cssText = 'overflow:auto;height:100%;padding:8px;display:flex;flex-direction:column;align-items:center;gap:8px;';
    pagesWrap.className = 'oly-doc-pages';
    let scale = (imgData.zoom || 100) / 100;
    for (let i = 1; i <= pdf.numPages; i++) {
      let page = await pdf.getPage(i);
      let viewport = page.getViewport({ scale: scale * 1.2 });
      let canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.cssText = 'box-shadow:0 1px 4px rgba(0,0,0,0.3);border-radius:2px;background:#fff;flex-shrink:0;';
      let ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport: viewport }).promise;
      pagesWrap.appendChild(canvas);
    }
    container.appendChild(pagesWrap);
  } catch (err) {
    container.innerHTML = '';
    let errEl = document.createElement('div');
    errEl.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100%;color:#ff6b6b;font-size:12px;padding:20px;text-align:center;';
    errEl.textContent = 'PDF 加载失败: ' + (err.message || err);
    container.appendChild(errEl);
  }
}

// ── Word 文档渲染（Web 回退方案） ──

async function renderDocxContent(container, imgData) {
  container.innerHTML = '';
  let loading = document.createElement('div');
  loading.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100%;color:#888;font-size:13px;';
  loading.textContent = '加载 Word 文档中…';
  container.appendChild(loading);
  try {
    let docxPreview = await loadDocxLib();
    let data = imgData.src;
    if (data.startsWith('data:')) {
      let raw = atob(data.split(',')[1]);
      let arr = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
      data = arr.buffer;
    }
    container.innerHTML = '';
    let scrollWrap = document.createElement('div');
    scrollWrap.style.cssText = 'overflow-y:auto;overflow-x:hidden;height:100%;padding:8px;';
    scrollWrap.className = 'oly-doc-pages';
    let docContainer = document.createElement('div');
    let scale = (imgData.zoom || 100) / 100;
    docContainer.style.cssText = 'background:#fff;border-radius:4px;box-shadow:0 1px 4px rgba(0,0,0,0.3);min-height:200px;transform:scale(' + scale + ');transform-origin:top center;';
    scrollWrap.appendChild(docContainer);
    container.appendChild(scrollWrap);
    await docxPreview.renderAsync(data, docContainer, null, {
      className: 'docx-preview-wrapper',
      inWrapper: true,
      ignoreWidth: false,
      ignoreHeight: true,
      ignoreFonts: false,
      breakPages: true
    });
  } catch (err) {
    container.innerHTML = '';
    let errEl = document.createElement('div');
    errEl.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100%;color:#ff6b6b;font-size:12px;padding:20px;text-align:center;';
    errEl.textContent = 'Word 加载失败: ' + (err.message || err);
    container.appendChild(errEl);
  }
}

// 按文档类型重新渲染（缩放按钮用）
function rerenderDoc(contentArea, imgData) {
  if (imgData.docType === 'docx') {
    renderDocxContent(contentArea, imgData);
  } else {
    renderPdfPages(contentArea, imgData);
  }
}

// ════════════════════════════════════════════════
//  主渲染入口
// ════════════════════════════════════════════════

export async function renderDocumentContent(item, imgData) {
  let wrapper = document.createElement('div');
  wrapper.style.cssText = 'width:100%;height:100%;position:relative;overflow:hidden;background:#2a2a3e;border-radius:4px;display:flex;flex-direction:column;';
  wrapper.className = 'oly-doc-fullscreen-wrap';

  // ── 工具栏 ──
  let header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 8px;background:rgba(0,0,0,0.3);flex-shrink:0;min-height:28px;';

  let typeIcon = imgData.docType === 'pdf' ? '\u{1F4C4}' : '\u{1F4DD}';
  let icon = document.createElement('span');
  icon.style.cssText = 'font-size:13px;';
  icon.textContent = typeIcon;

  let nameEl = document.createElement('span');
  nameEl.style.cssText = 'color:#ccc;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;';
  nameEl.textContent = imgData.fileName || '文档';

  // 缩放按钮
  let zoomOut = document.createElement('button');
  zoomOut.textContent = '\u2212';
  zoomOut.title = '缩小';
  zoomOut.style.cssText = 'background:none;border:1px solid #555;color:#ccc;width:22px;height:22px;border-radius:3px;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;';
  zoomOut.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  zoomOut.addEventListener('click', function (e) {
    e.stopPropagation();
    imgData.zoom = Math.max(50, (imgData.zoom || 100) - 25);
    zoomLabel.textContent = imgData.zoom + '%';
    rerenderDoc(contentArea, imgData);
  });

  let zoomLabel = document.createElement('span');
  zoomLabel.style.cssText = 'color:#aaa;font-size:10px;min-width:36px;text-align:center;';
  zoomLabel.textContent = (imgData.zoom || 100) + '%';

  let zoomIn = document.createElement('button');
  zoomIn.textContent = '+';
  zoomIn.title = '放大';
  zoomIn.style.cssText = 'background:none;border:1px solid #555;color:#ccc;width:22px;height:22px;border-radius:3px;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;';
  zoomIn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  zoomIn.addEventListener('click', function (e) {
    e.stopPropagation();
    imgData.zoom = Math.min(300, (imgData.zoom || 100) + 25);
    zoomLabel.textContent = imgData.zoom + '%';
    rerenderDoc(contentArea, imgData);
  });

  header.appendChild(icon);
  header.appendChild(nameEl);
  header.appendChild(zoomOut);
  header.appendChild(zoomLabel);
  header.appendChild(zoomIn);

  let contentArea = document.createElement('div');
  contentArea.style.cssText = 'flex:1;overflow:hidden;position:relative;';
  contentArea.className = 'oly-doc-content';

  wrapper.appendChild(header);
  wrapper.appendChild(contentArea);
  item.appendChild(wrapper);

  // ── 分发渲染 ──
  if (imgData.docType === 'pdf') {
    // PDF → pdf.js 直接渲染
    renderPdfPages(contentArea, imgData);
    return;
  }

  // DOCX → docx-preview 本地渲染（全平台通用，无需外部服务）
  if (imgData.docType === 'docx') {
    renderDocxContent(contentArea, imgData);
  } else {
    renderPdfPages(contentArea, imgData);
  }
}
