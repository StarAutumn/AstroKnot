import { appState } from '../../module0_AppState.js';
import { VirtualFileSystem, migrateHtmlSource } from './core/virtual-fs.js';
import { FileTreeComponent } from './editors/file-tree.js';
import { FileTabsComponent } from './editors/tabs.js';
import { SandboxMonacoEditor } from './editors/monaco-editor.js';
import { SandboxHistory } from './features/history.js';
import { SandboxSearch } from './editors/search.js';
import { SandboxTerminal } from './editors/terminal.js';
import { SandboxConsole } from './panels/console.js';
import { SandboxAutoRun } from './features/auto-run.js';
import { SandboxPreview } from './panels/preview.js';
import { SandboxCommands } from './features/commands.js';
import { SandboxMenuBar } from './layout/menubar.js';
import { SandboxActivityBar } from './layout/activity-bar.js';
import { SandboxStatusBar } from './layout/statusbar.js';
import { SandboxSettings } from './features/settings.js';
import { SandboxBreadcrumb } from './layout/breadcrumb.js';
import { SandboxImagePreview } from './panels/image-preview.js';
import { SandboxMarkdownPreview } from './panels/markdown-preview.js';
import { SandboxSplitEditor } from './panels/split-editor.js';
import { SandboxTemplateHistory } from './features/template-history.js';
import { SandboxResize } from './layout/resize.js';
import { SandboxFileOps } from './features/file-ops.js';
import { SandboxGithubImport } from './panels/github-import.js';
import { S, AUTO_RUN_DEBOUNCE, AUTO_SAVE_DELAY } from './state.js';
import { _initIDEComponents, _setStatus, _openFileInEditor, _onFileSelect, _onOpenFileLocation, _onFileDelete, _onFileRename, _onFileCreate, _onFileSystemChange, _getProjectFolderPath } from './ide-components.js';
import { _hideWelcomePage } from './container-mode.js';

// ════════════════════════════════════════════════════════════
//  真实文件系统操作（打开电脑任意文件夹）
// ════════════════════════════════════════════════════════════

/**
 * 绑定"打开文件夹"按钮
 */
export function _bindOpenFolderBtn() {
  const btn = S._modal?.querySelector('#ideOpenFolderBtn');
  if (btn) btn.addEventListener('click', () => _openRealFolder());
  // 标题栏双击打开文件夹
  const titleEl = S._modal?.querySelector('#htmlSandboxTitle');
  if (titleEl) {
    titleEl.style.cursor = 'pointer';
    titleEl.title = '点击打开文件夹';
    titleEl.addEventListener('click', () => _openRealFolder());
  }
  // 欢迎页按钮
  const welcomeOpenBtn = S._modal?.querySelector('#welcomeOpenFolder');
  const welcomeNewBtn = S._modal?.querySelector('#welcomeNewFile');
  if (welcomeOpenBtn) welcomeOpenBtn.addEventListener('click', () => _openRealFolder());
  if (welcomeNewBtn) welcomeNewBtn.addEventListener('click', () => _createNewFileInWelcome());
}

/**
 * 打开文件夹对话框 → 加载真实目录到 VFS
 */
export async function _openRealFolder() {
  if (!window.api?.ideSelectFolder) return;
  const folderPath = await window.api.ideSelectFolder();
  if (!folderPath) return;

  try {
    S._workspacePath = folderPath;
    S._isRealFS = true;
    S._ctx.workspacePath = folderPath;
    S._ctx.isRealFS = true;
    S._ctx.reloadWorkspace = () => _openFolderAtPath(folderPath);

    // 更新标题栏
    const folderName = folderPath.split(/[\\/]/).pop();
    if (S._nodeName) S._nodeName.textContent = folderPath;
    const titleEl = S._modal?.querySelector('#htmlSandboxTitle');
    if (titleEl) titleEl.textContent = '📁 ' + folderName;

    // 读取目录树
    const dirTree = await window.api.ideReadDirTree(folderPath);
    console.log('[IDE] 目录树:', JSON.stringify(dirTree).substring(0, 200));

    // 转换为 VFS 格式
    const vfsData = await _dirTreeToVFS(dirTree, folderPath);
    console.log('[IDE] VFS 根节点子项数:', vfsData.children?.length || 0);

    S._vfs = new VirtualFileSystem(vfsData);
    S._vfs.toggleExpanded('/');  // 只展开根目录，子文件夹默认折叠
    S._ctx.vfs = S._vfs;

    // 刷新文件树
    const treeContainer = S._modal?.querySelector('#sandboxFileTreeContainer');
    console.log('[IDE] treeContainer:', !!treeContainer, '_fileTree:', !!S._fileTree);
    if (treeContainer && S._fileTree) {
      treeContainer.innerHTML = '';
      S._fileTree = new FileTreeComponent(treeContainer, S._vfs, {
        onFileSelect: (filePath) => _onFileSelect(filePath),
        onFileCreate: (dirPath, name, type) => _onFileCreate(dirPath, name, type),
        onFileDelete: (path, isDir) => _onFileDelete(path, isDir),
        onFileRename: (path, newName) => _onFileRename(path, newName),
        onFileSystemChange: () => _onFileSystemChange(),
        onOpenFileLocation: (filePath) => _onOpenFileLocation(filePath),
      });
      S._fileTree.render();
    }
    S._ctx.fileTree = S._fileTree;

    // 关闭所有已打开的标签
    if (S._fileTabs) {
      S._fileTabs.closeAll();
    }
    // 关闭所有 Monaco 编辑器文件
    if (S._monacoEditor && S._monacoEditor._models) {
      for (const fp of [...S._monacoEditor._models.keys()]) {
        S._monacoEditor.closeFile(fp);
      }
    }

  console.log('[IDE] 已打开文件夹:', folderPath);
    _hideWelcomePage();
  } catch (e) {
    console.error('[IDE] 打开文件夹失败:', e);
  }
}

