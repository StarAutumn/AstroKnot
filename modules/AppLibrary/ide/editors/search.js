// ============================================================
//  sandbox-search.js — 全局文件搜索组件
//  跨文件内容搜索 + 替换，结果显示为文件:行号:匹配
// ============================================================

export class SandboxSearch {
  /**
   * @param {HTMLElement} panelEl - 搜索面板容器
   * @param {Function} getVFS - 获取 VFS 实例的函数
   * @param {Function} openFile - 打开文件回调 (filePath, line, col)
   */
  constructor(panelEl, getVFS, openFile) {
    this._panel = panelEl;
    this._getVFS = getVFS;
    this._openFile = openFile || function () {};
    this._results = [];
    this._debounceTimer = null;
    this._init();
  }

  _init() {
    this._searchInput = this._panel.querySelector('#sandboxSearchInput');
    this._replaceInput = this._panel.querySelector('#sandboxReplaceInput');
    this._replaceRow = this._panel.querySelector('#searchReplaceRow');
    this._resultsEl = this._panel.querySelector('#sandboxSearchResults');
    this._summaryEl = this._panel.querySelector('#searchSummary');
    this._caseSensitive = this._panel.querySelector('#searchCaseSensitive');
    this._regex = this._panel.querySelector('#searchRegex');
    this._wholeWord = this._panel.querySelector('#searchWholeWord');
    this._toggleReplaceBtn = this._panel.querySelector('#searchToggleReplaceBtn');
    this._closeBtn = this._panel.querySelector('#searchCloseBtn');
    this._replaceAllBtn = this._panel.querySelector('#searchReplaceAllBtn');

    // 搜索输入（防抖）
    this._searchInput.addEventListener('input', () => {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = setTimeout(() => this._doSearch(), 250);
    });

    // 选项变更
    [this._caseSensitive, this._regex, this._wholeWord].forEach(el => {
      el.addEventListener('change', () => this._doSearch());
    });

    // 切换替换模式
    this._toggleReplaceBtn.addEventListener('click', () => {
      const isShown = this._replaceRow.style.display !== 'none';
      this._replaceRow.style.display = isShown ? 'none' : 'flex';
      if (!isShown) this._replaceInput.focus();
    });

    // 关闭
    this._closeBtn.addEventListener('click', () => this.hide());

    // 全部替换
    this._replaceAllBtn.addEventListener('click', () => this._replaceAll());

    // 回车搜索
    this._searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        clearTimeout(this._debounceTimer);
        this._doSearch();
      } else if (e.key === 'Escape') {
        this.hide();
      }
    });

    // 结果点击
    this._resultsEl.addEventListener('click', (e) => {
      const line = e.target.closest('.search-result-line');
      if (line) {
        const filePath = line.dataset.path;
        const lineNum = parseInt(line.dataset.line, 10);
        const col = parseInt(line.dataset.col, 10);
        this._openFile(filePath, lineNum, col);
      }
    });
  }

  show() {
    this._panel.style.display = 'flex';
    setTimeout(() => this._searchInput.focus(), 50);
  }

  hide() {
    this._panel.style.display = 'none';
  }

  isVisible() {
    return this._panel.style.display !== 'none';
  }

  toggle() {
    if (this.isVisible()) this.hide();
    else this.show();
  }

  _buildRegex(query) {
    if (!query) return null;
    let pattern;
    if (this._regex.checked) {
      pattern = query;
    } else if (this._wholeWord.checked) {
      pattern = '\\b' + query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b';
    } else {
      pattern = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    const flags = this._caseSensitive.checked ? 'g' : 'gi';
    try {
      return new RegExp(pattern, flags);
    } catch (e) {
      return null;
    }
  }

  _doSearch() {
    const query = this._searchInput.value;
    const vfs = this._getVFS();
    this._results = [];

    if (!query || !vfs) {
      this._renderResults();
      return;
    }

    const regex = this._buildRegex(query);
    if (!regex) {
      this._summaryEl.textContent = '正则表达式无效';
      this._resultsEl.innerHTML = '';
      return;
    }

    let totalMatches = 0;

    for (const [filePath, file] of vfs.getAllFiles()) {
      // 跳过二进制/非文本文件（按扩展名判断，不依赖 language）
      if (/\.(png|jpg|jpeg|gif|ico|woff|woff2|ttf|eot|mp3|mp4|wav|avi|zip|tar|gz)$/i.test(filePath)) {
        continue;
      }

      const content = file.content || '';
      const lines = content.split('\n');
      const fileMatches = [];

      for (let i = 0; i < lines.length; i++) {
        regex.lastIndex = 0;
        let match;
        while ((match = regex.exec(lines[i])) !== null) {
          fileMatches.push({
            line: i + 1,
            col: match.index + 1,
            text: lines[i],
            matchText: match[0],
            matchIndex: match.index  // 保留精确位置，避免 replace 误高亮
          });
          totalMatches++;
          // 防止零宽匹配死循环
          if (match.index === regex.lastIndex) regex.lastIndex++;
        }
      }

      if (fileMatches.length > 0) {
        this._results.push({ filePath, fileName: file.name, matches: fileMatches });
      }
    }

    this._summaryEl.textContent = `${totalMatches} 个结果 · ${this._results.length} 个文件`;
    this._renderResults();
  }

  _renderResults() {
    if (this._results.length === 0) {
      this._resultsEl.innerHTML = '<div class="search-empty">无匹配结果</div>';
      return;
    }

    let html = '';
    for (const fileResult of this._results) {
      html += `<div class="search-result-file">${_escapeHtml(fileResult.fileName)} <span style="color:#557">(${fileResult.matches.length})</span></div>`;
      for (const m of fileResult.matches) {
        // 精确高亮：使用 matchIndex 定位，避免同一行多次出现时高亮错误位置
        const escapedLine = _highlightMatch(_escapeHtml(m.text), m.matchIndex, m.matchText.length);
        html += `<div class="search-result-line" data-path="${_escapeAttr(fileResult.filePath)}" data-line="${m.line}" data-col="${m.col}">` +
                `<span class="line-num">${m.line}</span>${escapedLine}</div>`;
      }
    }
    this._resultsEl.innerHTML = html;
  }

  _replaceAll() {
    const query = this._searchInput.value;
    const replaceText = this._replaceInput.value;
    const vfs = this._getVFS();

    if (!query || !vfs) return;

    const regex = this._buildRegex(query);
    if (!regex) return;

    let replacedFiles = 0;
    let replacedCount = 0;

    for (const [filePath, file] of vfs.getAllFiles()) {
      if (/\.(png|jpg|jpeg|gif|ico|woff|woff2|ttf|eot|mp3|mp4|wav|avi|zip|tar|gz)$/i.test(filePath)) {
        continue;
      }
      const content = file.content || '';
      regex.lastIndex = 0;
      const newContent = content.replace(regex, () => {
        replacedCount++;
        return replaceText;
      });
      if (newContent !== content) {
        vfs.setFile(filePath, newContent);
        replacedFiles++;
      }
    }

    // 触发重新搜索
    this._doSearch();
    return { replacedFiles, replacedCount };
  }
}

