# ============================================================
#  build-with-mirror.ps1 - 使用国内镜像打包
#  解决：Python 缺失时使用预编译的 node-pty
# ============================================================

Write-Host "设置 Electron 镜像..." -ForegroundColor Cyan

# 设置 Electron 镜像（npm 10+ 需要通过环境变量）
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_CUSTOM_DIR = "{{ version }}"
$env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://npmmirror.com/mirrors/electron-builder-binaries/"

# 设置 node-pty 预编译版本下载（如果 GitHub 访问困难）
# node-pty 使用 prebuild-install，支持 ENVM_NODE_PTY_BINARY_HOST_MIRROR
$env:ENVM_NODE_PTY_BINARY_HOST_MIRROR = "https://npmmirror.com/mirrors/node-pty/"

Write-Host "镜像配置完成：" -ForegroundColor Green
Write-Host "  ELECTRON_MIRROR: $env:ELECTRON_MIRROR" -ForegroundColor Gray
Write-Host "  ELECTRON_CUSTOM_DIR: $env:ELECTRON_CUSTOM_DIR" -ForegroundColor Gray

# 删除现有的 node-pty 强制重新下载预编译版本
Write-Host "清理 node-pty 缓存..." -ForegroundColor Cyan
if (Test-Path "node_modules\node-pty") {
    Remove-Item -Recurse -Force "node_modules\node-pty"
    Write-Host "  已删除 node_modules\node-pty" -ForegroundColor Gray
}

# 重新安装 node-pty（会自动下载预编译版本）
Write-Host "重新安装 node-pty..." -ForegroundColor Cyan
npm install node-pty@1.1.0 --save

# 运行打包
Write-Host "开始打包..." -ForegroundColor Cyan
npm run build:win

Write-Host "打包完成！" -ForegroundColor Green