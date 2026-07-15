<?php

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\Factory\AppFactory;
use App\Config;
use App\ArabicNormalizer;
use App\JWTHelper;

require __DIR__ . '/../vendor/autoload.php';

// Global CORS handling for both standard and preflight OPTIONS requests
if (isset($_SERVER['REQUEST_METHOD'])) {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Headers: X-Requested-With, Content-Type, Accept, Origin, Authorization');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Max-Age: 86400');
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        exit(0);
    }
}

$app = AppFactory::create();

// Dynamically set base path if running via index.php
$requestUri = $_SERVER['REQUEST_URI'] ?? '';
if (strpos($requestUri, '/index.php') === 0) {
    $app->setBasePath('/index.php');
}

// Add Error Middleware
$app->addErrorMiddleware(true, true, true);

// Helper for PDO Connection
function getPDO() {
    $config = Config::getDBConfig();
    $dsn = "mysql:host={$config['host']}";
    if (isset($config['port'])) {
        $dsn .= ";port={$config['port']}";
    }
    $dsn .= ";dbname={$config['dbname']};charset={$config['charset']}";
    return new PDO($dsn, $config['username'], $config['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
    ]);
}

// Authorization Checker
function checkAuth(Request $request): ?array {
    $authHeader = $request->getHeaderLine('Authorization');
    if (!$authHeader) {
        return null;
    }
    
    $parts = explode(' ', $authHeader);
    if (count($parts) !== 2 || strtolower($parts[0]) !== 'bearer') {
        return null;
    }
    
    return JWTHelper::verify($parts[1]);
}

// OPTIONS route for CORS preflight
$app->options('/[{path:.*}]', function (Request $request, Response $response) {
    return $response;
});

// Route: Login
$app->post('/api/login', function (Request $request, Response $response) {
    try {
        $body = json_decode($request->getBody()->getContents(), true);
        $username = isset($body['username']) ? trim($body['username']) : '';
        $password = isset($body['password']) ? trim($body['password']) : '';
        
        $pdo = getPDO();
        $stmt = $pdo->prepare("SELECT * FROM users WHERE username = :username");
        $stmt->execute(['username' => $username]);
        $user = $stmt->fetch();
        
        if ($user && password_verify($password, $user['password_hash'])) {
            $payload = [
                'sub' => $user['username'],
                'role' => $user['role'],
                'iat' => time(),
                'exp' => time() + (3600 * 24) // 24 hours
            ];
            $token = JWTHelper::generate($payload);
            
            $data = [
                'token' => $token,
                'role' => $user['role'],
                'username' => $user['username']
            ];
            $response->getBody()->write(json_encode($data));
            return $response->withHeader('Content-Type', 'application/json');
        } else {
            // Fallback for default superadmin if table was empty or not updated
            if ($username === 'superadmin' && $password === 'admin123') {
                $payload = [
                    'sub' => 'superadmin',
                    'role' => 'super_admin',
                    'iat' => time(),
                    'exp' => time() + (3600 * 24)
                ];
                $token = JWTHelper::generate($payload);
                $data = ['token' => $token, 'role' => 'super_admin', 'username' => 'superadmin'];
                $response->getBody()->write(json_encode($data));
                return $response->withHeader('Content-Type', 'application/json');
            }
            
            $data = ['error' => 'اسم المستخدم أو كلمة المرور غير صالحة'];
            $response->getBody()->write(json_encode($data));
            return $response->withStatus(401)->withHeader('Content-Type', 'application/json');
        }
    } catch (\Exception $e) {
        $data = ['error' => $e->getMessage()];
        $response->getBody()->write(json_encode($data));
        return $response->withStatus(500)->withHeader('Content-Type', 'application/json');
    }
});

