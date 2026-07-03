# AstroKnot

3D 知识网络可视化与编辑工具。基于 Electron + Three.js 构建，将知识节点以 3D 星图的形式呈现，每个节点可打开富文本编辑器进行深度编辑。

## 特性

- **3D 知识网络** — Three.js 渲染，螺旋连线、星云粒子、节点光环，支持旋转/缩放/平移
- **2D 思维导图** — 可切换的 2D 视图，自动布局，支持多图层
- **富文本编辑器** — 基于 TinyMCE 7，支持字体/段落/样式、图片自由放置、形状、文本框、文件链接、分栏
- **表格编辑器** — 基于 Univer，完整的电子表格编辑能力
- **公式编辑器** — LaTeX 语法，常用符号面板，支持拖拽缩放
- **代码块** — 基于 Monaco Editor，多语言语法高亮，代码片段模板
- **多媒体嵌入** — 音频（WaveSurfer.js 波形可视化 + EQ 均衡器）、视频、幻灯片放映
- **覆盖层系统** — 自由放置图片/形状/文本框/图表/Excel，拖拽缩放旋转
- **绘图工具** — 手绘笔/铅笔/荧光笔/彩虹笔，支持撤销重做
- **AI 对话** — 支持 Chat/Agent 双模式，多模型切换，工具调用（项目上下文感知）
- **新手引导** — 交互式操作驱动引导，自动检测步骤完成，支持跳过
- **标题样式模板** — 内置多套标题样式模板，自定义各级标题字体/间距/缩进
- **字数统计** — 中英文混合字数统计，实时显示
- **历史记录** — 完整的撤销/重做，操作原子化
- **快速笔记** — 独立的富文本笔记列表
- **项目持久化** — Markdown + JSON 混合格式存储，支持多项目
- **版本控制** — 版本图系统，支持提交、分支、diff、回滚，类似 Git 的版本管理（已保存项目存储在 `.versiongraph/`，未保存项目临时存储在 `userData/version-graphs-tmp/`）
- **代码沙盒 IDE** — VSCode 风格迷你 IDE，Monaco Editor + 文件树 + 标签页 + esbuild-wasm 打包，支持 HTML/CSS/JS 实时预览、控制台、全局搜索、本地历史、Emmet 缩写、代码片段模板
- **启动闪屏** — 应用图标 + 渐变文字 + 地面反光效果
- **天气时钟** — 任务栏显示实时时钟、农历、节气、天气
- **日历排班** — 月/周/日三视图，日程管理，四象限事项，排班（上班规律/手动倒班/规律倒班），法定节假日自动识别
- **双版本部署** — Electron 桌面版（完整功能）+ Web 版（浏览器访问，部分功能受限）

## 快速开始

**环境要求**：Node.js >= 18

```bash
# 安装依赖
npm install

# 启动
npm start

# 打包为安装程序（Windows）
npm run build
```

打包产物在 `dist/` 目录下。

## 自定义图标

将你的 PNG 图标放到 `assets/icon.png`。应用会自动在以下位置使用：

- 标题栏左上角
- 任务栏 AstroKnot 菜单按钮
- 系统任务栏 / Alt+Tab 切换
- 打包后的 .exe 程序图标
- 启动闪屏

## 项目结构

