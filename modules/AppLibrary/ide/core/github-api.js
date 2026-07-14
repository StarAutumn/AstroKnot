// ============================================================
//  github-api.js — GitHub API 客户端
//  负责解析仓库 URL、获取文件树、拉取文件内容（文本+二进制）
// ============================================================

/** 二进制文件扩展名集合 */
const BINARY_EXTENSIONS = new Set([
  // 图片
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'avif', 'tiff', 'tif',
  'psd', 'ai', 'eps',
  // 音视频
  'mp3', 'mp4', 'webm', 'ogg', 'wav', 'avi', 'mov', 'flv', 'swf', 'm4a',
  'aac', 'flac', 'mkv', 'wmv',
  // 压缩包
  'zip', 'gz', 'tar', 'tgz', 'br', 'rar', '7z', 'bz2', 'xz',
  // 字体
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  // 文档
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  // 可执行/库
  'exe', 'dll', 'so', 'dylib', 'class', 'jar', 'war', 'wasm', 'node',
  'pyd', 'pyc', 'o', 'a',
  // 数据库
  'sqlite', 'db', 'mdb', 'dbf',
  // 其他
  'bin', 'dat', 'pak',
]);

/**
 * 根据文件路径判断是否为二进制文件
 * @param {string} filePath - 文件路径
 * @returns {boolean}
 */
export function isBinaryPath(filePath) {
  const ext = filePath.split('.').pop().toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

/** 默认跳过的目录 */
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg', 'dist', 'build/.cache',
  '.next', '.nuxt', '.cache', '.parcel-cache', 'coverage',
]);

/**
 * GitHub API 客户端
 * 仅支持公开仓库（无需 Token），使用 raw.githubusercontent.com 拉取文件内容
 */
export class GithubApiClient {
  /**
   * @param {Object} opts
   * @param {number} [opts.concurrency=6] - 并发下载数
   * @param {number} [opts.maxRepoFiles=5000] - 仓库文件数上限
   * @param {number} [opts.maxFileSize=10485760] - 单文件大小上限（字节，默认 10MB）
   */
  constructor(opts = {}) {
    this._concurrency = opts.concurrency || 6;
    this._maxRepoFiles = opts.maxRepoFiles || 5000;
    this._maxFileSize = opts.maxFileSize || 10 * 1024 * 1024;
    this._apiBase = 'https://api.github.com';
    this._rawBase = 'https://raw.githubusercontent.com';
  }

  /**
   * 解析 GitHub 仓库 URL 或简写
   * @param {string} input - URL 或 "owner/repo" 或 "owner/repo@branch"
   * @returns {{owner:string, repo:string, ref:string, subPath:string}}
   * @throws {Error} 输入无效时抛错
   */
  parseRepoUrl(input) {
    const trimmed = (input || '').trim();
    if (!trimmed) throw new Error('请输入仓库地址');

    let owner, repo, ref = '', subPath = '';

    // 处理 owner/repo@branch 简写
    const atIdx = trimmed.indexOf('@');
    let mainPart = trimmed;
    if (atIdx > 0 && !trimmed.startsWith('http')) {
      mainPart = trimmed.substring(0, atIdx);
      ref = trimmed.substring(atIdx + 1).trim();
    }

    // 处理 URL 格式
    if (mainPart.startsWith('https://github.com/') || mainPart.startsWith('http://github.com/')) {
      const url = new URL(mainPart);
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length < 2) throw new Error('无效的 GitHub URL');
      owner = parts[0];
      repo = parts[1];
      // /tree/branch/sub/path
      if (parts.length >= 4 && parts[2] === 'tree') {
        ref = parts[3];
        if (parts.length > 4) subPath = parts.slice(4).join('/');
      }
      // /blob/branch/path — 单文件，不支持
      if (parts.length >= 4 && parts[2] === 'blob') {
        throw new Error('不支持导入单个文件，请使用仓库或目录 URL');
      }
    } else {
      // owner/repo 简写
      const parts = mainPart.split('/').filter(Boolean);
      if (parts.length < 2) throw new Error('格式应为 owner/repo 或 GitHub URL');
      owner = parts[0];
      repo = parts[1];
    }

    // 去掉 .git 后缀
    if (repo.endsWith('.git')) repo = repo.slice(0, -4);

