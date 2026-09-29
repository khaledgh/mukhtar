@echo off
cd /d "%~dp0"

:loop
echo ====================================================== >> telegram_bot.log
echo [%date% %time%] Telegram Bot started >> telegram_bot.log
echo ====================================================== >> telegram_bot.log
python -u backend/telegram_bot.py >> telegram_bot.log 2>&1
echo [%date% %time%] Bot stopped unexpectedly. Restarting in 3 seconds... >> telegram_bot.log
timeout /t 3 /nobreak >nul
goto loop
