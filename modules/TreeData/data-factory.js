// ============================================================
//  TreeData/data-factory：树结构构造、节点默认值与项目数据深拷贝（模块2拆分）
// ============================================================
import { appState } from '../module0_AppState.js';

/**
 * 创建一个空的树结构（只包含虚拟根节点）
 * @returns {Object} 虚拟根节点对象
 */
export const createEmptyTree = () => ({ 
  id: appState.VIRTUAL_ROOT_ID, 
  name: "(虚拟根)", 
  desc: "", 
  children: [] 
});

/**
 * 获取空项目数据模板
 * @returns {Object} { methodsTree, crossEdges, positions, nodeRichContents, cameraView }
 */
export const getEmptyProjectData = () => ({
  methodsTree: createEmptyTree(),
  crossEdges: [],
  positions: new Map(),
  positions2D: {},
  nodeRichContents: {},
  layers: [],
  currentLayerId: null,
  treeEdgeLabels: {},
  cameraView: {
    position: { x: 0, y: 4.5, z: 8 },
    target: { x: 0, y: 0.2, z: 0 }
  }
});

/**
 * 确保节点具有必要的默认属性（大小、光环速度、固定颜色）
 * @param {Object} node 节点对象
 */
export function ensureNodeDefaults(node) {
  if (node.sizeScale === undefined) node.sizeScale = 1.0;
  if (node.ringSpeedFactor === undefined) node.ringSpeedFactor = 1.0;
  if (node.fixedColor === undefined) node.fixedColor = null;
  if (node.activeMode === undefined) node.activeMode = null;
}

/**
 * 统计节点的全部后代数量（直接子节点 + 所有间接后代）
 * 迭代遍历避免递归栈；2D 折叠徽标 b 值 / 3D 卫星数量 / 3D 折叠徽标共用
 * @param {Object} node 树节点（含 children 数组）
 * @returns {number} 后代总数
 */
export function countDescendants(node) {
  let count = 0;
  const stack = [...(node.children || [])];
  while (stack.length) {
    const n = stack.pop();
    count++;
    if (n.children) stack.push(...n.children);
  }
  return count;
}

/**
 * 克隆位置 Map（深度克隆每个 Vector3）
 * @param {Map} posMap 原位置 Map
 * @returns {Map} 克隆后的 Map
 */
export function clonePositions(posMap) {
  let np = new Map();
  for (let [k, v] of posMap.entries()) np.set(k, v.clone());
  return np;
}

/**
 * 克隆项目数据（深拷贝）
 * @param {Object} data 项目数据
 * @returns {Object} 克隆后的数据
 */
export function cloneProjectData(data) {
  return {
    methodsTree: JSON.parse(JSON.stringify(data.methodsTree)),
    crossEdges: JSON.parse(JSON.stringify(data.crossEdges)),
    positions: clonePositions(data.positions),
    nodeRichContents: JSON.parse(JSON.stringify(data.nodeRichContents || {})),
    treeEdgeLabels: JSON.parse(JSON.stringify(data.treeEdgeLabels || {})),
    fishboneTrunks: JSON.parse(JSON.stringify(data.fishboneTrunks || []))
  };
}