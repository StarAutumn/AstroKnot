// ============================================================
//  system-storage.js — 系统偏好设置文件化引导脚本
//  将应用自有 localStorage key 持久化到 AstroKnot-Data/system/preferences.json
//  仅 Electron 环境运行；非 Electron 环境（web-api-shim）直接返回
//
//  架构：localStorage 作为工作副本，preferences.json 作为持久镜像
//  - 启动时同步读取文件，覆盖 localStorage（文件为权威源）
//  - Patch Storage.prototype 仅做变更检测，触发防抖异步落盘
//  - 退出时同步落盘（由 emergencyBackup.flushNow 调用）
// ============================================================

(function () {
  'use strict';

  // 非 Electron 环境：web-api-shim 已处理，本脚本无操作
  if (!window.api || !window.__ELECTRON__) return;

  // ── 应用自有 key 前缀白名单 ──
  // 匹配这些前缀的 key 会被持久化到 preferences.json
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

  // ── 保存原始方法引用 ──
  const _proto = Storage.prototype;
  const _origSetItem = _proto.setItem;
  const _origRemoveItem = _proto.removeItem;
  const _origClear = _proto.clear;

  // ── 防抖状态 ──
  let _flushTimer = null;
  const FLUSH_DEBOUNCE_MS = 1000;
  let _bootDone = false;

  // ── 快照应用自有 key ──
  // 遍历 localStorage，提取所有匹配白名单前缀的 key
  function snapshotAppKeys() {
    const snapshot = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (isAppKey(key)) {
        // localStorage.getItem 未被 patch，直接读取安全
        snapshot[key] = localStorage.getItem(key);
      }
    }
    return snapshot;
  }

  // ── 防抖异步落盘 ──
  function scheduleFlush() {
    if (!_bootDone) return; // 启动引导完成前不触发
    if (_flushTimer) clearTimeout(_flushTimer);
    _flushTimer = setTimeout(() => {
      _flushTimer = null;
      try {
        const data = snapshotAppKeys();
        window.api.writePreferences(data).catch(e => {
          console.warn('[system-storage] 防抖落盘失败:', e);
        });
      } catch (e) {
        console.warn('[system-storage] 快照失败:', e);
      }
    }, FLUSH_DEBOUNCE_MS);
  }

  // ── 退出同步落盘（before-quit 时由 emergencyBackup.flushNow 调用）──
  // 暴露为全局函数，供 emergencyBackup.js 在退出流程中调用
  window.__flushSystemPreferences = function () {
    try {
      // 取消待执行的防抖定时器
      if (_flushTimer) {
        clearTimeout(_flushTimer);
        _flushTimer = null;
      }
      // 同步快照 + 同步写入（sendSync 阻塞直到主进程写完）
      const data = snapshotAppKeys();
      window.api.flushPreferencesSync(data);
      console.log('[system-storage] 退出同步落盘完成');
    } catch (e) {
      console.warn('[system-storage] 退出落盘失败:', e);
    }
  };

  // ════════════════════════════════════════════════════════════
  //  启动引导（同步）
  //  必须在 AstroKnot.js（ES 模块，defer）之前执行
  //  sendSync 阻塞渲染进程直到主进程返回文件内容
  // ════════════════════════════════════════════════════════════
  try {
    const result = window.api.readPreferencesSync(); // sendSync 阻塞
    const fileData = result && result.data; // { key: value, ... } | null

    if (fileData && typeof fileData === 'object') {
      // 文件存在 → 文件是权威源，覆盖 localStorage 中的应用 key
      for (const [key, value] of Object.entries(fileData)) {
        if (isAppKey(key) && value != null) {
          _origSetItem.call(localStorage, key, value);
        }
      }
      console.log('[system-storage] 从 preferences.json 恢复', Object.keys(fileData).length, '个设置项');
    } else {
      // 文件不存在 → 首次迁移，从 localStorage 播种到文件
      const seed = snapshotAppKeys();
      if (Object.keys(seed).length > 0) {
        // 同步写入种子数据（sendSync）
        window.api.flushPreferencesSync(seed);
        console.log('[system-storage] 首次迁移：从 localStorage 播种', Object.keys(seed).length, '个设置项到 preferences.json');
      } else {
        console.log('[system-storage] 首次启动：localStorage 无应用设置，preferences.json 将在首次变更时创建');
      }
    }
    _bootDone = true;
  } catch (e) {
    console.error('[system-storage] 启动引导失败，继续使用原生 localStorage:', e);
    _bootDone = true; // 即使失败也标记完成，避免阻塞后续 flush
  }

  // ════════════════════════════════════════════════════════════
  //  Patch Storage.prototype（仅变更检测，不拦截读写）
  //  - this === window.localStorage 守卫：区分 sessionStorage 和 webview
  //  - 不 patch getItem/key/length：镜像模式下原生正确
  // ════════════════════════════════════════════════════════════
  _proto.setItem = function (key, value) {
    _origSetItem.apply(this, arguments); // 始终写 localStorage（工作副本）
    // 仅对 window.localStorage 的应用 key 触发防抖落盘
    if (this === window.localStorage && isAppKey(key)) {
      scheduleFlush();
    }
  };

  _proto.removeItem = function (key) {
    _origRemoveItem.apply(this, arguments);
    if (this === window.localStorage && isAppKey(key)) {
      scheduleFlush();
    }
  };

  _proto.clear = function () {
    _origClear.apply(this, arguments);
    // clear() 清除所有 key，包含应用 key，触发防抖
    if (this === window.localStorage) {
      scheduleFlush();
    }
  };

  console.log('[system-storage] ✅ 系统偏好设置文件化已启用');
})();
