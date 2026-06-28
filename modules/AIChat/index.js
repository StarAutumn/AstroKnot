// ============================================================
//  AIChat 入口：initAIChat() — 聚合子模块，发送消息核心逻辑
// ============================================================

import { MODES } from './config.js';
import { loadApiKey, getCurrentModel, getCustomModels, getApiKey, loadModels, toggleModelPanel, showAddModelModal, fetchWithRetry, resolveProviderAndKey, setAbortController, getAbortController } from './api.js';
import { executeToolCall, getToolDisplayName, buildProjectContext, confirmImportMarkdown, getPendingMarkdown, getPendingTopic, getPendingParentId, clearPendingMarkdown, saveStateSnapshot } from './tools.js';
import { addMessage, addLoading, removeLoading, toggleAIDialog, switchMode, saveCurrentToHistory, toggleHistoryPanel, stopGeneration, getConversationHistory, setConversationHistory, getCurrentMode, showMarkdownPreview } from './ui.js';

// ─── 模拟模式状态与场景 ──────────────────────────
let _mockMode = localStorage.getItem('aiMockMode') === 'true';

export function isMockMode() { return _mockMode; }

export function toggleMockMode() {
  _mockMode = !_mockMode;
  localStorage.setItem('aiMockMode', _mockMode);
  var sw = document.getElementById('aiMockSwitch');
  if (sw) {
    sw.textContent = _mockMode ? '⚡开启' : '关闭';
    sw.classList.toggle('active', _mockMode);
  }
  return _mockMode;
}

var MOCK_SCENARIOS = [
  {
    keywords: ['构建', '建立', '知识树', '知识体系', '生成', '创建', '机器学习', '深度', '网络'],
    thinking: '好的，我将为您构建一个完整的机器学习知识体系。让我先用 Markdown 格式写出树结构，然后写入项目...',
    toolCalls: [{
      function: {
        name: 'editProjectMarkdown',
        arguments: JSON.stringify({
          edits: [
            {
              search: '',
              replace: '# 机器学习\n\n## 监督学习\n\n### 线性回归\n通过最小化均方误差拟合特征与标签之间的线性关系，是最基础的回归算法。\n\n### 决策树\n基于信息增益、增益率或基尼系数递归划分特征空间，构建树形决策结构。\n\n### 支持向量机 (SVM)\n通过寻找最大间隔超平面进行分类，核函数可处理非线性可分问题。\n\n## 无监督学习\n\n### K-Means 聚类\n将样本划分为 K 个簇，通过迭代优化簇内距离和来更新簇中心。\n\n### 主成分分析 (PCA)\n通过正交变换将原始特征转换为线性无关的主成分，用于降维和去噪。\n\n## 深度学习\n\n### 卷积神经网络 (CNN)\n利用卷积核和池化层提取空间层级特征，广泛应用于图像识别和目标检测。\n\n### 循环神经网络 (RNN)\n通过循环连接处理序列数据，适用于机器翻译、情感分析等任务。\n\n### Transformer\n基于自注意力机制的并行化架构，是大语言模型的基础范式。\n\n## 强化学习\n\n### Q-Learning\n通过 Q 表记录状态-动作价值函数，采用 ε-贪心策略平衡探索与利用。\n\n### 深度 Q 网络 (DQN)\n用神经网络近似 Q 函数，结合经验回放和目标网络提升训练稳定性。'
            }
          ]
        })
      }
    }]
  },
  {
    keywords: ['查看', '读取', '结构', '当前', '导出', '树'],
    thinking: '我来读取当前知识图谱的树结构...\n\n已读取到完整的树结构信息。',
    toolCalls: [{
      function: {
        name: 'readProjectMarkdown',
        arguments: JSON.stringify({ maxDepth: 6, includeContent: true })
      }
    }]
  },
  {
    keywords: ['颜色', '红色', '蓝色', '绿色', '大小', '放大', '缩小', '形状', '图形', '样式'],
    thinking: '我来调整节点的视觉属性。让我先读取当前树结构...',
    toolCalls: [{
      function: {
        name: 'readProjectMarkdown',
        arguments: JSON.stringify({ maxDepth: 6, includeContent: false })
      }
    }]
  }
];

