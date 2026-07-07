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
    if (!vfs) return;

    const file = vfs.getFile(filePath);
    if (!file) return;

    // Hide Monaco, show image preview
    const monacoContainer = document.getElementById('sandboxMonacoContainer');
    const imagePreview = document.getElementById('sandboxImagePreview');
    if (monacoContainer) monacoContainer.style.display = 'none';
    if (imagePreview) imagePreview.style.display = 'flex';

    // Exit Markdown mode
    this._ctx.emit('exitMarkdownMode');

    // Set image src
    const img = document.getElementById('imagePreviewImg');
    if (img) {
      const content = file.content || '';
      if (content.startsWith('data:')) {
        img.src = content;
      } else if (content.startsWith('<svg') || content.startsWith('<?xml')) {
        const blob = new Blob([content], { type: 'image/svg+xml' });
        img.src = URL.createObjectURL(blob);
      } else if (/^[A-Za-z0-9+/=]+$/.test(content.trim()) && content.length > 20) {
        const ext = filePath.split('.').pop().toLowerCase();
        const mime = SandboxImagePreview.MIME_MAP[ext] || 'image/png';
        img.src = 'data:' + mime + ';base64,' + content;
      } else {
        img.src = '';
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
  }

  closeImagePreview() {
    const imagePreview = document.getElementById('sandboxImagePreview');
    if (imagePreview) imagePreview.style.display = 'none';

    const img = document.getElementById('imagePreviewImg');
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