/**
 * 导入本地文件夹（智能双模式：真实 FS 模式直接复制到工作区；VFS 模式读取文件列表写入 VFS）
 * 导入是复制操作，不会移动源文件；重名目录自动加 -2/-3 后缀，不覆盖。
 */
export async function _importLocalFolder() {
  if (!window.api?.ideImportLocalFolder) {
    if (window.showToast) window.showToast('导入功能不可用（API 未就绪）', 'warning');
    return;
  }

  // 真实 FS 模式：直接复制到当前工作区目录
  if (S._isRealFS && S._workspacePath) {
    try {
      const result = await window.api.ideImportLocalFolder(S._workspacePath);
      if (!result) return; // 用户取消
      if (result.error) {
        if (window.showToast) window.showToast('导入失败：' + result.error, 'error');
        return;
      }
      if (result.copied) {
        // 刷新工作区以显示新文件
        if (typeof S._ctx.reloadWorkspace === 'function') {
          await S._ctx.reloadWorkspace();
        }
        if (window.showToast) window.showToast(`✅ 已导入 ${result.fileCount} 个文件到当前工作区`, 'success');
      }
    } catch (e) {
      console.error('[IDE] 导入本地文件夹失败:', e);
      if (window.showToast) window.showToast('导入失败：' + e.message, 'error');
    }
    return;
  }

  // VFS 模式：读取文件列表写入 VFS
  if (S._vfs) {
    try {
      const result = await window.api.ideImportLocalFolder();
      if (!result) return; // 用户取消
      if (result.error) {
        if (window.showToast) window.showToast('导入失败：' + result.error, 'warning');
        return;
      }
      if (result.files) {
        await _importLocalToVFS(result.files);
      }
    } catch (e) {
      console.error('[IDE] 导入本地文件夹到 VFS 失败:', e);
      if (window.showToast) window.showToast('导入失败：' + e.message, 'error');
    }
    return;
  }

  if (window.showToast) window.showToast('请先打开一个文件夹或节点', 'warning');
}

/**
 * 将本地文件夹「内容」直接铺到 VFS 根目录（不建子目录，重名文件加 -2/-3，不覆盖）
 * @param {Array<{path:string,content:string,isBinary:boolean}>} files - 文件列表（path 为相对源文件夹的路径）
 */
