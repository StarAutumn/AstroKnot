// ============================================================
//  AIChat API 层：网络请求、模型管理、API Key 管理
// ============================================================

import { API_PROVIDERS } from './config.js';

// ─── 模块级状态 ──────────────────────────────────
let _apiKey = localStorage.getItem('aiApiKey') || '';
let _apiProvider = localStorage.getItem('aiApiProvider') || 'nvidia';
let _abortController = null;

const _MIN_REQUEST_INTERVAL = 2500;
const _MAX_RETRIES = 5;
let _lastRequestTime = 0;
let _retryNoticeMsg = null;

// ─── 状态访问器 ──────────────────────────────────
export function getApiKey() { return _apiKey; }
export function setApiKey(key) { _apiKey = key; localStorage.setItem('aiApiKey', key); }
export function getApiProvider() { return _apiProvider; }
export function setApiProvider(p) { _apiProvider = p; localStorage.setItem('aiApiProvider', p); }
export function getAbortController() { return _abortController; }
export function setAbortController(c) { _abortController = c; }

// ─── API Key 管理 ──────────────────────────────────────

export function loadApiKey() {
  const saved = localStorage.getItem('aiApiKey');
  if (saved) {
    _apiKey = saved;
    return true;
  }
  return false;
}

export function saveApiKey(key) {
  _apiKey = key;
  localStorage.setItem('aiApiKey', key);
}

// ─── 模型管理 ──────────────────────────────────────────

export function getCurrentModel() {
  return localStorage.getItem('aiCurrentModel') || '';
}

export function selectModel(modelId) {
  localStorage.setItem('aiCurrentModel', modelId);
  const trigger = document.getElementById('aiModelTrigger');
  if (trigger) {
    const short = modelId.length > 35 ? modelId.slice(0, 32) + '...' : modelId;
    trigger.textContent = '🧠 ' + short;
  }
  const list = document.getElementById('aiModelList');
  if (list) {
    list.querySelectorAll('.ai-model-option').forEach(function (opt) {
      opt.classList.toggle('selected', opt.dataset.modelId === modelId);
    });
  }
  toggleModelPanel(false);
}

export function toggleModelPanel(forceState) {
  const panel = document.getElementById('aiModelPanel');
  if (!panel) return;
  const open = typeof forceState === 'boolean' ? forceState : !panel.classList.contains('open');
  panel.classList.toggle('open', open);
}

export function getCustomModels() {
  try { return JSON.parse(localStorage.getItem('aiCustomModels')) || []; }
  catch (_) { return []; }
}

export function saveCustomModel(provider, model, apiKey) {
  const models = getCustomModels();
  if (models.find(function (m) { return m.model === model && m.provider === provider; })) return false;
  models.push({ provider: provider, model: model, apiKey: apiKey });
  localStorage.setItem('aiCustomModels', JSON.stringify(models));
  if (apiKey) {
    localStorage.setItem('aiCustomKey_' + provider, apiKey);
  }
  return true;
}

async function loadModels() {
  const list = document.getElementById('aiModelList');
  const trigger = document.getElementById('aiModelTrigger');
  if (!list) return;

  const provider = API_PROVIDERS[_apiProvider] || API_PROVIDERS.nvidia;
  list.innerHTML = '<div class="ai-model-option" style="color:#4a6a7a">⌛ 加载模型中...</div>';

  let models = [];

  if (_apiProvider === 'deepseek') {
    models = (provider.models || []).map(function (m) { return { id: m, provider: 'DeepSeek' }; });
  } else {
    try {
      const res = await fetch(provider.baseUrl + '/models', {
        headers: { 'Authorization': 'Bearer ' + _apiKey }
      });
      if (res.ok) {
        const data = await res.json();
        const raw = data.data || [];
        const preferred = ['deepseek-ai/deepseek-v3.2', 'meta/llama-3.3-70b-instruct',
          'mistralai/mistral-large', 'google/gemma-2-27b-it',
          'microsoft/phi-3.5-mini-instruct', 'nvidia/llama-3.1-nemotron-70b-instruct'];
        const sorted = raw.slice().sort(function (a, b) {
          const aStr = a.id || a;
          const bStr = b.id || b;
          const aPref = preferred.findIndex(function (p) { return aStr.includes(p); });
          const bPref = preferred.findIndex(function (p) { return bStr.includes(p); });
          return (aPref >= 0 ? aPref : 99) - (bPref >= 0 ? bPref : 99) || aStr.localeCompare(bStr);
        });
        models = sorted.map(function (m) { return { id: m.id || m, provider: 'NVIDIA' }; });
      }
    } catch (_) {}
  }

  const customModels = getCustomModels();
  customModels.forEach(function (cm) {
    models.unshift({ id: cm.model, provider: cm.provider, custom: true });
  });

  if (models.length === 0) {
    list.innerHTML = '<div class="ai-model-option" style="color:#4a6a7a">无可用模型，请添加</div>';
    if (trigger) trigger.textContent = '🧠 无模型';
    return;
  }

  list.innerHTML = '';
  const currentModel = getCurrentModel();
  models.forEach(function (m) {
    const div = document.createElement('div');
    div.className = 'ai-model-option' + (m.id === currentModel ? ' selected' : '');
    const short = m.id.length > 45 ? m.id.slice(0, 42) + '...' : m.id;
    div.innerHTML = short + '<span class="model-provider">' + m.provider + '</span>';
    div.dataset.modelId = m.id;
    div.addEventListener('click', function () {
      selectModel(m.id);
    });
    list.appendChild(div);
  });

  if (trigger && !currentModel) trigger.textContent = '🧠 选择模型';
}

