// ============================================================
//  sandbox-preview.js — 预览运行 + 热注入 + 控制台重定向代码
//  运行预览、CSS/JS 热注入、全屏预览、暂停/恢复 iframe
// ============================================================

import { needsEsbuild, buildBundledHtml } from '../core/bundler.js';

export class SandboxPreview {
  /**
   * @param {import('../core/context.js').SandboxContext} ctx
   */
  constructor(ctx) {
    this.ctx = ctx;
    this._lastPreviewHtml = '';
    this._lastPreviewFiles = new Map();
    this._previewFullscreen = false;
    this._isRunningPreview = false;
    this._fullscreenKeydownHandler = null;
  }

  init() {
    this.ctx.registerAction('runPreview', (force) => this.runPreview(force ?? true));
    this.ctx.registerAction('fullscreenPreview', () => this.togglePreviewFullscreen());

    // ESC 退出全屏
    this._fullscreenKeydownHandler = (e) => this._onFullscreenKeydown(e);
    document.addEventListener('keydown', this._fullscreenKeydownHandler);
  }

  destroy() {
    if (this._fullscreenKeydownHandler) {
      document.removeEventListener('keydown', this._fullscreenKeydownHandler);
      this._fullscreenKeydownHandler = null;
    }

    // 关键：彻底清理预览 iframe，释放 GPU 资源
    // pausePreview() 创建了新的空白 iframe，但 destroy() 需要再次清理
    this.pausePreview();

    this._lastPreviewHtml = '';
    this._lastPreviewFiles.clear();
    this._previewFullscreen = false;
    this._isRunningPreview = false;
  }

  // ── 预览运行 ──

  async runPreview(forceFullReload = true) {
    const preview = this.ctx.preview;
    const vfs = this.ctx.vfs;
    if (!preview || !vfs) return;
    // 防重入
    if (this._isRunningPreview) return;
    this._isRunningPreview = true;

    try {
      // 用户手动运行时自动切换到预览标签
      if (forceFullReload) {
        const activityBar = this.ctx.getModule('activityBar');
        if (activityBar && !activityBar.isPreviewTab) {
          activityBar.activatePreviewTab();
        } else if (!activityBar) {
          // activityBar 未迁移时，直接调用全局函数（兼容过渡期）
          // 通过事件通知 index.js
          this.ctx.emit('activatePreviewTab');
        }
      }

      // 同步 Monaco 内容到 VFS
      const monacoEditor = this.ctx.monacoEditor;
      if (monacoEditor) monacoEditor.syncAllToFS(vfs);

      // 清空控制台
      const consoleModule = this.ctx.getModule('console');
      if (consoleModule) consoleModule.clearConsole();

      // 尝试热注入（非强制刷新且已有预览）
      if (!forceFullReload && this._lastPreviewHtml && this._lastPreviewFiles.size > 0) {
        const injectResult = this._tryHotInject();
        if (injectResult) {
          this.ctx.setStatus('热更新 ✓');
          return;
        }
      }

      this.ctx.setStatus('正在构建...');

      let fullHtml;

      if (needsEsbuild(vfs)) {
        this.ctx.setStatus('正在打包 (esbuild)...');
        try {
          fullHtml = await buildBundledHtml(vfs);
        } catch (err) {
          console.warn('[sandbox] esbuild 打包失败，回退到简单模式:', err);
          fullHtml = vfs.buildSimpleHtml();
          fullHtml = this._injectConsoleRedirect(fullHtml);
          this.ctx.setStatus('打包失败，使用简单模式');
        }
      } else {
        fullHtml = vfs.buildSimpleHtml();
        fullHtml = this._injectConsoleRedirect(fullHtml);
      }

      this._lastPreviewHtml = fullHtml;
      preview.srcdoc = fullHtml;

      // 记录当前文件内容（用于下次热注入比较）
      this._lastPreviewFiles.clear();
      for (const [path, file] of vfs.getAllFiles()) {
        this._lastPreviewFiles.set(path, file.content);
      }

      this.ctx.setStatus('运行中 ✓');
    } catch (err) {
      this.ctx.setStatus('运行错误: ' + err.message);
      console.error('[sandbox] 运行预览失败:', err);
    } finally {
      this._isRunningPreview = false;
    }
  }

  // ── 热注入 ──

