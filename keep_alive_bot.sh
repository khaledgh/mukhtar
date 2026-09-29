#!/bin/bash
# ==============================================================================
# aaPanel Watchdog Script for Telegram Bot
# Keeps the bot running 24/7. If the server reboots or the bot stops,
# this script restarts it automatically without creating duplicate processes.
# ==============================================================================

PROJECT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$PROJECT_DIR"

# Detect Python interpreter (venv if available, or system python3)
if [ -f "$PROJECT_DIR/venv/bin/python3" ]; then
    PYTHON_BIN="$PROJECT_DIR/venv/bin/python3"
elif [ -f "$PROJECT_DIR/backend/venv/bin/python3" ]; then
    PYTHON_BIN="$PROJECT_DIR/backend/venv/bin/python3"
elif command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="$(command -v python3)"
else
    PYTHON_BIN="python"
fi

SCRIPT_PATH="$PROJECT_DIR/backend/telegram_bot.py"
LOG_FILE="$PROJECT_DIR/telegram_bot.log"

# Check if the bot is already running
if pgrep -f "$SCRIPT_PATH" > /dev/null 2>&1; then
    # Bot is already running smoothly, exit quietly
    exit 0
else
    # Bot is not running: start it with nohup in background
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [WATCHDOG] Telegram Bot was down. Restarting..." >> "$LOG_FILE"
    nohup "$PYTHON_BIN" -u "$SCRIPT_PATH" >> "$LOG_FILE" 2>&1 &
fi
