// ============================================================
//  nodes/interaction.js — 3D 标签内联重命名 + 慢双击检测
//  封装 _lastLabelClick* 状态，避免跨模块 live binding 陷阱
// ============================================================
import * as THREE from 'three';
import { appState } from '../../module0_AppState.js';
import { saveCurrentProjectData } from '../../module2_TreeData.js';

// 慢双击重命名状态
let _lastLabelClickId = null;
let _lastLabelClickTime = 0;
let _labelRenameActive = false;

export function _startLabelRename(div, node) {
  _labelRenameActive = true;
  const originalName = div.textContent;

  const input = document.createElement('input');
  input.type = 'text';
  input.value = originalName;
  input.style.cssText = 'background:#0a1a24;border:1px solid #0ff;color:#fff;padding:0 6px;border-radius:20px;font-size:12px;outline:none;width:80px;text-align:center;';

  div.textContent = '';
  div.appendChild(input);
  input.focus();
  input.select();

  const finish = (save) => {
    _labelRenameActive = false;
    const newName = save ? (input.value.trim() || originalName) : originalName;
    if (newName !== originalName) {
      node.name = newName;
      saveCurrentProjectData();
      if (typeof window.forceRefreshTreePanel === 'function') window.forceRefreshTreePanel();
    }
    div.textContent = node.name;
  };

  input.addEventListener('blur', () => finish(true));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  // 防止点击 input 时冒泡到 div 的 click 处理
  input.addEventListener('click', (e) => e.stopPropagation());
}

// 处理标签 click：选中节点或触发慢双击重命名
// div 可为 null（Sprite 标签模式），node 必须提供
export function handleLabelClick(div, node) {
  if (_labelRenameActive) return;

  const now = Date.now();
  const nodeId = node.id;

  // 慢双击检测：同一选中节点标签在 300-1500ms 内再次单击 → 进入重命名
  if (appState.selectedNodeIds.has(nodeId) && _lastLabelClickId === nodeId
      && now - _lastLabelClickTime > 300 && now - _lastLabelClickTime < 1500) {
    // Sprite 模式：创建临时 DOM input 进行重命名
    _startLabelRenameSprite(node);
    _lastLabelClickId = null;
    _lastLabelClickTime = 0;
    return;
  }

  // 普通单击 → 选中节点
  _lastLabelClickId = nodeId;
  _lastLabelClickTime = now;
  // 同步选中状态（使下一次慢双击检测能通过 selectedNodeIds.has 检查）
  if (!appState.selectedNodeIds.has(nodeId)) {
    appState.selectedNodeIds.clear();
    appState.selectedNodeIds.add(nodeId);
    appState.lastSelectedNodeId = nodeId;
    if (typeof window.forceRefreshTreePanel === 'function') window.forceRefreshTreePanel();
  }
}

// Sprite 标签重命名：在3D overlay层创建临时 DOM input
function _startLabelRenameSprite(node) {
  _labelRenameActive = true;
  const originalName = node.name;
  const obj = appState.nodeMeshes.get(node.id);
  if (!obj || !obj.label) { _labelRenameActive = false; return; }

  // 投影标签位置到屏幕坐标
  const vec = obj.label.position.clone().project(appState.camera);
  const rect = appState.renderer.domElement.getBoundingClientRect();
  const screenX = (vec.x * 0.5 + 0.5) * rect.width + rect.left;
  const screenY = (-vec.y * 0.5 + 0.5) * rect.height + rect.top;

  const input = document.createElement('input');
  input.type = 'text';
  input.value = originalName;
  input.style.cssText = `position:fixed;left:${screenX - 50}px;top:${screenY - 14}px;width:100px;` +
    'background:#0a1a24;border:1px solid #0ff;color:#fff;padding:2px 8px;border-radius:20px;font-size:12px;outline:none;text-align:center;z-index:9999;';
  document.body.appendChild(input);
  input.focus();
  input.select();

  const finish = (save) => {
    _labelRenameActive = false;
    const newName = save ? (input.value.trim() || originalName) : originalName;
    if (newName !== originalName) {
      node.name = newName;
      saveCurrentProjectData();
      if (typeof window.forceRefreshTreePanel === 'function') window.forceRefreshTreePanel();
      // 更新 Sprite 纹理
      _updateLabelSpriteTexture(obj.label, newName);
    }
    input.remove();
  };

  input.addEventListener('blur', () => finish(true));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
}

// 更新 Sprite 标签的纹理文字
function _updateLabelSpriteTexture(sprite, text) {
  const fontSize = 28;
  const padX = 20;
  const padY = 8;
  const bgH = fontSize + padY * 2;

  const tmpCanvas = document.createElement('canvas');
  const tmpCtx = tmpCanvas.getContext('2d');
  tmpCtx.font = `${fontSize}px system-ui, sans-serif`;
  const textWidth = tmpCtx.measureText(text).width;
  const bgW = Math.max(textWidth + padX * 2, bgH * 2.2);

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(bgW);
  canvas.height = Math.ceil(bgH);
  const ctx = canvas.getContext('2d');

  const r = bgH / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(bgW - r, 0);
  ctx.arcTo(bgW, 0, bgW, r, r);
  ctx.lineTo(bgW, bgH - r);
  ctx.arcTo(bgW, bgH, bgW - r, bgH, r);
  ctx.lineTo(r, bgH);
  ctx.arcTo(0, bgH, 0, bgH - r, r);
  ctx.lineTo(0, r);
  ctx.arcTo(0, 0, r, 0, r);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(68,68,68,1)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = `${fontSize}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, bgW / 2, bgH / 2);

  if (sprite.material.map) sprite.material.map.dispose();
  sprite.material.map = new THREE.CanvasTexture(canvas);
  sprite.material.needsUpdate = true;
  sprite.userData._labelText = text;

  // 更新 Sprite 宽高比
  const aspect = bgW / bgH;
  const scale = 0.02;
  sprite.scale.set(scale * aspect, scale, 1);
}
