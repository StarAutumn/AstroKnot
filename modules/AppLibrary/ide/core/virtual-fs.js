// ============================================================
//  sandbox-virtual-fs.js — 虚拟文件系统
//  管理节点内的多文件目录结构，支持扁平Map运行时 + 树形序列化
// ============================================================

import { appState } from '../../../module0_AppState.js';

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

    // 获取节点对象
    const node = appState.nodeMap.get(nodeId);
    if (!node) {
      console.warn('[VFS] 未找到节点:', nodeId);
      return false;
    }

    try {
      const result = await window.api.writeSandboxFile(
        projectFolderPath,
        node,
        file.path,
        file.content,
        !!file.isBinary
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

    // 获取节点对象
    const node = appState.nodeMap.get(nodeId);
    if (!node) {
      console.warn('[VFS] 未找到节点:', nodeId);
      return false;
    }

    try {
      const result = await window.api.deleteSandboxFile(
        projectFolderPath,
        node,
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

    // 获取节点对象
    const node = appState.nodeMap.get(nodeId);
    if (!node) {
      console.warn('[VFS] 未找到节点:', nodeId);
      return false;
    }

    try {
      const result = await window.api.renameSandboxFile(
        projectFolderPath,
        node,
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

    // 获取节点对象
    const node = appState.nodeMap.get(nodeId);
    if (!node) {
      console.warn('[VFS] 未找到节点:', nodeId);
      return false;
    }

    try {
      const fileSystem = this.toJSON();
      const result = await window.api.syncSandboxDirectory(
        projectFolderPath,
        node,
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
    // 查找入口 HTML 文件（支持根目录和子目录）
    const entry = _findEntryHtml(this);
    let entryHtml = entry ? (entry.content || '') : '';
    let entryHtmlPath = entry ? entry.path : '';
    let basePath = entry ? entry.basePath : ''; // 入口文件所在目录，如 'dist/' 或 ''

    const vfs = this; // 闭包捕获 VFS 实例，供内联回调使用
    const inlinedPaths = new Set(); // 记录已被内联替换的文件路径，避免重复注入
    if (entryHtmlPath) inlinedPaths.add(entryHtmlPath); // 入口 HTML 本身不再被兜底注入

    // 如果入口 HTML 有 <link> 和 <script> 标签，用内联替换
    if (entryHtml) {
      // 替换 <link rel="stylesheet" href="..."> 为 <style>（兼容 rel/href 任意顺序）
      entryHtml = entryHtml.replace(/<link\s+[^>]*href=["']([^"']+)["'][^>]*>/gi, function (match, href) {
        // 仅处理 stylesheet 和 icon 类型的 link
        if (!/rel=["'](?:stylesheet|icon|shortcut icon|apple-touch-icon)["']/i.test(match)) {
          // 非 CSS/icon 的 link 标签（如 preconnect、manifest），移除避免 404
          if (/rel=["'](?:preconnect|manifest|preload|prefetch|dns-prefetch)["']/i.test(match)) {
            return ''; // 移除外部资源引用
          }
          return match; // 其他 link 保留
        }
        // 跳过外部 URL（http://, https://, //）
        if (/^(https?:)?\/\//i.test(href)) return match;
        const resolved = _resolveAndRead(vfs, href, basePath);
        if (resolved) {
          inlinedPaths.add(resolved.path);
          // icon 类型且有 isBinary → 替换为 data URI
          if (/rel=["'](?:icon|shortcut icon|apple-touch-icon)["']/i.test(match)) {
            const file = vfs._files.get(resolved.path);
            if (file && file.isBinary) {
              const ext = resolved.path.split('.').pop().toLowerCase();
              const mimeMap = { 'ico': 'image/x-icon', 'png': 'image/png', 'jpg': 'image/jpeg', 'gif': 'image/gif', 'svg': 'image/svg+xml' };
              const mime = mimeMap[ext];
              if (mime) return match.replace(href, `data:${mime};base64,${file.content}`);
            }
          }
          return '<style>\n' + _escapeInlineContent(_cleanCssUrls(resolved.content, vfs, basePath), 'style') + '\n</style>';
        }
        return ''; // 无法解析的 link 标签移除，避免 404
      });

      // 替换 <script src="..."></script> 为 <script> 内联
      entryHtml = entryHtml.replace(/<script\s+[^>]*src=["']([^"']+)["'][^>]*><\/script>/gi, function (match, src) {
        // 跳过外部 URL
        if (/^(https?:)?\/\//i.test(src)) return match;
        const resolved = _resolveAndRead(vfs, src, basePath);
        if (resolved) {
          inlinedPaths.add(resolved.path);
          // 仅跳过纯 Node.js 文件（构建工具配置、顶层 require() 等）
          // 注意：不跳过 webpack/UMD 构建产物！HTML 显式引用的 <script src> 是浏览器代码，
          // 跳过 webpack 运行时会导致其他 chunk 报 "block is not defined"
          if (_isNodeJsOnly(resolved.content, resolved.path)) return '';
          // ES6 模块文件（import/export）使用 <script type="module"> 内联，
          // 避免在普通 <script> 中报 "Cannot use import statement outside a module"
          if (_isEsModule(resolved.content)) {
            return '<script type="module">\n' + _escapeInlineContent(resolved.content, 'script') + '\n</script>';
          }
          // 转义 </script> 避免浏览器提前关闭 <script> 标签导致内容截断
          return '<script>\n' + _escapeInlineContent(resolved.content, 'script') + '\n</script>';
        }
        return ''; // 无法解析的 script 标签移除，避免 404
      });
    }

    // 收集未被内联的 CSS（作为兜底注入）
    // 注意：跳过二进制文件和 SCSS/LESS/SASS（它们不是有效的 CSS）
    let css = '';
    for (const [path, file] of this._files) {
      if (path === entryHtmlPath) continue;
      if (inlinedPaths.has(path)) continue;
      if (file.isBinary) continue; // 跳过二进制文件
      if (path.endsWith('.scss') || path.endsWith('.sass') || path.endsWith('.less')) continue;
      if (file.language === 'css' || path.endsWith('.css')) {
        css += '/* ' + path + ' */\n' + _cleanCssUrls(file.content, vfs, basePath) + '\n\n';
      }
    }

    // 收集未被内联的 JS（仅当没有入口 HTML 时才收集）
    // 关键修复：入口 HTML 存在时，不再注入兜底 JS。
    // 任意项目的 .js 文件可能包含 webpack bundles / UMD 模块 / 跨文件变量引用，
    // 内联到单个 <script> 会触发 "block is not defined"、"SyntaxError"、
    // "'+it+' ERR_FILE_NOT_FOUND" 等错误。JS 仅通过 <script src> 显式引用内联（更安全）。
    let js = '';
    let moduleJs = ''; // ES 模块 JS（需要 <script type="module">）
    if (!entryHtml) {
      for (const [path, file] of this._files) {
        if (path === entryHtmlPath) continue;
        if (inlinedPaths.has(path)) continue;
        if (file.isBinary) continue;
        if (file.language === 'javascript' || path.endsWith('.js')) {
          if (_isNodeJsOnly(file.content, path)) continue;
          if (_isEsModule(file.content)) {
            // ES 模块代码放入单独的 <script type="module"> 中
            moduleJs += '// ' + path + '\n' + file.content + '\n\n';
          } else {
            js += '// ' + path + '\n' + file.content + '\n\n';
          }
        }
      }
    }

    // 简单拼接：如果入口 HTML 不存在，构建一个
    if (!entryHtml) {
      const moduleScript = moduleJs ? `\n  <script type="module">\n${_escapeInlineContent(moduleJs, 'script')}\n  </script>` : '';
      entryHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>html,body{margin:0;padding:0;background:#0d1b23;}${_escapeInlineContent(css, 'style')}</style>
</head>
<body>
  <script>${_escapeInlineContent(js, 'script')}</script>${moduleScript}
</body>
</html>`;
    } else {
      // 入口 HTML 存在时，仅注入兜底 CSS（CSS 重复不会报致命错误）
      // 不注入兜底 JS（js 为空）—— 避免内联不兼容的 JS 导致页面崩溃
      if (css) {
        if (/<\/head>/i.test(entryHtml)) {
          entryHtml = entryHtml.replace(/<\/head>/i, '<style>\n' + _escapeInlineContent(css, 'style') + '\n</style>\n</head>');
        } else if (/<head>/i.test(entryHtml)) {
          entryHtml = entryHtml.replace(/<head>/i, '<head>\n<style>\n' + _escapeInlineContent(css, 'style') + '\n</style>');
        }
      }
    }
    for (const [path, file] of this._files) {
      if (!file.isBinary) continue;
      const ext = file.name.split('.').pop().toLowerCase();
      const mimeMap = {
        'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
        'gif': 'image/gif', 'bmp': 'image/bmp', 'ico': 'image/x-icon',
        'webp': 'image/webp', 'svg': 'image/svg+xml',
        'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'ogg': 'audio/ogg',
        'mp4': 'video/mp4', 'webm': 'video/webm',
        'woff': 'font/woff', 'woff2': 'font/woff2', 'ttf': 'font/ttf', 'otf': 'font/otf', 'eot': 'application/vnd.ms-fontobject',
      };
      const mime = mimeMap[ext];
      if (!mime) continue;
      const dataUri = `data:${mime};base64,${file.content}`;

      // 计算从入口 HTML 视角的相对路径（去掉 basePath 前缀）
      let relPath = path;
      if (basePath && path.startsWith(basePath)) {
        relPath = path.substring(basePath.length);
      }

      // 生成多种路径形式进行匹配：path, ./path, /path
      const variants = _getPathVariants(relPath);
      for (const variant of variants) {
        const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // 替换 HTML 中的 src/href 引用
        const srcRegex = new RegExp(`(src|href)=["']${escaped}["']`, 'gi');
        entryHtml = entryHtml.replace(srcRegex, `$1="${dataUri}"`);
        // 替换 CSS url() 引用
        const urlRegex = new RegExp(`url\\(["']?${escaped}["']?\\)`, 'gi');
        entryHtml = entryHtml.replace(urlRegex, `url("${dataUri}")`);
      }
    }

    // 清理无法解析的 <img src="..."> 引用，替换为透明占位图避免 404
    entryHtml = _cleanUnresolvableImgSrc(entryHtml, vfs, basePath);

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
//  辅助函数：入口 HTML 查找、相对路径解析、路径变体生成
// ════════════════════════════════════════════════════════════

/**
 * 查找入口 HTML 文件（支持根目录和子目录）
 * 优先级：根级 index.html → 根级常见入口 → 根级任意 .html → 子目录 index.html（浅优先）→ 子目录任意 .html
 * @param {VirtualFileSystem} vfs
 * @returns {{path:string, content:string, basePath:string} | null}
 */
function _findEntryHtml(vfs) {
  if (!vfs || !vfs._files) return null;

  // 优先级 1: 根级 index.html / index.htm
  for (const name of ['index.html', 'index.htm']) {
    const f = vfs._files.get(name);
    if (f) return { path: name, content: f.content || '', basePath: '' };
  }

  // 优先级 2: 根级其他常见入口名
  const commonNames = ['default.html', 'main.html', 'home.html', 'examples.html', 'demo.html', 'app.html'];
  for (const name of commonNames) {
    const f = vfs._files.get(name);
    if (f) return { path: name, content: f.content || '', basePath: '' };
  }

  // 优先级 3: 根级任意 .html / .htm（不含 /）
  for (const [p, f] of vfs._files) {
    if ((p.endsWith('.html') || p.endsWith('.htm')) && !p.includes('/')) {
      return { path: p, content: f.content || '', basePath: '' };
    }
  }

  // 收集子目录中的 HTML 文件
  const subHtmls = [];
  for (const [p, f] of vfs._files) {
    if ((p.endsWith('.html') || p.endsWith('.htm')) && p.includes('/')) {
      const baseName = p.split('/').pop().toLowerCase();
      const isIndex = (baseName === 'index.html' || baseName === 'index.htm');
      subHtmls.push({
        path: p,
        content: f.content || '',
        depth: (p.match(/\//g) || []).length,
        isIndex: isIndex
      });
    }
  }

  // 优先级 4: 子目录中的 index.html（按深度排序，浅的优先）
  const subIndexes = subHtmls.filter(h => h.isIndex).sort((a, b) => a.depth - b.depth);
  if (subIndexes.length > 0) {
    const e = subIndexes[0];
    const lastSlash = e.path.lastIndexOf('/');
    return { path: e.path, content: e.content, basePath: e.path.substring(0, lastSlash + 1) };
  }

  // 优先级 5: 子目录中的任意 .html（按深度排序，浅的优先）
  const subOthers = subHtmls.filter(h => !h.isIndex).sort((a, b) => a.depth - b.depth);
  if (subOthers.length > 0) {
    const e = subOthers[0];
    const lastSlash = e.path.lastIndexOf('/');
    return { path: e.path, content: e.content, basePath: e.path.substring(0, lastSlash + 1) };
  }

  return null;
}

/**
 * 从虚拟 FS 解析相对路径并读取文件（考虑入口 HTML 所在目录）
 * @param {VirtualFileSystem} vfs
 * @param {string} href - HTML 中的引用路径
 * @param {string} basePath - 入口 HTML 所在目录，如 'dist/'
 * @returns {{path:string, content:string} | null}
 */
function _resolveAndRead(vfs, href, basePath) {
  if (!vfs || !vfs._files) return null;

  // 规范化路径：去掉 ./ 和开头的 /，处理 ../
  let cleanHref = href.replace(/^\.\//, '').replace(/^\//, '');
  // 简单处理 ../：向上跳（去掉 basePath 最后一层）
  while (cleanHref.startsWith('../') && basePath) {
    cleanHref = cleanHref.substring(3);
    // basePath 去掉最后一层目录
    const parts = basePath.split('/').filter(Boolean);
    parts.pop();
    basePath = parts.length > 0 ? parts.join('/') + '/' : '';
  }

  // 尝试 1: basePath + href
  if (basePath) {
    const fullPath = basePath + cleanHref;
    const file = vfs._files.get(fullPath);
    if (file) return { path: fullPath, content: file.content };
  }

  // 尝试 2: 直接匹配
  const file = vfs._files.get(cleanHref);
  if (file) return { path: cleanHref, content: file.content };

  // 尝试 3: 按 basename 模糊匹配（兜底，处理路径前缀差异）
  const baseName = cleanHref.split('/').pop();
  for (const [p, f] of vfs._files) {
    if (p.split('/').pop() === baseName) {
      return { path: p, content: f.content };
    }
  }

  return null;
}

/**
 * 生成路径的多种形式用于正则匹配
 * 输入 'css/style.css' → 返回 ['css/style.css', './css/style.css', '/css/style.css']
 * @param {string} relPath
 * @returns {string[]}
 */
function _getPathVariants(relPath) {
  const variants = [relPath];
  if (!relPath.startsWith('./')) variants.push('./' + relPath);
  if (!relPath.startsWith('/')) variants.push('/' + relPath);
  return [...new Set(variants)];
}

// 透明 1x1 GIF 占位图（用于替换无法解析的 url() 和 img src）
const _TRANSPARENT_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/**
 * 转义内联到 HTML <script> 或 <style> 标签中的内容
 * 防止内容中的 </script> / </style> 被浏览器当作标签结束符，导致内容截断
 * 这是最常见的 JS 内联 bug：var s = "</script>"; 会提前关闭 <script>
 * @param {string} content - 要内联的内容
 * @param {'script'|'style'} tagType - 标签类型
 * @returns {string} 转义后的内容
 */
function _escapeInlineContent(content, tagType) {
  if (!content) return content;
  if (tagType === 'script') {
    // 将 </script> 替换为 <\/script>（JS 中 \/ 等同于 /，不影响执行）
    // 同时处理大小写变体 </SCRIPT>、</Script> 等
    return content.replace(/<\/script/gi, '<\\/script');
  }
  if (tagType === 'style') {
    // 将 </style> 替换为 <\/style>（CSS 中 \/ 无效但不会触发标签闭合）
    return content.replace(/<\/style/gi, '<\\/style');
  }
  return content;
}

/**
 * 清理 CSS 中无法解析的 url() 引用，避免 net::ERR_FILE_NOT_FOUND
 * - 保留 data: URI 和外部 URL（http://, https://, //）
 * - 可在 VFS 中解析的二进制文件 → 替换为 data URI
 * - 无法解析的本地引用 → 替换为透明占位图
 * @param {string} cssContent - CSS 内容
 * @param {VirtualFileSystem} vfs - 虚拟文件系统
 * @param {string} basePath - 入口 HTML 所在目录
 * @returns {string} 清理后的 CSS
 */
function _cleanCssUrls(cssContent, vfs, basePath) {
  if (!cssContent) return cssContent;
  return cssContent.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, function (match, quote, url) {
    // 保留 data URI
    if (/^data:/i.test(url)) return match;
    // 保留外部 URL
    if (/^(https?:)?\/\//i.test(url)) return match;
    // 尝试在 VFS 中解析
    const resolved = _resolveAndRead(vfs, url, basePath);
    if (resolved) {
      // 如果是二进制文件，替换为 data URI
      const file = vfs._files.get(resolved.path);
      if (file && file.isBinary) {
        const ext = resolved.path.split('.').pop().toLowerCase();
        const mimeMap = {
          'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
          'gif': 'image/gif', 'svg': 'image/svg+xml', 'webp': 'image/webp',
          'woff': 'font/woff', 'woff2': 'font/woff2', 'ttf': 'font/ttf', 'otf': 'font/otf',
        };
        const mime = mimeMap[ext];
        if (mime) return `url("data:${mime};base64,${file.content}")`;
      }
      return match; // 文件存在但不是二进制，保留原引用
    }
    // 无法解析 → 替换为透明占位图
    return `url("${_TRANSPARENT_PIXEL}")`;
  });
}

/**
 * 清理 HTML 中无法解析的 <img src="..."> 引用，避免 net::ERR_FILE_NOT_FOUND
 * - 保留外部 URL 和 data: URI
 * - 可在 VFS 中解析的 → 保留
 * - 无法解析的 → 替换 src 为透明占位图
 * @param {string} html - HTML 内容
 * @param {VirtualFileSystem} vfs - 虚拟文件系统
 * @param {string} basePath - 入口 HTML 所在目录
 * @returns {string} 清理后的 HTML
 */
function _cleanUnresolvableImgSrc(html, vfs, basePath) {
  if (!html) return html;
  return html.replace(/<img\s+[^>]*src=["']([^"']+)["'][^>]*>/gi, function (match, src) {
    // 保留外部 URL
    if (/^(https?:)?\/\//i.test(src)) return match;
    // 保留 data: URI
    if (/^data:/i.test(src)) return match;
    // 尝试在 VFS 中解析
    const resolved = _resolveAndRead(vfs, src, basePath);
    if (resolved) return match; // 能解析，保留
    // 无法解析 → 替换 src 为透明占位图
    return match.replace(src, _TRANSPARENT_PIXEL);
  });
}

/**
 * 检测 JS 文件是否为纯 Node.js 文件（不能在浏览器 <script> 中运行）
 * 仅检查 Node.js 专用 API，不检查 webpack/UMD 模式。
 * 用途：<script src> 内联替换 — HTML 显式引用的脚本是浏览器代码，不应跳过 webpack/UMD
 * @param {string} content - 文件内容
 * @param {string} filePath - 文件路径
 * @returns {boolean}
 */
function _isNodeJsOnly(content, filePath) {
  // 1. 文件名模式匹配（构建工具配置文件，绝不是浏览器代码）
  const baseName = filePath.split('/').pop().toLowerCase();
  if (baseName.endsWith('.config.js')) return true;       // webpack/vite/rollup/babel/jest.config.js
  if (baseName === 'gruntfile.js' || baseName === 'gulpfile.js') return true;
  if (baseName === 'karma.conf.js') return true;
  if (baseName.startsWith('.eslintrc') || baseName.startsWith('.babelrc')) return true;
  if (baseName === 'package.json') return true;
  // Server-side 文件
  if (baseName === 'server.js' || baseName === 'app.js') {
    // 仅当内容包含 Node.js 专用 API 时
    if (content && (/^require\s*\(/m.test(content.substring(0, 1000)) || /process\.env\./.test(content.substring(0, 2000)))) {
      return true;
    }
  }

  // 2. 内容模式匹配（纯 Node.js 专用 API，有 typeof 守卫的 UMD 不算）
  if (content) {
    const head = content.substring(0, 3000);
    // 顶层 require() 调用（不是 __webpack_require__）
    if (/^require\s*\(/m.test(head)) return true;
    // process.env 无 typeof 守卫
    if (/process\.env\./.test(head) && !/typeof\s+process/.test(head)) return true;
    // __dirname / __filename 无 typeof 守卫
    if (/__dirname/.test(head) && !/typeof\s+__dirname/.test(head)) return true;
    if (/__filename/.test(head) && !/typeof\s+__filename/.test(head)) return true;
    // 裸 module.exports 无 typeof 守卫（UMD 有 typeof module 守卫）
    if (/module\.exports\s*=/.test(head) && !/typeof\s+module/.test(head)) return true;
    // 裸 exports.xxx 无 typeof 守卫
    if (/exports\.\w+\s*=/.test(head) && !/typeof\s+exports/.test(head)) return true;
  }
  return false;
}

/**
 * 检测 JS 文件是否为 Node.js / 构建工具文件（CommonJS 模块）
 * 这类文件在浏览器 <script> 中会报 "module is not defined"
 * @param {string} content - 文件内容
 * @param {string} filePath - 文件路径
 * @returns {boolean}
 */
function _looksLikeNodeJs(content, filePath) {
  // 1. 文件名模式匹配（明确的构建工具配置文件）
  const baseName = filePath.split('/').pop().toLowerCase();
  if (baseName.endsWith('.config.js')) return true;       // webpack/vite/rollup/babel/jest.config.js
  if (baseName === 'gruntfile.js' || baseName === 'gulpfile.js') return true;
  if (baseName === 'karma.conf.js') return true;
  if (baseName.startsWith('.eslintrc') || baseName.startsWith('.babelrc')) return true;

  // 2. 内容模式匹配（CommonJS / Node.js 专用 API / UMD / webpack 构建产物）
  if (content) {
    const head = content.substring(0, 3000); // 扩大检查范围到前 3000 字符
    // CommonJS
    if (/module\.exports\s*=/.test(head)) return true;
    if (/^require\s*\(/m.test(head)) return true;
    if (/process\.env\./.test(head)) return true;
    if (/__dirname/.test(head)) return true;
    if (/__filename/.test(head)) return true;
    if (/exports\.\w+\s*=/.test(head)) return true;
    // UMD / webpack 构建产物（在浏览器 <script> 中可能因代码分割报 "block is not defined"）
    if (/__webpack_require__/.test(head)) return true;
    if (/webpackChunk/.test(head)) return true;
    if (/webpackUniversalModuleDefinition/.test(head)) return true;
    if (/\bdefine\s*\(\s*\[/.test(head)) return true;  // AMD: define([...], factory)
    if (/\bdefine\s*\(\s*function/.test(head)) return true; // AMD: define(function)
  }
  return false;
}

/**
 * 检测 JS 文件是否使用 ES6 模块语法（import/export）
 * 这类文件在普通 <script> 标签中无法运行，需要 type="module"
 * @param {string} content - 文件内容
 * @returns {boolean}
 */
function _isEsModule(content) {
  if (!content) return false;
  const head = content.substring(0, 5000);
  // 检测 import 语句：
  // - import xxx from '...'      (import + 标识符)
  // - import { xxx } from '...'  (import + {)
  // - import "..."               (import + 字符串，副作用导入)
  // - import * as xxx from '...' (import + *)
  // - import type { ... }        (TypeScript 类型导入)
  if (/^\s*import\s+[*{]/m.test(head)) return true;     // import * / import {
  if (/^\s*import\s+[\w"]/m.test(head)) return true;    // import xxx / import "
  if (/^\s*import\s*\(/m.test(head)) return true;       // 动态 import()
  if (/^\s*import\s*\./m.test(head)) return true;       // import.meta
  // 检测 export 语句（export default, export const, export function, export {, export type）
  if (/^\s*export\s+(default|const|let|var|function|class|\{|type\s)/m.test(head)) return true;
  // 检测 export default function* / export default async function
  if (/^\s*export\s+default\s+(async\s+)?function/m.test(head)) return true;
  return false;
}

console.log('[sandbox-virtual-fs] 模块已加载');
