// ============================================================
//  GuideTutorial.js — 自动创建教程演示项目
//  当引导启动时检测到空白项目，自动创建一个包含
//  示例节点的知识图谱，供用户跟随引导操作。
// ============================================================

let _tutorialCreated = false;

const TUTORIAL_TREE = {
  id: '__VIRTUAL_ROOT__',
  name: '(虚拟根)',
  desc: '',
  children: [
    {
      id: 'guide_tut_root',
      name: '📖 我的知识库',
      desc: '这是知识图谱的根节点，从这里开始构建你的知识体系',
      sizeScale: 1.3,
      ringSpeedFactor: 1.0,
      fixedColor: '#4af',
      children: [
        {
          id: 'guide_tut_life',
          name: '🏠 日常生活',
          desc: '',
          sizeScale: 1.0,
          ringSpeedFactor: 1.0,
          fixedColor: null,
          children: [
            {
              id: 'guide_tut_cook',
              name: '🍳 烹饪食谱',
              desc: '',
              sizeScale: 1.0,
              ringSpeedFactor: 1.0,
              fixedColor: null,
              children: [],
            },
            {
              id: 'guide_tut_sport',
              name: '🏃 运动健身',
              desc: '',
              sizeScale: 1.0,
              ringSpeedFactor: 1.0,
              fixedColor: null,
              children: [],
            },
          ],
        },
        {
          id: 'guide_tut_tech',
          name: '💻 技术学习',
          desc: '',
          sizeScale: 1.0,
          ringSpeedFactor: 1.0,
          fixedColor: null,
          children: [
            {
              id: 'guide_tut_js',
              name: 'JavaScript',
              desc: '',
              sizeScale: 1.0,
              ringSpeedFactor: 1.0,
              fixedColor: '#f7df1e',
              children: [],
            },
            {
              id: 'guide_tut_py',
              name: 'Python',
              desc: '',
              sizeScale: 1.0,
              ringSpeedFactor: 1.0,
              fixedColor: '#3776ab',
              children: [],
            },
            {
              id: 'guide_tut_ai',
              name: '🤖 AI 人工智能',
              desc: '',
              sizeScale: 1.0,
              ringSpeedFactor: 1.0,
              fixedColor: '#ff6b9d',
              children: [],
            },
          ],
        },
        {
          id: 'guide_tut_read',
          name: '📚 读书笔记',
          desc: '',
          sizeScale: 1.0,
          ringSpeedFactor: 1.0,
          fixedColor: null,
          children: [
            {
              id: 'guide_tut_sapiens',
              name: '人类简史',
              desc: '',
              sizeScale: 1.0,
              ringSpeedFactor: 1.0,
              fixedColor: null,
              children: [],
            },
            {
              id: 'guide_tut_think',
              name: '思考，快与慢',
              desc: '',
              sizeScale: 1.0,
              ringSpeedFactor: 1.0,
              fixedColor: null,
              children: [],
            },
          ],
        },
      ],
    },
  ],
};

// 预设 3D 位置（树状散布，避免节点堆叠在一起）
const PRESET_POSITIONS = {
  'guide_tut_root':  [0, 0.2, 0],
  'guide_tut_life':  [-2.5, -0.6, 1.3],
  'guide_tut_cook':  [-3.2, -1.8, 2.5],
  'guide_tut_sport': [-1.6, -2.0, 2.2],
  'guide_tut_tech':  [0, 0.1, -1.5],
  'guide_tut_js':    [-0.6, -1.4, -2.6],
  'guide_tut_py':    [1.8, -0.9, -2.3],
  'guide_tut_ai':    [0.5, -2.2, -1.5],
  'guide_tut_read':  [2.5, -0.5, 1.5],
  'guide_tut_sapiens': [3.3, -1.8, 2.6],
  'guide_tut_think': [1.8, -1.9, 2.8],
};

// 预设交叉连线：AI ↔ Python
const PRESET_CROSS_EDGES = [
  {
    from: 'guide_tut_ai',
    to: 'guide_tut_py',
    label: '技术关联',
  },
];

/**
 * 检查当前项目是否为空（无实际节点，只有虚拟根）
 * @returns {boolean}
 */
export function isProjectEmpty() {
  const st = window.appState;
  if (!st) return true;
  if (!st.nodeMap || st.nodeMap.size === 0) return true;
  // 如果只有 VIRTUAL_ROOT_ID，也算空
  if (st.nodeMap.size === 1 && st.nodeMap.has(st.VIRTUAL_ROOT_ID)) return true;
  return false;
}

/**
 * 创建教程演示项目
 * 会替换当前空项目的数据并重建场景
 * @returns {Promise<boolean>} 是否成功创建
 */
export async function createTutorialProject() {
  const st = window.appState;
  if (!st) {
    console.warn('[GuideTutorial] appState not available');
    return false;
  }

  // 防止重复创建
  if (_tutorialCreated) return true;

  try {
    // 深拷贝教程树
    const tree = JSON.parse(JSON.stringify(TUTORIAL_TREE));

    // 设置数据结构
    st.methodsTree = tree;
    st.crossEdges = JSON.parse(JSON.stringify(PRESET_CROSS_EDGES));
    st.positions = new Map();
    st.positions2D = new Map();
    st.collapsed2D = new Set();

    // 填充预设 3D 位置
    const THREE = (await import('three'));
    for (const [nodeId, posArr] of Object.entries(PRESET_POSITIONS)) {
      st.positions.set(nodeId, new THREE.Vector3(posArr[0], posArr[1], posArr[2]));
    }

    // 重建 nodeMap
    st.rebuildNodeMapFromTree();

    // 初始化图层
    st.layers = [];
    st.initDefaultLayer();

    // 确保所有节点都在默认图层中
    const layer = st.getCurrentLayer();
    if (layer) {
      for (const [nodeId] of st.nodeMap) {
        if (nodeId !== st.VIRTUAL_ROOT_ID) {
          layer.nodeIds.add(nodeId);
        }
      }
    }

    // 清除选中
    st.clearSelected();
    st.sourceNodeId = null;
    st.targetNodeId = null;
    st.connectionMode = null;

    // 重建 3D 场景
    const { buildSceneFromTree } = await import('../VisualComponents/index.js');
    buildSceneFromTree();

    // 复位相机视角
    st.camera.position.set(0, 4.5, 8);
    st.controls.target.set(0, 0.2, 0);
    st.controls.enableDamping = false;
    st.controls.update();
    st.controls.enableDamping = true;

    // 保存项目
    if (st.saveCurrentProjectData) {
      st.saveCurrentProjectData();
    }

    _tutorialCreated = true;
    console.log('[GuideTutorial] ✅ 教程项目已创建 (' + st.nodeMap.size + ' 个节点)');
    return true;
  } catch (err) {
    console.error('[GuideTutorial] 创建失败:', err);
    return false;
  }
}

/**
 * 重置教程创建标记（重新开始时用）
 */
export function resetTutorialFlag() {
  _tutorialCreated = false;
}
