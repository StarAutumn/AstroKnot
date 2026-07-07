// ============================================================
//  版本图核心：提交/分支/diff 逻辑
//  数据模型（无主分支特权，所有分支平等）：
//    graph = {
//      commits: [{ id, parent, time, label, snapshotHash, branch, diff }],
//      branches: [{ name, head, color }],   // 第一个分支默认名"主线"，仅名字无特权
//      HEAD: { type: 'branch', name: '主线' } 或 { type: 'commit', id: 'c1' } 或 null
//    }
//    diff = { added:[nodeId], removed:[nodeId], changed:[{id, oldHash, newHash}] }
//
//  ── 增量存储（v2，Git 风格）──
//  snapshot 不再整体存为一个 blob，而是按"字段 / 节点"拆分为多个 blob：
//    manifest = {
//      version: 2, type: 'manifest',
//      // 顶层结构字段：每个字段独立一个 blob（相同内容自动去重）
//      methodsTree: <hash>, crossEdges: <hash>, positions: <hash>,
//      positions2D: <hash>, collapsed2D: <hash>, treeEdgeLabels: <hash>,
//      cameraView: <hash>, layers: <hash>,
//      currentLayerId: <value>,  // 简单值直接存
//      // 节点级字段：每个节点独立一个 blob
//      nodeRichContents:   { nodeId: <hash>, ... },
//      nodeOverlayImages:  { nodeId: <hash>, ... },  // 含 base64 媒体，按节点去重
//      nodeFileSystems:    { nodeId: <hash>, ... },  // 代码文件，按节点去重
//      nodeHtmlSources:    { nodeId: <hash>, ... },
//      nodeActiveModes:    { nodeId: <value>, ... }  // 简单值直接存
//    }
//  commit.snapshotHash 现在指向 manifest 的 hash。
//  loadSnapshot 会自动识别旧版完整 snapshot（无 type:'manifest'）并兼容。
// ============================================================

import { simpleHash, hashNodeContent, saveGraph, loadGraph, saveBlob, loadBlob, saveBlobs } from './versionStore.js';
import { appState } from '../module0_AppState.js';

// ── 增量存储字段分组配置 ──
// 顶层结构字段：整体作为一个 blob 存储（变化时整体重写，但这些字段本身较小）
const TOP_FIELDS = ['methodsTree', 'crossEdges', 'positions', 'positions2D',
  'collapsed2D', 'treeEdgeLabels', 'cameraView', 'layers'];
// 节点级字段：按 nodeId 拆分，每个节点独立 blob（真正实现"只存变化的部分"）
const NODE_FIELDS = ['nodeRichContents', 'nodeOverlayImages', 'nodeFileSystems', 'nodeHtmlSources'];

// ── 内存缓存：versionKey → graph ──
const _cache = new Map();

// ── 分支颜色调色板（循环使用）──
const BRANCH_COLORS = ['#5ee8ff', '#ff8a5e', '#a8e063', '#e063a8', '#ffd166', '#9b59b6'];

/**
 * 计算版本图存储 key
 * 已保存项目：项目文件夹绝对路径（版本图存在 <项目文件夹>/.versiongraph/）
 * 未保存项目：projectId（版本图存在 userData/version-graphs-tmp/<projectId>/）
 * @param {string} projectId
 * @returns {string} versionKey
 */
export function getVersionKey(projectId) {
  if (!projectId) return projectId;
  const proj = appState.projects.find(p => p.id === projectId);
  // 优先用项目实际加载/保存的文件夹路径（最准确，版本图就存在此处的 .versiongraph/）
  if (proj && proj.folderPath) {
    return proj.folderPath;
  }
  // 否则用保存根目录 + 项目名拼接（适用于已设置保存路径但未记录 folderPath 的情况）
  const savePath = appState.currentProjectSavePath;
  if (savePath && proj && proj.name) {
    const sep = savePath.includes('\\') ? '\\' : '/';
    return savePath + sep + proj.name;
  }
  // 回退到 projectId（临时存储）
  return projectId;
}

/**
 * 生成唯一 commit id
 */
