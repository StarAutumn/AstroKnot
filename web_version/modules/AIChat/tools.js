// ============================================================
//  AIChat 工具层：Agent 工具分发器 + 16 个操作实现
// ============================================================

import { API_PROVIDERS, TOOL_DISPLAY_NAMES } from './config.js';
import { getApiKey, getCurrentModel, getCustomModels, resolveProviderAndKey, fetchWithRetry } from './api.js';
import { parseMarkdownToTree } from '../module9_FileIO.js';
import { buildSceneFromTree, destroyNodeMesh } from '../VisualComponents/index.js';

// ─── 辅助：刷新 3D + 2D 视图 ──────────────────────────
function _refreshViews() {
  buildSceneFromTree();
  if (typeof appState.refresh2DView === 'function') appState.refresh2DView();
}
export function refreshViews() { _refreshViews(); }

// ─── 状态快照（回退对话时恢复图谱） ─────────────────
const _stateSnapshots = []; // 按 historyIdx 索引

function _deepClone(obj) {
  if (!obj) return obj;
  return JSON.parse(JSON.stringify(obj));
}

function _cloneMap(map) {
  if (!map) return new Map();
  return new Map(JSON.parse(JSON.stringify(Array.from(map.entries()))));
}

export function saveStateSnapshot(historyIdx) {
  if (!appState) return;
  _stateSnapshots[historyIdx] = {
    methodsTree: _deepClone(appState.methodsTree),
    positions: _cloneMap(appState.positions),
    positions2D: _cloneMap(appState.positions2D),
    crossEdges: _deepClone(appState.crossEdges),
    layers: (appState.layers || []).map(function(l) {
      return {
        id: l.id,
        name: l.name,
        order: l.order,
        nodeIds: l.nodeIds ? Array.from(l.nodeIds) : [],
        positions2D: l.positions2D ? Array.from(l.positions2D.entries()) : []
      };
    })
  };
}

export function restoreStateSnapshot(historyIdx) {
  const snap = _stateSnapshots[historyIdx];
  if (!snap) return;

  // 用 destroyNodeMesh 从 Three.js scene 中彻底移除旧网格（含 dispose）
  if (appState.nodeMeshes) {
    for (const id of Array.from(appState.nodeMeshes.keys())) {
      destroyNodeMesh(id);
    }
  }

  appState.methodsTree = _deepClone(snap.methodsTree);
  appState.positions = _cloneMap(snap.positions);
  appState.positions2D = _cloneMap(snap.positions2D);
  appState.crossEdges = _deepClone(snap.crossEdges);
  // 重建 layers，恢复 Map/Set 类型
  appState.layers = (snap.layers || []).map(function(l) {
    var restored = {
      id: l.id,
      name: l.name,
      order: l.order,
      nodeIds: new Set(l.nodeIds || []),
      positions2D: new Map(l.positions2D || [])
    };
    return restored;
  });

  // 重建 nodeMap
  if (appState.rebuildNodeMapFromTree) appState.rebuildNodeMapFromTree();

  // 刷新视图
  _refreshViews();
}

function _collectNodeIds(tree) {
  var ids = [];
  function walk(n) {
    if (n && n.id && n.id !== appState.VIRTUAL_ROOT_ID) ids.push(n.id + '|' + (n.name || ''));
    if (n && n.children) n.children.forEach(walk);
  }
  walk(tree);
  return ids;
}

