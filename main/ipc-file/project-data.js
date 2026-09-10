// ============================================================
//  main/ipc-file/project-data.js — 项目数据读写辅助函数
// ============================================================
const path = require('path');
const fs = require('fs');
const {
  collectTreeNodeIds, getNodeFolderName, sanitizeNodeFolderName,
  saveOverlays, loadOverlays,
  _writeFileSystemToDisk, _readFileSystemFromDiskBinary,
  generateProjectMd,
} = require('./helpers');

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

module.exports = { _writeProjectToDisk, _readProjectData };