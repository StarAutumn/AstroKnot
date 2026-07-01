// ============================================================
//  模块7：Three.js 场景与效果初始化（所有组件存入 appState）
// ============================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { appState } from './module0_AppState.js';

export function initScene() {
  appState.starGroups = [];
  appState.nebulaFlowGroups = [];
  appState.glowPlanes = [];
  appState._gpuParticleUniforms = []; // 存储 GPU 粒子材质的 uniforms，用于 resize 更新

  appState.scene = new THREE.Scene();
  appState.scene.fog = new THREE.FogExp2(0x030314, 0.004);

  appState.camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 1000);
  appState.camera.position.set(0, 4.5, 8);

  appState.renderer = new THREE.WebGLRenderer({ antialias: true });
  appState.renderer.setSize(window.innerWidth, window.innerHeight);
  appState.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  appState.renderer.domElement.style.position = 'fixed';
  appState.renderer.domElement.style.top = '0px';
  appState.renderer.domElement.style.left = '0px';
  document.body.appendChild(appState.renderer.domElement);
  appState.effectComposer = new EffectComposer(appState.renderer);
  appState.effectComposer.addPass(new RenderPass(appState.scene, appState.camera));
  appState.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.3, 0.4, 0.85);
  appState.bloomPass.threshold = 0.02;
  appState.bloomPass.strength = 0.2;
  appState.bloomPass.radius = 2;
  appState.effectComposer.addPass(appState.bloomPass);

  appState.labelRenderer = new CSS2DRenderer();
  appState.labelRenderer.setSize(window.innerWidth, window.innerHeight);
  appState.labelRenderer.domElement.id = 'labelRenderer';
  appState.labelRenderer.domElement.style.position = 'fixed';
  appState.labelRenderer.domElement.style.top = '0px';
  appState.labelRenderer.domElement.style.left = '0px';
  appState.labelRenderer.domElement.style.pointerEvents = 'none';
  document.body.appendChild(appState.labelRenderer.domElement);

  appState.controls = new OrbitControls(appState.camera, appState.renderer.domElement);
  appState.controls.enableDamping = true;
  appState.controls.target.set(0, 0.2, 0);

  if (!appState.panoramaTexture) {
    console.error('panoramaTexture 未初始化');
    return;
  }
  if (!appState.glowTex) {
    console.warn('glowTex 未初始化，跳过粒子特效');
    appState.glowTex = null;
  }
  appState.panoramaTexture.wrapS = THREE.RepeatWrapping;
  appState.panoramaTexture.wrapT = THREE.RepeatWrapping;
  appState.panoramaTexture.repeat.set(1, 1);

  const skySphereGeometry = new THREE.SphereGeometry(500, 64, 32);
  const skySphereMaterial = new THREE.ShaderMaterial({
    uniforms: {
      textureMap: { value: appState.panoramaTexture },
      transitionProgress: { value: 1.0 },
      hueShift: { value: 0.0 },
      brightness: { value: 1.0 },
      saturation: { value: 1.0 }
    },
    vertexShader: `
      varying vec2 vUv;
      varying float vDistanceToPole;
      varying vec3 vNormal;
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec3 poleDir = normalize(vec3(0.0, 1.0, 0.0));
        vDistanceToPole = acos(dot(vNormal, poleDir)) / 3.1415926;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D textureMap;
      uniform float transitionProgress;
      uniform float hueShift;
      uniform float brightness;
      uniform float saturation;
      varying vec2 vUv;
      varying float vDistanceToPole;

      vec3 hueShiftColor(vec3 color, float hue) {
        float angle = hue * 6.2831853;
        float s = sin(angle);
        float c = cos(angle);
        vec3 rgb = (vec3(0.299, 0.587, 0.114) * color.rgb);
        vec3 newColor = vec3(
          (0.299 + 0.701 * c + 0.168 * s) * color.r +
          (0.587 - 0.587 * c + 0.330 * s) * color.g +
          (0.114 - 0.114 * c - 0.497 * s) * color.b,
          (0.299 - 0.299 * c - 0.328 * s) * color.r +
          (0.587 + 0.413 * c + 0.035 * s) * color.g +
          (0.114 - 0.114 * c + 0.292 * s) * color.b,
          (0.299 - 0.3 * c + 1.25 * s) * color.r +
          (0.587 - 0.588 * c - 1.05 * s) * color.g +
          (0.114 + 0.886 * c - 0.203 * s) * color.b
        );
        return newColor;
      }

      vec3 applySaturation(vec3 color, float sat) {
        float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
        return mix(vec3(gray), color.rgb, sat);
      }

      void main() {
        vec4 texColor = texture2D(textureMap, vUv);
        vec3 shiftedColor = hueShiftColor(texColor.rgb, hueShift);
        shiftedColor = applySaturation(shiftedColor, saturation);
        shiftedColor *= brightness;

        if (transitionProgress >= 1.0) {
          gl_FragColor = vec4(shiftedColor, 1.0);
        } else {
          float spreadRadius = transitionProgress + 0.2;
          float edgeSmooth = 0.15;
          float spreadAlpha = 1.0 - smoothstep(spreadRadius - edgeSmooth, spreadRadius + edgeSmooth, vDistanceToPole);
          float fadeAlpha = transitionProgress;
          float alpha = spreadAlpha * fadeAlpha;
          gl_FragColor = vec4(shiftedColor, alpha);
        }
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
    transparent: true
  });
  const skySphere = new THREE.Mesh(skySphereGeometry, skySphereMaterial);
  skySphere.renderOrder = -1;
  appState.scene.add(skySphere);
  appState.skySphere = skySphere;

  function createRadialStarField(count, rx, ry, rz, size, colorFn, center = new THREE.Vector3(0, 0, 0), falloff = 120, texture = null) {
    const g = new THREE.BufferGeometry();
    const p = [], c = [];
    const _tmpPos = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * rx, y = (Math.random() - 0.5) * ry, z = (Math.random() - 0.5) * rz;
      p.push(x, y, z);
      _tmpPos.set(x, y, z);
      const d = center.distanceTo(_tmpPos);
      const br = Math.max(0, 1 - d / falloff);
      const col = colorFn();
      c.push(col.r * br, col.g * br, col.b * br);
    }
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(p), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(c), 3));
    const mat = new THREE.PointsMaterial({ size, map: texture || null, vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
    return new THREE.Points(g, mat);
  }

  // GPU 粒子材质工厂：将 CPU 逐帧颜色/闪烁计算迁移到 GPU
  function createGPUParticleMat(params) {
    const { size, map, opacity, blending, depthWrite, depthTest, hasFlicker } = params;
    const uniforms = {
      uTime: { value: 0 },
      uHueShift: { value: 0 },
      uSize: { value: size },           // 原始 size（world units）
      uScale: { value: window.innerHeight / 4 },  // = clientHeight/4，匹配 Three.js Points 衰减
      uOpacity: { value: opacity ?? 0.9 },
      uTexture: { value: map }
    };
    appState._gpuParticleUniforms.push(uniforms);

    const hueShiftSrc = `
      vec3 hueShift(vec3 col, float hue) {
        float angle = hue * 6.2831853;
        float s = sin(angle), c = cos(angle);
        return vec3(
          (0.299 + 0.701*c + 0.168*s)*col.r + (0.587 - 0.587*c + 0.330*s)*col.g + (0.114 - 0.114*c - 0.497*s)*col.b,
          (0.299 - 0.299*c - 0.328*s)*col.r + (0.587 + 0.413*c + 0.035*s)*col.g + (0.114 - 0.114*c + 0.292*s)*col.b,
          (0.299 - 0.3*c + 1.25*s)*col.r + (0.587 - 0.588*c - 1.05*s)*col.g + (0.114 + 0.886*c - 0.203*s)*col.b
        );
      }
    `;

    const vertexShader = hasFlicker ? `
      attribute float aPhase;
      attribute float aSpeed;
      attribute vec3 color;
      uniform float uTime;
      uniform float uHueShift;
      uniform float uSize;
      uniform float uScale;
      varying vec3 vColor;
      ${hueShiftSrc}
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = uSize * (uScale / -mvPosition.z);
        float flicker = 0.5 + 0.5 * sin(uTime * aSpeed + aPhase);
        vColor = hueShift(color, uHueShift) * flicker;
        gl_Position = projectionMatrix * mvPosition;
      }
    ` : `
      attribute vec3 color;
      uniform float uHueShift;
      uniform float uSize;
      uniform float uScale;
      varying vec3 vColor;
      ${hueShiftSrc}
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = uSize * (uScale / -mvPosition.z);
        vColor = hueShift(color, uHueShift);
        gl_Position = projectionMatrix * mvPosition;
      }
    `;

    const fragmentShader = `
      uniform sampler2D uTexture;
      uniform float uOpacity;
      varying vec3 vColor;
      void main() {
        vec4 texColor = texture2D(uTexture, gl_PointCoord);
        gl_FragColor = vec4(vColor, uOpacity * texColor.a);
      }
    `;

    return new THREE.ShaderMaterial({
      uniforms, vertexShader, fragmentShader,
      transparent: true,
      depthWrite: depthWrite !== undefined ? depthWrite : false,
      depthTest: depthTest !== undefined ? depthTest : true,
      blending: blending || THREE.AdditiveBlending
    });
  }

  const stars1 = createRadialStarField(4000, 300, 200, 120, 0.18, () => ({ r: 0.8 + Math.random() * 0.2, g: 0.8 + Math.random() * 0.2, b: 0.9 + Math.random() * 0.1 }), new THREE.Vector3(0, 0, 0), 150, appState.glowTex);
  const stars2 = createRadialStarField(2500, 250, 180, 100, 0.25, () => new THREE.Color().setHSL(0.55 + Math.random() * 0.3, 0.8, 0.7), new THREE.Vector3(0, 0, 0), 140, appState.glowTex);
  const stars3 = createRadialStarField(1200, 220, 150, 80, 0.35, () => new THREE.Color().setHSL(0.1 + Math.random() * 0.2, 1.0, 0.7), new THREE.Vector3(0, 0, 0), 130, appState.glowTex);
  const nebula1 = createRadialStarField(1500, 200, 150, 100, 0.45, () => new THREE.Color().setHSL(0.5 + Math.random() * 0.5, 1.0, 0.5), new THREE.Vector3(0, 0, 0), 140, appState.glowTex);
  const nebula2 = createRadialStarField(800, 280, 180, 130, 0.6, () => new THREE.Color().setHSL(Math.random(), 1.0, 0.6), new THREE.Vector3(0, 0, 0), 160, appState.glowTex);
  const galaxy1 = createRadialStarField(3000, 100, 60, 60, 0.35, () => new THREE.Color().setHSL(0.55 + Math.random() * 0.3, 1.0, 0.5 + Math.random() * 0.3), new THREE.Vector3(0, -15, 0), 80, appState.glowTex);
  const galaxy2 = createRadialStarField(2000, 120, 70, 70, 0.5, () => new THREE.Color().setHSL(0.6 + Math.random() * 0.2, 1.0, 0.6), new THREE.Vector3(0, -20, 0), 100, appState.glowTex);

  const dustCount = 2000;
  const dustGeo = new THREE.BufferGeometry();
  const dustP = [], dustC = [];
  for (let i = 0; i < dustCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 15 + Math.random() * 60;
    dustP.push(Math.sin(phi) * Math.cos(theta) * r, Math.sin(phi) * Math.sin(theta) * r * 0.6, Math.cos(phi) * r);
    const col = new THREE.Color().setHSL(Math.random(), 0.9, 0.7 + Math.random() * 0.3);
    dustC.push(col.r, col.g, col.b);
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(dustP), 3));
  dustGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(dustC), 3));
  const dustMat = new THREE.PointsMaterial({ size: 0.12, map: appState.glowTex, vertexColors: true, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true });
  const dustField = new THREE.Points(dustGeo, dustMat);
  appState.scene.add(dustField);

  const rainbowCount = 1200;
  const rainbowGeo = new THREE.BufferGeometry();
  const rainbowP = [], rainbowC = [];
  for (let i = 0; i < rainbowCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 80 + Math.random() * 120;
    rainbowP.push(Math.sin(phi) * Math.cos(theta) * r, Math.sin(phi) * Math.sin(theta) * r * 0.5, Math.cos(phi) * r);
    const col = new THREE.Color().setHSL(Math.random(), 1.0, 0.6);
    rainbowC.push(col.r, col.g, col.b);
  }
  rainbowGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(rainbowP), 3));
  rainbowGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(rainbowC), 3));
  const rainbowMat = new THREE.PointsMaterial({ size: 0.25, map: appState.glowTex, vertexColors: true, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true });
  const rainbowField = new THREE.Points(rainbowGeo, rainbowMat);
  appState.scene.add(rainbowField);

  const ribbonCount = 400;
  const ribbonGeo = new THREE.BufferGeometry();
  const ribbonP = [], ribbonC = [];
  for (let i = 0; i < ribbonCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 60 + Math.random() * 40;
    const y = (Math.random() - 0.5) * 25;
    ribbonP.push(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
    const col = new THREE.Color().setHSL(0.6 + Math.random() * 0.4, 1.0, 0.6);
    ribbonC.push(col.r, col.g, col.b);
  }
  ribbonGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ribbonP), 3));
  ribbonGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(ribbonC), 3));
  const ribbonMat = new THREE.PointsMaterial({ size: 0.5, map: appState.glowTex, vertexColors: true, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
  const ribbonField = new THREE.Points(ribbonGeo, ribbonMat);
  appState.scene.add(ribbonField);

  const twinkleCount = 30000;
  const twinkleGeo = new THREE.BufferGeometry();
  const twinkleP = [], twinkleC = [];
  for (let i = 0; i < twinkleCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 40 + Math.random() * 180;
    twinkleP.push(
      Math.sin(phi) * Math.cos(theta) * r,
      Math.sin(phi) * Math.sin(theta) * r * 0.7,
      Math.cos(phi) * r
    );
    const hue = Math.random() < 0.7 ? 0 : Math.random() < 0.5 ? 210 : 50;
    const col = new THREE.Color().setHSL(hue, 0.3, 0.8 + Math.random() * 0.2);
    twinkleC.push(col.r, col.g, col.b);
  }
  twinkleGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(twinkleP), 3));
  twinkleGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(twinkleC), 3));
  
  // GPU 闪烁属性（每个星星独立相位和速度，由 GPU 计算，不再 CPU 逐帧更新）
  const twinklePhase = new Float32Array(twinkleCount);
  const twinkleSpeed = new Float32Array(twinkleCount);
  for (let i = 0; i < twinkleCount; i++) {
    twinklePhase[i] = Math.random() * Math.PI * 2;
    twinkleSpeed[i] = 0.3 + Math.random() * 1.5;
  }
  twinkleGeo.setAttribute('aPhase', new THREE.BufferAttribute(twinklePhase, 1));
  twinkleGeo.setAttribute('aSpeed', new THREE.BufferAttribute(twinkleSpeed, 1));
  
  const twinkleMat = new THREE.PointsMaterial({
    size: 0.25,
    map: appState.glowTex,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    transparent: true,
    opacity: 0.8
  });
  const twinkleField = new THREE.Points(twinkleGeo, twinkleMat);
  appState.scene.add(twinkleField);

  appState.starGroups.push({
    points: twinkleField,
    baseOpacity: 0.8,
    phase: Math.random() * Math.PI * 2,
    speed: 1.5
  });
  appState.nebulaFlowGroups.push(twinkleField);
  appState.starGroups.push(
    { points: dustField, baseOpacity: 0.7, phase: 0.8, speed: 0.6 },
    { points: rainbowField, baseOpacity: 0.5, phase: 1.5, speed: 0.4 },
    { points: ribbonField, baseOpacity: 0.3, phase: 2.2, speed: 1.1 }
  );
  appState.nebulaFlowGroups.push(rainbowField, ribbonField);

  const flowCount = 600;
  const flowGeo = new THREE.BufferGeometry();
  const flowP = [], flowC = [];
  for (let i = 0; i < flowCount; i++) {
    const a = Math.random() * Math.PI * 2, r = 50 + Math.random() * 90;
    flowP.push(Math.cos(a) * r, (Math.random() - 0.5) * 40 - 10, Math.sin(a) * r);
    const col = new THREE.Color().setHSL(Math.random(), 1.0, 0.7);
    flowC.push(col.r, col.g, col.b);
  }
  flowGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(flowP), 3));
  flowGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(flowC), 3));
  const flowMat = new THREE.PointsMaterial({ size: 0.7, map: appState.glowTex, vertexColors: true, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
  appState.flowField = new THREE.Points(flowGeo, flowMat);
  appState.scene.add(appState.flowField);

  appState.scene.add(stars1); appState.scene.add(stars2); appState.scene.add(stars3);
  appState.scene.add(nebula1); appState.scene.add(nebula2);
  appState.scene.add(galaxy1); appState.scene.add(galaxy2);

  appState.starGroups.push(
    { points: stars1, baseOpacity: 0.9, phase: 0, speed: 1.2 },
    { points: stars2, baseOpacity: 0.9, phase: 0.5, speed: 1.5 },
    { points: stars3, baseOpacity: 0.9, phase: 1.0, speed: 1.8 },
    { points: appState.flowField, baseOpacity: 0.4, phase: 0.3, speed: 2.0 },
    { points: nebula1, baseOpacity: 0.3, phase: 2.0, speed: 0.8 },
    { points: nebula2, baseOpacity: 0.25, phase: 2.5, speed: 0.9 },
    { points: galaxy1, baseOpacity: 0.4, phase: 1.2, speed: 0.7 },
    { points: galaxy2, baseOpacity: 0.35, phase: 1.8, speed: 0.6 }
  );
  appState.nebulaFlowGroups.push(nebula1, nebula2, galaxy1, galaxy2);

  // === GPU 材质替换：将颜色偏移/闪烁计算从 CPU 迁移到 GPU ===
  appState.nebulaFlowGroups.forEach(group => {
    const origMat = group.material;
    if (!origMat || origMat.type !== 'PointsMaterial') return;
    if (!group.geometry.attributes.color) return;
    const newMat = createGPUParticleMat({
      size: origMat.size,
      map: origMat.map,
      opacity: origMat.opacity,
      blending: origMat.blending,
      depthWrite: origMat.depthWrite,
      depthTest: origMat.depthTest,
      hasFlicker: group === twinkleField
    });
    group.material = newMat;
  });

  appState.scene.add(new THREE.AmbientLight(0x111a22));
  const dirLight = new THREE.DirectionalLight(0xccddff, 0.7);
  dirLight.position.set(1, 2, 1);
  appState.scene.add(dirLight);
  const pointLight1 = new THREE.PointLight(0x2266aa, 0.5);
  pointLight1.position.set(-1, 1, -1.5);
  appState.scene.add(pointLight1);
  let backGlow = new THREE.PointLight(0x33aacc, 0.7);
  backGlow.position.set(0, 0.5, -2.8);
  appState.scene.add(backGlow);
  appState.backGlow = backGlow;
  const pointLight2 = new THREE.PointLight(0xff44aa, 0.6);
  pointLight2.position.set(2, 3, 2);
  appState.scene.add(pointLight2);
  const pointLight3 = new THREE.PointLight(0x44ffaa, 0.5);
  pointLight3.position.set(-2, 1.5, 3);
  appState.scene.add(pointLight3);

  // ========== 流星系统 ==========
  appState.meteors = [];
  const meteorCount = 25;
  // 共享 trail 粒子 geometry（按 j 索引缓存，25 流星 × 15 粒子 = 375 个 geometry → 15 个）
  const _meteorTrailGeoms = [];
  for (let j = 0; j < 15; j++) {
    _meteorTrailGeoms.push(new THREE.SphereGeometry(0.04 * (1 - j / 15), 4, 4));
  }
  const _meteorHeadGeom = new THREE.SphereGeometry(0.08, 8, 8);
  for (let i = 0; i < meteorCount; i++) {
    createMeteor(i);
  }

  function createMeteor(index) {
    const trailLength = 15;
    const group = new THREE.Group();
    
    const headMat = new THREE.MeshBasicMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    const head = new THREE.Mesh(_meteorHeadGeom, headMat);
    group.add(head);
    
    const trailParticles = [];
    for (let j = 0; j < trailLength; j++) {
      const particleMat = new THREE.MeshBasicMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 1 - j / trailLength });
      const particle = new THREE.Mesh(_meteorTrailGeoms[j], particleMat);
      particle.visible = false;
      group.add(particle);
      trailParticles.push(particle);
    }
    
    group.visible = false;
    appState.scene.add(group);
    
    appState.meteors.push({
      group,
      head,
      trail: trailParticles,
      velocity: new THREE.Vector3(),
      position: new THREE.Vector3(),
      life: 0,
      maxLife: 0,
      color: new THREE.Color(),
      active: false
    });
  }

  appState.galaxy1 = galaxy1; appState.galaxy2 = galaxy2;
  appState.nebula1 = nebula1; appState.nebula2 = nebula2;
  appState.stars1 = stars1; appState.stars2 = stars2; appState.stars3 = stars3;

  // ========== UI 事件绑定 ==========
  const resizeHandler = () => {
    const w = window.innerWidth, h = window.innerHeight;
    appState.camera.aspect = w / h;
    appState.camera.updateProjectionMatrix();
    appState.renderer.setSize(w, h);
    appState.effectComposer.setSize(w, h);
    appState.labelRenderer.setSize(w, h);
    // 更新 GPU 粒子材质的像素缩放
    appState._gpuParticleUniforms.forEach(u => u.uScale.value = h / 4);
  };
  window.addEventListener('resize', resizeHandler);
  appState._resizeHandler = resizeHandler;

  console.log('✅ initScene() completed.');
}