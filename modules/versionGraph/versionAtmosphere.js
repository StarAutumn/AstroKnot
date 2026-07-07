// ============================================================
//  版本氛围：根据当前 HEAD 在版本图中的"新旧程度"调整 3D 场景
//  越靠近根（越早的站点）→ 饱和度越低、越泛黄、动画越慢
//  越靠近最新站点 → 颜色饱满、动画正常
// ============================================================
import { getGraph, getHeadCommit, getAncestors } from './versionGraph.js';
import { appState } from '../module0_AppState.js';

let _decay = 1;          // 衰减系数 0~1，1=最新，0=最老
let _maxDepthCache = 1;  // 当前图最大深度缓存

/**
 * 获取当前衰减系数（供 animate 读取动画速度）
 */
export function getVersionDecay() {
  return _decay;
}

/**
 * 计算图中所有 commit 的最大深度（根=1）
 */
function computeMaxDepth(graph) {
  if (!graph || !graph.commits || graph.commits.length === 0) return 1;
  const depthMap = new Map();
  const commitMap = new Map(graph.commits.map(c => [c.id, c]));
  function depth(id) {
    if (depthMap.has(id)) return depthMap.get(id);
    const c = commitMap.get(id);
    if (!c || !c.parent) {
      depthMap.set(id, 1);
      return 1;
    }
    const d = depth(c.parent) + 1;
    depthMap.set(id, d);
    return d;
  }
  let max = 1;
  for (const c of graph.commits) {
    const d = depth(c.id);
    if (d > max) max = d;
  }
  return max;
}

/**
 * 应用视觉效果到 3D canvas（CSS filter）
 */
function applyVisual() {
  const v = _decay; // 1=最新，0=最老
  // 饱和度：最新 1.0，最老 0.08（几乎无色）
  const saturate = 0.08 + v * 0.92;
  // 泛黄：最新 0，最老 0.85（强泛黄）
  const sepia = (1 - v) * 0.85;
  // 亮度：最新 1.0，最老 0.72（稍暗）
  const brightness = 0.72 + v * 0.28;
  const filter = `saturate(${saturate.toFixed(3)}) sepia(${sepia.toFixed(3)}) brightness(${brightness.toFixed(3)})`;
  // 应用到渲染器 canvas
  const canvas = appState.renderer && appState.renderer.domElement;
  if (canvas) canvas.style.filter = filter;
  // 同步应用到 CSS2D 标签层（保持视觉一致）
  const labelLayer = document.getElementById('labelRenderer');
  if (labelLayer) labelLayer.style.filter = filter;
}

/**
 * 重新计算衰减系数并应用视觉
 */
async function updateAtmosphere() {
  const pid = appState.currentProjectId;
  if (!pid) {
    _decay = 1;
    applyVisual();
    console.log('[版本氛围] 无项目，_decay = 1');
    return;
  }
  try {
    const graph = await getGraph(pid);
    if (!graph || !graph.commits || graph.commits.length === 0) {
      _decay = 1;
      applyVisual();
      console.log('[版本氛围] 无 commit，_decay = 1');
      return;
    }
    const head = getHeadCommit(graph);
    if (!head) {
      _decay = 1;
      applyVisual();
      console.log('[版本氛围] 无 HEAD，_decay = 1');
      return;
    }
    _maxDepthCache = computeMaxDepth(graph);
    const headDepth = getAncestors(graph, head.id).length; // 从根到 HEAD 的节点数
    // decay = HEAD深度 / 最大深度；HEAD越靠根，值越小
    _decay = Math.max(0, Math.min(1, headDepth / _maxDepthCache));
    console.log(`[版本氛围] HEAD深度=${headDepth}, 最大深度=${_maxDepthCache}, _decay=${_decay.toFixed(3)}, 动画速度因子=${(0.005 + _decay * _decay * 0.995).toFixed(3)}`);
    applyVisual();
  } catch (e) {
    console.warn('[版本氛围] 计算失败:', e);
    _decay = 1;
    applyVisual();
  }
}

/**
 * 清除视觉效果（退出时恢复）
 */
export function clearVersionAtmosphere() {
  _decay = 1;
  const canvas = appState.renderer && appState.renderer.domElement;
  if (canvas) canvas.style.filter = '';
  const labelLayer = document.getElementById('labelRenderer');
  if (labelLayer) labelLayer.style.filter = '';
}

/**
 * 初始化版本氛围（监听版本更新和项目切换事件）
 */
export function initVersionAtmosphere() {
  window.addEventListener('astroknot-version-updated', updateAtmosphere);
  window.addEventListener('astroknot-project-switched', updateAtmosphere);
  // 初始计算一次
  setTimeout(updateAtmosphere, 500);
}
