// ============================================================
//  版本树 SVG 渲染器（从左到右的树形布局，参考 2DView Layout.js）
//  布局算法：
//    1. 从 commits 构建 parent → children 映射，形成森林
//    2. 递归布局：先布局子节点，父节点垂直居中于子节点群
//    3. 子节点在父节点右侧，垂直分布，用贝塞尔曲线连接
//    4. 当前 HEAD 站点带脉冲动画
// ============================================================

import { listCommits, listBranches, getGraph, getHeadCommit } from './versionGraph.js';

// ── 布局常量 ──
const H_GAP = 130;              // 父子节点水平间距（深度方向）
const V_GAP = 56;               // 兄弟节点垂直间距
const LEFT_PAD = 60;            // 左边距
const TOP_PAD = 60;             // 顶边距
const BOTTOM_PAD = 40;          // 底边距
const STATION_R = 9;            // 站点半径
const STATION_R_HEAD = 11;      // HEAD 站点半径

/**
 * 从 commits 构建 parent → children 映射，并找出所有根 commit（无 parent）
 * @param {Array} commits
 * @returns {{ childrenMap:Map<string,string[]>, roots:string[] }}
 */
function buildTree(commits) {
  const childrenMap = new Map();
  const hasParent = new Set();
  commits.forEach(c => {
    if (c.parent) {
      if (!childrenMap.has(c.parent)) childrenMap.set(c.parent, []);
      childrenMap.get(c.parent).push(c.id);
      hasParent.add(c.id);
    }
  });
  const roots = commits.filter(c => !hasParent.has(c.id)).map(c => c.id);
  return { childrenMap, roots };
}

/**
 * 递归布局子树（参考 2DView layoutTraditionalTree）
 * @param {string} commitId
 * @param {Map} commitMap - id → commit
 * @param {Map} childrenMap - parent → [childIds]
 * @returns {{commitId, width, height, parentYOffset, children:Array}}
 */
function layoutSubtree(commitId, commitMap, childrenMap) {
  const children = childrenMap.get(commitId) || [];
  const childLayouts = children.map(cid => layoutSubtree(cid, commitMap, childrenMap));

  // 计算子树总高度和最大宽度
  let totalHeight = 0;
  let maxWidth = 0;
  childLayouts.forEach((cl, i) => {
    totalHeight += cl.height;
    if (i > 0) totalHeight += V_GAP;
    maxWidth = Math.max(maxWidth, cl.width);
  });

  const nodeSize = STATION_R * 2;
  // 父节点垂直居中偏移
  const parentYOffset = childLayouts.length > 0
    ? Math.max(0, (totalHeight - nodeSize) / 2)
    : 0;

  const subtreeWidth = childLayouts.length > 0 ? H_GAP + maxWidth : nodeSize;
  const subtreeHeight = Math.max(nodeSize, totalHeight);

  return {
    commitId,
    width: subtreeWidth,
    height: subtreeHeight,
    parentYOffset,
    children: childLayouts
  };
}

/**
 * 分配绝对坐标（参考 2DView assignTraditionalCoordinates）
 * @param {Object} layout - layoutSubtree 的返回值
 * @param {number} x - 当前子树左上角 x
 * @param {number} y - 当前子树左上角 y
 * @param {Map} positions - 写入 commitId → {x, y}
 */
function assignCoords(layout, x, y, positions) {
  const nodeSize = STATION_R * 2;
  // 父节点位置：在子树区域左侧，垂直居中
  const nodeX = x;
  const nodeY = y + layout.parentYOffset;
  positions.set(layout.commitId, { x: nodeX, y: nodeY });

  // 子节点在父节点右侧，垂直排列
  let childY = y;
  layout.children.forEach((cl, i) => {
    if (i > 0) childY += V_GAP;
    assignCoords(cl, x + H_GAP, childY, positions);
    childY += cl.height;
  });
}

/**
 * 计算每个 commit 的 (x, y) 坐标
 * 支持多个根（森林）：多个根垂直排列
 * @param {Object} graph - 版本图
 * @returns {{positions:Map<id,{x,y}>, width:number, height:number}}
 */
