import time
import requests
import mysql.connector
import re
import json
import base64

# Load env variables from backend .env
env = {}
try:
    with open(".env", "r", encoding="utf-8") as f:
        for line in f:
            if line.strip() and not line.startswith('#'):
                parts = line.strip().split('=', 1)
                if len(parts) == 2:
                    env[parts[0].strip()] = parts[1].strip()
except Exception as e:
    print(f"Error loading env: {e}")

BOT_TOKEN = env.get("TELEGRAM_BOT_TOKEN")
GEMINI_KEY = env.get("GEMINI_API_KEY")

if not BOT_TOKEN or BOT_TOKEN == "YOUR_TELEGRAM_BOT_TOKEN_HERE":
    print("Please set TELEGRAM_BOT_TOKEN in .env")
    exit(1)

def get_db_conn():
    # Parse DB credentials from env
    return mysql.connector.connect(
        host=env.get("DB_HOST", "127.0.0.1"),
        port=int(env.get("DB_PORT", 3306)),
        user=env.get("DB_USER", "root"),
        password=env.get("DB_PASS", ""),
        database=env.get("DB_NAME", "electoral_db")
    )

def is_whitelisted(chat_id, username):
    try:
        conn = get_db_conn()
        cursor = conn.cursor()
        query = "SELECT 1 FROM telegram_whitelist WHERE identifier = %s OR identifier = %s LIMIT 1"
        cursor.execute(query, (str(chat_id), f"@{username}" if username else "___never___"))
        res = cursor.fetchone()
        cursor.close()
        conn.close()
        return bool(res)
    except Exception as e:
        print(f"Whitelist DB error: {e}")
        return False

def normalize_arabic_search(text):
    if not text:
        return ""
    # Strip diacritics
    diacritics = re.compile(r'[\u064B-\u0652\u0640]')
    text = diacritics.sub('', text)
    # Normalize Alef
    text = re.sub(r'[أإآ]', 'ا', text)
    # Normalize Teh Marbuta
    text = re.sub(r'ة', 'ه', text)
    # Normalize Alef Maksura
    text = re.sub(r'ى', 'ي', text)
    # Collapse space
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def transcribe_audio_gemini(base64_audio):
    if not GEMINI_KEY or GEMINI_KEY == "YOUR_GEMINI_API_KEY_HERE":
        return None
        
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_KEY}"
    
    prompt = "Listen to this audio query for a citizen registry search. Extract only the search terms spoken (names, numbers, village) in Arabic, and discard conversational commands like 'ابحث عن' or 'بدي'. Return the clean query text."

    payload = {
        "contents": [{
            "parts": [
                {
                    "inlineData": {
                        "mimeType": "audio/ogg",
                        "data": base64_audio
                    }
                },
                {"text": prompt}
            ]
        }]
    }
    
    try:
        res = requests.post(url, json=payload, headers={"Content-Type": "application/json"}, timeout=30)
        if res.status_code == 200:
            res_data = res.json()
            text = res_data['candidates'][0]['content']['parts'][0]['text']
            usage = res_data.get('usageMetadata', {})
            prompt_tokens = usage.get('promptTokenCount', 0)
            completion_tokens = usage.get('candidatesTokenCount', 0)
            return {
                "text": text.strip() if text else None,
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens
            }
    except Exception as e:
        print(f"Gemini API error during voice transcription: {e}")
    return None

def log_chatbot_interaction(chat_id, username, message_type, query_text, response_text, prompt_tokens=0, completion_tokens=0):
    try:
        input_rate = 0.000000075
        output_rate = 0.00000030
        estimated_cost = (prompt_tokens * input_rate) + (completion_tokens * output_rate)
        
        conn = get_db_conn()
        cursor = conn.cursor()
        query = """
            INSERT INTO chatbot_logs 
            (chat_id, username, message_type, query_text, response_text, prompt_tokens, completion_tokens, estimated_cost) 
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """
        cursor.execute(query, (
            str(chat_id),
            username,
            message_type,
            query_text,
            response_text,
            int(prompt_tokens),
            int(completion_tokens),
            float(estimated_cost)
        ))
        conn.commit()
        cursor.close()
        conn.close()
    except Exception as e:
        print(f"Failed to log chatbot interaction: {e}")

def query_citizens_smart(query_text):
    try:
        conn = get_db_conn()
        cursor = conn.cursor(dictionary=True)
        
        stop_words = ["ابحث", "عن", "بدي", "معلومات", "المواطن", "مواطن", "سجل", "الاسم", "حساب", "رقم", "اسم"]
        words = query_text.split(' ')
        filtered_words = []
        for w in words:
            w_clean = w.strip()
            if w_clean and w_clean not in stop_words:
                filtered_words.append(w_clean)
                
        if not filtered_words:
            return []
            
        conditions = []
        bindings = []
        
        for idx, word in enumerate(filtered_words):
            word_norm = normalize_arabic_search(word)
            if word_norm:
                conditions.append("(normalized_name LIKE %s OR normalized_father_name LIKE %s OR normalized_mother_name LIKE %s OR registry_no LIKE %s OR village LIKE %s)")
                bindings.extend([f"%{word_norm}%", f"%{word_norm}%", f"%{word_norm}%", f"%{word_norm}%", f"%{word_norm}%"])
                
        if not conditions:
            return []
            
        sql = "SELECT name, father_name, mother_name, registry_no, sect, birth_date, birth_date_raw, gender, village, page_number, row_index FROM voters WHERE " + " AND ".join(conditions) + " ORDER BY village ASC, registry_no ASC LIMIT 15"
        
        cursor.execute(sql, bindings)
        results = cursor.fetchall()
        cursor.close()
        conn.close()
        return results
    except Exception as e:
        print(f"DB Query error: {e}")
        return []

