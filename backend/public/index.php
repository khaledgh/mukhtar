<?php

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\Factory\AppFactory;
use App\Config;
use App\ArabicNormalizer;
use App\JWTHelper;

require __DIR__ . '/../vendor/autoload.php';

$app = AppFactory::create();

// Dynamically set base path if running via index.php
$requestUri = $_SERVER['REQUEST_URI'] ?? '';
if (strpos($requestUri, '/index.php') === 0) {
    $app->setBasePath('/index.php');
}

// Add Error Middleware
$app->addErrorMiddleware(true, true, true);

// CORS Middleware
$app->add(function (Request $request, $handler) {
    $response = $handler->handle($request);
    return $response
        ->withHeader('Access-Control-Allow-Origin', '*')
        ->withHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept, Origin, Authorization')
        ->withHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
});

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

$app->run();