function layoutGraph(graph) {
  if (!graph || !graph.commits || graph.commits.length === 0) {
    return { positions: new Map(), width: 600, height: 200 };
  }

  const commitMap = new Map();
  graph.commits.forEach(c => commitMap.set(c.id, c));
  const { childrenMap, roots } = buildTree(graph.commits);

  if (roots.length === 0) {
    return { positions: new Map(), width: 600, height: 200 };
  }

  // 多个根按时间排序，作为虚拟森林
  roots.sort((a, b) => (commitMap.get(a).time || 0) - (commitMap.get(b).time || 0));
  const rootLayouts = roots.map(rid => layoutSubtree(rid, commitMap, childrenMap));

  // 森林总高度
  let forestHeight = 0;
  let forestMaxWidth = 0;
  rootLayouts.forEach((rl, i) => {
    forestHeight += rl.height;
    if (i > 0) forestHeight += V_GAP;
    forestMaxWidth = Math.max(forestMaxWidth, rl.width);
  });

  const positions = new Map();
  let curY = TOP_PAD;
  rootLayouts.forEach((rl, i) => {
    if (i > 0) curY += V_GAP;
    assignCoords(rl, LEFT_PAD, curY, positions);
    curY += rl.height;
  });

  // 计算总宽高
  let maxX = LEFT_PAD;
  let maxY = TOP_PAD;
  positions.forEach(p => {
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  });
  const width = Math.max(600, maxX + STATION_R + 60);
  const height = Math.max(200, maxY + STATION_R + BOTTOM_PAD);

  return { positions, width, height };
}

/**
 * 格式化时间为简短字符串
 */
function fmtTime(t) {
  if (!t) return '';
  const d = new Date(t);
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  const h = d.getHours().toString().padStart(2, '0');
  const min = d.getMinutes().toString().padStart(2, '0');
  return m + '/' + day + ' ' + h + ':' + min;
}

/**
 * 转义 HTML
 */
