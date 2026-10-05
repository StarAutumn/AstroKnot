// ============================================================
//  sandbox-virtual-fs.js — 虚拟文件系统
//  管理节点内的多文件目录结构，支持扁平Map运行时 + 树形序列化
//  磁盘同步（vfs-disk-sync.js）与打包构建（vfs-bundle.js）已拆分为独立
//  模块，以原型混入方式挂载到 VirtualFileSystem.prototype（见文件末尾）
// ============================================================

import { bundleMethods } from './vfs-bundle.js';
import { diskSyncMethods } from './vfs-disk-sync.js';

// ════════════════════════════════════════════════════════════
//  文件扩展名 → Monaco 语言 ID 映射
// ════════════════════════════════════════════════════════════

const _extToLang = {
  'html': 'html', 'htm': 'html',
  'css': 'css', 'scss': 'scss', 'less': 'less', 'sass': 'sass',
  'js': 'javascript', 'mjs': 'javascript', 'cjs': 'javascript',
  'ts': 'typescript', 'tsx': 'typescript',
  'jsx': 'javascript',
  'json': 'json',
  'md': 'markdown', 'mdx': 'markdown',
  'py': 'python',
  'xml': 'xml', 'svg': 'xml',
  'yaml': 'yaml', 'yml': 'yaml',
  'txt': 'plaintext',
  'sh': 'shell', 'bash': 'shell',
  'sql': 'sql',
  'graphql': 'graphql', 'gql': 'graphql',
  'vue': 'html',
  'svelte': 'html',
};

export function extensionToLanguage(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  return _extToLang[ext] || 'plaintext';
}

// ════════════════════════════════════════════════════════════
//  旧版 htmlSource → 新版 fileSystem 迁移
// ════════════════════════════════════════════════════════════

export function migrateHtmlSource(htmlSource) {
  if (!htmlSource) {
    return _defaultFileSystem();
  }

  const html = htmlSource.html || '';
  const css = htmlSource.css || '';
  const js = htmlSource.js || '';

  // 如果三个都为空，返回默认模板
  if (!html && !css && !js) {
    return _defaultFileSystem();
  }

  return {
    type: 'directory',
    name: '/',
    children: [
      {
        type: 'file',
        name: 'index.html',
        content: html,
        language: 'html'
      },
      {
        type: 'directory',
        name: 'styles',
        children: [
          {
            type: 'file',
            name: 'main.css',
            content: css,
            language: 'css'
          }
        ]
      },
      {
        type: 'directory',
        name: 'scripts',
        children: [
          {
            type: 'file',
            name: 'app.js',
            content: js,
            language: 'javascript'
          }
        ]
      }
    ]
  };
}

function _defaultFileSystem() {
  return {
    type: 'directory',
    name: '/',
    children: []
  };
}

// ════════════════════════════════════════════════════════════
//  VirtualFileSystem 类
//  运行时使用扁平 Map（路径 → 文件信息），序列化时转回树形
// ════════════════════════════════════════════════════════════

export class VirtualFileSystem {
  constructor(treeData) {
    // 扁平 Map: path → { path, name, content, language, isDirty }
    this._files = new Map();
    // 目录集合: path → true
    this._dirs = new Set();
    // 记录展开状态
    this._expandedDirs = new Set();

    if (treeData) {
      this._flattenTree(treeData, '');
    }
  }

  // ── 树形 → 扁平 ──

  _flattenTree(node, parentPath) {
    if (node.type === 'file') {
      const filePath = parentPath ? parentPath + '/' + node.name : node.name;
      this._files.set(filePath, {
        path: filePath,
        name: node.name,
        content: node.content || '',
        language: node.language || extensionToLanguage(node.name),
        isBinary: !!node.isBinary,
        isDirty: false
      });
      return;
    }

    if (node.type === 'directory') {
      const dirPath = parentPath ? parentPath + '/' + node.name : node.name;
      // 根目录为空字符串
      const actualPath = node.name === '/' ? '' : dirPath;
      if (actualPath) {
        this._dirs.add(actualPath);
      }

      if (node.children && Array.isArray(node.children)) {
        for (const child of node.children) {
          this._flattenTree(child, actualPath);
        }
      }
    }
  }

  // ── 扁平 → 树形（序列化） ──

  toJSON() {
    return this._buildTree('');
  }

