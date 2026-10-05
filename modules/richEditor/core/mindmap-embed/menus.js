// ============================================================
//  mindmap-embed/menus.js — 菜单框架 + 三种右键菜单 + 群组菜单
//  - 菜单框架：hideMenu/_menuClose/_baseMenu/_placeMenu/_menuItem/_menuTitle
//  - 控件构建（纯 DOM）：_menuSep/_menuRow/_ctlLabel/_ctlSlider/_ctlColor/
//    _ctlBtn/_ctlSelect/_ctlText/_menuBtnInto/_menuBtn
//  - showNodeMenu（节点）/ showSegMenu（鱼骨线段）/ showGroupMenu（群组）/
//    showBlankMenu（空白）
// ============================================================

import { setHint, MM_GRID } from './share.js';
import { _findParent } from './data.js';
import { _markChanged, renameNode, addChild, copyNode, removeNode, addRoot, arrangeTree, _deleteGroup } from './ops.js';
import { _fbToggleCollapse, _fbDuplicateTree, _fbDeleteSeg, _fbDeleteTree } from './fishbone.js';

// ── 菜单构建 helper ──
function hideMenu(inst) {
  if (inst._menu) { inst._menu.remove(); inst._menu = null; }
  document.removeEventListener('mousedown', inst._menuClose, true);
  document.removeEventListener('keydown', inst._menuClose, true);
  inst._menuClose = null;
}
function _menuClose(inst, e) {
  // 右键/中键按下不关菜单：避免右键打开菜单后被随后的 mousedown 立即误关
  // （pointerdown 开菜单的 setTimeout 与 mousedown 派发存在时序竞争）
  if (e && e.type === 'mousedown' && e.button !== 0) return;
  // 菜单内部点击豁免（capture 阶段监听先于菜单项动作）
  if (e && inst._menu && inst._menu.contains(e.target)) return;
  hideMenu(inst);
}
function _baseMenu(inst, kind) {
  hideMenu(inst);
  const menu = document.createElement('div');
  menu.className = 'mm-embed-menu';
  if (kind === 'node') {
    // 节点菜单：与 2D #nodeContextMenu 同款布局（2DView/style.css，默认 cyan 主题变量取值）
    // 不限高、不加滚动条：菜单完整显示，位置由 _placeMenu 收进任务栏上方
    menu.style.cssText = 'position:fixed;z-index:10000;display:flex;flex-direction:column;gap:12px;'
      + 'background:rgba(8,18,28,0.94);backdrop-filter:blur(16px);'
      + 'border:1px solid rgba(0,255,255,0.35);border-radius:12px;padding:14px 18px;min-width:240px;'
      + 'box-shadow:0 8px 32px rgba(0,0,0,.55),0 0 0 1px rgba(0,255,255,0.08) inset;'
      + 'color:#eef;font:13px system-ui,"Segoe UI",sans-serif;box-sizing:border-box;';
  } else {
    menu.style.cssText = 'position:fixed;z-index:10000;background:#0d1b24;border:1px solid #2c6e7e;border-radius:6px;padding:4px 0;box-shadow:0 4px 16px rgba(0,0,0,.5);min-width:190px;';
  }
  // 控件行事件不上浮关闭菜单
  menu.addEventListener('pointerdown', function (e) {
    if (e.target._mmNoClose) e.stopPropagation();
  });
  // 挂到 iframe body 顶层（脱离 contenteditable）：可编辑区内的焦点管理会
  // 干扰滑杆/颜色/下拉的 mousedown 默认行为，导致控件无法调节
  inst.div.ownerDocument.body.appendChild(menu);
  inst._menu = menu;
  return menu;
}
function _placeMenu(inst, menu, cx, cy) {
  // cx/cy 为视口坐标（clientX/clientY），配合 position:fixed 直接定位
  // 菜单完整显示（不限高不滚动），底部收在任务栏（44px）上方
  const win = inst.div.ownerDocument.defaultView;
  const mw = menu.offsetWidth || 240;
  const mh = menu.offsetHeight;
  const TASKBAR_H = 44;
  menu.style.left = Math.max(4, Math.min(cx, win.innerWidth - mw - 6)) + 'px';
  let top = Math.min(cy, win.innerHeight - TASKBAR_H - mh - 6);   // 超出底部 → 整体上移
  if (top < 4) top = 4;   // 屏幕过矮时贴顶兜底
  menu.style.top = top + 'px';
  setTimeout(function () {
    inst._menuClose = function (e) { _menuClose(inst, e); };
    document.addEventListener('mousedown', inst._menuClose, true);
    document.addEventListener('keydown', inst._menuClose, true);
  }, 0);
}
function _menuItem(inst, menu, text, fn, color) {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText = 'padding:6px 16px;color:#c0f0ff;font:13px system-ui,sans-serif;cursor:pointer;white-space:nowrap;' + (color ? 'background:' + color + ';' : '');
  el.addEventListener('mouseenter', function () { el.style.background = '#2c6e7e'; });
  el.addEventListener('mouseleave', function () { el.style.background = color || ''; });
  // pointerdown 直接触发：不依赖 click 派发（mousedown 阻默认/外层 capture 关闭菜单都会吞掉 click）
  el.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    e.stopPropagation();
    hideMenu(inst);
    fn();
  });
  menu.appendChild(el);
}
// 菜单标题：节点名 + ✏️ 重命名按钮（与 2D .menu-title 同款）
function _menuTitle(inst, menu, text, onRename) {
  const el = document.createElement('div');
  el.style.cssText = 'display:flex;align-items:center;gap:6px;font-weight:bold;color:#0ff;font-size:14px;'
    + 'border-bottom:1px solid rgba(0,255,255,0.35);padding-bottom:6px;margin-bottom:4px;'
    + 'white-space:nowrap;overflow:hidden;user-select:none;';
  const name = document.createElement('span');
  name.textContent = text;
  name.style.cssText = 'overflow:hidden;text-overflow:ellipsis;max-width:180px;';
  el.appendChild(name);
  if (onRename) {
    const btn = document.createElement('button');
    btn.textContent = '✏️';
    btn.title = '重命名';
    btn.style.cssText = 'background:none;border:none;color:#0ff;font-size:14px;cursor:pointer;padding:0 4px;width:auto;height:auto;margin:0;flex:none;';
    btn._mmNoClose = true;
    btn.addEventListener('pointerdown', function (e) {
      e.preventDefault();  // 防选区拖影
      e.stopPropagation();
      hideMenu(inst);
      onRename();
    });
    el.appendChild(btn);
  }
  el._mmNoClose = true;
  menu.appendChild(el);
}
// 分组分隔行（与 2D「━━ 对齐 ━━」分隔同款）
function _menuSep(menu, text) {
  const row = _menuRow(menu, []);
  const el = document.createElement('span');
  el.textContent = text;
  el.style.cssText = 'color:#8af;font-size:12px;width:100%;text-align:center;';
  el._mmNoClose = true;
  row.appendChild(el);
  return row;
}
function _menuRow(menu, controls) {
  const el = document.createElement('div');
  el.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;';
  el._mmNoClose = true;
  controls.forEach(function (c) { el.appendChild(c); });
  menu.appendChild(el);
  return el;
}
function _ctlLabel(text) {
  const el = document.createElement('span');
  el.textContent = text;
  el.style.cssText = 'min-width:70px;color:#aac;white-space:nowrap;';
  el._mmNoClose = true;
  return el;
}
function _ctlSlider(min, max, step, val, onInput, onCommit) {
  const el = document.createElement('input');
  el.type = 'range';
  el.min = min; el.max = max; el.step = step; el.value = val;
  el.style.cssText = 'flex:1;margin:0 8px;accent-color:#2c8a9e;';
  el._mmNoClose = true;
  el.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
  el.addEventListener('input', function (e) { e.stopPropagation(); onInput(parseFloat(el.value)); });
  el.addEventListener('change', function () { onCommit && onCommit(parseFloat(el.value)); });
  return el;
}
function _ctlColor(val, onInput, onCommit) {
  const el = document.createElement('input');
  el.type = 'color';
  el.value = val || '#ffffff';
  el.style.cssText = 'width:36px;height:28px;border:1px solid rgba(0,255,255,0.35);border-radius:8px;background:transparent;cursor:pointer;padding:0;';
  el._mmNoClose = true;
  el.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
  el.addEventListener('input', function (e) { e.stopPropagation(); onInput(el.value); });
  el.addEventListener('change', function () { onCommit && onCommit(el.value); });
  return el;
}
// 行内小按钮（菜单不关闭，如「清除」），2D 同款胶囊样式
function _ctlBtn(text, fn) {
  const el = document.createElement('button');
  el.textContent = text;
  el.style.cssText = 'background:#1a3a44;border:none;border-radius:16px;color:#eef;font-size:11px;padding:4px 10px;height:26px;cursor:pointer;margin:0;white-space:nowrap;';
  el._mmNoClose = true;
  el.addEventListener('pointerdown', function (e) {
    e.preventDefault();  // 同上：防选区拖影
    e.stopPropagation();
    fn();
  });
  el.addEventListener('mouseenter', function () { el.style.filter = 'brightness(1.25)'; });
  el.addEventListener('mouseleave', function () { el.style.filter = ''; });
  return el;
}
function _ctlSelect(val, options, onChange) {
  const el = document.createElement('select');
  el.style.cssText = 'flex:1;background:#07161f;border:1px solid #2c6e7e;color:#eef;padding:3px 6px;border-radius:8px;font-size:12px;cursor:pointer;outline:none;';
  el._mmNoClose = true;
  options.forEach(function (o) {
    const op = document.createElement('option');
    op.value = o.v; op.textContent = o.t;
    if (o.v === val) op.selected = true;
    el.appendChild(op);
  });
  el.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
  el.addEventListener('focus', function () { el.style.borderColor = '#0ff'; });
  el.addEventListener('blur', function () { el.style.borderColor = '#2c6e7e'; });
  el.addEventListener('change', function (e) { e.stopPropagation(); onChange(el.value); });
  return el;
}
// 2D 同款胶囊动作按钮（pointerdown 触发并关闭菜单，避开外层捕获吞 click）
function _menuBtnInto(inst, row, text, bg, fn, extra) {
  const el = document.createElement('button');
  el.textContent = text;
  el.style.cssText = 'border:none;color:#eef;padding:4px 10px;border-radius:16px;font-size:11px;height:26px;cursor:pointer;margin:0;background:' + bg + ';white-space:nowrap;' + (extra || '');
  el._mmNoClose = true;
  el.addEventListener('pointerdown', function (e) {
    e.preventDefault();   // 关键：阻止 contenteditable 启动选区→原生拖拽拖影（半透明脑图框）
    e.stopPropagation();
    hideMenu(inst);
    fn();
  });
  el.addEventListener('mouseenter', function () { el.style.filter = 'brightness(1.25)'; });
  el.addEventListener('mouseleave', function () { el.style.filter = ''; });
  row.appendChild(el);
  return el;
}
function _menuBtn(inst, menu, text, bg, fn, extra) {
  const row = _menuRow(menu, []);
  return _menuBtnInto(inst, row, text, bg, fn, extra);
}

