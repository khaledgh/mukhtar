#!/bin/bash
PROJECT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

echo "Stopping bot..."
pkill -f "$PROJECT_DIR/backend/telegram_bot.py" 2>/dev/null || true

echo "Removing Cron watchdog..."
(crontab -l 2>/dev/null | grep -F -v "keep_alive_bot.sh") | crontab -

echo "[SUCCESS] Telegram Bot stopped and Cron watchdog removed."