  _buildTree(dirPath) {
    const children = [];

    // 收集直接子项
    const directChildren = this._getDirectChildren(dirPath);

    for (const entry of directChildren) {
      if (entry.isDirectory) {
        children.push(this._buildTree(entry.path));
      } else {
        const file = this._files.get(entry.path);
        if (file) {
          children.push({
            type: 'file',
            name: file.name,
            content: file.content,
            language: file.language,
            isBinary: !!file.isBinary
          });
        }
      }
    }

    // 排序：目录在前，文件在后，同类型按名称排序
    children.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    if (dirPath === '') {
      return {
        type: 'directory',
        name: '/',
        children: children
      };
    }

    const name = dirPath.split('/').pop();
    return {
      type: 'directory',
      name: name,
      children: children
    };
  }

  _getDirectChildren(dirPath) {
    const result = [];
    const prefix = dirPath ? dirPath + '/' : '';

    // 直接子目录
    for (const dPath of this._dirs) {
      if (dPath === dirPath) continue;
      if (!dPath.startsWith(prefix)) continue;
      const rest = dPath.substring(prefix.length);
      if (!rest.includes('/')) {
        result.push({ path: dPath, isDirectory: true });
      }
    }

    // 直接子文件
    for (const [fPath] of this._files) {
      if (!fPath.startsWith(prefix)) continue;
      const rest = fPath.substring(prefix.length);
      if (!rest.includes('/')) {
        result.push({ path: fPath, isDirectory: false });
      }
    }

    return result;
  }

  // ── 文件操作 ──

  getFile(path) {
    return this._files.get(path) || null;
  }

  getFileContent(path) {
    const f = this._files.get(path);
    return f ? f.content : null;
  }

  setFile(path, content) {
    const f = this._files.get(path);
    if (f) {
      f.content = content;
      f.isDirty = true;
      return true;
    }
    return false;
  }

  /**
   * 设置二进制文件内容（base64 编码）
   * @param {string} path - 文件路径
   * @param {string} base64Content - base64 编码的内容
   * @returns {boolean}
   */
  setBinaryFile(path, base64Content) {
    const f = this._files.get(path);
    if (f) {
      f.content = base64Content;
      f.isBinary = true;
      f.isDirty = true;
      return true;
    }
    return false;
  }

  createFile(dirPath, name, language) {
    const filePath = dirPath ? dirPath + '/' + name : name;
    if (this._files.has(filePath)) return null; // 已存在
    if (dirPath && !this._dirs.has(dirPath)) return null; // 目录不存在

    const entry = {
      path: filePath,
      name: name,
      content: '',
      language: language || extensionToLanguage(name),
      isBinary: false,
      isDirty: true
    };
    this._files.set(filePath, entry);
    return entry;
  }

  createDirectory(dirPath, name) {
    const newDirPath = dirPath ? dirPath + '/' + name : name;
    if (this._dirs.has(newDirPath)) return false; // 已存在

    this._dirs.add(newDirPath);
    this._expandedDirs.add(newDirPath);
    return true;
  }

  deleteFile(path) {
    return this._files.delete(path);
  }

  deleteDirectory(path) {
    const prefix = path + '/';
    // 收集要删除的文件路径（快照，避免迭代时修改 Map）
    const filesToRemove = [];
    for (const [fPath] of this._files) {
      if (fPath.startsWith(prefix)) {
        filesToRemove.push(fPath);
      }
    }
    for (const fPath of filesToRemove) {
      this._files.delete(fPath);
    }
    // 收集要删除的子目录（快照）
    const dirsToRemove = [];
    for (const dPath of this._dirs) {
      if (dPath === path || dPath.startsWith(prefix)) {
        dirsToRemove.push(dPath);
      }
    }
    for (const dPath of dirsToRemove) {
      this._dirs.delete(dPath);
      this._expandedDirs.delete(dPath);
    }
    return true;
  }

