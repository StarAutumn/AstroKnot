// ============================================================
//  TreeData/web-mode：Web（非 Electron）环境 localStorage 持久化与回收站（模块2拆分）
// ============================================================
import * as THREE from 'three';
import { appState } from '../module0_AppState.js';
import { loadProject } from './loadProject.js';
import { renderProjectList } from './project-ui.js';

// ── Web 环境 localStorage 持久化 ──
export const _WEB_PROJECTS_KEY = 'astroknot_web_projects';

export function _persistToLocalStorage() {
  if (window.__ELECTRON__) return;
  try {
    const serializable = appState.projects.map(p => ({
      id: p.id,
      name: p.name,
      folderPath: p.folderPath || null,
      data: {
        ...p.data,
        positions: p.data.positions ? [...p.data.positions.entries()].map(([k, v]) => [k, { x: v.x, y: v.y, z: v.z }]) : [],
        positions2D: p.data.positions2D || {},
        collapsed2D: p.data.collapsed2D || [],
        nodeRichContents: p.data.nodeRichContents || {},
        nodeOverlayImages: p.data.nodeOverlayImages || {},
        nodeHtmlSources: p.data.nodeHtmlSources || {},
        nodeFileSystems: p.data.nodeFileSystems || {},
        layers: p.data.layers || [],
        currentLayerId: p.data.currentLayerId || null,
        cameraView: p.data.cameraView || { position: { x: 0, y: 4.5, z: 8 }, target: { x: 0, y: 0.2, z: 0 } }
      }
    }));
    localStorage.setItem(_WEB_PROJECTS_KEY, JSON.stringify(serializable));
    localStorage.setItem(_WEB_PROJECTS_KEY + '_current', appState.currentProjectId || '');
  } catch (e) {
    console.warn('[Web持久化] 保存失败:', e);
  }
}

export function _restoreFromLocalStorage() {
  if (window.__ELECTRON__) return null;
  try {
    const raw = localStorage.getItem(_WEB_PROJECTS_KEY);
    if (!raw) return null;
    const projects = JSON.parse(raw);
    if (!Array.isArray(projects) || projects.length === 0) return null;
    for (const p of projects) {
      if (p.data.positions && Array.isArray(p.data.positions)) {
        const map = new Map();
        for (const [k, v] of p.data.positions) {
          map.set(k, new THREE.Vector3(v.x, v.y, v.z));
        }
        p.data.positions = map;
      }
      if (p.data.layers && Array.isArray(p.data.layers)) {
        p.data.layers = p.data.layers.map(l => ({
          ...l,
          nodeIds: new Set(l.nodeIds || []),
          positions2D: new Map(Object.entries(l.positions2D || {}))
        }));
      }
    }
    return projects;
  } catch (e) {
    console.warn('[Web持久化] 恢复失败:', e);
    return null;
  }
}

// ── Web 环境回收站（localStorage）──
const _WEB_TRASH_KEY = 'astroknot_web_trash';

/** 将项目移入 Web 回收站（proj 已从 appState.projects 移除前调用，或传入副本） */
export function _moveToWebTrash(proj) {
  if (window.__ELECTRON__) return;
  try {
    const trash = JSON.parse(localStorage.getItem(_WEB_TRASH_KEY) || '[]');
    // 序列化 positions Map → 数组（与 _persistToLocalStorage 一致）
    const serializable = {
      id: proj.id,
      name: proj.name,
      folderPath: proj.folderPath || null,
      deletedAt: new Date().toISOString(),
      data: {
        ...proj.data,
        positions: proj.data.positions ? [...proj.data.positions.entries()].map(([k, v]) => [k, { x: v.x, y: v.y, z: v.z }]) : [],
        positions2D: proj.data.positions2D || {},
        collapsed2D: proj.data.collapsed2D || [],
        nodeRichContents: proj.data.nodeRichContents || {},
        nodeOverlayImages: proj.data.nodeOverlayImages || {},
        nodeHtmlSources: proj.data.nodeHtmlSources || {},
        nodeFileSystems: proj.data.nodeFileSystems || {},
        layers: proj.data.layers || [],
        currentLayerId: proj.data.currentLayerId || null,
        cameraView: proj.data.cameraView || { position: { x: 0, y: 4.5, z: 8 }, target: { x: 0, y: 0.2, z: 0 } }
      }
    };
    trash.push(serializable);
    localStorage.setItem(_WEB_TRASH_KEY, JSON.stringify(trash));
    _persistToLocalStorage();
  } catch (e) {
    console.warn('[Web回收站] 移入失败:', e);
  }
}