// ─── 获取当前模型对应的提供商和密钥 ──────────────────────
export function resolveProviderAndKey(model) {
  let provider = API_PROVIDERS[_apiProvider] || API_PROVIDERS.nvidia;
  let key = _apiKey;
  const customModels = getCustomModels();
  const customMatch = customModels.find(function (cm) { return cm.model === model; });
  if (customMatch) {
    const cp = API_PROVIDERS[customMatch.provider];
    if (cp) provider = cp;
    if (customMatch.apiKey) key = customMatch.apiKey;
    else {
      const sk = localStorage.getItem('aiCustomKey_' + customMatch.provider);
      if (sk) key = sk;
    }
  }
  return { provider, key };
}

// ─── 带重试的 fetch 封装（429/5xx 指数退避 + 客户端节流）──

export async function fetchWithRetry(url, options, addMessageFn) {
  const now = Date.now();
  const elapsed = now - _lastRequestTime;
  if (elapsed < _MIN_REQUEST_INTERVAL) {
    await new Promise(function (r) { setTimeout(r, _MIN_REQUEST_INTERVAL - elapsed); });
  }
  _lastRequestTime = Date.now();

  let lastErr;
  for (let attempt = 0; attempt <= _MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, options);
      if ((res.status === 429 || res.status >= 500) && attempt < _MAX_RETRIES) {
        let waitMs;
        if (res.status === 429) {
          waitMs = (Math.pow(2, attempt + 1) - 1) * 2000;
        } else {
          waitMs = Math.pow(2, attempt) * 1000;
        }
        const retryAfter = res.headers.get('Retry-After');
        if (retryAfter) {
          const parsed = parseInt(retryAfter, 10);
          if (!isNaN(parsed) && parsed > 0) waitMs = parsed * 1000;
        }
        const notice = '⏳ 请求过快(' + res.status + ')，' + Math.round(waitMs / 1000) + '秒后自动重试(' + (attempt + 1) + '/' + _MAX_RETRIES + ')…';
        if (!_retryNoticeMsg) {
          addMessageFn('system', notice);
          const msgs = document.getElementById('aiChatMessages');
          _retryNoticeMsg = msgs ? msgs.lastChild : null;
        } else if (_retryNoticeMsg) {
          _retryNoticeMsg.textContent = notice;
        }
        await new Promise(function (r) { setTimeout(r, waitMs); });
        _lastRequestTime = Date.now();
        continue;
      }
      if (_retryNoticeMsg) { _retryNoticeMsg = null; }
      return res;
    } catch (err) {
      if (_retryNoticeMsg) { _retryNoticeMsg = null; }
      if (err.name === 'AbortError') throw err;
      lastErr = err;
      if (attempt < _MAX_RETRIES) {
        await new Promise(function (r) { setTimeout(r, Math.pow(2, attempt) * 1000); });
        continue;
      }
      throw err;
    }
  }
  throw lastErr || new Error('重试次数用尽');
}

// ─── 添加模型模态框 ──────────────────────────────