function genCommitId() {
  return 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

/**
 * 生成唯一分支名（若用户未指定）
 * 第一个分支默认叫"主线"（仅名字，无特权），后续按序号命名
 */
function genBranchName(existing) {
  if (!existing.includes('主线')) return '主线';
  let i = 2;
  while (existing.includes('分支' + i)) i++;
  return '分支' + i;
}

// ============================================================
//  增量存储：把 snapshot 拆分为多个 blob 存储（Git 风格）
// ============================================================

/**
 * 计算任意内容的 hash（JSON 序列化后 simpleHash）
 * @param {*} content
 * @returns {string}
 */
function hashAny(content) {
  return simpleHash(JSON.stringify(content));
}

/**
 * 增量保存 snapshot：按字段/节点拆分为多个 blob，返回 manifest 的 hash
 * - 顶层字段（methodsTree 等）：每个字段一个 blob
 * - 节点级字段（nodeFileSystems 等）：每个节点一个 blob
 * - 相同内容自动去重（内容寻址存储的天然特性）
 * - nodeOverlayImages 中的 base64 媒体会被提取为独立 blob（避免大媒体随结构变化重写）
 * @param {string} key - versionKey
 * @param {Object} snapshot - 完整项目快照
 * @returns {Promise<string>} manifestHash（存入 commit.snapshotHash）
 */
async function saveSnapshotIncremental(key, snapshot) {
  const manifest = { version: 2, type: 'manifest' };
  const blobsToSave = {}; // { hash: content }，批量写入减少 IPC

  // 1. 顶层结构字段：每个字段独立 blob
  for (const field of TOP_FIELDS) {
    const content = snapshot[field];
    if (content === undefined) continue;
    const h = hashAny(content);
    blobsToSave[h] = content;
    manifest[field] = h;
  }

  // 2. currentLayerId：简单值直接存 manifest
  manifest.currentLayerId = snapshot.currentLayerId ?? null;

  // 3. 节点级字段：每个节点独立 blob
  for (const field of NODE_FIELDS) {
    const data = snapshot[field] || {};
    manifest[field] = {};
    for (const nodeId in data) {
      let content = data[nodeId];
      if (content === undefined || content === null) continue;

      // nodeOverlayImages 特殊处理：递归剥离 base64 媒体为独立 blob
      // 这样大媒体文件（图片/视频/音频）只存一次，结构变化（位置/大小）不会导致媒体重写
      if (field === 'nodeOverlayImages') {
        content = stripMediaFromOverlay(content, blobsToSave);
      }

      const h = hashAny(content);
      blobsToSave[h] = content;
      manifest[field][nodeId] = h;
    }
  }

  // 4. nodeActiveModes：简单值（'text'/'code'）直接存 manifest，不单独建 blob
  manifest.nodeActiveModes = snapshot.nodeActiveModes || {};

  // 5. 批量写入所有内容 blob（去重：相同 hash 只写一次，IPC 侧也会跳过已存在文件）
  const hashList = Object.keys(blobsToSave);
  if (hashList.length > 0) {
    await saveBlobs(key, blobsToSave);
  }

  // 6. 写入 manifest 本身作为一个 blob，返回其 hash 作为 commit.snapshotHash
  const manifestHash = hashAny(manifest);
  await saveBlob(key, manifestHash, manifest);
  return manifestHash;
}

/**
 * 递归剥离 overlay 数据中的 base64 媒体（src 字段以 'data:' 开头）
 * 将 base64 字符串提取为独立 blob（存入 blobsToSave），原位置用 srcHash 引用
 * 支持任意嵌套结构（如 slideshow 的 slides[].elements[]）
 * @param {*} obj - overlay 数据（数组/对象/原始值）
 * @param {Object|null} blobsToSave - 收集媒体 blob 的字典；传 null 时不保存（仅计算结构用于 hash 对比）
 * @returns {*} 剥离媒体后的结构（深拷贝，不修改原对象）
 */
function stripMediaFromOverlay(obj, blobsToSave) {
  // 原始值：直接返回
  if (obj === null || typeof obj !== 'object') return obj;
  // 数组：递归处理每个元素
  if (Array.isArray(obj)) {
    return obj.map(item => stripMediaFromOverlay(item, blobsToSave));
  }
  // 对象：处理 src 字段，递归处理其他字段
  const result = {};
  for (const k in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) {
      if (k === 'src' && typeof obj[k] === 'string' && obj[k].startsWith('data:')) {
        // base64 媒体：提取为独立 blob，用 srcHash 引用
        const mediaHash = hashAny(obj[k]);
        if (blobsToSave) blobsToSave[mediaHash] = obj[k];
        result.srcHash = mediaHash;
      } else {
        result[k] = stripMediaFromOverlay(obj[k], blobsToSave);
      }
    }
  }
  return result;
}

