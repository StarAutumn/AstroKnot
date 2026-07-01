import { state } from '../shared-state.js';
import { showWindow, hideWindow } from '../../UI/Window.js';
import { rgbToHex, getCKEditorInstance, isCKEditorActive, getEditingFormulaImg, clearEditingFormulaImg } from '../utils.js';

export function insertFormulaToTiny(latex, color, fontSize, replaceTarget) {
  if (!state.tinyEditor || !latex) return;

  state.tinyEditor.focus();

  if (!fontSize) {
    const body = state.tinyEditor.getBody();
    if (body) {
      const computed = window.getComputedStyle(body);
      fontSize = parseFloat(computed.fontSize) || 18;
    } else {
      fontSize = 18;
    }
  }

  const displaySize = fontSize * 1.5 + 'px';
  const scale = Math.max(2, fontSize / 14 * 2);

  const tempContainer = document.createElement('div');
  tempContainer.innerHTML = `\\(${latex}\\)`;
  tempContainer.style.position = 'absolute';
  tempContainer.style.left = '-9999px';
  tempContainer.style.color = color;
  tempContainer.style.fontSize = displaySize;
  tempContainer.style.padding = '4px 4px';
  document.body.appendChild(tempContainer);

  function fallbackInsert() {
    if (replaceTarget) {
      let fallbackNode = state.tinyEditor.getDoc().createTextNode('$' + latex + '$');
      state.tinyEditor.dom.replace(fallbackNode, replaceTarget);
    } else {
      state.tinyEditor.insertContent('$' + latex + '$');
    }
    try {
      document.body.removeChild(tempContainer);
    } catch (e) { }
  }

  let safeLatex = latex.replace(/"/g, '&quot;');

  if (window.MathJax) {
    MathJax.typesetPromise([tempContainer]).then(() => {
      const mjxElements = tempContainer.querySelectorAll('mjx-container, mjx-math, mjx-span');
      mjxElements.forEach(el => {
        el.style.color = color;
        el.style.fontSize = displaySize;
      });
      const svgElements = tempContainer.querySelectorAll('svg');
      svgElements.forEach(svg => {
        svg.style.color = color;
        svg.style.filter = `drop-shadow(0 0 2px ${color})`;
      });

      if (window.html2canvas) {
        html2canvas(tempContainer, {
          backgroundColor: null,
          scale: scale
        }).then(canvas => {
          const imgDataUrl = canvas.toDataURL('image/png');
          const imgId = 'tmce-formula-' + Date.now();
          if (replaceTarget) {
            let newImg = state.tinyEditor.getDoc().createElement('img');
            newImg.src = imgDataUrl;
            newImg.className = 'tmce-formula-img';
            newImg.setAttribute('data-latex', latex);
            newImg.setAttribute('data-color', color);
            newImg.style.cssText = 'vertical-align:middle;height:auto;width:auto;object-fit:contain;';
            let oldStyle = replaceTarget.style;
            let propsToCopy = [
              'width', 'height', 'maxWidth', 'minWidth', 'maxHeight', 'minHeight',
              'display', 'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
              'cssFloat', 'padding', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight',
              'position', 'top', 'right', 'bottom', 'left', 'transform',
              'opacity', 'borderRadius', 'boxShadow', 'filter'
            ];
            for (let i = 0; i < propsToCopy.length; i++) {
              let prop = propsToCopy[i];
              let val = oldStyle[prop];
              if (val && val !== '') {
                newImg.style[prop] = val;
              }
            }
            newImg.alt = latex;
            state.tinyEditor.dom.replace(newImg, replaceTarget);
          } else {
            const imgHtml = '<img src="' + imgDataUrl + '" ' +
              'id="' + imgId + '" ' +
              'class="tmce-formula-img" ' +
              'data-latex="' + safeLatex + '" ' +
              'data-color="' + color + '" ' +
              'style="vertical-align:middle;height:auto;width:auto;object-fit:contain;" ' +
              'alt="' + safeLatex + '" />';
            state.tinyEditor.insertContent(imgHtml);
          }
          try {
            document.body.removeChild(tempContainer);
          } catch (e) { }
        }).catch(() => {
          fallbackInsert();
        });
      } else {
        fallbackInsert();
      }
    }).catch(() => {
      fallbackInsert();
    });
  } else {
    fallbackInsert();
  }
}

export function bindFormulaEditor() {
  const formulaEditorModal = document.getElementById('formulaEditorModal');
  const formulaInput = document.getElementById('formulaMathfield');
  const formulaColorPicker = document.getElementById('formulaColorPicker');

  function getCurrentFontSize() {
    if (state.tinyEditor) {
      const body = state.tinyEditor.getBody();
      if (body) {
        const computed = window.getComputedStyle(body);
        return parseFloat(computed.fontSize) || 18;
      }
    }
    return 18;
  }

  function getCurrentFontColor() {
    if (state.tinyEditor) {
      const color = state.tinyEditor.formatter.get('color');
      if (color) {
        return rgbToHex(color);
      }
      const body = state.tinyEditor.getBody();
      if (body) {
        const computed = window.getComputedStyle(body);
        return rgbToHex(computed.color);
      }
    }
    return '#eef';
  }

  function showFormulaEditor() {
    clearEditingFormulaImg();
    if (!formulaEditorModal || !formulaInput) return;
    if (formulaInput.setValue) {
      formulaInput.setValue('');
    }
    formulaEditorModal.style.left = '50%';
    formulaEditorModal.style.top = '50%';
    formulaEditorModal.style.transform = 'translate(-50%, -50%)';
    formulaEditorModal.style.width = '';
    formulaEditorModal.style.height = '';
    const defaultColor = getCurrentFontColor();
    if (formulaColorPicker) formulaColorPicker.value = defaultColor;
    showWindow(formulaEditorModal, 'block');
    formulaInput.focus();
  }

  function hideFormulaEditor() {
    clearEditingFormulaImg();
    if (formulaEditorModal) {
      var rect = formulaEditorModal.getBoundingClientRect();
      formulaEditorModal.style.left = rect.left + 'px';
      formulaEditorModal.style.top = rect.top + 'px';
      formulaEditorModal.style.transform = 'none';
      hideWindow(formulaEditorModal);
    }
  }

  function initModalDrag() {
    const header = document.getElementById('formulaModalHeader');
    const modal = document.getElementById('formulaEditorModal');
    if (!header || !modal) return;
    let isDragging = false;
    let startX, startY, modalLeft, modalTop;
    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('#closeFormulaModalBtn')) return;
      isDragging = true;
      const rect = modal.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      modalLeft = rect.left;
      modalTop = rect.top;
      document.body.style.cursor = 'move';
      document.addEventListener('mousemove', onDrag);
      document.addEventListener('mouseup', stopDrag);
    });
    function onDrag(e) {
      if (!isDragging) return;
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      const newLeft = Math.max(0, Math.min(window.innerWidth - modal.offsetWidth, modalLeft + deltaX));
      const newTop = Math.max(0, Math.min(window.innerHeight - modal.offsetHeight, modalTop + deltaY));
      modal.style.transform = 'none';
      modal.style.left = newLeft + 'px';
      modal.style.top = newTop + 'px';
    }
    function stopDrag() {
      isDragging = false;
      document.body.style.cursor = 'default';
      document.removeEventListener('mousemove', onDrag);
      document.removeEventListener('mouseup', stopDrag);
    }
  }
  function initModalResize() {
    const resizeHandle = document.getElementById('formulaResizeHandle');
    const modal = document.getElementById('formulaEditorModal');
    if (!resizeHandle || !modal) return;
    let isResizing = false;
    let startX, startY, startWidth, startHeight;
    resizeHandle.addEventListener('mousedown', (e) => {
      isResizing = true;
      startX = e.clientX;
      startY = e.clientY;
      startWidth = modal.offsetWidth;
      startHeight = modal.offsetHeight;
      document.body.style.cursor = 'se-resize';
      document.addEventListener('mousemove', onResize);
      document.addEventListener('mouseup', stopResize);
      e.preventDefault();
    });
    function onResize(e) {
      if (!isResizing) return;
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      const minWidth = 500;
      const minHeight = 300;
      const maxWidth = window.innerWidth - 40;
      const maxHeight = window.innerHeight - 40;
      const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + deltaX));
      const newHeight = Math.max(minHeight, Math.min(maxHeight, startHeight + deltaY));
      modal.style.width = newWidth + 'px';
      modal.style.height = newHeight + 'px';
    }
    function stopResize() {
      isResizing = false;
      document.body.style.cursor = 'default';
      document.removeEventListener('mousemove', onResize);
      document.removeEventListener('mouseup', stopResize);
    }
  }
  initModalDrag();
  initModalResize();

  function insertSymbolToInput(symbol) {
    if (symbol && formulaInput) {
      if (formulaInput.insert) {
        formulaInput.insert(symbol);
      } else {
        const start = formulaInput.selectionStart;
        const end = formulaInput.selectionEnd;
        const value = formulaInput.value;
        formulaInput.value = value.substring(0, start) + symbol + value.substring(end);
        formulaInput.focus();
        const newPosition = start + symbol.length;
        formulaInput.setSelectionRange(newPosition, newPosition);
      }
    }
  }

  function closeAllPopups() {
    const popups = document.querySelectorAll('.symbol-popup');
    popups.forEach(popup => popup.style.display = 'none');
  }

  const operatorBtn = document.getElementById('operatorBtn');
  const operatorPopup = document.getElementById('operatorPopup');
  if (operatorBtn && operatorPopup) {
    operatorBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllPopups();
      operatorPopup.style.display = operatorPopup.style.display === 'block' ? 'none' : 'block';
    });
    const operatorTabs = operatorPopup.querySelectorAll('.tab-btn');
    operatorTabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        e.stopPropagation();
        const tabType = tab.dataset.tab;
        operatorTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        operatorPopup.querySelectorAll('.symbol-grid').forEach(grid => grid.style.display = 'none');
        operatorPopup.querySelectorAll(`.${tabType}-tab`).forEach(grid => grid.style.display = 'grid');
      });
    });
    const operatorSymbols = operatorPopup.querySelectorAll('.popup-symbol-btn');
    operatorSymbols.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        insertSymbolToInput(btn.dataset.symbol);
      });
    });
  }

  const greekBtn = document.getElementById('greekBtn');
  const greekPopup = document.getElementById('greekPopup');
  if (greekBtn && greekPopup) {
    greekBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllPopups();
      greekPopup.style.display = greekPopup.style.display === 'block' ? 'none' : 'block';
    });
    const greekTabs = greekPopup.querySelectorAll('.tab-btn');
    greekTabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        e.stopPropagation();
        const tabType = tab.dataset.tab;
        greekTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        greekPopup.querySelectorAll('.symbol-grid').forEach(grid => grid.style.display = 'none');
        greekPopup.querySelectorAll(`.${tabType}-tab`).forEach(grid => grid.style.display = 'grid');
      });
    });
    const greekSymbols = greekPopup.querySelectorAll('.popup-symbol-btn');
    greekSymbols.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        insertSymbolToInput(btn.dataset.symbol);
      });
    });
  }

  const hebrewBtn = document.getElementById('hebrewBtn');
  const hebrewPopup = document.getElementById('hebrewPopup');
  if (hebrewBtn && hebrewPopup) {
    hebrewBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllPopups();
      hebrewPopup.style.display = hebrewPopup.style.display === 'block' ? 'none' : 'block';
    });
    const hebrewTabs = hebrewPopup.querySelectorAll('.tab-btn');
    hebrewTabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        e.stopPropagation();
        const tabType = tab.dataset.tab;
        hebrewTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        hebrewPopup.querySelectorAll('.symbol-grid').forEach(grid => grid.style.display = 'none');
        hebrewPopup.querySelectorAll(`.${tabType}-tab`).forEach(grid => grid.style.display = 'grid');
      });
    });
    const hebrewSymbols = hebrewPopup.querySelectorAll('.popup-symbol-btn');
    hebrewSymbols.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        insertSymbolToInput(btn.dataset.symbol);
      });
    });
  }

  const scriptBtn = document.getElementById('scriptLettersBtn');
  const scriptPopup = document.getElementById('scriptLettersPopup');
  if (scriptBtn && scriptPopup) {
    scriptBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllPopups();
      scriptPopup.style.display = scriptPopup.style.display === 'block' ? 'none' : 'block';
    });
    const scriptTabs = scriptPopup.querySelectorAll('.tab-btn');
    scriptTabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        e.stopPropagation();
        const tabType = tab.dataset.tab;
        scriptTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        scriptPopup.querySelectorAll('.symbol-grid').forEach(grid => grid.style.display = 'none');
        scriptPopup.querySelectorAll(`.${tabType}-tab`).forEach(grid => grid.style.display = 'grid');
      });
    });
    const scriptSymbols = scriptPopup.querySelectorAll('.popup-symbol-btn');
    scriptSymbols.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        insertSymbolToInput(btn.dataset.symbol);
      });
    });
  }

  const arrowBtn = document.getElementById('arrowBtn');
  const arrowPopup = document.getElementById('arrowPopup');
  if (arrowBtn && arrowPopup) {
    arrowBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllPopups();
      arrowPopup.style.display = arrowPopup.style.display === 'block' ? 'none' : 'block';
    });
    const arrowTabs = arrowPopup.querySelectorAll('.tab-btn');
    arrowTabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        e.stopPropagation();
        const tabType = tab.dataset.tab;
        arrowTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        arrowPopup.querySelectorAll('.symbol-grid').forEach(grid => grid.style.display = 'none');
        arrowPopup.querySelectorAll(`.${tabType}-tab`).forEach(grid => grid.style.display = 'grid');
      });
    });
    const arrowSymbols = arrowPopup.querySelectorAll('.popup-symbol-btn');
    arrowSymbols.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        insertSymbolToInput(btn.dataset.symbol);
      });
    });
  }

  const geometryBtn = document.getElementById('geometryBtn');
  const geometryPopup = document.getElementById('geometryPopup');
  if (geometryBtn && geometryPopup) {
    geometryBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllPopups();
      geometryPopup.style.display = geometryPopup.style.display === 'block' ? 'none' : 'block';
    });
    const geometryTabs = geometryPopup.querySelectorAll('.tab-btn');
    geometryTabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        e.stopPropagation();
        const tabType = tab.dataset.tab;
        geometryTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        geometryPopup.querySelectorAll('.symbol-grid').forEach(grid => grid.style.display = 'none');
        geometryPopup.querySelectorAll(`.${tabType}-tab`).forEach(grid => grid.style.display = 'grid');
      });
    });
    const geometrySymbols = geometryPopup.querySelectorAll('.popup-symbol-btn');
    geometrySymbols.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        insertSymbolToInput(btn.dataset.symbol);
      });
    });
  }

  const otherSymbolsBtn = document.getElementById('otherSymbolsBtn');
  const otherSymbolsPopup = document.getElementById('otherSymbolsPopup');
  if (otherSymbolsBtn && otherSymbolsPopup) {
    otherSymbolsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllPopups();
      otherSymbolsPopup.style.display = otherSymbolsPopup.style.display === 'block' ? 'none' : 'block';
    });
    const otherSymbolsTabs = otherSymbolsPopup.querySelectorAll('.tab-btn');
    otherSymbolsTabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        e.stopPropagation();
        const tabType = tab.dataset.tab;
        otherSymbolsTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        otherSymbolsPopup.querySelectorAll('.symbol-grid').forEach(grid => grid.style.display = 'none');
        otherSymbolsPopup.querySelectorAll(`.${tabType}-tab`).forEach(grid => grid.style.display = 'grid');
      });
    });
    const otherSymbolsBtns = otherSymbolsPopup.querySelectorAll('.popup-symbol-btn');
    otherSymbolsBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        insertSymbolToInput(btn.dataset.symbol);
      });
    });
  }

  const supSubBtn = document.getElementById('scriptBtn');
  const supSubPopup = document.getElementById('scriptPopup');
  if (supSubBtn && supSubPopup) {
    supSubBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllPopups();
      supSubPopup.style.display = supSubPopup.style.display === 'block' ? 'none' : 'block';
    });
    const supSubTabs = supSubPopup.querySelectorAll('.tab-btn');
    supSubTabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        e.stopPropagation();
        const tabType = tab.dataset.tab;
        supSubTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        supSubPopup.querySelectorAll('.symbol-grid').forEach(grid => grid.style.display = 'none');
        supSubPopup.querySelectorAll(`.${tabType}-tab`).forEach(grid => grid.style.display = 'grid');
      });
    });
    const supSubSymbols = supSubPopup.querySelectorAll('.popup-symbol-btn');
    supSubSymbols.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        insertSymbolToInput(btn.dataset.symbol);
      });
    });
  }

  const fractionBtn = document.getElementById('fractionBtn');
  if (fractionBtn) {
    fractionBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      insertSymbolToInput('\\frac{a}{b}');
    });
  }
  const exponentBtn = document.getElementById('exponentBtn');
  if (exponentBtn) {
    exponentBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      insertSymbolToInput('x^{2}');
    });
  }
  const logarithmBtn = document.getElementById('logarithmBtn');
  const logarithmPopup = document.getElementById('logarithmPopup');
  if (logarithmBtn && logarithmPopup) {
    logarithmBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllPopups();
      logarithmPopup.style.display = logarithmPopup.style.display === 'block' ? 'none' : 'block';
    });
    const logarithmSymbols = logarithmPopup.querySelectorAll('.popup-symbol-btn');
    logarithmSymbols.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        insertSymbolToInput(btn.dataset.symbol);
        logarithmPopup.style.display = 'none';
      });
    });
  }
  const radicalBtn = document.getElementById('radicalBtn');
  if (radicalBtn) {
    radicalBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      insertSymbolToInput('\\sqrt[n]{x}');
    });
  }
  const integralBtn = document.getElementById('integralBtn');
  const integralPopup = document.getElementById('integralPopup');
  if (integralBtn && integralPopup) {
    integralBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllPopups();
      integralPopup.style.display = integralPopup.style.display === 'block' ? 'none' : 'block';
    });
    const integralTabs = integralPopup.querySelectorAll('.tab-btn');
    integralTabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        e.stopPropagation();
        const tabType = tab.dataset.tab;
        integralTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        integralPopup.querySelectorAll('.symbol-grid').forEach(grid => grid.style.display = 'none');
        integralPopup.querySelectorAll(`.${tabType}-tab`).forEach(grid => grid.style.display = 'grid');
      });
    });
    const integralSymbols = integralPopup.querySelectorAll('.popup-symbol-btn');
    integralSymbols.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        insertSymbolToInput(btn.dataset.symbol);
      });
    });
  }
  const limitBtn = document.getElementById('limitBtn');
  if (limitBtn) {
    limitBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      insertSymbolToInput('\\lim_{x \\to a} f(x)');
    });
  }
  const matrixBtn = document.getElementById('matrixBtn');
  const matrixPopup = document.getElementById('matrixPopup');
  if (matrixBtn && matrixPopup) {
    const MAX_ROWS = 10, MAX_COLS = 10;
    const table = document.getElementById('matrixGridTable');
    const label = document.getElementById('matrixGridLabel');
    let selectedRows = 1, selectedCols = 1;

    function buildMatrixGrid() {
      table.innerHTML = '';
      for (let r = 0; r < MAX_ROWS; r++) {
        const tr = document.createElement('tr');
        for (let c = 0; c < MAX_COLS; c++) {
          const td = document.createElement('td');
          td.style.cssText = 'width:20px;height:20px;border:1px solid #2c6e7e;cursor:pointer;';
          td.dataset.row = r;
          td.dataset.col = c;
          td.addEventListener('mouseenter', () => {
            selectedRows = r + 1;
            selectedCols = c + 1;
            updateGridHighlight();
          });
          td.addEventListener('click', (e) => {
            e.stopPropagation();
            insertMatrix(selectedRows, selectedCols);
            matrixPopup.style.display = 'none';
          });
          tr.appendChild(td);
        }
        table.appendChild(tr);
      }
    }

    function updateGridHighlight() {
      const cells = table.querySelectorAll('td');
      cells.forEach(cell => {
        const r = parseInt(cell.dataset.row);
        const c = parseInt(cell.dataset.col);
        if (r < selectedRows && c < selectedCols) {
          cell.style.background = '#2c6e7e';
        } else {
          cell.style.background = 'transparent';
        }
      });
      label.textContent = selectedRows + 'x' + selectedCols + ' 矩阵';
    }

    function insertMatrix(rows, cols) {
      let latex = '\\begin{matrix}\n';
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (c > 0) latex += ' & ';
          latex += 'a_{' + (r + 1) + (c + 1) + '}';
        }
        if (r < rows - 1) latex += ' \\\\\n';
      }
      latex += '\n\\end{matrix}';
      insertSymbolToInput(latex);
    }

    buildMatrixGrid();

    matrixBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllPopups();
      matrixPopup.style.display = matrixPopup.style.display === 'block' ? 'none' : 'block';
      if (matrixPopup.style.display === 'block') {
        selectedRows = 1;
        selectedCols = 1;
        updateGridHighlight();
      }
    });
  }
  const bracketBtn = document.getElementById('bracketBtn');
  const bracketPopup = document.getElementById('bracketPopup');
  if (bracketBtn && bracketPopup) {
    bracketBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllPopups();
      bracketPopup.style.display = bracketPopup.style.display === 'block' ? 'none' : 'block';
    });
    const bracketSymbols = bracketPopup.querySelectorAll('.popup-symbol-btn');
    bracketSymbols.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        insertSymbolToInput(btn.dataset.symbol);
        bracketPopup.style.display = 'none';
      });
    });
  }
  const largeOpBtn = document.getElementById('largeOpBtn');
  const largeOpPopup = document.getElementById('largeOpPopup');
  if (largeOpBtn && largeOpPopup) {
    largeOpBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllPopups();
      largeOpPopup.style.display = largeOpPopup.style.display === 'block' ? 'none' : 'block';
    });
    const largeOpTabs = largeOpPopup.querySelectorAll('.tab-btn');
    largeOpTabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        e.stopPropagation();
        const tabType = tab.dataset.tab;
        largeOpTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        largeOpPopup.querySelectorAll('.symbol-grid').forEach(grid => grid.style.display = 'none');
        largeOpPopup.querySelectorAll(`.${tabType}-tab`).forEach(grid => grid.style.display = 'grid');
      });
    });
    const largeOpSymbols = largeOpPopup.querySelectorAll('.popup-symbol-btn');
    largeOpSymbols.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        insertSymbolToInput(btn.dataset.symbol);
        largeOpPopup.style.display = 'none';
      });
    });
  }

  const moreSymbolsBtn = document.getElementById('moreSymbolsBtn');
  const moreSymbolsPopup = document.getElementById('moreSymbolsPopup');
  if (moreSymbolsBtn && moreSymbolsPopup) {
    moreSymbolsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllPopups();
      moreSymbolsPopup.style.display = moreSymbolsPopup.style.display === 'block' ? 'none' : 'block';
    });
    const moreSymbolsTabs = moreSymbolsPopup.querySelectorAll('.tab-btn');
    moreSymbolsTabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        e.stopPropagation();
        const tabType = tab.dataset.tab;
        moreSymbolsTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        moreSymbolsPopup.querySelectorAll('.symbol-grid').forEach(grid => grid.style.display = 'none');
        moreSymbolsPopup.querySelectorAll(`.${tabType}-tab`).forEach(grid => grid.style.display = 'grid');
      });
    });
    const moreSymbolsBtns = moreSymbolsPopup.querySelectorAll('.popup-symbol-btn');
    moreSymbolsBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        insertSymbolToInput(btn.dataset.symbol);
      });
    });
  }

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.symbol-category')) {
      closeAllPopups();
    }
  });

  const insertFormulaBtn = document.getElementById('insertFormulaBtn');
  if (insertFormulaBtn) {
    insertFormulaBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showFormulaEditor();
    });
  }

  const closeFormulaModalBtn = document.getElementById('closeFormulaModalBtn');
  if (closeFormulaModalBtn) {
    closeFormulaModalBtn.addEventListener('click', hideFormulaEditor);
  }

  const cancelFormulaBtn = document.getElementById('cancelFormulaBtn');
  if (cancelFormulaBtn) {
    cancelFormulaBtn.addEventListener('click', hideFormulaEditor);
  }

  const confirmFormulaBtn = document.getElementById('confirmFormulaBtn');
  if (confirmFormulaBtn) {
    confirmFormulaBtn.addEventListener('click', () => {
      const rawLatex = formulaInput.getValue ? formulaInput.getValue('latex') : (formulaInput.value || '');
      const latex = rawLatex ? rawLatex.trim() : '';
      const color = formulaColorPicker ? formulaColorPicker.value : '#000000';
      const currentFontSize = getCurrentFontSize();
      if (!latex) {
        hideFormulaEditor();
        return;
      }
      if (isCKEditorActive()) {
        const editingImg = getEditingFormulaImg();
        if (editingImg) {
          insertFormulaToTiny(latex, color, currentFontSize, editingImg);
          clearEditingFormulaImg();
        } else {
          insertFormulaToTiny(latex, color, currentFontSize);
        }
        hideFormulaEditor();
        return;
      }
    });
  }

}