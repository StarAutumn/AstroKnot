// ============================================================
//  main/ipc-file/helpers.js — IPC 文件工具函数
// ============================================================
const path = require('path');
const fs = require('fs');

// ── 二进制文件扩展名集合（用于应用库读取时区分文本/二进制）──
const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'webp', 'tiff', 'tif', 'svg',
  'mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma',
  'mp4', 'webm', 'avi', 'mov', 'mkv', 'wmv', 'flv',
  'zip', 'gz', 'tar', 'rar', '7z', 'bz2',
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  'pdf', 'exe', 'dll', 'so', 'dylib', 'bin', 'dat',
  'psd', 'ai', 'sketch', 'xd',
]);

function extractDataUriExt(dataUri) {
  const m = dataUri.match(/^data:(?:image|video|audio)\/([\w+]+);/);
  if (!m) return 'bin';
  let ext = m[1].toLowerCase();
  if (ext === 'jpeg') ext = 'jpg';
  return ext;
}

function dataUriToBuffer(dataUri) {
  const base64 = dataUri.split(',')[1];
  if (!base64) return Buffer.alloc(0);
  return Buffer.from(base64, 'base64');
}

function bufferToDataUri(filePath, buffer) {
  const ext = path.extname(filePath).toLowerCase().slice(1);
  const mimeMap = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
    svg: 'image/svg+xml', mp4: 'video/mp4', webm: 'video/webm',
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
    m4a: 'audio/mp4', flac: 'audio/flac'
  };
  const mime = mimeMap[ext] || 'application/octet-stream';
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

/**
 * 保存 overlay 数据到节点 overlays 目录
 */
