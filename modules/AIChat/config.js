// ============================================================
//  AIChat 配置：常量、API 提供商、模式定义、工具 Schema
// ============================================================

export const HISTORY_KEY = 'aiChatHistory';
export const MAX_HISTORY = 20;

export const API_PROVIDERS = {
  nvidia: {
    name: 'NVIDIA',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    keyPrefix: 'nvapi-',
    placeholder: 'nvapi-...',
    keyUrl: 'https://build.nvidia.com/',
    models: ['deepseek-ai/deepseek-v3.2', 'meta/llama-3.3-70b-instruct', 'mistralai/mistral-large', 'nvidia/llama-3.1-nemotron-70b-instruct', 'google/gemma-2-27b-it', 'microsoft/phi-3.5-mini-instruct']
  },
  deepseek: {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    keyPrefix: 'sk-',
    placeholder: 'sk-...',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    models: ['deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-chat', 'deepseek-reasoner']
  },
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    keyPrefix: 'sk-',
    placeholder: 'sk-...',
    keyUrl: 'https://platform.openai.com/api-keys',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o3-mini']
  },
  zhipu: {
    name: '智谱 AI',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    keyPrefix: '',
    placeholder: '输入 API Key',
    keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    models: ['glm-4-plus', 'glm-4-flash', 'glm-4-long']
  },
  moonshot: {
    name: '月之暗面 (Kimi)',
    baseUrl: 'https://api.moonshot.cn/v1',
    keyPrefix: 'sk-',
    placeholder: 'sk-...',
    keyUrl: 'https://platform.moonshot.cn/console/api-keys',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k']
  },
  qwen: {
    name: '通义千问 (阿里)',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    keyPrefix: 'sk-',
    placeholder: 'sk-...',
    keyUrl: 'https://dashscope.console.aliyun.com/apiKey',
    models: ['qwen-max', 'qwen-plus', 'qwen-turbo']
  },
  siliconflow: {
    name: 'SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    keyPrefix: 'sk-',
    placeholder: 'sk-...',
    keyUrl: 'https://cloud.siliconflow.cn/account/ak',
    models: ['deepseek-ai/DeepSeek-V3', 'Qwen/Qwen2.5-72B-Instruct', 'meta-llama/Meta-Llama-3.1-70B-Instruct']
  },
  groq: {
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    keyPrefix: 'gsk_',
    placeholder: 'gsk_...',
    keyUrl: 'https://console.groq.com/keys',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768']
  },
  ollama: {
    name: 'Ollama (本地)',
    baseUrl: 'http://localhost:11434/v1',
    keyPrefix: '',
    placeholder: '本地运行，无需 API Key',
    keyUrl: 'https://ollama.com/download',
    models: ['deepseek-r1:8b', 'deepseek-r1:7b', 'qwen2.5:7b', 'qwen2.5:14b', 'llama3.2:3b', 'llama3.1:8b', 'mistral:7b', 'phi4:14b', 'nemotron-mini:4b']
  },
  custom: {
    name: '自定义 (OpenAI 兼容)',
    baseUrl: '',
    keyPrefix: '',
    placeholder: '输入 API Key',
    keyUrl: '',
    models: []
  }
};

