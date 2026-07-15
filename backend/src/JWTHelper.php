<?php

namespace App;

class JWTHelper {
    private static $secret = 'electoral_voters_app_secret_key_2026_safe';

    public static function generate(array $payload): string {
        $header = json_encode(['alg' => 'HS256', 'typ' => 'JWT']);
        
        $base64UrlHeader = self::base64UrlEncode($header);
        $base64UrlPayload = self::base64UrlEncode(json_encode($payload));
        
        $signature = hash_hmac('sha256', $base64UrlHeader . "." . $base64UrlPayload, self::$secret, true);
        $base64UrlSignature = self::base64UrlEncode($signature);
        
        return $base64UrlHeader . "." . $base64UrlPayload . "." . $base64UrlSignature;
    }

    public static function verify(string $jwt): ?array {
        $tokenParts = explode('.', $jwt);
        if (count($tokenParts) !== 3) {
            return null;
        }

        $header = self::base64UrlDecode($tokenParts[0]);
        $payload = self::base64UrlDecode($tokenParts[1]);
        $signatureProvided = $tokenParts[2];

        // Check expiration
        $payloadArr = json_decode($payload, true);
        if (isset($payloadArr['exp']) && $payloadArr['exp'] < time()) {
            return null; // Expired
        }

        // Recompute signature to verify
        $base64UrlHeader = self::base64UrlEncode($header);
        $base64UrlPayload = self::base64UrlEncode($payload);
        
        $signature = hash_hmac('sha256', $base64UrlHeader . "." . $base64UrlPayload, self::$secret, true);
        $base64UrlSignature = self::base64UrlEncode($signature);

        if (hash_equals($base64UrlSignature, $signatureProvided)) {
            return $payloadArr;
        }

        return null;
    }

    private static function base64UrlEncode(string $text): string {
        return str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($text));
    }

    private static function base64UrlDecode(string $text): string {
        $replace = str_replace(['-', '_'], ['+', '/'], $text);
        return base64_decode($replace . str_repeat('=', (4 - strlen($replace) % 4) % 4));
    }
}
