// ============================================================
//  Guide3D.js — 3D 场景引导：相机动画 + CSS2D 指示器 + 节点高亮
// ============================================================
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

/**
 * 3D 场景引导控制器
 */
export class Guide3D {
  constructor() {
    this._indicator = null;       // CSS2D 指示器标签
    this._arrowSprite = null;     // 闪烁箭头 sprite
    this._highlightedNode = null; // 当前高亮的节点
    this._originalEmissive = null;
    this._originalScale = null;
    this._controlsLocked = false;
    this._pulseInterval = null;
  }

  /**
   * 获取 appState
   */
  get state() {
    return window.appState;
  }

  /**
   * 平滑飞行相机到目标位置
   * @param {THREE.Vector3} targetPos - 目标位置
   * @param {THREE.Vector3} targetLookAt - 注视点
   * @param {number} duration - 动画时长（秒）
   * @returns {Promise<void>}
   */
  flyCameraTo(targetPos, targetLookAt, duration = 1.2) {
    return new Promise((resolve) => {
      const st = this.state;
      if (!st || !st.camera || !st.controls) {
        resolve();
        return;
      }

      const camera = st.camera;
      const controls = st.controls;
      const startPos = camera.position.clone();
      const startTarget = controls.target.clone();
      const startTime = performance.now();
      const durMs = duration * 1000;

      // 临时禁用阻尼以保证平滑
      controls.enableDamping = false;

      const animate = (now) => {
        const elapsed = now - startTime;
        const t = Math.min(elapsed / durMs, 1.0);
        // easeInOutCubic
        const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

        camera.position.lerpVectors(startPos, targetPos, ease);
        controls.target.lerpVectors(startTarget, targetLookAt, ease);
        controls.update();

        if (t < 1) {
          requestAnimationFrame(animate);
        } else {
          controls.enableDamping = true;
          resolve();
        }
      };

      requestAnimationFrame(animate);
    });
  }

  /** 重置相机到默认视角 */
  async resetCameraView() {
    const defaultPos = new THREE.Vector3(0, 4.5, 8);
    const defaultTarget = new THREE.Vector3(0, 0.2, 0);
    await this.flyCameraTo(defaultPos, defaultTarget, 1.0);
  }

  /**
   * 高亮一个 3D 节点
   * @param {string} nodeId
   */
  highlightNode(nodeId) {
    this.clearHighlight();
    const st = this.state;
    if (!st || !st.nodeMeshes) return;

    const mesh = st.nodeMeshes.get(nodeId);
    if (!mesh) return;

    this._highlightedNode = mesh;

    // 保存原始状态
    if (mesh.material && mesh.material.emissive) {
      this._originalEmissive = mesh.material.emissive.getHex();
      mesh.material.emissive.setHex(0x00ffff);
      mesh.material.emissiveIntensity = 1.2;
    }
    this._originalScale = mesh.scale.clone();
    // 脉冲动画：周期性缩放
    const pulseSpeed = 800;
    const baseScale = this._originalScale.clone();
    this._pulseInterval = setInterval(() => {
      if (!this._highlightedNode) {
        clearInterval(this._pulseInterval);
        return;
      }
      const phase = (Date.now() % pulseSpeed) / pulseSpeed; // 0~1
      const s = 1 + 0.15 * Math.sin(phase * Math.PI * 2);
      this._highlightedNode.scale.set(
        baseScale.x * s,
        baseScale.y * s,
        baseScale.z * s
      );
    }, 50);
  }

  /** 清除节点高亮 */
  clearHighlight() {
    if (this._pulseInterval) {
      clearInterval(this._pulseInterval);
      this._pulseInterval = null;
    }
    if (this._highlightedNode) {
      if (this._originalEmissive !== null && this._highlightedNode.material && this._highlightedNode.material.emissive) {
        this._highlightedNode.material.emissive.setHex(this._originalEmissive);
        this._highlightedNode.material.emissiveIntensity = 1.0;
      }
      if (this._originalScale) {
        this._highlightedNode.scale.copy(this._originalScale);
      }
      this._highlightedNode = null;
      this._originalEmissive = null;
      this._originalScale = null;
    }
  }

  /**
   * 获取场景中第一个节点的 ID（用于默认高亮）
   * @returns {string|null}
   */
  getFirstNodeId() {
    const st = this.state;
    if (!st || !st.nodeMap || st.nodeMap.size === 0) return null;
    for (const [id] of st.nodeMap) {
      if (id !== st.VIRTUAL_ROOT_ID) return id;
    }
    return null;
  }