export function getSnapshotDiff(historyIdx) {
  var snap = _stateSnapshots[historyIdx];
  if (!snap) return null;
  var currentIds = _collectNodeIds(appState.methodsTree);
  var snapIds = _collectNodeIds(snap.methodsTree);
  var currentSet = {};
  var snapSet = {};
  currentIds.forEach(function(x) { currentSet[x] = true; });
  snapIds.forEach(function(x) { snapSet[x] = true; });

  var added = [];
  var removed = [];
  currentIds.forEach(function(x) {
    if (!snapSet[x]) added.push(x);
  });
  snapIds.forEach(function(x) {
    if (!currentSet[x]) removed.push(x);
  });

  // 连线变化
  var currentEdges = appState.crossEdges || [];
  var snapEdges = snap.crossEdges || [];
  var currentEdgeSet = {};
  var snapEdgeSet = {};
  currentEdges.forEach(function(e) { currentEdgeSet[e.source + '→' + e.target] = true; });
  snapEdges.forEach(function(e) { snapEdgeSet[e.source + '→' + e.target] = true; });
  var addedEdges = currentEdges.filter(function(e) { return !snapEdgeSet[e.source + '→' + e.target]; });
  var removedEdges = snapEdges.filter(function(e) { return !currentEdgeSet[e.source + '→' + e.target]; });

  return { added: added, removed: removed, addedEdges: addedEdges, removedEdges: removedEdges };
}

// ─── 暂存待导入的 Markdown（预览 → 确认导入） ────────
let _pendingMarkdown = null;
let _pendingTopic = null;
let _pendingParentId = null;

export function getPendingMarkdown() { return _pendingMarkdown; }
export function getPendingTopic() { return _pendingTopic; }
export function getPendingParentId() { return _pendingParentId; }
export function clearPendingMarkdown() { _pendingMarkdown = null; _pendingTopic = null; _pendingParentId = null; }

// ─── 项目上下文注入 ─────────────────────────────────
export function buildProjectContext() {
  if (!appState || !appState.nodeMap) return '';

  const nodes = Array.from(appState.nodeMap.values());
  if (nodes.length === 0) return '（当前知识图谱为空）';

  const nodeSummaries = nodes.slice(0, 30).map(function(n) {
    const layer = appState.getLayerForNode ? appState.getLayerForNode(n.id) : null;
    const layerName = layer ? layer.name : '默认';
    const contentPreview = n.content ?
      n.content.replace(/<[^>]+>/g, '').slice(0, 80) : '(无内容)';
    return `- [${n.id}] ${n.name} (图层: ${layerName})${contentPreview ? ': ' + contentPreview : ''}`;
  });

  let context = `当前知识图谱概览：\n`;
  context += `节点总数: ${nodes.length}\n`;
  context += `当前图层: ${appState.getCurrentLayer()?.name || '默认'}\n`;
  context += `\n节点列表（前30个）：\n${nodeSummaries.join('\n')}`;

  if (nodes.length > 30) {
    context += `\n... 还有 ${nodes.length - 30} 个节点未显示`;
  }

  return context;
}

// ─── 工具名称显示（中文友好）─────────────────────
export function getToolDisplayName(toolName) {
  return TOOL_DISPLAY_NAMES[toolName] || toolName;
}

