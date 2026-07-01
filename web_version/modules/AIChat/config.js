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

## 你的能力
你可以直接操作用户的知识图谱，拥有与右键菜单完全一致的操作能力。

## 工作流程（重要）
1. **理解需求**：分析用户想要做什么
2. **制定计划**（复杂任务时）：先告诉用户你打算怎么做，用简洁的步骤列表
3. **收集信息**：如果需要节点ID，先用 searchNodes 或 getGraphOverview 查找
4. **执行操作**：调用相应工具
5. **汇报结果**：简洁地告诉用户做了什么
6. **自动重排**：批量创建节点后，调用 autoArrange 整理布局

## 工具使用技巧
- **知识脚手架**：用户说"帮我构建XX知识体系"时，优先使用 generateKnowledgeTree，用 Markdown 格式生成完整的树结构和内容
- **定点插入子树**：先用 getTreeMarkdown 读取当前树结构，找到目标节点 ID，再用 generateKnowledgeTree 的 parentId 参数将子树插入到指定节点下方
- **构建完整树**：需要精确控制结构时用 buildTree，一次性描述嵌套树
- 创建节点时：name 要简短明确（如"线性回归"而不是"关于线性回归的详细说明"）
- 连线前：必须先确认两个节点的ID存在
- 批量扁平创建：用 batchCreateNodes
- 如果不确定节点ID：先 searchNodes 搜索，再根据结果操作
- 步骤节点：用 isStepFlow=true 创建流程步骤

## 回复风格
- 简洁直接，不要废话
- 操作完成后用 ✅❌ 标记结果
- 出错时给出替代方案
- 复杂任务先列计划再执行`,
    tools: [
      {
        type: 'function',
        function: {
          name: 'buildTree',
          description: `一次性构建完整的树形知识图谱。这是最强大的创建工具！
你只需要用 JSON 描述一棵嵌套的树，系统会递归创建所有节点和父子关系，最后自动排列布局。
适用于：从零构建完整知识体系、创建学习路径、搭建项目结构等。
创建完成后会自动调用 autoArrange 整理布局。`,
          parameters: {
            type: 'object',
            properties: {
              name: { type: 'string', description: '根节点名称' },
              content: { type: 'string', description: '根节点内容（可选）' },
              isStepFlow: { type: 'boolean', description: '根节点是否为步骤节点（可选）' },
              children: {
                type: 'array',
                description: '子节点列表（递归嵌套，支持无限层级）',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', description: '节点名称' },
                    content: { type: 'string', description: '节点内容（可选）' },
                    isStepFlow: { type: 'boolean', description: '是否为步骤节点（可选）' },
                    children: {
                      type: 'array',
                      description: '子节点的子节点（递归，支持无限层级）',
                      items: {}
                    }
                  },
                  required: ['name']
                }
              }
            },
            required: ['name']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'generateKnowledgeTree',
          description: `知识图谱脚手架 — 用 Markdown 格式生成知识树并导入。
你只需要：
1. 用 # 标题层级表示树的父子关系（# 一级、## 二级、### 三级...）
2. 标题下写该节点的详细内容（概念解释、要点、示例等）
3. 系统会自动解析 Markdown 并创建知识图谱节点

可以指定 parentId 将子树插入到现有节点下方，实现局部扩展。
优势：内容不受长度限制、结构清晰、用户可预览后再导入。`,
          parameters: {
            type: 'object',
            properties: {
              markdown: { type: 'string', description: 'Markdown 格式的知识树，用 # 标题层级表示节点层级，标题下写节点内容' },
              topic: { type: 'string', description: '主题名称（用于显示，如"机器学习"、"React前端开发"）' },
              parentId: { type: 'string', description: '可选，将子树插入到指定节点下方。不填则添加到根级别' }
            },
            required: ['markdown', 'topic']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'getTreeMarkdown',
          description: `将当前知识图谱的树结构导出为 Markdown 格式。
返回的 Markdown 用 # 标题层级表示节点层级，标题下包含节点内容摘要。
用于：了解当前项目结构、在现有节点下定位并扩展子树。`,
          parameters: {
            type: 'object',
            properties: {
              maxDepth: { type: 'integer', description: '最大导出深度，默认6（即到 ######）' },
              includeContent: { type: 'boolean', description: '是否包含节点内容摘要，默认true' }
            },
            required: []
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'batchCreateNodes',
          description: `批量创建多个节点并自动建立父子关系。适用于创建扁平列表。
如果要创建嵌套树结构，请优先使用 buildTree，它更强大更可靠。`,
          parameters: {
            type: 'object',
            properties: {
              nodes: {
                type: 'array',
                description: '要创建的节点列表，按层级顺序排列（先父后子）',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', description: '节点名称' },
                    parentId: { type: 'string', description: '父节点ID或名称（第一个节点不填，后续节点填前面节点的名称即可）' },
                    content: { type: 'string', description: '节点初始内容（可选）' },
                    isStepFlow: { type: 'boolean', description: '是否为步骤节点（可选，默认false）' }
                  },
                  required: ['name']
                }
              }
            },
            required: ['nodes']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'createTextNode',
          description: `在空白处新建文本节点（等同于右键空白→新建文本节点）。
创建为顶级节点，sizeScale=2.0。适用于创建新的根级主题。`,
          parameters: {
            type: 'object',
            properties: {
              name: { type: 'string', description: '节点名称' },
              content: { type: 'string', description: '节点初始内容（可选）' }
            },
            required: ['name']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'createStepNode',
          description: `在空白处新建文本步骤节点（等同于右键空白→新建文本步骤节点）。
