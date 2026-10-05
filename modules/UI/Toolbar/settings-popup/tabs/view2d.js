// ============================================================
//  UI/Toolbar/settings-popup/tabs/view2d.js — 「2D 视图」标签页
// ============================================================
//  - view2dPanelHtml：面板 HTML（节点默认尺寸 / 节点间距 / 网格大小）
//  - bind2DViewTab：2D 视图节点宽度/高度、水平/垂直间距、网格大小绑定
// ============================================================
//  
// ============================================================
import { appState } from '../../../../module0_AppState.js';
import { saveSettingsToStorage } from '../../../Theme.js';

export const view2dPanelHtml = `  <div class="settings-tab-panel" data-panel="2dview" style="display:none; padding:8px 16px 14px;">
    <div class="setting-section">
      <div class="setting-label">\uD83D\uDCCF \u8282\u70B9\u9ED8\u8BA4\u5C3A\u5BF8</div>
      <div style="display:flex; gap:10px;">
        <div style="flex:1;">
          <span style="font-size:11px; color:var(--text-secondary);">\u5BBD\u5EA6</span>
          <input type="number" class="node-width2d-input" value="120" min="60" max="200" step="5"
            style="width:100%; background:transparent; border:1px solid var(--divider); border-radius:4px; color:var(--accent-light); font-size:12px; padding:3px 8px; height:26px; outline:none;">
        </div>
        <div style="flex:1;">
          <span style="font-size:11px; color:var(--text-secondary);">\u9AD8\u5EA6</span>
          <input type="number" class="node-height2d-input" value="40" min="20" max="80" step="5"
            style="width:100%; background:transparent; border:1px solid var(--divider); border-radius:4px; color:var(--accent-light); font-size:12px; padding:3px 8px; height:26px; outline:none;">
        </div>
      </div>
    </div>
    <div class="setting-section" style="margin-top:12px; padding-top:12px; border-top:1px solid var(--divider);">
      <div class="setting-label">\uD83D\uDCCF \u8282\u70B9\u95F4\u8DDD</div>
      <div style="display:flex; gap:10px;">
        <div style="flex:1;">
          <span style="font-size:11px; color:var(--text-secondary);">\u6C34\u5E73</span>
          <input type="number" class="hgap2d-input" value="60" min="20" max="120" step="5"
            style="width:100%; background:transparent; border:1px solid var(--divider); border-radius:4px; color:var(--accent-light); font-size:12px; padding:3px 8px; height:26px; outline:none;">
        </div>
        <div style="flex:1;">
          <span style="font-size:11px; color:var(--text-secondary);">\u5782\u76F4</span>
          <input type="number" class="vgap2d-input" value="20" min="10" max="60" step="5"
            style="width:100%; background:transparent; border:1px solid var(--divider); border-radius:4px; color:var(--accent-light); font-size:12px; padding:3px 8px; height:26px; outline:none;">
        </div>
      </div>
    </div>
    <div class="setting-section" style="margin-top:12px; padding-top:12px; border-top:1px solid var(--divider);">
      <div style="display:flex; align-items:center; gap:10px;">
        <span style="font-size:11px; min-width:50px;">\u7F51\u683C\u5927\u5C0F</span>
        <input type="number" class="gridsize2d-input" value="40" min="20" max="80" step="5"
          style="flex:1; background:transparent; border:1px solid var(--divider); border-radius:4px; color:var(--accent-light); font-size:12px; padding:3px 8px; height:26px; outline:none;">
      </div>
    </div>
    <div style="font-size:10px; color:var(--text-secondary); margin-top:8px;">\u26A0 \u9700\u8981\u91CD\u65B0\u52A0\u8F7D2D\u89C6\u56FE\u751F\u6548</div>
  </div>`

export function bind2DViewTab(ctx) {
  const { popup } = ctx;

  // ── 2D 视图：节点宽度 ──
  const nw2d = popup.querySelector('.node-width2d-input');
  if (nw2d) {
    nw2d.addEventListener('change', () => {
      appState.nodeWidth2D = parseInt(nw2d.value);
      saveSettingsToStorage();
    });
  }

  // ── 2D 视图：节点高度 ──
  const nh2d = popup.querySelector('.node-height2d-input');
  if (nh2d) {
    nh2d.addEventListener('change', () => {
      appState.nodeHeight2D = parseInt(nh2d.value);
      saveSettingsToStorage();
    });
  }

  // ── 2D 视图：水平间距 ──
  const hg2d = popup.querySelector('.hgap2d-input');
  if (hg2d) {
    hg2d.addEventListener('change', () => {
      appState.hGap2D = parseInt(hg2d.value);
      saveSettingsToStorage();
    });
  }

  // ── 2D 视图：垂直间距 ──
  const vg2d = popup.querySelector('.vgap2d-input');
  if (vg2d) {
    vg2d.addEventListener('change', () => {
      appState.vGap2D = parseInt(vg2d.value);
      saveSettingsToStorage();
    });
  }

  // ── 2D 视图：网格大小 ──
  const gs2d = popup.querySelector('.gridsize2d-input');
  if (gs2d) {
    gs2d.addEventListener('change', () => {
      appState.gridSize2D = parseInt(gs2d.value);
      saveSettingsToStorage();
    });
  }
}

