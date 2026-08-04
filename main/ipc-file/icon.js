// ============================================================
//  main/ipc-file/icon.js — 图标提取 IPC
// ============================================================
const { ipcMain, app } = require('electron');
const path = require('path');
const fs = require('fs');

function bindIconIPC(mainWindow) {

  // ── 提取 exe 图标 ──
  ipcMain.handle('extract-icon', async (event, filePath) => {
    try {
      if (!filePath || !fs.existsSync(filePath)) {
        console.warn('[extract-icon] 文件不存在:', filePath);
        return null;
      }

      let targetPath = filePath;
      const fileExt = filePath.split('.').pop().toLowerCase();
      if (fileExt === 'lnk') {
        try {
          const tmpLnk = path.join(app.getPath('temp'), 'astroknot-resolve-lnk.ps1');
          fs.writeFileSync(tmpLnk, `$sh = New-Object -ComObject WScript.Shell; $lnk = $sh.CreateShortcut($args[0]); Write-Output $lnk.TargetPath`);
          const resolveResult = require('child_process').execSync(
            `powershell -NoProfile -NonInteractive -File "${tmpLnk}" "${targetPath}"`,
            { encoding: 'utf8', timeout: 5000 }
          ).trim();
          if (resolveResult && fs.existsSync(resolveResult)) {
            targetPath = resolveResult;
          }
        } catch (e) {
          console.warn('[extract-icon] 解析 .lnk 失败:', e.message);
        }
      }

      const tmpScript = path.join(app.getPath('temp'), 'astroknot-extract-icon.ps1');
      fs.writeFileSync(tmpScript, [
        'Add-Type -AssemblyName System.Drawing',
        '$icon = [System.Drawing.Icon]::ExtractAssociatedIcon($args[0])',
        'if ($icon -ne $null) {',
        '  $bmp = New-Object System.Drawing.Bitmap(256, 256)',
        '  $g = [System.Drawing.Graphics]::FromImage($bmp)',
        '  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic',
        '  $rect = New-Object System.Drawing.Rectangle(0, 0, 256, 256)',
        '  $g.DrawIcon($icon, $rect)',
        '  $g.Dispose()',
        '  $ms = New-Object System.IO.MemoryStream',
        '  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)',
        '  $bmp.Dispose()',
        '  $icon.Dispose()',
        '  [Convert]::ToBase64String($ms.ToArray())',
        '} else { Write-Output "" }',
      ].join('\r\n'));

      const base64 = require('child_process').execSync(
        `powershell -NoProfile -NonInteractive -File "${tmpScript}" "${targetPath}"`,
        { encoding: 'utf8', timeout: 10000 }
      ).trim();

      if (base64 && base64.length > 100) {
        const dataUri = 'data:image/png;base64,' + base64;
        console.log('[extract-icon] 成功:', filePath, '→', targetPath, '大小:', dataUri.length);
        return dataUri;
      }

      console.warn('[extract-icon] PowerShell 返回空，回退 Electron API:', filePath);
      const icon = await app.getFileIcon(filePath, { size: 'large' });
      const dataUri = icon.toDataURL();
      return dataUri.length > 100 ? dataUri : null;
    } catch (err) {
      console.error('[extract-icon] 错误:', err.message);
      try {
        const icon = await app.getFileIcon(filePath, { size: 'large' });
        const dataUri = icon.toDataURL();
        return dataUri.length > 100 ? dataUri : null;
      } catch (e2) {
        return null;
      }
    }
  });
}

module.exports = { bindIconIPC };