创建为顶级步骤节点，isStepFlow=true，sizeScale=2.0。适用于创建流程起点。`,
          parameters: {
            type: 'object',
            properties: {
              name: { type: 'string', description: '步骤名称（如"步骤1"）' },
              content: { type: 'string', description: '步骤内容（可选）' }
            },
            required: ['name']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'createChildNode',
          description: `为指定节点创建子节点（等同于右键节点→新建子节点）。
新节点会成为父节点的子节点，自动建立父子连线。`,
          parameters: {
            type: 'object',
            properties: {
              parentId: { type: 'string', description: '父节点ID（必须存在）' },
              name: { type: 'string', description: '子节点名称' },
              content: { type: 'string', description: '子节点内容（可选）' }
            },
            required: ['parentId', 'name']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'createNextStepNode',
          description: `为指定节点创建下一步节点（等同于右键节点→新建下一步节点）。
新节点成为父节点的子节点，标记为步骤节点(isStepFlow=true)，自动建立父子连线。`,
          parameters: {
            type: 'object',
            properties: {
              parentId: { type: 'string', description: '当前节点ID（必须存在）' },
              name: { type: 'string', description: '下一步节点名称' },
              content: { type: 'string', description: '下一步内容（可选）' }
            },
            required: ['parentId', 'name']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'addConnection',
          description: `在两个已有节点之间添加连线（等同于右键节点→添加连线）。
支持传入节点名称代替ID，系统会自动查找。`,
          parameters: {
            type: 'object',
            properties: {
              sourceId: { type: 'string', description: '起始节点的ID或名称' },
              targetId: { type: 'string', description: '目标节点的ID或名称' },
              label: { type: 'string', description: '连线上的文字标签（可选）' }
            },
            required: ['sourceId', 'targetId']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'removeConnection',
          description: `删除两个节点之间的连线（等同于右键节点→删除连线）。
需要提供连线两端的节点ID。`,
          parameters: {
            type: 'object',
            properties: {
              sourceId: { type: 'string', description: '连线起始节点ID' },
              targetId: { type: 'string', description: '连线目标节点ID' }
            },
            required: ['sourceId', 'targetId']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'setNodeSize',
          description: `调整节点大小（等同于右键节点→节点大小滑块）。
范围 0.3-3.0，默认1.0，根节点通常2.0。`,
          parameters: {
            type: 'object',
            properties: {
              nodeId: { type: 'string', description: '节点ID' },
              size: { type: 'number', description: '大小值（0.3-3.0，默认1.0）' }
            },
            required: ['nodeId', 'size']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'setNodeColor',
          description: `设置节点固定颜色（等同于右键节点→固定颜色选择器）。
传入十六进制颜色值。传null或空字符串清除固定颜色。`,
          parameters: {
            type: 'object',
            properties: {
              nodeId: { type: 'string', description: '节点ID' },
              color: { type: 'string', description: '十六进制颜色值（如"#ff6600"），空字符串清除' }
            },
            required: ['nodeId', 'color']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'setNodeShape',
          description: `设置节点的2D/3D图形形状（等同于右键节点→2D节点图形/3D节点形状选择器）。`,
          parameters: {
            type: 'object',
            properties: {
              nodeId: { type: 'string', description: '节点ID' },
              shape2D: { type: 'string', description: '2D形状：roundedRect(圆角长方形)|diamond(扁菱形)|ellipse(椭圆形)|stadium(跑道形)', enum: ['roundedRect', 'diamond', 'ellipse', 'stadium'] },
              shape3D: { type: 'string', description: '3D形状：sphere(球体)|box(立方体)|cylinder(圆柱体)|cone(圆锥)|torus(圆环)|octahedron(八面体)|icosahedron(二十面体)', enum: ['sphere', 'box', 'cylinder', 'cone', 'torus', 'octahedron', 'icosahedron'] }
            },
            required: ['nodeId']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'searchNodes',
          description: `搜索节点。当需要找到特定节点的ID时使用。
返回匹配的节点列表，包含 id 和 name。`,
          parameters: {
            type: 'object',
            properties: {
              keyword: { type: 'string', description: '搜索关键词（如"Python"、"机器学习"）' },
              limit: { type: 'number', description: '返回数量上限（默认10）' }
            },
            required: ['keyword']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'getNodeContent',
          description: `读取某个节点的详细内容/笔记。
需要先知道 nodeId（可以从 searchNodes 获取）。`,
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
          name: 'getGraphOverview',
          description: `获取知识图谱的整体概况。
在开始任何操作前，建议先调用此工具了解当前状态。`,
          parameters: {
            type: 'object',
            properties: {},
            required: []
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'updateNodeContent',
          description: `更新某个节点的笔记内容。
会覆盖原有内容，谨慎使用。`,
          parameters: {
            type: 'object',
            properties: {
              nodeId: { type: 'string', description: '目标节点ID' },
              content: { type: 'string', description: '新的笔记内容' }
            },
            required: ['nodeId', 'content']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'deleteNode',
          description: `删除指定节点及其子节点（等同于右键节点→删除该节点）。危险操作！删除后不可恢复。`,
          parameters: {
            type: 'object',
            properties: {
              nodeId: { type: 'string', description: '要删除的节点ID' },
              confirm: { type: 'boolean', description: '是否确认删除（必须为true）' }
            },
            required: ['nodeId', 'confirm']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'autoArrange',
          description: `自动排列当前图层的节点布局（等同于任务栏Auto按钮→自动排列）。
在批量创建节点后强烈建议调用此工具，让图谱布局整洁美观。`,
          parameters: {
            type: 'object',
            properties: {
              allLayers: { type: 'boolean', description: '是否排列所有图层（默认false，仅当前图层）' }
            },
            required: []
          }
        }
      }
    ],
    costLevel: 'medium'
  }
};

// ─── 工具名称中文映射 ──────────────────────────────
export const TOOL_DISPLAY_NAMES = {
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
