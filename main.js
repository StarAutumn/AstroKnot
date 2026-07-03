// ============================================================
//  Electron 主进程
//  负责创建应用程序窗口，监听生命周期事件
// ============================================================

const { app, BrowserWindow, ipcMain, dialog, shell, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');

// ── GPU 兼容性：允许在不支持的 GPU 上使用 WebGL ──
app.commandLine.appendSwitch('ignore-gpu-blocklist');

/** 全局窗口引用（热更新发送 IPC 用） */
let mainWindow = null;

/**
 * 创建主窗口
 * frame: false → 无边框窗口，使用自定义标题栏
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false            // 允许 preload 使用 Node.js 内置模块（path, fs 等）
    }
  });

  mainWindow.loadFile('index.html');

  // ── GPU / 渲染进程崩溃自动恢复 ──
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('=== [崩溃恢复] 渲染进程终止 ===');
    console.error('  reason:', details.reason);
    console.error('  exitCode:', details.exitCode);
    console.error('  detailed:', JSON.stringify(details));
    // 崩溃后自动重载窗口
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.session.flushStorageData();
      mainWindow.reload();
    }
  });

  mainWindow.on('maximize', () => mainWindow.webContents.send('maximize-change', true));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('maximize-change', false));
  mainWindow.on('enter-full-screen', () => mainWindow.webContents.send('fullscreen-change', true));
  mainWindow.on('leave-full-screen', () => mainWindow.webContents.send('fullscreen-change', false));
}

// ── IPC：窗口控制 ──
function bindWindowIPC() {
  ipcMain.on('win-minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });
  ipcMain.on('win-maximize', (event) => {
    const w = BrowserWindow.fromWebContents(event.sender);
    if (w?.isMaximized()) w.unmaximize(); else w?.maximize();
  });
  ipcMain.on('win-unmaximize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.unmaximize();
  });
  ipcMain.on('win-close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });
  ipcMain.on('close-app', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });
  ipcMain.on('toggle-fullscreen', (event) => {
    const w = BrowserWindow.fromWebContents(event.sender);
    if (w) w.setFullScreen(!w.isFullScreen());
  });
}

// ── 热更新：文件监听（仅开发模式） ──
function startHMR() {
  if (app.isPackaged) return;  // 打包后不监听

  const rootDir = __dirname;
  const watchDirs = ['modules', 'style'];
  const watchFiles = ['index.html', 'AstroKnot.js'];
  const debounceTimers = new Map();

  function sendHMR(filePath, type) {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    console.log('[HMR] 文件变更:', filePath);
    mainWindow.webContents.send('hot-update', { type, filePath });
  }

  function onFileChange(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const type = ext === '.css' ? 'css' : 'js';
    // 防抖：同一文件 200ms 内只触发一次
    const key = type + ':' + filePath;
    if (debounceTimers.has(key)) clearTimeout(debounceTimers.get(key));
    debounceTimers.set(key, setTimeout(() => {
      debounceTimers.delete(key);
      sendHMR(filePath, type);
    }, 200));
  }

  // 监听子目录
  for (const dir of watchDirs) {
    const fullDir = path.join(rootDir, dir);
    if (!fs.existsSync(fullDir)) continue;
    try {
      fs.watch(fullDir, { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        const filePath = path.join(dir, filename).replace(/\\/g, '/');
        if (filename.endsWith('.js') || filename.endsWith('.css')) {
          onFileChange(filePath);
        }
      });
    } catch (e) {
      console.warn('[HMR] 无法监听目录:', fullDir, e.message);
    }
  }

  // 监听根目录文件
  for (const file of watchFiles) {
    const fullPath = path.join(rootDir, file);
    if (!fs.existsSync(fullPath)) continue;
    try {
      fs.watch(fullPath, (eventType) => {
        onFileChange(file);
      });
    } catch (e) {
      console.warn('[HMR] 无法监听文件:', fullPath, e.message);
    }
  }

  console.log('[HMR] 文件监听已启动');
}

// ============================================================
//  文件 I/O：文件夹式项目存储
//  结构：
//    ParentFolder/                    用户选择的保存位置
//    └── ProjectName/                 以项目名命名的子文件夹
//        ├── project.json             程序数据（树、连线、位置、图层、相机等）
//        ├── project.md               人类可读摘要（自动生成）
//        └── nodes/
//            ├── node_xxx/
//            │   ├── content.html     富文本内容
//            │   └── overlays/
//            │       ├── manifest.json   overlay 元数据（位置、格式）
//            │       ├── overlay_001.png 原生图片（非 base64）
//            │       ├── video_001.mp4  原生视频文件
//            │       ├── audio_001.mp3  原生音频文件
//            │       └── excel_001.json 电子表格快照（Univer 序列化，独立文件避免 manifest 膨胀）
//            └── ...
// ============================================================

/**
 * 从 data URI 提取文件扩展名
 */
function extractDataUriExt(dataUri) {
  const m = dataUri.match(/^data:(?:image|video|audio)\/([\w+]+);/);
  if (!m) return 'bin';
  let ext = m[1].toLowerCase();
  if (ext === 'jpeg') ext = 'jpg';
  return ext;
}

/**
 * data URI → Buffer
 */
function dataUriToBuffer(dataUri) {
  const base64 = dataUri.split(',')[1];
  if (!base64) return Buffer.alloc(0);
  return Buffer.from(base64, 'base64');
}

/**
 * Buffer + 文件路径 → data URI
 */
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
 * 将 base64 图片提取为原生文件，元数据写入 manifest.json
 */
function saveOverlays(overlaysDir, overlays) {
  fs.mkdirSync(overlaysDir, { recursive: true });
  const manifest = [];
  let imgIdx = 0, vidIdx = 0, audIdx = 0, excIdx = 0, docIdx = 0;

  for (const overlay of overlays) {
    const item = { ...overlay };

    // 图片类型（默认 type）
    if ((item.type === 'image' || !item.type) && item.src && item.src.startsWith('data:')) {
      imgIdx++;
      const ext = extractDataUriExt(item.src);
      const fileName = `overlay_${String(imgIdx).padStart(3, '0')}.${ext}`;
      fs.writeFileSync(path.join(overlaysDir, fileName), dataUriToBuffer(item.src));
      item.src = fileName;
    }
    // 视频类型
    else if (item.type === 'video' && item.src && item.src.startsWith('data:')) {
      vidIdx++;
      const ext = extractDataUriExt(item.src);
      const fileName = `video_${String(vidIdx).padStart(3, '0')}.${ext}`;
      fs.writeFileSync(path.join(overlaysDir, fileName), dataUriToBuffer(item.src));
      item.src = fileName;
    }
    // 音频类型
    else if (item.type === 'audio' && item.src && item.src.startsWith('data:')) {
      audIdx++;
      const ext = extractDataUriExt(item.src);
      const fileName = `audio_${String(audIdx).padStart(3, '0')}.${ext}`;
      fs.writeFileSync(path.join(overlaysDir, fileName), dataUriToBuffer(item.src));
      item.src = fileName;
    }

    // 文档类型（PDF/DOCX/PPTX）— 提取为原生文件
    if (item.type === 'document' && item.src && item.src.startsWith('data:')) {
      docIdx++;
      const ext = extractDataUriExt(item.src);
      const fileName = `doc_${String(docIdx).padStart(3, '0')}.${ext}`;
      fs.writeFileSync(path.join(overlaysDir, fileName), dataUriToBuffer(item.src));
      item.src = fileName;
    }

    // 电子表格 — univerSnapshot 通常很大（100KB~5MB+），拆为独立文件
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

    // 幻灯片中的图片
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
 * 将文件引用转换回 base64 data URI
 */
function loadOverlays(overlaysDir) {
  const manifestPath = path.join(overlaysDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return null;

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

  for (const item of manifest) {
    // 图片 — 小文件，仍然用 data URI（加载快，无需协议）
    if ((item.type === 'image' || !item.type) && item.src && !item.src.startsWith('data:') && !item.src.startsWith('http')) {
      const filePath = path.join(overlaysDir, item.src);
      if (fs.existsSync(filePath)) {
        item.src = bufferToDataUri(filePath, fs.readFileSync(filePath));
      }
    }
    // 视频 — 使用 astroknot-local:// 协议，避免 data URI 导致 Chromium 无法播放
    else if (item.type === 'video' && item.src && !item.src.startsWith('data:') && !item.src.startsWith('http')) {
      const filePath = path.join(overlaysDir, item.src);
      if (fs.existsSync(filePath)) {
        const absPath = path.resolve(filePath);
        item.src = 'astroknot-local://' + absPath.replace(/\\/g, '/');
        item.srcType = 'url';
      }
    }
    // 音频 — 同理
    else if (item.type === 'audio' && item.src && !item.src.startsWith('data:') && !item.src.startsWith('http')) {
      const filePath = path.join(overlaysDir, item.src);
      if (fs.existsSync(filePath)) {
        const absPath = path.resolve(filePath);
        item.src = 'astroknot-local://' + absPath.replace(/\\/g, '/');
        item.srcType = 'url';
      }
    }
    // 电子表格 — 从独立文件恢复 univerSnapshot
    else if (item.type === 'excel' && item.univerSnapshotFile) {
      const filePath = path.join(overlaysDir, item.univerSnapshotFile);
      if (fs.existsSync(filePath)) {
        item.univerSnapshot = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      }
      delete item.univerSnapshotFile;
    }
    // 文档类型（PDF/DOCX/PPTX）— 读回为 base64 data URI
    else if (item.type === 'document' && item.src && !item.src.startsWith('data:') && !item.src.startsWith('http')) {
      const filePath = path.join(overlaysDir, item.src);
      if (fs.existsSync(filePath)) {
        item.src = bufferToDataUri(filePath, fs.readFileSync(filePath));
        item.srcType = 'dataUrl';
      }
    }

    // 幻灯片中的图片
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
 * @param {Object} node - 文件树节点 { type, name, content, children }
 * @param {string} dirPath - 目标目录绝对路径
 */
function _writeFileSystemToDisk(node, dirPath) {
  if (!node || !node.children) return;

  for (const child of node.children) {
    if (child.type === 'file') {
      fs.mkdirSync(dirPath, { recursive: true });
      fs.writeFileSync(path.join(dirPath, child.name), child.content || '', 'utf-8');
    } else if (child.type === 'directory') {
      const subDir = path.join(dirPath, child.name);
      fs.mkdirSync(subDir, { recursive: true });
      _writeFileSystemToDisk(child, subDir);
    }
  }
}

/**
 * 从磁盘目录读取虚拟文件系统（递归）
 * @param {string} dirPath - sandbox 目录绝对路径
 * @returns {Object} 文件树根节点
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
      // 根据扩展名推断语言
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

  // 排序：目录在前，文件在后
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
 * 生成 project.md（人类可读摘要）
 */
function generateProjectMd(savePath, projectCore, nodeRichContents, overlayImages) {
  const projectName = projectCore.projectName || '知识图谱';
  const tree = projectCore.methodsTree;

  let md = `# 🌳 ${projectName}\n\n`;
  md += `> 由 AstroKnot 自动生成 · 仅供阅读，请勿手动编辑\n\n`;

  // 收集所有节点
  const allNodes = [];
  function collectNodes(node) {
    if (node.id !== '__VIRTUAL_ROOT__') allNodes.push(node);
    if (node.children) node.children.forEach(collectNodes);
  }
  if (tree) collectNodes(tree);

  // 节点概览表
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

  // 跨层连线
  const crossEdges = projectCore.crossEdges || [];
  if (crossEdges.length > 0) {
    md += `\n## 🔗 跨层连线\n\n`;
    md += `| 来源 | 目标 | 颜色 | 标签 |\n`;
    md += `|------|------|------|------|\n`;
    for (const edge of crossEdges) {
      md += `| \`${edge.sourceId}\` | \`${edge.targetId}\` | ${edge.customColor || ''} | ${edge.label || ''} |\n`;
    }
  }

  // 图层
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
 * 收集树中所有节点 ID
 */
function collectTreeNodeIds(tree) {
  const ids = new Set();
  function walk(node) {
    if (node.id !== '__VIRTUAL_ROOT__') ids.add(node.id);
    if (node.children) node.children.forEach(walk);
  }
  if (tree) walk(tree);
  return ids;
}

// ── 应急备份目录（系统级持久，不受清缓存影响）──
function getEmergencyDir() {
  const dir = path.join(app.getPath('userData'), 'emergency-backups');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function getEmergencyManifestPath() {
  return path.join(getEmergencyDir(), 'manifest.json');
}
function readEmergencyManifest() {
  const p = getEmergencyManifestPath();
  try {
    if (!fs.existsSync(p)) return { entries: {} };
    return JSON.parse(fs.readFileSync(p, 'utf-8')) || { entries: {} };
  } catch (e) {
    console.error('[应急备份] 读取 manifest 失败:', e);
    return { entries: {} };
  }
}
function writeEmergencyManifest(m) {
  try {
    fs.writeFileSync(getEmergencyManifestPath(), JSON.stringify(m, null, 2), 'utf-8');
  } catch (e) {
    console.error('[应急备份] 写入 manifest 失败:', e);
  }
}
// ── IPC：应急备份（崩溃兜底） ──
function bindEmergencyIPC() {
  // 写入备份（每项目只保留最新一份，标记 pending=true 触发启动恢复）
  ipcMain.handle('emergency-save', async (event, payload) => {
    try {
      if (!payload || !payload.projectId || !payload.snapshot) return { success: false, error: '参数缺失' };
      const dir = getEmergencyDir();
      const fileName = 'proj_' + sanitizeFileName(payload.projectId) + '.json';
      const filePath = path.join(dir, fileName);
      // 原子写：先写临时文件再重命名，避免写一半崩溃导致文件损坏
      const tmpPath = filePath + '.tmp';
      fs.writeFileSync(tmpPath, JSON.stringify({
        projectId: payload.projectId,
        projectName: payload.projectName || '未命名',
        savedAt: Date.now(),
        snapshot: payload.snapshot
      }), 'utf-8');
      try { fs.renameSync(tmpPath, filePath); } catch (e) {
        // 某些系统 rename 跨设备失败，回退直接写
        fs.copyFileSync(tmpPath, filePath);
        try { fs.unlinkSync(tmpPath); } catch (_) {}
      }
      // 更新 manifest：pending=true 表示下次启动需提示恢复
      // 正常退出（before-quit 触发的 flushNow）传 pending=false，不弹恢复提示
      // 只有定时备份/崩溃兜底才 pending=true
      const isPending = payload.pending !== false; // 默认 true
      const m = readEmergencyManifest();
      m.entries[payload.projectId] = {
        projectId: payload.projectId,
        projectName: payload.projectName || '未命名',
        fileName: fileName,
        savedAt: Date.now(),
        pending: isPending
      };
      writeEmergencyManifest(m);
      return { success: true };
    } catch (e) {
      console.error('[应急备份] 保存失败:', e);
      return { success: false, error: e.message };
    }
  });
  // 列出所有 pending 备份（启动恢复用）
  ipcMain.handle('emergency-list', async () => {
    const m = readEmergencyManifest();
    const list = [];
    for (const id in m.entries) {
      const entry = m.entries[id];
      if (!entry.pending) continue;
      const fp = path.join(getEmergencyDir(), entry.fileName);
      if (!fs.existsSync(fp)) { delete m.entries[id]; continue; }
      list.push({
        projectId: entry.projectId,
        projectName: entry.projectName,
        savedAt: entry.savedAt
      });
    }
    writeEmergencyManifest(m);
    return { list: list };
  });
  // 读取指定备份内容
  ipcMain.handle('emergency-restore', async (event, projectId) => {
    try {
      const m = readEmergencyManifest();
      const entry = m.entries[projectId];
      if (!entry) return { success: false, error: '备份不存在' };
      const fp = path.join(getEmergencyDir(), entry.fileName);
      if (!fs.existsSync(fp)) return { success: false, error: '备份文件丢失' };
      const data = JSON.parse(fs.readFileSync(fp, 'utf-8'));
      // 恢复后清除 pending 标记，避免重复提示
      entry.pending = false;
      writeEmergencyManifest(m);
      return { success: true, snapshot: data.snapshot, projectName: data.projectName, savedAt: data.savedAt };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  // 放弃恢复：清除 pending 标记（可选保留/删除文件）
  ipcMain.handle('emergency-dismiss', async (event, projectId) => {
    const m = readEmergencyManifest();
    if (m.entries[projectId]) {
      const entry = m.entries[projectId];
      try { fs.unlinkSync(path.join(getEmergencyDir(), entry.fileName)); } catch (_) {}
      delete m.entries[projectId];
      writeEmergencyManifest(m);
    }
    return { success: true };
  });
  // 清空所有 pending（用户已处理或选择全部忽略）
  ipcMain.handle('emergency-dismiss-all', async () => {
    const m = readEmergencyManifest();
    m.entries = {};
    writeEmergencyManifest(m);
    // 同时清理目录下孤儿备份文件
    try {
      const dir = getEmergencyDir();
      fs.readdirSync(dir).forEach(function (f) {
        if (f !== 'manifest.json' && f.endsWith('.json')) {
          try { fs.unlinkSync(path.join(dir, f)); } catch (_) {}
        }
      });
    } catch (_) {}
    return { success: true };
  });
}

// ── 版本图目录（内容寻址存储）──
// 存储 key 可以是：
//   1. 项目文件夹绝对路径（如 D:\AstroKnot\项目文件\我的项目）→ 存到 <key>/.versiongraph/
//   2. 临时 projectId（未保存的项目）→ 存到 userData/version-graphs-tmp/<key>/
function getVersionDir(versionKey) {
  let dir;
  if (versionKey && (versionKey.includes('\\') || versionKey.includes('/')) && /^[A-Za-z]:[\\/]|^\//.test(versionKey)) {
    // 是绝对路径 → 存到项目文件夹内的 .versiongraph
    dir = path.join(versionKey, '.versiongraph');
  } else {
    // 是临时 projectId → 存到 userData 临时目录
    dir = path.join(app.getPath('userData'), 'version-graphs-tmp', sanitizeFileName(versionKey));
  }
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function getVersionBlobsDir(projectId) {
  const dir = path.join(getVersionDir(projectId), 'blobs');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function getVersionGraphPath(projectId) {
  return path.join(getVersionDir(projectId), 'graph.json');
}
function getBlobPath(projectId, hash) {
  return path.join(getVersionBlobsDir(projectId), hash + '.json');
}
// 原子写工具
function atomicWrite(filePath, content) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, content, 'utf-8');
  try { fs.renameSync(tmp, filePath); } catch (e) {
    fs.copyFileSync(tmp, filePath);
    try { fs.unlinkSync(tmp); } catch (_) {}
  }
}

// ── IPC：版本图（内容寻址存储） ──
function bindVersionGraphIPC() {
  // 保存图结构（commits + branches + HEAD）
  ipcMain.handle('version-save-graph', async (event, projectId, graph) => {
    try {
      if (!projectId || !graph) return { success: false, error: '参数缺失' };
      atomicWrite(getVersionGraphPath(projectId), JSON.stringify(graph, null, 2));
      return { success: true };
    } catch (e) {
      console.error('[版本图] 保存 graph 失败:', e);
      return { success: false, error: e.message };
    }
  });
  // 读取图结构
  ipcMain.handle('version-load-graph', async (event, projectId) => {
    try {
      if (!projectId) return { success: false, error: '参数缺失' };
      const p = getVersionGraphPath(projectId);
      if (!fs.existsSync(p)) return { success: false };
      const graph = JSON.parse(fs.readFileSync(p, 'utf-8'));
      return { success: true, graph: graph };
    } catch (e) {
      console.error('[版本图] 读取 graph 失败:', e);
      return { success: false, error: e.message };
    }
  });
  // 写入 blob（内容寻址，自动去重：文件已存在则跳过）
  ipcMain.handle('version-save-blob', async (event, projectId, hash, content) => {
    try {
      if (!projectId || !hash) return { success: false, error: '参数缺失' };
      const fp = getBlobPath(projectId, hash);
      if (!fs.existsSync(fp)) {
        atomicWrite(fp, JSON.stringify(content));
      }
      return { success: true };
    } catch (e) {
      console.error('[版本图] 保存 blob 失败:', e);
      return { success: false, error: e.message };
    }
  });
  // 批量写入 blobs
  ipcMain.handle('version-save-blobs', async (event, projectId, hashToContent) => {
    try {
      if (!projectId || !hashToContent) return { success: false, error: '参数缺失' };
      const blobsDir = getVersionBlobsDir(projectId);
      for (const hash in hashToContent) {
        const fp = path.join(blobsDir, hash + '.json');
        if (!fs.existsSync(fp)) {
          atomicWrite(fp, JSON.stringify(hashToContent[hash]));
        }
      }
      return { success: true };
    } catch (e) {
      console.error('[版本图] 批量保存 blobs 失败:', e);
      return { success: false, error: e.message };
    }
  });
  // 读取 blob
  ipcMain.handle('version-load-blob', async (event, projectId, hash) => {
    try {
      if (!projectId || !hash) return { success: false, error: '参数缺失' };
      const fp = getBlobPath(projectId, hash);
      if (!fs.existsSync(fp)) return { success: false };
      const content = JSON.parse(fs.readFileSync(fp, 'utf-8'));
      return { success: true, content: content };
    } catch (e) {
      console.error('[版本图] 读取 blob 失败:', e);
      return { success: false, error: e.message };
    }
  });
  // 列出所有项目版本图（用于跨项目视图）
  ipcMain.handle('version-list-graphs', async () => {
    try {
      const rootDir = path.join(app.getPath('userData'), 'version-graphs');
      if (!fs.existsSync(rootDir)) return { success: true, list: [] };
      const list = [];
      fs.readdirSync(rootDir).forEach(function (name) {
        const gp = path.join(rootDir, name, 'graph.json');
        if (fs.existsSync(gp)) {
          try {
            const g = JSON.parse(fs.readFileSync(gp, 'utf-8'));
            list.push({
              dirName: name,
              commitCount: (g.commits || []).length,
              branchCount: (g.branches || []).length,
              lastTime: g.commits && g.commits.length ? Math.max.apply(null, g.commits.map(function (c) { return c.time || 0; })) : 0
            });
          } catch (_) {}
        }
      });
      return { success: true, list: list };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  // 删除指定 key 的版本图（删除项目时清理临时存储）
  ipcMain.handle('version-delete-graph', async (event, versionKey) => {
    try {
      if (!versionKey) return { success: false, error: '参数缺失' };
      const dir = getVersionDir(versionKey);
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
      return { success: true };
    } catch (e) {
      console.error('[版本图] 删除失败:', e);
      return { success: false, error: e.message };
    }
  });
}
function sanitizeFileName(s) {
  return String(s).replace(/[^A-Za-z0-9_\-]/g, '_').slice(0, 64) || 'unknown';
}

// ── IPC：文件 I/O ──
function bindFileIPC() {
  // 选择文件夹
  ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: '选择文件夹'
    });
    if (result.canceled) return { canceled: true };
    return { canceled: false, path: result.filePaths[0] };
  });

  // 选择加载文件夹
  ipcMain.handle('select-folder-for-load', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: '选择项目文件夹'
    });
    if (result.canceled) return { canceled: true };
    return { canceled: false, path: result.filePaths[0] };
  });

  // ── 保存项目到文件夹 ──
  ipcMain.handle('save-project', async (event, projectData) => {
    try {
      let savePath = projectData.savePath;
      const projectName = projectData.projectName || 'knowledge_graph';
      let rootPath;  // 保存根目录（项目文件夹的父目录），用于回传给渲染进程

      if (!savePath) {
        const result = await dialog.showOpenDialog(mainWindow, {
          properties: ['openDirectory'],
          title: '选择保存位置',
          buttonLabel: '选择此文件夹'
        });
        if (result.canceled) return { canceled: true };
        // 用户选择的目录作为根目录，在其下创建以项目名命名的子文件夹
        rootPath = result.filePaths[0];
        savePath = path.join(rootPath, projectName);
      } else {
        // savePath 是保存根目录（用户在设置里指定的），直接拼项目名
        rootPath = savePath;
        savePath = path.join(savePath, projectName);
      }

      fs.mkdirSync(savePath, { recursive: true });

      const nodesDir = path.join(savePath, 'nodes');
      fs.mkdirSync(nodesDir, { recursive: true });

      // 分离节点级数据和项目核心数据
      const { nodeRichContents, overlayImages, nodeFileSystems, savePath: _sp, ...projectCore } = projectData;

      // 写入 project.json
      fs.writeFileSync(
        path.join(savePath, 'project.json'),
        JSON.stringify(projectCore, null, 2),
        'utf-8'
      );

      // 收集当前存在的节点 ID，清理已删除节点的文件夹
      const currentNodeIds = collectTreeNodeIds(projectCore.methodsTree);
      if (nodeRichContents) for (const id of Object.keys(nodeRichContents)) currentNodeIds.add(id);
      if (overlayImages) for (const id of Object.keys(overlayImages)) currentNodeIds.add(id);
      if (nodeFileSystems) for (const id of Object.keys(nodeFileSystems)) currentNodeIds.add(id);

      if (fs.existsSync(nodesDir)) {
        for (const folder of fs.readdirSync(nodesDir, { withFileTypes: true })) {
          if (folder.isDirectory() && !currentNodeIds.has(folder.name)) {
            fs.rmSync(path.join(nodesDir, folder.name), { recursive: true, force: true });
          }
        }
      }

      // 写入每个节点的 content.html
      for (const [nodeId, content] of Object.entries(nodeRichContents || {})) {
        const nodeDir = path.join(nodesDir, nodeId);
        fs.mkdirSync(nodeDir, { recursive: true });
        fs.writeFileSync(path.join(nodeDir, 'content.html'), content, 'utf-8');
      }

      // 写入每个节点的 overlay 数据
      for (const [nodeId, overlays] of Object.entries(overlayImages || {})) {
        if (!overlays || overlays.length === 0) continue;
        const nodeDir = path.join(nodesDir, nodeId);
        const overlaysDir = path.join(nodeDir, 'overlays');
        saveOverlays(overlaysDir, overlays);
      }

      // 写入每个节点的沙盒代码文件（虚拟文件系统 → 真实磁盘文件）
      for (const [nodeId, fileSystem] of Object.entries(nodeFileSystems || {})) {
        if (!fileSystem) continue;
        const sandboxDir = path.join(nodesDir, nodeId, 'sandbox');
        // 先清空旧的 sandbox 目录，避免残留已删除的文件
        if (fs.existsSync(sandboxDir)) {
          fs.rmSync(sandboxDir, { recursive: true, force: true });
        }
        // 递归写入文件树
        _writeFileSystemToDisk(fileSystem, sandboxDir);
      }

      // 生成 project.md
      generateProjectMd(savePath, projectCore, nodeRichContents, overlayImages);

      return { success: true, path: savePath, rootPath: rootPath };
    } catch (err) {
      console.error('[save-project] 错误:', err);
      return { success: false, error: err.message };
    }
  });

  // ── 从文件夹加载项目 ──
  ipcMain.handle('load-project', async () => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: '选择项目文件夹'
      });
      if (result.canceled) return { canceled: true };

      let folderPath = result.filePaths[0];

      // 智能识别：如果用户选择的是外层目录，自动定位到内层项目名子文件夹
      // 判断依据：当前目录没有 project.json，但子目录中有
      if (!fs.existsSync(path.join(folderPath, 'project.json'))) {
        const subDirs = fs.readdirSync(folderPath, { withFileTypes: true })
          .filter(d => d.isDirectory())
          .map(d => d.name);

        for (const subDir of subDirs) {
          if (fs.existsSync(path.join(folderPath, subDir, 'project.json'))) {
            folderPath = path.join(folderPath, subDir);
            break;
          }
        }
      }

      const projectJsonPath = path.join(folderPath, 'project.json');

      if (!fs.existsSync(projectJsonPath)) {
        return { success: false, error: '所选文件夹中没有 project.json，不是有效的 AstroKnot 项目' };
      }

      // 读取 project.json
      const projectCore = JSON.parse(fs.readFileSync(projectJsonPath, 'utf-8'));

      // 读取节点内容
      const nodesDir = path.join(folderPath, 'nodes');
      const nodeRichContents = {};
      const overlayImages = {};
      const nodeFileSystems = {};

      if (fs.existsSync(nodesDir)) {
        for (const entry of fs.readdirSync(nodesDir, { withFileTypes: true })) {
          if (!entry.isDirectory()) continue;
          const nodeId = entry.name;
          const nodeDir = path.join(nodesDir, nodeId);

          // 读取 content.html
          const contentPath = path.join(nodeDir, 'content.html');
          if (fs.existsSync(contentPath)) {
            nodeRichContents[nodeId] = fs.readFileSync(contentPath, 'utf-8');
          }

          // 读取 overlays
          const overlaysDir = path.join(nodeDir, 'overlays');
          if (fs.existsSync(path.join(overlaysDir, 'manifest.json'))) {
            const overlays = loadOverlays(overlaysDir);
            if (overlays && overlays.length > 0) {
              overlayImages[nodeId] = overlays;
            }
          }

          // 读取沙盒代码文件（sandbox/ 目录 → 虚拟文件系统）
          const sandboxDir = path.join(nodeDir, 'sandbox');
          if (fs.existsSync(sandboxDir)) {
            const fsTree = _readFileSystemFromDisk(sandboxDir);
            if (fsTree && fsTree.children && fsTree.children.length > 0) {
              // 将根目录名改为 '/' 以匹配 VirtualFileSystem 的约定
              fsTree.name = '/';
              nodeFileSystems[nodeId] = fsTree;
            }
          }
        }
      }

      return {
        success: true,
        data: { ...projectCore, nodeRichContents, overlayImages, nodeFileSystems },
        folderName: path.basename(folderPath),
        folderPath
      };
    } catch (err) {
      console.error('[load-project] 错误:', err);
      return { success: false, error: err.message };
    }
  });

  // ── 在系统默认应用中打开本地文件 ──
  ipcMain.handle('open-local-file', async (event, filePath) => {
    try {
      await shell.openPath(filePath);
      return { success: true };
    } catch (err) {
      console.error('[open-local-file] 错误:', err);
      return { success: false, error: err.message };
    }
  });

  // ── 在系统默认浏览器中打开外部链接 ──
  ipcMain.handle('open-external-url', async (event, url) => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (err) {
      console.error('[open-external-url] 错误:', err);
      return { success: false, error: err.message };
    }
  });

  // ── 在文件管理器中显示文件所在目录 ──
  ipcMain.handle('show-file-in-folder', async (event, filePath) => {
    try {
      shell.showItemInFolder(filePath);
      return { success: true };
    } catch (err) {
      console.error('[show-file-in-folder] 错误:', err);
      return { success: false, error: err.message };
    }
  });

  // ── 提取 exe 图标 ──
  ipcMain.handle('extract-icon', async (event, filePath) => {
    try {
      const icon = await app.getFileIcon(filePath, { size: 'normal' });
      return icon.toDataURL();
    } catch (err) {
      console.error('[extract-icon] 错误:', err);
      return null;
    }
  });

  // ── 导入 Markdown 文件 ──
  ipcMain.handle('read-markdown-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'Markdown 文件', extensions: ['md', 'markdown', 'txt'] }],
      title: '选择 Markdown 文件导入'
    });
    if (result.canceled) return { canceled: true };
    const filePath = result.filePaths[0];
    const content = fs.readFileSync(filePath, 'utf-8');
    return {
      canceled: false,
      content,
      fileName: path.basename(filePath, path.extname(filePath))
    };
  });

  // ── 保存快速笔记到文件系统 ──
  ipcMain.handle('save-quick-notes', async (event, data) => {
    try {
      let savePath = data.savePath;
      if (!savePath) {
        savePath = path.join(app.getPath('userData'), 'quicknotes');
      }
      fs.mkdirSync(savePath, { recursive: true });

      const notes = data.notes || [];
      const metadata = [];

      // 收集当前存在的笔记 ID，用于清理已删除笔记的文件夹
      const currentNoteIds = new Set(notes.map(n => n.id));

      // 清理已删除笔记的文件夹
      if (fs.existsSync(savePath)) {
        for (const entry of fs.readdirSync(savePath, { withFileTypes: true })) {
          if (entry.isDirectory() && entry.name.startsWith('qnote_') && !currentNoteIds.has(entry.name)) {
            fs.rmSync(path.join(savePath, entry.name), { recursive: true, force: true });
          }
        }
      }

      for (const note of notes) {
        const noteDir = path.join(savePath, note.id);
        fs.mkdirSync(noteDir, { recursive: true });

        // 写入 content.html
        fs.writeFileSync(path.join(noteDir, 'content.html'), note.content || '', 'utf-8');

        // 写入 drawdata.json（仅当 drawData 非空时）
        const ddPath = path.join(noteDir, 'drawdata.json');
        if (note.drawData) {
          fs.writeFileSync(ddPath, JSON.stringify(note.drawData), 'utf-8');
        } else {
          // drawData 为空但旧文件存在，删除旧文件
          if (fs.existsSync(ddPath)) fs.unlinkSync(ddPath);
        }

        // 写入 overlays（复用已有的 saveOverlays 函数）
        const overlaysDir = path.join(noteDir, 'overlays');
        if (note.overlayImages && note.overlayImages.length > 0) {
          saveOverlays(overlaysDir, note.overlayImages);
        } else {
          // overlayImages 为空但旧目录存在，删除整个 overlays 目录
          if (fs.existsSync(overlaysDir)) {
            fs.rmSync(overlaysDir, { recursive: true, force: true });
          }
        }

        // 元数据索引（不含大体积的 content/overlay/drawData）
        metadata.push({ id: note.id, title: note.title || '' });
      }

      // 写入 quicknotes.json 索引文件
      fs.writeFileSync(path.join(savePath, 'quicknotes.json'), JSON.stringify(metadata, null, 2), 'utf-8');

      return { success: true, path: savePath };
    } catch (err) {
      console.error('[save-quick-notes] 错误:', err);
      return { success: false, error: err.message };
    }
  });

  // ── 从文件系统加载快速笔记 ──
  ipcMain.handle('load-quick-notes', async (event, data) => {
    try {
      let savePath = data ? data.savePath : null;
      if (!savePath) {
        savePath = path.join(app.getPath('userData'), 'quicknotes');
      }

      const manifestPath = path.join(savePath, 'quicknotes.json');
      if (!fs.existsSync(manifestPath)) {
        return { success: true, notes: [], path: savePath };
      }

      const metadata = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      const notes = [];

      for (const entry of metadata) {
        try {
          const noteDir = path.join(savePath, entry.id);
          if (!fs.existsSync(noteDir)) continue;

          const note = { id: entry.id, title: entry.title || '' };

          // 读取 content.html
          const contentPath = path.join(noteDir, 'content.html');
          note.content = fs.existsSync(contentPath) ? fs.readFileSync(contentPath, 'utf-8') : '';

          // 读取 drawdata.json
          const drawDataPath = path.join(noteDir, 'drawdata.json');
          if (fs.existsSync(drawDataPath)) {
            try { note.drawData = JSON.parse(fs.readFileSync(drawDataPath, 'utf-8')); }
            catch { note.drawData = null; }
          } else {
            note.drawData = null;
          }

          // 读取 overlays（复用已有的 loadOverlays 函数）
          const overlaysDir = path.join(noteDir, 'overlays');
          if (fs.existsSync(path.join(overlaysDir, 'manifest.json'))) {
            const overlays = loadOverlays(overlaysDir);
            note.overlayImages = (overlays && overlays.length > 0) ? overlays : [];
          } else {
            note.overlayImages = [];
          }

          notes.push(note);
        } catch (noteErr) {
          console.error('[load-quick-notes] 单条笔记加载失败:', entry.id, noteErr);
        }
      }

      return { success: true, notes, path: savePath };
    } catch (err) {
      console.error('[load-quick-notes] 错误:', err);
      return { success: false, error: err.message };
    }
  });

}

