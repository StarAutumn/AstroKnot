// Vitest 全局 setup：模拟浏览器环境
// 在所有测试文件导入前执行
import { vi } from 'vitest';

// module0_AppState.js 在模块顶层执行 window.appState = appState
vi.stubGlobal('window', {
  appState: {
    nodeMap: new Map(),
    positions2D: new Map(),
    methodsTree: null,
    VIRTUAL_ROOT_ID: '__VIRTUAL_ROOT__',
  },
});

// HistoryManager.updateButtons 依赖 document.getElementById
vi.stubGlobal('document', {
  getElementById: vi.fn(() => null), // 返回 null → updateButtons 安全跳过
});

// Three.js mock（module0_AppState.js 依赖）
vi.mock('three', () => {
  class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    clone() { return new Vector3(this.x, this.y, this.z); }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  }
  return { default: {}, Vector3 };
});
