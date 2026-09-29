#!/bin/bash
PROJECT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
SCRIPT_PATH="$PROJECT_DIR/backend/telegram_bot.py"

echo "Stopping Telegram Bot..."
pkill -f "$SCRIPT_PATH"
echo "Telegram Bot stopped."
