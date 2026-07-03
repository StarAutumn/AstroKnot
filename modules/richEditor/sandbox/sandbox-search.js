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
      // 跳过二进制/非文本文件（简单判断）
      if (file.language === 'plaintext' && /\.(png|jpg|jpeg|gif|svg|ico|woff|ttf|mp3|mp4)$/i.test(filePath)) {
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
            matchText: match[0]
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
        const escapedLine = _escapeHtml(m.text).replace(
          _escapeHtml(m.matchText),
          '<span class="match">' + _escapeHtml(m.matchText) + '</span>'
        );
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
      if (file.language === 'plaintext' && /\.(png|jpg|jpeg|gif|svg|ico|woff|ttf|mp3|mp4)$/i.test(filePath)) {
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
  return String(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

console.log('[sandbox-search] 模块已加载');
