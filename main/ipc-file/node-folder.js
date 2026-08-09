// ============================================================
//  main/ipc-file/node-folder.js — 节点文件夹操作 IPC
// ============================================================
const { ipcMain, dialog, app, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const dataSettings = require('../../data-settings');
const { getNodeFolderName } = require('./helpers');

function bindNodeFolderIPC(mainWindow) {

  // 创建项目文件夹
  ipcMain.handle('create-project-folder', async (event, savePath, projectName, allowDialog) => {
    try {
      const safeName = projectName || '未命名项目';
      let rootPath = savePath;

      if (!rootPath) {
        if (!allowDialog) return { success: false, skipped: true };
        const result = await dialog.showOpenDialog(mainWindow, {
          properties: ['openDirectory'],
          title: '选择项目保存位置',
          buttonLabel: '选择此文件夹'
        });
        if (result.canceled) return { success: false, canceled: true };
        rootPath = result.filePaths[0];
      }

      let projectDir = path.join(rootPath, safeName);
      let counter = 2;
      while (fs.existsSync(projectDir)) {
        const projectJsonPath = path.join(projectDir, 'project.json');
        let isOrphaned = false;

        if (!fs.existsSync(projectJsonPath)) {
          isOrphaned = true;
        } else {
          try {
            const projData = JSON.parse(fs.readFileSync(projectJsonPath, 'utf-8'));
            const hasChildren = projData.methodsTree?.children?.length > 0;
            const nodesDir = path.join(projectDir, 'nodes');
            let hasNodeFiles = false;
            if (fs.existsSync(nodesDir)) {
              hasNodeFiles = fs.readdirSync(nodesDir).length > 0;
            }
            if (!hasChildren && !hasNodeFiles) {
              isOrphaned = true;
            }
          } catch (e) {
            isOrphaned = true;
          }
        }

        if (isOrphaned) {
          try {
            fs.rmSync(projectDir, { recursive: true, force: true });
            console.log('[create-project-folder] 清理孤立文件夹:', projectDir);
            break;
          } catch (e) {
            console.warn('[create-project-folder] 清理孤立文件夹失败:', e);
          }
        }
        projectDir = path.join(rootPath, `${safeName} (${counter})`);
        counter++;
      }
      const finalName = path.basename(projectDir);

      fs.mkdirSync(projectDir, { recursive: true });
      fs.mkdirSync(path.join(projectDir, 'nodes'), { recursive: true });

      const initialData = {
        projectName: finalName,
        methodsTree: { id: 'root', name: '根', children: [] },
        crossEdges: [],
        positions: {},
        positions2D: {},
        layers: [{ id: 'layer_default', name: '默认图层', visible: true, locked: false, nodeIds: [] }],
        currentLayerId: 'layer_default',
        treeEdgeLabels: {},
        cameraView: null
      };
      fs.writeFileSync(
        path.join(projectDir, 'project.json'),
        JSON.stringify(initialData, null, 2),
        'utf-8'
      );

      return { success: true, path: projectDir, rootPath, finalName };
    } catch (err) {
      console.error('[create-project-folder] 错误:', err);
      return { success: false, error: err.message };
    }
  });

  // 创建节点文件夹
  ipcMain.handle('create-node-folder', async (event, projectFolderPath, node) => {
    if (!projectFolderPath || !node) return { success: false, skipped: true };
    try {
      const folderName = getNodeFolderName(node);
      const nodeDir = path.join(projectFolderPath, 'nodes', folderName);
      fs.mkdirSync(nodeDir, { recursive: true });
      fs.mkdirSync(path.join(nodeDir, 'sandbox'), { recursive: true });
      fs.mkdirSync(path.join(nodeDir, 'overlays'), { recursive: true });
      return { success: true, diskPath: nodeDir };
    } catch (err) {
      console.error('[create-node-folder] 错误:', err);
      return { success: false, error: err.message };
    }
  });

  // 删除节点文件夹
  ipcMain.handle('delete-node-folder', async (event, projectFolderPath, node) => {
    if (!projectFolderPath || !node) return { success: false, skipped: true };
    try {
      const folderName = getNodeFolderName(node);
      const nodeDir = path.join(projectFolderPath, 'nodes', folderName);
      if (fs.existsSync(nodeDir)) {
        fs.rmSync(nodeDir, { recursive: true, force: true });
      }
      return { success: true };
    } catch (err) {
      console.error('[delete-node-folder] 错误:', err);
      return { success: false, error: err.message };
    }
  });

  // 写入节点 content.html
  ipcMain.handle('write-node-content', async (event, projectFolderPath, node, content) => {
    if (!projectFolderPath || !node) return { success: false, skipped: true };
    try {
      const folderName = getNodeFolderName(node);
      const nodeDir = path.join(projectFolderPath, 'nodes', folderName);
      fs.mkdirSync(nodeDir, { recursive: true });
      fs.writeFileSync(path.join(nodeDir, 'content.html'), content || '', 'utf-8');
      return { success: true };
    } catch (err) {
      console.error('[write-node-content] 错误:', err);
      return { success: false, error: err.message };
    }
  });

  // 打开节点文件夹（在文件管理器中定位）
  ipcMain.handle('show-node-folder', async (event, projectFolderPath, node) => {
    if (!projectFolderPath || !node) return { success: false, error: '缺少参数' };
    try {
      const folderName = getNodeFolderName(node);
      const nodeDir = path.join(projectFolderPath, 'nodes', folderName);
      if (!fs.existsSync(nodeDir)) {
        // 文件夹不存在时定位到 nodes 目录
        const nodesDir = path.join(projectFolderPath, 'nodes');
        if (fs.existsSync(nodesDir)) {
          shell.showItemInFolder(nodesDir);
          return { success: true, path: nodesDir, fallback: true };
        }
        return { success: false, error: 'not_found' };
      }
      shell.showItemInFolder(nodeDir);
      return { success: true, path: nodeDir };
    } catch (err) {
      console.error('[show-node-folder] 错误:', err);
      return { success: false, error: err.message };
    }
  });

  // 删除项目文件夹
  ipcMain.handle('delete-project-folder', async (event, projectFolderPath) => {
    if (!projectFolderPath) return { success: false, skipped: true };
    try {
      if (fs.existsSync(projectFolderPath)) {
        fs.rmSync(projectFolderPath, { recursive: true, force: true });
        console.log('[delete-project-folder] 已删除:', projectFolderPath);
      }
      return { success: true };
    } catch (err) {
      console.error('[delete-project-folder] 错误:', err);
      return { success: false, error: err.message };
    }
  });

  // 删除未保存项目的临时文件夹
  ipcMain.handle('delete-sandbox-tmp-folder', async (event, projectId) => {
    if (!projectId) return { success: false, skipped: true };
    try {
      const tmpDirNew = dataSettings.getSandboxTmpDir(projectId);
      const tmpDirOld = path.join(app.getPath('userData'), 'sandbox-tmp', projectId);

      if (tmpDirNew && fs.existsSync(tmpDirNew)) {
        fs.rmSync(tmpDirNew, { recursive: true, force: true });
        console.log('[delete-sandbox-tmp-folder] 已删除新目录:', tmpDirNew);
      }
      if (fs.existsSync(tmpDirOld)) {
        fs.rmSync(tmpDirOld, { recursive: true, force: true });
        console.log('[delete-sandbox-tmp-folder] 已删除旧目录:', tmpDirOld);
      }
      return { success: true };
    } catch (err) {
      console.error('[delete-sandbox-tmp-folder] 错误:', err);
      return { success: false, error: err.message };
    }
  });
}

module.exports = { bindNodeFolderIPC };