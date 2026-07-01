// ============================================================
//  toolbar/toolbar-home.js — 开始 tab 分发器
// ============================================================

import { registerEditRegion } from './toolbar-home-edit.js';
import { registerFontRegion } from './toolbar-home-font.js';
import { registerParagraphRegion } from './toolbar-home-paragraph.js';

export function registerHomeTab(editor) {
  registerEditRegion(editor);
  registerFontRegion(editor);
  registerParagraphRegion(editor);
}