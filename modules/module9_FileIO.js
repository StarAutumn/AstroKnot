// ============================================================
//  模块9：文件夹式项目保存/加载
//  架构：
//    ParentFolder/                  用户选择的保存位置
//    └── ProjectName/               以项目名命名的子文件夹
//        ├── project.json           程序数据（树、连线、位置、图层、相机等）
//        ├── project.md             人类可读摘要（自动生成）
//        └── nodes/
//            └── node_xxx/
//                ├── content.html    富文本内容
//                └── overlays/
//                    ├── manifest.json  overlay 元数据
//                    ├── *.png/jpg     原生图片
//                    ├── *.mp4         原生视频
//                    ├── *.mp3         原生音频
//                    └── excel_*.json  电子表格快照（独立文件）
// ============================================================

import * as THREE from 'three';
import { appState } from './module0_AppState.js';
import { saveCurrentProjectData, renderProjectList } from './module2_TreeData.js';
import { buildSceneFromTree } from './VisualComponents/index.js';
import { clearSelected, showToast } from './module5_SelectAndEdit.js';


/**
 * 将加载的数据应用到 appState（新格式和旧格式共用）
 * @param {Object} data - 项目数据
 * @param {string} folderName - 项目名称
 * @param {string} folderPath - 项目路径
 */
function applyLoadedData(data, folderName, folderPath) {
  // 1. 保存当前项目
  if (appState.currentProjectId) {
    saveCurrentProjectData();
  }

  // 2. 创建或更新项目
  let project = appState.projects.find(p => p.name === folderName);
  if (!project) {
    project = {
      id: 'proj_' + Date.now(),
      name: folderName,
      data: null
    };
    appState.projects.push(project);
  }
  appState.currentProjectId = project.id;
  // 记录项目实际所在的文件夹路径，供版本图定位 .versiongraph 目录使用
  // folderPath 是项目文件夹本身（含 project.json），版本图应存于此处的 .versiongraph/
  // 注意：currentProjectSavePath（保存根目录）只能由用户在设置面板中修改，此处不回填
  if (folderPath) {
    project.folderPath = folderPath;
  }

  // 3. 更新 appState 中的数据
  appState.methodsTree = data.methodsTree;
  appState.crossEdges = data.crossEdges || [];
  appState.rebuildNodeMapFromTree();

  // 4. 恢复节点位置
  appState.positions.clear();
  if (data.positions) {
    for (let [id, p] of Object.entries(data.positions)) {
      appState.positions.set(id, new THREE.Vector3(p.x, p.y, p.z));
    }
  }

  appState.positions2D.clear();
  if (data.positions2D) {
    for (let [id, p] of Object.entries(data.positions2D)) {
      appState.positions2D.set(id, { x: p.x, y: p.y });
    }
  }

  // 5. 恢复 2D 折叠状态
  appState.collapsed2D = new Set(data.collapsed2D || []);

  // 6. 恢复图层
  if (data.layers && data.layers.length > 0) {
    appState.layers = data.layers.map(l => ({
      ...l,
      nodeIds: new Set(l.nodeIds || []),
      positions2D: new Map(Object.entries(l.positions2D || {}).map(([k, v]) => [k, v]))
    }));
  } else {
    appState.layers = [];
    appState.initDefaultLayer();
  }
  appState.currentLayerId = data.currentLayerId || (appState.layers[0]?.id || null);
  const curL = appState.getCurrentLayer();
  if (curL) {
    for (const [id, p] of appState.positions2D.entries()) {
      curL.positions2D.set(id, p);
    }
    appState.positions2D = curL.positions2D;
  }

  // 7. 恢复节点富文本内容
  if (data.nodeRichContents) {
    for (let [id, cont] of Object.entries(data.nodeRichContents)) {
      if (appState.nodeMap.has(id)) {
        appState.nodeMap.get(id).richContent = cont;
      }
    }
  }

  // 7b. 恢复覆盖层数据
  if (data.overlayImages) {
    for (let [id, oi] of Object.entries(data.overlayImages)) {
      if (appState.nodeMap.has(id)) {
        appState.nodeMap.get(id).overlayImages = oi;
      }
    }
  }

  // 7c. 恢复树连线标签后备存储
  appState.treeEdgeLabels = new Map();
  if (data.treeEdgeLabels) {
    for (let [key, val] of Object.entries(data.treeEdgeLabels)) {
      appState.treeEdgeLabels.set(key, val);
    }
  }

  // 8. 重建 3D 场景和连线
  buildSceneFromTree();

  // 9. 恢复相机视角
  const cv = data.cameraView || { position: { x: 6, y: 4.5, z: 8 }, target: { x: 0, y: 0.2, z: 0 } };
  appState.camera.position.set(cv.position.x, cv.position.y, cv.position.z);
  appState.controls.target.set(cv.target.x, cv.target.y, cv.target.z);
  appState.controls.update();

  // 10. 更新项目的内存数据（必须在相机恢复之后）
  saveCurrentProjectData();

  // 11. 更新 UI
  clearSelected();
  renderProjectList();

  // 12. 清空历史记录（避免撤销到加载前的状态）
  appState.history.clear();
}