  _tryHotInject() {
    const preview = this.ctx.preview;
    const vfs = this.ctx.vfs;
    if (!preview || !preview.contentWindow) return false;

    let changedCss = null;
    let changedJs = null;
    let htmlChanged = false;
    let otherChanged = false;

    for (const [path, file] of vfs.getAllFiles()) {
      const oldContent = this._lastPreviewFiles.get(path);
      const newContent = file.content;
      if (oldContent === newContent) continue;

      if (file.language === 'css' || path.endsWith('.css')) {
        changedCss = { path, content: newContent };
      } else if (file.language === 'javascript' || path.endsWith('.js') || path.endsWith('.mjs')) {
        changedJs = changedJs || [];
        changedJs.push({ path, content: newContent });
      } else if (file.language === 'html' || path.endsWith('.html')) {
        htmlChanged = true;
      } else {
        otherChanged = true;
      }
    }

    if (htmlChanged || otherChanged) return false;

    // 仅 CSS 改动
    if (changedCss && !changedJs) {
      try {
        preview.contentWindow.postMessage({
          type: 'sandbox-hot-update-css',
          css: changedCss.content,
          path: changedCss.path
        }, '*');
        this._lastPreviewFiles.set(changedCss.path, changedCss.content);
        return true;
      } catch (e) { return false; }
    }

    // 仅 JS 改动
    if (changedJs && !changedCss) {
      try {
        let allJs = '';
        for (const j of changedJs) {
          allJs += '// ' + j.path + '\n' + j.content + '\n\n';
          this._lastPreviewFiles.set(j.path, j.content);
        }
        preview.contentWindow.postMessage({ type: 'sandbox-hot-update-js', js: allJs }, '*');
        return true;
      } catch (e) { return false; }
    }

    // CSS + JS 都改了
    if (changedCss && changedJs) {
      try {
        preview.contentWindow.postMessage({
          type: 'sandbox-hot-update-css',
          css: changedCss.content,
          path: changedCss.path
        }, '*');
        let allJs = '';
        for (const j of changedJs) {
          allJs += '// ' + j.path + '\n' + j.content + '\n\n';
          this._lastPreviewFiles.set(j.path, j.content);
        }
        preview.contentWindow.postMessage({ type: 'sandbox-hot-update-js', js: allJs }, '*');
        this._lastPreviewFiles.set(changedCss.path, changedCss.content);
        return true;
      } catch (e) { return false; }
    }

    return false;
  }

  // ── 暂停/恢复 ──

  /**
   * 暂停预览：彻底清理 iframe 内的资源
   *
   * 复杂前端代码可能包含定时器、动画、WebGL 上下文等，
   * 仅清空 srcdoc 不会停止这些后台任务（浏览器的 JS 引擎不会立即释放 iframe 上下文）。
   * 最可靠的清理方式是：先导航到 about:blank（立即终止所有 JS 执行），
   * 然后移除并重建 iframe 元素（彻底断开与旧文档的连接，触发 GC）。
   */
  pausePreview() {
    const preview = this.ctx.preview;
    if (!preview) return;

    // 第一步：导航到 about:blank，立即终止 iframe 内所有 JS 执行
    // 这是唯一可靠的方式：setInterval/requestAnimationFrame/WebGL 上下文都会被销毁
    try {
      if (preview.contentWindow) {
        preview.contentWindow.location.href = 'about:blank';
      }
    } catch (e) {
      // 跨域或已销毁的 contentWindow，忽略
    }

    // 第二步：清空 srcdoc（双重保险）
    preview.srcdoc = '';

    // 第三步：移除 iframe 并重建，确保旧文档被 GC 回收
    // 仅清空 srcdoc 不会释放 WebGL 上下文等 GPU 资源，
    // 必须让浏览器丢弃整个 iframe 文档对象
    const parent = preview.parentElement;
    if (parent) {
      const newIframe = document.createElement('iframe');
      newIframe.id = preview.id;
      newIframe.className = preview.className;
      newIframe.style.cssText = preview.style.cssText;
      preview.remove();
      parent.appendChild(newIframe);
      this.ctx.preview = newIframe;
    }
  }

  resumePreview() {
    const preview = this.ctx.preview;
    if (preview && this._lastPreviewHtml) preview.srcdoc = this._lastPreviewHtml;
  }

  // ── 全屏预览 ──

