@echo off
title Disable Auto-Start for Mokhtar Telegram Bot
cd /d "%~dp0"
echo ==============================================================
echo   Disabling Telegram Bot Auto-Start on Windows Startup
echo ==============================================================
echo.

powershell -NoProfile -Command "$shortcutPath = [Environment]::GetFolderPath('Startup') + '\MokhtarTelegramBot.lnk'; if (Test-Path $shortcutPath) { Remove-Item $shortcutPath -Force; Write-Host '[SUCCESS] Auto-start shortcut removed successfully.' } else { Write-Host '[INFO] Auto-start was not enabled (shortcut does not exist).' }"

echo.
pause