```
AstroKnot/
├── AstroKnot.js          # 应用入口，顺序导入所有模块并启动
├── index.html            # 主页面（含启动闪屏、自定义标题栏、任务栏等）
├── main.js               # Electron 主进程（窗口创建、菜单、IPC）
├── preload.js            # Electron preload 安全桥接
├── web-api-shim.js       # Web API 兼容层（Electron 环境补丁）
├── package.json          # 项目配置 & electron-builder 打包配置
├── assets/               # 静态资源
│   └── icon.png          # 应用图标
├── style/                # 全局样式
│   └── base.css          # 基础变量、标题栏、闪屏、滚动条
├── lib/                  # 第三方库
│   ├── monaco/           # Monaco Editor（含 81 种语言支持）
│   ├── three/            # Three.js + 后处理 + OrbitControls + CSS2DRenderer
│   ├── fabric.min.js     # Fabric.js（遮罩/画布）
│   └── soundtouch-processor.js  # SoundTouch 音频处理
└── modules/              # 核心模块
    ├── module0_AppState.js         # 全局状态管理器（被所有模块依赖）
    ├── module1_Textures.js         # 纹理生成（光晕纹理）
    ├── module2_TreeData.js         # 节点树数据结构、项目持久化
    ├── module3_History.js          # 撤销/重做历史栈
    ├── module4_Confirm.js          # 自定义确认弹窗
    ├── module5_SelectAndEdit.js    # 节点选中/编辑/Toast
    ├── module7_SceneInit.js        # 场景初始化（Bloom 辉光、后处理）
    ├── module8_ContextMenu.js      # 右键菜单（节点/空白区域/叠加层）
    ├── module9_FileIO.js           # 文件导入/导出
    ├── module11_QuickNotes.js      # 快速笔记面板
    ├── module14_Animation.js       # 动画循环（渲染、粒子、HSL 颜色轮转）
    ├── StressTest.js               # 性能压力测试工具
    ├── taskbar.js                  # 底部任务栏（窗口管理）
    ├── hot-update.js               # 开发热更新（HMR）
    ├── versionGraph/               # 版本控制系统
    │   ├── versionGraph.js         #   提交/分支/diff 核心逻辑
    │   ├── versionStore.js         #   版本数据持久化（hash、blob 存储）
    │   ├── versionAutoSave.js      #   自动保存 & 定时快照
    │   ├── versionMap.js           #   版本图可视化（Canvas 渲染）
    │   └── versionAtmosphere.js    #   版本图 3D 氛围效果
    ├── VisualComponents/           # 3D 可视化组件（原 module6）
    │   ├── index.js                #   入口 & 统一导出
    │   ├── Nodes.js                #   节点网格创建/销毁/动画
    │   ├── FlowLines.js            #   螺旋连线 & 折线
    │   ├── LineManager.js          #   连线管理（增删改）
    │   └── SceneBuilder.js         #   场景构建（从树数据批量生成）
    ├── AIChat/                     # AI 对话模块（原 module15）
    │   ├── index.js                #   入口 & 消息发送核心逻辑
    │   ├── api.js                  #   API 调用、模型管理、密钥存储
    │   ├── config.js               #   模式配置（Chat/Agent）
    │   ├── tools.js                #   Agent 工具调用（项目上下文/导入等）
    │   └── ui.js                   #   对话 UI、历史面板、Markdown 预览
    ├── Guide/                      # 新手引导
    │   ├── index.js                #   入口 & 引导生命周期
    │   ├── GuideCore.js            #   状态机 & 步骤定义
    │   ├── GuideOverlay.js         #   高亮遮罩 & 提示气泡
    │   ├── Guide3D.js              #   3D 场景交互检测
    │   ├── GuideTutorial.js        #   教程项目数据 & 空项目检测
    │   └── style.css               #   引导样式
    ├── 2DView/                     # 2D 思维导图视图
    │   ├── index.js                #   入口 & 布局算法
    │   ├── Core.js                 #   核心绘制
    │   ├── Interaction.js          #   交互（拖拽/缩放/双击）
    │   ├── Layout.js               #   树形布局引擎
    │   ├── Render.js               #   节点/连线渲染
    │   ├── shared.js               #   共享常量
    │   └── style.css               #   视图样式
    ├── LayerManager/               # 图层管理
    │   └── index.js                #   图层创建/切换/排序
    ├── MoveMode/                   # 节点移动模式
    │   ├── index.js                #   入口
    │   ├── MoveCore.js             #   核心逻辑
    │   ├── LineTooltip.js          #   连线提示
    │   └── shared.js               #   共享状态
    ├── UI/                         # UI 组件
    │   ├── index.js                #   入口 & 绑定汇总
    │   ├── shared.js               #   共享工具函数
    │   ├── style.css               #   全局 UI 样式
    │   ├── Window.js               #   窗口管理 & AstroKnot 菜单
    │   ├── Toolbar.js              #   工具栏按钮
    │   ├── Search.js               #   搜索（节点/项目）
    │   ├── Keyboard.js             #   键盘快捷键 & 输入框防冲突
    │   ├── Resize.js               #   面板缩放
    │   ├── Theme.js                #   主题切换
    │   ├── Dock.js                 #   快捷启动 Dock
    │   ├── AiDialog.js             #   AI 对话框 UI
    │   ├── calendar/                 # 日历子系统（时钟/天气/农历/节气/排班）
	    │       ├── index.js                #   模块入口（initTaskbarClock）
	    │       ├── shared-state.js         #   跨模块共享状态
	    │       ├── lunar-utils.js          #   农历/节气/节日/时辰
	    │       ├── schedule-store.js       #   日程数据层 + 冲突检测
	    │       ├── schedule-forms.js       #   表单/右键菜单/对话框
	    │       ├── calendar-popup.js       #   三视图渲染 + 弹窗交互
	    │       ├── weather.js              #   天气组件
	    │       ├── shift-store.js          #   排班数据层（班表/班次类型/节假日）
	    │       ├── shift-form.js           #   排班编辑表单（规律/手动/倒班）
	    │       ├── shift-types-store.js    #   班次类型管理（白班/夜班/休息/自定义）
	    │       ├── holidays-store.js       #   法定节假日 & 调休数据（2024-2026）
	    │       ├── item-form.js            #   事项编辑表单（四象限分类）
	    │       ├── items-tabs-store.js     #   事项标签页管理
	    │       ├── add-tab-form.js         #   新增标签页表单
	    │       ├── anniversary-view.js     #   纪念日视图
	    │       └── anniversary-form.js     #   纪念日编辑表单
    └── richEditor/                 # 富文本编辑器
        ├── index.js                #   模块入口
        ├── shared-state.js         #   编辑器内部状态
        ├── dom-refs.js             #   DOM 引用缓存
        ├── utils.js                #   工具函数（Toast/颜色）
        ├── word-count.js           #   字数统计（中英文混合）
        ├── heading-templates.js    #   标题样式模板管理
        ├── insert-toc.js           #   右键添加到目录
        ├── lists.js                #   列表功能（项目符号/编号/多级）
        ├── content-style.js        #   编辑器内容 CSS（含 sup/sub/分栏）
        ├── images-files.js         #   图片/文件管理 & 右键菜单
        ├── toc.js                  #   目录/大纲侧边栏
        ├── tree-panel.js           #   节点树 2D 面板（Canvas 渲染）
        ├── style.css               #   编辑器样式
        ├── content-io/             #   内容读写子系统
        │   ├── index.js            #     入口 & 聚合导出
        │   ├── editor-content-io.js #    内容保存/加载、sandbox/普通UI切换、标签页管理
        │   ├── editor-tabs.js      #     编辑器标签页（多节点切换、z-index 管理）
        │   ├── split-screen.js     #     分屏预览（宽度拖拽、iframe 预览）
        │   ├── modal-window.js     #     窗口三态控制（最大化/最小化/恢复、动画）
        │   └── modal-window.css    #     窗口样式
        ├── sandbox/                #   代码沙盒 IDE
        │   ├── index.js            #     IDE 入口（Monaco + 文件树 + 标签页 + 预览）
        │   ├── sandbox-virtual-fs.js #   虚拟文件系统（多文件管理、HTML 迁移）
        │   ├── sandbox-file-tree.js #   文件树组件（右键菜单、新建/删除/重命名）
        │   ├── sandbox-tabs.js     #     文件标签页（拖拽排序、关闭、切换）
        │   ├── sandbox-monaco-editor.js # Monaco 编辑器集成（语法高亮、Emmet）
        │   ├── sandbox-bundler.js  #     esbuild-wasm 打包器（模块打包、CSS/JS 注入）
        │   ├── sandbox-templates.js #    代码片段模板（HTML/CSS/JS 模板）
        │   ├── sandbox-history.js  #     本地历史记录（快照、diff、回滚）
        │   ├── sandbox-search.js   #     全局文件搜索（Ctrl+Shift+F）
        │   └── sandbox-ide.css     #     IDE 样式
        └── core/                   #   内核
            ├── init.js             #     TinyMCE 7 初始化 & 事件绑定
            ├── editor-events.js    #     编辑器事件（右键/拖放/搜索/缩放）
            ├── code-blocks.js      #     代码块 & Monaco Editor
            ├── formula.js          #     公式编辑器（LaTeX + MathLive）
            ├── video-editor.js     #     视频编辑器
            ├── ffmpeg-service.js   #     FFmpeg 服务（视频处理）
            ├── toolbar-buttons.js  #     工具栏按钮注册
            ├── toolbar-layout.js   #     工具栏布局 & CSS
            ├── toolbar/            #     工具栏子模块（按标签页拆分）
            │   ├── toolbar-home.js          # 开始
            │   ├── toolbar-home-font.js      # 字体/颜色/上标下标/渐变
            │   ├── toolbar-home-edit.js      # 编辑
            │   ├── toolbar-home-paragraph.js  # 段落
            │   ├── toolbar-insert.js          # 插入（图片/文件/公式/图表/音视频）
            │   ├── toolbar-shape-format.js    # 图形格式
            │   ├── toolbar-draw.js            # 绘图工具
            │   ├── toolbar-doc-layout.js      # 文档布局（分栏/纸张）
            │   └── toolbar-view.js            # 视图（页面/网页/深色模式）
            └── overlay/             #     覆盖层系统
                ├── index.js          #       入口
                ├── overlay-images.js #       覆盖层管理 & 右键菜单
                ├── overlay-image.js  #       图片覆盖层
                ├── overlay-image-editor.js  # 图片编辑器
                ├── overlay-shapes.js #       形状覆盖层
                ├── overlay-textbox.js#       文本框覆盖层
                ├── overlay-chart.js  #       图表覆盖层
                ├── overlay-chart-editor.js   # 图表编辑器
                ├── overlay-excel.js  #       电子表格覆盖层
                ├── overlay-excel-editor.js   # 电子表格编辑器
                ├── overlay-audio.js  #       音频覆盖层
                ├── overlay-audio-editor.js   # 音频编辑器（EQ/压缩/混响）
                ├── overlay-video.js  #       视频覆盖层
                ├── overlay-slides.js #       幻灯片页
                └── overlay-slideshow.js      # 幻灯片放映
```