/**
 * 递归重组 overlay 数据：把 srcHash 引用还原为 base64 src
 * 与 stripMediaFromOverlay 互逆
 * @param {*} obj - 剥离了媒体的 overlay 数据
 * @param {string} key - versionKey
 * @returns {Promise<*>} 重组媒体后的结构
 */
async function restoreMediaToOverlay(obj, key) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    const restored = [];
    for (const item of obj) {
      restored.push(await restoreMediaToOverlay(item, key));
    }
    return restored;
  }
  const result = {};
  for (const k in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) {
      if (k === 'srcHash') {
        // 从 blob 加载 base64 媒体
        const src = await loadBlob(key, obj[k]);
        result.src = src || '';
      } else {
        result[k] = await restoreMediaToOverlay(obj[k], key);
      }
    }
  }
  return result;
}

/**
 * 增量加载 snapshot：根据 manifest hash 重组完整 snapshot
 * 自动兼容旧版完整 snapshot（无 type:'manifest' 字段时直接返回）
 * @param {string} key - versionKey
 * @param {string} hash - manifest hash 或旧版 snapshot hash
 * @returns {Promise<Object|null>} 完整 snapshot
 */
async function loadSnapshotIncremental(key, hash) {
  const blob = await loadBlob(key, hash);
  if (!blob) return null;
  // 兼容旧版：旧版直接是完整 snapshot（含 methodsTree 字段，无 type:'manifest'）
  if (!blob.type || blob.type !== 'manifest') {
    return blob;
  }
  const manifest = blob;
  const snapshot = {};

  // 1. 顶层结构字段
  for (const field of TOP_FIELDS) {
    if (manifest[field]) {
      snapshot[field] = await loadBlob(key, manifest[field]);
    }
  }

  // 2. currentLayerId
  snapshot.currentLayerId = manifest.currentLayerId ?? null;

  // 3. 节点级字段：按 nodeId 逐个加载
  for (const field of NODE_FIELDS) {
    snapshot[field] = {};
    const nodeMap = manifest[field] || {};
    for (const nodeId in nodeMap) {
      let content = await loadBlob(key, nodeMap[nodeId]);
      if (content === null) continue;
      // nodeOverlayImages 特殊处理：重组被剥离的 base64 媒体
      if (field === 'nodeOverlayImages') {
        content = await restoreMediaToOverlay(content, key);
      }
      snapshot[field][nodeId] = content;
    }
  }

  // 4. nodeActiveModes
  snapshot.nodeActiveModes = manifest.nodeActiveModes || {};

  return snapshot;
}

/**
 * 加载 manifest 本身（不重组 snapshot），用于 diff 时只比较 hash 而不加载内容
 * 兼容旧版：旧版返回 null（调用方需回退到加载完整 snapshot）
 * @param {string} key
 * @param {string} hash
 * @returns {Promise<Object|null>} manifest 或 null
 */
async function loadManifest(key, hash) {
  const blob = await loadBlob(key, hash);
  if (!blob) return null;
  if (blob.type === 'manifest') return blob;
  return null; // 旧版完整 snapshot，无 manifest
}

/**
 * 从树结构提取所有节点（扁平化）
 * 返回 Map: nodeId → { id, name, richContent, overlayImages, fileSystem, htmlSource, activeMode, ... }
 */
function flattenTree(methodsTree, nodeRichContents, nodeOverlayImages, nodeFileSystems, nodeHtmlSources, nodeActiveModes) {
  const map = new Map();
  function walk(node) {
    if (!node) return;
    const id = node.id;
    if (id && id !== 'virtual_root') {
      map.set(id, {
        id: id,
        name: node.name || '',
        richContent: nodeRichContents && nodeRichContents[id] ? nodeRichContents[id] : '',
        overlayImages: nodeOverlayImages && nodeOverlayImages[id] ? nodeOverlayImages[id] : null,
        fileSystem: nodeFileSystems && nodeFileSystems[id] ? nodeFileSystems[id] : null,
        htmlSource: nodeHtmlSources && nodeHtmlSources[id] ? nodeHtmlSources[id] : null,
        activeMode: nodeActiveModes && nodeActiveModes[id] ? nodeActiveModes[id] : null,
        sizeScale: node.sizeScale,
        fixedColor: node.fixedColor
      });
    }
    if (node.children && node.children.length) {
      node.children.forEach(walk);
    }
  }
  walk(methodsTree);
  return map;
}