function _escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function _escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * 在已 HTML 转义的行文本中，按原始字符偏移精确高亮匹配
 * 由于 _escapeHtml 可能改变了字符偏移（如 & → &amp;），需要重新计算
 * @param {string} escapedLine - 已 HTML 转义的行文本
 * @param {number} rawIndex - 原始文本中的匹配起始位置
 * @param {number} rawLength - 原始文本中的匹配长度
 * @returns {string} 含高亮 <span> 的 HTML
 */
function _highlightMatch(escapedLine, rawIndex, rawLength) {
  // 将转义后的文本映射回原始位置：遍历 escapedLine，跟踪原始偏移
  let rawPos = 0;
  let escPos = 0;
  const result = [];

  while (escPos < escapedLine.length && rawPos < rawIndex) {
    if (escapedLine[escPos] === '&') {
      // HTML 实体：跳过整个实体（如 &amp; &lt; &gt; &#39; &quot;）
      const semiIdx = escapedLine.indexOf(';', escPos);
      if (semiIdx >= 0) {
        result.push(escapedLine.substring(escPos, semiIdx + 1));
        escPos = semiIdx + 1;
      } else {
        result.push(escapedLine[escPos]);
        escPos++;
      }
      rawPos++;
    } else {
      result.push(escapedLine[escPos]);
      escPos++;
      rawPos++;
    }
  }

  // rawPos === rawIndex：提取匹配部分
  let matchEsc = '';
  let matchRawLen = 0;
  while (escPos < escapedLine.length && matchRawLen < rawLength) {
    if (escapedLine[escPos] === '&') {
      const semiIdx = escapedLine.indexOf(';', escPos);
      if (semiIdx >= 0) {
        matchEsc += escapedLine.substring(escPos, semiIdx + 1);
        escPos = semiIdx + 1;
      } else {
        matchEsc += escapedLine[escPos];
        escPos++;
      }
      matchRawLen++;
    } else {
      matchEsc += escapedLine[escPos];
      escPos++;
      matchRawLen++;
    }
  }

  // 拼装结果
  return result.join('') + '<span class="match">' + matchEsc + '</span>' + escapedLine.substring(escPos);
}

console.log('[sandbox-search] 模块已加载');