## 架构分层

| 层 | 模块 | 职责 |
|----|------|------|
| 数据层 | `module0`, `module2`, `module3`, `module9` | 状态管理、数据持久化、历史记录、文件 IO |
| 版本控制层 | `versionGraph/` | 版本图系统（提交、分支、diff、回滚、自动保存） |
| 3D 视图层 | `module1`, `VisualComponents/`, `module7`, `module14` | 纹理、3D 组件、场景初始化、动画 |
| 交互控制层 | `module5`, `MoveMode/` | 节点选中/编辑、拖拽移动 |
| UI 层 | `module4`, `module8`, `module11`, `AIChat/`, `UI/`, `richEditor/`, `taskbar.js` | 弹窗、菜单、AI 对话、编辑器、窗口管理 |
| 引导层 | `Guide/` | 新手引导、教程项目 |
| 视图切换 | `2DView/`, `LayerManager/` | 2D 思维导图、图层管理 |
| 基础设施 | `hot-update.js`, `StressTest.js` | 开发热更新、性能测试 |

## 模块依赖关系

> 核心原则：所有模块通过 `import` 显式依赖，无全局污染。`module0_AppState` 是唯一被几乎所有模块依赖的核心对象。

### 依赖总览

| 模块 | 直接依赖 | 说明 |
|------|----------|------|
| `module0` | 无 | 基础模块，被所有其他模块依赖 |
| `module1` | `module0` | 纹理生成 |
| `module2` | `module0`, `module4`, `VisualComponents/` | 项目管理 & 持久化 |
| `module3` | `module0`, `module2`, `VisualComponents/`, `module8` | 历史记录 |
| `module4` | 无 | 独立确认弹窗 |
| `module5` | `module0`, `module3`, `module4`, `module2`, `VisualComponents/` | 节点编辑 |
| `VisualComponents/` | `module0` | 3D 组件（节点网格、连线、场景构建） |
| `module7` | `module0`, `module1` | 场景初始化 |
| `module8` | `module0`, `module2`, `VisualComponents/`, `module5` | 右键菜单 |
| `module9` | `module0`, `module2`, `VisualComponents/`, `module5` | 文件 IO |
| `module11` | `module0`, `module2`, `module4` | 快速笔记 |
| `module14` | `module0` | 动画循环 |
| `versionGraph/` | `module0`, `module2` | 版本控制系统（提交、分支、diff） |
| `AIChat/` | `module0`, `UI/` | AI 对话（Chat/Agent 双模式） |
| `Guide/` | `module0`, `UI/` | 新手引导 |
| `richEditor/` | `module0`, `module2`, `UI/` | 富文本编辑（含 sandbox IDE） |
| `UI/` | `module0`, `module2`, `module3`, `module5`, `module9`, `richEditor/` | UI 组件 |
| `MoveMode/` | `module0`, `module2`, `module3`, `module5`, `VisualComponents/`, `module8`, `richEditor/` | 移动模式 |
| `2DView/` | `module0`, `module2`, `module5`, `VisualComponents/`, `module8`, `richEditor/` | 2D 视图 |
| `LayerManager/` | `module0` | 图层管理 |
| `taskbar.js` | 无 | 独立任务栏 |
| `hot-update.js` | `module0` | 热更新 |

