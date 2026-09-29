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

# 2. Detect Python binary
if [ -f "$PROJECT_DIR/venv/bin/python3" ]; then
    PYTHON_BIN="$PROJECT_DIR/venv/bin/python3"
elif [ -f "$PROJECT_DIR/backend/venv/bin/python3" ]; then
    PYTHON_BIN="$PROJECT_DIR/backend/venv/bin/python3"
elif command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="$(command -v python3)"
else
    PYTHON_BIN="python"
fi

# 3. Check and install Python dependencies
echo "[1/4] Checking and upgrading Python libraries for Python 3.12+..."
# Upgrading to mysql-connector-python>=8.2.0 is required on Python 3.12+ to prevent ssl.wrap_socket removal error
"$PYTHON_BIN" -m pip install --upgrade --break-system-packages "mysql-connector-python>=8.2.0" requests 2>/dev/null || \
"$PYTHON_BIN" -m pip install --upgrade "mysql-connector-python>=8.2.0" requests 2>/dev/null || \
pip3 install --upgrade --break-system-packages "mysql-connector-python>=8.2.0" requests 2>/dev/null || \
pip install --upgrade "mysql-connector-python>=8.2.0" requests 2>/dev/null || true

# Verify import
if "$PYTHON_BIN" -c "import mysql.connector, requests" 2>/dev/null; then
    echo "  -> Python libraries verified [OK]."
else
    echo "  [WARNING] Installing fallback dependencies..."
    apt-get install -y python3-pip python3-mysql.connector python3-requests 2>/dev/null || true
fi

# 4. Check Database Connection from Python
echo "[2/4] Verifying MySQL Database Connection from Python..."
"$PYTHON_BIN" -c "
import sys, os
sys.path.insert(0, '$PROJECT_DIR')
sys.path.insert(0, '$PROJECT_DIR/backend')
try:
    import telegram_bot
    conn = telegram_bot.get_db_conn()
    cur = conn.cursor()
    cur.execute('SELECT COUNT(*) FROM telegram_whitelist')
    cnt = cur.fetchone()[0]
    print(f'  -> [SUCCESS] Connected to database! Found {cnt} whitelisted entries.')
    cur.close()
    conn.close()
except Exception as e:
    print(f'  -> [WARNING] Database connection failed: {e}')
    print('     Please verify DB_HOST, DB_USER, DB_PASS, DB_NAME in backend/.env')
"

# 5. Add Watchdog to Crontab (Runs every 1 minute automatically)
echo "[3/4] Setting up Cron Watchdog (keeps bot alive 24/7)..."
CRON_JOB="* * * * * bash \"$PROJECT_DIR/keep_alive_bot.sh\" >/dev/null 2>&1"
(crontab -l 2>/dev/null | grep -F -v "keep_alive_bot.sh" ; echo "$CRON_JOB") | crontab -

# 6. Stop existing bot process if any, and trigger keep_alive_bot.sh
echo "[4/4] Restarting Telegram Bot with new updates..."
pkill -f "$PROJECT_DIR/backend/telegram_bot.py" 2>/dev/null || true
sleep 1
bash "$PROJECT_DIR/keep_alive_bot.sh"

sleep 2

# 6. Check if process is running
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