// ─── 工具执行分发器 ────────────────────────────────
export async function executeToolCall(toolName, args) {
  try {
    switch (toolName) {
      case 'buildTree': {
        if (!args.name) return { error: '缺少必要参数: name' };
        const result = await buildTree(args, null);
        await autoArrange(false);
        return { success: true, totalNodes: result.count, message: `已构建完整树形结构，共 ${result.count} 个节点，布局已自动整理` };
      }
      case 'scaffoldKnowledge': {
        if (!args.topic) return { error: '缺少必要参数: topic' };
        const scaffoldResult = await scaffoldKnowledge(args.topic, args.depth || 3, args.style || 'tutorial');
        await autoArrange(false);
        return { success: true, totalNodes: scaffoldResult.count, message: `已构建「${args.topic}」知识图谱，共 ${scaffoldResult.count} 个节点，所有内容已填充，布局已自动整理` };
      }
      case 'generateKnowledgeTree': {
        if (!args.markdown || !args.topic) return { error: '缺少必要参数: markdown/topic' };
        const mdResult = await generateKnowledgeTree(args.markdown, args.topic, args.parentId);
        return mdResult;
      }
      case 'getTreeMarkdown': {
        const exportResult = getTreeMarkdown(args.maxDepth || 6, args.includeContent !== false);
        return exportResult;
      }
      case 'batchCreateNodes': {
        if (!args.nodes || !args.nodes.length) return { error: '节点列表不能为空' };
        const results = await batchCreateNodes(args.nodes);
        return { success: true, createdCount: results.length, nodeIds: results, message: `批量创建 ${results.length} 个节点成功` };
      }
      case 'createTextNode': {
        if (!args.name) return { error: '缺少必要参数: name' };
        const newNodeId = await createRootNode(args.name, args.content, false);
        return { success: true, nodeId: newNodeId, message: `已创建文本节点 "${args.name}"` };
      }
      case 'createStepNode': {
        if (!args.name) return { error: '缺少必要参数: name' };
        const newNodeId = await createRootNode(args.name, args.content, true);
        return { success: true, nodeId: newNodeId, message: `已创建步骤节点 "${args.name}"` };
      }
      case 'createChildNode': {
        if (!args.parentId || !args.name) return { error: '缺少必要参数: parentId/name' };
        const parentNode = appState.nodeMap.get(args.parentId);
        if (!parentNode) return { error: '父节点不存在: ' + args.parentId };
        const newNodeId = await createChildNode(args.parentId, args.name, args.content, false);
        return { success: true, nodeId: newNodeId, message: `已为 "${parentNode.name}" 创建子节点 "${args.name}"` };
      }
      case 'createNextStepNode': {
        if (!args.parentId || !args.name) return { error: '缺少必要参数: parentId/name' };
        const parentNode = appState.nodeMap.get(args.parentId);
        if (!parentNode) return { error: '父节点不存在: ' + args.parentId };
        const newNodeId = await createChildNode(args.parentId, args.name, args.content, true);
        return { success: true, nodeId: newNodeId, message: `已为 "${parentNode.name}" 创建下一步 "${args.name}"` };
      }
      case 'addConnection': {
        if (!args.sourceId || !args.targetId) return { error: '缺少必要参数: sourceId/targetId' };
        await addConnection(args.sourceId, args.targetId, args.label);
        return { success: true, message: `已添加连线 ${args.label || ''}` };
      }
      case 'removeConnection': {
        if (!args.sourceId || !args.targetId) return { error: '缺少必要参数: sourceId/targetId' };
        await removeConnection(args.sourceId, args.targetId);
        return { success: true, message: '已删除连线' };
      }
      case 'setNodeSize': {
        if (!args.nodeId) return { error: '缺少必要参数: nodeId' };
        return await setNodeSize(args.nodeId, args.size);
      }
      case 'setNodeColor': {
        if (!args.nodeId) return { error: '缺少必要参数: nodeId' };
        return await setNodeColor(args.nodeId, args.color);
      }
      case 'setNodeShape': {
        if (!args.nodeId) return { error: '缺少必要参数: nodeId' };
        return await setNodeShape(args.nodeId, args.shape2D, args.shape3D);
      }
      case 'searchNodes': {
        const results = await searchNodes(args.keyword, args.limit);
        return { results: results };
      }
      case 'getNodeContent': {
        const content = await getNodeContent(args.nodeId);
        return { content: content };
      }
      case 'getGraphOverview': {
        return await getGraphOverview();
      }
      case 'updateNodeContent': {
        await updateNodeContent(args.nodeId, args.content);
        return { success: true, message: '已更新节点内容' };
      }
      case 'deleteNode': {
        if (!args.confirm) return { error: '需要确认删除（设置confirm为true）' };
        await deleteNode(args.nodeId);
        return { success: true, message: '已删除节点' };
      }
      case 'autoArrange': {
        await autoArrange(args.allLayers);
        return { success: true, message: args.allLayers ? '已排列所有图层' : '已排列当前图层' };
      }
      default:
        return { error: `未知工具: ${toolName}` };
    }
  } catch (err) {
    return { error: err.message };
  }
}

