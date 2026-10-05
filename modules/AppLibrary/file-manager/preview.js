// ============================================================
//  file-manager/preview.js — 文件预览面板（原型混入）
//  职责：预览面板的显示与隐藏，文本 / 图片 / 信息三种预览
//  渲染；同时提供文件大小格式化工具 formatSize（index.js
//  的文件列表与状态栏也复用）
//  实现说明：以原型混入（Object.assign(FileManagerApp.prototype, ...)）
//  挂载到 FileManagerApp——方法体通过 this 访问实例状态
//  （this._content / this._currentPath 等），与写在 class 体内
//  完全等价；HTML 转义由 ui-widgets.js 的 _escapeHtml 提供
// ============================================================

/** 格式化文件大小 */
export function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
}

export const previewMethods = {
  // ════════════════════════════════════════════════════════════
  //  预览面板
  // ════════════════════════════════════════════════════════════

  async _showPreview(name, type) {
    const preview = this._content.querySelector('#fmPreview');
    if (type === 'directory') {
      preview.style.display = 'none';
      return;
    }

    const relPath = this._currentPath ? this._currentPath + '/' + name : name;
    try {
      const result = await window.api.fmReadFile(relPath);
      preview.style.display = '';

      if (result.type === 'text') {
        preview.innerHTML = `
          <div class="fm-preview-header">
            <span class="fm-preview-title">${name}</span>
            <button class="fm-preview-close" title="关闭预览">✕</button>
          </div>
          <pre class="fm-preview-text">${this._escapeHtml(result.content?.slice(0, 5000) || '')}</pre>
          ${result.content?.length > 5000 ? '<div class="fm-preview-truncated">内容过长，仅显示前 5000 字符</div>' : ''}
        `;
      } else if (result.type === 'image') {
        preview.innerHTML = `
          <div class="fm-preview-header">
            <span class="fm-preview-title">${name}</span>
            <button class="fm-preview-close" title="关闭预览">✕</button>
          </div>
          <div class="fm-preview-image"><img src="${result.dataUrl}" alt="${name}"></div>
        `;
      } else {
        preview.style.display = 'none';
        return;
      }

      preview.querySelector('.fm-preview-close')?.addEventListener('click', () => this._hidePreview());
    } catch (e) {
      preview.style.display = 'none';
    }
  },

  _showTextPreview(name, content) {
    const preview = this._content.querySelector('#fmPreview');
    preview.style.display = '';
    preview.innerHTML = `
      <div class="fm-preview-header">
        <span class="fm-preview-title">${name}</span>
        <button class="fm-preview-close" title="关闭预览">✕</button>
      </div>
      <pre class="fm-preview-text">${this._escapeHtml(content?.slice(0, 5000) || '')}</pre>
    `;
    preview.querySelector('.fm-preview-close')?.addEventListener('click', () => this._hidePreview());
  },

  _showImagePreview(name, dataUrl) {
    const preview = this._content.querySelector('#fmPreview');
    preview.style.display = '';
    preview.innerHTML = `
      <div class="fm-preview-header">
        <span class="fm-preview-title">${name}</span>
        <button class="fm-preview-close" title="关闭预览">✕</button>
      </div>
      <div class="fm-preview-image"><img src="${dataUrl}" alt="${name}"></div>
    `;
    preview.querySelector('.fm-preview-close')?.addEventListener('click', () => this._hidePreview());
  },

  _showInfoPreview(name, info) {
    const preview = this._content.querySelector('#fmPreview');
    preview.style.display = '';
    preview.innerHTML = `
      <div class="fm-preview-header">
        <span class="fm-preview-title">${name}</span>
        <button class="fm-preview-close" title="关闭预览">✕</button>
      </div>
      <div class="fm-preview-info">
        <p>无法预览此文件类型</p>
        <p>大小: ${formatSize(info.size || 0)}</p>
      </div>
    `;
    preview.querySelector('.fm-preview-close')?.addEventListener('click', () => this._hidePreview());
  },

  _hidePreview() {
    this._content.querySelector('#fmPreview').style.display = 'none';
  }
};
