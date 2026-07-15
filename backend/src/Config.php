<?php

namespace App;

class Config {
    private static $env = null;

    private static function loadEnv() {
        if (self::$env !== null) {
            return;
        }
        self::$env = [];
        $envPath = __DIR__ . '/../.env';
        if (file_exists($envPath)) {
            $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
            foreach ($lines as $line) {
                if (strpos(trim($line), '#') === 0) {
                    continue;
                }
                $parts = explode('=', $line, 2);
                if (count($parts) === 2) {
                    self::$env[trim($parts[0])] = trim($parts[1]);
                }
            }
        }
    }

    public static function getDBConfig(): array {
        self::loadEnv();
        return [
            'host' => self::$env['DB_HOST'] ?? '127.0.0.1',
            'port' => self::$env['DB_PORT'] ?? '3306',
            'dbname' => self::$env['DB_NAME'] ?? 'electoral_db',
            'username' => self::$env['DB_USER'] ?? 'root',
            'password' => self::$env['DB_PASS'] ?? '',
            'charset' => self::$env['DB_CHARSET'] ?? 'utf8mb4'
        ];
    }
}
