import { ckContainer } from '../dom-refs.js';
import { state } from '../shared-state.js';

export function addLineNumbersToPreBlocks(editor) {
  if (!editor) return;
  let body = editor.getBody();
  if (!body) return;
  let pres = body.querySelectorAll('pre:not(.tmce-has-lines)');
  pres.forEach(function (pre) {
    if (pre.closest('.tmce-code-wrapper')) return;
    let code = pre.querySelector('code');
    let textSource = code || pre;
    let rawText = textSource.textContent || '';
    let lines = rawText.split('\n');
    let lineNumbersHtml = lines.map(function (_, i) {
      return '<span>' + (i + 1) + '</span>';
    }).join('');

    let wrapper = document.createElement('div');
    wrapper.className = 'tmce-code-wrapper';
    wrapper.setAttribute('contenteditable', 'false');

    pre.setAttribute('contenteditable', 'false');

    let lineDiv = document.createElement('div');
    lineDiv.className = 'tmce-line-numbers';
    lineDiv.setAttribute('contenteditable', 'false');
    lineDiv.innerHTML = lineNumbersHtml;

    let codeArea = document.createElement('div');
    codeArea.className = 'tmce-code-area';

    pre.classList.add('tmce-has-lines');
    pre.parentNode.insertBefore(wrapper, pre);
    wrapper.appendChild(lineDiv);
    codeArea.appendChild(pre);
    wrapper.appendChild(codeArea);

    if (code && window.hljs) {
      code.classList.add('hljs');
      code.removeAttribute('data-highlighted');
      hljs.highlightElement(code);
    }
  });
}

export function syncLineNumbersDebounced(editor) {
  if (state._tmceLineNumTimer) clearTimeout(state._tmceLineNumTimer);
  state._tmceLineNumTimer = setTimeout(function () {
    addLineNumbersToPreBlocks(editor);
  }, 100);
}

export function stripLineNumbersFromHTML(html) {
  if (!html) return html;
  let div = document.createElement('div');
  div.innerHTML = html;
  let wrappers = div.querySelectorAll('.tmce-code-wrapper');
  wrappers.forEach(function (wrapper) {
    let pre = wrapper.querySelector('pre.tmce-has-lines');
    if (pre) {
      pre.classList.remove('tmce-has-lines');
      wrapper.parentNode.insertBefore(pre, wrapper);
      wrapper.remove();
    }
  });
  return div.innerHTML;
}

export function showTinyUI() {
  ckContainer.style.cssText = 'position: static; display: flex; visibility: visible; height: 100%;';

  // TinyMCE inline mode 需要编辑器 body 元素可见才能接收输入
  const editorBody = document.getElementById('tinymce-editor-textarea');
  if (editorBody) {
    editorBody.style.display = '';
  }

  const editArea = document.querySelector('.edit-area-wrapper');
  if (editArea) editArea.classList.add('tinymce-mode');

  if (state.tinyEditor) {
    requestAnimationFrame(function () {
      state.tinyEditor.fire('ResizeEditor');
    });
  }
}

// ── Monaco Editor 单例 ──
let monacoReady = false;
let monacoLoading = false;
let monacoCallbacks = [];

function ensureMonaco(cb) {
  if (monacoReady) { cb(); return; }
  monacoCallbacks.push(cb);
  if (monacoLoading) return;
  monacoLoading = true;

  // 优先使用已加载的 AMD loader（window.require）
  var _require = window.require;
  if (_require && _require.config) {
    doLoadViaAMD(_require);
    return;
  }

  // AMD loader 未就绪，动态注入 loader 脚本
  var script = document.createElement('script');
  script.src = 'lib/monaco/vs/loader.js';
  script.onload = function () {
    var req = window.require;
    if (req && req.config) {
      doLoadViaAMD(req);
    } else {
      console.error('[Monaco] AMD loader 加载失败');
      monacoLoading = false;
    }
  };
  script.onerror = function () {
    console.error('[Monaco] loader 脚本加载失败');
    monacoLoading = false;
  };
  document.head.appendChild(script);
}