function _matchMockScenario(input) {
  var lower = input.toLowerCase();
  for (var i = 0; i < MOCK_SCENARIOS.length; i++) {
    var kws = MOCK_SCENARIOS[i].keywords;
    for (var j = 0; j < kws.length; j++) {
      if (lower.indexOf(kws[j]) !== -1) return MOCK_SCENARIOS[i];
    }
  }
  return null;
}

function _mockFallbackResponse(input) {
  var lower = input.toLowerCase();
  if (lower.indexOf('你好') !== -1 || lower.indexOf('hi') !== -1 || lower.indexOf('hello') !== -1) {
    return '你好！我是 AstroKnot 知识图谱助手 🧪 模拟模式。您可以尝试以下指令：\n\n• "帮我构建机器学习知识体系" → 演示知识树生成\n• "查看当前树结构" → 演示树结构读取\n• "帮我调整节点" → 演示节点样式修改\n\n切换到真实模式需关闭模拟模式开关。';
  }
  return '🧪 模拟模式已开启！支持以下演示场景：\n\n• "帮我构建机器学习知识体系"\n• "查看当前树结构"\n• "帮我调整节点"\n\n请尝试以上指令。';
}

// ─── 发送消息（支持 Chat/Agent 双模式）────────────────

async function _doSend() {
  const input = document.getElementById('aiChatInput');
  const sendBtn = document.getElementById('aiSendBtn');
  const stopBtn = document.getElementById('aiStopBtn');
  if (!input || !sendBtn) return;

  const val = input.value.trim();
  if (!val) return;

  const model = getCurrentModel();
  if (!model && !isMockMode()) {
    addMessage('error', '请先在顶部选择模型');
    return;
  }

  const customModels = getCustomModels();
  const customMatch = customModels.find(function (cm) { return cm.model === model; });
  const hasKey = getApiKey() || (customMatch && (customMatch.apiKey || localStorage.getItem('aiCustomKey_' + customMatch.provider)));
  if (!hasKey && !isMockMode()) {
    addMessage('error', '请先添加模型并填写 API Key');
    return;
  }

  sendBtn.disabled = true;
  sendBtn.textContent = '...';
  if (stopBtn) stopBtn.style.display = 'inline-block';

  const conversationHistory = getConversationHistory();
  conversationHistory.push({ role: 'user', content: val });
  addMessage('user', val);
  input.value = '';
  addLoading();

  const abortCtrl = new AbortController();
  setAbortController(abortCtrl);

  const currentMode = getCurrentMode();
  const modeConfig = MODES[currentMode];
  let messages = [];

  messages.push({ role: 'system', content: modeConfig.systemPrompt });

  if (currentMode === 'chat' || currentMode === 'agent') {
    const context = buildProjectContext();
    messages.push({
      role: 'system',
      content: `[当前项目上下文 - ${new Date().toLocaleTimeString()}]\n${context}`
    });
  }

  messages.push(...conversationHistory);

  try {
    const requestBody = {
      model: model,
      messages: messages,
      temperature: currentMode === 'agent' ? 0.3 : 0.5,
      max_tokens: 4096,
      stream: true
    };

    if (currentMode === 'agent' && modeConfig.tools) {
      requestBody.tools = modeConfig.tools;
      requestBody.tool_choice = 'auto';
    }

    const { provider: _sendProvider, key: _sendKey } = resolveProviderAndKey(model);

    // ─── 模拟模式：跳过 API 调用，直接构造 mock 工具调用 ───
    var toolCalls = [];
    var fullText = '';
    var assistantDiv = null;
    var msgs = null;

    if (isMockMode() && currentMode === 'agent') {
      removeLoading();
      var mock = _matchMockScenario(val);
      if (mock) {
        fullText = mock.thinking;
        toolCalls = JSON.parse(JSON.stringify(mock.toolCalls));
        toolCalls.forEach(function(tc, i) { tc.id = 'mock_' + Date.now() + '_' + i; });
        assistantDiv = document.createElement('div');
        assistantDiv.className = 'ai-message assistant';
        msgs = document.getElementById('aiChatMessages');
        if (msgs) msgs.appendChild(assistantDiv);
        assistantDiv.textContent = fullText;
      } else {
        var fallbackText = _mockFallbackResponse(val);
        addMessage('assistant', fallbackText);
        conversationHistory.push({ role: 'assistant', content: fallbackText });
        sendBtn.disabled = false;
        sendBtn.textContent = '发送';
        if (stopBtn) stopBtn.style.display = 'none';
        input.focus();
        return;
      }
    } else {
      const res = await fetchWithRetry(_sendProvider.baseUrl + '/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + _sendKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
        signal: abortCtrl.signal
      }, addMessage);

      removeLoading();

      if (!res.ok) {
        let errMsg = '请求失败 (' + res.status + ')';
        try { const errData = await res.json(); errMsg = errData.error?.message || errMsg; } catch (_) {}
        if (res.status === 401) {
          addMessage('error', 'API Key 无效，请在 ⚙️ 设置 中更新');
        } else if (res.status === 429) {
          addMessage('error', '请求过于频繁，已达到 API 速率上限。请稍等片刻再试，或降低发送频率。');
          addMessage('system', '💡 提示：Agent 模式每次对话会发送多次请求，更容易触发限制。');
        } else {
          addMessage('error', errMsg);
        }
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      assistantDiv = document.createElement('div');
      assistantDiv.className = 'ai-message assistant';
      msgs = document.getElementById('aiChatMessages');
      if (msgs) msgs.appendChild(assistantDiv);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const payload = trimmed.slice(6);
          if (payload === '[DONE]') continue;

          try {
            const parsed = JSON.parse(payload);
            const delta = parsed.choices?.[0]?.delta;

            if (delta?.content) {
              fullText += delta.content;
              assistantDiv.textContent = fullText;
              if (msgs) msgs.scrollTop = msgs.scrollHeight;
            }

            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                if (tc.index !== undefined) {
                  if (!toolCalls[tc.index]) {
                    toolCalls[tc.index] = { id: tc.id, function: { name: '', arguments: '' } };
                  }
                  if (tc.function?.name) toolCalls[tc.index].function.name += tc.function.name;
                  if (tc.function?.arguments) toolCalls[tc.index].function.arguments += tc.function.arguments;
                }
              }
            }
          } catch (_) {}
        }
      }
    }

    if (fullText && !toolCalls.length) {
      conversationHistory.push({ role: 'assistant', content: fullText });
    }

    // 执行工具调用（Agent 模式）
    if (toolCalls.length > 0 && currentMode === 'agent') {
      // 保存本轮对话发起前的状态快照
      saveStateSnapshot(conversationHistory.length - 1);

      const progressDiv = document.createElement('div');
      progressDiv.className = 'ai-agent-progress';
      progressDiv.innerHTML = '<div class="agent-progress-header">🤖 Agent 执行中</div><div class="agent-progress-steps"></div>';
      assistantDiv.appendChild(progressDiv);
      const stepsContainer = progressDiv.querySelector('.agent-progress-steps');

      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < toolCalls.length; i++) {
        const tc = toolCalls[i];
        const funcName = tc.function.name;
        let funcArgs;
        try { funcArgs = JSON.parse(tc.function.arguments); } catch(e) { funcArgs = {}; }

        const stepDiv = document.createElement('div');
        stepDiv.className = 'agent-step';
        stepDiv.innerHTML = `<span class="step-icon">⏳</span> <span class="step-name">${getToolDisplayName(funcName)}</span> <span class="step-detail"></span>`;
        stepsContainer.appendChild(stepDiv);
        if (msgs) msgs.scrollTop = msgs.scrollHeight;

        addMessage('tool', `🔧 ${getToolDisplayName(funcName)} ${JSON.stringify(funcArgs)}`);

        const result = await executeToolCall(funcName, funcArgs);

        conversationHistory.push({ role: 'assistant', content: null, tool_calls: [tc] });
        conversationHistory.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });

        // 检测是否需要预览（Markdown 知识树）
        if (result.needsPreview) {
          successCount++;
          stepDiv.querySelector('.step-icon').textContent = '📋';
          stepDiv.classList.add('success');
          stepDiv.querySelector('.step-detail').textContent = result.message;
          addMessage('tool-result', '📋 ' + result.message);

          // 显示预览面板
          showMarkdownPreview(
            getPendingMarkdown(),
            getPendingTopic(),
            result.nodeCount,
            result.contentCount,
            async function onConfirm() {
              const importResult = await confirmImportMarkdown();
              if (importResult.success) {
                addMessage('tool-result', '✅ ' + importResult.message);
              } else {
                addMessage('error', '❌ ' + (importResult.error || '导入失败'));
              }
            },
            function onCancel() {
              clearPendingMarkdown();
              addMessage('system', '已取消导入');
            },
            getPendingParentId()
          );
        } else if (result.success || result.results || result.content !== undefined || result.markdown !== undefined || result.html !== undefined) {
          successCount++;
          stepDiv.querySelector('.step-icon').textContent = '✅';
          stepDiv.classList.add('success');
          if (result.message) {
            stepDiv.querySelector('.step-detail').textContent = result.message;
          } else if (result.markdown) {
            stepDiv.querySelector('.step-detail').textContent = '已读取树结构（' + result.nodeCount + ' 个节点）';
          } else if (result.html !== undefined) {
            stepDiv.querySelector('.step-detail').textContent = '已读取节点内容（' + result.length + ' 字符）';
          }
          addMessage('tool-result', `✅ ${result.message || (result.markdown ? '已读取树结构' : '完成')}`);
        } else {
          failCount++;
          stepDiv.querySelector('.step-icon').textContent = '❌';
          stepDiv.classList.add('error');
          stepDiv.querySelector('.step-detail').textContent = result.error || '失败';
          addMessage('tool-result', `❌ ${result.error || '执行失败'}`);
        }

        assistantDiv.innerHTML += `<div style="margin-top:3px;font-size:11px;color:${result.success ? '#7dd' : '#f88'};">${result.success ? '✅' : '❌'} ${result.message || result.error || ''}</div>`;
        if (msgs) msgs.scrollTop = msgs.scrollHeight;
      }

      progressDiv.querySelector('.agent-progress-header').textContent =
        `🤖 执行完成: ${successCount} 成功${failCount > 0 ? ', ' + failCount + ' 失败' : ''}`;

      _continueAfterToolCalls(model, msgs, assistantDiv);
    }

  } catch (err) {
    removeLoading();
    if (err.name === 'AbortError') {
      const wasText = conversationHistory[conversationHistory.length - 1]?.role === 'assistant';
      if (!wasText) addMessage('assistant', '[已停止]');
    } else {
      addMessage('error', '网络错误: ' + err.message);
    }
  } finally {
    setAbortController(null);
    sendBtn.disabled = false;
    sendBtn.textContent = '发送';
    if (stopBtn) stopBtn.style.display = 'none';
    input.focus();
  }
}

