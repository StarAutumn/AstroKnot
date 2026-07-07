// ============================================================
//  data-settings.js — 数据目录配置管理
//  管理 AstroKnot 的数据存储位置：
//    - system/     系统数据（应急备份、临时沙盒、版本图临时数据）
//    - projects/   用户项目（默认）
//    - quicknotes/ 快速笔记（默认）
//  
//  首次启动时引导用户选择数据目录位置，
//  之后配置保存在 settings.json 中。
//
//  支持应用移动后自动定位：存储相对路径 + 保存时的应用位置，
//  启动时检测位置变化，自动重新定位数据目录。
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
 * @property {string} dataRoot            数据根目录（包含 system/projects/quicknotes）
 * @property {string|null} dataRootRelative 数据根目录相对于应用目录的路径（用于移动后自动定位）
 * @property {string|null} appRootAtSave   保存配置时的应用目录位置（用于检测是否被移动）
 * @property {string} systemDir           系统数据目录（可自定义，默认在 dataRoot/system）
 * @property {string} projectsDir         项目目录（可自定义，默认在 dataRoot/projects）
 * @property {string} quicknotesDir       快速笔记目录（可自定义，默认在 dataRoot/quicknotes）
 * @property {boolean} initialized        是否已完成首次设置引导
 * @property {string|null} lastProjectPath 上次打开的项目路径
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
        // 已有配置，迁移到新格式（添加相对路径字段）
        _settings = migrateSettings(legacySettings, appRoot);
        console.log('[data-settings] 迁移旧配置:', _settings.dataRoot);
        return _settings;
      }
    } catch (e) {
      console.warn('[data-settings] 读取旧配置失败:', e);
    }
  }

  // 检查是否存在新配置（应用目录下）
  if (fs.existsSync(newSettingsPath)) {
    try {
      const loadedSettings = JSON.parse(fs.readFileSync(newSettingsPath, 'utf-8'));
      // 检查应用是否被移动，自动重新定位
      _settings = relocateIfNeeded(loadedSettings, appRoot);
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
    dataRootRelative: DEFAULT_DATA_DIR_NAME,
    appRootAtSave: appRoot,
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
 * 迁移旧配置到新格式（添加相对路径字段）
 * @param {Object} oldSettings - 旧配置对象
 * @param {string} appRoot - 当前应用目录
 * @returns {DataSettings}
 */
function migrateSettings(oldSettings, appRoot) {
  // 计算相对路径：如果数据目录在应用目录下，提取相对路径
  let dataRootRelative = DEFAULT_DATA_DIR_NAME;
  if (oldSettings.dataRoot && oldSettings.dataRoot.startsWith(appRoot)) {
    dataRootRelative = oldSettings.dataRoot.substring(appRoot.length + 1);
  } else if (oldSettings.dataRoot) {
    // 数据目录不在应用目录下，无法计算相对路径
    dataRootRelative = null;
  }

  return {
    ...oldSettings,
    dataRootRelative: dataRootRelative,
    appRootAtSave: appRoot,
    systemDir: oldSettings.systemDir || path.join(oldSettings.dataRoot, SUBDIR_NAMES.system),
    projectsDir: oldSettings.projectsDir || path.join(oldSettings.dataRoot, SUBDIR_NAMES.projects),
    quicknotesDir: oldSettings.quicknotesDir || path.join(oldSettings.dataRoot, SUBDIR_NAMES.quicknotes)
  };
}

/**
 * 检查应用是否被移动，如果是则重新定位数据目录
 * @param {DataSettings} settings - 已加载的配置
 * @param {string} currentAppRoot - 当前应用目录
 * @returns {DataSettings}
 */
function relocateIfNeeded(settings, currentAppRoot) {
  const savedAppRoot = settings.appRootAtSave;

  // 检查是否有相对路径信息
  if (settings.dataRootRelative) {
    // 使用相对路径计算新位置
    const newDataRoot = path.join(currentAppRoot, settings.dataRootRelative);

    // 检查应用是否被移动
    if (savedAppRoot && savedAppRoot !== currentAppRoot) {
      console.log('[data-settings] 应用已移动！从', savedAppRoot, '到', currentAppRoot);
      console.log('[data-settings] 数据目录自动更新为:', newDataRoot);

      // 检查数据目录是否存在于新位置
      if (fs.existsSync(newDataRoot)) {
        // 更新所有路径
        const relocated = {
          ...settings,
          dataRoot: newDataRoot,
          appRootAtSave: currentAppRoot,
          systemDir: path.join(newDataRoot, SUBDIR_NAMES.system),
          projectsDir: path.join(newDataRoot, SUBDIR_NAMES.projects),
          quicknotesDir: path.join(newDataRoot, SUBDIR_NAMES.quicknotes)
        };
        // 临时设置 _settings 以便 saveSettings 能工作
        _settings = relocated;
        saveSettings();
        return relocated;
      } else {
        console.warn('[data-settings] 数据目录在新位置不存在:', newDataRoot);
        // 数据目录不存在，可能用户只移动了应用没移动数据目录
        // 检查旧位置的目录是否还存在
        if (settings.dataRoot && fs.existsSync(settings.dataRoot)) {
          console.log('[data-settings] 旧数据目录仍存在，继续使用:', settings.dataRoot);
          return settings;
        }
        // 否则标记为未初始化，重新引导
        console.warn('[data-settings] 数据目录丢失，需要重新设置');
        settings.initialized = false;
        return settings;
      }
    }
  }

  // 没有相对路径信息或应用没移动，检查绝对路径是否有效
  if (settings.dataRoot && !fs.existsSync(settings.dataRoot)) {
    console.warn('[data-settings] 数据目录不存在:', settings.dataRoot);
    // 尝试用默认相对路径
    const defaultPath = path.join(currentAppRoot, DEFAULT_DATA_DIR_NAME);
    if (fs.existsSync(defaultPath)) {
      console.log('[data-settings] 使用默认数据目录:', defaultPath);
      return {
        ...settings,
        dataRoot: defaultPath,
        dataRootRelative: DEFAULT_DATA_DIR_NAME,
        appRootAtSave: currentAppRoot,
        systemDir: path.join(defaultPath, SUBDIR_NAMES.system),
        projectsDir: path.join(defaultPath, SUBDIR_NAMES.projects),
        quicknotesDir: path.join(defaultPath, SUBDIR_NAMES.quicknotes)
      };
    }
    settings.initialized = false;
  }

  return settings;
}

/**
 * 获取旧配置路径（C 盘 AppData）
 * 注意：app.setPath('userData') 已重定向，不能用 app.getPath('userData') 获取旧路径
 */
function getLegacySettingsPath() {
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
 * 每次保存时自动计算相对路径，确保移动后能自动定位
 */
function saveSettings() {
  if (!_settings || !_appRoot) return false;

  try {
    // 计算并保存相对路径（用于移动后自动定位）
    if (_settings.dataRoot && _settings.dataRoot.startsWith(_appRoot)) {
      _settings.dataRootRelative = _settings.dataRoot.substring(_appRoot.length + 1);
    } else if (!_settings.dataRootRelative) {
      // 数据目录不在应用目录下，无法计算相对路径
      _settings.dataRootRelative = null;
    }
    _settings.appRootAtSave = _appRoot;

    // 确保系统目录存在
    const systemDir = _settings.systemDir;
    if (!fs.existsSync(systemDir)) {
      fs.mkdirSync(systemDir, { recursive: true });
    }

    // 保存配置
    const settingsPath = path.join(systemDir, SYSTEM_SUBDIR_NAMES.settings);
    fs.writeFileSync(settingsPath, JSON.stringify(_settings, null, 2), 'utf-8');
    console.log('[data-settings] 配置已保存:', settingsPath);
    console.log('[data-settings] 相对路径:', _settings.dataRootRelative);
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
 * 获取版本图临时数据的根目录（包含所有项目的子目录）
 */
function getVersionGraphsTmpRoot() {
  if (!_settings) return '';
  return path.join(_settings.systemDir, SYSTEM_SUBDIR_NAMES.versionGraphsTmp);
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
 * @returns {boolean} 是否成功
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
      if (e.code === 'EACCES' || e.code === 'EPERM') {
        console.error('[data-settings] 权限不足，请选择其他位置');
      }
      return false;
    }
  }

  // 检查目录是否可写
  try {
    const testFile = path.join(dataRoot, '.write_test');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
  } catch (e) {
    console.error('[data-settings] 目录不可写:', e);
    return false;
  }

  // 计算相对路径
  let dataRootRelative = null;
  if (dataRoot.startsWith(_appRoot)) {
    dataRootRelative = dataRoot.substring(_appRoot.length + 1);
  }

  _settings = {
    dataRoot: dataRoot,
    dataRootRelative: dataRootRelative,
    appRootAtSave: _appRoot,
    systemDir: path.join(dataRoot, SUBDIR_NAMES.system),
    projectsDir: path.join(dataRoot, SUBDIR_NAMES.projects),
    quicknotesDir: path.join(dataRoot, SUBDIR_NAMES.quicknotes),
    initialized: true,
    lastProjectPath: null
  };

  // 创建子目录结构
  try {
    ensureDirectories();
  } catch (e) {
    console.error('[data-settings] 创建子目录失败:', e);
    return false;
  }

  // 保存配置
  try {
    saveSettings();
  } catch (e) {
    console.error('[data-settings] 保存配置失败:', e);
    return false;
  }

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
  getVersionGraphsTmpRoot,
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