  rename(oldPath, newName) {
    // 文件重命名
    const file = this._files.get(oldPath);
    if (file) {
      const parts = oldPath.split('/');
      parts[parts.length - 1] = newName;
      const newPath = parts.join('/');
      if (this._files.has(newPath)) return null;
      this._files.delete(oldPath);
      file.path = newPath;
      file.name = newName;
      file.language = extensionToLanguage(newName);
      this._files.set(newPath, file);
      return newPath;
    }

    // 目录重命名
    if (this._dirs.has(oldPath)) {
      const parts = oldPath.split('/');
      parts[parts.length - 1] = newName;
      const newPath = parts.join('/');
      if (this._dirs.has(newPath)) return null;

      const oldPrefix = oldPath + '/';
      const newPrefix = newPath + '/';

      // 重命名所有子文件
      const filesToMove = [];
      for (const [fPath, fData] of this._files) {
        if (fPath.startsWith(oldPrefix)) {
          filesToMove.push({ oldPath: fPath, data: fData });
        }
      }
      for (const { oldPath: op, data: fd } of filesToMove) {
        this._files.delete(op);
        fd.path = newPath + fd.path.substring(oldPath.length);
        this._files.set(fd.path, fd);
      }

      // 重命名所有子目录
      const dirsToMove = [];
      for (const dPath of this._dirs) {
        if (dPath === oldPath || dPath.startsWith(oldPrefix)) {
          dirsToMove.push(dPath);
        }
      }
      for (const dPath of dirsToMove) {
        this._dirs.delete(dPath);
        const nd = newPath + dPath.substring(oldPath.length);
        this._dirs.add(nd);
      }

      // 更新展开状态
      if (this._expandedDirs.has(oldPath)) {
        this._expandedDirs.delete(oldPath);
        this._expandedDirs.add(newPath);
      }

      return newPath;
    }

    return null;
  }

  move(fromPath, toDirPath) {
    const file = this._files.get(fromPath);
    if (!file) return null;
    if (toDirPath && !this._dirs.has(toDirPath)) return null;

    const newPath = toDirPath ? toDirPath + '/' + file.name : file.name;
    if (this._files.has(newPath)) return null;

    this._files.delete(fromPath);
    file.path = newPath;
    this._files.set(newPath, file);
    return newPath;
  }

  // ── 查询 ──

  listDirectory(dirPath) {
    return this._getDirectChildren(dirPath);
  }

  /**
   * 获取指定目录下的直接子项列表（用于面包屑下拉）
   * @param {string} dirPath - 目录路径（空字符串表示根目录）
   * @returns {Array<{name: string, type: string, path: string}>}
   */
  getSiblings(dirPath) {
    const children = this._getDirectChildren(dirPath);
    return children.map(c => ({
      name: c.path.split('/').pop(),
      type: c.isDirectory ? 'directory' : 'file',
      path: c.path
    }));
  }

  /**
   * 判断文件是否为二进制文件（图片等）
   * @param {string} filePath
   * @returns {boolean}
   */
  static isBinaryFile(filePath) {
    const ext = filePath.split('.').pop().toLowerCase();
    return ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'avif'].includes(ext);
  }

  getEntryPoint() {
    // 优先查找 index.html
    if (this._files.has('index.html')) return 'index.html';
    // 回退：找第一个 .html 文件
    for (const [path, file] of this._files) {
      if (path.endsWith('.html')) return path;
    }
    // 再回退：找第一个文件
    for (const [path] of this._files) {
      return path;
    }
    return null;
  }

  getAllFiles() {
    return new Map(this._files);
  }

  getFilePaths() {
    return Array.from(this._files.keys());
  }

  getDirectoryPaths() {
    return Array.from(this._dirs);
  }

  // ── 展开/折叠状态 ──

  isExpanded(dirPath) {
    return this._expandedDirs.has(dirPath);
  }

  toggleExpanded(dirPath) {
    if (this._expandedDirs.has(dirPath)) {
      this._expandedDirs.delete(dirPath);
      return false;
    } else {
      this._expandedDirs.add(dirPath);
      return true;
    }
  }

  expandAll() {
    for (const dPath of this._dirs) {
      this._expandedDirs.add(dPath);
    }
  }

  // ── 脏标记 ──

  markClean(path) {
    const f = this._files.get(path);
    if (f) f.isDirty = false;
  }

  markAllClean() {
    for (const [, f] of this._files) {
      f.isDirty = false;
    }
  }

  getDirtyFiles() {
    const result = [];
    for (const [, f] of this._files) {
      if (f.isDirty) result.push(f);
    }
    return result;
  }

  hasDirtyFiles() {
    for (const [, f] of this._files) {
      if (f.isDirty) return true;
    }
    return false;
  }
}

// ── 原型混入：磁盘同步（vfs-disk-sync.js）+ 打包构建（vfs-bundle.js） ──
// 方法体使用 this 访问实例状态，原型混入与写在 class 体内完全等价
Object.assign(VirtualFileSystem.prototype, bundleMethods, diskSyncMethods);

console.log('[sandbox-virtual-fs] 模块已加载');
