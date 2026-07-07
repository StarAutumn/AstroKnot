// 将 @xterm/* 包的 ESM 产物复制到 lib/xterm/，供渲染进程相对路径 import
// 与 lib/monaco 的托管方式一致（渲染进程无打包器，浏览器 ESM 不支持裸标识符）
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const srcBase = path.join(root, 'node_modules');
const destDir = path.join(root, 'lib', 'xterm');

fs.mkdirSync(destDir, { recursive: true });

// 文件级复制映射：[源相对路径, 目标文件名]
const fileMap = [
  ['@xterm/xterm/lib/xterm.mjs', 'xterm.mjs'],
  ['@xterm/xterm/css/xterm.css', 'xterm.css'],
  ['@xterm/addon-fit/lib/addon-fit.mjs', 'addon-fit.mjs'],
  ['@xterm/addon-web-links/lib/addon-web-links.mjs', 'addon-web-links.mjs'],
];

let copied = 0;
for (const [srcRel, destName] of fileMap) {
  const srcPath = path.join(srcBase, srcRel);
  const destPath = path.join(destDir, destName);
  if (!fs.existsSync(srcPath)) {
    console.warn(`[copy-xterm] 跳过（源不存在）: ${srcRel}`);
    continue;
  }
  fs.copyFileSync(srcPath, destPath);
  console.log(`[copy-xterm] 复制: ${srcRel} -> lib/xterm/${destName}`);
  copied++;
}

console.log(`[copy-xterm] 完成，共复制 ${copied} 个文件`);