/** 获取 Web 回收站列表（返回反序列化后的项目数组） */
export function _getWebTrash() {
  if (window.__ELECTRON__) return [];
  try {
    const raw = localStorage.getItem(_WEB_TRASH_KEY);
    if (!raw) return [];
    const trash = JSON.parse(raw);
    // 反序列化 positions 数组 → Map<Vector3>，layers → Set/Map
    for (const p of trash) {
      if (p.data.positions && Array.isArray(p.data.positions)) {
        const map = new Map();
        for (const [k, v] of p.data.positions) {
          map.set(k, new THREE.Vector3(v.x, v.y, v.z));
        }
        p.data.positions = map;
      }
      if (p.data.layers && Array.isArray(p.data.layers)) {
        p.data.layers = p.data.layers.map(l => ({
          ...l,
          nodeIds: new Set(l.nodeIds || []),
          positions2D: new Map(Object.entries(l.positions2D || {}))
        }));
      }
    }
    return trash;
  } catch (e) {
    console.warn('[Web回收站] 读取失败:', e);
    return [];
  }
}

/** 从 Web 回收站恢复项目（按索引），加入 appState.projects */
export function _restoreWebTrash(index) {
  if (window.__ELECTRON__) return null;
  try {
    const trash = JSON.parse(localStorage.getItem(_WEB_TRASH_KEY) || '[]');
    if (index < 0 || index >= trash.length) return null;
    const item = trash.splice(index, 1)[0];
    localStorage.setItem(_WEB_TRASH_KEY, JSON.stringify(trash));
    // 反序列化并加入项目列表
    if (item.data.positions && Array.isArray(item.data.positions)) {
      const map = new Map();
      for (const [k, v] of item.data.positions) {
        map.set(k, new THREE.Vector3(v.x, v.y, v.z));
      }
      item.data.positions = map;
    }
    if (item.data.layers && Array.isArray(item.data.layers)) {
      item.data.layers = item.data.layers.map(l => ({
        ...l,
        nodeIds: new Set(l.nodeIds || []),
        positions2D: new Map(Object.entries(l.positions2D || {}))
      }));
    }
    delete item.deletedAt;
    // 重命名 overlayImages → nodeOverlayImages（如有）
    if (item.data.overlayImages && !item.data.nodeOverlayImages) {
      item.data.nodeOverlayImages = item.data.overlayImages;
      delete item.data.overlayImages;
    }
    appState.projects.push(item);
    if (!appState.currentProjectId) {
      loadProject(item.id);
    } else {
      renderProjectList();
    }
    _persistToLocalStorage();
    return item.id;
  } catch (e) {
    console.warn('[Web回收站] 恢复失败:', e);
    return null;
  }
}

/** 永久删除 Web 回收站中的单个项目（按索引） */
export function _permanentDeleteWebTrash(index) {
  if (window.__ELECTRON__) return;
  try {
    const trash = JSON.parse(localStorage.getItem(_WEB_TRASH_KEY) || '[]');
    if (index < 0 || index >= trash.length) return;
    trash.splice(index, 1);
    localStorage.setItem(_WEB_TRASH_KEY, JSON.stringify(trash));
  } catch (e) {
    console.warn('[Web回收站] 永久删除失败:', e);
  }
}

/** 清空 Web 回收站 */
export function _emptyWebTrash() {
  if (window.__ELECTRON__) return;
  localStorage.removeItem(_WEB_TRASH_KEY);
}