  togglePreviewFullscreen() {
    this._previewFullscreen = !this._previewFullscreen;
    const area = document.getElementById('sandboxPreviewContainer');
    if (area) {
      area.classList.toggle('fullscreen-mode', this._previewFullscreen);
    }

    // 更新原始按钮图标
    const btn = document.getElementById('previewFullscreenBtn');
    if (btn) {
      btn.textContent = this._previewFullscreen ? '✕' : '⛶';
      btn.title = this._previewFullscreen ? '退出全屏 (ESC)' : '全屏预览';
      btn.classList.toggle('exit-fullscreen', this._previewFullscreen);
    }

    // 全屏时在 body 上添加浮动退出按钮
    const exitBtn = document.getElementById('sandboxFullscreenExit');
    if (this._previewFullscreen) {
      if (!exitBtn) {
        const el = document.createElement('button');
        el.id = 'sandboxFullscreenExit';
        el.className = 'sandbox-fullscreen-exit';
        el.innerHTML = '✕ 退出全屏';
        el.title = '退出全屏 (ESC)';
        el.addEventListener('click', () => this.togglePreviewFullscreen());
        document.body.appendChild(el);
      }
    } else {
      if (exitBtn) exitBtn.remove();
    }

    if (this.ctx.monacoEditor) setTimeout(() => this.ctx.monacoEditor.layout(), 50);
  }

  _onFullscreenKeydown(e) {
    if (e.key === 'Escape' && this._previewFullscreen) {
      this.togglePreviewFullscreen();
    }
  }

  // ── 代码注入 ──

  _injectConsoleRedirect(html) {
    const redirect = this._consoleRedirectCode();
    const hotUpdateListener = this._hotUpdateListenerCode();
    const injectCode = redirect + '\n' + hotUpdateListener;

    if (html.includes('<script>')) {
      return html.replace('<script>', '<script>\n' + injectCode);
    }
    if (html.includes('</head>')) {
      return html.replace('</head>', '<script>\n' + injectCode + '\n</script>\n</head>');
    }
    return html;
  }

  _consoleRedirectCode() {
    return `(function(){
      function ser(v,depth){
        depth=depth||0;
        if(depth>4) return {type:'string',value:'...'};
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

  _hotUpdateListenerCode() {
    return `(function(){
      // 用于存储用户创建的定时器 ID
      var _sandboxTimers = [];
      var _sandboxRAFs = [];
      var _originalSetInterval = window.setInterval;
      var _originalSetTimeout = window.setTimeout;
      var _originalRAF = window.requestAnimationFrame;

      // 包装定时器函数，记录所有 ID
      window.setInterval = function(fn, delay) {
        var id = _originalSetInterval.call(window, fn, delay);
        _sandboxTimers.push({ type: 'interval', id: id });
        return id;
      };
      window.setTimeout = function(fn, delay) {
        var id = _originalSetTimeout.call(window, fn, delay);
        _sandboxTimers.push({ type: 'timeout', id: id });
        return id;
      };
      window.requestAnimationFrame = function(fn) {
        var id = _originalRAF.call(window, fn);
        _sandboxRAFs.push(id);
        return id;
      };

      window.addEventListener('message', function(e){
        var d = e.data;
        if (!d) return;

        // 热更新 CSS
        if (d.type === 'sandbox-hot-update-css') {
          var style = document.getElementById('__sandbox_hot_style__');
          if (!style) {
            style = document.createElement('style');
            style.id = '__sandbox_hot_style__';
            document.head.appendChild(style);
          }
          style.textContent = '/* hot: ' + (d.path||'') + ' */\\n' + d.css;
        }

        // 热更新 JS
        if (d.type === 'sandbox-hot-update-js') {
          var old = document.getElementById('__sandbox_hot_script__');
          if (old) old.remove();
          var s = document.createElement('script');
          s.id = '__sandbox_hot_script__';
          s.textContent = d.js;
          document.body.appendChild(s);
        }

        // 停止所有定时器和动画帧
        if (d.type === 'sandbox-stop-all') {
          // 清除所有定时器
          _sandboxTimers.forEach(function(t) {
            if (t.type === 'interval') clearInterval(t.id);
            else if (t.type === 'timeout') clearTimeout(t.id);
          });
          _sandboxTimers = [];

          // 取消所有动画帧
          _sandboxRAFs.forEach(function(id) {
            cancelAnimationFrame(id);
          });
          _sandboxRAFs = [];

          // 尝试清理 WebGL 上下文（如果有）
          try {
            var canvases = document.querySelectorAll('canvas');
            canvases.forEach(function(c) {
              var gl = c.getContext('webgl') || c.getContext('webgl2');
              if (gl) {
                // 执行扩展清理以释放 GPU 资源
                var ext = gl.getExtension('WEBGL_lose_context');
                if (ext) ext.loseContext();
              }
            });
          } catch (x) {}
        }
      });
    })();`;
  }
}

console.log('[sandbox-preview] 模块已加载');