function doLoadViaAMD(_require) {
  // 计算 vs 目录的绝对 URL，供 Worker 使用
  var vsPath = 'lib/monaco/vs';
  // 将相对路径转为绝对 URL
  var vsUrl = new URL(vsPath, window.location.href).href.replace(/\/$/, '');

  _require.config({
    paths: { vs: vsPath }
  });

  // 配置 Worker 环境——Worker 内部无法解析相对路径，必须用绝对 URL
  // baseUrl 指向 vs 的父目录，因为 workerMain.js 内部会用 vs/... 前缀加载模块
  var monacoBaseUrl = new URL('lib/monaco/', window.location.href).href.replace(/\/$/, '');
  window.MonacoEnvironment = {
    getWorkerUrl: function (workerId, label) {
      return 'data:text/javascript;charset=utf-8,' + encodeURIComponent(
        'self.MonacoEnvironment = { baseUrl: "' + monacoBaseUrl + '" };' +
        'importScripts("' + vsUrl + '/base/worker/workerMain.js");'
      );
    }
  };

  _require(['vs/editor/editor.main'], function () {
    // 注册自定义深色主题
    monaco.editor.defineTheme('astroknot-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '5a7a8a', fontStyle: 'italic' },
        { token: 'keyword', foreground: '00e5ff' },
        { token: 'string', foreground: 'ffd93d' },
        { token: 'number', foreground: 'ff6b9d' },
        { token: 'type', foreground: '6bff6b' },
      ],
      colors: {
        'editor.background': '#0d1b23',
        'editor.foreground': '#c8e6ff',
        'editor.lineHighlightBackground': '#112833',
        'editor.selectionBackground': '#1a4a5a',
        'editorCursor.foreground': '#00e5ff',
        'editorLineNumber.foreground': '#3a5a6a',
        'editorLineNumber.activeForeground': '#00e5ff',
        'editor.inactiveSelectionBackground': '#0f2a36',
        'editorIndentGuide.background': '#1a2a34',
        'editorIndentGuide.activeBackground': '#2a3a44',
        'editorBracketMatch.background': '#1a4a5a',
        'editorBracketMatch.border': '#00e5ff',
      }
    });
    monacoReady = true;
    monacoCallbacks.forEach(function (fn) { fn(); });
    monacoCallbacks = [];
  });
}

// 语言映射：代码块语言 → Monaco 语言 ID
function toMonacoLang(lang) {
  var map = {
    'javascript': 'javascript',
    'typescript': 'typescript',
    'markup': 'html',
    'html': 'html',
    'css': 'css',
    'less': 'less',
    'scss': 'scss',
    'python': 'python',
    'java': 'java',
    'c': 'c',
    'cpp': 'cpp',
    'csharp': 'csharp',
    'sql': 'sql',
    'json': 'json',
    'xml': 'xml',
    'bash': 'shell',
    'shell': 'shell',
    'php': 'php',
    'ruby': 'ruby',
    'go': 'go',
    'rust': 'rust',
    'yaml': 'yaml',
    'markdown': 'markdown',
    'text': 'plaintext',
    'plaintext': 'plaintext',
    'lua': 'lua',
    'dart': 'dart',
    'kotlin': 'kotlin',
    'swift': 'swift',
    'r': 'r',
    'graphql': 'graphql',
    'dockerfile': 'dockerfile',
  };
  return map[lang] || 'plaintext';
}