function saveOverlays(overlaysDir, overlays) {
  fs.mkdirSync(overlaysDir, { recursive: true });
  const manifest = [];
  let imgIdx = 0, vidIdx = 0, audIdx = 0, excIdx = 0, docIdx = 0;

  for (const overlay of overlays) {
    const item = { ...overlay };

    if ((item.type === 'image' || !item.type) && item.src && item.src.startsWith('data:')) {
      imgIdx++;
      const ext = extractDataUriExt(item.src);
      const fileName = `overlay_${String(imgIdx).padStart(3, '0')}.${ext}`;
      fs.writeFileSync(path.join(overlaysDir, fileName), dataUriToBuffer(item.src));
      item.src = fileName;
    } else if (item.type === 'video' && item.src && item.src.startsWith('data:')) {
      vidIdx++;
      const ext = extractDataUriExt(item.src);
      const fileName = `video_${String(vidIdx).padStart(3, '0')}.${ext}`;
      fs.writeFileSync(path.join(overlaysDir, fileName), dataUriToBuffer(item.src));
      item.src = fileName;
    } else if (item.type === 'audio' && item.src && item.src.startsWith('data:')) {
      audIdx++;
      const ext = extractDataUriExt(item.src);
      const fileName = `audio_${String(audIdx).padStart(3, '0')}.${ext}`;
      fs.writeFileSync(path.join(overlaysDir, fileName), dataUriToBuffer(item.src));
      item.src = fileName;
    }

    if (item.type === 'document' && item.src && item.src.startsWith('data:')) {
      docIdx++;
      const ext = extractDataUriExt(item.src);
      const fileName = `doc_${String(docIdx).padStart(3, '0')}.${ext}`;
      fs.writeFileSync(path.join(overlaysDir, fileName), dataUriToBuffer(item.src));
      item.src = fileName;
    }

    if (item.type === 'excel' && item.univerSnapshot) {
      excIdx++;
      const fileName = `excel_${String(excIdx).padStart(3, '0')}.json`;
      fs.writeFileSync(
        path.join(overlaysDir, fileName),
        JSON.stringify(item.univerSnapshot),
        'utf-8'
      );
      item.univerSnapshotFile = fileName;
      delete item.univerSnapshot;
    }

    if (item.type === 'slideshow' && item.slides) {
      let slideIdx = 0;
      for (const slide of item.slides) {
        if (slide.src && slide.src.startsWith('data:')) {
          slideIdx++;
          const ext = extractDataUriExt(slide.src);
          const fileName = `slide_${String(slideIdx).padStart(3, '0')}.${ext}`;
          fs.writeFileSync(path.join(overlaysDir, fileName), dataUriToBuffer(slide.src));
          slide.src = fileName;
        }
      }
    }

    manifest.push(item);
  }

  fs.writeFileSync(
    path.join(overlaysDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf-8'
  );
}

/**
 * 从节点 overlays 目录加载 overlay 数据
 */
function loadOverlays(overlaysDir) {
  const manifestPath = path.join(overlaysDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return null;

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

  for (const item of manifest) {
    if ((item.type === 'image' || !item.type) && item.src && !item.src.startsWith('data:') && !item.src.startsWith('http')) {
      const filePath = path.join(overlaysDir, item.src);
      if (fs.existsSync(filePath)) {
        item.src = bufferToDataUri(filePath, fs.readFileSync(filePath));
      }
    } else if (item.type === 'video' && item.src && !item.src.startsWith('data:') && !item.src.startsWith('http')) {
      const filePath = path.join(overlaysDir, item.src);
      if (fs.existsSync(filePath)) {
        const absPath = path.resolve(filePath);
        item.src = 'astroknot-local://' + absPath.replace(/\\/g, '/');
        item.srcType = 'url';
      }
    } else if (item.type === 'audio' && item.src && !item.src.startsWith('data:') && !item.src.startsWith('http')) {
      const filePath = path.join(overlaysDir, item.src);
      if (fs.existsSync(filePath)) {
        const absPath = path.resolve(filePath);
        item.src = 'astroknot-local://' + absPath.replace(/\\/g, '/');
        item.srcType = 'url';
      }
    } else if (item.type === 'excel' && item.univerSnapshotFile) {
      const filePath = path.join(overlaysDir, item.univerSnapshotFile);
      if (fs.existsSync(filePath)) {
        item.univerSnapshot = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      }
      delete item.univerSnapshotFile;
    } else if (item.type === 'document' && item.src && !item.src.startsWith('data:') && !item.src.startsWith('http')) {
      const filePath = path.join(overlaysDir, item.src);
      if (fs.existsSync(filePath)) {
        item.src = bufferToDataUri(filePath, fs.readFileSync(filePath));
        item.srcType = 'dataUrl';
      }
    }

    if (item.type === 'slideshow' && item.slides) {
      for (const slide of item.slides) {
        if (slide.src && !slide.src.startsWith('data:') && !slide.src.startsWith('http')) {
          const filePath = path.join(overlaysDir, slide.src);
          if (fs.existsSync(filePath)) {
            slide.src = bufferToDataUri(filePath, fs.readFileSync(filePath));
          }
        }
      }
    }
  }

  return manifest;
}

/**
 * 将虚拟文件系统写入磁盘（递归）
 */
function _writeFileSystemToDisk(node, dirPath) {
  if (!node || !node.children) return;

  for (const child of node.children) {
    if (child.type === 'file') {
      fs.mkdirSync(dirPath, { recursive: true });
      if (child.isBinary && child.content) {
        fs.writeFileSync(path.join(dirPath, child.name), Buffer.from(child.content, 'base64'));
      } else {
        fs.writeFileSync(path.join(dirPath, child.name), child.content || '', 'utf-8');
      }
    } else if (child.type === 'directory') {
      const subDir = path.join(dirPath, child.name);
      fs.mkdirSync(subDir, { recursive: true });
      _writeFileSystemToDisk(child, subDir);
    }
  }
}

/**
 * 收集 VFS 树中所有文件的相对路径（'/' 分隔）
 */
function _collectVfsRelativePaths(node, prefix, out) {
  if (!node || !node.children) return;
  for (const child of node.children) {
    const rel = prefix ? prefix + '/' + child.name : child.name;
    if (child.type === 'file') {
      out.push(rel);
    } else if (child.type === 'directory') {
      _collectVfsRelativePaths(child, rel, out);
    }
  }
}

// VFS 同步清单文件名：记录上次由 VFS 写入的相对路径，用于增量删除已移除的文件。
// 存放在 sandbox 目录的上一级（sandbox 外），避免被 _readFileSystemFromDisk* 读回 VFS。
const VFS_MANIFEST_NAME = '.vfs-manifest.json';

/**
 * 增量同步 VFS 到磁盘（替代"整目录 rmSync + 重写"的全量方式）：
 *   1. 删除上次由 VFS 写入、本次已不在 VFS 中的文件（并清理空目录）
 *   2. 覆盖写入当前 VFS 的全部文件
 * 磁盘上 VFS 之外的内容（终端安装的 node_modules、构建产物 dist、.env 等）全部保留
 * @param {Object} fileSystem - VFS 树 { children: [...] }
 * @param {string} sandboxDir - sandbox 磁盘目录
 */
function _syncFileSystemToDisk(fileSystem, sandboxDir) {
  const sandboxAbs = path.resolve(sandboxDir);
  const manifestPath = path.join(path.dirname(sandboxAbs), VFS_MANIFEST_NAME);

  // 读取上次同步清单
  let prevPaths = [];
  try {
    if (fs.existsSync(manifestPath)) {
      const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      if (Array.isArray(parsed)) prevPaths = parsed;
    }
  } catch (_) { prevPaths = []; }

  const currentPaths = [];
  _collectVfsRelativePaths(fileSystem, '', currentPaths);
  const currentSet = new Set(currentPaths);

  // 删除已从 VFS 移除的文件（仅限上次由 VFS 写入的路径，安全护栏：必须位于 sandbox 内）
  for (const rel of prevPaths) {
    if (currentSet.has(rel)) continue;
    let abs;
    try { abs = path.resolve(sandboxAbs, rel); } catch (_) { continue; }
    if (abs !== sandboxAbs && !abs.startsWith(sandboxAbs + path.sep)) continue;
    try {
      if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
        fs.unlinkSync(abs);
        // 自底向上清理空目录（只清到 sandbox 根为止）
        let parent = path.dirname(abs);
        while (parent.startsWith(sandboxAbs + path.sep) && parent !== sandboxAbs) {
          if (fs.readdirSync(parent).length > 0) break;
          fs.rmdirSync(parent);
          parent = path.dirname(parent);
        }
      }
    } catch (_) { /* 单文件清理失败不阻塞整体同步 */ }
  }

  // 覆盖写入当前 VFS 内容（不触碰 VFS 之外的磁盘内容）
  _writeFileSystemToDisk(fileSystem, sandboxDir);

  // 写入本次清单（写失败只影响下次增量删除，不阻塞）
  try {
    fs.writeFileSync(manifestPath, JSON.stringify(currentPaths));
  } catch (_) { /* ignore */ }
}

/**
 * 从磁盘目录读取虚拟文件系统（递归，文本模式）
 */
function _readFileSystemFromDisk(dirPath) {
  if (!fs.existsSync(dirPath)) return null;

  const children = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const subTree = _readFileSystemFromDisk(path.join(dirPath, entry.name));
      if (subTree) children.push(subTree);
    } else if (entry.isFile()) {
      const filePath = path.join(dirPath, entry.name);
      const content = fs.readFileSync(filePath, 'utf-8');
      const ext = entry.name.split('.').pop().toLowerCase();
      const langMap = {
        'html': 'html', 'htm': 'html',
        'css': 'css', 'scss': 'scss', 'less': 'less',
        'js': 'javascript', 'mjs': 'javascript',
        'ts': 'typescript', 'tsx': 'typescript', 'jsx': 'javascript',
        'json': 'json', 'md': 'markdown', 'py': 'python',
        'xml': 'xml', 'svg': 'xml', 'yaml': 'yaml', 'yml': 'yaml',
        'txt': 'plaintext', 'sql': 'sql',
      };
      children.push({
        type: 'file',
        name: entry.name,
        content: content,
        language: langMap[ext] || 'plaintext'
      });
    }
  }

  children.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const dirName = path.basename(dirPath);
  return {
    type: 'directory',
    name: dirName,
    children: children
  };
}

