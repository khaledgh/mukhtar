#!/bin/bash
# ==============================================================================
# 1-Click 24/7 Setup for Mokhtar Telegram Bot on Linux / aaPanel
# ==============================================================================

set -e

PROJECT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$PROJECT_DIR"

echo "======================================================"
echo " Starting 1-Click 24/7 Telegram Bot Setup on aaPanel"
echo " Directory: $PROJECT_DIR"
echo "======================================================"

# 1. Set execution permissions on scripts
chmod +x "$PROJECT_DIR/keep_alive_bot.sh" 2>/dev/null || true
chmod +x "$PROJECT_DIR/stop_bot_linux.sh" 2>/dev/null || true

# 2. Detect Python binary & install dependencies if missing
if [ -f "$PROJECT_DIR/venv/bin/python3" ]; then
    PYTHON_BIN="$PROJECT_DIR/venv/bin/python3"
    PIP_BIN="$PROJECT_DIR/venv/bin/pip"
elif [ -f "$PROJECT_DIR/backend/venv/bin/python3" ]; then
    PYTHON_BIN="$PROJECT_DIR/backend/venv/bin/python3"
    PIP_BIN="$PROJECT_DIR/backend/venv/bin/pip"
elif command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="$(command -v python3)"
    PIP_BIN="pip3"
else
    PYTHON_BIN="python"
    PIP_BIN="pip"
fi

echo "[1/4] Checking Python libraries..."
"$PIP_BIN" install --quiet requests mysql-connector-python 2>/dev/null || true

# 3. Add Watchdog to Crontab (Runs every 1 minute automatically)
echo "[2/4] Setting up Cron Watchdog (keeps bot alive 24/7)..."
CRON_JOB="* * * * * bash \"$PROJECT_DIR/keep_alive_bot.sh\" >/dev/null 2>&1"
(crontab -l 2>/dev/null | grep -F -v "keep_alive_bot.sh" ; echo "$CRON_JOB") | crontab -

# 4. Trigger keep_alive_bot.sh to launch the bot immediately
echo "[3/4] Launching Telegram Bot..."
bash "$PROJECT_DIR/keep_alive_bot.sh"

sleep 2

# 5. Check if process is running
echo "[4/4] Verifying bot status..."
if pgrep -f "$PROJECT_DIR/backend/telegram_bot.py" > /dev/null; then
    echo ""
    echo "======================================================"
    echo " [SUCCESS] Bot is now RUNNING 24/7!"
    echo " Watchdog Cron is ACTIVE (checks every 1 minute)."
    echo " If server reboots or crashes, it restarts automatically."
    echo " Log file: $PROJECT_DIR/telegram_bot.log"
    echo "======================================================"
else
    echo ""
    echo "[!] Bot attempted to start. Check log for details:"
    tail -n 20 "$PROJECT_DIR/telegram_bot.log" 2>/dev/null || true
fi
