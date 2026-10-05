// ============================================================
//  模块5：选中系统与节点编辑操作 —— 子节点折叠/展开动画
//  由 module5_SelectAndEdit.js 拆分
// ============================================================
import { appState } from '../module0_AppState.js';
import { withHistory } from '../module3_History.js';
import { updateLinesVis } from '../VisualComponents/index.js';
import { labelAnimScale, updateNodeLabelBadge } from '../VisualComponents/nodes/mesh.js';
import { countDescendants } from '../TreeData/data-factory.js';
import { showToast } from './toast.js';
import { getPrimarySelectedId } from './selection.js';

// ==================== 折叠/展开子节点（带动画） ====================

export function toggleChildren() {
  let id = getPrimarySelectedId();
  if (!id) { showToast("请选中一个节点"); return; }
  if (appState._toggleAnimLock && appState._toggleAnimLock.has(id)) return;
  if (!appState._toggleAnimLock) appState._toggleAnimLock = new Set();
  appState._toggleAnimLock.add(id);
  let node = appState.nodeMap.get(id);
  if (!node || !node.children || node.children.length === 0) {
    appState._toggleAnimLock.delete(id);
    showToast("无子节点");
    return;
  }

  let firstChild = node.children[0];
  let firstObj = appState.nodeMeshes.get(firstChild.id);
  if (!firstObj) {
    appState._toggleAnimLock.delete(id);
    return;
  }
  let visible = firstObj.mesh.visible;
  let target = !visible;
  let affected = [];
  for (let c of node.children) {
    affected.push(...(function get(n, list) { list.push(n); if (n.children) n.children.forEach(ch => get(ch, list)); return list; })(c, []));
  }
  let affectedIds = new Set(affected.map(n => n.id));
  let affLines = appState.lineItems.filter(it => affectedIds.has(it.startId) || affectedIds.has(it.endId));
  let start = performance.now(), dur = 500;

  // ── 卫星化折叠动画：节点缩小到螺旋粒子尺寸并同步飞向父节点（展开反向飞回）──
  // SAT_SCALE：粒子光点为软边辉光，视觉亮核远小于贴图尺寸 0.25，
  // 实心球需缩得更小才匹配观感（0.25 → 球直径 ≈ 0.11）
  const SAT_SCALE = 0.08;
  const parentObj = appState.nodeMeshes.get(id);
  const parentPos = parentObj ? parentObj.mesh.position : null;
  const animPos = new Map();   // id → 布局位（折叠起点/展开终点，动画结束恢复）
  for (let n of affected) {
    const obj = appState.nodeMeshes.get(n.id);
    if (obj) animPos.set(n.id, obj.mesh.position.clone());
  }

  // 标记连线特效正在参与折叠/展开动画，渲染循环跳过其 opacity 覆盖
  appState._lineToggleAnimActive = true;

  if (target) {
    // 极简模式下泛光特效不参与动画，由渲染循环按模式控制
    const showGlow = !appState.simple3D;
    for (let n of affected) {
      let obj = appState.nodeMeshes.get(n.id);
      if (obj) {
        obj.mesh.visible = true; obj.label.visible = true; obj.visible = true;
        obj.mesh.scale.set(SAT_SCALE, SAT_SCALE, SAT_SCALE); if (obj.label) labelAnimScale(obj.label, SAT_SCALE);
        if (parentPos) obj.mesh.position.copy(parentPos);   // 从父节点位置起飞（布局位已记录在 animPos）
        if (obj.mesh.material) { obj.mesh.material.transparent = true; obj.mesh.material.opacity = 0; }
        if (obj.glowSphere && obj.glowSphere.material) {
          obj.glowSphere.visible = showGlow;
          obj.glowSphere.material.transparent = true; obj.glowSphere.material.opacity = 0;
        }
        if (obj.ring && obj.ring.material) { obj.ring.material.transparent = true; obj.ring.material.opacity = 0; }
        if (obj.label && obj.label.element) { obj.label.element.style.opacity = 0; }
        if (obj.surfaceGlowSphere) {
          obj.surfaceGlowSphere.visible = showGlow;
          obj.surfaceGlowSphere.scale.set(SAT_SCALE, SAT_SCALE, SAT_SCALE);
          if (obj.surfaceGlowSphere.material) {
            obj.surfaceGlowSphere.material.transparent = true;
            obj.surfaceGlowSphere.material.opacity = 0;
          }
        }
      }
    }
    for (let l of affLines) {
      l.line.setVisible(true);
      l.line.setOpacity(0);
      if (showGlow) {
        // 华丽模式下连线泛光特效参与渐隐渐显动画
        if (l.line.glowTube) { l.line.glowTube.visible = true; l.line.glowTube.material.transparent = true; l.line.glowTube.material.opacity = 0; }
        if (l.line.particlePoints) { l.line.particlePoints.visible = true; l.line.particlePoints.material.opacity = 0; }
      }
      if (l.line.trailPointsMerged) l.line.trailPointsMerged.visible = false;
    }
  }

  function step(now) {
    let t = Math.min(1, (now - start) / dur);
    let ease = 1 - Math.pow(1 - t, 2);
    // 卫星化动画：缩放在 1 ↔ 粒子尺寸(SAT_SCALE) 之间；位置在布局位 ↔ 父节点之间同步插值
    let sc = target ? (SAT_SCALE + (1 - SAT_SCALE) * ease) : (1 - (1 - SAT_SCALE) * ease);
    // 透明度错峰：折叠后半程渐隐 / 展开前半程渐显（到达/离开父节点时光滑融入卫星形态）
    let opacity = target ? (ease < 0.45 ? ease / 0.45 : 1) : (ease < 0.55 ? 1 : 1 - (ease - 0.55) / 0.45);

    // 极简模式下泛光特效不参与动画
    const showGlow = !appState.simple3D;

    for (let n of affected) {
      let obj = appState.nodeMeshes.get(n.id);
      if (obj) {
        obj.mesh.scale.set(sc, sc, sc);
        const home = animPos.get(n.id);
        if (home && parentPos) {
          // 折叠：布局位 → 父节点；展开：父节点 → 布局位
          obj.mesh.position.lerpVectors(target ? parentPos : home, target ? home : parentPos, ease);
        }
        if (obj.label) labelAnimScale(obj.label, sc);
        if (obj.mesh.material) { obj.mesh.material.transparent = true; obj.mesh.material.opacity = opacity; }
        if (obj.glowSphere && obj.glowSphere.material && showGlow) { obj.glowSphere.material.transparent = true; obj.glowSphere.material.opacity = opacity; }
        if (obj.ring && obj.ring.material) { obj.ring.material.transparent = true; obj.ring.material.opacity = opacity; }
        if (obj.label && obj.label.element) { obj.label.element.style.opacity = opacity; }
        if (obj.surfaceGlowSphere && showGlow) {
          obj.surfaceGlowSphere.scale.set(sc, sc, sc);
          if (obj.surfaceGlowSphere.material) {
            obj.surfaceGlowSphere.material.transparent = true;
            obj.surfaceGlowSphere.material.opacity = opacity;
          }
        }
      }
    }

    for (let l of affLines) {
      l.line.setOpacity(target ? ease : 1 - ease);
      if (showGlow) {
        // 华丽模式下连线泛光特效渐隐渐显
        if (l.line.glowTube) { l.line.glowTube.material.transparent = true; l.line.glowTube.material.opacity = (target ? ease : 1 - ease) * 0.9; }
        if (l.line.particlePoints) { l.line.particlePoints.material.opacity = target ? ease : 1 - ease; }
      }
    }

    if (t >= 1) {
      for (let n of affected) {
        let obj = appState.nodeMeshes.get(n.id);
        if (obj) {
          obj.mesh.visible = target; obj.label.visible = target; obj.visible = target;
          obj.mesh.scale.set(1, 1, 1);
          const home = animPos.get(n.id);
          if (home) { obj.mesh.position.copy(home); animPos.delete(n.id); }   // 恢复布局位（折叠节点隐藏后位置复位，供下次展开起飞）
          if (obj.label) labelAnimScale(obj.label, 1); // 恢复标签基准缩放（Sprite 基准 0.02，不能停在动画系数 1）
          if (obj.mesh.material) { obj.mesh.material.transparent = false; obj.mesh.material.opacity = 1; }
          // 泛光球壳：极简模式下不强制显示，由每帧动画循环按模式控制
          const showGlow = target && !appState.simple3D;
          if (obj.glowSphere && obj.glowSphere.material) {
            obj.glowSphere.visible = showGlow;
            obj.glowSphere.material.transparent = true;
            obj.glowSphere.material.opacity = showGlow ? 1 : 0;
          }
          if (obj.ring && obj.ring.material) { obj.ring.material.transparent = false; obj.ring.material.opacity = 1; }
          if (obj.label && obj.label.element) {
            if (target) {
              obj.label.element.style.opacity = 1;
              obj.label.visible = true;
            } else {
              obj.label.element.style.opacity = 0;
              obj.label.visible = false;
            }
          }
          if (obj.surfaceGlowSphere) {
            obj.surfaceGlowSphere.visible = showGlow;
            const nodeData = appState.nodeMap.get(n.id);
            const targetScale = nodeData ? (nodeData.sizeScale || 1) : 1;
            obj.surfaceGlowSphere.scale.setScalar(targetScale);
            if (obj.surfaceGlowSphere.material) {
              obj.surfaceGlowSphere.material.transparent = true;
              obj.surfaceGlowSphere.material.opacity = showGlow ? 1 : 0;
            }
          }
        }
      }
      for (let l of affLines) {
        l.line.setVisible(target);
        if (target) {
          l.line.setOpacity(1);
          if (showGlow) {
            // 华丽模式下恢复连线泛光特效
            if (l.line.glowTube) { l.line.glowTube.visible = true; l.line.glowTube.material.transparent = true; l.line.glowTube.material.opacity = 0.9; }
            if (l.line.particlePoints) { l.line.particlePoints.visible = true; l.line.particlePoints.material.opacity = 1; }
          }
          if (l.line.trailPointsMerged) l.line.trailPointsMerged.visible = true;
        } else {
          l.line.setOpacity(0);
          if (showGlow) {
            // 华丽模式下隐藏连线泛光特效
            if (l.line.glowTube) { l.line.glowTube.visible = false; l.line.glowTube.material.opacity = 0; }
            if (l.line.particlePoints) { l.line.particlePoints.visible = false; l.line.particlePoints.material.opacity = 0; }
          }
          if (l.line.trailPointsMerged) l.line.trailPointsMerged.visible = false;
        }
      }
      updateLinesVis();

      if (target) {
        appState.collapsed2D.delete(id);
      } else {
        appState.collapsed2D.add(id);
      }

      // 3D 折叠徽标：折叠后节点名字右侧显示 a/b（a=直接子节点数，b=全部后代数），展开移除
      const badgeNode = appState.nodeMap.get(id);
      if (!target && badgeNode && badgeNode.children && badgeNode.children.length > 0) {
        updateNodeLabelBadge(id, { a: badgeNode.children.length, b: countDescendants(badgeNode) });
      } else {
        updateNodeLabelBadge(id, null);
      }

      if (appState.refresh2DView) appState.refresh2DView();
      if (appState.refreshTreePanel) appState.refreshTreePanel();

      appState._lineToggleAnimActive = false;
      appState._toggleAnimLock.delete(id);
      return;
    }
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ==================== 展开全部节点（一次性按钮） ====================
export const expandAllNodes = withHistory(function () {
  // 收集所有已折叠的父节点（有子节点且第一个子节点不可见）
  let collapsedParents = [];
  for (let [id, node] of appState.nodeMap) {
    if (!node.children || node.children.length === 0) continue;
    let firstChild = node.children[0];
    let firstObj = appState.nodeMeshes.get(firstChild.id);
    if (firstObj && !firstObj.mesh.visible) {
      collapsedParents.push({ id, node });
    }
  }

  if (collapsedParents.length === 0) { showToast("所有节点已是展开状态"); return; }

  // 收集所有受影响的节点和连线（去重）
  let allAffected = new Map(); // id -> node data
  let allAffectedIds = new Set();
  let allLines = [];

  for (let { id: parentId } of collapsedParents) {
    let pNode = appState.nodeMap.get(parentId);
    if (!pNode) continue;
    for (let c of pNode.children) {
      (function collect(n) {
        if (allAffectedIds.has(n.id)) return;
        allAffectedIds.add(n.id);
        allAffected.set(n.id, n);
        if (n.children) n.children.forEach(collect);
      })(c);
    }
  }

  appState.lineItems.forEach(l => {
    if (allAffectedIds.has(l.startId) || allAffectedIds.has(l.endId)) {
      allLines.push(l);
    }
  });

  let count = allAffectedIds.size;
  showToast(`正在展开 ${count} 个节点...`);

  let start = performance.now();
  let dur = Math.min(800, 300 + count * 2); // 节点多时动画稍长

  // 标记连线特效正在参与展开动画，渲染循环跳过其 opacity 覆盖
  appState._lineToggleAnimActive = true;

  // 初始化：全部设为可见但 scale=0, opacity=0
  // 极简模式下泛光特效不参与动画，由渲染循环按模式控制
  const showGlow = !appState.simple3D;
  for (let [nid, n] of allAffected) {
    let obj = appState.nodeMeshes.get(nid);
    if (!obj) continue;
    obj.mesh.visible = true; obj.label.visible = true; obj.visible = true;
    obj.mesh.scale.set(0.05, 0.05, 0.05); if (obj.label) labelAnimScale(obj.label, 0.05);
    if (obj.mesh.material) { obj.mesh.material.transparent = true; obj.mesh.material.opacity = 0; }
    if (obj.glowSphere && obj.glowSphere.material) {
      obj.glowSphere.visible = showGlow;
      obj.glowSphere.material.transparent = true; obj.glowSphere.material.opacity = 0;
    }
    if (obj.ring && obj.ring.material) { obj.ring.material.transparent = true; obj.ring.material.opacity = 0; }
    if (obj.label && obj.label.element) { obj.label.element.style.opacity = 0; }
    if (obj.surfaceGlowSphere) {
      obj.surfaceGlowSphere.visible = showGlow;
      obj.surfaceGlowSphere.scale.set(0.05, 0.05, 0.05);
      if (obj.surfaceGlowSphere.material) {
        obj.surfaceGlowSphere.material.transparent = true;
        obj.surfaceGlowSphere.material.opacity = 0;
      }
    }
  }
  for (let l of allLines) {
    l.line.setVisible(true);
    l.line.setOpacity(0);
    if (showGlow) {
      if (l.line.glowTube) { l.line.glowTube.visible = true; l.line.glowTube.material.transparent = true; l.line.glowTube.material.opacity = 0; }
      if (l.line.particlePoints) { l.line.particlePoints.visible = true; l.line.particlePoints.material.opacity = 0; }
    }
    if (l.line.trailPointsMerged) l.line.trailPointsMerged.visible = false;
  }

  function step(now) {
    let t = Math.min(1, (now - start) / dur);
    let ease = 1 - Math.pow(1 - t, 2);
    let sc = Math.max(0.05, ease);
    let opacity = ease;

    // 极简模式下泛光特效不参与动画（showGlow 已在外层定义）
    for (let [nid] of allAffected) {
      let obj = appState.nodeMeshes.get(nid);
      if (!obj) continue;
      obj.mesh.scale.set(sc, sc, sc);
      if (obj.label) labelAnimScale(obj.label, sc);
      if (obj.mesh.material) { obj.mesh.material.transparent = true; obj.mesh.material.opacity = opacity; }
      if (obj.glowSphere && obj.glowSphere.material && showGlow) { obj.glowSphere.material.transparent = true; obj.glowSphere.material.opacity = opacity; }
      if (obj.ring && obj.ring.material) { obj.ring.material.transparent = true; obj.ring.material.opacity = opacity; }
      if (obj.label && obj.label.element) { obj.label.element.style.opacity = opacity; }
      if (obj.surfaceGlowSphere && showGlow) {
        obj.surfaceGlowSphere.scale.set(sc, sc, sc);
        if (obj.surfaceGlowSphere.material) { obj.surfaceGlowSphere.material.opacity = opacity; }
      }
    }
    for (let l of allLines) {
      l.line.setOpacity(opacity);
      if (showGlow) {
        if (l.line.glowTube) { l.line.glowTube.material.transparent = true; l.line.glowTube.material.opacity = opacity * 0.9; }
        if (l.line.particlePoints) { l.line.particlePoints.material.opacity = opacity; }
      }
    }

    if (t >= 1) {
      // 动画结束：恢复正常状态
      for (let [nid, n] of allAffected) {
        let obj = appState.nodeMeshes.get(nid);
        if (!obj) continue;
        obj.mesh.scale.set(1, 1, 1);
        if (obj.label) labelAnimScale(obj.label, 1); // 恢复标签基准缩放（Sprite 基准 0.02，不能停在动画系数 1）
        if (obj.mesh.material) { obj.mesh.material.transparent = false; obj.mesh.material.opacity = 1; }
        // 泛光球壳：极简模式下不强制显示，由每帧动画循环按模式控制
        const showGlow = !appState.simple3D;
        if (obj.glowSphere && obj.glowSphere.material) {
          obj.glowSphere.visible = showGlow;
          obj.glowSphere.material.transparent = true;
          obj.glowSphere.material.opacity = showGlow ? 1 : 0;
        }
        if (obj.ring && obj.ring.material) { obj.ring.material.transparent = false; obj.ring.material.opacity = 1; }
        if (obj.label && obj.label.element) { obj.label.element.style.opacity = 1; obj.label.visible = true; }
        if (obj.surfaceGlowSphere) {
          const targetScale = n.sizeScale || 1;
          obj.surfaceGlowSphere.scale.setScalar(targetScale);
          if (obj.surfaceGlowSphere.material) {
            obj.surfaceGlowSphere.visible = showGlow;
            obj.surfaceGlowSphere.material.transparent = true;
            obj.surfaceGlowSphere.material.opacity = showGlow ? 1 : 0;
          }
        }
      }
      // 连线：华丽模式下恢复泛光特效
      for (let l of allLines) {
        l.line.setVisible(true);
        l.line.setOpacity(1);
        if (showGlow) {
          if (l.line.glowTube) { l.line.glowTube.visible = true; l.line.glowTube.material.transparent = true; l.line.glowTube.material.opacity = 0.9; }
          if (l.line.particlePoints) { l.line.particlePoints.visible = true; l.line.particlePoints.material.opacity = 1; }
        }
        if (l.line.trailPointsMerged) l.line.trailPointsMerged.visible = true;
      }
      updateLinesVis();
      // 清除所有折叠记录
      for (let { id: parentId } of collapsedParents) {
        appState.collapsed2D.delete(parentId);
        updateNodeLabelBadge(parentId, null);  // 3D 折叠徽标移除
      }
      if (appState.refresh2DView) appState.refresh2DView();
      if (appState.refreshTreePanel) appState.refreshTreePanel();
      appState._lineToggleAnimActive = false;
      showToast(`已展开 ${count} 个节点`);
      return;
    }
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
});