### 典型依赖链

- **添加新节点**：`module5` → `VisualComponents/`（创建网格）→ `module2`（保存数据）→ `module3`（记录历史）
- **撤销操作**：`UI/` → `module3` → `VisualComponents/`（重建场景）→ `module2`（恢复数据）
- **右键菜单调整**：`module8` → `VisualComponents/`（更新视觉）→ `module2`（保存数据）

### 添加新模块

1. 仅与 `appState` 交互 → 依赖 `module0`
2. 需要操作节点树/项目 → 额外依赖 `module2`
3. 需要创建/销毁 3D 对象 → 依赖 `VisualComponents/`
4. 需要历史记录支持 → 使用 `module3` 的 `withHistory` 装饰器
5. 在 `AstroKnot.js` 中导入并调用初始化函数

## 使用指南

### 3D 视图

- **旋转**：鼠标左键拖拽
- **缩放**：鼠标滚轮
- **平移**：鼠标右键拖拽
- **选中节点**：左键点击
- **编辑节点**：双击节点打开富文本编辑器
- **右键菜单**：右键点击节点或空白区域
- **移动节点**：右键菜单 → 移动，拖拽到目标位置
- **图层切换**：工具栏图层按钮切换不同图层

### 富文本编辑器

- **开始菜单**：字体、段落、样式、编辑
- **插入菜单**：图片（自由放置）、形状、文本框、文件链接、公式、代码块、表格、图表、音频、视频
- **布局菜单**：分栏（1-3 栏）、纸张大小
- **绘图工具**：手绘笔/铅笔/荧光笔，支持自定义颜色和线宽
- **插入的图片/形状/文本框**：选中后可拖拽移动、缩放、旋转，右键可设置属性
- **文件链接**：插入后右键可设置上标/下标/按钮颜色
- **Overlay 覆盖层**：图片/形状/文本框/图表/Excel/音频/视频/幻灯片，自由放置

