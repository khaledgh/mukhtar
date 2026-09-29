@echo off
title Mokhtar Telegram Bot Listener
cd /d "%~dp0"
echo ======================================================
echo    Starting Meryata & Qadriya Telegram Bot Listener
echo    (Auto-Restart is ENABLED - Keeps running anytime)
echo ======================================================
echo.

:loop
python -u backend/telegram_bot.py
echo.
echo [%date% %time%] Bot process stopped or crashed! Restarting in 3 seconds...
timeout /t 3 /nobreak >nul
goto loop
