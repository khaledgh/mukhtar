import time
import requests
import mysql.connector
import re
import json
import base64
import html
import os
import sys

# Ensure UTF-8 standard output
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

# Load env variables from backend .env or current directory
env = {}
env_files = [".env", os.path.join(os.path.dirname(__file__), ".env")]
for env_file in env_files:
    if os.path.exists(env_file):
        try:
            with open(env_file, "r", encoding="utf-8") as f:
                for line in f:
                    line_s = line.strip()
                    if line_s and not line_s.startswith('#'):
                        parts = line_s.split('=', 1)
                        if len(parts) == 2:
                            env[parts[0].strip()] = parts[1].strip().strip('"\'')
            break
        except Exception as e:
            print(f"Error loading {env_file}: {e}")

BOT_TOKEN = env.get("TELEGRAM_BOT_TOKEN")
GEMINI_KEY = env.get("GEMINI_API_KEY")

if not BOT_TOKEN or BOT_TOKEN == "YOUR_TELEGRAM_BOT_TOKEN_HERE":
    print("Please set TELEGRAM_BOT_TOKEN in .env")
    sys.exit(1)

def get_db_conn():
    return mysql.connector.connect(
        host=env.get("DB_HOST", "127.0.0.1"),
        port=int(env.get("DB_PORT", 3306)),
        user=env.get("DB_USER", "root"),
        password=env.get("DB_PASS", ""),
        database=env.get("DB_NAME", "electoral_db"),
        charset="utf8mb4"
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
    # Strip diacritics / harakat
    diacritics = re.compile(r'[\u064B-\u0652\u0640]')
    text = diacritics.sub('', text)
    # Fix double-alef in Allah
    text = re.sub(r'ا+لله', 'الله', text)
    # Normalize Alef forms (أ, إ, آ) -> ا
    text = re.sub(r'[أإآ]', 'ا', text)
    # Normalize Teh Marbuta ة -> ه
    text = re.sub(r'ة', 'ه', text)
    # Normalize Alef Maksura ى -> ي
    text = re.sub(r'ى', 'ي', text)
    # Collapse multiple spaces, tabs, newlines to a single space
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def extract_compound_variants(token):
    """
    Expands compound name variations:
    e.g. 'عبدالله' <-> 'عبد الله'
         'عبدالرحمن' <-> 'عبد الرحمن'
         'ابوبكر' <-> 'ابو بكر'
    """
    norm = normalize_arabic_search(token)
    if not norm:
        return []
    variants = {norm}
    
    # Check if starts with 'عبد' without space (e.g. عبدالله, عبدالقادر, عبدالرحمن)
    if norm.startswith('عبد') and len(norm) > 4:
        rest = norm[3:].strip()
        variants.add(f"عبد {rest}")
        variants.add(rest)
    # Check if starts with 'ابو' without space (e.g. ابوبكر)
    elif norm.startswith('ابو') and len(norm) > 4:
        rest = norm[3:].strip()
        variants.add(f"ابو {rest}")
        variants.add(rest)
    # Check if starts with 'عبد ' with space (e.g. عبد الله, عبد القادر)
    elif norm.startswith('عبد ') and len(norm) > 5:
        rest = norm[4:].strip()
        variants.add(f"عبد{rest}")
        variants.add(rest)
    # Check if starts with 'ابو ' with space
    elif norm.startswith('ابو ') and len(norm) > 5:
        rest = norm[4:].strip()
        variants.add(f"ابو{rest}")
        variants.add(rest)
        
    return list(variants)

def parse_query_with_gemini(query_text):
    """
    Uses Gemini AI to extract exact citizen search terms, names, and variations.
    """
    if not GEMINI_KEY or GEMINI_KEY == "YOUR_GEMINI_API_KEY_HERE":
        return None, 0, 0
        
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_KEY}"
    prompt = """
    أنت مساعد ذكي لاستخراج وتحليل أسماء الناخبين والمواطنين في السجلات الرسمية اللبنانية (مثل بلدة مرياطة، القادرية).
    مهمتك تحليل رسالة البحث واستخراج المعلومات في صورة كائن JSON دقيق:
    - first_name: الاسم الأول للشخص المستعلم عنه (بدون اسم الأب أو العائلة)، إن وجد
    - father_name: اسم الأب، إن وجد
    - mother_name: اسم الأم، إن وجد
    - family_name: اسم العائلة / الشهرة، إن وجد
    - registry_no: رقم السجل أو القيد (أرقام فقط)، إن وجد
    - village: اسم البلدة، إن وجد (مثل القادرية، مرياطة)
    - search_tokens: قائمة بكلمات ومصطلحات البحث الأساسية، مع مراعاة فصل ودمج الأسماء المركبة (مثل 'عبدالله' و 'عبد الله'، 'عبدالقادر' و 'عبد القادر') وإزالة كلمات التخاطب مثل 'ابحث عن' أو 'بدي رقم سجل'.
    أرجع فقط كود JSON صالح بدون أي markdown أو مقدمات.
    """
    
    payload = {
        "contents": [{"parts": [{"text": query_text}]}],
        "systemInstruction": {"parts": [{"text": prompt}]},
        "generationConfig": {"responseMimeType": "application/json"}
    }
    
    try:
        res = requests.post(url, json=payload, headers={"Content-Type": "application/json"}, timeout=8)
        if res.status_code == 200:
            res_data = res.json()
            txt = res_data['candidates'][0]['content']['parts'][0]['text']
            usage = res_data.get('usageMetadata', {})
            prompt_tokens = usage.get('promptTokenCount', 0)
            completion_tokens = usage.get('candidatesTokenCount', 0)
            return json.loads(txt), prompt_tokens, completion_tokens
    except Exception as e:
        print(f"Gemini API query parsing error: {e}")
    return None, 0, 0

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
        print(f"Gemini API voice transcription error: {e}")
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
    """
    Smart search combining AI entity extraction with compound Arabic name expansion.
    """
    total_prompt_tokens = 0
    total_comp_tokens = 0
    
    # 1. Ask Gemini to parse the query components
    ai_data, p_tokens, c_tokens = parse_query_with_gemini(query_text)
    total_prompt_tokens += p_tokens
    total_comp_tokens += c_tokens
    
    try:
        conn = get_db_conn()
        cursor = conn.cursor(dictionary=True)
        
        # Strategy A: Structured field search if AI identified specific name/father/family fields
        if ai_data and (ai_data.get('first_name') or ai_data.get('father_name') or ai_data.get('family_name')):
            conds = []
            binds = []
            
            if ai_data.get('first_name'):
                fn = normalize_arabic_search(ai_data['first_name'])
                vars_fn = extract_compound_variants(fn)
                fn_sub = " OR ".join(["normalized_name LIKE %s" for _ in vars_fn])
                conds.append(f"({fn_sub})")
                binds.extend([f"%{v}%" for v in vars_fn])
                
            if ai_data.get('father_name'):
                fat = normalize_arabic_search(ai_data['father_name'])
                vars_fat = extract_compound_variants(fat)
                fat_sub = " OR ".join(["normalized_father_name LIKE %s OR normalized_name LIKE %s" for _ in vars_fat])
                conds.append(f"({fat_sub})")
                for v in vars_fat:
                    binds.extend([f"%{v}%", f"%{v}%"])
                    
            if ai_data.get('family_name'):
                fam = normalize_arabic_search(ai_data['family_name'])
                vars_fam = extract_compound_variants(fam)
                fam_sub = " OR ".join(["normalized_name LIKE %s OR normalized_mother_name LIKE %s" for _ in vars_fam])
                conds.append(f"({fam_sub})")
                for v in vars_fam:
                    binds.extend([f"%{v}%", f"%{v}%"])
                    
            if ai_data.get('registry_no'):
                reg = str(ai_data['registry_no']).strip()
                if reg:
                    conds.append("registry_no LIKE %s")
                    binds.append(f"%{reg}%")
                    
            if ai_data.get('village'):
                vil = normalize_arabic_search(ai_data['village'])
                if vil:
                    conds.append("village LIKE %s")
                    binds.append(f"%{vil}%")
                    
            if conds:
                sql = ("SELECT name, father_name, mother_name, registry_no, sect, birth_date, birth_date_raw, gender, village, page_number, row_index "
                       "FROM voters WHERE " + " AND ".join(conds) + " ORDER BY village ASC, registry_no ASC LIMIT 15")
                cursor.execute(sql, binds)
                results = cursor.fetchall()
                if results:
                    cursor.close()
                    conn.close()
                    return results, total_prompt_tokens, total_comp_tokens
                    
        # Strategy B: Multi-token search with compound name expansion
        tokens_to_search = []
        if ai_data and ai_data.get('search_tokens'):
            for t in ai_data['search_tokens']:
                norm_t = normalize_arabic_search(t)
                if norm_t and len(norm_t) > 1 and norm_t not in ["او", "أو", "في", "من", "عن", "بدي", "ابحث"]:
                    tokens_to_search.append(norm_t)
                    
        if not tokens_to_search:
            stop_words = {"ابحث", "عن", "بدي", "معلومات", "المواطن", "مواطن", "سجل", "الاسم", "حساب", "رقم", "اسم", "او", "أو", "في", "من"}
            raw_words = re.split(r'\s+', query_text.strip())
            i = 0
            while i < len(raw_words):
                w = normalize_arabic_search(raw_words[i])
                if not w or w in stop_words:
                    i += 1
                    continue
                if w == 'عبد' and i + 1 < len(raw_words):
                    next_w = normalize_arabic_search(raw_words[i+1])
                    tokens_to_search.append(f"عبد {next_w}")
                    i += 2
                    continue
                tokens_to_search.append(w)
                i += 1
                
        conditions = []
        bindings = []
        for token in tokens_to_search:
            variants = extract_compound_variants(token)
            group_conds = []
            for var in variants:
                group_conds.append("(normalized_name LIKE %s OR normalized_father_name LIKE %s OR normalized_mother_name LIKE %s OR registry_no LIKE %s OR village LIKE %s)")
                bindings.extend([f"%{var}%"] * 5)
            conditions.append("(" + " OR ".join(group_conds) + ")")
            
        if conditions:
            sql = ("SELECT name, father_name, mother_name, registry_no, sect, birth_date, birth_date_raw, gender, village, page_number, row_index "
                   "FROM voters WHERE " + " AND ".join(conditions) + " ORDER BY village ASC, registry_no ASC LIMIT 15")
            cursor.execute(sql, bindings)
            results = cursor.fetchall()
            cursor.close()
            conn.close()
            return results, total_prompt_tokens, total_comp_tokens
            
        cursor.close()
        conn.close()
        return [], total_prompt_tokens, total_comp_tokens
    except Exception as e:
        print(f"DB Query error: {e}")
        return [], total_prompt_tokens, total_comp_tokens