// ── 节点右键菜单（布局与 2D #nodeContextMenu 同款：标题行+参数行+胶囊按钮行）──
function showNodeMenu(inst, n, sx, sy) {
  const menu = _baseMenu(inst, 'node');
  const isRoot = !_findParent(inst.data.roots, n.id);

  // 标题：节点名 + ✏️ 重命名（与 2D 标题行一致）
  _menuTitle(inst, menu, n.text || '节点', function () { renameNode(inst, n); });

  // 节点大小（0.3–3 滑杆 + 实时数值，与 2D 一致）
  const sizeVal = document.createElement('span');
  sizeVal.textContent = (n.sizeScale || 1).toFixed(1);
  sizeVal._mmNoClose = true;
  sizeVal.style.cssText = 'color:#aac;min-width:26px;text-align:right;';
  _menuRow(menu, [_ctlLabel('节点大小'),
    _ctlSlider(0.3, 3, 0.1, n.sizeScale || 1,
      function (v) { n.sizeScale = v; sizeVal.textContent = v.toFixed(1); },
      function (v) { n.sizeScale = v; sizeVal.textContent = v.toFixed(1); _markChanged(inst); }),
    sizeVal]);

  // 固定颜色 + 清除
  _menuRow(menu, [_ctlLabel('固定颜色'),
    _ctlColor(n.fixedColor, function (v) { n.fixedColor = v; }, function (v) { n.fixedColor = v; _markChanged(inst); }),
    _ctlBtn('清除', function () { delete n.fixedColor; _markChanged(inst); })]);

  // 2D节点图形（自动=未显式设置，步骤节点默认跑道形）
  _menuRow(menu, [_ctlLabel('2D节点图形'),
    _ctlSelect(n.shape || '', [
      { v: '', t: '自动（步骤=跑道形）' },
      { v: 'roundedRect', t: '圆角长方形' }, { v: 'diamond', t: '扁菱形' },
      { v: 'ellipse', t: '椭圆形' }, { v: 'stadium', t: '跑道形' }
    ], function (v) { if (v) n.shape = v; else delete n.shape; _markChanged(inst); })]);

  // 恢复默认（独立全宽按钮，#4a2c2c）
  _menuBtn(inst, menu, '恢复默认', '#4a2c2c', function () {
    n.sizeScale = 1; delete n.shape; delete n.fixedColor; n.type = 'text';
    _markChanged(inst);
  }, 'width:100%;');

  _menuSep(menu, '━━ 结构 ━━');

  // 新建子节点 / 新建下一步节点
  const rowAdd = _menuRow(menu, []);
  _menuBtnInto(inst, rowAdd, '＋ 新建子节点', '#2c6e7e', function () { addChild(inst, n, 'text'); });
  _menuBtnInto(inst, rowAdd, '⬇ 新建下一步节点', '#2c7a6e', function () { addChild(inst, n, 'step'); });

  // 变成根/子节点 + 类型互换
  const rowConv = _menuRow(menu, []);
  if (isRoot) {
    _menuBtnInto(inst, rowConv, '变成子节点', '#2c6e7e', function () {
      inst.mode = 'attachParent'; inst.modeFrom = n; setHint(inst, '请单击选择父节点（Esc 取消）');
    });
    _menuBtnInto(inst, rowConv, n.type === 'step' ? '变成文字根节点' : '变成步骤根节点', '#2c7a6e', function () {
      n.type = n.type === 'step' ? 'text' : 'step'; _markChanged(inst);
    });
  } else {
    _menuBtnInto(inst, rowConv, '变成根节点', '#2c6e7e', function () {
      const p = _findParent(inst.data.roots, n.id);
      if (p) {
        p.children = p.children.filter(function (c) { return c.id !== n.id; });
        inst.data.roots.push(n);
        _markChanged(inst);
      }
    });
    _menuBtnInto(inst, rowConv, n.type === 'step' ? '变成文字子节点' : '变成步骤子节点', '#2c7a6e', function () {
      n.type = n.type === 'step' ? 'text' : 'step'; _markChanged(inst);
    });
  }

  // 折叠/展开子节点（仅有子节点时显示）
  if (n.children.length) {
    const rowFold = _menuRow(menu, []);
    _menuBtnInto(inst, rowFold, '折叠/展开子节点', '#2c6e7e', function () {
      n.collapsed = !n.collapsed; _markChanged(inst);
    });
  }

  _menuSep(menu, '━━ 连线 / 操作 ━━');

  // 添加连线 / 删除连线
  const rowEdge = _menuRow(menu, []);
  _menuBtnInto(inst, rowEdge, '添加连线', '#2c6e7e', function () {
    inst.mode = 'addEdge'; inst.modeFrom = n; setHint(inst, '请单击目标节点（Esc 取消）');
  });
  _menuBtnInto(inst, rowEdge, '删除连线', '#6a3c3c', function () {
    inst.mode = 'delEdge'; setHint(inst, '请单击要删除的连线（Esc 取消）');
  });

  // 复制节点 / 删除该节点
  const rowOps = _menuRow(menu, []);
  _menuBtnInto(inst, rowOps, '复制节点', '#2c5a7e', function () { copyNode(inst, n); });
  _menuBtnInto(inst, rowOps, '删除该节点', '#6a2c2c', function () { removeNode(inst, n); });

  _placeMenu(inst, menu, sx, sy);
}

