// ============================================================
//  版本存储：内容寻址存储（Content-Addressable Storage）
//  策略：
//    1. blob(hash) → 实际内容（去重：相同内容只存一份）
//    2. commit(id) → 引用快照（含 methodsTree 引用 + diff 预计算）
//    3. 版本图跟随项目文件夹存储
//  存储（versionKey 由渲染进程计算）：
//    已保存项目：<项目文件夹>/.versiongraph/
//      ├── graph.json          图结构（commits + branches + HEAD）
//      └── blobs/
//    未保存项目：userData/version-graphs-tmp/<projectId>/
// ============================================================

let _isElectron = typeof window !== 'undefined' && window.__ELECTRON__ && window.api;

/**
 * 哈希函数（与 emergencyBackup 一致，速度快）
 */
export function simpleHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return h + '_' + s.length;
}

/**
 * 计算节点内容的哈希（用于判断节点是否变化）
 */
export function hashNodeContent(content) {
  if (!content) return 'empty';
  return simpleHash(JSON.stringify(content));
}

/**
 * 计算整个快照的哈希（用于判断是否需要新 commit）
 */
export function hashSnapshot(snapshot) {
  return simpleHash(JSON.stringify(snapshot));
}

/**
 * 写入版本图结构（commits + branches + HEAD）
 * @param {string} projectId
 * @param {Object} graph - { commits, branches, HEAD }
 * @returns {Promise<{success:boolean, error?:string}>}
 */
export async function saveGraph(projectId, graph) {
  if (!_isElectron) return { success: false, error: '非 Electron 环境' };
  try {
    return await window.api.versionSaveGraph(projectId, graph);
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * 读取版本图结构
 * @param {string} projectId
 * @returns {Promise<Object|null>} graph 或 null
 */
export async function loadGraph(projectId) {
  if (!_isElectron) return null;
  try {
    const r = await window.api.versionLoadGraph(projectId);
    return r.success ? r.graph : null;
  } catch (e) {
    return null;
  }
}

/**
 * 写入 blob（内容寻址，自动去重）
 * @param {string} projectId
 * @param {string} hash - 内容哈希
 * @param {Object} content - 实际内容
 * @returns {Promise<boolean>}
 */
export async function saveBlob(projectId, hash, content) {
  if (!_isElectron) return false;
  try {
    const r = await window.api.versionSaveBlob(projectId, hash, content);
    return r.success;
  } catch (e) {
    return false;
  }
}

/**
 * 读取 blob
 * @param {string} projectId
 * @param {string} hash
 * @returns {Promise<Object|null>}
 */
export async function loadBlob(projectId, hash) {
  if (!_isElectron) return null;
  try {
    const r = await window.api.versionLoadBlob(projectId, hash);
    return r.success ? r.content : null;
  } catch (e) {
    return null;
  }
}

/**
 * 批量写入 blobs（一次性写多个，减少 IPC 开销）
 * @param {string} projectId
 * @param {Object} hashToContent - { hash: content, ... }
 * @returns {Promise<boolean>}
 */
export async function saveBlobs(projectId, hashToContent) {
  if (!_isElectron) return false;
  try {
    const r = await window.api.versionSaveBlobs(projectId, hashToContent);
    return r.success;
  } catch (e) {
    return false;
  }
}

/**
 * 列出项目所有版本图（用于跨项目视图，可选）
 * @returns {Promise<Array>}
 */
export async function listAllGraphs() {
  if (!_isElectron) return [];
  try {
    const r = await window.api.versionListGraphs();
    return r.success ? r.list : [];
  } catch (e) {
    return [];
  }
}

/**
 * 删除指定 key 的版本图（删除项目时清理）
 * @param {string} versionKey - 项目文件夹路径或临时 projectId
 * @returns {Promise<boolean>}
 */
export async function deleteGraph(versionKey) {
  if (!_isElectron) return false;
  try {
    const r = await window.api.versionDeleteGraph(versionKey);
    return r.success;
  } catch (e) {
    return false;
  }
}