// ─── 具体操作实现 ────────────────────────────────────

async function createRootNode(name, content, isStepFlow) {
  const createFn = window.createNodeInProject;
  if (createFn) {
    const id = createFn({
      name: name,
      desc: isStepFlow ? '📖 步骤节点' : '📖 顶层节点',
      sizeScale: 2.0,
      isStepFlow: isStepFlow
    });
    if (content && id) {
      const node = appState.nodeMap.get(id);
      if (node) node.content = content;
    }
    return id;
  }
  const id = 'node_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  const newNode = {
    id: id, name: name, desc: isStepFlow ? '📖 步骤节点' : '📖 顶层节点',
    children: [], sizeScale: 2.0, content: content || ''
  };
  if (isStepFlow) newNode.isStepFlow = true;
  appState.methodsTree.children = appState.methodsTree.children || [];
  appState.methodsTree.children.push(newNode);
  appState.rebuildNodeMapFromTree();
  appState.addNodeToCurrentLayer(id);
  _refreshViews();
  return id;
}

async function createChildNode(parentId, name, content, isStepFlow) {
  const createFn = window.createNodeInProject;
  if (createFn) {
    const id = createFn({
      name: name,
      desc: '📖 自定义节点',
      sizeScale: 1.0,
      parentId: parentId,
      offsetX: isStepFlow ? 0 : 160,
      offsetY: isStepFlow ? 60 : 10,
      isStepFlow: isStepFlow
    });
    if (content && id) {
      const node = appState.nodeMap.get(id);
      if (node) node.content = content;
    }
    return id;
  }
  const parentNode = appState.nodeMap.get(parentId);
  if (!parentNode) throw new Error('父节点不存在');
  const id = 'node_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  const newNode = {
    id: id, name: name, desc: '📖 自定义节点',
    children: [], sizeScale: 1.0, content: content || ''
  };
  if (isStepFlow) newNode.isStepFlow = true;
  if (!parentNode.children) parentNode.children = [];
  parentNode.children.push(newNode);
  appState.nodeMap.set(id, newNode);
  appState.addNodeToCurrentLayer(id);
  _refreshViews();
  return id;
}

async function addConnection(sourceId, targetId, label) {
  if (sourceId && !appState.nodeMap.has(sourceId)) {
    const found = Array.from(appState.nodeMap.values()).find(function(n) { return n.name === sourceId; });
    if (found) sourceId = found.id;
  }
  if (targetId && !appState.nodeMap.has(targetId)) {
    const found = Array.from(appState.nodeMap.values()).find(function(n) { return n.name === targetId; });
    if (found) targetId = found.id;
  }

  if (!appState.nodeMap.has(sourceId) || !appState.nodeMap.has(targetId)) {
    throw new Error('节点不存在: ' + sourceId + ' 或 ' + targetId);
  }

  if (typeof addLineBetweenNodes === 'function') {
    addLineBetweenNodes(sourceId, targetId, label);
  } else {
    if (!appState.crossEdges) appState.crossEdges = [];
    appState.crossEdges.push({ source: sourceId, target: targetId, label: label || '' });
    _refreshViews();
  }
}

async function removeConnection(sourceId, targetId) {
  if (appState.crossEdges) {
    const before = appState.crossEdges.length;
    appState.crossEdges = appState.crossEdges.filter(function(e) {
      return !((e.source === sourceId && e.target === targetId) ||
               (e.source === targetId && e.target === sourceId));
    });
    if (appState.crossEdges.length < before) {
      _refreshViews();
      return;
    }
  }
  const childNode = appState.nodeMap.get(targetId);
  if (childNode) {
    function reparent(node) {
      if (!node || !node.children) return false;
      const idx = node.children.findIndex(function(c) { return c.id === targetId; });
      if (idx !== -1 && node.id === sourceId) {
        node.children.splice(idx, 1);
        appState.methodsTree.children = appState.methodsTree.children || [];
        appState.methodsTree.children.push(childNode);
        appState.rebuildNodeMapFromTree();
        return true;
      }
      for (const c of node.children) {
        if (reparent(c)) return true;
      }
      return false;
    }
    reparent(appState.methodsTree);
  }
  _refreshViews();
}

