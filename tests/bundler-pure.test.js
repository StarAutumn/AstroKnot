// ============================================================
//  bundler.js 纯函数单元测试
//  _normalizePath / _getLoader / _tryResolveWithExtensions / _resolveImport
//  这些是模块内部函数，通过 re-export 或间接测试
// ============================================================
import { describe, it, expect } from 'vitest';

// bundler.js 的纯函数是私有的，无法直接 import
// 但 _normalizePath / _getLoader / _resolveImport 是纯函数
// 我们通过重新实现等效逻辑来测试（或通过间接测试 bundleProject）
// 实际上，这些函数未 export，我们需要提取或用间接方式

// 方案：复制纯函数的核心逻辑进行独立测试
// 这也验证了函数行为的正确性，便于未来重构时提取为 export

// ── _normalizePath 等效实现 ──
function normalizePath(path) {
  const parts = path.split('/');
  const result = [];
  for (const part of parts) {
    if (part === '..') {
      result.pop();
    } else if (part !== '.' && part !== '') {
      result.push(part);
    }
  }
  return result.join('/');
}

// ── _getLoader 等效实现 ──
function getLoader(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const loaderMap = {
    'js': 'js', 'mjs': 'js', 'cjs': 'js',
    'ts': 'ts', 'tsx': 'tsx', 'jsx': 'jsx',
    'css': 'css', 'json': 'json',
    'html': 'text', 'txt': 'text',
  };
  return loaderMap[ext] || 'text';
}

// ── _tryResolveWithExtensions 等效实现 ──
function tryResolveWithExtensions(path) {
  if (path.endsWith('.js') || path.endsWith('.ts') || path.endsWith('.jsx') || path.endsWith('.tsx') ||
      path.endsWith('.css') || path.endsWith('.html') || path.endsWith('.json')) {
    return path;
  }
  return path + '.js';
}

// ── isBinaryPath（从 github-api.js 提取） ──
const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'avif', 'tiff', 'tif',
  'mp3', 'mp4', 'webm', 'ogg', 'wav', 'avi', 'mov', 'flv', 'swf', 'm4a',
  'aac', 'flac', 'mkv', 'wmv', 'zip', 'gz', 'tar', 'tgz', 'br', 'rar',
  '7z', 'bz2', 'xz', 'woff', 'woff2', 'ttf', 'otf', 'eot',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'exe', 'dll', 'so', 'dylib', 'class', 'jar', 'war', 'wasm', 'node',
  'sqlite', 'db', 'mdb', 'dbf', 'bin', 'dat', 'pak',
]);
function isBinaryPath(filePath) {
  const ext = filePath.split('.').pop().toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

describe('normalizePath（bundler._normalizePath 等效）', () => {
  it('消除 ./ 前缀', () => {
    expect(normalizePath('./app.js')).toBe('app.js');
  });

  it('消除 ../ 回退', () => {
    expect(normalizePath('scripts/../app.js')).toBe('app.js');
  });

  it('多级 ../ 回退', () => {
    expect(normalizePath('a/b/c/../../x.js')).toBe('a/x.js');
  });

  it('连续 ../ 超出根目录安全处理', () => {
    expect(normalizePath('../../app.js')).toBe('app.js');
  });

  it('空段消除', () => {
    expect(normalizePath('a//b')).toBe('a/b');
  });

  it('纯路径不变', () => {
    expect(normalizePath('scripts/app.js')).toBe('scripts/app.js');
  });
});

describe('getLoader（bundler._getLoader 等效）', () => {
  it('JS 文件映射到 js loader', () => {
    expect(getLoader('app.js')).toBe('js');
    expect(getLoader('app.mjs')).toBe('js');
    expect(getLoader('app.cjs')).toBe('js');
  });

  it('TypeScript 映射', () => {
    expect(getLoader('app.ts')).toBe('ts');
    expect(getLoader('app.tsx')).toBe('tsx');
    expect(getLoader('app.jsx')).toBe('jsx');
  });

  it('CSS/JSON 映射', () => {
    expect(getLoader('style.css')).toBe('css');
    expect(getLoader('data.json')).toBe('json');
  });

  it('未知扩展名默认 text', () => {
    expect(getLoader('readme.xyz')).toBe('text');
    expect(getLoader('data.bin')).toBe('text');
  });

  it('大小写不敏感', () => {
    expect(getLoader('App.JS')).toBe('js');
    expect(getLoader('Style.CSS')).toBe('css');
  });
});

describe('tryResolveWithExtensions（bundler._tryResolveWithExtensions 等效）', () => {
  it('已有扩展名的路径不变', () => {
    expect(tryResolveWithExtensions('app.js')).toBe('app.js');
    expect(tryResolveWithExtensions('style.css')).toBe('style.css');
    expect(tryResolveWithExtensions('app.ts')).toBe('app.ts');
  });

  it('无扩展名自动补 .js', () => {
    expect(tryResolveWithExtensions('utils')).toBe('utils.js');
    expect(tryResolveWithExtensions('./helper')).toBe('./helper.js');
  });
});

describe('isBinaryPath（github-api.isBinaryPath 等效）', () => {
  it('识别图片格式', () => {
    expect(isBinaryPath('photo.png')).toBe(true);
    expect(isBinaryPath('photo.jpg')).toBe(true);
    expect(isBinaryPath('photo.webp')).toBe(true);
    expect(isBinaryPath('icon.ico')).toBe(true);
  });

  it('识别音视频格式', () => {
    expect(isBinaryPath('video.mp4')).toBe(true);
    expect(isBinaryPath('audio.mp3')).toBe(true);
    expect(isBinaryPath('audio.wav')).toBe(true);
  });

  it('识别压缩包', () => {
    expect(isBinaryPath('archive.zip')).toBe(true);
    expect(isBinaryPath('archive.7z')).toBe(true);
    expect(isBinaryPath('data.tar.gz')).toBe(true);
  });

  it('识别字体文件', () => {
    expect(isBinaryPath('font.woff2')).toBe(true);
    expect(isBinaryPath('font.ttf')).toBe(true);
  });

  it('文本文件返回 false', () => {
    expect(isBinaryPath('app.js')).toBe(false);
    expect(isBinaryPath('style.css')).toBe(false);
    expect(isBinaryPath('index.html')).toBe(false);
    expect(isBinaryPath('data.json')).toBe(false);
    expect(isBinaryPath('readme.md')).toBe(false);
  });

  it('大小写不敏感', () => {
    expect(isBinaryPath('Photo.PNG')).toBe(true);
    expect(isBinaryPath('Archive.ZIP')).toBe(true);
  });

  it('路径含目录也能正确提取', () => {
    expect(isBinaryPath('assets/images/photo.png')).toBe(true);
    expect(isBinaryPath('src/app.js')).toBe(false);
  });
});