export function openTinyMceCodeEditor(editor, initialLang, initialCode, replaceTarget, onComplete) {
  let languages = [
    { text: 'JavaScript', value: 'javascript' },
    { text: 'TypeScript', value: 'typescript' },
    { text: 'HTML', value: 'markup' },
    { text: 'CSS', value: 'css' },
    { text: 'Python', value: 'python' },
    { text: 'Java', value: 'java' },
    { text: 'C', value: 'c' },
    { text: 'C++', value: 'cpp' },
    { text: 'C#', value: 'csharp' },
    { text: 'SQL', value: 'sql' },
    { text: 'JSON', value: 'json' },
    { text: 'XML', value: 'xml' },
    { text: 'Bash', value: 'bash' },
    { text: 'PHP', value: 'php' },
    { text: 'Ruby', value: 'ruby' },
    { text: 'Go', value: 'go' },
    { text: 'Rust', value: 'rust' },
    { text: 'YAML', value: 'yaml' },
    { text: 'Markdown', value: 'markdown' },
    { text: '纯文本', value: 'text' }
  ];

  // 代码片段模板
  let snippets = [
    { text: '函数', lang: 'javascript', code: 'function name(params) {\n  \n}' },
    { text: '箭头函数', lang: 'javascript', code: 'const name = (params) => {\n  \n};' },
    { text: '类', lang: 'javascript', code: 'class ClassName {\n  constructor() {\n    \n  }\n\n  method() {\n    \n  }\n}' },
    { text: 'Promise', lang: 'javascript', code: 'new Promise((resolve, reject) => {\n  \n})' },
    { text: 'async/await', lang: 'javascript', code: 'async function name() {\n  try {\n    const result = await promise;\n  } catch (error) {\n    console.error(error);\n  }\n}' },
    { text: 'fetch', lang: 'javascript', code: 'const response = await fetch(url);\nconst data = await response.json();' },
    { text: 'for 循环', lang: 'javascript', code: 'for (let i = 0; i < array.length; i++) {\n  \n}' },
    { text: 'HTML5', lang: 'markup', code: '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>Title</title>\n</head>\n<body>\n  \n</body>\n</html>' },
    { text: 'CSS Grid', lang: 'css', code: '.container {\n  display: grid;\n  grid-template-columns: repeat(3, 1fr);\n  gap: 16px;\n}' },
    { text: 'Flexbox', lang: 'css', code: '.container {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 16px;\n}' },
    { text: 'def 函数', lang: 'python', code: 'def name(params):\n    ' },
    { text: 'if __name__', lang: 'python', code: 'if __name__ == "__main__":\n    ' },
  ];

  function escapeHTML(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  let isEditing = !!replaceTarget;
  let titleText = isEditing ? '编辑代码块' : '插入代码块';
  let submitText = isEditing ? '确定' : '插入';

  function getCodeBlockLang(wrapper) {
    let pre = wrapper.querySelector('pre');
    if (!pre) return 'javascript';
    let match = pre.className.match(/language-(\w+)/);
    return match ? match[1] : 'javascript';
  }

  let dialogInitialLang = initialLang;
  if (!dialogInitialLang && replaceTarget) {
    dialogInitialLang = getCodeBlockLang(replaceTarget);
  }
  if (!dialogInitialLang) dialogInitialLang = 'javascript';

  let ed = editor || state.tinyEditor;

  // ── 创建自定义弹窗 ──
  let overlay = document.createElement('div');
  overlay.className = 'monaco-code-overlay';
  overlay.innerHTML =
    '<div class="monaco-code-dialog">' +
      '<div class="monaco-code-header">' +
        '<span class="monaco-code-title">' + titleText + '</span>' +
        '<div class="monaco-code-lang-row">' +
          '<label for="monaco-code-lang-select">语言</label>' +
          '<select id="monaco-code-lang-select">' +
            languages.map(function (l) {
              return '<option value="' + l.value + '"' + (l.value === dialogInitialLang ? ' selected' : '') + '>' + l.text + '</option>';
            }).join('') +
          '</select>' +
        '</div>' +
        '<div class="monaco-code-header-actions">' +
          '<button class="monaco-code-btn monaco-code-btn-ghost" id="monaco-code-cancel">取消</button>' +
          '<button class="monaco-code-btn monaco-code-btn-primary" id="monaco-code-submit">' + submitText + '</button>' +
        '</div>' +
      '</div>' +
      // ── 工具栏 ──
      '<div class="monaco-code-toolbar">' +
        '<div class="monaco-code-toolbar-group">' +
          '<button class="monaco-tool-btn" id="monaco-btn-format" title="格式化代码 (Shift+Alt+F)">&#9654; 格式化</button>' +
          '<button class="monaco-tool-btn" id="monaco-btn-find" title="查找替换 (Ctrl+H)">&#128269; 查找替换</button>' +
          '<button class="monaco-tool-btn" id="monaco-btn-copy" title="复制全部代码">&#128203; 复制全部</button>' +
        '</div>' +
        '<div class="monaco-code-toolbar-sep"></div>' +
        '<div class="monaco-code-toolbar-group">' +
          '<button class="monaco-tool-btn" id="monaco-btn-font-dec" title="缩小字体">A-</button>' +
          '<span class="monaco-tool-label" id="monaco-font-size">14px</span>' +
          '<button class="monaco-tool-btn" id="monaco-btn-font-inc" title="放大字体">A+</button>' +
        '</div>' +
        '<div class="monaco-code-toolbar-sep"></div>' +
        '<div class="monaco-code-toolbar-group">' +
          '<button class="monaco-tool-btn" id="monaco-btn-wrap" title="自动换行">&#8626; 换行</button>' +
          '<select class="monaco-tool-select" id="monaco-sel-tab" title="缩进大小">' +
            '<option value="2">2 空格</option>' +
            '<option value="4" selected>4 空格</option>' +
            '<option value="tab">Tab</option>' +
          '</select>' +
          '<button class="monaco-tool-btn" id="monaco-btn-minimap" title="缩略图">&#9638; 缩略图</button>' +
        '</div>' +
        '<div class="monaco-code-toolbar-sep"></div>' +
        '<div class="monaco-code-toolbar-group">' +
          '<select class="monaco-tool-select" id="monaco-sel-snippet" title="插入代码片段">' +
            '<option value="">插入片段...</option>' +
            snippets.map(function (s, i) {
              return '<option value="' + i + '">' + s.text + ' (' + s.lang + ')</option>';
            }).join('') +
          '</select>' +
        '</div>' +
        '<div class="monaco-code-toolbar-sep"></div>' +
        '<div class="monaco-code-toolbar-group">' +
          '<button class="monaco-tool-btn" id="monaco-btn-fullscreen" title="全屏 (F11)">&#9974; 全屏</button>' +
        '</div>' +
      '</div>' +
      '<div class="monaco-code-body" id="monaco-code-container"></div>' +
      '<div class="monaco-code-footer">' +
        '<span id="monaco-code-status">就绪</span>' +
        '<span id="monaco-code-info"></span>' +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);

  let container = overlay.querySelector('#monaco-code-container');
  let langSelect = overlay.querySelector('#monaco-code-lang-select');
  let cancelBtn = overlay.querySelector('#monaco-code-cancel');
  let submitBtn = overlay.querySelector('#monaco-code-submit');
  let statusEl = overlay.querySelector('#monaco-code-status');
  let infoEl = overlay.querySelector('#monaco-code-info');
  let dialog = overlay.querySelector('.monaco-code-dialog');
  let monacoEditor = null;
  let currentFontSize = 14;
  let isFullscreen = false;
  let isWordWrap = true;
  let isMinimap = true;

  function closeDialog() {
    if (isFullscreen) toggleFullscreen();
    if (monacoEditor) {
      monacoEditor.dispose();
      monacoEditor = null;
    }
    if (overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
  }

  function doSubmit() {
    if (!monacoEditor) return;
    let code = monacoEditor.getValue();
    if (!code.trim()) { closeDialog(); return; }
    let newLang = langSelect.value || 'javascript';

    if (onComplete) {
      onComplete(newLang, code);
      closeDialog();
      return;
    }

    if (replaceTarget && state.tinyEditor) {
      let parent = replaceTarget.parentNode;
      let next = replaceTarget.nextSibling;
      state.tinyEditor.dom.remove(replaceTarget);
      if (next) {
        state.tinyEditor.selection.setCursorLocation(next, 0);
      } else if (parent) {
        state.tinyEditor.selection.setCursorLocation(parent, parent.childNodes.length);
      }
    }

    ed.insertContent('<pre class="language-' + newLang + '"><code>' + escapeHTML(code) + '</code></pre>');
    closeDialog();
  }

  function toggleFullscreen() {
    isFullscreen = !isFullscreen;
    if (isFullscreen) {
      dialog.style.width = '100vw';
      dialog.style.maxWidth = '100vw';
      dialog.style.height = '100vh';
      dialog.style.maxHeight = '100vh';
      dialog.style.borderRadius = '0';
    } else {
      dialog.style.width = '';
      dialog.style.maxWidth = '';
      dialog.style.height = '';
      dialog.style.maxHeight = '';
      dialog.style.borderRadius = '';
    }
    if (monacoEditor) monacoEditor.layout();
  }

  function formatCode() {
    if (!monacoEditor) return;
    monacoEditor.getAction('editor.action.formatDocument').run();
    statusEl.textContent = '已格式化';
    setTimeout(function () { statusEl.textContent = 'Monaco Editor'; }, 1500);
  }

  function showFindReplace() {
    if (!monacoEditor) return;
    monacoEditor.getAction('editor.action.startFindReplaceAction').run();
  }

  function copyAll() {
    if (!monacoEditor) return;
    let code = monacoEditor.getValue();
    navigator.clipboard.writeText(code).then(function () {
      statusEl.textContent = '已复制到剪贴板';
      setTimeout(function () { statusEl.textContent = 'Monaco Editor'; }, 1500);
    });
  }

  function changeFontSize(delta) {
    currentFontSize = Math.max(10, Math.min(28, currentFontSize + delta));
    if (monacoEditor) {
      monacoEditor.updateOptions({ fontSize: currentFontSize });
    }
    overlay.querySelector('#monaco-font-size').textContent = currentFontSize + 'px';
  }

  function toggleWordWrap() {
    isWordWrap = !isWordWrap;
    if (monacoEditor) {
      monacoEditor.updateOptions({ wordWrap: isWordWrap ? 'on' : 'off' });
    }
    let btn = overlay.querySelector('#monaco-btn-wrap');
    btn.style.color = isWordWrap ? '#00e5ff' : '#5a7a8a';
  }

  function changeTabSize(val) {
    if (!monacoEditor) return;
    if (val === 'tab') {
      monacoEditor.getModel().updateOptions({ tabSize: 4, insertSpaces: false });
    } else {
      monacoEditor.getModel().updateOptions({ tabSize: parseInt(val), insertSpaces: true });
    }
  }

  function toggleMinimap() {
    isMinimap = !isMinimap;
    if (monacoEditor) {
      monacoEditor.updateOptions({ minimap: { enabled: isMinimap } });
    }
    let btn = overlay.querySelector('#monaco-btn-minimap');
    btn.style.color = isMinimap ? '#00e5ff' : '#5a7a8a';
  }

  function insertSnippet(idx) {
    if (!monacoEditor || idx === '') return;
    let snip = snippets[parseInt(idx)];
    if (!snip) return;
    let pos = monacoEditor.getPosition();
    monacoEditor.executeEdits('snippet', [{
      range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column),
      text: snip.code,
      forceMoveMarkers: true
    }]);
    monacoEditor.focus();
    // 重置选择框
    overlay.querySelector('#monaco-sel-snippet').value = '';
  }

  // 绑定工具栏事件
  cancelBtn.addEventListener('click', closeDialog);
  submitBtn.addEventListener('click', doSubmit);
  overlay.querySelector('#monaco-btn-format').addEventListener('click', formatCode);
  overlay.querySelector('#monaco-btn-find').addEventListener('click', showFindReplace);
  overlay.querySelector('#monaco-btn-copy').addEventListener('click', copyAll);
  overlay.querySelector('#monaco-btn-font-dec').addEventListener('click', function () { changeFontSize(-1); });
  overlay.querySelector('#monaco-btn-font-inc').addEventListener('click', function () { changeFontSize(1); });
  overlay.querySelector('#monaco-btn-wrap').addEventListener('click', toggleWordWrap);
  overlay.querySelector('#monaco-sel-tab').addEventListener('change', function () { changeTabSize(this.value); });
  overlay.querySelector('#monaco-btn-minimap').addEventListener('click', toggleMinimap);
  overlay.querySelector('#monaco-sel-snippet').addEventListener('change', function () { insertSnippet(this.value); });
  overlay.querySelector('#monaco-btn-fullscreen').addEventListener('click', toggleFullscreen);

  // ESC 关闭
  function onKeyDown(e) {
    if (e.key === 'Escape' && !isFullscreen) { closeDialog(); e.preventDefault(); }
    if (e.key === 'F11') { toggleFullscreen(); e.preventDefault(); }
    // Ctrl/Cmd+Enter 提交
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { doSubmit(); e.preventDefault(); }
  }
  overlay.addEventListener('keydown', onKeyDown);

  // 点击遮罩关闭
  overlay.addEventListener('mousedown', function (e) {
    if (e.target === overlay) closeDialog();
  });

  // 切换语言时更新 Monaco 模型语言
  langSelect.addEventListener('change', function () {
    if (!monacoEditor) return;
    let model = monacoEditor.getModel();
    if (model) {
      monaco.editor.setModelLanguage(model, toMonacoLang(langSelect.value));
    }
    monacoEditor.focus();
  });

  // 确保 Monaco 加载后创建编辑器
  ensureMonaco(function () {
    monacoEditor = monaco.editor.create(container, {
      value: initialCode || '',
      language: toMonacoLang(dialogInitialLang),
      theme: 'astroknot-dark',
      automaticLayout: true,
      minimap: { enabled: true, scale: 2 },
      fontSize: currentFontSize,
      lineHeight: 22,
      tabSize: 4,
      insertSpaces: true,
      wordWrap: 'on',
      scrollBeyondLastLine: false,
      roundedSelection: true,
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      smoothScrolling: true,
      bracketPairColorization: { enabled: true },
      guides: { bracketPairs: true, indentation: true },
      padding: { top: 12, bottom: 12 },
      renderWhitespace: 'selection',
      formatOnPaste: true,
      formatOnType: true,
      suggest: {
        showKeywords: true,
        showSnippets: true,
      },
      scrollbar: {
        verticalScrollbarSize: 10,
        horizontalScrollbarSize: 10,
      },
      overviewRulerBorder: false,
      hideCursorInOverviewRuler: true,
      // 额外功能
      autoIndent: 'full',
      autoClosingBrackets: 'always',
      autoClosingQuotes: 'always',
      autoClosingDelete: 'always',
      autoSurround: 'languageDefined',
      codeLens: true,
      colorDecorators: true,
      contextmenu: true,
      copyWithSyntaxHighlighting: true,
      dragAndDrop: true,
      emptySelectionClipboard: false,
      folding: true,
      foldingStrategy: 'auto',
      foldingImportsByDefault: false,
      links: true,
      multiCursorModifier: 'alt',
      occurrencesHighlight: 'singleFile',
      renderLineHighlight: 'all',
      selectionHighlight: true,
      showFoldingControls: 'mouseover',
      showUnused: true,
      snippetSuggestions: 'inline',
      stickyScroll: { enabled: true },
      unicodeHighlight: {
        ambiguousCharacters: true,
        invisibleCharacters: true,
      },
      wordBasedSuggestions: 'currentDocument',
    });

    // 状态栏更新
    function updateStatus() {
      if (!monacoEditor) return;
      let model = monacoEditor.getModel();
      let lineCount = model.getLineCount();
      let pos = monacoEditor.getPosition();
      let sel = monacoEditor.getSelection();
      let selText = monacoEditor.getModel().getValueInRange(sel);
      let info = '行 ' + pos.lineNumber + ', 列 ' + pos.column + ' | ' + lineCount + ' 行';
      if (selText.length > 0) {
        let lines = selText.split('\n').length;
        info += ' | 已选 ' + selText.length + ' 字符' + (lines > 1 ? ', ' + lines + ' 行' : '');
      }
      infoEl.textContent = info;
    }
    monacoEditor.onDidChangeCursorPosition(updateStatus);
    monacoEditor.onDidChangeCursorSelection(updateStatus);
    updateStatus();
    statusEl.textContent = 'Monaco Editor';

    // 初始化工具栏按钮状态
    overlay.querySelector('#monaco-btn-wrap').style.color = '#00e5ff';
    overlay.querySelector('#monaco-btn-minimap').style.color = '#00e5ff';

    monacoEditor.focus();

    // Ctrl+Enter 提交（Monaco 内部快捷键）
    monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, doSubmit);
    // Shift+Alt+F 格式化
    monacoEditor.addCommand(monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF, formatCode);
  });
}