async function _importLocalToVFS(files) {
  let succeeded = 0;
  let failed = 0;
  for (const { path: relativePath, content, isBinary } of files) {
    try {
      // 直接用相对路径作为 VFS 路径（铺到根，不加子目录前缀）
      const fullPath = relativePath;
      // 确保父目录存在（同名目录已存在则合并内容，不覆盖）
      const lastSlash = fullPath.lastIndexOf('/');
      if (lastSlash > 0) {
        _ensureDirInVFS(S._vfs, fullPath.substring(0, lastSlash));
      }
      const fileName = fullPath.split('/').pop();
      const dirPart = lastSlash > 0 ? fullPath.substring(0, lastSlash) : '';

      // 重名文件处理
      let finalPath = fullPath;
      if (S._vfs.getFile(fullPath)) {
        let idx = 1;
        const dotIdx = fileName.lastIndexOf('.');
        const base = dotIdx > 0 ? fileName.substring(0, dotIdx) : fileName;
        const ext = dotIdx > 0 ? fileName.substring(dotIdx) : '';
        let newName = `${base}-${idx}${ext}`;
        let newPath = dirPart ? `${dirPart}/${newName}` : newName;
        while (S._vfs.getFile(newPath)) {
          idx++;
          newName = `${base}-${idx}${ext}`;
          newPath = dirPart ? `${dirPart}/${newName}` : newName;
        }
        finalPath = newPath;
      }

      const finalName = finalPath.split('/').pop();
      const finalDir = finalPath.includes('/') ? finalPath.substring(0, finalPath.lastIndexOf('/')) : '';
      const file = S._vfs.createFile(finalDir, finalName);
      if (file) {
        if (isBinary) {
          S._vfs.setBinaryFile(finalPath, content);
        } else {
          file.content = content;
        }
        succeeded++;
      }
    } catch (err) {
      failed++;
      console.warn('[IDE] 导入跳过文件:', relativePath, err.message);
    }
  }

  // 同步到磁盘（仅真实节点模式，非 ide-app-project 临时模式）
  if (S._currentNodeId && S._currentNodeId !== 'ide-app-project') {
    const node = appState.nodeMap.get(S._currentNodeId);
    if (node) {
      try {
        await S._vfs.syncAllToDisk(_getProjectFolderPath(), S._currentNodeId);
        node.fileSystem = S._vfs.toJSON();
      } catch (syncErr) {
        console.error('[IDE] 磁盘同步异常:', syncErr);
      }
    }
  }

  // 刷新 UI
  if (S._fileTree) S._fileTree.refresh();
  _onFileSystemChange();
  const tip = failed ? `✅ 已导入 ${succeeded} 个文件到当前工作区（${failed} 个失败）` : `✅ 已导入 ${succeeded} 个文件到当前工作区`;
  if (window.showToast) window.showToast(tip, 'success');
}

/**
 * 在 VFS 中递归创建目录（内联辅助，源自 github-import.js 的 _ensureDir）
 */
function _ensureDirInVFS(vfs, dirPath) {
  if (vfs._dirs.has(dirPath)) return;
  const parts = dirPath.split('/');
  let cur = '';
  for (const p of parts) {
    cur = cur ? `${cur}/${p}` : p;
    if (!vfs._dirs.has(cur)) {
      const parent = cur.includes('/') ? cur.substring(0, cur.lastIndexOf('/')) : '';
      const name = cur.includes('/') ? cur.substring(cur.lastIndexOf('/') + 1) : cur;
      vfs.createDirectory(parent, name);
    }
  }
}

/**
 * 直接加载指定路径的文件夹（不弹出对话框）
 * @param {string} folderPath - 绝对路径
 */
export async function _openFolderAtPath(folderPath) {
  if (!folderPath) return;

  try {
    S._workspacePath = folderPath;
    S._isRealFS = true;
    S._ctx.workspacePath = folderPath;
    S._ctx.isRealFS = true;
    S._ctx.reloadWorkspace = () => _openFolderAtPath(folderPath);

    // 更新标题栏
    const folderName = folderPath.split(/[\\/]/).pop();
    if (S._nodeName) S._nodeName.textContent = folderPath;
    const titleEl = S._modal?.querySelector('#htmlSandboxTitle');
    if (titleEl) titleEl.textContent = '📁 ' + folderName;

    // 读取目录树
    const dirTree = await window.api.ideReadDirTree(folderPath);
    console.log('[IDE] 自动加载目录树:', JSON.stringify(dirTree).substring(0, 200));

    // 转换为 VFS 格式
    const vfsData = await _dirTreeToVFS(dirTree, folderPath);
    console.log('[IDE] VFS 根节点子项数:', vfsData.children?.length || 0);

    S._vfs = new VirtualFileSystem(vfsData);
    S._vfs.toggleExpanded('/');  // 只展开根目录，子文件夹默认折叠
    S._ctx.vfs = S._vfs;

    // 刷新文件树
    const treeContainer = S._modal?.querySelector('#sandboxFileTreeContainer');
    if (treeContainer && S._fileTree) {
      treeContainer.innerHTML = '';
      S._fileTree = new FileTreeComponent(treeContainer, S._vfs, {
        onFileSelect: (fp) => _onFileSelect(fp),
        onFileCreate: (dirPath, name, type) => _onFileCreate(dirPath, name, type),
        onFileDelete: (path, isDir) => _onFileDelete(path, isDir),
        onFileRename: (path, newName) => _onFileRename(path, newName),
        onFileSystemChange: () => _onFileSystemChange(),
        onOpenFileLocation: (filePath) => _onOpenFileLocation(filePath),
      });
      S._fileTree.render();
    }
    S._ctx.fileTree = S._fileTree;

    // 关闭所有已打开的标签
    if (S._fileTabs) S._fileTabs.closeAll();
    if (S._monacoEditor && S._monacoEditor._models) {
      for (const fp of [...S._monacoEditor._models.keys()]) {
        S._monacoEditor.closeFile(fp);
      }
    }

    console.log('[IDE] 已自动加载文件夹:', folderPath);
    _hideWelcomePage();
  } catch (e) {
    console.error('[IDE] 自动加载文件夹失败:', e);
  }
}

