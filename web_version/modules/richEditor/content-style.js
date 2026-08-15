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
  /* ── 勾选框（可点击切换） ── */
  '.tmce-todo-check{display:inline-flex !important;align-items:center !important;justify-content:center !important;width:16px !important;height:16px !important;margin:0 0.3em !important;vertical-align:-0.2em !important;cursor:pointer !important;user-select:none !important;-webkit-user-select:none !important;border:1.5px solid #aef0ff !important;border-radius:3px !important;box-sizing:border-box !important;background:rgba(174,240,255,0.06) !important;position:relative !important;transition:background 0.15s,border-color 0.15s !important;}' +
  '.tmce-todo-check:hover{border-color:#7fd7f0 !important;box-shadow:0 0 0 2px rgba(79,195,247,0.18) !important;}' +
  '.tmce-todo-check[data-checked="true"]{background:rgba(79,195,247,0.22) !important;border-color:#4fc3f7 !important;}' +
  '.tmce-todo-check[data-checked="true"]::after{content:\'\' !important;position:absolute !important;left:3px !important;top:0.5px !important;width:8px !important;height:4.5px !important;border-left:2px solid #4fc3f7 !important;border-bottom:2px solid #4fc3f7 !important;transform:rotate(-45deg) !important;}' +
  '.tmce-todo-check .tmce-todo-check-box{display:none !important;}';