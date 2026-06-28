// ============================================================
// heading-templates.js — 标题内联样式模板管理
// ============================================================

const STORAGE_KEY = 'astroknot-h-templates';
const CURRENT_KEY = 'astroknot-h-template-current';

// 内置默认模板
var _builtinDefault = {
  name: '\u9ED8\u8BA4\u6837\u5F0F',
  builtin: true,
  levels: {
    1: { fontSize: '28px', fontWeight: 'bold',  marginBottom: '8px', paddingLeft: '0em' },
    2: { fontSize: '24px', fontWeight: 'bold',  marginBottom: '6px', paddingLeft: '1.5em' },
    3: { fontSize: '20px', fontWeight: 'normal', marginBottom: '4px', paddingLeft: '3em' },
    4: { fontSize: '16px', fontWeight: 'normal', marginBottom: '4px', paddingLeft: '4.5em' },
    5: { fontSize: '14px', fontWeight: 'normal', marginBottom: '4px', paddingLeft: '6em' },
    6: { fontSize: '13px', fontWeight: 'normal', marginBottom: '4px', paddingLeft: '7.5em' }
  }
};

// ─── 存储层 ───

export function loadTemplates() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return [_cloneTemplate(_builtinDefault, 'tpl-builtin')];
}

export function saveTemplates(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (e) {}
}

export function getCurrentTemplateId() {
  try { return localStorage.getItem(CURRENT_KEY); } catch (e) { return null; }
}
export function setCurrentTemplateId(id) {
  try { localStorage.setItem(CURRENT_KEY, id); } catch (e) {}
}

export function getCurrentTemplate() {
  var list = loadTemplates();
  var id = getCurrentTemplateId();
  var tpl = _findById(list, id);
  return tpl || list[0];
}

// ─── 拿到某一级的样式对象（用于 insert-toc 创建标题时写入内联） ───

export function getStylesForLevel(level) {
  var tpl = getCurrentTemplate();
  var lv = (tpl && tpl.levels && tpl.levels[level]) ? tpl.levels[level] : null;
  var result = {};
  if (lv) {
    if (lv.fontSize)     result['font-size']     = lv.fontSize;
    if (lv.fontWeight)   result['font-weight']   = lv.fontWeight;
    if (lv.marginBottom) result['margin-bottom'] = lv.marginBottom;
    if (lv.paddingLeft)  result['padding-left']  = lv.paddingLeft;
  }
  return result;
}

// ─── 应用模板到单个标题元素 ───

export function applyTemplateToHeading(editor, heading) {
  var lv = parseInt(heading.tagName.substring(1));
  var styles = getStylesForLevel(lv);
  editor.undoManager.transact(function () {
    Object.keys(styles).forEach(function (prop) {
      editor.dom.setStyle(heading, prop, styles[prop]);
    });
  });
}

// ─── 应用当前模板到所有标题 ───

export function applyTemplateToAll(editor) {
  var body = editor.getBody();
  if (!body) return;
  var headings = body.querySelectorAll('h1,h2,h3,h4,h5,h6');
  editor.undoManager.transact(function () {
    headings.forEach(function (el) {
      var lv = parseInt(el.tagName.substring(1));
      var styles = getStylesForLevel(lv);
      Object.keys(styles).forEach(function (prop) {
        editor.dom.setStyle(el, prop, styles[prop]);
      });
    });
  });
}

// ─── 保存当前文档中某一标题的样式到模板 ───

export function captureStylesFromHeading(editor, heading) {
  var lv = parseInt(heading.tagName.substring(1));
  var fs  = editor.dom.getStyle(heading, 'font-size')     || '';
  var fw  = editor.dom.getStyle(heading, 'font-weight')   || '';
  var mb  = editor.dom.getStyle(heading, 'margin-bottom') || '';
  var pl  = editor.dom.getStyle(heading, 'padding-left')  || '';
  return {
    fontSize:     fs.replace(/px$/, ''),
    fontWeight:   fw,
    marginBottom: mb.replace(/px$/, ''),
    paddingLeft:  pl.replace(/px$/, '')
  };
}

// ─── CRUD ───

export function createTemplate(name) {
  var list = loadTemplates();
  var tpl = {
    id: 'tpl-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 5),
    name: name,
    levels: { 1:{}, 2:{}, 3:{}, 4:{}, 5:{}, 6:{} }
  };
  list.push(tpl);
  saveTemplates(list);
  return tpl;
}

export function updateTemplate(id, data) {
  var list = loadTemplates();
  var idx = _indexById(list, id);
  if (idx === -1) return null;
  if (data.name  !== undefined) list[idx].name  = data.name;
  if (data.levels !== undefined) list[idx].levels = data.levels;
  saveTemplates(list);
  return list[idx];
}

export function deleteTemplate(id) {
  var list = loadTemplates();
  var idx = _indexById(list, id);
  if (idx === -1) return false;
  list.splice(idx, 1);
  saveTemplates(list);
  // 如果删的是当前选中 → 清掉
  if (getCurrentTemplateId() === id) setCurrentTemplateId(null);
  return true;
}

export function getTemplateById(id) {
  return _findById(loadTemplates(), id);
}

// ─── 内部工具 ───

function _findById(list, id) {
  if (!list || !id) return null;
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === id) return list[i];
  }
  return null;
}

function _indexById(list, id) {
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === id) return i;
  }
  return -1;
}

function _cloneTemplate(src, newId) {
  return JSON.parse(JSON.stringify(Object.assign({}, src, { id: newId })));
}

// ─── 初始化：确保 localStorage 至少有默认模板 ───

(function () {
  var list = loadTemplates();
  if (list.length === 0) {
    list = [_cloneTemplate(_builtinDefault, 'tpl-builtin')];
    saveTemplates(list);
  }
  if (!getCurrentTemplateId()) {
    setCurrentTemplateId(list[0].id);
  }
})();
