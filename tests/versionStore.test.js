// ============================================================
//  versionStore 纯函数单元测试
// ============================================================
import { describe, it, expect } from 'vitest';
import { simpleHash, hashNodeContent, hashSnapshot } from '../modules/versionGraph/versionStore.js';

describe('simpleHash', () => {
  it('相同输入产生相同输出', () => {
    expect(simpleHash('hello')).toBe(simpleHash('hello'));
  });

  it('不同输入产生不同输出', () => {
    expect(simpleHash('hello')).not.toBe(simpleHash('world'));
  });

  it('空字符串返回有效哈希', () => {
    const h = simpleHash('');
    expect(typeof h).toBe('string');
    expect(h).toContain('_'); // 格式: hash_length
  });

  it('哈希包含长度信息', () => {
    const h = simpleHash('abc');
    expect(h.endsWith('_3')).toBe(true);
  });

  it('长字符串也能正确哈希', () => {
    const long = 'x'.repeat(10000);
    const h = simpleHash(long);
    expect(h.endsWith('_10000')).toBe(true);
  });

  it('Unicode 字符正确处理', () => {
    const h = simpleHash('你好世界');
    expect(typeof h).toBe('string');
    expect(h).toContain('_');
    expect(simpleHash('你好世界')).toBe(simpleHash('你好世界'));
  });
});

describe('hashNodeContent', () => {
  it('null/undefined 返回 "empty"', () => {
    expect(hashNodeContent(null)).toBe('empty');
    expect(hashNodeContent(undefined)).toBe('empty');
  });

  it('空对象也能哈希', () => {
    const h = hashNodeContent({});
    expect(typeof h).toBe('string');
    expect(h).not.toBe('empty');
  });

  it('相同内容产生相同哈希', () => {
    const node = { name: 'test', children: [] };
    expect(hashNodeContent(node)).toBe(hashNodeContent({ name: 'test', children: [] }));
  });

  it('不同内容产生不同哈希', () => {
    expect(hashNodeContent({ name: 'a' })).not.toBe(hashNodeContent({ name: 'b' }));
  });
});

describe('hashSnapshot', () => {
  it('相同快照产生相同哈希', () => {
    const snap = { methodsTree: { id: 'root' }, crossEdges: [] };
    expect(hashSnapshot(snap)).toBe(hashSnapshot({ methodsTree: { id: 'root' }, crossEdges: [] }));
  });

  it('不同快照产生不同哈希', () => {
    const a = { methodsTree: { id: 'a' } };
    const b = { methodsTree: { id: 'b' } };
    expect(hashSnapshot(a)).not.toBe(hashSnapshot(b));
  });
});