// 文本输入（菜单不关闭，回车/失焦保存）
function _ctlText(val, placeholder, onCommit) {
  const el = document.createElement('input');
  el.type = 'text';
  el.value = val || '';
  el.placeholder = placeholder || '';
  el.style.cssText = 'flex:1;min-width:0;background:rgba(255,255,255,0.08);border:1px solid rgba(0,255,255,0.35);border-radius:8px;color:#eef;padding:3px 8px;font-size:12px;outline:none;user-select:text;';
  el._mmNoClose = true;
  el.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
  el.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Enter') el.blur(); });
  el.addEventListener('blur', function () { onCommit(el.value.trim()); });
  return el;
}

// ── 主干线段右键菜单（与 Fishbone/context-menu.js 同款布局）──
function showSegMenu(inst, fh, cx, cy) {
  const menu = _baseMenu(inst, 'node');
  const trunk = fh.trunk;
  const segIndex = fh.segIndex;
  const sg = (trunk.segs || [])[segIndex];
  if (!sg) return;

  // 标题
  const title = document.createElement('div');
  title.textContent = '🐟 鱼骨线段（第 ' + (segIndex + 1) + ' 段）';
  title.style.cssText = 'font-weight:bold;color:#0ff;font-size:14px;border-bottom:1px solid rgba(0,255,255,0.35);padding-bottom:6px;margin-bottom:4px;';
  title._mmNoClose = true;
  menu.appendChild(title);

  // 标签输入（回车/失焦保存，不关菜单）
  _menuRow(menu, [_ctlLabel('标签'),
    _ctlText(sg.label || '', '连线标签', function (v) {
      if (v) { sg.label = v; sg.labelHidden = false; } else delete sg.label;
      _markChanged(inst);
    })]);

  // 颜色 + 默认
  _menuRow(menu, [_ctlLabel('颜色'),
    _ctlColor(sg.customColor, function (v) { sg.customColor = v; }, function (v) { sg.customColor = v; _markChanged(inst); }),
    _ctlBtn('默认', function () { delete sg.customColor; _markChanged(inst); })]);

  // 添加分支 / 新建节点（2D 画布交互模式）
  const rowAdd = _menuRow(menu, []);
  _menuBtnInto(inst, rowAdd, '🌿 添加分支', '#2c7a6e', function () {
    inst.mode = 'drawSeg'; inst.branchFrom = true;
    inst.segStart = null; inst.branchHit = null;
    setHint(inst, '🌿 分支绘制：在线段上按下选起点，拖到空白处松手，可连续绘制；右键或 Esc 退出');
  });
  _menuBtnInto(inst, rowAdd, '🟢 新建节点', '#2c5a3a', function () {
    inst.mode = 'nodeCreate';
    inst.segStart = null; inst.branchHit = null;
    setHint(inst, '🟢 节点创建：在线段上按下选起点，拖到空白处松手（松手点 = 新节点左边缘中点）；右键或 Esc 取消');
  });

  // 折叠/展开支路（有子支时显示）
  const hasChildren = inst.data.trunks.some(function (t2) { return t2.parentId === trunk.id; });
  if (hasChildren) {
    _menuItem(inst, menu, trunk.collapsed ? '📂 展开支路' : '📁 折叠支路', function () {
      _fbToggleCollapse(inst, trunk);
    }, 'rgba(44,110,126,0.35)');
  }

  // 变成主干路（有父时）/ 变成支路
  const rowTree = _menuRow(menu, []);
  if (trunk.parentId) {
    _menuBtnInto(inst, rowTree, '变成主干路', '#5a4a2c', function () {
      delete trunk.parentId; trunk.detached = true;
      setHint(inst, '已变为主干路');
      _markChanged(inst);
    });
  }
  _menuBtnInto(inst, rowTree, '变成支路', '#4a2c5a', function () {
    inst.mode = 'attach'; inst.attachSrc = trunk.id;
    setHint(inst, '请点击目标鱼骨线段完成挂载（Esc / 右键取消）');
  });

  // 复制鱼骨图 / 移动线路（2D 直接拖线体）
  const rowOps = _menuRow(menu, []);
  _menuBtnInto(inst, rowOps, '复制鱼骨图', '#2c5a7e', function () { _fbDuplicateTree(inst, trunk); });
  _menuBtnInto(inst, rowOps, '✥ 移动线路', '#7e5a2c', function () {
    setHint(inst, '2D 可直接按住线体拖动移动线路');
  });

  _menuSep(menu, '━━ 删除 ━━');
  // 删除此连线（2D 同语义：首删/尾删/中段分裂/仅段删整条）
  const rowDel = _menuRow(menu, []);
  _menuBtnInto(inst, rowDel, '🗑️ 删除此连线', '#6a3c3c', function () {
    _fbDeleteSeg(inst, trunk, segIndex);
  }, 'width:100%;');
  // 删除整张鱼骨图（确认后：子树干线 + 末端节点及其后代）
  const rowTree2 = _menuRow(menu, []);
  _menuBtnInto(inst, rowTree2, '🗑️ 删除整张鱼骨图', '#6a2c2c', function () {
    _fbDeleteTree(inst, trunk);
  }, 'width:100%;');

  _placeMenu(inst, menu, cx, cy);
}

