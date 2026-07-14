// ============================================================
//  sandbox-bundler.js — esbuild-wasm 浏览器端打包器
//  懒加载 esbuild wasm，仅当 JS 含 import/export 时启用
//  通过虚拟文件系统 plugin 解析多文件依赖
// ============================================================

let _esbuildReady = false;
let _esbuildLoading = false;
let _esbuildInstance = null;
let _esbuildCallbacks = [];

/**
 * 确保 esbuild-wasm 已初始化（懒加载）
 */
function ensureEsbuild() {
  return new Promise((resolve, reject) => {
    if (_esbuildReady) {
      resolve(_esbuildInstance);
      return;
    }
    _esbuildCallbacks.push({ resolve, reject });
    if (_esbuildLoading) return;
    _esbuildLoading = true;

    // 动态加载 esbuild-wasm 脚本
    const script = document.createElement('script');
    script.src = 'lib/esbuild/browser.js';
    script.onload = async () => {
      try {
        const esbuild = window.esbuild;
        if (!esbuild) {
          throw new Error('esbuild 全局对象未找到');
        }
        // 计算 wasm URL 的绝对路径
        const wasmUrl = new URL('lib/esbuild/esbuild.wasm', window.location.href).href;
        await esbuild.initialize({
          wasmURL: wasmUrl,
          worker: false  // Electron 环境中主线程运行更稳定
        });
        _esbuildInstance = esbuild;
        _esbuildReady = true;
        _esbuildCallbacks.forEach(cb => cb.resolve(esbuild));
        _esbuildCallbacks = [];
      } catch (err) {
        _esbuildLoading = false;
        _esbuildCallbacks.forEach(cb => cb.reject(err));
        _esbuildCallbacks = [];
        console.error('[sandbox-bundler] esbuild 初始化失败:', err);
      }
    };
    script.onerror = () => {
      _esbuildLoading = false;
      const err = new Error('esbuild 脚本加载失败');
      _esbuildCallbacks.forEach(cb => cb.reject(err));
      _esbuildCallbacks = [];
    };
    document.head.appendChild(script);
  });
}

/**
 * 检测 VFS 中的 JS 文件是否包含 import/export 语句
 */
export function needsEsbuild(vfs) {
  return vfs.needsEsbuild();
}

/**
 * 使用 esbuild-wasm 打包多文件项目
 * @param {VirtualFileSystem} vfs - 虚拟文件系统
 * @param {string} entryPoint - 入口 JS 文件路径（如 'scripts/app.js'）
 * @returns {Promise<string>} 打包后的 JS 代码
 */
export async function bundleProject(vfs, entryPoint) {
  const esbuild = await ensureEsbuild();

  const virtualPlugin = {
    name: 'astroknot-virtual-fs',
    setup(build) {
      // 拦截所有 import 解析
      build.onResolve({ filter: /.*/ }, (args) => {
        // 忽略 node_modules 中的包
        if (args.path.startsWith('@') || (!args.path.startsWith('.') && !args.path.startsWith('/'))) {
          return { path: args.path, namespace: 'external', external: true };
        }

        const resolved = _resolveImport(args.path, args.resolveDir);
        return { path: resolved, namespace: 'sandbox' };
      });

      // 从虚拟 FS 加载文件
      build.onLoad({ filter: /.*/, namespace: 'sandbox' }, (args) => {
        const file = vfs.getFile(args.path);
        if (!file) {
          return { errors: [{ text: `文件未找到: ${args.path}` }] };
        }
        const loader = _getLoader(file.name);
        return { contents: file.content, loader: loader };
      });

      // 外部模块报错
      build.onLoad({ filter: /.*/, namespace: 'external' }, (args) => {
        return {
          errors: [{
            text: `无法解析外部模块 "${args.path}"。浏览器沙盒环境不支持 npm 包导入，请将所需代码直接放入项目文件中。`
          }]
        };
      });
    }
  };

  const result = await esbuild.build({
    entryPoints: [entryPoint],
    bundle: true,
    write: false,
    plugins: [virtualPlugin],
    target: 'es2020',
    format: 'iife',
    globalName: '__sandbox_module__',
    footer: { js: 'typeof __sandbox_module__!=="undefined"&&__sandbox_module__' },
  });

  if (result.errors && result.errors.length > 0) {
    const errorMsg = result.errors.map(e => e.text).join('\n');
    throw new Error('打包错误: ' + errorMsg);
  }

  if (result.outputFiles && result.outputFiles.length > 0) {
    return result.outputFiles[0].text;
  }

  throw new Error('打包未产生输出');
}

