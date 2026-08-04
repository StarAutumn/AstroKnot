// ============================================================
//  toolbar/toolbar-home-font/index.js — 字体区域协调器
//  汇总所有子模块的注册函数，暴露 registerFontRegion
// ============================================================

import { registerFontFamily } from './register-font-family.js';
import { registerFontSize } from './register-font-size.js';
import { registerCharBorder } from './register-char-border.js';
import { registerCharSpacing } from './register-char-spacing.js';
import { registerChangeCase } from './register-change-case.js';
import { registerCharConvert } from './register-char-convert.js';
import { registerPinyin } from './register-pinyin.js';
import { registerEmphasis } from './register-emphasis.js';
import { registerUnderline } from './register-underline.js';
import { registerColorPicker } from './register-color-picker.js';

import {
  cnFonts, enFonts, cnFontNameMap, enFontNameMap,
  getCurrentFonts, updateFontButtonLabels
} from './font-data.js';

export function registerFontRegion(editor) {
  const shared = {
    cnFonts,
    enFonts,
    cnFontNameMap,
    enFontNameMap,
    getCurrentFonts,
    updateFontButtonLabels,
  };

  registerFontFamily(editor, shared);
  registerFontSize(editor);
  registerCharBorder(editor, shared);
  registerCharSpacing(editor);
  registerChangeCase(editor);
  registerCharConvert(editor);
  registerPinyin(editor);
  registerEmphasis(editor, shared);
  registerUnderline(editor, shared);
  registerColorPicker(editor, shared);
}