/**
 * 将当前知识网络保存为文件夹
 * 主进程负责拆分数据：project.json + nodes/{id}/content.html + overlays/manifest.json
 */
export async function saveNetworkToFile() {
  // 确保当前项目数据已保存到 projects 数组
  saveCurrentProjectData();

  // 收集节点富文本内容
  let rich = {};
  for (let [id, node] of appState.nodeMap.entries()) {
    if (node.richContent) rich[id] = node.richContent;
  }

  // 收集覆盖层数据
  let overlay = {};
  for (let [id, node] of appState.nodeMap.entries()) {
    if (node.overlayImages && node.overlayImages.length > 0) overlay[id] = node.overlayImages;
  }

  // 收集位置信息（转换为普通对象，便于 JSON 序列化）
  let po = {};
  for (let [id, v] of appState.positions.entries()) {
    po[id] = { x: v.x, y: v.y, z: v.z };
  }

  let p2d = {};
  for (let [id, v] of appState.positions2D.entries()) {
    p2d[id] = { x: v.x, y: v.y };
  }

  // 2D 折叠状态
  const collapsed = Array.from(appState.collapsed2D);

  // 图层
  const layersData = appState.layers.map(l => ({
    id: l.id,
    name: l.name,
    order: l.order,
    nodeIds: Array.from(l.nodeIds || []),
    positions2D: Object.fromEntries(
      [...(l.positions2D || [])].map(([k, v]) => [k, { x: v.x, y: v.y }])
    )
  }));

  // 获取当前项目名称
  const currentProject = appState.projects.find(p => p.id === appState.currentProjectId);
  const projectName = currentProject?.name || 'knowledge_graph';

  // 序列化 treeEdgeLabels
  let tel = {};
  for (let [key, val] of (appState.treeEdgeLabels || new Map()).entries()) {
    tel[key] = val;
  }

  // 构建导出数据对象
  let projectData = {
    projectName: projectName,
    methodsTree: appState.methodsTree,
    crossEdges: appState.crossEdges,
    positions: po,
    positions2D: p2d,
    collapsed2D: collapsed,
    layers: layersData,
    currentLayerId: appState.currentLayerId,
    nodeRichContents: rich,
    overlayImages: overlay,
    treeEdgeLabels: tel,
    savePath: appState.currentProjectSavePath,
    cameraView: {
      position: { x: appState.camera?.position?.x || 6, y: appState.camera?.position?.y || 4.5, z: appState.camera?.position?.z || 8 },
      target: { x: appState.controls?.target?.x || 0, y: appState.controls?.target?.y || 0.2, z: appState.controls?.target?.z || 0 }
    }
  };

  try {
    if (!window.api) {
      showToast('此功能需要在 Electron 环境中运行，请使用 npm start 启动应用');
      return;
    }

    const result = await window.api.saveProject(projectData);

    if (result.canceled) {
      return;
    }

    if (result.success) {
      // 记录项目实际保存的文件夹路径，供版本图定位 .versiongraph 目录
      // 注意：currentProjectSavePath（保存根目录）只能由用户在设置面板中修改，此处不回填
      if (result.path) {
        const proj = appState.projects.find(p => p.id === appState.currentProjectId);
        if (proj) proj.folderPath = result.path;
      }
      showToast(`项目已保存到: ${result.path}`);
    } else {
      showToast('保存失败: ' + (result.error || '未知错误'));
    }
  } catch (err) {
    showToast('保存失败: ' + err.message);
  }
}

