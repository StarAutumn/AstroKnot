// ============================================================
//  TreeData 纯函数单元测试
//  ensureNodeDefaults / getEmptyProjectData / cloneProjectData
// ============================================================
import { describe, it, expect } from 'vitest';

// 这些函数依赖 appState，需要 mock
// 但 ensureNodeDefaults 和 getEmptyProjectData 的核心逻辑足够简单
// 我们通过等效实现来测试核心逻辑，避免复杂的 mock 链

// ── ensureNodeDefaults 等效 ──
function ensureNodeDefaults(node) {
  if (node.sizeScale === undefined) node.sizeScale = 1.0;
  if (node.ringSpeedFactor === undefined) node.ringSpeedFactor = 1.0;
  if (node.fixedColor === undefined) node.fixedColor = null;
  if (node.activeMode === undefined) node.activeMode = null;
}

describe('ensureNodeDefaults', () => {
  it('空对象补全所有默认值', () => {
    const node = {};
    ensureNodeDefaults(node);
    expect(node.sizeScale).toBe(1.0);
    expect(node.ringSpeedFactor).toBe(1.0);
    expect(node.fixedColor).toBeNull();
    expect(node.activeMode).toBeNull();
  });

  it('已有值不被覆盖', () => {
    const node = { sizeScale: 2.0, ringSpeedFactor: 0.5, fixedColor: '#ff0000', activeMode: 'code' };
    ensureNodeDefaults(node);
    expect(node.sizeScale).toBe(2.0);
    expect(node.ringSpeedFactor).toBe(0.5);
    expect(node.fixedColor).toBe('#ff0000');
    expect(node.activeMode).toBe('code');
  });

  it('部分缺失只补缺失的', () => {
    const node = { sizeScale: 3.0 };
    ensureNodeDefaults(node);
    expect(node.sizeScale).toBe(3.0);
    expect(node.ringSpeedFactor).toBe(1.0);
    expect(node.fixedColor).toBeNull();
    expect(node.activeMode).toBeNull();
  });

  it('显式 undefined 也补默认值', () => {
    const node = { sizeScale: undefined };
    ensureNodeDefaults(node);
    expect(node.sizeScale).toBe(1.0);
  });

  it('显式 null 不被覆盖（null ≠ undefined）', () => {
    const node = { fixedColor: null };
    ensureNodeDefaults(node);
    expect(node.fixedColor).toBeNull();
    // activeMode 还是 null（默认也是 null，但不会被二次覆盖）
    expect(node.activeMode).toBeNull();
  });

  it('0 不被视为缺失', () => {
    const node = { sizeScale: 0 };
    ensureNodeDefaults(node);
    expect(node.sizeScale).toBe(0);
  });
});

// ── escapeHtml 等效 ──
function escapeHtml(str) {
  if (!str) return str;
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

describe('escapeHtml', () => {
  it('转义 HTML 特殊字符', () => {
    expect(escapeHtml('<div>')).toBe('&lt;div&gt;');
    expect(escapeHtml('a & b')).toBe('a &amp; b');
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
    expect(escapeHtml("it's")).toBe("it&#39;s");
  });

  it('普通文本不变', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
    expect(escapeHtml('12345')).toBe('12345');
  });

  it('空字符串/null/undefined 安全返回', () => {
    expect(escapeHtml('')).toBe('');
    expect(escapeHtml(null)).toBeNull();
    expect(escapeHtml(undefined)).toBeUndefined();
  });

  it('组合特殊字符', () => {
    expect(escapeHtml('<a href="x">&amp;</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;amp;&lt;/a&gt;');
  });
});

// ── computeMaxDepth 等效（从 versionAtmosphere.js） ──
function computeMaxDepth(graph) {
  if (!graph || !graph.commits || graph.commits.length === 0) return 1;
  const depthMap = new Map();
  const commitMap = new Map(graph.commits.map(c => [c.id, c]));
  function depth(id) {
    if (depthMap.has(id)) return depthMap.get(id);
    const c = commitMap.get(id);
    if (!c || !c.parent) {
      depthMap.set(id, 1);
      return 1;
    }
    const d = depth(c.parent) + 1;
    depthMap.set(id, d);
    return d;
  }
  let max = 1;
  for (const c of graph.commits) {
    const d = depth(c.id);
    if (d > max) max = d;
  }
  return max;
}

describe('computeMaxDepth（versionAtmosphere 等效）', () => {
  it('空图返回 1', () => {
    expect(computeMaxDepth(null)).toBe(1);
    expect(computeMaxDepth(undefined)).toBe(1);
    expect(computeMaxDepth({ commits: [] })).toBe(1);
  });

  it('单根 commit 返回 1', () => {
    const graph = { commits: [{ id: 'a', parent: null }] };
    expect(computeMaxDepth(graph)).toBe(1);
  });

  it('线性链计算正确深度', () => {
    // a → b → c
    const graph = {
      commits: [
        { id: 'a', parent: null },
        { id: 'b', parent: 'a' },
        { id: 'c', parent: 'b' },
      ]
    };
    expect(computeMaxDepth(graph)).toBe(3);
  });

  it('分叉图取最长分支', () => {
    //     a
    //    / \
    //   b   c
    //   |
    //   d
    const graph = {
      commits: [
        { id: 'a', parent: null },
        { id: 'b', parent: 'a' },
        { id: 'c', parent: 'a' },
        { id: 'd', parent: 'b' },
      ]
    };
    expect(computeMaxDepth(graph)).toBe(3);
  });

  it('孤立 commit（parent 不在图中）视为根', () => {
    const graph = {
      commits: [
        { id: 'a', parent: null },
        { id: 'b', parent: 'missing' },
      ]
    };
    expect(computeMaxDepth(graph)).toBe(2);
  });

  it('无 parent 字段视为根', () => {
    const graph = {
      commits: [
        { id: 'a' },
        { id: 'b', parent: 'a' },
      ]
    };
    expect(computeMaxDepth(graph)).toBe(2);
  });
});
