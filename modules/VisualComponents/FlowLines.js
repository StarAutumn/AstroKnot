// ============================================================
//  模块6 子模块：3D 连线类 (SpiralFlowLine + PolylineFlowLine)
// ============================================================
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { appState } from '../module0_AppState.js';

// 🎯 视锥裁剪辅助：点是否在相机前方（复用临时向量避免每帧每线 new）
const _camForwardTmp = new THREE.Vector3();
const _camToPtTmp = new THREE.Vector3();
const _frustumMidTmp = new THREE.Vector3();

// 🎯 粒子更新热路径复用临时向量/颜色（避免每粒子 new）
const _particlePosTmp = new THREE.Vector3();
const _particleOffTmp = new THREE.Vector3();
const _particleMidTmp = new THREE.Vector3();
const _particleColorTmp = new THREE.Color();
const _particleColorTmp2 = new THREE.Color();

// 🎯 PolylineFlowLine 专用：curve.getTangentAt + 法向量计算复用
const _polyTangentTmp = new THREE.Vector3();
const _polyBinormalTmp = new THREE.Vector3();
const _polyNormalTmp = new THREE.Vector3();
const _polyUpTmp = new THREE.Vector3();

function _isInFrontOfCamera(point) {
  _camForwardTmp.set(0, 0, -1).applyQuaternion(appState.camera.quaternion);
  _camToPtTmp.subVectors(point, appState.camera.position);
  return _camToPtTmp.dot(_camForwardTmp) > 0;
}

// 🎯 视锥裁剪：线段包围球是否在相机视野内（距离 LOD + 方向判断）
function _isLineInFrustum(start, end) {
  _frustumMidTmp.addVectors(start, end).multiplyScalar(0.5);
  if (_frustumMidTmp.distanceTo(appState.camera.position) > 30) return false;
  return _isInFrontOfCamera(_frustumMidTmp);
}

// 🎯 分帧计数器：每帧递增，连线粒子按奇偶交错更新（减半粒子 CPU 开销）
let _renderFrame = 0;
export function _bumpRenderFrame() { _renderFrame++; }

