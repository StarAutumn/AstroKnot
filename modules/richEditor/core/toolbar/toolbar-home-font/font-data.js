import { state } from '../../../shared-state.js';

export let cnFonts = [
  { label: '宋体', family: '\'宋体\', SimSun, serif' },
  { label: '仿宋', family: '\'仿宋\', FangSong, \'FangSong_GB2312\', serif' },
  { label: '黑体', family: '\'黑体\', SimHei, \'Microsoft YaHei\', sans-serif' },
  { label: '楷体', family: '\'楷体\', KaiTi, \'KaiTi_GB2312\', serif' },
  { label: '隶书', family: '\'隶书\', LiSu, \'华文隶书\', serif' },
  { label: '微软雅黑', family: '\'微软雅黑\', \'Microsoft YaHei\', sans-serif' },
  { label: '等线', family: '\'等线\', \'Segoe UI\', \'DengXian\', sans-serif' },
  { label: '幼圆', family: '\'幼圆\', YouYuan, \'Yuanti SC\', sans-serif' },
  { label: '华文仿宋', family: '\'华文仿宋\', STFangsong, serif' },
  { label: '华文行楷', family: '\'华文行楷\', STXingkai, cursive' },
  { label: '华文琥珀', family: '\'华文琥珀\', STHupo, cursive' },
  { label: '华文新魏', family: '\'华文新魏\', STXinwei, serif' },
  { label: '华文细黑', family: '\'华文细黑\', STXihei, \'Microsoft YaHei\', sans-serif' },
  { label: '方正黑体', family: '\'方正黑体\', \'FZHei\', \'FZHei-B01S\', sans-serif' },
  { label: '方正楷体', family: '\'方正楷体\', \'FZKai\', \'FZKai-Z03S\', serif' },
  { label: '方正舒体', family: '\'方正舒体\', \'FZShuTi\', serif' },
  { label: '方正姚体', family: '\'方正姚体\', \'FZYaoTi\', serif' },
  { label: '苹方', family: '\'PingFang SC\', \'苹方\', \'Helvetica Neue\', sans-serif' },
  { label: '思源黑体', family: '\'Source Han Sans\', \'Noto Sans CJK SC\', \'思源黑体\', sans-serif' },
  { label: '思源宋体', family: '\'Source Han Serif\', \'Noto Serif CJK SC\', \'思源宋体\', serif' },
  { label: '微软正黑体', family: '\'微软正黑体\', \'Microsoft JhengHei\', sans-serif' },
  { label: '冬青黑体', family: '\'冬青黑体\', \'Hiragino Sans GB\', \'Hiragino Sans\', sans-serif' }
];

export let enFonts = [
  { label: 'Arial', family: 'Arial, sans-serif' },
  { label: 'Times New Roman', family: '\'Times New Roman\', serif' },
  { label: 'Calibri', family: 'Calibri, sans-serif' },
  { label: 'Courier New', family: '\'Courier New\', monospace' },
  { label: 'Georgia', family: 'Georgia, serif' },
  { label: 'Verdana', family: 'Verdana, sans-serif' },
  { label: 'Segoe UI', family: '\'Segoe UI\', sans-serif' },
  { label: 'Comic Sans MS', family: '\'Comic Sans MS\', cursive' }
];

