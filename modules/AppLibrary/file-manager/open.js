// ============================================================
//  file-manager/open.js — 打开 / IDE / 项目与节点集成（原型混入）
//  职责：打开文件并送入预览、通过 IDE 打开文件或文件夹、
//  在系统文件管理器中显示所在位置、检测 AstroKnot 项目 /
//  已注册应用 / 通用项目并按类型打开、检测并打开节点富文本编辑器
//  实现说明：以原型混入（Object.assign(FileManagerApp.prototype, ...)）
//  挂载到 FileManagerApp——方法体通过 this 访问实例状态
//  （this._currentPath / this._content 等），与写在 class 体内
//  完全等价；module9_FileIO / richEditor 仍按原样在方法内
//  动态 import，状态初始化与调用时机由 index.js 统一编排
// ============================================================

export const openMethods = {
  async _openFile(name) {
    const relPath = this._currentPath ? this._currentPath + '/' + name : name;
    try {
      const result = await window.api.fmReadFile(relPath);
      if (result.type === 'text') {
        this._showTextPreview(name, result.content);
      } else if (result.type === 'image') {
        this._showImagePreview(name, result.dataUrl);
      } else {
        // 无法预览的文件，显示信息
        this._showInfoPreview(name, result);
      }
    } catch (e) {
      console.error('[FileManager] 打开文件失败:', e);
    }
  },

  /**
   * 通过 IDE 打开文件夹或文件
   * @param {string} relPath - 相对于 AstroKnot-Data 的路径
   * @param {string} type - 'directory' | 'file'
   */
  async _openInIDE(relPath, type) {
    try {
      // 解析为绝对路径
      const absPath = await window.api.fmResolvePath(relPath);
      if (!absPath) {
        this._showToast('无法解析路径', 'error');
        return;
      }

      // 文件夹：直接用 IDE 打开该文件夹
      // 文件：用 IDE 打开文件所在文件夹
      let folderPath = absPath;
      let fileName = null;
      if (type !== 'directory') {
        const sep = absPath.includes('\\') ? '\\' : '/';
        const parts = absPath.split(sep);
        fileName = parts.pop();
        folderPath = parts.join(sep);
      }

      // 通过 AppRunner 打开 IDE
      const runner = window.AppRunner;
      if (!runner) {
        this._showToast('IDE 不可用', 'error');
        return;
      }

      const ideApp = {
        id: `ide-fm-${Date.now()}`,
        type: 'ide',
        name: `IDE - ${relPath.split(/[/\\]/).pop()}`,
        icon: '💻',
        sandboxPath: folderPath,
      };

      await runner.open(ideApp);
    } catch (e) {
      console.error('[FileManager] IDE 打开失败:', e);
      this._showToast('IDE 打开失败: ' + e.message, 'error');
    }
  },

  /**
   * 在系统文件管理器中打开文件所在位置
   * @param {string} relPath - 相对于 AstroKnot-Data 的路径
   */
  async _openInExplorer(relPath) {
    try {
      const absPath = await window.api.fmResolvePath(relPath);
      if (!absPath) {
        this._showToast('无法解析路径', 'error');
        return;
      }
      await window.api.showFileInFolder(absPath);
    } catch (e) {
      console.error('[FileManager] 打开文件位置失败:', e);
      this._showToast('打开失败: ' + e.message, 'error');
    }
  },

  async _detectProject(relPath) {
    try {
      const items = await window.api.fmReadDir(relPath);
      const names = new Set(items.map(i => i.name));

      // AstroKnot 项目：含 project.json
      if (names.has('project.json')) {
        return { type: 'astroknot' };
      }

      // 已注册的 GitHub 应用：在 apps/ 目录下
      const appInfo = await window.api.fmFindAppByPath(relPath);
      if (appInfo) {
        return { type: 'app', app: appInfo };
      }

      // 通用项目：含常见项目标记文件
      const projectMarkers = ['package.json', '.git', 'pom.xml', 'Cargo.toml', 'go.mod', 'requirements.txt', 'Gemfile', 'composer.json', 'pyproject.toml', 'CMakeLists.txt', 'Makefile'];
      for (const marker of projectMarkers) {
        if (names.has(marker)) {
          return { type: 'project', marker };
        }
      }
      return null;
    } catch (e) {
      console.error('[FileManager] 项目检测失败:', e);
      return null;
    }
  },

  async _openAsProject(relPath, projectInfo) {
    try {
      // AstroKnot 项目：加载到 3D 场景
      if (projectInfo.type === 'astroknot') {
        const absPath = await window.api.fmResolvePath(relPath);
        if (!absPath) {
          this._showToast('无法解析路径', 'error');
          return;
        }
        const result = await window.api.readProjectFromFolder(absPath);
        if (!result.success) {
          this._showToast('加载项目失败: ' + (result.error || '未知错误'), 'error');
          return;
        }
        const { applyLoadedData } = await import('../../module9_FileIO.js');
        const folderName = relPath.split(/[/\\]/).pop();
        applyLoadedData(result.data, folderName, result.folderPath);
        this._showToast(`已加载项目: ${folderName}`);
        return;
      }

      // 已注册应用：用 AppRunner 运行
      if (projectInfo.type === 'app') {
        const runner = window.AppRunner;
        if (!runner) {
          this._showToast('应用运行器不可用', 'error');
          return;
        }
        this._showToast(`正在打开 ${projectInfo.app.name}...`);
        await runner.open(projectInfo.app);
        return;
      }

      // 通用项目：用 IDE 打开
      const runner = window.AppRunner;
      if (!runner) {
        this._showToast('IDE 不可用', 'error');
        return;
      }
      const absPath = await window.api.fmResolvePath(relPath);
      if (!absPath) {
        this._showToast('无法解析路径', 'error');
        return;
      }
      const folderName = relPath.split(/[/\\]/).pop();
      const ideApp = {
        id: `ide-project-${Date.now()}`,
        type: 'ide',
        name: `IDE - ${folderName}`,
        icon: '💻',
        sandboxPath: absPath,
      };
      this._showToast(`正在以 IDE 打开项目 ${folderName}...`);
      await runner.open(ideApp);
    } catch (e) {
      console.error('[FileManager] 打开项目失败:', e);
      this._showToast('打开项目失败: ' + e.message, 'error');
    }
  },

  /**
   * 检测文件夹是否为 AstroKnot 节点文件夹
   * 节点文件夹位于 <project>/nodes/<name>_<nodeId前8位>/
   * @param {string} relPath - 相对于 AstroKnot-Data 的路径
   * @returns {Promise<{nodeId: string, nodeName: string}|null>}
   */
  async _detectNodeFolder(relPath) {
    try {
      const normalized = (relPath || '').replace(/\\/g, '/');
      const parts = normalized.split('/');
      if (parts.length < 2) return null;
      const parentDir = parts[parts.length - 2];
      const folderName = parts[parts.length - 1];
      if (parentDir !== 'nodes') return null;

      // 新格式：<name>_<nodeId前8位>
      // 旧格式：纯 nodeId（如 node_1234567890_abc12345）
      let nodeId = null;
      let nodeName = folderName;
      const match = folderName.match(/^(.+)_(.{8})$/);
      if (match) {
        nodeName = match[1];
        nodeId = match[2];
      } else {
        // 旧格式：整个文件夹名就是 nodeId
        nodeId = folderName;
      }
      return { nodeId, nodeName, relPath };
    } catch (e) {
      return null;
    }
  },

  /**
   * 打开节点富文本编辑器（支持跨项目）
   * @param {{nodeId: string, nodeName: string, relPath: string}} nodeInfo
   */
  async _openNode(nodeInfo) {
    try {
      const appState = window.appState;
      if (!appState || !appState.nodeMap) {
        this._showToast('AstroKnot 场景未初始化', 'error');
        return;
      }

      // 1. 先尝试在当前场景中匹配（通过 id 前 8 位，或旧格式完整 id）
      let matchedNode = null;
      for (const node of appState.nodeMap.values()) {
        if (node.id.slice(0, 8) === nodeInfo.nodeId || node.id === nodeInfo.nodeId) {
          matchedNode = node;
          break;
        }
      }
      if (matchedNode) {
        const { openRichEditor } = await import('../../richEditor/index.js');
        openRichEditor(matchedNode.id);
        this._showToast(`已打开节点: ${matchedNode.name}`);
        return;
      }

      // 2. 跨项目：读取外部节点 content.html（可能不存在）
      const contentRelPath = nodeInfo.relPath + '/content.html';
      let htmlContent = '';
      let absPath = null;
      try {
        const result = await window.api.fmReadFile(contentRelPath);
        if (result.type === 'text') {
          htmlContent = result.content;
        }
        absPath = await window.api.fmResolvePath(contentRelPath);
      } catch (_) { /* 节点可能没有 content.html */ }

      if (!absPath) {
        this._showToast('无法解析节点路径', 'error');
        return;
      }

      // 3. 构造临时节点注入 nodeMap
      const tempId = `foreign_${Date.now()}`;
      const tempNode = {
        id: tempId,
        name: nodeInfo.nodeName,
        richContent: htmlContent,
        overlayImages: [],
        activeMode: 'normal',
        _foreignFilePath: absPath,
      };
      appState.nodeMap.set(tempId, tempNode);

      // 4. 打开编辑器
      const { openRichEditor } = await import('../../richEditor/index.js');
      openRichEditor(tempId);
      this._showToast(`已打开外部节点: ${nodeInfo.nodeName}`);
    } catch (e) {
      console.error('[FileManager] 打开节点失败:', e);
      this._showToast('打开节点失败: ' + e.message, 'error');
    }
  }
};
