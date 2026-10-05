// ============================================================
//  core/mindmap-embed — 编辑器内嵌脑图块（v3 全面对齐 2D 视图）
//  - 视觉还原（对齐 2DView/render/* 与 Fishbone/render2d.js）：
//    · 节点：120×40 基准、内边距 24、圆角 8×scale、字体 max(10,14×scale)、
//      默认边框 #aaddff（极简模式默认色）、选中金底描边原色无投影
//    · 步骤节点：默认跑道形（shape 留空=自动）、连线虚线 [8,3,2,3]
//    · 父子连线：折线（普通右出左入 PEG_X=24 / 步骤下出上入 PEG_Y=20）+ 箭头
//    · 自由连线：下出上入、虚线 [6,4] + 箭头（长 12 / 回退 4 / 半角 π/7）
//    · 主干线段：双平行线（间距 2.2 屏幕像素）+ 静态亮蓝 #3399ff + 接缝圆点 #ffd88a
//    · 悬停快速创建按钮：右中＋（青/文本子）、下中＋（紫/步骤子），半径 4/命中 8
//    · 全局连线默认色：静态亮蓝 #3399ff（不呼吸）、网格线宽 0.5
//  - 排列避让（移植 2DView/Layout.js + auto-layout.js）：新建子节点/挂载/复制后
//    自动重排整棵子树（根节点锚定不动）；空白菜单含「自动排列」全量重排
//  - 数据模型：{ roots:[{id,text,x,y,type,sizeScale,shape,fixedColor,collapsed,children}], edges:[{a,b}], segs:[{x1,y1,x2,y2}] }
//    兼容旧格式 { root: {...} }
//  - 节点右键菜单：节点大小/固定颜色/2D节点图形/恢复默认/新建子节点/
//    新建下一步节点/变成根·子节点/折叠展开/添加·删除连线/复制/删除
//    （3D 专属项——光环速度/3D形状/定位3D/显示文本/网页节点/打开文件位置——不适用内嵌脑图，未纳入）
//  - 空白右键菜单：新建根节点/新建步骤根节点/绘制主干线段/新建群组（框选）/自动排列/
//    背景颜色（默认=所在编辑区底色）/格子颜色/格子显示隐藏
//  - 群组（与 2DView groupRects 同构）：框选创建（中心点在框内的可见节点自动绑定），
//    拖框体=框+绑定节点整体移动，四角把手缩放；右键菜单与 2D #groupContextMenu 同款
//    （名称/填充色/边框色/粗细/样式/圆角/删除群组，删群组节点保留）；节点删除自动解绑
//  - 数据以 JSON 存于 div[data-mindmap]，随正文 HTML 保存
//    外观字段：bg（背景色，缺省=编辑区底色）/gridColor（格子色，缺省 MM_GRID）/gridVisible（缺省 true）
// ------------------------------------------------------------
//  拆分后的文件夹结构（本文件为主入口，对外导出不变）：
//    share.js    常量与共享工具（MM_*、几何、_resize/_unmount/toWorld/toScreen/setHint）
//    data.js     数据读写/遍历 + 鱼骨数据查询（_parseData/_writeData/_fbHidden 等）
//    layout.js   排列避让布局（移植 2DView/Layout.js）
//    draw.js     绘制原语 + 主渲染循环 render
//    ops.js      群组 + 节点编辑操作（addChild/removeNode/arrangeTree 等）
//    fishbone.js 鱼骨写操作（折叠/删除/复制/挂载/新建节点）
//    menus.js    菜单框架 + 节点/线段/群组/空白右键菜单
//    hit.js      命中检测（hitTest/hitSeg/hitEdge 等）
//    events.js   交互事件绑定 bindEvents
//    index.js    挂载 _mount + 对外导出（本文件）
// ============================================================

import { _mounted, _instances, _editorAreaBg, _resize, _unmount, MM_STAGE_H } from './share.js';
import { _parseData } from './data.js';
import { _markChanged } from './ops.js';
import { render } from './draw.js';
import { bindEvents } from './events.js';

