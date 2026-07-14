// ============================================================
//  browser/browser-node-clip.js — 网页内容抓取为 AstroKnot 知识节点
//  功能 22：网页转节点（文本/图片/链接/整页）
//  功能 23：Markdown 网页剪藏（HTML → Markdown → 节点树）
// ============================================================
//  注意：编辑器读取 node.richContent（HTML）来显示内容，
//  node.desc 仅用于 3D 场景标签/提示。因此必须设置 richContent。

import { appState } from '../../module0_AppState.js';
import { saveCurrentProjectData } from '../../module2_TreeData.js';

/**
 * 取当前场景中选中的节点 ID 作为父节点（若有），否则返回 null（创建根节点）
 */
function _getParentId() {
  try {
    if (appState && appState.selectedNodeIds && appState.selectedNodeIds.size > 0) {
      return Array.from(appState.selectedNodeIds)[0];
    }
  } catch (_) {}
  return null;
}

/**
 * 调用场景 API 创建节点
 */
function _createNode(opts) {
  try {
    if (typeof window.createNodeInProject !== 'function') {
      console.warn('[browser-node-clip] window.createNodeInProject 不可用');
      return null;
    }
    var node = window.createNodeInProject(opts);
    return node;
  } catch (e) {
    console.error('[browser-node-clip] 创建节点失败:', e);
    return null;
  }
}

/**
 * 在 webview 中执行 JS 并返回结果
 */
function _exec(webview, script) {
  return new Promise((resolve) => {
    try {
      webview.executeJavaScript(script, true).then(resolve).catch((e) => {
        console.warn('[browser-node-clip] executeJavaScript 失败:', e);
        resolve(null);
      });
    } catch (e) {
      console.warn('[browser-node-clip] executeJavaScript 异常:', e);
      resolve(null);
    }
  });
}

async function _getPageUrl(webview) {
  const url = await _exec(webview, 'location.href');
  return url || '';
}

function _notify(node, msg) {
  console.log('[browser-node-clip]', msg);
  try {
    window.dispatchEvent(new CustomEvent('astroknot-browser-clip', { detail: { node, message: msg } }));
  } catch (_) {}
}

/**
 * 将 HTML 内容写入节点的 richContent 并持久化
 * - 更新内存中的 node.richContent / node.content
 * - 更新 nodeMap 中的对应节点
 * - 调用 saveCurrentProjectData 保存项目 JSON
 * - 若项目已保存到磁盘，调用 writeNodeContent 写入 content.html
 */
function _saveNodeContent(node, htmlContent) {
  if (!node) return;
  try {
    node.richContent = htmlContent;
    node.content = htmlContent;
    // 同步到 nodeMap（node 可能是 tree 中的对象，nodeMap 中可能是同一引用）
    if (appState && appState.nodeMap) {
      const n = appState.nodeMap.get(node.id);
      if (n) {
        n.richContent = htmlContent;
        n.content = htmlContent;
      }
    }
    // 保存项目数据（内存 + JSON 文件）
    saveCurrentProjectData();
    // 写入磁盘 content.html（仅已保存项目）
    _writeNodeContentToDisk(node, htmlContent);
  } catch (e) {
    console.error('[browser-node-clip] 保存节点内容失败:', e);
  }
}

/**
 * 将内容写入磁盘 nodes/{nodeId}/content.html
 */
async function _writeNodeContentToDisk(node, htmlContent) {
  try {
    if (!window.api || typeof window.api.writeNodeContent !== 'function') return;
    if (!appState) return;
    const proj = appState.projects ? appState.projects.find(function (p) { return p.id === appState.currentProjectId; }) : null;
    const folderPath = proj ? proj.folderPath : null;
    if (!folderPath) return; // 未保存项目，跳过磁盘写入
    await window.api.writeNodeContent(folderPath, node, htmlContent);
  } catch (e) {
    console.warn('[browser-node-clip] 磁盘写入失败:', e);
  }
}

/**
 * 将沙盒文件系统同步到磁盘（Web 项目节点）
 */
async function _syncSandboxToDisk(node) {
  try {
    if (!window.api || typeof window.api.syncSandboxDirectory !== 'function') return;
    if (!appState || !node.fileSystem) return;
    const proj = appState.projects ? appState.projects.find(function (p) { return p.id === appState.currentProjectId; }) : null;
    const folderPath = proj ? proj.folderPath : null;
    if (!folderPath) return;
    await window.api.syncSandboxDirectory(folderPath, node, node.fileSystem);
  } catch (e) {
    console.warn('[browser-node-clip] 沙盒同步失败:', e);
  }
}

