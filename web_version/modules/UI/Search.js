// ============================================================
//  UI / Search.js — 节点搜索 + 全局搜索
// ============================================================
import * as THREE from 'three';
import { appState } from '../module0_AppState.js';
import { setSelectedNode, updateSelectionUI } from '../module5_SelectAndEdit.js';
import { openRichEditor } from '../richEditor/index.js';
import { state as richState } from '../richEditor/shared-state.js';

// ---------- 搜索节点（当前项目）----------
export function bindSearch() {
  const searchInput = document.getElementById('searchInput');
  const searchDropdown = document.getElementById('searchDropdown');
  function updateSearchDrop() {
    let kw = searchInput.value.trim().toLowerCase();
    searchInput.classList.remove('node-selected');
    if (kw === "") {
      searchDropdown.style.display = "none";
      return;
    }
    let matches = [];
    for (let [id, node] of appState.nodeMap.entries()) {
      if (node.name.toLowerCase().includes(kw) || id.toLowerCase().includes(kw)) {
        matches.push({ id, name: node.name });
      }
    }
    if (matches.length === 0) {
      searchDropdown.style.display = "none";
      return;
    }
    searchDropdown.innerHTML = "";
    matches.slice(0, 10).forEach(m => {
      let d = document.createElement('div');
      d.textContent = `${m.name} (${m.id})`;
      d.onclick = () => {
        searchInput.value = m.name;
        searchDropdown.style.display = "none";
        focusOnNode(m.id);
      };
      searchDropdown.appendChild(d);
    });
    searchDropdown.style.display = "block";
  }

  function focusOnNode(nodeId) {
    if (!appState.nodeMap.has(nodeId)) return;
    setSelectedNode(nodeId, false);
    updateSelectionUI();

    if (appState.is2DView) {
      if (typeof appState.focusOnNode2D === 'function') {
        appState.focusOnNode2D(nodeId);
      }
      return;
    }

    let pos = appState.positions.get(nodeId);
    if (!pos) return;
    const distance = 8.0;
    const toCamera = new THREE.Vector3().subVectors(appState.camera.position, pos).normalize();
    const cameraPos = pos.clone().add(toCamera.clone().multiplyScalar(distance));
    cameraPos.y += 0.5;
    appState.cameraAnimStartPos.copy(appState.camera.position);
    appState.cameraAnimStartTarget.copy(appState.controls.target);
    appState.cameraAnimTarget = {
      cameraPos: cameraPos,
      controlsTarget: pos.clone()
    };
    appState.cameraAnimProgress = 0;
    appState.cameraAnimDuration = 0.8;
    appState.cameraAnimActive = true;

    const checkSelection = () => {
      if (appState.cameraAnimActive) {
        requestAnimationFrame(checkSelection);
      } else {
        setSelectedNode(nodeId, false);
      }
    };
    requestAnimationFrame(checkSelection);
  }

  appState.focusOnNode3D = focusOnNode;
  searchInput.addEventListener('input', updateSearchDrop);

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      searchDropdown.style.display = 'none';
      searchInput.blur();
    }
  });

  document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !searchDropdown.contains(e.target)) {
      searchDropdown.style.display = 'none';
    }
  });
}