def send_message(chat_id, text):
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    try:
        requests.post(url, json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"})
    except Exception as e:
        print(f"Telegram send error: {e}")

def main():
    print("Starting Telegram Bot (Python) long-polling with smart tokenizer...")
    offset = 0
    while True:
        url = f"https://api.telegram.org/bot{BOT_TOKEN}/getUpdates?offset={offset}&timeout=30"
        try:
            res = requests.get(url, timeout=35)
            if res.status_code != 200:
                time.sleep(2)
                continue
            data = res.json()
        except Exception as e:
            print(f"Polling error: {e}")
            time.sleep(2)
            continue
            
        if not data.get("result"):
            time.sleep(1)
            continue
            
        for update in data["result"]:
            offset = update["update_id"] + 1
            message = update.get("message")
            if not message:
                continue
                
            chat_id = message["chat"]["id"]
            username = message.get("from", {}).get("username")
            
            # Whitelist Check
            if not is_whitelisted(chat_id, username):
                msg = f"⚠️ <b>عذراً، هذا الحساب غير مصرح له بالدخول.</b>\n"
                msg += f"يرجى الطلب من المسؤول إدخال معرفك الخاص بالوصول:\n"
                msg += f"<code>{chat_id}</code>"
                if username:
                    msg += f" أو <code>@{username}</code>"
                send_message(chat_id, msg)
                continue
                
            query_text = None
            is_voice = False
            prompt_tokens = 0
            completion_tokens = 0
            
            # Voice check
            if message.get("voice"):
                is_voice = True
                file_id = message["voice"]["file_id"]
                send_message(chat_id, "🎙️ جاري تحميل المقطع الصوتي وتحليله بالذكاء الاصطناعي...")
                try:
                    file_info = requests.get(f"https://api.telegram.org/bot{BOT_TOKEN}/getFile?file_id={file_id}").json()
                    file_path = file_info["result"]["file_path"]
                    audio_res = requests.get(f"https://api.telegram.org/file/bot{BOT_TOKEN}/{file_path}")
                    audio_b64 = base64.encodebytes(audio_res.content).decode("utf-8")
                    
                    gemini_res = transcribe_audio_gemini(audio_b64)
                    if gemini_res and gemini_res.get("text"):
                        query_text = gemini_res["text"]
                        prompt_tokens = gemini_res.get("prompt_tokens", 0)
                        completion_tokens = gemini_res.get("completion_tokens", 0)
                        send_message(chat_id, f"📝 <b>النص المستخرج:</b>\n<i>\"{query_text}\"</i>")
                    else:
                        reply = "⚠️ فشل استخراج النص بالذكاء الاصطناعي."
                        send_message(chat_id, reply)
                        log_chatbot_interaction(chat_id, username, 'voice', '[Voice Note (transcription failed)]', reply, 0, 0)
                except Exception as ex:
                    print(f"Voice download error: {ex}")
                    reply = "⚠️ فشل تحميل الملف الصوتي."
                    send_message(chat_id, reply)
                    log_chatbot_interaction(chat_id, username, 'voice', '[Voice Note (download failed)]', reply, 0, 0)
            
            # Text check
            elif message.get("text"):
                text = message["text"].strip()
                if text == "/start":
                    reply = "👋 أهلاً بك في <b>نظام استعلام المواطنين</b>.\nيمكنك إرسال رسالة نصية أو تسجيل صوتي باسم المواطن المستعلم عنه للحصول على تفاصيله بالكامل."
                    send_message(chat_id, reply)
                    log_chatbot_interaction(chat_id, username, 'text', '/start', reply, 0, 0)
                    continue
                query_text = text
                
            # Process query
            if query_text:
                msg_type = 'voice' if is_voice else 'text'
                if not is_voice:
                    send_message(chat_id, "🔄 جاري البحث في السجلات...")
                
                results = query_citizens_smart(query_text)
                if results:
                    reply = "🔍 <b>نتائج البحث المكتشفة:</b>\n\n"
                    for v in results:
                        reply += f"👤 <b>{v['name']}</b>\n"
                        reply += f"▪️ <b>اسم الأب:</b> {v['father_name']}\n"
                        reply += f"▪️ <b>اسم الأم:</b> {v['mother_name']}\n"
                        reply += f"▪️ <b>رقم القيد / البلدة:</b> {v['registry_no']} / {v['village']}\n"
                        reply += f"▪️ <b>المذهب / الولادة:</b> {v['sect']} / {v['birth_date'] if v['birth_date'] else v['birth_date_raw']}\n"
                        reply += f"📌 ص <b>{v['page_number']}</b> / س <b>{v['row_index']}</b>\n"
                        reply += "──────────────────\n"
                    send_message(chat_id, reply)
                    log_chatbot_interaction(chat_id, username, msg_type, query_text, reply, prompt_tokens, completion_tokens)
                else:
                    reply = "❌ لم يتم العثور على أي مواطن يطابق معايير البحث."
                    send_message(chat_id, reply)
                    log_chatbot_interaction(chat_id, username, msg_type, query_text, reply, prompt_tokens, completion_tokens)

if __name__ == "__main__":
    main()