async function setNodeSize(nodeId, size) {
  const node = appState.nodeMap.get(nodeId);
  if (!node) return { error: '节点不存在: ' + nodeId };
  node.sizeScale = Math.max(0.3, Math.min(3.0, size || 1.0));
  if (typeof updateNodeVisuals === 'function') {
    updateNodeVisuals(nodeId);
  }
  _refreshViews();
  return { success: true, message: `节点 "${node.name}" 大小设为 ${node.sizeScale.toFixed(1)}` };
}

async function setNodeColor(nodeId, color) {
  const node = appState.nodeMap.get(nodeId);
  if (!node) return { error: '节点不存在: ' + nodeId };
  node.fixedColor = (color && color !== '') ? color : null;
  if (typeof updateNodeVisuals === 'function') {
    updateNodeVisuals(nodeId);
  }
  _refreshViews();
  return { success: true, message: node.fixedColor ? `节点 "${node.name}" 颜色设为 ${node.fixedColor}` : `节点 "${node.name}" 已清除固定颜色` };
}

async function setNodeShape(nodeId, shape2D, shape3D) {
  const node = appState.nodeMap.get(nodeId);
  if (!node) return { error: '节点不存在: ' + nodeId };
  const valid2D = ['roundedRect', 'diamond', 'ellipse', 'stadium'];
  const valid3D = ['sphere', 'box', 'cylinder', 'cone', 'torus', 'octahedron', 'icosahedron'];
  if (shape2D && valid2D.includes(shape2D)) node.nodeShape = shape2D;
  if (shape3D && valid3D.includes(shape3D)) node.node3DShape = shape3D;
  if (typeof updateNodeVisuals === 'function') {
    updateNodeVisuals(nodeId);
  }
  _refreshViews();
  const parts = [];
  if (shape2D) parts.push('2D: ' + shape2D);
  if (shape3D) parts.push('3D: ' + shape3D);
  return { success: true, message: `节点 "${node.name}" 形状已更新 (${parts.join(', ')})` };
}

async function searchNodes(keyword, limit) {
  const nodes = Array.from(appState.nodeMap.values());
  const results = nodes.filter(function(n) {
    const kw = keyword.toLowerCase();
    return n.name.toLowerCase().includes(kw) ||
           (n.content && n.content.toLowerCase().includes(kw));
  }).slice(0, limit || 10).map(function(n) {
    return { id: n.id, name: n.name, hasContent: !!n.content };
  });
  return results;
}

async function getNodeContent(nodeId) {
  const node = appState.nodeMap.get(nodeId);
  if (!node) return null;
  return node.content ? node.content.replace(/<[^>]+>/g, '') : '(无内容)';
}

async function getGraphOverview() {
  const nodes = Array.from(appState.nodeMap.values());
  const layers = appState.layers || [];
  return {
    totalNodes: nodes.length,
    totalLayers: layers.length,
    currentLayer: appState.getCurrentLayer()?.name || '默认',
    layersInfo: layers.map(function(l) { return { name: l.name, nodeCount: l.nodeIds?.size || 0 }; })
  };
}

async function updateNodeContent(nodeId, content) {
  const node = appState.nodeMap.get(nodeId);
  if (node) {
    node.content = content;
    _refreshViews();
  }
}