// ─── 工具调用后继续对话 ──────────────────────────────
async function _continueAfterToolCalls(model, msgsContainer, assistantDiv) {
  addLoading();

  const currentMode = getCurrentMode();
  const modeConfig = MODES[currentMode];
  const conversationHistory = getConversationHistory();
  const messages = [
    { role: 'system', content: modeConfig.systemPrompt },
    ...conversationHistory
  ];

  try {
    // ─── 模拟模式：跳过后续总结 API 调用 ───
    if (isMockMode()) {
      removeLoading();
      var summaryText = '✅ 模拟模式 · 已完成所有操作！工具已成功执行，知识图谱已更新。您可以继续询问其他问题或进行下一步操作。';
      var summaryDiv = document.createElement('div');
      summaryDiv.className = 'ai-message assistant';
      summaryDiv.style.marginTop = '8px';
      summaryDiv.style.borderLeft = '3px solid #aa66ee';
      summaryDiv.style.paddingLeft = '10px';
      summaryDiv.textContent = summaryText;
      if (msgsContainer) msgsContainer.appendChild(summaryDiv);
      if (msgsContainer) msgsContainer.scrollTop = msgsContainer.scrollHeight;
      conversationHistory.push({ role: 'assistant', content: summaryText });
      return;
    }

    const { provider: _contProvider, key: _contKey } = resolveProviderAndKey(model);

    const res = await fetchWithRetry(_contProvider.baseUrl + '/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + _contKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        temperature: 0.5,
        max_tokens: 2048,
        stream: true,
        tools: modeConfig.tools,
        tool_choice: 'auto'
      }),
      signal: getAbortController()?.signal
    }, addMessage);

    removeLoading();

    if (!res.ok) {
      if (res.status === 429) {
        addMessage('error', '后续总结请求被限流(429)，工具已执行但无法生成总结。请稍后重试或切换到 Chat 模式。');
      } else if (res.status === 401) {
        addMessage('error', 'API Key 无效，请在 ⚙️ 设置 中更新');
      } else {
        addMessage('error', '后续对话失败 (' + res.status + ')');
      }
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const payload = trimmed.slice(6);
        if (payload === '[DONE]') continue;

        try {
          const parsed = JSON.parse(payload);
          const content = parsed.choices?.[0]?.delta?.content || '';
          if (content) {
            fullText += content;
            const summaryDiv = document.createElement('div');
            summaryDiv.className = 'ai-message assistant';
            summaryDiv.style.marginTop = '8px';
            summaryDiv.style.borderLeft = '3px solid #aa66ee';
            summaryDiv.style.paddingLeft = '10px';
            summaryDiv.textContent = fullText;
            if (msgsContainer) msgsContainer.appendChild(summaryDiv);
            if (msgsContainer) msgsContainer.scrollTop = msgsContainer.scrollHeight;
          }
        } catch (_) {}
      }
    }

    if (fullText) {
      conversationHistory.push({ role: 'assistant', content: fullText });
    }
  } catch (err) {
    removeLoading();
    console.error('工具后续对话错误:', err);
  }
}