export let cnFontNameMap = {};
cnFonts.forEach(function (f) {
  let parts = f.family.split(',');
  parts.forEach(function (p) {
    let name = p.trim().replace(/['"]/g, '');
    if (name && !/^(serif|sans-serif|monospace|cursive|fantasy)$/i.test(name)) {
      cnFontNameMap[name] = f.label;
      cnFontNameMap[name.toLowerCase()] = f.label;
    }
  });
  cnFontNameMap[f.label] = f.label;
  cnFontNameMap[f.label.toLowerCase()] = f.label;
});

export let enFontNameMap = {};
enFonts.forEach(function (f) {
  let name = f.family.split(',')[0].trim().replace(/['"]/g, '');
  enFontNameMap[name] = f.label;
  enFontNameMap[name.toLowerCase()] = f.label;
  enFontNameMap[f.label] = f.label;
  enFontNameMap[f.label.toLowerCase()] = f.label;
});

export function getActualFontFamily(node) {
  if (!node) return null;
  const style = window.getComputedStyle(node);
  let family = style.fontFamily;
  if (!family) return null;
  family = family.split(',')[0].trim().replace(/['"]/g, '');
  return family;
}

export function getFontFromTextNode(textNode, isChinese) {
  let node = textNode.parentNode;
  while (node && node.nodeType === 1) {
    if (node.tagName === 'SPAN' && node.style && node.style.fontFamily) {
      return node.style.fontFamily.split(',')[0].trim().replace(/['"]/g, '');
    }
    if (['P','DIV','H1','H2','H3','H4','H5','H6','LI','TD','TH','BLOCKQUOTE','BODY'].includes(node.tagName)) {
      break;
    }
    node = node.parentNode;
  }
  return null;
}

export function getCurrentFonts(ed) {
  let chFont = null;
  let enFont = null;
  const selection = ed.selection.getSel();
  if (!selection || selection.rangeCount === 0) return { chFont: '中文字体', enFont: '英文字体' };

  const range = selection.getRangeAt(0);
  let container = range.commonAncestorContainer;
  if (container.nodeType === 3) container = container.parentNode;

  const span = container.nodeType === 1 ? container.closest('span[style*="font-family"]') : null;
  if (span) {
    const family = span.style.fontFamily;
    if (family) {
      for (const f of cnFonts) {
        if (family.includes(f.label) || family.includes(f.family.split(',')[0].replace(/['"]/g, ''))) {
          chFont = f.label;
          break;
        }
      }
      for (const f of enFonts) {
        if (family.includes(f.label)) {
          enFont = f.label;
          break;
        }
      }
    }
  }

  if (!chFont || !enFont) {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        if (range.intersectsNode(node)) return NodeFilter.FILTER_ACCEPT;
        return NodeFilter.FILTER_SKIP;
      }
    });
    let firstTextNode = walker.nextNode();
    if (!firstTextNode && container.nodeType === 3) firstTextNode = container;
    if (firstTextNode) {
      let rawFont = getFontFromTextNode(firstTextNode, true);
      if (rawFont) {
        if (!chFont) {
          let inCN = cnFonts.some(function (f) {
            return rawFont.toLowerCase().includes(f.label.toLowerCase()) ||
              f.family.toLowerCase().includes(rawFont.toLowerCase());
          });
          if (inCN) chFont = rawFont;
        }
        if (!enFont) {
          let inEN = enFonts.some(function (f) {
            return rawFont.toLowerCase().includes(f.label.toLowerCase()) ||
              f.family.toLowerCase().includes(rawFont.toLowerCase());
          });
          if (inEN) enFont = rawFont;
        }
      }
    }
  }

  if (!chFont) {
    chFont = '中文字体';
  }
  if (!enFont) {
    enFont = '英文字体';
  }

  if (chFont && chFont !== '中文字体') {
    const matched = cnFonts.find(f =>
      chFont.toLowerCase().includes(f.label.toLowerCase()) ||
      chFont.toLowerCase().includes(f.family.toLowerCase().replace(/['"]/g, ''))
    );
    if (matched) chFont = matched.label;
    else if (cnFontNameMap[chFont]) chFont = cnFontNameMap[chFont];
    else if (cnFontNameMap[chFont.toLowerCase()]) chFont = cnFontNameMap[chFont.toLowerCase()];
  }
  if (enFont && enFont !== '英文字体') {
    const matched = enFonts.find(f => enFont.toLowerCase().includes(f.label.toLowerCase()));
    if (matched) enFont = matched.label;
    else if (enFontNameMap[enFont]) enFont = enFontNameMap[enFont];
    else if (enFontNameMap[enFont.toLowerCase()]) enFont = enFontNameMap[enFont.toLowerCase()];
  }

  return { chFont: chFont || '中文字体', enFont: enFont || '英文字体' };
}

export function updateFontButtonLabels(ed) {
  if (!ed || !ed.getContainer) ed = state.tinyEditor;
  if (!ed) return;
  let result = getCurrentFonts(ed);
  let cap = function (t) { return t.length > 10 ? t.slice(0, 9) + '…' : t; };

  let container = ed.getContainer();
  if (!container) return;

  let cnBtn = container.querySelector('.tox-mbtn[aria-label="中文字体（仅对汉字生效）"], .tox-tbtn[aria-label="中文字体（仅对汉字生效）"]');
  if (cnBtn) {
    let sl = cnBtn.querySelector('.tox-mbtn__select-label, .tox-tbtn__select-label');
    if (sl) sl.textContent = cap(result.chFont);
  }
  let enBtn = container.querySelector('.tox-mbtn[aria-label="英文字体（仅对英文生效）"], .tox-tbtn[aria-label="英文字体（仅对英文生效）"]');
  if (enBtn) {
    let sl = enBtn.querySelector('.tox-mbtn__select-label, .tox-tbtn__select-label');
    if (sl) sl.textContent = cap(result.enFont);
  }
}