/**
 * 解析 import 路径
 */
function _resolveImport(importPath, fromDir) {
  // 相对路径
  if (importPath.startsWith('./') || importPath.startsWith('../')) {
    let resolved;
    if (fromDir) {
      resolved = fromDir + '/' + importPath;
    } else {
      resolved = importPath;
    }

    // 规范化路径（处理 ../）
    resolved = _normalizePath(resolved);

    // 尝试补全扩展名
    return _tryResolveWithExtensions(resolved);
  }

  // 绝对路径（从项目根）
  if (importPath.startsWith('/')) {
    const path = importPath.substring(1);
    return _tryResolveWithExtensions(path);
  }

  // 其他（视为外部模块）
  return importPath;
}

function _normalizePath(path) {
  const parts = path.split('/');
  const result = [];
  for (const part of parts) {
    if (part === '..') {
      result.pop();
    } else if (part !== '.' && part !== '') {
      result.push(part);
    }
  }
  return result.join('/');
}

function _tryResolveWithExtensions(path) {
  // 尝试直接匹配
  if (path.endsWith('.js') || path.endsWith('.ts') || path.endsWith('.jsx') || path.endsWith('.tsx') ||
      path.endsWith('.css') || path.endsWith('.html') || path.endsWith('.json')) {
    return path;
  }

  // 尝试补全扩展名
  const extensions = ['.js', '.ts', '.jsx', '.tsx', '/index.js', '/index.ts'];
  for (const ext of extensions) {
    // 这个检查在 esbuild 的 onLoad 中完成，这里只返回路径
  }

  // 默认返回加 .js
  return path + '.js';
}

/**
 * 文件扩展名 → esbuild loader
 */
function _getLoader(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const loaderMap = {
    'js': 'js',
    'mjs': 'js',
    'cjs': 'js',
    'ts': 'ts',
    'tsx': 'tsx',
    'jsx': 'jsx',
    'css': 'css',
    'json': 'json',
    'html': 'text',
    'txt': 'text',
  };
  return loaderMap[ext] || 'text';
}

/**
 * 构建包含 esbuild 打包的完整 HTML
 * @param {VirtualFileSystem} vfs - 虚拟文件系统
 * @returns {Promise<string>} 完整的 HTML 字符串
 */