    if (!owner || !repo) throw new Error('无法解析仓库 owner 或 repo');
    return { owner, repo, ref, subPath };
  }

  /**
   * 获取仓库元信息
   * @returns {Promise<{defaultBranch:string, description:string, sizeKb:number, private:boolean}>}
   */
  async fetchRepoMeta(owner, repo) {
    const url = `${this._apiBase}/repos/${owner}/${repo}`;
    const resp = await fetch(url, { headers: { 'Accept': 'application/vnd.github.v3+json' } });

    if (resp.status === 404) throw new Error('仓库不存在或为私有仓库');
    if (resp.status === 403) {
      const remaining = resp.headers.get('X-RateLimit-Remaining');
      if (remaining === '0') {
        const reset = resp.headers.get('X-RateLimit-Reset');
        const resetTime = reset ? new Date(parseInt(reset) * 1000).toLocaleTimeString() : '稍后';
        throw new Error(`GitHub API 速率限制（60次/小时），请于 ${resetTime} 后重试`);
      }
      throw new Error('GitHub API 访问被拒绝');
    }
    if (!resp.ok) throw new Error(`获取仓库信息失败: HTTP ${resp.status}`);

    const data = await resp.json();
    return {
      name: data.name || '',
      defaultBranch: data.default_branch || 'main',
      description: data.description || '',
      sizeKb: data.size || 0,
      stars: data.stargazers_count || 0,
      forks: data.forks_count || 0,
      private: data.private || false,
    };
  }

  /**
   * 获取仓库完整文件树（单次请求）
   * @param {string} owner
   * @param {string} repo
   * @param {string} ref - 分支名/commit SHA
   * @returns {Promise<Array<{path:string, type:'blob', size:number}>>}
   */
  async fetchTree(owner, repo, ref) {
    const url = `${this._apiBase}/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`;
    const resp = await fetch(url, { headers: { 'Accept': 'application/vnd.github.v3+json' } });

    if (resp.status === 404) throw new Error(`分支或引用不存在: ${ref}`);
    if (resp.status === 403) {
      const remaining = resp.headers.get('X-RateLimit-Remaining');
      if (remaining === '0') {
        const reset = resp.headers.get('X-RateLimit-Reset');
        const resetTime = reset ? new Date(parseInt(reset) * 1000).toLocaleTimeString() : '稍后';
        throw new Error(`GitHub API 速率限制（60次/小时），请于 ${resetTime} 后重试`);
      }
    }
    if (!resp.ok) throw new Error(`获取文件树失败: HTTP ${resp.status}`);

    const data = await resp.json();
    if (data.truncated) {
      throw new Error('仓库文件数过多，无法一次性获取。请尝试导入子目录，或选择更小的仓库。');
    }

    const blobs = (data.tree || [])
      .filter(item => item.type === 'blob')
      .map(item => ({ path: item.path, type: 'blob', size: item.size || 0 }));

    if (blobs.length > this._maxRepoFiles) {
      throw new Error(`仓库有 ${blobs.length} 个文件，超过上限 ${this._maxRepoFiles}。请选择更小的仓库。`);
    }

    return blobs;
  }

  /**
   * 拉取单个文件内容
   * @param {string} owner
   * @param {string} repo
   * @param {string} ref
   * @param {string} filePath - 仓库内文件路径
   * @param {AbortSignal} [signal] - 用于取消请求
   * @returns {Promise<{content:string, isBinary:boolean, size:number}>}
   */
  async fetchFile(owner, repo, ref, filePath, signal) {
    const rawUrl = `${this._rawBase}/${owner}/${repo}/${encodeURIComponent(ref)}/${filePath.split('/').map(encodeURIComponent).join('/')}`;
    const binary = isBinaryPath(filePath);

    const resp = await fetch(rawUrl, { signal });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    let content;
    if (binary) {
      const buf = await resp.arrayBuffer();
      content = _arrayBufferToBase64(buf);
    } else {
      content = await resp.text();
    }

    return { content, isBinary: binary, size: parseInt(resp.headers.get('content-length') || '0') };
  }

  /**
   * 过滤文件树：跳过 node_modules/.git 等，检查大小限制
   * @param {Array} tree - fetchTree 返回的文件列表
   * @param {number} maxFileSize - 最大文件大小（字节）
   * @param {string} [subPath] - 仅导入此子目录下的文件
   * @returns {{kept:Array, skipped:Array}}
   */
  filterTree(tree, maxFileSize, subPath) {
    const kept = [];
    const skipped = [];

    for (const item of tree) {
      // 子路径过滤
      if (subPath && !item.path.startsWith(subPath + '/')) continue;

      // 跳过目录前缀
      const parts = item.path.split('/');
      const shouldSkip = parts.some(p => SKIP_DIRS.has(p));
      if (shouldSkip) {
        skipped.push({ ...item, reason: 'skip-dir' });
        continue;
      }

      // 大小限制
      if (item.size > maxFileSize) {
        skipped.push({ ...item, reason: 'too-large' });
        continue;
      }

      kept.push(item);
    }

    return { kept, skipped };
  }

  /**
   * 并发限流池
   * @param {Array} items
   * @param {(item:any, index:number)=>Promise<void>} mapper
   * @param {(done:number, total:number, lastPath:string)=>void} [onProgress]
   * @param {AbortSignal} [signal]
   * @returns {Promise<{succeeded:Array, failed:Array}>}
   */
  async _runPool(items, mapper, onProgress, signal) {
    let done = 0;
    const succeeded = [];
    const failed = [];
    const queue = items.map((item, i) => ({ item, i }));

    const workers = Array.from({ length: this._concurrency }, async () => {
      while (queue.length) {
        if (signal?.aborted) return;
        const { item, i } = queue.shift();
        try {
          await mapper(item, i);
          succeeded.push(item);
        } catch (e) {
          if (e.name === 'AbortError') return;
          failed.push({ item, error: e.message });
        }
        done++;
        if (onProgress) onProgress(done, items.length, item.path || '');
      }
    });

    await Promise.all(workers);
    return { succeeded, failed };
  }
}

/**
 * ArrayBuffer → base64 字符串（分块处理避免栈溢出）
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
function _arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000; // 32768
  let result = '';

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    result += String.fromCharCode.apply(null, chunk);
  }

  return btoa(result);
}

console.log('[github-api] 模块已加载');
