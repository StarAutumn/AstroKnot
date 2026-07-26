// ============================================================
//  main/hmr.js — 热更新文件监听（仅开发模式）
// ============================================================
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const dataSettings = require('../data-settings');

let _hmrEnabled = true;  // HMR 开关（可通过标题栏滑动按钮控制）
let _mainWindow = null;

function setHmrEnabled(enabled) {
  _hmrEnabled = !!enabled;
  saveHMREnabled(_hmrEnabled);
  console.log(`[HMR] 热更新已${_hmrEnabled ? '开启' : '关闭'}`);
}

function isHmrEnabled() {
  return _hmrEnabled;
}

/**
 * 获取 HMR 配置文件路径
 */
function getHMRConfigPath() {
  const systemDir = dataSettings.getSystemDir();
  if (!systemDir) return null;
  return path.join(systemDir, 'hmr-config.json');
}

/**
 * 从磁盘加载 HMR 开关状态
 */
function loadHMREnabled() {
  const configPath = getHMRConfigPath();
  if (!configPath || !fs.existsSync(configPath)) return true;  // 默认开启
  try {
    const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return data.enabled !== false;  // 仅当明确设置为 false 时才关闭
  } catch {
    return true;
  }
}

/**
 * 保存 HMR 开关状态到磁盘
 */
function saveHMREnabled(enabled) {
  const configPath = getHMRConfigPath();
  if (!configPath) return;
  try {
    const systemDir = dataSettings.getSystemDir();
    if (!fs.existsSync(systemDir)) {
      fs.mkdirSync(systemDir, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify({ enabled }, null, 2), 'utf-8');
  } catch (e) {
    console.warn('[HMR] 保存配置失败:', e.message);
  }
}

/**
 * 热更新：文件监听（仅开发模式）
 */
function startHMR(mainWindow) {
  _mainWindow = mainWindow;
  if (app.isPackaged) return;  // 打包后不监听

  // 加载持久化的 HMR 开关状态
  _hmrEnabled = loadHMREnabled();
  console.log(`[HMR] 启动时状态: ${_hmrEnabled ? '开启' : '关闭'}`);

  const rootDir = path.resolve(__dirname, '..');
  const watchDirs = ['modules', 'style'];
  const watchFiles = ['index.html', 'AstroKnot.js'];
  const debounceTimers = new Map();

  function sendHMR(filePath, type) {
    if (!_mainWindow || _mainWindow.isDestroyed()) return;
    if (!_hmrEnabled) return;  // HMR 已关闭
    console.log('[HMR] 文件变更:', filePath);
    _mainWindow.webContents.send('hot-update', { type, filePath });
  }

  function onFileChange(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const type = ext === '.css' ? 'css' : 'js';
    // 防抖：同一文件 200ms 内只触发一次
    const key = type + ':' + filePath;
    if (debounceTimers.has(key)) clearTimeout(debounceTimers.get(key));
    debounceTimers.set(key, setTimeout(() => {
      debounceTimers.delete(key);
      sendHMR(filePath, type);
    }, 200));
  }

  // 监听子目录
  for (const dir of watchDirs) {
    const fullDir = path.join(rootDir, dir);
    if (!fs.existsSync(fullDir)) continue;
    try {
      fs.watch(fullDir, { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        const filePath = path.join(dir, filename).replace(/\\/g, '/');
        if (filename.endsWith('.js') || filename.endsWith('.css')) {
          onFileChange(filePath);
        }
      });
    } catch (e) {
      console.warn('[HMR] 无法监听目录:', fullDir, e.message);
    }
  }

  // 监听根目录文件
  for (const file of watchFiles) {
    const fullPath = path.join(rootDir, file);
    if (!fs.existsSync(fullPath)) continue;
    try {
      fs.watch(fullPath, (eventType) => {
        onFileChange(file);
      });
    } catch (e) {
      console.warn('[HMR] 无法监听文件:', fullPath, e.message);
    }
  }

  // ── 监听主进程文件变更：自动重启 Electron ──
  // main.js / preload.js 修改后需要重启主进程才能生效
  const mainProcessFiles = ['main.js', 'preload.js', 'data-settings.js'];
  let _restarting = false;
  for (const file of mainProcessFiles) {
    const fullPath = path.join(rootDir, file);
    if (!fs.existsSync(fullPath)) continue;
    try {
      fs.watch(fullPath, () => {
        if (_restarting) return;
        if (!_hmrEnabled) return;  // HMR 已关闭
        _restarting = true;
        console.log(`[HMR] 主进程文件变更: ${file}，正在重启...`);
        // 延迟 300ms 避免连续多次触发（如编辑器保存）
        setTimeout(() => {
          app.relaunch();
          app.exit(0);
        }, 300);
      });
    } catch (e) {
      console.warn('[HMR] 无法监听主进程文件:', fullPath, e.message);
    }
  }

  console.log('[HMR] 文件监听已启动');
}

module.exports = { startHMR, setHmrEnabled, isHmrEnabled };
