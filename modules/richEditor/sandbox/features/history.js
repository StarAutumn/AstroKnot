// ============================================================
//  sandbox-history.js — 本地历史记录（快照管理）
//  每次保存时生成文件快照，支持查看 diff 和回滚
//  数据存储在节点级内存中，保存项目时序列化到磁盘
// ============================================================

const MAX_VERSIONS_PER_FILE = 20; // 每个文件最多保留的版本数

/**
 * 历史记录管理器
 * 结构: Map<filePath, Array<{ timestamp, content, action }>>
 */
export class SandboxHistory {
  constructor() {
    this._data = new Map(); // filePath → versions[]
    this._nodeId = null;
  }

  /**
   * 绑定到节点
   */
  attachToNode(nodeId) {
    this._nodeId = nodeId;
    this._data.clear();
  }

  /**
   * 从节点的 history 字段恢复
   */
  loadFromNode(node) {
    this._data.clear();
    if (node && node.sandboxHistory) {
      try {
        for (const [filePath, versions] of Object.entries(node.sandboxHistory)) {
          this._data.set(filePath, versions.slice(-MAX_VERSIONS_PER_FILE));
        }
      } catch (e) {
        console.warn('[sandbox-history] 加载历史失败:', e);
      }
    }
  }

  /**
   * 序列化到节点（用于持久化）
   */
  saveToNode(node) {
    if (!node) return;
    const obj = {};
    for (const [filePath, versions] of this._data) {
      obj[filePath] = versions.slice(-MAX_VERSIONS_PER_FILE);
    }
    node.sandboxHistory = obj;
  }

  /**
   * 记录一个文件的快照
   * @param {string} filePath - 文件路径
   * @param {string} content - 文件内容
   * @param {string} action - 操作类型 (save/manual/auto)
   */
  recordSnapshot(filePath, content, action = 'save') {
    if (!filePath) return;
    let versions = this._data.get(filePath);
    if (!versions) {
      versions = [];
      this._data.set(filePath, versions);
    }

    // 跳过与上一版本相同的内容
    const last = versions[versions.length - 1];
    if (last && last.content === content) return;

    versions.push({
      timestamp: Date.now(),
      content: content,
      action: action
    });

    // 限制版本数量
    if (versions.length > MAX_VERSIONS_PER_FILE) {
      // 保留第一个版本（初始状态）+ 最近的 N-1 个版本
      const first = versions[0];
      const recent = versions.slice(-(MAX_VERSIONS_PER_FILE - 1));
      versions.length = 0;
      versions.push(first, ...recent);
    }
  }

  /**
   * 批量记录当前所有文件的快照
   */
  recordAllFiles(vfs, action = 'save') {
    if (!vfs) return;
    for (const [filePath, file] of vfs.getAllFiles()) {
      this.recordSnapshot(filePath, file.content, action);
    }
  }

  /**
   * 获取有历史的文件列表
   */
  getFiles() {
    return Array.from(this._data.keys()).sort();
  }

  /**
   * 获取某文件的所有版本
   */
  getVersions(filePath) {
    return this._data.get(filePath) || [];
  }

  /**
   * 获取某文件的最新内容
   */
  getLatestContent(filePath) {
    const versions = this._data.get(filePath);
    if (!versions || versions.length === 0) return null;
    return versions[versions.length - 1].content;
  }

  /**
   * 获取指定版本的内容
   */
  getVersionContent(filePath, timestamp) {
    const versions = this._data.get(filePath);
    if (!versions) return null;
    const v = versions.find(v => v.timestamp === timestamp);
    return v ? v.content : null;
  }

  /**
   * 计算两个版本之间的 diff（行级）
   */
  diff(filePath, oldTimestamp, newTimestamp) {
    const oldContent = this.getVersionContent(filePath, oldTimestamp);
    const newContent = this.getVersionContent(filePath, newTimestamp);
    if (oldContent == null || newContent == null) return [];
    return _lineDiff(oldContent, newContent);
  }

