// ============================================================
//  file-icons.js 纯函数单元测试
//  getFileIconSVG / getFolderIconSVG — 纯映射，零依赖
// ============================================================
import { describe, it, expect } from 'vitest';
import { getFileIconSVG, getFolderIconSVG } from '../modules/AppLibrary/ide/core/file-icons.js';

describe('getFileIconSVG', () => {
  it('返回 SVG 字符串', () => {
    const svg = getFileIconSVG('app.js');
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });

  it('按扩展名匹配图标', () => {
    const js = getFileIconSVG('app.js');
    const css = getFileIconSVG('style.css');
    const html = getFileIconSVG('index.html');
    // 不同类型图标不同
    expect(js).not.toBe(css);
    expect(js).not.toBe(html);
  });

  it('特殊文件名优先匹配', () => {
    const pkg = getFileIconSVG('package.json');
    const env = getFileIconSVG('.env');
    // package.json 应该用 JSON 图标，不是 default
    expect(pkg).toContain('<svg');
    expect(env).toContain('<svg');
  });

  it('路径含目录也能正确提取文件名', () => {
    const a = getFileIconSVG('src/app.js');
    const b = getFileIconSVG('app.js');
    expect(a).toBe(b);
  });

  it('大小写不敏感', () => {
    expect(getFileIconSVG('App.JS')).toBe(getFileIconSVG('app.js'));
    expect(getFileIconSVG('Style.CSS')).toBe(getFileIconSVG('style.css'));
  });

  it('未知扩展名使用默认图标', () => {
    const def = getFileIconSVG('readme.xyz');
    expect(def).toContain('<svg');
    // 默认图标应该有内容（不是空串）
    expect(def.length).toBeGreaterThan(10);
  });

  it('别名扩展名共享同一图标', () => {
    // jpg/jpeg 应该同 png 同类（都是图片）
    expect(getFileIconSVG('photo.jpg')).toBe(getFileIconSVG('photo.jpeg'));
    // mjs/cjs 和 js 同图标
    expect(getFileIconSVG('app.mjs')).toBe(getFileIconSVG('app.js'));
    expect(getFileIconSVG('app.cjs')).toBe(getFileIconSVG('app.js'));
    // tsx 和 ts 同图标
    expect(getFileIconSVG('app.tsx')).toBe(getFileIconSVG('app.ts'));
    // scss/less 和 css 同图标
    expect(getFileIconSVG('style.scss')).toBe(getFileIconSVG('style.css'));
    expect(getFileIconSVG('style.less')).toBe(getFileIconSVG('style.css'));
  });

  it('所有常用语言都有图标', () => {
    const commonExts = ['js', 'ts', 'py', 'html', 'css', 'json', 'md', 'svg',
      'png', 'txt', 'xml', 'yml', 'sh', 'sql', 'vue', 'go', 'rs', 'java',
      'cpp', 'php', 'swift', 'kt', 'dart'];
    for (const ext of commonExts) {
      const svg = getFileIconSVG(`file.${ext}`);
      expect(svg).toContain('<svg');
    }
  });
});

describe('getFolderIconSVG', () => {
  it('展开和折叠返回不同图标', () => {
    const open = getFolderIconSVG(true);
    const closed = getFolderIconSVG(false);
    expect(open).not.toBe(closed);
  });

  it('都包含 SVG 标记', () => {
    expect(getFolderIconSVG(true)).toContain('<svg');
    expect(getFolderIconSVG(false)).toContain('<svg');
  });

  it('包含文件夹 CSS 类名', () => {
    expect(getFolderIconSVG(true)).toContain('folder-icon-svg');
    expect(getFolderIconSVG(false)).toContain('folder-icon-svg');
  });
});
