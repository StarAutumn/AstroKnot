// ============================================================
//  main/ipc-file/project-io.js — 项目 I/O IPC 处理函数
// ============================================================
const { ipcMain, dialog, shell, app } = require('electron');
const path = require('path');
const fs = require('fs');
const dataSettings = require('../../data-settings');
const {
  BINARY_EXTENSIONS, extractDataUriExt, dataUriToBuffer, bufferToDataUri,
  saveOverlays, loadOverlays,
  _writeFileSystemToDisk, _readFileSystemFromDisk, _readFileSystemFromDiskBinary,
  _copyDirSync, generateProjectMd, collectTreeNodeIds,
  sanitizeNodeFolderName, getNodeFolderName, sanitizeFileName, atomicWrite,
} = require('./helpers');

// ── IPC：项目 I/O ──
function bindProjectIOIPC(mainWindow) {
  // ════════════════════════════════════════════════════════════
  //  项目磁盘读写辅助函数（供 save-project / load-project / 回收站共用）
  // ════════════════════════════════════════════════════════════

  /**
   * 将项目数据写入指定目录（project.json + nodes/ + project.md）
   * @param {string} savePath - 项目文件夹路径
   * @param {Object} projectData - 项目数据（含 nodeRichContents/overlayImages/nodeFileSystems 等）
   * @returns {{ success: boolean, path?: string, error?: string }}
   */
  function _writeProjectToDisk(savePath, projectData) {
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

    // 收集当前存在的节点，建立 nodeId -> node 映射
    const currentNodes = collectTreeNodeIds(projectCore.methodsTree);
    const nodeMap = new Map(currentNodes.map(n => [n.id, n]));

    // 补充来自 nodeRichContents/overlayImages/nodeFileSystems 的 nodeId
    if (nodeRichContents) for (const id of Object.keys(nodeRichContents)) {
      if (!nodeMap.has(id)) nodeMap.set(id, { id, name: '未知节点' });
    }
    if (overlayImages) for (const id of Object.keys(overlayImages)) {
      if (!nodeMap.has(id)) nodeMap.set(id, { id, name: '未知节点' });
    }
    if (nodeFileSystems) for (const id of Object.keys(nodeFileSystems)) {
      if (!nodeMap.has(id)) nodeMap.set(id, { id, name: '未知节点' });
    }

    // 建立文件夹名集合（用于清理检测）
    const currentFolderNames = new Set([...nodeMap.values()].map(n => getNodeFolderName(n)));

    if (fs.existsSync(nodesDir)) {
      for (const folder of fs.readdirSync(nodesDir, { withFileTypes: true })) {
        if (folder.isDirectory() && !currentFolderNames.has(folder.name)) {
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
      const node = nodeMap.get(nodeId);
      const folderName = node ? getNodeFolderName(node) : sanitizeNodeFolderName('未知节点') + '_' + nodeId.slice(0, 8);
      const nodeDir = path.join(nodesDir, folderName);
      const overlaysDir = path.join(nodeDir, 'overlays');
      saveOverlays(overlaysDir, overlays);
    }

    // 写入每个节点的沙盒代码文件（虚拟文件系统 → 真实磁盘文件）
    for (const [nodeId, fileSystem] of Object.entries(nodeFileSystems || {})) {
      if (!fileSystem) continue;
      const node = nodeMap.get(nodeId);
      const folderName = node ? getNodeFolderName(node) : sanitizeNodeFolderName('未知节点') + '_' + nodeId.slice(0, 8);
      const sandboxDir = path.join(nodesDir, folderName, 'sandbox');
      // 先清空旧的 sandbox 目录，避免残留已删除的文件
      if (fs.existsSync(sandboxDir)) {
        fs.rmSync(sandboxDir, { recursive: true, force: true });
      }
      // 递归写入文件树
      _writeFileSystemToDisk(fileSystem, sandboxDir);
    }

    // 生成 project.md
    generateProjectMd(savePath, projectCore, nodeRichContents, overlayImages);

    return { success: true, path: savePath };
  }

  /**
   * 从文件夹读取项目数据（project.json + nodes/）
   * @param {string} folderPath - 项目文件夹路径
   * @returns {{ success: boolean, data?: Object, folderName?: string, folderPath?: string, error?: string }}
   */
  function _readProjectData(folderPath) {
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
        const folderName = entry.name;
        const nodeDir = path.join(nodesDir, folderName);

        // 从文件夹名解析 nodeId（格式：节点名称_[nodeId前8位]）
        const nodeIdMatch = folderName.match(/_(.+)$/);
        const nodeId = nodeIdMatch ? nodeIdMatch[1] : folderName;

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
          const fsTree = _readFileSystemFromDiskBinary(sandboxDir, true);
          if (fsTree && fsTree.children && fsTree.children.length > 0) {
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
  }

  // ── 选择文件夹 ──
  ipcMain.handle('select-folder', async () => {
    const defaultPath = dataSettings.getProjectsDir();
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: '选择文件夹',
      defaultPath: defaultPath || undefined
    });
    if (result.canceled) return { canceled: true };
    return { canceled: false, path: result.filePaths[0] };
  });

  // ── 选择加载文件夹 ──
  ipcMain.handle('select-folder-for-load', async () => {
    const defaultPath = dataSettings.getProjectsDir();
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: '选择项目文件夹',
      defaultPath: defaultPath || undefined
    });
    if (result.canceled) return { canceled: true };
    return { canceled: false, path: result.filePaths[0] };
  });

  // ── 选择背景图片文件（图片/动图）──
  ipcMain.handle('select-image-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      title: '选择背景图片或动图',
      filters: [
        { name: '图片文件', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'avif'] }
      ]
    });
    if (result.canceled) return { canceled: true };
    return { canceled: false, path: result.filePaths[0] };
  });

  // ── 选择外部程序（桌面模式添加快捷方式）──
  ipcMain.handle('select-external-app', async () => {
    const filters = process.platform === 'win32'
      ? [
          { name: '程序与快捷方式', extensions: ['exe', 'lnk', 'bat', 'cmd', 'url', 'com', 'msi'] },
          { name: '所有文件', extensions: ['*'] }
        ]
      : process.platform === 'darwin'
      ? [
          { name: '应用程序', extensions: ['app', 'command', 'sh', 'workflow'] },
          { name: '所有文件', extensions: ['*'] }
        ]
      : [
          { name: '程序', extensions: ['desktop', 'sh', 'bin'] },
          { name: '所有文件', extensions: ['*'] }
        ];
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      title: '选择外部程序',
      filters
    });
    if (result.canceled) return { canceled: true };
    const filePath = result.filePaths[0];
    const name = filePath.split(/[/\\]/).pop().replace(/\.[^.]+$/, '');
    return { canceled: false, path: filePath, name };
  });

  // ── 保存项目到文件夹 ──
  ipcMain.handle('save-project', async (event, projectData) => {
    try {
      let savePath = projectData.savePath;
      const projectName = projectData.projectName || 'knowledge_graph';
      let rootPath;

      if (!savePath) {
        const defaultPath = dataSettings.getProjectsDir();
        const result = await dialog.showOpenDialog(mainWindow, {
          properties: ['openDirectory'],
          title: '选择保存位置',
          buttonLabel: '选择此文件夹',
          defaultPath: defaultPath || undefined
        });
        if (result.canceled) return { canceled: true };
        rootPath = result.filePaths[0];
        savePath = path.join(rootPath, projectName);
      } else {
        rootPath = savePath;
        savePath = path.join(savePath, projectName);
      }

      const result = _writeProjectToDisk(savePath, projectData);
      if (!result.success) {
        return { success: false, error: result.error };
      }

      return { success: true, path: savePath, rootPath: rootPath };
    } catch (err) {
      console.error('[save-project] 错误:', err);
      return { success: false, error: err.message };
    }
  });

  // ── 列出保存目录中的所有项目（启动时加载最近项目列表）──
  ipcMain.handle('list-projects', async () => {
    try {
      const savePath = dataSettings.getProjectsDir();
      if (!savePath || !fs.existsSync(savePath)) return { list: [] };

      const list = [];
      const entries = fs.readdirSync(savePath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const projectJsonPath = path.join(savePath, entry.name, 'project.json');
        if (!fs.existsSync(projectJsonPath)) continue;
        try {
          const data = JSON.parse(fs.readFileSync(projectJsonPath, 'utf-8'));
          const stat = fs.statSync(projectJsonPath);
          list.push({
            name: data.projectName || entry.name,
            folderPath: path.join(savePath, entry.name),
            savedAt: stat.mtimeMs
          });
        } catch (_) {}
      }
      list.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
      return { list };
    } catch (err) {
      console.error('[list-projects] 错误:', err);
      return { list: [] };
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

      const readResult = _readProjectData(folderPath);
      if (!readResult.success) {
        return { success: false, error: readResult.error };
      }

      return {
        success: true,
        data: readResult.data,
        folderName: readResult.folderName,
        folderPath: readResult.folderPath
      };
    } catch (err) {
      console.error('[load-project] 错误:', err);
      return { success: false, error: err.message };
    }
  });

  // ── 从指定文件夹路径加载项目（无需弹窗选择，供最近项目打开使用）──
  ipcMain.handle('load-project-from-folder', async (event, folderPath) => {
    try {
      if (!folderPath || !fs.existsSync(folderPath)) {
        return { success: false, error: '文件夹不存在' };
      }
      const readResult = _readProjectData(folderPath);
      if (!readResult.success) {
        return { success: false, error: readResult.error };
      }
      return {
        success: true,
        data: readResult.data,
        folderName: readResult.folderName,
        folderPath: readResult.folderPath
      };
    } catch (err) {
      console.error('[load-project-from-folder] 错误:', err);
      return { success: false, error: err.message };
    }
  });

  // ── 无弹窗版：从指定文件夹读取项目数据（供回收站恢复使用）──
  ipcMain.handle('read-project-from-folder', async (event, folderPath) => {
    try {
      if (!folderPath || !fs.existsSync(folderPath)) {
        return { success: false, error: '项目文件夹不存在' };
      }
      const readResult = _readProjectData(folderPath);
      if (!readResult.success) {
        return { success: false, error: readResult.error };
      }
      return {
        success: true,
        data: readResult.data,
        folderName: readResult.folderName,
        folderPath: readResult.folderPath
      };
    } catch (err) {
      console.error('[read-project-from-folder] 错误:', err);
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

  // ── 在文件管理器中显示沙盒文件所在目录 ──
  ipcMain.handle('show-sandbox-file-in-folder', async (event, projectFolderPath, nodeId, vfsPath) => {
    try {
      let baseDir;
      if (projectFolderPath) {
        baseDir = path.join(projectFolderPath, 'nodes', nodeId, 'sandbox');
      } else {
        const tmpDir = dataSettings.getSandboxTmpDir(nodeId);
        baseDir = tmpDir || path.join(app.getPath('userData'), 'sandbox-tmp', nodeId, 'sandbox');
      }

      if (!fs.existsSync(baseDir)) {
        return { success: false, error: 'Sandbox 目录不存在，请先保存文件' };
      }

      const relativePath = (vfsPath || '').replace(/^\//, '');
      const diskPath = relativePath ? path.join(baseDir, relativePath) : baseDir;

      if (fs.existsSync(diskPath)) {
        shell.showItemInFolder(diskPath);
        return { success: true };
      }

      shell.showItemInFolder(baseDir);
      return { success: true };
    } catch (err) {
      console.error('[show-sandbox-file-in-folder] 错误:', err);
      return { success: false, error: err.message };
    }
  });

  // ── 另存为项目 ──
  ipcMain.handle('save-project-as', async (event, sourcePath, projectName) => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: '选择另存为位置',
        buttonLabel: '选择此文件夹'
      });
      if (result.canceled) return { canceled: true };

      const targetParent = result.filePaths[0];
      const targetPath = path.join(targetParent, projectName);

      if (fs.existsSync(targetPath)) {
        const confirmResult = await dialog.showMessageBox(mainWindow, {
          type: 'question',
          buttons: ['覆盖', '取消'],
          title: '确认覆盖',
          message: `目标文件夹 "${projectName}" 已存在，是否覆盖？`
        });
        if (confirmResult.response !== 0) return { canceled: true };
        fs.rmSync(targetPath, { recursive: true, force: true });
      }

      fs.cpSync(sourcePath, targetPath, { recursive: true });

      return { canceled: false, path: targetPath };
    } catch (err) {
      console.error('[save-project-as] 错误:', err);
      return { canceled: true, error: err.message };
    }
  });

  // ── 导出文件 ──
  ipcMain.handle('export-file', async (event, data) => {
    try {
      const { content, defaultName, filters } = data;
      const result = await dialog.showSaveDialog(mainWindow, {
        title: '另存为',
        defaultPath: defaultName || 'export.html',
        filters: filters || [{ name: 'HTML 文件', extensions: ['html'] }]
      });
      if (result.canceled) return { canceled: true };

      fs.writeFileSync(result.filePath, content, 'utf-8');
      return { canceled: false, path: result.filePath };
    } catch (err) {
      console.error('[export-file] 错误:', err);
      return { canceled: true, error: err.message };
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
}

module.exports = { bindProjectIOIPC };