/**
 * 从磁盘目录读取虚拟文件系统（递归，支持二进制文件 base64 编码）
 */
function _readFileSystemFromDiskBinary(dirPath, skipNodeModules = false) {
  if (!fs.existsSync(dirPath)) return null;

  const children = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    if (skipNodeModules && entry.isDirectory() && entry.name === 'node_modules') continue;

    if (entry.isDirectory()) {
      const subTree = _readFileSystemFromDiskBinary(path.join(dirPath, entry.name), skipNodeModules);
      if (subTree) children.push(subTree);
    } else if (entry.isFile()) {
      const filePath = path.join(dirPath, entry.name);
      const ext = entry.name.split('.').pop().toLowerCase();
      const langMap = {
        'html': 'html', 'htm': 'html',
        'css': 'css', 'scss': 'scss', 'less': 'less',
        'js': 'javascript', 'mjs': 'javascript',
        'ts': 'typescript', 'tsx': 'typescript', 'jsx': 'javascript',
        'json': 'json', 'md': 'markdown', 'py': 'python',
        'xml': 'xml', 'svg': 'xml', 'yaml': 'yaml', 'yml': 'yaml',
        'txt': 'plaintext', 'sql': 'sql',
      };

      if (BINARY_EXTENSIONS.has(ext)) {
        const buffer = fs.readFileSync(filePath);
        const base64Content = buffer.toString('base64');
        children.push({
          type: 'file',
          name: entry.name,
          content: base64Content,
          language: langMap[ext] || 'plaintext',
          isBinary: true
        });
      } else {
        const content = fs.readFileSync(filePath, 'utf-8');
        children.push({
          type: 'file',
          name: entry.name,
          content: content,
          language: langMap[ext] || 'plaintext',
          isBinary: false
        });
      }
    }
  }

  children.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const dirName = path.basename(dirPath);
  return {
    type: 'directory',
    name: dirName,
    children: children
  };
}

