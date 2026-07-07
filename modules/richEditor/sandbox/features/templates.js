// ============================================================
//  sandbox-templates.js — 代码片段模板库
//  提供常用前端项目模板，从模板创建新文件/目录结构
// ============================================================

export const SANDBOX_TEMPLATES = [
  {
    id: 'blank-html',
    icon: '📄',
    name: '空白 HTML',
    desc: '最小化 HTML5 文档',
    files: [
      { path: 'blank.html', content: '<!DOCTYPE html>\n<html lang="zh">\n<head>\n  <meta charset="UTF-8">\n  <title>Document</title>\n</head>\n<body>\n  \n</body>\n</html>' }
    ]
  },
  {
    id: 'html-css-js',
    icon: '🏗️',
    name: 'HTML + CSS + JS',
    desc: '三件套分离结构',
    files: [
      { path: 'page.html', content: '<!DOCTYPE html>\n<html lang="zh">\n<head>\n  <meta charset="UTF-8">\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <div id="app"></div>\n  <script src="script.js"></script>\n</body>\n</html>' },
      { path: 'style.css', content: 'body { margin: 0; font-family: sans-serif; }\n#app { padding: 20px; }' },
      { path: 'script.js', content: "const app = document.getElementById('app');\napp.innerHTML = '<h1>Hello</h1>';" }
    ]
  },
  {
    id: 'tailwind-cdn',
    icon: '🎨',
    name: 'Tailwind CDN',
    desc: '通过 CDN 引入 Tailwind',
    files: [
      { path: 'tailwind.html', content: '<!DOCTYPE html>\n<html lang="zh">\n<head>\n  <meta charset="UTF-8">\n  <script src="https://cdn.tailwindcss.com"></script>\n</head>\n<body class="bg-gray-100 p-8">\n  <div class="max-w-md mx-auto bg-white rounded-xl shadow-md p-6">\n    <h1 class="text-2xl font-bold text-gray-800">Tailwind App</h1>\n    <button class="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">按钮</button>\n  </div>\n</body>\n</html>' }
    ]
  },
  {
    id: 'threejs-scene',
    icon: '🌐',
    name: 'Three.js 场景',
    desc: '3D 场景基础模板',
    files: [
      { path: 'three-scene.html', content: '<!DOCTYPE html>\n<html lang="zh">\n<head>\n  <meta charset="UTF-8">\n  <style>html,body{margin:0;overflow:hidden}canvas{display:block}</style>\n</head>\n<body>\n  <script src="https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.min.js"></script>\n  <script src="scene.js"></script>\n</body>\n</html>' },
      { path: 'scene.js', content: "const scene = new THREE.Scene();\nconst camera = new THREE.PerspectiveCamera(75, innerWidth/innerHeight, 0.1, 1000);\nconst renderer = new THREE.WebGLRenderer({ antialias: true });\nrenderer.setSize(innerWidth, innerHeight);\ndocument.body.appendChild(renderer.domElement);\n\nconst geo = new THREE.BoxGeometry();\nconst mat = new THREE.MeshBasicMaterial({ color: 0x00ffff });\nconst cube = new THREE.Mesh(geo, mat);\nscene.add(cube);\ncamera.position.z = 5;\n\nfunction animate() {\n  requestAnimationFrame(animate);\n  cube.rotation.x += 0.01;\n  cube.rotation.y += 0.01;\n  renderer.render(scene, camera);\n}\nanimate();\n\naddEventListener('resize', () => {\n  camera.aspect = innerWidth/innerHeight;\n  camera.updateProjectionMatrix();\n  renderer.setSize(innerWidth, innerHeight);\n});" }
    ]
  },
  {
    id: 'react-cdn',
    icon: '⚛️',
    name: 'React CDN',
    desc: 'React + Babel CDN 模板',
    files: [
      { path: 'react.html', content: '<!DOCTYPE html>\n<html lang="zh">\n<head>\n  <meta charset="UTF-8">\n  <script src="https://unpkg.com/react@18/umd/react.development.js"></script>\n  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>\n  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>\n</head>\n<body>\n  <div id="root"></div>\n  <script type="text/babel" src="app.jsx"></script>\n</body>\n</html>' },
      { path: 'app.jsx', content: "const { useState } = React;\n\nfunction App() {\n  const [count, setCount] = useState(0);\n  return (\n    <div style={{ padding: 20, fontFamily: 'sans-serif' }}>\n      <h1>React Counter</h1>\n      <p>Count: {count}</p>\n      <button onClick={() => setCount(c => c + 1)}>+1</button>\n    </div>\n  );\n}\n\nReactDOM.createRoot(document.getElementById('root')).render(<App />);" }
    ]
  },
  {
    id: 'vue-cdn',
    icon: '🟢',
    name: 'Vue 3 CDN',
    desc: 'Vue 3 单文件模板',
    files: [
      { path: 'vue.html', content: '<!DOCTYPE html>\n<html lang="zh">\n<head>\n  <meta charset="UTF-8">\n  <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>\n</head>\n<body>\n  <div id="app">\n    <h1>{{ message }}</h1>\n    <button @click="count++">点击 {{ count }}</button>\n  </div>\n  <script src="app.js"></script>\n</body>\n</html>' },
      { path: 'app.js', content: "const { createApp, ref } = Vue;\ncreateApp({\n  setup() {\n    const message = ref('Hello Vue 3');\n    const count = ref(0);\n    return { message, count };\n  }\n}).mount('#app');" }
    ]
  },
  {
    id: 'canvas-game',
    icon: '🎮',
    name: 'Canvas 游戏',
    desc: 'Canvas 动画/游戏基础',
    files: [
      { path: 'game.html', content: '<!DOCTYPE html>\n<html lang="zh">\n<head>\n  <meta charset="UTF-8">\n  <style>body{margin:0;display:flex;justify-content:center;background:#222}canvas{background:#000}</style>\n</head>\n<body>\n  <canvas id="canvas" width="600" height="400"></canvas>\n  <script src="game.js"></script>\n</body>\n</html>' },
      { path: 'game.js', content: "const canvas = document.getElementById('canvas');\nconst ctx = canvas.getContext('2d');\nlet x = 0, y = 200, dx = 3;\nfunction loop() {\n  ctx.fillStyle = 'rgba(0,0,0,0.1)';\n  ctx.fillRect(0,0,canvas.width,canvas.height);\n  ctx.fillStyle = '#0ff';\n  ctx.beginPath();\n  ctx.arc(x, y, 20, 0, Math.PI*2);\n  ctx.fill();\n  x += dx;\n  if (x > canvas.width-20 || x < 20) dx = -dx;\n  requestAnimationFrame(loop);\n}\nloop();" }
    ]
  },
  {
    id: 'animate-css',
    icon: '✨',
    name: 'CSS 动画',
    desc: '纯 CSS 动画演示',
    files: [
      { path: 'animate.html', content: '<!DOCTYPE html>\n<html lang="zh">\n<head>\n  <meta charset="UTF-8">\n  <link rel="stylesheet" href="animate.css">\n</head>\n<body>\n  <div class="loader">\n    <div class="dot"></div>\n    <div class="dot"></div>\n    <div class="dot"></div>\n  </div>\n</body>\n</html>' },
      { path: 'animate.css', content: 'body { display:flex; justify-content:center; align-items:center; height:100vh; background:#1a1a2e; margin:0; }\n.loader { display:flex; gap:10px; }\n.dot { width:20px; height:20px; border-radius:50%; background:#0ff; animation: bounce 0.6s infinite alternate; }\n.dot:nth-child(2){ animation-delay:0.2s; background:#f0f; }\n.dot:nth-child(3){ animation-delay:0.4s; background:#ff0; }\n@keyframes bounce { to { transform: translateY(-30px); opacity:0.5; } }' }
    ]
  },
  {
    id: 'markdown-viewer',
    icon: '📝',
    name: 'Markdown 预览',
    desc: '带 marked.js 的 MD 预览器',
    files: [
      { path: 'md-viewer.html', content: '<!DOCTYPE html>\n<html lang="zh">\n<head>\n  <meta charset="UTF-8">\n  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>\n  <style>body{max-width:800px;margin:40px auto;padding:0 20px;font-family:sans-serif;line-height:1.6;color:#333}h1,h2{border-bottom:1px solid #eee}code{background:#f4f4f4;padding:2px 6px;border-radius:3px}</style>\n</head>\n<body>\n  <div id="content"></div>\n  <script src="content.js"></script>\n</body>\n</html>' },
      { path: 'content.js', content: "const md = `# Hello Markdown\\n\\n这是一段 **Markdown** 文本。\\n\\n- 列表项 1\\n- 列表项 2\\n\\n\\\`\\\`\\\`js\\nconsole.log('hi');\\n\\\`\\\`\\\``;\ndocument.getElementById('content').innerHTML = marked.parse(md);" }
    ]
  },
  {
    id: 'es-module',
    icon: '📦',
    name: 'ES Module',
    desc: '多文件 ES 模块项目（esbuild）',
    files: [
      { path: 'esm.html', content: '<!DOCTYPE html>\n<html lang="zh">\n<head>\n  <meta charset="UTF-8">\n</head>\n<body>\n  <div id="app"></div>\n  <script type="module" src="main.js"></script>\n</body>\n</html>' },
      { path: 'main.js', content: "import { greet } from './utils.js';\nconst app = document.getElementById('app');\napp.innerHTML = `<h1>${greet('World')}</h1>`;" },
      { path: 'utils.js', content: "export function greet(name) {\n  return `Hello, ${name}!`;\n}" }
    ]
  },
];