/**
 * 批量保存知识网络列表中所有项目
 * 每个项目保存到父目录下的独立子文件夹（以项目名命名）
 */
export async function saveAllProjects() {
  if (!window.api) {
    showToast('此功能需要在 Electron 环境中运行，请使用 npm start 启动应用');
    return;
  }

  // 1. 同步当前项目数据到 projects 数组
  saveCurrentProjectData();

  let savedCount = 0;
  let failedCount = 0;
  // parentPath 是保存根目录（项目文件夹的父目录），用户设置的就是这个
  let parentPath = appState.currentProjectSavePath;

  for (const proj of appState.projects) {
    const data = proj.data;
    if (!data || !data.methodsTree) { failedCount++; continue; }

    const projectName = proj.name || 'knowledge_graph';

    // 序列化 3D 位置（proj.data.positions 是 Map<Vector3>）
    let po = {};
    if (data.positions) {
      for (let [id, v] of data.positions.entries()) {
        po[id] = { x: v.x, y: v.y, z: v.z };
      }
    }

    // 序列化 2D 位置（proj.data.positions2D 是 Map<{x,y}>，需展开为普通对象）
    let p2d = {};
    if (data.positions2D) {
      const entries = data.positions2D instanceof Map
        ? data.positions2D.entries()
        : Object.entries(data.positions2D);
      for (let [id, v] of entries) {
        p2d[id] = { x: v.x, y: v.y };
      }
    }

    let projectData = {
      projectName,
      methodsTree: data.methodsTree,
      crossEdges: data.crossEdges || [],
      positions: po,
      positions2D: p2d,
      collapsed2D: data.collapsed2D || [],
      layers: data.layers || [],
      currentLayerId: data.currentLayerId,
      nodeRichContents: data.nodeRichContents || {},
      overlayImages: data.nodeOverlayImages || {},
      treeEdgeLabels: data.treeEdgeLabels || {},
      savePath: parentPath,
      cameraView: data.cameraView || {
        position: { x: 6, y: 4.5, z: 8 },
        target: { x: 0, y: 0.2, z: 0 }
      }
    };

    try {
      const result = await window.api.saveProject(projectData);
      if (result.canceled) return;  // 用户取消
      if (result.success) {
        savedCount++;
        // 用返回的 rootPath（保存根目录）供后续项目使用
        if (result.rootPath) {
          parentPath = result.rootPath;
        }
        // 记录项目实际保存的文件夹路径，供版本图定位 .versiongraph 目录
        if (result.path) {
          proj.folderPath = result.path;
        }
      } else {
        failedCount++;
      }
    } catch (err) {
      failedCount++;
      console.error('[批量保存] 失败:', proj.name, err);
    }
  }

  showToast(`批量保存完成: ${savedCount} 成功${failedCount > 0 ? ', ' + failedCount + ' 失败' : ''}`);

  // 派发保存事件，供版本图模块监听以自动产生版本站点
  window.dispatchEvent(new CustomEvent('astroknot-project-saved'));
}

export async function loadNetworkFromFile() {
  try {
    if (!window.api) {
      showToast('此功能需要在 Electron 环境中运行，请使用 npm start 启动应用');
      return;
    }

    const result = await window.api.loadProject();

    if (result.canceled) {
      return;
    }

    if (result.success) {
      applyLoadedData(result.data, result.folderName || 'knowledge_graph', result.folderPath);
      showToast('已加载：' + (result.folderName || 'knowledge_graph'));
    } else {
      showToast('加载失败: ' + (result.error || '未知错误'));
    }
  } catch (err) {
    showToast('加载失败: ' + err.message);
  }
}

// ── Markdown 解析：标题层级 → 树节点，正文 → richContent ──

/**
 * 生成唯一节点 ID
 */
function newNodeId() {
  return 'node_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8);
}

/**
 * 解析 Markdown 文本为树形结构和节点内容
 * @param {string} markdown - Markdown 文本
 * @returns {{ tree: Object, nodeRichContents: Object }}
 */