// ---------- 全局搜索（跨所有项目）----------
export function bindGlobalSearch() {
  const searchInput = document.getElementById('globalSearchInput');
  const searchDropdown = document.getElementById('globalSearchDropdown');
  if (!searchInput || !searchDropdown) return;

  function searchAllProjects(keyword) {
    const results = [];
    const kw = keyword.toLowerCase().trim();
    if (!kw) return results;

    for (const proj of appState.projects) {
      const projName = proj.name || '未命名项目';
      const data = proj.data;
      if (!data || !data.methodsTree) continue;

      const nodeRichContents = data.nodeRichContents || {};

      function traverse(node) {
        if (!node) return;
        const nodeId = node.id || '';
        const nodeName = node.name || '';
        const content = nodeRichContents[nodeId] || '';

        if (nodeName.toLowerCase().includes(kw) || nodeId.toLowerCase().includes(kw) || content.toLowerCase().includes(kw)) {
          const preview = content.replace(/<[^>]*>/g, '').substring(0, 50);
          results.push({
            projectId: proj.id,
            projectName: projName,
            nodeId: nodeId,
            nodeName: nodeName,
            preview: preview
          });
        }
        if (node.children) {
          node.children.forEach(traverse);
        }
      }
      traverse(data.methodsTree);
    }
    return results;
  }

  let debounceTimer = null;
  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const kw = searchInput.value.trim();
      if (!kw) { searchDropdown.classList.remove('show'); return; }
      const results = searchAllProjects(kw);
      searchDropdown.innerHTML = '';
      if (results.length === 0) {
        searchDropdown.innerHTML = '<div style="padding:6px;color:#888;">无结果</div>';
      } else {
        results.forEach(r => {
          const item = document.createElement('div');
          item.className = 'global-search-item';
          item.innerHTML = `<strong style="color:#c0e0ff;">[${r.projectName}]</strong> ${r.nodeName} <span style="color:#888;font-size:11px;">${r.preview}</span>`;
          item.addEventListener('click', () => {
            const keyword = kw; // 捕获当前搜索关键词
            searchDropdown.classList.remove('show');
            searchInput.value = '';

            // 辅助函数：聚焦节点 + 打开编辑器 + 高亮关键词
            const doFocusAndEdit = () => {
              // ① 选中节点
              setSelectedNode(r.nodeId, false);
              updateSelectionUI();

              // ② 相机聚焦（3D / 2D 自适应）
              if (appState.is2DView && appState.focusOnNode2D) {
                appState.focusOnNode2D(r.nodeId);
              } else {
                const pos = appState.positions.get(r.nodeId);
                if (pos && appState.camera && appState.controls) {
                  const dist = 8.0;
                  const toCam = new THREE.Vector3()
                    .subVectors(appState.camera.position, pos).normalize();
                  const camPos = pos.clone().add(toCam.clone().multiplyScalar(dist));
                  camPos.y += 0.5;
                  appState.cameraAnimStartPos.copy(appState.camera.position);
                  appState.cameraAnimStartTarget.copy(appState.controls.target);
                  appState.cameraAnimTarget = {
                    cameraPos: camPos,
                    controlsTarget: pos.clone()
                  };
                  appState.cameraAnimProgress = 0;
                  appState.cameraAnimActive = true;
                }
              }

              // ③ 打开富文本编辑器
              if (typeof openRichEditor === 'function') {
                openRichEditor(r.nodeId);
              }

              // ④ 等编辑器加载完成后高亮关键词
              if (keyword) {
                _highlightKeywordInEditor(keyword);
              }
            };

            // 跨项目切换
            const targetProject = appState.projects.find(p => p.id === r.projectId);
            if (targetProject && targetProject.id !== appState.currentProjectId) {
              appState.loadProject(targetProject.id, () => {
                doFocusAndEdit();
              });
            } else {
              doFocusAndEdit();
            }
          });
          searchDropdown.appendChild(item);
        });
      }
      searchDropdown.classList.add('show');
    }, 300);
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      searchDropdown.classList.remove('show');
      searchInput.blur();
    }
  });

  document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !searchDropdown.contains(e.target)) {
      searchDropdown.classList.remove('show');
    }
  });
}

// ============================================================
//  辅助：在 TinyMCE 编辑器中搜索并高亮关键词
// ============================================================
function _highlightKeywordInEditor(keyword) {
  if (!keyword) return;

  // 轮询等待编辑器就绪（最多等 3 秒）
  let attempts = 0;
  const maxAttempts = 30;
  const tryHighlight = () => {
    const editor = richState.tinyEditor;
    if (!editor) {
      if (++attempts < maxAttempts) setTimeout(tryHighlight, 100);
      return;
    }

    try {
      const body = editor.getBody();
      if (!body) return;
      const kw = keyword.toLowerCase();

      // 用 TreeWalker 遍历所有文本节点查找匹配
      const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, null);
      const matches = [];
      let node;
      while ((node = walker.nextNode())) {
        const text = node.textContent.toLowerCase();
        let idx = -1;
        while ((idx = text.indexOf(kw, idx + 1)) !== -1) {
          matches.push({ node, offset: idx });
        }
      }

      if (matches.length === 0) return;

      // 滚动到第一个匹配位置并高亮
      const first = matches[0];
      const range = document.createRange();
      range.setStart(first.node, first.offset);
      range.setEnd(first.node, first.offset + keyword.length);

      // 高亮 span
      const span = document.createElement('span');
      span.className = 'search-global-flash';
      span.style.cssText = 'background:#ffeb3b;color:#000;border-radius:2px;padding:1px 0;';
      range.surroundContents(span);

      // 滚动到高亮位置
      span.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // 闪烁后移除
      let count = 0;
      const flash = setInterval(() => {
        if (count >= 6) {
          clearInterval(flash);
          // 恢复原始文本节点
          const parent = span.parentNode;
          if (parent) {
            while (span.firstChild) {
              parent.insertBefore(span.firstChild, span);
            }
            parent.removeChild(span);
            parent.normalize();
          }
          return;
        }
        span.style.background = (count % 2 === 0) ? '#ff9800' : '#ffeb3b';
        count++;
      }, 150);
    } catch (e) {
      // 编辑器内容可能尚不可访问，静默忽略
    }
  };

  setTimeout(tryHighlight, 600);
}