function esc(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * 渲染版本图为 SVG 字符串
 * @param {Object} graph - 版本图
 * @param {Object} options - { onCheckout: fn(commitId), headCommitId: string }
 * @returns {{svg:string, width:number, height:number}}
 */
export function renderVersionMap(graph, options = {}) {
  if (!graph || !graph.commits || graph.commits.length === 0) {
    return {
      svg: `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-secondary);font-size:13px;flex-direction:column;gap:8px;">
        <div style="font-size:32px;opacity:0.4;">🕐</div>
        <div>暂无版本记录</div>
        <div style="font-size:11px;opacity:0.7;">保存项目时会自动产生版本站点</div>
      </div>`,
      width: 600, height: 200
    };
  }

  const { positions, width, height } = layoutGraph(graph);
  const headCommit = getHeadCommit(graph);
  const headCommitId = headCommit ? headCommit.id : null;

  // ── 计算"当前 HEAD → 根"路径上的 commit 集合（用于高亮绿色）──
  const pathCommitIds = new Set();
  let cur = headCommit;
  while (cur) {
    pathCommitIds.add(cur.id);
    cur = cur.parent ? graph.commits.find(c => c.id === cur.parent) : null;
  }

  // ── 颜色定义 ──
  const COLOR_DEFAULT = '#5ee8ff';  // 默认蓝色（非路径上的站点/连线）
  const COLOR_PATH = '#a8e063';     // 绿色（当前站点 + 路径上的连线）
  const COLOR_PAST = '#ff7a3d';     // 橙红色（HEAD 之前的路径站点）

  let svgParts = [];

  // ── 1. 绘制连接线（每个 commit 到其 parent 的贝塞尔曲线）──
  //     当前 HEAD 到根路径上的连线显示橙红（已经过路程），其余显示蓝色
  graph.commits.forEach(c => {
    if (!c.parent) return; // 根节点无连接线
    const p1 = positions.get(c.parent);
    const p2 = positions.get(c.id);
    if (!p1 || !p2) return;
    // 连线着色规则：当前 commit 在路径上 且 其 parent 也在路径上 → 橙红（已经过）
    const onPath = pathCommitIds.has(c.id) && pathCommitIds.has(c.parent);
    const color = onPath ? COLOR_PAST : COLOR_DEFAULT;
    const strokeWidth = onPath ? 3.5 : 2.5;
    const opacity = onPath ? 0.9 : 0.6;
    // 贝塞尔曲线：从父节点右侧出发，到子节点左侧
    const midX = (p1.x + p2.x) / 2;
    svgParts.push(`<path d="M ${p1.x} ${p1.y} C ${midX} ${p1.y}, ${midX} ${p2.y}, ${p2.x} ${p2.y}" stroke="${color}" stroke-width="${strokeWidth}" fill="none" opacity="${opacity}" stroke-linecap="round"/>`);
  });

  // ── 2. 绘制站点（commits）──
  graph.commits.forEach(c => {
    const p = positions.get(c.id);
    if (!p) return;
    const isHead = c.id === headCommitId;
    const onPath = pathCommitIds.has(c.id);
    const r = isHead ? STATION_R_HEAD : STATION_R;
    // 站点着色：当前站点绿色 / 之前的路径站点橙红色 / 非路径站点默认蓝色
    const color = isHead ? COLOR_PATH : (onPath ? COLOR_PAST : COLOR_DEFAULT);
    // 标签颜色与加粗：当前站点绿色加粗 / 路径站点橙红加粗 / 非路径站点浅蓝常规
    const labelColor = isHead ? COLOR_PATH : (onPath ? COLOR_PAST : '#aef0ff');
    const fontWeight = isHead ? 'bold' : (onPath ? 'bold' : 'normal');

    // 站点圆（可点击）
    svgParts.push(`<circle cx="${p.x}" cy="${p.y}" r="${r + 8}" fill="transparent" data-commit-id="${esc(c.id)}" style="cursor:pointer;" class="vm-station-hit"/>`);
    svgParts.push(`<circle cx="${p.x}" cy="${p.y}" r="${r}" fill="#0f1e26" stroke="${color}" stroke-width="2.5" data-commit-id="${esc(c.id)}" style="cursor:pointer;" class="vm-station"/>`);
    // 当前线路（HEAD 路径）所有站点都有实心圆填充
    if (onPath) {
      if (isHead) {
        // 当前站点：实心圆闪烁 + 外圈脉冲
        svgParts.push(`<circle cx="${p.x}" cy="${p.y}" r="${r - 4}" fill="${color}">
          <animate attributeName="opacity" values="1;0.2;1" dur="1.2s" repeatCount="indefinite"/>
        </circle>`);
        svgParts.push(`<circle cx="${p.x}" cy="${p.y}" r="${r + 4}" fill="none" stroke="${color}" stroke-width="1.5" stroke-dasharray="3 2" opacity="0.6">
          <animate attributeName="r" values="${r + 4};${r + 9};${r + 4}" dur="2s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0.6;0.2;0.6" dur="2s" repeatCount="indefinite"/>
        </circle>`);
      } else {
        // 过去站点：静态实心圆（不闪烁）
        svgParts.push(`<circle cx="${p.x}" cy="${p.y}" r="${r - 4}" fill="${color}"/>`);
      }
    }

    // 站点名称（用户自定义标签）—— 站点上方，默认不显示
    // 仅当 label 非空且不是旧版自动生成的时间格式（如 "06/28 14:30"）时才渲染
    const TIME_LABEL_RE = /^\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}$/;
    const displayName = (c.label && c.label.trim() && !TIME_LABEL_RE.test(c.label.trim())) ? c.label.trim() : '';
    if (displayName) {
      const nameY = p.y - r - 8;
      svgParts.push(`<text x="${p.x}" y="${nameY}" text-anchor="middle" fill="${labelColor}" font-size="11" font-weight="bold">${esc(displayName)}</text>`);
    }

    // 站点下方：第一行年份（小字体），第二行日期+时间（大字体加粗）
    const labelY = p.y + r + 14;
    const yearStr = c.time ? String(new Date(c.time).getFullYear()) : '';
    // 第一行：年份（小字体灰色）
    if (yearStr) {
      svgParts.push(`<text x="${p.x}" y="${labelY}" text-anchor="middle" fill="#6f8fa0" font-size="9">${esc(yearStr)}</text>`);
    }
    // 第二行：日期+时间（大字体加粗，颜色随站点状态）
    svgParts.push(`<text x="${p.x}" y="${labelY + 14}" text-anchor="middle" fill="${labelColor}" font-size="11" font-weight="${fontWeight}">${fmtTime(c.time)}</text>`);

    // diff 摘要（小图标 + 数字）
    const diff = c.diff || { added: [], removed: [], changed: [] };
    const totalChanges = diff.added.length + diff.removed.length + diff.changed.length;
    if (totalChanges > 0) {
      const summaryY = labelY + 28;
      let parts = [];
      if (diff.added.length) parts.push(`<tspan fill="#5ee8ff">+${diff.added.length}</tspan>`);
      if (diff.removed.length) parts.push(`<tspan fill="#ff6b6b">-${diff.removed.length}</tspan>`);
      if (diff.changed.length) parts.push(`<tspan fill="#ffd166">~${diff.changed.length}</tspan>`);
      svgParts.push(`<text x="${p.x}" y="${summaryY}" text-anchor="middle" font-size="9">${parts.join(' ')}</text>`);
    }
  });

  const svg = `<svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMin meet" style="display:block;">${svgParts.join('')}</svg>`;
  return { svg, width, height };
}