export function parseMarkdownToTree(markdown) {
  const root = {
    id: appState.VIRTUAL_ROOT_ID,
    name: '__VIRTUAL_ROOT__',
    children: [],
    isRoot: true
  };

  const nodeRichContents = {};

  // 栈记录每级最近的父节点引用: [level, nodeId]
  // level 0 = root
  const levelStack = [{ level: 0, nodeId: root.id }];

  let currentNodeId = null;  // 当前正在累积正文的节点 ID
  let textBuffer = [];       // 当前节点的正文缓冲区

  function flushTextBuffer() {
    if (currentNodeId && textBuffer.length > 0) {
      const content = textBuffer.join('\n').trim();
      if (content) {
        nodeRichContents[currentNodeId] = nodeRichContents[currentNodeId]
          ? nodeRichContents[currentNodeId] + '\n' + content
          : content;
      }
      textBuffer = [];
    }
  }

  const lines = markdown.split('\n');
  for (const line of lines) {
    // 匹配 ATX 风格标题 (# 开头)
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      flushTextBuffer();

      const level = headingMatch[1].length;
      let name = headingMatch[2].trim();
      // 移除末尾的 #（闭合标记），如 "## 标题 ##" → "标题"
      name = name.replace(/\s+#+\s*$/, '').trim();
      if (!name) continue;

      const nodeId = newNodeId();

      // 构建节点对象
      const node = {
        id: nodeId,
        name: name,
        children: [],
        isStepFlow: false
      };

      // 找到层级栈中 level < 当前 level 的最近节点作为父节点
      while (levelStack.length > 1 && levelStack[levelStack.length - 1].level >= level) {
        levelStack.pop();
      }
      const parentEntry = levelStack[levelStack.length - 1];

      // 找到父节点并挂载
      function findAndAppend(parentNode, targetId) {
        if (parentNode.id === targetId) {
          parentNode.children.push(node);
          return true;
        }
        if (parentNode.children) {
          for (const child of parentNode.children) {
            if (findAndAppend(child, targetId)) return true;
          }
        }
        return false;
      }

      if (parentEntry.nodeId === root.id) {
        root.children.push(node);
      } else {
        if (!findAndAppend(root, parentEntry.nodeId)) {
          // 回退：挂到 root
          root.children.push(node);
        }
      }

      // 将当前节点入栈
      levelStack.push({ level: level, nodeId: nodeId });

      currentNodeId = nodeId;
    } else {
      // 非标题行 → 正文
      if (currentNodeId) {
        textBuffer.push(line);
      } else {
        // 还没有标题就遇到正文 → 创建默认根节点
        const defaultId = newNodeId();
        const defaultNode = {
          id: defaultId,
          name: '导入内容',
          children: [],
          isStepFlow: false
        };
        root.children.push(defaultNode);
        levelStack.push({ level: 1, nodeId: defaultId });
        currentNodeId = defaultId;
        textBuffer.push(line);
      }
    }
  }

  flushTextBuffer();

  return { tree: root, nodeRichContents };
}

/**
 * 导入 Markdown 文件并创建新的知识网络项目
 */
export async function importMarkdownFile() {
  try {
    if (!window.api) {
      showToast('此功能需要在 Electron 环境中运行，请使用 npm start 启动应用');
      return;
    }

    const result = await window.api.readMarkdownFile();

    if (result.canceled) {
      return;
    }

    // 解析 Markdown 为树结构
    const { tree, nodeRichContents } = parseMarkdownToTree(result.content);

    if (!tree.children || tree.children.length === 0) {
      showToast('未能从 Markdown 文件中解析出内容，文件可能为空');
      return;
    }

    const projectName = result.fileName || '导入的Markdown';
    const projectId = 'proj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);

    // 构建项目数据
    const projectData = {
      methodsTree: tree,
      crossEdges: [],
      positions: {},
      positions2D: {},
      collapsed2D: [],
      layers: [],
      currentLayerId: null,
      nodeRichContents: nodeRichContents,
      overlayImages: {},
      cameraView: {
        position: { x: 6, y: 4.5, z: 8 },
        target: { x: 0, y: 0.2, z: 0 }
      },
      treeEdgeLabels: {}
    };

    // 保存当前项目
    if (appState.currentProjectId) {
      saveCurrentProjectData();
    }

    // 创建新项目
    const project = {
      id: projectId,
      name: projectName,
      data: projectData
    };
    appState.projects.push(project);
    appState.currentProjectId = projectId;

    // 应用数据
    applyLoadedData(projectData, projectName, null);

    showToast('已导入 Markdown：' + projectName);
  } catch (err) {
    showToast('Markdown 导入失败: ' + err.message);
    console.error('[importMarkdownFile] 错误:', err);
  }
}
