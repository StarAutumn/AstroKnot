// ============================================================
//  modules / systemStorage.js — 系统级键值存储（替代 localStorage）
// ============================================================
// 设计目标：
//  - Electron 环境：直接读写 AstroKnot-Data/system/storage/*.json
//  - Web 环境：降级到原生 localStorage
//  - 提供 install() 接管全局 localStorage API，应用 key 全部走文件
//  - 提供 uninstall() 恢复原生 localStorage
//
// 文件布局：
//    AstroKnot-Data/system/storage/
//      └── <base64url(key)>.json
// 每个文件内容：{ key, value, updatedAt }
// ============================================================

(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else if (typeof define === 'function' && define.amd) {
    define(factory);
  } else {
    root.SystemStorage = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ── 应用自有 key 前缀白名单 ──
  // 匹配这些前缀的 key 会被持久化到 system/storage/
  // 第三方库 key（TinyMCE/Monaco/Univer 等）不匹配，保留在原生 localStorage
  const APP_KEY_PREFIXES = [
    'astroknot',            // 覆盖 astroknot_*, astroknot-*
    'knowledge_graph',      // 覆盖 knowledge_graph_*
    'ai',                   // 覆盖 ai* (aiChatHistory, aiApiKey, aiCustomKey_* 等)
    'richEditor',           // 覆盖 richEditor_*
    'calendar',             // 覆盖 calendar_*
    'sandbox-ide-settings', // 精确匹配
    'qnotes_migrated'       // 精确匹配
  ];

  function isAppKey(key) {
    if (!key) return false;
    return APP_KEY_PREFIXES.some(prefix => key.startsWith(prefix));
  }

  function _isElectron() {
    try {
      return !!(typeof window !== 'undefined' &&
                window.api &&
                window.api.systemStorageReadSync);
    } catch (e) {
      return false;
    }
  }

  function _hasLocalStorage() {
    try {
      const testKey = '__sys_storage_test__';
      localStorage.setItem(testKey, '1');
      localStorage.removeItem(testKey);
      return true;
    } catch (e) {
      return false;
    }
  }

  const _electron = _isElectron();
  const _localStorage = !_electron && _hasLocalStorage();

  function _encodeKey(key) {
    // URL-safe base64，避免 Windows 文件名非法字符
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(encodeURIComponent(key), 'utf8')
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    }
    if (typeof window !== 'undefined' && window.btoa) {
      return window.btoa(encodeURIComponent(key))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    }
    return key.replace(/[^a-zA-Z0-9_.-]/g, '_');
  }

  function _now() {
    return new Date().toISOString();
  }

  // ── 原始 localStorage 方法备份（install 后使用 / Web 降级使用）──
  let _origProto = null;
  let _origGetItem = null;
  let _origSetItem = null;
  let _origRemoveItem = null;
  let _origClear = null;
  let _origKey = null;
  let _origLengthDescriptor = null;
  let _installed = false;

  // 真正原生的方法引用（Web 降级用，避免递归）
  let _nativeGetItemRef = null;
  let _nativeSetItemRef = null;
  let _nativeRemoveItemRef = null;
  let _nativeClearRef = null;
  let _nativeKeyRef = null;
  let _nativeLengthGetterRef = null;

  function getItem(key, defaultValue) {
    if (typeof key !== 'string') key = String(key);

    if (_electron) {
      try {
        const result = window.api.systemStorageReadSync(key);
        if (result && result.success && result.value !== undefined && result.value !== null) {
          return result.value;
        }
      } catch (e) {
        console.warn('[SystemStorage] 读取失败:', key, e);
      }
      return defaultValue !== undefined ? defaultValue : null;
    }

    if (_localStorage && _nativeGetItemRef) {
      const raw = _nativeGetItemRef.call(localStorage, key);
      return raw !== null ? raw : (defaultValue !== undefined ? defaultValue : null);
    }

    return defaultValue !== undefined ? defaultValue : null;
  }

  function setItem(key, value) {
    if (typeof key !== 'string') key = String(key);
    if (typeof value !== 'string') value = String(value);

    if (_electron) {
      try {
        const result = window.api.systemStorageWriteSync(key, value);
        if (result && result.success) return;
      } catch (e) {
        console.warn('[SystemStorage] 写入失败:', key, e);
      }
      return;
    }

    if (_localStorage && _nativeSetItemRef) {
      _nativeSetItemRef.call(localStorage, key, value);
    }
  }

  function removeItem(key) {
    if (typeof key !== 'string') key = String(key);

    if (_electron) {
      try {
        window.api.systemStorageRemoveSync(key);
      } catch (e) {
        console.warn('[SystemStorage] 删除失败:', key, e);
      }
      return;
    }

    if (_localStorage && _nativeRemoveItemRef) {
      _nativeRemoveItemRef.call(localStorage, key);
    }
  }

  function clear() {
    if (_electron) {
      try {
        const result = window.api.systemStorageKeysSync();
        const keys = (result && result.keys) || [];
        keys.filter(isAppKey).forEach(k => removeItem(k));
      } catch (e) {
        console.warn('[SystemStorage] 清空失败:', e);
      }
      return;
    }

    if (_localStorage && _nativeClearRef) {
      _nativeClearRef.call(localStorage);
    }
  }

  function keys() {
    if (_electron) {
      try {
        const result = window.api.systemStorageKeysSync();
        return (result && result.keys) || [];
      } catch (e) {
        return [];
      }
    }

    if (_localStorage && _nativeKeyRef && _nativeLengthGetterRef) {
      const arr = [];
      const len = _nativeLengthGetterRef.call(localStorage);
      for (let i = 0; i < len; i++) {
        arr.push(_nativeKeyRef.call(localStorage, i));
      }
      return arr;
    }

    return [];
  }

  function key(index) {
    const ks = keys();
    return ks[index] !== undefined ? ks[index] : null;
  }

  function length() {
    return keys().length;
  }

  function getJSON(key, defaultValue) {
    const raw = getItem(key, null);
    if (raw === null) return defaultValue !== undefined ? defaultValue : null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      console.warn('[SystemStorage] JSON 解析失败:', key, e);
      return defaultValue !== undefined ? defaultValue : null;
    }
  }

  function setJSON(key, value) {
    setItem(key, JSON.stringify(value));
  }

  // ── 迁移旧 preferences.json 数据 ──
  function _migrateFromPreferences() {
    if (!_electron) return;
    try {
      // 通过 readPreferencesSync 读取旧格式数据
      if (!window.api.readPreferencesSync) return;
      const result = window.api.readPreferencesSync();
      const data = result && result.data;
      if (!data || typeof data !== 'object') return;

      const appKeys = Object.keys(data).filter(isAppKey);
      if (appKeys.length === 0) return;

      console.log('[SystemStorage] 迁移旧 preferences.json 数据:', appKeys.length, '个 key');
      appKeys.forEach(k => {
        const value = data[k];
        if (value != null) {
          window.api.systemStorageWriteSync(k, value);
        }
      });

      // 迁移完成后重命名旧文件，避免重复迁移
      if (window.api.flushPreferencesSync) {
        window.api.flushPreferencesSync({ __migrated_to_system_storage__: 'true' });
      }
      console.log('[SystemStorage] 迁移完成');
    } catch (e) {
      console.warn('[SystemStorage] 迁移旧数据失败:', e);
    }
  }

  // ── 安装：接管 Storage.prototype ──
  function install() {
    if (_installed) return;
    if (!_electron && !_localStorage) {
      console.warn('[SystemStorage] 非 Electron 且无 localStorage，无法安装');
      return;
    }

    // 先迁移旧数据
    _migrateFromPreferences();

    if (!_localStorage) return;

    _origProto = Storage.prototype;
    _origGetItem = _origProto.getItem;
    _origSetItem = _origProto.setItem;
    _origRemoveItem = _origProto.removeItem;
    _origClear = _origProto.clear;
    _origKey = _origProto.key;

    // 同时保存真正原生的方法引用，供 Web 降级使用（避免递归）
    _nativeGetItemRef = _origGetItem;
    _nativeSetItemRef = _origSetItem;
    _nativeRemoveItemRef = _origRemoveItem;
    _nativeClearRef = _origClear;
    _nativeKeyRef = _origKey;

    _origProto.getItem = function (k) {
      if (isAppKey(k)) return getItem(k);
      return _origGetItem.call(this, k);
    };

    _origProto.setItem = function (k, v) {
      if (isAppKey(k)) return setItem(k, v);
      return _origSetItem.call(this, k, v);
    };

    _origProto.removeItem = function (k) {
      if (isAppKey(k)) return removeItem(k);
      return _origRemoveItem.call(this, k);
    };

    _origProto.clear = function () {
      // 只清理应用 key；原生 localStorage 也清空（第三方库数据保留在内存副本中，调用 clear 会丢失，这是预期行为）
      clear();
      _origClear.call(this);
    };

    _origProto.key = function (index) {
      // 合并返回：先返回应用 key，再返回原生 key
      const appKeys = keys();
      if (index < appKeys.length) return appKeys[index];
      // 过滤掉已经被接管的 app key
      const nativeIndex = index - appKeys.length;
      const nativeKeys = [];
      for (let i = 0; i < _origLength(); i++) {
        const k = _origKey.call(this, i);
        if (!isAppKey(k)) nativeKeys.push(k);
      }
      return nativeKeys[nativeIndex] !== undefined ? nativeKeys[nativeIndex] : null;
    };

    // length getter 需要特殊处理
    _origLengthDescriptor = Object.getOwnPropertyDescriptor(Storage.prototype, 'length');
    if (_origLengthDescriptor && _origLengthDescriptor.get) {
      const _origLengthGetter = _origLengthDescriptor.get;
      _nativeLengthGetterRef = _origLengthGetter;
      _origLength = function () { return _origLengthGetter.call(this); };
      Object.defineProperty(Storage.prototype, 'length', {
        get: function () {
          const appLen = keys().length;
          let nativeLen = 0;
          for (let i = 0; i < _origLength(); i++) {
            const k = _origKey.call(this, i);
            if (!isAppKey(k)) nativeLen++;
          }
          return appLen + nativeLen;
        },
        configurable: true
      });
    }

    _installed = true;

    // 暴露兼容 flush 入口（emergencyBackup.js 调用）
    if (typeof window !== 'undefined') {
      window.__flushSystemStorage = function () {
        // SystemStorage 每次 setItem 已同步写入文件，无需额外 flush
        console.log('[SystemStorage] flush 无需操作（已实时写入）');
      };
    }

    console.log('[SystemStorage] 已接管 localStorage，应用 key 走文件系统');
  }

  // 用于内部备份
  let _origLength = function () { return 0; };

  // ── 卸载：恢复原生 localStorage ──
  function uninstall() {
    if (!_installed || !_origProto) return;

    _origProto.getItem = _origGetItem;
    _origProto.setItem = _origSetItem;
    _origProto.removeItem = _origRemoveItem;
    _origProto.clear = _origClear;
    _origProto.key = _origKey;

    if (_origLengthDescriptor) {
      Object.defineProperty(Storage.prototype, 'length', _origLengthDescriptor);
    }

    _nativeGetItemRef = null;
    _nativeSetItemRef = null;
    _nativeRemoveItemRef = null;
    _nativeClearRef = null;
    _nativeKeyRef = null;
    _nativeLengthGetterRef = null;

    _installed = false;
    console.log('[SystemStorage] 已恢复原生 localStorage');
  }

  function isInstalled() {
    return _installed;
  }

  return {
    getItem,
    setItem,
    removeItem,
    clear,
    key,
    length,
    keys,
    getJSON,
    setJSON,
    install,
    uninstall,
    isInstalled,
    isAppKey,
    _encodeKey
  };
}));
