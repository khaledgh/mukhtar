@echo off
title Stop Mokhtar Telegram Bot
cd /d "%~dp0"
echo ======================================================
echo          Stopping Telegram Bot Listener...
echo ======================================================
echo.

powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*telegram_bot.py*' -or $_.CommandLine -like '*run_telegram_bot_background.bat*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Host ('Stopped Process ID: ' + $_.ProcessId) }"

echo.
echo [OK] Telegram Bot has been stopped.
timeout /t 4
