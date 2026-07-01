// ============================================================
//  GuideCore.js — 新手引导：操作驱动的步骤定义 + 状态机
//  每一步都要求用户亲手操作，检测到正确操作后自动进入下一步
// ============================================================

const GUIDE_BASE_KEY = 'astroknot_guide_completed';
const GUIDE_STEP_BASE_KEY = 'astroknot_guide_current_step';

/** 获取带版本号的存储键，版本不同则自动重置教程 */
function _versionKey(base) {
  const v = (window.api && window.api.appVersion) || '0.0.0';
  return `${base}_v${v}`;
}
function _completedKey() { return _versionKey(GUIDE_BASE_KEY); }
function _stepKey()     { return _versionKey(GUIDE_STEP_BASE_KEY); }

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
  //  第 3 步：点击选中节点（需要用户左键点击任意节点）
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
  //  第 4 步：右键打开上下文菜单（需要用户右键点击节点）
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
  //  第 5 步：创建子节点（需要用户通过右键菜单操作）
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
  //  第 6 步：添加连线（右键 → 添加连线 → 左键点目标节点）
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
  //  第 7 步：删除连线（两种方法）
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

  //  第 7 步：切换到 2D 视图
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
  //  第 8 步：2D 视图导航（平移 + 缩放）
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
  //  第 9 步：折叠/展开子节点
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
  //  第 10 步：2D 视图中拖拽定位节点
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
  //  第 11 步：2D 自动排列
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
  //  第 11 步：2D 框选/多选节点
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
  //  第 10 步：切回 3D 视图
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
  //  第 13 步：3D 移动节点
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
  //  第 14 步：3D 按 2D 模式排列
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
  //  第 11 步：搜索功能（键入 → 点击下拉结果）
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
  //  第 12 步：打开主菜单
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
  //  第 14 步：打开富文本编辑器
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
  //  第 15 步：关闭编辑器
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
  //  第 16 步：快捷键总结
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
  //  第 17 步：完成
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

// ================================================================
//  操作检测器（ActionDetector）
//  统一管理各种用户操作的检测逻辑
// ================================================================
export class ActionDetector {
  constructor() {
    this._intervals = [];
    this._observers = [];
    this._eventListeners = [];
    this._cleanupFns = [];
    this._initialValues = {};
    this._prevValue = {};
  }

  /** 记录初始状态（用于变化检测） */
  snapshot(key, value) {
    this._initialValues[key] = value;
  }

  /** 轮询检测（每 300ms 检查一次） */
  poll(conditionFn, onDetected, key) {
    const id = setInterval(() => {
      try {
        if (conditionFn()) {
          clearInterval(id);
          const idx = this._intervals.indexOf(id);
          if (idx >= 0) this._intervals.splice(idx, 1);
          onDetected();
        }
      } catch (e) { /* ignore */ }
    }, 300);
    this._intervals.push(id);
    return id;
  }

  /** DOM 属性变化观察 */
  observeStyle(el, onDetected) {
    if (!el) return null;
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.attributeName === 'style' || m.attributeName === 'class') {
          observer.disconnect();
          onDetected();
          return;
        }
      }
    });
    observer.observe(el, { attributes: true, attributeFilter: ['style', 'class'] });
    this._observers.push(observer);
    return observer;
  }

  /** DOM 事件监听（一次性） */
  listenOnce(el, event, onDetected) {
    if (!el) return null;
    const handler = () => {
      el.removeEventListener(event, handler);
      onDetected();
    };
    el.addEventListener(event, handler);
    this._eventListeners.push({ el, event, handler });
    return handler;
  }

  /** 注册清理函数 */
  onCleanup(fn) {
    this._cleanupFns.push(fn);
  }

  /** 清理所有监听 */
  cleanup() {
    for (const id of this._intervals) clearInterval(id);
    this._intervals = [];
    for (const ob of this._observers) ob.disconnect();
    this._observers = [];
    for (const { el, event, handler } of this._eventListeners) {
      el.removeEventListener(event, handler);
    }
    this._eventListeners = [];
    for (const fn of this._cleanupFns) fn();
    this._cleanupFns = [];
    this._initialValues = {};
  }
}

// ================================================================
//  引导状态机
// ================================================================
class GuideStateMachine {
  constructor() {
    this.steps = STEPS;
    this.currentIndex = 0;
    this.completed = false;
    this.active = false;
    this._listeners = {};
    this._detector = new ActionDetector();
    this._origControlsState = null;
  }