export function showAddModelModal(addMessageFn) {
  const old = document.getElementById('aiAddModelModal');
  if (old) old.remove();

  const modal = document.createElement('div');
  modal.id = 'aiAddModelModal';
  modal.className = 'ai-add-model-modal';

  let providerOpts = '';
  for (const key in API_PROVIDERS) {
    providerOpts += '<option value="' + key + '">' + API_PROVIDERS[key].name + '</option>';
  }

  modal.innerHTML =
    '<h3>添加模型</h3>' +
    '<label>服务商</label>' +
    '<select id="aiModalProvider">' + providerOpts + '</select>' +
    '<label>模型</label>' +
    '<select id="aiModalModel"></select>' +
    '<div class="ai-modal-key-row">' +
      '<label>API 密钥</label>' +
      '<a id="aiModalKeyLink" class="ai-modal-key-link" href="javascript:void(0)">获取API</a>' +
    '</div>' +
    '<input type="password" id="aiModalApiKey" placeholder="输入 API Key" />' +
    '<div class="ai-add-model-actions">' +
      '<button class="ai-modal-cancel" id="aiModalCancel">取消</button>' +
      '<button class="ai-modal-confirm" id="aiModalConfirm">添加</button>' +
    '</div>';

  document.body.appendChild(modal);

  const providerSel = document.getElementById('aiModalProvider');
  const modelSel = document.getElementById('aiModalModel');
  const keyLink = document.getElementById('aiModalKeyLink');
  const keyInput = document.getElementById('aiModalApiKey');

  function updateModelOptions() {
    const prov = API_PROVIDERS[providerSel.value];
    if (!prov) return;
    modelSel.innerHTML = '';
    if (prov.models.length === 0) {
      const input = document.createElement('input');
      input.type = 'text';
      input.id = 'aiModalModelCustom';
      input.placeholder = '输入模型 ID，如 gpt-4o';
      input.className = 'ai-modal-model-input';
      modelSel.replaceWith(input);
      keyInput.placeholder = prov.placeholder || '输入 API Key';
    } else {
      // 确保页面中存在 <select id="aiModalModel">
      let sel = document.getElementById('aiModalModel');
      if (!sel || sel.tagName !== 'SELECT') {
        // 移除可能的自定义输入框
        const customInput = document.getElementById('aiModalModelCustom');
        if (customInput) customInput.remove();
        // 重新创建 select
        const newSel = document.createElement('select');
        newSel.id = 'aiModalModel';
        // 找到插入位置（在 API Key 行之前）
        const keyRow = document.querySelector('.ai-modal-key-row');
        if (keyRow) {
          keyRow.parentNode.insertBefore(newSel, keyRow);
        } else {
          document.getElementById('aiModalApiKey').parentNode.insertBefore(newSel, document.getElementById('aiModalApiKey'));
        }
        sel = newSel;
      }
      sel.innerHTML = '';
      prov.models.forEach(function (m) {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        sel.appendChild(opt);
      });
      keyInput.placeholder = prov.placeholder || '输入 API Key';
    }
    if (prov.keyUrl) {
      keyLink.onclick = function (e) {
        e.preventDefault();
        if (window.api && window.api.openExternalUrl) {
          window.api.openExternalUrl(prov.keyUrl);
        } else {
          const a = document.createElement('a');
          a.href = prov.keyUrl;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
      };
      keyLink.style.display = '';
    } else {
      keyLink.onclick = null;
      keyLink.style.display = 'none';
    }
  }

  providerSel.addEventListener('change', updateModelOptions);
  updateModelOptions();

  document.getElementById('aiModalCancel').addEventListener('click', function () {
    modal.remove();
  });

  document.getElementById('aiModalConfirm').addEventListener('click', function () {
    const provider = providerSel.value;
    const modelEl = document.getElementById('aiModalModel');
    const modelCustomEl = document.getElementById('aiModalModelCustom');
    const model = modelEl ? modelEl.value : (modelCustomEl ? modelCustomEl.value.trim() : '');
    const apiKey = keyInput.value.trim();
    if (!model) return;
    saveCustomModel(provider, model, apiKey);
    if (apiKey && !_apiKey) {
      saveApiKey(apiKey);
    }
    modal.remove();
    loadModels();
  });

  modal.addEventListener('click', function (e) {
    if (e.target === modal) modal.remove();
  });
}

// 导出 loadModels 供 index.js 初始化时调用
export { loadModels };