async function batchCreateNodes(nodes) {
  const createdIds = [];
  const nameToIdMap = {};

  for (const nodeInfo of nodes) {
    let parentId = nodeInfo.parentId;

    if (parentId && nameToIdMap[parentId]) {
      parentId = nameToIdMap[parentId];
    }
    if (parentId && !appState.nodeMap.has(parentId)) {
      const found = Array.from(appState.nodeMap.values()).find(function(n) { return n.name === parentId; });
      if (found) parentId = found.id;
    }

    const isStep = !!nodeInfo.isStepFlow;
    let newId;
    if (parentId) {
      newId = await createChildNode(parentId, nodeInfo.name, nodeInfo.content, isStep);
    } else {
      newId = await createRootNode(nodeInfo.name, nodeInfo.content, isStep);
    }
    nameToIdMap[nodeInfo.name] = newId;
    createdIds.push({ id: newId, name: nodeInfo.name });
  }

  return createdIds;
}

async function buildTree(treeNode, parentId) {
  let totalCount = 0;
  const isStep = !!treeNode.isStepFlow;
  let nodeId;

  if (parentId) {
    nodeId = await createChildNode(parentId, treeNode.name, treeNode.content, isStep);
  } else {
    nodeId = await createRootNode(treeNode.name, treeNode.content, isStep);
  }
  totalCount++;

  if (treeNode.children && treeNode.children.length > 0) {
    for (const child of treeNode.children) {
      const childResult = await buildTree(child, nodeId);
      totalCount += childResult.count;
    }
  }

  return { id: nodeId, count: totalCount };
}

async function scaffoldKnowledge(topic, depth, style) {
  const styleGuide = {
    tutorial: '每个节点写教程式内容：概念解释 + 代码示例 + 学习要点，用 Markdown 格式',
    reference: '每个节点写参考式内容：定义 + 参数/属性 + 用法示例，用 Markdown 格式',
    cheatsheet: '每个节点写速查式内容：关键公式/语法 + 一句话说明 + 示例，简洁为主'
  }[style] || '每个节点写简明的内容说明';

  const prompt = `请为主题"${topic}"构建一棵${depth}层深度的知识树，并填充每个节点的详细内容。

要求：
1. 第一层：主题本身（1个根节点）
2. 第二层：主题的核心分支（3-5个节点）
3. 第三层及以下：每个分支的关键知识点（每个分支2-4个子节点）
4. ${styleGuide}
5. 每个节点内容不少于50字

请严格按以下 JSON 格式输出，不要输出任何其他内容：
{"name":"主题名","content":"根节点内容","children":[{"name":"子主题","content":"内容","children":[...]}]}`;

  const { provider, key } = resolveProviderAndKey(getCurrentModel());
  const model = getCurrentModel();

  const res = await fetchWithRetry(provider.baseUrl + '/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + key
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: '你是一个知识体系规划专家。请严格按照用户要求的 JSON 格式输出，不要添加任何额外文字、标记或解释。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 4096
    })
  }, function() {}); // scaffoldKnowledge 不需要 addMessage 回调

  if (!res.ok) {
    const errText = await res.text();
    throw new Error('AI 生成失败: ' + res.status + ' ' + errText);
  }

  const data = await res.json();
  const aiContent = data.choices?.[0]?.message?.content || '';

  let treeData;
  try {
    const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('AI 未返回有效 JSON');
    treeData = JSON.parse(jsonMatch[0]);
  } catch (e) {
    throw new Error('解析 AI 输出失败: ' + e.message);
  }

  const result = await buildTree(treeData, null);
  return result;
}

async function deleteNode(nodeId) {
  if (!appState.nodeMap || !appState.nodeMap.has(nodeId)) {
    throw new Error('节点不存在: ' + nodeId);
  }

  function removeFromTree(node) {
    if (!node || !node.children) return false;
    const idx = node.children.findIndex(function(c) { return c.id === nodeId; });
    if (idx !== -1) {
      node.children.splice(idx, 1);
      return true;
    }
    for (const child of node.children) {
      if (removeFromTree(child)) return true;
    }
    return false;
  }

  removeFromTree(appState.methodsTree);
  appState.rebuildNodeMapFromTree();

  if (appState.removeNodeFromCurrentLayer) {
    appState.removeNodeFromCurrentLayer(nodeId);
  }

  if (appState.crossEdges) {
    appState.crossEdges = appState.crossEdges.filter(function(e) {
      return e.source !== nodeId && e.target !== nodeId;
    });
  }

  _refreshViews();
}

