// ============================================================
//  data-settings.js — 数据目录配置管理
//  管理 AstroKnot 的数据存储位置：
//    - system/     系统数据（应急备份、临时沙盒、版本图临时数据）
//    - projects/   用户项目（默认）
//    - quicknotes/ 快速笔记（默认）
//  
//  首次启动时引导用户选择数据目录位置，
//  之后配置保存在 settings.json 中。
// ============================================================

const fs = require('fs');
const path = require('path');

// ════════════════════════════════════════════════════════════
//  默认目录结构
// ════════════════════════════════════════════════════════════

/**
 * 默认数据目录名
 */
const DEFAULT_DATA_DIR_NAME = 'AstroKnot-Data';

/**
 * 子目录名称
 */
const SUBDIR_NAMES = {
  system: 'system',           // 系统数据（替代 C:\Users\...\AppData\Roaming\astroknot）
  projects: 'projects',       // 用户项目（默认）
  quicknotes: 'quicknotes'    // 快速笔记（默认）
};

/**
 * 系统数据子目录名称
 */
const SYSTEM_SUBDIR_NAMES = {
  sandboxTmp: 'sandbox-tmp',
  versionGraphsTmp: 'version-graphs-tmp',
  emergencyBackups: 'emergency-backups',
  settings: 'settings.json'
};

// ════════════════════════════════════════════════════════════
//  配置结构
// ════════════════════════════════════════════════════════════

/**
 * @typedef DataSettings
 * @property {string} dataRoot        数据根目录（包含 system/projects/quicknotes）
 * @property {string} systemDir       系统数据目录（可自定义，默认在 dataRoot/system）
 * @property {string} projectsDir     项目目录（可自定义，默认在 dataRoot/projects）
 * @property {string} quicknotesDir   快速笔记目录（可自定义，默认在 dataRoot/quicknotes）
 * @property {boolean} initialized    是否已完成首次设置引导
 * @property {string} lastProjectPath 上次打开的项目路径
 */

/** @type {DataSettings|null} */
let _settings = null;

/** @type {string|null} 应用安装目录 */
let _appRoot = null;

// ════════════════════════════════════════════════════════════
//  初始化
// ════════════════════════════════════════════════════════════

/**
 * 初始化数据目录设置
 * @param {string} appRoot - 应用安装目录（通常是 main.js 所在目录）
 * @returns {DataSettings}
 */
function init(appRoot) {
  _appRoot = appRoot;

  // 尝试加载现有配置
  const legacySettingsPath = getLegacySettingsPath();
  const newSettingsPath = getNewSettingsPath();

  // 检查是否存在旧配置（C 盘 userData）
  if (fs.existsSync(legacySettingsPath)) {
    try {
      const legacySettings = JSON.parse(fs.readFileSync(legacySettingsPath, 'utf-8'));
      if (legacySettings.dataRoot) {
        // 已有配置，使用旧配置的路径
        _settings = legacySettings;
        console.log('[data-settings] 使用现有配置:', _settings.dataRoot);
        return _settings;
      }
    } catch (e) {
      console.warn('[data-settings] 读取旧配置失败:', e);
    }
  }

  // 检查是否存在新配置（应用目录下）
  if (fs.existsSync(newSettingsPath)) {
    try {
      _settings = JSON.parse(fs.readFileSync(newSettingsPath, 'utf-8'));
      console.log('[data-settings] 使用新配置:', _settings.dataRoot);
      return _settings;
    } catch (e) {
      console.warn('[data-settings] 读取新配置失败:', e);
    }
  }

  // 没有配置，使用默认路径（应用目录下）
  const defaultDataRoot = path.join(appRoot, DEFAULT_DATA_DIR_NAME);
  _settings = {
    dataRoot: defaultDataRoot,
    systemDir: path.join(defaultDataRoot, SUBDIR_NAMES.system),
    projectsDir: path.join(defaultDataRoot, SUBDIR_NAMES.projects),
    quicknotesDir: path.join(defaultDataRoot, SUBDIR_NAMES.quicknotes),
    initialized: false,
    lastProjectPath: null
  };

  console.log('[data-settings] 使用默认配置:', _settings.dataRoot);
  return _settings;
}

/**
 * 获取旧配置路径（C 盘 userData）
 */
function getLegacySettingsPath() {
  // 这个函数在渲染进程中不适用，主进程需要传入 userData 路径
  // 临时返回一个占位路径
  return path.join(process.env.APPDATA || '', 'astroknot', 'settings.json');
}

/**
 * 获取新配置路径（应用目录下）
 */
function getNewSettingsPath() {
  if (!_appRoot) return '';
  return path.join(_appRoot, DEFAULT_DATA_DIR_NAME, SUBDIR_NAMES.system, SYSTEM_SUBDIR_NAMES.settings);
}

// ════════════════════════════════════════════════════════════
//  配置保存/加载
// ════════════════════════════════════════════════════════════

/**
 * 保存配置到磁盘
 */
function saveSettings() {
  if (!_settings || !_appRoot) return false;

  try {
    // 确保系统目录存在
    const systemDir = _settings.systemDir;
    if (!fs.existsSync(systemDir)) {
      fs.mkdirSync(systemDir, { recursive: true });
    }

    // 保存配置
    const settingsPath = path.join(systemDir, SYSTEM_SUBDIR_NAMES.settings);
    fs.writeFileSync(settingsPath, JSON.stringify(_settings, null, 2), 'utf-8');
    console.log('[data-settings] 配置已保存:', settingsPath);
    return true;
  } catch (e) {
    console.error('[data-settings] 保存配置失败:', e);
    return false;
  }
}

