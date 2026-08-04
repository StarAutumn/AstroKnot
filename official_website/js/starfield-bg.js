        // ============================================================
        //  AstroKnot 完整3D场景 — 作为全页背景
        //  整合: module1(纹理) + module7(场景初始化) + module14(动画)
        // ============================================================
        (function () {
            var THREE = window.THREE;
            if (!THREE) { console.error('Three.js 未加载'); return; }

            var canvas = document.getElementById('starfield-canvas');
            if (!canvas) return;

            var renderer, scene, camera, skySphere, earthGroup, earthMat;
            var _camLerpFactor = 0, _defaultCamPos = null, _introCamPos = null, _defaultLookAt = null, _introLookAt = null, _camTargetFactor = 0;
            // 复用临时 Vector3 避免每帧 new（性能优化）
            var _lookAtTmpVec = null, _worldDirTmpVec = null;
            if (THREE.Vector3) { _lookAtTmpVec = new THREE.Vector3(); _worldDirTmpVec = new THREE.Vector3(); }
            var _featuresCamPos = null, _featuresLookAt = null, _featuresTargetFactor = 0;
            var _featuresLerpState = 0;
            var _activeSection = 'default'; // 'default' | 'intro' | 'features'
            var tm = 0;
            var starGroups = [], nebulaFlowGroups = [], flowField = null;
            var bgAnimationRunning = false;  // 动画循环运行状态标记
            // ── 星球+相机系统（抽离至 planet-camera.js） ──
            var planetCamera = null;

            // ── 性能检测：低端设备粒子降级 ──
            var _isLowEnd = (function () {
                try {
                    var c = document.createElement('canvas');
                    var gl = c.getContext('webgl') || c.getContext('experimental-webgl');
                    if (!gl) return true;
                    var dbg = gl.getExtension('WEBGL_debug_renderer_info');
                    var rendererStr = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL).toLowerCase() : '';
                    // 集成显卡或移动设备标记为低端
                    if (/mali|adreno|powervr|apple gpu|intel.*hd|intel.*uhd|swiftshader/i.test(rendererStr)) return true;
                    // 纹理单元少于 8 个为低端
                    if (gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) < 8) return true;
                    return false;
                } catch (e) { return false; }
            })();
            // 降级乘数：低端设备粒子数减半
            var _particleScale = _isLowEnd ? 0.5 : 1.0;
            if (_isLowEnd) console.log('[AstroKnot BG] 检测到低端设备，粒子数量降级为50%');

            // ──────────────────────────────────────
            //  模块1: 纹理生成（createGlowTexture + createPanoramaTexture）
            // ──────────────────────────────────────
            function createGlowTexture() {
                var c = document.createElement('canvas');
                c.width = c.height = 64;
                var ctx = c.getContext('2d');
                var g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
                g.addColorStop(0, 'rgba(255,255,255,1)');
                g.addColorStop(0.2, 'rgba(255,255,255,0.9)');
                g.addColorStop(0.4, 'rgba(255,255,255,0.6)');
                g.addColorStop(0.7, 'rgba(255,255,255,0.2)');
                g.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
                return new THREE.CanvasTexture(c);
            }

            function createPanoramaTexture() {
                var c = document.createElement('canvas');
                var W = 8192, H = 4096;  // 与项目一致
                c.width = W; c.height = H;
                var ctx = c.getContext('2d');

                // 深空底色
                var bg = ctx.createLinearGradient(0, 0, 0, H);
                bg.addColorStop(0, '#010118'); bg.addColorStop(0.3, '#030a22');
                bg.addColorStop(0.7, '#010a1c'); bg.addColorStop(1, '#000812');
                ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

                function dp(x, y, fn) { for (var o = -1; o <= 1; o++) { ctx.save(); ctx.translate(o * W, 0); fn(x, y); ctx.restore(); } }

                // 星云层
                for (var i = 0; i < 25; i++) {
                    var cx = Math.random() * W, cy = Math.random() * H, rx = 300 + Math.random() * 800, ry = 150 + Math.random() * 400, rot = Math.random() * Math.PI;
                    var h = (i * 30 + Math.random() * 25) % 360, s = 55 + Math.random() * 35, l = 25 + Math.random() * 25;
                    dp(cx, cy, function (x, y) {
                        ctx.translate(x, y); ctx.rotate(rot); ctx.scale(rx / 800, ry / 500);
                        var g = ctx.createRadialGradient(0, 0, 0, 0, 0, 400);
                        g.addColorStop(0, 'hsla(' + h + ',' + s + '%,' + l + '%,0.04)');
                        g.addColorStop(0.15, 'hsla(' + h + ',' + s + '%,' + l + '%,0.035)');
                        g.addColorStop(0.4, 'hsla(' + h + ',' + (s * 0.9).toFixed(0) + '%,' + (l * 0.9).toFixed(0) + '%,0.02)');
                        g.addColorStop(0.7, 'hsla(' + h + ',' + (s * 0.8).toFixed(0) + '%,' + (l * 0.8).toFixed(0) + '%,0.008)');
                        g.addColorStop(1, 'transparent');
                        ctx.fillStyle = g; ctx.fillRect(-400, -400, 800, 800);
                    });
                    for (var j = 0; j < 3; j++) {
                        var ox = (Math.random() - 0.5) * rx * 0.5, oy = (Math.random() - 0.5) * ry * 0.5, cr = 120 + Math.random() * 250, crot = Math.random() * Math.PI;
                        dp(cx + ox, cy + oy, function (x, y) {
                            ctx.translate(x, y); ctx.rotate(crot); ctx.scale(cr / 400, cr / 400);
                            var g = ctx.createRadialGradient(0, 0, 0, 0, 0, 200);
                            g.addColorStop(0, 'hsla(' + h + ',' + s + '%,' + l + '%,0.05)');
                            g.addColorStop(0.3, 'hsla(' + h + ',' + s + '%,' + l + '%,0.04)');
                            g.addColorStop(0.6, 'hsla(' + h + ',' + (s * 0.8).toFixed(0) + '%,' + (l * 0.8).toFixed(0) + '%,0.015)');
                            g.addColorStop(1, 'transparent');
                            ctx.fillStyle = g; ctx.fillRect(-200, -200, 400, 400);
                        });
                    }
                }

                // 扩散光晕
                for (var i = 0; i < 8; i++) {
                    var cx = Math.random() * W, cy = Math.random() * H, rx = 600 + Math.random() * 1000, ry = 300 + Math.random() * 600, rot = Math.random() * Math.PI * 0.2, h = 200 + Math.random() * 160;
                    dp(cx, cy, function (x, y) {
                        ctx.translate(x, y); ctx.rotate(rot); ctx.scale(rx / 1000, ry / 600);
                        var g = ctx.createRadialGradient(0, 0, 0, 0, 0, 500);
                        g.addColorStop(0, 'hsla(' + h + ',60%,50%,0.03)');
                        g.addColorStop(0.3, 'hsla(' + h + ',55%,45%,0.02)');
                        g.addColorStop(0.6, 'hsla(' + h + ',50%,40%,0.008)');
                        g.addColorStop(1, 'transparent');
                        ctx.fillStyle = g; ctx.fillRect(-500, -500, 1000, 1000);
                    });
                }

                // 银河彩虹泛光层（与项目一致：200步 + 每步80颗子星星）
                var continuousSteps = 200;
                var coreCyMin = H * 0.40, coreCyMax = H * 0.60;
                for (var i = 0; i < continuousSteps; i++) {
                    var cx = (i / continuousSteps) * W, cy = coreCyMin + Math.random() * (coreCyMax - coreCyMin);
                    var rx = 2800 + Math.random() * 2200, ry = 350 + Math.random() * 650, rot = Math.random() * Math.PI * 0.12;
                    var angle = (cx / W) * Math.PI * 2, h = (angle * 180 / Math.PI + i * 2) % 360;
                    dp(cx, cy, function (x, y) {
                        ctx.translate(x, y); ctx.rotate(rot); ctx.scale(rx / 800, ry / 400);
                        var g = ctx.createRadialGradient(0, 0, 0, 0, 0, 400);
                        g.addColorStop(0, 'hsla(' + h + ',85%,60%,0.008)');
                        g.addColorStop(0.2, 'hsla(' + h + ',80%,55%,0.006)');
                        g.addColorStop(0.45, 'hsla(' + h + ',75%,50%,0.0025)');
                        g.addColorStop(0.75, 'hsla(' + h + ',70%,45%,0.0006)');
                        g.addColorStop(1, 'transparent');
                        ctx.fillStyle = g; ctx.fillRect(-400, -400, 800, 800);
                    });
                    // 彩虹带子星星（每步40颗）
                    for (var j = 0; j < 40; j++) {
                        var ox = (Math.random() - 0.5) * rx * 0.4, oy = (Math.random() - 0.5) * ry * 0.6;
                        var cr = 140 + Math.random() * 280;
                        dp(cx + ox, cy + oy, function (x, y) {
                            ctx.translate(x, y); ctx.scale(cr / 200, cr / 200);
                            var g = ctx.createRadialGradient(0, 0, 0, 0, 0, 200);
                            g.addColorStop(0, 'hsla(' + h + ',80%,60%,0.006)');
                            g.addColorStop(0.35, 'hsla(' + h + ',75%,55%,0.003)');
                            g.addColorStop(0.7, 'hsla(' + h + ',70%,50%,0.0008)');
                            g.addColorStop(1, 'transparent');
                            ctx.fillStyle = g; ctx.fillRect(-100, -100, 200, 200);
                        });
                    }
                }

                // 银河大型柔软扩散光晕
                for (var i = 0; i < 20; i++) {
                    var cx = Math.random() * W, cy = H * 0.40 + Math.random() * H * 0.20;
                    var rx = 2500 + Math.random() * 2500, ry = 400 + Math.random() * 600, rot = Math.random() * Math.PI * 0.1, h = 200 + Math.random() * 140;
                    dp(cx, cy, function (x, y) {
                        ctx.translate(x, y); ctx.rotate(rot); ctx.scale(rx / 1200, ry / 600);
                        var g = ctx.createRadialGradient(0, 0, 0, 0, 0, 500);
                        g.addColorStop(0, 'hsla(' + h + ',80%,60%,0.01)');
                        g.addColorStop(0.4, 'hsla(' + h + ',70%,50%,0.004)');
                        g.addColorStop(0.8, 'hsla(' + h + ',60%,40%,0.0005)');
                        g.addColorStop(1, 'transparent');
                        ctx.fillStyle = g; ctx.fillRect(-500, -500, 1000, 1000);
                    });
                }

                // 上下边缘零星泛光
                var scatterCount = 50;
                for (var i = 0; i < scatterCount; i++) {
                    var cx = Math.random() * W;
                    var cy = (Math.random() < 0.5) ? H * 0.15 + Math.random() * H * 0.12 : H * 0.73 + Math.random() * H * 0.12;
                    var rx = 800 + Math.random() * 1500, ry = 120 + Math.random() * 180, rot = Math.random() * Math.PI * 0.15;
                    var angle = (cx / W) * Math.PI * 2, h = (angle * 180 / Math.PI + i * 8) % 360;
                    dp(cx, cy, function (x, y) {
                        ctx.translate(x, y); ctx.rotate(rot); ctx.scale(rx / 700, ry / 350);
                        var g = ctx.createRadialGradient(0, 0, 0, 0, 0, 300);
                        g.addColorStop(0, 'hsla(' + h + ',85%,60%,0.06)');
                        g.addColorStop(0.25, 'hsla(' + h + ',80%,55%,0.04)');
                        g.addColorStop(0.55, 'hsla(' + h + ',75%,50%,0.015)');
                        g.addColorStop(0.8, 'hsla(' + h + ',70%,45%,0.003)');
                        g.addColorStop(1, 'transparent');
                        ctx.fillStyle = g; ctx.fillRect(-300, -300, 600, 600);
                    });
                    for (var j = 0; j < 4; j++) {
                        var offX = (Math.random() - 0.5) * rx * 0.4, offY = (Math.random() - 0.5) * ry * 0.5, cr = 100 + Math.random() * 220;
                        dp(cx + offX, cy + offY, function (x, y) {
                            ctx.translate(x, y); ctx.scale(cr / 300, cr / 300);
                            var g = ctx.createRadialGradient(0, 0, 0, 0, 0, 150);
                            g.addColorStop(0, 'hsla(' + h + ',80%,60%,0.04)');
                            g.addColorStop(0.4, 'hsla(' + h + ',75%,55%,0.02)');
                            g.addColorStop(0.75, 'hsla(' + h + ',70%,50%,0.003)');
                            g.addColorStop(1, 'transparent');
                            ctx.fillStyle = g; ctx.fillRect(-150, -150, 300, 300);
                        });
                    }
                }

                // 银河密集星星带
                var gcy = H * 0.47, ghw = H * 0.25;
                for (var i = 0; i < 60000; i++) {
                    var cx = Math.random() * W, y = gcy + (Math.random() - 0.5) * ghw * 2;
                    if (y < 0 || y > H) continue;
                    var dfc = Math.abs(y - gcy) / ghw, ef = Math.max(0, 1 - dfc * 1.3), alpha = (Math.random() * 0.4 + 0.1) * ef;
                    if (alpha < 0.02) continue;
                    var h = (cx / W) * 360;
                    dp(cx, y, function (x, y) {
                        ctx.beginPath(); ctx.arc(x, y, Math.random() * 2 + 0.3, 0, Math.PI * 2);
                        ctx.fillStyle = 'hsla(' + h + ',85%,' + (170 + Math.random() * 25).toFixed(0) + '%,' + alpha.toFixed(3) + ')';
                        ctx.fill();
                    });
                }

                // 3.5d 更密集、颜色鲜艳的中心亮星
                var brightCoreY = H * 0.52, brightHalfHeight = H * 0.08;
                for (var i = 0; i < 60000; i++) {
                    var cx = Math.random() * W, y = brightCoreY + (Math.random() - 0.5) * brightHalfHeight * 2;
                    if (y < 0 || y > H) continue;
                    var dfc = Math.abs(y - brightCoreY) / brightHalfHeight, cf = Math.max(0, 1 - dfc * 1.4);
                    var alpha = (Math.random() * 0.8 + 0.2) * cf;
                    if (alpha < 0.15) continue;
                    var h = Math.random() * 360;
                    dp(cx, y, function (x, y) {
                        ctx.beginPath(); ctx.arc(x, y, Math.random() * 2 + 0.6, 0, Math.PI * 2);
                        ctx.fillStyle = 'hsla(' + h + ',' + (70 + Math.random() * 30).toFixed(0) + '%,' + (50 + Math.random() * 30).toFixed(0) + '%,' + alpha.toFixed(3) + ')';
                        ctx.fill();
                    });
                }

                // 散布亮星
                for (var i = 0; i < 4000; i++) {
                    var cx = Math.random() * W, cy = Math.random() * H, h = Math.random() * 360;
                    dp(cx, cy, function (x, y) {
                        ctx.beginPath(); ctx.arc(x, y, Math.random() * 1.5 + 0.5, 0, Math.PI * 2);
                        ctx.fillStyle = 'hsla(' + h + ',' + (20 + Math.random() * 40).toFixed(0) + '%,' + (65 + Math.random() * 25).toFixed(0) + '%,' + (Math.random() * 0.9 + 0.1).toFixed(2) + ')';
                        ctx.fill();
                    });
                }

                // 暗星背景
                for (var i = 0; i < 8000; i++) {
                    var cx = Math.random() * W, cy = Math.random() * H;
                    dp(cx, cy, function (x, y) {
                        ctx.beginPath(); ctx.arc(x, y, Math.random() + 0.2, 0, Math.PI * 2);
                        ctx.fillStyle = 'rgba(200,220,255,' + (Math.random() * 0.2 + 0.05).toFixed(2) + ')'; ctx.fill();
                    });
                }

                // 暗星背景
                for (var i = 0; i < 8000; i++) {
                    var cx = Math.random() * W, cy = Math.random() * H;
                    dp(cx, cy, function (x, y) {
                        ctx.beginPath(); ctx.arc(x, y, Math.random() + 0.2, 0, Math.PI * 2);
                        ctx.fillStyle = 'rgba(200,220,255,' + (Math.random() * 0.2 + 0.05).toFixed(2) + ')'; ctx.fill();
                    });
                }

                var tex = new THREE.CanvasTexture(c);
                tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
                return tex;
            }

            // ──────────────────────────────────────
            //  模块7: 场景初始化
            // ──────────────────────────────────────
            function createRadialStarField(count, rx, ry, rz, size, colorFn, center, falloff, glowTex) {
                count = Math.floor(count * _particleScale);  // 低端设备粒子降级
                center = center || new THREE.Vector3(0, 0, 0); falloff = falloff || 120;
                var g = new THREE.BufferGeometry(), p = [], c = [], tmp = new THREE.Vector3();
                for (var i = 0; i < count; i++) {
                    var x = (Math.random() - 0.5) * rx, y = (Math.random() - 0.5) * ry, z = (Math.random() - 0.5) * rz;
                    p.push(x, y, z); tmp.set(x, y, z);
                    var br = Math.max(0, 1 - center.distanceTo(tmp) / falloff), col = colorFn();
                    c.push(col.r * br, col.g * br, col.b * br);
                }
                g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(p), 3));
                g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(c), 3));
                var mat = new THREE.PointsMaterial({ size: size, map: glowTex, vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
                return new THREE.Points(g, mat);
            }

            // ──────────────────────────────────────
            //  行星节点 + 相机飞入 + 拖拽 → 已抽离至 planet-camera.js
            //  函数: createEnergyLine, createRadialGlowTexture, createMeteor,
            //        createPlanet, syncSphericalFromCamera, projectToScreen, updateLabels
            // ──────────────────────────────────────

            function initScene() {
                renderer = new THREE.WebGLRenderer({
                    canvas: canvas,
                    antialias: true,
                    alpha: false,
                    powerPreference: 'high-performance',
                    stencil: false,
                    depth: true
                });
                renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
                renderer.outputColorSpace = THREE.SRGBColorSpace;
                renderer.toneMapping = THREE.ACESFilmicToneMapping;
                renderer.toneMappingExposure = 1.0;

                // GPU 崩溃恢复：检测 webglcontextlost，延迟重建 renderer
                canvas.addEventListener('webglcontextlost', function (e) {
                    e.preventDefault();
                    console.warn('[AstroKnot BG] WebGL 上下文丢失，3秒后尝试恢复…');
                    bgAnimationRunning = false;
                    setTimeout(function () {
                        try { initScene(); console.log('[AstroKnot BG] WebGL 上下文已恢复'); } catch (err) { console.error('[AstroKnot BG] 恢复失败:', err); }
                    }, 3000);
                });

                onResize();

                scene = new THREE.Scene();
                scene.fog = new THREE.FogExp2(0x030314, 0.004);

                camera = new THREE.PerspectiveCamera(40, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
                camera.position.set(0, 1, 8);
                camera.lookAt(0, 0, 0);

                var glowTex = createGlowTexture();
                var panoramaTex = createPanoramaTexture();

                // 天空球
                var skyGeo = new THREE.SphereGeometry(500, 64, 32);
                var skyMat = new THREE.ShaderMaterial({
                    uniforms: {
                        textureMap: { value: panoramaTex }, transitionProgress: { value: 1 },
                        hueShift: { value: 0 }, brightness: { value: 1 }, saturation: { value: 1 }
                    },
                    vertexShader: [
                        'varying vec2 vUv;varying float vDistanceToPole;varying vec3 vNormal;',
                        'void main(){vUv=uv;vNormal=normalize(normalMatrix*normal);',
                        'vec3 pd=normalize(vec3(0.,1.,0.));vDistanceToPole=acos(dot(vNormal,pd))/3.1415926;',
                        'gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}'
                    ].join('\n'),
                    fragmentShader: [
                        'uniform sampler2D textureMap;uniform float transitionProgress;',
                        'uniform float hueShift,brightness,saturation;',
                        'varying vec2 vUv;varying float vDistanceToPole;',
                        'vec3 hueShiftFn(vec3 col,float h){float a=h*6.2831853;float s=sin(a),c=cos(a);return vec3(',
                        '(0.299+0.701*c+0.168*s)*col.r+(0.587-0.587*c+0.330*s)*col.g+(0.114-0.114*c-0.497*s)*col.b,',
                        '(0.299-0.299*c-0.328*s)*col.r+(0.587+0.413*c+0.035*s)*col.g+(0.114-0.114*c+0.292*s)*col.b,',
                        '(0.299-0.3*c+1.25*s)*col.r+(0.587-0.588*c-1.05*s)*col.g+(0.114+0.886*c-0.203*s)*col.b);}',
                        'vec3 satFn(vec3 col,float s){float g=dot(col,vec3(0.299,0.587,0.114));return mix(vec3(g),col,s);}',
                        'void main(){vec4 tc=texture2D(textureMap,vUv);vec3 col=hueShiftFn(tc.rgb,hueShift);',
                        'col=satFn(col,saturation);col*=brightness;',
                        // 非银河区域压暗：银河带在赤道附近(vDistanceToPole≈0.4~0.6)
                        // 极区和高纬区域大幅压暗
                        'float mwCenter=0.5,mwHalf=0.18;',
                        'float mwDist=abs(vDistanceToPole-mwCenter);',
                        'float mwMask=1.0-smoothstep(0.0,mwHalf,mwDist);',
                        // 银河带内保持原亮度，带外压暗到15%
                        'float darkFactor=mix(0.15,1.0,mwMask);',
                        'col*=darkFactor;',
                        // 抗摩尔纹：基于像素位置的微噪点抖动
                        'float dither=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453);',
                        'col+=((dither-0.5)*0.015);',
                        'gl_FragColor=vec4(col,1.);}'
                    ].join('\n'),
                    side: THREE.BackSide, depthWrite: false, depthTest: true
                });
                skySphere = new THREE.Mesh(skyGeo, skyMat);
                skySphere.renderOrder = -1; scene.add(skySphere);

                // 星空粒子群（与 module7 一致）
                var v0 = new THREE.Vector3(0, 0, 0);
                var stars1 = createRadialStarField(4000, 300, 200, 120, 0.18, function () { return new THREE.Color().setRGB(0.8 + Math.random() * 0.2, 0.8 + Math.random() * 0.2, 0.9 + Math.random() * 0.1); }, v0, 150, glowTex);
                var stars2 = createRadialStarField(2500, 250, 180, 100, 0.25, function () { return new THREE.Color().setHSL(0.55 + Math.random() * 0.3, 0.8, 0.7); }, v0, 140, glowTex);
                var stars3 = createRadialStarField(1200, 220, 150, 80, 0.35, function () { return new THREE.Color().setHSL(0.1 + Math.random() * 0.2, 1.0, 0.7); }, v0, 130, glowTex);
                var nebula1 = createRadialStarField(1500, 200, 150, 100, 0.45, function () { return new THREE.Color().setHSL(0.5 + Math.random() * 0.5, 1.0, 0.5); }, v0, 140, glowTex);
                var nebula2 = createRadialStarField(800, 280, 180, 130, 0.6, function () { return new THREE.Color().setHSL(Math.random(), 1.0, 0.6); }, v0, 160, glowTex);
                var galaxy1 = createRadialStarField(3000, 100, 60, 60, 0.35, function () { return new THREE.Color().setHSL(0.55 + Math.random() * 0.3, 1.0, 0.5 + Math.random() * 0.3); }, new THREE.Vector3(0, -15, 0), 80, glowTex);
                var galaxy2 = createRadialStarField(2000, 120, 70, 70, 0.5, function () { return new THREE.Color().setHSL(0.6 + Math.random() * 0.2, 1.0, 0.6); }, new THREE.Vector3(0, -20, 0), 100, glowTex);

                scene.add(stars1); scene.add(stars2); scene.add(stars3);
                scene.add(nebula1); scene.add(nebula2);
                scene.add(galaxy1); scene.add(galaxy2);

                // 尘埃场
                var dc = Math.floor(1000 * _particleScale), dg = new THREE.BufferGeometry(), dp = [], dc2 = [];
                for (var i = 0; i < dc; i++) {
                    var t = Math.random() * Math.PI * 2, p = Math.acos(2 * Math.random() - 1), r = 15 + Math.random() * 60;
                    dp.push(Math.sin(p) * Math.cos(t) * r, Math.sin(p) * Math.sin(t) * r * 0.6, Math.cos(p) * r);
                    var c = new THREE.Color().setHSL(Math.random(), 0.9, 0.7 + Math.random() * 0.3);
                    dc2.push(c.r, c.g, c.b);
                }
                dg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(dp), 3));
                dg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(dc2), 3));
                var dm = new THREE.PointsMaterial({ size: 0.12, map: glowTex, vertexColors: true, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true });
                var dustField = new THREE.Points(dg, dm); scene.add(dustField);

                // 彩虹场
                var rc = Math.floor(600 * _particleScale), rg = new THREE.BufferGeometry(), rp = [], rc2 = [];
                for (var i = 0; i < rc; i++) {
                    var t = Math.random() * Math.PI * 2, p = Math.acos(2 * Math.random() - 1), r = 80 + Math.random() * 100;
                    rp.push(Math.sin(p) * Math.cos(t) * r, Math.sin(p) * Math.sin(t) * r * 0.5, Math.cos(p) * r);
                    var c = new THREE.Color().setHSL(Math.random(), 1.0, 0.6); rc2.push(c.r, c.g, c.b);
                }
                rg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(rp), 3));
                rg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(rc2), 3));
                var rm = new THREE.PointsMaterial({ size: 0.25, map: glowTex, vertexColors: true, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true });
                var rainbowField = new THREE.Points(rg, rm); scene.add(rainbowField);

                // 闪烁星空（精简版）
                var tc = Math.floor(15000 * _particleScale), tg = new THREE.BufferGeometry(), tp = [], tco = [];
                for (var i = 0; i < tc; i++) {
                    var th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1), r = 40 + Math.random() * 150;
                    tp.push(Math.sin(ph) * Math.cos(th) * r, Math.sin(ph) * Math.sin(th) * r * 0.7, Math.cos(ph) * r);
                    var hu = Math.random() < 0.7 ? 0 : Math.random() < 0.5 ? 210 : 50;
                    var co = new THREE.Color().setHSL(hu, 0.3, 0.8 + Math.random() * 0.2);
                    tco.push(co.r, co.g, co.b);
                }
                tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tp), 3));
                tg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(tco), 3));
                var tm2 = new THREE.PointsMaterial({ size: 0.2, map: glowTex, vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, transparent: true, opacity: 0.75 });
                var twinkleField = new THREE.Points(tg, tm2); scene.add(twinkleField);

                // 流动场
                var fc = Math.floor(300 * _particleScale), fg = new THREE.BufferGeometry(), fp = [], fc3 = [];
                for (var i = 0; i < fc; i++) {
                    var a = Math.random() * Math.PI * 2, r = 50 + Math.random() * 70;
                    fp.push(Math.cos(a) * r, (Math.random() - 0.5) * 30 - 10, Math.sin(a) * r);
                    var co = new THREE.Color().setHSL(Math.random(), 1.0, 0.7); fc3.push(co.r, co.g, co.b);
                }
                fg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(fp), 3));
                fg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(fc3), 3));
                var fm = new THREE.PointsMaterial({ size: 0.6, map: glowTex, vertexColors: true, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
                flowField = new THREE.Points(fg, fm); scene.add(flowField);

                // 注册到动画组
                starGroups.push(
                    { points: twinkleField, baseOpacity: 0.75, phase: Math.random() * Math.PI * 2, speed: 1.5 },
                    { points: dustField, baseOpacity: 0.7, phase: 0.8, speed: 0.6 },
                    { points: rainbowField, baseOpacity: 0.5, phase: 1.5, speed: 0.4 },
                    { points: stars1, baseOpacity: 0.9, phase: 0, speed: 1.2 },
                    { points: stars2, baseOpacity: 0.9, phase: 0.5, speed: 1.5 },
                    { points: stars3, baseOpacity: 0.9, phase: 1.0, speed: 1.8 },
                    { points: flowField, baseOpacity: 0.35, phase: 0.3, speed: 2.0 },
                    { points: nebula1, baseOpacity: 0.3, phase: 2.0, speed: 0.8 },
                    { points: nebula2, baseOpacity: 0.25, phase: 2.5, speed: 0.9 },
                    { points: galaxy1, baseOpacity: 0.4, phase: 1.2, speed: 0.7 },
                    { points: galaxy2, baseOpacity: 0.35, phase: 1.8, speed: 0.6 }
                );
                nebulaFlowGroups.push(twinkleField, rainbowField, nebula1, nebula2, galaxy1, galaxy2);

                // 灯光
                scene.add(new THREE.AmbientLight(0x111a22));
                var dl = new THREE.DirectionalLight(0xccddff, 0.7); dl.position.set(1, 2, 1); scene.add(dl);
                var bl = new THREE.PointLight(0x33aacc, 0.6); bl.position.set(0, 0.5, -2.8); scene.add(bl);
                var pl1 = new THREE.PointLight(0xff44aa, 0.5); pl1.position.set(2, 3, 2); scene.add(pl1);
                var pl2 = new THREE.PointLight(0x44ffaa, 0.4); pl2.position.set(-2, 1.5, 3); scene.add(pl2);

                // ── 地球模型（NASA Blue Marble 纹理）──
                // 刚离开地球的视角：地球在左下占1/3屏幕
                earthGroup = new THREE.Object3D();
                earthGroup.position.set(-3.5, -3, -2);
                var earthGeo = new THREE.SphereGeometry(5, 64, 32);
                var earthTex = new THREE.TextureLoader().load(
                    'assets/earth-blue-marble.jpg'
                );
                var bumpTex = new THREE.TextureLoader().load(
                    'assets/earth-topology.png'
                );
                earthMat = new THREE.MeshStandardMaterial({
                    map: earthTex,
                    bumpMap: bumpTex,
                    bumpScale: 0.15,
                    metalness: 0.1,
                    roughness: 0.8
                });
                var earth = new THREE.Mesh(earthGeo, earthMat);
                earth.rotation.z = 23.43 * Math.PI / 180;  // 地轴倾斜
                earthGroup.add(earth);

                // 大气层辉光（外发光 + 内层薄雾）
                var atmosGeo = new THREE.SphereGeometry(5.25, 64, 32);
                var atmosMat = new THREE.MeshBasicMaterial({
                    color: 0x4488ff,
                    transparent: true, opacity: 0.08,
                    side: THREE.BackSide
                });
                earthGroup.add(new THREE.Mesh(atmosGeo, atmosMat));
                // 更外层淡辉光
                var outerAtmosGeo = new THREE.SphereGeometry(5.6, 64, 32);
                var outerAtmosMat = new THREE.MeshBasicMaterial({
                    color: 0x3366cc,
                    transparent: true, opacity: 0.04,
                    side: THREE.BackSide
                });
                earthGroup.add(new THREE.Mesh(outerAtmosGeo, outerAtmosMat));

                scene.add(earthGroup);

                // ── 太阳（模拟地日距离，艺术化缩放）──
                // 真实比例无法呈现（日地距离是地球半径的23500倍），
                // 这里用艺术化距离：远到能照亮地球半面，近到肉眼可见
                var sunGroup = new THREE.Object3D();
                sunGroup.position.set(40, 25, -30);

                // 太阳球体（自发光）
                var sunGeo = new THREE.SphereGeometry(4, 32, 32);
                var sunMat = new THREE.MeshBasicMaterial({
                    color: 0xfff4e0
                });
                sunGroup.add(new THREE.Mesh(sunGeo, sunMat));

                // 太阳内层辉光
                var sunGlow1 = new THREE.Sprite(new THREE.SpriteMaterial({
                    map: glowTex, color: 0xffcc44,
                    transparent: true, opacity: 0.6,
                    blending: THREE.AdditiveBlending, depthWrite: false
                }));
                sunGlow1.scale.set(20, 20, 1);
                sunGroup.add(sunGlow1);

                // 太阳外层辉光
                var sunGlow2 = new THREE.Sprite(new THREE.SpriteMaterial({
                    map: glowTex, color: 0xff8800,
                    transparent: true, opacity: 0.2,
                    blending: THREE.AdditiveBlending, depthWrite: false
                }));
                sunGlow2.scale.set(40, 40, 1);
                sunGroup.add(sunGlow2);

                scene.add(sunGroup);

                // 太阳光照（从太阳方向照射地球，产生明暗面）
                var sunLight = new THREE.DirectionalLight(0xfff0dd, 2.0);
                sunLight.position.copy(sunGroup.position);
                scene.add(sunLight);

                // ── 行星+相机系统（已抽离至 planet-camera.js，暂时禁用）──
                // planetCamera = new PlanetCameraSystem({
                //     three: THREE,
                //     scene: scene,
                //     camera: camera,
                //     glowTex: glowTex,
                //     particleScale: _particleScale,
                //     canvas: canvas
                // });
                // planetCamera.init();

                // ── 固定视角 + 滚动微调 ──
                // 默认：相机 (0, 1, 8) 看向 (0, 0, 0)，地球占左下
                // 滚动到「创意介绍」时：视角大幅朝太阳方向旋转，太阳出现在右上
                _defaultCamPos = new THREE.Vector3(0, 1, 8);
                _defaultLookAt = new THREE.Vector3(0, 0, 0);
                // 太阳在 (40, 25, -30)，只微微右转上仰，地球仍占屏幕一半
                _introCamPos = new THREE.Vector3(0, 1, 8);
                _introLookAt = new THREE.Vector3(2, 1.5, -1);
                // 核心功能：逼近地球，地球填满屏幕，场景变暗
                _featuresCamPos = new THREE.Vector3(-2.8, -1.5, 3);
                _featuresLookAt = new THREE.Vector3(-3.5, -3, -2);
                _camLerpFactor = 0;
                _camTargetFactor = 0;
                _featuresTargetFactor = 0;
                _activeSection = 'default';

                // 统一 section 观察器：优先级 features > intro > default
                function _updateActiveSection() {
                    if (_featuresTargetFactor > 0.5) {
                        _activeSection = 'features';
                    } else if (_camTargetFactor > 0.5) {
                        _activeSection = 'intro';
                    } else {
                        _activeSection = 'default';
                    }
                }

                var _introObserver = new IntersectionObserver(function (entries) {
                    entries.forEach(function (entry) {
                        _camTargetFactor = entry.intersectionRatio > 0.2 ? 1 : 0;
                        _updateActiveSection();
                    });
                }, { threshold: [0, 0.1, 0.2, 0.3, 0.5] });
                var _introSection = document.getElementById('intro');
                if (_introSection) _introObserver.observe(_introSection);

                var _featuresObserver = new IntersectionObserver(function (entries) {
                    entries.forEach(function (entry) {
                        _featuresTargetFactor = entry.intersectionRatio > 0.15 ? 1 : 0;
                        _updateActiveSection();
                    });
                }, { threshold: [0, 0.1, 0.15, 0.2, 0.3, 0.5] });
                var _featuresSection = document.getElementById('features');
                if (_featuresSection) _featuresObserver.observe(_featuresSection);

                // ── 目标用户卡片：滚动到时从右向左弹出 ──
                var _userCards = document.querySelectorAll('.user-card');
                if (_userCards.length) {
                    var _userObserver = new IntersectionObserver(function (entries) {
                        entries.forEach(function (entry) {
                            if (entry.intersectionRatio > 0.15) {
                                entry.target.classList.add('visible');
                            } else if (entry.intersectionRatio < 0.05) {
                                entry.target.classList.remove('visible');
                            }
                        });
                    }, { threshold: [0, 0.05, 0.1, 0.15, 0.2, 0.3] });
                    _userCards.forEach(function (card) { _userObserver.observe(card); });
                }

                console.log('[AstroKnot BG] 3D场景初始化完成 — ' + starGroups.length + '个动画组, ' + nebulaFlowGroups.length + '个色相偏移组' + (_isLowEnd ? ' (低端设备降级)' : ''));
                bgAnimationRunning = true;
                animate();
            }

            // ──────────────────────────────────────
            //  模块14: 动画循环（含性能优化）
            //  - 页面隐藏时彻底停止 rAF，恢复时重启
            //  - 视锥距离 LOD：相机远时简化闪烁计算（与 module14 一致）
            // ──────────────────────────────────────
            function animate() {
                // 场景未初始化完成（camera/renderer/scene 尚未赋值）时安全退出，
                // 避免 visibilitychange / _resumeStarfield 等重启入口在 initScene 完成前触发崩溃
                if (!camera || !renderer || !scene) {
                    bgAnimationRunning = false;
                    return;
                }
                if (document.hidden || window._cityActive) {
                    // 页面不可见，或城市场景激活时（避免双重型 3D 场景同帧运行）停止动画循环
                    bgAnimationRunning = false;
                    return;
                }
                bgAnimationRunning = true;
                requestAnimationFrame(animate);
                tm += 0.016;

                // 视锥距离 LOD：相机远离时降低粒子动画精度（与 module14 一致）
                var camDist = camera.position.length();
                var enableDetailedParticles = camDist < 40;

                // 天空球旋转 + 色相偏移
                if (skySphere) {
                    skySphere.rotation.y += 0.00015; skySphere.rotation.x += 0.00003; skySphere.rotation.z += 0.00001;
                    if (skySphere.material.uniforms.hueShift)
                        skySphere.material.uniforms.hueShift.value = (tm * 0.015) % 1;
                }

                // 粒子闪烁（与 module14 算法一致，含视锥距离 LOD）
                for (var i = 0; i < starGroups.length; i++) {
                    var g = starGroups[i];
                    if (!g.points || !g.points.visible) continue;
                    var baseOp = g.baseOpacity * (0.85 + 0.15 * Math.sin(tm * g.speed + g.phase));
                    // 相机远时使用简化的闪烁计算（少 90% 三角函数），无法察觉差异
                    var flicker = enableDetailedParticles
                        ? 0.55 + 0.45 * (
                            Math.sin(tm * 0.05 + g.phase * 10) * 0.35 +
                            Math.cos(tm * 0.07 + g.phase * 7) * 0.25 +
                            Math.sin(tm * 0.01 + g.phase * 13) * 0.35 +
                            Math.cos(tm * 1.0 + g.phase * 17) * 0.15 +
                            Math.sin(tm * 1.5 + g.phase * 21) * 0.15 +
                            Math.sin(tm * 2.8 + g.phase * 5) * Math.cos(tm * 9.7 + g.phase * 11) * 0.20
                        )
                        : 0.7 + 0.3 * Math.sin(tm * g.speed * 0.5 + g.phase);
                    var op = Math.max(0.03, Math.min(1, baseOp * flicker));
                    if (g.points.material.opacity !== undefined) g.points.material.opacity = op;
                }

                // 色相偏移（相机远时跳过，颜色不变而已，看不出来）
                if (enableDetailedParticles) {
                    var hueShiftVal = tm * 0.015;
                    for (var i = 0; i < nebulaFlowGroups.length; i++) {
                        var n = nebulaFlowGroups[i];
                        if (n && n.material && n.material.uniforms && n.material.uniforms.uHueShift)
                            n.material.uniforms.uHueShift.value = hueShiftVal;
                    }
                }

                // 流动场动画
                if (flowField) {
                    flowField.material.color.setHSL((tm * 0.03) % 1, 0.8, 0.6);
                    flowField.rotation.y += 0.003; flowField.rotation.x += 0.001;
                    flowField.position.y = Math.sin(tm * 0.4) * 2.5;
                    flowField.scale.setScalar(1 + 0.04 * Math.sin(tm * 0.25));
                }

                // 银河旋转
                if (starGroups[9] && starGroups[9].points) starGroups[9].points.rotation.y += 0.002;
                if (starGroups[10] && starGroups[10].points) starGroups[10].points.rotation.y -= 0.0018;
                if (nebulaFlowGroups[2]) nebulaFlowGroups[2].rotation.y += 0.0008;
                if (nebulaFlowGroups[3]) nebulaFlowGroups[3].rotation.x += 0.0006;

                // 地球自转（核心功能 section 时停止）
                if (earthGroup && _activeSection !== 'features') {
                    earthGroup.rotation.y += 0.001;
                }

                // 相机滚动平滑旋转（三段：default / intro / features）
                if (_defaultCamPos && _introCamPos && _featuresCamPos) {
                    _camLerpFactor += (_camTargetFactor - _camLerpFactor) * 0.025;
                    _featuresLerpState += (_featuresTargetFactor - _featuresLerpState) * 0.025;
                    if (_camLerpFactor < 0.001) _camLerpFactor = 0;
                    if (_featuresLerpState < 0.001) _featuresLerpState = 0;

                    // 根据活跃 section 选择目标
                    var _targetPos, _targetLookAt;
                    if (_activeSection === 'features') {
                        _targetPos = _featuresCamPos;
                        _targetLookAt = _featuresLookAt;
                    } else if (_activeSection === 'intro') {
                        _targetPos = _introCamPos;
                        _targetLookAt = _introLookAt;
                    } else {
                        _targetPos = _defaultCamPos;
                        _targetLookAt = _defaultLookAt;
                    }

                    // 每帧 lerp 向目标（复用临时 Vector3）
                    camera.position.lerp(_targetPos, 0.025);
                    camera.getWorldDirection(_worldDirTmpVec).multiplyScalar(10).add(camera.position);
                    _lookAtTmpVec.copy(_worldDirTmpVec);
                    _lookAtTmpVec.lerp(_targetLookAt, 0.025);
                    camera.lookAt(_lookAtTmpVec);
                }

                // 地球变暗：核心功能 section 时压暗地球
                if (earthMat) {
                    var _targetEmissiveIntensity = _activeSection === 'features' ? 0.0 : 0.0;
                    // 通过降低粗糙度+增加金属感来模拟暗面，实际用emissive控制
                    var _targetDarken = _activeSection === 'features' ? 0.15 : 1.0;
                    if (!earthMat._darken) earthMat._darken = 1.0;
                    earthMat._darken += (_targetDarken - earthMat._darken) * 0.03;
                    earthMat.color.setRGB(earthMat._darken, earthMat._darken, earthMat._darken);
                    earthMat.emissive.setRGB(
                        _activeSection === 'features' ? 0.02 : 0.0,
                        _activeSection === 'features' ? 0.04 : 0.0,
                        _activeSection === 'features' ? 0.08 : 0.0
                    );
                    earthMat.emissiveIntensity = _activeSection === 'features' ? 0.5 : 0.0;
                }

                // ── 行星+相机系统更新（已抽离至 planet-camera.js，暂时禁用）──
                // if (planetCamera) planetCamera.update(tm);

                renderer.render(scene, camera);
            }

            // 页面可见性变化：隐藏时停止 rAF，可见时重启
            document.addEventListener('visibilitychange', function () {
                if (!document.hidden && !bgAnimationRunning) {
                    bgAnimationRunning = true;
                    requestAnimationFrame(animate);
                }
            });

            // 城市场景退出时恢复星空动画（由城市模块在 #value 离开时调用）
            window._resumeStarfield = function () {
                if (!document.hidden && !bgAnimationRunning && !window._cityActive) {
                    bgAnimationRunning = true;
                    requestAnimationFrame(animate);
                }
            };

            // 城市重新激活时暂停星空
            window._pauseStarfield = function () {
                bgAnimationRunning = false;
            };

            // 城市向上退出时：星空直接处于「核心功能」稳定状态（地球近景）
            // 城市层渐隐时，星空已是逼近地球后的稳定画面，不播放逼近动画
            window._resumeStarfieldAtFeatures = function () {
                if (!document.hidden && !bgAnimationRunning) {
                    if (_featuresCamPos && _featuresLookAt && camera) {
                        // 直接定位到核心功能的稳定相机位置（地球近景）
                        camera.position.copy(_featuresCamPos);
                        camera.lookAt(_featuresLookAt);
                    }
                    // 直接设为 features 稳定状态（lerp 已完成，不再移动）
                    _camLerpFactor = 0;
                    _camTargetFactor = 0;
                    _featuresTargetFactor = 1;
                    _featuresLerpState = 1;  // 已在 features 位置，无需 lerp
                    _activeSection = 'features';
                    bgAnimationRunning = true;
                    requestAnimationFrame(animate);
                }
            };

            function onResize() {
                var w = window.innerWidth, h = window.innerHeight;
                if (renderer) renderer.setSize(w, h, false);
                if (camera) { camera.aspect = w / h; camera.updateProjectionMatrix(); }
            }

            window.addEventListener('resize', onResize);
            if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initScene);
            else initScene();
        })();