  /**
   * 计算某版本与当前内容的 diff
   */
  diffWithCurrent(filePath, timestamp, currentContent) {
    const oldContent = this.getVersionContent(filePath, timestamp);
    if (oldContent == null) return [];
    return _lineDiff(oldContent, currentContent || '');
  }

  /**
   * 清空所有历史
   */
  clear() {
    this._data.clear();
  }

  /**
   * 清空某文件的历史
   */
  clearFile(filePath) {
    this._data.delete(filePath);
  }
}

// ════════════════════════════════════════════════════════════
//  行级 diff 算法（基于 LCS）
// ════════════════════════════════════════════════════════════

function _lineDiff(oldText, newText) {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const m = oldLines.length;
  const n = newLines.length;

  // 行数上限保护：超过此阈值时截断，避免 O(m*n) 内存爆炸
  const MAX_LINES = 5000;
  const truncatedOld = m > MAX_LINES;
  const truncatedNew = n > MAX_LINES;
  const oldSlice = truncatedOld ? oldLines.slice(0, MAX_LINES) : oldLines;
  const newSlice = truncatedNew ? newLines.slice(0, MAX_LINES) : newLines;
  const ms = oldSlice.length;
  const ns = newSlice.length;

  // 构建 LCS 表（使用截断后的行数）
  const dp = [];
  for (let i = 0; i <= ms; i++) {
    dp.push(new Array(ns + 1).fill(0));
  }
  for (let i = 1; i <= ms; i++) {
    for (let j = 1; j <= ns; j++) {
      if (oldSlice[i-1] === newSlice[j-1]) {
        dp[i][j] = dp[i-1][j-1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i-1][j], dp[i][j-1]);
      }
    }
  }

  // 回溯生成 diff
  const result = [];
  // 截断提示
  if (truncatedOld) result.push({ type: 'meta', text: `⚠ 旧文件超过 ${MAX_LINES} 行，仅对比前 ${MAX_LINES} 行` });
  if (truncatedNew) result.push({ type: 'meta', text: `⚠ 新文件超过 ${MAX_LINES} 行，仅对比前 ${MAX_LINES} 行` });
  let i = ms, j = ns;
  const ops = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldSlice[i-1] === newSlice[j-1]) {
      ops.unshift({ type: 'ctx', line: oldSlice[i-1], oldNum: i, newNum: j });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) {
      ops.unshift({ type: 'add', line: newSlice[j-1], newNum: j });
      j--;
    } else if (i > 0) {
      ops.unshift({ type: 'del', line: oldSlice[i-1], oldNum: i });
      i--;
    }
  }

  // 折叠上下文（只显示变更前后各3行）
  const CONTEXT = 3;
  const changeIdx = [];
  ops.forEach((op, idx) => {
    if (op.type !== 'ctx') changeIdx.push(idx);
  });

  if (changeIdx.length === 0) {
    return [{ type: 'ctx-all', text: '(内容相同)' }];
  }

  const showRanges = [];
  for (const ci of changeIdx) {
    const start = Math.max(0, ci - CONTEXT);
    const end = Math.min(ops.length - 1, ci + CONTEXT);
    if (showRanges.length === 0 || start > showRanges[showRanges.length-1].end + 1) {
      showRanges.push({ start, end });
    } else {
      showRanges[showRanges.length-1].end = Math.max(showRanges[showRanges.length-1].end, end);
    }
  }

  for (let r = 0; r < showRanges.length; r++) {
    const range = showRanges[r];
    if (r > 0) {
      result.push({ type: 'meta', text: '  ...  ' });
    }
    for (let k = range.start; k <= range.end; k++) {
      const op = ops[k];
      if (op.type === 'add') {
        result.push({ type: 'add', text: '+ ' + op.line });
      } else if (op.type === 'del') {
        result.push({ type: 'del', text: '- ' + op.line });
      } else {
        result.push({ type: 'ctx', text: '  ' + op.line });
      }
    }
  }

  return result;
}

console.log('[sandbox-history] 模块已加载');
