// ============================================================
//  UI/Toolbar/version-map-modal.js — 版本时间线模态框（创建、显示/隐藏、拖拽、缩放、刷新版本图、检出commit等）
// ============================================================
import * as THREE from 'three';
import { appState } from '../../module0_AppState.js';
import { showConfirm } from '../../module4_Confirm.js';
import { loadProject } from '../../module2_TreeData.js';
import { checkout as versionCheckout, getGraph, renameCommit } from '../../versionGraph/versionGraph.js';
import { renderVersionMapInto } from '../../versionGraph/versionMap.js';

// ══════════════════════════════════════════════════
//  版本时间线（地铁线路图）模态框
// ══════════════════════════════════════════════════
export function initVersionMapModal() {
    const btn = document.getElementById('versionMapBtn');
    if (!btn) return;

    // 模态框（复用 rich-modal 样式，与设置/文本编辑器一模一样）
    const popup = document.createElement('div');
    popup.id = 'versionMapPopup';
    popup.className = 'rich-modal';
    popup.innerHTML = `
  <div class="rich-modal-content versionmap-modal-content" style="width:720px;height:480px;min-width:420px;min-height:320px;">
    <div class="rich-modal-header" style="cursor:default;">
      <h2>\uD83D\uDD70\uFE0F \u7248\u672C\u65F6\u95F4\u7EBF</h2>
      <div class="caption-buttons">
        <button class="caption-btn versionmap-min-btn" title="\u6700\u5C0F\u5316">
          <svg viewBox="0 0 10 10"><line x1="2" y1="5" x2="8" y2="5"/></svg>
        </button>
        <button class="caption-btn versionmap-max-btn" title="\u6700\u5927\u5316">
          <svg viewBox="0 0 10 10"><rect x="2" y="2" width="6" height="6" rx="0"/></svg>
        </button>
        <button class="caption-btn close versionmap-close-btn" title="\u5173\u95ED">
          <svg viewBox="0 0 10 10"><line x1="2" y1="2" x2="8" y2="8"/><line x1="8" y1="2" x2="2" y2="8"/></svg>
        </button>
      </div>
    </div>
    <div class="panel-accent-line"></div>
    <div class="versionmap-body" style="flex:1;overflow:auto;padding:16px 20px;display:flex;flex-direction:column;gap:12px;">
      <div style="font-size:12px;color:var(--text-secondary);line-height:1.5;">
        \u70B9\u51FB\u7AD9\u70B9\u53EF\u56DE\u5230\u8BE5\u7248\u672C\u3002\u5728\u5386\u53F2\u7AD9\u70B9\u7F16\u8F91\u540E\u4FDD\u5B58\uFF0C\u4F1A\u81EA\u52A8\u4EA7\u751F\u65B0\u5206\u652F\u3002
      </div>
      <div id="versionMapSVG" style="flex:1;min-height:180px;border:1px solid var(--divider);border-radius:8px;background:rgba(0,0,0,0.15);overflow:hidden;position:relative;">
      </div>
      <div style="display:flex;gap:8px;align-items:center;justify-content:space-between;">
        <div style="font-size:11px;color:var(--text-secondary);line-height:1.5;">
          \u70B9\u51FB\u7AD9\u70B9\u53EF\u56DE\u5230\u8BE5\u7248\u672C \u00B7 \u4FDD\u5B58\u9879\u76EE\u65F6\u81EA\u52A8\u4EA7\u751F\u65B0\u7AD9\u70B9 \u00B7 \u5728\u5386\u53F2\u7AD9\u7F16\u8F91\u540E\u4FDD\u5B58\u4F1A\u81EA\u52A8\u4EA7\u751F\u65B0\u5206\u652F
        </div>
        <span id="vmStatusText" style="font-size:10px;color:var(--text-secondary);flex-shrink:0;">\u52A0\u8F7D\u4E2D...</span>
      </div>
    </div>
  </div>`;
    document.body.appendChild(popup);
    window.__versionMapPopup = { popup };

    // ── 打开 ──
    function showVersionMap() {
      const mc = popup.querySelector('.versionmap-modal-content');
      if (popup.classList.contains('minimized')) {
        // 从最小化恢复 —— 用 JS 动画，暂时屏蔽 CSS 入场动画
        popup.classList.add('restoring');
        popup.classList.remove('minimized');
        popup.classList.add('windowed');
        if (mc) {
          const tabEl = document.querySelector('.taskbar-tab[data-editor-key="versionmap"]');
          const rect = mc.getBoundingClientRect();
          let dx = 0, dy = 0, scale = 0.1;
          if (tabEl) {
            const tabRect = tabEl.getBoundingClientRect();
            dx = (tabRect.left + tabRect.width / 2) - (rect.left + rect.width / 2);
            dy = (tabRect.top + tabRect.height / 2) - (rect.top + rect.height / 2);
            scale = Math.min(40 / rect.width, 20 / rect.height);
          }
          mc.style.transform = 'translate(' + dx + 'px, ' + dy + 'px) scale(' + scale + ')';
          mc.style.opacity = '0.15';
          requestAnimationFrame(() => {
            mc.style.transition = 'transform 0.25s cubic-bezier(0.4,0,0.2,1), opacity 0.25s';
            mc.style.transform = 'translate(0,0) scale(1)';
            mc.style.opacity = '1';
            setTimeout(() => {
              mc.style.transition = '';
              mc.style.transform = '';
              popup.classList.remove('restoring');
            }, 260);
          });
        } else {
          popup.classList.remove('restoring');
        }
        if (window.Taskbar) window.Taskbar.setEditorActive('versionmap', true);
        if (window._bringModalToFront) window._bringModalToFront(popup);
        return;
      }
      // 首次或重新打开 —— CSS 入场动画自动触发
      popup.classList.remove('closing', 'maximized');
      popup.classList.add('windowed');
      if (mc) {
        mc.style.left = Math.max(40, (window.innerWidth - 720) / 2) + 'px';
        mc.style.top = Math.max(40, (window.innerHeight - 480) / 2) + 'px';
        mc.style.width = '720px';
        mc.style.height = '480px';
        mc.style.borderRadius = '';
        mc.style.border = '';
      }
      if (window.Taskbar) window.Taskbar.addOrUpdateEditor('versionmap', {
        icon: '🕐',
        label: '版本时间线',
        active: true,
        activate: function () {
          var isVis = popup.classList.contains('windowed') || popup.classList.contains('maximized');
          if (isVis && !popup.classList.contains('minimized')) {
            // 最小化
            const content = popup.querySelector('.versionmap-modal-content');
            if (!content) { popup.classList.add('minimized'); popup.classList.remove('windowed'); return; }
            const tabEl = document.querySelector('.taskbar-tab[data-editor-key="versionmap"]');
            const rect = content.getBoundingClientRect();
            let dx = 0, dy = 0, scale = 0.1;
            if (tabEl) {
              const tabRect = tabEl.getBoundingClientRect();
              dx = (tabRect.left + tabRect.width / 2) - (rect.left + rect.width / 2);
              dy = (tabRect.top + tabRect.height / 2) - (rect.top + rect.height / 2);
              scale = Math.min(40 / rect.width, 20 / rect.height);
            }
            const anim = content.animate([
              { transform: 'translate(0,0) scale(1)', opacity: 1 },
              { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + scale + ')', opacity: 0.15 }
            ], { duration: 250, easing: 'cubic-bezier(0.4,0,0.2,1)' });
            anim.onfinish = function () {
              popup.classList.add('minimized');
              popup.classList.remove('windowed');
              content.style.transform = '';
              if (window.Taskbar) window.Taskbar.setEditorActive('versionmap', false);
            };
          } else {
            // 恢复
            showVersionMap();
          }
        },
        close: hideVersionMap,
        maximize: function () {
              // 从最小化恢复时先显示
              if (popup.classList.contains('minimized')) {
                popup.classList.remove('minimized');
                popup.style.display = '';
              }
              // 切换最大化/窗口化
              if (popup.classList.contains('maximized')) {
                popup.classList.remove('maximized');
                popup.classList.add('windowed');
              } else {
                popup.classList.remove('windowed');
                popup.classList.add('maximized');
              }
              if (window._bringModalToFront) window._bringModalToFront(popup);
              if (window.Taskbar) window.Taskbar.setEditorActive('versionmap', true);
            },
        minimize: function () {
          const content = popup.querySelector('.versionmap-modal-content');
          if (!content) { popup.classList.add('minimized'); popup.classList.remove('windowed'); return; }
          const tabEl = document.querySelector('.taskbar-tab[data-editor-key="versionmap"]');
          const rect = content.getBoundingClientRect();
          let dx = 0, dy = 0, scale = 0.1;
          if (tabEl) {
            const tabRect = tabEl.getBoundingClientRect();
            dx = (tabRect.left + tabRect.width / 2) - (rect.left + rect.width / 2);
            dy = (tabRect.top + tabRect.height / 2) - (rect.top + rect.height / 2);
            scale = Math.min(40 / rect.width, 20 / rect.height);
          }
          const anim = content.animate([
            { transform: 'translate(0,0) scale(1)', opacity: 1 },
            { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + scale + ')', opacity: 0.15 }
          ], { duration: 250, easing: 'cubic-bezier(0.4,0,0.2,1)' });
          anim.onfinish = function () {
            popup.classList.add('minimized');
            popup.classList.remove('windowed');
            content.style.transform = '';
            if (window.Taskbar) window.Taskbar.setEditorActive('versionmap', false);
          };
        }
      });
      if (window.WindowManager) window.WindowManager.registerElement(popup);
      if (window._bringModalToFront) window._bringModalToFront(popup);
    }

    // ── 关闭 ──
    function hideVersionMap() {
      if (popup.classList.contains('maximized')) {
        // 最大化状态：添加关闭动画
        popup.classList.add('closing');
        const mc = popup.querySelector('.versionmap-modal-content');
        if (mc) {
          mc.style.transition = 'opacity 0.2s cubic-bezier(0.55,0,1,0.45), transform 0.2s cubic-bezier(0.55,0,1,0.45)';
          mc.style.opacity = '0';
          mc.style.transform = 'scale(0.96)';
        }
        setTimeout(() => {
          if (mc) { mc.style.transition = ''; mc.style.opacity = ''; mc.style.transform = ''; }
          popup.classList.remove('maximized', 'windowed', 'closing', 'restoring');
          if (window.Taskbar) window.Taskbar.removeEditor('versionmap');
        }, 210);
        return;
      }
      popup.classList.add('closing');
      setTimeout(() => {
        popup.classList.remove('windowed', 'closing', 'maximized', 'minimized', 'restoring');
        if (window.Taskbar) window.Taskbar.removeEditor('versionmap');
      }, 200);
    }

    // ── 按钮切换 ──
    btn.addEventListener('click', () => {
      const isVisible = popup.classList.contains('windowed') || popup.classList.contains('maximized');
      if (isVisible && !popup.classList.contains('minimized')) hideVersionMap();
      else showVersionMap();
    });

    // ── 关闭按钮 ──
    popup.querySelector('.versionmap-close-btn')?.addEventListener('click', hideVersionMap);

    // ── 最小化按钮（带缩入动画）──
    popup.querySelector('.versionmap-min-btn')?.addEventListener('click', function () {
      const content = popup.querySelector('.versionmap-modal-content');
      if (!content) { popup.classList.add('minimized'); popup.classList.remove('windowed'); return; }
      const tabEl = document.querySelector('.taskbar-tab[data-editor-key="versionmap"]');
      const rect = content.getBoundingClientRect();
      let dx = 0, dy = 0, scale = 0.1;
      if (tabEl) {
        const tabRect = tabEl.getBoundingClientRect();
        dx = (tabRect.left + tabRect.width / 2) - (rect.left + rect.width / 2);
        dy = (tabRect.top + tabRect.height / 2) - (rect.top + rect.height / 2);
        scale = Math.min(40 / rect.width, 20 / rect.height);
      }
      const anim = content.animate([
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + scale + ')', opacity: 0.15 }
      ], { duration: 250, easing: 'cubic-bezier(0.4,0,0.2,1)' });
      anim.onfinish = function () {
        popup.classList.add('minimized');
        popup.classList.remove('windowed');
        content.style.transform = '';
        if (window.Taskbar) window.Taskbar.setEditorActive('versionmap', false);
      };
    });

    // ── 最大化/还原按钮 ──
    let _vmMax = false;
    let _vmPrevRect = null;
    const vmContent = popup.querySelector('.versionmap-modal-content');
    const vmMaxBtn = popup.querySelector('.versionmap-max-btn');
    function _updateMaxIcon(isMaxed) {
      const svg = vmMaxBtn?.querySelector('svg');
      if (!svg) return;
      if (isMaxed) {
        svg.innerHTML = '<rect x="3" y="0" width="5" height="5" rx="0"/><rect x="0" y="4" width="5" height="5" rx="0"/>';
        vmMaxBtn.title = '\u7A97\u53E3\u5316';
      } else {
        svg.innerHTML = '<rect x="2" y="2" width="6" height="6" rx="0"/>';
        vmMaxBtn.title = '\u6700\u5927\u5316';
      }
    }
    if (vmMaxBtn && vmContent) {
      vmMaxBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (_vmMax) {
          _vmMax = false;
          vmContent.style.left = (_vmPrevRect?.left || 0) + 'px';
          vmContent.style.top = (_vmPrevRect?.top || 0) + 'px';
          vmContent.style.width = (_vmPrevRect?.width || 720) + 'px';
          vmContent.style.height = (_vmPrevRect?.height || 480) + 'px';
          vmContent.style.borderRadius = '';
          vmContent.style.border = '';
          _updateMaxIcon(false);
        } else {
          _vmPrevRect = vmContent.getBoundingClientRect();
          _vmMax = true;
          const titleBarH = window.__ELECTRON__ ? 38 : 0;
          const taskbarH = 44;
          vmContent.style.left = '0px';
          vmContent.style.top = titleBarH + 'px';
          vmContent.style.width = '100vw';
          vmContent.style.height = 'calc(100vh - ' + taskbarH + 'px - ' + titleBarH + 'px)';
          vmContent.style.borderRadius = '0';
          vmContent.style.border = 'none';
          _updateMaxIcon(true);
        }
      });
    }

    // ── 拖动标题栏 ──
    const vmHeader = popup.querySelector('.rich-modal-header');
    if (vmHeader && vmContent) {
      let _vmDrag = false, _vmSX, _vmSY, _vmSL, _vmST;
      vmHeader.addEventListener('mousedown', function (e) {
        if (e.target.closest('.caption-buttons') || _vmMax) return;
        _vmDrag = true; _vmSX = e.clientX; _vmSY = e.clientY;
        var r = vmContent.getBoundingClientRect();
        _vmSL = r.left; _vmST = r.top;
        vmContent.style.transition = 'none';
        e.preventDefault();
      });
      document.addEventListener('mousemove', function (e) {
        if (!_vmDrag) return;
        vmContent.style.left = (_vmSL + e.clientX - _vmSX) + 'px';
        vmContent.style.top = (_vmST + e.clientY - _vmSY) + 'px';
      });
      document.addEventListener('mouseup', function () {
        if (_vmDrag) { _vmDrag = false; vmContent.style.transition = ''; }
      });
    }

    // ── 自由缩放（边缘拖拽手柄）──
    if (vmContent) {
      const edges = [
        { d:'n',  t:'0',  l:'8px', r:'8px',  b:'',   w:'',   h:'6px',  c:'ns-resize' },
        { d:'s',  t:'',   l:'8px', r:'8px',  b:'0',  w:'',   h:'6px',  c:'ns-resize' },
        { d:'e',  t:'8px',l:'',    r:'0',    b:'8px',w:'6px',h:'',    c:'ew-resize' },
        { d:'w',  t:'8px',l:'0',   r:'',     b:'8px',w:'6px',h:'',    c:'ew-resize' },
        { d:'ne', t:'0',  l:'',    r:'0',    b:'',   w:'14px',h:'14px',c:'nesw-resize' },
        { d:'nw', t:'0',  l:'0',   r:'',     b:'',   w:'14px',h:'14px',c:'nwse-resize' },
        { d:'se', t:'',   l:'',    r:'0',    b:'0',  w:'14px',h:'14px',c:'nwse-resize' },
        { d:'sw', t:'',   l:'0',   r:'',     b:'0',  w:'14px',h:'14px',c:'nesw-resize' }
      ];
      edges.forEach(function (edge) {
        var h = document.createElement('div');
        h.style.cssText = 'position:absolute;z-index:10;' +
          (edge.t ? 'top:' + edge.t + ';' : '') +
          (edge.b ? 'bottom:' + edge.b + ';' : '') +
          (edge.l ? 'left:' + edge.l + ';' : '') +
          (edge.r ? 'right:' + edge.r + ';' : '') +
          (edge.w ? 'width:' + edge.w + ';' : '') +
          (edge.h ? 'height:' + edge.h + ';' : '') +
          'cursor:' + edge.c + ';';
        h.addEventListener('mousedown', function (e) {
          if (_vmMax) return;
          e.preventDefault(); e.stopPropagation();
          var startX = e.clientX, startY = e.clientY;
          var rect = vmContent.getBoundingClientRect();
          vmContent.style.transition = 'none';
          function onMove(ev) {
            var dx = ev.clientX - startX, dy = ev.clientY - startY;
            var nl = rect.left, nt = rect.top, nw = rect.width, nh = rect.height;
            if (edge.d.includes('e')) nw = Math.max(420, rect.width + dx);
            if (edge.d.includes('w')) { nw = Math.max(420, rect.width - dx); nl = rect.left + rect.width - nw; }
            if (edge.d.includes('s')) nh = Math.max(320, rect.height + dy);
            if (edge.d.includes('n')) { nh = Math.max(320, rect.height - dy); nt = rect.top + rect.height - nh; }
            vmContent.style.left = nl + 'px'; vmContent.style.top = nt + 'px';
            vmContent.style.width = nw + 'px'; vmContent.style.height = nh + 'px';
          }
          function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            vmContent.style.transition = '';
          }
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
        });
        vmContent.appendChild(h);
      });
    }

    // ── 刷新版本图显示 ──
    async function refreshVersionMap() {
      const svgContainer = document.getElementById('versionMapSVG');
      const statusEl = document.getElementById('vmStatusText');
      if (!svgContainer) return;
      const pid = appState.currentProjectId;
      if (!pid) {
        svgContainer.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-secondary);font-size:13px;">请先打开一个项目</div>';
        if (statusEl) statusEl.textContent = '无当前项目';
        return;
      }
      try {
        const graph = await getGraph(pid);
        renderVersionMapInto(svgContainer, graph, {
          onCheckoutCommit: function (commitId) {
            handleCheckout(commitId);
          },
          onRenameCommit: async function (commitId, newName) {
            const ok = await renameCommit(pid, commitId, newName);
            if (ok) refreshVersionMap();
          }
        });
        const n = (graph.commits || []).length;
        const b = (graph.branches || []).length;
        if (statusEl) statusEl.textContent = n + ' 个站点 · ' + b + ' 条分支';
      } catch (e) {
        svgContainer.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#ff6b6b;font-size:12px;">加载失败: ' + esc(e.message) + '</div>';
        if (statusEl) statusEl.textContent = '加载失败';
      }
    }

    function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

    // ── 检出 commit（切到该版本，保留当前项目 ID 以维持版本图关联） ──
    async function handleCheckout(commitId) {
      const pid = appState.currentProjectId;
      if (!pid) return;
      showConfirm('切换到该版本？当前未保存的修改会丢失。', async () => {
        try {
          const result = await versionCheckout(pid, commitId);
          if (result && result.snapshot) {
            // 将快照转换为项目数据格式（positions 转回 Map<Vector3>）
            const snap = result.snapshot;
            const posMap = new Map();
            if (snap.positions) {
              for (const id in snap.positions) {
                const p = snap.positions[id];
                posMap.set(id, new THREE.Vector3(p.x, p.y, p.z));
              }
            }
            const data = {
              methodsTree: snap.methodsTree,
              crossEdges: snap.crossEdges || [],
              positions: posMap,
              positions2D: snap.positions2D || {},
              collapsed2D: snap.collapsed2D || [],
              nodeRichContents: snap.nodeRichContents || {},
              nodeOverlayImages: snap.nodeOverlayImages || {},
              nodeFileSystems: snap.nodeFileSystems || {},
              nodeHtmlSources: snap.nodeHtmlSources || {},
              nodeActiveModes: snap.nodeActiveModes || {},
              layers: (snap.layers || []).map(l => ({
                id: l.id, name: l.name, order: l.order,
                nodeIds: new Set(l.nodeIds || []),
                positions2D: new Map(Object.entries(l.positions2D || {}))
              })),
              currentLayerId: snap.currentLayerId || null,
              treeEdgeLabels: snap.treeEdgeLabels || {},
              cameraView: snap.cameraView || { position: { x: 0, y: 4.5, z: 8 }, target: { x: 0, y: 0.2, z: 0 } }
            };
            // 更新当前项目的数据
            const proj = appState.projects.find(p => p.id === pid);
            if (proj) proj.data = data;
            // 强制重载（loadProject 会跳过相同项目，所以临时清空 currentProjectId）
            appState.currentProjectId = null;
            loadProject(pid);
            await refreshVersionMap();
          } else {
            alert('切换失败：版本数据缺失');
          }
        } catch (e) {
          alert('切换失败: ' + e.message);
        }
      });
    }

    // ── 打开时刷新 ──
    const origShowVersionMap = showVersionMap;
    showVersionMap = function () {
      origShowVersionMap();
      setTimeout(refreshVersionMap, 100);
    };

    // ── 监听版本更新事件（自动保存产生新站点时刷新面板） ──
    window.addEventListener('astroknot-version-updated', function () {
      if (popup.classList.contains('windowed') || popup.classList.contains('maximized')) {
        refreshVersionMap();
      }
    });

    // ── 监听项目切换事件（新建/切换项目时刷新面板，显示当前项目的版本图） ──
    window.addEventListener('astroknot-project-switched', function () {
      if (popup.classList.contains('windowed') || popup.classList.contains('maximized')) {
        refreshVersionMap();
      }
    });
}
