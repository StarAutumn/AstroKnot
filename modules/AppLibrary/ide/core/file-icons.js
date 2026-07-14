// ============================================================
//  file-icons.js — VS Code 简洁风格文件图标
//  仅显示彩色类型标识（JS / # / <> 等），无背景无文件轮廓
//  供 file-tree.js 和 tabs.js 共享
// ============================================================

/**
 * 返回文件图标的 SVG HTML 字符串
 * @param {string} filePath - 文件路径或文件名
 * @returns {string} SVG HTML
 */
export function getFileIconSVG(filePath) {
  const name = filePath.split('/').pop().toLowerCase();
  const ext = name.split('.').pop().toLowerCase();
  const icon = SPECIAL_NAMES[name] || FILE_ICONS[ext] || FILE_ICONS['default'];
  return icon;
}

/**
 * 返回文件夹图标的 SVG HTML 字符串
 * @param {boolean} expanded - 是否展开
 * @returns {string} SVG HTML
 */
export function getFolderIconSVG(expanded) {
  return expanded ? ICON_FOLDER_OPEN : ICON_FOLDER_CLOSED;
}

// ── 快捷构建：纯彩色文字/符号 ──
// font-size 占 viewBox 的 70-80%，让文字撑满图标区域
// 直接写死 SVG 尺寸，不依赖 CSS
function txt(color, text, size = 10) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="22" height="22" class="file-icon-svg"><text x="8" y="13" text-anchor="middle" fill="${color}" font-size="${size}" font-family="'Segoe UI',system-ui,sans-serif" font-weight="700">${text}</text></svg>`;
}

// ── 文件夹图标 ──
const ICON_FOLDER_CLOSED = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" class="file-icon-svg folder-icon-svg"><path fill="#90a4ae" d="M1.5 2h4.3l1.2 1.5H14.5c.28 0 .5.22.5.5v8.5c0 .28-.22.5-.5.5H1.5c-.28 0-.5-.22-.5-.5v-10c0-.28.22-.5.5-.5z"/></svg>`;

const ICON_FOLDER_OPEN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" class="file-icon-svg folder-icon-svg"><path fill="#90a4ae" d="M1.5 2h4.3l1.2 1.5H14.5c.28 0 .5.22.5.5V5H6.5L5 3.5H1v9c0 .28.22.5.5.5h13c.28 0 .5-.22.5-.5V5.5L15 10H3L1 3.5V2.5c0-.28.22-.5.5-.5z"/></svg>`;

// ── 文件类型图标映射 ──
// 字号统一增大，让文字撑满 viewBox
const FILE_ICONS = {
  html: txt('#e44d26', '<>', 8),
  htm: null,

  css: txt('#563d7c', '#', 13),
  scss: null,
  less: null,

  js: txt('#f7df1e', 'JS', 7.5),
  mjs: null,
  cjs: null,

  ts: txt('#3178c6', 'TS', 7.5),
  tsx: null,

  jsx: txt('#61dafb', '⚛', 11),

  json: txt('#f7df1e', '{}', 8),

  md: txt('#519aba', 'M↓', 7.5),

  py: txt('#3572a5', 'Py', 7.5),

  svg: txt('#ffb13b', '◇', 11),

  png: txt('#a074c4', '◈', 11),
  jpg: null,
  jpeg: null,
  gif: null,
  webp: null,
  ico: null,
  bmp: null,

  txt: txt('#90a4ae', '≡', 11),

  xml: txt('#e44d26', '</>', 6.5),

  yml: txt('#cb171e', 'Y', 11),
  yaml: null,

  sh: txt('#89e051', '>_', 8.5),
  bash: null,
  zsh: null,
  fish: null,

  git: txt('#f05032', '⊕', 10),
  gitignore: null,

  env: txt('#ecd53f', 'EN', 7),

  lock: txt('#90a4ae', '⊘', 10),

  sql: txt('#0082b4', 'DB', 7.5),
  db: null,
  sqlite: null,

  toml: txt('#6d8086', '⚙', 10),
  ini: null,
  cfg: null,
  conf: null,

  mp4: txt('#f4511e', '▶', 11),
  avi: null,
  mov: null,
  mkv: null,
  webm: null,

  mp3: txt('#e91e63', '♪', 11),
  wav: null,
  ogg: null,
  flac: null,

  ttf: txt('#8bc34a', 'A', 11),
  otf: null,
  woff: null,
  woff2: null,
  eot: null,

  pdf: txt('#e44d26', 'PDF', 6.5),

  zip: txt('#6d8086', '▣', 10),
  rar: null,
  '7z': null,
  gz: null,
  tar: null,

  vue: txt('#41b883', 'V', 11),
  svelte: txt('#ff3e00', 'S', 11),
  wasm: txt('#654ff0', 'WA', 7),

  java: txt('#b07219', '☕', 10),
  jar: null,

  c: txt('#555', 'C', 11),
  h: null,

  cpp: txt('#f34b7d', 'C++', 6.5),
  hpp: null,
  cc: null,
  cxx: null,

  go: txt('#00add8', 'Go', 8),

  rs: txt('#dea584', 'Rs', 8),

  rb: txt('#701516', '◆', 10),

  php: txt('#4f5d95', 'PHP', 6.5),

  swift: txt('#f05138', 'Sw', 8),

  kt: txt('#a97bff', 'Kt', 8),
  kts: null,

  dart: txt('#00b4ab', 'Da', 8),

  default: txt('#90a4ae', '•', 11),
};

// 特殊文件名映射
const SPECIAL_NAMES = {
  'makefile': FILE_ICONS.default,
  'dockerfile': FILE_ICONS.default,
  'readme.md': FILE_ICONS.md,
  'license': FILE_ICONS.txt,
  'package.json': FILE_ICONS.json,
  'tsconfig.json': FILE_ICONS.json,
  '.gitignore': FILE_ICONS.git,
  '.env': FILE_ICONS.env,
  '.env.local': FILE_ICONS.env,
  '.env.production': FILE_ICONS.env,
  '.env.development': FILE_ICONS.env,
};

// 处理别名（null 值共享前一个非 null 图标）
(function resolveAliases() {
  const keys = Object.keys(FILE_ICONS);
  let lastNonNull = null;
  for (const key of keys) {
    if (FILE_ICONS[key] === null) {
      if (lastNonNull) FILE_ICONS[key] = lastNonNull;
    } else {
      lastNonNull = FILE_ICONS[key];
    }
  }
})();
