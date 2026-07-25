// ============================================================
//  MoveMode / event-bindings / connection-controls.js
//  连接模式按钮 + 定位到另一个视图
// ============================================================

import { appState } from '../../../module0_AppState.js';
import { showToast } from '../../../module5_SelectAndEdit.js';
import { hideContextMenu } from '../../../module8_ContextMenu.js';

export function bindConnectionControls() {
  // ---- 连接模式按钮 ----
  document.getElementById('addConnectionContextBtn')?.addEventListener('click', () => {
    if (!appState.contextTargetId) return;
    appState.connectionMode = 'add';
    appState.connectionSourceId = appState.contextTargetId;
    showToast('点击另一个节点建立连接');
    hideContextMenu();
  });
  document.getElementById('removeConnectionContextBtn')?.addEventListener('click', () => {
    if (!appState.contextTargetId) return;
    appState.connectionMode = 'remove';
    appState.connectionSourceId = appState.contextTargetId;
    showToast('点击另一个节点移除连接');
    hideContextMenu();
  });

  // ---- 定位到另一个视图（先切换视图再居中节点） ----
  document.getElementById('locateOtherViewBtn')?.addEventListener('click', () => {
    if (!appState.contextTargetId) return;
    const id = appState.contextTargetId;
    if (appState.is2DView) {
      // 2D -> 切换到3D并居中
      if (appState.hide2DView) appState.hide2DView();
      if (appState.camera && appState.controls) {
        const pos = appState.positions.get(id);
        if (pos) {
          appState.camera.position.set(pos.x, pos.y + 5, pos.z + 5);
          appState.controls.target.copy(pos);
          appState.controls.enableDamping = false;
          appState.controls.update();
          appState.controls.enableDamping = true;
        }
      }
    } else {
      // 3D -> 切换到2D并居中
      if (appState.show2DView) appState.show2DView(true); // 无动画快速切换
      if (appState.focusOnNode2D && appState.positions2D.has(id)) {
        // 延迟一帧等2D视图渲染完成
        requestAnimationFrame(() => appState.focusOnNode2D(id));
      }
    }
    hideContextMenu();
  });
}
