// ============================================================
//  ide/core/vfs-disk-sync.js — VFS 实时磁盘同步（增量写入）
//  职责：writeSingleFileToDisk / deleteSingleFileFromDisk /
//  renameSingleFileOnDisk / syncAllToDisk——通过 window.api 将虚拟文件
//  系统的变更写入磁盘沙箱目录（依赖渲染进程，详见各方法 JSDoc）
//  以原型混入挂载到 VirtualFileSystem（见 virtual-fs.js 末尾 Object.assign），
//  方法体通过 this 访问实例状态，与写在 class 体内完全等价
//  依赖：appState（按节点 ID 查找节点对象），随磁盘同步逻辑自 virtual-fs.js 迁入
// ============================================================

import { appState } from '../../../module0_AppState.js';

export const diskSyncMethods = {
  // ── 实时磁盘同步（增量写入） ──
  // 注意：以下方法依赖 window.api，仅在渲染进程可用时生效

  /**
   * 写入单个文件到磁盘
   * @param {string|null} projectFolderPath - 项目文件夹路径（null 表示未保存项目，写入临时目录）
   * @param {string} nodeId - 节点 ID
   * @param {string} filePath - VFS 文件路径
   * @returns {Promise<boolean>}
   */
  async writeSingleFileToDisk(projectFolderPath, nodeId, filePath) {
    const file = this._files.get(filePath);
    if (!file) return false;
    if (!window.api || !window.api.writeSandboxFile) return false;

    // 获取节点对象
    const node = appState.nodeMap.get(nodeId);
    if (!node) {
      console.warn('[VFS] 未找到节点:', nodeId);
      return false;
    }

    try {
      const result = await window.api.writeSandboxFile(
        projectFolderPath,
        node,
        file.path,
        file.content,
        !!file.isBinary
      );

      if (result.success) {
        file.isDirty = false;  // 标记为已保存
        return true;
      }
      console.error('[VFS] 写入文件失败:', result.error);
      return false;
    } catch (err) {
      console.error('[VFS] 写入文件异常:', err);
      return false;
    }
  },

  /**
   * 删除磁盘上的单个文件
   * @param {string|null} projectFolderPath - 项目文件夹路径
   * @param {string} nodeId - 节点 ID
   * @param {string} filePath - VFS 文件路径
   * @returns {Promise<boolean>}
   */
  async deleteSingleFileFromDisk(projectFolderPath, nodeId, filePath) {
    if (!window.api || !window.api.deleteSandboxFile) return false;

    // 获取节点对象
    const node = appState.nodeMap.get(nodeId);
    if (!node) {
      console.warn('[VFS] 未找到节点:', nodeId);
      return false;
    }

    try {
      const result = await window.api.deleteSandboxFile(
        projectFolderPath,
        node,
        filePath
      );
      return result.success;
    } catch (err) {
      console.error('[VFS] 删除文件异常:', err);
      return false;
    }
  },

  /**
   * 重命名磁盘上的文件
   * @param {string|null} projectFolderPath - 项目文件夹路径
   * @param {string} nodeId - 节点 ID
   * @param {string} oldPath - 旧路径
   * @param {string} newPath - 新路径
   * @returns {Promise<boolean>}
   */
  async renameSingleFileOnDisk(projectFolderPath, nodeId, oldPath, newPath) {
    if (!window.api || !window.api.renameSandboxFile) return false;

    // 获取节点对象
    const node = appState.nodeMap.get(nodeId);
    if (!node) {
      console.warn('[VFS] 未找到节点:', nodeId);
      return false;
    }

    try {
      const result = await window.api.renameSandboxFile(
        projectFolderPath,
        node,
        oldPath,
        newPath
      );
      return result.success;
    } catch (err) {
      console.error('[VFS] 重命名文件异常:', err);
      return false;
    }
  },

  /**
   * 同步整个文件系统到磁盘（用于项目保存或全量同步）
   * @param {string|null} projectFolderPath - 项目文件夹路径
   * @param {string} nodeId - 节点 ID
   * @returns {Promise<boolean>}
   */
  async syncAllToDisk(projectFolderPath, nodeId) {
    if (!window.api || !window.api.syncSandboxDirectory) return false;

    // 获取节点对象
    const node = appState.nodeMap.get(nodeId);
    if (!node) {
      console.warn('[VFS] 未找到节点:', nodeId);
      return false;
    }

    try {
      const fileSystem = this.toJSON();
      const result = await window.api.syncSandboxDirectory(
        projectFolderPath,
        node,
        fileSystem
      );

      if (result.success) {
        // 标记所有文件为已保存
        for (const file of this._files.values()) {
          file.isDirty = false;
        }
        return true;
      }
      return false;
    } catch (err) {
      console.error('[VFS] 同步目录异常:', err);
      return false;
    }
  }
};
