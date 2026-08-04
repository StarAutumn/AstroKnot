class SandboxImagePreview {
  static IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'avif'];

  static MIME_MAP = {
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'svg': 'image/svg+xml',
    'webp': 'image/webp',
    'ico': 'image/x-icon',
    'bmp': 'image/bmp',
    'avif': 'image/avif'
  };

  constructor(ctx) {
    this._ctx = ctx;
    this._imageZoom = 1;
  }

  init() {
    // No initialization needed beyond constructor
  }

  destroy() {
    this.closeImagePreview();
  }

  static isImageFile(filePath) {
    const ext = filePath.split('.').pop().toLowerCase();
    return SandboxImagePreview.IMAGE_EXTENSIONS.includes(ext);
  }

  openImagePreview(filePath) {
    const vfs = this._ctx.vfs;
    if (!vfs) {
      console.log('[IDE openImagePreview] 提前返回: vfs 为空');
      return;
    }

    const file = vfs.getFile(filePath);
    if (!file) {
      console.log('[IDE openImagePreview] 提前返回: 文件不存在', filePath);
      return;
    }

    const content = file.content || '';
    console.log('[IDE openImagePreview] 开始:', filePath, 'content长度:', content.length, 'content前缀:', content.substring(0, 40));

    // Hide Monaco, show image preview
    const monacoContainer = document.getElementById('sandboxMonacoContainer');
    const imagePreview = document.getElementById('sandboxImagePreview');
    if (monacoContainer) monacoContainer.style.display = 'none';
    if (imagePreview) imagePreview.style.display = 'flex';
    console.log('[IDE openImagePreview] DOM状态: monaco.display=', monacoContainer?.style.display, 'imagePreview.display=', imagePreview?.style.display);

    // Exit Markdown mode
    this._ctx.emit('exitMarkdownMode');

    // Set image src
    const img = document.getElementById('imagePreviewImg');
    if (img) {
      console.log('[IDE openImagePreview] img存在, 当前src长度:', img.src?.length, '当前src前缀:', img.src?.substring(0, 40));
      if (content.startsWith('data:')) {
        img.src = content;
        console.log('[IDE openImagePreview] 设置 img.src = dataUrl (长度:', content.length, ')');
      } else if (content.startsWith('<svg') || content.startsWith('<?xml')) {
        const blob = new Blob([content], { type: 'image/svg+xml' });
        img.src = URL.createObjectURL(blob);
        console.log('[IDE openImagePreview] 设置 img.src = blob (svg)');
      } else if (/^[A-Za-z0-9+/=]+$/.test(content.trim()) && content.length > 20) {
        const ext = filePath.split('.').pop().toLowerCase();
        const mime = SandboxImagePreview.MIME_MAP[ext] || 'image/png';
        img.src = 'data:' + mime + ';base64,' + content;
        console.log('[IDE openImagePreview] 设置 img.src = base64拼接 (mime:', mime, ')');
      } else {
        img.src = '';
        console.log('[IDE openImagePreview] 警告: content 不匹配任何格式，img.src 设为空! content前缀:', content.substring(0, 50));
      }
      this._imageZoom = 1;
      img.style.transform = 'scale(1)';

      // Scroll wheel zoom
      img.onwheel = (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        this._imageZoom = Math.max(0.1, Math.min(10, this._imageZoom + delta));
        img.style.transform = 'scale(' + this._imageZoom + ')';
        const zoomEl = document.getElementById('imagePreviewZoom');
        if (zoomEl) zoomEl.textContent = Math.round(this._imageZoom * 100) + '%';
      };
    } else {
      console.log('[IDE openImagePreview] 警告: imagePreviewImg 元素不存在!');
    }

    // Update info
    const infoEl = document.getElementById('imagePreviewInfo');
    if (infoEl) infoEl.textContent = '\uD83D\uDDBC\uFE0F ' + file.name;
    const zoomEl = document.getElementById('imagePreviewZoom');
    if (zoomEl) zoomEl.textContent = '100%';

    // Create/highlight image tab
    const fileTabs = this._ctx.fileTabs;
    if (fileTabs) fileTabs.openTab(filePath, file.name);

    const fileTree = this._ctx.fileTree;
    if (fileTree) fileTree.setActive(filePath);

    this._ctx.emit('updateBreadcrumb', filePath);
    console.log('[IDE openImagePreview] 完成:', filePath);
  }

  closeImagePreview() {
    const imagePreview = document.getElementById('sandboxImagePreview');
    const img = document.getElementById('imagePreviewImg');
    console.log('[IDE closeImagePreview] 调用, img.src长度:', img?.src?.length, 'container.display=', imagePreview?.style.display);
    if (imagePreview) imagePreview.style.display = 'none';

    if (img) {
      if (img.src && img.src.startsWith('blob:')) {
        URL.revokeObjectURL(img.src);
      }
      img.src = '';
      img.onwheel = null;
    }
  }
}

export { SandboxImagePreview };
