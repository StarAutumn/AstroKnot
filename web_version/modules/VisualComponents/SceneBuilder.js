// ============================================================
//  模块6 子模块：场景构建 (从树数据构建完整 3D 场景)
// ============================================================
import { appState } from '../module0_AppState.js';
import { createNodeMesh, destroyNodeMesh, generateRandomPosition } from './Nodes.js';
import { rebuildAllLines } from './LineManager.js';

export function buildSceneFromTree() {
  for (let id of appState.nodeMeshes.keys()) destroyNodeMesh(id);
  function traverse(node) {
    if (node.id !== appState.VIRTUAL_ROOT_ID) {
      let pos = appState.positions.get(node.id);
      if (!pos) {
        let existing = Array.from(appState.positions.values());
        pos = generateRandomPosition(existing);
        appState.positions.set(node.id, pos);
      }
      createNodeMesh(node, pos);
    }
    if (node.children) node.children.forEach(traverse);
  }
  traverse(appState.methodsTree);
  rebuildAllLines();
}