// ============================================================
//  实例挂载：canvas 渲染 + 交互
// ============================================================
function _mount(div, opts) {
  if (_mounted.has(div)) return;
  _mounted.add(div);
  opts = opts || {};
  const interactive = !!opts.interactive;
  const editor = opts.editor || null;

  div.classList.add('mindmap-embed-active');
  const defBg = _editorAreaBg(div);   // 默认背景=所在编辑区底色（浅/深色模式自动适配）
  // 框高：优先用持久化的 data.stageH（下边缘拖拽调整），非法值回落默认
  // （此处 inst 尚未创建，直接读 dataset）
  let _persistH = MM_STAGE_H;
  try {
    const _d0 = JSON.parse(div.dataset.mindmap || '{}');
    if (typeof _d0.stageH === 'number' && _d0.stageH >= 180 && _d0.stageH <= 1200) _persistH = _d0.stageH;
  } catch (e) {}
  div.style.cssText = 'position:relative;display:block;width:100%;height:' + _persistH + 'px;margin:8px 0;border:1px solid #2c6e7e;border-radius:8px;overflow:hidden;background:' + defBg + ';user-select:none;-webkit-user-select:none;';

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;display:block;' + (interactive ? 'cursor:default;outline:none;' : 'pointer-events:none;');
  if (interactive) canvas.tabIndex = 0;
  div.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // 下边缘拖拽调高把手（改 div 高度，ResizeObserver 自动同步 canvas；数据 stageH 持久化）
  if (interactive) {
    const handle = div.ownerDocument.createElement('div');
    handle.style.cssText = 'position:absolute;left:0;right:0;bottom:0;height:10px;cursor:ns-resize;z-index:6;';
    handle.title = '拖拽调整脑图高度';
    handle.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      e.stopPropagation();
      const startY = e.clientY;
      const startH = div.clientHeight;
      handle.setPointerCapture(e.pointerId);
      const move = function (ev) {
        ev.preventDefault();
        const h = Math.max(180, Math.min(1200, Math.round(startH + (ev.clientY - startY))));
        inst.data.stageH = h;
        div.style.height = h + 'px';
      };
      const up = function () {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        handle.removeEventListener('pointercancel', up);
        _markChanged(inst);
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', up);
    });
    div.appendChild(handle);
  }

  const inst = {
    div, canvas, ctx, editor, interactive,
    data: _parseData(div),
    defBg,               // 默认背景色（= 编辑区底色；data.bg 未设置时生效）
    view: { x: 0, y: 0, scale: 1 },
    selectedId: null,
    selectedSeg: null,   // 选中的主干线段 { trunkId, segIndex }（与 2D 鱼骨 selectedSeg 一致）
    selectedGroupId: null,   // 选中的群组 id（与 2D selectedGroupRectId 一致）
    _groupBox: null,     // 群组框选拖拽预览 { startW, curW, moved }
    mode: null,          // null | 'addEdge' | 'delEdge' | 'attachParent' | 'drawSeg' | 'nodeCreate' | 'attach'
    modeFrom: null,      // addEdge/attachParent 的起始节点
    segStart: null,      // 绘制模式起点预览
    branchFrom: false,   // 分支绘制模式（线段菜单「添加分支」）：起点必须落在线上
    branchHit: null,     // 分支/节点创建的线上吸附起点 { trunkId, segIndex, t, point }
    attachSrc: null,     // 「变成支路」待挂载干线 id
    _curTrunk: null,     // 主干绘制会话的当前干线（一次会话一条）
    _fbAnims: new Map(), // 鱼骨折叠/展开动画 id → { t0, dir, progress }
    hint: '',
    visible: true,
    destroyed: false,
  };
  _instances.push(inst);

  requestAnimationFrame(function () { _resize(inst); });

  inst._raf = requestAnimationFrame(function (ts) { render(inst, ts); });

  if (typeof IntersectionObserver !== 'undefined') {
    inst._io = new IntersectionObserver(function (entries) {
      inst.visible = entries[0] ? entries[0].isIntersecting : true;
    }, { root: null, threshold: 0.02 });
    inst._io.observe(div);
  }

  if (interactive) bindEvents(inst);

  if (typeof ResizeObserver !== 'undefined') {
    inst._ro = new ResizeObserver(function () { _resize(inst); });
    inst._ro.observe(div);
  }

  return inst;
}

// ============================================================
//  编辑态：扫描激活 TinyMCE body 中的脑图块（幂等，重复调用安全）
// ============================================================
export function activateMindmapEmbeds(editor) {
  if (!editor || (typeof editor.isDestroyed === 'function' && editor.isDestroyed())) return;
  const body = editor.getBody();
  if (!body) return;
  // 清理失效实例：undo/重做会重建 DOM，旧 div 已不在 body 中
  for (let i = _instances.length - 1; i >= 0; i--) {
    const it = _instances[i];
    if (it.editor && !body.contains(it.div)) _unmount(it);
  }
  body.querySelectorAll('div.mindmap-embed').forEach(function (div) {
    if (!div.dataset.mindmap && !div.innerHTML.trim()) {
      div.dataset.mindmap = JSON.stringify({ roots: [{ id: 'n1', text: '中心主题', x: 0, y: 0, seed: Math.random(), children: [] }] });
    }
    div.setAttribute('contenteditable', 'false');
    _mount(div, { interactive: true, editor });
  });
}

// ============================================================
//  只读态：容器内静态渲染（卡片正文 overlay 等）
// ============================================================
export function renderReadonlyMindmaps(container) {
  if (!container) return;
  container.querySelectorAll('div.mindmap-embed').forEach(function (div) {
    if (!div.dataset.mindmap) return;
    _mount(div, { interactive: false });
  });
}

// ============================================================
//  插入脑图块（插入工具栏按钮入口）
// ============================================================
export function insertMindmapBlock(editor) {
  if (!editor) return;
  const data = { roots: [{ id: 'n1', text: '中心主题', x: 0, y: 0, seed: Math.random(), children: [] }] };
  editor.insertContent('<div class="mindmap-embed" contenteditable="false" data-mindmap="' + JSON.stringify(data).replace(/"/g, '&quot;') + '"><p style="text-align:center;color:#5a8a9a;">🧠 脑图加载中…</p></div>');
  setTimeout(function () { activateMindmapEmbeds(editor); }, 50);
}

// ============================================================
//  编辑器事件接线（在 registerInsertTab 中调用一次）
// ============================================================
export function installMindmapEmbedSupport(editor) {
  if (!editor) return;
  const scan = function () { setTimeout(function () { activateMindmapEmbeds(editor); }, 80); };
  editor.on('init', function () { setTimeout(function () { activateMindmapEmbeds(editor); }, 200); });
  editor.on('SetContent', scan);
  editor.on('undo', scan);
  editor.on('redo', scan);
}
