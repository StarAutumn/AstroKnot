// ============================================================
//  DataSetup/index.js — 数据目录首次设置引导
//  首次启动时引导用户选择数据存储位置：
//    - AstroKnot-Data/system/    系统数据（应急备份、临时沙盒）
//    - AstroKnot-Data/projects/  用户项目（默认）
//    - AstroKnot-Data/quicknotes/ 快速笔记（默认）
// ============================================================

let _overlay = null;
let _isSetupComplete = false;

// ════════════════════════════════════════════════════════════
//  公开 API
// ════════════════════════════════════════════════════════════

/**
 * 启动数据目录设置引导
 * @returns {Promise<boolean>} 是否成功完成设置
 */
export async function startDataSetup() {
  // 检查是否已完成设置
  if (_isSetupComplete) return true;
  
  // 检查是否是 Electron 环境
  if (!window.api || !window.api.getDataSettings) {
    console.log('[DataSetup] 非 Electron 环境，跳过设置引导');
    _isSetupComplete = true;
    return true;
  }
  
  // 检查是否已完成首次设置
  try {
    const settings = await window.api.getDataSettings();
    if (settings && settings.initialized) {
      console.log('[DataSetup] 已完成首次设置，跳过引导');
      _isSetupComplete = true;
      return true;
    }
  } catch (e) {
    console.warn('[DataSetup] 获取设置失败:', e);
  }
  
  // 显示设置引导界面
  return await _showSetupUI();
}

/**
 * 检查数据目录设置是否完成
 */
export function isDataSetupComplete() {
  return _isSetupComplete;
}

// ════════════════════════════════════════════════════════════
//  设置引导 UI
// ════════════════════════════════════════════════════════════

async function _showSetupUI() {
  // 创建覆盖层
  _overlay = document.createElement('div');
  _overlay.id = 'dataSetupOverlay';
  _overlay.className = 'data-setup-overlay';
  
  // 获取默认路径
  let defaultPath = '';
  try {
    defaultPath = await window.api.getDefaultDataRoot();
  } catch (e) {
    defaultPath = 'AstroKnot-Data';
  }
  
  // 渲染内容
  _overlay.innerHTML = `
    <div class="data-setup-modal">
      <div class="data-setup-header">
        <h2>📁 选择数据存储位置</h2>
        <p>AstroKnot 需要一个位置来存储你的项目、笔记和系统数据。</p>
      </div>
      
      <div class="data-setup-content">
        <div class="data-setup-option selected" data-option="default">
          <div class="option-icon">📂</div>
          <div class="option-info">
            <h3>使用默认位置</h3>
            <p class="option-path">${defaultPath}</p>
            <p class="option-desc">数据存储在应用安装目录下，方便管理。</p>
          </div>
        </div>
        
        <div class="data-setup-option" data-option="custom">
          <div class="option-icon">📍</div>
          <div class="option-info">
            <h3>自定义位置</h3>
            <p class="option-path" id="customPathDisplay">点击选择文件夹...</p>
            <p class="option-desc">选择其他磁盘或文件夹存储数据。</p>
          </div>
          <button class="option-btn" id="selectCustomBtn">选择文件夹</button>
        </div>
        
        <div class="data-setup-structure">
          <h4>数据目录结构</h4>
          <ul>
            <li><span class="dir-name">system/</span> 系统数据（应急备份、临时沙盒）</li>
            <li><span class="dir-name">projects/</span> 用户项目（默认存储位置）</li>
            <li><span class="dir-name">quicknotes/</span> 快速笔记</li>
          </ul>
        </div>
      </div>
      
      <div class="data-setup-footer">
        <button class="data-setup-btn primary" id="confirmSetupBtn">确认并开始使用</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(_overlay);
  
  // 绑定事件
  let selectedPath = defaultPath;
  let selectedOption = 'default';
  
  // 选项切换
  const options = _overlay.querySelectorAll('.data-setup-option');
  options.forEach(opt => {
    opt.addEventListener('click', () => {
      options.forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      selectedOption = opt.dataset.option;
      
      if (selectedOption === 'default') {
        selectedPath = defaultPath;
      }
    });
  });
  
  // 选择自定义文件夹
  const selectBtn = _overlay.querySelector('#selectCustomBtn');
  const customPathDisplay = _overlay.querySelector('#customPathDisplay');
  
  selectBtn.addEventListener('click', async () => {
    try {
      const result = await window.api.selectDataFolder();
      if (result.success && result.path) {
        selectedPath = result.path;
        customPathDisplay.textContent = selectedPath;
        
        // 自动切换到自定义选项
        options.forEach(o => o.classList.remove('selected'));
        _overlay.querySelector('[data-option="custom"]').classList.add('selected');
        selectedOption = 'custom';
      }
    } catch (e) {
      console.warn('[DataSetup] 选择文件夹失败:', e);
    }
  });
  
  // 确认按钮
  const confirmBtn = _overlay.querySelector('#confirmSetupBtn');
  
  return new Promise((resolve) => {
    confirmBtn.addEventListener('click', async () => {
      try {
        // 设置数据目录
        const result = await window.api.setDataRoot(selectedPath);
        if (result.success) {
          _hideSetupUI();
          _isSetupComplete = true;
          
          // 显示成功提示
          _showSuccessToast(selectedPath);
          
          resolve(true);
        } else {
          _showErrorToast('设置失败，请重试');
        }
      } catch (e) {
        console.error('[DataSetup] 设置失败:', e);
        _showErrorToast('设置失败: ' + e.message);
        resolve(false);
      }
    });
  });
}

function _hideSetupUI() {
  if (_overlay) {
    _overlay.classList.add('hiding');
    setTimeout(() => {
      if (_overlay) {
        _overlay.remove();
        _overlay = null;
      }
    }, 400);
  }
}

function _showSuccessToast(path) {
  const toast = document.createElement('div');
  toast.className = 'data-setup-toast success';
  toast.innerHTML = `
    <span class="toast-icon">✓</span>
    <span class="toast-text">数据目录已设置: ${path}</span>
  `;
  document.body.appendChild(toast);
  
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}

function _showErrorToast(message) {
  const toast = document.createElement('div');
  toast.className = 'data-setup-toast error';
  toast.innerHTML = `
    <span class="toast-icon">⚠</span>
    <span class="toast-text">${message}</span>
  `;
  document.body.appendChild(toast);
  
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 5000);
}

console.log('[DataSetup] 模块已加载');