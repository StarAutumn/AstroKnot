        (function () {
            // ---------- 配置 ----------
            const STORAGE_KEY = 'astroknot_preview_notes';
            let is2DMode = false;
            let zoomScale = 1;           // 2D模式的缩放比例

            // ---------- 全局变量 ----------
            let selectedNodeId = null;
            let editingNodeId = null;
            let nodeNotes = {};

            try {
                const saved = localStorage.getItem(STORAGE_KEY);
                if (saved) nodeNotes = JSON.parse(saved);
            } catch (e) { }

            const container = document.getElementById('previewContainer');
            const canvas3D = document.getElementById('previewCanvas');
            if (!container || !canvas3D) return;

            // ---------- 动态创建2D Canvas ----------
            const canvas2D = document.createElement('canvas');
            canvas2D.id = 'previewCanvas2D';
            canvas2D.style.cssText = `
            position: absolute;
            top: 0; left: 0;
            width: 100% !important;
            height: 100% !important;
            display: none;
            border-radius: var(--panel-radius, 12px);
            cursor: default;
        `;
            container.appendChild(canvas2D);

            // 2D滚轮缩放
            canvas2D.addEventListener('wheel', function (e) {
                e.preventDefault();
                const delta = e.deltaY > 0 ? -0.08 : 0.08;
                zoomScale = Math.max(0.3, Math.min(2.5, zoomScale + delta));
                render2D();
            }, { passive: false });
            // ---------- 尺寸自适应 ----------
            function getSize() {
                const w = container.clientWidth || 800;
                const h = container.clientHeight || 500;
                return { w, h };
            }

            function resizeRenderer() {
                const { w, h } = getSize();
                canvas3D.width = w;
                canvas3D.height = h;
                renderer.setSize(w, h, false);
                camera.aspect = w / h;
                camera.updateProjectionMatrix();
                if (is2DMode) render2D();
            }

            // ---------- 3D 场景 ----------
            const scene = new THREE.Scene();
            scene.background = new THREE.Color(0x050a18);

            const camera = new THREE.PerspectiveCamera(40, container.clientWidth / container.clientHeight, 0.1, 100);
            camera.position.set(4, 3, 6);

            const renderer = new THREE.WebGLRenderer({
                canvas: canvas3D,
                antialias: true,
                alpha: false,
                powerPreference: 'high-performance',
                stencil: false,
                depth: true
            });
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

            // GPU 崩溃恢复
            let previewAnimRunning = false;
            canvas3D.addEventListener('webglcontextlost', function (e) {
                e.preventDefault();
                console.warn('[AstroKnot Preview] WebGL 上下文丢失');
                previewAnimRunning = false;
            });
            canvas3D.addEventListener('webglcontextrestored', function () {
                console.log('[AstroKnot Preview] WebGL 上下文已恢复');
                previewAnimRunning = true;
                requestAnimationFrame(animate3D);
            });

            resizeRenderer();

            const controls = new THREE.OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.05;
            controls.autoRotate = true;
            controls.autoRotateSpeed = 1.6;
            controls.target.set(0, 0.2, 0);
            controls.enableDblClick = false;
            controls.update();

            canvas3D.addEventListener('mousedown', e => e.stopPropagation());
            canvas3D.addEventListener('touchstart', e => e.stopPropagation());
            container.addEventListener('mouseenter', () => { controls.autoRotate = false; });
            container.addEventListener('mouseleave', () => { controls.autoRotate = true; });

            // ---------- 灯光 ----------
            scene.add(new THREE.AmbientLight(0x223344));
            const dirLight = new THREE.DirectionalLight(0xccddff, 0.9);
            dirLight.position.set(1, 2, 1);
            scene.add(dirLight);
            const pLight = new THREE.PointLight(0x33aacc, 0.7);
            pLight.position.set(0, 1, -2);
            scene.add(pLight);

            // ---------- 发光纹理 ----------
            function createGlowTexture() {
                const c = document.createElement('canvas');
                c.width = c.height = 64;
                const ctx = c.getContext('2d');
                const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
                g.addColorStop(0, 'rgba(255,255,255,1)');
                g.addColorStop(0.3, 'rgba(255,255,255,0.8)');
                g.addColorStop(0.7, 'rgba(255,255,255,0.2)');
                g.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.fillStyle = g;
                ctx.fillRect(0, 0, 64, 64);
                return new THREE.CanvasTexture(c);
            }
            const glowTex = createGlowTexture();

            // ---------- 节点数据 ----------
            let nodesData = [
                { id: 'MOC', name: '学习方法', pos: [0, 0.4, 0] },
                { id: 'Feynman', name: '费曼法', pos: [1.8, 1.0, 1.2] },
                { id: 'Ebbinghaus', name: '艾宾浩斯', pos: [-1.5, -0.6, 1.8] },
                { id: 'Mindmap', name: '思维导图', pos: [1.6, -0.2, -1.8] },
                { id: 'Pomodoro', name: '番茄法', pos: [-1.9, 0.8, -1.5] },
                { id: 'Zettelkasten', name: '卡片盒', pos: [0.2, 2.0, -0.5] }
            ];

            let edgePairs = [
                ['MOC', 'Feynman'], ['MOC', 'Ebbinghaus'], ['MOC', 'Mindmap'],
                ['MOC', 'Pomodoro'], ['MOC', 'Zettelkasten'],
                ['Feynman', 'Zettelkasten'], ['Ebbinghaus', 'Mindmap'], ['Pomodoro', 'Feynman']
            ];

            // ---------- 核心数据结构 ----------
            let nodeMap = new Map();
            let spheres = [];
            let sphereMap = new Map();
            let lineItems = [];

            // ---------- 工具函数 ----------
            function generateId() {
                return 'N' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
            }

            function saveNotesToStorage() {
                const notes = {};
                for (const [id, sphere] of sphereMap) {
                    if (sphere.userData.note) notes[id] = sphere.userData.note;
                }
                localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
            }

            function getNodeColor(id, time) {
                let hash = 0;
                for (let i = 0; i < id.length; i++) {
                    hash = (hash + id.charCodeAt(i) * 31) & 0xFFFFFFFF;
                }
                const hue = (time * 0.04 + (hash % 100) / 100) % 1;
                return { hue, color: `hsl(${hue * 360}, 85%, 55%)`, emissive: `hsl(${hue * 360}, 80%, 35%)` };
            }

            // ---------- 3D 节点创建 ----------
            function createNodeMesh3D(n) {
                const pos = new THREE.Vector3(...n.pos);
                const mat = new THREE.MeshStandardMaterial({
                    color: 0x88ccff,
                    emissive: 0x4488ff,
                    emissiveIntensity: 0.7,
                    roughness: 0.3,
                    metalness: 0.1
                });
                const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.25, 32, 32), mat);
                sphere.position.copy(pos);
                sphere.userData = { id: n.id, note: nodeNotes[n.id] || '' };
                scene.add(sphere);
                sphereMap.set(n.id, sphere);

                const glowMat = new THREE.MeshBasicMaterial({
                    map: glowTex,
                    color: 0x88aaff,
                    transparent: true,
                    opacity: 0.5,
                    side: THREE.BackSide,
                    blending: THREE.AdditiveBlending
                });
                const glow = new THREE.Mesh(new THREE.SphereGeometry(0.33, 16, 16), glowMat);
                sphere.add(glow);

                const ring = new THREE.Mesh(
                    new THREE.TorusGeometry(0.34, 0.018, 16, 32),
                    new THREE.MeshStandardMaterial({ color: 0x66ccff, emissive: 0x2288aa, emissiveIntensity: 0.9 })
                );
                sphere.add(ring);
                ring.userData = { speed: [0.5 + Math.random() * 0.6, 0.4 + Math.random() * 0.6, 0.6 + Math.random() * 0.6] };

                const labelCanvas = document.createElement('canvas');
                labelCanvas.width = 256;
                labelCanvas.height = 80;
                const ctx2 = labelCanvas.getContext('2d');
                ctx2.fillStyle = 'rgba(8,20,30,0.7)';
                ctx2.shadowColor = 'rgba(0,200,255,0.5)';
                ctx2.shadowBlur = 20;
                ctx2.beginPath();
                ctx2.roundRect(10, 10, 236, 60, 30);
                ctx2.fill();
                ctx2.shadowBlur = 0;
                ctx2.font = 'bold 28px "Segoe UI", "PingFang SC", sans-serif';
                ctx2.fillStyle = '#f0faff';
                ctx2.textAlign = 'center';
                ctx2.textBaseline = 'middle';
                ctx2.fillText(n.name, 128, 48);
                const labelTexture = new THREE.CanvasTexture(labelCanvas);
                const labelMat = new THREE.SpriteMaterial({ map: labelTexture, transparent: true, depthTest: false });
                const label = new THREE.Sprite(labelMat);
                label.position.set(pos.x, pos.y + 0.55, pos.z);
                label.scale.set(0.8, 0.25, 1);
                scene.add(label);
                sphere.userData.label = label;
                spheres.push(sphere);
                nodeMap.set(n.id, n);
                return sphere;
            }

            // ---------- 3D 螺旋连线 ----------
            function SpiralFlowLine(start, end, phase) {
                this.start = start.clone();
                this.end = end.clone();
                this.dir = new THREE.Vector3().subVectors(this.end, this.start).normalize();
                const up = new THREE.Vector3(0, 1, 0);
                if (Math.abs(this.dir.dot(up)) > 0.9999) up.set(1, 0, 0);
                this.binormal = new THREE.Vector3().crossVectors(this.dir, up).normalize();
                this.normal = new THREE.Vector3().crossVectors(this.binormal, this.dir).normalize();
                this.length = this.start.distanceTo(this.end);

                const curve = new THREE.CatmullRomCurve3([this.start, this.end]);
                const tubeGeom = new THREE.TubeGeometry(curve, 28, 0.016, 6, false);

                const canvas = document.createElement('canvas');
                canvas.width = 1024;
                canvas.height = 32;
                const ctx = canvas.getContext('2d');
                const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
                grad.addColorStop(0, '#ff0040');
                grad.addColorStop(0.25, '#ff8000');
                grad.addColorStop(0.5, '#ffff00');
                grad.addColorStop(0.75, '#00ff80');
                grad.addColorStop(1, '#00aaff');
                ctx.fillStyle = grad;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                this.texture = new THREE.CanvasTexture(canvas);
                this.texture.wrapS = THREE.RepeatWrapping;
                const period = this.length * (2.2 + Math.random() * 0.8);
                this.texture.repeat.set(this.length / period, 1);

                this.mesh = new THREE.Mesh(tubeGeom, new THREE.MeshStandardMaterial({
                    map: this.texture,
                    emissive: 0x884466,
                    emissiveIntensity: 0.6,
                    transparent: true
                }));
                this.offsetPhase = phase || 0;
                scene.add(this.mesh);

                this.particles = [];
                for (let i = 0; i < 6; i++) {
                    const p = new THREE.Mesh(
                        new THREE.SphereGeometry(0.018, 6, 6),
                        new THREE.MeshStandardMaterial({ color: 0xffaa88, emissive: 0xff66cc, emissiveIntensity: 15 })
                    );
                    scene.add(p);
                    this.particles.push({
                        mesh: p,
                        t_offset: i / 6,
                        angle_offset: Math.PI * 2 * (i / 6),
                        speed_t: 0.5 + Math.random() * 0.5,
                        speed_angle: 2 + Math.random() * 1.5
                    });
                }
            }

            SpiralFlowLine.prototype.update = function (time) {
                const off = (time * 0.6 + this.offsetPhase) % 1;
                this.texture.offset.x = off;
                this.texture.needsUpdate = true;
                this.mesh.material.emissiveIntensity = 0.6 + Math.sin(time * 1.2 + this.offsetPhase) * 0.3;

                for (const p of this.particles) {
                    const t = (time * p.speed_t * 0.2 + p.t_offset) % 1;
                    const pos = this.start.clone().lerp(this.end, t);
                    const angle = time * p.speed_angle + p.angle_offset;
                    const r = 0.12;
                    const offVec = this.normal.clone().multiplyScalar(Math.cos(angle) * r)
                        .add(this.binormal.clone().multiplyScalar(Math.sin(angle) * r));
                    const fp = pos.add(offVec);
                    p.mesh.position.copy(fp);
                    const hue = (time * 0.3 + p.t_offset) % 1;
                    const col = new THREE.Color().setHSL(hue, 1, 0.65);
                    p.mesh.material.color = col;
                    p.mesh.material.emissive = col;
                }
            };

            SpiralFlowLine.prototype.dispose = function () {
                scene.remove(this.mesh);
                this.mesh.geometry.dispose();
                this.mesh.material.dispose();
                this.texture.dispose();
                for (const p of this.particles) {
                    scene.remove(p.mesh);
                    p.mesh.geometry.dispose();
                    p.mesh.material.dispose();
                }
            };

            // ---------- 重建3D场景 ----------
            function buildScene3D() {
                for (const sphere of spheres) {
                    scene.remove(sphere);
                    if (sphere.userData.label) scene.remove(sphere.userData.label);
                    sphere.geometry.dispose();
                    sphere.material.dispose();
                }
                for (const line of lineItems) line.dispose();
                spheres = [];
                sphereMap.clear();
                lineItems = [];
                nodeMap.clear();

                for (const n of nodesData) {
                    createNodeMesh3D(n);
                }

                for (const [fromId, toId] of edgePairs) {
                    const from = nodeMap.get(fromId);
                    const to = nodeMap.get(toId);
                    if (from && to) {
                        const start = new THREE.Vector3(...from.pos);
                        const end = new THREE.Vector3(...to.pos);
                        const line = new SpiralFlowLine(start, end, Math.random());
                        lineItems.push(line);
                    }
                }
            }

            // ============================================================
            //  2D 模式
            // ============================================================

            // ---------- 2D 布局计算（树形布局，从上到下） ----------
            let layout2D = new Map(); // id -> {x, y}

            function computeLayout2D(width, height) {
                layout2D.clear();
                const root = nodesData.find(n => n.id === 'MOC');
                if (!root) return;

                // 构建父子关系
                const childrenMap = new Map();
                const nodeMap2 = new Map();
                for (const n of nodesData) {
                    nodeMap2.set(n.id, n);
                    childrenMap.set(n.id, []);
                }
                for (const [from, to] of edgePairs) {
                    // 只添加树边（排除交叉边）
                    if (childrenMap.has(from) && childrenMap.has(to)) {
                        // 避免重复
                        if (!childrenMap.get(from).includes(to)) {
                            childrenMap.get(from).push(to);
                        }
                    }
                }

                // 计算每个节点的深度
                const depthMap = new Map();
                const queue = [{ id: 'MOC', depth: 0 }];
                const order = [];
                while (queue.length > 0) {
                    const { id, depth } = queue.shift();
                    depthMap.set(id, depth);
                    order.push(id);
                    for (const child of (childrenMap.get(id) || [])) {
                        queue.push({ id: child, depth: depth + 1 });
                    }
                }

                // 按深度分组
                const depthGroups = new Map();
                for (const [id, depth] of depthMap) {
                    if (!depthGroups.has(depth)) depthGroups.set(depth, []);
                    depthGroups.get(depth).push(id);
                }

                // 计算布局
                const topMargin = 50;
                const bottomMargin = 30;
                const leftMargin = 40;
                const rightMargin = 40;
                const usableWidth = width - leftMargin - rightMargin;
                const usableHeight = height - topMargin - bottomMargin;
                const maxDepth = depthGroups.size > 0 ? depthGroups.size - 1 : 0;
                const vGap = maxDepth > 0 ? usableHeight / maxDepth : 0;

                // 按深度从浅到深处理
                const sortedDepths = Array.from(depthGroups.keys()).sort((a, b) => a - b);
                for (const depth of sortedDepths) {
                    const nodes = depthGroups.get(depth) || [];
                    const count = nodes.length;
                    const y = topMargin + depth * vGap;

                    // 计算每个节点的x位置
                    if (count === 1) {
                        layout2D.set(nodes[0], { x: width / 2, y });
                    } else {
                        const hGap = usableWidth / (count + 1);
                        for (let i = 0; i < count; i++) {
                            const x = leftMargin + hGap * (i + 1);
                            layout2D.set(nodes[i], { x, y });
                        }
                    }
                }

                // 微调：让子节点围绕父节点居中
                for (const [id, children] of childrenMap) {
                    if (children.length === 0) continue;
                    const parentPos = layout2D.get(id);
                    if (!parentPos) continue;
                    const childPositions = children.map(cid => layout2D.get(cid)).filter(p => p);
                    if (childPositions.length === 0) continue;
                    const avgX = childPositions.reduce((s, p) => s + p.x, 0) / childPositions.length;
                    const offset = parentPos.x - avgX;
                    for (const cid of children) {
                        const pos = layout2D.get(cid);
                        if (pos) pos.x += offset * 0.5;
                    }
                }
            }

            // ---------- 2D 渲染 ----------
            let time2D = 0;

            function render2D() {
                const { w, h } = getSize();
                canvas2D.width = w;
                canvas2D.height = h;
                const ctx = canvas2D.getContext('2d');
                // ---- 新增：缩放支持（以中心为原点） ----
                ctx.save();
                // 将缩放原点移到视口中心
                const cx = w / 2;
                const cy = h / 2;
                ctx.translate(cx, cy);
                ctx.scale(zoomScale, zoomScale);
                ctx.translate(-cx, -cy);
                // 清空
                ctx.clearRect(0, 0, w, h);



                // 计算布局
                computeLayout2D(w, h);

                // 收集所有节点位置
                const positions = new Map();
                for (const n of nodesData) {
                    const pos = layout2D.get(n.id);
                    if (pos) positions.set(n.id, pos);
                }

                // 绘制连线（先绘制，让节点在上层）
                const nodeRadius = 22;

                // 树边
                const childrenMap2 = new Map();
                for (const n of nodesData) childrenMap2.set(n.id, []);
                for (const [from, to] of edgePairs) {
                    if (childrenMap2.has(from) && childrenMap2.has(to)) {
                        if (!childrenMap2.get(from).includes(to)) {
                            childrenMap2.get(from).push(to);
                        }
                    }
                }

                // 绘制树边
                for (const [fromId, children] of childrenMap2) {
                    const fromPos = positions.get(fromId);
                    if (!fromPos) continue;
                    for (const toId of children) {
                        const toPos = positions.get(toId);
                        if (!toPos) continue;
                        ctx.beginPath();
                        ctx.moveTo(fromPos.x, fromPos.y);
                        const cpY = (fromPos.y + toPos.y) / 2;
                        ctx.quadraticCurveTo((fromPos.x + toPos.x) / 2, cpY, toPos.x, toPos.y);
                        ctx.strokeStyle = 'rgba(100, 200, 255, 0.35)';
                        ctx.lineWidth = 2;
                        ctx.stroke();
                    }
                }

                // 绘制交叉边（虚线）
                const treeEdges = new Set(edgePairs.map(([a, b]) => a + '-' + b));
                for (const [fromId, toId] of edgePairs) {
                    if (treeEdges.has(fromId + '-' + toId) || treeEdges.has(toId + '-' + fromId)) continue;
                    const fromPos = positions.get(fromId);
                    const toPos = positions.get(toId);
                    if (!fromPos || !toPos) continue;
                    ctx.beginPath();
                    ctx.moveTo(fromPos.x, fromPos.y);
                    const cpY = (fromPos.y + toPos.y) / 2 - 20;
                    ctx.quadraticCurveTo((fromPos.x + toPos.x) / 2, cpY, toPos.x, toPos.y);
                    ctx.strokeStyle = 'rgba(255, 170, 100, 0.4)';
                    ctx.lineWidth = 1.5;
                    ctx.setLineDash([6, 6]);
                    ctx.stroke();
                    ctx.setLineDash([]);
                }

                // 绘制节点
                const time = time2D;
                for (const n of nodesData) {
                    const pos = positions.get(n.id);
                    if (!pos) continue;
                    const isSelected = (selectedNodeId === n.id);
                    const { hue, color } = getNodeColor(n.id, time);

                    // 阴影（发光效果）
                    ctx.shadowColor = isSelected ? 'rgba(255, 215, 0, 0.8)' : `hsla(${hue * 360}, 80%, 60%, 0.3)`;
                    ctx.shadowBlur = isSelected ? 30 : 18;

                    // 节点圆
                    ctx.beginPath();
                    ctx.arc(pos.x, pos.y, nodeRadius, 0, Math.PI * 2);
                    if (isSelected) {
                        ctx.fillStyle = '#ffd700';
                        ctx.shadowColor = 'rgba(255, 215, 0, 0.9)';
                        ctx.shadowBlur = 40;
                    } else {
                        ctx.fillStyle = color;
                    }
                    ctx.fill();

                    // 外发光环（所有节点）
                    ctx.shadowBlur = 0;
                    ctx.beginPath();
                    ctx.arc(pos.x, pos.y, nodeRadius + 4, 0, Math.PI * 2);
                    ctx.strokeStyle = isSelected ? 'rgba(255, 215, 0, 0.6)' : `hsla(${hue * 360}, 70%, 60%, 0.2)`;
                    ctx.lineWidth = isSelected ? 3 : 1.5;
                    ctx.stroke();

                    // 标签
                    ctx.shadowBlur = 0;
                    ctx.font = isSelected ? 'bold 14px "Segoe UI", "PingFang SC", sans-serif' : '13px "Segoe UI", "PingFang SC", sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'top';
                    ctx.fillStyle = isSelected ? '#ffd700' : '#f0faff';
                    ctx.shadowColor = 'rgba(0,0,0,0.8)';
                    ctx.shadowBlur = 8;
                    const labelY = pos.y + nodeRadius + 6;
                    const maxWidth = 80;
                    let label = n.name;
                    if (ctx.measureText(label).width > maxWidth) {
                        while (ctx.measureText(label + '…').width > maxWidth && label.length > 2) {
                            label = label.slice(0, -1);
                        }
                        label += '…';
                    }
                    ctx.fillText(label, pos.x, labelY);
                    ctx.shadowBlur = 0;

                    // 保存位置信息用于点击检测
                    n._2dPos = { x: pos.x, y: pos.y, radius: nodeRadius + 8 };
                }

                // 恢复阴影
                ctx.shadowBlur = 0;
                ctx.shadowColor = 'transparent';

                // ---- 新增：恢复缩放 ----
                ctx.restore();
            }

            // ---------- 2D 交互 ----------
            // ---------- 2D 交互 ----------
            function getIntersectedNode2D(event) {
                const rect = canvas2D.getBoundingClientRect();
                const scaleX = canvas2D.width / rect.width;
                const scaleY = canvas2D.height / rect.height;
                // 物理像素坐标
                let mx = (event.clientX - rect.left) * scaleX;
                let my = (event.clientY - rect.top) * scaleY;
                // ⭐ 关键修复：转换为逻辑坐标（除以缩放）
                mx /= zoomScale;
                my /= zoomScale;

                for (const n of nodesData) {
                    if (!n._2dPos) continue;
                    const dx = mx - n._2dPos.x;
                    const dy = my - n._2dPos.y;
                    if (dx * dx + dy * dy < n._2dPos.radius * n._2dPos.radius) {
                        return n.id;
                    }
                }
                return null;
            }

            // ============================================================
            //  共享功能：高亮、编辑器、增删节点
            // ============================================================

            function setSelectedNode(nodeId) {
                if (selectedNodeId) {
                    // 清除旧高亮
                }
                selectedNodeId = nodeId;
                if (is2DMode) {
                    render2D();
                }
            }

            // ---------- 编辑器 UI ----------
            const editorDiv = document.createElement('div');
            editorDiv.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 360px;
            max-width: 90%;
            background: rgba(10, 22, 34, 0.95);
            backdrop-filter: blur(12px);
            border: 1px solid rgba(0, 255, 255, 0.6);
            border-radius: 16px;
            padding: 20px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.8);
            z-index: 20;
            display: none;
            font-family: 'Segoe UI', system-ui, sans-serif;
            color: #eef;
        `;
            editorDiv.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <span style="font-size:16px; font-weight:600; color:#0ff;">📝 编辑笔记</span>
                <button id="closeEditorBtn" style="background:transparent; border:none; color:#aac; font-size:20px; cursor:pointer; padding:0 8px;">✕</button>
            </div>
            <div style="font-size:13px; color:#aac; margin-bottom:8px;">节点：<span id="editorNodeName"></span></div>
            <textarea id="editorTextarea" style="width:100%; height:120px; background:#07161f; border:1px solid #2c6e7e; color:#eef; border-radius:8px; padding:8px; font-size:14px; resize:vertical; box-sizing:border-box;"></textarea>
            <div style="display:flex; gap:10px; margin-top:12px;">
                <button id="saveNoteBtn" style="flex:1; background:#1a6e7e; border:none; color:white; padding:8px 0; border-radius:8px; cursor:pointer; font-weight:600;">💾 保存</button>
                <button id="cancelNoteBtn" style="flex:1; background:#3a4a5a; border:none; color:#ccc; padding:8px 0; border-radius:8px; cursor:pointer;">取消</button>
            </div>
        `;
            container.style.position = 'relative';
            container.appendChild(editorDiv);

            const editorTextarea = document.getElementById('editorTextarea');
            const editorNodeName = document.getElementById('editorNodeName');
            const closeEditorBtn = document.getElementById('closeEditorBtn');
            const saveNoteBtn = document.getElementById('saveNoteBtn');
            const cancelNoteBtn = document.getElementById('cancelNoteBtn');

            function openEditor(nodeId) {
                const node = nodesData.find(n => n.id === nodeId);
                if (!node) return;
                editingNodeId = nodeId;
                editorNodeName.textContent = node.name;
                const note = nodeNotes[nodeId] || '';
                editorTextarea.value = note;
                editorDiv.style.display = 'block';
                controls.autoRotate = false;
                setSelectedNode(nodeId);
            }

            function closeEditor() {
                editorDiv.style.display = 'none';
                editingNodeId = null;
                controls.autoRotate = true;
            }

            function saveNote() {
                if (editingNodeId) {
                    nodeNotes[editingNodeId] = editorTextarea.value;
                    // 同步到3D节点
                    const sphere = sphereMap.get(editingNodeId);
                    if (sphere) sphere.userData.note = editorTextarea.value;
                    saveNotesToStorage();
                }
                closeEditor();
            }

            closeEditorBtn.addEventListener('click', closeEditor);
            cancelNoteBtn.addEventListener('click', closeEditor);
            saveNoteBtn.addEventListener('click', saveNote);

            // ---------- 添加/删除节点 ----------
            function addNode() {
                const parentId = selectedNodeId || 'MOC';
                const parent = nodesData.find(n => n.id === parentId);
                if (!parent) return;

                const newId = generateId();
                const angle1 = Math.random() * Math.PI * 2;
                const angle2 = Math.random() * Math.PI * 2;
                const dist = 1.2 + Math.random() * 0.8;
                const pos = [
                    parent.pos[0] + Math.sin(angle1) * Math.cos(angle2) * dist,
                    parent.pos[1] + Math.sin(angle1) * Math.sin(angle2) * dist * 0.7,
                    parent.pos[2] + Math.cos(angle1) * dist
                ];

                const newNode = {
                    id: newId,
                    name: '新节点 ' + (nodesData.length),
                    pos: pos
                };
                nodesData.push(newNode);
                nodeNotes[newId] = '';
                edgePairs.push([parentId, newId]);

                buildScene3D();
                setSelectedNode(newId);
                saveNotesToStorage();
                if (is2DMode) render2D();
            }

            function deleteNode() {
                if (!selectedNodeId || selectedNodeId === 'MOC') {
                    alert('根节点不可删除，请选择其他节点');
                    return;
                }
                const node = nodesData.find(n => n.id === selectedNodeId);
                if (!confirm(`确定要删除节点 "${node?.name}" 及其所有连线吗？`)) return;

                const id = selectedNodeId;
                nodesData = nodesData.filter(n => n.id !== id);
                edgePairs = edgePairs.filter(([a, b]) => a !== id && b !== id);
                delete nodeNotes[id];

                setSelectedNode(null);
                buildScene3D();
                saveNotesToStorage();
                if (is2DMode) render2D();
            }

            // ---------- 工具栏 ----------
            const toolbarDiv = document.createElement('div');
            toolbarDiv.style.cssText = `
            position: absolute;
            top: 16px;
            left: 16px;
            z-index: 10;
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            background: rgba(8, 18, 28, 0.85);
            backdrop-filter: blur(8px);
            padding: 8px 12px;
            border-radius: 40px;
            border: 1px solid rgba(0, 255, 255, 0.3);
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
            pointer-events: auto;
        `;
            toolbarDiv.innerHTML = `
            <button id="addNodeBtn" style="background:#1a5e5e; border:none; color:white; padding:6px 14px; border-radius:30px; cursor:pointer; font-size:14px; font-weight:600;">➕ 添加</button>
            <button id="deleteNodeBtn" style="background:#6a2c2c; border:none; color:white; padding:6px 14px; border-radius:30px; cursor:pointer; font-size:14px; font-weight:600;">❌ 删除</button>
            <button id="resetViewBtn" style="background:#2c4a6a; border:none; color:white; padding:6px 14px; border-radius:30px; cursor:pointer; font-size:14px; font-weight:600;">⟲ 重置</button>
            <button id="toggleRotateBtn" style="background:#3a4a5a; border:none; color:white; padding:6px 14px; border-radius:30px; cursor:pointer; font-size:14px; font-weight:600;">⏸️</button>
            <button id="toggleModeBtn" style="background:#2a5a6a; border:none; color:white; padding:6px 14px; border-radius:30px; cursor:pointer; font-size:14px; font-weight:600;">🌳 2D</button>
        `;
            container.appendChild(toolbarDiv);

            document.getElementById('addNodeBtn').addEventListener('click', addNode);
            document.getElementById('deleteNodeBtn').addEventListener('click', deleteNode);

            document.getElementById('resetViewBtn').addEventListener('click', function () {
                if (is2DMode) {
                    render2D();
                } else {
                    camera.position.set(4, 3, 6);
                    controls.target.set(0, 0.2, 0);
                    controls.update();
                }
            });

            document.getElementById('toggleRotateBtn').addEventListener('click', function () {
                controls.autoRotate = !controls.autoRotate;
                this.textContent = controls.autoRotate ? '⏸️' : '▶️';
            });

            // ---------- 模式切换 ----------
            document.getElementById('toggleModeBtn').addEventListener('click', function () {
                is2DMode = !is2DMode;
                this.textContent = is2DMode ? '✨ 3D' : '🌳 2D';

                if (is2DMode) {
                    canvas3D.style.display = 'none';
                    canvas2D.style.display = 'block';
                    controls.autoRotate = false;
                    document.getElementById('toggleRotateBtn').textContent = '▶️';
                    render2D();
                } else {
                    canvas3D.style.display = 'block';
                    canvas2D.style.display = 'none';
                    controls.autoRotate = true;
                    document.getElementById('toggleRotateBtn').textContent = '⏸️';
                    // 触发3D渲染继续
                }
            });

            // ---------- 交互事件（统一处理） ----------
            function handleCanvasClick(event) {
                if (editorDiv.style.display === 'block') return;

                let nodeId = null;
                if (is2DMode) {
                    nodeId = getIntersectedNode2D(event);
                } else {
                    // 3D 点击检测
                    const rect = canvas3D.getBoundingClientRect();
                    const pointer = new THREE.Vector2();
                    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
                    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
                    const raycaster = new THREE.Raycaster();
                    raycaster.setFromCamera(pointer, camera);
                    const intersects = raycaster.intersectObjects(spheres);
                    if (intersects.length > 0) {
                        nodeId = intersects[0].object.userData.id;
                    }
                }

                if (nodeId) {
                    // 双击检测
                    if (window._clickTimer) {
                        clearTimeout(window._clickTimer);
                        window._clickTimer = null;
                        // 双击：打开编辑器
                        openEditor(nodeId);
                        return;
                    }
                    window._clickTimer = setTimeout(() => {
                        window._clickTimer = null;
                        // 单击：高亮
                        setSelectedNode(nodeId);
                        if (is2DMode) render2D();
                    }, 300);
                } else {
                    setSelectedNode(null);
                    if (is2DMode) render2D();
                }
            }

            container.addEventListener('click', handleCanvasClick);

            // ---------- 3D 动画循环 ----------
            let time3D = 0;

            function animate3D() {
                // 页面不可见时停止动画循环
                if (document.hidden) {
                    previewAnimRunning = false;
                    return;
                }
                previewAnimRunning = true;
                requestAnimationFrame(animate3D);

                if (is2DMode) {
                    // 2D模式：只更新2D动画
                    time2D += 0.016;
                    // 每秒刷新2D（七彩变化）
                    if (Math.floor(time2D * 60) % 2 === 0) {
                        render2D();
                    }
                    return;
                }

                time3D += 0.016;

                for (const line of lineItems) line.update(time3D);

                for (const sphere of spheres) {
                    const id = sphere.userData.id;
                    if (id === selectedNodeId) {
                        sphere.material.color.setHex(0xffd700);
                        sphere.material.emissive.setHex(0xffaa33);
                        sphere.material.emissiveIntensity = 1.5;
                        continue;
                    }
                    const { hue } = getNodeColor(id, time3D);
                    const color = new THREE.Color().setHSL(hue, 0.85, 0.55);
                    const emissive = new THREE.Color().setHSL(hue, 0.8, 0.35);
                    sphere.material.color.set(color);
                    sphere.material.emissive.set(emissive);
                    sphere.material.emissiveIntensity = 0.7 + Math.sin(time3D * 1.2 + parseInt(id.slice(-4), 36)) * 0.2;
                }

                for (const sphere of spheres) {
                    const ring = sphere.children.find(c => c.isMesh && c.geometry.type === 'TorusGeometry');
                    if (ring) {
                        const s = ring.userData.speed;
                        ring.rotation.x += s[0] * 0.02;
                        ring.rotation.y += s[1] * 0.02;
                        ring.rotation.z += s[2] * 0.02;
                    }
                }

                controls.update();
                renderer.render(scene, camera);
            }

            // ---------- 窗口自适应 ----------
            function onResize() {
                const { w, h } = getSize();
                canvas3D.width = w;
                canvas3D.height = h;
                canvas2D.width = w;
                canvas2D.height = h;
                renderer.setSize(w, h, false);
                camera.aspect = w / h;
                camera.updateProjectionMatrix();
                if (is2DMode) render2D();
            }

            window.addEventListener('resize', onResize);
            if (window.ResizeObserver) {
                const ro = new ResizeObserver(() => onResize());
                ro.observe(container);
            }

            // 页面可见性变化：隐藏时停止 rAF，可见时重启
            document.addEventListener('visibilitychange', function () {
                if (!document.hidden && !previewAnimRunning) {
                    previewAnimRunning = true;
                    requestAnimationFrame(animate3D);
                }
            });

            // ---------- 清理 ----------
            window.addEventListener('beforeunload', () => {
                for (const line of lineItems) line.dispose();
                renderer.dispose();
            });

            // ---------- 启动 ----------
            buildScene3D();
            previewAnimRunning = true;
            animate3D();

            console.log('[AstroKnot Preview] ✅ 3D/2D 双模式已启动');
        })();
