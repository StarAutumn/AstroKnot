export const contentStyle = 
  'body { padding: 8px 8px 8px 28px !important; } sup,sub{font-size:0.55em;} ol,ul { padding-left: 0; } ol ol,ul ul,ol ul,ul ol { padding-left: 1.5em; }' +
  'rt { font-size: 0.45em; line-height: 1; user-select: none; color: inherit; opacity: 0.75; } ruby { ruby-align: center; }' +
  'li::marker{color:var(--mkr-color,inherit);font-size:var(--mkr-font-size,inherit);font-family:var(--mkr-font-family,inherit);font-weight:var(--mkr-font-weight,inherit);font-style:var(--mkr-font-style,inherit);text-decoration-line:var(--mkr-text-deco,inherit);border:var(--mkr-border,inherit);background-color:var(--mkr-bg-color,inherit);background-image:var(--mkr-bg-image,inherit);-webkit-background-clip:var(--mkr-bg-clip,inherit);-webkit-text-fill-color:var(--mkr-text-fill,inherit)}' +
  'span.gradient-text{background-clip:text;-webkit-background-clip:text;background-size:100% 100%;background-repeat:no-repeat;}' +
  'u sup,u sub{text-decoration:none;-webkit-text-decoration:none;}' +
  's sup,s sub,del sup,del sub,strike sup,strike sub{text-decoration:none;-webkit-text-decoration:none;}' +
  '[data-mce-style*="underline"] sup,[data-mce-style*="underline"] sub{text-decoration:none;-webkit-text-decoration:none;}' +
  '[data-mce-style*="line-through"] sup,[data-mce-style*="line-through"] sub{text-decoration:none;-webkit-text-decoration:none;}' +
  'p.tmce-dropcap::first-letter{font-size:3.5em;float:left;line-height:0.8;margin-right:6px;margin-top:2px;font-weight:bold;color:inherit;}' +
  'p.tmce-dropcap{overflow:auto;}' +
  '.tmce-columns-2{column-count:2;column-gap:2em;}' +
  '.tmce-columns-3{column-count:3;column-gap:1.5em;}' +
  '.tmce-columns-2>p,.tmce-columns-3>p{margin-top:0;}' +
  '.tmce-columns-2>p:first-child,.tmce-columns-3>p:first-child{margin-top:0;}' +
  '.toc-num{color:inherit;font-weight:600;margin-right:0.3em;user-select:none;cursor:default;font-variant-numeric:tabular-nums;}' +
  /* ── 代码块样式：覆盖 TinyMCE content.css 的 PrismJS 默认样式 ── */
  'pre,pre[class*="language-"],code[class*="language-"]{text-shadow:none !important;}' +
  'pre{background:#0d1b23 !important;border:1px solid #2c6e7e !important;border-radius:12px !important;padding:12px 16px !important;margin:8px 0 !important;overflow-x:auto !important;font-family:Consolas,Monaco,"Courier New",monospace !important;font-size:14px !important;line-height:1.6 !important;color:#c8e6ff !important;}' +
  'pre code{background:transparent !important;border:none !important;border-radius:0 !important;padding:0 !important;text-shadow:none !important;color:inherit !important;background-image:repeating-linear-gradient(to right,transparent 0,transparent calc(2ch - 1px),#1a3a44 calc(2ch - 1px),#1a3a44 2ch) !important;background-attachment:local !important;}' +
  /* 行内 code 不加边框（避免代码块内 code 误伤） */
  ':not(pre)>code{background:#1a2a34 !important;border:1px solid #2c6e7e !important;border-radius:4px !important;padding:2px 6px !important;font-family:Consolas,Monaco,"Courier New",monospace !important;font-size:14px !important;color:#c8e6ff !important;text-shadow:none !important;}' +
  /* hljs token 颜色对齐 Monaco astroknot-dark 主题 */
  '.hljs{color:#c8e6ff !important;background-color:transparent !important;}' +
  '.hljs-comment,.hljs-quote,.hljs-doctag{color:#5a7a8a !important;font-style:italic !important;}' +
  '.hljs-keyword,.hljs-selector-tag,.hljs-tag,.hljs-section,.hljs-name{color:#00e5ff !important;}' +
  '.hljs-string,.hljs-regexp,.hljs-meta-string,.hljs-symbol,.hljs-bullet,.hljs-link,.hljs-addition{color:#ffd93d !important;}' +
  '.hljs-number,.hljs-literal,.hljs-attr,.hljs-attribute,.hljs-variable,.hljs-template-variable,.hljs-deletion{color:#ff6b9d !important;}' +
  '.hljs-type,.hljs-class .hljs-title,.hljs-function .hljs-title,.hljs-title,.hljs-built_in{color:#6bff6b !important;}' +
  '.hljs-meta,.hljs-selector-id,.hljs-selector-class,.hljs-selector-pseudo,.hljs-selector-attr{color:#5a7a8a !important;}' +
  /* 代码块 wrapper */
  '.tmce-code-wrapper{display:flex !important;background:#0d1b23 !important;border:1px solid #2c6e7e !important;border-radius:12px !important;overflow:hidden !important;margin:8px 0 !important;}' +
  '.tmce-line-numbers{flex-shrink:0;display:flex;flex-direction:column;padding:12px 0;background:#0d1b23;color:#3a5a6a;user-select:none;text-align:right;min-width:48px;font-family:Consolas,Monaco,"Courier New",monospace;font-size:14px;line-height:1.6;border-right:1px solid #1a2a34;overflow:hidden;}' +
  '.tmce-line-numbers span{display:block;padding:0 12px 0 6px;line-height:1.6;}' +
  '.tmce-code-area{flex:1;overflow:auto;min-width:0;position:relative !important;}' +
  '.tmce-indent-guides{position:absolute !important;top:0 !important;left:0 !important;right:0 !important;bottom:0 !important;pointer-events:none !important;z-index:10 !important;overflow:hidden !important;}' +
  '.tmce-indent-guide-line{position:absolute !important;width:1px !important;background:#1a3a44 !important;}' +
  '.tmce-code-wrapper pre{margin:0 !important;border:none !important;border-radius:0 !important;padding:12px 16px !important;background-color:#0d1b23 !important;overflow:auto !important;font-size:14px !important;line-height:1.6 !important;text-shadow:none !important;}' +
  '.tmce-code-wrapper pre code{display:block !important;background-color:transparent !important;background-image:none !important;border:none !important;padding:0 !important;text-shadow:none !important;min-height:100%;}' +
  '.tmce-code-wrapper pre code *{background-color:transparent !important;}';