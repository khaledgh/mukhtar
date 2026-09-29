@echo off
title Enable Auto-Start for Mokhtar Telegram Bot
cd /d "%~dp0"
echo ==============================================================
echo   Enabling Telegram Bot Auto-Start on Windows Startup
echo ==============================================================
echo.

powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $shortcutPath = [Environment]::GetFolderPath('Startup') + '\MokhtarTelegramBot.lnk'; $s = $ws.CreateShortcut($shortcutPath); $s.TargetPath = 'wscript.exe'; $s.Arguments = '\"%~dp0start_bot_hidden.vbs\"'; $s.WorkingDirectory = '%~dp0'; $s.Save(); Write-Host '[SUCCESS] Shortcut created in Windows Startup:' $shortcutPath"

echo.
echo ==============================================================
echo The bot will now start automatically whenever your PC turns on!
echo To run it immediately in the background now, run: start_bot_hidden.vbs
echo ==============================================================
echo.
pause
