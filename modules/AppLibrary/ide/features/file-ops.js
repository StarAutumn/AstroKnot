/**
 * SandboxFileOps — 文件操作回调 + 保存/导出
 *
 * 管理 IDE 中所有文件相关的用户操作：打开/关闭/删除/重命名/创建文件，
 * 以及保存/同步到笔记/导出 HTML。
 * 通过 SandboxContext 与其他模块通信。
 */

import { appState } from '../../../module0_AppState.js';
import { saveCurrentProjectData } from '../../../module2_TreeData.js';
import { showToast } from '../../../module5_SelectAndEdit.js';

class SandboxFileOps {
  /**
   * @param {import('../core/context').SandboxContext} ctx - 沙箱共享上下文
   */
  constructor(ctx) {
    /** @private */
    this._ctx = ctx;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * 初始化模块。注册 actions。
   */
  init() {
    this._ctx.registerAction('save', () => this.saveHtmlSource());
    this._ctx.registerAction('export', () => this.exportAsHtml());
  }

  /**
   * 销毁模块。
   */
  destroy() {
    // no-op
  }

  // ---------------------------------------------------------------------------
  // 文件打开/关闭
  // ---------------------------------------------------------------------------

  /**
   * 在编辑器中打开文件。自动路由图片/Markdown 到对应预览。
   * @param {string} filePath
   */
  openFileInEditor(filePath) {
    const vfs = this._ctx.vfs;
    const monacoEditor = this._ctx.monacoEditor;
    const fileTabs = this._ctx.fileTabs;
    if (!vfs || !monacoEditor || !fileTabs) return;

    const file = vfs.getFile(filePath);
    if (!file) return;

    // 如果当前在预览标签，先退出预览
    if (this._ctx.isPreviewTab) {
      this._ctx.emit('deactivatePreviewTab');
    }

    // 显式隐藏预览容器，显示 Monaco 容器（不依赖事件系统，确保可靠）
    const previewContainer = document.getElementById('sandboxPreviewContainer');
    if (previewContainer) previewContainer.style.display = 'none';
    const monacoContainer = document.getElementById('sandboxMonacoContainer');
    if (monacoContainer) monacoContainer.style.display = '';

    // 图片文件路由到图片预览
    const imagePreview = this._ctx.getModule('imagePreview');
    const markdown = this._ctx.getModule('markdown');

    if (imagePreview && imagePreview.constructor.isImageFile(filePath)) {
      imagePreview.openImagePreview(filePath);
      return;
    }

    // 退出图片预览模式
    if (imagePreview) imagePreview.closeImagePreview();

    // Markdown 文件也像普通文件一样在 Monaco 编辑器中打开（不自动进入分屏预览）
    if (markdown) {
      markdown.exitMarkdownMode();
    }

    fileTabs.openTab(filePath, file.name);
    monacoEditor.openFile(file);

    const fileTree = this._ctx.fileTree;
    if (fileTree) fileTree.setActive(filePath);

    this._ctx.emit('updateBreadcrumb', filePath);
    this._ctx.emit('updateStatusBar');
  }

  /**
   * 文件选择回调。
   * @param {string} filePath
   */
  onFileSelect(filePath) {
    this.openFileInEditor(filePath);
  }

  /**
   * 关闭标签页。
   * @param {string} filePath
   */
  onTabClose(filePath) {
    const fileTabs = this._ctx.fileTabs;
    const monacoEditor = this._ctx.monacoEditor;

    if (fileTabs) fileTabs.closeTab(filePath);
    if (monacoEditor) monacoEditor.closeFile(filePath);
    if (fileTabs && fileTabs.getActivePath()) {
      this.openFileInEditor(fileTabs.getActivePath());
    }
  }

  /**
   * 关闭除指定文件外的所有标签页。
   * @param {string} keepPath
   */
  onCloseOthers(keepPath) {
    const fileTabs = this._ctx.fileTabs;
    const monacoEditor = this._ctx.monacoEditor;
    if (!fileTabs) return;

    const others = fileTabs.getOpenFiles().filter(p => p !== keepPath);
    for (const p of others) {
      if (monacoEditor) monacoEditor.closeFile(p);
      fileTabs.closeTab(p);
    }
    this.openFileInEditor(keepPath);
  }

  /**
   * 关闭所有标签页。
   */
  onCloseAll() {
    const fileTabs = this._ctx.fileTabs;
    const monacoEditor = this._ctx.monacoEditor;
    if (!fileTabs) return;

    const all = fileTabs.getOpenFiles().slice();
    for (const p of all) {
      if (monacoEditor) monacoEditor.closeFile(p);
      fileTabs.closeTab(p);
    }
    // 关闭预览标签（如果存在）
    if (this._ctx.isPreviewTab || document.querySelector('.sandbox-tab[data-preview-tab]')) {
      this._ctx.emit('closePreviewTab');
    }
  }

  /**
   * 关闭已保存的标签页。
   */
  onCloseSaved() {
    const fileTabs = this._ctx.fileTabs;
    const monacoEditor = this._ctx.monacoEditor;
    if (!fileTabs) return;

    const saved = fileTabs._tabs.filter(t => !t.dirty).map(t => t.filePath);
    for (const p of saved) {
      if (monacoEditor) monacoEditor.closeFile(p);
      fileTabs.closeTab(p);
    }
    // 如果当前激活的标签被关了，切到剩余的第一个
    if (fileTabs.getActivePath()) {
      this.openFileInEditor(fileTabs.getActivePath());
    }
  }

  // ---------------------------------------------------------------------------
  // 文件操作
  // ---------------------------------------------------------------------------

  /**
   * 复制文件路径到剪贴板。
   * @param {string} filePath
   */
  onCopyPath(filePath) {
    navigator.clipboard.writeText(filePath).then(() => {
      showToast('📋 已复制: ' + filePath);
    }).catch(() => {
      // 降级方案
      const ta = document.createElement('textarea');
      ta.value = filePath;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('📋 已复制: ' + filePath);
    });
  }

  /**
   * 在文件树中定位并显示文件。
   * @param {string} filePath
   */
  onRevealInTree(filePath) {
    const fileTree = this._ctx.fileTree;
    if (fileTree) fileTree.setActive(filePath);

    // 确保文件树面板可见
    if (this._ctx.activePanel !== 'explorer') {
      this._ctx.emit('toggleSidePanel', 'explorer');
    }
    const sidePanel = document.getElementById('sandboxSidePanel');
    if (sidePanel && sidePanel.classList.contains('collapsed')) {
      sidePanel.classList.remove('collapsed');
      this._ctx.activePanel = 'explorer';
      this._ctx.emit('updateActivityBarButtons', 'explorer');
    }
  }

  /**
   * 删除文件或目录。
   * @param {string} path
   * @param {boolean} isDirectory
   */
  onFileDelete(path, isDirectory) {
    const vfs = this._ctx.vfs;
    const monacoEditor = this._ctx.monacoEditor;
    const fileTabs = this._ctx.fileTabs;
    const fileTree = this._ctx.fileTree;

    if (!vfs) return;

    if (isDirectory) {
      // 删除目录前，先关闭该目录下所有文件的 Monaco models 和标签页
      const prefix = path + '/';
      if (monacoEditor || fileTabs) {
        // 收集要关闭的文件路径（快照，避免迭代中修改）
        const filesToClose = [];
        for (const [fPath] of vfs._files) {
          if (fPath.startsWith(prefix)) {
            filesToClose.push(fPath);
          }
        }
        for (const fPath of filesToClose) {
          if (monacoEditor) monacoEditor.deleteFile(fPath);
          if (fileTabs) fileTabs.closeTab(fPath);
        }
      }
      vfs.deleteDirectory(path);
    } else {
      vfs.deleteFile(path);
      if (monacoEditor) monacoEditor.deleteFile(path);
      if (fileTabs) fileTabs.closeTab(path);
    }

    if (fileTree) fileTree.refresh();
    this._ctx.emit('statusChange', '已删除: ' + path.split('/').pop());

    // 自动运行预览
    const autoRun = this._ctx.getModule('autoRun');
    if (autoRun && autoRun.autoRunEnabled) {
      this._ctx.emit('autoRunPreview');
    }

    // 实时同步到磁盘：删除对应文件/目录
    const currentNodeId = this._ctx.currentNodeId;
    if (currentNodeId) {
      const projectFolderPath = this._getProjectFolderPath();
      vfs.deleteSingleFileFromDisk(projectFolderPath, currentNodeId, path).then((ok) => {
        if (ok) {
          const node = appState.nodeMap.get(currentNodeId);
          if (node) node.fileSystem = vfs.toJSON();
          console.log(`[实时同步] 已从磁盘删除: ${path}`);
        }
      });
    }
  }

  /**
   * 重命名文件或目录。
   * @param {string} path
   * @param {string} newName
   */
  onFileRename(path, newName) {
    const vfs = this._ctx.vfs;
    const monacoEditor = this._ctx.monacoEditor;
    const fileTabs = this._ctx.fileTabs;
    const fileTree = this._ctx.fileTree;

    if (!vfs) return;

    const newPath = vfs.rename(path, newName);
    if (newPath) {
      if (monacoEditor) monacoEditor.renameFile(path, newPath, newName);
      if (fileTabs) fileTabs.renamePath(path, newPath, newName);
      if (fileTree) fileTree.refresh();
      this._ctx.emit('statusChange', '已重命名: ' + newName);

      // 实时同步到磁盘：重命名对应文件/目录
      const currentNodeId = this._ctx.currentNodeId;
      if (currentNodeId) {
        const projectFolderPath = this._getProjectFolderPath();
        vfs.renameSingleFileOnDisk(projectFolderPath, currentNodeId, path, newPath).then((ok) => {
          if (ok) {
            const node = appState.nodeMap.get(currentNodeId);
            if (node) node.fileSystem = vfs.toJSON();
            console.log(`[实时同步] 已重命名磁盘文件: ${path} → ${newPath}`);
          }
        });
      }
    }
  }

  /**
   * 创建新文件或目录。
   * @param {string} dirPath
   * @param {string} name
   * @param {'file'|'directory'} type
   */
  onFileCreate(dirPath, name, type) {
    const vfs = this._ctx.vfs;
    const fileTree = this._ctx.fileTree;

    if (!vfs) return;

    if (type === 'file') {
      const file = vfs.createFile(dirPath || '', name);
      if (file && fileTree) {
        fileTree.refresh();
        this.openFileInEditor(file.path);

        // 实时同步到磁盘：写入新创建的文件
        const currentNodeId = this._ctx.currentNodeId;
        if (currentNodeId) {
          const projectFolderPath = this._getProjectFolderPath();
          vfs.writeSingleFileToDisk(projectFolderPath, currentNodeId, file.path).then((ok) => {
            if (ok) {
              const node = appState.nodeMap.get(currentNodeId);
              if (node) node.fileSystem = vfs.toJSON();
              console.log(`[实时同步] 已创建磁盘文件: ${file.path}`);
            }
          });
        }
      }
    } else {
      vfs.createDirectory(dirPath || '', name);
      if (fileTree) fileTree.refresh();

      // 创建目录没有单文件 IPC，使用全量同步
      const currentNodeId = this._ctx.currentNodeId;
      if (currentNodeId) {
        const projectFolderPath = this._getProjectFolderPath();
        vfs.syncAllToDisk(projectFolderPath, currentNodeId).then((ok) => {
          if (ok) {
            const node = appState.nodeMap.get(currentNodeId);
            if (node) node.fileSystem = vfs.toJSON();
            console.log(`[实时同步] 已创建磁盘目录: ${name}`);
          }
        });
      }
    }
  }

  /**
   * 文件系统变更回调（粘贴/拖拽等批量操作后触发）。
   * 执行全量磁盘同步，确保磁盘文件与 VFS 一致。
   */
  onFileSystemChange() {
    const currentNodeId = this._ctx.currentNodeId;
    const vfs = this._ctx.vfs;
    if (!currentNodeId || !vfs) return;

    const projectFolderPath = this._getProjectFolderPath();
    vfs.syncAllToDisk(projectFolderPath, currentNodeId).then((ok) => {
      if (ok) {
        // 更新内存中的节点数据
        const node = appState.nodeMap.get(currentNodeId);
        if (node) node.fileSystem = vfs.toJSON();
        console.log('[实时同步] 文件系统变更已全量同步到磁盘');
      }
    });
  }

  // ---------------------------------------------------------------------------
  // 保存/导出
  // ---------------------------------------------------------------------------

  /**
   * 保存代码（同步 Monaco → VFS → 节点 → 磁盘）。
   */
  saveHtmlSource() {
    const currentNodeId = this._ctx.currentNodeId;
    if (!currentNodeId) {
      showToast('请先选择一个节点');
      return;
    }

    const node = appState.nodeMap.get(currentNodeId);
    if (!node) {
      showToast('节点不存在');
      return;
    }

    const vfs = this._ctx.vfs;
    const monacoEditor = this._ctx.monacoEditor;
    const history = this._ctx.history;

    // 同步 Monaco 内容到 VFS
    if (monacoEditor && vfs) {
      monacoEditor.syncAllToFS(vfs);
      // 同步第二编辑器内容
      const splitEditor = this._ctx.getModule('splitEditor');
      const editor2 = splitEditor?.monacoEditor2;
      if (editor2) {
        editor2.syncAllToFS(vfs);
        editor2.markAllSaved();
      }
      // 序列化 VFS 到节点
      node.fileSystem = vfs.toJSON();
      // 标记所有文件已保存
      monacoEditor.markAllSaved();
    }

    // 标记为代码模式
    node.activeMode = 'code';

    // 记录历史快照
    if (history) {
      history.recordAllFiles(vfs, 'manual');
      history.saveToNode(node);
    }

    // 触发保存
    saveCurrentProjectData();

    // 全量同步 sandbox 目录到磁盘（确保所有文件都写入磁盘）
    if (vfs) {
      const projectFolderPath = this._getProjectFolderPath();
      vfs.syncAllToDisk(projectFolderPath, currentNodeId).then((ok) => {
        if (ok) {
          console.log('[保存] sandbox 目录已全量同步到磁盘');
        }
      });
    }

    showToast('✅ 代码已保存');
    this._ctx.emit('statusChange', '已保存 ✓');
  }

  /**
   * 将预览内容同步回笔记（richText）。
   */
  syncToNote() {
    const currentNodeId = this._ctx.currentNodeId;
    if (!currentNodeId) return;

    const node = appState.nodeMap.get(currentNodeId);
    if (!node) return;

    const vfs = this._ctx.vfs;
    const monacoEditor = this._ctx.monacoEditor;

    if (monacoEditor && vfs) {
      monacoEditor.syncAllToFS(vfs);
    }

    let synced = false;
    try {
      const preview = this._ctx.preview;
      const previewDoc = preview ? preview.contentDocument : null;
      if (previewDoc && previewDoc.body) {
        node.content = previewDoc.body.innerHTML;
        synced = true;
      }
    } catch (e) {}

    if (!synced && vfs) {
      const entryPath = vfs.getEntryPoint();
      if (entryPath) {
        const content = vfs.getFileContent(entryPath);
        if (content) {
          node.content = content;
          synced = true;
        }
      }
    }

    if (synced) {
      saveCurrentProjectData();
      showToast('✅ 已同步到笔记内容');
    } else {
      showToast('⚠️ 没有可同步的内容');
    }
  }

  /**
   * 导出为 HTML 文件下载。
   */
  exportAsHtml() {
    const vfs = this._ctx.vfs;
    const monacoEditor = this._ctx.monacoEditor;

    if (monacoEditor && vfs) {
      monacoEditor.syncAllToFS(vfs);
    }
    if (!vfs) return;

    const fullHtml = vfs.buildSimpleHtml();
    const blob = new Blob([fullHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'exported.html';
    a.click();
    URL.revokeObjectURL(url);
    showToast('✅ 已导出为 HTML 文件');
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * 获取当前项目的文件夹路径。
   * @returns {string|null}
   */
  _getProjectFolderPath() {
    const proj = appState.projects?.find(p => p.id === appState.currentProjectId);
    return proj?.folderPath || null;
  }
}

export { SandboxFileOps };
console.log('[sandbox-file-ops] 模块已加载');