/**
 * 计算两个快照之间的节点级 diff
 * @param {Object} oldSnap - 旧快照
 * @param {Object} newSnap - 新快照
 * @returns {Object} { added:[id], removed:[id], changed:[{id, field, oldHash, newHash, oldLabel, newLabel}] }
 */
export function computeDiff(oldSnap, newSnap) {
  const oldFlat = flattenTree(
    oldSnap ? oldSnap.methodsTree : null,
    oldSnap ? (oldSnap.nodeRichContents || {}) : {},
    oldSnap ? (oldSnap.nodeOverlayImages || {}) : {},
    oldSnap ? (oldSnap.nodeFileSystems || {}) : {},
    oldSnap ? (oldSnap.nodeHtmlSources || {}) : {},
    oldSnap ? (oldSnap.nodeActiveModes || {}) : {}
  );
  const newFlat = flattenTree(
    newSnap.methodsTree,
    newSnap.nodeRichContents || {},
    newSnap.nodeOverlayImages || {},
    newSnap.nodeFileSystems || {},
    newSnap.nodeHtmlSources || {},
    newSnap.nodeActiveModes || {}
  );

  const added = [];
  const removed = [];
  const changed = [];

  // 新增节点
  for (const [id, newNode] of newFlat) {
    if (!oldFlat.has(id)) {
      added.push(id);
      continue;
    }
    // 已存在节点：判断是否变化
    const oldNode = oldFlat.get(id);
    const oldRichHash = hashNodeContent(oldNode.richContent);
    const newRichHash = hashNodeContent(newNode.richContent);
    const oldOverlayHash = hashNodeContent(oldNode.overlayImages);
    const newOverlayHash = hashNodeContent(newNode.overlayImages);
    const oldFsHash = hashNodeContent(oldNode.fileSystem);
    const newFsHash = hashNodeContent(newNode.fileSystem);
    const oldName = oldNode.name || '';
    const newName = newNode.name || '';

    // 优先级：代码文件系统 > 富文本内容 > 覆盖层 > 节点名
    if (oldFsHash !== newFsHash) {
      changed.push({ id, field: 'filesystem', oldHash: oldFsHash, newHash: newFsHash, oldLabel: oldName, newLabel: newName });
    } else if (oldRichHash !== newRichHash) {
      changed.push({ id, field: 'content', oldHash: oldRichHash, newHash: newRichHash, oldLabel: oldName, newLabel: newName });
    } else if (oldOverlayHash !== newOverlayHash) {
      changed.push({ id, field: 'overlay', oldHash: oldOverlayHash, newHash: newOverlayHash, oldLabel: oldName, newLabel: newName });
    } else if (oldName !== newName) {
      changed.push({ id, field: 'name', oldHash: oldName, newHash: newName, oldLabel: oldName, newLabel: newName });
    }
  }

  // 删除节点
  for (const [id] of oldFlat) {
    if (!newFlat.has(id)) removed.push(id);
  }

  return { added, removed, changed };
}

/**
 * 基于 manifest 的 hash 对比计算 diff（增量版，避免加载内容 blob）
 * - 若 methodsTree hash 相同（常见情况：只改内容不改结构）→ 完全不加载任何内容 blob
 * - 若 methodsTree hash 不同 → 仅加载旧 methodsTree blob 获取节点集合和 name
 * 节点级字段（richContent/fileSystem/overlayImages）的 hash 直接从 manifest 读取对比
 * @param {string} key - versionKey
 * @param {Object} oldManifest - 父 commit 的 manifest
 * @param {Object} newSnap - 新 snapshot
 * @returns {Promise<Object>} { added, removed, changed }
 */
