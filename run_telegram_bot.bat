@echo off
title Mokhtar Telegram Bot Listener
cd /d "%~dp0"
echo ======================================================
echo    Starting Meryata & Qadriya Telegram Bot Listener
echo ======================================================
echo.
python -u backend/telegram_bot.py
pause