/**
 * 将纯文本转为 HTML（保留换行）
 */
function _textToHtml(text) {
  if (!text) return '';
  return text
    .split('\n')
    .map(function (line) { return '<p>' + _escapeHtml(line) + '</p>'; })
    .filter(function (p) { return p !== '<p></p>'; })
    .join('');
}

function _escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ════════════════════════════════════════════════════════════
//  功能 22：网页转知识节点
// ════════════════════════════════════════════════════════════

/**
 * 将整页内容抓取为 Web 项目节点（sandbox 模式，保留完整 HTML）
 */
export async function clipFullPageToNode(webview, ctx) {
  const result = await _exec(webview, '(' + _extractPageHtml.toString() + ')()');
  let title = '网页节点', url = '', pageHtml = '';
  try {
    if (result) {
      const d = JSON.parse(result);
      title = d.title || title;
      url = d.url || '';
      pageHtml = d.html || '';
    }
  } catch (_) {}
  if (!pageHtml) { _notify(null, '未能提取页面内容'); return; }
  // desc：简短描述（3D 场景用）
  const desc = url ? '🔗 ' + url : '';
  const node = _createNode({
    name: title,
    desc: desc,
    sizeScale: 1.5,
    parentId: _getParentId(),
    offsetX: 160, offsetY: 10,
  });
  if (node) {
    // 设置为 Web 项目节点（sandbox 模式）
    node.activeMode = 'code';
    node.fileSystem = {
      type: 'directory',
      name: '/',
      children: [{
        type: 'file',
        name: 'index.html',
        content: pageHtml,
        language: 'html'
      }]
    };
    node.htmlSource = { mode: 'sandbox' };
    // 保存项目数据
    saveCurrentProjectData();
    // 同步沙盒文件到磁盘
    _syncSandboxToDisk(node);
  }
  _notify(node, '已抓取整页为 Web 项目节点「' + title + '」');
}

/** 在 webview 内执行：提取页面完整 HTML（去除 script，保留样式） */
function _extractPageHtml() {
  var title = document.title || '网页节点';
  var url = location.href;
  var clone = document.documentElement.cloneNode(true);
  // 移除脚本和无关标签
  clone.querySelectorAll('script, noscript, link[rel="preconnect"], link[rel="dns-prefetch"], link[rel="manifest"]').forEach(function (el) { el.remove(); });
  var html = '<!DOCTYPE html>\n' + clone.outerHTML;
  if (html.length > 500000) html = html.substring(0, 500000) + '\n<!-- 内容已截断 -->';
  return JSON.stringify({ title: title, url: url, html: html });
}

/**
 * 将选中文本抓取为节点
 */
export async function clipSelectionToNode(webview, ctx) {
  const text = (ctx && ctx.selectionText) || '';
  if (!text) { _notify(null, '未选中文本'); return; }
  const url = await _getPageUrl(webview);
  const name = text.length > 24 ? text.substring(0, 24) + '…' : text;
  const desc = (url ? '🔗 ' + url + '\n' : '') + text.substring(0, 100);
  const html = (url ? '<p><strong>🔗 来源：</strong><a href="' + url + '">' + _escapeHtml(url) + '</a></p>' : '') + _textToHtml(text);
  const node = _createNode({
    name: name,
    desc: desc,
    sizeScale: 1.0,
    parentId: _getParentId(),
    offsetX: 160, offsetY: 10,
  });
  if (node) _saveNodeContent(node, html);
  _notify(node, '已抓取选中文本为节点「' + name + '」');
}

/**
 * 将图片抓取为节点
 */