async function computeDiffFromManifest(key, oldManifest, newSnap) {
  const added = [];
  const removed = [];
  const changed = [];

  // 新 snapshot 扁平化（含 name）
  const newFlat = flattenTree(
    newSnap.methodsTree,
    newSnap.nodeRichContents || {},
    newSnap.nodeOverlayImages || {},
    newSnap.nodeFileSystems || {},
    newSnap.nodeHtmlSources || {},
    newSnap.nodeActiveModes || {}
  );

  // 新 methodsTree 的 hash（与 saveSnapshotIncremental 中存储方式一致）
  const newTreeHash = hashAny(newSnap.methodsTree);
  const treeUnchanged = oldManifest.methodsTree === newTreeHash;

  // 工具：从 manifest 取节点字段 hash，缺失视为 'empty'（与 hashNodeContent 空值处理一致）
  const getOldHash = (field, id) => {
    const m = oldManifest[field];
    return (m && m[id]) ? m[id] : 'empty';
  };

  if (treeUnchanged) {
    // 快速路径：树结构完全相同 → 节点集合、name、sizeScale、fixedColor 都相同
    // 只需对比节点级数据 hash
    for (const [id, newNode] of newFlat) {
      const newName = newNode.name || '';
      const oldFsHash = getOldHash('nodeFileSystems', id);
      const newFsHash = hashNodeContent(newNode.fileSystem);
      const oldRichHash = getOldHash('nodeRichContents', id);
      const newRichHash = hashNodeContent(newNode.richContent);
      const oldOverlayHash = getOldHash('nodeOverlayImages', id);
      // overlayImages：与 manifest 一致，用剥离媒体后的结构 hash 对比
      // 这样纯媒体变化（如重新上传同一张图）或纯结构变化（移位）都能正确识别
      const newOverlayHash = newNode.overlayImages
        ? hashAny(stripMediaFromOverlay(newNode.overlayImages, null))
        : 'empty';

      // 优先级与 computeDiff 一致：filesystem > content > overlay > name
      if (oldFsHash !== newFsHash) {
        changed.push({ id, field: 'filesystem', oldHash: oldFsHash, newHash: newFsHash, oldLabel: newName, newLabel: newName });
      } else if (oldRichHash !== newRichHash) {
        changed.push({ id, field: 'content', oldHash: oldRichHash, newHash: newRichHash, oldLabel: newName, newLabel: newName });
      } else if (oldOverlayHash !== newOverlayHash) {
        changed.push({ id, field: 'overlay', oldHash: oldOverlayHash, newHash: newOverlayHash, oldLabel: newName, newLabel: newName });
      }
      // name 不可能变（treeUnchanged）
    }
    return { added, removed, changed };
  }

  // 慢路径：树结构变化 → 加载旧 methodsTree 获取旧节点集合和 name
  let oldFlat = new Map();
  if (oldManifest.methodsTree) {
    const oldTree = await loadBlob(key, oldManifest.methodsTree);
    if (oldTree) {
      // 旧 manifest 没有节点级数据时，传空对象给 flattenTree
      oldFlat = flattenTree(
        oldTree,
        {}, {}, {}, {}, {}
      );
      // 从 manifest 补充节点级数据 hash 到 oldFlat（用 hash 字段代替实际内容）
      for (const [id, oldNode] of oldFlat) {
        oldNode._richHash = getOldHash('nodeRichContents', id);
        oldNode._fsHash = getOldHash('nodeFileSystems', id);
        oldNode._overlayHash = getOldHash('nodeOverlayImages', id);
      }
    }
  }

  // 新增节点
  for (const [id, newNode] of newFlat) {
    if (!oldFlat.has(id)) {
      added.push(id);
      continue;
    }
    const oldNode = oldFlat.get(id);
    const oldName = oldNode.name || '';
    const newName = newNode.name || '';
    const oldFsHash = oldNode._fsHash || 'empty';
    const newFsHash = hashNodeContent(newNode.fileSystem);
    const oldRichHash = oldNode._richHash || 'empty';
    const newRichHash = hashNodeContent(newNode.richContent);
    const oldOverlayHash = oldNode._overlayHash || 'empty';
    // overlayImages：剥离媒体后计算 hash，与 manifest 存储方式一致
    const newOverlayHash = newNode.overlayImages
      ? hashAny(stripMediaFromOverlay(newNode.overlayImages, null))
      : 'empty';

    if (oldFsHash !== newFsHash) {
      changed.push({ id, field: 'filesystem', oldHash: oldFsHash, newHash: newFsHash, oldLabel: oldName, newLabel: newName });
    } else if (oldRichHash !== newRichHash) {
      changed.push({ id, field: 'content', oldHash: oldRichHash, newHash: newRichHash, oldLabel: oldName, newLabel: newName });
    } else if (oldOverlayHash !== newOverlayHash) {
      changed.push({ id, field: 'overlay', oldHash: oldOverlayHash, newHash: newOverlayHash, oldLabel: oldName, newLabel: newName });
    } else if (oldName !== newName) {
      changed.push({ id, field: 'name', oldHash: oldName, newHash: newName, oldLabel: oldName, newLabel: newName });
    }
  }

  // 删除节点
  for (const [id] of oldFlat) {
    if (!newFlat.has(id)) removed.push(id);
  }

  return { added, removed, changed };
}

