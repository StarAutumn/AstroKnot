// ============================================================
//  github-api.js 纯函数单元测试
//  isBinaryPath / parseRepoUrl
// ============================================================
import { describe, it, expect } from 'vitest';
import { isBinaryPath, GithubApiClient } from '../modules/AppLibrary/ide/core/github-api.js';

describe('isBinaryPath', () => {
  it('识别图片格式', () => {
    expect(isBinaryPath('photo.png')).toBe(true);
    expect(isBinaryPath('photo.jpg')).toBe(true);
    expect(isBinaryPath('photo.jpeg')).toBe(true);
    expect(isBinaryPath('photo.gif')).toBe(true);
    expect(isBinaryPath('photo.webp')).toBe(true);
    expect(isBinaryPath('icon.ico')).toBe(true);
    expect(isBinaryPath('photo.avif')).toBe(true);
  });

  it('识别音视频格式', () => {
    expect(isBinaryPath('video.mp4')).toBe(true);
    expect(isBinaryPath('audio.mp3')).toBe(true);
    expect(isBinaryPath('audio.wav')).toBe(true);
    expect(isBinaryPath('audio.flac')).toBe(true);
    expect(isBinaryPath('video.mkv')).toBe(true);
  });

  it('识别压缩包', () => {
    expect(isBinaryPath('archive.zip')).toBe(true);
    expect(isBinaryPath('archive.7z')).toBe(true);
    expect(isBinaryPath('archive.tar')).toBe(true);
  });

  it('识别字体文件', () => {
    expect(isBinaryPath('font.woff2')).toBe(true);
    expect(isBinaryPath('font.ttf')).toBe(true);
    expect(isBinaryPath('font.otf')).toBe(true);
  });

  it('识别可执行文件', () => {
    expect(isBinaryPath('app.exe')).toBe(true);
    expect(isBinaryPath('lib.dll')).toBe(true);
    expect(isBinaryPath('lib.node')).toBe(true);
    expect(isBinaryPath('module.wasm')).toBe(true);
  });

  it('文本文件返回 false', () => {
    expect(isBinaryPath('app.js')).toBe(false);
    expect(isBinaryPath('style.css')).toBe(false);
    expect(isBinaryPath('index.html')).toBe(false);
    expect(isBinaryPath('data.json')).toBe(false);
    expect(isBinaryPath('readme.md')).toBe(false);
    expect(isBinaryPath('app.ts')).toBe(false);
    expect(isBinaryPath('app.py')).toBe(false);
  });

  it('大小写不敏感', () => {
    expect(isBinaryPath('Photo.PNG')).toBe(true);
    expect(isBinaryPath('Archive.ZIP')).toBe(true);
  });

  it('路径含目录也能正确提取扩展名', () => {
    expect(isBinaryPath('assets/images/photo.png')).toBe(true);
    expect(isBinaryPath('src/components/app.js')).toBe(false);
  });
});

describe('GithubApiClient.parseRepoUrl', () => {
  const client = new GithubApiClient();

  it('解析 owner/repo 简写', () => {
    const r = client.parseRepoUrl('vuejs/core');
    expect(r.owner).toBe('vuejs');
    expect(r.repo).toBe('core');
    expect(r.ref).toBe('');
    expect(r.subPath).toBe('');
  });

  it('解析 owner/repo@branch 简写', () => {
    const r = client.parseRepoUrl('vuejs/core@main');
    expect(r.owner).toBe('vuejs');
    expect(r.repo).toBe('core');
    expect(r.ref).toBe('main');
  });

  it('解析完整 HTTPS URL', () => {
    const r = client.parseRepoUrl('https://github.com/vuejs/core');
    expect(r.owner).toBe('vuejs');
    expect(r.repo).toBe('core');
  });

  it('解析带分支的 URL', () => {
    const r = client.parseRepoUrl('https://github.com/vuejs/core/tree/v3.4');
    expect(r.owner).toBe('vuejs');
    expect(r.repo).toBe('core');
    expect(r.ref).toBe('v3.4');
  });

  it('解析带子路径的 URL', () => {
    const r = client.parseRepoUrl('https://github.com/vuejs/core/tree/main/packages/vue');
    expect(r.owner).toBe('vuejs');
    expect(r.repo).toBe('core');
    expect(r.ref).toBe('main');
    expect(r.subPath).toBe('packages/vue');
  });

  it('去除 .git 后缀', () => {
    const r = client.parseRepoUrl('https://github.com/vuejs/core.git');
    expect(r.repo).toBe('core');
  });

  it('空输入抛错', () => {
    expect(() => client.parseRepoUrl('')).toThrow();
    expect(() => client.parseRepoUrl(null)).toThrow();
  });

  it('不完整输入抛错', () => {
    expect(() => client.parseRepoUrl('vuejs')).toThrow();
  });

  it('blob URL 抛错（不支持单文件）', () => {
    expect(() => client.parseRepoUrl('https://github.com/vuejs/core/blob/main/README.md')).toThrow();
  });

  it('前后空格被修剪', () => {
    const r = client.parseRepoUrl('  vuejs/core  ');
    expect(r.owner).toBe('vuejs');
    expect(r.repo).toBe('core');
  });
});
