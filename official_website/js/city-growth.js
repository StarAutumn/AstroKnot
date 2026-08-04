        import * as THREE from 'three';
        import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

        // ── 门控状态（模块级）──
        let cityInited = false;
        let cityRunning = false;
        let cityRAF = null;
        let _cityAPI = null;
        let _cityVisible = false;
        let _techVisible = false;  // #tech 区段可见性（用于判断滚动方向）
        const cityLayer = document.getElementById('city-layer');
        const vcOverlay = document.getElementById('value-card-overlay');  // 价值卡片浮层
        const valueSection = document.getElementById('value');

        function startCity() {
            if (cityRunning || !_cityAPI) return;
            cityRunning = true;
            cityRAF = requestAnimationFrame(_cityAPI.animate);
        }

        function stopCity() {
            cityRunning = false;
            if (cityRAF) { cancelAnimationFrame(cityRAF); cityRAF = null; }
        }

        // ============================================================
        //  initCityScene — 构建城市场景（首次进入 #value 时调用一次）
        // ============================================================
        function initCityScene() {
            // ============================================================
            //  1. 场景 / 相机 / 渲染器
            // ============================================================
            const scene = new THREE.Scene();
            scene.background = new THREE.Color(0x080c18);
            scene.fog = new THREE.Fog(0x080c18, 45, 80);

            const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 120);
            camera.position.set(28, 22, 32);
            camera.lookAt(0, 2, 0);

            // 性能优化：像素比限制 1.5（高DPI屏渲染像素减半，视觉几乎无差异）
            const renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
            renderer.shadowMap.enabled = true;
            // PCFShadowMap 比 PCFSoftShadowMap 快，视觉差异小
            renderer.shadowMap.type = THREE.PCFShadowMap;
            renderer.toneMapping = THREE.ACESFilmicToneMapping;
            renderer.toneMappingExposure = 1.0;
            cityLayer.appendChild(renderer.domElement);

            // 控制器（pointer-events:none 下为惰性，保留以贴近原文件）
            const controls = new OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.06;
            controls.minDistance = 6;
            controls.maxDistance = 80;
            controls.maxPolarAngle = Math.PI / 2.15;
            controls.target.set(0, 3, 0);
            controls.update();

            // ============================================================
            //  2. 灯光（夜间科技感氛围）
            // ============================================================
            const ambient = new THREE.AmbientLight(0x304060, 0.45);
            scene.add(ambient);

            const hemi = new THREE.HemisphereLight(0x6088bb, 0x1a1a2e, 0.6);
            scene.add(hemi);

            const sun = new THREE.DirectionalLight(0xccddff, 1.2);
            sun.position.set(20, 30, 10);
            sun.castShadow = true;
            // 阴影贴图 1024（视觉差异小，GPU内存与带宽减半）
            sun.shadow.mapSize.width = 1024;
            sun.shadow.mapSize.height = 1024;
            sun.shadow.camera.near = 0.5;
            sun.shadow.camera.far = 60;
            sun.shadow.camera.left = -30;
            sun.shadow.camera.right = 30;
            sun.shadow.camera.top = 30;
            sun.shadow.camera.bottom = -30;
            scene.add(sun);

            const fill = new THREE.DirectionalLight(0x6688ff, 0.4);
            fill.position.set(-20, 10, -20);
            scene.add(fill);

            const rim = new THREE.DirectionalLight(0x4488cc, 0.2);
            rim.position.set(0, -10, 20);
            scene.add(rim);

            // ============================================================
            //  3. 地面（可见）
            // ============================================================
            const groundGeo = new THREE.PlaneGeometry(60, 60);
            const groundMat = new THREE.MeshStandardMaterial({
                color: 0x0a1628,
                roughness: 0.7,
                metalness: 0.1,
            });
            const ground = new THREE.Mesh(groundGeo, groundMat);
            ground.rotation.x = -Math.PI / 2;
            ground.position.y = 0;
            ground.receiveShadow = true;
            scene.add(ground);

            // 网格辅助
            const gridHelper = new THREE.GridHelper(56, 28, 0x4488ff, 0x224466);
            gridHelper.position.y = 0.01;
            gridHelper.material.transparent = true;
            gridHelper.material.opacity = 0;
            scene.add(gridHelper);

            // 外圈装饰环
            const ringPoints = [];
            const ringRadius = 26;
            for (let i = 0; i <= 64; i++) {
                const theta = (i / 64) * Math.PI * 2;
                ringPoints.push(new THREE.Vector3(Math.cos(theta) * ringRadius, 0, Math.sin(theta) * ringRadius));
            }
            const ringGeo = new THREE.BufferGeometry().setFromPoints(ringPoints);
            const ringLine = new THREE.Line(ringGeo, new THREE.LineBasicMaterial({
                color: 0x4488ff,
                transparent: true,
                opacity: 0.08,
            }));
            scene.add(ringLine);

            // ============================================================
            //  4. 定义河流路径（蜿蜒穿过城市）
            // ============================================================
            const riverPoints = [
                new THREE.Vector3(-30, 0, -18),
                new THREE.Vector3(-26, 0, -14),
                new THREE.Vector3(-22, 0, -8),
                new THREE.Vector3(-16, 0, -4),
                new THREE.Vector3(-10, 0, 0),
                new THREE.Vector3(-4, 0, 2),
                new THREE.Vector3(2, 0, 1),
                new THREE.Vector3(8, 0, -2),
                new THREE.Vector3(14, 0, -4),
                new THREE.Vector3(20, 0, -2),
                new THREE.Vector3(26, 0, 2),
                new THREE.Vector3(32, 0, 8),
            ];
            const fullCurve = new THREE.CatmullRomCurve3(riverPoints);
            // 预采样路径点（用于碰撞检测和河流生长）
            const PATH_SAMPLES = 300;
            const fullPathPoints = [];
            for (let i = 0; i <= PATH_SAMPLES; i++) {
                const t = i / PATH_SAMPLES;
                const pt = fullCurve.getPoint(t);
                fullPathPoints.push(pt);
            }

            // 河流宽度
            const riverWidth = 9;
            const RIVER_THRESHOLD = riverWidth / 2 + 0.6;

            // ============================================================
            //  4.5 相机阶段动画（双向：支持向上/向下滚动的反向过渡）
            //  阶段0=初始视角  阶段1=城市远视角  阶段2=城市近视角
            // ============================================================
            const camInitPos = new THREE.Vector3(28, 22, 32);
            const camInitTarget = new THREE.Vector3(0, 2, 0);
            const camInitDistance = camInitPos.distanceTo(camInitTarget);
            const bridgeCenterPos = fullCurve.getPoint(0.5);
            const bridgeTangentDir = fullCurve.getTangent(0.5);
            const camDeckHeight = 1.5;
            // 阶段1：沿河流方向看桥梁侧面（保持初始距离）
            const camTargetPos = bridgeCenterPos.clone()
                .add(bridgeTangentDir.clone().multiplyScalar(camInitDistance))
                .setY(15);
            const camLookAt = bridgeCenterPos.clone().setY(camDeckHeight + 2);
            // 阶段2：更靠近桥梁（初始距离的 40%）
            const camCloseDistance = camInitDistance * 0.4;
            const camCloseTargetPos = bridgeCenterPos.clone()
                .add(bridgeTangentDir.clone().multiplyScalar(camCloseDistance))
                .setY(8);
            const camCloseLookAt = bridgeCenterPos.clone().setY(camDeckHeight);
            // 阶段3：向上退出 — 相机上升、远离城市（模拟升入太空，过渡到星空/地球视角）
            const camUpExitPos = new THREE.Vector3(10, 60, 20);
            const camUpExitLookAt = new THREE.Vector3(0, 0, 0);
            // 四个阶段的相机配置
            const camPhases = [
                { pos: camInitPos.clone(), target: camInitTarget.clone() },      // 0: 初始
                { pos: camTargetPos.clone(), target: camLookAt.clone() },        // 1: 城市远景
                { pos: camCloseTargetPos.clone(), target: camCloseLookAt.clone() }, // 2: 靠近桥梁
                { pos: camUpExitPos.clone(), target: camUpExitLookAt.clone() }   // 3: 向上退出
            ];
            // 阶段过渡状态
            let camCurrentPhase = 0;       // 当前所在阶段
            let camTargetPhase = 0;        // 过渡目标阶段
            let camTransitionProgress = 1; // 过渡进度（1=已完成）
            let camTransitionDuration = 3.0;
            const camTransitionStartPos = new THREE.Vector3();
            const camTransitionStartTarget = new THREE.Vector3();

            // 触发相机阶段过渡（支持任意方向）
            function transitionCameraTo(targetPhase, duration) {
                if (camTargetPhase === targetPhase && camTransitionProgress < 1) return; // 正在过渡到同一目标
                if (camCurrentPhase === targetPhase && camTransitionProgress >= 1) return; // 已在该阶段
                camTransitionStartPos.copy(camera.position);
                camTransitionStartTarget.copy(controls.target);
                camCurrentPhase = camTargetPhase; // 当前阶段 = 之前的过渡目标
                camTargetPhase = targetPhase;
                camTransitionProgress = 0;
                camTransitionDuration = duration;
            }

            // ---------- 判断点是否在河流区域内 ----------
            function isNearRiver(x, z, threshold = RIVER_THRESHOLD) {
                for (const pt of fullPathPoints) {
                    const dx = x - pt.x;
                    const dz = z - pt.z;
                    const dist = Math.sqrt(dx * dx + dz * dz);
                    if (dist < threshold) return true;
                }
                return false;
            }

            // ---------- 河流材质（复用） ----------
            const riverMat = new THREE.MeshPhysicalMaterial({
                color: 0x0088cc,
                transparent: true,
                opacity: 0.55,
                roughness: 0.15,
                metalness: 0.4,
                envMapIntensity: 0.6,
                clearcoat: 0.1,
                clearcoatRoughness: 0.2,
                side: THREE.DoubleSide,
            });

            const riverEdgeMat = new THREE.LineBasicMaterial({
                color: 0x66ccff,
                transparent: true,
                opacity: 0.08,
            });

            // ---------- 河流容器 ----------
            const riverGroup = new THREE.Group();
            scene.add(riverGroup);

            // 河流装饰容器（浮标、船只等）
            const riverDecorGroup = new THREE.Group();
            scene.add(riverDecorGroup);

            let lastRiverProgress = -1;

            // ---------- 构建河流（根据进度） ----------
            function buildRiver(progress) {
                if (Math.abs(progress - lastRiverProgress) < 0.001) return;
                lastRiverProgress = progress;

                while (riverGroup.children.length > 0) {
                    const child = riverGroup.children[0];
                    if (child.geometry) child.geometry.dispose();
                    riverGroup.remove(child);
                }

                if (progress < 0.02) return;

                const count = Math.floor(PATH_SAMPLES * progress);
                if (count < 4) return;

                const pts = fullPathPoints.slice(0, count + 1);
                if (pts.length < 4) return;

                try {
                    const subCurve = new THREE.CatmullRomCurve3(pts);
                    const tubeGeo = new THREE.TubeGeometry(subCurve, Math.min(80, Math.max(20, pts.length * 2)), riverWidth / 2, 8,
                        false);
                    const mesh = new THREE.Mesh(tubeGeo, riverMat);
                    mesh.scale.y = 0.05;
                    mesh.position.y = 0.01;
                    mesh.receiveShadow = false;
                    riverGroup.add(mesh);

                    // 蓝色荧光沿岸线 — 两侧各一条发光线
                    const bankGlowMat = new THREE.LineBasicMaterial({
                        color: 0x44ccff,
                        transparent: true,
                        opacity: 0.55,
                        blending: THREE.AdditiveBlending,
                        depthWrite: false,
                    });
                    const bankOffset = riverWidth / 2 + 0.3;
                    for (const side of [-1, 1]) {
                        const bankPts = [];
                        for (let i = 0; i <= Math.min(count, pts.length - 1); i++) {
                            const t = i / Math.max(1, count);
                            const pt = subCurve.getPoint(Math.min(t, 1));
                            const tan = subCurve.getTangent(Math.min(t, 0.999));
                            const normal = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
                            bankPts.push(new THREE.Vector3(
                                pt.x + normal.x * side * bankOffset,
                                0.05,
                                pt.z + normal.z * side * bankOffset
                            ));
                        }
                        if (bankPts.length >= 2) {
                            const bankGeo = new THREE.BufferGeometry().setFromPoints(bankPts);
                            const bankLine = new THREE.Line(bankGeo, bankGlowMat);
                            riverGroup.add(bankLine);
                        }
                    }

                    const edgesGeo = new THREE.EdgesGeometry(tubeGeo);
                    const edgeLine = new THREE.LineSegments(edgesGeo, riverEdgeMat);
                    edgeLine.scale.y = 0.05;
                    edgeLine.position.y = 0.01;
                    riverGroup.add(edgeLine);

                    // 添加河面波光效果
                    const waveCount = Math.floor(count / 3);
                    for (let i = 0; i < waveCount; i++) {
                        const t = Math.random();
                        const wavePos = subCurve.getPoint(t);
                        const waveMat = new THREE.SpriteMaterial({
                            map: carTexture,
                            color: new THREE.Color().setHSL(0.55 + Math.random() * 0.1, 0.8, 0.6 + Math.random() * 0.3),
                            transparent: true,
                            blending: THREE.AdditiveBlending,
                            depthWrite: false,
                            opacity: 0.15 + Math.random() * 0.15,
                        });
                        const waveSprite = new THREE.Sprite(waveMat);
                        waveSprite.scale.set(0.3 + Math.random() * 0.4, 0.3 + Math.random() * 0.4, 1);
                        waveSprite.position.set(wavePos.x + (Math.random() - 0.5) * riverWidth * 0.6, 0.02, wavePos.z + (Math.random() - 0.5) * riverWidth * 0.6);
                        riverGroup.add(waveSprite);
                    }

                    // 添加浮标
                    const buoyCount = Math.floor(count / 5);
                    for (let i = 0; i < buoyCount; i++) {
                        const t = 0.1 + Math.random() * 0.8;
                        const buoyPos = subCurve.getPoint(t);
                        const buoyOffset = (Math.random() - 0.5) * riverWidth * 0.7;
                        const tangent = subCurve.getTangent(t);
                        const buoyDir = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

                        const buoyMat = new THREE.SpriteMaterial({
                            map: carTexture,
                            color: new THREE.Color().setHSL(Math.random(), 0.7 + Math.random() * 0.3, 0.5 + Math.random() * 0.2),
                            transparent: true,
                            blending: THREE.AdditiveBlending,
                            depthWrite: false,
                            opacity: 0.5,
                        });
                        const buoySprite = new THREE.Sprite(buoyMat);
                        buoySprite.scale.set(0.2, 0.2, 1);
                        buoySprite.position.set(
                            buoyPos.x + buoyDir.x * buoyOffset,
                            0.03,
                            buoyPos.z + buoyDir.z * buoyOffset
                        );
                        riverGroup.add(buoySprite);
                    }

                } catch (e) {
                    console.warn('河流构建失败:', e);
                }
            }

            console.log('🌊 蜿蜒河流已定义，宽度 ' + riverWidth + ' 单位，将随城市同步生长');

            // ============================================================
            //  4.5 创建桥梁（横跨河流）
            // ============================================================
            let bridgeGroup = new THREE.Group();
            scene.add(bridgeGroup);
            let bridgeCars = [];
            let _bridgeTowerPositions = [];  // 存储桥塔位置，供卡片放置参考

            function createBridge() {
                // 清空旧桥
                while (bridgeGroup.children.length > 0) {
                    const child = bridgeGroup.children[0];
                    if (child.geometry) child.geometry.dispose();
                    bridgeGroup.remove(child);
                }
                _bridgeTowerPositions = [];  // 重置桥塔位置记录
                for (const car of bridgeCars) {
                    scene.remove(car.mesh);
                    car.mesh.material.dispose();
                }
                bridgeCars = [];

                const t = 0.5;
                const pos = fullCurve.getPoint(t);
                const tangent = fullCurve.getTangent(t);
                const dir = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

                // ===== 随机颜色 =====
                const bridgeColor1 = new THREE.Color().setHSL(Math.random(), 0.6 + Math.random() * 0.3, 0.4 + Math.random() * 0.3);
                const bridgeColor2 = new THREE.Color().setHSL(Math.random(), 0.5 + Math.random() * 0.4, 0.3 + Math.random() * 0.3);
                const bridgeColor3 = new THREE.Color().setHSL(Math.random(), 0.7 + Math.random() * 0.3, 0.5 + Math.random() * 0.3);
                const towerEmissive = new THREE.Color().setHSL(Math.random(), 0.6, 0.2 + Math.random() * 0.2);
                const cableColor1 = new THREE.Color().setHSL(Math.random(), 0.7 + Math.random() * 0.3, 0.5 + Math.random() * 0.3);
                const cableColor2 = new THREE.Color().setHSL(Math.random(), 0.5 + Math.random() * 0.3, 0.4 + Math.random() * 0.2);
                const edgeColor = new THREE.Color().setHSL(Math.random(), 0.8, 0.6 + Math.random() * 0.3);

                // ===== 参数 =====
                const bridgeLength = riverWidth * 1.2;   // 稍微加长
                const bridgeWidth = 1.2;
                const bridgeHeight = 0.2;
                const deckHeight = 1.5;                  // 桥面抬高到1.5
                const towerHeight = 5.0;
                const cableCount = 5;


                // ----- 1. 引桥（斜坡） -----
                const rampMat = new THREE.MeshStandardMaterial({
                    color: bridgeColor1,
                    roughness: 0.6,
                    metalness: 0.3,
                    transparent: true,
                    opacity: 0.7,
                });
                const rampLength = 2.5;
                const rampWidth = bridgeWidth;  // 与桥面同宽，对齐更美观
                const rampPositions = [-bridgeLength / 2 - rampLength / 2, bridgeLength / 2 + rampLength / 2];
                for (const rOff of rampPositions) {
                    let startPos, endPos;
                    if (rOff < 0) {
                        // 左端：地面在左（远离中心），桥面在右（靠近中心）
                        startPos = pos.clone().add(dir.clone().multiplyScalar(rOff - rampLength / 2));
                        endPos = pos.clone().add(dir.clone().multiplyScalar(rOff + rampLength / 2));
                    } else {
                        // 右端：地面在右（远离中心），桥面在左（靠近中心）
                        startPos = pos.clone().add(dir.clone().multiplyScalar(rOff + rampLength / 2));
                        endPos = pos.clone().add(dir.clone().multiplyScalar(rOff - rampLength / 2));
                    }
                    startPos.y = 0.0;                      // 地面
                    endPos.y = deckHeight;                  // 桥面中心高度，使斜坡与桥面对齐

                    const midPos = new THREE.Vector3().addVectors(startPos, endPos).multiplyScalar(0.5);
                    const direction = new THREE.Vector3().subVectors(endPos, startPos);
                    const length = direction.length();
                    direction.normalize();

                    // 构造正确的旋转：确保宽度方向保持水平
                    const horizontalDir = new THREE.Vector3(direction.x, 0, direction.z).normalize();
                    const sideAxis = new THREE.Vector3(-horizontalDir.z, 0, horizontalDir.x);  // 垂直于水平方向
                    const upAxis = new THREE.Vector3().crossVectors(sideAxis, direction).normalize();

                    const rampMatrix = new THREE.Matrix4();
                    rampMatrix.makeBasis(direction, upAxis, sideAxis);
                    const rampQuaternion = new THREE.Quaternion();
                    rampQuaternion.setFromRotationMatrix(rampMatrix);

                    const rampGeo = new THREE.BoxGeometry(length, 0.05, rampWidth);
                    const ramp = new THREE.Mesh(rampGeo, rampMat);
                    ramp.position.copy(midPos);
                    ramp.quaternion.copy(rampQuaternion);
                    ramp.castShadow = true;
                    ramp.receiveShadow = true;
                    bridgeGroup.add(ramp);

                    // 斜坡边缘发光带
                    const rampEdgeMat = new THREE.LineBasicMaterial({ color: edgeColor, transparent: true, opacity: 0.4 });
                    const halfW = rampWidth / 2;
                    const ep1 = [new THREE.Vector3(-length / 2, 0.03, -halfW), new THREE.Vector3(length / 2, 0.03, -halfW)];
                    const ep2 = [new THREE.Vector3(-length / 2, 0.03, halfW), new THREE.Vector3(length / 2, 0.03, halfW)];
                    const eg1 = new THREE.BufferGeometry().setFromPoints(ep1);
                    const eg2 = new THREE.BufferGeometry().setFromPoints(ep2);
                    const el1 = new THREE.Line(eg1, rampEdgeMat);
                    const el2 = new THREE.Line(eg2, rampEdgeMat);
                    el1.position.copy(midPos);
                    el1.quaternion.copy(rampQuaternion);
                    el2.position.copy(midPos);
                    el2.quaternion.copy(rampQuaternion);
                    bridgeGroup.add(el1);
                    bridgeGroup.add(el2);
                }

                // ----- 2. 桥面（架高） -----
                const deckGeo = new THREE.BoxGeometry(bridgeLength, bridgeHeight, bridgeWidth);
                const deckMat = new THREE.MeshStandardMaterial({
                    color: bridgeColor1,
                    roughness: 0.5,
                    metalness: 0.4,
                    transparent: true,
                    opacity: 0.85,
                });
                const deck = new THREE.Mesh(deckGeo, deckMat);
                deck.position.set(pos.x, deckHeight, pos.z);
                deck.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
                deck.castShadow = true;
                deck.receiveShadow = true;
                bridgeGroup.add(deck);

                // 桥面边缘发光带
                const edgeMat = new THREE.LineBasicMaterial({ color: edgeColor, transparent: true, opacity: 0.6 });
                const halfLen = bridgeLength / 2;
                const halfWid = bridgeWidth / 2;
                const p1 = [new THREE.Vector3(-halfLen, 0.02, -halfWid), new THREE.Vector3(halfLen, 0.02, -halfWid)];
                const p2 = [new THREE.Vector3(-halfLen, 0.02, halfWid), new THREE.Vector3(halfLen, 0.02, halfWid)];
                const g1 = new THREE.BufferGeometry().setFromPoints(p1);
                const g2 = new THREE.BufferGeometry().setFromPoints(p2);
                const l1 = new THREE.Line(g1, edgeMat);
                const l2 = new THREE.Line(g2, edgeMat);
                l1.position.copy(pos);
                l1.position.y = deckHeight;
                l1.quaternion.copy(deck.quaternion);
                l2.position.copy(pos);
                l2.position.y = deckHeight;
                l2.quaternion.copy(deck.quaternion);
                bridgeGroup.add(l1);
                bridgeGroup.add(l2);

                // ----- 3. 桥塔（锥体镂空结构，放在桥面两侧） -----
                const towerMat = new THREE.MeshStandardMaterial({
                    color: bridgeColor2,
                    roughness: 0.3,
                    metalness: 0.6,
                    emissive: towerEmissive,
                    emissiveIntensity: 0.15,
                });
                // 桥塔放在桥面两侧（垂直于桥方向），不挡路
                const perpDir = new THREE.Vector3(-dir.z, 0, dir.x).normalize();  // 垂直于桥方向
                const towerSideOffsets = [-halfWid - 1.0, halfWid + 1.0];  // 桥面两侧
                const towerAlongOffsets = [-bridgeLength / 2 + 1.0, bridgeLength / 2 - 1.0];  // 桥面两端附近
                for (const sideOff of towerSideOffsets) {
                    for (const alongOff of towerAlongOffsets) {
                        const towerPos = pos.clone()
                            .add(dir.clone().multiplyScalar(alongOff))
                            .add(perpDir.clone().multiplyScalar(sideOff));
                        const towerTopY = deckHeight + towerHeight;
                        // 记录桥塔位置（供卡片放置参考）
                        _bridgeTowerPositions.push(towerPos.clone());

                        // ---- 锥体镂空：4根立柱从底部向外倾斜，顶部收拢 ----
                        const pillarSize = 0.08;
                        // 底部四角位置（较大），顶部收拢到中心
                        const baseRadius = 0.4;
                        const topRadius = 0.1;
                        const pillarMaterial = new THREE.MeshStandardMaterial({
                            color: bridgeColor2,
                            roughness: 0.3,
                            metalness: 0.6,
                            emissive: towerEmissive,
                            emissiveIntensity: 0.15,
                        });
                        const cornerAngles = [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75];

                        for (const angle of cornerAngles) {
                        // 底部位置（向外）
                        const baseX = towerPos.x + Math.cos(angle) * baseRadius;
                        const baseZ = towerPos.z + Math.sin(angle) * baseRadius;
                        // 顶部位置（向中心收拢）
                        const topX = towerPos.x + Math.cos(angle) * topRadius;
                        const topZ = towerPos.z + Math.sin(angle) * topRadius;

                        // 创建倾斜立柱：用细长的BoxGeometry，通过旋转实现倾斜
                        const pillarHeight = towerTopY;
                        const pillarLength = Math.sqrt(
                            Math.pow(topX - baseX, 2) + Math.pow(topZ - baseZ, 2) + Math.pow(pillarHeight, 2)
                        );
                        const pillarGeo = new THREE.BoxGeometry(pillarSize, pillarLength, pillarSize);
                        const pillar = new THREE.Mesh(pillarGeo, pillarMaterial);

                        // 立柱中心位置
                        const midX = (baseX + topX) / 2;
                        const midZ = (baseZ + topZ) / 2;
                        const midY = pillarHeight / 2;
                        pillar.position.set(midX, midY, midZ);

                        // 计算立柱方向并旋转
                        const pillarDir = new THREE.Vector3(topX - baseX, pillarHeight, topZ - baseZ).normalize();
                        const pillarQuat = new THREE.Quaternion();
                        const pillarMatrix = new THREE.Matrix4();
                        const pillarUp = new THREE.Vector3(0, 1, 0);
                        const pillarSide = new THREE.Vector3().crossVectors(pillarUp, pillarDir).normalize();
                        if (pillarSide.length() < 0.01) {
                            pillarSide.set(1, 0, 0);
                        }
                        const pillarRealUp = new THREE.Vector3().crossVectors(pillarDir, pillarSide).normalize();
                        pillarMatrix.makeBasis(pillarSide, pillarDir, pillarRealUp);
                        pillarQuat.setFromRotationMatrix(pillarMatrix);
                        pillar.quaternion.copy(pillarQuat);

                        pillar.castShadow = true;
                        pillar.receiveShadow = true;
                        bridgeGroup.add(pillar);
                    }

                    // ---- 横梁（每隔一定高度加一圈，形成镂空锥体） ----
                    const beamMat = new THREE.MeshStandardMaterial({
                        color: bridgeColor2,
                        roughness: 0.3,
                        metalness: 0.5,
                        emissive: towerEmissive,
                        emissiveIntensity: 0.08,
                    });
                    const beamSpacing = 0.8;
                    const beamCount = Math.floor(towerTopY / beamSpacing);
                    for (let i = 1; i <= beamCount; i++) {
                        const yPos = i * beamSpacing;
                        if (yPos > towerTopY - 0.2) break;
                        // 当前高度的半径（线性缩小）
                        const currentRadius = baseRadius - (baseRadius - topRadius) * (yPos / towerTopY);
                        // 四根横梁围成方形
                        const beamWidth = currentRadius * 2;
                        const beamGeo = new THREE.BoxGeometry(beamWidth, 0.05, 0.08);
                        // 两根平行于 dir 方向
                        for (let side = -1; side <= 1; side += 2) {
                            const beam = new THREE.Mesh(beamGeo, beamMat);
                            const beamPos = new THREE.Vector3(
                                towerPos.x,
                                yPos,
                                towerPos.z + side * currentRadius * 0.5
                            );
                            beam.position.copy(beamPos);
                            beam.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
                            beam.castShadow = true;
                            beam.receiveShadow = true;
                            bridgeGroup.add(beam);
                        }
                        // 两根垂直于 dir 方向
                        const perpDir = new THREE.Vector3(-dir.z, 0, dir.x);
                        const beamGeo2 = new THREE.BoxGeometry(0.08, 0.05, beamWidth);
                        for (let side = -1; side <= 1; side += 2) {
                            const beam = new THREE.Mesh(beamGeo2, beamMat);
                            const beamPos = new THREE.Vector3(
                                towerPos.x + side * currentRadius * 0.5,
                                yPos,
                                towerPos.z
                            );
                            beam.position.copy(beamPos);
                            beam.castShadow = true;
                            beam.receiveShadow = true;
                            bridgeGroup.add(beam);
                        }
                    }

                    // ---- 斜撑线（X形交叉，增强镂空感） ----
                    const crossMat = new THREE.LineBasicMaterial({
                        color: cableColor2,
                        transparent: true,
                        opacity: 0.25,
                    });
                    for (let i = 1; i < beamCount; i += 2) {
                        const y1 = i * beamSpacing;
                        const y2 = (i + 1) * beamSpacing;
                        if (y2 > towerTopY - 0.2) break;
                        const r1 = baseRadius - (baseRadius - topRadius) * (y1 / towerTopY);
                        const r2 = baseRadius - (baseRadius - topRadius) * (y2 / towerTopY);
                        // 四个角的连线
                        for (const angle of cornerAngles) {
                            const x1 = towerPos.x + Math.cos(angle) * r1;
                            const z1 = towerPos.z + Math.sin(angle) * r1;
                            const nextAngle = angle + Math.PI * 0.5;
                            const x2 = towerPos.x + Math.cos(nextAngle) * r2;
                            const z2 = towerPos.z + Math.sin(nextAngle) * r2;
                            const pts = [new THREE.Vector3(x1, y1, z1), new THREE.Vector3(x2, y2, z2)];
                            const geo = new THREE.BufferGeometry().setFromPoints(pts);
                            const line = new THREE.Line(geo, crossMat);
                            bridgeGroup.add(line);
                        }
                    }

                    // ---- 桥塔底部发光光晕 ----
                    const baseGlowMat = new THREE.SpriteMaterial({
                        map: carTexture,
                        color: new THREE.Color().setHSL(Math.random(), 0.7, 0.5),
                        transparent: true,
                        blending: THREE.AdditiveBlending,
                        depthWrite: false,
                        opacity: 0.3,
                    });
                    const baseGlow = new THREE.Sprite(baseGlowMat);
                    baseGlow.scale.set(1.2, 1.2, 1);
                    baseGlow.position.set(towerPos.x, 0.05, towerPos.z);
                    bridgeGroup.add(baseGlow);

                    // ---- 桥塔顶部装饰光点 ----
                    const topLightMat = new THREE.SpriteMaterial({
                        map: carTexture,
                        color: bridgeColor3,
                        transparent: true,
                        blending: THREE.AdditiveBlending,
                        depthWrite: false,
                    });
                    const topLight = new THREE.Sprite(topLightMat);
                    topLight.scale.set(0.6, 0.6, 1);
                    topLight.position.set(towerPos.x, deckHeight + towerHeight, towerPos.z);
                    bridgeGroup.add(topLight);

                    // ----- 4. 拉索（从桥塔顶部斜拉） -----
                    const cableMat = new THREE.LineBasicMaterial({
                        color: cableColor1,
                        transparent: true,
                        opacity: 0.6,
                    });
                    // 塔顶中心位置（用于拉索起点）
                    const towerTop = new THREE.Vector3(towerPos.x, deckHeight + towerHeight, towerPos.z);

                    // 拉索：从塔顶拉到桥面
                    for (let side = -1; side <= 1; side += 2) {
                        for (let i = 1; i <= cableCount; i++) {
                            const frac = i / (cableCount + 1);
                            // 拉索目标点在桥面上
                            const anchorPos = pos.clone()
                                .add(dir.clone().multiplyScalar(alongOff * frac))
                                .add(new THREE.Vector3(0, deckHeight, 0))
                                .add(new THREE.Vector3(0, 0, side * halfWid * 0.5));
                            const points = [towerTop.clone(), anchorPos];
                            const geoLine = new THREE.BufferGeometry().setFromPoints(points);
                            const line = new THREE.Line(geoLine, cableMat);
                            bridgeGroup.add(line);
                        }
                    }

                    // 外侧拉索：拉到地面（向外延伸）
                    const groundCableMat = new THREE.LineBasicMaterial({
                        color: cableColor2,
                        transparent: true,
                        opacity: 0.4,
                    });
                    // 向外拉到地面
                    for (let i = 1; i <= 2; i++) {
                        const frac = i / 3;
                        const groundPos = towerPos.clone()
                            .add(perpDir.clone().multiplyScalar(sideOff > 0 ? frac * 2 : -frac * 2));
                        groundPos.y = 0.0;  // 地面
                        const points = [towerTop.clone(), groundPos];
                        const geoLine = new THREE.BufferGeometry().setFromPoints(points);
                        const line = new THREE.Line(geoLine, groundCableMat);
                        bridgeGroup.add(line);
                    }
                }
            }

                // ----- 5. 桥墩（从河底支撑桥面） -----
                const pierMat = new THREE.MeshStandardMaterial({
                    color: 0x335577,
                    roughness: 0.7,
                    metalness: 0.2,
                    transparent: true,
                    opacity: 0.6,
                });
                const pierPositions = [-bridgeLength / 2 + 0.5, -bridgeLength / 4, 0, bridgeLength / 4, bridgeLength / 2 - 0.5];
                for (const offset of pierPositions) {
                    const pierPos = pos.clone().add(dir.clone().multiplyScalar(offset));
                    const pierHeight = deckHeight - bridgeHeight / 2 - 0.05;
                    if (pierHeight < 0.5) continue;
                    const pierGeo = new THREE.BoxGeometry(0.4, pierHeight, 0.4);
                    const pier = new THREE.Mesh(pierGeo, pierMat);
                    pier.position.set(pierPos.x, pierHeight / 2 + 0.05, pierPos.z);
                    pier.castShadow = true;
                    pier.receiveShadow = true;
                    bridgeGroup.add(pier);

                    const glowColor = new THREE.Color().setHSL(Math.random(), 0.6 + Math.random() * 0.4, 0.4 + Math.random() * 0.3);
                    const glowMat = new THREE.SpriteMaterial({
                        map: carTexture,
                        color: glowColor,
                        transparent: true,
                        blending: THREE.AdditiveBlending,
                        depthWrite: false,
                        opacity: 0.25,
                    });
                    const glow = new THREE.Sprite(glowMat);
                    glow.scale.set(0.6, 0.6, 1);
                    glow.position.set(pierPos.x, 0.05, pierPos.z);
                    bridgeGroup.add(glow);
                }

                // ----- 6. 桥上车流 -----
                const BRIDGE_CAR_COUNT = 14;
                for (let i = 0; i < BRIDGE_CAR_COUNT; i++) {
                    const progress = Math.random();
                    const offset = (progress - 0.5) * bridgeLength;
                    const carPos = pos.clone().add(dir.clone().multiplyScalar(offset));
                    carPos.y = deckHeight + 0.1;

                    const material = new THREE.SpriteMaterial({
                        map: carTexture,
                        color: new THREE.Color().setHSL(Math.random() * 1.0, 0.7 + Math.random() * 0.3, 0.5 + Math.random() * 0.3),
                        transparent: true,
                        blending: THREE.AdditiveBlending,
                        depthWrite: false,
                    });
                    const sprite = new THREE.Sprite(material);
                    sprite.scale.set(0.3, 0.3, 1);
                    sprite.position.copy(carPos);
                    scene.add(sprite);

                    bridgeCars.push({
                        mesh: sprite,
                        progress: progress,
                        speed: 1.5 + Math.random() * 2.0,
                        direction: Math.random() > 0.5 ? 1 : -1,
                        bridgeLength: bridgeLength,
                        center: pos.clone(),
                        dir: dir.clone(),
                        deckHeight: deckHeight,
                    });
                }
            }

            // ============================================================
            //  5. 城市生成
            // ============================================================
            // ---------- 色板：不同层次的蓝色 ----------
            const palette = [
                { base: 0x2a5c8a, edge: 0x66ccff },
                { base: 0x3a6c9a, edge: 0x66ccff },
                { base: 0x4a7caa, edge: 0x88ddff },
                { base: 0x5a8cba, edge: 0x88ddff },
                { base: 0x2a6a8a, edge: 0x66ccff },
                { base: 0x3a7a9a, edge: 0x66ccff },
                { base: 0x4a8aaa, edge: 0x88ddff },
                { base: 0x6a9cca, edge: 0xaaeeff },
            ];

            // ---------- 建筑数据 ----------
            const buildings = [];
            const buildingGroup = new THREE.Group();
            scene.add(buildingGroup);

            const GRID_SIZE = 28;
            const STEP = 1.9;
            const OFFSET = 0.35;
            const DENSITY = 0.62;
            const LANDMARK_CHANCE = 0.04;

            const occupied = new Set();

            function gridKey(x, z) {
                return `${Math.round(x / STEP)},${Math.round(z / STEP)}`;
            }

            function isOccupied(x, z) {
                return occupied.has(gridKey(x, z));
            }

            function markOccupied(x, z) {
                occupied.add(gridKey(x, z));
            }

            // ---------- 辅助：为建筑生成窗户（独立正方形平面） ----------
            function createWindowsForBuilding(width, height, depth, color, densityFactor = 1.0, windowColor = null) {
                const windowMeshes = [];
                const winSize = 0.22;
                const geometry = new THREE.PlaneGeometry(winSize, winSize);
                // 如果没有传入窗户颜色，随机生成
                if (!windowColor) {
                    windowColor = new THREE.Color().setHSL(Math.random() * 1.0, 0.7 + Math.random() * 0.2, 0.5 + Math.random() * 0.3);
                }
                // 性能优化：FrontSide（窗户背面贴墙不可见，减半渲染面数）
                const material = new THREE.MeshStandardMaterial({
                    color: windowColor,
                    emissive: windowColor,
                    emissiveIntensity: 0,
                    transparent: false,
                    roughness: 0.1,
                    metalness: 0.3,
                    side: THREE.FrontSide,
                });

                let count = Math.floor((height / 0.7) * densityFactor) + 1;
                count += Math.floor(Math.random() * 4);
                count = Math.max(2, Math.min(40, count));

                const sides = [
                    { dir: [1, 0, 0], axis: 'x', range: [0, depth] },
                    { dir: [-1, 0, 0], axis: 'x', range: [0, depth] },
                    { dir: [0, 0, 1], axis: 'z', range: [0, width] },
                    { dir: [0, 0, -1], axis: 'z', range: [0, width] },
                ];

                for (let i = 0; i < count; i++) {
                    const side = sides[Math.floor(Math.random() * sides.length)];
                    const [dx, dy, dz] = side.dir;
                    const halfW = width / 2;
                    const halfD = depth / 2;
                    const halfH = height / 2;
                    let x, y, z;
                    if (side.axis === 'x') {
                        x = dx * halfW;
                        y = (Math.random() - 0.5) * height * 0.85;
                        z = (Math.random() - 0.5) * depth * 0.85;
                    } else {
                        x = (Math.random() - 0.5) * width * 0.85;
                        y = (Math.random() - 0.5) * height * 0.85;
                        z = dz * halfD;
                    }
                    const mesh = new THREE.Mesh(geometry, material);
                    mesh.position.set(x, y, z);
                    if (dx === 1) mesh.rotation.y = Math.PI / 2;
                    else if (dx === -1) mesh.rotation.y = -Math.PI / 2;
                    else if (dz === 1) mesh.rotation.y = 0;
                    else if (dz === -1) mesh.rotation.y = Math.PI;
                    const offset = 0.01;
                    mesh.position.x += dx * offset;
                    mesh.position.z += dz * offset;
                    windowMeshes.push(mesh);
                }

                return { meshes: windowMeshes, material };
            }

            // ---------- 生成建筑循环（避开河流） ----------
            // ----- 计算桥头位置，用于建筑避让 -----
            const bridgeCenter = fullCurve.getPoint(0.5);
            const bridgeTangent = fullCurve.getTangent(0.5);
            const bridgeDir = new THREE.Vector3(-bridgeTangent.z, 0, bridgeTangent.x).normalize();
            // 桥长与 createBridge 中保持一致（riverWidth * 1）
            const rampLength = 2.5;  // 与 createBridge 中的 rampLength 保持一致
            const bridgeLengthEst = riverWidth * 1.2;  // 与 createBridge 中的 bridgeLength 保持一致
            const BRIDGE_HEAD_RADIUS = 3.0;  // 增大避让半径
            const bridgeHeadPos1 = bridgeCenter.clone().add(bridgeDir.clone().multiplyScalar(bridgeLengthEst / 2 + rampLength + 0.5));
            const bridgeHeadPos2 = bridgeCenter.clone().add(bridgeDir.clone().multiplyScalar(-bridgeLengthEst / 2 - rampLength - 0.5));

            for (let ix = -GRID_SIZE / 2; ix <= GRID_SIZE / 2; ix++) {
                for (let iz = -GRID_SIZE / 2; iz <= GRID_SIZE / 2; iz++) {
                    if (Math.random() > DENSITY) continue;

                    const x = ix * STEP + (Math.random() - 0.5) * OFFSET * 2;
                    const z = iz * STEP + (Math.random() - 0.5) * OFFSET * 2;

                    if (isNearRiver(x, z, RIVER_THRESHOLD)) continue;
                    // 检查是否在桥头区域（避免建筑与桥头穿模）
                    const dx1 = x - bridgeHeadPos1.x;
                    const dz1 = z - bridgeHeadPos1.z;
                    const dx2 = x - bridgeHeadPos2.x;
                    const dz2 = z - bridgeHeadPos2.z;
                    if (dx1 * dx1 + dz1 * dz1 < BRIDGE_HEAD_RADIUS * BRIDGE_HEAD_RADIUS ||
                        dx2 * dx2 + dz2 * dz2 < BRIDGE_HEAD_RADIUS * BRIDGE_HEAD_RADIUS) {
                        continue;
                    }
                    if (isOccupied(x, z)) continue;
                    markOccupied(x, z);

                    const dist = Math.sqrt(x * x + z * z);
                    const maxDist = GRID_SIZE / 2 * STEP;

                    const isLandmark = Math.random() < LANDMARK_CHANCE;
                    let w, d, h;
                    if (isLandmark) {
                        w = 1.8 + Math.random() * 1.6;
                        d = 1.8 + Math.random() * 1.6;
                        h = 10 + Math.random() * 10;
                    } else {
                        w = 0.7 + Math.random() * 1.3;
                        d = 0.7 + Math.random() * 1.3;
                        h = 1.2 + Math.random() * 9;
                    }

                    const colorIdx = Math.floor(Math.random() * palette.length);
                    const colors = palette[colorIdx];
                    const targetY = h / 2;

                    const delay = (dist / maxDist) * 1.3 + Math.random() * 0.2;  // 加速一倍
                    const duration = 0.8 + Math.random() * 0.9;  // 加速一倍

                    // 主体材质
                    const bodyMat = new THREE.MeshStandardMaterial({
                        color: colors.base,
                        roughness: 0.5,
                        metalness: 0.2,
                    });
                    const geo = new THREE.BoxGeometry(w, h, d);
                    const mesh = new THREE.Mesh(geo, bodyMat);
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;
                    mesh.position.set(x, -h / 2 - 0.5, z);

                    // 边缘线
                    const edges = new THREE.EdgesGeometry(geo);
                    const lineMat = new THREE.LineBasicMaterial({
                        color: colors.edge,
                        transparent: true,
                        opacity: 0.3 + Math.random() * 0.25,
                    });
                    const wireframe = new THREE.LineSegments(edges, lineMat);
                    wireframe.position.copy(mesh.position);

                    // 生成窗户
                    const densityFactor = isLandmark ? 2.0 : 1.0;
                    // 随机生成窗户颜色（每个建筑不同，但同建筑统一）
                    const windowHue = Math.random(); // 0~1 全色域
                    const windowColor = new THREE.Color().setHSL(windowHue, 0.7 + Math.random() * 0.2, 0.5 + Math.random() * 0.3);
                    const { meshes: windowMeshes, material: windowMat } = createWindowsForBuilding(w, h, d, colors.base, densityFactor, windowColor);
                    for (const win of windowMeshes) {
                        mesh.add(win);
                    }

                    buildingGroup.add(mesh);
                    buildingGroup.add(wireframe);

                    buildings.push({
                        mesh,
                        wireframe,
                        targetY,
                        currentY: -h / 2 - 0.5,
                        delay,
                        duration,
                        progress: 0,
                        finished: false,
                        height: h,
                        width: w,
                        depth: d,
                        x,
                        z,
                        isLandmark,
                        windowMaterial: windowMat,
                        windowMeshes: windowMeshes,
                        windowLit: false,
                        windowProgress: 0,
                        windowDelay: 0.2 + Math.random() * 0.8,
                        // 鼠标划过时新增的临时窗户
                        hoverWindows: [],  // 存储临时窗户 { mesh, intensity, decay }
                    });
                }
            }

            buildings.sort((a, b) => a.delay - b.delay);

            // ============================================================
            //  5.2.5 找到3栋目标建筑，用于放置价值卡片（函数定义，延迟调用）
            //  ① 屏幕左下角的楼（左岸、靠近相机）→ vc-left
            //  ② 靠近左边桥塔的大楼 → vc-bridge
            //  ③ 右边最显眼的大楼（最高、地标优先） → vc-right
            //  注：需在 createBridge() 之后调用（桥塔位置才能用于选楼）
            // ============================================================
            let targetLeftUpper = null, targetLeftLower = null, targetRightBldg = null;

            function selectCardTargetBuildings() {
                // 使用阶段1相机位置做投影，按屏幕区域选楼
                // 临时把相机放到阶段1位置做投影
                const savedCamPos = camera.position.clone();
                const savedCamTarget = controls.target.clone();
                camera.position.copy(camPhases[1].pos);
                controls.target.copy(camPhases[1].target);
                camera.lookAt(camPhases[1].target);
                camera.updateMatrixWorld();

                // 投影所有已完成的较高建筑到屏幕，记录屏幕坐标
                const candidates = buildings
                    .filter(b => b.height > 3)
                    .map(b => {
                        const sp = projectToScreen(b.x, b.height * 0.55, b.z);
                        return { b, sx: sp.x, sy: sp.y, behind: sp.behind, h: b.height, isLandmark: b.isLandmark };
                    })
                    .filter(o => !o.behind);  // 排除在相机背后的

                // 恢复相机
                camera.position.copy(savedCamPos);
                controls.target.copy(savedCamTarget);
                camera.lookAt(savedCamTarget);
                camera.updateMatrixWorld();

                const W = renderer.domElement.clientWidth || window.innerWidth;
                const H = renderer.domElement.clientHeight || window.innerHeight;

                // ① 屏幕左下角区域 (x < 40%, y > 55%)：选最高的
                targetLeftLower = null;
                const leftLowerCands = candidates.filter(o => o.sx < W * 0.4 && o.sy > H * 0.55)
                    .sort((a, b) => b.h - a.h);
                if (leftLowerCands.length > 0) targetLeftLower = leftLowerCands[0].b;

                // ② 屏幕中上区域（靠近桥塔/桥）：x 在 30%-65%，y < 60%，选距桥塔最近的
                targetLeftUpper = null;
                if (_bridgeTowerPositions.length > 0) {
                    const screenCenterBldgs = candidates.filter(o =>
                        o.sx > W * 0.3 && o.sx < W * 0.65 && o.sy < H * 0.6 && o.b !== targetLeftLower
                    );
                    // 计算每个建筑到最近桥塔的世界距离
                    const withTowerDist = screenCenterBldgs.map(o => {
                        const minTowerDist = Math.min(..._bridgeTowerPositions.map(t =>
                            Math.sqrt((o.b.x - t.x) ** 2 + (o.b.z - t.z) ** 2)));
                        return { ...o, towerDist: minTowerDist };
                    }).sort((a, b) => a.towerDist - b.towerDist);
                    if (withTowerDist.length > 0) targetLeftUpper = withTowerDist[0].b;
                }
                // 备选：中上区域最高的
                if (!targetLeftUpper) {
                    const fallback = candidates.filter(o =>
                        o.sx > W * 0.3 && o.sx < W * 0.65 && o.sy < H * 0.6 && o.b !== targetLeftLower
                    ).sort((a, b) => b.h - a.h);
                    if (fallback.length > 0) targetLeftUpper = fallback[0].b;
                }

                // ③ 屏幕右侧区域 (x > 55%)：地标优先 + 最高
                targetRightBldg = null;
                const rightCands = candidates.filter(o =>
                    o.sx > W * 0.55 && o.b !== targetLeftLower && o.b !== targetLeftUpper
                ).sort((a, b) => (b.isLandmark - a.isLandmark) || (b.h - a.h));
                if (rightCands.length > 0) targetRightBldg = rightCands[0].b;

                console.log('🎯 卡片目标建筑（屏幕投影选择）:', {
                    leftLower: targetLeftLower ? { x: targetLeftLower.x.toFixed(1), z: targetLeftLower.z.toFixed(1), h: targetLeftLower.height.toFixed(1) } : null,
                    nearTower: targetLeftUpper ? { x: targetLeftUpper.x.toFixed(1), z: targetLeftUpper.z.toFixed(1), h: targetLeftUpper.height.toFixed(1) } : null,
                    right: targetRightBldg ? { x: targetRightBldg.x.toFixed(1), z: targetRightBldg.z.toFixed(1), h: targetRightBldg.height.toFixed(1) } : null
                });
            }

            // DOM 引用 — 价值卡片浮层（vcOverlay 已在模块级声明）
            const vcLeft = document.getElementById('vc-left');      // 左下角楼：效率提升
            const vcBridge = document.getElementById('vc-bridge');  // 靠近桥塔：思维范式革新
            const vcRight = document.getElementById('vc-right');    // 右侧大楼：社会价值

            // 3D→2D 投影辅助函数
            const _projVec = new THREE.Vector3();
            function projectToScreen(worldX, worldY, worldZ) {
                _projVec.set(worldX, worldY, worldZ);
                _projVec.project(camera);
                return {
                    x: (_projVec.x * 0.5 + 0.5) * renderer.domElement.clientWidth,
                    y: (-_projVec.y * 0.5 + 0.5) * renderer.domElement.clientHeight,
                    behind: _projVec.z > 1
                };
            }

            // 更新价值卡片位置（每帧调用）
            function updateValueCardPositions() {
                if (!vcOverlay || !vcOverlay.classList.contains('active')) return;

                // ① 左下角楼：卡片贴在楼侧面（建筑中心高度）
                if (targetLeftLower) {
                    const pos = projectToScreen(
                        targetLeftLower.x,
                        targetLeftLower.height * 0.55,
                        targetLeftLower.z
                    );
                    positionCard(vcLeft, pos, 'left');
                }
                // ② 靠近桥塔的楼：卡片贴在楼侧面（偏上）
                if (targetLeftUpper) {
                    const pos = projectToScreen(
                        targetLeftUpper.x,
                        targetLeftUpper.height * 0.7,
                        targetLeftUpper.z
                    );
                    positionCard(vcBridge, pos, 'center');
                }
                // ③ 右侧大楼：卡片贴在楼侧面（建筑中心高度）
                if (targetRightBldg) {
                    const pos = projectToScreen(
                        targetRightBldg.x,
                        targetRightBldg.height * 0.55,
                        targetRightBldg.z
                    );
                    positionCard(vcRight, pos, 'right');
                }
            }

            // positionCard: 将卡片定位到屏幕坐标，并确保整个卡片在屏幕范围内
            // side: 'left' | 'center' | 'right' — 决定卡片相对投影点的水平偏移方向
            function positionCard(el, screenPos, side) {
                if (!el) return;
                if (screenPos.behind) {
                    el.style.opacity = '0';
                    return;
                }
                const cardW = el.offsetWidth || 220;
                const cardH = el.offsetHeight || 130;
                const margin = 16;

                // 水平方向：根据 side 决定卡片相对建筑投影点的位置
                let x;
                if (side === 'left') {
                    x = screenPos.x - cardW - 4;   // 卡片在投影点左侧
                } else if (side === 'right') {
                    x = screenPos.x + 4;            // 卡片在投影点右侧
                } else {
                    x = screenPos.x - cardW / 2;    // 居中
                }
                // 垂直方向：卡片中心对齐投影点
                let y = screenPos.y - cardH / 2;

                // Clamp 到屏幕范围内
                x = Math.max(margin, Math.min(x, window.innerWidth - cardW - margin));
                y = Math.max(margin, Math.min(y, window.innerHeight - cardH - margin));

                el.style.opacity = '1';
                el.style.left = x + 'px';
                el.style.top = y + 'px';
            }

            // ============================================================
            //  5.2.6 鼠标光标附近楼群窗户随机变亮（从 city.html 移植）
            //  city-layer 有 pointer-events:none，所以在 window 上监听
            // ============================================================
            const clock = new THREE.Clock();  // 提前声明，供 hover 窗户和动画循环共用
            const _hoverRaycaster = new THREE.Raycaster();
            const _hoverMouse = new THREE.Vector2();
            const _hoverMouseWorld = new THREE.Vector3();
            let _hoverLastCheck = 0;
            const HOVER_CHECK_INTERVAL = 0.03;   // 检测间隔（秒）
            const HOVER_RADIUS = 5.0;            // 鼠标影响半径
            const HOVER_WINDOW_SIZE = 0.22;      // 临时窗户大小
            const HOVER_WINDOW_DURATION = 1.2;   // 临时窗户持续时间（秒）
            const HOVER_WINDOWS_PER_CHECK = 3;   // 每次检测创建的窗户数量
            const _hoverWindowGeo = new THREE.PlaneGeometry(HOVER_WINDOW_SIZE, HOVER_WINDOW_SIZE);

            // 在 window 上监听鼠标移动（city-layer 的 pointer-events:none 会穿透）
            window.addEventListener('mousemove', (event) => {
                _hoverMouse.x = (event.clientX / window.innerWidth) * 2 - 1;
                _hoverMouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
            });

            // 创建临时窗户（贴在建筑表面，随机颜色高亮）
            // 使用 MeshBasicMaterial 替代 MeshStandardMaterial：无需光照计算，性能更好
            // 通过 toneMapped:false 让颜色超过1实现 HDR 发光效果，视觉上与 emissive 一致
            function createHoverWindow(building) {
                const windowColor = new THREE.Color().setHSL(Math.random(), 0.8, 0.6);
                const windowMat = new THREE.MeshBasicMaterial({
                    color: windowColor.clone().multiplyScalar(2.5),  // HDR 高亮，模拟 emissiveIntensity 2.5
                    transparent: true,
                    opacity: 1.0,
                    toneMapped: false,
                    side: THREE.DoubleSide,
                    depthWrite: false,
                });
                const windowMesh = new THREE.Mesh(_hoverWindowGeo, windowMat);

                // 随机选择建筑表面位置
                const localPos = new THREE.Vector3(
                    (Math.random() - 0.5) * building.width * 0.85,
                    (Math.random() - 0.5) * building.height * 0.85,
                    (Math.random() - 0.5) * building.depth * 0.85
                );
                const sides = [
                    { dir: [1, 0, 0], rot: Math.PI / 2 },
                    { dir: [-1, 0, 0], rot: -Math.PI / 2 },
                    { dir: [0, 0, 1], rot: 0 },
                    { dir: [0, 0, -1], rot: Math.PI },
                ];
                const side = sides[Math.floor(Math.random() * sides.length)];
                const [dx, dy, dz] = side.dir;
                const offset = 0.02;
                localPos.x = dx !== 0 ? dx * (building.width / 2 + offset) : localPos.x;
                localPos.z = dz !== 0 ? dz * (building.depth / 2 + offset) : localPos.z;

                windowMesh.position.set(localPos.x, localPos.y, localPos.z);
                windowMesh.rotation.y = side.rot;
                building.mesh.add(windowMesh);

                building.hoverWindows.push({
                    mesh: windowMesh,
                    material: windowMat,
                    intensity: 2.5,
                    startTime: clock.elapsedTime,
                });
            }

            // 检测鼠标附近的建筑并新增临时窗户
            // 复用临时对象避免每帧 GC（关键性能优化）
            const _hoverGroundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
            const _hoverIntersectPoint = new THREE.Vector3();
            const _HOVER_RADIUS_SQ = HOVER_RADIUS * HOVER_RADIUS;
            function checkMouseHover(elapsed) {
                if (elapsed - _hoverLastCheck < HOVER_CHECK_INTERVAL) return;
                _hoverLastCheck = elapsed;
                if (!allFinished) return;  // 城市生长完成后才生效

                _hoverRaycaster.setFromCamera(_hoverMouse, camera);
                if (!_hoverRaycaster.ray.intersectPlane(_hoverGroundPlane, _hoverIntersectPoint)) return;
                _hoverMouseWorld.copy(_hoverIntersectPoint);

                for (const b of buildings) {
                    if (!b.finished) continue;
                    const dx = b.mesh.position.x - _hoverMouseWorld.x;
                    const dz = b.mesh.position.z - _hoverMouseWorld.z;
                    // 平方距离比较，避免 sqrt 开销
                    if (dx * dx + dz * dz < _HOVER_RADIUS_SQ) {
                        for (let j = 0; j < HOVER_WINDOWS_PER_CHECK; j++) {
                            createHoverWindow(b);
                        }
                    }
                }
            }

            const totalBuildings = buildings.length;
            console.log(`🏙️ 生成 ${totalBuildings} 栋科技建筑，已避开河道（阈值 ${RIVER_THRESHOLD}）。`);

            // ============================================================
            //  5.3 地面装饰（彩色发光点）
            // ============================================================
            function createGroundDecorations() {
                const decorationGroup = new THREE.Group();
                scene.add(decorationGroup);

                // 装饰点数量
                const DECO_COUNT = 1200;
                // 装饰点大小
                const DECO_SIZE = 0.72;
                // 范围
                const HALF = 30;

                // 生成圆形纹理（与车灯类似，但可以更小）
                const decoCanvas = document.createElement('canvas');
                decoCanvas.width = 32;
                decoCanvas.height = 32;
                const ctx = decoCanvas.getContext('2d');
                const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
                gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
                gradient.addColorStop(0.3, 'rgba(200, 230, 255, 0.9)');
                gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = gradient;
                ctx.fillRect(0, 0, 32, 32);
                const decoTexture = new THREE.CanvasTexture(decoCanvas);

                // 生成位置
                const positions = [];
                const colors = [];
                for (let i = 0; i < DECO_COUNT; i++) {
                    // 随机位置
                    const x = (Math.random() - 0.5) * HALF * 2;
                    const z = (Math.random() - 0.5) * HALF * 2;
                    // 避开河流（使用现有的 isNearRiver 函数）
                    if (isNearRiver(x, z, RIVER_THRESHOLD + 0.5)) continue;
                    // 同时避免放在建筑正下方（可选，但为了丰富度，可以忽略，因为建筑会遮挡）
                    // 但为了不影响建筑，可以放在建筑间隙，这里简单处理：只避开河流
                    positions.push(x, 0.02, z);
                    // 随机颜色
                    const color = new THREE.Color().setHSL(Math.random() * 1.0, 0.7 + Math.random() * 0.3, 0.5 + Math.random() * 0.4);
                    colors.push(color.r, color.g, color.b);
                }

                const geometry = new THREE.BufferGeometry();
                geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
                geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

                const material = new THREE.PointsMaterial({
                    size: DECO_SIZE,
                    map: decoTexture,
                    transparent: true,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false,
                    vertexColors: true,
                    opacity: 0.8,
                });

                const points = new THREE.Points(geometry, material);
                decorationGroup.add(points);

                // 额外添加一些稍大的光点（稀疏分布，类似路灯或地标）
                const BIG_COUNT = 60;
                const bigPositions = [];
                const bigColors = [];
                for (let i = 0; i < BIG_COUNT; i++) {
                    const x = (Math.random() - 0.5) * HALF * 2;
                    const z = (Math.random() - 0.5) * HALF * 2;
                    if (isNearRiver(x, z, RIVER_THRESHOLD + 0.5)) continue;
                    bigPositions.push(x, 0.02, z);
                    const color = new THREE.Color().setHSL(Math.random() * 1.0, 0.8, 0.6);
                    bigColors.push(color.r, color.g, color.b);
                }
                const bigGeo = new THREE.BufferGeometry();
                bigGeo.setAttribute('position', new THREE.Float32BufferAttribute(bigPositions, 3));
                bigGeo.setAttribute('color', new THREE.Float32BufferAttribute(bigColors, 3));
                const bigMat = new THREE.PointsMaterial({
                    size: DECO_SIZE * 2.5,
                    map: decoTexture,
                    transparent: true,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false,
                    vertexColors: true,
                    opacity: 0.6,
                });
                const bigPoints = new THREE.Points(bigGeo, bigMat);
                decorationGroup.add(bigPoints);

                // 保存引用以便重置时清除
                window._decorationGroup = decorationGroup;
            }

            // ============================================================
            //  5.5 车流系统（圆形光点穿梭，无视楼房，只避开河流）
            // ============================================================
            // 生成圆形光点纹理
            function createCarTexture() {
                const canvas = document.createElement('canvas');
                canvas.width = 64;
                canvas.height = 64;
                const ctx = canvas.getContext('2d');
                const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
                gradient.addColorStop(0, 'rgba(150, 230, 255, 1)');
                gradient.addColorStop(0.4, 'rgba(80, 200, 255, 0.9)');
                gradient.addColorStop(1, 'rgba(0, 100, 200, 0)');
                ctx.fillStyle = gradient;
                ctx.fillRect(0, 0, 64, 64);
                return new THREE.CanvasTexture(canvas);
            }

            const carTexture = createCarTexture();

            // 车流参数（地面）
            const CAR_COUNT = 80;
            const CAR_SPEED_MIN = 2.0;
            const CAR_SPEED_MAX = 6.0;
            const CAR_SIZE = 0.35;

            let cars = [];

            function generateCarPath() {
                const maxAttempts = 30;
                for (let attempt = 0; attempt < maxAttempts; attempt++) {
                    const start = getRandomValidPoint();
                    const end = getRandomValidPoint();
                    if (!start || !end) continue;
                    if (isPathClear(start, end)) {
                        return { start, end };
                    }
                }
                return {
                    start: new THREE.Vector3(-20, 0.05, -20),
                    end: new THREE.Vector3(-20, 0.05, 20)
                };
            }

            function getRandomValidPoint() {
                const half = 26;
                for (let i = 0; i < 30; i++) {
                    const x = (Math.random() - 0.5) * half * 2;
                    const z = (Math.random() - 0.5) * half * 2;
                    if (isPointBlocked(x, z)) continue;
                    return new THREE.Vector3(x, 0.05, z);
                }
                return null;
            }

            function isPointBlocked(x, z) {
                // 只检查河流，无视楼房
                if (isNearRiver(x, z, RIVER_THRESHOLD)) return true;
                return false;
            }

            function isPathClear(start, end) {
                const steps = 20;
                for (let i = 0; i <= steps; i++) {
                    const t = i / steps;
                    const x = start.x + (end.x - start.x) * t;
                    const z = start.z + (end.z - start.z) * t;
                    if (isPointBlocked(x, z)) return false;
                }
                return true;
            }

            function initCars() {
                for (const car of cars) {
                    scene.remove(car.mesh);
                    car.mesh.material.dispose();
                }
                cars = [];

                for (let i = 0; i < CAR_COUNT; i++) {
                    const path = generateCarPath();
                    const speed = CAR_SPEED_MIN + Math.random() * (CAR_SPEED_MAX - CAR_SPEED_MIN);
                    const progress = Math.random();
                    const pos = new THREE.Vector3().lerpVectors(path.start, path.end, progress);

                    const material = new THREE.SpriteMaterial({
                        map: carTexture,
                        color: new THREE.Color().setHSL(Math.random() * 1.0, 0.7 + Math.random() * 0.3, 0.5 + Math.random() * 0.3),
                        transparent: true,
                        blending: THREE.AdditiveBlending,
                        depthWrite: false,
                    });
                    const sprite = new THREE.Sprite(material);
                    sprite.scale.set(CAR_SIZE, CAR_SIZE, 1);
                    sprite.position.copy(pos);
                    scene.add(sprite);

                    cars.push({
                        mesh: sprite,
                        start: path.start.clone(),
                        end: path.end.clone(),
                        speed: speed,
                        progress: progress,
                        direction: 1,
                    });
                }
            }

            function generateNewPathForCar(car) {
                const currentPos = car.mesh.position.clone();
                currentPos.y = 0.05;
                const newEnd = getRandomValidPoint();
                if (newEnd && isPathClear(currentPos, newEnd)) {
                    car.start.copy(currentPos);
                    car.end.copy(newEnd);
                    car.progress = 0;
                    car.direction = 1;
                } else {
                    const path = generateCarPath();
                    car.start.copy(path.start);
                    car.end.copy(path.end);
                    car.progress = Math.random();
                    car.direction = 1;
                }
            }

            function updateCars(delta) {
                // 地面车流
                for (const car of cars) {
                    const distance = car.start.distanceTo(car.end);
                    if (distance < 0.01) {
                        generateNewPathForCar(car);
                        continue;
                    }
                    car.progress += car.direction * car.speed * delta / distance;
                    if (car.progress >= 1.0) {
                        const newStart = car.end.clone();
                        newStart.y = 0.05;
                        const newEnd = getRandomValidPoint();
                        if (newEnd && isPathClear(newStart, newEnd)) {
                            car.start.copy(newStart);
                            car.end.copy(newEnd);
                            car.progress = 0;
                            car.direction = 1;
                        } else {
                            car.direction = -1;
                            car.progress = 1.0;
                        }
                    } else if (car.progress <= 0.0) {
                        const newStart = car.start.clone();
                        newStart.y = 0.05;
                        const newEnd = getRandomValidPoint();
                        if (newEnd && isPathClear(newStart, newEnd)) {
                            car.start.copy(newStart);
                            car.end.copy(newEnd);
                            car.progress = 0;
                            car.direction = 1;
                        } else {
                            car.direction = 1;
                            car.progress = 0;
                        }
                    }
                    const pos = new THREE.Vector3().lerpVectors(car.start, car.end, Math.max(0, Math.min(1, car.progress)));
                    car.mesh.position.copy(pos);
                    const scale = CAR_SIZE * (0.8 + 0.4 * (car.speed / CAR_SPEED_MAX));
                    car.mesh.scale.set(scale, scale, 1);
                }

                // 桥上车流
                for (const car of bridgeCars) {
                    car.progress += car.direction * car.speed * delta / car.bridgeLength;
                    if (car.progress > 1.0) {
                        car.progress = 1.0;
                        car.direction = -1;
                    } else if (car.progress < 0.0) {
                        car.progress = 0.0;
                        car.direction = 1;
                    }
                    const offset = (car.progress - 0.5) * car.bridgeLength;
                    const pos = car.center.clone().add(car.dir.clone().multiplyScalar(offset));
                    pos.y = car.deckHeight + 0.1;
                    car.mesh.position.copy(pos);
                }
            }

            function resetCars() {
                // 清除地面车流
                for (const car of cars) {
                    scene.remove(car.mesh);
                    car.mesh.material.dispose();
                }
                cars = [];
                // 清除桥上车流
                for (const car of bridgeCars) {
                    scene.remove(car.mesh);
                    car.mesh.material.dispose();
                }
                bridgeCars = [];
                // 重新创建桥和桥上车流
                createBridge();
                // 重新初始化地面车流
                initCars();
            }

            console.log('🚗 车流系统已就绪，车辆将无视楼房自由穿梭，仅避开河流，桥上也有车流。');

            // ============================================================
            //  6. 动画状态
            // ============================================================
            let isAnimating = true;
            let animTime = 0;
            let overallProgress = 0;
            let allFinished = false;

            function easeOutCubic(t) {
                return 1 - Math.pow(1 - t, 3);
            }

            // ============================================================
            //  7. 重置 / 重启生长（去除 UI 行）
            // ============================================================
            function restartCityGrowth() {
                for (const b of buildings) {
                    const startY = -b.height / 2 - 0.5;
                    b.mesh.position.y = startY;
                    b.wireframe.position.y = startY;
                    b.currentY = startY;
                    b.progress = 0;
                    b.finished = false;
                    b.windowLit = false;
                    b.windowProgress = 0;
                    b.windowMaterial.emissiveIntensity = 0;
                    // 清除残留的鼠标悬停临时窗户
                    for (const hw of b.hoverWindows) {
                        b.mesh.remove(hw.mesh);
                        hw.material.dispose();
                    }
                    b.hoverWindows = [];
                }
                // 清除地面装饰
                if (window._decorationGroup) {
                    scene.remove(window._decorationGroup);
                    window._decorationGroup.traverse(child => {
                        if (child.geometry) child.geometry.dispose();
                        if (child.material) child.material.dispose();
                    });
                    window._decorationGroup = null;
                }
                animTime = 0;
                overallProgress = 0;
                allFinished = false;
                isAnimating = true;
                lastRiverProgress = -1;
                buildRiver(0);
                resetCars();  // 内部会调用 createBridge()，填充 _bridgeTowerPositions
                // 重新创建地面装饰
                createGroundDecorations();
                // 选定卡片目标建筑（需在 createBridge 之后，桥塔位置才可用）
                selectCardTargetBuildings();
                // 重置相机到阶段0（初始位置），并准备过渡到阶段1
                camera.position.copy(camInitPos);
                controls.target.copy(camInitTarget);
                camCurrentPhase = 0;
                camTargetPhase = 0;
                camTransitionProgress = 1;
            }

            // ============================================================
            //  8. 动画循环（clock 已在 5.2.6 节提前声明）
            // ============================================================

            function animate() {
                if (!cityRunning) return;
                cityRAF = requestAnimationFrame(animate);

                // 性能优化：城市已长完且 #value 不可见（用户滚到 tech 区）时跳过渲染
                // 仍保留 rAF 循环以处理相机过渡，但避免后台全速渲染浪费 GPU
                if (allFinished && !_cityVisible && !window._cityActive) {
                    const delta = Math.min(clock.getDelta(), 0.05);
                    const elapsed = clock.elapsedTime;
                    // 仅推进相机过渡，不渲染场景
                    if (camTransitionProgress < 1) {
                        camTransitionProgress = Math.min(camTransitionProgress + delta / camTransitionDuration, 1);
                        const t = camTransitionProgress < 0.5
                            ? 4 * camTransitionProgress * camTransitionProgress * camTransitionProgress
                            : 1 - Math.pow(-2 * camTransitionProgress + 2, 3) / 2;
                        const to = camPhases[camTargetPhase];
                        camera.position.lerpVectors(camTransitionStartPos, to.pos, t);
                        controls.target.lerpVectors(camTransitionStartTarget, to.target, t);
                        if (camTransitionProgress >= 1) camCurrentPhase = camTargetPhase;
                    }
                    return;
                }

                const delta = Math.min(clock.getDelta(), 0.05);
                const elapsed = clock.elapsedTime;

                // 河流颜色动态变化
                const hue = 0.55 + Math.sin(elapsed * 0.1) * 0.01;
                riverMat.color.setHSL(hue, 0.7, 0.4);

                if (isAnimating) {
                    animTime += delta;
                    let totalProgress = 0;

                    for (const b of buildings) {
                        const localTime = animTime - b.delay;
                        if (localTime <= 0) {
                            b.progress = 0;
                        } else {
                            const raw = localTime / b.duration;
                            b.progress = Math.min(raw, 1);
                            const eased = easeOutCubic(b.progress);
                            const startY = -b.height / 2 - 0.5;
                            const currentY = startY + (b.targetY - startY) * eased;
                            b.mesh.position.y = currentY;
                            b.wireframe.position.y = currentY;
                            b.currentY = currentY;
                            if (b.progress >= 1) {
                                b.finished = true;
                            }
                        }

                        if (b.finished && !b.windowLit) {
                            const elapsedSinceFinish = animTime - (b.delay + b.duration);
                            if (elapsedSinceFinish >= b.windowDelay) {
                                b.windowLit = true;
                                b.windowProgress = 0;
                            }
                        }

                        if (b.windowLit) {
                            b.windowProgress = Math.min(b.windowProgress + delta * 0.7, 1);
                            const intensity = b.windowProgress * 1.0;
                            b.windowMaterial.emissiveIntensity = intensity;
                        }

                        totalProgress += b.progress;
                    }

                    overallProgress = totalProgress / totalBuildings;

                    // 河流生长速度加速（比建筑进度更快延伸）
                    const riverProgress = Math.min(overallProgress * 1.5, 1);
                    buildRiver(riverProgress);

                    if (overallProgress >= 0.999) {
                        allFinished = true;
                        isAnimating = false;
                        buildRiver(1);
                    }
                }

                // 建筑微呼吸（临时窗户渐变消失循环保留为空操作）
                const breathe = Math.sin(elapsed * 0.3) * 0.012;
                for (const b of buildings) {
                    if (b.finished) {
                        const offset = Math.sin(elapsed * 0.5 + b.x * 0.3 + b.z * 0.2) * 0.008;
                        b.mesh.position.y = b.targetY + offset + breathe * 0.3;
                        b.wireframe.position.y = b.targetY + offset + breathe * 0.3;

                        // 处理鼠标悬停临时窗户的渐变消失
                        for (let i = b.hoverWindows.length - 1; i >= 0; i--) {
                            const hw = b.hoverWindows[i];
                            const age = elapsed - hw.startTime;

                            if (age < HOVER_WINDOW_DURATION) {
                                // MeshBasicMaterial 用 opacity 淡出（color 已含 HDR 倍数）
                                hw.material.opacity = 1 - age / HOVER_WINDOW_DURATION;
                            } else {
                                b.mesh.remove(hw.mesh);
                                hw.material.dispose();
                                b.hoverWindows.splice(i, 1);
                            }
                        }
                    }
                }

                // 更新车流（地面 + 桥上）
                updateCars(delta);

                // 鼠标光标附近楼群窗户随机变亮检测
                checkMouseHover(elapsed);

                // ===== 相机阶段过渡（双向：0↔1↔2） =====
                // 城市开始生长时自动触发 阶段0→阶段1
                if (isAnimating && camCurrentPhase === 0 && camTargetPhase === 0 && camTransitionProgress >= 1) {
                    transitionCameraTo(1, 3.0);
                }
                // 执行阶段过渡 lerp
                if (camTransitionProgress < 1) {
                    camTransitionProgress = Math.min(camTransitionProgress + delta / camTransitionDuration, 1);
                    const t = camTransitionProgress < 0.5
                        ? 4 * camTransitionProgress * camTransitionProgress * camTransitionProgress
                        : 1 - Math.pow(-2 * camTransitionProgress + 2, 3) / 2;
                    const to = camPhases[camTargetPhase];
                    camera.position.lerpVectors(camTransitionStartPos, to.pos, t);
                    controls.target.lerpVectors(camTransitionStartTarget, to.target, t);
                    if (camTransitionProgress >= 1) {
                        camCurrentPhase = camTargetPhase;
                    }
                }
                // 过渡回阶段0且完成时，停止城市动画（此时城市已淡出，星空已恢复）
                if (camTargetPhase === 0 && camTransitionProgress >= 1 && !cityLayer.classList.contains('active')) {
                    stopCity();
                }
                // 阶段3（向上退出）过渡到 25% 时开始渐变淡出城市层（2.5s 淡出）
                if (camTargetPhase === 3 && camTransitionProgress >= 0.25 && cityLayer.classList.contains('active')) {
                    // 延长 CSS 淡出过渡时间，与相机上移动画重叠形成平滑渐变
                    // 关键：visibility 也必须加入 transition，否则 remove('active') 时
                    // visibility:visible→hidden 瞬间生效，opacity 渐变不可见 → 背景突然出现
                    cityLayer.style.transition = 'opacity 2.5s ease, visibility 2.5s ease';
                    cityLayer.classList.remove('active');
                    if (vcOverlay) {
                        vcOverlay.style.transition = 'opacity 1.2s ease, visibility 1.2s ease';
                        vcOverlay.classList.remove('active');
                    }
                    window._cityActive = false;
                    // 启动星空，直接处于核心功能稳定状态（地球近景），城市渐隐时露出稳定画面
                    if (window._resumeStarfieldAtFeatures) window._resumeStarfieldAtFeatures();
                }
                // 阶段3过渡完成时，停止城市动画
                if (camTargetPhase === 3 && camTransitionProgress >= 1) {
                    stopCity();
                    // 恢复 CSS 默认过渡时间
                    cityLayer.style.transition = '';
                    if (vcOverlay) vcOverlay.style.transition = '';
                }

                controls.update();
                renderer.render(scene, camera);

                // 更新价值卡片 3D→2D 投影位置
                updateValueCardPositions();
            }

            // ============================================================
            //  9. 窗口自适应
            // ============================================================
            window.addEventListener('resize', () => {
                const w = window.innerWidth;
                const h = window.innerHeight;
                camera.aspect = w / h;
                camera.updateProjectionMatrix();
                renderer.setSize(w, h);
            });

            // HOVER_WINDOW_DURATION 已在鼠标交互模块中声明（5.2.6 节）

            console.log('🌃 科技城市生长动画已就绪（价值与意义区段），等待滚动激活。');
            console.log(`📐 共 ${totalBuildings} 栋建筑，河道将随城市同步蜿蜒延伸。`);
            console.log('💡 楼房升起后，密集的正方形窗户会逐渐点亮。');
            console.log(`🌊 河道宽度 ${riverWidth} 单位，从起点向终点延伸。`);
            console.log('🚗 地面车流无视楼房，桥上也有车流穿梭。');

            // 暴露控制接口（含阶段过渡方法）
            _cityAPI = { animate, restart: restartCityGrowth, transitionCameraTo };

            // 「技术实现」区段 IntersectionObserver — 双向门控
            // 进入→阶段2（靠近桥梁）；离开时只有 #value 仍可见（向上滚）才退回阶段1
            // 向下滚到 CTA 时 #value 不可见，不退回（城市保持阶段2）
            const techSection = document.getElementById('tech');
            if (techSection) {
                const _techObserver = new IntersectionObserver(function (entries) {
                    entries.forEach(function (entry) {
                        const ratio = entry.intersectionRatio;
                        if (ratio >= 0.2 && !_techVisible) {
                            _techVisible = true;
                            _cityAPI.transitionCameraTo(2, 2.5);  // 靠近桥梁
                        } else if (ratio <= 0.1 && _techVisible) {
                            _techVisible = false;
                            // 只有 #value 仍可见（向上滚回 #value）才退回阶段1
                            // 向下滚到 CTA 时 _cityVisible=false，不退回
                            if (_cityVisible) {
                                _cityAPI.transitionCameraTo(1, 2.5);
                            }
                        }
                    });
                }, { threshold: [0, 0.1, 0.2, 0.3] });
                _techObserver.observe(techSection);
            }
        }

        // ============================================================
        //  10. 滚动门控 — 双向（用 #value/#tech 交叉可见性判断滚动方向）
        //  进入#value→城市生长+阶段1
        //  离开#value 时：#tech 可见=向下滚到技术实现(城市保持)；#tech 不可见=向上滚回核心功能(切回星空)
        // ============================================================
        if (valueSection && cityLayer) {
            const _cityObserver = new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    const ratio = entry.intersectionRatio;
                    if (ratio >= 0.3 && !_cityVisible) {
                        // 进入「价值与意义」
                        _cityVisible = true;
                        cityLayer.classList.add('active');
                        if (vcOverlay) vcOverlay.classList.add('active');
                        window._cityActive = true;
                        // 中止可能正在进行的星空动画
                        if (window._pauseStarfield) window._pauseStarfield();
                        if (!cityInited) {
                            // 首次进入：初始化 + 从头生长
                            initCityScene();
                            cityInited = true;
                            _cityAPI.restart();
                            startCity();
                        } else if (!cityRunning) {
                            // 城市已停止（从上方重新进入）：重新生长
                            _cityAPI.restart();
                            startCity();
                        } else {
                            // 城市在运行（可能正在阶段3过渡，或从下方回退）
                            // 如果正在阶段3过渡（向上退出），取消它，回到阶段1
                            _cityAPI.transitionCameraTo(1, 2.5);
                        }
                    } else if (ratio <= 0.1 && _cityVisible) {
                        // 离开「价值与意义」
                        _cityVisible = false;
                        // #tech 可见 = 向下滚动到技术实现，城市保持不变
                        // #tech 不可见 = 向上滚动回到核心功能，平滑过渡到星空
                        if (!_techVisible) {
                            // 相机上移 + 城市渐隐 + 星空直接显示核心功能稳定画面
                            // 时序：阶段3持续3.5s，25%(0.875s)时开始2.5s CSS淡出，
                            //       淡出在3.375s完成，stopCity在3.5s触发（留有缓冲）
                            _cityAPI.transitionCameraTo(3, 3.5);
                        }
                    }
                });
            }, { threshold: [0, 0.1, 0.2, 0.3, 0.5] });
            _cityObserver.observe(valueSection);
        }