/**
 * 获取所有模板
 */
export function getTemplates() {
  return SANDBOX_TEMPLATES;
}

/**
 * 根据ID获取模板
 */
export function getTemplate(id) {
  return SANDBOX_TEMPLATES.find(t => t.id === id);
}

/**
 * 将模板应用到虚拟文件系统
 * @param {VirtualFileSystem} vfs
 * @param {Object} template - 模板对象
 * @param {string} targetDir - 目标目录（空字符串表示根目录）
 * @returns {string[]} 创建的文件路径列表
 */
export function applyTemplate(vfs, template, targetDir) {
  const createdPaths = [];
  for (const f of template.files) {
    // 解析目标路径
    let fullPath = targetDir ? `${targetDir}/${f.path}` : f.path;

    // 文件名冲突时自动追加序号
    if (vfs.getFile(fullPath)) {
      const parts = f.path.split('/');
      const fileName = parts.pop();
      const fileDir = parts.join('/');
      const dotIdx = fileName.lastIndexOf('.');
      const base = dotIdx > 0 ? fileName.substring(0, dotIdx) : fileName;
      const ext = dotIdx > 0 ? fileName.substring(dotIdx) : '';
      let i = 1;
      let newName = `${base}-${i}${ext}`;
      let newPath = fileDir ? `${fileDir}/${newName}` : newName;
      if (targetDir) newPath = `${targetDir}/${newPath}`;
      while (vfs.getFile(newPath)) {
        i++;
        newName = `${base}-${i}${ext}`;
        newPath = fileDir ? `${fileDir}/${newName}` : newName;
        if (targetDir) newPath = `${targetDir}/${newPath}`;
      }
      fullPath = newPath;
    }

    // 确保目录存在
    const lastSlash = fullPath.lastIndexOf('/');
    if (lastSlash > 0) {
      const dirPath = fullPath.substring(0, lastSlash);
      _ensureDir(vfs, dirPath);
    }

    // 创建文件
    const fileName = fullPath.split('/').pop();
    const file = vfs.createFile(
      lastSlash > 0 ? fullPath.substring(0, lastSlash) : '',
      fileName
    );
    if (file) {
      file.content = f.content;
      createdPaths.push(fullPath);
    }
  }
  return createdPaths;
}

function _ensureDir(vfs, dirPath) {
  if (vfs._dirs.has(dirPath)) return;
  const parts = dirPath.split('/');
  let cur = '';
  for (const p of parts) {
    cur = cur ? `${cur}/${p}` : p;
    if (!vfs._dirs.has(cur)) {
      vfs.createDirectory(cur.split('/').slice(0, -1).join('/'), cur.split('/').pop());
    }
  }
}

console.log('[sandbox-templates] 模块已加载');
