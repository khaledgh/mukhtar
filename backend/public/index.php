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
                    $variants = ArabicNormalizer::extractCompoundVariants($word);
                    $subConditions = [];
                    foreach ($variants as $vIdx => $v) {
                        $paramName = "q_word_{$idx}_{$vIdx}";
                        $subConditions[] = "(normalized_name LIKE :$paramName OR normalized_father_name LIKE :$paramName OR normalized_mother_name LIKE :$paramName OR registry_no LIKE :$paramName)";
                        $bindings[$paramName] = '%' . $v . '%';
                    }
                    if (!empty($subConditions)) {
                        $wordConditions[] = "(" . implode(" OR ", $subConditions) . ")";
                    }
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
                    $variants = ArabicNormalizer::extractCompoundVariants($word);
                    $subConds = [];
                    foreach ($variants as $vIdx => $v) {
                        $paramName = "adv_name_{$idx}_{$vIdx}";
                        $subConds[] = "normalized_name LIKE :$paramName";
                        $bindings[$paramName] = '%' . $v . '%';
                    }
                    if (!empty($subConds)) {
                        $conditions[] = "(" . implode(" OR ", $subConds) . ")";
                    }
                }
            }
        }

        // Advanced Search: Father Name
        if (!empty($params['father_name'])) {
            $words = explode(' ', ArabicNormalizer::normalize($params['father_name']));
            foreach ($words as $idx => $word) {
                $word = trim($word);
                if ($word !== '') {
                    $variants = ArabicNormalizer::extractCompoundVariants($word);
                    $subConds = [];
                    foreach ($variants as $vIdx => $v) {
                        $paramName = "adv_father_{$idx}_{$vIdx}";
                        $subConds[] = "normalized_father_name LIKE :$paramName";
                        $bindings[$paramName] = '%' . $v . '%';
                    }
                    if (!empty($subConds)) {
                        $conditions[] = "(" . implode(" OR ", $subConds) . ")";
                    }
                }
            }
        }

        // Advanced Search: Mother Name
        if (!empty($params['mother_name'])) {
            $words = explode(' ', ArabicNormalizer::normalize($params['mother_name']));
            foreach ($words as $idx => $word) {
                $word = trim($word);
                if ($word !== '') {
                    $variants = ArabicNormalizer::extractCompoundVariants($word);
                    $subConds = [];
                    foreach ($variants as $vIdx => $v) {
                        $paramName = "adv_mother_{$idx}_{$vIdx}";
                        $subConds[] = "normalized_mother_name LIKE :$paramName";
                        $bindings[$paramName] = '%' . $v . '%';
                    }
                    if (!empty($subConds)) {
                        $conditions[] = "(" . implode(" OR ", $subConds) . ")";
                    }
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

// Route: Get Chatbot Logs (Super Admin only)
$app->get('/api/chatbot-logs', function (Request $request, Response $response) {
    $user = checkAuth($request);
    if (!$user || $user['role'] !== 'super_admin') {
        $response->getBody()->write(json_encode(['error' => 'Forbidden']));
        return $response->withStatus(403)->withHeader('Content-Type', 'application/json');
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

        // Filter by search query
        if (!empty($params['q'])) {
            $q = trim($params['q']);
            $conditions[] = "(chat_id LIKE :q OR username LIKE :q OR query_text LIKE :q OR response_text LIKE :q)";
            $bindings['q'] = '%' . $q . '%';
        }

        // Filter by message type
        if (!empty($params['type']) && in_array($params['type'], ['text', 'voice'])) {
            $conditions[] = "message_type = :type";
            $bindings['type'] = $params['type'];
        }

        $whereClause = "";
        if (count($conditions) > 0) {
            $whereClause = "WHERE " . implode(" AND ", $conditions);
        }

        // Get total matching count
        $countStmt = $pdo->prepare("SELECT COUNT(*) as total FROM chatbot_logs $whereClause");
        $countStmt->execute($bindings);
        $total = (int)$countStmt->fetch()['total'];

        // Get paginated logs
        $logsStmt = $pdo->prepare("SELECT id, chat_id, username, message_type, query_text, response_text, prompt_tokens, completion_tokens, estimated_cost, created_at 
            FROM chatbot_logs $whereClause 
            ORDER BY created_at DESC 
            LIMIT :limit OFFSET :offset");
        foreach ($bindings as $key => $val) {
            $logsStmt->bindValue(":$key", $val);
        }
        $logsStmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $logsStmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $logsStmt->execute();
        $logs = $logsStmt->fetchAll();

        // Get general stats
        $statsStmt = $pdo->query("SELECT 
            COUNT(*) as total_queries,
            SUM(CASE WHEN message_type = 'voice' THEN 1 ELSE 0 END) as voice_queries,
            SUM(CASE WHEN message_type = 'text' THEN 1 ELSE 0 END) as text_queries,
            SUM(prompt_tokens + completion_tokens) as total_tokens,
            SUM(estimated_cost) as total_cost
            FROM chatbot_logs");
        $stats = $statsStmt->fetch();

        $data = [
            'logs' => $logs,
            'stats' => [
                'total_queries' => (int)($stats['total_queries'] ?? 0),
                'voice_queries' => (int)($stats['voice_queries'] ?? 0),
                'text_queries' => (int)($stats['text_queries'] ?? 0),
                'total_tokens' => (int)($stats['total_tokens'] ?? 0),
                'total_cost' => (float)($stats['total_cost'] ?? 0.0)
            ],
            'pagination' => [
                'page' => $page,
                'limit' => $limit,
                'pages' => (int)ceil($total / $limit),
                'total' => $total
            ]
        ];

        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response->withHeader('Content-Type', 'application/json');
    } catch (\Exception $e) {
        $response->getBody()->write(json_encode(['error' => $e->getMessage()]));
        return $response->withStatus(500)->withHeader('Content-Type', 'application/json');
    }
});

// Route: Clear Chatbot Logs (Super Admin only)
$app->delete('/api/chatbot-logs/clear', function (Request $request, Response $response) {
    $user = checkAuth($request);
    if (!$user || $user['role'] !== 'super_admin') {
        $response->getBody()->write(json_encode(['error' => 'Forbidden']));
        return $response->withStatus(403)->withHeader('Content-Type', 'application/json');
    }

    try {
        $pdo = getPDO();
        $pdo->exec("TRUNCATE TABLE chatbot_logs");
        $response->getBody()->write(json_encode(['success' => true]));
        return $response->withHeader('Content-Type', 'application/json');
    } catch (\Exception $e) {
        $response->getBody()->write(json_encode(['error' => $e->getMessage()]));
        return $response->withStatus(500)->withHeader('Content-Type', 'application/json');
    }
});

// Route: System 1-Click Fix & Diagnostic (Super Admin only)
$app->post('/api/system/fix', function (Request $request, Response $response) {
    $user = checkAuth($request);
    if (!$user || $user['role'] !== 'super_admin') {
        $response->getBody()->write(json_encode(['error' => 'Forbidden']));
        return $response->withStatus(403)->withHeader('Content-Type', 'application/json');
    }

    try {
        $pdo = getPDO();
        $report = [];

        // 1. Fix double-Alef 'االله' across voters table
        $doubleAlefFixed = 0;
        $u1 = $pdo->exec("UPDATE voters SET name = REPLACE(name, '\u{0627}\u{0627}\u{0644}\u{0644}\u{0647}', '\u{0627}\u{0644}\u{0644}\u{0647}') WHERE name LIKE '%\u{0627}\u{0627}\u{0644}\u{0644}\u{0647}%'");
        $u2 = $pdo->exec("UPDATE voters SET normalized_name = REPLACE(normalized_name, '\u{0627}\u{0627}\u{0644}\u{0644}\u{0647}', '\u{0627}\u{0644}\u{0644}\u{0647}') WHERE normalized_name LIKE '%\u{0627}\u{0627}\u{0644}\u{0644}\u{0647}%'");
        $u3 = $pdo->exec("UPDATE voters SET father_name = REPLACE(father_name, '\u{0627}\u{0627}\u{0644}\u{0644}\u{0647}', '\u{0627}\u{0644}\u{0644}\u{0647}') WHERE father_name LIKE '%\u{0627}\u{0627}\u{0644}\u{0644}\u{0647}%'");
        $u4 = $pdo->exec("UPDATE voters SET normalized_father_name = REPLACE(normalized_father_name, '\u{0627}\u{0627}\u{0644}\u{0644}\u{0647}', '\u{0627}\u{0644}\u{0644}\u{0647}') WHERE normalized_father_name LIKE '%\u{0627}\u{0627}\u{0644}\u{0644}\u{0647}%'");
        $u5 = $pdo->exec("UPDATE voters SET mother_name = REPLACE(mother_name, '\u{0627}\u{0627}\u{0644}\u{0644}\u{0647}', '\u{0627}\u{0644}\u{0644}\u{0647}') WHERE mother_name LIKE '%\u{0627}\u{0627}\u{0644}\u{0644}\u{0647}%'");
        $u6 = $pdo->exec("UPDATE voters SET normalized_mother_name = REPLACE(normalized_mother_name, '\u{0627}\u{0627}\u{0644}\u{0644}\u{0647}', '\u{0627}\u{0644}\u{0644}\u{0647}') WHERE normalized_mother_name LIKE '%\u{0627}\u{0627}\u{0644}\u{0644}\u{0647}%'");
        $doubleAlefFixed = ($u1 ?: 0) + ($u2 ?: 0) + ($u3 ?: 0) + ($u4 ?: 0) + ($u5 ?: 0) + ($u6 ?: 0);
        $report['db_double_alef_cleaned'] = $doubleAlefFixed;

        // 2. Ensure Telegram bot webhook is checked & cleared if broken
        $env = [];
        $envPath = __DIR__ . '/../.env';
        if (file_exists($envPath)) {
            $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
            foreach ($lines as $line) {
                if (strpos(trim($line), '#') === 0) continue;
                $p = explode('=', $line, 2);
                if (count($p) === 2) {
                    $env[trim($p[0])] = trim($p[1], " \t\n\r\0\x0B\"'");
                }
            }
        }
        $botToken = $env['TELEGRAM_BOT_TOKEN'] ?? '';
        $telegramStatus = 'لم يتم تحديد توكن تليغرام';
        $botUsername = null;

        if (!empty($botToken)) {
            $meUrl = "https://api.telegram.org/bot{$botToken}/getMe";
            $meRes = @file_get_contents($meUrl);
            if ($meRes) {
                $meData = json_decode($meRes, true);
                if (!empty($meData['ok'])) {
                    $botUsername = '@' . ($meData['result']['username'] ?? '');
                }
            }

            $delUrl = "https://api.telegram.org/bot{$botToken}/deleteWebhook";
            $delRes = @file_get_contents($delUrl);
            if ($delRes) {
                $delData = json_decode($delRes, true);
                if (!empty($delData['ok'])) {
                    $telegramStatus = 'تم تصفية الويب هوك المعلق بنجاح - البوت جاهز للاستقبال والبحث بدون تعارض';
                } else {
                    $telegramStatus = $delData['description'] ?? 'تم فحص حالة الويب هوك';
                }
            }
        }
        $report['telegram_status'] = $telegramStatus;
        $report['telegram_bot'] = $botUsername;

        // 3. Ensure Whitelist default identifiers exist
        $pdo->exec("INSERT IGNORE INTO telegram_whitelist (identifier, description) VALUES ('263844931', 'خالد الغوراني'), ('6538993902', 'Samer Ajaj')");
        $whitelistStmt = $pdo->query("SELECT COUNT(*) as cnt FROM telegram_whitelist");
        $report['whitelist_count'] = (int)$whitelistStmt->fetch()['cnt'];

        // 4. Test Gemini AI
        $geminiKey = $env['GEMINI_API_KEY'] ?? '';
        $geminiStatus = 'غير مفعل';
        if (!empty($geminiKey) && $geminiKey !== 'YOUR_GEMINI_API_KEY_HERE') {
            $t0 = microtime(true);
            $testUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" . $geminiKey;
            $payload = ['contents' => [['parts' => [['text' => 'ping']]]]];
            $ch = curl_init($testUrl);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
            curl_setopt($ch, CURLOPT_TIMEOUT, 6);
            $gRes = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
            $latency = round((microtime(true) - $t0) * 1000);

            if ($httpCode === 200) {
                $geminiStatus = "متصل بنجاح (gemini-2.5-flash) - زمن الاستجابة: {$latency}ms";
            } else {
                $geminiStatus = "خطأ في الاتصال (كود HTTP {$httpCode})";
            }
        }
        $report['gemini_status'] = $geminiStatus;

        // 5. Total voters count in DB
        $votersCountStmt = $pdo->query("SELECT COUNT(*) as cnt FROM voters");
        $report['total_voters'] = (int)$votersCountStmt->fetch()['cnt'];

        $resData = [
            'success' => true,
            'message' => 'تم تطبيق جميع الإصلاحات وفحص النظام بنجاح بضغطة زر واحدة!',
            'report' => $report
        ];
        $response->getBody()->write(json_encode($resData, JSON_UNESCAPED_UNICODE));
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
        $text = $resData['candidates'][0]['content']['parts'][0]['text'] ?? null;
        $usage = $resData['usageMetadata'] ?? [];
        $promptTokens = $usage['promptTokenCount'] ?? 0;
        $completionTokens = $usage['candidatesTokenCount'] ?? 0;
        return [
            'text' => $text ? trim($text) : null,
            'prompt_tokens' => $promptTokens,
            'completion_tokens' => $completionTokens
        ];
    }
    return null;
}

// Helper to log chatbot interaction in database
function logChatbotInteraction($chatId, $username, $messageType, $queryText, $responseText, $promptTokens = 0, $completionTokens = 0) {
    try {
        $inputRate = 0.000000075; // $0.075 per 1M tokens
        $outputRate = 0.00000030; // $0.30 per 1M tokens
        $estimatedCost = ($promptTokens * $inputRate) + ($completionTokens * $outputRate);
        
        $pdo = getPDO();
        $stmt = $pdo->prepare("INSERT INTO chatbot_logs 
            (chat_id, username, message_type, query_text, response_text, prompt_tokens, completion_tokens, estimated_cost) 
            VALUES (:chat_id, :username, :message_type, :query_text, :response_text, :prompt_tokens, :completion_tokens, :estimated_cost)");
        $stmt->execute([
            'chat_id' => strval($chatId),
            'username' => $username,
            'message_type' => $messageType,
            'query_text' => $queryText,
            'response_text' => $responseText,
            'prompt_tokens' => (int)$promptTokens,
            'completion_tokens' => (int)$completionTokens,
            'estimated_cost' => $estimatedCost
        ]);
    } catch (\Exception $e) {
        error_log("Failed to log chatbot interaction: " . $e->getMessage());
    }
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

// Helper to call Gemini to parse user query in Webhook
function parseQueryWithGeminiWebhook($queryText) {
    $env = [];
    $envPath = __DIR__ . '/../.env';
    if (file_exists($envPath)) {
        $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach ($lines as $line) {
            if (strpos(trim($line), '#') === 0) continue;
            $p = explode('=', $line, 2);
            if (count($p) === 2) {
                $env[trim($p[0])] = trim($p[1], " \t\n\r\0\x0B\"'");
            }
        }
    }
    
    $geminiKey = $env['GEMINI_API_KEY'] ?? '';
    if (empty($geminiKey) || $geminiKey === 'YOUR_GEMINI_API_KEY_HERE') {
        return null;
    }
    
    $url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" . $geminiKey;
    $systemInstruction = "أنت مساعد ذكي لاستخراج وتحليل أسماء الناخبين في السجلات اللبنانية. حلل رسالة البحث وأعد كود JSON يحتوي على: first_name, father_name, mother_name, family_name, registry_no, village, search_tokens (قائمة بكلمات البحث مع دمج وفصل الأسماء المركبة مثل عبدالله وعبد الله). أعد فقط JSON صالح بدون markdown.";
    
    $payload = [
        'contents' => [['parts' => [['text' => $queryText]]]],
        'systemInstruction' => ['parts' => [['text' => $systemInstruction]]],
        'generationConfig' => ['responseMimeType' => 'application/json']
    ];
    
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
    curl_setopt($ch, CURLOPT_TIMEOUT, 8);
    $response = curl_exec($ch);
    curl_close($ch);
    
    if ($response) {
        $resData = json_decode($response, true);
        $text = $resData['candidates'][0]['content']['parts'][0]['text'] ?? null;
        $usage = $resData['usageMetadata'] ?? [];
        if ($text) {
            $parsed = json_decode($text, true);
            if ($parsed) {
                return [
                    'data' => $parsed,
                    'prompt_tokens' => $usage['promptTokenCount'] ?? 0,
                    'completion_tokens' => $usage['candidatesTokenCount'] ?? 0
                ];
            }
        }
    }
    return null;
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
    $firstName = $message['from']['first_name'] ?? 'مستخدم';
    
    // 1. Authorization check
    if (!isTelegramWhitelisted($chatId, $username)) {
        $msg = "⚠️ <b>عذراً يا " . htmlspecialchars($firstName) . "، هذا الحساب غير مصرح له بالدخول.</b>\n\n";
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
    $promptTokens = 0;
    $completionTokens = 0;
    
    // Load Token
    $env = [];
    $envPath = __DIR__ . '/../.env';
    if (file_exists($envPath)) {
        $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach ($lines as $line) {
            if (strpos(trim($line), '#') === 0) continue;
            $p = explode('=', $line, 2);
            if (count($p) === 2) {
                $env[trim($p[0])] = trim($p[1], " \t\n\r\0\x0B\"'");
            }
        }
    }
    $botToken = $env['TELEGRAM_BOT_TOKEN'] ?? '';
    
    // 2. Handle Voice notes
    if (isset($message['voice'])) {
        $isVoice = true;
        $fileId = $message['voice']['file_id'];
        sendTelegramMessageWebhook($chatId, "🎙️ <i>جاري تحميل المقطع الصوتي وتحليله بالذكاء الاصطناعي...</i>");
        
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
            
            $geminiRes = callGeminiWebhook($parts);
            if ($geminiRes && isset($geminiRes['text'])) {
                $queryText = $geminiRes['text'];
                $promptTokens = $geminiRes['prompt_tokens'];
                $completionTokens = $geminiRes['completion_tokens'];
                sendTelegramMessageWebhook($chatId, "📝 <b>النص المستخرج:</b>\n<i>\"" . htmlspecialchars($queryText) . "\"</i>");
            } else {
                $reply = "⚠️ تعذر استخراج النص بالذكاء الاصطناعي بدقة.";
                sendTelegramMessageWebhook($chatId, $reply);
                logChatbotInteraction($chatId, $username, 'voice', '[Voice Note (transcription failed)]', $reply, 0, 0);
            }
        } else {
            $reply = "⚠️ فشل تحميل الملف الصوتي.";
            sendTelegramMessageWebhook($chatId, $reply);
            logChatbotInteraction($chatId, $username, 'voice', '[Voice Note (download failed)]', $reply, 0, 0);
        }
    }
    // 3. Handle Text queries
    elseif (isset($message['text'])) {
        $text = trim($message['text']);
        if ($text === '/start' || $text === '/help') {
            $reply = "👋 أهلاً بك في <b>نظام استعلام سجلات الناخبين الذكي</b>.\n\n" .
                     "• أرسل اسم المواطن كاملاً (مثل: <code>حليمة عبدالقادر حمزة</code>)\n" .
                     "• يدعم النظام الأسماء المركبة (مثل: <code>عبد الله</code> أو <code>عبدالله</code>)\n" .
                     "• يمكنك أيضاً إرسال <b>تسجيل صوتي 🎙️</b> بالاسم مباشرةً.";
            sendTelegramMessageWebhook($chatId, $reply);
            logChatbotInteraction($chatId, $username, 'text', $text, $reply, 0, 0);
            return $response;
        }
        $queryText = $text;
    }
    
    // 4. Run Search with AI and Smart expansion
    if (!empty($queryText)) {
        if (!$isVoice) {
            sendTelegramMessageWebhook($chatId, "🔄 <i>جاري البحث في السجلات وتحليل الاسم بالذكاء الاصطناعي...</i>");
        }
        
        $msgType = $isVoice ? 'voice' : 'text';
        
        try {
            $pdo = getPDO();
            
            // Ask Gemini to parse query
            $aiResult = parseQueryWithGeminiWebhook($queryText);
            if ($aiResult) {
                $promptTokens += $aiResult['prompt_tokens'];
                $completionTokens += $aiResult['completion_tokens'];
            }
            $aiData = $aiResult['data'] ?? null;
            
            $results = [];
            
            // Strategy A: Structured Search if AI extracted specific name/father/family fields
            if ($aiData && (!empty($aiData['first_name']) || !empty($aiData['father_name']) || !empty($aiData['family_name']))) {
                $conds = [];
                $binds = [];
                
                if (!empty($aiData['first_name'])) {
                    $variants = ArabicNormalizer::extractCompoundVariants($aiData['first_name']);
                    $sub = [];
                    foreach ($variants as $vi => $v) {
                        $p = "fn_" . $vi;
                        $sub[] = "normalized_name LIKE :$p";
                        $binds[$p] = '%' . $v . '%';
                    }
                    if (!empty($sub)) $conds[] = "(" . implode(" OR ", $sub) . ")";
                }
                
                if (!empty($aiData['father_name'])) {
                    $variants = ArabicNormalizer::extractCompoundVariants($aiData['father_name']);
                    $sub = [];
                    foreach ($variants as $vi => $v) {
                        $p = "fat_" . $vi;
                        $sub[] = "(normalized_father_name LIKE :$p OR normalized_name LIKE :$p)";
                        $binds[$p] = '%' . $v . '%';
                    }
                    if (!empty($sub)) $conds[] = "(" . implode(" OR ", $sub) . ")";
                }
                
                if (!empty($aiData['family_name'])) {
                    $variants = ArabicNormalizer::extractCompoundVariants($aiData['family_name']);
                    $sub = [];
                    foreach ($variants as $vi => $v) {
                        $p = "fam_" . $vi;
                        $sub[] = "(normalized_name LIKE :$p OR normalized_mother_name LIKE :$p)";
                        $binds[$p] = '%' . $v . '%';
                    }
                    if (!empty($sub)) $conds[] = "(" . implode(" OR ", $sub) . ")";
                }
                
                if (!empty($aiData['registry_no'])) {
                    $conds[] = "registry_no LIKE :reg_no";
                    $binds['reg_no'] = '%' . trim($aiData['registry_no']) . '%';
                }
                
                if (!empty($aiData['village'])) {
                    $conds[] = "village LIKE :vil";
                    $binds['vil'] = '%' . ArabicNormalizer::normalize($aiData['village']) . '%';
                }
                
                if (!empty($conds)) {
                    $sql = "SELECT name, father_name, mother_name, registry_no, sect, birth_date, birth_date_raw, gender, village, page_number, row_index 
                            FROM voters WHERE " . implode(" AND ", $conds) . " ORDER BY village ASC, registry_no ASC LIMIT 15";
                    $stmt = $pdo->prepare($sql);
                    $stmt->execute($binds);
                    $results = $stmt->fetchAll();
                }
            }
            
            // Strategy B: Token-based Search with compound expansion
            if (empty($results)) {
                $searchTokens = [];
                if ($aiData && !empty($aiData['search_tokens']) && is_array($aiData['search_tokens'])) {
                    foreach ($aiData['search_tokens'] as $tok) {
                        $normTok = ArabicNormalizer::normalize($tok);
                        if (!empty($normTok) && mb_strlen($normTok) > 1 && !in_array($normTok, ['او', 'أو', 'في', 'من', 'عن', 'بدي', 'ابحث'])) {
                            $searchTokens[] = $normTok;
                        }
                    }
                }
                
                if (empty($searchTokens)) {
                    $stopWords = ["ابحث", "عن", "بدي", "معلومات", "المواطن", "مواطن", "سجل", "الاسم", "حساب", "رقم", "اسم", "او", "أو", "في", "من"];
                    $rawWords = preg_split('/\s+/u', trim($queryText));
                    $c = count($rawWords);
                    for ($i = 0; $i < $c; $i++) {
                        $w = ArabicNormalizer::normalize($rawWords[$i]);
                        if (empty($w) || in_array($w, $stopWords)) continue;
                        if ($w === 'عبد' && $i + 1 < $c) {
                            $nextW = ArabicNormalizer::normalize($rawWords[$i+1]);
                            $searchTokens[] = "عبد " . $nextW;
                            $i++;
                            continue;
                        }
                        $searchTokens[] = $w;
                    }
                }
                
                $conditions = [];
                $bindings = [];
                foreach ($searchTokens as $idx => $token) {
                    $variants = ArabicNormalizer::extractCompoundVariants($token);
                    $subConditions = [];
                    foreach ($variants as $vIdx => $v) {
                        $paramName = "tok_{$idx}_{$vIdx}";
                        $subConditions[] = "(normalized_name LIKE :$paramName OR normalized_father_name LIKE :$paramName OR normalized_mother_name LIKE :$paramName OR registry_no LIKE :$paramName OR village LIKE :$paramName)";
                        $bindings[$paramName] = '%' . $v . '%';
                    }
                    if (!empty($subConditions)) {
                        $conditions[] = "(" . implode(" OR ", $subConditions) . ")";
                    }
                }
                
                if (!empty($conditions)) {
                    $where = "WHERE " . implode(" AND ", $conditions);
                    $sql = "SELECT name, father_name, mother_name, registry_no, sect, birth_date, birth_date_raw, gender, village, page_number, row_index 
                            FROM voters $where ORDER BY village ASC, registry_no ASC LIMIT 15";
                    $stmt = $pdo->prepare($sql);
                    $stmt->execute($bindings);
                    $results = $stmt->fetchAll();
                }
            }
            
            if (!empty($results)) {
                $reply = "🔍 <b>تم العثور على (" . count($results) . ") نتيجة مطابقة:</b>\n\n";
                foreach ($results as $v) {
                    $bdate = $v['birth_date'] ? $v['birth_date'] : $v['birth_date_raw'];
                    $reply .= "👤 <b>" . htmlspecialchars($v['name']) . "</b>\n";
                    $reply .= "▪️ <b>اسم الأب:</b> " . htmlspecialchars($v['father_name']) . "\n";
                    $reply .= "▪️ <b>اسم الأم:</b> " . htmlspecialchars($v['mother_name']) . "\n";
                    $reply .= "▪️ <b>رقم القيد / البلدة:</b> " . htmlspecialchars($v['registry_no']) . " / " . htmlspecialchars($v['village']) . "\n";
                    $reply .= "▪️ <b>المذهب / تاريخ الولادة:</b> " . htmlspecialchars($v['sect']) . " / " . htmlspecialchars($bdate) . "\n";
                    $reply .= "📌 <b>السجل:</b> صفحة <b>" . $v['page_number'] . "</b> / سطر <b>" . $v['row_index'] . "</b>\n";
                    $reply .= "──────────────────\n";
                }
                sendTelegramMessageWebhook($chatId, $reply);
                logChatbotInteraction($chatId, $username, $msgType, $queryText, $reply, $promptTokens, $completionTokens);
            } else {
                $reply = "❌ <b>لم يتم العثور على أي مواطن يطابق معايير البحث.</b>\n💡 <i>يرجى التأكد من كتابة الاسم بدقة أو البحث برقم السجل.</i>";
                sendTelegramMessageWebhook($chatId, $reply);
                logChatbotInteraction($chatId, $username, $msgType, $queryText, $reply, $promptTokens, $completionTokens);
            }
        } catch (\Exception $ex) {
            sendTelegramMessageWebhook($chatId, "⚠️ حدث خطأ أثناء معالجة الطلب في قاعدة البيانات.");
        }
    }
    
    return $response;
});

$app->run();
