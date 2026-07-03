' 无命令框启动 AstroKnot
Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")
WshShell.CurrentDirectory = FSO.GetParentFolderName(WScript.ScriptFullName)
WshShell.Run "cmd /c npm start", 0, False
Set WshShell = Nothing
Set FSO = Nothing
