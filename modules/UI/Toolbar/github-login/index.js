// ============================================================
//  UI/Toolbar/github-login/index.js — GitHub 登录与云端同步面板（主入口）
// ============================================================
//  （原 github-login.js 拆分为文件夹版本；本文件为主入口，对外导出不变）
//  - share.js     共享层：模块级状态（_overlay/_currentToken/_selectedRepo/_currentRepos）
//                 + setter + GITHUB_ICON_SVG + 格式化/隐藏仓库工具
//  - auth.js      登录态：initGitHubLogin（对外 API）、Token 登录/快速登录/清除、
//                 退出、新建仓库、面板创建 createPanel 与事件绑定 bindPanelEvents
//  - panel.js     面板流程：打开同步面板、登录区/仓库区切换、仓库选择与信息刷新、
//                 仓库列表渲染与右键菜单
//  - cloud.js     云端文件：分类文件树渲染、条目右键菜单、云端删除、条目下载
//  - transfer.js  全量传输：上传数据到云端 / 从云端恢复
//  - dialogs.js   二级弹窗：删除仓库确认、隐藏仓库管理、内部确认弹窗
//  - index.js     本文件：re-export 对外唯一 API initGitHubLogin
// ============================================================
export { initGitHubLogin } from './auth.js';