export async function buildBundledHtml(vfs) {
  // 找入口 HTML
  let entryHtml = vfs.getFileContent('index.html') || '';

  // 找 JS 入口文件
  let jsEntry = null;
  for (const [path, file] of vfs.getAllFiles()) {
    if ((file.language === 'javascript' || path.endsWith('.js')) && /\bimport\b/.test(file.content)) {
      jsEntry = path;
      break;
    }
  }

  // 如果没找到含 import 的 JS，回退到主 JS 文件
  if (!jsEntry) {
    if (vfs.getFile('scripts/app.js')) {
      jsEntry = 'scripts/app.js';
    } else {
      // 找第一个 JS 文件
      for (const [path, file] of vfs.getAllFiles()) {
        if (file.language === 'javascript' || path.endsWith('.js')) {
          jsEntry = path;
          break;
        }
      }
    }
  }

  if (!jsEntry) {
    // 无 JS 文件，用简单模式
    return vfs.buildSimpleHtml();
  }

  // 打包 JS
  const bundledJs = await bundleProject(vfs, jsEntry);

  // 收集 CSS
  let css = '';
  for (const [path, file] of vfs.getAllFiles()) {
    if (file.language === 'css' || path.endsWith('.css')) {
      css += '/* ' + path + ' */\n' + file.content + '\n\n';
    }
  }

  // 构建 HTML
  if (entryHtml) {
    // 替换 <link> 和 <script> 为内联
    entryHtml = entryHtml.replace(/<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["'][^"']*["'][^>]*\/?>/gi,
      css ? '<style>\n' + css + '\n</style>' : '');
    entryHtml = entryHtml.replace(/<script\s+[^>]*src=["'][^"']*["'][^>]*><\/script>/gi,
      '<script>\n' + bundledJs + '\n</script>');

    // 如果替换后仍缺少 style/script 标签，注入
    if (css && !entryHtml.includes('<style>')) {
      entryHtml = entryHtml.replace('</head>', '<style>\n' + css + '\n</style>\n</head>');
    }
    if (!entryHtml.includes('<script>')) {
      entryHtml = entryHtml.replace('</body>', '<script>\n' + bundledJs + '\n</script>\n</body>');
    }

    // 注入控制台重定向
    entryHtml = _injectConsoleRedirect(entryHtml);

    return entryHtml;
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>${css}</style>
</head>
<body>
  <script>
    ${_consoleRedirectCode()}
    ${bundledJs}
  </script>
</body>
</html>`;
}

function _injectConsoleRedirect(html) {
  const redirect = _consoleRedirectCode();
  const hotListener = _hotUpdateListenerCode();
  const inject = redirect + '\n' + hotListener;
  if (html.includes('<script>')) {
    return html.replace('<script>', '<script>\n' + inject);
  }
  if (html.includes('</head>')) {
    return html.replace('</head>', '<script>\n' + inject + '\n</script>\n</head>');
  }
  return html;
}

function _hotUpdateListenerCode() {
  return `(function(){
    window.addEventListener('message', function(e){
      var d = e.data;
      if (!d) return;
      if (d.type === 'sandbox-hot-update-css') {
        var style = document.getElementById('__sandbox_hot_style__');
        if (!style) {
          style = document.createElement('style');
          style.id = '__sandbox_hot_style__';
          document.head.appendChild(style);
        }
        style.textContent = '/* hot: ' + (d.path||'') + ' */\\n' + d.css;
      }
      if (d.type === 'sandbox-hot-update-js') {
        var old = document.getElementById('__sandbox_hot_script__');
        if (old) old.remove();
        var s = document.createElement('script');
        s.id = '__sandbox_hot_script__';
        s.textContent = d.js;
        document.body.appendChild(s);
      }
    });
  })();`;
}

function _consoleRedirectCode() {
  return `(function(){
    function ser(v,depth){
      depth=depth||0;
      if(depth>4) return '...';
      if(v===null) return {type:'null',value:'null'};
      if(v===undefined) return {type:'null',value:'undefined'};
      var t=typeof v;
      if(t==='string') return {type:'string',value:v.length>200?v.slice(0,200)+'...':v};
      if(t==='number'||t==='boolean') return {type:t,value:String(v)};
      if(t==='function') return {type:'function',value:'ƒ '+(v.name||'anonymous')+'()'};
      if(t==='symbol') return {type:'string',value:v.toString()};
      try{
        if(v instanceof Error) return {type:'string',value:v.name+': '+v.message+(v.stack?'\\n'+v.stack:'')};
        if(v instanceof HTMLElement) return {type:'string',value:'<'+v.tagName.toLowerCase()+'>'};
        if(Array.isArray(v)){
          var arr=v.slice(0,100).map(function(x){return ser(x,depth+1);});
          if(v.length>100) arr.push({type:'string',value:'... +'+(v.length-100)});
          return {type:'array',value:arr};
        }
        if(t==='object'){
          var keys=Object.keys(v).slice(0,100);
          var obj={};
          keys.forEach(function(k){obj[k]=ser(v[k],depth+1);});
          return {type:'object',value:obj};
        }
      }catch(e){return {type:'string',value:'[无法序列化]'};}
      return {type:'string',value:String(v)};
    }
    function send(level,args){
      var parts=[].slice.call(args).map(function(a){return ser(a);});
      try{window.parent.postMessage({type:'sandbox-console',level:level,args:parts},'*')}catch(x){}
    }
    ['log','error','warn','info'].forEach(function(lv){
      var orig=console[lv];
      console[lv]=function(){send(lv,arguments);if(orig)orig.apply(console,arguments);};
    });
    window.onerror=function(m,s,l,c,err){
      if(err) console.error(err);
      else console.error(m+' ('+s+':'+l+')');
    };
    window.addEventListener('unhandledrejection',function(e){
      console.error('Unhandled Promise Rejection: '+(e.reason&&e.reason.message||e.reason));
    });
  })();`;
}

console.log('[sandbox-bundler] 模块已加载');