// ─── 模式定义 ──────────────────────────────────────
export const MODES = {
  chat: {
    name: '🗣️ Chat',
    desc: '只读分析模式',
    systemPrompt: `你是 AstroKnot 知识图谱助手的【分析顾问】。
你的能力范围：
1. 分析当前知识图谱的结构、节点关系和学习路径
2. 根据用户的问题提供建议和规划方案
3. 解释概念、推荐学习方法
4. 总结节点内容、发现知识盲点

重要限制：你只能提供建议和分析，不能直接执行任何操作。如果用户需要执行操作（如创建节点、添加连线），请建议用户切换到 Agent 模式。
请用中文回答，回答要简洁实用。`,
    tools: null,
    costLevel: 'low'
  },
  agent: {
    name: '🤖 Agent',
    desc: '智能体执行模式',
    systemPrompt: `你是 AstroKnot 知识图谱的【智能助手】。

## 核心理念
你通过直接编辑项目的 Markdown 文件和节点的 HTML 内容来操作知识图谱，就像在编辑代码文件一样。不需要调用一堆 API，只需要用 SEARCH/REPLACE 模式精确修改文本。

## 数据模型
- **项目 Markdown**：用 # 标题层级表示知识树结构。# 是根节点，## 是子节点，### 是孙节点...标题下的文本是节点内容摘要。每个标题后附带节点 ID 注释，格式如 \`# 节点名 <!-- id:node_xxx -->\`，调用 readNodeHTML/editNodeHTML 时需要用到这个 ID。
- **节点 HTML**：每个节点的详细内容以 HTML 格式存储（富文本、代码块、表格等）。

## 工作流程
1. **读取**：先用 readProjectMarkdown 读取当前树结构，理解项目全貌
2. **定位**：在 Markdown 中找到需要修改的部分
3. **编辑**：用 editProjectMarkdown 的 SEARCH/REPLACE 精确修改树结构
4. **内容**：如需修改节点详细内容，用 readNodeHTML 读取后用 editNodeHTML 修改

## SEARCH/REPLACE 规则（重要！）
和编辑代码完全一样：
- **search**：要查找的原文片段，必须与当前文本完全一致（包括缩进、换行）
- **replace**：替换后的新文本
- search 必须在全文中唯一匹配，如果不唯一，需要增加上下文使其唯一
- 一次可以提交多个 edits，按顺序执行

### 示例：改名
用户说"把'线性回归'改名为'线性回归模型'"
\`\`\`json
{
  "edits": [
    {
      "search": "### 线性回归\\n通过最小化均方误差",
      "replace": "### 线性回归模型\\n通过最小化均方误差"
    }
  ]
}
\`\`\`
（加入下一行内容确保唯一匹配）

### 示例：添加子节点
用户说"在机器学习下添加神经网络"
\`\`\`json
{
  "edits": [
    {
      "search": "## 机器学习\\n\\n### 决策树",
      "replace": "## 机器学习\\n\\n### 神经网络\\n模拟生物神经网络的计算模型。\\n\\n### 决策树"
    }
  ]
}
\`\`\`

### 示例：删除节点
\`\`\`json
{
  "edits": [
    {
      "search": "### 过时节点\\n这部分内容已不需要\\n\\n",
      "replace": ""
    }
  ]
}
\`\`\`

### 示例：修改节点 HTML 内容
先用 readNodeHTML 读取内容，然后：
\`\`\`json
{
  "nodeId": "node_xxx",
  "edits": [
    {
      "search": "<p>旧内容</p>",
      "replace": "<p>新内容</p>"
    }
  ]
}
\`\`\`

## 操作后行为
- editProjectMarkdown 执行后会自动重新解析 Markdown → 重建树 → 刷新视图 → 自动排列布局
- 所有修改都可通过对话历史回退（系统自动保存快照）

## 回复风格
- 简洁直接，不要废话
- 操作完成后用 ✅❌ 标记结果
- 出错时给出替代方案
- 复杂任务先列计划再执行`,
    tools: [
      {
        type: 'function',
        function: {
          name: 'readProjectMarkdown',
          description: `读取当前知识图谱的完整树结构，返回 Markdown 格式。
# 标题层级表示节点层级，标题下是节点内容摘要。
在任何修改操作前，必须先调用此工具了解当前结构。`,
          parameters: {
            type: 'object',
            properties: {
              maxDepth: { type: 'integer', description: '最大深度，默认6' },
              includeContent: { type: 'boolean', description: '是否包含内容摘要，默认true' }
            },
            required: []
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'editProjectMarkdown',
          description: `通过 SEARCH/REPLACE 模式精确修改知识图谱的树结构 Markdown。
系统会自动解析修改后的 Markdown、重建知识树、刷新视图并自动排列布局。
每次修改前会自动保存快照，可通过对话历史回退。

关键规则：
- search 必须与当前 Markdown 中的文本完全一致
- search 必须唯一匹配，如果不唯一需增加上下文
- 可以一次提交多个 edits，按顺序执行
- 要删除内容：把 search 匹配的部分替换为空字符串`,
          parameters: {
            type: 'object',
            properties: {
              edits: {
                type: 'array',
                description: 'SEARCH/REPLACE 编辑列表，按顺序执行',
                items: {
                  type: 'object',
                  properties: {
                    search: { type: 'string', description: '要查找的原文，必须与当前文本完全一致' },
                    replace: { type: 'string', description: '替换后的新文本' }
                  },
                  required: ['search', 'replace']
                }
              }
            },
            required: ['edits']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'readNodeHTML',
          description: `读取某个节点的详细 HTML 内容（富文本笔记）。
需要先知道 nodeId（可从 readProjectMarkdown 返回结果中获取）。`,
          parameters: {
            type: 'object',
            properties: {
              nodeId: { type: 'string', description: '目标节点ID' }
            },
            required: ['nodeId']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'editNodeHTML',
          description: `通过 SEARCH/REPLACE 模式精确修改节点的 HTML 内容。
与 editProjectMarkdown 用法一致：找到要改的片段，替换为新内容。
修改后会自动保存快照，可回退。`,
          parameters: {
            type: 'object',
            properties: {
              nodeId: { type: 'string', description: '目标节点ID' },
              edits: {
                type: 'array',
                description: 'SEARCH/REPLACE 编辑列表，按顺序执行',
                items: {
                  type: 'object',
                  properties: {
                    search: { type: 'string', description: '要查找的原文，必须与当前HTML完全一致' },
                    replace: { type: 'string', description: '替换后的新文本' }
                  },
                  required: ['search', 'replace']
                }
              }
            },
            required: ['nodeId', 'edits']
          }
        }
      }
    ],
    costLevel: 'medium'
  }
};

// ─── 工具名称中文映射 ──────────────────────────────
export const TOOL_DISPLAY_NAMES = {
  readProjectMarkdown: '📄 读取树结构',
  editProjectMarkdown: '✏️ 编辑树结构',
  readNodeHTML: '📖 读取节点内容',
  editNodeHTML: '✏️ 编辑节点内容',
  // 保留旧工具的映射，避免引用报错
  buildTree: '🌳 构建完整树',
  scaffoldKnowledge: '🚀 知识脚手架',
  generateKnowledgeTree: '🚀 知识脚手架',
  getTreeMarkdown: '📄 导出树结构',
  batchCreateNodes: '📦 批量创建节点',
  createTextNode: '📝 新建文本节点',
  createStepNode: '⬆ 新建步骤节点',
  createChildNode: '➕ 新建子节点',
  createNextStepNode: '⬇ 新建下一步',
  addConnection: '🔗 添加连线',
  removeConnection: '✂️ 删除连线',
  setNodeSize: '📏 调整大小',
  setNodeColor: '🎨 设置颜色',
  setNodeShape: '🔷 设置形状',
  searchNodes: '🔍 搜索节点',
  getNodeContent: '📖 读取内容',
  getGraphOverview: '📊 图谱概览',
  updateNodeContent: '✏️ 更新内容',
  deleteNode: '🗑️ 删除节点',
  autoArrange: '🔄 自动排列'
};