async function autoArrange(allLayers) {
  if (allLayers) {
    const btn = document.getElementById('arrangeAllLayersBtn');
    if (btn) {
      btn.click();
    } else if (appState.autoArrangeTreeLayout) {
      const layers = appState.layers || [];
      const savedLayer = appState.currentLayerId;
      for (const layer of layers) {
        appState.currentLayerId = layer.id;
        appState.positions2D = layer.positions2D || new Map();
        if (appState.autoArrangeTreeLayout) appState.autoArrangeTreeLayout();
        layer.positions2D = new Map(appState.positions2D);
      }
      appState.currentLayerId = savedLayer;
      const curLayer = appState.getCurrentLayer();
      if (curLayer) appState.positions2D = curLayer.positions2D || new Map();
      _refreshViews();
    }
  } else {
    const btn = document.getElementById('arrangeTreeBtn');
    if (btn) {
      btn.click();
    } else if (appState.autoArrangeTreeLayout) {
      appState.autoArrangeTreeLayout();
    }
    _refreshViews();
  }
}

// ─── Markdown 知识树生成（新方案） ──────────────────────

/**
 * AI 生成 Markdown → 暂存 → 用户预览确认 → 导入
 * 返回 { needsPreview: true, topic, nodeCount } 让 UI 层展示预览面板
 */
async function generateKnowledgeTree(markdown, topic, parentId) {
  const { tree, nodeRichContents } = parseMarkdownToTree(markdown);

  function countNodes(node) {
    let c = 1;
    if (node.children) {
      for (const child of node.children) c += countNodes(child);
    }
    return c;
  }
  const totalNodes = tree.children ? tree.children.reduce(function(sum, ch) { return sum + countNodes(ch); }, 0) : 0;

  if (totalNodes === 0) {
    return { error: 'Markdown 中未解析出任何标题节点，请确保使用 # 标题格式' };
  }

  let parentInfo = '';
  if (parentId) {
    const parentNode = appState.nodeMap ? appState.nodeMap.get(parentId) : null;
    if (!parentNode) {
      return { error: `未找到父节点 ${parentId}，请确认节点 ID 是否正确` };
    }
    parentInfo = `，将插入到节点「${parentNode.name}」下方`;
  }

  _pendingMarkdown = markdown;
  _pendingTopic = topic;
  _pendingParentId = parentId || null;

  return {
    needsPreview: true,
    topic: topic,
    nodeCount: totalNodes,
    contentCount: Object.keys(nodeRichContents).length,
    parentId: parentId || null,
    message: `已生成「${topic}」知识树 Markdown（${totalNodes} 个节点，${Object.keys(nodeRichContents).length} 个含内容）${parentInfo}，请预览后确认导入`
  };
}

/**
 * 确认导入：将暂存的 Markdown 解析并注入当前项目
 * @returns {{ success: boolean, totalNodes: number, message: string }}
 */
