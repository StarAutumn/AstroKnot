// ============================================================
//  Fishbone / context-menu.js — 鱼骨线段右键菜单
//  布局与节点右键菜单一致（panel 容器 + .menu-row 行 + 圆角按钮），
//  动态创建单例面板（不改 index.html，平板同步链零改动）。
//  功能 = 原连线标签面板全部能力 + 鱼骨图操作：
//  标签编辑 / 颜色 / 保存 / 添加分支 / 新建节点 / 删除此连线
//  折叠展开支路 / 变成主干路 / 变成支路 / 2-3D 定位 / 复制 / 删除整图
// ============================================================

import { appState } from '../module0_AppState.js';
import { showToast } from '../SelectAndEdit/index.js';
import {
  saveFishboneSegLabel, setFishboneSegColor, deleteFishboneSegmentWithHistory,
  toggleFishboneCollapseWithHistory, promoteFishboneTrunkWithHistory,
  startFishboneAttach, startFishboneMove, locateFishboneTree,
  duplicateFishboneTreeWithHistory, deleteFishboneTree
} from './ops.js';
import { highlightFishboneSeg, clearFishboneSegHighlight } from './render3d.js';

// ── 单例面板（模块加载即挂到 body）──
const menu = document.createElement('div');
menu.id = 'fishboneContextMenu';
menu.style.cssText = `
  position:absolute;background:var(--panel-bg);backdrop-filter:blur(16px);
  border:1px solid var(--panel-border);border-radius:var(--panel-radius);
  padding:8px;z-index:4000;display:none;flex-direction:column;gap:4px;
  min-width:220px;box-shadow:var(--panel-shadow);color:var(--text-primary);
  font-family:system-ui,sans-serif;font-size:13px;
`;
document.body.appendChild(menu);

menu.innerHTML = `
  <div class="panel-accent-line" style="margin-bottom:4px;"></div>
  <div id="fbCtxTitle" style="font-size:12px;color:var(--text-secondary);margin-bottom:2px;">🐟 鱼骨线段</div>
  <div class="menu-row">
    <label style="min-width:56px;">🏷️ 标签</label>
    <input type="text" id="fbCtxLabelInput" placeholder="点击添加标签" spellcheck="false"
      style="flex:1;min-width:0;background:rgba(255,255,255,0.08);border:1px solid var(--panel-border);border-radius:8px;color:var(--text-primary);padding:3px 8px;font-size:12px;outline:none;">
  </div>
  <div class="menu-row">
    <label style="min-width:56px;">🎨 颜色</label>
    <input type="color" id="fbCtxColorInput" style="width:36px;height:26px;border:1px solid var(--panel-border);border-radius:8px;background:transparent;cursor:pointer;padding:0;">
    <button id="fbCtxColorResetBtn" style="background:rgba(44,122,110,0.6);">默认</button>
  </div>
  <div class="menu-row">
    <button id="fbCtxBranchBtn" style="background:#2c7a6e;">🌿 添加分支</button>
    <button id="fbCtxNodeBtn" style="background:#2c5a3a;">🟢 新建节点</button>
  </div>
  <div class="menu-row" style="border-top:1px solid rgba(255,255,255,0.06);padding-top:6px;">
    <button id="fbCtxToggleCollapseBtn" style="background:#2c6e7e;">折叠/展开支路</button>
    <button id="fbCtxLocateBtn" style="background:#2c6e7e;">定位</button>
  </div>
  <div class="menu-row">
    <button id="fbCtxPromoteBtn" style="background:#5a4a2c;">变成主干路</button>
    <button id="fbCtxAttachBtn" style="background:#4a2c5a;">变成支路</button>
  </div>
  <div class="menu-row">
    <button id="fbCtxCopyBtn" style="background:#2c5a7e;">复制鱼骨图</button>
    <button id="fbCtxMoveBtn" style="background:#7e5a2c;">✥ 移动线路</button>
  </div>
  <div class="menu-row" style="border-top:1px solid rgba(255,100,100,0.2);padding-top:6px;">
    <button id="fbCtxDeleteSegBtn" style="background:#6a3c3c;">🗑️ 删除此连线</button>
  </div>
  <div class="menu-row">
    <button id="fbCtxDeleteTreeBtn" style="background:#6a2c2c;">🗑️ 删除整张鱼骨图</button>
  </div>
`;

let _userData = null;   // 当前段 userData（fishboneSegUserData2D 产物，含 trunkId/segId）

// 点击菜单外部关闭（捕获阶段，画布点击也能关闭）
document.addEventListener('mousedown', (e) => {
  if (menu.style.display === 'flex' && !menu.contains(e.target)) hideFishboneContextMenu();
}, true);
document.addEventListener('pointerdown', (e) => {
  if (menu.style.display === 'flex' && !menu.contains(e.target)) hideFishboneContextMenu();
}, true);

function _hide() {
  // 先提交未保存的标签再清状态：点外关闭时输入框尚未失焦，blur 触发前 _userData 已被清
  _commitLabel();
  menu.style.display = 'none';
  _userData = null;
}

export function hideFishboneContextMenu() {
  _hide();
}

export function isFishboneContextMenuOpen() {
  return menu.style.display === 'flex';
}

// ── 操作按钮：点击先关菜单再执行 ──
function _bind(id, fn) {
  const btn = menu.querySelector(id);
  btn.addEventListener('mousedown', (e) => e.stopPropagation());
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const ud = _userData;
    _hide();
    if (ud) fn(ud);
  });
}

