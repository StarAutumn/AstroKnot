// ============================================================
//  版本图核心：提交/分支/diff 逻辑
//  数据模型（无主分支特权，所有分支平等）：
//    graph = {
//      commits: [{ id, parent, time, label, snapshotHash, branch, diff }],
//      branches: [{ name, head, color }],   // 第一个分支默认名"主线"，仅名字无特权
//      HEAD: { type: 'branch', name: '主线' } 或 { type: 'commit', id: 'c1' } 或 null
//    }
//    diff = { added:[nodeId], removed:[nodeId], changed:[{id, oldHash, newHash}] }
// ============================================================

import { simpleHash, hashNodeContent, hashSnapshot, saveGraph, loadGraph, saveBlob, loadBlob, saveBlobs } from './versionStore.js';
import { appState } from '../module0_AppState.js';

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

/**
 * 从树结构提取所有节点（扁平化）
 * 返回 Map: nodeId → { id, name, richContent, overlayImages, ... }
 */
function flattenTree(methodsTree, nodeRichContents, nodeOverlayImages) {
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
 * @returns {Object} { added:[id], removed:[id], changed:[{id, oldHash, newHash, type}] }
 */
export function computeDiff(oldSnap, newSnap) {
  const oldFlat = flattenTree(
    oldSnap ? oldSnap.methodsTree : null,
    oldSnap ? (oldSnap.nodeRichContents || {}) : {},
    oldSnap ? (oldSnap.nodeOverlayImages || {}) : {}
  );
  const newFlat = flattenTree(
    newSnap.methodsTree,
    newSnap.nodeRichContents || {},
    newSnap.nodeOverlayImages || {}
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
    const oldName = oldNode.name || '';
    const newName = newNode.name || '';

    if (oldRichHash !== newRichHash) {
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
  const snapHash = hashSnapshot(snapshot);

  // 获取父 commit
  const parentCommit = getHeadCommit(graph);
  const parentId = parentCommit ? parentCommit.id : null;

  // 计算与父 commit 的 diff
  let diff = { added: [], removed: [], changed: [] };
  if (parentCommit) {
    // 加载父 commit 的快照计算 diff（用 blob）
    const oldSnap = await loadBlob(key, parentCommit.snapshotHash);
    if (oldSnap) {
      diff = computeDiff(oldSnap, snapshot);
    }
  } else {
    // 第一个 commit：所有节点都是"新增"
    const flat = flattenTree(snapshot.methodsTree, snapshot.nodeRichContents || {}, snapshot.nodeOverlayImages || {});
    diff.added = Array.from(flat.keys());
  }

  // 若内容无变化且有父 commit，拒绝创建空 commit（除非强制）
  if (parentId && diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0) {
    const cur = getCurrentBranch(graph);
    return { commitId: parentId, branchName: cur ? cur.name : (graph.HEAD && graph.HEAD.type === 'commit' ? graph.commits.find(c => c.id === graph.HEAD.id)?.branch : ''), diff, skipped: true };
  }

  // 生成 commit id
  const commitId = genCommitId();

  // 写入快照 blob（内容寻址，自动去重）
  await saveBlob(key, snapHash, snapshot);

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
    snapshotHash: snapHash,
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

  const newSnapHash = hashSnapshot(snapshot);
  // 内容无变化，跳过
  if (newSnapHash === headCommit.snapshotHash) {
    return { commitId: headCommit.id, updated: false, skipped: true };
  }

  // 写入新快照 blob（内容寻址，自动去重）
  await saveBlob(key, newSnapHash, snapshot);

  // 重算与父 commit 的 diff（保持 diff 与新快照一致）
  let diff = { added: [], removed: [], changed: [] };
  if (headCommit.parent) {
    const parentCommit = graph.commits.find(c => c.id === headCommit.parent);
    if (parentCommit) {
      const oldSnap = await loadBlob(key, parentCommit.snapshotHash);
      if (oldSnap) diff = computeDiff(oldSnap, snapshot);
    }
  } else {
    // 根 commit：所有节点都是"新增"
    const flat = flattenTree(snapshot.methodsTree, snapshot.nodeRichContents || {}, snapshot.nodeOverlayImages || {});
    diff.added = Array.from(flat.keys());
  }

  // 原地更新当前 HEAD commit 的快照哈希、时间、diff
  headCommit.snapshotHash = newSnapHash;
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

  // 加载快照
  const snapshot = await loadBlob(key, commit.snapshotHash);
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
 * 获取指定 commit 的快照
 */
export async function getCommitSnapshot(projectId, commitId) {
  const key = getVersionKey(projectId);
  const graph = await getGraph(projectId);
  const commit = graph.commits.find(c => c.id === commitId);
  if (!commit) return null;
  return await loadBlob(key, commit.snapshotHash);
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
