/**
 * SandboxBreadcrumb - Breadcrumb navigation module for the sandbox IDE.
 *
 * Renders a file-path breadcrumb bar and provides a sibling-file dropdown
 * for quick navigation.
 */
export class SandboxBreadcrumb {
  /** @param {import('../core/context').SandboxContext} ctx */
  constructor(ctx) {
    /** @type {import('../core/context').SandboxContext} */
    this._ctx = ctx;
    /** @type {HTMLDivElement|null} */
    this._breadcrumbDropdown = null;
    /** @type {Function|null} bound close handler so we can remove it later */
    this._boundCloseHandler = null;
  }

  /* ------------------------------------------------------------------ */
  /*  Lifecycle                                                          */
  /* ------------------------------------------------------------------ */

  init() {
    // nothing to bootstrap; breadcrumb is updated on demand
  }

  destroy() {
    if (this._breadcrumbDropdown) {
      this._breadcrumbDropdown.remove();
      this._breadcrumbDropdown = null;
    }
    if (this._boundCloseHandler) {
      document.removeEventListener('mousedown', this._boundCloseHandler);
      this._boundCloseHandler = null;
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Public API                                                         */
  /* ------------------------------------------------------------------ */

  /**
   * Update the main sandbox breadcrumb bar.
   * @param {string} filePath
   */
  updateBreadcrumb(filePath) {
    const bar = document.getElementById('sandboxBreadcrumbBar');
    this.updateBreadcrumbIn(bar, filePath);
  }

  /**
   * Render breadcrumb segments inside the given bar element.
   * @param {HTMLElement|null} barEl
   * @param {string} filePath
   */
  updateBreadcrumbIn(barEl, filePath) {
    if (!barEl || !filePath) {
      if (barEl) barEl.innerHTML = '';
      return;
    }

    const segments = filePath.split('/');
    barEl.innerHTML = '';

    for (let i = 0; i < segments.length; i++) {
      if (i > 0) {
        const sep = document.createElement('span');
        sep.className = 'breadcrumb-separator';
        sep.textContent = '\u203A';
        barEl.appendChild(sep);
      }

      const seg = document.createElement('span');
      seg.className = 'breadcrumb-segment';
      if (i === segments.length - 1) seg.classList.add('active');
      seg.textContent = segments[i];

      const dirPath = segments.slice(0, i).join('/');
      seg.addEventListener('click', () => {
        this.showBreadcrumbDropdown(seg, dirPath, segments[i]);
      });

      barEl.appendChild(seg);
    }
  }

  /**
   * Show a dropdown listing sibling items of the clicked segment.
   * @param {HTMLElement} segmentEl
   * @param {string} dirPath
   * @param {string} currentName
   */
  showBreadcrumbDropdown(segmentEl, dirPath, currentName) {
    const vfs = this._ctx.vfs;
    if (!vfs) return;

    // Destroy existing dropdown
    if (this._breadcrumbDropdown) {
      this._breadcrumbDropdown.remove();
      this._breadcrumbDropdown = null;
    }
    if (this._boundCloseHandler) {
      document.removeEventListener('mousedown', this._boundCloseHandler);
      this._boundCloseHandler = null;
    }

    const siblings = vfs.getSiblings(dirPath);
    if (siblings.length <= 1) return;

    const dropdown = document.createElement('div');
    dropdown.className = 'breadcrumb-dropdown';

    for (const item of siblings) {
      const btn = document.createElement('button');
      btn.className = 'breadcrumb-dropdown-item';
      if (item.name === currentName) btn.classList.add('current');
      btn.textContent = (item.type === 'directory' ? '\uD83D\uDCC1 ' : '\uD83D\uDCC4 ') + item.name;
      btn.addEventListener('click', () => {
        if (item.type === 'file') {
          this._ctx.emit('openFileInEditor', item.path);
        }
        dropdown.remove();
        this._breadcrumbDropdown = null;
      });
      dropdown.appendChild(btn);
    }

    // Position the dropdown below the segment
    const rect = segmentEl.getBoundingClientRect();
    dropdown.style.left = rect.left + 'px';
    dropdown.style.top = rect.bottom + 2 + 'px';
    document.body.appendChild(dropdown);
    this._breadcrumbDropdown = dropdown;

    // Close on outside click
    const closeHandler = (e) => {
      if (!dropdown.contains(e.target) && e.target !== segmentEl) {
        dropdown.remove();
        this._breadcrumbDropdown = null;
        document.removeEventListener('mousedown', closeHandler);
        this._boundCloseHandler = null;
      }
    };
    this._boundCloseHandler = closeHandler;
    setTimeout(() => document.addEventListener('mousedown', closeHandler), 0);
  }
}