// ─── 初始化 ────────────────────────────────────────────

export function initAIChat() {
  const dialog = document.getElementById('aiFloatingDialog');
  if (!dialog) return;

  // ---------- 加载保存的 API Key ----------
  loadApiKey();

  // ---------- 任务栏 AI 按钮 ----------
  const taskbarBtn = document.getElementById('aiTaskbarBtn');
  if (taskbarBtn) {
    taskbarBtn.addEventListener('click', toggleAIDialog);
  }

  // ---------- 关闭按钮 ----------
  const closeBtn = document.getElementById('aiCloseBtn');
  if (closeBtn) {
    closeBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleAIDialog();
    });
  }

  // ---------- 模型上拉面板 ----------
  const modelTrigger = document.getElementById('aiModelTrigger');
  const modelPanel = document.getElementById('aiModelPanel');
  const addModelBtn = document.getElementById('aiAddModelBtn');

  if (modelTrigger) {
    const saved = getCurrentModel();
    if (saved) {
      const short = saved.length > 35 ? saved.slice(0, 32) + '...' : saved;
      modelTrigger.textContent = '🧠 ' + short;
    }
    modelTrigger.addEventListener('click', function () {
      toggleModelPanel();
    });
  }

  if (addModelBtn) {
    addModelBtn.addEventListener('click', function () {
      toggleModelPanel(false);
      showAddModelModal(addMessage);
    });
  }

  // ---------- 模拟模式开关 ----------
  var mockToggle = document.getElementById('aiMockToggle');
  if (mockToggle) {
    var sw = document.getElementById('aiMockSwitch');
    if (sw) {
      sw.textContent = isMockMode() ? '⚡开启' : '关闭';
      sw.classList.toggle('active', isMockMode());
    }
    mockToggle.addEventListener('click', function () {
      toggleMockMode();
      addMessage('system', isMockMode() ? '🧪 模拟模式已开启' : '🧪 模拟模式已关闭');
    });
  }

  document.addEventListener('click', function (e) {
    if (!modelPanel || !modelPanel.classList.contains('open')) return;
    if (!modelPanel.contains(e.target) && e.target !== modelTrigger) {
      toggleModelPanel(false);
    }
  });

  // ---------- 导出对话 ----------
  const exportBtn = document.getElementById('aiExportBtn');
  if (exportBtn) {
    exportBtn.addEventListener('click', function () {
      const msgs = document.getElementById('aiChatMessages');
      if (!msgs) return;
      const text = Array.from(msgs.children)
        .map(function (m) { return '[' + (m.className.replace('ai-message ', '')) + '] ' + m.textContent; })
        .join('\n---\n');
      const blob = new Blob([text], { type: 'text/plain' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'AI对话_' + new Date().toLocaleDateString() + '.txt';
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }

  // ---------- 历史对话 ----------
  const historyBtn = document.getElementById('aiHistoryBtn');
  if (historyBtn) {
    historyBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleHistoryPanel();
    });
  }

  document.addEventListener('click', function (e) {
    const panel = document.getElementById('aiHistoryPanel');
    const btn = document.getElementById('aiHistoryBtn');
    if (panel && btn && !panel.contains(e.target) && !btn.contains(e.target)) {
      toggleHistoryPanel(false);
    }
  });

  // ---------- 新建对话 ----------
  const newChatBtn = document.getElementById('aiNewChatBtn');
  if (newChatBtn) {
    newChatBtn.addEventListener('click', function () {
      saveCurrentToHistory();
      const msgs = document.getElementById('aiChatMessages');
      if (!msgs) return;
      const modeInfo = MODES[getCurrentMode()];
      msgs.innerHTML = '<div class="ai-message system">你好！我是 ' + modeInfo.name + ' - ' + modeInfo.desc + '</div>';
      setConversationHistory([]);
      toggleHistoryPanel(false);
    });
  }

  // ---------- 智能体选择（Chat/Agent 切换） ----------
  const agentSelect = document.getElementById('aiAgentSelect');
  if (agentSelect) {
    agentSelect.addEventListener('change', function() {
      const val = this.value;
      if (val === 'chat' || val === 'agent') {
        switchMode(val);
      }
    });
  }

  // ---------- 停止按钮 ----------
  const inputArea = document.querySelector('.ai-input-footer');
  if (inputArea) {
    const stopBtn = document.createElement('button');
    stopBtn.id = 'aiStopBtn';
    stopBtn.textContent = '⏹ 停止';
    stopBtn.style.display = 'none';
    stopBtn.addEventListener('click', function () {
      stopGeneration(getAbortController());
    });
    const sendBtn = document.getElementById('aiSendBtn');
    if (sendBtn) {
      inputArea.insertBefore(stopBtn, sendBtn);
    }
  }

  // ---------- 发送 ----------
  const sendBtn = document.getElementById('aiSendBtn');
  const chatInput = document.getElementById('aiChatInput');
  if (sendBtn && chatInput) {
    sendBtn.addEventListener('click', _doSend);
    chatInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!sendBtn.disabled) {
          _doSend();
        }
      }
    });
  }

  // ---------- 如果已有 Key，自动加载模型 ----------
  if (getApiKey()) {
    setTimeout(loadModels, 500);
  }
}