// ── GPU 进程崩溃全局恢复 ──
app.on('gpu-process-crashed', (event, killed) => {
  console.error('[GPU崩溃] GPU 进程终止, killed:', killed);
  // 重启 GPU 进程：重载所有窗口
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.reload();
  }
});

// ── 启动 ──
app.whenReady().then(() => {
  // 注册 astroknot-local:// 协议，用于渲染进程访问本地音视频文件
  // 避免将大文件转成 data URI（Chromium 对此支持不好）
  protocol.handle('astroknot-local', (request) => {
    // URL 格式：astroknot-local://C:/path/to/file.mp4 或 astroknot-local:///path/to/file.mp4
    // 提取 scheme 之后的部分作为文件路径
    let filePath = request.url.replace('astroknot-local://', '');
    // URL 解码
    filePath = decodeURIComponent(filePath);
    // Windows 路径修复：如果以 /C:/ 形式开头，去掉前导 /
    if (/^\/[A-Za-z]:\//.test(filePath)) {
      filePath = filePath.slice(1);
    }
    return net.fetch('file://' + filePath.replace(/\\/g, '/'));
  });

  // ── 首次安装检测：在 userData 目录写入 .installed 标记文件 ──
  function checkFirstRun() {
    const userDataPath = app.getPath('userData');
    const flagFile = path.join(userDataPath, '.astroknot_installed');
    if (fs.existsSync(flagFile)) return false;
    try {
      if (!fs.existsSync(userDataPath)) fs.mkdirSync(userDataPath, { recursive: true });
      fs.writeFileSync(flagFile, app.getVersion(), 'utf-8');
    } catch (_) { /* 写入失败也不影响启动 */ }
    return true;
  }

  // ── IPC：首次安装检测 ──
  ipcMain.handle('check-first-run', () => checkFirstRun());

  bindWindowIPC();
  bindFileIPC();
  bindEmergencyIPC();
  bindVersionGraphIPC();
  createWindow();
  startHMR();

  // ── before-quit 兜底：正常退出/重启时触发渲染进程同步落盘应急备份 ──
  // 覆盖：点关闭、Alt+F4、系统关机。不覆盖：任务管理器强杀/断电（由定时备份兼底）
  let _flushing = false;
  app.on('before-quit', (e) => {
    if (_flushing) return;
    const win = mainWindow;
    if (!win || win.isDestroyed()) return;
    e.preventDefault();
    _flushing = true;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      app.exit(0);
    };
    try {
      win.webContents.send('emergency-flush');
      win.webContents.once('ipc-message', (_e, channel) => {
        if (channel === 'emergency-flush-ready') finish();
      });
    } catch (_) { finish(); }
    // 超时保险：2 秒后强制退出，避免卡死
    setTimeout(finish, 2000);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