// ── 标签输入 / 颜色选择：操作时不关菜单；失焦或回车自动保存，无独立保存按钮 ──
const labelInput = menu.querySelector('#fbCtxLabelInput');
const colorInput = menu.querySelector('#fbCtxColorInput');
[labelInput, colorInput].forEach(el => el.addEventListener('mousedown', (e) => e.stopPropagation()));

// 保存标签：写入 trunk.segs 元数据并持久化（无变化不落盘）
function _commitLabel() {
  if (!_userData) return;
  const finalLabel = labelInput.value.trim();
  if (finalLabel === (_userData.label || '')) return;
  saveFishboneSegLabel(_userData, finalLabel);
  _userData.label = finalLabel;
  _userData.labelHidden = false;
}
labelInput.addEventListener('blur', _commitLabel);
labelInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    labelInput.blur();   // 触发 blur 保存
  }
});

// 颜色即时生效；恢复默认需重建该段连线（ops 内处理）
colorInput.addEventListener('input', (e) => {
  if (!_userData) return;
  const hex = e.target.value;
  setFishboneSegColor(_userData, hex);
  _userData.customColor = hex;
});
colorInput.addEventListener('mousedown', (e) => e.stopPropagation());

menu.querySelector('#fbCtxColorResetBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  if (!_userData) return;
  setFishboneSegColor(_userData, null);
  _userData.customColor = null;
  colorInput.value = '#ffffff';
});
menu.querySelector('#fbCtxColorResetBtn').addEventListener('mousedown', (e) => e.stopPropagation());

// ── 编辑与图操作 ──
// 添加分支/新建节点：2D/3D 均可用（3D 射线拾取段管线；变成支路仍为 2D 专属）
_bind('#fbCtxBranchBtn', () => {
  // 经 appState 钩子调用（Fishbone/index.js 注册），规避循环依赖
  if (appState.startFishboneBranchDraw) appState.startFishboneBranchDraw();
});
_bind('#fbCtxNodeBtn', () => {
  if (appState.startFishboneNodeCreate) appState.startFishboneNodeCreate();
});
_bind('#fbCtxDeleteSegBtn', (ud) => deleteFishboneSegmentWithHistory(ud));
_bind('#fbCtxToggleCollapseBtn', (ud) => toggleFishboneCollapseWithHistory(ud.trunkId));
_bind('#fbCtxPromoteBtn', (ud) => promoteFishboneTrunkWithHistory(ud.trunkId));
_bind('#fbCtxAttachBtn', (ud) => {
  if (appState.is2DView) startFishboneAttach(ud.trunkId);
  else showToast('「变成支路」请切换到 2D 视图后使用');
});
_bind('#fbCtxLocateBtn', (ud) => locateFishboneTree(ud.trunkId));
_bind('#fbCtxCopyBtn', (ud) => duplicateFishboneTreeWithHistory(ud.trunkId));
_bind('#fbCtxMoveBtn', (ud) => startFishboneMove(ud.trunkId));
_bind('#fbCtxDeleteTreeBtn', (ud) => deleteFishboneTree(ud.trunkId));

// ── 显示菜单：按段/干线状态填充数据、显隐按钮，视口边界内定位 ──
export function showFishboneContextMenu(x, y, userData) {
  const trunk = (appState.fishboneTrunks || []).find(t => t.id === userData.trunkId);
  if (!trunk) return;
  _userData = userData;

  // 选中高亮与单击选中一致：先清旧高亮再高亮当前段
  clearFishboneSegHighlight();
  highlightFishboneSeg(trunk.id, userData.segId);

  menu.querySelector('#fbCtxTitle').textContent =
    `🐟 鱼骨线段（第 ${(userData.segIndex || 0) + 1} 段）`;
  labelInput.value = userData.label || '';

  const hasChildren = (appState.fishboneTrunks || []).some(t => t.parentId === trunk.id);
  const toggleBtn = menu.querySelector('#fbCtxToggleCollapseBtn');
  toggleBtn.style.display = hasChildren ? '' : 'none';
  toggleBtn.textContent = trunk.collapsed ? '📂 展开支路' : '📁 折叠支路';

  const promoteBtn = menu.querySelector('#fbCtxPromoteBtn');
  promoteBtn.style.display = trunk.parentId ? '' : 'none';

  const locateBtn = menu.querySelector('#fbCtxLocateBtn');
  locateBtn.textContent = appState.is2DView ? '定位到 3D 视图' : '定位到 2D 视图';

  menu.style.display = 'flex';
  menu.style.zIndex = '4000';
  menu.style.visibility = 'hidden';
  menu.style.left = '0px';
  menu.style.top = '0px';

  const menuWidth = menu.offsetWidth;
  const menuHeight = menu.offsetHeight;
  const winW = window.innerWidth;
  const winH = window.innerHeight;
  const TASKBAR = 44;

  let left = x + 4;
  let top = y + 4;
  if (left + menuWidth > winW) left = Math.max(0, winW - menuWidth - 4);
  if (top + menuHeight > winH - TASKBAR) top = Math.max(0, winH - TASKBAR - menuHeight - 4);

  menu.style.left = left + 'px';
  menu.style.top = top + 'px';
  menu.style.visibility = 'visible';
}