/**
 * 获取或初始化项目的版本图
 * @param {string} projectId
 * @returns {Promise<Object>} graph
 */
export async function getGraph(projectId) {
  const key = getVersionKey(projectId);
  if (_cache.has(key)) return _cache.get(key);
  let graph = await loadGraph(key);
  if (!graph) {
    // 不预创建分支，等第一个 commit 时再创建（无主分支特权）
    graph = {
      commits: [],
      branches: [],
      HEAD: null
    };
    _cache.set(key, graph);
  } else {
    _cache.set(key, graph);
  }
  return graph;
}

/**
 * 保存图到磁盘 + 更新缓存
 */
async function persistGraph(projectId, graph) {
  const key = getVersionKey(projectId);
  _cache.set(key, graph);
  return await saveGraph(key, graph);
}

/**
 * 获取当前 HEAD 指向的 commit
 */
export function getHeadCommit(graph) {
  if (!graph || !graph.HEAD) return null;
  if (graph.HEAD.type === 'commit') {
    return graph.commits.find(c => c.id === graph.HEAD.id) || null;
  }
  // branch
  const branch = graph.branches.find(b => b.name === graph.HEAD.name);
  if (!branch || !branch.head) return null;
  return graph.commits.find(c => c.id === branch.head) || null;
}

/**
 * 获取当前 HEAD 所在分支
 */
export function getCurrentBranch(graph) {
  if (!graph || !graph.HEAD || graph.HEAD.type !== 'branch') return null;
  return graph.branches.find(b => b.name === graph.HEAD.name) || null;
}

/**
 * 创建一个新提交
 * @param {string} projectId
 * @param {Object} snapshot - 完整项目快照（来自 getEmergencySnapshot）
 * @param {string} label - 提交标签（用户输入或自动生成）
 * @param {Object} options - { forceNewBranch: boolean, branchName: string }
 * @returns {Promise<{commitId:string, branchName:string, diff:Object}>}
 */