/**
 * 递归复制目录
 */
function _copyDirSync(src, dest) {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      _copyDirSync(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * 生成 project.md（人类可读摘要）
 */
function generateProjectMd(savePath, projectCore, nodeRichContents, overlayImages) {
  const projectName = projectCore.projectName || '知识图谱';
  const tree = projectCore.methodsTree;

  let md = `# 🌳 ${projectName}\n\n`;
  md += `> 由 AstroKnot 自动生成 · 仅供阅读，请勿手动编辑\n\n`;

  const allNodes = [];
  function collectNodes(node) {
    if (node.id !== '__VIRTUAL_ROOT__') allNodes.push(node);
    if (node.children) node.children.forEach(collectNodes);
  }
  if (tree) collectNodes(tree);

  md += `## 📋 节点概览\n\n`;
  md += `| ID | 名称 | 步骤 | 3D位置 | 内容 |\n`;
  md += `|----|------|------|--------|------|\n`;
  const positions = projectCore.positions || {};
  for (const node of allNodes) {
    const pos = positions[node.id] || {};
    const hasContent = nodeRichContents && nodeRichContents[node.id];
    const hasOverlay = overlayImages && overlayImages[node.id] && overlayImages[node.id].length > 0;
    const tags = [];
    if (hasContent) tags.push('📝');
    if (hasOverlay) tags.push('🖼️');
    md += `| \`${node.id}\` | ${node.name || ''} | ${node.isStepFlow ? '✅' : '❌'} | (${pos.x || 0}, ${pos.y || 0}, ${pos.z || 0}) | ${tags.join(' ') || '—'} |\n`;
  }

  const crossEdges = projectCore.crossEdges || [];
  if (crossEdges.length > 0) {
    md += `\n## 🔗 跨层连线\n\n`;
    md += `| 来源 | 目标 | 颜色 | 标签 |\n`;
    md += `|------|------|------|------|\n`;
    for (const edge of crossEdges) {
      md += `| \`${edge.sourceId}\` | \`${edge.targetId}\` | ${edge.customColor || ''} | ${edge.label || ''} |\n`;
    }
  }

  const layers = projectCore.layers || [];
  if (layers.length > 0) {
    md += `\n## 📚 图层\n\n`;
    for (const layer of layers) {
      md += `- **${layer.name}** (${(layer.nodeIds || []).length} 个节点)\n`;
    }
  }

  fs.writeFileSync(path.join(savePath, 'project.md'), md, 'utf-8');
}

/**
 * 收集树中所有节点
 */
function collectTreeNodeIds(tree) {
  const nodes = [];
  function walk(node) {
    if (node.id !== '__VIRTUAL_ROOT__') nodes.push(node);
    if (node.children) node.children.forEach(walk);
  }
  if (tree) walk(tree);
  return nodes;
}

/**
 * 将节点名称转换为安全的文件夹名
 */
function sanitizeNodeFolderName(name) {
  return String(name || '未命名').replace(/[<>:"\\/|?*]/g, '_').slice(0, 50) || '未命名';
}

/**
 * 生成节点文件夹名
 */
function getNodeFolderName(node) {
  const safeName = sanitizeNodeFolderName(node.name);
  const shortId = node.id.slice(0, 8);
  return `${safeName}_${shortId}`;
}

/**
 * 将字符串转为安全的文件名片段
 */
function sanitizeFileName(s) {
  return String(s).replace(/[^A-Za-z0-9_\-]/g, '_').slice(0, 64) || 'unknown';
}

/**
 * 原子写工具
 */
function atomicWrite(filePath, content) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, content, 'utf-8');
  try { fs.renameSync(tmp, filePath); } catch (e) {
    fs.copyFileSync(tmp, filePath);
    try { fs.unlinkSync(tmp); } catch (_) {}
  }
}

module.exports = {
  BINARY_EXTENSIONS,
  extractDataUriExt,
  dataUriToBuffer,
  bufferToDataUri,
  saveOverlays,
  loadOverlays,
  _writeFileSystemToDisk,
  _syncFileSystemToDisk,
  _readFileSystemFromDisk,
  _readFileSystemFromDiskBinary,
  _copyDirSync,
  generateProjectMd,
  collectTreeNodeIds,
  sanitizeNodeFolderName,
  getNodeFolderName,
  sanitizeFileName,
  atomicWrite,
};