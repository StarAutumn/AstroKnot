// ============================================================
//  VirtualFileSystem 单元测试
//  测试纯数据操作（不依赖 DOM / Electron / appState）
// ============================================================
import { describe, it, expect, beforeEach } from 'vitest';
import { VirtualFileSystem, extensionToLanguage, migrateHtmlSource } from '../modules/AppLibrary/ide/core/virtual-fs.js';

// ── extensionToLanguage ──

describe('extensionToLanguage', () => {
  it('识别常见扩展名', () => {
    expect(extensionToLanguage('app.js')).toBe('javascript');
    expect(extensionToLanguage('style.css')).toBe('css');
    expect(extensionToLanguage('page.html')).toBe('html');
    expect(extensionToLanguage('data.json')).toBe('json');
    expect(extensionToLanguage('readme.md')).toBe('markdown');
    expect(extensionToLanguage('app.ts')).toBe('typescript');
    expect(extensionToLanguage('app.tsx')).toBe('typescript');
    expect(extensionToLanguage('app.py')).toBe('python');
  });

  it('未知扩展名返回 plaintext', () => {
    expect(extensionToLanguage('data.xyz')).toBe('plaintext');
    expect(extensionToLanguage('file.bin')).toBe('plaintext');
  });

  it('大小写不敏感', () => {
    expect(extensionToLanguage('App.JS')).toBe('javascript');
    expect(extensionToLanguage('Style.CSS')).toBe('css');
  });
});

// ── migrateHtmlSource ──

describe('migrateHtmlSource', () => {
  it('null/undefined 返回默认空文件系统', () => {
    const fs = migrateHtmlSource(null);
    expect(fs.type).toBe('directory');
    expect(fs.name).toBe('/');
    expect(fs.children).toEqual([]);
  });

  it('三字段都为空返回默认文件系统', () => {
    const fs = migrateHtmlSource({ html: '', css: '', js: '' });
    expect(fs.type).toBe('directory');
    expect(fs.children).toEqual([]);
  });

  it('正确迁移 htmlSource 为文件系统树', () => {
    const fs = migrateHtmlSource({
      html: '<h1>Hello</h1>',
      css: 'h1 { color: red; }',
      js: 'console.log(1);'
    });

    expect(fs.type).toBe('directory');
    expect(fs.name).toBe('/');
    expect(fs.children).toHaveLength(3);

    // index.html
    const indexHtml = fs.children.find(c => c.name === 'index.html');
    expect(indexHtml).toBeDefined();
    expect(indexHtml.content).toBe('<h1>Hello</h1>');
    expect(indexHtml.language).toBe('html');

    // styles/main.css
    const stylesDir = fs.children.find(c => c.name === 'styles');
    expect(stylesDir).toBeDefined();
    expect(stylesDir.children[0].content).toBe('h1 { color: red; }');

    // scripts/app.js
    const scriptsDir = fs.children.find(c => c.name === 'scripts');
    expect(scriptsDir).toBeDefined();
    expect(scriptsDir.children[0].content).toBe('console.log(1);');
  });
});

// ── VirtualFileSystem 类 ──

