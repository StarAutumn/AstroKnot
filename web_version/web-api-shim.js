// ============================================================
//  web-api-shim.js — 浏览器环境兼容层
//  当不在 Electron 中运行时，模拟 window.api 接口
//  使 AstroKnot 可以作为纯 Web 应用部署到 Vercel / Cloudflare Pages
// ============================================================

(function () {
  'use strict';

  // 已在 Electron 环境中，无需 shim
  if (window.api) return;

  // ── 项目数据 localStorage 键 ──
  const PROJECTS_KEY = 'astroknot_projects';
  const CURRENT_PROJECT_KEY = 'astroknot_current_project_id';
  const FIRST_RUN_KEY = 'astroknot_first_run';

  // ── localStorage 辅助 ──
  function lsGet(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {
      console.warn('[shim] localStorage 写入失败:', e);
    }
  }

  // ── 浏览器下载文件 ──
  function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ── 浏览器选择文件上传 ──
  function uploadFile(accept, multiple) {
    return new Promise(function (resolve) {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept || '.astroknot,.json';
      if (multiple) input.multiple = true;
      input.style.display = 'none';
      document.body.appendChild(input);

      input.addEventListener('change', function () {
        const files = Array.from(input.files);
        document.body.removeChild(input);
        if (files.length === 0) { resolve({ canceled: true }); return; }
        resolve({ success: true, files: files });
      });

      input.addEventListener('cancel', function () {
        document.body.removeChild(input);
        resolve({ canceled: true });
      });

      input.click();
    });
  }

  // ── 读取 File 对象内容 ──
  function readFileContent(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function (e) { resolve(e.target.result); };
      reader.onerror = function (e) { reject(e); };
      reader.readAsText(file);
    });
  }

  // ── 模拟 window.api ──
  window.api = {
    appVersion: '1.0.0',

    checkFirstRun: async function () {
      if (!localStorage.getItem(FIRST_RUN_KEY)) {
        localStorage.setItem(FIRST_RUN_KEY, '1');
        return true;
      }
      return false;
    },

    // ── 保存项目：localStorage + 触发浏览器下载 .astroknot 文件 ──
    saveProject: async function (projectData) {
      try {
        // 1. 保存到 localStorage（自动恢复用）
        const projects = lsGet(PROJECTS_KEY) || {};
        const projectId = projectData.projectName || projectData.id || 'default';
        projects[projectId] = projectData;
        lsSet(PROJECTS_KEY, projects);

        // 2. 触发浏览器下载 .astroknot 文件（用户可手动备份）
        const jsonStr = JSON.stringify(projectData, null, 2);
        const safeName = (projectData.projectName || 'untitled').replace(/[<>:"/\\|?*]/g, '_');
        downloadFile(jsonStr, safeName + '.astroknot', 'application/json');

        console.log('[shim] 项目已保存并下载:', projectId);
        return { success: true, path: 'download/' + safeName + '.astroknot' };
      } catch (e) {
        console.error('[shim] 保存失败:', e);
        return { success: false, error: e.message };
      }
    },

    // ── 加载项目：弹出文件选择器让用户选择 .astroknot 文件 ──
    loadProject: async function () {
      try {
        const result = await uploadFile('.astroknot,.json');
        if (result.canceled) return { canceled: true };

        const file = result.files[0];
        const content = await readFileContent(file);
        const data = JSON.parse(content);

        console.log('[shim] 从文件加载项目:', file.name);
        return { success: true, data: data };
      } catch (e) {
        console.error('[shim] 加载失败:', e);
        return { canceled: true };
      }
    },

    selectFolder: async function () {
      // Web 版：提示用户通过下载功能保存
      showToast?.('Web 版请使用"保存项目"自动下载文件');
      return { canceled: true };
    },

    selectFolderForLoad: async function () {
      // Web 版：复用 loadProject 的文件上传逻辑
      return this.loadProject();
    },

    readMarkdownFile: async function () {
      try {
        const result = await uploadFile('.md,.txt,.markdown');
        if (result.canceled) return { canceled: true };
        const content = await readFileContent(result.files[0]);
        return { success: true, content: content };
      } catch (e) {
        return { canceled: true };
      }
    },

    openExternalUrl: async function (url) {
      window.open(url, '_blank', 'noopener');
      return { success: true };
    },

    openLocalFile: async function () {
      try {
        const result = await uploadFile('*.*');
        if (result.canceled) return { success: false };
        const file = result.files[0];
        return { success: true, filePath: file.name, fileName: file.name };
      } catch (e) {
        return { success: false };
      }
    },

    showFileInFolder: async function () {
      return { success: false };
    },

    extractExeIcon: async function () {
      return null;
    },

    closeApp: function () {},
    winMinimize: function () {},
    winMaximize: function () {},
    winUnmaximize: function () {},
    winClose: function () {},

    toggleFullscreen: function () {
      if (document.fullscreenElement) {
        document.exitFullscreen?.();
      } else {
        document.documentElement.requestFullscreen?.();
      }
    },

    onMaximizeChange: function () {},
    onFullscreenChange: function (callback) {
      document.addEventListener('fullscreenchange', function () {
        callback(!!document.fullscreenElement);
      });
    },

    onHotUpdate: function () {},
  };

  console.log('[shim] ✅ 浏览器兼容层已加载 (非 Electron环境)');
})();