### 节点树

- 左侧面板显示节点树 2D 视图（Canvas 渲染）
- 支持拖拽平移、滚轮缩放
- 双击节点打开编辑器
- 支持图层隔离显示

### 其他

- **AstroKnot 菜单**：底部任务栏左侧按钮，打开项目面板 & 快速笔记
- **快速笔记**：独立的富文本笔记，支持标签页
- **2D 思维导图**：工具栏切换 2D 视图
- **Dock 快捷启动**：底部 Dock 栏，支持拖放文件/文件夹
- **天气 & 农历**：任务栏右侧时钟，右键可设置城市
- **日历排班**：月/周/日三视图，支持排班（上班规律自动识别法定节假日和调休、手动倒班、规律倒班循环），四象限事项管理，纪念日
- **AI 对话**：支持 Chat 模式和 Agent 模式，Agent 模式可调用工具（读取项目上下文、导入 Markdown 等）
- **版本控制**：工具栏版本图按钮，查看提交历史、创建分支、回滚到历史版本、查看 diff
- **代码沙盒 IDE**：右键节点 → "💻 以 HTML 方式打开"，进入 VSCode 风格 IDE，支持实时预览、控制台、全局搜索
- **新手引导**：首次打开空项目时自动启动，交互式引导完成基本操作

## 技术栈

| 技术 | 用途 |
|------|------|
| **Electron** 29 | 桌面应用框架（无边框窗口） |
| **Three.js** 0.128 | 3D 渲染（节点、粒子、辉光） |
| **TinyMCE** 7 | 富文本编辑器（inline 模式） |
| **Univer** 0.25 | 电子表格编辑器 |
| **Monaco Editor** | 代码块编辑器（81 种语言） |
| **MathJax** 3 | LaTeX 公式渲染 |
| **MathLive** | WYSIWYG 公式编辑器 |
| **WaveSurfer.js** 7 | 音频波形可视化 |
| **FFmpeg.wasm** | 浏览器端视频处理 |
| **highlight.js** | 代码语法高亮 |
| **html2canvas** | DOM 截图 |
| **SoundTouchJS** | 音频变速/变调处理 |
| **Fabric.js** | 画布/遮罩操作 |

## 部署版本

AstroKnot 提供两个版本：

### 桌面版（推荐）

- **路径**：项目根目录（`main.js`, `index.html`, `AstroKnot.js`）
- **启动**：`npm start` 或直接运行打包后的 `.exe`
- **特性**：完整功能，包括文件系统访问、本地存储、全屏模式、无边框窗口

### Web 版

- **路径**：`web_version/` 目录
- **启动**：部署到静态服务器或本地 HTTP 服务器
- **特性**：浏览器访问，支持大部分功能，但受浏览器安全限制（无文件系统直接访问、部分 API 需要适配）
- **限制**：
  - 文件保存通过浏览器下载
  - FFmpeg.wasm 性能受限
  - 无 Electron IPC 能力

## License

MIT