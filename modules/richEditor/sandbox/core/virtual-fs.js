// ============================================================
//  sandbox-virtual-fs.js — 虚拟文件系统
//  管理节点内的多文件目录结构，支持扁平Map运行时 + 树形序列化
// ============================================================

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
    children: [
      {
        type: 'file',
        name: 'index.html',
        content: '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>App</title>\n  <link rel="stylesheet" href="styles/main.css">\n</head>\n<body>\n  <div id="app">\n    <h1>Hello World</h1>\n  </div>\n  <script src="scripts/app.js"></script>\n</body>\n</html>',
        language: 'html'
      },
      {
        type: 'directory',
        name: 'styles',
        children: [
          {
            type: 'file',
            name: 'main.css',
            content: '#app {\n  font-family: sans-serif;\n  padding: 20px;\n}\n\nh1 {\n  color: #0ff;\n}',
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
            content: 'console.log("Hello from app.js!");',
            language: 'javascript'
          }
        ]
      }
    ]
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
            language: file.language
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

  createFile(dirPath, name, language) {
    const filePath = dirPath ? dirPath + '/' + name : name;
    if (this._files.has(filePath)) return null; // 已存在
    if (dirPath && !this._dirs.has(dirPath)) return null; // 目录不存在

    const entry = {
      path: filePath,
      name: name,
      content: '',
      language: language || extensionToLanguage(name),
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

  // ── 实时磁盘同步（增量写入） ──
  // 注意：以下方法依赖 window.api，仅在渲染进程可用时生效

  /**
   * 写入单个文件到磁盘
   * @param {string|null} projectFolderPath - 项目文件夹路径（null 表示未保存项目，写入临时目录）
   * @param {string} nodeId - 节点 ID
   * @param {string} filePath - VFS 文件路径
   * @returns {Promise<boolean>}
   */
  async writeSingleFileToDisk(projectFolderPath, nodeId, filePath) {
    const file = this._files.get(filePath);
    if (!file) return false;
    if (!window.api || !window.api.writeSandboxFile) return false;

    try {
      const result = await window.api.writeSandboxFile(
        projectFolderPath,
        nodeId,
        file.path,
        file.content
      );

      if (result.success) {
        file.isDirty = false;  // 标记为已保存
        return true;
      }
      console.error('[VFS] 写入文件失败:', result.error);
      return false;
    } catch (err) {
      console.error('[VFS] 写入文件异常:', err);
      return false;
    }
  }

  /**
   * 删除磁盘上的单个文件
   * @param {string|null} projectFolderPath - 项目文件夹路径
   * @param {string} nodeId - 节点 ID
   * @param {string} filePath - VFS 文件路径
   * @returns {Promise<boolean>}
   */
  async deleteSingleFileFromDisk(projectFolderPath, nodeId, filePath) {
    if (!window.api || !window.api.deleteSandboxFile) return false;

    try {
      const result = await window.api.deleteSandboxFile(
        projectFolderPath,
        nodeId,
        filePath
      );
      return result.success;
    } catch (err) {
      console.error('[VFS] 删除文件异常:', err);
      return false;
    }
  }

  /**
   * 重命名磁盘上的文件
   * @param {string|null} projectFolderPath - 项目文件夹路径
   * @param {string} nodeId - 节点 ID
   * @param {string} oldPath - 旧路径
   * @param {string} newPath - 新路径
   * @returns {Promise<boolean>}
   */
  async renameSingleFileOnDisk(projectFolderPath, nodeId, oldPath, newPath) {
    if (!window.api || !window.api.renameSandboxFile) return false;

    try {
      const result = await window.api.renameSandboxFile(
        projectFolderPath,
        nodeId,
        oldPath,
        newPath
      );
      return result.success;
    } catch (err) {
      console.error('[VFS] 重命名文件异常:', err);
      return false;
    }
  }

  /**
   * 同步整个文件系统到磁盘（用于项目保存或全量同步）
   * @param {string|null} projectFolderPath - 项目文件夹路径
   * @param {string} nodeId - 节点 ID
   * @returns {Promise<boolean>}
   */
  async syncAllToDisk(projectFolderPath, nodeId) {
    if (!window.api || !window.api.syncSandboxDirectory) return false;

    try {
      const fileSystem = this.toJSON();
      const result = await window.api.syncSandboxDirectory(
        projectFolderPath,
        nodeId,
        fileSystem
      );

      if (result.success) {
        // 标记所有文件为已保存
        for (const file of this._files.values()) {
          file.isDirty = false;
        }
        return true;
      }
      return false;
    } catch (err) {
      console.error('[VFS] 同步目录异常:', err);
      return false;
    }
  }

  // ── 构建可运行的 HTML（简单模式，无 esbuild） ──

  buildSimpleHtml() {
    // 查找入口 HTML 文件
    let entryHtml = this.getFileContent('index.html') || '';
    const vfs = this; // 闭包捕获 VFS 实例，供内联回调使用
    const inlinedPaths = new Set(); // 记录已被内联替换的文件路径，避免重复注入

    // 如果入口 HTML 有 <link> 和 <script> 标签，用内联替换
    if (entryHtml) {
      // 替换 <link rel="stylesheet" href="..."> 为 <style>
      entryHtml = entryHtml.replace(/<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*\/?>/gi, function (match, href) {
        const cssContent = _resolveAndRead(vfs, href);
        if (cssContent) {
          inlinedPaths.add(href.replace(/^\.\//, '').replace(/^\//, ''));
          return '<style>\n' + cssContent + '\n</style>';
        }
        return match;
      });

      // 替换 <script src="..."></script> 为 <script> 内联
      entryHtml = entryHtml.replace(/<script\s+[^>]*src=["']([^"']+)["'][^>]*><\/script>/gi, function (match, src) {
        const jsContent = _resolveAndRead(vfs, src);
        if (jsContent) {
          inlinedPaths.add(src.replace(/^\.\//, '').replace(/^\//, ''));
          return '<script>\n' + jsContent + '\n</script>';
        }
        return match;
      });
    }

    // 收集未被内联的 CSS 和 JS 文件内容（作为兜底注入）
    let css = '';
    let js = '';
    for (const [path, file] of this._files) {
      if (path === 'index.html') continue;
      if (inlinedPaths.has(path)) continue; // 已被内联替换的文件不再收集
      if (file.language === 'css' || path.endsWith('.css')) {
        css += '/* ' + path + ' */\n' + file.content + '\n\n';
      }
      if (file.language === 'javascript' || path.endsWith('.js')) {
        js += '// ' + path + '\n' + file.content + '\n\n';
      }
    }

    // 简单拼接：如果入口 HTML 不存在，构建一个
    if (!entryHtml) {
      entryHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>${css}</style>
</head>
<body>
  <script>${js}</script>
</body>
</html>`;
    } else {
      // 在 </head> 前注入未被内联的 CSS，在 </body> 前注入未被内联的 JS
      if (css && !entryHtml.includes('<style>')) {
        entryHtml = entryHtml.replace('</head>', '<style>\n' + css + '\n</style>\n</head>');
      }
      if (js && !entryHtml.includes('<script>')) {
        entryHtml = entryHtml.replace('</body>', '<script>\n' + js + '\n</script>\n</body>');
      }
    }

    return entryHtml;
  }

  /**
   * 检测项目是否需要 esbuild 打包（JS 文件含 import/export）
   */
  needsEsbuild() {
    for (const [path, file] of this._files) {
      if (file.language === 'javascript' || file.language === 'typescript' ||
          path.endsWith('.js') || path.endsWith('.mjs') || path.endsWith('.ts') || path.endsWith('.tsx')) {
        const content = file.content || '';
        if (/\bimport\s+/.test(content) || /\bexport\s+/.test(content)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * 获取所有 JS/TS 文件（供 esbuild 使用）
   */
  getScriptFiles() {
    const result = [];
    for (const [path, file] of this._files) {
      if (file.language === 'javascript' || file.language === 'typescript' ||
          path.endsWith('.js') || path.endsWith('.mjs') || path.endsWith('.ts') || path.endsWith('.tsx')) {
        result.push({ path, content: file.content, language: file.language });
      }
    }
    return result;
  }
}

// ════════════════════════════════════════════════════════════
//  辅助函数：从虚拟 FS 解析相对路径并读取文件
// ════════════════════════════════════════════════════════════

function _resolveAndRead(vfs, href) {
  // 简单路径解析：去掉 styles/ 或 scripts/ 前缀
  let path = href.replace(/^\.\//, '').replace(/^\//, '');
  // 尝试直接匹配
  if (vfs && vfs._files) {
    const file = vfs._files.get(path);
    if (file) return file.content;
  }
  return null;
}

console.log('[sandbox-virtual-fs] 模块已加载');