// ============================================================
//  SpiralFlowLine — 螺旋粒子连线（两端点直线）
// ============================================================
export class SpiralFlowLine {
  constructor(start, end, phase, options = {}) {
    const { label = '', edgeType = 'cross', parentId = null, startId = null, endId = null, customColor = null, flowIndex = 0 } = options;
    const dir = new THREE.Vector3().subVectors(end, start).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    if (Math.abs(dir.dot(up)) > 0.9999) up.set(1, 0, 0);
    const binormal = new THREE.Vector3().crossVectors(dir, up).normalize();
    const normal = new THREE.Vector3().crossVectors(binormal, dir).normalize();

    const offsetVec = normal.clone().multiplyScalar(flowIndex * 0.2);
    this.start = start.clone().add(offsetVec);
    this.end = end.clone().add(offsetVec);
    
    this.len = this.start.distanceTo(this.end);
    this.dir = dir;
    this.binormal = binormal;
    this.normal = normal;

    let curve = new THREE.CatmullRomCurve3([this.start, this.end]);
    let tubeGeom = new THREE.TubeGeometry(curve, 16, 0.03, 6, false);

    let canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 32;
    let ctx = canvas.getContext('2d');
    let grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
    grad.addColorStop(0, '#ff0040');
    grad.addColorStop(0.16, '#ff8000');
    grad.addColorStop(0.33, '#ffff00');
    grad.addColorStop(0.5, '#00ff80');
    grad.addColorStop(0.66, '#00aaff');
    grad.addColorStop(0.83, '#8a2be2');
    grad.addColorStop(0.9, '#ff44aa');
    grad.addColorStop(1, '#ff0040');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    this.sourceCanvas = canvas;
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.wrapS = THREE.RepeatWrapping;
    let period = this.len * (3.5 + Math.random() * 1.2);
    this.texture.repeat.set(this.len / period, 1);

    this.glowCanvas = document.createElement('canvas');
    this.glowCanvas.width = 512;
    this.glowCanvas.height = 512;
    this.glowCtx = this.glowCanvas.getContext('2d');

    if (edgeType === 'cross') {
      const hGrad = this.glowCtx.createLinearGradient(0, 0, this.glowCanvas.width, 0);
      hGrad.addColorStop(0, 'rgba(255,0,64,0)');
      hGrad.addColorStop(0.2, 'rgba(255,0,64,0)');
      hGrad.addColorStop(0.24, 'rgba(255,0,64,0.9)');
      hGrad.addColorStop(0.38, 'rgba(255,128,0,0.9)');
      hGrad.addColorStop(0.48, 'rgba(255,255,0,0.9)');
      hGrad.addColorStop(0.58, 'rgba(0,255,128,0.9)');
      hGrad.addColorStop(0.68, 'rgba(0,170,255,0.9)');
      hGrad.addColorStop(0.78, 'rgba(138,43,226,0.9)');
      hGrad.addColorStop(0.82, 'rgba(255,68,170,0.9)');
      hGrad.addColorStop(0.86, 'rgba(255,0,64,0.9)');
      hGrad.addColorStop(0.9, 'rgba(255,0,64,0)');
      hGrad.addColorStop(1, 'rgba(255,0,64,0)');
      this.glowCtx.fillStyle = hGrad;
      this.glowCtx.fillRect(0, 0, this.glowCanvas.width, this.glowCanvas.height);
    } else {
      const hGrad = this.glowCtx.createLinearGradient(0, 0, this.glowCanvas.width, 0);
      hGrad.addColorStop(0, '#ff0040');
      hGrad.addColorStop(0.16, '#ff8000');
      hGrad.addColorStop(0.33, '#ffff00');
      hGrad.addColorStop(0.5, '#00ff80');
      hGrad.addColorStop(0.66, '#00aaff');
      hGrad.addColorStop(0.83, '#8a2be2');
      hGrad.addColorStop(0.9, '#ff44aa');
      hGrad.addColorStop(1, '#ff0040');
      this.glowCtx.fillStyle = hGrad;
      this.glowCtx.fillRect(0, 0, this.glowCanvas.width, this.glowCanvas.height);
    }

    this.glowTexture = new THREE.CanvasTexture(this.glowCanvas);
    this.glowTexture.wrapS = THREE.RepeatWrapping;
    this.glowTexture.wrapT = THREE.RepeatWrapping;
    this.glowTexture.repeat.set(2, 2);

    let glowTubeRadius = 0.07;
    if (edgeType === 'cross') {
      glowTubeRadius = 0.06;
    }
    
    const glowTubeGeom = new THREE.TubeGeometry(curve, 16, glowTubeRadius, 6, false);
    
    this.glowTube = new THREE.Mesh(glowTubeGeom, new THREE.MeshBasicMaterial({
      map: this.glowTexture,
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      depthTest: true
    }));
    appState.scene.add(this.glowTube);

    this.mesh = new THREE.Mesh(tubeGeom, new THREE.MeshStandardMaterial({
      map: this.texture,
      emissive: 0x996688,
      emissiveIntensity: 2.0,
      transparent: true
    }));

    const hasLabel = !!(label && label.trim() !== '');
    this.mesh.userData = {
      startId, endId, edgeType, parentId, label,
      labelHidden: options.labelHidden !== undefined ? options.labelHidden : true
    };

    this.off = phase;
    this.glowTube.visible = true;

    this.labelObj = null;
    if (hasLabel) {
      const div = document.createElement('div');
      div.textContent = label;
      div.className = 'line-label';
      div.style.cssText = 'color:#000000;font-size:12px;background:#ffffff;backdrop-filter:blur(6px);padding:2px 10px;border-radius:40px;border:1px solid #cccccc;white-space:nowrap;pointer-events:none;';
      this.labelObj = new CSS2DObject(div);
      const mid = new THREE.Vector3().addVectors(this.start, this.end).multiplyScalar(0.5);
      this.labelObj.position.copy(mid);
      this.labelObj.visible = false;
      appState.scene.add(this.labelObj);
    }

    this.particles = [];
    const trailCount = this.len > 5 ? 8 : 12;
    this._trailCount = trailCount;
    const particleCount = Math.max(8, Math.min(Math.round(this.len * 6), 60));
    const totalTrailVerts = particleCount * trailCount;

    const particlePosArr = new Float32Array(particleCount * 3);
    const particleColorArr = new Float32Array(particleCount * 3);
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePosArr, 3));
    particleGeo.setAttribute('color', new THREE.BufferAttribute(particleColorArr, 3));
    const particleMat = new THREE.PointsMaterial({
      map: appState.glowTex,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      size: 0.25,
      sizeAttenuation: true,
      vertexColors: true,
      opacity: 1
    });
    this.particlePoints = new THREE.Points(particleGeo, particleMat);
    this.particlePoints.frustumCulled = false;
    appState.scene.add(this.particlePoints);

    const trailPosArr = new Float32Array(totalTrailVerts * 3);
    const trailColorArr = new Float32Array(totalTrailVerts * 3);
    const trailSizeArr = new Float32Array(totalTrailVerts);
    for (let j = 0; j < trailCount; j++) {
      const sz = 0.07 + j * 0.035;
      for (let i = 0; i < particleCount; i++) {
        trailSizeArr[i * trailCount + j] = sz;
      }
    }
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPosArr, 3));
    trailGeo.setAttribute('color', new THREE.BufferAttribute(trailColorArr, 3));
    trailGeo.setAttribute('size', new THREE.BufferAttribute(trailSizeArr, 1));
    const trailMat = new THREE.ShaderMaterial({
      uniforms: {
        uTexture: { value: appState.glowTex },
        uColor: { value: new THREE.Color(0xffffff) },
        uOpacity: { value: 1.0 }
      },
      vertexShader: `
        attribute float size;
        attribute vec3 color;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (600.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform sampler2D uTexture;
        uniform vec3 uColor;
        uniform float uOpacity;
        varying vec3 vColor;
        void main() {
          vec4 tex = texture2D(uTexture, gl_PointCoord);
          gl_FragColor = vec4(vColor * uColor, tex.a * 0.6 * uOpacity);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.trailPointsMerged = new THREE.Points(trailGeo, trailMat);
    this.trailPointsMerged.frustumCulled = false;
    appState.scene.add(this.trailPointsMerged);

    for (let i = 0; i < particleCount; i++) {
      const history = new Array(trailCount).fill(null);
      this.particles.push({
        idx: i,
        t_off: i / particleCount,
        angle_off: Math.PI * 2 * (i / particleCount),
        speed_t: 0.6 + Math.random() * 0.4,
        speed_angle: 2 + Math.random() * 1.5,
        history,
        colorSeed: Math.random() * 1000,
        visible: true
      });
    }

    if (appState.simple3D) {
      this.glowTube.visible = false;
      this.particlePoints.visible = false;
      this.trailPointsMerged.visible = false;
    }
    this.customColor = customColor;
    this.flowStartTime = null;
    this.isFlowing = false;
    this._frameParity = _renderFrame & 1;
    this._distToCamera = 0;
  }

  updatePositions(start, end) {
    this.start.copy(start);
    this.end.copy(end);
    this.len = this.start.distanceTo(this.end);
    const dir = new THREE.Vector3().subVectors(end, start).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    if (Math.abs(dir.dot(up)) > 0.9999) up.set(1, 0, 0);
    const binormal = new THREE.Vector3().crossVectors(dir, up).normalize();
    const normal = new THREE.Vector3().crossVectors(binormal, dir).normalize();
    this.dir = dir;
    this.binormal = binormal;
    this.normal = normal;

    const curve = new THREE.CatmullRomCurve3([this.start, this.end]);
    this.mesh.geometry.dispose();
    this.mesh.geometry = new THREE.TubeGeometry(curve, 16, 0.03, 6, false);
    this.glowTube.geometry.dispose();
    const glowTubeRadius = this.mesh.userData.edgeType === 'cross' ? 0.06 : 0.07;
    this.glowTube.geometry = new THREE.TubeGeometry(curve, 16, glowTubeRadius, 6, false);

    if (this.labelObj) {
      const mid = new THREE.Vector3().addVectors(this.start, this.end).multiplyScalar(0.5);
      this.labelObj.position.copy(mid);
    }
  }

  startFlowAnimation(startTime) {
    this.flowStartTime = startTime;
    this.isFlowing = true;
  }

  endFlowAnimation() {
    this.isFlowing = false;
    this.flowStartTime = null;
  }

  update(t) {
    let off = (-t * 0.3 + this.off) % 1;
    this.texture.offset.x = off;
    this.glowTexture.offset.x = off;
    this.glowTexture.offset.y = (-t * 0.1 + this.off) % 1;
    this.texture.needsUpdate = true;
    this.mesh.material.emissiveIntensity = 1 + Math.sin(t * 1.5 + this.off) * 0.7;

    if (appState.simple3D) {
      if (this.labelObj) {
        _particleMidTmp.addVectors(this.start, this.end).multiplyScalar(0.5);
        this.labelObj.position.copy(_particleMidTmp);
      }
      if (this.customColor) {
        this._applyCustomColor(this.customColor);
      }
      return;
    }

    if (!_isLineInFrustum(this.start, this.end)) {
      if (this.labelObj) {
        _particleMidTmp.addVectors(this.start, this.end).multiplyScalar(0.5);
        this.labelObj.position.copy(_particleMidTmp);
      }
      return;
    }

    if (!this.isFlowing && !appState.transitionActive) {
      if ((_renderFrame & 1) !== this._frameParity) {
        if (this.labelObj) {
          _particleMidTmp.addVectors(this.start, this.end).multiplyScalar(0.5);
          this.labelObj.position.copy(_particleMidTmp);
        }
        return;
      }
    }

    // 🎯 基于屏幕空间大小的精确 LOD：远距离粒子在屏幕上几乎不可见时才裁剪
    _particleMidTmp.addVectors(this.start, this.end).multiplyScalar(0.5);
    this._distToCamera = _particleMidTmp.distanceTo(appState.camera.position);
    // 估算连线在屏幕上的投影长度（像素），阈值改为 100px / 50px 才触发裁剪
    const fov = appState.camera.fov * Math.PI / 180;
    const screenLen = (this.len / this._distToCamera) * (window.innerHeight / (2 * Math.tan(fov / 2)));
    let effectiveMaxParticles = this.particles.length;
    let effectiveTrailCount = this._trailCount;
    if (screenLen < 50) {
      effectiveMaxParticles = Math.max(1, Math.ceil(this.particles.length * 0.25));
      effectiveTrailCount = Math.ceil(this._trailCount * 0.5);
    } else if (screenLen < 100) {
      effectiveMaxParticles = Math.max(2, Math.ceil(this.particles.length * 0.5));
      effectiveTrailCount = Math.ceil(this._trailCount * 0.7);
    }

    const hasLabel = !!(this.mesh.userData.label && this.mesh.userData.label.trim() !== '');
    const trailCount = this._trailCount;
    let allParticlesCompleted = true;

    const pPos = this.particlePoints.geometry.attributes.position.array;
    const pCol = this.particlePoints.geometry.attributes.color.array;
    const tPos = this.trailPointsMerged.geometry.attributes.position.array;
    const tCol = this.trailPointsMerged.geometry.attributes.color.array;

    for (let p of this.particles) {
      if (p.idx >= effectiveMaxParticles) {
        const pi3 = p.idx * 3;
        pPos[pi3] = pPos[pi3 + 1] = pPos[pi3 + 2] = 9999;
        const tBase = p.idx * trailCount * 3;
        for (let j = 0; j < trailCount; j++) {
          const tj = tBase + j * 3;
          tPos[tj] = tPos[tj + 1] = tPos[tj + 2] = 9999;
        }
        continue;
      }
      let tt;
      
      if (this.isFlowing && this.flowStartTime !== null) {
        const elapsed = t - this.flowStartTime;
        const maxDelay = 5;
        const particleDelay = p.t_off * maxDelay;
        const particleElapsed = elapsed - particleDelay;
        
        if (particleElapsed < 0) {
          tt = 0;
          p.visible = false;
          allParticlesCompleted = false;
        } else {
          const flowDuration = 6;
          const flowProgress = particleElapsed / flowDuration;
          
          if (flowProgress < 1) {
            tt = flowProgress;
            p.visible = true;
            allParticlesCompleted = false;
          } else {
            tt = (t * p.speed_t * 0.2 + p.t_off) % 1;
            p.visible = true;
          }
        }
      } else if (this.flowStartTime === null && appState.transitionActive) {
        tt = 0;
        p.visible = false;
        allParticlesCompleted = false;
      } else {
        tt = (t * p.speed_t * 0.2 + p.t_off) % 1;
        p.visible = true;
      }
      
      // 复用模块级临时向量（避免每粒子 new Vector3）
      _particlePosTmp.copy(this.start).lerp(this.end, tt);
      const angle = t * p.speed_angle + p.angle_off;
      const r = 0.12;
      _particleOffTmp.set(0, 0, 0)
        .addScaledVector(this.normal, Math.cos(angle) * r)
        .addScaledVector(this.binormal, Math.sin(angle) * r);
      _particlePosTmp.add(_particleOffTmp);
      const fp = _particlePosTmp;

      const pi = p.idx * 3;
      if (p.visible) {
        pPos[pi] = fp.x;
        pPos[pi + 1] = fp.y;
        pPos[pi + 2] = fp.z;
      } else {
        pPos[pi] = pPos[pi + 1] = pPos[pi + 2] = 9999;
      }

      const hue = (t * 0.3 + p.t_off) % 1;
      let col;

      if (hasLabel) {
        const seed = p.colorSeed;
        const individualHue = (Math.sin(t * 0.2 + seed) * 0.5 + 0.5);
        col = _particleColorTmp.setHSL(individualHue, 1, 0.5);
        pCol[pi] = col.r;
        pCol[pi + 1] = col.g;
        pCol[pi + 2] = col.b;
      } else {
        col = _particleColorTmp.setHSL(hue, 1, 0.65);
        pCol[pi] = col.r;
        pCol[pi + 1] = col.g;
        pCol[pi + 2] = col.b;
      }

      p.history.pop();
      // history 需要独立 Vector3 引用，必须 clone（fp 是复用的临时变量）
      p.history.unshift(p.visible ? fp.clone() : null);

      const showTrails = p.visible && hasLabel;
      for (let j = 0; j < trailCount; j++) {
        const vi = (p.idx * trailCount + j) * 3;
        if (j >= effectiveTrailCount) {
          tPos[vi] = tPos[vi + 1] = tPos[vi + 2] = 9999;
          tCol[vi] = tCol[vi + 1] = tCol[vi + 2] = 0;
          continue;
        }
        const trailPos = p.history[j];
        if (showTrails && trailPos) {
          tPos[vi] = trailPos.x;
          tPos[vi + 1] = trailPos.y;
          tPos[vi + 2] = trailPos.z;
          const fade = 1 - j / (effectiveTrailCount + 1);
          tCol[vi] = col.r * fade;
          tCol[vi + 1] = col.g * fade;
          tCol[vi + 2] = col.b * fade;
        } else {
          tPos[vi] = tPos[vi + 1] = tPos[vi + 2] = 9999;
          tCol[vi] = tCol[vi + 1] = tCol[vi + 2] = 0;
        }
      }
    }

    this.particlePoints.geometry.attributes.position.needsUpdate = true;
    this.particlePoints.geometry.attributes.color.needsUpdate = true;
    this.trailPointsMerged.geometry.attributes.position.needsUpdate = true;
    this.trailPointsMerged.geometry.attributes.color.needsUpdate = true;
    this.trailPointsMerged.visible = hasLabel;

    if (this.isFlowing && allParticlesCompleted) {
      this.isFlowing = false;
      this.flowStartTime = null;
    }

    if (this.labelObj) {
      _particleMidTmp.addVectors(this.start, this.end).multiplyScalar(0.5);
      this.labelObj.position.copy(_particleMidTmp);
    }

    if (this.customColor) {
      this._applyCustomColor(this.customColor);
    }
  }

  setVisible(v) {
    if (!this.mesh) return;
    this.mesh.visible = v;
    const showEffects = v && !appState.simple3D;
    if (this.glowTube) this.glowTube.visible = showEffects;
    if (this.labelObj) {
      this.labelObj.visible = v && !this.mesh.userData.labelHidden && appState.showAllLabels;
    }
    this.particlePoints.visible = showEffects;
    this.trailPointsMerged.visible = showEffects;
  }

  setOpacity(op) {
    this.mesh.material.opacity = op;
    this.mesh.material.transparent = op < 0.99;
  }

  dispose() {
    if (this.labelObj) {
      if (this.labelObj.element) this.labelObj.element.remove();
      appState.scene.remove(this.labelObj);
      this.labelObj = null;
    }
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.texture.dispose();
    if (this.sourceCanvas) {
      this.sourceCanvas.width = 0;
      this.sourceCanvas.height = 0;
      this.sourceCanvas = null;
    }
    if (this.particlePoints) {
      this.particlePoints.geometry.dispose();
      this.particlePoints.material.dispose();
      appState.scene.remove(this.particlePoints);
    }
    if (this.trailPointsMerged) {
      this.trailPointsMerged.geometry.dispose();
      this.trailPointsMerged.material.dispose();
      appState.scene.remove(this.trailPointsMerged);
    }
    if (this.glowTube) {
      this.glowTube.geometry.dispose();
      this.glowTube.material.dispose();
      appState.scene.remove(this.glowTube);
      this.glowTube = null;
    }
    if (this.glowTexture) {
      this.glowTexture.dispose();
      this.glowTexture = null;
    }
    if (this.glowCanvas) {
      this.glowCanvas.width = 0;
      this.glowCanvas.height = 0;
      this.glowCanvas = null;
    }
    appState.scene.remove(this.mesh);
  }

  _applyCustomColor(color) {
    this.mesh.material.color.set(color);
    this.mesh.material.emissive.set(color);
    this.mesh.material.emissiveIntensity = 1.5;
    this.glowTube.material.color.set(color);
    if (this.particlePoints) this.particlePoints.material.color.set(color);
    if (this.trailPointsMerged?.material?.uniforms) this.trailPointsMerged.material.uniforms.uColor.value.set(color);
  }

  setCustomColor(color) {
    this.customColor = color;
    if (color) {
      this._applyCustomColor(color);
    }
  }
}

// ============================================================
//  PolylineFlowLine — 支持多拐点的折线/曲线连线（3D）
// ============================================================
export class PolylineFlowLine {
  constructor(points3d, phase, options = {}) {
    const { label = '', startId = null, endId = null, customColor = null } = options;
    this.points = points3d.map(p => p.clone());
    this.phase = phase;
    this.startId = startId;
    this.endId = endId;

    if (this.points.length < 2) {
      this.points = [points3d[0] || new THREE.Vector3(), points3d[points3d.length - 1] || new THREE.Vector3()];
    }

    this._buildGeometry();
    this._buildMaterials(options);
    this._buildParticles();
    this._buildLabel(label);
    this._frameParity = _renderFrame & 1;
    this._distToCamera = 0;
  }

  _buildGeometry() {
    const curve = new THREE.CatmullRomCurve3(this.points);
    this.curve = curve;
    this.len = curve.getLength();

    const tubeGeom = new THREE.TubeGeometry(curve, Math.max(16, this.points.length * 8), 0.03, 6, false);
    this.mesh = new THREE.Mesh(tubeGeom, new THREE.MeshStandardMaterial({
      map: this._createTexture(),
      emissive: 0x996688,
      emissiveIntensity: 2.0,
      transparent: true
    }));
    appState.scene.add(this.mesh);

    const glowTubeGeom = new THREE.TubeGeometry(curve, Math.max(16, this.points.length * 8), 0.06, 6, false);
    this.glowTube = new THREE.Mesh(glowTubeGeom, new THREE.MeshBasicMaterial({
      map: this._createGlowTexture(),
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      depthTest: true
    }));
    appState.scene.add(this.glowTube);
  }

  _createTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
    grad.addColorStop(0, '#ff0040');
    grad.addColorStop(0.16, '#ff8000');
    grad.addColorStop(0.33, '#ffff00');
    grad.addColorStop(0.5, '#00ff80');
    grad.addColorStop(0.66, '#00aaff');
    grad.addColorStop(0.83, '#8a2be2');
    grad.addColorStop(0.9, '#ff44aa');
    grad.addColorStop(1, '#ff0040');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    this.sourceCanvas = canvas;
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    const period = this.len * (3.5 + Math.random() * 1.2);
    tex.repeat.set(this.len / period, 1);
    return tex;
  }

  _createGlowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const hGrad = ctx.createLinearGradient(0, 0, canvas.width, 0);
    hGrad.addColorStop(0, 'rgba(255,0,64,0)');
    hGrad.addColorStop(0.2, 'rgba(255,0,64,0)');
    hGrad.addColorStop(0.24, 'rgba(255,0,64,0.9)');
    hGrad.addColorStop(0.38, 'rgba(255,128,0,0.9)');
    hGrad.addColorStop(0.48, 'rgba(255,255,0,0.9)');
    hGrad.addColorStop(0.58, 'rgba(0,255,128,0.9)');
    hGrad.addColorStop(0.68, 'rgba(0,170,255,0.9)');
    hGrad.addColorStop(0.78, 'rgba(138,43,226,0.9)');
    hGrad.addColorStop(0.82, 'rgba(255,68,170,0.9)');
    hGrad.addColorStop(0.86, 'rgba(255,0,64,0.9)');
    hGrad.addColorStop(0.9, 'rgba(255,0,64,0)');
    hGrad.addColorStop(1, 'rgba(255,0,64,0)');
    ctx.fillStyle = hGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    this.glowCanvas = canvas;
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 2);
    return tex;
  }

  _buildMaterials(options) {
    const { edgeType = 'cross', labelHidden, label } = options;
    this.mesh.userData = {
      startId: this.startId, endId: this.endId, edgeType,
      label: label || '',
      labelHidden: labelHidden !== undefined ? labelHidden : true
    };
    this.glowTube.visible = true;
    this.customColor = options.customColor || null;
    this.flowStartTime = null;
    this.isFlowing = false;
  }

  _buildParticles() {
    this.particles = [];
    const trailCount = 12;
    this._trailCount = trailCount;
    const particleCount = Math.max(8, Math.round(this.len * 6));
    const totalTrailVerts = particleCount * trailCount;

    const particlePosArr = new Float32Array(particleCount * 3);
    const particleColorArr = new Float32Array(particleCount * 3);
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePosArr, 3));
    particleGeo.setAttribute('color', new THREE.BufferAttribute(particleColorArr, 3));
    const particleMat = new THREE.PointsMaterial({
      map: appState.glowTex,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      size: 0.25,
      sizeAttenuation: true,
      vertexColors: true,
      opacity: 1
    });
    this.particlePoints = new THREE.Points(particleGeo, particleMat);
    this.particlePoints.frustumCulled = false;
    appState.scene.add(this.particlePoints);

    const trailPosArr = new Float32Array(totalTrailVerts * 3);
    const trailColorArr = new Float32Array(totalTrailVerts * 3);
    const trailSizeArr = new Float32Array(totalTrailVerts);
    for (let j = 0; j < trailCount; j++) {
      const sz = 0.07 + j * 0.035;
      for (let i = 0; i < particleCount; i++) {
        trailSizeArr[i * trailCount + j] = sz;
      }
    }
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPosArr, 3));
    trailGeo.setAttribute('color', new THREE.BufferAttribute(trailColorArr, 3));
    trailGeo.setAttribute('size', new THREE.BufferAttribute(trailSizeArr, 1));
    const trailMat = new THREE.ShaderMaterial({
      uniforms: {
        uTexture: { value: appState.glowTex },
        uColor: { value: new THREE.Color(0xffffff) },
        uOpacity: { value: 1.0 }
      },
      vertexShader: `
        attribute float size;
        attribute vec3 color;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (600.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform sampler2D uTexture;
        uniform vec3 uColor;
        uniform float uOpacity;
        varying vec3 vColor;
        void main() {
          vec4 tex = texture2D(uTexture, gl_PointCoord);
          gl_FragColor = vec4(vColor * uColor, tex.a * 0.6 * uOpacity);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.trailPointsMerged = new THREE.Points(trailGeo, trailMat);
    this.trailPointsMerged.frustumCulled = false;
    appState.scene.add(this.trailPointsMerged);

    for (let i = 0; i < particleCount; i++) {
      const history = new Array(trailCount).fill(null);
      this.particles.push({
        idx: i,
        t_off: i / particleCount,
        angle_off: Math.PI * 2 * (i / particleCount),
        speed_t: 0.6 + Math.random() * 0.4,
        speed_angle: 2 + Math.random() * 1.5,
        history,
        colorSeed: Math.random() * 1000,
        visible: true
      });
    }

    if (appState.simple3D) {
      this.glowTube.visible = false;
      this.particlePoints.visible = false;
      this.trailPointsMerged.visible = false;
    }
  }

  _buildLabel(label) {
    const hasLabel = !!(label && label.trim() !== '');
    this.labelObj = null;
    if (hasLabel) {
      const div = document.createElement('div');
      div.textContent = label;
      div.className = 'line-label';
      div.style.cssText = 'color:#000000;font-size:12px;background:#ffffff;backdrop-filter:blur(6px);padding:2px 10px;border-radius:40px;border:1px solid #cccccc;white-space:nowrap;pointer-events:none;';
      this.labelObj = new CSS2DObject(div);
      const mid = this.curve.getPointAt(0.5);
      this.labelObj.position.copy(mid);
      this.labelObj.visible = false;
      appState.scene.add(this.labelObj);
    }
  }

  updatePositions(newPoints) {
    if (!newPoints || newPoints.length < 2) return;
    this.points = newPoints.map(p => p.clone());

    const curve = new THREE.CatmullRomCurve3(this.points);
    this.curve = curve;
    this.len = curve.getLength();

    this.mesh.geometry.dispose();
    this.mesh.geometry = new THREE.TubeGeometry(curve, Math.max(16, this.points.length * 8), 0.03, 6, false);
    this.glowTube.geometry.dispose();
    this.glowTube.geometry = new THREE.TubeGeometry(curve, Math.max(16, this.points.length * 8), 0.06, 6, false);

    if (this.mesh.material.map) {
      const period = this.len * (3.5 + Math.random() * 1.2);
      this.mesh.material.map.repeat.set(this.len / period, 1);
    }

    if (this.labelObj) {
      const mid = this.curve.getPointAt(0.5);
      this.labelObj.position.copy(mid);
    }

    if (this.particlePoints) {
      const positions = this.particlePoints.geometry.attributes.position.array;
      const count = positions.length / 3;
      for (let i = 0; i < count; i++) {
        const t = i / Math.max(1, count - 1);
        const pt = this.curve.getPointAt(t);
        positions[i * 3] = pt.x;
        positions[i * 3 + 1] = pt.y;
        positions[i * 3 + 2] = pt.z;
      }
      this.particlePoints.geometry.attributes.position.needsUpdate = true;
    }
  }

  update(t) {
    const off = (-t * 0.3 + this.phase) % 1;
    if (this.mesh.material.map) {
      this.mesh.material.map.offset.x = off;
      this.mesh.material.map.needsUpdate = true;
    }
    if (this.glowTube.material.map) {
      this.glowTube.material.map.offset.x = off;
      this.glowTube.material.map.offset.y = (-t * 0.1 + this.phase) % 1;
      this.glowTube.material.map.needsUpdate = true;
    }
    this.mesh.material.emissiveIntensity = 1 + Math.sin(t * 1.5 + this.phase) * 0.7;

    if (appState.simple3D) {
      if (this.labelObj && this.points.length >= 2) {
        this.labelObj.position.copy(this.curve.getPointAt(0.5));
      }
      if (this.customColor) this._applyCustomColor(this.customColor);
      return;
    }

    if (!_isLineInFrustum(this.points[0], this.points[this.points.length - 1])) {
      if (this.labelObj && this.points.length >= 2) {
        this.labelObj.position.copy(this.curve.getPointAt(0.5));
      }
      return;
    }

    if (!this.isFlowing && !appState.transitionActive) {
      if ((_renderFrame & 1) !== this._frameParity) {
        if (this.labelObj && this.points.length >= 2) {
          this.labelObj.position.copy(this.curve.getPointAt(0.5));
        }
        return;
      }
    }

    this.curve.getPointAt(0.5, _particleMidTmp);
    this._distToCamera = _particleMidTmp.distanceTo(appState.camera.position);
    const fov2 = appState.camera.fov * Math.PI / 180;
    const screenLen2 = (this.len / this._distToCamera) * (window.innerHeight / (2 * Math.tan(fov2 / 2)));
    let effMaxParticles = this.particles.length;
    let effTrailCount = this._trailCount || 12;
    const trailCnt = this._trailCount || 12;
    if (screenLen2 < 50) {
      effMaxParticles = Math.max(1, Math.ceil(this.particles.length * 0.25));
      effTrailCount = Math.ceil(trailCnt * 0.5);
    } else if (screenLen2 < 100) {
      effMaxParticles = Math.max(2, Math.ceil(this.particles.length * 0.5));
      effTrailCount = Math.ceil(trailCnt * 0.7);
    }

    if (!this.particlePoints || !this.trailPointsMerged) return;

    const hasLabel = !!(this.mesh.userData.label && this.mesh.userData.label.trim() !== '');
    const trailCount = this._trailCount || 12;
    let allParticlesCompleted = true;

    const pPos = this.particlePoints.geometry.attributes.position.array;
    const pCol = this.particlePoints.geometry.attributes.color.array;
    const tPos = this.trailPointsMerged.geometry.attributes.position.array;
    const tCol = this.trailPointsMerged.geometry.attributes.color.array;

    for (let p of this.particles) {
      if (p.idx >= effMaxParticles) {
        const pi3 = p.idx * 3;
        pPos[pi3] = pPos[pi3 + 1] = pPos[pi3 + 2] = 9999;
        const tBase = p.idx * trailCount * 3;
        for (let j = 0; j < trailCount; j++) {
          const tj = tBase + j * 3;
          tPos[tj] = tPos[tj + 1] = tPos[tj + 2] = 9999;
        }
        continue;
      }
      let tt;

      if (this.isFlowing && this.flowStartTime !== null) {
        const elapsed = t - this.flowStartTime;
        const maxDelay = 5;
        const particleDelay = p.t_off * maxDelay;
        const particleElapsed = elapsed - particleDelay;
        if (particleElapsed < 0) {
          tt = 0; p.visible = false; allParticlesCompleted = false;
        } else {
          const flowDuration = 6;
          const flowProgress = particleElapsed / flowDuration;
          if (flowProgress < 1) { tt = flowProgress; p.visible = true; allParticlesCompleted = false; }
          else { tt = (t * p.speed_t * 0.2 + p.t_off) % 1; p.visible = true; }
        }
      } else if (this.flowStartTime === null && appState.transitionActive) {
        tt = 0; p.visible = false; allParticlesCompleted = false;
      } else {
        tt = (t * p.speed_t * 0.2 + p.t_off) % 1;
        p.visible = true;
      }

      // 复用模块级临时向量（避免每粒子 new Vector3）
      this.curve.getPointAt(tt, _particlePosTmp);
      this.curve.getTangentAt(tt, _polyTangentTmp);
      _polyUpTmp.set(0, 1, 0);
      if (Math.abs(_polyTangentTmp.dot(_polyUpTmp)) > 0.9999) _polyUpTmp.set(1, 0, 0);
      _polyBinormalTmp.crossVectors(_polyTangentTmp, _polyUpTmp).normalize();
      _polyNormalTmp.crossVectors(_polyBinormalTmp, _polyTangentTmp).normalize();

      const angle = t * p.speed_angle + p.angle_off;
      const r = 0.12;
      _particleOffTmp.set(0, 0, 0)
        .addScaledVector(_polyNormalTmp, Math.cos(angle) * r)
        .addScaledVector(_polyBinormalTmp, Math.sin(angle) * r);
      _particlePosTmp.add(_particleOffTmp);
      const fp = _particlePosTmp;

      const pi = p.idx * 3;
      if (p.visible) {
        pPos[pi] = fp.x; pPos[pi + 1] = fp.y; pPos[pi + 2] = fp.z;
      } else {
        pPos[pi] = pPos[pi + 1] = pPos[pi + 2] = 9999;
      }

      const hue = (t * 0.3 + p.t_off) % 1;
      let col;
      if (hasLabel) {
        const seed = p.colorSeed;
        const individualHue = (Math.sin(t * 0.2 + seed) * 0.5 + 0.5);
        col = _particleColorTmp.setHSL(individualHue, 1, 0.5);
      } else {
        col = _particleColorTmp.setHSL(hue, 1, 0.65);
      }
      pCol[pi] = col.r; pCol[pi + 1] = col.g; pCol[pi + 2] = col.b;

      p.history.pop();
      // history 需要独立 Vector3 引用，必须 clone（fp 是复用的临时变量）
      p.history.unshift(p.visible ? fp.clone() : null);

      const showTrails = p.visible && hasLabel;
      for (let j = 0; j < trailCount; j++) {
        const vi = (p.idx * trailCount + j) * 3;
        if (j >= effTrailCount) {
          tPos[vi] = tPos[vi + 1] = tPos[vi + 2] = 9999;
          tCol[vi] = tCol[vi + 1] = tCol[vi + 2] = 0;
          continue;
        }
        const trailPos = p.history[j];
        if (showTrails && trailPos) {
          tPos[vi] = trailPos.x; tPos[vi + 1] = trailPos.y; tPos[vi + 2] = trailPos.z;
          const fade = 1 - j / (effTrailCount + 1);
          tCol[vi] = col.r * fade; tCol[vi + 1] = col.g * fade; tCol[vi + 2] = col.b * fade;
        } else {
          tPos[vi] = tPos[vi + 1] = tPos[vi + 2] = 9999;
          tCol[vi] = tCol[vi + 1] = tCol[vi + 2] = 0;
        }
      }
    }

    this.particlePoints.geometry.attributes.position.needsUpdate = true;
    this.particlePoints.geometry.attributes.color.needsUpdate = true;
    this.trailPointsMerged.geometry.attributes.position.needsUpdate = true;
    this.trailPointsMerged.geometry.attributes.color.needsUpdate = true;
    this.trailPointsMerged.visible = hasLabel;

    if (this.isFlowing && allParticlesCompleted) {
      this.isFlowing = false; this.flowStartTime = null;
    }

    if (this.labelObj && this.points.length >= 2) {
      this.labelObj.position.copy(this.curve.getPointAt(0.5));
    }

    if (this.customColor) this._applyCustomColor(this.customColor);
  }

  dispose() {
    if (this.labelObj) {
      if (this.labelObj.element) this.labelObj.element.remove();
      appState.scene.remove(this.labelObj);
      this.labelObj = null;
    }
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    if (this.mesh.material.map) this.mesh.material.map.dispose();
    if (this.sourceCanvas) { this.sourceCanvas.width = 0; this.sourceCanvas.height = 0; this.sourceCanvas = null; }
    if (this.particlePoints) {
      this.particlePoints.geometry.dispose();
      this.particlePoints.material.dispose();
      appState.scene.remove(this.particlePoints);
    }
    if (this.trailPointsMerged) {
      this.trailPointsMerged.geometry.dispose();
      this.trailPointsMerged.material.dispose();
      appState.scene.remove(this.trailPointsMerged);
    }
    if (this.glowTube) {
      this.glowTube.geometry.dispose();
      this.glowTube.material.dispose();
      if (this.glowTube.material.map) this.glowTube.material.map.dispose();
      appState.scene.remove(this.glowTube);
      this.glowTube = null;
    }
    if (this.glowCanvas) { this.glowCanvas.width = 0; this.glowCanvas.height = 0; this.glowCanvas = null; }
    appState.scene.remove(this.mesh);
  }

  setVisible(v) {
    if (!this.mesh) return;
    this.mesh.visible = v;
    const showEffects = v && !appState.simple3D;
    if (this.glowTube) this.glowTube.visible = showEffects;
    if (this.labelObj) {
      this.labelObj.visible = v && !this.mesh.userData.labelHidden && appState.showAllLabels;
    }
    if (this.particlePoints) this.particlePoints.visible = showEffects;
    if (this.trailPointsMerged) this.trailPointsMerged.visible = showEffects;
  }

  setOpacity(op) {
    this.mesh.material.opacity = op;
    this.mesh.material.transparent = op < 0.99;
  }

  _applyCustomColor(color) {
    if (!this.mesh || !color) return;
    this.mesh.material.color.set(color);
    this.mesh.material.emissive.set(color);
    this.mesh.material.emissiveIntensity = 1.5;
    if (this.glowTube) this.glowTube.material.color.set(color);
    if (this.particlePoints) this.particlePoints.material.color.set(color);
  }

  setCustomColor(color) {
    this.customColor = color;
    this._applyCustomColor(color);
  }

  startFlowAnimation(startTime) {
    this.flowStartTime = startTime;
    this.isFlowing = true;
  }

  endFlowAnimation() {
    this.isFlowing = false;
    this.flowStartTime = null;
  }
}