// ── 群组右键菜单（与 2D #groupContextMenu 同款控件）──
function showGroupMenu(inst, g, sx, sy) {
  const menu = _baseMenu(inst, 'node');
  _menuTitle(inst, menu, '⬆ 群组设置', null);

  // 群组名称（回车/失焦保存）
  _menuRow(menu, [_ctlLabel('群组名称'),
    _ctlText(g.name || '', '输入群组名称', function (v) { g.name = v; _markChanged(inst); })]);

  // 填充颜色
  _menuRow(menu, [_ctlLabel('填充颜色'),
    _ctlColor(g.fillColor || '#4a3c7e',
      function (v) { g.fillColor = v; },
      function (v) { g.fillColor = v; _markChanged(inst); })]);

  // 边框颜色
  _menuRow(menu, [_ctlLabel('边框颜色'),
    _ctlColor(g.borderColor || '#7a6aae',
      function (v) { g.borderColor = v; },
      function (v) { g.borderColor = v; _markChanged(inst); })]);

  // 边框粗细（0.5–4，实时数值）
  const lwVal = document.createElement('span');
  lwVal.textContent = (g.lineWidth !== undefined ? g.lineWidth : 1.5).toFixed(1);
  lwVal._mmNoClose = true;
  lwVal.style.cssText = 'color:#aac;min-width:26px;text-align:right;';
  _menuRow(menu, [_ctlLabel('边框粗细'),
    _ctlSlider(0.5, 4, 0.5, g.lineWidth !== undefined ? g.lineWidth : 1.5,
      function (v) { g.lineWidth = v; lwVal.textContent = v.toFixed(1); },
      function (v) { g.lineWidth = v; lwVal.textContent = v.toFixed(1); _markChanged(inst); }),
    lwVal]);

  // 边框样式（实线/虚线/点线）
  _menuRow(menu, [_ctlLabel('边框样式'),
    _ctlSelect(g.lineStyle || 'dashed', [
      { v: 'solid', t: '实线' }, { v: 'dashed', t: '虚线' }, { v: 'dotted', t: '点线' }
    ], function (v) { g.lineStyle = v; _markChanged(inst); })]);

  // 圆角（直角/小/中/大）
  _menuRow(menu, [_ctlLabel('圆角'),
    _ctlSelect(String(g.borderRadius || 0), [
      { v: '0', t: '直角' }, { v: '8', t: '小圆角' }, { v: '16', t: '中圆角' }, { v: '30', t: '大圆角' }
    ], function (v) { g.borderRadius = parseFloat(v); _markChanged(inst); })]);

  _menuSep(menu, '━━ 操作 ━━');
  // 删除群组（被绑定节点保留，与 2D deleteGroupRectBtn 一致）
  _menuBtn(inst, menu, '🗑️ 删除群组', '#6a2c2c', function () { _deleteGroup(inst, g); }, 'width:100%;');

  _placeMenu(inst, menu, sx, sy);
}