export async function commit(projectId, snapshot, label, options = {}) {
  const key = getVersionKey(projectId);
  const graph = await getGraph(projectId);

  // 获取父 commit
  const parentCommit = getHeadCommit(graph);
  const parentId = parentCommit ? parentCommit.id : null;

  // 计算与父 commit 的 diff（优先用 manifest hash 对比，避免加载完整 snapshot）
  let diff = { added: [], removed: [], changed: [] };
  let parentManifest = null;
  if (parentCommit) {
    parentManifest = await loadManifest(key, parentCommit.snapshotHash);
    if (parentManifest) {
      // v2 增量：基于 manifest 的 hash 对比，无需加载任何内容 blob
      diff = await computeDiffFromManifest(key, parentManifest, snapshot);
    } else {
      // 旧版（v1）：父 commit 是完整 snapshot，回退到加载完整内容做 diff
      const oldSnap = await loadSnapshotIncremental(key, parentCommit.snapshotHash);
      if (oldSnap) {
        diff = computeDiff(oldSnap, snapshot);
      }
    }
  } else {
    // 第一个 commit：所有节点都是"新增"
    const flat = flattenTree(snapshot.methodsTree, snapshot.nodeRichContents || {}, snapshot.nodeOverlayImages || {}, snapshot.nodeFileSystems || {}, snapshot.nodeHtmlSources || {}, snapshot.nodeActiveModes || {});
    diff.added = Array.from(flat.keys());
  }

  // 若内容无变化且有父 commit，拒绝创建空 commit（除非强制）
  if (parentId && diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0) {
    const cur = getCurrentBranch(graph);
    return { commitId: parentId, branchName: cur ? cur.name : (graph.HEAD && graph.HEAD.type === 'commit' ? graph.commits.find(c => c.id === graph.HEAD.id)?.branch : ''), diff, skipped: true };
  }

  // 生成 commit id
  const commitId = genCommitId();

  // 增量写入快照：按字段/节点拆分为多个 blob，返回 manifest hash
  const manifestHash = await saveSnapshotIncremental(key, snapshot);

  // 检测 detached HEAD：HEAD 指向历史 commit（非分支头）→ 自动产生新分支
  const isDetached = graph.HEAD && graph.HEAD.type === 'commit';
  if (isDetached && !options.forceNewBranch) {
    options.forceNewBranch = true;
    if (!options.branchName) {
      options.branchName = genBranchName(graph.branches.map(b => b.name));
    }
  }

  // 是否需要新建分支（编辑历史站后保存，或第一个 commit）
  const curBranch = getCurrentBranch(graph);
  let branchName;
  if (options.forceNewBranch || !curBranch) {
    // 新建分支：detached HEAD 自动分叉，或第一个 commit 创建首分支
    branchName = options.branchName || genBranchName(graph.branches.map(b => b.name));
    graph.branches.push({
      name: branchName,
      head: commitId,
      color: BRANCH_COLORS[graph.branches.length % BRANCH_COLORS.length]
    });
    graph.HEAD = { type: 'branch', name: branchName };
  } else {
    // 在当前分支追加
    branchName = curBranch.name;
    curBranch.head = commitId;
  }

  // 添加 commit 记录
  const commitObj = {
    id: commitId,
    parent: parentId,
    time: Date.now(),
    label: label || '',  // 默认空标签，用户可通过右键重命名设置
    snapshotHash: manifestHash,  // v2: 指向 manifest 的 hash
    branch: branchName,
    diff: diff
  };
  graph.commits.push(commitObj);

  await persistGraph(projectId, graph);
  return { commitId, branchName, diff };
}

/**
 * 原地修改当前 HEAD commit 的快照（不新建时间点）
 * 用于"自动排列"等纯位置变更操作：把结果保存到当前时间点里，而不是新建 commit。
 * @param {string} projectId
 * @param {Object} snapshot - 完整项目快照（来自 getEmergencySnapshot）
 * @returns {Promise<{commitId:string, updated:boolean, skipped?:boolean}|null>}
 */
export async function amend(projectId, snapshot) {
  const key = getVersionKey(projectId);
  const graph = await getGraph(projectId);
  const headCommit = getHeadCommit(graph);
  // 没有任何 commit 时无法 amend，返回 null（调用方可退化为 commit 或直接跳过）
  if (!headCommit) return null;

  // 先用 manifest hash 快速判断是否无变化（避免不必要的增量写入）
  // 注意：amend 时 snapshot 内容可能相同但 manifest 结构不同，所以仍需增量写入后比较 manifestHash
  // 这里先做一次轻量 diff 判断
  const headManifest = await loadManifest(key, headCommit.snapshotHash);
  let quickDiff = null;
  if (headManifest) {
    quickDiff = await computeDiffFromManifest(key, headManifest, snapshot);
  } else {
    // 旧版父 commit：加载完整 snapshot 做 diff
    const oldSnap = await loadSnapshotIncremental(key, headCommit.snapshotHash);
    if (oldSnap) quickDiff = computeDiff(oldSnap, snapshot);
  }
  // 内容无变化，跳过
  if (quickDiff && quickDiff.added.length === 0 && quickDiff.removed.length === 0 && quickDiff.changed.length === 0) {
    return { commitId: headCommit.id, updated: false, skipped: true };
  }

  // 增量写入新快照
  const manifestHash = await saveSnapshotIncremental(key, snapshot);

  // 重算与父 commit 的 diff（保持 diff 与新快照一致）
  let diff = { added: [], removed: [], changed: [] };
  if (headCommit.parent) {
    const parentCommit = graph.commits.find(c => c.id === headCommit.parent);
    if (parentCommit) {
      const parentManifest = await loadManifest(key, parentCommit.snapshotHash);
      if (parentManifest) {
        diff = await computeDiffFromManifest(key, parentManifest, snapshot);
      } else {
        const oldSnap = await loadSnapshotIncremental(key, parentCommit.snapshotHash);
        if (oldSnap) diff = computeDiff(oldSnap, snapshot);
      }
    }
  } else {
    // 根 commit：所有节点都是"新增"
    const flat = flattenTree(snapshot.methodsTree, snapshot.nodeRichContents || {}, snapshot.nodeOverlayImages || {}, snapshot.nodeFileSystems || {}, snapshot.nodeHtmlSources || {}, snapshot.nodeActiveModes || {});
    diff.added = Array.from(flat.keys());
  }

  // 原地更新当前 HEAD commit 的快照哈希、时间、diff
  headCommit.snapshotHash = manifestHash;
  headCommit.time = Date.now();
  headCommit.diff = diff;

  await persistGraph(projectId, graph);
  return { commitId: headCommit.id, updated: true, diff };
}