  /**
   * 获取场景中第一个节点的位置
   * @returns {THREE.Vector3|null}
   */
  getFirstNodePosition() {
    const st = this.state;
    if (!st) return null;
    const nodeId = this.getFirstNodeId();
    if (!nodeId) return null;
    const pos = st.positions.get(nodeId);
    return pos ? pos.clone() : null;
  }

  /**
   * 在 3D 空间中放置 CSS2D 指示器标签
   * @param {string} text - 文字
   * @param {THREE.Vector3} worldPos - 3D 世界坐标
   */
  showIndicator(text, worldPos) {
    this.hideIndicator();

    const st = this.state;
    if (!st || !st.scene || !st.labelRenderer) return;

    const div = document.createElement('div');
    div.className = 'guide-3d-label';
    div.textContent = text;
    div.style.cssText = `
      color: #0ff;
      font-size: 15px;
      font-weight: 600;
      text-shadow: 0 0 12px rgba(0,255,255,0.6), 0 0 24px rgba(0,255,255,0.3);
      white-space: nowrap;
      pointer-events: none;
      user-select: none;
      font-family: system-ui, sans-serif;
    `;

    this._indicator = new CSS2DObject(div);
    this._indicator.position.copy(worldPos);
    // 稍微偏移到节点上方
    this._indicator.position.y += 0.6;
    this._indicator.name = 'guideIndicator';
    st.scene.add(this._indicator);

    // labelRenderer 需要设置 pointerEvents 为 auto 才能显示
    if (st.labelRenderer && st.labelRenderer.domElement) {
      st.labelRenderer.domElement.style.pointerEvents = 'auto';
    }
  }

  /** 隐藏 CSS2D 指示器 */
  hideIndicator() {
    if (this._indicator) {
      const st = this.state;
      if (st && st.scene) {
        st.scene.remove(this._indicator);
      }
      if (this._indicator.element) {
        this._indicator.element.remove();
      }
      this._indicator = null;
    }
    // 恢复 labelRenderer pointerEvents
    const st = this.state;
    if (st && st.labelRenderer && st.labelRenderer.domElement) {
      st.labelRenderer.domElement.style.pointerEvents = 'none';
    }
  }

  /**
   * 创建闪烁的 3D 箭头（sprite）指向特定位置
   * @param {THREE.Vector3} worldPos
   */
  createArrow(worldPos) {
    this.removeArrow();
    const st = this.state;
    if (!st || !st.scene) return;

    // 使用简单的彩色圆点 sprite 代替箭头
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0, 255, 255, 0.9)';
    ctx.beginPath();
    ctx.arc(32, 32, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 3;
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
      map: texture,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    });
    this._arrowSprite = new THREE.Sprite(material);
    this._arrowSprite.position.copy(worldPos);
    this._arrowSprite.position.y += 0.5;
    this._arrowSprite.scale.set(0.4, 0.4, 1);
    this._arrowSprite.name = 'guideArrow';
    st.scene.add(this._arrowSprite);
  }

  /** 移除箭头 sprite */
  removeArrow() {
    if (this._arrowSprite) {
      const st = this.state;
      if (st && st.scene) {
        st.scene.remove(this._arrowSprite);
      }
      if (this._arrowSprite.material && this._arrowSprite.material.map) {
        this._arrowSprite.material.map.dispose();
      }
      if (this._arrowSprite.material) {
        this._arrowSprite.material.dispose();
      }
      this._arrowSprite = null;
    }
  }

  /** 锁定 OrbitControls（引导期间防止用户误操作） */
  lockControls() {
    const st = this.state;
    if (!st || !st.controls) return;
    st.controls.enableRotate = false;
    st.controls.enableZoom = false;
    st.controls.enablePan = false;
    this._controlsLocked = true;
  }

  /** 解锁 OrbitControls */
  unlockControls() {
    const st = this.state;
    if (!st || !st.controls) return;
    st.controls.enableRotate = true;
    st.controls.enableZoom = true;
    st.controls.enablePan = true;
    this._controlsLocked = false;
  }

  /** 清理所有 3D 引导元素 */
  cleanup() {
    this.clearHighlight();
    this.hideIndicator();
    this.removeArrow();
    this.unlockControls();
  }

  /** 销毁 */
  destroy() {
    this.cleanup();
  }
}
