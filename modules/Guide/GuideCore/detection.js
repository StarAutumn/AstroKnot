// ============================================================
//  GuideCore/detection.js — GuideStateMachine 的操作检测方法集
//  startDetection（按 waitFor 分派 17 种操作检测）/ stopDetection /
//  saveControlsState / configureControls / restoreControls / destroy
//  以原型混入方式并入 GuideStateMachine，方法体仅依赖 this 与
//  window.appState，自 GuideCore.js 逐字迁移
// ============================================================

export const guideDetectionMethods = {

  // ---- 操作检测核心 ----
  /**
   * 为当前步骤启动操作检测，检测到后回调 onComplete
   * @param {Function} onComplete - 检测到操作完成时的回调
   * @param {object} guide3D - Guide3D 实例
   */
  startDetection(onComplete, guide3D) {
    this.stopDetection();
    const step = this.currentStep;
    if (!step || !step.waitFor) return;

    const st = window.appState;
    const detector = this._detector;

    switch (step.waitFor) {

      // --- 旋转视角：检测相机位置变化超过阈值 ---
      case 'cameraRotate':
        if (st && st.camera) {
          const initPos = st.camera.position.clone();
          const initTarget = st.controls?.target ? st.controls.target.clone() : null;
          const threshold = 0.6;
          detector.poll(
            () => {
              if (!st.camera) return false;
              const dp = st.camera.position.distanceTo(initPos);
              if (initTarget && st.controls?.target) {
                const dt = st.controls.target.distanceTo(initTarget);
                return (dp > threshold || dt > 0.4);
              }
              return dp > threshold;
            },
            onComplete,
            'cameraRotate'
          );
        }
        break;

      // --- 键盘飞行：W/A/S/D/空格/Ctrl，每按一个就更新进度 ---
      case 'keyboardNav': {
        const TARGET_KEYS = new Map([
          ['KeyW',     { label: 'W' }],
          ['KeyA',     { label: 'A' }],
          ['KeyS',     { label: 'S' }],
          ['KeyD',     { label: 'D' }],
          ['Space',    { label: '空格' }],
          ['ControlLeft',  { label: 'Ctrl' }],
          ['ControlRight', { label: 'Ctrl' }],
        ]);
        const pressed = new Set();
        const progressEl = document.getElementById('guideKeyProgress');

        const updateProgress = () => {
          // 合并左右 Ctrl 只算一次
          const unique = new Set();
          for (const key of pressed) {
            if (key === 'ControlLeft' || key === 'ControlRight') {
              unique.add('Ctrl');
            } else {
              unique.add(key);
            }
          }
          const count = unique.size;
          if (progressEl) {
            progressEl.innerHTML = `⏳ 已尝试: <strong style="color:#0ff;">${count}</strong> / 6 个键`;
          }
          if (count >= 6) {
            if (progressEl) {
              progressEl.innerHTML = '✅ <strong style="color:#5fefcf;">全部完成！</strong>';
            }
            document.removeEventListener('keydown', onKey, true);
            setTimeout(onComplete, 400);
          }
        };

        const onKey = (e) => {
          if (TARGET_KEYS.has(e.code)) {
            // 仅记录不拦截，让 Keyboard.js 正常处理移动
            pressed.add(e.code);
            updateProgress();
          }
        };

        document.addEventListener('keydown', onKey, true);
        detector.onCleanup(() => {
          document.removeEventListener('keydown', onKey, true);
        });

        // 兜底：如果已经按了部分键但用户卡住了，30s 后允许通过（至少 3 个即可）
        let fallbackTimer = setTimeout(() => {
          const unique = new Set();
          for (const key of pressed) {
            unique.add(key === 'ControlLeft' || key === 'ControlRight' ? 'Ctrl' : key);
          }
          if (unique.size >= 3) {
            updateProgress();
          }
        }, 30000);
        detector.onCleanup(() => clearTimeout(fallbackTimer));

        break;
      }

      // --- 缩放：检测相机到目标的距离变化 ---
      case 'cameraZoom':
        if (st && st.camera && st.controls) {
          const initDist = st.camera.position.distanceTo(st.controls.target);
          detector.poll(
            () => {
              if (!st.camera || !st.controls) return false;
              const curDist = st.camera.position.distanceTo(st.controls.target);
              return Math.abs(curDist - initDist) > 0.8;
            },
            onComplete,
            'cameraZoom'
          );
        }
        break;

      // --- 选中节点 ---
      case 'nodeSelect':
        if (st) {
          // 先确保没有已选中的节点干扰
          const alreadySelected = st.selectedNodeIds && st.selectedNodeIds.size > 0;
          if (alreadySelected) {
            // 已经选了，稍微延迟再触发（给用户看到反馈的时间）
            setTimeout(onComplete, 400);
          } else {
            detector.poll(
              () => st.selectedNodeIds && st.selectedNodeIds.size > 0,
              () => setTimeout(onComplete, 300),
              'nodeSelect'
            );
          }
        }
        break;

      // --- 右键菜单 ---
      case 'contextMenu': {
        const menu = document.getElementById('nodeContextMenu');
        if (menu) {
          detector.observeStyle(menu, () => setTimeout(onComplete, 300));
        }
        break;
      }

      // --- 创建新节点 ---
      case 'nodeCreated':
        if (st && st.nodeMap) {
          detector.snapshot('nodeCount', st.nodeMap.size);
          detector.poll(
            () => st.nodeMap && st.nodeMap.size > detector._initialValues['nodeCount'],
            () => setTimeout(onComplete, 500),
            'nodeCreated'
          );
        }
        break;

      // --- 添加连线 ---
      case 'connectionAdded':
        if (st) {
          const initCount = st.crossEdges ? st.crossEdges.length : 0;
          detector.snapshot('crossEdgeCount', initCount);
          detector.poll(
            () => {
              const cur = st.crossEdges ? st.crossEdges.length : 0;
              return cur > initCount;
            },
            () => setTimeout(onComplete, 400),
            'connectionAdded'
          );
        }
        break;

      // --- 删除连线：crossEdges 数量减少即完成 ---
      case 'connectionRemoved':
        if (st) {
          const initCount = st.crossEdges ? st.crossEdges.length : 0;
          detector.snapshot('crossEdgeCountDel', initCount);
          detector.poll(
            () => {
              const cur = st.crossEdges ? st.crossEdges.length : 0;
              return cur < initCount;
            },
            () => setTimeout(onComplete, 400),
            'connectionRemoved'
          );
        }
        break;

      // --- 2D 框选 / Ctrl+多选（≥2 个节点） ---
      case 'multiSelect2D':
        if (st) {
          if (st.selectedNodeIds && st.selectedNodeIds.size > 0) {
            st.clearSelected();
          }
          detector.poll(
            () => st.selectedNodeIds && st.selectedNodeIds.size >= 2,
            () => setTimeout(onComplete, 400),
            'multiSelect2D'
          );
        }
        break;

      // --- 搜索：输入关键词并点击下拉结果 ---
      case 'searchUsed': {
        const dropdown = document.getElementById('searchDropdown');
        if (dropdown) {
          // 监听下拉菜单内的 click 事件（用户点了某个搜索结果 div）
          const onClick = () => {
            // 点击了下拉中的任意 div（即搜索结果项），等待回调执行后触发
            setTimeout(onComplete, 500);
          };
          dropdown.addEventListener('click', onClick, true);
          detector.onCleanup(() => {
            dropdown.removeEventListener('click', onClick, true);
          });
        }
        // 兜底：搜索后 selectedNodeIds 变化也视为完成
        if (st && st.selectedNodeIds) {
          const initSelected = st.selectedNodeIds.size || 0;
          detector.poll(
            () => (st.selectedNodeIds && st.selectedNodeIds.size > initSelected),
            () => setTimeout(onComplete, 400),
            'searchNodeSelected'
          );
        }
        break;
      }

      // --- 打开主菜单 ---
      case 'menuOpened': {
        const menu = document.getElementById('astroKnotMenu');
        if (menu) {
          detector.observeStyle(menu, () => setTimeout(onComplete, 300));
        }
        // 也监听按钮点击
        const btn = document.getElementById('astroKnotBtn');
        if (btn) {
          detector.listenOnce(btn, 'click', () => setTimeout(onComplete, 600));
        }
        break;
      }

      // --- 切换到 2D 视图 ---
      case 'switchTo2D':
        if (st) {
          // 已经在 2D 模式了？无操作直接下一步
          if (st.is2DView) { setTimeout(onComplete, 300); break; }
          detector.poll(
            () => !!st.is2DView,
            () => setTimeout(onComplete, 300),
            'switchTo2D'
          );
        }
        break;

      // --- 2D 视图导航（缩放或平移） ---
      case 'navigate2D':
        if (st && st.view2DTransform) {
          const t = st.view2DTransform;
          const init = { ox: t.offsetX || 0, oy: t.offsetY || 0, s: t.scale || 1 };
          const threshold = 10; // 平移阈值像素
          detector.poll(
            () => {
              if (!st.view2DTransform) return false;
              const cur = st.view2DTransform;
              const dx = Math.abs((cur.offsetX || 0) - init.ox);
              const dy = Math.abs((cur.offsetY || 0) - init.oy);
              const ds = Math.abs((cur.scale || 1) - init.s);
              return (dx > threshold || dy > threshold || ds > 0.05);
            },
            () => setTimeout(onComplete, 400),
            'navigate2D'
          );
        }
        break;

      // --- 折叠/展开子节点：检测 collapsed2D Set 或 node visibility 变化 ---
      case 'childrenToggled': {
        if (st) {
          // 快照 2D 折叠状态
          const initCollapsed = st.collapsed2D ? new Set(st.collapsed2D) : new Set();
          // 快照 3D 节点可见性
          const initVisible = new Set();
          if (st.nodeMap) {
            for (const [id, node] of st.nodeMap) {
              if (node.visible !== false) initVisible.add(id);
            }
          }
          detector.poll(
            () => {
              // 2D: collapsed2D 集合变化
              if (st.collapsed2D) {
                if (st.collapsed2D.size !== initCollapsed.size) return true;
                for (const id of st.collapsed2D) {
                  if (!initCollapsed.has(id)) return true;
                }
              }
              // 3D: 节点可见性变化
              if (st.nodeMap) {
                const curVisible = new Set();
                for (const [id, node] of st.nodeMap) {
                  if (node.visible !== false) curVisible.add(id);
                }
                if (curVisible.size !== initVisible.size) return true;
                for (const id of curVisible) {
                  if (!initVisible.has(id)) return true;
                }
              }
              return false;
            },
            () => setTimeout(onComplete, 400),
            'childrenToggled'
          );
        }
        break;
      }

      // --- 2D 拖拽定位节点：检测 positions2D 坐标变化 ---
      case 'nodeDragged2D': {
        if (st && st.positions2D) {
          const initPositions = new Map();
          for (const [id, pos] of st.positions2D.entries()) {
            if (pos) initPositions.set(id, { x: pos.x, y: pos.y });
          }
          detector.poll(
            () => {
              if (!st.positions2D) return false;
              for (const [id, pos] of st.positions2D.entries()) {
                const initPos = initPositions.get(id);
                if (initPos && pos) {
                  if (Math.abs(pos.x - initPos.x) > 5 || Math.abs(pos.y - initPos.y) > 5) return true;
                } else if (!initPos && pos) {
                  return true;  // 新增位置
                }
              }
              return false;
            },
            () => setTimeout(onComplete, 400),
            'nodeDragged2D'
          );
        }
        break;
      }

      // --- 2D 自动排列：多个节点 positions2D 同时变化 ---
      case 'autoArrange2D': {
        if (st && st.positions2D) {
          const initPositions = new Map();
          for (const [id, pos] of st.positions2D.entries()) {
            if (pos) initPositions.set(id, { x: pos.x, y: pos.y });
          }
          detector.poll(
            () => {
              if (!st.positions2D) return false;
              let changedCount = 0;
              for (const [id, pos] of st.positions2D.entries()) {
                const initPos = initPositions.get(id);
                if (initPos && pos) {
                  if (Math.abs(pos.x - initPos.x) > 2 || Math.abs(pos.y - initPos.y) > 2) changedCount++;
                }
              }
              return changedCount >= 3;
            },
            () => setTimeout(onComplete, 500),
            'autoArrange2D'
          );
        }
        break;
      }

      // --- 切回 3D 视图 ---
      case 'switchTo3D':
        if (st) {
          // 已经在 3D 模式？无操作直接下一步
          if (!st.is2DView) { setTimeout(onComplete, 300); break; }
          detector.poll(
            () => !st.is2DView,
            () => setTimeout(onComplete, 300),
            'switchTo3D'
          );
        }
        break;

      // --- 3D 移动节点：检测任意节点 3D 位置变化 ---
      case 'nodeMoved3D': {
        if (st && st.positions) {
          const initPositions = new Map();
          for (const [id, pos] of st.positions.entries()) {
            if (pos) initPositions.set(id, pos.clone());
          }
          detector.poll(
            () => {
              if (!st.positions) return false;
              for (const [id, pos] of st.positions.entries()) {
                const initPos = initPositions.get(id);
                if (initPos && pos && pos.distanceTo(initPos) > 0.5) return true;
              }
              return false;
            },
            () => setTimeout(onComplete, 400),
            'nodeMoved3D'
          );
        }
        break;
      }

      // --- 3D 按 2D 布局排列：多个节点 positions 同时变化 ---
      case 'arrange3D2D': {
        if (st && st.positions) {
          const initPositions = new Map();
          for (const [id, pos] of st.positions.entries()) {
            if (pos) initPositions.set(id, pos.clone());
          }
          detector.poll(
            () => {
              if (!st.positions) return false;
              let changedCount = 0;
              for (const [id, pos] of st.positions.entries()) {
                const initPos = initPositions.get(id);
                if (initPos && pos && pos.distanceTo(initPos) > 0.3) changedCount++;
              }
              return changedCount >= 3;
            },
            () => setTimeout(onComplete, 500),
            'arrange3D2D'
          );
        }
        break;
      }

      // --- 打开富文本编辑器 ---
      case 'editorOpened': {
        const modal = document.getElementById('richEditorModal');
        if (modal) {
          detector.observeStyle(modal, () => setTimeout(onComplete, 300));
        }
        break;
      }

      // --- 关闭编辑器 ---
      case 'editorClosed': {
        const modal = document.getElementById('richEditorModal');
        if (modal) {
          // 初始检查是否已经隐藏
          const checkHidden = () => {
            const style = window.getComputedStyle(modal);
            if (style.display === 'none' || modal.style.display === 'none') {
              setTimeout(onComplete, 300);
              return true;
            }
            return false;
          };
          if (!checkHidden()) {
            detector.observeStyle(modal, () => setTimeout(onComplete, 300));
          }
        }
        break;
      }

      // --- 打开设置面板（点击 ⚙️ 设置按钮）---
      case 'settingsOpened': {
        const settingsBtn = document.getElementById('toggleNodeGlowBtn');
        const settingsPopup = document.getElementById('settingsPopup');
        if (settingsBtn && settingsPopup) {
          // 设置打开后自动关闭 AstroKnot 菜单，避免遮挡设置面板
          const closeMenu = () => {
            const menu = document.getElementById('astroKnotMenu');
            if (menu && menu.classList.contains('show')) {
              menu.classList.add('hiding');
              menu.addEventListener('animationend', function onEnd() {
                menu.removeEventListener('animationend', onEnd);
                menu.classList.remove('show', 'hiding');
              });
            }
          };
          // 方式1：监听设置按钮的点击事件
          detector.listenOnce(settingsBtn, 'click', () => { closeMenu(); setTimeout(onComplete, 500); });
          // 兜底：轮询检测设置面板变为可见
          detector.poll(
            () => {
              const style = window.getComputedStyle(settingsPopup);
              return style.display !== 'none' && style.visibility !== 'hidden';
            },
            () => { closeMenu(); setTimeout(onComplete, 300); },
            'settingsOpened'
          );
        }
        break;
      }

      // --- 打开使用帮助（设置面板中点击「📖 使用帮助」标签页）---
      case 'helpTabOpened': {
        const settingsPopup = document.getElementById('settingsPopup');
        if (settingsPopup) {
          // 监听设置面板内「使用帮助」标签页的点击
          const helpTab = settingsPopup.querySelector('.settings-tab[data-tab="help"]');
          if (helpTab) {
            detector.listenOnce(helpTab, 'click', () => setTimeout(onComplete, 400));
          }
          // 兜底：检测 help 面板变为可见
          const helpPanel = settingsPopup.querySelector('.settings-tab-panel[data-panel="help"]');
          if (helpPanel) {
            detector.poll(
              () => {
                const style = window.getComputedStyle(helpPanel);
                return style.display !== 'none';
              },
              () => setTimeout(onComplete, 300),
              'helpTabOpened'
            );
          }
        }
        break;
      }

      default:
        break;
    }
  },

  /** 停止当前步骤的操作检测 */
  stopDetection() {
    this._detector.cleanup();
  },

  /** 保存并禁用 controls 原始状态 */
  saveControlsState() {
    const st = window.appState;
    if (!st || !st.controls) return;
    this._origControlsState = {
      enableRotate: st.controls.enableRotate,
      enableZoom: st.controls.enableZoom,
      enablePan: st.controls.enablePan,
    };
  },

  /** 为当前步骤配置 controls（action 步骤通常需要解禁） */
  configureControls() {
    const step = this.currentStep;
    const st = window.appState;
    if (!st || !st.controls) return;

    if (step.unlockControls) {
      st.controls.enableRotate = true;
      st.controls.enableZoom = true;
      st.controls.enablePan = true;
    } else {
      st.controls.enableRotate = false;
      st.controls.enableZoom = false;
      st.controls.enablePan = false;
    }
  },

  /** 恢复 controls 原始状态 */
  restoreControls() {
    if (!this._origControlsState) return;
    const st = window.appState;
    if (!st || !st.controls) return;
    st.controls.enableRotate = this._origControlsState.enableRotate;
    st.controls.enableZoom = this._origControlsState.enableZoom;
    st.controls.enablePan = this._origControlsState.enablePan;
    this._origControlsState = null;
  },

  /** 销毁 */
  destroy() {
    this.stopDetection();
    this._listeners = {};
    this.active = false;
  },
};