/**
 * 获取当前配置
 */
function getSettings() {
  return _settings;
}

// ════════════════════════════════════════════════════════════
//  路径获取 API
// ════════════════════════════════════════════════════════════

/**
 * 获取系统数据目录（替代 app.getPath('userData')）
 */
function getSystemDir() {
  return _settings ? _settings.systemDir : '';
}

/**
 * 获取项目目录（默认）
 */
function getProjectsDir() {
  return _settings ? _settings.projectsDir : '';
}

/**
 * 获取快速笔记目录
 */
function getQuicknotesDir() {
  return _settings ? _settings.quicknotesDir : '';
}

/**
 * 获取应急备份目录
 */
function getEmergencyBackupsDir() {
  if (!_settings) return '';
  return path.join(_settings.systemDir, SYSTEM_SUBDIR_NAMES.emergencyBackups);
}

/**
 * 获取沙盒临时文件目录
 * @param {string} nodeId - 节点 ID
 */
function getSandboxTmpDir(nodeId) {
  if (!_settings || !nodeId) return '';
  return path.join(_settings.systemDir, SYSTEM_SUBDIR_NAMES.sandboxTmp, nodeId, 'sandbox');
}

/**
 * 获取版本图临时数据目录
 * @param {string} projectId - 项目 ID
 */
function getVersionGraphsTmpDir(projectId) {
  if (!_settings || !projectId) return '';
  return path.join(_settings.systemDir, SYSTEM_SUBDIR_NAMES.versionGraphsTmp, projectId);
}

/**
 * 获取数据根目录
 */
function getDataRoot() {
  return _settings ? _settings.dataRoot : '';
}

/**
 * 获取应用安装目录
 */
function getAppRoot() {
  return _appRoot;
}

// ════════════════════════════════════════════════════════════
//  配置修改 API
// ════════════════════════════════════════════════════════════

/**
 * 设置数据根目录（首次启动引导使用）
 * @param {string} dataRoot - 用户选择的数据根目录
 */
function setDataRoot(dataRoot) {
  if (!dataRoot) {
    console.error('[data-settings] 数据根目录路径为空');
    return false;
  }

  // 如果目录不存在，创建它
  if (!fs.existsSync(dataRoot)) {
    try {
      fs.mkdirSync(dataRoot, { recursive: true });
      console.log('[data-settings] 创建数据根目录:', dataRoot);
    } catch (e) {
      console.error('[data-settings] 创建数据根目录失败:', e);
      return false;
    }
  }

  _settings = {
    dataRoot: dataRoot,
    systemDir: path.join(dataRoot, SUBDIR_NAMES.system),
    projectsDir: path.join(dataRoot, SUBDIR_NAMES.projects),
    quicknotesDir: path.join(dataRoot, SUBDIR_NAMES.quicknotes),
    initialized: true,
    lastProjectPath: null
  };

  // 创建子目录结构
  ensureDirectories();

  // 保存配置
  saveSettings();

  console.log('[data-settings] 数据根目录已设置:', dataRoot);
  return true;
}

/**
 * 设置单独的目录路径（用户自定义）
 * @param {Object} paths - { systemDir?, projectsDir?, quicknotesDir? }
 */
function setCustomPaths(paths) {
  if (!_settings) return false;

  if (paths.systemDir) _settings.systemDir = paths.systemDir;
  if (paths.projectsDir) _settings.projectsDir = paths.projectsDir;
  if (paths.quicknotesDir) _settings.quicknotesDir = paths.quicknotesDir;

  ensureDirectories();
  saveSettings();

  return true;
}

/**
 * 确保所有目录存在
 */
function ensureDirectories() {
  if (!_settings) return;

  const dirs = [
    _settings.systemDir,
    path.join(_settings.systemDir, SYSTEM_SUBDIR_NAMES.sandboxTmp),
    path.join(_settings.systemDir, SYSTEM_SUBDIR_NAMES.versionGraphsTmp),
    path.join(_settings.systemDir, SYSTEM_SUBDIR_NAMES.emergencyBackups),
    _settings.projectsDir,
    _settings.quicknotesDir
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log('[data-settings] 创建目录:', dir);
    }
  }
}

/**
 * 检查是否已完成首次设置
 */
function isInitialized() {
  return _settings ? _settings.initialized : false;
}

/**
 * 设置上次打开的项目路径
 */
function setLastProjectPath(projectPath) {
  if (!_settings) return;
  _settings.lastProjectPath = projectPath;
  saveSettings();
}

/**
 * 获取上次打开的项目路径
 */
function getLastProjectPath() {
  return _settings ? _settings.lastProjectPath : null;
}

// ════════════════════════════════════════════════════════════
//  导出
// ════════════════════════════════════════════════════════════

module.exports = {
  init,
  saveSettings,
  getSettings,
  getSystemDir,
  getProjectsDir,
  getQuicknotesDir,
  getEmergencyBackupsDir,
  getSandboxTmpDir,
  getVersionGraphsTmpDir,
  getDataRoot,
  getAppRoot,
  setDataRoot,
  setCustomPaths,
  ensureDirectories,
  isInitialized,
  setLastProjectPath,
  getLastProjectPath,
  // 常量导出
  DEFAULT_DATA_DIR_NAME,
  SUBDIR_NAMES,
  SYSTEM_SUBDIR_NAMES
};

console.log('[data-settings] 模块已加载');