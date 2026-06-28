// ============================================================
//  toolbar-buttons.js — 工具栏按钮入口（按 tab 分发）
// ============================================================

import { registerHomeTab } from './toolbar/toolbar-home.js';
import { registerInsertTab } from './toolbar/toolbar-insert.js';
import { registerLayoutTab } from './toolbar/toolbar-doc-layout.js';
import { registerShapeFormatTab } from './toolbar/toolbar-shape-format.js';
import { registerDrawTab } from './toolbar/toolbar-draw.js';
import { registerViewTab } from './toolbar/toolbar-view.js';

export function registerToolbarButtons(editor) {
  registerHomeTab(editor);
  registerInsertTab(editor);
  registerLayoutTab(editor);
  registerShapeFormatTab(editor);
  registerDrawTab(editor);
  registerViewTab(editor);
}