/**
 * 将真实目录树转为 VFS 格式
 * @param {Object} dirTree - { children: { name: { children: {} } } }
 * @param {string} basePath - 基础路径（用于读取目录内容）
 * @returns {Object} VFS 格式 { name: '/', type: 'directory', children: [...] }
 */
async function _dirTreeToVFS(dirTree, basePath) {
  const root = { name: '/', type: 'directory', children: [] };

  async function buildChildren(parentNode, dirPath, children) {
    const items = await window.api.ideReadDir(dirPath);
    // 排序：文件夹在前，字母序
    items.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    for (const item of items) {
      if (item.name.startsWith('.') || item.name === 'node_modules') continue;
      const childPath = `${dirPath}/${item.name}`;
      if (item.type === 'directory') {
        const dirNode = { name: item.name, type: 'directory', children: [] };
        // 检查是否在目录树中（有子目录）
        const hasChildren = children && children[item.name];
        if (hasChildren) {
          await buildChildren(dirNode, childPath, children[item.name].children);
        } else {
          // 空目录或只有文件的目录
          try {
            const subItems = await window.api.ideReadDir(childPath);
            for (const sub of subItems) {
              if (sub.type === 'directory' && !sub.name.startsWith('.') && sub.name !== 'node_modules') {
                dirNode.children.push({ name: sub.name, type: 'directory', children: [] });
              }
            }
          } catch (e) { /* 忽略 */ }
        }
        parentNode.children.push(dirNode);
      } else {
        parentNode.children.push({ name: item.name, type: 'file' });
      }
    }
  }

  await buildChildren(root, basePath, dirTree.children || {});
  return root;
}

/**
 * 从真实磁盘读取文件内容
 * @param {string} filePath - VFS 路径（如 /index.html）
 * @returns {Promise<Object>} { type, content, dataUrl }
 */
export async function _realReadFile(filePath) {
  if (!S._workspacePath) return null;
  const sep = S._workspacePath.endsWith('/') || S._workspacePath.endsWith('\\') ? '' : '/';
  const absPath = S._workspacePath + sep + filePath;
  return await window.api.ideReadFile(absPath);
}

/**
 * 保存文件到真实磁盘
 * @param {string} filePath - VFS 路径
 * @param {string} content - 文件内容
 */
async function _realSaveFile(filePath, content) {
  if (!S._workspacePath) return;
  const sep = S._workspacePath.endsWith('/') || S._workspacePath.endsWith('\\') ? '' : '/';
  const absPath = S._workspacePath + sep + filePath;
  await window.api.ideWriteFile(absPath, content);
}

/**
 * 真实文件系统的文件操作（创建/删除/重命名）
 * 已迁移到 file-ops.js 中处理，此处不再重复绑定
 */
export function _bindRealFileOps() {
  // 文件操作已由 SandboxFileOps 根据 ctx.isRealFS 统一处理
}

/**
 * 绑定 Ctrl+S 保存到真实磁盘
 */
export function _bindRealSaveShortcut() {
  document.addEventListener('keydown', async (e) => {
    // Ctrl+S
    if ((e.ctrlKey || e.metaKey) && e.key === 's' && !e.shiftKey) {
      if (!S._isRealFS || !S._workspacePath || !S._monacoEditor || !S._vfs) return;
      e.preventDefault();
      e.stopPropagation();

      // 同步 Monaco 内容到 VFS
      S._monacoEditor.syncAllToFS(S._vfs);
      if (S._splitEditorModule && S._splitEditorModule.monacoEditor2) {
        S._splitEditorModule.monacoEditor2.syncAllToFS(S._vfs);
      }

      // 写入所有脏文件到真实磁盘
      let savedCount = 0;
      const allFiles = S._vfs.getFilePaths();
      for (const filePath of allFiles) {
        const file = S._vfs.getFile(filePath);
        if (file && file.isDirty) {
          // 跳过图片/二进制文件：其 content 是 dataUrl，写入磁盘会损坏原文件
          if (file.content && file.content.startsWith('data:')) {
            file.isDirty = false;
            continue;
          }
          try {
            await _realSaveFile(filePath, file.content);
            file.isDirty = false;
            savedCount++;
          } catch (e) {
            console.error('[IDE] 保存失败:', filePath, e);
          }
        }
      }

      // 标记已保存
      S._monacoEditor.markAllSaved();
      if (S._splitEditorModule && S._splitEditorModule.monacoEditor2) {
        S._splitEditorModule.monacoEditor2.markAllSaved();
      }

      if (savedCount > 0) {
        _setStatus(`已保存 ${savedCount} 个文件`);
      }
    }
  }, true); // capture: true 确保优先处理
}