describe('VirtualFileSystem', () => {
  let vfs;

  beforeEach(() => {
    vfs = new VirtualFileSystem({
      type: 'directory',
      name: '/',
      children: [
        { type: 'file', name: 'index.html', content: '<h1>Hello</h1>', language: 'html' },
        { type: 'file', name: 'style.css', content: 'h1{}', language: 'css' },
        {
          type: 'directory',
          name: 'scripts',
          children: [
            { type: 'file', name: 'app.js', content: 'console.log(1)', language: 'javascript' }
          ]
        }
      ]
    });
  });

  // 读取

  describe('getFile / getFileContent', () => {
    it('读取根级文件', () => {
      expect(vfs.getFile('index.html')).not.toBeNull();
      expect(vfs.getFileContent('index.html')).toBe('<h1>Hello</h1>');
    });

    it('读取子目录文件', () => {
      expect(vfs.getFileContent('scripts/app.js')).toBe('console.log(1)');
    });

    it('不存在的文件返回 null', () => {
      expect(vfs.getFile('noexist.txt')).toBeNull();
      expect(vfs.getFileContent('noexist.txt')).toBeNull();
    });
  });

  // 修改

  describe('setFile', () => {
    it('修改已存在文件内容', () => {
      expect(vfs.setFile('index.html', '<h1>World</h1>')).toBe(true);
      expect(vfs.getFileContent('index.html')).toBe('<h1>World</h1>');
    });

    it('修改不存在的文件返回 false', () => {
      expect(vfs.setFile('noexist.txt', 'x')).toBe(false);
    });

    it('修改后标记为脏', () => {
      vfs.setFile('index.html', 'new');
      expect(vfs.getFile('index.html').isDirty).toBe(true);
    });
  });

  // 创建

  describe('createFile', () => {
    it('在根目录创建文件', () => {
      const f = vfs.createFile('', 'readme.md', 'markdown');
      expect(f).not.toBeNull();
      expect(f.name).toBe('readme.md');
      expect(f.content).toBe('');
      expect(f.isDirty).toBe(true);
    });

    it('在子目录创建文件', () => {
      const f = vfs.createFile('scripts', 'util.js', 'javascript');
      expect(f).not.toBeNull();
      expect(f.path).toBe('scripts/util.js');
    });

    it('重复创建返回 null', () => {
      expect(vfs.createFile('', 'index.html', 'html')).toBeNull();
    });

    it('在不存在目录创建返回 null', () => {
      expect(vfs.createFile('noexist', 'file.txt', 'plaintext')).toBeNull();
    });
  });

  describe('createDirectory', () => {
    it('创建新目录', () => {
      expect(vfs.createDirectory('', 'assets')).toBe(true);
      expect(vfs.getDirectoryPaths()).toContain('assets');
    });

    it('重复创建返回 false', () => {
      vfs.createDirectory('', 'assets');
      expect(vfs.createDirectory('', 'assets')).toBe(false);
    });
  });

  // 删除

  describe('deleteFile', () => {
    it('删除已存在文件', () => {
      expect(vfs.deleteFile('index.html')).toBe(true);
      expect(vfs.getFile('index.html')).toBeNull();
    });

    it('删除不存在文件返回 false', () => {
      expect(vfs.deleteFile('noexist.txt')).toBe(false);
    });
  });

  describe('deleteDirectory', () => {
    it('递归删除目录及所有子文件', () => {
      expect(vfs.deleteDirectory('scripts')).toBe(true);
      expect(vfs.getFile('scripts/app.js')).toBeNull();
      expect(vfs.getDirectoryPaths()).not.toContain('scripts');
    });
  });

  // 重命名

  describe('rename', () => {
    it('重命名文件', () => {
      const newPath = vfs.rename('index.html', 'home.html');
      expect(newPath).toBe('home.html');
      expect(vfs.getFile('home.html')).not.toBeNull();
      expect(vfs.getFile('index.html')).toBeNull();
    });

    it('重命名文件时更新语言', () => {
      vfs.rename('index.html', 'index.ts');
      expect(vfs.getFile('index.ts').language).toBe('typescript');
    });

    it('重命名目录并移动子文件', () => {
      const newPath = vfs.rename('scripts', 'js');
      expect(newPath).toBe('js');
      expect(vfs.getFile('js/app.js')).not.toBeNull();
      expect(vfs.getFile('scripts/app.js')).toBeNull();
    });

    it('重名冲突返回 null', () => {
      vfs.createFile('', 'style.css', 'css'); // 已存在
      expect(vfs.rename('index.html', 'style.css')).toBeNull();
    });
  });

  // 移动

  describe('move', () => {
    it('移动文件到另一目录', () => {
      vfs.createDirectory('', 'dist');
      const newPath = vfs.move('style.css', 'dist');
      expect(newPath).toBe('dist/style.css');
      expect(vfs.getFile('dist/style.css')).not.toBeNull();
      expect(vfs.getFile('style.css')).toBeNull();
    });

    it('移动不存在的文件返回 null', () => {
      expect(vfs.move('noexist.txt', 'scripts')).toBeNull();
    });
  });

  // 序列化

  describe('toJSON', () => {
    it('序列化后可还原完整树结构', () => {
      const json = vfs.toJSON();
      expect(json.type).toBe('directory');
      expect(json.name).toBe('/');
      expect(json.children.length).toBeGreaterThanOrEqual(2);

      // 重新构造验证往返一致性
      const vfs2 = new VirtualFileSystem(json);
      expect(vfs2.getFileContent('index.html')).toBe('<h1>Hello</h1>');
      expect(vfs2.getFileContent('scripts/app.js')).toBe('console.log(1)');
    });

    it('目录排序在文件前', () => {
      const json = vfs.toJSON();
      const firstChild = json.children[0];
      expect(firstChild.type).toBe('directory');
    });
  });

  // 入口点

  describe('getEntryPoint', () => {
    it('优先返回 index.html', () => {
      expect(vfs.getEntryPoint()).toBe('index.html');
    });

    it('无 index.html 时回退到第一个 .html', () => {
      vfs.deleteFile('index.html');
      // style.css 不是 html，所以入口应找不到 html 文件
      // 但还有其他文件，回退到第一个文件
      const entry = vfs.getEntryPoint();
      expect(entry).not.toBeNull();
    });
  });

  // 脏标记

  describe('dirty tracking', () => {
    it('新建文件系统所有文件都是干净的', () => {
      expect(vfs.hasDirtyFiles()).toBe(false);
    });

    it('修改文件后变为脏', () => {
      vfs.setFile('index.html', 'changed');
      expect(vfs.hasDirtyFiles()).toBe(true);
      expect(vfs.getDirtyFiles()).toHaveLength(1);
    });

    it('markClean 清除单个脏标记', () => {
      vfs.setFile('index.html', 'changed');
      vfs.markClean('index.html');
      expect(vfs.getFile('index.html').isDirty).toBe(false);
    });

    it('markAllClean 清除所有脏标记', () => {
      vfs.setFile('index.html', 'a');
      vfs.setFile('style.css', 'b');
      vfs.markAllClean();
      expect(vfs.hasDirtyFiles()).toBe(false);
    });
  });

  // 展开/折叠

  describe('expand/collapse', () => {
    it('toggleExpanded 切换状态', () => {
      expect(vfs.isExpanded('scripts')).toBe(false);
      expect(vfs.toggleExpanded('scripts')).toBe(true);
      expect(vfs.isExpanded('scripts')).toBe(true);
      expect(vfs.toggleExpanded('scripts')).toBe(false);
    });

    it('expandAll 展开所有目录', () => {
      vfs.expandAll();
      expect(vfs.isExpanded('scripts')).toBe(true);
    });
  });

  // 二进制文件检测

  describe('isBinaryFile', () => {
    it('识别常见图片格式', () => {
      expect(VirtualFileSystem.isBinaryFile('photo.png')).toBe(true);
      expect(VirtualFileSystem.isBinaryFile('photo.jpg')).toBe(true);
      expect(VirtualFileSystem.isBinaryFile('photo.gif')).toBe(true);
      expect(VirtualFileSystem.isBinaryFile('icon.svg')).toBe(true);
    });

    it('非二进制文件返回 false', () => {
      expect(VirtualFileSystem.isBinaryFile('app.js')).toBe(false);
      expect(VirtualFileSystem.isBinaryFile('style.css')).toBe(false);
    });
  });
});