  get currentStep() { return this.steps[this.currentIndex]; }
  get totalSteps()   { return this.steps.length; }
  get progress()     { return `${this.currentIndex + 1} / ${this.totalSteps}`; }

  // ---- localStorage ----
  load() {
    this.completed = localStorage.getItem(_completedKey()) === 'true';
    const saved = localStorage.getItem(_stepKey());
    if (saved !== null) {
      const idx = parseInt(saved, 10);
      if (!isNaN(idx) && idx >= 0 && idx < this.totalSteps) this.currentIndex = idx;
    }
  }
  save() {
    localStorage.setItem(_completedKey(), this.completed ? 'true' : 'false');
    localStorage.setItem(_stepKey(), String(this.currentIndex));
  }
  markCompleted() { this.completed = true; this.save(); }

  // ---- 导航 ----
  start() { this.load(); if (this.completed) return false; this.currentIndex = 0; this.active = true; this.save(); return true; }
  next() {
    if (this.currentIndex < this.totalSteps - 1) { this.currentIndex++; this.save(); return true; }
    this.markCompleted(); this.active = false; return false;
  }
  prev() { if (this.currentIndex > 0) { this.currentIndex--; this.save(); return true; } return false; }
  skip() { this.markCompleted(); this.active = false; }

  // ---- 事件 ----
  on(event, handler) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(handler);
  }
  off(event, handler) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(h => h !== handler);
  }
  emit(event, ...args) {
    if (!this._listeners[event]) return;
    for (const h of this._listeners[event]) h(...args);
  }

  // ---- 操作检测核心 ----
  /**
   * 为当前步骤启动操作检测，检测到后回调 onComplete
   * @param {Function} onComplete - 检测到操作完成时的回调
   * @param {object} guide3D - Guide3D 实例
   */
  startDetection(onComplete, guide3D) {
    this.stopDetection();
    const step = this.currentStep;
    if (!step || !step.waitFor) return;

    const st = window.appState;
    const detector = this._detector;

    switch (step.waitFor) {

      // --- 旋转视角：检测相机位置变化超过阈值 ---
      case 'cameraRotate':
        if (st && st.camera) {
          const initPos = st.camera.position.clone();
          const initTarget = st.controls?.target ? st.controls.target.clone() : null;
          const threshold = 0.6;
          detector.poll(
            () => {
              if (!st.camera) return false;
              const dp = st.camera.position.distanceTo(initPos);
              if (initTarget && st.controls?.target) {
                const dt = st.controls.target.distanceTo(initTarget);
                return (dp > threshold || dt > 0.4);
              }
              return dp > threshold;
            },
            onComplete,
            'cameraRotate'
          );
        }
        break;

      // --- 键盘飞行：W/A/S/D/空格/Ctrl，每按一个就更新进度 ---
      case 'keyboardNav': {
        const TARGET_KEYS = new Map([
          ['KeyW',     { label: 'W' }],
          ['KeyA',     { label: 'A' }],
          ['KeyS',     { label: 'S' }],
          ['KeyD',     { label: 'D' }],
          ['Space',    { label: '空格' }],
          ['ControlLeft',  { label: 'Ctrl' }],
          ['ControlRight', { label: 'Ctrl' }],
        ]);
        const pressed = new Set();
        const progressEl = document.getElementById('guideKeyProgress');

        const updateProgress = () => {
          // 合并左右 Ctrl 只算一次
          const unique = new Set();
          for (const key of pressed) {
            if (key === 'ControlLeft' || key === 'ControlRight') {
              unique.add('Ctrl');
            } else {
              unique.add(key);
            }
          }
          const count = unique.size;
          if (progressEl) {
            progressEl.innerHTML = `⏳ 已尝试: <strong style="color:#0ff;">${count}</strong> / 6 个键`;
          }
          if (count >= 6) {
            if (progressEl) {
              progressEl.innerHTML = '✅ <strong style="color:#5fefcf;">全部完成！</strong>';
            }
            document.removeEventListener('keydown', onKey, true);
            setTimeout(onComplete, 400);
          }
        };

        const onKey = (e) => {
          if (TARGET_KEYS.has(e.code)) {
            // 仅记录不拦截，让 Keyboard.js 正常处理移动
            pressed.add(e.code);
            updateProgress();
          }
        };

        document.addEventListener('keydown', onKey, true);
        detector.onCleanup(() => {
          document.removeEventListener('keydown', onKey, true);
        });

        // 兜底：如果已经按了部分键但用户卡住了，30s 后允许通过（至少 3 个即可）
        let fallbackTimer = setTimeout(() => {
          const unique = new Set();
          for (const key of pressed) {
            unique.add(key === 'ControlLeft' || key === 'ControlRight' ? 'Ctrl' : key);
          }
          if (unique.size >= 3) {
            updateProgress();
          }
        }, 30000);
        detector.onCleanup(() => clearTimeout(fallbackTimer));

        break;
      }

      // --- 缩放：检测相机到目标的距离变化 ---
      case 'cameraZoom':
        if (st && st.camera && st.controls) {
          const initDist = st.camera.position.distanceTo(st.controls.target);
          detector.poll(
            () => {
              if (!st.camera || !st.controls) return false;
              const curDist = st.camera.position.distanceTo(st.controls.target);
              return Math.abs(curDist - initDist) > 0.8;
            },
            onComplete,
            'cameraZoom'
          );
        }
        break;

      // --- 选中节点 ---
      case 'nodeSelect':
        if (st) {
          // 先确保没有已选中的节点干扰
          const alreadySelected = st.selectedNodeIds && st.selectedNodeIds.size > 0;
          if (alreadySelected) {
            // 已经选了，稍微延迟再触发（给用户看到反馈的时间）
            setTimeout(onComplete, 400);
          } else {
            detector.poll(
              () => st.selectedNodeIds && st.selectedNodeIds.size > 0,
              () => setTimeout(onComplete, 300),
              'nodeSelect'
            );
          }
        }
        break;

      // --- 右键菜单 ---
      case 'contextMenu': {
        const menu = document.getElementById('nodeContextMenu');
        if (menu) {
          detector.observeStyle(menu, () => setTimeout(onComplete, 300));
        }
        break;
      }

      // --- 创建新节点 ---
      case 'nodeCreated':
        if (st && st.nodeMap) {
          detector.snapshot('nodeCount', st.nodeMap.size);
          detector.poll(
            () => st.nodeMap && st.nodeMap.size > detector._initialValues['nodeCount'],
            () => setTimeout(onComplete, 500),
            'nodeCreated'
          );
        }
        break;

      // --- 添加连线 ---
      case 'connectionAdded':
        if (st) {
          const initCount = st.crossEdges ? st.crossEdges.length : 0;
          detector.snapshot('crossEdgeCount', initCount);
          detector.poll(
            () => {
              const cur = st.crossEdges ? st.crossEdges.length : 0;
              return cur > initCount;
            },
            () => setTimeout(onComplete, 400),
            'connectionAdded'
          );
        }
        break;

      // --- 删除连线：crossEdges 数量减少即完成 ---
      case 'connectionRemoved':
        if (st) {
          const initCount = st.crossEdges ? st.crossEdges.length : 0;
          detector.snapshot('crossEdgeCountDel', initCount);
          detector.poll(
            () => {
              const cur = st.crossEdges ? st.crossEdges.length : 0;
              return cur < initCount;
            },
            () => setTimeout(onComplete, 400),
            'connectionRemoved'
          );
        }
        break;

      // --- 2D 框选 / Ctrl+多选（≥2 个节点） ---
      case 'multiSelect2D':
        if (st) {
          if (st.selectedNodeIds && st.selectedNodeIds.size > 0) {
            st.clearSelected();
          }
          detector.poll(
            () => st.selectedNodeIds && st.selectedNodeIds.size >= 2,
            () => setTimeout(onComplete, 400),
            'multiSelect2D'
          );
        }
        break;

      // --- 搜索：输入关键词并点击下拉结果 ---
      case 'searchUsed': {
        const dropdown = document.getElementById('searchDropdown');
        if (dropdown) {
          // 监听下拉菜单内的 click 事件（用户点了某个搜索结果 div）
          const onClick = () => {
            // 点击了下拉中的任意 div（即搜索结果项），等待回调执行后触发
            setTimeout(onComplete, 500);
          };
          dropdown.addEventListener('click', onClick, true);
          detector.onCleanup(() => {
            dropdown.removeEventListener('click', onClick, true);
          });
        }
        // 兜底：搜索后 selectedNodeIds 变化也视为完成
        if (st && st.selectedNodeIds) {
          const initSelected = st.selectedNodeIds.size || 0;
          detector.poll(
            () => (st.selectedNodeIds && st.selectedNodeIds.size > initSelected),
            () => setTimeout(onComplete, 400),
            'searchNodeSelected'
          );
        }
        break;
      }

      // --- 打开主菜单 ---
      case 'menuOpened': {
        const menu = document.getElementById('astroKnotMenu');
        if (menu) {
          detector.observeStyle(menu, () => setTimeout(onComplete, 300));
        }
        // 也监听按钮点击
        const btn = document.getElementById('astroKnotBtn');
        if (btn) {
          detector.listenOnce(btn, 'click', () => setTimeout(onComplete, 600));
        }
        break;
      }

      // --- 切换到 2D 视图 ---
      case 'switchTo2D':
        if (st) {
          // 已经在 2D 模式了？无操作直接下一步
          if (st.is2DView) { setTimeout(onComplete, 300); break; }
          detector.poll(
            () => !!st.is2DView,
            () => setTimeout(onComplete, 300),
            'switchTo2D'
          );
        }
        break;

      // --- 2D 视图导航（缩放或平移） ---
      case 'navigate2D':
        if (st && st.view2DTransform) {
          const t = st.view2DTransform;
          const init = { ox: t.offsetX || 0, oy: t.offsetY || 0, s: t.scale || 1 };
          const threshold = 10; // 平移阈值像素
          detector.poll(
            () => {
              if (!st.view2DTransform) return false;
              const cur = st.view2DTransform;
              const dx = Math.abs((cur.offsetX || 0) - init.ox);
              const dy = Math.abs((cur.offsetY || 0) - init.oy);
              const ds = Math.abs((cur.scale || 1) - init.s);
              return (dx > threshold || dy > threshold || ds > 0.05);
            },
            () => setTimeout(onComplete, 400),
            'navigate2D'
          );
        }
        break;

      // --- 折叠/展开子节点：检测 collapsed2D Set 或 node visibility 变化 ---
      case 'childrenToggled': {
        if (st) {
          // 快照 2D 折叠状态
          const initCollapsed = st.collapsed2D ? new Set(st.collapsed2D) : new Set();
          // 快照 3D 节点可见性
          const initVisible = new Set();
          if (st.nodeMap) {
            for (const [id, node] of st.nodeMap) {
              if (node.visible !== false) initVisible.add(id);
            }
          }
          detector.poll(
            () => {
              // 2D: collapsed2D 集合变化
              if (st.collapsed2D) {
                if (st.collapsed2D.size !== initCollapsed.size) return true;
                for (const id of st.collapsed2D) {
                  if (!initCollapsed.has(id)) return true;
                }
              }
              // 3D: 节点可见性变化
              if (st.nodeMap) {
                const curVisible = new Set();
                for (const [id, node] of st.nodeMap) {
                  if (node.visible !== false) curVisible.add(id);
                }
                if (curVisible.size !== initVisible.size) return true;
                for (const id of curVisible) {
                  if (!initVisible.has(id)) return true;
                }
              }
              return false;
            },
            () => setTimeout(onComplete, 400),
            'childrenToggled'
          );
        }
        break;
      }

      // --- 2D 拖拽定位节点：检测 positions2D 坐标变化 ---
      case 'nodeDragged2D': {
        if (st && st.positions2D) {
          const initPositions = new Map();
          for (const [id, pos] of st.positions2D.entries()) {
            if (pos) initPositions.set(id, { x: pos.x, y: pos.y });
          }
          detector.poll(
            () => {
              if (!st.positions2D) return false;
              for (const [id, pos] of st.positions2D.entries()) {
                const initPos = initPositions.get(id);
                if (initPos && pos) {
                  if (Math.abs(pos.x - initPos.x) > 5 || Math.abs(pos.y - initPos.y) > 5) return true;
                } else if (!initPos && pos) {
                  return true;  // 新增位置
                }
              }
              return false;
            },
            () => setTimeout(onComplete, 400),
            'nodeDragged2D'
          );
        }
        break;
      }

      // --- 2D 自动排列：多个节点 positions2D 同时变化 ---
      case 'autoArrange2D': {
        if (st && st.positions2D) {
          const initPositions = new Map();
          for (const [id, pos] of st.positions2D.entries()) {
            if (pos) initPositions.set(id, { x: pos.x, y: pos.y });
          }
          detector.poll(
            () => {
              if (!st.positions2D) return false;
              let changedCount = 0;
              for (const [id, pos] of st.positions2D.entries()) {
                const initPos = initPositions.get(id);
                if (initPos && pos) {
                  if (Math.abs(pos.x - initPos.x) > 2 || Math.abs(pos.y - initPos.y) > 2) changedCount++;
                }
              }
              return changedCount >= 3;
            },
            () => setTimeout(onComplete, 500),
            'autoArrange2D'
          );
        }
        break;
      }

      // --- 切回 3D 视图 ---
      case 'switchTo3D':
        if (st) {
          // 已经在 3D 模式？无操作直接下一步
          if (!st.is2DView) { setTimeout(onComplete, 300); break; }
          detector.poll(
            () => !st.is2DView,
            () => setTimeout(onComplete, 300),
            'switchTo3D'
          );
        }
        break;

      // --- 3D 移动节点：检测任意节点 3D 位置变化 ---
      case 'nodeMoved3D': {
        if (st && st.positions) {
          const initPositions = new Map();
          for (const [id, pos] of st.positions.entries()) {
            if (pos) initPositions.set(id, pos.clone());
          }
          detector.poll(
            () => {
              if (!st.positions) return false;
              for (const [id, pos] of st.positions.entries()) {
                const initPos = initPositions.get(id);
                if (initPos && pos && pos.distanceTo(initPos) > 0.5) return true;
              }
              return false;
            },
            () => setTimeout(onComplete, 400),
            'nodeMoved3D'
          );
        }
        break;
      }

      // --- 3D 按 2D 布局排列：多个节点 positions 同时变化 ---
      case 'arrange3D2D': {
        if (st && st.positions) {
          const initPositions = new Map();
          for (const [id, pos] of st.positions.entries()) {
            if (pos) initPositions.set(id, pos.clone());
          }
          detector.poll(
            () => {
              if (!st.positions) return false;
              let changedCount = 0;
              for (const [id, pos] of st.positions.entries()) {
                const initPos = initPositions.get(id);
                if (initPos && pos && pos.distanceTo(initPos) > 0.3) changedCount++;
              }
              return changedCount >= 3;
            },
            () => setTimeout(onComplete, 500),
            'arrange3D2D'
          );
        }
        break;
      }

      // --- 打开富文本编辑器 ---
      case 'editorOpened': {
        const modal = document.getElementById('richEditorModal');
        if (modal) {
          detector.observeStyle(modal, () => setTimeout(onComplete, 300));
        }
        break;
      }

      // --- 关闭编辑器 ---
      case 'editorClosed': {
        const modal = document.getElementById('richEditorModal');
        if (modal) {
          // 初始检查是否已经隐藏
          const checkHidden = () => {
            const style = window.getComputedStyle(modal);
            if (style.display === 'none' || modal.style.display === 'none') {
              setTimeout(onComplete, 300);
              return true;
            }
            return false;
          };
          if (!checkHidden()) {
            detector.observeStyle(modal, () => setTimeout(onComplete, 300));
          }
        }
        break;
      }

      default:
        break;
    }
  }

  /** 停止当前步骤的操作检测 */
  stopDetection() {
    this._detector.cleanup();
  }

  /** 保存并禁用 controls 原始状态 */
  saveControlsState() {
    const st = window.appState;
    if (!st || !st.controls) return;
    this._origControlsState = {
      enableRotate: st.controls.enableRotate,
      enableZoom: st.controls.enableZoom,
      enablePan: st.controls.enablePan,
    };
  }

  /** 为当前步骤配置 controls（action 步骤通常需要解禁） */
  configureControls() {
    const step = this.currentStep;
    const st = window.appState;
    if (!st || !st.controls) return;

    if (step.unlockControls) {
      st.controls.enableRotate = true;
      st.controls.enableZoom = true;
      st.controls.enablePan = true;
    } else {
      st.controls.enableRotate = false;
      st.controls.enableZoom = false;
      st.controls.enablePan = false;
    }
  }

  /** 恢复 controls 原始状态 */
  restoreControls() {
    if (!this._origControlsState) return;
    const st = window.appState;
    if (!st || !st.controls) return;
    st.controls.enableRotate = this._origControlsState.enableRotate;
    st.controls.enableZoom = this._origControlsState.enableZoom;
    st.controls.enablePan = this._origControlsState.enablePan;
    this._origControlsState = null;
  }

  /** 销毁 */
  destroy() {
    this.stopDetection();
    this._listeners = {};
    this.active = false;
  }
}

// ---- 单例 ----
let _instance = null;

export function getGuideStateMachine() {
  if (!_instance) _instance = new GuideStateMachine();
  return _instance;
}

export function isGuideCompleted() {
  return localStorage.getItem(_completedKey()) === 'true';
}

export function resetGuide() {
  localStorage.removeItem(_completedKey());
  localStorage.removeItem(_stepKey());
  if (_instance) {
    _instance.completed = false;
    _instance.currentIndex = 0;
    _instance.active = false;
  }
}