export async function clipImageToNode(webview, ctx) {
  const srcURL = (ctx && ctx.srcURL) || '';
  if (!srcURL) { _notify(null, '未识别到图片地址'); return; }
  const pageUrl = await _getPageUrl(webview);
  // 取 alt
  const safeSrc = srcURL.replace(/'/g, "\\'");
  const altScript = "(function(){ var imgs = document.querySelectorAll('img'); for (var i = 0; i < imgs.length; i++) { if (imgs[i].src === '" + safeSrc + "') return imgs[i].alt || imgs[i].title || ''; } return ''; })()";
  const alt = (await _exec(webview, altScript)) || '';
  const name = alt ? ('图片: ' + alt).substring(0, 30) : '图片节点';
  const desc = '🖼 ' + srcURL + (pageUrl ? '\n🔗 ' + pageUrl : '');
  const html = '<p><img src="' + _escapeHtml(srcURL) + '" alt="' + _escapeHtml(alt) + '" style="max-width:100%;"></p>' +
    (pageUrl ? '<p><strong>🔗 来源：</strong><a href="' + _escapeHtml(pageUrl) + '">' + _escapeHtml(pageUrl) + '</a></p>' : '') +
    (alt ? '<p><em>' + _escapeHtml(alt) + '</em></p>' : '');
  const node = _createNode({
    name: name,
    desc: desc,
    sizeScale: 1.2,
    nodeType: 'block',
    parentId: _getParentId(),
    offsetX: 160, offsetY: 10,
  });
  if (node) _saveNodeContent(node, html);
  _notify(node, '已抓取图片为节点「' + name + '」');
}

/**
 * 将链接抓取为节点
 */
export async function clipLinkToNode(webview, ctx) {
  const linkURL = (ctx && ctx.linkURL) || '';
  if (!linkURL) { _notify(null, '未识别到链接'); return; }
  const pageUrl = await _getPageUrl(webview);
  const safeUrl = linkURL.replace(/'/g, "\\'");
  const linkTextScript = "(function(){ var links = document.querySelectorAll('a[href]'); for (var i = 0; i < links.length; i++) { if (links[i].href === '" + safeUrl + "') return links[i].textContent || links[i].title || ''; } return ''; })()";
  let linkText = (await _exec(webview, linkTextScript)) || '';
  linkText = linkText.trim();
  const name = linkText ? (linkText.length > 30 ? linkText.substring(0, 30) + '…' : linkText) : '链接节点';
  const desc = '🔗 ' + linkURL + (pageUrl && pageUrl !== linkURL ? '\n来源: ' + pageUrl : '');
  const html = '<p><a href="' + _escapeHtml(linkURL) + '" style="font-size:14px;">' + _escapeHtml(linkText || linkURL) + '</a></p>' +
    (pageUrl && pageUrl !== linkURL ? '<p><strong>来源页面：</strong><a href="' + _escapeHtml(pageUrl) + '">' + _escapeHtml(pageUrl) + '</a></p>' : '');
  const node = _createNode({
    name: name,
    desc: desc,
    sizeScale: 1.0,
    parentId: _getParentId(),
    offsetX: 160, offsetY: 10,
  });
  if (node) _saveNodeContent(node, html);
  _notify(node, '已抓取链接为节点「' + name + '」');
}

// ════════════════════════════════════════════════════════════
//  功能 23：Markdown 网页剪藏
// ════════════════════════════════════════════════════════════

/**
 * 将网页转换为 Markdown 并导入为节点树
 */
export async function clipPageToMarkdownNode(webview) {
  // 注入转换函数到 webview 并执行
  const script = '(' + _convertPageToMarkdown.toString() + ')()';
  const md = await _exec(webview, script);
  if (!md || md.trim().length < 5) {
    _notify(null, '未能从页面提取到内容');
    return;
  }
  // 用 parseMarkdownToTree 导入为节点树
  try {
    const mod = await import('../../module9_FileIO.js');
    if (typeof mod.parseMarkdownToTree === 'function') {
      const { tree, nodeRichContents } = mod.parseMarkdownToTree(md);
      const count = _countTreeNodes(tree);
      if (count > 0) {
        _importTreeToScene(tree, nodeRichContents);
        _notify(null, '已剪藏网页为 Markdown 知识树（' + count + ' 个节点）');
        return;
      }
    }
  } catch (e) {
    console.warn('[browser-node-clip] parseMarkdownToTree 失败，回退为单节点:', e);
  }
  // 回退：创建单个 block 节点保存 Markdown
  let title = 'Markdown 剪藏';
  const firstHeading = md.split('\n').find(function (l) { return l.startsWith('#'); });
  if (firstHeading) title = firstHeading.replace(/^#+\s*/, '');
  const desc = '📋 Markdown 剪藏\n\n' + md.substring(0, 200);
  // 将 Markdown 转为简单 HTML 供编辑器显示
  const html = _markdownToHtml(md);
  const node = _createNode({
    name: title.substring(0, 40),
    desc: desc,
    sizeScale: 1.5,
    nodeType: 'block',
    parentId: _getParentId(),
    offsetX: 160, offsetY: 10,
  });
  if (node) _saveNodeContent(node, html);
  _notify(node, '已剪藏为 Markdown 节点「' + title.substring(0, 40) + '」');
}

/**
 * 简易 Markdown → HTML 转换（用于编辑器显示）
 */
function _markdownToHtml(md) {
  if (!md) return '';
  var lines = md.split('\n');
  var html = '';
  var inList = false;
  var inCode = false;
  var codeLang = '';

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];

    // 代码块
    if (line.startsWith('```')) {
      if (inCode) {
        html += '</code></pre>';
        inCode = false;
      } else {
        codeLang = line.substring(3).trim();
        html += '<pre><code class="language-' + _escapeHtml(codeLang) + '">';
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      html += _escapeHtml(line) + '\n';
      continue;
    }

    // 标题
    var hMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (hMatch) {
      if (inList) { html += '</ul>'; inList = false; }
      var level = hMatch[1].length;
      html += '<h' + level + '>' + _escapeHtml(hMatch[2]) + '</h' + level + '>';
      continue;
    }
    // 分割线
    if (/^---+$/.test(line.trim())) {
      if (inList) { html += '</ul>'; inList = false; }
      html += '<hr>';
      continue;
    }
    // 引用
    if (line.startsWith('> ')) {
      if (inList) { html += '</ul>'; inList = false; }
      html += '<blockquote>' + _escapeHtml(line.substring(2)) + '</blockquote>';
      continue;
    }
    // 列表项
    if (/^[-*]\s+/.test(line)) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += '<li>' + _escapeHtml(line.replace(/^[-*]\s+/, '')) + '</li>';
      continue;
    }
    // 空行
    if (line.trim() === '') {
      if (inList) { html += '</ul>'; inList = false; }
      continue;
    }
    // 普通段落
    if (inList) { html += '</ul>'; inList = false; }
    html += '<p>' + _escapeHtml(line) + '</p>';
  }
  if (inList) html += '</ul>';
  if (inCode) html += '</code></pre>';
  return html;
}

/**
 * 在 webview 内执行：将页面 HTML 转换为 Markdown 字符串
 * 注意：此函数会被 .toString() 后注入 webview，不能引用外部变量
 */
function _convertPageToMarkdown() {
  var root = document.querySelector('article') || document.querySelector('main')
    || document.querySelector('.article, .content, #content, .post, .entry')
    || document.body;
  if (!root) return '';

  var clone = root.cloneNode(true);
  var removeSelectors = 'script, style, noscript, iframe, nav, footer, header, aside, form, button, .ad, .ads, .sidebar, .comment, .comments, .share, .related, .recommend';
  clone.querySelectorAll(removeSelectors).forEach(function (el) { el.remove(); });

  var lines = [];
  var docTitle = (document.title || '').trim();
  if (docTitle) lines.push('# ' + docTitle);
  lines.push('');
  lines.push('> 来源: ' + location.href);
  lines.push('');

  function escapeMd(s) {
    return String(s || '').replace(/\\/g, '\\\\').replace(/\*/g, '\\*').replace(/_/g, '\\_');
  }

  function processNode(node) {
    if (node.nodeType === 3) {
      var t = node.textContent.replace(/\s+/g, ' ').trim();
      if (t) lines.push(escapeMd(t));
      return;
    }
    if (node.nodeType !== 1) return;
    var tag = node.tagName.toLowerCase();

    var hMatch = tag.match(/^h([1-6])$/);
    if (hMatch) {
      var level = parseInt(hMatch[1], 10);
      var txt = (node.innerText || '').trim();
      if (txt) { lines.push(''); lines.push('#'.repeat(Math.min(level + 1, 6)) + ' ' + escapeMd(txt)); lines.push(''); }
      return;
    }
    if (tag === 'p' || tag === 'div' || tag === 'section') {
      var inner = (node.innerText || '').trim();
      if (inner) { lines.push(''); lines.push(escapeMd(inner)); lines.push(''); }
      return;
    }
    if (tag === 'br') { lines.push(''); return; }
    if (tag === 'hr') { lines.push(''); lines.push('---'); lines.push(''); return; }
    if (tag === 'img') {
      var src = node.src || node.getAttribute('data-src') || '';
      var alt = node.alt || '';
      if (src) { lines.push(''); lines.push('![' + alt + '](' + src + ')'); lines.push(''); }
      return;
    }
    if (tag === 'a') {
      var href = node.href || '';
      var atext = (node.innerText || node.textContent || '').trim();
      if (href && atext) { lines.push('[' + escapeMd(atext) + '](' + href + ')'); }
      return;
    }
    if (tag === 'blockquote') {
      lines.push('');
      var bqText = (node.innerText || '').trim();
      bqText.split('\n').forEach(function (l) { lines.push('> ' + escapeMd(l)); });
      lines.push('');
      return;
    }
    if (tag === 'ul' || tag === 'ol') {
      lines.push('');
      var items = node.querySelectorAll(':scope > li');
      for (var i = 0; i < items.length; i++) {
        var liText = (items[i].innerText || '').trim();
        var prefix = tag === 'ol' ? (i + 1) + '. ' : '- ';
        lines.push(prefix + escapeMd(liText));
      }
      lines.push('');
      return;
    }
    if (tag === 'pre') {
      lines.push('');
      var code = node.textContent || '';
      var codeLang = '';
      var codeEl = node.querySelector('code');
      if (codeEl && codeEl.className) {
        var m = codeEl.className.match(/language-([a-z0-9]+)/i);
        if (m) codeLang = m[1];
      }
      lines.push('```' + codeLang);
      lines.push(code.replace(/\n$/, ''));
      lines.push('```');
      lines.push('');
      return;
    }
    if (tag === 'code') {
      lines.push('`' + escapeMd(node.textContent || '') + '`');
      return;
    }
    if (tag === 'table') {
      lines.push('');
      var rows = node.querySelectorAll('tr');
      rows.forEach(function (r, ri) {
        var cells = r.querySelectorAll('th, td');
        var cellTexts = [];
        cells.forEach(function (c) { cellTexts.push(escapeMd((c.innerText || '').trim())); });
        lines.push('| ' + cellTexts.join(' | ') + ' |');
        if (ri === 0) {
          lines.push('| ' + cellTexts.map(function () { return '---'; }).join(' | ') + ' |');
        }
      });
      lines.push('');
      return;
    }
    var children = node.childNodes;
    for (var j = 0; j < children.length; j++) {
      processNode(children[j]);
    }
  }

  processNode(clone);
  var md = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return md;
}

/**
 * 将解析出的树导入到当前场景
 */
async function _importTreeToScene(tree, nodeRichContents) {
  try {
    if (!appState) return;
    if (!appState.methodsTree) {
      appState.methodsTree = { id: appState.VIRTUAL_ROOT_ID, name: '(虚拟根)', children: [] };
    }
    if (!appState.methodsTree.children) appState.methodsTree.children = [];

    var parentId = _getParentId();
    var targetChildren = appState.methodsTree.children;
    if (parentId) {
      var parentNode = appState.nodeMap ? appState.nodeMap.get(parentId) : null;
      if (parentNode) {
        if (!parentNode.children) parentNode.children = [];
        targetChildren = parentNode.children;
      }
    }

    for (var i = 0; i < (tree.children || []).length; i++) {
      targetChildren.push(tree.children[i]);
    }
    if (appState.rebuildNodeMapFromTree) {
      appState.rebuildNodeMapFromTree();
    } else if (appState.nodeMap) {
      var walk = function (n) {
        appState.nodeMap.set(n.id, n);
        if (n.children) n.children.forEach(walk);
      };
      (tree.children || []).forEach(walk);
    }
    // 写入 richContent（Markdown 原文转为 HTML）
    for (var nodeId in (nodeRichContents || {})) {
      var n = appState.nodeMap.get(nodeId);
      if (n) {
        var mdContent = nodeRichContents[nodeId];
        var htmlContent = _markdownToHtml(mdContent);
        n.richContent = htmlContent;
        n.content = htmlContent;
        n.desc = mdContent.substring(0, 200);
        // 写入磁盘
        _writeNodeContentToDisk(n, htmlContent);
      }
    }
    var addIdsToLayer = function (n) {
      if (appState.addNodeToCurrentLayer) appState.addNodeToCurrentLayer(n.id);
      if (n.children) n.children.forEach(addIdsToLayer);
    };
    (tree.children || []).forEach(addIdsToLayer);

    // 重建 3D 场景（创建 mesh + 连线）
    try {
      var viz = await import('../../VisualComponents/index.js');
      if (typeof viz.buildSceneFromTree === 'function') {
        viz.buildSceneFromTree();
      }
    } catch (e2) {
      console.warn('[browser-node-clip] buildSceneFromTree 失败:', e2);
    }

    if (appState.refreshTreePanel) appState.refreshTreePanel();
    if (appState.is2DView && appState.refresh2DView) appState.refresh2DView();
    // 自动排列布局
    if (appState.autoArrangeRadial) {
      try { appState.autoArrangeRadial(); } catch (_) {}
    } else if (appState.autoArrangeTreeLayout) {
      try { appState.autoArrangeTreeLayout(); } catch (_) {}
    }
    if (appState.is2DView && appState.refresh2DView) appState.refresh2DView();
    saveCurrentProjectData();
  } catch (e) {
    console.error('[browser-node-clip] 导入树失败:', e);
  }
}

function _countTreeNodes(tree) {
  var c = 0;
  var walk = function (n) {
    c++;
    if (n.children) n.children.forEach(walk);
  };
  if (tree && tree.children) tree.children.forEach(walk);
  return c;
}