export async function confirmImportMarkdown() {
  if (!_pendingMarkdown) return { error: '没有待导入的 Markdown' };

  const markdown = _pendingMarkdown;
  const topic = _pendingTopic;
  const parentId = _pendingParentId;
  clearPendingMarkdown();

  const { tree, nodeRichContents } = parseMarkdownToTree(markdown);

  if (!tree.children || tree.children.length === 0) {
    return { error: '解析失败：未生成任何节点' };
  }

  if (!appState.methodsTree) {
    appState.methodsTree = { id: appState.VIRTUAL_ROOT_ID, name: '(虚拟根)', children: [] };
  }
  if (!appState.methodsTree.children) appState.methodsTree.children = [];

  let targetChildren = appState.methodsTree.children;
  let parentName = '根级别';

  if (parentId) {
    const parentNode = appState.nodeMap ? appState.nodeMap.get(parentId) : null;
    if (!parentNode) {
      return { error: `父节点 ${parentId} 不存在，无法导入` };
    }
    parentName = parentNode.name;
    if (!parentNode.children) parentNode.children = [];
    targetChildren = parentNode.children;
  }

  for (const child of tree.children) {
    targetChildren.push(child);
  }

  for (const [nodeId, content] of Object.entries(nodeRichContents)) {
    const node = appState.nodeMap.get(nodeId);
    if (node) {
      node.richContent = content;
      node.content = content;
    }
  }

  if (appState.rebuildNodeMapFromTree) appState.rebuildNodeMapFromTree();

  function addNodeIdsToLayer(node) {
    if (appState.addNodeToCurrentLayer) appState.addNodeToCurrentLayer(node.id);
    if (node.children) {
      for (const child of node.children) addNodeIdsToLayer(child);
    }
  }
  for (const child of tree.children) {
    addNodeIdsToLayer(child);
  }

  function countNodes(node) {
    let c = 1;
    if (node.children) {
      for (const ch of node.children) c += countNodes(ch);
    }
    return c;
  }
  const totalNodes = tree.children.reduce(function(sum, ch) { return sum + countNodes(ch); }, 0);

  _refreshViews();

  await autoArrange(false);

  return { success: true, totalNodes: totalNodes, parentId: parentId, message: `已导入「${topic}」知识树到「${parentName}」下方，共 ${totalNodes} 个节点，布局已自动整理` };
}

// ─── 树结构导出为 Markdown ──────────────────────────

function treeToMarkdown(node, maxDepth, includeContent, depth) {
  if (depth === undefined) depth = 0;
  if (depth > maxDepth) return '';
  // 虚拟根节点：直接递归子节点
  if (node.id === appState.VIRTUAL_ROOT_ID) {
    if (!node.children || node.children.length === 0) return '';
    return node.children.map(function(ch) { return treeToMarkdown(ch, maxDepth, includeContent, depth); }).join('\n\n');
  }

  var prefix = '#'.repeat(Math.min(depth + 1, 6));
  var line = prefix + ' ' + node.name;

  if (includeContent) {
    var content = '';
    var n = appState.nodeMap ? appState.nodeMap.get(node.id) : null;
    if (n) {
      if (n.richContent) {
        content = n.richContent.replace(/<[^>]+>/g, '').trim();
      } else if (n.content) {
        content = String(n.content).replace(/<[^>]+>/g, '').trim();
      }
    }
    if (content) {
      line += '\n' + content.slice(0, 200);
    }
  }

  var childMd = '';
  if (node.children && node.children.length > 0) {
    childMd = node.children.map(function(ch) { return treeToMarkdown(ch, maxDepth, includeContent, depth + 1); }).filter(Boolean).join('\n\n');
  }

  if (childMd) {
    return line + '\n\n' + childMd;
  }
  return line;
}

function getTreeMarkdown(maxDepth, includeContent) {
  if (!appState.methodsTree) {
    return { markdown: '', nodeCount: 0, message: '当前项目为空，没有可导出的树结构' };
  }

  function countAll(node) {
    var c = 1;
    if (node.children) {
      for (var i = 0; i < node.children.length; i++) c += countAll(node.children[i]);
    }
    return c;
  }
  var total = countAll(appState.methodsTree) - 1; // 减去虚拟根

  if (total <= 0) {
    return { markdown: '', nodeCount: 0, message: '当前项目为空，没有可导出的树结构' };
  }

  var md = treeToMarkdown(appState.methodsTree, maxDepth, includeContent, 0);

  return {
    markdown: md,
    nodeCount: total,
    maxDepth: maxDepth,
    includeContent: includeContent,
    message: `已导出当前知识图谱（${total} 个节点，最大深度 ${maxDepth}）`
  };
}