/**
 * 切换到指定 commit（detached HEAD）或分支
 * @param {string} projectId
 * @param {string} target - commitId 或分支名
 * @returns {Promise<{snapshot:Object, commit:Object}|null>}
 */
export async function checkout(projectId, target) {
  const key = getVersionKey(projectId);
  const graph = await getGraph(projectId);
  let commit = null;
  let branchName = null;

  // 先尝试作为分支名
  const branch = graph.branches.find(b => b.name === target);
  if (branch) {
    branchName = branch.name;
    graph.HEAD = { type: 'branch', name: branch.name };
    if (branch.head) {
      commit = graph.commits.find(c => c.id === branch.head);
    }
  } else {
    // 作为 commit id
    commit = graph.commits.find(c => c.id === target);
    if (commit) {
      graph.HEAD = { type: 'commit', id: commit.id };
    }
  }

  if (!commit) return null;

  // 加载快照（增量加载，兼容旧版完整 snapshot）
  const snapshot = await loadSnapshotIncremental(key, commit.snapshotHash);
  if (!snapshot) return null;

  await persistGraph(projectId, graph);
  return { snapshot, commit, branchName };
}

/**
 * 列出所有 commits（按时间倒序）
 */
export async function listCommits(projectId) {
  const graph = await getGraph(projectId);
  return graph.commits.slice().sort((a, b) => b.time - a.time);
}

/**
 * 列出所有分支
 */
export async function listBranches(projectId) {
  const graph = await getGraph(projectId);
  return graph.branches.slice();
}

/**
 * 获取指定 commit 的快照（增量加载，兼容旧版）
 */
export async function getCommitSnapshot(projectId, commitId) {
  const key = getVersionKey(projectId);
  const graph = await getGraph(projectId);
  const commit = graph.commits.find(c => c.id === commitId);
  if (!commit) return null;
  return await loadSnapshotIncremental(key, commit.snapshotHash);
}

/**
 * 获取从根到指定 commit 的路径（祖先链）
 */
export function getAncestors(graph, commitId) {
  const path = [];
  let cur = graph.commits.find(c => c.id === commitId);
  while (cur) {
    path.push(cur);
    cur = cur.parent ? graph.commits.find(c => c.id === cur.parent) : null;
  }
  return path.reverse(); // 从根到当前
}

/**
 * 获取分支的所有 commits（从分支头追溯到根）
 */
export function getBranchCommits(graph, branchName) {
  const branch = graph.branches.find(b => b.name === branchName);
  if (!branch || !branch.head) return [];
  return getAncestors(graph, branch.head);
}

/**
 * 清除缓存（项目切换时调用）
 * @param {string} projectId - 传 null 清空所有缓存
 */
export function clearCache(projectId) {
  if (projectId) {
    const key = getVersionKey(projectId);
    _cache.delete(key);
  } else {
    _cache.clear();
  }
}

/**
 * 重命名 commit 标签
 * @param {string} projectId - 项目 id
 * @param {string} commitId - commit id
 * @param {string} newLabel - 新标签（空字符串表示清除标签）
 */
export async function renameCommit(projectId, commitId, newLabel) {
  const graph = await getGraph(projectId);
  const c = graph.commits.find(x => x.id === commitId);
  if (!c) return false;
  c.label = newLabel || '';
  await persistGraph(projectId, graph);
  return true;
}
