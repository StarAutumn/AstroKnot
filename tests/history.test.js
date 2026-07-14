// ============================================================
//  HistoryManager 单元测试
//  通过 mock appState 和外部依赖，隔离测试撤销/重做逻辑
// ============================================================
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock 外部模块（必须在 import 之前）
vi.mock('../modules/VisualComponents/index.js', () => ({
  buildSceneFromTree: vi.fn(),
}));

vi.mock('../modules/module2_TreeData.js', () => ({
  saveCurrentProjectData: vi.fn(),
  renderProjectList: vi.fn(),
}));

vi.mock('../modules/module8_ContextMenu.js', () => ({
  hideContextMenu: vi.fn(),
}));

// 现在可以安全 import
import { appState } from '../modules/module0_AppState.js';
import { history, withHistory } from '../modules/module3_History.js';

describe('HistoryManager', () => {
  beforeEach(() => {
    history.clear();
    // 给 appState 一个最小可用状态
    appState.methodsTree = { id: '__VIRTUAL_ROOT__', children: [] };
    appState.crossEdges = [];
    appState.positions = new Map();
    appState.nodeMap = new Map();
    appState.camera = {
      position: { x: 0, y: 4.5, z: 8, set: vi.fn() },
    };
    appState.controls = {
      target: { x: 0, y: 0.2, z: 0, set: vi.fn() },
      enableDamping: false,
      update: vi.fn(),
    };
    appState.exitMoveMode = null;
  });

  describe('pushState', () => {
    it('推入状态后 undoCount 增加', () => {
      expect(history.getConfig().undoCount).toBe(0);
      history.pushState();
      expect(history.getConfig().undoCount).toBe(1);
    });

    it('推入状态后清空 redoStack', () => {
      // 模拟：先 undo 产生 redo 项
      history.pushState(); // t0
      // 修改数据
      appState.methodsTree = { id: '__VIRTUAL_ROOT__', children: [{ id: 'n1' }] };
      history.pushState(); // t1
      // 撤销产生 redo
      history.undo();
      expect(history.getConfig().redoCount).toBe(1);
      // 再 push 应清空 redo
      history.pushState();
      expect(history.getConfig().redoCount).toBe(0);
    });

    it('超过 maxSize 时丢弃最早的记录', () => {
      history.setMaxSize(3);
      for (let i = 0; i < 5; i++) {
        appState.crossEdges = [{ i }];
        history.pushState();
      }
      expect(history.getConfig().undoCount).toBe(3);
    });
  });

  describe('undo / redo', () => {
    it('undo 恢复上一个状态', () => {
      // 状态 t0: 空 children
      history.pushState();
      // 修改为 t1
      appState.methodsTree = { id: '__VIRTUAL_ROOT__', children: [{ id: 'n1' }] };
      history.pushState();
      // 再修改为 t2
      appState.methodsTree = { id: '__VIRTUAL_ROOT__', children: [{ id: 'n1' }, { id: 'n2' }] };
      // undo 回到 t1
      history.undo();
      // undoStack 应减少，redoStack 应增加
      expect(history.getConfig().undoCount).toBe(1);
      expect(history.getConfig().redoCount).toBe(1);
    });

    it('连续 undo → redo 可回到最新状态', () => {
      history.pushState();
      appState.crossEdges = [{ a: 1 }];
      history.pushState();
      history.undo();
      history.redo();
      expect(history.getConfig().undoCount).toBe(2);
      expect(history.getConfig().redoCount).toBe(0);
    });

    it('空栈时 undo/redo 无操作', () => {
      expect(() => history.undo()).not.toThrow();
      expect(() => history.redo()).not.toThrow();
    });
  });

  describe('clear', () => {
    it('清空所有历史', () => {
      history.pushState();
      history.pushState();
      history.clear();
      expect(history.getConfig().undoCount).toBe(0);
      expect(history.getConfig().redoCount).toBe(0);
    });
  });

  describe('withHistory', () => {
    it('自动在操作前记录状态', () => {
      const fn = withHistory(() => {
        appState.crossEdges = [{ new: true }];
      });
      fn();
      expect(history.getConfig().undoCount).toBe(1);
    });

    it('保留原函数的返回值', () => {
      const fn = withHistory(() => 42);
      expect(fn()).toBe(42);
    });
  });

  describe('setMaxSize / getConfig', () => {
    it('动态调整最大容量', () => {
      history.setMaxSize(10);
      expect(history.getConfig().maxSize).toBe(10);
    });

    it('无效值不改变 maxSize', () => {
      const before = history.getConfig().maxSize;
      history.setMaxSize(-1);
      expect(history.getConfig().maxSize).toBe(before);
      history.setMaxSize('abc');
      expect(history.getConfig().maxSize).toBe(before);
    });
  });
});