def send_message(chat_id, text):
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    try:
        res = requests.post(url, json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"}, timeout=15)
        if res.status_code != 200:
            print(f"Telegram send error ({res.status_code}): {res.text}")
    except Exception as e:
        print(f"Telegram send exception: {e}")

def main():
    print("=" * 60)
    print("Starting Telegram Bot with AI-Powered Name Intelligence...")
    print("=" * 60)
    
    # 1. Remove any dangling webhook to allow long-polling without 409 Conflict
    try:
        del_wh = requests.get(f"https://api.telegram.org/bot{BOT_TOKEN}/deleteWebhook", timeout=10).json()
        print(f"Webhook check: {del_wh.get('description', 'Checked')}")
    except Exception as e:
        print(f"Warning: Could not clear webhook: {e}")
        
    # 2. Verify Bot Identity
    try:
        me_res = requests.get(f"https://api.telegram.org/bot{BOT_TOKEN}/getMe", timeout=10).json()
        if me_res.get("ok"):
            bot_info = me_res["result"]
            print(f"Bot connected successfully: @{bot_info.get('username')} ({bot_info.get('first_name')})")
        else:
            print(f"Warning: Telegram getMe returned: {me_res}")
    except Exception as e:
        print(f"Error checking bot identity: {e}")

    print("Listening for incoming Telegram queries (Text & Voice)...")
    offset = 0
    while True:
        url = f"https://api.telegram.org/bot{BOT_TOKEN}/getUpdates?offset={offset}&timeout=25"
        try:
            res = requests.get(url, timeout=35)
            if res.status_code != 200:
                print(f"Polling HTTP {res.status_code}: {res.text}")
                time.sleep(3)
                continue
            data = res.json()
        except Exception as e:
            print(f"Polling network exception: {e}")
            time.sleep(3)
            continue
            
        if not data.get("result"):
            continue
            
        for update in data["result"]:
            offset = update["update_id"] + 1
            message = update.get("message")
            if not message:
                continue
                
            chat_id = message["chat"]["id"]
            username = message.get("from", {}).get("username")
            first_name = message.get("from", {}).get("first_name", "مستخدم")
            
            # Whitelist Check
            if not is_whitelisted(chat_id, username):
                msg = f"⚠️ <b>عذراً يا {html.escape(first_name)}، هذا الحساب غير مصرح له بالدخول.</b>\n\n"
                msg += f"يرجى تزويد المسؤول بمعرفك الخاص بالوصول لتفعيله:\n"
                msg += f"<code>{chat_id}</code>"
                if username:
                    msg += f" أو <code>@{html.escape(username)}</code>"
                send_message(chat_id, msg)
                continue
                
            query_text = None
            is_voice = False
            prompt_tokens = 0
            completion_tokens = 0
            
            # Voice Message
            if message.get("voice"):
                is_voice = True
                file_id = message["voice"]["file_id"]
                send_message(chat_id, "🎙️ <i>جاري الاستماع للمقطع الصوتي وتحليله بالذكاء الاصطناعي...</i>")
                try:
                    file_info = requests.get(f"https://api.telegram.org/bot{BOT_TOKEN}/getFile?file_id={file_id}", timeout=10).json()
                    file_path = file_info["result"]["file_path"]
                    audio_res = requests.get(f"https://api.telegram.org/file/bot{BOT_TOKEN}/{file_path}", timeout=20)
                    audio_b64 = base64.encodebytes(audio_res.content).decode("utf-8")
                    
                    gemini_res = transcribe_audio_gemini(audio_b64)
                    if gemini_res and gemini_res.get("text"):
                        query_text = gemini_res["text"]
                        prompt_tokens = gemini_res.get("prompt_tokens", 0)
                        completion_tokens = gemini_res.get("completion_tokens", 0)
                        send_message(chat_id, f"📝 <b>النص المستخرج من الصوت:</b>\n<i>\"{html.escape(query_text)}\"</i>")
                    else:
                        reply = "⚠️ تعذر استخراج النص من التسجيل الصوتي بدقة. يرجى إعادة المحاولة أو إرسال الاسم نصياً."
                        send_message(chat_id, reply)
                        log_chatbot_interaction(chat_id, username, 'voice', '[Voice Note (failed)]', reply, 0, 0)
                except Exception as ex:
                    print(f"Voice download error: {ex}")
                    reply = "⚠️ حدث خطأ أثناء تحميل الملف الصوتي."
                    send_message(chat_id, reply)
                    log_chatbot_interaction(chat_id, username, 'voice', '[Voice Note (download error)]', reply, 0, 0)
            
            # Text Message
            elif message.get("text"):
                text = message["text"].strip()
                if text in ["/start", "/help"]:
                    reply = (
                        "👋 أهلاً بك في <b>نظام استعلام سجلات الناخبين الذكي</b>.\n\n"
                        "✨ <b>كيفية الاستخدام:</b>\n"
                        "• أرسل اسم المواطن كاملاً (مثل: <code>حليمة عبدالقادر حمزة</code>)\n"
                        "• يدعم النظام الأسماء المركبة بمسافات أو بدون (مثل: <code>عبد الله</code> أو <code>عبدالله</code>)\n"
                        "• يمكنك البحث برقم السجل أو اسم البلدة\n"
                        "• يمكنك أيضاً إرسال <b>تسجيل صوتي 🎙️</b> بالاسم مباشرةً."
                    )
                    send_message(chat_id, reply)
                    log_chatbot_interaction(chat_id, username, 'text', text, reply, 0, 0)
                    continue
                query_text = text
                
            # Process query with AI and database
            if query_text:
                msg_type = 'voice' if is_voice else 'text'
                if not is_voice:
                    send_message(chat_id, "🔄 <i>جاري البحث في السجلات وتحليل الاسم بالذكاء الاصطناعي...</i>")
                
                results, p_tok, c_tok = query_citizens_smart(query_text)
                prompt_tokens += p_tok
                completion_tokens += c_tok
                
                if results:
                    reply = f"🔍 <b>تم العثور على ({len(results)}) نتيجة مطابقة:</b>\n\n"
                    for v in results:
                        bdate = v['birth_date'] if v['birth_date'] else v['birth_date_raw']
                        reply += f"👤 <b>{html.escape(v['name'])}</b>\n"
                        reply += f"▪️ <b>اسم الأب:</b> {html.escape(v['father_name'])}\n"
                        reply += f"▪️ <b>اسم الأم:</b> {html.escape(v['mother_name'])}\n"
                        reply += f"▪️ <b>رقم القيد / البلدة:</b> {html.escape(str(v['registry_no']))} / {html.escape(v['village'])}\n"
                        reply += f"▪️ <b>المذهب / تاريخ الولادة:</b> {html.escape(v['sect'])} / {html.escape(str(bdate))}\n"
                        reply += f"📌 <b>السجل:</b> صفحة <b>{v['page_number']}</b> / سطر <b>{v['row_index']}</b>\n"
                        reply += "──────────────────\n"
                    send_message(chat_id, reply)
                    log_chatbot_interaction(chat_id, username, msg_type, query_text, reply, prompt_tokens, completion_tokens)
                else:
                    reply = (
                        "❌ <b>لم يتم العثور على أي مواطن يطابق معايير البحث.</b>\n"
                        "💡 <i>نصيحة: تأكد من كتابة الاسم بدقة، أو جرب البحث بالاسم واسم الأب فقط أو رقم القيد.</i>"
                    )
                    send_message(chat_id, reply)
                    log_chatbot_interaction(chat_id, username, msg_type, query_text, reply, prompt_tokens, completion_tokens)

if __name__ == "__main__":
    main()
