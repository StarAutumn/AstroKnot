// ============================================================
//  GuideCore/steps.js — 引导步骤定义（STEPS 数组）
//  每一步都要求用户亲手操作，检测到正确操作后自动进入下一步
//  （自 GuideCore.js 逐字迁移，KBD 仅被 STEPS 使用故随迁）
// ============================================================

const KBD = (k) => `<kbd style="background:rgba(0,255,255,0.15);padding:1px 6px;border-radius:4px;border:1px solid rgba(0,255,255,0.3);font-family:Consolas,monospace;">${k}</kbd>`;

export const STEPS = [
  // ================================================================
  //  第 0 步：欢迎
  // ================================================================
  {
    id: 'welcome',
    title: '🎉 欢迎使用 AstroKnot',
    html: `
      <p style="font-size:15px;line-height:1.7;color:#cde;">
        <strong>AstroKnot</strong> 是一款 <span style="color:#0ff;">3D 知识图谱编辑器</span>，
        接下来我将带你<strong style="color:#aef0ff;">一步步实际操作</strong>，快速上手。
      </p>
      <p style="font-size:13px;color:#9ab;margin-top:8px;">
        每个步骤需要你 <span style="color:#ff0;">按照提示完成操作</span> 后才会自动进入下一步。
      </p>
      <p style="font-size:12px;color:#8aa;margin-top:8px;">
        随时可按 ${KBD('Esc')} 或点「跳过」退出。
      </p>
    `,
    type: 'modal',
    btnText: '开始学习 🚀',
  },

  // ================================================================
  //  第 1 步：旋转视角（需要用户拖拽旋转）
  // ================================================================
  {
    id: 'rotate',
    title: '🖱️ 旋转视角',
    html: `
      <p style="font-size:14px;line-height:1.7;color:#cde;">
        <strong style="color:#0ff;">📌 操作：按住鼠标左键，在深色背景区域拖拽</strong>
      </p>
      <p style="font-size:12px;color:#9ab;margin-top:6px;">
        3D 场景中拖拽左键 = 旋转视角。你会看到发光球体（节点）围绕中心转动。
      </p>
      <p style="font-size:12px;color:#8af;margin-top:8px;">
        ⏳ 等待你完成操作...
      </p>
    `,
    type: 'action',
    waitFor: 'cameraRotate',
    beforeShow: null,
    afterHide: null,
    hint3D: '👆 按住左键拖拽旋转',
    unlockControls: true,   // 旋转步骤需要解禁 controls
  },

  // ================================================================
  //  第 2 步：键盘飞行操控（WASD + 空格 + Ctrl）
  // ================================================================
  {
    id: 'keyboardNav',
    title: '⌨️ 键盘飞行操控',
    html: `
      <p style="font-size:14px;line-height:1.7;color:#cde;">
        <strong style="color:#0ff;">📌 操作：依次按下每个飞行键试试</strong>
      </p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:10px 0;font-size:13px;color:#cde;">
        <div>${KBD('W')} <span style="color:#9ab;">向前飘移</span></div>
        <div>${KBD('S')} <span style="color:#9ab;">向后飘移</span></div>
        <div>${KBD('A')} <span style="color:#9ab;">向左飘移</span></div>
        <div>${KBD('D')} <span style="color:#9ab;">向右飘移</span></div>
        <div>${KBD('空格')} <span style="color:#9ab;">上升</span></div>
        <div>${KBD('Ctrl')} <span style="color:#9ab;">下降</span></div>
      </div>
      <p style="font-size:12px;color:#8af;margin-top:8px;" id="guideKeyProgress">
        ⏳ 已尝试: <strong style="color:#0ff;">0</strong> / 6 个键
      </p>
    `,
    type: 'action',
    waitFor: 'keyboardNav',
    unlockControls: true,
    hint3D: '⌨️ 试试 WASD · 空格 · Ctrl',
  },

  // ================================================================
  //  第 3 步：缩放视距（需要用户滚动滚轮）
  // ================================================================
  {
    id: 'zoom',
    title: '🔍 缩放视距',
    html: `
      <p style="font-size:14px;line-height:1.7;color:#cde;">
        <strong style="color:#0ff;">📌 操作：滚动鼠标滚轮</strong>
      </p>
      <p style="font-size:12px;color:#9ab;margin-top:6px;">
        向上滚 = 靠近（放大）；向下滚 = 远离（缩小）。试试把画面调整到你舒服的距离。
      </p>
      <p style="font-size:12px;color:#8af;margin-top:8px;">
        ⏳ 等待你完成操作...
      </p>
    `,
    type: 'action',
    waitFor: 'cameraZoom',
    unlockControls: true,
  },

  // ================================================================
  //  第 4 步：点击选中节点（需要用户左键点击任意节点）
  // ================================================================
  {
    id: 'clickNode',
    title: '✋ 选中一个节点',
    html: `
      <p style="font-size:14px;line-height:1.7;color:#cde;">
        <strong style="color:#0ff;">📌 操作：左键点击场景中任意一个发光球体</strong>
      </p>
      <p style="font-size:12px;color:#9ab;margin-top:6px;">
        选中后节点外圈会变亮变白，表示它已被选中。你可以对选中节点进行后续操作。
      </p>
      <p style="font-size:12px;color:#8af;margin-top:8px;">
        ⏳ 等待你点击节点...
      </p>
    `,
    type: 'action',
    waitFor: 'nodeSelect',
    unlockControls: true,
    highlightFirstNode: true,
    hint3D: '👆 请点击这个发光球',
  },

  // ================================================================
  //  第 5 步：右键打开上下文菜单（需要用户右键点击节点）
  // ================================================================
  {
    id: 'rightClick',
    title: '📋 打开右键菜单',
    html: `
      <p style="font-size:14px;line-height:1.7;color:#cde;">
        <strong style="color:#0ff;">📌 操作：右键点击场景中任意节点</strong>
      </p>
      <p style="font-size:12px;color:#9ab;margin-top:6px;">
        右键菜单包含：重命名、新建子节点、添加连线、编辑、删除、移动等所有操作入口。
      </p>
      <p style="font-size:12px;color:#8af;margin-top:8px;">
        ⏳ 等待你右键节点...
      </p>
    `,
    type: 'action',
    waitFor: 'contextMenu',
    unlockControls: true,
    hint3D: '右键点击节点打开菜单',
  },

  // ================================================================
  //  第 6 步：创建子节点（需要用户通过右键菜单操作）
  // ================================================================
  {
    id: 'createChild',
    title: '➕ 创建子节点',
    html: `
      <p style="font-size:14px;line-height:1.7;color:#cde;">
        <strong style="color:#0ff;">📌 操作：右键节点 → 点击「新建子节点」</strong>
      </p>
      <p style="font-size:12px;color:#9ab;margin-top:6px;">
        在弹出的输入框中输入子节点名称（比如 "学习笔记"），然后按回车确认。
      </p>
      <p style="font-size:12px;color:#8af;margin-top:8px;">
        ⏳ 等待你创建新节点...
      </p>
    `,
    type: 'action',
    waitFor: 'nodeCreated',
    unlockControls: true,
    hint3D: '右键 → 新建子节点',
  },

  // ================================================================
  //  第 7 步：添加连线（右键 → 添加连线 → 左键点目标节点）
  // ================================================================
  {
    id: 'connection',
    title: '🔗 添加连线',
    html: `
      <p style="font-size:14px;line-height:1.7;color:#cde;">
        <strong style="color:#0ff;">
          📌 操作：① 右键节点 → 点击「添加连线」<br>
          <span style="padding-left:4.2em;">② 左键点击另一个节点完成连线</span>
        </strong>
      </p>
      <p style="font-size:12px;color:#9ab;margin-top:6px;">
        弹出输入框后可填写连线标签（可选），按回车确认。右键或 ${KBD('Esc')} 取消。
      </p>
      <p style="font-size:12px;color:#8af;margin-top:8px;">
        ⏳ 等待你完成连线...
      </p>
    `,
    type: 'action',
    waitFor: 'connectionAdded',
    unlockControls: true,
    hint3D: '右键→添加连线→左键点目标',
  },

  // ================================================================
  //  第 8 步：删除连线（两种方法）
  // ================================================================
  {
    id: 'deleteConnection',
    title: '🗑️ 删除连线（两种方法）',
    html: `
      <p style="font-size:14px;line-height:1.7;color:#cde;">
        <strong style="color:#0ff;">📌 操作（任选一种删除刚建的连线）：</strong>
      </p>
      <div style="font-size:13px;color:#cde;line-height:1.8;margin-top:4px;">
        <p style="margin:4px 0;"><span style="color:#0ff;">方法一</span>：右键已连接的节点 → 点击「🗑️ 删除连线」→ 左键点目标节点</p>
        <p style="margin:8px 0 0 0;"><span style="color:#0ff;">方法二</span>：左键点击场景中任一连线标签 → 弹出菜单 →「🗑️ 删除此连线」</p>
      </div>
      <p style="font-size:12px;color:#8af;margin-top:10px;">
        ⏳ 等待你删除刚创建的连线...
      </p>
    `,
    type: 'action',
    waitFor: 'connectionRemoved',
    unlockControls: true,
    hint3D: '右键节点→删除连线→点目标',
  },

  // ================================================================
  //  〓〓 阶段 2：2D 视图（思维导图模式）〓〓
  // ================================================================

  //  第 9 步：切换到 2D 视图
  // ================================================================
  {
    id: 'switchTo2D',
    title: '🌐 切换到 2D 视图',
    html: `
      <p style="font-size:14px;line-height:1.7;color:#cde;">
        <strong style="color:#0ff;">📌 操作：点击任务栏中的「🌦 2D」按钮</strong>
      </p>
      <p style="font-size:12px;color:#9ab;margin-top:6px;">
        2D 模式以思维导图方式排列节点，更适合梳理层级结构和批量操作。
      </p>
      <p style="font-size:12px;color:#8af;margin-top:8px;">
        ⏳ 点击「🌦 2D」切换到 2D 视图...
      </p>
    `,
    type: 'action',
    waitFor: 'switchTo2D',
    target: '#modeToggleBtn',
  },

  // ================================================================
  //  第 10 步：2D 视图导航（平移 + 缩放）
  // ================================================================
  {
    id: 'navigate2D',
    title: '🗺️ 2D 视图导航',
    html: `
      <p style="font-size:14px;line-height:1.7;color:#cde;">
        <strong style="color:#0ff;">
          📌 操作：在 2D 画布上 <span style="color:#ff0;">滚动鼠标滚轮</span> 缩放，<br>
          <span style="padding-left:4.2em;">或用键盘 ${KBD('W')}${KBD('A')}${KBD('S')}${KBD('D')} / 方向键平移</span>
        </strong>
      </p>
      <p style="font-size:12px;color:#9ab;margin-top:6px;">
        试试放大缩小，或者移动画布位置。2D 模式下你可以看到完整的层级结构。
      </p>
      <p style="font-size:12px;color:#8af;margin-top:8px;">
        ⏳ 等待你缩放或移动 2D 画布...
      </p>
    `,
    type: 'action',
    waitFor: 'navigate2D',
  },

  // ================================================================
  //  第 11 步：折叠/展开子节点
  // ================================================================
  {
    id: 'collapseChildren2D',
    title: '📂 折叠 / 展开子节点',
    html: `
      <p style="font-size:14px;line-height:1.7;color:#cde;">
        <strong style="color:#0ff;">📌 操作：右键任意有子节点的节点 → 点击「折叠/展开子节点」</strong>
      </p>
      <p style="font-size:12px;color:#9ab;margin-top:6px;">
        折叠后子节点暂时隐藏，画布更清爽。再次相同操作即可恢复展开。2D / 3D 视图均可用。
      </p>
      <p style="font-size:12px;color:#8af;margin-top:8px;">
        ⏳ 点击「折叠/展开子节点」完成操作...
      </p>
    `,
    type: 'action',
    waitFor: 'childrenToggled',
    unlockControls: true,
  },

  // ================================================================
  //  第 12 步：2D 视图中拖拽定位节点
  // ================================================================
  {
    id: 'dragNode2D',
    title: '🖱️ 拖拽定位节点（2D 视图）',
    html: `
      <p style="font-size:14px;line-height:1.7;color:#cde;">
        <strong style="color:#0ff;">📌 操作：在 2D 画布中按住任意节点拖拽到新位置</strong>
      </p>
      <p style="font-size:12px;color:#9ab;margin-top:6px;">
        在 2D 思维导图模式下可以自由拖拽节点调整布局。拖拽父节点时其所有后代节点会同步跟随移动。
      </p>
      <p style="font-size:12px;color:#8af;margin-top:8px;">
        ⏳ 拖拽任意节点即可完成...
      </p>
    `,
    type: 'action',
    waitFor: 'nodeDragged2D',
    unlockControls: true,
  },

  // ================================================================
  //  第 13 步：2D 自动排列
  // ================================================================
  {
    id: 'autoArrange2D',
    title: '🗂️ 2D 自动排列',
    html: `
      <p style="font-size:14px;line-height:1.7;color:#cde;">
        <strong style="color:#0ff;">📌 操作：点击任务栏中的「Auto」按钮 → 选择「自动排列」</strong>
      </p>
      <p style="font-size:12px;color:#9ab;margin-top:6px;">
        一键将所有节点按树状结构整齐排列，省去手动拖拽的麻烦。多图层时可选「所有图层自动排列」。
      </p>
      <p style="font-size:12px;color:#8af;margin-top:8px;">
        ⏳ 点击「自动排列」即可完成...
      </p>
    `,
    type: 'action',
    waitFor: 'autoArrange2D',
    target: '#arrangeBtn',
  },

  // ================================================================
  //  第 14 步：2D 框选/多选节点
  // ================================================================
  {
    id: 'multiSelect2D',
    title: '⌨️ 2D 多选节点',
    html: `
      <p style="font-size:14px;line-height:1.7;color:#cde;">
        <strong style="color:#0ff;">
          📌 操作（二选一）：<br>
          <span style="padding-left:1em;">① 按住 ${KBD('Ctrl')} 键 + 点击节点 多选</span><br>
          <span style="padding-left:1em;">② 在空白处 <span style="color:#ff0;">按住左键拖拽</span> 框选多个节点</span>
        </strong>
      </p>
      <p style="font-size:12px;color:#9ab;margin-top:6px;">
        多选后可以批量执行：删除、移动图层、复制粘贴等操作。
      </p>
      <p style="font-size:12px;color:#8af;margin-top:8px;">
        ⏳ 等待你选中 ≥2 个节点...
      </p>
    `,
    type: 'action',
    waitFor: 'multiSelect2D',
  },

  // ================================================================
  //  第 15 步：切回 3D 视图
  // ================================================================
  {
    id: 'switchBack3D',
    title: '🔄 切回 3D 视图',
    html: `
      <p style="font-size:14px;line-height:1.7;color:#cde;">
        <strong style="color:#0ff;">📌 操作：点击任务栏「🪐 3D」按钮切回 3D</strong>
      </p>
      <p style="font-size:12px;color:#9ab;margin-top:6px;">
        你可以随时在 2D 和 3D 之间切换，数据完全同步。
      </p>
      <p style="font-size:12px;color:#8af;margin-top:8px;">
        ⏳ 点击按钮切回 3D...
      </p>
    `,
    type: 'action',
    waitFor: 'switchTo3D',
    target: '#modeToggleBtn',
  },

  // ================================================================
  //  第 16 步：3D 移动节点
  // ================================================================
  {
    id: 'nodeMoved3D',
    title: '🖱️ 3D 移动节点',
    html: `
      <p style="font-size:14px;line-height:1.7;color:#cde;">
        <strong style="color:#0ff;">
          📌 操作：① 右键任意节点 → 点击「移动节点」<br>
          <span style="padding-left:4.2em;">② 按住左键拖拽节点到新位置</span><br>
          <span style="padding-left:4.2em;">③ 点击底部 ✅「确定」保存</span>
        </strong>
      </p>
      <p style="font-size:12px;color:#9ab;margin-top:6px;">
        进入移动模式后，节点高亮代表可拖拽。点击 ❌「取消」可恢复原位。
      </p>
      <p style="font-size:12px;color:#8af;margin-top:8px;">
        ⏳ 拖拽节点并确定后完成...
      </p>
    `,
    type: 'action',
    waitFor: 'nodeMoved3D',
    unlockControls: true,
    hint3D: '右键→移动节点→拖拽→确定',
  },

  // ================================================================
  //  第 17 步：3D 按 2D 模式排列
  // ================================================================
  {
    id: 'arrange3D2D',
    title: '🗂️ 3D 按 2D 布局排列',
    html: `
      <p style="font-size:14px;line-height:1.7;color:#cde;">
        <strong style="color:#0ff;">📌 操作：点击任务栏「Auto」→ 在"3D 模式"区域选择「2D模式排列」</strong>
      </p>
      <p style="font-size:12px;color:#9ab;margin-top:6px;">
        将当前 3D 场景中的节点按 2D 树状布局重新排列，兼具 3D 视觉效果和 2D 的清晰层级。
      </p>
      <p style="font-size:12px;color:#8af;margin-top:8px;">
        ⏳ 点击「2D模式排列」即可完成...
      </p>
    `,
    type: 'action',
    waitFor: 'arrange3D2D',
    target: '#arrangeBtn',
  },

  // ================================================================
  //  第 18 步：搜索功能（键入 → 点击下拉结果）
  // ================================================================
  {
    id: 'taskbarSearch',
    title: '🔎 试试搜索功能',
    html: `
      <p style="font-size:14px;line-height:1.7;color:#cde;">
        <strong style="color:#0ff;">
          📌 操作：<br>
          <span style="padding-left:1em;">① 点击底栏搜索框，输入关键词（如"Python"）</span><br>
          <span style="padding-left:1em;">② 在下拉结果中 <span style="color:#ff0;">点击匹配的节点名</span></span>
        </strong>
      </p>
      <p style="font-size:12px;color:#9ab;margin-top:6px;">
        被选中的节点会自动在视图中聚焦显示。多项目多节点时搜索是最快的定位方式。
      </p>
      <p style="font-size:12px;color:#8af;margin-top:8px;">
        ⏳ 输入关键词，然后点击搜索结果中的节点...
      </p>
    `,
    type: 'action',
    waitFor: 'searchUsed',
    target: '#taskbarSearchContainer',
  },

  // ================================================================
  //  第 19 步：打开主菜单
  // ================================================================
  {
    id: 'astroMenu',
    title: '⭐ AstroKnot 主菜单',
    html: `
      <p style="font-size:14px;line-height:1.7;color:#cde;">
        <strong style="color:#0ff;">📌 操作：点击任务栏最左侧的 AstroKnot 图标按钮</strong>
      </p>
      <p style="font-size:12px;color:#9ab;margin-top:6px;">
        主菜单包含：项目管理、导入导出、撤销重做、新建节点、粘贴等批量操作。
      </p>
      <p style="font-size:12px;color:#8af;margin-top:8px;">
        ⏳ 等待你点击图标按钮...
      </p>
    `,
    type: 'action',
    waitFor: 'menuOpened',
    target: '#astroKnotBtn',
  },


  // ================================================================
  //  第 20 步：打开富文本编辑器
  // ================================================================
  {
    id: 'richEditor',
    title: '📝 打开富文本编辑器',
    html: `
      <p style="font-size:14px;line-height:1.7;color:#cde;">
        <strong style="color:#0ff;">📌 操作：双击场景中任意节点</strong>
      </p>
      <p style="font-size:12px;color:#9ab;margin-top:6px;">
        编辑器支持：排版、LaTeX 公式、代码高亮、ECharts 图表、图片、音频、视频等。
      </p>
      <p style="font-size:12px;color:#8af;margin-top:8px;">
        ⏳ 双击节点打开编辑器...
      </p>
    `,
    type: 'action',
    waitFor: 'editorOpened',
    unlockControls: true,
    hint3D: '双击节点打开编辑',
  },

  // ================================================================
  //  第 21 步：关闭编辑器
  // ================================================================
  {
    id: 'closeEditor',
    title: '🙌 关闭编辑器',
    html: `
      <p style="font-size:14px;line-height:1.7;color:#cde;">
        <strong style="color:#0ff;">📌 操作：点击编辑器右上角的 ✕ 关闭</strong>
      </p>
      <p style="font-size:12px;color:#9ab;margin-top:6px;">
        你已经体验了 AstroKnot 的核心操作流程！马上进入最后的总结。
      </p>
      <p style="font-size:12px;color:#8af;margin-top:8px;">
        ⏳ 关闭编辑器继续...
      </p>
    `,
    type: 'action',
    waitFor: 'editorClosed',
    target: '#richEditorModal',
  },

  // ================================================================
  //  第 22 步：快捷键总结
  // ================================================================
  {
    id: 'shortcuts',
    title: '✅ 快捷键速览',
    html: `
      <div style="font-size:13px;line-height:2;color:#cde;">
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="color:#0ff;width:150px;">${KBD('Ctrl')}+${KBD('Z')}</td><td>撤销</td></tr>
          <tr><td style="color:#0ff;">${KBD('Ctrl')}+${KBD('Y')}</td><td>重做</td></tr>
          <tr><td style="color:#0ff;">${KBD('Ctrl')}+${KBD('C')}/${KBD('V')}</td><td>复制 / 粘贴节点</td></tr>
          <tr><td style="color:#0ff;">${KBD('Ctrl')}+${KBD('P')}</td><td>聚焦搜索框</td></tr>
          <tr><td style="color:#0ff;">${KBD('Ctrl')}+点击</td><td>多选节点</td></tr>
          <tr><td style="color:#0ff;">${KBD('Delete')}</td><td>删除选中节点</td></tr>
          <tr><td style="color:#0ff;">${KBD('F1')}</td><td>隐藏所有 UI 界面</td></tr>
          <tr><td style="color:#0ff;">右键拖拽</td><td>平移视图</td></tr>
          <tr><td style="color:#0ff;">鼠标滚轮</td><td>缩放视距</td></tr>
        </table>
      </div>
    `,
    type: 'modal',
    btnText: '完成了！🎉',
  },

  // ================================================================
  //  第 23 步：打开设置面板
  // ================================================================
  {
    id: 'openSettings',
    title: '⚙️ 打开设置面板',
    html: `
      <p style="font-size:14px;line-height:1.7;color:#cde;">
        <strong style="color:#0ff;">
          📌 操作：<br>
          <span style="padding-left:1em;">点击 AstroKnot 菜单左下角的 <span style="color:#ff0;">⚙️ 设置</span> 按钮</span>
        </strong>
      </p>
      <div style="margin-top:10px;padding:8px 12px;background:rgba(0,255,255,0.06);border-radius:10px;border-left:3px solid rgba(0,255,255,0.4);">
        <p style="font-size:12px;color:#9ab;margin:0;line-height:1.8;">
          <strong style="color:#0ff;">设置面板包含以下可调项：</strong>
        </p>
        <table style="width:100%;font-size:11px;color:#8aa;border-collapse:collapse;margin-top:4px;">
          <tr><td style="color:#b088ff;white-space:nowrap;padding:2px 6px 2px 0;">🖥️ 显示</td><td>天空转速/亮度/饱和度、球体泛光、圆环、连线粒子、流星、渲染性能</td></tr>
          <tr><td style="color:#b088ff;white-space:nowrap;padding:2px 6px 2px 0;">📝 编辑器</td><td>字体大小、浅色模式、页面视图</td></tr>
          <tr><td style="color:#b088ff;white-space:nowrap;padding:2px 6px 2px 0;">📐 2D 视图</td><td>节点默认尺寸、节点间距</td></tr>
          <tr><td style="color:#b088ff;white-space:nowrap;padding:2px 6px 2px 0;">🎨 主题</td><td>全局主题色定制</td></tr>
          <tr><td style="color:#b088ff;white-space:nowrap;padding:2px 6px 2px 0;">🚀 启动</td><td>启动时自动加载项目等选项</td></tr>
          <tr><td style="color:#b088ff;white-space:nowrap;padding:2px 6px 2px 0;">📂 文件位置</td><td>项目和笔记的保存路径</td></tr>
          <tr><td style="color:#b088ff;white-space:nowrap;padding:2px 6px 2px 0;">📖 使用帮助</td><td>完整操作手册（下一步将带你打开）</td></tr>
        </table>
      </div>
      <p style="font-size:12px;color:#8af;margin-top:8px;">
        ⏳ 请点击 <span style="color:#ff0;">⚙️</span> 按钮打开设置面板...
      </p>
    `,
    type: 'action',
    waitFor: 'settingsOpened',
    target: '#toggleNodeGlowBtn',
    bubblePosition: 'right',
  },

  // ================================================================
  //  第 24 步：切换到「使用帮助」标签页
  // ================================================================
  {
    id: 'openHelpTab',
    title: '📖 使用帮助',
    html: `
      <p style="font-size:14px;line-height:1.7;color:#cde;">
        <strong style="color:#0ff;">
          📌 操作：<br>
          <span style="padding-left:1em;">在设置面板顶部，点击 <span style="color:#ff0;">📖 使用帮助</span> 标签页</span>
        </strong>
      </p>
      <p style="font-size:12px;color:#9ab;margin-top:6px;">
        使用帮助包含了所有操作的详细说明、快捷键列表和功能介绍。遇到问题时随时可以回来查阅！
      </p>
      <p style="font-size:12px;color:#8af;margin-top:8px;">
        ⏳ 点击 <span style="color:#ff0;">📖 使用帮助</span> 标签页...
      </p>
    `,
    type: 'action',
    waitFor: 'helpTabOpened',
    target: '#settingsPopup',
    bubblePosition: 'right',
    beforeShow() {
      // 确保 AstroKnot 菜单已关闭，避免遮挡设置面板
      const menu = document.getElementById('astroKnotMenu');
      if (menu && menu.classList.contains('show')) {
        menu.classList.add('hiding');
        menu.addEventListener('animationend', function onEnd() {
          menu.removeEventListener('animationend', onEnd);
          menu.classList.remove('show', 'hiding');
        });
      }
    },
  },

  // ================================================================
  //  第 25 步：完成
  // ================================================================
  {
    id: 'complete',
    title: '🚀 开始你的探索吧！',
    html: `
      <div style="text-align:center;padding:10px 0;">
        <p style="font-size:15px;line-height:1.7;color:#cde;">
          你已经亲手体验了 <strong style="color:#0ff;">AstroKnot</strong> 的所有核心操作！
        </p>
        <p style="font-size:13px;color:#9ab;margin-top:10px;">
          打开帮助面板 <strong style="color:#0ff;">「进入教程」</strong> 可重新回顾引导。
        </p>
        <p style="font-size:13px;color:#8aa;margin-top:6px;">
          现在，自由地去构建你的知识宇宙吧！
        </p>
      </div>
    `,
    type: 'modal',
    btnText: '开始探索 ✨',
  },
];