// ── 空白右键菜单（与 2D 空白菜单同款：新建根/步骤根/绘制主干线段/自动排列）──
function showBlankMenu(inst, wx, wy, sx, sy) {
  const menu = _baseMenu(inst, 'blank');
  _menuItem(inst, menu, '＋ 新建根节点', function () { addRoot(inst, 'text', wx, wy); }, 'rgba(44,122,110,0.35)');
  _menuItem(inst, menu, '⬆ 新建步骤根节点', function () { addRoot(inst, 'step', wx, wy); }, 'rgba(106,60,122,0.35)');
  _menuItem(inst, menu, '🐟 绘制主干线段', function () {
    inst.mode = 'drawSeg'; setHint(inst, '拖动画线，松手后可连续续画（Esc / 右键退出）');
  }, 'rgba(163,102,45,0.35)');
  _menuItem(inst, menu, '⬚ 新建群组', function () {
    inst.mode = 'groupCreate'; setHint(inst, '框选新建群组：按住左键拖出矩形，松手创建（Esc 取消）');
  }, 'rgba(90,70,140,0.35)');
  _menuItem(inst, menu, '⛶ 自动排列', function () {
    // 等价 2D autoArrangeTreeLayout：每棵树以各自根节点为锚点整体重排
    inst.data.roots.forEach(function (r) { arrangeTree(inst, r); });
    _markChanged(inst);
  }, 'rgba(60,90,120,0.35)');

  _menuSep(menu, '━━ 背景 / 格子 ━━');
  // 背景颜色（默认=所在编辑区底色，未设置 data.bg 时自动跟随）
  _menuRow(menu, [
    _ctlLabel('背景颜色'),
    _ctlColor(inst.data.bg || inst.defBg,
      function (v) { inst.data.bg = v; },
      function (v) { inst.data.bg = v; _markChanged(inst); }),
    _ctlBtn('默认', function () { delete inst.data.bg; _markChanged(inst); })
  ]);
  // 格子颜色（默认与 2D 视图网格一致）
  _menuRow(menu, [
    _ctlLabel('格子颜色'),
    _ctlColor(inst.data.gridColor || MM_GRID,
      function (v) { inst.data.gridColor = v; },
      function (v) { inst.data.gridColor = v; _markChanged(inst); }),
    _ctlBtn('默认', function () { delete inst.data.gridColor; _markChanged(inst); })
  ]);
  // 格子显示/隐藏
  _menuItem(inst, menu, inst.data.gridVisible === false ? '▢ 显示格子' : '▦ 隐藏格子', function () {
    inst.data.gridVisible = (inst.data.gridVisible === false);
    _markChanged(inst);
  }, 'rgba(60,90,120,0.35)');

  _placeMenu(inst, menu, sx, sy);
}

export { hideMenu, showNodeMenu, showSegMenu, showGroupMenu, showBlankMenu };
