// ============================================================
//  MoveMode / event-bindings / blank-context-menu.js
//  空白处右键菜单：添加根节点/步骤根/块根/视频/块步骤、粘贴、设置、应用库
// ============================================================

import { hideBlankContextMenu } from '../../../module8_ContextMenu.js';
import {
  createNodeInProject, getNextRootName
} from '../node-factory.js';
import { pasteNodes } from '../clipboard.js';

export function bindBlankContextMenu() {
  // ---- 添加根节点按钮 ----
  const addRootBtn = document.getElementById('addRootNodeBtn');
  if (addRootBtn) {
    addRootBtn.addEventListener('click', () => createNodeInProject({ name: getNextRootName(), desc: '📖 顶层节点', sizeScale: 1.5 }));
  }

  const addStepRootBtn = document.getElementById('addStepRootNodeBtn');
  if (addStepRootBtn) {
    addStepRootBtn.addEventListener('click', () => createNodeInProject({ name: '下一步1', desc: '📖 步骤节点', sizeScale: 1.5, isStepFlow: true }));
  }

  const addBlockRootBtn = document.getElementById('addBlockRootNodeBtn');
  if (addBlockRootBtn) {
    addBlockRootBtn.addEventListener('click', () => createNodeInProject({ name: '新块节点', desc: '📦 块编辑器节点', sizeScale: 1.5, nodeType: 'block' }));
  }

  const addVideoRootBtn = document.getElementById('addVideoRootNodeBtn');
  if (addVideoRootBtn) {
    addVideoRootBtn.addEventListener('click', () => createNodeInProject({ name: '新视频块节点', desc: '🎬 视频播放器节点', sizeScale: 1.5, nodeType: 'block', blockType: 'video' }));
  }

  const addBlockStepRootBtn = document.getElementById('addBlockStepRootNodeBtn');
  if (addBlockStepRootBtn) {
    addBlockStepRootBtn.addEventListener('click', () => createNodeInProject({ name: '块步骤 1', desc: '📦 块编辑器步骤节点', sizeScale: 1.5, nodeType: 'block', isStepFlow: true }));
  }

  // ---- 粘贴节点 ----
  const pasteBtn = document.getElementById('pasteNodeBtn');
  if (pasteBtn) {
    pasteBtn.addEventListener('click', () => {
      pasteNodes();
      hideBlankContextMenu();
    });
  }

  // ---- 设置 ----
  const blankSettingsBtn = document.getElementById('blankSettingsBtn');
  if (blankSettingsBtn) {
    blankSettingsBtn.addEventListener('click', () => {
      hideBlankContextMenu();
      const glowBtn = document.getElementById('toggleNodeGlowBtn');
      if (glowBtn) glowBtn.click();
    });
  }

  // ---- 应用库操作 ----
  const blankAppImportBtn = document.getElementById('blankAppImportBtn');
  if (blankAppImportBtn) {
    blankAppImportBtn.addEventListener('click', () => {
      hideBlankContextMenu();
      if (window.AppPanel) window.AppPanel._showImportDialog();
    });
  }

  const blankAppExternalBtn = document.getElementById('blankAppExternalBtn');
  if (blankAppExternalBtn) {
    blankAppExternalBtn.addEventListener('click', () => {
      hideBlankContextMenu();
      if (window.AppPanel) window.AppPanel._addExternalApp();
    });
  }
}