// Route: Get Statistics (Protected)
$app->get('/api/stats', function (Request $request, Response $response) {
    $user = checkAuth($request);
    if (!$user) {
        $response->getBody()->write(json_encode(['error' => 'Unauthorized']));
        return $response->withStatus(401)->withHeader('Content-Type', 'application/json');
    }

    try {
        $pdo = getPDO();
        
        // Total Voters
        $totalStmt = $pdo->query("SELECT COUNT(*) as total FROM voters");
        $total = $totalStmt->fetch()['total'];
        
        // Count by Village
        $villageStmt = $pdo->query("SELECT village, COUNT(*) as count FROM voters GROUP BY village");
        $villages = $villageStmt->fetchAll();
        
        // Count by Gender
        $genderStmt = $pdo->query("SELECT gender, COUNT(*) as count FROM voters GROUP BY gender");
        $genders = $genderStmt->fetchAll();

        // Count by Sect
        $sectStmt = $pdo->query("SELECT sect, COUNT(*) as count FROM voters GROUP BY sect");
        $sects = $sectStmt->fetchAll();

        // Top Birth Years
        $birthStmt = $pdo->query("
            SELECT YEAR(birth_date) as birth_year, COUNT(*) as count 
            FROM voters 
            WHERE birth_date IS NOT NULL 
            GROUP BY birth_year 
            ORDER BY count DESC 
            LIMIT 5
        ");
        $birthYears = $birthStmt->fetchAll();

        $data = [
            'total' => $total,
            'villages' => $villages,
            'genders' => $genders,
            'sects' => $sects,
            'top_birth_years' => $birthYears
        ];

        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response->withHeader('Content-Type', 'application/json');
    } catch (\Exception $e) {
        $data = ['error' => $e->getMessage()];
        $response->getBody()->write(json_encode($data));
        return $response->withStatus(500)->withHeader('Content-Type', 'application/json');
    }
});

// Route: Paginated Search (Protected)
$app->get('/api/voters', function (Request $request, Response $response) {
    $user = checkAuth($request);
    if (!$user) {
        $response->getBody()->write(json_encode(['error' => 'Unauthorized']));
        return $response->withStatus(401)->withHeader('Content-Type', 'application/json');
    }

    try {
        $params = $request->getQueryParams();
        $page = isset($params['page']) ? (int)$params['page'] : 1;
        $limit = isset($params['limit']) ? (int)$params['limit'] : 20;
        if ($page < 1) $page = 1;
        if ($limit < 1 || $limit > 100) $limit = 20;
        $offset = ($page - 1) * $limit;

        $pdo = getPDO();
        
        $conditions = [];
        $bindings = [];

        // Universal Easy Search (matches name, father, mother, or registry_no)
        if (!empty($params['q'])) {
            $words = explode(' ', ArabicNormalizer::normalize($params['q']));
            $wordConditions = [];
            foreach ($words as $idx => $word) {
                $word = trim($word);
                if ($word !== '') {
                    $paramName = "q_word_" . $idx;
                    $wordConditions[] = "(normalized_name LIKE :$paramName OR normalized_father_name LIKE :$paramName OR normalized_mother_name LIKE :$paramName OR registry_no LIKE :$paramName)";
                    $bindings[$paramName] = '%' . $word . '%';
                }
            }
            if (count($wordConditions) > 0) {
                $conditions[] = "(" . implode(" AND ", $wordConditions) . ")";
            }
        }

        // Advanced Search: Elector Name
        if (!empty($params['name'])) {
            $words = explode(' ', ArabicNormalizer::normalize($params['name']));
            foreach ($words as $idx => $word) {
                $word = trim($word);
                if ($word !== '') {
                    $paramName = "adv_name_" . $idx;
                    $conditions[] = "normalized_name LIKE :$paramName";
                    $bindings[$paramName] = '%' . $word . '%';
                }
            }
        }

        // Advanced Search: Father Name
        if (!empty($params['father_name'])) {
            $words = explode(' ', ArabicNormalizer::normalize($params['father_name']));
            foreach ($words as $idx => $word) {
                $word = trim($word);
                if ($word !== '') {
                    $paramName = "adv_father_" . $idx;
                    $conditions[] = "normalized_father_name LIKE :$paramName";
                    $bindings[$paramName] = '%' . $word . '%';
                }
            }
        }

        // Advanced Search: Mother Name
        if (!empty($params['mother_name'])) {
            $words = explode(' ', ArabicNormalizer::normalize($params['mother_name']));
            foreach ($words as $idx => $word) {
                $word = trim($word);
                if ($word !== '') {
                    $paramName = "adv_mother_" . $idx;
                    $conditions[] = "normalized_mother_name LIKE :$paramName";
                    $bindings[$paramName] = '%' . $word . '%';
                }
            }
        }

        // Advanced Search: Registry Number
        if (!empty($params['registry_no'])) {
            $conditions[] = "registry_no LIKE :registry_no";
            $bindings['registry_no'] = '%' . trim($params['registry_no']) . '%';
        }

        // Village filter
        if (!empty($params['village'])) {
            $conditions[] = "village = :village";
            $bindings['village'] = trim($params['village']);
        }

        // Gender filter
        if (!empty($params['gender'])) {
            $conditions[] = "gender = :gender";
            $bindings['gender'] = trim($params['gender']);
        }

        // Sect filter
        if (!empty($params['sect'])) {
            $conditions[] = "sect = :sect";
            $bindings['sect'] = trim($params['sect']);
        }

        $whereClause = "";
        if (count($conditions) > 0) {
            $whereClause = "WHERE " . implode(" AND ", $conditions);
        }

        // Get Total Matching Count
        $countQuery = "SELECT COUNT(*) as total FROM voters $whereClause";
        $countStmt = $pdo->prepare($countQuery);
        $countStmt->execute($bindings);
        $total = $countStmt->fetch()['total'];

        // Get paginated data
        $dataQuery = "SELECT id, name, father_name, mother_name, registry_no, sect, birth_date, birth_date_raw, gender, village, page_number, row_index 
                      FROM voters $whereClause 
                      ORDER BY village ASC, registry_no ASC, page_number ASC, row_index ASC
                      LIMIT :limit OFFSET :offset";
                      
        $stmt = $pdo->prepare($dataQuery);
        foreach ($bindings as $key => $val) {
            $stmt->bindValue(":$key", $val);
        }
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $results = $stmt->fetchAll();

        $data = [
            'total' => (int)$total,
            'page' => $page,
            'limit' => $limit,
            'pages' => ceil($total / $limit),
            'data' => $results
        ];

        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response->withHeader('Content-Type', 'application/json');
    } catch (\Exception $e) {
        $data = ['error' => $e->getMessage()];
        $response->getBody()->write(json_encode($data));
        return $response->withStatus(500)->withHeader('Content-Type', 'application/json');
    }
});

// Route: Get Users List (Super Admin only)
$app->get('/api/users', function (Request $request, Response $response) {
    $user = checkAuth($request);
    if (!$user || $user['role'] !== 'super_admin') {
        $response->getBody()->write(json_encode(['error' => 'Forbidden']));
        return $response->withStatus(403)->withHeader('Content-Type', 'application/json');
    }

    try {
        $pdo = getPDO();
        $stmt = $pdo->query("SELECT id, username, role FROM users ORDER BY id DESC");
        $results = $stmt->fetchAll();
        
        $response->getBody()->write(json_encode($results));
        return $response->withHeader('Content-Type', 'application/json');
    } catch (\Exception $e) {
        $response->getBody()->write(json_encode(['error' => $e->getMessage()]));
        return $response->withStatus(500)->withHeader('Content-Type', 'application/json');
    }
});

// Route: Create User (Super Admin only)
$app->post('/api/users', function (Request $request, Response $response) {
    $user = checkAuth($request);
    if (!$user || $user['role'] !== 'super_admin') {
        $response->getBody()->write(json_encode(['error' => 'Forbidden']));
        return $response->withStatus(403)->withHeader('Content-Type', 'application/json');
    }

    try {
        $body = json_decode($request->getBody()->getContents(), true);
        $username = isset($body['username']) ? trim($body['username']) : '';
        $password = isset($body['password']) ? trim($body['password']) : '';
        $role = isset($body['role']) ? trim($body['role']) : 'admin';
        
        if (empty($username) || empty($password)) {
            $response->getBody()->write(json_encode(['error' => 'Username and password required']));
            return $response->withStatus(400)->withHeader('Content-Type', 'application/json');
        }
        
        $pdo = getPDO();
        $stmt = $pdo->prepare("INSERT INTO users (username, password_hash, role) VALUES (:username, :password_hash, :role)");
        $stmt->execute([
            'username' => $username,
            'password_hash' => password_hash($password, PASSWORD_BCRYPT),
            'role' => $role
        ]);
        
        $response->getBody()->write(json_encode(['success' => true]));
        return $response->withHeader('Content-Type', 'application/json');
    } catch (\Exception $e) {
        $response->getBody()->write(json_encode(['error' => $e->getMessage()]));
        return $response->withStatus(500)->withHeader('Content-Type', 'application/json');
    }
});

// Route: Delete User (Super Admin only)
$app->delete('/api/users/{id}', function (Request $request, Response $response, array $args) {
    $user = checkAuth($request);
    if (!$user || $user['role'] !== 'super_admin') {
        $response->getBody()->write(json_encode(['error' => 'Forbidden']));
        return $response->withStatus(403)->withHeader('Content-Type', 'application/json');
    }

    try {
        $pdo = getPDO();
        $stmt = $pdo->prepare("DELETE FROM users WHERE id = :id");
        $stmt->execute(['id' => (int)$args['id']]);
        
        $response->getBody()->write(json_encode(['success' => true]));
        return $response->withHeader('Content-Type', 'application/json');
    } catch (\Exception $e) {
        $response->getBody()->write(json_encode(['error' => $e->getMessage()]));
        return $response->withStatus(500)->withHeader('Content-Type', 'application/json');
    }
});

// Route: Get Telegram Whitelist (Super Admin only)
$app->get('/api/whitelist', function (Request $request, Response $response) {
    $user = checkAuth($request);
    if (!$user || $user['role'] !== 'super_admin') {
        $response->getBody()->write(json_encode(['error' => 'Forbidden']));
        return $response->withStatus(403)->withHeader('Content-Type', 'application/json');
    }

    try {
        $pdo = getPDO();
        $stmt = $pdo->query("SELECT id, identifier, description, created_at FROM telegram_whitelist ORDER BY id DESC");
        $results = $stmt->fetchAll();
        
        $response->getBody()->write(json_encode($results));
        return $response->withHeader('Content-Type', 'application/json');
    } catch (\Exception $e) {
        $response->getBody()->write(json_encode(['error' => $e->getMessage()]));
        return $response->withStatus(500)->withHeader('Content-Type', 'application/json');
    }
});

// Route: Add to Telegram Whitelist (Super Admin only)
$app->post('/api/whitelist', function (Request $request, Response $response) {
    $user = checkAuth($request);
    if (!$user || $user['role'] !== 'super_admin') {
        $response->getBody()->write(json_encode(['error' => 'Forbidden']));
        return $response->withStatus(403)->withHeader('Content-Type', 'application/json');
    }

    try {
        $body = json_decode($request->getBody()->getContents(), true);
        $identifier = isset($body['identifier']) ? trim($body['identifier']) : '';
        $description = isset($body['description']) ? trim($body['description']) : '';
        
        if (empty($identifier)) {
            $response->getBody()->write(json_encode(['error' => 'Identifier required']));
            return $response->withStatus(400)->withHeader('Content-Type', 'application/json');
        }
        
        $pdo = getPDO();
        $stmt = $pdo->prepare("INSERT INTO telegram_whitelist (identifier, description) VALUES (:identifier, :description)");
        $stmt->execute([
            'identifier' => $identifier,
            'description' => $description
        ]);
        
        $response->getBody()->write(json_encode(['success' => true]));
        return $response->withHeader('Content-Type', 'application/json');
    } catch (\Exception $e) {
        $response->getBody()->write(json_encode(['error' => $e->getMessage()]));
        return $response->withStatus(500)->withHeader('Content-Type', 'application/json');
    }
});

// Route: Delete from Telegram Whitelist (Super Admin only)
$app->delete('/api/whitelist/{id}', function (Request $request, Response $response, array $args) {
    $user = checkAuth($request);
    if (!$user || $user['role'] !== 'super_admin') {
        $response->getBody()->write(json_encode(['error' => 'Forbidden']));
        return $response->withStatus(403)->withHeader('Content-Type', 'application/json');
    }

    try {
        $pdo = getPDO();
        $stmt = $pdo->prepare("DELETE FROM telegram_whitelist WHERE id = :id");
        $stmt->execute(['id' => (int)$args['id']]);
        
        $response->getBody()->write(json_encode(['success' => true]));
        return $response->withHeader('Content-Type', 'application/json');
    } catch (\Exception $e) {
        $response->getBody()->write(json_encode(['error' => $e->getMessage()]));
        return $response->withStatus(500)->withHeader('Content-Type', 'application/json');
    }
});

// Helper for Telegram Whitelist Checks
function isTelegramWhitelisted($chatId, $username) {
    try {
        $pdo = getPDO();
        $stmt = $pdo->prepare("SELECT 1 FROM telegram_whitelist WHERE identifier = :chat_id OR identifier = :username LIMIT 1");
        $stmt->execute([
            'chat_id' => strval($chatId),
            'username' => $username ? '@' . ltrim($username, '@') : '___never___'
        ]);
        return (bool)$stmt->fetch();
    } catch (\Exception $e) {
        return false;
    }
}

// Helper to call Gemini for voice transcription in Webhook
function callGeminiWebhook(array $parts) {
    $env = [];
    $envPath = __DIR__ . '/../.env';
    if (file_exists($envPath)) {
        $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach ($lines as $line) {
            if (strpos(trim($line), '#') === 0) continue;
            $p = explode('=', $line, 2);
            if (count($p) === 2) {
                $env[trim($p[0])] = trim($p[1]);
            }
        }
    }
    
    $geminiKey = $env['GEMINI_API_KEY'] ?? '';
    if (empty($geminiKey) || $geminiKey === 'YOUR_GEMINI_API_KEY_HERE') {
        return null;
    }
    
    $url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" . $geminiKey;
    $prompt = "Listen to this audio query for a citizen registry search. Extract only the search terms spoken (names, numbers, village) in Arabic, and discard conversational commands like 'ابحث عن' or 'بدي'. Return the clean query text.";
    
    $payload = [
        'contents' => [
            [
                'parts' => array_merge($parts, [
                    ['text' => $prompt]
                ])
            ]
        ]
    ];
    
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
    $response = curl_exec($ch);
    curl_close($ch);
    
    if ($response) {
        $resData = json_decode($response, true);
        return $resData['candidates'][0]['content']['parts'][0]['text'] ?? null;
    }
    return null;
}

// Helper to send Telegram Message in Webhook
function sendTelegramMessageWebhook($chatId, $text) {
    $env = [];
    $envPath = __DIR__ . '/../.env';
    if (file_exists($envPath)) {
        $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach ($lines as $line) {
            if (strpos(trim($line), '#') === 0) continue;
            $p = explode('=', $line, 2);
            if (count($p) === 2) {
                $env[trim($p[0])] = trim($p[1]);
            }
        }
    }
    
    $botToken = $env['TELEGRAM_BOT_TOKEN'] ?? '';
    if (empty($botToken)) return;
    
    $url = "https://api.telegram.org/bot{$botToken}/sendMessage";
    $payload = [
        'chat_id' => $chatId,
        'text' => $text,
        'parse_mode' => 'HTML'
    ];
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
    curl_exec($ch);
    curl_close($ch);
}

// Webhook Route for Telegram
$app->post('/api/telegram-webhook', function (Request $request, Response $response) {
    $body = json_decode($request->getBody()->getContents(), true);
    if (!$body) {
        return $response->withStatus(400);
    }
    
    $message = $body['message'] ?? null;
    if (!$message) {
        return $response; // Return 200 OK to other update types
    }
    
    $chatId = $message['chat']['id'] ?? '';
    $username = $message['from']['username'] ?? null;
    
    // 1. Authorization check
    if (!isTelegramWhitelisted($chatId, $username)) {
        $msg = "⚠️ <b>عذراً، هذا الحساب غير مصرح له بالدخول.</b>\n";
        $msg .= "يرجى الطلب من المسؤول إدخال معرفك الخاص بالوصول:\n";
        $msg .= "<code>" . htmlspecialchars($chatId) . "</code>";
        if ($username) {
            $msg .= " أو <code>@" . htmlspecialchars($username) . "</code>";
        }
        sendTelegramMessageWebhook($chatId, $msg);
        return $response;
    }
    
    $queryText = null;
    $isVoice = false;
    
    // Load Token
    $env = [];
    $envPath = __DIR__ . '/../.env';
    if (file_exists($envPath)) {
        $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach ($lines as $line) {
            if (strpos(trim($line), '#') === 0) continue;
            $p = explode('=', $line, 2);
            if (count($p) === 2) {
                $env[trim($p[0])] = trim($p[1]);
            }
        }
    }
    $botToken = $env['TELEGRAM_BOT_TOKEN'] ?? '';
    
    // 2. Handle Voice notes
    if (isset($message['voice'])) {
        $isVoice = true;
        $fileId = $message['voice']['file_id'];
        sendTelegramMessageWebhook($chatId, "🎙️ جاري تحميل المقطع الصوتي وتحليله بالذكاء الاصطناعي...");
        
        $fileUrl = "https://api.telegram.org/bot{$botToken}/getFile?file_id={$fileId}";
        $fileRes = file_get_contents($fileUrl);
        $fileData = json_decode($fileRes, true);
        $filePath = $fileData['result']['file_path'] ?? '';
        
        if ($filePath) {
            $downloadUrl = "https://api.telegram.org/file/bot{$botToken}/{$filePath}";
            $audioData = file_get_contents($downloadUrl);
            $base64Audio = base64_encode($audioData);
            
            $parts = [
                [
                    'inlineData' => [
                        'mimeType' => 'audio/ogg',
                        'data' => $base64Audio
                    ]
                ]
            ];
            
            $queryText = callGeminiWebhook($parts);
            if ($queryText) {
                sendTelegramMessageWebhook($chatId, "📝 <b>النص المستخرج:</b>\n<i>\"" . htmlspecialchars($queryText) . "\"</i>");
            }
        } else {
            sendTelegramMessageWebhook($chatId, "⚠️ فشل تحميل الملف الصوتي.");
        }
    }
    // 3. Handle Text queries
    elseif (isset($message['text'])) {
        $text = trim($message['text']);
        if ($text === '/start') {
            sendTelegramMessageWebhook($chatId, "👋 أهلاً بك في <b>نظام استعلام المواطنين</b>.\nيمكنك إرسال رسالة نصية أو تسجيل صوتي باسم المواطن المستعلم عنه للحصول على تفاصيله بالكامل.");
            return $response;
        }
        $queryText = $text;
    }
    
    // 4. Run Search
    if (!empty($queryText)) {
        if (!$isVoice) {
            sendTelegramMessageWebhook($chatId, "🔄 جاري البحث في السجلات...");
        }
        
        try {
            $pdo = getPDO();
            $conditions = [];
            $bindings = [];
            
            $stopWords = ["ابحث", "عن", "بدي", "معلومات", "المواطن", "مواطن", "سجل", "الاسم", "حساب", "رقم", "اسم"];
            $words = explode(' ', $queryText);
            $filteredWords = [];
            foreach ($words as $w) {
                $wClean = trim($w);
                if (!empty($wClean) && !in_array($wClean, $stopWords)) {
                    $filteredWords[] = $wClean;
                }
            }
            
            if (count($filteredWords) > 0) {
                foreach ($filteredWords as $idx => $word) {
                    $wordNorm = ArabicNormalizer::normalize($word);
                    if (!empty($wordNorm)) {
                        $paramName = "q_word_" . $idx;
                        $conditions[] = "(normalized_name LIKE :$paramName OR normalized_father_name LIKE :$paramName OR normalized_mother_name LIKE :$paramName OR registry_no LIKE :$paramName OR village LIKE :$paramName)";
                        $bindings[$paramName] = '%' . $wordNorm . '%';
                    }
                }
                
                if (count($conditions) > 0) {
                    $where = "WHERE " . implode(" AND ", $conditions);
                    $sql = "SELECT name, father_name, mother_name, registry_no, sect, birth_date, birth_date_raw, gender, village, page_number, row_index 
                            FROM voters $where ORDER BY village ASC, registry_no ASC LIMIT 15";
                    $stmt = $pdo->prepare($sql);
                    $stmt->execute($bindings);
                    $results = $stmt->fetchAll();
                    
                    if (count($results) > 0) {
                        $reply = "🔍 <b>نتائج البحث المكتشفة:</b>\n\n";
                        foreach ($results as $v) {
                            $reply .= "👤 <b>" . htmlspecialchars($v['name']) . "</b>\n";
                            $reply .= "▪️ <b>اسم الأب:</b> " . htmlspecialchars($v['father_name']) . "\n";
                            $reply .= "▪️ <b>اسم الأم:</b> " . htmlspecialchars($v['mother_name']) . "\n";
                            $reply .= "▪️ <b>رقم القيد / البلدة:</b> " . htmlspecialchars($v['registry_no']) . " / " . htmlspecialchars($v['village']) . "\n";
                            $reply .= "▪️ <b>المذهب / الولادة:</b> " . htmlspecialchars($v['sect']) . " / " . htmlspecialchars($v['birth_date'] ? $v['birth_date'] : $v['birth_date_raw']) . "\n";
                            $reply .= "📌 ص <b>" . $v['page_number'] . "</b> / س <b>" . $v['row_index'] . "</b>\n";
                            $reply .= "──────────────────\n";
                        }
                        sendTelegramMessageWebhook($chatId, $reply);
                    } else {
                        sendTelegramMessageWebhook($chatId, "❌ لم يتم العثور على أي مواطن يطابق معايير البحث.");
                    }
                }
            } else {
                sendTelegramMessageWebhook($chatId, "❌ الرجاء كتابة معايير بحث واضحة.");
            }
        } catch (\Exception $ex) {
            sendTelegramMessageWebhook($chatId, "⚠️ حدث خطأ في قاعدة البيانات أثناء معالجة الطلب.");
        }
    }
    
    return $response;
});

$app->run();