/**
 * 渲染版本图到指定容器
 * @param {HTMLElement} container - SVG 容器
 * @param {Object} graph - 版本图
 * @param {Object} callbacks - { onCheckoutCommit: fn(commitId), onRenameCommit: fn(commitId, newName) }
 */
export function renderVersionMapInto(container, graph, callbacks = {}) {
  if (!container) return;
  const { svg } = renderVersionMap(graph);
  container.innerHTML = svg;
  // 绑定站点事件：左键 checkout，右键弹重命名菜单
  container.querySelectorAll('[data-commit-id]').forEach(el => {
    const cid = el.getAttribute('data-commit-id');
    if (!cid) return;
    // 左键：checkout
    if (callbacks.onCheckoutCommit) {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        callbacks.onCheckoutCommit(cid);
      });
    }
    // 右键：弹重命名菜单
    if (callbacks.onRenameCommit) {
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showRenameMenu(e, cid, graph, callbacks.onRenameCommit);
      });
    }
  });
}

/**
 * 显示右键重命名菜单
 */
function showRenameMenu(e, commitId, graph, onRename) {
  // 移除已有菜单
  const existing = document.getElementById('vm-rename-menu');
  if (existing) existing.remove();
  const commit = graph.commits.find(c => c.id === commitId);
  if (!commit) return;
  const menu = document.createElement('div');
  menu.id = 'vm-rename-menu';
  menu.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;background:#1a2c38;border:1px solid #2d4a5e;border-radius:6px;padding:4px;z-index:100000;box-shadow:0 4px 16px rgba(0,0,0,0.5);font-size:12px;min-width:120px;`;
  const renameItem = document.createElement('div');
  renameItem.textContent = '重命名站点';
  renameItem.style.cssText = `padding:8px 14px;cursor:pointer;color:#aef0ff;border-radius:4px;`;
  renameItem.onmouseenter = () => renameItem.style.background = '#2d4a5e';
  renameItem.onmouseleave = () => renameItem.style.background = 'transparent';
  renameItem.onclick = () => {
    menu.remove();
    // 使用应用内自定义 prompt（Electron 不支持原生 prompt）
    if (typeof window !== 'undefined' && window._showPrompt) {
      window._showPrompt('输入站点名称：', commit.label || '', (newName) => {
        onRename(commitId, (newName || '').trim());
      });
    } else {
      // 降级：用 inline 输入框
      const name = window.prompt ? window.prompt('输入站点名称：', commit.label || '') : null;
      if (name !== null) onRename(commitId, name.trim());
    }
  };
  menu.appendChild(renameItem);
  document.body.appendChild(menu);
  // 点击其他地方关闭菜单
  setTimeout(() => {
    const closeHandler = (ev) => {
      if (!menu.contains(ev.target)) {
        menu.remove();
        document.removeEventListener('mousedown', closeHandler);
      }
    };
    document.addEventListener('mousedown', closeHandler);
  }, 0);
}
