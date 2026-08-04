// ============================================================
//  代码编辑器 (沙盒 IDE) — VSCode 风格迷你 IDE
//  右键节点 → "💻 以 HTML 方式打开" → IDE 编辑器
//  双击节点 → 渲染代码运行效果
//  使用 WindowManager 统一管理窗口状态、动画、拖拽
//  Monaco Editor + 文件树 + 标签页 + esbuild-wasm 打包
//
//  扩展功能：
//   ✓ 控制台面板（对象展开/过滤/计数/错误徽标）
//   ✓ 快捷键（Ctrl+S/Enter/W/`/Shift+F/P/F1）
//   ✓ 自动保存 + 智能运行（防抖）
//   ✓ Emmet 缩写 + 代码片段模板
//   ✓ 多种预览模式（响应式/主题/全屏）
//   ✓ 全局文件搜索（Ctrl+Shift+F）
//   ✓ 本地历史记录（快照/diff/回滚）
//   ✓ CSS/JS 实时热注入
// ============================================================

// 公共 API — 编辑器生命周期
export {
  openHtmlSandboxEditor,
  closeHtmlSandboxEditor,
  isNodeSandbox,
  getSandboxHtml,
  renderSandboxContent
} from './editor-lifecycle.js';

// 公共 API — 容器模式
export {
  initIdeInContainer,
  destroyIdeContainer
} from './container-mode.js';

console.log('[html-sandbox-editor] 模块已加载（VSCode 风格 IDE + 扩展功能 + 容器化支持）');
